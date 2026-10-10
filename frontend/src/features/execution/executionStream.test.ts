import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { runExecutionStream } from "./executionStream";

afterEach(() => vi.useRealTimers());
const streamResponse = (chunks: string[]) => new Response(new ReadableStream({
  start(controller) { for (const value of chunks) controller.enqueue(new TextEncoder().encode(value)); controller.close(); }
}), { headers: { "content-type": "text/event-stream" } });

describe("execution stream", () => {
  it("handles fragmented committed events and aborts without reconnecting", async () => {
    const controller = new AbortController(); const status = vi.fn(); const changed = vi.fn(() => controller.abort());
    const connect = vi.fn(async () => streamResponse(['event: exec', 'ution\ndata: {"revision":"committed-2"}\n\n']));
    await runExecutionStream({ signal: controller.signal, onStatus: status, onChange: changed, onDenied: vi.fn(), connect });
    expect(changed).toHaveBeenCalledTimes(1); expect(status).toHaveBeenCalledWith("live"); expect(connect).toHaveBeenCalledTimes(1);
  });
  it("clears identity-scoped work and stops on an access denial frame", async () => {
    const denied = vi.fn(); const changed = vi.fn(); const status = vi.fn();
    await runExecutionStream({ signal: new AbortController().signal, onStatus: status, onChange: changed, onDenied: denied,
      connect: vi.fn(async () => streamResponse(['event: state\ndata: {"status":"denied"}\n\n'])) });
    expect(denied).toHaveBeenCalledOnce(); expect(changed).not.toHaveBeenCalled(); expect(status).toHaveBeenLastCalledWith("denied");
  });
  it("does not retry a revoked HTTP session", async () => {
    const denied = vi.fn(); const connect = vi.fn(async () => { throw new ApiError(403, "EXECUTION_NOT_FOUND", "Unavailable"); });
    await runExecutionStream({ signal: new AbortController().signal, onStatus: vi.fn(), onChange: vi.fn(), onDenied: denied, connect });
    expect(denied).toHaveBeenCalledOnce(); expect(connect).toHaveBeenCalledOnce();
  });
  it("falls back after an unavailable transport and cancels its retry timer", async () => {
    vi.useFakeTimers();
    const controller = new AbortController(); const status = vi.fn((value: string) => { if (value === "polling") controller.abort(); });
    const connect = vi.fn(async () => { throw new Error("offline"); });
    await runExecutionStream({ signal: controller.signal, onStatus: status, onChange: vi.fn(), onDenied: vi.fn(), connect });
    expect(status).toHaveBeenCalledWith("polling"); expect(connect).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
