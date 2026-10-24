import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  apiClient,
  resolveApiUrl,
  tokenStorage,
  type PaginatedData
} from "./client";
import { server } from "../test/server";
import { requestActivity } from "./requestActivity";

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  readonly headers = new Map<string, string>();
  method = "";
  url = "";
  sentBody: Document | XMLHttpRequestBodyInit | null = null;
  timeout = 0;
  abort = vi.fn(() => this.onabort?.());

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  send(body: Document | XMLHttpRequestBodyInit | null): void {
    this.sentBody = body;
  }
}

function installFakeXMLHttpRequest(): typeof FakeXMLHttpRequest {
  FakeXMLHttpRequest.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
  return FakeXMLHttpRequest;
}

afterEach(() => {
  vi.unstubAllGlobals();
  expect(requestActivity.getSnapshot()).toBe(0);
});

describe("apiClient", () => {
  it("opens chat streams with header authentication, cancellation, and no global loading indicator", async () => {
    tokenStorage.set("synthetic-chat-stream-token");
    const controller = new AbortController();
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(": heartbeat\n\n", { headers: { "Content-Type": "text/event-stream" } }));
    const response = await apiClient.stream("/projects/a/chat/events?cursor=opaque", { signal: controller.signal });
    const [url, options] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("/api/v1/projects/a/chat/events?cursor=opaque");
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer synthetic-chat-stream-token");
    expect(new Headers(options?.headers).get("Accept")).toBe("text/event-stream");
    expect(options?.signal).toBe(controller.signal);
    expect(options?.cache).toBe("no-store");
    expect(requestActivity.getSnapshot()).toBe(0);
    expect(await response.text()).toBe(": heartbeat\n\n");
    tokenStorage.clear();
  });

  it("keeps automatic POST loading local and forwards cancellation to fetch", async () => {
    const controller = new AbortController();
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      expect(init?.signal).toBe(controller.signal);
      expect(init?.body).toBe(JSON.stringify({ quantity: "2" }));
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const pending = apiClient.post("/example-options", { quantity: "2" }, { signal: controller.signal, showGlobalLoader: false });
    expect(fetch).toHaveBeenCalledOnce();
    expect(requestActivity.getSnapshot()).toBe(0);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(requestActivity.getSnapshot()).toBe(0);
  });

  it("passes authenticated POST request options without changing its JSON body", async () => {
    tokenStorage.set("post-options-token");
    server.use(
      http.post("/api/v1/example-options", async ({ request }) => {
        expect(request.headers.get("authorization")).toBe(
          "Bearer post-options-token"
        );
        expect(request.headers.get("x-request-purpose")).toBe("invitation");
        expect(await request.json()).toEqual({ version: 2 });
        return HttpResponse.json({ data: { accepted: true } });
      })
    );

    await expect(
      apiClient.post<{ accepted: true }>(
        "/example-options",
        { version: 2 },
        { headers: { "X-Request-Purpose": "invitation" } }
      )
    ).resolves.toEqual({ accepted: true });
  });

  it("keeps public POST isolated from the stored session and its 401 handling", async () => {
    tokenStorage.set("existing-session-token");
    const listener = vi.fn();
    window.addEventListener("lisno:unauthorized", listener);
    server.use(
      http.post("/api/v1/auth/public-example", async ({ request }) => {
        expect(request.headers.get("authorization")).toBeNull();
        expect(await request.json()).toEqual({ token: "fragment-token" });
        return HttpResponse.json(
          {
            error: {
              code: "INVITATION_UNAVAILABLE",
              message: "This invitation is unavailable."
            }
          },
          { status: 401 }
        );
      })
    );

    await expect(
      apiClient.postPublic(
        "/auth/public-example",
        { token: "fragment-token" },
        { cache: "no-store", referrerPolicy: "no-referrer" }
      )
    ).rejects.toMatchObject({ status: 401, code: "INVITATION_UNAVAILABLE" });

    expect(tokenStorage.get()).toBe("existing-session-token");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("lisno:unauthorized", listener);
  });

  it("unwraps JSON data and attaches the persisted bearer token", async () => {
    tokenStorage.set("valid-token");
    server.use(
      http.get("/api/v1/example", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer valid-token");
        return HttpResponse.json({ data: { value: 42 } });
      })
    );

    await expect(apiClient.get<{ value: number }>("/example")).resolves.toEqual({
      value: 42
    });
  });

  it("preserves structured API error fields for form consumers", async () => {
    server.use(
      http.post("/api/v1/example", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Check the highlighted fields.",
              fields: { email: "Enter a valid email address." }
            }
          },
          { status: 400 }
        )
      )
    );

    const error = await apiClient.post("/example", {}).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Check the highlighted fields.",
      fields: { email: "Enter a valid email address." }
    });
  });

  it("clears the token and announces only an unauthorized response", async () => {
    tokenStorage.set("expired-token");
    const listener = vi.fn();
    window.addEventListener("lisno:unauthorized", listener);
    server.use(
      http.get("/api/v1/private", () =>
        HttpResponse.json(
          { error: { code: "TOKEN_EXPIRED", message: "Session expired." } },
          { status: 401 }
        )
      )
    );

    await expect(apiClient.get("/private")).rejects.toMatchObject({ status: 401 });

    expect(tokenStorage.get()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("lisno:unauthorized", listener);
  });

  it("ignores a stale unauthorized response after the request token was replaced", async () => {
    tokenStorage.set("token-a");
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(response);
    const listener = vi.fn();
    window.addEventListener("lisno:unauthorized", listener);

    const staleRequest = apiClient.get("/private");
    tokenStorage.set("token-b");
    resolveResponse(
      Response.json(
        { error: { code: "TOKEN_EXPIRED", message: "Session expired." } },
        { status: 401 }
      )
    );

    await expect(staleRequest).rejects.toMatchObject({ name: "AbortError" });
    expect(tokenStorage.get()).toBe("token-b");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("lisno:unauthorized", listener);
  });

  it("keeps a valid token when the server forbids one resource", async () => {
    tokenStorage.set("valid-token");
    server.use(
      http.get("/api/v1/other-role", () =>
        HttpResponse.json(
          { error: { code: "FORBIDDEN", message: "Access denied." } },
          { status: 403 }
        )
      )
    );

    await expect(apiClient.get("/other-role")).rejects.toMatchObject({ status: 403 });
    expect(tokenStorage.get()).toBe("valid-token");
  });

  it("returns list pagination without losing its metadata", async () => {
    server.use(
      http.get("/api/v1/projects", () =>
        HttpResponse.json({
          data: {
            items: [{ id: "project-1" }],
            pagination: { limit: 20, offset: 0, total: 25, hasMore: true }
          }
        })
      )
    );

    const page = await apiClient.get<PaginatedData<{ id: string }>>("/projects");

    expect(page).toEqual({
      items: [{ id: "project-1" }],
      pagination: { limit: 20, offset: 0, total: 25, hasMore: true }
    });
  });

  it("sends multipart bodies without overriding the browser content boundary", async () => {
    const body = new FormData();
    body.set("projectId", "project-1");
    body.set("file", new File(["plan"], "plan.pdf", { type: "application/pdf" }));
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_input, init) => {
      expect(init?.body).toBe(body);
      expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
      return Response.json({ data: { id: "version-1" } });
    });

    await expect(
      apiClient.postMultipart<{ id: string }>("/design-versions", body)
    ).resolves.toEqual({ id: "version-1" });
  });

  it.each([true, false])("reports multipart progress with global loading %s and unwraps its response", async (showGlobalLoader) => {
    tokenStorage.set("upload-token");
    const XMLHttpRequest = installFakeXMLHttpRequest();
    const body = new FormData();
    const progress = vi.fn();
    const upload = apiClient.postMultipartWithProgress<{ id: string }>(
      "/design-versions",
      body,
      progress,
      { showGlobalLoader }
    );
    const xhr = XMLHttpRequest.instances[0];

    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/v1/design-versions");
    expect(xhr.sentBody).toBe(body);
    expect(xhr.headers.get("authorization")).toBe("Bearer upload-token");
    expect(xhr.headers.get("accept")).toBe("application/json");
    expect(xhr.headers.has("content-type")).toBe(false);

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 3 } as ProgressEvent);
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 23, total: 20 } as ProgressEvent);
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: -1, total: 20 } as ProgressEvent);
    expect(requestActivity.getSnapshot()).toBe(showGlobalLoader ? 1 : 0);
    xhr.status = 201;
    xhr.responseText = JSON.stringify({ data: { id: "version-1" } });
    xhr.onload?.();

    await expect(upload).resolves.toEqual({ id: "version-1" });
    expect(requestActivity.getSnapshot()).toBe(0);
    expect(progress).toHaveBeenNthCalledWith(1, 67);
    expect(progress).toHaveBeenNthCalledWith(2, 100);
    expect(progress).toHaveBeenNthCalledWith(3, 0);
  });

  it("rejects failed multipart responses as ApiError and announces current unauthorized tokens", async () => {
    tokenStorage.set("expired-token");
    const XMLHttpRequest = installFakeXMLHttpRequest();
    const listener = vi.fn();
    window.addEventListener("lisno:unauthorized", listener);
    const upload = apiClient.postMultipartWithProgress("/design-versions", new FormData(), vi.fn());
    const xhr = XMLHttpRequest.instances[0];

    xhr.status = 401;
    xhr.responseText = JSON.stringify({
      error: { code: "TOKEN_EXPIRED", message: "Session expired." }
    });
    xhr.onload?.();

    const error = await upload.catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: "TOKEN_EXPIRED",
      message: "Session expired."
    });
    expect(tokenStorage.get()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("lisno:unauthorized", listener);
  });

  it("ignores a stale unauthorized multipart response after the request token was replaced", async () => {
    tokenStorage.set("token-a");
    const XMLHttpRequest = installFakeXMLHttpRequest();
    const listener = vi.fn();
    window.addEventListener("lisno:unauthorized", listener);
    const upload = apiClient.postMultipartWithProgress("/design-versions", new FormData(), vi.fn());
    const xhr = XMLHttpRequest.instances[0];

    tokenStorage.set("token-b");
    xhr.status = 401;
    xhr.responseText = JSON.stringify({
      error: { code: "TOKEN_EXPIRED", message: "Session expired." }
    });
    xhr.onload?.();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(tokenStorage.get()).toBe("token-b");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("lisno:unauthorized", listener);
  });

  it.each(["onerror", "onabort", "ontimeout"] as const)("clears multipart activity on %s", async (event) => {
    const XMLHttpRequest = installFakeXMLHttpRequest();
    const upload = apiClient.postMultipartWithProgress("/design-versions", new FormData(), vi.fn());
    expect(requestActivity.getSnapshot()).toBe(1);
    XMLHttpRequest.instances[0][event]?.();
    if (event === "onabort") await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    else await expect(upload).rejects.toBeInstanceOf(ApiError);
  });

  it("cancels uploads and ignores captured late progress without affecting a new token", async () => {
    const Xhr = installFakeXMLHttpRequest();
    const controller = new AbortController();
    const progress = vi.fn();
    const upload = apiClient.postMultipartWithProgress("/upload", new FormData(), progress, { signal: controller.signal, timeoutMs: 30_000 });
    const xhr = Xhr.instances[0];
    const lateProgress = xhr.upload.onprogress;
    expect(xhr.timeout).toBe(30_000);
    controller.abort();
    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    lateProgress?.({ lengthComputable: true, loaded: 10, total: 10 } as ProgressEvent);
    expect(progress).not.toHaveBeenCalled();
    expect(xhr.abort).toHaveBeenCalledOnce();
    expect(xhr.onload).toBeNull();
    expect(requestActivity.getSnapshot()).toBe(0);
  });

  it("does not construct an upload when its signal was already aborted", async () => {
    const Xhr = installFakeXMLHttpRequest();
    const controller = new AbortController();
    controller.abort();
    await expect(apiClient.postMultipartWithProgress("/upload", new FormData(), vi.fn(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(Xhr.instances).toHaveLength(0);
  });

  it("streams bounded quiet downloads with real byte progress and safe filename fallback", async () => {
    const progress = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: {
      "Content-Length": "3", "Content-Type": "application/zip", "Content-Disposition": "attachment; filename*=UTF-8''%bad%; filename=\"sample.zip\""
    } }));
    const download = await apiClient.getBlob("/download", { showGlobalLoader: false, maxBytes: 3, onProgress: progress });
    expect(download.blob.size).toBe(3);
    expect(download.filename).toBe("sample.zip");
    expect(progress).toHaveBeenLastCalledWith({ loadedBytes: 3, totalBytes: 3 });
    expect(requestActivity.getSnapshot()).toBe(0);
  });

  it.each([true, false])("rejects oversized downloads with a known content length: %s", async (known) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
      headers: known ? { "Content-Length": "3" } : {}
    }));
    await expect(apiClient.getBlob("/download", { maxBytes: 2 })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("clears multipart activity after an invalid response or synchronous send failure", async () => {
    const XMLHttpRequest = installFakeXMLHttpRequest();
    const upload = apiClient.postMultipartWithProgress("/design-versions", new FormData(), vi.fn());
    const xhr = XMLHttpRequest.instances[0];
    xhr.status = 201;
    xhr.responseText = "not JSON";
    xhr.onload?.();
    await expect(upload).rejects.toBeInstanceOf(ApiError);
    expect(requestActivity.getSnapshot()).toBe(0);

    vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementationOnce(() => {
      throw new Error("Could not send");
    });
    await expect(apiClient.postMultipartWithProgress("/design-versions", new FormData(), vi.fn()))
      .rejects.toThrow("Could not send");
  });

  it("returns authenticated downloads with the server filename", async () => {
    tokenStorage.set("valid-token");
    server.use(
      http.get("/api/v1/design-versions/version-1/download", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer valid-token");
        return new HttpResponse(new Blob(["plan"], { type: "application/pdf" }), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": "attachment; filename=\"floor-plan.pdf\""
          }
        });
      })
    );

    const download = await apiClient.getBlob(
      "/design-versions/version-1/download"
    );

    expect(download.filename).toBe("floor-plan.pdf");
    expect(download.blob.type).toBe("application/pdf");
  });

  it("does not duplicate the API prefix for opaque artifact URLs", async () => {
    tokenStorage.set("artifact-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (input, init) => {
      expect(String(input)).toBe("/api/v1/design-source-pages/page-1/image");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer artifact-token");
      return new Response(new Blob(["image"], { type: "image/png" }));
    });

    await apiClient.getBlob("/api/v1/design-source-pages/page-1/image");

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("resolves backend artifact paths against an absolute API origin without duplicating api/v1", () => {
    expect(resolveApiUrl(
      "http://localhost:3000/api/v1",
      "/api/v1/design-section-revisions/revision-1/image"
    )).toBe("http://localhost:3000/api/v1/design-section-revisions/revision-1/image");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("session-scoped response isolation", () => {
  it.each(["replace", "logout", "same-token", "external"])("rejects late JSON after %s", async change => {
    tokenStorage.set("synthetic-a");
    const gate = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(gate.promise);
    const request = apiClient.get("/private");
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    if (change === "replace") tokenStorage.set("synthetic-b");
    if (change === "logout") tokenStorage.clear();
    if (change === "same-token") { tokenStorage.clear(); tokenStorage.set("synthetic-a"); }
    if (change === "external") {
      window.localStorage.removeItem("lisno.auth.token");
      window.localStorage.setItem("lisno.auth.token", "synthetic-a");
      window.dispatchEvent(new StorageEvent("storage", { key: "lisno.auth.token", oldValue: "synthetic-a", newValue: null, storageArea: localStorage }));
    }
    const response = Response.json({ data: { private: "a" } });
    const cancel = vi.spyOn(response.body!, "cancel");
    gate.resolve(response);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([200, 400, 401])("fences asynchronous JSON body completion with status %s", async status => {
    tokenStorage.set("synthetic-a");
    const body = deferred<unknown>();
    const response = Response.json({}, { status });
    const json = vi.spyOn(response, "json").mockReturnValue(body.promise);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const listener = vi.fn();
    window.addEventListener("lisno:unauthorized", listener);
    const request = apiClient.get("/private");
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    tokenStorage.clear(); tokenStorage.set("synthetic-a");
    body.resolve({ data: "private-a", error: { message: "private-a" } });
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(tokenStorage.get()).toBe("synthetic-a");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("lisno:unauthorized", listener);
  });

  it("suppresses a stale parser error and preserves the new credential", async () => {
    tokenStorage.set("synthetic-a");
    const body = deferred<unknown>();
    const response = Response.json({});
    const json = vi.spyOn(response, "json").mockReturnValue(body.promise);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const pending = apiClient.get("/private");
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    tokenStorage.set("synthetic-b");
    body.reject(new Error("private parser detail"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each(["putMultipart", "postMultipart"] as const)("fences late %s body completion", async method => {
    tokenStorage.set("synthetic-a");
    const body = deferred<unknown>();
    const response = Response.json({});
    const json = vi.spyOn(response, "json").mockReturnValue(body.promise);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const pending = apiClient[method]("/private", new FormData());
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    tokenStorage.set("synthetic-b");
    body.resolve({ data: "private-a" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each(["progress", "success", "error", "unauthorized"])("fences stale XHR %s", async outcome => {
    tokenStorage.set("synthetic-a");
    const Xhr = installFakeXMLHttpRequest();
    const progress = vi.fn();
    const pending = apiClient.postMultipartWithProgress("/private", new FormData(), progress);
    const xhr = Xhr.instances[0];
    tokenStorage.clear(); tokenStorage.set("synthetic-a");
    if (outcome === "progress") xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 } as ProgressEvent);
    else if (outcome === "error") xhr.onerror?.();
    else { xhr.status = outcome === "success" ? 200 : 401; xhr.responseText = '{"data":"private-a"}'; xhr.onload?.(); }
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).not.toHaveBeenCalled();
    expect(tokenStorage.get()).toBe("synthetic-a");
    expect(xhr.abort).toHaveBeenCalledOnce();
  });

  it("rejects a stale unbounded download after its body finishes", async () => {
    tokenStorage.set("synthetic-a");
    const body = deferred<Blob>();
    const response = new Response();
    const blob = vi.spyOn(response, "blob").mockReturnValue(body.promise);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const pending = apiClient.getBlob("/private");
    await vi.waitFor(() => expect(blob).toHaveBeenCalledOnce());
    tokenStorage.set("synthetic-b");
    body.resolve(new Blob(["private-a"]));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each(["download", "events"])("cancels stale streamed %s chunks without exposing progress or data", async kind => {
    tokenStorage.set("synthetic-a");
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancelled = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel: cancelled }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const progress = vi.fn();
    const pending = kind === "download" ? apiClient.getBlob("/private", { maxBytes: 100, onProgress: progress }) : apiClient.stream("/private").then(value => value.text());
    await Promise.resolve(); await Promise.resolve();
    tokenStorage.set("synthetic-b");
    controller.enqueue(new Uint8Array([1, 2, 3]));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("keeps public auth/token calls unbound while credentials change", async () => {
    tokenStorage.set("synthetic-a");
    const gate = deferred<Response>();
    const fetch = vi.spyOn(globalThis, "fetch").mockReturnValue(gate.promise);
    const pending = apiClient.postPublic("/auth/public", {}, { headers: { Authorization: "Bearer unwanted" } });
    tokenStorage.set("synthetic-b");
    gate.resolve(Response.json({ data: { accepted: true } }));
    await expect(pending).resolves.toEqual({ accepted: true });
    expect(new Headers(fetch.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
  });
});
