import type { ProjectLanguage } from "./project-initiation.js";

export type DesignerAssignmentRequestStatus = "pending" | "accepted" | "declined" | "cancelled";
export type DesignerAssignmentClosureReason = "assigned_elsewhere" | "cancelled_by_admin";
export interface AssignmentPagination { limit: number; offset: number; total: number; hasMore: boolean }
export interface AssignmentPerson { id: string; name: string }

export interface DesignerSuggestion {
  id: string;
  name: string;
  activeProjectCount: number;
  languagesKnown: ProjectLanguage[];
  preferredLanguage: ProjectLanguage | null;
  location: string | null;
  languageMatch: "preferred" | "known" | "none" | "unknown";
  locationMatch: "same_location" | "city_text" | "none" | "unknown";
  eligible: boolean;
  blockedReason: string | null;
}

export interface DesignerAssignmentRequestSummary {
  id: string;
  projectId: string;
  projectName: string;
  designer: AssignmentPerson;
  status: DesignerAssignmentRequestStatus;
  version: number;
  createdAt: string;
  decidedAt: string | null;
  note: string | null;
  closureReason: DesignerAssignmentClosureReason | null;
}

export interface DesignerSuggestionsPage {
  projectId: string;
  serverNow: string;
  sourceRevision: string | null;
  projectPreferredLanguage: ProjectLanguage | null;
  projectLocation: string | null;
  projectCity: string | null;
  currentDesigner: AssignmentPerson | null;
  pendingRequests: DesignerAssignmentRequestSummary[];
  /** @deprecated Present only when exactly one request is pending. Use pendingRequests. */
  pendingRequest: DesignerAssignmentRequestSummary | null;
  canRequest: boolean;
  blockedReason: string | null;
  items: DesignerSuggestion[];
  pagination: AssignmentPagination;
}

export interface DesignerAssignmentRequestPage {
  items: DesignerAssignmentRequestSummary[];
  pagination: AssignmentPagination;
}

/** Preview does not grant access to project documents, contacts, or chat. */
export interface DesignerAssignmentInboxItem {
  id: string;
  projectId: string;
  projectName: string;
  projectLocation: string | null;
  preferredLanguage: ProjectLanguage | null;
  scopeSummary: { itemCount: number; sectionCount: number; roomCount: number };
  status: DesignerAssignmentRequestStatus;
  version: number;
  createdAt: string;
  decidedAt: string | null;
  canDecide: boolean;
  blockedReason: string | null;
  closureReason: DesignerAssignmentClosureReason | null;
}

export interface DesignerAssignmentInboxPage {
  items: DesignerAssignmentInboxItem[];
  pagination: AssignmentPagination;
}

export interface CreateDesignerAssignmentRequestInput {
  designerId: string;
  expectedSourceRevision: string;
  idempotencyKey: string;
}
export interface CancelDesignerAssignmentRequestInput {
  expectedVersion: number;
  idempotencyKey: string;
}
export interface DecideDesignerAssignmentRequestInput {
  expectedVersion: number;
  decision: "accept" | "decline";
  idempotencyKey: string;
  note?: string;
}

/** Internal source evidence only; never serialize this wholesale to Clients. */
export interface DesignerAssignmentEvidence {
  pendingRequests: Array<{ id: string; designerId: string; version: number; createdAt: string }>;
  acceptedRequest: { id: string; designerId: string; acceptedAt: string } | null;
}

export type KeyCollectionAppointmentMode = "within_48_hours" | "chosen_datetime";
export type KeyCollectionZone = "green" | "orange" | "red";
/** Absolute boundaries calculated from the immutable confirmed appointment. */
export interface KeyCollectionTiming {
  appointmentId: string;
  zone: KeyCollectionZone;
  orangeAt: string;
  redAt: string;
  orangeWarningAt: string;
  redWarningAt: string;
}
export type KeyCollectionScheduleData =
  | { mode: "within_48_hours"; expectedAssignmentRevision: string }
  | { mode: "chosen_datetime"; scheduledAt: string; expectedAssignmentRevision: string };

export interface KeyCollectionAppointmentView {
  mode: KeyCollectionAppointmentMode;
  confirmedAt: string;
  originalDeadlineAt: string;
  deadlineAt: string;
  receivedAt: string | null;
  handedOverAt: string | null;
  completedAt: string | null;
  remainingMs: number;
  overdue: boolean;
  /** Missing on older responses; null when timing is unavailable or collection has ended. */
  timing?: KeyCollectionTiming | null;
}

export interface DesignerKeyCollectionReminderItem {
  projectId: string;
  projectName: string;
  stageId: string;
  appointment: KeyCollectionAppointmentView;
  blockers: string[];
}
export interface DesignerKeyCollectionReminderPage {
  serverNow: string;
  urgentCount: number;
  /** Earliest future red boundary across all authorized pending appointments. */
  nextRedAt: string | null;
  items: DesignerKeyCollectionReminderItem[];
  pagination: AssignmentPagination;
}

/** Safe project-scoped handoff projection shared by Clients and accepted staff. */
export interface DesignerHandoffView {
  initialEstimateApproved: boolean;
  executionAvailable: boolean;
  state: "awaiting_approval" | "awaiting_designer" | "awaiting_client_schedule" | "scheduled" | "received" | "completed" | "source_issue";
  designer: AssignmentPerson | null;
  assignmentRevision: string | null;
  appointment: KeyCollectionAppointmentView | null;
  canSchedule: boolean;
  blockers: string[];
}
