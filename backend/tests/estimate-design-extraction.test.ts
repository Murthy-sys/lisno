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
let CROP: Buffer;

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
      { id: "room-living", label: "Living Room", aliases: ["living hall"] },
      { id: "room-bed", label: "Bedroom", aliases: ["bed room"] }
    ],
    scopes: ["FC", "EL"]
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
  vi.spyOn(EstimateDesignSourcePageModel, "create").mockImplementation(async (input) => {
    pages.push(...(input as Array<Record<string, any>>));
    return input as never;
  });
  vi.spyOn(EstimateDesignSourcePageModel, "find").mockReturnValue(query(pages) as never);
  vi.spyOn(EstimateDesignSourcePageModel, "findById").mockImplementation((id) =>
    query(pages.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignDrawingModel, "create").mockImplementation(async (input) => {
    drawings.push(...(input as Array<Record<string, any>>));
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
  vi.spyOn(EstimateDesignRevisionModel, "create").mockImplementation(async (input) => {
    revisions.push(...(input as Array<Record<string, any>>));
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

function proposal(
  pageNumber: number,
  label: string,
  roomId: string | null,
  scopeId: string | null,
  confidence = 0.95
) {
  return {
    label,
    confidence,
    crop: { x: 5, y: 6, width: 20, height: 10 },
    imageBase64: CROP.toString("base64"),
    proposal: {
      detectedTitle: label,
      room: { id: roomId, confidence, evidence: [label], ambiguous: roomId === null },
      scope: { id: scopeId, confidence, evidence: [label], ambiguous: scopeId === null }
    },
    pageNumber
  };
}

function completeBody() {
  const proposals = [
    proposal(1, "Living false ceiling", "room-living", "FC"),
    proposal(1, "Living electrical", "room-living", "EL"),
    proposal(2, "Bedroom false ceiling", "room-bed", "FC"),
    proposal(2, "Bedroom electrical", "room-bed", "EL")
  ];
  return {
    kind: "estimate_design",
    resultId: "estimate-result-1",
    pages: [1, 2].map((pageNumber) => ({
      pageNumber,
      width: 100,
      height: 80,
      imageBase64: (pageNumber === 1 ? PAGE_ONE : PAGE_TWO).toString("base64"),
      sections: proposals
        .filter((item) => item.pageNumber === pageNumber)
        .map(({ pageNumber: _ignored, ...item }) => item)
    }))
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

beforeAll(async () => {
  PAGE_ONE = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#ffffff" }
  }).png().toBuffer();
  PAGE_TWO = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#eeeeee" }
  }).png().toBuffer();
  CROP = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "#dddddd" }
  }).png().toBuffer();
});

afterEach(() => vi.restoreAllMocks());

describe("estimate design extraction and estimator verification", () => {
  it("allows a retry to receive a new queue-order timestamp", () => {
    const originalQueuedAt = new Date("2026-07-30T11:00:00.000Z");
    const retriedAt = new Date("2026-07-30T12:00:00.000Z");
    const job = EstimateDesignExtractionJobModel.hydrate({
      _id: "estimate-job-retry-order",
      uploadId: "upload-retry-order",
      status: "processing_failed",
      attemptCount: 1,
      queuedAt: originalQueuedAt
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

  it("claims the estimate taxonomy and atomically publishes every proposed drawing", async () => {
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
          { id: "room-living", label: "Living Room", aliases: ["living hall"] },
          { id: "room-bed", label: "Bedroom", aliases: ["bed room"] }
        ],
        scopes: [
          { id: "FC", label: "False Ceiling" },
          { id: "EL", label: "Electrical" }
        ]
      }
    });
    expect(leased.body.data.sourceUrl).not.toContain(leased.body.data.claimToken);

    const response = await complete(app, leased.body.data.claimToken);

    expect(response.status).toBe(200);
    expect(pages).toHaveLength(2);
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
      roomId: "room-living",
      scopeSectionId: "FC",
      crop: { x: 10, y: 15, width: 30, height: 20 }
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      source: "manual",
      active: true,
      verified: true,
      roomId: "room-living",
      scopeSectionId: "FC",
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

  it.each([
    [
      "unknown room",
      {
        displayTitle: "Missing drawing",
        roomId: "room-foreign",
        scopeSectionId: "FC",
        crop: { x: 0, y: 0, width: 20, height: 10 }
      }
    ],
    [
      "disabled scope",
      {
        displayTitle: "Missing drawing",
        roomId: "room-living",
        scopeSectionId: "PA",
        crop: { x: 0, y: 0, width: 20, height: 10 }
      }
    ],
    [
      "out-of-bounds crop",
      {
        displayTitle: "Missing drawing",
        roomId: "room-living",
        scopeSectionId: "FC",
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
      roomId: "room-living",
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
      roomId: "room-living",
      scopeSectionId: "FC",
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
    ["unknown room", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.sections[0]!.proposal.room.id = "room-foreign";
    }],
    ["disabled scope", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.sections[0]!.proposal.scope.id = "PA";
    }],
    ["out-of-bounds crop", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.sections[0]!.crop.x = 90;
    }],
    ["duplicate page", (body: ReturnType<typeof completeBody>) => {
      body.pages[1]!.pageNumber = 1;
    }],
    ["oversized output", (body: ReturnType<typeof completeBody>) => {
      body.pages[0]!.imageBase64 = Buffer.alloc(10_000_001).toString("base64");
    }]
  ])("rejects %s without partial publication", async (_case, mutate) => {
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
    expect(storage.deleted).toHaveLength(6);
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
    const { app, drawings, revisions } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
    const drawing = drawings[0]!;

    const response = await owner(
      request(app).patch(`/api/v1/estimate-design-drawings/${drawing._id}`)
    ).send({
      version: 1,
      displayTitle: "Living Room RCP",
      roomId: "room-living",
      scopeSectionId: "FC",
      crop: { x: 10, y: 10, width: 20, height: 10 },
      verified: true
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      displayTitle: "Living Room RCP",
      roomId: "room-living",
      scopeSectionId: "FC",
      verified: true,
      revision: { revisionNumber: 2, reviewStatus: "draft" }
    });
    expect(revisions.filter((revision) => revision.drawingId === drawing._id))
      .toHaveLength(2);
    expect(revisions.find((revision) => revision.revisionNumber === 1)?.crop)
      .toEqual({ x: 5, y: 6, width: 20, height: 10 });
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

  it("requires explicit verification before submitting an ambiguous drawing", async () => {
    const { app, drawings, jobs } = setup();
    const leased = await claim(app);
    const body = completeBody();
    const { pageNumber: _ignored, ...uncertainProposal } = proposal(
      1,
      "Uncertain ceiling",
      null,
      "FC",
      0.5
    );
    body.pages[0]!.sections[0] = uncertainProposal;
    await complete(app, leased.body.data.claimToken, body);

    const blocked = await owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    ).send();
    expect(blocked.status).toBe(409);

    const uncertain = drawings.find((drawing) => drawing.detectedTitle === "Uncertain ceiling")!;
    const corrected = await owner(
      request(app).patch(`/api/v1/estimate-design-drawings/${uncertain._id}`)
    ).send({
      version: 1,
      roomId: "room-living",
      scopeSectionId: "FC",
      verified: true
    });
    expect(corrected.status).toBe(200);

    const submitted = await owner(
      request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
    ).send();
    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toMatchObject({ submittedCount: 4 });
    expect(jobs[0]).toMatchObject({ status: "submitted" });
  });

  it.each(["upload", "job"] as const)(
    "rolls back submission when the required %s transition no longer matches",
    async (transition) => {
      const { app, uploads, jobs, revisions } = setup();
      const leased = await claim(app);
      await complete(app, leased.body.data.claimToken);
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
      .send({ version: 1, displayTitle: "Late edit" })
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
    expect(revisions.filter((item) => item.drawingId === drawing._id)).toHaveLength(1);
    expect(revisions.find((item) => item.drawingId === drawing._id))
      .toMatchObject({ revisionNumber: 1, reviewStatus: "submitted" });
    expect(uploads[0]).toMatchObject({ extractionStatus: "submitted" });
    expect(jobs[0]).toMatchObject({ status: "submitted" });
  });

  it("rejects submission when a verified edit commits after submit preflight", async () => {
    const { app, drawings, revisions, uploads, jobs, session, runTransaction } = setup();
    const leased = await claim(app);
    await complete(app, leased.body.data.claimToken);
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
    ).send({ version: 1, displayTitle: "Concurrent verified edit" });
    allowSubmitTransaction.resolve();
    const submitted = await submitPromise;

    const drawingRevisions = revisions
      .filter((item) => item.drawingId === drawing._id)
      .sort((left, right) => left.revisionNumber - right.revisionNumber);
    expect(edited.status).toBe(200);
    expect(submitted.status).toBe(409);
    expect(submitted.body.error.code).toBe("STALE_ESTIMATE_DRAWING");
    expect(drawing.verified).toBe(true);
    expect(drawingRevisions).toHaveLength(2);
    expect(drawingRevisions[1]).toMatchObject({
      revisionNumber: 2,
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
