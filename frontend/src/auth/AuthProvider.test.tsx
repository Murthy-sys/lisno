import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

import { apiClient, tokenStorage } from "../api/client";
import type { ClientSignupInput, PublicUser } from "../api/types";
import { AUTHORIZATION_POLICY_VERSION } from "../api/authorization-contract";
import { authorizationFor } from "../test/authFixtures";
import { AuthProvider, useAuth } from "./AuthProvider";
import {
  captureLoginReviewSession,
  consumeLoginReview,
  establishLoginReviewSession,
  getLoginReviewState
} from "./loginReviewSession";

const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  let queue: Promise<unknown> = Promise.resolve();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: (_name: string, operation: () => unknown) => {
      const result = queue.then(operation);
      queue = result.catch(() => undefined);
      return result;
    } }
  });
});
afterEach(() => {
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else Reflect.deleteProperty(navigator, "locks");
  vi.unstubAllGlobals();
});

const userA: PublicUser = {
  id: "user-a",
  name: "User A",
  email: "a@lisno.example",
  role: "designer"
};

const userB: PublicUser = {
  id: "user-b",
  name: "User B",
  email: "b@lisno.example",
  role: "design_manager"
};

const clientSignup: ClientSignupInput = {
  name: "Client C",
  email: "c@lisno.example",
  mobile: "+91 98765 43210",
  address: "42 Garden Lane",
  password: "StrongPassword!23",
  passwordConfirmation: "StrongPassword!23"
};

const userC: PublicUser = {
  id: "user-c",
  name: clientSignup.name,
  email: clientSignup.email,
  role: "client"
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function requestPath(input: RequestInfo | URL): string {
  return new URL(String(input), window.location.origin).pathname;
}

function restoredSessionResponse(input: RequestInfo | URL, user: PublicUser) {
  const path = requestPath(input);
  if (path === "/api/v1/auth/me") {
    return Response.json({ data: user });
  }
  if (path === "/api/v1/auth/authorization") {
    return Response.json({ data: authorizationFor(user.role) });
  }
  throw new Error(`Unexpected request: ${path}`);
}

function AuthHarness() {
  const auth = useAuth();
  const [logoutOutcome, setLogoutOutcome] = useState("idle");
  const [signupOutcome, setSignupOutcome] = useState("idle");

  return (
    <>
      <output aria-label="Authentication status">{auth.status}</output>
      <output aria-label="Current user">{auth.user?.name ?? "none"}</output>
      <output aria-label="Review session">{auth.reviewSession?.id ?? "none"}</output>
      <output aria-label="Review user">{auth.reviewSession?.userId ?? "none"}</output>
      <output aria-label="Authorization role">
        {auth.authorization?.role ?? "none"}
      </output>
      <output aria-label="Authorization policy">
        {auth.authorization?.policyVersion ?? "none"}
      </output>
      <output aria-label="Session invariant">
        {auth.status === "authenticated" &&
        (!auth.user || !auth.authorization)
          ? "invalid"
          : "valid"}
      </output>
      <output aria-label="Session expired">{String(auth.sessionExpired)}</output>
      <output aria-label="Logout outcome">{logoutOutcome}</output>
      <output aria-label="Signup outcome">{signupOutcome}</output>
      <button
        type="button"
        onClick={() => void auth.restore()}
      >
        Restore session
      </button>
      <button
        type="button"
        onClick={() => {
          setLogoutOutcome("pending");
          void auth.logout().then(
            () => setLogoutOutcome("resolved"),
            () => setLogoutOutcome("rejected")
          );
        }}
      >
        Log out
      </button>
      <button
        type="button"
        onClick={() =>
          void auth
            .login({ email: "b@lisno.example", password: "password" })
            .catch(() => undefined)
        }
      >
        Log in as B
      </button>
      <button
        type="button"
        onClick={() => {
          setSignupOutcome("pending");
          void auth.signupClient(clientSignup).then(
            () => setSignupOutcome("resolved"),
            (error: unknown) =>
              setSignupOutcome(
                error instanceof Error
                  ? `${error.name}: ${error.message}`
                  : "rejected"
              )
          );
        }}
      >
        Sign up as C
      </button>
      <button
        type="button"
        onClick={() => void apiClient.get("/expired").catch(() => undefined)}
      >
        Expire session
      </button>
    </>
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

function renderAuthProvider(
  queryClient = createQueryClient(),
  wrapper?: (children: ReactNode) => ReactNode
) {
  const provider = (
    <AuthProvider>
      <AuthHarness />
    </AuthProvider>
  );
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        {wrapper ? wrapper(provider) : provider}
      </QueryClientProvider>
    )
  };
}

async function seedAuthenticatedCache(queryClient: QueryClient) {
  let aborted = false;
  queryClient.setQueryData(["viewer"], { owner: "User A" });
  const pendingQuery = queryClient
    .fetchQuery({
      queryKey: ["in-flight"],
      queryFn: ({ signal }) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new DOMException("Query canceled.", "AbortError"));
            },
            { once: true }
          );
        })
    })
    .catch(() => undefined);

  await waitFor(() =>
    expect(queryClient.getQueryState(["in-flight"])?.fetchStatus).toBe("fetching")
  );

  return {
    pendingQuery,
    wasAborted: () => aborted
  };
}

async function replaceReviewFromOtherTab(user: PublicUser, token: string, consumed = false) {
  const bytes = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenFingerprint = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  const id = webcrypto.randomUUID();
  act(() => {
    tokenStorage.set(token);
    localStorage.setItem("lisno.auth.login-review.v1", JSON.stringify({ version: 1, id, userId: user.id, tokenFingerprint, consumed }));
    window.dispatchEvent(new StorageEvent("storage", { key: "lisno.auth.login-review.v1", storageArea: localStorage }));
  });
  return { id, userId: user.id };
}

describe("AuthProvider atomic authorization establishment", () => {
  it("keeps identity hidden until both restore requests succeed", async () => {
    const authorizationGate = deferred();
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        await authorizationGate.promise;
        return Response.json({ data: authorizationFor("designer") });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderAuthProvider();

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    );
    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
      "restoring"
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    expect(screen.getByLabelText("Review session")).toHaveTextContent("none");
    expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
      "none"
    );

    authorizationGate.resolve();

    await waitFor(() => {
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A");
      expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
        "designer"
      );
      expect(screen.getByLabelText("Session invariant")).toHaveTextContent(
        "valid"
      );
    });
  });

  it("restores a session across an older backend policy label and preserves it", async () => {
    const previousPolicyVersion = "2026-08-28.ai-estimator-knowledge.v6";
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({
          data: {
            ...authorizationFor("designer"),
            policyVersion: previousPolicyVersion
          }
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderAuthProvider();

    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        /^authenticated$/
      )
    );
    expect(screen.getByLabelText("Authorization policy")).toHaveTextContent(
      previousPolicyVersion
    );
    expect(tokenStorage.get()).toBe("token-a");
  });

  it.each([
    [
      "authorization failure",
      Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Policy unavailable." } },
        { status: 500 }
      )
    ],
    [
      "role mismatch",
      Response.json({ data: authorizationFor("design_manager") })
    ],
    [
      "malformed policy label",
      Response.json({
        data: {
          ...authorizationFor("designer"),
          policyVersion: ".invalid-policy"
        }
      })
    ]
  ])("fails closed when restore has %s", async (_label, authorizationResponse) => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return authorizationResponse.clone();
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderAuthProvider();

    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "error"
      )
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
      "none"
    );
    expect(screen.getByLabelText("Authorization policy")).toHaveTextContent(
      "none"
    );
    expect(screen.getByLabelText("Session invariant")).toHaveTextContent(
      "valid"
    );
    expect(tokenStorage.get()).toBe("token-a");
  });

  it.each(["/api/v1/auth/me", "/api/v1/auth/authorization"])(
    "aborts both sibling restore requests when %s fails",
    async (failingPath) => {
    const signals: AbortSignal[] = [];
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      signals.push(init?.signal as AbortSignal);
      if (path === failingPath) {
        return Response.json(
          { error: { code: "INTERNAL_ERROR", message: "Restore failed." } },
          { status: 500 }
        );
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
      });
    });

    renderAuthProvider();

    await waitFor(() => expect(signals).toHaveLength(2));
    await waitFor(() => expect(signals.every((signal) => signal.aborted)).toBe(true));
    expect(signals[0]).toBe(signals[1]);
    }
  );

  it("logout aborts the shared signal used by both restore requests", async () => {
    const signals: AbortSignal[] = [];
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
      });
    });

    renderAuthProvider();
    await waitFor(() => expect(signals).toHaveLength(2));

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(signals[0]).toBe(signals[1]);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
      "none"
    );
  });

  it("does not commit stale restore authorization after a newer login", async () => {
    const staleAuthorizationGate = deferred();
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/login") {
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      if (path === "/api/v1/auth/authorization") {
        const requestToken = tokenStorage.get();
        if (requestToken === "token-a") {
          await staleAuthorizationGate.promise;
          return Response.json({ data: authorizationFor("designer") });
        }
        return Response.json({ data: authorizationFor("design_manager") });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderAuthProvider();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
      expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
        "design_manager"
      );
    });

    staleAuthorizationGate.resolve();
    await Promise.resolve();

    expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
    expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
      "design_manager"
    );
    expect(tokenStorage.get()).toBe("token-b");
  });

  it("hides the old atomic session while an account-switch POST is pending", async () => {
    const loginGate = deferred();
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/login") {
        await loginGate.promise;
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({
          data: authorizationFor(
            tokenStorage.get() === "token-b" ? "design_manager" : "designer"
          )
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderAuthProvider();
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );

    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));

    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
      "restoring"
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
      "none"
    );

    loginGate.resolve();
    await waitFor(() => {
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
      expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
        "design_manager"
      );
    });
  });

  it.each([
    ["login", "Log in as B", "/api/v1/auth/login", "token-b", userB],
    ["signup", "Sign up as C", "/api/v1/auth/client-signup", "token-c", userC]
  ] as const)(
    "removes the replacement token when %s authorization establishment fails",
    async (_label, buttonName, authPath, token, user) => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const path = new URL(String(input), window.location.origin).pathname;
        if (path === authPath) {
          return Response.json({ data: { token, user } });
        }
        if (path === "/api/v1/auth/authorization") {
          return Response.json({
            data: {
              role: user.role,
              policyVersion: `${AUTHORIZATION_POLICY_VERSION}/unsafe`,
              permissions: ["identity.self.read"]
            }
          });
        }
        throw new Error(`Unexpected request: ${path}`);
      });

      renderAuthProvider();
      await userEvent.click(screen.getByRole("button", { name: buttonName }));

      await waitFor(() =>
        expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
          "unauthenticated"
        )
      );
      expect(tokenStorage.get()).toBeNull();
      expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
      expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
        "none"
      );
    }
  );

  it("establishes login across a future backend policy label and preserves it", async () => {
    const futurePolicyVersion = "2027-01-15.authorization_policy-v2";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/login") {
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({
          data: {
            ...authorizationFor("design_manager"),
            policyVersion: futurePolicyVersion
          }
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderAuthProvider();
    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        /^authenticated$/
      )
    );
    expect(screen.getByLabelText("Authorization policy")).toHaveTextContent(
      futurePolicyVersion
    );
    expect(tokenStorage.get()).toBe("token-b");
  });
});

describe("AuthProvider session concurrency", () => {
  it("persists the client-signup auth payload and exposes its authenticated client", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/client-signup") {
        expect(JSON.parse(String(init?.body))).toEqual(clientSignup);
        return Response.json(
          { data: { token: "token-c", user: userC } },
          { status: 201 }
        );
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor("client") });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    renderAuthProvider();

    await userEvent.click(screen.getByRole("button", { name: "Sign up as C" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        /^authenticated$/
      )
    );
    expect(screen.getByLabelText("Signup outcome")).toHaveTextContent("resolved");
    expect(screen.getByLabelText("Current user")).toHaveTextContent("Client C");
    expect(tokenStorage.get()).toBe("token-c");
  });

  it("does not let a stale client-signup response replace a newer login", async () => {
    let resolveSignup!: () => void;
    const signupGate = new Promise<void>((resolve) => {
      resolveSignup = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/client-signup") {
        await signupGate;
        return Response.json({ data: { token: "token-c", user: userC } }, { status: 201 });
      }
      if (path === "/api/v1/auth/login") {
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor("design_manager") });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    renderAuthProvider();

    await userEvent.click(screen.getByRole("button", { name: "Sign up as C" }));
    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B")
    );
    resolveSignup();

    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B")
    );
    expect(tokenStorage.get()).toBe("token-b");
  });

  it("restores the current session when wrapped in production StrictMode", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      restoredSessionResponse(input, userA)
    );

    renderAuthProvider(undefined, (children) => (
      <StrictMode>{children}</StrictMode>
    ));

    await waitFor(() => {
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "authenticated"
      );
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A");
      expect(screen.getByLabelText("Session expired")).toHaveTextContent("false");
    });
  });

  it("does not describe an initial restore 401 as a mid-session expiry", async () => {
    tokenStorage.set("expired-before-restore");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          error: {
            code: "TOKEN_EXPIRED",
            message: "Authentication token has expired."
          }
        },
        { status: 401 }
      )
    );

    renderAuthProvider();

    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "unauthenticated"
      )
    );
    expect(screen.getByLabelText("Session expired")).toHaveTextContent("false");
    expect(tokenStorage.get()).toBeNull();
  });

  it("does not commit a stale restore success after logout", async () => {
    const restoreGate = deferred();
    let restoreSettled = false;
    let restoreSignal: AbortSignal | undefined;
    const realGet = apiClient.get.bind(apiClient);
    vi.spyOn(apiClient, "get").mockImplementation(async (...arguments_) => {
      try {
        return await realGet(...arguments_);
      } finally {
        restoreSettled = true;
      }
    });
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      restoreSignal = init?.signal ?? undefined;
      await restoreGate.promise;
      return restoredSessionResponse(input, userA);
    });
    renderAuthProvider();

    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
      "restoring"
    );
    await waitFor(() => expect(restoreSignal).toBeDefined());
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(restoreSignal?.aborted).toBe(true);
    restoreGate.resolve();

    await waitFor(() => expect(restoreSettled).toBe(true));
    await waitFor(() => {
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "unauthenticated"
      );
      expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    });
    expect(tokenStorage.get()).toBeNull();
  });

  it("does not commit a stale restore failure after a newer login", async () => {
    const restoreGate = deferred();
    let restoreSettled = false;
    let restoreSignal: AbortSignal | undefined;
    const realGet = apiClient.get.bind(apiClient);
    vi.spyOn(apiClient, "get").mockImplementation(async (...arguments_) => {
      try {
        return await realGet(...arguments_);
      } finally {
        restoreSettled = true;
      }
    });
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        restoreSignal = init?.signal ?? undefined;
        await restoreGate.promise;
        return Response.json(
          { error: { code: "INTERNAL_ERROR", message: "Restore failed." } },
          { status: 500 }
        );
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({
          data: authorizationFor(
            tokenStorage.get() === "token-b" ? "design_manager" : "designer"
          )
        });
      }
      if (path === "/api/v1/auth/login") {
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    renderAuthProvider();

    await waitFor(() => expect(restoreSignal).toBeDefined());
    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    expect(restoreSignal?.aborted).toBe(true);
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B")
    );
    restoreGate.resolve();

    await waitFor(() => expect(restoreSettled).toBe(true));
    await waitFor(() => {
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "authenticated"
      );
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
    });
    expect(tokenStorage.get()).toBe("token-b");
  });

  it("aborts an in-flight restore when the provider unmounts", async () => {
    const restoreGate = deferred();
    const restoreSignals: AbortSignal[] = [];
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      restoreSignals.push(init?.signal as AbortSignal);
      await restoreGate.promise;
      return restoredSessionResponse(input, userA);
    });
    const { unmount } = renderAuthProvider();
    await waitFor(() => expect(restoreSignals).toHaveLength(2));

    unmount();

    expect(restoreSignals[0]).toBe(restoreSignals[1]);
    expect(restoreSignals.every((signal) => signal.aborted)).toBe(true);
    restoreGate.resolve();
  });
});

describe("AuthProvider cache isolation", () => {
  it("does not let superseded expiry cleanup clear user B's authenticated cache", async () => {
    const expiredCleanupStarted = deferred();
    const expiredCleanupGate = deferred();
    const expiredCleanupFinished = deferred();
    const queryClient = createQueryClient();
    const realCancelQueries = queryClient.cancelQueries.bind(queryClient);
    let cancellationCall = 0;
    vi.spyOn(queryClient, "cancelQueries").mockImplementation(() => {
      cancellationCall += 1;
      const cancellation = realCancelQueries();
      if (cancellationCall !== 1) return cancellation;

      expiredCleanupStarted.resolve();
      return expiredCleanupGate.promise.then(async () => {
        await cancellation;
        setTimeout(expiredCleanupFinished.resolve, 0);
      });
    });
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({
          data: authorizationFor(
            tokenStorage.get() === "token-b" ? "design_manager" : "designer"
          )
        });
      }
      if (path === "/api/v1/auth/login") {
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      return Response.json(
        {
          error: {
            code: "TOKEN_EXPIRED",
            message: "User A's session expired."
          }
        },
        { status: 401 }
      );
    });
    renderAuthProvider(queryClient);
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );

    await userEvent.click(screen.getByRole("button", { name: "Expire session" }));
    await expiredCleanupStarted.promise;
    expect(screen.getByLabelText("Session expired")).toHaveTextContent("true");

    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        /^authenticated$/
      );
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
    });
    queryClient.setQueryData(["viewer"], { owner: "User B" });

    expiredCleanupGate.resolve();
    await expiredCleanupFinished.promise;

    expect(queryClient.getQueryData(["viewer"])).toEqual({ owner: "User B" });
    expect(tokenStorage.get()).toBe("token-b");
    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
      /^authenticated$/
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
    expect(screen.getByLabelText("Session expired")).toHaveTextContent("false");
  });

  it("cancels authenticated queries and removes user data on logout", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      restoredSessionResponse(input, userA)
    );
    const { queryClient } = renderAuthProvider();
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );
    const inFlight = await seedAuthenticatedCache(queryClient);

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(inFlight.wasAborted()).toBe(true));
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
    expect(queryClient.getQueryState(["in-flight"])).toBeUndefined();
    await inFlight.pendingQuery;
  });

  it("clears user A's cache before rendering a replacement user B session", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({
          data: authorizationFor(
            tokenStorage.get() === "token-b" ? "design_manager" : "designer"
          )
        });
      }
      if (path === "/api/v1/auth/login") {
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const { queryClient } = renderAuthProvider();
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );
    const inFlight = await seedAuthenticatedCache(queryClient);

    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B")
    );
    expect(inFlight.wasAborted()).toBe(true);
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
    expect(queryClient.getQueryState(["in-flight"])).toBeUndefined();
    await inFlight.pendingQuery;
  });

  it("keeps user B when user A receives a 401 during deferred cache cleanup", async () => {
    const cleanupStarted = deferred();
    const cleanupGate = deferred();
    const staleResponseGate = deferred();
    const queryClient = createQueryClient();
    const realCancelQueries = queryClient.cancelQueries.bind(queryClient);
    vi.spyOn(queryClient, "cancelQueries").mockImplementation(async () => {
      cleanupStarted.resolve();
      await cleanupGate.promise;
      await realCancelQueries();
    });
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({
          data: authorizationFor(
            tokenStorage.get() === "token-b" ? "design_manager" : "designer"
          )
        });
      }
      if (path === "/api/v1/auth/login") {
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      if (path !== "/api/v1/stale-a") {
        throw new Error(`Unexpected request: ${path}`);
      }
      await staleResponseGate.promise;
      return Response.json(
        {
          error: {
            code: "TOKEN_EXPIRED",
            message: "User A's request expired."
          }
        },
        { status: 401 }
      );
    });
    renderAuthProvider(queryClient);
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );
    queryClient.setQueryData(["viewer"], { owner: "User A" });
    const staleARequest = apiClient.get("/stale-a");

    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    await cleanupStarted.promise;
    staleResponseGate.resolve();
    await expect(staleARequest).rejects.toMatchObject({ status: 401 });

    expect(tokenStorage.get()).toBe("token-b");
    expect(screen.getByLabelText("Session expired")).toHaveTextContent("false");
    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
      "restoring"
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");

    cleanupGate.resolve();
    await waitFor(() => {
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "authenticated"
      );
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
    });
    expect(tokenStorage.get()).toBe("token-b");
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
    expect(screen.getByLabelText("Session expired")).toHaveTextContent("false");
  });

  it("keeps signing out visible until failed cancellation clears the cache", async () => {
    const cleanupGate = deferred();
    const queryClient = createQueryClient();
    vi.spyOn(queryClient, "cancelQueries").mockImplementation(async () => {
      await cleanupGate.promise;
      throw new Error("Cache cancellation failed.");
    });
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      restoredSessionResponse(input, userA)
    );
    renderAuthProvider(queryClient);
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );
    queryClient.setQueryData(["viewer"], { owner: "User A" });

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
      "signing_out"
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    expect(screen.getByLabelText("Session expired")).toHaveTextContent("false");
    expect(screen.getByLabelText("Logout outcome")).toHaveTextContent("pending");
    expect(tokenStorage.get()).toBeNull();
    expect(queryClient.getQueryData(["viewer"])).toEqual({ owner: "User A" });

    cleanupGate.resolve();

    await waitFor(() => {
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "unauthenticated"
      );
      expect(screen.getByLabelText("Logout outcome")).toHaveTextContent("resolved");
    });
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
  });

  it("removes the transitional user B session when cache cleanup fails", async () => {
    const queryClient = createQueryClient();
    vi.spyOn(queryClient, "cancelQueries").mockRejectedValue(
      new Error("Cache cancellation failed.")
    );
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor("designer") });
      }
      if (path === "/api/v1/auth/login") {
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    renderAuthProvider(queryClient);
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );
    queryClient.setQueryData(["viewer"], { owner: "User A" });

    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "unauthenticated"
      )
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    expect(tokenStorage.get()).toBeNull();
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
  });

  it("accepts a user B 401 while user B is still hidden during cleanup", async () => {
    const cleanupStarted = deferred();
    const cleanupGate = deferred();
    const queryClient = createQueryClient();
    const realCancelQueries = queryClient.cancelQueries.bind(queryClient);
    vi.spyOn(queryClient, "cancelQueries").mockImplementation(async () => {
      cleanupStarted.resolve();
      await cleanupGate.promise;
      await realCancelQueries();
    });
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor("designer") });
      }
      if (path === "/api/v1/auth/login") {
        return Response.json({ data: { token: "token-b", user: userB } });
      }
      if (path !== "/api/v1/user-b-private") {
        throw new Error(`Unexpected request: ${path}`);
      }
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer token-b"
      );
      return Response.json(
        {
          error: {
            code: "TOKEN_EXPIRED",
            message: "User B's request expired."
          }
        },
        { status: 401 }
      );
    });
    renderAuthProvider(queryClient);
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );
    queryClient.setQueryData(["viewer"], { owner: "User A" });

    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    await cleanupStarted.promise;
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    await expect(apiClient.get("/user-b-private")).rejects.toMatchObject({
      status: 401
    });

    expect(tokenStorage.get()).toBeNull();
    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "unauthenticated"
      )
    );
    cleanupGate.resolve();
    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "unauthenticated"
      )
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
  });

  it("leaves an unauthenticated state and clears user data when login fails", async () => {
    const queryClient = createQueryClient();
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor("designer") });
      }
      if (path !== "/api/v1/auth/login") {
        throw new Error(`Unexpected request: ${path}`);
      }
      return Response.json(
        {
          error: {
            code: "LOGIN_FAILED",
            message: "Login could not be completed."
          }
        },
        { status: 500 }
      );
    });
    renderAuthProvider(queryClient);
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );
    queryClient.setQueryData(["viewer"], { owner: "User A" });

    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "unauthenticated"
      )
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    expect(tokenStorage.get()).toBeNull();
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
  });

  it("fails closed when an authenticated account-switch login returns 401", async () => {
    const queryClient = createQueryClient();
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor("designer") });
      }
      if (path !== "/api/v1/auth/login") {
        throw new Error(`Unexpected request: ${path}`);
      }
      return Response.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password."
          }
        },
        { status: 401 }
      );
    });
    renderAuthProvider(queryClient);
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );
    queryClient.setQueryData(["viewer"], { owner: "User A" });

    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "unauthenticated"
      )
    );
    expect(screen.getByLabelText("Current user")).toHaveTextContent("none");
    expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
      "none"
    );
    expect(tokenStorage.get()).toBeNull();
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
  });

  it("clears authenticated cache after an accepted 401", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: userA });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({
          data: authorizationFor(
            tokenStorage.get() === "token-b" ? "design_manager" : "designer"
          )
        });
      }
      if (path !== "/api/v1/expired") {
        throw new Error(`Unexpected request: ${path}`);
      }
      return Response.json(
        {
          error: {
            code: "TOKEN_EXPIRED",
            message: "Authentication token has expired."
          }
        },
        { status: 401 }
      );
    });
    const { queryClient } = renderAuthProvider();
    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A")
    );
    const inFlight = await seedAuthenticatedCache(queryClient);

    await userEvent.click(screen.getByRole("button", { name: "Expire session" }));

    await waitFor(() => expect(inFlight.wasAborted()).toBe(true));
    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
      "unauthenticated"
    );
    expect(screen.getByLabelText("Session expired")).toHaveTextContent("true");
    expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
      "none"
    );
    expect(tokenStorage.get()).toBeNull();
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
    expect(queryClient.getQueryState(["in-flight"])).toBeUndefined();
    await inFlight.pendingQuery;

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      Response.json({ data: { token: "token-b", user: userB } })
    );
    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User B")
    );
    expect(screen.getByLabelText("Authorization role")).toHaveTextContent(
      "design_manager"
    );
    expect(screen.getByLabelText("Session expired")).toHaveTextContent("false");
  });
});

describe("AuthProvider login review lifecycle", () => {
  it("creates a fresh presentation session for repeated explicit login with identical credentials and token", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (requestPath(input) === "/api/v1/auth/login") return Response.json({ data: { token: "token-b", user: userB } });
      return restoredSessionResponse(input, userB);
    });
    renderAuthProvider();
    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    await waitFor(() => expect(screen.getByLabelText("Current user")).toHaveTextContent("User B"));
    const first = captureLoginReviewSession()!;
    expect(first.userId).toBe(userB.id);
    expect(await consumeLoginReview(first, () => true)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    await waitFor(() => expect(screen.getByLabelText("Authentication status")).toHaveTextContent(/^authenticated$/));
    const second = captureLoginReviewSession()!;
    expect(second.id).not.toBe(first.id);
    expect(screen.getByLabelText("Review session")).toHaveTextContent(second.id);
    expect(getLoginReviewState(second)).toBe("pending");
    expect(getLoginReviewState(first)).toBe("stale");
  });

  it("retains the consumed session through explicit restoration and provider remount in StrictMode", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => restoredSessionResponse(input, userA));
    const firstMount = renderAuthProvider(undefined, children => <StrictMode>{children}</StrictMode>);
    await waitFor(() => expect(screen.getByLabelText("Current user")).toHaveTextContent("User A"));
    const session = captureLoginReviewSession()!;
    expect(await consumeLoginReview(session, () => true)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Restore session" }));
    await waitFor(() => expect(screen.getByLabelText("Review session")).toHaveTextContent(session.id));
    expect(getLoginReviewState(session)).toBe("consumed");
    firstMount.unmount();
    renderAuthProvider(undefined, children => <StrictMode>{children}</StrictMode>);
    await waitFor(() => expect(screen.getByLabelText("Review session")).toHaveTextContent(session.id));
    expect(getLoginReviewState(session)).toBe("consumed");
  });

  it("does not publish a review session until login authorization is accepted", async () => {
    const gate = deferred();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (requestPath(input) === "/api/v1/auth/login") return Response.json({ data: { token: "token-b", user: userB } });
      await gate.promise;
      return restoredSessionResponse(input, userB);
    });
    renderAuthProvider();
    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    expect(screen.getByLabelText("Review session")).toHaveTextContent("none");
    expect(captureLoginReviewSession()).toBeNull();
    gate.resolve();
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userB.id));
    expect(captureLoginReviewSession()?.userId).toBe(userB.id);
  });

  it("a superseded successful login cannot rotate the accepted newer user's marker", async () => {
    const gate = deferred();
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      if (requestPath(input) === "/api/v1/auth/client-signup") {
        await gate.promise;
        return Response.json({ data: { token: "token-c", user: userC } });
      }
      if (requestPath(input) === "/api/v1/auth/login") return Response.json({ data: { token: "token-b", user: userB } });
      return restoredSessionResponse(input, userB);
    });
    renderAuthProvider();
    await userEvent.click(screen.getByRole("button", { name: "Sign up as C" }));
    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userB.id));
    const accepted = captureLoginReviewSession()!;
    await consumeLoginReview(accepted, () => true);
    gate.resolve();
    await waitFor(() => expect(screen.getByLabelText("Signup outcome")).toHaveTextContent("rejected"));
    expect(captureLoginReviewSession()).toEqual(accepted);
    expect(getLoginReviewState(accepted)).toBe("consumed");
  });

  it.each(["logout", "expiry", "failed-login"])("clears the owned marker after %s", async reason => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const path = requestPath(input);
      if (path === "/api/v1/expired" || path === "/api/v1/auth/login") {
        return Response.json({ error: { code: "TOKEN_EXPIRED", message: "Expired" } }, { status: 401 });
      }
      return restoredSessionResponse(input, userA);
    });
    renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userA.id));
    const previous = captureLoginReviewSession()!;
    await userEvent.click(screen.getByRole("button", { name: reason === "logout" ? "Log out" : reason === "expiry" ? "Expire session" : "Log in as B" }));
    await waitFor(() => expect(screen.getByLabelText("Authentication status")).toHaveTextContent(/^unauthenticated$/));
    expect(screen.getByLabelText("Review session")).toHaveTextContent("none");
    await waitFor(() => expect(captureLoginReviewSession()).toBeNull());
    expect(getLoginReviewState(previous)).toBe("stale");
  });

  it("clears a retained marker when startup restoration expires", async () => {
    tokenStorage.set("expired-token");
    await establishLoginReviewSession(userA.id, "expired-token", () => true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: "TOKEN_EXPIRED", message: "Expired" } }, { status: 401 }));
    renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Authentication status")).toHaveTextContent(/^unauthenticated$/));
    await waitFor(() => expect(captureLoginReviewSession()).toBeNull());
  });

  it("revalidates an external same-user same-token login and retains its consumed marker", async () => {
    tokenStorage.set("token-a");
    const gate = deferred();
    let recovering = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      if (recovering) await gate.promise;
      return restoredSessionResponse(input, userA);
    });
    const { queryClient } = renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Current user")).toHaveTextContent("User A"));
    const old = captureLoginReviewSession()!;
    const inFlight = await seedAuthenticatedCache(queryClient);
    recovering = true;
    const external = await replaceReviewFromOtherTab(userA, "token-a", true);
    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(/^restoring$/);
    expect(screen.getByLabelText("Review session")).toHaveTextContent("none");
    await waitFor(() => expect(inFlight.wasAborted()).toBe(true));
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
    gate.resolve();
    await waitFor(() => expect(screen.getByLabelText("Review session")).toHaveTextContent(external.id));
    expect(getLoginReviewState(old)).toBe("stale");
    expect(getLoginReviewState(external)).toBe("consumed");
    expect(captureLoginReviewSession()).toEqual(external);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    await inFlight.pendingQuery;
  });

  it("revalidates a different account from an external marker and drops prior account caches", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => restoredSessionResponse(input, tokenStorage.get() === "token-b" ? userB : userA));
    const { queryClient } = renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userA.id));
    queryClient.setQueryData(["viewer"], { owner: userA.id });
    const external = await replaceReviewFromOtherTab(userB, "token-b");
    await waitFor(() => expect(screen.getByLabelText("Review session")).toHaveTextContent(external.id));
    expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
    expect(screen.getByLabelText("Authorization role")).toHaveTextContent("design_manager");
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
    expect(await consumeLoginReview(external, () => true)).toBe(true);
    expect(await consumeLoginReview(external, () => true)).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it("does not revalidate on consumption, repeated same-marker events or local logout", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => restoredSessionResponse(input, userA));
    renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userA.id));
    const current = captureLoginReviewSession()!;
    await act(async () => { await consumeLoginReview(current, () => true); });
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "lisno.auth.login-review.v1", storageArea: localStorage })); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Review session")).toHaveTextContent(current.id);
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(screen.getByLabelText("Authentication status")).toHaveTextContent(/^unauthenticated$/));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(captureLoginReviewSession()).toBeNull();
  });

  it("does not restart auth or recreate a marker after external logout", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => restoredSessionResponse(input, userA));
    renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userA.id));
    const old = captureLoginReviewSession()!;
    act(() => {
      tokenStorage.clear();
      localStorage.removeItem("lisno.auth.login-review.v1");
      window.dispatchEvent(new StorageEvent("storage", { key: "lisno.auth.login-review.v1", storageArea: localStorage }));
    });
    expect(getLoginReviewState(old)).toBe("stale");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(captureLoginReviewSession()).toBeNull();
  });

  it("ignores late external revalidation after local logout", async () => {
    tokenStorage.set("token-a");
    const gate = deferred();
    let recovering = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      if (recovering) await gate.promise;
      return restoredSessionResponse(input, userA);
    });
    renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userA.id));
    recovering = true;
    await replaceReviewFromOtherTab(userA, "token-a");
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(4));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    gate.resolve();
    await waitFor(() => expect(screen.getByLabelText("Authentication status")).toHaveTextContent(/^unauthenticated$/));
    expect(screen.getByLabelText("Review session")).toHaveTextContent("none");
    await waitFor(() => expect(captureLoginReviewSession()).toBeNull());
  });

  it("supersedes a pending external recovery when another tab accepts a newer login", async () => {
    tokenStorage.set("token-a");
    const firstRecovery = deferred();
    let fetchCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      fetchCount += 1;
      const user = tokenStorage.get() === "token-b" ? userB : userA;
      if (fetchCount === 3 || fetchCount === 4) await firstRecovery.promise;
      return restoredSessionResponse(input, user);
    });
    renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userA.id));
    await replaceReviewFromOtherTab(userA, "token-a");
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(4));
    const latest = await replaceReviewFromOtherTab(userB, "token-b", true);
    await waitFor(() => expect(screen.getByLabelText("Review session")).toHaveTextContent(latest.id));
    expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
    await act(async () => { firstRecovery.resolve(); });
    expect(captureLoginReviewSession()).toEqual(latest);
    expect(getLoginReviewState(latest)).toBe("consumed");
    expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
  });

  it.each(["success", "failure"])("recovers when a superseding token is written before its marker, after the old read's %s", async outcome => {
    tokenStorage.set("token-a");
    const firstRecovery = deferred();
    let fetchCount = 0;
    let recoveryResponses = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      fetchCount += 1;
      const user = tokenStorage.get() === "token-b" ? userB : userA;
      if (fetchCount === 3 || fetchCount === 4) {
        await firstRecovery.promise;
        recoveryResponses += 1;
        if (outcome === "failure") return Response.json({ error: { code: "UNAVAILABLE", message: "Retry" } }, { status: 503 });
      }
      return restoredSessionResponse(input, user);
    });
    renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userA.id));
    const first = await replaceReviewFromOtherTab(userA, "token-a");
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(4));
    act(() => {
      tokenStorage.set("token-b");
      window.dispatchEvent(new StorageEvent("storage", { key: "lisno.auth.token", storageArea: localStorage }));
    });
    await act(async () => { firstRecovery.resolve(); });
    await waitFor(() => expect(recoveryResponses).toBe(2));
    expect(captureLoginReviewSession()).toEqual(first);
    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(/^restoring$/);
    expect(screen.getByLabelText("Review session")).toHaveTextContent("none");
    const latest = await replaceReviewFromOtherTab(userB, "token-b", true);
    await waitFor(() => expect(screen.getByLabelText("Review session")).toHaveTextContent(latest.id));
    expect(screen.getByLabelText("Current user")).toHaveTextContent("User B");
    expect(getLoginReviewState(latest)).toBe("consumed");
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
  });

  it.each(["token-first", "marker-first"])("finishes settled external recovery when the pending login is abandoned (%s)", async order => {
    tokenStorage.set("token-a");
    const firstRecovery = deferred();
    let fetchCount = 0;
    let recoveryResponses = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      fetchCount += 1;
      if (fetchCount === 3 || fetchCount === 4) {
        await firstRecovery.promise;
        recoveryResponses += 1;
      }
      return restoredSessionResponse(input, userA);
    });
    const { queryClient } = renderAuthProvider();
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userA.id));
    await replaceReviewFromOtherTab(userA, "token-a");
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(4));
    act(() => {
      tokenStorage.set("token-b");
      window.dispatchEvent(new StorageEvent("storage", { key: "lisno.auth.token", storageArea: localStorage }));
    });
    await act(async () => { firstRecovery.resolve(); });
    await waitFor(() => expect(recoveryResponses).toBe(2));
    expect(screen.getByLabelText("Authentication status")).toHaveTextContent(/^restoring$/);
    queryClient.setQueryData(["recovery-cache"], { pending: true });
    act(() => {
      const keys = order === "token-first" ? ["lisno.auth.token", "lisno.auth.login-review.v1"] : ["lisno.auth.login-review.v1", "lisno.auth.token"];
      for (const key of keys) {
        localStorage.removeItem(key);
        window.dispatchEvent(new StorageEvent("storage", { key, storageArea: localStorage }));
      }
    });
    await waitFor(() => expect(screen.getByLabelText("Authentication status")).toHaveTextContent(/^unauthenticated$/));
    expect(screen.getByLabelText("Review session")).toHaveTextContent("none");
    expect(captureLoginReviewSession()).toBeNull();
    expect(queryClient.getQueryData(["recovery-cache"])).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it("does not block an accepted login when presentation storage is unavailable", async () => {
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "lisno.auth.login-review.v1") throw new DOMException("Quota exceeded", "QuotaExceededError");
      originalSet.call(this, key, value);
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      if (requestPath(input) === "/api/v1/auth/login") return Response.json({ data: { token: "token-b", user: userB } });
      return restoredSessionResponse(input, userB);
    });
    renderAuthProvider();
    await userEvent.click(screen.getByRole("button", { name: "Log in as B" }));
    await waitFor(() => expect(screen.getByLabelText("Review user")).toHaveTextContent(userB.id));
    const accepted = captureLoginReviewSession()!;
    expect(await consumeLoginReview(accepted, () => true)).toBe(true);
    expect(await consumeLoginReview(accepted, () => true)).toBe(false);
    expect(tokenStorage.get()).toBe("token-b");
  });
});
