import { apiClient } from "../../api/client";
import type {
  DesignPlanReviewTask,
  DesignPlanTask,
  DesignerAssignmentOption,
  ProjectWorkflowTask
} from "../../api/types";

export const projectWorkflowKeys = {
  all: ["project-workflow"] as const,
  designerPlans: ["project-workflow", "designer-plans"] as const,
  designerOptions: ["project-workflow", "designer-options"] as const,
  designReviews: (status = "pending") =>
    ["project-workflow", "design-reviews", status] as const,
  operational: ["project-workflow", "operational"] as const
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
