import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { StoredWorkflowMedia } from "../domain/design-workflow-state.js";
import type { ValidatedWorkflowMedia } from "../middleware/workflow-evidence-upload.js";
import { ApiError } from "../middleware/errors.js";
import type { FileStorage } from "../storage/storage.js";
import { createEstimateClientReviewStorage, type EstimateClientReviewStorage } from "./estimate-client-review-storage.js";

export interface WorkflowEvidenceStorage extends EstimateClientReviewStorage {
  saveMedia(upload: ValidatedWorkflowMedia, signal?: AbortSignal): Promise<StoredWorkflowMedia>;
  openVerifiedMedia(media: StoredWorkflowMedia, signal?: AbortSignal): Promise<Readable>;
}
export function createWorkflowEvidenceStorage(storage: FileStorage): WorkflowEvidenceStorage {
  return {
    ...createEstimateClientReviewStorage(storage),
    async saveMedia(upload, signal) {
      if (!storage.importStream) throw new ApiError(503, "WORKFLOW_STREAMING_STORAGE_UNAVAILABLE", "Photo and video storage is not available. Contact your administrator.");
      signal?.throwIfAborted();
      const id = `workflow-media-${randomUUID()}`;
      const source = await upload.open();
      source.once("error", () => {});
      const saved = await storage.importStream({ source, extension: upload.extension, expectedBytes: upload.sizeBytes, sha256: upload.sha256, signal });
      return { id, storageReference: saved.reference, originalFilename: upload.originalFilename, mimeType: upload.mimeType, byteSize: upload.sizeBytes, sha256: upload.sha256, kind: upload.kind };
    },
    async openVerifiedMedia(media, signal) {
      signal?.throwIfAborted();
      const hash = createHash("sha256"); let bytes = 0;
      const source = await storage.open(media.storageReference);
      const abort = () => source.destroy(signal?.reason instanceof Error ? signal.reason : new Error("Download cancelled."));
      signal?.addEventListener("abort", abort, { once: true });
      try {
        if (signal?.aborted) abort();
        for await (const chunk of source) {
          signal?.throwIfAborted(); bytes += chunk.length;
          if (!Number.isSafeInteger(bytes) || bytes > media.byteSize) throw new ApiError(409, "WORKFLOW_MEDIA_CHANGED", "The stored file does not match its recorded evidence.");
          hash.update(chunk);
        }
        if (bytes !== media.byteSize || hash.digest("hex") !== media.sha256) throw new ApiError(409, "WORKFLOW_MEDIA_CHANGED", "The stored file does not match its recorded evidence.");
      } finally { signal?.removeEventListener("abort", abort); source.destroy(); }
      signal?.throwIfAborted();
      // The opaque storage object is immutable. Verify before sending headers,
      // then stream a second pass rather than retaining the bytes in memory.
      const download = await storage.open(media.storageReference);
      if (signal?.aborted) { download.destroy(); signal.throwIfAborted(); }
      return download;
    }
  };
}
