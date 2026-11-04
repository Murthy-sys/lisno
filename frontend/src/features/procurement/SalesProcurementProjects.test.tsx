import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { SalesProcurementProjects } from "./SalesProcurementProjects";

describe("Sales Procurement project identity", () => {
  it("distinguishes identically named projects with their generated references", async () => {
    const references = ["Lisno000011", "Lisno000027", null];
    server.use(http.get("/api/v1/procurement/suggestion-projects", () => HttpResponse.json({ data: {
      items: references.map((projectNumber, index) => ({ projectId: `project-${index}`, projectName: "Shared residence", projectNumber, estimateId: `estimate-${index}`, estimateVersion: 2, designPlanVersion: 1 })),
      total: 3, limit: 20, offset: 0
    } })));
    renderWithQuery(<SalesProcurementProjects />);
    const list = await screen.findByRole("list", { name: "Projects ready for vendor suggestions" });
    const rows = within(list).getAllByRole("listitem");
    for (const [index, label] of ["Project ID: Lisno000011", "Project ID: Lisno000027", "Project ID not assigned"].entries()) {
      expect(within(rows[index]!).getByText(label)).toBeVisible();
      expect(within(rows[index]!).getByRole("button", { name: "Suggest vendors for Shared residence" })).toBeEnabled();
    }
  });

  it("does not interpret a denied project list as an unassigned Project ID", async () => {
    server.use(http.get("/api/v1/procurement/suggestion-projects", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Projects unavailable." } }, { status: 403 })));
    renderWithQuery(<SalesProcurementProjects />);
    expect(await screen.findByText("Projects unavailable.")).toBeVisible();
    expect(screen.queryByText("Project ID not assigned")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Projects ready for vendor suggestions" })).not.toBeInTheDocument();
  });
});
