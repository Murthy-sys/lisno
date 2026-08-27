import { apiClient } from "../../api/client";
import type {
  DesignPlanReviewTask,
  DesignPlanTask,
  DesignerAssignmentOption,
  ProjectWorkflowSectionAssignment,
  ProjectWorkflowTask,
  WorkerAssignmentOption
} from "../../api/types";

export const projectWorkflowKeys = {
  all: ["project-workflow"] as const,
  designerPlans: ["project-workflow", "designer-plans"] as const,
  designerOptions: ["project-workflow", "designer-options"] as const,
  designReviews: (status = "pending") =>
    ["project-workflow", "design-reviews", status] as const,
  operational: ["project-workflow", "operational"] as const,
  workers: ["project-workflow", "workers"] as const,
  projectTasks: (projectId: string) =>
    ["project-workflow", "project-tasks", projectId] as const,
  sectionAssignments: (projectId: string) =>
    ["project-workflow", "section-assignments", projectId] as const
};

export const getDesignerPlanTasks = () =>
  apiClient.get<DesignPlanTask[]>("/designer/design-plan-tasks");

export const getDesignerAssignmentOptions = () =>
  apiClient.get<DesignerAssignmentOption[]>("/admin/designers");

export const assignProjectDesigner = (projectId: string, designerId: string) =>
  apiClient.post<DesignPlanTask>(
    `/admin/projects/${encodeURIComponent(projectId)}/design-assignment`,
    { designerId }
  );

export const getDesignPlanReviewTasks = (
  status: "pending" | "approved" | "changes_requested" = "pending"
) =>
  apiClient.get<DesignPlanReviewTask[]>(
    `/admin/design-plan-response-tasks?status=${encodeURIComponent(status)}`
  );

export const downloadDesignPlanReviewAttachment = (
  roundId: string,
  attachmentIndex: number
) => apiClient.getBlob(
  `/admin/design-plan-response-tasks/${encodeURIComponent(roundId)}/attachments/${attachmentIndex}`
);

export const retryDesignPlanReviewEmail = (
  roundId: string,
  expectedVersion: number
) => apiClient.post<DesignPlanReviewTask>(
  `/admin/design-plan-response-tasks/${encodeURIComponent(roundId)}/email/retry`,
  { expectedVersion }
);

export function decideDesignPlanReview(input: {
  roundId: string;
  expectedVersion: number;
  decision: "approve" | "request_changes";
  note: string;
  proof: File;
}) {
  const body = new FormData();
  body.append("expectedVersion", String(input.expectedVersion));
  body.append("decision", input.decision);
  body.append("note", input.note);
  body.append("proof", input.proof);
  return apiClient.postMultipart<DesignPlanReviewTask>(
    `/admin/design-plan-response-tasks/${encodeURIComponent(input.roundId)}/decision`,
    body
  );
}

export const getOperationalWorkflowTasks = () =>
  apiClient.get<ProjectWorkflowTask[]>("/workflow-tasks");

export const updateOperationalWorkflowTask = (
  taskId: string,
  version: number,
  progress: number
) => apiClient.patch<ProjectWorkflowTask>(
  `/workflow-tasks/${encodeURIComponent(taskId)}`,
  { version, progress }
);

export const getWorkerAssignmentOptions = () =>
  apiClient.get<WorkerAssignmentOption[]>("/admin/workers");

export const getAdminProjectWorkflowTasks = (projectId: string) =>
  apiClient.get<ProjectWorkflowTask[]>(
    `/admin/projects/${encodeURIComponent(projectId)}/workflow-tasks`
  );

export const getAdminProjectSectionAssignments = (projectId: string) =>
  apiClient.get<ProjectWorkflowSectionAssignment[]>(
    `/admin/projects/${encodeURIComponent(projectId)}/section-assignments`
  );

export const overrideWorkerAssignment = (input: {
  projectId: string;
  taskId: string;
  expectedVersion: number;
  workerId: string | null;
}) => apiClient.post<ProjectWorkflowTask>(
  "/execution/worker-assignments/override",
  input
);

export const overrideSectionWorkerAssignment = (input: {
  projectId: string;
  estimateId: string;
  designPlanVersion: number;
  sourceSectionId: string;
  expectedRevision: string;
  workerId: string | null;
}) => apiClient.post<ProjectWorkflowSectionAssignment>(
  "/execution/section-worker-assignments/override",
  input
);
