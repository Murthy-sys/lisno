/** Shared current-owner classification. Historical identities are accepted only by migration inventory. */
export interface ProjectManagerTaskFact {
  id: string;
  projectId: string;
  estimateId: string;
  kind: string;
  assigneeRole: string;
  assigneeUserId: string | null;
  version: number;
  designPlanVersion: number;
  preparationOnly: boolean;
  status: string;
  supersededAt?: string | Date | null;
}
export interface ProjectManagerSourceFact {
  id: string;
  projectId: string;
  status: string;
  designPlanStatus?: string | null;
  designPlanVersion: number;
  estimation?: {
    workflowVersion?: number;
    preApproval?: { reviewRoundId: string; estimateVersion: number } | null;
    finalApproval?: { reviewRoundId: string; estimateVersion: number; designPlanVersion: number; designScopeRevision: number } | null;
    designScopeRevision?: number;
    approvedDesignScopeRevision?: number | null;
  } | null;
}
export interface ProjectManagerAssignmentFacts {
  project: { id: string; programManagerId: string | null; procurementIdentityVersion: number } | null;
  tasks: readonly ProjectManagerTaskFact[];
  sources: readonly ProjectManagerSourceFact[];
  users: readonly { id: string; role: string; active: boolean }[];
  lockedReviewOwnerIds?: readonly string[];
  reviewStateInvalid?: boolean;
}
export type AssignmentConflictCode = "PROJECT_MISSING" | "ASSIGNMENT_VERSION_INVALID" | "SITE_TASK_AMBIGUOUS" |
  "SITE_TASK_INVALID" | "SITE_SOURCE_INVALID" | "ASSIGNMENT_MISMATCH" | "ASSIGNMENT_SYNC_REQUIRED" |
  "OWNER_MISSING_OR_INACTIVE" | "OWNER_ROLE_INVALID" | "REVIEW_OWNER_MISMATCH" | "REVIEW_SOURCE_INVALID";
export interface ProjectManagerAssignment {
  state: "assigned" | "unassigned" | "conflict";
  projectId: string;
  ownerId: string | null;
  task: ProjectManagerTaskFact | null;
  projectVersion: number;
  reason: AssignmentConflictCode | null;
  needsSynchronization: boolean;
}
const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
const identity = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.trim() === value;

export function projectManagerTaskSourceIsValid(task: ProjectManagerTaskFact, sources: readonly ProjectManagerSourceFact[]): boolean {
  const eligible = sources.filter(source => {
    if (source.projectId !== task.projectId) return false;
    const lifecycle = source.estimation;
    if (task.preparationOnly) return lifecycle?.workflowVersion === 2 &&
      identity(lifecycle.preApproval?.reviewRoundId) && positive(lifecycle.preApproval!.estimateVersion);
    if (source.status !== "client_approved" || source.designPlanStatus !== "approved" || !positive(source.designPlanVersion)) return false;
    if (lifecycle?.workflowVersion !== 2) return true;
    const final = lifecycle.finalApproval;
    return Boolean(final && identity(final.reviewRoundId) && positive(final.estimateVersion) &&
      final.designPlanVersion === source.designPlanVersion && final.designScopeRevision === lifecycle.designScopeRevision &&
      final.designScopeRevision === lifecycle.approvedDesignScopeRevision);
  });
  if (eligible.length !== 1 || eligible[0]!.id !== task.estimateId) return false;
  return task.preparationOnly || eligible[0]!.designPlanVersion === task.designPlanVersion;
}

export function classifyProjectManagerAssignment(facts: ProjectManagerAssignmentFacts,
  options: { mode?: "runtime" | "migration" } = {}): ProjectManagerAssignment {
  const project = facts.project;
  const result: ProjectManagerAssignment = { state: "unassigned", projectId: project?.id ?? "", ownerId: null,
    task: null, projectVersion: project?.procurementIdentityVersion ?? 0, reason: null, needsSynchronization: false };
  const conflict = (reason: AssignmentConflictCode): ProjectManagerAssignment => ({ ...result, state: "conflict", reason });
  if (!project) return conflict("PROJECT_MISSING");
  if (!identity(project.id) || !positive(project.procurementIdentityVersion)) return conflict("ASSIGNMENT_VERSION_INVALID");
  if (facts.reviewStateInvalid) return conflict("REVIEW_SOURCE_INVALID");
  const projectTasks = facts.tasks.filter(task => task.projectId === project.id && task.kind === "site_execution");
  if (projectTasks.some(task => task.supersededAt != null && !Number.isFinite(new Date(task.supersededAt).getTime()))) return conflict("SITE_TASK_INVALID");
  const tasks = projectTasks.filter(task => !task.supersededAt);
  if (tasks.length > 1) return conflict("SITE_TASK_AMBIGUOUS");
  const task = tasks[0] ?? null;
  result.task = task;
  if (task && (!identity(task.id) || !identity(task.estimateId) || !positive(task.version) ||
    task.assigneeRole !== "site_manager" || !["open", "in_progress", "completed"].includes(task.status) || task.preparationOnly && task.status !== "open" ||
    !Number.isSafeInteger(task.designPlanVersion) || task.designPlanVersion < 0)) return conflict("SITE_TASK_INVALID");
  if (task && !projectManagerTaskSourceIsValid(task, facts.sources)) return conflict("SITE_SOURCE_INVALID");
  const scalar = project.programManagerId;
  const assigned = task?.assigneeUserId ?? null;
  if (scalar !== null && !identity(scalar) || assigned !== null && !identity(assigned)) return conflict("SITE_TASK_INVALID");
  if (scalar && assigned && scalar !== assigned) return conflict("ASSIGNMENT_MISMATCH");
  if (task?.status === "completed" && scalar && !assigned) return conflict("ASSIGNMENT_MISMATCH");
  result.ownerId = scalar ?? assigned;
  result.needsSynchronization = Boolean(task && scalar !== assigned);
  if (result.needsSynchronization && options.mode !== "migration") return conflict("ASSIGNMENT_SYNC_REQUIRED");
  if (result.ownerId) {
    const matches = facts.users.filter(user => user.id === result.ownerId);
    if (matches.length !== 1 || !matches[0]!.active) return conflict("OWNER_MISSING_OR_INACTIVE");
    if (matches[0]!.role !== "site_manager" && !(options.mode === "migration" && matches[0]!.role === "program_manager")) return conflict("OWNER_ROLE_INVALID");
    if (options.mode === "migration" && matches[0]!.role === "program_manager") result.needsSynchronization = true;
  }
  if ((facts.lockedReviewOwnerIds ?? []).length && !task) return conflict("REVIEW_SOURCE_INVALID");
  if ((facts.lockedReviewOwnerIds ?? []).some(owner => owner !== result.ownerId)) return conflict("REVIEW_OWNER_MISMATCH");
  return { ...result, state: result.ownerId ? "assigned" : "unassigned" };
}
