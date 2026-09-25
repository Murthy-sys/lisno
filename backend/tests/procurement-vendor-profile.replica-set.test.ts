import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { ProcurementVendorSaveCommandModel } from "../src/models/ProcurementVendorSaveCommand.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { legacyVendorProfileFixture, vendorBankAccountFixture, vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";
import { vendorSaveCommand } from "../src/services/procurement-vendor-save-command.js";

const actor = { id: "vendor-test-admin", role: "super_admin" as const, name: "Synthetic Admin", email: "admin@example.invalid" };
const actorGuard = { requireReadActor: async () => actor, requireMutationActor: async () => actor };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const audit = createAuditService(createMemoryRepository());
const reference = createAiEstimatorKnowledgeReferenceService({ actorGuard, audit });
beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-vendor-profile");
  await Promise.all([AuditEventModel, AiEstimatorKnowledgeVendorModel, AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeDisplayOrderSequenceModel, ProcurementVendorSaveCommandModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica.stop(); });
async function fixture() {
  const parent = await reference.createBasket(actor, { name: "Synthetic electrical" });
  const child = await reference.createSubBasket(actor, parent.id, { name: "Synthetic lighting" });
  const profile = { ...vendorProfileFixture(), mainBasketId: parent.id, subBasketId: child.id };
  return { parent, child, profile };
}

describe("vendor profile shared persistence", () => {
  it("requires organization on new profiles but permits legacy profile completion and old committed replays", async () => {
    const { profile } = await fixture();
    const { organizationType: _organizationType, bankAccount: _bankAccount, ...legacyProfile } = profile;
    const oldInput = { name: "Legacy committed vendor", procurementProfile: legacyProfile, idempotencyKey: "legacy-committed-create" };
    for (const procurementProfile of [legacyProfile, { ...legacyProfile, organizationType: null }]) {
      await expect(reference.createMaster(actor, "vendors", { ...oldInput, procurementProfile })).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { "procurementProfile.organizationType": expect.any(String) } });
    }
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(0);
    expect(await ProcurementVendorSaveCommandModel.countDocuments()).toBe(0);
    const legacy = await reference.createMaster(actor, "vendors", { name: oldInput.name });
    await reference.updateMaster(actor, "vendors", legacy.id, { expectedVersion: 1, procurementProfile: legacyProfile });
    expect(await reference.getVendorDetail(actor, legacy.id)).toMatchObject({ procurementProfile: { organizationType: null, bankAccount: null }, procurementSummary: { profileComplete: true } });
    const command = vendorSaveCommand(actor.id, null, oldInput)!;
    await ProcurementVendorSaveCommandModel.create({ _id: command.id, fingerprint: command.fingerprint, result: legacy });
    const auditCount = await AuditEventModel.countDocuments();
    expect(await reference.createMaster(actor, "vendors", oldInput)).toEqual(legacy);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(auditCount);
  });
  it("roundtrips private banking details, preserves omitted fields, and explicitly clears them", async () => {
    const { profile } = await fixture();
    const bankAccount = vendorBankAccountFixture();
    const input = { name: "Private banking vendor", procurementProfile: { ...profile, bankAccount: { ...bankAccount, ifscCode: " synb0123456 ", accountNumber: ` ${bankAccount.accountNumber} ` } }, idempotencyKey: "create-private-bank" };
    const created = await reference.createMaster(actor, "vendors", input);
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toMatchObject({ organizationType: "company", bankAccount });
    const persisted = await AiEstimatorKnowledgeVendorModel.findById(created.id).lean();
    expect(persisted?.procurementProfile.bankAccount).toEqual(bankAccount);
    const { organizationType: _organizationType, bankAccount: _bankAccount, ...olderClient } = profile;
    const updated = await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: { ...olderClient, position: "Director" }, idempotencyKey: "preserve-private-bank" });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toMatchObject({ organizationType: "company", bankAccount, position: "Director" });
    const page = await reference.listMasters(actor, "vendors", {}, { limit: 20, offset: 0 });
    const publicPayloads = JSON.stringify([created, updated, page, await AuditEventModel.find().lean(), await ProcurementVendorSaveCommandModel.find().lean()]);
    for (const value of Object.values(bankAccount)) if (value) expect(publicPayloads).not.toContain(value);
    expect(created).not.toHaveProperty("procurementProfile");
    expect(page.items[0]?.procurementSummary).toMatchObject({ profileComplete: true });
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 2, procurementProfile: { ...olderClient, organizationType: null, bankAccount: null } });
    expect(await reference.getVendorDetail(actor, created.id)).toMatchObject({ procurementProfile: { organizationType: null, bankAccount: null }, procurementSummary: { profileComplete: true } });
  });
  it("normalizes legacy missing additions without dropping identity, verification or bank data on older edits", async () => {
    const { profile } = await fixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Stored legacy banking fields", procurementProfile: { ...profile, currentAddressVerifiedPhysically: true } });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: created.id }, { $unset: { "procurementProfile.organizationType": "", "procurementProfile.bankAccount": "" } });
    const detail = await reference.getVendorDetail(actor, created.id);
    expect(detail).toMatchObject({ procurementProfile: { organizationType: null, bankAccount: null, email: profile.email, physicalAddressVerifiedById: actor.id, currentAddressVerifiedPhysically: true }, procurementSummary: { profileComplete: true } });
    const { organizationType: _organizationType, bankAccount: _bankAccount, ...legacyProfile } = profile;
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: { ...legacyProfile, currentAddressVerifiedPhysically: true } });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toMatchObject({ organizationType: null, bankAccount: null, physicalAddressVerifiedAt: detail.procurementProfile?.physicalAddressVerifiedAt });
  });
  it("audits normalized bank changes by field name only and rejects invalid writes without mutation", async () => {
    const { profile } = await fixture();
    const bankAccount = vendorBankAccountFixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Bank change audit", procurementProfile: { ...profile, bankAccount } });
    const changedFields = async (version: number) => (await AuditEventModel.findOne({ entityId: created.id, action: "ai_estimator_knowledge_master_updated", "newValues.version": version }).lean())?.newValues.changedProfileFields;
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: { ...profile, bankAccount: { ...bankAccount, ifscCode: " synb0123456 " } } });
    expect(await changedFields(2)).toEqual([]);
    const changedBank = { ...bankAccount, accountNumber: "0098765432101234" };
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 2, procurementProfile: { ...profile, organizationType: "firm", bankAccount: changedBank } });
    expect(await changedFields(3)).toEqual(["organizationType", "bankAccount"]);
    const before = await reference.getVendorDetail(actor, created.id);
    const auditCount = await AuditEventModel.countDocuments();
    for (const change of [{ organizationType: "invalid" }, { bankAccount: { ...bankAccount, accountNumber: 123456 } }, { bankAccount: { ...bankAccount, ifscCode: "invalid" } }, { bankAccount: { ...bankAccount, unknownField: "private-value" } }]) {
      await expect(reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 3, procurementProfile: { ...profile, ...change } as typeof profile })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(await reference.getVendorDetail(actor, created.id)).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(auditCount);
    const events = JSON.stringify(await AuditEventModel.find({ entityId: created.id }).lean());
    for (const value of [...Object.values(bankAccount), changedBank.accountNumber]) if (value) expect(events).not.toContain(value);
  });
  it("replays equivalent bank saves, rejects changed contents and preserves optimistic concurrency", async () => {
    const { profile } = await fixture();
    const bankAccount = vendorBankAccountFixture();
    const input = { name: "Bank replay vendor", procurementProfile: { ...profile, bankAccount }, idempotencyKey: "bank-replay-create" };
    const created = await reference.createMaster(actor, "vendors", input);
    expect(await reference.createMaster(actor, "vendors", { ...input, procurementProfile: { ...profile, bankAccount: { ...bankAccount, ifscCode: " synb0123456 ", accountNumber: ` ${bankAccount.accountNumber} ` } } })).toEqual(created);
    await expect(reference.createMaster(actor, "vendors", { ...input, procurementProfile: { ...profile, organizationType: "individual", bankAccount } })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const update = { expectedVersion: 1, procurementProfile: { ...profile, bankAccount }, idempotencyKey: "bank-replay-update" };
    const updated = await reference.updateMaster(actor, "vendors", created.id, update);
    expect(await reference.updateMaster(actor, "vendors", created.id, { ...update, procurementProfile: { ...profile, bankAccount: { ...bankAccount, bankName: ` ${bankAccount.bankName} ` } } })).toEqual(updated);
    await expect(reference.updateMaster(actor, "vendors", created.id, { ...update, procurementProfile: { ...profile, bankAccount: null } })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(reference.updateMaster(actor, "vendors", created.id, { ...update, idempotencyKey: "bank-stale-update", procurementProfile: { ...profile, bankAccount: null } })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await reference.getVendorDetail(actor, created.id)).toMatchObject({ version: 2, procurementProfile: { bankAccount } });
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments({ entityId: created.id })).toBe(2);
  });
  it("returns global directory counts independently of filters and pages, then refreshes after verification and archive", async () => {
    const { profile, parent, child } = await fixture();
    const verified = { ...profile, currentAddressVerifiedPhysically: true };
    const supplier = { ...profile, vendorType: "supplier" as const, executionType: null, supplier: false };
    await reference.createMaster(actor, "vendors", { name: "Verified execution", procurementProfile: verified });
    const both = await reference.createMaster(actor, "vendors", { name: "Both execution", procurementProfile: { ...profile, executionType: ["labor", "material_labour"] } });
    await reference.createMaster(actor, "vendors", { name: "Verified supplier", status: "inactive", procurementProfile: { ...supplier, currentAddressVerifiedPhysically: true } });
    await reference.createMaster(actor, "vendors", { name: "Pending supplier", procurementProfile: supplier });
    const legacy = await reference.createMaster(actor, "vendors", { name: "Legacy missing profile" });
    const missingFlag = await reference.createMaster(actor, "vendors", { name: "Legacy missing verification", status: "inactive", procurementProfile: profile });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: missingFlag.id }, { $unset: { "procurementProfile.currentAddressVerifiedPhysically": "" } });
    const archived = await reference.createMaster(actor, "vendors", { name: "Archived pending vendor", procurementProfile: profile });
    await reference.archiveMaster(actor, "vendors", archived.id, { expectedVersion: 1, reason: "Synthetic directory fixture" });
    await reference.createMaster(actor, "vendors", { name: "Other verified execution", status: "inactive", procurementProfile: verified });

    const expectedOverview = { totalVendors: 7, activeVendors: 4, underReviewVendors: 4 };
    const firstPage = await reference.listMasters(actor, "vendors", { includeDirectoryOverview: true }, { limit: 5, offset: 0 });
    expect(firstPage).toMatchObject({ total: 7, directoryOverview: expectedOverview });
    expect(firstPage.items).toHaveLength(5);
    expect(firstPage.items.find(row => row.id === both.id)?.procurementSummary?.executionType).toEqual(["labor", "material_labour"]);
    expect(firstPage.items.find(row => row.id === legacy.id)?.procurementSummary).toMatchObject({ profileComplete: false, executionType: null });
    expect(firstPage.items.find(row => row.procurementSummary?.vendorType === "supplier")?.procurementSummary?.executionType).toBeNull();
    for (const item of firstPage.items) {
      expect(Object.keys(item.procurementSummary!).sort()).toEqual(["vendorType", "executionType", "profileComplete", "currentAddressVerifiedPhysically", "mainBasket", "subBasket"].sort());
      expect(item).not.toHaveProperty("procurementProfile");
      expect(item).not.toHaveProperty("geoTaggedPicture");
    }
    for (const privateValue of [profile.aadhar, profile.pan, profile.email, profile.phoneNumber, profile.address]) expect(JSON.stringify(firstPage)).not.toContain(privateValue);

    for (const [filters, pagination, filteredTotal] of [
      [{}, { limit: 5, offset: 5 }, 7],
      [{ search: "Both execution", status: "active", vendorType: "execution", mainBasketId: parent.id, subBasketId: child.id }, { limit: 1, offset: 0 }, 1],
      [{ status: "archived" }, { limit: 5, offset: 0 }, 1],
      [{ status: "inactive", vendorType: "supplier" }, { limit: 5, offset: 0 }, 1],
      [{ mainBasketId: "missing-basket", subBasketId: "missing-child" }, { limit: 5, offset: 0 }, 0]
    ] as const) {
      expect(await reference.listMasters(actor, "vendors", { ...filters, includeDirectoryOverview: true }, pagination)).toMatchObject({ total: filteredTotal, directoryOverview: expectedOverview });
    }
    await reference.updateMaster(actor, "vendors", both.id, { expectedVersion: 1, procurementProfile: { ...verified, executionType: ["labor", "material_labour"] } });
    expect((await reference.listMasters(actor, "vendors", { includeDirectoryOverview: true }, { limit: 1, offset: 0 })).directoryOverview).toEqual({ ...expectedOverview, underReviewVendors: 3 });
    await reference.archiveMaster(actor, "vendors", legacy.id, { expectedVersion: 1, reason: "Retired synthetic directory record" });
    expect((await reference.listMasters(actor, "vendors", { includeDirectoryOverview: true }, { limit: 1, offset: 0 })).directoryOverview).toEqual({ totalVendors: 6, activeVendors: 3, underReviewVendors: 2 });
    expect(await reference.listMasters(actor, "vendors", {}, { limit: 5, offset: 0 })).not.toHaveProperty("directoryOverview");
    expect(await reference.listMasters(actor, "vendors", { includeDirectoryOverview: false }, { limit: 5, offset: 0 })).not.toHaveProperty("directoryOverview");
  });
  it("returns truthful zero overview counts for an empty directory", async () => {
    expect(await reference.listMasters(actor, "vendors", { includeDirectoryOverview: true }, { limit: 1, offset: 0 })).toEqual({ items: [], total: 0, directoryOverview: { totalVendors: 0, activeVendors: 0, underReviewVendors: 0 } });
  });
  it("preserves stored verification for incomplete profiles without leaking private fields or contradicting overview counts", async () => {
    const { profile } = await fixture();
    const verified = await reference.createMaster(actor, "vendors", { name: "Partial verified profile", procurementProfile: { ...profile, currentAddressVerifiedPhysically: true } });
    const unverified = await reference.createMaster(actor, "vendors", { name: "Partial pending profile", procurementProfile: profile });
    const missing = await reference.createMaster(actor, "vendors", { name: "Missing verification profile", procurementProfile: profile });
    await AiEstimatorKnowledgeVendorModel.collection.updateMany({ _id: { $in: [verified.id, unverified.id, missing.id] } }, { $unset: { "procurementProfile.email": "" } });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: missing.id }, { $unset: { "procurementProfile.currentAddressVerifiedPhysically": "" } });
    const page = await reference.listMasters(actor, "vendors", { includeDirectoryOverview: true }, { limit: 5, offset: 0 });
    expect(page.directoryOverview).toEqual({ totalVendors: 3, activeVendors: 3, underReviewVendors: 2 });
    for (const [id, verification] of [[verified.id, true], [unverified.id, false], [missing.id, null]] as const) {
      const item = page.items.find(row => row.id === id)!;
      expect(item.procurementSummary).toEqual({ vendorType: null, executionType: null, profileComplete: false, currentAddressVerifiedPhysically: verification, mainBasket: null, subBasket: null });
      expect(item).not.toHaveProperty("procurementProfile");
      expect((await reference.getVendorDetail(actor, id)).procurementProfile).toBeNull();
    }
    for (const privateValue of [profile.aadhar, profile.pan, profile.phoneNumber, profile.address, "physicalAddressVerifiedById", "physicalAddressVerifiedAt"]) expect(JSON.stringify(page)).not.toContain(privateValue);
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: missing.id }, { $set: { "procurementProfile.currentAddressVerifiedPhysically": "true" } });
    expect((await reference.getVendorDetail(actor, missing.id)).procurementSummary.currentAddressVerifiedPhysically).toBeNull();
  });
  it("audits execution selection changes by value without exposing private profile values", async () => {
    const { profile } = await fixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Selection audit vendor", procurementProfile: { ...profile, executionType: ["labor", "material_labour"] } });
    const changedFields = async (version: number) => (await AuditEventModel.findOne({ entityId: created.id, action: "ai_estimator_knowledge_master_updated", "newValues.version": version }).lean())?.newValues.changedProfileFields;
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: created.id }, { $set: { "procurementProfile.executionType": ["material_labour", "labor"] } });
    const updatedProfile = { ...profile, position: "Director" };
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: { ...updatedProfile, executionType: ["material_labour", "labor"] } });
    expect(await changedFields(2)).toEqual(["position"]);
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 2, procurementProfile: { ...updatedProfile, executionType: ["material_labour"] } });
    expect(await changedFields(3)).toEqual(["executionType"]);
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: created.id }, { $set: { "procurementProfile.executionType": "material_labour" } });
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 3, procurementProfile: { ...updatedProfile, executionType: ["material_labour"] } });
    expect(await changedFields(4)).toEqual([]);
    const events = JSON.stringify(await AuditEventModel.find({ entityId: created.id }).lean());
    for (const privateValue of [profile.aadhar, profile.email, profile.phoneNumber, "material_labour"]) expect(events).not.toContain(privateValue);
  });
  it("persists both selections canonically, reduces to one, and supports Supplier transitions with CAS", async () => {
    const { profile } = await fixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Both execution selections", procurementProfile: { ...profile, executionType: ["material_labour", "labor"] } });
    expect((await AiEstimatorKnowledgeVendorModel.collection.findOne({ _id: created.id }))?.procurementProfile.executionType).toEqual(["labor", "material_labour"]);
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile?.executionType).toEqual(["labor", "material_labour"]);
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: { ...profile, executionType: ["material_labour"] } });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile?.executionType).toEqual(["material_labour"]);
    await expect(reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: profile })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 2, procurementProfile: { ...profile, vendorType: "supplier", executionType: null, supplier: false } });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toMatchObject({ vendorType: "supplier", executionType: null, supplier: true });
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 3, procurementProfile: { ...profile, executionType: ["labor", "material_labour"] } });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toMatchObject({ vendorType: "execution", executionType: ["labor", "material_labour"], supplier: null });
  });
  it("normalizes legacy scalar input and raw stored scalars without rewriting lifecycle-only edits", async () => {
    const { profile, parent, child } = await fixture();
    const legacyProfile = { ...legacyVendorProfileFixture(), mainBasketId: parent.id, subBasketId: child.id, currentAddressVerifiedPhysically: true };
    const created = await reference.createMaster(actor, "vendors", { name: "Scalar execution vendor", procurementProfile: legacyProfile });
    const original = (await reference.getVendorDetail(actor, created.id)).procurementProfile!;
    expect(original.executionType).toEqual(["labor"]);
    // Native collection write deliberately bypasses Mongoose's scalar-to-array cast.
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: created.id }, { $set: { "procurementProfile.executionType": "labor" } });
    expect((await AiEstimatorKnowledgeVendorModel.findById(created.id).lean())?.procurementProfile.executionType).toBe("labor");
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toEqual(original);
    const page = await reference.listMasters(actor, "vendors", { vendorType: "execution" }, { limit: 20, offset: 0 });
    expect(page.items[0]).toMatchObject({ procurementSummary: { executionType: ["labor"], profileComplete: true, currentAddressVerifiedPhysically: true, mainBasket: { id: parent.id }, subBasket: { id: child.id } } });
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, status: "inactive", description: "Preserved profile" });
    expect((await AiEstimatorKnowledgeVendorModel.collection.findOne({ _id: created.id }))?.procurementProfile.executionType).toBe("labor");
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toEqual(original);
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 2, procurementProfile: { ...profile, executionType: ["labor", "material_labour"], currentAddressVerifiedPhysically: true } });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toEqual({ ...original, executionType: ["labor", "material_labour"] });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: created.id }, { $set: { "procurementProfile.executionType": "material_labour" } });
    await reference.archiveMaster(actor, "vendors", created.id, { expectedVersion: 3, reason: "Retired synthetic vendor" });
    expect((await AiEstimatorKnowledgeVendorModel.collection.findOne({ _id: created.id }))?.procurementProfile.executionType).toBe("material_labour");
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toEqual({ ...original, executionType: ["material_labour"] });
  });
  it("persists complete data with generated code and private detail but safe lists/audits", async () => {
    const { profile, parent, child } = await fixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Synthetic vendor", procurementProfile: profile });
    expect(created.code).toMatch(/^PV-/u);
    expect(created).not.toHaveProperty("procurementProfile");
    const detail = await reference.getVendorDetail(actor, created.id);
    expect(detail.procurementProfile).toEqual({ ...profile, physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null });
    expect(detail.procurementSummary).toMatchObject({ profileComplete: true, vendorType: "execution", mainBasket: { id: parent.id, name: parent.name, status: "active" }, subBasket: { id: child.id, name: child.name } });
    const page = await reference.listMasters(actor, "vendors", { vendorType: "execution", mainBasketId: parent.id, subBasketId: child.id }, { limit: 20, offset: 0 });
    expect(page.total).toBe(1);
    expect(JSON.stringify(page)).not.toContain(profile.aadhar);
    expect(page.items[0]).not.toHaveProperty("procurementProfile");
    expect((await reference.listMasters(actor, "vendors", { vendorType: "supplier" }, { limit: 20, offset: 0 })).total).toBe(0);
    expect(JSON.stringify(await AuditEventModel.find().lean())).not.toContain(profile.aadhar);
    expect(JSON.stringify(await AuditEventModel.find().lean())).not.toContain(profile.email);
    await expect(reference.createMaster(actor, "vendors", { name: " Synthetic  VENDOR ", procurementProfile: profile })).rejects.toMatchObject({ code: "DUPLICATE_IDENTITY" });
  });
  it("loads legacy records and preserves a profile on omitted legacy edits", async () => {
    const legacy = await reference.createMaster(actor, "vendors", { code: "OLD", name: "Legacy" });
    expect(await reference.getVendorDetail(actor, legacy.id)).toMatchObject({ procurementProfile: null, procurementSummary: { profileComplete: false, currentAddressVerifiedPhysically: null } });
    const { profile } = await fixture();
    await reference.updateMaster(actor, "vendors", legacy.id, { expectedVersion: 1, procurementProfile: profile });
    await reference.updateMaster(actor, "vendors", legacy.id, { expectedVersion: 2, description: "Legacy metadata edit", status: "inactive" });
    expect((await reference.getVendorDetail(actor, legacy.id)).procurementProfile).toMatchObject(profile);
    await expect(reference.updateMaster(actor, "vendors", legacy.id, { expectedVersion: 1, procurementProfile: profile })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("preserves removed Reference and Description while saving normalized GST and Supplier fields", async () => {
    const { profile } = await fixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Registration fields", description: "Existing directory text", procurementProfile: profile });
    const { reference: _reference, supplier: _supplier, ...input } = profile;
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: { ...input, vendorType: "supplier", executionType: null, gstRegistered: true, gstNumber: " 29abcde1234f1z5 " } });
    expect(await reference.getVendorDetail(actor, created.id)).toMatchObject({ description: "Existing directory text", procurementProfile: { reference: profile.reference, gstNumber: "29ABCDE1234F1Z5", supplier: true } });
    await expect(reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 2, procurementProfile: { ...input, gstRegistered: true, gstNumber: null } })).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { "procurementProfile.gstNumber": expect.any(String) } });
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 2, procurementProfile: { ...input, gstNumber: "draft-number", gstRegistered: false } });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toMatchObject({ gstNumber: null, reference: profile.reference });
    const newVendor = await reference.createMaster(actor, "vendors", { name: "No hidden fields", procurementProfile: input });
    expect(await reference.getVendorDetail(actor, newVendor.id)).toMatchObject({ description: null, procurementProfile: { reference: null } });
  });
  it("retains legacy registration Yes details without evidence, physical verification, and directory counts", async () => {
    const { profile, parent, child } = await fixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Legacy registrations", procurementProfile: { ...profile, currentAddressVerifiedPhysically: true } });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: created.id }, { $set: { "procurementProfile.gstRegistered": true, "procurementProfile.msmeRegistered": true }, $unset: { "procurementProfile.gstNumber": "" } });
    const detail = await reference.getVendorDetail(actor, created.id);
    expect(detail).toMatchObject({ msmeCertificate: null, procurementProfile: { gstNumber: null, gstRegistered: true, msmeRegistered: true, email: profile.email, currentAddressVerifiedPhysically: true, physicalAddressVerifiedById: actor.id }, procurementSummary: { profileComplete: false, mainBasket: { id: parent.id }, subBasket: { id: child.id }, currentAddressVerifiedPhysically: true } });
    const page = await reference.listMasters(actor, "vendors", { includeDirectoryOverview: true }, { limit: 10, offset: 0 });
    expect(page.directoryOverview).toMatchObject({ underReviewVendors: 0 });
    expect(page.items[0]?.procurementSummary).toMatchObject({ profileComplete: false, vendorType: "execution" });
    expect(JSON.stringify(page)).not.toContain("gstNumber");
    expect(JSON.stringify(page)).not.toContain("msmeCertificate");
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, description: "Metadata only" });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toEqual(detail.procurementProfile);
    await expect(reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 2, procurementProfile: { ...profile, gstRegistered: true } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("stamps verification, resets changed address, and requires explicit reconfirmation", async () => {
    const { profile } = await fixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Verified vendor", procurementProfile: { ...profile, currentAddressVerifiedPhysically: true } });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toMatchObject({ physicalAddressVerifiedById: actor.id, physicalAddressVerifiedAt: expect.any(String) });
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: { ...profile, currentAddress: "Changed address", currentAddressVerifiedPhysically: true } });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toMatchObject({ currentAddressVerifiedPhysically: false, physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null });
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 2, procurementProfile: { ...profile, currentAddress: "Reconfirmed address", currentAddressVerifiedPhysically: true }, confirmPhysicalAddressVerification: true });
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile).toMatchObject({ currentAddressVerifiedPhysically: true, physicalAddressVerifiedById: actor.id });
    expect((await AiEstimatorKnowledgeVendorModel.findById(created.id).lean())?.dependencyEpoch).toBe(2);
  });
  it("validates parents and preserves unchanged unavailable references", async () => {
    const { profile, parent } = await fixture();
    const other = await reference.createBasket(actor, { name: "Other" });
    await expect(reference.createMaster(actor, "vendors", { name: "Wrong parent", procurementProfile: { ...profile, mainBasketId: other.id } })).rejects.toMatchObject({ code: "SUB_BASKET_PARENT_MISMATCH" });
    const created = await reference.createMaster(actor, "vendors", { name: "Retained", procurementProfile: profile });
    await reference.updateBasket(actor, parent.id, { expectedVersion: 1, status: "inactive" });
    await reference.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: { ...profile, position: "Director" } });
    expect((await reference.getVendorDetail(actor, created.id)).procurementSummary.mainBasket?.status).toBe("inactive");
    await expect(reference.createMaster(actor, "vendors", { name: "Inactive selection", procurementProfile: profile })).rejects.toMatchObject({ code: "VENDOR_BASKET_UNAVAILABLE" });
  });
  it("retained inactive and archived vendors block parent and child deletion", async () => {
    const { profile, parent, child } = await fixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Archived reference", procurementProfile: profile });
    await reference.archiveMaster(actor, "vendors", created.id, { expectedVersion: 1, reason: "Retired synthetic vendor" });
    expect(await reference.getBasketDeletionImpact(actor, parent.id)).toMatchObject({ vendorReferenceCount: 1 });
    await expect(reference.permanentlyDeleteBasket(actor, parent.id, { expectedVersion: 1, confirmationName: parent.name, reason: "Remove" })).rejects.toMatchObject({ code: "VENDOR_BASKET_REFERENCED" });
    const impact = await reference.getSubBasketDeletionImpact(actor, parent.id, child.id);
    expect(impact.vendorReferenceCount).toBe(1);
    await expect(reference.permanentlyDeleteSubBasket(actor, parent.id, child.id, { expectedVersion: 1, confirmationName: child.name, reason: "Remove", impactToken: impact.impactToken })).rejects.toMatchObject({ code: "VENDOR_BASKET_REFERENCED" });
    expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: parent.id })).toBeTruthy();
  });
  it("serializes concurrent assignment with basket deletion without dangling vendor references", async () => {
    const { profile, parent } = await fixture();
    const outcomes = await Promise.allSettled([
      reference.createMaster(actor, "vendors", { name: "Racing vendor", procurementProfile: profile }),
      reference.permanentlyDeleteBasket(actor, parent.id, { expectedVersion: 1, confirmationName: parent.name, reason: "Remove synthetic basket" })
    ]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const vendor = await AiEstimatorKnowledgeVendorModel.findOne({ name: "Racing vendor" }).lean();
    expect(Boolean(await AiEstimatorKnowledgeBasketModel.exists({ _id: parent.id }))).toBe(Boolean(vendor));
  });
  it("serializes assignment with Sub Basket deletion through the shared parent write", async () => {
    const { profile, parent, child } = await fixture();
    const impact = await reference.getSubBasketDeletionImpact(actor, parent.id, child.id);
    const outcomes = await Promise.allSettled([
      reference.createMaster(actor, "vendors", { name: "Racing child vendor", procurementProfile: profile }),
      reference.permanentlyDeleteSubBasket(actor, parent.id, child.id, { expectedVersion: 1, confirmationName: child.name, reason: "Remove synthetic group", impactToken: impact.impactToken })
    ]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const vendor = await AiEstimatorKnowledgeVendorModel.findOne({ name: "Racing child vendor" }).lean();
    expect(Boolean(await AiEstimatorKnowledgeSubBasketModel.exists({ _id: child.id }))).toBe(Boolean(vendor));
  });
  it("rolls back profile and dependency writes if audit persistence fails", async () => {
    const { profile, parent } = await fixture();
    const created = await reference.createMaster(actor, "vendors", { name: "Rollback vendor", procurementProfile: profile });
    const before = await AiEstimatorKnowledgeBasketModel.findById(parent.id).lean();
    const failing = createAiEstimatorKnowledgeReferenceService({ actorGuard, audit: { appendInMongoTransaction: vi.fn(async () => { throw new Error("Synthetic audit failure"); }) } });
    await expect(failing.updateMaster(actor, "vendors", created.id, { expectedVersion: 1, procurementProfile: { ...profile, currentAddressVerifiedPhysically: true } })).rejects.toThrow("Synthetic audit failure");
    expect((await reference.getVendorDetail(actor, created.id)).procurementProfile?.currentAddressVerifiedPhysically).toBe(false);
    expect((await AiEstimatorKnowledgeBasketModel.findById(parent.id).lean())?.dependencyEpoch).toBe(before?.dependencyEpoch);
  });
});
