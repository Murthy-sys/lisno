import { useState } from "react";
import { ChartFigure, type ChartLegendEntry } from "../../../components/charts";
import { chartDatasetTable, chartDatasetTotal, formatChartValue, getVisibleDashboardChartDataset, type DashboardChartDataset } from "./dashboardChartData";
import { DashboardEChart } from "./echarts/DashboardEChart";
import type { DashboardChartTheme, DashboardEChartOption } from "./echarts/types";

const shortNumber = (value: number, unit: DashboardChartDataset["unit"]) => unit === "bps" ? `${value / 100}%` : new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1, ...(unit === "paise" ? { style: "currency", currency: "INR" } : {}) }).format(unit === "paise" ? value / 100 : value);
const seriesColor = (dataset: DashboardChartDataset, theme: Readonly<DashboardChartTheme>, index: number) => dataset.id === "dashboard-period-activity" && dataset.series[index]?.id === "previous-period" ? "#aec8b6" : theme.series[index % theme.series.length];
const rowColor = (dataset: DashboardChartDataset, theme: Readonly<DashboardChartTheme>, index: number) => {
  const status = dataset.rows[index]?.status;
  return status ? theme.status[status] : dataset.kind === "donut" ? theme.series[index % theme.series.length] : theme.series[0];
};

export function createDashboardDataChartOption(dataset: DashboardChartDataset, theme: Readonly<DashboardChartTheme>): DashboardEChartOption {
  const hasNegative = dataset.rows.some((row) => row.values.some((value) => value !== null && value < 0));
  const kind = dataset.kind === "donut" && hasNegative ? "bar" : dataset.kind;
  const tooltip = {
    trigger: kind === "line" ? "axis" : "item",
    backgroundColor: theme.surface, borderColor: theme.grid, borderWidth: 1,
    textStyle: { color: theme.text, fontSize: 12 },
    formatter: (params: unknown) => {
      const entries = Array.isArray(params) ? params : [params];
      return entries.map((entry) => {
        const item = entry as { dataIndex?: number; seriesIndex?: number };
        const row = dataset.rows[item.dataIndex ?? 0];
        const series = dataset.series[item.seriesIndex ?? 0];
        return row ? `${row.label}\n${kind === "line" || dataset.series.length > 1 ? `${series.label}: ` : ""}${formatChartValue(row.values[item.seriesIndex ?? 0] ?? null, dataset.unit)}${row.context ? `\n${row.context}` : ""}` : "Not available";
      }).join("\n");
    }
  };
  const base = { animation: false, tooltip };
  if (kind === "donut") return {
    ...base,
    series: [{
      id: dataset.series[0].id, name: dataset.title, type: "pie", radius: ["61%", "83%"], center: ["50%", "50%"],
      stillShowZeroSum: false, minAngle: 0, label: { show: false }, labelLine: { show: false },
      itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 0 },
      emphasis: { scale: false, label: { show: false } },
      data: dataset.rows.map((row, index) => ({ id: row.id, name: row.label, groupId: row.metricKey ?? row.id, value: row.values[0], itemStyle: { color: rowColor(dataset, theme, index) } }))
    }]
  } as DashboardEChartOption;

  const valueAxis = {
    type: "value", min: hasNegative ? undefined : 0,
    ...(dataset.unit === "bps" ? { max: Math.max(10_000, ...dataset.rows.flatMap((row) => row.values.map((value) => value ?? 0))) } : {}),
    ...(dataset.unit === "count" ? { minInterval: 1 } : {}),
    axisLine: { show: false }, axisTick: { show: false },
    splitLine: { lineStyle: { color: theme.grid, type: "dashed" } },
    axisLabel: { color: theme.mutedText, fontSize: 10, formatter: (value: number) => shortNumber(value, dataset.unit) }
  };
  return {
    ...base,
    grid: { left: 8, right: 16, top: 18, bottom: 8, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    xAxis: kind === "bar" ? valueAxis : {
      type: "category", boundaryGap: false, data: dataset.rows.map((row) => row.id),
      axisLine: { lineStyle: { color: theme.grid } }, axisTick: { show: false },
      axisLabel: { color: theme.mutedText, fontSize: 10, hideOverlap: true, formatter: (_value: string, index: number) => dataset.rows[index].label.replace(/ \d{4}$/, "") }
    },
    yAxis: kind === "line" ? valueAxis : {
      type: "category", inverse: true, data: dataset.rows.map((row) => row.label),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: theme.text, fontSize: 10, width: 130, overflow: "truncate" }
    },
    series: dataset.series.map((series, seriesIndex) => ({
      id: series.id, name: series.label, type: kind, animation: false,
      ...(kind === "line" ? {
        smooth: false, connectNulls: false, symbol: "circle", symbolSize: 5, showSymbol: dataset.rows.length < 32,
        lineStyle: { color: seriesColor(dataset, theme, seriesIndex), width: seriesIndex === 0 ? 2.8 : 2, ...(dataset.area && seriesIndex > 0 ? { type: "dashed" } : {}) },
        itemStyle: { color: seriesColor(dataset, theme, seriesIndex) },
        ...((dataset.area && seriesIndex === 0) || (dataset.unit === "paise" && dataset.series.length === 1) ? { areaStyle: { color: seriesColor(dataset, theme, seriesIndex), opacity: 0.16 } } : {})
      } : { barMaxWidth: 18, barGap: "20%", itemStyle: { borderRadius: 0 }, label: { show: dataset.series.length > 1, position: "right", color: theme.text, fontSize: 10, formatter: (params: { value?: number | null }) => typeof params.value === "number" ? shortNumber(params.value, dataset.unit) : "" } }),
      emphasis: { scale: false },
      data: dataset.rows.map((row, index) => ({ id: row.id, name: row.id, groupId: row.metricKey ?? row.id, value: row.values[seriesIndex], ...(kind === "bar" ? { itemStyle: { color: dataset.series.length > 1 ? seriesColor(dataset, theme, seriesIndex) : rowColor(dataset, theme, index) } } : {}) }))
    }))
  } as DashboardEChartOption;
}

export function DashboardDataChart({ dataset: source, onActivate, plotHeight }: { dataset: DashboardChartDataset; onActivate?: (id: string) => void; plotHeight?: number }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dataset = getVisibleDashboardChartDataset(source);
  if (!dataset) return null;
  const selectedRow = dataset.rows.find((row) => row.id === selectedId);
  const table = chartDatasetTable(dataset);
  const total = chartDatasetTotal(dataset);
  const isDonut = dataset.kind === "donut";
  const empty = dataset.rows.length === 0 || (isDonut && !dataset.partialReason && dataset.rows.every((row) => row.values[0] === 0));
  const hasNegative = dataset.rows.some((row) => row.values.some((value) => value !== null && value < 0));
  const legend: ChartLegendEntry[] = isDonut ? dataset.rows.map((row, index) => ({
    label: row.label, color: row.status ? `var(--chart-status-${row.status})` : `var(--chart-series-${index + 1})`,
    value: `${formatChartValue(row.values[0], dataset.unit)}${total !== null && total > 0 && row.values[0] !== null ? ` · ${(row.values[0] / total * 100).toFixed(1)}%` : ""}`
  })) : dataset.series.map((series, index) => ({ label: series.label, color: dataset.id === "dashboard-period-activity" && series.id === "previous-period" ? "#aec8b6" : `var(--chart-series-${index + 1})`, mark: "line" as const }));
  const interactionItems = dataset.rows.flatMap((row, dataIndex) => dataset.series.flatMap((series, seriesIndex) => row.values[seriesIndex] === null ? [] : [{
    id: dataset.series.length === 1 ? row.id : `${series.id}-${row.id}`,
    rowId: row.id, seriesId: series.id, dataIndex,
    announcement: `${row.label}, ${series.label}, ${formatChartValue(row.values[seriesIndex], dataset.unit)}${row.context ? `. ${row.context}` : ""}`
  }]));
  const height = plotHeight ?? (isDonut ? 266 : dataset.kind === "bar" ? Math.max(150, dataset.rows.length * (dataset.series.length > 1 ? 48 : 34) + 54) : 260);
  return <ChartFigure
    title={dataset.title}
    subtitle={dataset.subtitle}
    actions={dataset.totalLabel ? <span className="dashboard-chart-total"><span>{dataset.totalLabel}</span><strong>{formatChartValue(dataset.total ?? null, dataset.unit)}</strong></span> : undefined}
    legend={isDonut ? undefined : legend}
    table={{ caption: `${dataset.title}: exact values.`, columns: table.columns, rows: table.rows.map((row) => ({ header: String(row[0]), cells: row.slice(1).map((value, index) => value === null ? "Not available" : typeof value === "number" && index < dataset.series.length ? formatChartValue(dataset.unit === "count" ? value : value * 100, dataset.unit) : typeof value === "number" && table.columns[index + 1] === "Share (%)" ? `${value}%` : value) })) }}
    unavailableReason={dataset.unavailableReason}
    empty={empty}
    emptyMessage={isDonut ? "No recorded entries in this population yet." : "No dated observations in the selected period."}
    footnote={[dataset.footnote, dataset.partialReason ? `Partial data: ${dataset.partialReason}${isDonut ? " Shares are unavailable when the population is incomplete." : ""}` : undefined, hasNegative && isDonut ? "Signed amounts are shown as bars." : undefined].filter(Boolean).join(" · ") || undefined}
    className={`dashboard-reference-chart dashboard-reference-chart--${dataset.kind}`}
  >
    <div className={isDonut ? "dashboard-chart-donut-layout" : undefined}>
    <div className={isDonut ? "dashboard-chart-donut-stage" : undefined}>
    <DashboardEChart
      chartId={dataset.id}
      height={height}
      motion="disabled"
      className="dashboard-echart--reference"
      description={`${dataset.title}. ${dataset.rows.length} ${dataset.kind === "line" ? "UTC observations" : "categories"}. ${dataset.partialReason ? "Partial data; unavailable values are omitted." : "Exact values are available in the table."}`}
      interaction={{
        orientation: isDonut ? "radial" : dataset.kind === "bar" ? "vertical" : "horizontal",
        items: interactionItems,
        onActivate: (id) => {
          const rowId = interactionItems.find((item) => item.id === id)?.rowId;
          if (!rowId) return;
          setSelectedId(rowId);
          onActivate?.(rowId);
        }
      }}
      createOption={(theme) => createDashboardDataChartOption(dataset, theme)}
    />
    {isDonut && total !== null ? <div className="dashboard-chart-donut-center" aria-hidden="true"><strong>{shortNumber(total, dataset.unit)}</strong><span>{dataset.totalLabel ?? "Total"}</span></div> : null}
    </div>
    {isDonut ? <ul className="dashboard-chart-category-list">
      {dataset.rows.map((row, index) => <li key={row.id}>
        {onActivate ? <button type="button" id={dataset.id === "dashboard-project-status" ? `dashboard-lifecycle-${row.id}` : undefined} onClick={() => onActivate(row.id)} aria-label={`View ${row.label.toLowerCase()} projects`}>
          <span className="dashboard-chart-category-dot" style={{ background: legend[index].color }} aria-hidden="true" />
          <span>{row.label}</span><strong>{formatChartValue(row.values[0], dataset.unit)}</strong>
          {total !== null && total > 0 && row.values[0] !== null ? <small>{(row.values[0] * 100 / total).toFixed(0)}%</small> : null}
        </button> : <span className="dashboard-chart-category-value"><span className="dashboard-chart-category-dot" style={{ background: legend[index].color }} aria-hidden="true" /><span>{row.label}</span><strong>{legend[index].value}</strong></span>}
      </li>)}
    </ul> : null}
    </div>
    {onActivate && !isDonut ? <div className="dashboard-chart-drilldown-actions" aria-label={`${dataset.title} details`}>
      {dataset.rows.map((row) => <button type="button" key={row.id} id={dataset.id === "dashboard-period-activity" ? `dashboard-comparison-${row.id}` : dataset.id === "dashboard-project-status" ? `dashboard-lifecycle-${row.id}` : undefined} onClick={() => onActivate(row.id)}>{row.label}<span aria-hidden="true"> ›</span></button>)}
    </div> : null}
    {selectedRow && !onActivate ? <p className="dashboard-chart-selected-value" role="status"><strong>{selectedRow.label}</strong>{dataset.series.map((series, index) => selectedRow.values[index] === null ? null : <span key={series.id}>{series.label}: {formatChartValue(selectedRow.values[index], dataset.unit)}</span>)}</p> : null}
  </ChartFigure>;
}
