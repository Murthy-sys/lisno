import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { DashboardProjectDrilldown } from "./DashboardProjectDrilldown";
import { superAdminDashboardProjectsPageFixture } from "./dashboardFixtures";

describe("Dashboard project drilldown identity", () => {
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
