import {
  CategoryBarChart,
  MeterChart,
  StackedBarChart,
  TimeSeriesChart,
  WaterfallChart,
  compactPaise,
  statusColor,
  type CategoryBarDatum,
  type ChartStatus,
  type StackedSegment
} from "../../../components/charts";
import { DashboardBreakdownDonut } from "./DashboardBreakdownDonut";
import { DashboardCategoryBarChart } from "./DashboardCategoryBarChart";
import { DashboardQueueChart } from "./DashboardQueueChart";
import { DashboardRiskFactorChart, type RiskFactorBarDatum } from "./DashboardRiskFactorChart";
import {
  dashboardMetricUnavailableReason,
  formatDashboardDate,
  formatDashboardRatio,
  formatDays,
  formatPaise,
  humanize,
  isDashboardMetricUnavailable,
  ratioDetail,
  workerRoleLabel
} from "./dashboardPresentation";
import type {
  DashboardDataQuality,
  DashboardRatio,
  DashboardRiskLevel,
  SuperAdminDashboardOverview
} from "./superAdminDashboardApi";

/*
 * Every chart on this dashboard is built here, from the same verified overview
 * payload the metric cards read.
 *
 * Two rules run through all of it. A metric the backend marked unavailable is
 * never plotted as a zero — the figure says so and shows the reason instead.
 * And risk keeps the reserved status scale in every form it appears in, so a
 * red bar always means red risk and never "series 8".
 */

/** The first unavailable key among `keys`, as a reason string, or undefined. */
export function suppressionReason(dataQuality: DashboardDataQuality, keys: string[]) {
  const key = keys.find((candidate) => isDashboardMetricUnavailable(dataQuality, candidate));
  return key ? dashboardMetricUnavailableReason(dataQuality, key) : undefined;
}

const riskStatus: Record<DashboardRiskLevel, ChartStatus> = {
  red: "critical",
  yellow: "warning",
  green: "good",
  gray: "neutral"
};

const riskLabel: Record<DashboardRiskLevel, string> = {
  red: "Red risk",
  yellow: "Yellow risk",
  green: "Clear",
  gray: "Not tracked"
};

const ratioShare = (ratio: DashboardRatio) =>
  ratio.rateBps === null ? null : ratio.rateBps / 10_000;

const trendLabels = (data: SuperAdminDashboardOverview) =>
  data.trends.map((bucket) => formatDashboardDate(bucket.date));

const periodNote = (data: SuperAdminDashboardOverview) =>
  `${formatDashboardDate(data.period.startAt)} – ${formatDashboardDate(data.period.endAt)}`;

/* ---------------------------------------------------------------- trends -- */

/**
 * Portfolio flow: what entered and what left the portfolio, day by day. Kept
 * apart from the approval chart so both stay at two or three series, where a
 * line chart can still carry direct end labels.
 */
export function ProjectFlowChart({ data }: { data: SuperAdminDashboardOverview }) {
  return (
    <TimeSeriesChart
      eyebrow="Portfolio flow"
      title="Projects created and completed"
      subtitle="Daily counts across the selected period."
      labels={trendLabels(data)}
      tableValueColumnLabel="Date"
      series={[
        {
          key: "created",
          label: "Created",
          values: data.trends.map((bucket) => bucket.projectsCreated)
        },
        {
          key: "completed",
          label: "Completed",
          values: data.trends.map((bucket) => bucket.projectsCompleted)
        }
      ]}
      unavailableReason={suppressionReason(data.dataQuality, [
        "trends.projectsCreated",
        "trends.projectsCompleted"
      ])}
      empty={data.trends.length === 0}
      footnote={periodNote(data)}
    />
  );
}

/** Approval and delivery throughput — the three signals that a period moved. */
export function ApprovalThroughputChart({ data }: { data: SuperAdminDashboardOverview }) {
  return (
    <TimeSeriesChart
      eyebrow="Throughput"
      title="Approvals and completed work"
      subtitle="Estimates and design plans approved, and execution tasks completed."
      labels={trendLabels(data)}
      tableValueColumnLabel="Date"
      series={[
        {
          key: "estimates",
          label: "Estimates approved",
          values: data.trends.map((bucket) => bucket.estimatesApproved)
        },
        {
          key: "designs",
          label: "Design plans approved",
          values: data.trends.map((bucket) => bucket.designPlansApproved)
        },
        {
          key: "tasks",
          label: "Tasks completed",
          values: data.trends.map((bucket) => bucket.workflowTasksCompleted)
        }
      ]}
      unavailableReason={suppressionReason(data.dataQuality, [
        "trends.estimatesApproved",
        "trends.designPlansApproved",
        "trends.workflowTasksCompleted"
      ])}
      empty={data.trends.length === 0}
      footnote={periodNote(data)}
    />
  );
}

/**
 * Expenses posted to the ledger. Money gets its own chart rather than a second
 * y-axis on the counts above: two scales on one plot invent a correlation that
 * is not in the data.
 */
export function ExpenseTrendChart({ data }: { data: SuperAdminDashboardOverview }) {
  return (
    <TimeSeriesChart
      eyebrow="Ledger"
      title="Expenses posted"
      subtitle="Daily posted spend, on its own scale."
      labels={trendLabels(data)}
      tableValueColumnLabel="Date"
      series={[
        {
          key: "expenses",
          label: "Expenses posted",
          values: data.trends.map((bucket) => bucket.ledgerExpensesPostedPaise)
        }
      ]}
      formatValue={formatPaise}
      formatTick={compactPaise}
      unavailableReason={suppressionReason(data.dataQuality, ["trends.ledgerExpensesPostedPaise"])}
      empty={data.trends.length === 0}
      footnote={periodNote(data)}
    />
  );
}

/* ------------------------------------------------------------- lifecycle -- */

/** Project lifecycle as one part-to-whole stack; the states carry an order. */
export function ProjectLifecycleChart({ data }: { data: SuperAdminDashboardOverview }) {
  const segments: StackedSegment[] = [
    { key: "planning", label: "Planning", value: data.projects.planning },
    { key: "active", label: "Active", value: data.projects.active },
    { key: "on_hold", label: "On hold", value: data.projects.onHold },
    { key: "completed", label: "Completed", value: data.projects.completed }
  ];
  return (
    <DashboardBreakdownDonut
      eyebrow="Lifecycle"
      title="Projects by stage"
      subtitle="Every project in the organization, by its current stage."
      segments={segments}
      scale="ordinal"
      totalLabel="Total"
      unavailableReason={suppressionReason(data.dataQuality, [
        "projects.planning",
        "projects.active",
        "projects.onHold",
        "projects.completed"
      ])}
      emptyMessage="No projects yet, so no stage has a value."
      footnote={`${data.projects.liveOverdue} live overdue · ${data.projects.completedLate} completed late`}
    />
  );
}

/** Risk mix across the portfolio, on the reserved status scale. */
export function RiskDistributionChart({ data }: { data: SuperAdminDashboardOverview }) {
  const levels: DashboardRiskLevel[] = ["red", "yellow", "green", "gray"];
  return (
    <DashboardBreakdownDonut
      className="chart-donut--risk-mix"
      eyebrow="Explainable risk"
      title="Risk mix"
      subtitle="Every project sits in exactly one band at the observation time."
      segments={levels.map((level) => ({
        key: level,
        label: riskLabel[level],
        value: data.risk.projectDistribution[level],
        color: statusColor(riskStatus[level])
      }))}
      totalLabel="Total"
      unavailableReason={suppressionReason(data.dataQuality, ["risk.projectDistribution"])}
      emptyMessage="No projects are tracked, so no risk band has a value."
    />
  );
}

/**
 * Which signals are actually firing. Bars wear the risk level they report, and
 * the two levels are named in the legend, so the colour is never the only
 * carrier of severity.
 */
export function RiskFactorChart({ data }: { data: SuperAdminDashboardOverview }) {
  const bars: RiskFactorBarDatum[] = data.risk.factorDistribution.map((factor) => ({
    key: `${factor.kind}-${factor.level}-${factor.reasonCode}`,
    label: humanize(factor.reasonCode),
    value: factor.occurrenceCount,
    color: statusColor(riskStatus[factor.level]),
    detail: `${humanize(factor.kind)} · across ${factor.projectCount} ${factor.projectCount === 1 ? "project" : "projects"}`
  }));
  return (
    <DashboardRiskFactorChart
      eyebrow="Why projects are flagged"
      title="Risk factor occurrences"
      subtitle="Each bar is one reason code, at the level it was raised."
      data={bars}
      legend={[
        { label: "Red risk", color: statusColor("critical") },
        { label: "Yellow risk", color: statusColor("warning") }
      ]}
      categoryColumnLabel="Reason"
      valueColumnLabel="Occurrences"
      detailColumnLabel="Scope"
      unavailableReason={suppressionReason(data.dataQuality, ["risk.factorDistribution"])}
      empty={bars.length === 0}
      emptyMessage="No eligible risk factors are currently tracked."
    />
  );
}

/* --------------------------------------------------------------- finance -- */

/**
 * Where the Client-approved contract value goes. A waterfall because each step
 * is a signed change against a running total, and the reader's question is what
 * is left rather than how the parts compare.
 */
export function FinanceWaterfallChart({ data }: { data: SuperAdminDashboardOverview }) {
  const finance = data.finance;
  return (
    <WaterfallChart
      eyebrow="Commercial baseline"
      title="Contract value to remaining budget"
      subtitle="GST and reserved profit come out before any cost is budgeted."
      steps={[
        { key: "contract", label: "Contract value", value: finance.approvedContractTotalPaise, type: "total" },
        { key: "gst", label: "GST", value: -finance.approvedGstPaise, type: "step" },
        { key: "net", label: "Net revenue", value: finance.approvedSubtotalPaise, type: "total" },
        { key: "profit", label: "Target profit", value: -finance.targetProfitPaise, type: "step" },
        { key: "budget", label: "Cost budget", value: finance.costBudgetPaise, type: "total" },
        { key: "recorded", label: "Recorded cost", value: -finance.recordedCostPaise, type: "step" },
        { key: "remaining", label: "Remaining budget", value: finance.remainingBudgetPaise, type: "total" }
      ]}
      formatValue={formatPaise}
      formatTick={compactPaise}
      increaseLabel="Adds to the running total"
      decreaseLabel="Comes out of it"
      unavailableReason={suppressionReason(data.dataQuality, [
        "finance.approvedContractTotalPaise",
        "finance.approvedGstPaise",
        "finance.approvedSubtotalPaise",
        "finance.targetProfitPaise",
        "finance.costBudgetPaise",
        "finance.recordedCostPaise",
        "finance.remainingBudgetPaise"
      ])}
      footnote={`Across ${finance.projectCount} ${finance.projectCount === 1 ? "project" : "projects"} with a verified finance bucket.`}
    />
  );
}

/**
 * What the recorded cost is made of, as a variable-radius pie: the same
 * "Projects by stage" ring — hover callout, legend, shrink-left expand — but
 * each arc also reaches further out the bigger its own share is, so
 * magnitude reads through radius as well as angle.
 */
export function SpendCompositionChart({ data }: { data: SuperAdminDashboardOverview }) {
  const finance = data.finance;
  return (
    <DashboardBreakdownDonut
      eyebrow="Recorded cost"
      title="Spend composition"
      subtitle="Every rupee posted against the cost budget."
      variant="variable-radius"
      segments={[
        { key: "procurement", label: "Procurement", value: finance.procurementCostPaise },
        { key: "employee", label: "Employee payments", value: finance.employeePaymentPaise },
        { key: "other", label: "Other expenses", value: finance.otherExpensePaise },
        { key: "overhead", label: "Overheads", value: finance.overheadPaise }
      ]}
      formatValue={formatPaise}
      totalLabel="Total recorded"
      unavailableReason={suppressionReason(data.dataQuality, [
        "finance.procurementCostPaise",
        "finance.employeePaymentPaise",
        "finance.otherExpensePaise",
        "finance.overheadPaise"
      ])}
      emptyMessage="No expenses have been posted in this period."
    />
  );
}

export interface DashboardRatioMetric {
  share: number | null;
  valueText: string;
  detail: string | undefined;
  status: ChartStatus;
  unavailableReason: string | undefined;
}

/** Budget consumption against its limit — the numbers `BudgetConsumptionMeter` and the hero donut both plot. */
export function budgetConsumptionMetric(data: SuperAdminDashboardOverview): DashboardRatioMetric {
  const { costBudgetPaise, recordedCostPaise, remainingBudgetPaise, overBudgetProjectCount } = data.finance;
  const reason = suppressionReason(data.dataQuality, [
    "finance.costBudgetPaise",
    "finance.recordedCostPaise"
  ]);
  const share = costBudgetPaise > 0 ? recordedCostPaise / costBudgetPaise : null;
  const status: ChartStatus =
    share === null ? "neutral" : share > 1 ? "critical" : share > 0.85 ? "warning" : "good";
  return {
    share: reason ? null : share,
    valueText: share === null ? "Not available" : `${Math.round(share * 100)}% · ${formatPaise(recordedCostPaise)}`,
    detail: share === null
      ? undefined
      : `${formatPaise(remainingBudgetPaise)} remaining of ${formatPaise(costBudgetPaise)} · ${overBudgetProjectCount} budget ${overBudgetProjectCount === 1 ? "exception" : "exceptions"}`,
    status,
    unavailableReason: reason
  };
}

/** Budget consumption against its limit, with the reserved-profit line marked. */
export function BudgetConsumptionMeter({
  data,
  shape = "linear"
}: {
  data: SuperAdminDashboardOverview;
  /** Radial in the Overview hero, alongside the other two headline meters; linear on the Finance tab, next to the margin ring. */
  shape?: "linear" | "radial";
}) {
  const metric = budgetConsumptionMetric(data);
  return (
    <MeterChart
      label="Cost budget consumed"
      value={metric.share}
      valueText={metric.valueText}
      detail={metric.detail}
      status={metric.status}
      shape={shape}
      unavailableReason={metric.unavailableReason}
    />
  );
}

/** Live margin against the approved baseline. */
export function MarginMeter({ data }: { data: SuperAdminDashboardOverview }) {
  const reason = suppressionReason(data.dataQuality, ["finance.currentMarginBps"]);
  const marginBps = data.finance.currentMarginBps;
  const share = marginBps === null ? null : Math.max(0, Math.min(1, marginBps / 10_000));
  const status: ChartStatus =
    marginBps === null ? "neutral" : marginBps < 0 ? "critical" : marginBps < 1000 ? "warning" : "good";
  return (
    <MeterChart
      label="Current margin (live)"
      value={reason || marginBps === null ? null : share}
      valueText={marginBps === null ? "Not available" : `${(marginBps / 100).toFixed(2)}%`}
      detail={`${formatPaise(data.finance.currentProfitPaise)} live profit against ${formatPaise(data.finance.approvedSubtotalPaise)} net revenue`}
      status={status}
      shape="radial"
      unavailableReason={reason ?? (marginBps === null ? "No eligible margin denominator." : undefined)}
    />
  );
}

/* ------------------------------------------------------------- pipelines -- */

export function EstimationPipelineChart({ data }: { data: SuperAdminDashboardOverview }) {
  const estimation = data.estimation;
  return (
    <StackedBarChart
      eyebrow="Estimation pipeline"
      title="Estimates by stage"
      subtitle="Ordered from no estimate through Client approval."
      segments={[
        { key: "none", label: "No estimate", value: estimation.noEstimate },
        { key: "draft", label: "Draft / internal", value: estimation.draftInternal },
        { key: "ready", label: "Ready to send", value: estimation.readyToSend },
        { key: "awaiting", label: "Awaiting Client", value: estimation.awaitingClient },
        { key: "changes", label: "Changes requested", value: estimation.changesRequested },
        { key: "approved", label: "Client approved", value: estimation.clientApproved }
      ]}
      scale="ordinal"
      totalLabel="Total"
      categoryColumnLabel="Stage"
      valueColumnLabel="Projects"
      unavailableReason={suppressionReason(data.dataQuality, [
        "estimation.noEstimate",
        "estimation.draftInternal",
        "estimation.readyToSend",
        "estimation.awaitingClient",
        "estimation.changesRequested",
        "estimation.clientApproved"
      ])}
      footnote={`${estimation.eligibleProjects} eligible · ${estimation.trackedProjects} tracked · ${estimation.unavailableProjects} unavailable`}
    />
  );
}

export function DesignPipelineChart({ data }: { data: SuperAdminDashboardOverview }) {
  const design = data.design;
  return (
    <StackedBarChart
      eyebrow="Design pipeline"
      title="Design plans by stage"
      subtitle="Ordered from pending assignment through approval."
      segments={[
        { key: "pending", label: "Pending assignment", value: design.pendingAssignment },
        { key: "assigned", label: "Assigned", value: design.assigned },
        { key: "progress", label: "In progress", value: design.inProgress },
        { key: "ready", label: "Ready for Client", value: design.readyForClient },
        { key: "changes", label: "Changes requested", value: design.changesRequested },
        { key: "approved", label: "Approved", value: design.approved }
      ]}
      scale="ordinal"
      totalLabel="Total"
      categoryColumnLabel="Stage"
      valueColumnLabel="Projects"
      unavailableReason={suppressionReason(data.dataQuality, [
        "design.pendingAssignment",
        "design.assigned",
        "design.inProgress",
        "design.readyForClient",
        "design.changesRequested",
        "design.approved"
      ])}
      footnote={`${design.eligibleProjects} eligible · ${design.trackedProjects} tracked · ${design.unavailableProjects} unavailable`}
    />
  );
}

/** Design plans approved against every plan eligible to be reviewed. */
export function DesignApprovalRateMeter({ data }: { data: SuperAdminDashboardOverview }) {
  const design = data.design;
  const reason = suppressionReason(data.dataQuality, ["design.approvalRate"]);
  const share = ratioShare(design.approvalRate);
  return (
    <MeterChart
      label="Approval rate"
      value={reason ? null : share}
      valueText={formatDashboardRatio(design.approvalRate)}
      detail={ratioDetail(design.approvalRate, "eligible plans")}
      status={share === null ? "neutral" : share >= 0.6 ? "good" : "warning"}
      shape="radial"
      unavailableReason={reason}
    />
  );
}

export function ProcurementPipelineChart({ data }: { data: SuperAdminDashboardOverview }) {
  const procurement = data.procurement;
  return (
    <StackedBarChart
      eyebrow="Procurement pipeline"
      title="Procurement tasks by stage"
      segments={[
        { key: "not_started", label: "Not started", value: procurement.notStarted },
        { key: "open", label: "Open", value: procurement.open },
        { key: "progress", label: "In progress", value: procurement.inProgress },
        { key: "completed", label: "Completed", value: procurement.completed }
      ]}
      scale="ordinal"
      totalLabel="Total"
      categoryColumnLabel="Stage"
      valueColumnLabel="Projects"
      unavailableReason={suppressionReason(data.dataQuality, [
        "procurement.notStarted",
        "procurement.open",
        "procurement.inProgress",
        "procurement.completed"
      ])}
      footnote={`${procurement.eligibleProjects} eligible · ${procurement.trackedProjects} tracked · ${procurement.unavailableProjects} unavailable`}
    />
  );
}

/** Posted spend against the approved procurement amount. */
export function ProcurementSpendMeter({ data }: { data: SuperAdminDashboardOverview }) {
  const { plannedAmountPaise, postedSpendPaise } = data.procurement;
  const reason = suppressionReason(data.dataQuality, [
    "procurement.approvedAmountPaise",
    "procurement.postedSpendPaise"
  ]);
  const share =
    plannedAmountPaise === null || plannedAmountPaise <= 0 ? null : postedSpendPaise / plannedAmountPaise;
  const status: ChartStatus =
    share === null ? "neutral" : share > 1 ? "critical" : share > 0.9 ? "warning" : "good";
  return (
    <MeterChart
      label="Posted against approved procurement"
      value={reason ? null : share}
      valueText={share === null ? "Not available" : `${Math.round(share * 100)}%`}
      detail={
        share === null
          ? undefined
          : `${formatPaise(postedSpendPaise)} posted of ${formatPaise(plannedAmountPaise!)} approved`
      }
      status={status}
      unavailableReason={
        reason ?? (share === null ? "No authoritative approved procurement amount." : undefined)
      }
    />
  );
}

/** How far posted progress has gotten across every tracked procurement task. */
export function ProcurementProgressMeter({ data }: { data: SuperAdminDashboardOverview }) {
  const procurement = data.procurement;
  const reason = suppressionReason(data.dataQuality, ["procurement.averageProgress"]);
  const share = ratioShare(procurement.averageProgress);
  return (
    <MeterChart
      label="Average persisted progress"
      value={reason ? null : share}
      valueText={formatDashboardRatio(procurement.averageProgress)}
      detail={ratioDetail(procurement.averageProgress, "tracked tasks")}
      status={share === null ? "neutral" : share >= 0.6 ? "good" : "warning"}
      shape="radial"
      unavailableReason={reason}
    />
  );
}

/** Estimation waiting age: median against the single oldest case. */
export function WaitingAgeChart({ data }: { data: SuperAdminDashboardOverview }) {
  const estimation = data.estimation;
  const reason = suppressionReason(data.dataQuality, ["estimation.waitingAge"]);
  const bars: CategoryBarDatum[] = [
    { key: "median", label: "Median waiting age", value: estimation.medianWaitingAgeDays ?? 0 },
    { key: "oldest", label: "Oldest waiting age", value: estimation.oldestWaitingAgeDays ?? 0 }
  ];
  return (
    <CategoryBarChart
      eyebrow="Time in queue"
      title="Estimation waiting age"
      subtitle="How long Client-facing estimates have been waiting, in days."
      data={bars}
      scale="ordinal"
      formatValue={(value) => `${value} ${value === 1 ? "day" : "days"}`}
      categoryColumnLabel="Measure"
      valueColumnLabel="Days"
      unavailableReason={reason}
      empty={estimation.medianWaitingAgeDays === null && estimation.oldestWaitingAgeDays === null}
      emptyMessage="No estimates are currently waiting."
    />
  );
}

/** Eligible/tracked/unavailable coverage for one module, as a small stacked bar. */
export function CoverageChart({
  eligible,
  tracked,
  unavailable,
  module,
  dataQuality
}: {
  eligible: number;
  tracked: number;
  unavailable: number;
  module: string;
  dataQuality: DashboardDataQuality;
}) {
  const unavailableKey = [`${module}.eligibleProjects`, `${module}.trackedProjects`, `${module}.unavailableProjects`]
    .find((key) => isDashboardMetricUnavailable(dataQuality, key));
  return (
    <StackedBarChart
      eyebrow="Coverage"
      title={`${humanize(module)} data coverage`}
      subtitle={`${eligible} eligible ${eligible === 1 ? "project" : "projects"} for this module.`}
      segments={[
        { key: "tracked", label: "Tracked", value: tracked, color: statusColor("good") },
        { key: "unavailable", label: "Unavailable", value: unavailable, color: statusColor("warning") }
      ]}
      height={22}
      totalLabel="Eligible"
      categoryColumnLabel="Coverage"
      valueColumnLabel="Projects"
      unavailableReason={unavailableKey ? dashboardMetricUnavailableReason(dataQuality, unavailableKey) : undefined}
      emptyMessage="No eligible projects for this module yet."
    />
  );
}

/* ------------------------------------------------- execution & workforce -- */

export function ExecutionStateChart({ data }: { data: SuperAdminDashboardOverview }) {
  const execution = data.execution;
  return (
    <StackedBarChart
      eyebrow="Delivery"
      title="Execution tasks by state"
      segments={[
        { key: "open", label: "Open", value: execution.open },
        { key: "progress", label: "In progress", value: execution.inProgress },
        { key: "completed", label: "Completed", value: execution.completed }
      ]}
      scale="ordinal"
      totalLabel="Total"
      categoryColumnLabel="State"
      valueColumnLabel="Tasks"
      unavailableReason={suppressionReason(data.dataQuality, [
        "execution.open",
        "execution.inProgress",
        "execution.completed"
      ])}
      footnote={`${execution.overdue} overdue · ${execution.unassigned} unassigned · ${execution.overdueUnassigned} overdue and unassigned`}
    />
  );
}

/** Weighted execution progress — the numbers `ExecutionProgressMeter` and the hero donut both plot. */
export function executionProgressMetric(data: SuperAdminDashboardOverview): DashboardRatioMetric {
  const progress = data.execution.weightedProgress;
  const reason = suppressionReason(data.dataQuality, ["execution.weightedProgress"]);
  const share = ratioShare(progress);
  return {
    share: reason ? null : share,
    valueText: share === null ? "Not available" : `${(progress.rateBps! / 100).toFixed(2)}%`,
    detail: `${progress.numerator} of ${progress.denominator} effort units · ${progress.fallbackTaskCount} fallback ${progress.fallbackTaskCount === 1 ? "task" : "tasks"}`,
    status: share === null ? "neutral" : share >= 0.75 ? "good" : share >= 0.4 ? "warning" : "serious",
    unavailableReason: reason ?? (share === null ? "No eligible effort denominator." : undefined)
  };
}

export function ExecutionProgressMeter({
  data,
  shape = "linear"
}: {
  data: SuperAdminDashboardOverview;
  /** Radial on the Execution tab, where it's the panel's one headline ratio; linear in the Overview hero, alongside two other meters. */
  shape?: "linear" | "radial";
}) {
  const metric = executionProgressMetric(data);
  return (
    <MeterChart
      label="Weighted execution progress"
      value={metric.share}
      valueText={metric.valueText}
      detail={metric.detail}
      status={metric.status}
      shape={shape}
      unavailableReason={metric.unavailableReason}
    />
  );
}

export function WorkerRoleChart({ data }: { data: SuperAdminDashboardOverview }) {
  const bars = data.workforce.roleDistribution.map((entry) => ({
    key: entry.role,
    label: workerRoleLabel(entry.role),
    value: entry.workerCount
  }));
  return (
    <DashboardCategoryBarChart
      eyebrow="Capacity"
      title="Active workers by trade"
      subtitle="Trades have no natural order, so every bar takes the same hue."
      data={bars}
      categoryColumnLabel="Trade"
      valueColumnLabel="Workers"
      unavailableReason={suppressionReason(data.dataQuality, ["workforce.roleDistribution"])}
      empty={bars.length === 0}
      emptyMessage="No active workers are recorded for this period."
    />
  );
}

export function ExecutionRoleChart({ data }: { data: SuperAdminDashboardOverview }) {
  const bars = data.execution.roleDistribution.map((entry) => ({
    key: entry.role,
    label: humanize(entry.role.replace(/^worker_/, "")),
    value: entry.taskCount
  }));
  return (
    <DashboardCategoryBarChart
      eyebrow="Where the work sits"
      title="Execution tasks by trade"
      data={bars}
      categoryColumnLabel="Trade"
      valueColumnLabel="Tasks"
      unavailableReason={suppressionReason(data.dataQuality, ["execution.roleDistribution"])}
      empty={bars.length === 0}
      emptyMessage="No execution tasks carry a verified trade."
    />
  );
}

export function WorkforceKpiMeter({
  data,
  shape = "radial"
}: {
  data: SuperAdminDashboardOverview;
  /** Radial on the Workforce tab, where it is the panel's one headline ratio; linear on the Overview's compact Workforce health card. */
  shape?: "linear" | "radial";
}) {
  const reason = suppressionReason(data.dataQuality, ["workforce.averageKpi"]);
  const share = ratioShare(data.workforce.averageKpi);
  return (
    <MeterChart
      label="Average calculated KPI"
      value={reason ? null : share}
      valueText={
        share === null ? "Not available" : `${(data.workforce.averageKpi.rateBps! / 100).toFixed(2)}%`
      }
      detail={`${data.workforce.kpiEligibleWorkers} eligible · ${data.workforce.kpiUnavailableWorkers} without KPI data`}
      status={share === null ? "neutral" : share >= 0.75 ? "good" : share >= 0.5 ? "warning" : "serious"}
      shape={shape}
      unavailableReason={reason ?? (share === null ? "No KPI-eligible workers in this period." : undefined)}
    />
  );
}

export function WorkforceAssignmentChart({ data }: { data: SuperAdminDashboardOverview }) {
  const workforce = data.workforce;
  return (
    <StackedBarChart
      eyebrow="Assignment"
      title="Workers by assignment state"
      segments={[
        { key: "assigned", label: "With assignments", value: workforce.assignedWorkers },
        { key: "unassigned", label: "Without assignments", value: workforce.unassignedWorkers }
      ]}
      totalLabel="Total"
      categoryColumnLabel="State"
      valueColumnLabel="Workers"
      unavailableReason={suppressionReason(data.dataQuality, [
        "workforce.assignedWorkers",
        "workforce.unassignedWorkers"
      ])}
      footnote={`${workforce.activeAssignedTaskCount} active assigned tasks · ${workforce.activeUnassignedTaskCount} active unassigned · ${workforce.inactiveAssigneeTaskCount} inactive-assignee exceptions`}
    />
  );
}

/* ------------------------------------------------------------ governance -- */

export function GovernanceQueueChart({ data }: { data: SuperAdminDashboardOverview }) {
  const governance = data.governance;
  const waiting = statusColor("neutral");
  const bars = [
    { key: "invitations", label: "Pending invitations", value: governance.pendingInvitations, color: waiting },
    { key: "expired", label: "Expired invitations", value: governance.expiredInvitations, color: statusColor("warning") },
    { key: "failedInvitations", label: "Failed invitation deliveries", value: governance.failedInvitationDeliveries, color: statusColor("critical") },
    { key: "access", label: "Pending access requests", value: governance.pendingAccessRequests, color: waiting },
    { key: "client", label: "Pending Client responses", value: governance.pendingClientResponses, color: waiting },
    { key: "failedClient", label: "Failed Client deliveries", value: governance.failedClientDeliveries, color: statusColor("critical") },
    { key: "disabledClient", label: "Disabled Client deliveries", value: governance.disabledClientDeliveries, color: statusColor("warning") },
    { key: "design", label: "Pending Design responses", value: governance.pendingDesignResponses, color: waiting },
    { key: "failedDesign", label: "Failed Design deliveries", value: governance.failedDesignDeliveries, color: statusColor("critical") },
    { key: "disabledDesign", label: "Disabled Design deliveries", value: governance.disabledDesignDeliveries, color: statusColor("warning") }
  ];
  return (
    <DashboardQueueChart
      eyebrow="Queue depth"
      title="Waiting on an administrator"
      subtitle="Waiting on someone, needing a second look, and outright failed each wear their own colour."
      data={bars}
      legend={[
        { label: "Waiting on someone", color: waiting },
        { label: "Needs a look (expired / disabled)", color: statusColor("warning") },
        { label: "Failed delivery", color: statusColor("critical") }
      ]}
      categoryColumnLabel="Queue"
      valueColumnLabel="Waiting"
      unavailableReason={suppressionReason(data.dataQuality, ["governance"])}
    />
  );
}
