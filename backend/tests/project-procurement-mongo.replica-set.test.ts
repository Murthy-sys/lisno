import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FINANCE_AMOUNT_PAISE } from "../src/domain/project-finance.js";
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
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectProcurementService } from "../src/services/project-procurement.service.js";
import { procurementItemSourceSnapshot } from "../src/services/procurement.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor: PublicUser = { id: "buyer", name: "Buyer", email: "buyer@example.test", role: "procurement" };
const other: PublicUser = { ...actor, id: "other-buyer", email: "other@example.test" };
const fields = { estimateId: "estimate-project-a", estimateVersion: 1, sourceLineItemKey: "line-first", itemName: "Plywood Sheet", brand: "Timber Brand", uomId: "sheet", vendorId: null, pricePaise: 12345 };
const now = new Date("2026-09-17T10:00:00.000Z");
const audit = createAuditService(createMemoryRepository());
const service = createProjectProcurementService({ audit, now: () => now });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("project-procurement-tests");
  await Promise.all([UserModel, ProjectModel, EstimateModel, EstimateClientReviewRoundModel, ProjectWorkflowTaskModel,
    AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeVendorModel, AiEstimatorKnowledgeDisplayOrderSequenceModel,
    AuditEventModel, ProjectProcurementItemModel, FinanceLedgerEntryModel, ProjectFinanceBucketModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  vi.restoreAllMocks();
  await replica.clear();
  await UserModel.create([actor, other].map((user) => ({ _id: user.id, name: user.name, email: user.email, emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, active: true })));
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

describe("project procurement item Mongo transactions", () => {
  it("uses each unequal project's immutable approved line budgets without financial or workflow writes", async () => {
    const rounds = await EstimateClientReviewRoundModel.find().sort({ _id: 1 }).lean();
    const tasks = await ProjectWorkflowTaskModel.find().sort({ _id: 1 }).lean();
    // The mutable estimate is deliberately asymmetric to prove source lineage.
    await EstimateModel.updateOne({ _id: fields.estimateId }, { $set: { "lineItems.0.amount": 1, "lineItems.0.roomName": "Mutable wrong room" } });
    const first = await mongoose.connection.transaction((session) => procurementItemSourceSnapshot("project-a", session));
    const second = await mongoose.connection.transaction((session) => procurementItemSourceSnapshot("project-b", session));
    expect(first.lineItems.map((line) => [line.key, line.roomName, line.amountPaise])).toEqual([["line-first", "Living Room", 1_000_000], ["line-zero", "Bedroom", 0]]);
    expect(second.lineItems.map((line) => line.amountPaise)).toEqual([2_350_000, 0]);
    await service.create(actor, "project-a", fields);
    await service.create(actor, "project-b", { ...fields, estimateId: "estimate-project-b" });
    expect(await EstimateClientReviewRoundModel.find().sort({ _id: 1 }).lean()).toEqual(rounds);
    expect(await ProjectWorkflowTaskModel.find().sort({ _id: 1 }).lean()).toEqual(tasks);
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(0);
  });
  it("supports a canonical historical approval with no review-round document", async () => {
    await EstimateClientReviewRoundModel.deleteOne({ _id: "round-project-a" });
    const item = await service.create(actor, "project-a", fields);
    expect(item.estimateSource).toMatchObject({ estimateId: fields.estimateId, estimateVersion: 1, estimateReviewRoundId: null, sourceLineItemKey: "line-first" });
  });
  it("links identical materials to distinct selected parents, including a zero-budget line", async () => {
    const first = await service.create(actor, "project-a", fields);
    const zero = await service.create(actor, "project-a", { ...fields, sourceLineItemKey: "line-zero" });
    expect(first.estimateSource).toEqual({ estimateId: fields.estimateId, estimateVersion: 1, estimateReviewRoundId: "round-project-a", sourceSectionId: "CA", sourceLineItemKey: "line-first" });
    expect(zero.estimateSource?.sourceLineItemKey).toBe("line-zero");
    await expect(service.create(other, "project-a", { ...fields, sourceLineItemKey: "line-zero" })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_DUPLICATE" });
    expect((await service.list(actor, "project-a", { q: "", limit: 20, offset: 0, estimateId: fields.estimateId, estimateVersion: 1, sourceLineItemKey: "line-zero" })).items).toEqual([zero]);
  });
  it.each([{ estimateId: "estimate-project-b" }, { estimateVersion: 2 }, { sourceLineItemKey: "line-excluded" }, { sourceLineItemKey: "missing" }])("rejects a noncanonical source without writes %o", async (source) => {
    await expect(service.create(actor, "project-a", { ...fields, ...source })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_SOURCE_CONFLICT" });
    await expect(service.list(actor, "project-a", { q: "", limit: 20, offset: 0, estimateId: fields.estimateId, estimateVersion: 1, sourceLineItemKey: fields.sourceLineItemKey, ...source })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_SOURCE_CONFLICT" });
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await EstimateModel.findById(fields.estimateId).lean()).toMatchObject({ procurementSourceEpoch: 0 });
  });
  it("pages and searches independently per parent beyond the project first page", async () => {
    for (let index = 0; index < 25; index += 1) await service.create(actor, "project-a", { ...fields, itemName: `Material ${String(index).padStart(2, "0")}` });
    const otherParent = await service.create(actor, "project-a", { ...fields, itemName: "Material 24", sourceLineItemKey: "line-zero" });
    const query = { q: "", limit: 20, offset: 20, estimateId: fields.estimateId, estimateVersion: 1, sourceLineItemKey: "line-first" };
    const page = await service.list(actor, "project-a", query);
    expect(page.total).toBe(25); expect(page.items).toHaveLength(5);
    expect(page.items.every((item) => item.estimateSource?.sourceLineItemKey === "line-first")).toBe(true);
    expect((await service.list(actor, "project-a", { ...query, offset: 0, q: "24", sourceLineItemKey: "line-zero" })).items).toEqual([otherParent]);
  });
  it("keeps legacy rows visible and explicitly assigns only once without moving linked rows", async () => {
    const created = await service.create(actor, "project-a", fields);
    await ProjectProcurementItemModel.collection.updateOne({ _id: created.id }, { $unset: { estimateId: "", estimateVersion: "", estimateReviewRoundId: "", sourceSectionId: "", sourceLineItemKey: "" } });
    const query = { q: "", limit: 20, offset: 0, unassigned: true as const };
    expect((await service.list(actor, "project-a", query)).items[0]?.estimateSource).toBeNull();
    const { estimateId: _id, estimateVersion: _version, sourceLineItemKey: _line, ...legacy } = fields;
    const edited = await service.update(actor, "project-a", created.id, { ...legacy, pricePaise: 900, expectedVersion: 1 });
    expect(edited.estimateSource).toBeNull();
    const assigned = await service.update(actor, "project-a", created.id, { ...fields, expectedVersion: 2 });
    expect(assigned.estimateSource?.sourceLineItemKey).toBe("line-first");
    expect((await service.list(actor, "project-a", query)).total).toBe(0);
    await expect(service.update(actor, "project-a", created.id, { ...fields, sourceLineItemKey: "line-zero", expectedVersion: 3 })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_SOURCE_CONFLICT" });
    expect((await service.update(actor, "project-a", created.id, { ...legacy, expectedVersion: 3 })).estimateSource).toEqual(assigned.estimateSource);
  });
  it("retains noncurrent rows for review and blocks mutation without rewriting their lineage", async () => {
    const created = await service.create(actor, "project-a", fields);
    await ProjectProcurementItemModel.collection.updateOne({ _id: created.id }, { $set: { estimateVersion: 99 } });
    expect((await service.list(actor, "project-a", { q: "", limit: 20, offset: 0, unassigned: true })).items[0]?.estimateSource?.estimateVersion).toBe(99);
    const { estimateId: _id, estimateVersion: _version, sourceLineItemKey: _line, ...legacy } = fields;
    await expect(service.update(actor, "project-a", created.id, { ...legacy, expectedVersion: 1 })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_SOURCE_CONFLICT" });
    await ProjectProcurementItemModel.collection.updateOne({ _id: created.id }, { $unset: { sourceSectionId: "" } });
    await expect(service.get(actor, "project-a", created.id)).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_SOURCE_CONFLICT" });
    await expect(service.update(actor, "project-a", created.id, { ...fields, expectedVersion: 1 })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_SOURCE_CONFLICT" });
  });
  it("retries a concurrent source change before the coordination write and refuses the stale create", async () => {
    const update = EstimateModel.updateOne.bind(EstimateModel);
    vi.spyOn(EstimateModel, "updateOne").mockImplementationOnce((...args) => (async () => {
      await EstimateModel.collection.updateOne({ _id: fields.estimateId }, { $set: { designPlanStatus: "draft" } });
      return update(...args);
    })() as any);
    await expect(service.create(actor, "project-a", fields)).rejects.toMatchObject({ status: 404 });
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await EstimateModel.findById(fields.estimateId).lean()).toMatchObject({ procurementSourceEpoch: 0 });
  });
  it("isolates identical products and prices across two unequal projects regardless of task assignment", async () => {
    const estimatesBefore = await EstimateModel.find().sort({ _id: 1 }).lean();
    const first = await service.create(other, "project-a", fields);
    const second = await service.create(actor, "project-b", { ...fields, estimateId: "estimate-project-b", pricePaise: 98765 });
    expect(first.projectId).toBe("project-a");
    expect(second.projectId).toBe("project-b");
    expect((await service.list(actor, "project-a", { q: "", limit: 20, offset: 0 })).items).toEqual([first]);
    expect((await service.list(other, "project-b", { q: "", limit: 20, offset: 0 })).items).toEqual([second]);
    await expect(service.get(actor, "project-a", second.id)).rejects.toMatchObject({ status: 404, code: "PROCUREMENT_ITEM_NOT_FOUND" });
    await expect(service.update(actor, "project-b", first.id, { ...fields, expectedVersion: 1 })).rejects.toMatchObject({ status: 404, code: "PROCUREMENT_ITEM_NOT_FOUND" });
    expect(await service.get(actor, "project-a", first.id)).toEqual(first);
    expect((await EstimateModel.find().sort({ _id: 1 }).lean()).map(({ procurementSourceEpoch: _epoch, ...row }) => row)).toEqual(estimatesBefore.map(({ procurementSourceEpoch: _epoch, ...row }) => row));
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(2);
  });
  it("checks current project approval and task lineage inside every item operation", async () => {
    const item = await service.create(actor, "project-a", fields);
    await EstimateModel.updateOne({ _id: "estimate-project-a" }, { $set: { designPlanStatus: "draft" } });
    for (const attempt of [
      () => service.list(actor, "project-a", { q: "", limit: 20, offset: 0 }),
      () => service.get(actor, "project-a", item.id),
      () => service.create(actor, "project-a", { ...fields, brand: "Other" }),
      () => service.update(actor, "project-a", item.id, { ...fields, expectedVersion: 1 })
    ]) await expect(attempt()).rejects.toMatchObject({ status: 404 });
    await expect(service.create(actor, "missing-project", fields)).rejects.toMatchObject({ status: 404 });
    await ProjectWorkflowTaskModel.collection.updateOne({ _id: "task-project-b" }, { $set: { designPlanVersion: 99 } });
    await expect(service.create(actor, "project-b", { ...fields, estimateId: "estimate-project-b" })).rejects.toMatchObject({ code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT" });
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });
  it("persists normalized project records, exact paise, stable IDs and audit", async () => {
    const created = await service.create(actor, "project-a", { ...fields, itemName: "  Ｐlywood  Sheet ", brand: " Timber\nBrand " });
    expect(created).toMatchObject({ projectId: "project-a", vendor: null, itemName: fields.itemName, brand: fields.brand, pricePaise: fields.pricePaise, id: expect.any(String), version: 1, uom: { id: "sheet", code: "SHT", name: "Sheet", status: "active" }, createdAt: now.toISOString(), updatedAt: now.toISOString() });
    const page = await service.list(other, "project-a", { q: "  ｐＬＹＷＯＯＤ ", limit: 20, offset: 0 });
    expect(page).toEqual({ items: [created], total: 1, limit: 20, offset: 0 });
    expect(await service.get(other, "project-a", created.id)).toEqual(created);
    const event = await AuditEventModel.findOne({ entityId: created.id }).lean();
    expect(event).toMatchObject({ actorId: actor.id, action: "project_procurement_item_created", newValues: { id: created.id, pricePaise: 12345, version: 1 } });
    expect(await AiEstimatorKnowledgeUomModel.findById("sheet").lean()).toMatchObject({ dependencyEpoch: 1 });
  });
  it("enforces the normalized unique combination under concurrent creates and retry", async () => {
    const results = await Promise.allSettled([
      service.create(actor, "project-a", fields),
      service.create(other, "project-a", { ...fields, itemName: " PLYWOOD  SHEET ", brand: "Ｔｉｍｂｅｒ Brand" })
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409, code: "PROCUREMENT_ITEM_DUPLICATE" } });
    await expect(service.create(actor, "project-a", fields)).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_DUPLICATE" });
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeUomModel.findById("sheet").lean()).toMatchObject({ dependencyEpoch: 1 });
  });
  it("accepts bounded Unicode labels whose lowercase identity expands", async () => {
    const item = await service.create(actor, "project-a", { ...fields, itemName: "İ".repeat(200), brand: "İ".repeat(200) });
    expect(item.itemName).toHaveLength(200);
    expect((await service.list(actor, "project-a", { q: "İ", limit: 20, offset: 0 })).items).toEqual([item]);
  });
  it("allows different brand or UOM combinations and literal bounded ordered search", async () => {
    await service.create(actor, "project-a", fields);
    await service.create(actor, "project-a", { ...fields, itemName: "Cable [A.*]", brand: "Electrical", uomId: "meter" });
    await service.create(actor, "project-a", { ...fields, brand: "Other" });
    await service.create(actor, "project-a", { ...fields, uomId: "meter" });
    expect((await service.list(actor, "project-a", { q: ".*", limit: 20, offset: 0 })).items.map((i) => i.itemName)).toEqual(["Cable [A.*]"]);
    expect((await service.list(actor, "project-a", { q: "meter", limit: 20, offset: 0 })).total).toBe(2);
    const first = await service.list(actor, "project-a", { q: "", limit: 2, offset: 0 });
    const second = await service.list(actor, "project-a", { q: "", limit: 2, offset: 2 });
    expect(first.total).toBe(4);
    expect(first.items[0]?.itemName).toBe("Cable [A.*]");
    expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(4);
    expect(await service.listUoms(actor)).toEqual([{ id: "sheet", code: "SHT", name: "Sheet" }, { id: "meter", code: "M", name: "Meter" }]);
  });
  it("uses CAS for competing edits and does not audit the losing write", async () => {
    const item = await service.create(actor, "project-a", fields);
    const results = await Promise.allSettled([
      service.update(actor, "project-a", item.id, { ...fields, pricePaise: 12001, expectedVersion: 1 }),
      service.update(other, "project-a", item.id, { ...fields, pricePaise: 99999, expectedVersion: 1 })
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "PROCUREMENT_ITEM_VERSION_CONFLICT" } });
    const stored = await service.get(actor, "project-a", item.id);
    expect(stored.version).toBe(2);
    expect([12001, 99999]).toContain(stored.pricePaise);
    expect(await AuditEventModel.countDocuments({ action: "project_procurement_item_updated" })).toBe(1);
    const renamed = await service.update(actor, "project-a", item.id, { ...fields, itemName: "Renamed", pricePaise: stored.pricePaise, expectedVersion: 2 });
    expect((await service.list(actor, "project-a", { q: "Plywood", limit: 20, offset: 0 })).total).toBe(0);
    expect(await service.get(actor, "project-a", item.id)).toEqual(renamed);
  });
  it("rolls back item, dependency lock and inserted audit if a transaction fails", async () => {
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => {
      await append(...args);
      throw new Error("Injected audit failure");
    });
    await expect(service.create(actor, "project-a", fields)).rejects.toThrow("Injected audit failure");
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeUomModel.findById("sheet").lean()).toMatchObject({ dependencyEpoch: 0 });
  });
  it.each(["inactive", "archived", "unavailable"] as const)("retains the historical UOM snapshot when %s and rejects selecting it for new items", async (status) => {
    const item = await service.create(actor, "project-a", fields);
    if (status === "unavailable") await AiEstimatorKnowledgeUomModel.deleteOne({ _id: "sheet" });
    else await AiEstimatorKnowledgeUomModel.updateOne({ _id: "sheet" }, { $set: { status, code: "NEW", name: "Renamed master", ...(status === "archived" ? { archivedAt: now, archivedById: actor.id } : {}) } });
    const updated = await service.update(actor, "project-a", item.id, { ...fields, pricePaise: 10001, expectedVersion: 1 });
    expect(updated.uom).toEqual({ id: "sheet", code: "SHT", name: "Sheet", status });
    await expect(service.create(actor, "project-a", { ...fields, itemName: "New" })).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { uomId: expect.any(String) } });
    const changed = await service.update(actor, "project-a", item.id, { ...fields, uomId: "meter", expectedVersion: 2 });
    expect(changed.uom).toEqual({ id: "meter", code: "M", name: "Meter", status: "active" });
    await expect(service.update(actor, "project-a", item.id, { ...fields, expectedVersion: 3 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("makes UOM lifecycle writes serialize with selection, while allowing later archive", async () => {
    let selected!: () => void;
    let release!: () => void;
    const selection = new Promise<void>((resolve) => { selected = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => { selected(); await gate; return append(...args); });
    const creation = service.create(actor, "project-a", fields);
    await selection;
    // The lifecycle transaction writes the same UOM and cannot commit before selection.
    const archive = mongoose.connection.transaction(async (session) => {
      return AiEstimatorKnowledgeUomModel.findOneAndUpdate({ _id: "sheet", status: "active" }, {
        $set: { status: "archived", archivedAt: now, archivedById: actor.id }, $inc: { version: 1 }
      }, { session, returnDocument: "after" }).lean();
    });
    release();
    const created = await creation;
    await archive;
    expect((await service.get(actor, "project-a", created.id)).uom.status).toBe("archived");
    await expect(service.create(actor, "project-a", { ...fields, itemName: "After archive" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("rejects duplicate edits and invalid paise without modifying item or audit", async () => {
    const first = await service.create(actor, "project-a", fields);
    const second = await service.create(actor, "project-a", { ...fields, brand: "Different" });
    await expect(service.update(actor, "project-a", second.id, { ...fields, expectedVersion: 1 })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_DUPLICATE" });
    for (const pricePaise of [0, -1, 1.5, MAX_FINANCE_AMOUNT_PAISE + 1]) await expect(service.update(actor, "project-a", first.id, { ...fields, pricePaise, expectedVersion: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await service.get(actor, "project-a", first.id)).toEqual(first);
    expect(await service.get(actor, "project-a", second.id)).toEqual(second);
    expect(await AuditEventModel.countDocuments()).toBe(2);
    expect((await service.update(actor, "project-a", first.id, { ...fields, pricePaise: MAX_FINANCE_AMOUNT_PAISE, expectedVersion: 1 })).pricePaise).toBe(MAX_FINANCE_AMOUNT_PAISE);
  });
  it.each([{ active: false }, { role: "finance_head" }])("rejects revoked stored identities for every operation %o", async (change) => {
    const item = await service.create(actor, "project-a", fields);
    await UserModel.updateOne({ _id: actor.id }, { $set: change });
    const attempts = [() => service.list(actor, "project-a", { q: "", limit: 20, offset: 0 }), () => service.get(actor, "project-a", item.id), () => service.listUoms(actor), () => service.create(actor, "project-a", { ...fields, brand: "New" }), () => service.update(actor, "project-a", item.id, { ...fields, expectedVersion: 1 }), () => service.listVendors(actor, { q: "", limit: 20, offset: 0 }), () => service.createVendor(actor, { name: "Denied Vendor" })];
    for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });
  it("denies non-procurement stored actors and reports missing items", async () => {
    await UserModel.updateOne({ _id: other.id }, { $set: { role: "finance_head" } });
    await expect(service.list({ ...other, role: "finance_head" }, "project-a", { q: "", limit: 20, offset: 0 })).rejects.toMatchObject({ status: 403 });
    await expect(service.get(actor, "project-a", "missing")).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_NOT_FOUND" });
    await expect(service.update(actor, "project-a", "missing", { ...fields, expectedVersion: 1 })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_NOT_FOUND" });
  });
});

describe("saved Configuration vendors for project procurement", () => {
  it("creates a shared master independently of item drafts and reuses it across projects", async () => {
    const created = await service.createVendor(actor, { name: "  Ｗood\nSupply " });
    expect(created).toMatchObject({ created: true, vendor: { name: "Wood Supply", status: "active", code: expect.stringMatching(/^PV-/) } });
    const reused = await service.createVendor(other, { name: "wood   supply" });
    expect(reused).toEqual({ ...created, created: false });
    expect(await ProjectProcurementItemModel.countDocuments()).toBe(0);
    const first = await service.create(actor, "project-a", { ...fields, vendorId: created.vendor.id });
    const second = await service.create(other, "project-b", { ...fields, estimateId: "estimate-project-b", vendorId: created.vendor.id, pricePaise: 30001 });
    expect(first.vendor).toEqual(created.vendor);
    expect(second.vendor).toEqual(created.vendor);
    expect((await service.listVendors(other, { q: "SUPPLY", limit: 20, offset: 0 })).items).toEqual([created.vendor]);
    expect((await service.list(actor, "project-a", { q: "supply", limit: 20, offset: 0 })).items).toEqual([first]);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_master_created" })).toBe(1);
  });
  it("converges concurrent normalized vendor creates to one identity, order and audit", async () => {
    const results = await Promise.all([
      service.createVendor(actor, { name: "  Ｓhared Supply " }),
      service.createVendor(other, { name: "shared\nSUPPLY" }),
      service.createVendor(actor, { name: "Shared Supply" })
    ]);
    expect(new Set(results.map((result) => result.vendor.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeDisplayOrderSequenceModel.findById("masters:vendors").lean()).toMatchObject({ highWaterOrder: 0 });
  });
  it("appends after every master status and serializes order with Configuration creation", async () => {
    await AiEstimatorKnowledgeVendorModel.create({ _id: "archived-vendor", code: "OLD", name: "Archived", status: "archived", displayOrder: 50, version: 1, createdById: actor.id, updatedById: actor.id, archivedAt: now, archivedById: actor.id });
    const admin: PublicUser = { id: "admin", name: "Admin", email: "admin@example.test", role: "super_admin" };
    await UserModel.create({ _id: admin.id, name: admin.name, email: admin.email, emailNormalized: admin.email, passwordHash: "fixture-only", role: admin.role, active: true });
    const configuration = createAiEstimatorKnowledgeReferenceService({ audit, now: () => now });
    const [procurement, configured] = await Promise.all([
      service.createVendor(actor, { name: "Procurement Vendor" }),
      configuration.createMaster(admin, "vendors", { code: "CONF", name: "Configuration Vendor" })
    ]);
    expect(procurement.vendor.id).not.toBe(configured.id);
    const rows = await AiEstimatorKnowledgeVendorModel.find({ status: "active" }).sort({ displayOrder: 1 }).lean();
    expect(rows.map((row) => row.displayOrder)).toEqual([51, 52]);
    expect(await AiEstimatorKnowledgeDisplayOrderSequenceModel.findById("masters:vendors").lean()).toMatchObject({ highWaterOrder: 52 });
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_master_created" })).toBe(2);
  });
  it("rejects inactive duplicate names and does not silently reactivate them", async () => {
    const created = await service.createVendor(actor, { name: "Dormant Vendor" });
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: created.vendor.id }, { $set: { status: "inactive" } });
    await expect(service.createVendor(other, { name: " DORMANT  vendor " })).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_INACTIVE", status: 409 });
    expect((await service.listVendors(actor, { q: "Dormant", limit: 20, offset: 0 })).total).toBe(0);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });
  it("rolls back vendor, order allocation and audit together", async () => {
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => { await append(...args); throw new Error("Injected vendor audit failure"); });
    await expect(service.createVendor(actor, { name: "Failed Vendor" })).rejects.toThrow("Injected vendor audit failure");
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeDisplayOrderSequenceModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it("supports vendor search beyond the first page with literal matching", async () => {
    await AiEstimatorKnowledgeVendorModel.create(Array.from({ length: 25 }, (_, i) => ({
      _id: `vendor-${i}`, code: `V${i}`, name: `Vendor ${String(i).padStart(2, "0")}${i === 24 ? " [.*]" : ""}`,
      status: "active", displayOrder: i, version: 1, createdById: actor.id, updatedById: actor.id
    })));
    const first = await service.listVendors(actor, { q: "", limit: 20, offset: 0 });
    const second = await service.listVendors(other, { q: "", limit: 20, offset: 20 });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(25);
    expect(first.total).toBe(25);
    expect((await service.listVendors(actor, { q: ".*", limit: 20, offset: 0 })).items.map((row) => row.id)).toEqual(["vendor-24"]);
  });
  it("scopes duplicate products by nullable vendor identity and allows clearing the vendor", async () => {
    const firstVendor = (await service.createVendor(actor, { name: "One" })).vendor;
    const secondVendor = (await service.createVendor(actor, { name: "Two" })).vendor;
    const unassigned = await service.create(actor, "project-a", fields);
    const first = await service.create(actor, "project-a", { ...fields, vendorId: firstVendor.id });
    const second = await service.create(actor, "project-a", { ...fields, vendorId: secondVendor.id });
    await expect(service.create(other, "project-a", { ...fields, vendorId: firstVendor.id })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_DUPLICATE" });
    await expect(service.update(other, "project-a", second.id, { ...fields, vendorId: firstVendor.id, expectedVersion: 1 })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_DUPLICATE" });
    const cleared = await service.update(actor, "project-a", first.id, { ...fields, itemName: "Different", expectedVersion: 1 });
    expect(cleared.vendor).toBeNull();
    expect(await service.get(actor, "project-a", unassigned.id)).toEqual(unassigned);
  });
  it.each(["inactive", "archived", "unavailable"] as const)("keeps a vendor snapshot after it becomes %s, while rejecting new selections", async (status) => {
    const saved = (await service.createVendor(actor, { name: "Historical Vendor" })).vendor;
    const item = await service.create(actor, "project-a", { ...fields, vendorId: saved.id });
    if (status === "unavailable") await AiEstimatorKnowledgeVendorModel.deleteOne({ _id: saved.id });
    else await AiEstimatorKnowledgeVendorModel.updateOne({ _id: saved.id }, { $set: { status, name: "Renamed Vendor", code: "RENAMED", ...(status === "archived" ? { archivedAt: now, archivedById: actor.id } : {}) } });
    const updated = await service.update(actor, "project-a", item.id, { ...fields, vendorId: saved.id, pricePaise: 56001, expectedVersion: 1 });
    expect(updated.vendor).toEqual({ ...saved, status });
    await expect(service.create(actor, "project-b", { ...fields, estimateId: "estimate-project-b", vendorId: saved.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { vendorId: expect.any(String) } });
    const cleared = await service.update(actor, "project-a", item.id, { ...fields, expectedVersion: 2 });
    expect(cleared.vendor).toBeNull();
  });
  it("serializes vendor selection with lifecycle writes without blocking later archival", async () => {
    const saved = (await service.createVendor(actor, { name: "Lifecycle Vendor" })).vendor;
    let selected!: () => void;
    let release!: () => void;
    const selection = new Promise<void>((resolve) => { selected = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => { selected(); await gate; return append(...args); });
    const creation = service.create(actor, "project-a", { ...fields, vendorId: saved.id });
    await selection;
    const archive = mongoose.connection.transaction(async (session) => AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: saved.id, status: "active" }, {
      $set: { status: "archived", archivedAt: now, archivedById: actor.id }, $inc: { version: 1 }
    }, { session, returnDocument: "after" }).lean());
    release();
    const created = await creation;
    await archive;
    expect((await service.get(actor, "project-a", created.id)).vendor).toEqual({ ...saved, status: "archived" });
    expect(await AiEstimatorKnowledgeVendorModel.findById(saved.id).lean()).toMatchObject({ dependencyEpoch: 1 });
    await expect(service.create(actor, "project-b", { ...fields, estimateId: "estimate-project-b", vendorId: saved.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
