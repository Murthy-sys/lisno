import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Dimensions,
  type EmitterSubscription,
  type HardwareBackPressEvent
} from "react-native";

import { OnboardingScreen } from "./OnboardingScreen";

describe("OnboardingScreen", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders all three distinct depth scenes and only exposes the active slide to accessibility", async () => {
    const view = await render(<OnboardingScreen onComplete={jest.fn()} reducedMotion />);

    expect(view.getByTestId("plan-background-plane", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId("plan-subject-plane", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId("plan-foreground-plane", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Next" }));
    expect(view.getByTestId("collaborate-background-plane", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId("collaborate-subject-plane", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId("collaborate-foreground-plane", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Next" }));
    expect(view.getByTestId("deliver-background-plane", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId("deliver-subject-plane", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId("deliver-foreground-plane", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByRole("header", { name: "Build with confidence." })).toBeTruthy();
    expect(view.getByRole("button", { name: "See delivery align" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Sign in to Lisno" })).toBeTruthy();
  });

  it("keeps Next, progress and scene actions synchronized across all slides", async () => {
    const view = await render(<OnboardingScreen onComplete={jest.fn()} reducedMotion />);

    expect(view.getByRole("text", { name: "Slide 1 of 3" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Explore project layers" }));
    await fireEvent.press(view.getByRole("button", { name: "Next" }));

    expect(view.getByRole("header", { name: "Keep every handoff moving." })).toBeTruthy();
    expect(view.getByRole("button", { name: "Trace the handoff" })).toBeTruthy();
    expect(view.getByRole("text", { name: "Slide 2 of 3" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Trace the handoff" }));
    await fireEvent.press(view.getByRole("button", { name: "Next" }));

    expect(view.getByRole("header", { name: "Build with confidence." })).toBeTruthy();
    expect(view.getByRole("button", { name: "See delivery align" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Sign in to Lisno" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("synchronizes the active slide after a horizontal swipe", async () => {
    const view = await render(<OnboardingScreen onComplete={jest.fn()} reducedMotion />);
    const width = Dimensions.get("window").width;

    await fireEvent(view.getByTestId("onboarding-carousel"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: width * 2, y: 0 } }
    });

    expect(view.getByRole("header", { name: "Build with confidence." })).toBeTruthy();
    expect(view.getByRole("text", { name: "Slide 3 of 3" })).toBeTruthy();
  });

  it("announces slide changes after Next and Android Back", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation();
    const handlers: Array<(event: HardwareBackPressEvent) => boolean | null | undefined> = [];
    const backSpy = jest.spyOn(BackHandler, "addEventListener").mockImplementation(
      (_event, handler) => {
        handlers.push(handler);
        return { remove: jest.fn() } as unknown as EmitterSubscription;
      }
    );
    const view = await render(<OnboardingScreen onComplete={jest.fn()} reducedMotion />);

    announce.mockClear();
    expect(announce).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Next" }));
    expect(announce).toHaveBeenLastCalledWith("Slide 2 of 3: Keep every handoff moving.");

    await act(async () => {
      handlers.at(-1)?.({ type: "hardwareBackPress", timeStamp: 0 });
    });
    expect(announce).toHaveBeenLastCalledWith("Slide 1 of 3: Every project, clearly mapped.");

    view.unmount();
    backSpy.mockRestore();
    announce.mockRestore();
  });

  it("uses Android Back for earlier slides and leaves Back unhandled on slide one", async () => {
    const handlers: Array<(event: HardwareBackPressEvent) => boolean | null | undefined> = [];
    const backEvent = { type: "hardwareBackPress", timeStamp: 0 };
    const remove = jest.fn();
    const backSpy = jest.spyOn(BackHandler, "addEventListener").mockImplementation(
      (_event, handler) => {
        handlers.push(handler);
        return { remove } as unknown as EmitterSubscription;
      }
    );
    const view = await render(<OnboardingScreen onComplete={jest.fn()} reducedMotion />);

    expect(handlers.at(-1)?.(backEvent)).toBe(false);
    await fireEvent.press(view.getByRole("button", { name: "Next" }));
    expect(view.getByRole("header", { name: "Keep every handoff moving." })).toBeTruthy();

    await act(async () => {
      expect(handlers.at(-1)?.(backEvent)).toBe(true);
    });
    expect(view.getByRole("header", { name: "Every project, clearly mapped." })).toBeTruthy();

    view.unmount();
    expect(remove).toHaveBeenCalled();
    backSpy.mockRestore();
  });

  it("invokes completion once when the final action is pressed rapidly", async () => {
    let resolveCompletion: (() => void) | undefined;
    const onComplete = jest.fn(
      () => new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      })
    );
    const view = await render(<OnboardingScreen onComplete={onComplete} reducedMotion />);

    await fireEvent.press(view.getByRole("button", { name: "Next" }));
    await fireEvent.press(view.getByRole("button", { name: "Next" }));
    const finalAction = view.getByRole("button", { name: "Sign in to Lisno" });
    await fireEvent.press(finalAction);
    await fireEvent.press(finalAction);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(view.getByRole("button", { name: "Sign in to Lisno" }).props.accessibilityState).toEqual({
      busy: true,
      disabled: true
    });

    await act(async () => {
      resolveCompletion?.();
      await Promise.resolve();
    });
  });

  it("contains no backend environment information", async () => {
    const view = await render(<OnboardingScreen onComplete={jest.fn()} reducedMotion />);

    expect(view.queryByText(/\b(?:local|remote)\b/i)).toBeNull();
    expect(view.queryByText(/https?:\/\//i)).toBeNull();
  });

  it("does not mount or animate scenes before a true system motion preference resolves", async () => {
    let resolvePreference: ((value: boolean) => void) | undefined;
    const preference = new Promise<boolean>((resolve) => {
      resolvePreference = resolve;
    });
    const preferenceSpy = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockReturnValue(preference);
    const timingSpy = jest.spyOn(Animated, "timing");
    const view = await render(<OnboardingScreen onComplete={jest.fn()} />);

    expect(view.getByRole("progressbar", { name: "Preparing introduction" })).toBeTruthy();
    expect(view.queryByTestId("scene-plan", { includeHiddenElements: true })).toBeNull();
    expect(timingSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolvePreference?.(true);
      await preference;
    });
    await waitFor(() => expect(view.getByTestId("scene-plan", { includeHiddenElements: true })).toBeTruthy());
    expect(timingSpy).not.toHaveBeenCalled();

    preferenceSpy.mockRestore();
    timingSpy.mockRestore();
  });

  it("defaults to reduced motion when the system preference cannot be read", async () => {
    const preferenceSpy = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockRejectedValue(new Error("preference unavailable"));
    const timingSpy = jest.spyOn(Animated, "timing");
    const view = await render(<OnboardingScreen onComplete={jest.fn()} />);

    await waitFor(() => expect(view.getByTestId("scene-plan", { includeHiddenElements: true })).toBeTruthy());
    expect(timingSpy).not.toHaveBeenCalled();

    preferenceSpy.mockRestore();
    timingSpy.mockRestore();
  });
});
