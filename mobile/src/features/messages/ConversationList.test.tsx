import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import type { PresentedConversation, PresentedConversationPage } from "./chatModel";
import { ConversationList } from "./ConversationList";
import { MessagesWorkspace } from "./MessagesWorkspace";

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterSetParams = jest.fn();

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
  ChatThread: ({ projectId, onBack }: { readonly projectId: string; readonly onBack?: () => void }) => {
    const React = jest.requireActual("react") as typeof import("react");
    const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
    return React.createElement(
      Pressable,
      { accessibilityLabel: "Mock thread back", accessibilityRole: "button", onPress: onBack },
      React.createElement(Text, null, `Thread ${projectId}`)
    );
  }
}));

const useInfiniteQueryMock = jest.mocked(useInfiniteQuery);
const useQueryClientMock = jest.mocked(useQueryClient);
const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);
const apiGet = jest.fn();
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

function page(items: readonly PresentedConversation[], overrides: Partial<PresentedConversationPage["pagination"]> = {}): PresentedConversationPage {
  return {
    items,
    pagination: { limit: 30, offset: 0, total: items.length, hasMore: false, ...overrides }
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
    runtime: { api: { authenticated: { get: apiGet } } },
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
  it("renders compact WhatsApp-style rows with authoritative signals and one accessible action", async () => {
    const selected = jest.fn();
    const updated = conversation({
      counts: { openCritical: 1, openImportant: 2, unread: 9, unreadMentions: 2 }
    });
    const read = conversation({
      project: { id: "project-b", name: "Villa South", status: "handover_ready" },
      counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 },
      participantCount: 1,
      lastMessageAt: null
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

    const rows = view.getAllByRole("button", { name: /Villa North, active, 5 participants/i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.props.accessibilityLabel).toEqual(expect.stringContaining("9 unread messages"));
    expect(rows[0]?.props.accessibilityLabel).toEqual(expect.stringContaining("2 unread mentions"));
    expect(rows[0]?.props.accessibilityLabel).toEqual(expect.stringContaining("1 open critical issue"));
    expect(rows[0]?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false, selected: true }));
    expect(view.getByText("@2", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText("Critical 1", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText("9", { includeHiddenElements: true })).toBeTruthy();
    expect(StyleSheet.flatten(view.getByText("Villa North", { includeHiddenElements: true }).props.style).fontFamily).toBe("Poppins_600SemiBold");
    const readRow = view.getByRole("button", { name: /Villa South, handover_ready, 1 participant/i });
    expect(readRow.props.accessibilityLabel).not.toContain("unread");
    expect(readRow.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false, selected: false }));
    expect(StyleSheet.flatten(view.getByText("Villa South", { includeHiddenElements: true }).props.style).fontFamily).toBe("Poppins_500Medium");

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

    expect(mockRouterReplace).toHaveBeenCalledWith("/feature/messages");
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

  it("supports header refresh and pull-to-refresh", async () => {
    const result = queryResult();
    useInfiniteQueryMock.mockReturnValue(result as never);
    const view = await render(<ConversationList onSelectProject={jest.fn()} session={session()} />);

    await fireEvent.press(view.getByRole("button", { name: "Refresh messages" }));
    await act(async () => {
      view.getByTestId("conversation-list").props.refreshControl.props.onRefresh();
    });

    expect(result.refetch).toHaveBeenCalledTimes(2);
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
