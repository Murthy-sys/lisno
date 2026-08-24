import {
  ESTIMATE_CLIENT_PROOF_MIME_TYPES,
  sha256Hex,
  type EstimateClientProofMimeType,
  type StoredEstimateClientResponseProof
} from "../domain/estimate-client-review.js";
import type { ValidatedUpload } from "../middleware/upload.js";
import type { FileStorage } from "../storage/storage.js";

export interface StoredEstimatePdfSnapshot {
  storageReference: string;
  filename: string;
  mimeType: "application/pdf";
  byteSize: number;
  sha256: string;
}

export interface EstimateClientReviewStorage {
  savePdfSnapshot(input: {
    bytes: Buffer;
    filename: string;
  }): Promise<StoredEstimatePdfSnapshot>;
  saveProof(upload: ValidatedUpload): Promise<StoredEstimateClientResponseProof>;
  read(reference: string): Promise<Buffer>;
  deleteQuietly(reference: string): Promise<void>;
}

/**
 * Keeps opaque storage references inside the review workflow. Route handlers
 * use `read` only after their authorization checks and return bytes/metadata,
 * never this service's reference-bearing records.
 */
export function createEstimateClientReviewStorage(
  storage: FileStorage
): EstimateClientReviewStorage {
  return {
    async savePdfSnapshot({ bytes, filename }) {
      const saved = await storage.saveGenerated({ data: bytes, extension: ".pdf" });
      return {
        storageReference: saved.reference,
        filename,
        mimeType: "application/pdf",
        byteSize: bytes.byteLength,
        sha256: sha256Hex(bytes)
      };
    },

    async saveProof(upload) {
      if (!isEstimateClientProofMimeType(upload.mimeType)) {
        throw new Error("Unsupported estimate client response proof MIME type.");
      }
      const saved = await storage.save({ data: upload.data, extension: upload.extension });
      return {
        storageReference: saved.reference,
        originalFilename: upload.originalFilename,
        mimeType: upload.mimeType,
        byteSize: upload.data.byteLength,
        sha256: sha256Hex(upload.data)
      };
    },

    read(reference) {
      return storage.read(reference);
    },

    async deleteQuietly(reference) {
      try {
        await storage.delete(reference);
      } catch {
        // Cleanup is best effort; references can already have been deleted.
      }
    }
  };
}

function isEstimateClientProofMimeType(
  mimeType: ValidatedUpload["mimeType"]
): mimeType is EstimateClientProofMimeType {
  return (ESTIMATE_CLIENT_PROOF_MIME_TYPES as readonly string[]).includes(mimeType);
}
