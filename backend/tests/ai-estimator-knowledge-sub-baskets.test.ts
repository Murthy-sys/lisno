import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor = { id: "super-admin", name: "Test Admin", email: "admin@example.invalid", role: "super_admin" as const };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("knowledge-sub-baskets");
  await Promise.all([AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeMainLineModel,
    AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgeDisplayOrderSequenceModel].map((model) => model.syncIndexes()));
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
