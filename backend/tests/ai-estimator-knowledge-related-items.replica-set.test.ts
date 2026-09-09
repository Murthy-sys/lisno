import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { KnowledgeBudgetAlteration } from "../src/contracts/ai-estimator-knowledge.js";
import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS } from "../src/domain/ai-estimator-knowledge.js";
import { errorHandler } from "../src/middleware/errors.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeAdminRouter } from "../src/routes/ai-estimator-knowledge-admin.js";
import { createAiEstimatorKnowledgeContextService } from "../src/services/ai-estimator-knowledge-context.service.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-09-09T10:00:00.000Z");
const PREFIX = "/api/v1/admin/ai-estimator-knowledge";
const ACTOR: PublicUser = {
  id: "related-item-super-admin", name: "Related Item Administrator",
  email: "related-admin@example.invalid", role: "super_admin"
};
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let sequence = 0;
let services: ReturnType<typeof createServices>;
let electricalId: string;
let ceilingId: string;

beforeAll(async () => {
  replica = await startMongoReplicaSet("ai-estimator-knowledge-related-items");
  await Promise.all([
    AuditEventModel.syncIndexes(), AiEstimatorKnowledgeBasketModel.syncIndexes(),
    AiEstimatorKnowledgeDisplayOrderSequenceModel.syncIndexes(),
    AiEstimatorKnowledgeMainLineModel.syncIndexes(), AiEstimatorKnowledgeRevisionModel.syncIndexes(),
    AiEstimatorKnowledgeSectionModel.syncIndexes(), AiEstimatorKnowledgeSubBasketModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  sequence = 0;
  await replica.clear();
  await UserModel.create({
    _id: ACTOR.id, name: ACTOR.name, email: ACTOR.email, emailNormalized: ACTOR.email,
    passwordHash: "$2b$10$relatedItemTestHashNotUsedByAuthentication", role: ACTOR.role,
    active: true, accountKind: "standard", version: 1, sessionVersion: 1,
    managerId: null, authorizedClientIds: []
  });
  services = createServices();
  electricalId = (await services.reference.createBasket(ACTOR, { name: "Electrical" })).id;
  ceilingId = (await services.reference.createBasket(ACTOR, { name: "POP / Gypsum" })).id;
});

afterAll(async () => { await replica?.stop(); });

describe("Related item catalog and rule persistence", { timeout: 30_000 }, () => {
  it("creates an audited draft through HTTP, saves and reloads its real ID, and reuses it from another source", async () => {
    const app = appFor();
    const created = await request(app).post(`${PREFIX}/baskets/${electricalId}/main-lines`)
      .set("Authorization", "Bearer synthetic-token")
      .send({ name: "Recessed LED downlight", subBasketName: "Ceiling lighting" });
    expect(created.status).toBe(201);
    const target = created.body.data;
    expect(target).toMatchObject({
      id: expect.any(String), mainLineId: expect.any(String), status: "draft", itemType: "main_line",
      basketId: electricalId, subBasketId: expect.any(String), subBasketName: "Ceiling lighting",
      mainLineName: "Recessed LED downlight", activeRevisionId: null,
      createdById: ACTOR.id, updatedById: ACTOR.id
    });
    expect(target.id).toBe(target.mainLineId);
    const targetAudit = await AuditEventModel.findOne({
      entityId: target.mainLineId, action: "ai_estimator_knowledge_main_line_created"
    }).lean();
    expect(targetAudit).toMatchObject({
      actorId: ACTOR.id,
      newValues: { basketId: electricalId, subBasketId: target.subBasketId, itemType: "main_line", revisionId: target.draftRevisionId }
    });
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments({ mainLineId: target.mainLineId })).toBe(1);
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments({ mainLineId: target.mainLineId }))
      .toBe(AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.length);

    // Two unequal source contexts prevent a matching label from standing in for the saved ID.
    const sources = [
      await services.item.createMainLine(ACTOR, ceilingId, { name: "Gypsum ceiling", subBasketName: "Ceilings" }),
      await services.item.createMainLine(ACTOR, electricalId, { name: "Lighting upgrade", subBasketName: "Renovation" })
    ];
    for (const [index, source] of sources.entries()) {
      const rule = relatedRule(target.mainLineId, target.subBasketId, { id: `rule-${index}` });
      const path = `${PREFIX}/main-lines/${source.mainLineId}/revisions/${source.draftRevisionId}/sections/recommendations`;
      const original = await request(app).get(path).set("Authorization", "Bearer synthetic-token");
      const saved = await request(app).put(path).set("Authorization", "Bearer synthetic-token").send({
        expectedVersion: original.body.data.version, expectedAggregateVersion: source.version,
        payload: { budgetAlterations: [rule] }
      });
      expect(saved.status).toBe(200);
      const reopened = await request(appFor()).get(path).set("Authorization", "Bearer synthetic-token");
      expect(reopened.status).toBe(200);
      expect(reopened.body.data).toMatchObject({ version: original.body.data.version + 1, payload: { budgetAlterations: [rule] } });
      expect(await AiEstimatorKnowledgeSectionModel.findById(saved.body.data.id).lean())
        .toMatchObject({ updatedById: ACTOR.id, payload: { budgetAlterations: [rule] } });
      expect(await AuditEventModel.findOne({ entityId: saved.body.data.id, action: "ai_estimator_knowledge_section_updated" }).lean())
        .toMatchObject({ actorId: ACTOR.id, oldValues: { mainLineId: source.mainLineId, revisionId: source.draftRevisionId } });
    }
    const reloadedTarget = await request(appFor()).get(`${PREFIX}/main-lines/${target.mainLineId}`)
      .set("Authorization", "Bearer synthetic-token");
    expect(reloadedTarget.status).toBe(200);
    expect(reloadedTarget.body.data).toMatchObject({ mainLineId: target.mainLineId, status: "draft", mainLineName: target.mainLineName });
    expect(await AuditEventModel.countDocuments({ entityId: target.mainLineId, action: "ai_estimator_knowledge_main_line_created" })).toBe(1);
  });

  it("rejects invalid, self, status, type and context targets without changing the saved rule or its audit", async () => {
    const target = await services.item.createMainLine(ACTOR, electricalId, { name: "LED light", subBasketName: "Ceiling lighting" });
    const otherSub = await services.reference.createSubBasket(ACTOR, electricalId, { name: "Cove lighting" });
    const foreignSub = await services.reference.createSubBasket(ACTOR, ceilingId, { name: "Ceiling details" });
    const source = await services.item.createMainLine(ACTOR, ceilingId, { name: "Gypsum ceiling" });
    const section = await services.item.getSection(ACTOR, source.mainLineId, source.draftRevisionId!, "recommendations");
    const valid = relatedRule(target.mainLineId, target.subBasketId!);
    const saved = await services.item.updateSection(ACTOR, source.mainLineId, source.draftRevisionId!, "recommendations", {
      expectedVersion: section.version, expectedAggregateVersion: source.version, payload: { budgetAlterations: [valid] }
    });
    const invalidRules = [
      { ...valid, targetMainLineId: source.mainLineId, targetBasketId: ceilingId, targetSubBasketId: null },
      { ...valid, targetMainLineId: "missing-item" },
      { ...valid, targetMainLineId: "suggestion:recessed-led-downlight" },
      { ...valid, targetType: "temporary" },
      { ...valid, targetBasketId: ceilingId, targetSubBasketId: null },
      { ...valid, targetSubBasketId: otherSub.id },
      { ...valid, targetSubBasketId: foreignSub.id }
    ];
    const beforeAudit = await AuditEventModel.countDocuments();
    for (const [index, invalid] of invalidRules.entries()) {
      await expect(services.item.updateSection(ACTOR, source.mainLineId, source.draftRevisionId!, "recommendations", {
        expectedVersion: saved.version, expectedAggregateVersion: saved.aggregateVersion,
        payload: { budgetAlterations: [invalid] }
      })).rejects.toMatchObject({
        status: 400, code: "VALIDATION_ERROR", fields: {
          [`payload.budgetAlterations.0.${index === 6 ? "targetSubBasketId" : "targetMainLineId"}`]: index === 0
            ? "Select a different related item."
            : index === 6 ? "Select a Sub Basket belonging to this Main Basket."
              : "Select an available related item belonging to the chosen Main Basket and Sub Basket."
        }
      });
    }
    // Synthetic lifecycle fixtures isolate selector validation from unrelated activation prerequisites.
    for (const status of ["inactive", "archived"] as const) {
      await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $set: { status } });
      await expect(services.item.updateSection(ACTOR, source.mainLineId, source.draftRevisionId!, "recommendations", {
        expectedVersion: saved.version, expectedAggregateVersion: saved.aggregateVersion,
        payload: { budgetAlterations: [valid] }
      })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR", fields: {
        "payload.budgetAlterations.0.targetMainLineId": "Select an available related item belonging to the chosen Main Basket and Sub Basket."
      } });
    }
    expect(await services.item.getSection(ACTOR, source.mainLineId, source.draftRevisionId!, "recommendations"))
      .toMatchObject({ version: saved.version, payload: { budgetAlterations: [valid] } });
    expect((await services.item.getItem(ACTOR, source.mainLineId)).version).toBe(saved.aggregateVersion);
    expect(await AuditEventModel.countDocuments()).toBe(beforeAudit);
  });

  it("preserves basket-wide normalized uniqueness across sub-baskets and types, with atomic conflict rollback", async () => {
    const original = await services.item.createMainLine(ACTOR, electricalId, { name: "Recessed LED downlight", subBasketName: "Ceiling lighting" });
    const before = await recordCounts();
    const app = appFor();
    for (const itemType of ["main_line", "temporary"] as const) {
      const response = await request(app).post(`${PREFIX}/baskets/${electricalId}/main-lines`)
        .set("Authorization", "Bearer synthetic-token")
        .send({ name: "  RECESSED   LED downlight  ", subBasketName: "Must roll back", itemType });
      // Existing API behavior: Mongo 11000 is intentionally not translated by this UI-only change.
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } });
      expect(await recordCounts()).toEqual(before);
      expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments({ nameNormalized: "must roll back" })).toBe(0);
    }
    await expect(services.item.createMainLine(ACTOR, electricalId, { name: "recessed led downlight" }))
      .rejects.toMatchObject({ code: 11000 });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: original.mainLineId }, { $set: { status: "inactive" } });
    await expect(services.item.createMainLine(ACTOR, electricalId, { name: "RECESSED LED DOWNLIGHT" }))
      .rejects.toMatchObject({ code: 11000 });
    expect(await recordCounts()).toEqual(before);
    const anotherBasket = await services.item.createMainLine(ACTOR, ceilingId, { name: "Recessed LED downlight", subBasketName: "Ceiling details" });
    expect(anotherBasket.mainLineId).not.toBe(original.mainLineId);
    expect(anotherBasket.basketId).toBe(ceilingId);
  });

  it("commits only one simultaneous normalized-name creation and its matching audit and revision", async () => {
    const before = await recordCounts();
    const results = await Promise.allSettled([
      services.item.createMainLine(ACTOR, electricalId, { name: "Wardrobe hanging rail", subBasketName: "Fittings A" }),
      services.item.createMainLine(ACTOR, electricalId, { name: "WARDROBE  HANGING RAIL", subBasketName: "Fittings B" })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: 11000 } });
    const after = await recordCounts();
    expect(after).toEqual({
      items: before.items + 1, revisions: before.revisions + 1,
      sections: before.sections + AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.length,
      subBaskets: before.subBaskets + 1, audits: before.audits + 2
    });
  });

  it("paginates complete status coverage while requiring explicit archived reads", async () => {
    const ids: string[] = [];
    for (const status of ["draft", "active", "inactive", "archived"] as const) {
      const line = await services.item.createMainLine(ACTOR, electricalId, { name: `Status ${status}`, subBasketName: "Lighting" });
      await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: line.mainLineId }, { $set: { status } });
      ids.push(line.mainLineId);
    }
    const app = appFor();
    const found: string[] = [];
    for (let offset = 0; offset < 3; offset += 1) {
      const response = await request(app).get(`${PREFIX}/items`)
        .set("Authorization", "Bearer synthetic-token").query({ basketId: electricalId, limit: 1, offset });
      expect(response.status).toBe(200);
      expect(response.body.data.pagination).toMatchObject({ total: 3, hasMore: offset < 2 });
      expect(response.body.data.items).toHaveLength(1);
      found.push(response.body.data.items[0].mainLineId);
    }
    expect(found.sort()).toEqual(ids.slice(0, 3).sort());
    const archived = await request(app).get(`${PREFIX}/items`)
      .set("Authorization", "Bearer synthetic-token").query({ basketId: electricalId, status: "archived", limit: 1, offset: 0 });
    expect(archived.status).toBe(200);
    expect(archived.body.data).toMatchObject({ pagination: { total: 1, hasMore: false }, items: [{ mainLineId: ids[3], status: "archived" }] });
    const all = await request(app).get(`${PREFIX}/baskets/${electricalId}/main-lines`)
      .set("Authorization", "Bearer synthetic-token").query({ includeArchived: true });
    expect(all.status).toBe(200);
    expect(all.body.data.pagination.total).toBe(4);
    expect(all.body.data.items.map((row: { id: string }) => row.id).sort()).toEqual([...ids].sort());
  });
});

function createServices() {
  const audit = createAuditService(createMemoryRepository());
  const createId = () => `related-item-${++sequence}`;
  return {
    item: createAiEstimatorKnowledgeItemService({ audit, now: () => NOW, uuid: createId }),
    reference: createAiEstimatorKnowledgeReferenceService({ audit, now: () => NOW, createId }),
    context: createAiEstimatorKnowledgeContextService({ now: () => NOW })
  };
}

function appFor() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createAiEstimatorKnowledgeAdminRouter({
    authenticate: async () => ACTOR
  } as unknown as AuthService, services));
  app.use(errorHandler);
  return app;
}

function relatedRule(targetMainLineId: string, targetSubBasketId: string | null, overrides: Partial<KnowledgeBudgetAlteration> = {}): KnowledgeBudgetAlteration {
  return {
    id: "related-rule", trigger: "removed", action: "remove", requirement: "can", targetType: "catalog",
    targetBasketId: electricalId, targetSubBasketId, targetMainLineId,
    reason: "Review the recessed fitting when its supporting ceiling is removed.", active: true, ...overrides
  };
}

async function recordCounts() {
  const [items, revisions, sections, subBaskets, audits] = await Promise.all([
    AiEstimatorKnowledgeMainLineModel.countDocuments(), AiEstimatorKnowledgeRevisionModel.countDocuments(),
    AiEstimatorKnowledgeSectionModel.countDocuments(), AiEstimatorKnowledgeSubBasketModel.countDocuments(),
    AuditEventModel.countDocuments()
  ]);
  return { items, revisions, sections, subBaskets, audits };
}
