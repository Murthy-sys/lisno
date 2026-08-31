import type { KpiTask } from "../contracts/domain.js";
import type {
  DashboardFactorDistributionItem,
  DashboardProjectRisk,
  DashboardRatio,
  DashboardRiskFactor,
  DashboardRiskFactorKind,
  DashboardRiskLevel,
  DashboardRiskReasonCode,
  DashboardWeightedProgress
} from "../contracts/super-admin-dashboard.js";
import { calculateTaskRisk } from "./risk.js";

const RISK_RANK: Readonly<Record<DashboardRiskLevel, number>> = {
  gray: 0,
  green: 1,
  yellow: 2,
  red: 3
};

export function dashboardRatio(
  numerator: number,
  denominator: number
): DashboardRatio {
  assertSafeNonNegativeInteger(numerator, "Ratio numerator");
  assertSafeNonNegativeInteger(denominator, "Ratio denominator");
  return {
    numerator,
    denominator,
    rateBps: denominator === 0
      ? null
      : Math.round((numerator / denominator) * 10_000)
  };
}

export interface DashboardProgressTask {
  status: "open" | "in_progress" | "completed";
  progress: number;
  plannedEffort: number | null;
  fallbackEffort: number;
}

export function dashboardWeightedProgress(
  tasks: readonly DashboardProgressTask[]
): DashboardWeightedProgress {
  let numerator = 0;
  let denominator = 0;
  let fallbackTaskCount = 0;
  for (const task of tasks) {
    const progress = task.status === "completed" ? 100 : task.progress;
    if (!Number.isSafeInteger(progress) || progress < 0 || progress > 100) {
      throw new TypeError("Task progress must be an integer from 0 through 100.");
    }
    const persistedEffort = task.plannedEffort;
    const usesFallback =
      persistedEffort === null || !Number.isFinite(persistedEffort) || persistedEffort <= 0;
    const effort = usesFallback ? task.fallbackEffort : persistedEffort;
    if (!Number.isSafeInteger(effort) || effort <= 0) {
      throw new TypeError("Task planned effort must be a positive safe integer.");
    }
    if (usesFallback) fallbackTaskCount += 1;
    numerator = safeAdd(numerator, progress * effort, "Weighted progress numerator");
    denominator = safeAdd(denominator, 100 * effort, "Weighted progress denominator");
  }
  return {
    ...dashboardRatio(numerator, denominator),
    fallbackTaskCount
  };
}

export interface DashboardTaskRiskInput {
  task: KpiTask & { id: string; projectId: string };
  drillDownTarget: string;
}

export function dashboardTaskRiskFactor(
  input: DashboardTaskRiskInput,
  observedAt: Date
): DashboardRiskFactor | null {
  const result = calculateTaskRisk(input.task, observedAt);
  // Historical late completion is reported as delivery performance, not a
  // current project-risk factor. The approved dashboard risk model evaluates
  // only incomplete task schedule signals.
  if (input.task.status === "completed") return null;
  if (result.level === "gray" || result.level === "green") return null;
  const reasonCode = taskReasonCode(result.reason);
  return riskFactor({
    kind: "schedule",
    level: result.level,
    reasonCode,
    reason: result.reason,
    entityType: "task",
    entityId: input.task.id,
    observedValue: result.forecastCompletion ?? input.task.progress,
    threshold: reasonCode === "task_due_soon"
      ? "2 calendar days"
      : reasonCode === "task_low_schedule_buffer"
        ? "20 percentage points"
        : input.task.currentDeadlineAt,
    drillDownTarget: input.drillDownTarget
  });
}

export interface RiskFactorInput {
  kind: DashboardRiskFactorKind;
  level: Exclude<DashboardRiskLevel, "gray">;
  reasonCode: DashboardRiskReasonCode;
  reason: string;
  entityType: DashboardRiskFactor["source"]["entityType"];
  entityId: string;
  observedValue: DashboardRiskFactor["observedValue"];
  threshold: DashboardRiskFactor["threshold"];
  drillDownTarget: string;
}

export function riskFactor(input: RiskFactorInput): DashboardRiskFactor {
  if (!input.entityId.trim() || !input.drillDownTarget.startsWith("/")) {
    throw new TypeError("Risk factors require safe source and drill-down identity.");
  }
  return {
    kind: input.kind,
    level: input.level,
    reasonCode: input.reasonCode,
    reason: input.reason,
    source: { entityType: input.entityType, entityId: input.entityId },
    observedValue: input.observedValue,
    threshold: input.threshold,
    drillDownTarget: input.drillDownTarget
  };
}

export function financeRiskFactors(input: {
  projectId: string;
  projectCompleted: boolean;
  costBudgetPaise: number;
  recordedCostPaise: number;
}): DashboardRiskFactor[] {
  assertSafeNonNegativeInteger(input.costBudgetPaise, "Cost budget");
  assertSafeNonNegativeInteger(input.recordedCostPaise, "Recorded cost");
  const target = `/finance/projects/${encodeURIComponent(input.projectId)}`;
  if (input.recordedCostPaise > input.costBudgetPaise) {
    return [riskFactor({
      kind: "finance",
      level: "red",
      reasonCode: "cost_budget_exceeded",
      reason: "Recorded project costs exceed the approved cost budget.",
      entityType: "project",
      entityId: input.projectId,
      observedValue: input.recordedCostPaise,
      threshold: input.costBudgetPaise,
      drillDownTarget: target
    })];
  }
  if (
    !input.projectCompleted &&
    input.costBudgetPaise > 0 &&
    input.recordedCostPaise * 10 >= input.costBudgetPaise * 9
  ) {
    return [riskFactor({
      kind: "finance",
      level: "yellow",
      reasonCode: "cost_budget_headroom_low",
      reason: "Less than 10% of the approved cost budget remains.",
      entityType: "project",
      entityId: input.projectId,
      observedValue: input.costBudgetPaise - input.recordedCostPaise,
      threshold: Math.floor(input.costBudgetPaise / 10),
      drillDownTarget: target
    })];
  }
  return [];
}

export function overallDashboardRisk(
  factors: readonly DashboardRiskFactor[],
  hasEligibleSignal = false
): DashboardProjectRisk {
  const sorted = [...factors].sort(compareFactors);
  return {
    level: sorted[0]?.level ?? (hasEligibleSignal ? "green" : "gray"),
    factors: sorted
  };
}

export function dashboardFactorDistribution(
  projectFactors: readonly { projectId: string; factors: readonly DashboardRiskFactor[] }[]
): DashboardFactorDistributionItem[] {
  const grouped = new Map<string, {
    kind: DashboardRiskFactorKind;
    level: Exclude<DashboardRiskLevel, "gray">;
    reasonCode: DashboardRiskReasonCode;
    occurrences: number;
    projectIds: Set<string>;
  }>();
  for (const project of projectFactors) {
    for (const factor of project.factors) {
      const key = `${factor.kind}:${factor.level}:${factor.reasonCode}`;
      const current = grouped.get(key) ?? {
        kind: factor.kind,
        level: factor.level,
        reasonCode: factor.reasonCode,
        occurrences: 0,
        projectIds: new Set<string>()
      };
      current.occurrences += 1;
      current.projectIds.add(project.projectId);
      grouped.set(key, current);
    }
  }
  return [...grouped.values()].map((value) => ({
    kind: value.kind,
    level: value.level,
    reasonCode: value.reasonCode,
    occurrenceCount: value.occurrences,
    projectCount: value.projectIds.size
  })).sort((left, right) =>
    RISK_RANK[right.level] - RISK_RANK[left.level] ||
    right.projectCount - left.projectCount ||
    left.reasonCode.localeCompare(right.reasonCode)
  );
}

export function compareDashboardRiskLevels(
  left: DashboardRiskLevel,
  right: DashboardRiskLevel
): number {
  return RISK_RANK[left] - RISK_RANK[right];
}

function compareFactors(left: DashboardRiskFactor, right: DashboardRiskFactor): number {
  return RISK_RANK[right.level] - RISK_RANK[left.level] ||
    left.kind.localeCompare(right.kind) ||
    left.reasonCode.localeCompare(right.reasonCode) ||
    left.source.entityId.localeCompare(right.source.entityId);
}

function taskReasonCode(reason: string): DashboardRiskReasonCode {
  switch (reason) {
    case "Task is overdue.": return "task_overdue";
    case "Task is forecast to finish after its deadline.": return "task_forecast_late";
    case "Task is due within two calendar days.": return "task_due_soon";
    case "Task is blocked.": return "task_blocked";
    case "Task is behind its expected schedule.": return "task_behind_schedule";
    case "Task has less than a 20 percentage-point schedule buffer.":
      return "task_low_schedule_buffer";
    default:
      throw new TypeError(`Unsupported task risk reason: ${reason}`);
  }
}

function assertSafeNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new TypeError(`${label} exceeds the supported reporting range.`);
  }
  return result;
}
