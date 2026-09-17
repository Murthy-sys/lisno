import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { parseNotificationSnapshot, runNotificationStream } from "./notificationStream";

const snapshot = { items: [], unreadCount: 0, pagination: { limit: 20, offset: 0, total: 0, hasMore: false } };
const frame = (value: unknown) => new TextEncoder().encode(`event: notifications\ndata: ${JSON.stringify(value)}\n\n`);
const response = (stream: ReadableStream<Uint8Array>) => new Response(stream, { headers: { "content-type": "text/event-stream" } });
afterEach(() => vi.useRealTimers());

describe("notification snapshot stream", () => {
  it("parses chunked snapshots and ignores heartbeat comments", async () => {
    const signal = new AbortController();
    const onSnapshot = vi.fn(() => signal.abort());
    const data = frame(snapshot);
    const connect = vi.fn().mockResolvedValue(response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
      controller.enqueue(data.slice(0, 21)); controller.enqueue(data.slice(21));
    } })));
    await runNotificationStream({ signal: signal.signal, connect, onSnapshot, onStatus: vi.fn(), onDenied: vi.fn() });
    expect(onSnapshot).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(connect).toHaveBeenCalledExactlyOnceWith("/notifications/events", { signal: expect.any(AbortSignal) });
  });

  it("stops on a denied control frame without reconnecting", async () => {
    const onDenied = vi.fn();
    const connect = vi.fn().mockResolvedValue(response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('event: state\ndata: {"status":"denied"}\n\n'));
    } })));
    await runNotificationStream({ signal: new AbortController().signal, connect, onSnapshot: vi.fn(), onStatus: vi.fn(), onDenied });
    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("stops on HTTP authorization failure", async () => {
    const onDenied = vi.fn();
    const connect = vi.fn().mockRejectedValue(new ApiError(403, "DENIED", "Denied"));
    await runNotificationStream({ signal: new AbortController().signal, connect, onSnapshot: vi.fn(), onStatus: vi.fn(), onDenied });
    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("backs off reconnects and cancels idle readers on session cleanup", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const controller = new AbortController();
    const cancelled = vi.fn();
    const connect = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(response(new ReadableStream({ cancel: cancelled })));
    const task = runNotificationStream({ signal: controller.signal, connect, onSnapshot: vi.fn(), onStatus: vi.fn(), onDenied: vi.fn() });
    await vi.advanceTimersByTimeAsync(999);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(2);
    controller.abort();
    await task;
    expect(cancelled).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed and oversized snapshots before publishing content", () => {
    expect(() => parseNotificationSnapshot(JSON.stringify({ ...snapshot, unreadCount: -1 }))).toThrow();
    expect(() => parseNotificationSnapshot(JSON.stringify({ ...snapshot, items: Array(21).fill({}) }))).toThrow();
    expect(() => parseNotificationSnapshot(JSON.stringify({ ...snapshot, pagination: { ...snapshot.pagination, offset: 20 } }))).toThrow();
    expect(parseNotificationSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
