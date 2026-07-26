import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { apiClient, tokenStorage } from "../api/client";
import type { PublicUser } from "../api/types";
import { AuthProvider, useAuth } from "./AuthProvider";

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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function AuthHarness() {
  const auth = useAuth();

  return (
    <>
      <output aria-label="Authentication status">{auth.status}</output>
      <output aria-label="Current user">{auth.user?.name ?? "none"}</output>
      <button type="button" onClick={() => void auth.logout()}>
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

describe("AuthProvider session concurrency", () => {
  it("restores the current session when wrapped in production StrictMode", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: userA })
    );

    renderAuthProvider(undefined, (children) => (
      <StrictMode>{children}</StrictMode>
    ));

    await waitFor(() => {
      expect(screen.getByLabelText("Authentication status")).toHaveTextContent(
        "authenticated"
      );
      expect(screen.getByLabelText("Current user")).toHaveTextContent("User A");
    });
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
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      restoreSignal = init?.signal ?? undefined;
      await restoreGate.promise;
      return Response.json({ data: userA });
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
      if (String(input).endsWith("/auth/me")) {
        restoreSignal = init?.signal ?? undefined;
        await restoreGate.promise;
        return Response.json(
          { error: { code: "INTERNAL_ERROR", message: "Restore failed." } },
          { status: 500 }
        );
      }
      return Response.json({ data: { token: "token-b", user: userB } });
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
    let restoreSignal: AbortSignal | undefined;
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      restoreSignal = init?.signal ?? undefined;
      await restoreGate.promise;
      return Response.json({ data: userA });
    });
    const { unmount } = renderAuthProvider();
    await waitFor(() => expect(restoreSignal).toBeDefined());

    unmount();

    expect(restoreSignal?.aborted).toBe(true);
    restoreGate.resolve();
  });
});

describe("AuthProvider cache isolation", () => {
  it("cancels authenticated queries and removes user data on logout", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: userA })
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
      if (String(input).endsWith("/auth/me")) {
        return Response.json({ data: userA });
      }
      return Response.json({ data: { token: "token-b", user: userB } });
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

  it("clears authenticated cache after an accepted 401", async () => {
    tokenStorage.set("token-a");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/auth/me")) {
        return Response.json({ data: userA });
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
    expect(tokenStorage.get()).toBeNull();
    expect(queryClient.getQueryData(["viewer"])).toBeUndefined();
    expect(queryClient.getQueryState(["in-flight"])).toBeUndefined();
    await inFlight.pendingQuery;
  });
});
