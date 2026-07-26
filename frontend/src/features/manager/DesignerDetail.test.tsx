import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

describe("DesignerDetail", () => {
  it("shows the calculated KPI separately from evaluation controls", async () => {
    tokenStorage.set("manager-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "manager-1", name: "Aarav Shah", email: "aarav@lisno.example", role: "design_manager" } });
      if (url === "/api/v1/designers/designer-1/summary") return Response.json({ data: { user: { id: "designer-1", name: "Ananya Rao", email: "ananya@lisno.example", role: "designer" }, activeProjectCount: 1, workload: 8, overdueCount: 0, yellowRiskCount: 0, pendingEvaluation: true, kpi: { score: 84, components: [] }, projects: [], tasks: [] } });
      if (url.startsWith("/api/v1/evaluations/designer-1?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      if (url.startsWith("/api/v1/designers/designer-1/audit?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      throw new Error(`Unhandled request: ${url}`);
    });
    renderApp(["/manager/designers/designer-1"]);
    expect(await screen.findByRole("heading", { name: "Ananya Rao" })).toBeVisible();
    expect(screen.getByText("Calculated KPI remains separate from manager evaluation.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save evaluation" })).toBeVisible();
  });
});
