const TOKEN_KEY = "lisno.auth.token";
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");

export interface ApiResponse<T> {
  data: T;
}

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: Pagination;
}

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const tokenStorage = {
  get(): string | null {
    return window.localStorage.getItem(TOKEN_KEY);
  },
  set(token: string): void {
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    window.localStorage.removeItem(TOKEN_KEY);
  }
};

type JsonRequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

async function parseApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Non-JSON errors are normalized at this boundary.
  }

  return new ApiError(
    response.status,
    body?.error?.code ?? "REQUEST_FAILED",
    body?.error?.message ?? "The request could not be completed.",
    body?.error?.fields
  );
}

function buildHeaders(
  headers: HeadersInit | undefined,
  hasJsonBody: boolean,
  token: string | null
): Headers {
  const result = new Headers(headers);

  if (token) result.set("Authorization", `Bearer ${token}`);
  if (hasJsonBody && !result.has("Content-Type")) {
    result.set("Content-Type", "application/json");
  }
  result.set("Accept", "application/json");
  return result;
}

async function fetchApi(
  path: string,
  options: RequestInit,
  requestToken: string | null
): Promise<Response> {
  const url = path === API_BASE_URL || path.startsWith(`${API_BASE_URL}/`)
    ? path
    : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await parseApiError(response);
    if (
      response.status === 401 &&
      requestToken !== null &&
      tokenStorage.get() === requestToken
    ) {
      tokenStorage.clear();
      window.dispatchEvent(
        new CustomEvent("lisno:unauthorized", {
          detail: { token: requestToken }
        })
      );
    }
    throw error;
  }

  return response;
}

async function request<T>(
  path: string,
  { body, headers, ...options }: JsonRequestOptions = {}
): Promise<T> {
  const hasBody = body !== undefined;
  const requestToken = tokenStorage.get();
  const response = await fetchApi(path, {
    ...options,
    headers: buildHeaders(headers, hasBody, requestToken),
    ...(hasBody ? { body: JSON.stringify(body) } : {})
  }, requestToken);
  const envelope = (await response.json()) as ApiResponse<T>;
  return envelope.data;
}

function filenameFromDisposition(disposition: string | null): string | undefined {
  if (!disposition) return undefined;

  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);

  return disposition.match(/filename="?([^";]+)"?/i)?.[1];
}

export const apiClient = {
  get<T>(path: string, options?: Omit<RequestInit, "body" | "method">): Promise<T> {
    return request<T>(path, { ...options, method: "GET" });
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "POST", body });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PATCH", body });
  },
  delete<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "DELETE", body });
  },
  async postMultipart<T>(path: string, body: FormData): Promise<T> {
    const requestToken = tokenStorage.get();
    const response = await fetchApi(path, {
      method: "POST",
      headers: buildHeaders(undefined, false, requestToken),
      body
    }, requestToken);
    const envelope = (await response.json()) as ApiResponse<T>;
    return envelope.data;
  },
  async getBlob(
    path: string
  ): Promise<{ blob: Blob; filename: string | undefined }> {
    const requestToken = tokenStorage.get();
    const response = await fetchApi(path, {
      method: "GET",
      headers: buildHeaders(undefined, false, requestToken)
    }, requestToken);
    return {
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get("Content-Disposition"))
    };
  }
};
