import type { Role } from "../contracts/domain.js";
import type { DesignStageType } from "./design-workflow.js";
import type { StoredEstimateClientResponseProof } from "./estimate-client-review.js";

export const DESIGN_WORKFLOW_ACTIONS = ["confirm_initial_payment", "internal_kickoff_complete", "sales_calendar_accept", "client_kickoff_request", "client_kickoff_schedule", "client_kickoff_complete", "client_kickoff_not_required", "keys_handed_over", "keys_received", "measurement_assign", "measurement_access_block", "measurement_access_restore", "measurement_complete", "furniture_scope", "furniture_accept", "furniture_upload", "furniture_proceed"] as const;
export type DesignWorkflowAction = (typeof DESIGN_WORKFLOW_ACTIONS)[number];
export interface WorkflowRoom { id: string; name: string; required: boolean; uploadedAt: string | null; proceed: boolean }
export interface WorkflowStageState {
  timingBasis?: "sequential";
  completedAt?: string;
  meetingAt?: string;
  handoverAcknowledgedAt?: string;
  handoverAcknowledgedById?: string;
  handoverAcknowledgedByName?: string;
  // Historical manager handovers remain readable; new completions record Designer receipt.
  managerHandedOverAt?: string;
  handoverManagerId?: string;
  handoverManagerName?: string;
  calendarAcceptedAt?: string;
  requestedAt?: string;
  preferredAt?: string;
  scheduledAt?: string;
  notRequired?: boolean;
  handedOverAt?: string;
  receivedAt?: string;
  assignedDesignerId?: string;
  mediaFolderUrl?: string;
  acceptedAt?: string;
  noExistingFurniture?: boolean;
  scopeEstimateId?: string;
  scopeEstimateVersion?: number;
  rooms?: WorkflowRoom[];
}
export interface DesignWorkflowHistoryEvent {
  id: string;
  idempotencyKey: string;
  requestHash: string;
  action: DesignWorkflowAction;
  stageId: string | null;
  actorId: string;
  actorName: string;
  actorRole: Role;
  onBehalfOfClient: boolean;
  at: string;
  note: string;
  data?: Record<string, unknown>;
  proof: StoredEstimateClientResponseProof | null;
}
export interface DesignWorkflowState {
  projectId: string;
  version: number;
  initialPaymentAt: string | null;
  initialPaymentEstimateId?: string;
  initialPaymentEstimateVersion?: number;
  stages: Partial<Record<DesignStageType, WorkflowStageState>>;
  pauses: Array<{ startedAt: string; endedAt: string | null }>;
  history: DesignWorkflowHistoryEvent[];
}
export const CALENDAR_DAY_MS = 86_400_000;
export function emptyDesignWorkflowState(projectId: string): DesignWorkflowState {
  return { projectId, version: 0, initialPaymentAt: null, stages: {}, pauses: [], history: [] };
}
export function workflowPausedMs(state: DesignWorkflowState, at: number, from = Number.NEGATIVE_INFINITY): number {
  return state.pauses.reduce((sum, pause) => sum + Math.max(0, Math.min(at, pause.endedAt ? Date.parse(pause.endedAt) : at) - Math.max(from, Date.parse(pause.startedAt))), 0);
}
export function workflowElapsedMs(state: DesignWorkflowState, at: number): number {
  return state.initialPaymentAt ? Math.max(0, at - Date.parse(state.initialPaymentAt) - workflowPausedMs(state, at)) : 0;
}
export function workflowIsPaused(state: DesignWorkflowState): boolean {
  return state.pauses.some((pause) => pause.endedAt === null);
}
export const WORKFLOW_STAGE_CLOCKS: Partial<Record<DesignStageType, { bands: readonly [number, number, number] }>> = {
  internal_kickoff: { bands: [3, 4, 5] },
  client_kickoff: { bands: [4, 5, 6] },
  site_measurement: { bands: [6, 8, 9] }
};

const precedingStages: Partial<Record<DesignStageType, DesignStageType[]>> = {
  internal_kickoff: [],
  client_kickoff: ["internal_kickoff"],
  key_collection: ["internal_kickoff", "client_kickoff"],
  site_measurement: ["internal_kickoff", "client_kickoff", "key_collection"],
  existing_furniture_dimensions: ["internal_kickoff", "client_kickoff", "key_collection", "site_measurement"]
};

/** Derive activation from immutable confirmations; never invent a start after a legacy completion. */
export function workflowStageStartAt(state: DesignWorkflowState, type: DesignStageType, at: number): string | null {
  const predecessors = precedingStages[type];
  if (!state.initialPaymentAt || !predecessors) return null;
  const times = [Date.parse(state.initialPaymentAt)];
  for (const predecessor of predecessors) {
    const stage = state.stages[predecessor];
    if (!stage?.completedAt) return null;
    times.push(Date.parse(stage.completedAt));
    if (predecessor === "key_collection") {
      if (!stage.handedOverAt || !stage.receivedAt) return null;
      times.push(Date.parse(stage.handedOverAt), Date.parse(stage.receivedAt));
    }
  }
  if (times.some((time) => !Number.isFinite(time))) return null;
  const start = Math.max(...times);
  return start <= at ? new Date(start).toISOString() : null;
}

export function workflowStageElapsedMs(state: DesignWorkflowState, startsAt: string | null, at: number): number {
  if (!startsAt) return 0;
  const start = Date.parse(startsAt);
  return Math.max(0, at - start - workflowPausedMs(state, at, start));
}

export function workflowStagePrerequisiteBlockers(state: DesignWorkflowState, type: DesignStageType): string[] {
  const blockers: string[] = [];
  for (const predecessor of precedingStages[type] ?? []) {
    if (predecessor === "internal_kickoff" && !state.stages.internal_kickoff?.completedAt) blockers.push("Complete Internal Kick off before starting this stage.");
    if (predecessor === "client_kickoff" && !state.stages.client_kickoff?.completedAt) blockers.push("Complete Client Kick off or mark it not necessary before starting this stage.");
    if (predecessor === "key_collection" && (!state.stages.key_collection?.completedAt || !state.stages.key_collection.handedOverAt || !state.stages.key_collection.receivedAt)) blockers.push("The Client and Designer must both confirm key handover before starting this stage.");
    if (predecessor === "site_measurement" && !state.stages.site_measurement?.completedAt) blockers.push("Complete On Site Actual Measurement before starting this stage.");
  }
  return blockers;
}
export function workflowSubmissionBlockers(state: DesignWorkflowState, roomIds?: string[], phase: "upload" | "submission" = "submission"): string[] {
  const blockers: string[] = [];
  if (!state.initialPaymentAt) blockers.push("Super Admin must confirm Initial payment received after estimate approval.");
  if (workflowIsPaused(state)) blockers.push("The Client has blocked site access. Restore access to resume the workflow.");
  if (!state.stages.internal_kickoff?.completedAt) blockers.push("Complete Internal Kick off with its signed checklist.");
  if (!state.stages.client_kickoff?.completedAt) blockers.push("Complete Client Kick off or mark it not necessary.");
  if (!state.stages.key_collection?.handedOverAt || !state.stages.key_collection?.receivedAt) blockers.push("The Client and Designer must both confirm key handover.");
  if (!state.stages.site_measurement?.completedAt) blockers.push("Complete site measurement with its sketch and media folder.");
  if (phase === "upload") return blockers;
  const furniture = state.stages.existing_furniture_dimensions;
  if (!furniture?.rooms || !furniture.acceptedAt) blockers.push("Declare existing-furniture applicability and obtain Client acceptance.");
  else if (!furniture.noExistingFurniture) {
    const selected = roomIds === undefined ? furniture.rooms : furniture.rooms.filter((room) => roomIds.includes(room.id));
    if (roomIds && (roomIds.length === 0 || selected.length !== new Set(roomIds).size)) blockers.push("Select rooms from the confirmed furniture scope.");
    if (selected.some((room) => room.required && !room.uploadedAt && !room.proceed)) blockers.push("Existing-furniture dimensions are still required for the selected rooms.");
  }
  return blockers;
}
