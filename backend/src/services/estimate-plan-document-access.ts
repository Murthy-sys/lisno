import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import type { PublicUser } from "./auth.service.js";

export async function requirePlanDocumentStaff(user: PublicUser, estimateId: string, edit = false) {
  const estimate = await EstimateModel.findById(estimateId).lean();
  if (!estimate) throw planDocumentNotFound();
  const approved = estimate.status === "client_approved";
  const allowed = user.role === "super_admin" ? !edit : user.role === "estimator_sales" && String(estimate.ownerId) === user.id ? !approved || !edit : approved
    ? user.role === "designer" && String(estimate.designPlanDesignerId) === user.id
    : user.role === "estimator_sales" ? String(estimate.ownerId) === user.id
      : ["designer", "design_manager", "design_head"].includes(user.role) &&
        [estimate.assignedDesignerId, estimate.assignedManagerId].filter(Boolean).map(String).includes(user.id);
  if (!allowed) throw new ApiError(403, "FORBIDDEN", "You are not assigned to this design plan.");
  if (edit && (estimate.designFrozenAt || (approved
    ? !["assigned", "in_progress", "changes_requested"].includes(String(estimate.designPlanStatus))
    : user.role !== "estimator_sales"))) {
    throw new ApiError(409, "ESTIMATE_DESIGN_LOCKED", "This design plan is read-only.");
  }
  return estimate;
}

export async function requirePlanDocumentClientRound(user: PublicUser, estimateId: string, roundId?: string) {
  if (!["client", "super_admin"].includes(user.role)) throw new ApiError(403, "FORBIDDEN", "You cannot read this submitted design plan.");
  const estimate = await EstimateModel.findById(estimateId).lean();
  if (!estimate) throw planDocumentNotFound();
  const lead = await LeadModel.findById(estimate.leadId).lean();
  if (!lead || (user.role !== "super_admin" && normalizeEmail(String(lead.clientEmail)) !== normalizeEmail(user.email))) throw planDocumentNotFound();
  const round = await DesignPlanReviewRoundModel.findOne({
    estimateId,
    ...(roundId ? { _id: roundId } : {}),
    status: { $in: ["pending", "approved", "changes_requested"] }
  }).sort({ designPlanVersion: -1 }).select("+attachments.storageReference").lean();
  if (!round) throw new ApiError(409, "DESIGN_PLAN_NOT_REVIEWABLE", "The design plan has not been submitted for Client review.");
  return round;
}

export function planDocumentNotFound() {
  return new ApiError(404, "DESIGN_PLAN_DOCUMENT_NOT_FOUND", "The design plan document was not found.");
}
