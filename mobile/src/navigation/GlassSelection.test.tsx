import { render, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { chrome } from "../ui/tokens";
import { GlassSelection } from "./GlassSelection";

describe("GlassSelection", () => {
  const remove = jest.fn();
  beforeEach(() => {
    remove.mockClear();
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(
      () => ({ remove }) as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it("renders a translucent glass fill with a sheen when transparency is allowed", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(false);
    const view = await render(<GlassSelection />);
    await waitFor(() => expect(view.getByTestId("navigation-glass-selection", { includeHiddenElements: true }))
      .toHaveStyle({ backgroundColor: chrome.glassFill, borderColor: chrome.glassBorder, borderRadius: 18 }));
    expect(view.getByTestId("navigation-glass-selection-sheen", { includeHiddenElements: true })).toBeTruthy();
  });

  it("uses an opaque fill without the sheen when Reduce Transparency is on", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);
    const view = await render(<GlassSelection testID="glass" radius={12} />);
    await waitFor(() => expect(view.getByTestId("glass", { includeHiddenElements: true }))
      .toHaveStyle({ backgroundColor: chrome.glassOpaque, borderRadius: 12 }));
    expect(view.queryByTestId("glass-sheen", { includeHiddenElements: true })).toBeNull();
  });

  it("is hidden from assistive technology and never intercepts touches", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(false);
    const view = await render(<GlassSelection />);
    expect(view.queryByTestId("navigation-glass-selection")).toBeNull();
    const layer = view.getByTestId("navigation-glass-selection", { includeHiddenElements: true });
    expect(layer.props).toEqual(expect.objectContaining({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
      pointerEvents: "none"
    }));
  });
  it("keeps the sheen translucent with explicit stop opacity instead of rgba stop colours", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(false);
    const view = await render(<GlassSelection />);
    await waitFor(() => expect(view.getByTestId("navigation-glass-selection-sheen", { includeHiddenElements: true })).toBeTruthy());
    // react-native-svg packs each stop as [offset, ARGB int]; rgba() stop colours used to encode as opaque white (-1).
    const gradient = JSON.stringify(view.toJSON()).match(/"gradient":(\[[^\]]*\])/);
    expect(gradient).not.toBeNull();
    const [, top = -1, , bottom = -1] = JSON.parse(gradient?.[1] ?? "[]") as number[];
    expect(Math.round(((top >>> 24) / 255) * 100) / 100).toBe(chrome.glassSheenTopOpacity);
    expect(bottom >>> 24).toBe(0);
  });
});
