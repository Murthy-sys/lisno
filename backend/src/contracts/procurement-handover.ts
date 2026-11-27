import type { LifecycleBlocker, LifecycleCommand, LifecycleHistory, LifecyclePage } from "./procurement-lifecycle.js";

export type HandoverSection = "quality" | "delivery" | "handover";
export type HandoverAnswerValue = "pass" | "fail" | "not_applicable";
export interface HandoverEvidenceRequirement { photos: boolean; documents: boolean; video: boolean; minPhotosPerSample: number | null; }
export interface HandoverCheck {
  id: string; section: HandoverSection; label: string; instructions: string | null;
  itemId: string | null; itemName: string | null; vendorId: string | null; vendorName: string | null;
  orderId: string | null; basketId: string | null; parameterId: string | null; checklistRevisionId: string | null;
  required: boolean; allowNotApplicable: boolean; evidence: HandoverEvidenceRequirement | null;
  parameterSnapshot: Record<string, unknown> | null;
}
export interface HandoverAnswerInput {
  checkId: string; answer: HandoverAnswerValue; note: string; evidenceIds: string[]; sampleCount: number;
  finding?: { ownerId: string; dueAt: string };
}
export interface HandoverAnswer extends HandoverAnswerInput { actorId: string; recordedAt: string; findingId: string | null; }
export type HandoverCommand = LifecycleCommand & (
  { action: "save"; answers: HandoverAnswerInput[] } |
  { action: "submit" | "correct" | "reconcile"; reason: string }
);
export interface ProcurementFinding {
  id: string; projectId: string; snagId: string; status: "open" | "in_progress" | "resolved" | "verified" | "unavailable";
  title: string; note: string; itemId: string | null; vendorId: string | null;
  ownerId: string; dueAt: string; reportedAt: string; reportedById: string; evidenceIds: string[];
  origin: { kind: "handover" | "inspection" | "urgent"; entityId: string; checkId?: string };
}
export interface FindingReportCommand extends LifecycleCommand {
  recordId: string; itemId?: string | null; title: string; note: string; ownerId: string; dueAt: string; evidenceIds: string[];
}
export interface HandoverAuditContext {
  id: string; orderId: string; basketId: string; checklistRevisionId: string; status: "signed" | "signed_with_findings" | "corrected" | "historical";
  signedById: string; signedAt: string; failedLabels: string[];
}
export interface HandoverSupplyContext {
  id: string; sourceLineItemKey: string; title: string; round: number; signatureCount: number; requiredCount: number;
  /** Supply-review signatures are context only; they do not prove physical delivery. */
  meaning: "supply_review";
}
export interface HandoverRevisionSummary {
  id: string; version: number; status: "draft" | "submitted"; sourceDigest: string; action: "save" | "submit" | "correct" | "reconcile";
  actorId: string; at: string; reason: string | null; previousRevisionId: string | null;
}
export interface HandoverSourceChange { entityId: string; kind: "added" | "removed" | "changed"; label: string; previous: unknown; current: unknown; }
export interface HandoverWorkspace {
  projectId: string; version: number; sourceDigest: string; lifecycleSourceDigest: string; evidenceEntityId: string; serverNow: string;
  status: "not_started" | "draft" | "submitted" | "source_changed" | "unavailable";
  checks: HandoverCheck[]; answers: HandoverAnswer[]; sourceChanges: HandoverSourceChange[];
  currentRevisionId: string | null; submittedRevisionId: string | null;
  findings: ProcurementFinding[]; qualityAudits: HandoverAuditContext[]; supplyReviews: HandoverSupplyContext[];
  history: LifecyclePage<HandoverRevisionSummary>; auditHistory: LifecycleHistory[];
  selectedRevision: { id: string; version: number; checks: HandoverCheck[]; answers: HandoverAnswer[]; actorId: string; at: string; reason: string | null } | null;
  blockers: LifecycleBlocker[]; allowedActions: Array<"save" | "submit" | "correct" | "reconcile">;
}
