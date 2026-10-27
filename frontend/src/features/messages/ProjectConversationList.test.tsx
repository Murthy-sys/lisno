import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { ProjectConversationList } from "./ProjectConversationList";
import { chatKeys, projectChatApi } from "./projectChatApi";
import { chatTestPeople, chatTestSummary } from "./projectChatFixtures";
import type { ChatConversation, ChatConversationPage } from "./projectChatTypes";

const fixture = vi.hoisted(() => ({ enabled: true, scope: "list-scheduling-test", denied: new Set<string>() }));
vi.mock("./ProjectChatProvider", () => ({ useProjectChat: () => fixture }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: null, authorization: null }) }));

let desktop = true;
let visible = true;
let mediaListeners: Set<() => void>;
let media: MediaQueryList;
const clients: QueryClient[] = [];

function page(offset = 0): ChatConversationPage {
  return {
    items: [{ ...chatTestSummary({ project: { id: `project-${offset}`, name: `Residence ${offset}`, status: "active" } }), lastMessageAt: null, lastMessage: null }],
    pagination: { offset, limit: 30, total: 31, hasMore: offset === 0 },
    totals: { unread: 9, critical: 14, important: 4 }
  };
}

function app(selectedProjectId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const tree = (selected?: string) => <QueryClientProvider client={client}><MemoryRouter><ProjectConversationList selectedProjectId={selected} /></MemoryRouter></QueryClientProvider>;
  const result = render(tree(selectedProjectId));
  return { ...result, client, select: (selected?: string) => result.rerender(tree(selected)) };
}

async function advance(milliseconds = 1) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
  // A debounced state change mounts its query after the first React flush.
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}
function setDesktop(value: boolean) {
  act(() => { desktop = value; mediaListeners.forEach(listener => listener()); });
}
function setVisible(value: boolean) {
  act(() => { visible = value; document.dispatchEvent(new Event("visibilitychange")); });
}

beforeEach(() => {
  vi.useFakeTimers();
  desktop = true; visible = true; fixture.enabled = true; fixture.scope = "list-scheduling-test"; fixture.denied.clear();
  mediaListeners = new Set();
  media = {
    get matches() { return desktop; },
    media: "(min-width: 1024px)",
    addEventListener: vi.fn((_event, listener) => mediaListeners.add(listener as () => void)),
    removeEventListener: vi.fn((_event, listener) => mediaListeners.delete(listener as () => void))
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  vi.spyOn(projectChatApi, "conversations").mockImplementation(async offset => page(offset));
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("conversation list request scheduling", () => {
  it("reconciles a visible idle sidebar at most once per minute", async () => {
    app("project-0");
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(1);
    await advance(59_998);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(1);
    await advance(2);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(2);
    await advance(60_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(3);
  });

  it("starts no requests for a mobile sidebar, even when its queries are invalidated", async () => {
    desktop = false;
    const view = app("project-0");
    await advance(120_000);
    await act(async () => { await view.client.invalidateQueries({ queryKey: chatKeys.list(fixture.scope), refetchType: "all" }); });
    expect(projectChatApi.conversations).not.toHaveBeenCalled();
    setDesktop(true);
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /Residence 0/ })).toBeInTheDocument();
    setDesktop(false);
    await advance(120_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(1);
    view.select();
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(2);
  });

  it("pauses hidden documents despite invalidation, then refreshes stale data on reveal", async () => {
    const view = app();
    await advance();
    setVisible(false);
    await act(async () => { await view.client.invalidateQueries({ queryKey: chatKeys.list(fixture.scope) }); });
    await advance(120_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(1);
    setVisible(true);
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(2);
    await advance(60_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(3);
  });

  it("does not load an initially hidden document until it becomes visible", async () => {
    visible = false;
    app();
    await advance(120_000);
    expect(projectChatApi.conversations).not.toHaveBeenCalled();
    setVisible(true);
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(1);
  });

  it.each(["document", "mobile sidebar"])("cancels a scheduled retry when the %s becomes hidden", async surface => {
    desktop = false;
    vi.mocked(projectChatApi.conversations).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Temporary outage"));
    const view = app();
    await advance();
    expect(view.client.getQueryState([...chatKeys.list(fixture.scope), { search: "", filter: "all", offset: 0 }])?.fetchFailureCount).toBe(1);
    if (surface === "document") setVisible(false); else view.select("project-0");
    await advance(120_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(1);
    if (surface === "document") setVisible(true); else view.select();
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: /Residence 0/ })).toBeInTheDocument();
  });

  it.each([401, 403, 404])("stops periodic requests after a %s denial and permits an explicit retry", async status => {
    vi.mocked(projectChatApi.conversations).mockRejectedValue(new ApiError(status, "CHAT_DENIED", "Unavailable"));
    app();
    await advance();
    expect(screen.getByRole("alert")).toHaveTextContent("This item is unavailable or your access has changed.");
    await advance(180_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(1);
    vi.mocked(projectChatApi.conversations).mockResolvedValue(page());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await advance(60_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(3);
  });

  it("preserves pagination and scroll through hidden navigation and supports manual refresh", async () => {
    desktop = false;
    const view = app();
    await advance();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await advance();
    expect(screen.getByRole("link", { name: /Residence 30/ })).toBeInTheDocument();
    const scroller = view.container.querySelector<HTMLElement>(".project-messaging-list-scroll")!;
    scroller.scrollTop = 147;
    view.select("project-30");
    await advance(120_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(2);
    view.select();
    await advance();
    expect(view.container.querySelector(".project-messaging-list-scroll")).toBe(scroller);
    expect(scroller.scrollTop).toBe(147);
    expect(projectChatApi.conversations).toHaveBeenLastCalledWith(30, expect.any(AbortSignal), { search: "", filter: "all" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh conversations" }));
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(4);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await advance();
    expect(projectChatApi.conversations).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), { search: "", filter: "all" });
    expect(scroller.scrollTop).toBe(0);
  });

  it("retains stale focus and reconnect refresh while starting no offline requests", async () => {
    app();
    await advance();
    await advance(10_000);
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(2);
    act(() => { onlineManager.setOnline(false); });
    await advance(120_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(2);
    act(() => { onlineManager.setOnline(true); });
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(3);
  });

  it("removes visibility listeners and polling when unmounted", async () => {
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    const view = app();
    await advance();
    expect(mediaListeners.size).toBe(1);
    view.unmount();
    expect(mediaListeners.size).toBe(0);
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    await advance(120_000);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(1);
  });
});

describe("compact project conversation list", () => {
  it("shows truthful preview, participant and issue metadata with distinct aggregate units", async () => {
    const result = page();
    result.items[0] = {
      ...result.items[0],
      lastMessageAt: "2026-10-27T09:00:00Z",
      lastMessage: { id: "last-a", author: chatTestPeople[1], excerpt: "The revised ceiling plan is ready.", createdAt: "2026-10-27T09:00:00Z", attachments: [{ id: "file-a", filename: "ceiling-plan.pdf", kind: "document", hasPreview: false }], attachmentCount: 1 }
    };
    vi.mocked(projectChatApi.conversations).mockResolvedValue(result);
    app("project-0");
    await advance();
    expect(screen.getByRole("heading", { name: "Project messages", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All, 31 project conversations" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Unread, 9 unread conversations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Critical, 14 open critical issues" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Important, 4 open important issues" })).toBeInTheDocument();
    const row = screen.getByRole("link", { name: /Residence 0/ });
    expect(row).toHaveAttribute("aria-current", "page");
    expect(within(row).getByText("Alex Team: The revised ceiling plan is ready. · ceiling-plan.pdf")).toBeInTheDocument();
    expect(within(row).getByText("3 participants · active")).toBeInTheDocument();
    expect(within(row).getByLabelText("2 unread messages")).toBeInTheDocument();
    expect(within(row).getByLabelText("1 unread mentions")).toBeInTheDocument();
    expect(within(row).getByLabelText("3 open critical issues")).toBeInTheDocument();
  });

  it("renders attachment-only previews and never invents a missing preview", async () => {
    const result = page();
    result.items = [
      { ...result.items[0], lastMessage: { id: "last-files", author: chatTestPeople[0], excerpt: "", createdAt: "2026-10-27T09:00:00Z", attachments: [{ id: "file-a", filename: "site.jpg", kind: "image", hasPreview: true }], attachmentCount: 3 } },
      { ...result.items[0], project: { id: "project-b", name: "Garden", status: "planning" }, lastMessageAt: "2026-10-27T09:00:00Z", lastMessage: null }
    ];
    vi.mocked(projectChatApi.conversations).mockResolvedValue(result);
    app();
    await advance();
    expect(screen.getByText("Maya Client: 3 attachments")).toBeInTheDocument();
    expect(screen.getByText("Message preview unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No messages yet")).not.toBeInTheDocument();
  });

  it("searches the server across more than one page and resets paging after the debounce", async () => {
    const conversations: ChatConversation[] = Array.from({ length: 35 }, (_, index) => ({
      ...page().items[0], project: { id: `project-${index}`, name: index === 34 ? "Courtyard loft" : `Residence ${index}`, status: "active" }
    }));
    vi.mocked(projectChatApi.conversations).mockImplementation(async (offset, _signal, query) => {
      const matches = conversations.filter(row => !query?.search || row.project.name.toLowerCase().includes(query.search.toLowerCase()));
      return { items: matches.slice(offset, offset + 30), pagination: { offset, limit: 30, total: matches.length, hasMore: offset + 30 < matches.length }, totals: { unread: 9, critical: 14, important: 4 } };
    });
    const view = app();
    await advance();
    expect(screen.queryByRole("link", { name: /Courtyard loft/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await advance();
    expect(screen.getByRole("link", { name: /Courtyard loft/ })).toBeInTheDocument();
    const scroller = view.container.querySelector<HTMLElement>(".project-messaging-list-scroll")!;
    scroller.scrollTop = 230;
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), { target: { value: " Courtyard " } });
    await advance(249);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(2);
    await advance(2);
    expect(projectChatApi.conversations).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), { search: "Courtyard", filter: "all" });
    expect(screen.getByRole("link", { name: /Courtyard loft/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Residence/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Conversation pages" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(scroller.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Clear project search" }));
    expect(screen.getByRole("searchbox")).toHaveFocus();
    await advance(251);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "All, 35 project conversations" })).toBeInTheDocument();
  });

  it("preserves search through server filter changes and isolates all variants below the invalidation prefix", async () => {
    const view = app();
    await advance();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Residence" } });
    await advance(251);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await advance();
    for (const filter of ["unread", "critical", "important"] as const) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${filter},`, "i") }));
      await advance();
      expect(projectChatApi.conversations).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), { search: "Residence", filter });
      expect(screen.getByRole("button", { name: new RegExp(`^${filter},`, "i") })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    }
    expect(view.client.getQueryCache().findAll({ queryKey: chatKeys.list(fixture.scope) })).toHaveLength(6);
    await act(async () => { await view.client.invalidateQueries({ queryKey: chatKeys.list(fixture.scope) }); });
    await advance();
    expect(projectChatApi.conversations).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), { search: "Residence", filter: "important" });
    expect(view.client.getQueryState([...chatKeys.list(fixture.scope), { search: "", filter: "all", offset: 0 }])?.isInvalidated).toBe(true);
  });

  it("aborts superseded search requests and does not display a late result", async () => {
    let complete!: (value: ChatConversationPage) => void;
    let supersededSignal!: AbortSignal;
    vi.mocked(projectChatApi.conversations).mockImplementationOnce((_offset, signal) => {
      supersededSignal = signal!;
      return new Promise(resolve => { complete = resolve; });
    });
    app();
    await advance();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Garden" } });
    await advance(251);
    expect(supersededSignal.aborted).toBe(true);
    await act(async () => { complete({ ...page(), items: [{ ...page().items[0], project: { id: "old", name: "Superseded residence", status: "active" } }] }); });
    await advance();
    expect(screen.queryByRole("link", { name: /Superseded residence/ })).not.toBeInTheDocument();
    expect(projectChatApi.conversations).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), { search: "Garden", filter: "all" });
  });

  it("limits input to the server's 100-character search contract", async () => {
    app();
    await advance();
    const search = screen.getByRole("searchbox");
    expect(search).toHaveAttribute("maxlength", "100");
    fireEvent.change(search, { target: { value: "x".repeat(120) } });
    await advance(251);
    expect(projectChatApi.conversations).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), { search: "x".repeat(100), filter: "all" });
  });

  it("distinguishes no conversations, no filter matches, and no search matches", async () => {
    vi.mocked(projectChatApi.conversations).mockResolvedValue({ ...page(), items: [], pagination: { offset: 0, limit: 30, total: 0, hasMore: false } });
    app();
    await advance();
    expect(screen.getByRole("heading", { name: "No project conversations yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Unread,/ }));
    await advance();
    expect(screen.getByRole("heading", { name: "No unread conversations" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Unknown project" } });
    await advance(251);
    expect(screen.getByRole("heading", { name: "No matching projects" })).toBeInTheDocument();
  });

  it("retains stale results after a network failure but hides them after denial or disabled access", async () => {
    const view = app();
    await advance();
    vi.mocked(projectChatApi.conversations).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Temporary outage"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh conversations" }));
    await advance(1_002);
    expect(screen.getByRole("alert")).toHaveTextContent("Conversations and counts may be out of date.");
    expect(screen.getByRole("link", { name: /Residence 0/ })).toBeInTheDocument();
    vi.mocked(projectChatApi.conversations).mockRejectedValue(new ApiError(403, "CHAT_DENIED", "Unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await advance();
    expect(screen.queryByRole("link", { name: /Residence 0/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unread" })).toBeInTheDocument();
    fixture.enabled = false;
    view.select();
    await advance();
    expect(screen.getByRole("status")).toHaveTextContent("Project messaging is not available for your current access.");
    expect(screen.getByRole("searchbox")).toBeDisabled();
  });

  it("isolates a replaced identity and filters newly denied projects", async () => {
    const view = app();
    await advance();
    fixture.denied.add("project-0");
    view.select();
    expect(screen.queryByRole("link", { name: /Residence 0/ })).not.toBeInTheDocument();
    fixture.denied.clear();
    fixture.scope = "replacement-session";
    vi.mocked(projectChatApi.conversations).mockImplementation(() => new Promise(() => {}));
    view.select();
    await advance();
    expect(screen.queryByRole("link", { name: /Residence 0/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading your conversations");
    expect(view.client.getQueryCache().findAll({ queryKey: chatKeys.list(fixture.scope) })).toHaveLength(1);
  });

  it("allows keyboard activation of filters and keeps the full project name accessible", async () => {
    const result = page();
    result.items[0].project.name = "Courtyard residence with a very long project name";
    vi.mocked(projectChatApi.conversations).mockResolvedValue(result);
    app();
    await advance();
    vi.useRealTimers();
    const user = userEvent.setup();
    const filter = screen.getByRole("button", { name: /^Critical,/ });
    filter.focus();
    await user.keyboard("{Enter}");
    expect(filter).toHaveAttribute("aria-pressed", "true");
    const row = screen.getByRole("link", { name: /Courtyard residence with a very long project name/ });
    row.focus();
    expect(row).toHaveFocus();
    expect(row).toHaveAttribute("href", "/projects/project-0/messages");
  });
});
