import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { DesignerSummary } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { ManagerDashboard } from "./ManagerDashboard";

vi.mock("../estimates/EstimateReviewPanel", () => ({ EstimateReviewPanel: () => null }));

function designer(id: string, score: number): DesignerSummary {
  return { user: { id, name: "Alex Lee", email: `${id}@lisno.example`, role: "designer" }, activeProjectCount: 0, workload: score, overdueCount: 0, yellowRiskCount: 0, pendingEvaluation: false, kpi: { score, components: [] }, projects: [], tasks: [] };
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
    await user.keyboard("{Escape}");
    await waitFor(() => expect(triggers[0]).toHaveFocus());
    expect(search).toHaveValue("Alex");
    await user.click(triggers[1]!);
    panel = screen.getByRole("dialog", { name: "Alex Lee" });
    expect(within(panel).getByText("designer-b@lisno.example")).toBeVisible();
    expect(within(panel).queryByText("designer-a@lisno.example")).not.toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Open designer workspace" })).toHaveAttribute("href", "/manager/designers/designer-b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
