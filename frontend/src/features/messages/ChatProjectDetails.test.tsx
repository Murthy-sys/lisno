import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import type { ProjectStatusSummary } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import * as statusApi from "../project-status/projectStatusApi";
import { ChatProjectDetails, type ChatProjectDetailsProps } from "./ChatProjectDetails";
import { chatTestMessage, chatTestPeople, chatTestSummary } from "./projectChatFixtures";
import type { ChatAttachment } from "./projectChatTypes";

const mocks = vi.hoisted(() => ({
  identity: "client-a", role: "client" as const, statusPermission: true,
  scope: "session-a", enabled: true, denied: new Set<string>(),
  open: vi.fn(), revoke: vi.fn(), verifyAccess: vi.fn()
}));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  user: { id: mocks.identity, role: mocks.role }, status: "authenticated",
  authorization: { ...authorizationFor(mocks.role), permissions: mocks.statusPermission ? ["projects.status.read"] : [] }
}) }));
vi.mock("./ProjectChatProvider", () => ({ useProjectChat: () => ({
  userId: mocks.identity, scope: mocks.scope, enabled: mocks.enabled, denied: mocks.denied, revoke: mocks.revoke, verifyAccess: mocks.verifyAccess
}) }));
vi.mock("./ChatMessageAttachments", () => ({ useChatMediaActions: () => ({ open: mocks.open }) }));

const file = (id = "file-a", kind: ChatAttachment["kind"] = "document"): ChatAttachment => ({
  id, kind, filename: "Kitchen plans.pdf", mimeType: "application/pdf", byteSize: 2097152, preview: null
});
const workflow = (projectId = "project-a"): ProjectStatusSummary => ({
  projectId, projectName: "Courtyard residence", projectStatus: "active", serverNow: "2026-10-27T08:00:00Z", state: "active",
  currentStage: { key: "estimate_review", label: "Estimate approval" }, issue: null,
  pendingActions: [{ id: "review-a", stageKey: "estimate_review", stageLabel: "Estimate approval", action: "Review the submitted estimate", responsibleRole: "client", people: [{ id: "reviewer-a", name: "Review owner", role: "client" }], state: "pending", scheduledAt: null, deadlineAt: "2026-10-29T09:00:00Z", blocker: null }]
});
const statusKey = (projectId = "project-a") => [...statusApi.projectStatusKeys.project(projectId), "chat-details", `${mocks.scope}:${mocks.identity}:${mocks.role}`] as const;
function mount(overrides: Partial<ChatProjectDetailsProps> = {}, existingClient?: QueryClient) {
  const client = existingClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let props: ChatProjectDetailsProps = {
    summary: chatTestSummary(), participants: { items: chatTestPeople, setupWarnings: [] }, participantsPending: false, participantsError: false,
    onRetryParticipants: vi.fn(), messages: [], historyPending: false, historyError: false, historyIncomplete: false, filtered: false,
    visible: true, onParticipants: vi.fn(), onContext: vi.fn(), ...overrides
  };
  const content = () => <QueryClientProvider client={client}><MemoryRouter><main><h1>Project messages</h1><ChatProjectDetails {...props} /></main></MemoryRouter></QueryClientProvider>;
  const view = render(content());
  return { ...view, client, props, change: (changes: Partial<ChatProjectDetailsProps>) => { props = { ...props, ...changes }; view.rerender(content()); } };
}
function setVisibility(visibility: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: visibility });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  mocks.identity = "client-a"; mocks.scope = "session-a"; mocks.enabled = true; mocks.denied = new Set(); mocks.statusPermission = true;
  mocks.open.mockClear(); mocks.revoke.mockClear(); mocks.verifyAccess.mockClear();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.spyOn(statusApi, "getProjectStatus").mockImplementation(async projectId => workflow(projectId));
});
afterEach(() => { focusManager.setFocused(undefined); vi.useRealTimers(); });

describe("compact project details", () => {
  it("renders canonical identity, authorized workflow data, and a supplied overview route", async () => {
    mount({ overview: { to: "/projects/project-a", label: "Project overview" } });
    expect(screen.getByRole("heading", { name: "Courtyard residence" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View project" })).toHaveAttribute("href", "/projects/project-a");
    expect(await screen.findByText("Estimate approval")).toBeVisible();
    expect(screen.getByText("Review owner")).toBeVisible();
    expect(screen.getByText("Due by")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Bengaluru|Pinned|Online/)).not.toBeInTheDocument();
  });

  it("does not invent an overview route or fetch status without permission", () => {
    mocks.statusPermission = false;
    const view = mount();
    expect(screen.queryByRole("link", { name: "View project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Workflow status" })).not.toBeInTheDocument();
    expect(statusApi.getProjectStatus).not.toHaveBeenCalled();
    view.change({ overview: { to: "//untrusted.example/project", label: "Project" } });
    expect(screen.queryByRole("link", { name: "View project" })).not.toBeInTheDocument();
  });

  it("opens existing participant management through a callback without duplicating mutable controls", async () => {
    const view = mount();
    const region = screen.getByRole("region", { name: "Participants (3)" });
    expect(within(region).getByText("Maya Client")).toBeVisible();
    expect(within(region).getAllByText("Alex Team")).toHaveLength(2);
    expect(within(region).getByText("Plumber")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add participant" })).not.toBeInTheDocument();
    await userEvent.click(within(region).getByRole("button", { name: "View all participants" }));
    expect(view.props.onParticipants).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps participant loading, failure, retry, retained rows, and setup warnings explicit", async () => {
    const view = mount({ participants: undefined, participantsPending: true });
    expect(screen.getByText("Loading participants…")).toBeVisible();
    view.change({ participantsPending: false, participantsError: true });
    expect(screen.getByText("Participants could not be loaded.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retry participants" }));
    expect(view.props.onRetryParticipants).toHaveBeenCalledOnce();
    view.change({ participants: { items: chatTestPeople, setupWarnings: ["A project assignment needs review."] } });
    expect(screen.getByText("Participant details may be out of date.")).toBeVisible();
    expect(screen.getByText("A project assignment needs review.")).toBeVisible();
    expect(screen.getByText("Maya Client")).toBeVisible();
  });

  it("shows initial status loading and never trusts a cached result before a successful fresh read", async () => {
    let resolve!: (value: ProjectStatusSummary) => void;
    vi.mocked(statusApi.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    const client = new QueryClient();
    client.setQueryData(statusKey(), workflow());
    mount({}, client);
    expect(screen.getByText("Loading workflow status…")).toBeVisible();
    expect(screen.queryByText("Review owner")).not.toBeInTheDocument();
    await act(async () => { resolve(workflow()); });
    expect(await screen.findByText("Review owner")).toBeVisible();
  });

  it("hides cached data after an initial failure, retries, and labels subsequently stale status", async () => {
    const client = new QueryClient();
    client.setQueryData(statusKey(), workflow());
    vi.mocked(statusApi.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    const view = mount({}, client);
    expect(await screen.findByText("Workflow status could not be loaded.")).toBeVisible();
    expect(screen.queryByText("Review owner")).not.toBeInTheDocument();
    vi.mocked(statusApi.getProjectStatus).mockResolvedValue(workflow());
    await userEvent.click(screen.getByRole("button", { name: "Retry workflow status" }));
    expect(await screen.findByText("Review owner")).toBeVisible();
    vi.mocked(statusApi.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(async () => { await view.client.invalidateQueries({ queryKey: statusApi.projectStatusKeys.project("project-a") }); });
    expect(await screen.findByText("Workflow status may be out of date.")).toBeVisible();
    expect(screen.getByText("Review owner")).toBeVisible();
  });

  it.each([401, 403, 404])("purges and latches a status-only %s denial without revoking chat", async code => {
    const view = mount({ messages: [chatTestMessage({ attachments: [file()] })] });
    await screen.findByText("Review owner");
    vi.mocked(statusApi.getProjectStatus).mockRejectedValue(new ApiError(code, "FORBIDDEN", "Unavailable"));
    await act(async () => { await view.client.invalidateQueries({ queryKey: statusApi.projectStatusKeys.project("project-a") }); });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Workflow status" })).not.toBeInTheDocument());
    expect(view.client.getQueriesData({ queryKey: statusApi.projectStatusKeys.project("project-a") }).every(([, value]) => value === undefined)).toBe(true);
    expect(screen.getByText("Kitchen plans.pdf")).toBeVisible();
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.verifyAccess).not.toHaveBeenCalled();
    const calls = vi.mocked(statusApi.getProjectStatus).mock.calls.length;
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    view.change({ visible: false });
    view.change({ visible: true });
    expect(statusApi.getProjectStatus).toHaveBeenCalledTimes(calls);
  });

  it("discards delayed reads when the project or session identity changes", async () => {
    const pending: Array<{ signal?: AbortSignal; resolve: (value: ProjectStatusSummary) => void }> = [];
    vi.mocked(statusApi.getProjectStatus).mockImplementation((_id, signal) => new Promise(resolve => { pending.push({ signal, resolve }); }));
    const view = mount();
    await waitFor(() => expect(pending).toHaveLength(1));
    view.change({ summary: chatTestSummary({ project: { id: "project-b", name: "Garden residence", status: "planning" } }) });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]!.signal?.aborted).toBe(true);
    await act(async () => { pending[0]!.resolve(workflow()); });
    expect(screen.queryByText("Review owner")).not.toBeInTheDocument();
    await act(async () => { pending[1]!.resolve(workflow("project-b")); });
    expect(await screen.findByText("Review owner")).toBeVisible();
    mocks.identity = "viewer-b"; mocks.scope = "session-b";
    view.change({});
    expect(screen.queryByText("Review owner")).not.toBeInTheDocument();
    expect(view.client.getQueryData([...statusApi.projectStatusKeys.project("project-b"), "chat-details", "session-a:client-a:client"])).toBeUndefined();
  });

  it("rejects status data for a different project", async () => {
    vi.mocked(statusApi.getProjectStatus).mockResolvedValue(workflow("project-b"));
    mount();
    expect(await screen.findByText("Workflow status is unavailable.")).toBeVisible();
    expect(screen.queryByText("Review owner")).not.toBeInTheDocument();
  });

  it("cancels status on hidden details or document visibility and never polls in the background", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pending: AbortSignal[] = [];
    vi.mocked(statusApi.getProjectStatus).mockImplementation((_id, signal) => { pending.push(signal!); return new Promise(() => {}); });
    const view = mount({ visible: false });
    expect(statusApi.getProjectStatus).not.toHaveBeenCalled();
    view.change({ visible: true });
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => setVisibility("hidden"));
    expect(pending[0]!.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(statusApi.getProjectStatus).toHaveBeenCalledTimes(1);
    act(() => setVisibility("visible"));
    await waitFor(() => expect(pending).toHaveLength(2));
    view.change({ visible: false });
    expect(pending[1]!.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(statusApi.getProjectStatus).toHaveBeenCalledTimes(2);
  });

  it("immediately removes all details on conversation access loss", async () => {
    const view = mount({ messages: [chatTestMessage({ attachments: [file()] })] });
    await screen.findByText("Review owner");
    mocks.denied = new Set(["project-a"]);
    view.change({});
    expect(screen.queryByRole("region", { name: "Project details" })).not.toBeInTheDocument();
    expect(screen.queryByText("Kitchen plans.pdf")).not.toBeInTheDocument();
    expect(view.client.getQueryData(statusKey())).toBeUndefined();
  });

  it("shows only the first real next action, with schedule, role, and source issue when provided", async () => {
    const value = workflow();
    value.state = "scheduled";
    value.issue = "The approved source needs review.";
    value.pendingActions[0] = { ...value.pendingActions[0]!, state: "scheduled", scheduledAt: "2026-10-30T09:00:00Z", people: [], blocker: "Site access is unavailable." };
    value.pendingActions.push({ ...value.pendingActions[0]!, id: "second", action: "This later action is in the full status drawer" });
    vi.mocked(statusApi.getProjectStatus).mockResolvedValue(value);
    mount();
    expect(await screen.findByText("Assignment needed")).toBeVisible();
    expect(screen.getByText("Scheduled with")).toBeVisible();
    expect(screen.getByText("Scheduled for")).toBeVisible();
    expect(screen.getByText("The approved source needs review.")).toBeVisible();
    expect(screen.getByText("Site access is unavailable.")).toBeVisible();
    expect(screen.queryByText("This later action is in the full status drawer")).not.toBeInTheDocument();
  });

  it("derives files from the current project, keeps duplicate filenames distinct, and transfers only on interaction", async () => {
    mocks.statusPermission = false;
    const first = file("file-a", "image");
    const second = file("file-b");
    const messageA = chatTestMessage({ id: "message-a", body: "", attachments: [first] });
    const messageB = chatTestMessage({ id: "message-b", sequence: 4, body: "", attachments: [second] });
    const view = mount({ messages: [messageA, messageA, messageB, chatTestMessage({ id: "foreign", projectId: "project-b", attachments: [{ ...file("foreign"), filename: "Other project private file.pdf" }] })] });
    const region = screen.getByRole("region", { name: "Files in this view (2)" });
    const rows = within(region).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(screen.queryByText("Other project private file.pdf")).not.toBeInTheDocument();
    expect(mocks.open).not.toHaveBeenCalled();
    await userEvent.click(within(rows[0]!).getByRole("button", { name: "Download Kitchen plans.pdf" }));
    expect(mocks.open).toHaveBeenLastCalledWith(second, true);
    await userEvent.click(within(rows[1]!).getByRole("button", { name: "Preview Kitchen plans.pdf" }));
    expect(mocks.open).toHaveBeenLastCalledWith(first);
    await userEvent.click(within(rows[1]!).getByRole("button", { name: "View Kitchen plans.pdf in conversation" }));
    expect(view.props.onContext).toHaveBeenLastCalledWith("message-a");
  });

  it("reflects loaded-window eviction and states filtered, partial, loading, and stale file coverage", async () => {
    mocks.statusPermission = false;
    const first = chatTestMessage({ attachments: [{ ...file(), filename: "Current.pdf" }] });
    const older = chatTestMessage({ id: "older", sequence: 1, attachments: [{ ...file("older-file"), filename: "Older.pdf" }] });
    const view = mount({ messages: [first], historyIncomplete: true, filtered: true });
    expect(screen.getByText("Only the current message filter or context is included.")).toBeVisible();
    expect(screen.getByText("Older or newer history is not included.")).toBeVisible();
    view.change({ messages: [first, older] });
    expect(screen.getByRole("region", { name: "Files in this view (2)" })).toBeVisible();
    view.change({ messages: [older] });
    expect(screen.queryByText("Current.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Older.pdf")).toBeVisible();
    view.change({ historyError: true });
    expect(screen.getByText("Message history could not refresh. Files shown may be out of date.")).toBeVisible();
    view.change({ messages: [], historyPending: true, historyError: false });
    expect(screen.getByText("Loading files from messages…")).toBeVisible();
    view.change({ historyPending: false, historyError: true });
    expect(screen.getByText("Files are unavailable because message history could not be loaded.")).toBeVisible();
    view.change({ historyError: false });
    expect(screen.getByText("No files in the current message view.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /View all files/ })).not.toBeInTheDocument();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("has named, keyboard-operable controls and accessible section structure", async () => {
    const view = mount({ messages: [chatTestMessage({ attachments: [file()] })], overview: { to: "/projects/project-a", label: "Project overview" } });
    await screen.findByText("Review owner");
    const region = screen.getByRole("region", { name: "Project details" });
    expect((await axe.run(region, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    const trigger = screen.getByRole("button", { name: "View all participants" });
    act(() => trigger.focus());
    await userEvent.keyboard("{Enter}");
    expect(view.props.onParticipants).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Refresh workflow status" }));
    await waitFor(() => expect(statusApi.getProjectStatus).toHaveBeenCalledTimes(2));
  });
});
