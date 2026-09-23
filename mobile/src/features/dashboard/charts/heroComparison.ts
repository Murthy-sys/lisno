import type { CustomSeriesOption } from "echarts/charts";

import { dashboardMotionOption } from "./motion";
import {
  createSpatialGuideSeries,
  createSpatialLinkSeries,
  createSpatialOrbSeries,
  type SpatialLinkDatum,
  type SpatialOrbDatum
} from "./spatialSeries";
import { dashboardChartPalette } from "./theme";
import type { ComparisonMetricDatum, DashboardChartOption } from "./types";

const HERO_SCENE_ID = "operations-constellation";

export const HERO_COUNT_SERIES_IDS = Object.freeze({
  guide: "operations-constellation-guide",
  pairing: "operations-constellation-pairing",
  current: "operations-constellation-current",
  previous: "operations-constellation-previous"
});

export const HERO_COUNT_METRIC_IDS = Object.freeze([
  "projects_created",
  "clients_created",
  "projects_completed",
  "execution_tasks_completed",
  "estimates_approved",
  "design_plans_approved"
] as const);

export type HeroCountMetricId = (typeof HERO_COUNT_METRIC_IDS)[number];

export function isHeroCountMetricId(value: string): value is HeroCountMetricId {
  return (HERO_COUNT_METRIC_IDS as readonly string[]).includes(value);
}

const constellationPositions = Object.freeze([
  { x: -0.72, y: 0.25, z: -0.2 },
  { x: -0.28, y: 0.65, z: -0.32 },
  { x: 0.37, y: 0.6, z: -0.12 },
  { x: 0.74, y: 0.29, z: 0.12 },
  { x: 0.3, y: 0.1, z: 0.36 },
  { x: -0.43, y: 0.08, z: 0.31 }
]);

export interface HeroComparisonOptionInput {
  readonly metrics: readonly ComparisonMetricDatum[];
  readonly selectedMetricId: string | null;
  readonly showPrevious: boolean;
  readonly reducedMotion: boolean;
}

export interface HeroSeriesData {
  readonly current: readonly SpatialOrbDatum[];
  readonly previous: readonly SpatialOrbDatum[];
  readonly pairing: readonly SpatialLinkDatum[];
  readonly domainMaximum: number;
}

function availableValue(
  value: number | null,
  available: boolean
): number | null {
  return available && value !== null && Number.isFinite(value)
    ? Math.max(0, value)
    : null;
}

export function buildHeroSeriesData(
  metrics: readonly ComparisonMetricDatum[],
  selectedMetricId: string | null
): HeroSeriesData {
  const current: SpatialOrbDatum[] = [];
  const previous: SpatialOrbDatum[] = [];
  const pairing: SpatialLinkDatum[] = [];
  let domainMaximum = 1;

  metrics.forEach((metric, index) => {
    const base = constellationPositions[index] ?? { x: 0, y: 0.3, z: 0 };
    const currentValue = availableValue(metric.current, metric.currentAvailable);
    const previousValue = availableValue(metric.previous, metric.previousAvailable);
    domainMaximum = Math.max(domainMaximum, currentValue ?? 0, previousValue ?? 0);
    const currentPoint = { ...base, z: base.z + 0.12 };
    const previousPoint = { ...base, z: base.z - 0.2 };
    current.push({
      id: `${metric.id}:current`,
      metricKey: metric.id,
      label: metric.label,
      shortLabel: metric.shortLabel,
      displayValue: metric.displayCurrent,
      value: currentValue,
      available: metric.currentAvailable && currentValue !== null,
      point: currentPoint,
      lane: "current",
      tone: "violet",
      selected: metric.id === selectedMetricId,
      showLabel: true
    });
    previous.push({
      id: `${metric.id}:previous`,
      metricKey: metric.id,
      label: metric.label,
      shortLabel: metric.shortLabel,
      displayValue: metric.displayPrevious,
      value: previousValue,
      available: metric.previousAvailable && previousValue !== null,
      point: previousPoint,
      lane: "previous",
      tone: "cyan",
      selected: metric.id === selectedMetricId,
      showLabel: false
    });
    pairing.push({
      id: `${metric.id}:period-pair`,
      metricKey: metric.id,
      from: previousPoint,
      to: currentPoint,
      lane: "period-pair",
      color:
        metric.id === selectedMetricId
          ? "rgba(242,201,76,0.58)"
          : "rgba(76,201,192,0.22)",
      width: metric.id === selectedMetricId ? 1.3 : 0.7,
      dashed: true
    });
  });

  return { current, previous, pairing, domainMaximum };
}

export function buildHeroComparisonOption({
  metrics,
  selectedMetricId,
  showPrevious,
  reducedMotion
}: HeroComparisonOptionInput): DashboardChartOption {
  // Paise never enters the constellation's shared count domain.
  const countMetrics = metrics.filter((metric) => isHeroCountMetricId(metric.id));
  const data = buildHeroSeriesData(countMetrics, selectedMetricId);
  const series: CustomSeriesOption[] = [
    createSpatialGuideSeries({
      sceneId: HERO_SCENE_ID,
      seriesId: HERO_COUNT_SERIES_IDS.guide,
      variant: "constellation",
      reducedMotion,
      accent: dashboardChartPalette.current
    }),
    createSpatialLinkSeries({
      sceneId: HERO_SCENE_ID,
      seriesId: HERO_COUNT_SERIES_IDS.pairing,
      name: "Current and previous period pairing",
      data: showPrevious ? data.pairing : [],
      reducedMotion
    }),
    createSpatialOrbSeries({
      sceneId: HERO_SCENE_ID,
      seriesId: HERO_COUNT_SERIES_IDS.previous,
      name: "Previous period",
      data: showPrevious ? data.previous : [],
      domainMaximum: data.domainMaximum,
      maximumRadius: 23,
      opacity: 0.88,
      reducedMotion
    }),
    createSpatialOrbSeries({
      sceneId: HERO_SCENE_ID,
      seriesId: HERO_COUNT_SERIES_IDS.current,
      name: "Current period",
      data: data.current,
      domainMaximum: data.domainMaximum,
      maximumRadius: 23,
      reducedMotion
    })
  ];

  return {
    backgroundColor: dashboardChartPalette.background,
    ...dashboardMotionOption(reducedMotion),
    tooltip: { show: false },
    series
  };
}
