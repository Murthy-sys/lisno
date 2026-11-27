/** Public lifecycle data. Amounts are integer paise; dates are ISO strings. */
export type LifecycleTab = "vendors" | "payments" | "progress" | "handover" | "signoff";
export interface LifecycleBlocker { code: string; message: string; tab: LifecycleTab; entityId?: string; }
export interface LifecycleCommand { expectedVersion: number; sourceDigest: string; idempotencyKey: string; }
export interface LifecycleHistory { id: string; action: string; actorId: string; actorName: string; at: string; reason: string | null; }
export interface LifecyclePage<T> { items: T[]; total: number; limit: number; offset: number; }
export interface LifecycleReadiness { ready: boolean; sourceDigest: string; blockers: LifecycleBlocker[]; references: Record<string, string | string[]>; }
export interface LifecyclePolicy { timezone: string; reviewIntervalDays: number; inspectionCount: 2 | 3; }
export interface LifecycleItem {
  id: string; assignmentId: string | null; sourceLineItemKey: string; mainLineId: string | null;
  basketId: string; itemName: string; roomName: string; roomId: string | null;
  orderId: string; orderRevisionId: string; lineId: string; vendorId: string; vendorName: string;
  scopeType: "supply" | "execution" | "supply_and_execution"; targetDate: string | null;
  priority: "P1" | "P2" | "P3" | null; priorityRevisionId: string | null;
  vendorProgress: number | null; vendorNote: string | null; vendorStatus: string | null;
}
export interface LifecycleOrder {
  id: string; revisionId: string; revision: number; vendorId: string; vendorName: string;
  orderNumber: string; awardId: string | null; issuedAt: string | null; totalPaise: number;
}
export interface LifecycleSource {
  digest: string; available: boolean; estimateId: string | null; estimateVersion: number | null;
  items: LifecycleItem[]; orders: LifecycleOrder[]; blockers: LifecycleBlocker[];
}
export interface LifecycleState {
  projectId: string; version: number; activatedAt: string; activatedById: string;
  policy: LifecyclePolicy; adoption: "new" | "existing"; sourceDigest: string;
}
export interface LifecycleSummary {
  projectId: string; projectName: string; projectStatus: string; serverNow: string;
  version: number; sourceDigest: string; availability: "available" | "setup_required" | "source_unavailable" | "legacy_completed";
  state: LifecycleState | null; source: LifecycleSource; blockers: LifecycleBlocker[]; allowedActions: string[];
  findingOwners: Array<{ id: string; name: string; role: string }>;
  attention: { overduePayments: number | null; progressActions: number | null; handoverActions: number | null; signoffBlockers: number | null };
}
export interface LifecycleEvidence { id: string; entityId: string; purpose: "payment" | "inspection" | "handover"; name: string; mimeType: string; kind: "image" | "video" | "document"; }
