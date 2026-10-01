import type { ClientSession } from "mongoose";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { EstimateClientResponseProofModel } from "../models/EstimateClientResponseProof.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectFinanceBucketModel } from "../models/ProjectFinanceBucket.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { UserModel } from "../models/User.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { vendorActivations } from "../services/vendor-readiness.service.js";

export interface ProjectStatusExecutionEvidence {
  hasApprovedOrder: boolean;
  people: Array<{ id: string; name: string; role: "vendor" | "procurement"; vendorId?: string }>;
  procurementOwnerIds: string[];
  pendingVendorUserIds: string[];
  vendorMemberIds: string[];
  procurementSources?: Array<{ estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null }>;
}

/** Status-only membership from a valid current approved revision; never broadens chat membership. */
export async function readMongoProjectStatusExecutionEvidence(projectId: string, session: ClientSession): Promise<ProjectStatusExecutionEvidence> {
  const orders = await ProjectPurchaseOrderModel.find({ projectId }).select({ _id: 1, vendorId: 1, createdById: 1,
    approvedRevisionId: 1, approvedRevision: 1, cancelledAt: 1 }).session(session).lean();
  const approved = orders.filter(order => order.approvedRevisionId && !order.cancelledAt);
  const revisions = approved.length ? await ProjectPurchaseOrderRevisionModel.find({ _id: { $in: approved.map(order => order.approvedRevisionId) } })
    .select({ _id: 1, orderId: 1, projectId: 1, vendorId: 1, revision: 1 }).session(session).lean() : [];
  const validApproved = approved.filter(order => {
    const revision = revisions.find(row => String(row._id) === String(order.approvedRevisionId));
    return revision && String(revision.orderId) === String(order._id) && String(revision.projectId) === projectId &&
      String(revision.vendorId) === String(order.vendorId) && revision.revision === order.approvedRevision;
  });
  const approvedVendorIds = [...new Set(validApproved.map(order => String(order.vendorId)))];
  const vendors = approvedVendorIds.length ? await AiEstimatorKnowledgeVendorModel.find({
    _id: { $in: approvedVendorIds }, status: "active", archivedAt: null
  }).session(session).lean() : [];
  const activations = await vendorActivations(vendors, session);
  const vendorIds = vendors.filter(vendor => activations.get(String(vendor._id))?.effectiveStatus === "active")
    .map(vendor => String(vendor._id));
  const procurementTasks = await ProjectWorkflowTaskModel.find({ projectId, kind: "procurement", assigneeUserId: { $ne: null } })
    .select({ assigneeUserId: 1 }).session(session).lean();
  const procurementItems = await ProjectProcurementItemModel.find({ projectId, removedAt: null })
    .select({ estimateId: 1, estimateVersion: 1, estimateReviewRoundId: 1, createdById: 1 }).session(session).lean();
  const creatorIds = [...new Set([
    ...orders.filter(order => !order.cancelledAt).map(order => String(order.createdById)),
    ...procurementItems.map(item => String(item.createdById)),
    ...procurementTasks.map(task => String(task.assigneeUserId))
  ])];
  const assignments = await VendorWorkAssignmentModel.find({ projectId, status: { $in: ["awaiting_vendor_access", "ready", "in_progress", "changes_requested"] } })
    .select({ vendorId: 1 }).session(session).lean();
  const pendingVendorIds = new Set(assignments.map(row => String(row.vendorId)));
  const users = await UserModel.find({ active: true, $or: [
    { role: "vendor", vendorId: { $in: vendorIds } },
    { role: "procurement", _id: { $in: creatorIds } }
  ] }).select({ _id: 1, name: 1, role: 1, vendorId: 1 }).session(session).lean();
  const people: ProjectStatusExecutionEvidence["people"] = [];
  for (const user of users) {
    const id = String(user._id);
    if (user.role === "vendor" && typeof user.vendorId === "string" && vendorIds.includes(user.vendorId))
      people.push({ id, name: String(user.name), role: "vendor", vendorId: user.vendorId });
    if (user.role === "procurement" && creatorIds.includes(id))
      people.push({ id, name: String(user.name), role: "procurement" });
  }
  people.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    hasApprovedOrder: validApproved.length > 0,
    people,
    procurementOwnerIds: people.filter(person => person.role === "procurement").map(person => person.id),
    pendingVendorUserIds: people.filter(person => person.role === "vendor" && pendingVendorIds.has(person.vendorId!)).map(person => person.id),
    vendorMemberIds: people.filter(person => person.role === "vendor").map(person => person.id),
    procurementSources: procurementItems.filter(item => typeof item.estimateId === "string" && Number.isSafeInteger(item.estimateVersion))
      .map(item => ({ estimateId: String(item.estimateId), estimateVersion: Number(item.estimateVersion), estimateReviewRoundId: item.estimateReviewRoundId ?? null }))
  };
}

/** Internal evidence only. This is never serialized by the status endpoint. */
export interface ProjectStatusEstimateEvidence {
  projectId: string;
  estimates: Array<{
    id: string; leadId: string; projectId: string | null; status: string; version: number;
    clientDecisionAt: string | null;
  }>;
  rounds: Array<{
    id: string; estimateId: string; leadId: string; projectId: string | null;
    estimateVersion: number; sendGeneration: number; status: string;
    decision: string | null; decisionSource: string | null; decidedById: string | null;
    decidedAt: string | null; createdAt: string | null; proofValid: boolean;
  }>;
  financeSource: { estimateId: string; estimateVersion: number; reviewRoundId: string | null } | null;
}

function timestamp(value: unknown): string | null {
  if (!(value instanceof Date || typeof value === "string")) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** All reads share the caller's snapshot, including immutable decision evidence. */
export async function readMongoProjectStatusEstimateEvidence(projectId: string, session?: ClientSession): Promise<ProjectStatusEstimateEvidence> {
  const leadQuery = LeadModel.find({ projectId }).select("_id");
  if (session) leadQuery.session(session);
  const leads = await leadQuery.lean();
  const estimateQuery = EstimateModel.find({ $or: [{ projectId }, { leadId: { $in: leads.map(row => row._id) } }] })
    .select("leadId projectId status version clientDecisionAt");
  if (session) estimateQuery.session(session);
  const estimates = await estimateQuery.lean();
  const roundQuery = EstimateClientReviewRoundModel.find({ $or: [{ projectId }, { estimateId: { $in: estimates.map(row => row._id) } }] })
    .select("estimateId leadId projectId estimateVersion sendGeneration status decision decisionSource decidedById decidedAt createdAt");
  const financeQuery = ProjectFinanceBucketModel.findOne({ projectId }).select("estimateId estimateVersion estimateReviewRoundId");
  if (session) { roundQuery.session(session); financeQuery.session(session); }
  const rounds = await roundQuery.lean();
  const finance = await financeQuery.lean();
  const proofQuery = EstimateClientResponseProofModel.find({ reviewRoundId: { $in: rounds.map(row => row._id) } })
    .select("estimateId reviewRoundId uploadedById uploadedAt originalFilename mimeType byteSize sha256 +storageReference");
  if (session) proofQuery.session(session);
  const proofs = await proofQuery.lean();
  return {
    projectId,
    estimates: estimates.map(row => ({ id: String(row._id), leadId: String(row.leadId), projectId: row.projectId ?? null,
      status: String(row.status), version: Number(row.version), clientDecisionAt: timestamp(row.clientDecisionAt) })),
    rounds: rounds.map(row => {
      const matching = proofs.filter(proof => String(proof.reviewRoundId) === String(row._id));
      const proof = matching.length === 1 ? matching[0] : undefined;
      return { id: String(row._id), estimateId: String(row.estimateId), leadId: String(row.leadId), projectId: row.projectId ?? null,
        estimateVersion: Number(row.estimateVersion), sendGeneration: Number(row.sendGeneration), status: String(row.status),
        decision: row.decision ?? null, decisionSource: row.decisionSource ?? null, decidedById: row.decidedById ?? null,
        decidedAt: timestamp(row.decidedAt), createdAt: timestamp(row.createdAt),
        proofValid: Boolean(proof && String(proof.estimateId) === String(row.estimateId) && proof.uploadedById === row.decidedById &&
          typeof proof.storageReference === "string" && proof.storageReference.length > 0 && typeof proof.originalFilename === "string" && proof.originalFilename.length > 0 &&
          ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(proof.mimeType) && Number.isSafeInteger(proof.byteSize) && proof.byteSize > 0 &&
          /^[a-f0-9]{64}$/.test(proof.sha256) && timestamp(proof.uploadedAt)) };
    }),
    financeSource: finance ? { estimateId: String(finance.estimateId), estimateVersion: Number(finance.estimateVersion), reviewRoundId: finance.estimateReviewRoundId ?? null } : null
  };
}
