import Busboy from "busboy";
import type { Readable } from "node:stream";
import type { Request, RequestHandler } from "express";
import { ESTIMATE_CLIENT_PROOF_MIME_TYPES } from "../domain/estimate-client-review.js";
import { inspectChatAttachment, sanitizeChatFilename } from "../domain/project-chat-attachment-validation.js";
import type { SaveFileInput } from "../storage/storage.js";
import { createTemporaryUploadStorage, type TemporaryUploadStorage } from "../storage/temporary-upload-storage.js";
import { ApiError } from "./errors.js";
import { validateUploadedFile, type ValidatedUpload } from "./upload.js";

const FIELDS = new Set(["expectedVersion", "action", "stageId", "idempotencyKey", "note", "data"]);
const extensions: Record<string, SaveFileInput["extension"]> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  "image/heic": ".heic", "image/heif": ".heic", "image/tiff": ".tif",
  "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm"
};
export interface ValidatedWorkflowMedia {
  open(): Promise<Readable>;
  extension: SaveFileInput["extension"];
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  kind: "image" | "video";
}
export interface WorkflowEvidenceLifetime {
  signal: AbortSignal;
  /** Prevent response-close cleanup from racing a permanent import. */
  hold(): () => void;
  cleanup(): Promise<void>;
}
declare global {
  namespace Express { interface Request {
    validatedWorkflowMedia?: ValidatedWorkflowMedia[];
    workflowEvidence?: WorkflowEvidenceLifetime;
  } }
}
const invalid = () => new ApiError(400, "INVALID_WORKFLOW_EVIDENCE", "Upload photos or videos in mediaFiles and one optional supporting document in file.");
const cancelled = () => new ApiError(408, "WORKFLOW_UPLOAD_CANCELLED", "The evidence upload was cancelled or inactive for too long.");

async function readProof(storage: TemporaryUploadStorage, reference: string, sizeBytes: number, signal: AbortSignal) {
  // Only the existing size-bounded sketch/document validator needs complete bytes.
  const bytes = Buffer.alloc(sizeBytes); let received = 0;
  const stream = await storage.open(reference, { signal });
  try {
    for await (const chunk of stream) {
      signal.throwIfAborted();
      if (received + chunk.length > sizeBytes) throw invalid();
      bytes.set(chunk, received); received += chunk.length;
    }
  } finally { stream.destroy(); }
  if (received !== sizeBytes) throw invalid();
  return bytes;
}

async function consumeEvidence(request: Request, maxProofBytes: number, storage: TemporaryUploadStorage, signal: AbortSignal, touch: () => void) {
  let parser: ReturnType<typeof Busboy>;
  try {
    // A tiny file-stream watermark pauses Busboy at the next queued part. Each
    // file is persisted and inspected before that next stream starts draining.
    parser = Busboy({ headers: request.headers, fileHwm: 1, limits: { fields: 6, fieldSize: 16 * 1024, fieldNameSize: 64, headerPairs: 32 } });
  } catch { throw invalid(); }
  const fields: Record<string, string> = Object.create(null);
  const media: ValidatedWorkflowMedia[] = [];
  let proof: ValidatedUpload | undefined;
  let seenProof = false;
  let failed = false;
  let transfer = Promise.resolve();
  let fail!: (error: unknown) => void;
  const abort = () => fail(signal.reason ?? cancelled());
  const incoming = () => touch();
  try {
    await new Promise<void>((resolve, reject) => {
      fail = error => {
        if (failed) return;
        failed = true;
        request.unpipe(parser); parser.destroy(); request.pause();
        if (request.res && !request.res.headersSent && !request.res.destroyed) request.res.setHeader("Connection", "close");
        request.res?.once("finish", () => request.destroy());
        reject(error);
      };
      parser.on("field", (name, value, info) => {
        touch();
        if (!FIELDS.has(name) || Object.hasOwn(fields, name) || info.nameTruncated || info.valueTruncated) { fail(invalid()); return; }
        fields[name] = value;
      });
      parser.on("file", (field, source, info) => {
        // The parser reports malformed multipart errors; the transfer promise
        // reports storage failures. Keep queued streams safe before piping.
        source.once("error", () => {});
        if (failed) { source.resume(); return; }
        if (!info.filename || field !== "file" && field !== "mediaFiles" || field === "file" && seenProof) { source.resume(); fail(invalid()); return; }
        if (field === "file") seenProof = true;
        transfer = transfer.then(async () => {
          signal.throwIfAborted(); if (failed) { source.destroy(); return; }
          const staged = await storage.write(source, { signal, ...(field === "file" ? { maxBytes: maxProofBytes } : {}) });
          touch();
          if (!staged.sizeBytes) throw new ApiError(400, "INVALID_WORKFLOW_EVIDENCE", "Empty evidence files are not supported.");
          if (field === "file") {
            const bytes = await readProof(storage, staged.reference, staged.sizeBytes, signal);
            proof = await validateUploadedFile({ buffer: bytes, originalname: info.filename, mimetype: info.mimeType, size: staged.sizeBytes }, { allowedDetectedMimeTypes: new Set(ESTIMATE_CLIENT_PROOF_MIME_TYPES) });
            return;
          }
          try {
            const decoded = Buffer.from(info.filename, "latin1").toString("utf8");
            const filename = sanitizeChatFilename(decoded.includes("\uFFFD") ? info.filename : decoded);
            const inspected = await inspectChatAttachment(storage, staged.reference, {
              id: "inspection", filename, claimedMimeType: info.mimeType === "text/plain" ? "application/octet-stream" : info.mimeType,
              byteSize: staged.sizeBytes, signal, allowedKinds: ["image", "video"]
            });
            const extension = extensions[inspected.mimeType];
            if (!extension || inspected.kind !== "image" && inspected.kind !== "video") throw invalid();
            media.push({ open: () => storage.open(staged.reference, { signal }), extension, originalFilename: filename, mimeType: inspected.mimeType, sizeBytes: staged.sizeBytes, sha256: staged.sha256, kind: inspected.kind });
          } catch (error) {
            signal.throwIfAborted();
            if (error instanceof ApiError) throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "Choose a valid photo or MP4, MOV or WebM video whose filename and type match its contents.");
            throw error;
          }
          touch();
        });
        void transfer.catch(error => fail((error as { code?: string })?.code === "FILE_SIZE_LIMIT" ? new ApiError(413, "FILE_TOO_LARGE", "The supporting document exceeds the configured upload size limit.") : error));
      });
      parser.on("fieldsLimit", () => fail(invalid()));
      parser.once("error", error => fail(error instanceof ApiError ? error : invalid()));
      parser.once("finish", resolve);
      request.once("error", fail);
      request.on("data", incoming);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted || request.aborted) abort(); else request.pipe(parser);
    });
    await transfer;
    signal.throwIfAborted();
    return { fields, media, proof };
  } finally {
    request.removeListener("error", fail); request.removeListener("data", incoming);
    signal.removeEventListener("abort", abort);
    request.unpipe(parser); parser.destroy();
    // An in-flight filesystem write must finish unwinding before temp cleanup.
    await transfer.catch(() => {});
  }
}

export function uploadWorkflowEvidence(maxProofBytes: number, options: { createStorage?: () => Promise<TemporaryUploadStorage>; inactivityMs?: number } = {}): RequestHandler {
  return async (request, response, next) => {
    if (!request.is("multipart/form-data")) { next(); return; }
    const controller = new AbortController();
    const abort = () => controller.abort(cancelled());
    let timeout: NodeJS.Timeout | undefined;
    const touch = () => { clearTimeout(timeout); timeout = setTimeout(abort, options.inactivityMs ?? 120_000); timeout.unref(); };
    const active = new Set<Promise<void>>();
    let storage: TemporaryUploadStorage | undefined;
    let cleaned: Promise<void> | undefined;
    const lifetime: WorkflowEvidenceLifetime = {
      signal: controller.signal,
      hold() {
        let release!: () => void;
        const held = new Promise<void>(resolve => { release = resolve; }); active.add(held);
        return () => { active.delete(held); release(); };
      },
      cleanup() { return cleaned ??= (async () => {
        await Promise.allSettled([...active]);
        clearTimeout(timeout);
        request.removeListener("aborted", abort); response.removeListener("close", closed); response.removeListener("finish", finished);
        await storage?.cleanup();
      })(); }
    };
    const closed = () => { if (!response.writableFinished) abort(); void lifetime.cleanup().catch(() => {}); };
    const finished = () => { void lifetime.cleanup().catch(() => {}); };
    request.workflowEvidence = lifetime;
    request.once("aborted", abort); response.once("close", closed); response.once("finish", finished);
    const release = lifetime.hold();
    touch();
    try {
      storage = await (options.createStorage ?? createTemporaryUploadStorage)();
      controller.signal.throwIfAborted();
      const { fields, proof, media } = await consumeEvidence(request, maxProofBytes, storage, controller.signal, touch);
      // Stop the network inactivity clock after the complete request arrives.
      clearTimeout(timeout);
      request.body = fields; request.validatedUpload = proof; request.validatedWorkflowMedia = media;
      next();
    } catch (error) {
      release(); await lifetime.cleanup();
      next((error as { code?: string })?.code === "FILE_SIZE_LIMIT" ? new ApiError(413, "FILE_TOO_LARGE", "The supporting document exceeds the configured upload size limit.") : error);
    } finally { release(); }
  };
}
