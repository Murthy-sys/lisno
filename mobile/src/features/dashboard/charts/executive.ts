import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from "echarts/charts";

import { dashboardMotionOption } from "./motion";
import { dashboardChartPalette } from "./theme";
import type {
  CapitalDatum,
  DashboardChartOption,
  DashboardChartTone,
  StageDatum
} from "./types";
import { chartToneColor } from "./theme";

export interface FinanceActivityDatum {
  readonly id: string;
  readonly date: string;
  readonly valuePaise: number | null;
  readonly displayValue: string;
  readonly available: boolean;
  readonly unavailableReason?: string | null;
}

export interface FinanceActivityChartData {
  readonly points: readonly FinanceActivityDatum[];
  readonly approvedNetRevenue: CapitalDatum;
  readonly costBudget: CapitalDatum;
}

export interface BudgetPositionChartData {
  readonly costBudget: CapitalDatum;
  readonly recordedCost: CapitalDatum;
  readonly remainingBudget: CapitalDatum;
}

const EXECUTIVE_SERIES_IDS = Object.freeze({
  expense: "executive-finance-recorded-cost-activity",
  revenueGuide: "executive-finance-approved-net-revenue-guide",
  budgetGuide: "executive-finance-cost-budget-guide",
  lifecycle: "executive-project-lifecycle",
  composition: "executive-cost-composition",
  budget: "executive-budget-position"
});

export { EXECUTIVE_SERIES_IDS };

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function shortUtcDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}` : value;
}

function formatAxisPaise(value: number): string {
  const rupees = value / 100;
  const absolute = Math.abs(rupees);
  const sign = rupees < 0 ? "−" : "";
  if (absolute >= 10_000_000) return `${sign}₹${(absolute / 10_000_000).toFixed(1)}Cr`;
  if (absolute >= 100_000) return `${sign}₹${(absolute / 100_000).toFixed(1)}L`;
  if (absolute >= 1_000) return `${sign}₹${(absolute / 1_000).toFixed(0)}k`;
  if (absolute > 0 && absolute < 10) return `${sign}₹${absolute.toFixed(2)}`;
  return `${sign}₹${absolute.toFixed(0)}`;
}

function seriesTransition(reducedMotion: boolean) {
  return reducedMotion ? false : { enabled: true, divideShape: "clone" as const };
}

export function buildFinanceActivityOption(
  data: FinanceActivityChartData,
  reducedMotion: boolean
): DashboardChartOption {
  const dates = data.points.map((point) => shortUtcDate(point.date));
  const expenseData = data.points.map((point) => ({
    id: `finance-activity:${point.id}:bar`,
    name: point.id,
    value: point.available ? finite(point.valuePaise) : null,
    itemStyle: {
      color: dashboardChartPalette.sage,
      borderRadius: [5, 5, 2, 2]
    }
  }));
  const guideData = (datum: CapitalDatum) =>
    datum.available !== false && finite(datum.valuePaise) !== null
      ? data.points.map((point) => ({
          id: `finance-activity:${datum.id}:${point.date}:guide`,
          name: `${datum.id}:${point.date}`,
          value: datum.valuePaise
        }))
      : [];

  const series: Array<BarSeriesOption | LineSeriesOption> = [
    {
      id: EXECUTIVE_SERIES_IDS.expense,
      name: "Recorded cost activity",
      type: "bar",
      z: 2,
      zlevel: 0,
      data: expenseData,
      barMaxWidth: 22,
      barMinHeight: 1,
      emphasis: { focus: "series" },
      universalTransition: seriesTransition(reducedMotion),
      animationDelay: reducedMotion ? 0 : (index: number) => Math.min(index * 18, 240)
    },
    {
      id: EXECUTIVE_SERIES_IDS.revenueGuide,
      name: "Approved net revenue",
      type: "line",
      z: 3,
      zlevel: 0,
      data: guideData(data.approvedNetRevenue),
      showSymbol: false,
      connectNulls: false,
      lineStyle: { color: dashboardChartPalette.blue, width: 1.5, type: "dashed" },
      itemStyle: { color: dashboardChartPalette.blue },
      universalTransition: seriesTransition(reducedMotion)
    },
    {
      id: EXECUTIVE_SERIES_IDS.budgetGuide,
      name: "Cost budget",
      type: "line",
      z: 3,
      zlevel: 0,
      data: guideData(data.costBudget),
      showSymbol: false,
      connectNulls: false,
      lineStyle: { color: dashboardChartPalette.sand, width: 1.5, type: "dotted" },
      itemStyle: { color: dashboardChartPalette.sand },
      universalTransition: seriesTransition(reducedMotion)
    }
  ];

  return {
    backgroundColor: dashboardChartPalette.background,
    ...dashboardMotionOption(reducedMotion),
    color: [dashboardChartPalette.sage, dashboardChartPalette.blue, dashboardChartPalette.sand],
    tooltip: {
      trigger: "axis",
      backgroundColor: dashboardChartPalette.tooltipBackground,
      borderColor: dashboardChartPalette.border,
      textStyle: { color: dashboardChartPalette.ink, fontSize: 11 }
    },
    legend: {
      bottom: 0,
      left: 0,
      itemWidth: 13,
      itemHeight: 7,
      itemGap: 12,
      textStyle: { color: dashboardChartPalette.muted, fontSize: 9 }
    },
    grid: {
      left: 10,
      right: 12,
      top: 18,
      bottom: 54,
      outerBoundsMode: "same",
      outerBoundsContain: "axisLabel"
    },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: true,
      axisLine: { lineStyle: { color: dashboardChartPalette.gridStrong } },
      axisTick: { show: false },
      axisLabel: {
        color: dashboardChartPalette.muted,
        fontSize: 8,
        interval: Math.max(0, Math.ceil(data.points.length / 5) - 1),
        hideOverlap: true
      }
    },
    yAxis: {
      type: "value",
      scale: false,
      min: 0,
      max: ({ max }: { max: number }) => (max <= 0 ? 100 : max),
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: dashboardChartPalette.muted,
        fontSize: 8,
        formatter: formatAxisPaise
      },
      splitLine: { lineStyle: { color: dashboardChartPalette.grid, type: "dashed" } }
    },
    series
  };
}

function ringData(
  scene: "lifecycle" | "composition",
  values: readonly StageDatum[]
) {
  return values.flatMap((value) => {
    const numericValue = finite(value.value);
    if (value.available === false || numericValue === null) return [];
    return [{
      id: `executive-${scene}:${value.id}:slice`,
      name: value.label,
      value: numericValue,
      itemStyle: { color: chartToneColor(value.tone) }
    }];
  });
}

function buildRingOption({
  scene,
  values,
  centerLabel,
  centerValue,
  reducedMotion
}: {
  readonly scene: "lifecycle" | "composition";
  readonly values: readonly StageDatum[];
  readonly centerLabel: string;
  readonly centerValue: string;
  readonly reducedMotion: boolean;
}): DashboardChartOption {
  const valuesData = ringData(scene, values);
  const seriesId = scene === "lifecycle"
    ? EXECUTIVE_SERIES_IDS.lifecycle
    : EXECUTIVE_SERIES_IDS.composition;
  const series: PieSeriesOption = {
    id: seriesId,
    name: scene === "lifecycle" ? "Project status" : "Cost composition",
    type: "pie",
    z: 2,
    zlevel: 0,
    radius: ["56%", "79%"],
    center: ["50%", "48%"],
    avoidLabelOverlap: true,
    stillShowZeroSum: false,
    minAngle: 2,
    padAngle: 2,
    data: valuesData,
    label: { show: false },
    labelLine: { show: false },
    itemStyle: {
      borderColor: dashboardChartPalette.surface,
      borderWidth: 3,
      borderRadius: 5
    },
    emphasis: { scale: true, scaleSize: 5 },
    universalTransition: seriesTransition(reducedMotion)
  };

  return {
    backgroundColor: dashboardChartPalette.background,
    ...dashboardMotionOption(reducedMotion),
    tooltip: {
      trigger: "item",
      backgroundColor: dashboardChartPalette.tooltipBackground,
      borderColor: dashboardChartPalette.border,
      textStyle: { color: dashboardChartPalette.ink, fontSize: 11 }
    },
    graphic: [
      {
        id: `executive-${scene}:center-value`,
        type: "text",
        left: "center",
        top: "38%",
        silent: true,
        style: {
          text: centerValue,
          fill: dashboardChartPalette.ink,
          font: "600 22px Poppins",
          textAlign: "center"
        }
      },
      {
        id: `executive-${scene}:center-label`,
        type: "text",
        left: "center",
        top: "54%",
        silent: true,
        style: {
          text: centerLabel,
          fill: dashboardChartPalette.muted,
          font: "500 9px Poppins",
          textAlign: "center"
        }
      }
    ],
    series: [series]
  };
}

export function buildLifecycleDonutOption(
  values: readonly StageDatum[],
  totalDisplay: string,
  reducedMotion: boolean
): DashboardChartOption {
  return buildRingOption({
    scene: "lifecycle",
    values,
    centerLabel: "PROJECTS",
    centerValue: totalDisplay,
    reducedMotion
  });
}

export function buildCostCompositionDonutOption(
  values: readonly StageDatum[],
  recordedCostDisplay: string,
  reducedMotion: boolean
): DashboardChartOption {
  return buildRingOption({
    scene: "composition",
    values,
    centerLabel: "RECORDED COST",
    centerValue: recordedCostDisplay,
    reducedMotion
  });
}

export function buildBudgetPositionOption(
  data: BudgetPositionChartData,
  reducedMotion: boolean
): DashboardChartOption {
  const overspent = (data.remainingBudget.valuePaise ?? 0) < 0;
  const values = [data.costBudget, data.recordedCost, data.remainingBudget];
  const series: BarSeriesOption = {
    id: EXECUTIVE_SERIES_IDS.budget,
    name: "Budget position",
    type: "bar",
    z: 2,
    zlevel: 0,
    barMaxWidth: 22,
    data: values.map((value, index) => ({
      id: `executive-budget:${value.id}:bar`,
      name: value.label,
      value: value.available !== false ? finite(value.valuePaise) : null,
      itemStyle: {
        color: index === 0
          ? dashboardChartPalette.sand
          : index === 1
            ? dashboardChartPalette.sage
            : (value.valuePaise ?? 0) < 0
              ? dashboardChartPalette.danger
              : dashboardChartPalette.blue,
        borderRadius: (value.valuePaise ?? 0) < 0 ? [7, 0, 0, 7] : [0, 7, 7, 0]
      }
    })),
    label: {
      show: true,
      position: "right",
      color: dashboardChartPalette.ink,
      fontSize: 9,
      formatter: (params: { dataIndex?: number }) =>
        values[params.dataIndex ?? 0]?.displayValue ?? "Not available"
    },
    universalTransition: seriesTransition(reducedMotion)
  };

  return {
    backgroundColor: dashboardChartPalette.background,
    ...dashboardMotionOption(reducedMotion),
    tooltip: {
      trigger: "item",
      backgroundColor: dashboardChartPalette.tooltipBackground,
      borderColor: dashboardChartPalette.border,
      textStyle: { color: dashboardChartPalette.ink, fontSize: 11 }
    },
    grid: {
      left: 8,
      right: 86,
      top: 14,
      bottom: 10,
      outerBoundsMode: "same",
      outerBoundsContain: "axisLabel"
    },
    xAxis: {
      type: "value",
      min: ({ min }: { min: number }) => Math.min(0, min),
      max: ({ max }: { max: number }) => Math.max(0, max),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false, formatter: formatAxisPaise },
      splitLine: { show: false }
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: ["Cost budget", "Recorded cost", "Remaining / overspent"],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: dashboardChartPalette.muted, fontSize: 10 }
    },
    series: [series]
  };
}

export function executiveToneOrder(): readonly DashboardChartTone[] {
  return ["green", "gold", "cyan", "violet", "red", "muted"];
}
