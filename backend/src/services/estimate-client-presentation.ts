import { ESTIMATE_COMPONENT_PRICING_BASIS, estimateComponentLineAmountIsValid, readEstimateComponentPricing, type EstimateComponentPricing } from "../domain/estimate-component-pricing.js";
import { estimateDimensionSnapshotValid } from "../domain/estimate-dimension-snapshot.js";
import { canonicalEstimateDimensions, readEstimateDimensionRule, type EstimateDimensions, type EstimateDimensionRule } from "../domain/estimate-dimensions.js";
import { effectiveCommercialStatus, isCollaborativeEstimate } from "../domain/estimation-lifecycle.js";
import { KNOWLEDGE_MODE_TIERS } from "../domain/ai-estimator-knowledge-mode-tiers.js";
import { ESTIMATE_PRICING_MODES, ESTIMATE_RATE_SOURCES, estimatePricingMetadataIsValid } from "../domain/estimate-mode-pricing.js";
import { z } from "zod";

import { configuredEstimateParentIsValid, type ClientPublishedEstimateReview } from "../domain/estimate-client-review.js";
import { normalizeEmail } from "../domain/email.js";
import type { PublicUser } from "./auth.service.js";
import { isDeepStrictEqual } from "node:util";

type Row = Record<string, any>;
const money = z.number().finite().nonnegative();
const paise = z.number().int().safe().nonnegative();
const commonLine = {
  id: z.string().nullable().optional(), catalogueId: z.string().min(1),
  roomName: z.string().min(1), unit: z.string().min(1),
  rate: money, quantity: money, included: z.boolean(), amount: money,
  clientVisible: z.boolean().optional()
};
const legacyLine = z.object({ ...commonLine, source: z.literal("legacy").optional(), specification: z.string().min(1) });
const configuredLine = z.object({
  ...commonLine, rate: money.nullable(), amount: money.nullable(),
  source: z.literal("configuration"), specification: z.null(),
  estimateNotes: z.array(z.string().max(4000)).max(4).optional(),
  itemType: z.enum(["main_line", "temporary"]).optional(),
  classification: z.enum(["standard", "special"]).optional(),
  modeTier: z.enum(KNOWLEDGE_MODE_TIERS).optional(),
  dimensionsMandatory: z.boolean().optional(),
  dimensions: z.custom<EstimateDimensions>(value => canonicalEstimateDimensions(value) !== null).optional(),
  dimensionRule: z.custom<EstimateDimensionRule>(value => readEstimateDimensionRule(value) !== null).nullable().optional(),
  pricingMode: z.enum(ESTIMATE_PRICING_MODES).optional(),
  rateSource: z.enum(ESTIMATE_RATE_SOURCES).optional(),
  pricingBasis: z.literal(ESTIMATE_COMPONENT_PRICING_BASIS).optional(),
  componentPricing: z.custom<EstimateComponentPricing>(value => readEstimateComponentPricing(value) !== null).optional(),
  sourceItemVersion: z.number().int().positive().safe().optional(),
  sourceRevisionVersion: z.number().int().positive().safe().optional(),
  selectedInHouseComponentIds: z.array(z.string().min(1).max(128)).max(50).refine((ids) => new Set(ids).size === ids.length).optional(),
  roomId: z.string().min(1), mainBasketId: z.string().min(1),
  subBasketId: z.string().min(1).nullable(), mainLineId: z.string().min(1),
  revisionId: z.string().min(1), uomId: z.string().min(1),
  uomCode: z.string().min(1).optional(), uomDecimalScale: z.number().int().nonnegative().optional(),
  mainBasketName: z.string().min(1), subBasketName: z.string().min(1).nullable(),
  mainLineName: z.string().min(1), uomName: z.string().min(1),
  ratePaise: paise.nullable(), amountPaise: paise.nullable()
}).refine((line) => estimateDimensionSnapshotValid(line) && configuredEstimateParentIsValid(line) && estimatePricingMetadataIsValid(line) && line.catalogueId === line.mainLineId &&
  (line.pricingBasis === undefined || estimateComponentLineAmountIsValid(line)) &&
  (!line.included || line.ratePaise !== null && line.amountPaise !== null || estimateComponentLineAmountIsValid(line))).transform(line => {
    if (line.pricingBasis === ESTIMATE_COMPONENT_PRICING_BASIS) return line;
    const { sourceItemVersion: _itemVersion, sourceRevisionVersion: _revisionVersion, ...legacy } = line;
    return legacy;
  });
const snapshotSchema = z.object({
  rooms: z.array(z.record(z.unknown())).optional(), bedroomCount: z.number().int().nullable().optional(), scopes: z.array(z.string()).optional(),
  clientName: z.string().min(1), projectName: z.string().min(1),
  location: z.string(), propertyType: z.string().min(1),
  lineItems: z.array(z.union([configuredLine, legacyLine])).min(1),
  subtotal: money, gst: money, total: money,
  subtotalPaise: paise.optional(), gstPaise: paise.optional(), totalPaise: paise.optional(),
  selectedMainBasketIds: z.array(z.string().min(1)).optional(),
  selectedMainBasketClassifications: z.array(z.object({
    mainBasketId: z.string().min(1), classification: z.enum(["standard", "special"])
  })).optional()
}).superRefine((snapshot, ctx) => {
  if (snapshot.selectedMainBasketClassifications !== undefined) {
    const selectedIds = snapshot.selectedMainBasketIds ?? [];
    const classifiedIds = snapshot.selectedMainBasketClassifications.map((entry) => entry.mainBasketId);
    if (classifiedIds.length !== selectedIds.length ||
      new Set(classifiedIds).size !== classifiedIds.length ||
      classifiedIds.some((id) => !selectedIds.includes(id))) {
      ctx.addIssue({ code: "custom", message: "Published basket classifications do not match selected Main Baskets." });
    }
  }
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

/** Screen-only projection; the stored approval and its quotation retain every line. */
function clientScreenSnapshot(snapshot: z.infer<typeof snapshotSchema>) {
  return {
    ...snapshot,
    lineItems: snapshot.lineItems.filter((line) => line.clientVisible !== false).map((line) => line.source === "configuration"
      ? { ...line, classification: line.classification ?? "standard" as const }
      : line),
    selectedMainBasketClassifications: snapshot.selectedMainBasketIds?.map((mainBasketId) => ({
      mainBasketId,
      classification: snapshot.selectedMainBasketClassifications?.find((entry) =>
        entry.mainBasketId === mainBasketId)?.classification ?? "standard" as const
    })) ?? []
  };
}

/** Only the immutable published proposal supplies Client commercial fields. */
export function presentClientEstimate(
  actor: PublicUser,
  estimate: Row,
  lead: Row,
  round: Row | null,
  project?: Row | null,
  preRound?: Row | null
): Row | null {
  const collaborative = isCollaborativeEstimate(estimate);
  if ((collaborative || project?.estimationWorkflowVersion === 2) && actor.role !== "super_admin" &&
      (!project || project.clientId !== actor.id || String(project._id ?? project.id) !== estimate.projectId || lead.projectId !== estimate.projectId)) return null;
  estimate = { ...estimate, status: effectiveCommercialStatus(estimate) };
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
    (round.status === "approved" && round.decision === "approve" && (collaborative
      ? [estimate.estimation.preApproval?.reviewRoundId, estimate.estimation.finalApproval?.reviewRoundId].includes(String(round._id ?? round.id))
      : estimate.status === "client_approved" && round.estimateVersion + 1 === version)) ||
    (collaborative && round.status === "superseded" && round.estimateVersion < version) ||
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
  const snapshot = reviewSourceIssue === null && parsed.success ? clientScreenSnapshot(parsed.data) : null;
  const publishedReview: ClientPublishedEstimateReview | null = snapshot && round ? {
    ...(collaborative ? { phase: round.phase, requirementsVersion: round.requirementsVersion } : {}),
    id: String(round._id ?? round.id), version: round.version,
    estimateVersion: round.estimateVersion, sendGeneration: round.sendGeneration,
    status: round.status, submittedAt: submittedAt!, snapshot,
    decisionNote: typeof round.decisionNote === "string" ? round.decisionNote : null,
    decidedAt: timestamp(round.decidedAt),
    canDecide: actor.role === "client" && round.status === "pending" && estimate.status === "sent_to_client" &&
      round.estimateVersion === version && (collaborative ? !estimate.estimation.editClosedAt && estimate.estimation.pendingReviewRoundId === String(round._id ?? round.id) : estimate.designFrozenAt == null)
  } : null;
  const stableDrawingMetadata = snapshot && (
    ["sent_to_client", "client_approved"].includes(estimate.status) ||
    (estimate.status === "client_changes_requested" && round?.status === "pending" && round.estimateVersion === version)
  );
  const preSnapshot = snapshotSchema.safeParse(preRound?.estimateSnapshot);
  const preApprovedReview = collaborative && preRound && preSnapshot.success && preRound.status === "approved" &&
    preRound.decision === "approve" && String(preRound._id ?? preRound.id) === estimate.estimation.preApproval?.reviewRoundId &&
    preRound.estimateVersion === estimate.estimation.preApproval?.estimateVersion &&
    preRound.projectId === projectId && String(preRound.estimateId) === String(estimate._id ?? estimate.id)
    ? { reviewRoundId: String(preRound._id ?? preRound.id), estimateVersion: preRound.estimateVersion, snapshot: clientScreenSnapshot(preSnapshot.data) }
    : null;
  return {
    id: String(estimate._id ?? estimate.id), leadId: String(estimate.leadId), projectId,
    ownerId: estimate.ownerId, version, status: estimate.status,
    ...(collaborative ? { estimation: estimate.estimation, preApprovedReview,
      changesFromPre: preApprovedReview && snapshot ? comparePublishedEstimateSnapshots(preApprovedReview.snapshot, snapshot) : null } : {}),
    propertyType: snapshot?.propertyType ?? "", lineItems: snapshot?.lineItems ?? [],
    subtotal: snapshot?.subtotal ?? 0, gst: snapshot?.gst ?? 0, total: snapshot?.total ?? 0,
    subtotalPaise: snapshot?.subtotalPaise ?? null,
    gstPaise: snapshot?.gstPaise ?? null,
    totalPaise: snapshot?.totalPaise ?? null,
    selectedMainBasketIds: stableDrawingMetadata ? snapshot?.selectedMainBasketIds ?? [] : [],
    selectedMainBasketClassifications: stableDrawingMetadata ? snapshot?.selectedMainBasketClassifications ?? [] : [],
    rooms: collaborative ? snapshot?.rooms ?? [] : stableDrawingMetadata ? estimate.rooms ?? [] : [],
    scopes: collaborative ? snapshot?.scopes ?? [] : stableDrawingMetadata ? estimate.scopes ?? [] : [],
    bedroomCount: snapshot?.bedroomCount ?? null,
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

export function comparePublishedEstimateSnapshots(before: Row, after: Row) {
  const previous = new Map<string, Row>((before.lineItems ?? []).filter((line: Row) => line.included).map((line: Row) => [String(line.id), line]));
  const current = new Map<string, Row>((after.lineItems ?? []).filter((line: Row) => line.included).map((line: Row) => [String(line.id), line]));
  const addedLineIds = [...current.keys()].filter((id) => !previous.has(id));
  const removedLineIds = [...previous.keys()].filter((id) => !current.has(id));
  const fields = ["roomId", "roomName", "specification", "mainLineName", "mainBasketId", "unit", "quantity", "rate", "amount", "estimateNotes", "selectedInHouseComponentIds", "pricingBasis", "componentPricing", "dimensions", "dimensionRule"];
  const changedLineIds = [...current.keys()].filter((id) => previous.has(id) && (
    fields.some((field) => !isDeepStrictEqual(previous.get(id)![field] ?? null, current.get(id)![field] ?? null)) ||
    (previous.get(id)!.modeTier ?? "signature") !== (current.get(id)!.modeTier ?? "signature") ||
    (previous.get(id)!.dimensionsMandatory ?? false) !== (current.get(id)!.dimensionsMandatory ?? false)));
  const scopeChanged = ["propertyType", "bedroomCount", "rooms", "scopes", "selectedMainBasketIds"].some((field) =>
    !isDeepStrictEqual(before[field] ?? null, after[field] ?? null));
  return { addedLineIds, removedLineIds, changedLineIds, scopeChanged,
    noChanges: !addedLineIds.length && !removedLineIds.length && !changedLineIds.length && !scopeChanged && before.total === after.total,
    beforeTotal: before.total, afterTotal: after.total };
}
