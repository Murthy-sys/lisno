import type { CustomSeriesOption } from "echarts/charts";
import type { CustomSeriesRenderItem } from "echarts";

import {
  capitalFlowWidth,
  projectSpatialPoint,
  spatialId,
  type SpatialPoint
} from "./geometry";
import { dashboardMotionOption } from "./motion";
import {
  createSpatialGuideSeries,
  createSpatialLinkSeries,
  type SpatialLinkDatum
} from "./spatialSeries";
import { chartToneColor, dashboardChartPalette } from "./theme";
import type {
  CapitalChartData,
  CapitalDatum,
  CapitalDatumKind,
  DashboardChartOption
} from "./types";

const CAPITAL_SCENE_ID = "capital-flow";

export const CAPITAL_SERIES_IDS = Object.freeze({
  guide: "capital-flow-guide",
  relationships: "capital-flow-derived-relationships",
  flow: "capital-flow-ribbons"
});
export const CAPITAL_SERIES_ID = CAPITAL_SERIES_IDS.flow;
export const CAPITAL_EMPTY_GRAPHIC_ID = "capital-flow-empty-state";

export interface CapitalSegment {
  readonly id: string;
  readonly name: string;
  readonly categoryIndex: number;
  readonly startPaise: number;
  readonly endPaise: number;
  readonly valuePaise: number;
  readonly kind: Exclude<CapitalDatumKind, "context">;
  readonly color: string;
  readonly previousCategoryIndex: number;
  readonly connectFromPrevious: boolean;
}

export interface CapitalFlowNode {
  readonly id: string;
  readonly metricKey: string;
  readonly label: string;
  readonly displayValue: string;
  readonly valuePaise: number | null;
  readonly available: boolean;
  readonly point: SpatialPoint;
  readonly from?: SpatialPoint;
  readonly color: string;
  readonly lane: "plan" | "live" | "classification" | "outcome";
}

function availableCapitalDatum(
  datum: CapitalDatum
): datum is CapitalDatum & { valuePaise: number } {
  return (
    datum.available !== false &&
    datum.valuePaise !== null &&
    Number.isFinite(datum.valuePaise)
  );
}

function capitalColor(
  datum: CapitalDatum,
  kind: Exclude<CapitalDatumKind, "context">
): string {
  if (datum.tone) return chartToneColor(datum.tone);
  if (kind === "increase") return dashboardChartPalette.riskGreen;
  if (kind === "decrease") return dashboardChartPalette.riskRed;
  return dashboardChartPalette.current;
}

/**
 * Retains the exact integer-paise reconciliation used by the native ledger.
 * Context values never enter this arithmetic chain.
 */
export function buildCapitalSegments(
  flow: readonly CapitalDatum[]
): readonly CapitalSegment[] {
  const chartable = flow.filter((datum) => (datum.kind ?? "total") !== "context");
  const segments: CapitalSegment[] = [];
  let runningPaise = 0;
  let previousCategoryIndex = -1;
  let chainAvailable = true;

  chartable.forEach((datum, categoryIndex) => {
    const kind = (datum.kind ?? "total") as Exclude<CapitalDatumKind, "context">;
    if (!availableCapitalDatum(datum)) {
      previousCategoryIndex = -1;
      chainAvailable = false;
      return;
    }
    if (kind !== "total" && !chainAvailable) return;
    const rawValue = datum.valuePaise;
    let startPaise: number;
    let endPaise: number;
    if (kind === "increase") {
      startPaise = runningPaise;
      endPaise = runningPaise + Math.abs(rawValue);
      runningPaise = endPaise;
    } else if (kind === "decrease") {
      startPaise = runningPaise;
      endPaise = runningPaise - Math.abs(rawValue);
      runningPaise = endPaise;
    } else {
      startPaise = 0;
      endPaise = rawValue;
      runningPaise = endPaise;
      chainAvailable = true;
    }
    segments.push({
      id: datum.id,
      name: datum.label,
      categoryIndex,
      startPaise,
      endPaise,
      valuePaise: rawValue,
      kind,
      color: capitalColor(datum, kind),
      previousCategoryIndex,
      connectFromPrevious: kind !== "total" && previousCategoryIndex >= 0
    });
    previousCategoryIndex = categoryIndex;
  });
  return segments;
}

export function formatPaiseAxis(valuePaise: number): string {
  const rupees = valuePaise / 100;
  const absolute = Math.abs(rupees);
  const sign = rupees < 0 ? "−" : "";
  if (absolute >= 10_000_000) return `${sign}₹${(absolute / 10_000_000).toFixed(1)}Cr`;
  if (absolute >= 100_000) return `${sign}₹${(absolute / 100_000).toFixed(1)}L`;
  if (absolute >= 1_000) return `${sign}₹${(absolute / 1_000).toFixed(0)}k`;
  return `${sign}₹${absolute.toFixed(0)}`;
}

const positions = Object.freeze({
  revenue: { x: -0.78, y: 0.7, z: -0.3 },
  targetProfit: { x: -0.05, y: 0.82, z: -0.2 },
  costBudget: { x: 0.62, y: 0.66, z: -0.04 },
  recordedCost: { x: -0.42, y: 0.28, z: 0.12 },
  remainingBudget: { x: 0.25, y: 0.25, z: 0.26 },
  currentProfit: { x: 0.76, y: 0.39, z: 0.32 },
  procurement: { x: -0.7, y: 0.05, z: 0.36 },
  people: { x: -0.25, y: 0.03, z: 0.43 },
  other: { x: 0.2, y: 0.04, z: 0.5 },
  overhead: { x: 0.65, y: 0.06, z: 0.57 }
});

function byId(flow: readonly CapitalDatum[], id: string): CapitalDatum | undefined {
  return flow.find((datum) => datum.id === id);
}

function flowNode({
  datum,
  point,
  from,
  lane,
  fallbackId,
  fallbackLabel,
  color
}: {
  readonly datum: CapitalDatum | undefined;
  readonly point: SpatialPoint;
  readonly from?: SpatialPoint;
  readonly lane: CapitalFlowNode["lane"];
  readonly fallbackId: string;
  readonly fallbackLabel: string;
  readonly color: string;
}): CapitalFlowNode {
  const available = datum ? availableCapitalDatum(datum) : false;
  return {
    id: `${datum?.id ?? fallbackId}:${lane}`,
    metricKey: datum?.id ?? fallbackId,
    label: datum?.shortLabel ?? datum?.label ?? fallbackLabel,
    displayValue: datum?.displayValue ?? "Not available",
    valuePaise: available && datum ? datum.valuePaise : null,
    available,
    point,
    ...(from ? { from } : {}),
    color: datum?.tone ? chartToneColor(datum.tone) : color,
    lane
  };
}

export function buildCapitalFlowNodes(
  flow: readonly CapitalDatum[]
): readonly CapitalFlowNode[] {
  const revenue = byId(flow, "finance.approvedSubtotalPaise") ?? flow.find((datum) => datum.kind === "increase");
  const targetProfit = byId(flow, "finance.targetProfitPaise");
  const costBudget = byId(flow, "finance.costBudgetPaise");
  const recordedCost = byId(flow, "finance.recordedCostPaise");
  const remainingBudget = byId(flow, "finance.remainingBudgetPaise");
  const currentProfit = byId(flow, "finance.currentProfitPaise") ?? flow.find((datum) => datum.kind === "total");
  const procurement = byId(flow, "finance.procurementCostPaise");
  const people = byId(flow, "finance.employeePaymentPaise");
  const other = byId(flow, "finance.otherExpensePaise");
  const overhead = byId(flow, "finance.overheadPaise");
  return [
    flowNode({ datum: revenue, point: positions.revenue, lane: "plan", fallbackId: "finance.approvedSubtotalPaise", fallbackLabel: "Net revenue", color: dashboardChartPalette.current }),
    flowNode({ datum: targetProfit, point: positions.targetProfit, from: positions.revenue, lane: "plan", fallbackId: "finance.targetProfitPaise", fallbackLabel: "Target profit", color: dashboardChartPalette.riskGreen }),
    flowNode({ datum: costBudget, point: positions.costBudget, from: positions.revenue, lane: "plan", fallbackId: "finance.costBudgetPaise", fallbackLabel: "Cost budget", color: dashboardChartPalette.selected }),
    flowNode({ datum: recordedCost, point: positions.recordedCost, from: positions.costBudget, lane: "live", fallbackId: "finance.recordedCostPaise", fallbackLabel: "Recorded cost", color: dashboardChartPalette.previous }),
    flowNode({ datum: remainingBudget, point: positions.remainingBudget, from: positions.costBudget, lane: "live", fallbackId: "finance.remainingBudgetPaise", fallbackLabel: "Budget left", color: dashboardChartPalette.riskGreen }),
    // Current profit is a labelled derived outcome. It has no quantitative
    // incoming ribbon, which prevents it being read as another revenue outflow.
    flowNode({ datum: currentProfit, point: positions.currentProfit, lane: "outcome", fallbackId: "finance.currentProfitPaise", fallbackLabel: "Live profit", color: (currentProfit?.valuePaise ?? 0) < 0 ? dashboardChartPalette.riskRed : dashboardChartPalette.riskGreen }),
    flowNode({ datum: procurement, point: positions.procurement, from: positions.recordedCost, lane: "classification", fallbackId: "finance.procurementCostPaise", fallbackLabel: "Procurement", color: dashboardChartPalette.previous }),
    flowNode({ datum: people, point: positions.people, from: positions.recordedCost, lane: "classification", fallbackId: "finance.employeePaymentPaise", fallbackLabel: "People", color: dashboardChartPalette.selected }),
    flowNode({ datum: other, point: positions.other, from: positions.recordedCost, lane: "classification", fallbackId: "finance.otherExpensePaise", fallbackLabel: "Other", color: dashboardChartPalette.riskYellow }),
    flowNode({ datum: overhead, point: positions.overhead, from: positions.recordedCost, lane: "classification", fallbackId: "finance.overheadPaise", fallbackLabel: "Overhead", color: dashboardChartPalette.riskRed })
  ];
}

function capitalFlowSeries(
  nodes: readonly CapitalFlowNode[],
  reducedMotion: boolean
): CustomSeriesOption {
  const maximum = Math.max(
    1,
    ...nodes.map((node) => node.available ? Math.abs(node.valuePaise ?? 0) : 0)
  );
  const renderItem: CustomSeriesRenderItem = (params, api) => {
    const node = nodes[params.dataIndexInside ?? params.dataIndex];
    if (!node) return null;
    const viewport = { width: api.getWidth(), height: api.getHeight() };
    const point = projectSpatialPoint(node.point, viewport);
    const rootId = spatialId(CAPITAL_SCENE_ID, node.metricKey, node.lane, node.id, "root");
    const transition = reducedMotion
      ? {}
      : { transition: ["shape", "style"] as ("shape" | "style")[] };
    const children: Record<string, unknown>[] = [];
    const scaled = capitalFlowWidth(node.valuePaise ?? 0, maximum, 20);
    if (node.from && node.available && scaled.width > 0) {
      const from = projectSpatialPoint(node.from, viewport);
      const negative = scaled.direction < 0;
      const controlY = negative
        ? Math.max(from.y, point.y) + viewport.height * 0.12
        : Math.min(from.y, point.y) - viewport.height * 0.08;
      const curve = {
        x1: from.x,
        y1: from.y,
        x2: point.x,
        y2: point.y,
        cpx1: (from.x + point.x) / 2,
        cpy1: controlY
      };
      children.push(
        {
          type: "bezierCurve",
          id: `${rootId}:ribbon-shadow`,
          name: "ribbon-shadow",
          silent: true,
          shape: { ...curve, y1: curve.y1 + 4, y2: curve.y2 + 4, cpy1: curve.cpy1 + 4 },
          style: { stroke: "rgba(2,2,10,0.5)", lineWidth: scaled.width + 5, fill: "transparent", lineCap: "round" },
          ...transition
        },
        {
          type: "bezierCurve",
          id: `${rootId}:ribbon-body`,
          name: "ribbon-body",
          shape: curve,
          style: {
            stroke: negative ? dashboardChartPalette.riskRed : node.color,
            lineWidth: scaled.width,
            fill: "transparent",
            lineCap: "round",
            opacity: node.lane === "classification" ? 0.74 : 0.88,
            shadowBlur: 7,
            shadowColor: negative ? dashboardChartPalette.riskRed : node.color
          },
          ...(reducedMotion
            ? {}
            : {
                enterFrom: {
                  shape: { ...curve, x2: curve.x1, y2: curve.y1, cpx1: curve.x1, cpy1: curve.y1 }
                },
                transition: ["shape", "style"] as ("shape" | "style")[]
              })
        },
        {
          type: "bezierCurve",
          id: `${rootId}:ribbon-light`,
          name: "ribbon-light",
          silent: true,
          shape: curve,
          style: { stroke: "rgba(255,255,255,0.42)", lineWidth: Math.max(0.7, scaled.width * 0.12), fill: "transparent", lineCap: "round", opacity: 0.7 },
          ...transition
        }
      );
    }

    children.push({
      type: "ellipse",
      id: `${rootId}:node-shadow`,
      name: "node-shadow",
      silent: true,
      shape: { cx: point.x + 3, cy: point.y + 6, rx: 13, ry: 5 },
      style: { fill: "rgba(2,2,10,0.5)" },
      ...transition
    });
    if (node.available) {
      children.push(
        {
          type: "circle",
          id: `${rootId}:node-halo`,
          name: "node-halo",
          silent: true,
          shape: { cx: point.x, cy: point.y, r: node.lane === "outcome" ? 14 : 11 },
          style: { fill: "transparent", stroke: node.color, lineWidth: 4, opacity: 0.15, shadowBlur: 10, shadowColor: node.color },
          ...transition
        },
        {
          type: "circle",
          id: `${rootId}:node-core`,
          name: "node-core",
          shape: { cx: point.x, cy: point.y, r: node.lane === "outcome" ? 10 : 8 },
          style: {
            fill: { type: "radial", x: 0.3, y: 0.25, r: 0.8, colorStops: [
              { offset: 0, color: "rgba(255,255,255,0.95)" },
              { offset: 0.15, color: node.color },
              { offset: 1, color: "rgba(16,11,37,0.98)" }
            ] },
            stroke: "rgba(247,244,255,0.44)",
            lineWidth: 0.8
          },
          ...transition
        }
      );
    } else {
      children.push(
        {
          type: "circle",
          id: `${rootId}:node-unavailable`,
          name: "node-unavailable",
          shape: { cx: point.x, cy: point.y, r: 8 },
          style: { fill: "rgba(116,112,135,0.08)", stroke: dashboardChartPalette.riskGray, lineWidth: 1.1, lineDash: [3, 3] },
          ...transition
        },
        {
          type: "line",
          id: `${rootId}:node-unavailable-slash`,
          name: "node-unavailable-slash",
          shape: { x1: point.x - 4, y1: point.y + 4, x2: point.x + 4, y2: point.y - 4 },
          style: { stroke: dashboardChartPalette.riskGray, lineWidth: 1.1 },
          ...transition
        }
      );
    }
    const labelLeft = node.point.x > 0.48;
    const labelX = point.x + (labelLeft ? -14 : 14);
    const align = labelLeft ? "right" : "left";
    children.push(
      {
        type: "text",
        id: `${rootId}:label`,
        name: "label",
        silent: true,
        style: { x: labelX, y: point.y - 7, text: node.label, fill: dashboardChartPalette.ink, font: "600 8px Poppins", textAlign: align, textVerticalAlign: "middle" },
        ...transition
      },
      {
        type: "text",
        id: `${rootId}:value`,
        name: "value",
        silent: true,
        style: { x: labelX, y: point.y + 7, text: node.available ? node.displayValue : "Unavailable", fill: node.available ? node.color : dashboardChartPalette.riskGray, font: "500 8px Poppins", textAlign: align, textVerticalAlign: "middle" },
        ...transition
      }
    );
    return {
      type: "group",
      id: rootId,
      name: node.metricKey,
      diffChildrenByName: true,
      $mergeChildren: "byName",
      children
    } as unknown as ReturnType<CustomSeriesRenderItem>;
  };
  return {
    id: CAPITAL_SERIES_IDS.flow,
    name: "Capital plan and live flow",
    type: "custom",
    z: 2,
    zlevel: 0,
    coordinateSystem: "none",
    renderItem,
    data: nodes.map((node) => ({
      id: spatialId(CAPITAL_SCENE_ID, node.metricKey, node.lane, node.id, "datum"),
      name: node.metricKey,
      value: [node.valuePaise, node.available ? 1 : 0, maximum]
    })),
    silent: false,
    universalTransition: reducedMotion ? false : { enabled: true, divideShape: "clone" },
    animationDelay: reducedMotion ? 0 : (index: number) => Math.min(index * 38, 280),
    animationDelayUpdate: reducedMotion ? 0 : (index: number) => Math.min(index * 18, 120)
  };
}

export function buildCapitalOption(
  data: CapitalChartData,
  reducedMotion: boolean
): DashboardChartOption {
  const nodes = buildCapitalFlowNodes(data.flow);
  const hasFinancialSource = nodes.some((node) => node.metricKey === "finance.approvedSubtotalPaise" && node.available);
  const profit = nodes.find((node) => node.metricKey === "finance.currentProfitPaise");
  const revenue = nodes.find((node) => node.metricKey === "finance.approvedSubtotalPaise");
  const recorded = nodes.find((node) => node.metricKey === "finance.recordedCostPaise");
  const relationships: SpatialLinkDatum[] = profit && revenue && recorded
    ? [
        { id: "profit-from-revenue", metricKey: profit.metricKey, from: revenue.point, to: profit.point, lane: "derived-outcome", color: "rgba(66,211,155,0.32)", width: 0.9, dashed: true },
        { id: "profit-less-recorded", metricKey: profit.metricKey, from: recorded.point, to: profit.point, lane: "derived-outcome", color: "rgba(255,107,120,0.3)", width: 0.9, dashed: true }
      ]
    : [];
  const series: CustomSeriesOption[] = [
    createSpatialGuideSeries({ sceneId: CAPITAL_SCENE_ID, seriesId: CAPITAL_SERIES_IDS.guide, variant: "flow", reducedMotion, accent: dashboardChartPalette.selected }),
    createSpatialLinkSeries({ sceneId: CAPITAL_SCENE_ID, seriesId: CAPITAL_SERIES_IDS.relationships, name: "Current profit derivation", data: relationships, reducedMotion }),
    capitalFlowSeries(nodes, reducedMotion)
  ];
  const base: DashboardChartOption = {
    backgroundColor: dashboardChartPalette.background,
    ...dashboardMotionOption(reducedMotion),
    tooltip: { show: false },
    series
  };
  if (hasFinancialSource) {
    return {
      ...base,
      graphic: [{ id: CAPITAL_EMPTY_GRAPHIC_ID, $action: "remove" }]
    };
  }
  return {
    ...base,
    graphic: [
      {
        id: CAPITAL_EMPTY_GRAPHIC_ID,
        type: "group",
        left: "center",
        top: "middle",
        children: [
          { type: "circle", shape: { cx: 0, cy: -28, r: 17 }, style: { fill: "rgba(129,112,242,0.08)", stroke: dashboardChartPalette.current, lineWidth: 1.5, lineDash: [4, 4] } },
          { type: "text", style: { x: 0, y: 8, text: "CAPITAL DATA NOT AVAILABLE", fill: dashboardChartPalette.ink, font: "600 11px Poppins", textAlign: "center", textVerticalAlign: "middle" } },
          { type: "text", style: { x: 0, y: 32, text: "Awaiting approved finance lineage", fill: dashboardChartPalette.muted, font: "10px Poppins", textAlign: "center", textVerticalAlign: "middle" } }
        ]
      }
    ]
  };
}
