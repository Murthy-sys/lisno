import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { DesignPlanResponseProofModel } from "../src/models/DesignPlanResponseProof.js";
import { EstimateDesignAnnotationDraftModel } from "../src/models/EstimateDesignAnnotationDraft.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimatePlanChangeRequestModel } from "../src/models/EstimatePlanChangeRequest.js";
import { EstimatePlanPageRevisionModel } from "../src/models/EstimatePlanPageRevision.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { createEstimateDesignService } from "../src/services/estimate-design.service.js";
import { createEstimatePlanReviewService } from "../src/services/estimate-plan-review.service.js";
import { createProjectWorkflowService } from "../src/services/project-workflow.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-09-09T12:00:00.000Z");
const designer = { id: "designer", name: "Designer", email: "designer@example.test", role: "designer" } as const;
const client = { id: "client", name: "Client", email: "client@example.test", role: "client" } as const;
const admin = { id: "sales-manager", name: "Sales Manager", email: "manager@example.test", role: "admin" } as const;
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("design-upload-delete-tests");
  for (const model of [UserModel, EstimateModel, LeadModel, EstimateDesignUploadModel, EstimateDesignSourcePageModel,
    EstimateDesignDrawingModel, EstimateDesignRevisionModel, EstimateDesignExtractionJobModel, EstimatePlanChangeRequestModel,
    DesignPlanReviewRoundModel, DesignPlanResponseProofModel, ProjectModel, ProjectAccessGrantModel, ProjectWorkflowTaskModel,
    EstimateDesignAnnotationDraftModel, EstimatePlanPageRevisionModel]) await model.syncIndexes();
}, 120_000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica.stop(); });

async function setup(status = "ready_for_client", count = 2) {
  const audit = { append: vi.fn(async () => ({ id: "audit" })), appendInMongoTransaction: vi.fn(async () => ({ id: "audit" })) };
  const storage = { read: vi.fn(), open: vi.fn(), delete: vi.fn(), save: vi.fn(), saveGenerated: vi.fn() };
  const workflow = createProjectWorkflowService({ storage: storage as never, audit: audit as never, mailer: { deliveryKind: "disabled" } as never, now: () => NOW });
  const service = createEstimateDesignService({ storage: storage as never, audit: audit as never, projectWorkflow: workflow, maxUploadBytes: 1_000_000, now: () => NOW });
  await UserModel.create({ _id: designer.id, name: designer.name, email: designer.email, emailNormalized: designer.email, passwordHash: "unused", role: designer.role, active: true, accountKind: "standard" });
  await EstimateModel.create({ _id: "estimate", leadId: "lead", projectId: "project", ownerId: "sales", status: "client_approved", propertyType: "Villa", designPlanDesignerId: designer.id, designPlanStatus: status, designPlanVersion: 1 });
  await LeadModel.create({ _id: "lead", projectId: "project", ownerId: "sales", clientName: client.name, clientEmail: client.email, clientMobile: "9000000000", projectName: "Test residence", location: "Pune", propertyType: "Villa", source: "direct", stage: "won", nextAction: "Design", nextActionAt: NOW });
  await ProjectModel.collection.insertOne({ _id: "project", name: "Test residence", clientId: client.id, clientName: client.name, clientEmail: client.email, status: "planning", location: "Pune" } as never);
  await ProjectAccessGrantModel.create({ _id: "grant", projectId: "project", userId: admin.id, module: "projects", source: "admin_initiator", active: true, grantedById: admin.id, grantedAt: NOW });
  await ProjectWorkflowTaskModel.create({ _id: "task", dedupeKey: "estimate:design-plan-upload", projectId: "project", estimateId: "estimate", designPlanVersion: 0, kind: "design_plan_upload", title: "Upload design", assigneeRole: "designer", assigneeUserId: designer.id, status: "completed", progress: 100, completedAt: NOW, openedAt: NOW, dueAt: NOW });
  for (let n = 1; n <= count; n++) {
    await EstimateDesignUploadModel.create({ _id: `upload-${n}`, estimateId: "estimate", leadId: "lead", originalFilename: `design-${n}.pdf`, storedFileReference: `source-${n}`, mimeType: "application/pdf", sizeBytes: 10, uploaderId: designer.id, uploadedAt: NOW, extractionStatus: status === "ready_for_client" ? "submitted" : "estimator_review" });
    await EstimateDesignExtractionJobModel.create({ _id: `job-${n}`, uploadId: `upload-${n}`, status: status === "ready_for_client" ? "submitted" : "estimator_review", attemptCount: 1, queuedAt: NOW, completedAt: NOW });
    await EstimateDesignSourcePageModel.create({ _id: `page-${n}`, uploadId: `upload-${n}`, pageNumber: 1, normalizedFileReference: `page-${n}.png`, width: 100, height: 100 });
    await EstimateDesignDrawingModel.create({ _id: `drawing-${n}`, uploadId: `upload-${n}`, sourcePageId: `page-${n}`, estimateId: "estimate", active: true, detectedTitle: "Living room", displayTitle: "Living room", source: "ocr", mappingStatus: "misc" });
    await EstimateDesignRevisionModel.create({ _id: `revision-${n}`, drawingId: `drawing-${n}`, revisionNumber: 1, sourcePageId: `page-${n}`, crop: { x: 0, y: 0, width: 100, height: 100 }, croppedFileReference: `crop-${n}.png`, label: "Living room", mappingStatus: "misc", reviewStatus: status === "ready_for_client" ? "submitted" : "draft" });
  }
  if (status === "ready_for_client") await DesignPlanReviewRoundModel.create({ _id: "round", estimateId: "estimate", projectId: "project", leadId: "lead", designPlanVersion: 1, recipientEmail: client.email, clientName: client.name, projectName: "Test residence", submittedRevisionIds: Array.from({ length: count }, (_, i) => `revision-${i + 1}`), attachments: [{ uploadId: "upload-1", filename: "design-1.pdf", mimeType: "application/pdf", byteSize: 10, sha256: "a".repeat(64), storageReference: "source-1" }], submittedById: designer.id, submittedAt: NOW, assignedAdminId: admin.id, deliveryStatus: "sent", status: "pending" });
  const approveAsManager = () => workflow.decideDesignReviewAsAdmin({ actor: admin, roundId: "round", expectedVersion: 1, decision: "approve", note: "Client approved", proof: { storageReference: "proof", originalFilename: "proof.png", mimeType: "image/png", byteSize: 10, sha256: "b".repeat(64) } });
  return { service, storage, audit, workflow, approveAsManager };
}

describe("Designer upload deletion", () => {
  it("withdraws pending review, retains immutable snapshots, reopens the task, and rejects stale approvals", async () => {
    const { service, storage, approveAsManager, audit } = await setup();
    await EstimatePlanPageRevisionModel.create({ _id: "page-review-2", estimateId: "estimate", sourcePageId: "page-2", revisionNumber: 1, basePageReference: "page-2.png", status: "awaiting_review", patches: [{ drawingId: "drawing-2", drawingRevisionId: "revision-2", crop: { x: 0, y: 0, width: 100, height: 100 }, order: 0 }], createdBy: designer.id });
    expect((await service.listEstimator(designer, "estimate")).uploads[0]).toMatchObject({ canDelete: true });
    const roundBefore = await DesignPlanReviewRoundModel.findById("round").select("+attachments.storageReference").lean();
    await expect(service.deleteUpload(designer, "upload-1")).resolves.toEqual({ id: "upload-1", deleted: true });
    const workspace = await service.listEstimator(designer, "estimate");
    expect(workspace.uploads.map((row) => row.id)).toEqual(["upload-2"]);
    expect(workspace.drawings.map((row) => row.id)).toEqual(["drawing-2"]);
    expect(await EstimateDesignUploadModel.findById("upload-1").lean()).toMatchObject({ deletedAt: NOW, deletedById: designer.id, storedFileReference: "source-1" });
    expect(await ProjectWorkflowTaskModel.findById("task").lean()).toMatchObject({ status: "open", progress: 0, completedAt: null, openedAt: NOW, dueAt: NOW });
    expect(await EstimateModel.findById("estimate").lean()).toMatchObject({ designPlanStatus: "in_progress", designPlanVersion: 1 });
    const roundAfter = await DesignPlanReviewRoundModel.findById("round").select("+attachments.storageReference").lean();
    expect(roundAfter).toMatchObject({ status: "withdrawn", withdrawnById: designer.id, decision: null });
    expect(roundAfter!.attachments).toEqual(roundBefore!.attachments);
    expect(roundAfter!.submittedRevisionIds).toEqual(roundBefore!.submittedRevisionIds);
    expect(await EstimateDesignRevisionModel.findById("revision-2").lean()).toMatchObject({ reviewStatus: "submitted", revisionNumber: 1 });
    expect(await EstimateDesignRevisionModel.findOne({ drawingId: "drawing-2" }).sort({ revisionNumber: -1 }).lean()).toMatchObject({ reviewStatus: "draft", revisionNumber: 2 });
    const reopened = await EstimateDesignRevisionModel.findOne({ drawingId: "drawing-2", revisionNumber: 2 }).lean();
    expect(await EstimatePlanPageRevisionModel.findOne({ sourcePageId: "page-2" }).sort({ revisionNumber: -1 }).lean()).toMatchObject({ revisionNumber: 2, patches: [{ drawingId: "drawing-2", drawingRevisionId: reopened!._id }] });
    expect(await EstimatePlanPageRevisionModel.findById("page-review-2").lean()).toMatchObject({ patches: [{ drawingRevisionId: "revision-2" }] });
    await expect(service.decideDrawing(client, "revision-2", { version: 1, decision: "approve" })).rejects.toMatchObject({ status: 404 });
    await expect(approveAsManager()).rejects.toMatchObject({ code: "DESIGN_PLAN_NOT_REVIEWABLE" });
    await expect(service.sourceImage(designer, "page-1")).rejects.toMatchObject({ status: 404 });
    await expect(service.revisionImage(designer, "revision-1")).rejects.toMatchObject({ status: 404 });
    await expect(service.retryUpload(designer, "upload-1")).rejects.toMatchObject({ status: 404 });
    expect(storage.delete).not.toHaveBeenCalled();
    await expect(service.deleteUpload(designer, "upload-1")).resolves.toEqual({ id: "upload-1", deleted: true });
    expect(audit.appendInMongoTransaction.mock.calls.filter(([event]) => (event as any).action === "estimate_design_upload_deleted")).toHaveLength(1);
  });

  it("cancels a leased source and rejects late completion, heartbeat, source, and retry", async () => {
    const { service } = await setup("in_progress", 1);
    await EstimateDesignExtractionJobModel.updateOne({ _id: "job-1" }, { $set: { status: "processing", claimId: "claim", leaseExpiresAt: new Date(NOW.getTime() + 60_000) } });
    await EstimateDesignUploadModel.updateOne({ _id: "upload-1" }, { $set: { extractionStatus: "processing" } });
    await service.deleteUpload(designer, "upload-1");
    expect(await EstimateDesignExtractionJobModel.findById("job-1").lean()).toMatchObject({ status: "processing_failed", claimId: null, leaseExpiresAt: null, nextAttemptAt: null, failureCode: "ESTIMATE_DESIGN_UPLOAD_DELETED", claimGeneration: 1 });
    await Promise.all([service.workerSource("job-1", "claim", NOW.toISOString()), service.renewWorkerLease("job-1", "claim", NOW.toISOString(), NOW.toISOString()), service.completeWorkerJob("job-1", "claim", NOW.toISOString(), { resultId: "late", pages: [] })].map((request) => expect(request).rejects.toMatchObject({ code: "STALE_EXTRACTION_CLAIM" })));
    expect(await service.findOldestClaimableWorkerJob(NOW.toISOString())).toBeNull();
  });

  it("cannot resurrect drawings when OCR completion races deletion", async () => {
    const { service, storage } = await setup("in_progress", 1);
    await EstimateDesignRevisionModel.deleteMany({});
    await EstimateDesignDrawingModel.deleteMany({});
    await EstimateDesignSourcePageModel.deleteMany({});
    await EstimateDesignUploadModel.updateOne({ _id: "upload-1" }, { $set: { extractionStatus: "queued" } });
    await EstimateDesignExtractionJobModel.updateOne({ _id: "job-1" }, { $set: { status: "queued" } });
    const claim = await service.claimWorkerJob("job-1", NOW.toISOString(), new Date(NOW.getTime() + 60_000).toISOString());
    expect(claim).toHaveProperty("claimId");
    const pixels = await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer();
    let sequence = 0;
    storage.saveGenerated.mockImplementation(async () => ({ reference: `generated-${++sequence}.png` }));
    const results = await Promise.allSettled([
      service.completeWorkerJob("job-1", (claim as any).claimId, NOW.toISOString(), { resultId: "ocr-result", pages: [{ pageNumber: 1, width: 20, height: 20, imageBase64: pixels.toString("base64"), sections: [{ label: "Living room", confidence: 0.8, crop: { x: 0, y: 0, width: 20, height: 20 }, imageBase64: pixels.toString("base64"), proposal: { detectedTitle: "Living room", room: { id: null, confidence: 0, evidence: [], ambiguous: false }, scope: { id: null, confidence: 0, evidence: [], ambiguous: false } } }] }] }),
      service.deleteUpload(designer, "upload-1")
    ]);
    expect(results[1].status).toBe("fulfilled");
    expect(await EstimateDesignDrawingModel.countDocuments({ estimateId: "estimate", active: true })).toBe(0);
    expect(await EstimateDesignUploadModel.findById("upload-1").lean()).toMatchObject({ deletedAt: NOW });
    expect((await service.listEstimator(designer, "estimate")).uploads).toEqual([]);
  });

  it("rolls back deletion and withdrawal if the required audit cannot persist", async () => {
    const { service, audit } = await setup();
    audit.appendInMongoTransaction.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(service.deleteUpload(designer, "upload-1")).rejects.toThrow("audit unavailable");
    expect(await EstimateDesignUploadModel.findById("upload-1").lean()).toMatchObject({ deletedAt: null });
    expect(await DesignPlanReviewRoundModel.findById("round").lean()).toMatchObject({ status: "pending", version: 1 });
    expect(await ProjectWorkflowTaskModel.findById("task").lean()).toMatchObject({ status: "completed", progress: 100 });
    expect(await EstimateDesignRevisionModel.countDocuments({ drawingId: "drawing-2" })).toBe(1);
  });

  it("enforces Designer ownership, assignment, and active identity", async () => {
    const { service } = await setup("in_progress");
    for (const role of ["admin", "super_admin", "estimator_sales", "client"] as const) await expect(service.deleteUpload({ ...designer, role }, "upload-1")).rejects.toMatchObject({ status: 403 });
    // uploader identity is immutable, so create an independently owned source.
    await EstimateDesignUploadModel.collection.updateOne({ _id: "upload-1" }, { $set: { uploaderId: "other" } });
    await expect(service.deleteUpload(designer, "upload-1")).rejects.toMatchObject({ status: 404 });
    await EstimateModel.updateOne({ _id: "estimate" }, { $set: { designPlanDesignerId: "another-designer" } });
    await expect(service.deleteUpload(designer, "upload-2")).rejects.toMatchObject({ status: 404 });
    await UserModel.updateOne({ _id: designer.id }, { $set: { active: false } });
    await expect(service.deleteUpload(designer, "upload-2")).rejects.toMatchObject({ status: 403 });
  });

  it.each(["client", "sales_manager"] as const)("locks deletion after %s approval", async (actor) => {
    const { service, approveAsManager } = await setup("ready_for_client", 1);
    if (actor === "client") await service.decideDrawing(client, "revision-1", { version: 1, decision: "approve" });
    else await approveAsManager();
    await expect(service.deleteUpload(designer, "upload-1")).rejects.toMatchObject({ code: "ESTIMATE_DESIGN_UPLOAD_LOCKED" });
    expect((await service.listEstimator(designer, "estimate")).uploads[0]).toMatchObject({ canDelete: false, deleteBlockedReason: "Approved designs cannot be deleted." });
    expect(await EstimateDesignUploadModel.findById("upload-1").lean()).toMatchObject({ deletedAt: null });
  });

  it.each(["client", "sales_manager"] as const)("serializes deletion racing %s approval", async (actor) => {
    const { service, approveAsManager } = await setup("ready_for_client", 1);
    const outcomes = await Promise.allSettled([service.deleteUpload(designer, "upload-1"), actor === "client" ? service.decideDrawing(client, "revision-1", { version: 1, decision: "approve" }) : approveAsManager()]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const upload = await EstimateDesignUploadModel.findById("upload-1").lean();
    const revision = await EstimateDesignRevisionModel.findById("revision-1").lean();
    expect(Boolean(upload!.deletedAt) && revision!.reviewStatus === "approved").toBe(false);
  });

  it("protects original and replacement sources when a replacement revision was approved", async () => {
    const { service } = await setup("in_progress", 2);
    await EstimateDesignRevisionModel.create({ _id: "approved-replacement", drawingId: "drawing-1", revisionNumber: 2, sourcePageId: "page-2", crop: { x: 0, y: 0, width: 100, height: 100 }, croppedFileReference: "replacement.png", label: "Living room", mappingStatus: "misc", reviewStatus: "approved", replacesRevisionId: "revision-1" });
    for (const id of ["upload-1", "upload-2"]) await expect(service.deleteUpload(designer, id)).rejects.toMatchObject({ code: "ESTIMATE_DESIGN_UPLOAD_LOCKED" });
  });

  it("withdraws unresolved feedback without inventing a Client decision", async () => {
    const { service, storage } = await setup("changes_requested", 1);
    await EstimatePlanChangeRequestModel.create({ _id: "request", estimateId: "estimate", uploadId: "upload-1", sourcePageId: "page-1", clientId: client.id, idempotencyKey: "feedback", version: 1, summary: "Move the cabinet", annotations: { schemaVersion: 1, imageWidth: 100, imageHeight: 100, elements: [] }, targets: [], unassigned: true, status: "open" });
    await service.deleteUpload(designer, "upload-1");
    expect(await EstimatePlanChangeRequestModel.findById("request").lean()).toMatchObject({ status: "withdrawn", withdrawnById: designer.id, unassignedResolved: false, resolutionNote: null, version: 2 });
    const planReview = createEstimatePlanReviewService({ storage: storage as never, estimateDesigns: service, audit: { appendInMongoTransaction: vi.fn() } as never });
    await expect(planReview.staffPageImage(designer, "page-1")).rejects.toMatchObject({ status: 404 });
  });

  it("keeps surviving page feedback open when only one replacement target is deleted", async () => {
    const { service } = await setup("changes_requested", 2);
    await EstimateDesignDrawingModel.create({ _id: "drawing-b", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate", active: true, detectedTitle: "Bedroom", displayTitle: "Bedroom", source: "ocr", mappingStatus: "misc" });
    await EstimateDesignRevisionModel.create({ _id: "revision-b", drawingId: "drawing-b", revisionNumber: 1, sourcePageId: "page-1", crop: { x: 0, y: 0, width: 100, height: 100 }, croppedFileReference: "bedroom.png", label: "Bedroom", mappingStatus: "misc", reviewStatus: "changes_requested" });
    await EstimateDesignRevisionModel.create({ _id: "replacement-a", drawingId: "drawing-1", revisionNumber: 2, sourcePageId: "page-2", crop: { x: 0, y: 0, width: 100, height: 100 }, croppedFileReference: "replacement.png", label: "Living room", mappingStatus: "misc", reviewStatus: "draft", replacesRevisionId: "revision-1" });
    await EstimatePlanChangeRequestModel.create({ _id: "mixed-request", estimateId: "estimate", uploadId: "upload-1", sourcePageId: "page-1", clientId: client.id, idempotencyKey: "mixed-feedback", version: 1, summary: "Revise both rooms", annotations: { schemaVersion: 1, imageWidth: 100, imageHeight: 100, elements: [] }, targets: [{ drawingId: "drawing-1", requestedRevisionId: "revision-1", status: "replacement_submitted", resolvedByRevisionId: "replacement-a" }, { drawingId: "drawing-b", requestedRevisionId: "revision-b", status: "open" }], unassigned: false, status: "open" });
    await service.deleteUpload(designer, "upload-2");
    expect(await EstimatePlanChangeRequestModel.findById("mixed-request").lean()).toMatchObject({ status: "open", targets: [{ drawingId: "drawing-1", requestedRevisionId: "revision-1", status: "withdrawn" }, { drawingId: "drawing-b", requestedRevisionId: "revision-b", status: "open" }] });
    expect(await EstimateDesignDrawingModel.findById("drawing-b").lean()).toMatchObject({ active: true });
    expect((await service.approvalReadiness(client, "estimate")).ready).toBe(false);
  });

  it("rejects direct retry of a canceled dependent replacement", async () => {
    const { service } = await setup("changes_requested", 1);
    await EstimateDesignRevisionModel.updateOne({ _id: "revision-1" }, { $set: { reviewStatus: "changes_requested", replacementUploadId: "queued-replacement" } });
    await EstimateDesignUploadModel.create({ _id: "queued-replacement", estimateId: "estimate", leadId: "lead", originalFilename: "replacement.pdf", storedFileReference: "replacement-source", mimeType: "application/pdf", sizeBytes: 10, uploaderId: designer.id, uploadedAt: NOW, extractionStatus: "queued", replacementDrawingId: "drawing-1", replacesRevisionId: "revision-1", replacementVersion: 1 });
    await EstimateDesignExtractionJobModel.create({ _id: "queued-replacement-job", uploadId: "queued-replacement", status: "queued", attemptCount: 0, queuedAt: NOW });
    await service.deleteUpload(designer, "upload-1");
    await expect(service.retryUpload(designer, "queued-replacement")).rejects.toMatchObject({ code: "ESTIMATE_DESIGN_UPLOAD_LOCKED" });
    expect(await service.findOldestClaimableWorkerJob(NOW.toISOString())).toBeNull();
    expect(await EstimateDesignRevisionModel.findById("revision-1").lean()).toMatchObject({ replacementUploadId: null });
  });

  it("hides an obsolete deleted replacement source without deleting its newer drawing", async () => {
    const { service, workflow, storage } = await setup("ready_for_client", 2);
    await EstimateDesignDrawingModel.deleteOne({ _id: "drawing-2" });
    await EstimateDesignRevisionModel.deleteOne({ _id: "revision-2" });
    await EstimateDesignRevisionModel.create({ _id: "old-replacement", drawingId: "drawing-1", revisionNumber: 2, sourcePageId: "page-2", crop: { x: 0, y: 0, width: 100, height: 100 }, croppedFileReference: "old-crop.png", label: "Old replacement", mappingStatus: "misc", reviewStatus: "changes_requested", replacesRevisionId: "revision-1" });
    await EstimateDesignRevisionModel.create({ _id: "new-replacement", drawingId: "drawing-1", revisionNumber: 3, sourcePageId: "page-1", crop: { x: 0, y: 0, width: 100, height: 100 }, croppedFileReference: "new-crop.png", label: "New replacement", mappingStatus: "misc", reviewStatus: "submitted", replacesRevisionId: "old-replacement" });
    await service.deleteUpload(designer, "upload-2");
    expect(await EstimateDesignDrawingModel.findById("drawing-1").lean()).toMatchObject({ active: true });
    expect((await service.listEstimator(designer, "estimate")).revisions.map((revision) => revision.id)).not.toContain("old-replacement");
    await expect(service.revisionImage(designer, "old-replacement")).rejects.toMatchObject({ status: 404 });
    await EstimateModel.updateOne({ _id: "estimate" }, { $set: { designPlanStatus: "ready_for_client" } });
    expect((await service.listClient(client, "estimate")).revisions.map((revision) => revision.id)).not.toContain("old-replacement");
    // Historical rounds retain their immutable attachment storage references.
    expect(await DesignPlanReviewRoundModel.findById("round").select("+attachments.storageReference").lean()).toMatchObject({ status: "withdrawn", attachments: [{ storageReference: "source-1" }] });
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
