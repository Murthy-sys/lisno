import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionChangeEventModel } from "../src/models/ExecutionChangeEvent.js";
import { ExecutionDailyObligationModel, ExecutionReportingCursorModel } from "../src/models/ExecutionDailyObligation.js";
import { ExecutionNotificationModel, ExecutionSchedulerLeaseModel } from "../src/models/ExecutionNotification.js";
import { ExecutionReportingPolicyModel } from "../src/models/ExecutionReportingPolicy.js";
import { UserModel } from "../src/models/User.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { SiteCompletionStateModel } from "../src/models/SiteCompletionState.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { VendorExecutionStateModel } from "../src/models/VendorExecutionState.js";
import { VendorExecutionEventModel } from "../src/models/VendorExecutionEvent.js";
import { VendorExecutionReviewModel } from "../src/models/VendorExecutionReview.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { createVendorExecutionDeliveryService, executionDeliveryModels } from "../src/services/vendor-execution-delivery.service.js";
import { executionDigestTemplate, type ExecutionDigestMail } from "../src/services/execution-digest-mailer.js";
import { createExecutionStream } from "../src/services/execution-stream.js";
import { appendExecutionChange } from "../src/services/execution-change-events.js";
import { executionCutoff } from "../src/domain/vendor-execution.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/vendor-readiness.service.js", () => ({ vendorActivation: vi.fn(async (vendor: { status: string }) => ({ effectiveStatus: vendor.status === "active" ? "active" : "inactive" })) }));
const user = (id: string, role: PublicUser["role"], vendorId?: string): PublicUser => ({ id, role, name: id, email: `${id}@example.test`, ...(vendorId ? { vendorId } : {}) });
const vendor = user("delivery-vendor", "vendor", "vendor-a"), otherVendor = user("delivery-other-vendor", "vendor", "vendor-b");
const site = user("delivery-site", "site_manager"), manager = user("delivery-manager", "program_manager"), otherManager = user("other-manager", "program_manager"), admin = user("delivery-admin", "super_admin");
const audit = createAuditService(createMemoryRepository());
const auth = { authenticate: vi.fn(async () => vendor) } as unknown as AuthService;
let clock: Date, sent: ExecutionDigestMail[], replica: Awaited<ReturnType<typeof startMongoReplicaSet>>, service: ReturnType<typeof createVendorExecutionDeliveryService>;
const at = (value: string) => { clock = new Date(value); };
const make = (enabled = true, disabled = false) => createVendorExecutionDeliveryService({ audit, auth, now: () => clock, enabled, mailer: disabled ? { deliveryKind: "disabled" } : { deliveryKind: "local_test", sendDigest: async mail => { sent.push(mail); } } });
async function report(assignmentId: string, when: string, status = "in_progress") {
  await VendorExecutionEventModel.collection.insertOne({ _id: `report:${assignmentId}:${when}`, assignmentId, projectId: "project-a", vendorId: "vendor-a", actorId: vendor.id, action: "report", occurredAt: new Date(when), localDate: when.slice(0, 10), timezone: "Asia/Kolkata", executionRound: 1, version: 2, idempotencyKey: `report:${when}`, requestDigest: "test", note: "Today's work", status, progress: 25 } as any);
  await VendorExecutionStateModel.updateOne({ _id: assignmentId }, { $set: { status, latestReportAt: new Date(when), progress: 25 } });
}
async function daily(id = "assignment-a") {
  return service.dailyForAssignment((await VendorWorkAssignmentModel.findById(id).lean())!, await VendorExecutionStateModel.findById(id).lean(), await service.policyForProject("project-a"), clock);
}
beforeAll(async () => {
  replica = await startMongoReplicaSet("execution-delivery-tests");
  for (const model of [...executionDeliveryModels, ExecutionChangeEventModel, UserModel, AuditEventModel]) await model.syncIndexes();
}, 120000);
beforeEach(async () => {
  await replica.clear(); sent = []; at("2026-10-09T03:29:00Z"); service = make();
  await UserModel.collection.insertMany([vendor, otherVendor, site, manager, otherManager, admin].map(actor => ({ _id: actor.id, ...actor, active: true, emailNormalized: actor.email, accountKind: "standard", createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z") })) as any);
  await ProjectModel.collection.insertMany([{ _id: "project-a", name: "Project A", status: "active", programManagerId: manager.id, updatedAt: new Date("2026-10-01") }, { _id: "project-b", name: "Project B", status: "active", programManagerId: otherManager.id }] as any);
  await ProjectWorkflowTaskModel.collection.insertOne({ _id: "site-task", projectId: "project-a", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: site.id } as any);
  await AiEstimatorKnowledgeVendorModel.collection.insertMany([{ _id: "vendor-a", status: "active" }, { _id: "vendor-b", status: "active" }] as any);
  await ProjectPurchaseOrderModel.collection.insertOne({ _id: "order-a", projectId: "project-a", vendorId: "vendor-a", orderNumber: "WO-A", status: "approved", approvedRevision: 1, approvedRevisionId: "revision-a", cancelledAt: null } as any);
  await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "revision-a", projectId: "project-a", vendorId: "vendor-a", orderId: "order-a", revision: 1, lines: [0, 1].map(index => ({ id: `line-${index}`, procurementItemId: `item-${index}`, sourceLineItemKey: `source-${index}` })) } as any);
  await EstimateModel.collection.insertOne({ _id: "estimate-a", version: 1, lineItems: [{ id: "source-0" }, { id: "source-1" }] } as any);
  await VendorWorkAssignmentModel.collection.insertMany(["assignment-a", "assignment-b"].map((id, index) => ({ _id: id, projectId: "project-a", vendorId: "vendor-a", estimateId: "estimate-a", estimateVersion: 1, orderId: "order-a", orderRevision: 1, lineId: `line-${index}`, procurementItemId: `item-${index}`, sourceLineItemKey: `source-${index}`, status: "in_progress", itemName: index ? "Painting" : "Ceiling", targetDate: "2026-10-15" })) as any);
  await VendorExecutionStateModel.collection.insertMany(["assignment-a", "assignment-b"].map(id => ({ _id: id, assignmentId: id, projectId: "project-a", vendorId: "vendor-a", workflowVersion: 1, version: 1, executionRound: 1, status: "in_progress", progress: 10, latestNote: "Started", latestReportAt: null, acknowledgedAt: new Date("2026-10-08T03:00:00Z"), accessAvailableAt: new Date("2026-10-08T02:00:00Z"), schedule: { startDate: "2026-10-09", finishDate: "2026-10-15", confirmedAt: new Date("2026-10-08T04:00:00Z"), revision: 1, confirmedById: manager.id }, reportingStartsOn: "2026-10-09", hold: null, createdAt: new Date("2026-10-08"), updatedAt: new Date("2026-10-08") })) as any);
});
afterAll(async () => { await service?.stop(); await replica?.stop(); });

describe("daily obligation and digest boundaries", () => {
  it("starts the acknowledgement clock when a newly issued vendor first gains access", async () => {
    await UserModel.deleteOne({ _id: vendor.id });
    await VendorExecutionStateModel.updateMany({}, { $set: { status: "assigned", acknowledgedAt: null, accessAvailableAt: null, schedule: null, reportingStartsOn: null } });
    await service.runOnce();
    expect((await VendorExecutionStateModel.findById("assignment-a").lean())?.accessAvailableAt).toBeNull();
    at("2026-10-10T05:00:00Z");
    await UserModel.collection.insertOne({ _id: vendor.id, ...vendor, active: true, emailNormalized: vendor.email, accountKind: "standard", createdAt: clock, updatedAt: clock } as any);
    await service.runOnce();
    const availableAt = (await VendorExecutionStateModel.findById("assignment-a").lean())?.accessAvailableAt;
    expect(availableAt?.toISOString()).toBe(clock.toISOString());
    at("2026-10-10T13:30:00Z"); await service.runOnce(); expect(sent).toHaveLength(0);
    at("2026-10-11T13:30:00Z");
    await UserModel.updateOne({ _id: vendor.id }, { $set: { name: "Edited profile", updatedAt: clock } }, { timestamps: false });
    await service.runOnce();
    expect(sent).toHaveLength(3);
    expect(sent.every(mail => mail.items.every(item => item.reasons.includes("Acknowledgement overdue")))).toBe(true);
    expect((await VendorExecutionStateModel.findById("assignment-a").lean())?.accessAvailableAt).toEqual(availableAt);
    expect(await ExecutionDailyObligationModel.countDocuments()).toBe(0);
  });
  it("reconstructs a hold covering yesterday's deadline after hold and resume occurred between worker ticks", async () => {
    at("2026-10-09T03:30:00Z"); await service.runOnce();
    await VendorExecutionEventModel.collection.insertMany([
      { _id: "hold-a", assignmentId: "assignment-a", action: "hold", occurredAt: new Date("2026-10-09T11:30:00Z"), version: 2 },
      { _id: "resume-a", assignmentId: "assignment-a", action: "resume", occurredAt: new Date("2026-10-10T03:00:00Z"), version: 3 },
      { _id: "hold-b", assignmentId: "assignment-b", action: "hold", occurredAt: new Date("2026-10-09T12:35:00Z"), version: 2 },
      { _id: "resume-b", assignmentId: "assignment-b", action: "resume", occurredAt: new Date("2026-10-10T03:00:00Z"), version: 3 }
    ] as any);
    await VendorExecutionStateModel.updateMany({}, { $set: { hold: null, reportingStartsOn: "2026-10-11", version: 3 } });
    at("2026-10-10T03:30:00Z"); await service.runOnce();
    expect((await ExecutionDailyObligationModel.findById("assignment-a:2026-10-09").lean())?.outcome).toBe("exempt");
    expect((await ExecutionDailyObligationModel.findById("assignment-b:2026-10-09").lean())?.outcome).toBe("missing");
    at("2026-10-11T03:30:00Z"); await service.runOnce(); expect((await daily()).state).toBe("due");
  });
  it("shows same-day resume as exempt before the scheduler can settle an existing obligation", async () => {
    at("2026-10-09T03:30:00Z"); await service.runOnce();
    await VendorExecutionEventModel.collection.insertMany([
      { _id: "hold-a", assignmentId: "assignment-a", action: "hold", occurredAt: new Date("2026-10-09T11:30:00Z"), version: 2 },
      { _id: "resume-a", assignmentId: "assignment-a", action: "resume", occurredAt: new Date("2026-10-09T12:00:00Z"), version: 3 }
    ] as any);
    await VendorExecutionStateModel.updateOne({ _id: "assignment-a" }, { $set: { hold: null, reportingStartsOn: "2026-10-10", version: 3 } });
    at("2026-10-09T13:00:00Z");
    expect((await daily()).state).toBe("exempt");
    expect((await ExecutionDailyObligationModel.findById("assignment-a:2026-10-09").lean())?.outcome).toBe("pending");
    await service.runOnce();
    expect((await ExecutionDailyObligationModel.findById("assignment-a:2026-10-09").lean())?.outcome).toBe("exempt");
  });
  it("creates one scoped digest at 09:00 with distinct Main Lines, records deadline, escalates at 19:00", async () => {
    await service.runOnce(); expect(sent).toHaveLength(0); expect(await ExecutionDailyObligationModel.countDocuments()).toBe(2);
    at("2026-10-09T03:30:00Z"); await service.runOnce(); await service.runOnce();
    expect(sent).toHaveLength(1); expect(sent[0]!.items.map(item => item.assignmentId)).toEqual(["assignment-a", "assignment-b"]);
    expect(sent[0]!.recipient.email).toBe(vendor.email);
    at("2026-10-09T12:30:00Z"); await service.runOnce(); expect((await daily()).state).toBe("missing");
    expect(await ExecutionDailyObligationModel.countDocuments({ outcome: "missing" })).toBe(2);
    at("2026-10-09T13:30:00Z"); await service.runOnce();
    expect(sent.filter(mail => mail.kind === "daily_escalation").map(mail => mail.recipient.email).sort()).toEqual([admin.email, manager.email, site.email].sort());
    expect(await ExecutionNotificationModel.countDocuments()).toBe(4);
    expect((await service.health()).lastSuccessAt).toBe(clock.toISOString());
  });
  it("late updates preserve missed cutoff but resolve missing escalation; a blocker still escalates", async () => {
    at("2026-10-09T12:30:00Z"); await service.runOnce();
    await report("assignment-a", "2026-10-09T12:31:00Z"); await report("assignment-b", "2026-10-09T12:32:00Z", "blocked");
    at("2026-10-09T13:30:00Z"); await service.runOnce();
    expect(await daily()).toMatchObject({ state: "late", reportedAt: "2026-10-09T12:31:00.000Z" });
    expect((await ExecutionDailyObligationModel.findById("assignment-a:2026-10-09").lean())?.outcome).toBe("missing");
    expect(sent).toHaveLength(3); expect(sent.every(mail => mail.items.length === 1 && mail.items[0]!.assignmentId === "assignment-b" && mail.items[0]!.reasons.includes("Work blocked"))).toBe(true);
  });
  it("recognizes an on-time zero progress report and never counts photos or notification reads as reports", async () => {
    at("2026-10-09T03:30:00Z"); await service.runOnce();
    const notification = (await service.notifications(vendor, {})).items[0]!;
    await service.readNotification(vendor, notification.id);
    await VendorExecutionEventModel.collection.insertOne({ _id: "photo-only", assignmentId: "assignment-b", action: "image", occurredAt: new Date("2026-10-09T12:00:00Z") } as any);
    await report("assignment-a", "2026-10-09T12:29:59Z", "not_started");
    at("2026-10-09T12:30:00Z"); await service.runOnce();
    expect((await daily()).state).toBe("on_time"); expect((await daily("assignment-b")).state).toBe("missing");
    expect((await service.notifications(vendor, {})).unreadCount).toBe(0);
  });
  it("suppresses future starts, holds and inactive accounts and resumes on a full prospective day", async () => {
    await VendorExecutionStateModel.updateOne({ _id: "assignment-b" }, { $set: { reportingStartsOn: "2026-10-12", "schedule.startDate": "2026-10-12" } });
    at("2026-10-09T03:30:00Z"); await service.runOnce(); expect(sent[0]!.items).toHaveLength(1);
    await UserModel.updateOne({ _id: vendor.id }, { $set: { active: false, updatedAt: clock } }, { timestamps: false });
    await service.runOnce(); expect((await daily()).state).toBe("exempt");
    at("2026-10-10T04:00:00Z"); await UserModel.updateOne({ _id: vendor.id }, { $set: { active: true, updatedAt: clock } }, { timestamps: false }); await service.runOnce();
    expect((await daily()).state).toBe("not_due");
    at("2026-10-11T03:30:00Z"); await service.runOnce(); expect((await daily()).state).toBe("due");
    await VendorExecutionStateModel.updateOne({ _id: "assignment-a" }, { $set: { hold: { reason: "Site paused", startedAt: clock, reviewDate: "2026-10-12", grantedById: site.id } } });
    await service.runOnce(); at("2026-10-11T13:00:00Z"); await service.runOnce();
    expect((await daily()).state).toBe("exempt"); expect(await ExecutionDailyObligationModel.countDocuments({ outcome: "missing" })).toBe(0);
  });
  it("retains pre-hold missed outcomes and skips project on-hold delivery", async () => {
    at("2026-10-09T12:30:00Z"); await service.runOnce();
    at("2026-10-09T12:35:00Z"); await VendorExecutionStateModel.updateMany({}, { $set: { hold: { reason: "Pause", startedAt: clock, reviewDate: "2026-10-12", grantedById: site.id } } }); await service.runOnce();
    expect(await ExecutionDailyObligationModel.countDocuments({ outcome: "missing" })).toBe(2);
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { status: "on_hold" } }); at("2026-10-09T13:30:00Z"); await service.runOnce(); expect(sent).toHaveLength(0);
    expect((await daily()).state).toBe("missing");
  });
  it("profile edits do not postpone reporting or clear an already missed cutoff", async () => {
    at("2026-10-09T03:30:00Z");
    await UserModel.updateOne({ _id: vendor.id }, { $set: { name: "Updated vendor profile", updatedAt: clock } }, { timestamps: false });
    expect((await daily()).state).toBe("due");
    await service.runOnce(); expect(sent).toHaveLength(1);
    at("2026-10-09T12:30:00Z"); await service.runOnce();
    await UserModel.updateOne({ _id: vendor.id }, { $set: { active: false, updatedAt: clock } }, { timestamps: false });
    at("2026-10-09T12:35:00Z"); await service.runOnce();
    expect((await daily()).state).toBe("missing");
    expect(await ExecutionDailyObligationModel.countDocuments({ outcome: "missing" })).toBe(2);
  });
  it("a suspension first observed after the cutoff cannot exempt an unsettled obligation", async () => {
    at("2026-10-09T03:30:00Z"); await service.runOnce();
    at("2026-10-09T12:35:00Z");
    await UserModel.updateOne({ _id: vendor.id }, { $set: { active: false } });
    expect((await daily()).state).toBe("missing");
    await service.runOnce();
    expect(await ExecutionDailyObligationModel.countDocuments({ outcome: "missing" })).toBe(2);
  });
  it("recovers bounded historical outcomes without sending historical email storms", async () => {
    at("2026-10-20T03:30:00Z"); await service.runOnce();
    expect(await ExecutionDailyObligationModel.countDocuments()).toBe(16);
    expect(sent).toHaveLength(1); expect(sent[0]!.localDate).toBe("2026-10-20");
    await service.runOnce(); expect(await ExecutionDailyObligationModel.countDocuments()).toBe(24); expect(sent).toHaveLength(1);
  });
  it("deduplicates simultaneous workers and retries failed delivery with the same logical notification", async () => {
    at("2026-10-09T03:30:00Z"); const other = make();
    await Promise.all([service.runOnce(), other.runOnce()]); await other.stop();
    expect(sent).toHaveLength(1); expect(await ExecutionNotificationModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "vendor_execution_reminder_recorded" })).toBe(1);
  });
  it("records disabled mail separately while obligations and in-app reminders remain available", async () => {
    const disabled = make(true, true); at("2026-10-09T03:30:00Z"); await disabled.runOnce();
    expect((await disabled.notifications(vendor, {})).items[0]!.deliveryStatus).toBe("unavailable");
    expect(await ExecutionDailyObligationModel.countDocuments()).toBe(2); expect(sent).toHaveLength(0);
    at("2026-10-09T03:36:00Z"); await service.runOnce(); expect(sent).toHaveLength(1); await disabled.stop();
  });
  it("recovers expired scheduler and delivery leases without duplicating the logical digest", async () => {
    const disabled = make(true, true); at("2026-10-09T03:30:00Z"); await disabled.runOnce(); await disabled.stop();
    const notification = await ExecutionNotificationModel.findOne().lean();
    await ExecutionSchedulerLeaseModel.updateOne({ _id: "reporting" }, { $set: { token: "crashed-scheduler", expiresAt: new Date(clock.getTime() - 1) } });
    await ExecutionNotificationModel.updateOne({ _id: notification!._id }, { $set: { deliveryStatus: "sending", attempts: 1, leaseToken: "crashed-mailer", leaseExpiresAt: new Date(clock.getTime() - 1) } });
    const other = make(); await Promise.all([service.runOnce(), other.runOnce()]); await other.stop();
    expect(sent).toHaveLength(1); expect(sent[0]!.notificationId).toBe(notification!._id);
    expect(await ExecutionNotificationModel.countDocuments()).toBe(1);
    expect(await ExecutionNotificationModel.findById(notification!._id).lean()).toMatchObject({ deliveryStatus: "sent", attempts: 2, leaseToken: null });
  });
  it("turns an exhausted expired lease into a visible failure and retries provider failures within bounds", async () => {
    const failure = vi.fn(async () => { throw new Error("Simulated provider unavailable"); });
    const failed = createVendorExecutionDeliveryService({ audit, auth, now: () => clock, enabled: true, mailer: { deliveryKind: "local_test", sendDigest: failure } });
    at("2026-10-09T03:30:00Z"); await failed.runOnce();
    expect(failure).toHaveBeenCalledTimes(1);
    const notification = await ExecutionNotificationModel.findOne().lean();
    expect(notification).toMatchObject({ deliveryStatus: "pending", attempts: 1, failureCode: "EXECUTION_EMAIL_FAILED" });
    at("2026-10-09T03:31:00Z"); await service.runOnce(); expect(sent).toHaveLength(1);
    await ExecutionNotificationModel.updateOne({ _id: notification!._id }, { $set: { deliveryStatus: "sending", attempts: 4, leaseToken: "exhausted-crash", leaseExpiresAt: new Date(clock.getTime() - 1) } });
    await service.runOnce();
    expect(await ExecutionNotificationModel.findById(notification!._id).lean()).toMatchObject({ deliveryStatus: "failed", failureCode: "DELIVERY_LEASE_EXPIRED", leaseToken: null });
    expect((await service.health()).failed).toBe(1); expect(sent).toHaveLength(1); await failed.stop();
  });
  it("escalates pending verification the next day and does not continue vendor reminders", async () => {
    await VendorExecutionStateModel.updateMany({}, { $set: { status: "awaiting_verification", submissionId: "review-a" } });
    await VendorExecutionReviewModel.collection.insertOne({ _id: "review-a", submittedAt: new Date("2026-10-09T05:00:00Z") } as any);
    at("2026-10-09T13:30:00Z"); await service.runOnce(); expect(sent).toHaveLength(0);
    at("2026-10-10T13:30:00Z"); await service.runOnce(); expect(sent).toHaveLength(3);
    expect(sent.every(mail => mail.items.every(item => item.reasons.includes("Site verification overdue")))).toBe(true);
  });
  it("resumes obligations for Client rework without rewriting legacy accepted status", async () => {
    await VendorWorkAssignmentModel.updateMany({}, { $set: { status: "client_approved" } });
    await VendorExecutionStateModel.updateMany({}, { $set: { status: "changes_requested", executionRound: 2 } });
    await SiteCompletionStateModel.collection.insertOne({ _id: "project-a", projectId: "project-a", status: "changes_requested" } as any);
    at("2026-10-09T03:30:00Z"); await service.runOnce();
    expect((await daily()).state).toBe("due"); expect(sent).toHaveLength(1);
    at("2026-10-09T13:30:00Z"); await service.runOnce();
    expect(sent.filter(mail => mail.kind === "daily_escalation")).toHaveLength(3);
    expect(await VendorWorkAssignmentModel.countDocuments({ status: "client_approved" })).toBe(2);
  });
  it("routes missing issued source to staff without creating vendor reporting penalties", async () => {
    await EstimateModel.deleteOne({ _id: "estimate-a" });
    at("2026-10-09T03:30:00Z"); await service.runOnce(); expect(sent).toHaveLength(0);
    expect(await ExecutionDailyObligationModel.countDocuments()).toBe(0);
    at("2026-10-09T13:30:00Z"); await service.runOnce();
    expect(sent).toHaveLength(3);
    expect(sent.every(mail => mail.items.every(item => item.reasons.includes("Issued work source unavailable")))).toBe(true);
  });
  it("escalates missing ownership only to the sole Super Admin without role-wide fallback", async () => {
    await ProjectWorkflowTaskModel.deleteMany({ projectId: "project-a" });
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { programManagerId: null } });
    at("2026-10-09T13:30:00Z"); await service.runOnce();
    expect(sent).toHaveLength(1); expect(sent[0]!.recipient.email).toBe(admin.email);
    expect(sent[0]!.items[0]!.reasons).toEqual(expect.arrayContaining(["Site Manager assignment required", "Program Manager assignment required"]));
  });
});

describe("policy, authorization and notifications", () => {
  it("resolves DST gaps forward and overlaps to the earlier occurrence, including half-hour shifts", () => {
    expect(executionCutoff("2026-03-08", "02:30", "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(executionCutoff("2026-11-01", "01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(executionCutoff("2026-10-04", "02:15", "Australia/Lord_Howe").toISOString()).toBe("2026-10-03T15:45:00.000Z");
    expect(executionCutoff("2026-04-05", "01:45", "Australia/Lord_Howe").toISOString()).toBe("2026-04-04T14:45:00.000Z");
    expect(executionCutoff("2026-10-09", "00:00", "Asia/Kolkata").toISOString()).toBe("2026-10-08T18:30:00.000Z");
  });
  const change = { expectedVersion: 0, idempotencyKey: "policy-change-one", reason: "Evening site shift", timezone: "Asia/Kolkata", reminderTime: "10:00", deadlineTime: "20:00", escalationTime: "21:00", effectiveDate: "2026-10-10" };
  it("versions future policies, freezes existing cutoffs, and enforces CAS/idempotency", async () => {
    at("2026-10-09T03:30:00Z"); await service.runOnce();
    expect((await service.savePolicy(manager, "project-a", change)).version).toBe(1);
    expect((await service.savePolicy(manager, "project-a", change)).version).toBe(1);
    expect((await service.policyForProject("project-a")).version).toBe(0);
    await expect(service.savePolicy(manager, "project-a", { ...change, reason: "Different" })).rejects.toMatchObject({ status: 409 });
    await expect(service.savePolicy(manager, "project-a", { ...change, idempotencyKey: "another-request" })).rejects.toMatchObject({ status: 409 });
    expect((await ExecutionDailyObligationModel.findById("assignment-a:2026-10-09").lean())?.dueAt.toISOString()).toBe("2026-10-09T12:30:00.000Z");
    at("2026-10-10T05:00:00Z"); await service.runOnce();
    expect((await ExecutionDailyObligationModel.findById("assignment-a:2026-10-10").lean())?.dueAt.toISOString()).toBe("2026-10-10T14:30:00.000Z");
    expect(await ExecutionReportingPolicyModel.countDocuments()).toBe(1);
  });
  it("rejects invalid timezones, unordered schedules and retrospective policy changes", async () => {
    await expect(service.savePolicy(manager, "project-a", { ...change, timezone: "Invalid/Zone" })).rejects.toBeTruthy();
    await expect(service.savePolicy(manager, "project-a", { ...change, deadlineTime: "09:00" })).rejects.toBeTruthy();
    await expect(service.savePolicy(manager, "project-a", { ...change, effectiveDate: "2026-10-09" })).rejects.toMatchObject({ status: 400 });
    await expect(service.savePolicy(otherManager, "project-a", change)).rejects.toMatchObject({ status: 404 });
    await expect(service.savePolicy(vendor, "project-a", change)).rejects.toMatchObject({ status: 404 });
  });
  it("does not disclose another recipient's notifications; revoked managers lose historical notification access", async () => {
    at("2026-10-09T13:30:00Z"); await service.runOnce();
    const notification = (await service.notifications(manager, {})).items[0]!;
    expect((await service.notifications(otherManager, {})).items).toEqual([]);
    await expect(service.readNotification(otherManager, notification.id)).rejects.toMatchObject({ status: 404 });
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { programManagerId: otherManager.id } });
    expect((await service.notifications(manager, {})).items).toEqual([]);
    await expect(service.readNotification(manager, notification.id)).rejects.toMatchObject({ status: 404 });
  });
  it("does not dispatch while rollout is disabled and escapes work descriptions in mail", async () => {
    const disabled = make(false); await disabled.runOnce(); expect(await ExecutionDailyObligationModel.countDocuments()).toBe(0); await disabled.stop();
    const mail = executionDigestTemplate({ notificationId: "n", recipient: { name: "Vendor", email: "example@example.test" }, projectId: "project-a", projectName: "<script>bad</script>", kind: "daily_reminder", localDate: "2026-10-09", timezone: "Asia/Kolkata", vendor: true, items: [{ assignmentId: "a", itemName: "<img src=x>", orderNumber: "WO", status: "in_progress", progress: 10, dueAt: null, reasons: [] }], overflowCount: 0 }, "https://app.example.test");
    expect(mail.html).not.toContain("<script>"); expect(mail.html).toContain("&lt;img src=x&gt;"); expect(mail.text).toContain("https://app.example.test/vendor");
  });
});

describe("execution SSE", () => {
  it("wakes independent vendor and manager streams from a separate writer process within two seconds", async () => {
    class StreamResponse extends EventEmitter {
      chunks: string[] = []; headersSent = false; destroyed = false; writableNeedDrain = false; writableLength = 0;
      status() { return this; } set() { return this; } flushHeaders() { this.headersSent = true; } write(chunk: string) { this.chunks.push(chunk); return true; } end() {} destroy() { this.destroyed = true; }
    }
    const vendorStream = createExecutionStream({ auth, heartbeatMs: 15000 });
    const managerStream = createExecutionStream({ auth: { authenticate: async () => manager } as unknown as AuthService, heartbeatMs: 15000 });
    const responses = [new StreamResponse(), new StreamResponse()];
    const request = (actor: PublicUser) => ({ authenticatedUser: actor, header: () => "Bearer test", socket: { remoteAddress: "127.0.0.1" } });
    try {
      await vendorStream.openStream(request(vendor) as any, responses[0] as any);
      await managerStream.openStream(request(manager) as any, responses[1] as any);
      // Allow change-stream cursors to establish; heartbeat cannot make this pass.
      await new Promise(resolve => setTimeout(resolve, 300));
      const started = Date.now();
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ["--input-type=module", "-e", `
          import mongoose from "mongoose";
          let input = "";
          for await (const chunk of process.stdin) input += chunk;
          const config = JSON.parse(input);
          try {
            await mongoose.connect(config.uri);
            await mongoose.connection.transaction(async session => {
              await mongoose.connection.collection(config.collection).insertOne({ _id: "independent-process-event", projectId: "project-a", vendorId: "vendor-a", assignmentId: "assignment-a", version: 2, kind: "report", occurredAt: new Date() }, { session });
            });
            await mongoose.disconnect();
          } catch { process.exitCode = 1; }
        `], { cwd: process.cwd(), stdio: ["pipe", "ignore", "ignore"] });
        child.once("error", reject);
        child.once("exit", code => code === 0 ? resolve() : reject(new Error("Independent event writer failed")));
        child.stdin.end(JSON.stringify({ uri: replica.uri, collection: ExecutionChangeEventModel.collection.collectionName }));
      });
      await vi.waitFor(() => {
        for (const response of responses) expect(response.chunks.filter(chunk => chunk.startsWith("event: execution"))).toHaveLength(2);
      }, { timeout: 1500, interval: 20 });
      expect(Date.now() - started).toBeLessThan(2000);
      for (const response of responses) expect(response.chunks.join("")).not.toContain("assignment-a");
      await VendorWorkAssignmentModel.collection.insertOne({ _id: "new-project-work", vendorId: "vendor-a", projectId: "project-b", status: "in_progress" } as any);
      await mongoose.connection.transaction(session => appendExecutionChange({ projectId: "project-b", vendorId: "vendor-a", version: 1, kind: "issued", occurredAt: new Date() }, session));
      await vi.waitFor(() => expect(responses[0]!.chunks.filter(chunk => chunk.startsWith("event: execution"))).toHaveLength(3), { timeout: 1500, interval: 20 });
      expect(responses[0]!.chunks.join("")).not.toContain('"status":"denied"');
      await VendorWorkAssignmentModel.updateOne({ _id: "new-project-work" }, { $set: { status: "superseded" } });
      await mongoose.connection.transaction(session => appendExecutionChange({ projectId: "project-a", vendorId: "vendor-a", version: 2, kind: "scope_changed", occurredAt: new Date() }, session));
      await vi.waitFor(() => expect(responses[0]!.chunks.join("")).toContain('"status":"denied"'), { timeout: 1500, interval: 20 });
      expect(vendorStream.health().connections).toBe(0);
    } finally { await vendorStream.stop(); await managerStream.stop(); }
  });
  it("delivers committed cross-process events, isolates vendors and closes after access revocation", async () => {
    const stream = createExecutionStream({ auth, heartbeatMs: 100, recoveryMs: 100 });
    class FakeResponse extends EventEmitter {
      chunks: string[] = []; headersSent = false; destroyed = false; writableNeedDrain = false; writableLength = 0;
      status() { return this; } set() { return this; } flushHeaders() { this.headersSent = true; } write(chunk: string) { this.chunks.push(chunk); return true; } end() {} destroy() { this.destroyed = true; }
    }
    const response = new FakeResponse();
    await stream.openStream({ authenticatedUser: vendor, header: () => "Bearer test", socket: { remoteAddress: "127.0.0.1" } } as any, response as any);
    const frames = () => response.chunks.filter(chunk => chunk.startsWith("event: execution")).length;
    await new Promise(resolve => setTimeout(resolve, 150));
    await mongoose.connection.transaction(session => appendExecutionChange({ projectId: "project-b", vendorId: "vendor-b", version: 1, kind: "report", occurredAt: clock }, session));
    await new Promise(resolve => setTimeout(resolve, 200)); expect(frames()).toBe(1);
    const started = Date.now();
    await mongoose.connection.transaction(session => appendExecutionChange({ projectId: "project-a", vendorId: "vendor-a", version: 1, kind: "report", occurredAt: clock }, session));
    await vi.waitFor(() => expect(frames()).toBe(2), { timeout: 1900, interval: 20 }); expect(Date.now() - started).toBeLessThan(2000);
    expect(response.chunks.join("")).not.toContain("vendor-a");
    await UserModel.updateOne({ _id: vendor.id }, { $set: { active: false } });
    await vi.waitFor(() => expect(response.chunks.join("")).toContain('"status":"denied"'), { timeout: 1900, interval: 20 });
    expect(stream.health().connections).toBe(0); await stream.stop();
  });
});
