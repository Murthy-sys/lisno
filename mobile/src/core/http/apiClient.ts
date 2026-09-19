import type { ApiErrorPayload, ApiSuccess, RequestScope } from "../../contracts/http";
import { PUBLIC_API_OPERATIONS } from "../../contracts/operations";
import type { CleanupRegistry } from "../config/cleanupRegistry";
import type { EnvironmentSnapshot } from "../config/environmentManager";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestToken {
  readonly token: string;
  readonly userId: string | null;
  readonly sessionGeneration: number;
  readonly environmentId: string;
  readonly accepted: boolean;
}

export interface RequestTokenSource {
  getRequestToken(): RequestToken | null;
}

export interface UnauthorizedRequestContext {
  readonly token: string;
  readonly environmentId: string;
  readonly environmentGeneration: number;
  readonly sessionGeneration: number;
}

export interface ApiClientDependencies {
  readonly getEnvironmentSnapshot: () => EnvironmentSnapshot;
  readonly tokenSource: RequestTokenSource;
  readonly fetch?: typeof fetch;
  readonly onUnauthorized?: ((context: UnauthorizedRequestContext) => void) | undefined;
  readonly defaultTimeoutMs?: number | undefined;
  readonly safeRetryCount?: number | undefined;
}

export interface JsonRequestOptions {
  readonly headers?: HeadersInit | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
  readonly safeRetryCount?: number | undefined;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Readonly<Record<string, string>> | undefined
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiNetworkError extends Error {
  readonly code = "NETWORK_ERROR";

  constructor(readonly cause: unknown) {
    super("The service could not be reached.");
    this.name = "ApiNetworkError";
  }
}

export class ApiTimeoutError extends Error {
  readonly code = "REQUEST_TIMEOUT";

  constructor() {
    super("The request timed out.");
    this.name = "ApiTimeoutError";
  }
}

export class ApiProtocolError extends Error {
  readonly code = "INVALID_API_RESPONSE";

  constructor() {
    super("The service returned an invalid response.");
    this.name = "ApiProtocolError";
  }
}

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";

  constructor() {
    super("Authentication is required for this request.");
    this.name = "AuthenticationRequiredError";
  }
}

export class RequestVisibilityError extends Error {
  readonly code = "INVALID_REQUEST_VISIBILITY";

  constructor(message: string) {
    super(message);
    this.name = "RequestVisibilityError";
  }
}

export class StaleResponseError extends Error {
  readonly code = "STALE_RESPONSE";

  constructor() {
    super("The response belongs to an obsolete session or backend environment.");
    this.name = "StaleResponseError";
  }
}

const PUBLIC_OPERATIONS = new Set<string>(PUBLIC_API_OPERATIONS);
const SAFE_METHODS = new Set<HttpMethod>(["GET"]);
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function normalizedOperationPath(path: string): string {
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? path;
  const withLeadingSlash = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  const withoutApiPrefix = withLeadingSlash.replace(/^\/api\/v1(?=\/|$)/i, "");
  return withoutApiPrefix || "/";
}

export function isPublicApiOperation(method: HttpMethod, path: string): boolean {
  return PUBLIC_OPERATIONS.has(`${method} ${normalizedOperationPath(path)}`);
}

export function resolveRequestUrl(apiBaseUrl: string, path: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) {
    throw new RequestVisibilityError("API requests cannot replace the configured host.");
  }
  if (path.includes("#")) {
    throw new RequestVisibilityError("API request paths cannot contain fragments.");
  }

  const base = apiBaseUrl.replace(/\/+$/, "");
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex >= 0 ? path.slice(0, queryIndex) : path;
  const query = queryIndex >= 0 ? path.slice(queryIndex) : "";
  const normalizedPath = normalizedOperationPath(pathname);
  return `${base}${normalizedPath}${query}`;
}

function buildHeaders(
  provided: HeadersInit | undefined,
  body: unknown,
  token: string | null
): Headers {
  const headers = new Headers(provided);
  headers.delete("Authorization");
  headers.set("Accept", "application/json");
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseErrorPayload(value: unknown): ApiErrorPayload | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const { code, message, fields } = value.error;
  if (typeof code !== "string" || typeof message !== "string") return null;
  if (fields !== undefined) {
    if (!isRecord(fields)) return null;
    for (const fieldValue of Object.values(fields)) {
      if (typeof fieldValue !== "string") return null;
    }
  }
  return value as unknown as ApiErrorPayload;
}

async function parseApiError(response: Response): Promise<ApiError> {
  let payload: ApiErrorPayload | null = null;
  try {
    payload = parseErrorPayload(await response.json());
  } catch {
    // Normalize non-JSON failures at this boundary.
  }
  return new ApiError(
    response.status,
    payload?.error.code ?? "REQUEST_FAILED",
    payload?.error.message ?? "The request could not be completed.",
    payload?.error.fields
  );
}

function parseSuccessEnvelope<T>(value: unknown): T {
  if (!isRecord(value) || !("data" in value)) throw new ApiProtocolError();
  return (value as unknown as ApiSuccess<T>).data;
}

class ActiveRequestRegistry {
  private readonly controllers = new Set<AbortController>();

  add(controller: AbortController): () => void {
    this.controllers.add(controller);
    return () => this.controllers.delete(controller);
  }

  cancelAll(): void {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  const abort = () => target.abort();
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

function sameRequestToken(left: RequestToken | null, right: RequestToken): boolean {
  return (
    left !== null &&
    left.token === right.token &&
    left.environmentId === right.environmentId &&
    left.sessionGeneration === right.sessionGeneration
  );
}

export class JsonApiClient {
  private readonly activeRequests = new ActiveRequestRegistry();
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly dependencies: ApiClientDependencies) {
    this.fetchImplementation = dependencies.fetch ?? fetch;
  }

  cancelAll(): void {
    this.activeRequests.cancelAll();
  }

  registerCleanup(cleanups: CleanupRegistry, name = "http-requests"): () => void {
    return cleanups.register(name, () => this.cancelAll(), 10);
  }

  readonly authenticated = {
    get: <T>(path: string, options?: JsonRequestOptions) =>
      this.request<T>("authenticated", "GET", path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: JsonRequestOptions) =>
      this.request<T>("authenticated", "POST", path, body, options),
    put: <T>(path: string, body?: unknown, options?: JsonRequestOptions) =>
      this.request<T>("authenticated", "PUT", path, body, options),
    patch: <T>(path: string, body?: unknown, options?: JsonRequestOptions) =>
      this.request<T>("authenticated", "PATCH", path, body, options),
    delete: <T>(path: string, body?: unknown, options?: JsonRequestOptions) =>
      this.request<T>("authenticated", "DELETE", path, body, options)
  };

  readonly public = {
    get: <T>(path: string, options?: JsonRequestOptions) =>
      this.request<T>("public", "GET", path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: JsonRequestOptions) =>
      this.request<T>("public", "POST", path, body, options)
  };

  private async request<T>(
    visibility: "public" | "authenticated",
    method: HttpMethod,
    path: string,
    body: unknown,
    options: JsonRequestOptions = {}
  ): Promise<T> {
    const publicOperation = isPublicApiOperation(method, path);
    if (visibility === "public" && !publicOperation) {
      throw new RequestVisibilityError("This endpoint is not registered as public.");
    }
    if (visibility === "authenticated" && publicOperation) {
      throw new RequestVisibilityError(
        "Public endpoints must use the public client so credentials are omitted."
      );
    }

    const environmentSnapshot = this.dependencies.getEnvironmentSnapshot();
    const requestToken =
      visibility === "authenticated"
        ? this.dependencies.tokenSource.getRequestToken()
        : null;
    if (
      visibility === "authenticated" &&
      (!requestToken || requestToken.environmentId !== environmentSnapshot.environment.id)
    ) {
      throw new AuthenticationRequiredError();
    }

    const scope: RequestScope = {
      environmentId: environmentSnapshot.environment.id,
      userId: requestToken?.userId ?? null,
      generation: environmentSnapshot.generation
    };
    const assertCurrentScope = (): void => {
      const currentEnvironment = this.dependencies.getEnvironmentSnapshot();
      if (
        currentEnvironment.environment.id !== scope.environmentId ||
        currentEnvironment.generation !== scope.generation ||
        (requestToken &&
          !sameRequestToken(this.dependencies.tokenSource.getRequestToken(), requestToken))
      ) {
        throw new StaleResponseError();
      }
    };
    const controller = new AbortController();
    const removeController = this.activeRequests.add(controller);
    const unlinkSignal = linkAbortSignal(options.signal, controller);
    const timeoutMs = options.timeoutMs ?? this.dependencies.defaultTimeoutMs ?? 30_000;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const safeRetries = SAFE_METHODS.has(method)
      ? Math.max(0, Math.min(options.safeRetryCount ?? this.dependencies.safeRetryCount ?? 1, 2))
      : 0;
    const url = resolveRequestUrl(environmentSnapshot.environment.apiBaseUrl, path);
    const init: RequestInit = {
      method,
      headers: buildHeaders(options.headers, body, requestToken?.token ?? null),
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    };

    try {
      for (let attempt = 0; ; attempt += 1) {
        let response: Response;
        try {
          response = await this.fetchImplementation(url, init);
        } catch (error) {
          if (controller.signal.aborted) {
            if (timedOut) throw new ApiTimeoutError();
            throw error;
          }
          if (attempt < safeRetries) continue;
          throw new ApiNetworkError(error);
        }

        if (!response.ok && RETRYABLE_STATUS.has(response.status) && attempt < safeRetries) {
          continue;
        }

        if (!response.ok) {
          const error = await parseApiError(response);
          assertCurrentScope();
          if (response.status === 401 && requestToken) {
            this.dependencies.onUnauthorized?.({
              token: requestToken.token,
              environmentId: scope.environmentId,
              environmentGeneration: scope.generation,
              sessionGeneration: requestToken.sessionGeneration
            });
          }
          throw error;
        }

        assertCurrentScope();
        if (response.status === 204) return undefined as T;
        const payload = await response.json();
        assertCurrentScope();
        return parseSuccessEnvelope<T>(payload);
      }
    } finally {
      clearTimeout(timeout);
      unlinkSignal();
      removeController();
    }
  }
}

export function createJsonApiClient(dependencies: ApiClientDependencies): JsonApiClient {
  return new JsonApiClient(dependencies);
}
