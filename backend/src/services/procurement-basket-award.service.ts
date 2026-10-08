import type { ClientSession, PipelineStage } from "mongoose";
import { averageProcurementBasketBidNetPaise, compareProcurementBasketBids, procurementBasketDigest, procurementBasketPaymentSchedule,
  requiredProcurementBasketApprovalSlots, withProcurementBasketMilestoneReviewers,
  procurementBasketMilestoneReviewersSchema, PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE,
  type ProcurementBasketMilestoneReviewersInput, type ProcurementBasketAwardCreateInput,
  type ProcurementBasketAwardLineTerms, type ProcurementBasketAwardUpdateInput, type ProcurementBasketAwardWithdrawInput,
  type ProcurementBasketAwardDecisionInput,
  type ProcurementBasketBoqLine, type ProcurementBasketComparisonBid, type ProcurementBasketComparisonRow,
  type ProcurementBasketPaymentMilestone } from "../domain/procurement-basket-tender.js";
import { calculateProcurementBasketBid } from "../domain/procurement-basket-tender.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProcurementBasketAwardApprovalModel, ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel,
  ProcurementBasketBidModel, ProcurementBasketBoqRevisionModel, ProcurementBasketCounterofferModel,
  ProcurementBasketEnquiryModel, ProcurementBasketInvitationModel } from "../models/ProcurementBasketTender.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { UserModel } from "../models/User.js";
import { VendorKpiAssessmentModel } from "../models/VendorKpiAssessment.js";
import { VENDOR_KPI_RUBRIC_VERSION } from "../domain/vendor-kpi.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { assertBasketVendorEligible } from "./procurement-basket-vendor-eligibility.service.js";
import { assertBasketSourceUnreserved, basketVendorScopeMatchesRevision, currentBasket, getBasketEnquiry, getCurrentBoq,
  requireBasketBuyer, tenderConflict, tenderId, tenderIso, tenderTransaction, type TenderRow }
  from "./procurement-basket-tender-support.service.js";
import { buildProjectPurchaseOrderPreparation } from "./project-purchase-order-preparation.service.js";
import { requireFinanceProjectAccess } from "./project-finance.service.js";
import { assertBasketFrozenApprovers, requireBasketProjectApprovers, resolveBasketProjectApprovers,
  type BasketProjectApprovers } from "./procurement-basket-approvers.service.js";

export interface ProcurementBasketComparisonLine {
  boqLineId: string; description: string; quantityMilliUnits: number; uomCode: string;
  unitPricePaise: number; gstBasisPoints: number; netPaise: number; gstPaise: number; totalPaise: number;
}
export interface ProcurementBasketComparisonRowDto extends ProcurementBasketComparisonRow {
  bidRevision: number; lines: ProcurementBasketComparisonLine[];
}
export type ProcurementBasketAwardLineTerm = ProcurementBasketAwardLineTerms;
export interface ProcurementBasketComparisonDto {
  enquiryId: string; boqRevisionId: string; boqDigest: string; comparisonDigest: string;
  rows: ProcurementBasketComparisonRowDto[]; averageBidNetPaise: number | null;
  recommendedBidId: string | null; awardId: string | null;
  bidHistory: Array<{ bidId: string; vendorId: string; revision: number; submittedAt: string;
    totals: { netPaise: number; gstPaise: number; totalPaise: number }; lines: ProcurementBasketComparisonLine[] }>;
  bidHistoryHasMore: boolean;
  counteroffers: Array<{ id: string; vendorId: string; priorBidId: string; reason: string;
    targetNetPaise: number | null; requestedById: string; requestedAt: string;
    invitationStatus: string; answeredBidId: string | null }>;
  counteroffersHasMore: boolean;
}
export interface ProcurementBasketAwardDto {
  id: string; enquiryId: string; projectId: string; mainBasketId: string; version: number;
  status: "draft" | "pending_approvals" | "ready_to_issue" | "issued" | "rejected";
  requiresRevision: boolean;
  autoIssueOnApproval: boolean;
  issueBlocker: { code: string; message: string } | null;
  vendorId: string; bidId: string; proposalRevisionId: string; issuedPurchaseOrderId: string | null;
  withdrawal: { priorProposalRevisionId: string; reason: string; withdrawnAt: string; withdrawnById: string } | null;
  proposal: {
    revision: number; proposalDigest: string; boqRevisionId: string; bidId: string; vendorId: string; vendorName: string;
    totals: { netPaise: number; gstPaise: number; totalPaise: number };
    approvedEstimatePaise: number; committedNetPaise: number;
    terms: string | null; lineTerms?: ProcurementBasketAwardLineTerm[];
    advanceBasisPoints: number; milestones: ProcurementBasketPaymentMilestone[];
    requiredSlots: string[]; budgetOverrideRequired: boolean;
    recommendedBidId: string | null; nonRecommendedReason: string | null;
    programManagerId: string | null; designerId: string | null;
    officialKpiAssessmentId: string; officialKpiAssessmentRevision: number;
  };
  approvals: Array<{ slot: string; actorId: string; decision: "approve" | "reject"; reason: string | null; decidedAt: string }>;
  lines: ProcurementBasketComparisonLine[];
}

export interface ProcurementBasketAwardPreviewDto extends BasketProjectApprovers {
  bidId: string; vendorId: string; vendorName: string;
  totals: { netPaise: number; gstPaise: number; totalPaise: number };
  milestones: ProcurementBasketPaymentMilestone[]; requiredSlots: string[]; budgetOverrideRequired: boolean;
  recommendedBidId: string | null; designerOptions: Array<{ id: string; name: string }>;
  programManagerId: string | null; lines: ProcurementBasketComparisonLine[];
}

export interface ProcurementBasketAwardService {
  comparison(actor: PublicUser, projectId: string, basketId: string, enquiryId: string): Promise<ProcurementBasketComparisonDto>;
  preview(actor: PublicUser, projectId: string, basketId: string, enquiryId: string,
    input: { bidId: string; advanceBasisPoints: number; designerId?: string | null;
      milestoneReviewers?: ProcurementBasketMilestoneReviewersInput }): Promise<ProcurementBasketAwardPreviewDto>;
  create(actor: PublicUser, projectId: string, basketId: string, enquiryId: string,
    input: ProcurementBasketAwardCreateInput): Promise<ProcurementBasketAwardDto>;
  get(actor: PublicUser, projectId: string, basketId: string, enquiryId: string, awardId: string): Promise<ProcurementBasketAwardDto>;
  update(actor: PublicUser, projectId: string, basketId: string, enquiryId: string, awardId: string,
    input: ProcurementBasketAwardUpdateInput): Promise<ProcurementBasketAwardDto>;
  withdraw(actor: PublicUser, projectId: string, basketId: string, enquiryId: string, awardId: string,
    input: ProcurementBasketAwardWithdrawInput): Promise<ProcurementBasketAwardDto>;
  submit(actor: PublicUser, projectId: string, basketId: string, enquiryId: string, awardId: string,
    input: { expectedVersion: number; idempotencyKey: string; autoIssueOnApproval?: boolean }): Promise<ProcurementBasketAwardDto>;
  approvalQueue(actor: PublicUser): Promise<Array<{ awardId: string; projectId: string; enquiryId: string; mainBasketId: string;
    projectName: string; basketName: string; vendorName: string; grossPaise: number; slot: string; status: string }>>;
  approvalDetail(actor: PublicUser, awardId: string): Promise<ProcurementBasketAwardDto>;
  decide(actor: PublicUser, awardId: string, input: ProcurementBasketAwardDecisionInput): Promise<ProcurementBasketAwardDto>;
}

export function createProcurementBasketAwardService({ audit, now = () => new Date(), onReadyToIssue }:
  { audit: AuditService; now?: () => Date;
    onReadyToIssue?: (input: { awardId: string; proposalRevisionId: string; expectedVersion: number;
      triggeringApprovalId: string; triggeringApprovalActorId: string }) => Promise<void> }): ProcurementBasketAwardService {
  const get = (actor: PublicUser, projectId: string, basketId: string, enquiryId: string, awardId: string) =>
    tenderTransaction(async session => {
      await requireBasketBuyer(actor, projectId, session);
      return awardDto(await scopedAward(awardId, projectId, basketId, enquiryId, session), session);
    });
  return {
    comparison(actor, projectId, basketId, enquiryId) {
      return tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        return readComparison(enquiry, session, false);
      });
    },
    preview(actor, projectId, basketId, enquiryId, input) {
      return tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const calculation = await prepareAward(enquiry, input.bidId, input.advanceBasisPoints, input.designerId ?? null,
          session, input.milestoneReviewers);
        return calculation.preview;
      });
    },
    async create(actor, projectId, basketId, enquiryId, input) {
      if (!procurementBasketMilestoneReviewersSchema.safeParse(input.milestoneReviewers).success)
        throw new ApiError(400, "PROCUREMENT_BASKET_MILESTONE_REVIEWERS_REQUIRED",
          "Select payment-row approvers before saving the work-order proposal.");
      const awardId = await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const createRequestDigest = procurementBasketDigest({ bidId: input.bidId,
          nonRecommendedReason: input.nonRecommendedReason ?? null, advanceBasisPoints: input.advanceBasisPoints,
          designerId: input.designerId ?? null, terms: input.terms ?? null, lineTerms: input.lineTerms,
          milestoneReviewers: input.milestoneReviewers });
        const existing = await ProcurementBasketAwardModel.findOne({ enquiryId }).session(session).lean() as TenderRow | null;
        if (existing) {
          if (existing.createIdempotencyKey === input.idempotencyKey && existing.createRequestDigest === createRequestDigest)
            return String(existing._id);
          tenderConflict("PROCUREMENT_BASKET_AWARD_EXISTS", "This enquiry already has an award proposal. Edit that proposal.");
        }
        if (enquiry.status !== "sent" || enquiry.version !== input.expectedVersion)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed. Reload before selecting an award.");
        const calculation = await prepareAward(enquiry, input.bidId, input.advanceBasisPoints, input.designerId ?? null,
          session, input.milestoneReviewers, true);
        const lineTerms = resolveProcurementBasketAwardLineTerms(input.lineTerms,
          calculation.comparison.revision.lines as ProcurementBasketBoqLine[]);
        const id = tenderId("basket-award");
        const proposal = proposalRecord(id, enquiry, calculation, input.terms ?? null, lineTerms,
          input.nonRecommendedReason ?? null, actor.id, 1, now());
        await ProcurementBasketAwardRevisionModel.create([proposal], { session });
        await ProcurementBasketAwardModel.create([{ _id: id, enquiryId, boqRevisionId: calculation.comparison.boqRevisionId,
          projectId, mainBasketId: basketId, vendorId: calculation.bid.vendorId, bidId: calculation.bid._id,
          version: 1, status: "draft", requiresRevision: false,
          currentProposalRevisionId: proposal._id, issuedPurchaseOrderId: null,
          issueIdempotencyKey: null, issueRequestDigest: null,
          autoIssueOnApproval: false, submittedById: null, issueBlocker: null,
          createdById: actor.id, updatedById: actor.id, createIdempotencyKey: input.idempotencyKey,
          createRequestDigest,
          lastMutationKey: input.idempotencyKey, lastMutationDigest: proposal.proposalDigest,
          lastRequestDigest: createRequestDigest, submitIdempotencyKey: null, submitRequestDigest: null }], { session });
        const changed = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId, version: input.expectedVersion,
          status: "sent", latestAwardId: null }, { $set: { latestAwardId: id, updatedById: actor.id }, $inc: { version: 1 } }, { session });
        if (changed.modifiedCount !== 1) tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed before award selection.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_award_created",
          entityType: "procurement_basket_award", entityId: id, occurredAt: now().toISOString(),
          newValues: { projectId, enquiryId, bidId: input.bidId, vendorId: calculation.bid.vendorId,
            grossPaise: calculation.preview.totals.totalPaise } }, session);
        return id;
      });
      return get(actor, projectId, basketId, enquiryId, awardId);
    },
    get,
    async update(actor, projectId, basketId, enquiryId, awardId, input) {
      if (!procurementBasketMilestoneReviewersSchema.safeParse(input.milestoneReviewers).success)
        throw new ApiError(400, "PROCUREMENT_BASKET_MILESTONE_REVIEWERS_REQUIRED",
          "Select payment-row approvers before saving a new work-order revision.");
      await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const award = await scopedAward(awardId, projectId, basketId, enquiryId, session);
        const requestDigest = procurementBasketDigest(input);
        if (award.lastMutationKey === input.idempotencyKey) {
          if (award.lastRequestDigest !== requestDigest) tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This award update key was reused with different terms.");
          return;
        }
        const revisableStatuses = ["draft", "rejected", "pending_approvals", "ready_to_issue"];
        if (!revisableStatuses.includes(award.status) || award.version !== input.expectedVersion)
          tenderConflict("PROCUREMENT_BASKET_AWARD_VERSION_CONFLICT", "This award changed. Reload before editing it.");
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const previous = await currentProposal(award, session);
        const calculation = await prepareAward(enquiry, input.bidId ?? String(award.bidId),
          input.advanceBasisPoints, input.designerId ?? null,
          session, input.milestoneReviewers, true);
        const lineTerms = resolveProcurementBasketAwardLineTerms(input.lineTerms === undefined ? previous.lineTerms : input.lineTerms,
          calculation.comparison.revision.lines as ProcurementBasketBoqLine[]);
        const nonRecommendedReason = input.nonRecommendedReason === undefined
          ? String(calculation.bid._id) === String(previous.bidId) ? previous.nonRecommendedReason ?? null : null
          : input.nonRecommendedReason;
        const proposal = proposalRecord(awardId, enquiry, calculation, input.terms ?? previous.terms ?? null, lineTerms,
          nonRecommendedReason, actor.id, Number(previous.revision) + 1, now());
        await ProcurementBasketAwardRevisionModel.create([proposal], { session });
        const changed = await ProcurementBasketAwardModel.updateOne({ _id: awardId, version: input.expectedVersion,
          status: { $in: revisableStatuses } }, { $set: { status: "draft", requiresRevision: false,
            bidId: calculation.bid._id,
            boqRevisionId: calculation.comparison.boqRevisionId,
            vendorId: calculation.bid.vendorId, currentProposalRevisionId: proposal._id, updatedById: actor.id,
            lastMutationKey: input.idempotencyKey, lastMutationDigest: proposal.proposalDigest,
            lastRequestDigest: requestDigest, submitIdempotencyKey: null, submitRequestDigest: null,
            autoIssueOnApproval: false, submittedById: null, issueBlocker: null }, $inc: { version: 1 } }, { session });
        if (changed.modifiedCount !== 1) tenderConflict("PROCUREMENT_BASKET_AWARD_VERSION_CONFLICT", "This award changed before it was saved.");
        const reopened = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId, version: enquiry.version,
          status: { $in: ["sent", "award_pending"] }, latestAwardId: awardId },
        { $set: { status: "sent", updatedById: actor.id }, $inc: { version: 1 } }, { session });
        if (reopened.modifiedCount !== 1)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed before the award was revised.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_award_updated",
          entityType: "procurement_basket_award", entityId: awardId, occurredAt: now().toISOString(),
          newValues: { projectId, enquiryId, proposalRevisionId: proposal._id, revision: proposal.revision,
            replacedProposalRevisionId: previous._id, priorStatus: award.status,
            boqRevisionId: calculation.comparison.boqRevisionId } }, session);
      });
      return get(actor, projectId, basketId, enquiryId, awardId);
    },
    async withdraw(actor, projectId, basketId, enquiryId, awardId, input) {
      await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const award = await scopedAward(awardId, projectId, basketId, enquiryId, session);
        const requestDigest = procurementBasketDigest(input);
        const replay = await ProcurementBasketAwardRevisionModel.findOne({ awardId,
          withdrawalIdempotencyKey: input.idempotencyKey }).session(session).lean() as TenderRow | null;
        if (replay) {
          if (replay.withdrawalRequestDigest !== requestDigest)
            tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This withdrawal key was reused with different details.");
          return;
        }
        if (!["pending_approvals", "ready_to_issue"].includes(award.status) ||
          award.version !== input.expectedVersion)
          tenderConflict("PROCUREMENT_BASKET_AWARD_VERSION_CONFLICT", "This award changed. Reload before withdrawing it.");
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        if (enquiry.status !== "award_pending" || enquiry.latestAwardId !== awardId)
          tenderConflict("PROCUREMENT_BASKET_ENQUIRY_STATE", "This enquiry is not awaiting the current award.");
        const previous = await currentProposal(award, session);
        const timestamp = now();
        const successorId = tenderId("basket-proposal");
        const revision = Number(previous.revision) + 1;
        const successor = { ...previous, _id: successorId, revision, createdAt: timestamp,
          createdById: actor.id, withdrawnFromProposalRevisionId: String(previous._id),
          withdrawalReason: input.reason, withdrawalIdempotencyKey: input.idempotencyKey,
          withdrawalRequestDigest: requestDigest,
          proposalDigest: procurementBasketDigest({ priorProposalDigest: previous.proposalDigest,
            withdrawnFromProposalRevisionId: String(previous._id), withdrawalReason: input.reason, revision }) };
        await ProcurementBasketAwardRevisionModel.create([successor], { session });
        const withdrawn = await ProcurementBasketAwardModel.updateOne({ _id: awardId,
          version: input.expectedVersion, status: { $in: ["pending_approvals", "ready_to_issue"] },
          currentProposalRevisionId: previous._id }, { $set: { status: "draft", requiresRevision: true,
            currentProposalRevisionId: successorId, updatedById: actor.id,
            lastMutationKey: input.idempotencyKey, lastMutationDigest: successor.proposalDigest,
            lastRequestDigest: requestDigest, submitIdempotencyKey: null, submitRequestDigest: null,
            autoIssueOnApproval: false, submittedById: null, issueBlocker: null },
          $inc: { version: 1 } }, { session });
        if (withdrawn.modifiedCount !== 1)
          tenderConflict("PROCUREMENT_BASKET_AWARD_VERSION_CONFLICT", "This award changed before withdrawal.");
        const reopened = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId,
          version: enquiry.version, status: "award_pending", latestAwardId: awardId },
        { $set: { status: "sent", updatedById: actor.id }, $inc: { version: 1 } }, { session });
        if (reopened.modifiedCount !== 1)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed before withdrawal.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_award_withdrawn",
          entityType: "procurement_basket_award", entityId: awardId, occurredAt: timestamp.toISOString(),
          oldValues: { proposalRevisionId: String(previous._id), status: award.status },
          newValues: { projectId, enquiryId, proposalRevisionId: successorId, status: "draft",
            requiresRevision: true }, reason: input.reason }, session);
      });
      return get(actor, projectId, basketId, enquiryId, awardId);
    },
    async submit(actor, projectId, basketId, enquiryId, awardId, input) {
      await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const award = await scopedAward(awardId, projectId, basketId, enquiryId, session);
        const submitRequestDigest = procurementBasketDigest(input);
        if (award.submitIdempotencyKey === input.idempotencyKey) {
          if (award.submitRequestDigest !== submitRequestDigest) tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This award submission key was reused with different details.");
          return;
        }
        if (award.status !== "draft" || award.version !== input.expectedVersion)
          tenderConflict("PROCUREMENT_BASKET_AWARD_VERSION_CONFLICT", "This award changed. Reload before submitting it.");
        if (award.requiresRevision)
          tenderConflict("PROCUREMENT_BASKET_REVISION_REQUIRED", "Save a fresh award proposal before submitting it for approval.");
        const proposal = await currentProposal(award, session);
        assertSubmittedMilestoneReviewerCoverage(proposal);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        if (enquiry.status !== "sent" || enquiry.latestAwardId !== awardId)
          tenderConflict("PROCUREMENT_BASKET_ENQUIRY_STATE", "This enquiry is not open for award submission.");
        // Share the project write fence with Base amount edits and BOQ dispatch.
        // A concurrent edit must not commit against a submitted award snapshot.
        const project = await ProjectModel.findOneAndUpdate({ _id: projectId, status: "active" },
          { $inc: { purchaseOrderApprovalEpoch: 1 } }, { session, returnDocument: "after",
            runValidators: true, timestamps: false }).lean() as TenderRow | null;
        if (!project) tenderConflict("PROCUREMENT_BASKET_PROJECT_INACTIVE", "This project is not active.");
        await assertProposalFresh(award, proposal, session);
        if (proposal.requiredSlots.includes("finance_head")) {
          const financeTask = await ProjectWorkflowTaskModel.exists({ projectId, kind: "finance",
            assigneeRole: "finance_head" }).session(session);
          const activeFinance = await UserModel.exists({ role: "finance_head", active: true }).session(session);
          if (!financeTask || !activeFinance)
            tenderConflict("PROCUREMENT_BASKET_FINANCE_REVIEWER_REQUIRED",
              "Assign an active Finance reviewer to this project before submitting the work order.");
        }
        const changed = await ProcurementBasketAwardModel.updateOne({ _id: awardId, version: input.expectedVersion,
          status: "draft" }, { $set: { status: "pending_approvals", updatedById: actor.id,
            autoIssueOnApproval: input.autoIssueOnApproval === true, submittedById: actor.id, issueBlocker: null,
            lastMutationKey: input.idempotencyKey, lastMutationDigest: proposal.proposalDigest,
            lastRequestDigest: submitRequestDigest, submitIdempotencyKey: input.idempotencyKey,
            submitRequestDigest }, $inc: { version: 1 } }, { session });
        if (changed.modifiedCount !== 1) tenderConflict("PROCUREMENT_BASKET_AWARD_VERSION_CONFLICT", "This award changed before submission.");
        const submitted = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId,
          version: enquiry.version, latestAwardId: awardId, status: "sent" },
        { $set: { status: "award_pending", updatedById: actor.id }, $inc: { version: 1 } }, { session });
        if (submitted.modifiedCount !== 1)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed before award submission.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_award_submitted",
          entityType: "procurement_basket_award", entityId: awardId, occurredAt: now().toISOString(),
          newValues: { projectId, enquiryId, proposalRevisionId: proposal._id, requiredSlots: proposal.requiredSlots } }, session);
      });
      return get(actor, projectId, basketId, enquiryId, awardId);
    },
    approvalQueue(actor) {
      return tenderTransaction(async session => {
        await requireActiveActor(actor, session);
        const slot = reviewerSlot(actor.role);
        if (!slot) return [];
        const pipeline: PipelineStage[] = [
          { $match: { status: "pending_approvals" } },
          { $lookup: { from: ProcurementBasketAwardRevisionModel.collection.name,
            localField: "currentProposalRevisionId", foreignField: "_id", as: "proposal" } },
          { $unwind: "$proposal" },
          { $match: { "proposal.requiredSlots": slot } },
          { $lookup: { from: ProjectModel.collection.name, localField: "projectId",
            foreignField: "_id", as: "project" } },
          { $unwind: "$project" },
          { $match: { "project.status": "active" } }
        ];
        if (slot === "program_manager") pipeline.push({ $match: {
          "proposal.programManagerId": actor.id } });
        if (slot === "designer") pipeline.push({ $match: {
          "project.assignedDesignerIds": actor.id, "proposal.designerId": actor.id } });
        if (slot === "finance_head") pipeline.push(
          { $lookup: { from: ProjectWorkflowTaskModel.collection.name,
            let: { projectId: "$projectId" }, pipeline: [
              { $match: { $expr: { $and: [
                { $eq: ["$projectId", "$$projectId"] }, { $eq: ["$kind", "finance"] },
                { $eq: ["$assigneeRole", "finance_head"] }
              ] } } }, { $limit: 1 }
            ], as: "financeTasks" } },
          { $match: { "financeTasks.0": { $exists: true } } });
        pipeline.push(
          { $lookup: { from: ProcurementBasketAwardApprovalModel.collection.name,
            let: { awardId: "$_id", proposalRevisionId: "$currentProposalRevisionId" }, pipeline: [
              { $match: { $expr: { $and: [
                { $eq: ["$awardId", "$$awardId"] },
                { $eq: ["$proposalRevisionId", "$$proposalRevisionId"] },
                { $eq: ["$slot", slot] }
              ] } } }, { $limit: 1 }
            ], as: "decisions" } },
          { $match: { decisions: { $size: 0 } } },
          { $sort: { updatedAt: 1, _id: 1 } });
        const result: Array<{ awardId: string; projectId: string; enquiryId: string; mainBasketId: string;
          projectName: string; basketName: string; vendorName: string; grossPaise: number; slot: string; status: string }> = [];
        for (let offset = 0; result.length < 100; offset += 100) {
          const pending = await ProcurementBasketAwardModel.aggregate<TenderRow>([
            ...pipeline, { $skip: offset }, { $limit: 100 }
          ]).session(session);
          for (const award of pending) {
            const proposal = award.proposal as TenderRow;
            const project = award.project as TenderRow;
            const approvers = await proposalApprovers(award, proposal, session);
            if (actorSlot(actor, approvers, proposal) !== slot) continue;
            const basket = await currentBasket(String(award.projectId), String(award.mainBasketId), session).catch(() => null);
            result.push({ awardId: String(award._id), projectId: String(award.projectId), enquiryId: String(award.enquiryId),
              mainBasketId: String(award.mainBasketId), projectName: String(project.name), basketName: basket?.name ?? "Main basket",
              vendorName: String(proposal.vendorName), grossPaise: Number(proposal.totals.totalPaise), slot, status: String(award.status) });
            if (result.length === 100) break;
          }
          if (pending.length < 100) break;
        }
        return result;
      });
    },
    approvalDetail(actor, awardId) {
      return tenderTransaction(async session => {
        await requireActiveActor(actor, session);
        const award = await ProcurementBasketAwardModel.findById(awardId).session(session).lean() as TenderRow | null;
        if (!award) throw new ApiError(404, "PROCUREMENT_BASKET_AWARD_NOT_FOUND", "This award is unavailable.");
        const proposal = await currentProposal(award, session);
        const approvers = await proposalApprovers(award, proposal, session);
        const slot = actorSlot(actor, approvers, proposal);
        if (!slot || !(proposal.requiredSlots as string[]).includes(slot))
          throw new ApiError(403, "FORBIDDEN", "You cannot review this work order.");
        if (actor.role === "finance_head")
          await requireFinanceProjectAccess({ id: actor.id, role: "finance_head" }, String(award.projectId), session);
        return awardDto(award, session);
      });
    },
    async decide(actor, awardId, input) {
      if (input.slot === "budget_override" && input.decision === "approve" &&
        (!input.reason || input.reason.trim().length < 10))
        throw new ApiError(400, "PROCUREMENT_BASKET_OVERRIDE_REASON_REQUIRED", "Give a budget override reason of at least 10 characters.");
      const scope = await tenderTransaction(async session => {
        await requireActiveActor(actor, session);
        const award = await ProcurementBasketAwardModel.findById(awardId).session(session).lean() as TenderRow | null;
        if (!award) throw new ApiError(404, "PROCUREMENT_BASKET_AWARD_NOT_FOUND", "This award is unavailable.");
        if (actor.role === "finance_head")
          await requireFinanceProjectAccess({ id: actor.id, role: "finance_head" }, String(award.projectId), session);
        const proposal = await currentProposal(award, session);
        const approvers = await proposalApprovers(award, proposal, session, true);
        if (actorSlot(actor, approvers, proposal) !== input.slot ||
          !proposal.requiredSlots.includes(input.slot)) throw new ApiError(403, "FORBIDDEN", "You cannot approve this work order slot.");
        const replay = await ProcurementBasketAwardApprovalModel.findOne({ awardId,
          proposalRevisionId: input.proposalRevisionId, actorId: actor.id, idempotencyKey: input.idempotencyKey })
          .session(session).lean() as TenderRow | null;
        if (replay) {
          if (replay.slot !== input.slot || replay.decision !== input.decision || (replay.reason ?? null) !== (input.reason ?? null))
            tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This decision key was reused with different details.");
          return { projectId: String(award.projectId), basketId: String(award.mainBasketId), enquiryId: String(award.enquiryId),
            autoIssueOnApproval: award.autoIssueOnApproval === true && award.status === "ready_to_issue" &&
              String(proposal._id) === input.proposalRevisionId,
            proposalRevisionId: String(proposal._id), expectedVersion: Number(award.version),
            triggeringApprovalId: String(replay._id) };
        }
        if (award.status !== "pending_approvals" || award.version !== input.expectedVersion ||
          String(proposal._id) !== input.proposalRevisionId)
          tenderConflict("PROCUREMENT_BASKET_AWARD_VERSION_CONFLICT", "This award changed. Reload before deciding.");
        await assertProposalFresh(award, proposal, session);
        const prior = await ProcurementBasketAwardApprovalModel.find({ awardId, proposalRevisionId: proposal._id })
          .session(session).lean() as TenderRow[];
        if (prior.some(row => row.slot === input.slot || row.actorId === actor.id))
          tenderConflict("PROCUREMENT_BASKET_APPROVAL_DUPLICATE", "This role or actor has already decided this proposal.");
        const timestamp = now();
        const approvalId = tenderId("basket-approval");
        await ProcurementBasketAwardApprovalModel.create([{ _id: approvalId, awardId, proposalRevisionId: proposal._id,
          projectId: award.projectId, slot: input.slot, actorId: actor.id, decision: input.decision,
          reason: input.reason ?? null, proposalDigest: proposal.proposalDigest, decidedAt: timestamp,
          idempotencyKey: input.idempotencyKey }], { session });
        const approvedSlots = new Set(prior.filter(row => row.decision === "approve").map(row => row.slot));
        if (input.decision === "approve") approvedSlots.add(input.slot);
        const status = input.decision === "reject" ? "rejected" : (proposal.requiredSlots as string[]).every(slot => approvedSlots.has(slot))
          ? "ready_to_issue" : "pending_approvals";
        const changed = await ProcurementBasketAwardModel.updateOne({ _id: awardId, version: input.expectedVersion,
          status: "pending_approvals", currentProposalRevisionId: proposal._id },
        { $set: { status, updatedById: actor.id, lastMutationKey: input.idempotencyKey,
          lastMutationDigest: proposal.proposalDigest, lastRequestDigest: procurementBasketDigest(input) }, $inc: { version: 1 } }, { session });
        if (changed.modifiedCount !== 1) tenderConflict("PROCUREMENT_BASKET_AWARD_VERSION_CONFLICT", "This award changed before the decision was recorded.");
        if (status === "rejected") {
          const reopened = await ProcurementBasketEnquiryModel.updateOne({ _id: award.enquiryId,
            status: "award_pending", latestAwardId: awardId },
          { $set: { status: "sent", updatedById: actor.id }, $inc: { version: 1 } }, { session });
          if (reopened.modifiedCount !== 1)
            tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed before rejection was recorded.");
        }
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_award_decided",
          entityType: "procurement_basket_award", entityId: awardId, occurredAt: timestamp.toISOString(),
          newValues: { projectId: award.projectId, proposalRevisionId: proposal._id, slot: input.slot,
            decision: input.decision, status }, reason: input.reason ?? null }, session);
        return { projectId: String(award.projectId), basketId: String(award.mainBasketId), enquiryId: String(award.enquiryId),
          autoIssueOnApproval: award.autoIssueOnApproval === true && status === "ready_to_issue",
          proposalRevisionId: String(proposal._id), expectedVersion: input.expectedVersion + 1,
          triggeringApprovalId: approvalId };
      });
      if (scope.autoIssueOnApproval && onReadyToIssue) {
        try {
          await onReadyToIssue({ awardId, proposalRevisionId: scope.proposalRevisionId,
            expectedVersion: scope.expectedVersion, triggeringApprovalId: scope.triggeringApprovalId,
            triggeringApprovalActorId: actor.id });
        } catch {
          // The approval transaction is complete. Keep it intact for an authorized Procurement retry.
          try {
            await ProcurementBasketAwardModel.updateOne({ _id: awardId, status: "ready_to_issue",
              version: scope.expectedVersion, currentProposalRevisionId: scope.proposalRevisionId },
            { $set: { issueBlocker: { code: "PROCUREMENT_BASKET_ISSUE_BLOCKED",
              message: "Approved, but work order issuance could not complete. Procurement can retry after resolving the issue." } } },
            { timestamps: false });
          } catch {
            // A ready award without a stored blocker is still recoverable through the issue route.
          }
        }
      }
      return tenderTransaction(async session => awardDto(await scopedAward(awardId, scope.projectId, scope.basketId, scope.enquiryId, session), session));
    }
  };
}

interface InternalComparison extends ProcurementBasketComparisonDto { revision: TenderRow; latestBids: Map<string, TenderRow> }

async function readComparison(enquiry: TenderRow, session: ClientSession,
  requireCurrentSource = true): Promise<InternalComparison> {
  const revision = await getCurrentBoq(enquiry, session);
  if (requireCurrentSource)
    await currentBasket(String(enquiry.projectId), String(enquiry.mainBasketId), session, revision.preparationDigest);
  const historyLimit = 100;
  const bidFilter = { enquiryId: enquiry._id, boqRevisionId: revision._id };
  const latestRows = await ProcurementBasketBidModel.aggregate([
    { $match: bidFilter }, { $sort: { vendorId: 1, revision: -1, submittedAt: -1 } },
    { $group: { _id: "$vendorId", bid: { $first: "$$ROOT" } } }, { $replaceRoot: { newRoot: "$bid" } },
    { $sort: { vendorId: 1 } }
  ]).session(session) as TenderRow[];
  const historyRows = await ProcurementBasketBidModel.find(bidFilter)
    .sort({ submittedAt: -1, revision: -1, _id: -1 }).limit(historyLimit + 1)
    .session(session).lean() as TenderRow[];
  const historyBids = historyRows.slice(0, historyLimit);
  const byBoq = new Map((revision.lines as ProcurementBasketBoqLine[]).map(line => [line.id, line]));
  const bidLines = (bid: TenderRow): ProcurementBasketComparisonLine[] => (bid.lines as TenderRow[]).map(line => {
    const boq = byBoq.get(String(line.boqLineId));
    return { boqLineId: String(line.boqLineId), description: boq?.description ?? "BOQ line unavailable",
      quantityMilliUnits: boq?.quantityMilliUnits ?? 0, uomCode: boq?.uomCode ?? "",
      unitPricePaise: Number(line.unitPricePaise), gstBasisPoints: Number(line.gstBasisPoints),
      netPaise: Number(line.netPaise), gstPaise: Number(line.gstPaise), totalPaise: Number(line.totalPaise) };
  });
  const bidHistory = historyBids.map(bid => ({ bidId: String(bid._id), vendorId: String(bid.vendorId),
    revision: Number(bid.revision), submittedAt: tenderIso(bid.submittedAt),
    totals: bid.totals as { netPaise: number; gstPaise: number; totalPaise: number }, lines: bidLines(bid) }));
  const historicalCounteroffers = await ProcurementBasketCounterofferModel.find({ enquiryId: enquiry._id,
    boqRevisionId: revision._id }).sort({ requestedAt: -1, _id: -1 }).limit(historyLimit + 1)
    .session(session).lean() as TenderRow[];
  const shownCounteroffers = historicalCounteroffers.slice(0, historyLimit);
  const invitations = shownCounteroffers.length ? await ProcurementBasketInvitationModel.find({ _id: {
    $in: shownCounteroffers.map(counteroffer => counteroffer.invitationId) } })
    .select({ status: 1, expiresAt: 1, receiptBidId: 1 }).session(session).lean() as TenderRow[] : [];
  const invitationById = new Map(invitations.map(invitation => [String(invitation._id), invitation]));
  const counteroffers = shownCounteroffers.map(counteroffer => {
    const invitation = invitationById.get(String(counteroffer.invitationId));
    return { id: String(counteroffer._id), vendorId: String(counteroffer.vendorId),
      priorBidId: String(counteroffer.priorBidId), reason: String(counteroffer.reason),
      targetNetPaise: counteroffer.targetNetPaise == null ? null : Number(counteroffer.targetNetPaise),
      requestedById: String(counteroffer.requestedById), requestedAt: tenderIso(counteroffer.requestedAt),
      invitationStatus: invitation && ["sent", "pending"].includes(String(invitation.status)) &&
        new Date(invitation.expiresAt) <= new Date() ? "expired" : String(invitation?.status ?? "unavailable"),
      answeredBidId: invitation?.receiptBidId ? String(invitation.receiptBidId) : null };
  });
  const latest = new Map<string, TenderRow>();
  for (const bid of latestRows) latest.set(String(bid.vendorId), bid);
  const input: ProcurementBasketComparisonBid[] = [];
  const completeBidNetAmounts: number[] = [];
  const lineByBid = new Map<string, ProcurementBasketComparisonLine[]>();
  for (const bid of latest.values()) {
    const vendor = await AiEstimatorKnowledgeVendorModel.findById(bid.vendorId).select({ name: 1 }).session(session).lean() as TenderRow | null;
    let candidate: Awaited<ReturnType<typeof assertBasketVendorEligible>> | null = null;
    const blockers: string[] = [];
    try { candidate = await assertBasketVendorEligible(String(bid.vendorId), String(enquiry.projectId),
      String(enquiry.mainBasketId), session); } catch { blockers.push("vendor_not_eligible"); }
    let complete = true;
    try {
      const recomputed = calculateProcurementBasketBid(revision.lines as ProcurementBasketBoqLine[],
        (bid.lines as TenderRow[]).map(line => ({ boqLineId: String(line.boqLineId),
          unitPricePaise: Number(line.unitPricePaise), gstBasisPoints: Number(line.gstBasisPoints) })));
      complete = procurementBasketDigest({ boqDigest: revision.digest, vendorId: bid.vendorId,
        lines: recomputed.lines, totals: recomputed.totals }) === bid.bidDigest &&
        recomputed.totals.netPaise === Number(bid.totals.netPaise) &&
        recomputed.totals.gstPaise === Number(bid.totals.gstPaise) &&
        recomputed.totals.totalPaise === Number(bid.totals.totalPaise);
    } catch { complete = false; }
    if (!complete) blockers.push("bid_scope_incomplete");
    else completeBidNetAmounts.push(Number(bid.totals.netPaise));
    lineByBid.set(String(bid._id), bidLines(bid));
    input.push({ bidId: String(bid._id), vendorId: String(bid.vendorId),
      vendorName: candidate?.name ?? String(vendor?.name ?? "Unavailable vendor"),
      officialKpiScoreBps: candidate?.kpiScoreBps ?? null,
      quoteNetPaise: Number(bid.totals.netPaise), quoteGstPaise: Number(bid.totals.gstPaise),
      quoteGrossPaise: Number(bid.totals.totalPaise), eligible: blockers.length === 0, blockers });
  }
  const compared = compareProcurementBasketBids(input);
  const averageBidNetPaise = averageProcurementBasketBidNetPaise(completeBidNetAmounts);
  const rows = compared.rows.map(row => ({ ...row, bidRevision: Number(latest.get(row.vendorId)?.revision ?? 0),
    lines: lineByBid.get(row.bidId) ?? [] }));
  const comparisonDigest = procurementBasketDigest({ boqDigest: revision.digest,
    rows: rows.map(row => ({ bidId: row.bidId, vendorId: row.vendorId,
      officialKpiScoreBps: row.officialKpiScoreBps, quoteNetPaise: row.quoteNetPaise,
      eligible: row.eligible, blockers: row.blockers, priceScoreBps: row.priceScoreBps,
      comparisonScoreBps: row.comparisonScoreBps })).sort((left, right) => left.vendorId.localeCompare(right.vendorId)),
    recommendedBidId: compared.recommendedBidId });
  return { enquiryId: String(enquiry._id), boqRevisionId: String(revision._id), boqDigest: String(revision.digest),
    comparisonDigest, rows, averageBidNetPaise, recommendedBidId: compared.recommendedBidId,
    awardId: enquiry.latestAwardId ? String(enquiry.latestAwardId) : null,
    bidHistory, bidHistoryHasMore: historyRows.length > historyLimit,
    counteroffers, counteroffersHasMore: historicalCounteroffers.length > historyLimit,
    revision, latestBids: latest };
}

async function prepareAward(enquiry: TenderRow, bidId: string, advanceBasisPoints: number, designerId: string | null,
  session: ClientSession, milestoneReviewers?: ProcurementBasketMilestoneReviewersInput, fence = false): Promise<{ comparison: InternalComparison; bid: TenderRow; preview: ProcurementBasketAwardPreviewDto;
    project: TenderRow; preparation: Awaited<ReturnType<typeof buildProjectPurchaseOrderPreparation>>;
    selectedDesignerId: string | null; kpiAssessment: TenderRow }> {
  if (!["sent", "award_pending"].includes(enquiry.status)) tenderConflict("PROCUREMENT_BASKET_ENQUIRY_STATE", "This enquiry is not open for an award.");
  const comparison = await readComparison(enquiry, session);
  const row = comparison.rows.find(item => item.bidId === bidId);
  if (!row || !row.eligible || row.comparisonScoreBps === null)
    tenderConflict("PROCUREMENT_BASKET_BID_INELIGIBLE", "Choose a complete current bid from an eligible vendor.");
  const bid = comparison.latestBids.get(row.vendorId);
  if (!bid || String(bid._id) !== bidId) tenderConflict("PROCUREMENT_BASKET_BID_STALE", "This vendor has submitted a newer bid.");
  await assertBasketVendorEligible(row.vendorId, String(enquiry.projectId), String(enquiry.mainBasketId), session);
  const vendor = await AiEstimatorKnowledgeVendorModel.findById(row.vendorId)
    .select({ procurementProfile: 1, kpiRubricGeneration: 1 }).session(session).lean() as TenderRow | null;
  const kpiAssessment = vendor ? await VendorKpiAssessmentModel.findOne({ vendorId: row.vendorId,
    source: "procurement", vendorType: vendor.procurementProfile?.vendorType,
    rubricVersion: VENDOR_KPI_RUBRIC_VERSION, rubricGeneration: Number(vendor.kpiRubricGeneration ?? 0) })
    .sort({ revision: -1 }).session(session).lean() as TenderRow | null : null;
  if (!kpiAssessment || Number(kpiAssessment.averageScoreBps) !== row.officialKpiScoreBps)
    tenderConflict("PROCUREMENT_BASKET_KPI_CHANGED", "The vendor's official KPI changed. Refresh the comparison.");
  await assertBasketSourceUnreserved(String(enquiry.projectId),
    (comparison.revision.lines as ProcurementBasketBoqLine[]).map(line => line.sourceLineItemKey), session, String(enquiry._id));
  const basket = await currentBasket(String(enquiry.projectId), String(enquiry.mainBasketId), session,
    String(comparison.revision.preparationDigest));
  if (!basketVendorScopeMatchesRevision(basket, comparison.revision))
    tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED", "The approved vendor-facing scope changed. Revise and resend this BOQ.");
  const preparation = await buildProjectPurchaseOrderPreparation(String(enquiry.projectId), session);
  const project = await ProjectModel.findById(enquiry.projectId).session(session).lean() as TenderRow | null;
  if (!project || project.status !== "active") tenderConflict("PROCUREMENT_BASKET_PROJECT_INACTIVE", "This project is not active.");
  const gross = Number(bid.totals.totalPaise);
  const budgetOverrideRequired = gross >= PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE &&
    BigInt(preparation.committedPaise) + BigInt(bid.totals.netPaise) > BigInt(preparation.approvedEstimatePaise);
  const requiredSlots = [...requiredProcurementBasketApprovalSlots(gross), ...(budgetOverrideRequired ? ["budget_override" as const] : [])];
  let milestones: ProcurementBasketPaymentMilestone[];
  try {
    milestones = withProcurementBasketMilestoneReviewers(gross,
      procurementBasketPaymentSchedule(gross, advanceBasisPoints), milestoneReviewers);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new ApiError(400, "PROCUREMENT_BASKET_MILESTONE_REVIEWERS_INVALID", error.message);
  }
  const approvers = await resolveBasketProjectApprovers(String(enquiry.projectId), preparation.estimateSource.estimateId,
    requiredSlots, session, fence);
  if (designerId && designerId !== approvers.assignedDesigner?.id)
    tenderConflict("PROCUREMENT_BASKET_DESIGNER_NOT_ASSIGNED", "The Designer must match this project's current assignment.");
  if (fence) requireBasketProjectApprovers(approvers);
  const preview = { bidId, vendorId: row.vendorId, vendorName: row.vendorName,
    totals: bid.totals as { netPaise: number; gstPaise: number; totalPaise: number },
    milestones, requiredSlots,
    budgetOverrideRequired, recommendedBidId: comparison.recommendedBidId,
    ...approvers, designerOptions: approvers.assignedDesigner ? [approvers.assignedDesigner] : [],
    programManagerId: approvers.assignedSiteManager?.id ?? null, lines: row.lines };
  return { comparison, bid, preview, project, preparation,
    selectedDesignerId: requiredSlots.includes("designer") ? approvers.assignedDesigner?.id ?? null : null, kpiAssessment };
}

function proposalRecord(awardId: string, enquiry: TenderRow,
  calculation: Awaited<ReturnType<typeof prepareAward>>, terms: string | null,
  lineTerms: ProcurementBasketAwardLineTerm[] | undefined, nonRecommendedReason: string | null,
  actorId: string, revision: number, at: Date): TenderRow {
  const { comparison, bid, preview, preparation } = calculation;
  const proposalId = tenderId("basket-proposal");
  const data = { awardId, enquiryId: String(enquiry._id), projectId: String(enquiry.projectId), revision,
    boqRevisionId: comparison.boqRevisionId, boqDigest: comparison.boqDigest,
    bidId: String(bid._id), bidDigest: String(bid.bidDigest), vendorId: String(bid.vendorId),
    vendorName: preview.vendorName, officialKpiScoreBps: comparison.rows.find(row => row.bidId === bid._id)!.officialKpiScoreBps!,
    officialKpiAssessmentId: String(calculation.kpiAssessment._id),
    officialKpiAssessmentRevision: Number(calculation.kpiAssessment.revision),
    recommendedBidId: comparison.recommendedBidId, comparisonDigest: comparison.comparisonDigest,
    nonRecommendedReason, totals: preview.totals, approvedEstimatePaise: preparation.approvedEstimatePaise,
    committedNetPaise: preparation.committedPaise,
    terms, lineTerms, advanceBasisPoints: preview.milestones[0]!.basisPoints, milestones: preview.milestones,
    requiredSlots: preview.requiredSlots, budgetOverrideRequired: preview.budgetOverrideRequired,
    programManagerId: preview.requiredSlots.includes("program_manager") ? preview.programManagerId : null, designerId: calculation.selectedDesignerId };
  const proposalDigest = procurementBasketDigest(data);
  return { _id: proposalId, ...data, proposalDigest, createdAt: at, createdById: actorId };
}

function milestoneSelections(raw: unknown): ProcurementBasketMilestoneReviewersInput | undefined {
  if (!Array.isArray(raw) || raw.length !== 5)
    tenderConflict("PROCUREMENT_BASKET_MILESTONE_REVIEWERS_INVALID", "The saved payment schedule is incomplete. Revise the award.");
  const rows = raw as Array<Record<string, unknown>>;
  if (rows.every(row => !Object.prototype.hasOwnProperty.call(row, "reviewerSlots"))) return undefined;
  const selected = rows.map(row => ({ id: row.id, reviewerSlots: row.reviewerSlots }));
  const parsed = procurementBasketMilestoneReviewersSchema.safeParse(selected);
  if (!parsed.success)
    tenderConflict("PROCUREMENT_BASKET_MILESTONE_REVIEWERS_INVALID", "The saved payment approvers are incomplete. Revise the award.");
  return parsed.data;
}

function assertSubmittedMilestoneReviewerCoverage(proposal: TenderRow): void {
  const selected = milestoneSelections(proposal.milestones);
  if (!selected) return; // Proposals saved before selectable approvers use their existing approval route.
  const grossPaise = Number(proposal.totals?.totalPaise);
  if (grossPaise <= PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE) {
    if (selected.some(row => row.reviewerSlots.length !== 1 || row.reviewerSlots[0] !== "procurement"))
      tenderConflict("PROCUREMENT_BASKET_MILESTONE_REVIEWERS_INVALID",
        "Orders up to ₹50,000 require Procurement on every payment row.");
    return;
  }
  const covered = new Set<string>(selected.flatMap(row => row.reviewerSlots));
  const missing = requiredProcurementBasketApprovalSlots(grossPaise).filter(slot => !covered.has(slot));
  const labels: Record<string, string> = { program_manager: "Site Manager", designer: "Design",
    procurement: "Procurement", finance_head: "Finance" };
  if (missing.length) tenderConflict("PROCUREMENT_BASKET_MILESTONE_REVIEWERS_REQUIRED",
    `Select approver chips for ${missing.map(slot => labels[slot]).join(", ")} before submitting.`);
}

/** Keep supplied terms and frozen BOQ terms; an unset field stays unset. */
export function resolveProcurementBasketAwardLineTerms(
  raw: unknown,
  boqLines: ReadonlyArray<Pick<ProcurementBasketBoqLine, "id" | "scopeType" | "targetDate" | "deliveryLocation">>,
  _allowLegacyBoqTerms = false
): ProcurementBasketAwardLineTerm[] | undefined {
  const supplied = raw == null ? [] : Array.isArray(raw) ? raw : null;
  if (!supplied || supplied.length > boqLines.length || !boqLines.length)
    tenderConflict("PROCUREMENT_BASKET_AWARD_LINE_TERMS_REQUIRED", "Work-order terms must match awarded BOQ lines.");
  const byId = new Map<string, ProcurementBasketAwardLineTerm>();
  for (const value of supplied) {
    if (!value || typeof value !== "object")
      tenderConflict("PROCUREMENT_BASKET_AWARD_LINE_TERMS_REQUIRED", "Work-order terms must match awarded BOQ lines.");
    const line = value as Record<string, unknown>;
    const boqLineId = line.boqLineId;
    const scopeType = line.scopeType;
    const targetDate = line.targetDate;
    const deliveryLocation = typeof line.deliveryLocation === "string" ? line.deliveryLocation.trim() : line.deliveryLocation;
    const parsedDate = typeof targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(targetDate)
      ? new Date(`${targetDate}T00:00:00.000Z`) : null;
    if (typeof boqLineId !== "string" || byId.has(boqLineId) ||
      (scopeType !== undefined && !["supply", "execution", "supply_and_execution"].includes(String(scopeType))) ||
      (targetDate !== undefined && (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== targetDate)) ||
      (deliveryLocation !== undefined && (typeof deliveryLocation !== "string" || !deliveryLocation || deliveryLocation.length > 500)))
      tenderConflict("PROCUREMENT_BASKET_AWARD_LINE_TERMS_REQUIRED", "Work-order terms must match valid BOQ lines.");
    byId.set(boqLineId, { boqLineId,
      ...(scopeType === undefined ? {} : { scopeType: scopeType as ProcurementBasketAwardLineTerm["scopeType"] }),
      ...(targetDate === undefined ? {} : { targetDate: targetDate as string }),
      ...(deliveryLocation === undefined ? {} : { deliveryLocation: deliveryLocation as string }) });
  }
  const resolved = boqLines.map(line => {
    const terms = byId.get(line.id);
    if ((line.scopeType && terms?.scopeType && terms.scopeType !== line.scopeType) ||
      (line.targetDate && terms?.targetDate && terms.targetDate !== line.targetDate) ||
      (line.deliveryLocation && terms?.deliveryLocation && terms.deliveryLocation !== line.deliveryLocation))
      tenderConflict("PROCUREMENT_BASKET_AWARD_TERMS_CHANGED", "The vendor-facing BOQ terms changed. Revise and resend the BOQ before awarding it.");
    return { boqLineId: line.id,
      ...(terms?.scopeType ?? line.scopeType ? { scopeType: terms?.scopeType ?? line.scopeType } : {}),
      ...(terms?.targetDate ?? line.targetDate ? { targetDate: terms?.targetDate ?? line.targetDate } : {}),
      ...(terms?.deliveryLocation ?? line.deliveryLocation ? { deliveryLocation: terms?.deliveryLocation ?? line.deliveryLocation } : {}) };
  });
  if (byId.size !== supplied.length || supplied.some(value => !boqLines.some(line => line.id === value.boqLineId)))
    tenderConflict("PROCUREMENT_BASKET_AWARD_LINE_TERMS_REQUIRED", "Work-order terms must match awarded BOQ lines.");
  return resolved.some(row => row.scopeType || row.targetDate || row.deliveryLocation) ? resolved : undefined;
}

async function scopedAward(awardId: string, projectId: string, basketId: string, enquiryId: string,
  session: ClientSession): Promise<TenderRow> {
  const award = await ProcurementBasketAwardModel.findOne({ _id: awardId, projectId,
    mainBasketId: basketId, enquiryId }).session(session).lean() as TenderRow | null;
  if (!award) throw new ApiError(404, "PROCUREMENT_BASKET_AWARD_NOT_FOUND", "This award is unavailable.");
  return award;
}

async function currentProposal(award: TenderRow, session: ClientSession): Promise<TenderRow> {
  const proposal = await ProcurementBasketAwardRevisionModel.findOne({ _id: award.currentProposalRevisionId,
    awardId: award._id }).session(session).lean() as TenderRow | null;
  if (!proposal) tenderConflict("PROCUREMENT_BASKET_PROPOSAL_MISSING", "The award proposal revision is unavailable.");
  return proposal!;
}

async function awardDto(award: TenderRow, session: ClientSession): Promise<ProcurementBasketAwardDto> {
  const proposal = await currentProposal(award, session);
  const approvalRows = await ProcurementBasketAwardApprovalModel.find({ awardId: award._id,
    proposalRevisionId: proposal._id }).sort({ decidedAt: 1 }).session(session).lean() as TenderRow[];
  const bid = await ProcurementBasketBidModel.findById(proposal.bidId).session(session).lean() as TenderRow | null;
  const boq = await ProcurementBasketBoqRevisionModel.findById(proposal.boqRevisionId).session(session).lean() as TenderRow | null;
  if (!bid || !boq) tenderConflict("PROCUREMENT_BASKET_AWARD_SOURCE_MISSING", "The award source is unavailable.");
  const byBoq = new Map((boq.lines as ProcurementBasketBoqLine[]).map(line => [line.id, line]));
  const lines: ProcurementBasketComparisonLine[] = (bid.lines as TenderRow[]).map(line => {
    const source = byBoq.get(String(line.boqLineId));
    if (!source) tenderConflict("PROCUREMENT_BASKET_AWARD_SOURCE_MISSING", "An awarded BOQ line is unavailable.");
    return { boqLineId: String(line.boqLineId), description: source.description,
      quantityMilliUnits: source.quantityMilliUnits, uomCode: source.uomCode,
      unitPricePaise: Number(line.unitPricePaise), gstBasisPoints: Number(line.gstBasisPoints),
      netPaise: Number(line.netPaise), gstPaise: Number(line.gstPaise), totalPaise: Number(line.totalPaise) };
  });
  return { id: String(award._id), enquiryId: String(award.enquiryId), projectId: String(award.projectId),
    mainBasketId: String(award.mainBasketId), version: Number(award.version), status: award.status,
    requiresRevision: Boolean(award.requiresRevision),
    autoIssueOnApproval: award.autoIssueOnApproval === true,
    issueBlocker: award.issueBlocker ? { code: String(award.issueBlocker.code),
      message: String(award.issueBlocker.message) } : null,
    vendorId: String(award.vendorId), bidId: String(award.bidId), proposalRevisionId: String(proposal._id),
    issuedPurchaseOrderId: award.issuedPurchaseOrderId ? String(award.issuedPurchaseOrderId) : null,
    withdrawal: proposal.withdrawnFromProposalRevisionId ? {
      priorProposalRevisionId: String(proposal.withdrawnFromProposalRevisionId),
      reason: String(proposal.withdrawalReason), withdrawnAt: tenderIso(proposal.createdAt),
      withdrawnById: String(proposal.createdById) } : null,
    proposal: { revision: Number(proposal.revision), proposalDigest: String(proposal.proposalDigest),
      boqRevisionId: String(proposal.boqRevisionId), bidId: String(proposal.bidId), vendorId: String(proposal.vendorId),
      vendorName: String(proposal.vendorName), totals: proposal.totals,
      approvedEstimatePaise: Number(proposal.approvedEstimatePaise), committedNetPaise: Number(proposal.committedNetPaise),
      terms: proposal.terms ?? null,
      lineTerms: resolveProcurementBasketAwardLineTerms(proposal.lineTerms,
        boq.lines as ProcurementBasketBoqLine[], true),
      advanceBasisPoints: Number(proposal.advanceBasisPoints),
      milestones: proposal.milestones as ProcurementBasketPaymentMilestone[], requiredSlots: proposal.requiredSlots,
      budgetOverrideRequired: Boolean(proposal.budgetOverrideRequired),
      recommendedBidId: proposal.recommendedBidId ? String(proposal.recommendedBidId) : null,
      nonRecommendedReason: proposal.nonRecommendedReason ?? null,
      programManagerId: proposal.programManagerId ? String(proposal.programManagerId) : null,
      designerId: proposal.designerId ? String(proposal.designerId) : null,
      officialKpiAssessmentId: String(proposal.officialKpiAssessmentId),
      officialKpiAssessmentRevision: Number(proposal.officialKpiAssessmentRevision) },
    approvals: approvalRows.map(row => ({ slot: String(row.slot), actorId: String(row.actorId),
      decision: row.decision, reason: row.reason ?? null, decidedAt: tenderIso(row.decidedAt) })), lines };
}

export async function assertProposalFresh(award: TenderRow, proposal: TenderRow, session: ClientSession): Promise<void> {
  const enquiry = await getBasketEnquiry(String(award.projectId), String(award.mainBasketId), String(award.enquiryId), session);
  const current = await prepareAward(enquiry, String(proposal.bidId), Number(proposal.advanceBasisPoints),
    null, session);
  const approvers = await resolveBasketProjectApprovers(String(award.projectId), current.preparation.estimateSource.estimateId,
    proposal.requiredSlots, session, true);
  assertBasketFrozenApprovers(proposal, approvers);
  resolveProcurementBasketAwardLineTerms(proposal.lineTerms,
    current.comparison.revision.lines as ProcurementBasketBoqLine[], true);
  // Frozen proposals retain the approval route recorded before the small-order policy changed.
  const retainedBudgetOverride = Number(current.bid.totals.totalPaise) < PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE &&
    proposal.budgetOverrideRequired === true && (proposal.requiredSlots as string[]).includes("budget_override") &&
    BigInt(current.preparation.committedPaise) + BigInt(current.bid.totals.netPaise) > BigInt(current.preparation.approvedEstimatePaise);
  if (current.comparison.boqRevisionId !== String(proposal.boqRevisionId) ||
    current.comparison.comparisonDigest !== proposal.comparisonDigest ||
    String(current.bid.bidDigest) !== proposal.bidDigest ||
    String(current.kpiAssessment._id) !== String(proposal.officialKpiAssessmentId) ||
    Number(current.kpiAssessment.revision) !== Number(proposal.officialKpiAssessmentRevision) ||
    current.preparation.approvedEstimatePaise !== Number(proposal.approvedEstimatePaise) ||
    current.preparation.committedPaise !== Number(proposal.committedNetPaise) ||
    (current.preview.budgetOverrideRequired || retainedBudgetOverride) !== proposal.budgetOverrideRequired)
    tenderConflict("PROCUREMENT_BASKET_PROPOSAL_STALE", "The BOQ, bid, KPI, budget or project approver changed. Revise and resubmit this award.");
}

async function proposalApprovers(award: TenderRow, proposal: TenderRow, session: ClientSession,
  fence = false): Promise<BasketProjectApprovers> {
  const boq = await ProcurementBasketBoqRevisionModel.findById(proposal.boqRevisionId)
    .select({ estimateSource: 1 }).session(session).lean() as TenderRow | null;
  if (!boq) throw new ApiError(409, "PROCUREMENT_BASKET_PROPOSAL_STALE", "The award source is unavailable. Revise this award.");
  return resolveBasketProjectApprovers(String(award.projectId), String(boq.estimateSource.estimateId),
    proposal.requiredSlots, session, fence);
}

async function activeRole(actorId: string, role: string, session: ClientSession): Promise<boolean> {
  return !!await UserModel.exists({ _id: actorId, role, active: true }).session(session);
}
async function requireActiveActor(actor: PublicUser, session: ClientSession): Promise<void> {
  if (!await activeRole(actor.id, actor.role, session)) throw new ApiError(403, "FORBIDDEN", "Your account cannot review this work order.");
}

function actorSlot(actor: PublicUser, approvers: BasketProjectApprovers, proposal: TenderRow): string | null {
  if (actor.role === "site_manager" && approvers.assignedSiteManager?.id === actor.id && proposal.programManagerId === actor.id) return "program_manager";
  if (actor.role === "designer" && approvers.assignedDesigner?.id === actor.id && proposal.designerId === actor.id) return "designer";
  if (actor.role === "procurement") return "procurement";
  if (actor.role === "finance_head") return "finance_head";
  if (actor.role === "super_admin") return "budget_override";
  return null;
}

function reviewerSlot(role: PublicUser["role"]): string | null {
  switch (role) {
    case "site_manager": return "program_manager";
    case "designer": return "designer";
    case "procurement": return "procurement";
    case "finance_head": return "finance_head";
    case "super_admin": return "budget_override";
    default: return null;
  }
}
