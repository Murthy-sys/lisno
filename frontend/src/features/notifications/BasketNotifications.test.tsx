import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { executionApi } from "../execution/executionApi";
import { basketNotificationApi, type BasketNotificationPage, type BasketRequestNotification } from "./basketNotificationApi";
import { notificationApi } from "./notificationApi";
import { NotificationProvider } from "./NotificationProvider";
import { NotificationBell } from "./NotificationBell";

const fixture = vi.hoisted(() => ({ id: "admin-one", role: "super_admin" as "super_admin" | "procurement", permitted: true, chat: false, execution: false }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: fixture.id, role: fixture.role },
  authorization: authorizationFor(fixture.role, [
    ...(fixture.permitted ? ["ai_estimator_knowledge.configuration.read" as const] : []),
    ...(fixture.chat ? ["chat.read" as const] : []),
    ...(fixture.execution ? ["execution.notifications.read" as const] : [])
  ]) }) }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => "live" }));
vi.mock("./notificationStream", () => ({ runNotificationStream: async () => undefined }));
const item: BasketRequestNotification = {
  id: "notice-one", type: "basket_request.submitted", requestId: "request-one", proposalId: "proposal-one",
  target: { kind: "new_sub_basket", basketId: "parent-one" }, targetParentName: "Finishes",
  proposedName: "Interior painting", vendorName: "Fixture Vendor", requester: { id: "procurement-one", name: "Procurement Fixture" },
  status: "pending", createdAt: "2026-10-12T03:00:00Z", readAt: null
};
const page = (items = [item], overrides: Partial<BasketNotificationPage> = {}): BasketNotificationPage => ({
  items, unreadCount: items.filter(row => !row.readAt).length,
  pagination: { limit: 20, offset: 0, total: items.length, hasMore: false }, ...overrides
});
function Location() { const location = useLocation(); return <output aria-label="Current path">{location.pathname}{location.search}</output>; }
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const app = () => <QueryClientProvider client={client}><MemoryRouter><NotificationProvider><NotificationBell /><Location /></NotificationProvider></MemoryRouter></QueryClientProvider>;
  return { ...render(app()), client, app };
}
beforeEach(() => {
  fixture.id = "admin-one"; fixture.role = "super_admin"; fixture.permitted = true; fixture.chat = false; fixture.execution = false;
  tokenStorage.set("basket-inbox-fixture-session");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  vi.spyOn(basketNotificationApi, "list").mockResolvedValue(page());
  vi.spyOn(basketNotificationApi, "read").mockImplementation(async () => {
    const read = { ...item, readAt: "2026-10-12T04:00:00Z" };
    vi.mocked(basketNotificationApi.list).mockResolvedValue(page([read])); return read;
  });
  vi.spyOn(notificationApi, "list").mockResolvedValue({ items: [], unreadCount: 2, pagination: { limit: 20, offset: 0, total: 0, hasMore: false } });
  vi.spyOn(executionApi, "notifications").mockResolvedValue({ items: [], total: 0, unreadCount: 3, limit: 20, offset: 0 });
});
afterEach(() => { vi.useRealTimers(); });

describe("basket request notification inbox", () => {
  it("works without chat/execution access and opens the exact request after marking read", async () => {
    setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    expect(notificationApi.list).not.toHaveBeenCalled(); expect(executionApi.notifications).not.toHaveBeenCalled();
    expect(screen.getByText(/separate review and decision/)).toBeVisible();
    expect(screen.getByText(/Procurement Fixture · Fixture Vendor · Finishes/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Sub-Basket request: Interior painting.*Open request/ }));
    await waitFor(() => expect(screen.getByLabelText("Current path")).toHaveTextContent("/admin/configuration/estimation?basketRequests=pending&basketRequestId=request-one"));
    expect(basketNotificationApi.read).toHaveBeenCalledWith("notice-one", expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  });
  it("paginates without losing authoritative unread totals and opens a decided older request", async () => {
    const older = { ...item, id: "notice-older", requestId: "request-older", proposedName: "Older request", status: "fulfilled" as const };
    vi.mocked(basketNotificationApi.list).mockImplementation(async offset => page(offset ? [older] : [item], {
      unreadCount: 8, pagination: { total: 21, limit: 20, offset: offset ?? 0, hasMore: !offset }
    }));
    vi.mocked(basketNotificationApi.read).mockResolvedValue({ ...older, readAt: "2026-10-12T04:00:00Z" });
    setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 8 unread" }));
    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("Approved")).toBeVisible();
    expect(screen.getByRole("button", { name: "Notifications, 8 unread" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Older request.*Open request/ }));
    await waitFor(() => expect(screen.getByLabelText("Current path")).toHaveTextContent("basketRequestId=request-older"));
  });
  it("combines three sources without replacing chat or execution", async () => {
    fixture.chat = true; fixture.execution = true;
    setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 6 unread" }));
    await userEvent.click(screen.getByRole("button", { name: "Project messages (2)" }));
    expect(screen.getByText("You’re all caught up")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Execution (3)" }));
    expect(screen.getByText(/Work remains open/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Basket requests (1)" }));
    expect(screen.getByText("Sub-Basket request: Interior painting")).toBeVisible();
  });
  it("preserves the inbox for failed reads, then revokes content on a forbidden response", async () => {
    setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    vi.mocked(basketNotificationApi.read).mockRejectedValueOnce(new Error("offline"));
    await userEvent.click(screen.getByRole("button", { name: /Open request/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open this request");
    expect(screen.getByLabelText("Current path")).toHaveTextContent(/^\/$/);
    vi.mocked(basketNotificationApi.read).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "private detail"));
    await userEvent.click(screen.getByRole("button", { name: /Open request/ }));
    await waitFor(() => expect(screen.queryByText("Sub-Basket request: Interior painting")).not.toBeInTheDocument());
    expect(screen.getByText("Notifications are unavailable for your current access.")).toBeVisible();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });
  it("cancels old identity requests and removes cached pages on permission loss", async () => {
    let finish: ((value: BasketRequestNotification) => void) | undefined;
    vi.mocked(basketNotificationApi.read).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await userEvent.click(screen.getByRole("button", { name: /Open request/ }));
    const signal = vi.mocked(basketNotificationApi.read).mock.calls[0][1]!;
    fixture.id = "procurement-two"; fixture.role = "procurement"; fixture.permitted = false;
    view.rerender(view.app());
    expect(signal.aborted).toBe(true);
    await act(async () => { finish?.({ ...item, readAt: "2026-10-12T04:00:00Z" }); });
    expect(screen.queryByText("Sub-Basket request: Interior painting")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current path")).toHaveTextContent(/^\/$/);
    expect(view.client.getQueriesData({ queryKey: ["basket-request-notifications"] }).every(([, value]) => !value)).toBe(true);
  });
  it("refreshes while foregrounded and resumes immediately after reconnect", async () => {
    vi.useFakeTimers();
    setup();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
    const before = vi.mocked(basketNotificationApi.list).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
    expect(vi.mocked(basketNotificationApi.list).mock.calls.length).toBeGreaterThan(before);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await act(async () => { fireEvent(window, new Event("offline")); });
    const offline = vi.mocked(basketNotificationApi.list).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(vi.mocked(basketNotificationApi.list).mock.calls.length).toBe(offline);
    vi.mocked(basketNotificationApi.list).mockResolvedValue(page([], { unreadCount: 0 }));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => { fireEvent(window, new Event("online")); await vi.advanceTimersByTimeAsync(10); });
    vi.useRealTimers();
    await screen.findByRole("button", { name: "Notifications" });
    expect(vi.mocked(basketNotificationApi.list).mock.calls.length).toBeGreaterThan(offline);
  });
  it("shows a recoverable loading failure and refreshes when opening the inbox", async () => {
    vi.mocked(basketNotificationApi.list).mockRejectedValue(new Error("connection unavailable"));
    setup(); await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Basket notifications could not be loaded");
    vi.mocked(basketNotificationApi.list).mockResolvedValue(page());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Sub-Basket request: Interior painting")).toBeVisible();
  });
  it("removes an unavailable request notification and keeps a safe retry message", async () => {
    setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    vi.mocked(basketNotificationApi.list).mockResolvedValue(page([]));
    vi.mocked(basketNotificationApi.read).mockRejectedValue(new ApiError(404, "NOT_FOUND", "missing"));
    await userEvent.click(screen.getByRole("button", { name: /Open request/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer available");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Open request/ })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Current path")).toHaveTextContent(/^\/$/);
  });
});
