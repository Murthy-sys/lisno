import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { NotificationProvider } from "./NotificationProvider";
import { NotificationBell, NotificationBanners } from "./NotificationBell";
import { notificationApi, type NotificationPage, type ProjectNotification } from "./notificationApi";
import type { runNotificationStream } from "./notificationStream";

type Stream = Parameters<typeof runNotificationStream>[0];
const fixture = vi.hoisted(() => ({ streams: [] as Stream[], userId: "viewer-a", permitted: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: fixture.userId }, authorization: authorizationFor("client", fixture.permitted ? ["chat.read"] : []) }) }));
vi.mock("./notificationStream", () => ({ runNotificationStream: async (options: Stream) => {
  fixture.streams.push(options);
  options.onStatus("live");
  await new Promise<void>(resolve => options.signal.aborted ? resolve() : options.signal.addEventListener("abort", () => resolve(), { once: true }));
} }));

const item = (id = "mention-1", overrides: Partial<ProjectNotification> = {}): ProjectNotification => ({
  id, type: "chat.mention", projectId: "project-one", projectName: "Courtyard residence", messageId: `message-${id}`,
  actor: { id: "sender", name: "Alex Morgan" }, excerpt: "@Taylor please confirm the finish.", createdAt: "2026-09-17T09:00:00Z", readAt: null, ...overrides
});
const page = (items: ProjectNotification[] = [], unreadCount = items.filter(value => !value.readAt).length): NotificationPage => ({ items, unreadCount, pagination: { limit: 20, offset: 0, total: items.length, hasMore: false } });
function Location() { const location = useLocation(); return <output aria-label="Current path">{location.pathname}{location.search}{location.hash}</output>; }
function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const app = () => <QueryClientProvider client={queryClient}><MemoryRouter><NotificationProvider><NotificationBell /><NotificationBanners /><Location /></NotificationProvider></MemoryRouter></QueryClientProvider>;
  return { ...render(app()), queryClient, app };
}
async function snapshot(value: NotificationPage, index = fixture.streams.length - 1) {
  await act(async () => { fixture.streams[index].onSnapshot(value); });
}
async function connected() { await waitFor(() => expect(fixture.streams).toHaveLength(1)); }

beforeEach(() => {
  fixture.streams = []; fixture.userId = "viewer-a"; fixture.permitted = true;
  tokenStorage.set("notification-token-a");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  vi.spyOn(notificationApi, "list").mockResolvedValue(page([item()]));
  vi.spyOn(notificationApi, "read").mockImplementation(async id => item(id, { readAt: "2026-09-17T09:10:00Z" }));
});

describe("project notification inbox", () => {
  it("shows unread bell without replaying the initial inbox and announces a new first-stream item", async () => {
    setup(); await connected();
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "New notifications" })).not.toBeInTheDocument();
    await snapshot(page([item("new"), item()]));
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeVisible();
    expect(within(screen.getByRole("region", { name: "New notifications" })).getAllByRole("button", { name: /Open message/ })).toHaveLength(1);
    await snapshot(page([item("new"), item()]));
    expect(screen.getAllByRole("button", { name: /Dismiss notification/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /Dismiss notification/ }));
    await snapshot(page([item("new"), item()]));
    expect(screen.queryByRole("region", { name: "New notifications" })).not.toBeInTheDocument();
    expect(notificationApi.list).toHaveBeenCalledTimes(1);
  });

  it("opens the exact tagged message, updates the count and returns focus on Escape", async () => {
    setup(); await connected();
    const bell = screen.getByRole("button", { name: "Notifications, 1 unread" });
    await userEvent.click(bell);
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(bell).toHaveFocus();
    await userEvent.click(bell);
    vi.mocked(notificationApi.list).mockResolvedValue(page([item("mention-1", { readAt: "2026-09-17T09:10:00Z" })]));
    await userEvent.click(screen.getByRole("button", { name: /Alex Morgan mentioned you.*Open message/ }));
    await waitFor(() => expect(screen.getByLabelText("Current path")).toHaveTextContent("/projects/project-one/messages?message=message-mention-1"));
    expect(notificationApi.read).toHaveBeenCalledWith("mention-1", expect.any(AbortSignal));
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  });

  it("keeps read failures actionable and does not navigate or hide unread state", async () => {
    vi.mocked(notificationApi.read).mockRejectedValue(new Error("offline"));
    setup(); await connected();
    await userEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    await userEvent.click(screen.getByRole("button", { name: /Open message/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open this notification");
    expect(screen.getByLabelText("Current path")).toHaveTextContent("/");
    expect(screen.getByRole("button", { name: /Open message/ })).toBeEnabled();
  });

  it("removes a revoked item and refreshes without revealing its stale excerpt", async () => {
    setup(); await connected();
    await userEvent.click(screen.getByRole("button", { name: /Notifications, 1 unread/ }));
    vi.mocked(notificationApi.read).mockRejectedValue(new ApiError(404, "NOT_FOUND", "private detail"));
    vi.mocked(notificationApi.list).mockResolvedValue(page());
    await userEvent.click(screen.getByRole("button", { name: /Open message/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This notification is no longer available.");
    expect(screen.queryByText("@Taylor please confirm the finish.")).not.toBeInTheDocument();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });

  it("keeps a dismissible explanation when a banner points to a revoked message", async () => {
    setup(); await connected();
    await snapshot(page([item("new"), item()]));
    vi.mocked(notificationApi.read).mockRejectedValue(new ApiError(404, "NOT_FOUND", "private detail"));
    vi.mocked(notificationApi.list).mockResolvedValue(page());
    await userEvent.click(screen.getByRole("button", { name: /Open message/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This notification is no longer available.");
    expect(screen.queryByText("@Taylor please confirm the finish.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss notification error" }));
    expect(screen.queryByRole("region", { name: "New notifications" })).not.toBeInTheDocument();
  });

  it("shows loading, retry and empty states", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(notificationApi.list).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Loading notifications…")).toBeVisible();
    await act(async () => reject(new Error("offline")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Notifications could not be loaded.");
    vi.mocked(notificationApi.list).mockResolvedValue(page());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You’re all caught up")).toBeVisible();
  });

  it("limits incoming banners to three and labels Super Admin oversight correctly", async () => {
    setup(); await connected();
    await snapshot(page([1, 2, 3, 4].map(id => item(`new-${id}`, { type: "chat.mention.oversight" }))));
    const banners = screen.getByRole("region", { name: "New notifications" });
    expect(within(banners).getAllByText("Alex Morgan mentioned someone in Courtyard residence")).toHaveLength(3);
  });

  it("reconciles older-page read/SSE races from the server count without decrementing twice", async () => {
    const first = { ...page([item()], 5), pagination: { limit: 20, offset: 0, total: 21, hasMore: true } };
    vi.mocked(notificationApi.list).mockImplementation(async offset => offset ? { ...page([item("older")], 5), pagination: { limit: 20, offset: 20, total: 21, hasMore: false } } : first);
    let finish!: (value: ProjectNotification) => void;
    vi.mocked(notificationApi.read).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    setup(); await connected();
    await userEvent.click(screen.getByRole("button", { name: "Notifications, 5 unread" }));
    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    await userEvent.click(await screen.findByRole("button", { name: /Open message/ }));
    await snapshot({ ...first, unreadCount: 4 });
    vi.mocked(notificationApi.list).mockResolvedValue({ ...first, unreadCount: 4 });
    await act(async () => finish(item("older", { readAt: "2026-09-17T09:10:00Z" })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications, 4 unread" })).toBeVisible());
    expect(screen.queryByRole("button", { name: "Notifications, 3 unread" })).not.toBeInTheDocument();
  });

  it("does not let a delayed post-read HTTP snapshot overwrite a newer live snapshot", async () => {
    setup(); await connected();
    await userEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    let finish!: (value: NotificationPage) => void;
    vi.mocked(notificationApi.list).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await userEvent.click(screen.getByRole("button", { name: /Open message/ }));
    await waitFor(() => expect(notificationApi.list).toHaveBeenCalledTimes(2));
    const read = item("mention-1", { readAt: "2026-09-17T09:10:00Z" });
    await snapshot(page([item("new-after-read"), read], 1));
    await act(async () => finish(page([read], 0)));
    await waitFor(() => expect(screen.getByLabelText("Current path")).toHaveTextContent("message-mention-1"));
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
    expect(screen.getByRole("region", { name: "New notifications" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(within(screen.getByRole("dialog", { name: "Notifications" })).getAllByRole("button", { name: /Open message/ })).toHaveLength(2);
  });

  it("orders concurrent read reconciliations so an older HTTP response cannot replace the newer request", async () => {
    const one = item("one", { actor: { id: "alex", name: "Alex" } });
    const two = item("two", { actor: { id: "taylor", name: "Taylor" } });
    vi.mocked(notificationApi.list).mockResolvedValue(page([one, two], 2));
    setup(); await connected();
    await userEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    let first!: (value: NotificationPage) => void;
    let second!: (value: NotificationPage) => void;
    vi.mocked(notificationApi.list)
      .mockImplementationOnce(() => new Promise(resolve => { first = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
    await userEvent.click(screen.getByRole("button", { name: /Alex mentioned.*Open message/ }));
    await userEvent.click(screen.getByRole("button", { name: /Taylor mentioned.*Open message/ }));
    await waitFor(() => expect(notificationApi.list).toHaveBeenCalledTimes(3));
    await act(async () => first(page([{ ...one, readAt: "2026-09-17T09:10:00Z" }, two], 1)));
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeVisible();
    await act(async () => second(page([one, two].map(value => ({ ...value, readAt: "2026-09-17T09:10:00Z" })), 0)));
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  });

  it("ignores an obsolete HTTP refresh failure after live state has recovered", async () => {
    setup(); await connected();
    await userEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    let fail!: (value: Error) => void;
    vi.mocked(notificationApi.list).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    await userEvent.click(screen.getByRole("button", { name: /Open message/ }));
    await waitFor(() => expect(notificationApi.list).toHaveBeenCalledTimes(2));
    await snapshot(page([item("mention-1", { readAt: "2026-09-17T09:10:00Z" })], 0));
    await act(async () => fail(new Error("obsolete failure")));
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/out of date/)).not.toBeInTheDocument();
  });

  it("clears older-page excerpts while a live access change refetch is pending", async () => {
    vi.mocked(notificationApi.list).mockImplementation(async offset => offset ? { ...page([item("old", { excerpt: "Older sensitive excerpt" })]), pagination: { limit: 20, offset: 20, total: 21, hasMore: false } } : { ...page([item()]), pagination: { limit: 20, offset: 0, total: 21, hasMore: true } });
    setup(); await connected();
    await userEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("Older sensitive excerpt")).toBeVisible();
    vi.mocked(notificationApi.list).mockImplementation(() => new Promise(() => {}));
    await snapshot(page());
    expect(screen.queryByText("Older sensitive excerpt")).not.toBeInTheDocument();
    expect(screen.getByText("Loading notifications…")).toBeVisible();
  });
});

describe("notification session lifecycle", () => {
  it("pauses hidden/offline streams and reconnects without recurring inbox HTTP requests or replayed banners", async () => {
    setup(); await connected();
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(fixture.streams[0].signal.aborted).toBe(true);
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      fireEvent(document, new Event("visibilitychange"));
    });
    await waitFor(() => expect(fixture.streams).toHaveLength(2));
    await snapshot(page([item()]));
    expect(screen.queryByRole("region", { name: "New notifications" })).not.toBeInTheDocument();
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      fireEvent(window, new Event("offline"));
    });
    expect(fixture.streams[1].signal.aborted).toBe(true);
    expect(notificationApi.list).toHaveBeenCalledTimes(1);
  });

  it("clears private caches, stream and banners on user/token changes and ignores stale callbacks", async () => {
    const view = setup(); await connected();
    await snapshot(page([item("new"), item()]));
    const oldKeys = view.queryClient.getQueryCache().getAll().map(query => query.queryKey);
    fixture.userId = "viewer-b"; tokenStorage.set("notification-token-b");
    vi.mocked(notificationApi.list).mockResolvedValue(page());
    view.rerender(view.app());
    await waitFor(() => expect(fixture.streams).toHaveLength(2));
    expect(fixture.streams[0].signal.aborted).toBe(true);
    await snapshot(page([item("stale")]), 0);
    expect(screen.queryByRole("region", { name: "New notifications" })).not.toBeInTheDocument();
    for (const key of oldKeys) expect(view.queryClient.getQueryData(key)).toBeUndefined();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
    const currentSignal = fixture.streams[1].signal;
    view.unmount();
    expect(currentSignal.aborted).toBe(true);
    expect(view.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("stops and clears private notifications on authorization denial", async () => {
    const view = setup(); await connected();
    await snapshot(page([item("new"), item()]));
    await act(async () => fixture.streams[0].onDenied());
    expect(fixture.streams[0].signal.aborted).toBe(true);
    expect(view.queryClient.getQueryData(view.queryClient.getQueryCache().getAll()[0]?.queryKey ?? [])).toBeUndefined();
    expect(screen.queryByRole("region", { name: "New notifications" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Notifications are unavailable for your current access.")).toBeVisible();
  });

  it("keeps a bell without making requests when chat permission is absent", async () => {
    fixture.permitted = false;
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(notificationApi.list).not.toHaveBeenCalled();
    expect(fixture.streams).toHaveLength(0);
    expect(screen.getByText("Notifications are unavailable for your current access.")).toBeVisible();
  });
});
