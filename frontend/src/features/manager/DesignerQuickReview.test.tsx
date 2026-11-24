import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { DesignerSummary } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { ManagerDashboard } from "./ManagerDashboard";

vi.mock("../estimates/EstimateReviewPanel", () => ({ EstimateReviewPanel: () => null }));

function designer(id: string, score: number): DesignerSummary {
  return { user: { id, name: "Alex Lee", email: `${id}@lisno.example`, role: "designer" }, activeProjectCount: 1, workload: score, overdueCount: 0, yellowRiskCount: 0, pendingEvaluation: false, kpi: { score, components: [] }, projects: [{
    id: `project-${id}`, name: "Shared home", projectNumber: id === "designer-a" ? "Lisno000031" : "Lisno000084", progress: score,
    clientId: "client-one", clientName: "Priya Shah", clientEmail: "priya@lisno.example", clientMobile: "", clientAddress: "Bengaluru",
    initiatingDesignerId: id, assignedEstimatorId: null, assignedDesignerIds: [id], managerId: "manager-one", status: "active", location: "Bengaluru",
    plannedStartAt: "2026-06-01T09:00:00.000Z", plannedEndAt: "2026-09-30T17:00:00.000Z", actualStartAt: "2026-06-01T09:00:00.000Z", actualEndAt: null,
    createdAt: "2026-06-01T08:00:00.000Z", updatedAt: "2026-07-15T08:00:00.000Z"
  }], tasks: [] };
}

describe("Designer quick review", () => {
  it("keeps same-named designers distinct, restores focus and search, and does not fetch detail", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { items: [designer("designer-a", 73), designer("designer-b", 91)], pagination: { limit: 100, offset: 0, total: 2, hasMore: false } } }));
    renderWithQuery(<MemoryRouter><ManagerDashboard /></MemoryRouter>);
    const user = userEvent.setup();
    const search = await screen.findByRole("searchbox", { name: "Search designers" });
    await user.type(search, "Alex");
    const triggers = screen.getAllByRole("button", { name: "Quick review Alex Lee" });
    await user.click(triggers[0]!);
    let panel = screen.getByRole("dialog", { name: "Alex Lee" });
    expect(within(panel).getByText("designer-a@lisno.example")).toBeVisible();
    expect(within(panel).getByRole("link", { name: "Open designer workspace" })).toHaveAttribute("href", "/manager/designers/designer-a");
    expect(within(panel).getByRole("link", { name: "Shared home" })).toHaveAttribute("href", "/manager/projects/project-designer-a");
    expect(within(panel).getByText("Project ID: Lisno000031")).toBeVisible();
    expect(within(panel).queryByText(/\d+%/)).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(triggers[0]).toHaveFocus());
    expect(search).toHaveValue("Alex");
    await user.click(triggers[1]!);
    panel = screen.getByRole("dialog", { name: "Alex Lee" });
    expect(within(panel).getByText("designer-b@lisno.example")).toBeVisible();
    expect(within(panel).queryByText("designer-a@lisno.example")).not.toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Open designer workspace" })).toHaveAttribute("href", "/manager/designers/designer-b");
    expect(within(panel).getByRole("link", { name: "Shared home" })).toHaveAttribute("href", "/manager/projects/project-designer-b");
    expect(within(panel).getByText("Project ID: Lisno000084")).toBeVisible();
    expect(within(panel).queryByText("Project ID: Lisno000031")).not.toBeInTheDocument();
    expect(within(panel).queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
