export type Role = "designer" | "design_manager" | "design_head" | "client";

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "completed";

export type RiskLevel = "gray" | "green" | "yellow" | "red";

export interface TaskRisk {
  level: RiskLevel;
  reason: string;
  elapsedRatio: number;
  progressRatio: number;
  forecastCompletion?: string;
}

export interface KpiTask {
  id: string;
  plannedStartAt: string;
  currentDeadlineAt: string;
  plannedEffort?: number | null;
  progress: number;
  status: TaskStatus;
  completedAt?: string | null;
  wasYellow?: boolean;
  approvalVersion?: number | null;
  approvalStatus?: "approved" | "rejected" | "unapproved" | null;
  revisionCount?: number | null;
  hasReview?: boolean;
  updateEvents?: Array<{ occurredAt: string }>;
}

export interface KpiInput {
  tasks: KpiTask[];
  periodStartAt: string;
  periodEndAt: string;
  now: Date;
}

export type KpiComponentKey =
  | "onTime"
  | "quality"
  | "revisionEfficiency"
  | "updateDiscipline"
  | "workloadCompletion";

export interface KpiComponent {
  key: KpiComponentKey;
  label: string;
  score: number | null;
  configuredWeight: number;
  effectiveWeight: number;
  eligibleCount: number;
  explanation: string;
}

export interface KpiResult {
  score: number;
  components: KpiComponent[];
}
