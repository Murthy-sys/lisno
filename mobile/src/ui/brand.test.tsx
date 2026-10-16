import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, type EmitterSubscription } from "react-native";

import { BrandLoader, StartupBrand } from "./brand";
import { colors } from "./tokens";

describe("Lisno startup branding", () => {
  afterEach(() => jest.restoreAllMocks());

  it("exposes one meaningful loading announcement", async () => {
    const view = await render(<StartupBrand message="Restoring your workspace" reducedMotion />);
    expect(view.getByRole("progressbar", { name: "Restoring your workspace" })).toBeTruthy();
    expect(view.getAllByRole("progressbar")).toHaveLength(1);
    expect(view.getByTestId("startup-brand")).toHaveStyle({ backgroundColor: colors.shell });
    expect(view.queryByTestId("startup-artwork")).toBeNull();
    expect(view.getByTestId("startup-artwork", { includeHiddenElements: true }).props)
      .toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
  });

  it("supports a static reduced-motion loader", async () => {
    const view = await render(<BrandLoader label="Loading projects" reducedMotion tone="dark" />);
    expect(view.getByRole("progressbar", { name: "Loading projects" })).toBeTruthy();
  });

  it("keeps the complete illustration still until the motion preference is known", async () => {
    let resolvePreference!: (value: boolean) => void;
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(
      new Promise((resolve) => { resolvePreference = resolve; })
    );
    const timing = jest.spyOn(Animated, "timing");
    const view = await render(<StartupBrand />);

    expect(timing).not.toHaveBeenCalled();
    expect(view.getByTestId("startup-motif-interior", { includeHiddenElements: true })).toHaveStyle({ opacity: 1 });
    await act(async () => resolvePreference(true));
    expect(timing).not.toHaveBeenCalled();
  });

  it("falls back to the static artwork when the accessibility lookup fails", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockRejectedValue(new Error("Unavailable"));
    const timing = jest.spyOn(Animated, "timing");
    const view = await render(<StartupBrand />);

    await waitFor(() => expect(view.getByTestId("startup-motif-tools", { includeHiddenElements: true })).toHaveStyle({ opacity: 1 }));
    expect(timing).not.toHaveBeenCalled();
    expect(view.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("cancels the entrance when reduced motion is enabled and never replays it", async () => {
    const stop = jest.fn();
    const start = jest.fn();
    const parallel = jest.spyOn(Animated, "parallel").mockReturnValue({ start, stop, reset: jest.fn() });
    const view = await render(<StartupBrand reducedMotion={false} />);
    expect(start).toHaveBeenCalledTimes(1);

    await view.rerender(<StartupBrand reducedMotion />);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("startup-motif-plan", { includeHiddenElements: true })).toHaveStyle({ opacity: 1 });

    await view.rerender(<StartupBrand reducedMotion={false} message="Restoring your workspace" />);
    expect(parallel).toHaveBeenCalledTimes(1);
    expect(view.getByRole("progressbar", { name: "Restoring your workspace" })).toBeTruthy();
  });

  it("stops active motion and removes the system listener on unmount", async () => {
    const stop = jest.fn();
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove } as unknown as EmitterSubscription);
    jest.spyOn(Animated, "parallel").mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() });
    const view = await render(<StartupBrand />);

    await view.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it.each([
    { width: 320, height: 568, expectedSize: 272 },
    { width: 640, height: 360, expectedSize: 270 }
  ])("fits the artwork within a $width × $height startup area", async ({ width, height, expectedSize }) => {
    const view = await render(<StartupBrand reducedMotion />);
    await fireEvent(view.getByRole("progressbar"), "layout", { nativeEvent: { layout: { height: 22 } } });
    await fireEvent(view.getByTestId("startup-brand"), "layout", { nativeEvent: { layout: { width, height } } });
    expect(view.getByTestId("startup-artwork", { includeHiddenElements: true })).toHaveStyle({ width: expectedSize, height: expectedSize });
  });
});
