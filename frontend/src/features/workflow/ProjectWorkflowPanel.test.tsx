import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, AuthorizationSnapshot } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { server } from "../../test/server";
import { ProjectWorkflowPanel } from "./ProjectWorkflowPanel";
import { projectWorkflowKeys, type DesignWorkflowView } from "./projectWorkflowApi";

vi.mock("./ProjectClientActions", () => ({ ProjectClientActions: () => null }));
const authState = vi.hoisted(() => ({ user: { id: "viewer-one", role: "client" as Role }, authorization: null as AuthorizationSnapshot | null }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => authState }));
beforeEach(() => { server.use(http.get("/api/v1/projects/project-ui/design-requirements", () => HttpResponse.json({ data: { version: 0, sourceToken: "empty", entries: [], blockers: [], canReadInternal: false } }))); authState.user = { id: "viewer-one", role: "client" }; authState.authorization = authorizationFor("client", ["projects.design_workflow.read"]); });
vi.mock("../finance/DesignPaymentConfirmations", () => ({ ProjectInitialPaymentStatus: () => <section aria-label="Initial payment status">Initial payment kept</section> }));

const workflow: DesignWorkflowView = {
  projectId: "project-ui", projectName: "Project UI", serverNow: "2026-09-11T09:00:00.000Z", floors: [],
  estimateApprovalStatus: "approved",
  notices: [{ id: "key-ready", stageId: "keys", message: "Keys can now be handed over." }],
  projectStages: [{ id: "keys", name: "Key Collection", type: "key_collection", order: 2, status: "in_progress", progress: null, deadlineAt: null, deadlineTaskId: null, tasks: [], dependencyStageIds: [],
    operational: { status: "in_progress", version: 2, availableActions: [{ id: "keys_handed_over", label: "Confirm keys handed over", actor: "client", requiresProof: false }],
      timing: { state: "not_applicable", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
      blockingReasons: [], facts: [], history: [] }
  }]
};

function setup(presentation: "full" | "client" | "designer" = "full", timelineContainer?: HTMLElement | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectWorkflowPanel projectId="project-ui" presentation={presentation} timelineContainer={timelineContainer} /></QueryClientProvider>);
  return client;
}

describe("ProjectWorkflowPanel", () => {
  it.each(["designer", "procurement", "site_manager"] as const)("shows pending and source-issue progress for %s without mounting actions", async (role) => {
    authState.user.role = role;
    let status: DesignWorkflowView["estimateApprovalStatus"] = "awaiting_approval";
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: { ...workflow, estimateApprovalStatus: status } })));
    const client = setup("full");
    expect(await screen.findByRole("heading", { name: "Project progress" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Key Collection — In progress" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm keys handed over" })).not.toBeInTheDocument();
    expect(screen.getByText("Estimate approval is pending. Project progress is available for review.")).toBeVisible();
    status = "source_issue";
    await act(async () => { await client.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-ui") }); });
    expect(await screen.findByText(/The estimate source needs attention/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Project progress" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm keys handed over" })).not.toBeInTheDocument();
  });

  it.each(["procurement", "site_manager"] as const)("keeps %s as a read-only observer even for an approved estimate", async (role) => {
    authState.user.role = role;
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: workflow })));
    setup();
    expect(await screen.findByRole("heading", { name: "Project progress" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm keys handed over" })).not.toBeInTheDocument();
  });

  it.each([403, 404])("removes retained workflow and notices after access returns %s", async (status) => {
    authState.user.role = "designer";
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: workflow })));
    const client = setup();
    expect(await screen.findByRole("heading", { name: "Project progress" })).toBeVisible();
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ error: { code: "DENIED", message: "Unavailable" } }, { status })));
    await act(async () => { await client.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-ui") }); });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Project notifications" })).not.toBeInTheDocument();
  });

  it("does not reuse another actor's progress while the next identity is denied", async () => {
    authState.user.role = "designer";
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: workflow })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const content = () => <QueryClientProvider client={client}><ProjectWorkflowPanel projectId="project-ui" /></QueryClientProvider>;
    const view = render(content());
    expect(await screen.findByRole("heading", { name: "Project progress" })).toBeVisible();
    authState.user = { id: "viewer-two", role: "designer" };
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ error: { code: "DENIED", message: "Unavailable" } }, { status: 404 })));
    view.rerender(content());
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Project stages could not be refreshed");
  });

  it.each(["awaiting_approval", "source_issue", undefined, "unknown"] as const)("hides every stage for approval status %s while retaining other project content", async (status) => {
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: {
      ...workflow,
      estimateApprovalStatus: status,
      initialPayment: { confirmedAt: null, canConfirm: false, version: 0, status: "awaiting_estimate_approval" }
    } })));
    setup();
    expect(await screen.findByRole("region", { name: "Project notifications" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Initial payment status" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Key Collection — In progress" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm keys handed over" })).not.toBeInTheDocument();
  });

  it("does not show a different project's approved workflow", async () => {
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: { ...workflow, projectId: "project-other" } })));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Project stages could not be refreshed");
    expect(screen.queryByRole("region", { name: "Project notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
  });

  it.each(["full", "client", "designer"] as const)("keeps %s portal navigation hidden until approval and mounts it after refresh", async (presentation) => {
    let approvalStatus: DesignWorkflowView["estimateApprovalStatus"] = "awaiting_approval";
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: { ...workflow, estimateApprovalStatus: approvalStatus } })));
    const portal = document.createElement("div");
    document.body.append(portal);
    try {
      const client = setup(presentation, portal);
      await waitFor(() => expect(client.getQueryState([...projectWorkflowKeys.designWorkflow("project-ui"), "viewer-one", "client"])?.status).toBe("success"));
      expect(within(portal).queryByRole("button", { name: "Key Collection — In progress" })).not.toBeInTheDocument();
      approvalStatus = "approved";
      await act(async () => { await client.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-ui") }); });
      expect(await within(portal).findByRole("button", { name: "Key Collection — In progress" })).toBeVisible();
      expect(screen.getByRole("heading", { name: "Stage actions" })).toBeInTheDocument();
      approvalStatus = "source_issue";
      await act(async () => { await client.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-ui") }); });
      await waitFor(() => expect(within(portal).queryByRole("button", { name: "Key Collection — In progress" })).not.toBeInTheDocument());
    } finally {
      portal.remove();
    }
  });

  it("does not flash stages while loading or after an initial request fails", async () => {
    let finish!: (response: Response) => void;
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", async () => new Promise<Response>((resolve) => { finish = resolve; })));
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Loading project stages");
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await act(async () => { finish(HttpResponse.json({ error: { code: "UNAVAILABLE", message: "No workflow" } }, { status: 503 })); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Project stages could not be refreshed");
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
  });

  it("unmounts previously approved stages after a successful source-issue refresh", async () => {
    let approvalStatus: DesignWorkflowView["estimateApprovalStatus"] = "approved";
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: { ...workflow, estimateApprovalStatus: approvalStatus } })));
    const client = setup();
    expect(await screen.findByRole("heading", { name: "Project progress" })).toBeVisible();
    approvalStatus = "source_issue";
    await act(async () => { await client.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-ui") }); });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument());
  });

  it("keeps the Designer stage blocker without separate payment, notification or SLA reminder cards", async () => {
    const designerWorkflow: DesignWorkflowView = {
      ...workflow,
      initialPayment: { confirmedAt: null, canConfirm: false, version: 2, status: "awaiting_payment" },
      projectStages: workflow.projectStages!.map((stage) => ({ ...stage, operational: {
        ...stage.operational!, availableActions: [], blockingReasons: ["Awaiting initial payment confirmation."],
        reminders: [{ id: "sla-reminder", label: "Internal manager SLA reminder", dueAt: "2026-09-12T09:00:00.000Z" }]
      } }))
    };
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: designerWorkflow })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><ProjectWorkflowPanel projectId="project-ui" presentation="designer" /></QueryClientProvider>);
    expect(await screen.findByRole("button", { name: "Collapse Key Collection" })).toBeVisible();
    expect(screen.getByText("Awaiting initial payment confirmation.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Project notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Stage SLA reminders" })).not.toBeInTheDocument();
    expect(screen.queryByText("Keys can now be handed over.")).not.toBeInTheDocument();
    expect(screen.queryByText("Internal manager SLA reminder")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Initial payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
  });

  it("keeps an open action and its unsaved note when a background refresh fails", async () => {
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: workflow })));
    const user = userEvent.setup();
    const client = setup();
    expect(await screen.findByRole("button", { name: "Key Collection — In progress" })).toHaveAttribute("aria-expanded", "true");
    await user.click(await screen.findByRole("button", { name: "Confirm keys handed over" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Keep this handover note");
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Refresh unavailable" } }, { status: 503 })));
    await act(async () => { await client.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-ui") }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("your open form has been kept");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Keep this handover note");
    expect(screen.getByRole("form", { name: "Confirm keys handed over" })).toBeVisible();
  });

  it("keeps project notices visible when the current stage is collapsed", async () => {
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: workflow })));
    const user = userEvent.setup();
    setup();
    expect(await screen.findByRole("region", { name: "Project notifications" })).toHaveTextContent("Keys can now be handed over.");
    await user.click(screen.getByRole("button", { name: "Key Collection — In progress" }));
    expect(screen.queryByRole("button", { name: "Confirm keys handed over" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Project notifications" })).toBeVisible();
  });
});
