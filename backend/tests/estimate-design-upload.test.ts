import { Readable } from "node:stream";

import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
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
  const result = {
    session: vi.fn(),
    lean: vi.fn().mockResolvedValue(value)
  };
  result.session.mockReturnValue(result);
  return result;
}

function sortedLean(value: unknown) {
  return { sort: vi.fn().mockReturnValue(lean(value)) };
}

function setup(options: { maxUploadBytes?: number } = {}) {
  const storage = new TestStorage();
  const uploads: Array<Record<string, unknown>> = [];
  const jobs: Array<Record<string, unknown>> = [];
  let stagedUploads: Array<Record<string, unknown>> = [];
  let stagedJobs: Array<Record<string, unknown>> = [];
  let transactionActive = false;
  const session = {
    withTransaction: vi.fn(async (operation: () => Promise<unknown>) => {
      transactionActive = true;
      try {
        const result = await operation();
        uploads.push(...stagedUploads);
        jobs.push(...stagedJobs);
        return result;
      } finally {
        stagedUploads = [];
        stagedJobs = [];
        transactionActive = false;
      }
    }),
    endSession: vi.fn(async () => undefined)
  };
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
  vi.spyOn(AuditEventModel, "create").mockImplementation(async (input) =>
    (input as Array<Record<string, any>>).map((event) => ({
      toObject: () => ({ ...event, id: event._id })
    })) as never
  );
  const estimate = {
    _id: "estimate-draft",
    leadId: "lead-aurora",
    ownerId: "user-estimator-sales",
    status: "draft",
    designLifecycleVersion: 0,
    designFrozenAt: null
  };

  vi.spyOn(EstimateModel, "findOne").mockImplementation((query) => {
    const value = query._id === "estimate-draft" ? estimate : null;
    return lean(value) as never;
  });
  vi.spyOn(EstimateModel, "updateOne").mockImplementation(async (_filter, update) => {
    estimate.designLifecycleVersion += Number(update.$inc?.designLifecycleVersion ?? 0);
    return { matchedCount: 1, modifiedCount: 1 } as never;
  });
  vi.spyOn(LeadModel, "findOne").mockReturnValue(lean({
    _id: "lead-aurora",
    ownerId: "user-estimator-sales"
  }) as never);
  vi.spyOn(EstimateDesignUploadModel, "create").mockImplementation(async (input) => {
    const document = (Array.isArray(input) ? input[0] : input) as Record<string, unknown>;
    (transactionActive ? stagedUploads : uploads).push(document);
    return input as never;
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "create").mockImplementation(async (input) => {
    const document = (Array.isArray(input) ? input[0] : input) as Record<string, unknown>;
    (transactionActive ? stagedJobs : jobs).push(document);
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
    session,
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
    const { app, session } = setup();

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
    expect(EstimateDesignUploadModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: response.body.data.id })],
      { session }
    );
    expect(EstimateDesignExtractionJobModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({ uploadId: response.body.data.id, status: "queued" })],
      { session }
    );
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
    const { app, storage, uploads, jobs, session } = setup();
    const deleteUpload = vi.spyOn(EstimateDesignUploadModel, "deleteOne");
    vi.mocked(EstimateDesignExtractionJobModel.create).mockRejectedValueOnce(
      new Error("simulated enqueue failure")
    );

    const response = await upload(app, PNG, "plan.png", "image/png");

    expect(response.status).toBe(500);
    expect(storage.objects.size).toBe(0);
    expect(storage.deleted).toHaveLength(1);
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(uploads).toEqual([]);
    expect(jobs).toEqual([]);
    expect(deleteUpload).not.toHaveBeenCalled();
  });

  it("does not expose stored object references from the estimator workspace", async () => {
    const { app } = setup();
    vi.spyOn(EstimateDesignUploadModel, "find").mockReturnValue(sortedLean([{
      _id: "upload-1",
      estimateId: "estimate-draft",
      leadId: "lead-aurora",
      originalFilename: "plan.png",
      storedFileReference: "original-secret.png",
      mimeType: "image/png",
      sizeBytes: 8,
      uploaderId: "user-estimator-sales",
      uploadedAt: now(),
      extractionStatus: "queued",
      failureCode: null,
      failureMessage: null
    }]) as never);
    vi.spyOn(EstimateDesignSourcePageModel, "find").mockReturnValue(sortedLean([{
      _id: "page-1",
      uploadId: "upload-1",
      pageNumber: 1,
      normalizedFileReference: "page-secret.png",
      width: 1200,
      height: 800
    }]) as never);
    vi.spyOn(EstimateDesignDrawingModel, "find").mockReturnValue(sortedLean([{
      _id: "drawing-1",
      estimateId: "estimate-draft",
      uploadId: "upload-1",
      sourcePageId: "page-1",
      active: true,
      verified: false,
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc",
      detectedTitle: "Ceiling",
      displayTitle: "Ceiling",
      source: "ocr"
    }]) as never);
    vi.spyOn(EstimateDesignRevisionModel, "find").mockReturnValue(sortedLean([{
      _id: "revision-1",
      drawingId: "drawing-1",
      revisionNumber: 1,
      sourcePageId: "page-1",
      crop: { x: 0, y: 0, width: 100, height: 100 },
      croppedFileReference: "revision-secret.png",
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc",
      label: "Ceiling",
      reviewStatus: "draft"
    }]) as never);

    const response = await request(app)
      .get("/api/v1/estimates/estimate-draft/design-uploads")
      .set("Authorization", bearer());

    expect(response.status).toBe(200);
    expect(response.body.data.uploads[0]).not.toHaveProperty("storedFileReference");
    expect(response.body.data.pages[0]).not.toHaveProperty("normalizedFileReference");
    expect(response.body.data.revisions[0]).not.toHaveProperty("croppedFileReference");
    expect(JSON.stringify(response.body.data)).not.toContain("secret");
    expect(response.body.data.drawings[0]).toMatchObject({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc"
    });
    expect(response.body.data.revisions[0]).toMatchObject({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc"
    });
    expect(JSON.stringify(response.body.data)).not.toMatch(/"(?:roomId|scopeSectionId|catalogueId)":"(?:|null|undefined)"/);
  });

  it("collapses incoherent legacy mappings to the null Misc tuple in workspace DTOs", async () => {
    const { app } = setup();
    vi.spyOn(EstimateDesignUploadModel, "find").mockReturnValue(sortedLean([]) as never);
    vi.spyOn(EstimateDesignSourcePageModel, "find").mockReturnValue(sortedLean([]) as never);
    vi.spyOn(EstimateDesignDrawingModel, "find").mockReturnValue(sortedLean([{
      _id: "legacy-drawing",
      estimateId: "estimate-draft",
      uploadId: "upload-1",
      sourcePageId: "page-1",
      active: true,
      verified: false,
      roomId: "room-living",
      scopeSectionId: "FC",
      detectedTitle: "Ceiling",
      displayTitle: "Ceiling",
      source: "ocr"
    }]) as never);
    vi.spyOn(EstimateDesignRevisionModel, "find").mockReturnValue(sortedLean([{
      _id: "legacy-revision",
      drawingId: "legacy-drawing",
      revisionNumber: 1,
      sourcePageId: "page-1",
      crop: { x: 0, y: 0, width: 100, height: 100 },
      croppedFileReference: "revision-secret.png",
      roomId: "room-living",
      scopeSectionId: "FC",
      label: "Ceiling",
      reviewStatus: "draft"
    }]) as never);

    const response = await request(app)
      .get("/api/v1/estimates/estimate-draft/design-uploads")
      .set("Authorization", bearer());

    expect(response.status).toBe(200);
    expect(response.body.data.drawings[0]).toMatchObject({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc"
    });
    expect(response.body.data.revisions[0]).toMatchObject({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc"
    });
  });

  it("does not serialize legacy mapping sentinels as mapped identifiers", async () => {
    const { app } = setup();
    vi.spyOn(EstimateDesignUploadModel, "find").mockReturnValue(sortedLean([]) as never);
    vi.spyOn(EstimateDesignSourcePageModel, "find").mockReturnValue(sortedLean([]) as never);
    vi.spyOn(EstimateDesignDrawingModel, "find").mockReturnValue(sortedLean([{
      _id: "sentinel-drawing",
      estimateId: "estimate-draft",
      uploadId: "upload-1",
      sourcePageId: "page-1",
      active: true,
      verified: false,
      roomId: "null",
      scopeSectionId: "undefined",
      catalogueId: "FC01",
      mappingStatus: "auto_mapped",
      detectedTitle: "Ceiling",
      displayTitle: "Ceiling",
      source: "ocr"
    }]) as never);
    vi.spyOn(EstimateDesignRevisionModel, "find").mockReturnValue(sortedLean([{
      _id: "sentinel-revision",
      drawingId: "sentinel-drawing",
      revisionNumber: 1,
      sourcePageId: "page-1",
      crop: { x: 0, y: 0, width: 100, height: 100 },
      croppedFileReference: "revision-secret.png",
      roomId: "room-living",
      scopeSectionId: "FC",
      catalogueId: "null",
      mappingStatus: "estimator_assigned",
      label: "Ceiling",
      reviewStatus: "draft"
    }]) as never);

    const response = await request(app)
      .get("/api/v1/estimates/estimate-draft/design-uploads")
      .set("Authorization", bearer());

    expect(response.status).toBe(200);
    for (const record of [response.body.data.drawings[0], response.body.data.revisions[0]]) {
      expect(record).toMatchObject({
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc"
      });
    }
    expect(JSON.stringify(response.body.data)).not.toMatch(/"(?:roomId|scopeSectionId|catalogueId)":"(?:null|undefined)"/);
  });
});
