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
  createNamedGrowthData,
  createProjectLifecycleChartOption
} from "./DashboardOverviewCharts";
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
  it("uses stable UTC and lifecycle identities for ECharts data transitions", () => {
    const comparison = superAdminDashboardOverviewFixture.comparison!;
    const namedGrowth = createNamedGrowthData(
      comparison.currentBuckets,
      "projectsCreated",
      (value) => String(value)
    );
    expect(namedGrowth.map((datum) => datum.name)).toEqual(
      comparison.currentBuckets.map((bucket) => bucket.date.slice(0, 10))
    );

    const lifecycleData = {
      ...superAdminDashboardOverviewFixture,
      projects: {
        ...superAdminDashboardOverviewFixture.projects,
        planning: 2,
        active: 2,
        onHold: 3,
        completed: 1
      }
    };
    const doughnut = createProjectLifecycleChartOption({ data: lifecycleData, theme: chartTheme, view: "doughnut" });
    const rankedBars = createProjectLifecycleChartOption({ data: lifecycleData, theme: chartTheme, view: "ranked_bar" });
    const doughnutSeries = (doughnut as unknown as { series: Array<Record<string, unknown>> }).series[0];
    const rankedSeries = (rankedBars as unknown as { series: Array<Record<string, unknown>> }).series[0];

    expect(doughnutSeries).toMatchObject({
      id: "project-lifecycle",
      type: "pie",
      universalTransition: { enabled: true, divideShape: "clone" }
    });
    expect(rankedSeries).toMatchObject({
      id: "project-lifecycle",
      type: "bar",
      universalTransition: { enabled: true, divideShape: "clone" }
    });
    expect((doughnutSeries.data as Array<Record<string, unknown>>).map(({ name, groupId }) => ({ name, groupId }))).toEqual([
      { name: "planning", groupId: "planning" },
      { name: "active", groupId: "active" },
      { name: "on_hold", groupId: "on_hold" },
      { name: "completed", groupId: "completed" }
    ]);
    expect((rankedSeries.data as Array<Record<string, unknown>>).map(({ name, groupId }) => ({ name, groupId }))).toEqual([
      { name: "on_hold", groupId: "on_hold" },
      { name: "planning", groupId: "planning" },
      { name: "active", groupId: "active" },
      { name: "completed", groupId: "completed" }
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

  it("renders one organization-wide Overview request with every approved domain summary", async () => {
    const get = installDashboardApi();
    const { container } = renderDashboard();

    expect(await screen.findByRole("heading", { name: "Organization overview" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Organization headline metrics" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Current period activity" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Registered Client accounts" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Current delivery stage" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Budget and recorded cost" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Module summaries" })).toBeVisible();
    expect(screen.getByText("Approved net revenue")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: /project/i })).not.toBeInTheDocument();

    const requested = get.mock.calls.map(([path]) => path);
    expect(requested.filter((path) => path.startsWith("/admin/dashboard/overview?"))).toHaveLength(1);
    expect(requested.join(" ")).not.toMatch(/\/admin\/projects|\/finance\/projects/);
    expect((await axe.run(container, {
      rules: { "color-contrast": { enabled: false } }
    })).violations).toEqual([]);
  });

  it("presents the four headline metrics with explicit snapshot and period bases", async () => {
    installDashboardApi();
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    for (const label of ["Projects", "Registered Clients", "Approved net revenue", "Recorded expenses"]) {
      expect(within(band).getByText(label)).toBeVisible();
    }
    expect(within(band).getByText("Current total · period activity")).toBeVisible();
    expect(within(band).getByText("Current Client accounts")).toBeVisible();
    expect(within(band).getByText("Current snapshot")).toBeVisible();
    expect(within(band).getByText("Selected 30-day incurred period")).toBeVisible();
    expect(within(band).queryByText(/\+77/)).not.toBeInTheDocument();
  });

  it("keeps cross-route actions aligned with the live authorization snapshot", async () => {
    const get = installDashboardApi();
    const withoutPermissions = renderDashboard();

    const attention = await screen.findByRole("region", { name: "Needs attention" });
    expect(screen.queryByRole("link", { name: "Open user directory" })).not.toBeInTheDocument();
    expect(within(within(attention).getByText("Pending Client responses").closest("li")!).queryByRole("link")).not.toBeInTheDocument();
    expect(within(within(attention).getByText("North Residence").closest("li")!).queryByRole("link", { name: "North Residence" })).not.toBeInTheDocument();
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

    expect(await screen.findByRole("link", { name: "Open user directory" })).toHaveAttribute("href", "/admin/users");
    const permittedAttention = screen.getByRole("region", { name: "Needs attention" });
    expect(within(within(permittedAttention).getByText("Pending Client responses").closest("li")!).getByRole("link")).toHaveAttribute("href", "/admin/client-responses");
    expect(within(within(permittedAttention).getByText("North Residence").closest("li")!).getByRole("link", { name: "North Residence" })).toHaveAttribute("href", "/admin/projects/project-risk");
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
          issues: [{
            code: "module_aggregate_unavailable",
            metricKey: "projects.total",
            message: "Project totals could not be verified.",
            entityType: null,
            entityId: null
          }]
        }
      }
    });
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    expect(within(within(band).getByText("Projects").closest("article")!).getByText("Not available")).toBeVisible();
    expect(screen.queryByText(/No projects yet/)).not.toBeInTheDocument();
  });

  it("stores comparison visibility in the URL state and removes previous values without refetching", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    const toggle = await screen.findByRole("checkbox", { name: "Compare with previous period" });
    const figure = screen.getByRole("figure", { name: "Current period activity" });
    const chartHost = within(figure).getByRole("img", { name: /current and previous reporting period/ });
    expect(toggle).toBeChecked();
    expect(within(figure).getByText("Previous period")).toBeVisible();
    await user.click(within(figure).getByRole("button", { name: "Show values" }));
    expect(within(figure).getByRole("columnheader", { name: "Previous" })).toBeVisible();

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(within(figure).queryByText("Previous period")).not.toBeInTheDocument();
    expect(within(figure).queryByRole("columnheader", { name: "Previous" })).not.toBeInTheDocument();
    expect(within(figure).getByRole("img", { name: /current reporting period/ })).toBe(chartHost);
    expect(screen.getByRole("link", { name: /View finance details/ })).toHaveAttribute("href", expect.stringContaining("comparison=off"));
    expect(get.mock.calls.filter(([path]) => path.startsWith("/admin/dashboard/overview?")).length).toBe(1);
  });

  it("updates the growth metric through the existing chart host", async () => {
    installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    const figure = await screen.findByRole("figure", { name: "Current period activity" });
    const chartHost = within(figure).getByRole("img", { name: /Projects created/ });
    await user.selectOptions(within(figure).getByRole("combobox", { name: "Growth chart metric" }), "clients_created");

    expect(within(figure).getByText(/Client accounts created, aligned by UTC day index/)).toBeVisible();
    expect(within(figure).getByRole("img", { name: /Client accounts created/ })).toBe(chartHost);
  });

  it("keeps current history when only the previous metric is unavailable and trusts backend deltas", async () => {
    const sourceComparison = superAdminDashboardOverviewFixture.comparison!;
    installDashboardApi({
      overview: {
        ...superAdminDashboardOverviewFixture,
        comparison: {
          ...sourceComparison,
          metrics: {
            ...sourceComparison.metrics,
            projects_created: {
              ...sourceComparison.metrics.projects_created,
              delta: 77,
              changeBps: 1234,
              previous: null,
              previousStatus: "unavailable",
              previousUnavailableReason: "Previous project history could not be verified.",
              changeKind: "unavailable"
            }
          }
        }
      }
    });
    const user = userEvent.setup();
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    expect(within(band).getByText(/1 project created · Previous project history could not be verified/)).toBeVisible();
    const figure = screen.getByRole("figure", { name: "Current period activity" });
    expect(within(figure).getByText(/Previous project history could not be verified/)).toBeVisible();
    await user.click(within(figure).getByRole("button", { name: "Show values" }));
    const table = within(figure).getByRole("table");
    expect(within(table).getByRole("row", { name: /Day 30.*30 Aug 2026.*1.*31 Jul 2026.*Not available/ })).toBeVisible();

  });

  it("uses backend delta fields without recomputing them in the browser", async () => {
    const comparison = superAdminDashboardOverviewFixture.comparison!;
    installDashboardApi({
      overview: {
        ...superAdminDashboardOverviewFixture,
        comparison: {
          ...comparison,
          metrics: {
            ...comparison.metrics,
            projects_created: {
              ...comparison.metrics.projects_created,
              delta: 77,
              changeBps: 1234,
              changeKind: "percentage"
            }
          }
        }
      }
    });
    renderDashboard();
    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    expect(within(band).getByText(/\+77 \(12\.34%\) vs previous/)).toBeVisible();
    expect(within(band).queryByText(/−1/)).not.toBeInTheDocument();
  });

  it("marks new reporting fields unavailable for an older response while retaining verified snapshots", async () => {
    const { clients: _clients, comparison: _comparison, ...oldOverview } = superAdminDashboardOverviewFixture;
    installDashboardApi({ overview: oldOverview });
    renderDashboard();

    const band = await screen.findByRole("region", { name: "Organization headline metrics" });
    const clientCard = within(band).getByText("Registered Clients").closest("article");
    const expenseCard = within(band).getByText("Recorded expenses").closest("article");
    expect(within(clientCard!).getByText("Not available")).toBeVisible();
    expect(within(expenseCard!).getByText("Not available")).toBeVisible();
    expect(within(band).getByText("2")).toBeVisible();
    expect(within(band).getByText("Current approved baseline; GST excluded")).toBeVisible();
    expect(screen.getByText("Previous-period reporting is not available in this response.")).toBeVisible();
    expect(screen.getByText("This response predates Client relationship reporting.")).toBeVisible();
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

  it("morphs lifecycle views without remounting the chart or changing exact values", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    const lifecycleFigure = await screen.findByRole("figure", { name: "Current delivery stage" });
    const viewControl = within(lifecycleFigure).getByRole("group", { name: "Lifecycle chart view" });
    const doughnut = within(viewControl).getByRole("button", { name: "Doughnut" });
    const rankedBars = within(viewControl).getByRole("button", { name: "Ranked bars" });
    expect(doughnut).toHaveAttribute("aria-pressed", "true");
    expect(rankedBars).toHaveAttribute("aria-pressed", "false");

    const chartHost = within(lifecycleFigure).getByRole("img", { name: /shown as a doughnut/ });
    await user.click(within(lifecycleFigure).getByRole("button", { name: "Show values" }));
    const table = within(lifecycleFigure).getByRole("table");
    expect(within(table).getByRole("row", { name: "Active 1 50%" })).toBeVisible();
    expect(within(table).getByRole("row", { name: "Completed 1 50%" })).toBeVisible();

    await user.click(rankedBars);
    expect(rankedBars).toHaveAttribute("aria-pressed", "true");
    expect(within(lifecycleFigure).getByRole("img", { name: /shown as ranked bars/ })).toBe(chartHost);
    expect(within(table).getByRole("row", { name: "Active 1 50%" })).toBeVisible();

    await user.click(doughnut);
    await user.click(rankedBars);
    await user.click(doughnut);
    await user.click(rankedBars);
    expect(rankedBars).toHaveAttribute("aria-pressed", "true");
    expect(doughnut).toHaveAttribute("aria-pressed", "false");
    expect(within(lifecycleFigure).getByRole("img", { name: /shown as ranked bars/ })).toBe(chartHost);
    expect(get.mock.calls.filter(([path]) => path.startsWith("/admin/dashboard/overview?")).length).toBe(1);
  });

  it("keeps ranked lifecycle bars keyboard-operable for the same project drilldown", async () => {
    const get = installDashboardApi();
    const user = userEvent.setup();
    renderDashboard();

    const lifecycleFigure = await screen.findByRole("figure", { name: "Current delivery stage" });
    await user.click(within(lifecycleFigure).getByRole("button", { name: "Ranked bars" }));
    const chart = within(lifecycleFigure).getByRole("img", { name: /shown as ranked bars/ });
    chart.focus();
    await user.keyboard("{Home}{Enter}");

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

  it("suppresses unavailable risk, factor, top-project, and ratio values with safe explanations", async () => {
    const unavailableKeys = [
      "risk.projectDistribution",
      "risk.factorDistribution",
      "risk.topProjects",
      "projects.completionRate"
    ];
    installDashboardApi({
      overview: {
        ...superAdminDashboardOverviewFixture,
        projects: {
          ...superAdminDashboardOverviewFixture.projects,
          completionRate: { numerator: 0, denominator: 2, rateBps: 0 }
        },
        dataQuality: {
          status: "partial",
          totalIssueCount: unavailableKeys.length,
          unavailableMetricKeys: unavailableKeys,
          issues: unavailableKeys.map((metricKey) => ({
            code: "module_aggregate_unavailable" as const,
            metricKey,
            message: `${metricKey} could not be verified.`,
            entityType: null,
            entityId: null
          }))
        }
      }
    });
    const overviewRender = renderDashboard();

    const attention = await screen.findByRole("region", { name: "Needs attention" });
    expect(within(attention).getByText("Red-risk projects")).toBeVisible();
    expect(within(attention).getAllByText("Not available").length).toBeGreaterThan(0);
    expect(within(attention).getAllByText("risk.projectDistribution could not be verified.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/risk\.topProjects could not be verified/)).not.toHaveLength(0);
    expect(screen.queryByText("North Residence")).not.toBeInTheDocument();
    expect(screen.queryByText("Project is past its planned deadline.")).not.toBeInTheDocument();
    const modules = screen.getByRole("region", { name: "Module summaries" });
    const riskModule = within(modules).getByText("Risk").closest("a");
    expect(within(riskModule!).getByText("Not available")).toBeVisible();
    expect(screen.getByText("1 Client approved")).toBeVisible();

    overviewRender.unmount();
    renderDashboard("/admin/dashboard?tab=risk&periodDays=30");
    const riskTabRed = (await screen.findByText("Red-risk projects")).closest("article");
    expect(within(riskTabRed!).getByText("Not available")).toBeVisible();
    expect(within(riskTabRed!).queryByText("1")).not.toBeInTheDocument();
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

  it("keeps the verified period mounted while rapid period requests resolve out of order", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 300,
      left: 0,
      width: 800,
      height: 300,
      toJSON: () => ({})
    });
    const forPeriod = (days: 7 | 30 | 90, projectTotal: number): SuperAdminDashboardOverview => {
      const comparison = superAdminDashboardOverviewFixture.comparison!;
      const currentBuckets = days === 7 ? comparison.currentBuckets.slice(-7) : comparison.currentBuckets;
      const previousBuckets = days === 7 ? comparison.previousBuckets.slice(-7) : comparison.previousBuckets;
      return {
        ...superAdminDashboardOverviewFixture,
        observedAt: `2026-09-${String(days === 7 ? 7 : days === 30 ? 8 : 9).padStart(2, "0")}T12:00:00.000Z`,
        period: { ...superAdminDashboardOverviewFixture.period, days },
        projects: { ...superAdminDashboardOverviewFixture.projects, total: projectTotal },
        comparison: {
          ...comparison,
          window: {
            ...comparison.window,
            current: { ...comparison.window.current, days },
            previous: { ...comparison.window.previous, days }
          },
          currentBuckets,
          previousBuckets
        }
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
    const projectsMetric = within(headline).getByText("Projects").closest("article")!;
    expect(within(projectsMetric).getByText("30")).toBeVisible();
    expect(screen.getByText("Selected 30-day incurred period")).toBeVisible();
    const growthHost = screen.getByRole("img", { name: /Projects created for the current and previous reporting period/ });
    await waitFor(() => expect(dashboardChartRuntimeMock.init).toHaveBeenCalledTimes(4));
    const growthInstance = dashboardChartRuntimeMock.instances.get("dashboard-growth");
    expect(growthInstance).toBeDefined();
    const initialGrowthUpdates = growthInstance!.update.mock.calls.length;

    const period = screen.getByRole("combobox", { name: "Reporting period" });
    await user.selectOptions(period, "90");
    expect(period).toHaveValue("90");
    expect(screen.getByText("Refreshing dashboard…")).toBeVisible();
    expect(screen.getByText("Selected 30-day incurred period")).toBeVisible();
    expect(within(projectsMetric).getByText("30")).toBeVisible();

    await user.selectOptions(period, "7");
    expect(period).toHaveValue("7");
    expect(screen.getByText("Selected 30-day incurred period")).toBeVisible();

    act(() => ninetyDayRequest.resolve(ninetyDayData));
    await waitFor(() => expect(queryClient.getQueryData(dashboardKeys.overview(90))).toBe(ninetyDayData));
    expect(screen.queryByText("Selected 90-day incurred period")).not.toBeInTheDocument();
    expect(screen.getByText("Selected 30-day incurred period")).toBeVisible();
    expect(within(projectsMetric).getByText("30")).toBeVisible();

    act(() => sevenDayRequest.resolve(sevenDayData));
    await waitFor(() => expect(screen.getByText("Selected 7-day incurred period")).toBeVisible());
    expect(within(projectsMetric).getByText("7")).toBeVisible();
    expect(screen.queryByText("Selected 90-day incurred period")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Projects created for the current and previous reporting period/ })).toBe(growthHost);
    expect(screen.queryByText("Refreshing dashboard…")).not.toBeInTheDocument();
    expect(dashboardChartRuntimeMock.init).toHaveBeenCalledTimes(4);
    expect(dashboardChartRuntimeMock.instances.get("dashboard-growth")).toBe(growthInstance);
    expect(growthInstance!.update.mock.calls.length).toBeGreaterThan(initialGrowthUpdates);
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
