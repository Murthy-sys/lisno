import type { ReactNode } from "react";

import {
  ChartFigure,
  MeterChart,
  compactNumber,
  compactPaise,
  statusColor,
  type ChartLegendEntry,
  type ChartStatus
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
import type {
  DashboardChartTheme,
  DashboardEChartOption
} from "./types";

const utcDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

const formatUtcDate = (value: string) =>
  utcDateFormatter.format(
    new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  );

const periodNote = (data: SuperAdminDashboardOverview) =>
  `${formatUtcDate(data.period.startAt)} – ${formatUtcDate(data.period.endAt)} · UTC`;

const suppressionReason = (
  data: SuperAdminDashboardOverview,
  keys: readonly string[]
) => {
  const key = keys.find((candidate) =>
    isDashboardMetricUnavailable(data.dataQuality, candidate)
  );
  return key
    ? dashboardMetricUnavailableReason(data.dataQuality, key)
    : undefined;
};

const ratioShare = (ratio: DashboardRatio) =>
  ratio.rateBps === null ? null : ratio.rateBps / 10_000;

type StatusColor = keyof DashboardChartTheme["status"];

const themeStatus = (
  theme: Readonly<DashboardChartTheme>,
  status: StatusColor | undefined
) => (status ? theme.status[status] : undefined);

const figureToken = (
  status: StatusColor | undefined,
  index: number,
  scale: "categorical" | "ordinal" = "categorical"
) =>
  status
    ? `var(--chart-status-${status})`
    : scale === "ordinal"
      ? `var(--chart-ordinal-${Math.min(index + 1, 6)})`
      : `var(--chart-series-${(index % 8) + 1})`;

function tooltipEntries(params: unknown) {
  const entries = Array.isArray(params) ? params : [params];
  return entries.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const candidate = entry as {
      axisValueLabel?: unknown;
      seriesName?: unknown;
      data?: unknown;
    };
    if (
      typeof candidate.seriesName !== "string" ||
      typeof candidate.data !== "object" ||
      candidate.data === null
    ) {
      return [];
    }
    const datum = candidate.data as {
      displayValue?: unknown;
      label?: unknown;
      note?: unknown;
    };
    if (typeof datum.displayValue !== "string") return [];
    const label =
      typeof datum.label === "string"
        ? datum.label
        : typeof candidate.axisValueLabel === "string"
          ? candidate.axisValueLabel
          : candidate.seriesName;
    return [
      `${label}: ${datum.displayValue}${
        typeof datum.note === "string" && datum.note ? ` · ${datum.note}` : ""
      }`
    ];
  }).join("\n");
}

interface TimeSeries {
  key: string;
  label: string;
  values: Array<number | null>;
}

function ModuleTimeSeriesChart({
  chartId,
  eyebrow,
  title,
  subtitle,
  labels,
  keys,
  series,
  formatValue = compactNumber,
  formatTick = compactNumber,
  tableValueColumnLabel = "Point",
  unavailableReason,
  empty,
  footnote,
  area = false
}: {
  chartId: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  labels: string[];
  keys: string[];
  series: TimeSeries[];
  formatValue?: (value: number) => string;
  formatTick?: (value: number) => string;
  tableValueColumnLabel?: string;
  unavailableReason?: string;
  empty?: boolean;
  footnote?: ReactNode;
  area?: boolean;
}) {
  return (
    <ChartFigure
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      legend={series.map((entry, index) => ({
        label: entry.label,
        color: figureToken(undefined, index),
        mark: "line"
      }))}
      table={{
        caption: `${title} — every plotted value.`,
        columns: [tableValueColumnLabel, ...series.map((entry) => entry.label)],
        rows: labels.map((label, index) => ({
          header: label,
          cells: series.map((entry) => {
            const value = entry.values[index];
            return value === null || value === undefined
              ? "Not available"
              : formatValue(value);
          })
        }))
      }}
      unavailableReason={unavailableReason}
      empty={empty}
      footnote={footnote}
    >
      <DashboardEChart
        chartId={chartId}
        height={250}
        description={`${title}. ${series.length} ${
          series.length === 1 ? "series" : "series"
        } over ${labels.length} ${labels.length === 1 ? "UTC date" : "UTC dates"}.`}
        interaction={{
          orientation: "horizontal",
          items: series.flatMap((entry) =>
            entry.values.flatMap((value, dataIndex) =>
              value === null || value === undefined
                ? []
                : [{
                    id: `${entry.key}-${keys[dataIndex]}`,
                    seriesId: entry.key,
                    dataIndex,
                    announcement: `${labels[dataIndex]}, ${entry.label}, ${formatValue(value)}`
                  }]
            )
          )
        }}
        createOption={(theme) => ({
          grid: {
            left: 12,
            right: 18,
            top: 18,
            bottom: 34,
            outerBoundsMode: "same",
            outerBoundsContain: "axisLabel"
          },
          tooltip: { trigger: "axis", formatter: tooltipEntries },
          xAxis: {
            type: "category",
            boundaryGap: false,
            data: labels,
            axisLine: { lineStyle: { color: theme.grid } },
            axisTick: { show: false },
            axisLabel: { color: theme.mutedText, hideOverlap: true }
          },
          yAxis: {
            type: "value",
            min: 0,
            minInterval: formatValue === compactNumber ? 1 : undefined,
            axisLabel: { color: theme.mutedText, formatter: formatTick },
            splitLine: { lineStyle: { color: theme.grid } }
          },
          series: series.map((entry, index) => ({
            id: entry.key,
            name: entry.label,
            type: "line",
            universalTransition: true,
            data: entry.values.map((value, dataIndex) => ({
              name: keys[dataIndex],
              value,
              label: labels[dataIndex],
              displayValue:
                value === null || value === undefined
                  ? "Not available"
                  : formatValue(value)
            })),
            connectNulls: false,
            showSymbol: labels.length <= 14,
            symbolSize: 7,
            lineStyle: { color: theme.series[index], width: 2.5 },
            itemStyle: { color: theme.series[index] },
            areaStyle:
              area && series.length === 1
                ? { color: theme.series[index], opacity: 0.1 }
                : undefined,
            emphasis: { focus: "series" }
          }))
        } as DashboardEChartOption)}
      />
    </ChartFigure>
  );
}

interface StackSegment {
  key: string;
  label: string;
  value: number;
  status?: StatusColor;
}

function ModuleStackedChart({
  chartId,
  eyebrow,
  title,
  subtitle,
  segments,
  formatValue = compactNumber,
  scale = "categorical",
  totalLabel = "Total",
  categoryColumnLabel = "Segment",
  valueColumnLabel = "Value",
  unavailableReason,
  emptyMessage,
  footnote
}: {
  chartId: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  segments: StackSegment[];
  formatValue?: (value: number) => string;
  scale?: "categorical" | "ordinal";
  totalLabel?: string;
  categoryColumnLabel?: string;
  valueColumnLabel?: string;
  unavailableReason?: string;
  emptyMessage?: string;
  footnote?: ReactNode;
}) {
  const total = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.value),
    0
  );
  const painted = segments.filter((segment) => segment.value > 0);
  const share = (value: number) =>
    total === 0 ? "0%" : `${Math.round((value / total) * 100)}%`;

  return (
    <ChartFigure
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      legend={painted.map((segment) => {
        const index = segments.indexOf(segment);
        return {
          label: segment.label,
          color: figureToken(segment.status, index, scale),
          mark: "swatch",
          value: `${formatValue(segment.value)} · ${share(segment.value)}`
        };
      })}
      table={{
        caption: `${title} — every plotted value.`,
        columns: [categoryColumnLabel, valueColumnLabel, "Share"],
        rows: [
          ...segments.map((segment) => ({
            header: segment.label,
            cells: [formatValue(segment.value), share(segment.value)]
          })),
          { header: totalLabel, cells: [formatValue(total), "100%"] }
        ]
      }}
      unavailableReason={unavailableReason}
      empty={total === 0}
      emptyMessage={emptyMessage}
      footnote={footnote}
    >
      <DashboardEChart
        chartId={chartId}
        height={132}
        description={`${title}. ${painted.length} ${
          painted.length === 1 ? "segment" : "segments"
        } totalling ${formatValue(total)}.`}
        interaction={{
          orientation: "horizontal",
          items: painted.map((segment) => ({
            id: segment.key,
            seriesId: segment.key,
            dataIndex: 0,
            announcement: `${segment.label}, ${formatValue(segment.value)}, ${share(segment.value)}`
          }))
        }}
        createOption={(theme) => ({
          grid: { left: 4, right: 4, top: 32, bottom: 26 },
          tooltip: { trigger: "item", formatter: tooltipEntries },
          xAxis: {
            type: "value",
            max: total || 1,
            show: false
          },
          yAxis: { type: "category", data: [""], show: false },
          series: segments.map((segment) => {
            const index = segments.indexOf(segment);
            const color =
              themeStatus(theme, segment.status) ??
              (scale === "ordinal"
                ? theme.ordinal[Math.min(index, theme.ordinal.length - 1)]
                : theme.series[index % theme.series.length]);
            return {
              id: segment.key,
              name: segment.label,
              type: "bar",
              stack: "total",
              barWidth: 34,
              universalTransition: true,
              data: [{
                name: segment.key,
                value: segment.value,
                label: segment.label,
                displayValue: `${formatValue(segment.value)} · ${share(segment.value)}`
              }],
              itemStyle: { color, borderColor: theme.surface, borderWidth: 1 },
              label: {
                show: segment.value / total >= 0.12,
                position: "inside",
                color: theme.surface,
                formatter: formatValue(segment.value)
              },
              emphasis: { focus: "series" }
            };
          })
        } as DashboardEChartOption)}
      />
    </ChartFigure>
  );
}

interface CategoryDatum {
  key: string;
  label: string;
  value: number;
  detail?: string;
  status?: StatusColor;
}

function ModuleCategoryChart({
  chartId,
  eyebrow,
  title,
  subtitle,
  data,
  formatValue = compactNumber,
  categoryColumnLabel = "Category",
  valueColumnLabel = "Value",
  detailColumnLabel,
  legend,
  unavailableReason,
  empty,
  emptyMessage
}: {
  chartId: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  data: CategoryDatum[];
  formatValue?: (value: number) => string;
  categoryColumnLabel?: string;
  valueColumnLabel?: string;
  detailColumnLabel?: string;
  legend?: ChartLegendEntry[];
  unavailableReason?: string;
  empty?: boolean;
  emptyMessage?: string;
}) {
  return (
    <ChartFigure
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      legend={legend}
      table={{
        caption: `${title} — every plotted value.`,
        columns: [
          categoryColumnLabel,
          valueColumnLabel,
          ...(detailColumnLabel ? [detailColumnLabel] : [])
        ],
        rows: data.map((datum) => ({
          header: datum.label,
          cells: [
            formatValue(datum.value),
            ...(detailColumnLabel ? [datum.detail ?? "—"] : [])
          ]
        }))
      }}
      unavailableReason={unavailableReason}
      empty={empty ?? data.length === 0}
      emptyMessage={emptyMessage}
    >
      <DashboardEChart
        chartId={chartId}
        height={Math.max(220, data.length * 42 + 64)}
        description={`${title}. ${data.length} ${data.length === 1 ? "bar" : "bars"}.`}
        interaction={{
          orientation: "vertical",
          items: data.map((datum, dataIndex) => ({
            id: datum.key,
            seriesId: "categories",
            dataIndex,
            announcement: `${datum.label}, ${formatValue(datum.value)}${
              datum.detail ? `. ${datum.detail}` : ""
            }`
          }))
        }}
        createOption={(theme) => ({
          grid: {
            left: 12,
            right: 58,
            top: 12,
            bottom: 24,
            outerBoundsMode: "same",
            outerBoundsContain: "axisLabel"
          },
          tooltip: { trigger: "item", formatter: tooltipEntries },
          xAxis: {
            type: "value",
            min: 0,
            minInterval: 1,
            axisLabel: { color: theme.mutedText, formatter: formatValue },
            splitLine: { lineStyle: { color: theme.grid } }
          },
          yAxis: {
            type: "category",
            inverse: true,
            data: data.map((datum) => datum.label),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              color: theme.mutedText,
              width: 128,
              overflow: "truncate"
            }
          },
          series: [{
            id: "categories",
            name: valueColumnLabel,
            type: "bar",
            barMaxWidth: 24,
            universalTransition: true,
            data: data.map((datum) => ({
              name: datum.key,
              value: datum.value,
              label: datum.label,
              note: datum.detail,
              displayValue: formatValue(datum.value),
              itemStyle: {
                color: themeStatus(theme, datum.status) ?? theme.series[0],
                borderRadius: [0, 5, 5, 0]
              }
            })),
            label: {
              show: true,
              position: "right",
              color: theme.text,
              formatter: (params: { value?: unknown }) =>
                typeof params.value === "number" ? formatValue(params.value) : ""
            },
            emphasis: { focus: "self" }
          }]
        } as DashboardEChartOption)}
      />
    </ChartFigure>
  );
}

interface WaterfallStep {
  key: string;
  label: string;
  value: number;
  type: "step" | "total";
}

function ModuleWaterfallChart({
  steps,
  unavailableReason,
  footnote
}: {
  steps: WaterfallStep[];
  unavailableReason?: string;
  footnote?: ReactNode;
}) {
  let running = 0;
  const bars = steps.map((step) => {
    if (step.type === "total") {
      running = step.value;
      return { ...step, start: 0, end: step.value, runningTotal: step.value };
    }
    const before = running;
    running += step.value;
    return {
      ...step,
      start: Math.min(before, running),
      end: Math.max(before, running),
      runningTotal: running
    };
  });
  const visibleSeries = [
    { id: "waterfall-total", label: "Running total", status: "neutral" as const },
    { id: "waterfall-increase", label: "Adds to the running total", status: "good" as const },
    { id: "waterfall-decrease", label: "Comes out of it", status: "serious" as const }
  ];
  const amount = (bar: (typeof bars)[number]) =>
    bar.type === "total"
      ? formatPaise(bar.value)
      : `${bar.value >= 0 ? "+" : "−"}${formatPaise(Math.abs(bar.value))}`;

  return (
    <ChartFigure
      eyebrow="Commercial baseline"
      title="Contract value to remaining budget"
      subtitle="GST, reserved profit, and recorded expenses reconcile the approved baseline."
      legend={visibleSeries.map((entry) => ({
        label: entry.label,
        color: statusColor(entry.status),
        mark: "swatch"
      }))}
      table={{
        caption: "Contract value to remaining budget — every plotted value.",
        columns: ["Step", "Amount", "Running total"],
        rows: bars.map((bar) => ({
          header: bar.label,
          cells: [amount(bar), formatPaise(bar.runningTotal)]
        }))
      }}
      unavailableReason={unavailableReason}
      footnote={footnote}
    >
      <DashboardEChart
        chartId="dashboard-finance-waterfall"
        height={360}
        description="Approved contract value reconciled through GST, target profit, cost budget, and recorded expenses to the remaining budget."
        interaction={{
          orientation: "vertical",
          items: bars.map((bar, dataIndex) => ({
            id: bar.key,
            seriesId:
              bar.type === "total"
                ? "waterfall-total"
                : bar.value >= 0
                  ? "waterfall-increase"
                  : "waterfall-decrease",
            dataIndex,
            announcement: `${bar.label}, ${amount(bar)}, running total ${formatPaise(bar.runningTotal)}`
          }))
        }}
        createOption={(theme) => {
          const dataFor = (kind: "total" | "increase" | "decrease") =>
            bars.map((bar) => {
              const matches =
                kind === "total"
                  ? bar.type === "total"
                  : bar.type === "step" &&
                    (kind === "increase" ? bar.value >= 0 : bar.value < 0);
              return matches
                ? {
                    name: bar.key,
                    value: bar.end - bar.start,
                    label: bar.label,
                    displayValue: amount(bar),
                    note: `Running total ${formatPaise(bar.runningTotal)}`
                  }
                : { name: bar.key, value: null };
            });
          return {
            grid: {
              left: 8,
              right: 20,
              top: 12,
              bottom: 28,
              outerBoundsMode: "same",
              outerBoundsContain: "axisLabel"
            },
            tooltip: { trigger: "item", formatter: tooltipEntries },
            xAxis: {
              type: "value",
              min: 0,
              axisLabel: { color: theme.mutedText, formatter: compactPaise },
              splitLine: { lineStyle: { color: theme.grid } }
            },
            yAxis: {
              type: "category",
              inverse: true,
              data: bars.map((bar) => bar.label),
              axisLine: { show: false },
              axisTick: { show: false },
              axisLabel: { color: theme.mutedText, width: 120, overflow: "truncate" }
            },
            series: [
              {
                id: "waterfall-offset",
                name: "Offset",
                type: "bar",
                stack: "waterfall",
                silent: true,
                tooltip: { show: false },
                itemStyle: { color: "transparent" },
                emphasis: { disabled: true },
                universalTransition: true,
                data: bars.map((bar) => ({ name: bar.key, value: bar.start }))
              },
              {
                id: "waterfall-total",
                name: "Running total",
                type: "bar",
                stack: "waterfall",
                barMaxWidth: 24,
                universalTransition: true,
                data: dataFor("total"),
                itemStyle: { color: theme.status.neutral, borderRadius: [0, 4, 4, 0] }
              },
              {
                id: "waterfall-increase",
                name: "Adds to the running total",
                type: "bar",
                stack: "waterfall",
                barMaxWidth: 24,
                universalTransition: true,
                data: dataFor("increase"),
                itemStyle: { color: theme.status.good, borderRadius: 4 }
              },
              {
                id: "waterfall-decrease",
                name: "Comes out of it",
                type: "bar",
                stack: "waterfall",
                barMaxWidth: 24,
                universalTransition: true,
                data: dataFor("decrease"),
                itemStyle: { color: theme.status.serious, borderRadius: 4 }
              }
            ]
          } as DashboardEChartOption;
        }}
      />
    </ChartFigure>
  );
}

const riskStatus: Record<DashboardRiskLevel, StatusColor> = {
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
  return (
    <ModuleTimeSeriesChart
      chartId="dashboard-project-flow"
      eyebrow="Portfolio flow"
      title="Projects created and completed"
      subtitle="Daily counts across the selected period."
      labels={data.trends.map((bucket) => formatUtcDate(bucket.date))}
      keys={data.trends.map((bucket) => bucket.date)}
      tableValueColumnLabel="Date"
      series={[
        { key: "created", label: "Created", values: data.trends.map((bucket) => bucket.projectsCreated) },
        { key: "completed", label: "Completed", values: data.trends.map((bucket) => bucket.projectsCompleted) }
      ]}
      unavailableReason={suppressionReason(data, [
        "trends.projectsCreated",
        "trends.projectsCompleted"
      ])}
      empty={data.trends.length === 0}
      footnote={periodNote(data)}
    />
  );
}

export function ApprovalThroughputChart({ data }: { data: SuperAdminDashboardOverview }) {
  return (
    <ModuleTimeSeriesChart
      chartId="dashboard-approval-throughput"
      eyebrow="Throughput"
      title="Approvals and completed work"
      subtitle="Estimates and design plans approved, and execution tasks completed."
      labels={data.trends.map((bucket) => formatUtcDate(bucket.date))}
      keys={data.trends.map((bucket) => bucket.date)}
      tableValueColumnLabel="Date"
      series={[
        { key: "estimates", label: "Estimates approved", values: data.trends.map((bucket) => bucket.estimatesApproved) },
        { key: "designs", label: "Design plans approved", values: data.trends.map((bucket) => bucket.designPlansApproved) },
        { key: "tasks", label: "Tasks completed", values: data.trends.map((bucket) => bucket.workflowTasksCompleted) }
      ]}
      unavailableReason={suppressionReason(data, [
        "trends.estimatesApproved",
        "trends.designPlansApproved",
        "trends.workflowTasksCompleted"
      ])}
      empty={data.trends.length === 0}
      footnote={periodNote(data)}
    />
  );
}

export function ExpenseTrendChart({ data }: { data: SuperAdminDashboardOverview }) {
  return (
    <ModuleTimeSeriesChart
      chartId="dashboard-recorded-expenses-trend"
      eyebrow="Ledger"
      title="Recorded expenses"
      subtitle="Daily recorded expenses selected by incurred date, on their own scale."
      labels={data.trends.map((bucket) => formatUtcDate(bucket.date))}
      keys={data.trends.map((bucket) => bucket.date)}
      tableValueColumnLabel="Incurred date"
      series={[{
        key: "expenses",
        label: "Recorded expenses",
        values: data.trends.map((bucket) => bucket.ledgerExpensesPostedPaise)
      }]}
      formatValue={formatPaise}
      formatTick={compactPaise}
      unavailableReason={suppressionReason(data, ["trends.ledgerExpensesPostedPaise"])}
      empty={data.trends.length === 0}
      footnote={`${periodNote(data)} · Incurred-date basis`}
      area
    />
  );
}

export function ProjectLifecycleChart({ data }: { data: SuperAdminDashboardOverview }) {
  return (
    <ModuleStackedChart
      chartId="dashboard-module-project-lifecycle"
      eyebrow="Lifecycle"
      title="Projects by stage"
      subtitle="Every project in the organization, by its current stage."
      segments={[
        { key: "planning", label: "Planning", value: data.projects.planning },
        { key: "active", label: "Active", value: data.projects.active },
        { key: "on_hold", label: "On hold", value: data.projects.onHold },
        { key: "completed", label: "Completed", value: data.projects.completed }
      ]}
      scale="ordinal"
      totalLabel="Total"
      categoryColumnLabel="Stage"
      valueColumnLabel="Projects"
      unavailableReason={suppressionReason(data, [
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

export function RiskDistributionChart({ data }: { data: SuperAdminDashboardOverview }) {
  const levels: DashboardRiskLevel[] = ["red", "yellow", "green", "gray"];
  return (
    <ModuleStackedChart
      chartId="dashboard-module-risk-distribution"
      eyebrow="Explainable risk"
      title="Risk mix"
      subtitle="Every project sits in exactly one band at the observation time."
      segments={levels.map((level) => ({
        key: level,
        label: riskLabel[level],
        value: data.risk.projectDistribution[level],
        status: riskStatus[level]
      }))}
      totalLabel="Total"
      categoryColumnLabel="Band"
      valueColumnLabel="Projects"
      unavailableReason={suppressionReason(data, ["risk.projectDistribution"])}
      emptyMessage="No projects are tracked, so no risk band has a value."
    />
  );
}

export function RiskFactorChart({ data }: { data: SuperAdminDashboardOverview }) {
  const bars: CategoryDatum[] = data.risk.factorDistribution.map((factor) => ({
    key: `${factor.kind}-${factor.level}-${factor.reasonCode}`,
    label: humanize(factor.reasonCode),
    value: factor.occurrenceCount,
    status: riskStatus[factor.level],
    detail: `${humanize(factor.kind)} · across ${factor.projectCount} ${
      factor.projectCount === 1 ? "project" : "projects"
    }`
  }));
  return (
    <ModuleCategoryChart
      chartId="dashboard-risk-factor-occurrences"
      eyebrow="Why projects are flagged"
      title="Risk factor occurrences"
      subtitle="Each bar is one reason code, at the level it was raised."
      data={bars}
      legend={[
        { label: "Red risk", color: statusColor("critical"), mark: "swatch" },
        { label: "Yellow risk", color: statusColor("warning"), mark: "swatch" }
      ]}
      categoryColumnLabel="Reason"
      valueColumnLabel="Occurrences"
      detailColumnLabel="Scope"
      unavailableReason={suppressionReason(data, ["risk.factorDistribution"])}
      empty={bars.length === 0}
      emptyMessage="No eligible risk factors are currently tracked."
    />
  );
}

export function FinanceWaterfallChart({ data }: { data: SuperAdminDashboardOverview }) {
  const finance = data.finance;
  return (
    <ModuleWaterfallChart
      steps={[
        { key: "contract", label: "Contract value", value: finance.approvedContractTotalPaise, type: "total" },
        { key: "gst", label: "GST", value: -finance.approvedGstPaise, type: "step" },
        { key: "net", label: "Net revenue", value: finance.approvedSubtotalPaise, type: "total" },
        { key: "profit", label: "Target profit", value: -finance.targetProfitPaise, type: "step" },
        { key: "budget", label: "Cost budget", value: finance.costBudgetPaise, type: "total" },
        { key: "recorded", label: "Recorded expenses", value: -finance.recordedCostPaise, type: "step" },
        { key: "remaining", label: "Remaining budget", value: finance.remainingBudgetPaise, type: "total" }
      ]}
      unavailableReason={suppressionReason(data, [
        "finance.approvedContractTotalPaise",
        "finance.approvedGstPaise",
        "finance.approvedSubtotalPaise",
        "finance.targetProfitPaise",
        "finance.costBudgetPaise",
        "finance.recordedCostPaise",
        "finance.remainingBudgetPaise"
      ])}
      footnote={`Across ${finance.projectCount} ${
        finance.projectCount === 1 ? "project" : "projects"
      } with a verified finance bucket.`}
    />
  );
}

export function SpendCompositionChart({ data }: { data: SuperAdminDashboardOverview }) {
  const finance = data.finance;
  return (
    <ModuleStackedChart
      chartId="dashboard-expense-composition"
      eyebrow="Recorded expenses"
      title="Expense composition"
      subtitle="Current recorded expense composition against the cost budget."
      segments={[
        { key: "procurement", label: "Procurement", value: finance.procurementCostPaise },
        { key: "employee", label: "Employee payments", value: finance.employeePaymentPaise },
        { key: "other", label: "Other expenses", value: finance.otherExpensePaise },
        { key: "overhead", label: "Overheads", value: finance.overheadPaise }
      ]}
      formatValue={formatPaise}
      totalLabel="Total recorded expenses"
      categoryColumnLabel="Class"
      valueColumnLabel="Amount"
      unavailableReason={suppressionReason(data, [
        "finance.procurementCostPaise",
        "finance.employeePaymentPaise",
        "finance.otherExpensePaise",
        "finance.overheadPaise"
      ])}
      emptyMessage="No recorded expenses are available."
    />
  );
}

export function EstimationPipelineChart({ data }: { data: SuperAdminDashboardOverview }) {
  const estimation = data.estimation;
  return (
    <ModuleStackedChart
      chartId="dashboard-estimation-pipeline"
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
      unavailableReason={suppressionReason(data, [
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
    <ModuleStackedChart
      chartId="dashboard-design-pipeline"
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
      unavailableReason={suppressionReason(data, [
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

export function ProcurementPipelineChart({ data }: { data: SuperAdminDashboardOverview }) {
  const procurement = data.procurement;
  return (
    <ModuleStackedChart
      chartId="dashboard-procurement-pipeline"
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
      unavailableReason={suppressionReason(data, [
        "procurement.notStarted",
        "procurement.open",
        "procurement.inProgress",
        "procurement.completed"
      ])}
      footnote={`${procurement.eligibleProjects} eligible · ${procurement.trackedProjects} tracked · ${procurement.unavailableProjects} unavailable`}
    />
  );
}

export function ExecutionStateChart({ data }: { data: SuperAdminDashboardOverview }) {
  const execution = data.execution;
  return (
    <ModuleStackedChart
      chartId="dashboard-execution-state"
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
      unavailableReason={suppressionReason(data, [
        "execution.open",
        "execution.inProgress",
        "execution.completed"
      ])}
      footnote={`${execution.overdue} overdue · ${execution.unassigned} unassigned · ${execution.overdueUnassigned} overdue and unassigned`}
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
    <ModuleCategoryChart
      chartId="dashboard-worker-role"
      eyebrow="Capacity"
      title="Active workers by trade"
      subtitle="Trades have no natural order, so every bar takes the same hue."
      data={bars}
      categoryColumnLabel="Trade"
      valueColumnLabel="Workers"
      unavailableReason={suppressionReason(data, ["workforce.roleDistribution"])}
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
    <ModuleCategoryChart
      chartId="dashboard-execution-role"
      eyebrow="Where the work sits"
      title="Execution tasks by trade"
      data={bars}
      categoryColumnLabel="Trade"
      valueColumnLabel="Tasks"
      unavailableReason={suppressionReason(data, ["execution.roleDistribution"])}
      empty={bars.length === 0}
      emptyMessage="No execution tasks carry a verified trade."
    />
  );
}

export function WorkforceAssignmentChart({ data }: { data: SuperAdminDashboardOverview }) {
  const workforce = data.workforce;
  return (
    <ModuleStackedChart
      chartId="dashboard-workforce-assignment"
      eyebrow="Assignment"
      title="Workers by assignment state"
      segments={[
        { key: "assigned", label: "With assignments", value: workforce.assignedWorkers },
        { key: "unassigned", label: "Without assignments", value: workforce.unassignedWorkers }
      ]}
      totalLabel="Total"
      categoryColumnLabel="State"
      valueColumnLabel="Workers"
      unavailableReason={suppressionReason(data, [
        "workforce.assignedWorkers",
        "workforce.unassignedWorkers"
      ])}
      footnote={`${workforce.activeAssignedTaskCount} active assigned tasks · ${workforce.activeUnassignedTaskCount} active unassigned · ${workforce.inactiveAssigneeTaskCount} inactive-assignee exceptions`}
    />
  );
}

export function BudgetConsumptionMeter({ data }: { data: SuperAdminDashboardOverview }) {
  const {
    costBudgetPaise,
    recordedCostPaise,
    remainingBudgetPaise,
    overBudgetProjectCount
  } = data.finance;
  const reason = suppressionReason(data, [
    "finance.costBudgetPaise",
    "finance.recordedCostPaise"
  ]);
  const share = costBudgetPaise > 0 ? recordedCostPaise / costBudgetPaise : null;
  const status: ChartStatus =
    share === null
      ? "neutral"
      : share > 1
        ? "critical"
        : share > 0.85
          ? "warning"
          : "good";
  return (
    <MeterChart
      label="Cost budget consumed"
      value={reason ? null : share}
      valueText={
        share === null
          ? "Not available"
          : `${Math.round(share * 100)}% · ${formatPaise(recordedCostPaise)} recorded expenses`
      }
      detail={
        share === null
          ? undefined
          : `${formatPaise(remainingBudgetPaise)} remaining of ${formatPaise(costBudgetPaise)} · ${overBudgetProjectCount} budget ${
              overBudgetProjectCount === 1 ? "exception" : "exceptions"
            }`
      }
      status={status}
      unavailableReason={reason}
    />
  );
}

export function MarginMeter({ data }: { data: SuperAdminDashboardOverview }) {
  const reason = suppressionReason(data, ["finance.currentMarginBps"]);
  const marginBps = data.finance.currentMarginBps;
  const share =
    marginBps === null ? null : Math.max(0, Math.min(1, marginBps / 10_000));
  const status: ChartStatus =
    marginBps === null
      ? "neutral"
      : marginBps < 0
        ? "critical"
        : marginBps < 1000
          ? "warning"
          : "good";
  return (
    <MeterChart
      label="Current margin (live)"
      value={reason || marginBps === null ? null : share}
      valueText={marginBps === null ? "Not available" : `${(marginBps / 100).toFixed(2)}%`}
      detail={`${formatPaise(data.finance.currentProfitPaise)} live profit against ${formatPaise(data.finance.approvedSubtotalPaise)} net revenue`}
      status={status}
      unavailableReason={
        reason ?? (marginBps === null ? "No eligible margin denominator." : undefined)
      }
    />
  );
}

export function ProcurementSpendMeter({ data }: { data: SuperAdminDashboardOverview }) {
  const { plannedAmountPaise, postedSpendPaise } = data.procurement;
  const reason = suppressionReason(data, [
    "procurement.approvedAmountPaise",
    "procurement.postedSpendPaise"
  ]);
  const share =
    plannedAmountPaise === null || plannedAmountPaise <= 0
      ? null
      : postedSpendPaise / plannedAmountPaise;
  const status: ChartStatus =
    share === null
      ? "neutral"
      : share > 1
        ? "critical"
        : share > 0.9
          ? "warning"
          : "good";
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
        reason ??
        (share === null ? "No authoritative approved procurement amount." : undefined)
      }
    />
  );
}

export function ExecutionProgressMeter({ data }: { data: SuperAdminDashboardOverview }) {
  const progress = data.execution.weightedProgress;
  const reason = suppressionReason(data, ["execution.weightedProgress"]);
  const share = ratioShare(progress);
  return (
    <MeterChart
      label="Weighted execution progress"
      value={reason ? null : share}
      valueText={
        share === null ? "Not available" : `${(progress.rateBps! / 100).toFixed(2)}%`
      }
      detail={`${progress.numerator} of ${progress.denominator} effort units · ${progress.fallbackTaskCount} fallback ${
        progress.fallbackTaskCount === 1 ? "task" : "tasks"
      }`}
      status={
        share === null
          ? "neutral"
          : share >= 0.75
            ? "good"
            : share >= 0.4
              ? "warning"
              : "serious"
      }
      unavailableReason={
        reason ?? (share === null ? "No eligible effort denominator." : undefined)
      }
    />
  );
}

export function WorkforceKpiMeter({ data }: { data: SuperAdminDashboardOverview }) {
  const reason = suppressionReason(data, ["workforce.averageKpi"]);
  const share = ratioShare(data.workforce.averageKpi);
  return (
    <MeterChart
      label="Average calculated KPI"
      value={reason ? null : share}
      valueText={
        share === null
          ? "Not available"
          : `${(data.workforce.averageKpi.rateBps! / 100).toFixed(2)}%`
      }
      detail={`${data.workforce.kpiEligibleWorkers} eligible · ${data.workforce.kpiUnavailableWorkers} without KPI data`}
      status={
        share === null
          ? "neutral"
          : share >= 0.75
            ? "good"
            : share >= 0.5
              ? "warning"
              : "serious"
      }
      unavailableReason={
        reason ?? (share === null ? "No KPI-eligible workers in this period." : undefined)
      }
    />
  );
}
