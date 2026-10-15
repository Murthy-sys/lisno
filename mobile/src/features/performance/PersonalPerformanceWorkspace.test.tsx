import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AUTHORIZATION_POLICY_VERSION, PERMISSION_CODES } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { PersonalPerformanceWorkspace } from "./PersonalPerformanceWorkspace";
import { createPerformanceApi, reportingMonth } from "./performanceApi";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const get = jest.fn();
const session = { user: { id: "designer-a", name: "Designer A", role: "designer" }, authorization: { role: "designer", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: PERMISSION_CODES } } as unknown as AuthenticatedSession;
const task = { id: "task-a", projectId: "project-a", title: "Measured layout", status: "in_progress", progress: 40, currentDeadlineAt: "2026-10-20T12:00:00.000Z", plannedEffort: 8, risk: { level: "yellow", reason: "Task is due soon.", elapsedRatio: 0.5, progressRatio: 0.4 } };
const pagination = { limit: 20, offset: 0, total: 21, hasMore: true };
function report(period = reportingMonth(0)) { return { userId: "designer-a", periodStartAt: period.from, periodEndAt: period.to, score: 73.25, components: [{ key: "onTime", label: "On-time delivery", score: 80, configuredWeight: 40, effectiveWeight: 60, eligibleCount: 3, explanation: "Two eligible tasks met their deadline." }, { key: "quality", label: "Design quality", score: null, configuredWeight: 20, effectiveWeight: 0, eligibleCount: 0, explanation: "No approved design reviews in this period." }], aggregates: { taskCounts: { total: 7, completed: 2, active: 5 }, riskCounts: { gray: 1, green: 2, yellow: 3, red: 1 }, effort: { planned: 30, completed: 12, remaining: 18, workloadPercentage: 60 }, projects: [{ projectId: "project-a", totalTasks: 2, completedTasks: 1, progress: 70, riskCounts: { gray: 0, green: 1, yellow: 1, red: 0 } }, { projectId: "project-b", totalTasks: 5, completedTasks: 1, progress: 20, riskCounts: { gray: 1, green: 1, yellow: 2, red: 1 } }], recentActivity: [] }, tasks: { items: [task], pagination } }; }
async function mount(children: ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return { ...await render(<QueryClientProvider client={client}>{children}</QueryClientProvider>), client }; }
beforeEach(() => { jest.clearAllMocks(); jest.mocked(useConfiguredRuntime).mockReturnValue({ environment: { environment: { id: "test" }, generation: 1, status: "ready" }, session: { generation: 1 }, runtime: { api: { authenticated: { get } } } } as unknown as ReturnType<typeof useConfiguredRuntime>); });
it("uses exact UTC calendar months including year boundaries and leap years", () => {
  expect(reportingMonth(-1, new Date("2026-01-20T12:00:00Z"))).toEqual({ from: "2025-12-01T00:00:00.000Z", to: "2025-12-31T23:59:59.999Z" });
  expect(reportingMonth(0, new Date("2024-02-02T12:00:00Z")).to).toBe("2024-02-29T23:59:59.999Z");
});
it("rejects another person's result, wrong periods and mismatched activity identities", async () => {
  const api = createPerformanceApi({ get }); const period = reportingMonth(0);
  get.mockResolvedValueOnce({ ...report(), userId: "designer-b" }); await expect(api.overview("designer-a", period)).rejects.toThrow("does not match");
  get.mockResolvedValueOnce(report(reportingMonth(-1))); await expect(api.overview("designer-a", period)).rejects.toThrow("does not match");
  get.mockResolvedValueOnce({ items: [{ id: "event-a", taskId: "other-task", actorId: "designer-a", type: "progress", occurredAt: "2026-10-01T00:00:00.000Z", note: null, from: {}, to: {} }], pagination: { ...pagination, total: 1, hasMore: false } });
  await expect(api.events("task-a", 0)).rejects.toThrow("another task");
});
it("shows backend score, missing component reasons, independent project totals and paged tasks", async () => {
  get.mockImplementation(async (path: string) => { const query = new URL(path, "https://test.invalid").searchParams; if (path.includes("/tasks?")) return { items: [{ ...task, id: query.get("offset") === "20" ? "task-next" : "task-a", title: query.get("offset") === "20" ? "Next reported task" : task.title }], pagination: { ...pagination, offset: Number(query.get("offset")), hasMore: query.get("offset") === "0" } }; return report({ from: query.get("from")!, to: query.get("to")! }); });
  const view = await mount(<PersonalPerformanceWorkspace session={session} />);
  await view.findByText("Score: 73.25 / 100"); expect(view.getByText("No approved design reviews in this period.")).toBeTruthy();
  expect(view.getByText(/Project project-a: 1 of 2/)).toBeTruthy(); expect(view.getByText(/Project project-b: 1 of 5/)).toBeTruthy();
  await view.findByText("Measured layout"); await fireEvent.press(view.getByRole("button", { name: "Next page" })); await view.findByText("Next reported task");
  await fireEvent.press(view.getByRole("combobox", { name: "Reporting period" })); await fireEvent.press(await view.findByRole("radio", { name: "Previous month" }));
  await waitFor(() => expect(get.mock.calls.some(([path]) => String(path).includes("/kpis/users/designer-a?") && new URL(String(path), "https://test.invalid").searchParams.get("from") === reportingMonth(-1).from)).toBe(true));
  await view.findByText("Measured layout"); expect(view.queryByText("Next reported task")).toBeNull();
});
it("clears the private report on a denied refresh and denies unsupported self-KPI without fetching", async () => {
  get.mockImplementation(async (path: string) => path.includes("/tasks?") ? { items: [task], pagination } : report());
  const view = await mount(<PersonalPerformanceWorkspace session={session} />); await view.findByText("Score: 73.25 / 100");
  get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access removed")); await act(async () => { await view.client.invalidateQueries(); });
  await view.findByText("Performance access changed"); expect(view.queryByText("Score: 73.25 / 100")).toBeNull();
  await view.unmount(); get.mockClear(); const clientSession = { ...session, user: { ...session.user, role: "client" as const }, authorization: { ...session.authorization, role: "client" as const } };
  const denied = await mount(<PersonalPerformanceWorkspace session={clientSession} />); expect(denied.getByText("Personal performance unavailable")).toBeTruthy(); expect(get).not.toHaveBeenCalled();
});
