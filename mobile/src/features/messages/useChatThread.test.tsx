import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { chatQueryKeys } from "./chatQueryKeys";
import { buildMessageHistoryPath, useChatThread, type ChatThreadState } from "./useChatThread";

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: jest.fn()
}));

const useRuntimeMock = jest.mocked(useConfiguredRuntime);
const session = {
  user: { id: "user-me", name: "Me", email: "me@example.test", role: "admin" },
  authorization: {
    role: "admin",
    policyVersion: "test",
    permissions: ["chat.read", "chat.read_state", "chat.send", "chat.issue"]
  }
} as AuthenticatedSession;

function summary(projectId: string) {
  return {
    project: { id: projectId, name: "Villa", status: "active" },
    counts: { openCritical: 0, openImportant: 0, unread: 2, unreadMentions: 0 },
    participantCount: 3,
    cursor: `stream-${projectId}`,
    lastReadSequence: 0,
    latestMessageSequence: 2,
    capabilities: { canSend: true, canManageParticipants: false, canManageIssues: true },
    setupWarnings: []
  };
}

function rawMessage(projectId: string, id: string, sequence: number) {
  return {
    id,
    projectId,
    author: { id: "user-other", name: "Aditi Rao", role: "designer" },
    body: `Message ${sequence}`,
    attachments: [],
    createdAt: `2026-09-18T10:0${sequence}:00.000Z`,
    sequence,
    clientMessageId: `client-${id}`,
    replyTo: null,
    priority: "normal",
    issueStatus: null,
    version: 1,
    capabilities: { canRaise: true, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false }
  };
}

function Harness({ projectId, onValue }: { readonly projectId: string; readonly onValue: (value: ChatThreadState) => void }) {
  const value = useChatThread(projectId, session);
  onValue(value);
  return null;
}

describe("useChatThread", () => {
  it("encodes the project and opaque older cursor", () => {
    expect(buildMessageHistoryPath("villa/a", "opaque:a/b")).toBe(
      "/projects/villa%2Fa/chat/messages?limit=50&before=opaque%3Aa%2Fb"
    );
  });

  it("loads latest and older pages, acknowledges safe visible history, scopes realtime, and cleans it up", async () => {
    const get = jest.fn(async (path: string) => {
      if (path === "/projects/project-a/chat") return summary("project-a");
      if (path.endsWith("before=older%2Fcursor")) {
        return { items: [rawMessage("project-a", "message-1", 1)], olderCursor: null, newerCursor: "newer", snapshotCursor: "snapshot-1", latestMessageSequence: 2 };
      }
      return { items: [rawMessage("project-a", "message-2", 2)], olderCursor: "older/cursor", newerCursor: null, snapshotCursor: "snapshot-2", latestMessageSequence: 2 };
    });
    const put = jest.fn(async () => ({ lastReadSequence: 2 }));
    const stream = { start: jest.fn(), stop: jest.fn(), getState: jest.fn(), getCursor: jest.fn() };
    const createStream = jest.fn(() => stream);
    useRuntimeMock.mockReturnValue({
      environment: { environment: { id: "remote:https://api.example.test/api/v1" }, generation: 5 },
      session: { generation: 7 },
      runtime: {
        api: { authenticated: { get, put } },
        realtime: { createStream }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
    let state!: ChatThreadState;
    const view = await render(
      <QueryClientProvider client={client}>
        <Harness projectId="project-a" onValue={(value) => { state = value; }} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(state.loading).toBe(false));
    expect(state.ownerKey).toBe("remote:https://api.example.test/api/v1\u00005\u00007\u0000user-me\u0000project-a");
    expect(state.messages.map((message) => message.id)).toEqual(["message-2"]);
    await waitFor(() => expect(stream.start).toHaveBeenCalledTimes(1));
    expect(createStream).toHaveBeenCalledWith(expect.objectContaining({
      path: "/projects/project-a/chat/events",
      cursor: "stream-project-a",
      cursorTransport: "query"
    }));

    await act(async () => {
      await state.loadOlder();
    });
    expect(get).toHaveBeenCalledWith(
      "/projects/project-a/chat/messages?limit=50&before=older%2Fcursor",
      expect.objectContaining({ signal: expect.anything() })
    );
    await waitFor(() => expect(state.messages.map((message) => message.id)).toEqual(["message-1", "message-2"]));
    expect(state.hasOlderHistory).toBe(false);

    await act(async () => state.setReadActive(false));
    await act(async () => state.acknowledgeVisible(new Set(["message-1", "message-2"])));
    expect(put).not.toHaveBeenCalled();
    await act(async () => state.setReadActive(true));
    await waitFor(() => expect(put).toHaveBeenCalledWith(
      "/projects/project-a/chat/read",
      { messageId: "message-2", sequence: 2 }
    ));
    await waitFor(() => expect(state.acknowledgingRead).toBe(false));

    const scope = { environmentId: "remote:https://api.example.test/api/v1", userId: "user-me" };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await act(async () => state.refreshParticipantContext(4));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatQueryKeys.participants(scope, "project-a") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatQueryKeys.summary(scope, "project-a") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatQueryKeys.conversations(scope) });

    await view.unmount();
    await waitFor(() => expect(stream.stop).toHaveBeenCalledTimes(1));
    client.clear();
  });

  it("keeps the reading position and exposes a new-message affordance for realtime arrivals", async () => {
    let newest = 1;
    let streamOptions: { onEvent(event: { event: string; data: string }): void } | undefined;
    const get = jest.fn(async (path: string) => {
      if (path.endsWith("/chat")) return { ...summary("project-a"), latestMessageSequence: newest };
      return {
        items: Array.from({ length: newest }, (_, index) => rawMessage("project-a", `message-${index + 1}`, index + 1)),
        olderCursor: null,
        newerCursor: null,
        snapshotCursor: `snapshot-${newest}`,
        latestMessageSequence: newest
      };
    });
    const stream = { start: jest.fn(), stop: jest.fn(), getState: jest.fn(), getCursor: jest.fn() };
    useRuntimeMock.mockReturnValue({
      environment: { environment: { id: "remote:https://api.example.test/api/v1" }, generation: 5 },
      session: { generation: 7 },
      runtime: {
        api: { authenticated: { get, put: jest.fn() } },
        realtime: { createStream: jest.fn((options) => { streamOptions = options; return stream; }) }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
    const scope = { environmentId: "remote:https://api.example.test/api/v1", userId: "user-me" };
    client.setQueryData(chatQueryKeys.participants(scope, "project-a"), { items: [], setupWarnings: [] });
    let state!: ChatThreadState;
    const view = await render(
      <QueryClientProvider client={client}>
        <Harness projectId="project-a" onValue={(value) => { state = value; }} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(state.messages).toHaveLength(1));
    await act(async () => state.setNearBottom(false));
    newest = 2;
    await act(async () => {
      streamOptions?.onEvent({ event: "chat", data: "{}" });
    });
    await waitFor(() => expect(state.messages).toHaveLength(2));
    await waitFor(() => expect(state.newMessagesAvailable).toBe(true));
    await waitFor(() => expect(client.getQueryState(chatQueryKeys.participants(scope, "project-a"))?.isInvalidated).toBe(true));

    await act(async () => state.clearNewMessages());
    await waitFor(() => expect(state.newMessagesAvailable).toBe(false));
    expect(state.scrollToEndRequest).toBeGreaterThan(0);
    await view.unmount();
    client.clear();
  });

  it("clears the whole project cache and stops realtime when cached access is revoked", async () => {
    let revoked = false;
    let streamOptions: { onEvent(event: { event: string; data: string }): void } | undefined;
    const get = jest.fn(async (path: string) => {
      if (revoked) throw new ApiError(404, "NOT_FOUND", "Sensitive scope detail");
      if (path.endsWith("/chat")) return summary("project-a");
      return {
        items: [rawMessage("project-a", "message-1", 1)],
        olderCursor: null,
        newerCursor: null,
        snapshotCursor: "snapshot-1",
        latestMessageSequence: 1
      };
    });
    const put = jest.fn();
    const stream = { start: jest.fn(), stop: jest.fn(), getState: jest.fn(), getCursor: jest.fn() };
    useRuntimeMock.mockReturnValue({
      environment: { environment: { id: "remote:https://api.example.test/api/v1" }, generation: 5 },
      session: { generation: 7 },
      runtime: {
        api: { authenticated: { get, put } },
        realtime: { createStream: jest.fn((options) => { streamOptions = options; return stream; }) }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
    const scope = { environmentId: "remote:https://api.example.test/api/v1", userId: "user-me" };
    let state!: ChatThreadState;
    const view = await render(
      <QueryClientProvider client={client}>
        <Harness projectId="project-a" onValue={(value) => { state = value; }} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(state.messages).toHaveLength(1));
    await waitFor(() => expect(stream.start).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(chatQueryKeys.summary(scope, "project-a"))).toBeDefined();
    expect(client.getQueryData(chatQueryKeys.messages(scope, "project-a"))).toBeDefined();

    revoked = true;
    await act(async () => {
      streamOptions?.onEvent({ event: "chat", data: "{}" });
    });

    await waitFor(() => expect(state.denied).toBe(true));
    expect(state.summary).toBeNull();
    expect(state.messages).toEqual([]);
    await waitFor(() => expect(stream.stop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(client.getQueryData(chatQueryKeys.summary(scope, "project-a"))).toBeUndefined());
    expect(client.getQueryData(chatQueryKeys.messages(scope, "project-a"))).toBeUndefined();

    await act(async () => state.acknowledgeVisible(new Set(["message-1"])));
    expect(put).not.toHaveBeenCalled();
    await view.unmount();
    client.clear();
  });

  it("rejects and does not cache a message page belonging to another project", async () => {
    const put = jest.fn();
    const createStream = jest.fn();
    const get = jest.fn(async (path: string) => {
      if (path.endsWith("/chat")) return summary("project-a");
      return {
        items: [rawMessage("project-b", "foreign-message", 1)],
        olderCursor: null,
        newerCursor: null,
        snapshotCursor: "snapshot-1",
        latestMessageSequence: 1
      };
    });
    useRuntimeMock.mockReturnValue({
      environment: { environment: { id: "remote:https://api.example.test/api/v1" }, generation: 5 },
      session: { generation: 7 },
      runtime: {
        api: { authenticated: { get, put } },
        realtime: { createStream }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
    const scope = { environmentId: "remote:https://api.example.test/api/v1", userId: "user-me" };
    let state!: ChatThreadState;
    const view = await render(
      <QueryClientProvider client={client}>
        <Harness projectId="project-a" onValue={(value) => { state = value; }} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(state.error).toBe("The service returned an invalid response."));
    expect(state.summary).toBeNull();
    expect(state.messages).toEqual([]);
    expect(client.getQueryData(chatQueryKeys.messages(scope, "project-a"))).toBeUndefined();
    expect(createStream).not.toHaveBeenCalled();
    await act(async () => state.acknowledgeVisible(new Set(["foreign-message"])));
    expect(put).not.toHaveBeenCalled();
    await view.unmount();
    client.clear();
  });
});
