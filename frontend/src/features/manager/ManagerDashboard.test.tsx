import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const manager = {
  id: "user-manager-aarav",
  name: "Aarav Shah",
  email: "aarav@lisno.example",
  role: "design_manager" as const
};

describe("ManagerDashboard", () => {
  it("shows direct-report workload and risk cards", async () => {
    tokenStorage.set("manager-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: manager });
      if (url === "/api/v1/organization/team?limit=100&offset=0") {
        return Response.json({
          data: { items: [{
            user: { id: "designer-1", name: "Ananya Rao", email: "ananya@lisno.example" },
            activeProjectCount: 2,
            workload: 24,
            overdueCount: 1,
            yellowRiskCount: 2,
            pendingEvaluation: true,
            kpi: { score: 84, components: [] },
            projects: [],
            tasks: []
          }], pagination: { limit: 100, offset: 0, total: 101, hasMore: true } }
        });
      }
      if (url === "/api/v1/organization/team?limit=100&offset=100") {
        return Response.json({
          data: { items: [{
            user: { id: "designer-2", name: "Kabir Shah", email: "kabir@lisno.example" },
            activeProjectCount: 1,
            workload: 12,
            overdueCount: 0,
            yellowRiskCount: 1,
            pendingEvaluation: false,
            kpi: { score: 79, components: [] },
            projects: [],
            tasks: []
          }], pagination: { limit: 100, offset: 100, total: 101, hasMore: false } }
        });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/manager"]);

    expect(await screen.findByRole("heading", { name: "Team delivery pulse" })).toBeVisible();
    expect(screen.getByText("Ananya Rao")).toBeVisible();
    expect(screen.getByText("Kabir Shah")).toBeVisible();
    expect(screen.getByText("24h open workload")).toBeVisible();
    expect(screen.getByText("1 red · 2 yellow")).toBeVisible();
  });
});
