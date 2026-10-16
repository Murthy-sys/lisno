import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";

import FeatureRoute from "../../app/feature/[featureId]";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { useConfiguredRuntime, useRuntime } from "../../runtime/RuntimeProvider";
import { FeatureWorkspace } from "./FeatureWorkspace";

const mockReplace = jest.fn();
const mockBack = jest.fn(() => false);
const mockUnmount = jest.fn();
let mockParams = { featureId: "configuration", projectId: "" };
let mockFail = false;

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => true,
    router: { replace: (...args: unknown[]) => mockReplace(...args), push: jest.fn() },
    Redirect: ({ href }: { href: string }) => React.createElement(Text, null, `Redirect: ${href}`)
  };
});
jest.mock("../../navigation/useScreenBack", () => ({
  useScreenBack: ({ blocked }: { blocked?: boolean } = {}) => ({ visible: true, disabled: blocked, onBack: mockBack })
}));
jest.mock("../../runtime/RuntimeProvider", () => ({ useRuntime: jest.fn(), useConfiguredRuntime: jest.fn() }));
jest.mock("./FeatureWorkspace", () => ({ FeatureWorkspace: jest.fn() }));
jest.mock("../../ui/brand", () => ({ LisnoWordmark: () => null }));
jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { SafeAreaView: ({ children, ...props }: import("react-native-safe-area-context").SafeAreaViewProps) => React.createElement(View, props, children) };
});
jest.mock("../../ui/ChromeSurface", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { ChromeSurface: ({ children }: { children: import("react").ReactNode }) => React.createElement(View, null, children), useReducedTransparency: () => false };
});

function runtimeFixture() {
  return {
    configured: true,
    environment: { environment: { id: "test" }, generation: 1 },
    session: {
      status: "authenticated", generation: 1,
      session: {
        user: { id: "user-a", name: "Test user", email: "test@example.test", role: "super_admin" },
        authorization: { role: "super_admin", policyVersion: AUTHORIZATION_POLICY_VERSION,
          permissions: ["admin.dashboard.read", "projects.list", "ai_estimator_knowledge.configuration.read"] }
      }
    },
    runtime: { session: { logout: jest.fn() } }
  };
}

let context: ReturnType<typeof runtimeFixture>;

function TestFeature() {
  const guard = useScaffoldNavigationGuard();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { guard?.setBlocked(blocked); }, [guard, blocked]);
  useEffect(() => () => { mockUnmount(); }, []);
  if (mockFail) throw new Error("Synthetic private render failure");
  return <Pressable accessibilityRole="button" accessibilityLabel="Block navigation" onPress={() => setBlocked(true)}><Text>Feature content</Text></Pressable>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useWindowDimensions").mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
  mockParams = { featureId: "configuration", projectId: "" };
  mockFail = false;
  mockBack.mockReturnValue(false);
  context = runtimeFixture();
  jest.mocked(useRuntime).mockImplementation(() => context as unknown as ReturnType<typeof useRuntime>);
  jest.mocked(useConfiguredRuntime).mockImplementation(() => context as unknown as ReturnType<typeof useConfiguredRuntime>);
  jest.mocked(FeatureWorkspace).mockImplementation(() => <TestFeature />);
});

afterEach(() => jest.restoreAllMocks());

it("keeps the real scaffold mounted, releases failed editor guards and retries explicitly", async () => {
  const view = await render(<FeatureRoute />);
  const header = view.getByTestId("scaffold-top-inset");
  await fireEvent.press(view.getByRole("button", { name: "Block navigation" }));
  expect(view.getByRole("tab", { name: "Home" })).toBeDisabled();
  mockFail = true;
  await view.rerender(<FeatureRoute />);
  expect(view.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(view.getByTestId("scaffold-top-inset")).toBe(header);
  await waitFor(() => expect(view.getByRole("tab", { name: "Home" })).toBeEnabled());
  expect(mockUnmount).toHaveBeenCalledTimes(1);
  expect(context.runtime.session.logout).not.toHaveBeenCalled();
  mockFail = false;
  await fireEvent.press(view.getByRole("button", { name: "Try again" }));
  expect(view.getByText("Feature content")).toBeTruthy();
});

it.each(["feature", "resource", "environment", "environment generation", "session", "user"])("resets a failed boundary when its %s changes", async scope => {
  mockFail = true;
  const view = await render(<FeatureRoute />);
  expect(view.getByRole("button", { name: "Try again" })).toBeTruthy();
  mockFail = false;
  if (scope === "feature") mockParams.featureId = "projects";
  if (scope === "resource") mockParams.projectId = "project-b";
  if (scope === "environment") context.environment.environment.id = "test-b";
  if (scope === "environment generation") context.environment.generation += 1;
  if (scope === "session") context.session.generation += 1;
  if (scope === "user") context.session.session.user.id = "user-b";
  await view.rerender(<FeatureRoute />);
  expect(view.getByText("Feature content")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Try again" })).toBeNull();
});

it("uses existing Back policy first, and an authorized home when there is no history", async () => {
  mockFail = true;
  mockBack.mockReturnValueOnce(true);
  const view = await render(<FeatureRoute />);
  await fireEvent.press(view.getByRole("button", { name: "Go back" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole("button", { name: "Go back" }));
  expect(mockReplace).toHaveBeenCalledWith("/feature/dashboard");
});

it("exits a failed home to another permitted feature instead of reopening the same failure", async () => {
  mockFail = true;
  mockParams.featureId = "dashboard";
  const view = await render(<FeatureRoute />);
  await fireEvent.press(view.getByRole("button", { name: "Go back" }));
  expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
  context.session.session.authorization.permissions = ["admin.dashboard.read"];
  await view.rerender(<FeatureRoute />);
  await fireEvent.press(view.getByRole("button", { name: "Go back" }));
  expect(mockReplace).toHaveBeenLastCalledWith("/access-denied");
});

it.each(["unauthorized", "signed out", "unconfigured"])("redirects %s sessions before protected content mounts", async state => {
  if (state === "unauthorized") context.session.session.authorization.permissions = ["projects.list"];
  if (state === "signed out") context.session.status = "anonymous";
  if (state === "unconfigured") context.configured = false;
  const view = await render(<FeatureRoute />);
  expect(view.getByText(`Redirect: ${state === "unauthorized" ? "/access-denied" : "/"}`)).toBeTruthy();
  expect(FeatureWorkspace).not.toHaveBeenCalled();
  expect(view.queryByRole("button", { name: "Try again" })).toBeNull();
});
