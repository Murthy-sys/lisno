import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import mongoose from "mongoose";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignPlanDocumentModel } from "../src/models/EstimateDesignPlanDocument.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createEstimateDesignService } from "../src/services/estimate-design.service.js";
import { createEstimatePlanDocumentService } from "../src/services/estimate-plan-document.service.js";
import { createProjectWorkflowService } from "../src/services/project-workflow.service.js";
import { loadEstimatePlanDocumentManifest } from "../src/services/estimate-plan-document-manifest.js";
import { loadPublishedPlanDocuments } from "../src/services/estimate-plan-document-publication.js";
import * as workflow from "../src/services/design-workflow-state.service.js";
import { layoutChoiceFixture, layoutLineageFixture, LAYOUT_AT } from "./fixtures/design-layout.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import type { DesignLayoutType } from "../src/contracts/design-layout-requirements.js";

const NOW = new Date(LAYOUT_AT);
const designer = { id: "designer", role: "designer", name: "Designer", email: "designer@example.test" } as const;
const command = (layoutType: DesignLayoutType = "layout_3d", idempotencyKey = "layout-classification-command") => ({ layoutType, idempotencyKey, expectedDesignPlanVersion: 0 });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("design-layout-tests");
  await EstimateDesignUploadModel.syncIndexes(); await EstimateDesignRevisionModel.syncIndexes(); await DesignPlanReviewRoundModel.syncIndexes(); await EstimateDesignPlanDocumentModel.syncIndexes();
}, 120_000);
beforeEach(async () => { await replica.clear(); });
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await replica.stop(); });

async function setup(types: Array<DesignLayoutType | null> = [null], option: "option_1" | "option_2" = "option_1") {
  // These tests exercise layout rules and real lifecycle transactions. Existing stage rules have their own lanes.
  vi.spyOn(workflow, "assertDesignWorkflowSubmissionAllowed").mockResolvedValue(undefined);
  const choice = layoutChoiceFixture("layout-project", option);
  const lineage = layoutLineageFixture(types);
  await UserModel.collection.insertMany([{ _id: designer.id, ...designer, active: true, deletedAt: null }, { _id: "other-designer", role: "designer", active: true, deletedAt: null }, { _id: "review-admin", role: "admin", active: true }] as never);
  await ProjectModel.collection.insertOne({ _id: "layout-project", clientId: "layout-project-client", name: "Test project", plannedStartAt: NOW, plannedEndAt: NOW, createdAt: NOW, updatedAt: NOW } as never);
  await ProjectAccessGrantModel.collection.insertOne({ _id: "review-grant", projectId: "layout-project", userId: "review-admin", module: "projects", source: "admin_initiator", active: true } as never);
  await DesignWorkflowStateModel.create({ _id: "layout-project", ...choice.state });
  await EstimateModel.collection.insertOne({ _id: "layout-estimate", leadId: "layout-lead", projectId: "layout-project", ownerId: "sales", status: "client_approved", designPlanDesignerId: designer.id,
    designPlanStatus: "in_progress", designPlanVersion: 0, designLifecycleVersion: 0, designFrozenAt: null, rooms: [{ id: "room", label: "Room" }], scopes: ["FC"] } as never);
  await LeadModel.collection.insertOne({ _id: "layout-lead", projectId: "layout-project", ownerId: "sales", clientName: "Layout Client", clientEmail: "client@example.test", projectName: "Test project" } as never);
  if (lineage.uploads.length) {
    await EstimateDesignUploadModel.insertMany(lineage.uploads);
    await EstimateDesignSourcePageModel.insertMany(lineage.pages);
    await EstimateDesignDrawingModel.insertMany(lineage.drawings);
    await EstimateDesignRevisionModel.insertMany(lineage.revisions);
    await EstimateDesignExtractionJobModel.insertMany(lineage.uploads.map(upload => ({ _id: `job-${upload._id}`, uploadId: upload._id, status: "estimator_review", attemptCount: 1, queuedAt: NOW })));
  }
  const objects = new Map<string, Buffer>();
  const storage = {
    save: vi.fn(async ({ data, extension }: { data: Buffer; extension: string }) => { const reference = `${randomUUID()}${extension}`; objects.set(reference, data); return { reference }; }),
    saveGenerated: vi.fn(async ({ data, extension }: { data: Buffer; extension: string }) => { const reference = `${randomUUID()}${extension}`; objects.set(reference, data); return { reference }; }),
    read: vi.fn(async (reference: string) => { const bytes = objects.get(reference); if (!bytes) throw new Error("missing test object"); return bytes; }),
    open: vi.fn(async (reference: string) => Readable.from(objects.get(reference)!)), delete: vi.fn(async (reference: string) => { objects.delete(reference); })
  };
  const audit = createAuditService(createMongoRepository());
  const documents = createEstimatePlanDocumentService({ storage, now: () => NOW, render: async () => { const pdf = await PDFDocument.create(); pdf.addPage([100, 80]); return Buffer.from(await pdf.save()); } });
  const mailer = { deliveryKind: "disabled" } as const;
  const projectWorkflow = createProjectWorkflowService({ storage, audit, mailer: mailer as never, now: () => NOW });
  const service = createEstimateDesignService({ storage, audit, planDocuments: documents, projectWorkflow, maxUploadBytes: 1_000_000, now: () => NOW });
  return { service, documents, projectWorkflow, storage, audit, objects, lineage };
}

describe("layout classification and review transactions", () => {
  it("labels an existing Sales draft once, persists identity, invalidates preparation, and replays without another audit", async () => {
    const { service, documents } = await setup();
    const before = await documents.prepareForSubmission(designer, "layout-estimate");
    const original = await EstimateDesignUploadModel.findById("layout-upload-0").lean();
    const saved = await service.classifyLayoutType(designer, "layout-upload-0", command());
    expect(saved.layoutType).toBe("layout_3d"); expect(saved.canClassifyLayoutType).toBe(false);
    await expect(service.classifyLayoutType(designer, "layout-upload-0", command())).resolves.toMatchObject({ layoutType: "layout_3d" });
    await expect(service.classifyLayoutType(designer, "layout-upload-0", command("layout_2d"))).rejects.toMatchObject({ status: 409 });
    expect(await AuditEventModel.countDocuments({ action: "estimate_design_layout_classified" })).toBe(1);
    const after = await EstimateDesignUploadModel.findById("layout-upload-0").lean();
    expect(after).toMatchObject({ storedFileReference: original!.storedFileReference, uploaderId: "sales", layoutClassification: { classifiedById: designer.id, choiceHistoryEventId: "layout-project-choice" } });
    expect((await loadEstimatePlanDocumentManifest("layout-estimate")).manifestHash).not.toBe(before.manifestHash);
    const session = await mongoose.startSession();
    try { await expect(session.withTransaction(() => documents.validateForSubmission("layout-estimate", before, ["layout-revision-0"], session))).rejects.toMatchObject({ code: "DESIGN_PLAN_DOCUMENT_STALE" }); } finally { await session.endSession(); }
    expect(await EstimateModel.findById("layout-estimate").lean()).toMatchObject({ designPlanVersion: 0, designLifecycleVersion: 1 });
  });

  it("serializes concurrent identical saves and rejects the competing category", async () => {
    const { service } = await setup();
    const same = await Promise.all([service.classifyLayoutType(designer, "layout-upload-0", command()), service.classifyLayoutType(designer, "layout-upload-0", command())]);
    expect(same.every(row => row.layoutType === "layout_3d")).toBe(true);
    expect(await AuditEventModel.countDocuments({ action: "estimate_design_layout_classified" })).toBe(1);
    await expect(service.classifyLayoutType(designer, "layout-upload-0", command("layout_2d", "competing-command"))).rejects.toMatchObject({ status: 409 });
  });

  it("allows only one winner when opposite types race", async () => {
    const { service } = await setup();
    const outcomes = await Promise.allSettled([service.classifyLayoutType(designer, "layout-upload-0", command("layout_2d", "first-command")), service.classifyLayoutType(designer, "layout-upload-0", command("layout_3d", "second-command"))]);
    expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(await AuditEventModel.countDocuments({ action: "estimate_design_layout_classified" })).toBe(1);
  });

  it("reauthorizes retries after assignment or active identity changes", async () => {
    const { service } = await setup();
    await service.classifyLayoutType(designer, "layout-upload-0", command());
    await EstimateModel.updateOne({ _id: "layout-estimate" }, { $set: { designPlanDesignerId: "other-designer" } });
    await expect(service.classifyLayoutType(designer, "layout-upload-0", command())).rejects.toMatchObject({ status: 404 });
    await EstimateModel.updateOne({ _id: "layout-estimate" }, { $set: { designPlanDesignerId: designer.id } });
    await UserModel.updateOne({ _id: designer.id }, { $set: { active: false } });
    await expect(service.classifyLayoutType(designer, "layout-upload-0", command())).rejects.toMatchObject({ status: 403 });
  });

  it.each(["approved-revision", "frozen", "submitted", "deleted", "foreign", "stale"])("rejects %s classification without writes", async kind => {
    const { service } = await setup();
    if (kind === "approved-revision") await EstimateDesignRevisionModel.updateOne({ _id: "layout-revision-0" }, { $set: { reviewStatus: "approved" } });
    if (kind === "frozen") await EstimateModel.updateOne({ _id: "layout-estimate" }, { $set: { designFrozenAt: NOW } });
    if (kind === "submitted") await DesignPlanReviewRoundModel.collection.insertOne({ _id: "locked-round", estimateId: "layout-estimate", status: "pending", attachments: [{ uploadId: "layout-upload-0" }] } as never);
    if (kind === "deleted") await EstimateDesignUploadModel.updateOne({ _id: "layout-upload-0" }, { $set: { deletedAt: NOW } });
    if (kind === "foreign") await EstimateModel.updateOne({ _id: "layout-estimate" }, { $set: { designPlanDesignerId: "other-designer" } });
    if (kind === "stale") await EstimateModel.updateOne({ _id: "layout-estimate" }, { $set: { designPlanVersion: 3 } });
    await expect(service.classifyLayoutType(designer, "layout-upload-0", command())).rejects.toMatchObject({ status: ["deleted", "foreign"].includes(kind) ? 404 : 409 });
    expect((await EstimateDesignUploadModel.findById("layout-upload-0").lean())!.layoutType).toBeUndefined();
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("rolls back category and lifecycle when audit persistence fails", async () => {
    const { service, audit } = await setup();
    vi.spyOn(audit, "appendInMongoTransaction").mockRejectedValue(new Error("audit unavailable"));
    await expect(service.classifyLayoutType(designer, "layout-upload-0", command())).rejects.toThrow("audit unavailable");
    expect((await EstimateDesignUploadModel.findById("layout-upload-0").lean())!.layoutType).toBeUndefined();
    expect((await EstimateModel.findById("layout-estimate").lean())!.designLifecycleVersion).toBe(0);
  });

  it.each([["layout_2d"], ["layout_3d"]] as DesignLayoutType[][])("does not submit Option 1 with only %s", async type => {
    const { service } = await setup([type as DesignLayoutType]);
    await expect(service.submitDrawings(designer, "layout-estimate")).rejects.toMatchObject({ code: "DESIGN_LAYOUTS_INCOMPLETE" });
    expect(await DesignPlanReviewRoundModel.countDocuments()).toBe(0);
    expect((await EstimateDesignRevisionModel.findById("layout-revision-0").lean())!.reviewStatus).toBe("draft");
  });

  it.each(["option_1", "option_2"] as const)("submits complete %s and pins immutable choice, categories, and original identities", async option => {
    const { service, documents } = await setup(option === "option_1" ? ["layout_2d", "layout_3d"] : ["layout_3d"], option);
    const result = await service.submitDrawings(designer, "layout-estimate");
    expect(result.deliveryStatus).toBe("disabled");
    const round = await DesignPlanReviewRoundModel.findById(result.reviewRoundId).select("+attachments.storageReference").lean();
    expect(round!.designLayoutSnapshot.choice.optionId).toBe(option);
    expect(round!.designLayoutSnapshot.layouts.map((item: any) => item.layoutType)).toEqual(option === "option_1" ? ["layout_2d", "layout_3d"] : ["layout_3d"]);
    expect(round!.attachments.every((item: any) => item.layoutType)).toBe(true);
    const snapshot = JSON.stringify(round!.attachments);
    await service.classifyLayoutType(designer, "layout-upload-0", command()).catch(() => undefined);
    expect(JSON.stringify((await DesignPlanReviewRoundModel.findById(result.reviewRoundId).select("+attachments.storageReference").lean())!.attachments)).toBe(snapshot);
    const historical = await documents.listClient({ id: "super", role: "super_admin", name: "Admin", email: "admin@example.test" }, "layout-estimate", String(result.reviewRoundId));
    expect(historical.documents.map(row => row.layoutType)).toEqual(round!.attachments.map((row: any) => row.layoutType));
  });

  it("blocks new upload without a valid choice or allowed type and compensates failed persistence", async () => {
    const { service, storage, audit, objects } = await setup([], "option_2");
    const file = { data: Buffer.from("layout"), originalFilename: "layout.pdf", mimeType: "application/pdf", extension: ".pdf", sizeBytes: 6 } as const;
    await expect(service.upload(designer, "layout-estimate", file, "layout_2d")).rejects.toMatchObject({ code: "DESIGN_LAYOUT_TYPE_NOT_ALLOWED" });
    await expect(service.upload(designer, "layout-estimate", file)).rejects.toMatchObject({ code: "DESIGN_LAYOUT_TYPE_REQUIRED" });
    expect(storage.save).not.toHaveBeenCalled();
    vi.spyOn(audit, "appendInMongoTransaction").mockRejectedValue(new Error("audit unavailable"));
    await expect(service.upload(designer, "layout-estimate", file, "layout_3d")).rejects.toThrow("audit unavailable");
    expect(objects.size).toBe(0); expect(storage.delete).toHaveBeenCalledOnce();
    expect(await EstimateDesignUploadModel.countDocuments()).toBe(0); expect(await EstimateDesignExtractionJobModel.countDocuments()).toBe(0);
    await DesignWorkflowStateModel.deleteMany({});
    await expect(service.upload(designer, "layout-estimate", file, "layout_3d")).rejects.toMatchObject({ code: "DESIGN_LAYOUT_CHOICE_REQUIRED" });
  });

  it("rejects stale preparation after classification and publishes only after preparing current labels", async () => {
    const { service, documents } = await setup(["layout_2d", null]);
    const stale = await documents.prepareForSubmission(designer, "layout-estimate");
    const capture = vi.spyOn(documents, "prepareForSubmission").mockResolvedValue(stale);
    await service.classifyLayoutType(designer, "layout-upload-1", command());
    await expect(service.submitDrawings(designer, "layout-estimate")).rejects.toMatchObject({ code: "DESIGN_PLAN_DOCUMENT_STALE" });
    expect(await DesignPlanReviewRoundModel.countDocuments()).toBe(0);
    expect((await EstimateDesignRevisionModel.findById("layout-revision-0").lean())!.reviewStatus).toBe("draft");
    capture.mockRestore();
    await expect(service.submitDrawings(designer, "layout-estimate")).resolves.toMatchObject({ deliveryStatus: "disabled" });
  });

  it("retries classification against a concurrently committed deletion without saving a label or audit", async () => {
    const { service, audit } = await setup();
    await EstimateDesignUploadModel.collection.updateOne({ _id: "layout-upload-0" } as never, { $set: { uploaderId: designer.id } });
    let deletionReady!: () => void, releaseDeletion!: () => void, classificationAttempted!: () => void;
    const deleting = new Promise<void>(resolve => { deletionReady = resolve; });
    const release = new Promise<void>(resolve => { releaseDeletion = resolve; });
    const attempted = new Promise<void>(resolve => { classificationAttempted = resolve; });
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementation(async (event, session) => {
      if (event.action === "estimate_design_upload_deleted") { deletionReady(); await release; }
      return append(event, session);
    });
    const deletion = service.deleteUpload(designer, "layout-upload-0");
    await deleting;
    const update = EstimateModel.updateOne.bind(EstimateModel);
    vi.spyOn(EstimateModel, "updateOne").mockImplementation((...args: any[]) => {
      if (args[1]?.$inc?.designLifecycleVersion) classificationAttempted();
      return update(...args as Parameters<typeof update>);
    });
    const classification = service.classifyLayoutType(designer, "layout-upload-0", command());
    // This transaction read the pre-deletion upload, then reached the shared Estimate write fence.
    await attempted; releaseDeletion();
    await expect(deletion).resolves.toMatchObject({ deleted: true });
    await expect(classification).rejects.toMatchObject({ status: 404 });
    const upload = await EstimateDesignUploadModel.findById("layout-upload-0").lean();
    expect(upload!.deletedAt).toEqual(NOW); expect(upload!.layoutType).toBeUndefined();
    expect(await AuditEventModel.countDocuments({ action: "estimate_design_layout_classified" })).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "estimate_design_upload_deleted" })).toBe(1);
  });

  it("keeps an old approved untyped round readable and rejects retroactive labeling", async () => {
    const { service, documents } = await setup();
    const prepared = await documents.prepareForSubmission(designer, "layout-estimate");
    const original = prepared.documents[0]!;
    await DesignPlanReviewRoundModel.create({ _id: "old-untyped-round", estimateId: "layout-estimate", projectId: "layout-project", leadId: "layout-lead", designPlanVersion: 1,
      recipientEmail: "client@example.test", clientName: "Client", projectName: "Test", submittedRevisionIds: ["layout-revision-0"],
      attachments: [{ uploadId: original.sourceUploadId, filename: original.filename, mimeType: original.mimeType, byteSize: original.byteSize, sha256: original.sha256, storageReference: original.storageReference }],
      planManifestHash: prepared.manifestHash, planDocuments: [{ documentId: original.documentId, sourceUploadId: original.sourceUploadId, manifestHash: original.manifestHash }],
      submittedById: designer.id, submittedAt: NOW, assignedAdminId: "review-admin", status: "approved", deliveryStatus: "sent" });
    await expect(service.classifyLayoutType(designer, "layout-upload-0", command())).rejects.toMatchObject({ status: 409 });
    const actor = { id: "super", role: "super_admin", name: "Admin", email: "admin@example.test" } as const;
    expect((await documents.listClient(actor, "layout-estimate", "old-untyped-round")).documents[0]!.layoutType).toBeNull();
    const bytes = await documents.readClient(actor, "layout-estimate", original.documentId, "old-untyped-round");
    expect(bytes.bytes.length).toBe(original.byteSize);
    expect((await EstimateDesignUploadModel.findById("layout-upload-0").lean())!.layoutType).toBeUndefined();
  });

  it("does not relabel a legacy changes-requested round when its editable draft is later classified", async () => {
    const { service } = await setup();
    await DesignPlanReviewRoundModel.collection.insertOne({ _id: "legacy-round", estimateId: "layout-estimate", status: "changes_requested", designPlanVersion: 1,
      submittedRevisionIds: ["layout-revision-0"], attachments: [{ uploadId: "layout-upload-0", filename: "original.pdf" }] } as never);
    const actor = { id: "super", role: "super_admin", name: "Admin", email: "admin@example.test" } as const;
    const before = await loadPublishedPlanDocuments(actor, "layout-estimate", "legacy-round");
    await service.classifyLayoutType(designer, "layout-upload-0", command());
    const after = await loadPublishedPlanDocuments(actor, "layout-estimate", "legacy-round");
    expect(after.documents[0]!.manifest).not.toHaveProperty("layoutType");
    expect(after.documents[0]!.manifest).not.toHaveProperty("layoutClassification");
    expect(after.documents[0]!.manifestHash).toBe(before.documents[0]!.manifestHash);
  });

  it.each(["drawing_replacement", "plan_request_replacement"])("keeps the workspace readable after deleting an original with retained %s history", async purpose => {
    const { service } = await setup(["layout_3d"], "option_2");
    await EstimateDesignUploadModel.collection.updateOne({ _id: "layout-upload-0" } as never, { $set: { uploaderId: designer.id } });
    const other = layoutLineageFixture(["layout_2d", "layout_3d"]);
    const otherChoice = layoutChoiceFixture("other-project", "option_1");
    const otherRows = JSON.parse(JSON.stringify(other).replaceAll("layout-", "other-"));
    otherRows.uploads.forEach((upload: any) => { upload.layoutClassification.choiceHistoryEventId = otherChoice.record.historyEventId; });
    await ProjectModel.collection.insertOne({ _id: "other-project", clientId: "other-project-client" } as never);
    await DesignWorkflowStateModel.create({ _id: "other-project", ...otherChoice.state });
    await EstimateModel.collection.insertOne({ _id: "other-estimate", projectId: "other-project", status: "client_approved", designPlanDesignerId: "other-designer", designPlanStatus: "in_progress", designPlanVersion: 2 } as never);
    await EstimateDesignUploadModel.insertMany(otherRows.uploads); await EstimateDesignSourcePageModel.insertMany(otherRows.pages);
    await EstimateDesignDrawingModel.insertMany(otherRows.drawings); await EstimateDesignRevisionModel.insertMany(otherRows.revisions);
    const otherDesigner = { ...designer, id: "other-designer" };
    const otherBefore = (await service.listEstimator(otherDesigner, "other-estimate")).layoutRequirements;
    await EstimateDesignUploadModel.create({ _id: "retained-replacement", estimateId: "layout-estimate", leadId: "layout-lead", originalFilename: "replacement.pdf", storedFileReference: "replacement-source",
      mimeType: "application/pdf", sizeBytes: 12, uploaderId: designer.id, uploadedAt: NOW, extractionStatus: "queued", purpose,
      ...(purpose === "drawing_replacement" ? { replacementDrawingId: "layout-drawing-0", replacesRevisionId: "layout-revision-0", replacementVersion: 1 } : {
        planRequestReplacement: { requestId: "replacement-request", requestVersion: 1, sourcePageId: "layout-page-0", idempotencyKey: "replacement-command", targets: [{ drawingId: "layout-drawing-0", requestedRevisionId: "layout-revision-0", detectedTitle: "Room", normalizedTitle: "room", mapping: { roomId: "room", scopeSectionId: "FC", catalogueId: "FC.MAIN" } }] }
      }) });
    await EstimateDesignExtractionJobModel.create({ _id: "retained-job", uploadId: "retained-replacement", status: "queued", attemptCount: 0, queuedAt: NOW });
    await service.deleteUpload(designer, "layout-upload-0");
    const workspace = await service.listEstimator(designer, "layout-estimate");
    expect(workspace.uploads.map(row => row.id)).toEqual(["retained-replacement"]);
    expect(workspace.uploads[0]!.layoutType).toBe("layout_3d");
    expect(workspace.drawings).toHaveLength(0); expect(workspace.pages).toHaveLength(0);
    expect(workspace.layoutRequirements).toMatchObject({ coverageComplete: false, missingTypes: ["layout_3d"] });
    expect((await service.listEstimator(otherDesigner, "other-estimate")).layoutRequirements).toEqual(otherBefore);
  });

  it("retains qualifying current content when an obsolete replacement source was deleted", async () => {
    const { service, lineage } = await setup(["layout_3d"], "option_2");
    for (let index = 1; index <= 2; index++) {
      await EstimateDesignUploadModel.create({ ...lineage.uploads[0]!, _id: `chain-upload-${index}`, purpose: "drawing_replacement", uploaderId: designer.id,
        replacementDrawingId: "layout-drawing-0", replacesRevisionId: index === 1 ? "layout-revision-0" : "chain-revision-1", replacementVersion: index,
        extractionStatus: index === 1 ? "changes_requested" : "estimator_review" });
      await EstimateDesignSourcePageModel.create({ ...lineage.pages[0]!, _id: `chain-page-${index}`, uploadId: `chain-upload-${index}`, sourceKind: "replacement" });
      await EstimateDesignRevisionModel.create({ ...lineage.revisions[0]!, _id: `chain-revision-${index}`, revisionNumber: index + 1, sourcePageId: `chain-page-${index}`,
        reviewStatus: index === 1 ? "changes_requested" : "draft", replacesRevisionId: index === 1 ? "layout-revision-0" : "chain-revision-1" });
    }
    await service.deleteUpload(designer, "chain-upload-1");
    const workspace = await service.listEstimator(designer, "layout-estimate");
    expect(workspace.uploads.map(row => row.id)).not.toContain("chain-upload-1");
    expect(workspace.pages.map(row => row.id)).not.toContain("chain-page-1");
    expect(workspace.revisions.map(row => row.id)).not.toContain("chain-revision-1");
    expect(workspace.layoutRequirements).toMatchObject({ coverageComplete: true, missingTypes: [], coverage: [{ layoutType: "layout_3d", qualifyingUploadIds: ["layout-upload-0"] }] });
    expect(workspace.uploads.find(row => row.id === "chain-upload-2")!.layoutType).toBe("layout_3d");
  });

  it("locks a legacy pending replacement-only round by its submitted revision ancestry", async () => {
    const { service, lineage } = await setup();
    await EstimateDesignUploadModel.create({ ...lineage.uploads[0]!, _id: "pending-replacement", purpose: "drawing_replacement", uploaderId: designer.id,
      replacementDrawingId: "layout-drawing-0", replacesRevisionId: "layout-revision-0", replacementVersion: 1, extractionStatus: "submitted" });
    await EstimateDesignSourcePageModel.create({ ...lineage.pages[0]!, _id: "pending-page", uploadId: "pending-replacement", sourceKind: "replacement" });
    await EstimateDesignRevisionModel.create({ ...lineage.revisions[0]!, _id: "pending-revision", revisionNumber: 2, sourcePageId: "pending-page", reviewStatus: "submitted", replacesRevisionId: "layout-revision-0" });
    await DesignPlanReviewRoundModel.collection.insertOne({ _id: "pending-round", estimateId: "layout-estimate", status: "pending", submittedRevisionIds: ["pending-revision"], attachments: [{ uploadId: "pending-replacement" }] } as never);
    // Legacy status drift must not make the root editable while a submitted replacement is locked.
    expect((await service.listEstimator(designer, "layout-estimate")).uploads.find(row => row.id === "layout-upload-0")).toMatchObject({ canClassifyLayoutType: false, classificationBlockedReason: "This file is locked in a submitted review." });
    await expect(service.classifyLayoutType(designer, "layout-upload-0", command())).rejects.toMatchObject({ status: 409, message: "This file is locked in a submitted review." });
    expect((await EstimateDesignUploadModel.findById("layout-upload-0").lean())!.layoutType).toBeUndefined();
    expect(await AuditEventModel.countDocuments({ action: "estimate_design_layout_classified" })).toBe(0);
    expect((await EstimateModel.findById("layout-estimate").lean())!.designLifecycleVersion).toBe(0);
  });
});
