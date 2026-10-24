import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { authorizationFor } from "../../../test/authFixtures";
import { LoadingProvider } from "../../../components/ui/GlobalRequestLoader";
import {
  superAdminDashboardOverviewFixture,
  superAdminDashboardProjectsPageFixture,
  superAdminDashboardWorkforcePageFixture
} from "./dashboardFixtures";
import {
  createExecutiveLifecycleOption,
  createRecordedCostActivityOption
} from "./ExecutiveDashboardCharts";
import { SuperAdminDashboardPage } from "./SuperAdminDashboardPage";
import * as dashboardReport from "./dashboardReportExport";
import type {
  SuperAdminDashboardOverview,
  SuperAdminDashboardProjectsPage
} from "./superAdminDashboardApi";
import { dashboardKeys } from "./superAdminDashboardApi";

const chartTheme = {
  series: ["series-1", "series-2", "series-3", "series-4"],
  ordinal: ["ordinal-1", "ordinal-2", "ordinal-3", "ordinal-4", "ordinal-5", "ordinal-6"],
  status: {
    good: "good",
    warning: "warning",
    serious: "serious",
    critical: "critical",
    neutral: "neutral"
  },
  text: "text",
  mutedText: "muted",
  grid: "grid",
  track: "track",
  surface: "surface"
} as const;

const dashboardChartRuntimeMock = vi.hoisted(() => {
  const instances = new Map<string, {
    update: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    focusDatum: ReturnType<typeof vi.fn>;
    onDatumClick: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>();
  const init = vi.fn((element: HTMLElement) => {
    const instance = {
      update: vi.fn(),
      resize: vi.fn(),
      focusDatum: vi.fn(),
      onDatumClick: vi.fn(() => () => undefined),
      dispose: vi.fn()
    };
    instances.set(element.parentElement?.dataset.chartId ?? `chart-${instances.size}`, instance);
    return instance;
  });
  const load = vi.fn(async () => ({ init }));
  return { init, instances, load };
});

vi.mock("../../../auth/AuthProvider", () => ({ useAuth: vi.fn(() => ({ user: null, authorization: null })) }));
vi.mock("./echarts/loadDashboardEChartsRuntime", () => ({
  loadDashboardEChartsRuntime: dashboardChartRuntimeMock.load
}));
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  dashboardChartRuntimeMock.init.mockClear();
  dashboardChartRuntimeMock.instances.clear();
  dashboardChartRuntimeMock.load.mockClear();
  vi.mocked(useAuth).mockReturnValue({ user: { id: "super-admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", []) } as ReturnType<typeof useAuth>);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function installDashboardApi({
  overview = superAdminDashboardOverviewFixture,
  projects = superAdminDashboardProjectsPageFixture
}: {
  overview?: SuperAdminDashboardOverview;
  projects?: SuperAdminDashboardProjectsPage;
} = {}) {
  return vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
    if (path.startsWith("/admin/dashboard/overview?")) return overview as never;
    if (path.startsWith("/admin/dashboard/projects?")) return projects as never;
    if (path.startsWith("/admin/dashboard/workforce?")) return superAdminDashboardWorkforcePageFixture as never;
    if (path === "/design-workflow/payment-confirmations") return [] as never;
    if (path.startsWith("/admin/ai-estimator-knowledge/basket-requests?")) return { items: [], pagination: { total: 7, limit: 1, offset: 0, hasMore: true } } as never;
    throw new Error(`Unexpected dashboard request: ${path}`);
  });
}

function HistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return <nav aria-label="Test browser history"><button onClick={() => navigate(-1)}>Browser back</button><button onClick={() => navigate(1)}>Browser forward</button><output data-testid="current-url">{location.search}</output></nav>;
}

function renderDashboard(
  entry = "/admin/dashboard?tab=overview&periodDays=30",
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  history = false
) {
  return {
    queryClient,
    ...render(
    <QueryClientProvider client={queryClient}>
      <LoadingProvider><MemoryRouter initialEntries={[entry]}>{history ? <HistoryControls /> : null}<SuperAdminDashboardPage /></MemoryRouter></LoadingProvider>
    </QueryClientProvider>
    )
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("Super Admin dashboard page", () => {
  it("shows a permission-gated vendor approval queue and refreshes its count with the dashboard", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "super-admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", ["ai_estimator_knowledge.configuration.read"]) } as ReturnType<typeof useAuth>);
    const read = installDashboardApi();
    renderDashboard();
    const count = await screen.findByLabelText("7 pending vendor classification requests");
    expect(count).toBeVisible();
    expect(screen.getByRole("link", { name: /Vendor classification requests/ })).toHaveAttribute("href", "/admin/configuration/estimation?basketRequests=pending");
    const countReads = () => read.mock.calls.filter(([path]) => path.startsWith("/admin/ai-estimator-knowledge/basket-requests?")).length;
    expect(countReads()).toBe(1);
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh dashboard" }));
    await waitFor(() => expect(countReads()).toBe(2));
  });

  it("does not request or render the vendor approval count without Configuration read permission", async () => {
    const read = installDashboardApi();
    renderDashboard();
    await screen.findByRole("heading", { name: "Overview" });
    expect(screen.queryByRole("link", { name: /Vendor classification requests/ })).not.toBeInTheDocument();
    expect(read.mock.calls.some(([path]) => path.startsWith("/admin/ai-estimator-knowledge/basket-requests?"))).toBe(false);
  });

  it("loads only the fixed five-row priority query on Overview and uses the selected period", async () => {
    const read = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard("/admin/dashboard?tab=overview&periodDays=30&search=ignored&riskLevel=red&offset=40&sort=name_asc");
    await screen.findByText("North Residence");
    const projectReads = () => read.mock.calls.filter(([path]) => path.startsWith("/admin/dashboard/projects?")).map(([path]) => path);
    expect(projectReads()).toEqual(["/admin/dashboard/projects?periodDays=30&module=projects&sort=risk_desc&limit=5&offset=0"]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Reporting period" }), "90");
    await waitFor(() => expect(projectReads()).toContain("/admin/dashboard/projects?periodDays=90&module=projects&sort=risk_desc&limit=5&offset=0"));
    const priorityReadCount = projectReads().length;
    await user.click(screen.getByRole("link", { name: "Finance details" }));
    await waitFor(() => expect(projectReads().some((path) => path.includes("module=finance&sort=risk_desc&limit=20&offset=0"))).toBe(true));
    expect(projectReads().filter((path) => path.includes("limit=5"))).toHaveLength(priorityReadCount);
  });

  it("does not request priority projects eagerly when opening a legacy detail URL", async () => {
    const read = installDashboardApi();
    renderDashboard("/admin/dashboard?tab=workforce&periodDays=30");
    await screen.findAllByText("Aarav Electrician");
    expect(read.mock.calls.some(([path]) => path.startsWith("/admin/dashboard/projects?"))).toBe(false);
  });

  it("does not request initial-payment data without its operation permission", async () => {
    const read = installDashboardApi();
    renderDashboard();
    await screen.findByRole("heading", { name: "Overview", level: 2 });
    expect(screen.queryByRole("region", { name: "Initial payment confirmations" })).not.toBeInTheDocument();
    expect(read.mock.calls.some(([path]) => path === "/design-workflow/payment-confirmations")).toBe(false);
  });

  it("uses stable UTC and semantic identities for executive ECharts transitions", () => {
    const activity = createRecordedCostActivityOption({
      trends: superAdminDashboardOverviewFixture.trends,
      approvedNetRevenuePaise: superAdminDashboardOverviewFixture.finance.approvedSubtotalPaise,
      costBudgetPaise: superAdminDashboardOverviewFixture.finance.costBudgetPaise,
      theme: chartTheme
    }) as unknown as { series: Array<Record<string, unknown>> };
    expect(activity.series).toEqual([
      expect.objectContaining({ id: "recorded-cost-activity", type: "line", animation: false })
    ]);
    expect((activity.series[0].data as Array<Record<string, unknown>>).map(({ id }) => id)).toEqual(["2026-08-30"]);

    const lifecycle = createExecutiveLifecycleOption({ data: superAdminDashboardOverviewFixture, theme: chartTheme }) as unknown as { series: Array<Record<string, unknown>> };
    expect(lifecycle.series[0]).toMatchObject({ id: "dashboard-project-status", type: "pie", emphasis: { scale: false, label: { show: false } } });
    expect((lifecycle.series[0].data as Array<Record<string, unknown>>).map(({ id, groupId }) => ({ id, groupId }))).toEqual([
      { id: "planning", groupId: "projects.planning" },
      { id: "active", groupId: "projects.active" },
      { id: "on_hold", groupId: "projects.onHold" },
      { id: "completed", groupId: "projects.completed" }
    ]);
  });
  it("opens the existing payment workflow from the read-only overview summary", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "super-admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", ["projects.design_workflow.payments.read", "projects.design_workflow.act"]) } as ReturnType<typeof useAuth>);
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();
    const summary = await screen.findByRole("region", { name: "Initial payment confirmations" });
    const link = within(summary).getByRole("link", { name: /Awaiting initial payment confirmation/ });
    await waitFor(() => expect(link).toHaveTextContent("0"));
    expect(link).toHaveAttribute("href", expect.stringContaining("section=payments"));
    expect(within(summary).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(link);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Initial payment review" })).toHaveFocus());
    const workflow = screen.getByRole("region", { name: "Initial payment confirmations" });
    expect(workflow).toHaveTextContent("Super Admin confirms payment after final approval to enable work-order issuance.");
    expect(workflow).toHaveTextContent("Earlier projects keep their existing payment workflow.");
    expect(within(workflow).getByText("No projects are waiting for initial-payment confirmation.")).toBeVisible();
    expect(get).toHaveBeenCalledWith("/design-workflow/payment-confirmations", { showGlobalLoader: false });
  });
  it("shows only one logo while the dashboard API and page are both loading", async () => {
    const pending = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => String(input).includes("/admin/dashboard/projects?")
      ? Promise.resolve(Response.json({ data: superAdminDashboardProjectsPageFixture }))
      : pending.promise);
    const { queryClient } = renderDashboard();
    try {
      expect(screen.getByRole("status", { name: "Dashboard status" })).toHaveTextContent("Loading organization dashboard…");
      expect(document.querySelectorAll(".lisno-loading-mark")).toHaveLength(1);
      expect(screen.getAllByRole("status")).toHaveLength(1);
      pending.resolve(Response.json({ data: superAdminDashboardOverviewFixture }));
      expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
      await waitFor(() => expect(document.querySelectorAll(".lisno-loading-mark")).toHaveLength(0));
    } finally {
      pending.resolve(Response.json({ data: superAdminDashboardOverviewFixture }));
      queryClient.clear();
    }
  });

  it("renders one organization-wide request as the reference-led executive overview", async () => {
    const get = installDashboardApi();
    const { container } = renderDashboard();

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    for (const heading of [
      "Recorded expenses over time",
      "Project activity trend",
      "Projects by current stage",
      "Period activity comparison",
      "Financial overview",
      "Module progress",
      "Workforce summary",
      "Project activity heatmap",
      "Priority projects",
      "Operational actions",
    ]) expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.queryByText("More portfolio context")).not.toBeInTheDocument();
    const headline = screen.getByRole("region", { name: "Organization headline metrics" });
    for (const label of ["Total projects", "Approved net value", "Approved contract value", "Current margin", "Live overdue projects"]) {
      expect(within(headline).getByText(label)).toBeVisible();
    }
    expect(screen.queryByText(/Pipeline value|Revenue trend|Recent activity|Top vendors/i)).not.toBeInTheDocument();

    const requested = get.mock.calls.map(([path]) => path);
    expect(requested.filter((path) => path.startsWith("/admin/dashboard/overview?"))).toHaveLength(1);
    expect(requested.join(" ")).not.toMatch(/\/admin\/projects|\/finance\/projects/);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
  it("keeps exact finance values visible beside the expense chart", async () => {
    installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();
    const finance = await screen.findByRole("region", { name: "Financial overview" });
    const activity = within(finance).getByRole("figure", { name: "Recorded expenses over time" });
    await user.click(within(activity).getByRole("button", { name: "Show values" }));
    expect(within(activity).getByRole("row", { name: /2026-08-30.*₹2,500\.00/ })).toBeVisible();
    expect(within(activity).queryByText("₹1,00,000.00")).not.toBeInTheDocument();
    for (const value of ["₹12,000.00", "₹9,000.00", "₹80,000.00", "₹52,000.00"]) {
      expect(within(finance).getByText(value)).toBeVisible();
    }
  });
  it("keeps healthy finance marks and exact tables when one cost class is unavailable", async () => {
    installDashboardApi({
      overview: {
        ...superAdminDashboardOverviewFixture,
        dataQuality: {
          status: "partial",
          totalIssueCount: 1,
          unavailableMetricKeys: ["finance.employeePaymentPaise"],
          issues: [{
            code: "module_aggregate_unavailable",
            metricKey: "finance.employeePaymentPaise",
            message: "Employee payment lineage could not be verified.",
            entityType: null,
            entityId: null
          }]
        }
      }
    });
    renderDashboard();

    await screen.findByRole("heading", { name: "Overview", level: 2 });
    const figure = screen.getByRole("region", { name: "Financial overview" });
    expect(screen.queryByText(/Some dashboard metrics are unavailable/)).not.toBeInTheDocument();
    expect(within(figure).queryByText(/Employee payment lineage could not be verified/)).not.toBeInTheDocument();
    expect(within(figure).queryByText("Employee payments")).not.toBeInTheDocument();
    expect(within(figure).getByText("Procurement")).toBeVisible();
    expect(within(figure).getByText("₹12,000.00")).toBeVisible();
  });
  it("omits unavailable budget charts without exposing raw fallback zeroes", async () => {
    const unavailableMetricKeys = [
      "finance.costBudgetPaise",
      "finance.recordedCostPaise",
      "finance.remainingBudgetPaise"
    ];
    installDashboardApi({
      overview: {
        ...superAdminDashboardOverviewFixture,
        finance: {
          ...superAdminDashboardOverviewFixture.finance,
          costBudgetPaise: 0,
          recordedCostPaise: 0,
          remainingBudgetPaise: 0
        },
        dataQuality: {
          status: "partial",
          totalIssueCount: unavailableMetricKeys.length,
          unavailableMetricKeys,
          issues: unavailableMetricKeys.map((metricKey) => ({
            code: "module_aggregate_unavailable" as const,
            metricKey,
            message: `${metricKey} could not be verified.`,
            entityType: "finance_bucket" as const,
            entityId: null
          }))
        }
      }
    });
    renderDashboard();

    await screen.findByRole("heading", { name: "Overview", level: 2 });
    expect(screen.queryByRole("figure", { name: "Budget position" })).not.toBeInTheDocument();
    expect(screen.queryByText(/finance.costBudgetPaise could not be verified/)).not.toBeInTheDocument();
    const finance = screen.getByRole("region", { name: "Financial overview" });
    expect(within(finance).queryByText("Cost budget")).not.toBeInTheDocument();
    expect(within(finance).getByText("₹12,000.00")).toBeVisible();
  });
  it("presents five linked headline metrics with explicit snapshot bases", async () => {
    installDashboardApi();
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    for (const label of ["Total projects", "Approved net value", "Approved contract value", "Current margin", "Live overdue projects"]) {
      expect(within(band).getByText(label)).toBeVisible();
    }
    expect(within(band).getAllByRole("article")).toHaveLength(5);
    expect(within(band).getByText("Excluding GST")).toBeVisible();
    expect(within(band).getByText("Including GST")).toBeVisible();
    expect(within(band).getByText("72.00%")).toBeVisible();
    expect(within(band).getByText("Current portfolio")).toBeVisible();
    expect(within(band).getAllByRole("link")).toHaveLength(5);
    expect(band).not.toHaveTextContent("vs previous");
  });
  it("keeps context-rail actions aligned with the live authorization snapshot", async () => {
    const get = installDashboardApi();
    const withoutPermissions = renderDashboard();

    const queue = await screen.findByRole("region", { name: "Operational actions" });
    expect(screen.queryByRole("link", { name: "Client directory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "North Residence" })).not.toBeInTheDocument();
    expect(within(within(queue).getByText("Pending Client responses").closest("li")!).queryByRole("link")).not.toBeInTheDocument();
    withoutPermissions.unmount();

    vi.mocked(useAuth).mockReturnValue({
      user: { id: "super-admin-one", role: "super_admin" },
      authorization: authorizationFor("super_admin", [
        "admin.dashboard.read",
        "identity.users.read",
        "projects.read",
        "estimation.client_response_tasks.read"
      ])
    } as ReturnType<typeof useAuth>);
    renderDashboard();

    await screen.findByRole("heading", { name: "Overview", level: 2 });
    expect(screen.getByRole("link", { name: "Client directory" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "North Residence" })).toHaveAttribute("href", "/admin/projects/project-risk");
    const permittedQueue = screen.getByRole("region", { name: "Operational actions" });
    expect(within(within(permittedQueue).getByText("Pending Client responses").closest("li")!).getByRole("link")).toHaveAttribute("href", "/admin/client-responses");
    expect(get).toHaveBeenCalled();
  });
  it("does not present an unavailable project total as an empty organization", async () => {
    installDashboardApi({
      overview: {
        ...superAdminDashboardOverviewFixture,
        projects: { ...superAdminDashboardOverviewFixture.projects, total: 0 },
        dataQuality: {
          status: "partial",
          totalIssueCount: 1,
          unavailableMetricKeys: ["projects.total"],
          issues: [{ code: "module_aggregate_unavailable", metricKey: "projects.total", message: "Project totals could not be verified.", entityType: null, entityId: null }]
        }
      }
    });
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    expect(within(band).queryByText("Total projects")).not.toBeInTheDocument();
    expect(screen.queryByText(/No projects yet/)).not.toBeInTheDocument();
  });
  it("stores comparison visibility in URL state without changing snapshot metrics or refetching", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();
    const toggle = await screen.findByRole("checkbox", { name: "Compare with previous period" });
    const metric = within(screen.getByRole("region", { name: "Organization headline metrics" })).getByText("Total projects").closest("article")!;
    const snapshot = metric.textContent;
    const chart = screen.getByRole("figure", { name: "Period activity comparison" });
    await user.click(within(chart).getByRole("button", { name: "Show values" }));
    expect(within(chart).getByRole("columnheader", { name: "Previous period" })).toBeVisible();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(metric.textContent).toBe(snapshot);
    expect(within(chart).queryByRole("columnheader", { name: "Previous period" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Finance details" })).toHaveAttribute("href", expect.stringContaining("comparison=off"));
    expect(get.mock.calls.filter(([path]) => path.startsWith("/admin/dashboard/overview?")).length).toBe(1);
  });
  it("keeps current project activity when the previous comparison is unavailable", async () => {
    const sourceComparison = superAdminDashboardOverviewFixture.comparison!;
    installDashboardApi({ overview: { ...superAdminDashboardOverviewFixture, comparison: { ...sourceComparison, metrics: { ...sourceComparison.metrics, projects_created: { ...sourceComparison.metrics.projects_created, previous: null, previousStatus: "unavailable", previousUnavailableReason: "Previous project history could not be verified.", delta: null, changeBps: null, changeKind: "unavailable" } } } } });
    renderDashboard();

    const card = within(await screen.findByRole("region", { name: "Organization headline metrics" })).getByText("Total projects").closest("article")!;
    expect(card).toHaveTextContent("2");
    const comparison = screen.getByRole("figure", { name: "Period activity comparison" });
    await userEvent.setup().click(within(comparison).getByRole("button", { name: "Show values" }));
    expect(within(comparison).getByRole("row", { name: /Projects created 1/ })).toBeVisible();
    expect(card).not.toHaveTextContent("Previous project history could not be verified.");
  });
  it("keeps snapshot KPIs visible when current project activity is unavailable", async () => {
    const sourceComparison = superAdminDashboardOverviewFixture.comparison!;
    installDashboardApi({ overview: { ...superAdminDashboardOverviewFixture, comparison: { ...sourceComparison, metrics: { ...sourceComparison.metrics, projects_created: { ...sourceComparison.metrics.projects_created, current: null, currentStatus: "unavailable", currentUnavailableReason: "Current project history could not be verified.", delta: null, changeBps: null, changeKind: "unavailable" } } } } });
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    const card = within(band).getByText("Total projects").closest("article")!;
    expect(card).toHaveTextContent("2");
    expect(card).not.toHaveTextContent("Current project history could not be verified.");
    expect(within(band).getByLabelText("₹1,00,000.00")).toHaveTextContent("₹1 L");
  });
  it("does not attach event deltas to current portfolio snapshots", async () => {
    const comparison = superAdminDashboardOverviewFixture.comparison!;
    installDashboardApi({ overview: { ...superAdminDashboardOverviewFixture, comparison: { ...comparison, metrics: { ...comparison.metrics, projects_created: { ...comparison.metrics.projects_created, delta: 77, changeBps: 1234, changeKind: "percentage" } } } } });
    renderDashboard();
    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    expect(band).not.toHaveTextContent("77");
    expect(band).not.toHaveTextContent("12.34%");
    expect(within(band).getByText("Total projects").closest("article")).toHaveTextContent("2");
  });
  it("omits unavailable optional comparison and Client fields while retaining verified snapshots", async () => {
    const { clients: _clients, comparison: _comparison, ...oldOverview } = superAdminDashboardOverviewFixture;
    installDashboardApi({ overview: oldOverview });
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    expect(within(band).getByText("Total projects").closest("article")).toHaveTextContent("2");
    expect(within(band).getByText("Total projects").closest("article")).not.toHaveTextContent("unavailable");
    expect(within(band).getByRole("link", { name: "Approved net value: ₹1,00,000.00. View finance" })).toHaveTextContent("₹1 L");
    expect(within(band).queryByText("Active clients")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Client accounts" })).not.toBeInTheDocument();
  });
  it("opens a lifecycle drilldown with the selected stable project status", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole("heading", { name: "Overview", level: 2 });
    const lifecycle = screen.getByRole("figure", { name: "Projects by current stage" });
    await user.click(within(lifecycle).getByRole("button", { name: "View active projects" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeVisible());
    expect(get.mock.calls.some(([path]) => path.includes("projectStatus=active"))).toBe(true);
  });

  it("keeps the project-status doughnut mounted while exposing exact values", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole("heading", { name: "Overview", level: 2 });
    const figure = screen.getByRole("figure", { name: "Projects by current stage" });
    const chartHost = within(figure).getByRole("img", { name: /Projects by current stage\./ });
    await user.click(within(figure).getByRole("button", { name: "Show values" }));
    const table = within(figure).getByRole("table");
    expect(within(table).getByRole("row", { name: "Active 1 50%" })).toBeVisible();
    expect(within(table).getByRole("row", { name: "Completed 1 50%" })).toBeVisible();
    expect(within(figure).getByRole("img", { name: /Projects by current stage\./ })).toBe(chartHost);
    expect(get.mock.calls.filter(([path]) => path.startsWith("/admin/dashboard/overview?")).length).toBe(1);
  });
  it("keeps project-status segments keyboard-operable for the project drilldown", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole("heading", { name: "Overview", level: 2 });
    const figure = screen.getByRole("figure", { name: "Projects by current stage" });
    const chart = within(figure).getByRole("img", { name: /Projects by current stage\./ });
    chart.focus();
    await user.keyboard("{Home}{ArrowRight}{Enter}");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeVisible());
    expect(get.mock.calls.some(([path]) => path.includes("projectStatus=active"))).toBe(true);
  });
  it("replaces tabs with keyboard-operable visual links and restores focus on return", async () => {
    const get = installDashboardApi({ overview: { ...superAdminDashboardOverviewFixture, period: { ...superAdminDashboardOverviewFixture.period, days: 90 } } });
    const user = userEvent.setup();
    renderDashboard("/admin/dashboard?periodDays=90&comparison=off&search=old&offset=40&role=worker_plumber");
    const entry = await screen.findByRole("link", { name: /Estimation approvals/ });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Dashboard section" })).not.toBeInTheDocument();
    entry.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Estimation", level: 2 })).toHaveFocus());
    expect(get.mock.calls.some(([path]) => path === "/admin/dashboard/projects?periodDays=90&module=estimation&sort=risk_desc&limit=20&offset=0")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Back to dashboard" }));
    await waitFor(() => expect(screen.getByRole("link", { name: /Estimation approvals/ })).toHaveFocus());
    await user.click(screen.getByRole("link", { name: "View workforce" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Workforce", level: 2 })).toHaveFocus());
    expect(await screen.findAllByText("Aarav Electrician")).not.toHaveLength(0);
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
    await user.click(screen.getByText(/More workforce metrics/));
    expect(screen.queryByText("No authoritative capacity denominator")).not.toBeInTheDocument();
    expect(screen.queryByText("Capacity utilization")).not.toBeInTheDocument();
  });
  it("restores the filtered detail view through browser Back and Forward", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard("/admin/dashboard?periodDays=90&comparison=off", undefined, true);
    await user.click(await screen.findByRole("button", { name: "View active projects" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toHaveFocus());
    expect(screen.getByTestId("current-url")).toHaveTextContent("projectStatus=active");
    expect(screen.getByTestId("current-url")).toHaveTextContent("periodDays=90");
    expect(screen.getByTestId("current-url")).toHaveTextContent("comparison=off");
    await user.click(screen.getByRole("button", { name: "Browser back" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "View active projects" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Browser forward" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toHaveFocus());
    expect(screen.getByTestId("current-url")).toHaveTextContent("projectStatus=active");
    expect(get.mock.calls.some(([path]) => path.includes("projectStatus=active"))).toBe(true);
  });

  it("opens stable worker-role filters and clearly named schedule-risk details", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("link", { name: /Electrician 1/ }));
    await screen.findByRole("heading", { name: "Workforce", level: 2 });
    expect(get.mock.calls.some(([path]) => path.includes("/workforce?") && path.includes("role=worker_electrician"))).toBe(true);
    await user.click(screen.getByRole("button", { name: "Back to dashboard" }));
    await user.click(await screen.findByRole("link", { name: /Live overdue projects:.*Review schedule risk/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Schedule risk", level: 2 })).toHaveFocus());
    expect(get.mock.calls.some(([path]) => path.includes("riskFactor=schedule") && path.includes("sort=deadline_asc"))).toBe(true);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("falls back invalid URL values to Overview and 30 days", async () => {
    const get = installDashboardApi();
    renderDashboard("/admin/dashboard?tab=prediction&periodDays=365");

    expect(await screen.findByRole("heading", { name: "Overview", level: 2 })).toBeVisible();
    expect(get).toHaveBeenCalledWith("/admin/dashboard/overview?periodDays=30");
  });

  it("changes the project request and cache identity with the selected period", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard("/admin/dashboard?tab=projects&periodDays=30");
    expect(await screen.findAllByText("North Residence")).not.toHaveLength(0);
    expect(get.mock.calls.some(([path]) => path.startsWith(
      "/admin/dashboard/projects?periodDays=30&"
    ))).toBe(true);

    await user.selectOptions(screen.getByRole("combobox", { name: "Reporting period" }), "90");
    await waitFor(() => expect(get.mock.calls.some(([path]) => path.startsWith(
      "/admin/dashboard/projects?periodDays=90&"
    ))).toBe(true));
  });

  it("suppresses numeric procurement amount and variance marked unavailable, never fabricating zero", async () => {
    const unavailableMetricKeys = [
      "procurement.approvedAmountPaise",
      "procurement.variancePaise"
    ];
    installDashboardApi({
      overview: {
        ...superAdminDashboardOverviewFixture,
        procurement: {
          ...superAdminDashboardOverviewFixture.procurement,
          plannedAmountPaise: 3_000_000,
          variancePaise: 1_800_000
        },
        dataQuality: {
          status: "partial",
          totalIssueCount: unavailableMetricKeys.length,
          unavailableMetricKeys,
          issues: unavailableMetricKeys.map((metricKey) => ({
            code: "module_aggregate_unavailable" as const,
            metricKey,
            message: `${metricKey} could not be verified.`,
            entityType: null,
            entityId: null
          }))
        }
      },
      projects: {
        ...superAdminDashboardProjectsPageFixture,
        dataQuality: {
          status: "partial",
          totalIssueCount: unavailableMetricKeys.length,
          unavailableMetricKeys,
          issues: unavailableMetricKeys.map((metricKey) => ({
            code: "module_aggregate_unavailable" as const,
            metricKey,
            message: `${metricKey} could not be verified.`,
            entityType: null,
            entityId: null
          }))
        }
      }
    });
    renderDashboard("/admin/dashboard?tab=procurement&periodDays=30");

    await screen.findByRole("heading", { name: "Procurement", level: 2 });
    expect(screen.queryByText("Approved procurement amount")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByText(/More procurement metrics/));
    expect(screen.queryByText("Variance")).not.toBeInTheDocument();
    expect(await screen.findAllByText(/posted of Not available approved/)).not.toHaveLength(0);
  });

  it("hides unavailable risk summaries while preserving project records", async () => {
    const unavailableKeys = ["risk.projectDistribution", "risk.factorDistribution", "risk.topProjects", "projects.completionRate"];
    installDashboardApi({ overview: { ...superAdminDashboardOverviewFixture, dataQuality: { status: "partial", totalIssueCount: unavailableKeys.length, unavailableMetricKeys: unavailableKeys, issues: unavailableKeys.map((metricKey) => ({ code: "module_aggregate_unavailable" as const, metricKey, message: `${metricKey} could not be verified.`, entityType: null, entityId: null })) } } });
    const overviewRender = renderDashboard();

    const queue = await screen.findByRole("region", { name: "Operational actions" });
    expect(within(queue).queryByText("Red-risk projects")).not.toBeInTheDocument();
    expect(await screen.findByText("North Residence")).toBeVisible();
    expect(screen.getByRole("region", { name: "Priority projects" })).not.toHaveTextContent("risk.topProjects could not be verified.");
    expect(screen.getByRole("heading", { name: "Module progress" })).toBeVisible();

    overviewRender.unmount();
    renderDashboard("/admin/dashboard?tab=risk&periodDays=30");
    await screen.findByRole("heading", { name: "Risk", level: 2 });
    expect(screen.queryByText("Red-risk projects")).not.toBeInTheDocument();
  });
  it("shows initial loading and retains verified data during a background refresh", async () => {
    const loading = deferred<never>();
    vi.spyOn(apiClient, "get").mockImplementation(() => loading.promise);
    const first = renderDashboard();
    expect(await screen.findByText("Loading organization dashboard…")).toBeInTheDocument();
    first.unmount();

    vi.restoreAllMocks();
    const refreshing = deferred<never>();
    vi.spyOn(apiClient, "get").mockImplementation(() => refreshing.promise);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    queryClient.setQueryData(
      dashboardKeys.overview(30),
      superAdminDashboardOverviewFixture,
      { updatedAt: 1 }
    );
    renderDashboard(undefined, queryClient);
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    expect(screen.getByText("Refreshing dashboard…")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Module progress" })).toBeVisible();
  });

  it("keeps visual destinations on the selected period while showing the previous verified snapshot", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "super-admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", ["projects.design_workflow.payments.read"]) } as ReturnType<typeof useAuth>);
    const pendingOverview = deferred<SuperAdminDashboardOverview>();
    const read = vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
      if (path === "/admin/dashboard/overview?periodDays=30") return superAdminDashboardOverviewFixture as never;
      if (path === "/admin/dashboard/overview?periodDays=90") return pendingOverview.promise as never;
      if (path.startsWith("/admin/dashboard/projects?")) return superAdminDashboardProjectsPageFixture as never;
      if (path === "/design-workflow/payment-confirmations") return [] as never;
      throw new Error(`Unexpected dashboard request: ${path}`);
    });
    const user = userEvent.setup();
    const { queryClient, unmount } = renderDashboard("/admin/dashboard?periodDays=30&comparison=off");
    try {
      const headline = await screen.findByRole("region", { name: "Organization headline metrics" });
      const snapshot = within(headline).getByText("Total projects").closest("article")!.textContent;
      const reportingContext = screen.getByRole("region", { name: "Reporting context" }).textContent;
      await user.selectOptions(screen.getByRole("combobox", { name: "Reporting period" }), "90");
      expect(screen.getByText("Refreshing dashboard…")).toBeVisible();
      expect(within(headline).getByText("Total projects").closest("article")!.textContent).toBe(snapshot);
      expect(screen.getByRole("region", { name: "Reporting context" }).textContent).toBe(reportingContext);
      expect(screen.getByRole("region", { name: "Reporting context" })).toHaveTextContent("30 days");
      const destinations = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/admin/dashboard?"));
      expect(destinations.length).toBeGreaterThan(10);
      for (const link of destinations) {
        const params = new URLSearchParams(link.getAttribute("href")!.split("?")[1]);
        expect(params.get("periodDays")).toBe("90");
        expect(params.get("comparison")).toBe("off");
      }
      await user.click(screen.getByRole("link", { name: "Finance details" }));
      await waitFor(() => expect(screen.getByRole("heading", { name: "Finance", level: 2 })).toHaveFocus());
      expect(read.mock.calls.some(([path]) => path.startsWith("/admin/dashboard/projects?periodDays=90&module=finance&"))).toBe(true);
      expect(screen.getByRole("combobox", { name: "Reporting period" })).toHaveValue("90");
    } finally {
      unmount();
      pendingOverview.resolve({ ...superAdminDashboardOverviewFixture, period: { ...superAdminDashboardOverviewFixture.period, days: 90 } });
      queryClient.clear();
    }
  });

  it("keeps the verified executive view mounted while rapid period requests resolve out of order", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, right: 800, bottom: 300, left: 0, width: 800, height: 300, toJSON: () => ({}) });
    const forPeriod = (days: 7 | 30 | 90, projectTotal: number): SuperAdminDashboardOverview => {
      const comparison = superAdminDashboardOverviewFixture.comparison!;
      return {
        ...superAdminDashboardOverviewFixture,
        observedAt: `2026-09-${String(days === 7 ? 7 : days === 30 ? 8 : 9).padStart(2, "0")}T12:00:00.000Z`,
        period: { ...superAdminDashboardOverviewFixture.period, days },
        projects: { ...superAdminDashboardOverviewFixture.projects, total: projectTotal },
        comparison: { ...comparison, window: { ...comparison.window, current: { ...comparison.window.current, days }, previous: { ...comparison.window.previous, days } } }
      };
    };
    const thirtyDayData = forPeriod(30, 30);
    const ninetyDayData = forPeriod(90, 90);
    const sevenDayData = forPeriod(7, 7);
    const ninetyDayRequest = deferred<SuperAdminDashboardOverview>();
    const sevenDayRequest = deferred<SuperAdminDashboardOverview>();
    vi.spyOn(apiClient, "get").mockImplementation((path) => {
      if (path === "/design-workflow/payment-confirmations") return Promise.resolve([] as never);
      if (path === "/admin/dashboard/overview?periodDays=30") return Promise.resolve(thirtyDayData as never);
      if (path === "/admin/dashboard/overview?periodDays=90") return ninetyDayRequest.promise as never;
      if (path === "/admin/dashboard/overview?periodDays=7") return sevenDayRequest.promise as never;
      throw new Error(`Unexpected dashboard request: ${path}`);
    });
    const user = userEvent.setup();
    const { queryClient } = renderDashboard();

    const headline = await screen.findByRole("region", { name: "Organization headline metrics" });
    const projectsMetric = within(headline).getByText("Total projects").closest("article")!;
    expect(within(projectsMetric).getByText("30")).toBeVisible();
    const activityHost = screen.getByRole("img", { name: /Recorded expenses over time\./ });
    await waitFor(() => expect(dashboardChartRuntimeMock.init).toHaveBeenCalledTimes(4));
    const activityInstance = dashboardChartRuntimeMock.instances.get("dashboard-recorded-cost-activity")!;
    const initialUpdates = activityInstance.update.mock.calls.length;

    const period = screen.getByRole("combobox", { name: "Reporting period" });
    await user.selectOptions(period, "90");
    expect(screen.getByText("Refreshing dashboard…")).toBeVisible();
    expect(within(projectsMetric).getByText("30")).toBeVisible();
    await user.selectOptions(period, "7");

    act(() => ninetyDayRequest.resolve(ninetyDayData));
    await waitFor(() => expect(queryClient.getQueryData(dashboardKeys.overview(90))).toBe(ninetyDayData));
    expect(within(projectsMetric).getByText("30")).toBeVisible();

    act(() => sevenDayRequest.resolve(sevenDayData));
    await waitFor(() => expect(within(projectsMetric).getByText("7")).toBeVisible());
    expect(screen.getByRole("img", { name: /Recorded expenses over time\./ })).toBe(activityHost);
    expect(screen.queryByText("Refreshing dashboard…")).not.toBeInTheDocument();
    expect(dashboardChartRuntimeMock.init).toHaveBeenCalledTimes(4);
    expect(dashboardChartRuntimeMock.instances.get("dashboard-recorded-cost-activity")).toBe(activityInstance);
    expect(activityInstance.update.mock.calls.length).toBeGreaterThan(initialUpdates);
  });
  it("keeps Overview available when the selected project page fails", async () => {
    vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
      if (path.startsWith("/admin/dashboard/overview?")) {
        return superAdminDashboardOverviewFixture as never;
      }
      throw new Error("project page unavailable");
    });
    renderDashboard("/admin/dashboard?tab=projects&periodDays=30");

    expect(await screen.findByText("Projects project details could not be loaded.")).toBeVisible();
    expect(screen.getByText("All projects")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("distinguishes an empty organization from a no-match project filter", async () => {
    installDashboardApi({
      overview: {
        ...superAdminDashboardOverviewFixture,
        projects: {
          ...superAdminDashboardOverviewFixture.projects,
          total: 0,
          atRisk: 0
        },
        risk: {
          ...superAdminDashboardOverviewFixture.risk,
          projectDistribution: { gray: 0, green: 0, yellow: 0, red: 0 },
          factorDistribution: [],
          topProjects: []
        }
      }
    });
    const empty = renderDashboard();
    expect(await screen.findByText(/No projects yet/)).toBeVisible();
    empty.unmount();

    vi.restoreAllMocks();
    installDashboardApi({
      projects: {
        ...superAdminDashboardProjectsPageFixture,
        items: [],
        pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
      }
    });
    renderDashboard("/admin/dashboard?tab=projects&periodDays=30&search=missing");
    expect(await screen.findByText("No projects match these filters.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Clear filters" })).toHaveLength(2);
  });

  it("retains refresh focus and updates only after a successful request", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();
    const refresh = await screen.findByRole("button", { name: "Refresh dashboard" });

    await user.click(refresh);
    await waitFor(() => expect(get.mock.calls.filter(([path]) => path.startsWith("/admin/dashboard/overview?")).length).toBe(2));
    expect(refresh).toHaveFocus();
    expect(await screen.findByText("Dashboard updated.")).toBeInTheDocument();
  });

  it("shows a page-level retry without fabricating data on initial failure", async () => {
    vi.spyOn(apiClient, "get").mockRejectedValue(new Error("offline"));
    renderDashboard();

    expect(await screen.findByText("The organization dashboard could not be loaded.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();
  });

  it("downloads the active tab's displayed report with exact dates, filters, page scope and safe project text", async () => {
    const name = '=SUM(A1), "Atrium"\nLevel 2';
    installDashboardApi({ projects: {
      ...superAdminDashboardProjectsPageFixture,
      observedAt: "2026-08-30T12:31:00.000Z",
      items: [{ ...superAdminDashboardProjectsPageFixture.items[0], projectName: name }],
      pagination: { limit: 20, offset: 20, total: 43, hasMore: true }
    } });
    const createObjectURL = vi.fn((_blob: Blob) => "blob:page-dashboard-report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked = this; });
    const user = userEvent.setup();
    renderDashboard("/admin/dashboard?tab=finance&periodDays=30&comparison=off&search=Atrium&offset=20&sort=name_asc");
    const button = await screen.findByRole("button", { name: "Export Report" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByText("Dashboard report downloaded.")).toBeInTheDocument();
    expect(clicked?.download).toMatch(/^Lisno-finance-report-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(clicked?.isConnected).toBe(false);
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(createObjectURL.mock.calls[0][0]);
    });
    expect(csv).toContain('"Active tab","finance"');
    expect(csv).toContain('"Requested period (days)",30');
    expect(csv).toContain('"Comparison","Disabled"');
    expect(csv).toContain('"search","Atrium"');
    expect(csv).toContain('"sort","name_asc"');
    expect(csv).toContain('"Period start (UTC)","2026-08-01T00:00:00.000Z"');
    expect(csv).toContain('"Observed at (UTC)","2026-08-30T12:30:00.000Z"');
    expect(csv).toContain('"Observed at (UTC)","2026-08-30T12:31:00.000Z"');
    expect(csv).toContain('"Current page only; not the full matching dataset."');
    expect(csv).toContain('"Page offset (zero-based)",20');
    expect(csv).toContain('"Rows loaded",1');
    expect(csv).toContain('"Total matching records",43');
    expect(csv).toContain('"Recorded expenses (INR)"');
    expect(csv).toContain('"2026-08-30",2500');
    expect(csv).toContain('"\'=SUM(A1), ""Atrium""\nLevel 2"');
    expect(csv).not.toContain("/admin/projects/");
    expect(csv).not.toContain("Vendor classification requests");
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:page-dashboard-report"), { timeout: 2000 });
  });

  it("disables export until both the selected period summary and its priority page are ready", async () => {
    const overview90 = deferred<SuperAdminDashboardOverview>();
    const projects90 = deferred<SuperAdminDashboardProjectsPage>();
    vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
      if (path === "/admin/dashboard/overview?periodDays=30") return superAdminDashboardOverviewFixture as never;
      if (path === "/admin/dashboard/overview?periodDays=90") return overview90.promise as never;
      if (path.startsWith("/admin/dashboard/projects?periodDays=30&")) return superAdminDashboardProjectsPageFixture as never;
      if (path.startsWith("/admin/dashboard/projects?periodDays=90&")) return projects90.promise as never;
      throw new Error(`Unexpected dashboard request: ${path}`);
    });
    const download = vi.spyOn(dashboardReport, "downloadDashboardReport").mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderDashboard();
    const button = await screen.findByRole("button", { name: "Export Report" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.selectOptions(screen.getByRole("combobox", { name: "Reporting period" }), "90");
    expect(button).toBeDisabled();
    expect(screen.getByText(/Loading the selected period/)).toBeVisible();
    await user.click(button);
    expect(download).not.toHaveBeenCalled();
    const period = { days: 90 as const, startAt: "2026-06-02T00:00:00.000Z", endAt: "2026-08-30T12:30:00.000Z" };
    act(() => overview90.resolve({ ...superAdminDashboardOverviewFixture, period }));
    await waitFor(() => expect(screen.queryByText(/Loading the selected period/)).not.toBeInTheDocument());
    expect(button).toBeDisabled();
    act(() => projects90.resolve({ ...superAdminDashboardProjectsPageFixture, period }));
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(download).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ requestedPeriodDays: 90, sections: expect.arrayContaining([
      expect.objectContaining({ id: "summary", period }), expect.objectContaining({ id: "priority-projects", period })
    ]) }));
  });

  it("exports an independently failed priority section as unavailable while retaining verified summary data", async () => {
    vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
      if (path.startsWith("/admin/dashboard/overview?")) return superAdminDashboardOverviewFixture as never;
      throw new Error("Priority request failed");
    });
    const download = vi.spyOn(dashboardReport, "downloadDashboardReport").mockImplementation(() => undefined);
    renderDashboard();
    await screen.findByText("Priority projects are unavailable. Other dashboard sections remain available.");
    const button = screen.getByRole("button", { name: "Export Report" });
    expect(button).toBeEnabled();
    await userEvent.setup().click(button);
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ sections: expect.arrayContaining([
      expect.objectContaining({ id: "summary", state: "ready", observedAt: superAdminDashboardOverviewFixture.observedAt }),
      expect.objectContaining({ id: "priority-projects", state: "unavailable", observedAt: null, period: null, tables: [] })
    ]) }));
  });

  it.each([false, true])("exports design responses with their source availability (unavailable: %s)", async (unavailable) => {
    const overview = structuredClone(superAdminDashboardOverviewFixture);
    overview.governance.pendingDesignResponses = 3;
    if (unavailable) overview.dataQuality = { status: "partial", totalIssueCount: 1, unavailableMetricKeys: ["governance.pendingDesignResponses"], issues: [] };
    installDashboardApi({ overview });
    const download = vi.spyOn(dashboardReport, "downloadDashboardReport").mockImplementation(() => undefined);
    renderDashboard();
    const button = await screen.findByRole("button", { name: "Export Report" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.setup().click(button);
    const actions = download.mock.calls[0][0].sections.find((section) => section.id === "summary")!.tables.find((table) => table.title === "Pending actions")!;
    expect(actions.rows).toContainEqual(["Pending design responses", unavailable ? "Not available" : 3, unavailable ? "Unavailable" : "Requires review", unavailable ? "Authoritative data is unavailable for this metric." : ""]);
  });

  it("reports download failure without claiming a successful export", async () => {
    installDashboardApi();
    vi.spyOn(dashboardReport, "downloadDashboardReport").mockImplementation(() => { throw new Error("Browser download unavailable"); });
    renderDashboard();
    const button = await screen.findByRole("button", { name: "Export Report" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.setup().click(button);
    expect(await screen.findByText("The report could not be downloaded. Try again.")).toBeVisible();
    expect(screen.queryByText("Dashboard report downloaded.")).not.toBeInTheDocument();
  });
});
