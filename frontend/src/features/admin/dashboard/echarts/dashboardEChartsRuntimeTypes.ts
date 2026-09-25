import type { DashboardEChartOption } from "./types";

export interface DashboardEChartDatumTarget {
  seriesId: string;
  dataIndex: number;
}

export interface DashboardEChartRuntimeInstance {
  update: (option: DashboardEChartOption) => void;
  resize: () => void;
  focusDatum: (target: DashboardEChartDatumTarget) => void;
  onDatumClick: (listener: (target: DashboardEChartDatumTarget) => void) => () => void;
  dispose: () => void;
}

export interface DashboardEChartsRuntime {
  init: (element: HTMLElement) => DashboardEChartRuntimeInstance;
}
