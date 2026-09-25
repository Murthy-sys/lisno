import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { colors } from "../ui/tokens";
import { ProfileMenu } from "./ProfileMenu";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockLogout = jest.fn(() => Promise.resolve());

jest.mock("expo-router", () => ({ router: { replace: (...args: readonly unknown[]) => mockReplace(...args), push: (...args: readonly unknown[]) => mockPush(...args) } }));
jest.mock("../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../features/onboarding/useReducedMotion", () => ({ useReducedMotion: () => mockReducedMotion }));
jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { SafeAreaView: ({ children, ...props }: import("react-native-safe-area-context").SafeAreaViewProps) => React.createElement(View, props, children) };
});

let mockReducedMotion: boolean | null = false;

function modalProps(view: { readonly container: { queryAll(predicate: (instance: { readonly type: unknown }) => boolean): readonly { readonly props: Record<string, unknown> }[] } }) {
  const modal = view.container.queryAll((instance) => instance.type === "Modal")[0];
  expect(modal).toBeDefined();
  return modal!.props as { readonly animationType: string; readonly onRequestClose: () => void };
}

describe("ProfileMenu", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    mockLogout.mockClear();
    mockReducedMotion = false;
    jest.mocked(useConfiguredRuntime).mockReturnValue({
      runtime: { session: { logout: mockLogout } }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
  });

  it("lists only Profile and Sign out as labelled menu items in a modal panel", async () => {
    const view = await render(<ProfileMenu visible placement="tabs" onRequestClose={jest.fn()} />);
    const panel = view.getByTestId("profile-menu");
    expect(panel.props.accessibilityViewIsModal).toBe(true);
    expect(within(panel).getAllByRole("menuitem").map((item) => item.props.accessibilityLabel)).toEqual(["Profile", "Sign out"]);
    expect(view.queryByRole("menuitem", { name: "Workspaces" })).toBeNull();
  });

  it("closes before routing to Profile", async () => {
    const close = jest.fn();
    const view = await render(<ProfileMenu visible placement="tabs" onRequestClose={close} />);
    await fireEvent.press(view.getByRole("menuitem", { name: "Profile" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenLastCalledWith("/profile");
  });

  it("leads each item with a themed icon hidden from screen readers, separated by a decorative divider", async () => {
    const view = await render(<ProfileMenu visible placement="tabs" onRequestClose={jest.fn()} />);
    const icons = view.container.queryAll((instance) => instance.type === "RNSVGSvgView");
    expect(icons.map((icon) => icon.props.stroke)).toEqual([colors.ink, colors.danger]);
    icons.forEach((icon) => {
      expect(icon.props.width).toBe(20);
      expect(icon.props.accessibilityElementsHidden).toBe(true);
      expect(icon.props.importantForAccessibility).toBe("no-hide-descendants");
    });
    const profileRow = StyleSheet.flatten(view.getByRole("menuitem", { name: "Profile" }).props.style);
    expect(profileRow).toMatchObject({ flexDirection: "row", alignItems: "center", gap: 12 });
    const divider = view.getByTestId("profile-menu-divider", { includeHiddenElements: true });
    expect(divider.props.accessibilityElementsHidden).toBe(true);
    expect(StyleSheet.flatten(divider.props.style)).toMatchObject({ height: StyleSheet.hairlineWidth, backgroundColor: colors.border });
  });

  it("styles Sign out as an unoutlined red negative action and routes to sign-in after logout", async () => {
    const view = await render(<ProfileMenu visible placement="tabs" onRequestClose={jest.fn()} />);
    const signOut = view.getByRole("menuitem", { name: "Sign out" });
    expect(StyleSheet.flatten(signOut.props.style).borderColor).not.toBe(colors.danger);
    expect(StyleSheet.flatten(within(signOut).getByText("Sign out").props.style).color).toBe(colors.danger);
    await fireEvent.press(signOut);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
    const icons = view.container.queryAll((instance) => instance.type === "RNSVGSvgView");
    expect(icons[1]!.props.stroke).toBe(colors.dangerPressed);
  });

  it("closes on backdrop tap and hardware back", async () => {
    const close = jest.fn();
    const view = await render(<ProfileMenu visible placement="rail" onRequestClose={close} />);
    await fireEvent.press(view.getByTestId("profile-menu-backdrop", { includeHiddenElements: true }));
    expect(close).toHaveBeenCalledTimes(1);
    modalProps(view).onRequestClose();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("fades only when reduced motion is off", async () => {
    const view = await render(<ProfileMenu visible placement="tabs" onRequestClose={jest.fn()} />);
    expect(modalProps(view).animationType).toBe("fade");
    mockReducedMotion = true;
    await view.rerender(<ProfileMenu visible placement="tabs" onRequestClose={jest.fn()} />);
    expect(modalProps(view).animationType).toBe("none");
    mockReducedMotion = null;
    await view.rerender(<ProfileMenu visible placement="tabs" onRequestClose={jest.fn()} />);
    expect(modalProps(view).animationType).toBe("none");
  });
});
