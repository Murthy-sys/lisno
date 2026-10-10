import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { insertChatMongoFixture } from "./helpers/project-chat-mongo.js";
import { CHAT_NOW } from "./helpers/project-chat.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { VendorExecutionStateModel } from "../src/models/VendorExecutionState.js";
import { VendorExecutionReviewModel } from "../src/models/VendorExecutionReview.js";
import { VendorWorkReviewModel } from "../src/models/VendorWorkReview.js";
import { SiteCompletionStateModel } from "../src/models/SiteCompletionState.js";
import { SiteCompletionReviewModel } from "../src/models/SiteCompletionReview.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { createAssistantReadSources } from "../src/services/project-assistant-sources.js";
import { readAssistantLines, readAssistantRecommendations, searchAssistantCatalogue } from "../src/services/project-assistant-catalogue.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("project-assistant-data"); }, 120000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica?.stop(); });
const source = { projectId: "a", clientId: "client-a", sessionVersion: 1 };
const mode = (baseRatePaise: number) => ({ baseRatePaise, lowQuantityLimit: "10", impactBps: 1000, minimumMarkupBps: 1000, startingMarkupBps: 2000 });
async function seedLine(id: string, basketId = "pop", options: { temporary?: boolean; quantityScale?: number; incomplete?: boolean } = {}) {
  await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: id, basketId, subBasketId: `${basketId}-sub`, name: "False ceiling", nameNormalized: "false ceiling", displayOrder: 1, status: "active", itemType: options.temporary ? "temporary" : "main_line", version: 1, activeRevisionId: `${id}-active`, draftRevisionId: `${id}-draft` } as never);
  for (const status of ["active", "draft"]) {
    const revisionId = `${id}-${status}`;
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: revisionId, mainLineId: id, status, version: status === "draft" ? 3 : 1,
      completeness: { sections: [{ sectionKey: "overview", state: "complete" }, { sectionKey: "advanced", state: options.incomplete && status === "draft" ? "incomplete" : "complete" }] } } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertMany([
      { _id: `${revisionId}-overview`, revisionId, mainLineId: id, sectionKey: "overview", applicability: "configured", version: 1, payload: { uomId: "uom" } },
      { _id: `${revisionId}-advanced`, revisionId, mainLineId: id, sectionKey: "advanced", applicability: "configured", version: 2, payload: { pmcMarginBps: 1500, subVendorMarginBps: 2500,
        modeCalculations: { pmc: mode(7500), sub_vendor: mode(status === "draft" ? 6500 : 100), in_house_labor: mode(2300), in_house_material: mode(4700) } } }
    ] as never[]);
  }
}
async function configuration() {
  await AiEstimatorKnowledgeBasketModel.collection.insertMany([{ _id: "pop", name: "POP / Gypsum", status: "active" }, { _id: "paint", name: "Painting", status: "active" }] as never[]);
  await AiEstimatorKnowledgeSubBasketModel.collection.insertMany([{ _id: "pop-sub", basketId: "pop", name: "Ceiling", version: 1 }, { _id: "paint-sub", basketId: "paint", name: "Ceiling", version: 1 }] as never[]);
  await AiEstimatorKnowledgeUomModel.collection.insertOne({ _id: "uom", code: "sq-ft", name: "Square feet", decimalScale: 2, status: "active", version: 1 } as never);
  await seedLine("ceiling"); await seedLine("same-name", "paint");
}
const request = { lines: [{ mainLineId: "ceiling", roomId: "room-a", quantity: "11", pricingMode: null, additiveConfirmed: true, optional: false }] } as const;
async function fixture() {
  const f = await insertChatMongoFixture(); await configuration();
  const line = { id: "approved-line", source: "configuration", itemType: "main_line", classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration", catalogueId: "ceiling", roomId: "room-a", roomName: "Hall", specification: null,
    mainBasketId: "pop", mainBasketName: "POP / Gypsum", subBasketId: "pop-sub", subBasketName: "Ceiling", mainLineId: "ceiling", mainLineName: "False ceiling", revisionId: "ceiling-active", uomId: "uom", uomName: "Square feet", unit: "sq-ft", quantity: 2, rate: 10, amount: 20, ratePaise: 1000, amountPaise: 2000, included: true };
  await LeadModel.collection.updateOne({ _id: "lead-a" }, { $set: { clientEmail: "client-a@chat.test" } });
  await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $set: { status: "client_approved", version: 4, clientDecisionAt: new Date(CHAT_NOW), designPlanStatus: "pending_assignment", designPlanVersion: 0, rooms: [{ id: "room-a", label: "Hall" }], lineItems: [line] } });
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: "review-a", estimateId: "estimate-a", leadId: "lead-a", projectId: "a", estimateVersion: 3, version: 1, sendGeneration: 1, status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: "client-a", decidedAt: new Date(CHAT_NOW), createdAt: new Date(CHAT_NOW), recipientEmailNormalized: "client-a@chat.test",
    estimateSnapshot: { clientName: "Client A", projectName: "Project A", location: "Synthetic", propertyType: "villa", lineItems: [line], subtotal: 20, gst: 3.6, total: 23.6, subtotalPaise: 2000, gstPaise: 360, totalPaise: 2360 } } as never);
  return { ...f, sources: createAssistantReadSources({ chatRepository: f.chatRepository, scope: source, clock: f.clock }) };
}

describe("assistant Mongo catalogue and approved scope", () => {
  it("reads the latest saved draft, disambiguates names by stable IDs and never returns costs", async () => {
    const f = await fixture();
    const candidates = await f.sources.searchCatalogue({ query: "False ceiling", limit: 8 });
    expect(candidates.map(row => row.mainLineId).sort()).toEqual(["ceiling", "same-name"]);
    expect(candidates[0]).toMatchObject({ revisionId: "ceiling-draft", revisionVersion: 3, uom: { code: "sq-ft" }, available: true });
    expect(JSON.stringify(candidates)).not.toMatch(/baseRate|margin|6500|1000|client-a@/);
    expect(await searchAssistantCatalogue({ query: ".*", limit: 8 })).toEqual([]);
    await expect(f.sources.searchCatalogue({ query: "ceiling", limit: 9 })).rejects.toMatchObject({ status: 400 });
  });
  it("returns exact current selling amount beside immutable approved baseline and detects UOM, section, recommendation and parent changes", async () => {
    const f = await fixture();
    const counts = await Promise.all([EstimateModel.countDocuments(), EstimateClientReviewRoundModel.countDocuments(), AiEstimatorKnowledgeMainLineModel.countDocuments(), AiEstimatorKnowledgeSectionModel.countDocuments()]);
    const before = await f.sources.preview(structuredClone(request) as any);
    expect(before.restricted).toMatchObject({ subtotalPaise: 95333, gstPaise: 17160, totalPaise: 112493, approvedBaselinePaise: 2360, hypotheticalTotalPaise: 114853 });
    expect(before.public).toEqual({ state: "complete", missingInputs: [] });
    expect(await f.sources.revalidate(before.freshness)).toBe(true);
    expect(await Promise.all([EstimateModel.countDocuments(), EstimateClientReviewRoundModel.countDocuments(), AiEstimatorKnowledgeMainLineModel.countDocuments(), AiEstimatorKnowledgeSectionModel.countDocuments()])).toEqual(counts);
    const status = await f.sources.status(); expect(status.facts).toContainEqual(expect.objectContaining({ id: "room:room-a", label: "Project room", value: "Hall" }));
    await AiEstimatorKnowledgeUomModel.collection.updateOne({ _id: "uom" }, { $set: { decimalScale: 0 }, $inc: { version: 1 } });
    expect(await f.sources.revalidate(before.freshness)).toBe(false);
    const current = await f.sources.preview(structuredClone(request) as any);
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "ceiling-draft-advanced" }, { $set: { "payload.subVendorMarginBps": 5000 }, $inc: { version: 1 } });
    expect(await f.sources.revalidate(current.freshness)).toBe(false);
    const next = await f.sources.preview(structuredClone(request) as any);
    await AiEstimatorKnowledgeBasketModel.collection.updateOne({ _id: "pop" }, { $set: { status: "inactive" } });
    expect(await f.sources.revalidate(next.freshness)).toBe(false);
    expect((await f.sources.preview(structuredClone(request) as any)).restricted.totalPaise).toBeNull();
  });
  it("does not fall back to active prices from an incomplete or broken saved draft, and rejects temporary/new inactive UOM work", async () => {
    await configuration(); await seedLine("incomplete", "pop", { incomplete: true }); await seedLine("temporary", "pop", { temporary: true });
    const read = await readAssistantLines(["incomplete", "temporary"]);
    expect(read.lines.get("incomplete")?.candidate).toMatchObject({ revisionId: "incomplete-draft", available: false });
    expect(read.lines.get("temporary")?.candidate.available).toBe(false);
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "ceiling-draft-overview" }, { $set: { "payload.uomId": "missing" } });
    expect((await readAssistantLines(["ceiling"])).lines.has("ceiling")).toBe(false);
  });
  it("expands configured mandatory groups and keeps unavailable children explicit", async () => {
    await configuration(); await seedLine("bad-child", "paint", { incomplete: true });
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({ _id: "recommend", revisionId: "ceiling-draft", mainLineId: "ceiling", sectionKey: "recommendations", applicability: "configured", version: 1,
      payload: { budgetAlterations: [{ id: "paint-required", trigger: "added", action: "add", requirement: "must", targetKind: "sub_basket", targetType: null, targetBasketId: "paint", targetSubBasketId: "paint-sub", targetMainLineId: null, reason: "Finish", active: true }] } } as never);
    const rules = await readAssistantRecommendations(["ceiling"]);
    expect(rules.rules[0]).toMatchObject({ requirement: "must", targetKind: "sub_basket", completionRequired: true });
    expect(rules.rules[0]?.targetMainLineIds).toContain("same-name");
  });
  it("does not disclose a different Client project and invalidates ownership and approval version changes", async () => {
    const f = await fixture(); const before = await f.sources.preview(structuredClone(request) as any);
    await expect(createAssistantReadSources({ chatRepository: f.chatRepository, scope: { ...source, clientId: "client-b" } }).status()).rejects.toMatchObject({ status: 404 });
    await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $inc: { version: 1 } });
    expect(await f.sources.revalidate(before.freshness)).toBe(false);
    expect((await f.sources.preview(structuredClone(request) as any)).restricted.approvedBaselinePaise).toBeNull();
    await ProjectModel.collection.updateOne({ _id: "a" }, { $set: { clientId: "client-b" } });
    await expect(f.sources.execution()).rejects.toMatchObject({ status: 404 });
  });
});

async function executionFixture() {
  const f = await fixture();
  const assignment = { _id: "assignment", projectId: "a", vendorId: "vendor", orderId: "order", orderRevision: 1, lineId: "issued-line", procurementItemId: "proc-item", estimateId: "estimate-a", estimateVersion: 3, estimateReviewRoundId: "review-a", sourceLineItemKey: "approved-line", sourceSectionId: "pop", roomName: "Hall", itemName: "False ceiling", status: "in_progress", currentRound: 1, version: 1, progress: 0, note: "PRIVATE_INTERNAL_NOTE" };
  await VendorWorkAssignmentModel.collection.insertOne(assignment as never);
  await ProjectPurchaseOrderModel.collection.insertOne({ _id: "order", projectId: "a", vendorId: "vendor", status: "approved", approvedRevisionId: "order-revision", approvedRevision: 1, cancelledAt: null } as never);
  await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "order-revision", projectId: "a", orderId: "order", vendorId: "vendor", revision: 1,
    lines: [{ id: "issued-line", procurementItemId: "proc-item", sourceLineItemKey: "approved-line", unitRatePaise: 12345678 }] } as never);
  await VendorExecutionStateModel.collection.insertOne({ _id: "assignment", assignmentId: "assignment", projectId: "a", vendorId: "vendor", version: 1, status: "in_progress", executionRound: 1, progress: 45, latestNote: "PRIVATE_INTERNAL_NOTE", proposedSchedule: { startDate: "2026-10-09", finishDate: "2026-10-13", reason: "PRIVATE_REASON" }, schedule: null } as never);
  return f;
}
describe("assistant Client execution facts", () => {
  it("distinguishes proposed/confirmed schedule and reported/site-verified/accepted completion, without private notes or order prices", async () => {
    const f = await executionFixture();
    const proposed = await f.sources.execution();
    expect(proposed.facts.some(fact => fact.value.includes("45% reported"))).toBe(true);
    expect(proposed.facts.some(fact => fact.label.includes("proposed schedule") && fact.value.includes("awaiting confirmation"))).toBe(true);
    expect(JSON.stringify(proposed)).not.toMatch(/PRIVATE|12345678|unitRatePaise|cost|margin/);
    await VendorExecutionStateModel.collection.updateOne({ _id: "assignment" }, { $set: { status: "site_verified", progress: 100, submissionId: "verification", verificationId: "verification", schedule: { startDate: "2026-10-10", finishDate: "2026-10-15", revision: 1, confirmedAt: new Date(CHAT_NOW), confirmedById: "site-a" } }, $inc: { version: 1 } });
    await VendorExecutionReviewModel.collection.insertOne({ _id: "verification", assignmentId: "assignment", projectId: "a", vendorId: "vendor", executionRound: 1, decision: { outcome: "verified", actorId: "site-a", decidedAt: new Date(CHAT_NOW) } } as never);
    const verified = await f.sources.execution(); expect(verified.facts.some(fact => fact.value === "Site verified; awaiting Client acceptance.")).toBe(true);
    expect(verified.facts.some(fact => fact.label.includes("confirmed schedule"))).toBe(true); expect(await f.sources.revalidate(proposed.freshness)).toBe(false);
    await VendorWorkAssignmentModel.collection.updateOne({ _id: "assignment" }, { $set: { status: "client_approved" } });
    await VendorWorkReviewModel.collection.insertOne({ _id: "client-review", assignmentId: "assignment", projectId: "a", vendorId: "vendor", clientId: "client-a", round: 1, status: "approved", decision: { decision: "approve", actorId: "client-a", decidedAt: new Date(CHAT_NOW) } } as never);
    expect((await f.sources.execution()).facts.some(fact => fact.value === "Client accepted.")).toBe(true);
  });
  it("withholds facts for mismatched issued lineage and cancelled work", async () => {
    const f = await executionFixture();
    await VendorWorkAssignmentModel.collection.updateOne({ _id: "assignment" }, { $set: { estimateReviewRoundId: "other-project-round" } });
    expect((await f.sources.execution()).facts).toEqual([expect.objectContaining({ value: "Work source needs review by the project team." })]);
    await ProjectPurchaseOrderModel.collection.updateOne({ _id: "order" }, { $set: { status: "cancelled", cancelledAt: new Date(CHAT_NOW) } });
    expect((await f.sources.execution()).facts).toEqual([expect.objectContaining({ value: "No current issued work details are available." })]);
  });
});

async function aggregateAcceptedFixture() {
  const f = await executionFixture();
  await ProjectModel.collection.updateOne({ _id: "a" }, { $set: { completionAuthority: "vendor_client", completionAuthorityVersion: 4 } });
  await VendorExecutionStateModel.collection.updateOne({ _id: "assignment" }, { $set: { status: "site_verified", progress: 100, submissionId: "verification", verificationId: "verification" }, $inc: { version: 1 } });
  await VendorExecutionReviewModel.collection.insertOne({ _id: "verification", assignmentId: "assignment", projectId: "a", vendorId: "vendor", executionRound: 1, submissionVersion: 2, imageIds: [], decision: { outcome: "verified", actorId: "site-a", decidedAt: new Date(CHAT_NOW) } } as never);
  await SiteCompletionStateModel.collection.insertOne({ _id: "a", projectId: "a", version: 3, currentRound: 1, status: "client_approved", progress: 100, verifiedAssignmentIds: ["assignment"] } as never);
  await SiteCompletionReviewModel.collection.insertOne({ _id: "site-review", projectId: "a", clientId: "client-a", managerId: "site-a", version: 2, round: 1, status: "approved", submittedAt: new Date(CHAT_NOW), estimateId: "estimate-a", estimateVersion: 3, estimateReviewRoundId: "review-a", approvedRevisionIds: ["order-revision"], sourceLineItemKeys: ["approved-line"],
    sections: [{ assignmentId: "assignment", sourceSectionId: "pop", executionVerificationId: "verification", executionRound: 1, executionSubmissionVersion: 2, imageIds: [] }],
    decision: { decision: "approve", actorId: "client-a", decidedAt: new Date(CHAT_NOW) } } as never);
  return f;
}
describe("assistant aggregate Site Manager completion decisions", () => {
  it("recognizes current aggregate Client acceptance while the assignment remains in progress", async () => {
    const f = await aggregateAcceptedFixture();
    const result = await f.sources.execution();
    expect(result.facts.some(fact => fact.value === "Client accepted.")).toBe(true);
    expect(result.facts.some(fact => fact.value.includes("awaiting Client acceptance"))).toBe(false);
    expect((await VendorWorkAssignmentModel.findById("assignment").lean())?.status).toBe("in_progress");
    expect(await f.sources.revalidate(result.freshness)).toBe(true);
    await SiteCompletionReviewModel.collection.updateOne({ _id: "site-review" }, { $inc: { version: 1 } });
    expect(await f.sources.revalidate(result.freshness)).toBe(false);
  });
  it("reports aggregate changes requested even after execution was reopened to a new round", async () => {
    const f = await aggregateAcceptedFixture();
    await SiteCompletionStateModel.collection.updateOne({ _id: "a" }, { $set: { status: "changes_requested", progress: 0, verifiedAssignmentIds: null } });
    await SiteCompletionReviewModel.collection.updateOne({ _id: "site-review" }, { $set: { status: "changes_requested", "decision.decision": "request_changes" } });
    await VendorExecutionStateModel.collection.updateOne({ _id: "assignment" }, { $set: { status: "changes_requested", executionRound: 2, verificationId: null, submissionId: null } });
    const result = await f.sources.execution();
    expect(result.facts.some(fact => fact.value === "Client requested changes; work needs correction and Site Manager verification.")).toBe(true);
    expect(result.facts.some(fact => fact.value === "Client accepted.")).toBe(false);
  });
  it.each([
    { estimateReviewRoundId: "foreign-review" },
    { approvedRevisionIds: ["old-issued-revision"] },
    { sourceLineItemKeys: ["different-source"] },
    { "sections.0.executionSubmissionVersion": 5 },
    { "sections.0.sourceSectionId": "other-section" },
    { round: 2 },
    { clientId: "client-b" }
  ])("withholds acceptance for stale or mismatched site review %j", async patch => {
    const f = await aggregateAcceptedFixture();
    await SiteCompletionReviewModel.collection.updateOne({ _id: "site-review" }, { $set: patch });
    const result = await f.sources.execution();
    expect(result.facts.some(fact => fact.value === "Client accepted.")).toBe(false);
    expect(result.facts.some(fact => fact.value === "Client completion review needs verification by the project team.")).toBe(true);
  });
});
