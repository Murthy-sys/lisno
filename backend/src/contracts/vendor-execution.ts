/** Execution status is separate from the existing immutable Client review lifecycle. */
export type ExecutionStatus = "assigned" | "awaiting_schedule" | "not_started" | "in_progress" | "blocked" | "awaiting_verification" | "site_verified" | "awaiting_client" | "changes_requested" | "client_approved" | "superseded";
export type ExecutionAction = "setup" | "acknowledge" | "propose_schedule" | "confirm_schedule" | "report" | "submit" | "verify" | "request_changes" | "hold" | "resume" | "exempt_evidence";
export interface ExecutionCommand {
  action: ExecutionAction;
  expectedVersion: number;
  idempotencyKey: string;
  note?: string;
  reason?: string;
  nextAction?: string;
  progress?: number;
  status?: "not_started" | "in_progress" | "blocked";
  startDate?: string;
  finishDate?: string;
  reviewDate?: string;
  submissionId?: string;
  imageIds?: string[];
}
export interface ExecutionPolicy {
  projectId: string;
  version: number;
  timezone: string;
  reminderTime: string;
  deadlineTime: string;
  escalationTime: string;
  effectiveDate: string;
}
export interface ExecutionDailyStatus {
  localDate: string;
  dueAt: string | null;
  state: "not_due" | "due" | "on_time" | "late" | "missing" | "exempt";
  reportedAt: string | null;
}
export interface ExecutionVendorReport {
  eventId: string;
  executionRound: number;
  reportedAt: string;
  note: string;
  reason: string | null;
  nextAction: string | null;
  progress: number;
  status: "not_started" | "in_progress" | "blocked";
}
export interface ExecutionProjectMetadata {
  id: string;
  name: string;
  status: "planning" | "active" | "on_hold" | "completed";
  completionAuthority: "legacy_staff" | "vendor_client";
}
export interface ExecutionWork {
  id: string;
  projectId: string;
  projectName: string;
  vendorId: string;
  vendorName: string;
  orderId: string;
  orderNumber: string;
  orderRevision: number;
  lineId: string;
  sourceLineItemKey: string;
  itemName: string;
  roomName: string;
  description: string;
  scopeType: string | null;
  mainBasketId: string | null;
  mainBasketName: string | null;
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string | null;
  sourceAvailable: boolean;
  quantityMilliUnits: number | null;
  uomCode: string | null;
  originalTargetDate: string | null;
  timezone: string;
  tracking: "setup_required" | "tracked" | "legacy_review";
  legacyStatus: string;
  version: number;
  executionRound: number;
  status: ExecutionStatus;
  progress: number;
  latestNote: string;
  latestReportAt: string | null;
  latestVendorReport: ExecutionVendorReport | null;
  acknowledgedAt: string | null;
  proposedSchedule: { startDate: string; finishDate: string; reason: string | null } | null;
  schedule: { startDate: string; finishDate: string; revision: number; confirmedAt: string; confirmedById: string } | null;
  reportingStartsOn: string | null;
  hold: { reason: string; startedAt: string; reviewDate: string } | null;
  submission: { id: string; submittedAt: string; note: string; imageIds: string[]; version: number } | null;
  verification: { id: string; verifiedAt: string; verifiedById: string; executionRound: number } | null;
  evidenceExemption: { reason: string; grantedById: string } | null;
  imageIds: string[];
  daily: ExecutionDailyStatus;
  flags: string[];
  nextOwner: "vendor" | "site_manager" | "program_manager" | "client" | "super_admin" | "none";
  allowedActions: ExecutionAction[];
  canSubmitToClient: boolean;
}
export interface ExecutionHistoryEvent {
  id: string;
  assignmentId: string;
  action: string;
  actorId: string;
  occurredAt: string;
  executionRound: number;
  localDate: string;
  note: string;
  reason: string | null;
  nextAction: string | null;
  startDate: string | null;
  finishDate: string | null;
  reviewDate: string | null;
  progress: number | null;
  status: string | null;
}
export interface ExecutionCounts {
  total: number;
  open: number;
  reported: number;
  verified: number;
  clientAccepted: number;
  missing: number;
  blocked: number;
  overdue: number;
  awaitingVerification: number;
  setupRequired: number;
}
export interface ExecutionQuery { limit?: number; offset?: number; q?: string; vendorId?: string; status?: string; flag?: string }
export interface ExecutionPortfolioQuery extends ExecutionQuery { projectScope?: "current" | "all" }
export interface ExecutionPage { project: ExecutionProjectMetadata | null; projectCounts: ExecutionCounts | null; items: ExecutionWork[]; total: number; limit: number; offset: number; counts: ExecutionCounts; policy: ExecutionPolicy | null; canManagePolicy: boolean }
export interface ExecutionHistoryPage { items: ExecutionHistoryEvent[]; total: number; limit: number; offset: number }
export interface ExecutionProjectSummary { id: string; name: string; status: string; counts: ExecutionCounts }
export interface ExecutionDeliveryHealth {
  schedulerEnabled: boolean; accessDeliveryEnabled: boolean; lastSchedulerSuccessAt: string | null;
  lastSchedulerFailureCode: string | null; pendingEmails: number; failedEmails: number;
}
export interface ExecutionPortfolio { items: ExecutionProjectSummary[]; total: number; limit: number; offset: number; deliveryHealth?: ExecutionDeliveryHealth | null }
export interface ExecutionNotificationDto {
  id: string;
  projectId: string;
  projectName: string;
  kind: "daily_reminder" | "daily_escalation" | "access_blocked" | "verification_pending";
  title: string;
  assignmentIds: string[];
  createdAt: string;
  readAt: string | null;
  deliveryStatus: string;
}
export interface ExecutionNotificationPage { items: ExecutionNotificationDto[]; total: number; unreadCount: number; limit: number; offset: number }
