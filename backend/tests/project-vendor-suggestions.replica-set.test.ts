import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectVendorSuggestionModel } from "../src/models/ProjectVendorSuggestion.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectVendorSuggestionService } from "../src/services/project-vendor-suggestions.service.js";
import { createProjectProcurementService } from "../src/services/project-procurement.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
const actor: PublicUser = { id: "manager-a", name: "Manager A", email: "a@example.test", role: "admin" };
const other: PublicUser = { id: "manager-b", name: "Manager B", email: "b@example.test", role: "admin" };
const buyer: PublicUser = { id: "buyer", name: "Buyer", email: "buyer@example.test", role: "procurement" };
const superAdmin: PublicUser = { id: "super", name: "Super Admin", email: "super@example.test", role: "super_admin" };
const now = new Date("2026-09-18T10:00:00.000Z");
const audit = createAuditService(createMemoryRepository());
const service = createProjectVendorSuggestionService({ audit, now: () => now });
const items = createProjectProcurementService({ audit, now: () => now });
const query = { q: "", limit: 20, offset: 0 };
const fields = { estimateId: "estimate-project-a", estimateVersion: 1, designPlanVersion: 1, vendorId: "vendor-1", note: "Reliable delivery", idempotencyKey: "request-first" };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-suggestions-tests");
  await Promise.all([UserModel, ProjectModel, ProjectAccessGrantModel, EstimateModel, EstimateClientReviewRoundModel, ProjectWorkflowTaskModel, AiEstimatorKnowledgeVendorModel, ProjectVendorSuggestionModel, AuditEventModel, AuthorizationCoordinationModel, FinanceLedgerEntryModel, ProjectFinanceBucketModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  vi.restoreAllMocks(); await replica.clear();
  await UserModel.create([actor, other, buyer, superAdmin].map((user) => ({ _id: user.id, name: user.name, email: user.email, emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, active: true })));
  await createProject("project-a", buyer.id, 10000);
  await createProject("project-b", buyer.id, 23500);
  await ProjectAccessGrantModel.create([actor, other].map((user, index) => ({ _id: `grant-${user.id}`, projectId: index === 0 ? "project-a" : "project-b", userId: user.id, module: "projects", source: "admin_initiator", grantedById: superAdmin.id, grantedAt: now, active: true })));
  await AiEstimatorKnowledgeVendorModel.create([1, 2].map((index) => ({ _id: `vendor-${index}`, code: `V${index}`, name: `Vendor ${index}`, status: "active", version: 1, displayOrder: index, createdById: superAdmin.id, updatedById: superAdmin.id })));
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

describe("project vendor suggestions", () => {
  it("scopes two managers to their grants while Procurement and Super Admin can read eligible projects", async () => {
    expect((await service.projects(actor, query)).items.map((row) => row.projectId)).toEqual(["project-a"]);
    expect((await service.projects(other, query)).items.map((row) => row.projectId)).toEqual(["project-b"]);
    expect((await service.projects(buyer, query)).total).toBe(2);
    expect((await service.projects(superAdmin, query)).total).toBe(2);
    expect((await service.projects(superAdmin, { ...query, limit: 1, offset: 1 })).items[0]?.projectId).toBe("project-b");
    for (const current of [actor, other]) {
      const wrong = current.id === actor.id ? "project-b" : "project-a";
      await expect(service.list(current, wrong, query)).rejects.toMatchObject({ status: 404 });
      await expect(service.create(current, wrong, fields)).rejects.toMatchObject({ status: 404 });
      await expect(service.update(current, wrong, "missing", { expectedVersion: 1, note: "", status: "withdrawn" })).rejects.toMatchObject({ status: 404 });
    }
  });
  it("persists exact approved identities with honest KPI placeholders and no finance/workflow changes", async () => {
    const estimates = await EstimateModel.find().select({ procurementSourceEpoch: 0 }).sort({ _id: 1 }).lean();
    const rounds = await EstimateClientReviewRoundModel.find().sort({ _id: 1 }).lean();
    const tasks = await ProjectWorkflowTaskModel.find().sort({ _id: 1 }).lean();
    const created = await service.create(actor, "project-a", fields);
    expect(created).toMatchObject({ created: true, suggestion: { projectId: "project-a", estimateId: fields.estimateId, estimateVersion: 1, estimateReviewRoundId: "round-project-a", designPlanVersion: 1, vendor: { id: "vendor-1", code: "V1", name: "Vendor 1", status: "active" }, suggestedBy: { id: actor.id, name: actor.name }, version: 1, kpi: { status: "not_rated", score: null } } });
    const page = await service.list(buyer, "project-a", query);
    expect(page.items).toEqual([created.suggestion]);
    expect(page.performance).toEqual({ status: "not_available", recommendations: [] });
    expect(page.project).toEqual({ projectId: "project-a", projectName: "project-a", estimateId: fields.estimateId, estimateVersion: 1, designPlanVersion: 1 });
    expect(await EstimateModel.find().select({ procurementSourceEpoch: 0 }).sort({ _id: 1 }).lean()).toEqual(estimates);
    expect(await EstimateClientReviewRoundModel.find().sort({ _id: 1 }).lean()).toEqual(rounds);
    expect(await ProjectWorkflowTaskModel.find().sort({ _id: 1 }).lean()).toEqual(tasks);
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "project_vendor_suggestion_created" })).toBe(1);
  });
  it("converges concurrent same-key retries and rejects changed payload or another request for the same vendor", async () => {
    const results = await Promise.all([service.create(actor, "project-a", fields), service.create(actor, "project-a", fields)]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results[0]!.suggestion).toEqual(results[1]!.suggestion);
    await expect(service.create(actor, "project-a", { ...fields, note: "Changed" })).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_IDEMPOTENCY_CONFLICT" });
    await expect(service.create(actor, "project-a", { ...fields, idempotencyKey: "another-key" })).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_DUPLICATE" });
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });
  it("keeps the same vendor separate across unequal projects", async () => {
    await service.create(actor, "project-a", fields);
    const second = await service.create(other, "project-b", { ...fields, estimateId: "estimate-project-b" });
    expect((await service.list(other, "project-b", query)).items).toEqual([second.suggestion]);
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(2);
  });
  it.each([{ estimateId: "estimate-project-b" }, { estimateVersion: 9 }, { designPlanVersion: 9 }])("rejects stale or wrong source %o", async (source) => {
    await expect(service.create(actor, "project-a", { ...fields, ...source })).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_SOURCE_CONFLICT" });
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it("excludes pre-Design projects and current-source queries never expose older Design suggestions", async () => {
    const saved = (await service.create(actor, "project-a", fields)).suggestion;
    await EstimateModel.updateOne({ _id: fields.estimateId }, { $set: { designPlanStatus: "draft" } });
    expect((await service.projects(actor, query)).items).toEqual([]);
    await expect(service.list(actor, "project-a", query)).rejects.toMatchObject({ status: 404 });
    await expect(service.create(actor, "project-a", fields)).rejects.toMatchObject({ status: 404 });
    await EstimateModel.updateOne({ _id: fields.estimateId }, { $set: { designPlanStatus: "approved", designPlanVersion: 2 } });
    await ProjectWorkflowTaskModel.collection.updateOne({ _id: "task-project-a" }, { $set: { designPlanVersion: 2 } });
    expect((await service.list(actor, "project-a", query)).items).toEqual([]);
    await expect(service.update(actor, "project-a", saved.id, { expectedVersion: 1, note: "", status: "withdrawn" })).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_SOURCE_CONFLICT" });
    const current = await service.create(actor, "project-a", { ...fields, designPlanVersion: 2, idempotencyKey: "new-round-request" });
    expect((await service.list(buyer, "project-a", query)).items).toEqual([current.suggestion]);
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(2);
  });
  it("withdraws/reinstates with CAS, retains history and lets a newly assigned manager edit", async () => {
    const saved = (await service.create(actor, "project-a", fields)).suggestion;
    await ProjectAccessGrantModel.collection.insertOne({ _id: "second-manager-a", projectId: "project-a", userId: other.id, module: "projects", source: "admin_initiator", active: true, grantedById: superAdmin.id, grantedAt: now });
    const results = await Promise.allSettled([service.update(actor, "project-a", saved.id, { expectedVersion: 1, note: "Wait", status: "withdrawn" }), service.update(other, "project-a", saved.id, { expectedVersion: 1, note: "Other", status: "withdrawn" })]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(results.find((row) => row.status === "rejected")).toMatchObject({ reason: { code: "VENDOR_SUGGESTION_VERSION_CONFLICT" } });
    expect((await service.list(buyer, "project-a", query)).items[0]?.status).toBe("withdrawn");
    const restored = await service.update(other, "project-a", saved.id, { expectedVersion: 2, note: "Ready", status: "suggested" });
    expect(restored).toMatchObject({ version: 3, status: "suggested", updatedBy: { id: other.id }, suggestedBy: { id: actor.id } });
    expect(await AuditEventModel.countDocuments({ action: "project_vendor_suggestion_updated" })).toBe(2);
  });
  it.each(["inactive", "archived", "unavailable"] as const)("shows current vendor availability %s and disallows reinstating it", async (status) => {
    const saved = (await service.create(actor, "project-a", fields)).suggestion;
    await service.update(actor, "project-a", saved.id, { expectedVersion: 1, note: "Hold", status: "withdrawn" });
    if (status === "unavailable") await AiEstimatorKnowledgeVendorModel.deleteOne({ _id: fields.vendorId });
    else await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: fields.vendorId }, { $set: { status, name: "New name", code: "NEW" } });
    const row = (await service.list(buyer, "project-a", query)).items[0]!;
    expect(row.vendor).toEqual({ id: fields.vendorId, name: status === "unavailable" ? "Vendor 1" : "New name", code: status === "unavailable" ? "V1" : "NEW", status });
    if (status !== "unavailable") expect((await service.list(buyer, "project-a", { ...query, q: "New name" })).items).toEqual([row]);
    await expect(service.update(actor, "project-a", saved.id, { expectedVersion: 2, note: "", status: "suggested" })).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_UNAVAILABLE" });
    await expect(service.create(other, "project-b", { ...fields, estimateId: "estimate-project-b" })).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_UNAVAILABLE" });
    expect(await ProjectVendorSuggestionModel.findById(saved.id).lean()).toMatchObject({ vendorNameSnapshot: "Vendor 1", version: 2 });
  });
  it("permits only three directory-reader roles without granting procurement writes", async () => {
    for (const reader of [actor, buyer, superAdmin]) expect((await items.listVendors(reader, query)).total).toBe(2);
    for (const denied of [actor, superAdmin]) {
      await expect(items.createVendor(denied, { name: "Denied" })).rejects.toMatchObject({ status: 403 });
      await expect(items.listUoms(denied)).rejects.toMatchObject({ status: 403 });
    }
    for (const reader of [buyer, superAdmin]) {
      await expect(service.create(reader, "project-a", fields)).rejects.toMatchObject({ status: 403 });
      await expect(service.update(reader, "project-a", "missing", { expectedVersion: 1, note: "", status: "withdrawn" })).rejects.toMatchObject({ status: 403 });
    }
  });
  it("rolls back suggestion, source/vendor epochs, authorization coordination and audit on failure", async () => {
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => { await append(...args); throw new Error("audit failure"); });
    await expect(service.create(actor, "project-a", fields)).rejects.toThrow("audit failure");
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);
    expect(await EstimateModel.findById(fields.estimateId).lean()).toMatchObject({ procurementSourceEpoch: 0 });
    expect(await AiEstimatorKnowledgeVendorModel.findById(fields.vendorId).lean()).toMatchObject({ dependencyEpoch: 0 });
  });
  it("rejects revoked grants including retries and rechecks the stored actor", async () => {
    const saved = (await service.create(actor, "project-a", fields)).suggestion;
    await ProjectAccessGrantModel.collection.updateOne({ _id: `grant-${actor.id}` }, { $set: { active: false } });
    expect((await service.projects(actor, query)).items).toEqual([]);
    await expect(service.create(actor, "project-a", fields)).rejects.toMatchObject({ status: 404 });
    await expect(service.update(actor, "project-a", saved.id, { expectedVersion: 1, note: "", status: "withdrawn" })).rejects.toMatchObject({ status: 404 });
    await UserModel.updateOne({ _id: actor.id }, { $set: { active: false } });
    await expect(service.projects(actor, query)).rejects.toMatchObject({ status: 401 });
    await expect(items.listVendors(actor, query)).rejects.toMatchObject({ status: 401 });
  });
  it("retries a concurrent source change before its coordination write and aborts the stale submission", async () => {
    const update = EstimateModel.updateOne.bind(EstimateModel);
    vi.spyOn(EstimateModel, "updateOne").mockImplementationOnce((...args) => (async () => { await EstimateModel.collection.updateOne({ _id: fields.estimateId }, { $set: { designPlanStatus: "draft" } }); return update(...args); })() as any);
    await expect(service.create(actor, "project-a", fields)).rejects.toMatchObject({ status: 404 });
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it.each(["grant", "user"])("serializes suggestion creation with %s revocation and rejects every later mutation", async (target) => {
    let arrived!: () => void, release!: () => void;
    const selected = new Promise<void>((resolve) => { arrived = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => { arrived(); await gate; return append(...args); });
    const creation = service.create(actor, "project-a", fields);
    await selected;
    const revocation = mongoose.connection.transaction(async (session) => {
      await AuthorizationCoordinationModel.updateOne({ _id: "authorization" }, { $inc: { revision: 1 } }, { session });
      if (target === "grant") await ProjectAccessGrantModel.collection.updateOne({ _id: `grant-${actor.id}` }, { $set: { active: false, revokedAt: now, revokedById: superAdmin.id, revocationReason: "Reassigned" } }, { session });
      else await UserModel.updateOne({ _id: actor.id }, { $set: { active: false } }, { session });
    });
    release();
    const saved = (await creation).suggestion;
    await revocation;
    await expect(service.update(actor, "project-a", saved.id, { expectedVersion: 1, note: "", status: "withdrawn" })).rejects.toMatchObject({ status: target === "grant" ? 404 : 401 });
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });
  it("rechecks vendor availability when lifecycle changes before its coordination write", async () => {
    const update = AiEstimatorKnowledgeVendorModel.findOneAndUpdate.bind(AiEstimatorKnowledgeVendorModel);
    vi.spyOn(AiEstimatorKnowledgeVendorModel, "findOneAndUpdate").mockImplementationOnce((...args) => ({ lean: async () => {
      await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: fields.vendorId }, { $set: { status: "inactive" } });
      return update(...args).lean();
    } }) as any);
    await expect(service.create(actor, "project-a", fields)).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_UNAVAILABLE" });
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it("rejects stale stored roles and ungranted role lookalikes without leaking projects", async () => {
    await UserModel.updateOne({ _id: actor.id }, { $set: { role: "finance_head" } });
    await expect(service.create(actor, "project-a", fields)).rejects.toMatchObject({ status: 401 });
    await expect(service.projects({ ...actor, role: "finance_head" }, query)).rejects.toMatchObject({ status: 403 });
    await expect(items.listVendors({ ...actor, role: "finance_head" }, query)).rejects.toMatchObject({ status: 403 });
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(0);
  });
  it("paginates only current source suggestions and treats search literally", async () => {
    await service.create(actor, "project-a", { ...fields, note: "Literal [.*]" });
    const next = (await service.create(actor, "project-a", { ...fields, vendorId: "vendor-2", idempotencyKey: "second-request" })).suggestion;
    const page1 = await service.list(actor, "project-a", { ...query, limit: 1 });
    const page2 = await service.list(actor, "project-a", { ...query, limit: 1, offset: 1 });
    expect(page1.total).toBe(2); expect(page2.total).toBe(2);
    expect(new Set([...page1.items, ...page2.items].map((row) => row.id)).size).toBe(2);
    expect((await service.list(actor, "project-a", { ...query, q: ".*" })).total).toBe(1);
    expect((await service.list(actor, "project-b", query).catch(() => null))).toBeNull();
    expect((await service.list(buyer, "project-a", { ...query, q: "Vendor 2" })).items).toEqual([next]);
  });
});
