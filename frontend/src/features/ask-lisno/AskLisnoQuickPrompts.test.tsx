import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskLisnoQuickPrompts } from "./AskLisnoQuickPrompts";

function setDimensions(viewport: HTMLElement, width: number, content: number) {
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: width },
    scrollWidth: { configurable: true, value: content }
  });
  fireEvent(window, new Event("resize"));
}

afterEach(() => vi.unstubAllGlobals());

describe("Ask Lisno quick prompts", () => {
  it("dispatches the existing messages without sending on mount", async () => {
    const onSelect = vi.fn();
    render(<AskLisnoQuickPrompts disabled={false} onSelect={onSelect} />);
    expect(screen.getByRole("group", { name: "Suggested questions" })).toBeVisible();
    expect(onSelect).not.toHaveBeenCalled();
    for (const label of ["Show my projects", "Project progress", "Timeline", "Add to estimate"]) {
      await userEvent.click(screen.getByRole("button", { name: label }));
    }
    expect(onSelect.mock.calls).toEqual([["Show my projects"], ["Project progress"], ["Expected timeline"], ["Add something to my estimate"]]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("disables every prompt and overflow action while the parent is busy or unverified", async () => {
    const onSelect = vi.fn();
    const { container } = render(<AskLisnoQuickPrompts disabled onSelect={onSelect} />);
    setDimensions(container.querySelector<HTMLElement>(".ask-lisno-quick-prompts__viewport")!, 200, 800);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows a next control only while content remains ahead and preserves focus at the end", async () => {
    const { container } = render(<AskLisnoQuickPrompts disabled={false} onSelect={vi.fn()} />);
    const viewport = container.querySelector<HTMLElement>(".ask-lisno-quick-prompts__viewport")!;
    setDimensions(viewport, 240, 240);
    expect(screen.queryByRole("button", { name: "Show more suggested questions" })).not.toBeInTheDocument();
    setDimensions(viewport, 240, 700);
    await userEvent.click(screen.getByRole("button", { name: "Show more suggested questions" }));
    expect(viewport.scrollLeft).toBe(192);
    await userEvent.click(screen.getByRole("button", { name: "Show more suggested questions" }));
    expect(viewport.scrollLeft).toBe(384);
    await userEvent.click(screen.getByRole("button", { name: "Show more suggested questions" }));
    expect(viewport.scrollLeft).toBe(460);
    expect(screen.queryByRole("button", { name: "Show more suggested questions" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to estimate" })).toHaveFocus();
    viewport.scrollLeft = 20; fireEvent.scroll(viewport);
    expect(screen.getByRole("button", { name: "Show more suggested questions" })).toBeVisible();
  });

  it("reveals keyboard-focused chips with the nearest horizontal movement and activates them natively", async () => {
    const onSelect = vi.fn();
    const { container } = render(<AskLisnoQuickPrompts disabled={false} onSelect={onSelect} />);
    const viewport = container.querySelector<HTMLElement>(".ask-lisno-quick-prompts__viewport")!;
    setDimensions(viewport, 240, 700);
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ left: 100, right: 340 } as DOMRect);
    const last = screen.getByRole("button", { name: "Add to estimate" });
    vi.spyOn(last, "getBoundingClientRect").mockReturnValue({ left: 610, right: 800 } as DOMRect);
    act(() => last.focus());
    expect(viewport.scrollLeft).toBe(460);
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("Add something to my estimate");
    const first = screen.getByRole("button", { name: "Show my projects" });
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue({ left: -360, right: -190 } as DOMRect);
    act(() => first.focus());
    expect(viewport.scrollLeft).toBe(0);
    expect(first).toHaveFocus();
  });

  it("remeasures both strip and content size and cleans up its observation and listeners", () => {
    let resized!: ResizeObserverCallback;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resized = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const { container, unmount } = render(<AskLisnoQuickPrompts disabled={false} onSelect={vi.fn()} />);
    const viewport = container.querySelector<HTMLElement>(".ask-lisno-quick-prompts__viewport")!;
    const list = container.querySelector<HTMLElement>(".ask-lisno-quick-prompts__list")!;
    const removeScrollListener = vi.spyOn(viewport, "removeEventListener");
    expect(observe).toHaveBeenCalledWith(viewport);
    expect(observe).toHaveBeenCalledWith(list);
    Object.defineProperties(viewport, { clientWidth: { configurable: true, value: 240 }, scrollWidth: { configurable: true, value: 700 } });
    act(() => resized([], {} as ResizeObserver));
    expect(screen.getByRole("button", { name: "Show more suggested questions" })).toBeVisible();
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 800 });
    act(() => resized([], {} as ResizeObserver));
    expect(screen.queryByRole("button", { name: "Show more suggested questions" })).not.toBeInTheDocument();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeWindowListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeScrollListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
