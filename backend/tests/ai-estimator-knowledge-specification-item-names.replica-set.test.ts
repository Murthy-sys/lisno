import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS } from "../src/domain/ai-estimator-knowledge.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAiEstimatorKnowledgeSpecificationItemNameService } from "../src/services/ai-estimator-knowledge-specification-item-name.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-10-30T06:30:00.000Z");
const ACTOR: PublicUser = { id: "item-name-admin", name: "Item Name Administrator", email: "item-name-admin@example.invalid", role: "super_admin" };
const metadata = { version: 1, createdById: ACTOR.id, updatedById: ACTOR.id, createdAt: NOW, updatedAt: NOW };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const catalog = () => createAiEstimatorKnowledgeSpecificationItemNameService();

beforeAll(async () => {
  replica = await startMongoReplicaSet("specification-item-names");
  await Promise.all([AiEstimatorKnowledgeMainLineModel.syncIndexes(), AiEstimatorKnowledgeRevisionModel.syncIndexes(), AiEstimatorKnowledgeSectionModel.syncIndexes()]);
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  await storedActor(ACTOR);
});
afterAll(async () => { await replica?.stop(); });

describe("current saved specification item names", { timeout: 30_000 }, () => {
  it("collects only current owned applicable names across lines, temporary items and all tiers without rewriting legacy rows", async () => {
    const first = await source("first", ["  Plywood ", "plywood", "ＡＢＣ", "", "  ", null, 42, "x".repeat(241)], {
      tiers: ["signature", "premium", "functional"],
      premium: ["Oak veneer"], functional: ["MDF board"]
    });
    await source("temporary", ["Tile adhesive"], { itemType: "temporary" });
    await source("inactive", ["Gypsum board"], { status: "inactive" });
    await source("additional-only", ["Hidden signature"], { rootApplicability: "not_applicable", tiers: ["premium", "functional"], premium: ["Marine ply"], functional: ["Hidden functional"], functionalApplicability: "not_applicable" });
    await source("deselected", ["Deselected signature"], { tiers: [], premium: ["Deselected premium"] });
    await source("archived", ["Archived label"], { status: "archived" });
    await source("active-only", ["Active oak"], { revisionStatus: "active" });
    await source("missing-array", []);
    await revision("first-old", "first", "active", ["Old active name"], 2);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "first" }, { $set: { activeRevisionId: "first-old" } });
    await revision("orphan-history", "removed-line", "superseded", ["Orphan historical name"], 1);
    const before = await AiEstimatorKnowledgeSectionModel.findById(`${first}-pricing`).lean();
    const result = await catalog().list(ACTOR);
    expect(result.items).toEqual(["ＡＢＣ", "Active oak", "Gypsum board", "Marine ply", "MDF board", "Oak veneer", "Plywood", "Tile adhesive"].map(name => ({ name })));
    expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 8, hasMore: false });
    expect(result.exactMatch).toBeNull();
    expect(result.similarItems).toEqual([]);
    expect(await AiEstimatorKnowledgeSectionModel.findById(`${first}-pricing`).lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("deduplicates, searches and counts before paging while candidate checks inspect the entire catalog", async () => {
    await source("many", [...Array.from({ length: 27 }, (_, index) => `Board ${String(index).padStart(2, "0")}`), "Plywood", "plywood", "PLYWOOD"]);
    const first = await catalog().list(ACTOR, { limit: 10, search: "BOARD" });
    const second = await catalog().list(ACTOR, { limit: 10, offset: 10, search: " board " });
    const third = await catalog().list(ACTOR, { limit: 10, offset: 20, search: "board" });
    expect(first.pagination).toEqual({ limit: 10, offset: 0, total: 27, hasMore: true });
    expect([...first.items, ...second.items, ...third.items]).toHaveLength(27);
    expect(new Set([...first.items, ...second.items, ...third.items].map(item => item.name)).size).toBe(27);
    expect(third.pagination.hasMore).toBe(false);
    const exact = await catalog().list(ACTOR, { search: "nothing matches", offset: 100, checkName: "  plywood " });
    expect(exact.items).toEqual([]);
    expect(exact.pagination.total).toBe(0);
    expect(exact.exactMatch).toEqual({ name: "PLYWOOD" });
    const similar = await catalog().list(ACTOR, { search: "Board", limit: 1, checkName: "Plywod" });
    expect(similar.exactMatch).toBeNull();
    expect(similar.similarItems).toEqual([{ name: "PLYWOOD" }]);
  });

  it.each(["missing", "wrong-owner", "wrong-status", "foreign-section"])("rejects a %s current draft without falling back to active names", async corruption => {
    const current = await source("broken", ["Draft value"]);
    await revision("broken-active", "broken", "active", ["Do not fall back"], 2);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "broken" }, { $set: { activeRevisionId: "broken-active" } });
    if (corruption === "missing") await AiEstimatorKnowledgeRevisionModel.collection.deleteOne({ _id: current });
    if (corruption === "wrong-owner") await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: current }, { $set: { mainLineId: "another-line" } });
    if (corruption === "wrong-status") await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: current }, { $set: { status: "active" } });
    if (corruption === "foreign-section") await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: `${current}-pricing` }, { $set: { mainLineId: "another-line" } });
    await expect(catalog().list(ACTOR)).rejects.toMatchObject({ status: 409, code: "KNOWLEDGE_ITEM_NAMES_UNAVAILABLE" });
  });

  it("derives shared names only after a successful existing section transaction and preserves its CAS validation", async () => {
    const revisionId = await source("save-boundary", []);
    const item = createAiEstimatorKnowledgeItemService({ audit: createAuditService(createMemoryRepository()), now: () => NOW });
    const draft = { specifications: [{ id: "spec-stable", name: "Acoustic felt", description: "Keep this description", brandIds: [] }] };
    expect((await catalog().list(ACTOR)).items).toEqual([]);
    const saved = await item.updateSection(ACTOR, "save-boundary", revisionId, "pricing", { expectedVersion: 1, expectedAggregateVersion: 1, payload: draft });
    expect(saved.payload.specifications).toEqual(draft.specifications);
    expect((await catalog().list(ACTOR)).items).toEqual([{ name: "Acoustic felt" }]);
    await expect(item.updateSection(ACTOR, "save-boundary", revisionId, "pricing", { expectedVersion: 1, expectedAggregateVersion: 1, payload: { specifications: [{ id: "spec-stable", name: "Uncommitted name" }] } })).rejects.toMatchObject({ status: 409 });
    await expect(item.updateSection(ACTOR, "save-boundary", revisionId, "pricing", { expectedVersion: saved.version, expectedAggregateVersion: saved.aggregateVersion, payload: { specifications: [{ id: "spec-a", name: "Duplicate" }, { id: "spec-b", name: " DUPLICATE " }] } })).rejects.toMatchObject({ status: 400 });
    expect((await catalog().list(ACTOR)).items).toEqual([{ name: "Acoustic felt" }]);
    await source("other-line", ["Acoustic felt"]);
    expect((await catalog().list(ACTOR)).pagination.total).toBe(1);
    await AiEstimatorKnowledgeMainLineModel.collection.deleteOne({ _id: "save-boundary" });
    await AiEstimatorKnowledgeMainLineModel.collection.deleteOne({ _id: "other-line" });
    expect((await catalog().list(ACTOR)).items).toEqual([]);
  });

  it("checks stored active sole-admin identity before revealing any names", async () => {
    await source("private", ["Internal name"]);
    for (const role of ["procurement", "program_manager", "vendor"] as const) {
      const actor = { ...ACTOR, id: `actor-${role}`, role };
      await storedActor(actor);
      await expect(catalog().list(actor)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    }
    await expect(catalog().list({ ...ACTOR, role: "admin" })).rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    await UserModel.collection.updateOne({ _id: ACTOR.id }, { $set: { active: false } });
    await expect(catalog().list(ACTOR)).rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    await UserModel.collection.updateOne({ _id: ACTOR.id }, { $set: { active: true } });
    await storedActor({ ...ACTOR, id: "second-admin" });
    await expect(catalog().list(ACTOR)).rejects.toMatchObject({ status: 409, code: "SOLE_SUPER_ADMIN_REQUIRED" });
  });
});

interface SourceOptions {
  tiers?: unknown[];
  premium?: unknown[];
  functional?: unknown[];
  rootApplicability?: string;
  functionalApplicability?: string;
  itemType?: string;
  status?: string;
  revisionStatus?: "draft" | "active";
}

// Native inserts deliberately include malformed legacy rows that the write validator would reject.
async function source(id: string, names: unknown[], options: SourceOptions = {}) {
  const revisionId = `${id}-current`;
  const revisionStatus = options.revisionStatus ?? "draft";
  await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: id, basketId: "synthetic-basket", name: id, nameNormalized: id, displayOrder: 0,
    itemType: options.itemType ?? "main_line", status: options.status ?? "draft", draftRevisionId: revisionStatus === "draft" ? revisionId : null,
    activeRevisionId: revisionStatus === "active" ? revisionId : null, ...metadata });
  await revision(revisionId, id, revisionStatus, names, 1, options);
  return revisionId;
}

async function revision(id: string, mainLineId: string, status: string, names: unknown[], revisionNumber: number, options: SourceOptions = {}) {
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: id, mainLineId, status, revisionNumber, completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }, ...metadata });
  const specifications = (values: unknown[]) => values.map((name, index) => ({ id: `spec-${index}`, name }));
  const tiers = {
    ...(options.premium ? { premium: { applicability: "configured", payload: { specifications: specifications(options.premium) } } } : {}),
    ...(options.functional ? { functional: { applicability: options.functionalApplicability ?? "configured", payload: { specifications: specifications(options.functional) } } } : {})
  };
  await AiEstimatorKnowledgeSectionModel.collection.insertMany(AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map(sectionKey => ({
    _id: `${id}-${sectionKey}`, mainLineId, revisionId: id, sectionKey,
    applicability: sectionKey === "pricing" ? options.rootApplicability ?? "configured" : sectionKey === "overview" ? "configured" : "not_configured",
    payload: sectionKey === "pricing" ? { specifications: specifications(names), ...(Object.keys(tiers).length ? { tierConfigurations: tiers } : {}) }
      : sectionKey === "overview" ? options.tiers === undefined ? {} : { applicableTiers: options.tiers } : {},
    ...metadata
  })));
}

async function storedActor(actor: PublicUser) {
  await UserModel.collection.insertOne({ _id: actor.id, role: actor.role, active: true, name: actor.name, email: `${actor.id}@example.invalid`, emailNormalized: `${actor.id}@example.invalid`, passwordHash: "synthetic-not-used", accountKind: "standard", ...metadata });
}
