import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AUTHORIZATION_POLICY_VERSION, type PermissionCode, type Role } from "../contracts/authorization";
import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { AdaptiveAppScaffold, useScaffoldNavigationGuard } from "./AdaptiveAppScaffold";
import type { FeatureId } from "./registry";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockBackVisible = true;

jest.mock("expo-router", () => ({ router: { replace: (...args: readonly unknown[]) => mockReplace(...args), push: (...args: readonly unknown[]) => mockPush(...args) } }));
jest.mock("./useScreenBack", () => ({ useScreenBack: ({ blocked }: { blocked?: boolean }) => ({ visible: mockBackVisible, disabled: blocked, onBack: mockBack }) }));
jest.mock("../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../ui/brand", () => ({ LisnoWordmark: () => null }));
jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { SafeAreaView: ({ children }: { readonly children: import("react").ReactNode }) => React.createElement(View, null, children) };
});

const useRuntimeMock = jest.mocked(useConfiguredRuntime);

function configureRole(role: Role, permissions: readonly PermissionCode[]) {
  useRuntimeMock.mockReturnValue({
    session: {
      status: "authenticated",
      session: {
        user: { id: "user-1", name: "Aditi Rao", email: "aditi@example.test", role },
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

describe("AdaptiveAppScaffold navigation", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockPush.mockClear();
    mockBackVisible = true;
    configureRole("super_admin", ["admin.dashboard.read", "projects.list", "chat.read"]);
  });

  it("shows only icons in phone tabs while retaining accessible names, selection and touch targets", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="projects" navigationRailBreakpoint={2000}><Text>Project content</Text></AdaptiveAppScaffold>);

    for (const label of ["Dashboard", "Projects", "Messages", "More"]) {
      const tab = view.getByRole("tab", { name: label });
      expect(within(tab).queryByText(label)).toBeNull();
      expect(StyleSheet.flatten(tab.props.style)).toEqual(expect.objectContaining({ minHeight: 48, minWidth: 48 }));
      expect(tab.props.accessibilityState.selected).toBe(label === "Projects");
    }
    await fireEvent.press(view.getByRole("tab", { name: "Messages" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/feature/messages");
    await fireEvent.press(view.getByRole("tab", { name: "More" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/more");
    await fireEvent.press(view.getByRole("button", { name: "Open notifications" }));
    expect(mockPush).toHaveBeenLastCalledWith("/feature/notifications");
  });

  it("retains the visible labels on tablet navigation", async () => {
    const view = await render(<AdaptiveAppScaffold activeFeature="dashboard" navigationRailBreakpoint={1}><Text>Dashboard content</Text></AdaptiveAppScaffold>);
    for (const label of ["Dashboard", "Projects", "Messages", "More"]) {
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
    { role: "client", permissions: ["projects.client_summary.read", "chat.read"], feature: "projects", label: "My projects" }
  ])("keeps the $role icon tab's authorized destination and selected state", async ({ role, permissions, feature, label }) => {
    configureRole(role, permissions);
    const view = await render(<AdaptiveAppScaffold activeFeature={feature} navigationRailBreakpoint={2000}><Text>Workspace</Text></AdaptiveAppScaffold>);
    const tab = view.getByRole("tab", { name: label });
    expect(within(tab).queryByText(label)).toBeNull();
    expect(tab.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(tab);
    expect(mockReplace).toHaveBeenLastCalledWith(`/feature/${feature}`);
  });

  it("does not expose unauthorized destinations and selects More by its route", async () => {
    configureRole("super_admin", ["admin.dashboard.read"]);
    const view = await render(<AdaptiveAppScaffold more navigationRailBreakpoint={2000}><Text>Account</Text></AdaptiveAppScaffold>);
    expect(view.getAllByRole("tab")).toHaveLength(2);
    expect(view.queryByRole("tab", { name: "Projects" })).toBeNull();
    expect(view.queryByRole("tab", { name: "Messages" })).toBeNull();
    expect(view.getByRole("tab", { name: "More" }).props.accessibilityState.selected).toBe(true);
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
  });
});
