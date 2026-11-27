import type { LifecycleBlocker, LifecyclePage, LifecycleTab } from "./procurement-lifecycle.js";
export type ProcurementNotificationKind = "payment_upcoming" | "payment_due" | "payment_overdue" | "payment_setup" | "payment_approval" | "payment_correction" | "lifecycle_setup" | "procurement_assignment" | "review_missed" | "review_followup" | "inspection_setup" | "inspection_missed" | "finding_overdue";
export interface ProcurementNotificationFacts { dueDate: string | null; remainingPaise: number | null; daysOverdue: number; blockers: LifecycleBlocker[]; }
export interface ProcurementNotification {
  id: string; projectId: string; projectName: string; kind: ProcurementNotificationKind; entityId: string; tab: LifecycleTab;
  title: string; message: string; createdAt: string; readAt: string | null; localDate: string;
  status: "active" | "resolved" | "stale"; deepLink: string; responsibleName: string | null;
  snapshot: ProcurementNotificationFacts; current: ProcurementNotificationFacts | null;
}
export interface ProcurementSchedulerHealth {
  status: "not_started" | "healthy" | "degraded" | "stopped";
  channel: "internal_feed"; cadenceSeconds: number; targetDelaySeconds: number;
  lastAttemptAt: string | null; lastSuccessAt: string | null; lastSweepAt: string | null;
  backlog: number; failureCode: string | null;
}
export interface ProcurementNotificationPage extends LifecyclePage<ProcurementNotification> {
  unreadCount: number; serverNow: string; health: ProcurementSchedulerHealth;
}
