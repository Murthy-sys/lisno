import type {
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
  const lead = leads.find((candidate) => candidate.projectId === project.id) ?? null;
  const estimator = project.assignedEstimatorId === null
    ? null
    : users.find((candidate) => candidate.id === project.assignedEstimatorId) ?? null;
  const estimate =
    (lead ? estimates.find((candidate) => candidate.leadId === lead.id) : undefined) ??
    estimates.find((candidate) => candidate.projectId === project.id) ??
    null;
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
          status: estimate.status,
          total: estimate.total,
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
