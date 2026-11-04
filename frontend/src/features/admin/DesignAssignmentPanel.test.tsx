import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { AdminProjectSummary, DesignPlanTask } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { DesignAssignmentPanel } from "./DesignAssignmentPanel";

const project: AdminProjectSummary = {
  id: "project-1",
  name: "Aurora Villa",
  status: "planning",
  location: "Pune",
  client: {
    name: "Priya Shah",
    email: "priya@example.com",
    mobile: "+91 90000 00000"
  },
  propertyType: "3BHK",
  budgetMin: 800000,
  budgetMax: 1200000,
  estimator: null,
  lead: null,
  estimate: {
    id: "estimate-1",
    leadId: "lead-1",
    projectId: "project-1",
    resolvedProjectId: "project-1",
    projectLinkSource: "estimate_and_lead",
    version: 4,
    status: "client_approved",
    subtotal: 826271,
    gst: 148729,
    total: 975000,
    clientDecisionAt: "2026-08-24T09:00:00.000Z",
    clientDecisionSource: "client_portal",
    approvedBaseline: {
      estimateVersion: 3,
      reviewRoundId: "round-1",
      subtotal: 826271,
      gst: 148729,
      total: 975000,
      decisionAt: "2026-08-24T09:00:00.000Z",
      decisionSource: "client_portal"
    },
    designPlanStatus: "pending_assignment",
    designPlanVersion: 0,
    designPlanDesigner: null
  },
  createdAt: "2026-08-23T10:00:00.000Z"
};

const assignedTask: DesignPlanTask = {
  id: "design-task-1",
  estimateId: "estimate-1",
  projectId: project.id,
  projectName: project.name,
  clientName: project.client.name,
  status: "assigned",
  designPlanVersion: 0,
  rooms: [],
  scopes: [],
  lineItems: []
};

describe("DesignAssignmentPanel", () => {
  it("posts the selected Designer for an approved estimate", async () => {
    let submittedBody: unknown;
    server.use(
      http.get("/api/v1/admin/designers", () =>
        HttpResponse.json({
          data: [
            {
              id: "designer-1",
              name: "Ananya Rao",
              email: "ananya@lisno.example"
            }
          ]
        })
      ),
      http.post(
        "/api/v1/admin/projects/project-1/design-assignment",
        async ({ request }) => {
          submittedBody = await request.json();
          return HttpResponse.json({ data: assignedTask });
        }
      )
    );
    const user = userEvent.setup();

    renderWithQuery(<DesignAssignmentPanel project={project} canManage />);

    await screen.findByRole("option", { name: "Ananya Rao · ananya@lisno.example" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Assigned Designer" }),
      "designer-1"
    );
    await user.click(screen.getByRole("button", { name: "Assign Designer" }));

    await waitFor(() =>
      expect(submittedBody).toEqual({ designerId: "designer-1" })
    );
    expect(
      await screen.findByText("Designer assigned. The design-plan task is open.")
    ).toHaveAttribute("role", "status");
  });
});

const initialApprovedProject: AdminProjectSummary = {
  ...project,
  estimationWorkflowVersion: 3,
  estimate: {
    ...project.estimate!,
    status: "draft",
    estimationPhase: "post",
    initialEstimateApproval: { reviewRoundId: "initial-review", estimateVersion: 3, approvedAt: "2026-08-24T09:00:00.000Z" },
    canAssignDesigner: true,
    designerAssignmentBlockedReason: null,
    quotationApprovalState: "initial_current",
    currentQuotationApproved: true,
    requiresClientReapproval: false,
    quotationApprovalSource: "initial_unchanged",
    currentQuotationApproval: { kind: "initial_unchanged", reviewRoundId: "initial-review", estimateVersion: 3, approvedAt: "2026-08-24T09:00:00.000Z" }
  }
};

const activeDesigner = { id: "designer-2", name: "Designer Two", email: "designer-two@example.test" };

describe("initial approval Designer handoff", () => {
  it("assigns from a post-phase draft and refreshes project, team, estimate and task caches", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    let posted: unknown;
    server.use(
      http.get("/api/v1/admin/designers", () => HttpResponse.json({ data: [activeDesigner] })),
      http.post("/api/v1/admin/projects/project-1/design-assignment", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ data: assignedTask });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<DesignAssignmentPanel project={initialApprovedProject} canManage />);
    await screen.findByRole("option", { name: /Designer Two/ });
    const select = screen.getByRole("combobox", { name: "Assigned Designer" });
    select.focus();
    await user.selectOptions(select, activeDesigner.id);
    await user.tab();
    expect(screen.getByRole("button", { name: "Assign Designer" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Designer assigned. Design workflow is ready while the approved estimate remains unchanged.")).toHaveAttribute("role", "status");
    expect(posted).toEqual({ designerId: activeDesigner.id });
    for (const key of [["admin-projects"], ["project-workflow"], ["design-team"], ["designer", "projects"], ["assigned-projects"], ["leads"]]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }
    invalidate.mockRestore();
  });

  it.each([
    { name: "unapproved project", estimate: { initialEstimateApproval: null, canAssignDesigner: false, designerAssignmentBlockedReason: "Initial approval is required." }, canManage: true, message: "Initial approval is required." },
    { name: "missing rollout fields", estimate: { initialEstimateApproval: undefined, canAssignDesigner: undefined }, canManage: true, message: "Assignment availability is unavailable. Refresh the project to try again." },
    { name: "server-blocked assignment", estimate: { canAssignDesigner: false, designerAssignmentBlockedReason: "Only Super Admin can assign a Designer." }, canManage: true, message: "Only Super Admin can assign a Designer." },
    { name: "missing frontend permission", estimate: {}, canManage: false, message: "You do not have permission to assign a Designer." }
  ])("does not load Designers or offer assignment for $name", async ({ estimate, canManage, message }) => {
    const load = vi.fn();
    server.use(http.get("/api/v1/admin/designers", () => { load(); return HttpResponse.json({ data: [activeDesigner] }); }));
    renderWithQuery(<DesignAssignmentPanel project={{ ...initialApprovedProject, estimate: { ...initialApprovedProject.estimate!, ...estimate } }} canManage={canManage} />);
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign Designer" })).not.toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it("shows a recoverable options failure and an empty state without enabling submit", async () => {
    let calls = 0;
    server.use(http.get("/api/v1/admin/designers", async () => {
      await delay(20);
      return ++calls === 1 ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: 503 }) : HttpResponse.json({ data: [] });
    }));
    const user = userEvent.setup();
    renderWithQuery(<DesignAssignmentPanel project={initialApprovedProject} canManage />);
    expect(screen.getByRole("combobox", { name: "Assigned Designer" })).toBeDisabled();
    expect(screen.getByText("Loading active Designers…")).toBeVisible();
    await screen.findByText("Active Designers could not be loaded.");
    expect(screen.getByRole("button", { name: "Assign Designer" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry Designers" }));
    expect(await screen.findByText("No active Designers are available.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Assign Designer" })).toBeDisabled();
  });

  it("keeps an authoritative stale-state rejection visible", async () => {
    server.use(
      http.get("/api/v1/admin/designers", () => HttpResponse.json({ data: [activeDesigner] })),
      http.post("/api/v1/admin/projects/project-1/design-assignment", () => HttpResponse.json({ error: { code: "DESIGN_PLAN_NOT_ASSIGNABLE", message: "Project assignment changed. Refresh and try again." } }, { status: 409 }))
    );
    const user = userEvent.setup();
    renderWithQuery(<DesignAssignmentPanel project={initialApprovedProject} canManage />);
    await screen.findByRole("option", { name: /Designer Two/ });
    await user.selectOptions(screen.getByRole("combobox", { name: "Assigned Designer" }), activeDesigner.id);
    await user.click(screen.getByRole("button", { name: "Assign Designer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Project assignment changed. Refresh and try again.");
    expect(screen.queryByText("Designer assigned. Design workflow is ready while the approved estimate remains unchanged.")).not.toBeInTheDocument();
  });
});
