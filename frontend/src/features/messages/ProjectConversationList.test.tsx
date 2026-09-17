import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { ProjectConversationList } from "./ProjectConversationList";
import { chatKeys, projectChatApi } from "./projectChatApi";
import { chatTestSummary } from "./projectChatFixtures";

const fixture = vi.hoisted(() => ({ enabled: true, scope: "list-scheduling-test", denied: new Set<string>() }));
vi.mock("./ProjectChatProvider", () => ({ useProjectChat: () => fixture }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: null, authorization: null }) }));

let desktop = true;
let visible = true;
let mediaListeners: Set<() => void>;
let media: MediaQueryList;
const clients: QueryClient[] = [];

function page(offset = 0) {
  return {
    items: [{ ...chatTestSummary({ project: { id: `project-${offset}`, name: `Residence ${offset}`, status: "active" } }), lastMessageAt: null }],
    pagination: { offset, limit: 30, total: 31, hasMore: offset === 0 }
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
}
function setDesktop(value: boolean) {
  act(() => { desktop = value; mediaListeners.forEach(listener => listener()); });
}
function setVisible(value: boolean) {
  act(() => { visible = value; document.dispatchEvent(new Event("visibilitychange")); });
}

beforeEach(() => {
  vi.useFakeTimers();
  desktop = true; visible = true; fixture.enabled = true; fixture.denied.clear();
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
    expect(view.client.getQueryState([...chatKeys.list(fixture.scope), 0])?.fetchFailureCount).toBe(1);
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
    expect(projectChatApi.conversations).toHaveBeenLastCalledWith(30, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "Refresh conversations" }));
    await advance();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(4);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await advance();
    expect(projectChatApi.conversations).toHaveBeenLastCalledWith(0, expect.any(AbortSignal));
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
