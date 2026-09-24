import type { AuthenticatedSession, PublicUser, SessionStatus } from "../../contracts/session";
import type { CleanupReason, CleanupRegistry } from "../config/cleanupRegistry";
import type { EnvironmentSnapshot } from "../config/environmentManager";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
  StaleResponseError,
  type JsonApiClient,
  type UnauthorizedRequestContext
} from "../http/apiClient";
import {
  InvalidAuthorizationSnapshotError,
  InvalidSessionPayloadError,
  parseAuthorizationSnapshot,
  parseAuthPayload,
  parsePublicUser
} from "./authorization";
import { SessionTokenState } from "./tokenState";
import {
  SupersededCredentialOperationError,
  type GenerationFence,
  type TokenVault
} from "./tokenVault";

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

export type SessionFailure =
  | "expired"
  | "access_denied"
  | "invalid_session"
  | "connection";

export interface SessionSnapshot {
  readonly status: SessionStatus;
  readonly session: AuthenticatedSession | null;
  readonly failure: SessionFailure | null;
  readonly generation: number;
}

export interface SessionManagerDependencies {
  readonly apiClient: JsonApiClient;
  readonly tokenVault: TokenVault;
  readonly tokenState: SessionTokenState;
  readonly cleanups: CleanupRegistry;
  readonly getEnvironmentSnapshot: () => EnvironmentSnapshot;
  readonly restoreTimeoutMs?: number | undefined;
}

function isTransientRestoreError(error: unknown): boolean {
  return (
    error instanceof ApiNetworkError ||
    error instanceof ApiTimeoutError ||
    (error instanceof ApiError && (error.status === 408 || error.status === 429 || error.status >= 500))
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class SessionManager {
  private snapshot: SessionSnapshot = Object.freeze({
    status: "booting",
    session: null,
    failure: null,
    generation: 0
  });
  private readonly listeners = new Set<(snapshot: SessionSnapshot) => void>();
  private activeController: AbortController | null = null;
  private readonly unregisterCleanup: () => void;

  constructor(private readonly dependencies: SessionManagerDependencies) {
    this.unregisterCleanup = dependencies.cleanups.register(
      "session-credentials",
      ({ reason }) => this.clearForCleanup(reason),
      20
    );
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.activeController?.abort();
    this.activeController = null;
    this.unregisterCleanup();
    this.listeners.clear();
  }

  async restore(): Promise<SessionSnapshot> {
    const generation = this.beginTransition("restoring");
    const fence = this.fence(generation);
    let token: string | null = null;
    try {
      token = await this.dependencies.tokenVault.read(fence);
      if (!this.isCurrent(generation)) return this.snapshot;
      if (!token) {
        this.commit("unauthenticated", null, null, generation);
        return this.snapshot;
      }

      const environment = this.dependencies.getEnvironmentSnapshot();
      this.dependencies.tokenState.setPending(
        token,
        environment.environment.id,
        generation
      );
      const controller = new AbortController();
      this.activeController = controller;
      let restoreTimedOut = false;
      const timeout = setTimeout(() => {
        restoreTimedOut = true;
        controller.abort();
      }, this.dependencies.restoreTimeoutMs ?? 10_000);

      try {
        const session = await this.fetchValidatedSession(controller.signal);
        if (!this.isCurrent(generation)) return this.snapshot;
        this.dependencies.tokenState.accept(session.user.id, generation);
        this.commit("authenticated", session, null, generation);
      } catch (error) {
        controller.abort();
        if (!this.isCurrent(generation)) return this.snapshot;
        this.dependencies.tokenState.clear(generation);
        if (restoreTimedOut || isTransientRestoreError(error)) {
          this.commit("transient_error", null, "connection", generation);
          return this.snapshot;
        }
        if (error instanceof StaleResponseError || isAbortError(error)) {
          return this.snapshot;
        }
        const failure =
          error instanceof InvalidAuthorizationSnapshotError ||
          error instanceof InvalidSessionPayloadError
            ? "invalid_session"
            : error instanceof ApiError && (error.status === 401 || error.status === 403)
              ? "expired"
              : "access_denied";
        try {
          await this.clearVaultIfCurrent(fence);
        } finally {
          if (this.isCurrent(generation)) {
            this.commit("unauthenticated", null, failure, generation);
          }
        }
      } finally {
        clearTimeout(timeout);
        if (this.activeController === controller) this.activeController = null;
      }
    } catch (error) {
      if (
        this.isCurrent(generation) &&
        !(error instanceof SupersededCredentialOperationError)
      ) {
        this.dependencies.tokenState.clear(generation);
        this.commit("transient_error", null, "connection", generation);
      }
    }
    return this.snapshot;
  }

  async login(credentials: LoginCredentials): Promise<PublicUser> {
    const generation = this.beginTransition("restoring");
    const fence = this.fence(generation);
    const environment = this.dependencies.getEnvironmentSnapshot();

    try {
      const rawPayload = await this.dependencies.apiClient.public.post<unknown>(
        "/auth/login",
        credentials
      );
      const payload = parseAuthPayload(rawPayload);
      if (!payload) throw new InvalidSessionPayloadError();
      this.assertCurrent(generation);
      this.dependencies.tokenState.setPending(
        payload.token,
        environment.environment.id,
        generation,
        payload.user.id
      );
      await this.dependencies.tokenVault.write(payload.token, fence);
      this.assertCurrent(generation);

      const controller = new AbortController();
      this.activeController = controller;
      const session = await this.fetchValidatedSession(controller.signal);
      this.assertCurrent(generation);
      if (session.user.id !== payload.user.id || session.user.role !== payload.user.role) {
        throw new InvalidSessionPayloadError();
      }

      this.dependencies.tokenState.accept(session.user.id, generation);
      this.commit("authenticated", session, null, generation);
      return session.user;
    } catch (error) {
      if (this.isCurrent(generation)) {
        this.activeController?.abort();
        this.activeController = null;
        this.dependencies.tokenState.clear(generation);
        try {
          await this.clearVaultIfCurrent(fence);
        } finally {
          if (this.isCurrent(generation)) {
            this.commit("unauthenticated", null, "invalid_session", generation);
          }
        }
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    const environment = this.dependencies.getEnvironmentSnapshot();
    const generation = this.beginTransition("signing_out");
    await this.dependencies.cleanups.run({
      reason: "logout",
      generation: environment.generation,
      fromEnvironment: environment.environment
    });
    if (this.snapshot.generation === generation) {
      this.commit("unauthenticated", null, null, generation);
    }
  }

  /**
   * Replaces the signed-in user's public profile (for example after a profile-photo change)
   * without re-authenticating. The replacement must parse as a strict PublicUser and keep the
   * same id and role, so the accepted authorization snapshot stays valid; otherwise it is ignored.
   */
  replaceUser(input: unknown): boolean {
    const current = this.snapshot;
    if (current.status !== "authenticated" || !current.session) return false;
    const user = parsePublicUser(input);
    if (
      !user ||
      user.id !== current.session.user.id ||
      user.role !== current.session.user.role
    ) {
      return false;
    }
    this.commit(
      "authenticated",
      Object.freeze({ user, authorization: current.session.authorization }),
      null,
      current.generation
    );
    return true;
  }

  handleUnauthorized = (context: UnauthorizedRequestContext): void => {
    const currentToken = this.dependencies.tokenState.getRequestToken();
    const environment = this.dependencies.getEnvironmentSnapshot();
    if (
      this.snapshot.status !== "authenticated" ||
      !currentToken?.accepted ||
      currentToken.token !== context.token ||
      currentToken.sessionGeneration !== context.sessionGeneration ||
      currentToken.environmentId !== context.environmentId ||
      environment.environment.id !== context.environmentId ||
      environment.generation !== context.environmentGeneration
    ) {
      return;
    }

    void this.expireAcceptedSession();
  };

  private async expireAcceptedSession(): Promise<void> {
    const environment = this.dependencies.getEnvironmentSnapshot();
    this.beginTransition("signing_out", "expired");
    try {
      await this.dependencies.cleanups.run({
        reason: "access_denied",
        generation: environment.generation,
        fromEnvironment: environment.environment
      });
    } catch {
      // Credential cleanup is attempted even if another cleanup participant fails.
    }
  }

  private async clearForCleanup(reason: CleanupReason): Promise<void> {
    const failure =
      reason === "access_denied" ? "expired" : null;
    const generation = this.beginTransition("signing_out", failure);
    this.dependencies.tokenState.clear();
    try {
      await this.dependencies.tokenVault.clear(this.fence(generation));
    } finally {
      if (this.isCurrent(generation)) {
        this.commit("unauthenticated", null, failure, generation);
      }
    }
  }

  private async fetchValidatedSession(signal: AbortSignal): Promise<AuthenticatedSession> {
    const [rawUser, rawAuthorization] = await Promise.all([
      this.dependencies.apiClient.authenticated.get<unknown>("/auth/me", { signal }),
      this.dependencies.apiClient.authenticated.get<unknown>("/auth/authorization", {
        signal
      })
    ]);
    const user = parsePublicUser(rawUser);
    if (!user) throw new InvalidSessionPayloadError();
    const authorization = parseAuthorizationSnapshot(rawAuthorization, user.role);
    if (!authorization) throw new InvalidAuthorizationSnapshotError();
    return Object.freeze({ user, authorization });
  }

  private beginTransition(
    status: SessionStatus,
    failure: SessionFailure | null = null
  ): number {
    this.activeController?.abort();
    this.activeController = null;
    const generation = this.snapshot.generation + 1;
    this.dependencies.tokenState.clear();
    this.commit(status, null, failure, generation);
    return generation;
  }

  private fence(generation: number): GenerationFence {
    return { generation, isCurrent: this.isCurrent };
  }

  private isCurrent = (generation: number): boolean =>
    this.snapshot.generation === generation;

  private assertCurrent(generation: number): void {
    if (!this.isCurrent(generation)) throw new SupersededCredentialOperationError();
  }

  private async clearVaultIfCurrent(fence: GenerationFence): Promise<void> {
    try {
      await this.dependencies.tokenVault.clear(fence);
    } catch (error) {
      if (!(error instanceof SupersededCredentialOperationError)) throw error;
    }
  }

  private commit(
    status: SessionStatus,
    session: AuthenticatedSession | null,
    failure: SessionFailure | null,
    generation: number
  ): void {
    if (generation < this.snapshot.generation) return;
    this.snapshot = Object.freeze({ status, session, failure, generation });
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
