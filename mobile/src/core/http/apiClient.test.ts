import type { EnvironmentSnapshot } from "../config/environmentManager";
import { SessionTokenState } from "../session/tokenState";
import {
  ApiError,
  ApiNetworkError,
  JsonApiClient,
  RequestVisibilityError,
  StaleResponseError,
  resolveRequestUrl
} from "./apiClient";

const remoteEnvironment = Object.freeze({
  profile: "remote" as const,
  id: "remote:https://api.example.test/api/v1",
  apiBaseUrl: "https://api.example.test/api/v1",
  origin: "https://api.example.test",
  host: "api.example.test",
  isLocal: false
});

function success<T>(data: T): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function createHarness(fetchImplementation: jest.Mock) {
  let environmentSnapshot: EnvironmentSnapshot = {
    environment: remoteEnvironment,
    generation: 2,
    status: "ready"
  };
  const tokenState = new SessionTokenState();
  tokenState.setPending("secret-token", remoteEnvironment.id, 7, "user-1");
  tokenState.accept("user-1", 7);
  const unauthorized = jest.fn();
  const client = new JsonApiClient({
    getEnvironmentSnapshot: () => environmentSnapshot,
    tokenSource: tokenState,
    fetch: fetchImplementation,
    onUnauthorized: unauthorized,
    safeRetryCount: 0
  });
  return {
    client,
    tokenState,
    unauthorized,
    setEnvironment: (next: EnvironmentSnapshot) => {
      environmentSnapshot = next;
    }
  };
}

describe("JSON API client", () => {
  it("joins paths without duplicating /api/v1 and rejects host replacement", () => {
    expect(resolveRequestUrl(remoteEnvironment.apiBaseUrl, "/api/v1/projects")).toBe(
      "https://api.example.test/api/v1/projects"
    );
    expect(() =>
      resolveRequestUrl(remoteEnvironment.apiBaseUrl, "https://evil.test/projects")
    ).toThrow(RequestVisibilityError);
    expect(resolveRequestUrl(remoteEnvironment.apiBaseUrl, "/projects?limit=30&offset=10")).toBe(
      "https://api.example.test/api/v1/projects?limit=30&offset=10"
    );
    expect(() => resolveRequestUrl(remoteEnvironment.apiBaseUrl, "/projects#private")).toThrow(
      RequestVisibilityError
    );
  });

  it("omits bearer headers from public routes even when callers supply one", async () => {
    const fetchImplementation = jest.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBeNull();
      expect(headers.get("Accept")).toBe("application/json");
      expect(headers.get("Content-Type")).toBe("application/json");
      return success({ token: "next" });
    });
    const { client } = createHarness(fetchImplementation);

    await client.public.post("/auth/login", { email: "a@example.test" }, {
      headers: { Authorization: "Bearer must-not-leak" }
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("requires callers to use the correct public/authenticated boundary", async () => {
    const { client } = createHarness(jest.fn());
    await expect(client.authenticated.post("/auth/login", {})).rejects.toBeInstanceOf(
      RequestVisibilityError
    );
    await expect(client.public.get("/projects")).rejects.toBeInstanceOf(
      RequestVisibilityError
    );
  });

  it("parses structured errors and reports the captured unauthorized context", async () => {
    const fetchImplementation = jest.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "TOKEN_EXPIRED",
            message: "Please sign in again.",
            fields: { token: "expired" }
          }
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    );
    const { client, unauthorized } = createHarness(fetchImplementation);

    await expect(client.authenticated.get("/auth/me")).rejects.toEqual(
      new ApiError(401, "TOKEN_EXPIRED", "Please sign in again.", {
        token: "expired"
      })
    );
    expect(unauthorized).toHaveBeenCalledWith({
      token: "secret-token",
      environmentId: remoteEnvironment.id,
      environmentGeneration: 2,
      sessionGeneration: 7
    });
  });

  it("never retries a non-idempotent mutation after an ambiguous network failure", async () => {
    const fetchImplementation = jest.fn(async () => {
      throw new TypeError("offline");
    });
    const { client } = createHarness(fetchImplementation);

    await expect(
      client.authenticated.post("/projects", { name: "Project" }, { safeRetryCount: 2 })
    ).rejects.toBeInstanceOf(ApiNetworkError);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects a delayed success after the environment generation changes", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchImplementation = jest.fn(
      () => new Promise<Response>((resolve) => (resolveResponse = resolve))
    );
    const harness = createHarness(fetchImplementation);
    const request = harness.client.authenticated.get("/auth/me");
    harness.setEnvironment({
      environment: remoteEnvironment,
      generation: 3,
      status: "ready"
    });
    resolveResponse(success({ id: "old-user" }));

    await expect(request).rejects.toBeInstanceOf(StaleResponseError);
  });

  it("rejects a response when the environment changes during JSON parsing", async () => {
    let resolveBody!: (value: unknown) => void;
    let markParsing!: () => void;
    const body = new Promise<unknown>((resolve) => (resolveBody = resolve));
    const parsing = new Promise<void>((resolve) => (markParsing = resolve));
    const fetchImplementation = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: () => {
        markParsing();
        return body;
      }
    }) as Response);
    const harness = createHarness(fetchImplementation);
    const request = harness.client.authenticated.get("/auth/me");
    await parsing;
    harness.setEnvironment({
      environment: remoteEnvironment,
      generation: 3,
      status: "ready"
    });
    resolveBody({ data: { id: "old-user" } });

    await expect(request).rejects.toBeInstanceOf(StaleResponseError);
  });
});
