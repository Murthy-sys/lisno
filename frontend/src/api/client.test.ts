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

    await expect(staleRequest).rejects.toMatchObject({ status: 401 });
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

    await expect(upload).rejects.toMatchObject({ status: 401 });
    expect(tokenStorage.get()).toBe("token-b");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("lisno:unauthorized", listener);
  });

  it.each(["onerror", "onabort", "ontimeout"] as const)("clears multipart activity on %s", async (event) => {
    const XMLHttpRequest = installFakeXMLHttpRequest();
    const upload = apiClient.postMultipartWithProgress("/design-versions", new FormData(), vi.fn());
    expect(requestActivity.getSnapshot()).toBe(1);
    XMLHttpRequest.instances[0][event]?.();
    await expect(upload).rejects.toBeInstanceOf(ApiError);
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
