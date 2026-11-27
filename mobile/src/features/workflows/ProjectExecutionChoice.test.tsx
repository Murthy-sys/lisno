import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { EXECUTION_CHOICE_OPTIONS, executionChoiceOption, type ExecutionChoiceOptionId, type ExecutionChoiceView } from "../../../../shared/projects/executionChoice";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProjectExecutionChoice } from "./ProjectExecutionChoice";
import { WorkflowWorkspace } from "./WorkflowWorkspace";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: jest.fn(), useScaffoldNavigationBlocked: () => false }));

const session: AuthenticatedSession = {
  user: { id: "client-a", name: "Client A", email: "client-a@example.invalid", role: "client" },
  authorization: { role: "client", policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: ["projects.design_workflow.read", "projects.design_workflow.act"] }
};
const available: ExecutionChoiceView = {
  status: "available", version: 7, canSelect: true, blockingReason: null,
  keyCollectionStageId: "project-a:design-stage:key_collection", options: EXECUTION_CHOICE_OPTIONS, selection: null
};
function locked(optionId: ExecutionChoiceOptionId = "option_1"): ExecutionChoiceView {
  const option = executionChoiceOption(optionId);
  return { ...available, status: "locked", version: 8, canSelect: false,
    selection: { optionId, optionLabel: option.label, definitionVersion: 1, phases: option.phases, selectedAt: "2026-11-27T10:00:00Z" } };
}
function runtime(currentSession = session, environmentId = "test", generation = 1) {
  const post = jest.fn().mockResolvedValue({ version: 8 });
  const get = jest.fn();
  const context = { runtime: { api: { authenticated: { post, get } } }, environment: { environment: { id: environmentId }, generation: 1 },
    session: { status: "authenticated", generation, session: currentSession } };
  jest.mocked(useConfiguredRuntime).mockReturnValue(context as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return { post, get, client, context };
}
async function setup(projection: unknown = available, actor = session) {
  const value = runtime(actor);
  const refresh = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const content = (next: unknown, projectId = "project-a", nextSession = actor, refreshing = false, refreshError = false) =>
    <QueryClientProvider client={value.client}><ProjectExecutionChoice projectId={projectId} session={nextSession} projection={next}
      refreshing={refreshing} refreshError={refreshError} refresh={refresh} onAccessDenied={refresh} /></QueryClientProvider>;
  const view = await render(content(projection));
  return { ...value, refresh, view, content };
}
async function open(option = "Option 1") {
  await fireEvent.press(screen.getByRole("radio", { name: option }));
  await fireEvent.press(screen.getByRole("button", { name: "Save execution choice" }));
  await screen.findByText("Once saved, this choice cannot be changed or revoked.");
}
const invalidate = jest.fn<Promise<void>, [string]>();
const navigation = { setBlocked: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks(); invalidate.mockResolvedValue(undefined);
  jest.mocked(useInvalidateEvent).mockReturnValue(invalidate);
  jest.mocked(useScaffoldNavigationGuard).mockReturnValue(navigation);
});

it("shows both exact sequences without a default selection and cancelling writes nothing", async () => {
  const { post } = await setup();
  expect(screen.getByRole("radio", { name: "Option 1" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "Option 2" })).not.toBeChecked();
  expect(screen.getByText("1. 2D layout")).toBeTruthy();
  expect(screen.getAllByText("3. Selections")).toHaveLength(2);
  expect(screen.getByText("4. Renders")).toBeTruthy();
  expect(screen.getByText("2. Renders")).toBeTruthy();
  expect(screen.getByText("4. Production")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save execution choice" })).toBeDisabled();
  await open("Option 2");
  expect(post).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
  expect(screen.getByRole("radio", { name: "Option 2" })).toBeChecked();
  expect(post).not.toHaveBeenCalled();
});

it.each(["option_1", "option_2"] as const)("saves %s only after confirmation and remains locked until canonical refresh", async optionId => {
  const { post, refresh, view, content } = await setup();
  let finish!: (value: { version: number }) => void;
  post.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await open(executionChoiceOption(optionId).label);
  await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", {
    action: "execution_path_select", expectedVersion: 7, stageId: available.keyCollectionStageId,
    idempotencyKey: expect.any(String), data: { optionId, definitionVersion: 1, acknowledgedIrreversible: true }
  });
  await act(async () => { finish({ version: 8 }); });
  await screen.findByText("Saved permanently");
  expect(screen.queryByRole("radio")).toBeNull();
  expect(invalidate).toHaveBeenCalledWith("design-workflow-changed");
  expect(refresh).toHaveBeenCalled();
  await view.rerender(content(locked(optionId)));
  expect(screen.getByText("Planned sequence")).toBeTruthy();
  expect(screen.queryByText("Save execution choice")).toBeNull();
  await waitFor(() => expect(navigation.setBlocked).toHaveBeenLastCalledWith(false));
});

it("requires both key confirmations through the server capability and keeps staff read-only", async () => {
  const { view, content } = await setup({ ...available, status: "waiting_for_keys", canSelect: false });
  expect(screen.getByText("Available after you and your Designer confirm key collection.")).toBeTruthy();
  expect(screen.queryByRole("radio")).toBeNull();
  await view.rerender(content({ ...available, canSelect: false }));
  expect(screen.getByText("Awaiting Client selection")).toBeTruthy();
  expect(screen.queryByText("Save execution choice")).toBeNull();
});

it("does not allow a staff identity to save even if a stale projection has Client capability", async () => {
  const designer: AuthenticatedSession = { ...session, user: { ...session.user, id: "designer-a", role: "designer" },
    authorization: { ...session.authorization, role: "designer" } };
  await setup(available, designer);
  expect(screen.getByText("Awaiting Client selection")).toBeTruthy();
  expect(screen.queryByRole("radio")).toBeNull();
});

it.each([undefined, { ...available, version: -1 }, { ...available, options: [] }])("fails closed for an absent or malformed projection", async projection => {
  // Pass explicitly after setup because its default represents a current server.
  const { view, content } = await setup(); await view.rerender(content(projection));
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.getByText(/Execution choice is unavailable/)).toBeTruthy();
});

it("keeps the exact command after a lost reply and forbids cancelling or switching options", async () => {
  const { post } = await setup(); post.mockRejectedValueOnce(new Error("Lost reply"));
  await open(); await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  const retry = await screen.findByRole("button", { name: "Retry saved execution choice" });
  expect(screen.getByRole("button", { name: "Go back" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Option 2", includeHiddenElements: true })).toBeDisabled();
  await fireEvent.press(retry);
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
  await screen.findByText("Saved permanently");
});

it("treats a malformed successful response as uncertain and retries its original command", async () => {
  const { post } = await setup(); post.mockResolvedValueOnce({ version: "8" });
  await open(); await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Retry saved execution choice" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
});

it("blocks a confirmation whose captured version changed and requires another explicit confirmation", async () => {
  const { post, content, view } = await setup(); await open();
  await view.rerender(content({ ...available, version: 9 }));
  expect(screen.getByRole("button", { name: "Save permanently" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save execution choice" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ expectedVersion: 9 })));
});

it("refreshes a conflict and displays the winning choice without submitting the alternative", async () => {
  const { post, refresh, content, view } = await setup();
  post.mockRejectedValueOnce(new ApiError(409, "EXECUTION_PATH_ALREADY_SELECTED", "Already selected"));
  await open("Option 2"); await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  await view.rerender(content(locked("option_1")));
  expect(screen.getByText("Option 1")).toBeTruthy();
  expect(screen.getByText("Saved permanently")).toBeTruthy();
  expect(screen.queryByRole("radio")).toBeNull(); expect(post).toHaveBeenCalledTimes(1);
});

it("does not reopen after a successful save followed by a failed canonical refresh", async () => {
  const { refresh, content, view } = await setup(); refresh.mockRejectedValue(new Error("Offline"));
  await open(); await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  await screen.findByText("Saved permanently");
  await view.rerender(content(available, "project-a", session, false, true));
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.getByRole("button", { name: "Refresh saved choice" })).toBeTruthy();
});

it("hides the decision after mutation access is denied", async () => {
  const { post, refresh } = await setup(); post.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
  refresh.mockRejectedValue(new Error("Offline"));
  await open(); await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  await screen.findByText("Execution choice is unavailable for this account.");
  expect(screen.queryByRole("radio")).toBeNull(); expect(screen.queryByText("Confirm execution choice")).toBeNull();
});

it("resets local drafts after project, user, environment, or session generation changes", async () => {
  const { content, view, context } = await setup(); await open();
  await view.rerender(content(available, "project-b"));
  expect(screen.queryByText("Confirm execution choice")).toBeNull();
  expect(screen.getByRole("radio", { name: "Option 1" })).not.toBeChecked();
  await open();
  const other = { ...session, user: { ...session.user, id: "client-b" } };
  jest.mocked(useConfiguredRuntime).mockReturnValue({ ...context, session: { ...context.session, session: other } } as never);
  await view.rerender(content(available, "project-b", other));
  expect(screen.getByRole("radio", { name: "Option 1" })).not.toBeChecked();
  await open();
  jest.mocked(useConfiguredRuntime).mockReturnValue({ ...context, environment: { ...context.environment, environment: { id: "another" } }, session: { ...context.session, session: other } } as never);
  await view.rerender(content(available, "project-b", other));
  expect(screen.getByRole("radio", { name: "Option 1" })).not.toBeChecked();
  await open();
  jest.mocked(useConfiguredRuntime).mockReturnValue({ ...context, session: { ...context.session, generation: 2, session: other } } as never);
  await view.rerender(content(available, "project-b", other));
  expect(screen.queryByText("Confirm execution choice")).toBeNull();
});

it("ignores a completed request from a previous project identity", async () => {
  const { post, content, view, refresh } = await setup();
  let finish!: (value: { version: number }) => void;
  post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await open(); await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  await view.rerender(content(available, "project-b"));
  await act(async () => { finish({ version: 8 }); });
  expect(screen.queryByText("Saved permanently")).toBeNull();
  expect(refresh).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled();
});

it("integrates with the workspace, retains saved data after transient refresh failure, and clears revoked cache", async () => {
  const { get, client } = runtime();
  get.mockResolvedValue({ projectId: "project-a", projectStages: [], executionChoice: locked("option_2") });
  await render(<QueryClientProvider client={client}><WorkflowWorkspace projectId="project-a" session={session} /></QueryClientProvider>);
  await screen.findByText("Saved permanently");
  get.mockRejectedValue(new Error("Offline"));
  await fireEvent.press(screen.getByRole("button", { name: "Refresh workflow" }));
  await screen.findByText("The latest workflow refresh failed. Saved information is shown.");
  expect(screen.getByText("Saved permanently")).toBeTruthy();
  get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
  await fireEvent.press(screen.getByRole("button", { name: "Refresh workflow" }));
  await screen.findByText("The project workflow is unavailable for this account.");
  expect(screen.queryByText("Saved permanently")).toBeNull();
  expect(client.getQueryData(privateQueryKey({ environmentId: "test", userId: "client-a" }, "workflow", "project", "project-a"))).toBeNull();
  get.mockRejectedValue(new Error("Offline again"));
  await fireEvent.press(screen.getByRole("button", { name: "Retry workflow" }));
  await screen.findByText("The project workflow could not be loaded.");
  expect(screen.queryByText("Saved permanently")).toBeNull();
});

it("provides retry for the initial workspace load and rejects a different project's response", async () => {
  const { get, client } = runtime(); get.mockResolvedValue({ projectId: "project-b", executionChoice: locked() });
  await render(<QueryClientProvider client={client}><WorkflowWorkspace projectId="project-a" session={session} /></QueryClientProvider>);
  await screen.findByText("The project workflow could not be loaded.");
  expect(screen.queryByText("Saved permanently")).toBeNull();
  get.mockResolvedValue({ projectId: "project-a", projectStages: [], executionChoice: available });
  await fireEvent.press(screen.getByRole("button", { name: "Retry workflow" }));
  await screen.findByRole("radio", { name: "Option 1" });
});

function privateWorkflow() {
  return {
    projectId: "project-a", executionChoice: available,
    initialPayment: { version: 7, canConfirm: false, issue: "Private payment detail" },
    projectStages: [{ id: available.keyCollectionStageId, name: "Private key stage", type: "key_collection",
      operational: { version: 7, status: "completed", progress: 100, availableActions: [], blockingReasons: [],
        facts: [{ label: "Collection", value: "Private collection fact" }],
        history: [{ id: "key-event", action: "keys_received", actorName: "Assigned Designer", at: "2026-11-27T09:00:00Z", note: "Private history detail" }] } }]
  };
}

it.each([401, 403, 404])("purges the complete scoped workflow after POST %s, cancels old reads, and recovers after GET 503", async status => {
  const { post, get, client } = runtime();
  const previous = privateWorkflow();
  get.mockResolvedValueOnce(previous);
  const key = privateQueryKey({ environmentId: "test", userId: "client-a" }, "workflow", "project", "project-a");
  const otherActorKey = privateQueryKey({ environmentId: "test", userId: "client-b" }, "workflow", "project", "project-a");
  const otherProjectKey = privateQueryKey({ environmentId: "test", userId: "client-a" }, "workflow", "project", "project-b");
  client.setQueryDefaults(otherActorKey, { gcTime: Infinity });
  client.setQueryDefaults(otherProjectKey, { gcTime: Infinity });
  client.setQueryData(otherActorKey, { sentinel: "Other Client's data" });
  client.setQueryData(otherProjectKey, { sentinel: "Other project's data" });
  await render(<QueryClientProvider client={client}><WorkflowWorkspace projectId="project-a" session={session} /></QueryClientProvider>);
  await screen.findByText("Private payment detail");
  await fireEvent.press(screen.getByText("Private key stage"));
  expect(screen.getByText("Private history detail")).toBeTruthy();
  expect(screen.getByText("Collection: Private collection fact")).toBeTruthy();

  let rejectSave!: (cause: unknown) => void;
  post.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectSave = reject; }));
  await open(); await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  let finishOldRead!: (data: unknown) => void;
  let oldSignal: AbortSignal | undefined;
  get.mockImplementationOnce((_path, options: { signal: AbortSignal }) => {
    oldSignal = options.signal;
    return new Promise(resolve => { finishOldRead = resolve; });
  });
  let olderRead!: Promise<void>;
  await act(async () => { olderRead = client.refetchQueries({ queryKey: key, exact: true }); });
  expect(get).toHaveBeenCalledTimes(2);
  get.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Try later"));
  await act(async () => { rejectSave(new ApiError(status, "ACCESS_DENIED", "Denied")); });
  await screen.findByText("The project workflow could not be loaded.");
  expect(oldSignal?.aborted).toBe(true);
  expect(client.getQueryData(key)).toBeNull();
  expect(screen.queryByText("Private key stage")).toBeNull();
  expect(screen.queryByText("Private payment detail")).toBeNull();
  expect(screen.queryByText("Private history detail")).toBeNull();
  expect(screen.queryByText("Collection: Private collection fact")).toBeNull();
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByText("Confirm execution choice")).toBeNull();

  await act(async () => { finishOldRead(previous); await olderRead; });
  expect(client.getQueryData(key)).toBeNull();
  expect(screen.queryByText("Private payment detail")).toBeNull();
  expect(client.getQueryData(otherActorKey)).toEqual({ sentinel: "Other Client's data" });
  expect(client.getQueryData(otherProjectKey)).toEqual({ sentinel: "Other project's data" });

  get.mockResolvedValueOnce({ ...previous, projectStages: [{ ...previous.projectStages[0], name: "Revalidated key stage" }] });
  await fireEvent.press(screen.getByRole("button", { name: "Retry workflow" }));
  await screen.findByText("Revalidated key stage");
  expect(screen.getByText("Private payment detail")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Option 1" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "Option 1" })).not.toBeDisabled();
  expect(screen.queryByText("Execution choice is unavailable for this account.")).toBeNull();
  expect(post).toHaveBeenCalledTimes(1);
});

it("restores the choice after action-only 403 when immediate authorized revalidation succeeds", async () => {
  const { post, get, client } = runtime(); get.mockResolvedValue(privateWorkflow());
  post.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Action denied"));
  await render(<QueryClientProvider client={client}><WorkflowWorkspace projectId="project-a" session={session} /></QueryClientProvider>);
  await screen.findByRole("radio", { name: "Option 1" });
  await open(); await fireEvent.press(screen.getByRole("button", { name: "Save permanently" }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  await screen.findByRole("radio", { name: "Option 1" });
  expect(screen.getByRole("radio", { name: "Option 1" })).not.toBeDisabled();
  expect(screen.getByRole("radio", { name: "Option 1" })).not.toBeChecked();
  expect(screen.queryByText("Execution choice is unavailable for this account.")).toBeNull();
  expect(screen.queryByText("Confirm execution choice")).toBeNull();
  expect(screen.getByText("Private payment detail")).toBeTruthy();
});

it("uses the Client-facing execution choice label in workflow history", async () => {
  const { get, client } = runtime();
  const workflow = privateWorkflow();
  workflow.projectStages[0]!.operational.history[0]!.action = "execution_path_select";
  get.mockResolvedValue({ ...workflow, executionChoice: locked() });
  await render(<QueryClientProvider client={client}><WorkflowWorkspace projectId="project-a" session={session} /></QueryClientProvider>);
  await screen.findByText("Saved permanently");
  await fireEvent.press(screen.getByText("Private key stage"));
  expect(screen.getByText("Execution choice saved")).toBeTruthy();
  expect(screen.queryByText("execution path select")).toBeNull();
});
