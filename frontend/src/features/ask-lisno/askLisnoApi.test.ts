import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient } from "../../api/client";
import { ASK_LISNO_DEADLINE_MS, askLisnoApi, type AskLisnoInput, type AskLisnoResponse } from "./askLisnoApi";

const input: AskLisnoInput = { projectId: null, message: "Show my projects", history: [] };
const response: AskLisnoResponse = { projectId: null, checkedAt: "2026-10-15T00:00:00Z", answer: { disclosurePolicy: "project-publication-v1", kind: "status", facts: [], candidates: [], missingInputs: [], commercial: null } };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Ask Lisno request lifecycle", () => {
  it("allows the server's generation budget, then aborts a stalled response without retrying its POST", async () => {
    const post = vi.spyOn(apiClient, "post").mockImplementation(() => new Promise(() => {}));
    const parent = new AbortController();
    const request = askLisnoApi.ask(input, parent.signal);
    const assertion = expect(request).rejects.toMatchObject({ status: 408, code: "ASSISTANT_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(90_000);
    const transport = post.mock.calls[0][2]!.signal!;
    expect(transport.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(ASK_LISNO_DEADLINE_MS - 90_000);
    await assertion;
    expect(transport.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds JSON body loading as part of the same request deadline", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as unknown as Response);
    const request = askLisnoApi.ask(input, new AbortController().signal);
    const assertion = expect(request).rejects.toMatchObject({ code: "ASSISTANT_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(ASK_LISNO_DEADLINE_MS);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("propagates parent cancellation even when the transport never settles and removes its listener", async () => {
    const post = vi.spyOn(apiClient, "post").mockImplementation(() => new Promise(() => {}));
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, "removeEventListener");
    const request = askLisnoApi.ask(input, parent.signal);
    const assertion = expect(request).rejects.toMatchObject({ name: "AbortError" });
    parent.abort();
    await assertion;
    expect(post.mock.calls[0][2]?.signal?.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not send an already cancelled request", async () => {
    const post = vi.spyOn(apiClient, "post");
    const parent = new AbortController(); parent.abort();
    await expect(askLisnoApi.ask(input, parent.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(post).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans its timer and parent listener after success", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue(response);
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, "removeEventListener");
    await expect(askLisnoApi.ask(input, parent.signal)).resolves.toEqual(response);
    expect(post).toHaveBeenCalledWith("/client/ask-lisno", input, { signal: expect.any(AbortSignal), showGlobalLoader: false });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    parent.abort();
    expect(post.mock.calls[0][2]?.signal?.aborted).toBe(false);
  });

  it("keeps a server error unchanged and does not retry it", async () => {
    const error = new ApiError(503, "ASSISTANT_UNAVAILABLE", "Not available");
    const post = vi.spyOn(apiClient, "post").mockRejectedValue(error);
    await expect(askLisnoApi.ask(input, new AbortController().signal)).rejects.toBe(error);
    expect(post).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
