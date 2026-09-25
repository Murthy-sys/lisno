import type { DashboardChartTone } from "./types";

export const dashboardChartPalette = Object.freeze({
  background: "transparent",
  surface: "#FFFFFF",
  ink: "#171B2D",
  muted: "#626A7D",
  border: "#E4E1DA",
  tooltipBackground: "#FFFFFF",
  sage: "#5F806C",
  sageDark: "#496856",
  sageSoft: "#EDF3EF",
  sand: "#C8AA7C",
  sandDark: "#8A6742",
  stone: "#9AA09C",
  blue: "#607FA8",
  plum: "#866C98",
  current: "#5F806C",
  previous: "#607FA8",
  selected: "#8A6742",
  spatialViolet: "#866C98",
  spatialVioletLight: "#B9A8C5",
  spatialVioletDark: "#654D76",
  spatialCyanDark: "#496C7E",
  floor: "rgba(95,128,108,0.07)",
  grid: "rgba(98,106,125,0.12)",
  gridStrong: "rgba(98,106,125,0.28)",
  riskGreen: "#5F806C",
  riskYellow: "#C08B42",
  riskRed: "#B65E57",
  riskGray: "#9AA09C",
  danger: "#B65E57",
  transparent: "rgba(0,0,0,0)"
});

const toneColors: Readonly<Record<DashboardChartTone, string>> = Object.freeze({
  violet: dashboardChartPalette.plum,
  cyan: dashboardChartPalette.blue,
  gold: dashboardChartPalette.sand,
  green: dashboardChartPalette.riskGreen,
  yellow: dashboardChartPalette.riskYellow,
  red: dashboardChartPalette.riskRed,
  muted: dashboardChartPalette.riskGray
});

export function chartToneColor(tone: DashboardChartTone | undefined): string {
  return toneColors[tone ?? "violet"];
}

export function riskColor(
  severity: "low" | "medium" | "high" | "unknown" | undefined
): string {
  switch (severity) {
    case "low":
      return dashboardChartPalette.riskGreen;
    case "medium":
      return dashboardChartPalette.riskYellow;
    case "high":
      return dashboardChartPalette.riskRed;
    default:
      return dashboardChartPalette.riskGray;
  }
}
