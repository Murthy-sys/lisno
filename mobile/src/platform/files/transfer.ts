import { File, Paths, UploadType } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { CleanupRegistry } from "../../core/config/cleanupRegistry";
import { resolveConfiguredResourceUrl } from "./resourceUrl";

export interface AuthenticatedResourceContext {
  readonly apiBaseUrl: string;
  readonly environmentId: string;
  readonly environmentGeneration: number;
  readonly userId: string;
  readonly sessionGeneration: number;
  readonly token: string;
}

export interface AuthenticatedResourceProvider {
  getAuthenticatedResourceContext(): AuthenticatedResourceContext | null;
  isCurrent(context: AuthenticatedResourceContext): boolean;
}

export interface ResourceEnvironmentSnapshot {
  readonly environment: {
    readonly id: string;
    readonly apiBaseUrl: string;
  };
  readonly generation: number;
}

export interface ResourceTokenSnapshot {
  readonly token: string;
  readonly userId: string | null;
  readonly sessionGeneration: number;
  readonly environmentId: string;
  readonly accepted: boolean;
}

export function createAuthenticatedResourceProvider(input: {
  readonly getEnvironmentSnapshot: () => ResourceEnvironmentSnapshot;
  readonly getRequestToken: () => ResourceTokenSnapshot | null;
}): AuthenticatedResourceProvider {
  const current = (): AuthenticatedResourceContext | null => {
    const environment = input.getEnvironmentSnapshot();
    const token = input.getRequestToken();
    if (
      !token?.accepted ||
      !token.userId ||
      token.environmentId !== environment.environment.id
    ) {
      return null;
    }
    return Object.freeze({
      apiBaseUrl: environment.environment.apiBaseUrl,
      environmentId: environment.environment.id,
      environmentGeneration: environment.generation,
      userId: token.userId,
      sessionGeneration: token.sessionGeneration,
      token: token.token
    });
  };

  return {
    getAuthenticatedResourceContext: current,
    isCurrent(candidate) {
      const next = current();
      return (
        next !== null &&
        next.apiBaseUrl === candidate.apiBaseUrl &&
        next.environmentId === candidate.environmentId &&
        next.environmentGeneration === candidate.environmentGeneration &&
        next.userId === candidate.userId &&
        next.sessionGeneration === candidate.sessionGeneration &&
        next.token === candidate.token
      );
    }
  };
}

export interface TransferProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number | null;
  readonly fraction: number | null;
}

export interface UploadRequest {
  readonly path: string;
  readonly fileUri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fieldName?: string | undefined;
  readonly parameters?: Readonly<Record<string, string>> | undefined;
  readonly method?: "POST" | "PUT" | "PATCH" | undefined;
  readonly maxBytes: number;
  readonly deleteInputWhenFinished?: boolean | undefined;
  readonly onProgress?: ((progress: TransferProgress) => void) | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface DownloadRequest {
  readonly path: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly maxBytes: number;
  readonly onProgress?: ((progress: TransferProgress) => void) | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface CancellableTransfer<T> {
  readonly result: Promise<T>;
  cancel(): void;
}

export interface DownloadedArtifact {
  readonly uri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  share(options?: { readonly cleanupAfterShare?: boolean | undefined }): Promise<void>;
  release(): Promise<void>;
}

interface NativeTask<T> {
  run(): Promise<T>;
  cancel(): void;
  release(): void;
}

interface NativeUploadResult {
  readonly status: number;
  readonly body: string;
}

interface NativeDownloadResult {
  readonly uri: string;
  readonly sizeBytes: number;
}

export interface NativeTransferAdapter {
  stat(uri: string): Promise<{ readonly exists: boolean; readonly sizeBytes: number | null }>;
  createUpload(input: {
    readonly url: string;
    readonly fileUri: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly fieldName: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly parameters: Readonly<Record<string, string>>;
    readonly method: "POST" | "PUT" | "PATCH";
    readonly onProgress: (loadedBytes: number, totalBytes: number | null) => void;
  }): NativeTask<NativeUploadResult>;
  createDownload(input: {
    readonly url: string;
    readonly destinationUri: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly onProgress: (loadedBytes: number, totalBytes: number | null) => void;
  }): NativeTask<NativeDownloadResult>;
  makePrivateDestination(fileName: string): string;
  delete(uri: string): Promise<void>;
  share(uri: string, mimeType: string): Promise<void>;
}

export class TransferAuthenticationError extends Error {
  readonly code = "TRANSFER_AUTHENTICATION_REQUIRED";

  constructor() {
    super("Authentication is required for this file transfer.");
    this.name = "TransferAuthenticationError";
  }
}

export class TransferSizeError extends Error {
  readonly code = "TRANSFER_SIZE_LIMIT";

  constructor(readonly maxBytes: number) {
    super(`The file exceeds the ${maxBytes} byte transfer limit.`);
    this.name = "TransferSizeError";
  }
}

export class TransferCancelledError extends Error {
  readonly code = "TRANSFER_CANCELLED";

  constructor() {
    super("The file transfer was cancelled.");
    this.name = "TransferCancelledError";
  }
}

export class TransferHttpError extends Error {
  readonly code: string;

  constructor(
    readonly status: number,
    code: string,
    message: string
  ) {
    super(message);
    this.name = "TransferHttpError";
    this.code = code;
  }
}

export class StaleTransferError extends Error {
  readonly code = "STALE_TRANSFER";

  constructor() {
    super("The transfer belongs to an obsolete session or backend environment.");
    this.name = "StaleTransferError";
  }
}

function safeFileName(fileName: string): string {
  const safe = fileName
    .trim()
    .replace(/[^A-Za-z0-9._-]/gu, "_")
    .replace(/^\.+/u, "")
    .slice(0, 180);
  if (!safe) throw new Error("A safe file name is required.");
  return safe;
}

function progress(
  loadedBytes: number,
  totalBytes: number | null
): TransferProgress {
  const normalizedTotal = totalBytes !== null && totalBytes > 0 ? totalBytes : null;
  return Object.freeze({
    loadedBytes: Math.max(0, loadedBytes),
    totalBytes: normalizedTotal,
    fraction:
      normalizedTotal === null
        ? null
        : Math.max(0, Math.min(1, loadedBytes / normalizedTotal))
  });
}

function parseUploadResponse<T>(result: NativeUploadResult): T {
  let body: unknown;
  try {
    body = JSON.parse(result.body) as unknown;
  } catch {
    body = null;
  }
  if (result.status < 200 || result.status >= 300) {
    const error =
      typeof body === "object" && body !== null &&
      typeof (body as { error?: unknown }).error === "object" &&
      (body as { error: object }).error !== null
        ? (body as { error: { code?: unknown; message?: unknown } }).error
        : null;
    throw new TransferHttpError(
      result.status,
      typeof error?.code === "string" ? error.code : "TRANSFER_FAILED",
      typeof error?.message === "string"
        ? error.message
        : "The file transfer could not be completed."
    );
  }
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new TransferHttpError(
      result.status,
      "INVALID_TRANSFER_RESPONSE",
      "The service returned an invalid upload response."
    );
  }
  return (body as { data: T }).data;
}

function createExpoTransferAdapter(): NativeTransferAdapter {
  return {
    async stat(uri) {
      const file = new File(uri);
      return { exists: file.exists, sizeBytes: file.size };
    },
    createUpload(input) {
      const task = new File(input.fileUri).createUploadTask(input.url, {
        httpMethod: input.method,
        uploadType: UploadType.MULTIPART,
        headers: { ...input.headers },
        fieldName: input.fieldName,
        mimeType: input.mimeType,
        parameters: { ...input.parameters },
        sessionType: "foreground",
        onProgress: ({ bytesSent, totalBytes }) =>
          input.onProgress(bytesSent, totalBytes > 0 ? totalBytes : null)
      });
      return {
        run: () => task.uploadAsync(),
        cancel: () => task.cancel(),
        release: () => task.release()
      };
    },
    createDownload(input) {
      const destination = new File(input.destinationUri);
      const task = File.createDownloadTask(input.url, destination, {
        headers: { ...input.headers },
        sessionType: "foreground",
        onProgress: ({ bytesWritten, totalBytes }) =>
          input.onProgress(bytesWritten, totalBytes > 0 ? totalBytes : null)
      });
      return {
        async run() {
          const file = await task.downloadAsync();
          if (!file || file.size === null) throw new TransferCancelledError();
          return { uri: file.uri, sizeBytes: file.size };
        },
        cancel: () => task.cancel(),
        release: () => task.release()
      };
    },
    makePrivateDestination(fileName) {
      return new File(
        Paths.cache,
        `lisno-private-${Date.now()}-${Math.random().toString(36).slice(2)}-${safeFileName(fileName)}`
      ).uri;
    },
    async delete(uri) {
      const file = new File(uri);
      if (file.exists) file.delete();
    },
    async share(uri, mimeType) {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing is unavailable on this device.");
      }
      await Sharing.shareAsync(uri, { mimeType });
    }
  };
}

export class NativeTransferManager {
  private readonly tasks = new Set<NativeTask<unknown>>();
  private readonly releasedTasks = new WeakSet<object>();
  private readonly artifacts = new Set<string>();
  private readonly unregisterCleanup: () => void;

  constructor(
    private readonly resources: AuthenticatedResourceProvider,
    cleanups: CleanupRegistry,
    private readonly native: NativeTransferAdapter = createExpoTransferAdapter()
  ) {
    this.unregisterCleanup = cleanups.register(
      "native-file-transfers",
      () => this.cleanup(),
      12
    );
  }

  upload<T>(request: UploadRequest): CancellableTransfer<T> {
    if (request.maxBytes < 1) throw new Error("The upload byte limit must be positive.");
    if (!/^(?:file|content):\/\//u.test(request.fileUri)) {
      throw new Error("Only local files can be uploaded.");
    }
    const context = this.requireContext();
    const url = resolveConfiguredResourceUrl(context.apiBaseUrl, request.path);
    let sizeExceeded = false;
    let cancelled = false;
    let task: NativeTask<NativeUploadResult> | null = null;
    const abort = () => {
      cancelled = true;
      task?.cancel();
    };
    if (request.signal?.aborted) abort();
    else request.signal?.addEventListener("abort", abort, { once: true });

    const result = (async () => {
      try {
        const file = await this.native.stat(request.fileUri);
        if (!file.exists) throw new Error("The selected file is no longer available.");
        if (file.sizeBytes !== null && file.sizeBytes > request.maxBytes) {
          throw new TransferSizeError(request.maxBytes);
        }
        if (cancelled) throw new TransferCancelledError();
        task = this.native.createUpload({
          url,
          fileUri: request.fileUri,
          headers: { Authorization: `Bearer ${context.token}` },
          fieldName: request.fieldName ?? "file",
          fileName: safeFileName(request.fileName),
          mimeType: request.mimeType,
          parameters: request.parameters ?? {},
          method: request.method ?? "POST",
          onProgress: (loadedBytes, totalBytes) => {
            if (
              loadedBytes > request.maxBytes ||
              (totalBytes !== null && totalBytes > request.maxBytes)
            ) {
              sizeExceeded = true;
              task?.cancel();
              return;
            }
            request.onProgress?.(progress(loadedBytes, totalBytes));
          }
        });
        this.tasks.add(task);
        const response = await task.run();
        if (sizeExceeded) throw new TransferSizeError(request.maxBytes);
        if (cancelled) throw new TransferCancelledError();
        if (!this.resources.isCurrent(context)) throw new StaleTransferError();
        return parseUploadResponse<T>(response);
      } catch (error) {
        if (sizeExceeded) throw new TransferSizeError(request.maxBytes);
        if (cancelled) throw new TransferCancelledError();
        throw error;
      } finally {
        request.signal?.removeEventListener("abort", abort);
        if (task) {
          this.tasks.delete(task);
          this.releaseTask(task);
        }
        if (request.deleteInputWhenFinished) {
          await this.native.delete(request.fileUri).catch(() => undefined);
        }
      }
    })();

    return { result, cancel: abort };
  }

  download(request: DownloadRequest): CancellableTransfer<DownloadedArtifact> {
    if (request.maxBytes < 1) throw new Error("The download byte limit must be positive.");
    const context = this.requireContext();
    const url = resolveConfiguredResourceUrl(context.apiBaseUrl, request.path);
    const destinationUri = this.native.makePrivateDestination(request.fileName);
    let sizeExceeded = false;
    let cancelled = false;
    let task: NativeTask<NativeDownloadResult> | null = null;
    const abort = () => {
      cancelled = true;
      task?.cancel();
    };
    if (request.signal?.aborted) abort();
    else request.signal?.addEventListener("abort", abort, { once: true });

    const result = (async () => {
      try {
        if (cancelled) throw new TransferCancelledError();
        task = this.native.createDownload({
          url,
          destinationUri,
          headers: { Authorization: `Bearer ${context.token}` },
          onProgress: (loadedBytes, totalBytes) => {
            if (
              loadedBytes > request.maxBytes ||
              (totalBytes !== null && totalBytes > request.maxBytes)
            ) {
              sizeExceeded = true;
              task?.cancel();
              return;
            }
            request.onProgress?.(progress(loadedBytes, totalBytes));
          }
        });
        this.tasks.add(task);
        const downloaded = await task.run();
        if (sizeExceeded || downloaded.sizeBytes > request.maxBytes) {
          throw new TransferSizeError(request.maxBytes);
        }
        if (cancelled) throw new TransferCancelledError();
        if (!this.resources.isCurrent(context)) throw new StaleTransferError();
        this.artifacts.add(downloaded.uri);
        return this.artifact(
          downloaded.uri,
          safeFileName(request.fileName),
          request.mimeType,
          downloaded.sizeBytes
        );
      } catch (error) {
        await this.native.delete(destinationUri).catch(() => undefined);
        if (sizeExceeded) throw new TransferSizeError(request.maxBytes);
        if (cancelled) throw new TransferCancelledError();
        throw error;
      } finally {
        request.signal?.removeEventListener("abort", abort);
        if (task) {
          this.tasks.delete(task);
          this.releaseTask(task);
        }
      }
    })();
    return { result, cancel: abort };
  }

  adoptPrivateArtifact(
    uri: string,
    fileName: string,
    mimeType: string,
    sizeBytes: number
  ): DownloadedArtifact {
    if (!uri.startsWith("file://")) {
      throw new Error("Only app-private files can be adopted.");
    }
    this.artifacts.add(uri);
    return this.artifact(uri, safeFileName(fileName), mimeType, sizeBytes);
  }

  async cleanup(): Promise<void> {
    for (const task of this.tasks) task.cancel();
    const tasks = [...this.tasks];
    this.tasks.clear();
    for (const task of tasks) this.releaseTask(task);
    const artifacts = [...this.artifacts];
    this.artifacts.clear();
    await Promise.allSettled(artifacts.map((uri) => this.native.delete(uri)));
  }

  async dispose(): Promise<void> {
    this.unregisterCleanup();
    await this.cleanup();
  }

  private requireContext(): AuthenticatedResourceContext {
    const context = this.resources.getAuthenticatedResourceContext();
    if (!context?.token || !context.userId) throw new TransferAuthenticationError();
    return context;
  }

  private releaseTask(task: NativeTask<unknown>): void {
    if (this.releasedTasks.has(task)) return;
    this.releasedTasks.add(task);
    task.release();
  }

  private artifact(
    uri: string,
    fileName: string,
    mimeType: string,
    sizeBytes: number
  ): DownloadedArtifact {
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      this.artifacts.delete(uri);
      await this.native.delete(uri);
    };
    return Object.freeze({
      uri,
      fileName,
      mimeType,
      sizeBytes,
      share: async (
        options: { readonly cleanupAfterShare?: boolean | undefined } = {}
      ) => {
        if (released || !this.artifacts.has(uri)) {
          throw new Error("The private artifact is no longer available.");
        }
        try {
          await this.native.share(uri, mimeType);
        } finally {
          if (options.cleanupAfterShare !== false) await release();
        }
      },
      release
    });
  }
}
