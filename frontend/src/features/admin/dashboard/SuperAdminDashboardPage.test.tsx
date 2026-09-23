import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
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
  dashboardChartRuntimeMock.init.mockClear();
  dashboardChartRuntimeMock.instances.clear();
  dashboardChartRuntimeMock.load.mockClear();
  vi.mocked(useAuth).mockReturnValue({ user: { id: "super-admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", []) } as ReturnType<typeof useAuth>);
});

afterEach(() => vi.restoreAllMocks());

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
    throw new Error(`Unexpected dashboard request: ${path}`);
  });
}

function renderDashboard(
  entry = "/admin/dashboard?tab=overview&periodDays=30",
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
) {
  return {
    queryClient,
    ...render(
    <QueryClientProvider client={queryClient}>
      <LoadingProvider><MemoryRouter initialEntries={[entry]}><SuperAdminDashboardPage /></MemoryRouter></LoadingProvider>
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
  it("uses stable UTC and semantic identities for executive ECharts transitions", () => {
    const activity = createRecordedCostActivityOption({
      trends: superAdminDashboardOverviewFixture.trends,
      approvedNetRevenuePaise: superAdminDashboardOverviewFixture.finance.approvedSubtotalPaise,
      costBudgetPaise: superAdminDashboardOverviewFixture.finance.costBudgetPaise,
      theme: chartTheme
    }) as unknown as { series: Array<Record<string, unknown>> };
    expect(activity.series).toEqual([
      expect.objectContaining({ id: "recorded-cost-activity", type: "bar", universalTransition: expect.anything() }),
      expect.objectContaining({ id: "approved-net-revenue-guide", type: "line", universalTransition: true }),
      expect.objectContaining({ id: "cost-budget-guide", type: "line", universalTransition: true })
    ]);
    expect((activity.series[0].data as Array<Record<string, unknown>>).map(({ id }) => id)).toEqual(["2026-08-30"]);

    const lifecycle = createExecutiveLifecycleOption({ data: superAdminDashboardOverviewFixture, theme: chartTheme }) as unknown as { series: Array<Record<string, unknown>> };
    expect(lifecycle.series[0]).toMatchObject({ id: "executive-project-status", type: "pie", universalTransition: expect.anything() });
    expect((lifecycle.series[0].data as Array<Record<string, unknown>>).map(({ id, groupId }) => ({ id, groupId }))).toEqual([
      { id: "planning", groupId: "projects.planning" },
      { id: "active", groupId: "projects.active" },
      { id: "on_hold", groupId: "projects.onHold" },
      { id: "completed", groupId: "projects.completed" }
    ]);
  });
  it("makes approved-project payment confirmations available from Overview", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "super-admin-one", role: "super_admin" }, authorization: authorizationFor("super_admin", ["projects.design_workflow.payments.read", "projects.design_workflow.act"]) } as ReturnType<typeof useAuth>);
    const get = installDashboardApi();
    renderDashboard();
    const region = await screen.findByRole("region", { name: "Initial payment confirmations" });
    expect(region).toHaveTextContent("After estimate approval");
    expect(await within(region).findByText("No projects are waiting for initial-payment confirmation.")).toBeVisible();
    const analyticsEnd = screen.getByRole("heading", { name: "Module summaries" });
    expect(analyticsEnd.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/design-workflow/payment-confirmations", { showGlobalLoader: false });
  });

  it("shows only one logo while the dashboard API and page are both loading", async () => {
    const pending = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(pending.promise);
    const { queryClient } = renderDashboard();
    try {
      expect(screen.getByRole("status", { name: "Dashboard status" })).toHaveTextContent("Loading organization dashboard…");
      expect(document.querySelectorAll(".lisno-loading-mark")).toHaveLength(1);
      expect(screen.getAllByRole("status")).toHaveLength(1);
      pending.resolve(Response.json({ data: superAdminDashboardOverviewFixture }));
      expect(await screen.findByRole("heading", { name: "Organization overview" })).toBeVisible();
      await waitFor(() => expect(document.querySelectorAll(".lisno-loading-mark")).toHaveLength(0));
    } finally {
      pending.resolve(Response.json({ data: superAdminDashboardOverviewFixture }));
      queryClient.clear();
    }
  });

  it("renders one organization-wide request as the reference-led executive overview", async () => {
    const get = installDashboardApi();
    const { container } = renderDashboard();

    expect(await screen.findByRole("heading", { name: "Organization overview" })).toBeVisible();
    for (const heading of [
      "Recorded cost activity",
      "Project status",
      "Priority project",
      "Action queue",
      "Cost composition",
      "Budget position",
      "Module progress",
      "Workforce summary",
      "Module summaries"
    ]) expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    const headline = screen.getByRole("region", { name: "Organization headline metrics" });
    for (const label of ["Total projects", "Approved net revenue", "Approved contract value", "Current margin", "Live overdue projects"]) {
      expect(within(headline).getByText(label)).toBeVisible();
    }
    expect(screen.queryByText(/Pipeline value|Revenue trend|Recent activity|Top vendors/i)).not.toBeInTheDocument();

    const requested = get.mock.calls.map(([path]) => path);
    expect(requested.filter((path) => path.startsWith("/admin/dashboard/overview?"))).toHaveLength(1);
    expect(requested.join(" ")).not.toMatch(/\/admin\/projects|\/finance\/projects/);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
  it("keeps every executive finance mark in its exact-value table", async () => {
    installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    const activity = await screen.findByRole("figure", { name: "Recorded cost activity" });
    await user.click(within(activity).getByRole("button", { name: "Show values" }));
    expect(within(activity).getByRole("row", { name: /30 Aug.*₹2,500\.00.*₹1,00,000\.00.*₹80,000\.00/ })).toBeVisible();

    const composition = screen.getByRole("figure", { name: "Cost composition" });
    await user.click(within(composition).getByRole("button", { name: "Show values" }));
    expect(within(composition).getByRole("row", { name: /Procurement.*₹12,000\.00/ })).toBeVisible();
    expect(within(composition).getByRole("row", { name: /Employee payments.*₹9,000\.00/ })).toBeVisible();

    const budget = screen.getByRole("figure", { name: "Budget position" });
    await user.click(within(budget).getByRole("button", { name: "Show values" }));
    expect(within(budget).getByRole("row", { name: /Cost budget.*₹80,000\.00/ })).toBeVisible();
    expect(within(budget).getByRole("row", { name: /Remaining budget.*₹52,000\.00/ })).toBeVisible();
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
    const user = userEvent.setup();
    renderDashboard();

    const figure = await screen.findByRole("figure", { name: "Cost composition" });
    expect(within(figure).getByRole("img", { name: /Recorded cost composition/ })).toBeVisible();
    expect(within(figure).getByText(/Employee payment lineage could not be verified/)).toBeVisible();
    await user.click(within(figure).getByRole("button", { name: "Show values" }));
    expect(within(figure).getByRole("row", { name: /Employee payments.*Not available/ })).toBeVisible();
    expect(within(figure).getByRole("row", { name: /Procurement.*₹12,000\.00/ })).toBeVisible();
  });
  it("narrates unavailable budget lineage without exposing raw fallback zeroes", async () => {
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
    const user = userEvent.setup();
    renderDashboard();

    const figure = await screen.findByRole("figure", { name: "Budget position" });
    const chart = within(figure).getByRole("img", {
      name: "Approved cost budget Not available, recorded cost Not available, remaining budget Not available."
    });
    expect(chart).toBeVisible();
    expect(chart).not.toHaveAccessibleName(/₹0\.00/);

    await user.click(within(figure).getByRole("button", { name: "Show values" }));
    expect(within(figure).getByRole("row", { name: "Cost budget Not available" })).toBeVisible();
    expect(within(figure).getByRole("row", { name: "Recorded cost Not available" })).toBeVisible();
    expect(within(figure).getByRole("row", { name: "Remaining budget Not available" })).toBeVisible();
  });
  it("presents five accurate headline metrics with explicit snapshot bases", async () => {
    installDashboardApi();
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    for (const label of ["Total projects", "Approved net revenue", "Approved contract value", "Current margin", "Live overdue projects"]) {
      expect(within(band).getByText(label)).toBeVisible();
    }
    expect(within(band).getByText("Client-approved subtotal; GST excluded")).toBeVisible();
    expect(within(band).getByText("Includes ₹18,000.00 GST")).toBeVisible();
    expect(within(band).getByText("72.00%")).toBeVisible();
    expect(within(band).getByText("Current incomplete portfolio")).toBeVisible();
  });
  it("keeps context-rail actions aligned with the live authorization snapshot", async () => {
    const get = installDashboardApi();
    const withoutPermissions = renderDashboard();

    const queue = await screen.findByRole("region", { name: "Action queue" });
    expect(screen.queryByRole("link", { name: "Directory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View project" })).not.toBeInTheDocument();
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

    expect(await screen.findByRole("link", { name: "Directory" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "View project" })).toHaveAttribute("href", "/admin/projects/project-risk");
    const permittedQueue = screen.getByRole("region", { name: "Action queue" });
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
    expect(within(within(band).getByText("Total projects").closest("article")!).getByText("Not available")).toBeVisible();
    expect(screen.queryByText(/No projects yet/)).not.toBeInTheDocument();
  });
  it("stores comparison visibility in URL state and updates project activity without refetching", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    const toggle = await screen.findByRole("checkbox", { name: "Compare with previous period" });
    const metric = within(screen.getByRole("region", { name: "Organization headline metrics" })).getByText("Total projects").closest("article")!;
    expect(toggle).toBeChecked();
    expect(metric).toHaveTextContent("vs previous");
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(metric).toHaveTextContent("created in the selected period");
    expect(metric).not.toHaveTextContent("vs previous");
    expect(screen.getByRole("link", { name: /Finance/ })).toHaveAttribute("href", expect.stringContaining("comparison=off"));
    expect(get.mock.calls.filter(([path]) => path.startsWith("/admin/dashboard/overview?")).length).toBe(1);
  });

  it("keeps current project activity when the previous comparison is unavailable", async () => {
    const sourceComparison = superAdminDashboardOverviewFixture.comparison!;
    installDashboardApi({ overview: { ...superAdminDashboardOverviewFixture, comparison: { ...sourceComparison, metrics: { ...sourceComparison.metrics, projects_created: { ...sourceComparison.metrics.projects_created, previous: null, previousStatus: "unavailable", previousUnavailableReason: "Previous project history could not be verified.", delta: null, changeBps: null, changeKind: "unavailable" } } } } });
    renderDashboard();

    const card = within(await screen.findByRole("region", { name: "Organization headline metrics" })).getByText("Total projects").closest("article")!;
    expect(card).toHaveTextContent("1 project created");
    expect(card).toHaveTextContent("Previous project history could not be verified.");
  });
  it("keeps snapshot KPIs visible when current project activity is unavailable", async () => {
    const sourceComparison = superAdminDashboardOverviewFixture.comparison!;
    installDashboardApi({ overview: { ...superAdminDashboardOverviewFixture, comparison: { ...sourceComparison, metrics: { ...sourceComparison.metrics, projects_created: { ...sourceComparison.metrics.projects_created, current: null, currentStatus: "unavailable", currentUnavailableReason: "Current project history could not be verified.", delta: null, changeBps: null, changeKind: "unavailable" } } } } });
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    const card = within(band).getByText("Total projects").closest("article")!;
    expect(card).toHaveTextContent("2");
    expect(card).toHaveTextContent("Current project history could not be verified.");
    expect(within(band).getByText("₹1,00,000.00")).toBeVisible();
  });
  it("uses backend project-activity delta fields without recomputing them", async () => {
    const comparison = superAdminDashboardOverviewFixture.comparison!;
    installDashboardApi({ overview: { ...superAdminDashboardOverviewFixture, comparison: { ...comparison, metrics: { ...comparison.metrics, projects_created: { ...comparison.metrics.projects_created, delta: 77, changeBps: 1234, changeKind: "percentage" } } } } });
    renderDashboard();
    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    expect(within(band).getByText(/\+77 \(\+12\.34%\) vs previous/)).toBeVisible();
    expect(within(band).queryByText(/−1 \(−50/)).not.toBeInTheDocument();
  });
  it("marks optional comparison and Client fields unavailable while retaining verified snapshots", async () => {
    const { clients: _clients, comparison: _comparison, ...oldOverview } = superAdminDashboardOverviewFixture;
    installDashboardApi({ overview: oldOverview });
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    expect(within(band).getByText("Total projects").closest("article")).toHaveTextContent("2");
    expect(within(band).getByText("Total projects").closest("article")).toHaveTextContent("Period project activity is not available");
    expect(within(band).getByText("Approved net revenue").closest("article")).toHaveTextContent("₹1,00,000.00");
    expect(screen.getByRole("region", { name: "Client pulse" })).toHaveTextContent("This response predates Client reporting.");
  });
  it("opens a lifecycle drilldown with the selected stable project status", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    const lifecycle = await screen.findByRole("navigation", { name: "Filter projects by lifecycle stage" });
    await user.click(within(lifecycle).getByRole("link", { name: /Active\s+1/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeVisible());
    expect(get.mock.calls.some(([path]) => path.includes("projectStatus=active"))).toBe(true);
  });

  it("keeps the project-status doughnut mounted while exposing exact values", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    const figure = await screen.findByRole("figure", { name: "Project status" });
    const chartHost = within(figure).getByRole("img", { name: /Project status doughnut/ });
    await user.click(within(figure).getByRole("button", { name: "Show values" }));
    const table = within(figure).getByRole("table");
    expect(within(table).getByRole("row", { name: "Active 1 50%" })).toBeVisible();
    expect(within(table).getByRole("row", { name: "Completed 1 50%" })).toBeVisible();
    expect(within(figure).getByRole("img", { name: /Project status doughnut/ })).toBe(chartHost);
    expect(get.mock.calls.filter(([path]) => path.startsWith("/admin/dashboard/overview?")).length).toBe(1);
  });
  it("keeps project-status segments keyboard-operable for the project drilldown", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    const figure = await screen.findByRole("figure", { name: "Project status" });
    const chart = within(figure).getByRole("img", { name: /Project status doughnut/ });
    chart.focus();
    await user.keyboard("{Home}{ArrowRight}{Enter}");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeVisible());
    expect(get.mock.calls.some(([path]) => path.includes("projectStatus=active"))).toBe(true);
  });
  it("supports roving focus, explicit activation, URL-backed tabs, and panel focus", async () => {
    installDashboardApi();
    const user = userEvent.setup();
    renderDashboard("/admin/dashboard?tab=projects&periodDays=30");

    const projectsTab = await screen.findByRole("tab", { name: "Projects" });
    expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeVisible();
    expect(await screen.findAllByText("North Residence")).not.toHaveLength(0);

    projectsTab.focus();
    await user.keyboard("{ArrowRight}");
    const estimationTab = screen.getByRole("tab", { name: "Estimation" });
    expect(estimationTab).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeVisible();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Estimation", level: 2 })).toHaveFocus());

    await user.selectOptions(screen.getByRole("combobox", { name: "Dashboard section" }), "workforce");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Workforce", level: 2 })).toHaveFocus());
    expect(await screen.findAllByText("Aarav Electrician")).not.toHaveLength(0);
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
    expect(screen.getByText("No authoritative capacity denominator")).toBeVisible();
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

    const approved = (await screen.findByText("Approved procurement amount")).closest("article");
    const variance = screen.getByText("Variance").closest("article");
    expect(approved).not.toBeNull();
    expect(variance).not.toBeNull();
    expect(within(approved!).getByText("Not available")).toBeVisible();
    expect(within(variance!).getByText("Not available")).toBeVisible();
    expect(await screen.findAllByText(/posted of Not available approved/)).not.toHaveLength(0);
    expect(within(approved!).queryByText(/₹30,000/)).not.toBeInTheDocument();
    expect(within(variance!).queryByText(/₹18,000/)).not.toBeInTheDocument();
  });

  it("shows unavailable risk and project context without manufacturing zero", async () => {
    const unavailableKeys = ["risk.projectDistribution", "risk.factorDistribution", "risk.topProjects", "projects.completionRate"];
    installDashboardApi({ overview: { ...superAdminDashboardOverviewFixture, dataQuality: { status: "partial", totalIssueCount: unavailableKeys.length, unavailableMetricKeys: unavailableKeys, issues: unavailableKeys.map((metricKey) => ({ code: "module_aggregate_unavailable" as const, metricKey, message: `${metricKey} could not be verified.`, entityType: null, entityId: null })) } } });
    const overviewRender = renderDashboard();

    const queue = await screen.findByRole("region", { name: "Action queue" });
    expect(within(queue).getByText("Red-risk projects").closest("li")).toHaveTextContent("Not available");
    expect(screen.getByRole("region", { name: "Priority project" })).toHaveTextContent("risk.topProjects could not be verified.");
    expect(screen.queryByText("North Residence")).not.toBeInTheDocument();
    const modules = screen.getByRole("region", { name: "Module summaries" });
    expect(within(within(modules).getByText("Risk").closest("a")!).getByText("Not available")).toBeVisible();

    overviewRender.unmount();
    renderDashboard("/admin/dashboard?tab=risk&periodDays=30");
    const riskTabRed = (await screen.findByText("Red-risk projects")).closest("article")!;
    expect(within(riskTabRed).getByText("Not available")).toBeVisible();
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
    expect(await screen.findByRole("heading", { name: "Organization overview" })).toBeVisible();
    expect(screen.getByText("Refreshing dashboard…")).toBeVisible();
    expect(screen.getByText("Module summaries")).toBeVisible();
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
    const activityHost = screen.getByRole("img", { name: /Recorded cost postings by UTC day/ });
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
    expect(screen.getByRole("img", { name: /Recorded cost postings by UTC day/ })).toBe(activityHost);
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
});
