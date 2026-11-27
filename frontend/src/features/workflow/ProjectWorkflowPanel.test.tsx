import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, AuthorizationSnapshot } from "../../api/authorization-contract";
import type { DesignPlanReviewTask } from "../../api/types";
import { ApiError } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { server } from "../../test/server";
import { ProjectWorkflowPanel } from "./ProjectWorkflowPanel";
import { designWorkflowQueryKey } from "./useDesignWorkflowQuery";
import { projectWorkflowKeys, type DesignWorkflowView } from "./projectWorkflowApi";
import * as workflowApi from "./projectWorkflowApi";
import { EXECUTION_CHOICE_OPTIONS } from "../../../../shared/projects/executionChoice";

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
  it("keeps a newer authorized workflow when a cancelled older read later returns not found", async () => {
    let rejectOld!: (error: Error) => void;
    const oldRead = new Promise<Awaited<ReturnType<typeof workflowApi.getDesignWorkflow>>>((_resolve, reject) => { rejectOld = reject; });
    const fresh = { ...workflow, receivedAt: Date.now(), projectName: "Current authorized project" };
    const read = vi.spyOn(workflowApi, "getDesignWorkflow").mockReturnValueOnce(oldRead).mockResolvedValue(fresh);
    const client = setup();
    const queryKey = designWorkflowQueryKey("project-ui", "viewer-one", "client");
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    await act(async () => {
      await client.cancelQueries({ queryKey, exact: true });
      await client.refetchQueries({ queryKey, exact: true });
    });
    expect(await screen.findByRole("heading", { name: "Project progress" })).toBeVisible();
    expect(client.getQueryData(queryKey)).toEqual(fresh);
    await act(async () => {
      rejectOld(new ApiError(404, "NOT_FOUND", "Earlier access was unavailable"));
      await oldRead.catch(() => undefined);
    });
    expect(client.getQueryData(queryKey)).toEqual(fresh);
    expect(screen.getByRole("heading", { name: "Project progress" })).toBeVisible();
    expect(screen.getByText("Keys can now be handed over.")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404])("clears private workflow after a save returns %s even when revalidation fails, then recovers after an authorized read", async status => {
    authState.authorization = authorizationFor("client", ["projects.design_workflow.read", "projects.design_workflow.act", "design.plan_response_tasks.read"]);
    let denied = false;
    let revalidated = false;
    const current: DesignWorkflowView = { ...workflow, executionChoice: {
      status: "available", version: 7, canSelect: true, keyCollectionStageId: "keys", blockingReason: null, options: EXECUTION_CHOICE_OPTIONS, selection: null
    } };
    const cachedReview: DesignPlanReviewTask = {
      id: "review-private", estimateId: "estimate-private", projectId: "project-ui", projectName: "Private review project", clientName: "Private review client",
      designPlanVersion: 15, status: "approved", deliveryStatus: "sent", submittedAt: "2026-11-27T09:00:00Z", version: 2, attachmentNames: [], canDecide: false, decision: null
    };
    const read = vi.fn(() => denied && !revalidated
      ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Refresh unavailable" } }, { status: 503 })
      : HttpResponse.json({ data: revalidated ? { ...current, executionChoice: { ...current.executionChoice!, canSelect: false } } : current }));
    server.use(
      http.get("/api/v1/projects/project-ui/design-workflow", read),
      http.get("/api/v1/admin/design-plan-response-tasks", () => HttpResponse.json({ data: [cachedReview] })),
      http.post("/api/v1/projects/project-ui/design-workflow/actions", () => { denied = true; return HttpResponse.json({ error: { code: "DENIED", message: "Unavailable" } }, { status }); })
    );
    const client = setup("client");
    const otherActorKey = designWorkflowQueryKey("project-ui", "viewer-other", "client");
    client.setQueryData(otherActorKey, current);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "Option 1" }));
    expect(await screen.findByRole("region", { name: "Design reviews" })).toBeVisible();
    expect(screen.getByText("Private review client")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    await user.click(screen.getByRole("button", { name: "Save permanently" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent("Project stages could not be refreshed");
    expect(client.getQueryData(designWorkflowQueryKey("project-ui", "viewer-one", "client"))).toBeNull();
    expect(client.getQueryData(otherActorKey)).toEqual(current);
    expect(screen.queryByRole("region", { name: "Execution choice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
    expect(screen.queryByText("Keys can now be handed over.")).not.toBeInTheDocument();
    expect(client.getQueryData(projectWorkflowKeys.projectReviews("project-ui"))).toEqual([cachedReview]);
    expect(screen.queryByRole("region", { name: "Design reviews" })).not.toBeInTheDocument();
    expect(screen.queryByText("Private review client")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reload workflow" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("region", { name: "Execution choice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Design reviews" })).not.toBeInTheDocument();
    revalidated = true;
    await user.click(screen.getByRole("button", { name: "Reload workflow" }));
    expect(await screen.findByRole("region", { name: "Execution choice" })).toBeVisible();
    expect(screen.getByText("Awaiting Client selection.")).toBeVisible();
    expect(await screen.findByRole("region", { name: "Design reviews" })).toBeVisible();
    expect(screen.getByText("Private review client")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(client.getQueryData<DesignWorkflowView>(designWorkflowQueryKey("project-ui", "viewer-one", "client"))?.executionChoice?.canSelect).toBe(false);
  });

  it("saves the dedicated execution choice and refreshes its canonical locked display", async () => {
    authState.authorization = authorizationFor("client", ["projects.design_workflow.read", "projects.design_workflow.act"]);
    let current: DesignWorkflowView = { ...workflow, executionChoice: {
      status: "available", version: 7, canSelect: true, keyCollectionStageId: "keys", blockingReason: null, options: EXECUTION_CHOICE_OPTIONS, selection: null
    } };
    const save = vi.fn(async ({ request }: { request: Request }) => {
      const command = await request.json();
      expect(command).toMatchObject({ action: "execution_path_select", expectedVersion: 7, stageId: "keys", data: { optionId: "option_2", definitionVersion: 1, acknowledgedIrreversible: true } });
      expect(command.idempotencyKey).toEqual(expect.any(String));
      const option = EXECUTION_CHOICE_OPTIONS[1]!;
      current = { ...current, executionChoice: { ...current.executionChoice!, status: "locked", version: 8, canSelect: false,
        selection: { optionId: option.id, optionLabel: option.label, definitionVersion: 1, phases: option.phases, selectedAt: "2026-11-27T09:00:00Z" } } };
      return HttpResponse.json({ data: { version: 8 } });
    });
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: current })), http.post("/api/v1/projects/project-ui/design-workflow/actions", save));
    setup("client");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "Option 2" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    await user.click(screen.getByRole("button", { name: "Save permanently" }));
    expect(await screen.findByRole("list", { name: "Planned sequence" })).toHaveTextContent("3D layoutRendersSelectionsProduction");
    expect(save).toHaveBeenCalledOnce();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("keeps a saved choice visible through an estimate source issue and removes it when project access is revoked", async () => {
    const option = EXECUTION_CHOICE_OPTIONS[0]!;
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: { ...workflow, estimateApprovalStatus: "source_issue", executionChoice: {
      status: "locked", version: 8, canSelect: false, keyCollectionStageId: "keys", blockingReason: null, options: EXECUTION_CHOICE_OPTIONS,
      selection: { optionId: option.id, optionLabel: option.label, definitionVersion: 1, phases: option.phases, selectedAt: "2026-11-27T09:00:00Z" }
    } } })));
    const client = setup("client");
    expect(await screen.findByRole("list", { name: "Planned sequence" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ error: { code: "NOT_FOUND", message: "Unavailable" } }, { status: 404 })));
    await act(async () => { await client.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-ui") }); });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Execution choice" })).not.toBeInTheDocument());
    server.use(http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: 503 })));
    await act(async () => { await client.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-ui") }); });
    expect(screen.queryByRole("list", { name: "Planned sequence" })).not.toBeInTheDocument();
  });

  it.each([
    { role: "client", presentation: "full", title: "Selections requiring your approval" },
    { role: "client", presentation: "client", title: "Selections requiring your approval" },
    { role: "designer", presentation: "designer", title: "Design requirements" }
  ] as const)("retains design requirements by default for $role in $presentation presentation", async ({ role, presentation, title }) => {
    authState.user.role = role;
    server.use(
      http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: workflow })),
      http.get("/api/v1/projects/project-ui/design-requirements", () => HttpResponse.json({ data: {
        version: 0, sourceToken: "empty", entries: [], blockers: [], canReadInternal: role !== "client"
      } }))
    );
    setup(presentation);
    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    expect(await screen.findByText("No configured design requirements for the current estimate.")).toBeVisible();
  });

  it("omits hidden selections and their read while retaining workflow actions through visibility changes", async () => {
    const readRequirements = vi.fn(() => HttpResponse.json({ data: {
      version: 0, sourceToken: "empty", entries: [], blockers: [], canReadInternal: false
    } }));
    server.use(
      http.get("/api/v1/projects/project-ui/design-workflow", () => HttpResponse.json({ data: workflow })),
      http.get("/api/v1/projects/project-ui/design-requirements", readRequirements)
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const content = (showDesignRequirements: boolean) => <QueryClientProvider client={client}>
      <ProjectWorkflowPanel projectId="project-ui" showDesignRequirements={showDesignRequirements} />
    </QueryClientProvider>;
    const view = render(content(false));
    const user = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "Project progress" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /Selections requiring your approval|Design requirements/ })).not.toBeInTheDocument();
    expect(screen.queryByText("No configured design requirements for the current estimate.")).not.toBeInTheDocument();
    expect(readRequirements).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Confirm keys handed over" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Keep this handover note");

    view.rerender(content(true));
    expect(await screen.findByRole("heading", { name: "Selections requiring your approval" })).toBeVisible();
    expect(readRequirements).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Keep this handover note");

    view.rerender(content(false));
    expect(screen.queryByRole("heading", { name: "Selections requiring your approval" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project progress" })).toBeVisible();
    expect(screen.getByRole("form", { name: "Confirm keys handed over" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Keep this handover note");
    expect(readRequirements).toHaveBeenCalledTimes(1);
  });

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
      await waitFor(() => expect(client.getQueryState(designWorkflowQueryKey("project-ui", "viewer-one", "client"))?.status).toBe("success"));
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
