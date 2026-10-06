import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcurementBasketDetailDto } from "../src/domain/procurement-basket-projection.js";
import type { ProjectPurchaseOrderPreparationDto } from "../src/domain/project-purchase-order-preparation.js";
import type { ProcurementBasketMilestoneReviewersInput } from "../src/domain/procurement-basket-tender.js";
import { ApiError } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProcurementBasketAwardApprovalModel, ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel,
  ProcurementBasketBidModel, ProcurementBasketBoqRevisionModel, ProcurementBasketCounterofferModel,
  ProcurementBasketEnquiryModel, ProcurementBasketInvitationModel,
  ProcurementBasketInvitationBatchModel,
  ProcurementBasketWhatsAppAccessModel } from "../src/models/ProcurementBasketTender.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { VendorKpiAssessmentModel } from "../src/models/VendorKpiAssessment.js";
import { createProcurementBasketAwardService } from "../src/services/procurement-basket-award.service.js";
import { preparedBaskets } from "../src/services/procurement-basket.service.js";
import { createProcurementBasketEnquiryService } from "../src/services/procurement-basket-enquiry.service.js";
import { assertBasketVendorEligible, eligibleBasketVendors } from "../src/services/procurement-basket-vendor-eligibility.service.js";
import type { AuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const digest = "a".repeat(64);
const at = new Date("2026-10-05T00:00:00.000Z");
const buyer: PublicUser = { id: "buyer", name: "Buyer", email: "buyer@example.test", role: "procurement" };
const milestoneIds = ["advance", "mobilisation", "progress_50", "progress_85", "final"] as const;
const procurementReviewers: ProcurementBasketMilestoneReviewersInput = milestoneIds.map(id => ({ id,
  reviewerSlots: ["procurement"] }));
const fullReviewers: ProcurementBasketMilestoneReviewersInput = milestoneIds.map(id => ({ id,
  reviewerSlots: id === "advance" ? ["program_manager", "designer"] :
    id === "final" ? ["procurement", "finance_head"] : [] }));
const basket: ProcurementBasketDetailDto = { id: "basket-a", name: "Painting", classification: "special",
  automaticSubVendor: false, boqReady: true, standardCost: null, projectId: "project-a",
  estimateSource: { estimateId: "estimate-a", estimateVersion: 1, estimateReviewRoundId: "round-a" },
  preparationDigest: digest, includedLineCount: 1, readyLineCount: 1, approvedEstimatePaise: 10_000_000,
  baseCostPaise: 500_000, adjustedCostPaise: 600_000, workingTotalPaise: 700_000,
  workingTotalComplete: true, committedNetPaise: 0, state: "ready",
  lines: [{ sourceLineItemKey: "line-a", roomId: "room-a", roomName: "Living",
    subBasketId: "sub-a", subBasketName: "Walls", mainLineId: "main-a", mainLineName: "Two coats of interior paint",
    approvedQuantity: "10", approvedUnit: "sq-ft", approvedAmountPaise: 10_000_000,
    included: true, source: "configuration", baseUnitRatePaise: 50_000, standardCost: null,
    mode: { state: "ready", revision: { id: "revision-a", version: 2, status: "active", contentDigest: digest },
      preview: { baseCostPaise: 500_000,
      adjustedCostPaise: 600_000, sellingPaise: 700_000 }, uom: { id: "uom-a", code: "SQFT", decimalScale: 2 } } as ProcurementBasketDetailDto["lines"][number]["mode"] }] };
const manualMode = basket.lines[0]!.mode;
const firstLine = basket.lines[0]!;
function useObservedStandardCost(): void {
  basket.classification = "standard";
  basket.automaticSubVendor = true;
  basket.boqReady = true;
  basket.standardCost = { totalPaise: 600_000, complete: true, provisional: true, pricedLineCount: 1 };
  firstLine.standardCost = { state: "observed_unverified", mode: "sub_vendor", calculationQuantity: "10",
    baseRates: [{ scope: "sub_vendor", ratePaise: 50_000 }], baseCostPaise: 500_000,
    adjustedCostPaise: 600_000, issues: [{ code: "PINNED_DIGEST_MISMATCH", message: "Saved Configuration changed." }] };
  firstLine.mode = { state: "unavailable", preview: null, decision: null,
    revision: { id: "revision-a", version: 2, status: "active", contentDigest: digest },
    uom: { id: "uom-a", code: "SQFT", decimalScale: 2 },
    integrity: { status: "mismatch", activatedDigest: digest, observedDigest: "b".repeat(64), candidateAvailability: [] }
  } as ProcurementBasketDetailDto["lines"][number]["mode"];
}
const prep: ProjectPurchaseOrderPreparationDto = { projectId: "project-a", orderDefaults: { targetDate: "2026-12-01", deliveryLocation: "Site" },
  estimateSource: basket.estimateSource, approvedEstimatePaise: basket.approvedEstimatePaise,
  committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: basket.approvedEstimatePaise,
  estimateLines: [], sections: [], netPaise: null, itemCount: 0, readyItemCount: 0, blockers: [], digest };

vi.mock("../src/services/procurement.service.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/services/procurement.service.js")>(),
  assertProcurementProjectAccess: vi.fn(async (actor: PublicUser, projectId: string) => {
    if (actor.role !== "procurement" || projectId !== "project-a") throw new ApiError(403, "FORBIDDEN", "Forbidden.");
  }),
  procurementItemSourceSnapshot: vi.fn(async () => ({ allLineItems: basket.lines.map(line => ({
    source: line.source, mainBasketId: basket.id, sectionId: basket.id,
    subBasketId: line.subBasketId, uomId: line.mode?.uom?.id, mainLineId: line.mainLineId
  })) }))
}));
vi.mock("../src/services/procurement-basket.service.js", () => ({ preparedBaskets: vi.fn(async () => [basket]) }));
vi.mock("../src/services/project-purchase-order-preparation.service.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/services/project-purchase-order-preparation.service.js")>(),
  buildProjectPurchaseOrderPreparation: vi.fn(async () => prep)
}));
vi.mock("../src/services/procurement-basket-vendor-eligibility.service.js", () => ({
  eligibleBasketVendors: vi.fn(async () => ["vendor-a", "vendor-b"].map(vendorId => ({ vendorId,
    code: vendorId.toUpperCase(), name: vendorId === "vendor-a" ? "Vendor A" : "Vendor B",
    contactEmail: `${vendorId}@example.test`, kpiScoreBps: 8_000,
    city: null, cityVersion: 0, cityMatch: "unknown", eligible: true, blockers: [] }))),
  assertBasketVendorEligible: vi.fn(async (vendorId: string) => ({ vendorId,
    code: vendorId.toUpperCase(), name: vendorId === "vendor-a" ? "Vendor A" : "Vendor B",
    contactEmail: `${vendorId}@example.test`, kpiScoreBps: vendorId === "vendor-a" ? 8_000 : 9_000,
    city: null, cityVersion: 0, cityMatch: "unknown", eligible: true, blockers: [] }))
}));

const audit = { appendInMongoTransaction: vi.fn(async () => ({})) } as unknown as AuditService;
const sent: Array<{ recipient: { name: string; email: string }; rawToken: string }> = [];
const mailer = { deliveryKind: "local_test" as const, sendRequest: vi.fn(async (message: { recipient: { name: string; email: string }; rawToken: string }) => {
  sent.push({ recipient: message.recipient, rawToken: message.rawToken });
}) };
const enquiries = createProcurementBasketEnquiryService({ audit, mailer, now: () => at });
const awards = createProcurementBasketAwardService({ audit, now: () => at });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-basket-tender-tests");
  await Promise.all([ProjectModel, UserModel, AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel,
    AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgeVendorModel, VendorKpiAssessmentModel,
    ProjectWorkflowTaskModel,
    ProcurementBasketEnquiryModel, ProcurementBasketBoqRevisionModel, ProcurementBasketInvitationModel,
    ProcurementBasketWhatsAppAccessModel,
    ProcurementBasketBidModel, ProcurementBasketCounterofferModel, ProcurementBasketInvitationBatchModel, ProcurementBasketAwardModel,
    ProcurementBasketAwardRevisionModel, ProcurementBasketAwardApprovalModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear(); sent.length = 0; mailer.sendRequest.mockClear();
  basket.preparationDigest = digest;
  basket.lines = [firstLine];
  firstLine.mainLineName = "Two coats of interior paint";
  basket.includedLineCount = 1;
  basket.classification = "special";
  basket.automaticSubVendor = false;
  basket.boqReady = true;
  basket.standardCost = null;
  basket.lines[0]!.baseUnitRatePaise = 50_000;
  basket.lines[0]!.standardCost = null;
  basket.lines[0]!.mode = manualMode;
  await ProjectModel.create({ _id: "project-a", name: "Project A", status: "active", location: "Bengaluru",
    clientName: "Test client", clientEmail: "client@example.test", clientEmailNormalized: "client@example.test",
    clientMobile: "9000000000", clientAddress: "Bengaluru",
    plannedStartAt: at, plannedEndAt: new Date("2026-12-01T00:00:00.000Z"),
    assignedDesignerIds: ["designer"] });
  await UserModel.create([{ _id: buyer.id, name: buyer.name, email: buyer.email,
    emailNormalized: buyer.email, passwordHash: "fixture", role: buyer.role, active: true },
  { _id: "buyer-two", name: "Buyer Two", email: "buyer-two@example.test", emailNormalized: "buyer-two@example.test",
    passwordHash: "fixture", role: "procurement", active: true },
  { _id: "designer", name: "Designer", email: "designer@example.test", emailNormalized: "designer@example.test",
    passwordHash: "fixture", role: "designer", active: true },
  { _id: "site-manager", name: "PM", email: "pm@example.test", emailNormalized: "pm@example.test",
    passwordHash: "fixture", role: "site_manager", active: true },
  { _id: "finance", name: "Finance", email: "finance@example.test", emailNormalized: "finance@example.test",
    passwordHash: "fixture", role: "finance_head", active: true },
  { _id: "super-admin", name: "Super Admin", email: "super@example.test", emailNormalized: "super@example.test",
    passwordHash: "fixture", role: "super_admin", active: true }]);
  await AiEstimatorKnowledgeBasketModel.create({ _id: "basket-a", name: "Painting", displayOrder: 1,
    status: "active", version: 1, dependencyEpoch: 0, createdById: "super-admin", updatedById: "super-admin" });
  await AiEstimatorKnowledgeSubBasketModel.create({ _id: "sub-a", basketId: "basket-a", name: "Walls",
    displayOrder: 1, version: 1, dependencyEpoch: 0, createdById: "super-admin", updatedById: "super-admin" });
  await AiEstimatorKnowledgeUomModel.create({ _id: "uom-a", code: "SQFT", name: "Square foot", decimalScale: 2,
    displayOrder: 1, status: "active", version: 1, dependencyEpoch: 0,
    createdById: "super-admin", updatedById: "super-admin" });
  await AiEstimatorKnowledgeMainLineModel.create({ _id: "main-a", basketId: "basket-a", subBasketId: "sub-a",
    name: "Paint", displayOrder: 1, status: "active", activeRevisionId: "revision-a", draftRevisionId: null,
    version: 1, dependencyEpoch: 0, createdById: "super-admin", updatedById: "super-admin" });
  await ProjectWorkflowTaskModel.create({ _id: "site-task-a", dedupeKey: "estimate-a:site",
    projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1,
    kind: "site_execution", title: "Site execution", assigneeRole: "site_manager", assigneeUserId: "site-manager", openedAt: at });
  await ProjectWorkflowTaskModel.create({ _id: "finance-task-a", dedupeKey: "finance-project-a",
    projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1,
    kind: "finance", title: "Finance review", assigneeRole: "finance_head", openedAt: at });
  await AiEstimatorKnowledgeVendorModel.collection.insertMany(["vendor-a", "vendor-b"].map((vendorId, index) => ({
    _id: vendorId, name: index ? "Vendor B" : "Vendor A", code: vendorId.toUpperCase(), status: "active",
    nameNormalized: index ? "vendor b" : "vendor a", codeNormalized: vendorId,
    kpiRubricGeneration: 0, procurementProfile: { vendorType: "execution", executionType: ["labor"],
      nameOfRepresentative: "Vendor contact", position: "Owner", gstRegistered: false,
      msmeRegistered: false, turnoverSelfDeclaredPaise: 0, turnoverVerifiedPaise: null,
      workProfile: "Painting works", email: `${vendorId}@example.test`,
      phoneNumber: index ? "1234567890" : "9876543210", address: "Project city",
      aadhar: "123456789012", pan: "ABCDE1234F", currentAddress: "Project city",
      currentAddressVerifiedPhysically: false, mainBasketId: "basket-a", subBasketId: "sub-a" } })));
  await VendorKpiAssessmentModel.create(["vendor-a", "vendor-b"].map((vendorId, index) => ({
    _id: `assessment-${vendorId}`, vendorId, source: "procurement", vendorType: "execution",
    rubricVersion: 1, rubricGeneration: 0, scores: [], averageScoreBps: index ? 9_000 : 8_000,
    revision: 1, submittedAt: at, actorId: buyer.id, idempotencyKey: `kpi-${vendorId}`, payloadHash: digest })));
});
afterAll(async () => { await replica?.stop(); });

const boqInput = { expectedPreparationDigest: digest, idempotencyKey: "enquiry-key-001",
  lines: [{ sourceLineItemKey: "line-a" }] };

async function sentEnquiry(vendorIds = ["vendor-a", "vendor-b"]) {
  const created = await enquiries.create(buyer, "project-a", "basket-a", boqInput);
  const dispatched = await enquiries.dispatch(buyer, "project-a", "basket-a", created.id,
    { expectedVersion: created.version, expectedPreparationDigest: digest,
      idempotencyKey: "dispatch-key-001", vendorIds });
  return dispatched;
}

async function currentAwardLineTerms(enquiryId: string) {
  const enquiry = await enquiries.get(buyer, "project-a", "basket-a", enquiryId);
  return enquiry.lines.map(line => ({ boqLineId: line.id, scopeType: "execution" as const,
    targetDate: "2026-12-01", deliveryLocation: "Project site" }));
}

async function assignedAwardDraft() {
  const enquiry = await sentEnquiry(["vendor-a"]);
  const token = sent[0]!.rawToken;
  const boq = await enquiries.inspectVendorBoq(token);
  const bid = await enquiries.submitVendorBid({ token, idempotencyKey: "assigned-project-bid",
    lines: [{ boqLineId: boq.lines[0]!.id, unitPricePaise: 600_000, gstBasisPoints: 0 }] });
  const current = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
  const preview = await awards.preview(buyer, "project-a", "basket-a", enquiry.id,
    { bidId: bid.bidId, advanceBasisPoints: 2_000 });
  expect(preview).toMatchObject({ assignedSiteManager: { id: "site-manager" },
    assignedDesigner: { id: "designer" }, approverBlockers: [] });
  const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id, {
    expectedVersion: current.version, idempotencyKey: "assigned-project-award", bidId: bid.bidId,
    advanceBasisPoints: 2_000, milestoneReviewers: fullReviewers, nonRecommendedReason: null });
  expect(award.proposal).toMatchObject({ programManagerId: "site-manager", designerId: "designer" });
  return { enquiry, bid, award };
}

describe("procurement basket tender transaction flow", () => {
  it("routes only assigned Site Manager and Designer queues before the page limit and denies other-project decisions", async () => {
    const { enquiry, award } = await assignedAwardDraft();
    const submitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "assigned-project-submit" });
    const project = (await ProjectModel.findById("project-a").lean())!;
    await ProjectModel.create({ ...project, _id: "project-b", assignedDesignerIds: ["designer", "designer-b"] });
    await EstimateModel.collection.insertOne({ _id: "estimate-b", projectId: "project-b", designPlanDesignerId: "designer-b" } as never);
    await UserModel.create(["site-b", "designer-b", "legacy-pm"].map(id => ({ _id: id, name: id,
      email: `${id}@example.test`, emailNormalized: `${id}@example.test`, passwordHash: "fixture", active: true,
      role: id === "site-b" ? "site_manager" : id === "designer-b" ? "designer" : "program_manager" })));
    await ProjectWorkflowTaskModel.create({ _id: "site-task-b", dedupeKey: "estimate-b:site", projectId: "project-b",
      estimateId: "estimate-b", designPlanVersion: 1, kind: "site_execution", title: "Other site",
      assigneeRole: "site_manager", assigneeUserId: "site-b", openedAt: at });
    const sourceAward = (await ProcurementBasketAwardModel.findById(award.id).lean())!;
    const sourceProposal = (await ProcurementBasketAwardRevisionModel.findById(submitted.proposalRevisionId).lean())!;
    const sourceBoq = (await ProcurementBasketBoqRevisionModel.findById(sourceProposal.boqRevisionId).lean())!;
    await ProcurementBasketBoqRevisionModel.collection.insertOne({ ...sourceBoq, _id: "other-boq", enquiryId: "other-enquiry",
      projectId: "project-b", estimateSource: { ...sourceBoq.estimateSource, estimateId: "estimate-b" } });
    // These earlier proposals still name A after B became the current project approver.
    await ProcurementBasketAwardRevisionModel.collection.insertMany(Array.from({ length: 101 }, (_, index) => ({
      ...sourceProposal, _id: `other-proposal-${index}`, awardId: `other-award-${index}`, projectId: "project-b", boqRevisionId: "other-boq"
    })));
    await ProcurementBasketAwardModel.collection.insertMany(Array.from({ length: 101 }, (_, index) => ({
      ...sourceAward, _id: `other-award-${index}`, projectId: "project-b", enquiryId: `other-enquiry-${index}`,
      currentProposalRevisionId: `other-proposal-${index}`, updatedAt: new Date(at.getTime() - 1_000)
    })));
    for (const actor of [{ id: "site-manager", role: "site_manager" }, { id: "designer", role: "designer" }]) {
      expect((await awards.approvalQueue(actor as PublicUser)).map(row => row.awardId)).toEqual([award.id]);
      expect((await awards.approvalDetail(actor as PublicUser, award.id)).id).toBe(award.id);
    }
    for (const actor of [{ id: "site-b", role: "site_manager", slot: "program_manager" },
      { id: "designer-b", role: "designer", slot: "designer" }, { id: "legacy-pm", role: "program_manager", slot: "program_manager" }]) {
      expect((await awards.approvalQueue(actor as PublicUser)).some(row => row.awardId === award.id)).toBe(false);
      await expect(awards.approvalDetail(actor as PublicUser, award.id)).rejects.toMatchObject({ status: 403 });
      await expect(awards.decide(actor as PublicUser, award.id, { expectedVersion: submitted.version,
        proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: `forbidden-${actor.id}`,
        slot: actor.slot as "program_manager" | "designer", decision: "approve", reason: null })).rejects.toMatchObject({ status: 403 });
    }
  });

  it("requires revision after Designer reassignment and resolves omitted update input from the current project", async () => {
    const { enquiry, bid, award } = await assignedAwardDraft();
    await UserModel.create({ _id: "new-designer", name: "New Designer", email: "new-designer@example.test",
      emailNormalized: "new-designer@example.test", passwordHash: "fixture", role: "designer", active: true });
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { assignedDesignerIds: ["new-designer"] } });
    await expect(awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "stale-design-submit" })).rejects.toMatchObject({ code: "PROCUREMENT_BASKET_PROPOSAL_STALE" });
    await expect(awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id, {
      expectedVersion: award.version, idempotencyKey: "stale-design-update", bidId: bid.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: fullReviewers, designerId: "designer"
    })).rejects.toMatchObject({ code: "PROCUREMENT_BASKET_DESIGNER_NOT_ASSIGNED" });
    const revised = await awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id, {
      expectedVersion: award.version, idempotencyKey: "current-design-update", bidId: bid.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: fullReviewers
    });
    expect(revised.proposal.designerId).toBe("new-designer");
    expect((await ProcurementBasketAwardRevisionModel.findById(award.proposalRevisionId).lean())!.designerId).toBe("designer");
  });

  it("invites both prior bidders to update the same two-line BOQ without replacing their bids", async () => {
    const secondLine = { ...firstLine, sourceLineItemKey: "line-b", source: "legacy" as const,
      roomId: "room-b", roomName: "Hall", mainLineId: "main-b", mainLineName: "Cove in Gypsum",
      approvedQuantity: "3", approvedAmountPaise: 6_500_000 };
    basket.lines = [firstLine, secondLine];
    basket.includedLineCount = 2;
    basket.readyLineCount = 2;
    const created = await enquiries.create(buyer, "project-a", "basket-a", {
      ...boqInput, lines: [{ sourceLineItemKey: "line-a" }, { sourceLineItemKey: "line-b" }] });
    const sentEnquiry = await enquiries.dispatch(buyer, "project-a", "basket-a", created.id,
      { expectedVersion: created.version, expectedPreparationDigest: digest,
        idempotencyKey: "two-line-dispatch", vendorIds: ["vendor-a", "vendor-b"] });
    const firstBoqId = sentEnquiry.boqRevisionId!;
    const firstDigest = sentEnquiry.boqDigest!;
    const originalTokens = [...sent];
    for (const [index, vendorId] of ["vendor-a", "vendor-b"].entries()) {
      const token = originalTokens.find(item => item.recipient.email === `${vendorId}@example.test`)!.rawToken;
      const publicBoq = await enquiries.inspectVendorBoq(token);
      expect(publicBoq.lines.map(line => line.description)).toEqual(["Two coats of interior paint", "Cove in Gypsum"]);
      await enquiries.submitVendorBid({ token, idempotencyKey: `bid-${vendorId}-original`,
        lines: publicBoq.lines.map((line, lineIndex) => ({ boqLineId: line.id,
          unitPricePaise: 10_000 + index * 3_000 + lineIndex * 2_000, gstBasisPoints: 0 })) });
    }
    const selection = { kind: "vendors" as const, vendorIds: ["vendor-a", "vendor-b"] };
    const input = { expectedVersion: sentEnquiry.version, boqRevisionId: firstBoqId,
      boqDigest: firstDigest, selection };
    const preview = await enquiries.previewInvitationBatch(buyer, "project-a", "basket-a", created.id, input);
    expect(preview).toMatchObject({ selectedCount: 2, requiresReason: true,
      actions: [{ vendorId: "vendor-a", action: "updated_bid_request", invitationStatus: "consumed" },
        { vendorId: "vendor-b", action: "updated_bid_request", invitationStatus: "consumed" }] });
    await expect(enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", created.id,
      { ...input, idempotencyKey: "two-line-batch" })).rejects.toMatchObject({
        code: "PROCUREMENT_BASKET_COUNTEROFFER_REASON_REQUIRED" });
    const submitted = await enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", created.id,
      { ...input, idempotencyKey: "two-line-batch", counterofferReason: "Please refresh both quoted lines." });
    expect(submitted.results.map(item => [item.action, item.status])).toEqual([
      ["updated_bid_request", "sent"], ["updated_bid_request", "sent"]]);
    expect(submitted.enquiry).toMatchObject({ boqRevisionId: firstBoqId, boqDigest: firstDigest, bidCount: 2 });
    expect(await ProcurementBasketBidModel.countDocuments({ enquiryId: created.id })).toBe(2);
    expect(await ProcurementBasketCounterofferModel.countDocuments({ enquiryId: created.id })).toBe(2);
    expect(await ProcurementBasketBoqRevisionModel.countDocuments({ enquiryId: created.id })).toBe(1);
    const replay = await enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", created.id,
      { ...input, idempotencyKey: "two-line-batch", counterofferReason: "Please refresh both quoted lines." });
    expect(replay.results).toEqual(submitted.results);
    expect(sent).toHaveLength(4);
    await ProcurementBasketInvitationModel.updateOne({ _id: submitted.results[0]!.invitationId },
      { $set: { status: "failed", sentAt: null } });
    const failedCounterofferPreview = await enquiries.previewInvitationBatch(buyer,
      "project-a", "basket-a", created.id, { expectedVersion: submitted.enquiry.version,
        boqRevisionId: firstBoqId, boqDigest: firstDigest,
        selection: { kind: "vendors", vendorIds: ["vendor-a"] } });
    expect(failedCounterofferPreview).toMatchObject({ requiresReason: true,
      actions: [{ vendorId: "vendor-a", action: "updated_bid_request", invitationStatus: "failed" }] });
    await expect(enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", created.id,
      { ...input, idempotencyKey: "two-line-batch", counterofferReason: "A different reason is supplied." }))
      .rejects.toMatchObject({ code: "PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT" });
  });

  it("handles active, new, and failed deliveries in a sent batch with truthful replay", async () => {
    const current = await sentEnquiry(["vendor-a"]);
    const vendorTemplate = await AiEstimatorKnowledgeVendorModel.collection.findOne({ _id: "vendor-b" });
    if (!vendorTemplate) throw new Error("Vendor fixture is unavailable.");
    await AiEstimatorKnowledgeVendorModel.collection.insertOne({ ...vendorTemplate, _id: "vendor-c",
      name: "Vendor C", nameNormalized: "vendor c", code: "VENDOR-C", codeNormalized: "vendor-c",
      procurementProfile: { ...vendorTemplate.procurementProfile, email: "vendor-c@example.test" } });
    const partial = createProcurementBasketEnquiryService({ audit,
      mailer: { deliveryKind: "local_test", sendRequest: async message => {
        if (message.vendorId === "vendor-c") throw new Error("delivery failed");
      } }, now: () => at });
    const input = { expectedVersion: current.version, boqRevisionId: current.boqRevisionId!,
      boqDigest: current.boqDigest!, selection: { kind: "vendors" as const,
        vendorIds: ["vendor-a", "vendor-b", "vendor-c"] }, idempotencyKey: "mixed-batch-key" };
    const preview = await partial.previewInvitationBatch(buyer, "project-a", "basket-a", current.id, input);
    expect(preview.actions.map(item => item.action)).toEqual(["already_invited", "first_invitation", "first_invitation"]);
    const result = await partial.submitInvitationBatch(buyer, "project-a", "basket-a", current.id, input);
    expect(result.results.map(item => [item.vendorId, item.status])).toEqual([
      ["vendor-a", "already_invited"], ["vendor-b", "sent"], ["vendor-c", "failed"]]);
    expect((await partial.submitInvitationBatch(buyer, "project-a", "basket-a", current.id, input)).results)
      .toEqual(result.results);
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: current.id })).toBe(3);
    expect(await ProcurementBasketInvitationBatchModel.countDocuments({ enquiryId: current.id })).toBe(1);
    const retry = await enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", current.id,
      { expectedVersion: result.enquiry.version, boqRevisionId: current.boqRevisionId!,
        boqDigest: current.boqDigest!, selection: { kind: "vendors", vendorIds: ["vendor-c"] },
        idempotencyKey: "retry-batch-key" });
    expect(retry.results).toMatchObject([{ vendorId: "vendor-c", action: "retry", status: "sent" }]);
    expect(retry.enquiry.invitations.filter(item => item.vendorId === "vendor-c")
      .map(item => [item.generation, item.status])).toEqual([[2, "sent"], [1, "failed"]]);
  });

  it("rejects stale scope, changed eligibility, and award-pending sent batches without writes", async () => {
    const current = await sentEnquiry(["vendor-a"]);
    const input = { expectedVersion: current.version, boqRevisionId: current.boqRevisionId!,
      boqDigest: current.boqDigest!, selection: { kind: "vendors" as const, vendorIds: ["vendor-b"] },
      idempotencyKey: "guarded-batch-key" };
    firstLine.approvedAmountPaise = 10_000_001;
    await expect(enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", current.id, input))
      .rejects.toMatchObject({ code: "PROCUREMENT_BASKET_SOURCE_CHANGED" });
    firstLine.approvedAmountPaise = 10_000_000;
    vi.mocked(assertBasketVendorEligible).mockRejectedValueOnce(new ApiError(409,
      "PROCUREMENT_VENDOR_NOT_ELIGIBLE", "Vendor not eligible."));
    await expect(enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", current.id, input))
      .rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_NOT_ELIGIBLE" });
    expect(await ProcurementBasketInvitationBatchModel.countDocuments({ enquiryId: current.id })).toBe(0);
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: current.id })).toBe(1);
    await ProcurementBasketEnquiryModel.updateOne({ _id: current.id }, { $set: { status: "award_pending" } });
    await expect(enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", current.id, input))
      .rejects.toMatchObject({ code: "PROCUREMENT_BASKET_VERSION_CONFLICT" });
    expect(await ProcurementBasketInvitationBatchModel.countDocuments({ enquiryId: current.id })).toBe(0);
  });

  it("names an unready second approved line and blocks a new sent invitation", async () => {
    const secondLine = { ...firstLine, sourceLineItemKey: "line-b", source: "legacy" as const,
      roomId: "room-b", roomName: "Hall", mainLineId: "main-b", mainLineName: "Cove in Gypsum",
      approvedQuantity: "3", approvedAmountPaise: 6_500_000 };
    basket.lines = [firstLine, secondLine];
    basket.includedLineCount = 2;
    basket.readyLineCount = 2;
    const draft = await enquiries.create(buyer, "project-a", "basket-a", {
      ...boqInput, lines: [{ sourceLineItemKey: "line-a" }, { sourceLineItemKey: "line-b" }] });
    const sentEnquiry = await enquiries.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "ready-two-line-send", vendorIds: ["vendor-a"] });
    secondLine.mode = { ...manualMode!, state: "unavailable", preview: null } as ProcurementBasketDetailDto["lines"][number]["mode"];
    basket.boqReady = false;
    basket.readyLineCount = 1;
    const input = { expectedVersion: sentEnquiry.version, boqRevisionId: sentEnquiry.boqRevisionId!,
      boqDigest: sentEnquiry.boqDigest!, selection: { kind: "vendors" as const, vendorIds: ["vendor-b"] },
      idempotencyKey: "unready-line-batch" };
    const preview = await enquiries.previewInvitationBatch(buyer, "project-a", "basket-a", draft.id, input);
    expect(preview.actions).toMatchObject([{ vendorId: "vendor-b", action: "first_invitation" }]);
    await expect(enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", draft.id, input))
      .rejects.toMatchObject({ code: "PROCUREMENT_BASKET_MODE_REQUIRED",
        message: expect.stringContaining("Cove in Gypsum") });
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: draft.id })).toBe(1);
  });

  it("blocks legacy resend and counteroffer when a second included line loses readiness", async () => {
    const secondLine = { ...firstLine, sourceLineItemKey: "line-b", source: "legacy" as const,
      roomId: "room-b", roomName: "Hall", mainLineId: "main-b", mainLineName: "Cove in Gypsum",
      approvedQuantity: "3", approvedAmountPaise: 6_500_000 };
    basket.lines = [firstLine, secondLine];
    basket.includedLineCount = 2;
    basket.readyLineCount = 2;
    const draft = await enquiries.create(buyer, "project-a", "basket-a", {
      ...boqInput, lines: [{ sourceLineItemKey: "line-a" }, { sourceLineItemKey: "line-b" }] });
    const current = await enquiries.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "legacy-ready-send", vendorIds: ["vendor-a", "vendor-b"] });
    const tokenA = sent.find(item => item.recipient.email === "vendor-a@example.test")!.rawToken;
    const publicBoq = await enquiries.inspectVendorBoq(tokenA);
    await enquiries.submitVendorBid({ token: tokenA, idempotencyKey: "legacy-ready-bid",
      lines: publicBoq.lines.map(line => ({ boqLineId: line.id,
        unitPricePaise: 10_000, gstBasisPoints: 0 })) });
    await ProcurementBasketInvitationModel.updateOne({ enquiryId: current.id, vendorId: "vendor-b" },
      { $set: { status: "failed", sentAt: null } });
    secondLine.mode = { ...manualMode!, state: "unavailable", preview: null } as ProcurementBasketDetailDto["lines"][number]["mode"];
    basket.boqReady = false;
    basket.readyLineCount = 1;
    vi.mocked(audit.appendInMongoTransaction).mockClear();
    mailer.sendRequest.mockClear();
    const beforeInvitations = await ProcurementBasketInvitationModel.countDocuments({ enquiryId: current.id });
    await expect(enquiries.resendInvitation(buyer, "project-a", "basket-a", current.id,
      { expectedVersion: current.version, vendorId: "vendor-b", idempotencyKey: "legacy-unready-resend" }))
      .rejects.toMatchObject({ code: "PROCUREMENT_BASKET_MODE_REQUIRED",
        message: expect.stringContaining("Cove in Gypsum") });
    await expect(enquiries.requestCounteroffer(buyer, "project-a", "basket-a", current.id,
      { expectedVersion: current.version, vendorId: "vendor-a", idempotencyKey: "legacy-unready-offer",
        reason: "Please refresh your earlier bid." }))
      .rejects.toMatchObject({ code: "PROCUREMENT_BASKET_MODE_REQUIRED",
        message: expect.stringContaining("Cove in Gypsum") });
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: current.id })).toBe(beforeInvitations);
    expect(await ProcurementBasketCounterofferModel.countDocuments({ enquiryId: current.id })).toBe(0);
    expect((await ProcurementBasketEnquiryModel.findById(current.id).lean())?.version).toBe(current.version);
    expect(audit.appendInMongoTransaction).not.toHaveBeenCalled();
    expect(mailer.sendRequest).not.toHaveBeenCalled();
  });

  it("fences Configuration UOM writes through a new sent-vendor invitation", async () => {
    const current = await sentEnquiry(["vendor-a"]);
    let enteredFencedRead!: () => void;
    const fencedRead = new Promise<void>(resolve => { enteredFencedRead = resolve; });
    let resumeFencedRead!: () => void;
    const resume = new Promise<void>(resolve => { resumeFencedRead = resolve; });
    vi.mocked(preparedBaskets)
      .mockImplementationOnce(async () => [structuredClone(basket)])
      .mockImplementationOnce(async () => {
        enteredFencedRead();
        await resume;
        return [structuredClone(basket)];
      });
    const sending = enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", current.id,
      { expectedVersion: current.version, boqRevisionId: current.boqRevisionId!,
        boqDigest: current.boqDigest!, selection: { kind: "vendors", vendorIds: ["vendor-b"] },
        idempotencyKey: "sent-config-fence-key" });
    await fencedRead;
    const configWrite = mongoose.connection.transaction(async session => {
      await AiEstimatorKnowledgeUomModel.updateOne({ _id: "uom-a" },
        { $set: { name: "Renamed square foot", nameNormalized: "renamed square foot" },
          $inc: { version: 1 } }, { session });
    }).then(() => "committed" as const, () => "conflicted" as const);
    const beforeSending = await Promise.race([configWrite,
      new Promise<"pending">(resolve => setTimeout(() => resolve("pending"), 100))]);
    resumeFencedRead();
    const result = await sending;
    const configOutcome = await configWrite;
    expect(beforeSending).not.toBe("committed");
    expect(result.results).toMatchObject([{ vendorId: "vendor-b", status: "sent" }]);
    expect(["committed", "conflicted"]).toContain(configOutcome);
  });

  it("preflights actionable sent batches but allows a durable all-no-op batch without mail", async () => {
    const current = await sentEnquiry(["vendor-a"]);
    const disabled = createProcurementBasketEnquiryService({ audit,
      mailer: { deliveryKind: "disabled" }, now: () => at });
    const common = { expectedVersion: current.version, boqRevisionId: current.boqRevisionId!,
      boqDigest: current.boqDigest! };
    vi.mocked(audit.appendInMongoTransaction).mockClear();
    await expect(disabled.submitInvitationBatch(buyer, "project-a", "basket-a", current.id,
      { ...common, selection: { kind: "vendors", vendorIds: ["vendor-b"] },
        idempotencyKey: "disabled-batch" })).rejects.toMatchObject({ status: 503 });
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: current.id })).toBe(1);
    expect(await ProcurementBasketInvitationBatchModel.countDocuments({ enquiryId: current.id })).toBe(0);
    expect(audit.appendInMongoTransaction).not.toHaveBeenCalled();
    const noOp = await disabled.submitInvitationBatch(buyer, "project-a", "basket-a", current.id,
      { ...common, selection: { kind: "vendors", vendorIds: ["vendor-a"] },
        idempotencyKey: "noop-batch-key" });
    expect(noOp.results).toMatchObject([{ vendorId: "vendor-a", action: "already_invited",
      status: "already_invited", invitationId: null }]);
    expect(await ProcurementBasketInvitationBatchModel.countDocuments({ enquiryId: current.id })).toBe(1);
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: current.id })).toBe(1);
    expect(audit.appendInMongoTransaction).not.toHaveBeenCalled();
  });

  it("dispatches every eligible vendor beyond the picker page and rejects overlapping sent batches", async () => {
    const sixty = Array.from({ length: 60 }, (_, index) => {
      const vendorId = `batch-vendor-${String(index).padStart(2, "0")}`;
      return { vendorId, code: vendorId, name: vendorId, contactEmail: `${vendorId}@example.test`,
        kpiScoreBps: 8_000, city: null, cityVersion: 0, cityMatch: "unknown" as const,
        eligible: true, blockers: [] };
    });
    vi.mocked(eligibleBasketVendors).mockResolvedValueOnce(sixty);
    const draft = await enquiries.create(buyer, "project-a", "basket-a", boqInput);
    const all = await enquiries.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "all-eligible-dispatch", selection: { kind: "all_eligible" } });
    expect(all.invitations).toHaveLength(60);
    expect(sent).toHaveLength(60);
    vi.mocked(eligibleBasketVendors).mockResolvedValueOnce(sixty).mockResolvedValueOnce(sixty);
    const allInput = { expectedVersion: all.version, boqRevisionId: all.boqRevisionId!,
      boqDigest: all.boqDigest!, selection: { kind: "all_eligible" as const } };
    const preview = await enquiries.previewInvitationBatch(buyer, "project-a", "basket-a", all.id, allInput);
    expect(preview).toMatchObject({ selectedCount: 60, requiresReason: false });
    expect(preview.actions.every(item => item.action === "already_invited")).toBe(true);
    const noOp = await enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", all.id,
      { ...allInput, idempotencyKey: "all-eligible-noop" });
    expect(noOp.results).toHaveLength(60);
    expect(sent).toHaveLength(60);
    const raceSelection = { kind: "vendors" as const, vendorIds: ["vendor-a"] };
    const raceBase = { expectedVersion: noOp.enquiry.version, boqRevisionId: all.boqRevisionId!,
      boqDigest: all.boqDigest!, selection: raceSelection };
    const races = await Promise.allSettled([
      enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", all.id,
        { ...raceBase, idempotencyKey: "race-batch-one" }),
      enquiries.submitInvitationBatch(buyer, "project-a", "basket-a", all.id,
        { ...raceBase, idempotencyKey: "race-batch-two" })
    ]);
    expect(races.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(races.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("derives a terms-free BOQ from the complete approved line set and rejects client price or description edits", async () => {
    await expect(enquiries.create(buyer, "project-a", "basket-a", { ...boqInput,
      idempotencyKey: "tampered-boq-description", lines: [{ sourceLineItemKey: "line-a", description: "Changed by browser" }] }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_SOURCE_CHANGED" });
    await expect(enquiries.create(buyer, "project-a", "basket-a", { ...boqInput,
      idempotencyKey: "tampered-boq-quantity", lines: [{ sourceLineItemKey: "line-a", quantityMilliUnits: 1_000 }] }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_SOURCE_CHANGED" });
    const created = await enquiries.create(buyer, "project-a", "basket-a", boqInput);
    expect(created.lines[0]).toMatchObject({ description: "Two coats of interior paint",
      quantityMilliUnits: 10_000, uomCode: "SQFT", approvedQuoteAmountPaise: 10_000_000 });
    expect(created.lines[0]).not.toHaveProperty("scopeType");
    const sentEnquiry = await enquiries.dispatch(buyer, "project-a", "basket-a", created.id,
      { expectedVersion: created.version, expectedPreparationDigest: digest,
        idempotencyKey: "derived-boq-dispatch", vendorIds: ["vendor-a"] });
    const publicBoq = await enquiries.inspectVendorBoq(sent[0]!.rawToken);
    expect(publicBoq.lines[0]).toMatchObject({ description: "Two coats of interior paint",
      quantityMilliUnits: 10_000, approvedQuoteAmountPaise: 10_000_000 });
    expect(publicBoq.lines[0]).not.toHaveProperty("scopeType");
    expect(publicBoq.lines[0]).not.toHaveProperty("targetDate");
    expect(publicBoq.lines[0]).not.toHaveProperty("deliveryLocation");
    expect(sentEnquiry.status).toBe("sent");
  });

  it("prepares a private WhatsApp link without sending it or invalidating email", async () => {
    const enquiry = await sentEnquiry();
    const unavailable = await enquiries.whatsAppShareIntent(buyer, "project-a", "basket-a", enquiry.id, "vendor-b");
    expect(unavailable).toEqual({ available: false, shareUrl: null,
      blocker: "This vendor has no usable WhatsApp phone number.", expiresAt: null });
    expect(await ProcurementBasketWhatsAppAccessModel.countDocuments()).toBe(0);
    const ready = await enquiries.whatsAppShareIntent(buyer, "project-a", "basket-a", enquiry.id, "vendor-a");
    expect(ready).toMatchObject({ available: true, blocker: null,
      expiresAt: new Date(at.getTime() + 24 * 60 * 60 * 1_000).toISOString() });
    const share = new URL(ready.shareUrl!);
    expect(share.origin).toBe("https://wa.me");
    expect(share.pathname).toBe("/919876543210");
    const message = share.searchParams.get("text")!;
    const publicUrl = new URL(message.slice(message.indexOf("http")));
    const whatsAppToken = new URLSearchParams(publicUrl.hash.slice(1)).get("token")!;
    expect(whatsAppToken).toHaveLength(43);
    expect(whatsAppToken).not.toBe(sent[0]!.rawToken);
    expect(await ProcurementBasketWhatsAppAccessModel.findOne({ tokenHash: whatsAppToken }).lean()).toBeNull();
    expect((await enquiries.inspectVendorBoq(whatsAppToken)).lines)
      .toEqual((await enquiries.inspectVendorBoq(sent[0]!.rawToken)).lines);
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-a" },
      { $set: { "procurementProfile.phoneNumber": "9765432100" } });
    await expect(enquiries.inspectVendorBoq(whatsAppToken)).rejects.toMatchObject({ status: 410 });
    expect((await enquiries.inspectVendorBoq(sent[0]!.rawToken)).lines).toHaveLength(1);
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-a" },
      { $set: { "procurementProfile.phoneNumber": "9876543210" } });
    const nextDay = createProcurementBasketEnquiryService({ audit, mailer,
      now: () => new Date(at.getTime() + 24 * 60 * 60 * 1_000 + 1) });
    await expect(nextDay.inspectVendorBoq(whatsAppToken)).rejects.toMatchObject({ status: 410 });
    expect((await nextDay.inspectVendorBoq(sent[0]!.rawToken)).lines).toHaveLength(1);
    const bidLines = [{ boqLineId: (await enquiries.inspectVendorBoq(whatsAppToken)).lines[0]!.id,
      unitPricePaise: 100_000, gstBasisPoints: 1_800 }];
    const receipt = await enquiries.submitVendorBid({ token: whatsAppToken,
      idempotencyKey: "whatsapp-bid-one", lines: bidLines });
    expect(await enquiries.submitVendorBid({ token: whatsAppToken,
      idempotencyKey: "whatsapp-bid-one", lines: bidLines })).toEqual(receipt);
    await expect(enquiries.inspectVendorBoq(sent[0]!.rawToken)).rejects.toMatchObject({ status: 410 });
    await expect(enquiries.submitVendorBid({ token: sent[0]!.rawToken,
      idempotencyKey: "email-second-bid", lines: bidLines })).rejects.toMatchObject({ status: 410 });
    expect((await enquiries.inspectVendorBoq(sent[1]!.rawToken)).lines).toHaveLength(1);
    expect(await ProcurementBasketBidModel.countDocuments({ enquiryId: enquiry.id, vendorId: "vendor-a" })).toBe(1);
    const auditEvents = vi.mocked(audit.appendInMongoTransaction).mock.calls
      .map(([event]) => event).filter(event => event.action === "procurement_basket_invitation_whatsapp_share_intent");
    expect(auditEvents).toMatchObject([{ newValues: { channel: "whatsapp", delivery: "not_sent", vendorId: "vendor-a" } }]);
    expect(JSON.stringify(auditEvents)).not.toContain(whatsAppToken);
  });

  it("creates, updates and sends an automatic Standard BOQ from observed saved Configuration", async () => {
    useObservedStandardCost();
    const created = await enquiries.create(buyer, "project-a", "basket-a", boqInput);
    firstLine.mainLineName = "Updated POP scope";
    const updated = await enquiries.update(buyer, "project-a", "basket-a", created.id, {
      ...boqInput, expectedVersion: created.version, idempotencyKey: "standard-boq-update",
      lines: [{ sourceLineItemKey: "line-a" }] });
    const mainLineBefore = await AiEstimatorKnowledgeMainLineModel.findById("main-a").lean();
    const dispatched = await enquiries.dispatch(buyer, "project-a", "basket-a", created.id, {
      expectedVersion: updated.version, expectedPreparationDigest: digest,
      idempotencyKey: "standard-boq-send", vendorIds: ["vendor-a"] });
    expect(dispatched.status).toBe("sent");
    const mainLineAfter = await AiEstimatorKnowledgeMainLineModel.findById("main-a").lean();
    expect(mainLineAfter).toMatchObject({ version: 1, dependencyEpoch: 1 });
    expect(mainLineAfter?.updatedAt).toEqual(mainLineBefore?.updatedAt);
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-a").lean()).toMatchObject({ version: 1, dependencyEpoch: 1 });
    expect(await AiEstimatorKnowledgeSubBasketModel.findById("sub-a").lean()).toMatchObject({ version: 1, dependencyEpoch: 1 });
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-a").lean()).toMatchObject({ version: 1, dependencyEpoch: 1 });
    const vendorBoq = await enquiries.inspectVendorBoq(sent[0]!.rawToken);
    expect(vendorBoq.lines[0]).toMatchObject({ description: "Updated POP scope", uomCode: "SQFT",
      approvedQuantity: "10", approvedQuoteAmountPaise: 10_000_000 });
    expect(vendorBoq.lines[0]).not.toHaveProperty("baseCostPaise");
    expect(vendorBoq.lines[0]).not.toHaveProperty("adjustedCostPaise");
  });
  it("freezes each approved quote amount on the sent BOQ without exposing internal cost", async () => {
    const secondLine = { ...firstLine, sourceLineItemKey: "line-b", roomId: "room-b", roomName: "Kitchen",
      mainLineName: "Primer coat", approvedQuantity: "3", approvedAmountPaise: 1_234_567 };
    basket.lines = [firstLine, secondLine];
    basket.includedLineCount = 2;
    basket.readyLineCount = 2;
    basket.approvedEstimatePaise = 11_234_567;
    try {
      const created = await enquiries.create(buyer, "project-a", "basket-a", { ...boqInput,
        lines: [...boqInput.lines, { sourceLineItemKey: "line-b" }] });
      const dispatched = await enquiries.dispatch(buyer, "project-a", "basket-a", created.id, {
        expectedVersion: created.version, expectedPreparationDigest: digest,
        idempotencyKey: "dispatch-quoted-lines", vendorIds: ["vendor-a", "vendor-b"] });
      expect(dispatched.lines.map(line => [line.sourceLineItemKey, line.approvedQuoteAmountPaise]))
        .toEqual([["line-a", 10_000_000], ["line-b", 1_234_567]]);
      const forA = await enquiries.inspectVendorBoq(sent[0]!.rawToken);
      const forB = await enquiries.inspectVendorBoq(sent[1]!.rawToken);
      expect(forA.lines.map(line => [line.description, line.approvedQuantity, line.approvedQuoteAmountPaise]))
        .toEqual([["Two coats of interior paint", "10", 10_000_000], ["Primer coat", "3", 1_234_567]]);
      expect(forB.lines).toEqual(forA.lines);
      expect(JSON.stringify(forA)).not.toMatch(/baseCost|adjustedCost|workingTotal|kpi|vendorId|otherVendor/iu);
      secondLine.approvedAmountPaise = 9_999_999;
      await expect(enquiries.inspectVendorBoq(sent[0]!.rawToken)).rejects.toMatchObject({ status: 410 });
      expect(await ProcurementBasketBoqRevisionModel.findById(dispatched.boqRevisionId).lean()).toMatchObject({
        lines: [{ approvedQuoteAmountPaise: 10_000_000 }, { approvedQuoteAmountPaise: 1_234_567 }] });
    } finally {
      basket.lines = [firstLine];
      basket.includedLineCount = 1;
      basket.readyLineCount = 1;
      basket.approvedEstimatePaise = 10_000_000;
    }
  });
  it("rejects a BOQ that omits an included approved line at create or dispatch", async () => {
    const secondLine = { ...firstLine, sourceLineItemKey: "line-b", roomId: "room-b", roomName: "Kitchen" };
    basket.lines = [firstLine, secondLine];
    basket.includedLineCount = 2;
    basket.readyLineCount = 2;
    try {
      await expect(enquiries.create(buyer, "project-a", "basket-a", { ...boqInput,
        idempotencyKey: "partial-basket-create" })).rejects.toMatchObject({
        status: 409, code: "PROCUREMENT_BASKET_LINE_SCOPE_INCOMPLETE" });
      basket.lines = [firstLine];
      basket.includedLineCount = 1;
      basket.readyLineCount = 1;
      const draft = await enquiries.create(buyer, "project-a", "basket-a", boqInput);
      basket.lines = [firstLine, secondLine];
      basket.includedLineCount = 2;
      basket.readyLineCount = 2;
      await expect(enquiries.dispatch(buyer, "project-a", "basket-a", draft.id, {
        expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "partial-basket-dispatch", vendorIds: ["vendor-a"] })).rejects.toMatchObject({
        status: 409, code: "PROCUREMENT_BASKET_LINE_SCOPE_INCOMPLETE" });
      expect(await ProcurementBasketBoqRevisionModel.countDocuments({ enquiryId: draft.id })).toBe(0);
      expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: draft.id })).toBe(0);
    } finally {
      basket.lines = [firstLine];
      basket.includedLineCount = 1;
      basket.readyLineCount = 1;
    }
  });
  it("shows no quoted amount for an older BOQ revision instead of reading a newer estimate", async () => {
    const dispatched = await sentEnquiry(["vendor-a"]);
    await ProcurementBasketBoqRevisionModel.collection.updateOne({ _id: dispatched.boqRevisionId! },
      { $unset: { "lines.0.approvedQuoteAmountPaise": "" } });
    const originalAmount = firstLine.approvedAmountPaise;
    firstLine.approvedAmountPaise = 5_555_555;
    try {
      const publicBoq = await enquiries.inspectVendorBoq(sent[0]!.rawToken);
      expect(publicBoq.lines[0]).toMatchObject({ approvedQuantity: "10", approvedQuoteAmountPaise: null });
      const buyerBoq = await enquiries.get(buyer, "project-a", "basket-a", dispatched.id);
      expect(buyerBoq.lines[0]?.approvedQuoteAmountPaise).toBeNull();
    } finally {
      firstLine.approvedAmountPaise = originalAmount;
    }
  });
  it("shows the approved unit separately from the BOQ unit, including a legacy missing unit", async () => {
    const originalUnit = firstLine.approvedUnit;
    firstLine.approvedUnit = "Rft";
    try {
      const enquiry = await sentEnquiry(["vendor-a"]);
      const token = sent[0]!.rawToken;
      const current = await enquiries.inspectVendorBoq(token);
      expect(current.lines[0]).toMatchObject({ approvedQuantity: "10", approvedUnit: "Rft", uomCode: "SQFT" });
      await ProcurementBasketBoqRevisionModel.collection.updateOne({ _id: enquiry.boqRevisionId! },
        { $unset: { "lines.0.approvedUnit": "" } });
      const legacy = await enquiries.inspectVendorBoq(token);
      expect(legacy.lines[0]).toMatchObject({ approvedUnit: null, uomCode: "SQFT" });
    } finally {
      firstLine.approvedUnit = originalUnit;
    }
  });
  it("serializes a Configuration UOM rename behind BOQ dispatch", async () => {
    const created = await enquiries.create(buyer, "project-a", "basket-a", boqInput);
    let enterBasketRead!: () => void;
    const basketRead = new Promise<void>(resolve => { enterBasketRead = resolve; });
    let resumeBasketRead!: () => void;
    const resume = new Promise<void>(resolve => { resumeBasketRead = resolve; });
    vi.mocked(preparedBaskets).mockImplementationOnce(async () => {
      const snapshot = structuredClone(basket);
      enterBasketRead();
      await resume;
      return [snapshot];
    });
    const sending = enquiries.dispatch(buyer, "project-a", "basket-a", created.id, {
      expectedVersion: created.version, expectedPreparationDigest: digest,
      idempotencyKey: "dispatch-config-fence-001", vendorIds: ["vendor-a"] });
    await basketRead;
    const configWrite = mongoose.connection.transaction(async session => {
      await AiEstimatorKnowledgeUomModel.updateOne({ _id: "uom-a" },
        { $set: { name: "Renamed square foot", nameNormalized: "renamed square foot" },
          $inc: { version: 1 } }, { session });
    }).then(() => "committed" as const, () => "conflicted" as const);
    const beforeDispatch = await Promise.race([configWrite,
      new Promise<"pending">(resolve => setTimeout(() => resolve("pending"), 100))]);
    resumeBasketRead();
    const dispatched = await sending;
    const configOutcome = await configWrite;
    expect(beforeDispatch).not.toBe("committed");
    expect(dispatched.status).toBe("sent");
    expect(["committed", "conflicted"]).toContain(configOutcome);
    expect((await AiEstimatorKnowledgeUomModel.findById("uom-a").lean())?.name)
      .toBe(configOutcome === "committed" ? "Renamed square foot" : "Square foot");
    expect(await ProcurementBasketBoqRevisionModel.countDocuments({ enquiryId: created.id })).toBe(1);
    expect(sent).toHaveLength(1);
  });
  it("rejects a priced-line subset when another included Standard line cannot be priced", async () => {
    useObservedStandardCost();
    const addUnavailableLine = () => {
      basket.lines = [firstLine, { ...firstLine, sourceLineItemKey: "line-b", roomId: "room-b",
        approvedAmountPaise: 5_000_000, baseUnitRatePaise: null,
        standardCost: { state: "unavailable", mode: "sub_vendor", calculationQuantity: "10",
          baseRates: [], baseCostPaise: null, adjustedCostPaise: null,
          issues: [{ code: "CALCULATION_NOT_CONFIGURED", message: "Sub-vendor cost is unavailable." }] } }];
      basket.includedLineCount = 2;
      basket.boqReady = false;
      basket.standardCost = { totalPaise: null, complete: false, provisional: true, pricedLineCount: 1 };
    };
    addUnavailableLine();
    await expect(enquiries.create(buyer, "project-a", "basket-a", boqInput)).rejects.toMatchObject({
      status: 409, code: "PROCUREMENT_BASKET_SUB_VENDOR_COST_UNAVAILABLE" });
    expect(await ProcurementBasketEnquiryModel.countDocuments()).toBe(0);

    basket.lines = [firstLine];
    basket.includedLineCount = 1;
    basket.boqReady = true;
    basket.standardCost = { totalPaise: 600_000, complete: true, provisional: true, pricedLineCount: 1 };
    const draft = await enquiries.create(buyer, "project-a", "basket-a", boqInput);
    addUnavailableLine();
    await expect(enquiries.dispatch(buyer, "project-a", "basket-a", draft.id, {
      expectedVersion: draft.version, expectedPreparationDigest: digest,
      idempotencyKey: "mixed-standard-dispatch", vendorIds: ["vendor-a"] })).rejects.toMatchObject({
      status: 409, code: "PROCUREMENT_BASKET_SUB_VENDOR_COST_UNAVAILABLE" });
    expect(await ProcurementBasketBoqRevisionModel.countDocuments()).toBe(0);
  });
  it("permits only one active enquiry for a project basket under concurrent creates", async () => {
    const results = await Promise.allSettled([
      enquiries.create(buyer, "project-a", "basket-a", boqInput),
      enquiries.create(buyer, "project-a", "basket-a", { ...boqInput, idempotencyKey: "second-enquiry-key" })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const rejected = (results.find(result => result.status === "rejected") as PromiseRejectedResult).reason;
    if (!(rejected instanceof ApiError)) throw rejected;
    expect(rejected).toMatchObject({ status: 409 });
    expect(await ProcurementBasketEnquiryModel.countDocuments({ projectId: "project-a",
      mainBasketId: "basket-a", status: "draft" })).toBe(1);
  });

  it("sends one scoped token per vendor, records complete immutable bids and a 50/50 comparison", async () => {
    const enquiry = await sentEnquiry();
    const noBids = await awards.comparison(buyer, "project-a", "basket-a", enquiry.id);
    expect(noBids.averageBidNetPaise).toBeNull();
    expect(noBids.rows).toEqual([]);
    expect(enquiry.status).toBe("sent");
    expect(sent).toHaveLength(2);
    expect(sent[0]!.rawToken).not.toBe(sent[1]!.rawToken);
    const tokenA = sent.find(row => row.recipient.email === "vendor-a@example.test")!.rawToken;
    const tokenB = sent.find(row => row.recipient.email === "vendor-b@example.test")!.rawToken;
    const publicBoq = await enquiries.inspectVendorBoq(tokenA);
    expect(publicBoq.lines).toHaveLength(1);
    expect(JSON.stringify(publicBoq)).not.toMatch(/budget|KPI|vendorId|sellingPaise/iu);
    const boqLineId = publicBoq.lines[0]!.id;
    const bidA = await enquiries.submitVendorBid({ token: tokenA, idempotencyKey: "bid-vendor-a",
      lines: [{ boqLineId, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    expect(bidA.totals.netPaise).toBe(1_000_000);
    expect(await enquiries.submitVendorBid({ token: tokenA, idempotencyKey: "bid-vendor-a",
      lines: [{ boqLineId, unitPricePaise: 100_000, gstBasisPoints: 0 }] })).toEqual(bidA);
    await expect(enquiries.submitVendorBid({ token: tokenA, idempotencyKey: "bid-vendor-a-changed",
      lines: [{ boqLineId, unitPricePaise: 90_000, gstBasisPoints: 0 }] })).rejects.toMatchObject({ status: 410 });
    await enquiries.submitVendorBid({ token: tokenB, idempotencyKey: "bid-vendor-b",
      lines: [{ boqLineId, unitPricePaise: 110_000, gstBasisPoints: 0 }] });
    const comparison = await awards.comparison(buyer, "project-a", "basket-a", enquiry.id);
    expect(comparison.rows).toHaveLength(2);
    expect(comparison.averageBidNetPaise).toBe(1_050_000);
    expect(comparison.recommendedBidId).toBeTruthy();
    expect(comparison.rows.every(row => row.comparisonScoreBps !== null && row.lines.length === 1)).toBe(true);
    expect(comparison.rows.map(row => [row.vendorId, row.priorityRank])).toEqual([
      ["vendor-a", 2], ["vendor-b", 1]
    ]);
    vi.mocked(assertBasketVendorEligible).mockRejectedValueOnce(new Error("Vendor is no longer active."));
    const laterIneligible = await awards.comparison(buyer, "project-a", "basket-a", enquiry.id);
    expect(laterIneligible.averageBidNetPaise).toBe(1_050_000);
    expect(laterIneligible.rows.find(row => row.vendorId === "vendor-a")).toMatchObject({
      priorityRank: null, recommended: false, blockers: ["vendor_not_eligible"]
    });
    expect(await ProcurementBasketBidModel.countDocuments({ enquiryId: enquiry.id })).toBe(2);
  });

  it("excludes incomplete current bids from the average and priority list", async () => {
    const enquiry = await sentEnquiry();
    const tokenA = sent.find(row => row.recipient.email === "vendor-a@example.test")!.rawToken;
    const tokenB = sent.find(row => row.recipient.email === "vendor-b@example.test")!.rawToken;
    const boqLineId = (await enquiries.inspectVendorBoq(tokenA)).lines[0]!.id;
    await enquiries.submitVendorBid({ token: tokenA, idempotencyKey: "complete-average-a",
      lines: [{ boqLineId, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    await enquiries.submitVendorBid({ token: tokenB, idempotencyKey: "incomplete-average-b",
      lines: [{ boqLineId, unitPricePaise: 110_000, gstBasisPoints: 0 }] });
    await ProcurementBasketBidModel.updateOne({ enquiryId: enquiry.id, vendorId: "vendor-b" },
      { $set: { bidDigest: "b".repeat(64) } });
    const comparison = await awards.comparison(buyer, "project-a", "basket-a", enquiry.id);
    expect(comparison.averageBidNetPaise).toBe(1_000_000);
    expect(comparison.rows.find(row => row.vendorId === "vendor-b")).toMatchObject({
      priorityRank: null, recommended: false, blockers: ["bid_scope_incomplete"]
    });
  });

  it("keeps frozen responses readable after Configuration changes while blocking a new award", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    const boqLineId = (await enquiries.inspectVendorBoq(token)).lines[0]!.id;
    await enquiries.submitVendorBid({ token, idempotencyKey: "bid-before-config-change",
      lines: [{ boqLineId, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    basket.preparationDigest = "b".repeat(64);
    const comparison = await awards.comparison(buyer, "project-a", "basket-a", enquiry.id);
    expect(comparison.rows).toHaveLength(1);
    expect(comparison.averageBidNetPaise).toBe(1_000_000);
    await expect(awards.preview(buyer, "project-a", "basket-a", enquiry.id, {
      bidId: comparison.rows[0]!.bidId, advanceBasisPoints: 2_000
    })).rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_SOURCE_CHANGED" });
  });

  it("keeps a frozen vendor link usable after an internal-only Configuration price change", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    basket.preparationDigest = "b".repeat(64);
    firstLine.baseUnitRatePaise = 75_000;
    expect(await enquiries.get(buyer, "project-a", "basket-a", enquiry.id)).toMatchObject({
      vendorScopeCurrent: true, status: "sent" });
    const publicBoq = await enquiries.inspectVendorBoq(token);
    expect(publicBoq.lines[0]).toMatchObject({ approvedQuoteAmountPaise: 10_000_000, approvedUnit: "sq-ft" });
    await enquiries.submitVendorBid({ token, idempotencyKey: "price-only-drift-bid",
      lines: [{ boqLineId: publicBoq.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    expect((await awards.comparison(buyer, "project-a", "basket-a", enquiry.id)).rows).toHaveLength(1);
  });

  it("invalidates the frozen vendor link after approved vendor-facing amount changes", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    const originalAmount = firstLine.approvedAmountPaise;
    firstLine.approvedAmountPaise = 12_000_000;
    try {
      expect(await enquiries.get(buyer, "project-a", "basket-a", enquiry.id)).toMatchObject({
        vendorScopeCurrent: false, status: "sent" });
      await expect(enquiries.inspectVendorBoq(token)).rejects.toMatchObject({ status: 410 });
    } finally {
      firstLine.approvedAmountPaise = originalAmount;
    }
  });

  it("blocks legacy frozen BOQs whose vendor description or quantity differs from the approved source", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    const frozen = await ProcurementBasketBoqRevisionModel.findById(enquiry.boqRevisionId).lean();
    const original = frozen!.lines[0]!;
    await ProcurementBasketBoqRevisionModel.collection.updateOne({ _id: enquiry.boqRevisionId! },
      { $set: { "lines.0.description": "Client supplied text unlike approved scope" } });
    expect((await enquiries.get(buyer, "project-a", "basket-a", enquiry.id)).vendorScopeCurrent).toBe(false);
    await expect(enquiries.inspectVendorBoq(token)).rejects.toMatchObject({ status: 410 });
    await ProcurementBasketBoqRevisionModel.collection.updateOne({ _id: enquiry.boqRevisionId! },
      { $set: { "lines.0.description": original.description, "lines.0.quantityMilliUnits": 9_000 } });
    expect((await enquiries.get(buyer, "project-a", "basket-a", enquiry.id)).vendorScopeCurrent).toBe(false);
    await expect(enquiries.inspectVendorBoq(token)).rejects.toMatchObject({ status: 410 });
  });

  it("invalidates sent links when Procurement edits vendor-facing BOQ scope", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const oldToken = sent[0]!.rawToken;
    firstLine.mainLineName = "Three coats of interior paint";
    const updated = await enquiries.update(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: enquiry.version, expectedPreparationDigest: digest, idempotencyKey: "update-key-001",
        lines: [{ sourceLineItemKey: "line-a" }] });
    expect(updated.status).toBe("draft");
    await expect(enquiries.inspectVendorBoq(oldToken)).rejects.toMatchObject({ status: 410 });
    expect(await ProcurementBasketInvitationModel.findOne({ enquiryId: enquiry.id }).lean()).toMatchObject({ status: "superseded" });
  });

  it("does not mint an invitation when delivery is disabled and keeps failed delivery links unusable", async () => {
    const disabled = createProcurementBasketEnquiryService({ audit, mailer: { deliveryKind: "disabled" }, now: () => at });
    const draft = await disabled.create(buyer, "project-a", "basket-a", boqInput);
    await expect(disabled.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "disabled-send", vendorIds: ["vendor-a"] })).rejects.toMatchObject({ status: 503 });
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: draft.id })).toBe(0);
    let deliveredToken = "";
    const failed = createProcurementBasketEnquiryService({ audit,
      mailer: { deliveryKind: "local_test", sendRequest: async message => {
        deliveredToken = message.rawToken;
        throw new Error("transport unavailable");
      } }, now: () => at });
    const result = await failed.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "failed-send-key", vendorIds: ["vendor-a"] });
    expect(result.invitations).toMatchObject([{ status: "failed" }]);
    expect(result.status).toBe("draft");
    expect(result.boqRevisionId).toBeTruthy();
    expect(deliveredToken).toHaveLength(43);
    await expect(failed.inspectVendorBoq(deliveredToken)).rejects.toMatchObject({ status: 410 });
    const replay = await failed.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "failed-send-key", vendorIds: ["vendor-a"] });
    expect(replay.version).toBe(result.version);
    await expect(failed.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: result.version, expectedPreparationDigest: digest,
        idempotencyKey: "second-send-key", vendorIds: ["vendor-a"] }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_BOQ_REVISION_EXISTS" });
    expect(await ProcurementBasketBoqRevisionModel.countDocuments({ enquiryId: draft.id })).toBe(1);
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: draft.id })).toBe(1);
  });

  it("marks a partially delivered multi-vendor BOQ sent and leaves failed links unusable", async () => {
    const tokens = new Map<string, string>();
    const partial = createProcurementBasketEnquiryService({ audit,
      mailer: { deliveryKind: "local_test", sendRequest: async message => {
        tokens.set(message.recipient.email, message.rawToken);
        if (message.recipient.email === "vendor-a@example.test") throw new Error("delivery failed");
      } }, now: () => at });
    const draft = await partial.create(buyer, "project-a", "basket-a", boqInput);
    const result = await partial.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "partial-delivery-key", vendorIds: ["vendor-a", "vendor-b"] });
    expect(result.status).toBe("sent");
    expect(result.invitations.map(invitation => [invitation.vendorId, invitation.status]))
      .toEqual([["vendor-a", "failed"], ["vendor-b", "sent"]]);
    await expect(partial.inspectVendorBoq(tokens.get("vendor-a@example.test")!)).rejects.toMatchObject({ status: 410 });
    expect((await partial.inspectVendorBoq(tokens.get("vendor-b@example.test")!)).lines).toHaveLength(1);
  });

  it("keeps the BOQ draft and vendor link inactive until delivery is confirmed", async () => {
    let releaseDelivery!: () => void;
    const deliveryPaused = new Promise<void>(resolve => { releaseDelivery = resolve; });
    let deliveryStarted!: () => void;
    const enteredDelivery = new Promise<void>(resolve => { deliveryStarted = resolve; });
    let rawToken = "";
    const pending = createProcurementBasketEnquiryService({ audit,
      mailer: { deliveryKind: "local_test", sendRequest: async message => {
        rawToken = message.rawToken;
        deliveryStarted();
        await deliveryPaused;
      } }, now: () => at });
    const draft = await pending.create(buyer, "project-a", "basket-a", boqInput);
    const dispatch = pending.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "paused-delivery-key", vendorIds: ["vendor-a"] });
    await enteredDelivery;
    try {
      expect(await pending.get(buyer, "project-a", "basket-a", draft.id)).toMatchObject({
        status: "draft", invitations: [{ status: "pending" }] });
      await expect(pending.inspectVendorBoq(rawToken)).rejects.toMatchObject({ status: 410 });
    } finally {
      releaseDelivery();
      await dispatch;
    }
    const confirmed = await dispatch;
    expect(confirmed.status).toBe("sent");
    expect((await pending.inspectVendorBoq(rawToken)).lines).toHaveLength(1);
  });

  it("does not write a BOQ, invitation or audit when dispatch delivery preflight fails", async () => {
    const preflight = vi.fn(async () => { throw new Error("provider unavailable"); });
    const sendRequest = vi.fn(async () => undefined);
    const unavailable = createProcurementBasketEnquiryService({ audit,
      mailer: { deliveryKind: "local_test", preflight, sendRequest }, now: () => at });
    const draft = await unavailable.create(buyer, "project-a", "basket-a", boqInput);
    vi.mocked(audit.appendInMongoTransaction).mockClear();

    await expect(unavailable.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "preflight-unavailable-send", vendorIds: ["vendor-a"] }))
      .rejects.toMatchObject({ status: 503, code: "PROCUREMENT_BASKET_DELIVERY_UNAVAILABLE" });
    expect(preflight).toHaveBeenCalledOnce();
    expect(sendRequest).not.toHaveBeenCalled();
    expect(await ProcurementBasketBoqRevisionModel.countDocuments({ enquiryId: draft.id })).toBe(0);
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: draft.id })).toBe(0);
    expect((await enquiries.get(buyer, "project-a", "basket-a", draft.id)).version).toBe(draft.version);
    expect(audit.appendInMongoTransaction).not.toHaveBeenCalled();
  });

  it("does not replace a failed invitation or audit when resend delivery preflight fails", async () => {
    const first = await sentEnquiry(["vendor-a"]);
    await ProcurementBasketInvitationModel.updateOne({ enquiryId: first.id }, { $set: { status: "failed" } });
    const preflight = vi.fn(async () => { throw new Error("provider unavailable"); });
    const sendRequest = vi.fn(async () => undefined);
    const unavailable = createProcurementBasketEnquiryService({ audit,
      mailer: { deliveryKind: "local_test", preflight, sendRequest }, now: () => at });
    vi.mocked(audit.appendInMongoTransaction).mockClear();

    await expect(unavailable.resendInvitation(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: first.version, vendorId: "vendor-a", idempotencyKey: "preflight-unavailable-resend" }))
      .rejects.toMatchObject({ status: 503, code: "PROCUREMENT_BASKET_DELIVERY_UNAVAILABLE" });
    expect(preflight).toHaveBeenCalledOnce();
    expect(sendRequest).not.toHaveBeenCalled();
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: first.id })).toBe(1);
    expect(await ProcurementBasketInvitationModel.findOne({ enquiryId: first.id }).lean()).toMatchObject({ status: "failed" });
    expect((await enquiries.get(buyer, "project-a", "basket-a", first.id)).version).toBe(first.version);
    expect(audit.appendInMongoTransaction).not.toHaveBeenCalled();
  });

  it("does not create a counteroffer or invitation when delivery preflight fails", async () => {
    const first = await sentEnquiry(["vendor-a"]);
    const publicBoq = await enquiries.inspectVendorBoq(sent[0]!.rawToken);
    await enquiries.submitVendorBid({ token: sent[0]!.rawToken, idempotencyKey: "preflight-bid",
      lines: [{ boqLineId: publicBoq.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    const current = await enquiries.get(buyer, "project-a", "basket-a", first.id);
    const preflight = vi.fn(async () => { throw new Error("provider unavailable"); });
    const sendRequest = vi.fn(async () => undefined);
    const unavailable = createProcurementBasketEnquiryService({ audit,
      mailer: { deliveryKind: "local_test", preflight, sendRequest }, now: () => at });
    vi.mocked(audit.appendInMongoTransaction).mockClear();

    await expect(unavailable.requestCounteroffer(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: current.version, idempotencyKey: "preflight-unavailable-counteroffer",
        vendorId: "vendor-a", reason: "Please revise this rate." }))
      .rejects.toMatchObject({ status: 503, code: "PROCUREMENT_BASKET_DELIVERY_UNAVAILABLE" });
    expect(preflight).toHaveBeenCalledOnce();
    expect(sendRequest).not.toHaveBeenCalled();
    expect(await ProcurementBasketCounterofferModel.countDocuments({ enquiryId: first.id })).toBe(0);
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: first.id })).toBe(1);
    expect((await enquiries.get(buyer, "project-a", "basket-a", first.id)).version).toBe(current.version);
    expect(audit.appendInMongoTransaction).not.toHaveBeenCalled();
  });

  it("resends a failed invitation on the frozen BOQ without reviving the failed token", async () => {
    let failedToken = "";
    const failed = createProcurementBasketEnquiryService({ audit,
      mailer: { deliveryKind: "local_test", sendRequest: async message => {
        failedToken = message.rawToken;
        throw new Error("transport unavailable");
      } }, now: () => at });
    const draft = await failed.create(buyer, "project-a", "basket-a", boqInput);
    const first = await failed.dispatch(buyer, "project-a", "basket-a", draft.id,
      { expectedVersion: draft.version, expectedPreparationDigest: digest,
        idempotencyKey: "failed-initial-key", vendorIds: ["vendor-a"] });
    expect(first.status).toBe("draft");
    basket.preparationDigest = "b".repeat(64);
    expect((await enquiries.get(buyer, "project-a", "basket-a", first.id)).vendorScopeCurrent).toBe(true);
    const input = { expectedVersion: first.version, vendorId: "vendor-a", idempotencyKey: "resend-failed-key" };
    const resent = await enquiries.resendInvitation(buyer, "project-a", "basket-a", first.id, input);
    expect(resent.status).toBe("sent");
    expect(resent.boqRevisionId).toBe(first.boqRevisionId);
    expect(resent.invitations).toMatchObject([{ kind: "resend", status: "sent", generation: 2 },
      { kind: "initial", status: "failed", generation: 1 }]);
    expect(sent).toHaveLength(1);
    await expect(enquiries.inspectVendorBoq(failedToken)).rejects.toMatchObject({ status: 410 });
    expect((await enquiries.inspectVendorBoq(sent[0]!.rawToken)).lines).toHaveLength(1);
    expect((await enquiries.resendInvitation(buyer, "project-a", "basket-a", first.id, input)).version)
      .toBe(resent.version);
    expect(sent).toHaveLength(1);
    await expect(enquiries.resendInvitation(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: resent.version, vendorId: "vendor-a", idempotencyKey: "resend-active-key" }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("replaces an expired unbid invitation without changing BOQ revision", async () => {
    const first = await sentEnquiry(["vendor-a"]);
    const firstToken = sent[0]!.rawToken;
    await ProcurementBasketInvitationModel.updateOne({ enquiryId: first.id },
      { $set: { expiresAt: new Date(at.getTime() - 1) } });
    const resent = await enquiries.resendInvitation(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: first.version, vendorId: "vendor-a", idempotencyKey: "resend-expired-key" });
    expect(resent.boqRevisionId).toBe(first.boqRevisionId);
    expect(resent.invitations).toMatchObject([{ kind: "resend", status: "sent", generation: 2 },
      { kind: "initial", status: "expired", generation: 1 }]);
    await expect(enquiries.inspectVendorBoq(firstToken)).rejects.toMatchObject({ status: 410 });
    expect((await enquiries.inspectVendorBoq(sent.at(-1)!.rawToken)).lines).toHaveLength(1);
  });

  it("recovers an unconfirmed delivery after the bounded pending window", async () => {
    const first = await sentEnquiry(["vendor-a"]);
    const oldToken = sent[0]!.rawToken;
    await ProcurementBasketInvitationModel.updateOne({ enquiryId: first.id }, { $set: {
      status: "pending", sentAt: null, requestedAt: new Date(at.getTime() - 11 * 60 * 1_000) } });
    const stalled = await enquiries.get(buyer, "project-a", "basket-a", first.id);
    expect(stalled.invitations[0]!.status).toBe("stalled");
    const resent = await enquiries.resendInvitation(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: first.version, vendorId: "vendor-a", idempotencyKey: "resend-stalled-key" });
    expect(resent.invitations).toMatchObject([{ kind: "resend", status: "sent", generation: 2 },
      { kind: "initial", status: "failed", generation: 1 }]);
    await expect(enquiries.inspectVendorBoq(oldToken)).rejects.toMatchObject({ status: 410 });
  });

  it("preserves the original bid and compares only the latest submitted counteroffer", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const originalToken = sent[0]!.rawToken;
    const boq = await enquiries.inspectVendorBoq(originalToken);
    await enquiries.submitVendorBid({ token: originalToken, idempotencyKey: "original-bid",
      lines: [{ boqLineId: boq.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    const refreshed = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    await enquiries.requestCounteroffer(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: refreshed.version, idempotencyKey: "counteroffer-key",
        vendorId: "vendor-a", reason: "Please review your quoted rate.", targetNetPaise: 900_000 });
    const counterToken = sent.at(-1)!.rawToken;
    expect(counterToken).not.toBe(originalToken);
    await enquiries.submitVendorBid({ token: counterToken, idempotencyKey: "counter-bid",
      lines: [{ boqLineId: boq.lines[0]!.id, unitPricePaise: 90_000, gstBasisPoints: 0 }] });
    const comparison = await awards.comparison(buyer, "project-a", "basket-a", enquiry.id);
    expect(comparison.rows).toMatchObject([{ bidRevision: 2, quoteNetPaise: 900_000 }]);
    expect(comparison.averageBidNetPaise).toBe(900_000);
    expect(comparison.bidHistory.map(item => [item.revision, item.totals.netPaise]))
      .toEqual([[2, 900_000], [1, 1_000_000]]);
    expect(comparison.counteroffers).toMatchObject([{ vendorId: "vendor-a",
      priorBidId: comparison.bidHistory[1]!.bidId,
      reason: "Please review your quoted rate.", targetNetPaise: 900_000,
      invitationStatus: "consumed", answeredBidId: comparison.bidHistory[0]!.bidId }]);
    expect(comparison.bidHistoryHasMore).toBe(false);
    expect(comparison.counteroffersHasMore).toBe(false);
    expect(await ProcurementBasketBidModel.countDocuments({ enquiryId: enquiry.id })).toBe(2);
  });

  it("pages old BOQ revisions and reads their immutable quotes without making them awardable", async () => {
    const first = await sentEnquiry(["vendor-a"]);
    const originalToken = sent[0]!.rawToken;
    const originalBoq = await enquiries.inspectVendorBoq(originalToken);
    const originalBid = await enquiries.submitVendorBid({ token: originalToken, idempotencyKey: "history-bid-one",
      lines: [{ boqLineId: originalBoq.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 1_800 }] });
    const afterBid = await enquiries.get(buyer, "project-a", "basket-a", first.id);
    await enquiries.requestCounteroffer(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: afterBid.version, idempotencyKey: "history-counteroffer-one",
        vendorId: "vendor-a", reason: "Please review your quoted rate.", targetNetPaise: 900_000 });
    const counterBid = await enquiries.submitVendorBid({ token: sent.at(-1)!.rawToken,
      idempotencyKey: "history-bid-two",
      lines: [{ boqLineId: originalBoq.lines[0]!.id, unitPricePaise: 90_000, gstBasisPoints: 1_800 }] });
    const afterCounter = await enquiries.get(buyer, "project-a", "basket-a", first.id);
    firstLine.mainLineName = "Revised painting scope";
    const secondDraft = await enquiries.update(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: afterCounter.version, expectedPreparationDigest: digest,
        idempotencyKey: "history-edit-two", lines: [{ sourceLineItemKey: "line-a" }] });
    const draftHistory = await enquiries.history(buyer, "project-a", "basket-a", first.id, { limit: 1 });
    expect(draftHistory).toMatchObject({ currentBoqRevisionId: null,
      revisions: [{ revision: 1, bidCount: 2, counterofferCount: 1 }] });
    const second = await enquiries.dispatch(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: secondDraft.version, expectedPreparationDigest: digest,
        idempotencyKey: "history-dispatch-two", vendorIds: ["vendor-a"] });
    firstLine.mainLineName = "Third painting scope";
    const thirdDraft = await enquiries.update(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: second.version, expectedPreparationDigest: digest,
        idempotencyKey: "history-edit-three", lines: [{ sourceLineItemKey: "line-a" }] });
    const third = await enquiries.dispatch(buyer, "project-a", "basket-a", first.id,
      { expectedVersion: thirdDraft.version, expectedPreparationDigest: digest,
        idempotencyKey: "history-dispatch-three", vendorIds: ["vendor-a"] });
    const pageOne = await enquiries.history(buyer, "project-a", "basket-a", first.id, { limit: 1 });
    expect(pageOne).toMatchObject({ currentBoqRevisionId: third.boqRevisionId,
      revisions: [{ revision: 2, bidCount: 0, counterofferCount: 0 }], nextBeforeRevision: 2 });
    const pageTwo = await enquiries.history(buyer, "project-a", "basket-a", first.id,
      { beforeRevision: pageOne.nextBeforeRevision!, limit: 1 });
    expect(pageTwo).toMatchObject({ revisions: [{ revision: 1, bidCount: 2, counterofferCount: 1 }],
      nextBeforeRevision: null });
    const firstRevisionId = pageTwo.revisions[0]!.id;
    const detailOne = await enquiries.historyDetail(buyer, "project-a", "basket-a", first.id,
      firstRevisionId, { bidOffset: 0, counterofferOffset: 0, limit: 1 });
    expect(detailOne).toMatchObject({ canAward: false, boq: { revision: 1,
      lines: [{ description: "Two coats of interior paint" }] }, bidTotal: 2, counterofferTotal: 1,
      bids: [{ bidId: counterBid.bidId, vendorName: "Vendor A", revision: 2,
        totals: { netPaise: 900_000 }, lines: [{ unitPricePaise: 90_000 }] }],
      counteroffers: [{ priorBidId: originalBid.bidId, answeredBidId: counterBid.bidId }] });
    const detailTwo = await enquiries.historyDetail(buyer, "project-a", "basket-a", first.id,
      firstRevisionId, { bidOffset: 1, counterofferOffset: 1, limit: 1 });
    expect(detailTwo).toMatchObject({ bidTotal: 2, counterofferTotal: 1,
      bids: [{ bidId: originalBid.bidId, revision: 1 }], counteroffers: [] });
    await expect(enquiries.historyDetail(buyer, "project-a", "basket-a", first.id, third.boqRevisionId!,
      { bidOffset: 0, counterofferOffset: 0, limit: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(enquiries.historyDetail(buyer, "project-a", "other-basket", first.id, firstRevisionId,
      { bidOffset: 0, counterofferOffset: 0, limit: 1 })).rejects.toMatchObject({ status: 404 });
    const currentComparison = await awards.comparison(buyer, "project-a", "basket-a", first.id);
    expect(currentComparison.rows).toEqual([]);
    expect(currentComparison.averageBidNetPaise).toBeNull();
    await expect(awards.preview(buyer, "project-a", "basket-a", first.id,
      { bidId: originalBid.bidId, advanceBasisPoints: 2_000 })).rejects.toMatchObject({ status: 409 });
  });

  it("recovers a stalled counteroffer delivery without two live vendor links", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const original = await enquiries.inspectVendorBoq(sent[0]!.rawToken);
    await enquiries.submitVendorBid({ token: sent[0]!.rawToken, idempotencyKey: "stalled-original-bid",
      lines: [{ boqLineId: original.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    const current = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const first = await enquiries.requestCounteroffer(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: current.version, idempotencyKey: "stalled-counteroffer-one",
        vendorId: "vendor-a", reason: "Please send a revised quote for this work." });
    const oldCounterToken = sent.at(-1)!.rawToken;
    await ProcurementBasketInvitationModel.updateOne({ enquiryId: enquiry.id, generation: 2 }, { $set: {
      status: "pending", sentAt: null, requestedAt: new Date(at.getTime() - 11 * 60 * 1_000) } });
    const second = await enquiries.requestCounteroffer(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: first.version, idempotencyKey: "stalled-counteroffer-two",
        vendorId: "vendor-a", reason: "Please send a revised quote for this work." });
    expect(second.invitations).toMatchObject([
      { kind: "counteroffer", status: "sent", generation: 3 },
      { kind: "counteroffer", status: "failed", generation: 2 },
      { kind: "initial", status: "consumed", generation: 1 }
    ]);
    expect(await ProcurementBasketInvitationModel.countDocuments({ enquiryId: enquiry.id,
      vendorId: "vendor-a", status: "sent" })).toBe(1);
    await expect(enquiries.inspectVendorBoq(oldCounterToken)).rejects.toMatchObject({ status: 410 });
    expect((await enquiries.inspectVendorBoq(sent.at(-1)!.rawToken)).lines).toHaveLength(1);
  });

  it("creates and revises an eligible nonrecommended award without a reason while preserving historical reasons", async () => {
    const enquiry = await sentEnquiry();
    const tokenA = sent.find(row => row.recipient.email === "vendor-a@example.test")!.rawToken;
    const tokenB = sent.find(row => row.recipient.email === "vendor-b@example.test")!.rawToken;
    const boqLineId = (await enquiries.inspectVendorBoq(tokenA)).lines[0]!.id;
    const bidA = await enquiries.submitVendorBid({ token: tokenA, idempotencyKey: "optional-reason-bid-a",
      lines: [{ boqLineId, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    const bidB = await enquiries.submitVendorBid({ token: tokenB, idempotencyKey: "optional-reason-bid-b",
      lines: [{ boqLineId, unitPricePaise: 110_000, gstBasisPoints: 0 }] });
    const comparison = await awards.comparison(buyer, "project-a", "basket-a", enquiry.id);
    expect(comparison.recommendedBidId).toBe(bidB.bidId);
    const currentEnquiry = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const created = await awards.create(buyer, "project-a", "basket-a", enquiry.id, {
      expectedVersion: currentEnquiry.version, idempotencyKey: "optional-reason-create", bidId: bidA.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers });
    expect(created).toMatchObject({ status: "draft", vendorId: "vendor-a", proposal: {
      recommendedBidId: bidB.bidId, nonRecommendedReason: null } });
    const revised = await awards.update(buyer, "project-a", "basket-a", enquiry.id, created.id, {
      expectedVersion: created.version, idempotencyKey: "optional-reason-update",
      advanceBasisPoints: 3_000, milestoneReviewers: procurementReviewers });
    expect(revised).toMatchObject({ status: "draft", vendorId: "vendor-a", proposal: {
      advanceBasisPoints: 3_000, nonRecommendedReason: null } });
    const historicalReason = "Previously recorded vendor selection rationale.";
    const withReason = await awards.update(buyer, "project-a", "basket-a", enquiry.id, created.id, {
      expectedVersion: revised.version, idempotencyKey: "optional-reason-historical",
      advanceBasisPoints: 3_000, milestoneReviewers: procurementReviewers,
      nonRecommendedReason: historicalReason });
    const preserved = await awards.update(buyer, "project-a", "basket-a", enquiry.id, created.id, {
      expectedVersion: withReason.version, idempotencyKey: "optional-reason-preserve",
      advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers });
    expect(preserved.proposal.nonRecommendedReason).toBe(historicalReason);
    const changedBid = await awards.update(buyer, "project-a", "basket-a", enquiry.id, created.id, {
      expectedVersion: preserved.version, idempotencyKey: "optional-reason-change-bid", bidId: bidB.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers });
    expect(changedBid.proposal.nonRecommendedReason).toBeNull();
    expect(await ProcurementBasketAwardRevisionModel.findById(preserved.proposalRevisionId).lean())
      .toMatchObject({ bidId: bidA.bidId, nonRecommendedReason: historicalReason });
  });

  it("requires the current proposal approval and keeps a sub-threshold award separate from issue", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    const publicBoq = await enquiries.inspectVendorBoq(token);
    const bid = await enquiries.submitVendorBid({ token, idempotencyKey: "bid-key-001",
      lines: [{ boqLineId: publicBoq.lines[0]!.id, unitPricePaise: 440_000, gstBasisPoints: 0 }] });
    const preview = await awards.preview(buyer, "project-a", "basket-a", enquiry.id,
      { bidId: bid.bidId, advanceBasisPoints: 2_000 });
    expect(preview.requiredSlots).toEqual(["procurement"]);
    expect(preview.totals.totalPaise).toBe(4_400_000);
    expect(preview.milestones.map(row => row.reviewerSlots)).toEqual(Array.from({ length: 5 }, () => ["procurement"]));
    const milestoneReviewers = preview.milestones.map(row => ({ id: row.id,
      reviewerSlots: ["procurement" as const] }));
    const refreshed = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const createInput = { expectedVersion: refreshed.version, idempotencyKey: "award-key-001", bidId: bid.bidId,
      advanceBasisPoints: 2_000, terms: "Payment after each verified milestone", designerId: null,
      milestoneReviewers, lineTerms: await currentAwardLineTerms(enquiry.id), nonRecommendedReason: null };
    await expect(awards.create(buyer, "project-a", "basket-a", enquiry.id,
      { ...createInput, milestoneReviewers: undefined } as unknown as Parameters<typeof awards.create>[4]))
      .rejects.toMatchObject({ status: 400, code: "PROCUREMENT_BASKET_MILESTONE_REVIEWERS_REQUIRED" });
    expect(await ProcurementBasketAwardModel.countDocuments({ enquiryId: enquiry.id })).toBe(0);
    const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id, createInput);
    expect(award.status).toBe("draft");
    expect(award.proposal.milestones.map(row => row.reviewerSlots)).toEqual(preview.milestones.map(row => row.reviewerSlots));
    expect(await awards.approvalQueue(buyer)).toEqual([]);
    const submitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "submit-key-001" });
    expect(submitted.status).toBe("pending_approvals");
    expect((await awards.approvalQueue(buyer)).map(row => [row.awardId, row.slot])).toEqual([[award.id, "procurement"]]);
    expect((await awards.approvalDetail(buyer, award.id)).proposal.milestones.map(row => row.reviewerSlots))
      .toEqual(preview.milestones.map(row => row.reviewerSlots));
    await expect(awards.approvalDetail({ id: "super-admin", name: "Super Admin", email: "super@example.test",
      role: "super_admin" }, award.id)).rejects.toMatchObject({ status: 403 });
    const decided = await awards.decide(buyer, award.id, { expectedVersion: submitted.version,
      proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "decision-key-001",
      slot: "procurement", decision: "approve", reason: null });
    expect(decided.status).toBe("ready_to_issue");
    expect(decided.issuedPurchaseOrderId).toBeNull();
    expect(await awards.approvalQueue(buyer)).toEqual([]);
  });

  it("revises a ready award by CAS and requires fresh approval on the new immutable proposal", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    const boq = await enquiries.inspectVendorBoq(token);
    const bid = await enquiries.submitVendorBid({ token, idempotencyKey: "ready-revise-bid",
      lines: [{ boqLineId: boq.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    const refreshed = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: refreshed.version, idempotencyKey: "ready-revise-create", bidId: bid.bidId,
        advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
        terms: "Payment after verified completion",
        lineTerms: await currentAwardLineTerms(enquiry.id) });
    const submitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "ready-revise-submit" });
    const ready = await awards.decide(buyer, award.id, { expectedVersion: submitted.version,
      proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "ready-revise-approval",
      slot: "procurement", decision: "approve", reason: null });
    expect(ready.status).toBe("ready_to_issue");
    const updateInput = { expectedVersion: ready.version, idempotencyKey: "ready-revise-update", bidId: bid.bidId,
      advanceBasisPoints: 3_000, milestoneReviewers: procurementReviewers,
      terms: "Revised schedule after scope review", lineTerms: await currentAwardLineTerms(enquiry.id) };
    await expect(awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { ...updateInput, milestoneReviewers: undefined } as unknown as Parameters<typeof awards.update>[5]))
      .rejects.toMatchObject({ status: 400, code: "PROCUREMENT_BASKET_MILESTONE_REVIEWERS_REQUIRED" });
    const revised = await awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id, updateInput);
    expect(revised).toMatchObject({ status: "draft", version: ready.version + 1,
      proposal: { revision: 2, advanceBasisPoints: 3_000 }, approvals: [] });
    expect(revised.proposalRevisionId).not.toBe(ready.proposalRevisionId);
    expect((await enquiries.get(buyer, "project-a", "basket-a", enquiry.id)).status).toBe("sent");
    expect(await ProcurementBasketAwardApprovalModel.countDocuments({ awardId: award.id,
      proposalRevisionId: ready.proposalRevisionId })).toBe(1);
    await expect(awards.decide(buyer, award.id, { expectedVersion: ready.version,
      proposalRevisionId: ready.proposalRevisionId, idempotencyKey: "stale-revise-approval",
      slot: "procurement", decision: "approve", reason: null })).rejects.toMatchObject({ status: 409 });
    const resubmitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: revised.version, idempotencyKey: "ready-revise-resubmit" });
    const reapproved = await awards.decide(buyer, award.id, { expectedVersion: resubmitted.version,
      proposalRevisionId: resubmitted.proposalRevisionId, idempotencyKey: "ready-revise-reapproval",
      slot: "procurement", decision: "approve", reason: null });
    expect(reapproved.status).toBe("ready_to_issue");
    expect(reapproved.approvals).toHaveLength(1);
  });

  it("withdraws a stale ready award, rebases the BOQ, and requires a fresh proposal and approval", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const initialBoq = await enquiries.inspectVendorBoq(sent[0]!.rawToken);
    const initialBid = await enquiries.submitVendorBid({ token: sent[0]!.rawToken,
      idempotencyKey: "stale-withdraw-first-bid",
      lines: [{ boqLineId: initialBoq.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    const current = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: current.version, idempotencyKey: "stale-withdraw-create", bidId: initialBid.bidId,
        advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
        terms: "Payment after verified work",
        lineTerms: await currentAwardLineTerms(enquiry.id) });
    const submitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "stale-withdraw-submit" });
    const ready = await awards.decide(buyer, award.id, { expectedVersion: submitted.version,
      proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "stale-withdraw-approve",
      slot: "procurement", decision: "approve", reason: null });
    const changedDigest = "b".repeat(64);
    basket.preparationDigest = changedDigest;
    await expect(awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: ready.version, idempotencyKey: "stale-withdraw-direct-update",
        bidId: initialBid.bidId, advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
        terms: "Cannot reuse stale source", lineTerms: await currentAwardLineTerms(enquiry.id) }))
      .rejects.toMatchObject({ status: 409 });
    const withdrawalInput = { expectedVersion: ready.version, idempotencyKey: "stale-withdraw-action",
      reason: "Approved mode source changed; the buyer must rebase the BOQ." };
    const withdrawn = await awards.withdraw(buyer, "project-a", "basket-a", enquiry.id, award.id,
      withdrawalInput);
    expect(withdrawn).toMatchObject({ status: "draft", requiresRevision: true,
      proposal: { revision: 2 }, approvals: [],
      withdrawal: { priorProposalRevisionId: ready.proposalRevisionId, reason: withdrawalInput.reason } });
    expect((await awards.withdraw(buyer, "project-a", "basket-a", enquiry.id, award.id,
      withdrawalInput)).proposalRevisionId).toBe(withdrawn.proposalRevisionId);
    await expect(awards.withdraw(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { ...withdrawalInput, reason: "Different withdrawal rationale for same request key." }))
      .rejects.toMatchObject({ status: 409 });
    await expect(awards.withdraw(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: ready.version, idempotencyKey: "stale-withdraw-second-key",
        reason: "A second buyer action has an obsolete award version." }))
      .rejects.toMatchObject({ status: 409 });
    await expect(awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: withdrawn.version, idempotencyKey: "stale-withdraw-invalid-submit" }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_REVISION_REQUIRED" });
    const reopened = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    expect(reopened.status).toBe("sent");
    firstLine.mainLineName = "Updated painting scope under the new mode";
    const edited = await enquiries.update(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: reopened.version, expectedPreparationDigest: changedDigest,
        idempotencyKey: "stale-withdraw-boq-edit", lines: [{ sourceLineItemKey: "line-a" }] });
    const resent = await enquiries.dispatch(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: edited.version, expectedPreparationDigest: changedDigest,
        idempotencyKey: "stale-withdraw-new-boq", vendorIds: ["vendor-a"] });
    const revisedBoq = await enquiries.inspectVendorBoq(sent.at(-1)!.rawToken);
    const newBid = await enquiries.submitVendorBid({ token: sent.at(-1)!.rawToken,
      idempotencyKey: "stale-withdraw-new-bid",
      lines: [{ boqLineId: revisedBoq.lines[0]!.id, unitPricePaise: 95_000, gstBasisPoints: 0 }] });
    const revised = await awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: withdrawn.version, idempotencyKey: "stale-withdraw-new-proposal",
        bidId: newBid.bidId, advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
        terms: "Rebased BOQ with fresh vendor quote",
        lineTerms: await currentAwardLineTerms(enquiry.id) });
    expect(revised).toMatchObject({ status: "draft", requiresRevision: false,
      proposal: { revision: 3, boqRevisionId: resent.boqRevisionId }, approvals: [], withdrawal: null });
    expect(await ProcurementBasketAwardApprovalModel.countDocuments({ awardId: award.id,
      proposalRevisionId: ready.proposalRevisionId })).toBe(1);
    const resubmitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: revised.version, idempotencyKey: "stale-withdraw-resubmit" });
    const reapproved = await awards.decide(buyer, award.id, { expectedVersion: resubmitted.version,
      proposalRevisionId: resubmitted.proposalRevisionId, idempotencyKey: "stale-withdraw-reapprove",
      slot: "procurement", decision: "approve", reason: null });
    expect(reapproved.status).toBe("ready_to_issue");
    expect(reapproved.approvals).toHaveLength(1);
  });

  it("moves the award header to a redispatched BOQ revision before a replacement bid is approved", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const originalToken = sent[0]!.rawToken;
    const originalBoq = await enquiries.inspectVendorBoq(originalToken);
    const originalBid = await enquiries.submitVendorBid({ token: originalToken,
      idempotencyKey: "redispatch-original-bid",
      lines: [{ boqLineId: originalBoq.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    const refreshed = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: refreshed.version, idempotencyKey: "redispatch-award-create", bidId: originalBid.bidId,
        advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers, terms: "Verified work only",
        lineTerms: await currentAwardLineTerms(enquiry.id) });
    const afterAward = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    firstLine.mainLineName = "Three coats of interior paint";
    const edited = await enquiries.update(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: afterAward.version, expectedPreparationDigest: digest,
        idempotencyKey: "redispatch-enquiry-edit", lines: [{ sourceLineItemKey: "line-a" }] });
    const resent = await enquiries.dispatch(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: edited.version, expectedPreparationDigest: digest,
        idempotencyKey: "redispatch-new-boq", vendorIds: ["vendor-a"] });
    expect(resent.boqRevisionId).not.toBe(award.proposal.boqRevisionId);
    const newBoq = await enquiries.inspectVendorBoq(sent.at(-1)!.rawToken);
    const replacementBid = await enquiries.submitVendorBid({ token: sent.at(-1)!.rawToken,
      idempotencyKey: "redispatch-replacement-bid",
      lines: [{ boqLineId: newBoq.lines[0]!.id, unitPricePaise: 95_000, gstBasisPoints: 0 }] });
    const revised = await awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "redispatch-award-update",
        bidId: replacementBid.bidId, advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
        terms: "Verified work under the revised BOQ",
        lineTerms: await currentAwardLineTerms(enquiry.id) });
    expect(revised.proposal.boqRevisionId).toBe(resent.boqRevisionId);
    expect((await ProcurementBasketAwardModel.findById(award.id).lean())?.boqRevisionId).toBe(resent.boqRevisionId);
    const submitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: revised.version, idempotencyKey: "redispatch-award-submit" });
    const ready = await awards.decide(buyer, award.id, { expectedVersion: submitted.version,
      proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "redispatch-award-approve",
      slot: "procurement", decision: "approve", reason: null });
    expect(ready.status).toBe("ready_to_issue");
  });

  it("requires four distinct role approvals above ₹50,000 and separate reasoned budget override", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    const publicBoq = await enquiries.inspectVendorBoq(token);
    const bid = await enquiries.submitVendorBid({ token, idempotencyKey: "large-bid-key",
      lines: [{ boqLineId: publicBoq.lines[0]!.id, unitPricePaise: 1_100_000, gstBasisPoints: 0 }] });
    const preview = await awards.preview(buyer, "project-a", "basket-a", enquiry.id,
      { bidId: bid.bidId, advanceBasisPoints: 2_000, designerId: "designer" });
    expect(preview.requiredSlots).toEqual(["program_manager", "designer", "procurement", "finance_head", "budget_override"]);
    expect(preview.budgetOverrideRequired).toBe(true);
    expect(preview.milestones.map(row => row.reviewerSlots)).toEqual([[], [], [], [], []]);
    const incompleteReviewers = preview.milestones.map(row => ({ id: row.id,
      reviewerSlots: row.id === "advance" ? ["program_manager" as const] : [] }));
    const refreshed = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: refreshed.version, idempotencyKey: "large-award-key", bidId: bid.bidId,
        advanceBasisPoints: 2_000, terms: "Verified milestones only", designerId: "designer",
        milestoneReviewers: incompleteReviewers,
        lineTerms: await currentAwardLineTerms(enquiry.id),
        nonRecommendedReason: null });
    await expect(awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "incomplete-large-submit" }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_MILESTONE_REVIEWERS_REQUIRED" });
    const selectedReviewers = preview.milestones.map(row => ({ id: row.id,
      reviewerSlots: row.id === "advance" ? ["program_manager" as const, "designer" as const]
        : row.id === "final" ? ["procurement" as const, "finance_head" as const] : [] }));
    const revised = await awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "large-award-chips", bidId: bid.bidId,
        advanceBasisPoints: 2_000, terms: "Verified milestones only", designerId: "designer",
        milestoneReviewers: selectedReviewers, lineTerms: await currentAwardLineTerms(enquiry.id),
        nonRecommendedReason: null });
    expect(revised.proposal.milestones.map(row => row.reviewerSlots)).toEqual(selectedReviewers.map(row => row.reviewerSlots));
    await ProjectWorkflowTaskModel.deleteOne({ _id: "finance-task-a" });
    await expect(awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: revised.version, idempotencyKey: "no-finance-task-submit" }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_FINANCE_REVIEWER_REQUIRED" });
    await ProjectWorkflowTaskModel.create({ _id: "finance-task-a", dedupeKey: "finance-project-a",
      projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1,
      kind: "finance", title: "Finance review", assigneeRole: "finance_head", openedAt: at });
    let current = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: revised.version, idempotencyKey: "large-submit-key" });
    expect((await awards.approvalDetail(buyer, award.id)).proposal.milestones
      .filter(row => row.reviewerSlots?.includes("procurement")).map(row => row.id)).toEqual(["final"]);
    for (const [actor, slot] of [
      [{ id: "site-manager", role: "site_manager" }, "program_manager"],
      [{ id: "designer", role: "designer" }, "designer"],
      [buyer, "procurement"],
      [{ id: "finance", role: "finance_head" }, "finance_head"]
    ] as const) {
      if (slot === "finance_head") {
        await ProjectModel.create({ _id: "project-b", name: "Project B", status: "active", location: "Mumbai",
          clientName: "Other client", clientEmail: "other@example.test", clientEmailNormalized: "other@example.test",
          clientMobile: "9111111111", clientAddress: "Mumbai", plannedStartAt: at,
          plannedEndAt: new Date("2026-12-01T00:00:00.000Z"), assignedDesignerIds: ["designer"],
          programManagerId: "site-manager" });
        const sourceAward = (await ProcurementBasketAwardModel.findById(award.id).lean())!;
        const sourceProposal = (await ProcurementBasketAwardRevisionModel.findById(current.proposalRevisionId).lean())!;
        const foreignAwards = Array.from({ length: 101 }, (_, index) => ({ ...sourceAward,
          _id: `foreign-award-${index}`, projectId: "project-b", enquiryId: `foreign-enquiry-${index}`,
          currentProposalRevisionId: `foreign-proposal-${index}`, createdAt: new Date(at.getTime() - 1_000),
          updatedAt: new Date(at.getTime() - 1_000) }));
        const foreignProposals = Array.from({ length: 101 }, (_, index) => ({ ...sourceProposal,
          _id: `foreign-proposal-${index}`, awardId: `foreign-award-${index}`, projectId: "project-b",
          enquiryId: `foreign-enquiry-${index}` }));
        await ProcurementBasketAwardRevisionModel.collection.insertMany(foreignProposals);
        await ProcurementBasketAwardModel.collection.insertMany(foreignAwards);
        const financeActor = { id: "finance", role: "finance_head" } as PublicUser;
        expect((await awards.approvalQueue(financeActor)).map(row => row.awardId)).toEqual([award.id]);
        await expect(awards.approvalDetail(financeActor, "foreign-award-0"))
          .rejects.toMatchObject({ status: 404 });
        await expect(awards.decide(financeActor, "foreign-award-0", {
          expectedVersion: 1, proposalRevisionId: "foreign-proposal-0", idempotencyKey: "foreign-finance-decision",
          slot: "finance_head", decision: "approve", reason: null }))
          .rejects.toMatchObject({ status: 404 });
      }
      const queue = await awards.approvalQueue(actor as PublicUser);
      expect(queue.some(row => row.awardId === award.id && row.slot === slot)).toBe(true);
      current = await awards.decide(actor as PublicUser, award.id, { expectedVersion: current.version,
        proposalRevisionId: current.proposalRevisionId, idempotencyKey: `approve-${slot}`,
        slot, decision: "approve", reason: null });
      expect(current.status).toBe("pending_approvals");
    }
    await expect(awards.decide({ id: "super-admin", role: "super_admin" } as PublicUser, award.id,
      { expectedVersion: current.version, proposalRevisionId: current.proposalRevisionId,
        idempotencyKey: "override-short", slot: "budget_override", decision: "approve", reason: "short" }))
      .rejects.toMatchObject({ status: 400 });
    current = await awards.decide({ id: "super-admin", role: "super_admin" } as PublicUser, award.id,
      { expectedVersion: current.version, proposalRevisionId: current.proposalRevisionId,
        idempotencyKey: "override-valid", slot: "budget_override", decision: "approve",
        reason: "Approved after budget review" });
    expect(current.status).toBe("ready_to_issue");
    expect(current.approvals).toHaveLength(5);
    expect(new Set(current.approvals.map(row => row.actorId)).size).toBe(5);
  });

  it("denies an old Site Manager's decision replay after reassignment and a new proposal revision", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    const publicBoq = await enquiries.inspectVendorBoq(token);
    const bid = await enquiries.submitVendorBid({ token, idempotencyKey: "replay-bid-key",
      lines: [{ boqLineId: publicBoq.lines[0]!.id, unitPricePaise: 600_000, gstBasisPoints: 0 }] });
    const refreshed = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id, {
      expectedVersion: refreshed.version, idempotencyKey: "replay-award-key", bidId: bid.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: fullReviewers, designerId: "designer",
      nonRecommendedReason: null });
    const submitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "replay-submit-key" });
    const formerManager = { id: "site-manager", role: "site_manager" } as PublicUser;
    const decision = { expectedVersion: submitted.version, proposalRevisionId: submitted.proposalRevisionId,
      idempotencyKey: "replay-pm-decision", slot: "program_manager" as const,
      decision: "approve" as const, reason: null };
    const approved = await awards.decide(formerManager, award.id, decision);
    expect(approved.status).toBe("pending_approvals");
    await UserModel.create({ _id: "new-site-manager", name: "New PM", email: "new-pm@example.test",
      emailNormalized: "new-pm@example.test", passwordHash: "fixture", role: "site_manager", active: true });
    await ProjectWorkflowTaskModel.updateOne({ _id: "site-task-a" }, { $set: { assigneeUserId: "new-site-manager" }, $inc: { version: 1 } });
    const revised = await awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id, {
      expectedVersion: approved.version, idempotencyKey: "replay-revised-award", bidId: bid.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: fullReviewers, designerId: "designer",
      nonRecommendedReason: null });
    expect(revised.proposal.programManagerId).toBe("new-site-manager");
    await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: revised.version, idempotencyKey: "replay-new-submit" });
    await expect(awards.decide(formerManager, award.id, decision)).rejects.toMatchObject({ status: 403,
      code: "FORBIDDEN" });
    expect(await ProcurementBasketAwardApprovalModel.countDocuments({ awardId: award.id })).toBe(1);
  });

  it("rejects approval after a new official KPI assessment even when its numeric score is unchanged", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    const publicBoq = await enquiries.inspectVendorBoq(token);
    const bid = await enquiries.submitVendorBid({ token, idempotencyKey: "kpi-stale-bid",
      lines: [{ boqLineId: publicBoq.lines[0]!.id, unitPricePaise: 600_000, gstBasisPoints: 0 }] });
    const refreshed = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: refreshed.version, idempotencyKey: "kpi-stale-award", bidId: bid.bidId,
        advanceBasisPoints: 2_000, milestoneReviewers: fullReviewers,
        terms: "Verified milestones only", designerId: "designer",
        lineTerms: await currentAwardLineTerms(enquiry.id),
        nonRecommendedReason: null });
    const submitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "kpi-stale-submit" });
    await VendorKpiAssessmentModel.create({ _id: "assessment-vendor-a-revision-2", vendorId: "vendor-a",
      source: "procurement", vendorType: "execution", rubricVersion: 1, rubricGeneration: 0,
      scores: [], averageScoreBps: 8_000, revision: 2, submittedAt: at,
      actorId: buyer.id, idempotencyKey: "kpi-revision-2", payloadHash: digest });
    await expect(awards.decide({ id: "site-manager", role: "site_manager" } as PublicUser, award.id,
      { expectedVersion: submitted.version, proposalRevisionId: submitted.proposalRevisionId,
        idempotencyKey: "stale-kpi-decision", slot: "program_manager", decision: "approve", reason: null }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_PROPOSAL_STALE" });
    expect(await ProcurementBasketAwardApprovalModel.countDocuments({ awardId: award.id })).toBe(0);
  });

  it("records at most one approval when two Procurement actors decide the same revision concurrently", async () => {
    const enquiry = await sentEnquiry(["vendor-a"]);
    const token = sent[0]!.rawToken;
    const publicBoq = await enquiries.inspectVendorBoq(token);
    const bid = await enquiries.submitVendorBid({ token, idempotencyKey: "race-bid-key",
      lines: [{ boqLineId: publicBoq.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    const refreshed = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id,
      { expectedVersion: refreshed.version, idempotencyKey: "race-award-key", bidId: bid.bidId,
        advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
        terms: "Verified milestones only", designerId: null,
        lineTerms: await currentAwardLineTerms(enquiry.id),
        nonRecommendedReason: null });
    const submitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "race-submit-key" });
    const input = { expectedVersion: submitted.version, proposalRevisionId: submitted.proposalRevisionId,
      slot: "procurement" as const, decision: "approve" as const, reason: null };
    const outcomes = await Promise.allSettled([
      awards.decide(buyer, award.id, { ...input, idempotencyKey: "race-decision-one" }),
      awards.decide({ id: "buyer-two", role: "procurement" } as PublicUser, award.id,
        { ...input, idempotencyKey: "race-decision-two" })
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((outcomes.find(result => result.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    expect(await ProcurementBasketAwardApprovalModel.countDocuments({ awardId: award.id })).toBe(1);
    expect((await ProcurementBasketAwardModel.findById(award.id).lean())?.status).toBe("ready_to_issue");
  });
});
