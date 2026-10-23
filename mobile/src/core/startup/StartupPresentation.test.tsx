import { act, render } from "@testing-library/react-native";
import { StrictMode, useEffect, type ComponentProps } from "react";
import { AppState, Text, type AppStateStatus } from "react-native";

import { StartupPresentationProvider, useStartupPresentation } from "./StartupPresentation";

type Inputs = Omit<ComponentProps<typeof StartupPresentationProvider>, "children">;
type Presentation = ReturnType<typeof useStartupPresentation>;
const readyInputs: Inputs = { assetsStatus: "ready", reducedMotion: false, bypass: false };
const originalAppState = Object.getOwnPropertyDescriptor(AppState, "currentState")!;

function Probe({ onChange }: { onChange?: (presentation: Presentation) => void }) {
  const presentation = useStartupPresentation();
  useEffect(() => onChange?.(presentation), [onChange, presentation]);
  return <Text>{`${presentation.phase}:${presentation.readyForNavigation}`}</Text>;
}

function Launch({ inputs = readyInputs, childKey = "initial", onChange }: {
  inputs?: Inputs;
  childKey?: string;
  onChange?: (presentation: Presentation) => void;
}) {
  return (
    <StartupPresentationProvider {...inputs}>
      <Probe key={childKey} {...(onChange ? { onChange } : {})} />
    </StartupPresentationProvider>
  );
}

describe("launch-scoped startup presentation", () => {
  let listeners: Array<(state: AppStateStatus) => void>;
  let removals: jest.Mock[];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    listeners = [];
    removals = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
      const onChange = listener as (state: AppStateStatus) => void;
      listeners.push(onChange);
      const remove = jest.fn(() => { listeners = listeners.filter((candidate) => candidate !== onChange); });
      removals.push(remove);
      return { remove };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(AppState, "currentState", originalAppState);
    jest.useRealTimers();
  });

  async function advance(milliseconds: number) {
    await act(async () => { jest.advanceTimersByTime(milliseconds); });
  }

  async function changeAppState(state: AppStateStatus) {
    Object.defineProperty(AppState, "currentState", { configurable: true, value: state });
    await act(async () => { [...listeners].forEach((listener) => listener(state)); });
  }

  it("defaults isolated consumers to a completed presentation", async () => {
    const view = await render(<Probe />);
    expect(view.getByText("settled:true")).toBeTruthy();
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("plays a ready launch and holds navigation until the stable completion callback", async () => {
    const observations: Presentation[] = [];
    const onChange = (value: Presentation) => { observations.push(value); };
    const view = await render(<Launch onChange={onChange} />);
    expect(view.getByText("playing:false")).toBeTruthy();
    const complete = observations.at(-1)!.complete;
    await advance(3000);
    expect(view.getByText("playing:false")).toBeTruthy();
    await act(async () => { complete(); complete(); });
    expect(view.getByText("settled:true")).toBeTruthy();
    expect(observations.at(-1)!.complete).toBe(complete);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("prepares before playing without restarting either deadline when assets arrive", async () => {
    const view = await render(<Launch inputs={{ ...readyInputs, assetsStatus: "pending" }} />);
    expect(view.getByText("preparing:false")).toBeTruthy();
    await advance(999);
    await view.rerender(<Launch />);
    expect(view.getByText("playing:false")).toBeTruthy();
    await advance(3000);
    expect(view.getByText("playing:false")).toBeTruthy();
    await advance(1);
    expect(view.getByText("settled:true")).toBeTruthy();
  });

  it("can resolve an initially unknown preference during preparation", async () => {
    const view = await render(<Launch inputs={{ ...readyInputs, reducedMotion: null }} />);
    await advance(250);
    expect(view.getByText("preparing:false")).toBeTruthy();
    await view.rerender(<Launch />);
    expect(view.getByText("playing:false")).toBeTruthy();
    await advance(750);
    expect(view.getByText("playing:false")).toBeTruthy();
  });

  it("waits for the laid-out native handoff without restarting its launch deadline", async () => {
    const view = await render(<Launch inputs={{ ...readyInputs, playbackReady: false }} />);
    expect(view.getByText("preparing:false")).toBeTruthy();
    await advance(600);
    await view.rerender(<Launch inputs={{ ...readyInputs, playbackReady: true }} />);
    expect(view.getByText("playing:false")).toBeTruthy();
    await advance(3400);
    expect(view.getByText("settled:true")).toBeTruthy();
  });

  it("does not begin late if the preparation timer has not yet been dispatched", async () => {
    const view = await render(<Launch inputs={{ ...readyInputs, assetsStatus: "pending" }} />);
    jest.setSystemTime(Date.now() + 1100);
    await view.rerender(<Launch />);
    expect(view.getByText("settled:true")).toBeTruthy();
  });

  it.each([
    { name: "unknown preference", inputs: { ...readyInputs, reducedMotion: null } },
    { name: "pending assets", inputs: { ...readyInputs, assetsStatus: "pending" as const } },
    { name: "pending native handoff", inputs: { ...readyInputs, playbackReady: false } }
  ])("falls back after one second of $name and never starts late", async ({ inputs }) => {
    const view = await render(<Launch inputs={inputs} />);
    await advance(999);
    expect(view.getByText("preparing:false")).toBeTruthy();
    await advance(1);
    expect(view.getByText("settled:true")).toBeTruthy();
    await view.rerender(<Launch />);
    expect(view.getByText("settled:true")).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    { name: "reduced motion", inputs: { ...readyInputs, reducedMotion: true } },
    { name: "failed assets", inputs: { ...readyInputs, assetsStatus: "failed" as const } },
    { name: "startup error bypass", inputs: { ...readyInputs, bypass: true } }
  ])("immediately settles $name before or during playback without replay", async ({ inputs }) => {
    const staticView = await render(<Launch inputs={inputs} />);
    expect(staticView.getByText("settled:true")).toBeTruthy();
    await staticView.rerender(<Launch />);
    expect(staticView.getByText("settled:true")).toBeTruthy();
    await staticView.unmount();

    const playingView = await render(<Launch />);
    expect(playingView.getByText("playing:false")).toBeTruthy();
    await advance(450);
    await playingView.rerender(<Launch inputs={inputs} />);
    expect(playingView.getByText("settled:true")).toBeTruthy();
    await playingView.rerender(<Launch />);
    expect(playingView.getByText("settled:true")).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("settles safely if motion preference becomes unavailable during playback", async () => {
    const view = await render(<Launch />);
    await view.rerender(<Launch inputs={{ ...readyInputs, reducedMotion: null }} />);
    expect(view.getByText("settled:true")).toBeTruthy();
    await view.rerender(<Launch />);
    expect(view.getByText("settled:true")).toBeTruthy();
  });

  it("releases a missing animation callback at four seconds", async () => {
    const view = await render(<Launch />);
    await advance(3999);
    expect(view.getByText("playing:false")).toBeTruthy();
    await advance(1);
    expect(view.getByText("settled:true")).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(["background", "inactive"] as const)("does not play when mounted %s or replay on resume", async (state) => {
    Object.defineProperty(AppState, "currentState", { configurable: true, value: state });
    const view = await render(<Launch />);
    expect(view.getByText("settled:true")).toBeTruthy();
    await changeAppState("active");
    expect(view.getByText("settled:true")).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(["pending", "ready"] as const)("settles %s assets on background and never replays after resume", async (assetsStatus) => {
    const view = await render(<Launch inputs={{ ...readyInputs, assetsStatus }} />);
    await advance(200);
    await changeAppState("background");
    expect(view.getByText("settled:true")).toBeTruthy();
    await changeAppState("active");
    await view.rerender(<Launch />);
    expect(view.getByText("settled:true")).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("waits for a known active application state within the preparation deadline", async () => {
    Object.defineProperty(AppState, "currentState", { configurable: true, value: null });
    const view = await render(<Launch />);
    expect(view.getByText("preparing:false")).toBeTruthy();
    await advance(300);
    await changeAppState("active");
    expect(view.getByText("playing:false")).toBeTruthy();
  });

  it("does not begin if the application backgrounds between render and listener setup", async () => {
    jest.mocked(AppState.addEventListener).mockImplementationOnce(() => {
      Object.defineProperty(AppState, "currentState", { configurable: true, value: "background" });
      return { remove: jest.fn() };
    });
    const phases: string[] = [];
    const view = await render(<Launch onChange={({ phase }) => { phases.push(phase); }} />);
    expect(view.getByText("settled:true")).toBeTruthy();
    expect(phases).not.toContain("playing");
  });

  it("keeps the same launch state and deadline across child route remounts", async () => {
    let presentation!: Presentation;
    const onChange = (value: Presentation) => { presentation = value; };
    const view = await render(<Launch onChange={onChange} />);
    const complete = presentation.complete;
    await advance(2000);
    await view.rerender(<Launch childKey="another-route" onChange={onChange} />);
    expect(view.getByText("playing:false")).toBeTruthy();
    expect(presentation.complete).toBe(complete);
    await advance(2000);
    expect(view.getByText("settled:true")).toBeTruthy();
    await view.rerender(<Launch childKey="sign-out-loader" onChange={onChange} />);
    expect(view.getByText("settled:true")).toBeTruthy();
  });

  it("allows early idempotent completion during preparation", async () => {
    let presentation!: Presentation;
    const view = await render(<Launch inputs={{ ...readyInputs, assetsStatus: "pending" }} onChange={(value) => { presentation = value; }} />);
    await act(async () => { presentation.complete(); presentation.complete(); });
    expect(view.getByText("settled:true")).toBeTruthy();
    await view.rerender(<Launch />);
    expect(view.getByText("settled:true")).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("removes timers/listeners and ignores stale callbacks after root unmount", async () => {
    let presentation!: Presentation;
    const view = await render(<Launch onChange={(value) => { presentation = value; }} />);
    const oldComplete = presentation.complete;
    const oldListener = listeners[0]!;
    await view.unmount();
    expect(jest.getTimerCount()).toBe(0);
    expect(removals[0]).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);
    const freshView = await render(<Launch />);
    await act(async () => { oldComplete(); oldListener("background"); });
    expect(freshView.getByText("playing:false")).toBeTruthy();
    expect(listeners).toHaveLength(1);
    await freshView.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("survives Strict Mode effect replay without settling or duplicating deadlines", async () => {
    const view = await render(<StrictMode><Launch /></StrictMode>);
    expect(view.getByText("playing:false")).toBeTruthy();
    expect(AppState.addEventListener).toHaveBeenCalledTimes(2);
    expect(listeners).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(2);
    await advance(3999);
    expect(view.getByText("playing:false")).toBeTruthy();
    await advance(1);
    expect(view.getByText("settled:true")).toBeTruthy();
    await view.unmount();
    expect(listeners).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});
