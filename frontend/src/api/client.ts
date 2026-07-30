const TOKEN_KEY = "lisno.auth.token";
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");

export function resolveApiUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const absolute = normalizedBase.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  const origin = absolute?.[1] ?? "";
  const apiPath = (absolute?.[2] ?? normalizedBase).replace(/\/$/, "");
  if (path === apiPath || path.startsWith(`${apiPath}/`)) {
    return origin ? `${origin}${path}` : path;
  }
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${apiPath}${suffix}`;
}

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

function parseXhrApiError(status: number, responseText: string): ApiError {
  let body: ApiErrorBody | undefined;
  try {
    body = JSON.parse(responseText) as ApiErrorBody;
  } catch {
    // Non-JSON errors are normalized at this boundary.
  }

  return new ApiError(
    status,
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
  const url = resolveApiUrl(API_BASE_URL, path);
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
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PUT", body });
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
  postMultipartWithProgress<T>(
    path: string,
    body: FormData,
    onProgress: (percent: number) => void
  ): Promise<T> {
    const requestToken = tokenStorage.get();
    const url = resolveApiUrl(API_BASE_URL, path);

    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);

      const headers = buildHeaders(undefined, false, requestToken);
      headers.forEach((value, name) => xhr.setRequestHeader(name, value));

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress(Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100))));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve((JSON.parse(xhr.responseText) as ApiResponse<T>).data);
          } catch {
            reject(new ApiError(xhr.status, "REQUEST_FAILED", "The request could not be completed."));
          }
          return;
        }

        const error = parseXhrApiError(xhr.status, xhr.responseText);
        if (
          xhr.status === 401 &&
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
        reject(error);
      };

      xhr.onerror = xhr.onabort = () => {
        reject(new ApiError(0, "REQUEST_FAILED", "The request could not be completed."));
      };
      xhr.send(body);
    });
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
