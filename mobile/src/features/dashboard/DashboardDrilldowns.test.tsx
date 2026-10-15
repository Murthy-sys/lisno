import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { router } from "expo-router";
import { AUTHORIZATION_POLICY_VERSION, PERMISSION_CODES } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { DashboardDrilldowns } from "./DashboardDrilldowns";
import { createDrilldownApi, projectFilters } from "./data/drilldownApi";
import { createDashboardOverviewFixture } from "./data/testFixtures";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const get = jest.fn();
const session = { user: { id: "super-admin-a", name: "Super Admin", role: "super_admin" }, authorization: { role: "super_admin", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: PERMISSION_CODES } } as unknown as AuthenticatedSession;
const quality = { status: "complete", totalIssueCount: 0, issues: [], unavailableMetricKeys: [] };
const project = { projectId: "project-a", projectName: "Project Alpha", projectStatus: "active", location: "City A", plannedStartAt: "2026-10-01T00:00:00.000Z", plannedEndAt: "2026-11-01T00:00:00.000Z", actualEndAt: null, manager: null, estimate: { id: "estimate-a", projectId: "project-a", resolvedProjectId: "project-a", projectLinkSource: "estimate", version: 3, reviewRoundId: "round-a", status: "client_approved" }, designPlan: null, procurement: null, execution: { taskIds: ["task-a"], assigneeWorkerIds: [], sourceSectionIds: [], sourceLineItemKeys: [], taskCount: 1, overdueTaskCount: 0, unassignedTaskCount: 1, progress: { numerator: 30, denominator: 100, rateBps: 3000, fallbackTaskCount: 0 } }, finance: { bucketId: "bucket-a", version: 1, estimateId: "estimate-a", estimateVersion: 3, estimateReviewRoundId: "round-a", designPlanVersion: 2, approvedSubtotalPaise: 10000, recordedCostPaise: 2000, currentProfitPaise: 8000, currentMarginBps: 8000 }, risk: { level: "yellow", factors: [] } };
const worker = { workerId: "worker-a", workerName: "Carpenter A", role: "worker_carpenter", assignmentState: "assigned", activeTaskCount: 4, completedInPeriod: 2, plannedEffort: 20, completedEffort: 8, remainingEffort: 12, remainingWorkloadPercentage: 60, capacityEffort: null, capacityAvailable: false, capacityState: "unavailable", kpi: { availability: "unavailable", scoreBps: null, eligibleComponentCount: 0 } };
function page(items: unknown[], offset = 0) { return { observedAt: "2026-10-14T12:00:00.000Z", period: createDashboardOverviewFixture(30).period, items, pagination: { offset, limit: 20, total: 21, hasMore: offset === 0 }, dataQuality: quality }; }
async function mount(children: ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return { ...await render(<QueryClientProvider client={client}>{children}</QueryClientProvider>), client }; }
beforeEach(() => { jest.clearAllMocks(); jest.mocked(useConfiguredRuntime).mockReturnValue({ environment: { environment: { id: "test" }, status: "ready", generation: 1 }, session: { generation: 1 }, runtime: { api: { authenticated: { get } } } } as unknown as ReturnType<typeof useConfiguredRuntime>); });
it("rejects mismatched source identity, incorrect page windows and unreconciled finance", async () => {
  const api = createDrilldownApi({ get });
  get.mockResolvedValueOnce(page([{ ...project, estimate: { ...project.estimate, resolvedProjectId: "another-project" } }])); await expect(api.projects(30, "finance", projectFilters())).rejects.toThrow("could not be verified");
  get.mockResolvedValueOnce(page([{ ...project, finance: { ...project.finance, currentProfitPaise: 1 } }])); await expect(api.projects(30, "finance", projectFilters())).rejects.toThrow("reconciliation");
  get.mockResolvedValueOnce(page([project], 20)); await expect(api.projects(30, "projects", projectFilters())).rejects.toThrow("page changed");
});
it("renders unequal financial projects in paise, filters and pages without rebasing sources", async () => {
  const second = { ...project, projectId: "project-b", projectName: "Project Beta", estimate: { ...project.estimate, id: "estimate-b", projectId: "project-b", resolvedProjectId: "project-b" }, finance: { ...project.finance, bucketId: "bucket-b", estimateId: "estimate-b", approvedSubtotalPaise: 90000, recordedCostPaise: 30000, currentProfitPaise: 60000, currentMarginBps: 6667 } };
  get.mockImplementation(async (path: string) => { if (path.includes("/overview")) return createDashboardOverviewFixture(30); const params = new URL(path, "https://test.invalid").searchParams; return page(params.get("offset") === "20" ? [second] : [project, second], Number(params.get("offset"))); });
  const view = await mount(<DashboardDrilldowns session={session} module="finance" />);
  await view.findByText("Project Alpha"); expect(view.getByText("Approved net, excluding GST: ₹100.00")).toBeTruthy(); expect(view.getByText("Approved net, excluding GST: ₹900.00")).toBeTruthy(); expect(view.getByText("Current profit: ₹600.00")).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "Open Project Beta" })); expect(router.push).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "projects", recordId: "project-b" } });
  await fireEvent.press(view.getByRole("button", { name: "Next page" })); await waitFor(() => expect(view.queryByText("Project Alpha")).toBeNull());
  await fireEvent.changeText(view.getByLabelText("Search projects"), " Beta "); await fireEvent.press(view.getByRole("button", { name: "Apply search" }));
  await waitFor(() => expect(get.mock.calls.some(([path]) => String(path).includes("search=Beta") && String(path).includes("offset=0") && String(path).includes("module=finance"))).toBe(true));
});
it("shows unavailable workforce capacity and KPI without fabricating zero, with role filters", async () => {
  get.mockImplementation(async (path: string) => path.includes("/overview") ? createDashboardOverviewFixture(30) : page([worker]));
  const view = await mount(<DashboardDrilldowns session={session} module="workforce" />);
  await view.findByText("Carpenter A"); expect(view.getByText("Calculated KPI: Not available · 0 eligible components")).toBeTruthy(); expect(view.getByText("Capacity: Not available; no authoritative capacity denominator")).toBeTruthy();
  await fireEvent.press(view.getByRole("combobox", { name: "Worker role" })); await fireEvent.press(await view.findByRole("radio", { name: "Carpenter" }));
  await waitFor(() => expect(get.mock.calls.some(([path]) => String(path).includes("role=worker_carpenter") && String(path).includes("offset=0"))).toBe(true));
});
it("suppresses unavailable financial metrics and clears all protected rows on denial", async () => {
  let deny = false;
  get.mockImplementation(async (path: string) => { if (deny) throw new ApiError(403, "FORBIDDEN", "Report access removed"); if (path.includes("/overview")) return createDashboardOverviewFixture(30); return { ...page([project]), dataQuality: { status: "partial", totalIssueCount: 1, unavailableMetricKeys: ["finance.recordedCostPaise"], issues: [{ code: "finance_project_lineage_mismatch", metricKey: "finance.recordedCostPaise", message: "Finance source needs review.", entityType: "project", entityId: "project-a" }] } }; });
  const view = await mount(<DashboardDrilldowns session={session} module="finance" />);
  await view.findByText("Project Alpha"); expect(view.queryByText("Recorded cost: ₹20.00")).toBeNull(); expect(view.getByText("Not available. Finance source needs review.")).toBeTruthy();
  deny = true; await act(async () => { await view.client.invalidateQueries(); }); await view.findByText("Dashboard report unavailable"); expect(view.queryByText("Project Alpha")).toBeNull(); expect(view.queryByText("Current profit: ₹80.00")).toBeNull();
});
