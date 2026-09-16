import { createHash, randomUUID } from "node:crypto";
import type { ChatActor, ChatAttachmentPolicy } from "../contracts/project-chat.js";
import type { ChatUploadReservation, ProjectChatAttachmentService } from "../contracts/project-chat-attachments.js";
import { createProjectChatAttachmentPolicy } from "../domain/project-chat-attachment-policy.js";
import { hasPermission } from "../domain/authorization.js";
import { inspectChatAttachment, sanitizeChatFilename } from "../domain/project-chat-attachment-validation.js";
import { chatNotFound } from "../domain/project-chat.js";
import { ApiError } from "../middleware/errors.js";
import type { ChatAttachmentRecord, ChatTransaction, ProjectChatRepository } from "../repositories/project-chat.js";
import type { AppRepository } from "../repositories/types.js";
import type { ManagedFileStorage } from "../storage/managed-storage.js";
import type { AuditService, AuditWrite } from "./audit.service.js";
import { projectChatContext } from "./project-chat-context.js";
import { systemClock, type Clock } from "./workflow.js";

export interface ProjectChatAttachmentServiceOptions {
  repository: AppRepository;
  chatRepository: ProjectChatRepository;
  audit: AuditService;
  storage?: ManagedFileStorage;
  policy?: ChatAttachmentPolicy;
  clock?: Clock;
  uploadTimeoutMs?: number;
}
const unavailable = (): never => { throw new ApiError(503, "CHAT_ATTACHMENTS_UNAVAILABLE", "Attachments are temporarily unavailable. You can still send text."); };
const invalid = (message: string): never => { throw new ApiError(400, "CHAT_ATTACHMENT_INVALID", message); };
export function createProjectChatAttachmentService(options: ProjectChatAttachmentServiceOptions): ProjectChatAttachmentService {
  const store = options.chatRepository;
  const clock = options.clock ?? systemClock;
  const policy = options.policy ?? createProjectChatAttachmentPolicy();
  const timeoutMs = options.uploadTimeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15 * 60_000) throw new Error("Invalid chat upload deadline.");
  const now = () => clock().toISOString();
  const storage = () => options.storage ?? unavailable();
  const lease = (row: ChatAttachmentRecord) => ({id: row.id, projectId: row.projectId, generation: row.generation, leaseToken: row.transfer!.token});
  const audit = async (tx: ChatTransaction, row: ChatAttachmentRecord, action: AuditWrite["action"]) => {
    const input: AuditWrite = {actorId: row.uploaderId, action, entityType: "project_chat_attachment", entityId: row.id,
      occurredAt: now(), newValues: {projectId: row.projectId, byteSize: row.declaredBytes, generation: row.generation, status: row.status}};
    if (tx.session) await options.audit.appendInMongoTransaction(input, tx.session);
    else await options.audit.append(input, tx.app);
  };
  async function abandonUpload(reservation: ChatUploadReservation) {
    const row = reservation.record;
    if (!row.transfer) return;
    await store.mutate(async tx => {
      if (row.transfer!.kind === "upload") await tx.requestAttachmentCleanup({projectId: row.projectId, uploaderId: row.uploaderId, id: row.id, now: now(), lease: {generation: row.generation, token: row.transfer!.token}});
      await tx.finishAttachmentTransfer({...lease(row), now: now()});
    });
  }
  async function cleanup(input: {limit?: number} = {}) {
    if (!options.storage) return {claimed: 0, deleted: 0, failed: 0};
    const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 10)));
    const rows = await store.mutate(tx => tx.claimAttachmentCleanup({now: now(), leaseUntil: new Date(clock().getTime() + 60_000).toISOString(), limit, workerId: `chat-cleanup-${randomUUID()}`}));
    let deleted = 0, failed = 0;
    for (const row of rows) {
      let errorCode: string | undefined;
      try { await storage().remove(row.originalReference); await storage().remove(row.previewReference); }
      catch { errorCode = "STORAGE_DELETE_FAILED"; }
      const settled = await store.mutate(async tx => {
        const accepted = await tx.settleAttachmentCleanup({projectId: row.projectId, id: row.id, generation: row.generation,
          leaseToken: row.cleanup!.token, expectedVersion: row.version, now: now(), outcome: errorCode ? "retry" : "deleted", errorCode,
          nextAttemptAt: new Date(clock().getTime() + Math.min(60 * 60_000, 1000 * 2 ** Math.min(row.cleanup!.attempts, 12))).toISOString()});
        if (accepted) await audit(tx, {...row, status: errorCode ? "cleanup_pending" : "deleted"}, errorCode ? "project_chat.attachment_cleanup_failed" : "project_chat.attachment_deleted");
        return accepted;
      });
      if (settled) { if (errorCode) failed++; else deleted++; }
    }
    return {claimed: rows.length, deleted, failed};
  }
  return {
    async policy(actor, projectId) {
      const context = await store.snapshot(tx => projectChatContext(tx, actor, projectId, clock));
      const enabled = policy.enabled && Boolean(options.storage);
      const canUpload = enabled && hasPermission(context.user.role, "chat.send");
      return {...structuredClone(policy), enabled, capabilities: {canUpload, canRecord: canUpload}};
    },
    async beginUpload(actor, projectId, input) {
      if (!/^[A-Za-z0-9_-]{8,200}$/.test(input.uploadId) || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) invalid("Choose a valid upload identity and file size.");
      return store.mutate(async tx => {
        await projectChatContext(tx, actor, projectId, clock, "chat.send");
        if (!policy.enabled || !options.storage) unavailable();
        if (input.sizeBytes > policy.limits.maxFileBytes) throw new ApiError(413, "CHAT_ATTACHMENT_LIMIT", "The file exceeds the attachment size limit.");
        const at = now();
        const expires = new Date(clock().getTime() + timeoutMs).toISOString();
        const record = await tx.reserveAttachment({id: `chat-attachment-${randomUUID()}`, projectId, uploaderId: actor.id, clientUploadId: input.uploadId,
          declaredBytes: input.sizeBytes, reservedBytes: input.sizeBytes, generation: 1, version: 1, status: "uploading",
          originalReference: storage().allocateTarget(), previewReference: storage().allocateTarget(), metadata: null, sha256: null,
          requestFilename: null, requestMimeType: null, transfer: {token: randomUUID(), expiresAt: expires, kind: "upload"},
          expiresAt: null, messageId: null, messagePosition: null, cleanupAfter: expires, cleanup: null, createdAt: at, updatedAt: at}, policy.limits);
        await audit(tx, record, "project_chat.attachment_reserved");
        return {record, timeoutMs};
      });
    },
    async receiveUpload(actor, reservation, file) {
      const row = reservation.record;
      if (actor.id !== row.uploaderId) chatNotFound();
      const controller = new AbortController();
      const abort = () => { controller.abort(file.signal?.reason); file.source.destroy(new Error("Attachment transfer cancelled.")); };
      const timer = setTimeout(abort, timeoutMs);
      file.signal?.addEventListener("abort", abort, {once: true});
      if (file.signal?.aborted) abort();
      // A rejected multipart body must be observed even while storage is still consuming its stream.
      file.multipartComplete?.catch(() => controller.abort());
      try {
        const filename = sanitizeChatFilename(file.filename);
        const claimedMimeType = file.mimeType.split(";", 1)[0]!.trim().toLowerCase() || "application/octet-stream";
        let sha256: string;
        let metadata;
        if (row.transfer?.kind === "replay") {
          const hash = createHash("sha256"); let bytes = 0;
          for await (const part of file.source) {
            controller.signal.throwIfAborted();
            bytes += Buffer.byteLength(part);
            if (bytes > row.declaredBytes) invalid("The file size differs from its reserved size.");
            hash.update(part);
          }
          if (bytes !== row.declaredBytes) invalid("The file size differs from its reserved size.");
          sha256 = hash.digest("hex");
          metadata = row.metadata!;
        } else {
          const saved = await storage().write(row.originalReference, file.source, {expectedBytes: row.declaredBytes, maxBytes: policy.limits.maxFileBytes, timeoutMs, signal: controller.signal});
          sha256 = saved.sha256;
          metadata = await inspectChatAttachment(storage(), row.originalReference, {id: row.id, filename, claimedMimeType, byteSize: saved.sizeBytes, signal: controller.signal});
          if (metadata.kind === "image") metadata.preview = await storage().createImagePreview(row.originalReference, row.previewReference, {signal: controller.signal});
        }
        await file.multipartComplete;
        controller.signal.throwIfAborted();
        const ready = await store.mutate(async tx => {
          await projectChatContext(tx, actor, row.projectId, clock, "chat.send");
          const result = await tx.finalizeAttachment({...lease(row), now: now(), expiresAt: new Date(clock().getTime() + policy.limits.stagedTtlSeconds * 1000).toISOString(), sha256, filename, claimedMimeType, metadata});
          await audit(tx, result, "project_chat.attachment_ready");
          return result;
        });
        return {clientUploadId: ready.clientUploadId, attachment: ready.metadata!, expiresAt: ready.expiresAt!};
      } catch (error) {
        await abandonUpload(reservation);
        await cleanup({limit: 10}).catch(() => {});
        if (error instanceof ApiError) throw error;
        if (controller.signal.aborted) throw new ApiError(408, "CHAT_ATTACHMENT_CANCELLED", "The upload was cancelled or timed out. Retry the file.");
        throw new ApiError(400, "CHAT_ATTACHMENT_INVALID", "The file could not be read safely. Choose a supported file and retry.");
      } finally {
        clearTimeout(timer); file.signal?.removeEventListener("abort", abort);
      }
    },
    abandonUpload,
    async discard(actor, projectId, attachmentId) {
      await store.mutate(async tx => {
        await projectChatContext(tx, actor, projectId, clock, "chat.send");
        const [previous] = await tx.attachments(projectId, [attachmentId]);
        const row = await tx.requestAttachmentCleanup({projectId, uploaderId: actor.id, id: attachmentId, now: now()});
        if (row && previous && !["deleted", "cleanup_pending"].includes(previous.status)) await audit(tx, row, "project_chat.attachment_discarded");
      });
      await cleanup({limit: 10});
    },
    async download(actor, projectId, attachmentId, variant, signal) {
      const row = await store.snapshot(async tx => {
        await projectChatContext(tx, actor, projectId, clock);
        const [value] = await tx.attachments(projectId, [attachmentId]);
        if (!value || !value.metadata) chatNotFound();
        if (value.status === "attached") {
          const message = value.messageId ? await tx.message(projectId, value.messageId) : null;
          if (!message?.attachments?.some(attachment => attachment.id === value.id)) chatNotFound();
        } else if (value.status !== "ready" || value.uploaderId !== actor.id || !value.expiresAt || value.expiresAt <= now()) chatNotFound();
        if (variant === "preview" && !value.metadata.preview) chatNotFound();
        return value;
      });
      let stream;
      const preview = variant === "preview";
      try {
        const reference = preview ? row.previewReference : row.originalReference;
        const expectedBytes = preview ? row.metadata!.preview!.byteSize : row.metadata!.byteSize;
        if ((await storage().stat(reference)).sizeBytes !== expectedBytes) throw new Error("Attachment content unavailable");
        stream = await storage().open(reference, {signal});
      }
      catch { throw new ApiError(503, "CHAT_ATTACHMENT_CONTENT_UNAVAILABLE", "The attachment is temporarily unavailable. Retry the download."); }
      try {
        // Recheck after opening storage; transfer itself takes place outside the transaction.
        await store.mutate(async tx => {
          await projectChatContext(tx, actor, projectId, clock);
          const [current] = await tx.attachments(projectId, [attachmentId]);
          if (!current || current.generation !== row.generation || !["ready", "attached"].includes(current.status)) chatNotFound();
          if (current.status === "ready" && (current.uploaderId !== actor.id || !current.expiresAt || current.expiresAt <= now())) chatNotFound();
        });
      } catch (error) { stream.destroy(); throw error; }
      return {filename: preview ? `${row.metadata!.filename}.preview.webp` : row.metadata!.filename,
        mimeType: preview ? row.metadata!.preview!.mimeType : row.metadata!.mimeType,
        byteSize: preview ? row.metadata!.preview!.byteSize : row.metadata!.byteSize, stream};
    },
    cleanup
  };
}
