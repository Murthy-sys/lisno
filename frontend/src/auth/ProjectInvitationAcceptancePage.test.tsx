import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { StrictMode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../api/client";
import { authorizationFor } from "../test/authFixtures";
import { server } from "../test/server";
import { renderWithQuery } from "../test/render";
import { AuthProvider } from "./AuthProvider";
import { ProjectInvitationAcceptancePage } from "./ProjectInvitationAcceptancePage";

const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const password = "StrongPassword123!";
const client = { id: "invited-client", role: "client", name: "Invited client", email: "client@example.test" };
const inspection = {
  projectId: "invited-project", projectName: "Invited home", clientName: client.name,
  email: client.email, expiresAt: "2026-10-20T10:00:00Z", requiresSignIn: false
};

function inspect(requiresSignIn = false) {
  server.use(http.post("/api/v1/auth/project-invitations/inspect", async ({ request }) => {
    expect(await request.json()).toEqual({ token });
    expect(request.headers.get("Authorization")).toBeNull();
    expect(request.cache).toBe("no-store");
    expect(request.referrerPolicy).toBe("no-referrer");
    expect(window.location.hash).toBe("");
    return HttpResponse.json({ data: { ...inspection, requiresSignIn } });
  }));
}

function installSession(user = client) {
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({ data: user })),
    http.get("/api/v1/auth/authorization", () => HttpResponse.json({ data: authorizationFor("client") }))
  );
}

function showPage(hash = `#token=${token}`) {
  window.history.replaceState({}, "", `/accept-project-invitation${hash}`);
  return renderWithQuery(<AuthProvider><StrictMode><BrowserRouter><Routes>
    <Route path="/accept-project-invitation" element={<ProjectInvitationAcceptancePage />} />
    <Route path="/client/projects/:projectId" element={<h1>Client project</h1>} />
  </Routes></BrowserRouter></StrictMode></AuthProvider>);
}

async function fillPasswords(value = password) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Password", { exact: true }), value);
  await user.type(screen.getByLabelText("Confirm password"), value);
  return user;
}

afterEach(() => { window.history.replaceState({}, "", "/"); window.sessionStorage.clear(); });

describe("ProjectInvitationAcceptancePage", () => {
  it.each(["", "?token=do-not-accept", "#token=short", `#token=${token}&other=value`])("rejects malformed or nonfragment credentials (%s) without an inspection request", async (hash) => {
    const request = vi.fn();
    server.use(http.post("/api/v1/auth/project-invitations/inspect", request));
    showPage(hash);
    expect(await screen.findByRole("heading", { name: "Invitation unavailable" })).toHaveFocus();
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("shows only fixed invitation identity and keeps the token out of URL, DOM, and storage", async () => {
    inspect();
    const { container } = showPage();
    expect(await screen.findByRole("heading", { name: "Join your project" })).toBeVisible();
    expect(screen.getByText(inspection.projectName)).toBeVisible();
    expect(screen.getByText(client.email)).toBeVisible();
    expect(container.querySelector("input[type=email]")).toBeNull();
    expect(container.innerHTML).not.toContain(token);
    expect(window.location.href).not.toContain(token);
    expect(JSON.stringify(window.localStorage)).not.toContain(token);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(token);
  });

  it("validates password length and confirmation before sending, focuses invalid fields, and supports keyboard visibility", async () => {
    inspect();
    showPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Accept project invitation" }));
    const input = screen.getByLabelText("Password", { exact: true });
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription("Password must be at least 12 characters.");
    await user.type(input, password);
    await user.type(screen.getByLabelText("Confirm password"), "mismatch");
    await user.click(screen.getByRole("button", { name: "Accept project invitation" }));
    expect(screen.getByLabelText("Confirm password")).toHaveFocus();
    expect(screen.getByText("Passwords do not match.")).toBeVisible();
    screen.getByRole("button", { name: "Show password" }).focus();
    await user.keyboard("{Enter}");
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("accepts once, installs a validated client session, and links only the returned project", async () => {
    inspect(); installSession();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    let calls = 0;
    server.use(http.post("/api/v1/auth/project-invitations/accept", async ({ request }) => {
      calls++;
      expect(await request.json()).toEqual({ token, password, passwordConfirmation: password });
      expect(request.headers.get("Authorization")).toBeNull();
      await pending;
      return HttpResponse.json({ data: { token: "accepted-session", user: client, projectId: "invited-project" } });
    }));
    showPage();
    await fillPasswords();
    const form = screen.getByRole("button", { name: "Accept project invitation" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(calls).toBe(1));
    expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
    finish();
    expect(await screen.findByRole("heading", { name: "Project invitation accepted" })).toHaveFocus();
    expect(tokenStorage.get()).toBe("accepted-session");
    expect(screen.getByRole("link", { name: "Open project" })).toHaveAttribute("href", "/client/projects/invited-project");
  });

  it("signs an existing client in on this page before a separate explicit project acceptance", async () => {
    inspect(true); installSession();
    const login = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ email: client.email, password });
      return HttpResponse.json({ data: { token: "existing-client-session", user: client } });
    });
    const accept = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ token });
      expect(request.headers.get("Authorization")).toBe("Bearer existing-client-session");
      return HttpResponse.json({ data: { projectId: inspection.projectId } });
    });
    server.use(http.post("/api/v1/auth/login", login), http.post("/api/v1/auth/project-invitations/accept-existing", accept));
    showPage();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Password", { exact: true }), password);
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign in to continue" }));
    const acceptButton = await screen.findByRole("button", { name: "Accept project invitation" });
    expect(login).toHaveBeenCalledOnce();
    expect(accept).not.toHaveBeenCalled();
    await user.click(acceptButton);
    expect(await screen.findByRole("heading", { name: "Project invitation accepted" })).toBeVisible();
    expect(accept).toHaveBeenCalledOnce();
  });

  it("blocks a different account until explicit logout and never submits under that account", async () => {
    inspect(true); installSession({ ...client, id: "another-client", email: "another@example.test" });
    tokenStorage.set("different-account-session");
    showPage();
    expect(await screen.findByText("Use the invited client account")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeEnabled());
    expect(tokenStorage.get()).toBeNull();
  });

  it("preserves entered values through a retryable acceptance failure", async () => {
    inspect();
    server.use(http.post("/api/v1/auth/project-invitations/accept", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "private detail" } }, { status: 503 })));
    showPage();
    const user = await fillPasswords();
    await user.click(screen.getByRole("button", { name: "Accept project invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't accept your invitation. Please try again.");
    expect(screen.getByLabelText("Password", { exact: true })).toHaveValue(password);
    expect(screen.getByLabelText("Confirm password")).toHaveValue(password);
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });

  it("does not resubmit committed acceptance when session installation fails", async () => {
    inspect();
    server.use(
      http.post("/api/v1/auth/project-invitations/accept", () => HttpResponse.json({ data: { token: "accepted-session", user: client, projectId: inspection.projectId } })),
      http.get("/api/v1/auth/authorization", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Try later" } }, { status: 503 }))
    );
    showPage();
    const user = await fillPasswords();
    await user.click(screen.getByRole("button", { name: "Accept project invitation" }));
    expect(await screen.findByRole("heading", { name: "Project invitation accepted" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute("href", "/login");
    expect(tokenStorage.get()).toBeNull();
  });

  it("refreshes a transient inspection failure without exposing provider errors", async () => {
    let attempts = 0;
    server.use(http.post("/api/v1/auth/project-invitations/inspect", () => {
      attempts++;
      return attempts === 1 ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "private detail" } }, { status: 503 })
        : HttpResponse.json({ data: inspection });
    }));
    showPage();
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Join your project" })).toBeVisible();
    expect(attempts).toBe(2);
  });

  it("recovers a committed backend acceptance whose session response is unavailable", async () => {
    inspect();
    server.use(http.post("/api/v1/auth/project-invitations/accept", () => HttpResponse.json({ error: {
      code: "PROJECT_INVITATION_ACCEPTED_SIGN_IN_REQUIRED", message: "Invitation accepted; sign in."
    } }, { status: 409 })));
    showPage();
    const user = await fillPasswords();
    await user.click(screen.getByRole("button", { name: "Accept project invitation" }));
    expect(await screen.findByRole("heading", { name: "Project invitation accepted" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue to sign in" })).toBeVisible();
  });

  it("switches to existing-account sign-in when the account is created after inspection", async () => {
    inspect();
    server.use(http.post("/api/v1/auth/project-invitations/accept", () => HttpResponse.json({ error: {
      code: "CLIENT_SIGN_IN_REQUIRED", message: "Sign in."
    } }, { status: 409 })));
    showPage();
    const user = await fillPasswords();
    await user.click(screen.getByRole("button", { name: "Accept project invitation" }));
    expect(await screen.findByRole("button", { name: "Sign in to continue" })).toBeVisible();
    expect(screen.getByLabelText("Password", { exact: true })).toHaveValue("");
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
  });

  it("changes an expired or revoked acceptance to the generic unavailable state", async () => {
    inspect();
    server.use(http.post("/api/v1/auth/project-invitations/accept", () => HttpResponse.json({ error: { code: "PROJECT_INVITATION_UNAVAILABLE", message: "private detail" } }, { status: 400 })));
    showPage();
    const user = await fillPasswords();
    await user.click(screen.getByRole("button", { name: "Accept project invitation" }));
    expect(await screen.findByRole("heading", { name: "Invitation unavailable" })).toHaveFocus();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });
});
