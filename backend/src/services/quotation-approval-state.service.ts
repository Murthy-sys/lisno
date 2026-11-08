import { estimateTotalsReconcile } from "../domain/estimate-total-rounding.js";
import type mongoose from "mongoose";
import { isDeepStrictEqual } from "node:util";

import { isQuotationEstimate, type QuotationLifecycle } from "../domain/estimation-lifecycle.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { EstimateClientResponseProofModel } from "../models/EstimateClientResponseProof.js";
import { ProjectModel } from "../models/Project.js";
import { quotationSnapshotDigest } from "./quotation-digest.js";

type Row = Record<string, any>;

export const QUOTATION_APPROVAL_STATES = [
  "initial_current",
  "revision_draft",
  "revision_pending_client",
  "revision_changes_requested",
  "revision_current",
  "source_issue"
] as const;

export type QuotationApprovalState = typeof QUOTATION_APPROVAL_STATES[number];
export type QuotationApprovalSource = "initial_unchanged" | "designer_revision";

export interface CurrentQuotationApproval {
  kind: QuotationApprovalSource;
  reviewRoundId: string;
  estimateVersion: number;
  approvedAt: string;
  requirementsVersion: number;
  pricedRevision: number;
  designScopeRevision: number;
}

export interface QuotationApprovalResolution {
  quotationApprovalState: QuotationApprovalState;
  currentQuotationApproved: boolean;
  requiresClientReapproval: boolean;
  quotationApprovalSource: QuotationApprovalSource | null;
  currentQuotationApproval: CurrentQuotationApproval | null;
}

const sourceIssue = (): QuotationApprovalResolution => ({
  quotationApprovalState: "source_issue",
  currentQuotationApproved: false,
  requiresClientReapproval: false,
  quotationApprovalSource: null,
  currentQuotationApproval: null
});

function revisionState(lifecycle: QuotationLifecycle): QuotationApprovalResolution {
  const quotationApprovalState: QuotationApprovalState = lifecycle.status === "sent_to_client"
    ? "revision_pending_client"
    : lifecycle.status === "client_changes_requested" || lifecycle.status === "designer_changes_requested"
      ? "revision_changes_requested"
      : "revision_draft";
  return { quotationApprovalState, currentQuotationApproved: false, requiresClientReapproval: true,
    quotationApprovalSource: null, currentQuotationApproval: null };
}

function epochMilliseconds(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === "string" ? Date.parse(value) : Number.NaN;
}

function exactDate(value: unknown, expected: unknown): boolean {
  const left = epochMilliseconds(value);
  const right = epochMilliseconds(expected);
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function validRoundSource(round: Row): boolean {
  return typeof round.sourceDigest === "string" && round.sourceDigest.length === 64 &&
    quotationSnapshotDigest(round.estimateSnapshot) === round.sourceDigest;
}

function validDecisionEvidence(round: Row, expectedClientId?: string | null): boolean {
  if (typeof round.decidedById !== "string" || !round.decidedById.trim()) return false;
  if (round.decisionSource === "client_portal") return typeof expectedClientId === "string" &&
    !!expectedClientId.trim() && round.decidedById === expectedClientId;
  return round.decisionSource === "admin_proof" && round.proofValid === true;
}

const APPROVED_LINE_FIELDS = [
  "source", "itemType", "clientVisible", "classification", "modeTier", "dimensionsMandatory", "dimensions",
  "dimensionRule", "pricingMode", "rateSource", "pricingBasis", "componentPricing", "selectedInHouseComponentIds",
  "catalogueId", "roomId", "roomName", "estimateNotes", "specification", "unit", "rate", "ratePaise", "quantity",
  "included", "amount", "amountPaise", "mainBasketId", "subBasketId", "mainLineId", "revisionId", "sourceItemStatus",
  "sourceRevisionStatus", "sourceItemVersion", "sourceRevisionVersion", "uomId", "uomCode", "uomDecimalScale",
  "mainBasketName", "subBasketName", "mainLineName", "uomName"
] as const;

function comparableLine(value: Row): Row {
  const comparable = Object.fromEntries(APPROVED_LINE_FIELDS.flatMap(field => value[field] === undefined ? [] : [[field, value[field]]]));
  if (value.source === "configuration") comparable.classification = value.classification === "special" ? "special" : "standard";
  return comparable;
}

function approvalComparableContent(value: Row): Row | null {
  const selectedMainBasketIds = value.selectedMainBasketIds ?? [];
  const subtotalPaise = value.subtotalPaise;
  const gstPaise = value.gstPaise;
  const totalPaise = value.totalPaise;
  if (![subtotalPaise, gstPaise, totalPaise].every(amount => Number.isSafeInteger(amount) && amount >= 0) ||
      !estimateTotalsReconcile(value) || value.subtotal !== subtotalPaise / 100 ||
      value.gst !== gstPaise / 100 || value.total !== totalPaise / 100) return null;
  return { propertyType: value.propertyType, bedroomCount: value.bedroomCount ?? null,
    rooms: value.rooms ?? [], scopes: value.scopes ?? [], selectedMainBasketIds: value.selectedMainBasketIds ?? [],
    selectedMainBasketClassifications: selectedMainBasketIds.map((mainBasketId: string) => ({ mainBasketId,
      classification: value.selectedMainBasketClassifications?.find((entry: Row) => entry.mainBasketId === mainBasketId)?.classification === "special"
        ? "special" : "standard" })),
    lineItems: (value.lineItems ?? []).map((line: Row) => comparableLine(line)),
    subtotalPaise, gstPaise, totalPaise,
    ...(value.roundOffPaise === undefined ? {} : { roundOffPaise: value.roundOffPaise }) };
}

function roundMatchesCurrentContent(round: Row, estimate: Row): boolean {
  const approved = approvalComparableContent(round.estimateSnapshot ?? {});
  const current = approvalComparableContent(estimate);
  return approved !== null && current !== null && isDeepStrictEqual(approved, current);
}

function validApprovedPostSubmitter(round: Row, phase: "pre" | "post"): boolean {
  return phase === "pre" || typeof round.submittedById === "string" && !!round.submittedById.trim();
}

function validPendingPostSubmitter(round: Row, primaryDesignerId?: string | null): boolean {
  return typeof primaryDesignerId === "string" && !!primaryDesignerId.trim() &&
    typeof round.submittedById === "string" && round.submittedById === primaryDesignerId;
}

function validPreSalesEvidence(round: Row, estimate: Row, phase: "pre" | "post", requireLive = false): boolean {
  if (phase === "post") return true;
  const roundApproval = round.salesApproval;
  const lifecycleApproval = estimate.estimation?.salesApproval;
  const immutableValid = Boolean(roundApproval && typeof round.submittedById === "string" &&
    roundApproval.actorId === round.submittedById &&
    Number(roundApproval.estimateVersion) === Number(round.estimateVersion) &&
    Number(roundApproval.pricedRevision) === Number(round.pricedRevision) &&
    roundApproval.sourceDigest === round.sourceDigest && Number.isFinite(Date.parse(String(roundApproval.approvedAt ?? ""))));
  if (!immutableValid || !requireLive) return immutableValid;
  return Boolean(lifecycleApproval && lifecycleApproval.actorId === roundApproval.actorId &&
    Number(lifecycleApproval.estimateVersion) === Number(roundApproval.estimateVersion) &&
    Number(lifecycleApproval.pricedRevision) === Number(roundApproval.pricedRevision) &&
    lifecycleApproval.sourceDigest === roundApproval.sourceDigest && exactDate(roundApproval.approvedAt, lifecycleApproval.approvedAt));
}

function validCommonRound(round: Row | undefined, estimate: Row, reference: Row, phase: "pre" | "post",
  expectedClientId?: string | null): round is Row {
  return Boolean(round && String(round._id ?? round.id) === String(reference.reviewRoundId) &&
    String(round.estimateId) === String(estimate._id ?? estimate.id) && String(round.projectId) === String(estimate.projectId) &&
    Number(round.estimateVersion) === Number(reference.estimateVersion) && round.workflowVersion === 3 && round.phase === phase &&
    round.status === "approved" && round.decision === "approve" && exactDate(round.decidedAt, reference.approvedAt) &&
    validDecisionEvidence(round, expectedClientId) && validApprovedPostSubmitter(round, phase) &&
    (phase === "pre" ? validPreSalesEvidence(round, estimate, phase, true) : round.salesApproval == null) &&
    Number(round.requirementsVersion) === Number(estimate.estimation.requirementsVersion) &&
    Number(round.pricedRevision) === Number(estimate.estimation.pricedRevision) &&
    Number(round.designScopeRevision) === Number(estimate.estimation.designScopeRevision) && validRoundSource(round) &&
    roundMatchesCurrentContent(round, estimate));
}

function validHistoricalRound(round: Row | undefined, estimate: Row, reference: Row, phase: "pre" | "post",
  expectedClientId?: string | null): round is Row {
  return Boolean(round && String(round._id ?? round.id) === String(reference.reviewRoundId) &&
    String(round.estimateId) === String(estimate._id ?? estimate.id) && String(round.projectId) === String(estimate.projectId) &&
    Number(round.estimateVersion) === Number(reference.estimateVersion) && round.workflowVersion === 3 && round.phase === phase &&
    round.status === "approved" && round.decision === "approve" && exactDate(round.decidedAt, reference.approvedAt) &&
    validDecisionEvidence(round, expectedClientId) && validApprovedPostSubmitter(round, phase) &&
    (phase === "pre" ? validPreSalesEvidence(round, estimate, phase) : round.salesApproval == null) &&
    (phase !== "post" || Number(round.requirementsVersion) === Number(reference.requirementsVersion) &&
      Number(round.designScopeRevision) === Number(reference.designScopeRevision) &&
      (round.designReviewRoundId ?? null) === (reference.designReviewRoundId ?? null) &&
      (round.designPlanVersion ?? null) === (reference.designPlanVersion ?? null)) && validRoundSource(round));
}

function validPendingRound(round: Row | undefined, estimate: Row, primaryDesignerId?: string | null): round is Row {
  const lifecycle = estimate.estimation as QuotationLifecycle;
  return Boolean(round && String(round._id ?? round.id) === lifecycle.pendingReviewRoundId &&
    String(round.estimateId) === String(estimate._id ?? estimate.id) && String(round.projectId) === String(estimate.projectId) &&
    Number(round.estimateVersion) === Number(estimate.version) && round.workflowVersion === 3 && round.phase === "post" && round.status === "pending" &&
    round.decision === null && round.decisionSource == null && round.decidedById == null && round.decidedAt == null && round.salesApproval == null &&
    validPendingPostSubmitter(round, primaryDesignerId) && Number(round.requirementsVersion) === lifecycle.requirementsVersion &&
    Number(round.pricedRevision) === lifecycle.pricedRevision && Number(round.designScopeRevision) === lifecycle.designScopeRevision &&
    validRoundSource(round) && roundMatchesCurrentContent(round, estimate));
}

function validPreHistoricalRound(round: Row | undefined, estimate: Row, reference: Row,
  expectedClientId?: string | null): round is Row {
  return validHistoricalRound(round, estimate, reference, "pre", expectedClientId);
}

/** Pure resolver used by Mongo and memory projections. Approval history remains immutable. */
export function resolveQuotationApprovalFromRounds(estimate: Row, rounds: readonly Row[],
  context: { clientId?: string | null; primaryDesignerId?: string | null } = {}): QuotationApprovalResolution {
  if (!isQuotationEstimate(estimate)) return sourceIssue();
  const lifecycle = estimate.estimation as QuotationLifecycle;
  const byId = (id: string | undefined | null) => id ? rounds.filter(round => String(round._id ?? round.id) === id) : [];
  if (lifecycle.preApproval && lifecycle.phase !== "post" ||
      Boolean(lifecycle.pendingReviewRoundId) !== (lifecycle.status === "sent_to_client") ||
      !lifecycle.finalApproval && lifecycle.status === "client_approved" ||
      lifecycle.finalApproval && Boolean(lifecycle.editClosedAt) !== (lifecycle.status === "client_approved")) return sourceIssue();

  const preReference = lifecycle.preApproval;
  if (!preReference) return sourceIssue();
  const preMatches = byId(preReference.reviewRoundId);
  const preRound = preMatches.length === 1 ? preMatches[0] : undefined;
  if (!validPreHistoricalRound(preRound, estimate, preReference, context.clientId)) return sourceIssue();

  if (lifecycle.finalApproval) {
    if (lifecycle.finalApproval.reviewRoundId === preReference.reviewRoundId ||
        lifecycle.finalApproval.estimateVersion <= preReference.estimateVersion) return sourceIssue();
    const matches = byId(lifecycle.finalApproval.reviewRoundId);
    const round = matches.length === 1 ? matches[0] : undefined;
    if (!validHistoricalRound(round, estimate, lifecycle.finalApproval, "post", context.clientId) ||
        Number(round.pricedRevision) <= Number(preRound.pricedRevision)) return sourceIssue();
    if (lifecycle.pendingReviewRoundId) {
      if (lifecycle.pendingReviewRoundId === preReference.reviewRoundId ||
          lifecycle.pendingReviewRoundId === lifecycle.finalApproval.reviewRoundId) return sourceIssue();
      const pending = byId(lifecycle.pendingReviewRoundId);
      if (pending.length !== 1 || Number(pending[0]?.estimateVersion) <= preReference.estimateVersion ||
          Number(pending[0]?.pricedRevision) <= Number(round.pricedRevision) ||
          !validPendingRound(pending[0], estimate, context.primaryDesignerId)) return sourceIssue();
    } else if (lifecycle.status === "sent_to_client") return sourceIssue();
    if (lifecycle.editClosedAt && lifecycle.status === "client_approved" && !lifecycle.pendingReviewRoundId &&
      validCommonRound(round, estimate, lifecycle.finalApproval, "post", context.clientId)) {
      const approval: CurrentQuotationApproval = { kind: "designer_revision", reviewRoundId: lifecycle.finalApproval.reviewRoundId,
        estimateVersion: lifecycle.finalApproval.estimateVersion, approvedAt: lifecycle.finalApproval.approvedAt,
        requirementsVersion: lifecycle.requirementsVersion, pricedRevision: lifecycle.pricedRevision,
        designScopeRevision: lifecycle.designScopeRevision };
      return { quotationApprovalState: "revision_current", currentQuotationApproved: true, requiresClientReapproval: false,
        quotationApprovalSource: approval.kind, currentQuotationApproval: approval };
    }
    // Unlocking an otherwise valid approval intentionally advances pricedRevision and opens a new audited revision.
    if (!lifecycle.editClosedAt && lifecycle.phase === "post" &&
        Number(lifecycle.pricedRevision) > Number(round.pricedRevision)) return revisionState(lifecycle);
    return sourceIssue();
  }

  const reference = preReference;
  const round = preRound;
  const initialCurrent = lifecycle.phase === "post" && lifecycle.status === "draft" && !lifecycle.pendingReviewRoundId &&
    validCommonRound(round, estimate, reference, "pre", context.clientId);
  if (initialCurrent) {
    const approval: CurrentQuotationApproval = { kind: "initial_unchanged", reviewRoundId: reference.reviewRoundId,
      estimateVersion: reference.estimateVersion, approvedAt: reference.approvedAt,
      requirementsVersion: lifecycle.requirementsVersion, pricedRevision: lifecycle.pricedRevision,
      designScopeRevision: lifecycle.designScopeRevision };
    return { quotationApprovalState: "initial_current", currentQuotationApproved: true, requiresClientReapproval: false,
      quotationApprovalSource: approval.kind, currentQuotationApproval: approval };
  }
  // A valid immutable initial round with a later priced/scope/status revision is a normal reapproval state.
  if (lifecycle.pendingReviewRoundId) {
    if (lifecycle.pendingReviewRoundId === reference.reviewRoundId) return sourceIssue();
    const pending = byId(lifecycle.pendingReviewRoundId);
    if (pending.length !== 1 || Number(pending[0]?.estimateVersion) <= reference.estimateVersion ||
        Number(pending[0]?.pricedRevision) <= Number(preRound.pricedRevision) ||
        !validPendingRound(pending[0], estimate, context.primaryDesignerId)) return sourceIssue();
    return revisionState(lifecycle);
  }
  if (lifecycle.status === "sent_to_client") return sourceIssue();
  const unchangedRevisionIdentity = Number(round.requirementsVersion) === lifecycle.requirementsVersion &&
    Number(round.pricedRevision) === lifecycle.pricedRevision && Number(round.designScopeRevision) === lifecycle.designScopeRevision;
  if (unchangedRevisionIdentity && lifecycle.phase === "post" && lifecycle.status === "draft" &&
    !roundMatchesCurrentContent(round, estimate)) return sourceIssue();
  return revisionState(lifecycle);
}

export async function resolveCurrentQuotationApproval(estimate: Row, session?: mongoose.ClientSession): Promise<QuotationApprovalResolution> {
  if (!isQuotationEstimate(estimate)) return sourceIssue();
  const ids = [estimate.estimation.preApproval?.reviewRoundId, estimate.estimation.finalApproval?.reviewRoundId,
    estimate.estimation.pendingReviewRoundId].filter((value): value is string => typeof value === "string" && value.length > 0);
  const query = EstimateClientReviewRoundModel.find({ _id: { $in: ids }, estimateId: estimate._id ?? estimate.id,
    projectId: estimate.projectId }).lean();
  const projectQuery = ProjectModel.findById(estimate.projectId).select({ clientId: 1, primaryDesignerId: 1 }).lean();
  if (session) { query.session(session); projectQuery.session(session); }
  // Parallel operations are not supported on one Mongo transaction session.
  // Keep resolver reads serial so transactional and non-transactional callers
  // share one deterministic path.
  const rounds = await query;
  const project = await projectQuery;
  const adminRoundIds = rounds.filter(round => round.decisionSource === "admin_proof").map(round => String(round._id));
  const proofQuery = EstimateClientResponseProofModel.find({ reviewRoundId: { $in: adminRoundIds } })
    .select("reviewRoundId estimateId uploadedById uploadedAt originalFilename mimeType byteSize sha256 +storageReference");
  if (session) proofQuery.session(session);
  const proofs = adminRoundIds.length ? await proofQuery.lean() : [];
  if (!project) return sourceIssue();
  const enriched = rounds.map(round => {
    const matching = proofs.filter(proof => String(proof.reviewRoundId) === String(round._id));
    const proof = matching.length === 1 ? matching[0] : null;
    const proofValid = Boolean(proof && String(proof.estimateId) === String(round.estimateId) &&
      String(proof.uploadedById) === String(round.decidedById) && proof.uploadedAt && Number.isFinite(new Date(proof.uploadedAt).getTime()) &&
      typeof proof.storageReference === "string" && proof.storageReference.length > 0 && typeof proof.originalFilename === "string" && proof.originalFilename.length > 0 &&
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(String(proof.mimeType)) &&
      Number.isSafeInteger(proof.byteSize) && proof.byteSize > 0 && /^[a-f0-9]{64}$/.test(String(proof.sha256)));
    return { ...round, proofValid };
  });
  return resolveQuotationApprovalFromRounds(estimate, enriched, {
    clientId: project.clientId == null ? null : String(project.clientId),
    primaryDesignerId: project.primaryDesignerId == null ? null : String(project.primaryDesignerId)
  });
}

export function quotationApprovalPublicFields(resolution: QuotationApprovalResolution) {
  const approval = resolution.currentQuotationApproval;
  return { quotationApprovalState: resolution.quotationApprovalState,
    currentQuotationApproved: resolution.currentQuotationApproved,
    requiresClientReapproval: resolution.requiresClientReapproval,
    quotationApprovalSource: resolution.quotationApprovalSource,
    currentQuotationApproval: approval ? { kind: approval.kind, reviewRoundId: approval.reviewRoundId,
      estimateVersion: approval.estimateVersion, approvedAt: approval.approvedAt } : null };
}
