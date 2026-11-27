import type { LifecycleCommand, LifecycleHistory, LifecyclePage, LifecycleReadiness } from "./procurement-lifecycle.js";

export interface ProcurementReadinessDeclaration {
  id: string; version: number; actorId: string; actorName: string; at: string;
  sourceDigest: string; references: Record<string, string | string[]>; reason: string;
}
export interface ProcurementReadinessWorkspace extends LifecycleReadiness {
  projectId: string; projectStatus: string; version: number; serverNow: string;
  status: "not_submitted" | "submitted" | "stale" | "withdrawn" | "correction_requested";
  declaration: ProcurementReadinessDeclaration | null;
  history: LifecyclePage<LifecycleHistory>;
  allowedActions: Array<"submit" | "withdraw" | "request_correction">;
  completion: { decisionId: string | null; completedAt: string | null; procurementDeclarationId: string | null; sourceDigest: string | null; references: Record<string, string | string[]> | null };
}
export interface ProcurementReadinessCommand extends LifecycleCommand {
  action: "submit" | "withdraw" | "request_correction"; reason: string;
}
