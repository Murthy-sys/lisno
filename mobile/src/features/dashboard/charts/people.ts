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
import type { DashboardChartOption, PeopleChartData, StageDatum } from "./types";

const PEOPLE_SCENE_ID = "workforce-capacity-topology";

export const PEOPLE_SERIES_IDS = Object.freeze({
  guide: "workforce-topology-guide",
  relationships: "workforce-topology-relationships",
  capacity: "workforce-capacity-core",
  roles: "workforce-role-clusters",
  governance: "workforce-governance-field"
});

function stageValue(stage: StageDatum): number | null {
  if (
    stage.available === false ||
    stage.value === null ||
    !Number.isFinite(stage.value)
  ) {
    return null;
  }
  return Math.max(0, stage.value);
}

function orb(
  stage: StageDatum,
  point: { readonly x: number; readonly y: number; readonly z: number },
  lane: string
): SpatialOrbDatum {
  const value = stageValue(stage);
  return {
    id: `${stage.id}:${lane}`,
    metricKey: stage.id,
    label: stage.label,
    shortLabel: stage.shortLabel ?? stage.label,
    displayValue: stage.displayValue,
    value,
    available: value !== null,
    point,
    lane,
    tone: stage.tone,
    showLabel: true
  };
}

const rolePositions = Object.freeze([
  { x: -0.74, y: 0.67, z: -0.34 },
  { x: -0.31, y: 0.78, z: -0.22 },
  { x: 0.17, y: 0.72, z: -0.1 },
  { x: 0.62, y: 0.63, z: 0.02 },
  { x: -0.5, y: 0.43, z: 0.08 },
  { x: 0.48, y: 0.43, z: 0.2 }
]);

const workloadPositions = Object.freeze([
  { x: -0.26, y: 0.25, z: 0.28 },
  { x: 0.28, y: 0.23, z: 0.39 }
]);

const governancePositions = Object.freeze([
  { x: -0.72, y: 0.05, z: 0.45 },
  { x: -0.24, y: 0.04, z: 0.52 },
  { x: 0.25, y: 0.04, z: 0.59 },
  { x: 0.72, y: 0.05, z: 0.66 }
]);

export function buildPeopleSpatialData(data: PeopleChartData) {
  const core = orb(data.activeWorkers, { x: 0, y: 0.43, z: 0.12 }, "active-core");
  const roles = data.roles.map((stage, index) =>
    orb(stage, rolePositions[index] ?? { x: 0, y: 0.58, z: 0 }, "role-cluster")
  );
  const workload = data.workload.map((stage, index) =>
    orb(stage, workloadPositions[index] ?? { x: 0, y: 0.23, z: 0.32 }, "assignment-satellite")
  );
  const governance = data.governance.map((stage, index) =>
    orb(stage, governancePositions[index] ?? { x: 0, y: 0.04, z: 0.52 }, "governance")
  );
  const relationships: SpatialLinkDatum[] = [
    ...roles.map((role) => ({
      id: `active-role:${role.metricKey}`,
      metricKey: role.metricKey,
      from: core.point,
      to: role.point,
      lane: "role-aggregate" as const,
      color: "rgba(139,124,246,0.22)",
      width: 0.8
    })),
    ...workload.map((item) => ({
      id: `active-workload:${item.metricKey}`,
      metricKey: item.metricKey,
      from: core.point,
      to: item.point,
      lane: "assignment-total" as const,
      color: item.tone === "yellow"
        ? "rgba(242,201,76,0.45)"
        : "rgba(76,201,192,0.42)",
      width: 1.2
    }))
  ];
  return { core, roles, workload, governance, relationships };
}

export function buildPeopleOption(
  data: PeopleChartData,
  reducedMotion: boolean
): DashboardChartOption {
  const spatial = buildPeopleSpatialData(data);
  const series: CustomSeriesOption[] = [
    createSpatialGuideSeries({
      sceneId: PEOPLE_SCENE_ID,
      seriesId: PEOPLE_SERIES_IDS.guide,
      variant: "topology",
      reducedMotion,
      accent: dashboardChartPalette.previous
    }),
    createSpatialLinkSeries({
      sceneId: PEOPLE_SCENE_ID,
      seriesId: PEOPLE_SERIES_IDS.relationships,
      name: "Aggregate workforce relationships",
      data: spatial.relationships,
      reducedMotion
    }),
    createSpatialOrbSeries({
      sceneId: PEOPLE_SCENE_ID,
      seriesId: PEOPLE_SERIES_IDS.roles,
      name: "Role aggregate clusters",
      data: spatial.roles,
      maximumRadius: 17,
      reducedMotion
    }),
    createSpatialOrbSeries({
      sceneId: PEOPLE_SCENE_ID,
      seriesId: PEOPLE_SERIES_IDS.capacity,
      name: "Active workforce and assignment totals",
      data: [spatial.core, ...spatial.workload],
      maximumRadius: 21,
      reducedMotion
    }),
    createSpatialOrbSeries({
      sceneId: PEOPLE_SCENE_ID,
      seriesId: PEOPLE_SERIES_IDS.governance,
      name: "Governance queue field",
      data: spatial.governance,
      maximumRadius: 15,
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
