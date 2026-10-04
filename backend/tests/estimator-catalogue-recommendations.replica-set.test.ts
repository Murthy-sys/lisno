import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeKnowledgeIdentity } from "../src/domain/ai-estimator-knowledge.js";
import { errorHandler } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { UserModel } from "../src/models/User.js";
import { createEstimatorCatalogueRouter } from "../src/routes/estimator-catalogue.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actors = {
  estimator: { id: "estimator", name: "Estimator", email: "estimator@example.test", role: "estimator_sales" },
  superAdmin: { id: "super-admin", name: "Super Admin", email: "admin@example.test", role: "super_admin" },
  procurement: { id: "procurement", name: "Procurement", email: "procurement@example.test", role: "procurement" }
} as const satisfies Record<string, PublicUser>;
type ActorKey = keyof typeof actors;
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("estimator-catalogue-recommendations");
  await AiEstimatorKnowledgeMainLineModel.createIndexes();
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.collection.insertMany(Object.values(actors).map((actor) => ({ ...actor, _id: actor.id, active: true })) as never[]);
  await seedConfiguration();
});
afterAll(async () => { await replica?.stop(); });

function app() {
  const auth = { authenticate: async (token: string) => actors[token as ActorKey] ??
    (() => { throw new Error("Unknown test actor"); })() } as unknown as Parameters<typeof createEstimatorCatalogueRouter>[0];
  const server = express();
  server.use("/api/v1", createEstimatorCatalogueRouter(auth));
  server.use(errorHandler);
  return server;
}

const bearer = (actor: ActorKey) => ({ Authorization: `Bearer ${actor}` });
const endpoint = "/api/v1/estimation/catalogue/recommendations";
const rule = (id: string, targetMainLineId: string, targetBasketId: string, targetSubBasketId: string | null,
  overrides: Record<string, unknown> = {}) => ({
  id, trigger: "added", action: "add", requirement: "must", targetKind: "main_line",
  targetType: "catalog", targetBasketId, targetSubBasketId, targetMainLineId,
  reason: `Why ${id}`, active: true, ...overrides
});

async function seedLine(id: string, basketId: string, subBasketId: string | null,
  options: { itemType?: "main_line" | "temporary"; status?: "active" | "draft" | "inactive" | "archived";
    revisionStatus?: "active" | "draft"; name?: string; uomId?: string } = {}) {
  const status = options.status ?? "active";
  const revisionStatus = options.revisionStatus ?? (status === "draft" ? "draft" : "active");
  const revisionId = `revision-${id}`;
  const name = options.name ?? id;
  await AiEstimatorKnowledgeMainLineModel.collection.insertOne({
    _id: id, basketId, subBasketId, name, nameNormalized: normalizeKnowledgeIdentity(name), displayOrder: 1,
    itemType: options.itemType ?? "main_line", status, version: 2,
    activeRevisionId: revisionStatus === "active" ? revisionId : null,
    draftRevisionId: revisionStatus === "draft" ? revisionId : null
  } as never);
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
    _id: revisionId, mainLineId: id, status: revisionStatus, version: 3,
    completeness: { percentage: 75, sections: [
      { sectionKey: "overview", state: "complete" }, { sectionKey: "advanced", state: "complete" }
    ] }
  } as never);
  await AiEstimatorKnowledgeSectionModel.collection.insertOne({
    _id: `overview-${id}`, mainLineId: id, revisionId,
    sectionKey: "overview", payload: { uomId: options.uomId ?? "uom-ea" }
  } as never);
  return revisionId;
}

async function recommendations(mainLineId: string, budgetAlterations: unknown[], guidance: unknown[] = []) {
  await AiEstimatorKnowledgeSectionModel.collection.insertOne({
    _id: `recommendations-${mainLineId}`, mainLineId, revisionId: `revision-${mainLineId}`,
    sectionKey: "recommendations", applicability: "configured",
    payload: { budgetAlterations, recommendations: guidance }
  } as never);
}

async function seedConfiguration() {
  await AiEstimatorKnowledgeBasketModel.collection.insertMany([
    { _id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, status: "active" },
    { _id: "basket-paint", name: "Painting", displayOrder: 2, status: "active" },
    { _id: "basket-light", name: "Lights", displayOrder: 3, status: "active" },
    { _id: "basket-hidden", name: "Confidential category", displayOrder: 4, status: "inactive" }
  ] as never[]);
  await AiEstimatorKnowledgeSubBasketModel.collection.insertMany([
    { _id: "sub-pop", basketId: "basket-pop", name: "False Ceiling", displayOrder: 1 },
    { _id: "sub-paint", basketId: "basket-paint", name: "False Ceiling", displayOrder: 1 },
    { _id: "sub-light", basketId: "basket-light", name: "False Ceiling", displayOrder: 1 },
    { _id: "sub-hidden", basketId: "basket-hidden", name: "False Ceiling", displayOrder: 1 }
  ] as never[]);
  await AiEstimatorKnowledgeUomModel.collection.insertOne({
    _id: "uom-ea", code: "EA", name: "Each", decimalScale: 0, status: "active"
  } as never);
  await seedLine("source-ceiling", "basket-pop", "sub-pop", { name: "False Ceiling" });
  await seedLine("source-lights", "basket-light", "sub-light", { name: "Functional Lights" });
  await seedLine("source-temp", "basket-pop", "sub-pop", { itemType: "temporary" });
  await seedLine("target-paint", "basket-paint", "sub-paint", { name: "False Ceiling Painting" });
  await seedLine("target-same-name", "basket-light", "sub-light", { name: "False Ceiling Painting" });
  await seedLine("target-light", "basket-light", "sub-light", { name: "False Ceiling Functional Lights" });
  await seedLine("target-temp", "basket-pop", null, { itemType: "temporary" });
  await seedLine("target-ready", "basket-paint", "sub-paint", { status: "draft" });
  await seedLine("target-temp-group", "basket-paint", "sub-paint", { itemType: "temporary" });
  await seedLine("target-archived", "basket-paint", "sub-paint", { status: "archived", name: "Secret archived item" });
  await seedLine("target-hidden", "basket-hidden", "sub-hidden", { name: "Secret hidden item" });
}

describe("estimator catalogue recommendations", { timeout: 30_000 }, () => {
  it("projects only active added/add relationships from the chosen source revision by stable identity", async () => {
    await recommendations("source-ceiling", [
      rule("paint", "target-paint", "basket-paint", "sub-paint", { reason: "The new gypsum surface needs finishing." }),
      rule("wrong-parent", "target-same-name", "basket-paint", "sub-paint"),
      rule("hidden", "target-hidden", "basket-hidden", "sub-hidden"),
      rule("disabled", "target-light", "basket-light", "sub-light", { active: false }),
      rule("source-removed", "target-light", "basket-light", "sub-light", { trigger: "removed" }),
      rule("remove", "target-light", "basket-light", "sub-light", { action: "remove" })
    ], [
      { id: "guidance-a", name: "Review gypsum paint compatibility", reason: "Check the finish", active: true },
      { id: "guidance-disabled", name: "Do not expose", active: false }
    ]);
    await recommendations("source-lights", [
      rule("light", "target-light", "basket-light", "sub-light", {
        requirement: "can", reason: "A recessed fitting needs a false-ceiling detail."
      })
    ]);
    const sectionFind = vi.spyOn(AiEstimatorKnowledgeSectionModel, "find");
    const server = app();
    const response = await request(server).get(`${endpoint}?mainLineIds=source-ceiling,source-lights&includeReadyNonActive=true`)
      .set(bearer("estimator")).expect(200);
    sectionFind.mockRestore();
    expect(response.body.data.sources).toEqual([
      expect.objectContaining({ mainLineId: "source-ceiling", available: true,
        revisionId: "revision-source-ceiling", revisionVersion: 3, itemVersion: 2 }),
      expect.objectContaining({ mainLineId: "source-lights", available: true,
        revisionId: "revision-source-lights" })
    ]);
    expect(response.body.data.sources[0].rules).toEqual([
      expect.objectContaining({ id: "paint", targetMainLineId: "target-paint", available: true,
        requirement: "must", reason: "The new gypsum surface needs finishing.",
        targetRevisionId: "revision-target-paint", targetRevisionVersion: 3, targetItemVersion: 2 }),
      expect.objectContaining({ id: "wrong-parent", targetMainLineId: "target-same-name", available: false,
        targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null }),
      expect.objectContaining({ id: "hidden", available: false,
        targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null })
    ]);
    expect(response.body.data.sources[1].rules).toEqual([
      expect.objectContaining({ id: "light", targetMainLineId: "target-light", requirement: "can",
        reason: "A recessed fitting needs a false-ceiling detail.", available: true })
    ]);
    expect(response.body.data.sources[0].guidance).toEqual([
      { id: "guidance-a", name: "Review gypsum paint compatibility", reason: "Check the finish" }
    ]);
    const serialized = JSON.stringify(response.body.data);
    expect(serialized).not.toMatch(/Secret hidden item|Secret archived item|Do not expose|baseRatePaise|vendor|priorityId|targetType/iu);
    expect(sectionFind.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("supports legacy and temporary sources, direct temporary targets, and whole Sub-Basket child review", async () => {
    const legacy = rule("legacy", "target-temp", "basket-pop", null, {
      targetType: "temporary", reason: "Temporary fixture needed for the work."
    }) as Record<string, unknown>;
    delete legacy.targetKind;
    await recommendations("source-temp", [
      legacy,
      { id: "whole", trigger: "added", action: "add", requirement: "must", targetKind: "sub_basket",
        targetType: null, targetBasketId: "basket-paint", targetSubBasketId: "sub-paint",
        targetMainLineId: null, reason: "Finish every relevant surface.", active: true },
      { id: "wrong-group", trigger: "added", action: "add", requirement: "can", targetKind: "sub_basket",
        targetType: null, targetBasketId: "basket-light", targetSubBasketId: "sub-paint",
        targetMainLineId: null, reason: "Wrong parent cannot select children.", active: true }
    ], [{ id: "note", name: "Coordinate lighting", active: true }]);
    const server = app();
    const mainLineFind = vi.spyOn(AiEstimatorKnowledgeMainLineModel, "find");
    const response = await request(server).get(`${endpoint}?mainLineIds=source-temp&includeReadyNonActive=true`)
      .set(bearer("estimator")).expect(200);
    const targetQueries = mainLineFind.mock.calls.map(([filter]) => filter);
    mainLineFind.mockRestore();
    expect(targetQueries).toHaveLength(3);
    expect(targetQueries).toEqual(expect.arrayContaining([
      expect.objectContaining({ _id: { $in: ["target-temp"] } }),
      expect.objectContaining({ basketId: { $in: ["basket-paint", "basket-light"] },
        subBasketId: { $in: ["sub-paint"] } })
    ]));
    const source = response.body.data.sources[0];
    expect(source).toMatchObject({ available: true, revisionId: "revision-source-temp",
      guidance: [{ id: "note", name: "Coordinate lighting", reason: "" }] });
    expect(source.rules[0]).toMatchObject({ id: "legacy", targetKind: "main_line",
      targetSubBasketId: null, targetMainLineId: "target-temp", available: true,
      completionRequired: true });
    expect(source.rules[1]).toMatchObject({ id: "whole", targetKind: "sub_basket",
      targetMainLineId: null, available: true, completionRequired: true,
      targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null,
      unavailableChildCount: 1, children: [
        { mainLineId: "target-paint", available: true, completionRequired: false,
          revisionId: "revision-target-paint", revisionVersion: 3, itemVersion: 2 },
        { mainLineId: "target-ready", available: true, completionRequired: false,
          revisionId: "revision-target-ready", revisionVersion: 3, itemVersion: 2 },
        { mainLineId: "target-temp-group", available: true, completionRequired: true,
          revisionId: "revision-target-temp-group", revisionVersion: 3, itemVersion: 2 }
      ] });
    expect(source.rules[2]).toMatchObject({ id: "wrong-group", available: false,
      completionRequired: true, children: [], unavailableChildCount: 0 });
    const defaultResponse = await request(server).get(`${endpoint}?mainLineIds=source-temp`)
      .set(bearer("estimator")).expect(200);
    expect(defaultResponse.body.data.sources[0].rules[1]).toMatchObject({
      unavailableChildCount: 2, children: [
        { mainLineId: "target-paint", available: true, completionRequired: false },
        { mainLineId: "target-temp-group", available: true, completionRequired: true }
      ]
    });
  });

  it("uses the existing Basket-leading Main Line index for whole Sub-Basket discovery", async () => {
    const explanation = await AiEstimatorKnowledgeMainLineModel.collection.find({
      basketId: { $in: ["basket-paint", "basket-light"] }, subBasketId: { $in: ["sub-paint"] }
    }).explain("queryPlanner");
    expect(JSON.stringify(explanation.queryPlanner.winningPlan)).toContain("IXSCAN");
  });

  it("uses the catalogue readiness policy for a Draft recommendation source", async () => {
    await seedLine("source-ready", "basket-pop", "sub-pop", { status: "draft" });
    await recommendations("source-ready", [rule("ready-paint", "target-paint", "basket-paint", "sub-paint")]);
    const server = app();
    const defaultResponse = await request(server).get(`${endpoint}?mainLineIds=source-ready`)
      .set(bearer("estimator")).expect(200);
    expect(defaultResponse.body.data.sources[0]).toMatchObject({ available: false, revisionId: null, rules: [] });
    const optedIn = await request(server).get(`${endpoint}?mainLineIds=source-ready&includeReadyNonActive=true`)
      .set(bearer("estimator")).expect(200);
    expect(optedIn.body.data.sources[0]).toMatchObject({ available: true,
      revisionId: "revision-source-ready", rules: [{ id: "ready-paint", available: true }] });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-source-ready" },
      { $set: { "completeness.sections": [{ sectionKey: "overview", state: "complete" }] } });
    const stale = await request(server).get(`${endpoint}?mainLineIds=source-ready&includeReadyNonActive=true`)
      .set(bearer("estimator")).expect(200);
    expect(stale.body.data.sources[0]).toMatchObject({ available: false, revisionId: null, rules: [] });
  });

  it("returns current target versions so a stale client catalogue can disable selection", async () => {
    await recommendations("source-ceiling", [rule("paint", "target-paint", "basket-paint", "sub-paint")]);
    const server = app();
    const first = await request(server).get(`${endpoint}?mainLineIds=source-ceiling`)
      .set(bearer("estimator")).expect(200);
    expect(first.body.data.sources[0].rules[0]).toMatchObject({
      targetRevisionId: "revision-target-paint", targetRevisionVersion: 3, targetItemVersion: 2
    });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
      _id: "revision-target-paint-next", mainLineId: "target-paint", status: "active", version: 1,
      completeness: { percentage: 100, sections: [{ sectionKey: "overview", state: "complete" }] }
    } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({
      _id: "overview-target-paint-next", mainLineId: "target-paint", revisionId: "revision-target-paint-next",
      sectionKey: "overview", payload: { uomId: "uom-ea" }
    } as never);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "target-paint" },
      { $set: { activeRevisionId: "revision-target-paint-next" }, $inc: { version: 1 } });
    const current = await request(server).get(`${endpoint}?mainLineIds=source-ceiling`)
      .set(bearer("estimator")).expect(200);
    expect(current.body.data.sources[0].rules[0]).toMatchObject({ available: true,
      targetRevisionId: "revision-target-paint-next", targetRevisionVersion: 1, targetItemVersion: 3 });
  });

  it("returns generic unavailable sources, validates bounded IDs, and enforces catalogue authorization", async () => {
    const server = app();
    const response = await request(server).get(`${endpoint}?mainLineIds=missing,target-hidden,target-ready`)
      .set(bearer("estimator")).expect(200);
    expect(response.body.data.sources).toEqual(["missing", "target-hidden", "target-ready"].map((mainLineId) => ({
      mainLineId, available: false, revisionId: null, revisionVersion: null,
      itemVersion: null, rules: [], guidance: []
    })));
    for (const query of ["", "?mainLineIds=", "?mainLineIds=source-ceiling,source-ceiling",
      "?mainLineIds=source-ceiling,", "?mainLineIds=bad%20id", "?mainLineIds=source-ceiling&unexpected=true",
      `?mainLineIds=${Array.from({ length: 51 }, (_, index) => `line-${index}`).join(",")}`]) {
      const invalid = await request(server).get(`${endpoint}${query}`).set(bearer("estimator")).expect(400);
      expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    }
    await request(server).get(`${endpoint}?mainLineIds=source-ceiling`).set(bearer("procurement")).expect(403);
    await request(server).get(`${endpoint}?mainLineIds=source-ceiling`).set(bearer("superAdmin")).expect(200);
    await UserModel.collection.insertOne({ _id: "another-super-admin", name: "Another Super Admin",
      email: "another-admin@example.test", role: "super_admin", active: true } as never);
    const conflictingAdmins = await request(server).get(`${endpoint}?mainLineIds=source-ceiling`)
      .set(bearer("superAdmin")).expect(409);
    expect(conflictingAdmins.body.error.code).toBe("SOLE_SUPER_ADMIN_REQUIRED");
    await UserModel.collection.updateOne({ _id: "estimator" }, { $set: { active: false } });
    await request(server).get(`${endpoint}?mainLineIds=source-ceiling`).set(bearer("estimator")).expect(403);
  });

  it("chooses the active revision over an unfinished draft and hides a stale recommendation section", async () => {
    await recommendations("source-ceiling", [rule("paint", "target-paint", "basket-paint", "sub-paint")]);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "source-ceiling" },
      { $set: { draftRevisionId: "revision-source-ceiling-pending" }, $inc: { version: 1 } });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
      _id: "revision-source-ceiling-pending", mainLineId: "source-ceiling", status: "draft", version: 1,
      completeness: { percentage: 10, sections: [] }
    } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({
      _id: "recommendations-pending", mainLineId: "source-ceiling", revisionId: "revision-source-ceiling-pending",
      sectionKey: "recommendations", payload: { budgetAlterations: [
        rule("unpublished", "target-light", "basket-light", "sub-light")
      ] }
    } as never);
    const response = await request(app()).get(`${endpoint}?mainLineIds=source-ceiling&includeReadyNonActive=true`)
      .set(bearer("estimator")).expect(200);
    expect(response.body.data.sources[0]).toMatchObject({
      revisionId: "revision-source-ceiling", itemVersion: 3, rules: [{ id: "paint" }]
    });
  });
});
