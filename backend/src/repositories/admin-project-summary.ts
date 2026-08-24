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
  estimates: EstimateSummaryRecord[]
): AdminProjectSummary {
  const lead = leads.find((candidate) => candidate.projectId === project.id) ?? null;
  const estimator = project.assignedEstimatorId === null
    ? null
    : users.find((candidate) => candidate.id === project.assignedEstimatorId) ?? null;
  const estimate =
    (lead ? estimates.find((candidate) => candidate.leadId === lead.id) : undefined) ??
    estimates.find((candidate) => candidate.projectId === project.id) ??
    null;
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
          hasPendingClientResponseTask:
            estimate.clientReview?.status === "pending"
        }
      : null,
    createdAt: project.createdAt
  };
}
