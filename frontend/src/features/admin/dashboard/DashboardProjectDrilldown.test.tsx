import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardProjectDrilldown } from "./DashboardProjectDrilldown";
import { superAdminDashboardProjectsPageFixture } from "./dashboardFixtures";

afterEach(cleanup);

describe("Dashboard project drilldown identity", () => {
  it.each(["procurement", "execution"] as const)("keeps %s operational details and filters without progress in either layout", async (tab) => {
    const page = structuredClone(superAdminDashboardProjectsPageFixture);
    const onFiltersChange = vi.fn();
    render(<MemoryRouter><DashboardProjectDrilldown tab={tab} filters={{ module: tab }} page={page}
      refreshing={false} onFiltersChange={onFiltersChange} onPageChange={vi.fn()} /></MemoryRouter>);
    const desktop = within(screen.getByRole("table")).getAllByRole("row", { name: /North Residence/ })[0];
    const mobile = within(screen.getByRole("list")).getAllByRole("listitem")[0];
    for (const row of [desktop, mobile]) {
      expect(row).not.toHaveTextContent(/%|weighted progress/i);
      expect(within(row).queryByRole("progressbar")).not.toBeInTheDocument();
      expect(row).toHaveTextContent(tab === "procurement" ? "posted of" : `${page.items[0].execution.taskCount} tasks`);
      expect(row).toHaveTextContent(tab === "procurement" ? "approved" : `${page.items[0].execution.overdueTaskCount} overdue`);
      expect(within(row).getByRole("link", { name: "North Residence" })).toHaveAttribute("href", "/admin/projects/project-risk");
    }
    await userEvent.setup().selectOptions(screen.getByRole("combobox", { name: "Project status" }), "completed");
    expect(onFiltersChange).toHaveBeenCalledWith({ module: tab, projectStatus: "completed", offset: 0 });
  });

  it("keeps desktop and mobile rows tied to internal routes for same-named and unnumbered projects", () => {
    const page = structuredClone(superAdminDashboardProjectsPageFixture);
    page.items = [
      { ...page.items[0], projectName: "Shared home", projectNumber: "Lisno000021" },
      { ...page.items[1], projectName: "Shared home", projectNumber: "Lisno000083" },
      { ...page.items[0], projectId: "project-unassigned", projectName: "Shared home", projectNumber: null }
    ];
    render(<MemoryRouter><DashboardProjectDrilldown tab="projects" filters={{}} page={page}
      refreshing={false} onFiltersChange={vi.fn()} onPageChange={vi.fn()} /></MemoryRouter>);

    const desktopRows = within(screen.getByRole("table")).getAllByRole("row", { name: /Shared home/ });
    const mobileRows = within(screen.getByRole("list")).getAllByRole("listitem");
    for (const rows of [desktopRows, mobileRows]) {
      page.items.forEach((project, index) => {
        const row = within(rows[index]);
        expect(row.getByText(project.projectNumber ? `Project ID: ${project.projectNumber}` : "Project ID not assigned")).toBeVisible();
        expect(row.getByRole("link", { name: "Shared home" })).toHaveAttribute("href", `/admin/projects/${project.projectId}`);
      });
    }
  });
});
