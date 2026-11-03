import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { ProcurementVendorSaveCommandModel } from "../src/models/ProcurementVendorSaveCommand.js";
import { UserModel } from "../src/models/User.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { vendorBankAccountFixture, vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";
import type { ProcurementVendorClassificationCommand } from "../src/services/procurement-vendor-profile.js";

const actor = { id: "classification-admin", role: "super_admin" as const, name: "Synthetic Admin", email: "admin@example.invalid" };
const procurement = { ...actor, id: "classification-procurement", role: "procurement" as const, email: "procurement@example.invalid" };
const actorGuard = { requireReadActor: async () => actor, requireMutationActor: async () => actor };
const audit = createAuditService(createMemoryRepository());
const reference = createAiEstimatorKnowledgeReferenceService({ actorGuard, audit });
const secured = createAiEstimatorKnowledgeReferenceService({ audit });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-vendor-classification");
  await Promise.all([AuditEventModel, AiEstimatorKnowledgeVendorModel, AiEstimatorKnowledgeBasketModel,
    AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeDisplayOrderSequenceModel, ProcurementVendorSaveCommandModel,
    UserModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica.stop(); });

async function fixture() {
  const first = await reference.createBasket(actor, { name: "Electrical" });
  const second = await reference.createBasket(actor, { name: "Ceilings" });
  const light = await reference.createSubBasket(actor, first.id, { name: "Lighting" });
  const switchgear = await reference.createSubBasket(actor, first.id, { name: "Switchgear" });
  const ceiling = await reference.createSubBasket(actor, second.id, { name: "False ceiling" });
  const profile = { ...vendorProfileFixture(), bankAccount: vendorBankAccountFixture(), currentAddressVerifiedPhysically: true,
    mainBasketIds: [first.id, second.id], subBasketIds: [light.id, switchgear.id, ceiling.id], mainBasketId: first.id, subBasketId: light.id };
  const vendor = await reference.createMaster(actor, "vendors", { name: "Synthetic installer", procurementProfile: profile });
  return { first, second, light, switchgear, ceiling, vendor, profile };
}
function command(mainBasketIds: string[], subBasketIds: string[], expectedVersion = 1, idempotencyKey = "correction-identity-1"): ProcurementVendorClassificationCommand {
  return { mainBasketIds, subBasketIds, expectedVersion, idempotencyKey, reason: "Release obsolete assignment" };
}
async function row(id: string) { return (await AiEstimatorKnowledgeVendorModel.findById(id).lean().exec())!; }
function withoutClassification(profile: Record<string, unknown>) {
  const { mainBasketIds: _m, subBasketIds: _s, mainBasketId: _mp, subBasketId: _sp, ...rest } = profile;
  return rest;
}
async function users() {
  for (const user of [actor, procurement]) await UserModel.create({ _id: user.id, name: user.name, email: user.email,
    emailNormalized: user.email, passwordHash: "synthetic-fixture", role: user.role, active: true });
}

describe("vendor classification correction", () => {
  it("lists all retained array and legacy blockers through pagination without unrelated vendors", async () => {
    const f = await fixture();
    const legacy = await reference.createMaster(actor, "vendors", { name: "Legacy installer", procurementProfile: { ...f.profile, mainBasketIds: undefined, subBasketIds: undefined } });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: legacy.id }, { $unset: { "procurementProfile.mainBasketIds": "", "procurementProfile.subBasketIds": "" } });
    await reference.archiveMaster(actor, "vendors", legacy.id, { expectedVersion: 1, reason: "Retain synthetic legacy blocker" });
    await reference.createMaster(actor, "vendors", { name: "Unrelated installer", procurementProfile: { ...f.profile,
      mainBasketIds: [f.second.id], subBasketIds: [f.ceiling.id], mainBasketId: f.second.id, subBasketId: f.ceiling.id } });
    await reference.updateMaster(actor, "vendors", f.vendor.id, { expectedVersion: 1, status: "inactive" });
    for (const filter of [{ mainBasketId: f.first.id }, { subBasketId: f.light.id }]) {
      const first = await reference.listMasters(actor, "vendors", { ...filter, includeArchived: true }, { limit: 1, offset: 0 });
      const second = await reference.listMasters(actor, "vendors", { ...filter, includeArchived: true }, { limit: 1, offset: 1 });
      expect(first.total).toBe(2); expect(second.total).toBe(2);
      expect([first.items[0]!.id, second.items[0]!.id].sort()).toEqual([f.vendor.id, legacy.id].sort());
      expect([first.items[0]!.status, second.items[0]!.status].sort()).toEqual(["archived", "inactive"]);
    }
    expect((await reference.getBasketDeletionImpact(actor, f.first.id)).vendorReferenceCount).toBe(2);
    expect((await reference.getSubBasketDeletionImpact(actor, f.first.id, f.light.id)).vendorReferenceCount).toBe(2);
  });

  it("corrects archived assignments only and releases both legacy and array blockers", async () => {
    const f = await fixture(); await users();
    await reference.archiveMaster(actor, "vendors", f.vendor.id, { expectedVersion: 1, reason: "Synthetic archive" });
    const before = await row(f.vendor.id);
    expect((await reference.getBasketDeletionImpact(actor, f.first.id)).vendorReferenceCount).toBe(1);
    const result = await secured.updateVendorClassification(actor, f.vendor.id, command([f.second.id], [f.ceiling.id], 2));
    const after = await row(f.vendor.id);
    expect(result).toMatchObject({ id: f.vendor.id, masterType: "vendors", status: "archived", version: 3,
      procurementSummary: { mainBasket: { id: f.second.id }, subBasket: { id: f.ceiling.id } } });
    expect(result).not.toHaveProperty("procurementProfile");
    expect(withoutClassification(after.procurementProfile)).toEqual(withoutClassification(before.procurementProfile));
    for (const key of Object.keys(before).filter(key => !["procurementProfile", "updatedAt", "updatedById", "version", "dependencyEpoch"].includes(key))) {
      expect(after[key]).toEqual(before[key]);
    }
    expect(after.procurementProfile).toMatchObject({ mainBasketIds: [f.second.id], subBasketIds: [f.ceiling.id], mainBasketId: f.second.id, subBasketId: f.ceiling.id });
    expect((await reference.getBasketDeletionImpact(actor, f.first.id)).vendorReferenceCount).toBe(0);
    expect((await reference.getSubBasketDeletionImpact(actor, f.first.id, f.light.id)).vendorReferenceCount).toBe(0);
    expect((await reference.getBasketDeletionImpact(actor, f.second.id)).vendorReferenceCount).toBe(1);
    const event = await AuditEventModel.findOne({ action: "procurement_vendor_classification_corrected" }).lean();
    expect(event).toMatchObject({ actorId: actor.id, entityId: f.vendor.id, reason: "Release obsolete assignment" });
    expect(Object.keys(event!.newValues!).sort()).toEqual(["mainBasketId", "mainBasketIds", "subBasketId", "subBasketIds"]);
    const publicOutput = JSON.stringify([result, event, await ProcurementVendorSaveCommandModel.find().lean()]);
    expect(publicOutput).not.toContain(f.profile.bankAccount.accountNumber);
    expect(publicOutput).not.toContain(f.profile.email);
    await expect(secured.updateMaster(actor, "vendors", f.vendor.id, { expectedVersion: 3, description: "Forbidden general edit" })).rejects.toMatchObject({ code: "RESOURCE_ARCHIVED" });
  });

  it("removes one child while preserving unrelated groups and normalizing the primary pair", async () => {
    const f = await fixture();
    await reference.updateVendorClassification(actor, f.vendor.id, command([f.second.id, f.first.id], [f.ceiling.id, f.switchgear.id]));
    const current = await row(f.vendor.id);
    expect(current.procurementProfile.mainBasketIds).toEqual([f.first.id, f.second.id].sort());
    expect(current.procurementProfile.subBasketIds).toEqual([f.ceiling.id, f.switchgear.id].sort());
    expect(current.procurementProfile.subBasketId).not.toBe(f.light.id);
    const primary = await AiEstimatorKnowledgeSubBasketModel.findById(current.procurementProfile.subBasketId).lean();
    expect(current.procurementProfile.mainBasketId).toBe(primary!.basketId);
  });

  it("normalizes primary-only legacy assignments without rewriting unrelated legacy fields", async () => {
    const f = await fixture();
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: f.vendor.id }, {
      $unset: { "procurementProfile.mainBasketIds": "", "procurementProfile.subBasketIds": "", "procurementProfile.organizationType": "" },
      $set: { "procurementProfile.executionType": "labor", "procurementProfile.gstRegistered": true, "procurementProfile.gstNumber": "legacy-invalid" }
    });
    const before = await row(f.vendor.id);
    await reference.updateVendorClassification(actor, f.vendor.id, command([f.second.id], [f.ceiling.id]));
    const after = await row(f.vendor.id);
    expect(withoutClassification(after.procurementProfile)).toEqual(withoutClassification(before.procurementProfile));
    expect(after.procurementProfile.mainBasketId).toBe(f.second.id);
    expect((await reference.listMasters(actor, "vendors", { mainBasketId: f.first.id, includeArchived: true }, { limit: 1, offset: 0 })).total).toBe(0);
  });

  it("rejects empty, mismatched, unavailable, and extra-field commands without partial writes", async () => {
    const f = await fixture(); const original = await row(f.vendor.id);
    const destination = await reference.createBasket(actor, { name: "Inactive destination", status: "inactive" });
    const valid = command([f.second.id], [f.ceiling.id]);
    const invalid = [
      { ...valid, mainBasketIds: [] }, { ...valid, subBasketIds: [] }, { ...valid, status: "active" },
      { ...valid, reason: " " }, { ...valid, idempotencyKey: "short" },
      { ...valid, mainBasketIds: [f.first.id] }, { ...valid, subBasketIds: ["missing-child"] },
      { ...valid, mainBasketIds: [destination.id] }
    ];
    for (const input of invalid) await expect(reference.updateVendorClassification(actor, f.vendor.id, input as ProcurementVendorClassificationCommand)).rejects.toMatchObject({ status: expect.any(Number) });
    expect(await row(f.vendor.id)).toEqual(original);
    expect(await ProcurementVendorSaveCommandModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_classification_corrected" })).toBe(0);
  });

  it("retains previously selected inactive groups but refuses new assignments under them", async () => {
    const f = await fixture();
    await reference.updateBasket(actor, f.first.id, { expectedVersion: 1, status: "inactive" });
    await reference.updateVendorClassification(actor, f.vendor.id, command([f.first.id], [f.light.id]));
    const current = await row(f.vendor.id);
    expect(current.procurementProfile.mainBasketId).toBe(f.first.id);
    await expect(reference.updateVendorClassification(actor, f.vendor.id, command([f.first.id], [f.switchgear.id], 2, "new-child-under-inactive")))
      .rejects.toMatchObject({ code: "SUB_BASKET_PARENT_MISMATCH" });
  });

  it("enforces stored actor identity, archived scope, and revoked access before replay", async () => {
    const f = await fixture(); await users();
    await secured.updateVendorClassification(procurement, f.vendor.id, command([f.second.id], [f.ceiling.id]));
    await secured.archiveMaster(actor, "vendors", f.vendor.id, { expectedVersion: 2, reason: "Synthetic archive" });
    await expect(secured.updateVendorClassification(procurement, f.vendor.id, command([f.second.id], [f.ceiling.id])))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    const archivedCommand = command([f.first.id], [f.light.id], 3);
    await secured.updateVendorClassification(actor, f.vendor.id, archivedCommand);
    await UserModel.updateOne({ _id: actor.id }, { $set: { active: false } });
    await expect(secured.updateVendorClassification(actor, f.vendor.id, archivedCommand)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect((await row(f.vendor.id)).version).toBe(4);
  });

  it("deduplicates concurrent retries and preserves later updates when replaying", async () => {
    const f = await fixture(); const input = command([f.second.id], [f.ceiling.id]);
    const [first, replay] = await Promise.all([
      reference.updateVendorClassification(actor, f.vendor.id, input), reference.updateVendorClassification(actor, f.vendor.id, input)
    ]);
    expect(replay).toEqual(first);
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_classification_corrected" })).toBe(1);
    // The full-profile update command can independently use the same client identity.
    await reference.updateMaster(actor, "vendors", f.vendor.id, { expectedVersion: 2, description: "Later unrelated change", idempotencyKey: input.idempotencyKey });
    expect(await reference.updateVendorClassification(actor, f.vendor.id, input)).toEqual(first);
    expect(await row(f.vendor.id)).toMatchObject({ version: 3, description: "Later unrelated change" });
    await expect(reference.updateVendorClassification(actor, f.vendor.id, { ...input, reason: "Different intent" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await ProcurementVendorSaveCommandModel.countDocuments()).toBe(2);
  });

  it("rolls back classifications, dependency locks, and receipts if audit fails", async () => {
    const f = await fixture(); const before = await row(f.vendor.id);
    const parent = await AiEstimatorKnowledgeBasketModel.findById(f.second.id).lean();
    const failing = createAiEstimatorKnowledgeReferenceService({ actorGuard, audit: { appendInMongoTransaction: async () => { throw new Error("Synthetic audit unavailable"); } } });
    await expect(failing.updateVendorClassification(actor, f.vendor.id, command([f.second.id], [f.ceiling.id]))).rejects.toThrow("Synthetic audit unavailable");
    expect(await row(f.vendor.id)).toEqual(before);
    expect(await AiEstimatorKnowledgeBasketModel.findById(f.second.id).lean()).toEqual(parent);
    expect(await ProcurementVendorSaveCommandModel.countDocuments()).toBe(0);
  });

  it("serializes correction and full-profile edits with one winning version", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      reference.updateVendorClassification(actor, f.vendor.id, command([f.second.id], [f.ceiling.id])),
      reference.updateMaster(actor, "vendors", f.vendor.id, { expectedVersion: 1, procurementProfile: { ...f.profile, position: "Updated position" } })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    const current = await row(f.vendor.id); expect(current.version).toBe(2);
    if (results[0].status === "fulfilled") {
      expect(current.procurementProfile.mainBasketIds).toEqual([f.second.id]);
      expect(current.procurementProfile.position).toBe(f.profile.position);
    } else {
      expect(current.procurementProfile.position).toBe("Updated position");
      expect(current.procurementProfile.mainBasketIds).toHaveLength(2);
    }
  });

  it.each(["main", "sub"] as const)("coordinates new assignments with concurrent %s basket deletion", async kind => {
    const f = await fixture();
    const destination = await reference.createBasket(actor, { name: "Race destination" });
    const child = await reference.createSubBasket(actor, destination.id, { name: "Race child" });
    const impact = await reference.getSubBasketDeletionImpact(actor, destination.id, child.id);
    const results = await Promise.allSettled([
      reference.updateVendorClassification(actor, f.vendor.id, command([destination.id], [child.id])),
      kind === "main"
        ? reference.permanentlyDeleteBasket(actor, destination.id, { expectedVersion: 1, confirmationName: destination.name, reason: "Synthetic race" })
        : reference.permanentlyDeleteSubBasket(actor, destination.id, child.id, { expectedVersion: impact.version, confirmationName: child.name, reason: "Synthetic race", impactToken: impact.impactToken })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const current = await row(f.vendor.id);
    if (results[0].status === "fulfilled") {
      expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: destination.id })).not.toBeNull();
      expect(await AiEstimatorKnowledgeSubBasketModel.exists({ _id: child.id })).not.toBeNull();
      expect(results[1]).toMatchObject({ reason: { code: "VENDOR_BASKET_REFERENCED" } });
    } else {
      expect(current.procurementProfile.mainBasketIds).not.toContain(destination.id);
      expect(current.procurementProfile.subBasketIds).not.toContain(child.id);
    }
  });

  it.each(["main", "sub"] as const)("safely releases an existing blocker during concurrent %s deletion", async kind => {
    const f = await fixture();
    const impact = await reference.getSubBasketDeletionImpact(actor, f.first.id, f.light.id);
    const results = await Promise.allSettled([
      reference.updateVendorClassification(actor, f.vendor.id, command([f.second.id], [f.ceiling.id])),
      kind === "main"
        ? reference.permanentlyDeleteBasket(actor, f.first.id, { expectedVersion: 1, confirmationName: f.first.name, reason: "Synthetic removal race" })
        : reference.permanentlyDeleteSubBasket(actor, f.first.id, f.light.id, { expectedVersion: impact.version, confirmationName: f.light.name,
          reason: "Synthetic removal race", impactToken: impact.impactToken })
    ]);
    expect(results[0].status).toBe("fulfilled");
    if (results[1].status === "rejected") {
      expect(["VENDOR_BASKET_REFERENCED", "DELETION_IMPACT_CHANGED"]).toContain(results[1].reason.code);
      if (kind === "main") {
        expect((await reference.getBasketDeletionImpact(actor, f.first.id)).vendorReferenceCount).toBe(0);
        await reference.permanentlyDeleteBasket(actor, f.first.id, { expectedVersion: 1, confirmationName: f.first.name, reason: "Fresh confirmation" });
      } else {
        const refreshed = await reference.getSubBasketDeletionImpact(actor, f.first.id, f.light.id);
        expect(refreshed.vendorReferenceCount).toBe(0);
        await reference.permanentlyDeleteSubBasket(actor, f.first.id, f.light.id, { expectedVersion: refreshed.version,
          confirmationName: f.light.name, reason: "Fresh confirmation", impactToken: refreshed.impactToken });
      }
    }
    const current = await row(f.vendor.id);
    expect(current.procurementProfile.mainBasketIds).toEqual([f.second.id]);
    expect(current.procurementProfile.subBasketIds).toEqual([f.ceiling.id]);
    expect(await AiEstimatorKnowledgeSubBasketModel.exists({ _id: f.ceiling.id })).not.toBeNull();
  });
});
