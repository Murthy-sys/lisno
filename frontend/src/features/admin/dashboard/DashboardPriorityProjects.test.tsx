import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardPriorityProjects } from "./DashboardPriorityProjects";
import { superAdminDashboardProjectsPageFixture } from "./dashboardFixtures";
import type { DashboardPriorityQuery } from "./dashboardViewModel";

afterEach(cleanup);

function renderPriority(overrides: Partial<DashboardPriorityQuery> = {}, canReadProjects = true) {
  const query: DashboardPriorityQuery = { data: structuredClone(superAdminDashboardProjectsPageFixture), isPending: false, isFetching: false, isError: false, refetch: vi.fn(), ...overrides };
  const view = render(<MemoryRouter><DashboardPriorityProjects query={query} canReadProjects={canReadProjects} viewAllHref="/admin/dashboard?tab=projects&periodDays=7&comparison=off" /></MemoryRouter>);
  return { ...view, query };
}

describe("Dashboard priority projects", () => {
  it("keeps stable project identities, backend progress, manager and UTC deadline", () => {
    renderPriority();
    const table = screen.getByRole("table", { name: "Priority projects ordered by risk" });
    const first = within(table).getByRole("row", { name: /North Residence/ });
    const second = within(table).getByRole("row", { name: /Lake Apartment/ });
    expect(within(first).getByRole("link", { name: "North Residence" })).toHaveAttribute("href", "/admin/projects/project-risk");
    expect(within(first).getByRole("progressbar")).toHaveAttribute("value", "5000");
    expect(first).toHaveTextContent("50.00%");
    expect(first).toHaveTextContent("Mira Shah");
    expect(first).toHaveTextContent("22 Aug 2026");
    expect(second).toHaveTextContent("100.00%");
    expect(second).toHaveTextContent("Unassigned");
    expect(screen.getByRole("link", { name: "View all projects" })).toHaveAttribute("href", "/admin/dashboard?tab=projects&periodDays=7&comparison=off");
  });

  it("keeps zero progress distinct from missing eligible progress and respects project link permissions", () => {
    const data = structuredClone(superAdminDashboardProjectsPageFixture);
    data.items[0].execution.progress = { numerator: 0, denominator: 9, rateBps: 0, fallbackTaskCount: 0 };
    data.items[1].execution.progress = { numerator: 0, denominator: 0, rateBps: null, fallbackTaskCount: 0 };
    data.items[1].risk.level = "gray";
    renderPriority({ data }, false);
    expect(screen.queryByRole("link", { name: "North Residence" })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "North Residence execution progress" })).toHaveAttribute("value", "0");
    expect(screen.queryByRole("progressbar", { name: "Lake Apartment execution progress" })).not.toBeInTheDocument();
    const second = screen.getByRole("row", { name: /Lake Apartment/ });
    expect(second).toHaveTextContent("Not available");
    expect(second).toHaveTextContent("No eligible execution progress denominator");
    expect(second).toHaveTextContent("Not tracked");
  });

  it("preserves previous rows after refresh failure and offers an independent retry", async () => {
    const { query } = renderPriority({ isError: true });
    expect(screen.getByRole("status")).toHaveTextContent("Showing previous priority projects; refresh failed");
    expect(screen.getByRole("link", { name: "North Residence" })).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry priority projects" }));
    expect(query.refetch).toHaveBeenCalledOnce();
    expect(screen.getByText(/Previous successful response/)).toBeVisible();
  });

  it("does not show rows from a previous period while the requested period loads", () => {
    renderPriority({ isPlaceholderData: true, isFetching: true });
    expect(screen.getByRole("status")).toHaveTextContent("Loading priority projects");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("North Residence")).not.toBeInTheDocument();
  });

  it("distinguishes failed, empty and unavailable row responses", () => {
    const view = renderPriority({ data: undefined, isError: true });
    expect(screen.getByRole("status")).toHaveTextContent("Priority projects are unavailable");
    expect(screen.queryByText(/No projects are/)).not.toBeInTheDocument();
    view.unmount();
    const empty = renderPriority({ data: { ...superAdminDashboardProjectsPageFixture, items: [] } });
    expect(screen.getByText("No projects are available in the current portfolio.")).toBeVisible();
    empty.unmount();
    renderPriority({ data: { ...superAdminDashboardProjectsPageFixture, dataQuality: { status: "partial", totalIssueCount: 1, issues: [{ code: "project_identity_mismatch", metricKey: "projects.rows", message: "Project identity could not be verified.", entityType: "project", entityId: null }], unavailableMetricKeys: ["projects.rows"] } } });
    expect(screen.getByText("Project identity could not be verified.")).toBeVisible();
    expect(screen.queryByText("North Residence")).not.toBeInTheDocument();
  });

  it("does not render unavailable progress or risk as verified values", () => {
    renderPriority({ data: { ...superAdminDashboardProjectsPageFixture, dataQuality: { status: "partial", totalIssueCount: 2, issues: [], unavailableMetricKeys: ["execution.weightedProgress", "risk.projectDistribution"] } } });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Red risk")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not available")).toHaveLength(4);
  });
});
