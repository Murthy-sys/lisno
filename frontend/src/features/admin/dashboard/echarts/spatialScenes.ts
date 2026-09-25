import type { CustomSeriesRenderItem } from "echarts";

import type { DashboardChartTheme, DashboardEChartOption } from "./types";
import {
  countOrbRadius,
  createFlowRibbonPolygon,
  linearSpatialValue,
  projectSpatialPoint,
  signedFlowScale,
  sortSpatialFarToNear,
  spatialSemanticId,
  type SpatialPoint3D
} from "./spatialGeometry";

export type SpatialStatus = keyof DashboardChartTheme["status"];
export type SpatialNodeLayout = "constellation" | "orbit" | "corridor" | "topology" | "risk";

export interface SpatialNodeDatum {
  key: string;
  metricKey?: string;
  label: string;
  value: number | null;
  displayValue: string;
  detail?: string;
  status?: SpatialStatus;
  colorIndex?: number;
  available?: boolean;
  lane?: "current" | "previous" | "snapshot";
  /** null leaves a node independent; undefined follows the prior waypoint. */
  fromKey?: string | null;
}

export interface SpatialTemporalSeries {
  key: string;
  label: string;
  values: Array<number | null>;
  displayValues: string[];
  colorIndex?: number;
  /** Fixed normalized depth keeps a semantic lane stationary when peer lanes hide. */
  depth?: number;
}

export interface SpatialFlowDatum {
  key: string;
  metricKey?: string;
  label: string;
  value: number;
  displayValue: string;
  runningTotal?: number;
  runningDisplayValue?: string;
  kind?: "context" | "source" | "allocation" | "outflow" | "outcome";
  /** undefined follows the previous point, null draws a standalone context node. */
  fromKey?: string | null;
  point?: SpatialPoint3D;
}

const spatialPalette = (theme: Readonly<DashboardChartTheme>) => ({
  field: theme.spatial?.field ?? "#17122f",
  plane: theme.spatial?.plane ?? "#312951",
  line: theme.spatial?.line ?? "#736aa0",
  text: theme.spatial?.text ?? "#f7f4ff",
  muted: theme.spatial?.muted ?? "#b8b1ce",
  gold: theme.spatial?.gold ?? "#f4c84b",
  cyan: theme.spatial?.cyan ?? "#29d5c6"
});

const colorFor = (
  theme: Readonly<DashboardChartTheme>,
  datum: Pick<SpatialNodeDatum, "status" | "colorIndex">
) => datum.status
  ? theme.status[datum.status]
  : theme.series[(datum.colorIndex ?? 0) % theme.series.length];

const asPoints = (points: Array<{ x: number; y: number }>) => points.map(({ x, y }) => [x, y]);

const sceneTooltip = (params: unknown) => {
  if (typeof params !== "object" || params === null) return "";
  const data = (params as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return "";
  const datum = data as { label?: unknown; displayValue?: unknown; detail?: unknown };
  if (typeof datum.label !== "string" || typeof datum.displayValue !== "string") return "";
  return `${datum.label}: ${datum.displayValue}${typeof datum.detail === "string" && datum.detail ? ` · ${datum.detail}` : ""}`;
};

const floorChildren = (
  width: number,
  height: number,
  palette: ReturnType<typeof spatialPalette>,
  prefix: string
) => {
  const viewport = { width, height, paddingX: 18, paddingTop: 14, paddingBottom: 20 };
  const corners = [
    projectSpatialPoint({ x: -1.08, y: 0, z: -0.9 }, viewport),
    projectSpatialPoint({ x: 1.08, y: 0, z: -0.9 }, viewport),
    projectSpatialPoint({ x: 1.08, y: 0, z: 0.9 }, viewport),
    projectSpatialPoint({ x: -1.08, y: 0, z: 0.9 }, viewport)
  ];
  const children: Array<Record<string, unknown>> = [{
    type: "polygon",
    id: `${prefix}--floor`,
    name: `${prefix}--floor`,
    silent: true,
    shape: { points: corners.map(({ x, y }) => [x, y]) },
    style: { fill: palette.plane, opacity: 0.32, stroke: palette.line, lineWidth: 1 },
    transition: ["shape", "style"]
  }];
  for (let index = 0; index < 5; index += 1) {
    const fraction = index / 4;
    const x = -1.08 + fraction * 2.16;
    const start = projectSpatialPoint({ x, y: 0, z: -0.9 }, viewport);
    const end = projectSpatialPoint({ x, y: 0, z: 0.9 }, viewport);
    children.push({
      type: "line",
      id: `${prefix}--floor-x-${index}`,
      name: `${prefix}--floor-x-${index}`,
      silent: true,
      shape: { x1: start.x, y1: start.y, x2: end.x, y2: end.y },
      style: { stroke: palette.line, lineWidth: 1, opacity: 0.18 },
      transition: ["shape", "style"]
    });
  }
  for (let index = 0; index < 4; index += 1) {
    const fraction = index / 3;
    const z = -0.9 + fraction * 1.8;
    const start = projectSpatialPoint({ x: -1.08, y: 0, z }, viewport);
    const end = projectSpatialPoint({ x: 1.08, y: 0, z }, viewport);
    children.push({
      type: "line",
      id: `${prefix}--floor-z-${index}`,
      name: `${prefix}--floor-z-${index}`,
      silent: true,
      shape: { x1: start.x, y1: start.y, x2: end.x, y2: end.y },
      style: { stroke: palette.line, lineWidth: 1, opacity: 0.15 },
      transition: ["shape", "style"]
    });
  }
  return children;
};

const genericNodePositions = (layout: SpatialNodeLayout, count: number): SpatialPoint3D[] =>
  Array.from({ length: count }, (_, index) => {
    const fraction = count <= 1 ? 0.5 : index / (count - 1);
    if (layout === "corridor") {
      return { x: -0.92 + fraction * 1.84, y: 0.17, z: -0.48 + fraction * 0.96 };
    }
    if (layout === "orbit") {
      const angle = -Math.PI * 0.92 + fraction * Math.PI * 1.84;
      return { x: Math.cos(angle) * 0.86, y: 0.19, z: Math.sin(angle) * 0.72 };
    }
    if (layout === "constellation") return { x: 0, y: 0.2, z: 0 };
    if (layout === "risk") {
      const positions = [
        { x: -0.85, z: 0.35 }, { x: -0.28, z: -0.35 },
        { x: 0.28, z: 0.35 }, { x: 0.85, z: -0.35 }
      ];
      const position = positions[index] ?? {
        x: -0.86 + (index % 4) * 0.56,
        z: -0.45 + Math.floor(index / 4) * 0.8
      };
      return { ...position, y: 0.18 };
    }
    const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
    const column = index % columns;
    const row = Math.floor(index / columns);
    const rowCount = Math.ceil(count / columns);
    return {
      x: columns === 1 ? 0 : -0.82 + column / (columns - 1) * 1.64,
      y: 0.18,
      z: rowCount === 1 ? 0 : -0.54 + row / (rowCount - 1) * 1.08
    };
  });

const constellationPosition = (
  node: SpatialNodeDatum,
  index: number,
  nodes: readonly SpatialNodeDatum[],
  width: number
): SpatialPoint3D => {
  const metricKeys = [...new Set(nodes.map((entry) => entry.metricKey ?? entry.key))];
  const metricIndex = Math.max(0, metricKeys.indexOf(node.metricKey ?? node.key));
  const compact = width < 620;
  const columns = compact ? Math.min(3, metricKeys.length) : metricKeys.length;
  const row = Math.floor(metricIndex / Math.max(1, columns));
  const column = metricIndex % Math.max(1, columns);
  const rowCount = Math.ceil(metricKeys.length / Math.max(1, columns));
  const baseX = columns <= 1 ? 0 : -0.86 + column / (columns - 1) * 1.72;
  const baseY = rowCount <= 1 ? 0.24 : 0.5 - row / (rowCount - 1) * 0.4;
  const baseZ = rowCount <= 1 ? 0 : -0.42 + row / (rowCount - 1) * 0.84;
  const hasComparisonLane = nodes.some((entry) => entry.lane === "current" || entry.lane === "previous");
  if (!hasComparisonLane) {
    const stagger = compact ? (column % 2 === 0 ? -0.16 : 0.16) : (index % 2 === 0 ? -0.28 : 0.28);
    return { x: baseX, y: baseY, z: baseZ + stagger };
  }
  const laneDirection = node.lane === "previous" ? 1 : -1;
  return {
    x: baseX + laneDirection * (compact ? 0.08 : 0.03),
    y: baseY + (node.lane === "current" ? 0.04 : -0.02),
    z: baseZ + laneDirection * 0.25
  };
};

const nodePositions = (
  layout: SpatialNodeLayout,
  nodes: readonly SpatialNodeDatum[],
  width: number
): SpatialPoint3D[] => layout === "constellation"
  ? nodes.map((node, index) => constellationPosition(node, index, nodes, width))
  : genericNodePositions(layout, nodes.length);

export function createSpatialNodeSceneOption({
  sceneId,
  layout,
  nodes,
  theme,
  connect = layout === "corridor" || layout === "orbit",
  domainMaximum: configuredDomainMaximum
}: {
  sceneId: string;
  layout: SpatialNodeLayout;
  nodes: SpatialNodeDatum[];
  theme: Readonly<DashboardChartTheme>;
  connect?: boolean;
  domainMaximum?: number;
}): DashboardEChartOption {
  const palette = spatialPalette(theme);
  const dataPositions = nodePositions(layout, nodes, 1000);
  const domainMaximum = Math.max(
    0,
    configuredDomainMaximum ?? 0,
    ...nodes.flatMap((node) => node.value === null ? [] : [node.value])
  );
  const data = nodes.map((node, index) => ({
    id: spatialSemanticId(sceneId, node.metricKey ?? node.key, node.lane ?? "snapshot", node.key, "orb"),
    name: node.key,
    groupId: node.metricKey ?? node.key,
    value: [node.value ?? 0, dataPositions[index].x, dataPositions[index].y, dataPositions[index].z],
    label: node.label,
    displayValue: node.displayValue,
    detail: node.detail,
    available: node.available !== false && node.value !== null,
    status: node.status,
    colorIndex: node.colorIndex ?? index,
    lane: node.lane ?? "snapshot"
  }));
  const renderItem: CustomSeriesRenderItem = (params, api) => {
    const index = params.dataIndex;
    const node = nodes[index];
    if (!node) return undefined;
    const width = api.getWidth();
    const height = api.getHeight();
    const viewport = { width, height, paddingX: 18, paddingTop: 18, paddingBottom: 22 };
    const positions = nodePositions(layout, nodes, width);
    const point = positions[index];
    if (!point) return undefined;
    const projected = projectSpatialPoint(point, viewport);
    const floorPoint = projectSpatialPoint({ ...point, y: 0 }, viewport);
    const scaleNodeCount = layout === "constellation"
      ? new Set(nodes.map((entry) => entry.metricKey ?? entry.key)).size
      : nodes.length;
    const maximumRadius = Math.max(16, Math.min(34, width / Math.max(10, scaleNodeCount * 1.8)));
    const radius = node.value === null ? 7 : countOrbRadius(node.value, domainMaximum, maximumRadius, 6);
    const available = node.available !== false && node.value !== null;
    const color = available ? colorFor(theme, { status: node.status, colorIndex: node.colorIndex ?? index }) : theme.status.neutral;
    const id = spatialSemanticId(sceneId, node.metricKey ?? node.key, node.lane ?? "snapshot", node.key);
    const depthOrder = sortSpatialFarToNear(
      nodes.map((entry, entryIndex) => ({
        id: spatialSemanticId(sceneId, entry.metricKey ?? entry.key, entry.lane ?? "snapshot", entry.key),
        point: positions[entryIndex]
      })),
      viewport
    );
    const paintOrder = depthOrder.findIndex((entry) => entry.id === id);
    const isPairedConstellation = layout === "constellation" && nodes.some((entry) => entry.lane === "previous");
    const metricIndex = [...new Set(nodes.map((entry) => entry.metricKey ?? entry.key))]
      .indexOf(node.metricKey ?? node.key);
    const pairPoints = isPairedConstellation
      ? nodes.flatMap((entry, entryIndex) => (entry.metricKey ?? entry.key) === (node.metricKey ?? node.key)
        ? [projectSpatialPoint(positions[entryIndex], viewport)]
        : [])
      : [];
    const labelPoint = pairPoints.length > 0
      ? {
          x: pairPoints.reduce((sum, entry) => sum + entry.x, 0) / pairPoints.length,
          y: pairPoints.reduce((sum, entry) => sum + entry.y, 0) / pairPoints.length
        }
      : projected;
    const showLabel = !isPairedConstellation || node.lane === "current";
    const metricLabel = isPairedConstellation
      ? node.label.replace(/\s*·\s*(Current|Previous)$/i, "")
      : node.label;
    const children: Array<Record<string, unknown>> = index === 0
      ? floorChildren(width, height, palette, sceneId)
      : [];

    const connectorIndex = node.fromKey === null
      ? -1
      : node.fromKey
        ? nodes.findIndex((candidate) => candidate.key === node.fromKey)
        : index - 1;
    if (connect && connectorIndex >= 0 && connectorIndex !== index) {
      const previous = projectSpatialPoint(positions[connectorIndex], viewport);
      children.push({
        type: "bezierCurve",
        id: `${id}--sequence-guide`,
        name: `${id}--sequence-guide`,
        silent: true,
        shape: {
          x1: previous.x, y1: previous.y,
          x2: projected.x, y2: projected.y,
          cpx1: previous.x + (projected.x - previous.x) * 0.42,
          cpy1: previous.y - 14,
          cpx2: previous.x + (projected.x - previous.x) * 0.68,
          cpy2: projected.y + 14
        },
        style: { stroke: palette.line, lineWidth: 1.5, opacity: 0.5, lineDash: [5, 6], fill: "none" },
        transition: ["shape", "style"]
      });
    }

    if (layout === "risk") {
      [1.6, 2.1].forEach((scale, ringIndex) => children.push({
        type: "ellipse",
        id: `${id}--contour-${ringIndex}`,
        name: `${id}--contour-${ringIndex}`,
        silent: true,
        shape: { cx: floorPoint.x, cy: floorPoint.y + 2, rx: radius * scale, ry: radius * scale * 0.33 },
        style: { fill: "none", stroke: color, lineWidth: 1, opacity: 0.22 - ringIndex * 0.06 },
        transition: ["shape", "style"]
      }));
    }

    children.push(
      {
        type: "ellipse",
        id: `${id}--floor-shadow`,
        name: `${id}--floor-shadow`,
        silent: true,
        shape: { cx: floorPoint.x + 4, cy: floorPoint.y + 3, rx: radius * 0.9, ry: Math.max(3, radius * 0.24) },
        style: { fill: color, opacity: available ? 0.17 : 0.06 },
        transition: ["shape", "style"]
      },
      {
        type: "line",
        id: `${id}--tether`,
        name: `${id}--tether`,
        silent: true,
        shape: { x1: floorPoint.x, y1: floorPoint.y, x2: projected.x, y2: projected.y + radius * 0.7 },
        style: { stroke: color, lineWidth: 1, opacity: available ? 0.42 : 0.2, lineDash: available ? undefined : [3, 4] },
        transition: ["shape", "style"]
      },
      {
        type: "circle",
        id: `${id}--halo`,
        name: `${id}--halo`,
        silent: true,
        shape: { cx: projected.x, cy: projected.y, r: radius * 1.32 },
        style: { fill: color, opacity: available && (node.value ?? 0) > 0 ? 0.11 : 0, stroke: color, lineWidth: 1, lineDash: available ? undefined : [4, 4] },
        transition: ["shape", "style"]
      },
      {
        type: "circle",
        id: `${id}--orb`,
        name: `${id}--orb`,
        shape: { cx: projected.x, cy: projected.y, r: radius },
        style: {
          fill: available && (node.value ?? 0) > 0 ? color : palette.field,
          stroke: color,
          lineWidth: available ? 2 : 1.5,
          opacity: available ? 0.94 : 0.62,
          shadowBlur: available ? 18 : 0,
          shadowColor: color,
          shadowOffsetY: 4
        },
        emphasis: { style: { lineWidth: 4, opacity: 1, stroke: palette.gold } },
        transition: ["shape", "style"]
      },
      {
        type: "circle",
        id: `${id}--specular`,
        name: `${id}--specular`,
        silent: true,
        shape: { cx: projected.x - radius * 0.3, cy: projected.y - radius * 0.32, r: Math.max(2, radius * 0.17) },
        style: { fill: palette.text, opacity: available ? 0.7 : 0.2 },
        transition: ["shape", "style"]
      },
      ...(showLabel ? [{
        type: "text",
        id: `${id}--label`,
        name: `${id}--label`,
        silent: true,
        style: {
          x: labelPoint.x,
          y: labelPoint.y + (isPairedConstellation ? maximumRadius + 15 : radius + 14),
          text: metricLabel,
          fill: palette.muted,
          font: api.font({ fontSize: width < 420 ? 9 : 10, fontWeight: 600 }),
          align: "center",
          verticalAlign: "top",
          width: isPairedConstellation
            ? Math.max(64, Math.min(116, width / (width < 620 ? 3.3 : 6.4)))
            : Math.max(72, Math.min(118, width / Math.max(2, nodes.length / 1.7))),
          overflow: "truncate"
        },
        transition: ["style"]
      }] : []),
      {
        type: "text",
        id: `${id}--value`,
        name: `${id}--value`,
        silent: true,
        style: {
          x: projected.x,
          y: projected.y,
          text: node.displayValue,
          fill: palette.text,
          font: api.font({ fontSize: radius > 20 ? 11 : 9, fontWeight: 700 }),
          align: "center",
          verticalAlign: "middle"
        },
        transition: ["style"]
      }
    );
    if (!available) {
      children.push({
        type: "line",
        id: `${id}--unavailable-slash`,
        name: `${id}--unavailable-slash`,
        silent: true,
        shape: { x1: projected.x - radius * 0.62, y1: projected.y + radius * 0.62, x2: projected.x + radius * 0.62, y2: projected.y - radius * 0.62 },
        style: { stroke: palette.muted, lineWidth: 2 },
        transition: ["shape"]
      });
    }
    return {
      type: "group",
      id,
      name: id,
      z2: Math.max(1, paintOrder + 1),
      diffChildrenByName: true,
      $mergeChildren: "byName",
      children
    } as never;
  };

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item", formatter: sceneTooltip },
    series: [{
      id: sceneId,
      name: sceneId,
      type: "custom",
      coordinateSystem: "none",
      renderItem,
      data,
      universalTransition: true,
      emphasis: { focus: "self" }
    }]
  } as DashboardEChartOption;
}

export function createTemporalRibbonSceneOption({
  sceneId,
  labels,
  keys,
  series,
  theme,
  domainMaximum: configuredDomainMaximum
}: {
  sceneId: string;
  labels: string[];
  keys: string[];
  series: SpatialTemporalSeries[];
  theme: Readonly<DashboardChartTheme>;
  domainMaximum?: number;
}): DashboardEChartOption {
  const palette = spatialPalette(theme);
  const domainMaximum = Math.max(
    0,
    configuredDomainMaximum ?? 0,
    ...series.flatMap((entry) => entry.values.flatMap((value) => value === null ? [] : [value]))
  );
  const seriesOptions = series.map((entry, laneIndex) => {
    const laneZ = entry.depth ?? (series.length <= 1 ? 0 : -0.5 + laneIndex / (series.length - 1));
    const renderItem: CustomSeriesRenderItem = (params, api) => {
      const index = params.dataIndex;
      const value = entry.values[index];
      const width = api.getWidth();
      const height = api.getHeight();
      const viewport = { width, height, paddingX: 22, paddingTop: 18, paddingBottom: 28 };
      const x = labels.length <= 1 ? 0 : -0.94 + index / (labels.length - 1) * 1.88;
      const normalizedHeight = value === null ? 0 : linearSpatialValue(value, domainMaximum, 1);
      const point = projectSpatialPoint({ x, y: normalizedHeight, z: laneZ }, viewport);
      const floor = projectSpatialPoint({ x, y: 0, z: laneZ }, viewport);
      const color = theme.series[(entry.colorIndex ?? laneIndex) % theme.series.length];
      const id = spatialSemanticId(sceneId, entry.key, "lane", keys[index] ?? index);
      const children: Array<Record<string, unknown>> = laneIndex === 0 && index === 0
        ? floorChildren(width, height, palette, sceneId)
        : [];

      if (value !== null && index > 0 && entry.values[index - 1] !== null) {
        const previousX = labels.length <= 1 ? 0 : -0.94 + (index - 1) / (labels.length - 1) * 1.88;
        const previousHeight = linearSpatialValue(entry.values[index - 1]!, domainMaximum, 1);
        const previous = projectSpatialPoint({ x: previousX, y: previousHeight, z: laneZ }, viewport);
        const previousBack = projectSpatialPoint({ x: previousX, y: previousHeight, z: laneZ + 0.16 }, viewport);
        const currentBack = projectSpatialPoint({ x, y: normalizedHeight, z: laneZ + 0.16 }, viewport);
        children.push(
          {
            type: "polygon",
            id: `${id}--facet-side`,
            name: `${id}--facet-side`,
            silent: true,
            shape: { points: [[previous.x, previous.y], [point.x, point.y], [currentBack.x, currentBack.y + 7], [previousBack.x, previousBack.y + 7]] },
            style: { fill: color, opacity: 0.22, stroke: color, lineWidth: 0.7 },
            transition: ["shape", "style"]
          },
          {
            type: "polygon",
            id: `${id}--facet-top`,
            name: `${id}--facet-top`,
            shape: { points: [[previous.x, previous.y], [point.x, point.y], [currentBack.x, currentBack.y], [previousBack.x, previousBack.y]] },
            style: { fill: color, opacity: laneIndex === 0 ? 0.66 : 0.46, stroke: color, lineWidth: 1.1, shadowBlur: 10, shadowColor: color },
            emphasis: { style: { opacity: 0.92, lineWidth: 2.5, stroke: palette.gold } },
            transition: ["shape", "style"]
          }
        );
      }

      if (value === null) {
        children.push(
          {
            type: "circle",
            id: `${id}--gap-anchor`,
            name: `${id}--gap-anchor`,
            shape: { cx: floor.x, cy: floor.y, r: 4.5 },
            style: { fill: palette.field, stroke: palette.muted, lineWidth: 1, lineDash: [2, 2], opacity: 0.7 },
            transition: ["shape", "style"]
          },
          {
            type: "line",
            id: `${id}--gap-slash`,
            name: `${id}--gap-slash`,
            silent: true,
            shape: { x1: floor.x - 4, y1: floor.y + 4, x2: floor.x + 4, y2: floor.y - 4 },
            style: { stroke: palette.muted, lineWidth: 1 },
            transition: ["shape"]
          }
        );
      } else {
        children.push(
          {
            type: "line",
            id: `${id}--height-guide`,
            name: `${id}--height-guide`,
            silent: true,
            shape: { x1: floor.x, y1: floor.y, x2: point.x, y2: point.y },
            style: { stroke: color, lineWidth: 1, opacity: 0.22, lineDash: [3, 5] },
            transition: ["shape", "style"]
          },
          {
            type: "circle",
            id: `${id}--vertex`,
            name: `${id}--vertex`,
            shape: { cx: point.x, cy: point.y, r: labels.length <= 14 ? 4.5 : 3 },
            style: { fill: palette.field, stroke: color, lineWidth: 2, shadowBlur: 9, shadowColor: color },
            emphasis: { style: { stroke: palette.gold, lineWidth: 4 } },
            transition: ["shape", "style"]
          }
        );
      }

      if (laneIndex === 0 && (index === 0 || index === labels.length - 1 || (labels.length <= 14 && index % Math.max(1, Math.ceil(labels.length / 6)) === 0))) {
        children.push({
          type: "text",
          id: `${id}--date`,
          name: `${id}--date`,
          silent: true,
          style: { x: floor.x, y: floor.y + 10, text: labels[index], fill: palette.muted, font: api.font({ fontSize: 9, fontWeight: 500 }), align: "center", verticalAlign: "top" },
          transition: ["style"]
        });
      }
      return {
        type: "group",
        id,
        name: id,
        diffChildrenByName: true,
        $mergeChildren: "byName",
        children
      } as never;
    };
    return {
      id: entry.key,
      name: entry.label,
      type: "custom" as const,
      coordinateSystem: "none" as const,
      renderItem,
      universalTransition: true,
      data: entry.values.map((value, index) => ({
        id: spatialSemanticId(sceneId, entry.key, "lane", keys[index] ?? index, "facet"),
        name: keys[index] ?? String(index),
        groupId: keys[index] ?? String(index),
        value: [value ?? 0, index, laneIndex],
        rawValue: value,
        label: labels[index],
        displayValue: entry.displayValues[index] ?? (value === null ? "Not available" : String(value)),
        detail: entry.label,
        available: value !== null
      }))
    };
  });
  return {
    tooltip: { trigger: "item", formatter: sceneTooltip },
    series: seriesOptions
  } as DashboardEChartOption;
}

export function createCapitalFlowSceneOption({
  sceneId,
  flows,
  theme
}: {
  sceneId: string;
  flows: SpatialFlowDatum[];
  theme: Readonly<DashboardChartTheme>;
}): DashboardEChartOption {
  const palette = spatialPalette(theme);
  const maximumAbsolute = Math.max(0, ...flows.flatMap((flow) =>
    flow.fromKey && flow.kind !== "context" ? [Math.abs(flow.value)] : []
  ));
  const runningValues = flows.map((flow) => flow.runningTotal ?? flow.value);
  const maximumRunning = Math.max(1, ...runningValues.map((value) => Math.abs(value)));
  const data = flows.map((flow, index) => ({
    id: spatialSemanticId(sceneId, flow.metricKey ?? flow.key, "current", flow.key, "flow"),
    name: flow.key,
    groupId: flow.metricKey ?? flow.key,
    value: [flow.value, flow.runningTotal ?? flow.value, index],
    label: flow.label,
    displayValue: flow.displayValue,
    detail: flow.runningDisplayValue ? `Result ${flow.runningDisplayValue}` : undefined,
    kind: flow.kind ?? "allocation"
  }));
  const renderItem: CustomSeriesRenderItem = (params, api) => {
    const index = params.dataIndex;
    const flow = flows[index];
    if (!flow) return undefined;
    const width = api.getWidth();
    const height = api.getHeight();
    const count = flows.length;
    const viewport = { width, height, paddingX: 30, paddingTop: 26, paddingBottom: 28 };
    const x = flow.point?.x ?? (count <= 1 ? 0 : -0.9 + index / (count - 1) * 1.8);
    const signedRunning = flow.runningTotal ?? flow.value;
    const y = flow.point?.y ?? (0.34 + Math.min(0.58, Math.abs(signedRunning) / maximumRunning * 0.5) * (signedRunning < 0 ? -1 : 1));
    const z = flow.point?.z ?? (-0.52 + (index % 3) * 0.36);
    const point = projectSpatialPoint({ x, y, z }, viewport);
    const floor = projectSpatialPoint({ x, y: 0, z }, viewport);
    const scaled = signedFlowScale(flow.value, maximumAbsolute, Math.max(12, Math.min(32, width / 18)), 2);
    const isContext = flow.kind === "context";
    const color = isContext
      ? palette.line
      : scaled.direction < 0
        ? theme.status.serious
        : flow.kind === "outcome"
          ? (signedRunning < 0 ? theme.status.critical : theme.status.good)
          : theme.series[index % theme.series.length];
    const id = spatialSemanticId(sceneId, flow.metricKey ?? flow.key, "current", flow.key);
    const children: Array<Record<string, unknown>> = index === 0
      ? floorChildren(width, height, palette, sceneId)
      : [];
    const previousIndex = flow.fromKey === null
      ? -1
      : flow.fromKey
      ? flows.findIndex((candidate) => candidate.key === flow.fromKey)
      : index - 1;
    if (previousIndex >= 0 && previousIndex !== index && (isContext || scaled.direction !== 0)) {
      const previousFlow = flows[previousIndex];
      const previousX = previousFlow.point?.x ?? (-0.9 + previousIndex / Math.max(1, count - 1) * 1.8);
      const previousRunning = previousFlow.runningTotal ?? previousFlow.value;
      const previousY = previousFlow.point?.y ?? (0.34 + Math.min(0.58, Math.abs(previousRunning) / maximumRunning * 0.5) * (previousRunning < 0 ? -1 : 1));
      const previousZ = previousFlow.point?.z ?? (-0.52 + (previousIndex % 3) * 0.36);
      const previous = projectSpatialPoint({ x: previousX, y: previousY, z: previousZ }, viewport);
      const polygon = createFlowRibbonPolygon(previous, point, isContext ? 2 : scaled.width, scaled.direction);
      children.push({
        type: "polygon",
        id: `${id}--ribbon`,
        name: `${id}--ribbon`,
        shape: { points: asPoints(polygon) },
        style: {
          fill: color,
          stroke: color,
          lineWidth: 1,
          opacity: isContext ? 0.32 : 0.64,
          lineDash: isContext ? [4, 5] : undefined,
          shadowBlur: isContext ? 0 : 12,
          shadowColor: color
        },
        emphasis: { style: { opacity: 0.9, stroke: palette.gold, lineWidth: 2 } },
        transition: ["shape", "style"]
      });
    }
    children.push(
      {
        type: "line",
        id: `${id}--tether`,
        name: `${id}--tether`,
        silent: true,
        shape: { x1: floor.x, y1: floor.y, x2: point.x, y2: point.y },
        style: { stroke: color, lineWidth: 1, opacity: 0.25, lineDash: [3, 5] },
        transition: ["shape", "style"]
      },
      {
        type: "circle",
        id: `${id}--node`,
        name: `${id}--node`,
        shape: { cx: point.x, cy: point.y, r: isContext ? 8 : 11 },
        style: { fill: palette.field, stroke: color, lineWidth: isContext ? 1.5 : 3, shadowBlur: isContext ? 0 : 12, shadowColor: color },
        emphasis: { style: { stroke: palette.gold, lineWidth: 4 } },
        transition: ["shape", "style"]
      },
      {
        type: "text",
        id: `${id}--label`,
        name: `${id}--label`,
        silent: true,
        style: { x: point.x, y: point.y + 17, text: flow.label, fill: palette.muted, font: api.font({ fontSize: 9, fontWeight: 600 }), align: "center", verticalAlign: "top", width: 92, overflow: "truncate" },
        transition: ["style"]
      },
      {
        type: "text",
        id: `${id}--value`,
        name: `${id}--value`,
        silent: true,
        style: { x: point.x, y: point.y - 18, text: flow.displayValue, fill: palette.text, font: api.font({ fontSize: 10, fontWeight: 700 }), align: "center", verticalAlign: "bottom" },
        transition: ["style"]
      }
    );
    return { type: "group", id, name: id, diffChildrenByName: true, $mergeChildren: "byName", children } as never;
  };
  return {
    tooltip: { trigger: "item", formatter: sceneTooltip },
    series: [{
      id: sceneId,
      name: sceneId,
      type: "custom",
      coordinateSystem: "none",
      renderItem,
      data,
      universalTransition: true,
      emphasis: { focus: "self" }
    }]
  } as DashboardEChartOption;
}

export function createRatioPathSceneOption({
  sceneId,
  label,
  share,
  displayValue,
  detail,
  status,
  theme
}: {
  sceneId: string;
  label: string;
  share: number | null;
  displayValue: string;
  detail?: string;
  status: SpatialStatus;
  theme: Readonly<DashboardChartTheme>;
}): DashboardEChartOption {
  const palette = spatialPalette(theme);
  const available = share !== null;
  const position = Math.max(-0.2, Math.min(1.2, share ?? 0));
  const data = [{
    id: spatialSemanticId(sceneId, "ratio", "current", "checkpoint", "orb"),
    name: "checkpoint",
    groupId: "ratio",
    value: [share ?? 0, position],
    label,
    displayValue,
    detail,
    available
  }];
  const renderItem: CustomSeriesRenderItem = (_params, api) => {
    const width = api.getWidth();
    const height = api.getHeight();
    const viewport = { width, height, paddingX: 30, paddingTop: 20, paddingBottom: 20 };
    const start = projectSpatialPoint({ x: -0.88, y: 0.15, z: -0.45 }, viewport);
    const target = projectSpatialPoint({ x: 0.76, y: 0.62, z: 0.5 }, viewport);
    const checkpoint = projectSpatialPoint({
      x: -0.88 + position * 1.64,
      y: 0.15 + position * 0.47,
      z: -0.45 + position * 0.95
    }, viewport);
    const color = available ? theme.status[status] : theme.status.neutral;
    const id = spatialSemanticId(sceneId, "ratio", "current", "checkpoint");
    const track = createFlowRibbonPolygon(start, target, 4, 1, 16);
    const lit = createFlowRibbonPolygon(start, checkpoint, 8, 1, 12);
    return {
      type: "group",
      id,
      name: id,
      diffChildrenByName: true,
      $mergeChildren: "byName",
      children: [
        ...floorChildren(width, height, palette, sceneId),
        { type: "polygon", id: `${id}--track`, name: `${id}--track`, silent: true, shape: { points: asPoints(track) }, style: { fill: palette.line, opacity: 0.25 }, transition: ["shape", "style"] },
        { type: "polygon", id: `${id}--lit-path`, name: `${id}--lit-path`, shape: { points: asPoints(lit) }, style: { fill: color, opacity: available ? 0.72 : 0.16, shadowBlur: available ? 10 : 0, shadowColor: color }, emphasis: { style: { fill: palette.gold, opacity: 0.9 } }, transition: ["shape", "style"] },
        { type: "circle", id: `${id}--origin`, name: `${id}--origin`, silent: true, shape: { cx: start.x, cy: start.y, r: 5 }, style: { fill: palette.field, stroke: palette.line, lineWidth: 2 }, transition: ["shape", "style"] },
        { type: "circle", id: `${id}--target`, name: `${id}--target`, silent: true, shape: { cx: target.x, cy: target.y, r: 7 }, style: { fill: palette.field, stroke: palette.gold, lineWidth: 2 }, transition: ["shape", "style"] },
        { type: "circle", id: `${id}--checkpoint`, name: `${id}--checkpoint`, shape: { cx: checkpoint.x, cy: checkpoint.y, r: 12 }, style: { fill: palette.field, stroke: color, lineWidth: 3, shadowBlur: available ? 16 : 0, shadowColor: color }, emphasis: { style: { stroke: palette.gold, lineWidth: 5 } }, transition: ["shape", "style"] },
        { type: "text", id: `${id}--zero-label`, name: `${id}--zero-label`, silent: true, style: { x: start.x, y: start.y + 12, text: "0", fill: palette.muted, font: api.font({ fontSize: 9, fontWeight: 500 }), align: "center", verticalAlign: "top" } },
        { type: "text", id: `${id}--target-label`, name: `${id}--target-label`, silent: true, style: { x: target.x, y: target.y + 13, text: "100%", fill: palette.muted, font: api.font({ fontSize: 9, fontWeight: 500 }), align: "center", verticalAlign: "top" } },
        { type: "text", id: `${id}--value`, name: `${id}--value`, silent: true, style: { x: checkpoint.x, y: checkpoint.y - 18, text: displayValue, fill: palette.text, font: api.font({ fontSize: 12, fontWeight: 700 }), align: "center", verticalAlign: "bottom" }, transition: ["style"] }
      ]
    } as never;
  };
  return {
    tooltip: { trigger: "item", formatter: sceneTooltip },
    series: [{ id: sceneId, name: label, type: "custom", coordinateSystem: "none", renderItem, data, universalTransition: true }]
  } as DashboardEChartOption;
}

export const topLevelSeriesAreSpatial = (option: DashboardEChartOption) => {
  const series = (option as { series?: unknown }).series;
  const entries = Array.isArray(series) ? series : series ? [series] : [];
  return entries.every((entry) => typeof entry === "object" && entry !== null && (entry as { type?: unknown }).type === "custom");
};
