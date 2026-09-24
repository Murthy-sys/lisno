import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { ComponentProps, ReactElement } from "react";
import * as Native from "react-native";

import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { FEATURE_DEFINITIONS } from "../workspace/featureDefinitions";
import { NotificationsScreen } from "./NotificationsScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);
const definition = FEATURE_DEFINITIONS.notifications;
const NOW = new Date(2026, 8, 24, 15, 0);

function iso(month: number, day: number, hours: number, minutes: number): string {
  return new Date(2026, month, day, hours, minutes).toISOString();
}

const unreadToday = {
  id: "n-today",
  type: "chat.mention",
  projectId: "p-villa",
  projectName: "Villa Aurora",
  messageId: "m-1",
  actor: { id: "u-2", name: "Asha Rao" },
  excerpt: "Please review the kitchen layout",
  createdAt: iso(8, 24, 13, 20),
  readAt: null
};
const readYesterday = {
  ...unreadToday,
  id: "n-yesterday",
  type: "chat.mention.oversight",
  projectId: "p-office",
  projectName: "Harbour Office",
  actor: { id: "u-3", name: "Ravi Kumar" },
  excerpt: "Site visit moved",
  createdAt: iso(8, 23, 18, 15),
  readAt: iso(8, 23, 19, 0)
};
const readEarlier = { ...readYesterday, id: "n-earlier", projectId: "p-loft", projectName: "City Loft", createdAt: iso(8, 20, 9, 0) };

function setup() {
  const put = jest.fn(async () => ({}));
  const stop = jest.fn();
  const createStream = jest.fn(() => ({ start: jest.fn(), stop }));
  useConfiguredRuntimeMock.mockReturnValue({
    runtime: { api: { authenticated: { put } }, realtime: { createStream } },
    environment: { environment: { id: "remote:test" }, status: "ready" },
    session: { status: "authenticated", session: { user: { id: "user-1" } } }
  } as never);
  return { put, createStream };
}

async function renderScreen(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const invalidateSpy = jest.spyOn(client, "invalidateQueries");
  const view = await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { view, invalidateSpy };
}

function screenFor(items: readonly unknown[], extra: { readonly onRefresh?: () => void } = {}) {
  return <NotificationsScreen definition={definition} data={{ items, unreadCount: 1, pagination: { limit: 30, offset: 0, total: items.length } }} refreshing={false} onRefresh={extra.onRefresh ?? jest.fn()} now={NOW} />;
}

describe("NotificationsScreen", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it("renders the header, a hidden botanical accent and grouped sections", async () => {
    const { createStream } = setup();
    await renderScreen(screenFor([readEarlier, unreadToday, readYesterday]));
    expect(screen.getByText("UPDATES")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText(definition.description)).toBeTruthy();
    expect(screen.queryByTestId("botanical-accent")).toBeNull();
    const accent = screen.getByTestId("botanical-accent", { includeHiddenElements: true });
    expect(accent.props.pointerEvents).toBe("none");
    expect(accent.props.importantForAccessibility).toBe("no-hide-descendants");
    const headers = screen.getAllByRole("header").map((node) => within(node).queryByText(/.+/u)?.props.children ?? node.props.children);
    expect(headers).toEqual(["Notifications", "Today", "Yesterday", "Earlier"]);
    expect(createStream).toHaveBeenCalledWith(expect.objectContaining({ path: "/notifications/events" }));
  });

  it("shows card content, time formats and the unread dot and label", async () => {
    setup();
    await renderScreen(screenFor([unreadToday, readYesterday, readEarlier]));
    expect(screen.getByText("Villa Aurora")).toBeTruthy();
    expect(screen.getByText("Asha Rao mentioned you: Please review the kitchen layout")).toBeTruthy();
    expect(screen.getByText("1:20 PM")).toBeTruthy();
    expect(screen.getAllByText("Ravi Kumar mentioned a team member: Site visit moved")).toHaveLength(2);
    expect(screen.getByText("Yesterday, 6:15 PM")).toBeTruthy();
    expect(screen.getByText("Sep 20, 2026")).toBeTruthy();

    const unread = screen.getByRole("button", { name: "Unread, Villa Aurora, Asha Rao mentioned you: Please review the kitchen layout, 1:20 PM" });
    expect(unread.props.accessibilityHint).toBe("Opens the conversation");
    expect(screen.getByTestId("notification-unread-dot-n-today")).toBeTruthy();
    expect(screen.queryByTestId("notification-unread-dot-n-yesterday")).toBeNull();
    expect(screen.getByRole("button", { name: "Harbour Office, Ravi Kumar mentioned a team member: Site visit moved, Yesterday, 6:15 PM" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mark as read|Open conversation/u })).toBeNull();
  });

  it("marks an unread card read, invalidates notifications and opens the conversation", async () => {
    const { put } = setup();
    const { invalidateSpy } = await renderScreen(screenFor([unreadToday]));
    await fireEvent.press(screen.getByRole("button", { name: /^Unread, Villa Aurora/u }));
    expect(put).toHaveBeenCalledWith("/notifications/n-today/read");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: "p-villa" } });
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it("opens a read card without marking it read", async () => {
    const { put } = setup();
    await renderScreen(screenFor([readYesterday]));
    await fireEvent.press(screen.getByRole("button", { name: /^Harbour Office/u }));
    expect(put).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: "p-office" } });
  });

  it("still navigates when marking read fails and does not treat it as success", async () => {
    const { put } = setup();
    put.mockRejectedValueOnce(new Error("offline"));
    const { invalidateSpy } = await renderScreen(screenFor([unreadToday]));
    await fireEvent.press(screen.getByRole("button", { name: /^Unread, Villa Aurora/u }));
    expect(mockPush).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("notification-unread-dot-n-today")).toBeTruthy();
  });

  it("shows the empty state when there are no notifications", async () => {
    setup();
    await renderScreen(screenFor([]));
    expect(screen.getByText("You’re all caught up.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("refetches on pull-to-refresh", async () => {
    setup();
    const onRefresh = jest.fn();
    await renderScreen(screenFor([unreadToday], { onRefresh }));
    let scroll = screen.getByText("UPDATES").parent;
    while (scroll && !scroll.props.refreshControl) scroll = scroll.parent;
    const refreshControl = scroll?.props.refreshControl as ReactElement<ComponentProps<typeof Native.RefreshControl>>;
    expect(refreshControl.type).toBe(Native.RefreshControl);
    await act(async () => {
      refreshControl.props.onRefresh?.();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders at 320pt with enlarged text without dropping content", async () => {
    jest.spyOn(Native, "useWindowDimensions").mockReturnValue({ width: 320, height: 800, scale: 2, fontScale: 1.6 });
    setup();
    const longName = "Long residence project with multiple building wings and courtyards";
    await renderScreen(screenFor([{ ...readYesterday, projectName: longName }]));
    expect(screen.getByText(longName)).toBeTruthy();
    expect(screen.getByText("Yesterday, 6:15 PM")).toBeTruthy();
  });
});
