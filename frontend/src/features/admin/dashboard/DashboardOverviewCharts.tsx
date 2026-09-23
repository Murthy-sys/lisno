import { useState } from "react";

import { ChartFigure } from "../../../components/charts";
import { DashboardEChart } from "./echarts/DashboardEChart";
import { createFinanceCapitalFlows } from "./echarts/DashboardModuleECharts";
import {
  createCapitalFlowSceneOption,
  createSpatialNodeSceneOption,
  createTemporalRibbonSceneOption,
  type SpatialNodeDatum,
  type SpatialTemporalSeries
} from "./echarts/spatialScenes";
import type { DashboardChartTheme, DashboardEChartOption } from "./echarts/types";
import {
  dashboardMetricUnavailableReason,
  dashboardMetricPresentation,
  formatPaise,
  isDashboardMetricUnavailable
} from "./dashboardPresentation";
import type {
  DashboardComparisonBucket,
  DashboardComparisonMetricKey,
  DashboardProjectModuleStatus,
  SuperAdminDashboardOverview
} from "./superAdminDashboardApi";

const utcDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

const formatUtcDate = (value: string) => utcDateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
const formatCount = (value: number | null) => value === null ? "Not available" : value.toLocaleString("en-IN");
const formatMetric = (unit: "count" | "paise", value: number | null) =>
  value === null ? "Not available" : unit === "paise" ? formatPaise(value) : formatCount(value);

const suppressionReason = (data: SuperAdminDashboardOverview, keys: readonly string[]) => {
  const key = keys.find((candidate) => isDashboardMetricUnavailable(data.dataQuality, candidate));
  return key ? dashboardMetricUnavailableReason(data.dataQuality, key) : undefined;
};

type ComparisonConfig = {
  label: string;
  shortLabel: string;
  bucketKey: keyof Pick<
    DashboardComparisonBucket,
    "projectsCreated" | "clientsCreated" | "projectsCompleted" |
    "executionTasksCompleted" | "estimatesApproved" | "designPlansApproved"
  >;
};

const COUNT_COMPARISON_KEYS = [
  "projects_created",
  "clients_created",
  "projects_completed",
  "execution_tasks_completed",
  "estimates_approved",
  "design_plans_approved"
] as const satisfies readonly DashboardComparisonMetricKey[];

const COMPARISON_CONFIG: Record<(typeof COUNT_COMPARISON_KEYS)[number], ComparisonConfig> = {
  projects_created: { label: "Projects created", shortLabel: "Projects", bucketKey: "projectsCreated" },
  clients_created: { label: "Client accounts created", shortLabel: "Client accounts", bucketKey: "clientsCreated" },
  projects_completed: { label: "Projects completed", shortLabel: "Completed", bucketKey: "projectsCompleted" },
  execution_tasks_completed: { label: "Execution tasks completed", shortLabel: "Tasks done", bucketKey: "executionTasksCompleted" },
  estimates_approved: { label: "Estimates approved", shortLabel: "Estimates", bucketKey: "estimatesApproved" },
  design_plans_approved: { label: "Design plans approved", shortLabel: "Designs", bucketKey: "designPlansApproved" }
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

const constellationNodes = (data: SuperAdminDashboardOverview, showComparison: boolean): SpatialNodeDatum[] => {
  const comparison = data.comparison;
  if (!comparison) return [];
  return COUNT_COMPARISON_KEYS.flatMap((key) => {
    const metric = comparison.metrics[key];
    const config = COMPARISON_CONFIG[key];
    const current: SpatialNodeDatum = {
      key: `${key}-current`,
      metricKey: key,
      label: `${config.shortLabel} · Current`,
      value: metric.currentStatus === "available" ? metric.current : null,
      displayValue: formatCount(metric.currentStatus === "available" ? metric.current : null),
      detail: "Current period",
      colorIndex: 0,
      lane: "current",
      available: metric.currentStatus === "available"
    };
    if (!showComparison) return [current];
    return [current, {
      key: `${key}-previous`,
      metricKey: key,
      label: `${config.shortLabel} · Previous`,
      value: metric.previousStatus === "available" ? metric.previous : null,
      displayValue: formatCount(metric.previousStatus === "available" ? metric.previous : null),
      detail: "Previous period",
      colorIndex: 2,
      lane: "previous",
      available: metric.previousStatus === "available"
    }];
  });
};

export function GrowthComparisonChart({ data, showComparison }: { data: SuperAdminDashboardOverview; showComparison: boolean }) {
  const [metricKey, setMetricKey] = useState<(typeof COUNT_COMPARISON_KEYS)[number]>("projects_created");
  const comparison = data.comparison;
  const config = COMPARISON_CONFIG[metricKey];
  const metric = comparison?.metrics[metricKey];
  const format = (value: number | null) => formatMetric("count", value);
  const currentAvailable = metric?.currentStatus === "available";
  const previousMetricAvailable = metric?.previousStatus === "available";
  const previousAvailable = showComparison && previousMetricAvailable;
  const unavailableReason = !comparison
    ? "Previous-period reporting is not available in this response."
    : undefined;
  const currentUnavailableReason = comparison && !currentAvailable
    ? metric?.currentUnavailableReason ?? "Current-period history is unavailable."
    : undefined;
  const current = comparison?.currentBuckets ?? [];
  const previous = comparison?.previousBuckets ?? [];
  const constellationDomainMaximum = comparison ? Math.max(0, ...COUNT_COMPARISON_KEYS.flatMap((key) => {
    const comparisonMetric = comparison.metrics[key];
    return [
      ...(comparisonMetric.currentStatus === "available" && typeof comparisonMetric.current === "number" ? [comparisonMetric.current] : []),
      ...(comparisonMetric.previousStatus === "available" && typeof comparisonMetric.previous === "number" ? [comparisonMetric.previous] : [])
    ];
  })) : 0;
  const temporalDomainMaximum = Math.max(
    0,
    ...(currentAvailable ? current.flatMap((bucket) => typeof bucket[config.bucketKey] === "number" ? [bucket[config.bucketKey]!] : []) : []),
    ...(previousMetricAvailable ? previous.flatMap((bucket) => typeof bucket[config.bucketKey] === "number" ? [bucket[config.bucketKey]!] : []) : [])
  );
  const rowCount = Math.max(current.length, showComparison ? previous.length : 0);
  const temporalSeries: SpatialTemporalSeries[] = [
    {
      key: "current-period",
      label: "Current period",
      values: current.map((bucket) => currentAvailable ? bucket[config.bucketKey] : null),
      displayValues: current.map((bucket) => currentAvailable ? format(bucket[config.bucketKey]) : "Not available"),
      colorIndex: 0,
      depth: -0.5
    },
    ...(showComparison && previousAvailable ? [{
      key: "previous-period",
      label: "Previous period",
      values: previous.map((bucket) => bucket[config.bucketKey]),
      displayValues: previous.map((bucket) => format(bucket[config.bucketKey])),
      colorIndex: 2,
      depth: 0.5
    }] : [])
  ];
  const actions = (
    <label className="dashboard-chart-select">
      <span>Temporal metric</span>
      <select aria-label="Activity field metric" value={metricKey} onChange={(event) => setMetricKey(event.target.value as (typeof COUNT_COMPARISON_KEYS)[number])}>
        {COUNT_COMPARISON_KEYS.map((key) => <option key={key} value={key}>{COMPARISON_CONFIG[key].label}</option>)}
      </select>
    </label>
  );
  const tableRows = Array.from({ length: rowCount }, (_, index) => {
    const currentBucket = current[index];
    const previousBucket = previous[index];
    return {
      header: `Day ${index + 1}`,
      cells: showComparison ? [
        currentBucket ? formatUtcDate(currentBucket.date) : "Not available",
        currentAvailable ? format(currentBucket?.[config.bucketKey] ?? null) : "Not available",
        previousBucket ? formatUtcDate(previousBucket.date) : "Not available",
        previousAvailable ? format(previousBucket?.[config.bucketKey] ?? null) : "Not available"
      ] : [
        currentBucket ? formatUtcDate(currentBucket.date) : "Not available",
        currentAvailable ? format(currentBucket?.[config.bucketKey] ?? null) : "Not available"
      ]
    };
  });
  const nodes = constellationNodes(data, showComparison);

  return (
    <ChartFigure
      eyebrow="Spatial operations atlas"
      title="Operations constellation and temporal field"
      subtitle="Six count metrics share an area-correct constellation. The smallest positive orb uses a one-pixel radius floor above the outlined zero anchor for legibility. The selected metric continues below as a faceted daily surface. Financial paise stays on its own Finance scale."
      actions={actions}
      legend={showComparison && previousAvailable ? [
        { label: "Current period", color: "var(--chart-series-1)", mark: "swatch", value: format(metric?.current ?? null) },
        { label: "Previous period", color: "var(--chart-series-3)", mark: "swatch", value: format(metric?.previous ?? null) }
      ] : undefined}
      table={{
        caption: `Exact UTC values for ${config.label.toLowerCase()}.`,
        columns: showComparison ? ["Day", "Current date", "Current", "Previous date", "Previous"] : ["Day", "Current date", "Current"],
        rows: tableRows
      }}
      unavailableReason={unavailableReason}
      empty={Boolean(comparison && current.length === 0)}
      emptyMessage="No verified daily buckets are available for this period."
      footnote={comparison ? <>
        Current: {formatUtcDate(comparison.window.current.startAt)}–{formatUtcDate(comparison.window.current.endAt)}
        {showComparison ? <> · Previous: {formatUtcDate(comparison.window.previous.startAt)}–{formatUtcDate(comparison.window.previous.endAt)}</> : null}
        {comparison.window.partialFinalDay ? " · Final day is partial" : ""}
        {currentUnavailableReason ? ` · ${currentUnavailableReason}` : ""}
        {showComparison && !previousAvailable ? ` · ${metric?.previousUnavailableReason ?? "Previous history is unavailable."}` : ""}
      </> : undefined}
      className="dashboard-spatial-figure dashboard-spatial-figure--hero"
    >
      <div className="dashboard-atlas-scene-label"><span>01</span><strong>Operations constellation</strong><small>Orb area = count</small></div>
      <DashboardEChart
        chartId="dashboard-operations-constellation"
        className="dashboard-echart--spatial"
        height={320}
        description={`Six count metrics for the current${showComparison ? " and previous" : ""} period, shown as a spatial constellation with area-correct orbs.`}
        interaction={{
          orientation: "radial",
          items: nodes.map((node, dataIndex) => ({ id: node.key, seriesId: "dashboard-operations-constellation", dataIndex, announcement: `${node.label}, ${node.displayValue}` }))
        }}
        createOption={(theme) => createSpatialNodeSceneOption({
          sceneId: "dashboard-operations-constellation",
          layout: "constellation",
          nodes,
          theme,
          connect: false,
          domainMaximum: constellationDomainMaximum
        })}
      />
      <div className="dashboard-atlas-scene-label"><span>02</span><strong>Temporal ribbon field</strong><small>Height = daily count</small></div>
      <DashboardEChart
        chartId="dashboard-growth-ribbon"
        className="dashboard-echart--spatial"
        height={320}
        description={`${config.label} for the current${showComparison && previousAvailable ? " and previous" : ""} reporting period as separated faceted temporal surfaces.`}
        interaction={{
          orientation: "horizontal",
          items: Array.from({ length: rowCount }, (_, dataIndex) => dataIndex).flatMap((dataIndex) => [
            ...(!currentAvailable || current[dataIndex]?.[config.bucketKey] === null || current[dataIndex]?.[config.bucketKey] === undefined ? [] : [{ id: `current-${current[dataIndex].dayIndex}`, seriesId: "current-period", dataIndex, announcement: `Current period, ${formatUtcDate(current[dataIndex].date)}, ${format(current[dataIndex][config.bucketKey])}` }]),
            ...(!showComparison || !previousAvailable || previous[dataIndex]?.[config.bucketKey] === null || previous[dataIndex]?.[config.bucketKey] === undefined ? [] : [{ id: `previous-${previous[dataIndex].dayIndex}`, seriesId: "previous-period", dataIndex, announcement: `Previous period, ${formatUtcDate(previous[dataIndex].date)}, ${format(previous[dataIndex][config.bucketKey])}` }])
          ])
        }}
        createOption={(theme) => createTemporalRibbonSceneOption({
          sceneId: "dashboard-growth-ribbon",
          labels: current.map((bucket) => `Day ${bucket.dayIndex + 1}`),
          keys: current.map((bucket) => bucket.date.slice(0, 10)),
          series: temporalSeries,
          theme,
          domainMaximum: temporalDomainMaximum
        })}
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
  const nodes: SpatialNodeDatum[] = [
    { key: "registered", metricKey: "clients.registeredAccounts", label: "Registered core", value: clients?.registeredAccounts ?? null, displayValue: formatCount(clients?.registeredAccounts ?? null), detail: "All registered Client accounts", available: clients?.registeredAccounts != null, fromKey: null },
    { key: "active", metricKey: "clients.activeAccounts", label: "Active accounts", value: clients?.activeAccounts ?? null, displayValue: formatCount(clients?.activeAccounts ?? null), detail: "Current role cohort", status: "good", available: clients?.activeAccounts != null, fromKey: "registered" },
    { key: "inactive", metricKey: "clients.inactiveAccounts", label: "Inactive accounts", value: clients?.inactiveAccounts ?? null, displayValue: formatCount(clients?.inactiveAccounts ?? null), detail: "Current role cohort", status: "neutral", available: clients?.inactiveAccounts != null, fromKey: "registered" }
  ];
  return (
    <ChartFigure
      eyebrow="Client topology"
      title="Registered Client accounts"
      subtitle="Status satellites attach to the registered-account core; area uses one account-count domain. The smallest positive orb uses a one-pixel radius floor above the outlined zero anchor for legibility."
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
      empty={false}
      emptyMessage="No registered Client accounts are currently stored."
      className="dashboard-spatial-figure"
    >
      <DashboardEChart
        chartId="dashboard-client-topology"
        className="dashboard-echart--spatial"
        height={270}
        description="Registered Client accounts shown as one core with active and inactive status satellites."
        interaction={{ orientation: "radial", items: nodes.map((node, dataIndex) => ({ id: node.key, seriesId: "dashboard-client-topology", dataIndex, announcement: `${node.label}, ${node.displayValue}` })) }}
        createOption={(theme) => createSpatialNodeSceneOption({ sceneId: "dashboard-client-topology", layout: "constellation", nodes, theme, connect: true })}
      />
    </ChartFigure>
  );
}

const lifecycleStages: Array<{ key: DashboardProjectModuleStatus; label: string; value: (data: SuperAdminDashboardOverview) => number; colorIndex: number }> = [
  { key: "planning", label: "Planning", value: (data) => data.projects.planning, colorIndex: 1 },
  { key: "active", label: "Active", value: (data) => data.projects.active, colorIndex: 2 },
  { key: "on_hold", label: "On hold", value: (data) => data.projects.onHold, colorIndex: 3 },
  { key: "completed", label: "Completed", value: (data) => data.projects.completed, colorIndex: 4 }
];

export type LifecycleChartView = "orbit";

export function createProjectLifecycleChartOption({ data, theme }: { data: SuperAdminDashboardOverview; theme: Readonly<DashboardChartTheme>; view?: LifecycleChartView }): DashboardEChartOption {
  const nodes: SpatialNodeDatum[] = lifecycleStages.map((stage) => ({
    key: stage.key,
    metricKey: `projects.${stage.key === "on_hold" ? "onHold" : stage.key}`,
    label: stage.label,
    value: stage.value(data),
    displayValue: formatCount(stage.value(data)),
    colorIndex: stage.colorIndex
  }));
  return createSpatialNodeSceneOption({ sceneId: "project-lifecycle", layout: "orbit", nodes, theme, connect: true });
}

export function ProjectLifecycleEChart({ data, onActivate }: { data: SuperAdminDashboardOverview; onActivate: (status: DashboardProjectModuleStatus) => void }) {
  const values = lifecycleStages.map((stage) => ({ ...stage, count: stage.value(data) }));
  const total = values.reduce((sum, entry) => sum + entry.count, 0);
  const unavailableReason = suppressionReason(data, ["projects.planning", "projects.active", "projects.onHold", "projects.completed"]);
  return (
    <ChartFigure
      eyebrow="Lifecycle orbit"
      title="Current delivery stage"
      subtitle="Fixed waypoints show a current project snapshot. Guides show canonical sequence, not conversion. The smallest positive orb uses a one-pixel radius floor above the outlined zero anchor for legibility. Select a stage to open its list."
      legend={values.map((entry) => ({ label: entry.label, color: `var(--chart-ordinal-${Math.min(entry.colorIndex + 1, 6)})`, value: entry.count.toLocaleString("en-IN") }))}
      table={{
        caption: "Current projects by lifecycle stage.",
        columns: ["Stage", "Projects", "Share"],
        rows: values.map((entry) => ({ header: entry.label, cells: [entry.count.toLocaleString("en-IN"), total > 0 ? `${Math.round(entry.count / total * 100)}%` : "0%"] }))
      }}
      unavailableReason={unavailableReason}
      empty={false}
      emptyMessage="No projects yet, so no lifecycle stage has a value."
      footnote={`${data.projects.liveOverdue} live overdue · ${data.projects.completedLate} completed late`}
      className="dashboard-spatial-figure"
    >
      <DashboardEChart
        chartId="dashboard-project-lifecycle"
        className="dashboard-echart--spatial"
        height={300}
        description={`Current lifecycle orbit across ${total} projects. Orb area encodes project count.`}
        interaction={{
          orientation: "radial",
          items: values.map((entry, dataIndex) => ({ id: entry.key, seriesId: "project-lifecycle", dataIndex, announcement: `${entry.label}, ${entry.count} projects` })),
          onActivate: (id) => onActivate(id as DashboardProjectModuleStatus)
        }}
        createOption={(theme) => createProjectLifecycleChartOption({ data, theme, view: "orbit" })}
      />
    </ChartFigure>
  );
}

export function FinancialHealthEChart({ data }: { data: SuperAdminDashboardOverview }) {
  const finance = data.finance;
  const flows = createFinanceCapitalFlows(data);
  const unavailableReason = suppressionReason(data, flows.flatMap((flow) => flow.metricKey ? [flow.metricKey] : []));
  const exceptionCount = dashboardMetricPresentation(data.dataQuality, "finance.overBudgetProjectCount", finance.overBudgetProjectCount);
  const approvedRevenue = dashboardMetricPresentation(data.dataQuality, "finance.approvedSubtotalPaise", formatPaise(finance.approvedSubtotalPaise));
  return (
    <ChartFigure
      eyebrow="Capital flow"
      title="Approved value and cost lineage"
      subtitle="Net revenue and cost budget reconcile through proportional paise ribbons. Contract total and GST remain context nodes."
      table={{
        caption: "Current financial position in rupees — every plotted value.",
        columns: ["Measure", "Amount", "Lineage"],
        rows: flows.map((flow) => ({
          header: flow.label,
          cells: [flow.displayValue, flow.runningDisplayValue ?? (flow.kind === "context" ? "Context only" : "Verified source")]
        }))
      }}
      unavailableReason={unavailableReason}
      empty={false}
      emptyMessage="No approved cost budget or recorded costs are available yet."
      footnote={`${exceptionCount.value} budget ${finance.overBudgetProjectCount === 1 ? "exception" : "exceptions"} · Approved net revenue ${approvedRevenue.value}`}
      className="dashboard-spatial-figure"
    >
      <DashboardEChart
        chartId="dashboard-financial-capital-flow"
        className="dashboard-echart--spatial"
        height={360}
        description="Approved net revenue, cost budget, recorded cost, remaining budget, and current profit in two reconciled capital-flow lanes."
        interaction={{ orientation: "horizontal", items: flows.map((flow, dataIndex) => ({ id: flow.key, seriesId: "dashboard-financial-capital-flow", dataIndex, announcement: `${flow.label}, ${flow.displayValue}` })) }}
        createOption={(theme) => createCapitalFlowSceneOption({ sceneId: "dashboard-financial-capital-flow", flows, theme })}
      />
    </ChartFigure>
  );
}
