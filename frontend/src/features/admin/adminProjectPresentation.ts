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
