import { notifyIssuedWorkCommitted } from "./issued-work-delivery.js";
import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";
import { calculatePurchaseOrderLine, calculatePurchaseOrderTotals, type ApprovedPurchaseOrderLine } from "../domain/project-purchase-order.js";
import { procurementItemIdentity, plannedOrderQuantityMatchesUom } from "../domain/project-procurement.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { requiredProcurementBasketApprovalSlots, PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE,
  type ProcurementBasketBoqLine } from "../domain/procurement-basket-tender.js";
import { procurementBasketLineBoqReady } from "../domain/procurement-basket-projection.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { ProcurementBasketAwardApprovalModel, ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel,
  ProcurementBasketBidModel, ProcurementBasketBoqRevisionModel, ProcurementBasketEnquiryModel } from "../models/ProcurementBasketTender.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRequestModel } from "../models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderRequestRevisionModel } from "../models/ProjectPurchaseOrderRequestRevision.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { UserModel } from "../models/User.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { assertProposalFresh, resolveProcurementBasketAwardLineTerms } from "./procurement-basket-award.service.js";
import { basketVendorScopeMatchesRevision, currentBasket } from "./procurement-basket-tender-support.service.js";
import { assertBasketVendorEligible } from "./procurement-basket-vendor-eligibility.service.js";
import { assertPurchaseOrderAllocations, prepareProcurementAllocation } from "./procurement-vendor-allocation.service.js";
import { assertProcurementProjectAccess, procurementItemSourceSnapshot } from "./procurement.service.js";
import { buildProjectPurchaseOrderPreparation } from "./project-purchase-order-preparation.service.js";
import { cutOverProjectAuthority, type PurchaseOrderApprovalHook } from "./project-purchase-order.service.js";
import { assertCompletionReviewAllowsOrderChanges } from "./site-completion-fence.js";

type Row = Record<string, any>;
const issueInputSchema = z.object({ expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u) }).strict();
export type ProcurementBasketIssueInput = z.infer<typeof issueInputSchema>;
export interface ProcurementBasketIssueResult { awardId: string; purchaseOrderId: string; orderNumber: string; status: "issued" }

/** Commits the approved basket award, its child allocations, purchase order and vendor assignments atomically. */
export function createProjectPurchaseOrderBasketIssueService(input: { audit: AuditService; onApproved: PurchaseOrderApprovalHook; onIssuedCommitted?: () => void | Promise<void>;
  now?: () => Date }) {
  const now = input.now ?? (() => new Date());
  return {
    async issue(actor: PublicUser, projectId: string, basketId: string, enquiryId: string, awardId: string,
      value: ProcurementBasketIssueInput,
      trigger?: { kind: "automatic_approval"; triggeringApprovalId: string;
        triggeringApprovalActorId: string }): Promise<ProcurementBasketIssueResult> {
      const parsed = issueInputSchema.safeParse(value);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid work-order issue request.");
      const fields = parsed.data;
      const requestDigest = digest({ projectId, basketId, enquiryId, awardId, ...fields });
      const result = await mongoose.connection.transaction<ProcurementBasketIssueResult>(async session => {
        await assertProcurementProjectAccess(actor, projectId, session);
        const award = await ProcurementBasketAwardModel.findOne({ _id: awardId, enquiryId, projectId, mainBasketId: basketId })
          .session(session).lean() as Row | null;
        if (!award) throw new ApiError(404, "PROCUREMENT_BASKET_AWARD_NOT_FOUND", "Award not found.");
        if (award.status === "issued") {
          if (award.issueIdempotencyKey !== fields.idempotencyKey || award.issueRequestDigest !== requestDigest || !award.issuedPurchaseOrderId)
            throw new ApiError(409, "PROCUREMENT_BASKET_ALREADY_ISSUED", "This basket award has already been issued.");
          const previous = await ProjectPurchaseOrderModel.findOne({ _id: award.issuedPurchaseOrderId, tenderAwardId: awardId })
            .select({ orderNumber: 1 }).session(session).lean();
          if (!previous) conflict("The issued purchase order is unavailable.");
          return { awardId, purchaseOrderId: String(previous._id), orderNumber: String(previous.orderNumber), status: "issued" };
        }
        if (award.version !== fields.expectedVersion || award.status !== "ready_to_issue" || award.requiresRevision === true)
          conflict("The award or its approvals changed. Refresh before issuing.");
        await assertCompletionReviewAllowsOrderChanges(projectId, session);
        const enquiry = await ProcurementBasketEnquiryModel.findOne({ _id: enquiryId, projectId, mainBasketId: basketId })
          .session(session).lean() as Row | null;
        const boq = await ProcurementBasketBoqRevisionModel.findOne({ _id: award.boqRevisionId, enquiryId, projectId, mainBasketId: basketId })
          .session(session).lean() as Row | null;
        const bid = await ProcurementBasketBidModel.findOne({ _id: award.bidId, enquiryId, boqRevisionId: award.boqRevisionId,
          projectId, mainBasketId: basketId, vendorId: award.vendorId }).session(session).lean() as Row | null;
        const proposal = await ProcurementBasketAwardRevisionModel.findOne({ _id: award.currentProposalRevisionId, awardId,
          enquiryId, projectId }).session(session).lean() as Row | null;
        if (!enquiry || !boq || !bid || !proposal || enquiry.currentBoqRevisionId !== boq._id ||
          enquiry.latestAwardId !== awardId || enquiry.status !== "award_pending" || proposal.boqDigest !== boq.digest ||
          proposal.bidDigest !== bid.bidDigest || proposal.bidId !== bid._id || proposal.vendorId !== award.vendorId)
          conflict("The award, BOQ or vendor quote changed. Refresh before issuing.");
        const source = await procurementItemSourceSnapshot(projectId, session, true);
        if (source.estimateId !== boq.estimateSource.estimateId || source.estimateVersion !== boq.estimateSource.estimateVersion ||
          source.estimateReviewRoundId !== boq.estimateSource.estimateReviewRoundId)
          conflict("The approved estimate changed after the BOQ was sent.");
        const preparation = await buildProjectPurchaseOrderPreparation(projectId, session);
        const basket = await currentBasket(projectId, basketId, session, String(boq.preparationDigest));
        if (!basketVendorScopeMatchesRevision(basket, boq))
          conflict("The frozen BOQ no longer matches the approved vendor-facing scope. Revise and resend it.");
        if (!basket.boqReady)
          conflict(basket.automaticSubVendor
            ? "The saved Sub-vendor Configuration cannot price every included line. Refresh the basket."
            : "Confirm a valid saved Configuration mode for every included line before issuing.");
        const basketLines = preparation.estimateLines.filter(line => line.mainBasketId === basketId && line.included && line.amountPaise !== null && line.amountPaise > 0);
        const bySourceKey = new Map(basketLines.map(line => [line.key, line]));
        if (!boq.lines.length || new Set(boq.lines.map((line: Row) => String(line.sourceLineItemKey))).size !== boq.lines.length ||
          boq.lines.some((line: Row) => !bySourceKey.has(String(line.sourceLineItemKey))))
          conflict("A frozen BOQ line no longer belongs to this approved main basket.");
        const projectedBySourceKey = new Map(basket.lines.map(line => [line.sourceLineItemKey, line]));
        if (boq.lines.some((line: Row) => {
          const projected = projectedBySourceKey.get(String(line.sourceLineItemKey));
          return !projected || !procurementBasketLineBoqReady(basket, projected);
        }))
          conflict(basket.automaticSubVendor
            ? "The saved Sub-vendor Configuration cannot price every BOQ main line. Refresh the basket."
            : "Confirm a valid saved Configuration mode for every BOQ main line before issuing.");
        const quoted = new Map((bid.lines as Row[]).map(line => [String(line.boqLineId), line]));
        if (quoted.size !== boq.lines.length) conflict("The selected quote does not cover every BOQ line.");
        const candidate = await assertBasketVendorEligible(String(award.vendorId), projectId, basketId, session);
        if (candidate.kpiScoreBps === null || candidate.kpiScoreBps !== proposal.officialKpiScoreBps)
          conflict("The selected vendor KPI changed after this award proposal. Refresh the comparison and approvals.");
        const fence = await ProjectModel.findOneAndUpdate({ _id: projectId, status: "active" },
          { $inc: { purchaseOrderApprovalEpoch: 1 } }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean() as Row | null;
        if (!fence) conflict("This project is no longer active.");
        await assertProposalFresh(award, proposal, session);
        const termsByBoqLineId = new Map((resolveProcurementBasketAwardLineTerms(proposal.lineTerms,
          boq.lines as ProcurementBasketBoqLine[], true) ?? []).map(line => [line.boqLineId, line]));
        const gross = Number(bid.totals?.totalPaise);
        if (!Number.isSafeInteger(gross) || gross <= 0 || gross > MAX_FINANCE_AMOUNT_PAISE ||
          gross !== proposal.totals?.totalPaise || bid.totals.netPaise !== proposal.totals?.netPaise)
          conflict("The selected quote totals are inconsistent.");
        const required = requiredProcurementBasketApprovalSlots(gross);
        const proposalSlots = new Set((proposal.requiredSlots as string[]) ?? []);
        if (required.some(slot => !proposalSlots.has(slot))) conflict("The award approval route is incomplete.");
        const approvals = await ProcurementBasketAwardApprovalModel.find({ awardId, proposalRevisionId: proposal._id })
          .session(session).lean() as Row[];
        const relevantApprovals: Row[] = [];
        for (const slot of proposalSlots) {
          const decision = approvals.find(row => row.slot === slot);
          if (!decision || decision.decision !== "approve" || decision.proposalDigest !== proposal.proposalDigest)
            conflict("The current award proposal still needs approval.");
          relevantApprovals.push(decision);
        }
        if (new Set(relevantApprovals.map(row => String(row.actorId))).size !== relevantApprovals.length)
          conflict("Each required approval must come from a distinct person.");
        const approvers = await UserModel.find({ _id: { $in: relevantApprovals.map(row => row.actorId) }, active: true })
          .select({ _id: 1, role: 1 }).session(session).lean() as Row[];
        const approverById = new Map(approvers.map(row => [String(row._id), row]));
        for (const decision of relevantApprovals) {
          const expectedRole = decision.slot === "budget_override" ? "super_admin"
            : decision.slot === "program_manager" ? "site_manager" : decision.slot;
          if (approverById.get(String(decision.actorId))?.role !== expectedRole ||
            (decision.slot === "program_manager" && decision.actorId !== proposal.programManagerId) ||
            (decision.slot === "designer" && decision.actorId !== proposal.designerId))
            conflict("An assigned approver is no longer active or eligible.");
        }
        const approvedBudget = source.lineItems.reduce((sum, line) => sum + BigInt(line.amountPaise), 0n);
        const priorOrders = await ProjectPurchaseOrderModel.find({ projectId, approvedRevisionId: { $ne: null }, cancelledAt: null })
          .select({ approvedNetPaise: 1 }).session(session).lean() as Row[];
        const committed = priorOrders.reduce((sum, row) => sum + BigInt(row.approvedNetPaise), BigInt(bid.totals.netPaise));
        const needsOverride = gross >= PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE && committed > approvedBudget;
        if (needsOverride && (!proposal.budgetOverrideRequired || !proposalSlots.has("budget_override")))
          conflict("The basket now exceeds the approved estimate. Refresh the award for Super Admin approval.");
        const override = approvals.find(row => row.slot === "budget_override" && row.decision === "approve" &&
          row.proposalDigest === proposal.proposalDigest && typeof row.reason === "string" && row.reason.trim().length >= 10);
        if (needsOverride && !override) conflict("A reasoned Super Admin budget override is required.");
        await assertNoSourceOverlap(projectId, source.estimateId, source.estimateVersion,
          boq.lines.map((line: Row) => String(line.sourceLineItemKey)), session);
        const timestamp = now();
        const orderId = `purchase-order-${randomUUID()}`;
        const revisionId = `purchase-order-revision-${randomUUID()}`;
        const orderNumber = `PO-${timestamp.toISOString().slice(0, 10).replace(/-/gu, "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const approvedLines: ApprovedPurchaseOrderLine[] = [];
        for (const boqLine of boq.lines as Row[]) {
          const quote = quoted.get(String(boqLine.id));
          const lineTerms = termsByBoqLineId.get(String(boqLine.id));
          const prepared = bySourceKey.get(String(boqLine.sourceLineItemKey));
          const sourceLine = source.lineItems.find(line => line.key === boqLine.sourceLineItemKey);
          if (!quote || !prepared || !sourceLine || prepared.roomName !== boqLine.roomName ||
            prepared.quantity !== boqLine.approvedQuantity || prepared.unit !== boqLine.approvedUnit)
            conflict("The BOQ or selected quote no longer matches the approved estimate.");
          const amount = calculatePurchaseOrderLine({ quantityMilliUnits: boqLine.quantityMilliUnits,
            unitPricePaise: quote.unitPricePaise, gstBasisPoints: quote.gstBasisPoints });
          if (amount.netPaise !== quote.netPaise || amount.gstPaise !== quote.gstPaise || amount.totalPaise !== quote.totalPaise)
            conflict("The selected quote amount is inconsistent.");
          const uom = await AiEstimatorKnowledgeUomModel.findOne({ _id: boqLine.uomId, status: "active" })
            .session(session).lean() as Row | null;
          if (!uom || uom.code !== boqLine.uomCode || uom.decimalScale !== boqLine.uomDecimalScale ||
            !plannedOrderQuantityMatchesUom(boqLine.quantityMilliUnits, Number(uom.decimalScale)))
            conflict("The BOQ unit of measure changed. Refresh the enquiry.");
          const allocation = await prepareProcurementAllocation({ vendorId: candidate.vendorId,
            allocatedWorkPaise: amount.totalPaise }, session);
          const vendor = allocation.vendor;
          if (!vendor) conflict("The selected vendor is unavailable.");
          const itemId = `procurement-item-${randomUUID()}`;
          const itemName = String(boqLine.description).slice(0, 200);
          const brand = "Awarded BOQ";
          await ProjectProcurementItemModel.create([{ _id: itemId, projectId,
            estimateId: source.estimateId, estimateVersion: source.estimateVersion,
            estimateReviewRoundId: source.estimateReviewRoundId, sourceSectionId: sourceLine.sectionId,
            sourceLineItemKey: sourceLine.key, tenderAwardId: awardId, tenderBoqLineId: boqLine.id,
            itemName, itemNameNormalized: procurementItemIdentity(itemName), brand,
            brandNormalized: procurementItemIdentity(brand), uomId: uom._id, uomCode: uom.code, uomName: uom.name,
            uomSearch: procurementItemIdentity(`${uom.code} ${uom.name}`), uomDecimalScale: uom.decimalScale,
            vendorId: vendor._id, vendorCode: vendor.code, vendorName: vendor.name,
            vendorSearch: procurementItemIdentity(`${vendor.code} ${vendor.name}`), pricePaise: quote.unitPricePaise,
            plannedOrderQuantityMilliUnits: boqLine.quantityMilliUnits, allocatedWorkPaise: allocation.allocatedWorkPaise,
            allocationTrackingVersion: allocation.allocationTrackingVersion,
            version: 1, createdById: actor.id, updatedById: actor.id,
            createdAt: timestamp, updatedAt: timestamp }], { session });
          approvedLines.push({ id: `purchase-order-line-${randomUUID()}`, procurementItemId: itemId, procurementItemVersion: 1,
            estimateId: source.estimateId, estimateVersion: source.estimateVersion,
            estimateReviewRoundId: source.estimateReviewRoundId, sourceSectionId: sourceLine.sectionId,
            sourceLineItemKey: sourceLine.key, roomName: sourceLine.roomName, itemName, brand,
            uomId: String(uom._id), uomCode: String(uom.code), uomName: String(uom.name),
            quantityMilliUnits: boqLine.quantityMilliUnits, unitPricePaise: quote.unitPricePaise,
            gstBasisPoints: quote.gstBasisPoints, description: boqLine.description,
            ...(lineTerms?.scopeType ? { scopeType: lineTerms.scopeType } : {}),
            ...(lineTerms?.targetDate ? { targetDate: lineTerms.targetDate } : {}),
            ...(lineTerms?.deliveryLocation ? { deliveryLocation: lineTerms.deliveryLocation } : {}), ...amount });
        }
        const totals = calculatePurchaseOrderTotals(approvedLines);
        if (totals.netPaise !== bid.totals.netPaise || totals.gstPaise !== bid.totals.gstPaise || totals.totalPaise !== gross)
          conflict("The awarded quote no longer reconciles to the work order.");
        await assertPurchaseOrderAllocations({ projectId, lines: approvedLines }, session);
        await cutOverProjectAuthority(projectId, actor.id, timestamp, input.audit, session);
        const generatedKey = digest({ awardId, proposalRevisionId: proposal._id, orderId });
        const orderRevision = new ProjectPurchaseOrderRevisionModel({ _id: revisionId, orderId, projectId,
          tenderAwardId: awardId, vendorId: candidate.vendorId, orderNumber, revision: 1,
          estimateId: source.estimateId, estimateVersion: source.estimateVersion,
          estimateReviewRoundId: source.estimateReviewRoundId, vendorCode: candidate.code, vendorName: candidate.name,
          terms: proposal.terms ?? null, lines: approvedLines, ...totals, submittedAt: timestamp, submittedById: actor.id,
          idempotencyKey: generatedKey, requestDigest });
        await orderRevision.validate();
        await ProjectPurchaseOrderRevisionModel.collection.insertOne(orderRevision.toObject(), { session });
        const order = new ProjectPurchaseOrderModel({ _id: orderId, orderNumber, projectId,
          tenderAwardId: awardId, vendorId: candidate.vendorId, vendorCode: candidate.code, vendorName: candidate.name,
          estimateId: source.estimateId, estimateVersion: source.estimateVersion,
          estimateReviewRoundId: source.estimateReviewRoundId, status: "approved", version: 1, revision: 1,
          terms: proposal.terms ?? null, draftLines: approvedLines.map(line => ({ id: line.id, procurementItemId: line.procurementItemId,
            procurementItemVersion: line.procurementItemVersion, quantityMilliUnits: line.quantityMilliUnits,
            unitPricePaise: line.unitPricePaise, gstBasisPoints: line.gstBasisPoints,
            ...(line.scopeType ? { scopeType: line.scopeType } : {}), description: line.description,
            ...(line.targetDate ? { targetDate: line.targetDate } : {}),
            ...(line.deliveryLocation ? { deliveryLocation: line.deliveryLocation } : {}) })),
          draftNetPaise: totals.netPaise, draftGstPaise: totals.gstPaise, draftTotalPaise: totals.totalPaise,
          submittedRevisionId: revisionId, approvedRevisionId: revisionId, approvedRevision: 1,
          approvedNetPaise: totals.netPaise, approvedGstPaise: totals.gstPaise, approvedTotalPaise: totals.totalPaise,
          approvedAt: timestamp, decisions: [{ id: `purchase-order-decision-${randomUUID()}`, revisionId,
            revision: 1, decision: "approve", actorId: actor.id, reason: "Basket award approvals complete",
            budgetOverrideReason: override?.reason ?? null, decidedAt: timestamp,
            idempotencyKey: generatedKey, requestDigest }], receipts: [],
          createIdempotencyKey: generatedKey, createRequestDigest: requestDigest,
          createdById: actor.id, updatedById: actor.id, createdAt: timestamp, updatedAt: timestamp });
        await order.validate();
        await ProjectPurchaseOrderModel.collection.insertOne(order.toObject(), { session });
        await input.onApproved({ actorId: actor.id, approvedRevisionId: revisionId, occurredAt: timestamp, orderId, projectId, vendorId: candidate.vendorId, revision: 1, lines: approvedLines }, session);
        const issued = await ProcurementBasketAwardModel.updateOne({ _id: awardId, version: fields.expectedVersion,
          status: "ready_to_issue", currentProposalRevisionId: proposal._id }, {
          $set: { status: "issued", issuedPurchaseOrderId: orderId, issueIdempotencyKey: fields.idempotencyKey,
            issueRequestDigest: requestDigest, issueBlocker: null, updatedById: actor.id, updatedAt: timestamp }, $inc: { version: 1 }
        }, { session, runValidators: true, timestamps: false });
        if (issued.matchedCount !== 1) conflict("The award changed while issuing its work order.");
        const enquiryResult = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId, status: "award_pending",
          currentBoqRevisionId: boq._id, latestAwardId: awardId }, {
          $set: { status: "issued", updatedById: actor.id, updatedAt: timestamp }, $inc: { version: 1 }
        }, { session, runValidators: true, timestamps: false });
        if (enquiryResult.matchedCount !== 1) conflict("The enquiry changed while issuing its work order.");
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_work_order_issued",
          entityType: "project_purchase_order", entityId: orderId, occurredAt: timestamp.toISOString(),
          newValues: { projectId, basketId, enquiryId, awardId, proposalRevisionId: proposal._id, bidId: bid._id,
            vendorId: candidate.vendorId, netPaise: totals.netPaise, gstPaise: totals.gstPaise, totalPaise: totals.totalPaise,
            issueTrigger: trigger?.kind ?? "manual", triggeringApprovalActorId: trigger?.triggeringApprovalActorId ?? null,
            triggeringApprovalId: trigger?.triggeringApprovalId ?? null,
            submittedById: award.submittedById ?? null } }, session);
        return { awardId, purchaseOrderId: orderId, orderNumber, status: "issued" };
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
      await notifyIssuedWorkCommitted(input.onIssuedCommitted);
      return result;
    },
    async issueAutomatically(input: { awardId: string; proposalRevisionId: string; expectedVersion: number;
      triggeringApprovalId: string; triggeringApprovalActorId: string }): Promise<ProcurementBasketIssueResult> {
      const award = await ProcurementBasketAwardModel.findById(input.awardId).lean() as Row | null;
      if (!award || award.autoIssueOnApproval !== true || !award.submittedById ||
        String(award.currentProposalRevisionId) !== input.proposalRevisionId ||
        !["ready_to_issue", "issued"].includes(String(award.status)))
        throw new ApiError(409, "PROCUREMENT_BASKET_AUTO_ISSUE_UNAVAILABLE", "This award is not ready for automatic issue.");
      const triggeringApproval = await ProcurementBasketAwardApprovalModel.exists({ _id: input.triggeringApprovalId,
        awardId: input.awardId, proposalRevisionId: input.proposalRevisionId,
        actorId: input.triggeringApprovalActorId, decision: "approve" });
      if (!triggeringApproval)
        throw new ApiError(409, "PROCUREMENT_BASKET_AUTO_ISSUE_UNAVAILABLE", "The triggering approval is unavailable.");
      const submitter = await UserModel.findOne({ _id: award.submittedById, role: "procurement", active: true })
        .select({ name: 1, email: 1, role: 1 }).lean();
      if (!submitter)
        throw new ApiError(409, "PROCUREMENT_BASKET_ISSUE_SUBMITTER_UNAVAILABLE",
          "The submitting Procurement account is unavailable. Another authorized Procurement user can retry issuance.");
      const actor: PublicUser = { id: String(submitter._id), name: String(submitter.name),
        email: String(submitter.email), role: "procurement" };
      const idempotencyKey = `auto_${digest({ awardId: input.awardId,
        proposalRevisionId: input.proposalRevisionId }).slice(0, 64)}`;
      return this.issue(actor, String(award.projectId), String(award.mainBasketId), String(award.enquiryId),
        input.awardId, { expectedVersion: input.expectedVersion, idempotencyKey },
        { kind: "automatic_approval", triggeringApprovalId: input.triggeringApprovalId,
          triggeringApprovalActorId: input.triggeringApprovalActorId });
    }
  };
}

async function assertNoSourceOverlap(projectId: string, estimateId: string, estimateVersion: number,
  sourceKeys: readonly string[], session: ClientSession): Promise<void> {
  const children = await ProjectProcurementItemModel.find({ projectId, estimateId, estimateVersion,
    sourceLineItemKey: { $in: sourceKeys } }).select({ _id: 1 }).session(session).lean();
  const ids = children.map(row => String(row._id));
  if (!ids.length) return;
  if (await ProjectPurchaseOrderModel.exists({ projectId, status: { $ne: "cancelled" },
    "draftLines.procurementItemId": { $in: ids } }).session(session))
    conflict("A purchase order already uses an item in this main basket.");
  const requests = await ProjectPurchaseOrderRequestModel.find({ projectId, status: { $in: ["pending_approval", "changes_requested"] } })
    .select({ submittedRevisionId: 1 }).session(session).lean();
  if (requests.length && await ProjectPurchaseOrderRequestRevisionModel.exists({ projectId,
    _id: { $in: requests.map(row => row.submittedRevisionId) }, "lines.procurementItemId": { $in: ids } }).session(session))
    conflict("A project purchase-order request already uses an item in this main basket.");
}

function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function conflict(message: string): never { throw new ApiError(409, "PROCUREMENT_BASKET_ISSUE_CONFLICT", message); }
