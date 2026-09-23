import type { CustomSeriesOption } from "echarts/charts";
import type { CustomSeriesRenderItem } from "echarts";

import {
  projectSpatialPoint,
  spatialId,
  temporalHeight,
  type SpatialPoint
} from "./geometry";
import { dashboardMotionOption } from "./motion";
import { createSpatialGuideSeries } from "./spatialSeries";
import { dashboardChartPalette } from "./theme";
import type { DashboardChartOption, TrendDatum } from "./types";

const TREND_SCENE_ID = "temporal-ribbon-field";

export const TREND_SERIES_IDS = Object.freeze({
  guide: "temporal-ribbon-guide",
  current: "temporal-ribbon-current",
  previous: "temporal-ribbon-previous"
});

export interface TrendOptionInput {
  readonly metricId: string;
  readonly metricLabel: string;
  readonly points: readonly TrendDatum[];
  readonly showPrevious: boolean;
  readonly reducedMotion: boolean;
  readonly selectedDayIndex?: number | undefined;
}

export interface TemporalFacet {
  readonly id: string;
  readonly metricKey: string;
  readonly lane: "current" | "previous";
  readonly dayIndex: number;
  readonly date: string | null;
  readonly nextDate: string | null;
  readonly value: number | null;
  readonly nextValue: number | null;
  readonly pointId: string;
}

export function trendLabelInterval(pointCount: number): number {
  if (pointCount <= 7) return 1;
  if (pointCount <= 30) return 5;
  return 15;
}

function utcDayLabel(isoDate: string | null): string {
  if (!isoDate) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}`;
}

export function buildTemporalFacets(
  metricId: string,
  points: readonly TrendDatum[],
  lane: "current" | "previous"
): readonly TemporalFacet[] {
  return points.map((point, index) => {
    const next = points[index + 1];
    const date = lane === "current" ? point.currentDate : point.previousDate;
    const nextDate = lane === "current" ? next?.currentDate ?? null : next?.previousDate ?? null;
    const value = lane === "current" ? point.current : point.previous;
    const nextValue = next
      ? lane === "current"
        ? next.current
        : next.previous
      : null;
    return {
      id: spatialId(TREND_SCENE_ID, metricId, lane, `day-${point.dayIndex}`, "facet"),
      metricKey: metricId,
      lane,
      dayIndex: point.dayIndex,
      date,
      nextDate,
      value,
      nextValue,
      pointId: point.id
    };
  });
}

function domainMaximum(points: readonly TrendDatum[]): number {
  return Math.max(
    1,
    ...points.flatMap((point) => [point.current ?? 0, point.previous ?? 0])
  );
}

function temporalPoint(
  index: number,
  count: number,
  value: number,
  maximum: number,
  lane: "current" | "previous",
  zOffset = 0
): SpatialPoint {
  const x = count <= 1 ? 0 : -0.92 + (index / (count - 1)) * 1.84;
  return {
    x,
    y: temporalHeight(value, maximum, 0.82) ?? 0,
    z: (lane === "current" ? 0.28 : -0.38) + zOffset
  };
}

function temporalSeries({
  metricId,
  points,
  lane,
  maximum,
  reducedMotion,
  selectedDayIndex
}: {
  readonly metricId: string;
  readonly points: readonly TrendDatum[];
  readonly lane: "current" | "previous";
  readonly maximum: number;
  readonly reducedMotion: boolean;
  readonly selectedDayIndex?: number | undefined;
}): CustomSeriesOption {
  const facets = buildTemporalFacets(metricId, points, lane);
  const color = lane === "current"
    ? dashboardChartPalette.current
    : dashboardChartPalette.previous;
  const labelInterval = trendLabelInterval(points.length);
  const renderItem: CustomSeriesRenderItem = (params, api) => {
    const facet = facets[params.dataIndexInside ?? params.dataIndex];
    if (!facet) return null;
    const index = params.dataIndexInside ?? params.dataIndex;
    const viewport = { width: api.getWidth(), height: api.getHeight() };
    const transition = reducedMotion
      ? {}
      : { transition: ["shape", "style"] as ("shape" | "style")[] };
    const children: Record<string, unknown>[] = [];
    const rootId = spatialId(
      TREND_SCENE_ID,
      metricId,
      lane,
      `day-${facet.dayIndex}`,
      "root"
    );
    const currentHeight = temporalHeight(facet.value, maximum, 0.82);
    if (currentHeight !== null && facet.value !== null) {
      const point = projectSpatialPoint(
        temporalPoint(index, points.length, facet.value, maximum, lane),
        viewport
      );
      const floor = projectSpatialPoint(
        temporalPoint(index, points.length, 0, maximum, lane),
        viewport
      );
      if (facet.nextValue !== null && Number.isFinite(facet.nextValue)) {
        const farStart = projectSpatialPoint(
          temporalPoint(index, points.length, facet.value, maximum, lane, -0.07),
          viewport
        );
        const nearStart = projectSpatialPoint(
          temporalPoint(index, points.length, facet.value, maximum, lane, 0.07),
          viewport
        );
        const farEnd = projectSpatialPoint(
          temporalPoint(index + 1, points.length, facet.nextValue, maximum, lane, -0.07),
          viewport
        );
        const nearEnd = projectSpatialPoint(
          temporalPoint(index + 1, points.length, facet.nextValue, maximum, lane, 0.07),
          viewport
        );
        children.push(
          {
            type: "polygon",
            id: `${rootId}:facet-side`,
            name: "facet-side",
            shape: {
              points: [
                [nearStart.x, nearStart.y],
                [nearEnd.x, nearEnd.y],
                [nearEnd.x, nearEnd.y + 5],
                [nearStart.x, nearStart.y + 5]
              ]
            },
            style: {
              fill: lane === "current" ? "rgba(54,40,128,0.92)" : "rgba(20,91,94,0.78)",
              stroke: color,
              lineWidth: 0.5,
              opacity: lane === "current" ? 0.92 : 0.7
            },
            ...transition
          },
          {
            type: "polygon",
            id: `${rootId}:facet-top`,
            name: "facet-top",
            shape: {
              points: [
                [farStart.x, farStart.y],
                [farEnd.x, farEnd.y],
                [nearEnd.x, nearEnd.y],
                [nearStart.x, nearStart.y]
              ]
            },
            style: {
              fill: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 1,
                y2: 1,
                colorStops: [
                  { offset: 0, color: lane === "current" ? "rgba(180,170,255,0.92)" : "rgba(121,224,216,0.76)" },
                  { offset: 1, color }
                ]
              },
              stroke: color,
              lineWidth: 0.65,
              opacity: lane === "current" ? 0.94 : 0.72,
              shadowBlur: lane === "current" ? 7 : 3,
              shadowColor: color
            },
            ...(reducedMotion
              ? {}
              : {
                  enterFrom: {
                    shape: {
                      points: [
                        [farStart.x, floor.y],
                        [farEnd.x, floor.y],
                        [nearEnd.x, floor.y],
                        [nearStart.x, floor.y]
                      ]
                    }
                  },
                  transition: ["shape", "style"] as ("shape" | "style")[]
                })
          }
        );
      }
      const selected = facet.dayIndex === selectedDayIndex;
      if (selected) {
        children.push(
          {
            type: "line",
            id: `${rootId}:selected-tether`,
            name: "selected-tether",
            silent: true,
            shape: { x1: floor.x, y1: floor.y, x2: point.x, y2: point.y },
            style: { stroke: dashboardChartPalette.selected, lineWidth: 1, lineDash: [3, 3], opacity: 0.72 },
            ...transition
          },
          {
            type: "ellipse",
            id: `${rootId}:selected-halo`,
            name: "selected-halo",
            silent: true,
            shape: { cx: point.x, cy: point.y, rx: 8, ry: 6 },
            style: { fill: "transparent", stroke: dashboardChartPalette.selected, lineWidth: 1.4, shadowBlur: 8, shadowColor: dashboardChartPalette.selected },
            ...transition
          }
        );
      }
      children.push(
        {
          type: "circle",
          id: `${rootId}:vertex-halo`,
          name: "vertex-halo",
          shape: { cx: point.x, cy: point.y, r: points.length <= 30 ? 4.4 : 2.7 },
          style: { fill: "transparent", stroke: color, lineWidth: 2, opacity: 0.28 },
          ...transition
        },
        {
          type: "circle",
          id: `${rootId}:vertex`,
          name: "vertex",
          shape: { cx: point.x, cy: point.y, r: points.length <= 30 ? 2.2 : 1.4 },
          style: { fill: dashboardChartPalette.ink, stroke: color, lineWidth: 1 },
          ...transition
        }
      );
      if (lane === "current" && index % labelInterval === 0) {
        children.push({
          type: "text",
          id: `${rootId}:date`,
          name: "date",
          silent: true,
          style: {
            x: floor.x,
            y: floor.y + 14,
            text: utcDayLabel(facet.date),
            fill: dashboardChartPalette.muted,
            font: "8px Poppins",
            textAlign: "center",
            textVerticalAlign: "middle"
          },
          ...transition
        });
      }
    }
    return {
      type: "group",
      id: rootId,
      name: facet.pointId,
      diffChildrenByName: true,
      $mergeChildren: "byName",
      children
    } as unknown as ReturnType<CustomSeriesRenderItem>;
  };

  return {
    id: lane === "current" ? TREND_SERIES_IDS.current : TREND_SERIES_IDS.previous,
    name: lane === "current" ? "Current period" : "Previous period",
    type: "custom",
    z: lane === "current" ? 2 : 1,
    zlevel: 0,
    coordinateSystem: "none",
    renderItem,
    data: facets.map((facet) => ({
      id: facet.id,
      groupId: `${TREND_SCENE_ID}:${lane}:day-${facet.dayIndex}`,
      name: facet.pointId,
      value: [
        facet.dayIndex,
        facet.value,
        facet.nextValue,
        maximum,
        lane === "current" ? 1 : 0
      ]
    })),
    silent: false,
    universalTransition: reducedMotion
      ? false
      : { enabled: true, divideShape: "clone" },
    animationDelay: reducedMotion
      ? 0
      : (index: number) => Math.min(index * 7, 210),
    animationDelayUpdate: reducedMotion
      ? 0
      : (index: number) => Math.min(index * 3, 90)
  };
}

export function buildTrendOption({
  metricId,
  metricLabel: _metricLabel,
  points,
  showPrevious,
  reducedMotion,
  selectedDayIndex
}: TrendOptionInput): DashboardChartOption {
  const maximum = domainMaximum(points);
  return {
    backgroundColor: dashboardChartPalette.background,
    ...dashboardMotionOption(reducedMotion),
    tooltip: { show: false },
    series: [
      createSpatialGuideSeries({
        sceneId: TREND_SCENE_ID,
        seriesId: TREND_SERIES_IDS.guide,
        variant: "temporal",
        reducedMotion,
        accent: dashboardChartPalette.previous
      }),
      temporalSeries({
        metricId,
        points: showPrevious ? points : [],
        lane: "previous",
        maximum,
        reducedMotion,
        selectedDayIndex
      }),
      temporalSeries({
        metricId,
        points,
        lane: "current",
        maximum,
        reducedMotion,
        selectedDayIndex
      })
    ]
  };
}
