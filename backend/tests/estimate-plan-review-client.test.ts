import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignAnnotationDraftModel } from "../src/models/EstimateDesignAnnotationDraft.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimatePlanChangeRequestModel } from "../src/models/EstimatePlanChangeRequest.js";
import { EstimatePlanPageRevisionModel } from "../src/models/EstimatePlanPageRevision.js";
import { UserModel } from "../src/models/User.js";
import { createEstimatePlanReviewService } from "../src/services/estimate-plan-review.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const client = { id: "client-1", name: "Client", email: "client@example.com", role: "client" as const };
const annotations = {
  schemaVersion: 1 as const, imageWidth: 1000, imageHeight: 500,
  elements: [{ id: "mark", type: "rectangle" as const, color: "#ff0000", strokeWidth: 2, x: .1, y: .1, width: .3, height: .3 }]
};

function service(audit = vi.fn(async () => ({}))) {
  return createEstimatePlanReviewService({
    estimateDesigns: {
      listClient: vi.fn(async () => ({ uploads: [], pages: [], drawings: [], revisions: [], readiness: { ready: false, total: 2, approved: 0, awaitingReview: 2, changesRequested: 0 } }))
    },
    storage: { open: vi.fn(), read: vi.fn(), save: vi.fn(), saveGenerated: vi.fn(), delete: vi.fn() },
    audit: { appendInMongoTransaction: audit },
    now: () => new Date("2026-08-03T10:00:00.000Z")
  } as never);
}

beforeAll(async () => { replica = await startMongoReplicaSet(); });
afterAll(async () => { await replica.stop(); });
beforeEach(async () => {
  await replica.clear();
  await UserModel.create({ _id: "owner-1", name: "Owner", email: "owner@example.com", emailNormalized: "owner@example.com", passwordHash: "hash", role: "estimator_sales", active: true });
  await EstimateModel.create({ _id: "estimate-1", leadId: "lead-1", ownerId: "owner-1", status: "sent_to_client", propertyType: "apartment" });
  await EstimateDesignUploadModel.create({ _id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", storedFileReference: "source.pdf", mimeType: "application/pdf", sizeBytes: 100, uploaderId: "estimator-1", uploadedAt: new Date(), extractionStatus: "submitted" });
  await EstimateDesignSourcePageModel.create({ _id: "page-1", uploadId: "upload-1", pageNumber: 1, normalizedFileReference: "base.png", width: 1000, height: 500 });
  await EstimateDesignDrawingModel.create([
    { _id: "drawing-a", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1", active: true, verified: true, roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", detectedTitle: "A", displayTitle: "A", source: "ocr" },
    { _id: "drawing-b", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1", active: true, verified: true, roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", detectedTitle: "B", displayTitle: "B", source: "ocr" }
  ]);
  await EstimateDesignRevisionModel.create([
    { _id: "revision-a", drawingId: "drawing-a", revisionNumber: 1, sourcePageId: "page-1", crop: { x: 0, y: 0, width: 450, height: 500 }, croppedFileReference: "a.png", roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", label: "A", reviewStatus: "submitted" },
    { _id: "revision-b", drawingId: "drawing-b", revisionNumber: 1, sourcePageId: "page-1", crop: { x: 550, y: 0, width: 450, height: 500 }, croppedFileReference: "b.png", roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", label: "B", reviewStatus: "submitted" }
  ]);
});

describe("client estimate plan review service", () => {
  it("bootstraps one immutable page manifest and returns protected DTOs", async () => {
    await EstimateDesignSourcePageModel.create(Array.from({ length: 5 }, (_, index) => ({
      _id: `page-${index + 2}`,
      uploadId: "upload-1",
      pageNumber: index + 2,
      normalizedFileReference: `base-${index + 2}.png`,
      width: 1000,
      height: 500
    })));
    await EstimateDesignUploadModel.create({
      _id: "replacement-upload",
      estimateId: "estimate-1",
      leadId: "lead-1",
      originalFilename: "replacement.png",
      storedFileReference: "replacement.png",
      mimeType: "image/png",
      sizeBytes: 100,
      uploaderId: "estimator-1",
      uploadedAt: new Date("2026-08-03T11:00:00.000Z"),
      extractionStatus: "submitted",
      replacementDrawingId: "drawing-a",
      replacesRevisionId: "revision-a",
      replacementVersion: 1
    });
    await EstimateDesignSourcePageModel.create({ _id: "replacement-page", uploadId: "replacement-upload", pageNumber: 1, normalizedFileReference: "replacement.png", width: 400, height: 300 });
    const workspace = await service().listClient(client, "estimate-1");
    expect(workspace.uploads).toEqual([{
      id: "upload-1",
      originalFilename: "plan.pdf",
      mimeType: "application/pdf",
      pageCount: 6,
      pages: expect.arrayContaining([expect.objectContaining({ id: "page-1", pageNumber: 1 }), expect.objectContaining({ id: "page-6", pageNumber: 6 })])
    }]);
    expect(workspace.pages.map((page) => page.id)).toEqual(["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"]);
    expect(workspace.pages).not.toContainEqual(expect.objectContaining({ id: "replacement-page" }));
    expect(workspace.pages[0]).toEqual(expect.objectContaining({ id: "page-1", currentRevisionId: expect.any(String), thumbnailUrl: "/client/estimate-plan-pages/page-1/thumbnail" }));
    expect(JSON.stringify(workspace)).not.toContain("base.png");
    expect(await EstimatePlanPageRevisionModel.countDocuments({ sourcePageId: "page-1" })).toBe(1);
  });

  it("keeps an OCR-missed source page available for unassigned feedback", async () => {
    await EstimateDesignSourcePageModel.create({ _id: "page-2", uploadId: "upload-1", pageNumber: 2, normalizedFileReference: "page-2.png", width: 1000, height: 500 });
    const workspace = await service().listClient(client, "estimate-1");
    expect(workspace.pages.map((page) => page.id)).toEqual(["page-1", "page-2"]);
    const preview = await service().previewTargets(client, "page-2", { annotations });
    expect(preview.targets).toEqual([]);
  });

  it("saves drafts optimistically and rejects a stale version", async () => {
    const api = service();
    const created = await api.saveDraft(client, "page-1", { version: 0, annotations });
    expect(created.version).toBe(1);
    await expect(api.saveDraft(client, "page-1", { version: 0, annotations })).rejects.toMatchObject({ status: 409 });
  });

  it("previews overlaps and creates one idempotent shared request", async () => {
    const api = service();
    await api.saveDraft(client, "page-1", { version: 0, annotations });
    await EstimateDesignAnnotationDraftModel.create({
      _id: "drawing-draft-1", revisionId: "revision-a", clientId: client.id, version: 1,
      annotations: { ...annotations, imageWidth: 450, imageHeight: 500 }
    });
    const preview = await api.previewTargets(client, "page-1", { annotations });
    expect(preview.targets.map((target) => target.drawingId)).toEqual(["drawing-a"]);
    const input = { version: preview.pageRevisionNumber, summary: "Change A", annotations, targetDrawingIds: ["drawing-a"], snapshotToken: preview.snapshotToken, idempotencyKey: "request-key" };
    const first = await api.submitRequest(client, "page-1", input);
    const replay = await api.submitRequest(client, "page-1", input);
    expect(replay.id).toBe(first.id);
    expect(await EstimatePlanChangeRequestModel.countDocuments()).toBe(1);
    expect((await api.listClient(client, "estimate-1")).pages[0]!.annotationDraft).toBeNull();
    expect(await EstimateDesignAnnotationDraftModel.countDocuments({ revisionId: "revision-a" })).toBe(0);
    expect((await EstimateDesignRevisionModel.findById("revision-a").lean())!.reviewStatus).toBe("changes_requested");
    expect((await EstimateDesignRevisionModel.findById("revision-b").lean())!.reviewStatus).toBe("submitted");
    const estimate = await EstimateModel.findById("estimate-1").lean();
    expect(estimate!.notifications).toEqual([expect.objectContaining({
      recipientEmail: "owner@example.com", event: "estimate_plan_changes_requested", status: "queued"
    })]);
    expect(JSON.stringify(estimate!.notifications)).not.toContain("base.png");
    await expect(api.submitRequest(client, "page-1", { ...input, idempotencyKey: "second-key" }))
      .rejects.toMatchObject({ status: 409, code: "PLAN_REQUEST_ALREADY_OPEN", fields: { requestId: first.id } });
  });

  it("updates the same owned open request with optimistic locking and audit history", async () => {
    const audit = vi.fn(async () => ({}));
    const api = service(audit);
    const preview = await api.previewTargets(client, "page-1", { annotations });
    const created = await api.submitRequest(client, "page-1", { version: preview.pageRevisionNumber, summary: "Change A", annotations, targetDrawingIds: ["drawing-a"], snapshotToken: preview.snapshotToken, idempotencyKey: "request-key" });
    const updatedAnnotations = { ...annotations, elements: [{ ...annotations.elements[0]!, x: .2 }] };

    const updated = await api.updateClientRequest(client, created.id, {
      version: created.version,
      summary: "Move A farther left",
      annotations: updatedAnnotations
    });

    expect(updated).toMatchObject({ id: created.id, version: 2, summary: "Move A farther left", annotations: updatedAnnotations, targets: created.targets });
    expect(await EstimatePlanChangeRequestModel.countDocuments()).toBe(1);
    expect(await EstimatePlanPageRevisionModel.countDocuments({ sourcePageId: "page-1" })).toBe(1);
    expect(await EstimateDesignRevisionModel.findById("revision-a").lean()).toMatchObject({
      changeSummary: "Move A farther left",
      annotationLayerId: created.id,
      annotations: expect.objectContaining({ imageWidth: 450, imageHeight: 500, elements: expect.any(Array) })
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "estimate_plan_change_request_updated", entityId: created.id }), expect.anything());
    await expect(api.updateClientRequest(client, created.id, { version: 1, summary: "Stale", annotations }))
      .rejects.toMatchObject({ status: 409 });
    await expect(api.updateClientRequest({ ...client, id: "client-2" }, created.id, { version: 2, summary: "Not mine", annotations }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("allows only one of two simultaneous overlapping submissions", async () => {
    const api = service();
    const preview = await api.previewTargets(client, "page-1", { annotations });
    const base = { version: preview.pageRevisionNumber, summary: "Change A", annotations, targetDrawingIds: ["drawing-a"], snapshotToken: preview.snapshotToken };
    const results = await Promise.allSettled([
      api.submitRequest(client, "page-1", { ...base, idempotencyKey: "concurrent-a" }),
      api.submitRequest(client, "page-1", { ...base, idempotencyKey: "concurrent-b" })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ status: 409, code: "PLAN_REQUEST_ALREADY_OPEN" }) })
    ]);
    expect(await EstimatePlanChangeRequestModel.countDocuments({ status: "open" })).toBe(1);
  });

  it("preserves non-overlapping annotations as unassigned feedback", async () => {
    const api = service();
    const outside = { ...annotations, elements: [{ ...annotations.elements[0]!, x: .49, width: .02 }] };
    const preview = await api.previewTargets(client, "page-1", { annotations: outside });
    expect(preview.targets).toEqual([]);
    const request = await api.submitRequest(client, "page-1", { version: preview.pageRevisionNumber, summary: "Between drawings", annotations: outside, targetDrawingIds: [], snapshotToken: preview.snapshotToken, idempotencyKey: "unassigned-key" });
    expect(request.unassigned).toBe(true);
  });
});
