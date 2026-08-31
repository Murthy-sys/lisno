import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../../api/client";
import {
  superAdminDashboardOverviewFixture,
  superAdminDashboardProjectsPageFixture,
  superAdminDashboardWorkforcePageFixture
} from "./dashboardFixtures";
import { SuperAdminDashboardPage } from "./SuperAdminDashboardPage";
import type {
  SuperAdminDashboardOverview,
  SuperAdminDashboardProjectsPage
} from "./superAdminDashboardApi";
import { dashboardKeys } from "./superAdminDashboardApi";

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
      <MemoryRouter initialEntries={[entry]}><SuperAdminDashboardPage /></MemoryRouter>
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
  it("renders one organization-wide Overview request with every approved domain summary", async () => {
    const get = installDashboardApi();
    const { container } = renderDashboard();

    expect(await screen.findByRole("heading", { name: "Organization dashboard" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Attention summary" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Project lifecycle" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Cross-module health" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Risk factor analysis" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Execution health" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Workforce health" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Governance attention" })).toBeVisible();
    expect(screen.getByText("Approved net revenue, excluding GST")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: /project/i })).not.toBeInTheDocument();

    const requested = get.mock.calls.map(([path]) => path);
    expect(requested.filter((path) => path.startsWith("/admin/dashboard/overview?"))).toHaveLength(1);
    expect(requested.join(" ")).not.toMatch(/\/admin\/projects|\/finance\/projects/);
    expect((await axe.run(container, {
      rules: { "color-contrast": { enabled: false } }
    })).violations).toEqual([]);
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

    await user.selectOptions(screen.getByRole("combobox", { name: "Dashboard period" }), "90");
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

    const redRisk = (await screen.findByText("Red-risk projects")).closest("article");
    const completion = screen.getByText("Completion rate").closest("article");
    expect(within(redRisk!).getByText("Not available")).toBeVisible();
    expect(within(redRisk!).getByText("risk.projectDistribution could not be verified.")).toBeVisible();
    expect(within(completion!).getByText("Not available")).toBeVisible();
    expect(within(completion!).queryByText("0.00%")).not.toBeInTheDocument();
    expect(screen.getAllByText(/risk\.factorDistribution could not be verified/)).not.toHaveLength(0);
    expect(screen.getAllByText(/risk\.topProjects could not be verified/)).not.toHaveLength(0);
    expect(screen.queryByText("North Residence")).not.toBeInTheDocument();
    expect(screen.queryByText("Project is past its planned deadline.")).not.toBeInTheDocument();
    const riskModule = screen.getByText("Risk", { selector: "p.eyebrow" }).closest("article");
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
    expect(await screen.findByRole("heading", { name: "Organization dashboard" })).toBeVisible();
    expect(screen.getByText("Refreshing dashboard…")).toBeVisible();
    expect(screen.getByText("Cross-module health")).toBeVisible();
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
