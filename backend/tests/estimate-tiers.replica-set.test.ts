import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createEstimateTiersService } from "../src/services/estimate-tiers.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { UserModel } from "../src/models/User.js";
import { ProjectModel } from "../src/models/Project.js";
import { LeadModel } from "../src/models/Lead.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { AiEstimatorKnowledgeBasketModel as Basket } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel as SubBasket } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel as MainLine } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel as Revision } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel as Section } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel as Uom } from "../src/models/AiEstimatorKnowledgeUom.js";

const client: PublicUser = { id: "tier-client", name: "Client", email: "client@tier.invalid", role: "client" };
const sales: PublicUser = { id: "tier-sales", name: "Sales", email: "sales@tier.invalid", role: "estimator_sales" };
const other: PublicUser = { id: "tier-other", name: "Other", email: "other@tier.invalid", role: "client" };
const service = createEstimateTiersService({ audit: createAuditService(createMongoRepository()) });
const command = { expectedVersion: 1, modeTier: "premium" as const, revisionId: "revision-visible", itemVersion: 1, revisionVersion: 1, uomId: "tier-uom" };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("estimate-line-tiers");
  await Promise.all([UserModel, ProjectModel, LeadModel, EstimateModel, AuditEventModel, AuthorizationCoordinationModel,
    Basket, SubBasket, MainLine, Revision, Section, Uom].map(model => model.init()));
}, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear();
  await UserModel.insertMany([client, sales, other].map(actor => ({ _id: actor.id, name: actor.name, email: actor.email,
    emailNormalized: actor.email, passwordHash: "synthetic-only", role: actor.role, active: true, version: 1 })));
  await ProjectModel.collection.insertOne({ _id: "tier-project" as never, name: "Tier fixture", clientId: client.id,
    assignedEstimatorId: sales.id, assignedDesignerIds: [], estimationWorkflowVersion: 2, estimateRequirementsVersion: 0,
    estimationFenceEpoch: 0, status: "planning" });
  await LeadModel.collection.insertOne({ _id: "tier-lead" as never, projectId: "tier-project", ownerId: sales.id });
  await Basket.collection.insertOne({ _id: "tier-basket" as never, name: "Painting", status: "active", displayOrder: 1, version: 1 });
  await SubBasket.collection.insertOne({ _id: "tier-sub" as never, basketId: "tier-basket", name: "Walls", status: "active", displayOrder: 1, version: 1 });
  await Uom.collection.insertOne({ _id: "tier-uom" as never, name: "sq-ft", code: "SQFT", decimalScale: 2, status: "active", version: 1 });
  for (const id of ["visible", "hidden"]) {
    await MainLine.collection.insertOne({ _id: id as never, name: `${id} painting`, basketId: "tier-basket", subBasketId: "tier-sub",
      itemType: "main_line", status: "active", version: 1, activeRevisionId: `revision-${id}`, displayOrder: 1 });
    await Revision.collection.insertOne({ _id: `revision-${id}` as never, mainLineId: id, status: "active", revisionNumber: 1, version: 1 });
    await Section.collection.insertMany([
      { _id: `overview-${id}` as never, mainLineId: id, revisionId: `revision-${id}`, sectionKey: "overview", applicability: "configured", version: 1,
        payload: { uomId: "tier-uom", clientVisible: id !== "hidden", applicableTiers: ["signature", "premium", "functional"] } },
      { _id: `advanced-${id}` as never, mainLineId: id, revisionId: `revision-${id}`, sectionKey: "advanced", applicability: "configured", version: 1,
        payload: { modeCalculations: { sub_vendor: { baseRatePaise: 2000 } }, privateMargin: "never-expose-this",
          tierConfigurations: { premium: { applicability: "configured", payload: { modeCalculations: { sub_vendor: { baseRatePaise: 5000 } } } } } } }
    ]);
  }
  const line = (id: string, mainLineId: string, roomName: string, quantity: number, ratePaise: number) => ({ id, source: "configuration", itemType: "main_line",
    catalogueId: mainLineId, mainLineId, mainLineName: `${mainLineId} painting`, mainBasketId: "tier-basket", subBasketId: "tier-sub",
    mainBasketName: "Painting", subBasketName: "Walls", revisionId: `revision-${mainLineId}`, sourceItemVersion: 1, sourceRevisionVersion: 1,
    sourceItemStatus: "active", sourceRevisionStatus: "active", roomId: roomName, roomName, clientVisible: mainLineId !== "hidden",
    classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration", uomId: "tier-uom", uomCode: "SQFT", uomName: "sq-ft",
    unit: "sq-ft", uomDecimalScale: 2, quantity, ratePaise, rate: ratePaise / 100, amountPaise: quantity * ratePaise, amount: quantity * ratePaise / 100, included: true });
  await EstimateModel.create({ _id: "tier-estimate", leadId: "tier-lead", ownerId: sales.id, projectId: "tier-project", version: 1, status: "draft",
    estimation: newEstimationLifecycle(), propertyType: "2BHK", rooms: [{ id: "Room1", label: "Room1" }, { id: "Room2", label: "Room2" }], scopes: [],
    lineItems: [line("line-one", "visible", "Room1", 2, 2000), line("line-two", "visible", "Room2", 3, 2000), line("line-hidden", "hidden", "Room1", 1, 1000)],
    subtotal: 110, gst: 19.8, total: 129.8, subtotalPaise: 11000, gstPaise: 1980, totalPaise: 12980 });
});

describe("client working estimate tier selection", () => {
  it("returns configured choices without internal payloads or hidden lines and retains full totals", async () => {
    const view = await service.detail(client, "tier-project");
    expect(view.lines.map(line => line.id)).toEqual(["line-one", "line-two"]);
    expect(view.totalPaise).toBe(12980);
    expect(view.lines[0]!.choices.map(choice => [choice.modeTier, choice.available, choice.ratePaise])).toEqual([
      ["signature", true, 2000], ["premium", true, 5000], ["functional", false, null]
    ]);
    expect(JSON.stringify(view)).not.toMatch(/privateMargin|never-expose|modeCalculations|tierConfigurations|hidden painting/u);
  });

  it("prices just the selected room line, saves tier provenance, and includes hidden costs in full totals", async () => {
    const result = await service.select(client, "tier-project", "line-one", command);
    expect(result.estimateVersion).toBe(2);
    expect(result.totalPaise).toBe(20060);
    expect(result.lines[0]).toMatchObject({ modeTier: "premium", ratePaise: 5000, amountPaise: 10000 });
    expect(result.lines[1]).toMatchObject({ modeTier: "signature", ratePaise: 2000, amountPaise: 6000 });
    const saved = await EstimateModel.findById("tier-estimate").lean();
    expect(saved!.lineItems[0]).toMatchObject({ modeTier: "premium", rateSource: "configuration", sourceItemVersion: 1 });
    expect(saved!.lineItems[2]).toMatchObject({ amountPaise: 1000, clientVisible: false });
    expect(saved!.estimation!.designScopeRevision).toBe(2);
    expect(await AuditEventModel.countDocuments({ action: "estimate_tier_selected" })).toBe(1);
  });

  it.each([true, false])("does not expose an unresolved current source (current visibility %s)", async clientVisible => {
    await Section.collection.updateOne({ _id: "overview-visible" as never }, {
      $set: { "payload.uomId": "missing-uom", "payload.clientVisible": clientVisible }
    });
    const view = await service.detail(client, "tier-project");
    expect(view.lines).toHaveLength(0);
    expect(view.totalPaise).toBe(12980);
    expect((await service.detail(sales, "tier-project")).lines).toHaveLength(3);
    await expect(service.select(client, "tier-project", "line-one", command)).rejects.toMatchObject({ code: "ESTIMATE_TIER_UNAVAILABLE" });
  });

  it("rejects other clients, hidden rows, and deactivated accounts without changing money", async () => {
    await expect(service.detail(other, "tier-project")).rejects.toMatchObject({ status: 404 });
    await expect(service.select(client, "tier-project", "line-hidden", { ...command, revisionId: "revision-hidden" })).rejects.toMatchObject({ status: 404 });
    await UserModel.updateOne({ _id: client.id }, { $set: { active: false } });
    await expect(service.select(client, "tier-project", "line-one", command)).rejects.toMatchObject({ status: 404 });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(1);
  });

  it("keeps an estimate incomplete when another saved line has no price or amount", async () => {
    await EstimateModel.collection.updateOne({ _id: "tier-estimate" as never }, {
      $unset: { "lineItems.1.ratePaise": "", "lineItems.1.amountPaise": "" }, $set: { isIncomplete: true }
    });
    const saved = await service.select(client, "tier-project", "line-one", command);
    expect(saved.isIncomplete).toBe(true);
    expect(saved.lines[1]).toMatchObject({ ratePaise: null, amountPaise: null });
  });

  it("requires current configuration and rejects unavailable tiers and arbitrary rates", async () => {
    await expect(service.select(client, "tier-project", "line-one", { ...command, itemVersion: 2 })).rejects.toMatchObject({ code: "ESTIMATE_CONFIGURATION_CHANGED" });
    await expect(service.select(client, "tier-project", "line-one", { ...command, modeTier: "functional" })).rejects.toMatchObject({ code: "ESTIMATE_TIER_UNAVAILABLE" });
    await expect(service.select(client, "tier-project", "line-one", { ...command, ratePaise: 1 } as never)).rejects.toMatchObject({ status: 400 });
    await Section.collection.updateOne({ _id: "overview-visible" as never }, { $set: { "payload.applicableTiers": ["signature"] } });
    await expect(service.select(client, "tier-project", "line-one", command)).rejects.toMatchObject({ code: "ESTIMATE_TIER_UNAVAILABLE" });
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it.each(["sent_to_client", "client_approved"])("keeps %s estimates immutable", async status => {
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.status": status,
      ...(status === "client_approved" ? { "estimation.editClosedAt": new Date() } : {}) } });
    expect((await service.detail(client, "tier-project")).editingAllowed).toBe(false);
    await expect(service.select(client, "tier-project", "line-one", command)).rejects.toMatchObject({ code: "ESTIMATE_LOCKED" });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(1);
  });

  it("serializes concurrent selections by estimate version", async () => {
    const results = await Promise.allSettled([
      service.select(client, "tier-project", "line-one", command),
      service.select(sales, "tier-project", "line-two", command)
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "ESTIMATE_VERSION_CONFLICT" } });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(2);
  });

  it("requires an explicit In-house selection in the destination tier, even when component IDs match", async () => {
    const settings = (baseRatePaise: number) => ({ baseRatePaise, lowQuantityLimit: "10", impactBps: 1000, minimumMarkupBps: 1500, startingMarkupBps: 2000 });
    const component = (rate: number) => ({ id: "same-local-id", basketId: "tier-basket", subBasketId: "tier-sub", inclusions: [], exclusions: [], labor: settings(rate), material: settings(rate) });
    await Section.collection.updateOne({ _id: "advanced-visible" as never }, { $set: {
      "payload.inHouseComponents": [component(1000)],
      "payload.tierConfigurations.premium.payload.inHouseComponents": [component(3000)]
    } });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "lineItems.0.classification": "special", "lineItems.0.pricingMode": "in_house",
      "lineItems.0.selectedInHouseComponentIds": ["same-local-id"] } });
    await expect(service.select(client, "tier-project", "line-one", command)).rejects.toMatchObject({ code: "ESTIMATE_TIER_UNAVAILABLE" });
    const saved = await service.select(client, "tier-project", "line-one", { ...command, selectedInHouseComponentIds: ["same-local-id"] });
    expect(saved.lines[0]).toMatchObject({ modeTier: "premium", ratePaise: 6000, amountPaise: 12000, selectedInHouseComponentIds: ["same-local-id"] });
  });
});

const measurementCommand = { expectedVersion: 1, revisionId: "revision-visible", itemVersion: 1, revisionVersion: 1,
  expectedDimensionRule: { formula: "length_width" as const, inputUnit: "ft" as const, quantityUnit: "sq_ft" as const, uomId: "tier-uom", decimalScale: 2 },
  uomId: "tier-uom", dimensions: { length: "12.500", width: "2", height: "9" } };
async function requireDimensions() {
  await Section.collection.updateOne({ _id: "overview-visible" as never }, { $set: { "payload.dimensionsMandatory": true } });
}

describe("client required measurements", () => {
  it("derives quantity from Length × Width, records Height, preserves other rooms and includes hidden amounts", async () => {
    await requireDimensions();
    const before = await service.detail(client, "tier-project");
    expect(before.lines[0]).toMatchObject({ dimensionsMandatory: true, dimensionsNeedReview: true, dimensionRule: { inputUnit: "ft", quantityUnit: "sq_ft" } });
    const result = await service.updateDimensions(client, "tier-project", "line-one", measurementCommand);
    expect(result.lines[0]).toMatchObject({ quantity: 25, ratePaise: 2000, amountPaise: 50000,
      dimensions: { length: "12.5", width: "2", height: "9" }, dimensionsNeedReview: false });
    expect(result.lines[1]).toMatchObject({ quantity: 3, amountPaise: 6000, dimensionsNeedReview: true });
    expect(result.isIncomplete).toBe(true);
    expect(result.totalPaise).toBe(67260);
    expect(await AuditEventModel.countDocuments({ action: "estimate_dimensions_updated" })).toBe(1);
    expect((await service.detail(client, "tier-project")).lines[0]).toMatchObject(result.lines[0]!);
  });

  it("keeps a manual rate and existing tier when saving only dimensions", async () => {
    await requireDimensions();
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "lineItems.0.rateSource": "manual", "lineItems.0.ratePaise": 1234, "lineItems.0.modeTier": "premium" } });
    const result = await service.updateDimensions(client, "tier-project", "line-one", measurementCommand);
    expect(result.lines[0]).toMatchObject({ modeTier: "premium", ratePaise: 1234, quantity: 25, amountPaise: 30850 });
    expect((await EstimateModel.findById("tier-estimate").lean())!.lineItems[0]!.rateSource).toBe("manual");
  });

  it("allows measurements before pricing is configured and keeps the estimate incomplete", async () => {
    await requireDimensions();
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "lineItems.0.ratePaise": null, "lineItems.0.amountPaise": null } });
    const result = await service.updateDimensions(client, "tier-project", "line-one", measurementCommand);
    expect(result.lines[0]).toMatchObject({ quantity: 25, ratePaise: null, amountPaise: null });
    expect(result.isIncomplete).toBe(true);
  });

  it("rejects missing or forged measurements, quantities and prices without a write", async () => {
    await requireDimensions();
    for (const dimensions of [{ length: "2", width: "3" }, { length: "2", width: "3", height: "0" }, { length: "1e2", width: "3", height: "9" }]) {
      await expect(service.updateDimensions(client, "tier-project", "line-one", { ...measurementCommand, dimensions } as never)).rejects.toMatchObject({ status: 400 });
    }
    for (const extra of [{ quantity: 1 }, { ratePaise: 1 }, { modeTier: "premium" }]) {
      await expect(service.updateDimensions(client, "tier-project", "line-one", { ...measurementCommand, ...extra } as never)).rejects.toMatchObject({ status: 400 });
    }
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(1);
  });

  it("requires measurements before changing tier and keeps them after a valid tier change", async () => {
    await requireDimensions();
    await expect(service.select(client, "tier-project", "line-one", command)).rejects.toMatchObject({ code: "ESTIMATE_DIMENSIONS_REQUIRED" });
    await service.updateDimensions(client, "tier-project", "line-one", measurementCommand);
    const selected = await service.select(client, "tier-project", "line-one", { ...command, expectedVersion: 2 });
    expect(selected.lines[0]).toMatchObject({ modeTier: "premium", quantity: 25, amountPaise: 125000,
      dimensions: { length: "12.5", width: "2", height: "9" } });
  });

  it("invalidates design scope when geometry changes but area remains the same", async () => {
    await requireDimensions();
    await service.updateDimensions(client, "tier-project", "line-one", { ...measurementCommand, dimensions: { length: "2", width: "6", height: "9" } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    const result = await service.updateDimensions(client, "tier-project", "line-one", { ...measurementCommand, expectedVersion: 2, dimensions: { length: "3", width: "4", height: "9" } });
    const after = await EstimateModel.findById("tier-estimate").lean();
    expect(result.lines[0]!.quantity).toBe(12);
    expect(after!.estimation!.designScopeRevision).toBe(before!.estimation!.designScopeRevision + 1);
  });

  it("enforces client ownership, hidden lines, source versions and review locks", async () => {
    await requireDimensions();
    await expect(service.updateDimensions(other, "tier-project", "line-one", measurementCommand)).rejects.toMatchObject({ status: 404 });
    await expect(service.updateDimensions(client, "tier-project", "line-hidden", measurementCommand)).rejects.toMatchObject({ status: 404 });
    await expect(service.updateDimensions(client, "tier-project", "line-one", { ...measurementCommand, revisionVersion: 9 })).rejects.toMatchObject({ code: "ESTIMATE_CONFIGURATION_CHANGED" });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.status": "sent_to_client" } });
    await expect(service.updateDimensions(client, "tier-project", "line-one", measurementCommand)).rejects.toMatchObject({ code: "ESTIMATE_LOCKED" });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(1);
  });

  it("requires review if a configured price changed instead of silently adopting it", async () => {
    await requireDimensions();
    await Section.collection.updateOne({ _id: "advanced-visible" as never }, { $set: { "payload.modeCalculations.sub_vendor.baseRatePaise": 3000 } });
    await expect(service.updateDimensions(client, "tier-project", "line-one", measurementCommand)).rejects.toMatchObject({ code: "ESTIMATE_DIMENSIONS_PRICE_CHANGED" });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(1);
  });

  it("serializes simultaneous client and Sales measurement edits", async () => {
    await requireDimensions();
    const results = await Promise.allSettled([service.updateDimensions(client, "tier-project", "line-one", measurementCommand), service.updateDimensions(sales, "tier-project", "line-two", measurementCommand)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "ESTIMATE_VERSION_CONFLICT" } });
  });

  it("rejects old measurement units after a same-ID UOM edit", async () => {
    await requireDimensions();
    await Uom.updateOne({ _id: "tier-uom" }, { $set: { code: "SQM", name: "Square metre" } });
    await expect(service.updateDimensions(client, "tier-project", "line-one", measurementCommand)).rejects.toMatchObject({ code: "ESTIMATE_DIMENSIONS_CHANGED" });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(1);
  });

  it("does not save dimensions against a removed tier even with a manual price", async () => {
    await requireDimensions();
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "lineItems.0.rateSource": "manual", "lineItems.0.modeTier": "premium" } });
    await Section.collection.updateOne({ _id: "overview-visible" as never }, { $set: { "payload.applicableTiers": ["signature"] } });
    await expect(service.updateDimensions(client, "tier-project", "line-one", measurementCommand)).rejects.toMatchObject({ code: "ESTIMATE_TIER_UNAVAILABLE" });
  });

  it("does not preserve a stale component selection after the tier becomes a legacy In-house configuration", async () => {
    await requireDimensions();
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "lineItems.0.rateSource": "manual", "lineItems.0.classification": "special",
      "lineItems.0.pricingMode": "in_house", "lineItems.0.selectedInHouseComponentIds": ["removed-component"] } });
    await expect(service.updateDimensions(client, "tier-project", "line-one", measurementCommand)).rejects.toMatchObject({ code: "ESTIMATE_COMPONENT_SELECTION_INVALID" });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(1);
  });
});
