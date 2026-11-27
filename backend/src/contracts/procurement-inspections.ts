import type { LifecycleBlocker, LifecycleHistory, LifecycleItem } from "./procurement-lifecycle.js";

export interface ProcurementInspectionWindow { id: string; startsAt: string; endsAt: string; }
export interface ProcurementInspectionSlot extends ProcurementInspectionWindow {
  plannedAt: string; originalPlannedAt: string; visitId: string | null; late: boolean;
}
export interface ProcurementInspectionPlan {
  id: string; projectId: string; version: number; count: 2 | 3; sourceDigest: string;
  slots: ProcurementInspectionSlot[]; createdAt: string; updatedAt: string;
}
export interface ProcurementInspectionFinding {
  id: string; itemId: string | null; title: string; note: string;
  ownerId: string; dueAt: string; evidenceIds: string[]; snagId: string;
}
export interface ProcurementInspectionVisit {
  id: string; projectId: string; planId: string; planVersion: number; slotId: string | null;
  sourceDigest: string; inspectedAt: string; recordedAt: string; inspectorId: string; inspectorName: string;
  itemIds: string[]; items: LifecycleItem[]; notes: string; delayed: boolean;
  delayReason: string | null; responsibleParty: string | null; recoveryAction: string | null;
  recoveryDate: string | null; evidenceIds: string[]; findings: ProcurementInspectionFinding[];
  late: boolean; revision: number; correctionOf: string | null; correctionReason: string | null;
}
export interface ProcurementInspectionPage {
  projectId: string; serverNow: string; sourceDigest: string;
  plan: ProcurementInspectionPlan | null; visits: ProcurementInspectionVisit[];
  total: number; limit: number; offset: number; completedCount: number; requiredCount: number;
  blockers: LifecycleBlocker[]; allowedActions: string[]; history: LifecycleHistory[];
}
