import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MapViewport, screenPointToDocumentPoint } from "./MapViewport";

beforeEach(() => vi.stubGlobal("PointerEvent", MouseEvent));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("MapViewport", () => {
  it("offers map-style focal zoom controls without a pan mode", async () => {
    const user = userEvent.setup();
    render(<MapViewport ariaLabel="Plan page">{(view) => <div data-testid="view">{JSON.stringify(view)}</div>}</MapViewport>);
    const surface = screen.getByTestId("map-viewport-surface");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });

    expect(screen.queryByRole("button", { name: /pan/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByTestId("view")).toHaveTextContent('"scale":1.25');
    fireEvent.wheel(surface, { deltaY: -100, clientX: 200, clientY: 150 });
    expect(screen.getByTestId("view").textContent).toContain('"scale":1.5');
    fireEvent.doubleClick(surface, { clientX: 400, clientY: 300 });
    expect(screen.getByTestId("view").textContent).toContain('"scale":2');
    await user.click(screen.getByRole("button", { name: "Reset view" }));
    expect(screen.getByTestId("view")).toHaveTextContent('{"scale":1,"translateX":0,"translateY":0}');
    expect(screen.getByRole("status")).toHaveTextContent("100% zoom");
  });

  it("drags the empty surface and converts screen points through the inverse transform", () => {
    render(<MapViewport ariaLabel="Plan page">{(view) => <div data-testid="view">{JSON.stringify(view)}</div>}</MapViewport>);
    const surface = screen.getByTestId("map-viewport-surface");
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 60, clientY: 80 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 60, clientY: 80 });
    expect(screen.getByTestId("view")).toHaveTextContent('"translateX":50');
    expect(screen.getByTestId("view")).toHaveTextContent('"translateY":60');
    expect(screenPointToDocumentPoint({ x: 250, y: 160 }, { scale: 2, translateX: 50, translateY: 60 })).toEqual({ x: 100, y: 50 });
  });

  it("clamps scale between 0.5 and 8", () => {
    render(<MapViewport ariaLabel="Plan page">{(view) => <div data-testid="view">{view.scale}</div>}</MapViewport>);
    const surface = screen.getByTestId("map-viewport-surface");
    for (let index = 0; index < 40; index += 1) fireEvent.wheel(surface, { deltaY: -100, clientX: 0, clientY: 0 });
    expect(screen.getByTestId("view")).toHaveTextContent("8");
    for (let index = 0; index < 40; index += 1) fireEvent.wheel(surface, { deltaY: 100, clientX: 0, clientY: 0 });
    expect(screen.getByTestId("view")).toHaveTextContent("0.5");
  });
});
