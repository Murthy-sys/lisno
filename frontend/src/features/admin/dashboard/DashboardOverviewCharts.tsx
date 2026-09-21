import { useState } from "react";

import { ChartFigure, compactPaise } from "../../../components/charts";
import { DashboardEChart } from "./echarts/DashboardEChart";
import type { DashboardChartTheme, DashboardEChartOption } from "./echarts/types";
import {
  dashboardMetricUnavailableReason,
  formatPaise,
  dashboardMetricPresentation,
  isDashboardMetricUnavailable
} from "./dashboardPresentation";
import {
  DASHBOARD_COMPARISON_METRIC_KEYS,
  type DashboardComparisonBucket,
  type DashboardComparisonMetricKey,
  type DashboardProjectModuleStatus,
  type SuperAdminDashboardOverview
} from "./superAdminDashboardApi";

const utcDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

const compactNumberFormatter = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1
});

const formatUtcDate = (value: string) => utcDateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
const formatCount = (value: number | null) => value === null ? "Not available" : value.toLocaleString("en-IN");
const formatMetric = (unit: "count" | "paise", value: number | null) =>
  value === null ? "Not available" : unit === "paise" ? formatPaise(value) : formatCount(value);

const suppressionReason = (
  data: SuperAdminDashboardOverview,
  keys: readonly string[]
) => {
  const key = keys.find((candidate) => isDashboardMetricUnavailable(data.dataQuality, candidate));
  return key ? dashboardMetricUnavailableReason(data.dataQuality, key) : undefined;
};

type ComparisonConfig = {
  label: string;
  shortLabel: string;
  bucketKey: keyof Pick<
    DashboardComparisonBucket,
    | "projectsCreated"
    | "clientsCreated"
    | "projectsCompleted"
    | "executionTasksCompleted"
    | "estimatesApproved"
    | "designPlansApproved"
    | "recordedExpensesPaise"
  >;
};

const COMPARISON_CONFIG: Record<DashboardComparisonMetricKey, ComparisonConfig> = {
  projects_created: { label: "Projects created", shortLabel: "Projects", bucketKey: "projectsCreated" },
  clients_created: { label: "Client accounts created", shortLabel: "Clients", bucketKey: "clientsCreated" },
  projects_completed: { label: "Projects completed", shortLabel: "Completed projects", bucketKey: "projectsCompleted" },
  execution_tasks_completed: { label: "Execution tasks completed", shortLabel: "Execution", bucketKey: "executionTasksCompleted" },
  estimates_approved: { label: "Estimates approved", shortLabel: "Estimate approvals", bucketKey: "estimatesApproved" },
  design_plans_approved: { label: "Design plans approved", shortLabel: "Design approvals", bucketKey: "designPlansApproved" },
  recorded_expenses_paise: { label: "Recorded expenses", shortLabel: "Expenses", bucketKey: "recordedExpensesPaise" }
};

export const createNamedGrowthData = (
  buckets: readonly DashboardComparisonBucket[],
  bucketKey: ComparisonConfig["bucketKey"],
  format: (value: number | null) => string
) => buckets.map((bucket) => ({
  name: bucket.date.slice(0, 10),
  value: bucket[bucketKey],
  actualDate: formatUtcDate(bucket.date),
  displayValue: format(bucket[bucketKey])
}));

function tooltipText(params: unknown) {
  const entries = Array.isArray(params) ? params : [params];
  return entries.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const candidate = entry as { seriesName?: unknown; data?: unknown };
    if (typeof candidate.seriesName !== "string" || typeof candidate.data !== "object" || candidate.data === null) return [];
    const datum = candidate.data as { actualDate?: unknown; displayValue?: unknown };
    if (typeof datum.actualDate !== "string" || typeof datum.displayValue !== "string") return [];
    return [`${candidate.seriesName} · ${datum.actualDate}: ${datum.displayValue}`];
  }).join("\n");
}

export function GrowthComparisonChart({
  data,
  showComparison
}: {
  data: SuperAdminDashboardOverview;
  showComparison: boolean;
}) {
  const [metricKey, setMetricKey] = useState<DashboardComparisonMetricKey>("projects_created");
  const comparison = data.comparison;
  const config = COMPARISON_CONFIG[metricKey];
  const metric = comparison?.metrics[metricKey];
  const format = (value: number | null) => formatMetric(metric?.unit ?? "count", value);
  const currentAvailable = metric?.currentStatus === "available";
  const previousAvailable = showComparison && metric?.previousStatus === "available";
  const unavailableReason = !comparison
    ? "Previous-period reporting is not available in this response."
    : !currentAvailable
      ? metric?.currentUnavailableReason ?? "Current-period history is unavailable."
      : undefined;
  const current = comparison?.currentBuckets ?? [];
  const previous = comparison?.previousBuckets ?? [];
  const rowCount = Math.max(current.length, showComparison ? previous.length : 0);
  const currentSeries = createNamedGrowthData(current, config.bucketKey, format);
  const previousSeries = createNamedGrowthData(previous, config.bucketKey, format);
  const actions = (
    <label className="dashboard-chart-select">
      <span>Metric</span>
      <select
        aria-label="Growth chart metric"
        value={metricKey}
        onChange={(event) => setMetricKey(event.target.value as DashboardComparisonMetricKey)}
      >
        {DASHBOARD_COMPARISON_METRIC_KEYS.map((key) => (
          <option key={key} value={key}>{COMPARISON_CONFIG[key].label}</option>
        ))}
      </select>
    </label>
  );
  const tableColumns = showComparison
    ? ["Day", "Current date", "Current", "Previous date", "Previous"]
    : ["Day", "Current date", "Current"];
  const tableRows = Array.from({ length: rowCount }, (_, index) => {
    const currentBucket = current[index];
    const previousBucket = previous[index];
    const currentValue = currentBucket?.[config.bucketKey] ?? null;
    const previousValue = previousBucket?.[config.bucketKey] ?? null;
    return {
      header: `Day ${index + 1}`,
      cells: showComparison
        ? [
            currentBucket ? formatUtcDate(currentBucket.date) : "Not available",
            format(currentValue),
            previousBucket ? formatUtcDate(previousBucket.date) : "Not available",
            previousAvailable ? format(previousValue) : "Not available"
          ]
        : [
            currentBucket ? formatUtcDate(currentBucket.date) : "Not available",
            format(currentValue)
          ]
    };
  });

  return (
    <ChartFigure
      eyebrow="Growth and delivery"
      title="Current period activity"
      subtitle={`${config.label}, aligned by UTC day index${showComparison ? " against the previous period" : ""}.`}
      actions={actions}
      legend={showComparison && previousAvailable ? [
        { label: "Current period", color: "var(--chart-series-1)", mark: "line", value: format(metric?.current ?? null) },
        { label: "Previous period", color: "var(--chart-series-3)", mark: "line", value: format(metric?.previous ?? null) }
      ] : undefined}
      table={{
        caption: `Exact UTC values for ${config.label.toLowerCase()}.`,
        columns: tableColumns,
        rows: tableRows
      }}
      unavailableReason={unavailableReason}
      empty={Boolean(comparison && current.length === 0)}
      emptyMessage="No verified daily buckets are available for this period."
      footnote={comparison ? (
        <>
          Current: {formatUtcDate(comparison.window.current.startAt)}–{formatUtcDate(comparison.window.current.endAt)}
          {showComparison ? <> · Previous: {formatUtcDate(comparison.window.previous.startAt)}–{formatUtcDate(comparison.window.previous.endAt)}</> : null}
          {comparison.window.partialFinalDay ? " · Final day is partial" : ""}
          {showComparison && !previousAvailable ? ` · ${metric?.previousUnavailableReason ?? "Previous history is unavailable."}` : ""}
        </>
      ) : undefined}
    >
      <DashboardEChart
        chartId="dashboard-growth"
        height={310}
        description={`${config.label} for the current${showComparison && previousAvailable ? " and previous" : ""} reporting period.`}
        interaction={{
          orientation: "horizontal",
          items: [
            ...current.map((bucket, index) => ({
              id: `current-${bucket.dayIndex}`,
              seriesId: "current-period",
              dataIndex: index,
              announcement: `Current period, ${formatUtcDate(bucket.date)}, ${format(bucket[config.bucketKey])}`
            })),
            ...(showComparison && previousAvailable ? previous.map((bucket, index) => ({
              id: `previous-${bucket.dayIndex}`,
              seriesId: "previous-period",
              dataIndex: index,
              announcement: `Previous period, ${formatUtcDate(bucket.date)}, ${format(bucket[config.bucketKey])}`
            })) : [])
          ]
        }}
        createOption={(theme) => ({
          grid: { left: 18, right: 18, top: 18, bottom: 40, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
          tooltip: { trigger: "axis", formatter: tooltipText },
          xAxis: {
            type: "category",
            boundaryGap: false,
            data: current.map((bucket) => `Day ${bucket.dayIndex + 1}`),
            axisLine: { lineStyle: { color: theme.grid } },
            axisTick: { show: false },
            axisLabel: { color: theme.mutedText, hideOverlap: true, interval: current.length > 31 ? 9 : current.length > 14 ? 4 : 0 }
          },
          yAxis: {
            type: "value",
            minInterval: metric?.unit === "count" ? 1 : undefined,
            axisLabel: {
              color: theme.mutedText,
              formatter: (value: number) => metric?.unit === "paise" ? compactPaise(value) : compactNumberFormatter.format(value)
            },
            splitLine: { lineStyle: { color: theme.grid } }
          },
          series: [
            {
              id: "current-period",
              name: "Current period",
              type: "line",
              data: currentSeries,
              connectNulls: false,
              showSymbol: current.length <= 14,
              symbolSize: 7,
              lineStyle: { color: theme.series[0], width: 3 },
              itemStyle: { color: theme.series[0] },
              areaStyle: { color: theme.series[0], opacity: 0.08 },
              emphasis: { focus: "series" },
              universalTransition: { enabled: true, divideShape: "clone" }
            },
            ...(showComparison && previousAvailable ? [{
              id: "previous-period",
              name: "Previous period",
              type: "line" as const,
              data: previousSeries,
              connectNulls: false,
              showSymbol: previous.length <= 14,
              symbolSize: 6,
              lineStyle: { color: theme.series[2], width: 2, type: "dashed" as const },
              itemStyle: { color: theme.series[2] },
              emphasis: { focus: "series" as const },
              universalTransition: { enabled: true, divideShape: "clone" as const }
            }] : [])
          ]
        } as DashboardEChartOption)}
      />
    </ChartFigure>
  );
}

export function ClientPortfolioChart({ data }: { data: SuperAdminDashboardOverview }) {
  const clients = data.clients;
  const unavailableReason = !clients
    ? "Client account reporting is not available in this response."
    : clients.accountsStatus === "unavailable"
      ? clients.accountsUnavailableReason ?? "Client account totals are unavailable."
      : undefined;
  const active = clients?.activeAccounts ?? 0;
  const inactive = clients?.inactiveAccounts ?? 0;
  const registered = clients?.registeredAccounts ?? 0;

  return (
    <ChartFigure
      eyebrow="Client portfolio"
      title="Registered Client accounts"
      subtitle="Current account status; invitations and contact labels are excluded."
      legend={[
        { label: "Active", color: "var(--chart-series-1)", value: formatCount(clients?.activeAccounts ?? null) },
        { label: "Inactive", color: "var(--chart-series-4)", value: formatCount(clients?.inactiveAccounts ?? null) }
      ]}
      table={{
        caption: "Registered Client accounts by current status.",
        columns: ["Status", "Accounts"],
        rows: [
          { header: "Active", cells: [formatCount(clients?.activeAccounts ?? null)] },
          { header: "Inactive", cells: [formatCount(clients?.inactiveAccounts ?? null)] },
          { header: "Total", cells: [formatCount(clients?.registeredAccounts ?? null)] }
        ]
      }}
      unavailableReason={unavailableReason}
      empty={Boolean(clients && registered === 0)}
      emptyMessage="No registered Client accounts are currently stored."
    >
      <DashboardEChart
        chartId="dashboard-client-portfolio"
        height={230}
        description={`Registered Client accounts: ${active} active and ${inactive} inactive.`}
        interaction={{
          orientation: "horizontal",
          items: [
            { id: "active", seriesId: "active-clients", dataIndex: 0, announcement: `Active Client accounts, ${active}` },
            { id: "inactive", seriesId: "inactive-clients", dataIndex: 0, announcement: `Inactive Client accounts, ${inactive}` }
          ]
        }}
        createOption={(theme) => ({
          grid: { left: 0, right: 8, top: 22, bottom: 8, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
          tooltip: { trigger: "item", valueFormatter: (value) => Number(value).toLocaleString("en-IN") },
          xAxis: { type: "value", show: false, max: Math.max(registered, 1) },
          yAxis: { type: "category", data: ["Registered accounts"], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: theme.text, fontWeight: 600 } },
          series: [
            { id: "active-clients", name: "Active", type: "bar", stack: "accounts", data: [{ name: "active-client-accounts", groupId: "active-client-accounts", value: active }], barWidth: 30, itemStyle: { color: theme.series[0], borderRadius: inactive === 0 ? [8, 8, 8, 8] : [8, 0, 0, 8] }, label: { show: active > 0, position: "inside", color: theme.surface, formatter: "{c}" }, universalTransition: { enabled: true, divideShape: "clone" } },
            { id: "inactive-clients", name: "Inactive", type: "bar", stack: "accounts", data: [{ name: "inactive-client-accounts", groupId: "inactive-client-accounts", value: inactive }], barWidth: 30, itemStyle: { color: theme.series[3], borderRadius: active === 0 ? [8, 8, 8, 8] : [0, 8, 8, 0] }, label: { show: inactive > 0, position: "inside", color: theme.text, formatter: "{c}" }, universalTransition: { enabled: true, divideShape: "clone" } }
          ]
        })}
      />
    </ChartFigure>
  );
}

const lifecycleStages: Array<{
  key: DashboardProjectModuleStatus;
  label: string;
  value: (data: SuperAdminDashboardOverview) => number;
  colorIndex: number;
}> = [
  { key: "planning", label: "Planning", value: (data) => data.projects.planning, colorIndex: 1 },
  { key: "active", label: "Active", value: (data) => data.projects.active, colorIndex: 2 },
  { key: "on_hold", label: "On hold", value: (data) => data.projects.onHold, colorIndex: 3 },
  { key: "completed", label: "Completed", value: (data) => data.projects.completed, colorIndex: 4 }
];

export type LifecycleChartView = "doughnut" | "ranked_bar";

type LifecycleChartValue = (typeof lifecycleStages)[number] & {
  count: number;
  order: number;
};

const lifecycleValues = (data: SuperAdminDashboardOverview): LifecycleChartValue[] =>
  lifecycleStages.map((stage, order) => ({ ...stage, count: stage.value(data), order }));

const lifecyclePlotValues = (
  values: readonly LifecycleChartValue[],
  view: LifecycleChartView
) => {
  const plotted = values.filter((entry) => entry.count > 0);
  if (view === "doughnut") return plotted;
  return [...plotted].sort((left, right) => right.count - left.count || left.order - right.order);
};

const lifecycleDatum = (entry: LifecycleChartValue, theme: Readonly<DashboardChartTheme>) => ({
  id: entry.key,
  name: entry.key,
  groupId: entry.key,
  value: entry.count,
  displayLabel: entry.label,
  itemStyle: { color: theme.ordinal[Math.min(entry.colorIndex, theme.ordinal.length - 1)] }
});

const lifecycleTooltipText = (params: unknown) => {
  if (typeof params !== "object" || params === null) return "";
  const candidate = params as { data?: unknown; value?: unknown };
  if (typeof candidate.data !== "object" || candidate.data === null) return "";
  const datum = candidate.data as { displayLabel?: unknown };
  if (typeof datum.displayLabel !== "string") return "";
  return `${datum.displayLabel}: ${Number(candidate.value).toLocaleString("en-IN")} projects`;
};

export function createProjectLifecycleChartOption({
  data,
  theme,
  view
}: {
  data: SuperAdminDashboardOverview;
  theme: Readonly<DashboardChartTheme>;
  view: LifecycleChartView;
}): DashboardEChartOption {
  const values = lifecycleValues(data);
  const plottedValues = lifecyclePlotValues(values, view);
  const seriesData = plottedValues.map((entry) => lifecycleDatum(entry, theme));
  const universalTransition = { enabled: true, divideShape: "clone" as const };

  if (view === "ranked_bar") {
    return {
      grid: { left: 8, right: 64, top: 12, bottom: 18, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
      tooltip: { trigger: "item", formatter: lifecycleTooltipText },
      xAxis: {
        type: "value",
        min: 0,
        minInterval: 1,
        axisLabel: { color: theme.mutedText },
        axisLine: { lineStyle: { color: theme.grid } },
        splitLine: { lineStyle: { color: theme.grid } }
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: plottedValues.map((entry) => entry.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: theme.text, fontWeight: 600 }
      },
      series: [{
        id: "project-lifecycle",
        name: "Lifecycle",
        type: "bar",
        data: seriesData,
        barMaxWidth: 30,
        itemStyle: { borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", color: theme.text, formatter: "{c}" },
        emphasis: { focus: "series" },
        universalTransition
      }]
    } as DashboardEChartOption;
  }

  return {
    tooltip: { trigger: "item", formatter: lifecycleTooltipText },
    series: [{
      id: "project-lifecycle",
      name: "Lifecycle",
      type: "pie",
      radius: ["54%", "78%"],
      center: ["50%", "50%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: theme.surface, borderWidth: 3, borderRadius: 5 },
      label: {
        show: true,
        color: theme.text,
        formatter: (params) => {
          const datum = params.data as { displayLabel?: unknown };
          return `${typeof datum.displayLabel === "string" ? datum.displayLabel : params.name}\n${params.value}`;
        },
        fontWeight: 600
      },
      labelLine: { lineStyle: { color: theme.grid } },
      emphasis: { scaleSize: 6 },
      data: seriesData,
      universalTransition
    }]
  } as DashboardEChartOption;
}

export function ProjectLifecycleEChart({
  data,
  onActivate
}: {
  data: SuperAdminDashboardOverview;
  onActivate: (status: DashboardProjectModuleStatus) => void;
}) {
  const [view, setView] = useState<LifecycleChartView>("doughnut");
  const values = lifecycleValues(data);
  const plottedValues = lifecyclePlotValues(values, view);
  const total = values.reduce((sum, entry) => sum + entry.count, 0);
  const unavailableReason = suppressionReason(data, [
    "projects.planning", "projects.active", "projects.onHold", "projects.completed"
  ]);

  return (
    <ChartFigure
      eyebrow="Project lifecycle"
      title="Current delivery stage"
      subtitle="A current snapshot across every stored project. Select a stage to open its project list."
      actions={!unavailableReason && total > 0 ? (
        <div className="dashboard-lifecycle-view" role="group" aria-label="Lifecycle chart view">
          <button
            type="button"
            aria-pressed={view === "doughnut"}
            onClick={() => setView("doughnut")}
          >
            Doughnut
          </button>
          <button
            type="button"
            aria-pressed={view === "ranked_bar"}
            onClick={() => setView("ranked_bar")}
          >
            Ranked bars
          </button>
        </div>
      ) : undefined}
      legend={values.map((entry) => ({
        label: entry.label,
        color: `var(--chart-ordinal-${Math.min(entry.colorIndex + 1, 6)})`,
        value: entry.count.toLocaleString("en-IN")
      }))}
      table={{
        caption: "Current projects by lifecycle stage.",
        columns: ["Stage", "Projects", "Share"],
        rows: values.map((entry) => ({
          header: entry.label,
          cells: [entry.count.toLocaleString("en-IN"), total > 0 ? `${Math.round(entry.count / total * 100)}%` : "0%"]
        }))
      }}
      unavailableReason={unavailableReason}
      empty={total === 0}
      emptyMessage="No projects yet, so no lifecycle stage has a value."
      footnote={`${data.projects.liveOverdue} live overdue · ${data.projects.completedLate} completed late`}
    >
      <DashboardEChart
        chartId="dashboard-project-lifecycle"
        height={290}
        description={`Current lifecycle distribution across ${total} projects shown as ${view === "doughnut" ? "a doughnut" : "ranked bars"}.`}
        interaction={{
          orientation: view === "doughnut" ? "radial" : "vertical",
          items: plottedValues.map((entry, index) => ({
            id: entry.key,
            seriesId: "project-lifecycle",
            dataIndex: index,
            announcement: `${entry.label}, ${entry.count} projects`
          })),
          onActivate: (id) => onActivate(id as DashboardProjectModuleStatus)
        }}
        createOption={(theme) => createProjectLifecycleChartOption({ data, theme, view })}
      />
    </ChartFigure>
  );
}

export function FinancialHealthEChart({ data }: { data: SuperAdminDashboardOverview }) {
  const finance = data.finance;
  const items = [
    { key: "budget", label: "Cost budget", value: finance.costBudgetPaise },
    { key: "recorded", label: "Recorded cost", value: finance.recordedCostPaise },
    { key: "remaining", label: "Remaining budget", value: finance.remainingBudgetPaise }
  ];
  const unavailableReason = suppressionReason(data, [
    "finance.costBudgetPaise", "finance.recordedCostPaise", "finance.remainingBudgetPaise"
  ]);
  const exceptionCount = dashboardMetricPresentation(data.dataQuality, "finance.overBudgetProjectCount", finance.overBudgetProjectCount);
  const approvedRevenue = dashboardMetricPresentation(data.dataQuality, "finance.approvedSubtotalPaise", formatPaise(finance.approvedSubtotalPaise));

  return (
    <ChartFigure
      eyebrow="Financial health"
      title="Budget and recorded cost"
      subtitle="Current approved cost budget against canonical recorded costs. Negative remaining budget is preserved."
      table={{
        caption: "Current financial position in rupees.",
        columns: ["Measure", "Amount"],
        rows: items.map((item) => ({ header: item.label, cells: [formatPaise(item.value)] }))
      }}
      unavailableReason={unavailableReason}
      empty={finance.costBudgetPaise === 0 && finance.recordedCostPaise === 0}
      emptyMessage="No approved cost budget or recorded costs are available yet."
      footnote={`${exceptionCount.value} budget ${finance.overBudgetProjectCount === 1 ? "exception" : "exceptions"} · Approved net revenue ${approvedRevenue.value}`}
    >
      <DashboardEChart
        chartId="dashboard-financial-health"
        height={290}
        description="Current cost budget, recorded cost, and remaining budget."
        interaction={{
          orientation: "vertical",
          items: items.map((item, index) => ({
            id: item.key,
            seriesId: "financial-health",
            dataIndex: index,
            announcement: `${item.label}, ${formatPaise(item.value)}`
          }))
        }}
        createOption={(theme) => ({
          grid: { left: 8, right: 96, top: 12, bottom: 14, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
          tooltip: { trigger: "item", valueFormatter: (value) => formatPaise(Number(value)) },
          xAxis: {
            type: "value",
            axisLabel: { color: theme.mutedText, formatter: (value: number) => compactPaise(value) },
            axisLine: { lineStyle: { color: theme.grid } },
            splitLine: { lineStyle: { color: theme.grid } }
          },
          yAxis: {
            type: "category",
            data: items.map((item) => item.label),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: theme.text, fontWeight: 600 }
          },
          series: [{
            id: "financial-health",
            name: "Amount",
            type: "bar",
            data: items.map((item, index) => ({
              id: item.key,
              name: item.key,
              groupId: item.key,
              value: item.value,
              itemStyle: {
                color: item.key === "remaining"
                  ? item.value < 0 ? theme.status.critical : theme.status.good
                  : theme.series[index]
              }
            })),
            barMaxWidth: 28,
            itemStyle: { borderRadius: 5 },
            label: { show: true, position: "right", color: theme.text, formatter: (params) => formatPaise(Number(params.value)) },
            universalTransition: { enabled: true, divideShape: "clone" }
          }]
        })}
      />
    </ChartFigure>
  );
}
