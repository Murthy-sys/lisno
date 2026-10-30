import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { readMainLineVendorLinks } from "../src/services/main-line-vendor-links.service.js";
import { createPMEstimateReadService } from "../src/services/project-manager/estimates.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { seedPMEstimateHandoffFixture, setPMFixtureVendorLinks, handoffAt } from "./helpers/pm-estimate-handoff.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let fixture: Awaited<ReturnType<typeof seedPMEstimateHandoffFixture>>;
const reader = createPMEstimateReadService({ now: () => handoffAt });
const links = (ids = ["main-line-1"]) => mongoose.connection.transaction(session => readMainLineVendorLinks(ids, session));
const pricingId = "pricing-main-line-1";
const firstPriceId = "config-main-line-1-price-0-vendor-handoff-1";
const firstEntryId = "config-main-line-1-entry-0-vendor-handoff-1";
const reference = { operation: "reference", priceEntryId: firstEntryId, priceVersionId: firstPriceId };
async function candidates(mainLineId = "main-line-1", q?: string, offset = 0, limit = 20) {
  const estimate = await reader.estimate(fixture.pm, fixture.projectId);
  return reader.candidates(fixture.pm, fixture.projectId, { expectedSource: estimate.source!, mainLineId, q, offset, limit });
}

beforeAll(async () => { replica = await startMongoReplicaSet("main-line-vendor-links"); }, 120000);
beforeEach(async () => { await replica.clear(); fixture = await seedPMEstimateHandoffFixture(); });
afterAll(async () => replica?.stop());

describe("current Main Line vendor membership", () => {
  it("resolves distinct linked sets and never treats shared basket classification as membership", async () => {
    const resolved = await links(["main-line-1", "main-line-2", "main-line-3"]);
    expect(resolved.get("main-line-1")).toMatchObject({ available: true, vendorIds: [...fixture.vendorIds] });
    expect(resolved.get("main-line-2")).toMatchObject({ available: true, vendorIds: [fixture.vendorIds[0]] });
    expect(resolved.get("main-line-3")).toMatchObject({ available: true, vendorIds: [fixture.vendorIds[1]] });
    expect((await candidates("main-line-2")).items.map(row => row.id)).toEqual([fixture.vendorIds[0]]);
    expect((await candidates("main-line-2", "VH1")).total).toBe(0);
  });

  it("deduplicates different retained prices for one vendor without selecting an effective price", async () => {
    await setPMFixtureVendorLinks("main-line-1", [fixture.vendorIds[0], fixture.vendorIds[0], fixture.vendorIds[1]]);
    await AiEstimatorKnowledgePriceVersionModel.collection.updateMany({ mainLineId: "main-line-1" }, {
      $set: { status: "superseded", effectiveTo: new Date("2020-01-01T00:00:00Z") }
    });
    const page = await candidates();
    expect(page.total).toBe(2);
    expect(page.items.map(row => row.id)).toEqual([...fixture.vendorIds]);
    expect(JSON.stringify(page)).not.toMatch(/priceVersion|priceEntry|inputAmount|email|procurementProfile|kpiScore|msme/);
  });

  it("uses only the latest saved draft and does not fall back when its links are broken", async () => {
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "main-line-1" }, { $set: { draftRevisionId: "draft-links" }, $inc: { version: 1 } });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: "draft-links", mainLineId: "main-line-1", status: "draft", version: 1, revisionNumber: 2 } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({ _id: "draft-pricing", mainLineId: "main-line-1", revisionId: "draft-links",
      sectionKey: "pricing", applicability: "configured", version: 1, payload: { priceEntries: [] } } as never);
    await setPMFixtureVendorLinks("main-line-1", [fixture.vendorIds[1]], "draft-links");
    expect((await links()).get("main-line-1")).toMatchObject({ available: true, revisionId: "draft-links", vendorIds: [fixture.vendorIds[1]] });
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "draft-pricing" }, { $set: { "payload.priceEntries.0.priceVersionId": firstPriceId } });
    expect((await links()).get("main-line-1")).toMatchObject({ available: false });
    expect((await links(["main-line-1", "main-line-2"])).get("main-line-2")?.available).toBe(true);
  });

  it.each(["absent", "not_configured", "not_applicable", "configured"])("returns a valid empty linked set for %s empty pricing", async kind => {
    if (kind === "absent") await AiEstimatorKnowledgeSectionModel.deleteOne({ _id: pricingId });
    else await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: pricingId }, {
      $set: { applicability: kind, payload: { priceEntries: [] } }
    });
    expect((await links()).get("main-line-1")).toMatchObject({ available: true, vendorIds: [] });
    expect(await candidates()).toMatchObject({ items: [], total: 0 });
  });

  it.each([
    ["null payload", { payload: null }],
    ["invalid entries", { payload: { priceEntries: {} } }],
    ["unmaterialized command", { payload: { priceEntries: [{ operation: "set_budget", vendorId: "vendor-handoff-1" }] } }],
    ["duplicate reference", { payload: { priceEntries: [reference, reference] } }],
    ["unknown reference property", { payload: { priceEntries: [{ ...reference, vendorId: "vendor-handoff-1" }] } }],
    ["not applicable retained references", { applicability: "not_applicable" }],
    ["unconfigured retained references", { applicability: "not_configured" }],
    ["foreign section owner", { mainLineId: "main-line-2" }],
    ["wrong price entry", { "payload.priceEntries.0.priceEntryId": "other-entry" }],
    ["nested tier budget", { "payload.tierConfigurations.premium": { applicability: "configured", payload: { priceEntries: [reference] } } }]
  ])("refuses %s rather than returning a partial or empty list", async (_name, fields) => {
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: pricingId }, { $set: fields });
    expect((await links()).get("main-line-1")).toMatchObject({ available: false });
    await expect(candidates()).rejects.toMatchObject({ code: "PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE" });
  });

  it.each(["missing-price", "foreign-price-owner", "foreign-price-revision", "missing-vendor", "foreign-revision-owner", "invalid-revision-version"])("refuses %s", async kind => {
    if (kind === "missing-price") await AiEstimatorKnowledgePriceVersionModel.deleteOne({ _id: firstPriceId });
    if (kind === "foreign-price-owner") await AiEstimatorKnowledgePriceVersionModel.collection.updateOne({ _id: firstPriceId }, { $set: { mainLineId: "main-line-2" } });
    if (kind === "foreign-price-revision") await AiEstimatorKnowledgePriceVersionModel.collection.updateOne({ _id: firstPriceId }, { $set: { revisionId: "config-main-line-2" } });
    if (kind === "missing-vendor") await AiEstimatorKnowledgeVendorModel.deleteOne({ _id: fixture.vendorIds[0] });
    if (kind === "foreign-revision-owner") await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "config-main-line-1" }, { $set: { mainLineId: "main-line-2" } });
    if (kind === "invalid-revision-version") await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "config-main-line-1" }, { $set: { version: 0 } });
    expect((await links()).get("main-line-1")).toMatchObject({ available: false });
  });

  it("paginates and searches distinct linked vendors, preserving deterministic IDs for duplicate names", async () => {
    const ids = Array.from({ length: 23 }, (_, index) => `linked-${String(index).padStart(2, "0")}`);
    await AiEstimatorKnowledgeVendorModel.create(ids.map((id, index) => ({ _id: id, code: `LINK${index}`, name: "Same vendor name",
      status: index === 0 ? "active" : "archived", ...(index === 0 ? {} : { archivedAt: handoffAt, archivedById: fixture.admin.id }),
      version: 1, displayOrder: index, createdById: fixture.admin.id, updatedById: fixture.admin.id })));
    await setPMFixtureVendorLinks("main-line-1", [...ids, ids[0]!]);
    const first = await candidates();
    const second = await candidates("main-line-1", undefined, 20);
    expect(first.total).toBe(23);
    expect(first.items.map(row => row.id)).toEqual(ids.slice(0, 20));
    expect(second.items.map(row => row.id)).toEqual(ids.slice(20));
    expect((await candidates("main-line-1", "LINK22")).items.map(row => row.id)).toEqual([ids[22]]);
    expect((await candidates("main-line-1", "Same vendor")).total).toBe(23);
    expect((await candidates("main-line-1", ".+[")).total).toBe(0);
    expect(first.items.every(row => !row.canSuggest && row.reasons.length > 0)).toBe(true);
  });

  it("shows linked inactive and archived vendors with disabled recommendation readiness", async () => {
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: fixture.vendorIds[0] }, { $set: { status: "inactive" } });
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: fixture.vendorIds[1] }, { $set: { status: "archived" } });
    const page = await candidates();
    expect(page.total).toBe(2);
    expect(page.items.map(row => ({ canSuggest: row.canSuggest, bidEligible: row.bidEligible })))
      .toEqual([{ canSuggest: false, bidEligible: false }, { canSuggest: false, bidEligible: false }]);
    expect(page.items[0]?.reasons).toContain("Vendor is inactive.");
    expect(page.items[1]?.reasons).toContain("Vendor is archived.");
  });

  it("does not inherit another Main Line's vendors for an approved temporary item", async () => {
    await replica.clear();
    fixture = await seedPMEstimateHandoffFixture({ temporaryMainLineIds: ["main-line-1"] });
    const before = await reader.estimate(fixture.pm, fixture.projectId);
    await setPMFixtureVendorLinks("main-line-1", []);
    expect(await candidates()).toMatchObject({ mainLine: { itemType: "temporary" }, items: [], total: 0 });
    expect((await candidates("main-line-2")).total).toBe(1);
    expect((await reader.estimate(fixture.pm, fixture.projectId)).totals).toEqual(before.totals);
  });
});
