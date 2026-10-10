import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStorage, ApiError } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { executionApi, executionKeys, type ExecutionNotificationDto, type ExecutionNotificationPage } from "../execution/executionApi";
import { notificationApi } from "./notificationApi";
import { NotificationProvider } from "./NotificationProvider";
import { NotificationBell } from "./NotificationBell";

const fixture = vi.hoisted(() => ({ role: "vendor" as "vendor" | "program_manager" | "super_admin", id: "vendor-user", permitted: true, chat: false, connection: "live" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: fixture.id, role: fixture.role }, authorization: authorizationFor(fixture.role, [...(fixture.permitted ? ["execution.notifications.read" as const] : []), ...(fixture.chat ? ["chat.read" as const] : [])]) }) }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => fixture.connection }));
vi.mock("./notificationStream", () => ({ runNotificationStream: async () => undefined }));
const item: ExecutionNotificationDto = { id: "reminder-one", projectId: "project-one", projectName: "Courtyard", kind: "daily_reminder", title: "Daily update due by 18:00", assignmentIds: ["work-one"], createdAt: "2026-10-08T03:30:00Z", readAt: null, deliveryStatus: "sent" };
const page = (items = [item], overrides: Partial<ExecutionNotificationPage> = {}): ExecutionNotificationPage => ({ items, total: items.length, unreadCount: items.filter(row => !row.readAt).length, limit: 20, offset: 0, ...overrides });
function Location() { const location = useLocation(); return <output aria-label="Current path">{location.pathname}{location.search}</output>; }
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const app = () => <QueryClientProvider client={client}><MemoryRouter><NotificationProvider><NotificationBell /><Location /></NotificationProvider></MemoryRouter></QueryClientProvider>;
  return { ...render(app()), client, app };
}
beforeEach(() => {
  fixture.id = "vendor-user"; fixture.role = "vendor"; fixture.permitted = true; fixture.chat = false; fixture.connection = "live";
  tokenStorage.set("execution-inbox-local-session");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  vi.spyOn(executionApi, "notifications").mockResolvedValue(page());
  vi.spyOn(executionApi, "readNotification").mockResolvedValue({ readAt: "2026-10-08T06:00:00Z" });
  vi.spyOn(notificationApi, "list").mockResolvedValue({ items: [], unreadCount: 0, pagination: { limit: 20, offset: 0, total: 0, hasMore: false } });
});
describe("execution notification source", () => {
  it("serves vendors without chat permission and opens the exact assigned work", async () => {
    setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    expect(notificationApi.list).not.toHaveBeenCalled();
    expect(screen.getByText(/Work remains open until/)).toBeVisible();
    vi.mocked(executionApi.notifications).mockResolvedValue(page([{ ...item, readAt: "2026-10-08T06:00:00Z" }]));
    await userEvent.click(screen.getByRole("button", { name: /Daily update due.*Open work/ }));
    await waitFor(() => expect(screen.getByLabelText("Current path")).toHaveTextContent("/vendor?assignment=work-one"));
    expect(executionApi.readNotification).toHaveBeenCalledWith("reminder-one", expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  });
  it("opens staff execution and keeps chat mentions in an independent source", async () => {
    fixture.role = "super_admin"; fixture.chat = true;
    setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await userEvent.click(screen.getByRole("button", { name: "Project messages" }));
    expect(screen.getByText("You’re all caught up")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Execution (1)" }));
    await userEvent.click(screen.getByRole("button", { name: /Open work/ }));
    await waitFor(() => expect(screen.getByLabelText("Current path")).toHaveTextContent("/projects/project-one/execution?assignment=work-one"));
  });
  it("refreshes on committed execution invalidation and paginates without changing unread count", async () => {
    vi.mocked(executionApi.notifications).mockImplementation(async query => query?.offset ? page([{ ...item, id: "older", title: "Earlier deadline" }], { total: 21, offset: 20, unreadCount: 3 }) : page([item], { total: 21, unreadCount: 3 }));
    const { client } = setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 3 unread" }));
    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("Earlier deadline")).toBeVisible();
    const calls = vi.mocked(executionApi.notifications).mock.calls.length;
    await act(async () => { await client.invalidateQueries({ queryKey: executionKeys.notifications }); });
    expect(vi.mocked(executionApi.notifications).mock.calls.length).toBeGreaterThan(calls);
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeVisible();
  });
  it("keeps failed reads recoverable and removes details on permission loss", async () => {
    const view = setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    vi.mocked(executionApi.readNotification).mockRejectedValueOnce(new Error("offline"));
    await userEvent.click(screen.getByRole("button", { name: /Open work/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open");
    expect(screen.getByLabelText("Current path")).toHaveTextContent("/");
    vi.mocked(executionApi.notifications).mockRejectedValue(new ApiError(403, "FORBIDDEN", "private"));
    await act(async () => { await view.client.invalidateQueries({ queryKey: executionKeys.notifications }); });
    await waitFor(() => expect(screen.queryByText(item.title)).not.toBeInTheDocument());
    expect(screen.getByText("Notifications are unavailable for your current access.")).toBeVisible();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });
  it("clears prior identity pages and shows offline delivery honestly", async () => {
    fixture.connection = "offline";
    const view = setup(); await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    expect(screen.getByText(/You’re offline/)).toBeVisible();
    fixture.id = "second-viewer"; fixture.permitted = false;
    view.rerender(view.app());
    await waitFor(() => expect(screen.queryByText(item.title)).not.toBeInTheDocument());
    expect(view.client.getQueriesData({ queryKey: executionKeys.notifications }).every(([, data]) => !data)).toBe(true);
  });
});
