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
const directTemporaryLine = (overrides: Record<string, unknown> = {}) => configuredLine({
  catalogueId: "line-temp-direct", mainLineId: "line-temp-direct", itemType: "temporary",
  subBasketId: null, revisionId: "revision-temp-direct", uomId: "uom-ea",
  quantity: 2, ratePaise: 1001, ...overrides
});
const groupedTemporaryLine = (overrides: Record<string, unknown> = {}) => configuredLine({
  catalogueId: "line-temp", mainLineId: "line-temp", itemType: "temporary",
  revisionId: "revision-temp", uomId: "uom-ea", quantity: 3, ratePaise: 901,
  ...overrides
});
const estimateInput = (lineItems: unknown[], selectedMainBasketIds = ["basket-a"], expectedVersion?: number) => ({
  propertyType: "apartment", rooms: [{ id: "room-one", label: "Living room" }], scopes: [],
  selectedMainBasketIds, lineItems, ...(expectedVersion === undefined ? {} : { expectedVersion })
});

type FixtureItem = {
  id: string;
  status: "draft" | "active" | "inactive" | "archived";
  revisionStatus?: "draft" | "active";
  itemType?: "main_line" | "temporary";
  subBasketId: string | null;
  basketId?: string;
  uomId?: string;
  itemVersion?: number;
  revisionVersion?: number;
  percentage?: number;
  completeSections?: string[];
};

async function seedFixtureItem(input: FixtureItem) {
  const revisionId = `revision-${input.id}`;
  const revisionStatus = input.revisionStatus ?? (input.status === "draft" ? "draft" : "active");
  await AiEstimatorKnowledgeMainLineModel.collection.insertOne({
    _id: input.id, basketId: input.basketId ?? "basket-a", subBasketId: input.subBasketId,
    name: input.id, displayOrder: 20, itemType: input.itemType ?? "main_line",
    status: input.status, version: input.itemVersion ?? 2,
    activeRevisionId: revisionStatus === "active" ? revisionId : null,
    draftRevisionId: revisionStatus === "draft" ? revisionId : null
  } as never);
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
    _id: revisionId, mainLineId: input.id, status: revisionStatus,
    version: input.revisionVersion ?? 3,
    completeness: {
      percentage: input.percentage ?? 75,
      sections: (input.completeSections ?? ["overview", "advanced", "recommendations"])
        .map((sectionKey) => ({ sectionKey, state: "complete" }))
    }
  } as never);
  await AiEstimatorKnowledgeSectionModel.collection.insertOne({
    _id: `overview-${input.id}`, mainLineId: input.id, revisionId,
    sectionKey: "overview", payload: { uomId: input.uomId ?? "uom-ea" }
  } as never);
  return revisionId;
}

describe("estimator configured catalogue and estimate", { timeout: 30_000 }, () => {
  it("projects the selected revision's combined In-house base rate without inventing missing prices", async () => {
    const overflowRevision = await seedFixtureItem({ id: "line-overflow", status: "active",
      itemType: "temporary", subBasketId: "sub-a" });
    await AiEstimatorKnowledgeSectionModel.collection.insertMany([
      { _id: "advanced-a", mainLineId: "line-a", revisionId: "revision-a", sectionKey: "advanced", applicability: "configured",
        payload: { modeCalculations: { in_house_labor: { baseRatePaise: 42_000 }, in_house_material: { baseRatePaise: 63_000 } } } },
      { _id: "advanced-b", mainLineId: "line-b", revisionId: "revision-b", sectionKey: "advanced", applicability: "configured",
        payload: { modeCalculations: { in_house: { baseRatePaise: 12_500 } } } },
      { _id: "advanced-temp", mainLineId: "line-temp", revisionId: "revision-temp", sectionKey: "advanced", applicability: "configured",
        payload: { modeCalculations: { in_house_labor: { baseRatePaise: 10_000 }, in_house_material: null } } },
      { _id: "advanced-temp-direct", mainLineId: "line-temp-direct", revisionId: "revision-temp-direct", sectionKey: "advanced", applicability: "configured",
        payload: { modeCalculations: { in_house_labor: { baseRatePaise: 0 }, in_house_material: { baseRatePaise: 0 } } } },
      { _id: "advanced-overflow", mainLineId: "line-overflow", revisionId: overflowRevision, sectionKey: "advanced", applicability: "configured",
        payload: { modeCalculations: { in_house_labor: { baseRatePaise: Number.MAX_SAFE_INTEGER },
          in_house_material: { baseRatePaise: 1 } } } }
    ] as never[]);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" },
      { $set: { draftRevisionId: "revision-a-pending" }, $inc: { version: 1 } });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
      _id: "revision-a-pending", mainLineId: "line-a", status: "draft", version: 1,
      completeness: { percentage: 100, sections: [{ sectionKey: "overview", state: "complete" },
        { sectionKey: "advanced", state: "complete" }] }
    } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({
      _id: "advanced-a-pending", mainLineId: "line-a", revisionId: "revision-a-pending", sectionKey: "advanced", applicability: "configured",
      payload: { modeCalculations: { in_house_labor: { baseRatePaise: 90_000 }, in_house_material: { baseRatePaise: 90_000 } } }
    } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({
      _id: "overview-a-pending", mainLineId: "line-a", revisionId: "revision-a-pending", sectionKey: "overview",
      payload: { uomId: "uom-sq" }
    } as never);

    const { server } = app();
    const response = await request(server).get("/api/v1/estimation/catalogue?limit=100&includeReadyNonActive=true")
      .set(bearer("estimator")).expect(200);
    const [electrical, joinery] = response.body.data.items;
    expect(electrical.subBaskets[0].mainLines[0]).toMatchObject({
      id: "line-a", revisionId: "revision-a-pending", revisionStatus: "draft", inHouseBaseRatePaise: 180_000
    });
    expect(electrical.subBaskets[0].temporaryItems.find((line: { id: string }) => line.id === "line-temp")).toMatchObject({
      id: "line-temp", inHouseBaseRatePaise: null
    });
    expect(electrical.subBaskets[0].temporaryItems.find((line: { id: string }) => line.id === "line-overflow"))
      .toMatchObject({ inHouseBaseRatePaise: null });
    expect(electrical.directTemporaryItems[0]).toMatchObject({
      id: "line-temp-direct", inHouseBaseRatePaise: 0
    });
    expect(joinery.subBaskets[0].mainLines[0]).toMatchObject({
      id: "line-b", inHouseBaseRatePaise: 12_500
    });
    expect(JSON.stringify(response.body.data)).not.toMatch(/minimumMarkupBps|startingMarkupBps|in_house_labor|in_house_material/iu);
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "advanced-a-pending" },
      { $set: { applicability: "not_applicable" } });
    const disabled = await request(server).get("/api/v1/estimation/catalogue?limit=100&includeReadyNonActive=true")
      .set(bearer("estimator")).expect(200);
    expect(disabled.body.data.items[0].subBaskets[0].mainLines[0]).toMatchObject({
      id: "line-a", inHouseBaseRatePaise: null
    });
    expect(disabled.body.data.items[1].subBaskets[0].mainLines[0]).toMatchObject({
      id: "line-b", inHouseBaseRatePaise: 12_500
    });
  });

  it("opts into ready Draft and Inactive items without changing the default Active-only catalogue", async () => {
    await seedFixtureItem({ id: "ready-draft-main", status: "draft", subBasketId: "sub-a",
      itemVersion: 4, revisionVersion: 7 });
    await seedFixtureItem({ id: "ready-draft-direct", status: "draft", itemType: "temporary",
      subBasketId: null, percentage: 100,
      completeSections: ["overview", "pricing", "recommendations", "quality"] });
    await seedFixtureItem({ id: "ready-inactive-grouped", status: "inactive", itemType: "temporary",
      subBasketId: "sub-a", revisionStatus: "active", percentage: 100,
      completeSections: ["overview", "advanced", "recommendations", "quality"] });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" },
      { $set: { draftRevisionId: "revision-active-pending" }, $inc: { version: 1 } });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
      _id: "revision-active-pending", mainLineId: "line-a", status: "draft", version: 3,
      completeness: { percentage: 100, sections: [
        { sectionKey: "overview", state: "complete" }, { sectionKey: "pricing", state: "complete" },
        { sectionKey: "recommendations", state: "complete" }, { sectionKey: "quality", state: "complete" }
      ] }
    } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({
      _id: "overview-active-pending", mainLineId: "line-a", revisionId: "revision-active-pending",
      sectionKey: "overview", payload: { uomId: "uom-sq" }
    } as never);
    const { server } = app();
    const defaultPage = await request(server).get("/api/v1/estimation/catalogue?limit=1")
      .set(bearer("estimator")).expect(200);
    const defaultBasket = defaultPage.body.data.items[0];
    expect(defaultBasket.subBaskets[0].mainLines.map((line: { id: string }) => line.id))
      .toEqual(["line-a"]);
    expect(defaultBasket.directTemporaryItems.map((line: { id: string }) => line.id))
      .toEqual(["line-temp-direct"]);
    expect(defaultBasket.subBaskets[0].mainLines[0]).toMatchObject({
      revisionId: "revision-active-pending", itemStatus: "active", revisionStatus: "draft",
      itemVersion: 2, revisionVersion: 3
    });
    const expanded = await request(server).get("/api/v1/estimation/catalogue?limit=1&includeReadyNonActive=true")
      .set(bearer("estimator")).expect(200);
    const basket = expanded.body.data.items[0];
    expect(basket.subBaskets[0].mainLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ready-draft-main", itemStatus: "draft", revisionStatus: "draft",
        itemVersion: 4, revisionVersion: 7, revisionId: "revision-ready-draft-main" })
    ]));
    expect(basket.subBaskets[0].temporaryItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ready-inactive-grouped", itemStatus: "inactive",
        revisionStatus: "active", revisionId: "revision-ready-inactive-grouped" })
    ]));
    expect(basket.directTemporaryItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ready-draft-direct", itemType: "temporary", subBasketId: null,
        itemStatus: "draft", revisionStatus: "draft" })
    ]));
    await request(server).get("/api/v1/estimation/catalogue?includeReadyNonActive=false")
      .set(bearer("estimator")).expect(200);
    await request(server).get("/api/v1/estimation/catalogue?includeReadyNonActive=maybe")
      .set(bearer("estimator")).expect(400);
    await request(server).get("/api/v1/estimation/catalogue?unexpected=true")
      .set(bearer("estimator")).expect(400);
  });

  it("uses an Inactive Draft revision ahead of its retained Active revision and excludes unready sources", async () => {
    const preferred = await seedFixtureItem({ id: "inactive-preferred", status: "inactive",
      revisionStatus: "draft", subBasketId: "sub-a", itemVersion: 5, revisionVersion: 4 });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "inactive-preferred" },
      { $set: { activeRevisionId: "revision-inactive-old" } });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
      _id: "revision-inactive-old", mainLineId: "inactive-preferred", status: "active", version: 1,
      completeness: { percentage: 100, sections: [{ sectionKey: "overview", state: "complete" },
        { sectionKey: "advanced", state: "complete" }] }
    } as never);
    for (const input of [
      { id: "missing-overview", status: "draft", subBasketId: "sub-a", completeSections: ["advanced"] },
      { id: "missing-mode", status: "inactive", subBasketId: "sub-a", completeSections: ["overview"] },
      { id: "wrong-parent", status: "draft", subBasketId: "sub-b" },
      { id: "archived-ready", status: "archived", subBasketId: "sub-a" },
      { id: "invalid-uom", status: "draft", subBasketId: "sub-a", uomId: "uom-archived" },
      { id: "direct-main", status: "inactive", subBasketId: null }
    ] as const) await seedFixtureItem({ ...input, completeSections: input.completeSections ? [...input.completeSections] : undefined });
    await seedFixtureItem({ id: "inactive-unready-draft", status: "inactive", revisionStatus: "draft",
      subBasketId: "sub-a", completeSections: ["overview"] });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "inactive-unready-draft" },
      { $set: { activeRevisionId: "revision-unready-old" } });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
      _id: "revision-unready-old", mainLineId: "inactive-unready-draft", status: "active", version: 1,
      completeness: { percentage: 100, sections: [{ sectionKey: "overview", state: "complete" },
        { sectionKey: "advanced", state: "complete" }] }
    } as never);
    const { server } = app();
    const response = await request(server).get("/api/v1/estimation/catalogue?limit=1&includeReadyNonActive=true")
      .set(bearer("estimator")).expect(200);
    const basket = response.body.data.items[0];
    const ids = [
      ...basket.subBaskets[0].mainLines.map((line: { id: string }) => line.id),
      ...basket.subBaskets[0].temporaryItems.map((line: { id: string }) => line.id),
      ...basket.directTemporaryItems.map((line: { id: string }) => line.id)
    ];
    expect(ids).toContain("inactive-preferred");
    expect(basket.subBaskets[0].mainLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "inactive-preferred", revisionId: preferred,
        revisionStatus: "draft", itemVersion: 5, revisionVersion: 4 })
    ]));
    for (const id of ["missing-overview", "missing-mode", "wrong-parent", "archived-ready",
      "invalid-uom", "direct-main", "inactive-unready-draft"]) expect(ids).not.toContain(id);
  });
  it("pages ordered active baskets with same-name Sub Baskets and filtered Overview UOMs", async () => {
    const { server } = app();
    const first = await request(server).get("/api/v1/estimation/catalogue?limit=1&offset=0")
      .set(bearer("estimator")).expect(200);
    expect(first.body.data.pagination).toEqual({ limit: 1, offset: 0, total: 3, hasMore: true });
    expect(first.body.data.items[0]).toMatchObject({ id: "basket-a", name: "Electrical", subBaskets: [{
      id: "sub-a", basketId: "basket-a", name: "Shared", temporaryItems: [{
        id: "line-temp", itemType: "temporary", subBasketId: "sub-a"
      }], mainLines: [{
        id: "line-a", mainLineId: "line-a", revisionId: "revision-a",
        itemType: "main_line",
        uom: { id: "uom-sq", code: "SQM", name: "Square metre", decimalScale: 2 }
      }]
    }], directTemporaryItems: [{
      id: "line-temp-direct", itemType: "temporary", subBasketId: null,
      revisionId: "revision-temp-direct", uom: { id: "uom-ea" }
    }] });
    expect(first.body.data.ineligibleLineCount).toBe(2);
    expect(JSON.stringify(first.body.data)).not.toMatch(/vendor|cost|margin|pricePaise/iu);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-b" }, { $unset: { itemType: "" } });
    const second = await request(server).get("/api/v1/estimation/catalogue?limit=1&offset=1")
      .set(bearer("estimator")).expect(200);
    expect(second.body.data.items[0].subBaskets[0]).toMatchObject({
      id: "sub-b", basketId: "basket-b", name: "Shared", mainLines: [{ id: "line-b" }]
    });
    const third = await request(server).get("/api/v1/estimation/catalogue?limit=1&offset=2")
      .set(bearer("estimator")).expect(200);
    expect(third.body.data.items[0]).toMatchObject({ id: "basket-c", directTemporaryItems: [],
      subBaskets: [{ id: "sub-c", mainLines: [], temporaryItems: [] }] });
    expect(third.body.data.pagination.hasMore).toBe(false);
  });

  it("filters ineligible temporary fixtures by parent, revision, UOM, status, and active basket", async () => {
    await AiEstimatorKnowledgeUomModel.collection.insertOne({
      _id: "uom-invalid-scale", code: "BAD", name: "Invalid scale", decimalScale: 8, status: "active"
    } as never);
    await AiEstimatorKnowledgeMainLineModel.collection.insertMany([
      { _id: "temp-wrong-parent", basketId: "basket-a", subBasketId: "sub-b", name: "Wrong parent", displayOrder: 7, itemType: "temporary", status: "active", activeRevisionId: "rev-wrong-parent" },
      { _id: "temp-blank-parent", basketId: "basket-a", subBasketId: "", name: "Blank parent", displayOrder: 7, itemType: "temporary", status: "active", activeRevisionId: "rev-blank-parent" },
      { _id: "temp-bad-uom", basketId: "basket-a", subBasketId: null, name: "Archived UOM", displayOrder: 8, itemType: "temporary", status: "active", activeRevisionId: "rev-bad-uom" },
      { _id: "temp-invalid-scale", basketId: "basket-a", subBasketId: null, name: "Invalid scale", displayOrder: 8, itemType: "temporary", status: "active", activeRevisionId: "rev-invalid-scale" },
      { _id: "temp-stale-revision", basketId: "basket-a", subBasketId: null, name: "Stale revision", displayOrder: 9, itemType: "temporary", status: "active", activeRevisionId: "rev-stale" },
      { _id: "temp-mismatched-revision", basketId: "basket-a", subBasketId: null, name: "Wrong revision owner", displayOrder: 9, itemType: "temporary", status: "active", activeRevisionId: "rev-mismatched" },
      { _id: "temp-no-revision", basketId: "basket-a", subBasketId: null, name: "No revision", displayOrder: 10, itemType: "temporary", status: "active" },
      { _id: "temp-inactive", basketId: "basket-a", subBasketId: null, name: "Inactive", displayOrder: 11, itemType: "temporary", status: "inactive", activeRevisionId: "rev-inactive" },
      { _id: "temp-archived", basketId: "basket-a", subBasketId: null, name: "Archived", displayOrder: 12, itemType: "temporary", status: "archived", activeRevisionId: "rev-archived" },
      { _id: "temp-hidden-basket", basketId: "basket-hidden", subBasketId: null, name: "Hidden", displayOrder: 1, itemType: "temporary", status: "active", activeRevisionId: "rev-hidden" }
    ] as never[]);
    await AiEstimatorKnowledgeRevisionModel.collection.insertMany([
      { _id: "rev-wrong-parent", mainLineId: "temp-wrong-parent", status: "active" },
      { _id: "rev-blank-parent", mainLineId: "temp-blank-parent", status: "active" },
      { _id: "rev-bad-uom", mainLineId: "temp-bad-uom", status: "active" },
      { _id: "rev-invalid-scale", mainLineId: "temp-invalid-scale", status: "active" },
      { _id: "rev-stale", mainLineId: "temp-stale-revision", status: "draft" },
      { _id: "rev-mismatched", mainLineId: "line-a", status: "active" }
    ] as never[]);
    await AiEstimatorKnowledgeSectionModel.collection.insertMany([
      { _id: "overview-wrong-parent", mainLineId: "temp-wrong-parent", revisionId: "rev-wrong-parent", sectionKey: "overview", payload: { uomId: "uom-ea" } },
      { _id: "overview-blank-parent", mainLineId: "temp-blank-parent", revisionId: "rev-blank-parent", sectionKey: "overview", payload: { uomId: "uom-ea" } },
      { _id: "overview-bad-uom", mainLineId: "temp-bad-uom", revisionId: "rev-bad-uom", sectionKey: "overview", payload: { uomId: "uom-archived" } },
      { _id: "overview-invalid-scale", mainLineId: "temp-invalid-scale", revisionId: "rev-invalid-scale", sectionKey: "overview", payload: { uomId: "uom-invalid-scale" } },
      { _id: "overview-stale", mainLineId: "temp-stale-revision", revisionId: "rev-stale", sectionKey: "overview", payload: { uomId: "uom-ea" } }
    ] as never[]);
    const { server } = app();
    const response = await request(server).get("/api/v1/estimation/catalogue?limit=1")
      .set(bearer("estimator")).expect(200);
    expect(response.body.data.ineligibleLineCount).toBe(9);
    expect(response.body.data.items[0].directTemporaryItems.map((item: { id: string }) => item.id))
      .toEqual(["line-temp-direct"]);
    expect(response.body.data.items[0].subBaskets[0].temporaryItems.map((item: { id: string }) => item.id))
      .toEqual(["line-temp"]);
  });

  it("authorizes only Estimator/Sales and Super Admin, including an active actor recheck", async () => {
    const { server } = app();
    for (const actor of ["estimator", "superAdmin"] as const) {
      await request(server).get("/api/v1/estimation/catalogue").set(bearer(actor)).expect(200);
      await request(server).get("/api/v1/estimation/catalogue?includeReadyNonActive=true")
        .set(bearer(actor)).expect(200);
      expect(hasPermission(actors[actor].role, "estimation.catalogue.read")).toBe(true);
    }
    for (const actor of ["procurement", "designer", "client"] as const) {
      await request(server).get("/api/v1/estimation/catalogue").set(bearer(actor)).expect(403);
      await request(server).get("/api/v1/estimation/catalogue?includeReadyNonActive=true")
        .set(bearer(actor)).expect(403);
      expect(hasPermission(actors[actor].role, "estimation.catalogue.read")).toBe(false);
    }
    await UserModel.updateOne({ _id: "estimator" }, { $set: { active: false } });
    await request(server).get("/api/v1/estimation/catalogue").set(bearer("estimator")).expect(403);
    await request(server).get("/api/v1/estimation/catalogue?limit=101").set(bearer("superAdmin")).expect(400);
  });

  it("saves an incomplete draft, distinguishes zero, and rebases current Configuration on the next save", async () => {
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
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: "revision-a" }, { $set: {
      completeness: { percentage: 75, sections: [{ sectionKey: "overview", state: "complete" },
        { sectionKey: "advanced", state: "complete" }] }
    } });
    const projected = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(projected.body.data.lineItems[0]).toMatchObject({ id: savedId,
      mainBasketName: "Renamed", mainLineName: "Renamed", ratePaise: 0 });
    const unmodified = await EstimateModel.findOne({ leadId: "lead-a" }).lean();
    expect(unmodified?.lineItems[0]).toMatchObject({ mainBasketName: "Electrical", mainLineName: "Wiring" });
    const retained = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: savedId, ratePaise: 12999 })], ["basket-a"], zero.body.data.version)).expect(200);
    expect(retained.body.data).toMatchObject({
      subtotalPaise: 16249, gstPaise: 2925, totalPaise: 19174,
      subtotal: 162.49, gst: 29.25, total: 191.74,
      lineItems: [{ id: savedId, revisionId: "revision-a", mainBasketName: "Renamed",
        mainLineName: "Renamed", ratePaise: 12999, amountPaise: 16249 }]
    });
    const persisted = await EstimateModel.findOne({ leadId: "lead-a" }).lean();
    expect(persisted?.lineItems[0]).toMatchObject({ id: savedId, mainLineId: "line-a", amountPaise: 16249 });
  });

  it("refreshes the same Main Line in multiple editable estimates while leaving an approved estimate historical", async () => {
    const { server, publication } = app();
    const paths = ["lead-live-one", "lead-live-two", "lead-approved"].map((leadId) =>
      `/api/v1/leads/${leadId}/estimate`);
    const saved = await Promise.all(paths.map((path) => request(server).put(path)
      .set(bearer("estimator")).send(estimateInput([configuredLine({ classification: "special" })])).expect(200)));
    await EstimateModel.collection.updateOne({ leadId: "lead-approved" }, { $set: { status: "client_approved" } });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" }, {
      $set: { name: "Current wiring", draftRevisionId: "revision-a-current" }, $inc: { version: 1 }
    });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
      _id: "revision-a-current", mainLineId: "line-a", status: "draft", version: 1,
      completeness: { percentage: 75, sections: [
        { sectionKey: "overview", state: "complete" }, { sectionKey: "advanced", state: "complete" }
      ] }
    } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({
      _id: "overview-a-current", mainLineId: "line-a", revisionId: "revision-a-current",
      sectionKey: "overview", payload: { uomId: "uom-sq" }
    } as never);
    const live = await Promise.all(paths.slice(0, 2).map((path) =>
      request(server).get(path).set(bearer("estimator")).expect(200)));
    for (const item of live) {
      expect(item.body.data.lineItems[0]).toMatchObject({
        revisionId: "revision-a-current", mainLineName: "Current wiring",
        sourceRevisionStatus: "draft", classification: "special", quantity: 1.25, ratePaise: 12999
      });
    }
    const approved = await request(server).get(paths[2]!).set(bearer("estimator")).expect(200);
    expect(approved.body.data.lineItems[0]).toMatchObject({
      revisionId: "revision-a", mainLineName: "Wiring", ratePaise: 12999
    });
    const beforeSave = await EstimateModel.findOne({ leadId: "lead-live-one" }).lean();
    expect(beforeSave?.lineItems[0]).toMatchObject({ revisionId: "revision-a", mainLineName: "Wiring" });
    const staleSubmit = await request(server).post(`${paths[0]}/submit`).set(bearer("estimator")).expect(409);
    expect(staleSubmit.body.error.code).toBe("ESTIMATE_CONFIGURATION_CHANGED");
    expect(publication.publishEstimateToClient).not.toHaveBeenCalled();
    const resaved = await request(server).put(paths[0]!).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: saved[0]!.body.data.lineItems[0].id,
        classification: "special" })], ["basket-a"], saved[0]!.body.data.version)).expect(200);
    expect(resaved.body.data.lineItems[0]).toMatchObject({
      id: saved[0]!.body.data.lineItems[0].id, revisionId: "revision-a-current",
      mainLineName: "Current wiring", classification: "special", quantity: 1.25, ratePaise: 12999
    });
    const otherSaved = await EstimateModel.findOne({ leadId: "lead-live-two" }).lean();
    expect(otherSaved?.lineItems[0]).toMatchObject({ revisionId: "revision-a", mainLineName: "Wiring" });
  });

  it("flags a changed UOM on draft read and requires a corrected quantity before saving", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-uom-changed/estimate";
    const saved = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine()])).expect(200);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" }, {
      $set: { draftRevisionId: "revision-a-each" }, $inc: { version: 1 }
    });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({
      _id: "revision-a-each", mainLineId: "line-a", status: "draft", version: 1,
      completeness: { percentage: 75, sections: [
        { sectionKey: "overview", state: "complete" }, { sectionKey: "advanced", state: "complete" }
      ] }
    } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({
      _id: "overview-a-each", mainLineId: "line-a", revisionId: "revision-a-each",
      sectionKey: "overview", payload: { uomId: "uom-ea" }
    } as never);
    const projected = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(projected.body.data).toMatchObject({ isIncomplete: true,
      lineItems: [{ id: saved.body.data.lineItems[0].id, uomId: "uom-ea", uomName: "Each",
        previousUomName: "Square metre", configurationUomChanged: true,
        quantity: 1.25, ratePaise: 12999 }] });
    const stale = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: saved.body.data.lineItems[0].id })],
        ["basket-a"], saved.body.data.version)).expect(409);
    expect(stale.body.error.code).toBe("ESTIMATE_UOM_CHANGED");
    const fractional = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: saved.body.data.lineItems[0].id,
        revisionId: "revision-a-each", uomId: "uom-ea" })],
        ["basket-a"], saved.body.data.version)).expect(400);
    expect(fractional.body.error.code).toBe("ESTIMATE_QUANTITY_INVALID");
    const corrected = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: saved.body.data.lineItems[0].id,
        revisionId: "revision-a-each", uomId: "uom-ea", quantity: 2 })],
        ["basket-a"], saved.body.data.version)).expect(200);
    expect(corrected.body.data.lineItems[0]).toMatchObject({
      id: saved.body.data.lineItems[0].id, revisionId: "revision-a-each", uomId: "uom-ea",
      quantity: 2, ratePaise: 12999, amountPaise: 25998, configurationUomChanged: false
    });
  });

  it("fences configured masters and Main Line before a high-value estimate enters approval", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-high-value-configured/estimate";
    const saved = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ ratePaise: 200_000_000 })])).expect(200);
    expect(saved.body.data.total).toBeGreaterThan(1_500_000);
    const before = await AiEstimatorKnowledgeMainLineModel.findById("line-a").lean();
    const basketBefore = await AiEstimatorKnowledgeBasketModel.findById("basket-a").lean();
    const subBasketBefore = await AiEstimatorKnowledgeSubBasketModel.findById("sub-a").lean();
    const uomBefore = await AiEstimatorKnowledgeUomModel.findById("uom-sq").lean();
    const submitted = await request(server).post(`${path}/submit`).set(bearer("estimator")).expect(200);
    expect(submitted.body.data.status).toBe("pending_manager_assignment");
    const after = await AiEstimatorKnowledgeMainLineModel.findById("line-a").lean();
    expect(after?.dependencyEpoch).toBe((before?.dependencyEpoch ?? 0) + 1);
    expect(after?.version).toBe(before?.version);
    const basketAfter = await AiEstimatorKnowledgeBasketModel.findById("basket-a").lean();
    const subBasketAfter = await AiEstimatorKnowledgeSubBasketModel.findById("sub-a").lean();
    const uomAfter = await AiEstimatorKnowledgeUomModel.findById("uom-sq").lean();
    for (const [previous, current] of [
      [basketBefore, basketAfter], [subBasketBefore, subBasketAfter], [uomBefore, uomAfter]
    ] as const) {
      expect(current?.dependencyEpoch).toBe((previous?.dependencyEpoch ?? 0) + 1);
      expect(current?.version).toBe(previous?.version);
      expect(current?.updatedAt).toEqual(previous?.updatedAt);
    }
  });

  it("saves direct and grouped temporary items with real parentage, then reloads and submits them", async () => {
    const { server, publication } = app();
    const path = "/api/v1/leads/lead-temporary/estimate";
    const incomplete = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([directTemporaryLine({ ratePaise: null }), groupedTemporaryLine()])).expect(200);
    expect(incomplete.body.data).toMatchObject({
      isIncomplete: true, subtotalPaise: 2703, gstPaise: 487, totalPaise: 3190,
      lineItems: [{ itemType: "temporary", subBasketId: null, subBasketName: null,
        mainBasketName: "Electrical", mainLineName: "Direct temporary", amountPaise: null },
      { itemType: "temporary", subBasketId: "sub-a", subBasketName: "Shared",
        mainLineName: "Temporary", amountPaise: 2703 }]
    });
    await request(server).post(`${path}/submit`).set(bearer("estimator")).expect(409);
    const directId = incomplete.body.data.lineItems[0].id;
    const groupedId = incomplete.body.data.lineItems[1].id;
    const zero = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([
        directTemporaryLine({ id: directId, ratePaise: 0 }),
        groupedTemporaryLine({ id: groupedId })
      ], ["basket-a"], incomplete.body.data.version)).expect(200);
    expect(zero.body.data).toMatchObject({ isIncomplete: false, subtotalPaise: 2703,
      lineItems: [{ id: directId, ratePaise: 0, amountPaise: 0 }, { id: groupedId }] });
    const reloaded = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(reloaded.body.data.lineItems[0]).toMatchObject({
      id: directId, itemType: "temporary", subBasketId: null, subBasketName: null
    });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "line-temp-direct" },
      { $set: { name: "Renamed direct", status: "inactive" } });
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: "revision-temp-direct" }, { $set: {
      completeness: { percentage: 75, sections: [{ sectionKey: "overview", state: "complete" },
        { sectionKey: "advanced", state: "complete" }] }
    } });
    const retained = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([
        directTemporaryLine({ id: directId }), groupedTemporaryLine({ id: groupedId })
      ], ["basket-a"], zero.body.data.version)).expect(200);
    expect(retained.body.data).toMatchObject({
      isIncomplete: false, subtotalPaise: 4705, gstPaise: 847, totalPaise: 5552,
      lineItems: [{ id: directId, itemType: "temporary", subBasketId: null,
        subBasketName: null, mainLineName: "Renamed direct", ratePaise: 1001, amountPaise: 2002 },
      { id: groupedId, itemType: "temporary", subBasketId: "sub-a", amountPaise: 2703 }]
    });
    const persisted = await EstimateModel.findOne({ leadId: "lead-temporary" }).lean();
    expect(persisted?.lineItems[0]).toMatchObject({
      id: directId, itemType: "temporary", subBasketId: null, subBasketName: null,
      mainLineName: "Renamed direct", amountPaise: 2002
    });
    await request(server).post(`${path}/submit`).set(bearer("estimator")).expect(200);
    expect(publication.publishEstimateToClient).toHaveBeenCalledWith(expect.objectContaining({
      estimateId: retained.body.data.id, expectedEstimateVersion: retained.body.data.version
    }));
  });

  it("rejects wrong type, parent, revision, UOM, and unselected basket for new temporary items", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-invalid-temp/estimate";
    for (const [line, baskets, status] of [
      [directTemporaryLine({ itemType: "main_line" }), ["basket-a"], 400],
      [directTemporaryLine({ subBasketId: "sub-a" }), ["basket-a"], 409],
      [groupedTemporaryLine({ subBasketId: null }), ["basket-a"], 409],
      [groupedTemporaryLine({ subBasketId: "sub-b" }), ["basket-a"], 409],
      [directTemporaryLine({ revisionId: "revision-a" }), ["basket-a"], 409],
      [directTemporaryLine({ uomId: "uom-sq" }), ["basket-a"], 409],
      [directTemporaryLine(), ["basket-b"], 400],
      [configuredLine({ itemType: "temporary" }), ["basket-a"], 409],
      [configuredLine({ subBasketId: null }), ["basket-a"], 400]
    ] as const) {
      await request(server).put(path).set(bearer("estimator"))
        .send(estimateInput([line], [...baskets])).expect(status);
    }
    expect(await EstimateModel.countDocuments({ leadId: "lead-invalid-temp" })).toBe(0);
  });

  it("rejects a temporary item that deactivates after catalogue read but before first save", async () => {
    const { server } = app();
    await request(server).get("/api/v1/estimation/catalogue").set(bearer("estimator")).expect(200);
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "line-temp-direct" },
      { $set: { status: "inactive" } });
    const response = await request(server).put("/api/v1/leads/lead-stale-temp/estimate")
      .set(bearer("estimator")).send(estimateInput([directTemporaryLine()])).expect(409);
    expect(response.body.error.code).toBe("ESTIMATE_CATALOGUE_CHANGED");
    expect(await EstimateModel.countDocuments({ leadId: "lead-stale-temp" })).toBe(0);
  });

  it("reads and edits a historical configured line without an item type as an ordinary Main Line", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-historical/estimate";
    const first = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine()])).expect(200);
    const savedId = first.body.data.lineItems[0].id;
    await EstimateModel.collection.updateOne({ _id: first.body.data.id },
      { $unset: { "lineItems.0.itemType": "", "lineItems.0.sourceItemStatus": "",
        "lineItems.0.sourceRevisionStatus": "", "lineItems.0.sourceItemVersion": "",
        "lineItems.0.sourceRevisionVersion": "" } });
    const historical = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(historical.body.data.lineItems[0]).toMatchObject({ itemType: "main_line",
      sourceItemStatus: "active", sourceRevisionStatus: "active" });
    const diskBeforeSave = await EstimateModel.findById(first.body.data.id).lean();
    expect(diskBeforeSave?.lineItems[0]).not.toHaveProperty("itemType");
    const revised = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([configuredLine({ id: savedId, ratePaise: 1000 })],
        ["basket-a"], first.body.data.version)).expect(200);
    expect(revised.body.data.lineItems[0]).toMatchObject({
      id: savedId, itemType: "main_line", subBasketId: "sub-a", subBasketName: "Shared",
      sourceItemStatus: "active"
    });
  });

  it("requires current Draft and Inactive versions on first save, then rejects an archived source", async () => {
    const draftRevision = await seedFixtureItem({ id: "save-draft", status: "draft",
      itemType: "temporary", subBasketId: null, itemVersion: 5, revisionVersion: 8 });
    const inactiveRevision = await seedFixtureItem({ id: "save-inactive", status: "inactive",
      subBasketId: "sub-a", itemVersion: 6, revisionVersion: 2 });
    const { server } = app();
    const path = "/api/v1/leads/lead-ready-save/estimate";
    const draftLine = directTemporaryLine({ catalogueId: "save-draft", mainLineId: "save-draft",
      revisionId: draftRevision, quantity: 2 });
    const inactiveLine = configuredLine({ catalogueId: "save-inactive", mainLineId: "save-inactive",
      revisionId: inactiveRevision, uomId: "uom-ea", quantity: 2 });
    for (const line of [draftLine, { ...draftLine, itemVersion: 5 },
      { ...draftLine, itemVersion: 4, revisionVersion: 8 },
      { ...inactiveLine, revisionVersion: 2 }]) {
      const rejected = await request(server).put(path).set(bearer("estimator"))
        .send(estimateInput([line])).expect(409);
      expect(rejected.body.error.code).toBe("ESTIMATE_CATALOGUE_CHANGED");
    }
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: draftRevision },
      { $inc: { version: 1 } });
    const stale = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([{ ...draftLine, itemVersion: 5, revisionVersion: 8 }])).expect(409);
    expect(stale.body.error.code).toBe("ESTIMATE_CATALOGUE_CHANGED");
    expect(await EstimateModel.countDocuments({ leadId: "lead-ready-save" })).toBe(0);
    const saved = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([
        { ...draftLine, itemVersion: 5, revisionVersion: 9 },
        { ...inactiveLine, itemVersion: 6, revisionVersion: 2 }
      ])).expect(200);
    expect(saved.body.data.lineItems).toEqual([
      expect.objectContaining({ itemType: "temporary", sourceItemStatus: "draft",
        sourceRevisionStatus: "draft", sourceItemVersion: 5, sourceRevisionVersion: 9,
        revisionId: draftRevision, subBasketId: null, amountPaise: 2002 }),
      expect.objectContaining({ itemType: "main_line", sourceItemStatus: "inactive",
        sourceRevisionStatus: "active", sourceItemVersion: 6, sourceRevisionVersion: 2,
        revisionId: inactiveRevision, subBasketId: "sub-a", amountPaise: 25998 })
    ]);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "save-draft" },
      { $set: { name: "Changed source", status: "archived" }, $inc: { version: 1 } });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: draftRevision },
      { $inc: { version: 1 } });
    const projected = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(projected.body.data.lineItems[0]).toMatchObject({ configurationSourceUnavailable: true });
    const retained = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([
        { ...draftLine, id: saved.body.data.lineItems[0].id, itemVersion: 5, revisionVersion: 9 },
        { ...inactiveLine, id: saved.body.data.lineItems[1].id, itemVersion: 6, revisionVersion: 2 }
      ], ["basket-a"], saved.body.data.version)).expect(409);
    expect(retained.body.error.code).toBe("ESTIMATE_CONFIGURATION_UNAVAILABLE");
    const stored = await EstimateModel.findOne({ leadId: "lead-ready-save" }).lean();
    expect(stored?.lineItems[0]).toMatchObject({ sourceItemStatus: "draft",
      sourceRevisionStatus: "draft", sourceItemVersion: 5, sourceRevisionVersion: 9 });
  });

  it("rejects changed readiness or lifecycle between catalogue read and first save", async () => {
    const readinessRevision = await seedFixtureItem({ id: "readiness-changed", status: "draft",
      subBasketId: "sub-a", itemVersion: 2, revisionVersion: 3 });
    const lifecycleRevision = await seedFixtureItem({ id: "lifecycle-changed", status: "draft",
      subBasketId: "sub-a", itemVersion: 4, revisionVersion: 5 });
    const { server } = app();
    const catalogue = await request(server).get("/api/v1/estimation/catalogue?limit=1&includeReadyNonActive=true")
      .set(bearer("estimator")).expect(200);
    expect(catalogue.body.data.items[0].subBaskets[0].mainLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "readiness-changed", itemVersion: 2, revisionVersion: 3 }),
      expect.objectContaining({ id: "lifecycle-changed", itemVersion: 4, revisionVersion: 5 })
    ]));
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: readinessRevision },
      { $set: { "completeness.sections": [
        { sectionKey: "overview", state: "complete" },
        { sectionKey: "advanced", state: "needs_attention" }
      ] }, $inc: { version: 1 } });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "lifecycle-changed" },
      { $set: { status: "inactive" }, $inc: { version: 1 } });
    const readinessLine = configuredLine({ catalogueId: "readiness-changed",
      mainLineId: "readiness-changed", revisionId: readinessRevision, uomId: "uom-ea",
      quantity: 2, itemVersion: 2, revisionVersion: 3 });
    const lifecycleLine = configuredLine({ catalogueId: "lifecycle-changed",
      mainLineId: "lifecycle-changed", revisionId: lifecycleRevision, uomId: "uom-ea",
      quantity: 2, itemVersion: 4, revisionVersion: 5 });
    for (const line of [readinessLine, { ...readinessLine, revisionVersion: 4 }, lifecycleLine]) {
      const response = await request(server).put("/api/v1/leads/lead-stale-ready/estimate")
        .set(bearer("estimator")).send(estimateInput([line])).expect(409);
      expect(response.body.error.code).toBe("ESTIMATE_CATALOGUE_CHANGED");
    }
    const activeWithVersion = await request(server).put("/api/v1/leads/lead-active-version/estimate")
      .set(bearer("estimator")).send(estimateInput([configuredLine({ itemVersion: 99,
        revisionVersion: 1 })])).expect(409);
    expect(activeWithVersion.body.error.code).toBe("ESTIMATE_CATALOGUE_CHANGED");
    expect(await EstimateModel.countDocuments({ leadId: { $in: ["lead-stale-ready", "lead-active-version"] } })).toBe(0);
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
      .send(estimateInput([], ["basket-c"])).expect(200);
    expect(basketOnly.body.data.selectedMainBasketIds).toEqual(["basket-c"]);
    const changed = await request(server).put(selectionPath).set(bearer("estimator"))
      .send({ ...estimateInput([], ["basket-c"]), expectedVersion: basketOnly.body.data.version, propertyType: "villa" }).expect(200);
    expect(changed.body.data.version).toBe(basketOnly.body.data.version + 1);
    await request(server).put(selectionPath).set(bearer("estimator"))
      .send({ ...estimateInput([], ["basket-c"]), expectedVersion: basketOnly.body.data.version, propertyType: "stale" }).expect(409);
  });

  it("persists independent basket and configured item classifications by stable IDs", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-classified/estimate";
    const rooms = [{ id: "room-one", label: "Living room" }, { id: "room-two", label: "Bedroom" }];
    const lines = [
      configuredLine({ roomId: "room-one", roomName: "Living room", classification: "special" }),
      configuredLine({ roomId: "room-two", roomName: "Bedroom", quantity: 2,
        ratePaise: 1000, classification: "standard" }),
      configuredLine({ catalogueId: "line-b", mainLineId: "line-b", mainBasketId: "basket-b",
        subBasketId: "sub-b", revisionId: "revision-b", uomId: "uom-ea", roomId: "room-two",
        roomName: "Bedroom", quantity: 1, ratePaise: 2000, classification: "special" }),
      directTemporaryLine({ classification: "standard" })
    ];
    const basketClassifications = [
      { mainBasketId: "basket-a", classification: "special" },
      { mainBasketId: "basket-b", classification: "standard" },
      { mainBasketId: "basket-c", classification: "special" }
    ];
    const first = await request(server).put(path).set(bearer("estimator")).send({
      propertyType: "apartment", rooms, scopes: [],
      selectedMainBasketIds: ["basket-a", "basket-b", "basket-c"],
      selectedMainBasketClassifications: basketClassifications,
      lineItems: lines
    }).expect(200);
    expect(first.body.data).toMatchObject({
      selectedMainBasketClassifications: basketClassifications,
      subtotalPaise: 22_251, gstPaise: 4_005, totalPaise: 26_256
    });
    expect(first.body.data.lineItems.map((line: { roomId: string; mainLineId: string;
      itemType?: string; classification: string }) => ({ roomId: line.roomId, mainLineId: line.mainLineId,
      itemType: line.itemType, classification: line.classification }))).toEqual([
      { roomId: "room-one", mainLineId: "line-a", itemType: "main_line", classification: "special" },
      { roomId: "room-two", mainLineId: "line-a", itemType: "main_line", classification: "standard" },
      { roomId: "room-two", mainLineId: "line-b", itemType: "main_line", classification: "special" },
      { roomId: "room-one", mainLineId: "line-temp-direct", itemType: "temporary", classification: "standard" }
    ]);
    const reloaded = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(reloaded.body.data.selectedMainBasketClassifications).toEqual(basketClassifications);
    const priorIds = new Map(first.body.data.lineItems.map((line: { roomId: string; mainLineId: string; id: string }) =>
      [`${line.roomId}:${line.mainLineId}`, line.id]));
    const olderClientSave = await request(server).put(path).set(bearer("estimator")).send({
      propertyType: "apartment", rooms, scopes: [], expectedVersion: first.body.data.version,
      selectedMainBasketIds: ["basket-b", "basket-a", "basket-c"],
      lineItems: [...lines].reverse().map(({ classification: _classification, ...line }) => line)
    }).expect(200);
    expect(olderClientSave.body.data.selectedMainBasketClassifications).toEqual([
      basketClassifications[1], basketClassifications[0], basketClassifications[2]
    ]);
    expect(olderClientSave.body.data.lineItems.map((line: { roomId: string; mainLineId: string;
      id: string; classification: string }) => ({
      id: line.id, classification: line.classification,
      expectedId: priorIds.get(`${line.roomId}:${line.mainLineId}`)
    }))).toEqual([
      { id: priorIds.get("room-one:line-temp-direct"), classification: "standard", expectedId: priorIds.get("room-one:line-temp-direct") },
      { id: priorIds.get("room-two:line-b"), classification: "special", expectedId: priorIds.get("room-two:line-b") },
      { id: priorIds.get("room-two:line-a"), classification: "standard", expectedId: priorIds.get("room-two:line-a") },
      { id: priorIds.get("room-one:line-a"), classification: "special", expectedId: priorIds.get("room-one:line-a") }
    ]);
    expect(olderClientSave.body.data).toMatchObject({ subtotalPaise: 22_251, totalPaise: 26_256 });
    const stale = await request(server).put(path).set(bearer("estimator")).send({
      ...estimateInput([], ["basket-a"], first.body.data.version),
      selectedMainBasketClassifications: [{ mainBasketId: "basket-a", classification: "standard" }]
    }).expect(409);
    expect(stale.body.error.code).toBe("ESTIMATE_VERSION_CONFLICT");
  });

  it("rejects invalid explicit classifications and defaults historical missing values without rewriting them", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-classification-validation/estimate";
    const input = estimateInput([configuredLine()], ["basket-a", "basket-c"]);
    for (const selectedMainBasketClassifications of [
      [{ mainBasketId: "basket-a", classification: "special" }],
      [{ mainBasketId: "basket-a", classification: "special" }, { mainBasketId: "basket-a", classification: "standard" }],
      [{ mainBasketId: "basket-a", classification: "special" }, { mainBasketId: "basket-other", classification: "standard" }],
      [{ mainBasketId: "basket-a", classification: "custom" }, { mainBasketId: "basket-c", classification: "standard" }]
    ]) {
      await request(server).put(path).set(bearer("estimator"))
        .send({ ...input, selectedMainBasketClassifications }).expect(400);
    }
    await request(server).put(path).set(bearer("estimator"))
      .send({ ...input, lineItems: [configuredLine({ classification: "custom" })] }).expect(400);
    expect(await EstimateModel.countDocuments({ leadId: "lead-classification-validation" })).toBe(0);

    const saved = await request(server).put(path).set(bearer("estimator"))
      .send({ ...input, selectedMainBasketClassifications: [
        { mainBasketId: "basket-a", classification: "special" },
        { mainBasketId: "basket-c", classification: "standard" }
      ], lineItems: [configuredLine({ classification: "special" })] }).expect(200);
    const { selectedMainBasketIds: _selectedMainBasketIds, ...withoutSelectedIds } = input;
    await request(server).put(path).set(bearer("estimator"))
      .send({ ...withoutSelectedIds, expectedVersion: saved.body.data.version,
        selectedMainBasketClassifications: [{ mainBasketId: "basket-a", classification: "special" }] })
      .expect(400);
    await EstimateModel.collection.updateOne({ leadId: "lead-classification-validation" }, {
      $unset: { selectedMainBasketClassifications: "", "lineItems.$[].classification": "" }
    });
    const historical = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(historical.body.data.selectedMainBasketClassifications).toEqual([
      { mainBasketId: "basket-a", classification: "standard" },
      { mainBasketId: "basket-c", classification: "standard" }
    ]);
    expect(historical.body.data.lineItems[0].classification).toBe("standard");
    const disk = await EstimateModel.collection.findOne({ leadId: "lead-classification-validation" });
    expect(disk).not.toHaveProperty("selectedMainBasketClassifications");
    expect(disk?.lineItems[0]).not.toHaveProperty("classification");
    const resaved = await request(server).put(path).set(bearer("estimator"))
      .send({ ...input, expectedVersion: saved.body.data.version }).expect(200);
    expect(resaved.body.data.selectedMainBasketClassifications).toEqual(historical.body.data.selectedMainBasketClassifications);
    expect(resaved.body.data.lineItems[0].classification).toBe("standard");
  });

  it("persists shared recommendation origins and cascades deselection before calculating totals", async () => {
    await seedFixtureItem({ id: "line-c", status: "active", subBasketId: "sub-a" });
    const { server } = app();
    const path = "/api/v1/leads/lead-recommended-chain/estimate";
    const sourceA = configuredLine();
    const sourceC = configuredLine({ catalogueId: "line-c", mainLineId: "line-c",
      revisionId: "revision-line-c", uomId: "uom-ea", quantity: 1, ratePaise: 4000 });
    const sharedTarget = configuredLine({ catalogueId: "line-b", mainLineId: "line-b",
      mainBasketId: "basket-b", subBasketId: "sub-b", revisionId: "revision-b",
      uomId: "uom-ea", quantity: 1, ratePaise: 2000,
      recommendationSourceMainLineIds: ["line-a", "line-c"] });
    const chainedTarget = groupedTemporaryLine({ recommendationSourceMainLineIds: ["line-b"] });
    const selected = ["basket-a", "basket-b"];
    const initial = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([sourceA, sourceC, sharedTarget, chainedTarget], selected)).expect(200);
    expect(initial.body.data).toMatchObject({ subtotalPaise: 24952, gstPaise: 4491,
      lineItems: [
        { included: true }, { included: true },
        { included: true, recommendationSourceMainLineIds: ["line-a", "line-c"] },
        { included: true, recommendationSourceMainLineIds: ["line-b"] }
      ] });
    const reloaded = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(reloaded.body.data.lineItems[2].recommendationSourceMainLineIds).toEqual(["line-a", "line-c"]);
    const lineIds = initial.body.data.lineItems.map((line: { id: string }) => line.id);

    const oneSourceRemoved = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([{ ...sourceA, included: false }, sourceC, sharedTarget, chainedTarget],
        selected, initial.body.data.version)).expect(200);
    expect(oneSourceRemoved.body.data).toMatchObject({ subtotalPaise: 8703, gstPaise: 1567,
      lineItems: [
        { included: false, amountPaise: 0 }, { included: true },
        { included: true, recommendationSourceMainLineIds: ["line-c"] },
        { included: true, recommendationSourceMainLineIds: ["line-b"] }
      ] });

    const allSourcesRemoved = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([{ ...sourceA, included: false }, { ...sourceC, included: false },
        sharedTarget, chainedTarget], selected, oneSourceRemoved.body.data.version)).expect(200);
    expect(allSourcesRemoved.body.data).toMatchObject({ subtotalPaise: 0, gstPaise: 0, totalPaise: 0,
      lineItems: [
        { included: false }, { included: false },
        { included: false, amountPaise: 0, quantity: 1, ratePaise: 2000,
          recommendationSourceMainLineIds: [] },
        { included: false, amountPaise: 0, quantity: 3, ratePaise: 901,
          recommendationSourceMainLineIds: [] }
      ] });
    expect(allSourcesRemoved.body.data.lineItems.map((line: { id: string }) => line.id)).toEqual(lineIds);
    const stored = await EstimateModel.findOne({ leadId: "lead-recommended-chain" }).lean();
    expect(stored?.lineItems[2]).toMatchObject({ included: false, amountPaise: 0,
      recommendationSourceMainLineIds: [] });
  });

  it("retains saved origins for an older client, while explicit manual reselection stays included", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-recommended-legacy/estimate";
    const source = configuredLine();
    const target = configuredLine({ catalogueId: "line-b", mainLineId: "line-b",
      mainBasketId: "basket-b", subBasketId: "sub-b", revisionId: "revision-b",
      uomId: "uom-ea", quantity: 1, ratePaise: 2000,
      recommendationSourceMainLineIds: ["line-a"] });
    const selected = ["basket-a", "basket-b"];
    const first = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([source, target], selected)).expect(200);
    const { recommendationSourceMainLineIds: _ignored, ...olderTarget } = target;
    const olderSave = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([{ ...source, included: false }, olderTarget],
        selected, first.body.data.version)).expect(200);
    expect(olderSave.body.data).toMatchObject({ subtotalPaise: 0, gstPaise: 0,
      lineItems: [{ included: false }, { included: false, recommendationSourceMainLineIds: [] }] });
    const manuallyReselected = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([{ ...source, included: false },
        { ...target, recommendationSourceMainLineIds: [] }],
      selected, olderSave.body.data.version)).expect(200);
    expect(manuallyReselected.body.data).toMatchObject({ subtotalPaise: 2000, gstPaise: 360,
      lineItems: [{ included: false }, { included: true, recommendationSourceMainLineIds: [] }] });
    const manualReload = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(manualReload.body.data.lineItems[1]).toMatchObject({ included: true,
      recommendationSourceMainLineIds: [] });
    await EstimateModel.collection.updateOne({ leadId: "lead-recommended-legacy" },
      { $set: { status: "client_approved" } });
    const locked = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([source, target], selected, manuallyReselected.body.data.version)).expect(409);
    expect(locked.body.error.code).toBe("ESTIMATE_LOCKED");
  });

  it("keeps manual historical and other-room selections when a source is removed", async () => {
    const { server } = app();
    const selected = ["basket-a", "basket-b"];
    const source = configuredLine();
    const manualTarget = configuredLine({ catalogueId: "line-b", mainLineId: "line-b",
      mainBasketId: "basket-b", subBasketId: "sub-b", revisionId: "revision-b",
      uomId: "uom-ea", quantity: 1, ratePaise: 2000 });
    const historicalPath = "/api/v1/leads/lead-manual-historical/estimate";
    const historical = await request(server).put(historicalPath).set(bearer("estimator"))
      .send(estimateInput([source, manualTarget], selected)).expect(200);
    const historicalOnDisk = await EstimateModel.findOne({ leadId: "lead-manual-historical" }).lean();
    expect(historicalOnDisk?.lineItems[1]).not.toHaveProperty("recommendationSourceMainLineIds");
    const historicalResave = await request(server).put(historicalPath).set(bearer("estimator"))
      .send(estimateInput([{ ...source, included: false }, manualTarget],
        selected, historical.body.data.version)).expect(200);
    expect(historicalResave.body.data).toMatchObject({ subtotalPaise: 2000,
      lineItems: [{ included: false }, { included: true }] });
    expect(historicalResave.body.data.lineItems[1]).not.toHaveProperty("recommendationSourceMainLineIds");

    const path = "/api/v1/leads/lead-recommended-room/estimate";
    const rooms = [{ id: "room-one", label: "Living room" }, { id: "room-two", label: "Bedroom" }];
    const otherRoom = { ...manualTarget, roomId: "room-two", roomName: "Bedroom", ratePaise: 3000 };
    const recommended = { ...manualTarget, recommendationSourceMainLineIds: ["line-a"] };
    const first = await request(server).put(path).set(bearer("estimator"))
      .send({ ...estimateInput([source, recommended, otherRoom], selected), rooms }).expect(200);
    const removed = await request(server).put(path).set(bearer("estimator"))
      .send({ ...estimateInput([{ ...source, included: false }, recommended, otherRoom],
        selected, first.body.data.version), rooms }).expect(200);
    expect(removed.body.data).toMatchObject({ subtotalPaise: 3000, gstPaise: 540,
      lineItems: [
        { roomId: "room-one", included: false },
        { roomId: "room-one", included: false, recommendationSourceMainLineIds: [] },
        { roomId: "room-two", included: true, amountPaise: 3000 }
      ] });
    expect(removed.body.data.lineItems[2]).not.toHaveProperty("recommendationSourceMainLineIds");
  });

  it("rejects duplicate, self, unknown and cross-room recommendation source IDs", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-invalid-recommendation-origin/estimate";
    const source = configuredLine();
    const target = configuredLine({ catalogueId: "line-b", mainLineId: "line-b",
      mainBasketId: "basket-b", subBasketId: "sub-b", revisionId: "revision-b",
      uomId: "uom-ea", quantity: 1, ratePaise: 2000 });
    const selected = ["basket-a", "basket-b"];
    await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([source, { ...target,
        recommendationSourceMainLineIds: ["line-a", "line-a"] }], selected)).expect(400);
    for (const [sourceId, errorCode] of [
      ["line-b", "ESTIMATE_RECOMMENDATION_SOURCE_INVALID"],
      ["line-missing", "ESTIMATE_RECOMMENDATION_SOURCE_INVALID"]
    ]) {
      const result = await request(server).put(path).set(bearer("estimator"))
        .send(estimateInput([source, { ...target,
          recommendationSourceMainLineIds: [sourceId] }], selected)).expect(400);
      expect(result.body.error.code).toBe(errorCode);
    }
    const crossRoom = await request(server).put(path).set(bearer("estimator"))
      .send({ ...estimateInput([
        { ...source, roomId: "room-two", roomName: "Bedroom" },
        { ...target, recommendationSourceMainLineIds: ["line-a"] }
      ], selected), rooms: [{ id: "room-one", label: "Living room" },
        { id: "room-two", label: "Bedroom" }] }).expect(400);
    expect(crossRoom.body.error.code).toBe("ESTIMATE_RECOMMENDATION_SOURCE_ROOM_INVALID");
    expect(await EstimateModel.countDocuments({ leadId: "lead-invalid-recommendation-origin" })).toBe(0);
  });

  it("accepts a configured temporary source and cascades its deselection", async () => {
    const { server } = app();
    const path = "/api/v1/leads/lead-temporary-recommendation-origin/estimate";
    const temporarySource = groupedTemporaryLine();
    const target = configuredLine({ catalogueId: "line-b", mainLineId: "line-b",
      mainBasketId: "basket-b", subBasketId: "sub-b", revisionId: "revision-b",
      uomId: "uom-ea", quantity: 1, ratePaise: 2000,
      recommendationSourceMainLineIds: ["line-temp"] });
    const selected = ["basket-a", "basket-b"];
    const first = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([temporarySource, target], selected)).expect(200);
    expect(first.body.data).toMatchObject({ subtotalPaise: 4703,
      lineItems: [{ included: true, itemType: "temporary" },
        { included: true, recommendationSourceMainLineIds: ["line-temp"] }] });
    const reloaded = await request(server).get(path).set(bearer("estimator")).expect(200);
    expect(reloaded.body.data.lineItems[1].recommendationSourceMainLineIds).toEqual(["line-temp"]);
    const removed = await request(server).put(path).set(bearer("estimator"))
      .send(estimateInput([{ ...temporarySource, included: false }, target],
        selected, first.body.data.version)).expect(200);
    expect(removed.body.data).toMatchObject({ subtotalPaise: 0, gstPaise: 0, totalPaise: 0,
      lineItems: [{ included: false },
        { included: false, amountPaise: 0, recommendationSourceMainLineIds: [] }] });
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
    { _id: "line-temp-direct", basketId: "basket-a", subBasketId: null, name: "Direct temporary", displayOrder: 6, itemType: "temporary", status: "active", activeRevisionId: "revision-temp-direct" },
    { _id: "line-draft", basketId: "basket-a", subBasketId: "sub-a", name: "Draft", displayOrder: 6, itemType: "main_line", status: "draft", activeRevisionId: "revision-draft" }
  ].map((line) => ({ ...line, version: 1 })) as never[]);
  await AiEstimatorKnowledgeRevisionModel.collection.insertMany([
    "a", "b", "bad", "direct", "temp", "temp-direct", "draft"
  ].map((suffix) => ({ _id: `revision-${suffix}`, mainLineId: `line-${suffix}`, status: "active",
    version: 1, completeness: { percentage: 25, sections: [{ sectionKey: "overview", state: "complete" }] }
  })) as never[]);
  await AiEstimatorKnowledgeSectionModel.collection.insertMany([
    { _id: "overview-a", mainLineId: "line-a", revisionId: "revision-a", sectionKey: "overview", applicability: "not_configured", payload: { uomId: "uom-sq" } },
    { _id: "overview-b", mainLineId: "line-b", revisionId: "revision-b", sectionKey: "overview", applicability: "applicable", payload: { uomId: "uom-ea" } },
    { _id: "overview-bad", mainLineId: "line-bad", revisionId: "revision-bad", sectionKey: "overview", applicability: "applicable", payload: { uomId: "uom-archived" } },
    { _id: "overview-direct", mainLineId: "line-direct", revisionId: "revision-direct", sectionKey: "overview", applicability: "applicable", payload: { uomId: "uom-ea" } },
    { _id: "overview-temp", mainLineId: "line-temp", revisionId: "revision-temp", sectionKey: "overview", applicability: "applicable", payload: { uomId: "uom-ea" } },
    { _id: "overview-temp-direct", mainLineId: "line-temp-direct", revisionId: "revision-temp-direct", sectionKey: "overview", applicability: "applicable", payload: { uomId: "uom-ea" } }
  ] as never[]);
}
