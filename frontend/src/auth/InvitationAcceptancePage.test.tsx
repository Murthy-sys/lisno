import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { StrictMode } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../api/client";
import { authorizationFor } from "../test/authFixtures";
import { server } from "../test/server";
import { FeedbackProvider } from "../components/feedback/FeedbackProvider";
import { AuthProvider } from "./AuthProvider";
import { InvitationAcceptancePage } from "./InvitationAcceptancePage";

const RAW_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const EXPIRY = "2026-08-25T10:00:00.000Z";
const UNAVAILABLE_MESSAGE =
  "This invitation is unavailable. Ask an administrator to send a new invitation.";

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

function RouterHashObserver({
  reportScrubbed
}: {
  reportScrubbed(scrubbed: boolean): void;
}) {
  reportScrubbed(useLocation().hash === "");
  return null;
}

function renderPage(hash = `#token=${RAW_TOKEN}`) {
  let routerHashScrubbed = false;
  const historyState = {
    usr: { safe: "router-state" },
    key: "invitation-test",
    idx: 4,
    marker: "preserve-history-state"
  };
  window.history.replaceState(
    historyState,
    "",
    `/accept-invitation?source=email${hash}`
  );
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return {
    historyState,
    queryClient,
    routerHashIsScrubbed: () => routerHashScrubbed,
    ...render(
      <QueryClientProvider client={queryClient}>
        <FeedbackProvider>
          <AuthProvider>
            <StrictMode>
              <BrowserRouter>
                <RouterHashObserver
                  reportScrubbed={(scrubbed) => {
                    routerHashScrubbed = scrubbed;
                  }}
                />
                <Routes>
                  <Route
                    path="/accept-invitation"
                    element={<InvitationAcceptancePage />}
                  />
                </Routes>
              </BrowserRouter>
            </StrictMode>
          </AuthProvider>
        </FeedbackProvider>
      </QueryClientProvider>
    )
  };
}

function installInspection(
  response: Record<string, unknown> = {
    name: "Asha Rao",
    email: "asha@example.com",
    role: "designer",
    expiresAt: EXPIRY
  }
) {
  server.use(
    http.post("/api/v1/auth/user-invitations/inspect", () =>
      HttpResponse.json({ data: response })
    )
  );
}

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("InvitationAcceptancePage", () => {
  it("scrubs the exact fragment before one StrictMode inspection and retains no token-bearing surface", async () => {
    const inspectGate = deferred();
    let inspectCalls = 0;
    let requestUrl = "";
    let requestSignal: AbortSignal | undefined;
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined)
    ];
    window.localStorage.setItem("safe-local", "kept");
    window.sessionStorage.setItem("safe-session", "kept");
    server.use(
      http.post("/api/v1/auth/user-invitations/inspect", async ({ request }) => {
        inspectCalls += 1;
        requestUrl = request.url;
        requestSignal = request.signal;
        expect(window.location.hash).toBe("");
        expect(window.history.state).toEqual({
          usr: { safe: "router-state" },
          key: "invitation-test",
          idx: 4,
          marker: "preserve-history-state"
        });
        await inspectGate.promise;
        return HttpResponse.json({
          data: {
            name: "Asha Rao",
            email: "asha@example.com",
            role: "designer",
            expiresAt: EXPIRY,
            mobile: "+91 98765 43210",
            title: "Must not render"
          }
        });
      })
    );

    const { historyState, queryClient, routerHashIsScrubbed } = renderPage();

    await waitFor(() => expect(inspectCalls).toBe(1));
    expect(requestSignal?.aborted).toBe(false);
    inspectGate.resolve();

    expect(await screen.findByRole("heading", { name: "Accept your invitation" })).toBeVisible();
    const summary = await screen.findByRole("definition", { name: "Asha Rao" });
    expect(summary).toBeVisible();
    expect(screen.getByText("asha@example.com")).toBeVisible();
    expect(screen.getByText("Designer")).toBeVisible();
    expect(screen.getByText(EXPIRY)).toHaveAttribute("dateTime", EXPIRY);
    expect(screen.queryByText("+91 98765 43210")).not.toBeInTheDocument();
    expect(screen.queryByText("Must not render")).not.toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe(
      "/accept-invitation?source=email"
    );
    expect(window.history.state).toEqual(historyState);
    expect(routerHashIsScrubbed()).toBe(true);
    expect(requestUrl).not.toContain(RAW_TOKEN);
    expect(document.documentElement.innerHTML).not.toContain(RAW_TOKEN);
    expect(window.location.href).not.toContain(RAW_TOKEN);
    expect(JSON.stringify(window.history.state)).not.toContain(RAW_TOKEN);
    expect(JSON.stringify(storageContents(window.localStorage))).not.toContain(RAW_TOKEN);
    expect(JSON.stringify(storageContents(window.sessionStorage))).not.toContain(RAW_TOKEN);
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(RAW_TOKEN);
    expect(
      consoleSpies.flatMap((spy) => spy.mock.calls.flat()).map(String).join(" ")
    ).not.toContain(RAW_TOKEN);
  });

  it.each([
    ["missing token", ""],
    ["wrong key", `#invite=${RAW_TOKEN}`],
    ["short token", `#token=${"A".repeat(42)}`],
    ["long token", `#token=${"A".repeat(44)}`],
    ["padded token", `#token=${"A".repeat(42)}=`],
    ["extra parameter", `#token=${RAW_TOKEN}&source=mail`]
  ])("rejects a %s with the same generic unavailable UI", async (_case, hash) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPage(hash);

    expect(await screen.findByText(UNAVAILABLE_MESSAGE)).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("uses the same generic unavailable UI when inspection fails", async () => {
    server.use(
      http.post("/api/v1/auth/user-invitations/inspect", () =>
        HttpResponse.json(
          { error: { code: "INVITATION_UNAVAILABLE", message: "provider detail" } },
          { status: 401 }
        )
      )
    );
    renderPage();

    expect(await screen.findByText(UNAVAILABLE_MESSAGE)).toBeVisible();
    expect(screen.queryByText(/provider detail/i)).not.toBeInTheDocument();
  });

  it("validates 12–128 matching passwords, associates errors, focuses them, and toggles visibility", async () => {
    installInspection();
    const user = userEvent.setup();
    renderPage();
    const password = await screen.findByLabelText("Password");
    const confirmation = screen.getByLabelText("Confirm password");

    await user.type(password, "short");
    await user.type(confirmation, "different-password");
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));

    expect(password).toHaveFocus();
    expect(password).toHaveAttribute("aria-describedby", "invitation-password-error");
    expect(screen.getByText("Password must be at least 12 characters.")).toBeVisible();

    await user.clear(password);
    await user.type(password, "StrongPassword123!");
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveAttribute(
      "aria-describedby",
      "invitation-password-confirmation-error"
    );
    expect(screen.getByText("Passwords do not match.")).toBeVisible();

    const showPassword = screen.getByRole("button", { name: "Show password" });
    const showConfirmation = screen.getByRole("button", {
      name: "Show confirmation password"
    });
    await user.click(showPassword);
    await user.click(showConfirmation);
    expect(password).toHaveAttribute("type", "text");
    expect(confirmation).toHaveAttribute("type", "text");
    expect(showPassword).toHaveAttribute("aria-pressed", "true");
    expect(showConfirmation).toHaveAttribute("aria-pressed", "true");

    await user.clear(password);
    await user.type(password, "A".repeat(129));
    await user.clear(confirmation);
    await user.type(confirmation, "A".repeat(129));
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(screen.getByText("Password must be at most 128 characters.")).toBeVisible();
  });

  it("submits one acceptance while pending and never installs an authenticated session", async () => {
    installInspection();
    const acceptGate = deferred();
    let acceptCalls = 0;
    server.use(
      http.post("/api/v1/auth/user-invitations/accept", async ({ request }) => {
        acceptCalls += 1;
        expect(await request.json()).toEqual({
          token: RAW_TOKEN,
          password: "StrongPassword123!",
          passwordConfirmation: "StrongPassword123!"
        });
        await acceptGate.promise;
        return HttpResponse.json({ data: { accepted: true } }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText("Password"), "StrongPassword123!");
    await user.type(screen.getByLabelText("Confirm password"), "StrongPassword123!");
    const submit = screen.getByRole("button", { name: "Accept invitation" });

    await user.dblClick(submit);
    await waitFor(() => expect(acceptCalls).toBe(1));
    expect(submit).toBeDisabled();
    expect(tokenStorage.get()).toBeNull();
    acceptGate.resolve();

    expect(await screen.findByRole("heading", { name: "Invitation accepted" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(tokenStorage.get()).toBeNull();
    expect(acceptCalls).toBe(1);
  });

  it("keeps an authenticated session mounted and requires explicit logout before acceptance", async () => {
    tokenStorage.set("existing-session-token");
    installInspection();
    const fetchThroughMsw = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/v1/auth/me") {
        return Response.json({
          data: {
            id: "user-designer",
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
    let acceptCalls = 0;
    server.use(
      http.post("/api/v1/auth/user-invitations/accept", () => {
        acceptCalls += 1;
        return HttpResponse.json({ data: { accepted: true } }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderPage();
    const password = await screen.findByLabelText("Password");
    await user.type(password, "StrongPassword123!");
    await user.type(screen.getByLabelText("Confirm password"), "StrongPassword123!");

    expect(await screen.findByText(/signed in as Existing User/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
    expect(acceptCalls).toBe(0);

    await user.click(screen.getByRole("button", { name: "Log out to accept invitation" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled()
    );
    expect(tokenStorage.get()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByRole("heading", { name: "Invitation accepted" })).toBeVisible();
    expect(acceptCalls).toBe(1);
  });

  it("blocks restoring and failed sessions until explicit logout", async () => {
    tokenStorage.set("uncertain-session-token");
    installInspection();
    const restoreGate = deferred();
    const fetchThroughMsw = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (
        path === "/api/v1/auth/me" ||
        path === "/api/v1/auth/authorization"
      ) {
        await restoreGate.promise;
        return Response.json(
          { error: { code: "RESTORE_FAILED", message: "unsafe detail" } },
          { status: 500 }
        );
      }
      return fetchThroughMsw(input, init);
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/checking your current session/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
    restoreGate.resolve();
    expect(await screen.findByText(/couldn't safely verify your current session/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Log out to accept invitation" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled()
    );
    expect(tokenStorage.get()).toBeNull();
  });
});
