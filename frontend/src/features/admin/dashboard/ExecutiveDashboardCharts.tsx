import { ChartFigure } from "../../../components/charts";
import { DashboardEChart } from "./echarts/DashboardEChart";
import type { DashboardChartTheme, DashboardEChartOption } from "./echarts/types";
import {
  dashboardMetricUnavailableReason,
  formatPaise,
  isDashboardMetricUnavailable
} from "./dashboardPresentation";
import type {
  DashboardProjectModuleStatus,
  DashboardTrendBucket,
  SuperAdminDashboardOverview
} from "./superAdminDashboardApi";

const utcDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC"
});

const formatUtcDate = (value: string) =>
  utcDateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));

const compactPaise = (value: number) => {
  const rupees = value / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 1,
    notation: "compact"
  }).format(rupees);
};

const firstUnavailableReason = (
  data: SuperAdminDashboardOverview,
  metricKeys: readonly string[]
) => {
  const metricKey = metricKeys.find((key) =>
    isDashboardMetricUnavailable(data.dataQuality, key)
  );
  return metricKey
    ? dashboardMetricUnavailableReason(data.dataQuality, metricKey)
    : undefined;
};

const tooltipBox = {
  backgroundColor: "rgba(255, 255, 255, 0.98)",
  borderColor: "#e4e1da",
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { color: "#171b2d", fontSize: 12 }
};

export function createRecordedCostActivityOption({
  trends,
  approvedNetRevenuePaise,
  costBudgetPaise,
  recordedCostsAvailable = true,
  theme
}: {
  trends: readonly DashboardTrendBucket[];
  approvedNetRevenuePaise: number | null;
  costBudgetPaise: number | null;
  recordedCostsAvailable?: boolean;
  theme: Readonly<DashboardChartTheme>;
}): DashboardEChartOption {
  const sage = theme.series[0] ?? "#5f806c";
  const sand = theme.series[1] ?? "#c8aa7c";
  const blue = theme.series[2] ?? "#607fa8";
  const data = trends.map((bucket) => ({
    id: bucket.date.slice(0, 10),
    groupId: bucket.date.slice(0, 10),
    name: formatUtcDate(bucket.date),
    value: recordedCostsAvailable ? bucket.ledgerExpensesPostedPaise : null,
    displayValue: recordedCostsAvailable ? formatPaise(bucket.ledgerExpensesPostedPaise) : "Not available"
  }));

  return {
    grid: { left: 8, right: 12, top: 24, bottom: 4, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    tooltip: {
      ...tooltipBox,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(95, 128, 108, 0.08)" } },
      formatter: (params: unknown) => {
        const entries = Array.isArray(params) ? params : [params];
        const first = entries[0] as { name?: string } | undefined;
        const details = entries.map((entry) => {
          const item = entry as { seriesName?: string; value?: number; data?: { displayValue?: string } };
          return `${item.seriesName ?? "Value"}: ${item.data?.displayValue ?? (typeof item.value === "number" ? formatPaise(item.value) : "Not available")}`;
        });
        return [first?.name ?? "Recorded cost", ...details].join("\n");
      }
    },
    xAxis: {
      type: "category",
      data: data.map((entry) => entry.name),
      axisLine: { lineStyle: { color: theme.grid } },
      axisTick: { show: false },
      axisLabel: { color: theme.mutedText, fontSize: 10, hideOverlap: true }
    },
    yAxis: {
      type: "value",
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: theme.grid, type: "dashed" } },
      axisLabel: { color: theme.mutedText, fontSize: 10, formatter: compactPaise }
    },
    series: [
      {
        id: "recorded-cost-activity",
        name: "Recorded cost posted",
        type: "bar",
        universalTransition: { enabled: true, divideShape: "clone" },
        barMaxWidth: 28,
        itemStyle: {
          color: sage,
          borderRadius: [6, 6, 2, 2],
          shadowBlur: 8,
          shadowColor: "rgba(73, 104, 86, 0.16)",
          shadowOffsetY: 3
        },
        emphasis: { itemStyle: { color: "#496856" } },
        data
      },
      ...(approvedNetRevenuePaise === null ? [] : [{
        id: "approved-net-revenue-guide",
        name: "Approved net revenue · snapshot",
        type: "line",
        symbol: "none",
        silent: true,
        universalTransition: true,
        lineStyle: { color: blue, type: "dashed", width: 1.5 },
        data: data.map((entry) => ({
          id: entry.id,
          groupId: entry.groupId,
          value: approvedNetRevenuePaise,
          displayValue: formatPaise(approvedNetRevenuePaise)
        }))
      }]),
      ...(costBudgetPaise === null ? [] : [{
        id: "cost-budget-guide",
        name: "Cost budget · snapshot",
        type: "line",
        symbol: "none",
        silent: true,
        universalTransition: true,
        lineStyle: { color: sand, type: "dashed", width: 1.5 },
        data: data.map((entry) => ({
          id: entry.id,
          groupId: entry.groupId,
          value: costBudgetPaise,
          displayValue: formatPaise(costBudgetPaise)
        }))
      }])
    ]
  } as DashboardEChartOption;
}

export function RecordedCostActivityChart({ data }: { data: SuperAdminDashboardOverview }) {
  const recordedCostsAvailable = !isDashboardMetricUnavailable(data.dataQuality, "trends.ledgerExpensesPostedPaise");
  const approvedNetRevenueAvailable = !isDashboardMetricUnavailable(data.dataQuality, "finance.approvedSubtotalPaise");
  const costBudgetAvailable = !isDashboardMetricUnavailable(data.dataQuality, "finance.costBudgetPaise");
  const partialReason = firstUnavailableReason(data, [
    "trends.ledgerExpensesPostedPaise",
    "finance.approvedSubtotalPaise",
    "finance.costBudgetPaise"
  ]);
  const rows = data.trends.map((bucket) => ({
    header: formatUtcDate(bucket.date),
    cells: [
      recordedCostsAvailable ? formatPaise(bucket.ledgerExpensesPostedPaise) : "Not available",
      approvedNetRevenueAvailable ? formatPaise(data.finance.approvedSubtotalPaise) : "Not available",
      costBudgetAvailable ? formatPaise(data.finance.costBudgetPaise) : "Not available"
    ]
  }));

  return (
    <ChartFigure
      eyebrow="Finance activity"
      title="Recorded cost activity"
      subtitle="Daily ledger postings for the selected period. Revenue and budget are current approved snapshot guides, not historical series."
      legend={[
        ...(recordedCostsAvailable ? [{ label: "Recorded cost posted", color: "var(--dashboard-exec-sage)", mark: "swatch" as const }] : []),
        ...(approvedNetRevenueAvailable ? [{ label: "Approved net revenue · snapshot", color: "var(--dashboard-exec-blue)", mark: "line" as const, value: formatPaise(data.finance.approvedSubtotalPaise) }] : []),
        ...(costBudgetAvailable ? [{ label: "Cost budget · snapshot", color: "var(--dashboard-exec-sand)", mark: "line" as const, value: formatPaise(data.finance.costBudgetPaise) }] : [])
      ]}
      table={{
        caption: "Exact recorded-cost activity and current snapshot guides.",
        columns: ["Incurred date", "Recorded cost posted", "Approved net revenue", "Cost budget"],
        rows
      }}
      empty={data.trends.length === 0}
      emptyMessage="No recorded cost postings are present in this period."
      footnote={<>Paise remains integer in the source; displayed amounts are converted to rupees. Dates use UTC.{partialReason ? ` · ${partialReason}` : ""}</>}
      className="dashboard-executive-chart dashboard-executive-chart--activity"
    >
      <DashboardEChart
        chartId="dashboard-recorded-cost-activity"
        className="dashboard-echart--executive"
        height={300}
        description="Recorded cost postings by UTC day, with approved net revenue and cost budget shown as current snapshot guides."
        interaction={{
          orientation: "horizontal",
          items: recordedCostsAvailable ? data.trends.map((bucket, dataIndex) => ({
            id: bucket.date,
            seriesId: "recorded-cost-activity",
            dataIndex,
            announcement: `${formatUtcDate(bucket.date)}, ${formatPaise(bucket.ledgerExpensesPostedPaise)} recorded cost posted`
          })) : []
        }}
        createOption={(theme) => createRecordedCostActivityOption({
          trends: data.trends,
          approvedNetRevenuePaise: approvedNetRevenueAvailable ? data.finance.approvedSubtotalPaise : null,
          costBudgetPaise: costBudgetAvailable ? data.finance.costBudgetPaise : null,
          recordedCostsAvailable,
          theme
        })}
      />
    </ChartFigure>
  );
}

const LIFECYCLE = [
  { id: "planning", label: "Planning", metricKey: "projects.planning", colorIndex: 3 },
  { id: "active", label: "Active", metricKey: "projects.active", colorIndex: 0 },
  { id: "on_hold", label: "On hold", metricKey: "projects.onHold", colorIndex: 1 },
  { id: "completed", label: "Completed", metricKey: "projects.completed", colorIndex: 2 }
] as const;

export function createExecutiveLifecycleOption({
  data,
  theme
}: {
  data: SuperAdminDashboardOverview;
  theme: Readonly<DashboardChartTheme>;
}): DashboardEChartOption {
  const values = [data.projects.planning, data.projects.active, data.projects.onHold, data.projects.completed];
  return {
    tooltip: {
      ...tooltipBox,
      trigger: "item",
      formatter: (params: { name?: string; value?: number; percent?: number }) =>
        `${params.name ?? "Stage"}\n${params.value?.toLocaleString("en-IN") ?? 0} projects · ${params.percent ?? 0}%`
    },
    series: [{
      id: "executive-project-status",
      name: "Project status",
      type: "pie",
      radius: ["57%", "78%"],
      center: ["50%", "51%"],
      startAngle: 90,
      minAngle: 2,
      avoidLabelOverlap: true,
      universalTransition: { enabled: true, divideShape: "clone" },
      itemStyle: { borderColor: theme.surface, borderWidth: 3, borderRadius: 4 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 5, label: { show: false } },
      data: LIFECYCLE.map((stage, index) => ({
        id: stage.id,
        groupId: stage.metricKey,
        name: stage.label,
        value: isDashboardMetricUnavailable(data.dataQuality, stage.metricKey) ? null : values[index],
        itemStyle: { color: theme.ordinal[stage.colorIndex] ?? theme.series[index] }
      }))
    }]
  } as DashboardEChartOption;
}

export function ProjectStatusChart({
  data,
  onActivate
}: {
  data: SuperAdminDashboardOverview;
  onActivate: (status: DashboardProjectModuleStatus) => void;
}) {
  const partialReason = firstUnavailableReason(data, [
    "projects.planning",
    "projects.active",
    "projects.onHold",
    "projects.completed"
  ]);
  const values = [data.projects.planning, data.projects.active, data.projects.onHold, data.projects.completed];
  const availableValues = values.filter((_, index) =>
    !isDashboardMetricUnavailable(data.dataQuality, LIFECYCLE[index].metricKey)
  );
  const total = availableValues.reduce((sum, value) => sum + value, 0);
  const partial = availableValues.length !== values.length;

  return (
    <ChartFigure
      eyebrow="Portfolio"
      title="Project status"
      subtitle="Current lifecycle distribution across the complete project portfolio."
      legend={LIFECYCLE.map((stage, index) => ({
        label: stage.label,
        color: `var(--chart-ordinal-${stage.colorIndex + 1})`,
        value: isDashboardMetricUnavailable(data.dataQuality, stage.metricKey) ? "Not available" : values[index].toLocaleString("en-IN")
      }))}
      table={{
        caption: "Exact project counts by lifecycle stage.",
        columns: ["Lifecycle stage", "Projects", "Share"],
        rows: LIFECYCLE.map((stage, index) => ({
          header: stage.label,
          cells: [
            isDashboardMetricUnavailable(data.dataQuality, stage.metricKey) ? "Not available" : values[index].toLocaleString("en-IN"),
            isDashboardMetricUnavailable(data.dataQuality, stage.metricKey) ? "Not available" : total > 0 ? `${Math.round(values[index] * 100 / total)}%` : "0%"
          ]
        }))
      }}
      footnote={<>Activate a segment or lifecycle link to open the matching project list.{partialReason ? ` · ${partialReason}` : ""}</>}
      className="dashboard-executive-chart dashboard-executive-chart--donut"
    >
      <div className="dashboard-donut-stage">
        <DashboardEChart
          chartId="dashboard-project-status"
          className="dashboard-echart--executive"
          height={246}
          description={`Project status doughnut showing ${partial ? "verified available stages for" : ""} ${total.toLocaleString("en-IN")} projects across planning, active, on hold, and completed stages.`}
          interaction={{
            orientation: "radial",
            items: LIFECYCLE.flatMap((stage, dataIndex) =>
              isDashboardMetricUnavailable(data.dataQuality, stage.metricKey) ? [] : [{
                id: stage.id,
                seriesId: "executive-project-status",
                dataIndex,
                announcement: `${stage.label}, ${values[dataIndex].toLocaleString("en-IN")} projects`
              }]
            ),
            onActivate: (id) => onActivate(id as DashboardProjectModuleStatus)
          }}
          createOption={(theme) => createExecutiveLifecycleOption({ data, theme })}
        />
        <div className="dashboard-donut-center" aria-hidden="true">
            <strong>{partial ? "—" : total.toLocaleString("en-IN")}</strong>
            <span>{partial ? "Partial status" : "Projects"}</span>
        </div>
      </div>
    </ChartFigure>
  );
}

const COST_CATEGORIES = [
  { id: "procurement", label: "Procurement", metricKey: "finance.procurementCostPaise", colorIndex: 0 },
  { id: "employee", label: "Employee payments", metricKey: "finance.employeePaymentPaise", colorIndex: 1 },
  { id: "other", label: "Other expenses", metricKey: "finance.otherExpensePaise", colorIndex: 3 },
  { id: "overhead", label: "Overheads", metricKey: "finance.overheadPaise", colorIndex: 2 }
] as const;

export function createCostCompositionOption({
  data,
  theme
}: {
  data: SuperAdminDashboardOverview;
  theme: Readonly<DashboardChartTheme>;
}): DashboardEChartOption {
  const values = [
    data.finance.procurementCostPaise,
    data.finance.employeePaymentPaise,
    data.finance.otherExpensePaise,
    data.finance.overheadPaise
  ];
  return {
    tooltip: {
      ...tooltipBox,
      trigger: "item",
      formatter: (params: { name?: string; value?: number; percent?: number }) =>
        `${params.name ?? "Cost"}\n${formatPaise(params.value ?? 0)} · ${params.percent ?? 0}%`
    },
    series: [{
      id: "executive-cost-composition",
      name: "Recorded cost composition",
      type: "pie",
      radius: ["58%", "80%"],
      center: ["50%", "51%"],
      startAngle: 90,
      minAngle: 2,
      universalTransition: { enabled: true, divideShape: "clone" },
      itemStyle: { borderColor: theme.surface, borderWidth: 3, borderRadius: 4 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 5 },
      data: COST_CATEGORIES.map((category, index) => ({
        id: category.id,
        groupId: category.metricKey,
        name: category.label,
        value: isDashboardMetricUnavailable(data.dataQuality, category.metricKey) ? null : values[index],
        itemStyle: { color: theme.ordinal[category.colorIndex] ?? theme.series[index] }
      }))
    }]
  } as DashboardEChartOption;
}

export function CostCompositionChart({ data }: { data: SuperAdminDashboardOverview }) {
  const values = [
    data.finance.procurementCostPaise,
    data.finance.employeePaymentPaise,
    data.finance.otherExpensePaise,
    data.finance.overheadPaise
  ];
  const partialReason = firstUnavailableReason(data, COST_CATEGORIES.map((item) => item.metricKey));
  const recordedCostAvailable = !isDashboardMetricUnavailable(data.dataQuality, "finance.recordedCostPaise");
  return (
    <ChartFigure
      eyebrow="Recorded spend"
      title="Cost composition"
      subtitle="Verified finance classifications that reconcile to recorded cost."
      legend={COST_CATEGORIES.map((category, index) => ({
        label: category.label,
        color: `var(--chart-ordinal-${category.colorIndex + 1})`,
        value: isDashboardMetricUnavailable(data.dataQuality, category.metricKey) ? "Not available" : formatPaise(values[index])
      }))}
      table={{
        caption: "Exact recorded-cost classification values.",
        columns: ["Cost class", "Amount"],
        rows: COST_CATEGORIES.map((category, index) => ({
          header: category.label,
          cells: [isDashboardMetricUnavailable(data.dataQuality, category.metricKey) ? "Not available" : formatPaise(values[index])]
        }))
      }}
      footnote={<>Classified total {formatPaise(values.reduce((sum, value, index) => isDashboardMetricUnavailable(data.dataQuality, COST_CATEGORIES[index].metricKey) ? sum : sum + value, 0))} · Recorded cost {recordedCostAvailable ? formatPaise(data.finance.recordedCostPaise) : "Not available"}{partialReason ? ` · ${partialReason}` : ""}</>}
      className="dashboard-executive-chart dashboard-executive-chart--donut"
    >
      <div className="dashboard-donut-stage">
        <DashboardEChart
          chartId="dashboard-cost-composition"
          className="dashboard-echart--executive"
          height={238}
          description={`Recorded cost composition with a recorded total of ${recordedCostAvailable ? formatPaise(data.finance.recordedCostPaise) : "not available"}.`}
          interaction={{
            orientation: "radial",
            items: COST_CATEGORIES.flatMap((category, dataIndex) =>
              isDashboardMetricUnavailable(data.dataQuality, category.metricKey) ? [] : [{
                id: category.id,
                seriesId: "executive-cost-composition",
                dataIndex,
                announcement: `${category.label}, ${formatPaise(values[dataIndex])}`
              }]
            )
          }}
          createOption={(theme) => createCostCompositionOption({ data, theme })}
        />
        <div className="dashboard-donut-center" aria-hidden="true">
          <strong>{recordedCostAvailable ? formatPaise(data.finance.recordedCostPaise) : "—"}</strong>
          <span>{recordedCostAvailable ? "Recorded cost" : "Partial cost"}</span>
        </div>
      </div>
    </ChartFigure>
  );
}

export function createBudgetPositionOption({
  data,
  theme
}: {
  data: SuperAdminDashboardOverview;
  theme: Readonly<DashboardChartTheme>;
}): DashboardEChartOption {
  const remainingAvailable = !isDashboardMetricUnavailable(data.dataQuality, "finance.remainingBudgetPaise");
  const remainingLabel = remainingAvailable && data.finance.remainingBudgetPaise < 0 ? "Overspent" : "Remaining";
  const values = [
    isDashboardMetricUnavailable(data.dataQuality, "finance.costBudgetPaise") ? null : data.finance.costBudgetPaise,
    isDashboardMetricUnavailable(data.dataQuality, "finance.recordedCostPaise") ? null : data.finance.recordedCostPaise,
    remainingAvailable ? data.finance.remainingBudgetPaise : null
  ];
  return {
    grid: { left: 8, right: 14, top: 10, bottom: 4, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    tooltip: {
      ...tooltipBox,
      trigger: "item",
      formatter: (params: { name?: string; value?: number }) =>
        `${params.name ?? "Budget"}\n${formatPaise(params.value ?? 0)}`
    },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: theme.grid, type: "dashed" } },
      axisLabel: { color: theme.mutedText, fontSize: 10, formatter: compactPaise }
    },
    yAxis: {
      type: "category",
      data: ["Cost budget", "Recorded cost", remainingLabel],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: theme.text, fontSize: 11, fontWeight: 600 }
    },
    series: [{
      id: "executive-budget-position",
      name: "Budget position",
      type: "bar",
      universalTransition: { enabled: true, divideShape: "clone" },
      barWidth: 22,
      label: {
        show: true,
        position: data.finance.remainingBudgetPaise < 0 ? "left" : "right",
        color: theme.text,
        fontSize: 10,
        formatter: (params: { value?: number | null }) => params.value === null || params.value === undefined ? "" : formatPaise(params.value)
      },
      data: values.map((value, index) => ({
        id: ["cost-budget", "recorded-cost", "remaining-budget"][index],
        name: ["Cost budget", "Recorded cost", remainingLabel][index],
        value,
        itemStyle: {
          color: index === 0
            ? (theme.series[1] ?? "#c8aa7c")
            : index === 1
              ? (theme.series[0] ?? "#5f806c")
              : typeof value === "number" && value < 0
                ? theme.status.critical
                : (theme.series[2] ?? "#607fa8"),
          borderRadius: typeof value === "number" && value < 0 ? [5, 0, 0, 5] : [0, 5, 5, 0]
        }
      }))
    }]
  } as DashboardEChartOption;
}

export function BudgetPositionChart({ data }: { data: SuperAdminDashboardOverview }) {
  const partialReason = firstUnavailableReason(data, [
    "finance.costBudgetPaise",
    "finance.recordedCostPaise",
    "finance.remainingBudgetPaise"
  ]);
  const budgetAvailable = !isDashboardMetricUnavailable(data.dataQuality, "finance.costBudgetPaise");
  const recordedAvailable = !isDashboardMetricUnavailable(data.dataQuality, "finance.recordedCostPaise");
  const remainingAvailable = !isDashboardMetricUnavailable(data.dataQuality, "finance.remainingBudgetPaise");
  const budgetValue = budgetAvailable ? formatPaise(data.finance.costBudgetPaise) : "Not available";
  const recordedValue = recordedAvailable ? formatPaise(data.finance.recordedCostPaise) : "Not available";
  const remainingLabel = remainingAvailable && data.finance.remainingBudgetPaise < 0 ? "Overspent" : "Remaining budget";
  const remainingValue = !remainingAvailable ? "Not available" : data.finance.remainingBudgetPaise < 0
    ? `${formatPaise(Math.abs(data.finance.remainingBudgetPaise))} overspent`
    : formatPaise(data.finance.remainingBudgetPaise);
  const utilization = budgetAvailable && recordedAvailable && data.finance.costBudgetPaise > 0
    ? `${Math.round(data.finance.recordedCostPaise * 100 / data.finance.costBudgetPaise)}% of cost budget recorded`
    : budgetAvailable && recordedAvailable
      ? "Utilization is not calculated because the approved cost budget is zero."
      : partialReason ?? "Budget utilization is not available.";

  return (
    <ChartFigure
      eyebrow="Budget control"
      title="Budget position"
      subtitle="Approved cost budget against recorded cost and the signed remaining position."
      table={{
        caption: "Exact approved budget and live recorded-cost position.",
        columns: ["Budget measure", "Amount"],
        rows: [
          { header: "Cost budget", cells: [budgetValue] },
          { header: "Recorded cost", cells: [recordedValue] },
          { header: remainingLabel, cells: [remainingValue] }
        ]
      }}
      footnote={utilization}
      className="dashboard-executive-chart dashboard-executive-chart--budget"
    >
      <DashboardEChart
        chartId="dashboard-budget-position"
        className="dashboard-echart--executive"
        height={238}
        description={`Approved cost budget ${budgetValue}, recorded cost ${recordedValue}, ${remainingLabel.toLowerCase()} ${remainingValue}.`}
        interaction={{
          orientation: "vertical",
          items: [
            ...(budgetAvailable ? [{ id: "cost-budget", seriesId: "executive-budget-position", dataIndex: 0, announcement: `Cost budget, ${formatPaise(data.finance.costBudgetPaise)}` }] : []),
            ...(recordedAvailable ? [{ id: "recorded-cost", seriesId: "executive-budget-position", dataIndex: 1, announcement: `Recorded cost, ${formatPaise(data.finance.recordedCostPaise)}` }] : []),
            ...(remainingAvailable ? [{ id: "remaining-budget", seriesId: "executive-budget-position", dataIndex: 2, announcement: `${remainingLabel}, ${remainingValue}` }] : [])
          ]
        }}
        createOption={(theme) => createBudgetPositionOption({ data, theme })}
      />
    </ChartFigure>
  );
}
