import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const head = {
  id: "user-head",
  name: "Devika Menon",
  email: "head@lisno.example",
  role: "design_head" as const
};

describe("HeadDashboard", () => {
  it("renders an expandable manager hierarchy", async () => {
    tokenStorage.set("head-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: head });
      if (url === "/api/v1/organization/tree?limit=100&offset=0") {
        return Response.json({
          data: { items: [{
            id: "manager-1",
            name: "Aarav Shah",
            email: "aarav@lisno.example",
            designers: [{ id: "designer-1", name: "Ananya Rao", email: "ananya@lisno.example", summary: { activeProjectCount: 1, workload: 8, overdueCount: 0, yellowRiskCount: 1, pendingEvaluation: false, kpi: { score: 82, components: [] }, projects: [{ id: "project-1", name: "Aurora Villa", progress: 64 }], tasks: [] } }],
            summary: { teamKpi: { score: 82, components: [] }, workload: 8, redCount: 0, yellowCount: 1, evaluationCoverage: 100 }
          }], pagination: { limit: 100, offset: 0, total: 101, hasMore: true } }
        });
      }
      if (url === "/api/v1/organization/tree?limit=100&offset=100") {
        return Response.json({
          data: { items: [{
            id: "manager-2",
            name: "Meera Iyer",
            email: "meera@lisno.example",
            designers: [],
            summary: { teamKpi: { score: 0, components: [] }, workload: 0, redCount: 0, yellowCount: 0, evaluationCoverage: 0 }
          }], pagination: { limit: 100, offset: 100, total: 101, hasMore: false } }
        });
      }
      if (url.startsWith("/api/v1/evaluations/manager-1?")) {
        return Response.json({
          data: {
            items: [{
              id: "evaluation-latest",
              subjectUserId: "manager-1",
              evaluatorUserId: "user-head",
              evaluatorRole: "design_head",
              periodStartAt: "2026-07-01T00:00:00.000Z",
              periodEndAt: "2026-07-31T23:59:59.999Z",
              score: 88,
              comments: "Head correction",
              revisionOf: "evaluation-previous",
              createdAt: "2026-08-01T00:00:00.000Z"
            }],
            pagination: { limit: 100, offset: 0, total: 1, hasMore: false }
          }
        });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/head"]);

    expect(await screen.findByRole("heading", { name: "Organization delivery health" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Aarav Shah/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Meera Iyer/ })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Aarav Shah/ }));
    expect(screen.getByRole("link", { name: /Aurora Villa/ })).toHaveAttribute(
      "href",
      "/head/projects/project-1"
    );
    expect(await screen.findByText(/Head correction/)).toBeVisible();
    expect(screen.getByText(/design_head \(user-head\).*revision of evaluation-previous/)).toBeVisible();
  });
});
