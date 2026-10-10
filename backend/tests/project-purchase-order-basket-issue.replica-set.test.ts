import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcurementBasketDetailDto } from "../src/domain/procurement-basket-projection.js";
import type { ProjectPurchaseOrderPreparationDto } from "../src/domain/project-purchase-order-preparation.js";
import { procurementBasketDigest } from "../src/domain/procurement-basket-tender.js";
import { ApiError } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProcurementBasketAwardApprovalModel, ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel, ProcurementBasketBidModel, ProcurementBasketBoqRevisionModel,
  ProcurementBasketEnquiryModel } from "../src/models/ProcurementBasketTender.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { UserModel } from "../src/models/User.js";
import { VendorKpiAssessmentModel } from "../src/models/VendorKpiAssessment.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import type { ApprovedProcurementSnapshot } from "../src/services/procurement.service.js";
import type { AuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProcurementBasketAwardService, resolveProcurementBasketAwardLineTerms } from "../src/services/procurement-basket-award.service.js";
import { createProcurementBasketEnquiryService } from "../src/services/procurement-basket-enquiry.service.js";
import { createProjectPurchaseOrderBasketIssueService } from "../src/services/project-purchase-order-basket-issue.service.js";
import { createProjectPurchaseOrderBasketMonitorService } from "../src/services/project-purchase-order-basket-monitor.service.js";
import { createProjectPurchaseOrderService } from "../src/services/project-purchase-order.service.js";
import { onPurchaseOrderApproved } from "../src/services/vendor-work.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-10-05T00:00:00.000Z");
const digest = "a".repeat(64);
const buyer: PublicUser = { id: "buyer", name: "Buyer", email: "buyer@example.test", role: "procurement" };
const procurementReviewers = (["advance", "mobilisation", "progress_50", "progress_85", "final"] as const)
  .map(id => ({ id, reviewerSlots: ["procurement" as const] }));
const basket: ProcurementBasketDetailDto = { id: "basket-a", name: "Painting", classification: "special",
  automaticSubVendor: false, boqReady: true, standardCost: null, projectId: "project-a",
  estimateSource: { estimateId: "estimate-a", estimateVersion: 1, estimateReviewRoundId: "round-a" },
  preparationDigest: digest, includedLineCount: 1, readyLineCount: 1, approvedEstimatePaise: 10_000_000,
  baseCostPaise: 500_000, adjustedCostPaise: 600_000, workingTotalPaise: 700_000,
  workingTotalComplete: true, committedNetPaise: 0, state: "ready",
  lines: [{ sourceLineItemKey: "line-a", roomId: "room-a", roomName: "Living",
    subBasketId: "sub-a", subBasketName: "Walls", mainLineId: "main-a", mainLineName: "Paint",
    approvedQuantity: "10", approvedUnit: "sq-ft", approvedAmountPaise: 10_000_000,
    included: true, source: "configuration", baseUnitRatePaise: 50_000, standardCost: null,
    mode: { state: "ready", preview: { baseCostPaise: 500_000,
      adjustedCostPaise: 600_000, sellingPaise: 700_000 },
      revision: { id: "revision-a", version: 1, status: "active", contentDigest: digest },
      uom: { id: "uom-a", code: "SQFT", decimalScale: 2 } } as ProcurementBasketDetailDto["lines"][number]["mode"] }] };
const manualMode = basket.lines[0]!.mode;
const firstLine = basket.lines[0]!;

function useObservedStandardCost(): void {
  basket.classification = "standard";
  basket.automaticSubVendor = true;
  basket.boqReady = true;
  basket.readyLineCount = 0;
  basket.workingTotalComplete = false;
  basket.standardCost = { totalPaise: 600_000, complete: true, provisional: true, pricedLineCount: 1 };
  basket.lines[0]!.baseUnitRatePaise = 50_000;
  basket.lines[0]!.standardCost = { state: "observed_unverified", mode: "sub_vendor", calculationQuantity: "10",
    baseRates: [{ scope: "sub_vendor", ratePaise: 50_000 }], baseCostPaise: 500_000,
    adjustedCostPaise: 600_000, issues: [{ code: "PINNED_DIGEST_MISMATCH", message: "Saved Configuration changed." }] };
  basket.lines[0]!.mode = { state: "unavailable", preview: null, decision: null,
    revision: { id: "revision-a", version: 2, status: "active", contentDigest: digest },
    uom: { id: "uom-a", code: "SQFT", decimalScale: 2 },
    integrity: { status: "mismatch", activatedDigest: digest, observedDigest: "b".repeat(64), candidateAvailability: [] }
  } as ProcurementBasketDetailDto["lines"][number]["mode"];
}

function sourceSnapshot(): ApprovedProcurementSnapshot {
  const line = { key: "line-a", sectionId: "basket-a", sectionLabel: "Painting", source: "configuration" as const,
    itemType: "main_line" as const, catalogueId: "main-a", roomId: "room-a", roomName: "Living",
    mainBasketId: "basket-a", mainBasketName: "Painting", subBasketId: "sub-a", subBasketName: "Walls",
    mainLineId: "main-a", mainLineName: "Paint", specification: "Paint", unit: "sq-ft", quantity: 10,
    included: true as const, amountPaise: 10_000_000 };
  return { estimateId: "estimate-a", estimateVersion: 1, estimateReviewRoundId: "round-a",
    designPlanVersion: 1, designPlanApprovedAt: at, designPlanApprovedById: "designer",
    subtotalRupees: 100_000, gstRupees: 0, totalRupees: 100_000,
    subtotalPaise: 10_000_000, gstPaise: 0, totalPaise: 10_000_000,
    lineItems: [line], allLineItems: [line] };
}
function preparation(): ProjectPurchaseOrderPreparationDto {
  return { projectId: "project-a", orderDefaults: { targetDate: "2026-12-01", deliveryLocation: "Site" },
    estimateSource: basket.estimateSource, approvedEstimatePaise: 10_000_000,
    committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 10_000_000,
    estimateLines: [{ key: "line-a", included: true, source: "configuration", itemType: "main_line",
      roomId: "room-a", roomName: "Living", mainBasketId: "basket-a", mainBasketName: "Painting",
      subBasketId: "sub-a", subBasketName: "Walls", mainLineId: "main-a", mainLineName: "Paint",
      quantity: "10", unit: "sq-ft", amountPaise: 10_000_000, itemIds: [], mode: basket.lines[0]!.mode }],
    sections: [], netPaise: null, itemCount: 0, readyItemCount: 0, blockers: [], digest };
}
let currentSource = sourceSnapshot();
let currentPreparation = preparation();

vi.mock("../src/services/procurement.service.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/services/procurement.service.js")>(),
  assertProcurementProjectAccess: vi.fn(async (actor: PublicUser, projectId: string) => {
    if (actor.role !== "procurement" || projectId !== "project-a") throw new ApiError(403, "FORBIDDEN", "Forbidden.");
  }),
  procurementItemSourceSnapshot: vi.fn(async () => currentSource)
}));
vi.mock("../src/services/procurement-basket.service.js", () => ({ preparedBaskets: vi.fn(async () => [basket]) }));
vi.mock("../src/services/project-purchase-order-preparation.service.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/services/project-purchase-order-preparation.service.js")>(),
  buildProjectPurchaseOrderPreparation: vi.fn(async () => currentPreparation)
}));
vi.mock("../src/services/procurement-basket-vendor-eligibility.service.js", () => ({
  assertBasketVendorEligible: vi.fn(async (vendorId: string) => ({ vendorId, code: vendorId.toUpperCase(),
    name: vendorId === "vendor-b" ? "Vendor B" : "Vendor A",
    contactEmail: `${vendorId}@example.test`, kpiScoreBps: 8_000,
    city: null, cityVersion: 0, cityMatch: "unknown", eligible: true, blockers: [] }))
}));
// The issue transaction is the subject here; vendor allocation gates have their own integration coverage.
vi.mock("../src/services/procurement-vendor-allocation.service.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/services/procurement-vendor-allocation.service.js")>(),
  prepareProcurementAllocation: vi.fn(async (input: { vendorId: string; allocatedWorkPaise: number }) => ({
    vendor: await AiEstimatorKnowledgeVendorModel.findById(input.vendorId).lean(),
    allocatedWorkPaise: input.allocatedWorkPaise, allocationTrackingVersion: 1 })),
  assertPurchaseOrderAllocations: vi.fn(async () => undefined)
}));

const audit = { appendInMongoTransaction: vi.fn(async () => ({})) } as unknown as AuditService;
let rawToken = "";
const rawTokens = new Map<string, string>();
const enquiries = createProcurementBasketEnquiryService({ audit, now: () => at,
  mailer: { deliveryKind: "local_test", sendRequest: async message => {
    rawToken = message.rawToken; rawTokens.set(message.recipient.email, message.rawToken);
  } } });
const awards = createProcurementBasketAwardService({ audit, now: () => at });
const committedReads: unknown[] = [];
const committed = vi.fn(async () => {
  // Await a non-session read inside the hook. A premature transactional wake
  // would observe no committed orders and cannot race the later commit.
  committedReads.push(await ProjectPurchaseOrderModel.find({ status: "approved" }).lean().exec());
});
const issue = createProjectPurchaseOrderBasketIssueService({ audit, now: () => at,
  onApproved: onPurchaseOrderApproved, onIssuedCommitted: committed });
const autoAwards = createProcurementBasketAwardService({ audit, now: () => at,
  onReadyToIssue: input => issue.issueAutomatically(input).then(() => undefined) });
const orders = createProjectPurchaseOrderService({ audit, now: () => at, onApproved: onPurchaseOrderApproved });
const monitor = createProjectPurchaseOrderBasketMonitorService({ audit, now: () => at,
  vendorPortalUrl: "https://portal.example.test" });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-basket-issue-tests");
  await Promise.all([ProjectModel, UserModel, AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeVendorModel,
    VendorKpiAssessmentModel, ProcurementBasketEnquiryModel, ProcurementBasketBoqRevisionModel,
    ProcurementBasketBidModel, ProcurementBasketAwardModel, ProjectProcurementItemModel,
    ProjectPurchaseOrderModel, ProjectPurchaseOrderRevisionModel, VendorWorkAssignmentModel]
    .map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  committed.mockClear(); committedReads.length = 0;
  rawToken = "";
  rawTokens.clear();
  basket.lines = [firstLine];
  basket.includedLineCount = 1;
  basket.classification = "special";
  basket.automaticSubVendor = false;
  basket.boqReady = true;
  basket.readyLineCount = 1;
  basket.workingTotalComplete = true;
  basket.standardCost = null;
  basket.approvedEstimatePaise = 10_000_000;
  firstLine.approvedAmountPaise = 10_000_000;
  firstLine.approvedQuantity = "10";
  basket.lines[0]!.baseUnitRatePaise = 50_000;
  basket.lines[0]!.standardCost = null;
  basket.lines[0]!.mode = manualMode;
  currentSource = sourceSnapshot();
  currentPreparation = preparation();
  await ProjectModel.create({ _id: "project-a", name: "Project A", status: "active", location: "Bengaluru",
    completionAuthority: "legacy_staff",
    clientName: "Test client", clientEmail: "client@example.test", clientEmailNormalized: "client@example.test",
    clientMobile: "9000000000", clientAddress: "Bengaluru",
    plannedStartAt: at, plannedEndAt: new Date("2026-12-01T00:00:00.000Z"),
    assignedDesignerIds: ["designer"] });
  await UserModel.create([{ _id: "buyer", name: "Buyer", email: "buyer@example.test", emailNormalized: "buyer@example.test",
    passwordHash: "fixture", role: "procurement", active: true },
  { _id: "designer", name: "Designer", email: "designer@example.test", emailNormalized: "designer@example.test",
    passwordHash: "fixture", role: "designer", active: true }]);
  await AiEstimatorKnowledgeBasketModel.collection.insertOne({ _id: "basket-a", name: "Painting",
    nameNormalized: "painting", displayOrder: 0, status: "active", version: 1, dependencyEpoch: 0,
    createdById: "buyer", updatedById: "buyer" });
  await AiEstimatorKnowledgeSubBasketModel.collection.insertOne({ _id: "sub-a", basketId: "basket-a",
    name: "Walls", nameNormalized: "walls", displayOrder: 0, version: 1, dependencyEpoch: 0,
    createdById: "buyer", updatedById: "buyer" });
  await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: "main-a", basketId: "basket-a",
    subBasketId: "sub-a", name: "Paint", nameNormalized: "paint", displayOrder: 0,
    status: "active", version: 1, dependencyEpoch: 0, createdById: "buyer", updatedById: "buyer" });
  await AiEstimatorKnowledgeUomModel.collection.insertOne({ _id: "uom-a", code: "SQFT", name: "Square foot",
    decimalScale: 2, status: "active", version: 1, dependencyEpoch: 3,
    displayOrder: 0, createdById: "buyer", updatedById: "buyer" });
  await AiEstimatorKnowledgeVendorModel.collection.insertOne({ _id: "vendor-a", name: "Vendor A", code: "VENDOR-A",
    status: "active", nameNormalized: "vendor a", codeNormalized: "vendor-a", kpiRubricGeneration: 0,
    procurementProfile: { vendorType: "execution", email: "vendor-a@example.test" } });
  await VendorKpiAssessmentModel.create({ _id: "assessment-vendor-a", vendorId: "vendor-a", source: "procurement",
    vendorType: "execution", rubricVersion: 1, rubricGeneration: 0, scores: [], averageScoreBps: 8_000,
    revision: 1, submittedAt: at, actorId: "buyer", idempotencyKey: "kpi-vendor-a", payloadHash: digest });
});
afterAll(async () => { await replica?.stop(); });

async function approvedAward(options: { unitPricePaise?: number; withChips?: boolean;
  legacyStored?: boolean; noLineTerms?: boolean; noTerms?: boolean } = {}) {
  const enquiry = await enquiries.create(buyer, "project-a", "basket-a", {
    expectedPreparationDigest: digest, idempotencyKey: "create-enquiry-key",
    lines: [{ sourceLineItemKey: "line-a" }] });
  const sent = await enquiries.dispatch(buyer, "project-a", "basket-a", enquiry.id, {
    expectedVersion: enquiry.version, expectedPreparationDigest: digest,
    idempotencyKey: "send-enquiry-key", vendorIds: ["vendor-a"] });
  const publicBoq = await enquiries.inspectVendorBoq(rawToken);
  const bid = await enquiries.submitVendorBid({ token: rawToken, idempotencyKey: "submit-bid-key",
    lines: [{ boqLineId: publicBoq.lines[0]!.id, unitPricePaise: options.unitPricePaise ?? 100_000, gstBasisPoints: 0 }] });
  const award = await awards.create(buyer, "project-a", "basket-a", sent.id, {
    expectedVersion: sent.version, idempotencyKey: "create-award-key", bidId: bid.bidId,
    advanceBasisPoints: 2_000, ...(options.noTerms ? {} : { terms: "Payment after verified milestones" }), designerId: null,
    milestoneReviewers: procurementReviewers,
    ...(options.noLineTerms ? {} : { lineTerms: [{ boqLineId: publicBoq.lines[0]!.id, scopeType: "execution" as const,
      targetDate: "2026-12-01", deliveryLocation: "Project site" }] }),
    nonRecommendedReason: null });
  if (options.legacyStored) {
    const proposal = await ProcurementBasketAwardRevisionModel.findById(award.proposalRevisionId).lean();
    if (!proposal) throw new Error("Saved proposal missing from legacy fixture.");
    const data = { awardId: proposal.awardId, enquiryId: proposal.enquiryId, projectId: proposal.projectId,
      revision: proposal.revision, boqRevisionId: proposal.boqRevisionId, boqDigest: proposal.boqDigest,
      bidId: proposal.bidId, bidDigest: proposal.bidDigest, vendorId: proposal.vendorId,
      vendorName: proposal.vendorName, officialKpiScoreBps: proposal.officialKpiScoreBps,
      officialKpiAssessmentId: proposal.officialKpiAssessmentId,
      officialKpiAssessmentRevision: proposal.officialKpiAssessmentRevision,
      recommendedBidId: proposal.recommendedBidId, comparisonDigest: proposal.comparisonDigest,
      nonRecommendedReason: proposal.nonRecommendedReason, totals: proposal.totals,
      approvedEstimatePaise: proposal.approvedEstimatePaise, committedNetPaise: proposal.committedNetPaise,
      terms: proposal.terms, lineTerms: proposal.lineTerms, advanceBasisPoints: proposal.advanceBasisPoints,
      milestones: proposal.milestones, requiredSlots: proposal.requiredSlots,
      budgetOverrideRequired: proposal.budgetOverrideRequired,
      programManagerId: proposal.programManagerId, designerId: proposal.designerId };
    expect(procurementBasketDigest(data)).toBe(proposal.proposalDigest);
    const legacyMilestones = proposal.milestones.map(({ reviewerSlots: _reviewerSlots, ...row }) => row);
    const legacyDigest = procurementBasketDigest({ ...data, milestones: legacyMilestones });
    await ProcurementBasketAwardRevisionModel.collection.updateOne({ _id: award.proposalRevisionId },
      { $set: { milestones: legacyMilestones, proposalDigest: legacyDigest } });
    await ProcurementBasketAwardModel.updateOne({ _id: award.id }, { $set: { lastMutationDigest: legacyDigest } });
    expect((await awards.get(buyer, "project-a", "basket-a", sent.id, award.id)).proposal.milestones
      .every(row => row.reviewerSlots === undefined)).toBe(true);
  }
  if (options.withChips) {
    expect(await awards.approvalQueue(buyer)).toEqual([]);
    await expect(issue.issue(buyer, "project-a", "basket-a", sent.id, award.id,
      { expectedVersion: award.version, idempotencyKey: "issue-unsubmitted-award" }))
      .rejects.toMatchObject({ status: 409 });
  }
  const submitted = await awards.submit(buyer, "project-a", "basket-a", sent.id, award.id,
    { expectedVersion: award.version, idempotencyKey: "submit-award-key" });
  if (options.withChips) {
    expect((await awards.approvalQueue(buyer)).map(row => row.awardId)).toEqual([award.id]);
    await expect(issue.issue(buyer, "project-a", "basket-a", sent.id, award.id,
      { expectedVersion: submitted.version, idempotencyKey: "issue-unapproved-award" }))
      .rejects.toMatchObject({ status: 409 });
  }
  const decided = await awards.decide(buyer, award.id, { expectedVersion: submitted.version,
    proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "approve-award-key",
    slot: "procurement", decision: "approve", reason: null });
  expect(decided.status).toBe("ready_to_issue");
  return { enquiryId: sent.id, awardId: award.id, awardVersion: decided.version, publicBoq };
}

async function counts() {
  return { children: await ProjectProcurementItemModel.countDocuments({ tenderAwardId: { $type: "string" } }),
    orders: await ProjectPurchaseOrderModel.countDocuments({ tenderAwardId: { $type: "string" } }),
    revisions: await ProjectPurchaseOrderRevisionModel.countDocuments({ tenderAwardId: { $type: "string" } }),
    assignments: await VendorWorkAssignmentModel.countDocuments({}) };
}

async function autoAward(options: { unitPricePaise?: number; reviewers?: Array<{ id: "advance" | "mobilisation" | "progress_50" | "progress_85" | "final";
  reviewerSlots: Array<"program_manager" | "designer" | "procurement" | "finance_head"> }>;
  service?: typeof autoAwards } = {}) {
  const service = options.service ?? autoAwards;
  const enquiry = await enquiries.create(buyer, "project-a", "basket-a", {
    expectedPreparationDigest: digest, idempotencyKey: "auto-create-enquiry",
    lines: [{ sourceLineItemKey: "line-a" }] });
  const sent = await enquiries.dispatch(buyer, "project-a", "basket-a", enquiry.id, {
    expectedVersion: enquiry.version, expectedPreparationDigest: digest,
    idempotencyKey: "auto-send-enquiry", vendorIds: ["vendor-a"] });
  const publicBoq = await enquiries.inspectVendorBoq(rawToken);
  const bid = await enquiries.submitVendorBid({ token: rawToken, idempotencyKey: "auto-submit-bid",
    lines: [{ boqLineId: publicBoq.lines[0]!.id, unitPricePaise: options.unitPricePaise ?? 440_000, gstBasisPoints: 0 }] });
  const award = await service.create(buyer, "project-a", "basket-a", sent.id, {
    expectedVersion: sent.version, idempotencyKey: "auto-create-award", bidId: bid.bidId,
    advanceBasisPoints: 2_000,
    milestoneReviewers: options.reviewers ?? procurementReviewers, nonRecommendedReason: null });
  const submitted = await service.submit(buyer, "project-a", "basket-a", sent.id, award.id,
    { expectedVersion: award.version, idempotencyKey: "auto-submit-award", autoIssueOnApproval: true });
  return { service, submitted, awardId: award.id, enquiryId: sent.id };
}

function useApprovedBudget(amountPaise: number, quantity = 10): void {
  basket.approvedEstimatePaise = amountPaise;
  firstLine.approvedAmountPaise = amountPaise;
  firstLine.approvedQuantity = String(quantity);
  Object.assign(currentPreparation, { approvedEstimatePaise: amountPaise, remainingPaise: amountPaise });
  Object.assign(currentPreparation.estimateLines[0]!, { amountPaise, quantity: String(quantity) });
  Object.assign(currentSource, { subtotalRupees: amountPaise / 100, totalRupees: amountPaise / 100,
    subtotalPaise: amountPaise, totalPaise: amountPaise });
  Object.assign(currentSource.lineItems[0]!, { amountPaise, quantity });
}

async function largeReviewers(): Promise<Array<{ id: "advance" | "mobilisation" | "progress_50" | "progress_85" | "final";
  reviewerSlots: Array<"program_manager" | "designer" | "procurement" | "finance_head"> }>> {
  await UserModel.create([{ _id: "site-manager", name: "Site Manager", email: "pm@example.test",
    emailNormalized: "pm@example.test", passwordHash: "fixture", role: "site_manager", active: true },
  { _id: "finance", name: "Finance", email: "finance@example.test",
    emailNormalized: "finance@example.test", passwordHash: "fixture", role: "finance_head", active: true },
  { _id: "super-admin", name: "Super Admin", email: "admin@example.test",
    emailNormalized: "admin@example.test", passwordHash: "fixture", role: "super_admin", active: true }]);
  await ProjectWorkflowTaskModel.create({ _id: "site-task-a", dedupeKey: "estimate-a:site",
    projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1,
    kind: "site_execution", title: "Site execution", assigneeRole: "site_manager", assigneeUserId: "site-manager", openedAt: at });
  await ProjectWorkflowTaskModel.create({ _id: "finance-task-a", dedupeKey: "finance-project-a",
    projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1,
    kind: "finance", title: "Finance review", assigneeRole: "finance_head", openedAt: at });
  return (["advance", "mobilisation", "progress_50", "progress_85", "final"] as const).map(id => ({
    id, reviewerSlots: id === "advance" ? ["program_manager" as const, "designer" as const]
      : id === "final" ? ["procurement" as const, "finance_head" as const] : [] }));
}

describe("approved basket award issuance", () => {
  it("directly issues a nonrecommended ₹141.60 award over budget with Procurement alone", async () => {
    useApprovedBudget(10_000, 1);
    await AiEstimatorKnowledgeVendorModel.collection.insertOne({ _id: "vendor-b", name: "Vendor B", code: "VENDOR-B",
      status: "active", nameNormalized: "vendor b", codeNormalized: "vendor-b", kpiRubricGeneration: 0,
      procurementProfile: { vendorType: "execution", email: "vendor-b@example.test" } });
    await VendorKpiAssessmentModel.create({ _id: "assessment-vendor-b", vendorId: "vendor-b", source: "procurement",
      vendorType: "execution", rubricVersion: 1, rubricGeneration: 0, scores: [], averageScoreBps: 8_000,
      revision: 1, submittedAt: at, actorId: buyer.id, idempotencyKey: "kpi-vendor-b", payloadHash: digest });
    const enquiry = await enquiries.create(buyer, "project-a", "basket-a", {
      expectedPreparationDigest: digest, idempotencyKey: "small-overbudget-enquiry",
      lines: [{ sourceLineItemKey: "line-a" }] });
    const sent = await enquiries.dispatch(buyer, "project-a", "basket-a", enquiry.id, {
      expectedVersion: enquiry.version, expectedPreparationDigest: digest,
      idempotencyKey: "small-overbudget-dispatch", vendorIds: ["vendor-a", "vendor-b"] });
    const tokenA = rawTokens.get("vendor-a@example.test")!;
    const tokenB = rawTokens.get("vendor-b@example.test")!;
    const boqLineId = (await enquiries.inspectVendorBoq(tokenA)).lines[0]!.id;
    const bidA = await enquiries.submitVendorBid({ token: tokenA, idempotencyKey: "small-overbudget-bid-a",
      lines: [{ boqLineId, unitPricePaise: 12_000, gstBasisPoints: 1_800 }] });
    const bidB = await enquiries.submitVendorBid({ token: tokenB, idempotencyKey: "small-overbudget-bid-b",
      lines: [{ boqLineId, unitPricePaise: 10_000, gstBasisPoints: 1_800 }] });
    expect((await autoAwards.comparison(buyer, "project-a", "basket-a", sent.id)).recommendedBidId).toBe(bidB.bidId);
    expect(await autoAwards.preview(buyer, "project-a", "basket-a", sent.id, {
      bidId: bidA.bidId, advanceBasisPoints: 2_000 })).toMatchObject({
      requiredSlots: ["procurement"], budgetOverrideRequired: false, totals: { totalPaise: 14_160 } });
    const award = await autoAwards.create(buyer, "project-a", "basket-a", sent.id, {
      expectedVersion: sent.version, idempotencyKey: "small-overbudget-award", bidId: bidA.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers });
    const submitted = await autoAwards.submit(buyer, "project-a", "basket-a", sent.id, award.id, {
      expectedVersion: award.version, idempotencyKey: "small-overbudget-submit", autoIssueOnApproval: true });
    const decision = { expectedVersion: submitted.version, proposalRevisionId: submitted.proposalRevisionId,
      idempotencyKey: "small-overbudget-approve", slot: "procurement" as const, decision: "approve" as const, reason: null };
    const issued = await autoAwards.decide(buyer, award.id, decision);
    expect(issued).toMatchObject({ status: "issued", issueBlocker: null, proposal: {
      approvedEstimatePaise: 10_000, committedNetPaise: 0, budgetOverrideRequired: false,
      nonRecommendedReason: null, requiredSlots: ["procurement"],
      totals: { netPaise: 12_000, gstPaise: 2_160, totalPaise: 14_160 } } });
    expect(await ProjectPurchaseOrderModel.findById(issued.issuedPurchaseOrderId).lean()).toMatchObject({
      approvedNetPaise: 12_000, approvedGstPaise: 2_160, approvedTotalPaise: 14_160 });
    expect((await autoAwards.decide(buyer, award.id, decision)).issuedPurchaseOrderId).toBe(issued.issuedPurchaseOrderId);
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
    expect(await ProcurementBasketAwardApprovalModel.find({ awardId: award.id }).lean())
      .toMatchObject([{ actorId: buyer.id, slot: "procurement", decision: "approve" }]);
  });

  it("retains the reasoned over-budget approval at exactly ₹50,000", async () => {
    useApprovedBudget(4_000_000);
    await largeReviewers();
    const { submitted, awardId } = await autoAward({ unitPricePaise: 500_000 });
    expect(submitted.proposal).toMatchObject({ budgetOverrideRequired: true,
      requiredSlots: ["procurement", "budget_override"], totals: { totalPaise: 5_000_000 } });
    const approved = await autoAwards.decide(buyer, awardId, { expectedVersion: submitted.version,
      proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "exact-threshold-procurement",
      slot: "procurement", decision: "approve", reason: null });
    expect(approved.status).toBe("pending_approvals");
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
    await expect(autoAwards.decide({ id: "super-admin", role: "super_admin" } as PublicUser, awardId, {
      expectedVersion: approved.version, proposalRevisionId: approved.proposalRevisionId,
      idempotencyKey: "exact-threshold-short-reason", slot: "budget_override", decision: "approve", reason: "short" }))
      .rejects.toMatchObject({ code: "PROCUREMENT_BASKET_OVERRIDE_REASON_REQUIRED" });
    const issued = await autoAwards.decide({ id: "super-admin", role: "super_admin" } as PublicUser, awardId, {
      expectedVersion: approved.version, proposalRevisionId: approved.proposalRevisionId,
      idempotencyKey: "exact-threshold-override", slot: "budget_override", decision: "approve",
      reason: "Approved after budget review" });
    expect(issued.status).toBe("issued");
  });

  it.each(["approve", "revise"] as const)("keeps a frozen small-order budget approval until %s", async action => {
    useApprovedBudget(4_000_000);
    await largeReviewers();
    const { submitted, awardId, enquiryId } = await autoAward();
    const stored = await ProcurementBasketAwardRevisionModel.findById(submitted.proposalRevisionId).lean();
    if (!stored) throw new Error("Saved proposal missing from historical fixture.");
    const metadata = new Set(["_id", "proposalDigest", "createdAt", "createdById", "withdrawnFromProposalRevisionId",
      "withdrawalReason", "withdrawalIdempotencyKey", "withdrawalRequestDigest"]);
    const data = Object.fromEntries(Object.entries(stored).filter(([key]) => !metadata.has(key)));
    expect(procurementBasketDigest(data)).toBe(stored.proposalDigest);
    const legacyRoute = { requiredSlots: ["procurement", "budget_override"], budgetOverrideRequired: true };
    const proposalDigest = procurementBasketDigest({ ...data, ...legacyRoute });
    await ProcurementBasketAwardRevisionModel.collection.updateOne({ _id: submitted.proposalRevisionId },
      { $set: { ...legacyRoute, proposalDigest } });
    await ProcurementBasketAwardModel.updateOne({ _id: awardId }, { $set: { lastMutationDigest: proposalDigest } });
    const approved = await autoAwards.decide(buyer, awardId, { expectedVersion: submitted.version,
      proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "legacy-small-procurement",
      slot: "procurement", decision: "approve", reason: null });
    expect(approved.status).toBe("pending_approvals");
    expect(approved.proposal.requiredSlots).toEqual(["procurement", "budget_override"]);
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
    if (action === "approve") {
      const issued = await autoAwards.decide({ id: "super-admin", role: "super_admin" } as PublicUser, awardId, {
        expectedVersion: approved.version, proposalRevisionId: approved.proposalRevisionId,
        idempotencyKey: "legacy-small-override", slot: "budget_override", decision: "approve",
        reason: "Approve the original frozen budget request" });
      expect(issued.status).toBe("issued");
    } else {
      const revised = await autoAwards.update(buyer, "project-a", "basket-a", enquiryId, awardId, {
        expectedVersion: approved.version, idempotencyKey: "legacy-small-revise",
        advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers });
      expect(revised.proposal).toMatchObject({ requiredSlots: ["procurement"], budgetOverrideRequired: false });
      const resubmitted = await autoAwards.submit(buyer, "project-a", "basket-a", enquiryId, awardId, {
        expectedVersion: revised.version, idempotencyKey: "legacy-small-resubmit", autoIssueOnApproval: true });
      const issued = await autoAwards.decide(buyer, awardId, { expectedVersion: resubmitted.version,
        proposalRevisionId: resubmitted.proposalRevisionId, idempotencyKey: "legacy-small-revised-approval",
        slot: "procurement", decision: "approve", reason: null });
      expect(issued.status).toBe("issued");
    }
    expect(await ProcurementBasketAwardRevisionModel.findById(submitted.proposalRevisionId).lean())
      .toMatchObject({ ...legacyRoute, proposalDigest });
  });

  it("automatically issues a ₹44,000 award after its Procurement approval and replays one order", async () => {
    const { submitted, awardId, enquiryId } = await autoAward();
    expect(submitted).toMatchObject({ status: "pending_approvals", autoIssueOnApproval: true, issueBlocker: null });
    expect((await autoAwards.approvalQueue(buyer)).map(row => row.awardId)).toEqual([awardId]);
    const decision = { expectedVersion: submitted.version, proposalRevisionId: submitted.proposalRevisionId,
      idempotencyKey: "auto-procurement-decision", slot: "procurement" as const,
      decision: "approve" as const, reason: null };
    const issued = await autoAwards.decide(buyer, awardId, decision);
    expect(issued).toMatchObject({ status: "issued", autoIssueOnApproval: true, issueBlocker: null });
    expect(issued.issuedPurchaseOrderId).toBeTruthy();
    expect(committed).toHaveBeenCalledTimes(1);
    expect(await committedReads[0]).toEqual([expect.objectContaining({ _id: issued.issuedPurchaseOrderId, status: "approved" })]);
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
    const replay = await autoAwards.decide(buyer, awardId, decision);
    expect(replay.issuedPurchaseOrderId).toBe(issued.issuedPurchaseOrderId);
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
    expect((await autoAwards.get(buyer, "project-a", "basket-a", enquiryId, awardId)).status).toBe("issued");
    expect((await autoAwards.approvalQueue(buyer))).toEqual([]);
    expect(audit.appendInMongoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      action: "procurement_basket_work_order_issued", actorId: buyer.id,
      newValues: expect.objectContaining({ issueTrigger: "automatic_approval", triggeringApprovalActorId: buyer.id,
        submittedById: buyer.id }) }), expect.anything());
  });

  it("waits for all four high-value roles before automatic issue", async () => {
    const reviewers = await largeReviewers();
    const { submitted, awardId } = await autoAward({ unitPricePaise: 500_001, reviewers });
    expect(submitted.proposal.requiredSlots).toEqual(["program_manager", "designer", "procurement", "finance_head"]);
    let current = submitted;
    for (const [actor, slot] of [
      [{ id: "site-manager", role: "site_manager" }, "program_manager"],
      [{ id: "designer", role: "designer" }, "designer"],
      [buyer, "procurement"]
    ] as const) {
      current = await autoAwards.decide(actor as PublicUser, awardId, { expectedVersion: current.version,
        proposalRevisionId: current.proposalRevisionId, idempotencyKey: `auto-approve-${slot}`,
        slot, decision: "approve", reason: null });
      expect(current.status).toBe("pending_approvals");
      expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
    }
    current = await autoAwards.decide({ id: "finance", role: "finance_head" } as PublicUser, awardId, {
      expectedVersion: current.version, proposalRevisionId: current.proposalRevisionId,
      idempotencyKey: "auto-approve-finance", slot: "finance_head", decision: "approve", reason: null });
    expect(current.status).toBe("issued");
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
    expect((await ProcurementBasketAwardApprovalModel.find({ awardId }).lean())).toHaveLength(4);
    expect(audit.appendInMongoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      action: "procurement_basket_work_order_issued", actorId: buyer.id,
      newValues: expect.objectContaining({ issueTrigger: "automatic_approval",
        triggeringApprovalActorId: "finance", submittedById: buyer.id }) }), expect.anything());
  });

  it("waits for a reasoned budget override before automatic issue", async () => {
    const reviewers = await largeReviewers();
    const { submitted, awardId } = await autoAward({ unitPricePaise: 1_100_000, reviewers });
    expect(submitted.proposal.requiredSlots).toContain("budget_override");
    let current = submitted;
    for (const [actor, slot] of [
      [{ id: "site-manager", role: "site_manager" }, "program_manager"],
      [{ id: "designer", role: "designer" }, "designer"],
      [buyer, "procurement"],
      [{ id: "finance", role: "finance_head" }, "finance_head"]
    ] as const) {
      current = await autoAwards.decide(actor as PublicUser, awardId, { expectedVersion: current.version,
        proposalRevisionId: current.proposalRevisionId, idempotencyKey: `auto-override-${slot}`,
        slot, decision: "approve", reason: null });
    }
    expect(current.status).toBe("pending_approvals");
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
    current = await autoAwards.decide({ id: "super-admin", role: "super_admin" } as PublicUser, awardId, {
      expectedVersion: current.version, proposalRevisionId: current.proposalRevisionId,
      idempotencyKey: "auto-approve-budget-override", slot: "budget_override",
      decision: "approve", reason: "Approved after budget review" });
    expect(current.status).toBe("issued");
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
  });

  it("retries a committed final decision after a transient auto-issue failure", async () => {
    let failOnce = true;
    const service = createProcurementBasketAwardService({ audit, now: () => at,
      onReadyToIssue: async input => {
        if (failOnce) { failOnce = false; throw new Error("transient issue outage"); }
        await issue.issueAutomatically(input);
      } });
    const { submitted, awardId } = await autoAward({ service });
    const decision = { expectedVersion: submitted.version, proposalRevisionId: submitted.proposalRevisionId,
      idempotencyKey: "auto-replay-decision", slot: "procurement" as const,
      decision: "approve" as const, reason: null };
    const blocked = await service.decide(buyer, awardId, decision);
    expect(blocked.status).toBe("ready_to_issue");
    expect(blocked.issueBlocker).not.toBeNull();
    const issued = await service.decide(buyer, awardId, decision);
    expect(issued.status).toBe("issued");
    expect(issued.issueBlocker).toBeNull();
    expect((await ProcurementBasketAwardApprovalModel.find({ awardId }).lean())).toHaveLength(1);
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
  });

  it("keeps one work order under concurrent final-decision requests", async () => {
    const { submitted, awardId } = await autoAward();
    const decision = { expectedVersion: submitted.version, proposalRevisionId: submitted.proposalRevisionId,
      idempotencyKey: "auto-concurrent-decision", slot: "procurement" as const,
      decision: "approve" as const, reason: null };
    const results = await Promise.allSettled([autoAwards.decide(buyer, awardId, decision),
      autoAwards.decide(buyer, awardId, decision)]);
    expect(results.some(result => result.status === "fulfilled")).toBe(true);
    expect((await ProcurementBasketAwardModel.findById(awardId).lean())?.status).toBe("issued");
    expect((await ProcurementBasketAwardApprovalModel.find({ awardId }).lean())).toHaveLength(1);
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
  });

  it("keeps final approvals and a safe blocker when auto issue fails, then clears it on Procurement retry", async () => {
    const failing = createProjectPurchaseOrderBasketIssueService({ audit, now: () => at,
      onApproved: async () => { throw new Error("internal assignment detail"); } });
    const service = createProcurementBasketAwardService({ audit, now: () => at,
      onReadyToIssue: input => failing.issueAutomatically(input).then(() => undefined) });
    const { submitted, awardId, enquiryId } = await autoAward({ service });
    const decided = await service.decide(buyer, awardId, { expectedVersion: submitted.version,
      proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "auto-failed-decision",
      slot: "procurement", decision: "approve", reason: null });
    expect(decided).toMatchObject({ status: "ready_to_issue", issueBlocker: {
      code: "PROCUREMENT_BASKET_ISSUE_BLOCKED" } });
    expect(decided.issueBlocker?.message).not.toContain("internal assignment detail");
    expect((await ProcurementBasketAwardApprovalModel.find({ awardId }).lean())).toHaveLength(1);
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
    const retried = await issue.issue(buyer, "project-a", "basket-a", enquiryId, awardId,
      { expectedVersion: decided.version, idempotencyKey: "manual-retry-auto-failure" });
    expect(retried.status).toBe("issued");
    expect((await service.get(buyer, "project-a", "basket-a", enquiryId, awardId)).issueBlocker).toBeNull();
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
  });
  it("retains frozen work-order terms from a historical BOQ when its proposal predates line terms", () => {
    const historicalLine = { id: "legacy-boq-line", scopeType: "supply" as const,
      targetDate: "2026-12-01", deliveryLocation: "Project site" };
    expect(resolveProcurementBasketAwardLineTerms(undefined, [historicalLine], true)).toEqual([{
      boqLineId: historicalLine.id, scopeType: "supply", targetDate: "2026-12-01",
      deliveryLocation: "Project site" }]);
    expect(() => resolveProcurementBasketAwardLineTerms([{ boqLineId: historicalLine.id,
      scopeType: "execution", targetDate: "2026-12-01", deliveryLocation: "Project site" }],
    [historicalLine])).toThrow("Revise and resend the BOQ");
  });

  it("issues and locks a ₹44,000 order only after its Procurement chip task is approved", async () => {
    const ready = await approvedAward({ unitPricePaise: 440_000, withChips: true });
    expect((await awards.get(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId))
      .proposal.milestones.map(row => row.reviewerSlots)).toEqual(Array.from({ length: 5 }, () => ["procurement"]));
    const issued = await issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: "issue-chip-approved-award" });
    expect(issued.status).toBe("issued");
    expect((await ProjectPurchaseOrderModel.findById(issued.purchaseOrderId).lean())?.approvedTotalPaise).toBe(4_400_000);
    expect((await awards.get(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId)).status).toBe("issued");
  });

  it("still issues an approved proposal persisted before payment-row approvers existed", async () => {
    const ready = await approvedAward({ legacyStored: true });
    const issued = await issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: "issue-stored-legacy-proposal" });
    expect(issued.status).toBe("issued");
  });

  it("issues an approved basket without work order terms or per-line details", async () => {
    const ready = await approvedAward({ noLineTerms: true, noTerms: true });
    const proposal = await awards.get(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId);
    expect(proposal.proposal.lineTerms).toBeUndefined();
    expect(proposal.proposal.terms).toBeNull();
    const issued = await issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: "issue-with-no-line-terms" });
    const order = await ProjectPurchaseOrderModel.findById(issued.purchaseOrderId).lean();
    const revision = await ProjectPurchaseOrderRevisionModel.findById(order?.approvedRevisionId).lean();
    const assignment = await VendorWorkAssignmentModel.findOne({ orderId: issued.purchaseOrderId }).lean();
    expect(issued.status).toBe("issued");
    expect(order?.terms).toBeNull();
    expect(revision?.terms).toBeNull();
    for (const line of [order?.draftLines[0], revision?.lines[0], assignment]) {
      expect(line).toBeTruthy();
      expect(line).not.toHaveProperty("scopeType");
      expect(line).not.toHaveProperty("targetDate");
      expect(line).not.toHaveProperty("deliveryLocation");
    }
    const orderDetail = await orders.get(buyer, "project-a", issued.purchaseOrderId);
    expect(orderDetail.terms).toBeNull();
    expect(orderDetail.revisions[0]?.terms).toBeNull();
    expect(orderDetail.draftLines[0]).toMatchObject({ scopeType: null, targetDate: null, deliveryLocation: null });
    expect(orderDetail.revisions[0]?.lines[0]).toMatchObject({ scopeType: null, targetDate: null, deliveryLocation: null });
    const packageDetail = await monitor.get(buyer, "project-a", "basket-a", ready.awardId);
    expect(packageDetail.order.terms).toBeNull();
    expect(packageDetail.order.lines[0]).toMatchObject({ targetDate: null, deliveryLocation: null });
  });

  it("issues an automatic Standard basket from observed saved Configuration without a mode decision or cost leak", async () => {
    useObservedStandardCost();
    const ready = await approvedAward();
    expect(ready.publicBoq.lines[0]).toMatchObject({ description: "Paint", uomCode: "SQFT" });
    expect(ready.publicBoq.lines[0]).not.toHaveProperty("scopeType");
    expect(ready.publicBoq.lines[0]).not.toHaveProperty("targetDate");
    const approved = await awards.get(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId);
    expect(approved.proposal.milestones.every(row => row.reviewerSlots?.includes("procurement"))).toBe(true);
    expect(approved.proposal.lineTerms).toEqual([{ boqLineId: ready.publicBoq.lines[0]!.id,
      scopeType: "execution", targetDate: "2026-12-01", deliveryLocation: "Project site" }]);
    expect(ready.publicBoq.lines[0]).not.toHaveProperty("baseCostPaise");
    expect(ready.publicBoq.lines[0]).not.toHaveProperty("adjustedCostPaise");
    const issued = await issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: "automatic-standard-issue" });
    expect(issued.status).toBe("issued");
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
    expect(await ProjectPurchaseOrderModel.findById(issued.purchaseOrderId).lean()).toMatchObject({
      approvedNetPaise: 1_000_000, tenderAwardId: ready.awardId,
      draftLines: [{ scopeType: "execution", targetDate: "2026-12-01", deliveryLocation: "Project site" }] });
  });

  it("rejects award terms that do not match the frozen BOQ line", async () => {
    const ready = await approvedAward();
    const saved = await awards.get(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId);
    await expect(awards.update(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId, {
      expectedVersion: ready.awardVersion, idempotencyKey: "wrong-award-line-terms", bidId: saved.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
      terms: "Payment after verified milestones", designerId: null,
      lineTerms: [{ boqLineId: "another-line", scopeType: "execution", targetDate: "2026-12-01",
        deliveryLocation: "Project site" }], nonRecommendedReason: null
    })).rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_AWARD_LINE_TERMS_REQUIRED" });
    expect((await awards.get(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId)).proposalRevisionId)
      .toBe(saved.proposalRevisionId);
  });

  it("blocks award preview when a historical BOQ description differs from the approved line", async () => {
    const ready = await approvedAward();
    const saved = await awards.get(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId);
    await ProcurementBasketBoqRevisionModel.collection.updateOne({ _id: saved.proposal.boqRevisionId },
      { $set: { "lines.0.description": "Different painting work" } });
    await expect(awards.preview(buyer, "project-a", "basket-a", ready.enquiryId,
      { bidId: saved.bidId, advanceBasisPoints: 2_000 }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_SOURCE_CHANGED" });
  });

  it.each([
    ["description", "Different painting work"],
    ["quantityMilliUnits", 9_000]
  ] as const)("blocks issue when a historical BOQ %s differs from the approved line", async (field, value) => {
    const ready = await approvedAward();
    const saved = await awards.get(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId);
    await ProcurementBasketBoqRevisionModel.collection.updateOne({ _id: saved.proposal.boqRevisionId },
      { $set: { [`lines.0.${field}`]: value } });
    await expect(issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: `changed-${field}-issue` }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_ISSUE_CONFLICT" });
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
  });

  it("blocks issue if another included Standard line loses its Sub-vendor cost after award approval", async () => {
    useObservedStandardCost();
    const ready = await approvedAward();
    basket.lines.push({ ...basket.lines[0]!, sourceLineItemKey: "line-b", roomId: "room-b",
      approvedAmountPaise: 5_000_000, baseUnitRatePaise: null,
      standardCost: { state: "unavailable", mode: "sub_vendor", calculationQuantity: "10",
        baseRates: [], baseCostPaise: null, adjustedCostPaise: null,
        issues: [{ code: "CALCULATION_NOT_CONFIGURED", message: "Sub-vendor calculation is unavailable." }] } });
    basket.includedLineCount = 2;
    basket.boqReady = false;
    await expect(issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: "invalid-standard-cost" }))
      .rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
  });
  it("issues a revised draft award against the latest redispatched BOQ and bid", async () => {
    const enquiry = await enquiries.create(buyer, "project-a", "basket-a", {
      expectedPreparationDigest: digest, idempotencyKey: "create-revision-enquiry",
      lines: [{ sourceLineItemKey: "line-a" }] });
    const firstDispatch = await enquiries.dispatch(buyer, "project-a", "basket-a", enquiry.id, {
      expectedVersion: enquiry.version, expectedPreparationDigest: digest,
      idempotencyKey: "first-revision-dispatch", vendorIds: ["vendor-a"] });
    const firstBoq = await enquiries.inspectVendorBoq(rawToken);
    const firstBid = await enquiries.submitVendorBid({ token: rawToken, idempotencyKey: "first-revision-bid",
      lines: [{ boqLineId: firstBoq.lines[0]!.id, unitPricePaise: 110_000, gstBasisPoints: 0 }] });
    const award = await awards.create(buyer, "project-a", "basket-a", enquiry.id, {
      expectedVersion: firstDispatch.version, idempotencyKey: "first-revision-award", bidId: firstBid.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
      terms: "Payment after verified milestones", designerId: null,
      lineTerms: [{ boqLineId: firstBoq.lines[0]!.id, scopeType: "execution",
        targetDate: "2026-12-01", deliveryLocation: "Site" }],
      nonRecommendedReason: null });
    const beforeRevision = await enquiries.get(buyer, "project-a", "basket-a", enquiry.id);
    const revisedBoq = await enquiries.update(buyer, "project-a", "basket-a", enquiry.id, {
      expectedVersion: beforeRevision.version, expectedPreparationDigest: digest,
      idempotencyKey: "revise-boq",
      lines: [{ sourceLineItemKey: "line-a" }] });
    const secondDispatch = await enquiries.dispatch(buyer, "project-a", "basket-a", enquiry.id, {
      expectedVersion: revisedBoq.version, expectedPreparationDigest: digest,
      idempotencyKey: "second-revision-dispatch", vendorIds: ["vendor-a"] });
    const secondBoq = await enquiries.inspectVendorBoq(rawToken);
    const secondBid = await enquiries.submitVendorBid({ token: rawToken, idempotencyKey: "second-revision-bid",
      lines: [{ boqLineId: secondBoq.lines[0]!.id, unitPricePaise: 100_000, gstBasisPoints: 0 }] });
    const updated = await awards.update(buyer, "project-a", "basket-a", enquiry.id, award.id, {
      expectedVersion: award.version, idempotencyKey: "revised-award-proposal", bidId: secondBid.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
      terms: "Payment after verified milestones", designerId: null,
      lineTerms: [{ boqLineId: secondBoq.lines[0]!.id, scopeType: "execution",
        targetDate: "2026-12-15", deliveryLocation: "Site" }],
      nonRecommendedReason: null });
    const submitted = await awards.submit(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: updated.version, idempotencyKey: "submit-revised-award" });
    const decided = await awards.decide(buyer, award.id, { expectedVersion: submitted.version,
      proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "approve-revised-award",
      slot: "procurement", decision: "approve", reason: null });
    const issued = await issue.issue(buyer, "project-a", "basket-a", enquiry.id, award.id,
      { expectedVersion: decided.version, idempotencyKey: "issue-revised-award" });
    expect(issued.status).toBe("issued");
    expect((await ProcurementBasketAwardModel.findById(award.id).lean())?.boqRevisionId).toBe(secondDispatch.boqRevisionId);
    expect(await ProjectPurchaseOrderModel.findById(issued.purchaseOrderId).lean()).toMatchObject({
      approvedNetPaise: 1_000_000, tenderAwardId: award.id });
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
  });

  it("issues only after a withdrawn approved award receives a revised BOQ, bid and fresh approval", async () => {
    const ready = await approvedAward();
    const original = await awards.get(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId);
    const withdrawn = await awards.withdraw(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: "withdraw-before-issue", reason: "Painting scope and delivery date changed" });
    expect(withdrawn).toMatchObject({ status: "draft", requiresRevision: true, approvals: [] });
    expect(withdrawn.proposalRevisionId).not.toBe(original.proposalRevisionId);
    await expect(issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: withdrawn.version, idempotencyKey: "issue-withdrawn-award" })).rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });

    const current = await enquiries.get(buyer, "project-a", "basket-a", ready.enquiryId);
    const updatedBoq = await enquiries.update(buyer, "project-a", "basket-a", ready.enquiryId, {
      expectedVersion: current.version, expectedPreparationDigest: digest, idempotencyKey: "withdrawn-revise-boq",
      lines: [{ sourceLineItemKey: "line-a" }] });
    const sent = await enquiries.dispatch(buyer, "project-a", "basket-a", ready.enquiryId, {
      expectedVersion: updatedBoq.version, expectedPreparationDigest: digest,
      idempotencyKey: "withdrawn-send-boq", vendorIds: ["vendor-a"] });
    const vendorBoq = await enquiries.inspectVendorBoq(rawToken);
    const newBid = await enquiries.submitVendorBid({ token: rawToken, idempotencyKey: "withdrawn-new-bid",
      lines: [{ boqLineId: vendorBoq.lines[0]!.id, unitPricePaise: 95_000, gstBasisPoints: 0 }] });
    const revised = await awards.update(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId, {
      expectedVersion: withdrawn.version, idempotencyKey: "withdrawn-new-proposal", bidId: newBid.bidId,
      advanceBasisPoints: 2_000, milestoneReviewers: procurementReviewers,
      terms: "Payment after verified milestones", designerId: null,
      lineTerms: [{ boqLineId: vendorBoq.lines[0]!.id, scopeType: "execution",
        targetDate: "2026-12-15", deliveryLocation: "Project site" }],
      nonRecommendedReason: null });
    expect(revised).toMatchObject({ status: "draft", requiresRevision: false, approvals: [] });
    expect(revised.proposalRevisionId).not.toBe(withdrawn.proposalRevisionId);
    const submitted = await awards.submit(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: revised.version, idempotencyKey: "withdrawn-submit-proposal" });
    const approved = await awards.decide(buyer, ready.awardId, { expectedVersion: submitted.version,
      proposalRevisionId: submitted.proposalRevisionId, idempotencyKey: "withdrawn-fresh-approval",
      slot: "procurement", decision: "approve", reason: null });
    const issued = await issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: approved.version, idempotencyKey: "withdrawn-issue-award" });
    expect(issued.status).toBe("issued");
    expect((await ProcurementBasketAwardModel.findById(ready.awardId).lean())?.boqRevisionId).toBe(sent.boqRevisionId);
    expect(await ProjectPurchaseOrderModel.findById(issued.purchaseOrderId).lean()).toMatchObject({
      approvedNetPaise: 950_000, tenderAwardId: ready.awardId });
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
  });

  it("atomically creates an approved PO, purchase child and vendor assignment, then replays only its original key", async () => {
    const ready = await approvedAward();
    const request = { expectedVersion: ready.awardVersion, idempotencyKey: "issue-award-key" };
    const result = await issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId, request);
    expect(result).toMatchObject({ awardId: ready.awardId, status: "issued", orderNumber: expect.stringMatching(/^PO-/u) });
    expect(committed).toHaveBeenCalledTimes(1);
    expect(await committedReads[0]).toEqual([expect.objectContaining({ _id: result.purchaseOrderId, status: "approved" })]);
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
    expect(await ProjectPurchaseOrderModel.findById(result.purchaseOrderId).lean()).toMatchObject({
      status: "approved", tenderAwardId: ready.awardId, approvedNetPaise: 1_000_000,
      approvedGstPaise: 0, approvedTotalPaise: 1_000_000 });
    expect((await AiEstimatorKnowledgeUomModel.findById("uom-a").lean())?.dependencyEpoch).toBe(3);
    expect(await issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId, request)).toEqual(result);
    expect(committed).toHaveBeenCalledTimes(2);
    expect(await committedReads[1]).toEqual([expect.objectContaining({ _id: result.purchaseOrderId, status: "approved" })]);
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
    await expect(issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { ...request, idempotencyKey: "different-issue-key" })).rejects.toMatchObject({ status: 409,
      code: "PROCUREMENT_BASKET_ALREADY_ISSUED" });
  });

  it("rejects stale versions and changed approved sources without leaving a partial order", async () => {
    const ready = await approvedAward();
    await expect(issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion - 1, idempotencyKey: "stale-version-key" }))
      .rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
    currentSource = { ...currentSource, estimateVersion: 2 };
    await expect(issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: "changed-source-key" }))
      .rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
    expect((await ProcurementBasketAwardModel.findById(ready.awardId).lean())?.status).toBe("ready_to_issue");
  });

  it("serializes concurrent issue attempts into one order and one set of children", async () => {
    const ready = await approvedAward();
    const request = { expectedVersion: ready.awardVersion, idempotencyKey: "concurrent-issue-key" };
    const outcomes = await Promise.allSettled([
      issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId, request),
      issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId, request)
    ]);
    const successes = outcomes.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof issue.issue>>> =>
      result.status === "fulfilled");
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(new Set(successes.map(result => result.value.purchaseOrderId)).size).toBe(1);
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
    const stored = await ProcurementBasketAwardModel.findById(ready.awardId).lean();
    expect(stored?.issuedPurchaseOrderId).toBe(successes[0]!.value.purchaseOrderId);
  });

  it("rolls back the child, order and authority change if assignment creation fails late in the transaction", async () => {
    const ready = await approvedAward();
    const failing = createProjectPurchaseOrderBasketIssueService({ audit, now: () => at,
      onApproved: async () => { throw new Error("assignment unavailable"); }, onIssuedCommitted: committed });
    await expect(failing.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: "failed-issue-key" })).rejects.toThrow("assignment unavailable");
    expect(await counts()).toEqual({ children: 0, orders: 0, revisions: 0, assignments: 0 });
    expect((await ProjectModel.findById("project-a").lean())?.completionAuthority).toBe("legacy_staff");
    expect(committed).not.toHaveBeenCalled();
    expect((await ProcurementBasketAwardModel.findById(ready.awardId).lean())?.status).toBe("ready_to_issue");
    const result = await issue.issue(buyer, "project-a", "basket-a", ready.enquiryId, ready.awardId,
      { expectedVersion: ready.awardVersion, idempotencyKey: "retry-issue-key" });
    expect(result.status).toBe("issued");
    expect(await counts()).toEqual({ children: 1, orders: 1, revisions: 1, assignments: 1 });
  });
});
