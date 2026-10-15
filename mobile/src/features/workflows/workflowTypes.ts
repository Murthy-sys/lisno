type TaskStatus = "not_started" | "in_progress" | "in_review" | "blocked" | "completed";
export type DesignWorkflowActionId =
  | "confirm_initial_payment" | "internal_kickoff_complete" | "sales_calendar_accept"
  | "client_kickoff_request" | "client_kickoff_schedule" | "client_kickoff_complete"
  | "client_kickoff_not_required" | "keys_handed_over" | "keys_received"
  | "measurement_assign" | "measurement_access_block" | "measurement_access_restore"
  | "measurement_complete" | "furniture_scope" | "furniture_accept"
  | "furniture_upload" | "furniture_proceed" | "furniture_scope_return"
  | "furniture_dimensions_approve" | "furniture_dimensions_return" | "space_planning_complete";

interface FurnitureMeasurementItemBase {
  id: string;
  estimateItemId?: string;
  name: string;
  /** Submitted labels remain unchanged when the Configuration record changes. */
  unit: string;
  uomId?: string;
  uomName?: string;
}

export type FurnitureDimensionItem = FurnitureMeasurementItemBase & (
  | { measurementType?: "dimensions"; length: number; width: number; /** Legacy submissions may include height. */ height?: number }
  | { measurementType: "count"; quantity: number }
);

export interface FurnitureUomOption {
  id: string;
  code: string;
  name: string;
  decimalScale: number;
}

export interface FurnitureEstimateItem {
  id: string;
  name: string;
  catalogueId: string;
  specification: string;
  quantity: number;
  uom: string;
  /** Canonical mode from the approved estimate; older responses use dimensions. */
  measurementType?: "count" | "dimensions";
}

export interface FurnitureEstimateRoom {
  id: string;
  name: string;
  /** Valid room length and width from the linked approved estimate, in feet. */
  estimateDimensions?: { lengthFt: number; widthFt: number };
  /** Only actionable approved-value items. Zero-only rooms are present with an empty list; older responses may omit it. */
  estimateItems?: FurnitureEstimateItem[];
}

export interface FurnitureDimensionsSubmission {
  submissionEventId: string;
  revision: number;
  status: "pending" | "changes_requested" | "approved";
  items: FurnitureDimensionItem[];
  submittedAt: string;
  reviewedAt?: string;
  returnReason?: string;
}

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
  spacePlanning?: {
    estimateId: string;
    designPlanVersion: number;
    reviewRoundId: string | null;
    totalImages: number;
    approvedImages: number;
    readyForCompletion: boolean;
    completedAt: string | null;
    /** Requirements for final Client completion, separate from stage entry/upload blockers. */
    completionBlockingReasons?: string[];
  };
  furniture?: {
    phase: "requirements_pending" | "awaiting_client_acceptance" | "awaiting_dimensions" | "completed"
      | "requirements_changes_requested" | "awaiting_dimension_approval" | "dimension_changes_requested";
    notApplicable: boolean;
    requiredRoomCount: number;
    readyRoomCount: number;
    pendingRoomCount: number;
    /** Exact combined room/dimension submission reviewed by Client acceptance or send-back. */
    requirementsSubmissionEventId?: string;
    evidence?: FurnitureReviewEvidence[];
    scopeReturn?: { reason: string; at: string };
  };
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
  rooms?: Array<{ id: string; name: string; required: boolean; hasDimensions: boolean; canProceed: boolean; dimensions?: FurnitureDimensionsSubmission }>;
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
    mediaFiles?: Array<{ id: string; filename: string; mimeType: string; byteSize: number; kind: "image" | "video" }>;
  }>;
}

export interface FurnitureReviewEvidence {
  eventId: string;
  mediaId?: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  source: "site_measurement" | "furniture_requirements" | "furniture_dimensions";
}

export type InitialPaymentStatus = "awaiting_estimate_approval" | "awaiting_payment" | "received";
export interface InitialPaymentDetails {
  workflowVersion?: 2;
  designStartedAt?: string | null;
  existingReceiptAt?: string | null;
  requiresAttestation?: boolean;
  confirmedAt: string | null;
  canConfirm: boolean;
  version: number;
  status?: InitialPaymentStatus;
  issue?: string;
}

export interface DesignWorkflowView {
  projectId: string;
  projectName: string;
  serverNow: string;
  /** Canonical project-linked Client Estimate approval; older responses may omit this field. */
  estimateApprovalStatus?: "approved" | "awaiting_approval" | "source_issue";
  /** Client receipt time preserves the server clock when cached data remounts. */
  receivedAt?: number;
  projectStages?: WorkflowStage[];
  initialPayment?: InitialPaymentDetails;
  measurementDesigners?: Array<{ id: string; name: string }>;
  furnitureRooms?: FurnitureEstimateRoom[];
  furnitureScopeIssue?: string;
  notices?: Array<{ id: string; stageId: string; message: string }>;
  floors: Array<{
    id: string;
    name: string;
    number: string;
    order: number;
    stages: WorkflowStage[];
  }>;
}


export interface WorkflowStage { id: string; name: string; type: string; operational?: DesignStageOperational }
