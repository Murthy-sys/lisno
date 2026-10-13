import type mongoose from "mongoose";
import { isDeepStrictEqual } from "node:util";
import { isCollaborativeEstimate, estimateWorkingCopyEditable, type EstimationLifecycle } from "../domain/estimation-lifecycle.js";
import { ApiError } from "../middleware/errors.js";
import { ProjectModel } from "../models/Project.js";
import { LeadModel } from "../models/Lead.js";
import { UserModel } from "../models/User.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import type { PublicUser } from "./auth.service.js";

type Row = Record<string, any>;

export function assertEstimateEditable(estimate: Row): void {
  if (!estimateWorkingCopyEditable(estimate)) throw new ApiError(409, "ESTIMATE_LOCKED",
    estimate.estimation?.editClosedAt ? "Design and the final estimate are approved. Estimate editing is closed." :
      "Withdraw the pending review before editing this estimate.");
}

export function canStaffEditEstimate(actor: Pick<PublicUser, "id" | "role">, estimate: Row): boolean {
  return actor.role === "super_admin" || actor.role === "estimator_sales" && estimate.ownerId === actor.id ||
    actor.role === "designer" && isCollaborativeEstimate(estimate) && estimate.estimation.phase === "post" &&
      estimate.designPlanDesignerId === actor.id;
}

export async function requireEstimateStaffActor(actorId: string, estimate: Row, session?: mongoose.ClientSession, expectedRole?: PublicUser["role"]): Promise<void> {
  const query = UserModel.findOne({ _id: actorId, active: true });
  if (session) query.session(session);
  const actor = await query.lean();
  if (!actor || expectedRole && actor.role !== expectedRole || !canStaffEditEstimate({ id: actorId, role: actor.role }, estimate))
    throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
}

/** All commercial, requirements, design and payment writers serialize on this project document. */
export async function fenceCollaborativeEstimate(estimate: Row, session: mongoose.ClientSession): Promise<Row | null> {
  if (!isCollaborativeEstimate(estimate)) return null;
  const project = await ProjectModel.findOneAndUpdate({
    _id: estimate.projectId, estimationWorkflowVersion: 2,
    estimateRequirementsVersion: estimate.estimation.requirementsVersion
  }, { $inc: { estimationFenceEpoch: 1 } }, { session, returnDocument: "after" }).lean();
  if (!project) throw new ApiError(409, "ESTIMATE_SOURCE_CONFLICT", "Project requirements changed. Refresh this estimate.");
  return project as Row;
}

export async function requireEstimateClientMembership(actor: PublicUser, estimate: Row,
  session?: mongoose.ClientSession): Promise<void> {
  const notFound = () => new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
  if (!estimate.projectId) { if (isCollaborativeEstimate(estimate)) throw notFound(); return; }
  const query = ProjectModel.findById(estimate.projectId);
  if (session) query.session(session);
  const project = await query.lean();
  if (!isCollaborativeEstimate(estimate) && project?.estimationWorkflowVersion !== 2) return;
  if (actor.role !== "client" || !project || project.clientId !== actor.id || project.estimationWorkflowVersion !== 2) throw notFound();
  const leadQuery = LeadModel.findById(estimate.leadId);
  if (session) leadQuery.session(session);
  const lead = await leadQuery.lean();
  if (!lead || lead.projectId !== estimate.projectId || String(project._id) !== estimate.projectId) throw notFound();
}

export async function currentFinalDesignBinding(estimate: Row, session: mongoose.ClientSession): Promise<{
  designReviewRoundId: string; designPlanVersion: number; designScopeRevision: number;
}> {
  const lifecycle = estimate.estimation as EstimationLifecycle;
  if (!lifecycle.preApproval || estimate.designPlanStatus !== "approved" ||
      lifecycle.approvedDesignScopeRevision !== lifecycle.designScopeRevision)
    throw new ApiError(409, "ESTIMATE_DESIGN_RECONCILIATION_REQUIRED", "Complete and approve design for the current scope before final estimation.");
  const round = await DesignPlanReviewRoundModel.findOne({
    estimateId: estimate._id ?? estimate.id, projectId: estimate.projectId,
    designPlanVersion: estimate.designPlanVersion, status: "approved", decision: "approve"
  }).sort({ decidedAt: -1, _id: 1 }).session(session).lean();
  if (!round || round.designScopeRevision !== lifecycle.designScopeRevision)
    throw new ApiError(409, "ESTIMATE_DESIGN_SOURCE_CONFLICT", "The current approved design source is unavailable.");
  return { designReviewRoundId: String(round._id), designPlanVersion: Number(round.designPlanVersion),
    designScopeRevision: lifecycle.designScopeRevision };
}

/** Prices and Configuration provenance do not alter physical design scope. */
export function estimatePhysicalScopeChanged(before: Row, after: Row): boolean {
  const scope = (value: Row) => ({
    propertyType: value.propertyType, bedroomCount: value.bedroomCount ?? null,
    rooms: value.rooms ?? [], scopes: value.scopes ?? [], selectedMainBasketIds: value.selectedMainBasketIds ?? [],
    lines: (value.lineItems ?? []).filter((line: Row) => line.included).map((line: Row) => ({
      id: line.id, roomId: line.roomId ?? null, roomName: line.roomName,
      mainBasketId: line.mainBasketId ?? null, mainLineId: line.mainLineId ?? line.catalogueId,
      specification: line.specification ?? null, quantity: line.quantity, unit: line.uomId ?? line.unit
    })).sort((a: Row, b: Row) => String(a.id).localeCompare(String(b.id)))
  });
  return !isDeepStrictEqual(scope(before), scope(after));
}
