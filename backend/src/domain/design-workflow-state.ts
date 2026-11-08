import type { Role } from "../contracts/domain.js";
import type { DesignStageType } from "./design-workflow.js";
import type { StoredEstimateClientResponseProof } from "./estimate-client-review.js";

export const DESIGN_WORKFLOW_ACTIONS = ["confirm_initial_payment", "internal_kickoff_complete", "sales_calendar_accept", "client_kickoff_request", "client_kickoff_schedule", "client_kickoff_complete", "keys_handed_over", "keys_received", "measurement_assign", "measurement_access_block", "measurement_access_restore", "measurement_complete", "furniture_request", "furniture_choice", "furniture_scope", "furniture_accept", "furniture_scope_return", "furniture_upload", "furniture_dimensions_approve", "furniture_dimensions_return", "furniture_proceed", "space_planning_complete"] as const;
export type DesignWorkflowAction = (typeof DESIGN_WORKFLOW_ACTIONS)[number];
export type DesignWorkflowHistoricalAction = DesignWorkflowAction | "client_kickoff_not_required";
interface FurnitureItemSnapshot { id: string; estimateItemId?: string; name: string; unit: string; uomId?: string; uomName?: string }
export type FurnitureDimensionItem = FurnitureItemSnapshot & (
  | { measurementType?: "dimensions"; length: number; width: number; height?: number; quantity?: never }
  | { measurementType: "count"; quantity: number; length?: never; width?: never; height?: never }
);
export interface FurnitureDimensions { submissionEventId: string; revision: number; status: "pending" | "changes_requested" | "approved"; items: FurnitureDimensionItem[]; submittedAt: string; reviewedAt?: string; returnReason?: string; provenance?: "client_self" | "designer_assisted"; submittedById?: string; clientConfirmedAt?: string }
export interface ClientFurnitureRequest {
  requestEventId: string;
  requestedById: string;
  requestedAt: string;
  roomIds: string[];
  hasFurniture: boolean | null;
  needsAssistance: boolean | null;
  assistanceFeePaise: null;
  responseEventId?: string;
  respondedById?: string;
  respondedAt?: string;
}
export interface WorkflowRoom { id: string; name: string; required: boolean; uploadedAt: string | null; proceed: boolean; dimensions?: FurnitureDimensions }
export interface WorkflowStageState {
  clientFurnitureRequest?: ClientFurnitureRequest;
  spacePlanningApproval?: { estimateId: string; designPlanVersion: number; reviewRoundId: string };
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
  requirementsSubmissionEventId?: string;
  scopeEstimateId?: string;
  scopeEstimateVersion?: number;
  scopeRoomFingerprints?: Record<string, string>;
  scopeReconciliation?: { at: string; previousRevision: number; affectedRoomIds: string[] };
  scopeReturn?: { reason: string; at: string };
  rooms?: WorkflowRoom[];
}

export function workflowFurnitureRoomReady(furniture: WorkflowStageState, room: WorkflowRoom): boolean {
  if (!room.required) return true;
  if (room.dimensions) return room.dimensions.status === "approved";
  // Preserve a valid completed legacy stage, without inventing approval for unfinished work.
  const completedLegacy = furniture.completedAt && furniture.acceptedAt && furniture.rooms?.every((item) => !item.dimensions && (!item.required || item.uploadedAt || item.proceed));
  return Boolean(completedLegacy && (room.uploadedAt || room.proceed));
}
export interface StoredWorkflowMedia {
  id: string;
  storageReference: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  kind: "image" | "video";
}
export interface DesignWorkflowHistoryEvent {
  id: string;
  idempotencyKey: string;
  requestHash: string;
  action: DesignWorkflowHistoricalAction;
  stageId: string | null;
  actorId: string;
  actorName: string;
  actorRole: Role;
  onBehalfOfClient: boolean;
  at: string;
  note: string;
  data?: Record<string, unknown>;
  proof: StoredEstimateClientResponseProof | null;
  mediaFiles?: StoredWorkflowMedia[];
}
export interface DesignWorkflowState {
  projectId: string;
  version: number;
  initialPaymentAt: string | null;
  estimationWorkflowVersion?: 2 | 3;
  /** Hydrated from the current approved quotation; never grants authority on its own. */
  quotationLocked?: boolean;
  designApprovalLocked?: boolean;
  designStartedAt?: string;
  initialPaymentEstimateId?: string;
  initialPaymentEstimateVersion?: number;
  initialPaymentReviewRoundId?: string;
  initialPaymentDesignReviewRoundId?: string;
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
export function workflowDesignStartAt(state: DesignWorkflowState): string | null {
  return state.estimationWorkflowVersion === 2 || state.estimationWorkflowVersion === 3 ? state.designStartedAt ?? null : state.initialPaymentAt;
}
export function workflowElapsedMs(state: DesignWorkflowState, at: number): number {
  const startedAt = workflowDesignStartAt(state);
  return startedAt ? Math.max(0, at - Date.parse(startedAt) - workflowPausedMs(state, at)) : 0;
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
  existing_furniture_dimensions: ["internal_kickoff", "client_kickoff", "key_collection", "site_measurement"],
  space_planning_tentative_look_feel: ["internal_kickoff", "client_kickoff", "key_collection", "site_measurement", "existing_furniture_dimensions"]
};

export function workflowClientKickoffCompleted(state: DesignWorkflowState): boolean {
  const kickoff = state.stages.client_kickoff;
  return Boolean(kickoff?.completedAt && kickoff.notRequired !== true);
}

/** Current eligibility never accepts a historical exemption as mandatory completion. */
export function workflowStageStartAt(state: DesignWorkflowState, type: DesignStageType, at: number): string | null {
  if (precedingStages[type]?.includes("client_kickoff") && !workflowClientKickoffCompleted(state)) return null;
  return rawStageStartAt(state, type, at);
}

function rawStageStartAt(state: DesignWorkflowState, type: DesignStageType, at: number): string | null {
  const predecessors = precedingStages[type];
  const startedAt = workflowDesignStartAt(state);
  if (!startedAt || !predecessors) return null;
  const times = [Date.parse(startedAt)];
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

interface SupersededClientKickoff { completedAt: string; timingBasis: "legacy" | "sequential"; recoveredAt: string }
/** Recovery metadata is server-owned and bound to the current immutable completion event. */
function supersededClientKickoff(state: DesignWorkflowState): SupersededClientKickoff | null {
  const kickoff = state.stages.client_kickoff;
  if (!kickoff?.completedAt || !Number.isFinite(Date.parse(kickoff.completedAt)) || kickoff.notRequired === true) return null;
  const matches = state.history.filter(event => event.action === "client_kickoff_complete" && event.at === kickoff.completedAt && event.data?.completedAt === kickoff.completedAt);
  if (matches.length !== 1) return null;
  const previous = matches[0]!.data?.supersededClientKickoff;
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) return null;
  const value = previous as Record<string, unknown>;
  if (typeof value.completedAt !== "string" || !Number.isFinite(Date.parse(value.completedAt)) ||
    Date.parse(value.completedAt) > Date.parse(kickoff.completedAt) || (value.timingBasis !== "legacy" && value.timingBasis !== "sequential")) return null;
  return { completedAt: value.completedAt, timingBasis: value.timingBasis, recoveredAt: kickoff.completedAt };
}

/** Read-only clock evidence. This function must never authorize a new workflow action. */
export function workflowStageTimingStartAt(state: DesignWorkflowState, type: DesignStageType, at: number): string | null {
  const previous = supersededClientKickoff(state);
  if (previous && precedingStages[type]?.includes("client_kickoff")) {
    const historical = { ...state, stages: { ...state.stages, client_kickoff: { ...state.stages.client_kickoff, completedAt: previous.completedAt } } };
    const establishedStart = rawStageStartAt(historical, type, Math.min(at, Date.parse(previous.recoveredAt)));
    if (establishedStart) return establishedStart;
  }
  return rawStageStartAt(state, type, at);
}

/** Validate already-recorded downstream completion without undoing valid historical work. */
export function workflowStageHistoricalPrerequisiteBlockers(state: DesignWorkflowState, type: DesignStageType, completedAt: string): string[] {
  const kickoff = state.stages.client_kickoff;
  const previous = kickoff?.notRequired === true ? kickoff : supersededClientKickoff(state);
  if (previous?.completedAt && Number.isFinite(Date.parse(previous.completedAt)) && Date.parse(previous.completedAt) <= Date.parse(completedAt)) {
    return workflowStagePrerequisiteBlockers({ ...state, stages: { ...state.stages, client_kickoff: { ...kickoff, completedAt: previous.completedAt, notRequired: false } } }, type);
  }
  return workflowStagePrerequisiteBlockers(state, type);
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
    if (predecessor === "client_kickoff" && !workflowClientKickoffCompleted(state)) blockers.push("Complete Client Kick off before starting this stage.");
    if (predecessor === "key_collection" && (!state.stages.key_collection?.completedAt || !state.stages.key_collection.handedOverAt || !state.stages.key_collection.receivedAt)) blockers.push("The Client and Designer must both confirm key handover before starting this stage.");
    if (predecessor === "site_measurement" && !state.stages.site_measurement?.completedAt) blockers.push("Complete On Site Actual Measurement before starting this stage.");
    if (predecessor === "existing_furniture_dimensions" && !state.stages.existing_furniture_dimensions?.completedAt) blockers.push("Complete Collection of existing furniture dimensions before starting this stage.");
  }
  return blockers;
}
export function workflowSubmissionBlockers(state: DesignWorkflowState, roomIds?: string[], phase: "upload" | "submission" = "submission"): string[] {
  const blockers: string[] = [];
  if (state.estimationWorkflowVersion === 3 && !state.quotationLocked) blockers.push("The Client must approve the current Designer-revised quotation before design work continues.");
  else if (!workflowDesignStartAt(state)) blockers.push(state.estimationWorkflowVersion === 2 ? "The Client must approve the pre-estimate before design starts." : "Super Admin must confirm Initial payment received after estimate approval.");
  if (workflowIsPaused(state)) blockers.push("The Client has blocked site access. Restore access to resume the workflow.");
  if (!state.stages.internal_kickoff?.completedAt) blockers.push("Complete Internal Kick off with its signed checklist.");
  if (!workflowClientKickoffCompleted(state)) blockers.push("Complete Client Kick off.");
  if (!state.stages.key_collection?.handedOverAt || !state.stages.key_collection?.receivedAt) blockers.push("The Client and Designer must both confirm key handover.");
  if (!state.stages.site_measurement?.completedAt) blockers.push("Complete site measurement with uploaded photos or videos.");
  if (phase === "upload") return blockers;
  const furniture = state.stages.existing_furniture_dimensions;
  if (!furniture?.rooms || !furniture.acceptedAt || furniture.scopeReturn) blockers.push("Declare existing-furniture applicability and obtain Client acceptance.");
  else if (!furniture.noExistingFurniture) {
    const selected = roomIds === undefined ? furniture.rooms : furniture.rooms.filter((room) => roomIds.includes(room.id));
    if (roomIds && (roomIds.length === 0 || selected.length !== new Set(roomIds).size)) blockers.push("Select rooms from the confirmed furniture scope.");
    if (selected.some((room) => !workflowFurnitureRoomReady(furniture, room))) blockers.push("Client approval of existing-furniture dimensions is still required for the selected rooms.");
  }
  return blockers;
}
