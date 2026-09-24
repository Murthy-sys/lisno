import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Dimensions, StyleSheet } from "react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import type { PresentedConversation, PresentedConversationPage, PresentedLastMessage } from "./chatModel";
import { CONVERSATION_SEARCH_DEBOUNCE_MS } from "./ConversationSearchField";
import { ConversationList } from "./ConversationList";
import { formatConversationActivity } from "./ConversationRow";
import { MessagesWorkspace } from "./MessagesWorkspace";

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterSetParams = jest.fn();
const mockReturnToParent = jest.fn();

jest.mock("../../navigation/useScreenBack", () => ({
  useScreenBack: () => ({ returnToParent: mockReturnToParent })
}));

jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: jest.fn()
}));

jest.mock("expo-router", () => ({
  router: {
    push: (...args: readonly unknown[]) => mockRouterPush(...args),
    replace: (...args: readonly unknown[]) => mockRouterReplace(...args),
    setParams: (...args: readonly unknown[]) => mockRouterSetParams(...args)
  }
}));

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: jest.fn()
}));

jest.mock("./ChatThread", () => ({
  ChatThread: ({ projectId, onBack, onSendingChange }: { readonly projectId: string; readonly onBack?: () => void; readonly onSendingChange?: (sending: boolean) => void }) => {
    const React = jest.requireActual("react") as typeof import("react");
    const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Text, null, `Thread ${projectId}`),
      onBack ? React.createElement(Pressable, { accessibilityLabel: "Mock thread back", accessibilityRole: "button", onPress: onBack }, React.createElement(Text, null, "Thread Back")) : null,
      React.createElement(Pressable, { accessibilityLabel: "Mock thread sending", accessibilityRole: "button", onPress: () => onSendingChange?.(true) }, React.createElement(Text, null, "Sending")),
      React.createElement(Pressable, { accessibilityLabel: "Mock thread send complete", accessibilityRole: "button", onPress: () => onSendingChange?.(false) }, React.createElement(Text, null, "Send complete"))
    );
  }
}));

const useInfiniteQueryMock = jest.mocked(useInfiniteQuery);
const useQueryClientMock = jest.mocked(useQueryClient);
const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);
const apiGet = jest.fn();
const download = jest.fn();
const cancelQueries = jest.fn(async () => undefined);
const removeQueries = jest.fn();

function session(permissions: AuthenticatedSession["authorization"]["permissions"] = ["chat.read"]): AuthenticatedSession {
  return {
    user: { id: "user-1", name: "Aditi Rao", email: "aditi@example.test", role: "admin" },
    authorization: {
      role: "admin",
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      permissions
    }
  };
}

function conversation(overrides: Partial<PresentedConversation> = {}): PresentedConversation {
  return {
    project: { id: "project-a", name: "Villa North", status: "active" },
    counts: { openCritical: 1, openImportant: 2, unread: 8, unreadMentions: 2 },
    participantCount: 5,
    cursor: "cursor-a",
    lastReadSequence: 3,
    latestMessageSequence: 11,
    capabilities: { canSend: true, canManageParticipants: false, canManageIssues: true },
    setupWarnings: [],
    lastMessageAt: "2026-09-16T10:00:00.000Z",
    ...overrides
  };
}

function lastMessage(overrides: Partial<PresentedLastMessage> = {}): PresentedLastMessage {
  return {
    id: "message-last",
    author: { id: "user-ramesh", name: "Ramesh", role: "designer" },
    excerpt: "Hi team, the design for the lobby is ready",
    createdAt: "2026-09-16T10:24:00.000Z",
    attachments: [],
    attachmentCount: 0,
    ...overrides
  };
}

interface ListQueryOptions {
  readonly queryKey: readonly unknown[];
  queryFn(input: { readonly pageParam: number; readonly signal: AbortSignal }): Promise<PresentedConversationPage>;
}

function latestQueryOptions(): ListQueryOptions {
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as unknown as ListQueryOptions;
}

function page(
  items: readonly PresentedConversation[],
  overrides: Partial<PresentedConversationPage["pagination"]> = {},
  totals?: PresentedConversationPage["totals"]
): PresentedConversationPage {
  return {
    items,
    pagination: { limit: 30, offset: 0, total: items.length, hasMore: false, ...overrides },
    ...(totals ? { totals } : {})
  };
}

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [page([conversation()])], pageParams: [0] },
    error: null,
    isPending: false,
    isError: false,
    isRefetching: false,
    isRefetchError: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    refetch: jest.fn(async () => undefined),
    fetchNextPage: jest.fn(async () => undefined),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useConfiguredRuntimeMock.mockReturnValue({
    configured: true,
    booted: true,
    runtime: { api: { authenticated: { get: apiGet } }, transfers: { download } },
    environment: {
      environment: { id: "remote:https://api.example.test", profile: "remote" },
      generation: 4,
      status: "ready"
    }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
  useQueryClientMock.mockReturnValue({ cancelQueries, removeQueries } as unknown as ReturnType<typeof useQueryClient>);
  useInfiniteQueryMock.mockReturnValue(queryResult() as never);
});

describe("ConversationList", () => {
  it("renders reference-style rows with authoritative signals and one accessible action", async () => {
    const selected = jest.fn();
    const updated = conversation({
      counts: { openCritical: 1, openImportant: 2, unread: 9, unreadMentions: 2 },
      lastMessage: lastMessage()
    });
    const read = conversation({
      project: { id: "project-b", name: "Villa South", status: "handover_ready" },
      counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 },
      participantCount: 1,
      lastMessageAt: null,
      lastMessage: null
    });
    useInfiniteQueryMock.mockReturnValue(queryResult({
      data: {
        pages: [
          page([conversation(), read]),
          page([updated], { offset: 30 })
        ],
        pageParams: [0, 30]
      }
    }) as never);

    const view = await render(
      <ConversationList onSelectProject={selected} selectedProjectId="project-a" session={session()} />
    );

    const rows = view.getAllByRole("button", { name: /^Villa North, 9 unread messages/i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.props.accessibilityLabel).toBe(
      "Villa North, 9 unread messages, 2 unread mentions, 1 open critical issue, 2 open important issues, " +
      `last message from Ramesh: Hi team, the design for the lobby is ready, ${formatConversationActivity("2026-09-16T10:24:00.000Z")}`
    );
    expect(rows[0]?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false, selected: true }));
    expect(view.getByText("Ramesh: Hi team, the design for the lobby is ready", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText("9", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId("conversation-priority-critical", { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByText("Critical 1", { includeHiddenElements: true })).toBeNull();
    expect(view.queryByText(/participants/, { includeHiddenElements: true })).toBeNull();
    expect(view.queryByText("Your project groups")).toBeNull();
    expect(StyleSheet.flatten(view.getByText("Villa North", { includeHiddenElements: true }).props.style).fontFamily).toBe("Poppins_600SemiBold");
    const readRow = view.getByRole("button", { name: /^Villa South/i });
    expect(readRow.props.accessibilityLabel).toBe("Villa South, No messages yet");
    expect(readRow.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false, selected: false }));
    expect(view.getByText("No messages yet", { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId("conversation-unread-project-b", { includeHiddenElements: true })).toBeNull();

    await fireEvent.press(rows[0]!);
    expect(selected).toHaveBeenCalledWith("project-a");
  });

  it("uses the established message record route when no selection callback is supplied", async () => {
    const view = await render(<MessagesWorkspace session={session()} viewportWidth={390} />);

    await fireEvent.press(view.getByRole("button", { name: /Villa North/i }));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/record/[featureId]/[recordId]",
      params: { featureId: "messages", recordId: "project-a" }
    });
  });

  it("opens a split-view root conversation locally while keeping the list mounted", async () => {
    const view = await render(<MessagesWorkspace session={session()} viewportWidth={600} />);
    const row = view.getByRole("button", { name: /Villa North/i });

    expect(view.getByText("Your project, in one conversation")).toBeTruthy();
    await fireEvent.press(row);

    expect(view.getByText("Thread project-a")).toBeTruthy();
    expect(view.getByTestId("conversation-list")).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("keeps the record conversation list mounted while selection changes in split view", async () => {
    useInfiniteQueryMock.mockReturnValue(queryResult({
      data: {
        pages: [page([
          conversation(),
          conversation({ project: { id: "project-b", name: "Villa South", status: "active" } })
        ])],
        pageParams: [0]
      }
    }) as never);
    const view = await render(
      <MessagesWorkspace selectedProjectId="project-a" session={session()} viewportWidth={600} />
    );

    expect(view.getByText("Thread project-a")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: /Villa South/i }));

    expect(view.getByText("Thread project-b")).toBeTruthy();
    expect(view.getByTestId("conversation-list")).toBeTruthy();
    expect(mockRouterSetParams).toHaveBeenCalledWith({ recordId: "project-b" });
  });

  it("returns direct phone threads to the Messages list deterministically", async () => {
    const view = await render(
      <MessagesWorkspace selectedProjectId="project-a" session={session()} viewportWidth={390} />
    );

    expect(view.getByText("Thread project-a")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Mock thread back" }));

    expect(mockReturnToParent).toHaveBeenCalledWith("/feature/messages");
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("keeps split selection local and promotes it to a record when resized to phone", async () => {
    const sessionValue = session();
    const view = await render(<MessagesWorkspace session={sessionValue} viewportWidth={840} />);
    await fireEvent.press(view.getByRole("button", { name: /Villa North/i }));

    expect(view.queryByRole("button", { name: "Mock thread back" })).toBeNull();
    await view.rerender(<MessagesWorkspace session={sessionValue} viewportWidth={599} />);

    expect(view.getAllByRole("button", { name: "Mock thread back" })).toHaveLength(1);
    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: "/record/[featureId]/[recordId]",
      params: { featureId: "messages", recordId: "project-a" }
    });
    await fireEvent.press(view.getByRole("button", { name: "Mock thread back" }));
    expect(mockReturnToParent).toHaveBeenCalledWith("/feature/messages");
  });

  it("preserves a direct record across phone and split layouts without duplicate local Back", async () => {
    const sessionValue = session();
    const element = (width: number) => <MessagesWorkspace selectedProjectId="project-a" session={sessionValue} viewportWidth={width} />;
    const view = await render(element(599));
    expect(view.getAllByRole("button", { name: "Mock thread back" })).toHaveLength(1);

    await view.rerender(element(600));
    expect(view.getByTestId("conversation-list")).toBeTruthy();
    expect(view.getByText("Thread project-a")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Mock thread back" })).toBeNull();
    await view.rerender(element(840));
    expect(view.queryByRole("button", { name: "Mock thread back" })).toBeNull();
    await view.rerender(element(390));
    await fireEvent.press(view.getByRole("button", { name: "Mock thread back" }));

    expect(mockReturnToParent).toHaveBeenCalledWith("/feature/messages");
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("prevents changing split conversations during a pending send", async () => {
    useInfiniteQueryMock.mockReturnValue(queryResult({
      data: { pages: [page([
        conversation(),
        conversation({ project: { id: "project-b", name: "Villa South", status: "active" } })
      ])], pageParams: [0] }
    }) as never);
    const view = await render(<MessagesWorkspace selectedProjectId="project-a" session={session()} viewportWidth={600} />);
    await fireEvent.press(view.getByRole("button", { name: "Mock thread sending" }));
    const other = view.getByRole("button", { name: /Villa South/i });

    expect(other).toBeDisabled();
    await fireEvent.press(other);
    expect(mockRouterSetParams).not.toHaveBeenCalled();
    expect(view.getByText("Thread project-a")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Mock thread send complete" }));
    await fireEvent.press(view.getByRole("button", { name: /Villa South/i }));
    expect(mockRouterSetParams).toHaveBeenCalledWith({ recordId: "project-b" });
  });

  it("fetches normalized offset pages in the authenticated environment/user scope", async () => {
    await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    const options = useInfiniteQueryMock.mock.calls[0]?.[0] as unknown as {
      queryKey: readonly unknown[];
      queryFn(input: { readonly pageParam: number; readonly signal: AbortSignal }): Promise<PresentedConversationPage>;
      getNextPageParam(pageValue: PresentedConversationPage): number | undefined;
    };
    const response = {
      items: [{
        ...conversation(),
        project: { id: "project-a", name: "Villa North", status: "active" }
      }],
      pagination: { limit: 30, offset: 30, total: 61, hasMore: true }
    };
    apiGet.mockResolvedValueOnce(response);
    const controller = new AbortController();

    await expect(options.queryFn({ pageParam: 30, signal: controller.signal })).resolves.toEqual(response);
    expect(options.queryKey.slice(0, 3)).toEqual(["remote:https://api.example.test", "user-1", "chat"]);
    expect(apiGet).toHaveBeenCalledWith("/project-messages?limit=30&offset=30", { signal: controller.signal });
    expect(options.getNextPageParam(response)).toBe(60);

    apiGet.mockResolvedValueOnce({ items: [], pagination: { limit: 0 } });
    await expect(options.queryFn({ pageParam: 0, signal: controller.signal })).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it("keeps pull-to-refresh without a header refresh button", async () => {
    const result = queryResult();
    useInfiniteQueryMock.mockReturnValue(result as never);
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);

    expect(view.queryByRole("button", { name: "Refresh messages" })).toBeNull();
    expect(view.getByRole("header", { name: "Messages" })).toBeTruthy();
    expect(view.getByText("Project conversations")).toBeTruthy();
    expect(view.getByRole("button", { name: "Search messages" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Sort conversations" })).toBeTruthy();
    await act(async () => {
      view.getByTestId("conversation-list").props.refreshControl.props.onRefresh();
    });

    expect(result.refetch).toHaveBeenCalledTimes(1);
  });

  it("retains cached rows during refresh failure and exposes a targeted retry", async () => {
    const result = queryResult({
      isError: true,
      isRefetchError: true,
      error: new Error("offline")
    });
    useInfiniteQueryMock.mockReturnValue(result as never);
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);

    expect(view.getByText("Messages may be out of date")).toBeTruthy();
    expect(view.getByTestId("conversation-project-a")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Retry refreshing messages" }));
    expect(result.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a skeleton while the first page loads", async () => {
    useInfiniteQueryMock.mockReturnValue(queryResult({ data: undefined, isPending: true }) as never);
    const loading = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    expect(loading.getByRole("progressbar", { name: "Loading project conversations" })).toBeTruthy();
  });

  it("shows a useful empty state", async () => {
    useInfiniteQueryMock.mockReturnValue(queryResult({ data: { pages: [page([])], pageParams: [0] } }) as never);
    const empty = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    expect(empty.getByRole("header", { name: "No project conversations" })).toBeTruthy();
  });

  it("clears cached rows and shows a non-disclosing denied state after a denied refetch", async () => {
    useInfiniteQueryMock.mockReturnValue(queryResult({
      isError: true,
      isRefetchError: true,
      error: new ApiError(403, "FORBIDDEN", "Sensitive policy detail")
    }) as never);
    const denied = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    expect(denied.getByRole("header", { name: "Messages are unavailable", includeHiddenElements: true })).toBeTruthy();
    expect(denied.queryByTestId("conversation-project-a")).toBeNull();
    expect(denied.queryByText("Sensitive policy detail")).toBeNull();
    await waitFor(() => expect(cancelQueries).toHaveBeenCalledTimes(1));
    expect(removeQueries).toHaveBeenCalledTimes(1);
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: expect.arrayContaining(["chat", "conversations"]) });
  });

  it("does not fetch when the session lacks conversation access", async () => {
    const noPermission = await render(<ConversationList onSelectProject={jest.fn()} session={session([])} />);
    expect(noPermission.getByRole("header", { name: "Messages are unavailable", includeHiddenElements: true })).toBeTruthy();
    const options = useInfiniteQueryMock.mock.calls[0]?.[0] as unknown as { readonly enabled: boolean };
    expect(options.enabled).toBe(false);
  });

  it("shows a retry for a non-permission initial failure", async () => {
    const result = queryResult({ data: undefined, isError: true, error: new Error("offline") });
    useInfiniteQueryMock.mockReturnValue(result as never);
    const failed = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    expect(failed.getByRole("header", { name: "Messages could not be loaded", includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(failed.getByRole("button", { name: "Retry", includeHiddenElements: true }));
    expect(result.refetch).toHaveBeenCalledTimes(1);
  });

  it("retries continuation failures and prevents concurrent end-reached requests", async () => {
    const fetchNextPage = jest.fn(() => new Promise<void>(() => undefined));
    useInfiniteQueryMock.mockReturnValue(queryResult({
      hasNextPage: true,
      isFetchNextPageError: true,
      fetchNextPage
    }) as never);
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);

    await fireEvent.press(view.getByRole("button", { name: "Retry loading more conversations", includeHiddenElements: true }));
    fireEvent(view.getByTestId("conversation-list"), "endReached");
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

describe("ConversationList search, filters, and sort", () => {
  const initialWindow = Dimensions.get("window");
  const initialScreen = Dimensions.get("screen");

  afterEach(async () => {
    jest.useRealTimers();
    await act(async () => {
      Dimensions.set({ window: initialWindow, screen: initialScreen });
    });
  });

  it("shows chip counts only when the server total is above zero and announces them as tabs", async () => {
    useInfiniteQueryMock.mockReturnValue(queryResult({
      data: { pages: [page([conversation()], {}, { unread: 4, critical: 3, important: 0 })], pageParams: [0] }
    }) as never);
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);

    const tabs = view.getAllByRole("tab");
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual(["All", "Unread, 4", "Critical, 3", "Important"]);
    expect(view.getByRole("tab", { name: "All" }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(view.getByText("4")).toBeTruthy();
    expect(view.getByText("3")).toBeTruthy();
    expect(view.queryByText("0")).toBeNull();
  });

  it("hides every chip count for an older server without totals", async () => {
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    expect(view.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual(["All", "Unread", "Critical", "Important"]);
  });

  it("sends the selected filter with a fresh first page and keeps the prefix for invalidation", async () => {
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    expect(latestQueryOptions().queryKey.slice(2)).toEqual(["chat", "conversations", "all", ""]);

    await fireEvent.press(view.getByRole("tab", { name: "Critical" }));

    const options = latestQueryOptions();
    expect(options.queryKey.slice(2)).toEqual(["chat", "conversations", "critical", ""]);
    expect(view.getByRole("tab", { name: "Critical" }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    apiGet.mockResolvedValueOnce({ items: [], pagination: { limit: 30, offset: 0, total: 0, hasMore: false } });
    await options.queryFn({ pageParam: 0, signal: new AbortController().signal });
    expect(apiGet).toHaveBeenLastCalledWith("/project-messages?limit=30&offset=0&filter=critical", expect.anything());
  });

  it.each([
    ["unread", "No unread conversations"],
    ["critical", "No open critical issues"],
    ["important", "No open important issues"]
  ] as const)("words the empty %s filter state", async (filter, title) => {
    useInfiniteQueryMock.mockReturnValue(queryResult({ data: { pages: [page([])], pageParams: [0] } }) as never);
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    await fireEvent.press(view.getByRole("tab", { name: new RegExp(`^${filter}`, "i") }));
    expect(view.getByRole("header", { name: title })).toBeTruthy();
  });

  it("debounces search for 300 ms, sends it, and clears from the empty state", async () => {
    jest.useFakeTimers();
    useInfiniteQueryMock.mockReturnValue(queryResult({ data: { pages: [page([])], pageParams: [0] } }) as never);
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    const field = view.getByPlaceholderText("Search messages");

    await fireEvent.changeText(field, "  Villa N ");
    await act(async () => {
      jest.advanceTimersByTime(CONVERSATION_SEARCH_DEBOUNCE_MS - 1);
    });
    expect(latestQueryOptions().queryKey.at(-1)).toBe("");

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    const options = latestQueryOptions();
    expect(options.queryKey.at(-1)).toBe("Villa N");
    apiGet.mockResolvedValueOnce({ items: [], pagination: { limit: 30, offset: 0, total: 0, hasMore: false } });
    await options.queryFn({ pageParam: 0, signal: new AbortController().signal });
    expect(apiGet).toHaveBeenLastCalledWith("/project-messages?limit=30&offset=0&search=Villa%20N", expect.anything());

    expect(view.getByRole("header", { name: "No conversations match" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Clear" }));
    expect(latestQueryOptions().queryKey.at(-1)).toBe("");
    expect(view.getByPlaceholderText("Search messages").props.value).toBe("");
  });

  it("clears typed search with the inline clear button", async () => {
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    expect(view.queryByRole("button", { name: "Clear search" })).toBeNull();
    await fireEvent.changeText(view.getByPlaceholderText("Search messages"), "Villa");
    await fireEvent.press(view.getByRole("button", { name: "Clear search" }));
    expect(view.getByPlaceholderText("Search messages").props.value).toBe("");
  });

  it("reorders loaded conversations with unread first as a stable client-side sort", async () => {
    const quiet = (id: string, name: string) => conversation({
      project: { id, name, status: "active" },
      counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 }
    });
    const loud = (id: string, name: string, unread: number) => conversation({
      project: { id, name, status: "active" },
      counts: { openCritical: 0, openImportant: 0, unread, unreadMentions: 0 }
    });
    useInfiniteQueryMock.mockReturnValue(queryResult({
      data: {
        pages: [page([quiet("p1", "Alpha"), loud("p2", "Bravo", 2), quiet("p3", "Charlie"), loud("p4", "Delta", 1)])],
        pageParams: [0]
      }
    }) as never);
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);
    const order = () => view.getAllByTestId(/^conversation-p\d$/).map((row) => row.props.testID);
    expect(order()).toEqual(["conversation-p1", "conversation-p2", "conversation-p3", "conversation-p4"]);

    await fireEvent.press(view.getByRole("button", { name: "Sort conversations" }));
    expect(view.getByRole("radio", { name: "Recent activity" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(view.getByRole("radio", { name: "Unread first" }));
    expect(order()).toEqual(["conversation-p2", "conversation-p4", "conversation-p1", "conversation-p3"]);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("disables search and sort controls in the denied state", async () => {
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session([])} />);
    expect(view.getByRole("button", { name: "Sort conversations", includeHiddenElements: true })).toBeDisabled();
    expect(view.queryByRole("tab", { includeHiddenElements: true })).toBeNull();
  });

  it("stacks the time under the name at 320pt with large text", async () => {
    Dimensions.set({
      window: { ...initialWindow, width: 320, fontScale: 2 },
      screen: { ...initialScreen, width: 320, fontScale: 2 }
    });
    useInfiniteQueryMock.mockReturnValue(queryResult({
      data: { pages: [page([conversation({ lastMessage: lastMessage() })], {}, { unread: 8, critical: 1, important: 2 })], pageParams: [0] }
    }) as never);
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);

    expect(StyleSheet.flatten(view.getByTestId("conversation-primary-line", { includeHiddenElements: true }).props.style)).toEqual(
      expect.objectContaining({ flexDirection: "column" })
    );
    expect(view.getByTestId("conversation-filters").props.horizontal).toBe(true);
    expect(view.getByRole("button", { name: /^Villa North/ })).toBeTruthy();
  });
});
