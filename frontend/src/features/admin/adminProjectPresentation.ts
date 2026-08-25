import type { AdminProjectSummary } from "../../api/types";

export const ESTIMATION_APPROVAL_STATUS = "Estimation Approval";
export const ASSIGN_DESIGNER_NEXT_ACTION = "Assign Designer to upload design";

export function formatWorkflowLabel(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function isDesignerAssignmentPending(project: AdminProjectSummary) {
  return project.estimate?.status === "client_approved" &&
    (project.estimate.designPlanStatus == null ||
      project.estimate.designPlanStatus === "pending_assignment");
}

export function adminProjectStatusLabel(project: AdminProjectSummary) {
  return isDesignerAssignmentPending(project)
    ? ESTIMATION_APPROVAL_STATUS
    : formatWorkflowLabel(project.status);
}

export function adminProjectNextAction(project: AdminProjectSummary) {
  return isDesignerAssignmentPending(project)
    ? ASSIGN_DESIGNER_NEXT_ACTION
    : project.lead?.nextAction ?? null;
}
