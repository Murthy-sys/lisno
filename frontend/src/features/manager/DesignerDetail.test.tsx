import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("offers only the signed-in evaluator's corrections and retains the original ISO period", async () => {
    tokenStorage.set("manager-token");
    let submitted: Record<string, unknown> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "manager-1", name: "Aarav Shah", email: "aarav@lisno.example", role: "design_manager" } });
      if (url === "/api/v1/designers/designer-1/summary") return Response.json({ data: { user: { id: "designer-1", name: "Ananya Rao", email: "ananya@lisno.example", role: "designer" }, activeProjectCount: 1, workload: 8, overdueCount: 0, yellowRiskCount: 0, pendingEvaluation: false, kpi: { score: 84, components: [] }, projects: [], tasks: [] } });
      if (url.startsWith("/api/v1/evaluations/designer-1?")) return Response.json({ data: { items: [
        { id: "evaluation-head", subjectUserId: "designer-1", evaluatorUserId: "head-1", evaluatorRole: "design_head", periodStartAt: "2026-07-01T00:00:00.000Z", periodEndAt: "2026-07-31T23:59:59.999Z", score: 92, comments: "Head evaluation", revisionOf: null, createdAt: "2026-08-02T00:00:00.000Z" },
        { id: "evaluation-manager", subjectUserId: "designer-1", evaluatorUserId: "manager-1", evaluatorRole: "design_manager", periodStartAt: "2026-06-01T05:30:00.000Z", periodEndAt: "2026-06-30T18:29:59.999Z", score: 80, comments: "Manager evaluation", revisionOf: null, createdAt: "2026-08-01T00:00:00.000Z" }
      ], pagination: { limit: 100, offset: 0, total: 2, hasMore: false } } });
      if (url.startsWith("/api/v1/designers/designer-1/audit?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      if (url === "/api/v1/evaluations" && init?.method === "POST") {
        submitted = JSON.parse(String(init.body));
        return Response.json({ data: { ...submitted, id: "evaluation-correction", evaluatorUserId: "manager-1", evaluatorRole: "design_manager", createdAt: "2026-08-03T00:00:00.000Z" } }, { status: 201 });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/manager/designers/designer-1"]);
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Ananya Rao" });
    const correction = screen.getByLabelText("Evaluation to correct");
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["", "evaluation-manager"]);
    await user.selectOptions(correction, "evaluation-manager");
    await user.type(screen.getByLabelText("Evaluation comments"), "Corrected score");
    await user.click(screen.getByRole("button", { name: "Save evaluation" }));

    await waitFor(() => expect(submitted).toMatchObject({
      revisionOf: "evaluation-manager",
      periodStartAt: "2026-06-01T05:30:00.000Z",
      periodEndAt: "2026-06-30T18:29:59.999Z"
    }));
  });
});
