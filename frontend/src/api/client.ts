import { beginApiRequest } from "./requestActivity";

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

interface LoadingOptions {
  /** Disable the page indicator when the caller owns local or background feedback. */
  showGlobalLoader?: boolean;
}
interface UploadOptions extends LoadingOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
interface BlobOptions extends LoadingOptions {
  signal?: AbortSignal;
  maxBytes?: number;
  onProgress?: (progress: { loadedBytes: number; totalBytes: number | null }) => void;
}
type JsonRequestOptions = Omit<RequestInit, "body"> & LoadingOptions & { body?: unknown };
type RequestOptions = Omit<RequestInit, "body" | "method"> & LoadingOptions;

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
  { body, headers, showGlobalLoader = true, ...options }: JsonRequestOptions = {}
): Promise<T> {
  const finish = showGlobalLoader ? beginApiRequest() : () => {};
  try {
    const hasBody = body !== undefined;
    const requestToken = tokenStorage.get();
    const response = await fetchApi(path, {
      ...options,
      headers: buildHeaders(headers, hasBody, requestToken),
      ...(hasBody ? { body: JSON.stringify(body) } : {})
    }, requestToken);
    const envelope = (await response.json()) as ApiResponse<T>;
    return envelope.data;
  } finally {
    finish();
  }
}

async function publicRequest<T>(
  path: string,
  { body, headers, showGlobalLoader = true, ...options }: JsonRequestOptions = {}
): Promise<T> {
  const finish = showGlobalLoader ? beginApiRequest() : () => {};
  try {
    const hasBody = body !== undefined;
    const publicHeaders = new Headers(headers);
    publicHeaders.delete("Authorization");
    const response = await fetchApi(path, {
      ...options,
      headers: buildHeaders(publicHeaders, hasBody, null),
      ...(hasBody ? { body: JSON.stringify(body) } : {})
    }, null);
    const envelope = (await response.json()) as ApiResponse<T>;
    return envelope.data;
  } finally {
    finish();
  }
}

function filenameFromDisposition(disposition: string | null): string | undefined {
  if (!disposition) return undefined;

  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { /* Use the plain filename when malformed. */ }
  }

  return disposition.match(/filename="?([^";]+)"?/i)?.[1];
}

export const apiClient = {
  /** Authenticated long-lived response; the caller owns stream parsing and cleanup. */
  async stream(path: string, options: RequestOptions = {}): Promise<Response> {
    const { headers, showGlobalLoader: _showGlobalLoader, ...requestOptions } = options;
    const requestToken = tokenStorage.get();
    const streamHeaders = buildHeaders(headers, false, requestToken);
    streamHeaders.set("Accept", "text/event-stream");
    return fetchApi(path, {
      ...requestOptions,
      method: "GET",
      headers: streamHeaders,
      cache: "no-store"
    }, requestToken);
  },
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "GET" });
  },
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "POST", body });
  },
  postPublic<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return publicRequest<T>(path, { ...options, method: "POST", body });
  },
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "PATCH", body });
  },
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "PUT", body });
  },
  delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "DELETE", body });
  },
  async postMultipart<T>(path: string, body: FormData, { showGlobalLoader = true }: LoadingOptions = {}): Promise<T> {
    const finish = showGlobalLoader ? beginApiRequest() : () => {};
    try {
      const requestToken = tokenStorage.get();
      const response = await fetchApi(path, {
        method: "POST",
        headers: buildHeaders(undefined, false, requestToken),
        body
      }, requestToken);
      const envelope = (await response.json()) as ApiResponse<T>;
      return envelope.data;
    } finally {
      finish();
    }
  },
  postMultipartWithProgress<T>(
    path: string,
    body: FormData,
    onProgress: (percent: number) => void,
    { showGlobalLoader = true, signal, timeoutMs }: UploadOptions = {}
  ): Promise<T> {
    const requestToken = tokenStorage.get();
    const url = resolveApiUrl(API_BASE_URL, path);
    const finish = showGlobalLoader ? beginApiRequest() : () => {};
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Upload cancelled.", "AbortError"));
        return;
      }
      const xhr = new XMLHttpRequest();
      let settled = false;
      const cleanup = () => {
        settled = true;
        signal?.removeEventListener("abort", abort);
        xhr.upload.onprogress = null;
        xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
      };
      const fail = (error: unknown) => {
        if (settled) return;
        cleanup();
        reject(error);
      };
      const abort = () => {
        fail(new DOMException("Upload cancelled.", "AbortError"));
        xhr.abort();
      };
      xhr.open("POST", url);
      if (timeoutMs !== undefined) xhr.timeout = timeoutMs;

      const headers = buildHeaders(undefined, false, requestToken);
      headers.forEach((value, name) => xhr.setRequestHeader(name, value));

      xhr.upload.onprogress = (event) => {
        if (settled || signal?.aborted || !event.lengthComputable || event.total <= 0) return;
        onProgress(Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100))));
      };

      xhr.onload = () => {
        if (settled) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = (JSON.parse(xhr.responseText) as ApiResponse<T>).data;
            cleanup();
            resolve(data);
          } catch {
            fail(new ApiError(xhr.status, "REQUEST_FAILED", "The request could not be completed."));
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
        fail(error);
      };

      xhr.onerror = () => fail(new ApiError(0, "REQUEST_FAILED", "The request could not be completed."));
      xhr.onabort = () => fail(new DOMException("Upload cancelled.", "AbortError"));
      xhr.ontimeout = () => fail(new ApiError(0, "REQUEST_TIMEOUT", "The upload timed out. Please retry."));
      signal?.addEventListener("abort", abort, { once: true });
      try { xhr.send(body); } catch (error) { fail(error); }
    }).finally(finish);
  },
  async getBlob(
    path: string,
    { signal, showGlobalLoader = true, onProgress, maxBytes }: BlobOptions = {}
  ): Promise<{ blob: Blob; filename: string | undefined }> {
    const finish = showGlobalLoader ? beginApiRequest() : () => {};
    try {
      const requestToken = tokenStorage.get();
      const response = await fetchApi(path, {
        method: "GET",
        headers: buildHeaders(undefined, false, requestToken),
        signal
      }, requestToken);
      const sizeHeader = response.headers.get("Content-Length");
      const declaredSize = sizeHeader === null ? NaN : Number(sizeHeader);
      const totalBytes = Number.isSafeInteger(declaredSize) && declaredSize >= 0 ? declaredSize : null;
      const tooLarge = () => new ApiError(413, "FILE_TOO_LARGE", "This file exceeds the download size limit.");
      if (maxBytes !== undefined && totalBytes !== null && totalBytes > maxBytes) {
        await response.body?.cancel();
        throw tooLarge();
      }
      let blob: Blob;
      if (response.body && (onProgress || maxBytes !== undefined)) {
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let loadedBytes = 0;
        try {
          while (true) {
            signal?.throwIfAborted();
            const { done, value } = await reader.read();
            signal?.throwIfAborted();
            if (done) break;
            loadedBytes += value.byteLength;
            if (maxBytes !== undefined && loadedBytes > maxBytes) throw tooLarge();
            chunks.push(value);
            onProgress?.({ loadedBytes, totalBytes });
          }
          blob = new Blob(chunks, { type: response.headers.get("Content-Type") ?? "application/octet-stream" });
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        } finally { reader.releaseLock(); }
      } else {
        blob = await response.blob();
        signal?.throwIfAborted();
        if (maxBytes !== undefined && blob.size > maxBytes) throw tooLarge();
        onProgress?.({ loadedBytes: blob.size, totalBytes });
      }
      return {
        blob,
        filename: filenameFromDisposition(response.headers.get("Content-Disposition"))
      };
    } finally {
      finish();
    }
  }
};
