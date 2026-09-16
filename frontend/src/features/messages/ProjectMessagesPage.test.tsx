import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { ApiError, tokenStorage } from "../../api/client";
import { projectChatApi } from "./projectChatApi";
import { chatTestMessage, chatTestPage, chatTestPolicy, chatTestPeople, chatTestSummary } from "./projectChatFixtures";
import { ProjectChatNavigation, ProjectChatLink } from "./ProjectChatHeader";
import { ProjectChatProvider } from "./ProjectChatProvider";
import { ProjectMessagesPage } from "./ProjectMessagesPage";
import { ProjectChatLayout } from "./ProjectChatLayout";
import { ProjectMessagesListPage } from "./ProjectMessagesListPage";
import type { runProjectChatStream } from "./projectChatStream";

type StreamOptions = Parameters<typeof runProjectChatStream>[0];
const mocks = vi.hoisted(() => ({ streams: [] as StreamOptions[], user: { id: "client-a", role: "client", name: "Maya Client" }, status: "authenticated" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: mocks.status === "authenticated" ? mocks.user : null, status: mocks.status, authorization: {} }) }));
vi.mock("../../auth/authorization", () => ({ hasFrontendPermission: () => true }));
vi.mock("./projectChatStream", () => ({ runProjectChatStream: async (options: StreamOptions) => {
  mocks.streams.push(options); options.onStatus("live");
  await new Promise<void>(resolve => { if (options.signal.aborted) resolve(); else options.signal.addEventListener("abort", () => resolve(), { once: true }); });
} }));

function app(initial = "/projects/project-a/messages", strict = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const content = <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[initial]}><ProjectChatProvider><Routes>
    <Route path="/projects/:projectId/messages" element={<ProjectMessagesPage />} />
    <Route path="/overview" element={<><h1>Overview</h1><ProjectChatNavigation projectId="project-a" overviewTo="/overview" /></>} />
    <Route element={<ProjectChatLayout />}><Route path="/project-messages" element={<ProjectMessagesListPage />} /></Route>
    <Route path="/queue" element={<><ProjectChatLink projectId="project-a" /><ProjectChatLink projectId="project-b" /></>} />
  </Routes><Link to="/overview">Project overview</Link><Link to="/projects/project-a/messages">Open conversation</Link><Link to="/projects/project-b/messages">Other conversation</Link></ProjectChatProvider></MemoryRouter></QueryClientProvider>;
  return { ...render(strict ? <StrictMode>{content}</StrictMode> : content), queryClient };
}
beforeEach(() => {
  mocks.streams = []; mocks.status = "authenticated"; mocks.user = { id: "client-a", role: "client", name: "Maya Client" };
  tokenStorage.set("chat-test-session");
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("pointer: fine"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(projectChatApi, "summary").mockImplementation(async projectId => chatTestSummary({ project: { id: projectId, name: projectId === "project-a" ? "Courtyard residence" : "Garden residence", status: "active" } }));
  vi.spyOn(projectChatApi, "attachmentPolicy").mockResolvedValue(chatTestPolicy());
  vi.spyOn(projectChatApi, "participants").mockResolvedValue({ items: chatTestPeople, setupWarnings: [] });
  vi.spyOn(projectChatApi, "messages").mockResolvedValue(chatTestPage());
  vi.spyOn(projectChatApi, "read").mockResolvedValue({ lastReadSequence: 3, counts: chatTestSummary().counts });
  vi.spyOn(projectChatApi, "options").mockResolvedValue({ items: [{ id: "site-a", name: "Lee Site", role: "site_manager" }], hasMore: false });
  vi.spyOn(projectChatApi, "conversations").mockResolvedValue({ items: [{ ...chatTestSummary(), lastMessageAt: null }], pagination: { limit: 30, offset: 0, total: 1, hasMore: false } });
});

describe("shared project messages", () => {
  it("renders server counts, safe text and member roles, with one project subscription", async () => {
    vi.mocked(projectChatApi.messages).mockResolvedValue(chatTestPage([chatTestMessage({ body: "<script>alert('x')</script> नमस्ते" })]));
    app();
    expect(await screen.findByText("Critical 3")).toBeVisible();
    expect(await screen.findByText("<script>alert('x')</script> नमस्ते")).toBeVisible();
    expect(screen.getByText("Client")).toBeVisible();
    await waitFor(() => expect(mocks.streams.filter(stream => !stream.signal.aborted)).toHaveLength(1));
    expect(projectChatApi.read).not.toHaveBeenCalled();
    expect(document.querySelector("script")).toBeNull();
  });
  it("preserves drafts and the existing stream across overview/chat navigation", async () => {
    app(); await screen.findByText("Critical 3");
    await userEvent.type(screen.getByRole("textbox", { name: "Message the project team" }), "Please confirm the finish");
    const stream = mocks.streams.at(-1)!;
    await userEvent.click(screen.getByRole("link", { name: "Project overview" }));
    await screen.findByRole("heading", { name: "Overview" });
    expect(stream.signal.aborted).toBe(false);
    await userEvent.click(screen.getByRole("link", { name: "Open conversation" }));
    expect(await screen.findByRole("textbox", { name: "Message the project team" })).toHaveValue("Please confirm the finish");
    expect(mocks.streams.at(-1)).toBe(stream);
  });
  it("shows a failed send and retries exactly the same payload/key", async () => {
    const send = vi.spyOn(projectChatApi, "send").mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Temporary failure")).mockResolvedValueOnce(chatTestMessage({ id: "saved", clientMessageId: "saved-key" }));
    app(); await screen.findByText("Critical 3");
    await userEvent.type(screen.getByRole("textbox", { name: "Message the project team" }), "Retry this safely");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]);
    await waitFor(() => expect(screen.queryByText("Not sent")).not.toBeInTheDocument());
  });
  it("invalidates history and whole-project counts on incoming committed events", async () => {
    app(); await screen.findByText("Critical 3");
    await waitFor(() => expect(mocks.streams.length).toBeGreaterThan(0));
    vi.mocked(projectChatApi.messages).mockResolvedValue(chatTestPage([chatTestMessage(), chatTestMessage({ id: "message-b", author: chatTestPeople[1], sequence: 8, body: "The plumber has replied." })]));
    vi.mocked(projectChatApi.summary).mockResolvedValue(chatTestSummary({ counts: { openCritical: 4, openImportant: 2, unread: 3, unreadMentions: 1 } }));
    act(() => mocks.streams.at(-1)!.onBatch({ events: [{ id: "event-b", projectId: "project-a", sequence: 8, type: "message.created", recordId: "message-b", version: 1, occurredAt: "2026-09-16T09:00:00Z" }], cursor: "b", hasMore: false, resync: false }));
    expect(await screen.findByText("The plumber has replied.")).toBeVisible();
    expect(await screen.findByText("Critical 4")).toBeVisible();
  });
  it("removes private content and drafts immediately on stream denial", async () => {
    const { queryClient } = app(); await screen.findByText("Critical 3");
    await userEvent.type(screen.getByRole("textbox", { name: "Message the project team" }), "Private draft");
    const stream = mocks.streams.at(-1)!;
    act(() => stream.onDenied());
    expect(await screen.findByText("Your account does not currently have access to this conversation.")).toBeVisible();
    expect(screen.queryByText(chatTestMessage().body)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message the project team" })).not.toBeInTheDocument();
    await waitFor(() => expect(stream.signal.aborted).toBe(true));
    await waitFor(() => expect(queryClient.getQueryCache().getAll().filter(query => query.queryKey.includes("project-a") && query.state.data)).toHaveLength(0));
  });
  it("treats membership denial as unavailable without displaying fabricated counts or retrying", async () => {
    vi.mocked(projectChatApi.summary).mockRejectedValue(new ApiError(404, "NOT_FOUND", "Not found"));
    app();
    await screen.findByText("Your account does not currently have access to this conversation.");
    expect(screen.queryByText("Critical 0")).not.toBeInTheDocument();
    expect(projectChatApi.summary).toHaveBeenCalledTimes(1);
    expect(mocks.streams).toHaveLength(0);
  });
  it("checks restored access without a reload and never restores a revoked draft", async () => {
    app(); await screen.findByText("Critical 3");
    await userEvent.type(screen.getByRole("textbox", { name: "Message the project team" }), "Discard this revoked draft");
    vi.mocked(projectChatApi.summary).mockRejectedValue(new ApiError(404, "NOT_FOUND", "Not found"));
    act(() => mocks.streams.at(-1)!.onDenied());
    const retry = await screen.findByRole("button", { name: "Check access again" });
    await userEvent.click(retry);
    await waitFor(() => expect(retry).not.toBeDisabled());
    expect(screen.queryByRole("textbox", { name: "Message the project team" })).not.toBeInTheDocument();
    expect(screen.queryByText("Critical 3")).not.toBeInTheDocument();
    vi.mocked(projectChatApi.summary).mockResolvedValue(chatTestSummary());
    await userEvent.click(retry);
    expect(await screen.findByRole("textbox", { name: "Message the project team" })).toHaveValue("");
    expect(await screen.findByText("Critical 3")).toBeVisible();
    await waitFor(() => expect(mocks.streams.filter(stream => !stream.signal.aborted)).toHaveLength(1));
  });
  it("keeps project access when a quoted message is unavailable", async () => {
    vi.mocked(projectChatApi.messages).mockImplementation(async (_projectId, query) => {
      if (query.around) throw new ApiError(404, "NOT_FOUND", "Not found");
      return chatTestPage();
    });
    app("/projects/project-a/messages?message=unknown");
    await screen.findByText(/This item is unavailable/);
    expect(screen.getByText("Critical 3")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Message the project team" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Return to latest messages" }));
    expect(await screen.findByText(chatTestMessage().body)).toBeVisible();
  });
  it("refreshes an issue version even after a concurrent resolution removes it from the Critical filter", async () => {
    let message = chatTestMessage({ priority: "critical", issueStatus: "open", capabilities: { canRaise: false, canResolve: true, canReopen: false, canAssign: true, canAssignSelf: true } });
    vi.mocked(projectChatApi.messages).mockImplementation(async (_projectId, query) => chatTestPage(query.filter === "critical" && message.issueStatus !== "open" ? [] : [message]));
    vi.spyOn(projectChatApi, "issue").mockImplementation(async () => {
      message = { ...message, issueStatus: "resolved", version: 2, capabilities: { ...message.capabilities, canResolve: false, canReopen: true } };
      throw new ApiError(409, "CHAT_CONFLICT", "Changed");
    });
    app("/projects/project-a/messages?filter=critical");
    await userEvent.click(await screen.findByRole("button", { name: "Message options from Maya Client" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Manage issue" }));
    await userEvent.type(screen.getByLabelText(/Resolution note/), "Trying to resolve");
    await userEvent.click(screen.getByRole("button", { name: "Save update" }));
    expect(await screen.findByText("This issue changed. Choose an available action.")).toBeVisible();
    expect(screen.getByRole("option", { name: "Reopen issue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save update" })).toBeDisabled();
  });
  it("does not open streams for queue links or the conversation list", async () => {
    const rendered = app("/queue");
    expect(await screen.findByRole("link", { name: "Messages for Courtyard residence" })).toBeVisible();
    expect(await screen.findByRole("link", { name: "Messages for Garden residence" })).toBeVisible();
    expect(mocks.streams).toHaveLength(0);
    rendered.unmount();
    app("/project-messages"); await screen.findByText("Critical 3"); expect(mocks.streams).toHaveLength(0);
  });
  it("releases all streams under StrictMode and project navigation", async () => {
    const rendered = app(undefined, true); await screen.findByText("Critical 3");
    await waitFor(() => expect(mocks.streams.filter(stream => !stream.signal.aborted)).toHaveLength(1));
    const first = mocks.streams.find(stream => !stream.signal.aborted)!;
    await userEvent.click(screen.getByRole("link", { name: "Other conversation" }));
    await screen.findByRole("heading", { name: "Garden residence" });
    await waitFor(() => expect(first.signal.aborted).toBe(true));
    expect(mocks.streams.filter(stream => !stream.signal.aborted)).toHaveLength(1);
    rendered.unmount(); expect(mocks.streams.every(stream => stream.signal.aborted)).toBe(true);
  });
  it("resolves a Critical issue using server capabilities, version, and a required note", async () => {
    const message = chatTestMessage({ priority: "critical", issueStatus: "open", raisedBy: chatTestPeople[0], capabilities: { canRaise: false, canResolve: true, canReopen: false, canAssign: true, canAssignSelf: true } });
    vi.mocked(projectChatApi.messages).mockResolvedValue(chatTestPage([message]));
    const issue = vi.spyOn(projectChatApi, "issue").mockResolvedValue({ ...message, issueStatus: "resolved", version: 2 });
    app();
    const manage = await screen.findByRole("button", { name: "Message options from Maya Client" });
    await userEvent.click(manage);
    await userEvent.click(screen.getByRole("menuitem", { name: "Manage issue" }));
    const dialog = screen.getByRole("dialog", { name: "Manage discussion issue" });
    expect(within(dialog).getByRole("button", { name: "Save update" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Resolution note/), "Position confirmed with the client.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save update" }));
    await waitFor(() => expect(issue).toHaveBeenCalled());
    expect(issue.mock.calls[0][2]).toMatchObject({ action: "resolve", expectedVersion: 1, note: "Position confirmed with the client." });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(manage).toHaveFocus();
  });
  it("shows participant source explanations and requires a reason for selection", async () => {
    const add = vi.spyOn(projectChatApi, "selectParticipant").mockResolvedValue({ items: chatTestPeople, setupWarnings: [] });
    app(); await screen.findByText("Critical 3");
    await userEvent.click(screen.getByRole("button", { name: "3 participants" }));
    expect(screen.getByText(/People linked by an assignment/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Add participant" }));
    const dialog = screen.getByRole("dialog", { name: "Add project participant" });
    await userEvent.selectOptions(await within(dialog).findByLabelText(/Eligible participant/), "site-a");
    expect(within(dialog).getByRole("button", { name: "Add participant" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Coordinates site execution");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add participant" }));
    await waitFor(() => expect(add).toHaveBeenCalled());
    expect(add.mock.calls[0][1]).toMatchObject({ userId: "site-a", reason: "Coordinates site execution" });
  });
  it("does not apply a late send response after a session is replaced", async () => {
    let resolve!: (value: ReturnType<typeof chatTestMessage>) => void;
    const pending = new Promise<ReturnType<typeof chatTestMessage>>(done => { resolve = done; });
    vi.spyOn(projectChatApi, "send").mockReturnValue(pending);
    function Switchable() {
      const [, redraw] = useState(0);
      return <><button onClick={() => { mocks.status = "unauthenticated"; tokenStorage.clear(); redraw(value => value + 1); }}>Expire session</button><ProjectChatProvider><ProjectChatNavigation projectId="project-a" /><ProjectMessagesPage /></ProjectChatProvider></>;
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/projects/project-a/messages"]}><Routes><Route path="/projects/:projectId/messages" element={<Switchable />} /></Routes></MemoryRouter></QueryClientProvider>);
    await screen.findByText(chatTestMessage().body);
    await userEvent.type(screen.getByRole("textbox", { name: "Message the project team" }), "Pending before logout");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await userEvent.click(screen.getByRole("button", { name: "Expire session" }));
    await act(async () => resolve(chatTestMessage({ body: "Late private response" })));
    expect(screen.queryByText("Late private response")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending before logout")).not.toBeInTheDocument();
  });
  it("acknowledges displayed messages only after the document becomes visible", async () => {
    const original = Object.getOwnPropertyDescriptor(document, "visibilityState");
    const observerClass = globalThis.IntersectionObserver;
    const observers: Array<{ callback: IntersectionObserverCallback; elements: Element[]; options?: IntersectionObserverInit }> = [];
    class Observer {
      entry: typeof observers[number];
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { this.entry = { callback, elements: [], options }; observers.push(this.entry); }
      observe(element: Element) { this.entry.elements.push(element); }
      disconnect() {}
    }
    globalThis.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    try {
      app(); await screen.findByText(chatTestMessage().body);
      await waitFor(() => expect(observers.some(observer => observer.elements.length)).toBe(true));
      act(() => { const observer = observers.find(item => item.elements.length)!; observer.callback(observer.elements.map(target => ({ target, isIntersecting: true }) as IntersectionObserverEntry), {} as IntersectionObserver); });
      expect(observers.find(observer => observer.elements.length)?.options?.root).toBe(screen.getByRole("region", { name: "Project conversation" }));
      expect(projectChatApi.read).not.toHaveBeenCalled();
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      fireEvent(document, new Event("visibilitychange"));
      await waitFor(() => expect(projectChatApi.read).toHaveBeenCalledWith("project-a", { messageId: "message-a", sequence: 3 }, expect.any(AbortSignal)));
    } finally {
      globalThis.IntersectionObserver = observerClass;
      if (original) Object.defineProperty(document, "visibilityState", original); else delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  });
  it.each(["?filter=critical", "?message=message-a"])("does not acknowledge filtered or quoted views (%s)", async suffix => {
    app(`/projects/project-a/messages${suffix}`); await screen.findByText(chatTestMessage().body);
    fireEvent(document, new Event("visibilitychange"));
    expect(projectChatApi.read).not.toHaveBeenCalled();
  });
  it("provides accessible names and valid roles in the rendered conversation", async () => {
    const { container } = app(); await screen.findByText(chatTestMessage().body);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
  });
  it("exposes views through the keyboard menu and clearly exits a filtered view", async () => {
    app(); await screen.findByText(chatTestMessage().body);
    const stream = mocks.streams.at(-1);
    const menu = screen.getByRole("button", { name: "Conversation options" });
    menu.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(await screen.findByRole("region", { name: "Filtered project messages" })).toBeVisible();
    expect(screen.getByText("Mentions of me")).toBeVisible();
    expect(mocks.streams.at(-1)).toBe(stream);
    await userEvent.click(screen.getByRole("button", { name: "Return to latest messages" }));
    expect(await screen.findByRole("region", { name: "Project conversation" })).toBeVisible();
  });
  it("mounts one group-information presentation and returns focus on Escape", async () => {
    app(); await screen.findByText(chatTestMessage().body);
    const group = screen.getByRole("button", { name: "3 participants" });
    await userEvent.click(group);
    expect(screen.getAllByRole("region", { name: "Participants" })).toHaveLength(1);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Project participants" })).not.toBeInTheDocument();
    expect(group).toHaveFocus();
  });
  it.each(["client", "designer", "worker_plumber"])("returns %s through the canonical role-home redirect", async role => {
    mocks.user = { ...mocks.user, role };
    app(); await screen.findByText(chatTestMessage().body);
    await userEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    expect(screen.getByRole("menuitem", { name: "Back to workspace" })).toHaveAttribute("href", "/");
  });
  it("uploads all selected files before committing an attachment-only message and preserves new typing", async () => {
    const file = new File(["synthetic document"], "plan.pdf", { type: "application/pdf" });
    let complete!: (value: Awaited<ReturnType<typeof projectChatApi.uploadAttachment>>) => void;
    const upload = vi.spyOn(projectChatApi, "uploadAttachment").mockImplementation((_id, _key, _file, progress) => { progress(45); return new Promise(resolve => { complete = resolve; }); });
    const send = vi.spyOn(projectChatApi, "send").mockResolvedValue(chatTestMessage({ body: "" }));
    app(); await screen.findByText("Critical 3");
    await userEvent.upload(screen.getByLabelText("Choose attachments"), file);
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("45% uploaded");
    expect(send).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole("textbox", { name: "Message the project team" }), "A newer draft");
    await act(async () => complete({ clientUploadId: upload.mock.calls[0][1], expiresAt: "2099-01-01T00:00:00Z", attachment: { id: "file-a", filename: file.name, kind: "document", mimeType: file.type, byteSize: file.size, preview: null } }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0][1]).toMatchObject({ body: "", attachmentIds: ["file-a"] });
    expect(screen.getByRole("textbox", { name: "Message the project team" })).toHaveValue("A newer draft");
  });
  it("replays an ambiguous media commit without reuploading, editing or discarding its files", async () => {
    const file = new File(["synthetic"], "plan.pdf", { type: "application/pdf" });
    const upload = vi.spyOn(projectChatApi, "uploadAttachment").mockResolvedValue({ clientUploadId: "upload-a", expiresAt: "2099-01-01T00:00:00Z", attachment: { id: "file-a", filename: file.name, kind: "document", mimeType: file.type, byteSize: file.size, preview: null } });
    const send = vi.spyOn(projectChatApi, "send").mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Unknown delivery")).mockResolvedValueOnce(chatTestMessage({ body: "" }));
    app(); await screen.findByText("Critical 3");
    await userEvent.upload(screen.getByLabelText("Choose attachments"), file);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Delivery unconfirmed");
    expect(screen.queryByRole("button", { name: "Edit message" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][1]).toEqual(send.mock.calls[0][1]);
    expect(upload).toHaveBeenCalledOnce();
  });
  it("uses a new message identity when a safely rejected attempt needs replacement expired stages", async () => {
    const started = Date.now();
    const file = new File(["synthetic"], "plan.pdf", { type: "application/pdf" });
    let uploads = 0;
    const upload = vi.spyOn(projectChatApi, "uploadAttachment").mockImplementation(async (_project, key) => ({ clientUploadId: key, expiresAt: new Date(started + (++uploads === 1 ? 60_000 : 240_000)).toISOString(), attachment: { id: `file-${uploads}`, filename: file.name, kind: "document", mimeType: file.type, byteSize: file.size, preview: null } }));
    const send = vi.spyOn(projectChatApi, "send").mockRejectedValueOnce(new ApiError(422, "INVALID_MESSAGE", "Please retry this message.")).mockResolvedValueOnce(chatTestMessage());
    app(); await screen.findByText("Critical 3");
    await userEvent.upload(screen.getByLabelText("Choose attachments"), file);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Not sent");
    vi.spyOn(Date, "now").mockReturnValue(started + 120_000);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(upload.mock.calls[1][1]).not.toBe(upload.mock.calls[0][1]);
    expect(send.mock.calls[1][1].clientMessageId).not.toBe(send.mock.calls[0][1].clientMessageId);
    expect(send.mock.calls[1][1].attachmentIds).toEqual(["file-2"]);
  });
  it("limits uploads across multiple attempts to two and never commits a partial selection", async () => {
    const pending: Array<{ resolve: (value: Awaited<ReturnType<typeof projectChatApi.uploadAttachment>>) => void; file: File; key: string }> = [];
    const upload = vi.spyOn(projectChatApi, "uploadAttachment").mockImplementation((_id, key, file) => new Promise(resolve => pending.push({ resolve, file, key })));
    const send = vi.spyOn(projectChatApi, "send").mockResolvedValue(chatTestMessage());
    const files = [1, 2, 3, 4].map(index => new File([`file ${index}`], `plan-${index}.pdf`, { type: "application/pdf" }));
    app(); await screen.findByText("Critical 3");
    await userEvent.upload(screen.getByLabelText("Choose attachments"), files.slice(0, 2));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    await userEvent.upload(screen.getByLabelText("Choose attachments"), files.slice(2));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(upload).toHaveBeenCalledTimes(2);
    const finish = (index: number) => { const item = pending[index]; item.resolve({ clientUploadId: item.key, expiresAt: "2099-01-01T00:00:00Z", attachment: { id: `file-${index}`, kind: "document", filename: item.file.name, mimeType: item.file.type, byteSize: item.file.size, preview: null } }); };
    await act(async () => finish(0));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
    expect(send).not.toHaveBeenCalled();
    await act(async () => finish(1));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(4));
    await act(async () => { finish(2); finish(3); });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0][1].attachmentIds).toEqual(["file-0", "file-1"]);
    expect(send.mock.calls[1][1].attachmentIds).toEqual(["file-2", "file-3"]);
  });
  it("retains interrupted files across project changes and ignores the previous run's late progress", async () => {
    let progress!: (value: number) => void;
    const upload = vi.spyOn(projectChatApi, "uploadAttachment").mockImplementation((_id, _key, _file, onProgress, signal) => { progress = onProgress; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))); });
    app(); await screen.findByText("Critical 3");
    const file = new File(["synthetic"], "plan.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("Choose attachments"), file);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole("link", { name: "Other conversation" }));
    await screen.findByRole("heading", { name: "Garden residence" });
    expect(upload.mock.calls[0][4].aborted).toBe(true);
    await userEvent.click(screen.getByRole("link", { name: "Open conversation" }));
    await screen.findByText("plan.pdf");
    act(() => progress(99));
    expect(screen.queryByText("99% uploaded")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
  it("leaves text chat available when an older server has no attachment policy", async () => {
    vi.mocked(projectChatApi.attachmentPolicy).mockRejectedValue(new ApiError(404, "NOT_FOUND", "Not found"));
    app(); await screen.findByText(chatTestMessage().body);
    await waitFor(() => expect(projectChatApi.attachmentPolicy).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Attach" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message the project team" })).toBeEnabled();
  });
  it("reuses successful stages after one file fails and never sends a subset", async () => {
    let secondCalls = 0;
    const upload = vi.spyOn(projectChatApi, "uploadAttachment").mockImplementation(async (_project, key, file) => {
      if (file.name === "second.pdf" && ++secondCalls === 1) throw new ApiError(422, "INVALID_FILE", "The file could not be validated.");
      return { clientUploadId: key, expiresAt: "2099-01-01T00:00:00Z", attachment: { id: file.name, filename: file.name, byteSize: file.size, mimeType: file.type, kind: "document", preview: null } };
    });
    const send = vi.spyOn(projectChatApi, "send").mockResolvedValue(chatTestMessage());
    app(); await screen.findByText("Critical 3");
    await userEvent.upload(screen.getByLabelText("Choose attachments"), ["first.pdf", "second.pdf"].map(name => new File([name], name, { type: "application/pdf" })));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Not sent");
    expect(send).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls[2][1]).toBe(upload.mock.calls[1][1]);
    expect(send.mock.calls[0][1].attachmentIds).toEqual(["first.pdf", "second.pdf"]);
  });
  it("cancels upload work, discards a known ready stage and retains all local files", async () => {
    const discard = vi.spyOn(projectChatApi, "discardAttachment").mockResolvedValue({ id: "first.pdf", discarded: true });
    const upload = vi.spyOn(projectChatApi, "uploadAttachment").mockImplementation(async (_project, key, file, _progress, signal) => {
      if (file.name === "second.pdf") return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
      return { clientUploadId: key, expiresAt: "2099-01-01T00:00:00Z", attachment: { id: file.name, filename: file.name, byteSize: file.size, mimeType: file.type, kind: "document", preview: null } };
    });
    const send = vi.spyOn(projectChatApi, "send");
    app(); await screen.findByText("Critical 3");
    await userEvent.upload(screen.getByLabelText("Choose attachments"), ["first.pdf", "second.pdf"].map(name => new File([name], name, { type: "application/pdf" })));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Uploaded");
    await userEvent.click(screen.getByRole("button", { name: "Cancel transfer" }));
    await screen.findByText("Not sent");
    expect(discard).toHaveBeenCalledWith("project-a", "first.pdf", expect.any(AbortSignal));
    expect(upload.mock.calls[1][4].aborted).toBe(true);
    expect(screen.getByText("first.pdf")).toBeVisible();
    expect(screen.getByText("second.pdf")).toBeVisible();
    expect(send).not.toHaveBeenCalled();
  });
});
