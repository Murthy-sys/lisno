import { classifyProjectManagerAssignment, type ProjectManagerSourceFact } from "./project-manager-assignment.js";

/** Normalize repository/read projections without inventing source identities. */
export function projectManagerAssignmentFromProjection(
  project: { id: string; programManagerId?: string | null; procurementIdentityVersion?: number },
  tasks: readonly { id?: string; projectId: string; estimateId?: string; kind: string; assigneeRole: string; assigneeUserId: string | null;
    version?: number; designPlanVersion?: number; preparationOnly?: boolean; status?: string; supersededAt?: string | Date | null }[],
  sources: readonly { id: string; projectId?: string | null; status: string; designPlanStatus?: string | null; designPlanVersion?: number; estimation?: ProjectManagerSourceFact["estimation"] }[],
  users: readonly { id: string; role: string; active: boolean }[],
  lockedReviewOwnerIds: readonly string[] = []
) {
  return classifyProjectManagerAssignment({
    project: { id: project.id, programManagerId: project.programManagerId ?? null, procurementIdentityVersion: project.procurementIdentityVersion ?? 1 },
    tasks: tasks.map(task => ({ ...task, id: task.id ?? "", estimateId: task.estimateId ?? "", version: task.version ?? 1,
      designPlanVersion: task.designPlanVersion ?? -1, preparationOnly: task.preparationOnly === true, status: task.status ?? "open" })),
    sources: sources.map(source => ({ ...source, projectId: source.projectId ?? "", designPlanVersion: source.designPlanVersion ?? 0 })),
    users, lockedReviewOwnerIds
  });
}
