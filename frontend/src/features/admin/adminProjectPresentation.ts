import type { AdminProjectSummary } from "../../api/types";
import { currentQuotationApprovalState, currentQuotationIsApproved } from "../estimates/quotationApproval";

export const ESTIMATION_APPROVAL_STATUS = "Estimation Approval";
export const ASSIGN_DESIGNER_NEXT_ACTION = "Assign Designer to upload design";

export function hasInitialEstimateApproval(project: AdminProjectSummary) {
  return project.estimationWorkflowVersion === 3
    ? Boolean(project.estimate?.initialEstimateApproval)
    : project.estimate?.status === "client_approved";
}

export function canAssignProjectDesigner(project: AdminProjectSummary) {
  const estimate = project.estimate;
  if (!estimate) return false;
  if (typeof estimate.canAssignDesigner === "boolean") return estimate.canAssignDesigner;
  if (project.estimationWorkflowVersion === 3) return false;
  return estimate.status === "client_approved" &&
    [null, undefined, "pending_assignment", "assigned", "in_progress", "changes_requested"].includes(estimate.designPlanStatus);
}

export function adminEstimateStages(project: AdminProjectSummary): Array<{ label: string; value: string }> {
  const estimate = project.estimate;
  if (project.estimationWorkflowVersion !== 3 || !estimate) return [];
  const quotationState = currentQuotationApprovalState(estimate);
  const quotationStatus = quotationState === "initial_current" && currentQuotationIsApproved(estimate)
    ? "No changes; initial approval current"
    : quotationState === "revision_draft" ? "Client approval required"
    : quotationState === "revision_pending_client" ? "Awaiting Client review"
    : quotationState === "revision_changes_requested" ? "Changes requested"
    : quotationState === "revision_current" && currentQuotationIsApproved(estimate) ? "Client approved"
    : "Approval status unavailable";
  return [
    {
      label: "Initial estimate",
      value: estimate.initialEstimateApproval ? "Client approved"
        : estimate.initialEstimateApproval === undefined ? "Approval status unavailable"
        : estimate.status === "client_approved" ? "Approval record unavailable"
        : estimate.estimationPhase === "pre" ? formatWorkflowLabel(estimate.status) : "Awaiting Client approval"
    },
    ...(estimate.estimationPhase === "post" ? [{ label: "Designer quotation", value: quotationStatus }] : [])
  ];
}

export function formatWorkflowLabel(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function isDesignerAssignmentPending(project: AdminProjectSummary) {
  return hasInitialEstimateApproval(project) && project.estimate != null &&
    (project.estimate.designPlanStatus == null ||
      project.estimate.designPlanStatus === "pending_assignment");
}

export function adminProjectStatusLabel(project: AdminProjectSummary) {
  return isDesignerAssignmentPending(project)
    ? ESTIMATION_APPROVAL_STATUS
    : formatWorkflowLabel(project.status);
}

export function adminProjectNextAction(project: AdminProjectSummary) {
  if (project.estimationWorkflowVersion === 3) {
    if (isDesignerAssignmentPending(project)) return "Assign Designer";
    if (hasInitialEstimateApproval(project) && project.estimate?.designPlanDesigner) {
      const state = currentQuotationApprovalState(project.estimate);
      if ((state === "initial_current" || state === "revision_current") && currentQuotationIsApproved(project.estimate)) {
        return project.lead?.nextAction ?? "Continue design workflow";
      }
      if (state === "revision_draft") return "Designer to submit revised quotation";
      if (state === "revision_pending_client") return "Await Client quotation review";
      if (state === "revision_changes_requested") return "Designer to revise quotation";
      return "Resolve quotation approval status";
    }
  }
  return isDesignerAssignmentPending(project)
    ? ASSIGN_DESIGNER_NEXT_ACTION
    : project.lead?.nextAction ?? null;
}

export type AdminProjectStatusTone =
  | "info"
  | "neutral"
  | "success"
  | "danger"
  | "complete";

export function adminProjectStatusTone(
  project: AdminProjectSummary
): AdminProjectStatusTone {
  if (isDesignerAssignmentPending(project)) return "info";
  switch (project.status) {
    case "active":
      return "success";
    case "on_hold":
      return "danger";
    case "completed":
      return "complete";
    case "planning":
    default:
      return "neutral";
  }
}

const RELATIVE_TIME_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 30],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY]
];

const relativeTime = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });

/**
 * Formats an ISO timestamp as "Created <relative time>" relative to `now`.
 * Returns null when the timestamp cannot be parsed.
 */
export function formatCreatedRelative(iso: string, now: Date = new Date()) {
  const created = Date.parse(iso);
  if (Number.isNaN(created)) return null;
  let value = (created - now.getTime()) / 1000;
  for (const [unit, size] of RELATIVE_TIME_STEPS) {
    if (Math.abs(Math.round(value)) < size) {
      return `Created ${relativeTime.format(Math.round(value), unit)}`;
    }
    value /= size;
  }
  return null;
}

export function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}
