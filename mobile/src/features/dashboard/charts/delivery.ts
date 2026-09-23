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
import type { DashboardChartOption, DeliveryChartData, StageDatum } from "./types";

const DELIVERY_SCENE_ID = "delivery-corridors";

export const DELIVERY_SERIES_IDS = Object.freeze({
  guide: "delivery-corridors-guide",
  order: "delivery-corridors-order",
  stages: "delivery-corridors-stages"
});

const stagePositions = Object.freeze([
  { x: -0.78, y: 0.7, z: -0.38 },
  { x: -0.28, y: 0.62, z: -0.22 },
  { x: 0.13, y: 0.72, z: -0.16 },
  { x: 0.66, y: 0.61, z: 0.02 },
  { x: -0.67, y: 0.22, z: 0.12 },
  { x: -0.18, y: 0.16, z: 0.28 },
  { x: 0.22, y: 0.32, z: 0.31 },
  { x: 0.72, y: 0.2, z: 0.46 }
]);

function availableStageValue(stage: StageDatum): number | null {
  if (
    stage.available === false ||
    stage.value === null ||
    !Number.isFinite(stage.value)
  ) {
    return null;
  }
  return Math.max(0, stage.value);
}

export function buildDeliverySpatialData(
  stages: readonly StageDatum[]
): {
  readonly nodes: readonly SpatialOrbDatum[];
  readonly links: readonly SpatialLinkDatum[];
} {
  const nodes: SpatialOrbDatum[] = stages.map((stage, index) => {
    const value = availableStageValue(stage);
    return {
      id: `${stage.id}:snapshot`,
      metricKey: stage.id,
      label: stage.label,
      shortLabel: stage.shortLabel ?? stage.label,
      displayValue: stage.displayValue,
      value,
      available: value !== null,
      point: stagePositions[index] ?? { x: 0, y: 0.35, z: 0 },
      lane: "current-snapshot",
      tone: stage.tone,
      showLabel: true
    };
  });
  // The adapter deliberately supplies four ordered pairs. Links show the
  // canonical state order only; their neutral width never claims conversion.
  const links: SpatialLinkDatum[] = [0, 2, 4, 6].flatMap((index) => {
    const from = nodes[index];
    const to = nodes[index + 1];
    if (!from || !to) return [];
    return [{
      id: `${from.metricKey}:order:${to.metricKey}`,
      metricKey: from.metricKey,
      from: from.point,
      to: to.point,
      lane: "canonical-order",
      color: "rgba(181,169,255,0.44)",
      width: 1.15,
      dashed: true
    }];
  });
  return { nodes, links };
}

export function buildDeliveryOption(
  data: DeliveryChartData,
  reducedMotion: boolean
): DashboardChartOption {
  const spatial = buildDeliverySpatialData(data.stages);
  const series: CustomSeriesOption[] = [
    createSpatialGuideSeries({
      sceneId: DELIVERY_SCENE_ID,
      seriesId: DELIVERY_SERIES_IDS.guide,
      variant: "corridor",
      reducedMotion,
      accent: dashboardChartPalette.selected
    }),
    createSpatialLinkSeries({
      sceneId: DELIVERY_SCENE_ID,
      seriesId: DELIVERY_SERIES_IDS.order,
      name: "Canonical stage order, not measured conversion",
      data: spatial.links,
      reducedMotion
    }),
    createSpatialOrbSeries({
      sceneId: DELIVERY_SCENE_ID,
      seriesId: DELIVERY_SERIES_IDS.stages,
      name: "Current workflow snapshots",
      data: spatial.nodes,
      maximumRadius: 21,
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
