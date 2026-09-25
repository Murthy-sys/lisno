import { ROLE_LABELS, type WorkerRole } from "../../../contracts/authorization";
import {
  DASHBOARD_COUNT_COMPARISON_METRIC_IDS,
  DASHBOARD_RISK_LEVELS,
  type DashboardCountComparisonMetricId,
  type DashboardDataQuality,
  type DashboardOverview,
  type DashboardResponsePeriodDays,
  type DashboardRiskLevel
} from "./contract";
import {
  DASHBOARD_UNAVAILABLE_LABEL,
  formatDashboardBps,
  formatDashboardComparisonChange,
  formatDashboardCount,
  formatDashboardDays,
  formatDashboardPaise,
  formatDashboardRange,
  formatDashboardSignedCount,
  formatDashboardTimestamp,
  humanizeDashboardKey
} from "./formatters";

export type DashboardValueUnit = "count" | "paise" | "basis_points" | "days";
export type DashboardTimeBasis = "snapshot" | "event_window" | "current_state" | "utc_day";

export interface DashboardValueView {
  readonly id: string;
  readonly label: string;
  readonly value: number | null;
  readonly displayValue: string;
  readonly unit: DashboardValueUnit;
  readonly timeBasis: DashboardTimeBasis;
  readonly available: boolean;
  readonly unavailableReason: string | null;
}

export interface DashboardHeroMetricView {
  readonly id: DashboardCountComparisonMetricId;
  readonly label: string;
  readonly shortLabel: string;
  readonly unit: "count";
  readonly timeBasis: "event_window";
  readonly current: number | null;
  readonly previous: number | null;
  readonly delta: number | null;
  readonly changeBps: number | null;
  readonly changeKind: "percentage" | "new" | "no_change" | "unavailable";
  readonly currentAvailable: boolean;
  readonly previousAvailable: boolean;
  readonly currentDisplay: string;
  readonly previousDisplay: string;
  readonly deltaDisplay: string;
  readonly changeDisplay: string;
  readonly unavailableReason: string | null;
}

export interface DashboardTrendPointView {
  readonly id: string;
  readonly dayIndex: number;
  readonly currentDate: string;
  readonly previousDate: string;
  readonly current: number | null;
  readonly previous: number | null;
}

export interface DashboardTrendSeriesView {
  readonly metricId: DashboardCountComparisonMetricId;
  readonly label: string;
  readonly unit: "count";
  readonly available: boolean;
  readonly points: readonly DashboardTrendPointView[];
}

export interface DashboardFactRailView {
  readonly id: "projects" | "clients";
  readonly title: string;
  readonly values: readonly DashboardValueView[];
}

export interface DashboardDistributionValueView extends DashboardValueView {
  readonly colorKey?: DashboardRiskLevel | undefined;
}

export interface DashboardRiskView {
  readonly available: boolean;
  readonly distribution: readonly DashboardDistributionValueView[];
  readonly factors: DashboardOverview["risk"]["factorDistribution"];
  readonly topProjectsAvailable: boolean;
  readonly topProjects: DashboardOverview["risk"]["topProjects"];
  readonly topProjectsUnavailableReason: string | null;
  readonly unavailableReason: string | null;
}

export interface DashboardDeliveryModuleView {
  readonly id: "estimation" | "design" | "procurement" | "execution";
  readonly label: string;
  readonly available: boolean;
  readonly coverage: readonly DashboardValueView[];
  readonly stages: readonly DashboardValueView[];
  readonly supportingValues: readonly DashboardValueView[];
}

export interface DashboardCapitalView {
  readonly approvedContractTotal: DashboardValueView;
  readonly approvedGst: DashboardValueView;
  readonly approvedNetRevenue: DashboardValueView;
  readonly targetProfit: DashboardValueView;
  readonly costBudget: DashboardValueView;
  readonly directSpend: DashboardValueView;
  readonly recordedCost: DashboardValueView;
  readonly remainingBudget: DashboardValueView;
  readonly currentProfit: DashboardValueView;
  readonly currentMargin: DashboardValueView;
  readonly costComposition: readonly DashboardValueView[];
  readonly exceptions: readonly DashboardValueView[];
}

export interface DashboardRoleDistributionView extends DashboardDistributionValueView {
  readonly role: WorkerRole;
}

export interface DashboardPeopleView {
  readonly workforce: readonly DashboardValueView[];
  readonly roleDistribution: readonly DashboardRoleDistributionView[];
  readonly governanceQueue: readonly DashboardValueView[];
  readonly deliveryExceptions: readonly DashboardValueView[];
}

export interface DashboardValueGroupView {
  readonly id: string;
  readonly title: string;
  readonly values: readonly DashboardValueView[];
}

export interface DashboardViewModel {
  readonly overview: DashboardOverview;
  readonly period: DashboardResponsePeriodDays;
  readonly range: {
    readonly timezone: "UTC";
    readonly observedAt: string;
    readonly observedLabel: string;
    readonly currentLabel: string;
    readonly previousLabel: string;
    readonly partialFinalDay: boolean;
  };
  readonly dataQuality: {
    readonly status: "complete" | "partial";
    readonly label: string;
    readonly summary: string;
    readonly totalIssueCount: number;
    readonly unavailableMetricCount: number;
    readonly unavailableMetricKeys: readonly string[];
  };
  readonly projectFacts: DashboardFactRailView;
  readonly clientFacts: DashboardFactRailView;
  readonly heroCountMetrics: readonly DashboardHeroMetricView[];
  readonly trendByMetric: Readonly<Record<DashboardCountComparisonMetricId, DashboardTrendSeriesView>>;
  readonly lifecycle: readonly DashboardDistributionValueView[];
  readonly risk: DashboardRiskView;
  readonly delivery: readonly DashboardDeliveryModuleView[];
  readonly capital: DashboardCapitalView;
  readonly people: DashboardPeopleView;
  readonly allValues: readonly DashboardValueGroupView[];
  readonly hasAvailableData: boolean;
  readonly isAllZero: boolean;
}

const HERO_LABELS = {
  projects_created: { label: "Projects created", shortLabel: "Created" },
  clients_created: { label: "Client accounts created", shortLabel: "Clients" },
  projects_completed: { label: "Projects completed", shortLabel: "Completed" },
  execution_tasks_completed: { label: "Execution tasks completed", shortLabel: "Tasks" },
  estimates_approved: { label: "Estimates approved", shortLabel: "Estimates" },
  design_plans_approved: { label: "Design plans approved", shortLabel: "Designs" }
} as const satisfies Record<DashboardCountComparisonMetricId, { label: string; shortLabel: string }>;

const BUCKET_FIELD = {
  projects_created: "projectsCreated",
  clients_created: "clientsCreated",
  projects_completed: "projectsCompleted",
  execution_tasks_completed: "executionTasksCompleted",
  estimates_approved: "estimatesApproved",
  design_plans_approved: "designPlansApproved"
} as const satisfies Record<DashboardCountComparisonMetricId, keyof DashboardOverview["comparison"]["currentBuckets"][number]>;

function matchesUnavailableKey(unavailableKey: string, metricKey: string): boolean {
  return unavailableKey === metricKey || metricKey.startsWith(`${unavailableKey}.`);
}

export function isDashboardMetricUnavailable(
  dataQuality: DashboardDataQuality,
  metricKey: string
): boolean {
  return dataQuality.unavailableMetricKeys.some((key) => matchesUnavailableKey(key, metricKey));
}

export function dashboardUnavailableReason(
  dataQuality: DashboardDataQuality,
  metricKey: string,
  fallback = "Authoritative data is unavailable for this metric."
): string {
  return dataQuality.issues.find((issue) => matchesUnavailableKey(issue.metricKey, metricKey))?.message ?? fallback;
}

function formatValue(value: number | null, unit: DashboardValueUnit): string {
  if (unit === "paise") return formatDashboardPaise(value);
  if (unit === "basis_points") return formatDashboardBps(value);
  if (unit === "days") return formatDashboardDays(value);
  return formatDashboardCount(value);
}

interface ValueInput {
  readonly id: string;
  readonly label: string;
  readonly value: number | null;
  readonly unit?: DashboardValueUnit;
  readonly timeBasis?: DashboardTimeBasis;
  readonly dataQuality: DashboardDataQuality;
  readonly metricKey?: string;
  readonly explicitlyAvailable?: boolean | undefined;
  readonly unavailableReason?: string | null | undefined;
}

function valueView(input: ValueInput): DashboardValueView {
  const qualityUnavailable = input.metricKey
    ? isDashboardMetricUnavailable(input.dataQuality, input.metricKey)
    : false;
  const available = input.value !== null && input.explicitlyAvailable !== false && !qualityUnavailable;
  const unit = input.unit ?? "count";
  const value = available ? input.value : null;
  return {
    id: input.id,
    label: input.label,
    value,
    displayValue: formatValue(value, unit),
    unit,
    timeBasis: input.timeBasis ?? "current_state",
    available,
    unavailableReason: available
      ? null
      : input.unavailableReason ?? (
        input.metricKey
          ? dashboardUnavailableReason(input.dataQuality, input.metricKey)
          : "This value is not available."
      )
  };
}

function countValue(
  dataQuality: DashboardDataQuality,
  id: string,
  label: string,
  value: number | null,
  metricKey: string,
  timeBasis: DashboardTimeBasis = "current_state",
  explicitlyAvailable?: boolean,
  unavailableReason?: string | null
): DashboardValueView {
  return valueView({ id, label, value, dataQuality, metricKey, timeBasis, explicitlyAvailable, unavailableReason });
}

function paiseValue(
  dataQuality: DashboardDataQuality,
  id: string,
  label: string,
  value: number | null,
  metricKey: string,
  timeBasis: DashboardTimeBasis = "current_state"
): DashboardValueView {
  return valueView({ id, label, value, unit: "paise", dataQuality, metricKey, timeBasis });
}

function basisPointValue(
  dataQuality: DashboardDataQuality,
  id: string,
  label: string,
  value: number | null,
  metricKey: string,
  explicitlyAvailable?: boolean,
  unavailableReason?: string | null
): DashboardValueView {
  return valueView({
    id,
    label,
    value,
    unit: "basis_points",
    dataQuality,
    metricKey,
    explicitlyAvailable,
    unavailableReason
  });
}

function dayValue(
  dataQuality: DashboardDataQuality,
  id: string,
  label: string,
  value: number | null,
  metricKey: string
): DashboardValueView {
  return valueView({ id, label, value, unit: "days", dataQuality, metricKey });
}

function buildHeroMetrics(overview: DashboardOverview): readonly DashboardHeroMetricView[] {
  return DASHBOARD_COUNT_COMPARISON_METRIC_IDS.map((id) => {
    const metric = overview.comparison.metrics[id];
    const metricKey = `comparison.${id}`;
    const qualityUnavailable = isDashboardMetricUnavailable(overview.dataQuality, metricKey);
    const currentAvailable = metric.currentStatus === "available" && metric.current !== null && !qualityUnavailable;
    const previousAvailable = metric.previousStatus === "available" && metric.previous !== null && !qualityUnavailable;
    const comparable = currentAvailable && previousAvailable;
    const reason = qualityUnavailable
      ? dashboardUnavailableReason(overview.dataQuality, metricKey)
      : metric.currentUnavailableReason ?? metric.previousUnavailableReason;
    return {
      id,
      ...HERO_LABELS[id],
      unit: "count" as const,
      timeBasis: "event_window" as const,
      current: currentAvailable ? metric.current : null,
      previous: previousAvailable ? metric.previous : null,
      delta: comparable ? metric.delta : null,
      changeBps: comparable ? metric.changeBps : null,
      changeKind: qualityUnavailable ? "unavailable" as const : metric.changeKind,
      currentAvailable,
      previousAvailable,
      currentDisplay: formatDashboardCount(currentAvailable ? metric.current : null),
      previousDisplay: formatDashboardCount(previousAvailable ? metric.previous : null),
      deltaDisplay: comparable ? formatDashboardSignedCount(metric.delta) : DASHBOARD_UNAVAILABLE_LABEL,
      changeDisplay: qualityUnavailable ? DASHBOARD_UNAVAILABLE_LABEL : formatDashboardComparisonChange(metric),
      unavailableReason: currentAvailable && previousAvailable ? null : reason ?? "Comparison data is unavailable."
    };
  });
}

function buildTrendSeries(
  overview: DashboardOverview,
  heroMetrics: readonly DashboardHeroMetricView[]
): Readonly<Record<DashboardCountComparisonMetricId, DashboardTrendSeriesView>> {
  const previousByIndex = new Map(
    overview.comparison.previousBuckets.map((bucket) => [bucket.dayIndex, bucket] as const)
  );
  return Object.fromEntries(heroMetrics.map((metric) => {
    const field = BUCKET_FIELD[metric.id];
    const points = overview.comparison.currentBuckets.map((currentBucket) => {
      const previousBucket = previousByIndex.get(currentBucket.dayIndex)!;
      const currentValue = currentBucket[field];
      const previousValue = previousBucket[field];
      return {
        id: `${metric.id}:${currentBucket.dayIndex}`,
        dayIndex: currentBucket.dayIndex,
        currentDate: currentBucket.date,
        previousDate: previousBucket.date,
        current: metric.currentAvailable && typeof currentValue === "number" ? currentValue : null,
        previous: metric.previousAvailable && typeof previousValue === "number" ? previousValue : null
      };
    });
    return [metric.id, {
      metricId: metric.id,
      label: metric.label,
      unit: "count" as const,
      available: metric.currentAvailable || metric.previousAvailable,
      points
    }];
  })) as unknown as Readonly<Record<DashboardCountComparisonMetricId, DashboardTrendSeriesView>>;
}

function buildProjectFacts(overview: DashboardOverview): DashboardFactRailView {
  const quality = overview.dataQuality;
  return {
    id: "projects",
    title: "Projects",
    values: [
      countValue(quality, "projects.total", "Total", overview.projects.total, "projects.total", "snapshot"),
      countValue(quality, "projects.active", "Active", overview.projects.active, "projects.active", "snapshot"),
      countValue(quality, "projects.atRisk", "At risk", overview.projects.atRisk, "projects.atRisk", "snapshot"),
      countValue(quality, "projects.liveOverdue", "Live overdue", overview.projects.liveOverdue, "projects.liveOverdue", "snapshot"),
      countValue(quality, "projects.createdInPeriod", "Created in period", overview.projects.createdInPeriod, "projects.createdInPeriod", "event_window")
    ]
  };
}

function buildClientFacts(overview: DashboardOverview): DashboardFactRailView {
  const quality = overview.dataQuality;
  const accountsAvailable = overview.clients.accountsStatus === "available";
  const relationshipsAvailable = overview.clients.relationshipsStatus === "available";
  return {
    id: "clients",
    title: "Clients",
    values: [
      countValue(quality, "clients.registeredAccounts", "Registered", overview.clients.registeredAccounts, "clients.registeredAccounts", "snapshot", accountsAvailable, overview.clients.accountsUnavailableReason),
      countValue(quality, "clients.activeAccounts", "Active", overview.clients.activeAccounts, "clients.activeAccounts", "snapshot", accountsAvailable, overview.clients.accountsUnavailableReason),
      countValue(quality, "clients.clientsWithProjects", "Project linked", overview.clients.clientsWithProjects, "clients.clientsWithProjects", "snapshot", relationshipsAvailable, overview.clients.relationshipsUnavailableReason),
      countValue(quality, "clients.accountsCreatedInPeriod", "Created in period", overview.clients.accountsCreatedInPeriod, "clients.accountsCreatedInPeriod", "event_window", accountsAvailable, overview.clients.accountsUnavailableReason)
    ]
  };
}

function buildLifecycle(overview: DashboardOverview): readonly DashboardDistributionValueView[] {
  const values = [
    ["planning", "Planning", overview.projects.planning],
    ["active", "Active", overview.projects.active],
    ["onHold", "On hold", overview.projects.onHold],
    ["completed", "Completed", overview.projects.completed]
  ] as const;
  return values.map(([id, label, value]) => ({
    ...countValue(overview.dataQuality, `lifecycle.${id}`, label, value, `projects.${id}`, "snapshot")
  }));
}

function buildRisk(overview: DashboardOverview): DashboardRiskView {
  const metricKey = "risk.projectDistribution";
  const available = !isDashboardMetricUnavailable(overview.dataQuality, metricKey);
  const topProjectsMetricKey = "risk.topProjects";
  const topProjectsAvailable = !isDashboardMetricUnavailable(
    overview.dataQuality,
    topProjectsMetricKey
  );
  const distribution = DASHBOARD_RISK_LEVELS.map((level) => ({
    ...countValue(
      overview.dataQuality,
      `risk.${level}`,
      level === "gray" ? "Not tracked" : `${humanizeDashboardKey(level)} risk`,
      overview.risk.projectDistribution[level],
      metricKey,
      "snapshot"
    ),
    colorKey: level
  }));
  return {
    available,
    distribution,
    factors: available && !isDashboardMetricUnavailable(overview.dataQuality, "risk.factorDistribution")
      ? overview.risk.factorDistribution
      : [],
    topProjectsAvailable,
    topProjects: topProjectsAvailable ? overview.risk.topProjects : [],
    topProjectsUnavailableReason: topProjectsAvailable
      ? null
      : dashboardUnavailableReason(overview.dataQuality, topProjectsMetricKey),
    unavailableReason: available ? null : dashboardUnavailableReason(overview.dataQuality, metricKey)
  };
}

function coverageValues(
  overview: DashboardOverview,
  module: "estimation" | "design" | "procurement"
): readonly DashboardValueView[] {
  const source = overview[module];
  return [
    countValue(overview.dataQuality, `${module}.eligibleProjects`, "Eligible projects", source.eligibleProjects, `${module}.eligibleProjects`, "snapshot"),
    countValue(overview.dataQuality, `${module}.trackedProjects`, "Tracked projects", source.trackedProjects, `${module}.trackedProjects`, "snapshot"),
    countValue(overview.dataQuality, `${module}.unavailableProjects`, "Unavailable projects", source.unavailableProjects, `${module}.unavailableProjects`, "snapshot")
  ];
}

function moduleAvailable(values: readonly DashboardValueView[]): boolean {
  return values.some((value) => value.available);
}

function buildDelivery(overview: DashboardOverview): readonly DashboardDeliveryModuleView[] {
  const quality = overview.dataQuality;
  const estimationStages = [
    countValue(quality, "estimation.noEstimate", "No estimate", overview.estimation.noEstimate, "estimation.noEstimate"),
    countValue(quality, "estimation.draftInternal", "Draft internal", overview.estimation.draftInternal, "estimation.draftInternal"),
    countValue(quality, "estimation.readyToSend", "Ready to send", overview.estimation.readyToSend, "estimation.readyToSend"),
    countValue(quality, "estimation.awaitingClient", "Awaiting client", overview.estimation.awaitingClient, "estimation.awaitingClient"),
    countValue(quality, "estimation.changesRequested", "Changes requested", overview.estimation.changesRequested, "estimation.changesRequested"),
    countValue(quality, "estimation.clientApproved", "Client approved", overview.estimation.clientApproved, "estimation.clientApproved")
  ];
  const designStages = [
    countValue(quality, "design.pendingAssignment", "Pending assignment", overview.design.pendingAssignment, "design.pendingAssignment"),
    countValue(quality, "design.assigned", "Assigned", overview.design.assigned, "design.assigned"),
    countValue(quality, "design.inProgress", "In progress", overview.design.inProgress, "design.inProgress"),
    countValue(quality, "design.readyForClient", "Ready for client", overview.design.readyForClient, "design.readyForClient"),
    countValue(quality, "design.changesRequested", "Changes requested", overview.design.changesRequested, "design.changesRequested"),
    countValue(quality, "design.approved", "Approved", overview.design.approved, "design.approved")
  ];
  const procurementStages = [
    countValue(quality, "procurement.notStarted", "Not started", overview.procurement.notStarted, "procurement.notStarted"),
    countValue(quality, "procurement.open", "Open", overview.procurement.open, "procurement.open"),
    countValue(quality, "procurement.inProgress", "In progress", overview.procurement.inProgress, "procurement.inProgress"),
    countValue(quality, "procurement.completed", "Completed", overview.procurement.completed, "procurement.completed")
  ];
  const executionStages = [
    countValue(quality, "execution.open", "Open", overview.execution.open, "execution.open"),
    countValue(quality, "execution.inProgress", "In progress", overview.execution.inProgress, "execution.inProgress"),
    countValue(quality, "execution.completed", "Completed", overview.execution.completed, "execution.completed"),
    countValue(quality, "execution.overdue", "Overdue", overview.execution.overdue, "execution.overdue"),
    countValue(quality, "execution.unassigned", "Unassigned", overview.execution.unassigned, "execution.unassigned")
  ];
  const modules: readonly DashboardDeliveryModuleView[] = [
    {
      id: "estimation",
      label: "Estimation",
      coverage: coverageValues(overview, "estimation"),
      stages: estimationStages,
      supportingValues: [
        dayValue(quality, "estimation.medianWaitingAgeDays", "Median waiting age", overview.estimation.medianWaitingAgeDays, "estimation.medianWaitingAgeDays"),
        dayValue(quality, "estimation.oldestWaitingAgeDays", "Oldest waiting age", overview.estimation.oldestWaitingAgeDays, "estimation.oldestWaitingAgeDays")
      ],
      available: moduleAvailable(estimationStages)
    },
    {
      id: "design",
      label: "Design",
      coverage: coverageValues(overview, "design"),
      stages: designStages,
      supportingValues: [
        basisPointValue(quality, "design.approvalRate", "Approval rate", overview.design.approvalRate.rateBps, "design.approvalRate"),
        dayValue(quality, "design.oldestPendingReviewAgeDays", "Oldest pending review", overview.design.oldestPendingReviewAgeDays, "design.oldestPendingReviewAgeDays"),
        countValue(quality, "design.failedDeliveryCount", "Failed deliveries", overview.design.failedDeliveryCount, "design.failedDeliveryCount"),
        countValue(quality, "design.disabledDeliveryCount", "Disabled deliveries", overview.design.disabledDeliveryCount, "design.disabledDeliveryCount")
      ],
      available: moduleAvailable(designStages)
    },
    {
      id: "procurement",
      label: "Procurement",
      coverage: coverageValues(overview, "procurement"),
      stages: procurementStages,
      supportingValues: [
        paiseValue(quality, "procurement.plannedAmountPaise", "Planned amount", overview.procurement.plannedAmountPaise, "procurement.approvedAmountPaise"),
        paiseValue(quality, "procurement.postedSpendPaise", "Posted spend", overview.procurement.postedSpendPaise, "procurement.postedSpendPaise"),
        paiseValue(quality, "procurement.variancePaise", "Variance", overview.procurement.variancePaise, "procurement.variancePaise"),
        basisPointValue(quality, "procurement.averageProgress", "Average progress", overview.procurement.averageProgress.rateBps, "procurement.averageProgress")
      ],
      available: moduleAvailable(procurementStages)
    },
    {
      id: "execution",
      label: "Execution",
      coverage: [
        countValue(quality, "execution.total", "Total tasks", overview.execution.total, "execution.total", "snapshot"),
        countValue(quality, "execution.completedInPeriod", "Completed in period", overview.execution.completedInPeriod, "execution.completedInPeriod", "event_window")
      ],
      stages: executionStages,
      supportingValues: [
        countValue(quality, "execution.overdueUnassigned", "Overdue and unassigned", overview.execution.overdueUnassigned, "execution.overdueUnassigned"),
        basisPointValue(quality, "execution.weightedProgress", "Weighted progress", overview.execution.weightedProgress.rateBps, "execution.weightedProgress"),
        countValue(quality, "execution.fallbackTaskCount", "Fallback-weight tasks", overview.execution.weightedProgress.fallbackTaskCount, "execution.weightedProgress")
      ],
      available: moduleAvailable(executionStages)
    }
  ];
  return modules;
}

function buildCapital(overview: DashboardOverview): DashboardCapitalView {
  const quality = overview.dataQuality;
  return {
    approvedContractTotal: paiseValue(quality, "finance.approvedContractTotalPaise", "Approved contract total, including GST", overview.finance.approvedContractTotalPaise, "finance.approvedContractTotalPaise"),
    approvedGst: paiseValue(quality, "finance.approvedGstPaise", "GST", overview.finance.approvedGstPaise, "finance.approvedGstPaise"),
    approvedNetRevenue: paiseValue(quality, "finance.approvedSubtotalPaise", "Approved net revenue, excluding GST", overview.finance.approvedSubtotalPaise, "finance.approvedSubtotalPaise"),
    targetProfit: paiseValue(quality, "finance.targetProfitPaise", "Target profit", overview.finance.targetProfitPaise, "finance.targetProfitPaise"),
    costBudget: paiseValue(quality, "finance.costBudgetPaise", "Cost budget", overview.finance.costBudgetPaise, "finance.costBudgetPaise"),
    directSpend: paiseValue(quality, "finance.directSpendPaise", "Direct spend", overview.finance.directSpendPaise, "finance.directSpendPaise"),
    recordedCost: paiseValue(quality, "finance.recordedCostPaise", "Recorded cost", overview.finance.recordedCostPaise, "finance.recordedCostPaise"),
    remainingBudget: paiseValue(quality, "finance.remainingBudgetPaise", "Remaining budget", overview.finance.remainingBudgetPaise, "finance.remainingBudgetPaise"),
    currentProfit: paiseValue(quality, "finance.currentProfitPaise", "Current profit", overview.finance.currentProfitPaise, "finance.currentProfitPaise"),
    currentMargin: basisPointValue(quality, "finance.currentMarginBps", "Current margin", overview.finance.currentMarginBps, "finance.currentMarginBps"),
    costComposition: [
      paiseValue(quality, "finance.procurementCostPaise", "Procurement", overview.finance.procurementCostPaise, "finance.procurementCostPaise"),
      paiseValue(quality, "finance.employeePaymentPaise", "Employee payments", overview.finance.employeePaymentPaise, "finance.employeePaymentPaise"),
      paiseValue(quality, "finance.otherExpensePaise", "Other expenses", overview.finance.otherExpensePaise, "finance.otherExpensePaise"),
      paiseValue(quality, "finance.overheadPaise", "Overheads", overview.finance.overheadPaise, "finance.overheadPaise")
    ],
    exceptions: [
      countValue(quality, "finance.overBudgetProjectCount", "Over-budget projects", overview.finance.overBudgetProjectCount, "finance.overBudgetProjectCount"),
      countValue(quality, "finance.overdueProjectCount", "Overdue projects", overview.finance.overdueProjectCount, "finance.overdueProjectCount"),
      countValue(quality, "finance.lateCompletedProjectCount", "Late completions", overview.finance.lateCompletedProjectCount, "finance.lateCompletedProjectCount"),
      countValue(quality, "finance.overdueTaskCount", "Overdue tasks", overview.finance.overdueTaskCount, "finance.overdueTaskCount")
    ]
  };
}

function buildPeople(overview: DashboardOverview): DashboardPeopleView {
  const quality = overview.dataQuality;
  const capacityReason = overview.workforce.capacityAvailable
    ? null
    : "Workforce capacity data is unavailable.";
  return {
    workforce: [
      countValue(quality, "workforce.activeWorkers", "Active workers", overview.workforce.activeWorkers, "workforce.activeWorkers", "snapshot"),
      countValue(quality, "workforce.assignedWorkers", "Assigned workers", overview.workforce.assignedWorkers, "workforce.assignedWorkers", "snapshot"),
      countValue(quality, "workforce.unassignedWorkers", "Unassigned workers", overview.workforce.unassignedWorkers, "workforce.unassignedWorkers", "snapshot"),
      countValue(quality, "workforce.activeAssignedTaskCount", "Active assigned tasks", overview.workforce.activeAssignedTaskCount, "workforce.activeAssignedTaskCount"),
      countValue(quality, "workforce.activeUnassignedTaskCount", "Active unassigned tasks", overview.workforce.activeUnassignedTaskCount, "workforce.activeUnassignedTaskCount"),
      countValue(quality, "workforce.completedInPeriodTaskCount", "Completed in period", overview.workforce.completedInPeriodTaskCount, "workforce.completedInPeriodTaskCount", "event_window"),
      countValue(quality, "workforce.overCapacityWorkers", "Over-capacity workers", overview.workforce.overCapacityWorkers, "workforce.overCapacityWorkers", "snapshot", overview.workforce.capacityAvailable, capacityReason),
      countValue(quality, "workforce.inactiveAssigneeTaskCount", "Inactive-assignee tasks", overview.workforce.inactiveAssigneeTaskCount, "workforce.inactiveAssigneeTaskCount"),
      countValue(quality, "workforce.kpiEligibleWorkers", "KPI eligible", overview.workforce.kpiEligibleWorkers, "workforce.kpiEligibleWorkers", "snapshot"),
      countValue(quality, "workforce.kpiUnavailableWorkers", "KPI unavailable", overview.workforce.kpiUnavailableWorkers, "workforce.kpiUnavailableWorkers", "snapshot"),
      basisPointValue(quality, "workforce.averageKpi", "Average KPI", overview.workforce.averageKpi.rateBps, "workforce.averageKpi")
    ],
    roleDistribution: overview.workforce.roleDistribution.map(({ role, workerCount }) => ({
      ...countValue(quality, `workforce.role.${role}`, ROLE_LABELS[role], workerCount, "workforce.roleDistribution", "snapshot"),
      role
    })),
    governanceQueue: [
      countValue(quality, "governance.pendingInvitations", "Pending invitations", overview.governance.pendingInvitations, "governance.pendingInvitations"),
      countValue(quality, "governance.pendingAccessRequests", "Pending access requests", overview.governance.pendingAccessRequests, "governance.pendingAccessRequests"),
      countValue(quality, "governance.pendingClientResponses", "Pending client responses", overview.governance.pendingClientResponses, "governance.pendingClientResponses"),
      countValue(quality, "governance.pendingDesignResponses", "Pending design responses", overview.governance.pendingDesignResponses, "governance.pendingDesignResponses")
    ],
    deliveryExceptions: [
      countValue(quality, "governance.expiredInvitations", "Expired invitations", overview.governance.expiredInvitations, "governance.expiredInvitations"),
      countValue(quality, "governance.failedInvitationDeliveries", "Failed invitation deliveries", overview.governance.failedInvitationDeliveries, "governance.failedInvitationDeliveries"),
      countValue(quality, "governance.failedClientDeliveries", "Failed client deliveries", overview.governance.failedClientDeliveries, "governance.failedClientDeliveries"),
      countValue(quality, "governance.disabledClientDeliveries", "Disabled client deliveries", overview.governance.disabledClientDeliveries, "governance.disabledClientDeliveries"),
      countValue(quality, "governance.failedDesignDeliveries", "Failed design deliveries", overview.governance.failedDesignDeliveries, "governance.failedDesignDeliveries"),
      countValue(quality, "governance.disabledDesignDeliveries", "Disabled design deliveries", overview.governance.disabledDesignDeliveries, "governance.disabledDesignDeliveries")
    ]
  };
}

function comparisonValues(metrics: readonly DashboardHeroMetricView[]): readonly DashboardValueView[] {
  return metrics.flatMap((metric) => [
    {
      id: `comparison.${metric.id}.current`,
      label: `${metric.label} — current`,
      value: metric.current,
      displayValue: metric.currentDisplay,
      unit: "count" as const,
      timeBasis: "event_window" as const,
      available: metric.currentAvailable,
      unavailableReason: metric.currentAvailable ? null : metric.unavailableReason
    },
    {
      id: `comparison.${metric.id}.previous`,
      label: `${metric.label} — previous`,
      value: metric.previous,
      displayValue: metric.previousDisplay,
      unit: "count" as const,
      timeBasis: "event_window" as const,
      available: metric.previousAvailable,
      unavailableReason: metric.previousAvailable ? null : metric.unavailableReason
    },
    {
      id: `comparison.${metric.id}.delta`,
      label: `${metric.label} — absolute change`,
      value: metric.delta,
      displayValue: metric.deltaDisplay,
      unit: "count" as const,
      timeBasis: "event_window" as const,
      available: metric.delta !== null,
      unavailableReason: metric.delta !== null ? null : metric.unavailableReason
    },
    {
      id: `comparison.${metric.id}.change`,
      label: `${metric.label} — relative change`,
      value: metric.changeBps,
      displayValue: metric.changeDisplay,
      unit: "basis_points" as const,
      timeBasis: "event_window" as const,
      available: metric.changeKind !== "unavailable",
      unavailableReason: metric.changeKind !== "unavailable" ? null : metric.unavailableReason
    }
  ]);
}

function allAvailableValues(groups: readonly DashboardValueGroupView[]): readonly DashboardValueView[] {
  return groups.flatMap((group) => group.values).filter((value) => value.available);
}

export function buildDashboardViewModel(overview: DashboardOverview): DashboardViewModel {
  const heroCountMetrics = buildHeroMetrics(overview);
  const trendByMetric = buildTrendSeries(overview, heroCountMetrics);
  const projectFacts = buildProjectFacts(overview);
  const clientFacts = buildClientFacts(overview);
  const lifecycle = buildLifecycle(overview);
  const risk = buildRisk(overview);
  const delivery = buildDelivery(overview);
  const capital = buildCapital(overview);
  const people = buildPeople(overview);
  const capitalValues = [
    capital.approvedContractTotal,
    capital.approvedGst,
    capital.approvedNetRevenue,
    capital.targetProfit,
    capital.costBudget,
    capital.directSpend,
    capital.recordedCost,
    capital.remainingBudget,
    capital.currentProfit,
    capital.currentMargin,
    ...capital.costComposition,
    ...capital.exceptions
  ];
  const allValues: readonly DashboardValueGroupView[] = [
    { id: "projects", title: "Projects", values: [...projectFacts.values, ...lifecycle] },
    { id: "clients", title: "Clients", values: clientFacts.values },
    { id: "comparison", title: "Current and previous periods", values: comparisonValues(heroCountMetrics) },
    ...delivery.map((module) => ({
      id: module.id,
      title: module.label,
      values: [...module.coverage, ...module.stages, ...module.supportingValues]
    })),
    { id: "capital", title: "Capital", values: capitalValues },
    { id: "workforce", title: "Workforce", values: [...people.workforce, ...people.roleDistribution] },
    { id: "governance", title: "Governance", values: [...people.governanceQueue, ...people.deliveryExceptions] },
    { id: "risk", title: "Risk", values: risk.distribution }
  ];
  const availableValues = allAvailableValues(allValues);
  const availableNumericValues = availableValues.filter(
    (value): value is DashboardValueView & { readonly value: number } => value.value !== null
  );
  const unavailableMetricCount = overview.dataQuality.unavailableMetricKeys.length;
  const qualitySummary = overview.dataQuality.status === "complete"
    ? "All reported dashboard sources are available."
    : unavailableMetricCount > 0
      ? `${formatDashboardCount(unavailableMetricCount)} ${unavailableMetricCount === 1 ? "metric is" : "metrics are"} unavailable or partial.`
      : "Some dashboard data is partial.";

  return {
    overview,
    period: overview.period.days,
    range: {
      timezone: "UTC",
      observedAt: overview.observedAt,
      observedLabel: formatDashboardTimestamp(overview.observedAt),
      currentLabel: formatDashboardRange(overview.comparison.window.current.startAt, overview.comparison.window.current.endAt),
      previousLabel: formatDashboardRange(overview.comparison.window.previous.startAt, overview.comparison.window.previous.endAt),
      partialFinalDay: overview.comparison.window.partialFinalDay
    },
    dataQuality: {
      status: overview.dataQuality.status,
      label: overview.dataQuality.status === "complete" ? "Complete coverage" : "Partial coverage",
      summary: qualitySummary,
      totalIssueCount: overview.dataQuality.totalIssueCount,
      unavailableMetricCount,
      unavailableMetricKeys: overview.dataQuality.unavailableMetricKeys
    },
    projectFacts,
    clientFacts,
    heroCountMetrics,
    trendByMetric,
    lifecycle,
    risk,
    delivery,
    capital,
    people,
    allValues,
    hasAvailableData: availableValues.length > 0,
    isAllZero: availableNumericValues.length > 0
      && availableNumericValues.every((value) => value.value === 0)
  };
}
