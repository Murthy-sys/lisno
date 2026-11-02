import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";
import { toEstimateSnapshot } from "../src/services/estimate-publication.service.js";
import { createEstimateDecisionService } from "../src/services/estimate-decision.service.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createQuotationService } from "../src/services/quotation.service.js";
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
    estimation: newQuotationLifecycle(), selectedMainBasketIds: ["tier-basket"], propertyType: "2BHK", rooms: [{ id: "Room1", label: "Room1" }, { id: "Room2", label: "Room2" }], scopes: [],
    lineItems: [line("line-one", "visible", "Room1", 2, 2000), line("line-two", "visible", "Room2", 3, 2000), line("line-hidden", "hidden", "Room1", 1, 1000)],
    subtotal: 110, gst: 19.8, total: 129.8, subtotalPaise: 11000, gstPaise: 1980, totalPaise: 12980 });
});

const source = { revisionId: "revision-visible", itemVersion: 1, revisionVersion: 1, uomId: "tier-uom" };
const quantityChange = (expectedVersion = 1, quantity = 4) => ({ expectedVersion,
  operations: [{ kind: "update" as const, lineItemId: "line-one", source, quantity }] });

describe("version 3 Client quotation commands", () => {
  it("allows current secondary Designers a safe read but no commercial mutation", async () => {
    const secondary = { id: "secondary-quotation-designer", name: "Secondary", email: "secondary@quote.invalid", role: "designer" } as const;
    await UserModel.create({ _id: secondary.id, ...secondary, emailNormalized: secondary.email, passwordHash: "synthetic", active: true });
    await ProjectModel.updateOne({ _id: "tier-project" }, { $set: { secondaryDesignerIds: [secondary.id], assignedDesignerIds: [secondary.id] } });
    await EstimateModel.updateOne({ _id: "tier-estimate" }, { $set: { "estimation.preApproval": { reviewRoundId: "synthetic-preapproval", estimateVersion: 1, approvedAt: new Date().toISOString() }, "estimation.phase": "post" } });
    const detail = await service.detail(secondary, "tier-project");
    expect(detail.editingAllowed).toBe(false);
    expect(detail.lines.map(line => line.id)).toEqual(["line-one", "line-two"]);
    await expect(service.save(secondary, "tier-project", quantityChange())).rejects.toMatchObject({ code: "QUOTATION_NOT_FOUND" });
    await ProjectModel.updateOne({ _id: "tier-project" }, { $set: { secondaryDesignerIds: [] } });
    await expect(service.revision(secondary, "tier-project")).rejects.toMatchObject({ code: "ESTIMATE_TIERS_NOT_FOUND" });
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
    expect(removed.totalPaise).toBe(8260);
    const restored = await service.save(client, "tier-project", { expectedVersion: 2, operations: [{ kind: "add", mainLineId: "visible", roomId: "Room1", source, quantity: 1, modeTier: "premium" }] });
    expect(restored.lines.find(line => line.roomId === "Room1")).toMatchObject({ id: "line-one", quantity: 1, ratePaise: 5000 });
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
    expect(result.totalPaise).toBe(8260);
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

