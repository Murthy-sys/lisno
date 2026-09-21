import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DashboardEChartRuntimeInstance,
  DashboardEChartsRuntime
} from "./dashboardEChartsRuntimeTypes";

const { loadRuntime } = vi.hoisted(() => ({
  loadRuntime: vi.fn()
}));

vi.mock("./loadDashboardEChartsRuntime", () => ({
  loadDashboardEChartsRuntime: loadRuntime
}));

import { DashboardEChart } from "./DashboardEChart";

class ControlledResizeObserver implements ResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  private readonly callback: ResizeObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ControlledResizeObserver.instances.push(this);
  }

  trigger() {
    this.callback([], this);
  }

  takeRecords(): ResizeObserverEntry[] {
    return [];
  }
}

const createRuntime = () => {
  let clickListener: ((target: { seriesId: string; dataIndex: number }) => void) | undefined;
  const removeClick = vi.fn();
  const instance: DashboardEChartRuntimeInstance = {
    update: vi.fn(),
    resize: vi.fn(),
    focusDatum: vi.fn(),
    onDatumClick: vi.fn((listener) => {
      clickListener = listener;
      return removeClick;
    }),
    dispose: vi.fn()
  };
  const runtime: DashboardEChartsRuntime = { init: vi.fn(() => instance) };
  return { runtime, instance, removeClick, click: (target: { seriesId: string; dataIndex: number }) => clickListener?.(target) };
};

let chartWidth = 640;
let chartHeight = 280;
let reducedMotion = false;
let motionListener: ((event: MediaQueryListEvent) => void) | undefined;
let motionMedia: MediaQueryList;
let originalResizeObserver: typeof ResizeObserver | undefined;
let originalMatchMedia: typeof window.matchMedia | undefined;

beforeEach(() => {
  loadRuntime.mockReset();
  ControlledResizeObserver.instances = [];
  chartWidth = 640;
  chartHeight = 280;
  reducedMotion = false;
  motionListener = undefined;
  originalResizeObserver = globalThis.ResizeObserver;
  originalMatchMedia = window.matchMedia;
  globalThis.ResizeObserver = ControlledResizeObserver;
  motionMedia = {
    matches: reducedMotion,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn((_type, listener) => { motionListener = listener as (event: MediaQueryListEvent) => void; }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  };
  window.matchMedia = vi.fn(() => motionMedia);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    bottom: chartHeight,
    height: chartHeight,
    left: 0,
    right: chartWidth,
    top: 0,
    width: chartWidth,
    x: 0,
    y: 0,
    toJSON: () => ({})
  }));
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
  window.matchMedia = originalMatchMedia as typeof window.matchMedia;
  document.documentElement.removeAttribute("style");
});

const baseProps = {
  chartId: "activity",
  height: 280,
  description: "Current and previous project activity.",
  createOption: vi.fn(() => ({
    series: [{ id: "current", type: "line" as const, data: [1, 3, 2] }],
    tooltip: { trigger: "axis" as const }
  }))
};

describe("DashboardEChart", () => {
  it("waits for non-zero layout, resolves CSS tokens, resizes, and disposes its exact instance", async () => {
    chartWidth = 0;
    document.documentElement.style.setProperty("--chart-series-1", "rgb(12, 34, 56)");
    const { runtime, instance, removeClick } = createRuntime();
    loadRuntime.mockResolvedValue(runtime);

    const { unmount } = render(<DashboardEChart {...baseProps} />);
    await waitFor(() => expect(loadRuntime).toHaveBeenCalledOnce());
    expect(runtime.init).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Loading chart");

    chartWidth = 640;
    act(() => ControlledResizeObserver.instances[0].trigger());
    await waitFor(() => expect(runtime.init).toHaveBeenCalledOnce());

    const option = vi.mocked(instance.update).mock.calls[0][0] as Record<string, unknown>;
    expect(option.color).toEqual(expect.arrayContaining(["#5a45d6"]));
    expect((option.color as string[]).some((color) => color.includes("var("))).toBe(false);
    expect(option.animationDuration).toBe(760);
    expect(option.animationDurationUpdate).toBe(700);
    expect(option.animationEasingUpdate).toBe("cubicInOut");
    expect(option.tooltip).toMatchObject({ confine: true, renderMode: "richText" });
    expect(screen.getByRole("img", { name: baseProps.description })).toHaveAttribute("aria-busy", "false");

    act(() => ControlledResizeObserver.instances[0].trigger());
    await waitFor(() => expect(instance.resize).toHaveBeenCalled());

    unmount();
    expect(removeClick).toHaveBeenCalledOnce();
    expect(instance.dispose).toHaveBeenCalledOnce();
    expect(ControlledResizeObserver.instances[0].disconnect).toHaveBeenCalledOnce();
  });

  it("does not initialize after an interrupted lazy load", async () => {
    let resolveRuntime!: (runtime: DashboardEChartsRuntime) => void;
    const pending = new Promise<DashboardEChartsRuntime>((resolve) => { resolveRuntime = resolve; });
    const { runtime } = createRuntime();
    loadRuntime.mockReturnValue(pending);

    const { unmount } = render(<DashboardEChart {...baseProps} />);
    unmount();
    await act(async () => resolveRuntime(runtime));

    expect(runtime.init).not.toHaveBeenCalled();
  });

  it("survives Strict Mode and renders the latest option after a pending load", async () => {
    let resolveRuntime!: (runtime: DashboardEChartsRuntime) => void;
    const pending = new Promise<DashboardEChartsRuntime>((resolve) => { resolveRuntime = resolve; });
    const { runtime, instance } = createRuntime();
    loadRuntime.mockReturnValue(pending);
    const firstOption = vi.fn(() => ({
      series: [{ id: "current", type: "line" as const, data: [1] }]
    }));
    const latestOption = vi.fn(() => ({
      series: [{ id: "current", type: "line" as const, data: [9] }]
    }));

    const { rerender, unmount } = render(
      <StrictMode><DashboardEChart {...baseProps} createOption={firstOption} /></StrictMode>
    );
    rerender(<StrictMode><DashboardEChart {...baseProps} createOption={latestOption} /></StrictMode>);
    await act(async () => resolveRuntime(runtime));
    await waitFor(() => expect(instance.update).toHaveBeenCalled());

    expect(runtime.init).toHaveBeenCalledOnce();
    expect(latestOption).toHaveBeenCalled();
    expect(firstOption).not.toHaveBeenCalled();
    expect(vi.mocked(instance.update).mock.calls[0][0]).toMatchObject({
      series: [{ id: "current", data: [9] }]
    });

    unmount();
    expect(instance.dispose).toHaveBeenCalledOnce();
  });

  it("reacts to live reduced-motion changes without remounting the chart", async () => {
    reducedMotion = true;
    Object.defineProperty(motionMedia, "matches", { configurable: true, value: true });
    const { runtime, instance } = createRuntime();
    loadRuntime.mockResolvedValue(runtime);
    render(<DashboardEChart {...baseProps} />);

    await waitFor(() => expect(instance.update).toHaveBeenCalled());
    expect(vi.mocked(instance.update).mock.calls.at(-1)?.[0]).toMatchObject({
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0
    });

    reducedMotion = false;
    Object.defineProperty(motionMedia, "matches", { configurable: true, value: false });
    act(() => motionListener?.({ matches: false } as MediaQueryListEvent));
    await waitFor(() => expect(instance.update).toHaveBeenCalledTimes(2));
    expect(vi.mocked(instance.update).mock.calls.at(-1)?.[0]).toMatchObject({
      animation: true,
      animationDuration: 760,
      animationDurationUpdate: 700
    });
    expect(runtime.init).toHaveBeenCalledOnce();
  });

  it("applies rapid option changes to the same chart instance in latest-state order", async () => {
    const { runtime, instance } = createRuntime();
    loadRuntime.mockResolvedValue(runtime);
    const optionFor = (value: number) => vi.fn(() => ({
      series: [{
        id: "current",
        type: "line" as const,
        universalTransition: true,
        data: [{ name: "2026-09-20", value }]
      }]
    }));
    const firstOption = optionFor(1);
    const secondOption = optionFor(2);
    const latestOption = optionFor(3);

    const { rerender } = render(
      <DashboardEChart {...baseProps} createOption={firstOption} />
    );
    await waitFor(() => expect(instance.update).toHaveBeenCalledOnce());
    rerender(<DashboardEChart {...baseProps} createOption={secondOption} />);
    rerender(<DashboardEChart {...baseProps} createOption={latestOption} />);
    await waitFor(() => expect(latestOption).toHaveBeenCalled());

    expect(runtime.init).toHaveBeenCalledOnce();
    expect(vi.mocked(instance.update).mock.calls.at(-1)?.[0]).toMatchObject({
      series: [{
        id: "current",
        universalTransition: true,
        data: [{ name: "2026-09-20", value: 3 }]
      }]
    });
  });

  it("navigates allow-listed data and activates only allow-listed IDs", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const { runtime, instance, click } = createRuntime();
    loadRuntime.mockResolvedValue(runtime);
    render(
      <DashboardEChart
        {...baseProps}
        interaction={{
          orientation: "horizontal",
          onActivate,
          items: [
            { id: "planning", seriesId: "lifecycle", dataIndex: 0, announcement: "Planning, 4 projects" },
            { id: "active", seriesId: "lifecycle", dataIndex: 1, announcement: "Active, 9 projects" }
          ]
        }}
      />
    );

    const chart = await screen.findByRole("img", { name: baseProps.description });
    await waitFor(() => expect(instance.update).toHaveBeenCalled());
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(instance.focusDatum).toHaveBeenLastCalledWith({ seriesId: "lifecycle", dataIndex: 1 });
    expect(screen.getByText("Active, 9 projects")).toBeInTheDocument();

    fireEvent.keyDown(chart, { key: "Home" });
    await user.keyboard("{Enter}");
    expect(onActivate).toHaveBeenLastCalledWith("planning");

    act(() => click({ seriesId: "unexpected", dataIndex: 0 }));
    expect(onActivate).toHaveBeenCalledTimes(1);
    act(() => click({ seriesId: "lifecycle", dataIndex: 1 }));
    expect(onActivate).toHaveBeenLastCalledWith("active");
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("shows a generic retry state and can recover from a loader failure", async () => {
    const onRenderError = vi.fn();
    const { runtime, instance } = createRuntime();
    loadRuntime.mockRejectedValueOnce(new Error("private module detail")).mockResolvedValueOnce(runtime);
    const user = userEvent.setup();
    render(<DashboardEChart {...baseProps} onRenderError={onRenderError} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Chart unavailable");
    expect(screen.queryByText(/private module detail/i)).not.toBeInTheDocument();
    expect(onRenderError).toHaveBeenCalledWith({
      phase: "load",
      message: "The chart renderer could not be loaded."
    });

    await user.click(screen.getByRole("button", { name: "Retry chart" }));
    await waitFor(() => expect(instance.update).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
