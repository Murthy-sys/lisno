import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hasPermission } from "../src/domain/authorization.js";
import { errorHandler } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { UserModel } from "../src/models/User.js";
import { createEstimatorCatalogueRouter } from "../src/routes/estimator-catalogue.js";
import { createEstimatesRouter } from "../src/routes/estimates.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actors = {
  estimator: { id: "estimator", name: "Estimator", email: "estimator@example.test", role: "estimator_sales" },
  otherEstimator: { id: "other-estimator", name: "Other Estimator", email: "other@example.test", role: "estimator_sales" },
  superAdmin: { id: "super-admin", name: "Super Admin", email: "admin@example.test", role: "super_admin" },
  procurement: { id: "procurement", name: "Procurement", email: "procurement@example.test", role: "procurement" },
  designer: { id: "designer", name: "Designer", email: "designer@example.test", role: "designer" },
  client: { id: "client", name: "Client", email: "client@example.test", role: "client" }
} as const satisfies Record<string, PublicUser>;
type ActorKey = keyof typeof actors;
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("estimator-catalogue-estimate");
  await EstimateModel.syncIndexes();
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.collection.insertMany(Object.values(actors).map((actor) => ({
    _id: actor.id, name: actor.name, email: actor.email, role: actor.role, active: true
  })) as never[]);
  await seedConfiguration();
});
afterAll(async () => { await replica?.stop(); });

function app() {
  const auth = {
    authenticate: async (token: string) => actors[token as ActorKey] ?? (() => { throw new Error("Unknown test actor"); })()
  } as unknown as Parameters<typeof createEstimatorCatalogueRouter>[0];
  const leads = { get: async (actor: PublicUser, leadId: string) => ({
    id: leadId, ownerId: actor.id, projectId: null
  }) } as unknown as Parameters<typeof createEstimatesRouter>[1];
  const reviews = {
    currentSummaryForEstimate: async () => null,
    currentClientFeedbackForEstimate: async () => null
  } as unknown as Parameters<typeof createEstimatesRouter>[7];
  const publication = { publishEstimateToClient: vi.fn(async () => ({ estimate: {}, clientReview: {} })) };
  const server = express();
  server.use(express.json());
  server.use("/api/v1", createEstimatorCatalogueRouter(auth));
  server.use("/api/v1", createEstimatesRouter(auth, leads,
    {} as Parameters<typeof createEstimatesRouter>[2],
    {} as Parameters<typeof createEstimatesRouter>[3],
    {} as Parameters<typeof createEstimatesRouter>[4],
    publication as unknown as Parameters<typeof createEstimatesRouter>[5],
    {} as Parameters<typeof createEstimatesRouter>[6], reviews));
  server.use(errorHandler);
  return { server, publication };
}

const bearer = (actor: ActorKey) => ({ Authorization: `Bearer ${actor}` });
const configuredLine = (overrides: Record<string, unknown> = {}) => ({
  source: "configuration", catalogueId: "line-a", roomId: "room-one", roomName: "Living room",
  mainBasketId: "basket-a", subBasketId: "sub-a", mainLineId: "line-a",
  revisionId: "revision-a", uomId: "uom-sq", quantity: 1.25, included: true,
  ratePaise: 12999, ...overrides
});
const estimateInput = (lineItems: unknown[], selectedMainBasketIds = ["basket-a"], expectedVersion?: number) => ({
  propertyType: "apartment", rooms: [{ id: "room-one", label: "Living room" }], scopes: [],
  selectedMainBasketIds, lineItems, ...(expectedVersion === undefined ? {} : { expectedVersion })
});

describe("estimator configured catalogue and estimate", { timeout: 30_000 }, () => {
  it("pages ordered active baskets with same-name Sub Baskets and filtered Overview UOMs", async () => {
    const { server } = app();
    const first = await request(server).get("/api/v1/estimation/catalogue?limit=1&offset=0")
      .set(bearer("estimator")).expect(200);
    expect(first.body.data.pagination).toEqual({ limit: 1, offset: 0, total: 3, hasMore: true });
    expect(first.body.data.items[0]).toMatchObject({ id: "basket-a", name: "Electrical", subBaskets: [{
      id: "sub-a", basketId: "basket-a", name: "Shared", mainLines: [{
        id: "line-a", mainLineId: "line-a", revisionId: "revision-a",
        uom: { id: "uom-sq", code: "SQM", name: "Square metre", decimalScale: 2 }
      }]
    }] });
    expect(first.body.data.ineligibleLineCount).toBe(3);
    expect(JSON.stringify(first.body.data)).not.toMatch(/vendor|cost|margin|pricePaise/iu);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-b" }, { $unset: { itemType: "" } });
    const second = await request(server).get("/api/v1/estimation/catalogue?limit=1&offset=1")
      .set(bearer("estimator")).expect(200);
    expect(second.body.data.items[0].subBaskets[0]).toMatchObject({
      id: "sub-b", basketId: "basket-b", name: "Shared", mainLines: [{ id: "line-b" }]
    });
    const third = await request(server).get("/api/v1/estimation/catalogue?limit=1&offset=2")
      .set(bearer("estimator")).expect(200);
    expect(third.body.data.items[0]).toMatchObject({ id: "basket-c", subBaskets: [{ id: "sub-c", mainLines: [] }] });
    expect(third.body.data.pagination.hasMore).toBe(false);
  });

  it("authorizes only Estimator/Sales and Super Admin, including an active actor recheck", async () => {
    const { server } = app();
    for (const actor of ["estimator", "superAdmin"] as const) {
      await request(server).get("/api/v1/estimation/catalogue").set(bearer(actor)).expect(200);
      expect(hasPermission(actors[actor].role, "estimation.catalogue.read")).toBe(true);
    }
    for (const actor of ["procurement", "designer", "client"] as const) {
      await request(server).get("/api/v1/estimation/catalogue").set(bearer(actor)).expect(403);
      expect(hasPermission(actors[actor].role, "estimation.catalogue.read")).toBe(false);
    }
    await UserModel.updateOne({ _id: "estimator" }, { $set: { active: false } });
    await request(server).get("/api/v1/estimation/catalogue").set(bearer("estimator")).expect(403);
    await request(server).get("/api/v1/estimation/catalogue?limit=101").set(bearer("superAdmin")).expect(400);
  });

  it("saves an incomplete draft, distinguishes zero, and preserves its snapshot after Configuration changes", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-a/estimate";
    const incomplete = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ ratePaise: null })])).expect(200);
    expect(incomplete.body.data).toMatchObject({
      selectedMainBasketIds: ["basket-a"], isIncomplete: true,
      subtotalPaise: 0, gstPaise: 0, totalPaise: 0,
      lineItems: [{ source: "configuration", specification: null, ratePaise: null,
        amountPaise: null, rate: null, amount: null, mainBasketName: "Electrical",
        subBasketName: "Shared", mainLineName: "Wiring", uomName: "Square metre",
        uomDecimalScale: 2 }]
    });
    await request(server).get(`/api/v1/estimates/${incomplete.body.data.id}/pdf`)
      .set(bearer("estimator")).expect(409);
    await request(server).post(`${path}/submit`).set(bearer("estimator")).expect(409);
    const savedId = incomplete.body.data.lineItems[0].id;
    const zero = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: savedId, ratePaise: 0 })], ["basket-a"], incomplete.body.data.version)).expect(200);
    expect(zero.body.data).toMatchObject({ isIncomplete: false, subtotalPaise: 0,
      lineItems: [{ id: savedId, ratePaise: 0, amountPaise: 0, rate: 0, amount: 0 }] });
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: "basket-a" }, { $set: { name: "Renamed" } });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "line-a" }, { $set: { name: "Renamed", status: "inactive" } });
    const retained = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: savedId, ratePaise: 12999 })], ["basket-a"], zero.body.data.version)).expect(200);
    expect(retained.body.data).toMatchObject({
      subtotalPaise: 16249, gstPaise: 2925, totalPaise: 19174,
      subtotal: 162.49, gst: 29.25, total: 191.74,
      lineItems: [{ id: savedId, revisionId: "revision-a", mainBasketName: "Electrical",
        mainLineName: "Wiring", ratePaise: 12999, amountPaise: 16249 }]
    });
    const persisted = await EstimateModel.findOne({ leadId: "lead-a" }).lean();
    expect(persisted?.lineItems[0]).toMatchObject({ id: savedId, mainLineId: "line-a", amountPaise: 16249 });
  });

  it("rejects stale first selection, wrong UOM precision, duplicate identity and invalid paise", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-b/estimate";
    await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ revisionId: "old-revision" })])).expect(409);
    await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ subBasketId: "sub-b" })])).expect(409);
    await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine()], ["basket-hidden"])).expect(409);
    await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ quantity: 1.234 })])).expect(400);
    await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine(), configuredLine()])).expect(400);
    await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ ratePaise: 1.5 })])).expect(400);
    expect(await EstimateModel.countDocuments({ leadId: "lead-b" })).toBe(0);
  });

  it("rejects stale configured draft saves and protects basket-only selections", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-cas/estimate";
    const first = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ ratePaise: 1000 })])).expect(200);
    const savedId = first.body.data.lineItems[0].id;
    const second = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: savedId, ratePaise: 2000 })], ["basket-a"], first.body.data.version)).expect(200);
    expect(second.body.data.version).toBe(first.body.data.version + 1);
    const stale = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: savedId, ratePaise: 3000 })], ["basket-a"], first.body.data.version)).expect(409);
    expect(stale.body.error.code).toBe("ESTIMATE_VERSION_CONFLICT");
    await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: savedId, ratePaise: 3000 })])).expect(409);
    const persisted = await EstimateModel.findOne({ leadId: "lead-cas" }).lean();
    expect(persisted?.lineItems[0]).toMatchObject({ id: savedId, ratePaise: 2000 });

    const selectionPath = "/api/v1/leads/lead-basket-only/estimate";
    const basketOnly = await request(server).put(selectionPath).set(bearer("estimator"))
      .send(estimateInput([])).expect(200);
    const changed = await request(server).put(selectionPath).set(bearer("estimator"))
      .send({ ...estimateInput([]), expectedVersion: basketOnly.body.data.version, propertyType: "villa" }).expect(200);
    expect(changed.body.data.version).toBe(basketOnly.body.data.version + 1);
    await request(server).put(selectionPath).set(bearer("estimator"))
      .send({ ...estimateInput([]), expectedVersion: basketOnly.body.data.version, propertyType: "stale" }).expect(409);
  });

  it("requires unique labelled rooms and matching room names for configured lines", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-invalid-rooms/estimate";
    await request(server).put(path).set(bearer("estimator"))
      .send({ ...estimateInput([configuredLine()]), rooms: [{ id: "room-one", label: "Living room" }, { id: "room-one", label: "Other" }] }).expect(400);
    await request(server).put(path).set(bearer("estimator"))
      .send({ ...estimateInput([configuredLine()]), rooms: [{ id: "room-one", name: "Living room" }] }).expect(400);
    await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ roomName: "Wrong room" })])).expect(400);
    expect(await EstimateModel.countDocuments({ leadId: "lead-invalid-rooms" })).toBe(0);
  });

  it("keys saved lines by room and Main Line through reordering and reconciles mixed paise totals", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-mixed/estimate";
    const rooms = [{ id: "room-one", label: "Living room" }, { id: "room-two", label: "Bedroom" }];
    const firstLine = configuredLine({ roomId: "room-one", roomName: "Living room" });
    const secondLine = configuredLine({ roomId: "room-two", roomName: "Bedroom", quantity: 2, ratePaise: 1000 });
    const legacyLine = { catalogueId: "FC01", roomName: "Living room", specification: "Gypsum",
      unit: "sqft", rate: 95, quantity: 1.25, included: true };
    const first = await request(server).put(path).set(bearer("estimator"))
      .send({ propertyType: "apartment", rooms, scopes: ["FC"], selectedMainBasketIds: ["basket-a"],
        lineItems: [firstLine, legacyLine, secondLine] }).expect(200);
    expect(first.body.data).toMatchObject({ subtotalPaise: 30149, gstPaise: 5427, totalPaise: 35576 });
    const firstByRoom = new Map(first.body.data.lineItems.filter((line: { source: string }) =>
      line.source === "configuration").map((line: { roomId: string; id: string }) => [line.roomId, line.id]));
    const reordered = await request(server).put(path).set(bearer("estimator"))
      .send({ propertyType: "apartment", rooms, scopes: ["FC"], selectedMainBasketIds: ["basket-a"], expectedVersion: first.body.data.version,
        lineItems: [secondLine, firstLine, legacyLine] }).expect(200);
    const secondByRoom = new Map(reordered.body.data.lineItems.filter((line: { source: string }) =>
      line.source === "configuration").map((line: { roomId: string; id: string }) => [line.roomId, line.id]));
    expect(secondByRoom).toEqual(firstByRoom);
    expect(reordered.body.data).toMatchObject({ subtotalPaise: 30149, gstPaise: 5427, totalPaise: 35576 });
  });

  it("keeps the legacy whole-rupee calculation and owner filter", async () => {
    const { server } = app();
    const line = { catalogueId: "FC01", roomName: "Living room", specification: "Gypsum",
      unit: "sqft", rate: 95, quantity: 1.25, included: true };
    const saved = await request(server).put("/api/v1/leads/lead-c/estimate").set(bearer("estimator"))
      .send(estimateInput([line], [])).expect(200);
    expect(saved.body.data).toMatchObject({ subtotal: 119, gst: 21, total: 140,
      subtotalPaise: 11900, gstPaise: 2100, totalPaise: 14000,
      lineItems: [{ source: "legacy", amount: 119, amountPaise: 11900 }] });
    const other = await request(server).get("/api/v1/leads/lead-c/estimate")
      .set(bearer("otherEstimator")).expect(200);
    expect(other.body.data).toBeNull();
  });
});

async function seedConfiguration() {
  await AiEstimatorKnowledgeBasketModel.collection.insertMany([
    { _id: "basket-a", name: "Electrical", displayOrder: 1, status: "active" },
    { _id: "basket-b", name: "Joinery", displayOrder: 2, status: "active" },
    { _id: "basket-c", name: "Empty", displayOrder: 3, status: "active" },
    { _id: "basket-hidden", name: "Hidden", displayOrder: 0, status: "inactive" }
  ] as never[]);
  await AiEstimatorKnowledgeSubBasketModel.collection.insertMany([
    { _id: "sub-a", basketId: "basket-a", name: "Shared", displayOrder: 1 },
    { _id: "sub-b", basketId: "basket-b", name: "Shared", displayOrder: 1 },
    { _id: "sub-c", basketId: "basket-c", name: "Unused", displayOrder: 1 }
  ] as never[]);
  await AiEstimatorKnowledgeUomModel.collection.insertMany([
    { _id: "uom-sq", code: "SQM", name: "Square metre", decimalScale: 2, status: "inactive" },
    { _id: "uom-ea", code: "EA", name: "Each", decimalScale: 0, status: "active" },
    { _id: "uom-archived", code: "OLD", name: "Old", decimalScale: 0, status: "archived" }
  ] as never[]);
  await AiEstimatorKnowledgeMainLineModel.collection.insertMany([
    { _id: "line-a", basketId: "basket-a", subBasketId: "sub-a", name: "Wiring", displayOrder: 2, itemType: "main_line", status: "active", activeRevisionId: "revision-a" },
    { _id: "line-b", basketId: "basket-b", subBasketId: "sub-b", name: "Cabinet", displayOrder: 1, itemType: "main_line", status: "active", activeRevisionId: "revision-b" },
    { _id: "line-bad", basketId: "basket-a", subBasketId: "sub-a", name: "Bad UOM", displayOrder: 3, itemType: "main_line", status: "active", activeRevisionId: "revision-bad" },
    { _id: "line-direct", basketId: "basket-a", subBasketId: null, name: "Direct", displayOrder: 4, itemType: "main_line", status: "active", activeRevisionId: "revision-direct" },
    { _id: "line-temp", basketId: "basket-a", subBasketId: "sub-a", name: "Temporary", displayOrder: 5, itemType: "temporary", status: "active", activeRevisionId: "revision-temp" },
    { _id: "line-draft", basketId: "basket-a", subBasketId: "sub-a", name: "Draft", displayOrder: 6, itemType: "main_line", status: "draft", activeRevisionId: "revision-draft" }
  ] as never[]);
  await AiEstimatorKnowledgeRevisionModel.collection.insertMany([
    "a", "b", "bad", "direct", "temp", "draft"
  ].map((suffix) => ({ _id: `revision-${suffix}`, mainLineId: `line-${suffix}`, status: "active" })) as never[]);
  await AiEstimatorKnowledgeSectionModel.collection.insertMany([
    { _id: "overview-a", mainLineId: "line-a", revisionId: "revision-a", sectionKey: "overview", applicability: "not_configured", payload: { uomId: "uom-sq" } },
    { _id: "overview-b", mainLineId: "line-b", revisionId: "revision-b", sectionKey: "overview", applicability: "applicable", payload: { uomId: "uom-ea" } },
    { _id: "overview-bad", mainLineId: "line-bad", revisionId: "revision-bad", sectionKey: "overview", applicability: "applicable", payload: { uomId: "uom-archived" } },
    { _id: "overview-direct", mainLineId: "line-direct", revisionId: "revision-direct", sectionKey: "overview", applicability: "applicable", payload: { uomId: "uom-ea" } },
    { _id: "overview-temp", mainLineId: "line-temp", revisionId: "revision-temp", sectionKey: "overview", applicability: "applicable", payload: { uomId: "uom-ea" } }
  ] as never[]);
}
