jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => () => undefined),
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true }))
  }
}));

import { CleanupRegistry } from "../../core/config/cleanupRegistry";
import type { AuthenticatedResourceContext } from "../files/transfer";
import {
  NativeSseClient,
  type RealtimeLifecycle,
  type RealtimeLifecycleSnapshot
} from "./sseClient";

const context: AuthenticatedResourceContext = {
  apiBaseUrl: "https://api.example.test/api/v1",
  environmentId: "remote:https://api.example.test/api/v1",
  environmentGeneration: 2,
  userId: "user-1",
  sessionGeneration: 4,
  token: "stream-token"
};

class FakeLifecycle implements RealtimeLifecycle {
  private listeners = new Set<(snapshot: RealtimeLifecycleSnapshot) => void>();

  constructor(private snapshot: RealtimeLifecycleSnapshot) {}

  getSnapshot = () => this.snapshot;

  subscribe(listener: (snapshot: RealtimeLifecycleSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(snapshot: RealtimeLifecycleSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

function eventResponse(value: string): Response {
  const bytes = new TextEncoder().encode(value);
  let delivered = false;
  return {
    status: 200,
    ok: true,
    body: {
      getReader: () => ({
        async read() {
          if (delivered) return { done: true, value: undefined };
          delivered = true;
          return { done: false, value: bytes };
        },
        releaseLock() {}
      })
    }
  } as unknown as Response;
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function createClient(
  fetchImplementation: jest.Mock,
  lifecycle = new FakeLifecycle({ active: true, online: true })
) {
  let current = true;
  const cleanups = new CleanupRegistry();
  const client = new NativeSseClient({
    resources: {
      getAuthenticatedResourceContext: () => context,
      isCurrent: (candidate) => current && candidate === context
    },
    cleanups,
    fetch: fetchImplementation,
    lifecycle
  });
  return { client, lifecycle, cleanups, makeStale: () => (current = false) };
}

describe("native authenticated SSE", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("sends credentials only to the configured endpoint and replays a header cursor", async () => {
    jest.useFakeTimers();
    const fetchImplementation = jest
      .fn()
      .mockResolvedValueOnce(eventResponse("id: event-1\nevent: notification\ndata: {\"ok\":true}\n\n"))
      .mockResolvedValueOnce(eventResponse("id: event-1\ndata: duplicate\n\n"));
    const { client } = createClient(fetchImplementation);
    const onEvent = jest.fn();
    let markEventDelivered!: () => void;
    const eventDelivered = new Promise<void>((resolve) => (markEventDelivered = resolve));
    const onResync = jest.fn();
    const stream = client.createStream({
      path: "/notifications/events",
      minReconnectMs: 100,
      maxReconnectMs: 100,
      onEvent: (event) => {
        onEvent(event);
        markEventDelivered();
      },
      onResync
    });

    stream.start();
    await eventDelivered;
    expect(onEvent).toHaveBeenCalledWith({
      id: "event-1",
      event: "notification",
      data: '{"ok":true}',
      retryMs: null
    });
    const firstHeaders = new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers);
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/notifications/events"
    );
    expect(firstHeaders.get("Authorization")).toBe("Bearer stream-token");
    expect(firstHeaders.get("Last-Event-ID")).toBeNull();

    await jest.advanceTimersByTimeAsync(100);
    await flushAsyncWork();
    const replayHeaders = new Headers(fetchImplementation.mock.calls[1]?.[1]?.headers);
    expect(replayHeaders.get("Last-Event-ID")).toBe("event-1");
    expect(onResync).toHaveBeenCalledWith("event-1");
    expect(onEvent).toHaveBeenCalledTimes(1);
    stream.stop();
  });

  it("replays chat cursors as a query and treats a denied state event as terminal", async () => {
    jest.useFakeTimers();
    const fetchImplementation = jest
      .fn()
      .mockResolvedValueOnce(eventResponse("id: chat-cursor-1\nevent: chat\ndata: {\"events\":[]}\n\n"))
      .mockResolvedValueOnce(eventResponse("event: state\ndata: {\"status\":\"denied\"}\n\n"));
    const { client } = createClient(fetchImplementation);
    const onDenied = jest.fn();
    let firstDelivered!: () => void;
    const delivered = new Promise<void>((resolve) => (firstDelivered = resolve));
    const stream = client.createStream({
      path: "/projects/project-1/chat/events",
      cursorTransport: "query",
      deniedStatusCodes: [401, 403, 404],
      minReconnectMs: 100,
      maxReconnectMs: 100,
      isDeniedEvent: (event) =>
        event.event === "state" &&
        (JSON.parse(event.data) as { status?: unknown }).status === "denied",
      onEvent: () => firstDelivered(),
      onDenied
    });

    stream.start();
    await delivered;
    await jest.advanceTimersByTimeAsync(100);
    await flushAsyncWork();

    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(
      "https://api.example.test/api/v1/projects/project-1/chat/events?cursor=chat-cursor-1"
    );
    const replayHeaders = new Headers(fetchImplementation.mock.calls[1]?.[1]?.headers);
    expect(replayHeaders.get("Last-Event-ID")).toBeNull();
    expect(stream.getState()).toBe("denied");
    expect(onDenied).toHaveBeenCalledTimes(1);
  });

  it("treats a configured not-found response as a terminal scoped denial", async () => {
    const fetchImplementation = jest.fn(async () => new Response(null, { status: 404 }));
    const { client } = createClient(fetchImplementation);
    let markDenied!: () => void;
    const denied = new Promise<void>((resolve) => (markDenied = resolve));
    const stream = client.createStream({
      path: "/projects/project-1/chat/events",
      deniedStatusCodes: [401, 403, 404],
      onEvent: jest.fn(),
      onDenied: markDenied
    });

    stream.start();
    await denied;
    expect(stream.getState()).toBe("denied");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("reconnects when an active stream misses its heartbeat deadline", async () => {
    jest.useFakeTimers();
    let calls = 0;
    const fetchImplementation = jest.fn(async (_url: string, init: RequestInit) => {
      calls += 1;
      if (calls > 1) return new Response(null, { status: 403 });
      return {
        status: 200,
        ok: true,
        body: {
          getReader: () => ({
            read: () => new Promise((_resolve, reject) => {
              init.signal?.addEventListener(
                "abort",
                () => reject(new Error("stream aborted")),
                { once: true }
              );
            }),
            releaseLock() {}
          })
        }
      } as unknown as Response;
    });
    const { client } = createClient(fetchImplementation);
    let markDenied!: () => void;
    const denied = new Promise<void>((resolve) => (markDenied = resolve));
    const onError = jest.fn();
    const stream = client.createStream({
      path: "/projects/project-1/chat/events",
      heartbeatTimeoutMs: 1_000,
      minReconnectMs: 100,
      maxReconnectMs: 100,
      onEvent: jest.fn(),
      onDenied: markDenied,
      onError
    });

    stream.start();
    await flushAsyncWork();
    await jest.advanceTimersByTimeAsync(1_100);
    await flushAsyncWork();
    await denied;

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(stream.getState()).toBe("denied");
  });

  it("tears down permanently on authorization denial", async () => {
    const fetchImplementation = jest.fn(async () => new Response(null, { status: 403 }));
    const { client } = createClient(fetchImplementation);
    const onDenied = jest.fn();
    let markDenied!: () => void;
    const denied = new Promise<void>((resolve) => (markDenied = resolve));
    const stream = client.createStream({
      path: "/notifications/events",
      onEvent: jest.fn(),
      onDenied: () => {
        onDenied();
        markDenied();
      }
    });

    stream.start();
    await denied;
    expect(stream.getState()).toBe("denied");
    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("waits for foreground connectivity and cleanup stops reconnection", async () => {
    jest.useFakeTimers();
    const lifecycle = new FakeLifecycle({ active: false, online: true });
    const fetchImplementation = jest.fn(async () => eventResponse("data: ready\n\n"));
    const { client, cleanups } = createClient(fetchImplementation, lifecycle);
    const stream = client.createStream({
      path: "/notifications/events",
      minReconnectMs: 100,
      maxReconnectMs: 100,
      onEvent: jest.fn()
    });

    stream.start();
    expect(stream.getState()).toBe("paused");
    expect(fetchImplementation).not.toHaveBeenCalled();
    lifecycle.update({ active: true, online: true });
    await flushAsyncWork();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    await cleanups.run({
      reason: "logout",
      generation: 1,
      fromEnvironment: {
        profile: "remote",
        id: context.environmentId,
        apiBaseUrl: context.apiBaseUrl,
        origin: "https://api.example.test",
        host: "api.example.test",
        isLocal: false
      }
    });
    expect(stream.getState()).toBe("stopped");
    await jest.advanceTimersByTimeAsync(1_000);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
