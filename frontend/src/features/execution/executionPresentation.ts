import type { ExecutionAction, ExecutionStatus } from "./executionApi";

export const executionStatusLabels: Record<ExecutionStatus, string> = {
  assigned: "Awaiting acknowledgement", awaiting_schedule: "Awaiting schedule", not_started: "Not started",
  in_progress: "In progress", blocked: "Blocked", awaiting_verification: "Awaiting Site Manager",
  site_verified: "Site verified", awaiting_client: "With Client", changes_requested: "Changes requested", client_approved: "Client accepted", superseded: "Superseded"
};
export const executionActionLabels: Record<ExecutionAction, string> = {
  setup: "Enable tracking", acknowledge: "Acknowledge work", propose_schedule: "Propose schedule",
  confirm_schedule: "Confirm schedule", report: "Daily update", submit: "Submit for site verification",
  verify: "Verify completion", request_changes: "Request changes", hold: "Place on hold", resume: "Resume work", exempt_evidence: "Grant photo exemption"
};
export function executionLabel(value: string) {
  return value.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
export function executionDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}
export function executionTime(value: string | null, timezone = "Asia/Kolkata") {
  if (!value) return "No update yet";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}
