import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionAction, ExecutionCommand, ExecutionWork } from "../src/contracts/vendor-execution.js";
import { executionCommandSchema, executionCutoff, executionDigest, executionLocalDate } from "../src/domain/vendor-execution.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../src/models/Project.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { SiteCompletionStateModel } from "../src/models/SiteCompletionState.js";
import { UserModel } from "../src/models/User.js";
import { EstimateModel } from "../src/models/Estimate.js";
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
const manager = site;
const otherManager = otherSite;
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
async function photo(imageId = "current-photo", overrides: Record<string, unknown> = {}) {
  await VendorWorkImageModel.collection.insertOne({ _id: imageId, assignmentId: id, projectId: "project-a", vendorId: "vendor-a", executionRound: 1, uploadedAt: clock, ...overrides } as any);
  return imageId;
}
async function savedWork() {
  return {
    state: await VendorExecutionStateModel.findById(id).lean(),
    assignment: await VendorWorkAssignmentModel.findById(id).lean(),
    events: await VendorExecutionEventModel.find({ assignmentId: id }).sort({ _id: 1 }).lean(),
    reviews: await VendorExecutionReviewModel.find({ assignmentId: id }).sort({ _id: 1 }).lean(),
    audit: await AuditEventModel.find().sort({ _id: 1 }).lean()
  };
}
async function submission() {
  await schedule();
  await command(vendor, "report", { progress: 100, status: "in_progress", note: "Ceiling completed" });
  await photo();
  return command(vendor, "submit", { note: "Ready for inspection" });
}
beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-execution-tests");
  for (const model of [UserModel, VendorExecutionStateModel, VendorExecutionEventModel, VendorExecutionReviewModel, VendorWorkAssignmentModel, AuditEventModel]) await model.syncIndexes();
}, 120_000);
beforeEach(async () => {
  await replica.clear(); serial = 0; clock = new Date("2026-10-08T09:00:00Z");
  await UserModel.create([vendor, otherVendor, site, otherSite, admin, client].map(user => ({ _id: user.id, name: user.name, email: user.email, emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, vendorId: user.vendorId ?? null, active: true })));
  await AiEstimatorKnowledgeVendorModel.collection.insertMany([{ _id: "vendor-a", name: "Vendor A", status: "active" }, { _id: "vendor-b", name: "Vendor B", status: "active" }] as any);
  await ProjectModel.collection.insertMany([{ _id: "project-a", name: "Project A", status: "active", programManagerId: manager.id }, { _id: "project-b", name: "Project B", status: "active", programManagerId: otherManager.id }] as any);
  await ProjectWorkflowTaskModel.collection.insertMany([{ _id: "site-task-a", projectId: "project-a", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: site.id, estimateId: "estimate-a", designPlanVersion: 1, status: "open", version: 1 }, { _id: "site-task-b", projectId: "project-b", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: otherSite.id, estimateId: "estimate-b", designPlanVersion: 1, status: "open", version: 1 }] as any);
  await EstimateModel.collection.insertMany(["a", "b"].map(key => ({ _id: `estimate-${key}`, projectId: `project-${key}`, status: "client_approved", designPlanStatus: "approved", designPlanVersion: 1 })) as any);
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
  it("projects live Project IDs in one portfolio batch and retains them on commands", async () => {
    await LeadModel.collection.insertMany([
      { _id: "lead-a", projectId: "project-a", projectNumber: "Lisno000012" },
      { _id: "lead-b", projectId: "project-b", projectNumber: "Lisno000087" }
    ]);
    await initialize();
    const before = await ProjectPurchaseOrderRevisionModel.find().lean();
    expect(await service.detail(vendor, id)).toMatchObject({ projectId: "project-a", projectNumber: "Lisno000012" });
    expect((await service.listMine(vendor)).items).toMatchObject([{ projectNumber: "Lisno000012" }]);
    expect((await service.project(site, "project-a")).project).toMatchObject({ id: "project-a", projectNumber: "Lisno000012" });
    const find = vi.spyOn(LeadModel, "find");
    try {
      const portfolio = await service.portfolio(admin);
      expect(portfolio.items.map(row => [row.id, row.projectNumber]).sort()).toEqual([
        ["project-a", "Lisno000012"], ["project-b", "Lisno000087"]
      ]);
      expect(find).toHaveBeenCalledTimes(1);
      expect(find).toHaveBeenCalledWith({ projectId: { $in: ["project-a", "project-b"] } });
    } finally { find.mockRestore(); }
    expect(await command(vendor, "acknowledge")).toMatchObject({ projectNumber: "Lisno000012" });
    expect(await ProjectPurchaseOrderRevisionModel.find().lean()).toEqual(before);
    await expect(service.detail(otherVendor, id)).rejects.toMatchObject({ status: 404 });
  });

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
  it.each([manager, admin])("offers $role schedule confirmation only for a pending vendor proposal", async reviewer => {
    await initialize();
    await command(vendor, "acknowledge");
    const issuedRevision = await ProjectPurchaseOrderRevisionModel.findById("revision-order-a").lean();
    const dates = { startDate: "2026-10-09", finishDate: "2026-10-15" };
    const waiting = await service.detail(reviewer, id);
    expect(waiting.nextOwner).toBe("vendor");
    expect(waiting.allowedActions).not.toContain("confirm_schedule");
    await expect(command(reviewer, "confirm_schedule", dates)).rejects.toMatchObject({ code: "EXECUTION_ACTION_NOT_ALLOWED" });

    await command(vendor, "propose_schedule", dates);
    const proposed = await service.detail(reviewer, id);
    expect(proposed.nextOwner).toBe("site_manager");
    expect(proposed.allowedActions).toContain("confirm_schedule");
    await expect(command(vendor, "confirm_schedule", dates)).rejects.toMatchObject({ code: "EXECUTION_ACTION_NOT_ALLOWED" });
    await expect(command(reviewer, "confirm_schedule", { ...dates, finishDate: "2026-10-16" })).rejects.toMatchObject({ status: 400 });

    const confirmed = await command(reviewer, "confirm_schedule", dates);
    expect(confirmed).toMatchObject({ nextOwner: "vendor", proposedSchedule: null, originalTargetDate: "2026-10-15", schedule: { ...dates, revision: 1 } });
    expect(confirmed.allowedActions).not.toContain("confirm_schedule");
    const saved = await VendorExecutionStateModel.findById(id).lean();
    await expect(command(reviewer, "confirm_schedule", { ...dates, reason: "Already confirmed" })).rejects.toMatchObject({ code: "EXECUTION_ACTION_NOT_ALLOWED" });
    expect(await VendorExecutionStateModel.findById(id).lean()).toEqual(saved);
    expect(await VendorExecutionEventModel.countDocuments({ assignmentId: id, action: "confirm_schedule" })).toBe(1);

    const revisedDates = { startDate: "2026-10-10", finishDate: "2026-10-20", reason: "Delivery delayed" };
    await command(vendor, "propose_schedule", revisedDates);
    const revisionPending = await service.detail(reviewer, id);
    expect(revisionPending).toMatchObject({ nextOwner: "site_manager", proposedSchedule: revisedDates, schedule: { ...dates, revision: 1 } });
    expect(revisionPending.allowedActions).toContain("confirm_schedule");
    const revised = await command(reviewer, "confirm_schedule", revisedDates);
    expect(revised).toMatchObject({ nextOwner: "vendor", proposedSchedule: null, originalTargetDate: "2026-10-15", reportingStartsOn: "2026-10-09", schedule: { startDate: revisedDates.startDate, finishDate: revisedDates.finishDate, revision: 2 } });
    expect(revised.allowedActions).not.toContain("confirm_schedule");
    expect(await ProjectPurchaseOrderRevisionModel.findById("revision-order-a").lean()).toEqual(issuedRevision);
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

describe("simplified vendor updates", () => {

  it("starts at zero without fabricating progress and cannot reset or impersonate work", async () => {
    await schedule();
    await command(vendor, "report", { status: "not_started", progress: 0, note: "Waiting for site access", reason: "Access opens tomorrow" });
    const fields = { updateType: "started" as const, status: "in_progress" as const, progress: 0, note: "Started working." };
    await expect(command(site, "report", fields)).rejects.toMatchObject({ status: 403 });
    await expect(command(otherVendor, "report", fields)).rejects.toMatchObject({ status: 404 });
    const started = await command(vendor, "report", fields);
    expect(started).toMatchObject({ status: "in_progress", progress: 0, latestVendorReport: { updateType: "started", status: "in_progress", progress: 0 } });
    expect((await service.history(site, id)).items[0]).toMatchObject({ action: "report", updateType: "started", progress: 0 });
    await expect(command(vendor, "report", fields)).rejects.toMatchObject({ status: 400 });
    await command(vendor, "report", { status: "in_progress", progress: 35, note: "Framing installed" });
    const before = await savedWork();
    await expect(command(vendor, "report", { ...fields, reason: "Cannot reset earned progress" })).rejects.toMatchObject({ status: 400 });
    expect(await savedWork()).toEqual(before);
  });

  it("accepts photo-backed progress at the same percentage but requires a reason for a correction", async () => {
    await schedule();
    const imageId = await photo();
    const fields = { updateType: "progress" as const, status: "in_progress" as const, progress: 35, note: "Framing photos", imageIds: [imageId] };
    await command(vendor, "report", fields);
    const repeated = await command(vendor, "report", { ...fields, note: "Second room framing at the same overall percentage" });
    expect(repeated).toMatchObject({ status: "in_progress", progress: 35, latestVendorReport: { updateType: "progress", reason: null } });
    const before = await savedWork();
    await expect(command(vendor, "report", { ...fields, progress: 20 })).rejects.toMatchObject({ status: 400 });
    expect(await savedWork()).toEqual(before);
    const corrected = await command(vendor, "report", { ...fields, progress: 20, reason: "Original measured area was overstated" });
    expect(corrected.progress).toBe(20);
  });

  it("requires current photos for progress and completion despite saved exemptions", async () => {
    await schedule();
    await photo("foreign-photo", { assignmentId: secondId, vendorId: "vendor-b" });
    await photo("wrong-vendor-photo", { vendorId: "vendor-b" });
    await photo("previous-round-photo", { executionRound: 0 });
    await photo("old-photo", { uploadedAt: new Date(clock.getTime() - 1) });
    await VendorExecutionStateModel.updateOne({ _id: id }, { $set: { evidenceExemption: { reason: "Historic photography restriction", grantedById: site.id, executionRound: 1 } } });
    for (const who of [site, admin, vendor]) {
      const projected = await service.detail(who, id);
      expect(projected.evidenceExemption).toBeNull();
      expect(projected.allowedActions).not.toContain("exempt_evidence");
    }
    const completion = { updateType: "completed" as const, status: "in_progress" as const, progress: 100, note: "Work completed." };
    const before = await savedWork();
    for (const imageIds of [undefined, []]) {
      await expect(command(vendor, "report", { updateType: "progress", status: "in_progress", progress: 35, note: "Work update", imageIds })).rejects.toMatchObject({ status: 400 });
      await expect(command(vendor, "report", { ...completion, imageIds })).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_REQUIRED" });
    }
    for (const updateType of ["progress", "completed"] as const) {
      const fields = { updateType, status: "in_progress" as const, progress: updateType === "completed" ? 100 : 35, note: "Work update" };
      for (const imageId of ["foreign-photo", "wrong-vendor-photo", "previous-round-photo", "old-photo"]) {
        await expect(command(vendor, "report", { ...fields, imageIds: [imageId] })).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_INVALID" });
      }
    }
    expect(await savedWork()).toEqual(before);
    await command(vendor, "report", { status: "in_progress", progress: 100, note: "Legacy completion report" });
    const legacyReported = await savedWork();
    for (const imageIds of [undefined, []]) {
      await expect(command(vendor, "submit", { note: "Legacy completion submission", imageIds })).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_REQUIRED" });
    }
    expect(await savedWork()).toEqual(legacyReported);
    const imageId = await photo();
    const completed = await command(vendor, "report", { ...completion, imageIds: [imageId] });
    expect(completed).toMatchObject({ status: "awaiting_verification", progress: 100, evidenceExemption: null, submission: { imageIds: [imageId] } });
    expect(await VendorExecutionReviewModel.findById(completed.submission!.id).lean()).toMatchObject({ imageIds: [imageId], evidenceExemptionReason: null, evidenceExemptionGrantedById: null });
    await command(site, "request_changes", { submissionId: completed.submission!.id, reason: "Correct the finish" });
    await VendorExecutionStateModel.updateOne({ _id: id }, { $set: { evidenceExemption: { reason: "Historic photography restriction", grantedById: site.id, executionRound: 1 } } });
    const laterRound = await savedWork();
    await expect(command(vendor, "report", completion)).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_REQUIRED" });
    expect(await savedWork()).toEqual(laterRound);
  });

  it("rejects new, stale and previously recorded exemption grants without changing work", async () => {
    const work = await schedule();
    const historicalCommand = executionCommandSchema.parse({ action: "exempt_evidence", expectedVersion: work.version - 1, idempotencyKey: "historic-exemption-receipt", reason: "Photography was previously restricted" });
    await VendorExecutionEventModel.create({ _id: "historical-exemption", assignmentId: id, projectId: "project-a", vendorId: "vendor-a", actorId: site.id,
      action: "exempt_evidence", occurredAt: clock, localDate: executionLocalDate(clock), timezone: "Asia/Kolkata", executionRound: 1, version: work.version,
      idempotencyKey: historicalCommand.idempotencyKey, requestDigest: executionDigest(historicalCommand), reason: historicalCommand.reason });
    await VendorExecutionStateModel.updateOne({ _id: id }, { $set: { evidenceExemption: { reason: historicalCommand.reason, grantedById: site.id, executionRound: 1 } } });
    const before = await savedWork();
    for (const who of [site, admin, vendor]) {
      await expect(service.command(who, id, { ...historicalCommand, expectedVersion: work.version, idempotencyKey: `new-exemption-${who.id}` })).rejects.toMatchObject({ status: 409, code: "EXECUTION_EVIDENCE_EXEMPTION_DISABLED" });
      await expect(service.command(who, id, { ...historicalCommand, idempotencyKey: `stale-exemption-${who.id}` })).rejects.toMatchObject({ status: 409, code: "EXECUTION_EVIDENCE_EXEMPTION_DISABLED" });
    }
    await expect(service.command(site, id, historicalCommand)).rejects.toMatchObject({ status: 409, code: "EXECUTION_EVIDENCE_EXEMPTION_DISABLED" });
    await expect(service.command(otherSite, id, historicalCommand)).rejects.toMatchObject({ status: 404 });
    await expect(service.command(otherVendor, id, historicalCommand)).rejects.toMatchObject({ status: 404 });
    expect(await savedWork()).toEqual(before);
  });

  it("records a vendor hold reason without changing progress or granting manager hold powers", async () => {
    await schedule();
    await command(vendor, "report", { status: "in_progress", progress: 35, note: "Framing installed" });
    const fields = { updateType: "hold" as const, status: "blocked" as const, progress: 35, note: "Site access is blocked" };
    await expect(command(vendor, "report", fields)).rejects.toMatchObject({ status: 400 });
    await expect(command(vendor, "report", { ...fields, progress: 40, reason: "Site locked" })).rejects.toMatchObject({ status: 400 });
    await expect(command(vendor, "report", { status: "blocked", progress: 35, note: fields.note, reason: "Site locked" })).rejects.toMatchObject({ status: 400 });
    const held = await command(vendor, "report", { ...fields, reason: "The client has not provided the entry key" });
    expect(held).toMatchObject({ status: "blocked", progress: 35, hold: null, latestVendorReport: { updateType: "hold", reason: "The client has not provided the entry key", nextAction: null } });
    expect(held.allowedActions).toContain("report");
    expect(held.allowedActions).not.toContain("resume");
    await expect(command(vendor, "hold", { reason: "Cannot pause reporting obligations", reviewDate: "2026-10-11" })).rejects.toMatchObject({ status: 403 });
    await expect(command(vendor, "exempt_evidence", { reason: "Cannot waive mandatory photos" })).rejects.toMatchObject({ status: 409, code: "EXECUTION_EVIDENCE_EXEMPTION_DISABLED" });
  });

  it("atomically completes and submits current photos with one idempotent report while retaining Client review", async () => {
    await schedule();
    const imageId = await photo();
    await command(vendor, "report", { updateType: "progress", status: "in_progress", progress: 35, note: "Framing installed", imageIds: [imageId] });
    const before = await service.detail(vendor, id);
    const issuedRevision = await ProjectPurchaseOrderRevisionModel.findById("revision-order-a").lean();
    const fields: ExecutionCommand = { action: "report", updateType: "completed", expectedVersion: before.version, idempotencyKey: "typed-completion-once", status: "in_progress", progress: 100, note: "Work completed.", imageIds: [imageId], submissionId: "unrelated-review" };
    const completed = await service.command(vendor, id, fields);
    expect(completed).toMatchObject({ version: before.version + 1, status: "awaiting_verification", progress: 100, nextOwner: "site_manager", canSubmitToClient: false, latestVendorReport: { updateType: "completed", status: "in_progress", progress: 100 }, submission: { version: before.version + 1, imageIds: [imageId] } });
    expect(completed.allowedActions).not.toContain("report");
    expect(await VendorExecutionReviewModel.countDocuments({ assignmentId: id })).toBe(1);
    expect(await VendorExecutionEventModel.countDocuments({ assignmentId: id, updateType: "completed" })).toBe(1);
    expect(await VendorExecutionEventModel.countDocuments({ assignmentId: id, action: "submit" })).toBe(0);
    expect(await VendorExecutionEventModel.findOne({ assignmentId: id, updateType: "completed" }).lean()).toMatchObject({ submissionId: completed.submission!.id });
    expect(completed.submission!.id).not.toBe(fields.submissionId);
    expect(await VendorExecutionReviewModel.findById(completed.submission!.id).lean()).toMatchObject({ decision: null, imageIds: [imageId], submissionVersion: before.version + 1 });
    expect(await VendorWorkAssignmentModel.findById(id).lean()).toMatchObject({ status: "in_progress", progress: 100, currentRound: 1 });
    expect(await VendorWorkReviewModel.countDocuments({ assignmentId: id })).toBe(0);
    expect((await service.history(site, id)).items[0]).toMatchObject({ action: "report", updateType: "completed", status: "in_progress", progress: 100 });
    expect((await service.command(vendor, id, fields)).version).toBe(completed.version);
    await expect(service.command(vendor, id, { ...fields, note: "Different completion under the same key" })).rejects.toMatchObject({ code: "EXECUTION_VERSION_CONFLICT" });
    expect(await VendorExecutionReviewModel.countDocuments({ assignmentId: id })).toBe(1);
    expect(await ProjectPurchaseOrderRevisionModel.findById("revision-order-a").lean()).toEqual(issuedRevision);
    expect((await service.detail(site, id)).allowedActions).toContain("verify");
  });

  it("commits only one completion when two requests race for the same version", async () => {
    const work = await schedule();
    const imageId = await photo();
    const results = await Promise.allSettled(["first", "second"].map(key => service.command(vendor, id, {
      action: "report", updateType: "completed", expectedVersion: work.version, idempotencyKey: `typed-completion-${key}`, status: "in_progress", progress: 100, note: "Work completed.", imageIds: [imageId]
    })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await VendorExecutionReviewModel.countDocuments({ assignmentId: id })).toBe(1);
    expect(await VendorExecutionEventModel.countDocuments({ assignmentId: id, updateType: "completed" })).toBe(1);
    expect(await VendorExecutionStateModel.findById(id).lean()).toMatchObject({ version: work.version + 1, status: "awaiting_verification", progress: 100 });
  });

  it("rolls back the progress report and assignment when completion review creation fails", async () => {
    await schedule();
    const imageId = await photo();
    const before = await savedWork();
    const createReview = vi.spyOn(VendorExecutionReviewModel, "create").mockRejectedValueOnce(new Error("Review storage unavailable"));
    try {
      await expect(command(vendor, "report", { updateType: "completed", status: "in_progress", progress: 100, note: "Work completed.", imageIds: [imageId] })).rejects.toThrow("Review storage unavailable");
    } finally { createReview.mockRestore(); }
    expect(await savedWork()).toEqual(before);
  });

  it("rejects contradictory typed updates while retaining the legacy report contract", () => {
    const report = { action: "report", expectedVersion: 1, idempotencyKey: "typed-update-validation", note: "Work update", status: "in_progress", progress: 35, imageIds: ["photo"] };
    for (const invalid of [
      { ...report, updateType: "started" },
      { ...report, updateType: "progress", status: "blocked", reason: "Access blocked", nextAction: "Await key" },
      { ...report, updateType: "hold", reason: "Access blocked" },
      { ...report, updateType: "completed" },
      { ...report, action: "submit", updateType: "completed" }
    ]) expect(executionCommandSchema.safeParse(invalid).success).toBe(false);
    expect(executionCommandSchema.safeParse({ ...report, imageIds: undefined }).success).toBe(true);
  });
});

describe("individual Site Manager verification", () => {
  it("keeps verification and Client handoff ahead of an unconfirmed schedule revision", async () => {
    await schedule();
    await command(vendor, "propose_schedule", { startDate: "2026-10-10", finishDate: "2026-10-20", reason: "Delivery delayed" });
    await command(vendor, "report", { progress: 100, status: "in_progress", note: "Work completed before revised dates were reviewed" });
    await photo();
    const submitted = await command(vendor, "submit", { note: "Ready for inspection" });
    const awaitingReview = await service.detail(site, id);
    expect(awaitingReview.nextOwner).toBe("site_manager");
    expect(awaitingReview.allowedActions).toContain("verify");
    expect(awaitingReview.allowedActions).not.toContain("confirm_schedule");
    const verified = await command(site, "verify", { submissionId: submitted.submission!.id });
    expect(verified).toMatchObject({ status: "site_verified", nextOwner: "client", schedule: { revision: 1 }, proposedSchedule: { finishDate: "2026-10-20" } });
    expect(verified.allowedActions).not.toContain("confirm_schedule");
  });
  it("requires current photos, exact submission and the assigned Site Manager", async () => {
    await schedule(); await command(vendor, "report", { progress: 100, status: "in_progress", note: "Finished" });
    await expect(command(vendor, "submit", { note: "Inspect" })).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_REQUIRED" });
    await VendorWorkImageModel.collection.insertOne({ _id: "other-image", assignmentId: secondId, projectId: "project-a", vendorId: "vendor-b", executionRound: 1, uploadedAt: clock } as any);
    await expect(command(vendor, "submit", { note: "Inspect", imageIds: ["other-image"] })).rejects.toMatchObject({ code: "EXECUTION_EVIDENCE_INVALID" });
    await photo();
    const submitted = await command(vendor, "submit", { note: "Inspect completed ceiling" });
    expect(submitted.status).toBe("awaiting_verification");
    expect((await VendorWorkAssignmentModel.findById(id).lean())?.status).toBe("in_progress");
    await expect(command(admin, "verify", { submissionId: submitted.submission!.id })).rejects.toMatchObject({ status: 403 });
    await expect(command(otherManager, "verify", { submissionId: submitted.submission!.id })).rejects.toMatchObject({ status: 404 });
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
  it("rejects photo-less historical verification while allowing a request for fresh evidence", async () => {
    await schedule();
    const reported = await command(vendor, "report", { progress: 100, status: "in_progress", note: "Historical completion" });
    const submissionId = `execution-review:${id}:1`;
    await VendorExecutionReviewModel.create({ _id: submissionId, assignmentId: id, projectId: "project-a", vendorId: "vendor-a", executionRound: 1,
      submissionVersion: reported.version + 1, submittedById: vendor.id, submittedAt: clock, note: "Historical completion without photos", imageIds: [],
      evidenceExemptionReason: "Historic photography restriction", evidenceExemptionGrantedById: site.id });
    await VendorExecutionStateModel.updateOne({ _id: id }, { $set: { status: "awaiting_verification", version: reported.version + 1, submissionId,
      evidenceExemption: { reason: "Historic photography restriction", grantedById: site.id, executionRound: 1 } } });
    const work = await service.detail(site, id);
    expect(work.evidenceExemption).toBeNull();
    expect(work.allowedActions).toContain("request_changes");
    const before = await savedWork();
    await expect(command(site, "verify", { submissionId })).rejects.toMatchObject({ status: 409, code: "EXECUTION_EVIDENCE_INVALID" });
    expect(await savedWork()).toEqual(before);
    const reopened = await command(site, "request_changes", { submissionId, reason: "Upload current work photos before submitting again" });
    expect(reopened).toMatchObject({ status: "changes_requested", executionRound: 2, evidenceExemption: null, submission: null });
    expect(await VendorExecutionReviewModel.findById(submissionId).lean()).toMatchObject({ imageIds: [], evidenceExemptionReason: "Historic photography restriction", decision: { outcome: "changes_requested" } });
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
