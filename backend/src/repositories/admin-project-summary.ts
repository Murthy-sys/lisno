import { ApiError } from "../middleware/errors.js";
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
  actor: Pick<UserRecord, "id" | "role">
): AdminProjectSummary {
  const lead = leads
    .filter((candidate) => candidate.projectId === project.id)
    .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
  const estimator = project.assignedEstimatorId === null
    ? null
    : users.find((candidate) => candidate.id === project.assignedEstimatorId) ?? null;
  const estimateResolution = canonicalProjectEstimate(project.id, leads, estimates);
  const estimate = estimateResolution?.estimate ?? null;
  if (estimate) assertApprovedBaseline(estimate);
  const designPlanDesigner = estimate?.designPlanDesignerId == null
    ? null
    : users.find((candidate) => candidate.id === estimate.designPlanDesignerId) ?? null;
  return {
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
          status: estimate.status,
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
  if (
    baseline === null ||
    !Number.isSafeInteger(baseline.estimateVersion) ||
    baseline.estimateVersion < 1 ||
    ![baseline.subtotal, baseline.gst, baseline.total].every(
      (amount) => Number.isSafeInteger(amount) && amount >= 0
    ) ||
    baseline.subtotal + baseline.gst !== baseline.total
  ) {
    throw new ApiError(
      409,
      "ESTIMATE_APPROVAL_BASELINE_INVALID",
      "The approved Estimate snapshot contains invalid financial values."
    );
  }
}
