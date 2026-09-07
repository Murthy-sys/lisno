import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { beginApiRequest, requestActivity } from "./requestActivity";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

afterEach(() => {
  expect(requestActivity.getSnapshot()).toBe(0);
});

describe("API request activity", () => {
  it("keeps concurrent public and authenticated operations pending until each settles", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const read = apiClient.get("/example");
    const save = apiClient.postPublic("/public-example", { value: 2 });
    expect(requestActivity.getSnapshot()).toBe(2);

    second.resolve(Response.json({ data: { saved: true } }));
    await save;
    expect(requestActivity.getSnapshot()).toBe(1);

    const rejected = expect(read).rejects.toThrow("Network failure");
    first.reject(new TypeError("Network failure"));
    await rejected;
    expect(requestActivity.getSnapshot()).toBe(0);
  });

  it.each([
    ["get", () => apiClient.get("/example")],
    ["post", () => apiClient.post("/example", {})],
    ["public post", () => apiClient.postPublic("/example", {})],
    ["patch", () => apiClient.patch("/example", {})],
    ["put", () => apiClient.put("/example", {})],
    ["delete", () => apiClient.delete("/example")],
    ["multipart", () => apiClient.postMultipart("/example", new FormData())]
  ])("keeps %s active while its response body is still being read", async (_name, start) => {
    const body = deferred<{ data: { ready: boolean } }>();
    const response = Response.json({ data: {} });
    const parse = vi.spyOn(response, "json").mockReturnValue(body.promise);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response);

    const operation = start();
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
    expect(requestActivity.getSnapshot()).toBe(1);
    body.resolve({ data: { ready: true } });
    await expect(operation).resolves.toEqual({ ready: true });
  });

  it("keeps a download active until its blob is ready", async () => {
    const body = deferred<Blob>();
    const response = new Response(null, {
      headers: { "Content-Disposition": 'attachment; filename="example.pdf"' }
    });
    const parse = vi.spyOn(response, "blob").mockReturnValue(body.promise);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response);
    const download = apiClient.getBlob("/example.pdf");
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
    expect(requestActivity.getSnapshot()).toBe(1);
    const blob = new Blob(["example"]);
    body.resolve(blob);
    await expect(download).resolves.toEqual({ blob, filename: "example.pdf" });
  });

  it("waits for error details before clearing a failed request", async () => {
    const body = deferred<unknown>();
    const response = new Response(null, { status: 400 });
    const parse = vi.spyOn(response, "json").mockReturnValue(body.promise);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response);
    const failed = expect(apiClient.get("/example")).rejects.toMatchObject({
      status: 400, code: "INVALID_VALUE"
    });
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
    expect(requestActivity.getSnapshot()).toBe(1);
    body.resolve({ error: { code: "INVALID_VALUE", message: "Check the value." } });
    await failed;
  });

  it.each([
    ["network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["abort", () => Promise.reject(new DOMException("Cancelled", "AbortError"))],
    ["malformed JSON", () => Promise.resolve(new Response("not JSON"))],
    ["non-JSON error", () => Promise.resolve(new Response("Unavailable", { status: 503 }))]
  ])("clears activity after %s", async (_name, response) => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(response);
    await expect(apiClient.get("/example")).rejects.toHaveProperty("message");
  });

  it("clears activity when request serialization fails before fetch", async () => {
    const body: { self?: unknown } = {};
    body.self = body;
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(apiClient.post("/example", body)).rejects.toBeInstanceOf(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("releases once and stops notifying unsubscribed consumers", () => {
    const listener = vi.fn();
    const unsubscribe = requestActivity.subscribe(listener);
    const finish = beginApiRequest();
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    finish();
    finish();
    expect(listener).toHaveBeenCalledOnce();
  });
});
