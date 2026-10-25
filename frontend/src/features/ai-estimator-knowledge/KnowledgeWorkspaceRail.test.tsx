import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { KnowledgeWorkspaceRail } from "./KnowledgeWorkspaceRail";
import type { KnowledgeWorkspaceTabKey } from "./knowledgeWorkspaceSections";

class ControlledResizeObserver implements ResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  readonly targets = new Set<Element>();
  readonly observe = vi.fn((target: Element) => { this.targets.add(target); });
  readonly unobserve = vi.fn((target: Element) => { this.targets.delete(target); });
  readonly disconnect = vi.fn(() => { this.targets.clear(); });
  constructor(private readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.push(this);
  }
  notify(target: Element) {
    if (this.targets.has(target)) this.callback([{ target } as ResizeObserverEntry], this);
  }
}

class ControlledViewport extends EventTarget {
  height = 900;
}

let viewport: ControlledViewport;
let frames: Map<number, FrameRequestCallback>;
let requestFrame: Mock<(callback: FrameRequestCallback) => number>;
let nextFrame: number;
let styles: { inset: string; gap: string; stacked: string };
let headerHeights: Record<string, number>;
let parentGeometry: { top: number; height: number };
let parentRectReads: Mock<() => void>;

beforeEach(() => {
  ControlledResizeObserver.instances = [];
  viewport = new ControlledViewport();
  frames = new Map(); nextFrame = 0;
  styles = { inset: "8px", gap: "12px", stacked: "0" };
  headerHeights = { overview: 180, mode: 60 };
  parentGeometry = { top: 480, height: 900 };
  parentRectReads = vi.fn<() => void>();
  requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { frames.delete(id); }));
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 1000);
  vi.stubGlobal("getComputedStyle", vi.fn(() => ({
    insetBlockStart: styles.inset,
    rowGap: styles.gap,
    getPropertyValue: (name: string) => name === "--knowledge-rail-stacked" ? styles.stacked : ""
  } as CSSStyleDeclaration)));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const element = this;
    if (element.hasAttribute("data-rail-parent")) {
      parentRectReads();
      return new DOMRect(0, parentGeometry.top, 1000, parentGeometry.height);
    }
    const section = element.getAttribute("data-rail-header");
    return new DOMRect(0, 0, 280, section ? headerHeights[section] ?? 0 : 0);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.scrollTop = 0;
});

function fixture(section: KnowledgeWorkspaceTabKey = "overview", withHeader = true) {
  return <main data-testid="workspace-layout" data-rail-parent>
    <input aria-label="Current section field" />
    <KnowledgeWorkspaceRail section={section}>
      {withHeader ? <section key={section} data-testid="rail-header" data-knowledge-rail-header data-rail-header={section}>Saved header</section> : null}
      <section data-testid="saved-summary" tabIndex={0}>Saved summary details</section>
    </KnowledgeWorkspaceRail>
  </main>;
}

function currentRail() {
  return screen.getByTestId("saved-summary").parentElement!;
}

function cap() {
  return currentRail().style.getPropertyValue("--knowledge-summary-max-block-size");
}

function flushFrames() {
  const scheduled = [...frames.values()];
  frames.clear();
  act(() => { for (const callback of scheduled) callback(100); });
}

describe("KnowledgeWorkspaceRail stable sizing", () => {
  it("budgets from viewport, header and sticky inset without observing or measuring the parent", () => {
    render(fixture());
    const observer = ControlledResizeObserver.instances[0]!;
    expect(cap()).toBe("668px");
    expect(observer.observe).toHaveBeenCalledExactlyOnceWith(screen.getByTestId("rail-header"));
    expect(observer.targets.has(screen.getByTestId("workspace-layout"))).toBe(false);
    expect(parentRectReads).not.toHaveBeenCalled();
    expect(currentRail()).not.toHaveClass("knowledge-workspace-rail--long");
  });

  it("cannot sustain a measurement loop when its own height changes the surrounding layout", () => {
    render(fixture());
    const observer = ControlledResizeObserver.instances[0]!;
    const parent = screen.getByTestId("workspace-layout");
    const header = screen.getByTestId("rail-header");
    const input = screen.getByRole("textbox", { name: "Current section field" });
    input.focus();
    document.documentElement.scrollTop = 640;
    const scrollWindow = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const nativeSetProperty = CSSStyleDeclaration.prototype.setProperty;
    const write = vi.spyOn(currentRail().style, "setProperty").mockImplementation(function (this: CSSStyleDeclaration, name, value, priority) {
      nativeSetProperty.call(this, name, value, priority);
      // Model the parent resizing after a summary-height write. Observing that
      // parent would schedule another measurement of the geometry just changed.
      parentGeometry.height = 180 + Number.parseFloat(value ?? "");
      observer.notify(parent);
    });

    headerHeights.overview = 220;
    act(() => observer.notify(header));
    expect(frames.size).toBe(1);
    flushFrames();
    expect(cap()).toBe("628px");
    expect(write).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    const scheduled = requestFrame.mock.calls.length;

    for (let step = 0; step < 40; step++) {
      parentGeometry.top = step % 2 ? 477 : 478;
      parentGeometry.height += step % 2 ? 320 : -8;
      act(() => observer.notify(parent));
      flushFrames();
      expect(cap()).toBe("628px");
      expect(frames.size).toBe(0);
    }
    expect(requestFrame).toHaveBeenCalledTimes(scheduled);
    expect(write).toHaveBeenCalledTimes(1);
    expect(parentRectReads).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(document.documentElement.scrollTop).toBe(640);
    expect(scrollWindow).not.toHaveBeenCalled();
  });

  it("recalculates for header, window and visual viewport changes while coalescing events", () => {
    render(fixture());
    const observer = ControlledResizeObserver.instances[0]!;
    const header = screen.getByTestId("rail-header");
    headerHeights.overview = 220;
    act(() => { observer.notify(header); observer.notify(header); observer.notify(header); });
    expect(frames.size).toBe(1);
    flushFrames();
    expect(cap()).toBe("628px");

    viewport.height = 850;
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrames();
    expect(cap()).toBe("578px");

    viewport.height = 720;
    act(() => viewport.dispatchEvent(new Event("resize")));
    flushFrames();
    expect(cap()).toBe("448px");
    expect(frames.size).toBe(0);
    expect(parentRectReads).not.toHaveBeenCalled();
  });

  it.each([
    ["0px", "675px"],
    ["7.25px", "668px"],
    ["auto", "667px"]
  ])("respects computed sticky inset %s and fractional dimensions", (inset, expected) => {
    viewport.height = 900.5;
    styles.inset = inset;
    styles.gap = "12.5px";
    headerHeights.overview = 180.25;
    render(fixture());
    expect(cap()).toBe(expected);
  });

  it("keeps an over-tall header reachable with a static rail and restores sticky sizing after it shrinks", () => {
    headerHeights.overview = 800;
    render(fixture());
    expect(cap()).toBe("540px");
    expect(currentRail()).toHaveClass("knowledge-workspace-rail--long");
    headerHeights.overview = 180;
    act(() => ControlledResizeObserver.instances[0]!.notify(screen.getByTestId("rail-header")));
    flushFrames();
    expect(cap()).toBe("668px");
    expect(currentRail()).not.toHaveClass("knowledge-workspace-rail--long");
  });

  it("uses the stacked fallback on a responsive transition without making the rail tall", () => {
    render(fixture());
    styles.stacked = "1";
    viewport.height = 600;
    headerHeights.overview = 550;
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrames();
    expect(cap()).toBe("360px");
    expect(currentRail()).not.toHaveClass("knowledge-workspace-rail--long");
    styles.stacked = "0";
    headerHeights.overview = 180;
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrames();
    expect(cap()).toBe("368px");
    expect(currentRail()).not.toHaveClass("knowledge-workspace-rail--long");
  });

  it("re-observes a replacement tab header and cancels old frames and listeners", () => {
    const windowAdd = vi.spyOn(window, "addEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const viewportAdd = vi.spyOn(viewport, "addEventListener");
    const viewportRemove = vi.spyOn(viewport, "removeEventListener");
    const view = render(fixture());
    const rail = currentRail();
    const oldHeader = screen.getByTestId("rail-header");
    const firstObserver = ControlledResizeObserver.instances[0]!;
    act(() => firstObserver.notify(oldHeader));
    expect(frames.size).toBe(1);
    view.rerender(fixture("mode"));
    expect(firstObserver.disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    const newHeader = screen.getByTestId("rail-header");
    expect(newHeader).not.toBe(oldHeader);
    const nextObserver = ControlledResizeObserver.instances[1]!;
    expect(nextObserver.observe).toHaveBeenCalledExactlyOnceWith(newHeader);
    expect(cap()).toBe("788px");
    act(() => firstObserver.notify(oldHeader));
    expect(frames.size).toBe(0);

    act(() => window.dispatchEvent(new Event("resize")));
    expect(frames.size).toBe(1);
    view.unmount();
    expect(nextObserver.disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(rail.style.getPropertyValue("--knowledge-summary-max-block-size")).toBe("");
    for (const [, listener] of windowAdd.mock.calls.filter(([name]) => name === "resize")) {
      expect(windowRemove).toHaveBeenCalledWith("resize", listener);
    }
    for (const [, listener] of viewportAdd.mock.calls.filter(([name]) => name === "resize")) {
      expect(viewportRemove).toHaveBeenCalledWith("resize", listener);
    }
    act(() => { window.dispatchEvent(new Event("resize")); viewport.dispatchEvent(new Event("resize")); nextObserver.notify(newHeader); });
    expect(frames.size).toBe(0);
  });

  it("uses the window height without a visual viewport and supports a missing header", () => {
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("innerHeight", 700);
    render(fixture("overview", false));
    expect(cap()).toBe("648px");
    expect(ControlledResizeObserver.instances[0]!.observe).not.toHaveBeenCalled();
    vi.stubGlobal("innerHeight", 600);
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrames();
    expect(cap()).toBe("548px");
  });
});
