import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionCommand } from "../src/contracts/vendor-execution.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { VendorExecutionEventModel } from "../src/models/VendorExecutionEvent.js";
import { VendorExecutionStateModel } from "../src/models/VendorExecutionState.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { executionProjectIds } from "../src/services/vendor-execution-access.js";
import { createVendorExecutionService, initializeIssuedExecution, invalidateExecutionVerificationForClientChanges } from "../src/services/vendor-execution.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/vendor-readiness.service.js", () => ({ vendorActivation: vi.fn(async () => ({ effectiveStatus: "active" })) }));
const actor = (id: string, role: PublicUser["role"], vendorId?: string): PublicUser => ({ id, name: id, email: `${id}@example.test`, role, ...(vendorId ? { vendorId } : {}) });
const site = actor("site-a", "site_manager");
const otherSite = actor("site-b", "site_manager");
const vendor = actor("vendor-user-a", "vendor", "vendor-a");
const otherVendor = actor("vendor-user-b", "vendor", "vendor-b");
const admin = actor("admin", "super_admin");
const clock = new Date("2026-10-09T09:00:00Z");
const workId = (order: string) => `vendor-work:${order}:1:line`;
const firstId = workId("order-a");
const secondId = workId("order-b");
const thirdId = workId("order-c");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let serial = 0;
const service = createVendorExecutionService({ audit: createAuditService(createMemoryRepository()), now: () => clock });

async function addWork(orderId: string, projectId: string, vendorId: string) {
  const line = { id: "line", procurementItemId: `item-${orderId}`, procurementItemVersion: 1, estimateId: `estimate-${projectId}`, estimateVersion: 1,
    estimateReviewRoundId: `round-${projectId}`, sourceSectionId: "basket", sourceLineItemKey: `source-${orderId}`, roomName: "Living", itemName: "Shared ceiling", brand: "Approved",
    uomId: "sqft", uomCode: "SQFT", uomName: "Square feet", quantityMilliUnits: 10000, unitPricePaise: 7500, gstBasisPoints: 0,
    description: "Approved scope", targetDate: "2026-10-15", netPaise: 75000, gstPaise: 0, totalPaise: 75000 };
  await ProjectPurchaseOrderModel.collection.insertOne({ _id: orderId, projectId, vendorId, orderNumber: orderId, status: "approved", approvedRevision: 1, approvedRevisionId: `revision-${orderId}`, cancelledAt: null } as any);
  await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: `revision-${orderId}`, orderId, projectId, vendorId, orderNumber: orderId, revision: 1, lines: [line] } as any);
  await VendorWorkAssignmentModel.collection.insertOne({ _id: workId(orderId), projectId, vendorId, orderId, orderRevision: 1, lineId: line.id, procurementItemId: line.procurementItemId,
    estimateId: line.estimateId, estimateVersion: 1, estimateReviewRoundId: line.estimateReviewRoundId, sourceSectionId: "basket", sourceLineItemKey: line.sourceLineItemKey,
    roomName: line.roomName, itemName: line.itemName, description: line.description, targetDate: line.targetDate, status: "ready", version: 1, progress: 0, currentRound: 1, note: "", receipts: [], createdAt: clock, updatedAt: clock } as any);
  await EstimateClientReviewRoundModel.collection.updateOne({ _id: `round-${projectId}` } as any, {
    $setOnInsert: { projectId, estimateId: line.estimateId, estimateVersion: 1, status: "approved", decision: "approve" },
    $push: { "estimateSnapshot.lineItems": { id: line.sourceLineItemKey, mainLineId: "same-main-line", mainBasketId: "basket", subBasketId: "sub", mainBasketName: "POP", subBasketName: "Ceilings" } }
  } as any, { upsert: true });
  await mongoose.connection.transaction(session => initializeIssuedExecution({ orderId, projectId, vendorId, revision: 1, lines: [line], occurredAt: clock, actorId: admin.id }, session));
}

async function reportEvent(overrides: Record<string, unknown> = {}) {
  const id = `report-${++serial}`;
  await VendorExecutionEventModel.collection.insertOne({ _id: id, assignmentId: firstId, projectId: "active", vendorId: vendor.vendorId, actorId: vendor.id, action: "report",
    occurredAt: clock, localDate: "2026-10-09", timezone: "Asia/Kolkata", executionRound: 1, version: 2, idempotencyKey: id, requestDigest: id,
    note: "Ceiling framing started", reason: null, nextAction: null, progress: 25, status: "in_progress", ...overrides } as any);
  return id;
}

beforeAll(async () => {
  replica = await startMongoReplicaSet("site-manager-workspace-tests");
  for (const model of [UserModel, VendorExecutionStateModel, VendorExecutionEventModel, VendorWorkAssignmentModel]) await model.syncIndexes();
}, 120000);
beforeEach(async () => {
  await replica.clear(); serial = 0;
  await UserModel.create([site, otherSite, vendor, otherVendor, admin].map(user => ({ _id: user.id, name: user.name, email: user.email, emailNormalized: user.email, passwordHash: "fixture-only",
    role: user.role, active: true, vendorId: user.vendorId ?? null })));
  await AiEstimatorKnowledgeVendorModel.collection.insertMany([{ _id: "vendor-a", name: "Vendor A", status: "active" }, { _id: "vendor-b", name: "Vendor B", status: "active" }] as any);
  const projects = [
    { _id: "completed", name: "A completed project", status: "completed", completionAuthority: "vendor_client" },
    { _id: "active", name: "B current project", status: "active", completionAuthority: "vendor_client" },
    { _id: "hold", name: "C held project", status: "on_hold", completionAuthority: "vendor_client" },
    { _id: "planning", name: "D shared name", status: "planning" },
    { _id: "same-name", name: "D shared name", status: "active", completionAuthority: "vendor_client" },
    { _id: "foreign", name: "Private second manager project", status: "active", completionAuthority: "vendor_client" }
  ];
  await ProjectModel.collection.insertMany(projects as any);
  await ProjectWorkflowTaskModel.collection.insertMany(projects.map(project => ({ _id: `task-${project._id}`, projectId: project._id, kind: "site_execution", assigneeRole: "site_manager",
    assigneeUserId: project._id === "foreign" ? otherSite.id : site.id })) as any);
  await addWork("order-a", "active", "vendor-a");
  await addWork("order-b", "active", "vendor-b");
  await addWork("order-c", "active", "vendor-a");
  await addWork("order-foreign", "foreign", "vendor-b");
}, 30000);
afterAll(async () => { await replica?.stop(); });

describe("Site Manager current assigned projects", () => {
  it("filters before pagination and totals, retaining on-hold, zero-work and same-name projects by ID", async () => {
    const first = await service.portfolio(site, { projectScope: "current", limit: 2 });
    const second = await service.portfolio(site, { projectScope: "current", limit: 2, offset: 2 });
    expect(first.total).toBe(4); expect(second.total).toBe(4);
    expect(first.items.map(item => item.id)).toEqual(["active", "hold"]);
    expect(second.items.map(item => item.id)).toEqual(["planning", "same-name"]);
    expect(first.items[1]?.counts.total).toBe(0);
    const matching = await service.portfolio(site, { projectScope: "current", q: "  shared name  ", limit: 1, offset: 1 });
    expect(matching.total).toBe(2); expect(matching.items.map(item => item.id)).toEqual(["same-name"]);
    expect((await service.portfolio(otherSite, { projectScope: "current" })).items.map(item => item.id)).toEqual(["foreign"]);
  });

  it("preserves omitted/all behavior and rejects invalid or non-portfolio scope queries", async () => {
    expect((await service.portfolio(site)).total).toBe(5);
    expect((await service.portfolio(site, { projectScope: "all", limit: 1 })).items[0]?.id).toBe("completed");
    await expect(service.portfolio(site, { projectScope: "finished" } as any)).rejects.toMatchObject({ status: 400 });
    await expect(service.project(site, "active", { projectScope: "current" } as any)).rejects.toMatchObject({ status: 400 });
    await expect(service.history(site, firstId, { projectScope: "current" } as any)).rejects.toMatchObject({ status: 400 });
  });

  it("provides authorized metadata and real zero counts even with no issued work", async () => {
    const planning = await service.project(site, "planning");
    expect(planning).toMatchObject({ project: { id: "planning", name: "D shared name", status: "planning", completionAuthority: "legacy_staff" }, total: 0, items: [] });
    expect(planning.projectCounts).toEqual(planning.counts); expect(planning.projectCounts?.total).toBe(0);
    expect((await service.project(site, "hold")).project).toMatchObject({ status: "on_hold", completionAuthority: "vendor_client" });
    const mine = await service.listMine(vendor);
    expect(mine.project).toBeNull(); expect(mine.projectCounts).toBeNull();
    await expect(service.project(otherSite, "planning")).rejects.toMatchObject({ status: 404 });
  });

  it("revokes portfolio, live-scope, detail and history access for ambiguous or reassigned tasks", async () => {
    await ProjectWorkflowTaskModel.collection.insertOne({ _id: "duplicate-assignment", projectId: "active", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: otherSite.id } as any);
    for (const user of [site, otherSite]) {
      expect(await executionProjectIds(user)).not.toContain("active");
      expect((await service.portfolio(user)).items.map(item => item.id)).not.toContain("active");
      await expect(service.project(user, "active")).rejects.toMatchObject({ status: 404 });
      await expect(service.detail(user, firstId)).rejects.toMatchObject({ status: 404 });
      await expect(service.history(user, firstId)).rejects.toMatchObject({ status: 404 });
    }
    await ProjectWorkflowTaskModel.updateOne({ _id: "duplicate-assignment" }, { $set: { assigneeUserId: site.id } });
    expect(await executionProjectIds(site)).not.toContain("active");
    expect((await service.portfolio(site)).items.map(item => item.id)).not.toContain("active");
    await ProjectWorkflowTaskModel.deleteOne({ _id: "duplicate-assignment" });
    await ProjectWorkflowTaskModel.updateOne({ _id: "task-active" }, { $set: { assigneeUserId: otherSite.id } });
    expect((await service.portfolio(site)).items.map(item => item.id)).not.toContain("active");
    expect((await service.portfolio(otherSite)).items.map(item => item.id)).toContain("active");
    await ProjectWorkflowTaskModel.deleteOne({ _id: "task-hold" });
    await expect(service.project(site, "hold")).rejects.toMatchObject({ status: 404 });
  });
});

describe("Site Manager project summary and report lineage", () => {
  it("keeps project counts unfiltered while preserving filtered counts and page totals", async () => {
    await VendorExecutionStateModel.updateOne({ _id: firstId }, { $set: { status: "blocked" } });
    await VendorExecutionStateModel.updateOne({ _id: secondId }, { $set: { status: "awaiting_verification" } });
    const full = await service.project(site, "active");
    expect(full.projectCounts).toMatchObject({ total: 3, blocked: 1, awaitingVerification: 1 });
    for (const filters of [{ vendorId: "vendor-a", limit: 1, offset: 1 }, { status: "blocked" }, { flag: "blocked" }, { q: "order-b" }, { q: "no matching item" }]) {
      const filtered = await service.project(site, "active", filters);
      expect(filtered.projectCounts).toEqual(full.projectCounts);
      expect(filtered.counts.total).toBe(filtered.total);
    }
    const vendorPage = await service.project(site, "active", { vendorId: "vendor-a", limit: 1, offset: 1 });
    expect(vendorPage.total).toBe(2); expect(vendorPage.items).toHaveLength(1);
    expect((await service.project(site, "active", { status: "blocked" })).counts).toMatchObject({ total: 1, blocked: 1, awaitingVerification: 0 });
    expect((await service.project(otherSite, "foreign")).projectCounts?.total).toBe(1);
  });

  it("batches the latest current-round vendor reports with deterministic ordering and exact source identities", async () => {
    await reportEvent({ _id: "first-report", version: 2, status: "blocked", reason: "Access needed", nextAction: "Arrange access" });
    await reportEvent({ _id: "last-report-a", version: 3, note: "Newer progress", progress: 40 });
    await reportEvent({ _id: "last-report-z", version: 3, note: "Same-millisecond final report", progress: 45 });
    await reportEvent({ _id: "older-report", occurredAt: new Date("2026-10-09T08:00:00Z"), version: 50, note: "Earlier report timestamp" });
    await reportEvent({ _id: "staff-note", action: "hold", version: 10, note: "Staff inspection note" });
    await reportEvent({ _id: "wrong-vendor", vendorId: "vendor-b", version: 20, note: "Do not disclose wrong vendor" });
    await reportEvent({ _id: "wrong-project", projectId: "foreign", version: 30, note: "Do not disclose wrong project" });
    await reportEvent({ _id: "other-round", executionRound: 2, version: 40, note: "Do not disclose other round" });
    await reportEvent({ _id: "second-work-report", assignmentId: secondId, vendorId: "vendor-b", note: "Other vendor same named line", version: 2, progress: 15 });
    await VendorExecutionStateModel.updateOne({ _id: firstId }, { $set: { latestNote: "Later staff note" } });
    const aggregate = vi.spyOn(VendorExecutionEventModel, "aggregate");
    const page = await service.project(site, "active");
    expect(aggregate).toHaveBeenCalledTimes(1); aggregate.mockRestore();
    expect(page.items.find(item => item.id === firstId)).toMatchObject({ latestNote: "Later staff note", latestVendorReport: {
      eventId: "last-report-z", executionRound: 1, reportedAt: clock.toISOString(), note: "Same-millisecond final report", reason: null, nextAction: null, progress: 45, status: "in_progress"
    } });
    expect(page.items.find(item => item.id === secondId)?.latestVendorReport?.note).toBe("Other vendor same named line");
    expect(page.items.find(item => item.id === thirdId)?.latestVendorReport).toBeNull();
    expect((await service.detail(site, firstId)).latestVendorReport).toEqual(page.items.find(item => item.id === firstId)?.latestVendorReport);
  });

  it("projects actual report commands and keeps old-round blockers only in history after rework", async () => {
    const command = async (user: PublicUser, action: ExecutionCommand["action"], fields: Partial<ExecutionCommand> = {}) => {
      const current = await service.detail(user, firstId);
      return service.command(user, firstId, { action, expectedVersion: current.version, idempotencyKey: `workspace-command-${++serial}`, ...fields });
    };
    await command(vendor, "acknowledge");
    await command(vendor, "propose_schedule", { startDate: "2026-10-09", finishDate: "2026-10-15" });
    await command(site, "confirm_schedule", { startDate: "2026-10-09", finishDate: "2026-10-15" });
    const blocked = await command(vendor, "report", { status: "blocked", progress: 10, note: "Cannot enter room", reason: "Room locked", nextAction: "Site Manager to provide access" });
    expect(blocked.latestVendorReport).toMatchObject({ note: "Cannot enter room", reason: "Room locked", nextAction: "Site Manager to provide access", progress: 10, status: "blocked" });
    await command(site, "hold", { reason: "Client access pause", reviewDate: "2026-10-11" });
    expect((await service.detail(site, firstId)).latestVendorReport).toEqual(blocked.latestVendorReport);
    await mongoose.connection.transaction(session => invalidateExecutionVerificationForClientChanges(firstId, admin.id, "Rework required", session, clock));
    const reworked = await service.detail(site, firstId);
    expect(reworked).toMatchObject({ executionRound: 2, status: "changes_requested", latestVendorReport: null });
    expect((await service.history(site, firstId)).items.find(event => event.action === "report")?.reason).toBe("Room locked");
    expect((await service.project(site, "active")).projectCounts?.blocked).toBe(0);
  });

  it("keeps portfolio, empty-project and report reads free of state, audit or event writes", async () => {
    await VendorExecutionStateModel.deleteOne({ _id: thirdId });
    const models = [VendorExecutionStateModel, VendorExecutionEventModel, VendorWorkAssignmentModel, AuditEventModel];
    const before = await Promise.all(models.map(model => model.countDocuments()));
    await service.portfolio(site, { projectScope: "current", limit: 1 });
    await service.project(site, "planning");
    await service.project(site, "active", { vendorId: "vendor-b" });
    expect((await service.detail(site, thirdId)).latestVendorReport).toBeNull();
    expect(await Promise.all(models.map(model => model.countDocuments()))).toEqual(before);
    expect(await VendorExecutionStateModel.findById(thirdId).lean()).toBeNull();
  });
});
