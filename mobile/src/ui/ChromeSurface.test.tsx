import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Pressable, Text } from "react-native";

import { ChromeSurface } from "./ChromeSurface";
import { chrome } from "./tokens";

describe("navigation surface accessibility", () => {
  let listener: (value: boolean) => void;
  const remove = jest.fn();
  beforeEach(() => {
    remove.mockClear();
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_event, callback) => {
      listener = callback as unknown as (value: boolean) => void;
      return { remove } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("responds to Reduce Transparency without disabling or dimming child controls", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(false);
    const onPress = jest.fn();
    const view = await render(<ChromeSurface edge="bottom" testID="surface"><Pressable accessibilityRole="button" onPress={onPress}><Text>Projects</Text></Pressable></ChromeSurface>);
    await waitFor(() => expect(view.getByTestId("surface-tint", { includeHiddenElements: true })).toHaveStyle({ backgroundColor: chrome.surface }));
    await act(() => listener(true));
    expect(view.getByTestId("surface-tint", { includeHiddenElements: true })).toHaveStyle({ backgroundColor: chrome.opaque });
    await fireEvent.press(view.getByRole("button", { name: "Projects" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("does not let a late initial preference overwrite a new accessibility setting", async () => {
    let resolvePreference!: (value: boolean) => void;
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockReturnValue(new Promise((resolve) => { resolvePreference = resolve; }));
    const view = await render(<ChromeSurface edge="top" testID="surface"><Text>Workspace</Text></ChromeSurface>);
    await act(() => listener(true));
    await act(async () => resolvePreference(false));
    expect(view.getByTestId("surface-tint", { includeHiddenElements: true })).toHaveStyle({ backgroundColor: chrome.opaque });
  });

  it("sizes lighting across the measured header and safe area after rotation", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(false);
    const view = await render(<ChromeSurface edge="top" testID="surface"><Text>Workspace</Text></ChromeSurface>);
    await fireEvent(view.getByTestId("surface"), "layout", { nativeEvent: { layout: { width: 411, height: 120 } } });
    expect(view.getByTestId("surface-lighting", { includeHiddenElements: true }).props).toEqual(expect.objectContaining({ width: 411, height: 120 }));
    await fireEvent(view.getByTestId("surface"), "layout", { nativeEvent: { layout: { width: 923, height: 90 } } });
    expect(view.getByTestId("surface-lighting", { includeHiddenElements: true }).props).toEqual(expect.objectContaining({ width: 923, height: 90 }));
  });
});
