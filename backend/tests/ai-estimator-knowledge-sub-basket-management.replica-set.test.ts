import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../src/middleware/errors.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAiEstimatorKnowledgeReferenceService, type AiEstimatorKnowledgeSubBasketDeletionImpact } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService, type AuditService } from "../src/services/audit.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor = { id: "basket-management-admin", name: "Basket Administrator", email: "baskets@example.invalid", role: "super_admin" as const };
const actorGuard = { requireReadActor: async () => actor, requireMutationActor: async () => actor };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let base: ReturnType<typeof harness>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("knowledge-sub-basket-management");
  await Promise.all([AuditEventModel, AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeDisplayOrderSequenceModel,
    AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgePriceVersionModel, AiEstimatorKnowledgeRevisionModel,
    AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeUomModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => { await replica.clear(); base = harness(); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await replica.stop(); });

function harness(audit: Pick<AuditService, "appendInMongoTransaction"> = createAuditService(createMemoryRepository())) {
  return { audit, item: createAiEstimatorKnowledgeItemService({ actorGuard, audit }),
    reference: createAiEstimatorKnowledgeReferenceService({ actorGuard, audit }) };
}
function confirmation(impact: AiEstimatorKnowledgeSubBasketDeletionImpact, draftOnly?: true) {
  return { expectedVersion: impact.version, confirmationName: impact.subBasketName,
    reason: "Remove obsolete synthetic group", impactToken: impact.impactToken,
    ...(draftOnly === undefined ? {} : { draftOnly }) };
}
function inlineConfirmation(impact: AiEstimatorKnowledgeSubBasketDeletionImpact) {
  return { ...confirmation(impact), draftOnly: true as const };
}
async function storedDocuments() {
  return Promise.all([AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel,
    AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel,
    AiEstimatorKnowledgePriceVersionModel, AuditEventModel].map((model) => model.find().sort({ _id: 1 }).lean()));
}
async function fixture() {
  const parent = await base.reference.createBasket(actor, { name: "Electrical" });
  const otherParent = await base.reference.createBasket(actor, { name: "Ceilings" });
  const target = await base.item.createMainLine(actor, parent.id, { name: "Temporary fixture", itemType: "temporary", subBasketName: "Lights" });
  const target2 = await base.item.createMainLine(actor, parent.id, { name: "Catalog fixture", subBasketId: target.subBasketId! });
  const sibling = await base.item.createMainLine(actor, parent.id, { name: "Sibling fixture", itemType: "temporary", subBasketName: "Switches" });
  const foreign = await base.item.createMainLine(actor, otherParent.id, { name: "Temporary fixture", itemType: "temporary", subBasketName: "Lights" });
  const source = await base.item.createMainLine(actor, otherParent.id, { name: "Source item" });
  return { parent, otherParent, target, target2, sibling, foreign, source };
}
type Target = Awaited<ReturnType<typeof fixture>>["target"];
function rule(target: Target, id: string, wholeGroup = false) {
  return { id, trigger: "removed", action: "add", requirement: "can", targetType: wholeGroup ? null : target.itemType === "temporary" ? "temporary" : "catalog",
    targetKind: wholeGroup ? "sub_basket" : "main_line", targetBasketId: target.basketId,
    targetSubBasketId: target.subBasketId, targetMainLineId: wholeGroup ? null : target.mainLineId,
    reason: "Use the related fixture", active: true };
}
async function saveRules(source: Target, rules: unknown[], services = base) {
  const current = await services.item.getItem(actor, source.mainLineId);
  const section = await services.item.getSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations");
  return services.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations", {
    expectedVersion: section.version, expectedAggregateVersion: current.version, payload: { budgetAlterations: rules }
  });
}
function gatedAudit(action: string) {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  const real = base.audit;
  let gated = false;
  return { entered, release, audit: { appendInMongoTransaction: async (...args: Parameters<AuditService["appendInMongoTransaction"]>) => {
    if (!gated && args[0].action === action) { gated = true; enter(); await released; }
    return real.appendInMongoTransaction(...args);
  } } };
}
async function tick() { await new Promise<void>((resolve) => setImmediate(resolve)); }
async function readyTemporary(item: Target) {
  await AiEstimatorKnowledgeUomModel.create({ _id: "uom-unit", code: "UNIT", codeNormalized: "unit", name: "Unit", nameNormalized: "unit",
    decimalScale: 0, displayOrder: 0, status: "active", version: 1, createdById: actor.id, updatedById: actor.id });
  await base.item.updateSection(actor, item.mainLineId, item.draftRevisionId!, "overview", {
    expectedVersion: 1, expectedAggregateVersion: item.version, payload: { uomId: "uom-unit" }
  });
  const current = await base.item.getItem(actor, item.mainLineId);
  await base.item.updateSection(actor, item.mainLineId, item.draftRevisionId!, "advanced", {
    expectedVersion: 1, expectedAggregateVersion: current.version, payload: {}
  });
  return base.item.getItem(actor, item.mainLineId);
}

describe("Sub Basket configuration management", { timeout: 30_000 }, () => {
  it.each(["active", "inactive", "archived"] as const)("rejects inline removal with a fresh %s-child preview while preserving Configuration deletion", async (status) => {
    const { parent, target, sibling, foreign } = await fixture();
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $set: { status } });
    const impact = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    const before = await storedDocuments();
    const siblingBefore = await base.item.getItem(actor, sibling.mainLineId);
    const foreignBefore = await base.item.getItem(actor, foreign.mainLineId);

    await expect(base.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, inlineConfirmation(impact)))
      .rejects.toMatchObject({ status: 409, code: "SUB_BASKET_FROZEN" });
    expect(await storedDocuments()).toEqual(before);

    expect(await base.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, confirmation(impact)))
      .toMatchObject({ deleted: true });
    expect(await base.item.getItem(actor, sibling.mainLineId)).toEqual(siblingBefore);
    expect(await base.item.getItem(actor, foreign.mainLineId)).toEqual(foreignBefore);
  });

  it("rejects invalid draftOnly values from direct callers without writes", async () => {
    const { parent, target } = await fixture();
    const impact = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    const before = await storedDocuments();
    for (const draftOnly of [false, null, "true", 1, {}, []]) {
      const input = { ...confirmation(impact), draftOnly } as unknown as Parameters<typeof base.reference.permanentlyDeleteSubBasket>[3];
      await expect(base.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, input))
        .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
      expect(await storedDocuments()).toEqual(before);
    }
  });

  it("renames in Configuration without changing non-Draft children and preserves inline draft restrictions", async () => {
    const { parent, target, sibling, foreign } = await fixture();
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $set: { status: "inactive" } });
    const impact = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    const prior = await AiEstimatorKnowledgeMainLineModel.findById(target.mainLineId).lean();
    await expect(base.reference.updateSubBasket(actor, parent.id, target.subBasketId!, { expectedVersion: impact.version, name: "Renamed" }))
      .rejects.toMatchObject({ code: "SUB_BASKET_FROZEN" });
    const renamed = await base.reference.updateSubBasket(actor, parent.id, target.subBasketId!, {
      expectedVersion: impact.version, name: "  Renamed   lighting ", managementContext: "configuration"
    });
    expect(renamed).toMatchObject({ id: target.subBasketId, basketId: parent.id, name: "Renamed lighting", version: impact.version + 1 });
    expect(await AiEstimatorKnowledgeMainLineModel.findById(target.mainLineId).lean()).toEqual(prior);
    expect((await base.item.getItem(actor, sibling.mainLineId)).subBasketName).toBe("Switches");
    expect((await base.item.getItem(actor, foreign.mainLineId)).subBasketName).toBe("Lights");
  });

  it.each([undefined, true] as const)("validates empty-group preview identity, confirmation, reason and token before deleting atomically (draftOnly=%s)", async (draftOnly) => {
    const parent = await base.reference.createBasket(actor, { name: "Empty parent" });
    const other = await base.reference.createBasket(actor, { name: "Other parent" });
    const group = await base.reference.createSubBasket(actor, parent.id, { name: "Empty group" });
    const impact = await base.reference.getSubBasketDeletionImpact(actor, parent.id, group.id);
    expect(impact).toMatchObject({ basketId: parent.id, subBasketId: group.id, version: group.version,
      mainLineCount: 0, referenceCount: 0, impactToken: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    await expect(base.reference.getSubBasketDeletionImpact(actor, other.id, group.id)).rejects.toMatchObject({ code: "SUB_BASKET_PARENT_MISMATCH" });
    const beforeAudit = await AuditEventModel.countDocuments();
    for (const patch of [{ confirmationName: "empty group" }, { reason: " " }, { impactToken: "invalid" }]) {
      await expect(base.reference.permanentlyDeleteSubBasket(actor, parent.id, group.id, { ...confirmation(impact, draftOnly), ...patch }))
        .rejects.toMatchObject({ status: 400 });
    }
    await expect(base.reference.permanentlyDeleteSubBasket(actor, other.id, group.id, confirmation(impact, draftOnly)))
      .rejects.toMatchObject({ code: "SUB_BASKET_PARENT_MISMATCH" });
    expect(await AuditEventModel.countDocuments()).toBe(beforeAudit);
    expect(await base.reference.permanentlyDeleteSubBasket(actor, parent.id, group.id, confirmation(impact, draftOnly)))
      .toMatchObject({ basketId: parent.id, subBasketId: group.id, deleted: true, deletedMainLineIds: [], deletedReferenceCount: 0 });
    expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: parent.id })).not.toBeNull();
  });

  it.each([undefined, true] as const)("deletes only the confirmed group, strips both target forms, and rejects stale source drafts (draftOnly=%s)", async (draftOnly) => {
    const { parent, target, target2, sibling, foreign, source } = await fixture();
    const sourceSaved = await saveRules(source, [rule(target, "item-reference"), rule(target, "whole-group", true),
      { ...rule(target2, "disabled-item"), active: false }, rule(sibling, "sibling-reference")]);
    const siblingBefore = await base.item.getItem(actor, sibling.mainLineId);
    const foreignBefore = await base.item.getItem(actor, foreign.mainLineId);
    const impact = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    expect(impact).toMatchObject({ mainLineCount: 2, referenceCount: 3 });
    const result = await base.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, confirmation(impact, draftOnly));
    expect([...result.deletedMainLineIds].sort()).toEqual([target.mainLineId, target2.mainLineId].sort());
    expect(result.deletedReferenceCount).toBe(3);
    for (const model of [AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgePriceVersionModel]) {
      expect(await model.countDocuments({ mainLineId: { $in: result.deletedMainLineIds } })).toBe(0);
    }
    expect(await base.item.getItem(actor, sibling.mainLineId)).toEqual(siblingBefore);
    expect(await base.item.getItem(actor, foreign.mainLineId)).toEqual(foreignBefore);
    const updated = await base.item.getSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations");
    expect(updated).toMatchObject({ version: sourceSaved.version + 1, payload: { budgetAlterations: [rule(sibling, "sibling-reference")] } });
    expect((await base.item.getItem(actor, source.mainLineId)).version).toBe(sourceSaved.aggregateVersion + 1);
    await expect(base.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations", {
      expectedVersion: sourceSaved.version, expectedAggregateVersion: sourceSaved.aggregateVersion,
      payload: { budgetAlterations: [rule(target, "resurrected")] }
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await AuditEventModel.findOne({ action: "ai_estimator_knowledge_sub_basket_permanently_deleted", entityId: target.subBasketId }).lean())
      .toMatchObject({ reason: "Remove obsolete synthetic group", oldValues: { deletedReferenceCount: 3 } });
  });

  it.each([undefined, true] as const)("rejects changed membership, child content and same-count different reference identities (draftOnly=%s)", async (draftOnly) => {
    const { parent, target, target2, source } = await fixture();
    await saveRules(source, [rule(target, "first")]);
    const original = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    await saveRules(source, [rule(target2, "replacement")]);
    const replaced = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    expect(replaced.referenceCount).toBe(original.referenceCount);
    expect(replaced.impactToken).not.toBe(original.impactToken);
    await expect(base.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, confirmation(original, draftOnly)))
      .rejects.toMatchObject({ code: "DELETION_IMPACT_CHANGED" });
    await base.item.updateSection(actor, target.mainLineId, target.draftRevisionId!, "advanced", { expectedVersion: 1, payload: {} });
    await expect(base.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, confirmation(replaced, draftOnly)))
      .rejects.toMatchObject({ code: "DELETION_IMPACT_CHANGED" });
    const beforeChild = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    await base.item.createMainLine(actor, parent.id, { name: "New child", subBasketId: target.subBasketId! });
    await expect(base.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, confirmation(beforeChild, draftOnly)))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({ subBasketId: target.subBasketId })).toBe(3);
  });

  it.each([undefined, true] as const)("rolls back group, children, references, versions and audit when cascade audit fails (draftOnly=%s)", async (draftOnly) => {
    const { parent, target, source } = await fixture();
    await saveRules(source, [rule(target, "rollback", true)]);
    const before = await storedDocuments();
    const failing = harness({ appendInMongoTransaction: async () => { throw new Error("synthetic audit unavailable"); } });
    const impact = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    await expect(failing.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, confirmation(impact, draftOnly)))
      .rejects.toThrow("synthetic audit unavailable");
    expect(await storedDocuments()).toEqual(before);
  });

  it.each(["activation-first", "delete-first"] as const)("serializes real activation against inline group removal: %s", async (order) => {
    const { parent, target, target2, sibling, foreign, source } = await fixture();
    const ready = await readyTemporary(target);
    await saveRules(source, [rule(target, "target-reference", true), rule(sibling, "sibling-reference")]);
    const preview = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    const sourceBefore = await base.item.getSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations");
    const siblingBefore = await base.item.getItem(actor, sibling.mainLineId);
    const foreignBefore = await base.item.getItem(actor, foreign.mainLineId);
    const gate = gatedAudit(order === "activation-first"
      ? "ai_estimator_knowledge_revision_activated" : "ai_estimator_knowledge_sub_basket_permanently_deleted");
    const gated = harness(gate.audit);
    const activate = (services = base) => services.item.activate(actor, ready.mainLineId, ready.draftRevisionId!, { expectedVersion: ready.version });
    const remove = (services = base) => services.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, inlineConfirmation(preview));
    const first = order === "activation-first" ? activate(gated) : remove(gated);
    await gate.entered;
    const second = order === "activation-first" ? remove() : activate();
    await tick(); gate.release();
    const [winner, loser] = await Promise.allSettled([first, second]);
    expect(winner.status).toBe("fulfilled");
    expect(loser).toMatchObject({ status: "rejected", reason: { code: order === "activation-first" ? "VERSION_CONFLICT" : "NOT_FOUND" } });
    expect(await base.item.getItem(actor, sibling.mainLineId)).toEqual(siblingBefore);
    expect(await base.item.getItem(actor, foreign.mainLineId)).toEqual(foreignBefore);
    expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: parent.id })).not.toBeNull();
    const sourceAfter = await base.item.getSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations");
    if (order === "activation-first") {
      expect(await AiEstimatorKnowledgeMainLineModel.findById(target.mainLineId).lean())
        .toMatchObject({ status: "active", version: ready.version + 1 });
      expect(await AiEstimatorKnowledgeMainLineModel.exists({ _id: target2.mainLineId })).not.toBeNull();
      expect(sourceAfter).toEqual(sourceBefore);
      expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_sub_basket_permanently_deleted" })).toBe(0);
      const fresh = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
      await expect(base.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, inlineConfirmation(fresh)))
        .rejects.toMatchObject({ status: 409, code: "SUB_BASKET_FROZEN" });
    } else {
      expect(await AiEstimatorKnowledgeSubBasketModel.exists({ _id: target.subBasketId })).toBeNull();
      expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({ subBasketId: target.subBasketId })).toBe(0);
      expect(await AiEstimatorKnowledgeRevisionModel.countDocuments({ mainLineId: { $in: [target.mainLineId, target2.mainLineId] } })).toBe(0);
      expect(sourceAfter).toMatchObject({ version: sourceBefore.version + 1, payload: { budgetAlterations: [rule(sibling, "sibling-reference")] } });
      expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_revision_activated" })).toBe(0);
    }
  });

  it.each(["create-first", "delete-first"])("coordinates concurrent child creation: %s", async (order) => {
    const { parent, target } = await fixture();
    const preview = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    const gate = gatedAudit(order === "create-first" ? "ai_estimator_knowledge_main_line_created" : "ai_estimator_knowledge_sub_basket_permanently_deleted");
    const gated = harness(gate.audit);
    const create = (services = base) => services.item.createMainLine(actor, parent.id, { name: "Concurrent child", subBasketId: target.subBasketId! });
    const remove = (services = base) => services.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, confirmation(preview));
    const first = order === "create-first" ? create(gated) : remove(gated);
    await gate.entered;
    const second = order === "create-first" ? remove() : create();
    await tick(); gate.release();
    const [winner, loser] = await Promise.allSettled([first, second]);
    expect(winner.status).toBe("fulfilled");
    expect(loser.status).toBe("rejected");
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({ subBasketId: target.subBasketId })).toBe(order === "create-first" ? 3 : 0);
  });

  it.each(["add", "remove", "retarget", "retain", "copy", "copy-revision"])("rejects a stale preview after a concurrent same-parent reference %s", async (operation) => {
    const { parent, target, target2, sibling, source } = await fixture();
    await saveRules(source, [rule(target, "first"), rule(sibling, "retained-parent")]);
    if (operation === "copy-revision") {
      // Lifecycle fixture isolates copying coordination from activation prerequisites.
      await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: source.mainLineId }, {
        $set: { status: "active", activeRevisionId: source.draftRevisionId, draftRevisionId: null }
      });
      await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: source.draftRevisionId }, {
        $set: { status: "active", contentDigest: "a".repeat(64), activatedAt: new Date(), activatedById: actor.id }
      });
    }
    const preview = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    const gate = gatedAudit(operation === "copy" ? "ai_estimator_knowledge_main_line_duplicated"
      : operation === "copy-revision" ? "ai_estimator_knowledge_revision_created" : "ai_estimator_knowledge_section_updated");
    const gated = harness(gate.audit);
    const nextRules = operation === "add" ? [rule(target, "first"), rule(target2, "added"), rule(sibling, "retained-parent")]
      : operation === "remove" ? [rule(sibling, "retained-parent")]
      : operation === "retarget" ? [rule(target2, "first"), rule(sibling, "retained-parent")]
      : [{ ...rule(target, "first"), reason: "Updated retained reference" }, rule(sibling, "retained-parent")];
    const version = (await base.item.getItem(actor, source.mainLineId)).version;
    const mutation = operation === "copy" ? gated.item.duplicate(actor, source.mainLineId, { name: "Copy source", expectedVersion: version })
      : operation === "copy-revision" ? gated.item.createRevision(actor, source.mainLineId, { expectedVersion: version })
      : saveRules(source, nextRules, gated);
    await gate.entered;
    const deletion = base.reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, confirmation(preview));
    await tick(); gate.release();
    const [changed, deleted] = await Promise.allSettled([mutation, deletion]);
    expect(changed.status).toBe("fulfilled");
    expect(deleted).toMatchObject({ status: "rejected", reason: { code: "DELETION_IMPACT_CHANGED" } });
    expect(await AiEstimatorKnowledgeSubBasketModel.exists({ _id: target.subBasketId })).not.toBeNull();
  });

  it("rejects a new reference after deletion wins, including an already-referenced parent", async () => {
    const { parent, target, sibling, source } = await fixture();
    await saveRules(source, [rule(sibling, "existing-parent")]);
    const preview = await base.reference.getSubBasketDeletionImpact(actor, parent.id, target.subBasketId!);
    const gate = gatedAudit("ai_estimator_knowledge_sub_basket_permanently_deleted");
    const deletion = harness(gate.audit).reference.permanentlyDeleteSubBasket(actor, parent.id, target.subBasketId!, confirmation(preview));
    await gate.entered;
    const mutation = saveRules(source, [rule(sibling, "existing-parent"), rule(target, "too-late", true)]);
    await tick(); gate.release();
    const [deleted, changed] = await Promise.allSettled([deletion, mutation]);
    expect(deleted.status).toBe("fulfilled");
    expect(changed).toMatchObject({ status: "rejected", reason: { status: 400, code: "VALIDATION_ERROR" } });
    expect((await base.item.getSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations")).payload)
      .toEqual({ budgetAlterations: [rule(sibling, "existing-parent")] });
  });

  it("creates direct and grouped temporary items; distinguishes rollback from post-commit read failure", async () => {
    const parent = await base.reference.createBasket(actor, { name: "Temporary creation" });
    const direct = await base.item.createMainLine(actor, parent.id, { name: "Direct", itemType: "temporary" });
    expect(direct).toMatchObject({ itemType: "temporary", status: "draft", subBasketId: null });
    const broken = harness({ appendInMongoTransaction: async () => { throw new Error("transaction failed"); } });
    await expect(broken.item.createMainLine(actor, parent.id, { name: "Must roll back", itemType: "temporary", subBasketName: "Atomic group" })).rejects.toThrow("transaction failed");
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(0);
    const afterCommit = createAiEstimatorKnowledgeItemService({ audit: base.audit, actorGuard: {
      ...actorGuard, requireReadActor: async () => { throw new Error("post-commit read failed"); }
    } });
    await expect(afterCommit.createMainLine(actor, parent.id, { name: "Committed", itemType: "temporary", subBasketName: "Saved group" }))
      .rejects.toThrow("post-commit read failed");
    const stored = await AiEstimatorKnowledgeMainLineModel.findOne({ basketId: parent.id, name: "Committed" }).lean();
    expect(stored).toMatchObject({ itemType: "temporary", status: "draft" });
    expect(await AuditEventModel.countDocuments({ entityId: stored!._id, action: "ai_estimator_knowledge_main_line_created" })).toBe(1);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(1);
    await base.reference.updateBasket(actor, parent.id, { expectedVersion: parent.version, status: "inactive" });
    await expect(base.item.createMainLine(actor, parent.id, { name: "Inactive direct", itemType: "temporary" }))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("does not misclassify unknown failures or unrelated duplicate indexes as item-name conflicts", async () => {
    const parent = await base.reference.createBasket(actor, { name: "Errors" });
    for (const failure of [new Error("storage unavailable"), { code: 11000, keyPattern: { _id: 1 } }]) {
      const failing = harness({ appendInMongoTransaction: async () => { throw failure; } });
      await expect(failing.item.createMainLine(actor, parent.id, { name: "Item", itemType: "temporary" })).rejects.toEqual(failure);
    }
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
    const denied = createAiEstimatorKnowledgeReferenceService({ audit: base.audit, actorGuard: { ...actorGuard,
      requireMutationActor: async () => { throw new ApiError(403, "FORBIDDEN", "Denied"); }
    } });
    const group = await base.reference.createSubBasket(actor, parent.id, { name: "Protected" });
    const impact = await base.reference.getSubBasketDeletionImpact(actor, parent.id, group.id);
    await expect(denied.permanentlyDeleteSubBasket(actor, parent.id, group.id, confirmation(impact))).rejects.toMatchObject({ status: 403 });
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_sub_basket_permanently_deleted" })).toBe(0);
  });
});
