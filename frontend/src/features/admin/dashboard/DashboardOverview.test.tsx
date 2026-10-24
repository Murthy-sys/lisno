import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "../../../auth/AuthProvider";
import { authorizationFor } from "../../../test/authFixtures";
import { DashboardOverview, getDashboardPendingActions } from "./DashboardOverview";
import { superAdminDashboardOverviewFixture, superAdminDashboardProjectsPageFixture } from "./dashboardFixtures";
import type { DashboardDetailTarget, DashboardPriorityQuery, DashboardVendorQuery } from "./dashboardViewModel";
import type { SuperAdminDashboardOverview } from "./superAdminDashboardApi";

vi.mock("../../../auth/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("./ExecutiveDashboardCharts", () => ({
  RecordedCostActivityChart: () => <h3>Recorded expenses over time</h3>,
  ProjectActivityChart: () => <h3>Project activity trend</h3>,
  PeriodActivityComparisonChart: ({ onActivate }: { onActivate: (id: string) => void }) => <><h3>Period activity comparison</h3><button onClick={() => onActivate("design_plans_approved")}>Inspect design approvals</button></>,
  ProjectStatusChart: ({ onActivate }: { onActivate: (id: string) => void }) => <><h3>Projects by current stage</h3><button onClick={() => onActivate("active")}>View active projects</button></>
}));
vi.mock("./DashboardActivityHeatmap", () => ({ DashboardActivityHeatmap: () => <h3>Project activity heatmap</h3> }));

beforeEach(() => vi.mocked(useAuth).mockReturnValue({ user: { id: "super-admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", []) } as ReturnType<typeof useAuth>));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderOverview({ data = structuredClone(superAdminDashboardOverviewFixture), priorityProjects, vendorRequestCount, onOpenDetail, paymentSummary }: {
  data?: SuperAdminDashboardOverview; priorityProjects?: Partial<DashboardPriorityQuery>; vendorRequestCount?: DashboardVendorQuery;
  onOpenDetail?: (target: DashboardDetailTarget, origin: string) => void; paymentSummary?: ReactNode;
} = {}) {
  return render(<MemoryRouter><DashboardOverview data={data} showComparison={false} priorityProjects={{ data: structuredClone(superAdminDashboardProjectsPageFixture), isPending: false, isFetching: false, isError: false, refetch: vi.fn(), ...priorityProjects }} vendorRequestCount={vendorRequestCount} onOpenDetail={onOpenDetail} paymentSummary={paymentSummary} /></MemoryRouter>);
}

describe("Visual dashboard overview", () => {
  it("shows five authoritative headlines and all main panels without a hidden portfolio disclosure", () => {
    renderOverview();
    const metrics = screen.getByRole("region", { name: "Organization headline metrics" });
    expect(within(metrics).getAllByRole("article")).toHaveLength(5);
    for (const label of ["Total projects", "Approved net value", "Approved contract value", "Current margin", "Live overdue projects"]) expect(within(metrics).getByText(label)).toBeVisible();
    expect(metrics).toHaveTextContent("₹1 L");
    expect(metrics).toHaveTextContent("₹1.18 L");
    expect(within(metrics).getByRole("link", { name: /Approved net value.*₹1,00,000/ })).toBeVisible();
    expect(within(metrics).getByRole("link", { name: /Approved contract value.*₹1,18,000/ })).toBeVisible();
    expect(metrics).toHaveTextContent("72.00%");
    for (const name of ["Project activity trend", "Projects by current stage", "Period activity comparison", "Financial overview", "Module progress", "Workforce summary", "Project activity heatmap", "Priority projects", "Operational actions"]) expect(screen.getByRole("heading", { name })).toBeVisible();
    expect(screen.queryByText("More portfolio context")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Priority projects ordered by risk" })).toBeVisible();
  });

  it("keeps native module and role drilldowns scoped by stable IDs, period and comparison setting", () => {
    renderOverview();
    const modules = screen.getByRole("region", { name: "Module progress" });
    const procurement = within(modules).getByRole("link", { name: /Procurement progress/ });
    expect(procurement).toHaveAttribute("href", "/admin/dashboard?tab=procurement&periodDays=30&comparison=off");
    expect(procurement).toHaveAttribute("id", "dashboard-module-procurement");
    expect(procurement).toHaveAttribute("data-dashboard-origin", "dashboard-module-procurement");
    const role = screen.getByRole("link", { name: /Electrician/ });
    expect(role).toHaveAttribute("href", "/admin/dashboard?tab=workforce&periodDays=30&comparison=off&role=worker_electrician");
    expect(role).toHaveAttribute("id", "dashboard-workforce-worker_electrician");
    const overdue = within(screen.getByRole("region", { name: "Operational actions" })).getByRole("link", { name: /Live overdue projects/ });
    expect(overdue).toHaveAttribute("href", "/admin/dashboard?tab=risk&periodDays=30&comparison=off&riskFactor=schedule&sort=deadline_asc");
    expect(overdue).toHaveTextContent("Open schedule-risk records");
  });

  it("opens chart details using supported filters and stable return origins", async () => {
    const onOpenDetail = vi.fn();
    renderOverview({ onOpenDetail });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "View active projects" }));
    expect(onOpenDetail).toHaveBeenLastCalledWith({ tab: "projects", projectStatus: "active" }, "dashboard-lifecycle-active");
    await user.click(screen.getByRole("button", { name: "Inspect design approvals" }));
    expect(onOpenDetail).toHaveBeenLastCalledWith({ tab: "design", moduleStatus: "approved" }, "dashboard-comparison-design_plans_approved");
  });

  it("keeps priority failures and unauthorized action destinations independent", () => {
    renderOverview({ priorityProjects: { data: undefined, isError: true }, vendorRequestCount: { data: 19, isPending: false, isFetching: false, isError: false, refetch: vi.fn() } });
    expect(screen.getByRole("region", { name: "Organization headline metrics" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry priority projects" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Pending Client responses/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Pending design responses/ })).not.toBeInTheDocument();
    expect(screen.getByText("Pending Client responses").closest("li")).toHaveTextContent("1");
    expect(screen.queryByText("Vendor classification requests")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "North Residence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Client directory" })).not.toBeInTheDocument();
  });

  it("preserves authorized Client, design, vendor, directory and project destinations and the payment slot", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "super-admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", ["projects.read", "identity.users.read", "estimation.client_response_tasks.read", "design.plan_response_tasks.read", "ai_estimator_knowledge.configuration.read"]) } as ReturnType<typeof useAuth>);
    renderOverview({ vendorRequestCount: { data: 19, isPending: false, isFetching: false, isError: false, refetch: vi.fn() }, paymentSummary: <a href="/admin/dashboard?tab=finance&section=payments">Awaiting initial payment confirmation: 2</a> });
    expect(screen.getByLabelText("19 pending vendor classification requests")).toHaveTextContent("19");
    expect(screen.getByRole("link", { name: "Vendor classification requests" })).toHaveAttribute("href", "/admin/configuration/estimation?basketRequests=pending");
    expect(screen.getByRole("link", { name: /Pending Client responses/ })).toHaveAttribute("href", "/admin/client-responses");
    expect(screen.getByRole("link", { name: /Pending design responses/ })).toHaveAttribute("href", "/admin/design-approvals");
    expect(screen.getByRole("link", { name: "Client directory" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "North Residence" })).toHaveAttribute("href", "/admin/projects/project-risk");
    expect(screen.getByRole("link", { name: /Awaiting initial payment confirmation/ })).toBeVisible();
  });

  it("hides unavailable queue counts while retaining zero counts and truthful raw CSV mapping", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture);
    data.execution.overdue = 0;
    data.dataQuality = { status: "partial", totalIssueCount: 1, unavailableMetricKeys: ["governance.failedClientDeliveries"], issues: [{ code: "module_aggregate_unavailable", metricKey: "governance.failedClientDeliveries", message: "Delivery source is unavailable.", entityType: null, entityId: null }] };
    renderOverview({ data });
    expect(screen.queryByText("Failed Client deliveries")).not.toBeInTheDocument();
    expect(screen.queryByText(/Delivery source is unavailable/)).not.toBeInTheDocument();
    const empty = screen.getByText("Overdue execution tasks").closest("li")!;
    expect(empty).toHaveTextContent("0");
    expect(empty).toHaveTextContent("No current items");
    expect(getDashboardPendingActions(data, { canReadClientResponses: false, showComparison: false }).find((row) => row.label === "Failed Client deliveries")).toMatchObject({ value: "Not available", status: "Unavailable", href: null });
  });

  it("keeps zero progress and signed finance values while omitting null ratios and unavailable relationships", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture);
    data.finance.currentMarginBps = null;
    data.finance.remainingBudgetPaise = -12_500;
    data.design.approvalRate.rateBps = null;
    data.workforce.averageKpi.rateBps = null;
    data.procurement.averageProgress = { numerator: 0, denominator: 2, rateBps: 0 };
    data.clients!.relationshipsStatus = "unavailable";
    renderOverview({ data });
    expect(screen.queryByText("Current margin")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Financial overview" })).toHaveTextContent("Overspent-₹125.00");
    const modules = screen.getByRole("region", { name: "Module progress" });
    expect(within(modules).queryByRole("link", { name: /Design approval/ })).not.toBeInTheDocument();
    expect(within(modules).getByRole("link", { name: /Procurement progress/ })).toHaveTextContent("0.00%");
    expect(screen.getByRole("region", { name: "Workforce summary" })).not.toHaveTextContent("Average calculated KPI");
    expect(screen.getByRole("region", { name: "Client accounts" })).not.toHaveTextContent("Linked to projects");
  });

  it("renders a workforce ring only when the complete role population reconciles", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture);
    data.workforce.activeWorkers = 5;
    data.workforce.roleDistribution = [{ role: "worker_electrician", workerCount: 3 }, { role: "worker_civil", workerCount: 2 }];
    const view = renderOverview({ data });
    const total = screen.getByRole("link", { name: "5 Active workers" });
    expect(total.querySelector("svg")).not.toBeNull();
    view.unmount();
    data.workforce.activeWorkers = 6;
    renderOverview({ data });
    expect(screen.getByRole("link", { name: "6 Active workers" }).querySelector("svg")).toBeNull();
    expect(screen.getByRole("link", { name: /Electrician/ })).toHaveTextContent("3");
  });

  it("omits an unavailable workforce role without implying a complete distribution", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture);
    data.workforce.activeWorkers = 5;
    data.workforce.roleDistribution = [{ role: "worker_electrician", workerCount: 3 }, { role: "worker_civil", workerCount: 2 }];
    data.dataQuality = { status: "partial", totalIssueCount: 1, unavailableMetricKeys: ["workforce.roleDistribution.worker_electrician"], issues: [] };
    renderOverview({ data });
    expect(screen.queryByRole("link", { name: /Electrician/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Civil Worker/ })).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "5 Active workers" }).querySelector("svg")).toBeNull();
  });

  it("omits unavailable summary panels without hiding independently verified priority records", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture);
    data.dataQuality = { status: "partial", totalIssueCount: 12, unavailableMetricKeys: ["projects", "clients", "finance", "estimation", "design", "procurement", "execution", "workforce", "governance", "risk", "trends", "comparison"], issues: [] };
    renderOverview({ data });
    expect(screen.queryByRole("region", { name: "Organization headline metrics" })).not.toBeInTheDocument();
    for (const name of ["Project activity trend", "Period activity comparison", "Financial overview", "Module progress", "Workforce summary", "Project activity heatmap", "Operational actions"]) expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Priority projects ordered by risk" })).toBeVisible();
    expect(screen.getByText("North Residence")).toBeVisible();
  });

  it("keeps authorized vendor retry available when ordinary action counts are unavailable", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "super-admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", ["ai_estimator_knowledge.configuration.read"]) } as ReturnType<typeof useAuth>);
    const data = structuredClone(superAdminDashboardOverviewFixture);
    data.dataQuality = { status: "partial", totalIssueCount: 5, unavailableMetricKeys: ["risk", "projects", "execution", "finance", "governance"], issues: [] };
    const retry = vi.fn();
    renderOverview({ data, vendorRequestCount: { data: undefined, isPending: false, isFetching: false, isError: true, refetch: retry } });
    const actions = screen.getByRole("region", { name: "Operational actions" });
    await userEvent.setup().click(within(actions).getByRole("button", { name: /Retry/ }));
    expect(retry).toHaveBeenCalledOnce();
    expect(within(actions).queryByText("Red-risk projects")).not.toBeInTheDocument();
  });

  it("has accessible non-nested native actions and chart alternatives", async () => {
    const { container } = renderOverview();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    expect(container.querySelector("a a, a button")).toBeNull();
    const origins = [...container.querySelectorAll<HTMLElement>("[data-dashboard-origin]")].map((element) => element.id);
    expect(origins.every(Boolean)).toBe(true);
    expect(new Set(origins).size).toBe(origins.length);
  });
});
