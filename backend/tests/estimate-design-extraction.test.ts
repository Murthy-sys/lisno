import { Readable } from "node:stream";

import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

const SECRET = "estimate-extraction-test-secret-at-least-32-characters";
const WORKER_TOKEN = "estimate-worker-token-with-at-least-32-characters";
const NOW = new Date("2026-07-30T12:00:00.000Z");
let PAGE_ONE: Buffer;
let PAGE_TWO: Buffer;
let PAGE_IMAGES: Buffer[];

class TestStorage {
  private sequence = 0;
  readonly objects = new Map<string, Buffer>();
  readonly deleted: string[] = [];

  async save(input: { data: Buffer; extension: string }) {
    return this.saveGenerated(input);
  }

  async saveGenerated(input: { data: Buffer; extension: string }) {
    this.sequence += 1;
    const reference = `generated-${this.sequence}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async read(reference: string) {
    const value = this.objects.get(reference);
    if (!value) throw new Error("missing object");
    return Buffer.from(value);
  }

  async open(reference: string) {
    return Readable.from(await this.read(reference));
  }

  async delete(reference: string) {
    this.deleted.push(reference);
    this.objects.delete(reference);
  }
}

function query<T>(value: T) {
  const result = {
    sort: vi.fn(),
    session: vi.fn(),
    lean: vi.fn(async () => value),
    exec: vi.fn(async () => value)
  };
  result.sort.mockReturnValue(result);
  result.session.mockReturnValue(result);
  return result;
}

function applyUpdate(record: Record<string, unknown>, update: Record<string, any>) {
  Object.assign(record, update.$set ?? {});
  for (const [key, amount] of Object.entries(update.$inc ?? {})) {
    record[key] = Number(record[key] ?? 0) + Number(amount);
  }
}

function matches(record: Record<string, any>, filter: Record<string, any>) {
  if (filter.$or) {
    if (!filter.$or.some((branch: Record<string, any>) => matches(record, branch))) {
      return false;
    }
  }
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "$or") continue;
    const actual = record[key];
    if (expected && typeof expected === "object") {
      if ("$in" in expected && !(expected.$in as unknown[]).includes(actual)) return false;
      if ("$gt" in expected && !(new Date(actual) > expected.$gt)) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function restore(target: Array<Record<string, any>>, snapshot: Array<Record<string, any>>) {
  target.splice(0, target.length, ...structuredClone(snapshot));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function transactionDocuments(
  input: unknown,
  options: unknown
): Array<Record<string, any>> {
  const documents = input as Array<Record<string, any>>;
  if (
    documents.length > 1 &&
    (options as { session?: unknown } | undefined)?.session &&
    !(options as { ordered?: boolean } | undefined)?.ordered
  ) {
    throw new mongoose.Error(
      "Cannot call create() with a session and multiple documents unless ordered: true is set"
    );
  }
  return documents;
}

function setup() {
  const storage = new TestStorage();
  storage.objects.set("original-plan.pdf", Buffer.from("%PDF-1.7\nestimate"));
  const estimates: Array<Record<string, any>> = [{
    _id: "estimate-1",
    leadId: "lead-1",
    ownerId: "user-estimator-sales",
    status: "draft",
    designLifecycleVersion: 0,
    designFrozenAt: null,
    rooms: [
      { id: "room-bedroom-1", label: "Bedroom 1", aliases: ["bed 1"] },
      { id: "room-bedroom-2", label: "Bedroom 2", aliases: ["bed 2"] }
    ],
    scopes: ["CA", "FC", "EL"],
    lineItems: [
      {
        catalogueId: "CA01",
        roomName: "Bedroom 1",
        specification: "BWR ply + veneer + polish",
        unit: "lot",
        rate: 32_000,
        quantity: 1,
        included: true,
        amount: 32_000
      },
      {
        catalogueId: "CA01",
        roomName: "Bedroom 2",
        specification: "MDF + PU paint",
        unit: "lot",
        rate: 32_000,
        quantity: 1,
        included: true,
        amount: 32_000
      }
    ]
  }];
  const uploads: Array<Record<string, any>> = [{
    _id: "upload-1",
    estimateId: "estimate-1",
    leadId: "lead-1",
    originalFilename: "estimate-plan.pdf",
    storedFileReference: "original-plan.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1_000_000,
    uploaderId: "user-estimator-sales",
    uploadedAt: new Date("2026-07-30T11:00:00.000Z"),
    extractionStatus: "queued",
    failureCode: null,
    failureMessage: null
  }];
  const jobs: Array<Record<string, any>> = [{
    _id: "estimate-job-1",
    uploadId: "upload-1",
    status: "queued",
    attemptCount: 0,
    queuedAt: new Date("2026-07-30T11:00:00.000Z"),
    nextAttemptAt: new Date("2026-07-30T11:00:00.000Z"),
    claimGeneration: 0,
    startedAt: null,
    completedAt: null,
    leaseExpiresAt: null,
    claimId: null,
    failureCode: null,
    failureMessage: null,
    workerResultId: null
  }];
  const pages: Array<Record<string, any>> = [];
  const drawings: Array<Record<string, any>> = [];
  const revisions: Array<Record<string, any>> = [];
  const auditEvents: Array<Record<string, any>> = [];
  const runTransaction = async (operation: () => Promise<unknown>) => {
    const snapshots = {
      estimates: structuredClone(estimates),
      uploads: structuredClone(uploads),
      jobs: structuredClone(jobs),
      pages: structuredClone(pages),
      drawings: structuredClone(drawings),
      revisions: structuredClone(revisions)
    };
    try {
      return await operation();
    } catch (error) {
      restore(estimates, snapshots.estimates);
      restore(uploads, snapshots.uploads);
      restore(jobs, snapshots.jobs);
      restore(pages, snapshots.pages);
      restore(drawings, snapshots.drawings);
      restore(revisions, snapshots.revisions);
      throw error;
    }
  };
  const session = {
    withTransaction: vi.fn(runTransaction),
    endSession: vi.fn(async () => undefined)
  };
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
  vi.spyOn(AuditEventModel, "create").mockImplementation(async (input) => {
    const events = structuredClone(input as Array<Record<string, any>>);
    auditEvents.push(...events);
    return events.map((event) => ({
      toObject: () => ({ ...event, id: event._id })
    })) as never;
  });
  vi.spyOn(EstimateModel, "findById").mockImplementation((id) =>
    query(estimates.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateModel, "findOne").mockImplementation((filter) =>
    query(estimates.find((item) => item._id === filter._id && item.ownerId === filter.ownerId) ?? null) as never
  );
  vi.spyOn(EstimateModel, "updateOne").mockImplementation(async (filter, update) => {
    const record = estimates.find((item) => matches(item, filter as never));
    if (record) applyUpdate(record, update as never);
    return {
      matchedCount: record ? 1 : 0,
      modifiedCount: record ? 1 : 0
    } as never;
  });
  vi.spyOn(EstimateDesignUploadModel, "findById").mockImplementation((id) =>
    query(uploads.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignUploadModel, "find").mockReturnValue(query(uploads) as never);
  vi.spyOn(EstimateDesignUploadModel, "updateOne").mockImplementation(async (filter, update) => {
    const record = uploads.find((item) => matches(item, filter as never));
    if (record) applyUpdate(record, update as never);
    return {
      matchedCount: record ? 1 : 0,
      modifiedCount: record ? 1 : 0
    } as never;
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "findOne").mockImplementation((filter) => {
    const record = jobs
      .filter((item) => matches(item, filter as never))
      .sort((a, b) => +new Date(a.queuedAt) - +new Date(b.queuedAt))[0] ?? null;
    return query(record) as never;
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "findById").mockImplementation((id) =>
    query(jobs.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignExtractionJobModel, "findOneAndUpdate").mockImplementation((filter, update) => {
    const record = jobs.find((item) => matches(item, filter as never)) ?? null;
    if (record) applyUpdate(record, update as never);
    return query(record) as never;
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "updateOne").mockImplementation(async (filter, update) => {
    const record = jobs.find((item) => matches(item, filter as never));
    if (record) applyUpdate(record, update as never);
    return {
      matchedCount: record ? 1 : 0,
      modifiedCount: record ? 1 : 0
    } as never;
  });
  vi.spyOn(EstimateDesignSourcePageModel, "create").mockImplementation(async (input, options) => {
    const documents = transactionDocuments(input, options);
    pages.push(...documents);
    return input as never;
  });
  vi.spyOn(EstimateDesignSourcePageModel, "find").mockReturnValue(query(pages) as never);
  vi.spyOn(EstimateDesignSourcePageModel, "findById").mockImplementation((id) =>
    query(pages.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignDrawingModel, "create").mockImplementation(async (input, options) => {
    drawings.push(...transactionDocuments(input, options));
    return input as never;
  });
  vi.spyOn(EstimateDesignDrawingModel, "find").mockImplementation((filter) =>
    query(drawings.filter((item) =>
      (filter.estimateId === undefined || item.estimateId === filter.estimateId) &&
      (filter.active === undefined || item.active === filter.active) &&
      (filter._id?.$in === undefined || filter._id.$in.includes(item._id))
    )) as never
  );
  vi.spyOn(EstimateDesignDrawingModel, "findById").mockImplementation((id) =>
    query(drawings.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignDrawingModel, "updateOne").mockImplementation(async (filter, update) => {
    const record = drawings.find((item) => matches(item, filter as never));
    if (record) applyUpdate(record, update as never);
    return {
      matchedCount: record ? 1 : 0,
      modifiedCount: record ? 1 : 0
    } as never;
  });
  vi.spyOn(EstimateDesignRevisionModel, "create").mockImplementation(async (input, options) => {
    revisions.push(...transactionDocuments(input, options));
    return input as never;
  });
  vi.spyOn(EstimateDesignRevisionModel, "find").mockImplementation((filter) =>
    query(revisions.filter((item) =>
      filter.drawingId?.$in ? filter.drawingId.$in.includes(item.drawingId) :
        filter.drawingId ? item.drawingId === filter.drawingId : true
    )) as never
  );
  vi.spyOn(EstimateDesignRevisionModel, "findOne").mockImplementation((filter) => {
    const candidates = revisions
      .filter((item) => item.drawingId === filter.drawingId)
      .sort((a, b) => b.revisionNumber - a.revisionNumber);
    return query(candidates[0] ?? null) as never;
  });
  vi.spyOn(EstimateDesignRevisionModel, "findById").mockImplementation((id) =>
    query(revisions.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignRevisionModel, "updateOne").mockImplementation(async (filter, update) => {
    const record = revisions.find((item) => matches(item, filter as never));
    if (record) applyUpdate(record, update as never);
    return {
      matchedCount: record ? 1 : 0,
      modifiedCount: record ? 1 : 0
    } as never;
  });
  vi.spyOn(EstimateDesignRevisionModel, "updateMany").mockImplementation(async (filter, update) => {
    let matchedCount = 0;
    let modifiedCount = 0;
    for (const revision of revisions) {
      if (
        filter._id?.$in.includes(revision._id) &&
        filter.reviewStatus?.$in.includes(revision.reviewStatus)
      ) {
        matchedCount += 1;
        applyUpdate(revision, update as never);
        modifiedCount += 1;
      }
    }
    return { matchedCount, modifiedCount } as never;
  });

  const repository = createMemoryRepository(structuredClone(demoSeedData));
  const app = createApp({
    repository,
    auth: { jwtSecret: SECRET, jwtExpiresInSeconds: 900 },
    clock: () => new Date(NOW),
    storage,
    maxUploadBytes: 10_000_000,
    ocrWorkerToken: WORKER_TOKEN,
    enableEstimateDesignJobs: true
  });
  return {
    app,
    repository,
    storage,
    estimates,
    uploads,
    jobs,
    pages,
    drawings,
    revisions,
    auditEvents,
    session,
    runTransaction
  };
}

function worker(requestBuilder: request.Test) {
  return requestBuilder.set("Authorization", `Bearer ${WORKER_TOKEN}`);
}

function owner(requestBuilder: request.Test) {
  return requestBuilder.set(
    "Authorization",
    `Bearer ${jwt.sign({ id: "user-estimator-sales", role: "estimator_sales" }, SECRET, { expiresIn: 900 })}`
  );
}

async function claim(app: ReturnType<typeof createApp>) {
  return worker(request(app).post("/api/v1/internal/extraction-jobs/claim")).send();
}

function estimatePage(
  pageNumber: number,
  image: Buffer,
  label = `Drawing ${pageNumber}`
) {
  return {
    pageNumber,
    width: 100,
    height: 80,
    imageBase64: image.toString("base64"),
    sections: [{
      label,
      confidence: 0.95,
      crop: { x: 0, y: 0, width: 100, height: 80 },
      imageBase64: image.toString("base64"),
      proposal: {
        detectedTitle: label,
        room: {
          id: null,
          confidence: 0,
          evidence: [],
          ambiguous: false
        },
        scope: {
          id: null,
          confidence: 0,
          evidence: [],
          ambiguous: false
        }
      }
    }]
  };
}

function completeBody(pageCount = 4) {
  return {
    kind: "estimate_design",
    resultId: "estimate-result-1",
    pages: Array.from(
      { length: pageCount },
      (_, index) => estimatePage(
        index + 1,
        PAGE_IMAGES[index % PAGE_IMAGES.length]!
      )
    )
  };
}

async function complete(
  app: ReturnType<typeof createApp>,
  claimToken: string,
  body = completeBody()
) {
  return worker(request(app).post("/api/v1/internal/extraction-jobs/estimate-job-1/complete"))
    .set("X-Extraction-Claim-Token", claimToken)
    .send(body);
}

async function verifyDrawings(app: ReturnType<typeof createApp>, drawings: Array<Record<string, any>>) {
  const responses = await Promise.all(drawings.map((drawing) => owner(
    request(app).patch(`/api/v1/estimate-design-drawings/${drawing._id}`)
  ).send({ version: 1, verified: true })));
  expect(responses.every((response) => response.status === 200)).toBe(true);
}

beforeAll(async () => {
  PAGE_ONE = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#ffffff" }
  }).png().toBuffer();
  PAGE_TWO = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#eeeeee" }
  }).png().toBuffer();
  PAGE_IMAGES = [PAGE_ONE, PAGE_TWO];
});

afterEach(() => vi.restoreAllMocks());

describe("estimate design extraction and estimator verification", () => {
  it("stores unresolved drawing and revision mappings as actual nulls", async () => {
    const drawing = new EstimateDesignDrawingModel({
      _id: "drawing-misc",
      uploadId: "upload-1",
      sourcePageId: "page-1",
      estimateId: "estimate-1",
      active: true,
      verified: true,
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc",
      detectedTitle: "TV UNIT",
      displayTitle: "TV UNIT",
      source: "ocr"
    });
    const revision = new EstimateDesignRevisionModel({
      _id: "revision-misc",
      drawingId: "drawing-misc",
      revisionNumber: 1,
      sourcePageId: "page-1",
      crop: { x: 0, y: 0, width: 100, height: 80 },
      croppedFileReference: "misc.png",
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc",
      label: "TV UNIT",
      reviewStatus: "draft"
    });

    await expect(drawing.validate()).resolves.toBeUndefined();
    await expect(revision.validate()).resolves.toBeUndefined();
    expect(drawing.toObject()).toMatchObject({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc"
    });
    expect(revision.toObject()).toMatchObject({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc"
    });
  });

  it.each(["", "null", "undefined"])(
    "rejects the legacy %s mapping sentinel on live writes",
    async (sentinel) => {
      const drawing = new EstimateDesignDrawingModel({
        _id: `drawing-${sentinel || "empty"}`,
        uploadId: "upload-1",
        sourcePageId: "page-1",
        estimateId: "estimate-1",
        active: true,
        verified: false,
        roomId: sentinel,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc",
        detectedTitle: "Unknown",
        displayTitle: "Unknown",
        source: "ocr"
      });

      await expect(drawing.validate()).rejects.toThrow();
    }
  );

  it("rejects partial and incoherent live drawing mapping updates", async () => {
    await expect(
      EstimateDesignDrawingModel.updateOne(
        { _id: "drawing-misc" },
        { $set: { roomId: "room-bedroom-1" } },
        { runValidators: true }
      )
    ).rejects.toThrow("Mapping updates must set the complete tuple.");
    await expect(
      EstimateDesignDrawingModel.updateOne(
        { _id: "drawing-misc" },
        {
          $set: {
            roomId: "room-bedroom-1",
            scopeSectionId: "FC",
            catalogueId: "FC01",
            mappingStatus: "misc"
          }
        },
        { runValidators: true }
      )
    ).rejects.toThrow("Estimate design mapping must have either all-null Misc fields or all-present mapped fields.");
    await expect(
      EstimateDesignDrawingModel.updateOne(
        { _id: "drawing-misc" },
        {
          $set: {
            roomId: "null",
            scopeSectionId: "FC",
            catalogueId: "FC01",
            mappingStatus: "auto_mapped"
          }
        }
      )
    ).rejects.toThrow("Mapping identifiers must be a real identifier or null.");
  });

  it.each([
    ["$rename", { $rename: { roomId: "legacyRoomId" } }],
    ["$setOnInsert", { $setOnInsert: { roomId: "room-bedroom-1" } }],
    ["pipeline $unset string", [{ $unset: "roomId" }]],
    ["pipeline $project inclusion", [{ $project: { active: 1 } }]]
  ])("rejects drawing mapping changes through %s", async (_operation, update) => {
    await expect(
      EstimateDesignDrawingModel.updateOne(
        { _id: "drawing-misc" },
        update as never,
        update instanceof Array ? { updatePipeline: true } : undefined
      )
    ).rejects.toThrow(
      update instanceof Array
        ? "Pipeline updates cannot change mapping fields."
        : "Mapping updates must set the complete tuple."
    );
  });

  it("rejects every revision mapping update", async () => {
    await expect(
      EstimateDesignRevisionModel.updateOne(
        { _id: "revision-misc" },
        {
          $set: {
            roomId: "room-bedroom-1",
            scopeSectionId: "FC",
            catalogueId: "FC01",
            mappingStatus: "estimator_assigned"
          }
        },
        { runValidators: true }
      )
    ).rejects.toThrow("Revision mapping snapshots are immutable.");
    await expect(
      EstimateDesignRevisionModel.findOneAndUpdate(
        { _id: "revision-misc" },
        { $set: { roomId: "room-bedroom-1" } },
        { runValidators: true }
      )
    ).rejects.toThrow("Revision mapping snapshots are immutable.");
  });

  it.each([
    ["$rename", { $rename: { roomId: "legacyRoomId" } }],
    ["$setOnInsert", { $setOnInsert: { roomId: "room-bedroom-1" } }],
    ["pipeline $unset string", [{ $unset: "roomId" }]],
    ["pipeline $project inclusion", [{ $project: { active: 1 } }]]
  ])("rejects revision mapping changes through %s", async (_operation, update) => {
    await expect(
      EstimateDesignRevisionModel.updateOne(
        { _id: "revision-misc" },
        update as never,
        update instanceof Array ? { updatePipeline: true } : undefined
      )
    ).rejects.toThrow("Revision mapping snapshots are immutable.");
  });

  it("allows a retry to receive a new queue-order timestamp", () => {
    const originalQueuedAt = new Date("2026-07-30T11:00:00.000Z");
    const retriedAt = new Date("2026-07-30T12:00:00.000Z");
    const job = EstimateDesignExtractionJobModel.hydrate({
      _id: "estimate-job-retry-order",
      uploadId: "upload-retry-order",
      status: "processing_failed",
      attemptCount: 1,
      queuedAt: originalQueuedAt,
      nextAttemptAt: null,
      claimGeneration: 1
    });

    job.queuedAt = retriedAt;

    expect(job.queuedAt).toEqual(retriedAt);
    expect(job.isModified("queuedAt")).toBe(true);
  });

  it("retries only an owned failed estimate upload and atomically resets its job", async () => {
    const { app, uploads, jobs, auditEvents } = setup();
    Object.assign(uploads[0]!, { extractionStatus: "processing_failed", failureCode: "OCR_FAILED", failureMessage: "OCR failed." });
    Object.assign(jobs[0]!, { status: "processing_failed", completedAt: NOW, failureCode: "OCR_FAILED", failureMessage: "OCR failed." });

    const retried = await owner(request(app).post("/api/v1/estimate-design-uploads/upload-1/retry")).send();

    expect(retried.status).toBe(200);
    expect(retried.body.data).toMatchObject({ id: "upload-1", extractionStatus: "queued", failureCode: null, failureMessage: null });
    expect(jobs[0]).toMatchObject({ status: "queued", claimId: null, leaseExpiresAt: null, completedAt: null, failureCode: null, failureMessage: null });
    expect(auditEvents).toContainEqual(expect.objectContaining({
      action: "estimate_design_upload_retried"
    }));
  });

  it("rolls back a retry when its transaction-coupled audit write fails", async () => {
    const { app, uploads, jobs } = setup();
    Object.assign(uploads[0]!, {
      extractionStatus: "processing_failed",
      failureCode: "OCR_FAILED",
      failureMessage: "OCR failed."
    });
    Object.assign(jobs[0]!, {
      status: "processing_failed",
      completedAt: NOW,
      failureCode: "OCR_FAILED",
      failureMessage: "OCR failed."
    });
    vi.mocked(AuditEventModel.create).mockRejectedValueOnce(
      new Error("audit unavailable")
    );

    const response = await owner(
      request(app).post("/api/v1/estimate-design-uploads/upload-1/retry")
    ).send();

    expect(response.status).toBe(500);
    expect(uploads[0]).toMatchObject({
      extractionStatus: "processing_failed",
      failureCode: "OCR_FAILED"
    });
    expect(jobs[0]).toMatchObject({
      status: "processing_failed",
      failureCode: "OCR_FAILED"
    });
  });

  it("does not leak or retry a non-owned estimate upload", async () => {
    const { app, uploads, jobs } = setup();
    Object.assign(uploads[0]!, { extractionStatus: "processing_failed" });
    Object.assign(jobs[0]!, { status: "processing_failed" });
    const stranger = request(app).post("/api/v1/estimate-design-uploads/upload-1/retry").set(
      "Authorization",
      `Bearer ${jwt.sign({ id: "user-designer-vikram", role: "designer" }, SECRET, { expiresIn: 900 })}`
    );

    await stranger.expect(403);
    expect(uploads[0]!.extractionStatus).toBe("processing_failed");
  });

  it("soft-removes an owned unverified draft drawing with its current revision", async () => {
    const { app, drawings, revisions, auditEvents } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    const drawing = drawings[0]!;
    drawing.verified = false;

    const removed = await owner(request(app).delete(`/api/v1/estimate-design-drawings/${drawing._id}`)).send({ version: 1 });

    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({ id: drawing._id, active: false });
    expect(drawing.active).toBe(false);
    expect(revisions.filter((revision) => revision.drawingId === drawing._id)).toHaveLength(1);
    expect(auditEvents).toContainEqual(expect.objectContaining({
      action: "estimate_design_drawing_removed",
      entityId: drawing._id
    }));
  });

  it("leases only the oldest claimable job across both job collections", async () => {
    const { app, repository, jobs } = setup();
    await repository.enqueueExtractionJob({
      id: "older-project-job",
      designVersionId: "version-aurora-plan-1",
      status: "queued",
      attemptCount: 0,
      queuedAt: "2026-07-30T10:00:00.000Z",
      nextAttemptAt: "2026-07-30T10:00:00.000Z",
      claimGeneration: 0,
      startedAt: null,
      completedAt: null,
      leaseExpiresAt: null,
      failureCode: null,
      failureMessage: null
    });

    const first = await claim(app);

    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      kind: "project_design",
      id: "older-project-job"
    });
    expect(jobs[0]).toMatchObject({
      _id: "estimate-job-1",
      status: "queued",
      attemptCount: 0,
      claimId: null
    });

    const second = await claim(app);
    expect(second.body.data).toMatchObject({
      kind: "estimate_design",
      id: "estimate-job-1"
    });
  });

  it.each(["queued", "expired processing"] as const)(
    "terminally cancels a frozen %s estimate job and continues to later project work",
    async (initialState) => {
      const {
        app,
        repository,
        storage,
        estimates,
        uploads,
        jobs
      } = setup();
      estimates[0]!.status = "client_approved";
      estimates[0]!.designLifecycleVersion = 1;
      estimates[0]!.designFrozenAt = NOW;
      if (initialState === "expired processing") {
        jobs[0]!.status = "processing";
        jobs[0]!.claimId = "expired-claim";
        jobs[0]!.leaseExpiresAt = new Date("2026-07-30T11:59:00.000Z");
        uploads[0]!.extractionStatus = "processing";
      }
      await repository.enqueueExtractionJob({
        id: "later-project-job",
        designVersionId: "version-aurora-plan-1",
        status: "queued",
        attemptCount: 0,
        queuedAt: "2026-07-30T11:30:00.000Z",
        nextAttemptAt: "2026-07-30T11:30:00.000Z",
        claimGeneration: 0,
        startedAt: null,
        completedAt: null,
        leaseExpiresAt: null,
        failureCode: null,
        failureMessage: null
      });

      const claimed = await claim(app);

      expect(claimed.status).toBe(200);
      expect(claimed.body.data).toMatchObject({
        kind: "project_design",
        id: "later-project-job"
      });
      expect(jobs[0]).toMatchObject({
        status: "processing_failed",
        claimId: null,
        leaseExpiresAt: null,
        failureCode: "ESTIMATE_DESIGN_FROZEN",
        failureMessage: "Estimate design was finalized before extraction completed."
      });
      expect(uploads[0]).toMatchObject({
        extractionStatus: "processing_failed",
        failureCode: "ESTIMATE_DESIGN_FROZEN",
        failureMessage: "Estimate design was finalized before extraction completed."
      });
      expect(storage.objects.get("original-plan.pdf")).toEqual(
        Buffer.from("%PDF-1.7\nestimate")
      );

      const noMoreWork = await claim(app);
      expect(noMoreWork.status).toBe(204);
      expect(jobs[0]!.attemptCount).toBe(1);
    }
  );

  it("claims the estimate taxonomy and atomically publishes every full-page drawing", async () => {
    const { app, uploads, pages, drawings, revisions, auditEvents } = setup();

    const leased = await claim(app);

    expect(leased.status).toBe(200);
    expect(leased.body.data).toMatchObject({
      kind: "estimate_design",
      id: "estimate-job-1",
      sourceFilename: "estimate-plan.pdf",
      sourceMimeType: "application/pdf",
      taxonomy: {
        rooms: [
          { id: "room-bedroom-1", label: "Bedroom 1", aliases: ["bed 1"] },
          { id: "room-bedroom-2", label: "Bedroom 2", aliases: ["bed 2"] }
        ],
        scopes: [
          { id: "FC", label: "False Ceiling" },
          { id: "CA", label: "Carpentry" },
          { id: "EL", label: "Electrical" }
        ]
      }
    });
    expect(leased.body.data.sourceUrl).not.toContain(leased.body.data.claimToken);

    const response = await complete(app, leased.body.data.claimToken);

    expect(response.status).toBe(200);
    expect(pages).toHaveLength(4);
    expect(drawings).toHaveLength(4);
    expect(drawings.every((drawing) => drawing.active)).toBe(true);
    expect(revisions).toHaveLength(4);
    expect(revisions.every((revision) =>
      revision.revisionNumber === 1 &&
      revision.reviewStatus === "draft" &&
      Object.isFrozen(revision.crop) === false
    )).toBe(true);
    expect(uploads[0]!.extractionStatus).toBe("estimator_review");
    expect(auditEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "estimate_design_extraction_claimed",
        "estimate_design_extraction_completed"
      ])
    );
  });

  it("publishes six full-page results as six pages, drawings, revisions, and six stored images", async () => {
    const { app, pages, drawings, revisions, storage } = setup();
    const leased = await claim(app);

    const response = await complete(
      app,
      leased.body.data.claimToken,
      completeBody(6)
    );

    expect(response.status).toBe(200);
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(drawings).toHaveLength(6);
    expect(revisions).toHaveLength(6);
    expect(revisions.every((revision) =>
      revision.crop.x === 0 &&
      revision.crop.y === 0 &&
      revision.crop.width === 100 &&
      revision.crop.height === 80
    )).toBe(true);
    expect([...storage.objects.keys()]).toHaveLength(7);
    expect(revisions.map((revision) => revision.croppedFileReference))
      .toEqual(pages.map((page) => page.normalizedFileReference));
  });

  it("does not impose a six-page backend cap", async () => {
    const { app, pages, drawings, revisions } = setup();
    const leased = await claim(app);
    const response = await complete(
      app,
      leased.body.data.claimToken,
      completeBody(7)
    );

    expect(response.status).toBe(200);
    expect([pages.length, drawings.length, revisions.length]).toEqual([7, 7, 7]);
  });

  it("maps from the canonical title and persisted included item, not worker scope", async () => {
    const { app, drawings, revisions } = setup();
    const leased = await claim(app);
    const body = completeBody();
    body.pages[0]!.sections = [{
      ...body.pages[0]!.sections[0]!,
      label: "TV UNIT - BEDROOM 1",
      proposal: {
        detectedTitle: "TV UNIT - BEDROOM 1",
        room: {
          id: "worker-room-that-does-not-exist",
          confidence: 0.99,
          evidence: ["worker guess"],
          ambiguous: false
        },
        scope: {
          id: "FC",
          confidence: 0.99,
          evidence: ["worker guess"],
          ambiguous: false
        }
      }
    }];

    const response = await complete(app, leased.body.data.claimToken, body);

    expect(response.status).toBe(200);
    expect(drawings[0]).toMatchObject({
      verified: false,
      roomId: "room-bedroom-1",
      catalogueId: "CA01",
      scopeSectionId: "CA",
      mappingStatus: "auto_mapped"
    });
    expect(revisions[0]).toMatchObject({
      roomId: "room-bedroom-1",
      catalogueId: "CA01",
      scopeSectionId: "CA",
      mappingStatus: "auto_mapped"
    });
  });

  it("completes extraction with a true-null Misc mapping when title mapping is ambiguous", async () => {
    const { app, jobs, drawings, revisions } = setup();
    const leased = await claim(app);
    const body = completeBody();
    body.pages[0]!.sections = [{
      ...body.pages[0]!.sections[0]!,
      label: "TV UNIT",
      proposal: {
        detectedTitle: "TV UNIT",
        room: { id: null, confidence: 0.2, evidence: [], ambiguous: true },
        scope: { id: null, confidence: 0.2, evidence: [], ambiguous: true }
      }
    }];

    const response = await complete(app, leased.body.data.claimToken, body);

    expect(response.status).toBe(200);
    expect(jobs[0]).toMatchObject({ status: "estimator_review" });
    expect(drawings[0]).toMatchObject({
      verified: false,
      roomId: null,
      catalogueId: null,
      scopeSectionId: null,
      mappingStatus: "misc"
    });
    expect(revisions[0]).toMatchObject({
      roomId: null,
      catalogueId: null,
      scopeSectionId: null,
      mappingStatus: "misc"
    });
  });

  it("completes an unidentified drawing as nonempty Misc for estimator correction", async () => {
    const { app, jobs, drawings, revisions } = setup();
    const leased = await claim(app);
    const body = completeBody();
    body.pages[0]!.sections = [{
      ...body.pages[0]!.sections[0]!,
      label: "Unidentified drawing — page 1",
      confidence: 0,
      proposal: {
        detectedTitle: "Unidentified drawing — page 1",
        room: { id: null, confidence: 0, evidence: [], ambiguous: true },
        scope: { id: null, confidence: 0, evidence: [], ambiguous: true }
      }
    }];

    const response = await complete(app, leased.body.data.claimToken, body);

    expect(response.status).toBe(200);
    expect(jobs[0]).toMatchObject({ status: "estimator_review" });
    expect(drawings[0]).toMatchObject({
      verified: false,
      detectedTitle: "Unidentified drawing — page 1",
      displayTitle: "Unidentified drawing — page 1",
      roomId: null,
      catalogueId: null,
      scopeSectionId: null,
      mappingStatus: "misc"
    });
    expect(revisions[0]).toMatchObject({
      roomId: null,
      catalogueId: null,
      scopeSectionId: null,
      mappingStatus: "misc"
    });
  });

  it("publishes every unidentified full page with a true-null Misc mapping", async () => {
    const { app, drawings, revisions } = setup();
    const leased = await claim(app);
    const body = completeBody(6);
    body.pages.forEach((page, index) => {
      const title = `Unidentified drawing — page ${index + 1}`;
      page.sections[0] = {
        ...page.sections[0]!,
        label: title,
        confidence: 0,
        proposal: {
          detectedTitle: title,
          room: { id: null, confidence: 0, evidence: [], ambiguous: false },
          scope: { id: null, confidence: 0, evidence: [], ambiguous: false }
        }
      };
    });

    const response = await complete(app, leased.body.data.claimToken, body);

    expect(response.status).toBe(200);
    expect(drawings).toHaveLength(6);
    expect(revisions).toHaveLength(6);
    for (const artifact of [...drawings, ...revisions]) {
      expect(artifact).toMatchObject({
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc"
      });
    }
  });

  it("maps repeated uniquely resolvable titles to the same complete tuple", async () => {
    const { app, drawings, revisions } = setup();
    const leased = await claim(app);
    const body = completeBody(2);
    for (const page of body.pages) {
      page.sections[0] = {
        ...page.sections[0]!,
        label: "TV UNIT BEDROOM 1",
        proposal: {
          ...page.sections[0]!.proposal,
          detectedTitle: "TV UNIT BEDROOM 1"
        }
      };
    }

    const response = await complete(app, leased.body.data.claimToken, body);

    expect(response.status).toBe(200);
    expect(drawings).toHaveLength(2);
    expect(revisions).toHaveLength(2);
    for (const artifact of [...drawings, ...revisions]) {
      expect(artifact).toMatchObject({
        roomId: "room-bedroom-1",
        scopeSectionId: "CA",
        catalogueId: "CA01",
        mappingStatus: "auto_mapped"
      });
    }
  });

  it.each([
    "Unidentified drawing — page 1",
    "SHEET WITH NO ESTIMATE ITEM",
    "TV UNIT"
  ])("publishes unresolved title %s as one true-null Misc drawing", async (title) => {
    const { app, drawings, revisions } = setup();
    const leased = await claim(app);
    const body = completeBody(1);
    body.pages[0]!.sections[0] = {
      ...body.pages[0]!.sections[0]!,
      label: title,
      proposal: {
        ...body.pages[0]!.sections[0]!.proposal,
        detectedTitle: title
      }
    };

    const response = await complete(app, leased.body.data.claimToken, body);

    expect(response.status).toBe(200);
    expect(drawings).toHaveLength(1);
    expect(revisions).toHaveLength(1);
    expect(drawings[0]).toMatchObject({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc"
    });
    expect(revisions[0]).toMatchObject({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc"
    });
  });

  it("atomically assigns an exact included estimate item and preserves verification", async () => {
    const { app, drawings, revisions, auditEvents } = setup();
    const leased = await claim(app);
    const body = completeBody();
    body.pages[0]!.sections[0] = {
      ...body.pages[0]!.sections[0]!,
      label: "TV UNIT",
      proposal: {
        detectedTitle: "TV UNIT",
        room: { id: null, confidence: 0.5, evidence: [], ambiguous: true },
        scope: { id: null, confidence: 0.5, evidence: [], ambiguous: true }
      }
    };
    await complete(app, leased.body.data.claimToken, body);
    const drawing = drawings.find((item) => item.detectedTitle === "TV UNIT")!;
    drawing.verified = true;

    const response = await owner(
      request(app).put(`/api/v1/estimate-design-drawings/${drawing._id}/estimate-item`)
    ).send({ version: 1, roomId: "room-bedroom-1", catalogueId: "CA01" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      verified: true,
      roomId: "room-bedroom-1",
      catalogueId: "CA01",
      scopeSectionId: "CA",
      mappingStatus: "estimator_assigned",
      revision: {
        revisionNumber: 2,
        roomId: "room-bedroom-1",
        catalogueId: "CA01",
        scopeSectionId: "CA",
        mappingStatus: "estimator_assigned",
        reviewStatus: "draft"
      }
    });
    expect(revisions.filter((item) => item.drawingId === drawing._id)).toHaveLength(2);
    expect(auditEvents).toContainEqual(expect.objectContaining({
      action: "estimate_design_item_assigned",
      entityId: drawing._id
    }));
  });

  it.each([
    { version: 1, roomId: "room-bedroom-1", catalogueId: "CA02" },
    { version: 1, roomId: "room-bedroom-1", catalogueId: "CA01", scopeSectionId: "FC" }
  ])("rejects an excluded item or client-authored scope without writes", async (body) => {
    const { app, drawings, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    const before = structuredClone({ drawings, revisions });

    const response = await owner(
      request(app).put(`/api/v1/estimate-design-drawings/${drawings[0]!._id}/estimate-item`)
    ).send(body);

    expect(response.status).toBe(400);
    expect({ drawings, revisions }).toEqual(before);
  });

  it("rejects a cross-room exact item pair without writes", async () => {
    const { app, estimates, drawings, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    estimates[0]!.lineItems.push({
      catalogueId: "CA02",
      roomName: "Bedroom 2",
      specification: "wardrobe",
      unit: "lot",
      rate: 1,
      quantity: 1,
      included: true,
      amount: 1
    });
    const before = structuredClone({ drawings, revisions });

    const response = await owner(
      request(app).put(`/api/v1/estimate-design-drawings/${drawings[0]!._id}/estimate-item`)
    ).send({ version: 1, roomId: "room-bedroom-1", catalogueId: "CA02" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ESTIMATE_DESIGN_ASSIGNMENT");
    expect({ drawings, revisions }).toEqual(before);
  });

  it("reports a stale exact assignment before evaluating a lifecycle lock", async () => {
    const { app, estimates, drawings, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    estimates[0]!.status = "sent_to_client";
    revisions.find((revision) => revision.drawingId === drawings[0]!._id)!.reviewStatus = "changes_requested";

    const response = await owner(
      request(app).put(`/api/v1/estimate-design-drawings/${drawings[0]!._id}/estimate-item`)
    ).send({ version: 2, roomId: "room-bedroom-1", catalogueId: "CA01" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("STALE_ESTIMATE_DRAWING");
  });

  it("lets the estimator crop a missing drawing from an owned normalized source page", async () => {
    const {
      app,
      storage,
      pages,
      drawings,
      revisions,
      auditEvents
    } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    const page = pages[0]!;

    const response = await owner(
      request(app).post(
        `/api/v1/estimate-design-source-pages/${page._id}/drawings`
      )
    ).send({
      displayTitle: "Living wardrobe",
      roomId: "room-bedroom-1",
      catalogueId: "CA01",
      crop: { x: 10, y: 15, width: 30, height: 20 }
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      source: "manual",
      active: true,
      verified: true,
      roomId: "room-bedroom-1",
      scopeSectionId: "CA",
      catalogueId: "CA01",
      mappingStatus: "estimator_assigned",
      displayTitle: "Living wardrobe",
      revision: {
        revisionNumber: 1,
        sourcePageId: page._id,
        crop: { x: 10, y: 15, width: 30, height: 20 },
        reviewStatus: "draft"
      }
    });
    const created = drawings.find(
      (drawing) => drawing.displayTitle === "Living wardrobe"
    )!;
    const revision = revisions.find(
      (candidate) => candidate.drawingId === created._id
    )!;
    const metadata = await sharp(
      await storage.read(revision.croppedFileReference)
    ).metadata();
    expect(metadata).toMatchObject({ width: 30, height: 20, format: "png" });
    expect(auditEvents).toContainEqual(expect.objectContaining({
      action: "estimate_design_manual_drawing_created",
      entityId: created._id
    }));
  });

  it("accepts a unique legacy room/scope manual request and rejects ambiguous legacy candidates", async () => {
    const { app, estimates, pages, drawings, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    const endpoint = `/api/v1/estimate-design-source-pages/${pages[0]!._id}/drawings`;
    const legacy = {
      displayTitle: "Bedroom TV unit",
      roomId: "room-bedroom-1",
      scopeSectionId: "CA",
      crop: { x: 10, y: 15, width: 30, height: 20 }
    };

    const unique = await owner(request(app).post(endpoint)).send(legacy);
    expect(unique.status).toBe(201);
    expect(unique.body.data).toMatchObject({
      roomId: "room-bedroom-1",
      catalogueId: "CA01",
      scopeSectionId: "CA",
      mappingStatus: "estimator_assigned"
    });

    estimates[0]!.lineItems.push({
      catalogueId: "CA04",
      roomName: "Bedroom 1",
      specification: "panel",
      unit: "lot",
      rate: 1,
      quantity: 1,
      included: true,
      amount: 1
    });
    const before = structuredClone({ drawings, revisions });
    const ambiguous = await owner(request(app).post(endpoint)).send({
      ...legacy,
      displayTitle: "Ambiguous bedroom item"
    });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error.code).toBe("EXACT_ESTIMATE_ITEM_REQUIRED");
    expect({ drawings, revisions }).toEqual(before);
  });

  it("resolves legacy PATCH mappings uniquely and rejects ambiguous pairs without selecting by order", async () => {
    const { app, estimates, drawings, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    const drawing = drawings[0]!;

    const unique = await owner(
      request(app).patch(`/api/v1/estimate-design-drawings/${drawing._id}`)
    ).send({ version: 1, roomId: "room-bedroom-1", scopeSectionId: "CA" });
    expect(unique.status).toBe(200);
    expect(unique.body.data).toMatchObject({
      roomId: "room-bedroom-1",
      scopeSectionId: "CA",
      catalogueId: "CA01",
      mappingStatus: "estimator_assigned"
    });

    estimates[0]!.lineItems.push({
      catalogueId: "CA04",
      roomName: "Bedroom 1",
      specification: "panel",
      unit: "lot",
      rate: 1,
      quantity: 1,
      included: true,
      amount: 1
    });
    const before = structuredClone({ drawings, revisions });
    const ambiguous = await owner(
      request(app).patch(`/api/v1/estimate-design-drawings/${drawing._id}`)
    ).send({ version: 2, roomId: "room-bedroom-1", scopeSectionId: "CA" });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error.code).toBe("EXACT_ESTIMATE_ITEM_REQUIRED");
    expect({ drawings, revisions }).toEqual(before);
  });

  it.each([
    [
      "unknown room",
      {
        displayTitle: "Missing drawing",
        roomId: "room-foreign",
        catalogueId: "CA01",
        crop: { x: 0, y: 0, width: 20, height: 10 }
      }
    ],
    [
      "disabled scope",
      {
        displayTitle: "Missing drawing",
        roomId: "room-bedroom-1",
        catalogueId: "CA02",
        crop: { x: 0, y: 0, width: 20, height: 10 }
      }
    ],
    [
      "out-of-bounds crop",
      {
        displayTitle: "Missing drawing",
        roomId: "room-bedroom-1",
        catalogueId: "CA01",
        crop: { x: 90, y: 0, width: 20, height: 10 }
      }
    ]
  ])("rejects a manual drawing with %s without partial publication", async (_case, body) => {
    const { app, pages, drawings, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    const drawingCount = drawings.length;
    const revisionCount = revisions.length;

    const response = await owner(
      request(app).post(
        `/api/v1/estimate-design-source-pages/${pages[0]!._id}/drawings`
      )
    ).send(body);

    expect(response.status).toBe(400);
    expect(drawings).toHaveLength(drawingCount);
    expect(revisions).toHaveLength(revisionCount);
  });

  it("returns not found for a guessed manual-crop source page", async () => {
    const { app, drawings, revisions } = setup();

    const response = await owner(
      request(app).post(
        "/api/v1/estimate-design-source-pages/page-foreign/drawings"
      )
    ).send({
      displayTitle: "Missing drawing",
      roomId: "room-bedroom-1",
      scopeSectionId: "FC",
      crop: { x: 0, y: 0, width: 20, height: 10 }
    });

    expect(response.status).toBe(404);
    expect(drawings).toEqual([]);
    expect(revisions).toEqual([]);
  });

  it("recovers a failed extraction with retained normalized pages through a manual crop", async () => {
    const { app, pages, uploads, jobs } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    Object.assign(uploads[0]!, {
      extractionStatus: "processing_failed",
      failureCode: "OCR_FAILED",
      failureMessage: "OCR failed."
    });
    Object.assign(jobs[0]!, {
      status: "processing_failed",
      failureCode: "OCR_FAILED",
      failureMessage: "OCR failed."
    });

    const response = await owner(
      request(app).post(
        `/api/v1/estimate-design-source-pages/${pages[0]!._id}/drawings`
      )
    ).send({
      displayTitle: "Manually recovered drawing",
      roomId: "room-bedroom-1",
      catalogueId: "CA01",
      crop: { x: 0, y: 0, width: 20, height: 10 }
    });

    expect(response.status).toBe(201);
    expect(uploads[0]).toMatchObject({
      extractionStatus: "estimator_review",
      failureCode: null,
      failureMessage: null
    });
    expect(jobs[0]).toMatchObject({
      status: "estimator_review",
      failureCode: null,
      failureMessage: null
    });
  });

  it.each([
    ["non-contiguous page numbers", (body: ReturnType<typeof completeBody>) => {
      body.pages[1]!.pageNumber = 3;
    }],
    ["zero sections", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.sections = [];
    }],
    ["multiple sections", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.sections.push(
        structuredClone(body.pages[0]!.sections[0]!)
      );
    }],
    ["partial crop", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.sections[0]!.crop.width = 99;
    }],
    ["different section bytes", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.sections[0]!.imageBase64 =
        PAGE_IMAGES[1]!.toString("base64");
    }]
  ])("rejects %s before publishing artifacts", async (_name, mutate) => {
    const { app, pages, drawings, revisions, storage } = setup();
    const leased = await claim(app);
    const body = completeBody(2);
    mutate(body);

    const response = await complete(app, leased.body.data.claimToken, body);

    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(pages).toEqual([]);
    expect(drawings).toEqual([]);
    expect(revisions).toEqual([]);
    expect([...storage.objects.keys()]).toEqual(["original-plan.pdf"]);
  });

  it.each([
    ["out-of-bounds crop", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.sections[0]!.crop.x = 90;
    }],
    ["duplicate page", (body: ReturnType<typeof completeBody>) => {
      body.pages[1]!.pageNumber = 1;
    }],
    ["oversized output", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.imageBase64 = Buffer.alloc(10_000_001).toString("base64");
    }]
  ])("rejects legacy malformed case %s without partial publication", async (_case, mutate) => {
    const { app, pages, drawings, revisions } = setup();
    const leased = await claim(app);
    const body = completeBody();
    mutate(body);

    const response = await complete(app, leased.body.data.claimToken, body);

    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(pages).toEqual([]);
    expect(drawings).toEqual([]);
    expect(revisions).toEqual([]);
  });

  it("rejects a wrong estimate claim token without partial publication", async () => {
    const { app, pages, drawings, revisions } = setup();
    await claim(app);

    const response = await complete(app, "wrong-claim");

    expect(response.status).toBe(409);
    expect(pages).toEqual([]);
    expect(drawings).toEqual([]);
    expect(revisions).toEqual([]);
  });

  it("conflicts completion when included estimate lines change after preflight", async () => {
    const { app, estimates, pages, drawings, revisions, session, runTransaction } = setup();
    const leased = await claim(app);
    session.withTransaction.mockImplementationOnce(async (operation) => {
      estimates[0]!.lineItems[0]!.included = false;
      return runTransaction(operation);
    });

    const response = await complete(app, leased.body.data.claimToken);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ESTIMATE_EXTRACTION_STATE_CONFLICT");
    expect(pages).toEqual([]);
    expect(drawings).toEqual([]);
    expect(revisions).toEqual([]);
  });

  it("marks the estimate job and upload failed in one transaction", async () => {
    const { app, jobs, uploads, session } = setup();
    const leased = await claim(app);
    session.withTransaction.mockClear();

    const response = await worker(
      request(app).post(
        "/api/v1/internal/extraction-jobs/estimate-job-1/fail"
      )
    )
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send({ code: "OCR_FAILED", message: "OCR engine failed." });

    expect(response.status).toBe(200);
    expect(jobs[0]).toMatchObject({
      status: "processing_failed",
      failureCode: "OCR_FAILED",
      claimId: null
    });
    expect(uploads[0]).toMatchObject({
      extractionStatus: "processing_failed",
      failureCode: "OCR_FAILED"
    });
    expect(session.withTransaction).toHaveBeenCalledOnce();
  });

  it("cleans only newly generated artifacts after storage failure and leaves the job retryable", async () => {
    const { app, storage, jobs, pages, drawings, revisions } = setup();
    const leased = await claim(app);
    const saveGenerated = storage.saveGenerated.bind(storage);
    let saves = 0;
    vi.spyOn(storage, "saveGenerated").mockImplementation(async (input) => {
      saves += 1;
      if (saves === 2) throw new Error("simulated storage outage");
      return saveGenerated(input);
    });

    const response = await complete(
      app,
      leased.body.data.claimToken,
      completeBody()
    );

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("FILE_STORAGE_ERROR");
    expect([...storage.objects.keys()]).toEqual(["original-plan.pdf"]);
    expect(storage.deleted).toHaveLength(1);
    expect(pages).toEqual([]);
    expect(drawings).toEqual([]);
    expect(revisions).toEqual([]);
    expect(jobs[0]).toMatchObject({
      status: "processing",
      claimId: leased.body.data.claimToken
    });
  });

  it("cleans generated artifacts after a transaction failure without publishing metadata", async () => {
    const { app, storage, jobs, pages, drawings, revisions } = setup();
    const leased = await claim(app);
    vi.mocked(EstimateDesignDrawingModel.create).mockRejectedValueOnce(
      new Error("simulated database failure")
    );

    const response = await complete(
      app,
      leased.body.data.claimToken,
      completeBody()
    );

    expect(response.status).toBe(500);
    expect([...storage.objects.keys()]).toEqual(["original-plan.pdf"]);
    expect(storage.deleted).toHaveLength(4);
    expect(pages).toEqual([]);
    expect(drawings).toEqual([]);
    expect(revisions).toEqual([]);
    expect(jobs[0]).toMatchObject({
      status: "processing",
      claimId: leased.body.data.claimToken
    });
  });

  it("rolls back completion when the upload transition no longer matches", async () => {
    const { app, jobs, uploads, pages, drawings, revisions } = setup();
    const leased = await claim(app);
    vi.mocked(EstimateDesignUploadModel.updateOne).mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null
    });

    const response = await complete(app, leased.body.data.claimToken);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ESTIMATE_EXTRACTION_STATE_CONFLICT");
    expect(pages).toEqual([]);
    expect(drawings).toEqual([]);
    expect(revisions).toEqual([]);
    expect(jobs[0]).toMatchObject({
      status: "processing",
      claimId: leased.body.data.claimToken
    });
    expect(uploads[0]).toMatchObject({ extractionStatus: "processing" });
  });

  it("rolls back failure when the upload transition no longer matches", async () => {
    const { app, jobs, uploads } = setup();
    const leased = await claim(app);
    vi.mocked(EstimateDesignUploadModel.updateOne).mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null
    });

    const response = await worker(
      request(app).post("/api/v1/internal/extraction-jobs/estimate-job-1/fail")
    )
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send({ code: "OCR_FAILED", message: "OCR engine failed." });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ESTIMATE_EXTRACTION_STATE_CONFLICT");
    expect(jobs[0]).toMatchObject({
      status: "processing",
      claimId: leased.body.data.claimToken,
      failureCode: null
    });
    expect(uploads[0]).toMatchObject({
      extractionStatus: "processing",
      failureCode: null
    });
  });

  it("creates a new immutable draft revision for estimator corrections", async () => {
    const { app, drawings, revisions, auditEvents } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    const drawing = drawings[0]!;

    const response = await owner(
      request(app).patch(`/api/v1/estimate-design-drawings/${drawing._id}`)
    ).send({
      version: 1,
      displayTitle: "Living Room RCP",
      roomId: "room-bedroom-1",
      catalogueId: "CA01",
      crop: { x: 10, y: 10, width: 20, height: 10 },
      verified: true
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      displayTitle: "Living Room RCP",
      roomId: "room-bedroom-1",
      scopeSectionId: "CA",
      catalogueId: "CA01",
      mappingStatus: "estimator_assigned",
      verified: true,
      revision: { revisionNumber: 2, reviewStatus: "draft" }
    });
    expect(revisions.filter((revision) => revision.drawingId === drawing._id))
      .toHaveLength(2);
    expect(revisions.find((revision) => revision.revisionNumber === 1)?.crop)
      .toEqual({ x: 0, y: 0, width: 100, height: 80 });
    expect(auditEvents).toContainEqual(expect.objectContaining({
      action: "estimate_design_mapping_corrected",
      entityId: drawing._id,
      oldValues: expect.objectContaining({
        roomId: "room-bedroom-1",
        scopeSectionId: "CA",
        catalogueId: "CA01",
        mappingStatus: "estimator_assigned"
      }),
      newValues: expect.objectContaining({
        roomId: "room-bedroom-1",
        scopeSectionId: "CA",
        catalogueId: "CA01",
        mappingStatus: "estimator_assigned"
      })
    }));
  });

  it("rejects stale corrections and edits to approved drawings", async () => {
    const { app, drawings, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    const drawing = drawings[0]!;

    const stale = await owner(
      request(app).patch(`/api/v1/estimate-design-drawings/${drawing._id}`)
    ).send({ version: 2, displayTitle: "stale" });
    expect(stale.status).toBe(409);

    revisions.find((revision) => revision.drawingId === drawing._id)!.reviewStatus = "approved";
    const approved = await owner(
      request(app).patch(`/api/v1/estimate-design-drawings/${drawing._id}`)
    ).send({ version: 1, displayTitle: "cannot edit" });
    expect(approved.status).toBe(409);
  });

  it("submits unverified mapped and true-null Misc draft drawings", async () => {
    const { app, drawings, revisions, uploads, jobs } = setup();
    const leased = await claim(app);
    const body = completeBody(2);
    Object.assign(body.pages[0]!.sections[0]!, {
      label: "TV UNIT - BEDROOM 1",
      proposal: {
        detectedTitle: "TV UNIT - BEDROOM 1",
        room: {
          id: "room-bedroom-1",
          confidence: 0.99,
          evidence: ["bedroom 1"],
          ambiguous: false
        },
        scope: {
          id: "CA",
          confidence: 0.99,
          evidence: ["TV UNIT"],
          ambiguous: false
        }
      }
    });
    const unidentified = "Unidentified drawing — page 2";
    Object.assign(body.pages[1]!.sections[0]!, {
      label: unidentified,
      confidence: 0,
      proposal: {
        detectedTitle: unidentified,
        room: {
          id: null,
          confidence: 0,
          evidence: [],
          ambiguous: false
        },
        scope: {
          id: null,
          confidence: 0,
          evidence: [],
          ambiguous: false
        }
      }
    });

    expect((await complete(
      app,
      leased.body.data.claimToken,
      body
    )).status).toBe(200);
    expect(drawings.every((drawing) => drawing.verified === false)).toBe(true);

    const submitted = await owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    ).send();
    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toEqual({ submittedCount: 2 });
    expect(uploads[0]).toMatchObject({ extractionStatus: "submitted" });
    expect(jobs[0]).toMatchObject({ status: "submitted" });
    expect(revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc",
        reviewStatus: "submitted"
      })
    ]));
  });

  it("submits draft drawings without changing a processing upload or job", async () => {
    const { app, drawings, revisions, uploads, jobs } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken, completeBody(2));
    uploads[0]!.extractionStatus = "processing";
    jobs[0]!.status = "processing";

    const submitted = await owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    ).send();

    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toEqual({ submittedCount: 2 });
    expect(drawings.every((drawing) => drawing.verified === false)).toBe(true);
    expect(revisions.every(
      (revision) => revision.reviewStatus === "submitted"
    )).toBe(true);
    expect(uploads[0]).toMatchObject({ extractionStatus: "processing" });
    expect(jobs[0]).toMatchObject({ status: "processing" });
  });

  it("returns zero on a safe repeat without overwriting submitted revisions", async () => {
    const { app, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken, completeBody(2));

    const first = await owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    ).send();
    expect(first.status).toBe(200);

    const repeated = await owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    ).send();

    expect(repeated.status).toBe(200);
    expect(repeated.body.data).toEqual({ submittedCount: 0 });
    expect(revisions.every((revision) => revision.reviewStatus === "submitted"))
      .toBe(true);

    revisions[0]!.reviewStatus = "approved";
    revisions[1]!.reviewStatus = "changes_requested";
    const nonDraftRepeat = await owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    ).send();

    expect(nonDraftRepeat.status).toBe(200);
    expect(nonDraftRepeat.body.data).toEqual({ submittedCount: 0 });
    expect(revisions.map((revision) => revision.reviewStatus)).toEqual([
      "approved",
      "changes_requested"
    ]);
  });

  it("rejects submission when active drawings have no current revision", async () => {
    const { app, drawings, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken, completeBody(2));
    const missingRevisionDrawingId = drawings[1]!._id;
    revisions.splice(
      revisions.findIndex((revision) =>
        revision.drawingId === missingRevisionDrawingId
      ),
      1
    );

    const response = await owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    ).send();

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ESTIMATE_DRAWINGS_INCOMPLETE");
  });

  it("rejects empty, incoherent, unowned, and locked submissions", async () => {
    const emptySetup = setup();
    const empty = await owner(
      request(emptySetup.app).post(
        "/api/v1/estimates/estimate-1/design-drawings/submit"
      )
    ).send();
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe("ESTIMATE_DRAWINGS_EMPTY");

    const incoherentSetup = setup();
    const leased = await claim(incoherentSetup.app);
    await complete(
      incoherentSetup.app,
      leased.body.data.claimToken,
      completeBody(2)
    );
    Object.assign(incoherentSetup.drawings[0]!, {
      roomId: "room-bedroom-1",
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "auto_mapped"
    });
    const incoherent = await owner(
      request(incoherentSetup.app).post(
        "/api/v1/estimates/estimate-1/design-drawings/submit"
      )
    ).send();
    expect(incoherent.status).toBe(500);
    expect(incoherent.body.error.code).toBe("INTERNAL_ERROR");
    expect(incoherentSetup.revisions.every(
      (revision) => revision.reviewStatus === "draft"
    )).toBe(true);

    incoherentSetup.estimates[0]!.ownerId = "user-other-estimator";
    const foreignOwner = await owner(
      request(incoherentSetup.app).post(
        "/api/v1/estimates/estimate-1/design-drawings/submit"
      )
    ).send();
    expect(foreignOwner.status).toBe(404);
    expect(foreignOwner.body.error.code).toBe("ESTIMATE_NOT_FOUND");

    incoherentSetup.estimates[0]!.ownerId = "user-estimator-sales";
    incoherentSetup.estimates[0]!.status = "client_approved";
    const locked = await owner(
      request(incoherentSetup.app).post(
        "/api/v1/estimates/estimate-1/design-drawings/submit"
      )
    ).send();
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("ESTIMATE_DESIGN_LOCKED");
  });

  it.each(["upload", "job"] as const)(
    "rolls back submission when the required %s transition no longer matches",
    async (transition) => {
      const { app, uploads, jobs, drawings, revisions } = setup();
      const leased = await claim(app);
      await complete(app, leased.body.data.claimToken);
      await verifyDrawings(app, drawings);
      const before = structuredClone(revisions);
      const result = {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null
      };
      if (transition === "upload") {
        vi.mocked(EstimateDesignUploadModel.updateOne).mockResolvedValueOnce(result);
      } else {
        vi.mocked(EstimateDesignExtractionJobModel.updateOne).mockResolvedValueOnce(result);
      }

      const response = await owner(
        request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
      ).send();

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("ESTIMATE_EXTRACTION_STATE_CONFLICT");
      expect(revisions).toEqual(before);
      expect(uploads[0]).toMatchObject({ extractionStatus: "estimator_review" });
      expect(jobs[0]).toMatchObject({ status: "estimator_review" });
    }
  );

  it("rejects an edit that reaches its transaction after submission commits", async () => {
    const { app, drawings, revisions, uploads, jobs, session, runTransaction } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    await verifyDrawings(app, drawings);
    const drawing = drawings[0]!;
    const editReachedTransaction = deferred();
    const allowEditTransaction = deferred();
    session.withTransaction.mockImplementationOnce(async (operation) => {
      editReachedTransaction.resolve();
      await allowEditTransaction.promise;
      return runTransaction(operation);
    });

    const editPromise = owner(
      request(app).patch(`/api/v1/estimate-design-drawings/${drawing._id}`)
    )
      .send({ version: 2, displayTitle: "Late edit" })
      .then((response) => response);
    await editReachedTransaction.promise;

    const submitted = await owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    ).send();
    allowEditTransaction.resolve();
    const edited = await editPromise;

    expect(submitted.status).toBe(200);
    expect(edited.status).toBe(409);
    expect(edited.body.error.code).toBe("ESTIMATE_DRAWING_LOCKED");
    expect(revisions.filter((item) => item.drawingId === drawing._id)).toHaveLength(2);
    expect(revisions.find((item) => item.drawingId === drawing._id && item.revisionNumber === 2))
      .toMatchObject({ revisionNumber: 2, reviewStatus: "submitted" });
    expect(uploads[0]).toMatchObject({ extractionStatus: "submitted" });
    expect(jobs[0]).toMatchObject({ status: "submitted" });
  });

  it("rejects submission when a verified edit commits after submit preflight", async () => {
    const { app, drawings, revisions, uploads, jobs, session, runTransaction } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    await verifyDrawings(app, drawings);
    const drawing = drawings[0]!;
    const submitReachedTransaction = deferred();
    const allowSubmitTransaction = deferred();
    session.withTransaction.mockImplementationOnce(async (operation) => {
      submitReachedTransaction.resolve();
      await allowSubmitTransaction.promise;
      return runTransaction(operation);
    });

    const submitPromise = owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    )
      .send()
      .then((response) => response);
    await submitReachedTransaction.promise;

    const edited = await owner(
      request(app).patch(`/api/v1/estimate-design-drawings/${drawing._id}`)
    ).send({ version: 2, displayTitle: "Concurrent verified edit" });
    allowSubmitTransaction.resolve();
    const submitted = await submitPromise;

    const drawingRevisions = revisions
      .filter((item) => item.drawingId === drawing._id)
      .sort((left, right) => left.revisionNumber - right.revisionNumber);
    expect(edited.status).toBe(200);
    expect(submitted.status).toBe(409);
    expect(submitted.body.error.code).toBe("STALE_ESTIMATE_DRAWING");
    expect(drawing.verified).toBe(true);
    expect(drawingRevisions).toHaveLength(3);
    expect(drawingRevisions[2]).toMatchObject({
      revisionNumber: 3,
      reviewStatus: "draft"
    });
    expect(uploads[0]).toMatchObject({ extractionStatus: "estimator_review" });
    expect(jobs[0]).toMatchObject({ status: "estimator_review" });
  });

  it("terminally cancels worker publication that reaches its transaction after final approval freezes design", async () => {
    const {
      app,
      repository,
      storage,
      estimates,
      pages,
      drawings,
      revisions,
      uploads,
      jobs,
      session,
      runTransaction
    } = setup();
    const leased = await claim(app);
    session.withTransaction.mockImplementationOnce(async (operation) => {
      estimates[0]!.status = "client_approved";
      estimates[0]!.designLifecycleVersion = 1;
      estimates[0]!.designFrozenAt = NOW;
      return runTransaction(operation);
    });

    const response = await complete(app, leased.body.data.claimToken);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: "estimate-job-1",
      status: "processing_failed"
    });
    expect(pages).toEqual([]);
    expect(drawings).toEqual([]);
    expect(revisions).toEqual([]);
    expect(uploads[0]).toMatchObject({
      extractionStatus: "processing_failed",
      failureCode: "ESTIMATE_DESIGN_FROZEN"
    });
    expect(jobs[0]).toMatchObject({
      status: "processing_failed",
      claimId: null,
      leaseExpiresAt: null,
      failureCode: "ESTIMATE_DESIGN_FROZEN"
    });
    expect([...storage.objects.keys()]).toEqual(["original-plan.pdf"]);

    await repository.enqueueExtractionJob({
      id: "project-after-frozen-estimate",
      designVersionId: "version-aurora-plan-1",
      status: "queued",
      attemptCount: 0,
      queuedAt: "2026-07-30T11:30:00.000Z",
      nextAttemptAt: "2026-07-30T11:30:00.000Z",
      claimGeneration: 0,
      startedAt: null,
      completedAt: null,
      leaseExpiresAt: null,
      failureCode: null,
      failureMessage: null
    });
    const later = await claim(app);
    expect(later.status).toBe(200);
    expect(later.body.data).toMatchObject({
      kind: "project_design",
      id: "project-after-frozen-estimate"
    });
    expect(jobs[0]!.attemptCount).toBe(1);
  });
});
