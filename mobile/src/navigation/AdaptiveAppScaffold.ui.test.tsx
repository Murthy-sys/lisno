import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AUTHORIZATION_POLICY_VERSION, type PermissionCode, type Role } from "../contracts/authorization";
import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { chrome } from "../ui/tokens";
import { AdaptiveAppScaffold, ScaffoldContentBack, useScaffoldNavigationGuard } from "./AdaptiveAppScaffold";
import type { FeatureId } from "./registry";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockLogout = jest.fn(() => Promise.resolve());
let mockBackVisible = true;
let mockIsFocused = true;
let mockReducedTransparency = false;

jest.mock("expo-router", () => ({ useIsFocused: () => mockIsFocused, router: { replace: (...args: readonly unknown[]) => mockReplace(...args), push: (...args: readonly unknown[]) => mockPush(...args) } }));
jest.mock("expo-status-bar", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { StatusBar: ({ style }: { readonly style: string }) => React.createElement(View, { testID: `status-bar-${style}` }) };
});
jest.mock("./useScreenBack", () => ({ useScreenBack: ({ blocked }: { blocked?: boolean }) => ({ visible: mockBackVisible, disabled: blocked, onBack: mockBack }) }));
jest.mock("../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../ui/brand", () => ({ LisnoWordmark: () => null }));
jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { SafeAreaView: ({ children, ...props }: import("react-native-safe-area-context").SafeAreaViewProps) => React.createElement(View, props, children) };
});
jest.mock("../ui/ChromeSurface", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { ChromeSurface: ({ children, ...props }: import("react").ComponentProps<typeof import("../ui/ChromeSurface").ChromeSurface>) => React.createElement(View, props, children), useReducedTransparency: () => mockReducedTransparency };
});

const useRuntimeMock = jest.mocked(useConfiguredRuntime);

function configureRole(role: Role, permissions: readonly PermissionCode[], name = "Aditi Rao") {
  useRuntimeMock.mockReturnValue({
    runtime: { session: { logout: mockLogout } },
    session: {
      status: "authenticated",
      session: {
        user: { id: "user-1", name, email: "aditi@example.test", role },
        authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions }
      }
    }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
}

function PendingSendControl() {
  const guard = useScaffoldNavigationGuard();
  return (
    <View>
      <Pressable accessibilityLabel="Start pending send" accessibilityRole="button" onPress={() => guard?.setBlocked(true)}>
        <Text>Start pending send</Text>
      </Pressable>
      <Pressable accessibilityLabel="Finish pending send" accessibilityRole="button" onPress={() => guard?.setBlocked(false)}>
        <Text>Finish pending send</Text>
      </Pressable>
    </View>
  );
}

type HostNode = { readonly type?: unknown; readonly props: Record<string, unknown>; readonly children?: readonly unknown[] };

function hostsWithin(element: unknown, matches: (node: HostNode) => boolean, skip: (node: HostNode) => boolean = () => false): HostNode[] {
  const found: HostNode[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object" || !("props" in node)) return;
    const host = node as HostNode;
    if (skip(host)) return;
    if (matches(host)) found.push(host);
    host.children?.forEach(walk);
  };
  walk(element);
  return found;
}

// Navigation icon SVGs inside an element, excluding the decorative sheen SVG inside the glass selection layer.
function navigationIconsWithin(element: unknown): Record<string, unknown>[] {
  return hostsWithin(element, (node) => node.type === "RNSVGSvgView", (node) => node.props.testID === "navigation-glass-selection").map((node) => node.props);
}

describe("AdaptiveAppScaffold navigation", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockPush.mockClear();
    mockLogout.mockClear();
    mockBackVisible = true;
    mockIsFocused = true;
    mockReducedTransparency = false;
    configureRole("super_admin", ["admin.dashboard.read", "projects.list", "chat.read"]);
  });

  it("extends the header through the top inset and keeps the floating bottom capsule inside the bottom inset", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects" navigationRailBreakpoint={2000}><Text>Project content</Text></AdaptiveAppScaffold>);
    const topInset = within(view.getByTestId("scaffold-top-chrome")).getByTestId("scaffold-top-inset");
    const bottomInset = view.getByTestId("scaffold-bottom-inset");
    const dock = within(bottomInset).getByTestId("scaffold-bottom-chrome");
    expect(topInset.props.edges).toEqual(["top", "left", "right"]);
    expect(bottomInset.props.edges).toEqual(["bottom", "left", "right"]);
    expect(within(topInset).getByRole("button", { name: "Open notifications" })).toBeTruthy();
    expect(within(bottomInset).getAllByRole("tab")).toHaveLength(5);
    expect(StyleSheet.flatten(dock.props.style).position).not.toBe("absolute");
    expect(StyleSheet.flatten(dock.props.style).marginHorizontal ?? 0).toBe(0);
    expect(view.getByTestId("scaffold-body-inset").props.edges).toEqual(["left", "right"]);
    expect(view.getByTestId("scaffold-content-inset").props.edges).toEqual([]);
    expect(view.queryByTestId("scaffold-rail-chrome")).toBeNull();
  });

  it("keeps only the Lisno wordmark and notifications in a tightened top bar", async () => {
    configureRole("super_admin", ["admin.dashboard.read"], "Meera Priya Nair");
    const view = await render(<AdaptiveAppScaffold activeFeature="dashboard"><Text>Dashboard content</Text></AdaptiveAppScaffold>);
    const topInset = view.getByTestId("scaffold-top-inset");
    const header = within(topInset);
    expect(header.getByLabelText("Lisno")).toBeTruthy();
    expect(header.queryByText("PLAN · TRACK · DELIVER", { includeHiddenElements: true })).toBeNull();
    expect(header.queryByText("Meera Priya Nair", { includeHiddenElements: true })).toBeNull();
    expect(header.queryByText("Super Admin", { includeHiddenElements: true })).toBeNull();
    expect(header.queryByText("MN", { includeHiddenElements: true })).toBeNull();
    expect(header.getAllByRole("button")).toHaveLength(1);
    expect(header.getByRole("button", { name: "Open notifications" })).toBeTruthy();
    const bars = hostsWithin(topInset, (node) => StyleSheet.flatten(node.props.style as import("react-native").StyleProp<import("react-native").ViewStyle>)?.minHeight === 52);
    expect(bars).toHaveLength(1);
  });

  it("shows the signed-in user's initials in the Profile tab and opens the profile menu instead of navigating", async () => {
    configureRole("super_admin", ["admin.dashboard.read", "projects.list", "chat.read"], "Meera Priya Nair");
    const view = await render(<AdaptiveAppScaffold activeFeature="dashboard" navigationRailBreakpoint={2000}><Text>Dashboard content</Text></AdaptiveAppScaffold>);
    const profileTab = view.getByRole("tab", { name: "Profile" });
    expect(within(profileTab).getByText("MN", { includeHiddenElements: true })).toBeTruthy();
    expect(StyleSheet.flatten(profileTab.props.style).width).toBe(44);
    expect(view.queryByTestId("profile-menu")).toBeNull();
    await fireEvent.press(profileTab);
    expect(mockReplace).not.toHaveBeenCalled();
    const menu = within(view.getByTestId("profile-menu"));
    expect(menu.getAllByRole("menuitem").map((item) => item.props.accessibilityLabel)).toEqual(["Profile", "Sign out"]);
    await fireEvent.press(menu.getByRole("menuitem", { name: "Profile" }));
    expect(mockPush).toHaveBeenLastCalledWith("/profile");
    await waitFor(() => expect(view.queryByTestId("profile-menu")).toBeNull());
  });

  it("orders five tabs with Profile directly after Messages and More last on the dock and the rail", async () => {
    const order = ["Home", "Projects", "Messages", "Profile", "More"];
    const phone = await render(<AdaptiveAppScaffold activeFeature="dashboard" navigationRailBreakpoint={2000}><Text>Dashboard</Text></AdaptiveAppScaffold>);
    expect(within(phone.getByTestId("scaffold-bottom-chrome")).getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual(order);
    await phone.unmount();
    const tablet = await render(<AdaptiveAppScaffold activeFeature="dashboard" navigationRailBreakpoint={1}><Text>Dashboard</Text></AdaptiveAppScaffold>);
    expect(within(tablet.getByTestId("scaffold-rail-chrome")).getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual(["Dashboard", "Projects", "Messages", "Profile", "More"]);
  });

  it("renders all five 44pt tabs inside a 320pt-wide phone window", async () => {
    const dimensions = jest.spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useWindowDimensions").mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 1 });
    try {
      const view = await render(<AdaptiveAppScaffold activeFeature="dashboard"><Text>Dashboard</Text></AdaptiveAppScaffold>);
      expect(view.queryByTestId("scaffold-rail-chrome")).toBeNull();
      const chromeView = view.getByTestId("scaffold-bottom-chrome");
      const tabs = within(chromeView).getAllByRole("tab");
      expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual(["Home", "Projects", "Messages", "Profile", "More"]);
      const barStyle = StyleSheet.flatten(hostsWithin(chromeView, (node) => node.props.accessibilityRole === "tablist")[0]!.props.style as import("react-native").StyleProp<import("react-native").ViewStyle>);
      const dockStyle = StyleSheet.flatten(chromeView.props.style);
      const tabsWidth = tabs.reduce((total, tab) => total + (StyleSheet.flatten(tab.props.style).width as number), 0);
      const contentWidth = tabsWidth + (tabs.length - 1) * (barStyle.gap as number) + 2 * (barStyle.padding as number) + 2 * (dockStyle.borderWidth as number);
      expect(tabsWidth).toBe(5 * 44);
      expect(contentWidth).toBeLessThanOrEqual(320 - 2 * 16);
    } finally {
      dimensions.mockRestore();
    }
  });

  it("signs out from the profile menu through the session and routes to sign-in", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="dashboard" navigationRailBreakpoint={2000}><Text>Dashboard</Text></AdaptiveAppScaffold>);
    await fireEvent.press(view.getByRole("tab", { name: "Profile" }));
    await fireEvent.press(view.getByRole("menuitem", { name: "Sign out" }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockReplace).toHaveBeenLastCalledWith("/sign-in"));
  });

  it("opens the same profile menu from the tablet rail", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="dashboard" navigationRailBreakpoint={1}><Text>Dashboard</Text></AdaptiveAppScaffold>);
    const profileTab = within(view.getByTestId("scaffold-rail-chrome")).getByRole("tab", { name: "Profile" });
    expect(within(profileTab).getByText("AR", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(profileTab);
    expect(view.getByTestId("profile-menu")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("keeps tablet navigation continuous through the bottom inset with separate content clearance", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="dashboard" navigationRailBreakpoint={1}><Text>Dashboard content</Text></AdaptiveAppScaffold>);
    const railInset = within(view.getByTestId("scaffold-rail-chrome")).getByTestId("scaffold-rail-inset");
    expect(railInset.props.edges).toEqual(["bottom"]);
    expect(within(railInset).getAllByRole("tab")).toHaveLength(5);
    expect(view.getByTestId("scaffold-content-inset").props.edges).toEqual(["bottom"]);
    expect(view.queryByTestId("scaffold-bottom-chrome")).toBeNull();
  });

  it("uses light system icons only while its sage header is focused", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects"><Text>Project content</Text></AdaptiveAppScaffold>);
    expect(view.getByTestId("status-bar-light")).toBeTruthy();
    mockIsFocused = false;
    await view.rerender(<AdaptiveAppScaffold activeFeature="projects"><Text>Project content</Text></AdaptiveAppScaffold>);
    expect(view.queryByTestId("status-bar-light")).toBeNull();
  });

  it("shows icon-only phone tabs with Home for the landing route and retains accessible names and selection", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects" navigationRailBreakpoint={2000}><Text>Project content</Text></AdaptiveAppScaffold>);

    for (const label of ["Home", "Projects", "Messages", "Profile", "More"]) {
      const tab = view.getByRole("tab", { name: label });
      expect(tab.props.accessibilityLabel).toBe(label);
      expect(within(tab).queryByText(label, { includeHiddenElements: true })).toBeNull();
      const tabStyle = StyleSheet.flatten(tab.props.style);
      expect(tabStyle.width).toBe(44);
      expect(tabStyle.height).toBe(44);
      expect(tabStyle.minWidth).toBe(44);
      expect(tabStyle.minHeight).toBe(44);
      expect(tabStyle.flex).not.toBe(1);
      expect(tab.props.accessibilityState.selected).toBe(label === "Projects");
    }
    expect(view.queryAllByTestId("navigation-selection-dot", { includeHiddenElements: true })).toHaveLength(0);
    await fireEvent.press(view.getByRole("tab", { name: "Home" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/feature/dashboard");
    await fireEvent.press(view.getByRole("tab", { name: "Messages" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/feature/messages");
    await fireEvent.press(view.getByRole("tab", { name: "More" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/more");
    await fireEvent.press(view.getByRole("tab", { name: "Profile" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/more");
    expect(view.getByTestId("profile-menu")).toBeTruthy();
    await fireEvent.press(view.getByTestId("profile-menu-backdrop", { includeHiddenElements: true }));
    await fireEvent.press(view.getByRole("button", { name: "Open notifications" }));
    expect(mockPush).toHaveBeenLastCalledWith("/feature/notifications");
  });

  it("frames the notifications bell in a 36pt glass circle inside the 48pt button", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects" navigationRailBreakpoint={2000}><Text>Project content</Text></AdaptiveAppScaffold>);
    const button = within(view.getByTestId("scaffold-top-inset")).getByRole("button", { name: "Open notifications" });
    const buttonStyle = StyleSheet.flatten(button.props.style);
    expect(buttonStyle.minWidth).toBe(48);
    expect(buttonStyle.minHeight).toBe(48);
    const circle = within(button).getByTestId("notification-circle", { includeHiddenElements: true });
    const circleStyle = StyleSheet.flatten(circle.props.style);
    expect(circleStyle).toMatchObject({ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" });
    expect(circleStyle.opacity).toBeUndefined();
    const glass = within(circle).getByTestId("notification-glass", { includeHiddenElements: true });
    expect(glass.props.pointerEvents).toBe("none");
    expect(StyleSheet.flatten(glass.props.style)).toMatchObject({ borderRadius: 18, backgroundColor: chrome.glassFill });
    const icons = hostsWithin(circle, (node) => node.type === "RNSVGSvgView", (node) => node.props.testID === "notification-glass").map((node) => node.props);
    expect(icons).toHaveLength(1);
    expect(icons[0]!.width).toBe(20);
    expect(icons[0]!.height).toBe(20);
    expect(icons[0]!.stroke).toBe(chrome.ink);
    await fireEvent.press(button);
    expect(mockPush).toHaveBeenLastCalledWith("/feature/notifications");
  });

  it("dims only the bell circle to 0.8 while pressed", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects" navigationRailBreakpoint={2000}><Text>Project content</Text></AdaptiveAppScaffold>);
    const button = view.getByRole("button", { name: "Open notifications" });
    await fireEvent(button, "responderGrant", { nativeEvent: { timestamp: Date.now(), touches: [], changedTouches: [] }, persist: () => undefined, currentTarget: { measure: () => undefined } });
    const pressedCircle = view.getByTestId("notification-circle", { includeHiddenElements: true });
    expect(StyleSheet.flatten(pressedCircle.props.style).opacity).toBe(0.8);
    expect(StyleSheet.flatten(button.props.style).opacity).toBeUndefined();
  });

  it("uses the opaque glass fill behind the bell when Reduce Transparency is on", async () => {
    mockReducedTransparency = true;
    const view = await render(<AdaptiveAppScaffold activeFeature="projects" navigationRailBreakpoint={2000}><Text>Project content</Text></AdaptiveAppScaffold>);
    const button = view.getByRole("button", { name: "Open notifications" });
    const glass = within(button).getByTestId("notification-glass", { includeHiddenElements: true });
    expect(StyleSheet.flatten(glass.props.style).backgroundColor).toBe(chrome.glassOpaque);
    expect(within(button).queryByTestId("notification-glass-sheen", { includeHiddenElements: true })).toBeNull();
  });

  it("keeps the redesigned bell disabled while navigation is blocked", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="messages" navigationRailBreakpoint={2000}><PendingSendControl /></AdaptiveAppScaffold>);
    await fireEvent.press(view.getByRole("button", { name: "Start pending send" }));
    const button = view.getByRole("button", { name: "Open notifications" });
    await waitFor(() => expect(button.props.accessibilityState.disabled).toBe(true));
    expect(StyleSheet.flatten(button.props.style).opacity).toBe(0.48);
    expect(within(button).getByTestId("notification-glass", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(button);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("frames only the selected phone tab in a centered radius-18 glass circle with a 20pt icon and no full-cell tint or dot", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects" navigationRailBreakpoint={2000}><Text>Project content</Text></AdaptiveAppScaffold>);
    const bar = within(view.getByTestId("scaffold-bottom-chrome"));
    expect(bar.getAllByTestId("navigation-glass-selection", { includeHiddenElements: true })).toHaveLength(1);
    const selected = view.getByRole("tab", { name: "Projects" });
    expect(selected.props.accessibilityState.selected).toBe(true);
    const glass = within(selected).getByTestId("navigation-glass-selection", { includeHiddenElements: true });
    expect(glass.props.pointerEvents).toBe("none");
    expect(StyleSheet.flatten(glass.props.style).borderRadius).toBe(18);
    expect(within(selected).queryByTestId("navigation-selection-dot", { includeHiddenElements: true })).toBeNull();
    expect(StyleSheet.flatten(selected.props.style).backgroundColor).toBeUndefined();
    expect(StyleSheet.flatten(selected.props.style).minHeight).toBeGreaterThanOrEqual(44);
    const icons = navigationIconsWithin(selected);
    expect(icons).toHaveLength(1);
    expect(icons[0]!.width).toBe(20);
    expect(icons[0]!.height).toBe(20);
    for (const label of ["Home", "Messages", "Profile", "More"]) {
      const tab = view.getByRole("tab", { name: label });
      expect(tab.props.accessibilityState.selected).toBe(false);
      expect(within(tab).queryByTestId("navigation-glass-selection", { includeHiddenElements: true })).toBeNull();
    }
  });

  it("renders the phone bar as a floating content-width capsule with grouped icon-only tabs and no selection dot", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects" navigationRailBreakpoint={2000}><Text>Project content</Text></AdaptiveAppScaffold>);
    const chromeView = view.getByTestId("scaffold-bottom-chrome");
    const style = StyleSheet.flatten(chromeView.props.style);
    expect(style.alignSelf).toBe("center");
    expect(style.borderRadius).toBe(26);
    expect(style.borderWidth).toBe(1);
    expect(style.marginBottom).toBeGreaterThan(0);
    expect(style.borderTopWidth).toBeUndefined();
    expect(style.width).toBeUndefined();
    expect(style.flex).toBeUndefined();
    const tablists = hostsWithin(chromeView, (node) => node.props.accessibilityRole === "tablist");
    expect(tablists).toHaveLength(1);
    const barStyle = StyleSheet.flatten(tablists[0]!.props.style as import("react-native").StyleProp<import("react-native").ViewStyle>);
    expect(barStyle.padding).toBe(4);
    expect(barStyle.gap).toBe(4);
    const bar = within(chromeView);
    expect(bar.getAllByRole("tab")).toHaveLength(5);
    for (const label of ["Home", "Projects", "Messages", "Profile", "More"]) {
      expect(bar.getByRole("tab", { name: label })).toBeTruthy();
      expect(bar.queryByText(label, { includeHiddenElements: true })).toBeNull();
    }
    expect(bar.queryAllByTestId("navigation-selection-dot", { includeHiddenElements: true })).toHaveLength(0);
  });

  it("keeps the tablet rail's full-row selection tint and no glass pill", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="dashboard" navigationRailBreakpoint={1}><Text>Dashboard content</Text></AdaptiveAppScaffold>);
    expect(view.queryByTestId("navigation-glass-selection", { includeHiddenElements: true })).toBeNull();
    expect(StyleSheet.flatten(view.getByRole("tab", { name: "Dashboard" }).props.style).backgroundColor).toBeDefined();
    expect(StyleSheet.flatten(view.getByRole("tab", { name: "Projects" }).props.style).backgroundColor).toBeUndefined();
  });

  it("retains the visible labels on tablet navigation", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="dashboard" navigationRailBreakpoint={1}><Text>Dashboard content</Text></AdaptiveAppScaffold>);
    for (const label of ["Dashboard", "Projects", "Messages", "Profile", "More"]) {
      expect(view.getByText(label)).toBeTruthy();
      expect(view.getByRole("tab", { name: label }).props.accessibilityState.selected).toBe(label === "Dashboard");
    }
  });

  it.each<{
    role: Role;
    permissions: PermissionCode[];
    feature: FeatureId;
    label: string;
  }>([
    { role: "designer", permissions: ["projects.list", "design.plan_task.read", "chat.read"], feature: "design-plans", label: "Design plans" },
    { role: "procurement", permissions: ["workflow.tasks.read", "procurement.workspace.read", "chat.read"], feature: "procurement", label: "Procurement" },
    { role: "finance_head", permissions: ["workflow.tasks.read", "finance.bucket.read", "chat.read"], feature: "finance", label: "Finance" },
    { role: "client", permissions: ["projects.client_summary.read", "chat.read"], feature: "projects", label: "Home" }
  ])("keeps the $role tab's authorized destination and selected state", async ({ role, permissions, feature, label }) => {
    configureRole(role, permissions);
    const view = await render(<AdaptiveAppScaffold activeFeature={feature} navigationRailBreakpoint={2000}><Text>Workspace</Text></AdaptiveAppScaffold>);
    const tab = view.getByRole("tab", { name: label });
    expect(tab.props.accessibilityLabel).toBe(label);
    expect(within(tab).queryByText(label, { includeHiddenElements: true })).toBeNull();
    expect(tab.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(tab);
    expect(mockReplace).toHaveBeenLastCalledWith(`/feature/${feature}`);
    const homeTab = view.getByRole("tab", { name: "Home" });
    expect(homeTab.props.accessibilityLabel).toBe("Home");
    expect(within(homeTab).queryByText("Home", { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(homeTab);
    expect(mockReplace).toHaveBeenLastCalledWith(`/feature/${role === "designer" || role === "client" ? "projects" : "work"}`);
  });

  it("does not expose unauthorized destinations and selects More by its route", async () => {
    configureRole("super_admin", ["admin.dashboard.read"]);
    const view = await render(<AdaptiveAppScaffold more navigationRailBreakpoint={2000}><Text>Account</Text></AdaptiveAppScaffold>);
    expect(view.getAllByRole("tab")).toHaveLength(3);
    expect(view.queryByRole("tab", { name: "Projects" })).toBeNull();
    expect(view.queryByRole("tab", { name: "Messages" })).toBeNull();
    expect(view.getByRole("tab", { name: "More" }).props.accessibilityState.selected).toBe(true);
    expect(view.getByRole("tab", { name: "Profile" }).props.accessibilityState.selected).toBe(false);
  });

  it("selects Profile, not More, on the profile route", async () => {
    const view = await render(<AdaptiveAppScaffold profile navigationRailBreakpoint={2000}><Text>Profile</Text></AdaptiveAppScaffold>);
    expect(view.getAllByRole("tab").filter((tab) => tab.props.accessibilityState.selected).map((tab) => tab.props.accessibilityLabel)).toEqual(["Profile"]);
  });

  it("disables scaffold navigation while a child reports an in-flight send", async () => {
    const view = await render(
      <AdaptiveAppScaffold activeFeature="messages" navigationRailBreakpoint={2000}>
        <PendingSendControl />
      </AdaptiveAppScaffold>
    );

    expect(view.getAllByRole("tab").every((tab) => tab.props.accessibilityState.disabled === false)).toBe(true);
    await fireEvent.press(view.getByRole("button", { name: "Start pending send" }));
    await waitFor(() => expect(view.getAllByRole("tab").every((tab) => tab.props.accessibilityState.disabled === true)).toBe(true));
    expect(view.getByRole("button", { name: "Open notifications" }).props.accessibilityState.disabled).toBe(true);
    expect(view.getByRole("button", { name: "Back" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(mockBack).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("tab", { name: "Projects" }));
    await fireEvent.press(view.getByRole("button", { name: "Open notifications" }));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Finish pending send" }));
    await waitFor(() => expect(view.getAllByRole("tab").every((tab) => tab.props.accessibilityState.disabled === false)).toBe(true));
    await fireEvent.press(view.getByRole("tab", { name: "Projects" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/feature/projects");
  });

  it("retains Back above loading and unavailable content without another header", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects"><Text>Loading project</Text></AdaptiveAppScaffold>);
    expect(view.getAllByRole("button", { name: "Back" })).toHaveLength(1);
    await fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await view.rerender(<AdaptiveAppScaffold activeFeature="projects"><Text>Project unavailable</Text></AdaptiveAppScaffold>);
    expect(view.getAllByRole("button", { name: "Back" })).toHaveLength(1);
  });

  it("places one guarded Back inside illustrated content and still follows the home policy", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects" backPlacement="content">
      <View testID="illustrated-header"><ScaffoldContentBack /><Text>Projects</Text></View>
      <PendingSendControl />
    </AdaptiveAppScaffold>);
    expect(view.getAllByRole("button", { name: "Back" })).toHaveLength(1);
    expect(within(view.getByTestId("illustrated-header")).getByRole("button", { name: "Back" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole("button", { name: "Start pending send" }));
    await waitFor(() => expect(view.getByRole("button", { name: "Back" }).props.accessibilityState.disabled).toBe(true));
    await fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    mockBackVisible = false;
    await view.rerender(<AdaptiveAppScaffold activeFeature="projects" backPlacement="content"><ScaffoldContentBack /><Text>Home projects</Text></AdaptiveAppScaffold>);
    expect(view.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("omits Back when the route policy identifies home", async () => {
    mockBackVisible = false;
    const view = await render(<AdaptiveAppScaffold activeFeature="dashboard"><Text>Home</Text></AdaptiveAppScaffold>);
    expect(view.queryByRole("button", { name: "Back" })).toBeNull();
    mockBackVisible = true;
  });

  it("lets the immersive conversation supply its own Back", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="messages" immersiveBelowWidth={10000}><Text>Conversation</Text></AdaptiveAppScaffold>);
    expect(view.queryByRole("button", { name: "Back" })).toBeNull();
    expect(view.queryByRole("tablist")).toBeNull();
    expect(view.queryByRole("button", { name: "Open notifications" })).toBeNull();
    expect(view.queryByTestId("scaffold-top-chrome")).toBeNull();
    expect(view.queryByTestId("scaffold-bottom-chrome")).toBeNull();
    expect(view.queryByTestId("scaffold-rail-chrome")).toBeNull();
    expect(view.getByTestId("scaffold-body-inset").props.edges).toEqual([]);
    expect(view.getByTestId("scaffold-content-inset").props.edges).toEqual([]);
    expect(view.getByTestId("status-bar-dark")).toBeTruthy();
  });
});
