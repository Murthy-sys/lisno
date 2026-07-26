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
      if (url === "/api/v1/organization/team") {
        return Response.json({
          data: [{
            user: { id: "designer-1", name: "Ananya Rao", email: "ananya@lisno.example" },
            activeProjectCount: 2,
            workload: 24,
            overdueCount: 1,
            yellowRiskCount: 2,
            pendingEvaluation: true,
            kpi: { score: 84, components: [] },
            projects: [],
            tasks: []
          }]
        });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/manager"]);

    expect(await screen.findByRole("heading", { name: "Team delivery pulse" })).toBeVisible();
    expect(screen.getByText("Ananya Rao")).toBeVisible();
    expect(screen.getByText("24h open workload")).toBeVisible();
    expect(screen.getByText("1 red · 2 yellow")).toBeVisible();
  });
});
