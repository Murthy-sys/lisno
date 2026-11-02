import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateClientResponseProofModel } from "../src/models/EstimateClientResponseProof.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createAssistantReadSources } from "../src/services/project-assistant-sources.js";
import { CHAT_NOW, chatLead } from "./helpers/project-chat.js";
import { insertChatMongoFixture } from "./helpers/project-chat-mongo.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

// This suite requires the independent replica-set runner. It never uses a live database.
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("project-assistant-published-estimate"); }, 120_000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica?.stop(); });

type ProjectKey = "a" | "b";
// Raw collection typings default to ObjectId; Lisno deliberately persists string IDs.
const byId = (id: string) => ({ _id: id } as never);
const amounts = {
  a: { ratePaise: 1_000, quantity: 2, subtotalPaise: 2_000, gstPaise: 360, totalPaise: 2_360 },
  b: { ratePaise: 7_503, quantity: 3, subtotalPaise: 22_509, gstPaise: 4_052, totalPaise: 26_561 }
} as const;

function publicationSnapshot(key: ProjectKey, money: { ratePaise: number; quantity: number; subtotalPaise: number; gstPaise: number; totalPaise: number } = amounts[key]) {
  return {
    clientName: `Synthetic Client ${key}`, projectName: `Synthetic project ${key}`, location: "Synthetic", propertyType: "villa",
    rooms: [{ id: `room-${key}`, label: `Published room ${key}` }],
    lineItems: [{ id: `published-line-${key}`, source: "configuration", itemType: "main_line", classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration",
      catalogueId: `ceiling-${key}`, roomId: `room-${key}`, roomName: `Published room ${key}`, specification: null,
      mainBasketId: "pop", mainBasketName: "POP", subBasketId: "pop-sub", subBasketName: "Ceiling", mainLineId: `ceiling-${key}`, mainLineName: `Published ceiling ${key}`,
      revisionId: `historical-revision-${key}`, uomId: "uom", uomName: "Square feet", unit: "sqft", quantity: money.quantity,
      rate: money.ratePaise / 100, amount: money.subtotalPaise / 100, ratePaise: money.ratePaise, amountPaise: money.subtotalPaise, included: true }],
    subtotal: money.subtotalPaise / 100, gst: money.gstPaise / 100, total: money.totalPaise / 100,
    subtotalPaise: money.subtotalPaise, gstPaise: money.gstPaise, totalPaise: money.totalPaise
  };
}

function publicationRound(key: ProjectKey) {
  return { _id: `review-${key}`, estimateId: `estimate-${key}`, leadId: `lead-${key}`, projectId: key,
    estimateVersion: 3, version: 1, sendGeneration: 1, status: "approved", decision: "approve", decisionSource: "client_portal",
    decidedById: `client-${key}`, decidedAt: new Date(CHAT_NOW), createdAt: new Date(CHAT_NOW), recipientEmailNormalized: `client-${key}@chat.test`,
    estimateSnapshot: publicationSnapshot(key) };
}

async function fixture() {
  const f = await insertChatMongoFixture();
  await AiEstimatorKnowledgeBasketModel.collection.insertOne({ _id: "pop", name: "Current POP", status: "active" } as never);
  await AiEstimatorKnowledgeSubBasketModel.collection.insertOne({ _id: "pop-sub", basketId: "pop", name: "Current ceiling" } as never);
  await AiEstimatorKnowledgeUomModel.collection.insertOne({ _id: "uom", code: "sqft", name: "Square feet", decimalScale: 2, status: "active" } as never);
  const { id: leadId, ...leadB } = chatLead("lead-b", "b");
  await LeadModel.collection.insertOne({ ...leadB, _id: leadId, clientEmail: "client-b@chat.test" } as never);
  const template = (await EstimateModel.findById("estimate-a").lean().exec())!;
  await EstimateModel.collection.insertOne({ ...template, _id: "estimate-b", projectId: "b", leadId: "lead-b" } as never);
  for (const key of ["a", "b"] as const) {
    await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: `ceiling-${key}`, basketId: "pop", subBasketId: "pop-sub",
      name: `Current ceiling ${key}`, itemType: "main_line", status: "active", version: 2, displayOrder: 0,
      activeRevisionId: `historical-revision-${key}`, draftRevisionId: `current-saved-${key}` } as never);
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: `current-saved-${key}`, mainLineId: `ceiling-${key}`, status: "draft", version: 2 } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({ _id: `overview-${key}`, mainLineId: `ceiling-${key}`, revisionId: `current-saved-${key}`,
      sectionKey: "overview", applicability: "configured", payload: { uomId: "uom", clientVisible: true } } as never);
    await LeadModel.collection.updateOne(byId(`lead-${key}`), { $set: { clientEmail: `client-${key}@chat.test` } });
    // Deliberately divergent working data must never become the customer answer.
    await EstimateModel.collection.updateOne(byId(`estimate-${key}`), { $set: { status: "client_approved", version: 4, clientDecisionAt: new Date(CHAT_NOW),
      totalPaise: key === "a" ? 99_000_003 : 88_000_001, rooms: [{ id: `draft-room-${key}`, label: "PRIVATE_WORKING_ROOM" }],
      lineItems: [{ ...publicationSnapshot(key).lineItems[0], mainLineName: "PRIVATE_WORKING_LINE", ratePaise: 77_000_009, amountPaise: 77_000_009 }] } });
    await EstimateClientReviewRoundModel.collection.insertOne(publicationRound(key) as never);
  }
  const sources = (key: ProjectKey, clientId = `client-${key}`) => createAssistantReadSources({ chatRepository: f.chatRepository,
    scope: { projectId: key, clientId, sessionVersion: 1 }, clock: f.clock });
  return { ...f, sources, read: (key: ProjectKey, basis: "current" | "approved" | "published" = "current") => sources(key).projectEstimate!({ basis }) };
}

describe("Ask Lisno immutable estimate reader with real Mongo snapshots", () => {
  it("invalidates cached execution labels when their approved Main Line becomes hidden", async () => {
    const f = await fixture();
    const snapshot = publicationSnapshot("a");
    const withoutIds = [
      { ...snapshot.lineItems[0], id: null },
      { ...snapshot.lineItems[0], id: null, catalogueId: "ceiling-b", mainLineId: "ceiling-b", mainLineName: "Visible ceiling b" }
    ];
    await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $set: { estimateSnapshot: { ...snapshot,
      lineItems: withoutIds, subtotal: 40, subtotalPaise: 4000, gst: 7.2, gstPaise: 720, total: 47.2, totalPaise: 4720 } } });
    const sourceLineItemKey = "legacy-estimate-line:estimate-a:3:0";
    await VendorWorkAssignmentModel.collection.insertOne({ _id: "assignment-a", projectId: "a", vendorId: "vendor-a", orderId: "order-a",
      orderRevision: 1, lineId: "issued-line-a", procurementItemId: "proc-item-a", estimateId: "estimate-a", estimateVersion: 3,
      estimateReviewRoundId: "review-a", sourceLineItemKey, roomName: "Hall", itemName: "Published ceiling a",
      status: "in_progress", currentRound: 1, version: 1, progress: 0 } as never);
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "order-a", projectId: "a", vendorId: "vendor-a", approvedRevisionId: "order-revision-a",
      approvedRevision: 1, status: "approved" } as never);
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "order-revision-a", projectId: "a", vendorId: "vendor-a", orderId: "order-a", revision: 1,
      lines: [{ id: "issued-line-a", procurementItemId: "proc-item-a", sourceLineItemKey }] } as never);
    const before = await f.sources("a").execution();
    const other = await f.sources("b").execution();
    expect(JSON.stringify(before.facts)).toContain("Published ceiling a");

    await AiEstimatorKnowledgeSectionModel.collection.updateOne(byId("overview-a"), { $set: { "payload.clientVisible": false } });

    expect(await f.sources("a").revalidate(before.freshness)).toBe(false);
    expect(await f.sources("b").revalidate(other.freshness)).toBe(true);
    expect(JSON.stringify((await f.sources("a").execution()).facts)).not.toContain("Published ceiling a");
  });

  it("revokes a cached answer after current visibility changes without changing either project's approved money", async () => {
    const f = await fixture();
    const a = await f.read("a"), b = await f.read("b");
    const original = await EstimateClientReviewRoundModel.findById("review-a").lean();
    await AiEstimatorKnowledgeSectionModel.collection.updateOne(byId("overview-a"), { $set: { "payload.clientVisible": false } });

    expect(await f.sources("a").revalidate(a.freshness)).toBe(false);
    expect(await f.sources("b").revalidate(b.freshness)).toBe(true);
    expect((await f.read("a")).report).toMatchObject({ lines: [], lineCount: 0, totalPaise: amounts.a.totalPaise });
    expect((await f.read("b")).report).toMatchObject({ lineCount: 1, totalPaise: amounts.b.totalPaise });
    expect(await EstimateClientReviewRoundModel.findById("review-a").lean()).toEqual(original);
  });

  it("keeps two unequal projects isolated, uses exact publication values and performs no writes", async () => {
    const f = await fixture();
    const before = await Promise.all([EstimateModel.countDocuments(), EstimateClientReviewRoundModel.countDocuments(), AuditEventModel.countDocuments()]);
    const a = await f.read("a"), b = await f.read("b");
    expect(a.report).toMatchObject({ state: "approved", estimateId: "estimate-a", reviewRoundId: "review-a", estimateVersion: 3,
      subtotalPaise: 2_000, gstPaise: 360, totalPaise: 2_360, lines: [{ id: "published-line-a", ratePaise: 1_000, amountPaise: 2_000 }] });
    expect(b.report).toMatchObject({ state: "approved", estimateId: "estimate-b", reviewRoundId: "review-b", estimateVersion: 3,
      subtotalPaise: 22_509, gstPaise: 4_052, totalPaise: 26_561, lines: [{ id: "published-line-b", ratePaise: 7_503, amountPaise: 22_509 }] });
    expect(JSON.stringify(a)).not.toMatch(/PRIVATE_WORKING|99000003|77000009|published-line-b|client-a@|rateSource|revisionId/);
    expect(JSON.stringify(b)).not.toMatch(/PRIVATE_WORKING|88000001|77000009|published-line-a|client-b@|rateSource|revisionId/);
    await expect(f.sources("b", "client-a").projectEstimate!({ basis: "current" })).rejects.toMatchObject({ status: 404 });
    await expect(f.sources("a", "client-b").projectEstimate!({ basis: "current" })).rejects.toMatchObject({ status: 404 });
    expect(await Promise.all([EstimateModel.countDocuments(), EstimateClientReviewRoundModel.countDocuments(), AuditEventModel.countDocuments()])).toEqual(before);
  });

  it("keeps the pinned pre-approval while a newer project proposal and working copy change", async () => {
    const f = await fixture();
    await ProjectModel.collection.updateOne(byId("a"), { $set: { estimationWorkflowVersion: 2 } });
    await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $set: { phase: "pre", requirementsVersion: 0 } });
    const later = { ...publicationRound("a"), _id: "later-published-a", phase: "post", requirementsVersion: 0,
      estimateVersion: 9, sendGeneration: 2, status: "pending", decision: null, decisionSource: null, decidedById: null, decidedAt: null,
      estimateSnapshot: publicationSnapshot("a", amounts.b) };
    await EstimateClientReviewRoundModel.collection.insertOne(later as never);
    await EstimateModel.collection.updateOne(byId("estimate-a"), { $set: { version: 9,
      estimation: { ...newEstimationLifecycle(), phase: "post", status: "sent_to_client", pendingReviewRoundId: "later-published-a",
        preApproval: { reviewRoundId: "review-a", estimateVersion: 3, approvedAt: CHAT_NOW } } } });
    const current = await f.read("a"), published = await f.read("a", "published");
    expect(current.report).toMatchObject({ state: "approved", totalPaise: 2_360, reviewRoundId: "review-a" });
    expect(published.report).toMatchObject({ state: "published", totalPaise: 26_561, reviewRoundId: "later-published-a" });
    await EstimateModel.collection.updateOne(byId("estimate-a"), { $set: { "estimation.preApproval.estimateVersion": 2 } });
    expect(await f.sources("a").revalidate(current.freshness)).toBe(false);
    expect((await f.read("a")).report).toBeNull();
    expect((await f.read("b")).report?.totalPaise).toBe(26_561);
  });

  it("invalidates the exact publication witness when its version changes, without affecting the other project", async () => {
    const f = await fixture(); const a = await f.read("a"), b = await f.read("b");
    const aPublicationWitness = a.freshness.filter(row => row.kind === "assistant-project-estimate");
    expect(aPublicationWitness).toHaveLength(1);
    expect(await f.sources("a").revalidate(aPublicationWitness)).toBe(true);
    await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $inc: { version: 1 } });
    expect(await f.sources("a").revalidate(aPublicationWitness)).toBe(false);
    expect(await f.sources("b").revalidate(b.freshness)).toBe(true);
    expect((await f.read("a")).report).toMatchObject({ reviewVersion: 2, totalPaise: 2_360 });
    await ProjectModel.collection.updateOne(byId("a"), { $set: { clientId: "client-b" } });
    expect(await f.sources("a").revalidate(a.freshness)).toBe(false);
    await expect(f.read("a")).rejects.toMatchObject({ status: 404 });
  });

  it("requires an actual matching proof for an admin-on-behalf approval and invalidates a damaged proof", async () => {
    const f = await fixture();
    await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $set: { decisionSource: "admin_proof", decidedById: "admin-a" } });
    expect((await f.read("a")).report).toBeNull();
    await EstimateClientResponseProofModel.collection.insertOne({ _id: "synthetic-proof-a", estimateId: "estimate-a", reviewRoundId: "review-a", uploadedById: "admin-a",
      uploadedAt: new Date(CHAT_NOW), originalFilename: "synthetic-approval.pdf", mimeType: "application/pdf", byteSize: 100,
      sha256: "a".repeat(64), storageReference: "synthetic-proof-reference" } as never);
    const approved = await f.read("a"); expect(approved.report?.totalPaise).toBe(2_360);
    expect(JSON.stringify(approved)).not.toMatch(/synthetic-proof-reference|synthetic-approval.pdf|uploadedById/);
    await EstimateClientResponseProofModel.collection.updateOne(byId("synthetic-proof-a"), { $set: { uploadedById: "admin-b" } });
    expect(await f.sources("a").revalidate(approved.freshness)).toBe(false);
    expect((await f.read("a")).report).toBeNull();
    expect((await f.read("b")).report?.totalPaise).toBe(26_561);
  });

  it.each(["recipient", "project", "lead", "decision actor", "decision source", "finance lineage", "missing snapshot", "inconsistent paise"] as const)("withholds prices after a %s conflict instead of falling back to live values", async conflict => {
    const f = await fixture(); const before = await f.read("a"); expect(before.report?.totalPaise).toBe(2_360);
    if (conflict === "recipient") await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $set: { recipientEmailNormalized: "client-b@chat.test" } });
    if (conflict === "project") await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $set: { projectId: "b" } });
    if (conflict === "lead") await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $set: { leadId: "lead-b" } });
    if (conflict === "decision actor") await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $set: { decidedById: "client-b" } });
    if (conflict === "decision source") await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $set: { decisionSource: "unrecognized_source" } });
    if (conflict === "finance lineage") await ProjectFinanceBucketModel.collection.insertOne({ _id: "synthetic-finance-a", projectId: "a", estimateId: "estimate-b", estimateVersion: 3, estimateReviewRoundId: "review-b" } as never);
    if (conflict === "missing snapshot") await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $unset: { estimateSnapshot: "" } });
    if (conflict === "inconsistent paise") await EstimateClientReviewRoundModel.collection.updateOne(byId("review-a"), { $set: { "estimateSnapshot.totalPaise": 9_999 } });
    expect(await f.sources("a").revalidate(before.freshness)).toBe(false);
    const result = await f.read("a"); expect(result.report).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/99000003|77000009|PRIVATE_WORKING/);
  });
});
