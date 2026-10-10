import mongoose from "mongoose";
import { Readable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionCommand } from "../src/contracts/vendor-execution.js";
import type { ApprovedPurchaseOrderLine } from "../src/domain/project-purchase-order.js";
import { vendorWorkAssignmentId } from "../src/domain/vendor-work.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectCompletionDecisionModel } from "../src/models/ProjectCompletionDecision.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { SiteCompletionReviewModel } from "../src/models/SiteCompletionReview.js";
import { SiteCompletionStateModel } from "../src/models/SiteCompletionState.js";
import { UserModel } from "../src/models/User.js";
import { UserInvitationModel } from "../src/models/UserInvitation.js";
import { VendorAccessIntentModel } from "../src/models/VendorAccessIntent.js";
import { VendorExecutionEventModel } from "../src/models/VendorExecutionEvent.js";
import { VendorExecutionReviewModel } from "../src/models/VendorExecutionReview.js";
import { VendorExecutionStateModel } from "../src/models/VendorExecutionState.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { VendorWorkImageModel } from "../src/models/VendorWorkImage.js";
import { VendorWorkReviewModel } from "../src/models/VendorWorkReview.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectCompletionService } from "../src/services/project-completion.service.js";
import { createSiteCompletionService } from "../src/services/site-completion.service.js";
import { createVendorExecutionService, initializeIssuedExecution } from "../src/services/vendor-execution.service.js";
import { vendorExecutionInventory } from "../src/services/vendor-execution-inventory.js";
import { createVendorWorkOnboardingService } from "../src/services/vendor-work-onboarding.service.js";
import { createVendorWorkService, onPurchaseOrderApproved } from "../src/services/vendor-work.service.js";
import type { FileStorage } from "../src/storage/storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/vendor-readiness.service.js", () => ({ vendorActivation: vi.fn(async () => ({ effectiveStatus: "active" })) }));
const now = new Date("2026-10-08T06:00:00Z");
const actor = (id: string, role: PublicUser["role"], vendorId?: string): PublicUser => ({ id, name: id, email: `${id}@example.test`, role, ...(vendorId ? { vendorId } : {}) });
const vendor = actor("vendor", "vendor", "vendor-a");
const site = actor("site", "site_manager");
const admin = actor("admin", "super_admin");
const client = actor("client", "client");
const workId = vendorWorkAssignmentId("order-a", 1, "line-a");
const line: ApprovedPurchaseOrderLine = {
  id: "line-a", procurementItemId: "item-a", procurementItemVersion: 1, estimateId: "estimate-a", estimateVersion: 1,
  estimateReviewRoundId: "round-a", sourceSectionId: "CA", sourceLineItemKey: "source-a", roomName: "Living Room", itemName: "Cabinet",
  brand: "Approved brand", uomId: "sheet", uomCode: "SHT", uomName: "Sheet", quantityMilliUnits: 2500, unitPricePaise: 10000,
  gstBasisPoints: 0, description: "Install approved cabinet", targetDate: "2026-10-15", netPaise: 25000, gstPaise: 0, totalPaise: 25000
};
const approval = { orderId: "order-a", projectId: "project-a", vendorId: "vendor-a", revision: 1,
  approvedRevisionId: "revision-a", actorId: admin.id, occurredAt: now, lines: [line] };
const repository = createMongoRepository();
const audit = createAuditService(repository);
const files = new Map<string, Buffer>();
let sequence = 0;
const storage: FileStorage = {
  async save(input) { const reference = `integration-photo-${++sequence}`; files.set(reference, input.data); return { reference }; },
  async saveGenerated(input) { return this.save(input); },
  async read(reference) { return files.get(reference)!; },
  async open(reference) { return Readable.from(files.get(reference)!); },
  async delete(reference) { files.delete(reference); }
};
const execution = createVendorExecutionService({ audit, now: () => now });
const work = createVendorWorkService({ audit, storage, maxUploadBytes: 100000, now: () => now });
const completion = createSiteCompletionService({ audit, now: () => now });
const closure = createProjectCompletionService({ audit, now: () => now });
const sendInvitation = vi.fn(async () => undefined);
const sendNewWork = vi.fn(async () => undefined);
const onboarding = createVendorWorkOnboardingService({ repository, audit, clock: () => now,
  invitationMailer: { deliveryKind: "local_test", sendInvitation }, workMailer: { deliveryKind: "local_test", sendNewWork }, authorizeProject: async () => undefined });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-execution-integration-tests");
  for (const model of [UserModel, ProjectModel, VendorWorkAssignmentModel, VendorWorkImageModel, VendorWorkReviewModel,
    VendorExecutionStateModel, VendorExecutionEventModel, VendorExecutionReviewModel, SiteCompletionStateModel,
    SiteCompletionReviewModel, ProjectCompletionDecisionModel, VendorAccessIntentModel, AuditEventModel]) await model.syncIndexes();
}, 120000);
beforeEach(async () => {
  await replica.clear(); files.clear(); sequence = 0; sendInvitation.mockClear(); sendNewWork.mockClear();
  await UserModel.create([vendor, site, admin, client].map(user => ({ _id: user.id, name: user.name, email: user.email,
    emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, active: true, vendorId: user.vendorId ?? null })));
  await AiEstimatorKnowledgeVendorModel.collection.insertOne({ _id: "vendor-a", name: "Trade vendor", status: "active",
    procurementProfile: { email: "vendor@example.test", phoneNumber: "+919000000000" } } as any);
  await ProjectModel.create({ _id: "project-a", name: "Project", clientId: client.id, clientName: client.name, clientEmail: client.email,
    clientEmailNormalized: client.email, clientMobile: "9000000000", clientAddress: "Site", status: "active", location: "Bengaluru",
    completionAuthority: "vendor_client", completionAuthorityVersion: 1, plannedStartAt: now, plannedEndAt: new Date("2026-11-01T00:00:00Z") });
  await ProjectWorkflowTaskModel.create({ _id: "site-task", dedupeKey: "site-task", projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1,
    kind: "site_execution", title: "Site execution", assigneeRole: "site_manager", assigneeUserId: site.id, status: "open", progress: 0, version: 1, openedAt: now });
  const lineItems = [{ id: "source-a", catalogueId: "CA01", roomName: "Living Room", specification: "Cabinet", unit: "sheet", rate: 250, quantity: 1, included: true, amount: 250 }];
  await EstimateModel.create({ _id: "estimate-a", leadId: "lead-a", ownerId: admin.id, version: 2, status: "client_approved", propertyType: "villa", rooms: [], scopes: [],
    lineItems, subtotal: 250, gst: 0, total: 250, approvalRequired: false, projectId: "project-a", reviews: [{ actorId: admin.id, action: "client_approved", note: "Approved", occurredAt: now }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: now, designPlanApprovedById: admin.id, designPlanApprovalSource: "admin_proof", clientDecisionAt: now });
  await EstimateClientReviewRoundModel.create({ _id: "round-a", estimateId: "estimate-a", leadId: "lead-a", projectId: null, estimateVersion: 1, sendGeneration: 1,
    dedupeKey: "a".repeat(64), recipientEmail: client.email, recipientEmailNormalized: client.email,
    estimateSnapshot: { clientName: client.name, projectName: "Project", location: "Bengaluru", propertyType: "villa", lineItems, subtotal: 250, gst: 0, total: 250 },
    pdfFilename: "approved.pdf", pdfMimeType: "application/pdf", pdfByteSize: 1, pdfSha256: "b".repeat(64), pdfStorageReference: "approved.pdf",
    deliveryStatus: "sent", deliveryAttemptGeneration: 1, deliveryAttemptCount: 1, deliveryAttemptedAt: now, deliveredAt: now, assignedAdminId: admin.id,
    status: "approved", decision: "approve", decisionSource: "admin_proof", decisionNote: "Approved", decidedById: admin.id, decidedAt: now, version: 2 });
});
afterAll(async () => { await replica?.stop(); });
async function issue(failAfterHooks = false) {
  return mongoose.connection.transaction(async session => {
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "order-a", orderNumber: "PO-A", projectId: "project-a", vendorId: "vendor-a", status: "pending_approval",
      approvedRevision: null, approvedRevisionId: null, cancelledAt: null } as any, { session });
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "revision-a", orderId: "order-a", orderNumber: "PO-A", projectId: "project-a", vendorId: "vendor-a", revision: 1,
      estimateId: "estimate-a", estimateVersion: 1, estimateReviewRoundId: "round-a", lines: [line], netPaise: 25000, gstPaise: 0, totalPaise: 25000 } as any, { session });
    await onPurchaseOrderApproved(approval, session);
    await initializeIssuedExecution(approval, session);
    await onboarding.recordIssued(approval, session);
    if (failAfterHooks) throw new Error("Approval transaction failed");
    await ProjectPurchaseOrderModel.updateOne({ _id: "order-a" }, { $set: { status: "approved", approvedRevision: 1, approvedRevisionId: "revision-a", approvedNetPaise: 25000, approvedGstPaise: 0, approvedTotalPaise: 25000 } }, { session });
  });
}
async function command(user: PublicUser, action: ExecutionCommand["action"], fields: Partial<ExecutionCommand> = {}) {
  const current = await execution.detail(user, workId);
  return execution.command(user, workId, { action, expectedVersion: current.version, idempotencyKey: `integration-command-${++sequence}`, ...fields });
}
async function schedule() {
  await command(vendor, "acknowledge");
  await command(vendor, "propose_schedule", { startDate: "2026-10-09", finishDate: "2026-10-15" });
  await command(site, "confirm_schedule", { startDate: "2026-10-09", finishDate: "2026-10-15" });
}
async function photo() {
  const before = await work.getMine(vendor, workId);
  const previousImages = new Set((await execution.detail(vendor, workId)).imageIds);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YF5YwAAAABJRU5ErkJggg==", "base64");
  await work.uploadImage(vendor, workId, { expectedVersion: before.version, idempotencyKey: `integration-photo-${++sequence}` }, {
    data: png, extension: ".png", originalFilename: "evidence.png", mimeType: "image/png", sizeBytes: png.length
  });
  const current = await execution.detail(vendor, workId);
  return current.imageIds.find(id => !previousImages.has(id))!;
}
async function reportComplete(note = "Installation complete") {
  return command(vendor, "report", { status: "in_progress", progress: 100, note, reason: "Current round work completed" });
}
async function verify(imageIds: string[]) {
  const submitted = await command(vendor, "submit", { note: "Ready for Site Manager inspection", imageIds });
  return command(site, "verify", { submissionId: submitted.submission!.id });
}

describe("vendor execution across issuance, evidence and completion", () => {
  it("commits assignment, execution and access intent together after issuance and rolls all back on failure", async () => {
    await expect(issue(true)).rejects.toThrow("Approval transaction failed");
    for (const model of [ProjectPurchaseOrderModel, ProjectPurchaseOrderRevisionModel, VendorWorkAssignmentModel, VendorExecutionStateModel, VendorExecutionEventModel, VendorAccessIntentModel]) {
      expect(await model.countDocuments()).toBe(0);
    }
    await issue();
    await mongoose.connection.transaction(async session => {
      await onPurchaseOrderApproved(approval, session); await initializeIssuedExecution(approval, session); await onboarding.recordIssued(approval, session);
    });
    for (const model of [VendorWorkAssignmentModel, VendorExecutionStateModel, VendorExecutionEventModel, VendorAccessIntentModel]) expect(await model.countDocuments()).toBe(1);
    expect(await VendorAccessIntentModel.findOne().lean()).toMatchObject({ state: "queued", approvedRevisionId: "revision-a", revision: 1 });
    expect(await UserInvitationModel.countDocuments()).toBe(0);
    expect(sendInvitation).not.toHaveBeenCalled(); expect(sendNewWork).not.toHaveBeenCalled();
    expect(await execution.detail(vendor, workId)).toMatchObject({ quantityMilliUnits: 2500, uomCode: "SHT", originalTargetDate: "2026-10-15" });
  });

  it("binds Client submission to the exact verified images after Site Manager rework and preserves both histories", async () => {
    await issue(); await schedule(); const oldImage = await photo(); await reportComplete();
    const first = await command(vendor, "submit", { note: "First inspection", imageIds: [oldImage] });
    await command(site, "request_changes", { submissionId: first.submission!.id, reason: "Repair the cabinet alignment" });
    expect((await work.getMine(vendor, workId)).currentRound).toBe(1);
    const currentImage = await photo(); const unusedImage = await photo(); await reportComplete("Cabinet aligned");
    const verified = await verify([currentImage]);
    const assignment = await work.getMine(vendor, workId);
    const sent = await work.submit(vendor, workId, { expectedVersion: assignment.version, idempotencyKey: "client-submit-current", note: "Please inspect cabinet" });
    expect(sent.imageIds).toEqual([currentImage]); expect(sent.imageIds).not.toContain(oldImage); expect(sent.imageIds).not.toContain(unusedImage);
    expect(await VendorWorkReviewModel.findById(sent.id).lean()).toMatchObject({ executionVerificationId: verified.verification!.id,
      executionRound: 2, executionSubmissionVersion: verified.submission!.version, imageIds: [currentImage] });
    await work.clientDecision(client, "project-a", sent.id, { expectedVersion: sent.version, idempotencyKey: "client-return-work", decision: "request_changes", reason: "Adjust shelf height" });
    expect(await execution.detail(vendor, workId)).toMatchObject({ status: "changes_requested", executionRound: 3, verification: null });
    expect((await work.getMine(vendor, workId)).currentRound).toBe(2);
    expect(await VendorExecutionReviewModel.findById(verified.verification!.id).lean()).toMatchObject({ imageIds: [currentImage], decision: { outcome: "verified" } });
    expect(await VendorWorkReviewModel.findById(sent.id).lean()).toMatchObject({ imageIds: [currentImage], status: "changes_requested" });
    await reportComplete("Shelf corrected");
    const reopened = await work.getMine(vendor, workId);
    await expect(work.submit(vendor, workId, { expectedVersion: reopened.version, idempotencyKey: "client-submit-before-reverify", note: "Please inspect again" }))
      .rejects.toMatchObject({ code: "EXECUTION_VERIFICATION_REQUIRED" });
    await expect(command(vendor, "submit", { note: "Old photo is not current evidence", imageIds: [currentImage] })).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_INVALID" });
  });

  it("requires fresh per-line verification after project Client rejection and retains exact evidence through final closure", async () => {
    await issue(); await schedule(); const firstImage = await photo(); await reportComplete();
    const firstVerified = await verify([firstImage]);
    const saved = await completion.progress(site, "project-a", { expectedVersion: 0, idempotencyKey: "site-save-first", progress: 100, note: "Inspect installed work" });
    const sent = await completion.submit(site, "project-a", { expectedVersion: saved.version, idempotencyKey: "site-submit-first", note: "Inspect installed work" });
    expect((await SiteCompletionReviewModel.findById(sent.review!.id).lean())?.sections[0]).toMatchObject({ imageIds: [firstImage], executionVerificationId: firstVerified.verification!.id, executionRound: 1 });
    const returned = await completion.decide(client, "project-a", { expectedVersion: sent.review!.version, idempotencyKey: "client-project-return", decision: "request_changes", reason: "Refinish the cabinet edge" });
    expect(await execution.detail(vendor, workId)).toMatchObject({ status: "changes_requested", executionRound: 2, verification: null });
    const prematurelySaved = await completion.progress(site, "project-a", { expectedVersion: returned.version, idempotencyKey: "site-save-unverified", progress: 100, note: "Cannot bypass individual inspection" });
    expect(prematurelySaved.canSubmit).toBe(false);
    expect((await closure.summary(admin, "project-a")).blockers).toContainEqual(expect.objectContaining({ code: "EXECUTION_VERIFICATION_PENDING" }));
    await expect(completion.submit(site, "project-a", { expectedVersion: prematurelySaved.version, idempotencyKey: "site-submit-unverified", note: "Cannot bypass individual inspection" }))
      .rejects.toMatchObject({ code: "SITE_COMPLETION_BLOCKED" });
    const newImage = await photo(); await reportComplete("Cabinet edge refinished"); const currentVerified = await verify([newImage]);
    const current = await work.getMine(vendor, workId);
    await expect(work.submit(vendor, workId, { expectedVersion: current.version, idempotencyKey: "legacy-path-after-project-review", note: "Project review owns handoff" }))
      .rejects.toMatchObject({ code: "SITE_COMPLETION_IN_REVIEW" });
    const second = await completion.submit(site, "project-a", { expectedVersion: prematurelySaved.version, idempotencyKey: "site-submit-current", note: "Cabinet edge refinished" });
    expect(second.review!.round).toBe(2);
    expect((await SiteCompletionReviewModel.findById(second.review!.id).lean())?.sections[0]).toMatchObject({ imageIds: [newImage], executionVerificationId: currentVerified.verification!.id,
      executionRound: 2, executionSubmissionVersion: currentVerified.submission!.version });
    expect((await SiteCompletionReviewModel.findById(sent.review!.id).lean())?.sections[0]).toMatchObject({ imageIds: [firstImage], executionVerificationId: firstVerified.verification!.id });
    await completion.decide(client, "project-a", { expectedVersion: second.review!.version, idempotencyKey: "client-project-approve", decision: "approve", reason: null });
    const ready = await closure.summary(admin, "project-a"); expect(ready.readyForCompletion).toBe(true);
    const closed = await closure.complete(admin, "project-a", { expectedAuthorityVersion: ready.completionAuthorityVersion, idempotencyKey: "complete-verified-project" });
    expect(await ProjectCompletionDecisionModel.findById(closed.id).lean()).toMatchObject({ siteCompletionReviewId: second.review!.id, approvedRevisionIds: ["revision-a"] });
    expect(await VendorExecutionReviewModel.countDocuments({ assignmentId: workId, "decision.outcome": "verified" })).toBe(2);
  });

  it("reports rollout inventory counts without changing old work, creating access intents or sending messages", async () => {
    await issue();
    await ProjectPurchaseOrderRevisionModel.collection.updateOne({ _id: "revision-a" as any }, { $push: { lines: { $each: [{ ...line, id: "pending-line" }, { ...line, id: "accepted-line" }] } } } as any);
    await VendorWorkAssignmentModel.collection.insertMany([
      { _id: "old-open", orderId: "missing-order", orderRevision: 1, lineId: "old-line", projectId: "project-without-manager", vendorId: "missing-contact", status: "ready" },
      { _id: "old-pending", orderId: "order-a", orderRevision: 1, lineId: "pending-line", projectId: "project-a", vendorId: "vendor-a", status: "submitted_for_client" },
      { _id: "old-accepted", orderId: "order-a", orderRevision: 1, lineId: "accepted-line", projectId: "project-a", vendorId: "vendor-a", status: "client_approved" },
      { _id: "old-superseded", orderId: "missing-order", projectId: "project-a", vendorId: "missing-contact", status: "superseded" }
    ] as any);
    const before = await VendorWorkAssignmentModel.find().sort({ _id: 1 }).lean();
    expect(await vendorExecutionInventory()).toEqual({ assignments: 4, open: 2, pendingClientReview: 1, clientAccepted: 1,
      tracked: 1, setupRequired: 1, missingIssuedSource: 1, missingVendorContact: 1, missingSiteManager: 1 });
    expect(await VendorWorkAssignmentModel.find().sort({ _id: 1 }).lean()).toEqual(before);
    expect(await VendorAccessIntentModel.countDocuments()).toBe(1); expect(await VendorExecutionStateModel.countDocuments()).toBe(1);
    expect(await UserInvitationModel.countDocuments()).toBe(0); expect(sendInvitation).not.toHaveBeenCalled(); expect(sendNewWork).not.toHaveBeenCalled();
  });
});
