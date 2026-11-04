import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateBuilderArea } from "./EstimateBuilderArea";

const geometry = { documentTop: 200, footerHeight: 48 };
let frameId = 0;
let frames: Map<number, FrameRequestCallback>;
let observers: ObservedResize[];
let viewport: EventTarget & { height: number; offsetTop: number };

class ObservedResize {
  elements = new Set<Element>();
  disconnect = vi.fn(() => this.elements.clear());
  constructor(readonly callback: ResizeObserverCallback) { observers.push(this); }
  observe(element: Element) { this.elements.add(element); }
  unobserve(element: Element) { this.elements.delete(element); }
}

function flushFrames() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}

function resize(element: Element) {
  for (const observer of observers) {
    if (observer.elements.has(element)) observer.callback([{ target: element } as ResizeObserverEntry], observer as unknown as ResizeObserver);
  }
  flushFrames();
}

function EditableItem() {
  const [quantity, setQuantity] = useState("2");
  return <input aria-label="Item quantity" value={quantity} onChange={event => setQuantity(event.target.value)} />;
}

function Fixture({ nested = false, documentFlow = false }: { nested?: boolean; documentFlow?: boolean }) {
  const workspace = <section className="estimate-workspace" style={{ rowGap: 8, paddingBottom: nested ? 8 : 0, borderBottom: nested ? "1px solid" : 0 }}>
    <header>Estimate controls</header>
    <EstimateBuilderArea documentFlow={documentFlow}><EditableItem /></EstimateBuilderArea>
    <footer className="estimate-workspace__footer">Save estimate</footer>
  </section>;
  return <div className="ui-common-shell">
    <header className="workspace-topbar">Workspace controls</header>
    <main className="ui-workspace" style={{ paddingBottom: 12 }}>
      {nested ? <section className="project-quotation-workspace"><header className="ui-page-header">Project estimate</header>{workspace}<section>Published estimate review</section></section> : workspace}
    </main>
  </div>;
}

beforeEach(() => {
  geometry.documentTop = 200;
  geometry.footerHeight = 48;
  frames = new Map();
  observers = [];
  viewport = Object.assign(new EventTarget(), { height: 900, offsetTop: 0 });
  vi.stubGlobal("ResizeObserver", ObservedResize);
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("scrollY", 0);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { const id = ++frameId; frames.set(id, callback); return id; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("estimate-workspace__builder-area")) return { top: geometry.documentTop - window.scrollY } as DOMRect;
    if (this.classList.contains("estimate-workspace__footer")) return { height: geometry.footerHeight } as DOMRect;
    return {} as DOMRect;
  });
});

describe("EstimateBuilderArea viewport allocation", () => {
  it("switches to document scrolling without remounting content or retaining a bounded height", () => {
    const { container, rerender } = render(<Fixture />);
    const area = container.querySelector<HTMLElement>(".estimate-workspace__builder-area")!;
    const input = screen.getByRole("textbox", { name: "Item quantity" });
    fireEvent.change(input, { target: { value: "7" } });
    input.focus();
    rerender(<Fixture documentFlow />);
    expect(area).not.toHaveClass("estimate-workspace__builder-area");
    expect(area.style.getPropertyValue("--estimate-builder-height")).toBe("");
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
    expect(input).toHaveFocus();
    expect(input).toHaveValue("7");
    rerender(<Fixture />);
    expect(area).toHaveClass("estimate-workspace__builder-area");
    expect(area.style.getPropertyValue("--estimate-builder-height")).toBe("632px");
    expect(screen.getByRole("textbox", { name: "Item quantity" })).toBe(input);
  });
  it.each([{ nested: false, height: "632px" }, { nested: true, height: "623px" }])(
    "keeps the editor allocation stable when its page scrolls (nested=$nested)", ({ nested, height }) => {
      const { container } = render(<Fixture nested={nested} />);
      const area = container.querySelector<HTMLElement>(".estimate-workspace__builder-area")!;
      const input = screen.getByRole("textbox", { name: "Item quantity" });
      input.focus();
      fireEvent.change(input, { target: { value: "5" } });
      expect(area.style.getPropertyValue("--estimate-builder-height")).toBe(height);

      for (const scroll of [173, 500, 0]) {
        vi.stubGlobal("scrollY", scroll);
        fireEvent.scroll(window);
        flushFrames();
        expect(area.style.getPropertyValue("--estimate-builder-height")).toBe(height);
      }
      expect(screen.getByRole("textbox", { name: "Item quantity" })).toBe(input);
      expect(input).toHaveValue("5");
      expect(input).toHaveFocus();
    }
  );

  it("reallocates space when the toolbar or enclosing page header wraps without a viewport resize", () => {
    const { container } = render(<Fixture nested />);
    const area = container.querySelector<HTMLElement>(".estimate-workspace__builder-area")!;
    expect(area.style.getPropertyValue("--estimate-builder-height")).toBe("623px");

    geometry.documentTop += 56;
    resize(container.querySelector(".workspace-topbar")!);
    expect(area.style.getPropertyValue("--estimate-builder-height")).toBe("567px");

    geometry.documentTop += 32;
    resize(container.querySelector(".ui-page-header")!);
    expect(area.style.getPropertyValue("--estimate-builder-height")).toBe("535px");

    geometry.footerHeight += 44;
    resize(container.querySelector(".estimate-workspace__footer")!);
    expect(area.style.getPropertyValue("--estimate-builder-height")).toBe("491px");
  });

  it("responds to the mobile visual viewport and cleans up observers, listeners and pending frames", () => {
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const removeViewportListener = vi.spyOn(viewport, "removeEventListener");
    const { container, unmount } = render(<Fixture nested />);
    const area = container.querySelector<HTMLElement>(".estimate-workspace__builder-area")!;
    viewport.height = 700;
    viewport.offsetTop = 40;
    viewport.dispatchEvent(new Event("resize"));
    flushFrames();
    expect(area.style.getPropertyValue("--estimate-builder-height")).toBe("463px");
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event("scroll"));
    flushFrames();
    expect(area.style.getPropertyValue("--estimate-builder-height")).toBe("423px");

    fireEvent.resize(window);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
    expect(removeWindowListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeViewportListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeViewportListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
