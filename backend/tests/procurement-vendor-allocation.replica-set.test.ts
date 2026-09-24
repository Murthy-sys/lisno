import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProcurementVendorBaselineService } from "../src/services/procurement-vendor-baseline.service.js";
import { procurementVendorAllocationTotals } from "../src/services/procurement-vendor-allocation.service.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ProjectModel } from "../src/models/Project.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectProcurementService } from "../src/services/project-procurement.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor: PublicUser = { id: "buyer", name: "Buyer", email: "buyer@example.test", role: "procurement" };
const other: PublicUser = { ...actor, id: "other-buyer", email: "other@example.test" };
const admin: PublicUser = { id: "super", name: "Synthetic Super", email: "super@example.test", role: "super_admin" };
const fields = { estimateId: "estimate-project-a", estimateVersion: 1, sourceLineItemKey: "line-first", itemName: "Plywood Sheet", brand: "Timber Brand", uomId: "sheet", vendorId: null, pricePaise: 12345 };
const now = new Date("2026-09-17T10:00:00.000Z");
const audit = createAuditService(createMemoryRepository());
const service = createProjectProcurementService({ audit, now: () => now });
const baselineService = createProcurementVendorBaselineService({ audit, now: () => now });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-vendor-allocation-tests");
  await Promise.all([UserModel, ProjectModel, EstimateModel, EstimateClientReviewRoundModel, ProjectWorkflowTaskModel,
    AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeVendorModel, AiEstimatorKnowledgeDisplayOrderSequenceModel,
    AuditEventModel, ProjectProcurementItemModel, FinanceLedgerEntryModel, ProjectFinanceBucketModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  vi.restoreAllMocks();
  await replica.clear();
  await UserModel.create([actor, other, admin].map((user) => ({ _id: user.id, name: user.name, email: user.email, emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, active: true })));
  await createProject("project-a", actor.id, 10000);
  await createProject("project-b", other.id, 23500);
  await AiEstimatorKnowledgeUomModel.create([
    { _id: "sheet", code: "SHT", name: "Sheet", decimalScale: 0, displayOrder: 1, status: "active", version: 1, createdById: actor.id, updatedById: actor.id },
    { _id: "meter", code: "M", name: "Meter", decimalScale: 2, displayOrder: 2, status: "active", version: 1, createdById: actor.id, updatedById: actor.id },
    { _id: "inactive", code: "OLD", name: "Old unit", decimalScale: 0, displayOrder: 3, status: "inactive", version: 1, createdById: actor.id, updatedById: actor.id }
  ]);
});
afterAll(async () => { await replica?.stop(); });

async function createProject(projectId: string, assigneeId: string, subtotal: number) {
  const estimateId = `estimate-${projectId}`;
  const lineItems = [
    { id: "line-first", catalogueId: "CA01", roomName: "Living Room", specification: "Approved plywood", unit: "sqft", rate: subtotal, quantity: 1, included: true, amount: subtotal },
    { id: "line-zero", catalogueId: "CA02", roomName: "Bedroom", specification: "Selected zero quantity", unit: "nos", rate: 50, quantity: 0, included: true, amount: 0 },
    { id: "line-excluded", catalogueId: "CA03", roomName: "Kitchen", specification: "Excluded", unit: "nos", rate: 50, quantity: 1, included: false, amount: 0 }
  ];
  await ProjectModel.create({
    _id: projectId, name: projectId, clientName: "Client", clientEmail: "client@example.test", clientEmailNormalized: "client@example.test",
    clientMobile: "9000000000", clientAddress: "Bengaluru", status: "active", location: "Bengaluru", plannedStartAt: now,
    plannedEndAt: new Date("2026-12-17T10:00:00.000Z")
  });
  await EstimateModel.create({
    _id: estimateId, leadId: `lead-${projectId}`, ownerId: actor.id, version: 2, status: "client_approved", propertyType: "villa",
    rooms: [], scopes: [], lineItems, subtotal, gst: subtotal * 0.18, total: subtotal * 1.18, approvalRequired: false, projectId,
    reviews: [{ actorId: actor.id, action: "client_approved", note: "Approved", occurredAt: now }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: now,
    designPlanApprovedById: actor.id, designPlanApprovalSource: "admin_proof", clientDecisionAt: now
  });
  await EstimateClientReviewRoundModel.create({
    _id: `round-${projectId}`, estimateId, leadId: `lead-${projectId}`, projectId: null, estimateVersion: 1, sendGeneration: 1,
    dedupeKey: (projectId === "project-a" ? "a" : "b").repeat(64), recipientEmail: "client@example.test", recipientEmailNormalized: "client@example.test",
    estimateSnapshot: { clientName: "Client", projectName: projectId, location: "Bengaluru", propertyType: "villa", lineItems, subtotal, gst: subtotal * 0.18, total: subtotal * 1.18 },
    pdfFilename: "approved.pdf", pdfMimeType: "application/pdf", pdfByteSize: 1, pdfSha256: "c".repeat(64), pdfStorageReference: "approved.pdf",
    deliveryStatus: "sent", deliveryAttemptGeneration: 1, deliveryAttemptCount: 1, deliveryAttemptedAt: now, deliveredAt: now,
    assignedAdminId: actor.id, status: "approved", decision: "approve", decisionSource: "admin_proof", decisionNote: "Approved", decidedById: actor.id, decidedAt: now, version: 2
  });
  await ProjectWorkflowTaskModel.create({
    _id: `task-${projectId}`, dedupeKey: `${estimateId}:procurement`, projectId, estimateId, designPlanVersion: 1, kind: "procurement",
    title: "Prepare procurement", assigneeRole: "procurement", assigneeUserId: assigneeId, status: "open", progress: 0, version: 1, openedAt: now
  });
}

async function vendor(name = "Allocation Vendor", verified = false) {
  const result = (await service.createVendor(actor, { name })).vendor;
  if (verified) await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: result.id } as any, { $set: { procurementProfile: { currentAddressVerifiedPhysically: true } } });
  return result;
}
async function allocate(vendorId: string, amount: number, projectId = "project-a", brand = "Timber Brand") {
  return service.create(actor, projectId, { ...fields, estimateId: `estimate-${projectId}`, vendorId, allocatedWorkPaise: amount, brand });
}
async function historical(vendorId: string, id = "historical", projectId = "project-a") {
  await ProjectProcurementItemModel.create({ _id: id, projectId, itemName: `Old item ${id}`, itemNameNormalized: `old item ${id}`,
    brand: "Original", brandNormalized: "original", uomId: "sheet", uomCode: "SHT", uomName: "Sheet", uomSearch: "sht sheet",
    vendorId, vendorCode: "OLD", vendorName: "Original Vendor", vendorSearch: "original vendor", pricePaise: 15_001,
    version: 1, createdById: actor.id, updatedById: actor.id });
  // Exact old storage shape, before the new nullable fields existed.
  await ProjectProcurementItemModel.collection.updateOne({ _id: id } as any, { $unset: { allocatedWorkPaise: "", allocationTrackingVersion: "", allocationBaselineReceipt: "" } });
  return id;
}
const correction = { expectedVersion: 1, allocatedWorkPaise: 6_000_000, reason: "Record work committed before allocation tracking", idempotencyKey: "baseline-request" };

describe("vendor allocation transactions", () => {
  it("aggregates unequal projects, allows 30,000 plus 20,000 INR and rejects one extra paise without side effects", async () => {
    const saved = await vendor();
    const first = await allocate(saved.id, 3_000_000);
    const second = await allocate(saved.id, 2_000_000, "project-b");
    expect(first.allocatedWorkPaise).toBe(3_000_000);
    expect(second.allocatedWorkPaise).toBe(2_000_000);
    const audits = await AuditEventModel.countDocuments();
    await expect(allocate(saved.id, 1, "project-b", "Third")).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED", fields: { allocatedWorkPaise: expect.any(String) } });
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(2);
    expect(await AuditEventModel.countDocuments()).toBe(audits);
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(0);
  });
  it("serializes concurrent unchanged-vendor increases across projects", async () => {
    const saved = await vendor();
    const first = await allocate(saved.id, 1_000_000);
    const second = await allocate(saved.id, 2_000_000, "project-b");
    const results = await Promise.allSettled([
      service.update(actor, "project-a", first.id, { ...fields, vendorId: saved.id, allocatedWorkPaise: 2_500_000, expectedVersion: 1 }),
      service.update(other, "project-b", second.id, { ...fields, estimateId: "estimate-project-b", vendorId: saved.id, allocatedWorkPaise: 3_500_000, expectedVersion: 1 })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED" } });
    const totals = await mongoose.connection.transaction((session) => procurementVendorAllocationTotals(saved.id, session));
    expect(totals).toEqual({ totalAllocatedWorkPaise: 4_500_000n, unknownItemCount: 0 });
  });
  it("preserves allocation on price-only updates and audits explicit reductions", async () => {
    const saved = await vendor();
    const item = await allocate(saved.id, 4_000_000);
    const updated = await service.update(actor, "project-a", item.id, { ...fields, vendorId: saved.id, pricePaise: 999, expectedVersion: 1 });
    expect(updated).toMatchObject({ pricePaise: 999, allocatedWorkPaise: 4_000_000, version: 2 });
    const reduced = await service.update(actor, "project-a", item.id, { ...fields, vendorId: saved.id, allocatedWorkPaise: 1_000_000, expectedVersion: 2 });
    expect(reduced.allocatedWorkPaise).toBe(1_000_000);
    expect(await AuditEventModel.findOne({ action: "project_procurement_item_updated", "newValues.version": 3 }).lean()).toMatchObject({ oldValues: { allocatedWorkPaise: 4_000_000 }, newValues: { allocatedWorkPaise: 1_000_000 } });
    await expect(service.update(actor, "project-a", item.id, { ...fields, vendorId: saved.id, allocatedWorkPaise: null, expectedVersion: 3 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("checks reassignment on the new vendor, releases the old amount and clears on removal", async () => {
    const firstVendor = await vendor("First vendor");
    const secondVendor = await vendor("Second vendor");
    const item = await allocate(firstVendor.id, 3_000_000);
    await allocate(secondVendor.id, 4_000_000, "project-b");
    await expect(service.update(actor, "project-a", item.id, { ...fields, vendorId: secondVendor.id, allocatedWorkPaise: 1_000_001, expectedVersion: 1 })).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED" });
    await expect(service.update(actor, "project-a", item.id, { ...fields, vendorId: secondVendor.id, expectedVersion: 1 })).rejects.toMatchObject({ code: "PROCUREMENT_ALLOCATION_INVALID" });
    await service.update(actor, "project-a", item.id, { ...fields, vendorId: secondVendor.id, allocatedWorkPaise: 1_000_000, expectedVersion: 1 });
    const totals = await mongoose.connection.transaction((session) => procurementVendorAllocationTotals(firstVendor.id, session));
    expect(totals.totalAllocatedWorkPaise).toBe(0n);
    const removed = await service.update(actor, "project-a", item.id, { ...fields, expectedVersion: 2 });
    expect(removed).toMatchObject({ vendor: null, allocatedWorkPaise: null });
  });
  it("permits verified vendors above the cap then preserves reductions after downgrade", async () => {
    const saved = await vendor("Verified", true);
    const item = await allocate(saved.id, 9_000_000);
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: saved.id } as any, { $set: { "procurementProfile.currentAddressVerifiedPhysically": false } });
    await service.update(actor, "project-a", item.id, { ...fields, vendorId: saved.id, allocatedWorkPaise: 8_000_000, expectedVersion: 1 });
    await expect(allocate(saved.id, 1, "project-b")).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED" });
    expect((await service.update(actor, "project-a", item.id, { ...fields, vendorId: saved.id, pricePaise: 999, expectedVersion: 2 })).allocatedWorkPaise).toBe(8_000_000);
  });
  it("retries a snapshot after a concurrent verification downgrade on the shared vendor document", async () => {
    const saved = await vendor("Verification race", true);
    await allocate(saved.id, 4_000_000);
    let locked!: () => void;
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { locked = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const downgrade = mongoose.connection.transaction(async (session) => {
      await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: saved.id } as any, { $set: { "procurementProfile.currentAddressVerifiedPhysically": false }, $inc: { version: 1 } }, { session });
      locked();
      await gate;
    });
    await lock;
    let allocationReachedLock!: () => void;
    const reachedLock = new Promise<void>((resolve) => { allocationReachedLock = resolve; });
    const findAndUpdate = AiEstimatorKnowledgeVendorModel.findOneAndUpdate.bind(AiEstimatorKnowledgeVendorModel);
    vi.spyOn(AiEstimatorKnowledgeVendorModel, "findOneAndUpdate").mockImplementation((...args: any[]) => {
      allocationReachedLock();
      return (findAndUpdate as any)(...args);
    });
    const allocation = allocate(saved.id, 2_000_000, "project-b");
    await reachedLock;
    release();
    await downgrade;
    await expect(allocation).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED" });
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(1);
  });
  it("rolls back allocation and vendor coordination when audit fails", async () => {
    const saved = await vendor();
    const before = await AiEstimatorKnowledgeVendorModel.findById(saved.id).lean();
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => { await append(...args); throw new Error("Injected audit failure"); });
    await expect(allocate(saved.id, 1_000_000)).rejects.toThrow("Injected audit failure");
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(0);
    expect((await AiEstimatorKnowledgeVendorModel.findById(saved.id).lean())?.dependencyEpoch).toBe(before?.dependencyEpoch);
  });
  it("does not reset the recorded sum for old estimate versions or completed projects", async () => {
    const saved = await vendor();
    await allocate(saved.id, 4_000_000);
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { status: "completed" } });
    await ProjectProcurementItemModel.updateMany({}, { $set: { estimateVersion: 42 } });
    await expect(allocate(saved.id, 1_000_001, "project-b")).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED" });
  });
});

describe("restricted historical allocation completion", () => {
  it("blocks unknown history while keeping metadata-only legacy editing available", async () => {
    const saved = await vendor();
    const itemId = await historical(saved.id);
    await expect(allocate(saved.id, 1, "project-b")).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_ALLOCATION_BASELINE_INCOMPLETE" });
    const { estimateId: _estimate, estimateVersion: _version, sourceLineItemKey: _line, ...legacy } = fields;
    const edit = await service.update(actor, "project-a", itemId, { ...legacy, itemName: "Corrected label", vendorId: saved.id, expectedVersion: 1 });
    expect(edit.allocatedWorkPaise).toBeNull();
    expect((await ProjectProcurementItemModel.findById(itemId).lean())?.allocationTrackingVersion).toBeNull();
    await expect(service.update(actor, "project-a", itemId, { ...legacy, vendorId: saved.id, allocatedWorkPaise: 1, expectedVersion: 2 })).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_ALLOCATION_BASELINE_INCOMPLETE" });
    const page = await baselineService.list(admin, saved.id, { limit: 20, offset: 0 });
    expect(page).toEqual({ items: [{ itemId, projectId: "project-a", projectName: "project-a", itemName: "Corrected label", brand: fields.brand, version: 2 }], total: 1, limit: 20, offset: 0 });
  });
  it("records factual history above the cap once, preserves source/price and returns the same receipt after later editing", async () => {
    const saved = await vendor();
    const itemId = await historical(saved.id);
    const result = await baselineService.complete(admin, saved.id, itemId, correction);
    expect(result).toEqual({ itemId, projectId: "project-a", vendorId: saved.id, allocatedWorkPaise: 6_000_000, version: 2, recordedAt: now.toISOString() });
    const row = await ProjectProcurementItemModel.findById(itemId).lean();
    expect(row).toMatchObject({ pricePaise: 15_001, estimateId: null, vendorId: saved.id, allocationTrackingVersion: 1 });
    expect((await baselineService.list(admin, saved.id, { limit: 20, offset: 0 })).total).toBe(0);
    await expect(allocate(saved.id, 1, "project-b")).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED" });
    const { estimateId: _estimate, estimateVersion: _version, sourceLineItemKey: _line, ...legacy } = fields;
    await service.update(actor, "project-a", itemId, { ...legacy, vendorId: saved.id, pricePaise: 321, expectedVersion: 2 });
    expect(await baselineService.complete(admin, saved.id, itemId, correction)).toEqual(result);
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_allocation_baseline_recorded" })).toBe(1);
    await expect(baselineService.complete(admin, saved.id, itemId, { ...correction, allocatedWorkPaise: 1 })).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_BASELINE_IDEMPOTENCY_CONFLICT" });
    await expect(baselineService.complete(admin, saved.id, itemId, { ...correction, idempotencyKey: "other" })).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_BASELINE_IDEMPOTENCY_CONFLICT" });
  });
  it("deduplicates concurrent identical corrections and protects stale or mismatched identities", async () => {
    const saved = await vendor();
    const otherVendor = await vendor("Other");
    const itemId = await historical(saved.id);
    await expect(baselineService.complete(admin, otherVendor.id, itemId, correction)).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_NOT_FOUND" });
    await expect(baselineService.complete(admin, saved.id, itemId, { ...correction, expectedVersion: 2 })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_VERSION_CONFLICT" });
    const results = await Promise.all([baselineService.complete(admin, saved.id, itemId, correction), baselineService.complete(admin, saved.id, itemId, correction)]);
    expect(results[0]).toEqual(results[1]);
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_allocation_baseline_recorded" })).toBe(1);
  });
  it("recomputes a baseline correction before admitting a concurrent allocation", async () => {
    const saved = await vendor();
    const itemId = await historical(saved.id);
    let baselineLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => { baselineLocked = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => {
      baselineLocked();
      await gate;
      return append(...args);
    });
    const completion = baselineService.complete(admin, saved.id, itemId, { ...correction, allocatedWorkPaise: 4_000_000 });
    await locked;
    let allocationReachedLock!: () => void;
    const reachedLock = new Promise<void>((resolve) => { allocationReachedLock = resolve; });
    const findAndUpdate = AiEstimatorKnowledgeVendorModel.findOneAndUpdate.bind(AiEstimatorKnowledgeVendorModel);
    vi.spyOn(AiEstimatorKnowledgeVendorModel, "findOneAndUpdate").mockImplementation((...args: any[]) => {
      allocationReachedLock();
      return (findAndUpdate as any)(...args);
    });
    const allocation = allocate(saved.id, 2_000_000, "project-b");
    await reachedLock;
    release();
    await completion;
    await expect(allocation).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED" });
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_allocation_baseline_recorded" })).toBe(1);
  });
  it("excludes every new item and consumes exception eligibility on vendor reassignment/removal", async () => {
    const saved = await vendor();
    const target = await vendor("Target");
    const newItem = await allocate(saved.id, 100);
    const newUnassigned = await service.create(actor, "project-a", { ...fields, brand: "Unassigned" });
    expect((await ProjectProcurementItemModel.findById(newUnassigned.id).lean())?.allocationTrackingVersion).toBe(1);
    await expect(baselineService.complete(admin, saved.id, newItem.id, correction)).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_BASELINE_INELIGIBLE" });
    const first = await historical(saved.id, "removal");
    const second = await historical(saved.id, "reassignment");
    const { estimateId: _estimate, estimateVersion: _version, sourceLineItemKey: _line, ...legacy } = fields;
    await service.update(actor, "project-a", first, { ...legacy, itemName: "Removed", expectedVersion: 1 });
    await service.update(actor, "project-a", second, { ...legacy, itemName: "Reassigned", vendorId: target.id, allocatedWorkPaise: 100, expectedVersion: 1 });
    for (const id of [first, second]) expect((await ProjectProcurementItemModel.findById(id).lean())?.allocationTrackingVersion).toBe(1);
    expect((await baselineService.list(admin, saved.id, { limit: 20, offset: 0 })).total).toBe(0);
    await expect(baselineService.complete(admin, target.id, second, { ...correction, expectedVersion: 2 })).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_BASELINE_INELIGIBLE" });
  });
  it("denies Procurement and disabled Super Admin without HTTP middleware and preserves the sole-identity index", async () => {
    const saved = await vendor();
    const itemId = await historical(saved.id);
    await expect(baselineService.list(actor, saved.id, { limit: 20, offset: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(baselineService.complete(actor, saved.id, itemId, correction)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await UserModel.updateOne({ _id: admin.id }, { $set: { active: false } });
    await expect(baselineService.complete(admin, saved.id, itemId, correction)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await UserModel.updateOne({ _id: admin.id }, { $set: { active: true } });
    await expect(UserModel.create({ _id: "second-super", name: "Second", email: "second@example.test", emailNormalized: "second@example.test", passwordHash: "fixture-only", role: "super_admin", active: true })).rejects.toMatchObject({ code: 11000 });
  });
  it("rolls back baseline receipt, provenance, amount and audit on failure", async () => {
    const saved = await vendor();
    const itemId = await historical(saved.id);
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => { await append(...args); throw new Error("Injected baseline failure"); });
    await expect(baselineService.complete(admin, saved.id, itemId, correction)).rejects.toThrow("Injected baseline failure");
    const row = await ProjectProcurementItemModel.findById(itemId).lean();
    expect(row?.version).toBe(1);
    expect(row?.allocatedWorkPaise).toBeUndefined();
    expect(row?.allocationTrackingVersion).toBeUndefined();
    expect(row?.allocationBaselineReceipt).toBeUndefined();
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_allocation_baseline_recorded" })).toBe(0);
  });
});
