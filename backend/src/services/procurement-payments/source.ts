import type { ClientSession } from "mongoose";
import type { LifecycleBlocker } from "../../contracts/procurement-lifecycle.js";
import { lcConflict, lcDigest, lcMissing, lcSum } from "../../domain/procurement-lifecycle.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "../../domain/project-finance.js";
import { ApiError } from "../../middleware/errors.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../../models/ProjectPurchaseOrderRevision.js";
import { ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel } from "../../models/ProcurementBasketTender.js";
import { ProcurementBasketInvoiceAssessmentModel, ProcurementBasketInvoiceAssessmentRevisionModel } from "../../models/ProcurementBasketInvoiceAssessment.js";
import { ProjectPaymentCertificationModel } from "../../models/ProjectPaymentCertification.js";
import { readPaymentCertificationSource } from "../project-manager/vendors.js";
import type { LifecycleRow } from "../procurement-lifecycle/access.js";

export interface PaymentSourceMilestone { id: string; name: string; amountPaise: number; token: string | null; certificationId: string | null; certificationStatus: string; certified: boolean; issue: string | null; }
export interface PaymentSource { order: LifecycleRow; proposal: LifecycleRow | null; assessment: LifecycleRow | null; milestones: PaymentSourceMilestone[]; available: boolean; digest: string; blockers: LifecycleBlocker[]; }
const validMoney = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_FINANCE_AMOUNT_PAISE;
export const paymentBlocker = (code: string, message: string, entityId?: string): LifecycleBlocker => ({ code, message, tab: "payments", ...(entityId ? { entityId } : {}) });

/** Source identity contains commercial/approval revisions, never mutable Configuration prices. */
export async function readPaymentSource(projectId: string, orderId: string, session: ClientSession, lock = false): Promise<PaymentSource> {
  const order = await ProjectPurchaseOrderModel.findOne({ _id: orderId, projectId }).session(session).lean() as LifecycleRow | null;
  if (!order) lcMissing();
  if (lock) {
    const fenced = await ProjectPurchaseOrderModel.updateOne({ _id: orderId, projectId, approvedRevisionId: order.approvedRevisionId, version: order.version }, { $inc: { accessAuthorityEpoch: 1 } }, { session, timestamps: false });
    if (!fenced.matchedCount) lcConflict();
  }
  const blockers: LifecycleBlocker[] = [];
  const revision = order.approvedRevisionId ? await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId, projectId, orderId, vendorId: order.vendorId, revision: order.approvedRevision }).session(session).lean() as LifecycleRow | null : null;
  const award = order.tenderAwardId ? await ProcurementBasketAwardModel.findOne({ _id: order.tenderAwardId, projectId, status: "issued", issuedPurchaseOrderId: orderId }).session(session).lean() as LifecycleRow | null : null;
  const proposal = award ? await ProcurementBasketAwardRevisionModel.findOne({ _id: award.currentProposalRevisionId, awardId: award._id, projectId, vendorId: order.vendorId }).session(session).lean() as LifecycleRow | null : null;
  if (order.status !== "approved" || order.cancelledAt || !revision || !proposal || revision.tenderAwardId !== order.tenderAwardId || !validMoney(order.approvedTotalPaise) || revision.totalPaise !== order.approvedTotalPaise) {
    blockers.push(paymentBlocker("PAYMENT_SOURCE_UNAVAILABLE", "This order needs current issued payment scope before new payments can be authorized.", orderId));
  }
  const rawMilestones = Array.isArray(proposal?.milestones) ? proposal.milestones as LifecycleRow[] : [];
  const distinct = new Set(rawMilestones.map(row => row.id)).size === rawMilestones.length;
  const amountsValid = rawMilestones.length > 0 && rawMilestones.every(row => typeof row.id === "string" && typeof row.name === "string" && validMoney(row.amountPaise));
  if (!distinct || !amountsValid || amountsValid && lcSum(rawMilestones.map(row => row.amountPaise)) !== order.approvedTotalPaise) {
    blockers.push(paymentBlocker("PAYMENT_MILESTONES_UNAVAILABLE", "The issued milestone schedule is missing or inconsistent. Payment setup is required.", orderId));
  }
  const milestones: PaymentSourceMilestone[] = [];
  if (distinct && amountsValid) for (const milestone of rawMilestones) {
    let token: string | null = null, certificationId: string | null = null, certificationStatus = milestone.amountPaise === 0 ? "not_required" : "not_requested", certified = milestone.amountPaise === 0, issue: string | null = null;
    if (milestone.amountPaise > 0) {
      try {
        // The caller already fences Project, authorization, and this order. The
        // certification resolver's commercial lock disallows completed projects,
        // whereas an acknowledged retained payment remains payable after signoff.
        const current = await readPaymentCertificationSource(projectId, orderId, milestone.id, session, false);
        token = current.token;
        const certification = await ProjectPaymentCertificationModel.findOne({ projectId, orderId, orderRevisionId: order.approvedRevisionId, milestoneId: milestone.id }).session(session).lean();
        if (certification) {
          certificationId = String(certification._id);
          certificationStatus = certification.sourceToken === token ? certification.status : "source_changed";
          certified = certification.sourceToken === token && certification.status === "certified" && certification.amountPaise === milestone.amountPaise && certification.proposalRevisionId === proposal?._id;
        }
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        issue = error.message; certificationStatus = "setup_required";
      }
    }
    milestones.push({ id: milestone.id, name: milestone.name, amountPaise: milestone.amountPaise, token, certificationId, certificationStatus, certified, issue });
  }
  const assessmentPointer = await ProcurementBasketInvoiceAssessmentModel.findOne({ projectId, orderId }).session(session).lean();
  let assessment = assessmentPointer ? await ProcurementBasketInvoiceAssessmentRevisionModel.findOne({ _id: assessmentPointer.currentRevisionId, assessmentId: assessmentPointer._id, projectId, orderId, awardId: order.tenderAwardId }).session(session).lean() as LifecycleRow | null : null;
  if (assessmentPointer && (!assessment || !validMoney(assessment.invoiceTotalPaise) || !validMoney(assessment.tdsPaise) || !validMoney(assessment.netPayablePaise) || assessment.netPayablePaise !== assessment.invoiceTotalPaise - assessment.tdsPaise || assessment.invoiceTotalPaise > order.approvedTotalPaise)) {
    blockers.push(paymentBlocker("PAYMENT_ASSESSMENT_UNAVAILABLE", "The Finance assessment needs reconciliation.", orderId)); assessment = null;
  }
  const digest = lcDigest({ projectId, orderId, orderRevisionId: order.approvedRevisionId, status: order.status, cancelledAt: order.cancelledAt, vendorId: order.vendorId, proposalRevisionId: proposal?._id, milestones, assessment: assessment ? { id: assessment._id, gross: assessment.invoiceTotalPaise, withholding: assessment.tdsPaise, net: assessment.netPayablePaise } : null, blockers });
  return { order, proposal, assessment, milestones, available: blockers.length === 0, digest, blockers };
}
