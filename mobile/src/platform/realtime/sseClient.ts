import NetInfo from "@react-native-community/netinfo";
import { fetch as expoFetch } from "expo/fetch";
import { AppState } from "react-native";

import type { CleanupRegistry } from "../../core/config/cleanupRegistry";
import type {
  AuthenticatedResourceContext,
  AuthenticatedResourceProvider
} from "../files/transfer";
import { resolveConfiguredResourceUrl } from "../files/resourceUrl";
import { SseParser, type ServerSentEvent } from "./sseParser";

export interface RealtimeLifecycleSnapshot {
  readonly active: boolean;
  readonly online: boolean;
}

export interface RealtimeLifecycle {
  getSnapshot(): RealtimeLifecycleSnapshot;
  subscribe(listener: (snapshot: RealtimeLifecycleSnapshot) => void): () => void;
}

export type SseConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "paused"
  | "reconnecting"
  | "denied"
  | "failed"
  | "stopped";

export interface SseStreamOptions {
  readonly path: string;
  readonly cursor?: string | null | undefined;
  readonly cursorTransport?: "header" | "query" | undefined;
  readonly cursorQueryParameter?: string | undefined;
  readonly deniedStatusCodes?: readonly number[] | undefined;
  readonly isDeniedEvent?: ((event: ServerSentEvent) => boolean) | undefined;
  readonly heartbeatTimeoutMs?: number | undefined;
  readonly maxBufferBytes?: number | undefined;
  readonly maxEventBytes?: number | undefined;
  readonly minReconnectMs?: number | undefined;
  readonly maxReconnectMs?: number | undefined;
  readonly maxReconnectAttempts?: number | undefined;
  readonly onEvent: (event: ServerSentEvent) => void;
  readonly onStateChange?: ((state: SseConnectionState) => void) | undefined;
  readonly onDenied?: (() => void) | undefined;
  readonly onResync?: ((cursor: string | null) => void | Promise<void>) | undefined;
  readonly onError?: ((error: unknown) => void) | undefined;
}

export interface SseStreamHandle {
  start(): void;
  stop(): void;
  getState(): SseConnectionState;
  getCursor(): string | null;
}

type SseFetch = (
  input: string,
  init: RequestInit
) => Promise<Response>;

class NativeRealtimeLifecycle implements RealtimeLifecycle {
  private snapshot: RealtimeLifecycleSnapshot = {
    active: AppState.currentState === "active",
    online: true
  };
  private readonly listeners = new Set<(snapshot: RealtimeLifecycleSnapshot) => void>();
  private appStateSubscription: { remove(): void } | null = null;
  private networkSubscription: (() => void) | null = null;

  getSnapshot = (): RealtimeLifecycleSnapshot => this.snapshot;

  subscribe(listener: (snapshot: RealtimeLifecycleSnapshot) => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.attach();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.detach();
    };
  }

  private attach(): void {
    this.appStateSubscription = AppState.addEventListener("change", (state) => {
      this.update({ ...this.snapshot, active: state === "active" });
    });
    this.networkSubscription = NetInfo.addEventListener((state) => {
      this.update({
        ...this.snapshot,
        online: state.isConnected !== false && state.isInternetReachable !== false
      });
    });
    void NetInfo.fetch().then((state) => {
      this.update({
        ...this.snapshot,
        online: state.isConnected !== false && state.isInternetReachable !== false
      });
    });
  }

  private detach(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.networkSubscription?.();
    this.networkSubscription = null;
  }

  private update(snapshot: RealtimeLifecycleSnapshot): void {
    if (
      snapshot.active === this.snapshot.active &&
      snapshot.online === this.snapshot.online
    ) {
      return;
    }
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export interface NativeSseClientDependencies {
  readonly resources: AuthenticatedResourceProvider;
  readonly cleanups: CleanupRegistry;
  readonly fetch?: SseFetch | undefined;
  readonly lifecycle?: RealtimeLifecycle | undefined;
}

export class NativeSseClient {
  private readonly streams = new Set<ManagedSseStream>();
  private readonly unregisterCleanup: () => void;
  private readonly fetchImplementation: SseFetch;
  private readonly lifecycle: RealtimeLifecycle;

  constructor(private readonly dependencies: NativeSseClientDependencies) {
    this.fetchImplementation = dependencies.fetch ?? (expoFetch as unknown as SseFetch);
    this.lifecycle = dependencies.lifecycle ?? new NativeRealtimeLifecycle();
    this.unregisterCleanup = dependencies.cleanups.register(
      "native-sse-streams",
      () => this.stopAll(),
      13
    );
  }

  createStream(options: SseStreamOptions): SseStreamHandle {
    const stream = new ManagedSseStream(
      this.dependencies.resources,
      this.fetchImplementation,
      this.lifecycle,
      options,
      () => this.streams.delete(stream)
    );
    this.streams.add(stream);
    return stream;
  }

  stopAll(): void {
    for (const stream of [...this.streams]) stream.stop();
    this.streams.clear();
  }

  dispose(): void {
    this.unregisterCleanup();
    this.stopAll();
  }
}

class ManagedSseStream implements SseStreamHandle {
  private state: SseConnectionState = "idle";
  private cursor: string | null;
  private lastDeliveredId: string | null = null;
  private started = false;
  private permanentlyStopped = false;
  private controller: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private serverRetryMs: number | null = null;
  private hasConnected = false;
  private boundScope: Pick<
    AuthenticatedResourceContext,
    "environmentId" | "environmentGeneration" | "userId" | "sessionGeneration"
  > | null = null;
  private readonly unsubscribeLifecycle: () => void;

  constructor(
    private readonly resources: AuthenticatedResourceProvider,
    private readonly fetchImplementation: SseFetch,
    private readonly lifecycle: RealtimeLifecycle,
    private readonly options: SseStreamOptions,
    private readonly onStop: () => void
  ) {
    this.cursor = options.cursor ?? null;
    this.unsubscribeLifecycle = lifecycle.subscribe(() => this.evaluateLifecycle());
  }

  start(): void {
    if (this.permanentlyStopped || this.started) return;
    this.started = true;
    this.evaluateLifecycle();
  }

  stop(): void {
    if (this.permanentlyStopped) return;
    this.permanentlyStopped = true;
    this.started = false;
    this.clearReconnect();
    this.controller?.abort();
    this.controller = null;
    this.unsubscribeLifecycle();
    this.setState("stopped");
    this.onStop();
  }

  getState(): SseConnectionState {
    return this.state;
  }

  getCursor(): string | null {
    return this.cursor;
  }

  private evaluateLifecycle(): void {
    if (!this.started || this.permanentlyStopped) return;
    const lifecycle = this.lifecycle.getSnapshot();
    if (!lifecycle.active || !lifecycle.online) {
      this.clearReconnect();
      this.controller?.abort();
      this.controller = null;
      this.setState("paused");
      return;
    }
    if (!this.controller && !this.reconnectTimer) {
      this.reconnectAttempts = 0;
      if (this.hasConnected) this.requestResync();
      void this.connect();
    }
  }

  private async connect(): Promise<void> {
    if (!this.started || this.permanentlyStopped) return;
    const lifecycle = this.lifecycle.getSnapshot();
    if (!lifecycle.active || !lifecycle.online) return;
    const context = this.resources.getAuthenticatedResourceContext();
    if (!context) {
      this.deny();
      return;
    }
    if (!this.boundScope) {
      this.boundScope = Object.freeze({
        environmentId: context.environmentId,
        environmentGeneration: context.environmentGeneration,
        userId: context.userId,
        sessionGeneration: context.sessionGeneration
      });
    } else if (
      this.boundScope.environmentId !== context.environmentId ||
      this.boundScope.environmentGeneration !== context.environmentGeneration ||
      this.boundScope.userId !== context.userId ||
      this.boundScope.sessionGeneration !== context.sessionGeneration
    ) {
      this.fail(new Error("The realtime stream belongs to an obsolete session."));
      return;
    }

    let url: string;
    try {
      url = resolveConfiguredResourceUrl(context.apiBaseUrl, this.options.path);
      if (this.cursor && this.options.cursorTransport === "query") {
        const parsed = new URL(url);
        parsed.searchParams.set(this.options.cursorQueryParameter ?? "cursor", this.cursor);
        url = parsed.toString();
      }
    } catch (error) {
      this.fail(error);
      return;
    }

    const controller = new AbortController();
    this.controller = controller;
    this.setState(this.hasConnected ? "reconnecting" : "connecting");
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatExpired = false;
    try {
      const headers = new Headers({
        Accept: "text/event-stream",
        Authorization: `Bearer ${context.token}`,
        "Cache-Control": "no-cache"
      });
      if (this.cursor && this.options.cursorTransport !== "query") {
        headers.set("Last-Event-ID", this.cursor);
      }
      const response = await this.fetchImplementation(url, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store"
      });
      if ((this.options.deniedStatusCodes ?? [401, 403]).includes(response.status)) {
        this.deny();
        return;
      }
      if (response.status === 409 || response.status === 410) {
        this.cursor = null;
        this.lastDeliveredId = null;
        await this.options.onResync?.(null);
        throw new Error("The realtime cursor is no longer available.");
      }
      if (!response.ok || !response.body) {
        throw new Error("The realtime service could not be reached.");
      }
      if (!this.resources.isCurrent(context)) throw new Error("The realtime session is stale.");

      this.hasConnected = true;
      this.reconnectAttempts = 0;
      this.setState("connected");
      const parser = new SseParser({
        ...(this.options.maxBufferBytes === undefined
          ? {}
          : { maxBufferBytes: this.options.maxBufferBytes }),
        ...(this.options.maxEventBytes === undefined
          ? {}
          : { maxEventBytes: this.options.maxEventBytes })
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const armHeartbeat = () => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        if (this.options.heartbeatTimeoutMs === undefined) return;
        heartbeatTimer = setTimeout(() => {
          heartbeatExpired = true;
          controller.abort();
        }, Math.max(1_000, this.options.heartbeatTimeoutMs));
      };
      try {
        while (!controller.signal.aborted) {
          armHeartbeat();
          const part = await reader.read();
          if (part.done) break;
          if (!this.resources.isCurrent(context)) {
            controller.abort();
            throw new Error("The realtime session is stale.");
          }
          this.deliver(parser.feed(decoder.decode(part.value, { stream: true })));
        }
        if (!controller.signal.aborted) {
          this.deliver(parser.feed(decoder.decode()));
          this.deliver(parser.finish());
        }
      } finally {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        reader.releaseLock();
      }
      if (!controller.signal.aborted) this.scheduleReconnect();
    } catch (error) {
      if (
        (!controller.signal.aborted || heartbeatExpired) &&
        this.started &&
        !this.permanentlyStopped
      ) {
        this.options.onError?.(error);
        this.scheduleReconnect();
      }
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private deliver(events: readonly ServerSentEvent[]): void {
    for (const event of events) {
      if (this.options.isDeniedEvent?.(event)) {
        this.deny();
        return;
      }
      if (event.retryMs !== null) {
        this.serverRetryMs = Math.max(
          this.minReconnectMs(),
          Math.min(this.maxReconnectMs(), event.retryMs)
        );
      }
      if (event.id !== null) this.cursor = event.id;
      if (event.id !== null && event.id === this.lastDeliveredId) continue;
      if (event.id !== null) this.lastDeliveredId = event.id;
      this.options.onEvent(event);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.permanentlyStopped || !this.started) return;
    const lifecycle = this.lifecycle.getSnapshot();
    if (!lifecycle.active || !lifecycle.online) {
      this.setState("paused");
      return;
    }
    const maximumAttempts = this.options.maxReconnectAttempts ?? 8;
    if (this.reconnectAttempts >= maximumAttempts) {
      this.fail(new Error("Realtime reconnection attempts were exhausted."));
      return;
    }
    const delay =
      this.serverRetryMs ??
      Math.min(
        this.maxReconnectMs(),
        this.minReconnectMs() * 2 ** this.reconnectAttempts
      );
    this.reconnectAttempts += 1;
    this.setState("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.requestResync();
      void this.connect();
    }, delay);
  }

  private minReconnectMs(): number {
    return Math.max(100, this.options.minReconnectMs ?? 1_000);
  }

  private maxReconnectMs(): number {
    return Math.max(this.minReconnectMs(), this.options.maxReconnectMs ?? 30_000);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private requestResync(): void {
    try {
      void Promise.resolve(this.options.onResync?.(this.cursor)).catch((error) =>
        this.options.onError?.(error)
      );
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private deny(): void {
    this.started = false;
    this.permanentlyStopped = true;
    this.clearReconnect();
    this.controller?.abort();
    this.controller = null;
    this.unsubscribeLifecycle();
    this.setState("denied");
    this.options.onDenied?.();
    this.onStop();
  }

  private fail(error: unknown): void {
    this.started = false;
    this.permanentlyStopped = true;
    this.clearReconnect();
    this.controller?.abort();
    this.controller = null;
    this.unsubscribeLifecycle();
    this.setState("failed");
    this.options.onError?.(error);
    this.onStop();
  }

  private setState(state: SseConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
