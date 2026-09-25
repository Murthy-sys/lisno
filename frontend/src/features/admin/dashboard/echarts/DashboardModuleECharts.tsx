import type { ReactNode } from "react";

import {
  ChartFigure,
  compactNumber,
  statusColor,
  type ChartLegendEntry,
  type ChartTableView
} from "../../../../components/charts";
import {
  dashboardMetricUnavailableReason,
  formatPaise,
  humanize,
  isDashboardMetricUnavailable,
  workerRoleLabel
} from "../dashboardPresentation";
import type {
  DashboardRatio,
  DashboardRiskLevel,
  SuperAdminDashboardOverview
} from "../superAdminDashboardApi";
import { DashboardEChart } from "./DashboardEChart";
import {
  createCapitalFlowSceneOption,
  createRatioPathSceneOption,
  createSpatialNodeSceneOption,
  createTemporalRibbonSceneOption,
  type SpatialFlowDatum,
  type SpatialNodeDatum,
  type SpatialNodeLayout,
  type SpatialStatus,
  type SpatialTemporalSeries
} from "./spatialScenes";

const utcDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

const formatUtcDate = (value: string) =>
  utcDateFormatter.format(new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value));

const periodNote = (data: SuperAdminDashboardOverview) =>
  `${formatUtcDate(data.period.startAt)} – ${formatUtcDate(data.period.endAt)} · UTC`;

const suppressionReason = (data: SuperAdminDashboardOverview, keys: readonly string[]) => {
  const key = keys.find((candidate) => isDashboardMetricUnavailable(data.dataQuality, candidate));
  return key ? dashboardMetricUnavailableReason(data.dataQuality, key) : undefined;
};

const ratioShare = (ratio: DashboardRatio) => ratio.rateBps === null ? null : ratio.rateBps / 10_000;
const figureToken = (status: SpatialStatus | undefined, index: number) =>
  status ? `var(--chart-status-${status})` : `var(--chart-series-${index % 8 + 1})`;

const stackedValueTable = ({
  caption,
  nodes,
  categoryColumnLabel,
  valueColumnLabel,
  totalLabel = "Total",
  formatTotal = compactNumber
}: {
  caption: string;
  nodes: SpatialNodeDatum[];
  categoryColumnLabel: string;
  valueColumnLabel: string;
  totalLabel?: string;
  formatTotal?: (value: number) => string;
}): ChartTableView => {
  const total = nodes.reduce((sum, node) => sum + Math.max(0, node.value ?? 0), 0);
  const share = (value: number | null) => total === 0 ? "0%" : `${Math.round(Math.max(0, value ?? 0) / total * 100)}%`;
  return {
    caption,
    columns: [categoryColumnLabel, valueColumnLabel, "Share"],
    rows: [
      ...nodes.map((node) => ({ header: node.label, cells: [node.displayValue, share(node.value)] })),
      { header: totalLabel, cells: [formatTotal(total), total > 0 ? "100%" : "0%"] }
    ]
  };
};

function SpatialNodeFigure({
  chartId,
  eyebrow,
  title,
  subtitle,
  layout,
  nodes,
  valueColumnLabel = "Value",
  categoryColumnLabel = "Signal",
  unavailableReason,
  emptyMessage,
  footnote,
  legend,
  connect,
  table
}: {
  chartId: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  layout: SpatialNodeLayout;
  nodes: SpatialNodeDatum[];
  valueColumnLabel?: string;
  categoryColumnLabel?: string;
  unavailableReason?: string;
  emptyMessage?: string;
  footnote?: ReactNode;
  legend?: ChartLegendEntry[];
  connect?: boolean;
  table?: ChartTableView;
}) {
  const scaleDisclosure = "The smallest positive orb uses a one-pixel radius floor above the outlined zero anchor for legibility.";
  return (
    <ChartFigure
      eyebrow={eyebrow}
      title={title}
      subtitle={`${subtitle ? `${subtitle} ` : ""}${scaleDisclosure}`}
      legend={legend}
      table={table ?? {
        caption: `${title} — exact database values.`,
        columns: [categoryColumnLabel, valueColumnLabel, "Context"],
        rows: nodes.map((node) => ({
          header: node.label,
          cells: [node.displayValue, node.detail ?? "—"]
        }))
      }}
      unavailableReason={unavailableReason}
      empty={nodes.length === 0}
      emptyMessage={emptyMessage}
      footnote={footnote}
      className="dashboard-spatial-figure"
    >
      <DashboardEChart
        chartId={chartId}
        className="dashboard-echart--spatial"
        height={layout === "corridor" ? 260 : 290}
        description={`${title}. ${nodes.length} database-backed signals arranged in a ${layout} spatial field. Orb area encodes magnitude; outlined anchors are verified zero.`}
        interaction={{
          orientation: layout === "orbit" ? "radial" : "horizontal",
          items: nodes.map((node, dataIndex) => ({
            id: node.key,
            seriesId: chartId,
            dataIndex,
            announcement: `${node.label}, ${node.displayValue}${node.detail ? `. ${node.detail}` : ""}`
          }))
        }}
        createOption={(theme) => createSpatialNodeSceneOption({ sceneId: chartId, layout, nodes, theme, connect })}
      />
    </ChartFigure>
  );
}

function TemporalRibbonFigure({
  chartId,
  eyebrow,
  title,
  subtitle,
  labels,
  keys,
  series,
  formatValue = compactNumber,
  tableValueColumnLabel = "Date",
  unavailableReason,
  empty,
  footnote
}: {
  chartId: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  labels: string[];
  keys: string[];
  series: Array<{ key: string; label: string; values: Array<number | null> }>;
  formatValue?: (value: number) => string;
  tableValueColumnLabel?: string;
  unavailableReason?: string;
  empty?: boolean;
  footnote?: ReactNode;
}) {
  const spatialSeries: SpatialTemporalSeries[] = series.map((entry) => ({
    ...entry,
    displayValues: entry.values.map((value) => value === null ? "Not available" : formatValue(value))
  }));
  return (
    <ChartFigure
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      legend={series.map((entry, index) => ({ label: entry.label, color: figureToken(undefined, index), mark: "swatch" }))}
      table={{
        caption: `${title} — every plotted value.`,
        columns: [tableValueColumnLabel, ...series.map((entry) => entry.label)],
        rows: labels.map((label, index) => ({
          header: label,
          cells: series.map((entry) => {
            const value = entry.values[index];
            return value === null || value === undefined ? "Not available" : formatValue(value);
          })
        }))
      }}
      unavailableReason={unavailableReason}
      empty={empty}
      footnote={footnote}
      className="dashboard-spatial-figure"
    >
      <DashboardEChart
        chartId={chartId}
        className="dashboard-echart--spatial"
        height={300}
        description={`${title}. Faceted temporal ribbons use linear height over ${labels.length} UTC buckets; separated depth lanes distinguish series and null values split the surface.`}
        interaction={{
          orientation: "horizontal",
          items: labels.flatMap((_label, dataIndex) => series.flatMap((entry) => {
            const value = entry.values[dataIndex];
            return value === null || value === undefined ? [] : [{
              id: `${entry.key}-${keys[dataIndex]}`,
              seriesId: entry.key,
              dataIndex,
              announcement: `${labels[dataIndex]}, ${entry.label}, ${formatValue(value)}`
            }];
          }))
        }}
        createOption={(theme) => createTemporalRibbonSceneOption({ sceneId: chartId, labels, keys, series: spatialSeries, theme })}
      />
    </ChartFigure>
  );
}

function CapitalFlowFigure({
  chartId,
  eyebrow,
  title,
  subtitle,
  flows,
  unavailableReason,
  footnote,
  emptyMessage,
  table
}: {
  chartId: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  flows: SpatialFlowDatum[];
  unavailableReason?: string;
  footnote?: ReactNode;
  emptyMessage?: string;
  table?: ChartTableView;
}) {
  return (
    <ChartFigure
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      legend={[
        { label: "Allocation / inflow", color: "var(--chart-series-1)", mark: "swatch" },
        { label: "Outflow / reverse breach", color: "var(--chart-status-serious)", mark: "swatch" }
      ]}
      table={table ?? {
        caption: `${title} — exact paise lineage.`,
        columns: ["Measure", "Amount", "Lineage"],
        rows: flows.map((flow) => ({
          header: flow.label,
          cells: [flow.displayValue, flow.runningDisplayValue ?? (flow.kind === "context" ? "Context only" : "Database aggregate")]
        }))
      }}
      unavailableReason={unavailableReason}
      empty={flows.length === 0}
      emptyMessage={emptyMessage}
      footnote={footnote}
      className="dashboard-spatial-figure"
    >
      <DashboardEChart
        chartId={chartId}
        className="dashboard-echart--spatial"
        height={350}
        description={`${title}. Ribbon width is linear in absolute paise; direction and colour preserve signed allocations and overspend.`}
        interaction={{
          orientation: "horizontal",
          items: flows.map((flow, dataIndex) => ({
            id: flow.key,
            seriesId: chartId,
            dataIndex,
            announcement: `${flow.label}, ${flow.displayValue}${flow.runningDisplayValue ? `. ${flow.runningDisplayValue}` : ""}`
          }))
        }}
        createOption={(theme) => createCapitalFlowSceneOption({ sceneId: chartId, flows, theme })}
      />
    </ChartFigure>
  );
}

function RatioPathFigure({
  chartId,
  label,
  share,
  displayValue,
  detail,
  status,
  unavailableReason
}: {
  chartId: string;
  label: string;
  share: number | null;
  displayValue: string;
  detail?: string;
  status: SpatialStatus;
  unavailableReason?: string;
}) {
  return (
    <ChartFigure
      eyebrow="Calibrated path"
      title={label}
      subtitle="The checkpoint follows a fixed 0–100% spatial path; values outside the range remain exact in the ledger."
      table={{
        caption: `${label} — exact value.`,
        columns: ["Measure", "Value", "Basis"],
        rows: [{ header: label, cells: [displayValue, detail ?? "—"] }]
      }}
      unavailableReason={unavailableReason}
      className="dashboard-spatial-figure dashboard-spatial-figure--compact"
    >
      <DashboardEChart
        chartId={chartId}
        className="dashboard-echart--spatial"
        height={190}
        description={`${label}, ${displayValue}. Calibrated spatial checkpoint from zero to one hundred percent.`}
        interaction={{
          orientation: "horizontal",
          items: [{ id: "checkpoint", seriesId: chartId, dataIndex: 0, announcement: `${label}, ${displayValue}${detail ? `. ${detail}` : ""}` }]
        }}
        createOption={(theme) => createRatioPathSceneOption({ sceneId: chartId, label, share, displayValue, detail, status, theme })}
      />
    </ChartFigure>
  );
}

const riskStatus: Record<DashboardRiskLevel, SpatialStatus> = {
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

export function ProjectFlowChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <TemporalRibbonFigure
    chartId="dashboard-project-flow"
    eyebrow="Temporal terrain"
    title="Projects created and completed"
    subtitle="Daily database events form two separated faceted depth lanes."
    labels={data.trends.map((bucket) => formatUtcDate(bucket.date))}
    keys={data.trends.map((bucket) => bucket.date)}
    series={[
      { key: "created", label: "Created", values: data.trends.map((bucket) => bucket.projectsCreated) },
      { key: "completed", label: "Completed", values: data.trends.map((bucket) => bucket.projectsCompleted) }
    ]}
    unavailableReason={suppressionReason(data, ["trends.projectsCreated", "trends.projectsCompleted"])}
    empty={data.trends.length === 0}
    footnote={periodNote(data)}
  />;
}

export function ApprovalThroughputChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <TemporalRibbonFigure
    chartId="dashboard-approval-throughput"
    eyebrow="Temporal terrain"
    title="Approvals and completed work"
    subtitle="Estimate approvals, design approvals, and completed execution work occupy separate depth lanes."
    labels={data.trends.map((bucket) => formatUtcDate(bucket.date))}
    keys={data.trends.map((bucket) => bucket.date)}
    series={[
      { key: "estimates", label: "Estimates approved", values: data.trends.map((bucket) => bucket.estimatesApproved) },
      { key: "designs", label: "Design plans approved", values: data.trends.map((bucket) => bucket.designPlansApproved) },
      { key: "tasks", label: "Tasks completed", values: data.trends.map((bucket) => bucket.workflowTasksCompleted) }
    ]}
    unavailableReason={suppressionReason(data, ["trends.estimatesApproved", "trends.designPlansApproved", "trends.workflowTasksCompleted"])}
    empty={data.trends.length === 0}
    footnote={periodNote(data)}
  />;
}

export function DesignApprovalTrendChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <TemporalRibbonFigure
    chartId="dashboard-design-approval-trend"
    eyebrow="Review activity terrain"
    title="Design approvals over time"
    subtitle="Verified design-plan approvals rise from a fixed UTC floor; missing source history breaks the surface instead of becoming zero."
    labels={data.trends.map((bucket) => formatUtcDate(bucket.date))}
    keys={data.trends.map((bucket) => bucket.date)}
    series={[{ key: "designs", label: "Design plans approved", values: data.trends.map((bucket) => bucket.designPlansApproved) }]}
    unavailableReason={suppressionReason(data, ["trends.designPlansApproved"])}
    empty={data.trends.length === 0}
    footnote={periodNote(data)}
  />;
}

export function ExecutionCompletionTrendChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <TemporalRibbonFigure
    chartId="dashboard-execution-completion-trend"
    eyebrow="Completion terrain"
    title="Completed execution work over time"
    subtitle="Verified completed tasks form a faceted UTC activity ribbon with linear height."
    labels={data.trends.map((bucket) => formatUtcDate(bucket.date))}
    keys={data.trends.map((bucket) => bucket.date)}
    series={[{ key: "tasks", label: "Tasks completed", values: data.trends.map((bucket) => bucket.workflowTasksCompleted) }]}
    unavailableReason={suppressionReason(data, ["trends.workflowTasksCompleted"])}
    empty={data.trends.length === 0}
    footnote={periodNote(data)}
  />;
}

export function ExpenseTrendChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <TemporalRibbonFigure
    chartId="dashboard-recorded-expenses-trend"
    eyebrow="Capital terrain"
    title="Recorded expenses"
    subtitle="Daily recorded expenses selected by incurred date, isolated on a paise scale."
    labels={data.trends.map((bucket) => formatUtcDate(bucket.date))}
    keys={data.trends.map((bucket) => bucket.date)}
    tableValueColumnLabel="Incurred date"
    series={[{ key: "expenses", label: "Recorded expenses", values: data.trends.map((bucket) => bucket.ledgerExpensesPostedPaise) }]}
    formatValue={formatPaise}
    unavailableReason={suppressionReason(data, ["trends.ledgerExpensesPostedPaise"])}
    empty={data.trends.length === 0}
    footnote={`${periodNote(data)} · Incurred-date basis`}
  />;
}

export function ProjectLifecycleChart({ data }: { data: SuperAdminDashboardOverview }) {
  const nodes: SpatialNodeDatum[] = [
    { key: "planning", metricKey: "projects.planning", label: "Planning", value: data.projects.planning, displayValue: compactNumber(data.projects.planning) },
    { key: "active", metricKey: "projects.active", label: "Active", value: data.projects.active, displayValue: compactNumber(data.projects.active) },
    { key: "on_hold", metricKey: "projects.onHold", label: "On hold", value: data.projects.onHold, displayValue: compactNumber(data.projects.onHold), status: "warning" },
    { key: "completed", metricKey: "projects.completed", label: "Completed", value: data.projects.completed, displayValue: compactNumber(data.projects.completed), status: "good" }
  ];
  return <SpatialNodeFigure
    chartId="dashboard-module-project-lifecycle"
    eyebrow="Lifecycle orbit"
    title="Projects by current stage"
    subtitle="Fixed stage positions show a current snapshot. Guide paths show sequence, not measured conversion."
    layout="orbit"
    nodes={nodes}
    categoryColumnLabel="Stage"
    valueColumnLabel="Projects"
    unavailableReason={suppressionReason(data, ["projects.planning", "projects.active", "projects.onHold", "projects.completed"])}
    emptyMessage="No projects yet, so no stage has a value."
    footnote={`${data.projects.liveOverdue} live overdue · ${data.projects.completedLate} completed late`}
    table={stackedValueTable({
      caption: "Projects by stage — every plotted value.",
      nodes,
      categoryColumnLabel: "Stage",
      valueColumnLabel: "Projects"
    })}
  />;
}

export function RiskDistributionChart({ data }: { data: SuperAdminDashboardOverview }) {
  const levels: DashboardRiskLevel[] = ["red", "yellow", "green", "gray"];
  const nodes: SpatialNodeDatum[] = levels.map((level) => ({
    key: level,
    metricKey: `risk.projectDistribution.${level}`,
    label: riskLabel[level],
    value: data.risk.projectDistribution[level],
    displayValue: compactNumber(data.risk.projectDistribution[level]),
    status: riskStatus[level],
    detail: "Current project snapshot"
  }));
  return <SpatialNodeFigure
    chartId="dashboard-module-risk-distribution"
    eyebrow="Risk contour field"
    title="Portfolio risk field"
    subtitle="Full contour halos surround fixed risk beacons; orb area encodes project count."
    layout="risk"
    nodes={nodes}
    categoryColumnLabel="Band"
    valueColumnLabel="Projects"
    unavailableReason={suppressionReason(data, ["risk.projectDistribution"])}
    emptyMessage="No projects are tracked, so no risk band has a value."
    legend={levels.map((level) => ({ label: riskLabel[level], color: statusColor(riskStatus[level]), mark: "swatch" }))}
    connect={false}
    table={stackedValueTable({
      caption: "Risk mix — every plotted value.",
      nodes,
      categoryColumnLabel: "Band",
      valueColumnLabel: "Projects"
    })}
  />;
}

export function RiskFactorChart({ data }: { data: SuperAdminDashboardOverview }) {
  const nodes: SpatialNodeDatum[] = data.risk.factorDistribution.map((factor) => ({
    key: `${factor.kind}-${factor.level}-${factor.reasonCode}`,
    metricKey: `risk.factorDistribution.${factor.kind}.${factor.reasonCode}`,
    label: humanize(factor.reasonCode),
    value: factor.occurrenceCount,
    displayValue: compactNumber(factor.occurrenceCount),
    status: riskStatus[factor.level],
    detail: `${humanize(factor.kind)} · across ${factor.projectCount} ${factor.projectCount === 1 ? "project" : "projects"}`
  }));
  return <SpatialNodeFigure
    chartId="dashboard-risk-factor-occurrences"
    eyebrow="Risk signal field"
    title="Risk factor occurrences"
    subtitle="Each beacon carries one verified reason code and its reported severity band."
    layout="risk"
    nodes={nodes}
    categoryColumnLabel="Reason"
    valueColumnLabel="Occurrences"
    unavailableReason={suppressionReason(data, ["risk.factorDistribution"])}
    emptyMessage="No eligible risk factors are currently tracked."
    legend={[
      { label: "Red risk", color: statusColor("critical"), mark: "swatch" },
      { label: "Yellow risk", color: statusColor("warning"), mark: "swatch" }
    ]}
    connect={false}
    table={{
      caption: "Risk factor occurrences — every plotted value.",
      columns: ["Reason", "Occurrences", "Scope"],
      rows: nodes.map((node) => ({ header: node.label, cells: [node.displayValue, node.detail ?? "—"] }))
    }}
  />;
}

export const createFinanceCapitalFlows = (data: SuperAdminDashboardOverview): SpatialFlowDatum[] => {
  const finance = data.finance;
  return [
    { key: "contract", metricKey: "finance.approvedContractTotalPaise", label: "Contract total", value: finance.approvedContractTotalPaise, displayValue: formatPaise(finance.approvedContractTotalPaise), kind: "context", fromKey: null, point: { x: -0.9, y: 0.82, z: -0.55 } },
    { key: "gst", metricKey: "finance.approvedGstPaise", label: "GST context", value: finance.approvedGstPaise, displayValue: formatPaise(finance.approvedGstPaise), kind: "context", fromKey: null, point: { x: -0.9, y: 0.5, z: 0.5 } },
    { key: "net", metricKey: "finance.approvedSubtotalPaise", label: "Net revenue", value: finance.approvedSubtotalPaise, displayValue: formatPaise(finance.approvedSubtotalPaise), kind: "source", fromKey: null, point: { x: -0.5, y: 0.5, z: 0 } },
    { key: "target-profit", metricKey: "finance.targetProfitPaise", label: "Target profit", value: finance.targetProfitPaise, displayValue: formatPaise(finance.targetProfitPaise), runningDisplayValue: "Allocation from net revenue", kind: "allocation", fromKey: "net", point: { x: 0.04, y: 0.79, z: -0.46 } },
    { key: "budget", metricKey: "finance.costBudgetPaise", label: "Cost budget", value: finance.costBudgetPaise, displayValue: formatPaise(finance.costBudgetPaise), runningDisplayValue: "Allocation from net revenue", kind: "allocation", fromKey: "net", point: { x: 0.02, y: 0.29, z: 0.42 } },
    { key: "recorded", metricKey: "finance.recordedCostPaise", label: "Recorded cost", value: finance.recordedCostPaise, displayValue: formatPaise(finance.recordedCostPaise), runningDisplayValue: "Applied against cost budget", kind: "outflow", fromKey: "budget", point: { x: 0.63, y: 0.52, z: -0.36 } },
    { key: "remaining", metricKey: "finance.remainingBudgetPaise", label: "Remaining budget", value: finance.remainingBudgetPaise, displayValue: formatPaise(finance.remainingBudgetPaise), runningDisplayValue: "Cost budget − recorded cost", kind: "outcome", fromKey: "budget", point: { x: 0.64, y: 0.16, z: 0.48 } },
    { key: "current-profit", metricKey: "finance.currentProfitPaise", label: "Current profit", value: finance.currentProfitPaise, displayValue: formatPaise(finance.currentProfitPaise), runningDisplayValue: "Net revenue − recorded cost", kind: "outcome", fromKey: null, point: { x: 0.9, y: 0.82, z: 0.06 } }
  ];
};

const financeReconciliationTable = (data: SuperAdminDashboardOverview): ChartTableView => {
  const flows = createFinanceCapitalFlows(data);
  const values = Object.fromEntries(flows.map((flow) => [flow.key, flow.value]));
  const adjustmentByKey: Record<string, string> = {
    gst: `−${formatPaise(values.gst)}`,
    "target-profit": `−${formatPaise(values["target-profit"])}`,
    recorded: `−${formatPaise(values.recorded)}`
  };
  const positionByKey: Record<string, string> = {
    contract: "Context only",
    gst: formatPaise(values.net),
    net: formatPaise(values.net),
    "target-profit": formatPaise(values.budget),
    budget: formatPaise(values.budget),
    recorded: formatPaise(values.remaining),
    remaining: formatPaise(values.remaining),
    "current-profit": formatPaise(values["current-profit"])
  };
  return {
    caption: "Capital-flow reconciliation — every plotted value.",
    columns: ["Step", "Plotted amount", "Adjustment", "Reconciled position"],
    rows: flows.map((flow) => ({
      header: flow.label,
      cells: [flow.displayValue, adjustmentByKey[flow.key] ?? "—", positionByKey[flow.key] ?? "—"]
    }))
  };
};

export function CapitalFlowChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <CapitalFlowFigure
    chartId="dashboard-finance-capital-flow"
    eyebrow="Capital flow"
    title="Approved value and cost lineage"
    subtitle="Two reconciled lanes: net revenue allocates to target profit and cost budget; cost budget resolves to recorded cost and remaining budget. Contract total and GST stay context-only."
    flows={createFinanceCapitalFlows(data)}
    unavailableReason={suppressionReason(data, [
      "finance.approvedContractTotalPaise", "finance.approvedGstPaise", "finance.approvedSubtotalPaise",
      "finance.targetProfitPaise", "finance.costBudgetPaise", "finance.recordedCostPaise",
      "finance.remainingBudgetPaise", "finance.currentProfitPaise"
    ])}
    footnote={`Across ${data.finance.projectCount} ${data.finance.projectCount === 1 ? "project" : "projects"} with a verified finance bucket.`}
    table={financeReconciliationTable(data)}
  />;
}

export function SpendCompositionChart({ data }: { data: SuperAdminDashboardOverview }) {
  const finance = data.finance;
  const flows: SpatialFlowDatum[] = [
    { key: "recorded", metricKey: "finance.recordedCostPaise", label: "Recorded cost", value: finance.recordedCostPaise, displayValue: formatPaise(finance.recordedCostPaise), kind: "source", fromKey: null, point: { x: -0.72, y: 0.48, z: 0 } },
    { key: "procurement", metricKey: "finance.procurementCostPaise", label: "Procurement", value: finance.procurementCostPaise, displayValue: formatPaise(finance.procurementCostPaise), kind: "outflow", fromKey: "recorded", point: { x: 0.25, y: 0.8, z: -0.56 } },
    { key: "employee", metricKey: "finance.employeePaymentPaise", label: "Employee payments", value: finance.employeePaymentPaise, displayValue: formatPaise(finance.employeePaymentPaise), kind: "outflow", fromKey: "recorded", point: { x: 0.72, y: 0.57, z: -0.18 } },
    { key: "other", metricKey: "finance.otherExpensePaise", label: "Other expenses", value: finance.otherExpensePaise, displayValue: formatPaise(finance.otherExpensePaise), kind: "outflow", fromKey: "recorded", point: { x: 0.62, y: 0.25, z: 0.34 } },
    { key: "overhead", metricKey: "finance.overheadPaise", label: "Overheads", value: finance.overheadPaise, displayValue: formatPaise(finance.overheadPaise), kind: "outflow", fromKey: "recorded", point: { x: -0.08, y: 0.12, z: 0.62 } }
  ];
  return <CapitalFlowFigure
    chartId="dashboard-expense-composition"
    eyebrow="Cost topology"
    title="Recorded expense composition"
    subtitle="Each ribbon leaves the one recorded-cost source; width is linear in paise."
    flows={flows}
    unavailableReason={suppressionReason(data, ["finance.recordedCostPaise", "finance.procurementCostPaise", "finance.employeePaymentPaise", "finance.otherExpensePaise", "finance.overheadPaise"])}
    emptyMessage="No recorded expenses are available."
    table={stackedValueTable({
      caption: "Expense composition — every plotted value.",
      nodes: flows.slice(1),
      categoryColumnLabel: "Class",
      valueColumnLabel: "Amount",
      totalLabel: "Total recorded expenses",
      formatTotal: formatPaise
    })}
  />;
}

function deliveryNodes(entries: Array<[string, string, number, string?]>): SpatialNodeDatum[] {
  return entries.map(([key, label, value, metricKey], index) => ({
    key,
    metricKey: metricKey ?? key,
    label,
    value,
    displayValue: compactNumber(value),
    colorIndex: index,
    detail: "Current snapshot"
  }));
}

export function EstimationDeliveryCorridor({ data }: { data: SuperAdminDashboardOverview }) {
  const value = data.estimation;
  const nodes = deliveryNodes([
    ["none", "No estimate", value.noEstimate, "estimation.noEstimate"],
    ["draft", "Draft / internal", value.draftInternal, "estimation.draftInternal"],
    ["ready", "Ready to send", value.readyToSend, "estimation.readyToSend"],
    ["awaiting", "Awaiting Client", value.awaitingClient, "estimation.awaitingClient"],
    ["changes", "Changes requested", value.changesRequested, "estimation.changesRequested"],
    ["approved", "Client approved", value.clientApproved, "estimation.clientApproved"]
  ]);
  return <SpatialNodeFigure
    chartId="dashboard-estimation-corridor"
    eyebrow="Delivery corridor"
    title="Estimate stage field"
    subtitle="Ordered waypoints show current stage counts. Thin guides show workflow order, not conversion."
    layout="corridor"
    nodes={nodes}
    categoryColumnLabel="Stage"
    valueColumnLabel="Projects"
    unavailableReason={suppressionReason(data, ["estimation.noEstimate", "estimation.draftInternal", "estimation.readyToSend", "estimation.awaitingClient", "estimation.changesRequested", "estimation.clientApproved"])}
    footnote={`${value.eligibleProjects} eligible · ${value.trackedProjects} tracked · ${value.unavailableProjects} unavailable`}
    table={stackedValueTable({ caption: "Estimates by stage — every plotted value.", nodes, categoryColumnLabel: "Stage", valueColumnLabel: "Projects" })}
  />;
}

export function DesignDeliveryCorridor({ data }: { data: SuperAdminDashboardOverview }) {
  const value = data.design;
  const nodes = deliveryNodes([
    ["pending", "Pending assignment", value.pendingAssignment, "design.pendingAssignment"],
    ["assigned", "Assigned", value.assigned, "design.assigned"],
    ["progress", "In progress", value.inProgress, "design.inProgress"],
    ["ready", "Ready for Client", value.readyForClient, "design.readyForClient"],
    ["changes", "Changes requested", value.changesRequested, "design.changesRequested"],
    ["approved", "Approved", value.approved, "design.approved"]
  ]);
  return <SpatialNodeFigure
    chartId="dashboard-design-corridor"
    eyebrow="Delivery corridor"
    title="Design review field"
    subtitle="Ordered waypoints show current stage counts. Thin guides show workflow order, not conversion."
    layout="corridor"
    nodes={nodes}
    categoryColumnLabel="Stage"
    valueColumnLabel="Projects"
    unavailableReason={suppressionReason(data, ["design.pendingAssignment", "design.assigned", "design.inProgress", "design.readyForClient", "design.changesRequested", "design.approved"])}
    footnote={`${value.eligibleProjects} eligible · ${value.trackedProjects} tracked · ${value.unavailableProjects} unavailable`}
    table={stackedValueTable({ caption: "Design plans by stage — every plotted value.", nodes, categoryColumnLabel: "Stage", valueColumnLabel: "Projects" })}
  />;
}

export function ProcurementDeliveryCorridor({ data }: { data: SuperAdminDashboardOverview }) {
  const value = data.procurement;
  const nodes = deliveryNodes([
    ["not_started", "Not started", value.notStarted, "procurement.notStarted"],
    ["open", "Open", value.open, "procurement.open"],
    ["progress", "In progress", value.inProgress, "procurement.inProgress"],
    ["completed", "Completed", value.completed, "procurement.completed"]
  ]);
  return <SpatialNodeFigure
    chartId="dashboard-procurement-corridor"
    eyebrow="Delivery corridor"
    title="Procurement state field"
    subtitle="Current task-state waypoints with neutral workflow-order guides."
    layout="corridor"
    nodes={nodes}
    categoryColumnLabel="State"
    valueColumnLabel="Tasks"
    unavailableReason={suppressionReason(data, ["procurement.notStarted", "procurement.open", "procurement.inProgress", "procurement.completed"])}
    footnote={`${value.eligibleProjects} eligible · ${value.trackedProjects} tracked · ${value.unavailableProjects} unavailable`}
    table={stackedValueTable({ caption: "Procurement tasks by stage — every plotted value.", nodes, categoryColumnLabel: "Stage", valueColumnLabel: "Tasks" })}
  />;
}

export function ExecutionStateChart({ data }: { data: SuperAdminDashboardOverview }) {
  const value = data.execution;
  const nodes = deliveryNodes([
    ["open", "Open", value.open, "execution.open"],
    ["progress", "In progress", value.inProgress, "execution.inProgress"],
    ["completed", "Completed", value.completed, "execution.completed"]
  ]);
  return <SpatialNodeFigure
    chartId="dashboard-execution-corridor"
    eyebrow="Delivery corridor"
    title="Execution state field"
    subtitle="Task-state waypoints are a current snapshot; guides do not imply measured conversion."
    layout="corridor"
    nodes={nodes}
    categoryColumnLabel="State"
    valueColumnLabel="Tasks"
    unavailableReason={suppressionReason(data, ["execution.open", "execution.inProgress", "execution.completed"])}
    footnote={`${value.overdue} overdue · ${value.unassigned} unassigned · ${value.overdueUnassigned} overdue and unassigned`}
    table={stackedValueTable({ caption: "Execution tasks by state — every plotted value.", nodes, categoryColumnLabel: "State", valueColumnLabel: "Tasks" })}
  />;
}

export function WorkerRoleChart({ data }: { data: SuperAdminDashboardOverview }) {
  const nodes: SpatialNodeDatum[] = data.workforce.roleDistribution.map((entry, index) => ({
    key: entry.role,
    metricKey: `workforce.roleDistribution.${entry.role}`,
    label: workerRoleLabel(entry.role),
    value: entry.workerCount,
    displayValue: compactNumber(entry.workerCount),
    colorIndex: index,
    detail: "Active workers"
  }));
  return <SpatialNodeFigure
    chartId="dashboard-worker-role-topology"
    eyebrow="Capacity topology"
    title="Active workers by trade"
    subtitle="Independent trade nodes use one shared worker-count domain."
    layout="topology"
    nodes={nodes}
    categoryColumnLabel="Trade"
    valueColumnLabel="Workers"
    unavailableReason={suppressionReason(data, ["workforce.roleDistribution"])}
    emptyMessage="No active workers are recorded for this period."
    connect={false}
    table={{
      caption: "Active workers by trade — every plotted value.",
      columns: ["Trade", "Workers"],
      rows: nodes.map((node) => ({ header: node.label, cells: [node.displayValue] }))
    }}
  />;
}

export function ExecutionRoleChart({ data }: { data: SuperAdminDashboardOverview }) {
  const nodes: SpatialNodeDatum[] = data.execution.roleDistribution.map((entry, index) => ({
    key: entry.role,
    metricKey: `execution.roleDistribution.${entry.role}`,
    label: humanize(entry.role.replace(/^worker_/, "")),
    value: entry.taskCount,
    displayValue: compactNumber(entry.taskCount),
    colorIndex: index,
    detail: "Execution tasks"
  }));
  return <SpatialNodeFigure
    chartId="dashboard-execution-role-topology"
    eyebrow="Work topology"
    title="Execution tasks by trade"
    subtitle="Task-role nodes are separate from workforce headcount and use their own task scale."
    layout="topology"
    nodes={nodes}
    categoryColumnLabel="Trade"
    valueColumnLabel="Tasks"
    unavailableReason={suppressionReason(data, ["execution.roleDistribution"])}
    emptyMessage="No execution tasks carry a verified trade."
    connect={false}
    table={{
      caption: "Execution tasks by trade — every plotted value.",
      columns: ["Trade", "Tasks"],
      rows: nodes.map((node) => ({ header: node.label, cells: [node.displayValue] }))
    }}
  />;
}

export function WorkforceAssignmentChart({ data }: { data: SuperAdminDashboardOverview }) {
  const value = data.workforce;
  const nodes: SpatialNodeDatum[] = [
    { key: "active", metricKey: "workforce.activeWorkers", label: "Active-worker core", value: value.activeWorkers, displayValue: compactNumber(value.activeWorkers), detail: "Current active workers", fromKey: null },
    { key: "assigned", metricKey: "workforce.assignedWorkers", label: "With assignments", value: value.assignedWorkers, displayValue: compactNumber(value.assignedWorkers), status: "good", detail: "Attached to active-worker core", fromKey: "active" },
    { key: "unassigned", metricKey: "workforce.unassignedWorkers", label: "Without assignments", value: value.unassignedWorkers, displayValue: compactNumber(value.unassignedWorkers), status: "warning", detail: "Attached to active-worker core", fromKey: "active" }
  ];
  return <SpatialNodeFigure
    chartId="dashboard-workforce-assignment-topology"
    eyebrow="Capacity topology"
    title="Worker assignment field"
    subtitle="Assigned and unassigned satellites attach to the active-worker core."
    layout="constellation"
    nodes={nodes}
    categoryColumnLabel="State"
    valueColumnLabel="Workers"
    unavailableReason={suppressionReason(data, ["workforce.activeWorkers", "workforce.assignedWorkers", "workforce.unassignedWorkers"])}
    footnote={`${value.activeAssignedTaskCount} active assigned tasks · ${value.activeUnassignedTaskCount} active unassigned · ${value.inactiveAssigneeTaskCount} inactive-assignee exceptions`}
    connect
    table={stackedValueTable({
      caption: "Workers by assignment state — every plotted value.",
      nodes: nodes.slice(1),
      categoryColumnLabel: "State",
      valueColumnLabel: "Workers"
    })}
  />;
}

export function GovernanceQueueChart({ data }: { data: SuperAdminDashboardOverview }) {
  const value = data.governance;
  const node = (
    key: string,
    metricKey: string,
    label: string,
    metricValue: number,
    status?: SpatialStatus
  ): SpatialNodeDatum => {
    const unavailable = isDashboardMetricUnavailable(data.dataQuality, metricKey);
    return {
      key,
      metricKey,
      label,
      value: unavailable ? null : metricValue,
      displayValue: unavailable ? "Not available" : compactNumber(metricValue),
      status,
      available: !unavailable,
      detail: unavailable ? dashboardMetricUnavailableReason(data.dataQuality, metricKey) : undefined
    };
  };
  const nodes: SpatialNodeDatum[] = [
    node("invitations", "governance.pendingInvitations", "Pending invitations", value.pendingInvitations),
    node("expired", "governance.expiredInvitations", "Expired invitations", value.expiredInvitations, "warning"),
    node("invitation-failures", "governance.failedInvitationDeliveries", "Failed invitation deliveries", value.failedInvitationDeliveries, "critical"),
    node("access", "governance.pendingAccessRequests", "Access requests", value.pendingAccessRequests),
    node("client", "governance.pendingClientResponses", "Client responses", value.pendingClientResponses),
    node("client-failures", "governance.failedClientDeliveries", "Failed client deliveries", value.failedClientDeliveries, "critical"),
    node("client-disabled", "governance.disabledClientDeliveries", "Disabled client deliveries", value.disabledClientDeliveries, "neutral"),
    node("design", "governance.pendingDesignResponses", "Design responses", value.pendingDesignResponses),
    node("design-failures", "governance.failedDesignDeliveries", "Failed design deliveries", value.failedDesignDeliveries, "critical"),
    node("design-disabled", "governance.disabledDesignDeliveries", "Disabled design deliveries", value.disabledDesignDeliveries, "neutral")
  ];
  return <SpatialNodeFigure
    chartId="dashboard-governance-topology"
    eyebrow="Governance topology"
    title="Administrator attention field"
    subtitle="Queue, failure, and disabled-delivery nodes retain their independent source lineage."
    layout="topology"
    nodes={nodes}
    valueColumnLabel="Waiting"
    connect={false}
  />;
}

export function BudgetConsumptionPath({ data }: { data: SuperAdminDashboardOverview }) {
  const { costBudgetPaise, recordedCostPaise, remainingBudgetPaise, overBudgetProjectCount } = data.finance;
  const reason = suppressionReason(data, ["finance.costBudgetPaise", "finance.recordedCostPaise"]);
  const share = costBudgetPaise > 0 ? recordedCostPaise / costBudgetPaise : null;
  const status: SpatialStatus = share === null ? "neutral" : share > 1 ? "critical" : share > 0.85 ? "warning" : "good";
  return <RatioPathFigure
    chartId="dashboard-budget-consumption-path"
    label="Cost budget consumed"
    share={reason ? null : share}
    displayValue={share === null ? "Not available" : `${Math.round(share * 100)}% · ${formatPaise(recordedCostPaise)} recorded expenses`}
    detail={share === null ? undefined : `${formatPaise(remainingBudgetPaise)} remaining of ${formatPaise(costBudgetPaise)} · ${overBudgetProjectCount} budget ${overBudgetProjectCount === 1 ? "exception" : "exceptions"}`}
    status={status}
    unavailableReason={reason}
  />;
}

export function MarginPath({ data }: { data: SuperAdminDashboardOverview }) {
  const reason = suppressionReason(data, ["finance.currentMarginBps"]);
  const marginBps = data.finance.currentMarginBps;
  const share = marginBps === null ? null : marginBps / 10_000;
  const status: SpatialStatus = marginBps === null ? "neutral" : marginBps < 0 ? "critical" : marginBps < 1000 ? "warning" : "good";
  return <RatioPathFigure
    chartId="dashboard-margin-path"
    label="Current margin (live)"
    share={reason ? null : share}
    displayValue={marginBps === null ? "Not available" : `${(marginBps / 100).toFixed(2)}%`}
    detail={`${formatPaise(data.finance.currentProfitPaise)} live profit against ${formatPaise(data.finance.approvedSubtotalPaise)} net revenue`}
    status={status}
    unavailableReason={reason ?? (marginBps === null ? "No eligible margin denominator." : undefined)}
  />;
}

export function ProcurementSpendPath({ data }: { data: SuperAdminDashboardOverview }) {
  const { plannedAmountPaise, postedSpendPaise } = data.procurement;
  const reason = suppressionReason(data, ["procurement.approvedAmountPaise", "procurement.postedSpendPaise"]);
  const share = plannedAmountPaise === null || plannedAmountPaise <= 0 ? null : postedSpendPaise / plannedAmountPaise;
  const status: SpatialStatus = share === null ? "neutral" : share > 1 ? "critical" : share > 0.9 ? "warning" : "good";
  return <RatioPathFigure
    chartId="dashboard-procurement-spend-path"
    label="Posted against approved procurement"
    share={reason ? null : share}
    displayValue={share === null ? "Not available" : `${Math.round(share * 100)}%`}
    detail={share === null ? undefined : `${formatPaise(postedSpendPaise)} posted of ${formatPaise(plannedAmountPaise!)} approved`}
    status={status}
    unavailableReason={reason ?? (share === null ? "No authoritative approved procurement amount." : undefined)}
  />;
}

export function ExecutionProgressPath({ data }: { data: SuperAdminDashboardOverview }) {
  const progress = data.execution.weightedProgress;
  const reason = suppressionReason(data, ["execution.weightedProgress"]);
  const share = ratioShare(progress);
  const status: SpatialStatus = share === null ? "neutral" : share >= 0.75 ? "good" : share >= 0.4 ? "warning" : "serious";
  return <RatioPathFigure
    chartId="dashboard-execution-progress-path"
    label="Weighted execution progress"
    share={reason ? null : share}
    displayValue={share === null ? "Not available" : `${(progress.rateBps! / 100).toFixed(2)}%`}
    detail={`${progress.numerator} of ${progress.denominator} effort units · ${progress.fallbackTaskCount} fallback ${progress.fallbackTaskCount === 1 ? "task" : "tasks"}`}
    status={status}
    unavailableReason={reason ?? (share === null ? "No eligible effort denominator." : undefined)}
  />;
}

export function WorkforceKpiPath({ data }: { data: SuperAdminDashboardOverview }) {
  const reason = suppressionReason(data, ["workforce.averageKpi"]);
  const averageKpi = data.workforce.averageKpi;
  const share = ratioShare(averageKpi);
  const status: SpatialStatus = share === null ? "neutral" : share >= 0.75 ? "good" : share >= 0.5 ? "warning" : "serious";
  return <RatioPathFigure
    chartId="dashboard-workforce-kpi-path"
    label="Average calculated KPI"
    share={reason ? null : share}
    displayValue={share === null ? "Not available" : `${(data.workforce.averageKpi.rateBps! / 100).toFixed(2)}%`}
    detail={`Exact basis ${averageKpi.numerator} / ${averageKpi.denominator} · ${data.workforce.kpiEligibleWorkers} eligible · ${data.workforce.kpiUnavailableWorkers} without KPI data`}
    status={status}
    unavailableReason={reason ?? (share === null ? "No KPI-eligible workers in this period." : undefined)}
  />;
}
