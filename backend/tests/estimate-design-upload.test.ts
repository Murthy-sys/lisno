import { Readable } from "node:stream";

import jwt from "jsonwebtoken";
import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

const SECRET = "estimate-design-upload-test-secret-at-least-32-characters";
const auth = { jwtSecret: SECRET, jwtExpiresInSeconds: 900 };
const now = () => new Date("2026-07-30T12:00:00.000Z");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50
]);
const TIFF_LE = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
const HEIC = Buffer.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63,
  0x00, 0x00, 0x00, 0x00,
  0x68, 0x65, 0x69, 0x63,
  0x6d, 0x69, 0x66, 0x31
]);

let PDF: Buffer;

class TestStorage {
  private sequence = 0;
  readonly objects = new Map<string, Buffer>();
  readonly deleted: string[] = [];

  async save(input: { data: Buffer; extension: string }) {
    this.sequence += 1;
    const reference = `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async saveGenerated(input: { data: Buffer; extension: string }) {
    return this.save(input);
  }

  async delete(reference: string) {
    this.deleted.push(reference);
    this.objects.delete(reference);
  }

  async open(reference: string) {
    const data = this.objects.get(reference);
    if (!data) throw new Error("stored object missing");
    return Readable.from(data);
  }

  async read(reference: string) {
    const data = this.objects.get(reference);
    if (!data) throw new Error("stored object missing");
    return Buffer.from(data);
  }
}

function bearer() {
  return `Bearer ${jwt.sign({ id: "user-estimator-sales", role: "estimator_sales" }, SECRET, { expiresIn: 900 })}`;
}

function lean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function setup(options: { maxUploadBytes?: number } = {}) {
  const storage = new TestStorage();
  const uploads: Array<Record<string, unknown>> = [];
  const jobs: Array<Record<string, unknown>> = [];
  const estimate = {
    _id: "estimate-draft",
    leadId: "lead-aurora",
    ownerId: "user-estimator-sales",
    status: "draft"
  };

  vi.spyOn(EstimateModel, "findOne").mockImplementation((query) => {
    const value = query._id === "estimate-draft" ? estimate : null;
    return lean(value) as never;
  });
  vi.spyOn(LeadModel, "findOne").mockReturnValue(lean({
    _id: "lead-aurora",
    ownerId: "user-estimator-sales"
  }) as never);
  vi.spyOn(EstimateDesignUploadModel, "create").mockImplementation(async (input) => {
    uploads.push(input as Record<string, unknown>);
    return input as never;
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "create").mockImplementation(async (input) => {
    jobs.push(input as Record<string, unknown>);
    return input as never;
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "countDocuments").mockImplementation(async (query) =>
    jobs.filter((job) => job.uploadId === query.uploadId && job.status === query.status).length
  );

  return {
    app: createApp({
      repository: createMemoryRepository(structuredClone(demoSeedData)),
      auth,
      clock: now,
      storage,
      maxUploadBytes: options.maxUploadBytes
    }),
    storage,
    uploads,
    jobs,
    setEstimate(value: Record<string, unknown> | null) {
      vi.mocked(EstimateModel.findOne).mockReturnValue(lean(value) as never);
    }
  };
}

function upload(
  app: ReturnType<typeof createApp>,
  data: Buffer,
  filename: string,
  contentType: string
) {
  return request(app)
    .post("/api/v1/estimates/estimate-draft/design-uploads")
    .set("Authorization", bearer())
    .attach("file", data, { filename, contentType });
}

beforeAll(async () => {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  PDF = Buffer.from(await document.save({ useObjectStreams: false }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("estimate design uploads", () => {
  it.each([
    ["PDF", () => PDF, "plan.pdf", "application/pdf"],
    ["PNG", () => PNG, "plan.png", "image/png"],
    ["JPEG", () => JPEG, "plan.jpg", "image/jpeg"],
    ["WebP", () => WEBP, "plan.webp", "image/webp"],
    ["TIFF", () => TIFF_LE, "plan.tif", "image/tiff"],
    ["HEIC", () => HEIC, "plan.heic", "image/heic"]
  ])("stores a valid %s signature and queues extraction", async (_kind, data, filename, contentType) => {
    const { app } = setup();

    const response = await upload(app, data(), filename, contentType);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      estimateId: "estimate-draft",
      extractionStatus: "queued"
    });
    expect(await EstimateDesignExtractionJobModel.countDocuments({
      uploadId: response.body.data.id,
      status: "queued"
    })).toBe(1);
  });

  it("returns the same non-leaking not-found response for foreign estimates", async () => {
    const { app } = setup();

    const response = await request(app)
      .post("/api/v1/estimates/foreign/design-uploads")
      .set("Authorization", bearer())
      .attach("file", PNG, { filename: "plan.png", contentType: "image/png" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "ESTIMATE_NOT_FOUND", message: "Estimate not found." }
    });
  });

  it.each(["sent_to_client", "client_approved"])(
    "does not accept uploads for a %s estimate",
    async (status) => {
      const { app, storage, setEstimate } = setup();
      setEstimate({
        _id: "estimate-draft",
        leadId: "lead-aurora",
        ownerId: "user-estimator-sales",
        status
      });

      const response = await upload(app, PNG, "plan.png", "image/png");

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("ESTIMATE_DESIGN_LOCKED");
      expect(storage.objects.size).toBe(0);
    }
  );

  it("rejects content whose claimed type does not match its signature", async () => {
    const { app, storage } = setup();

    const response = await upload(app, PNG, "pretend.jpg", "image/jpeg");

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(storage.objects.size).toBe(0);
  });

  it("rejects oversized uploads before persisting an artifact", async () => {
    const { app, storage } = setup({ maxUploadBytes: PNG.byteLength - 1 });

    const response = await upload(app, PNG, "plan.png", "image/png");

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("FILE_TOO_LARGE");
    expect(storage.objects.size).toBe(0);
  });

  it("removes only its newly stored artifact when job persistence fails", async () => {
    const { app, storage } = setup();
    vi.mocked(EstimateDesignExtractionJobModel.create).mockRejectedValueOnce(
      new Error("simulated enqueue failure")
    );
    vi.spyOn(EstimateDesignUploadModel, "deleteOne").mockResolvedValue({
      acknowledged: true,
      deletedCount: 1
    } as never);

    const response = await upload(app, PNG, "plan.png", "image/png");

    expect(response.status).toBe(500);
    expect(storage.objects.size).toBe(0);
    expect(storage.deleted).toHaveLength(1);
  });
});
