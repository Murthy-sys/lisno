import type { DashboardEChartsRuntime } from "./dashboardEChartsRuntimeTypes";

let pendingRuntime: Promise<DashboardEChartsRuntime> | undefined;

export const loadDashboardEChartsRuntime = async (): Promise<DashboardEChartsRuntime> => {
  pendingRuntime ??= import("./dashboardEChartsRuntime").then(
    ({ dashboardEChartsRuntime }) => dashboardEChartsRuntime
  );

  try {
    return await pendingRuntime;
  } catch (error) {
    pendingRuntime = undefined;
    throw error;
  }
};
