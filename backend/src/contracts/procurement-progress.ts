import type { LifecycleBlocker, LifecycleHistory, LifecycleItem } from "./procurement-lifecycle.js";

export type ProcurementReviewStatus = "open" | "paused" | "submitted" | "missed";
export type ProcurementCheckStatus = "not_started" | "in_progress" | "blocked" | "completed";
export interface ProcurementProgressObservation {
  checkedAt: string;
  status: ProcurementCheckStatus;
  progress: number | null;
  notes: string;
  nextAction: string;
  nextCheckDate: string;
  delayed: boolean;
  delayReason: string | null;
  responsibleParty: string | null;
  recoveryAction: string | null;
  recoveryDate: string | null;
  forecastDate: string | null;
  forecastReason: string | null;
}
export interface ProcurementProgressCheck extends ProcurementProgressObservation {
  id: string; roundId: string; itemId: string; revision: number; correctionOf: string | null;
  correctionReason: string | null; sourceDigest: string; submittedAt: string;
  submittedById: string; submittedByName: string; late: boolean;
}
export interface ProcurementReviewMember {
  item: LifecycleItem; membershipDigest: string; check: ProcurementProgressCheck | null;
  canCheck: boolean; blockingItemIds: string[];
}
export interface ProcurementReviewRound {
  id: string; projectId: string; sequence: number; version: number;
  status: ProcurementReviewStatus; sourceDigest: string; currentSourceDigest: string;
  sourceChanged: boolean; opensAt: string; originalDueAt: string; effectiveDueAt: string;
  timezone: string; intervalDays: number; pausedAt: string | null;
  submittedAt: string | null; submittedById: string | null; late: boolean;
  members: ProcurementReviewMember[]; requiredCount: number; checkedCount: number;
  blockers: LifecycleBlocker[]; allowedActions: string[];
}
export interface ProcurementReviewPage {
  projectId: string; serverNow: string; sourceDigest: string;
  current: ProcurementReviewRound | null; items: ProcurementReviewRound[];
  total: number; limit: number; offset: number; blockers: LifecycleBlocker[];
  allowedActions: string[];
}
export interface ProcurementReviewDetail extends ProcurementReviewRound {
  checks: ProcurementProgressCheck[]; history: LifecycleHistory[];
}
