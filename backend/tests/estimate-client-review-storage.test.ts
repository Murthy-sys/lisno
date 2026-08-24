import { describe, expect, it, vi } from "vitest";

import { sha256Hex } from "../src/domain/estimate-client-review.js";
import type { ValidatedUpload } from "../src/middleware/upload.js";
import { createEstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";

function storageDouble() {
  const objects = new Map<string, Buffer>();
  let sequence = 0;
  const save = vi.fn(async (input: { data: Buffer; extension: string }) => {
    sequence += 1;
    const reference = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}${input.extension}`;
    objects.set(reference, Buffer.from(input.data));
    return { reference };
  });
  return {
    save,
    saveGenerated: vi.fn(save),
    read: vi.fn(async (reference: string) => {
      const value = objects.get(reference);
      if (!value) throw new Error("missing stored object");
      return Buffer.from(value);
    }),
    delete: vi.fn(async (reference: string) => {
      if (!objects.delete(reference)) {
        const error = new Error("missing stored object") as Error & { code: string };
        error.code = "ENOENT";
        throw error;
      }
    }),
    open: vi.fn()
  };
}

describe("estimate client review storage", () => {
  it("stores generated PDF snapshots with byte and SHA-256 metadata", async () => {
    const storage = storageDouble();
    const reviewStorage = createEstimateClientReviewStorage(storage);
    const pdfBytes = Buffer.from("%PDF-1.7\nsnapshot");

    const saved = await reviewStorage.savePdfSnapshot({
      bytes: pdfBytes,
      filename: "lisno-estimate-v2.pdf"
    });

    expect(saved).toMatchObject({
      filename: "lisno-estimate-v2.pdf",
      mimeType: "application/pdf",
      byteSize: pdfBytes.length,
      sha256: sha256Hex(pdfBytes)
    });
    expect(storage.saveGenerated).toHaveBeenCalledWith({
      data: pdfBytes,
      extension: ".pdf"
    });
  });

  it("preserves validated proof MIME and extension while retaining only safe metadata", async () => {
    const storage = storageDouble();
    const reviewStorage = createEstimateClientReviewStorage(storage);
    const upload: ValidatedUpload = {
      data: Buffer.from([0xff, 0xd8, 0xff]),
      extension: ".jpg",
      originalFilename: "client-response.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 999
    };

    const saved = await reviewStorage.saveProof(upload);

    expect(saved).toMatchObject({
      originalFilename: "client-response.jpg",
      mimeType: "image/jpeg",
      byteSize: 3,
      sha256: sha256Hex(upload.data)
    });
    expect(storage.save).toHaveBeenCalledWith({ data: upload.data, extension: ".jpg" });
  });

  it("returns bytes only when its caller supplies an authorized storage reference", async () => {
    const storage = storageDouble();
    const reviewStorage = createEstimateClientReviewStorage(storage);
    const saved = await reviewStorage.savePdfSnapshot({
      bytes: Buffer.from("%PDF-1.7\nprotected"),
      filename: "protected.pdf"
    });

    await expect(reviewStorage.read(saved.storageReference)).resolves.toEqual(
      Buffer.from("%PDF-1.7\nprotected")
    );
  });

  it("cleans up a reference idempotently when persistence fails after storage", async () => {
    const storage = storageDouble();
    const reviewStorage = createEstimateClientReviewStorage(storage);
    const saved = await reviewStorage.savePdfSnapshot({
      bytes: Buffer.from("%PDF-1.7\ncleanup"),
      filename: "cleanup.pdf"
    });

    await reviewStorage.deleteQuietly(saved.storageReference);
    await reviewStorage.deleteQuietly(saved.storageReference);

    expect(storage.delete).toHaveBeenCalledTimes(2);
  });
});
