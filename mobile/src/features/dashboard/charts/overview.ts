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
import type {
  DashboardChartOption,
  OverviewChartData,
  StageDatum
} from "./types";

const OVERVIEW_SCENE_ID = "portfolio-orbit-risk-field";

export const OVERVIEW_SERIES_IDS = Object.freeze({
  guide: "portfolio-orbit-guide",
  sequence: "portfolio-lifecycle-sequence",
  lifecycle: "portfolio-lifecycle-orbit",
  risk: "portfolio-risk-field"
});

function availableStage(stage: StageDatum): stage is StageDatum & { value: number } {
  return stage.available !== false && stage.value !== null && Number.isFinite(stage.value);
}

export function sumAvailableStages(stages: readonly StageDatum[]): number {
  return stages.reduce(
    (sum, stage) => (availableStage(stage) ? sum + Math.max(0, stage.value) : sum),
    0
  );
}

const lifecyclePositions = Object.freeze([
  { x: -0.7, y: 0.61, z: -0.24 },
  { x: -0.12, y: 0.78, z: -0.12 },
  { x: 0.58, y: 0.61, z: 0.08 },
  { x: 0.12, y: 0.41, z: 0.28 }
]);

const riskPositions = Object.freeze([
  { x: -0.68, y: 0.12, z: 0.04 },
  { x: -0.24, y: 0.23, z: 0.18 },
  { x: 0.26, y: 0.2, z: 0.31 },
  { x: 0.7, y: 0.09, z: 0.44 }
]);

function stageOrb(
  stage: StageDatum,
  index: number,
  point: { readonly x: number; readonly y: number; readonly z: number },
  lane: string
): SpatialOrbDatum {
  const available = availableStage(stage);
  return {
    id: `${stage.id}:${lane}`,
    metricKey: stage.id,
    label: stage.label,
    shortLabel: stage.shortLabel ?? stage.label,
    displayValue: stage.displayValue,
    value: available ? Math.max(0, stage.value) : null,
    available,
    point,
    lane,
    tone: stage.tone ?? (index % 2 === 0 ? "violet" : "cyan"),
    showLabel: true
  };
}

export function buildOverviewOption(
  data: OverviewChartData,
  reducedMotion: boolean
): DashboardChartOption {
  const lifecycle: SpatialOrbDatum[] = data.lifecycle.map((stage, index) =>
    stageOrb(
      stage,
      index,
      lifecyclePositions[index] ?? { x: 0, y: 0.55, z: 0 },
      "lifecycle"
    )
  );
  const sequence: SpatialLinkDatum[] = lifecycle.slice(0, -1).map((item, index) => ({
    id: `${item.metricKey}:to:${lifecycle[index + 1]?.metricKey ?? "end"}`,
    metricKey: item.metricKey,
    from: item.point,
    to: lifecycle[index + 1]?.point ?? item.point,
    lane: "canonical-order",
    color: "rgba(181,169,255,0.34)",
    width: 1,
    dashed: true
  }));
  const risk: SpatialOrbDatum[] = data.risk.map((stage, index) => ({
    ...stageOrb(
      stage,
      index,
      riskPositions[index] ?? { x: 0, y: 0.14, z: 0.2 },
      "risk"
    ),
    severity: stage.severity
  }));

  const series: CustomSeriesOption[] = [
    createSpatialGuideSeries({
      sceneId: OVERVIEW_SCENE_ID,
      seriesId: OVERVIEW_SERIES_IDS.guide,
      variant: "orbit",
      reducedMotion,
      accent: dashboardChartPalette.current
    }),
    createSpatialLinkSeries({
      sceneId: OVERVIEW_SCENE_ID,
      seriesId: OVERVIEW_SERIES_IDS.sequence,
      name: "Canonical lifecycle order, not measured conversion",
      data: sequence,
      reducedMotion
    }),
    createSpatialOrbSeries({
      sceneId: OVERVIEW_SCENE_ID,
      seriesId: OVERVIEW_SERIES_IDS.lifecycle,
      name: "Lifecycle snapshot orbit",
      data: lifecycle,
      maximumRadius: 22,
      reducedMotion
    }),
    createSpatialOrbSeries({
      sceneId: OVERVIEW_SCENE_ID,
      seriesId: OVERVIEW_SERIES_IDS.risk,
      name: "Risk field",
      data: risk,
      maximumRadius: 18,
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
