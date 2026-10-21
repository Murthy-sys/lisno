import { act, fireEvent, render } from "@testing-library/react-native";
import { StrictMode } from "react";
import { Animated, StyleSheet } from "react-native";

import { BrandLoader, StartupBrand } from "./brand";
import { StartupMotionContext } from "./StartupMotion";
import { startupTheme } from "./startupTheme.js";

const hidden = { includeHiddenElements: true };

function mockTimeline() {
  const callbacks: Array<(result: { finished: boolean }) => void> = [];
  const stop = jest.fn();
  const start = jest.fn((callback?: (result: { finished: boolean }) => void) => { if (callback) callbacks.push(callback); });
  const timing = jest.spyOn(Animated, "timing").mockReturnValue({ start, stop, reset: jest.fn() });
  return { stop, start, timing, callbacks };
}

describe("Lisno startup branding", () => {
  afterEach(() => jest.restoreAllMocks());

  it("exposes one loading announcement and keeps ordinary startup loaders static", async () => {
    const { timing } = mockTimeline();
    const view = await render(<StartupBrand message="Restoring your workspace" reducedMotion={false} />);
    expect(view.getAllByRole("progressbar")).toHaveLength(1);
    expect(view.getByRole("progressbar", { name: "Restoring your workspace" })).toBeTruthy();
    expect(view.getByTestId("startup-brand")).toHaveStyle({ backgroundColor: startupTheme.background });
    expect(view.queryByTestId("startup-artwork")).toBeNull();
    expect(view.getByTestId("startup-artwork", hidden).props)
      .toMatchObject({ "aria-hidden": true, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
    expect(view.getByTestId("startup-symbol", hidden)).toHaveStyle({ opacity: 1 });
    expect(view.getByTestId("startup-letter-O", hidden)).toHaveStyle({ opacity: 1 });
    expect(view.queryByTestId("startup-motif-interior", hidden)).toBeNull();
    expect(timing).not.toHaveBeenCalled();
  });

  it("preserves the ordinary BrandLoader", async () => {
    const view = await render(<BrandLoader label="Loading projects" reducedMotion tone="dark" />);
    expect(view.getByRole("progressbar", { name: "Loading projects" })).toBeTruthy();
  });

  it("plays only the explicitly requested root introduction with native-driven motion", async () => {
    const { timing, start } = mockTimeline();
    const view = await render(<StartupMotionContext.Provider value={false}><StartupBrand play /></StartupMotionContext.Provider>);
    expect(start).toHaveBeenCalledTimes(1);
    expect(timing).toHaveBeenCalledWith(expect.any(Animated.Value), expect.objectContaining({
      useNativeDriver: true, isInteraction: false, duration: 3000
    }));
    expect(view.getByTestId("startup-motif-interior", hidden)).toHaveStyle({ opacity: 1 });
    expect(view.getByTestId("startup-motif-materials", hidden)).toHaveStyle({ opacity: 1 });
    expect(view.getByTestId("startup-symbol", hidden)).toHaveStyle({ opacity: 0 });
    expect(view.getByTestId("startup-letter-L", hidden)).toHaveStyle({ opacity: 0 });
  });

  it("does not hide a completed wordmark when an unknown preference later resolves", async () => {
    const { timing } = mockTimeline();
    const view = await render(<StartupMotionContext.Provider value={null}><StartupBrand play /></StartupMotionContext.Provider>);
    expect(view.getByTestId("startup-symbol", hidden)).toHaveStyle({ opacity: 1 });
    await view.rerender(<StartupMotionContext.Provider value={false}><StartupBrand play /></StartupMotionContext.Provider>);
    expect(timing).not.toHaveBeenCalled();
    expect(view.getByTestId("startup-letter-L", hidden)).toHaveStyle({ opacity: 1 });
  });

  it.each([[320, 568], [390, 844], [640, 360]])("keeps emerging letters outside the original symbol at %i × %i", async (width, height) => {
    const { timing } = mockTimeline();
    const view = await render(<StartupBrand play reducedMotion={false} />);
    await fireEvent(view.getByTestId("startup-brand"), "layout", { nativeEvent: { layout: { width, height } } });
    const clock = timing.mock.calls[0]![0] as Animated.Value;
    await act(async () => { clock.setValue(2400); });

    const symbol = StyleSheet.flatten(view.getByTestId("startup-symbol", hidden).props.style);
    const reveal = StyleSheet.flatten(view.getByTestId("startup-letter-window", hidden).props.style);
    const symbolLeft = symbol.left + symbol.transform[0].translateX;
    expect(reveal.overflow).toBe("hidden");
    expect(reveal.left + reveal.width).toBeCloseTo(symbolLeft, 5);
    const emergingLetter = StyleSheet.flatten(view.getByTestId("startup-letter-N", hidden).props.style);
    expect(emergingLetter.opacity).toBeGreaterThan(0);
    expect(emergingLetter.opacity).toBeLessThan(1);
  });

  it("settles on reduced motion and never replays on later preference/message changes", async () => {
    const { timing, start, stop } = mockTimeline();
    const view = await render(<StartupBrand play reducedMotion={false} />);
    expect(start).toHaveBeenCalledTimes(1);
    await view.rerender(<StartupBrand play reducedMotion />);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("startup-symbol", hidden)).toHaveStyle({ opacity: 1 });
    expect(view.queryByTestId("startup-motif-plan", hidden)).toBeNull();
    await view.rerender(<StartupBrand play reducedMotion={false} message="Restoring your workspace" />);
    expect(timing).toHaveBeenCalledTimes(1);
    expect(view.getByRole("progressbar", { name: "Restoring your workspace" })).toBeTruthy();
  });

  it("reports natural completion once using the current callback without restarting", async () => {
    const { timing, callbacks } = mockTimeline();
    const first = jest.fn();
    const latest = jest.fn();
    const view = await render(<StartupBrand play reducedMotion={false} onComplete={first} />);
    await view.rerender(<StartupBrand play reducedMotion={false} onComplete={latest} />);
    await act(async () => { callbacks[0]!({ finished: false }); });
    expect(latest).not.toHaveBeenCalled();
    await act(async () => { callbacks[0]!({ finished: true }); callbacks[0]!({ finished: true }); });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(timing).toHaveBeenCalledTimes(1);
  });

  it("stops on unmount and ignores a stale native callback", async () => {
    const { callbacks, stop } = mockTimeline();
    const complete = jest.fn();
    const view = await render(<StartupBrand play reducedMotion={false} onComplete={complete} />);
    await view.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => { callbacks[0]!({ finished: true }); });
    expect(complete).not.toHaveBeenCalled();
  });

  it("survives Strict Mode effect replay without prematurely settling", async () => {
    const { callbacks, stop, timing } = mockTimeline();
    const complete = jest.fn();
    const view = await render(<StrictMode><StartupBrand play reducedMotion={false} onComplete={complete} /></StrictMode>);
    expect(timing).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("startup-symbol", hidden)).toHaveStyle({ opacity: 0 });
    await act(async () => { callbacks[0]!({ finished: true }); });
    expect(complete).not.toHaveBeenCalled();
    await act(async () => { callbacks[1]!({ finished: true }); });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it.each([
    { width: 320, height: 568, messageHeight: 26 },
    { width: 390, height: 844, messageHeight: 26 },
    { width: 640, height: 360, messageHeight: 26 },
    { width: 320, height: 360, messageHeight: 104 }
  ])("fits $width × $height with measured message height $messageHeight without restarting", async ({ width, height, messageHeight }) => {
    const { timing } = mockTimeline();
    const view = await render(<StartupBrand play reducedMotion={false} />);
    await fireEvent(view.getByRole("progressbar"), "layout", { nativeEvent: { layout: { height: messageHeight } } });
    await fireEvent(view.getByTestId("startup-brand"), "layout", { nativeEvent: { layout: { width, height } } });
    const artwork = view.getByTestId("startup-artwork", hidden).props.style;
    expect(artwork.width).toBeLessThanOrEqual(width - 24);
    expect(artwork.height + messageHeight + 64).toBeLessThanOrEqual(height);
    expect(timing).toHaveBeenCalledTimes(1);
  });
});
