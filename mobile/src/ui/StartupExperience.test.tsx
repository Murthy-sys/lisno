import { act, fireEvent, render, within } from "@testing-library/react-native";
import { Asset } from "expo-asset";
import * as SplashScreen from "expo-splash-screen";
import { StrictMode } from "react";
import { Animated, AppState, Text } from "react-native";

import StartupRouter from "../app/index";
import { useRuntime } from "../runtime/RuntimeProvider";
import { StartupExperience, useStartupAssets } from "./StartupExperience";
import { startupAssetModules } from "./startupAssets";

jest.mock("expo-asset", () => ({ Asset: { loadAsync: jest.fn() } }));
jest.mock("expo-splash-screen", () => ({ hideAsync: jest.fn(async () => undefined), hide: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: jest.requireActual("react-native").View }));
jest.mock("../runtime/RuntimeProvider", () => ({ useRuntime: jest.fn() }));
jest.mock("../core/onboarding", () => ({ useOnboardingCompletion: jest.fn(() => true) }));
jest.mock("../navigation/registry", () => ({ landingDestination: jest.fn(() => ({ id: "projects" })) }));
jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native");
  return { Redirect: ({ href }: { href: string }) => <Text>{href}</Text> };
});

const originalAppState = Object.getOwnPropertyDescriptor(AppState, "currentState")!;
const runtimeMock = jest.mocked(useRuntime);
const hidden = { includeHiddenElements: true };

function runtime(overrides = {}) {
  return {
    configured: true,
    booted: true,
    initializationError: null,
    session: { status: "authenticated", session: { user: { role: "admin" }, authorization: { permissions: [] } } },
    ...overrides
  } as unknown as ReturnType<typeof useRuntime>;
}

function AssetProbe() {
  const status = useStartupAssets();
  return <Text>{status}</Text>;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function layout(view: Awaited<ReturnType<typeof render>>, width = 390, height = 844) {
  await fireEvent(view.getByTestId("startup-experience"), "layout", { nativeEvent: { layout: { width, height } } });
}

function overlay(view: Awaited<ReturnType<typeof render>>) {
  return within(view.getByTestId("startup-launch-overlay"));
}

describe("cold launch presentation integration", () => {
  let finished: (result: { finished: boolean }) => void;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.mocked(SplashScreen.hideAsync).mockResolvedValue(undefined);
    jest.mocked(SplashScreen.hide).mockImplementation(() => undefined);
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    runtimeMock.mockReturnValue(runtime());
    jest.spyOn(Animated, "timing").mockReturnValue({
      start: (callback) => { finished = callback!; }, stop: jest.fn(), reset: jest.fn()
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    Object.defineProperty(AppState, "currentState", originalAppState);
  });

  it("holds a fast ready destination for the full introduction and hides the native splash after layout", async () => {
    const view = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    expect(view.queryByText("/feature/projects", hidden)).toBeNull();
    expect(view.getAllByRole("progressbar")).toHaveLength(1);
    expect(view.getByTestId("startup-route-content", hidden).props).toMatchObject({ pointerEvents: "none", "aria-hidden": true });
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(overlay(view).queryByTestId("startup-symbol", hidden)).toBeNull();
    await layout(view);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 3000, useNativeDriver: true }));
    await act(async () => { jest.advanceTimersByTime(2800); });
    expect(view.queryByText("/feature/projects", hidden)).toBeNull();
    await act(async () => { finished({ finished: true }); });
    expect(view.getByText("/feature/projects")).toBeTruthy();
    expect(view.queryByTestId("startup-launch-overlay")).toBeNull();
    expect(view.getByTestId("startup-route-content").props).toMatchObject({ pointerEvents: "auto", "aria-hidden": false });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps a slow restoration pending after playback and never replays on a later route mount", async () => {
    runtimeMock.mockReturnValue(runtime({ booted: false, session: { status: "restoring", session: null } }));
    const view = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    await layout(view);
    await act(async () => { finished({ finished: true }); });
    expect(view.getByRole("progressbar")).toBeTruthy();
    expect(view.queryByTestId("startup-launch-overlay")).toBeNull();
    expect(view.queryByTestId("startup-image-interior", hidden)).toBeNull();
    runtimeMock.mockReturnValue(runtime());
    await view.rerender(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter key="remounted-route" /></StartupExperience>);
    expect(view.getByText("/feature/projects")).toBeTruthy();
    expect(Animated.timing).toHaveBeenCalledTimes(1);
  });

  it("releases the root even if the native animation completion callback never arrives", async () => {
    const view = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    await layout(view);
    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(view.getByText("/feature/projects")).toBeTruthy();
    expect(view.queryByTestId("startup-launch-overlay")).toBeNull();
  });

  it.each(["transient_error", "initialization"])("allows %s recovery immediately during the introduction", async (failure) => {
    const view = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    await layout(view);
    runtimeMock.mockReturnValue(runtime(failure === "initialization"
      ? { booted: false, initializationError: "Startup failed" }
      : { session: { status: "transient_error", session: null } }));
    await view.rerender(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    expect(view.getByText("/startup-recovery")).toBeTruthy();
    expect(view.queryByTestId("startup-launch-overlay")).toBeNull();
  });

  it("shows configuration errors without waiting for artwork", async () => {
    runtimeMock.mockReturnValue({ configured: false, message: "Backend unavailable" });
    const view = await render(<StartupExperience assetsStatus="pending" reducedMotion={false}><StartupRouter /></StartupExperience>);
    expect(view.getByText("Backend setup required")).toBeTruthy();
    expect(view.queryByTestId("startup-launch-overlay")).toBeNull();
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    await layout(view);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it.each([
    { assetsStatus: "failed" as const, reducedMotion: false },
    { assetsStatus: "ready" as const, reducedMotion: true }
  ])("bypasses artificial waiting for $assetsStatus assets and reducedMotion=$reducedMotion", async (props) => {
    const view = await render(<StartupExperience {...props}><StartupRouter /></StartupExperience>);
    expect(view.getByText("/feature/projects")).toBeTruthy();
    expect(view.queryByTestId("startup-launch-overlay")).toBeNull();
    expect(Animated.timing).not.toHaveBeenCalled();
    await layout(view);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it("waits for a prepared frame before native handoff, then falls back within one second", async () => {
    const view = await render(<StartupExperience assetsStatus="pending" reducedMotion={null}><StartupRouter /></StartupExperience>);
    await layout(view);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(view.getByText("/feature/projects")).toBeTruthy();
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it("keeps an unbranded olive surface until nonzero layout and native handoff, then starts at frame zero", async () => {
    const hide = deferred();
    jest.mocked(SplashScreen.hideAsync).mockReturnValue(hide.promise);
    const view = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    await layout(view, 0, 844);
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(overlay(view).queryByTestId("startup-brand", hidden)).toBeNull();
    expect(view.getByTestId("startup-launch-overlay")).toHaveStyle({ backgroundColor: "#46552F" });
    await layout(view);
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(Animated.timing).not.toHaveBeenCalled();
    await act(async () => { hide.resolve(); });
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 3000 }));
    expect(overlay(view).getByTestId("startup-symbol", hidden)).toHaveStyle({ opacity: 0 });
    expect(overlay(view).getByTestId("startup-motif-interior", hidden)).toHaveStyle({ opacity: 1 });
    expect(view.getAllByRole("progressbar")).toHaveLength(1);
    await layout(view, 844, 390);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(Animated.timing).toHaveBeenCalledTimes(1);
  });

  it("waits for artwork and preference preparation after layout without showing a completed logo", async () => {
    const view = await render(<StartupExperience assetsStatus="pending" reducedMotion={null}><StartupRouter /></StartupExperience>);
    await layout(view);
    await act(async () => { jest.advanceTimersByTime(400); });
    await view.rerender(<StartupExperience assetsStatus="ready" reducedMotion={null}><StartupRouter /></StartupExperience>);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    expect(overlay(view).queryByTestId("startup-brand", hidden)).toBeNull();
    await view.rerender(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    expect(overlay(view).getByTestId("startup-symbol", hidden)).toHaveStyle({ opacity: 0 });
  });

  it("settles a rejected native request with one synchronous dismissal fallback and no covered intro", async () => {
    jest.mocked(SplashScreen.hideAsync).mockRejectedValue(new Error("Native splash unavailable"));
    const view = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    await layout(view);
    expect(view.getByText("/feature/projects")).toBeTruthy();
    expect(view.queryByTestId("startup-launch-overlay")).toBeNull();
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    await layout(view);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
  });

  it.each(["missing layout", "pending hide"])("bounds %s and ignores a late handoff", async (delay) => {
    const hide = deferred();
    jest.mocked(SplashScreen.hideAsync).mockReturnValue(hide.promise);
    const view = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    if (delay === "pending hide") await layout(view);
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(view.getByText("/feature/projects")).toBeTruthy();
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(SplashScreen.hide).toHaveBeenCalledTimes(delay === "pending hide" ? 1 : 0);
    await layout(view);
    await act(async () => { hide.resolve(); });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it("contains both native API failures without repeated calls or blocking React navigation", async () => {
    jest.mocked(SplashScreen.hideAsync).mockRejectedValue(new Error("Native splash unavailable"));
    jest.mocked(SplashScreen.hide).mockImplementation(() => { throw new Error("Native splash unavailable"); });
    const view = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    await layout(view);
    expect(view.getByText("/feature/projects")).toBeTruthy();
    await layout(view);
    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)("ignores an old native %s after unmount while a fresh launch is preparing", async (outcome) => {
    const oldHide = deferred();
    jest.mocked(SplashScreen.hideAsync).mockReturnValueOnce(oldHide.promise);
    const oldView = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    await layout(oldView);
    await oldView.unmount();
    const freshView = await render(<StartupExperience assetsStatus="ready" reducedMotion={false}><StartupRouter /></StartupExperience>);
    await act(async () => {
      if (outcome === "resolve") oldHide.resolve();
      else oldHide.reject(new Error("Old native request failed"));
    });
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    expect(overlay(freshView).queryByTestId("startup-brand", hidden)).toBeNull();
    await layout(freshView);
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(2);
  });

  it("keeps one native request through Strict Mode and effect reattachment without consuming the intro", async () => {
    const hide = deferred();
    jest.mocked(SplashScreen.hideAsync).mockReturnValue(hide.promise);
    const launch = (reducedMotion: boolean | null) => (
      <StrictMode><StartupExperience assetsStatus="ready" reducedMotion={reducedMotion}><StartupRouter /></StartupExperience></StrictMode>
    );
    const view = await render(launch(false));
    await layout(view);
    await view.rerender(launch(null));
    await view.rerender(launch(false));
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    await act(async () => { hide.resolve(); });
    expect(view.queryByText("/feature/projects", hidden)).toBeNull();
    expect(overlay(view).getByTestId("startup-symbol", hidden)).toHaveStyle({ opacity: 0 });
    await act(async () => { finished({ finished: true }); });
    expect(view.getByText("/feature/projects")).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it("reports bundled artwork preparation success and failure without remote fallbacks", async () => {
    jest.mocked(Asset.loadAsync).mockResolvedValue([]);
    const ready = await render(<AssetProbe />);
    expect(ready.getByText("ready")).toBeTruthy();
    expect(Asset.loadAsync).toHaveBeenCalledWith(startupAssetModules);
    await ready.unmount();
    jest.mocked(Asset.loadAsync).mockRejectedValue(new Error("Local asset unavailable"));
    const failed = await render(<AssetProbe />);
    expect(failed.getByText("failed")).toBeTruthy();
  });
});
