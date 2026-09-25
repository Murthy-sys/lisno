import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService, type AuditService } from "../src/services/audit.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor = { id: "inline-item-admin", name: "Inline Administrator", email: "inline@example.invalid", role: "super_admin" as const };
const actorGuard = { requireReadActor: async () => actor, requireMutationActor: async () => actor };
const models = [AuditEventModel, AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeDisplayOrderSequenceModel,
  AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgePriceVersionModel, AiEstimatorKnowledgeRevisionModel,
  AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeUomModel];
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let base: ReturnType<typeof harness>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("knowledge-inline-item-mutations");
  await Promise.all(models.map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => { await replica.clear(); base = harness(); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await replica.stop(); });

function harness(audit: Pick<AuditService, "appendInMongoTransaction"> = createAuditService(createMemoryRepository())) {
  return { audit, item: createAiEstimatorKnowledgeItemService({ actorGuard, audit }),
    reference: createAiEstimatorKnowledgeReferenceService({ actorGuard, audit }) };
}
async function fixture() {
  const parent = await base.reference.createBasket(actor, { name: "Electrical" });
  const other = await base.reference.createBasket(actor, { name: "Ceilings" });
  const item = await base.item.createMainLine(actor, parent.id, { name: "Functional lights Supply", itemType: "temporary" });
  const sibling = await base.item.createMainLine(actor, parent.id, { name: "Sibling", itemType: "temporary", subBasketName: "Grouped lights" });
  const foreign = await base.item.createMainLine(actor, other.id, { name: "Functional lights Supply", itemType: "temporary" });
  const guard = { basketId: parent.id, subBasketId: null } as const;
  return { parent, other, item, sibling, foreign, guard };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function snapshot() {
  return Promise.all(models.map((model) => model.find().sort({ _id: 1 }).lean()));
}
function gatedAudit(action: string) {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  let gated = false;
  return { entered, release, audit: { appendInMongoTransaction: async (...args: Parameters<AuditService["appendInMongoTransaction"]>) => {
    if (!gated && args[0].action === action) { gated = true; enter(); await released; }
    return base.audit.appendInMongoTransaction(...args);
  } } };
}
async function readyTemporary(item: Fixture["item"]) {
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
async function referencingSource(target: Fixture["item"], basketId: string) {
  const source = await base.item.createMainLine(actor, basketId, { name: "Referencing source" });
  const rule = { id: "incoming", targetKind: "main_line", targetType: "temporary", targetBasketId: target.basketId,
    targetSubBasketId: null, targetMainLineId: target.mainLineId, trigger: "removed", action: "add", requirement: "can",
    reason: "Use the temporary alternative", active: true };
  const section = await base.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations", {
    expectedVersion: 1, expectedAggregateVersion: source.version, payload: { budgetAlterations: [rule] }
  });
  return { source, rule, section };
}

describe("Inline Draft item mutations", { timeout: 30_000 }, () => {
  it("renames a direct temporary item independently of frozen siblings and audits exact old/new names", async () => {
    const { parent, item, sibling, foreign, guard } = await fixture();
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: sibling.mainLineId }, { $set: { status: "inactive" } });
    const parentBefore = await AiEstimatorKnowledgeBasketModel.findById(parent.id).lean();
    const siblingBefore = await AiEstimatorKnowledgeMainLineModel.findById(sibling.mainLineId).lean();
    const renamed = await base.item.updateMainLine(actor, item.mainLineId, {
      expectedVersion: item.version, name: "False Ceiling Lights", draftItemGuard: guard
    });
    expect(renamed).toMatchObject({ mainLineId: item.mainLineId, basketId: parent.id, subBasketId: null,
      itemType: "temporary", status: "draft", mainLineName: "False Ceiling Lights", version: item.version + 1 });
    expect(await AiEstimatorKnowledgeBasketModel.findById(parent.id).lean()).toEqual(parentBefore);
    expect(await AiEstimatorKnowledgeMainLineModel.findById(sibling.mainLineId).lean()).toEqual(siblingBefore);
    expect((await base.item.getItem(actor, foreign.mainLineId)).mainLineName).toBe("Functional lights Supply");
    expect(await AuditEventModel.findOne({ entityId: item.mainLineId, action: "ai_estimator_knowledge_main_line_updated" }).lean())
      .toMatchObject({ actorId: actor.id, oldValues: { name: "Functional lights Supply", version: item.version },
        newValues: { name: "False Ceiling Lights", version: item.version + 1 } });
  });

  it.each(["rename", "remove"] as const)("rejects wrong parent or a grouped target for direct %s without any mutation", async (action) => {
    const { parent, other, item, sibling, guard } = await fixture();
    const before = await snapshot();
    for (const [target, draftItemGuard] of [[item, { ...guard, basketId: other.id }], [sibling, guard]] as const) {
      const result = action === "rename"
        ? base.item.updateMainLine(actor, target.mainLineId, { expectedVersion: target.version, name: "Wrong target", draftItemGuard })
        : base.item.permanentlyDeleteMainLine(actor, target.mainLineId, { expectedVersion: target.version, reason: "Wrong target", draftItemGuard });
      await expect(result).rejects.toMatchObject({ status: 409, code: "ITEM_PARENT_MISMATCH" });
    }
    expect(await snapshot()).toEqual(before);
    expect(parent.id).not.toBe(other.id);
  });

  it.each(["active", "inactive", "archived"] as const)("rejects matching current-version %s direct targets and preserves stale-version precedence", async (status) => {
    const { item, guard } = await fixture();
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: item.mainLineId }, {
      $set: { status, version: item.version + 1,
        ...(status === "archived" ? { archivedAt: new Date(), archivedById: actor.id } : {}) }
    });
    const before = await snapshot();
    for (const action of ["rename", "remove"] as const) {
      for (const expectedVersion of [item.version, item.version + 1]) {
        const command = { expectedVersion, draftItemGuard: guard };
        const result = action === "rename" ? base.item.updateMainLine(actor, item.mainLineId, { ...command, name: "Forbidden" })
          : base.item.permanentlyDeleteMainLine(actor, item.mainLineId, { ...command, reason: "Forbidden" });
        await expect(result).rejects.toMatchObject({ status: 409,
          code: expectedVersion === item.version ? "VERSION_CONFLICT" : "ITEM_FROZEN" });
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("rejects malformed, ambiguous and guard-only direct service calls before writes", async () => {
    const { item, sibling, guard } = await fixture();
    const before = await snapshot();
    const variants = [
      { draftItemGuard: { basketId: " ", subBasketId: null } },
      { draftItemGuard: { basketId: "a".repeat(129), subBasketId: null } },
      { draftItemGuard: { basketId: item.basketId, subBasketId: sibling.subBasketId } },
      { draftItemGuard: { basketId: item.basketId } },
      { draftItemGuard: { ...guard, extra: true } },
      { draftItemGuard: null },
      { draftItemGuard: guard, draftSubBasketGuard: { subBasketId: sibling.subBasketId!, expectedVersion: 2 } }
    ];
    for (const guards of variants) {
      await expect(base.item.updateMainLine(actor, item.mainLineId, { expectedVersion: item.version, name: "Invalid", ...guards } as never))
        .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
      await expect(base.item.permanentlyDeleteMainLine(actor, item.mainLineId, { expectedVersion: item.version, reason: "Invalid", ...guards } as never))
        .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    }
    await expect(base.item.updateMainLine(actor, item.mainLineId, { expectedVersion: item.version, draftItemGuard: guard }))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(base.item.updateMainLine(actor, sibling.mainLineId, {
      expectedVersion: sibling.version, draftSubBasketGuard: { subBasketId: sibling.subBasketId!, expectedVersion: 2 }
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(await snapshot()).toEqual(before);
  });

  it("maps only Main Basket/name duplicate renames and rolls back grouped aggregate writes", async () => {
    const { parent, other, item, sibling, guard } = await fixture();
    const before = await snapshot();
    await expect(base.item.updateMainLine(actor, item.mainLineId, {
      expectedVersion: item.version, name: "Ｓｉｂｌｉｎｇ", draftItemGuard: guard
    })).rejects.toMatchObject({ status: 409, code: "DUPLICATE_IDENTITY", fields: { name: expect.any(String) } });
    const group = (await base.reference.listSubBaskets(actor, parent.id, {}, { limit: 100, offset: 0 })).items[0]!;
    await expect(base.item.updateMainLine(actor, sibling.mainLineId, {
      expectedVersion: sibling.version, name: "FUNCTIONAL  LIGHTS supply", draftSubBasketGuard: { subBasketId: group.id, expectedVersion: group.version }
    })).rejects.toMatchObject({ status: 409, code: "DUPLICATE_IDENTITY" });
    expect(await snapshot()).toEqual(before);
    await base.item.createMainLine(actor, other.id, { name: "Other-only name" });
    expect(await base.item.updateMainLine(actor, item.mainLineId, { expectedVersion: item.version, name: "Other-only name", draftItemGuard: guard }))
      .toMatchObject({ mainLineName: "Other-only name", version: item.version + 1 });
  });

  it("leaves unrelated duplicate indexes and database errors unchanged during rename", async () => {
    const { item, guard } = await fixture();
    const before = await snapshot();
    const original = AiEstimatorKnowledgeMainLineModel.findOneAndUpdate.bind(AiEstimatorKnowledgeMainLineModel);
    for (const failure of [new Error("synthetic storage unavailable"), { code: 11000, keyPattern: { _id: 1 } },
      { code: 11000, keyPattern: { basketId: 1, nameNormalized: 1, unrelatedField: 1 } }]) {
      const spy = vi.spyOn(AiEstimatorKnowledgeMainLineModel, "findOneAndUpdate").mockImplementationOnce((...args) => {
        const query = original(...args);
        vi.spyOn(query, "exec").mockRejectedValueOnce(failure);
        return query;
      });
      await expect(base.item.updateMainLine(actor, item.mainLineId, { expectedVersion: item.version, name: "Unchanged", draftItemGuard: guard }))
        .rejects.toEqual(failure);
      spy.mockRestore();
    }
    expect(await snapshot()).toEqual(before);
  });

  it("removes only the direct target and atomically invalidates incoming source drafts", async () => {
    const { item, other, sibling, foreign, guard } = await fixture();
    const { source, rule, section } = await referencingSource(item, other.id);
    const result = await base.item.permanentlyDeleteMainLine(actor, item.mainLineId, {
      expectedVersion: item.version, reason: "Remove mistaken temporary item", draftItemGuard: guard
    });
    expect(result).toMatchObject({ mainLineId: item.mainLineId, deleted: true });
    for (const model of [AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgePriceVersionModel]) {
      expect(await model.countDocuments({ mainLineId: item.mainLineId })).toBe(0);
    }
    expect(await AiEstimatorKnowledgeMainLineModel.exists({ _id: sibling.mainLineId })).not.toBeNull();
    expect(await AiEstimatorKnowledgeMainLineModel.exists({ _id: foreign.mainLineId })).not.toBeNull();
    expect(await base.item.getSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations"))
      .toMatchObject({ version: section.version + 1, payload: { budgetAlterations: [] } });
    await expect(base.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "recommendations", {
      expectedVersion: section.version, expectedAggregateVersion: section.aggregateVersion, payload: { budgetAlterations: [rule] }
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it.each(["rename", "remove"] as const)("rolls back %s and its reference/aggregate writes on audit failure", async (action) => {
    const { item, other, sibling, guard } = await fixture();
    await referencingSource(item, other.id);
    const before = await snapshot();
    const failure = { code: 11000, keyPattern: { basketId: 1, nameNormalized: 1 }, message: "synthetic audit duplicate" };
    const failing = harness({ appendInMongoTransaction: async () => { throw failure; } });
    const result = action === "rename"
      ? failing.item.updateMainLine(actor, item.mainLineId, { expectedVersion: item.version, name: "Rollback", draftItemGuard: guard })
      : failing.item.permanentlyDeleteMainLine(actor, item.mainLineId, { expectedVersion: item.version, reason: "Rollback", draftItemGuard: guard });
    await expect(result).rejects.toEqual(failure);
    expect(await snapshot()).toEqual(before);
    const group = (await base.reference.listSubBaskets(actor, item.basketId, {}, { limit: 100, offset: 0 })).items[0]!;
    await expect(failing.item.updateMainLine(actor, sibling.mainLineId, { expectedVersion: sibling.version, name: "Grouped rollback",
      draftSubBasketGuard: { subBasketId: group.id, expectedVersion: group.version } })).rejects.toEqual(failure);
    expect(await snapshot()).toEqual(before);
  });

  it.each(["rename", "remove"] as const)("preserves grouped and unguarded mutation behavior while guarding direct %s", async (action) => {
    const { item, sibling, guard } = await fixture();
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: item.mainLineId }, { $set: { status: "inactive" } });
    await expect(action === "rename" ? base.item.updateMainLine(actor, item.mainLineId, { expectedVersion: item.version, name: "Blocked", draftItemGuard: guard })
      : base.item.permanentlyDeleteMainLine(actor, item.mainLineId, { expectedVersion: item.version, reason: "Blocked", draftItemGuard: guard }))
      .rejects.toMatchObject({ code: "ITEM_FROZEN" });
    await expect(action === "rename" ? base.item.updateMainLine(actor, item.mainLineId, { expectedVersion: item.version, name: "Workspace rename" })
      : base.item.permanentlyDeleteMainLine(actor, item.mainLineId, { expectedVersion: item.version, reason: "Workspace removal" })).resolves.toBeDefined();
    const group = (await base.reference.listSubBaskets(actor, sibling.basketId, {}, { limit: 100, offset: 0 })).items[0]!;
    const command = { expectedVersion: sibling.version, draftSubBasketGuard: { subBasketId: group.id, expectedVersion: group.version } };
    await expect(action === "rename" ? base.item.updateMainLine(actor, sibling.mainLineId, { ...command, name: "Grouped rename" })
      : base.item.permanentlyDeleteMainLine(actor, sibling.mainLineId, { ...command, reason: "Grouped removal" })).resolves.toBeDefined();
  });

  it.each(["rename", "remove"] as const)("rejects guarded %s after activation wins without partial writes", async (action) => {
    const { item, guard } = await fixture();
    const ready = await readyTemporary(item);
    const gate = gatedAudit("ai_estimator_knowledge_revision_activated");
    const activation = harness(gate.audit).item.activate(actor, ready.mainLineId, ready.draftRevisionId!, { expectedVersion: ready.version });
    await gate.entered;
    const mutation = action === "rename" ? base.item.updateMainLine(actor, ready.mainLineId, { expectedVersion: ready.version, name: "Too late", draftItemGuard: guard })
      : base.item.permanentlyDeleteMainLine(actor, ready.mainLineId, { expectedVersion: ready.version, reason: "Too late", draftItemGuard: guard });
    await new Promise<void>((resolve) => setImmediate(resolve));
    gate.release();
    const [activated, mutated] = await Promise.allSettled([activation, mutation]);
    expect(activated).toMatchObject({ status: "fulfilled", value: { status: "active" } });
    expect(mutated).toMatchObject({ status: "rejected", reason: { code: "VERSION_CONFLICT" } });
    expect(await AiEstimatorKnowledgeMainLineModel.findById(ready.mainLineId).lean())
      .toMatchObject({ status: "active", name: item.mainLineName, version: ready.version + 1 });
    expect(await AuditEventModel.countDocuments({ entityId: item.mainLineId, action: { $in: ["ai_estimator_knowledge_main_line_updated", "ai_estimator_knowledge_main_line_permanently_deleted"] } })).toBe(0);
  });

  it.each(["rename", "remove"] as const)("serializes %s before activation and preserves the winner", async (action) => {
    const { item, guard } = await fixture();
    const ready = await readyTemporary(item);
    const gate = gatedAudit(action === "rename" ? "ai_estimator_knowledge_main_line_updated" : "ai_estimator_knowledge_main_line_permanently_deleted");
    const gated = harness(gate.audit);
    const mutation = action === "rename" ? gated.item.updateMainLine(actor, ready.mainLineId, { expectedVersion: ready.version, name: "Won rename", draftItemGuard: guard })
      : gated.item.permanentlyDeleteMainLine(actor, ready.mainLineId, { expectedVersion: ready.version, reason: "Won removal", draftItemGuard: guard });
    await gate.entered;
    const activation = base.item.activate(actor, ready.mainLineId, ready.draftRevisionId!, { expectedVersion: ready.version });
    await new Promise<void>((resolve) => setImmediate(resolve));
    gate.release();
    const [mutated, activated] = await Promise.allSettled([mutation, activation]);
    expect(mutated.status).toBe("fulfilled");
    expect(activated).toMatchObject({ status: "rejected", reason: { code: action === "rename" ? "VERSION_CONFLICT" : "NOT_FOUND" } });
    const current = await AiEstimatorKnowledgeMainLineModel.findById(ready.mainLineId).lean();
    if (action === "rename") expect(current).toMatchObject({ status: "draft", name: "Won rename", version: ready.version + 1 });
    else expect(current).toBeNull();
  });
});
