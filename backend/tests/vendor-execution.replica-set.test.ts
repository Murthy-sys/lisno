import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionAction, ExecutionCommand, ExecutionWork } from "../src/contracts/vendor-execution.js";
import { executionCommandSchema, executionCutoff, executionLocalDate } from "../src/domain/vendor-execution.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { SiteCompletionStateModel } from "../src/models/SiteCompletionState.js";
import { UserModel } from "../src/models/User.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { VendorWorkImageModel } from "../src/models/VendorWorkImage.js";
import { VendorWorkReviewModel } from "../src/models/VendorWorkReview.js";
import { VendorExecutionStateModel } from "../src/models/VendorExecutionState.js";
import { VendorExecutionEventModel } from "../src/models/VendorExecutionEvent.js";
import { VendorExecutionReviewModel } from "../src/models/VendorExecutionReview.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { assertExecutionEditable, assertExecutionVerified, assertNoExecutionActivityForAmendment, createVendorExecutionService, currentExecutionVerification, initializeIssuedExecution, invalidateExecutionVerificationForClientChanges } from "../src/services/vendor-execution.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/vendor-readiness.service.js", () => ({ vendorActivation: vi.fn(async (vendor: { status: string }) => ({ effectiveStatus: vendor.status === "active" ? "active" : "inactive" })) }));
const actor = (id: string, role: PublicUser["role"], vendorId?: string): PublicUser => ({ id, name: id, email: `${id}@example.test`, role, ...(vendorId ? { vendorId } : {}) });
const vendor = actor("vendor-user", "vendor", "vendor-a");
const otherVendor = actor("other-vendor", "vendor", "vendor-b");
const site = actor("site-a", "site_manager");
const otherSite = actor("site-b", "site_manager");
const manager = actor("program-a", "program_manager");
const otherManager = actor("program-b", "program_manager");
const admin = actor("admin", "super_admin");
const client = actor("client", "client");
const id = "vendor-work:order-a:1:line-a";
const secondId = "vendor-work:order-b:1:line-a";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let clock = new Date("2026-10-08T09:00:00Z");
let serial = 0;
const service = createVendorExecutionService({ audit: createAuditService(createMemoryRepository()), now: () => clock });
const issuedLine = { id: "line-a", procurementItemId: "item-a", procurementItemVersion: 1, estimateId: "estimate-a", estimateVersion: 2, estimateReviewRoundId: "estimate-round-a", sourceSectionId: "basket-a", sourceLineItemKey: "source-a",
  roomName: "Living", itemName: "Ceiling", brand: "Approved", uomId: "sqm", uomCode: "SQM", uomName: "Square metre", quantityMilliUnits: 12_500, unitPricePaise: 7500, gstBasisPoints: 0,
  description: "Install the approved ceiling", targetDate: "2026-10-15", netPaise: 93750, gstPaise: 0, totalPaise: 93750 };
async function initialize(orderId = "order-a", projectId = "project-a", vendorId = "vendor-a") {
  await mongoose.connection.transaction(session => initializeIssuedExecution({ orderId, projectId, vendorId, revision: 1, lines: [issuedLine], actorId: admin.id, occurredAt: clock }, session));
}
async function command(who: PublicUser, action: ExecutionAction, fields: Partial<ExecutionCommand> = {}, workId = id): Promise<ExecutionWork> {
  const row = await service.detail(who, workId);
  return service.command(who, workId, { action, expectedVersion: row.version, idempotencyKey: `command-${++serial}`, ...fields });
}
async function schedule() {
  await initialize(); await command(vendor, "acknowledge");
  await command(vendor, "propose_schedule", { startDate: "2026-10-09", finishDate: "2026-10-15" });
  return command(manager, "confirm_schedule", { startDate: "2026-10-09", finishDate: "2026-10-15" });
}
async function submission() {
  await schedule();
  await command(vendor, "report", { progress: 100, status: "in_progress", note: "Ceiling completed" });
  await command(site, "exempt_evidence", { reason: "Client restricted indoor photography; physical inspection arranged" });
  return command(vendor, "submit", { note: "Ready for inspection" });
}
beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-execution-tests");
  for (const model of [UserModel, VendorExecutionStateModel, VendorExecutionEventModel, VendorExecutionReviewModel, VendorWorkAssignmentModel, AuditEventModel]) await model.syncIndexes();
}, 120_000);
beforeEach(async () => {
  await replica.clear(); serial = 0; clock = new Date("2026-10-08T09:00:00Z");
  await UserModel.create([vendor, otherVendor, site, otherSite, manager, otherManager, admin, client].map(user => ({ _id: user.id, name: user.name, email: user.email, emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, vendorId: user.vendorId ?? null, active: true })));
  await AiEstimatorKnowledgeVendorModel.collection.insertMany([{ _id: "vendor-a", name: "Vendor A", status: "active" }, { _id: "vendor-b", name: "Vendor B", status: "active" }] as any);
  await ProjectModel.collection.insertMany([{ _id: "project-a", name: "Project A", status: "active", programManagerId: manager.id }, { _id: "project-b", name: "Project B", status: "active", programManagerId: otherManager.id }] as any);
  await ProjectWorkflowTaskModel.collection.insertMany([{ _id: "site-task-a", projectId: "project-a", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: site.id }, { _id: "site-task-b", projectId: "project-b", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: otherSite.id }] as any);
  for (const [orderId, projectId, vendorId] of [["order-a", "project-a", "vendor-a"], ["order-b", "project-a", "vendor-b"]]) {
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: orderId, projectId, vendorId, orderNumber: orderId.toUpperCase(), status: "approved", approvedRevision: 1, approvedRevisionId: `revision-${orderId}`, cancelledAt: null } as any);
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: `revision-${orderId}`, orderId, projectId, vendorId, orderNumber: orderId.toUpperCase(), revision: 1, lines: [{ ...issuedLine, quantityMilliUnits: orderId === "order-a" ? 12_500 : 27_000 }] } as any);
    await VendorWorkAssignmentModel.collection.insertOne({ _id: `vendor-work:${orderId}:1:line-a`, projectId, vendorId, orderId, orderRevision: 1, lineId: "line-a", procurementItemId: "item-a", estimateId: "estimate-a", estimateVersion: 2,
      estimateReviewRoundId: "estimate-round-a", sourceSectionId: "basket-a", sourceLineItemKey: "source-a", roomName: "Living", itemName: "Ceiling", description: "Approved ceiling", targetDate: "2026-10-15", status: "ready", version: 1, progress: 0, currentRound: 1, note: "", receipts: [], createdAt: clock, updatedAt: clock } as any);
  }
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: "estimate-round-a", projectId: "project-a", estimateId: "estimate-a", estimateVersion: 2, status: "approved", decision: "approve", estimateSnapshot: { lineItems: [{ id: "source-a", mainLineId: "main-line-a", mainBasketId: "basket-a", subBasketId: "sub-a", mainBasketName: "POP", subBasketName: "Ceilings" }] } } as any);
});
afterAll(async () => { await replica?.stop(); });

describe("execution commitment and reporting", () => {
  it("creates distinct assignments once and scopes split vendors, project managers and history", async () => {
    await initialize(); await initialize(); await initialize("order-b", "project-a", "vendor-b");
    expect(await VendorExecutionStateModel.countDocuments()).toBe(2);
    expect(await VendorExecutionEventModel.countDocuments({ action: "issued" })).toBe(2);
    expect((await service.listMine(vendor)).items).toHaveLength(1);
    expect((await service.listMine(otherVendor)).items[0]).toMatchObject({ id: secondId, quantityMilliUnits: 27_000 });
    expect((await service.project(manager, "project-a", { limit: 1 })).counts.total).toBe(2);
    expect((await service.project(site, "project-a")).items[0]).toMatchObject({ mainLineId: "main-line-a", sourceAvailable: true, quantityMilliUnits: 12_500, uomCode: "SQM" });
    expect((await service.portfolio(otherManager)).items.map(row => row.id)).toEqual(["project-b"]);
    await expect(service.detail(otherVendor, id)).rejects.toMatchObject({ status: 404 });
    await expect(service.history(otherSite, id)).rejects.toMatchObject({ status: 404 });
    await expect(service.project(otherManager, "project-a")).rejects.toMatchObject({ status: 404 });
    await expect(service.detail(client, id)).rejects.toMatchObject({ status: 404 });
  });
  it("confirms vendor dates prospectively, preserves issued target and prior reporting start on changes", async () => {
    const work = await schedule();
    expect(work).toMatchObject({ status: "not_started", reportingStartsOn: "2026-10-09", originalTargetDate: "2026-10-15", schedule: { revision: 1, confirmedById: manager.id } });
    // Commands sharing a server millisecond must retain their committed sequence.
    expect((await service.history(site, id, { limit: 2 })).items.map(event => event.action)).toEqual(["confirm_schedule", "propose_schedule"]);
    expect((await service.history(site, id, { limit: 2, offset: 2 })).items.map(event => event.action)).toEqual(["acknowledge", "issued"]);
    await expect(command(vendor, "propose_schedule", { startDate: "2026-10-10", finishDate: "2026-10-20" })).rejects.toMatchObject({ status: 400 });
    await command(vendor, "propose_schedule", { startDate: "2026-10-10", finishDate: "2026-10-20", reason: "Delivery delayed" });
    await expect(command(manager, "confirm_schedule", { startDate: "2026-10-10", finishDate: "2026-10-22", reason: "Delivery delayed" })).rejects.toMatchObject({ status: 400 });
    clock = new Date("2026-10-10T14:00:00Z");
    const revised = await command(manager, "confirm_schedule", { startDate: "2026-10-10", finishDate: "2026-10-20", reason: "Delivery delay reviewed" });
    expect(revised.reportingStartsOn).toBe("2026-10-09");
    expect(revised.originalTargetDate).toBe("2026-10-15");
    expect(revised.schedule?.revision).toBe(2);
    expect(revised.daily.state).toBe("missing");
    await expect(mongoose.connection.transaction(session => assertNoExecutionActivityForAmendment([id], session))).rejects.toMatchObject({ code: "VENDOR_WORK_AMENDMENT_RECONCILIATION_REQUIRED" });
  });
  it("journals valid zero progress, late reports, corrections and idempotent retries without impersonation", async () => {
    await schedule(); clock = new Date("2026-10-09T12:29:00Z");
    await expect(command(vendor, "report", { status: "not_started", progress: 0, note: "No change" })).rejects.toMatchObject({ status: 400 });
    const first = await command(vendor, "report", { status: "blocked", progress: 0, note: "Waiting for access", reason: "Site locked", nextAction: "Site Manager arranges access" });
    expect(first.daily.state).toBe("on_time"); expect(first.flags).toContain("blocked");
    const history = await service.history(site, id);
    expect(history.items.find(event => event.action === "report")).toMatchObject({ nextAction: "Site Manager arranges access", reason: "Site locked" });
    expect(history.items.find(event => event.action === "confirm_schedule")).toMatchObject({ startDate: "2026-10-09", finishDate: "2026-10-15" });
    clock = new Date("2026-10-10T12:31:00Z");
    const fields: ExecutionCommand = { action: "report", expectedVersion: first.version, idempotencyKey: "report-repeat-key", status: "in_progress", progress: 40, note: "Framing completed" };
    const updated = await service.command(vendor, id, fields);
    expect(updated.daily.state).toBe("late");
    expect((await service.command(vendor, id, fields)).version).toBe(updated.version);
    await expect(service.command(vendor, id, { ...fields, progress: 50 })).rejects.toMatchObject({ code: "EXECUTION_VERSION_CONFLICT" });
    await expect(command(site, "report", { status: "in_progress", progress: 60, note: "Staff cannot report for vendor" })).rejects.toMatchObject({ status: 403 });
    await expect(command(vendor, "report", { status: "in_progress", progress: 30, note: "Correction" })).rejects.toMatchObject({ status: 400 });
    await command(vendor, "report", { status: "in_progress", progress: 30, note: "Corrected measurement", reason: "Frame area was overestimated" });
    expect(await VendorExecutionEventModel.countDocuments({ assignmentId: id, action: "report" })).toBe(3);
    expect((await service.history(vendor, id, { limit: 2 })).total).toBe(7);
  });
  it("serializes concurrent reports and enforces project completion fences", async () => {
    const work = await schedule();
    const results = await Promise.allSettled(["a", "b"].map(key => service.command(vendor, id, { action: "report", expectedVersion: work.version, idempotencyKey: `race-report-${key}`, status: "in_progress", progress: 10, note: "Started" })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await VendorExecutionEventModel.countDocuments({ action: "report" })).toBe(1);
    await SiteCompletionStateModel.collection.insertOne({ _id: "project-a", projectId: "project-a", status: "pending_client", progress: 100, version: 1, currentRound: 1 } as any);
    await expect(command(vendor, "report", { status: "in_progress", progress: 20, note: "Late update" })).rejects.toMatchObject({ code: "SITE_COMPLETION_IN_REVIEW" });
  });
  it("records holds and resumes without accepting vendor reporting while held", async () => {
    await schedule();
    const held = await command(manager, "hold", { reason: "Client requested site pause", reviewDate: "2026-10-11" });
    expect(held.hold?.reason).toBe("Client requested site pause");
    expect((await service.history(site, id)).items.find(event => event.action === "hold")?.reviewDate).toBe("2026-10-11");
    await expect(command(vendor, "report", { progress: 10, status: "in_progress", note: "Unauthorized reporting" })).rejects.toMatchObject({ status: 403 });
    clock = new Date("2026-10-12T09:00:00Z");
    expect((await service.detail(site, id)).flags).toContain("hold_review_due");
    const resumed = await command(site, "resume", { reason: "Access restored" });
    expect(resumed.reportingStartsOn).toBe("2026-10-13"); expect(resumed.hold).toBeNull();
  });
});

describe("individual Site Manager verification", () => {
  it("requires current evidence or a reasoned exemption, exact submission and the assigned Site Manager", async () => {
    await schedule(); await command(vendor, "report", { progress: 100, status: "in_progress", note: "Finished" });
    await expect(command(vendor, "submit", { note: "Inspect" })).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_REQUIRED" });
    await VendorWorkImageModel.collection.insertOne({ _id: "other-image", assignmentId: secondId, projectId: "project-a", vendorId: "vendor-b", executionRound: 1, uploadedAt: clock } as any);
    await expect(command(vendor, "submit", { note: "Inspect", imageIds: ["other-image"] })).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_INVALID" });
    await command(site, "exempt_evidence", { reason: "Photography prohibited by client" });
    const submitted = await command(vendor, "submit", { note: "Inspect completed ceiling" });
    expect(submitted.status).toBe("awaiting_verification");
    expect((await VendorWorkAssignmentModel.findById(id).lean())?.status).toBe("in_progress");
    await expect(command(admin, "verify", { submissionId: submitted.submission!.id })).rejects.toMatchObject({ status: 403 });
    await expect(command(manager, "verify", { submissionId: submitted.submission!.id })).rejects.toMatchObject({ status: 403 });
    await expect(command(site, "verify", { submissionId: "stale-submission" })).rejects.toMatchObject({ status: 409 });
    await expect(mongoose.connection.transaction(async session => assertExecutionEditable((await VendorWorkAssignmentModel.findById(id).session(session).lean())!, session))).rejects.toMatchObject({ code: "EXECUTION_LOCKED" });
    const verified = await command(site, "verify", { submissionId: submitted.submission!.id });
    expect(verified.status).toBe("site_verified"); expect(verified.verification?.verifiedById).toBe(site.id);
    const snapshot = await mongoose.connection.transaction(async session => {
      const assignment = (await VendorWorkAssignmentModel.findById(id).session(session).lean())!;
      await assertExecutionVerified(assignment, session); return currentExecutionVerification(assignment, session);
    });
    expect(snapshot).toMatchObject({ assignmentId: id, verificationId: submitted.submission!.id, executionRound: 1 });
    expect(await AuditEventModel.countDocuments({ action: "vendor_execution_decided" })).toBe(1);
  });
  it("opens a separate execution round after site rejection without changing Client review rounds", async () => {
    const submitted = await submission();
    const rejected = await command(site, "request_changes", { submissionId: submitted.submission!.id, reason: "Repair the joint" });
    expect(rejected).toMatchObject({ status: "changes_requested", executionRound: 2, latestReportAt: null, evidenceExemption: null });
    expect((await VendorWorkAssignmentModel.findById(id).lean())?.currentRound).toBe(1);
    expect((await VendorExecutionReviewModel.findById(submitted.submission!.id).lean())?.decision?.outcome).toBe("changes_requested");
    await expect(command(vendor, "submit", { note: "Reuse old completion" })).rejects.toMatchObject({ status: 403 });
    await command(vendor, "report", { progress: 100, status: "in_progress", note: "Joint repaired", reason: "Rework completed" });
    await expect(command(vendor, "submit", { note: "Ready again" })).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_REQUIRED" });
  });
  it("invalidates verification after Client rework while retaining its immutable evidence and decision", async () => {
    const submitted = await submission(); await command(site, "verify", { submissionId: submitted.submission!.id });
    await mongoose.connection.transaction(session => invalidateExecutionVerificationForClientChanges(id, client.id, "Adjust finish", session, clock));
    const work = await service.detail(vendor, id);
    expect(work).toMatchObject({ status: "changes_requested", executionRound: 2, verification: null, submission: null });
    expect((await VendorExecutionReviewModel.findById(submitted.submission!.id).lean())?.decision?.outcome).toBe("verified");
    await expect(mongoose.connection.transaction(async session => assertExecutionVerified((await VendorWorkAssignmentModel.findById(id).session(session).lean())!, session))).rejects.toMatchObject({ code: "EXECUTION_VERIFICATION_REQUIRED" });
  });
  it("preserves legacy pending reviews but requires explicit setup for old open work", async () => {
    expect((await service.detail(site, id)).tracking).toBe("setup_required");
    await expect(mongoose.connection.transaction(async session => assertExecutionVerified((await VendorWorkAssignmentModel.findById(id).session(session).lean())!, session))).rejects.toMatchObject({ code: "EXECUTION_SETUP_REQUIRED" });
    await VendorWorkAssignmentModel.updateOne({ _id: secondId }, { $set: { status: "submitted_for_client" } });
    await VendorWorkReviewModel.collection.insertOne({ _id: "legacy-client-review", assignmentId: secondId, projectId: "project-a", vendorId: "vendor-b", round: 1, imageIds: ["immutable-review-image"], status: "pending" } as any);
    expect(await service.detail(site, secondId)).toMatchObject({ tracking: "legacy_review", status: "awaiting_client", imageIds: ["immutable-review-image"] });
    await mongoose.connection.transaction(async session => assertExecutionVerified((await VendorWorkAssignmentModel.findById(secondId).session(session).lean())!, session));
    await expect(command(otherVendor, "setup", {}, secondId)).rejects.toMatchObject({ status: 403 });
    const setup = await command(site, "setup"); expect(setup.tracking).toBe("tracked"); expect(setup.reportingStartsOn).toBeNull();
  });
  it("starts tracking legacy Client rework prospectively without fabricating or changing its Client round", async () => {
    await VendorWorkAssignmentModel.updateOne({ _id: id }, { $set: { status: "changes_requested", currentRound: 3, progress: 100 } });
    await mongoose.connection.transaction(session => invalidateExecutionVerificationForClientChanges(id, client.id, "Correct the finish", session, clock));
    expect(await service.detail(vendor, id)).toMatchObject({ tracking: "tracked", status: "changes_requested", executionRound: 1, reportingStartsOn: null, acknowledgedAt: null, latestReportAt: null });
    expect((await VendorWorkAssignmentModel.findById(id).lean())?.currentRound).toBe(3);
    expect(await VendorExecutionReviewModel.countDocuments()).toBe(0);
    expect(await VendorExecutionEventModel.countDocuments({ action: "client_changes_requested" })).toBe(1);
    await command(vendor, "acknowledge");
    expect((await service.detail(vendor, id)).status).toBe("awaiting_schedule");
  });
});

describe("execution input and local dates", () => {
  it("validates real calendar dates, blocks unknown fields and resolves India cutoff", () => {
    expect(executionCommandSchema.safeParse({ action: "propose_schedule", expectedVersion: 1, idempotencyKey: "schedule-key", startDate: "2026-02-30", finishDate: "2026-03-03" }).success).toBe(false);
    expect(executionCommandSchema.safeParse({ action: "report", expectedVersion: 1, idempotencyKey: "report-key", progress: 1, status: "in_progress", note: "Work", occurredAt: "2026-01-01" }).success).toBe(false);
    expect(executionCutoff("2026-10-09", "18:00", "Asia/Kolkata").toISOString()).toBe("2026-10-09T12:30:00.000Z");
    expect(executionLocalDate(new Date("2026-10-08T20:00:00Z"))).toBe("2026-10-09");
  });
});

it("keeps missing or mismatched issued sources visible but blocks execution changes", async () => {
  await initialize();
  await ProjectPurchaseOrderModel.updateOne({ _id: "order-a" }, { $set: { approvedRevisionId: "foreign-revision" } });
  const row = await service.detail(vendor, id);
  expect(row.sourceAvailable).toBe(false);
  expect(row.flags).toContain("source_unavailable");
  expect(row.allowedActions).toEqual([]);
  await expect(command(vendor, "acknowledge")).rejects.toMatchObject({ code: "EXECUTION_ACTION_NOT_ALLOWED" });
  expect(await VendorExecutionEventModel.countDocuments({ action: "acknowledge" })).toBe(0);
});

it("denies ambiguous vendor identities and duplicate Site Manager ownership", async () => {
  await initialize();
  await UserModel.create({ _id: "duplicate-vendor-user", name: "Duplicate", email: "duplicate@example.test", emailNormalized: "duplicate@example.test", passwordHash: "fixture-only", role: "vendor", vendorId: vendor.vendorId, active: true });
  await expect(service.listMine(vendor)).rejects.toMatchObject({ status: 404 });
  await ProjectWorkflowTaskModel.collection.insertOne({ _id: "duplicate-site-task", projectId: "project-a", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: site.id } as any);
  await expect(service.project(site, "project-a")).rejects.toMatchObject({ status: 404 });
  expect((await service.detail(admin,id)).flags).toEqual(expect.arrayContaining(["access_blocked", "site_manager_required"]));
});

it("exposes global delivery health only to the sole Super Admin", async () => {
  const readDeliveryHealth = vi.fn(async () => ({ schedulerEnabled: false, accessDeliveryEnabled: false, lastSchedulerSuccessAt: null, lastSchedulerFailureCode: null, pendingEmails: 3, failedEmails: 1 }));
  const scoped = createVendorExecutionService({ audit: createAuditService(createMemoryRepository()), now: () => clock, readDeliveryHealth });
  expect((await scoped.portfolio(manager)).deliveryHealth).toBeNull();
  expect(readDeliveryHealth).not.toHaveBeenCalled();
  expect((await scoped.portfolio(admin)).deliveryHealth).toMatchObject({ pendingEmails: 3, failedEmails: 1 });
  expect(readDeliveryHealth).toHaveBeenCalledOnce();
});
