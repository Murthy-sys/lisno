/** Operational PM views. Financial values are integer paise; missing values stay null. */
export const PM_TABS = ["site", "procurement", "selections", "supply", "vendors", "client", "snagging", "quality"] as const;
export type PMTab = typeof PM_TABS[number];
export type PMAvailability = "available" | "not_configured" | "no_data" | "source_unavailable";
export type PMSeverity = "critical" | "warning" | "neutral" | "success";
export type PMHealth = "critical" | "at_risk" | "incomplete" | "setup" | "on_track" | "completed";
export interface PMSource { id: string; label: string; sourceToken: string; lineItemKey?: string; sectionId?: string; roomId?: string | null; assignmentId?: string; vendorId?: string; ownerIds?: string[]; quantity?: number; unit?: string; }
export interface PMPerson { id: string; name: string; role: string; }
export interface PMFact { label: string; value: string; }
export interface PMAction { id: string; label: string; reasonRequired?: boolean; href?: string; }
export interface PMHistory { id: string; action: string; actorName: string; at: string; reason: string | null; }
export interface PMCheck { id: string; label: string; answer: "pass" | "fail" | "not_applicable" | null; reason: string | null; evidenceIds: string[]; instructions?: string | null; sampleCount?: number; evidence?: { photos: boolean; documents: boolean; video: boolean; minPhotosPerSample?: number | null; instructions?: string | null } | null; }
export interface PMItem {
  id: string; kind: string; title: string; status: string; severity: PMSeverity; version: number;
  sourceToken: string | null; sourceId?: string; assignmentId?: string; vendorId?: string;
  tradeId?: string | null; tradeName?: string | null; vendorName?: string | null;
  orderId?: string; basketId?: string; week?: string; milestoneId?: string;
  roomId?: string | null; roomName?: string | null; ownerId?: string | null; ownerName?: string | null;
  description?: string | null; dueAt?: string | null; amountPaise?: number | null; progress?: number | null;
  facts: PMFact[]; actions: PMAction[]; history?: PMHistory[]; checks?: PMCheck[]; children?: PMItem[];
  evidenceIds?: string[]; href?: string; sourceAvailable?: boolean;
}
export interface PMPanel {
  tab: PMTab; availability: PMAvailability; calculatedAt: string; items: PMItem[]; total: number;
  issues: string[]; sources: PMSource[]; people: PMPerson[]; actions: PMAction[];
  snagFilters?: { rooms: Array<{id: string; label: string}>; trades: Array<{id: string; label: string}>; vendors: Array<{id: string; label: string}> };
}
export interface PMProgress {
  basis: "approved_execution_scope_v1"; actual: number | null; planned: number | null;
  availability: PMAvailability; sourceRevision: string | null; issues: string[];
  requiredLines: number; coveredLines: number; zeroValueLines: number;
  reportedComplete: number; siteVerified: number; clientAccepted: number;
}
export interface PMProject {
  id: string; name: string; clientName: string; location: string; status: string; health: PMHealth;
  progress: PMProgress; plannedEndAt: string | null; approvedNetPaise: number | null;
  issues: string[]; activeAlerts: number;
}
export interface PMAlert { id: string; projectId: string; projectName: string; tab: PMTab; entityId: string | null; offset?: number; title: string; detail: string; severity: PMSeverity; dueAt: string | null; }
export interface PMPortfolio { items: PMProject[]; total: number; counts: { active: number; atRisk: number; critical: number; setup: number; onTrack: number; incomplete: number }; alerts: PMAlert[]; alertTotal: number; calculatedAt: string; }
export interface PMOverview { project: PMProject; capabilities: string[]; calculatedAt: string; }
export interface PMPerformance { availability: PMAvailability; policy: string | null; message: string; calculatedAt: string; metrics: PMFact[]; }
export interface PMLeaderboard { availability: PMAvailability; period: string; policy: string | null; message: string; items: Array<{ id: string; name: string; role: string; score: number; rank: number }>; }
export interface PMBonus { availability: PMAvailability; policy: string | null; message: string; statements: Array<{ id: string; period: string; amountPaise: number; status: string }>; }
