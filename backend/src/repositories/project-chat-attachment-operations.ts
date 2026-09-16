import { randomUUID } from "node:crypto";
import { ApiError } from "../middleware/errors.js";
import type { ChatAttachmentRecord, ChatAttachmentTransactions } from "./project-chat.js";

/** Every method runs in the owning ChatTransaction, after its authorization fence. */
export interface ChatAttachmentPersistence {
  get(projectId: string, id: string): Promise<ChatAttachmentRecord | null>;
  byKey(projectId: string, uploaderId: string, key: string): Promise<ChatAttachmentRecord | null>;
  many(projectId: string, ids: readonly string[]): Promise<ChatAttachmentRecord[]>;
  active(projectId: string, uploaderId: string, now: string): Promise<ChatAttachmentRecord[]>;
  due(now: string, limit: number): Promise<ChatAttachmentRecord[]>;
  save(record: ChatAttachmentRecord, expectedVersion: number | null): Promise<void>;
}
function conflict(message: string): never { throw new ApiError(409, "CHAT_ATTACHMENT_CONFLICT", message); }
function missing(): never { throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); }
function quota(): never { throw new ApiError(429, "CHAT_ATTACHMENT_QUOTA", "Wait for uploads to finish or remove staged files before retrying.", undefined, {"Retry-After": "5"}); }
const staged = (row: ChatAttachmentRecord) => ["uploading", "ready", "cleanup_pending"].includes(row.status);
export function createChatAttachmentOperations(db: ChatAttachmentPersistence): ChatAttachmentTransactions {
  const put = async (row: ChatAttachmentRecord, previous: ChatAttachmentRecord) => {
    const next = {...row, version: previous.version + 1};
    await db.save(next, previous.version);
    return next;
  };
  return {
    attachments: (projectId, ids) => db.many(projectId, ids),
    uploadByKey: (projectId, uploaderId, key) => db.byKey(projectId, uploaderId, key),
    async reserveAttachment(candidate, limits) {
      const previous = await db.byKey(candidate.projectId, candidate.uploaderId, candidate.clientUploadId);
      if (previous && previous.declaredBytes !== candidate.declaredBytes) conflict("This upload identity was already used for a different file size.");
      const now = candidate.updatedAt;
      if (previous?.transfer && previous.transfer.expiresAt > now) conflict("This upload is already in progress. Wait before retrying.");
      if (previous && (previous.status === "uploading" || previous.status === "cleanup_pending" || (previous.status === "ready" && (!previous.expiresAt || previous.expiresAt <= now)))) conflict("This upload is being cleaned up. Retry shortly.");
      const active = await db.active(candidate.projectId, candidate.uploaderId, now);
      if (active.filter(row => row.transfer && row.transfer.expiresAt > now).length >= limits.maxConcurrentTransfers) quota();
      const reuse = previous && (previous.status === "ready" || previous.status === "attached");
      if (!reuse) {
        const reserved = active.filter(staged);
        if (reserved.length >= limits.maxStagedAttachments || reserved.reduce((sum, row) => sum + row.reservedBytes, 0) + candidate.reservedBytes > limits.maxStagedBytes) quota();
      }
      if (!previous) { await db.save(candidate, null); return candidate; }
      if (reuse) return put({...previous, transfer: {...candidate.transfer!, kind: "replay"}, updatedAt: now}, previous);
      return put({...candidate, id: previous.id, generation: previous.generation + 1,
        createdAt: previous.createdAt, requestFilename: previous.requestFilename, requestMimeType: previous.requestMimeType, sha256: previous.sha256}, previous);
    },
    async finalizeAttachment(input) {
      const row = await db.get(input.projectId, input.id);
      if (!row || row.generation !== input.generation || row.transfer?.token !== input.leaseToken || row.transfer.expiresAt <= input.now) conflict("This upload expired or was cancelled. Retry the file.");
      if (!["uploading", "ready", "attached"].includes(row.status)) conflict("This upload is no longer available.");
      if (input.metadata.byteSize !== row.declaredBytes || (row.sha256 && row.sha256 !== input.sha256) || (row.requestFilename && row.requestFilename !== input.filename) || (row.requestMimeType && row.requestMimeType !== input.claimedMimeType)) conflict("This upload identity was already used for different file contents.");
      const replay = row.transfer.kind === "replay";
      return put({...row, status: replay ? row.status : "ready", metadata: replay ? row.metadata : {...input.metadata, id: row.id},
        requestFilename: input.filename, requestMimeType: input.claimedMimeType, sha256: input.sha256,
        expiresAt: replay ? row.expiresAt : input.expiresAt, cleanupAfter: replay ? row.cleanupAfter : input.expiresAt,
        transfer: null, updatedAt: input.now}, row);
    },
    async finishAttachmentTransfer(input) {
      const row = await db.get(input.projectId, input.id);
      if (row?.generation === input.generation && row.transfer?.token === input.leaseToken) await put({...row, transfer: null, updatedAt: input.now}, row);
    },
    async associateAttachments(input) {
      if (input.ids.length > input.maxCount || new Set(input.ids).size !== input.ids.length) throw new ApiError(400, "CHAT_ATTACHMENT_LIMIT", "Choose unique attachments within the message limit.");
      const rows = await db.many(input.projectId, input.ids);
      const ordered = input.ids.map(id => rows.find(row => row.id === id));
      if (ordered.some(row => !row || row.uploaderId !== input.uploaderId)) missing();
      const present = ordered as ChatAttachmentRecord[];
      if (present.some(row => row.status !== "ready" || !row.expiresAt || row.expiresAt <= input.now || !row.metadata || row.transfer)) conflict("An attachment is expired, unavailable, or still transferring. Retry the file.");
      if (present.reduce((sum, row) => sum + row.metadata!.byteSize, 0) > input.maxBytes) throw new ApiError(400, "CHAT_ATTACHMENT_LIMIT", "The combined attachments exceed the message size limit.");
      for (const [position, row] of present.entries()) await put({...row, status: "attached", messageId: input.messageId, messagePosition: position, cleanupAfter: null, cleanup: null, updatedAt: input.now}, row);
      return present.map(row => structuredClone(row.metadata!));
    },
    async requestAttachmentCleanup(input) {
      const row = await db.get(input.projectId, input.id);
      if (!row || row.uploaderId !== input.uploaderId) { if (input.lease) return null; missing(); }
      if (input.lease && (row.generation !== input.lease.generation || row.transfer?.token !== input.lease.token)) return null;
      if (row.status === "attached") { if (input.lease) return null; conflict("A sent attachment cannot be discarded."); }
      if (row.status === "deleted") return row;
      if (row.status === "cleanup_pending" && !input.lease) return row;
      return put({...row, status: "cleanup_pending", cleanupAfter: input.now, cleanup: null,
        transfer: input.lease ? null : row.transfer, updatedAt: input.now}, row);
    },
    async claimAttachmentCleanup(input) {
      const candidates = await db.due(input.now, input.limit);
      const claimed: ChatAttachmentRecord[] = [];
      for (const row of candidates) {
        if (!staged(row) || !row.cleanupAfter || row.cleanupAfter > input.now || (row.cleanup && row.cleanup.expiresAt > input.now)) continue;
        claimed.push(await put({...row, status: "cleanup_pending", updatedAt: input.now,
          cleanup: {token: randomUUID(), workerId: input.workerId, expiresAt: input.leaseUntil,
            attempts: (row.cleanup?.attempts ?? 0) + 1, lastErrorCode: row.cleanup?.lastErrorCode ?? null}}, row));
      }
      return claimed;
    },
    async settleAttachmentCleanup(input) {
      const row = await db.get(input.projectId, input.id);
      // A sender may acknowledge its stopped transfer while this same cleanup lease is deleting bytes.
      if (!row || row.status !== "cleanup_pending" || row.generation !== input.generation || row.version < input.expectedVersion || row.cleanup?.token !== input.leaseToken) return false;
      await put({...row, status: input.outcome === "deleted" ? "deleted" : "cleanup_pending",
        cleanupAfter: input.outcome === "deleted" ? null : input.nextAttemptAt!,
        cleanup: {...row.cleanup, expiresAt: input.now, lastErrorCode: input.errorCode ?? null}, updatedAt: input.now}, row);
      return true;
    }
  };
}
