import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { ApiError, apiClient } from "../../api/client";
import { clientKeys } from "../client/clientApi";
import { estimateWorkflowKeys } from "../estimates/estimateWorkflowApi";
import { EstimateSpacePlanningCompletion, SpacePlanningCompletion } from "./SpacePlanningCompletion";
import { WorkflowStageActions } from "./WorkflowStageActions";
import { projectWorkflowKeys, type DesignWorkflowStage, type DesignWorkflowView } from "./projectWorkflowApi";

const label = "Approve and complete stage";
function fixture() {
  const stage: DesignWorkflowStage = {
    id: "project-a:space-planning", type: "space_planning_tentative_look_feel", name: "Designer Uploading Space planning with Tentative look and Feel", order: 5,
    dependencyStageIds: [], status: "in_review", progress: 0, deadlineAt: null, deadlineTaskId: null, tasks: [],
    operational: {
      status: "in_review", version: 7, availableActions: [{ id: "space_planning_complete", label, actor: "client", requiresProof: false }],
      timing: { state: "not_applicable", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
      blockingReasons: [], facts: [], history: [],
      spacePlanning: { estimateId: "estimate-a", designPlanVersion: 3, reviewRoundId: "round-a", totalImages: 3, approvedImages: 3, readyForCompletion: true, completedAt: null }
    }
  };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-09-18T09:00:00.000Z", projectStages: [stage], floors: [] };
  return { stage, workflow };
}
function setup(data = fixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = render(<SpacePlanningCompletion {...data} reviewHref="/client?estimate=estimate-a" />, { wrapper });
  return { ...view, ...data, client, wrapper };
}
async function open() {
  await userEvent.setup().click(screen.getByRole("button", { name: label }));
  return screen.getByRole("dialog", { name: "Complete space planning?" });
}

describe("Client space-planning completion", () => {
  it.each([
    ["partially reviewed", { approvedImages: 2, readyForCompletion: false }],
    ["rejected or open feedback", { readyForCompletion: false }],
    ["empty", { totalImages: 0, approvedImages: 0 }],
    ["missing approved round", { reviewRoundId: null }],
    ["unversioned", { designPlanVersion: 0 }],
    ["inconsistent counts", { approvedImages: 2 }]
  ])("does not offer final approval for a %s plan", (_reason, source) => {
    const data = fixture();
    Object.assign(data.stage.operational!.spacePlanning!, source);
    setup(data);
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review design images" })).toHaveAttribute("href", "/client?estimate=estimate-a");
  });

  it("requires the backend Client action even when every count is approved", () => {
    const data = fixture();
    data.stage.operational!.availableActions = [];
    const view = setup(data);
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    data.stage.operational!.availableActions = [{ id: "space_planning_complete", label, actor: "designer", requiresProof: false }];
    view.rerender(<SpacePlanningCompletion {...data} />);
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  });

  it("shows completed source state without a second completion button", () => {
    const data = fixture();
    data.stage.operational!.spacePlanning!.completedAt = "2026-09-18T10:00:00.000Z";
    setup(data);
    expect(screen.getByRole("status")).toHaveTextContent("Space planning completed");
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  });

  it("shows the backend prerequisite alongside a disabled final action", () => {
    const data = fixture();
    data.stage.operational!.availableActions[0]!.disabledReason = "Complete the furniture stage first.";
    setup(data);
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    expect(screen.getByRole("button", { name: label })).toHaveAccessibleDescription("Complete the furniture stage first.");
  });

  it("confirms the exact version/round and refreshes Client and workflow views once", async () => {
    let resolve!: (value: { version: number }) => void;
    const post = vi.spyOn(apiClient, "post").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const dialog = await open();
    expect(dialog).toHaveAccessibleDescription(/design plan version 3/);
    const submit = within(dialog).getByRole("button", { name: label });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", {
      stageId: "project-a:space-planning", action: "space_planning_complete", expectedVersion: 7,
      idempotencyKey: expect.any(String), data: { estimateId: "estimate-a", designPlanVersion: 3, reviewRoundId: "round-a" }
    }, { showGlobalLoader: false });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => { resolve({ version: 8 }); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Space planning completed");
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    for (const key of [projectWorkflowKeys.all, clientKeys.projects, clientKeys.latestVersions, estimateWorkflowKeys.client]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }
  });

  it.each(["estimate", "plan", "round", "workflow", "permission", "readiness", "project"])("blocks an open confirmation when the %s changes", async (change) => {
    const post = vi.spyOn(apiClient, "post");
    const view = setup();
    await open();
    const next = fixture();
    if (change === "estimate") next.stage.operational!.spacePlanning!.estimateId = "estimate-b";
    if (change === "plan") next.stage.operational!.spacePlanning!.designPlanVersion = 4;
    if (change === "round") next.stage.operational!.spacePlanning!.reviewRoundId = "round-b";
    if (change === "workflow") next.stage.operational!.version = 8;
    if (change === "permission") next.stage.operational!.availableActions = [];
    if (change === "readiness") next.stage.operational!.spacePlanning!.readyForCompletion = false;
    if (change === "project") next.workflow.projectId = "project-b";
    view.rerender(<SpacePlanningCompletion {...next} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: label })).toBeDisabled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The plan or workflow changed");
    expect(post).not.toHaveBeenCalled();
  });

  it("fails closed on refresh errors and waits for in-progress refreshes", async () => {
    const view = setup();
    view.rerender(<SpacePlanningCompletion workflow={view.workflow} stage={view.stage} refreshing />);
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    view.rerender(<SpacePlanningCompletion workflow={view.workflow} stage={view.stage} />);
    await open();
    view.rerender(<SpacePlanningCompletion workflow={view.workflow} stage={view.stage} refreshError />);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: label })).toBeDisabled();
  });

  it("keeps a transient failure retryable with the same idempotency key", async () => {
    const post = vi.spyOn(apiClient, "post").mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ version: 8 });
    setup();
    const dialog = await open();
    await userEvent.setup().click(within(dialog).getByRole("button", { name: label }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Please try again");
    await userEvent.setup().click(within(dialog).getByRole("button", { name: label }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]![1]).toEqual(post.mock.calls[0]![1]);
  });

  it("requires a fresh confirmation after a server version conflict", async () => {
    const post = vi.spyOn(apiClient, "post").mockRejectedValue(new ApiError(409, "CONFLICT", "The workflow changed."));
    const { client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const dialog = await open();
    await userEvent.setup().click(within(dialog).getByRole("button", { name: label }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: label })).toBeDisabled());
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Close this confirmation");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.all });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("uses the shared confirmation in the sixth stage and supports keyboard/accessibility", async () => {
    const { wrapper } = setup();
    // A separate render exercises WorkflowStageActions without routing this action through its generic form.
    const data = fixture();
    const view = render(<WorkflowStageActions {...data} presentation="client" />, { wrapper });
    expect((await axe.run(document.body, { runOnly: ["landmark-unique"] })).violations).toEqual([]);
    const action = within(view.container).getByRole("button", { name: label });
    await userEvent.setup().click(action);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("Note")).not.toBeInTheDocument();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.setup().keyboard("{Escape}");
    await waitFor(() => expect(action).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Completion beside Client estimate images", () => {
  it("loads only the named project, handles loading and retries a failed read", async () => {
    let reject!: (reason: Error) => void;
    const get = vi.spyOn(apiClient, "get").mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; })).mockResolvedValue(fixture().workflow);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimateSpacePlanningCompletion projectId="project-a" estimateId="estimate-a" /></QueryClientProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading space planning status");
    await act(async () => { reject(new Error("Offline")); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Space planning status could not be loaded");
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry stage status" }));
    expect(await screen.findByRole("button", { name: label })).toBeEnabled();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.every(([path]) => path === "/projects/project-a/design-workflow")).toBe(true);
  });

  it.each(["project", "estimate"])("does not show an action from a different %s", async (different) => {
    const data = fixture();
    if (different === "project") data.workflow.projectId = "project-b";
    else data.stage.operational!.spacePlanning!.estimateId = "estimate-b";
    vi.spyOn(apiClient, "get").mockResolvedValue(data.workflow);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimateSpacePlanningCompletion projectId="project-a" estimateId="estimate-a" /></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByText("Loading space planning status…")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    expect(screen.queryByText("3 of 3 images approved")).not.toBeInTheDocument();
  });

  it("does not load or show stage controls without both stable IDs", () => {
    const get = vi.spyOn(apiClient, "get");
    const client = new QueryClient();
    const view = render(<QueryClientProvider client={client}><EstimateSpacePlanningCompletion projectId="" estimateId="estimate-a" /></QueryClientProvider>);
    view.rerender(<QueryClientProvider client={client}><EstimateSpacePlanningCompletion projectId="project-a" estimateId="" /></QueryClientProvider>);
    expect(get).not.toHaveBeenCalled();
    expect(view.container).toBeEmptyDOMElement();
  });
});
