import { useQuery } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react-native";
import { AUTHORIZATION_POLICY_VERSION, type PermissionCode } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProcurementHome, ProcurementHomePerformance } from "./ProcurementHome";

let mockBlocked = false;
const mockPush = jest.fn();
const mockRefetch = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: jest.fn() }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationBlocked: () => mockBlocked }));
jest.mock("./ProcurementDashboard", () => ({ ProcurementDashboard: ({ headerContent }: { headerContent?: import("react").ReactNode }) => {
  const { Text, View } = require("react-native"); return <View><Text>Project portfolio</Text>{headerContent}</View>;
} }));
jest.mock("../operations/TasksWorkspace", () => ({ TasksWorkspace: () => { const { Text } = require("react-native"); return <Text>Existing task queue</Text>; } }));

const permissions: PermissionCode[] = ["workflow.tasks.read", "organization.user_kpi.read"];
const session: AuthenticatedSession = { user: { id: "procurement-one", name: "Procurement One", email: "one@example.invalid", role: "procurement" }, authorization: { role: "procurement", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions } };
const data = { score: 72, aggregates: { taskCounts: { total: 9, completed: 4, active: 5 } } };
beforeEach(() => {
  jest.clearAllMocks(); mockBlocked = false;
  jest.mocked(useConfiguredRuntime).mockReturnValue({ environment: { environment: { id: "qa" }, status: "ready" }, runtime: { api: { authenticated: { get: jest.fn() } } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
  jest.mocked(useQuery).mockReturnValue({ data, isError: false, isPending: false, error: null, refetch: mockRefetch } as never);
});

it("keeps Home portfolio and the existing task queue reachable", async () => {
  const view = await render(<ProcurementHome session={session} />);
  expect(view.getByText("Project portfolio")).toBeTruthy();
  expect(view.getByRole("header", { name: "Your performance" })).toBeTruthy();
  await fireEvent.press(view.getByRole("tab", { name: "My tasks" }));
  expect(view.getByText("Existing task queue")).toBeTruthy();
  expect(view.queryByText("Project portfolio")).toBeNull();
  await fireEvent.press(view.getByRole("tab", { name: "Overview" }));
  await fireEvent.press(view.getByRole("button", { name: "View performance report" }));
  expect(mockPush).toHaveBeenCalledWith("/feature/performance");
});

it("uses the backend KPI and user-scoped monthly query without calculating a replacement score", async () => {
  const view = await render(<ProcurementHomePerformance session={session} />);
  expect(view.getByText("72 / 100")).toBeTruthy();
  expect(view.getByText("4 / 9")).toBeTruthy();
  const query = jest.mocked(useQuery).mock.calls[0]![0];
  expect(query.queryKey).toEqual(expect.arrayContaining(["personal", session.user.id, "overview"]));
});

it("hides cached performance when permission is revoked or the read is denied", async () => {
  const view = await render(<ProcurementHomePerformance session={{ ...session, authorization: { ...session.authorization, permissions: [] } }} />);
  expect(view.queryByTestId("procurement-home-performance")).toBeNull();
  expect(jest.mocked(useQuery).mock.calls[0]![0].enabled).toBe(false);
  jest.mocked(useQuery).mockReturnValue({ data, isError: true, isPending: false, error: new ApiError(403, "FORBIDDEN", "Denied"), refetch: mockRefetch } as never);
  await view.rerender(<ProcurementHomePerformance session={session} />);
  expect(view.queryByText("72 / 100")).toBeNull();
  expect(view.queryByRole("button", { name: "View performance report" })).toBeNull();
});

it("shows retry instead of an invented score on failure", async () => {
  jest.mocked(useQuery).mockReturnValue({ data: undefined, isError: true, isPending: false, error: new Error("Offline"), refetch: mockRefetch } as never);
  const view = await render(<ProcurementHomePerformance session={session} />);
  expect(view.queryByText("0 / 100")).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Retry performance" }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

it("disables Home and report navigation when an editor owns the scaffold guard", async () => {
  mockBlocked = true;
  const view = await render(<ProcurementHome session={session} />);
  expect(view.getByRole("tab", { name: "My tasks" })).toBeDisabled();
  expect(view.getByRole("button", { name: "View performance report" })).toBeDisabled();
  await fireEvent.press(view.getByRole("tab", { name: "My tasks" }));
  await fireEvent.press(view.getByRole("button", { name: "View performance report" }));
  expect(mockPush).not.toHaveBeenCalled();
  expect(view.getByText("Project portfolio")).toBeTruthy();
});
