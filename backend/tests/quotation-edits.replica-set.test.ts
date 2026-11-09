import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";
import { toEstimateSnapshot } from "../src/services/estimate-publication.service.js";
import { createEstimateDecisionService } from "../src/services/estimate-decision.service.js";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createQuotationService } from "../src/services/quotation.service.js";
import { quotationMandatoryTargets, quotationVisibleRecommendationSources } from "../src/services/quotation-recommendations.service.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
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
import { EstimateRequirementModel } from "../src/models/EstimateRequirement.js";
import { DesignRequirementsStateModel } from "../src/models/DesignRequirementsState.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { createQuotationRouter } from "../src/routes/quotation.js";
import { errorHandler } from "../src/middleware/errors.js";

const client: PublicUser = { id: "tier-client", name: "Client", email: "client@tier.invalid", role: "client" };
const sales: PublicUser = { id: "tier-sales", name: "Sales", email: "sales@tier.invalid", role: "estimator_sales" };
const other: PublicUser = { id: "tier-other", name: "Other", email: "other@tier.invalid", role: "client" };
const service = createQuotationService({ audit: createAuditService(createMongoRepository()) });
const command = { expectedVersion: 1, modeTier: "premium" as const, revisionId: "revision-visible", itemVersion: 1, revisionVersion: 1, uomId: "tier-uom" };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("client-quotation-edits");
  await Promise.all([UserModel, ProjectModel, LeadModel, EstimateModel, AuditEventModel, AuthorizationCoordinationModel,
    Basket, SubBasket, MainLine, Revision, Section, Uom, EstimateClientReviewRoundModel].map(model => model.init()));
}, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear();
  await UserModel.insertMany([client, sales, other].map(actor => ({ _id: actor.id, name: actor.name, email: actor.email,
    emailNormalized: actor.email, passwordHash: "synthetic-only", role: actor.role, active: true, version: 1 })));
  await ProjectModel.collection.insertOne({ _id: "tier-project" as never, name: "Tier fixture", clientId: client.id,
    assignedEstimatorId: sales.id, assignedDesignerIds: [], estimationWorkflowVersion: 3, estimateRequirementsVersion: 0,
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
        payload: { pmcMarginBps: 0, subVendorMarginBps: 0, modeCalculations: { sub_vendor: { baseRatePaise: 2000 } }, privateMargin: "never-expose-this",
          tierConfigurations: { premium: { applicability: "configured", payload: { pmcMarginBps: 0, subVendorMarginBps: 0, modeCalculations: { sub_vendor: { baseRatePaise: 5000 } } } } } } }
    ]);
  }
  const line = (id: string, mainLineId: string, roomName: string, quantity: number, ratePaise: number) => ({ id, source: "configuration", itemType: "main_line",
    catalogueId: mainLineId, mainLineId, mainLineName: `${mainLineId} painting`, mainBasketId: "tier-basket", subBasketId: "tier-sub",
    mainBasketName: "Painting", subBasketName: "Walls", revisionId: `revision-${mainLineId}`, sourceItemVersion: 1, sourceRevisionVersion: 1,
    sourceItemStatus: "active", sourceRevisionStatus: "active", roomId: roomName, roomName, clientVisible: mainLineId !== "hidden",
    classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration", uomId: "tier-uom", uomCode: "SQFT", uomName: "sq-ft",
    unit: "sq-ft", uomDecimalScale: 2, quantity, ratePaise, rate: ratePaise / 100, amountPaise: quantity * ratePaise, amount: quantity * ratePaise / 100, included: true });
  await EstimateModel.create({ _id: "tier-estimate", leadId: "tier-lead", ownerId: sales.id, projectId: "tier-project", version: 1, status: "draft",
    estimation: newQuotationLifecycle(), selectedMainBasketIds: ["tier-basket"], propertyType: "2BHK", rooms: [{ id: "Room1", label: "Room1" }, { id: "Room2", label: "Room2" }], scopes: [],
    lineItems: [line("line-one", "visible", "Room1", 2, 2000), line("line-two", "visible", "Room2", 3, 2000), line("line-hidden", "hidden", "Room1", 1, 1000)],
    subtotal: 110, gst: 19.8, total: 129.8, subtotalPaise: 11000, gstPaise: 1980, totalPaise: 12980 });
});

const source = { revisionId: "revision-visible", itemVersion: 1, revisionVersion: 1, uomId: "tier-uom" };
const quantityChange = (expectedVersion = 1, quantity = 4) => ({ expectedVersion,
  operations: [{ kind: "update" as const, lineItemId: "line-one", source, quantity }] });

describe("quotation pricing-mode changes", () => {
  const designer: PublicUser = { id: "mode-designer", name: "Designer", email: "designer@mode.invalid", role: "designer" };
  const modeChange = (pricingMode: "pmc" | "sub_vendor" | "in_house", expectedVersion = 1) => ({ expectedVersion,
    operations: [{ kind: "update" as const, lineItemId: "line-one", source, pricingMode }] });
  async function eligibleModes() {
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "lineItems.0.classification": "special" } });
    await Section.collection.updateOne({ _id: "advanced-visible" as never }, { $set: {
      "payload.modeCalculations.pmc": { baseRatePaise: 4100 },
      "payload.modeCalculations.in_house_labor": { baseRatePaise: 1000, startingMarkupBps: 0 },
      "payload.modeCalculations.in_house_material": { baseRatePaise: 2300, startingMarkupBps: 0 }
    } });
  }
  async function handoff() {
    await UserModel.create({ _id: designer.id, ...designer, emailNormalized: designer.email, passwordHash: "synthetic-only", active: true });
    await ProjectModel.updateOne({ _id: "tier-project" }, { $set: { primaryDesignerId: designer.id } });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { designPlanDesignerId: designer.id, "estimation.phase": "post",
      "estimation.preApproval": { reviewRoundId: "initial-approved", estimateVersion: 1, approvedAt: new Date().toISOString() } } });
  }

  it("projects safe mode-specific choices and changes Client modes without touching another room or hidden lines", async () => {
    await eligibleModes();
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    const detail = await service.detail(client, "tier-project");
    expect(detail.canChangePricingMode).toBe(true);
    expect((await service.detail(sales, "tier-project")).canChangePricingMode).toBe(true);
    expect(detail.lines[0]).toMatchObject({ classification: "special", pricingMode: "sub_vendor" });
    expect(detail.lines[0]!.pricingModeChoices.map(option => option.pricingMode)).toEqual(["pmc", "sub_vendor", "in_house"]);
    expect(detail.lines[1]!.pricingModeChoices.map(option => option.pricingMode)).toEqual(["sub_vendor"]);
    expect(JSON.stringify(detail)).not.toMatch(/privateMargin|never-expose-this|modeCalculations|minimumMarkupBps/);
    const pmc = await service.save(client, "tier-project", modeChange("pmc"));
    expect(pmc.lines[0]).toMatchObject({ pricingMode: "pmc", quantity: 2, ratePaise: 4100, amountPaise: 8200 });
    expect(pmc.totalPaise).toBe(17900);
    const inHouse = await service.save(client, "tier-project", modeChange("in_house", 2));
    expect(inHouse.lines[0]).toMatchObject({ pricingMode: "in_house", quantity: 2, ratePaise: 3300, amountPaise: 6600 });
    const subVendor = await service.save(client, "tier-project", modeChange("sub_vendor", 3));
    expect(subVendor.lines[0]).toMatchObject({ pricingMode: "sub_vendor", quantity: 2, ratePaise: 2000, amountPaise: 4000 });
    const stored = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(stored.lineItems.slice(1)).toEqual(before.lineItems.slice(1));
    expect((await service.detail(client, "tier-project")).lines[0]!.pricingMode).toBe("sub_vendor");
  });

  it("rejects Standard and unavailable-tier mode changes without partial saves", async () => {
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", modeChange("pmc"))).rejects.toMatchObject({ code: "ESTIMATE_PRICING_MODE_INVALID" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    await eligibleModes();
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [{ ...modeChange("pmc").operations[0]!, modeTier: "premium" }] }))
      .rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("lets Client PATCH exclude a saved mode-less manual Standard row without inventing a mode", async () => {
    await EstimateModel.updateOne({ _id: "tier-estimate" }, {
      $unset: { "lineItems.0.pricingMode": 1 }, $set: { "lineItems.0.rateSource": "manual" }
    });
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    const auth = { authenticate: async () => client } as unknown as Parameters<typeof createQuotationRouter>[0];
    const server = express();
    server.use(express.json());
    server.use("/api/v1", createQuotationRouter(auth, createAuditService(createMongoRepository())));
    server.use(errorHandler);
    const path = "/api/v1/projects/tier-project/quotation";
    // Keeping it included still requires a recorded, valid mode for repricing.
    await request(server).patch(path).set("Authorization", "Bearer client").send(quantityChange()).expect(409);
    await request(server).patch(path).set("Authorization", "Bearer client").send({ expectedVersion: 1,
      operations: [{ kind: "update", lineItemId: "line-one", source, included: false, pricingMode: "pmc" }] }).expect(400);
    const response = await request(server).patch(path).set("Authorization", "Bearer client").send({ expectedVersion: 1,
      operations: [{ kind: "update", lineItemId: "line-one", source, included: false }] }).expect(200);
    expect(response.body.data.excludedLines[0]).toMatchObject({ id: "line-one", pricingMode: null, included: false });
    const stored = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(stored.lineItems[0]).toMatchObject({ classification: "standard", rateSource: "manual", ratePaise: 2000, included: false, amountPaise: 0 });
    expect(stored.lineItems[0]).not.toHaveProperty("pricingMode");
    expect(stored.lineItems.slice(1)).toEqual(before.lineItems.slice(1));
  });

  it("moves mode authority to Client and primary Designer while retaining unchanged-mode Sales edits", async () => {
    await eligibleModes();
    await handoff();
    expect((await service.detail(client, "tier-project")).canChangePricingMode).toBe(true);
    expect((await service.detail(designer, "tier-project")).canChangePricingMode).toBe(true);
    expect((await service.detail(sales, "tier-project")).canChangePricingMode).toBe(false);
    await expect(service.save(sales, "tier-project", modeChange("pmc"))).rejects.toMatchObject({ code: "ESTIMATE_PRICING_MODE_FORBIDDEN" });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(1);
    await service.save(sales, "tier-project", quantityChange(1, 3));
    const result = await service.save(designer, "tier-project", modeChange("pmc", 2));
    expect(result.lines[0]).toMatchObject({ pricingMode: "pmc", amountPaise: 12300 });
    const priorApproval = (await EstimateModel.findById("tier-estimate").lean())!.estimation!.preApproval;
    const clientSaved = await service.save(client, "tier-project", modeChange("sub_vendor", 3));
    expect(clientSaved.lines[0]).toMatchObject({ pricingMode: "sub_vendor", amountPaise: 6000 });
    expect((await EstimateModel.findById("tier-estimate").lean())!.estimation!.preApproval).toEqual(priorApproval);
    await expect(service.save(other, "tier-project", modeChange("pmc", 4))).rejects.toMatchObject({ code: "ESTIMATE_TIERS_NOT_FOUND" });
    await ProjectModel.updateOne({ _id: "tier-project" }, { $set: { primaryDesignerId: "different-designer" } });
    await expect(service.save(designer, "tier-project", modeChange("pmc", 4))).rejects.toMatchObject({ code: "ESTIMATE_TIERS_NOT_FOUND" });
  });

  it("supersedes a pending Client review on a mode change without rewriting its snapshot", async () => {
    await eligibleModes();
    const snapshot = { original: "approved price evidence", totalPaise: 12980 };
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: "mode-review" as never, estimateId: "tier-estimate", projectId: "tier-project",
      estimateVersion: 1, version: 1, status: "pending", estimateSnapshot: snapshot });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.status": "sent_to_client", "estimation.pendingReviewRoundId": "mode-review" } });
    expect((await service.detail(client, "tier-project")).canChangePricingMode).toBe(true);
    expect((await service.detail(sales, "tier-project")).canChangePricingMode).toBe(false);
    await service.save(client, "tier-project", modeChange("pmc"));
    expect(await EstimateClientReviewRoundModel.findById("mode-review").lean()).toMatchObject({ status: "superseded", estimateSnapshot: snapshot });
    expect((await EstimateModel.findById("tier-estimate").lean())!.estimation).toMatchObject({ pricedRevision: 2, status: "draft", salesApproval: null, pendingReviewRoundId: null });
    await expect(service.save(client, "tier-project", modeChange("sub_vendor"))).rejects.toMatchObject({ code: "ESTIMATE_VERSION_CONFLICT" });
  });

  it("keeps mode eligibility and saved defaults when adding an eligible item in another room", async () => {
    await eligibleModes();
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $push: { rooms: { id: "Room3", label: "Room3" } } });
    const candidates = await service.items(client, "tier-project", {});
    expect(candidates.items.find(item => item.mainLineId === "visible")).toMatchObject({ classification: "special", pricingModeChoices: expect.arrayContaining([
      expect.objectContaining({ pricingMode: "pmc" }) ]) });
    const saved = await service.save(client, "tier-project", { expectedVersion: 1, operations: [{ kind: "add", mainLineId: "visible", roomId: "Room3", source,
      quantity: 5, pricingMode: "pmc", modeTier: "signature" }] });
    expect(saved.lines.find(line => line.roomId === "Room3")).toMatchObject({ pricingMode: "pmc", classification: "special", amountPaise: 20500 });
    expect(saved.lines.find(line => line.roomId === "Room1")!.pricingMode).toBe("sub_vendor");
  });

  it("validates In-house components and clears their metadata when selecting PMC", async () => {
    await eligibleModes();
    const settings = { baseRatePaise: 1000, lowQuantityLimit: "10", impactBps: 1000, minimumMarkupBps: 1500, startingMarkupBps: 2000 };
    await Section.collection.updateOne({ _id: "advanced-visible" as never }, { $set: { "payload.inHouseComponents": [
      { id: "component", basketId: "tier-basket", subBasketId: "tier-sub", inclusions: [], exclusions: [], labor: settings, material: settings }
    ] } });
    await expect(service.save(client, "tier-project", modeChange("in_house"))).rejects.toMatchObject({ code: "ESTIMATE_COMPONENT_PRICING_UNAVAILABLE" });
    const calculated = await service.save(client, "tier-project", { expectedVersion: 1, operations: [{ ...modeChange("in_house").operations[0]!, selectedInHouseComponentIds: ["component"] }] });
    expect(calculated.lines[0]).toMatchObject({ pricingMode: "in_house", pricingBasis: "in_house_components_v1", selectedInHouseComponentIds: ["component"] });
    await service.save(client, "tier-project", modeChange("pmc", 2));
    const line = (await EstimateModel.findById("tier-estimate").lean())!.lineItems[0]!;
    expect(line).toMatchObject({ pricingMode: "pmc", ratePaise: 4100, amountPaise: 8200 });
    expect(line.selectedInHouseComponentIds).toBeUndefined();
    expect(line.componentPricing).toBeUndefined();
    expect(line.pricingBasis).toBeUndefined();
  });

  it("checks selected positive component bases while allowing a rounded-zero amount", async () => {
    await eligibleModes();
    await SubBasket.collection.insertOne({ _id: "zero-component-sub" as never, basketId: "tier-basket", name: "Zero component", status: "active", displayOrder: 2, version: 1 });
    const settings = (baseRatePaise: number) => ({ baseRatePaise, lowQuantityLimit: "10", impactBps: 0,
      minimumMarkupBps: 0, startingMarkupBps: 0 });
    const component = (id: string, baseRatePaise: number) => ({ id, basketId: "tier-basket", subBasketId: id === "zero" ? "zero-component-sub" : "tier-sub",
      inclusions: [], exclusions: [], labor: settings(baseRatePaise), material: settings(0) });
    await Section.updateOne({ _id: "advanced-visible" }, { $set: { "payload.inHouseComponents": [component("zero", 0), component("positive", 1)] } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [{ ...modeChange("in_house").operations[0]!,
      selectedInHouseComponentIds: ["zero"] }] })).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    const result = await service.save(client, "tier-project", { expectedVersion: 1, operations: [{ ...modeChange("in_house").operations[0]!,
      quantity: 0.01, selectedInHouseComponentIds: ["positive"] }] });
    expect(result.lines[0]).toMatchObject({ pricingMode: "in_house", quantity: 0.01, ratePaise: null, amountPaise: 0,
      componentPricing: { totalPaise: 0 }, choices: expect.arrayContaining([expect.objectContaining({ modeTier: "signature", available: true })]) });
  });

  it("preserves saved zero money while rejecting a new zero-priced selection", async () => {
    await Section.updateOne({ _id: "advanced-visible" }, { $set: { "payload.modeCalculations.sub_vendor.baseRatePaise": 0 } });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "lineItems.0.ratePaise": 0, "lineItems.0.rate": 0,
      "lineItems.0.amountPaise": 0, "lineItems.0.amount": 0 } });
    const detail = await service.detail(client, "tier-project");
    expect(detail.lines[0]).toMatchObject({ id: "line-one", ratePaise: 0, amountPaise: 0,
      choices: expect.arrayContaining([expect.objectContaining({ modeTier: "signature", available: false })]) });
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [{ kind: "add", mainLineId: "visible",
      roomId: "Room1", source, modeTier: "signature" }] })).rejects.toMatchObject({ code: "QUOTATION_ITEM_EXISTS" });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $push: { rooms: { id: "Room3", label: "Room3" } } });
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [{ kind: "add", mainLineId: "visible",
      roomId: "Room3", source, modeTier: "signature" }] })).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    expect((await service.save(client, "tier-project", quantityChange(1, 0.01))).lines[0])
      .toMatchObject({ id: "line-one", ratePaise: 0, amountPaise: 0 });
  });
});

async function recommendationLine(id: string, input: { visible?: boolean; basketId?: string; subBasketId?: string; priced?: boolean } = {}) {
  const basketId = input.basketId ?? "tier-basket";
  const subBasketId = input.subBasketId ?? "tier-sub";
  await MainLine.collection.insertOne({ _id: id as never, name: id, basketId, subBasketId,
    itemType: "main_line", status: "active", version: 1, activeRevisionId: `revision-${id}`, displayOrder: 1 });
  await Revision.collection.insertOne({ _id: `revision-${id}` as never, mainLineId: id, status: "active", revisionNumber: 1, version: 1 });
  await Section.collection.insertMany([
    { _id: `overview-${id}` as never, mainLineId: id, revisionId: `revision-${id}`, sectionKey: "overview", applicability: "configured", version: 1,
      payload: { uomId: "tier-uom", clientVisible: input.visible !== false, applicableTiers: ["signature"] } },
    { _id: `advanced-${id}` as never, mainLineId: id, revisionId: `revision-${id}`, sectionKey: "advanced", applicability: "configured", version: 1,
      payload: { pmcMarginBps: 0, subVendorMarginBps: 0, modeCalculations: input.priced === false ? {} : { sub_vendor: { baseRatePaise: 2000 } } } }
  ]);
}
const mustRule = (targetMainLineId: string, overrides: Record<string, unknown> = {}) => ({ id: `rule-${targetMainLineId}`, active: true,
  trigger: "added", action: "add", requirement: "must", targetKind: "main_line", targetType: "catalog",
  targetBasketId: "tier-basket", targetSubBasketId: "tier-sub", targetMainLineId, reason: "Internal reason must never appear", ...overrides });
async function recommendationRules(mainLineId: string, rules: unknown[]) {
  await Section.collection.insertOne({ _id: `recommendations-${mainLineId}` as never, mainLineId, revisionId: `revision-${mainLineId}`,
    sectionKey: "recommendations", applicability: "configured", version: 1, payload: { budgetAlterations: rules } });
}
const recommendationRead = () => ({ expectedVersion: 1, roomId: "Room1", sources: [{ mainLineId: "visible", source }] });
const targetSource = (id = "target") => ({ revisionId: `revision-${id}`, itemVersion: 1, revisionVersion: 1, uomId: "tier-uom" });
const addRecommendation = (origins = ["visible"], mainLineId = "target", roomId = "Room1") => ({ kind: "add" as const,
  mainLineId, roomId, source: targetSource(mainLineId), quantity: 1, modeTier: "signature" as const,
  recommendationSourceMainLineIds: origins });
const removeGroup = async (scope: { subBasketId: string | null; roomId: string | null }, projectId = "tier-project") => {
  const detail = await service.detail(client, projectId);
  const group = detail.groups.find(value => value.mainBasketId === "tier-basket" && value.subBasketId === scope.subBasketId && value.roomId === scope.roomId);
  if (!group) throw new Error("Synthetic group missing");
  const { includedCount: _count, ...identity } = group;
  return { expectedVersion: detail.estimateVersion!, operations: [{ kind: "exclude_group" as const, ...identity }] };
};

describe("Client inline non-negotiable recommendations", () => {
  it("filters Standard PMC-only and unusable tier targets before Client choices and setup counts", async () => {
    for (const id of ["pmc-only", "default-only", "missing-margin", "premium-only"]) await recommendationLine(id, { priced: false });
    await Section.updateOne({ _id: "advanced-pmc-only" }, { $set: { payload: {
      pmcMarginBps: 0, modeCalculations: { pmc: { baseRatePaise: 3000 }, sub_vendor: { baseRatePaise: 0 } }
    } } });
    await Section.updateOne({ _id: "advanced-default-only" }, { $set: { payload: { tierConfigurations: {
      default: { applicability: "configured", payload: { subVendorMarginBps: 0, modeCalculations: { sub_vendor: { baseRatePaise: 1000 } } } }
    } } } });
    await Section.updateOne({ _id: "advanced-missing-margin" }, { $set: { payload: { modeCalculations: { sub_vendor: { baseRatePaise: 1000 } } } } });
    await Section.updateOne({ _id: "overview-premium-only" }, { $set: { "payload.applicableTiers": ["signature", "premium"] } });
    await Section.updateOne({ _id: "advanced-premium-only" }, { $set: { payload: {
      subVendorMarginBps: 0, modeCalculations: { sub_vendor: { baseRatePaise: 0 } }, tierConfigurations: {
        premium: { applicability: "configured", payload: { subVendorMarginBps: 2000, modeCalculations: { sub_vendor: { baseRatePaise: 2000 } } } }
      }
    } } });
    await recommendationRules("visible", ["pmc-only", "default-only", "missing-margin", "premium-only"].map(id => mustRule(id)));
    const before = await EstimateModel.findById("tier-estimate").lean();
    const items = await service.items(client, "tier-project", { search: "only", limit: 1 });
    expect(items).toMatchObject({ total: 1, items: [{ mainLineId: "premium-only", modeTier: "premium", choices: [
      { modeTier: "signature", available: false }, { modeTier: "premium", available: true, ratePaise: 2400 }, { modeTier: "functional", available: false }
    ] }] });
    expect(await service.recommendations(client, "tier-project", recommendationRead()))
      .toMatchObject({ total: 1, reviewMessage: expect.any(String), items: [{ candidate: { mainLineId: "premium-only" } }] });
    expect((await service.setup(client, "tier-project")).baskets.find(basket => basket.id === "tier-basket"))
      .toMatchObject({ subBaskets: [{ mainLineCount: 2 }] });
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [addRecommendation(["visible"], "premium-only")] }))
      .rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
  });

  it("serves the bounded read as a private project-scoped HTTP operation", async () => {
    const auth = { authenticate: async (token: string) => token === "client" ? client : other } as unknown as Parameters<typeof createQuotationRouter>[0];
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createQuotationRouter(auth, createAuditService(createMongoRepository())));
    app.use(errorHandler);
    await recommendationLine("target");
    await recommendationRules("visible", [mustRule("target")]);
    const path = "/api/v1/projects/tier-project/quotation/recommendations/query";
    const result = await request(app).post(path).set("Authorization", "Bearer client").send(recommendationRead());
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.body.data.items[0].candidate.mainLineId).toBe("target");
    expect((await request(app).post(path).set("Authorization", "Bearer client").send({ ...recommendationRead(), limit: 21 })).status).toBe(400);
    const denied = await request(app).post(path).set("Authorization", "Bearer other").send(recommendationRead());
    expect([403, 404]).toContain(denied.status);
    expect(JSON.stringify(denied.body)).not.toContain("target");
    const candidates = await request(app).get("/api/v1/projects/tier-project/quotation/items")
      .set("Authorization", "Bearer client").query({ search: "target", mainBasketId: "tier-basket", subBasketId: "tier-sub", limit: 20 });
    expect(candidates.status).toBe(200);
    expect(candidates.body.data.total).toBe(1);
    expect((await request(app).get("/api/v1/projects/tier-project/quotation/items").set("Authorization", "Bearer client")
      .query({ mainBasketId: " " })).status).toBe(400);
  });

  it("keeps unequal projects and their versions isolated for the two Clients", async () => {
    await recommendationLine("target");
    await recommendationRules("visible", [mustRule("target")]);
    const original = (await EstimateModel.findById("tier-estimate").lean())!;
    await ProjectModel.collection.insertOne({ _id: "other-project" as never, name: "Other synthetic project", clientId: other.id,
      assignedEstimatorId: sales.id, assignedDesignerIds: [], estimationWorkflowVersion: 3, status: "planning" });
    await LeadModel.collection.insertOne({ _id: "other-lead" as never, projectId: "other-project", ownerId: sales.id });
    await EstimateModel.collection.insertOne({ ...original, _id: "other-estimate" as never, projectId: "other-project", leadId: "other-lead", version: 7,
      subtotalPaise: 22000, gstPaise: 3960, totalPaise: 25960, subtotal: 220, gst: 39.6, total: 259.6,
      lineItems: original.lineItems.map(line => ({ ...line, quantity: line.quantity * 2, amountPaise: line.amountPaise! * 2, amount: line.amount! * 2 })) });
    await expect(service.recommendations(client, "other-project", { ...recommendationRead(), expectedVersion: 7 })).rejects.toMatchObject({ status: 404 });
    await expect(service.recommendations(other, "tier-project", recommendationRead())).rejects.toMatchObject({ status: 404 });
    expect(await service.recommendations(other, "other-project", { ...recommendationRead(), expectedVersion: 7 }))
      .toMatchObject({ projectId: "other-project", estimateId: "other-estimate", estimateVersion: 7 });
    expect((await EstimateModel.findById("tier-estimate").lean())!.totalPaise).toBe(12980);
    expect((await EstimateModel.findById("other-estimate").lean())!.totalPaise).toBe(25960);
  });

  it("projects only visible must-add targets and never internal reasons or hidden counts", async () => {
    await recommendationLine("target");
    await recommendationLine("optional");
    await recommendationRules("visible", [mustRule("target"), mustRule("optional", { requirement: "can" }),
      mustRule("hidden"), mustRule("optional", { id: "remove-rule", action: "remove" })]);
    const before = await EstimateModel.findById("tier-estimate").lean();
    const result = await service.recommendations(client, "tier-project", recommendationRead());
    expect(result).toMatchObject({ projectId: "tier-project", estimateId: "tier-estimate", estimateVersion: 1, roomId: "Room1", total: 1, limit: 20, offset: 0 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ candidate: { mainLineId: "target" },
      sourceMainLines: [{ mainLineId: "visible", name: "visible painting" }], requiresSetup: false });
    expect(JSON.stringify(result)).not.toMatch(/hidden|optional|Internal reason|privateMargin/);
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("deduplicates Sub Basket targets and supports current unsaved visible source selections", async () => {
    await recommendationLine("source-two");
    await SubBasket.collection.insertOne({ _id: "targets-sub" as never, basketId: "tier-basket", name: "Targets", displayOrder: 2, version: 1 });
    await recommendationLine("target", { subBasketId: "targets-sub" });
    await recommendationLine("target-hidden", { subBasketId: "targets-sub", visible: false });
    await recommendationRules("visible", [mustRule("target", { targetSubBasketId: "targets-sub" })]);
    await recommendationRules("source-two", [mustRule("target", { targetKind: "sub_basket", targetType: null,
      targetMainLineId: null, targetSubBasketId: "targets-sub" })]);
    const result = await service.recommendations(client, "tier-project", { ...recommendationRead(),
      sources: [...recommendationRead().sources, { mainLineId: "source-two", source: targetSource("source-two") }] });
    expect(result.total).toBe(1);
    expect(result.items[0]!.candidate.mainLineId).toBe("target");
    expect(result.items[0]!.sourceMainLines.map(line => line.mainLineId).sort()).toEqual(["source-two", "visible"]);
    expect(JSON.stringify(result)).not.toContain("target-hidden");
  });

  it("keeps default-only cross-basket targets in required review without offering an unavailable Client choice", async () => {
    await Basket.collection.insertOne({ _id: "extra-basket" as never, name: "Extra", status: "active", displayOrder: 2, version: 1 });
    await SubBasket.collection.insertOne({ _id: "extra-sub" as never, basketId: "extra-basket", name: "Extra items", displayOrder: 1, version: 1 });
    await recommendationLine("target", { basketId: "extra-basket", subBasketId: "extra-sub", priced: false });
    await Section.updateOne({ _id: "advanced-target" }, { $set: { "payload.tierConfigurations.default": {
      applicability: "configured", payload: { modeCalculations: { pmc: { baseRatePaise: 1234 } } }
    } } });
    await recommendationRules("visible", [mustRule("target", { targetBasketId: "extra-basket", targetSubBasketId: "extra-sub" })]);
    const result = await service.recommendations(client, "tier-project", recommendationRead());
    expect(result).toMatchObject({ items: [], total: 0, reviewMessage: expect.any(String) });
    expect((await service.items(client, "tier-project")).items.some(item => item.mainLineId === "target")).toBe(false);
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [addRecommendation()] })).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
  });

  it("hides zero-only mandatory targets without losing the Client review message or leaking hidden targets", async () => {
    await recommendationLine("unpriced", { priced: false });
    await recommendationLine("hidden-unpriced", { priced: false, visible: false });
    await Section.updateMany({ mainLineId: { $in: ["unpriced", "hidden-unpriced"] }, sectionKey: "advanced" },
      { $set: { "payload.modeCalculations.sub_vendor.baseRatePaise": 0 } });
    await recommendationRules("visible", [mustRule("unpriced"), mustRule("hidden-unpriced")]);
    const before = await EstimateModel.findById("tier-estimate").lean();
    const result = await service.recommendations(client, "tier-project", recommendationRead());
    expect(result).toMatchObject({ items: [], total: 0, reviewMessage: "Some required items have no base price greater than zero. Ask your team to review them." });
    expect(await service.items(client, "tier-project", { search: "unpriced" })).toMatchObject({ items: [], total: 0 });
    expect(JSON.stringify(result)).not.toMatch(/unpriced|hidden-unpriced|Internal reason/);
    await recommendationRules("hidden", [mustRule("unpriced")]);
    await Section.updateOne({ _id: "recommendations-visible" }, { $set: { "payload.budgetAlterations": [mustRule("hidden-unpriced")] } });
    expect(await service.recommendations(client, "tier-project", recommendationRead())).not.toHaveProperty("reviewMessage");
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
  });

  it("keeps unpriced selected recommendations reviewable and removable without changing saved amounts", async () => {
    await recommendationLine("target");
    await recommendationRules("visible", [mustRule("target")]);
    const added = await service.save(client, "tier-project", { expectedVersion: 1, operations: [addRecommendation()] });
    const target = added.lines.find(line => line.mainLineId === "target")!;
    await Section.updateOne({ _id: "advanced-target" }, { $set: { payload: {} } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    const result = await service.recommendations(client, "tier-project", { ...recommendationRead(), expectedVersion: 2 });
    expect(result).toMatchObject({ total: 1, reviewMessage: expect.any(String), items: [{ candidate: { mainLineId: "target" } }] });
    const selectedSources = await quotationVisibleRecommendationSources(before!, undefined, ["visible", "target"]);
    expect((await quotationMandatoryTargets(["visible"], selectedSources)).get("visible")?.has("target")).toBe(true);
    expect((await service.items(client, "tier-project")).items.some(item => item.mainLineId === "target")).toBe(false);
    const detail = await service.detail(client, "tier-project");
    expect(detail.lines.find(line => line.id === target.id)).toMatchObject({ id: target.id, included: true, ratePaise: target.ratePaise, amountPaise: target.amountPaise });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    const removed = await service.save(client, "tier-project", { expectedVersion: 2, operations: [{ kind: "update", lineItemId: target.id,
      source: targetSource(), included: false }] });
    expect(removed.excludedLines).toContainEqual(expect.objectContaining({ id: target.id, included: false }));
  });

  it("filters unpriced group children before recommendation counts and retains required review", async () => {
    await SubBasket.collection.insertOne({ _id: "targets-sub" as never, basketId: "tier-basket", name: "Targets", status: "active", displayOrder: 2 });
    await recommendationLine("target-priced", { subBasketId: "targets-sub" });
    await recommendationLine("target-unpriced", { subBasketId: "targets-sub", priced: false });
    await recommendationRules("visible", [mustRule("group", { targetKind: "sub_basket", targetType: null,
      targetMainLineId: null, targetSubBasketId: "targets-sub" })]);
    const result = await service.recommendations(client, "tier-project", recommendationRead());
    expect(result).toMatchObject({ total: 1, reviewMessage: expect.any(String), items: [{ candidate: { mainLineId: "target-priced" } }] });
  });

  it("uses the latest draft source rules and rejects stale current identities", async () => {
    await recommendationLine("old-target");
    await recommendationLine("target");
    await recommendationRules("visible", [mustRule("old-target")]);
    await MainLine.updateOne({ _id: "visible" }, { $set: { draftRevisionId: "draft-visible", version: 2 } });
    await Revision.collection.insertOne({ _id: "draft-visible" as never, mainLineId: "visible", status: "draft", revisionNumber: 2, version: 2 });
    const oldSections = await Section.find({ mainLineId: "visible", sectionKey: { $in: ["overview", "advanced"] } }).lean();
    await Section.collection.insertMany(oldSections.map(section => ({ ...section, _id: `draft-${section.sectionKey}` as never, revisionId: "draft-visible" })));
    await Section.collection.insertOne({ _id: "draft-recommendations" as never, mainLineId: "visible", revisionId: "draft-visible",
      sectionKey: "recommendations", applicability: "configured", version: 2, payload: { budgetAlterations: [mustRule("target")] } });
    await expect(service.recommendations(client, "tier-project", recommendationRead())).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    const result = await service.recommendations(client, "tier-project", { ...recommendationRead(),
      sources: [{ mainLineId: "visible", source: { ...source, revisionId: "draft-visible", itemVersion: 2, revisionVersion: 2 } }] });
    expect(result.items.map(item => item.candidate.mainLineId)).toEqual(["target"]);
  });

  it("hides frozen-hidden and currently hidden sources and targets", async () => {
    await recommendationLine("target");
    await recommendationRules("visible", [mustRule("target"), mustRule("hidden")]);
    await Section.updateOne({ _id: "overview-hidden" }, { $set: { "payload.clientVisible": true } });
    expect((await service.recommendations(client, "tier-project", recommendationRead())).total).toBe(1);
    await Section.updateOne({ _id: "overview-target" }, { $set: { "payload.clientVisible": false } });
    expect((await service.recommendations(client, "tier-project", recommendationRead())).total).toBe(0);
    for (const id of ["hidden", "not-a-line"]) {
      await expect(service.recommendations(client, "tier-project", { ...recommendationRead(),
        sources: [{ mainLineId: id, source: targetSource(id) }] })).rejects.toMatchObject({ status: 404, code: "QUOTATION_NOT_FOUND" });
    }
    await Section.updateOne({ _id: "overview-visible" }, { $set: { "payload.clientVisible": false } });
    await expect(service.recommendations(client, "tier-project", recommendationRead())).rejects.toMatchObject({ status: 404, code: "QUOTATION_NOT_FOUND" });
  });

  it("rejects unauthorized projects, stale versions, unknown rooms and invalid bounds without writes", async () => {
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.recommendations(other, "tier-project", recommendationRead())).rejects.toMatchObject({ status: 404 });
    await expect(service.recommendations(client, "tier-project", { ...recommendationRead(), expectedVersion: 2 })).rejects.toMatchObject({ code: "ESTIMATE_VERSION_CONFLICT" });
    await expect(service.recommendations(client, "tier-project", { ...recommendationRead(), roomId: "Other room" })).rejects.toMatchObject({ status: 404 });
    for (const input of [{ limit: 21 }, { offset: -1 }, { sources: [...recommendationRead().sources, ...recommendationRead().sources] },
      { sources: Array.from({ length: 201 }, (_, index) => ({ mainLineId: `source-${index}`, source })) }]) {
      await expect(service.recommendations(client, "tier-project", { ...recommendationRead(), ...input })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("paginates recommendations and searches/filter candidates before pagination", async () => {
    const ids = Array.from({ length: 25 }, (_, index) => `target-${String(index).padStart(2, "0")}`);
    for (const id of ids) await recommendationLine(id);
    await recommendationLine("target-00-empty", { priced: false });
    await recommendationLine("target-12-empty", { priced: false });
    await MainLine.updateOne({ _id: "target-12-empty" }, { $set: { itemType: "temporary", subBasketId: null } });
    await recommendationRules("visible", ids.map(id => mustRule(id)));
    const first = await service.recommendations(client, "tier-project", recommendationRead());
    const second = await service.recommendations(client, "tier-project", { ...recommendationRead(), offset: 20 });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(5);
    expect(second.total).toBe(25);
    expect([...first.items, ...second.items].map(item => item.candidate.mainLineId)).toEqual(ids);
    expect(await service.items(client, "tier-project", { search: "target-24", mainBasketId: "tier-basket", subBasketId: "tier-sub" }))
      .toMatchObject({ total: 1, items: [{ mainLineId: "target-24" }] });
    expect((await service.items(client, "tier-project", { mainBasketId: "unrelated-basket", subBasketId: "tier-sub" })).total).toBe(0);
    const candidates = await service.items(client, "tier-project", { search: "target-", limit: 20, offset: 20 });
    expect(candidates).toMatchObject({ total: 25, items: ids.slice(20).map(mainLineId => ({ mainLineId })) });
    expect((await service.setup(client, "tier-project")).baskets.find(basket => basket.id === "tier-basket"))
      .toMatchObject({ directTemporaryItemCount: 0, subBaskets: [{ mainLineCount: 26 }] });
  });

  it("removes a recommended target, preserves its source, and restores it independently with its stable ID", async () => {
    await recommendationLine("target");
    await recommendationRules("visible", [mustRule("target")]);
    const added = await service.save(client, "tier-project", { expectedVersion: 1, operations: [addRecommendation()] });
    const target = added.lines.find(line => line.mainLineId === "target")!;
    expect(target.recommendationSourceMainLineIds).toEqual(["visible"]);
    const removed = await service.save(client, "tier-project", { expectedVersion: 2, operations: [{ kind: "update", lineItemId: target.id,
      source: targetSource(), included: false }] });
    expect(removed.lines.some(line => line.id === "line-one")).toBe(true);
    expect(removed.excludedLines).toContainEqual(expect.objectContaining({ id: target.id, included: false, recommendationSourceMainLineIds: [] }));
    const reopened = await service.detail(client, "tier-project");
    expect(reopened.lines.some(line => line.id === target.id)).toBe(false);
    const { recommendationSourceMainLineIds: _origins, ...manualAdd } = addRecommendation();
    const restored = await service.save(client, "tier-project", { expectedVersion: 3, operations: [manualAdd] });
    expect(restored.lines.find(line => line.mainLineId === "target")).toMatchObject({ id: target.id, recommendationSourceMainLineIds: [] });
    const sourceRemoved = await service.save(client, "tier-project", { expectedVersion: 4, operations: [{ kind: "update", lineItemId: "line-one", source, included: false }] });
    expect(sourceRemoved.lines.some(line => line.id === target.id)).toBe(true);
  });

  it("cascades only same-room visible recommended dependents while preserving hidden lines", async () => {
    await recommendationLine("target");
    await recommendationRules("visible", [mustRule("target")]);
    await EstimateModel.updateOne({ _id: "tier-estimate", "lineItems.id": "line-hidden" },
      { $set: { "lineItems.$.recommendationSourceMainLineIds": ["visible"] } });
    await service.save(client, "tier-project", { expectedVersion: 1, operations: [addRecommendation(), addRecommendation(["visible"], "target", "Room2")] });
    const hidden = (await EstimateModel.findById("tier-estimate").lean())!.lineItems.find(line => line.id === "line-hidden");
    const result = await service.save(client, "tier-project", { expectedVersion: 2, operations: [{ kind: "update", lineItemId: "line-one", source, included: false }] });
    expect(result.lines.filter(line => line.mainLineId === "target").map(line => line.roomId)).toEqual(["Room2"]);
    expect(result.excludedLines).toContainEqual(expect.objectContaining({ mainLineId: "target", roomId: "Room1", included: false }));
    expect((await EstimateModel.findById("tier-estimate").lean())!.lineItems.find(line => line.id === "line-hidden")).toEqual(hidden);
  });

  it("keeps a dependent while another included source remains and hides partial origin metadata", async () => {
    await recommendationLine("target");
    await recommendationLine("source-two");
    await recommendationRules("visible", [mustRule("target")]);
    await recommendationRules("source-two", [mustRule("target")]);
    const { recommendationSourceMainLineIds: _origins, ...sourceAdd } = addRecommendation([], "source-two");
    const added = await service.save(client, "tier-project", { expectedVersion: 1, operations: [addRecommendation(["visible", "source-two"]), sourceAdd] });
    const target = added.lines.find(line => line.mainLineId === "target")!;
    const result = await service.save(client, "tier-project", { expectedVersion: 2, operations: [{ kind: "update", lineItemId: "line-one", source, included: false }] });
    expect(result.lines.find(line => line.id === target.id)?.recommendationSourceMainLineIds).toEqual(["source-two"]);
    await EstimateModel.updateOne({ _id: "tier-estimate", "lineItems.id": target.id },
      { $set: { "lineItems.$.recommendationSourceMainLineIds": ["source-two", "hidden"] } });
    expect((await service.detail(client, "tier-project")).lines.find(line => line.id === target.id)).not.toHaveProperty("recommendationSourceMainLineIds");
    const sourceTwo = result.lines.find(line => line.mainLineId === "source-two")!;
    const lastVisibleRemoved = await service.save(client, "tier-project", { expectedVersion: 3,
      operations: [{ kind: "update", lineItemId: sourceTwo.id, source: targetSource("source-two"), included: false }] });
    expect(lastVisibleRemoved.lines.find(line => line.id === target.id)).toBeDefined();
  });

  it("rejects forged, optional, hidden and different-room origins without changing the estimate", async () => {
    await recommendationLine("target");
    await recommendationRules("visible", [mustRule("target", { requirement: "can" })]);
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [addRecommendation()] })).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    for (const origin of ["unknown", "hidden", "target"]) {
      await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [addRecommendation([origin])] }))
        .rejects.toMatchObject({ code: "QUOTATION_RECOMMENDATION_SOURCE_INVALID" });
    }
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    await EstimateModel.updateOne({ _id: "tier-estimate", "lineItems.id": "line-one" }, { $set: { "lineItems.$.included": false } });
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [addRecommendation()] }))
      .rejects.toMatchObject({ code: "QUOTATION_RECOMMENDATION_SOURCE_INVALID" });
  });
});

describe("version 3 Client quotation commands", () => {
  it("returns the authoritative quotation-approval contract from GET and PATCH", async () => {
    const auth = { authenticate: async () => client } as unknown as Parameters<typeof createQuotationRouter>[0];
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createQuotationRouter(auth, createAuditService(createMongoRepository())));
    app.use(errorHandler);
    const approvalFields = {
      quotationApprovalState: "source_issue",
      currentQuotationApproved: false,
      requiresClientReapproval: false,
      quotationApprovalSource: null,
      currentQuotationApproval: null
    };
    const detail = await request(app).get("/api/v1/projects/tier-project/quotation").set("Authorization", "Bearer client").expect(200);
    expect(detail.body.data).toMatchObject(approvalFields);
    const saved = await request(app).patch("/api/v1/projects/tier-project/quotation")
      .set("Authorization", "Bearer client").send(quantityChange()).expect(200);
    expect(saved.body.data).toMatchObject(approvalFields);
  });

  it("uses the live Lead Project ID without changing the quotation snapshot", async () => {
    await LeadModel.collection.updateOne({ _id: "tier-lead" as never }, { $set: { projectNumber: "Lisno000012" } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    expect(await service.detail(client, "tier-project")).toMatchObject({ projectId: "tier-project", projectNumber: "Lisno000012" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
  });

  it("allows current secondary Designers a safe read but no commercial mutation", async () => {
    const secondary = { id: "secondary-quotation-designer", name: "Secondary", email: "secondary@quote.invalid", role: "designer" } as const;
    await UserModel.create({ _id: secondary.id, ...secondary, emailNormalized: secondary.email, passwordHash: "synthetic", active: true });
    await ProjectModel.updateOne({ _id: "tier-project" }, { $set: { secondaryDesignerIds: [secondary.id], assignedDesignerIds: [secondary.id] } });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.preApproval": { reviewRoundId: "synthetic-preapproval", estimateVersion: 1, approvedAt: new Date().toISOString() }, "estimation.phase": "post" } });
    const detail = await service.detail(secondary, "tier-project");
    expect(detail.editingAllowed).toBe(false);
    expect(detail.lines.map(line => line.id)).toEqual(["line-one", "line-two"]);
    await expect(service.save(secondary, "tier-project", quantityChange())).rejects.toMatchObject({ code: "QUOTATION_NOT_FOUND" });
    await expect(service.save(secondary, "tier-project", await removeGroup({ subBasketId: null, roomId: null }))).rejects.toMatchObject({ code: "QUOTATION_NOT_FOUND" });
    await ProjectModel.updateOne({ _id: "tier-project" }, { $set: { secondaryDesignerIds: [] } });
    await expect(service.revision(secondary, "tier-project")).rejects.toMatchObject({ code: "ESTIMATE_TIERS_NOT_FOUND" });
  });

  it.each([[1664, 8664, 1560, 10200, -24], [1688, 8688, 1564, 10300, 48], [3042, 10042, 1808, 11800, -50]])(
    "rounds the final quotation total after an edit at rate %i, preserving GST and unit rates", async (ratePaise, subtotalPaise, gstPaise, totalPaise, roundOffPaise) => {
      await Section.collection.updateOne({ _id: "advanced-visible" as never }, { $set: {
        "payload.modeCalculations.sub_vendor.baseRatePaise": ratePaise
      } });
      expect(await service.detail(client, "tier-project")).not.toHaveProperty("roundOffPaise");
      const result = await service.save(client, "tier-project", quantityChange(1, 1));
      expect(result).toMatchObject({ totalPaise, roundOffPaise });
      expect(result.lines[0]).toMatchObject({ quantity: 1, ratePaise, amountPaise: ratePaise });
      expect(await EstimateModel.findById("tier-estimate").lean()).toMatchObject({ subtotalPaise, gstPaise, totalPaise, roundOffPaise });
      expect(await service.detail(client, "tier-project")).toMatchObject({ totalPaise, roundOffPaise });
    });

  it("recalculates the edited quantity and preserves hidden internal rows and true totals", async () => {
    const hidden = (await EstimateModel.findById("tier-estimate").lean())!.lineItems[2];
    const result = await service.save(client, "tier-project", quantityChange());
    expect(result).toMatchObject({ workflowVersion: 3, estimateVersion: 2, pricedRevision: 2, totalPaise: 17700, reviewState: "awaiting_staff_review" });
    expect(result.lines.map(line => line.id)).toEqual(["line-one", "line-two"]);
    expect(result.lines[0]).toMatchObject({ quantity: 4, ratePaise: 2000, amountPaise: 8000 });
    expect((await EstimateModel.findById("tier-estimate").lean())!.lineItems[2]).toEqual(hidden);
  });

  it("atomically supersedes an undecided review while preserving its immutable snapshot", async () => {
    const snapshot = { original: "immutable synthetic evidence", totalPaise: 12980 };
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: "pending-quote" as never, estimateId: "tier-estimate", projectId: "tier-project",
      estimateVersion: 1, version: 1, status: "pending", estimateSnapshot: snapshot });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.status": "sent_to_client", "estimation.pendingReviewRoundId": "pending-quote" } });
    expect((await service.detail(client, "tier-project")).editingAllowed).toBe(true);
    await service.save(client, "tier-project", quantityChange());
    expect(await EstimateClientReviewRoundModel.findById("pending-quote").lean()).toMatchObject({ status: "superseded", version: 2, estimateSnapshot: snapshot });
    expect((await EstimateModel.findById("tier-estimate").lean())!.estimation).toMatchObject({ status: "draft", pendingReviewRoundId: null, salesApproval: null });
  });

  it("removes and restores an item without losing its stable identity", async () => {
    const removed = await service.save(client, "tier-project", { expectedVersion: 1, operations: [{ kind: "update", lineItemId: "line-one", source, included: false }] });
    expect(removed.lines.map(line => line.id)).toEqual(["line-two"]);
    expect(removed.totalPaise).toBe(8300);
    expect(removed.excludedLines).toEqual([expect.objectContaining({ id: "line-one", included: false, quantity: 2,
      mainBasketId: "tier-basket", mainBasketName: "Painting", subBasketId: "tier-sub", subBasketName: "Walls" })]);
    const restored = await service.save(client, "tier-project", { expectedVersion: 2, operations: [{ kind: "add", mainLineId: "visible", roomId: "Room1", source, quantity: 1, modeTier: "premium" }] });
    expect(restored.lines.find(line => line.roomId === "Room1")).toMatchObject({ id: "line-one", quantity: 1, ratePaise: 5000 });
  });

  it("returns the complete safe hierarchy and scope tokens independent of candidate pagination", async () => {
    const detail = await service.detail(client, "tier-project");
    expect(detail.baskets).toEqual([{ id: "tier-basket", name: "Painting", subBaskets: [{ id: "tier-sub", name: "Walls" }] }]);
    expect(detail.groups).toHaveLength(5);
    expect(detail.groups.find(group => group.roomId === null)).toMatchObject({ mainBasketId: "tier-basket", subBasketId: null,
      includedCount: 2, sourceToken: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    expect(detail.lines[0]).toMatchObject({ mainBasketId: "tier-basket", mainBasketName: "Painting", subBasketId: "tier-sub", subBasketName: "Walls" });
    const candidates = await service.items(client, "tier-project", { limit: 1, offset: 1 });
    expect(candidates.items).toEqual([]);
    expect((await service.detail(client, "tier-project")).groups).toEqual(detail.groups);
    expect((await service.items(client, "tier-project")).items[0]).toMatchObject({ mainBasketId: "tier-basket", subBasketId: "tier-sub" });
    expect(JSON.stringify(detail)).not.toContain("hidden painting");
    expect(JSON.stringify(detail)).not.toContain("never-expose-this");
  });

  it("removes a Sub Basket in one room while preserving hidden siblings, other rooms and saved choices", async () => {
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    const sections = await Section.find().lean();
    const result = await service.save(client, "tier-project", await removeGroup({ subBasketId: "tier-sub", roomId: "Room1" }));
    expect(result.lines.map(line => line.id)).toEqual(["line-two"]);
    expect(result.totalPaise).toBe(8300);
    expect(result.excludedLines[0]).toMatchObject({ id: "line-one", included: false, quantity: 2, modeTier: "signature" });
    const after = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(after.lineItems[1]).toEqual(before.lineItems[1]);
    expect(after.lineItems[2]).toEqual(before.lineItems[2]);
    expect(after.selectedMainBasketIds).toEqual(before.selectedMainBasketIds);
    expect(await Section.find().lean()).toEqual(sections);
    const restored = await service.save(client, "tier-project", { expectedVersion: 2, operations: [{ kind: "update", lineItemId: "line-one", source, included: true }] });
    expect(restored.lines.find(line => line.id === "line-one")).toMatchObject({ quantity: 2, amountPaise: 4000 });
    expect(restored.totalPaise).toBe(13000);
  });

  it("can exclude an In-house group with unavailable component references and retains measurements and component choices", async () => {
    const settings = { baseRatePaise: 1000, lowQuantityLimit: "10", impactBps: 1000, minimumMarkupBps: 1500, startingMarkupBps: 2000 };
    await Section.collection.updateOne({ _id: "advanced-visible" as never }, { $set: { "payload.inHouseComponents": [
      { id: "retained-component", basketId: "missing-component-basket", subBasketId: null, inclusions: [], exclusions: [], labor: settings, material: settings }
    ] } });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "lineItems.0.classification": "special", "lineItems.0.pricingMode": "in_house",
      "lineItems.0.selectedInHouseComponentIds": ["retained-component"], "lineItems.0.dimensions": { length: "2", width: "1", height: "9" } } });
    const result = await service.save(client, "tier-project", await removeGroup({ subBasketId: "tier-sub", roomId: "Room1" }));
    expect(result.excludedLines[0]).toMatchObject({ id: "line-one", quantity: 2, included: false,
      selectedInHouseComponentIds: ["retained-component"], dimensions: { length: "2", width: "1", height: "9" } });
    expect(result.totalPaise).toBe(8300);
    expect(result.lines.map(line => line.id)).toEqual(["line-two"]);
  });

  it.each([100, 101])("atomically removes a Main Basket with %i visible members without splitting the request", async count => {
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    const original = before.lineItems[0];
    const hidden = before.lineItems[2];
    const members = Array.from({ length: count }, (_, index) => ({ ...original, id: `bulk-line-${index}`, roomId: `bulk-room-${index}`, roomName: `Bulk room ${index}` }));
    const subtotalPaise = count * 4000 + 1000;
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { lineItems: [...members, hidden],
      rooms: [...members.map(line => ({ id: line.roomId, label: line.roomName })), { id: "Room1", label: "Room1" }],
      subtotalPaise, gstPaise: Math.round(subtotalPaise * .18), totalPaise: Math.round(subtotalPaise * 1.18),
      subtotal: subtotalPaise / 100, gst: Math.round(subtotalPaise * .18) / 100, total: Math.round(subtotalPaise * 1.18) / 100 } });
    const command = await removeGroup({ subBasketId: null, roomId: null });
    expect(command.operations).toHaveLength(1);
    const result = await service.save(client, "tier-project", command);
    expect(result).toMatchObject({ estimateVersion: 2, pricedRevision: 2, totalPaise: 1200, roundOffPaise: 20, lines: [], groups: [] });
    expect(result.excludedLines).toHaveLength(count);
    expect((await EstimateModel.findById("tier-estimate").lean())!.lineItems.at(-1)).toEqual(hidden);
    expect(await AuditEventModel.countDocuments({ action: "quotation_saved" })).toBe(1);
  });

  it.each(["hide", "malformed", "missing", "revision", "parent"] as const)("rejects the entire group after a %s Configuration change", async change => {
    const command = await removeGroup({ subBasketId: null, roomId: null });
    if (change === "hide" || change === "malformed") await Section.collection.updateOne({ _id: "overview-visible" as never }, { $set: { "payload.clientVisible": change === "hide" ? false : "yes" } });
    if (change === "missing") await Revision.deleteOne({ _id: "revision-visible" });
    if (change === "revision") await MainLine.updateOne({ _id: "visible" }, { $inc: { version: 1 } });
    if (change === "parent") {
      await SubBasket.collection.insertOne({ _id: "moved-sub" as never, basketId: "tier-basket", name: "Moved", status: "active", displayOrder: 2, version: 1 });
      await MainLine.updateOne({ _id: "visible" }, { $set: { subBasketId: "moved-sub" }, $inc: { version: 1 } });
    }
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("rejects a group token when a previously hidden current line becomes visible", async () => {
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "lineItems.2.clientVisible": true } });
    const command = await removeGroup({ subBasketId: null, roomId: null });
    await Section.collection.updateOne({ _id: "overview-hidden" as never }, { $set: { "payload.clientVisible": true } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
  });

  it("keeps visible saved rows readable when the configured unit needs reconciliation, without granting group removal", async () => {
    const command = await removeGroup({ subBasketId: null, roomId: null });
    await Uom.collection.insertOne({ _id: "new-uom" as never, name: "square metre", code: "SQM", decimalScale: 2, status: "active", version: 1 });
    await Section.collection.updateOne({ _id: "overview-visible" as never }, { $set: { "payload.uomId": "new-uom" } });
    const detail = await service.detail(client, "tier-project");
    expect(detail.lines).toHaveLength(2);
    expect(detail.lines[0]).toMatchObject({ id: "line-one", quantity: 2, source: null });
    expect(detail.lines[0].choices.every(choice => !choice.available)).toBe(true);
    expect(detail.groups).toEqual([]);
    await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
  });

  it("rejects overlapping group/line operations and forged scopes without writes", async () => {
    const command = await removeGroup({ subBasketId: null, roomId: null });
    const sub = await removeGroup({ subBasketId: "tier-sub", roomId: "Room1" });
    const before = await EstimateModel.findById("tier-estimate").lean();
    for (const operations of [
      [...command.operations, ...quantityChange().operations],
      [...command.operations, ...sub.operations],
      [{ ...command.operations[0], roomId: "foreign-room" }],
      [{ ...command.operations[0], sourceToken: "a".repeat(64) }],
      [{ ...command.operations[0], mainBasketId: "foreign-basket" }],
      [{ ...command.operations[0], ratePaise: 1 }]
    ]) {
      await expect(service.save(client, "tier-project", { expectedVersion: 1, operations } as any)).rejects.toBeDefined();
      expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    }
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("rolls back group exclusions, dependency fences and review changes when audit persistence fails", async () => {
    const command = await removeGroup({ subBasketId: null, roomId: null });
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: "group-review" as never, estimateId: "tier-estimate", projectId: "tier-project", estimateVersion: 1, version: 1, status: "pending", estimateSnapshot: { unchanged: true } });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.status": "sent_to_client", "estimation.pendingReviewRoundId": "group-review" } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    const sourceBefore = await MainLine.find().lean();
    const failing = createQuotationService({ audit: { appendInMongoTransaction: async () => { throw new Error("Synthetic audit failure"); } } as any });
    await expect(failing.save(client, "tier-project", command)).rejects.toThrow("Synthetic audit failure");
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await MainLine.find().lean()).toEqual(sourceBefore);
    expect(await EstimateClientReviewRoundModel.findById("group-review").lean()).toMatchObject({ status: "pending", version: 1, estimateSnapshot: { unchanged: true } });
  });

  it("keeps group tokens and writes scoped to the correct project and current assignment", async () => {
    const command = await removeGroup({ subBasketId: null, roomId: null });
    const original = (await EstimateModel.findById("tier-estimate").lean())!;
    await ProjectModel.collection.insertOne({ _id: "other-project" as never, clientId: client.id, assignedEstimatorId: sales.id,
      estimationWorkflowVersion: 3, estimateRequirementsVersion: 0, estimationFenceEpoch: 0, status: "planning" });
    await LeadModel.collection.insertOne({ _id: "other-lead" as never, projectId: "other-project", ownerId: sales.id });
    await EstimateModel.collection.insertOne({ ...original, _id: "other-estimate" as never, projectId: "other-project", leadId: "other-lead",
      lineItems: original.lineItems.map(line => ({ ...line, quantity: line.quantity * 2, amountPaise: line.amountPaise! * 2, amount: line.amount! * 2 })),
      subtotalPaise: 22000, gstPaise: 3960, totalPaise: 25960, subtotal: 220, gst: 39.6, total: 259.6 });
    await expect(service.save(client, "other-project", command)).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    await expect(service.save(other, "tier-project", command)).rejects.toMatchObject({ status: 404 });
    await ProjectModel.updateOne({ _id: "tier-project" }, { $set: { clientId: other.id } });
    await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ status: 404 });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(original);
    expect((await EstimateModel.findById("other-estimate").lean())!.totalPaise).toBe(25960);
  });

  it("serializes group removal with another actor's save", async () => {
    const command = await removeGroup({ subBasketId: null, roomId: null });
    const outcomes = await Promise.allSettled([service.save(client, "tier-project", command), service.save(sales, "tier-project", quantityChange(1, 5))]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === "rejected")).toMatchObject({ reason: { code: "ESTIMATE_VERSION_CONFLICT" } });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(2);
  });

  it("adds a visible configured item only into an owned room and selected basket", async () => {
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $push: { rooms: { id: "Room3", label: "Study" } } });
    const candidates = await service.items(client, "tier-project");
    expect(candidates.items.map(item => item.mainLineId)).toEqual(["visible"]);
    const result = await service.save(client, "tier-project", { expectedVersion: 1, operations: [{ kind: "add", mainLineId: "visible", roomId: "Room3", source, quantity: 2 }] });
    expect(result.lines.find(line => line.roomId === "Room3")).toMatchObject({ roomName: "Study", amountPaise: 4000 });
  });

  it("allows removing a visible item whose configured price is incomplete", async () => {
    await Section.collection.updateOne({ _id: "advanced-visible" as never }, { $set: { "payload.modeCalculations.sub_vendor.baseRatePaise": null } });
    const result = await service.save(client, "tier-project", { expectedVersion: 1, operations: [{ kind: "update", lineItemId: "line-one", source, included: false }] });
    expect(result.lines.map(line => line.id)).toEqual(["line-two"]);
    expect(result.totalPaise).toBe(8300);
  });

  it.each([
    { kind: "update", lineItemId: "line-hidden", source: { ...source, revisionId: "revision-hidden" }, quantity: 5 },
    { kind: "add", mainLineId: "visible", roomId: "foreign-room", source, quantity: 1 },
    { kind: "update", lineItemId: "line-one", source, quantity: 3, ratePaise: 1 },
    { kind: "update", lineItemId: "line-one", source, quantity: 0 }
  ])("rejects forged or unsafe patch without writes: %j", async operation => {
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [operation] } as any)).rejects.toBeDefined();
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("denies unrelated identities and malformed current visibility", async () => {
    await expect(service.detail(other, "tier-project")).rejects.toMatchObject({ status: 404 });
    await Section.collection.updateOne({ _id: "overview-visible" as never }, { $set: { "payload.clientVisible": "yes" } });
    expect((await service.detail(client, "tier-project")).lines).toEqual([]);
    expect((await service.items(client, "tier-project")).items).toEqual([]);
    await expect(service.save(client, "tier-project", quantityChange())).rejects.toMatchObject({ code: "QUOTATION_NOT_FOUND" });
  });

  it("allows only one concurrent save and rejects stale Configuration", async () => {
    const outcomes = await Promise.allSettled([service.save(client, "tier-project", quantityChange(1, 4)), service.save(sales, "tier-project", quantityChange(1, 5))]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(2);
    await expect(service.save(client, "tier-project", { expectedVersion: 2, operations: [{ kind: "update", lineItemId: "line-one", source: { ...source, itemVersion: 99 }, quantity: 3 }] })).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
  });

  it("keeps approved quotation locked for the Client", async () => {
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.editClosedAt": new Date().toISOString() } });
    expect((await service.detail(client, "tier-project")).editingAllowed).toBe(false);
    await expect(service.save(client, "tier-project", quantityChange())).rejects.toMatchObject({ code: "ESTIMATE_LOCKED" });
  });

  it("serializes Client Save against approval so the losing command cannot change the winning revision", async () => {
    await LeadModel.updateOne({ _id: "tier-lead" }, { $set: { clientEmail: client.email, clientName: "Synthetic Client",
      clientMobile: "0000000000", projectName: "Synthetic quotation", location: "Test", propertyType: "2BHK" } });
    const estimate = await EstimateModel.findById("tier-estimate").lean();
    const lead = await LeadModel.findById("tier-lead").lean();
    const snapshot = toEstimateSnapshot({ ...estimate!, lineItems: estimate!.lineItems.map((line: any) => ({ ...line, specification: null })) } as any, lead as any);
    const digest = quotationSnapshotDigest(snapshot);
    const salesApproval = { actorId: sales.id, estimateVersion: 1, pricedRevision: 1, sourceDigest: digest, approvedAt: new Date().toISOString() };
    await EstimateClientReviewRoundModel.create({ _id: "race-review", estimateId: "tier-estimate", leadId: "tier-lead", projectId: "tier-project",
      workflowVersion: 3, phase: "pre", requirementsVersion: 0, designScopeRevision: 1, pricedRevision: 1, sourceDigest: digest, submittedById: sales.id,
      salesApproval, estimateVersion: 1, sendGeneration: 1, dedupeKey: "a".repeat(64), recipientEmail: client.email, recipientEmailNormalized: client.email,
      estimateSnapshot: snapshot, pdfFilename: "synthetic.pdf", pdfMimeType: "application/pdf", pdfByteSize: 1, pdfSha256: "b".repeat(64),
      pdfStorageReference: "synthetic-only", deliveryStatus: "disabled", deliveryAttemptGeneration: 1, deliveryAttemptCount: 0,
      assignedAdminId: "synthetic-admin", status: "pending", version: 1 });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.status": "sent_to_client", "estimation.pendingReviewRoundId": "race-review", "estimation.salesApproval": salesApproval } });
    const decisions = createEstimateDecisionService({ audit: createAuditService(createMongoRepository()), reviews: {} as any, estimateDesigns: {} as any });
    const results = await Promise.allSettled([
      service.save(client, "tier-project", quantityChange()),
      decisions.decide({ estimateId: "tier-estimate", round: { id: "race-review", expectedVersion: 1 }, decision: "approve", note: "",
        context: { source: "client_portal", actor: client, proof: null } })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const round = await EstimateClientReviewRoundModel.findById("race-review").lean();
    const saved = await EstimateModel.findById("tier-estimate").lean();
    expect(saved!.version).toBe(2);
    if (round!.status === "approved") {
      expect(saved!.lineItems[0].quantity).toBe(2);
      expect(saved!.estimation.preApproval.reviewRoundId).toBe("race-review");
    } else {
      expect(round!.status).toBe("superseded");
      expect(saved!.lineItems[0].quantity).toBe(4);
      expect(saved!.estimation.preApproval).toBeNull();
    }
    expect(quotationSnapshotDigest(round!.estimateSnapshot)).toBe(digest);
  });
});

const setupCommand = async (projectId = "tier-project") => {
  const response = await service.setup(client, projectId);
  const { canConfigure: _allowed, ...setup } = response.setup;
  return { expectedVersion: response.estimateVersion, operations: [{ kind: "configure" as const, ...setup,
    rooms: setup.rooms.map(({ canRemove: _remove, removalBlockedReason: _reason, sqft: _sqft, ...room }: any) => room) }] };
};
const newRoom = { id: "kitchen-stable-new", typeId: "kitchen", label: "Kitchen", length: 10, width: 12 };
async function extraBasket(id = "floor-basket", visible = true) {
  await Basket.collection.insertOne({ _id: id as never, name: `${id} name`, status: "active", displayOrder: 2, version: 1 });
  await MainLine.collection.insertOne({ _id: `${id}-line` as never, name: `${id} line`, basketId: id, subBasketId: null,
    itemType: "temporary", status: "active", version: 1, activeRevisionId: `${id}-revision`, displayOrder: 1 });
  await Revision.collection.insertOne({ _id: `${id}-revision` as never, mainLineId: `${id}-line`, status: "active", revisionNumber: 1, version: 1 });
  await Section.collection.insertMany([
    { _id: `${id}-overview` as never, mainLineId: `${id}-line`, revisionId: `${id}-revision`, sectionKey: "overview", applicability: "configured", version: 1,
      payload: { uomId: "tier-uom", clientVisible: visible, applicableTiers: ["signature"] } },
    { _id: `${id}-advanced` as never, mainLineId: `${id}-line`, revisionId: `${id}-revision`, sectionKey: "advanced", applicability: "configured", version: 1,
      payload: { pmcMarginBps: 0, subVendorMarginBps: 0, modeCalculations: { sub_vendor: { baseRatePaise: 3210 } } } }
  ]);
}

const addBasketItem = (basketId = "floor-basket", roomId = "Room1") => ({ kind: "add" as const,
  mainLineId: `${basketId}-line`, roomId, source: { revisionId: `${basketId}-revision`, itemVersion: 1, revisionVersion: 1, uomId: "tier-uom" },
  quantity: 2, modeTier: "signature" as const });

describe("Client additions across all eligible baskets", () => {
  it("browses unselected basket hierarchies and filters before pagination without revealing hidden items", async () => {
    await extraBasket();
    await extraBasket("private-basket", false);
    await SubBasket.collection.insertOne({ _id: "floor-sub" as never, basketId: "floor-basket", name: "Floor finishes", status: "active", displayOrder: 1, version: 1 });
    for (const name of ["floor-main", "floor-sibling"]) await recommendationLine(name, { basketId: "floor-basket", subBasketId: "floor-sub" });
    await recommendationLine("floor-unpriced", { basketId: "floor-basket", subBasketId: "floor-sub", priced: false });
    await recommendationLine("floor-secret", { basketId: "floor-basket", subBasketId: "floor-sub", visible: false });
    const before = await EstimateModel.findById("tier-estimate").lean();
    const all = await service.items(client, "tier-project");
    expect(all.items.map(item => item.mainLineId)).toEqual(["floor-basket-line", "floor-main", "floor-sibling", "visible"]);
    expect(all.total).toBe(4);
    const page = await service.items(client, "tier-project", { mainBasketId: "floor-basket", subBasketId: "floor-sub", search: "Floor finishes", offset: 1, limit: 1 });
    expect(page).toMatchObject({ total: 2, offset: 1, limit: 1, items: [{ mainLineId: "floor-sibling", mainBasketId: "floor-basket", subBasketId: "floor-sub" }] });
    expect((await service.items(client, "tier-project", { mainBasketId: "tier-basket", subBasketId: "floor-sub" })).total).toBe(0);
    expect(JSON.stringify(all)).not.toMatch(/private-basket|floor-secret|floor-unpriced|hidden painting|never-expose-this/);
    expect((await service.setup(client, "tier-project")).baskets.find(basket => basket.id === "floor-basket"))
      .toMatchObject({ directTemporaryItemCount: 1, subBaskets: [{ id: "floor-sub", name: "Floor finishes" }] });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("saves only the chosen item and its parent, preserving siblings, other rooms, classifications and another project", async () => {
    await extraBasket();
    await SubBasket.collection.insertOne({ _id: "floor-sub" as never, basketId: "floor-basket", name: "Floor finishes", status: "active", displayOrder: 1, version: 1 });
    await recommendationLine("unselected-sibling", { basketId: "floor-basket", subBasketId: "floor-sub" });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { selectedMainBasketClassifications: [{ mainBasketId: "tier-basket", classification: "special" }] } });
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    await ProjectModel.collection.insertOne({ _id: "other-project" as never, clientId: other.id, assignedEstimatorId: sales.id,
      estimationWorkflowVersion: 3, estimateRequirementsVersion: 0, estimationFenceEpoch: 0, status: "planning" });
    await LeadModel.collection.insertOne({ _id: "other-lead" as never, projectId: "other-project", ownerId: sales.id });
    await EstimateModel.collection.insertOne({ ...before, _id: "other-estimate" as never, projectId: "other-project", leadId: "other-lead", version: 7,
      subtotalPaise: 22000, gstPaise: 3960, totalPaise: 25960, subtotal: 220, gst: 39.6, total: 259.6,
      lineItems: before.lineItems.map(line => ({ ...line, quantity: line.quantity * 2, amountPaise: line.amountPaise! * 2, amount: line.amount! * 2 })) });
    const otherBefore = await EstimateModel.findById("other-estimate").lean();
    await expect(service.items(other, "tier-project")).rejects.toMatchObject({ status: 404 });
    await expect(service.save(client, "other-project", { expectedVersion: 7, operations: [addBasketItem()] })).rejects.toMatchObject({ status: 404 });
    const result = await service.save(client, "tier-project", { expectedVersion: 1, operations: [addBasketItem()] });
    expect(result).toMatchObject({ estimateVersion: 2, pricedRevision: 2, totalPaise: 20600, roundOffPaise: 44, reviewState: "awaiting_staff_review" });
    const saved = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(saved.selectedMainBasketIds).toEqual(["tier-basket", "floor-basket"]);
    expect(saved.selectedMainBasketClassifications).toEqual([
      { mainBasketId: "tier-basket", classification: "special" }, { mainBasketId: "floor-basket", classification: "standard" }
    ]);
    expect(saved.lineItems.slice(0, 3)).toEqual(before.lineItems);
    expect(saved.lineItems).toHaveLength(4);
    expect(saved.lineItems[3]).toMatchObject({ mainLineId: "floor-basket-line", roomId: "Room1", mainBasketId: "floor-basket",
      subBasketId: null, included: true, classification: "standard", quantity: 2, amountPaise: 6420 });
    expect((await service.detail(client, "tier-project")).lines.filter(line => line.mainBasketId === "floor-basket"))
      .toEqual([expect.objectContaining({ mainLineId: "floor-basket-line", roomId: "Room1" })]);
    expect(await EstimateModel.findById("other-estimate").lean()).toEqual(otherBefore);
    await expect(service.save(client, "tier-project", { expectedVersion: 2, operations: [addBasketItem()] })).rejects.toMatchObject({ code: "QUOTATION_ITEM_EXISTS" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(saved);
  });

  it("deduplicates parent scope for two chosen items and rolls back a later invalid add", async () => {
    await extraBasket();
    const before = await EstimateModel.findById("tier-estimate").lean();
    const sourceBefore = await MainLine.find().sort({ _id: 1 }).lean();
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [addBasketItem(), addBasketItem("floor-basket", "not-owned")] }))
      .rejects.toMatchObject({ status: 404 });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await MainLine.find().sort({ _id: 1 }).lean()).toEqual(sourceBefore);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    await service.save(client, "tier-project", { expectedVersion: 1, operations: [addBasketItem(), addBasketItem("floor-basket", "Room2")] });
    const saved = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(saved.selectedMainBasketIds).toEqual(["tier-basket", "floor-basket"]);
    expect(saved.selectedMainBasketClassifications).toEqual([{ mainBasketId: "floor-basket", classification: "standard" }]);
    expect(saved.lineItems.filter(line => line.mainBasketId === "floor-basket").map(line => line.roomId)).toEqual(["Room1", "Room2"]);
  });

  it("rejects overlapping group removal and item addition while allowing a separate new-basket addition", async () => {
    await extraBasket();
    await recommendationLine("target");
    const removal = await removeGroup({ subBasketId: null, roomId: "Room1" });
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [
      ...removal.operations, addRecommendation([], "target")
    ] })).rejects.toMatchObject({ code: "QUOTATION_DUPLICATE_OPERATION" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    await service.save(client, "tier-project", { expectedVersion: 1, operations: [...removal.operations, addBasketItem()] });
    const saved = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(saved.selectedMainBasketIds).toEqual(["tier-basket", "floor-basket"]);
    expect(saved.lineItems.find(line => line.id === "line-one")).toMatchObject({ included: false, amountPaise: 0 });
    expect(saved.lineItems.find(line => line.id === "line-two")).toEqual(before.lineItems[1]);
    expect(saved.lineItems.find(line => line.id === "line-hidden")).toEqual(before.lineItems[2]);
    expect(saved.lineItems.filter(line => line.mainBasketId === "floor-basket")).toEqual([
      expect.objectContaining({ mainLineId: "floor-basket-line", roomId: "Room1", included: true })
    ]);
  });

  it("rolls back the new parent, item, source fences and pending review when audit persistence fails", async () => {
    await extraBasket();
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: "add-review" as never, estimateId: "tier-estimate", projectId: "tier-project",
      estimateVersion: 1, version: 1, status: "pending", estimateSnapshot: { unchanged: true } });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.status": "sent_to_client", "estimation.pendingReviewRoundId": "add-review" } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    const sourceBefore = await MainLine.find().sort({ _id: 1 }).lean();
    const failing = createQuotationService({ audit: { appendInMongoTransaction: async () => { throw new Error("Synthetic add audit failure"); } } as any });
    await expect(failing.save(client, "tier-project", { expectedVersion: 1, operations: [addBasketItem()] })).rejects.toThrow("Synthetic add audit failure");
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await MainLine.find().sort({ _id: 1 }).lean()).toEqual(sourceBefore);
    expect(await EstimateClientReviewRoundModel.findById("add-review").lean()).toMatchObject({ version: 1, status: "pending", estimateSnapshot: { unchanged: true } });
  });

  it("rejects stale or closed additions without selecting their basket", async () => {
    await extraBasket();
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", { expectedVersion: 99, operations: [addBasketItem()] })).rejects.toMatchObject({ code: "ESTIMATE_VERSION_CONFLICT" });
    const addition = addBasketItem();
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [{ ...addition, source: { ...addition.source, itemVersion: 99 } }] }))
      .rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.editClosedAt": new Date().toISOString() } });
    const closed = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [addition] })).rejects.toMatchObject({ code: "ESTIMATE_LOCKED" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(closed);
  });

  it("keeps a saved hidden identity unavailable across rooms even when its current Configuration is visible", async () => {
    await extraBasket();
    const original = (await EstimateModel.findById("tier-estimate").lean())!;
    const hidden = { ...original.lineItems[0], id: "hidden-floor", mainLineId: "floor-basket-line", catalogueId: "floor-basket-line",
      mainBasketId: "floor-basket", subBasketId: null, revisionId: "floor-basket-revision", roomId: "Room2", clientVisible: false };
    await EstimateModel.collection.updateOne({ _id: "tier-estimate" as never }, { $push: { lineItems: hidden } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    expect((await service.items(client, "tier-project", { mainBasketId: "floor-basket" })).total).toBe(0);
    expect((await service.setup(client, "tier-project")).baskets.some(basket => basket.id === "floor-basket")).toBe(false);
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [addBasketItem()] })).rejects.toMatchObject({ status: 404 });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
  });

  it("lets only one concurrent addition commit its parent scope", async () => {
    await extraBasket(); await extraBasket("lighting-basket");
    const results = await Promise.allSettled(["floor-basket", "lighting-basket"].map(basketId =>
      service.save(client, "tier-project", { expectedVersion: 1, operations: [addBasketItem(basketId)] })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "ESTIMATE_VERSION_CONFLICT" } });
    const saved = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(saved.version).toBe(2);
    expect(saved.selectedMainBasketIds).toHaveLength(2);
    expect(saved.lineItems).toHaveLength(4);
    expect(saved.selectedMainBasketIds).toContain(saved.lineItems[3].mainBasketId);
    expect(await AuditEventModel.countDocuments({ action: "quotation_saved" })).toBe(1);
  });
});

describe("Client quotation setup parity", () => {
  it("returns saved legacy-safe metadata and eligible unselected baskets without protected hierarchy or counts", async () => {
    await extraBasket();
    await extraBasket("private-basket", false);
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $push: { selectedMainBasketIds: "private-basket" } });
    const result = await service.setup(client, "tier-project");
    expect(result.setup).toMatchObject({ propertyType: "2BHK", bedroomCount: null, canConfigure: true, selectedMainBasketIds: ["tier-basket"],
      sourceToken: expect.stringMatching(/^[a-f0-9]{64}$/u), rooms: [
        { id: "Room1", typeId: null, label: "Room1", length: null, width: null, sqft: 0, canRemove: false },
        { id: "Room2", typeId: null, label: "Room2", canRemove: true }
      ] });
    expect(result.baskets).toEqual([
      { id: "floor-basket", name: "floor-basket name", directTemporaryItemCount: 1, subBaskets: [], canSelect: true, canRemove: true, removalBlockedReason: null },
      { id: "tier-basket", name: "Painting", directTemporaryItemCount: 0,
        subBaskets: [{ id: "tier-sub", name: "Walls", mainLineCount: 1, temporaryItemCount: 0 }], canSelect: true, canRemove: false, removalBlockedReason: expect.any(String) }
    ]);
    expect(JSON.stringify(result)).not.toMatch(/private-basket|hidden painting|never-expose-this|ratePaise|classification/);
    expect((await service.items(client, "tier-project")).items.map(item => item.mainLineId)).toEqual(["floor-basket-line", "visible"]);
    expect((await service.detail(client, "tier-project")).setup).toEqual(result.setup);
    expect((await service.setup(sales, "tier-project")).setup.canConfigure).toBe(false);
  });

  it("saves property, room dimensions and new basket into the same estimate and preserves hidden membership and amounts", async () => {
    await extraBasket(); await extraBasket("private-basket", false);
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $push: { selectedMainBasketIds: "private-basket" } });
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    const command = await setupCommand();
    command.operations[0].propertyType = "1BHK";
    command.operations[0].rooms.push(newRoom);
    command.operations[0].selectedMainBasketIds.push("floor-basket");
    const saved = await service.save(client, "tier-project", command);
    expect(saved).toMatchObject({ estimateId: "tier-estimate", estimateVersion: 2, pricedRevision: 2, totalPaise: 13000, roundOffPaise: 20, reviewState: "awaiting_staff_review",
      setup: { propertyType: "1BHK", rooms: [expect.objectContaining({ id: "Room1" }), expect.objectContaining({ id: "Room2" }), expect.objectContaining({ ...newRoom, sqft: 120 })] } });
    const after = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(after.lineItems).toEqual(before.lineItems);
    expect(after.rooms.slice(0, 2)).toEqual(before.rooms);
    expect(after.selectedMainBasketIds).toEqual(["tier-basket", "private-basket", "floor-basket"]);
    expect(after.selectedMainBasketClassifications).toEqual([{ mainBasketId: "floor-basket", classification: "standard" }]);
    expect((await service.detail(sales, "tier-project")).setup.propertyType).toBe("1BHK");
    expect((await service.items(client, "tier-project")).items.map(item => item.mainLineId)).toContain("floor-basket-line");
    expect((await LeadModel.findById("tier-lead").lean())!.propertyType).toBeUndefined();
    const candidate = (await service.items(client, "tier-project")).items.find(item => item.mainLineId === "floor-basket-line")!;
    const added = await service.save(client, "tier-project", { expectedVersion: 2, operations: [
      { kind: "add", mainLineId: candidate.mainLineId, roomId: newRoom.id, source: candidate.source, quantity: 2 }
    ] });
    expect(added.lines.find(line => line.roomId === newRoom.id)).toMatchObject({ roomName: "Kitchen", quantity: 2, amountPaise: 6420 });
    expect(added.totalPaise).toBe(20600);
  });

  it("does not change estimate, review, audit or Configuration on exact no-op, including old missing metadata", async () => {
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { propertyType: "Historical home", "estimation.status": "sent_to_client", "estimation.pendingReviewRoundId": "noop-review" } });
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: "noop-review" as never, estimateId: "tier-estimate", projectId: "tier-project", estimateVersion: 1, version: 1, status: "pending", estimateSnapshot: { untouched: true } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    const sources = await MainLine.find().lean();
    const saved = await service.save(client, "tier-project", await setupCommand());
    expect(saved).toMatchObject({ estimateVersion: 1, pricedRevision: 1, reviewState: "ready_for_approval" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await MainLine.find().lean()).toEqual(sources);
    expect(await EstimateClientReviewRoundModel.findById("noop-review").lean()).toMatchObject({ status: "pending", version: 1 });
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it.each(["pre", "post"])("invalidates staff confirmation after a meaningful %s setup-only change without changing immutable snapshots", async phase => {
    const snapshot = { immutable: true, totalPaise: 12980 };
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: "setup-review" as never, estimateId: "tier-estimate", projectId: "tier-project", estimateVersion: 1, version: 1, status: "pending", estimateSnapshot: snapshot });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.phase": phase, "estimation.status": "sent_to_client",
      "estimation.pendingReviewRoundId": "setup-review", "estimation.salesApproval": { actorId: sales.id, estimateVersion: 1, pricedRevision: 1, sourceDigest: "a".repeat(64), approvedAt: new Date().toISOString() } } });
    const command = await setupCommand(); command.operations[0].propertyType = "Studio";
    const result = await service.save(client, "tier-project", command);
    expect(result).toMatchObject({ estimateVersion: 2, pricedRevision: 2, reviewState: "awaiting_staff_review", totalPaise: 13000, roundOffPaise: 20 });
    expect((await EstimateModel.findById("tier-estimate").lean())!.estimation).toMatchObject({ phase, status: "draft", pendingReviewRoundId: null, salesApproval: null, designScopeRevision: 2 });
    expect(await EstimateClientReviewRoundModel.findById("setup-review").lean()).toMatchObject({ status: "superseded", version: 2, estimateSnapshot: snapshot });
    expect(await AuditEventModel.findOne().lean()).toMatchObject({ actorId: client.id, action: "quotation_saved", newValues: { setupChanged: true, physicalChange: true } });
  });

  it("removes a permitted room and its mutable included/excluded rows without orphans, preserving other rooms", async () => {
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    const command = await setupCommand(); command.operations[0].rooms = command.operations[0].rooms.filter((room: any) => room.id !== "Room2");
    const result = await service.save(client, "tier-project", command);
    expect(result.totalPaise).toBe(5900);
    const after = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(after.rooms).toEqual([before.rooms[0]]);
    expect(after.lineItems).toEqual([before.lineItems[0], before.lineItems[2]]);
    const restore = await setupCommand(); restore.operations[0].rooms.push(newRoom);
    const restored = await service.save(client, "tier-project", restore);
    expect(restored.lines.some(line => line.roomId === newRoom.id)).toBe(false);
  });

  it("excludes all safe basket rows once and retains IDs and choices without restoring siblings on re-selection", async () => {
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $pull: { lineItems: { id: "line-hidden" } } });
    const command = await setupCommand(); command.operations[0].selectedMainBasketIds = [];
    const result = await service.save(client, "tier-project", command);
    expect(result).toMatchObject({ totalPaise: 0, lines: [] });
    expect((await EstimateModel.findById("tier-estimate").lean())!.lineItems.map((line: any) => ({ id: line.id, included: line.included, quantity: line.quantity })))
      .toEqual([{ id: "line-one", included: false, quantity: 2 }, { id: "line-two", included: false, quantity: 3 }]);
    const restore = await setupCommand(); restore.operations[0].selectedMainBasketIds = ["tier-basket"];
    const restored = await service.save(client, "tier-project", restore);
    expect(restored.lines).toEqual([]); expect(restored.excludedLines).toHaveLength(2);
  });

  it.each(["room", "basket"])("blocks protected %s removal without revealing protected details", async kind => {
    const before = await EstimateModel.findById("tier-estimate").lean();
    const command = await setupCommand();
    if (kind === "room") command.operations[0].rooms = command.operations[0].rooms.filter((room: any) => room.id !== "Room1");
    else command.operations[0].selectedMainBasketIds = [];
    await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ code: "QUOTATION_SETUP_REMOVAL_BLOCKED", message: "Ask your team to review this selection before removing it." });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
  });

  it.each(["requirement", "project_requirement", "design_obligation", "drawing", "latest_revision", "pinned_revision", "queued_upload", "retry_mapping"])("blocks removal of a room with an active %s dependency", async kind => {
    if (kind === "requirement" || kind === "project_requirement") await EstimateRequirementModel.collection.insertOne({ _id: "setup-requirement" as never,
      estimateId: kind === "requirement" ? "tier-estimate" : null, projectId: "tier-project", status: "open", roomId: "Room2", mainBasketId: "tier-basket", lineItemIds: ["line-two"], version: 1 });
    if (kind === "design_obligation") await DesignRequirementsStateModel.collection.insertOne({ _id: "tier-project" as never, projectId: "tier-project", version: 1, history: [{ id: "recorded-obligation", lineItemId: "line-two" }] });
    if (["drawing", "latest_revision", "pinned_revision"].includes(kind)) {
      await EstimateDesignDrawingModel.collection.insertOne({ _id: "setup-drawing" as never, estimateId: "tier-estimate", active: true, deletedAt: null,
        roomId: kind === "drawing" ? "Room2" : null, scopeSectionId: null, catalogueId: null });
      if (kind !== "drawing") await EstimateDesignRevisionModel.collection.insertOne({ _id: "setup-revision" as never, drawingId: "setup-drawing", revisionNumber: 1, roomId: "Room2", scopeSectionId: null, catalogueId: null });
      if (kind === "pinned_revision") {
        await EstimateDesignRevisionModel.collection.insertOne({ _id: "newer-revision" as never, drawingId: "setup-drawing", revisionNumber: 2, roomId: null, scopeSectionId: null, catalogueId: null });
        await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { designPlanVersion: 3, status: "client_approved" } });
        await DesignPlanReviewRoundModel.collection.insertOne({ _id: "pinned-round" as never, estimateId: "tier-estimate", projectId: "tier-project", designPlanVersion: 3, status: "pending", submittedRevisionIds: ["setup-revision"] });
      }
    }
    if (kind === "queued_upload" || kind === "retry_mapping") await EstimateDesignUploadModel.collection.insertOne({ _id: "setup-upload" as never, estimateId: "tier-estimate", deletedAt: null,
      extractionStatus: kind === "queued_upload" ? "queued" : "processing_failed", planRequestReplacement: { targets: [{ mapping: { roomId: "Room2" } }] } });
    const command = await setupCommand();
    expect(command.operations[0].rooms).toHaveLength(2);
    expect((await service.setup(client, "tier-project")).setup.rooms.find((room: any) => room.id === "Room2")!.canRemove).toBe(false);
    command.operations[0].rooms = command.operations[0].rooms.filter((room: any) => room.id !== "Room2");
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ code: "QUOTATION_SETUP_REMOVAL_BLOCKED" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
  });

  it("ignores old unpinned revision and retired requirement mappings while retaining their immutable history", async () => {
    await EstimateRequirementModel.collection.insertOne({ _id: "retired-requirement" as never, projectId: "tier-project", status: "withdrawn", roomId: "Room2", mainBasketId: "tier-basket", version: 2 });
    await EstimateDesignDrawingModel.collection.insertOne({ _id: "history-drawing" as never, estimateId: "tier-estimate", active: true, deletedAt: null, roomId: null });
    await EstimateDesignRevisionModel.collection.insertMany([
      { _id: "historic-revision" as never, drawingId: "history-drawing", revisionNumber: 1, roomId: "Room2" },
      { _id: "current-revision" as never, drawingId: "history-drawing", revisionNumber: 2, roomId: null }
    ]);
    const command = await setupCommand(); command.operations[0].rooms = command.operations[0].rooms.filter((room: any) => room.id !== "Room2");
    await service.save(client, "tier-project", command);
    expect(await EstimateDesignRevisionModel.findById("historic-revision").lean()).toMatchObject({ roomId: "Room2" });
    expect(await EstimateRequirementModel.findById("retired-requirement").lean()).toMatchObject({ status: "withdrawn", roomId: "Room2" });
  });

  it.each(["visibility", "source", "parent", "new_dependency"])("rejects a stale setup token after %s changes without partial writes", async change => {
    const command = await setupCommand(); command.operations[0].rooms = command.operations[0].rooms.filter((room: any) => room.id !== "Room2");
    if (change === "visibility") await Section.collection.updateOne({ _id: "overview-visible" as never }, { $set: { "payload.clientVisible": false } });
    if (change === "source") await MainLine.updateOne({ _id: "visible" }, { $inc: { version: 1 } });
    if (change === "parent") await MainLine.collection.updateOne({ _id: "visible" as never }, { $set: { subBasketId: null } });
    if (change === "new_dependency") await EstimateRequirementModel.collection.insertOne({ _id: "new-dependency" as never, projectId: "tier-project", status: "included", roomId: "Room2", mainBasketId: "tier-basket", version: 1 });
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("validates variable bedrooms and preserves out-of-type rooms without accepting forged setup fields", async () => {
    const before = await EstimateModel.findById("tier-estimate").lean();
    const base = await setupCommand();
    const variants = [
      { propertyType: "unsupported-new-home" }, { propertyType: "Villa", bedroomCount: null }, { propertyType: "Duplex", bedroomCount: 51 },
      { rooms: [...base.operations[0].rooms, { ...newRoom, typeId: "bedroom50" }] },
      { rooms: [...base.operations[0].rooms, { ...newRoom, length: -1 }] },
      { rooms: [...base.operations[0].rooms, { ...newRoom, length: 1_000_001 }] },
      { rooms: [base.operations[0].rooms[0], base.operations[0].rooms[0]] },
      { rooms: base.operations[0].rooms.map((room: any) => ({ ...room, label: "forged name" })) },
      { selectedMainBasketIds: ["hidden-or-unknown-basket"] }, { selectedMainBasketIds: ["tier-basket", "tier-basket"] },
      { ratePaise: 1 }, { selectedMainBasketClassifications: [] }
    ];
    for (const changes of variants) await expect(service.save(client, "tier-project", { ...base, operations: [{ ...base.operations[0], ...changes }] } as any)).rejects.toBeDefined();
    await expect(service.save(client, "tier-project", { ...base, operations: [...base.operations, ...quantityChange().operations] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    base.operations[0].propertyType = "Villa"; base.operations[0].bedroomCount = 3;
    base.operations[0].rooms.push({ id: "bedroom3-stable-new", typeId: "bedroom3", label: "Bedroom 3", length: null, width: null });
    const saved = await service.save(client, "tier-project", base);
    expect(saved.setup).toMatchObject({ propertyType: "Villa", bedroomCount: 3, rooms: expect.arrayContaining([expect.objectContaining({ id: "Room1" }), expect.objectContaining({ id: "bedroom3-stable-new" })]) });
  });

  it("rolls back setup, source fences and pending review if audit persistence fails", async () => {
    const command = await setupCommand(); command.operations[0].propertyType = "Studio";
    const before = await EstimateModel.findById("tier-estimate").lean(); const sources = await MainLine.find().lean();
    const failing = createQuotationService({ audit: { appendInMongoTransaction: async () => { throw new Error("Synthetic setup audit failure"); } } as any });
    await expect(failing.save(client, "tier-project", command)).rejects.toThrow("Synthetic setup audit failure");
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await MainLine.find().lean()).toEqual(sources);
  });

  it("denies staff setup commands, unrelated identities and locked Client setup", async () => {
    const command = await setupCommand(); command.operations[0].propertyType = "Studio";
    await expect(service.setup(other, "tier-project")).rejects.toMatchObject({ status: 404 });
    await expect(service.save(sales, "tier-project", command)).rejects.toMatchObject({ status: 404 });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.editClosedAt": new Date().toISOString() } });
    expect((await service.setup(client, "tier-project")).setup.canConfigure).toBe(false);
    await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ code: "ESTIMATE_LOCKED" });
  });

  it("serializes a setup save against a competing Sales item change", async () => {
    const command = await setupCommand(); command.operations[0].propertyType = "Studio";
    const results = await Promise.allSettled([service.save(client, "tier-project", command), service.save(sales, "tier-project", quantityChange())]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "ESTIMATE_VERSION_CONFLICT" } });
    expect((await EstimateModel.findById("tier-estimate").lean())!.version).toBe(2);
  });

  it("retries a source-write race and rejects the stale setup without any estimate change", async () => {
    const command = await setupCommand(); command.operations[0].propertyType = "Studio";
    const before = await EstimateModel.findById("tier-estimate").lean();
    const original = MainLine.updateOne.bind(MainLine);
    const fence = vi.spyOn(MainLine, "updateOne").mockImplementationOnce((...args: any[]) => {
      return (async () => {
        await MainLine.collection.updateOne({ _id: "visible" as never }, { $inc: { version: 1 } });
        return await (original as any)(...args);
      })() as any;
    });
    try {
      await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    } finally { fence.mockRestore(); }
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("binds setup tokens to the exact estimate and current Client assignment", async () => {
    const original = (await EstimateModel.findById("tier-estimate").lean())!;
    const command = await setupCommand(); command.operations[0].propertyType = "Studio";
    await ProjectModel.collection.insertOne({ _id: "setup-other-project" as never, clientId: client.id, assignedEstimatorId: sales.id,
      estimationWorkflowVersion: 3, estimateRequirementsVersion: 0, estimationFenceEpoch: 0, status: "planning" });
    await LeadModel.collection.insertOne({ _id: "setup-other-lead" as never, projectId: "setup-other-project", ownerId: sales.id });
    await EstimateModel.collection.insertOne({ ...original, _id: "setup-other-estimate" as never, projectId: "setup-other-project", leadId: "setup-other-lead",
      subtotalPaise: 22000, gstPaise: 3960, totalPaise: 25960, subtotal: 220, gst: 39.6, total: 259.6,
      lineItems: original.lineItems.map(line => ({ ...line, quantity: line.quantity * 2, amountPaise: line.amountPaise! * 2, amount: line.amount! * 2 })) });
    await expect(service.save(client, "setup-other-project", command)).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    await ProjectModel.updateOne({ _id: "tier-project" }, { $set: { clientId: other.id } });
    await expect(service.save(client, "tier-project", command)).rejects.toMatchObject({ status: 404 });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(original);
    expect((await EstimateModel.findById("setup-other-estimate").lean())!.totalPaise).toBe(25960);
  });
});

describe("atomic sub-basket tier choices", () => {
  async function groupTier(subBasketId: string | null = "tier-sub") {
    const view = await service.detail(client, "tier-project");
    const group = view.groups.find(group => group.mainBasketId === "tier-basket" && group.subBasketId === subBasketId && group.roomId === "Room1")!;
    return { kind: "set_group_tier" as const, mainBasketId: "tier-basket", subBasketId, roomId: "Room1", sourceToken: group.sourceToken, modeTier: "premium" as const };
  }
  it("merges staged quantity changes and switches only the room's visible group in one save", async () => {
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    const group = await groupTier();
    const result = await service.save(client, "tier-project", { expectedVersion: 1, operations: [group, ...quantityChange().operations] });
    expect(result).toMatchObject({ estimateVersion: 2, totalPaise: 31900, roundOffPaise: 40 });
    expect(result.lines[0]).toMatchObject({ quantity: 4, modeTier: "premium", ratePaise: 5000, amountPaise: 20000 });
    const saved = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(saved.lineItems[1]).toEqual(before.lineItems[1]); expect(saved.lineItems[2]).toEqual(before.lineItems[2]);
    expect(await AuditEventModel.countDocuments({ action: "quotation_saved" })).toBe(1);
  });
  it("rejects stale groups and conflicting row tiers without a partial write", async () => {
    const group = await groupTier(); const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [{ ...group, sourceToken: "0".repeat(64) }] })).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [group,
      { kind: "update", lineItemId: "line-one", source, modeTier: "signature" }] })).rejects.toMatchObject({ code: "QUOTATION_DUPLICATE_OPERATION" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
  });
  it.each(["revision", "unit"])("rejects a previously displayed group after its %s changes", async change => {
    const group = await groupTier();
    if (change === "revision") await Revision.updateOne({ _id: "revision-visible" }, { $inc: { version: 1 } });
    else await Uom.updateOne({ _id: "tier-uom" }, { $set: { decimalScale: 3 } });
    const before = await EstimateModel.findById("tier-estimate").lean();
    await expect(service.save(client, "tier-project", { expectedVersion: 1, operations: [group] })).rejects.toMatchObject({ code: "QUOTATION_CONFIGURATION_CHANGED" });
    expect(await EstimateModel.findById("tier-estimate").lean()).toEqual(before);
  });
  it("keeps excluded row edits excluded when the same group changes tier", async () => {
    const result = await service.save(client, "tier-project", { expectedVersion: 1, operations: [await groupTier(),
      { kind: "update", lineItemId: "line-one", source, included: false }] });
    expect(result.lines.map(line => line.id)).toEqual(["line-two"]);
    expect(result.excludedLines[0]).toMatchObject({ id: "line-one", included: false });
  });
  it("treats a null sub-basket as direct items, never as every sub-basket", async () => {
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    await MainLine.collection.insertOne({ _id: "direct" as never, name: "Direct fixture", basketId: "tier-basket", subBasketId: null,
      itemType: "temporary", status: "active", version: 1, activeRevisionId: "revision-direct" });
    await Revision.collection.insertOne({ _id: "revision-direct" as never, mainLineId: "direct", status: "active", version: 1 });
    await Section.collection.insertMany((await Section.find({ mainLineId: "visible" }).lean()).map(section => ({ ...section,
      _id: `${section.sectionKey}-direct` as never, mainLineId: "direct", revisionId: "revision-direct" })));
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $push: { lineItems: { ...before.lineItems[0], id: "direct-line", mainLineId: "direct", catalogueId: "direct",
      itemType: "temporary", subBasketId: null, revisionId: "revision-direct", quantity: 1, amountPaise: 2000, amount: 20 } } });
    const result = await service.save(client, "tier-project", { expectedVersion: 1, operations: [await groupTier(null)] });
    expect(result.lines.find(line => line.id === "direct-line")).toMatchObject({ modeTier: "premium", amountPaise: 5000 });
    const saved = (await EstimateModel.findById("tier-estimate").lean())!;
    expect(saved.lineItems.slice(0, 3)).toEqual(before.lineItems);
  });
  it("changes more than 100 visible lines atomically with one bounded group command", async () => {
    const before = (await EstimateModel.findById("tier-estimate").lean())!;
    const templates = await Section.find({ mainLineId: "visible" }).lean();
    const ids = Array.from({ length: 101 }, (_, i) => `group-line-${i}`);
    await MainLine.collection.insertMany(ids.map(id => ({ _id: id as never, name: id, basketId: "tier-basket", subBasketId: "tier-sub",
      itemType: "main_line", status: "active", version: 1, activeRevisionId: `revision-${id}` })));
    await Revision.collection.insertMany(ids.map(id => ({ _id: `revision-${id}` as never, mainLineId: id, status: "active", version: 1 })));
    await Section.collection.insertMany(ids.flatMap(id => templates.map(section => ({ ...section, _id: `${section.sectionKey}-${id}` as never,
      mainLineId: id, revisionId: `revision-${id}` }))));
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $push: { lineItems: { $each: ids.map(id => ({ ...before.lineItems[0], id,
      mainLineId: id, catalogueId: id, revisionId: `revision-${id}`, quantity: 1, amountPaise: 2000, amount: 20 })) } } });
    const result = await service.save(client, "tier-project", { expectedVersion: 1, operations: [await groupTier()] });
    expect(result.estimateVersion).toBe(2);
    expect(result.lines.filter(line => line.roomId === "Room1")).toHaveLength(102);
    expect(result.lines.filter(line => line.roomId === "Room1").every(line => line.modeTier === "premium")).toBe(true);
    expect((await EstimateModel.findById("tier-estimate").lean())!.lineItems[2]).toEqual(before.lineItems[2]);
  }, 30_000);
});
