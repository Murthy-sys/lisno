import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chart = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispatchAction: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    dispose: vi.fn()
  };
  return {
    chart,
    init: vi.fn(() => chart),
    use: vi.fn()
  };
});

vi.mock("echarts/core", () => ({ init: mocks.init, use: mocks.use }));
vi.mock("echarts/charts", () => ({ BarChart: "bar", LineChart: "line", PieChart: "pie" }));
vi.mock("echarts/components", () => ({
  AriaComponent: "aria",
  DatasetComponent: "dataset",
  GridComponent: "grid",
  TooltipComponent: "tooltip"
}));
vi.mock("echarts/features", () => ({
  LabelLayout: "label-layout",
  UniversalTransition: "universal-transition"
}));
vi.mock("echarts/renderers", () => ({ SVGRenderer: "svg" }));

import { dashboardEChartsRuntime } from "./dashboardEChartsRuntime";

beforeEach(() => {
  mocks.init.mockClear();
  for (const method of Object.values(mocks.chart)) method.mockClear();
});

describe("dashboard ECharts runtime", () => {
  it("uses SVG and replaces removable option collections on every update", () => {
    const element = document.createElement("div");
    const instance = dashboardEChartsRuntime.init(element);
    instance.update({ series: [{ id: "one", type: "line", data: [1] }] });

    expect(mocks.init).toHaveBeenCalledWith(element, null, { renderer: "svg" });
    expect(mocks.use).toHaveBeenCalledWith([
      "line",
      "bar",
      "pie",
      "grid",
      "tooltip",
      "dataset",
      "aria",
      "label-layout",
      "universal-transition",
      "svg"
    ]);
    expect(mocks.chart.setOption).toHaveBeenCalledWith(
      expect.objectContaining({ series: expect.any(Array) }),
      expect.objectContaining({
        lazyUpdate: false,
        notMerge: false,
        replaceMerge: ["series", "dataset", "xAxis", "yAxis", "grid"]
      })
    );
  });

  it("updates one instance by stable series ID while replacing obsolete collections", () => {
    const element = document.createElement("div");
    const instance = dashboardEChartsRuntime.init(element);

    instance.update({
      series: [
        { id: "current", type: "line", data: [{ name: "2026-09-20", value: 2 }] },
        { id: "previous", type: "line", data: [{ name: "2026-09-20", value: 1 }] }
      ]
    });
    instance.update({
      series: [
        { id: "current", type: "bar", universalTransition: true, data: [{ name: "2026-09-20", value: 4 }] }
      ]
    });

    expect(mocks.init).toHaveBeenCalledOnce();
    expect(mocks.chart.setOption).toHaveBeenCalledTimes(2);
    expect(mocks.chart.setOption.mock.calls[1]).toEqual([
      expect.objectContaining({
        series: [expect.objectContaining({ id: "current", type: "bar", universalTransition: true })]
      }),
      {
        lazyUpdate: false,
        notMerge: false,
        replaceMerge: ["series", "dataset", "xAxis", "yAxis", "grid"]
      }
    ]);
  });

  it("normalizes click data and never exposes the raw ECharts payload", () => {
    const instance = dashboardEChartsRuntime.init(document.createElement("div"));
    const listener = vi.fn();
    instance.onDatumClick(listener);
    const rawListener = mocks.chart.on.mock.calls[0][1] as (payload: unknown) => void;

    rawListener({ seriesId: "projects", dataIndex: 2, name: "private", event: { raw: true } });
    expect(listener).toHaveBeenCalledWith({ seriesId: "projects", dataIndex: 2 });
    expect(listener.mock.calls[0][0]).not.toHaveProperty("name");
    expect(listener.mock.calls[0][0]).not.toHaveProperty("event");

    rawListener({ seriesId: "projects", dataIndex: [2] });
    rawListener({ seriesId: "", dataIndex: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("removes the exact listener and disposes once", () => {
    const instance = dashboardEChartsRuntime.init(document.createElement("div"));
    const rawListener = mocks.chart.on.mock.calls[0][1];
    instance.dispose();
    instance.dispose();

    expect(mocks.chart.off).toHaveBeenCalledOnce();
    expect(mocks.chart.off).toHaveBeenCalledWith("click", rawListener);
    expect(mocks.chart.dispose).toHaveBeenCalledOnce();
  });

  it("highlights and shows the keyboard-focused datum without forwarding caller data", () => {
    const instance = dashboardEChartsRuntime.init(document.createElement("div"));
    instance.focusDatum({ seriesId: "lifecycle", dataIndex: 3 });

    expect(mocks.chart.dispatchAction.mock.calls).toEqual([
      [{ type: "downplay" }],
      [{ type: "highlight", seriesId: "lifecycle", dataIndex: 3 }],
      [{ type: "showTip", seriesId: "lifecycle", dataIndex: 3 }]
    ]);
  });
});
