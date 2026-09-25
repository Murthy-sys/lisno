import type { DashboardChartOption } from "./types";

export const DASHBOARD_ENTER_DURATION_MS = 500;
export const DASHBOARD_UPDATE_DURATION_MS = 380;
export const DASHBOARD_FOCUS_DURATION_MS = 220;

export function dashboardMotionOption(
  reducedMotion: boolean
): Pick<
  DashboardChartOption,
  | "animation"
  | "animationDuration"
  | "animationDurationUpdate"
  | "animationEasing"
  | "animationEasingUpdate"
  | "animationThreshold"
> {
  if (reducedMotion) {
    return {
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0,
      animationEasing: "linear",
      animationEasingUpdate: "linear",
      animationThreshold: 0
    };
  }

  return {
    animation: true,
    animationDuration: DASHBOARD_ENTER_DURATION_MS,
    animationDurationUpdate: DASHBOARD_UPDATE_DURATION_MS,
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicInOut",
    animationThreshold: 180
  };
}

export function applyDashboardMotion(
  option: DashboardChartOption,
  reducedMotion: boolean
): DashboardChartOption {
  return {
    ...option,
    ...dashboardMotionOption(reducedMotion)
  };
}
