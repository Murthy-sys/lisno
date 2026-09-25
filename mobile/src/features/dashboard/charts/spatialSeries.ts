import type { CustomSeriesOption } from "echarts/charts";
import type { CustomSeriesRenderItem } from "echarts";

import {
  countOrbRadius,
  projectSpatialPoint,
  sortSpatialFarToNear,
  spatialId,
  type SpatialPoint
} from "./geometry";
import { dashboardChartPalette } from "./theme";
import type { DashboardChartTone } from "./types";
import { chartToneColor } from "./theme";

export interface SpatialOrbDatum {
  readonly id: string;
  readonly metricKey: string;
  readonly label: string;
  readonly shortLabel?: string;
  readonly displayValue: string;
  readonly value: number | null;
  readonly available: boolean;
  readonly point: SpatialPoint;
  readonly lane: string;
  readonly tone?: DashboardChartTone | undefined;
  readonly selected?: boolean | undefined;
  readonly showLabel?: boolean | undefined;
  readonly severity?: "low" | "medium" | "high" | "unknown" | undefined;
}

export interface SpatialLinkDatum {
  readonly id: string;
  readonly metricKey: string;
  readonly from: SpatialPoint;
  readonly to: SpatialPoint;
  readonly lane: string;
  readonly color?: string;
  readonly width?: number;
  readonly dashed?: boolean;
}

export type SpatialGuideVariant =
  | "constellation"
  | "temporal"
  | "orbit"
  | "corridor"
  | "flow"
  | "topology"
  | "risk";

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function maximumAvailableValue(items: readonly SpatialOrbDatum[]): number {
  return Math.max(
    1,
    ...items.map((item) =>
      item.available && item.value !== null && Number.isFinite(item.value)
        ? Math.max(0, item.value)
        : 0
    )
  );
}

function orbColor(item: SpatialOrbDatum): string {
  if (!item.available) return dashboardChartPalette.riskGray;
  if (item.severity === "high") return dashboardChartPalette.riskRed;
  if (item.severity === "medium") return dashboardChartPalette.riskYellow;
  if (item.severity === "low") return dashboardChartPalette.riskGreen;
  return chartToneColor(item.tone);
}

function orbDataItem(sceneId: string, item: SpatialOrbDatum, domainMaximum: number) {
  return {
    id: spatialId(sceneId, item.metricKey, item.lane, item.id, "datum"),
    name: item.metricKey,
    groupId: spatialId(sceneId, item.metricKey, item.lane, item.id, "group"),
    value: [
      item.point.x,
      item.point.y,
      item.point.z,
      item.value ?? 0,
      item.available ? 1 : 0,
      item.selected ? 1 : 0,
      domainMaximum
    ]
  };
}

export interface SpatialOrbSeriesInput {
  readonly sceneId: string;
  readonly seriesId: string;
  readonly name: string;
  readonly data: readonly SpatialOrbDatum[];
  readonly reducedMotion: boolean;
  readonly maximumRadius?: number;
  readonly opacity?: number;
  readonly domainMaximum?: number;
}

export function createSpatialOrbSeries({
  sceneId,
  seriesId,
  name,
  data,
  reducedMotion,
  maximumRadius = 24,
  opacity = 1,
  domainMaximum: requestedDomainMaximum
}: SpatialOrbSeriesInput): CustomSeriesOption {
  const domainMaximum = Math.max(
    maximumAvailableValue(data),
    requestedDomainMaximum ?? 1
  );
  const ordered = sortSpatialFarToNear(data);
  const renderItem: CustomSeriesRenderItem = (params, api) => {
    const index = finite(params.dataIndexInside, finite(params.dataIndex));
    const item = ordered[index];
    if (!item) return null;
    const viewport = { width: api.getWidth(), height: api.getHeight() };
    const center = projectSpatialPoint(item.point, viewport);
    const floor = projectSpatialPoint({ ...item.point, y: 0 }, viewport);
    const radius = countOrbRadius(
      item.value,
      item.available,
      domainMaximum,
      { maximumRadius }
    );
    const color = orbColor(item);
    const selected = item.selected === true;
    const valueIsZero = item.available && item.value === 0;
    const rootId = spatialId(sceneId, item.metricKey, item.lane, item.id, "root");
    const labelOnLeft = item.point.x > 0.45;
    const labelGap = selected ? 16 : 9;
    const labelX = center.x + (labelOnLeft ? -radius - labelGap : radius + labelGap);
    const labelAlign = labelOnLeft ? "right" : "left";
    const childTransition = reducedMotion
      ? {}
      : { transition: ["shape", "style"] as ("shape" | "style")[] };

    const children: Record<string, unknown>[] = [
      {
        type: "line",
        id: spatialId(sceneId, item.metricKey, item.lane, item.id, "tether"),
        name: "tether",
        silent: true,
        shape: { x1: floor.x, y1: floor.y, x2: center.x, y2: center.y },
        style: {
          stroke: item.available ? color : dashboardChartPalette.riskGray,
          lineWidth: selected ? 1.4 : 0.7,
          opacity: item.available ? 0.32 : 0.18,
          lineDash: item.available ? undefined : [3, 4]
        },
        ...childTransition
      },
      {
        type: "ellipse",
        id: spatialId(sceneId, item.metricKey, item.lane, item.id, "shadow"),
        name: "shadow",
        silent: true,
        shape: {
          cx: floor.x + 3,
          cy: floor.y + 4,
          rx: Math.max(5, radius * 0.88),
          ry: Math.max(2, radius * 0.24)
        },
        style: { fill: "rgba(2,2,10,0.42)", opacity: item.available ? 0.8 : 0.32 },
        ...childTransition
      }
    ];

    if (selected) {
      children.push(
        {
          type: "ellipse",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "focus-outer"),
          name: "focus-outer",
          silent: true,
          shape: { cx: center.x, cy: center.y, rx: radius + 10, ry: radius + 7 },
          style: {
            fill: "transparent",
            stroke: dashboardChartPalette.selected,
            lineWidth: 1.2,
            lineDash: [4, 4],
            opacity: 0.88
          },
          ...childTransition
        },
        {
          type: "ellipse",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "focus-inner"),
          name: "focus-inner",
          silent: true,
          shape: { cx: center.x, cy: center.y, rx: radius + 5, ry: radius + 3 },
          style: {
            fill: "transparent",
            stroke: "rgba(242,201,76,0.34)",
            lineWidth: 3
          },
          ...childTransition
        }
      );
    }

    if (!item.available) {
      children.push(
        {
          type: "circle",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "unavailable-anchor"),
          name: "unavailable-anchor",
          shape: { cx: center.x, cy: center.y, r: radius },
          style: {
            fill: "rgba(116,112,135,0.09)",
            stroke: dashboardChartPalette.riskGray,
            lineWidth: 1.2,
            lineDash: [4, 3],
            opacity: 0.86
          },
          ...childTransition
        },
        {
          type: "line",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "unavailable-slash"),
          name: "unavailable-slash",
          shape: {
            x1: center.x - radius * 0.45,
            y1: center.y + radius * 0.45,
            x2: center.x + radius * 0.45,
            y2: center.y - radius * 0.45
          },
          style: { stroke: dashboardChartPalette.riskGray, lineWidth: 1.2 },
          ...childTransition
        }
      );
    } else if (valueIsZero) {
      children.push(
        {
          type: "circle",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "zero-anchor"),
          name: "zero-anchor",
          shape: { cx: center.x, cy: center.y, r: radius },
          style: {
            fill: "rgba(255,255,255,0.015)",
            stroke: color,
            lineWidth: selected ? 2 : 1.3,
            opacity
          },
          ...childTransition
        },
        {
          type: "circle",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "zero-core"),
          name: "zero-core",
          shape: { cx: center.x, cy: center.y, r: 1.5 },
          style: { fill: color, opacity },
          ...childTransition
        }
      );
    } else {
      children.push(
        {
          type: "circle",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "halo"),
          name: "halo",
          silent: true,
          shape: { cx: center.x, cy: center.y, r: radius + 5 },
          style: {
            fill: "transparent",
            stroke: color,
            lineWidth: 4,
            opacity: selected ? 0.24 : 0.11,
            shadowBlur: selected ? 16 : 7,
            shadowColor: color
          },
          ...childTransition
        },
        {
          type: "circle",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "orb"),
          name: "orb",
          shape: { cx: center.x, cy: center.y, r: radius },
          style: {
            fill: {
              type: "radial",
              x: 0.32,
              y: 0.25,
              r: 0.78,
              colorStops: [
                { offset: 0, color: "rgba(255,255,255,0.96)" },
                { offset: 0.12, color },
                { offset: 0.72, color },
                { offset: 1, color: "rgba(15,11,35,0.98)" }
              ]
            },
            stroke: selected ? dashboardChartPalette.selected : "rgba(247,244,255,0.44)",
            lineWidth: selected ? 1.8 : 0.8,
            opacity: opacity * (item.point.z < 0 ? 0.78 : 0.98),
            shadowBlur: selected ? 14 : 5,
            shadowColor: color
          },
          // react-native-svg cannot construct a radial gradient while its
          // owning circle has a zero radius. Fade the authored sphere in and
          // animate later geometry updates, but never collapse it through r=0.
          ...(reducedMotion
            ? {}
            : {
                enterFrom: { style: { opacity: 0 } },
                transition: ["shape", "style"] as ("shape" | "style")[]
              })
        },
        {
          type: "circle",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "specular"),
          name: "specular",
          silent: true,
          shape: {
            cx: center.x - radius * 0.3,
            cy: center.y - radius * 0.34,
            r: Math.max(1.2, radius * 0.12)
          },
          style: { fill: "rgba(255,255,255,0.72)", opacity: 0.8 },
          ...childTransition
        }
      );
    }

    if (item.showLabel !== false) {
      children.push(
        {
          type: "text",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "label"),
          name: "label",
          silent: true,
          style: {
            x: labelX,
            y: center.y - 6,
            text: item.shortLabel ?? item.label,
            fill: dashboardChartPalette.ink,
            font: "600 9px Poppins",
            textAlign: labelAlign,
            textVerticalAlign: "middle"
          },
          ...childTransition
        },
        {
          type: "text",
          id: spatialId(sceneId, item.metricKey, item.lane, item.id, "value"),
          name: "value",
          silent: true,
          style: {
            x: labelX,
            y: center.y + 8,
            text: item.available ? item.displayValue : "Unavailable",
            fill: item.available ? color : dashboardChartPalette.riskGray,
            font: "500 9px Poppins",
            textAlign: labelAlign,
            textVerticalAlign: "middle"
          },
          ...childTransition
        }
      );
    }

    return {
      type: "group",
      id: rootId,
      name: item.metricKey,
      diffChildrenByName: true,
      $mergeChildren: "byName",
      children
    } as unknown as ReturnType<CustomSeriesRenderItem>;
  };

  return {
    id: seriesId,
    name,
    type: "custom",
    z: 2,
    zlevel: 0,
    coordinateSystem: "none",
    renderItem,
    data: ordered.map((item) => orbDataItem(sceneId, item, domainMaximum)),
    silent: false,
    universalTransition: reducedMotion
      ? false
      : { enabled: true, divideShape: "clone" },
    animationDelay: reducedMotion
      ? 0
      : (index: number) => Math.min(70 + index * 38, 300),
    animationDelayUpdate: reducedMotion
      ? 0
      : (index: number) => Math.min(index * 18, 120)
  };
}

export interface SpatialLinkSeriesInput {
  readonly sceneId: string;
  readonly seriesId: string;
  readonly name: string;
  readonly data: readonly SpatialLinkDatum[];
  readonly reducedMotion: boolean;
}

export function createSpatialLinkSeries({
  sceneId,
  seriesId,
  name,
  data,
  reducedMotion
}: SpatialLinkSeriesInput): CustomSeriesOption {
  const renderItem: CustomSeriesRenderItem = (params, api) => {
    const item = data[finite(params.dataIndexInside, finite(params.dataIndex))];
    if (!item) return null;
    const viewport = { width: api.getWidth(), height: api.getHeight() };
    const from = projectSpatialPoint(item.from, viewport);
    const to = projectSpatialPoint(item.to, viewport);
    const bend = Math.max(10, Math.abs(to.x - from.x) * 0.18);
    const lift = Math.min(from.y, to.y) - bend;
    const color = item.color ?? "rgba(181,169,255,0.52)";
    const id = spatialId(sceneId, item.metricKey, item.lane, item.id, "link");
    const transition = reducedMotion
      ? {}
      : { transition: ["shape", "style"] as ("shape" | "style")[] };
    return {
      type: "group",
      id,
      name: item.metricKey,
      diffChildrenByName: true,
      $mergeChildren: "byName",
      children: [
        {
          type: "bezierCurve",
          id: `${id}:shadow`,
          name: "shadow",
          silent: true,
          shape: {
            x1: from.x,
            y1: from.y + 3,
            x2: to.x,
            y2: to.y + 3,
            cpx1: (from.x + to.x) / 2,
            cpy1: lift + 3
          },
          style: {
            stroke: "rgba(2,2,10,0.46)",
            lineWidth: (item.width ?? 1.2) + 3,
            fill: "transparent"
          },
          ...transition
        },
        {
          type: "bezierCurve",
          id: `${id}:signal`,
          name: "signal",
          shape: {
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            cpx1: (from.x + to.x) / 2,
            cpy1: lift
          },
          style: {
            stroke: color,
            lineWidth: item.width ?? 1.2,
            lineDash: item.dashed ? [5, 5] : undefined,
            lineCap: "round",
            fill: "transparent",
            opacity: 0.78
          },
          ...transition
        }
      ]
    } as unknown as ReturnType<CustomSeriesRenderItem>;
  };

  return {
    id: seriesId,
    name,
    type: "custom",
    z: 1,
    zlevel: 0,
    coordinateSystem: "none",
    renderItem,
    data: data.map((item) => ({
      id: spatialId(sceneId, item.metricKey, item.lane, item.id, "datum"),
      name: item.metricKey,
      value: [
        item.from.x,
        item.from.y,
        item.from.z,
        item.to.x,
        item.to.y,
        item.to.z
      ]
    })),
    silent: true,
    universalTransition: reducedMotion
      ? false
      : { enabled: true, divideShape: "clone" }
  };
}

export interface SpatialGuideSeriesInput {
  readonly sceneId: string;
  readonly seriesId: string;
  readonly variant: SpatialGuideVariant;
  readonly reducedMotion: boolean;
  readonly accent?: string;
}

export function createSpatialGuideSeries({
  sceneId,
  seriesId,
  variant,
  reducedMotion,
  accent = dashboardChartPalette.current
}: SpatialGuideSeriesInput): CustomSeriesOption {
  const renderItem: CustomSeriesRenderItem = (_params, api) => {
    const viewport = { width: api.getWidth(), height: api.getHeight() };
    const backLeft = projectSpatialPoint({ x: -1, y: 0, z: -0.72 }, viewport);
    const backRight = projectSpatialPoint({ x: 1, y: 0, z: -0.72 }, viewport);
    const frontRight = projectSpatialPoint({ x: 1, y: 0, z: 0.72 }, viewport);
    const frontLeft = projectSpatialPoint({ x: -1, y: 0, z: 0.72 }, viewport);
    const transition = reducedMotion
      ? {}
      : { transition: ["shape", "style"] as ("shape" | "style")[] };
    const root = spatialId(sceneId, "orientation", "base", variant, "root");
    const children: Record<string, unknown>[] = [
      {
        type: "polygon",
        id: `${root}:plane`,
        name: "plane",
        silent: true,
        shape: {
          points: [
            [backLeft.x, backLeft.y],
            [backRight.x, backRight.y],
            [frontRight.x, frontRight.y],
            [frontLeft.x, frontLeft.y]
          ]
        },
        style: {
          fill: "rgba(74,59,143,0.085)",
          stroke: "rgba(181,169,255,0.13)",
          lineWidth: 0.8
        },
        ...transition
      }
    ];
    [-0.66, -0.22, 0.22, 0.66].forEach((x, index) => {
      const far = projectSpatialPoint({ x, y: 0, z: -0.72 }, viewport);
      const near = projectSpatialPoint({ x, y: 0, z: 0.72 }, viewport);
      children.push({
        type: "line",
        id: `${root}:longitude:${index}`,
        name: `longitude-${index}`,
        silent: true,
        shape: { x1: far.x, y1: far.y, x2: near.x, y2: near.y },
        style: { stroke: "rgba(181,169,255,0.12)", lineWidth: 0.7 },
        ...transition
      });
    });
    [-0.42, 0, 0.42].forEach((z, index) => {
      const left = projectSpatialPoint({ x: -1, y: 0, z }, viewport);
      const right = projectSpatialPoint({ x: 1, y: 0, z }, viewport);
      children.push({
        type: "line",
        id: `${root}:latitude:${index}`,
        name: `latitude-${index}`,
        silent: true,
        shape: { x1: left.x, y1: left.y, x2: right.x, y2: right.y },
        style: { stroke: "rgba(181,169,255,0.095)", lineWidth: 0.7 },
        ...transition
      });
    });
    if (variant === "constellation" || variant === "orbit" || variant === "risk") {
      const center = projectSpatialPoint({ x: 0, y: 0.36, z: 0 }, viewport);
      children.push(
        {
          type: "ellipse",
          id: `${root}:orbit-outer`,
          name: "orbit-outer",
          silent: true,
          shape: {
            cx: center.x,
            cy: center.y,
            rx: viewport.width * 0.34,
            ry: viewport.height * (variant === "risk" ? 0.23 : 0.18)
          },
          style: {
            fill: "transparent",
            stroke: "rgba(181,169,255,0.19)",
            lineWidth: 0.9,
            lineDash: [5, 6]
          },
          ...transition
        },
        {
          type: "ellipse",
          id: `${root}:orbit-inner`,
          name: "orbit-inner",
          silent: true,
          shape: {
            cx: center.x,
            cy: center.y,
            rx: viewport.width * 0.19,
            ry: viewport.height * 0.1
          },
          style: {
            fill: "transparent",
            stroke: accent,
            lineWidth: 0.8,
            opacity: 0.24
          },
          ...transition
        }
      );
    }
    return {
      type: "group",
      id: root,
      name: "orientation",
      diffChildrenByName: true,
      $mergeChildren: "byName",
      children
    } as unknown as ReturnType<CustomSeriesRenderItem>;
  };

  return {
    id: seriesId,
    name: `${variant} orientation`,
    type: "custom",
    z: 0,
    zlevel: 0,
    coordinateSystem: "none",
    renderItem,
    data: [
      {
        id: spatialId(sceneId, "orientation", "base", variant, "datum"),
        name: `${sceneId}:orientation`,
        value: [0]
      }
    ],
    silent: true,
    universalTransition: reducedMotion
      ? false
      : { enabled: true, divideShape: "clone" }
  };
}

export function spatialBaseOption(reducedMotion: boolean) {
  return {
    backgroundColor: dashboardChartPalette.background,
    tooltip: { show: false },
    animation: !reducedMotion
  } as const;
}
