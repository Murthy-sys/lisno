import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import { CleanupRegistry } from "../config/cleanupRegistry";
import type { EnvironmentSnapshot } from "../config/environmentManager";
import { JsonApiClient } from "../http/apiClient";
import { InvalidAuthorizationSnapshotError } from "./authorization";
import { SessionManager } from "./sessionManager";
import { SessionTokenState } from "./tokenState";
import {
  credentialKeyForEnvironment,
  TokenVault,
  type SecureTokenStorage
} from "./tokenVault";

const environment = Object.freeze({
  profile: "remote" as const,
  id: "remote:https://api.example.test/api/v1",
  apiBaseUrl: "https://api.example.test/api/v1",
  origin: "https://api.example.test",
  host: "api.example.test",
  isLocal: false
});

const environmentSnapshot: EnvironmentSnapshot = {
  environment,
  generation: 4,
  status: "ready"
};

const user = {
  id: "user-1",
  name: "Ada Designer",
  email: "ada@example.test",
  role: "designer" as const
};

const authorization = {
  role: "designer",
  policyVersion: AUTHORIZATION_POLICY_VERSION,
  permissions: ["identity.self.read", "projects.read"]
};

const TOKEN_KEY = credentialKeyForEnvironment(environment.id);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(status >= 400 ? data : { data }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function createStorage(initialToken: string | null = null): SecureTokenStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  if (initialToken) values.set(TOKEN_KEY, initialToken);
  return {
    values,
    async isAvailableAsync() {
      return true;
    },
    async getItemAsync(key) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      values.delete(key);
    }
  };
}

function createHarness(
  fetchImplementation: jest.Mock,
  initialToken: string | null = null
) {
  const storage = createStorage(initialToken);
  const tokenState = new SessionTokenState();
  const cleanups = new CleanupRegistry();
  let manager!: SessionManager;
  const apiClient = new JsonApiClient({
    getEnvironmentSnapshot: () => environmentSnapshot,
    tokenSource: tokenState,
    fetch: fetchImplementation,
    safeRetryCount: 0,
    onUnauthorized: (context) => manager.handleUnauthorized(context)
  });
  manager = new SessionManager({
    apiClient,
    tokenVault: new TokenVault(environment.id, storage),
    tokenState,
    cleanups,
    getEnvironmentSnapshot: () => environmentSnapshot,
    restoreTimeoutMs: 1_000
  });
  return { manager, storage, tokenState, cleanups };
}

function authenticatedRoutes(overrides?: {
  authorization?: unknown;
  token?: string;
}): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, "");
    if (path === "/auth/login" && init?.method === "POST") {
      return json({ token: overrides?.token ?? "login-token", user });
    }
    if (path === "/auth/me") return json(user);
    if (path === "/auth/authorization") {
      return json(overrides?.authorization ?? authorization);
    }
    throw new Error(`Unexpected route ${path}`);
  });
}

describe("SessionManager", () => {
  it("restores only after both the user and authorization snapshot validate", async () => {
    const harness = createHarness(authenticatedRoutes(), "stored-token");

    await expect(harness.manager.restore()).resolves.toMatchObject({
      status: "authenticated",
      session: { user, authorization }
    });
    expect(harness.tokenState.getRequestToken()).toMatchObject({
      token: "stored-token",
      accepted: true,
      userId: user.id
    });
  });

  it("fails closed and clears credentials for a mismatched snapshot", async () => {
    const harness = createHarness(
      authenticatedRoutes({
        authorization: { ...authorization, role: "admin" }
      }),
      "stored-token"
    );

    await expect(harness.manager.restore()).resolves.toMatchObject({
      status: "unauthenticated",
      failure: "invalid_session",
      session: null
    });
    expect(harness.storage.values.has(TOKEN_KEY)).toBe(false);
    expect(harness.tokenState.getRequestToken()).toBeNull();
  });

  it("clears a newly issued login token when authorization policy validation fails", async () => {
    const fetchImplementation = authenticatedRoutes({
      authorization: {
        ...authorization,
        policyVersion: "2026-09-18.vendor-procurement.v1"
      }
    });
    const harness = createHarness(fetchImplementation);

    await expect(
      harness.manager.login({ email: user.email, password: "password" })
    ).rejects.toBeInstanceOf(InvalidAuthorizationSnapshotError);

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(harness.storage.values.has(TOKEN_KEY)).toBe(false);
    expect(harness.tokenState.getRequestToken()).toBeNull();
    expect(harness.manager.getSnapshot()).toMatchObject({
      status: "unauthenticated",
      failure: "invalid_session",
      session: null
    });
  });

  it("preserves the secure token but exposes no protected session on transient restore failure", async () => {
    const harness = createHarness(
      jest.fn(async () => {
        throw new TypeError("offline");
      }),
      "stored-token"
    );

    await expect(harness.manager.restore()).resolves.toMatchObject({
      status: "transient_error",
      failure: "connection",
      session: null
    });
    expect(harness.storage.values.get(TOKEN_KEY)).toBe("stored-token");
    expect(harness.tokenState.getRequestToken()).toBeNull();
  });

  it("ignores delayed restore responses after logout advances the session generation", async () => {
    let resolveUser!: (response: Response) => void;
    let resolveAuthorization!: (response: Response) => void;
    let requestCount = 0;
    let markRequestsStarted!: () => void;
    const requestsStarted = new Promise<void>((resolve) => (markRequestsStarted = resolve));
    const fetchImplementation = jest.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, "");
      requestCount += 1;
      if (requestCount === 2) markRequestsStarted();
      if (path === "/auth/me") {
        return new Promise<Response>((resolve) => (resolveUser = resolve));
      }
      return new Promise<Response>((resolve) => (resolveAuthorization = resolve));
    });
    const harness = createHarness(fetchImplementation, "stored-token");

    const restoring = harness.manager.restore();
    await requestsStarted;
    await harness.manager.logout();
    resolveUser(json(user));
    resolveAuthorization(json(authorization));
    await restoring;

    expect(harness.manager.getSnapshot()).toMatchObject({
      status: "unauthenticated",
      session: null
    });
    expect(harness.storage.values.has(TOKEN_KEY)).toBe(false);
  });

  it("does not let a delayed old 401 sign out a newer accepted token", async () => {
    const harness = createHarness(authenticatedRoutes({ token: "new-token" }));
    await harness.manager.login({ email: user.email, password: "password" });
    const generation = harness.manager.getSnapshot().generation;

    harness.manager.handleUnauthorized({
      token: "old-token",
      environmentId: environment.id,
      environmentGeneration: environmentSnapshot.generation,
      sessionGeneration: generation - 1
    });
    await Promise.resolve();

    expect(harness.manager.getSnapshot()).toMatchObject({
      status: "authenticated",
      session: { user }
    });
    expect(harness.storage.values.get(TOKEN_KEY)).toBe("new-token");
  });

  it("replaces the signed-in user only for the same id and role and notifies subscribers", async () => {
    const harness = createHarness(authenticatedRoutes({ token: "new-token" }));
    expect(harness.manager.replaceUser({ ...user, profilePhotoVersion: 1 })).toBe(false);
    await harness.manager.login({ email: user.email, password: "password" });
    const before = harness.manager.getSnapshot();
    const listener = jest.fn();
    harness.manager.subscribe(listener);

    expect(harness.manager.replaceUser({ ...user, id: "user-2", profilePhotoVersion: 1 })).toBe(false);
    expect(harness.manager.replaceUser({ ...user, role: "admin", profilePhotoVersion: 1 })).toBe(false);
    expect(harness.manager.replaceUser({ ...user, profilePhotoVersion: 0 })).toBe(false);
    expect(harness.manager.replaceUser({ ...user, storageKey: "private" })).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(harness.manager.getSnapshot()).toBe(before);

    expect(harness.manager.replaceUser({ ...user, profilePhotoVersion: 3 })).toBe(true);
    const after = harness.manager.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(after);
    expect(after).toMatchObject({
      status: "authenticated",
      generation: before.generation,
      failure: null,
      session: { user: { ...user, profilePhotoVersion: 3 }, authorization }
    });
    expect(Object.isFrozen(after)).toBe(true);
    expect(Object.isFrozen(after.session)).toBe(true);
    expect(Object.isFrozen(after.session?.user)).toBe(true);
    expect(after.session?.authorization).toBe(before.session?.authorization);
    expect(harness.tokenState.getRequestToken()).toMatchObject({ token: "new-token", accepted: true });

    expect(harness.manager.replaceUser(user)).toBe(true);
    expect(harness.manager.getSnapshot().session?.user).not.toHaveProperty("profilePhotoVersion");
  });
});
