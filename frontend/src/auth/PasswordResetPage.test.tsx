import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { StrictMode } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../api/client";
import { FeedbackProvider } from "../components/feedback/FeedbackProvider";
import { authorizationFor } from "../test/authFixtures";
import { server } from "../test/server";
import { AuthProvider } from "./AuthProvider";
import { PasswordResetPage } from "./PasswordResetPage";
import { capturePasswordResetTokenBeforeRouterMount } from "./passwordResetTokenVault";

const TEST_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const UNAVAILABLE_MESSAGE =
  "Reset link unavailable. This link is invalid, expired, or has already been used.";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function storageContents(storage: Storage): Record<string, string | null> {
  return Object.fromEntries(
    Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index)!;
      return [key, storage.getItem(key)];
    })
  );
}

interface RouterObservation {
  pathname: string;
  search: string;
  hash: string;
}

function RouterLocationObserver({
  report
}: {
  report(observation: RouterObservation): void;
}) {
  const location = useLocation();
  report({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash
  });
  return null;
}

function renderPage(
  hash = `#token=${TEST_TOKEN}`,
  search = "?source=email"
) {
  const routerObservations: RouterObservation[] = [];
  const historyState = {
    usr: { safe: "router-state" },
    key: "password-reset-test",
    idx: 3,
    marker: "preserve-history-state"
  };
  window.history.replaceState(
    historyState,
    "",
    `/reset-password${search}${hash}`
  );
  capturePasswordResetTokenBeforeRouterMount();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return {
    historyState,
    queryClient,
    routerObservations,
    ...render(
      <QueryClientProvider client={queryClient}>
        <FeedbackProvider>
          <AuthProvider>
            <StrictMode>
              <BrowserRouter>
                <RouterLocationObserver
                  report={(observation) => {
                    routerObservations.push(observation);
                  }}
                />
                <Routes>
                  <Route path="/reset-password" element={<PasswordResetPage />} />
                </Routes>
              </BrowserRouter>
            </StrictMode>
          </AuthProvider>
        </FeedbackProvider>
      </QueryClientProvider>
    )
  };
}

function installInspection() {
  server.use(
    http.post("/api/v1/auth/password-reset/inspect", () =>
      HttpResponse.json({ data: { available: true } })
    )
  );
}

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  capturePasswordResetTokenBeforeRouterMount();
});

describe("PasswordResetPage", () => {
  it("scrubs the exact fragment before one StrictMode inspection and retains no token-bearing surface", async () => {
    const inspectGate = deferred();
    let inspectCalls = 0;
    let requestUrl = "";
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined)
    ];
    window.localStorage.setItem("safe-local", "kept");
    window.sessionStorage.setItem("safe-session", "kept");
    server.use(
      http.post("/api/v1/auth/password-reset/inspect", async ({ request }) => {
        inspectCalls += 1;
        requestUrl = request.url;
        expect(window.location.hash).toBe("");
        await inspectGate.promise;
        return HttpResponse.json({ data: { available: true, identity: "must-not-render" } });
      })
    );

    const { historyState, queryClient, routerObservations } = renderPage();

    await waitFor(() => expect(inspectCalls).toBe(1));
    inspectGate.resolve();
    expect(
      await screen.findByRole("heading", { name: "Choose a new password" })
    ).toBeVisible();
    expect(screen.queryByText("must-not-render")).not.toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe("/reset-password");
    expect(window.history.state).toEqual(historyState);
    expect(routerObservations.length).toBeGreaterThan(0);
    expect(routerObservations).toEqual(
      expect.arrayContaining([
        { pathname: "/reset-password", search: "", hash: "" }
      ])
    );
    for (const observation of routerObservations) {
      expect(observation.hash).toBe("");
      expect(JSON.stringify(observation)).not.toContain(TEST_TOKEN);
    }
    expect(requestUrl).not.toContain(TEST_TOKEN);
    expect(document.documentElement.innerHTML).not.toContain(TEST_TOKEN);
    expect(window.location.href).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(window.history.state)).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(storageContents(window.localStorage))).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(storageContents(window.sessionStorage))).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(TEST_TOKEN);
    expect(
      consoleSpies.flatMap((spy) => spy.mock.calls.flat()).map(String).join(" ")
    ).not.toContain(TEST_TOKEN);
  });

  it.each([
    ["missing token", ""],
    ["wrong key", `#reset=${TEST_TOKEN}`],
    ["short token", `#token=${"A".repeat(42)}`],
    ["long token", `#token=${"A".repeat(44)}`],
    ["padded token", `#token=${"A".repeat(42)}=`],
    ["extra parameter", `#token=${TEST_TOKEN}&source=mail`]
  ])("rejects a %s without inspecting and uses one unavailable UI", async (_case, hash) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPage(hash);

    expect(await screen.findByText(UNAVAILABLE_MESSAGE)).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("does not accept a query token and removes query data before rendering unavailable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderPage("", `?token=${TEST_TOKEN}`);

    expect(await screen.findByText(UNAVAILABLE_MESSAGE)).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe("/reset-password");
    expect(window.location.href).not.toContain(TEST_TOKEN);
  });

  it("normalizes every inspection error to the same unavailable state", async () => {
    server.use(
      http.post("/api/v1/auth/password-reset/inspect", () =>
        HttpResponse.json(
          {
            error: {
              code: "PASSWORD_RESET_UNAVAILABLE",
              message: "Unsafe reset detail"
            }
          },
          { status: 410 }
        )
      )
    );
    renderPage();

    expect(await screen.findByText(UNAVAILABLE_MESSAGE)).toBeVisible();
    expect(screen.queryByText("Unsafe reset detail")).not.toBeInTheDocument();
  });

  it("has no automated accessibility violations in the ready state", async () => {
    installInspection();
    renderPage();

    await screen.findByRole("heading", { name: "Choose a new password" });
    expect(
      (
        await axe.run(document.body, {
          rules: { "color-contrast": { enabled: false } }
        })
      ).violations
    ).toEqual([]);
  });

  it("validates 12–128 matching passwords, focuses errors, and toggles visibility", async () => {
    installInspection();
    const user = userEvent.setup();
    renderPage();
    const password = await screen.findByLabelText("New password");
    const confirmation = screen.getByLabelText("Confirm new password");

    await user.type(password, "short");
    await user.type(confirmation, "different-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(password).toHaveFocus();
    expect(screen.getByText("Password must be at least 12 characters.")).toBeVisible();

    await user.clear(password);
    await user.type(password, "StrongPassword123!");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(confirmation).toHaveFocus();
    expect(screen.getByText("Passwords do not match.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Show new password" }));
    await user.click(
      screen.getByRole("button", { name: "Show confirmation password" })
    );
    expect(password).toHaveAttribute("type", "text");
    expect(confirmation).toHaveAttribute("type", "text");

    await user.clear(password);
    await user.type(password, "A".repeat(129));
    await user.clear(confirmation);
    await user.type(confirmation, "A".repeat(129));
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("Password must be at most 128 characters.")).toBeVisible();
  });

  it("completes once while pending, clears inputs, and does not create a session or redirect", async () => {
    installInspection();
    const completionGate = deferred();
    let completeCalls = 0;
    server.use(
      http.post("/api/v1/auth/password-reset/complete", async ({ request }) => {
        completeCalls += 1;
        expect(await request.json()).toEqual({
          token: TEST_TOKEN,
          password: "StrongPassword123!",
          passwordConfirmation: "StrongPassword123!"
        });
        expect(request.headers.get("authorization")).toBeNull();
        await completionGate.promise;
        return HttpResponse.json({ data: { reset: true } });
      })
    );
    const user = userEvent.setup();
    renderPage();
    const password = await screen.findByLabelText("New password");
    const confirmation = screen.getByLabelText("Confirm new password");
    await user.type(password, "StrongPassword123!");
    await user.type(confirmation, "StrongPassword123!");
    const submit = screen.getByRole("button", { name: "Update password" });

    await user.dblClick(submit);
    await waitFor(() => expect(completeCalls).toBe(1));
    expect(submit).toBeDisabled();
    completionGate.resolve();

    expect(await screen.findByRole("heading", { name: "Password updated" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in with your new password" })
    ).toHaveAttribute("href", "/login");
    expect(window.location.pathname).toBe("/reset-password");
    expect(tokenStorage.get()).toBeNull();
    expect(password).toHaveValue("");
    expect(confirmation).toHaveValue("");
    expect(completeCalls).toBe(1);
  });

  it("moves a completion-time race to the generic unavailable state", async () => {
    installInspection();
    server.use(
      http.post("/api/v1/auth/password-reset/complete", () =>
        HttpResponse.json(
          {
            error: {
              code: "PASSWORD_RESET_UNAVAILABLE",
              message: "Token was consumed by a concurrent request"
            }
          },
          { status: 410 }
        )
      )
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText("New password"), "StrongPassword123!");
    await user.type(screen.getByLabelText("Confirm new password"), "StrongPassword123!");

    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText(UNAVAILABLE_MESSAGE)).toBeVisible();
    expect(
      screen.queryByText("Token was consumed by a concurrent request")
    ).not.toBeInTheDocument();
  });

  it("keeps transient completion failures retryable", async () => {
    installInspection();
    let completeCalls = 0;
    server.use(
      http.post("/api/v1/auth/password-reset/complete", () => {
        completeCalls += 1;
        if (completeCalls === 1) {
          return HttpResponse.json(
            { error: { code: "TEMPORARY_FAILURE", message: "Unsafe detail" } },
            { status: 503 }
          );
        }
        return HttpResponse.json({ data: { reset: true } });
      })
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText("New password"), "StrongPassword123!");
    await user.type(screen.getByLabelText("Confirm new password"), "StrongPassword123!");
    const submit = screen.getByRole("button", { name: "Update password" });

    await user.click(submit);
    expect(
      await screen.findByText("We couldn't update your password. Please try again.")
    ).toBeVisible();
    expect(screen.queryByText("Unsafe detail")).not.toBeInTheDocument();
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(await screen.findByRole("heading", { name: "Password updated" })).toBeVisible();
    expect(completeCalls).toBe(2);
  });

  it("allows inspection but requires explicit logout before reset completion", async () => {
    tokenStorage.set("existing-session-token");
    installInspection();
    const fetchThroughMsw = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/v1/auth/me") {
        return Response.json({
          data: {
            id: "user-existing",
            name: "Existing User",
            email: "existing@example.com",
            role: "designer"
          }
        });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor("designer") });
      }
      return fetchThroughMsw(input, init);
    });
    let completeCalls = 0;
    server.use(
      http.post("/api/v1/auth/password-reset/complete", () => {
        completeCalls += 1;
        return HttpResponse.json({ data: { reset: true } });
      })
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/already signed in/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Update password" })).toBeDisabled();
    expect(completeCalls).toBe(0);

    await user.click(screen.getByRole("button", { name: "Log out to reset password" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled()
    );
    expect(tokenStorage.get()).toBeNull();
    expect(window.location.pathname).toBe("/reset-password");
  });

  it("blocks restoring and failed sessions until explicit logout", async () => {
    tokenStorage.set("uncertain-session-token");
    installInspection();
    const restoreGate = deferred();
    const fetchThroughMsw = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/v1/auth/me" || path === "/api/v1/auth/authorization") {
        await restoreGate.promise;
        return Response.json(
          { error: { code: "RESTORE_FAILED", message: "Unsafe detail" } },
          { status: 500 }
        );
      }
      return fetchThroughMsw(input, init);
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/checking your current session/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Update password" })).toBeDisabled();
    restoreGate.resolve();
    expect(
      await screen.findByText(/couldn't safely verify your current session/i)
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Update password" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Log out to reset password" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled()
    );
    expect(tokenStorage.get()).toBeNull();
  });
});
