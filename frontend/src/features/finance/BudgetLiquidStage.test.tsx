import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BudgetLiquidMetric, BudgetLiquidSceneProps } from "./budgetLiquidMetrics";
import { BudgetLiquidStage } from "./BudgetLiquidStage";

const renderer = vi.hoisted(() => ({ props: null as BudgetLiquidSceneProps | null, ready: true, throwOnRender: false }));
vi.mock("./BudgetLiquidScene", async () => {
  const React = await import("react");
  return { default: (props: BudgetLiquidSceneProps) => {
    renderer.props = props;
    React.useEffect(() => { if (renderer.ready) props.onReady(); }, [props.onReady]);
    if (renderer.throwOnRender) throw new Error("Renderer unavailable");
    return <div data-testid="liquid-scene" data-active={String(props.animationActive)} data-columns={props.layout.columns} />;
  } };
});

const metrics: readonly BudgetLiquidMetric[] = [
  { id: "total", label: "Total Budget", note: "Excluding GST", amountPaise: 250_000_000, ratio: 1, fill: 1, excessPaise: 0 },
  { id: "usable", label: "Budget After Margin", note: "After reserving 20%, before expenses", amountPaise: 200_000_000, ratio: .8, fill: .8, excessPaise: 0 },
  { id: "expense", label: "Expenses", note: "Includes overheads", amountPaise: 180_000_000, ratio: .72, fill: .72, excessPaise: 0 },
  { id: "overhead", label: "Overheads", note: "Included in expenses", amountPaise: 20_000_000, ratio: .08, fill: .08, excessPaise: 0 },
  { id: "reserve", label: "Reserved Profit (20%)", note: "Reserved margin, not realized profit", amountPaise: 50_000_000, ratio: .2, fill: .2, excessPaise: 0 }
];

class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(readonly callback: ResizeObserverCallback) { ControlledResizeObserver.instances.push(this); }
  trigger() { this.callback([], this as unknown as ResizeObserver); }
}

class ControlledIntersectionObserver {
  static instances: ControlledIntersectionObserver[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(readonly callback: IntersectionObserverCallback) { ControlledIntersectionObserver.instances.push(this); }
  trigger(isIntersecting: boolean) { this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}

let width = 1200;
let reduced = false;
let visibility: DocumentVisibilityState = "visible";
let mediaListeners: Set<() => void>;
let media: MediaQueryList;

beforeEach(() => {
  renderer.props = null;
  renderer.ready = true;
  renderer.throwOnRender = false;
  width = 1200;
  reduced = false;
  visibility = "visible";
  ControlledResizeObserver.instances = [];
  ControlledIntersectionObserver.instances = [];
  mediaListeners = new Set();
  media = {
    get matches() { return reduced; }, media: "(prefers-reduced-motion: reduce)", onchange: null,
    addEventListener: vi.fn((_type, listener) => mediaListeners.add(listener as () => void)),
    removeEventListener: vi.fn((_type, listener) => mediaListeners.delete(listener as () => void)),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn()
  };
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
  vi.stubGlobal("WebGL2RenderingContext", function WebGL2RenderingContext() {});
  vi.stubGlobal("WebGLRenderingContext", undefined);
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const columns = Number(this.parentElement?.style.getPropertyValue("--budget-columns")) || 1;
    const height = Math.ceil(5 / columns) * 430;
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) };
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("BudgetLiquidStage", () => {
  it("keeps five exact financial captions and static vessels when WebGL is unavailable", () => {
    vi.stubGlobal("WebGL2RenderingContext", undefined);
    const { container } = render(<BudgetLiquidStage metrics={metrics} />);
    expect(screen.getByRole("list", { name: "Budget buckets" })).toHaveAccessibleDescription(/share of total budget/);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    const expense = within(screen.getByRole("listitem", { name: "Expenses" }));
    expect(expense.getByText("₹18,00,000.00")).toBeInTheDocument();
    expect(expense.getByText("72% of total budget")).toBeInTheDocument();
    expect(expense.getByText("Includes overheads")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Reserved Profit (20%)" })).toHaveTextContent("₹5,00,000.00");
    expect(container.querySelectorAll(".budget-liquid-stage__vessel")).toHaveLength(5);
    expect(container.querySelectorAll(".budget-liquid-stage__icon svg")).toHaveLength(5);
    for (const graphic of container.querySelectorAll(".budget-liquid-stage__graphic")) expect(graphic.textContent).toBe("");
    expect(screen.queryByTestId("liquid-scene")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /motion/i })).not.toBeInTheDocument();
  });

  it("keeps captions below text-free vessels through lazy readiness without showing a motion control", async () => {
    renderer.ready = false;
    const { container } = render(<BudgetLiquidStage metrics={metrics} />);
    await screen.findByTestId("liquid-scene");
    expect(container.querySelector(".budget-liquid-stage")).toHaveAttribute("data-render-state", "loading");
    expect(container.querySelector(".budget-liquid-stage__illustration")).toBeVisible();
    const expense = screen.getByRole("listitem", { name: "Expenses" });
    expect(expense).toHaveTextContent("₹18,00,000.0072% of total budgetIncludes overheads");
    for (const graphic of container.querySelectorAll(".budget-liquid-stage__graphic")) expect(graphic.textContent).toBe("");
    act(() => renderer.props!.onReady());
    expect(container.querySelector(".budget-liquid-stage")).toHaveAttribute("data-render-state", "ready");
    expect(container.querySelector(".budget-liquid-stage__illustration")).not.toBeVisible();
    expect(screen.queryByRole("button", { name: /motion/i })).not.toBeInTheDocument();
    for (const graphic of container.querySelectorAll(".budget-liquid-stage__graphic")) expect(graphic.textContent).toBe("");
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-active", "true");
    expect(renderer.props?.layout.visualHeight).toBe(300);
    expect(renderer.props?.layout.rowHeight).toBe(430);
    expect(expense).toHaveTextContent("₹18,00,000.0072% of total budgetIncludes overheads");
  });

  it("honors changing motion and visibility preferences, responds to width, and cleans up observers", async () => {
    reduced = true;
    const { unmount } = render(<BudgetLiquidStage metrics={metrics} />);
    await screen.findByTestId("liquid-scene");
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-active", "false");
    expect(screen.queryByRole("button", { name: /motion/i })).not.toBeInTheDocument();
    expect(screen.getByText("Reduced motion is on.")).toBeInTheDocument();
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-columns", "5");
    act(() => { reduced = false; mediaListeners.forEach((listener) => listener()); });
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-active", "true");
    act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-active", "false");
    act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    act(() => ControlledIntersectionObserver.instances[0].trigger(false));
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-active", "false");
    act(() => ControlledIntersectionObserver.instances[0].trigger(true));
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-active", "true");
    act(() => { width = 700; ControlledResizeObserver.instances.at(-1)!.trigger(); });
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-columns", "2");
    act(() => { width = 320; ControlledResizeObserver.instances.at(-1)!.trigger(); });
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-columns", "1");
    act(() => { reduced = true; mediaListeners.forEach((listener) => listener()); });
    expect(screen.getByTestId("liquid-scene")).toHaveAttribute("data-active", "false");
    unmount();
    expect(mediaListeners.size).toBe(0);
    expect(ControlledIntersectionObserver.instances[0].disconnect).toHaveBeenCalledOnce();
    for (const observer of ControlledResizeObserver.instances) expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("retains values on renderer or context failure and allows a deliberate retry", async () => {
    const user = userEvent.setup();
    const { container } = render(<BudgetLiquidStage metrics={metrics} />);
    await waitFor(() => expect(container.querySelector(".budget-liquid-stage")).toHaveAttribute("data-render-state", "ready"));
    act(() => renderer.props!.onFailure());
    expect(screen.queryByTestId("liquid-scene")).not.toBeInTheDocument();
    expect(container.querySelector(".budget-liquid-stage__illustration")).toBeVisible();
    expect(screen.getByRole("listitem", { name: "Total Budget" })).toHaveTextContent("₹25,00,000.00");
    expect(screen.getByRole("listitem", { name: "Total Budget" })).toHaveTextContent("100% of total budgetExcluding GST");
    for (const graphic of container.querySelectorAll(".budget-liquid-stage__graphic")) expect(graphic.textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "Retry 3D view" }));
    await waitFor(() => expect(container.querySelector(".budget-liquid-stage")).toHaveAttribute("data-render-state", "ready"));
    expect(screen.queryByRole("button", { name: "Retry 3D view" })).not.toBeInTheDocument();
  });

  it("does not fill zero amounts or invent zero-capacity percentages, and reports bounded excess exactly", () => {
    vi.stubGlobal("WebGL2RenderingContext", undefined);
    const values = metrics.map((metric): BudgetLiquidMetric => ({ ...metric, amountPaise: 0, ratio: null, fill: 0, excessPaise: 0 }));
    values[2] = { ...metrics[2], amountPaise: 300_000_025, ratio: 1.2000001, fill: 1, excessPaise: 50_000_025 };
    const { container } = render(<BudgetLiquidStage metrics={values} />);
    expect(container.querySelectorAll(".budget-liquid-stage__static-liquid")).toHaveLength(1);
    expect(screen.getByRole("listitem", { name: "Total Budget" })).toHaveTextContent("₹0.00Percentage not defined for a zero total budget");
    const expenses = screen.getByRole("listitem", { name: "Expenses" });
    expect(expenses).toHaveTextContent("₹30,00,000.25120% of total budget");
    expect(within(screen.getByRole("listitem", { name: "Total Budget" })).queryByText("0%")).not.toBeInTheDocument();
    expect(expenses).toHaveTextContent("₹5,00,000.25 above total budget. Vessel shown at capacity.");
  });

  it("shows an empty vessel and exact expenses when total capacity is undefined", () => {
    vi.stubGlobal("WebGL2RenderingContext", undefined);
    const values = metrics.map((metric): BudgetLiquidMetric => ({ ...metric, amountPaise: 0, ratio: null, fill: 0, excessPaise: 0 }));
    values[2] = { ...values[2], amountPaise: 12_345, excessPaise: 12_345 };
    const { container } = render(<BudgetLiquidStage metrics={values} />);
    expect(container.querySelectorAll(".budget-liquid-stage__static-liquid")).toHaveLength(0);
    const expenses = screen.getByRole("listitem", { name: "Expenses" });
    expect(expenses).toHaveTextContent("₹123.45 above total budget. No budget capacity is defined.");
    expect(expenses).not.toHaveTextContent("Vessel shown at capacity");
    expect(within(expenses).getByText("Percentage not defined for a zero total budget")).toBeInTheDocument();
  });

  it("contains render initialization errors within the static financial presentation", async () => {
    renderer.throwOnRender = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<BudgetLiquidStage metrics={metrics} />);
    expect(await screen.findByRole("button", { name: "Retry 3D view" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("listitem", { name: "Reserved Profit (20%)" })).toHaveTextContent("Reserved margin, not realized profit");
    expect(errors).toHaveBeenCalled();
  });
});
