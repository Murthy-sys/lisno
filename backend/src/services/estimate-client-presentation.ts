import { z } from "zod";

import type { ClientPublishedEstimateReview } from "../domain/estimate-client-review.js";
import { normalizeEmail } from "../domain/email.js";
import type { PublicUser } from "./auth.service.js";

type Row = Record<string, any>;
const money = z.number().finite().nonnegative();
const paise = z.number().int().safe().nonnegative();
const commonLine = {
  id: z.string().nullable().optional(), catalogueId: z.string().min(1),
  roomName: z.string().min(1), unit: z.string().min(1),
  rate: money, quantity: money, included: z.boolean(), amount: money
};
const legacyLine = z.object({ ...commonLine, source: z.literal("legacy").optional(), specification: z.string().min(1) });
const configuredLine = z.object({
  ...commonLine, rate: money.nullable(), amount: money.nullable(),
  source: z.literal("configuration"), specification: z.null(),
  roomId: z.string().min(1), mainBasketId: z.string().min(1),
  subBasketId: z.string().min(1), mainLineId: z.string().min(1),
  revisionId: z.string().min(1), uomId: z.string().min(1),
  uomCode: z.string().min(1).optional(), uomDecimalScale: z.number().int().nonnegative().optional(),
  mainBasketName: z.string().min(1), subBasketName: z.string().min(1),
  mainLineName: z.string().min(1), uomName: z.string().min(1),
  ratePaise: paise.nullable(), amountPaise: paise.nullable()
}).refine((line) => line.catalogueId === line.mainLineId &&
  (!line.included || line.ratePaise !== null && line.amountPaise !== null));
const snapshotSchema = z.object({
  clientName: z.string().min(1), projectName: z.string().min(1),
  location: z.string(), propertyType: z.string().min(1),
  lineItems: z.array(z.union([configuredLine, legacyLine])).min(1),
  subtotal: money, gst: money, total: money,
  subtotalPaise: paise.optional(), gstPaise: paise.optional(), totalPaise: paise.optional(),
  selectedMainBasketIds: z.array(z.string().min(1)).optional()
}).superRefine((snapshot, ctx) => {
  if (!snapshot.lineItems.some((line) => line.source === "configuration")) return;
  if (snapshot.subtotalPaise === undefined || snapshot.gstPaise === undefined || snapshot.totalPaise === undefined ||
    snapshot.subtotalPaise + snapshot.gstPaise !== snapshot.totalPaise) {
    ctx.addIssue({ code: "custom", message: "Configured review totals require exact paise." });
  }
});

function timestamp(value: unknown): string | null {
  if (!(typeof value === "string" || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Only the immutable published proposal supplies Client commercial fields. */
export function presentClientEstimate(
  actor: PublicUser,
  estimate: Row,
  lead: Row,
  round: Row | null
): Row | null {
  const email = normalizeEmail(actor.email);
  if (actor.role !== "super_admin" && (
    normalizeEmail(String(lead.clientEmail ?? "")) !== email ||
    (round && round.recipientEmailNormalized !== email)
  )) return null;
  if (!round && !["sent_to_client", "client_changes_requested", "client_approved"].includes(estimate.status)) {
    return null;
  }

  const projectIds = [estimate.projectId, lead.projectId, round?.projectId]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const projectConflict = new Set(projectIds).size > 1;
  const projectId = projectConflict ? null : projectIds[0] ?? null;
  const version = Number(estimate.version);
  const submittedAt = timestamp(round?.createdAt);
  const parsed = snapshotSchema.safeParse(round?.estimateSnapshot);
  const salesRevision = ["draft", "pending_manager_assignment", "pending_designer_approval", "designer_changes_requested", "ready_for_client"].includes(estimate.status);
  // Design feedback can return the estimate to Sales without deciding its commercial round.
  const pendingRoundReadable = round?.status === "pending" && round.decision == null && (
    (estimate.status === "sent_to_client" && round.estimateVersion === version) ||
    (estimate.status === "client_changes_requested" && round.estimateVersion <= version) ||
    (salesRevision && round.estimateVersion < version)
  );
  const roundStateMatches = round && (
    pendingRoundReadable ||
    (round.status === "approved" && estimate.status === "client_approved" && round.decision === "approve" && round.estimateVersion + 1 === version) ||
    (round.status === "changes_requested" && round.decision === "request_changes" &&
      (estimate.status === "client_changes_requested" || salesRevision) &&
      round.estimateVersion < version)
  );
  const sourceConflict = projectConflict || (round && (
    typeof (round._id ?? round.id) !== "string" || !(round._id ?? round.id).trim() ||
    String(round.estimateId) !== String(estimate._id ?? estimate.id) ||
    String(round.leadId) !== String(lead._id ?? lead.id) ||
    String(estimate.leadId) !== String(lead._id ?? lead.id) ||
    !roundStateMatches || !submittedAt ||
    !Number.isSafeInteger(round.version) || round.version < 1 ||
    !Number.isSafeInteger(round.estimateVersion) || round.estimateVersion < 1 ||
    !Number.isSafeInteger(round.sendGeneration) || round.sendGeneration < 1
  ));
  const reviewSourceIssue = sourceConflict ? "source_conflict" : !parsed.success ? "missing_snapshot" : null;
  const snapshot = reviewSourceIssue === null && parsed.success ? parsed.data : null;
  const publishedReview: ClientPublishedEstimateReview | null = snapshot && round ? {
    id: String(round._id ?? round.id), version: round.version,
    estimateVersion: round.estimateVersion, sendGeneration: round.sendGeneration,
    status: round.status, submittedAt: submittedAt!, snapshot,
    decisionNote: typeof round.decisionNote === "string" ? round.decisionNote : null,
    decidedAt: timestamp(round.decidedAt),
    canDecide: actor.role === "client" && round.status === "pending" && estimate.status === "sent_to_client" &&
      round.estimateVersion === version && estimate.designFrozenAt == null
  } : null;
  const stableDrawingMetadata = snapshot && (
    ["sent_to_client", "client_approved"].includes(estimate.status) ||
    (estimate.status === "client_changes_requested" && round?.status === "pending" && round.estimateVersion === version)
  );
  return {
    id: String(estimate._id ?? estimate.id), leadId: String(estimate.leadId), projectId,
    ownerId: estimate.ownerId, version, status: estimate.status,
    propertyType: snapshot?.propertyType ?? "", lineItems: snapshot?.lineItems ?? [],
    subtotal: snapshot?.subtotal ?? 0, gst: snapshot?.gst ?? 0, total: snapshot?.total ?? 0,
    subtotalPaise: snapshot?.subtotalPaise ?? null,
    gstPaise: snapshot?.gstPaise ?? null,
    totalPaise: snapshot?.totalPaise ?? null,
    selectedMainBasketIds: stableDrawingMetadata ? snapshot?.selectedMainBasketIds ?? [] : [],
    rooms: stableDrawingMetadata ? estimate.rooms ?? [] : [],
    scopes: stableDrawingMetadata ? estimate.scopes ?? [] : [],
    approvalRequired: estimate.approvalRequired ?? false,
    assignedManagerId: estimate.assignedManagerId ?? null,
    assignedDesignerId: estimate.assignedDesignerId ?? null,
    designLifecycleVersion: estimate.designLifecycleVersion ?? 0,
    designFrozenAt: timestamp(estimate.designFrozenAt),
    designPlanStatus: estimate.designPlanStatus ?? null,
    designPlanVersion: estimate.designPlanVersion ?? 0,
    designPlanDesignerId: estimate.designPlanDesignerId ?? null,
    designPlanAssignedById: estimate.designPlanAssignedById ?? null,
    designPlanAssignedAt: timestamp(estimate.designPlanAssignedAt),
    designPlanSubmittedAt: timestamp(estimate.designPlanSubmittedAt),
    designPlanApprovedAt: timestamp(estimate.designPlanApprovedAt),
    designPlanApprovedById: estimate.designPlanApprovedById ?? null,
    designPlanApprovalSource: estimate.designPlanApprovalSource ?? null,
    submittedAt, sentToClientAt: submittedAt,
    clientDecisionAt: publishedReview?.decidedAt ?? null,
    reviews: [], notifications: [],
    lead: {
      _id: String(lead._id ?? lead.id), id: String(lead._id ?? lead.id), projectId,
      clientName: snapshot?.clientName ?? String(lead.clientName ?? ""),
      projectName: snapshot?.projectName ?? String(lead.projectName ?? ""),
      location: snapshot?.location ?? String(lead.location ?? "")
    },
    publishedReview, reviewSourceIssue
  };
}
