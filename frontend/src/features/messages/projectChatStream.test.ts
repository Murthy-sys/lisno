import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { ChatSseParser, runProjectChatStream, type SseFrame } from "./projectChatStream";

afterEach(() => vi.useRealTimers());
const bytes = (text: string) => new TextEncoder().encode(text);
describe("SSE parser", () => {
  it("parses byte-by-byte Unicode, CRLF, comments, IDs, and multiline data", () => {
    const frames: SseFrame[] = [];
    const parser = new ChatSseParser(frame => frames.push(frame));
    const input = bytes(": heartbeat\r\nevent: chat\r\nid: event-1\r\ndata: {\"text\":\"नमस्ते 👋\",\r\ndata: \"ok\":true}\r\n\r\n");
    for (const byte of input) parser.push(new Uint8Array([byte]));
    parser.finish();
    expect(frames).toEqual([{ event: "chat", id: "event-1", data: '{"text":"नमस्ते 👋",\n"ok":true}' }]);
  });
  it("handles CR-only separators and ignores partial frames at EOF", () => {
    const frames: SseFrame[] = [];
    const parser = new ChatSseParser(frame => frames.push(frame));
    parser.push(bytes("event: state\rdata: live\r\revent: chat\ndata: incomplete"));
    parser.finish();
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe("live");
  });
  it("rejects unbounded frames and invalid UTF-8", () => {
    expect(() => new ChatSseParser(() => {}).push(bytes("data: " + "x".repeat(1024 * 1024)))).toThrow();
    expect(() => new ChatSseParser(() => {}).push(new Uint8Array([0xff]))).toThrow();
  });
});
describe("authenticated live recovery", () => {
  it("delivers project typing without changing the durable replay cursor", async () => {
    vi.useFakeTimers();
    const snapshot = { projectId: "project-a", serverTime: "2026-09-16T10:00:00Z", participants: [{ userId: "designer-a", name: "Priya", expiresAt: "2026-09-16T10:00:08Z" }] };
    const connect = vi.fn().mockResolvedValueOnce(new Response(`event: typing\ndata: ${JSON.stringify(snapshot)}\n\n`, { headers: { "content-type": "text/event-stream" } })).mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "Denied"));
    const onTyping = vi.fn(); const onBatch = vi.fn();
    const run = runProjectChatStream({ projectId: "project-a", cursor: "durable", signal: new AbortController().signal, onTyping, onBatch, onStatus: vi.fn(), onDenied: vi.fn(), connect });
    await vi.advanceTimersByTimeAsync(2000); await run;
    expect(onTyping).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(onBatch).not.toHaveBeenCalled();
    expect(connect.mock.calls[1][0]).toContain("cursor=durable");
  });
  it.each(["wrong-project", "duplicate-person", "invalid-expiry", "durable-id"])("rejects %s typing frames before exposing names", async scenario => {
    vi.useFakeTimers();
    const person = { userId: "designer-a", name: "Priya", expiresAt: scenario === "invalid-expiry" ? "invalid" : "2026-09-16T10:00:08Z" };
    const snapshot = { projectId: scenario === "wrong-project" ? "project-b" : "project-a", serverTime: "2026-09-16T10:00:00Z", participants: scenario === "duplicate-person" ? [person, person] : [person] };
    const connect = vi.fn().mockResolvedValueOnce(new Response(`${scenario === "durable-id" ? "id: not-a-message\n" : ""}event: typing\ndata: ${JSON.stringify(snapshot)}\n\n`, { headers: { "content-type": "text/event-stream" } })).mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "Denied"));
    const onTyping = vi.fn();
    const run = runProjectChatStream({ projectId: "project-a", cursor: "a", signal: new AbortController().signal, onTyping, onBatch: vi.fn(), onStatus: vi.fn(), onDenied: vi.fn(), connect });
    await vi.advanceTimersByTimeAsync(2000); await run;
    expect(onTyping).not.toHaveBeenCalled();
  });
  it("reconnects from an advancing empty batch cursor and stops on revocation", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const batch = { events: [], cursor: "advanced-private-cursor", hasMore: false, resync: false };
    const connect = vi.fn().mockResolvedValueOnce(new Response(`event: chat\ndata: ${JSON.stringify(batch)}\n\n`, { headers: { "content-type": "text/event-stream" } })).mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "Not found"));
    const onDenied = vi.fn(); const onBatch = vi.fn(); const onStatus = vi.fn();
    const running = runProjectChatStream({ projectId: "project-a", cursor: "initial", signal: controller.signal, onBatch, onStatus, onDenied, connect });
    await vi.advanceTimersByTimeAsync(2000);
    await running;
    expect(onBatch).toHaveBeenCalledWith(batch);
    expect(connect.mock.calls[1][0]).toContain("cursor=advanced-private-cursor");
    expect(onStatus).toHaveBeenLastCalledWith("denied");
    expect(onDenied).toHaveBeenCalledOnce();
  });
  it("aborts idle readers and leaves no reconnect timers", async () => {
    vi.useFakeTimers();
    const controller = new AbortController(); const cancel = vi.fn();
    const connect = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/event-stream" } }));
    const running = runProjectChatStream({ projectId: "project-a", cursor: "a", signal: controller.signal, onBatch: vi.fn(), onStatus: vi.fn(), onDenied: vi.fn(), connect });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort(); await running;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops a denied control event before subsequent message data", async () => {
    const controller = new AbortController(); const onDenied = vi.fn(); const onBatch = vi.fn();
    const connect = vi.fn().mockResolvedValue(new Response('event: state\ndata: {"status":"denied"}\n\nevent: chat\ndata: {"events":[],"cursor":"secret","hasMore":false,"resync":false}\n\n', { headers: { "content-type": "text/event-stream" } }));
    await runProjectChatStream({ projectId: "project-a", cursor: "a", signal: controller.signal, onBatch, onStatus: vi.fn(), onDenied, connect });
    expect(onDenied).toHaveBeenCalledOnce(); expect(onBatch).not.toHaveBeenCalled();
  });
  it("marks a non-streaming response unavailable after bounded failures", async () => {
    vi.useFakeTimers();
    const controller = new AbortController(); const statuses: string[] = [];
    const connect = vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" } }));
    const running = runProjectChatStream({ projectId: "project-a", cursor: "a", signal: controller.signal, onBatch: vi.fn(), onStatus: status => { statuses.push(status); if (status === "unavailable") controller.abort(); }, onDenied: vi.fn(), connect });
    await vi.advanceTimersByTimeAsync(20_000); await running;
    expect(statuses).toContain("unavailable"); expect(connect).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
  });
});
