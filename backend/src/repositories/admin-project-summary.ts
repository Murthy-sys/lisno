import { readProjectNumber } from "../domain/project-number.js";
import { readProjectInitiationMetadata } from "../domain/project-initiation-metadata.js";
import { ApiError } from "../middleware/errors.js";
import { effectiveCommercialStatus, isEstimationWorkflowVersion } from "../domain/estimation-lifecycle.js";
import { projectFinanceBaseline } from "../domain/project-finance.js";
import type { EstimationApprovalReference } from "../domain/estimation-lifecycle.js";
import type { WorkflowEstimateApproval } from "../domain/workflow-estimate-items.js";
import { quotationApprovalPublicFields, resolveQuotationApprovalFromRounds } from "../services/quotation-approval-state.service.js";
import type {
  AdminProjectEstimateLinkSource,
  AdminProjectSummary,
  EstimateSummaryRecord,
  LeadRecord,
  ProjectRecord,
  UserRecord
} from "./types.js";

export function adminProjectSummary(
  project: ProjectRecord,
  users: Array<Pick<UserRecord, "id" | "name" | "email">>,
  leads: LeadRecord[],
  estimates: EstimateSummaryRecord[],
  actor: Pick<UserRecord, "id" | "role">,
  reviewRounds: readonly InitialApprovalRound[] = []
): AdminProjectSummary {
  const linkedLeads = leads.filter((candidate) => candidate.projectId === project.id);
  if (linkedLeads.length > 1 && linkedLeads.some(candidate => readProjectNumber(candidate.projectNumber) !== null)) {
    throw new ApiError(409, "PROJECT_NUMBER_STATE_CONFLICT", "The project's numbered Lead identity is inconsistent.");
  }
  const lead = linkedLeads.sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
  const estimator = project.assignedEstimatorId === null
    ? null
    : users.find((candidate) => candidate.id === project.assignedEstimatorId) ?? null;
  const estimateResolution = canonicalProjectEstimate(project.id, leads, estimates);
  const estimate = estimateResolution?.estimate ?? null;
  if (estimate) assertApprovedBaseline(estimate);
  const initialEstimateApproval = estimate ? validatedInitialApproval(project.id, estimate, reviewRounds) : null;
  const quotationApproval = estimate?.estimation?.workflowVersion === 3
    ? estimate.quotationApproval ?? resolveQuotationApprovalFromRounds({ ...estimate, _id: estimate.id }, reviewRounds,
      { clientId: project.clientId, primaryDesignerId: project.primaryDesignerId })
    : null;
  const assignmentBlockedReason = estimate ? designerAssignmentBlockedReason(project, estimate, leads, estimates, actor, initialEstimateApproval) : null;
  const projectNumber = readProjectNumber(lead?.projectNumber);
  if (projectNumber && estimate && estimate.leadId !== lead!.id) {
    throw new ApiError(409, "PROJECT_NUMBER_STATE_CONFLICT", "The project number and estimate identify different Leads.");
  }
  const designPlanDesigner = estimate?.designPlanDesignerId == null
    ? null
    : users.find((candidate) => candidate.id === estimate.designPlanDesignerId) ?? null;
  return {
    ...readProjectInitiationMetadata(lead),
    projectNumber,
    ...(isEstimationWorkflowVersion(project.estimationWorkflowVersion) ? { estimationWorkflowVersion: project.estimationWorkflowVersion } : {}),
    id: project.id,
    name: project.name,
    status: project.status,
    location: project.location,
    client: {
      name: project.clientName,
      email: project.clientEmail,
      mobile: project.clientMobile
    },
    propertyType: lead?.propertyType ?? null,
    budgetMin: lead?.budgetMin ?? null,
    budgetMax: lead?.budgetMax ?? null,
    estimator: estimator
      ? { id: estimator.id, name: estimator.name, email: estimator.email }
      : null,
    lead: lead
      ? {
          id: lead.id,
          stage: lead.stage,
          nextAction: lead.nextAction,
          nextActionAt: lead.nextActionAt
        }
      : null,
    estimate: estimate
      ? {
          id: estimate.id,
          leadId: estimate.leadId,
          projectId: estimate.projectId,
          resolvedProjectId: estimateResolution!.resolvedProjectId,
          projectLinkSource: estimateResolution!.projectLinkSource,
          version: estimate.version,
          status: effectiveCommercialStatus(estimate),
          initialEstimateApproval,
          canAssignDesigner: assignmentBlockedReason === null,
          designerAssignmentBlockedReason: assignmentBlockedReason,
          ...(isEstimationWorkflowVersion(estimate.estimation?.workflowVersion) ? { estimationPhase: estimate.estimation!.phase,
            finalEstimateApproved: estimate.estimation!.workflowVersion === 3 ? quotationApproval?.currentQuotationApproved === true : Boolean(estimate.estimation!.finalApproval) } : {}),
          ...(quotationApproval ? quotationApprovalPublicFields(quotationApproval) : {}),
          ...(estimate.estimation?.workflowVersion === 3 ? { designApproved: Boolean(
            quotationApproval?.currentQuotationApproved && estimate.designPlanStatus === "approved" &&
            estimate.estimation.designApproval?.estimateReviewRoundId === quotationApproval.currentQuotationApproval?.reviewRoundId &&
            estimate.estimation.designApproval?.designScopeRevision === estimate.estimation.designScopeRevision &&
            estimate.estimation.designApproval?.designPlanVersion === estimate.designPlanVersion &&
            estimate.estimation.designApproval?.reviewRoundId
          ) } : {}),
          subtotal: estimate.subtotal,
          gst: estimate.gst,
          total: estimate.total,
          clientDecisionAt: estimate.clientDecisionAt,
          clientDecisionSource: estimate.clientDecisionSource,
          approvedBaseline: estimate.approvedBaseline,
          clientReview: estimate.clientReview ?? null,
          designPlanStatus: estimate.designPlanStatus ?? null,
          designPlanVersion: estimate.designPlanVersion ?? 0,
          designPlanDesigner: designPlanDesigner
            ? {
                id: designPlanDesigner.id,
                name: designPlanDesigner.name,
                email: designPlanDesigner.email
              }
            : null,
          hasPendingClientResponseTask:
            estimate.clientReview?.status === "pending" &&
            (actor.role === "super_admin" ||
              (actor.role === "admin" && estimate.assignedAdminId === actor.id))
        }
      : null,
    createdAt: project.createdAt
  };
}

type InitialApprovalRound = WorkflowEstimateApproval;

/** Initial approval is an immutable milestone, independent of the working quotation status. */
function validatedInitialApproval(
  projectId: string,
  estimate: EstimateSummaryRecord,
  rounds: readonly InitialApprovalRound[]
): EstimationApprovalReference | null {
  if (!isEstimationWorkflowVersion(estimate.estimation?.workflowVersion)) return null;
  const reference = estimate.estimation?.preApproval;
  if (!reference || !reference.reviewRoundId?.trim() ||
      !Number.isSafeInteger(reference.estimateVersion) || reference.estimateVersion < 1 ||
      reference.estimateVersion > estimate.version || !Number.isFinite(Date.parse(reference.approvedAt))) return null;
  const matches = rounds.filter(round => round.id === reference.reviewRoundId);
  const round = matches.length === 1 ? matches[0] : undefined;
  // Enabling v2 can retain an immutable legacy approval that predates phase metadata.
  const initialPhase = round?.phase === "pre" || estimate.estimation?.workflowVersion === 2 && round?.phase === undefined;
  if (!round || round.estimateId !== estimate.id || round.projectId !== projectId ||
      round.estimateVersion !== reference.estimateVersion || !initialPhase ||
      round.status !== "approved" || round.decision !== "approve" || !round.decidedById?.trim() ||
      !["client_portal", "admin_proof"].includes(round.decisionSource ?? "") ||
      !round.decidedAt || !Number.isFinite(Date.parse(round.decidedAt)) ||
      Date.parse(round.decidedAt) !== Date.parse(reference.approvedAt)) return null;
  return { reviewRoundId: round.id, estimateVersion: round.estimateVersion,
    approvedAt: new Date(round.decidedAt).toISOString() };
}

const assignableDesignStatuses = new Set([null, "pending_assignment", "assigned", "in_progress", "changes_requested"]);

/** Read-only counterpart of assignDesigner; the mutation still rechecks scope and state transactionally. */
function designerAssignmentBlockedReason(
  project: ProjectRecord,
  estimate: EstimateSummaryRecord,
  leads: readonly LeadRecord[],
  estimates: readonly EstimateSummaryRecord[],
  actor: Pick<UserRecord, "id" | "role">,
  initialApproval: EstimationApprovalReference | null
): string | null {
  // The repository has already constrained Admin reads to their initiating-project grants.
  if (actor.role !== "super_admin" && (actor.role !== "admin" || project.estimationWorkflowVersion === 3)) {
    return project.estimationWorkflowVersion === 3
      ? "Only Super Admin can assign the Designer."
      : "You do not have permission to assign the Designer.";
  }
  if (estimate.status !== "client_approved") return "Client approval of the initial estimate is required.";
  if (!assignableDesignStatuses.has(estimate.designPlanStatus ?? null)) return "The current Design stage cannot be reassigned.";
  const linkedLeadIds = new Set(leads.filter(lead => lead.projectId === project.id).map(lead => lead.id));
  const candidates = estimates.filter(candidate => candidate.status === "client_approved" &&
    assignableDesignStatuses.has(candidate.designPlanStatus ?? null) &&
    (candidate.projectId === project.id || candidate.projectId === null && linkedLeadIds.has(candidate.leadId)));
  if (candidates.length !== 1 || candidates[0]?.id !== estimate.id) return "Resolve the project's conflicting approved estimates before assigning a Designer.";
  if (!linkedLeadIds.has(estimate.leadId)) return "The estimate and Lead must belong to this project.";
  const lifecycle = estimate.estimation;
  if (isEstimationWorkflowVersion(lifecycle?.workflowVersion)) {
    if (!initialApproval) return "The initial Client approval could not be verified.";
    if (estimate.projectId !== project.id || project.estimationWorkflowVersion !== lifecycle!.workflowVersion ||
        project.estimateRequirementsVersion !== lifecycle!.requirementsVersion) return "Project requirements changed. Refresh this estimate.";
    if (lifecycle!.workflowVersion === 2 && (lifecycle!.editClosedAt || lifecycle!.finalApproval)) return "Design changes require an open post-estimate revision.";
  } else if (isEstimationWorkflowVersion(project.estimationWorkflowVersion)) {
    return "The estimate workflow does not match this project.";
  }
  return null;
}

interface ResolvedProjectEstimate {
  estimate: EstimateSummaryRecord;
  resolvedProjectId: string;
  projectLinkSource: AdminProjectEstimateLinkSource;
}

/**
 * Resolve the Estimate through the same direct-Project/legacy-Lead lineage used
 * by Project Finance. Approved Estimates win over any non-approved legacy
 * duplicate, and the Finance ordering makes the selected approval stable.
 */
function canonicalProjectEstimate(
  projectId: string,
  leads: readonly LeadRecord[],
  estimates: readonly EstimateSummaryRecord[]
): ResolvedProjectEstimate | null {
  const projectByLeadId = new Map(
    leads.flatMap((lead) => {
      const linkedProjectId = nonEmptyIdentifier(lead.projectId);
      return linkedProjectId === null ? [] : [[lead.id, linkedProjectId] as const];
    })
  );
  const resolved = estimates.map((estimate) =>
    resolveProjectEstimate(estimate, projectByLeadId)
  );
  const candidates = resolved.filter(
    (candidate): candidate is ResolvedProjectEstimate =>
      candidate !== null && candidate.resolvedProjectId === projectId
  );
  if (candidates.length === 0) return null;
  const approved = candidates.filter(
    ({ estimate }) => estimate.status === "client_approved"
  );
  return [...(approved.length > 0 ? approved : candidates)]
    .sort(compareResolvedProjectEstimates)[0] ?? null;
}

function resolveProjectEstimate(
  estimate: EstimateSummaryRecord,
  projectByLeadId: ReadonlyMap<string, string>
): ResolvedProjectEstimate | null {
  const directProjectId = nonEmptyIdentifier(estimate.projectId);
  const leadProjectId = projectByLeadId.get(estimate.leadId) ?? null;
  if (
    directProjectId !== null &&
    leadProjectId !== null &&
    directProjectId !== leadProjectId
  ) {
    throw new ApiError(
      409,
      "FINANCE_ESTIMATE_PROJECT_LINK_CONFLICT",
      "An approved Estimate is linked to different projects through its Estimate and Lead."
    );
  }
  const resolvedProjectId = directProjectId ?? leadProjectId;
  if (resolvedProjectId === null) return null;
  return {
    estimate,
    resolvedProjectId,
    projectLinkSource: directProjectId !== null && leadProjectId !== null
      ? "estimate_and_lead"
      : directProjectId !== null
        ? "estimate"
        : "lead"
  };
}

function compareResolvedProjectEstimates(
  left: ResolvedProjectEstimate,
  right: ResolvedProjectEstimate
): number {
  const clientDecisionDifference = storedTime(right.estimate.clientDecisionAt) -
    storedTime(left.estimate.clientDecisionAt);
  if (clientDecisionDifference !== 0) return clientDecisionDifference;
  const updatedDifference = storedTime(right.estimate.updatedAt) -
    storedTime(left.estimate.updatedAt);
  return updatedDifference || left.estimate.id.localeCompare(right.estimate.id);
}

function storedTime(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function nonEmptyIdentifier(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function assertApprovedBaseline(estimate: EstimateSummaryRecord): void {
  const baseline = estimate.approvedBaseline;
  if (estimate.status !== "client_approved") return;
  try {
    if (baseline === null || !Number.isSafeInteger(baseline.estimateVersion) || baseline.estimateVersion < 1) {
      throw new TypeError("Approved Estimate version is invalid.");
    }
    projectFinanceBaseline({
      subtotalRupees: baseline.subtotal,
      gstRupees: baseline.gst,
      totalRupees: baseline.total,
      ...(baseline.subtotalPaise === undefined ? {} : { subtotalPaise: baseline.subtotalPaise }),
      ...(baseline.gstPaise === undefined ? {} : { gstPaise: baseline.gstPaise }),
      ...(baseline.totalPaise === undefined ? {} : { totalPaise: baseline.totalPaise }),
      ...(baseline.roundOffPaise === undefined ? {} : { roundOffPaise: baseline.roundOffPaise })
    });
  } catch {
    throw new ApiError(
      409,
      "ESTIMATE_APPROVAL_BASELINE_INVALID",
      "The approved Estimate snapshot contains invalid financial values."
    );
  }
}
