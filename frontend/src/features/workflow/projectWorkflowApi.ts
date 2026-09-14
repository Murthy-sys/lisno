import { apiClient } from "../../api/client";
import type {
  DesignPlanReviewTask,
  DesignPlanTask,
  DesignerAssignmentOption,
  ProjectWorkflowSectionAssignment,
  ProjectWorkflowTask,
  DesignStageType,
  TaskStatus,
  TaskRisk,
  WorkerAssignmentOption
} from "../../api/types";

export const projectWorkflowKeys = {
  all: ["project-workflow"] as const,
  designerPlans: ["project-workflow", "designer-plans"] as const,
  designerOptions: ["project-workflow", "designer-options"] as const,
  designReviews: (status = "pending") =>
    ["project-workflow", "design-reviews", status] as const,
  projectReviews: (projectId: string) =>
    ["project-workflow", "design-reviews", "project", projectId] as const,
  designWorkflow: (projectId: string) =>
    ["project-workflow", "design-workflow", projectId] as const,
  paymentConfirmations: ["project-workflow", "payment-confirmations"] as const,
  operational: ["project-workflow", "operational"] as const,
  workers: ["project-workflow", "workers"] as const,
  projectTasks: (projectId: string) =>
    ["project-workflow", "project-tasks", projectId] as const,
  sectionAssignments: (projectId: string) =>
    ["project-workflow", "section-assignments", projectId] as const
};

export const getDesignerPlanTasks = () =>
  apiClient.get<DesignPlanTask[]>("/designer/design-plan-tasks", { showGlobalLoader: false });

export const getDesignerAssignmentOptions = () =>
  apiClient.get<DesignerAssignmentOption[]>("/admin/designers");

export const assignProjectDesigner = (projectId: string, designerId: string) =>
  apiClient.post<DesignPlanTask>(
    `/admin/projects/${encodeURIComponent(projectId)}/design-assignment`,
    { designerId }
  );

export const getDesignPlanReviewTasks = (
  status: "pending" | "approved" | "changes_requested" | "all" = "pending",
  projectId?: string
) => {
  const query = new URLSearchParams();
  if (status !== "all") query.set("status", status);
  if (projectId) query.set("projectId", projectId);
  return apiClient.get<DesignPlanReviewTask[]>(
    `/admin/design-plan-response-tasks?${query.toString()}`,
    { showGlobalLoader: false }
  );
};

export interface DesignWorkflowTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  progress: number;
  order: number;
  ownerName: string | null;
  floorName?: string;
  plannedStartAt: string;
  originalDeadlineAt: string;
  currentDeadlineAt: string;
  completedAt: string | null;
  dependencyTaskIds: string[];
  blockedByTaskIds: string[];
  risk: TaskRisk;
}

export interface DesignWorkflowStage {
  id: string;
  name: string;
  type: DesignStageType;
  order: number;
  dependencyStageIds: string[];
  status: TaskStatus | null;
  progress: number | null;
  deadlineAt: string | null;
  deadlineTaskId: string | null;
  tasks: DesignWorkflowTask[];
  sourceStages?: Array<{ id: string; name: string; floorName: string }>;
  instructions?: DesignStageInstructions;
  operational?: DesignStageOperational;
}

export interface DesignStageInstructions {
  objective: string | null;
  owner: string;
  trigger: string;
  start: string;
  completion: string[];
  sla: {
    enabled: boolean;
    bands: Array<{ label: string; description: string; tone: "success" | "warning" | "danger" | "neutral" }>;
    clockOwner: string | null;
    clockRule: string;
    pauseRule: string;
  };
  dependencies: string[];
  clientExperience: string[];
  clientMessage: string | null;
  managerReminders: string[];
  requirements: string[];
}

export type DesignWorkflowActionId =
  | "confirm_initial_payment" | "internal_kickoff_complete" | "sales_calendar_accept"
  | "client_kickoff_request" | "client_kickoff_schedule" | "client_kickoff_complete"
  | "client_kickoff_not_required" | "keys_handed_over" | "keys_received"
  | "measurement_assign" | "measurement_access_block" | "measurement_access_restore"
  | "measurement_complete" | "furniture_scope" | "furniture_accept"
  | "furniture_upload" | "furniture_proceed";

export interface DesignWorkflowAction {
  id: DesignWorkflowActionId;
  label: string;
  actor: "designer" | "client" | "sales" | "finance";
  requiresProof: boolean;
  disabledReason?: string;
}

export interface DesignStageOperational {
  status: TaskStatus;
  version: number;
  availableActions: DesignWorkflowAction[];
  submittedDocument?: {
    eventId: string;
    filename: string;
    mimeType: string;
    uploadedAt: string;
  };
  timing: {
    state: "waiting" | "scheduled" | "running" | "paused" | "completed" | "not_applicable";
    startsAt: string | null;
    targetAt: string | null;
    originalTargetAt: string | null;
    endsAt: string | null;
    slaAllowanceMs?: number | null;
    remainingMs: number | null;
    band: string | null;
    clockOwner: string | null;
    designerElapsedMs: number;
    clientElapsedMs: number;
  };
  blockingReasons: string[];
  facts: Array<{ label: string; value: string }>;
  rooms?: Array<{ id: string; name: string; required: boolean; hasDimensions: boolean; canProceed: boolean }>;
  reminders?: Array<{ id: string; label: string; dueAt: string }>;
  history: Array<{
    id: string;
    action: string;
    actorName: string;
    actorRole: string;
    onBehalfOfClient: boolean;
    at: string;
    note: string;
    proofAvailable: boolean;
  }>;
}

export type InitialPaymentStatus = "awaiting_estimate_approval" | "awaiting_payment" | "received";

export interface DesignWorkflowView {
  projectId: string;
  projectName: string;
  serverNow: string;
  /** Client receipt time preserves the server clock when cached data remounts. */
  receivedAt?: number;
  projectStages?: DesignWorkflowStage[];
  initialPayment?: { confirmedAt: string | null; canConfirm: boolean; version: number; status?: InitialPaymentStatus; issue?: string };
  measurementDesigners?: Array<{ id: string; name: string }>;
  furnitureRooms?: Array<{ id: string; name: string }>;
  furnitureScopeIssue?: string;
  notices?: Array<{ id: string; stageId: string; message: string }>;
  floors: Array<{
    id: string;
    name: string;
    number: string;
    order: number;
    stages: DesignWorkflowStage[];
  }>;
}

export const getDesignWorkflow = (projectId: string) =>
  apiClient.get<DesignWorkflowView>(
    `/projects/${encodeURIComponent(projectId)}/design-workflow`,
    { showGlobalLoader: false }
  ).then((workflow) => ({ ...workflow, receivedAt: Date.now() }));

export interface DesignPaymentConfirmation {
  projectId: string;
  projectName: string;
  confirmedAt: string | null;
  version: number;
  status?: InitialPaymentStatus;
  canConfirm?: boolean;
}

export const getDesignPaymentConfirmations = () =>
  apiClient.get<DesignPaymentConfirmation[]>("/design-workflow/payment-confirmations", { showGlobalLoader: false });

export async function performDesignWorkflowAction(input: {
  projectId: string;
  expectedVersion: number;
  action: DesignWorkflowActionId;
  stageId?: string;
  data?: Record<string, unknown>;
  note?: string;
  idempotencyKey: string;
  file?: File | null;
}, onProgress?: (percent: number) => void): Promise<{ version: number }> {
  const { projectId, file, ...payload } = input;
  const path = `/projects/${encodeURIComponent(projectId)}/design-workflow/actions`;
  if (!file) return apiClient.post<{ version: number }>(path, payload, { showGlobalLoader: false });
  const body = new FormData();
  body.set("expectedVersion", String(payload.expectedVersion));
  body.set("action", payload.action);
  body.set("idempotencyKey", payload.idempotencyKey);
  if (payload.stageId) body.set("stageId", payload.stageId);
  if (payload.note) body.set("note", payload.note);
  if (payload.data) body.set("data", JSON.stringify(payload.data));
  body.set("file", file);
  return apiClient.postMultipartWithProgress<{ version: number }>(path, body, onProgress ?? (() => {}), { showGlobalLoader: false });
}

export const downloadWorkflowActionProof = (projectId: string, eventId: string) =>
  apiClient.getBlob(`/projects/${encodeURIComponent(projectId)}/design-workflow/history/${encodeURIComponent(eventId)}/proof`);

export const downloadDesignPlanReviewProof = (roundId: string) =>
  apiClient.getBlob(
    `/admin/design-plan-response-tasks/${encodeURIComponent(roundId)}/proof`
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
}, onProgress?: (percent: number) => void) {
  const body = new FormData();
  body.append("expectedVersion", String(input.expectedVersion));
  body.append("decision", input.decision);
  body.append("note", input.note);
  body.append("proof", input.proof);
  if (onProgress) return apiClient.postMultipartWithProgress<DesignPlanReviewTask>(
    `/admin/design-plan-response-tasks/${encodeURIComponent(input.roundId)}/decision`,
    body,
    onProgress,
    { showGlobalLoader: false }
  );
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
