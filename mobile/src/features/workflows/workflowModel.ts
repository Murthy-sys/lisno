export const NATIVE_WORKFLOW_ACTIONS = Object.freeze([
  "internal_kickoff_complete",
  "sales_calendar_accept",
  "client_kickoff_request",
  "client_kickoff_schedule",
  "client_kickoff_complete",
  "client_kickoff_not_required",
  "keys_handed_over",
  "keys_received",
  "measurement_assign",
  "measurement_access_block",
  "measurement_access_restore",
  "space_planning_complete"
] as const);

export type NativeWorkflowAction = (typeof NATIVE_WORKFLOW_ACTIONS)[number];

export function isNativeWorkflowAction(value: unknown): value is NativeWorkflowAction {
  return typeof value === "string" && (NATIVE_WORKFLOW_ACTIONS as readonly string[]).includes(value);
}

export function workflowActionNeedsNote(action: NativeWorkflowAction): boolean {
  return action === "client_kickoff_not_required" || action === "measurement_access_block";
}

export function workflowActionNeedsDate(action: NativeWorkflowAction): boolean {
  return action === "internal_kickoff_complete" || action === "client_kickoff_request" || action === "client_kickoff_schedule";
}

export function actionDateData(action: NativeWorkflowAction, value: string): Record<string, unknown> | null {
  if (!workflowActionNeedsDate(action)) return {};
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (action === "internal_kickoff_complete") return { meetingAt: date.toISOString(), designHandoverAcknowledged: true };
  if (action === "client_kickoff_request") return { preferredAt: date.toISOString() };
  return { scheduledAt: date.toISOString() };
}
