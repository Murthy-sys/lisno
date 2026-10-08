import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProcurementVendorCityModel } from "../src/models/ProcurementVendorCity.js";
import { ProjectModel } from "../src/models/Project.js";
import { VendorKpiAssessmentModel } from "../src/models/VendorKpiAssessment.js";
import { assertBasketVendorEligible, readBasketVendorCandidates } from "../src/services/procurement-basket-vendor-eligibility.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";

const time = new Date("2026-10-05T10:00:00.000Z");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-basket-vendor-eligibility");
  await Promise.all([AiEstimatorKnowledgeVendorModel, ProcurementVendorCityModel,
    ProjectModel, VendorKpiAssessmentModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  await ProjectModel.create({ _id: "project-a", name: "Project A", clientName: "Client",
    clientEmail: "client@example.test", clientEmailNormalized: "client@example.test", clientMobile: "123",
    clientAddress: "Address", status: "active", location: "Address", cityName: "Pune", cityKey: "pune",
    plannedStartAt: time, plannedEndAt: new Date("2027-01-01T00:00:00.000Z") });
});
afterAll(async () => { await replica?.stop(); });

async function vendor(id: string, name: string, options: {
  basketId?: string; status?: "active" | "inactive" | "archived"; rated?: boolean;
  email?: boolean; city?: { name: string; key: string };
} = {}) {
  const status = options.status ?? "active";
  await AiEstimatorKnowledgeVendorModel.create({ _id: id, code: id, codeNormalized: id,
    name, nameNormalized: name.toLowerCase(), displayOrder: 1, status, version: 1,
    createdById: "buyer", updatedById: "buyer",
    ...(status === "archived" ? { archivedAt: time, archivedById: "buyer" } : {}),
    procurementProfile: { ...vendorProfileFixture(), email: `${id}@example.test`,
      mainBasketId: options.basketId ?? "basket-a", subBasketId: "sub-a" } });
  if (options.email === false) {
    // Older stored profiles may lack an email even though new model writes require one.
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: id }, { $unset: { "procurementProfile.email": "" } });
  }
  if (options.rated !== false) {
    await VendorKpiAssessmentModel.create(["vendor_self", "procurement"].map((source) => ({
      _id: `${id}-${source}`, vendorId: id, source, vendorType: "execution", rubricVersion: 1,
      rubricGeneration: 0, scores: [{ key: "fixture", score: 88 }], averageScoreBps: 8_600,
      revision: 1, submittedAt: time, idempotencyKey: `${id}-${source}`, payloadHash: "fixture"
    })));
  }
  if (options.city) await ProcurementVendorCityModel.create({ _id: id, cityName: options.city.name,
    cityKey: options.city.key, version: 1, confirmedById: "buyer", confirmedAt: time });
}

describe("Procurement basket vendor candidates", () => {
  it("uses saved mainBasketIds before a stale legacy mainBasketId in both picker and dispatch checks", async () => {
    await vendor("moved", "Moved Vendor");
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "moved" },
      { $set: { "procurementProfile.mainBasketIds": ["basket-b"],
        "procurementProfile.mainBasketId": "basket-a" } });
    const staleBasket = await readBasketVendorCandidates("project-a", "basket-a");
    expect(staleBasket).toMatchObject({ total: 0, matchingVendorCount: 0, items: [] });
    const currentBasket = await readBasketVendorCandidates("project-a", "basket-b");
    expect(currentBasket).toMatchObject({ matchingVendorCount: 1, total: 0 });
    await mongoose.connection.transaction(async session => {
      await expect(assertBasketVendorEligible("moved", "project-a", "basket-a", session))
        .rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_BASKET_MISMATCH" });
      await expect(assertBasketVendorEligible("moved", "project-a", "basket-b", session))
        .rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_NOT_ELIGIBLE" });
    });
  });

  it("paginates eligible vendors after readiness checks and reports every blocked reason", async () => {
    await vendor("archived", "A Archived", { status: "archived" });
    await vendor("unrated", "B Unrated", { rated: false });
    await vendor("no-email", "C No Email", { email: false });
    await vendor("ready-one", "D Ready One");
    await vendor("ready-two", "E Ready Two");
    await vendor("other-basket", "F Other Basket", { basketId: "basket-b" });

    const first = await readBasketVendorCandidates("project-a", "basket-a", undefined, { limit: 1 });
    expect(first.items.map((item) => item.vendorId)).toEqual(["ready-one"]);
    expect(first.items[0]).toMatchObject({ eligible: true, blockers: [] });
    expect(first).toMatchObject({ total: 2, matchingVendorCount: 5,
      blockedReasonCounts: { vendor_archived: 1, vendor_under_review: 1, kpi_unrated: 1, contact_missing: 1 } });

    const second = await readBasketVendorCandidates("project-a", "basket-a", undefined, { limit: 1, offset: 1 });
    expect(second.items.map((item) => item.vendorId)).toEqual(["ready-two"]);
    expect(second.total).toBe(2);
    const beyond = await readBasketVendorCandidates("project-a", "basket-a", undefined, { limit: 1, offset: 2 });
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(2);

    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "ready-one" },
      { $set: { status: "archived", archivedAt: time, archivedById: "buyer" } });
    await mongoose.connection.transaction(async (session) => {
      await expect(assertBasketVendorEligible("ready-one", "project-a", "basket-a", session))
        .rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_NOT_ELIGIBLE" });
    });
  });

  it("applies search and city filters before eligible and blocked counts", async () => {
    await vendor("local", "Local Painter", { city: { name: "Pune", key: "pune" } });
    await vendor("local-archived", "Local Archived Painter", { status: "archived", city: { name: "Pune", key: "pune" } });
    await vendor("outside", "Outside Painter", { city: { name: "Mumbai", key: "mumbai" } });
    await vendor("unknown", "Unknown Painter");
    await vendor("other", "Local Painter Other Basket", { basketId: "basket-b", city: { name: "Pune", key: "pune" } });

    const sameCity = await readBasketVendorCandidates("project-a", "basket-a", undefined,
      { q: "Local", city: "same_city", limit: 1 });
    expect(sameCity.items.map((item) => item.vendorId)).toEqual(["local"]);
    expect(sameCity).toMatchObject({ total: 1, matchingVendorCount: 2,
      blockedReasonCounts: { vendor_archived: 1 } });
    const outside = await readBasketVendorCandidates("project-a", "basket-a", undefined, { city: "outside_city" });
    expect(outside.items.map((item) => item.vendorId)).toEqual(["outside"]);
    expect(outside.matchingVendorCount).toBe(1);
    const unknown = await readBasketVendorCandidates("project-a", "basket-a", undefined, { city: "unknown" });
    expect(unknown.items.map((item) => item.vendorId)).toEqual(["unknown"]);
    const noClassification = await readBasketVendorCandidates("project-a", "basket-missing");
    expect(noClassification).toMatchObject({ items: [], matchingVendorCount: 0, blockedReasonCounts: {}, total: 0 });
  });

  it("continues past a full batch of blocked vendors to fill the eligible page", async () => {
    await AiEstimatorKnowledgeVendorModel.insertMany(Array.from({ length: 100 }, (_, index) => {
      const id = `inactive-${String(index).padStart(3, "0")}`;
      return { _id: id, code: id, codeNormalized: id, name: `Inactive ${String(index).padStart(3, "0")}`,
        nameNormalized: `inactive ${String(index).padStart(3, "0")}`, displayOrder: index,
        status: "inactive", version: 1, createdById: "buyer", updatedById: "buyer",
        procurementProfile: { ...vendorProfileFixture(), email: `${id}@example.test`,
          mainBasketId: "basket-a", subBasketId: "sub-a" } };
    }));
    await vendor("ready-last", "Zulu Ready");

    const page = await readBasketVendorCandidates("project-a", "basket-a", undefined, { limit: 1 });
    expect(page.items.map((item) => item.vendorId)).toEqual(["ready-last"]);
    expect(page).toMatchObject({ total: 1, matchingVendorCount: 101,
      blockedReasonCounts: { vendor_inactive: 100, kpi_unrated: 100 } });
  });
});
