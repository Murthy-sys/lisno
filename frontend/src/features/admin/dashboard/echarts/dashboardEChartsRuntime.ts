import { BarChart, CustomChart, LineChart, PieChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  TooltipComponent
} from "echarts/components";
import { init, use } from "echarts/core";
import { UniversalTransition } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";

import type {
  DashboardEChartDatumTarget,
  DashboardEChartRuntimeInstance,
  DashboardEChartsRuntime
} from "./dashboardEChartsRuntimeTypes";

use([
  BarChart,
  CustomChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  AriaComponent,
  UniversalTransition,
  SVGRenderer
]);

const normalizeDatumTarget = (payload: unknown): DashboardEChartDatumTarget | null => {
  if (typeof payload !== "object" || payload === null) return null;

  const candidate = payload as Record<string, unknown>;
  const seriesId = candidate.seriesId;
  const dataIndex = candidate.dataIndex;

  if (typeof seriesId !== "string" || seriesId.length === 0 || seriesId.length > 200) return null;
  if (!Number.isSafeInteger(dataIndex) || (dataIndex as number) < 0) return null;

  return { seriesId, dataIndex: dataIndex as number };
};

const createInstance = (element: HTMLElement): DashboardEChartRuntimeInstance => {
  const chart = init(element, null, { renderer: "svg" });
  const datumListeners = new Set<(target: DashboardEChartDatumTarget) => void>();
  let disposed = false;
  let previousSeriesIds = new Set<string>();

  const handleClick = (payload: unknown) => {
    const target = normalizeDatumTarget(payload);
    if (!target || disposed) return;
    for (const listener of datumListeners) listener(target);
  };

  try {
    chart.on("click", handleClick);
  } catch (error) {
    chart.dispose();
    throw error;
  }

  return {
    update(option) {
      if (disposed) return;
      const rawSeries = (option as { series?: unknown }).series;
      const nextSeries = Array.isArray(rawSeries) ? rawSeries : rawSeries ? [rawSeries] : [];
      const nextSeriesIds = new Set(nextSeries.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const id = (entry as { id?: unknown }).id;
        return typeof id === "string" && id ? [id] : [];
      }));
      const removesSeries = [...previousSeriesIds].some((id) => !nextSeriesIds.has(id));
      chart.setOption(option, {
        lazyUpdate: false,
        notMerge: false,
        ...(removesSeries ? { replaceMerge: ["series"] } : {})
      });
      previousSeriesIds = nextSeriesIds;
    },
    resize() {
      if (!disposed) chart.resize({ animation: { duration: 0 } });
    },
    focusDatum(target) {
      if (disposed) return;
      chart.dispatchAction({ type: "downplay" });
      chart.dispatchAction({
        type: "highlight",
        seriesId: target.seriesId,
        dataIndex: target.dataIndex
      });
      chart.dispatchAction({
        type: "showTip",
        seriesId: target.seriesId,
        dataIndex: target.dataIndex
      });
    },
    onDatumClick(listener) {
      datumListeners.add(listener);
      return () => datumListeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      previousSeriesIds.clear();
      datumListeners.clear();
      chart.off("click", handleClick);
      chart.dispose();
    }
  };
};

export const dashboardEChartsRuntime: DashboardEChartsRuntime = {
  init: createInstance
};

export { normalizeDatumTarget };
