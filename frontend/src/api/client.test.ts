import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import {
  ApiError,
  apiClient,
  tokenStorage,
  type PaginatedData
} from "./client";
import { server } from "../test/server";

describe("apiClient", () => {
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
});
