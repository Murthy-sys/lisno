import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimatePlanChangeRequestModel } from "../src/models/EstimatePlanChangeRequest.js";
import { EstimatePlanPageRevisionModel } from "../src/models/EstimatePlanPageRevision.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { createEstimateDesignService } from "../src/services/estimate-design.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-09-21T08:00:00.000Z");
const designer = {
  id: "designer-request-replacement",
  name: "Designer",
  email: "designer-request-replacement@example.test",
  role: "designer"
} as const;
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let png: Buffer;

class TestStorage {
  sequence = 0;
  objects = new Map<string, Buffer>();
  deleted: string[] = [];
  failDelete = false;

  async save(input: { data: Buffer; extension: string }) {
    const reference = `source-${++this.sequence}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async saveGenerated(input: { data: Buffer; extension: string }) {
    const reference = `generated-${++this.sequence}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async read(reference: string) {
    const value = this.objects.get(reference);
    if (!value) throw new Error("missing storage object");
    return Buffer.from(value);
  }

  async open(reference: string) {
    const { Readable } = await import("node:stream");
    return Readable.from(await this.read(reference));
  }

  async delete(reference: string) {
    if (this.failDelete) throw new Error("injected cleanup failure");
    this.deleted.push(reference);
    this.objects.delete(reference);
  }
}

beforeAll(async () => {
  replica = await startMongoReplicaSet("estimate-plan-request-replacement-tests");
  for (const model of [
    UserModel,
    EstimateModel,
    LeadModel,
    ProjectModel,
    EstimateDesignUploadModel,
    EstimateDesignSourcePageModel,
    EstimateDesignDrawingModel,
    EstimateDesignRevisionModel,
    EstimateDesignExtractionJobModel,
    EstimatePlanChangeRequestModel,
    EstimatePlanPageRevisionModel
  ]) await model.syncIndexes();
  png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "white" }
  }).png().toBuffer();
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterAll(async () => {
  await replica.stop();
});

async function setup(options: {
  detectedTitle?: string;
  displayTitle?: string;
  revisionLabel?: string;
} = {}) {
  const storage = new TestStorage();
  storage.objects.set("original-page.png", png);
  const audit = {
    append: vi.fn(async () => ({ id: "audit" })),
    appendInMongoTransaction: vi.fn(async () => ({ id: "audit" }))
  };
  const service = createEstimateDesignService({
    storage: storage as never,
    audit: audit as never,
    maxUploadBytes: 1_000_000,
    now: () => NOW
  });
  await UserModel.create({
    _id: designer.id,
    name: designer.name,
    email: designer.email,
    emailNormalized: designer.email,
    passwordHash: "unused",
    role: designer.role,
    active: true,
    accountKind: "standard"
  });
  await LeadModel.create({
    _id: "lead-request-replacement",
    projectId: "project-request-replacement",
    ownerId: "sales-owner",
    clientName: "Client",
    clientEmail: "client-request-replacement@example.test",
    clientMobile: "9000000000",
    projectName: "Request replacement residence",
    location: "Pune",
    propertyType: "Villa",
    source: "direct",
    stage: "won",
    nextAction: "Design",
    nextActionAt: NOW
  });
  await ProjectModel.create({
    _id: "project-request-replacement",
    name: "Request replacement residence",
    clientName: "Client",
    clientEmail: "client-request-replacement@example.test",
    clientEmailNormalized: "client-request-replacement@example.test",
    clientMobile: "9000000000",
    clientAddress: "Pune",
    assignedDesignerIds: [designer.id],
    status: "active",
    location: "Pune",
    plannedStartAt: NOW,
    plannedEndAt: new Date("2026-12-31T00:00:00.000Z")
  });
  await EstimateModel.create({
    _id: "estimate-request-replacement",
    leadId: "lead-request-replacement",
    projectId: "project-request-replacement",
    ownerId: "sales-owner",
    status: "client_approved",
    propertyType: "Villa",
    designPlanDesignerId: designer.id,
    designPlanStatus: "changes_requested",
    designPlanVersion: 1,
    designLifecycleVersion: 0,
    rooms: [],
    scopes: [],
    lineItems: []
  });
  await EstimateDesignUploadModel.create({
    _id: "ordinary-upload",
    estimateId: "estimate-request-replacement",
    leadId: "lead-request-replacement",
    originalFilename: "original.pdf",
    storedFileReference: "original.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    uploaderId: designer.id,
    uploadedAt: NOW,
    extractionStatus: "changes_requested",
    purpose: "ordinary"
  });
  await EstimateDesignExtractionJobModel.create({
    _id: "ordinary-job",
    uploadId: "ordinary-upload",
    status: "changes_requested",
    attemptCount: 1,
    queuedAt: NOW,
    completedAt: NOW
  });
  await EstimateDesignSourcePageModel.create({
    _id: "original-page",
    uploadId: "ordinary-upload",
    pageNumber: 1,
    normalizedFileReference: "original-page.png",
    width: 100,
    height: 100
  });
  await EstimateDesignDrawingModel.create({
    _id: "requested-drawing",
    uploadId: "ordinary-upload",
    sourcePageId: "original-page",
    estimateId: "estimate-request-replacement",
    active: true,
    verified: true,
    detectedTitle: options.detectedTitle ?? "LIVING ROOM FLOOR PLAN",
    displayTitle: options.displayTitle ?? "Living Room Floor Plan",
    source: "ocr",
    mappingStatus: "misc"
  });
  await EstimateDesignRevisionModel.create({
    _id: "requested-revision",
    drawingId: "requested-drawing",
    revisionNumber: 1,
    sourcePageId: "original-page",
    crop: { x: 0, y: 0, width: 100, height: 100 },
    croppedFileReference: "original-page.png",
    label: options.revisionLabel ?? "Living Room Floor Plan",
    mappingStatus: "misc",
    reviewStatus: "changes_requested",
    replacementUploadId: null
  });
  await EstimatePlanPageRevisionModel.create({
    _id: "original-plan-page-revision",
    estimateId: "estimate-request-replacement",
    sourcePageId: "original-page",
    revisionNumber: 1,
    basePageReference: "original-page.png",
    status: "changes_requested",
    patches: [{
      drawingId: "requested-drawing",
      drawingRevisionId: "requested-revision",
      crop: { x: 0, y: 0, width: 100, height: 100 },
      order: 0
    }],
    previousRevisionId: null,
    createdBy: "client"
  });
  await EstimatePlanChangeRequestModel.create({
    _id: "plan-request",
    estimateId: "estimate-request-replacement",
    uploadId: "ordinary-upload",
    sourcePageId: "original-page",
    clientId: "client",
    idempotencyKey: "client-request-key",
    version: 1,
    summary: "Revise the marked living room page",
    annotations: {
      schemaVersion: 1,
      imageWidth: 100,
      imageHeight: 100,
      elements: []
    },
    targets: [{
      drawingId: "requested-drawing",
      requestedRevisionId: "requested-revision",
      status: "open",
      resolvedByRevisionId: null
    }],
    unassigned: false,
    status: "open"
  });
  return { service, storage, audit };
}

function uploadInput(idempotencyKey = "designer-replacement-key") {
  return {
    version: 1,
    idempotencyKey,
    file: {
      data: png,
      extension: ".png",
      originalFilename: "revised-plan.png",
      mimeType: "image/png" as const,
      sizeBytes: png.length
    }
  };
}

function workerPage(pageNumber: number, title: string) {
  return {
    pageNumber,
    width: 20,
    height: 20,
    imageBase64: png.toString("base64"),
    sections: [{
      label: title,
      confidence: 0.95,
      crop: { x: 0, y: 0, width: 20, height: 20 },
      imageBase64: png.toString("base64"),
      proposal: {
        detectedTitle: title,
        room: { id: null, confidence: 0, evidence: [], ambiguous: false },
        scope: { id: null, confidence: 0, evidence: [], ambiguous: false }
      }
    }]
  };
}

async function queueAndClaim(service: ReturnType<typeof createEstimateDesignService>) {
  const queued = await service.uploadPlanRequestReplacement(
    designer,
    "plan-request",
    uploadInput()
  );
  const job = await EstimateDesignExtractionJobModel.findOne({ uploadId: queued.id }).lean();
  const claimed = await service.claimWorkerJob(
    String(job!._id),
    NOW.toISOString(),
    new Date(NOW.getTime() + 60_000).toISOString()
  );
  return { queued, jobId: String(job!._id), claimId: (claimed as { claimId: string }).claimId };
}

describe("request-scoped estimate plan replacement", () => {
  it("matches a corrected 3D revision title when original OCR and mapping are unusable", async () => {
    const { service } = await setup({
      detectedTitle: "UNREADABLE OCR TITLE",
      displayTitle: "LIVING ROOM 3D PERSPECTIVE",
      revisionLabel: "LIVING ROOM 3D PERSPECTIVE"
    });

    const { queued, jobId, claimId } = await queueAndClaim(service);
    expect(queued.requestReplacement).toMatchObject({
      matches: [{
        drawingId: "requested-drawing",
        detectedTitle: "LIVING ROOM 3D PERSPECTIVE"
      }]
    });
    await expect(service.completeWorkerJob(jobId, claimId, NOW.toISOString(), {
      resultId: "corrected-3d-title-result",
      pages: [workerPage(1, "LIVING ROOM 3D PERSPECTIVE")]
    })).resolves.toMatchObject({ status: "estimator_review" });

    expect(await EstimateDesignRevisionModel.countDocuments({ drawingId: "requested-drawing" })).toBe(2);
    expect(await EstimatePlanChangeRequestModel.findById("plan-request").lean()).toMatchObject({
      version: 2,
      targets: [{ status: "replacement_submitted" }]
    });
  });

  it("keeps the explicit ordinary upload path append-only while a Client request is open", async () => {
    const { service } = await setup();
    const queued = await service.upload(designer, "estimate-request-replacement", uploadInput().file);
    expect(queued).toMatchObject({ purpose: "ordinary", requestReplacement: null });
    const job = await EstimateDesignExtractionJobModel.findOne({ uploadId: queued.id }).lean();
    const claimed = await service.claimWorkerJob(
      String(job!._id),
      NOW.toISOString(),
      new Date(NOW.getTime() + 60_000).toISOString()
    );
    await service.completeWorkerJob(
      String(job!._id),
      (claimed as { claimId: string }).claimId,
      NOW.toISOString(),
      { resultId: "ordinary-result", pages: [workerPage(1, "Living Room Floor Plan")] }
    );

    expect(await EstimateDesignDrawingModel.countDocuments({ estimateId: "estimate-request-replacement" })).toBe(2);
    expect(await EstimateDesignSourcePageModel.countDocuments({ uploadId: queued.id })).toBe(1);
    expect(await EstimatePlanPageRevisionModel.countDocuments({ sourcePageId: "original-page" })).toBe(1);
    expect(await EstimatePlanChangeRequestModel.findById("plan-request").lean()).toMatchObject({
      version: 1,
      status: "open",
      targets: [{ status: "open", requestedRevisionId: "requested-revision" }]
    });
  });

  it("deduplicates concurrent queue attempts and removes the losing stored object", async () => {
    const { service, storage } = await setup();
    const [left, right] = await Promise.all([
      service.uploadPlanRequestReplacement(designer, "plan-request", uploadInput()),
      service.uploadPlanRequestReplacement(designer, "plan-request", uploadInput())
    ]);

    expect(left.id).toBe(right.id);
    expect(storage.sequence).toBe(2);
    expect(storage.deleted).toHaveLength(1);
    expect(storage.objects.has(storage.deleted[0]!)).toBe(false);
    expect(await EstimateDesignUploadModel.countDocuments({
      purpose: "plan_request_replacement",
      "planRequestReplacement.requestId": "plan-request",
      "planRequestReplacement.idempotencyKey": "designer-replacement-key"
    })).toBe(1);
    expect(await EstimateDesignExtractionJobModel.countDocuments({ uploadId: left.id })).toBe(1);
    expect(await EstimateDesignRevisionModel.findById("requested-revision").lean()).toMatchObject({
      replacementUploadId: left.id
    });
  });

  it("surfaces a checked cleanup failure for a concurrent queue loser", async () => {
    const { service, storage } = await setup();
    storage.failDelete = true;
    const outcomes = await Promise.allSettled([
      service.uploadPlanRequestReplacement(designer, "plan-request", uploadInput()),
      service.uploadPlanRequestReplacement(designer, "plan-request", uploadInput())
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected") as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({
      status: 500,
      code: "FILE_CLEANUP_ERROR"
    });
    expect(String(rejected[0]!.reason.message)).not.toContain("source-");
    expect(await EstimateDesignUploadModel.countDocuments({ purpose: "plan_request_replacement" })).toBe(1);
    expect(await EstimateDesignExtractionJobModel.countDocuments()).toBe(2);
  });

  it("queues idempotently, ignores unrelated PDF pages, and advances the original page once", async () => {
    const { service, storage, audit } = await setup();
    await EstimateDesignDrawingModel.create({
      _id: "requested-drawing-2",
      uploadId: "ordinary-upload",
      sourcePageId: "original-page",
      estimateId: "estimate-request-replacement",
      active: true,
      verified: true,
      detectedTitle: "BEDROOM FLOOR PLAN",
      displayTitle: "Bedroom Floor Plan",
      source: "ocr",
      mappingStatus: "misc"
    });
    await EstimateDesignRevisionModel.create({
      _id: "requested-revision-2",
      drawingId: "requested-drawing-2",
      revisionNumber: 1,
      sourcePageId: "original-page",
      crop: { x: 50, y: 0, width: 50, height: 100 },
      croppedFileReference: "original-page.png",
      label: "Bedroom Floor Plan",
      mappingStatus: "misc",
      reviewStatus: "changes_requested",
      replacementUploadId: null
    });
    await EstimatePlanPageRevisionModel.updateOne(
      { _id: "original-plan-page-revision" },
      { $push: { patches: {
        drawingId: "requested-drawing-2",
        drawingRevisionId: "requested-revision-2",
        crop: { x: 50, y: 0, width: 50, height: 100 },
        order: 1
      } } }
    );
    await EstimatePlanChangeRequestModel.updateOne(
      { _id: "plan-request" },
      { $push: { targets: {
        drawingId: "requested-drawing-2",
        requestedRevisionId: "requested-revision-2",
        status: "open",
        resolvedByRevisionId: null
      } } }
    );
    const first = await service.uploadPlanRequestReplacement(designer, "plan-request", uploadInput());
    const replay = await service.uploadPlanRequestReplacement(designer, "plan-request", uploadInput());
    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({
      purpose: "plan_request_replacement",
      requestReplacement: {
        requestId: "plan-request",
        sourcePageId: "original-page",
        targetCount: 2,
        ignoredPageCount: 0,
        matches: [
          {
            drawingId: "requested-drawing",
            requestedRevisionId: "requested-revision",
            detectedTitle: "Living Room Floor Plan",
            resultRevisionId: null
          },
          {
            drawingId: "requested-drawing-2",
            requestedRevisionId: "requested-revision-2",
            detectedTitle: "Bedroom Floor Plan",
            resultRevisionId: null
          }
        ]
      }
    });
    expect(storage.sequence).toBe(1);
    expect(await EstimateDesignUploadModel.countDocuments({ purpose: "plan_request_replacement" })).toBe(1);
    expect(await EstimateDesignRevisionModel.findById("requested-revision").lean()).toMatchObject({
      replacementUploadId: first.id
    });

    const job = await EstimateDesignExtractionJobModel.findOne({ uploadId: first.id }).lean();
    const claimed = await service.claimWorkerJob(
      String(job!._id),
      NOW.toISOString(),
      new Date(NOW.getTime() + 60_000).toISOString()
    );
    const claimId = (claimed as { claimId: string }).claimId;
    const workerResult = {
      resultId: "replacement-result",
      pages: [
        workerPage(1, "Living Room Floor Plan"),
        workerPage(2, "Bedroom Floor Plan"),
        workerPage(3, "UNCHANGED KITCHEN PLAN")
      ]
    };
    await service.completeWorkerJob(
      String(job!._id),
      claimId,
      NOW.toISOString(),
      workerResult
    );

    const beforeReplay = {
      pageCount: await EstimateDesignSourcePageModel.countDocuments({ uploadId: first.id }),
      revisionCount: await EstimateDesignRevisionModel.countDocuments({
        drawingId: { $in: ["requested-drawing", "requested-drawing-2"] }
      }),
      planPageCount: await EstimatePlanPageRevisionModel.countDocuments({ sourcePageId: "original-page" }),
      auditCount: audit.appendInMongoTransaction.mock.calls.length
    };
    await expect(service.completeWorkerJob(
      String(job!._id),
      "wrong-claim-token",
      NOW.toISOString(),
      workerResult
    )).rejects.toMatchObject({ code: "STALE_EXTRACTION_CLAIM" });
    await expect(service.completeWorkerJob(
      String(job!._id),
      claimId,
      NOW.toISOString(),
      { ...workerResult, resultId: "different-result" }
    )).rejects.toMatchObject({ code: "STALE_EXTRACTION_CLAIM" });
    const replayed = await service.completeWorkerJob(
      String(job!._id),
      claimId,
      NOW.toISOString(),
      workerResult
    );
    expect(replayed).toMatchObject({ status: "estimator_review" });
    expect(replayed).not.toHaveProperty("workerResultClaimDigest");
    expect({
      pageCount: await EstimateDesignSourcePageModel.countDocuments({ uploadId: first.id }),
      revisionCount: await EstimateDesignRevisionModel.countDocuments({
        drawingId: { $in: ["requested-drawing", "requested-drawing-2"] }
      }),
      planPageCount: await EstimatePlanPageRevisionModel.countDocuments({ sourcePageId: "original-page" }),
      auditCount: audit.appendInMongoTransaction.mock.calls.length
    }).toEqual(beforeReplay);
    const completedJob = await EstimateDesignExtractionJobModel.findById(job!._id).lean();
    expect(completedJob!.workerResultClaimDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(completedJob!.workerResultClaimDigest).not.toContain(claimId);

    const auditEvents = audit.appendInMongoTransaction.mock.calls.map(([event]) => event);
    expect(auditEvents.find((event) => event.action === "estimate_design_replacement_queued")).toMatchObject({
      newValues: {
        targets: [
          { drawingId: "requested-drawing", requestedRevisionId: "requested-revision" },
          { drawingId: "requested-drawing-2", requestedRevisionId: "requested-revision-2" }
        ]
      }
    });
    expect(auditEvents.find((event) => event.action === "estimate_design_replacement_created")).toMatchObject({
      newValues: {
        ignoredPageCount: 1,
        matches: [
          { drawingId: "requested-drawing", matchReason: "normalized_title", pageNumber: 1 },
          { drawingId: "requested-drawing-2", matchReason: "normalized_title", pageNumber: 2 }
        ]
      }
    });
    const safeAuditJson = JSON.stringify(auditEvents.filter((event) =>
      ["estimate_design_replacement_queued", "estimate_design_replacement_created"].includes(event.action)
    ));
    expect(safeAuditJson).not.toContain("Living Room");
    expect(safeAuditJson).not.toContain("source-");
    expect(safeAuditJson).not.toContain(claimId);

    expect(await EstimateDesignDrawingModel.countDocuments({ estimateId: "estimate-request-replacement" })).toBe(2);
    expect(await EstimateDesignRevisionModel.countDocuments({ drawingId: "requested-drawing" })).toBe(2);
    expect(await EstimateDesignRevisionModel.countDocuments({ drawingId: "requested-drawing-2" })).toBe(2);
    expect(await EstimateDesignSourcePageModel.countDocuments({ uploadId: first.id })).toBe(2);
    expect(await EstimateDesignSourcePageModel.countDocuments({ uploadId: "ordinary-upload" })).toBe(1);
    expect(await EstimatePlanPageRevisionModel.countDocuments({ sourcePageId: "original-page" })).toBe(2);
    const currentPage = await EstimatePlanPageRevisionModel.findOne({ sourcePageId: "original-page" })
      .sort({ revisionNumber: -1 }).lean();
    expect(currentPage).toMatchObject({
      revisionNumber: 2,
      previousRevisionId: "original-plan-page-revision"
    });
    expect(currentPage!.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ drawingId: "requested-drawing" }),
      expect.objectContaining({ drawingId: "requested-drawing-2" })
    ]));
    const request = await EstimatePlanChangeRequestModel.findById("plan-request").lean();
    expect(request).toMatchObject({
      version: 2,
      status: "open",
      targets: [{ status: "replacement_submitted" }, { status: "replacement_submitted" }]
    });
    const completed = await EstimateDesignUploadModel.findById(first.id).lean();
    expect(completed).toMatchObject({
      extractionStatus: "estimator_review",
      planRequestReplacementResult: {
        ignoredPageNumbers: [3],
        matches: [
          {
            drawingId: "requested-drawing",
            requestedRevisionId: "requested-revision",
            matchReason: "normalized_title",
            pageNumber: 1
          },
          {
            drawingId: "requested-drawing-2",
            requestedRevisionId: "requested-revision-2",
            matchReason: "normalized_title",
            pageNumber: 2
          }
        ]
      }
    });
    await expect(service.deleteUpload(designer, first.id)).rejects.toMatchObject({
      status: 409,
      code: "ESTIMATE_DESIGN_UPLOAD_LOCKED"
    });
    expect(await EstimateDesignSourcePageModel.findById("original-page").lean()).not.toBeNull();
    expect(await EstimatePlanChangeRequestModel.findById("plan-request").lean()).toMatchObject({
      status: "open",
      version: 2,
      targets: [{ status: "replacement_submitted" }, { status: "replacement_submitted" }]
    });
  });

  it("fails missing matches atomically, then re-reserves the same snapshot on retry and releases it on deletion", async () => {
    const { service } = await setup();
    const { queued, jobId, claimId } = await queueAndClaim(service);
    const failed = await service.completeWorkerJob(jobId, claimId, NOW.toISOString(), {
      resultId: "missing-result",
      pages: [workerPage(1, "UNRELATED KITCHEN PLAN")]
    });
    expect(failed.status).toBe("processing_failed");
    expect(await EstimateDesignSourcePageModel.countDocuments({ uploadId: queued.id })).toBe(0);
    expect(await EstimateDesignRevisionModel.countDocuments({ drawingId: "requested-drawing" })).toBe(1);
    expect(await EstimatePlanPageRevisionModel.countDocuments({ sourcePageId: "original-page" })).toBe(1);
    expect(await EstimateDesignRevisionModel.findById("requested-revision").lean()).toMatchObject({
      replacementUploadId: null
    });

    await EstimateDesignExtractionJobModel.updateOne(
      { _id: jobId },
      { $set: { workerResultClaimDigest: "a".repeat(64) } }
    );

    await expect(service.retryUpload(designer, queued.id)).resolves.toMatchObject({
      id: queued.id,
      extractionStatus: "queued",
      purpose: "plan_request_replacement"
    });
    expect(await EstimateDesignExtractionJobModel.findById(jobId).lean()).toMatchObject({
      workerResultClaimDigest: null
    });
    expect(await EstimateDesignRevisionModel.findById("requested-revision").lean()).toMatchObject({
      replacementUploadId: queued.id
    });
    await expect(service.deleteUpload(designer, queued.id)).resolves.toEqual({
      id: queued.id,
      deleted: true
    });
    expect(await EstimateDesignRevisionModel.findById("requested-revision").lean()).toMatchObject({
      replacementUploadId: null,
      reviewStatus: "changes_requested"
    });
    expect(await EstimateDesignDrawingModel.findById("requested-drawing").lean()).toMatchObject({ active: true });
    expect(await EstimateDesignSourcePageModel.findById("original-page").lean()).not.toBeNull();
    expect(await EstimatePlanChangeRequestModel.findById("plan-request").lean()).toMatchObject({
      status: "open",
      version: 1,
      targets: [{ status: "open" }]
    });
  });

  it("turns a stale request completion into a terminal safe failure", async () => {
    const { service, storage } = await setup();
    const { queued, jobId, claimId } = await queueAndClaim(service);
    await EstimatePlanChangeRequestModel.updateOne(
      { _id: "plan-request", version: 1 },
      { $set: { summary: "Client clarified the request" }, $inc: { version: 1 } }
    );
    const completed = await service.completeWorkerJob(jobId, claimId, NOW.toISOString(), {
      resultId: "stale-result",
      pages: [workerPage(1, "LIVING ROOM FLOOR PLAN")]
    });
    expect(completed.status).toBe("processing_failed");
    expect(await EstimateDesignUploadModel.findById(queued.id).lean()).toMatchObject({
      extractionStatus: "processing_failed",
      failureCode: "PLAN_REPLACEMENT_REQUEST_STALE"
    });
    expect(await EstimateDesignRevisionModel.findById("requested-revision").lean()).toMatchObject({
      replacementUploadId: null
    });
    expect(await EstimateDesignRevisionModel.countDocuments({ drawingId: "requested-drawing" })).toBe(1);
    expect(await EstimatePlanPageRevisionModel.countDocuments({ sourcePageId: "original-page" })).toBe(1);
    expect(storage.deleted).toHaveLength(1);
  });
});
