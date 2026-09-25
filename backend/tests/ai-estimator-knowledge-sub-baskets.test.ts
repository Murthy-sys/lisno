import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor = { id: "super-admin", name: "Test Admin", email: "admin@example.invalid", role: "super_admin" as const };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("knowledge-sub-baskets");
  await Promise.all([AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeMainLineModel,
    AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgeDisplayOrderSequenceModel,
    AiEstimatorKnowledgeUomModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica.stop(); }, 30_000);

function harness() {
  const audit = { appendInMongoTransaction: vi.fn(async () => ({ id: "audit" }) as never) };
  const actorGuard = { requireReadActor: vi.fn(async () => actor), requireMutationActor: vi.fn(async () => actor) };
  return { audit, actorGuard, references: createAiEstimatorKnowledgeReferenceService({ audit, actorGuard }), items: createAiEstimatorKnowledgeItemService({ audit, actorGuard }) };
}

describe("Sub Basket relationships on a Mongo replica set", () => {
  it("creates or reuses a typed name only within its selected Main Basket", async () => {
    const { references, items, audit } = harness();
    const a = await references.createBasket(actor, { name: "A" });
    const b = await references.createBasket(actor, { name: "B" });
    const first = await items.createMainLine(actor, a.id, { name: "First", subBasketName: "  Wall   finishes  " });
    const reused = await items.createMainLine(actor, a.id, { name: "Second", subBasketName: "WALL finishes" });
    const other = await items.createMainLine(actor, b.id, { name: "Third", subBasketName: "Wall finishes" });
    expect(first.subBasketName).toBe("Wall finishes");
    expect(first.subBasketId).toBe(reused.subBasketId);
    expect(other.subBasketId).not.toBe(first.subBasketId);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(2);
    expect((audit.appendInMongoTransaction.mock.calls as unknown as [{ action: string }][]).filter(([entry]) => entry.action === "ai_estimator_knowledge_sub_basket_created")).toHaveLength(2);
    await expect(items.getItem(actor, first.mainLineId)).resolves.toMatchObject({ basketId: a.id, subBasketId: first.subBasketId, subBasketName: "Wall finishes" });
  });

  it("resolves concurrent typed names to one Sub Basket and rolls back a new child when the Main Line fails", async () => {
    const { references, items } = harness();
    const basket = await references.createBasket(actor, { name: "A" });
    const lines = await Promise.all(["First", "Second"].map((name) => items.createMainLine(actor, basket.id, { name, subBasketName: "Walls" })));
    expect(lines[0].subBasketId).toBe(lines[1].subBasketId);
    await expect(items.createMainLine(actor, basket.id, { name: "First", subBasketName: "Must roll back" })).rejects.toBeDefined();
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(2);
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments()).toBe(2);
  });

  it("rejects blank names, ambiguous name/ID input, and typed names under inactive parents", async () => {
    const { references, items } = harness();
    const basket = await references.createBasket(actor, { name: "A" });
    for (const input of [{ name: "Invalid", subBasketName: "  " }, { name: "Invalid", subBasketName: "Walls", subBasketId: "child" }]) {
      await expect(items.createMainLine(actor, basket.id, input)).rejects.toMatchObject({ status: 400 });
    }
    await references.updateBasket(actor, basket.id, { expectedVersion: basket.version, status: "inactive" });
    await expect(items.createMainLine(actor, basket.id, { name: "Invalid", subBasketName: "Walls" })).rejects.toMatchObject({ status: 400 });
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
  });

  it("scopes normalized names and pagination to the parent and rejects concurrent duplicates", async () => {
    const { references } = harness();
    const a = await references.createBasket(actor, { name: "Carpentry" });
    const b = await references.createBasket(actor, { name: "Painting" });
    const first = await references.createSubBasket(actor, a.id, { name: " Wall   finishes " });
    const second = await references.createSubBasket(actor, b.id, { name: "Wall finishes" });
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ basketId: a.id, name: "Wall finishes", displayOrder: 0 });
    await expect(references.createSubBasket(actor, a.id, { name: "WALL finishes" })).rejects.toMatchObject({ status: 409 });
    const results = await Promise.allSettled([1, 2].map(() => references.createSubBasket(actor, a.id, { name: "Doors" })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(references.listSubBaskets(actor, a.id, {}, { limit: 1, offset: 1 })).resolves.toMatchObject({ total: 2, items: [{ name: "Doors", basketId: a.id, displayOrder: 1 }] });
    await expect(references.listSubBaskets(actor, b.id, { search: "wall" }, { limit: 100, offset: 0 })).resolves.toMatchObject({ total: 1, items: [{ id: second.id }] });
  });

  it("renames only a version-current Draft Sub Basket and preserves stable identity", async () => {
    const { references, items, audit } = harness();
    const a = await references.createBasket(actor, { name: "Electrical" });
    const b = await references.createBasket(actor, { name: "Other" });
    const child = await references.createSubBasket(actor, a.id, { name: "Functional Lights Supply" });
    const line = await items.createMainLine(actor, a.id, {
      name: "Lights Supply and Installation",
      subBasketId: child.id
    });
    const before = (await references.listSubBaskets(actor, a.id, {}, { limit: 20, offset: 0 })).items[0]!;
    expect(before).toMatchObject({ id: child.id, version: 2 });

    const updated = await references.updateSubBasket(actor, a.id, child.id, {
      expectedVersion: before.version,
      name: "  Ｆａｌｓｅ   Ceiling Lights  "
    });
    expect(updated).toMatchObject({
      id: child.id,
      basketId: a.id,
      name: "False Ceiling Lights",
      version: 3
    });
    expect((await items.getItem(actor, line.mainLineId)).subBasketName).toBe("False Ceiling Lights");
    expect(audit.appendInMongoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      action: "ai_estimator_knowledge_sub_basket_updated",
      entityId: child.id,
      oldValues: expect.objectContaining({ name: "Functional Lights Supply", version: 2 }),
      newValues: expect.objectContaining({ name: "False Ceiling Lights", version: 3 })
    }), expect.anything());

    await expect(references.updateSubBasket(actor, a.id, child.id, {
      expectedVersion: before.version,
      name: "Stale rename"
    })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    await expect(references.updateSubBasket(actor, b.id, child.id, {
      expectedVersion: updated.version,
      name: "Wrong parent"
    })).rejects.toMatchObject({ status: 409, code: "SUB_BASKET_PARENT_MISMATCH" });
    await expect(references.updateSubBasket(actor, a.id, "missing-sub-basket", {
      expectedVersion: 1,
      name: "Missing"
    })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    await references.createSubBasket(actor, a.id, { name: "Duplicate target" });
    await expect(references.updateSubBasket(actor, a.id, child.id, {
      expectedVersion: updated.version,
      name: "DUPLICATE target"
    })).rejects.toMatchObject({ status: 409, code: "DUPLICATE_IDENTITY" });

    await AiEstimatorKnowledgeMainLineModel.updateOne(
      { _id: line.mainLineId },
      { $set: { status: "inactive" } }
    ).exec();
    await expect(references.updateSubBasket(actor, a.id, child.id, {
      expectedVersion: updated.version,
      name: "Frozen rename"
    })).rejects.toMatchObject({ status: 409, code: "SUB_BASKET_FROZEN" });
    await expect(references.listSubBaskets(actor, a.id, {}, { limit: 20, offset: 0 }))
      .resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({
        id: child.id,
        name: "False Ceiling Lights",
        version: 3
      })]) });
  });

  it("guards Draft child edits and removals while advancing the Sub Basket aggregate", async () => {
    const { references, items, audit } = harness();
    const basket = await references.createBasket(actor, { name: "Electrical" });
    const temporary = await items.createMainLine(actor, basket.id, {
      name: "Functional lights supply",
      itemType: "temporary",
      subBasketName: "False Ceiling Lights"
    });
    const subBasketId = temporary.subBasketId!;
    let group = (await references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items[0]!;
    expect(group.version).toBe(2);

    const renamedTemporary = await items.updateMainLine(actor, temporary.mainLineId, {
      expectedVersion: temporary.version,
      name: "False Ceiling Lights Supply",
      draftSubBasketGuard: { subBasketId, expectedVersion: group.version }
    });
    group = (await references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items[0]!;
    expect(group.version).toBe(3);
    expect(renamedTemporary).toMatchObject({
      mainLineId: temporary.mainLineId,
      mainLineName: "False Ceiling Lights Supply",
      itemType: "temporary",
      version: 2
    });

    await expect(items.updateMainLine(actor, temporary.mainLineId, {
      expectedVersion: renamedTemporary.version,
      name: "Stale group edit",
      draftSubBasketGuard: { subBasketId, expectedVersion: 2 }
    })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });

    const otherGroup = await references.createSubBasket(actor, basket.id, { name: "Other group" });
    await expect(items.updateMainLine(actor, temporary.mainLineId, {
      expectedVersion: renamedTemporary.version,
      name: "Wrong group edit",
      draftSubBasketGuard: { subBasketId: otherGroup.id, expectedVersion: otherGroup.version }
    })).rejects.toMatchObject({ status: 409, code: "SUB_BASKET_PARENT_MISMATCH" });

    const catalog = await items.createMainLine(actor, basket.id, {
      name: "12 Watt Downlight",
      subBasketId
    });
    group = (await references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items.find(({ id }) => id === subBasketId)!;
    expect(group.version).toBe(4);
    const renamedCatalog = await items.updateMainLine(actor, catalog.mainLineId, {
      expectedVersion: catalog.version,
      name: "15 Watt Downlight",
      draftSubBasketGuard: { subBasketId, expectedVersion: group.version }
    });
    group = (await references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items.find(({ id }) => id === subBasketId)!;
    expect(group.version).toBe(5);

    await AiEstimatorKnowledgeMainLineModel.updateOne(
      { _id: temporary.mainLineId },
      { $set: { status: "inactive" } }
    ).exec();
    await expect(items.permanentlyDeleteMainLine(actor, catalog.mainLineId, {
      expectedVersion: renamedCatalog.version,
      reason: "Must be blocked by frozen sibling",
      draftSubBasketGuard: { subBasketId, expectedVersion: group.version }
    })).rejects.toMatchObject({ status: 409, code: "SUB_BASKET_FROZEN" });
    expect(await AiEstimatorKnowledgeMainLineModel.exists({ _id: catalog.mainLineId })).not.toBeNull();

    await AiEstimatorKnowledgeMainLineModel.updateOne(
      { _id: temporary.mainLineId },
      { $set: { status: "draft" } }
    ).exec();
    await items.permanentlyDeleteMainLine(actor, catalog.mainLineId, {
      expectedVersion: renamedCatalog.version,
      reason: "Remove mistaken Draft child",
      draftSubBasketGuard: { subBasketId, expectedVersion: group.version }
    });
    group = (await references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items.find(({ id }) => id === subBasketId)!;
    expect(group.version).toBe(6);
    expect(await AiEstimatorKnowledgeMainLineModel.exists({ _id: catalog.mainLineId })).toBeNull();
    expect(audit.appendInMongoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      action: "ai_estimator_knowledge_main_line_permanently_deleted",
      entityId: catalog.mainLineId,
      oldValues: expect.objectContaining({ subBasketId, subBasketVersion: 5, resultingSubBasketVersion: 6 })
    }), expect.anything());

    const duplicate = await items.duplicate(actor, temporary.mainLineId, {
      expectedVersion: renamedTemporary.version,
      name: "Duplicate Draft child"
    });
    group = (await references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items.find(({ id }) => id === subBasketId)!;
    expect(group.version).toBe(7);
    const unguarded = await items.updateMainLine(actor, duplicate.mainLineId, {
      expectedVersion: duplicate.version,
      name: "Main workspace rename"
    });
    group = (await references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items.find(({ id }) => id === subBasketId)!;
    expect(group.version).toBe(8);
    await items.permanentlyDeleteMainLine(actor, duplicate.mainLineId, {
      expectedVersion: unguarded.version,
      reason: "Main workspace delete remains compatible"
    });
    group = (await references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items.find(({ id }) => id === subBasketId)!;
    expect(group.version).toBe(9);
  });

  it("serializes Sub Basket rename behind a real activation and advances deactivation", async () => {
    const base = harness();
    const basket = await base.references.createBasket(actor, { name: "Electrical" });
    const ready = await createActivationReadyTemporary(
      base.items,
      basket.id,
      "Activation race child",
      "Activation race group"
    );
    const group = (await base.references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items[0]!;
    expect(group.version).toBe(2);

    const gate = createGatedAudit("ai_estimator_knowledge_revision_activated");
    const activatingItems = createAiEstimatorKnowledgeItemService({
      audit: gate.audit,
      actorGuard: base.actorGuard
    });
    const activation = activatingItems.activate(
      actor,
      ready.mainLineId,
      ready.draftRevisionId!,
      { expectedVersion: ready.version }
    );
    await gate.entered;
    const losingRename = base.references.updateSubBasket(actor, basket.id, group.id, {
      expectedVersion: group.version,
      name: "Must not rename after activation"
    });
    await nextEventLoopTurn();
    gate.release();

    const [activationResult, renameResult] = await Promise.allSettled([activation, losingRename]);
    expect(activationResult).toMatchObject({ status: "fulfilled", value: { status: "active" } });
    expect(renameResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: expect.stringMatching(/^(?:VERSION_CONFLICT|SUB_BASKET_FROZEN)$/u) }
    });
    const afterActivation = (await base.references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items[0]!;
    expect(afterActivation).toMatchObject({ id: group.id, name: "Activation race group", version: 3 });

    const active = await base.items.getItem(actor, ready.mainLineId);
    await base.items.deactivate(actor, ready.mainLineId, {
      expectedVersion: active.version,
      reason: "Verify aggregate lifecycle coordination"
    });
    await expect(base.references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 }))
      .resolves.toMatchObject({ items: [expect.objectContaining({ id: group.id, version: 4 })] });
  });

  it("serializes guarded child removal behind a real activation without partial deletion", async () => {
    const base = harness();
    const basket = await base.references.createBasket(actor, { name: "Electrical" });
    const ready = await createActivationReadyTemporary(
      base.items,
      basket.id,
      "Removal race child",
      "Removal race group"
    );
    const group = (await base.references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 })).items[0]!;

    const gate = createGatedAudit("ai_estimator_knowledge_revision_activated");
    const activatingItems = createAiEstimatorKnowledgeItemService({
      audit: gate.audit,
      actorGuard: base.actorGuard
    });
    const activation = activatingItems.activate(
      actor,
      ready.mainLineId,
      ready.draftRevisionId!,
      { expectedVersion: ready.version }
    );
    await gate.entered;
    const losingRemoval = base.items.permanentlyDeleteMainLine(actor, ready.mainLineId, {
      expectedVersion: ready.version,
      reason: "Exercise activation-first removal race",
      draftSubBasketGuard: { subBasketId: group.id, expectedVersion: group.version }
    });
    await nextEventLoopTurn();
    gate.release();

    const [activationResult, removalResult] = await Promise.allSettled([activation, losingRemoval]);
    expect(activationResult.status).toBe("fulfilled");
    expect(removalResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: expect.stringMatching(/^(?:VERSION_CONFLICT|SUB_BASKET_FROZEN)$/u) }
    });
    expect(await AiEstimatorKnowledgeMainLineModel.findById(ready.mainLineId).lean())
      .toMatchObject({ status: "active", version: ready.version + 1 });
    await expect(base.references.listSubBaskets(actor, basket.id, {}, { limit: 20, offset: 0 }))
      .resolves.toMatchObject({ items: [expect.objectContaining({ id: group.id, version: group.version + 1 })] });
  });

  it("persists both IDs through reads and duplication, retaining legacy unassigned items", async () => {
    const { references, items, audit } = harness();
    const basket = await references.createBasket(actor, { name: "Carpentry" });
    const child = await references.createSubBasket(actor, basket.id, { name: "Doors" });
    const line = await items.createMainLine(actor, basket.id, { name: "Flush door", subBasketId: child.id });
    const mapping = { basketId: basket.id, subBasketId: child.id, subBasketName: "Doors" };
    expect(line).toMatchObject(mapping);
    await expect(items.getItem(actor, line.mainLineId)).resolves.toMatchObject(mapping);
    await expect(items.listItems(actor, { basketId: basket.id }, { limit: 20, offset: 0 })).resolves.toMatchObject({ items: [mapping] });
    await expect(items.listMainLines(actor, basket.id, {}, { limit: 20, offset: 0 })).resolves.toMatchObject({ items: [{ subBasketId: child.id }] });
    await expect(items.duplicate(actor, line.mainLineId, { expectedVersion: line.version })).resolves.toMatchObject(mapping);
    const legacy = await items.createMainLine(actor, basket.id, { name: "Legacy" });
    expect(legacy).toMatchObject({ subBasketId: null, subBasketName: null });
    await expect(items.duplicate(actor, legacy.mainLineId, { expectedVersion: legacy.version })).resolves.toMatchObject({ subBasketId: null });
    expect(audit.appendInMongoTransaction).toHaveBeenCalledWith(expect.objectContaining({ action: "ai_estimator_knowledge_main_line_created", newValues: expect.objectContaining({ basketId: basket.id, subBasketId: child.id }) }), expect.anything());
  });

  it("rejects a different parent's child, missing children, and inactive parents without partial writes", async () => {
    const { references, items, audit } = harness();
    const a = await references.createBasket(actor, { name: "A" });
    const b = await references.createBasket(actor, { name: "B" });
    const child = await references.createSubBasket(actor, b.id, { name: "Doors" });
    const count = audit.appendInMongoTransaction.mock.calls.length;
    for (const subBasketId of [child.id, "missing-child"]) {
      await expect(items.createMainLine(actor, a.id, { name: "Invalid", subBasketId })).rejects.toMatchObject({ status: 400 });
    }
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments()).toBe(0);
    expect(audit.appendInMongoTransaction).toHaveBeenCalledTimes(count);
    await references.updateBasket(actor, b.id, { expectedVersion: b.version, status: "inactive" });
    await expect(references.createSubBasket(actor, b.id, { name: "New" })).rejects.toMatchObject({ status: 404 });
    await expect(items.createMainLine(actor, b.id, { name: "Invalid", subBasketId: child.id })).rejects.toMatchObject({ status: 400 });
  });

  it("reports and atomically removes children and Main Lines, preserving another parent", async () => {
    const { references, items } = harness();
    const a = await references.createBasket(actor, { name: "A" });
    const b = await references.createBasket(actor, { name: "B" });
    const child = await references.createSubBasket(actor, a.id, { name: "Doors" });
    await references.createSubBasket(actor, b.id, { name: "Doors" });
    await items.createMainLine(actor, a.id, { name: "Door", subBasketId: child.id });
    await expect(references.getBasketDeletionImpact(actor, a.id)).resolves.toMatchObject({ mainLineCount: 1, subBasketCount: 1 });
    await references.permanentlyDeleteBasket(actor, a.id, { expectedVersion: a.version, confirmationName: a.name, reason: "Remove test basket" });
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments({ basketId: a.id })).toBe(0);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({ basketId: a.id })).toBe(0);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments({ basketId: b.id })).toBe(1);
  });

  it("serializes parent deletion against simultaneous child creation and Main Line attachment", async () => {
    const { references, items } = harness();
    const a = await references.createBasket(actor, { name: "A" });
    const child = await references.createSubBasket(actor, a.id, { name: "Doors" });
    const results = await Promise.allSettled([
      references.createSubBasket(actor, a.id, { name: "Walls" }),
      items.createMainLine(actor, a.id, { name: "Door", subBasketId: child.id }),
      references.permanentlyDeleteBasket(actor, a.id, { expectedVersion: a.version, confirmationName: a.name, reason: "Remove test basket" })
    ]);
    expect(results[2].status).toBe("fulfilled");
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({ _id: a.id })).toBe(0);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments({ basketId: a.id })).toBe(0);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({ basketId: a.id })).toBe(0);
  });
});

async function createActivationReadyTemporary(
  items: ReturnType<typeof createAiEstimatorKnowledgeItemService>,
  basketId: string,
  name: string,
  subBasketName: string
) {
  if (!await AiEstimatorKnowledgeUomModel.exists({ _id: "uom-unit" })) {
    await AiEstimatorKnowledgeUomModel.create({
      _id: "uom-unit",
      code: "UNIT",
      codeNormalized: "unit",
      name: "Unit",
      nameNormalized: "unit",
      description: null,
      decimalScale: 0,
      displayOrder: 0,
      status: "active",
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      archivedAt: null,
      archivedById: null
    });
  }
  let detail = await items.createMainLine(actor, basketId, {
    name,
    itemType: "temporary",
    subBasketName
  });
  const revisionId = detail.draftRevisionId!;
  const overview = await items.getSection(actor, detail.mainLineId, revisionId, "overview");
  await items.updateSection(actor, detail.mainLineId, revisionId, "overview", {
    expectedVersion: overview.version,
    expectedAggregateVersion: detail.version,
    payload: { uomId: "uom-unit" }
  });
  detail = await items.getItem(actor, detail.mainLineId);
  const advanced = await items.getSection(actor, detail.mainLineId, revisionId, "advanced");
  await items.updateSection(actor, detail.mainLineId, revisionId, "advanced", {
    expectedVersion: advanced.version,
    expectedAggregateVersion: detail.version,
    payload: {}
  });
  return items.getItem(actor, detail.mainLineId);
}

function createGatedAudit(action: string) {
  let markEntered!: () => void;
  let releaseGate!: () => void;
  const entered = new Promise<void>((resolve) => { markEntered = resolve; });
  const released = new Promise<void>((resolve) => { releaseGate = resolve; });
  let gated = false;
  return {
    entered,
    release: releaseGate,
    audit: {
      appendInMongoTransaction: vi.fn(async (entry: { action: string }) => {
        if (!gated && entry.action === action) {
          gated = true;
          markEntered();
          await released;
        }
        return { id: "audit" } as never;
      })
    }
  };
}

async function nextEventLoopTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
