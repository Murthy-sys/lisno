import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../api/client";
import { renderApp } from "../test/render";

const designer = {
  id: "user-designer-ananya",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer" as const
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function apiRequestPath(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    const url = new URL(input.url);
    return `${url.pathname}${url.search}`;
  }

  if (input instanceof URL) {
    return `${input.pathname}${input.search}`;
  }

  try {
    const url = new URL(input);
    return `${url.pathname}${url.search}`;
  } catch {
    return input;
  }
}

describe("apiRequestPath", () => {
  it("keeps a malformed relative API path distinct from a root-relative path", () => {
    expect(apiRequestPath("api/v1/auth/me?source=restore")).toBe(
      "api/v1/auth/me?source=restore"
    );
    expect(apiRequestPath("/api/v1/auth/me?source=restore")).toBe(
      "/api/v1/auth/me?source=restore"
    );
  });

  it("reads a real Request URL and retains its query", () => {
    const request = new Request(
      "https://api.lisno.example/api/v1/auth/me?source=restore&attempt=2"
    );

    expect(apiRequestPath(request)).toBe(
      "/api/v1/auth/me?source=restore&attempt=2"
    );
  });

  it("strips the origin from an absolute URL string without changing its query", () => {
    expect(
      apiRequestPath(
        "https://api.lisno.example/api/v1/projects?tag=room%20plan&tag=approved"
      )
    ).toBe("/api/v1/projects?tag=room%20plan&tag=approved");
  });

  it("reads a URL object without changing its encoded query", () => {
    const url = new URL(
      "https://api.lisno.example/api/v1/leads?stage=estimate%2Fin_progress&stage=won"
    );

    expect(apiRequestPath(url)).toBe(
      "/api/v1/leads?stage=estimate%2Fin_progress&stage=won"
    );
  });
});

function installDesignerApi(
  inspectAuth?: (input: RequestInfo | URL, init?: RequestInit) => void
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = apiRequestPath(input);
    if (url === "/api/v1/auth/me") {
      inspectAuth?.(input, init);
      return Response.json({ data: designer });
    }
    if (url.startsWith("/api/v1/projects?")) {
      return Response.json({
        data: {
          items: [],
          pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
        }
      });
    }
    if (url.startsWith(`/api/v1/kpis/users/${designer.id}/tasks?`)) {
      return Response.json({
        data: {
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
        }
      });
    }
    if (url.startsWith(`/api/v1/kpis/users/${designer.id}?`)) {
      return Response.json({
        data: {
          userId: designer.id,
          periodStartAt: "2000-01-01T00:00:00.000Z",
          periodEndAt: "2100-01-01T00:00:00.000Z",
          score: 0,
          components: [],
          aggregates: {
            taskCounts: { total: 0, completed: 0, active: 0 },
            riskCounts: { gray: 0, green: 0, yellow: 0, red: 0 },
            effort: {
              planned: 0,
              completed: 0,
              remaining: 0,
              workloadPercentage: 0
            },
            projects: [],
            recentActivity: []
          },
          tasks: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        }
      });
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("protected role routing", () => {
  it("focuses the signup heading after PUSH navigation from login", async () => {
    const user = userEvent.setup();
    renderApp(["/login"]);

    await user.click(
      await screen.findByRole("link", { name: "Create a client account" })
    );

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Create your client account"
    });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("marks interactive signup focus after a failed attempt is retried", async () => {
    let signupAttempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = apiRequestPath(input);
      if (url === "/api/v1/auth/client-signup") {
        signupAttempts += 1;
        if (signupAttempts === 1) {
          return Response.json(
            {
              error: {
                code: "SERVER_ERROR",
                message: "Please try again."
              }
            },
            { status: 503 }
          );
        }
        return Response.json(
          {
            data: {
              token: "client-token",
              user: {
                id: "client-priya",
                name: "Priya Shah",
                email: "priya@example.com",
                role: "client"
              }
            }
          },
          { status: 201 }
        );
      }
      if (url === "/api/v1/client/latest-approved-versions") {
        return Response.json({ data: [] });
      }
      if (url.startsWith("/api/v1/client/project-summaries")) {
        return Response.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        });
      }
      if (url === "/api/v1/client/estimates") {
        return Response.json({ data: [] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const { router } = renderApp(["/signup"]);

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Priya Shah" }
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "priya@example.com" }
    });
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "+91 98765 43210" }
    });
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "42 Garden Lane, Bengaluru" }
    });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "StrongPassword!23" }
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "StrongPassword!23" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Create client account" }));
    expect(await screen.findByRole("alert", { name: "Signup error" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Create client account" }));

    const heading = await screen.findByRole("heading", {
      name: "Your design plans"
    });
    expect(signupAttempts).toBe(2);
    expect(router.state.location.state).toEqual({ routeFocus: true });
    expect(heading).toHaveFocus();
  });

  it("keeps a restore-driven authenticated signup redirect unmarked", async () => {
    const client = {
      id: "client-priya",
      name: "Priya Shah",
      email: "priya@example.com",
      role: "client" as const
    };
    tokenStorage.set("restored-client-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = apiRequestPath(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: client });
      if (url === "/api/v1/client/latest-approved-versions") {
        return Response.json({ data: [] });
      }
      if (url.startsWith("/api/v1/client/project-summaries")) {
        return Response.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        });
      }
      if (url === "/api/v1/client/estimates") {
        return Response.json({ data: [] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const { router } = renderApp(["/signup"]);

    const heading = await screen.findByRole("heading", {
      name: "Your design plans"
    });
    expect(router.state.location.state).toBeNull();
    expect(heading).not.toHaveFocus();
  });

  it("lets a safe captured login return win through marked replace navigation", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = apiRequestPath(input);
      if (url === "/api/v1/auth/login") {
        return Response.json({
          data: { token: "designer-token", user: designer }
        });
      }
      if (url === "/api/v1/projects/project-return") {
        return Response.json({
          data: {
            id: "project-return",
            name: "Captured return project",
            clientId: "client-1",
            initiatingDesignerId: designer.id,
            assignedDesignerIds: [designer.id],
            managerId: "manager-1",
            status: "active",
            location: "Bengaluru",
            plannedStartAt: "2026-06-01T00:00:00.000Z",
            plannedEndAt: "2026-09-30T00:00:00.000Z",
            actualStartAt: null,
            actualEndAt: null,
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
            floors: []
          }
        });
      }
      if (url.startsWith("/api/v1/projects/project-return/design-versions?")) {
        return Response.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const { router } = renderApp(["/designer/projects/project-return"]);
    await screen.findByRole("heading", { name: "Welcome back" });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ananya@lisno.example" }
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "LisnoDemo2026!" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const heading = await screen.findByRole("heading", {
      name: "Captured return project"
    });
    expect(router.state.location.pathname).toBe(
      "/designer/projects/project-return"
    );
    expect(heading).toHaveFocus();
  });

  it("opens the estimator sales workspace for an estimator sales session", async () => {
    tokenStorage.set("sales-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = apiRequestPath(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "user-estimator-sales", name: "Priya Sharma", email: "sales@lisno.example", role: "estimator_sales" } });
      if (url.startsWith("/api/v1/leads?")) return Response.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } });
      throw new Error(`Unhandled request: ${url}`);
    });

    const { router } = renderApp(["/estimator-sales"]);
    expect(await screen.findByRole("heading", { name: "Lead workspace" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/estimator-sales");
  });

  it("opens estimate configuration from a lead-scoped estimator route", async () => {
    tokenStorage.set("sales-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = apiRequestPath(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "user-estimator-sales", name: "Priya Sharma", email: "sales@lisno.example", role: "estimator_sales" } });
      if (url === "/api/v1/leads/lead-1") return Response.json({ data: { id: "lead-1", ownerId: "user-estimator-sales", clientName: "Test User", clientEmail: "test@example.com", clientMobile: "8500098088", projectName: "Test project", location: "Bangalore", propertyType: "2BHK", budgetMin: 1000000, budgetMax: 1500000, source: "Walk-in", stage: "estimate_in_progress", nextAction: "estimate", nextActionAt: "2026-07-29T10:00:00.000Z", builder: null, areaSqft: null, targetHandoverAt: null, notes: null, latestActivityAt: null, createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T10:00:00.000Z" } });
      throw new Error(`Unhandled request: ${url}`);
    });

    const { router } = renderApp(["/estimator-sales/leads/lead-1/estimate"]);

    expect(await screen.findByRole("heading", { name: /configure estimate/i })).toBeVisible();
    expect(router.state.location.pathname).toBe("/estimator-sales/leads/lead-1/estimate");
  });

  it("continues from configured rooms to estimate item selection", async () => {
    tokenStorage.set("sales-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = apiRequestPath(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "user-estimator-sales", name: "Priya Sharma", email: "sales@lisno.example", role: "estimator_sales" } });
      if (url === "/api/v1/leads/lead-1") return Response.json({ data: { id: "lead-1", ownerId: "user-estimator-sales", clientName: "Test User", clientEmail: "test@example.com", clientMobile: "8500098088", projectName: "Test project", location: "Bangalore", propertyType: "2BHK", budgetMin: 1000000, budgetMax: 1500000, source: "Walk-in", stage: "estimate_in_progress", nextAction: "estimate", nextActionAt: "2026-07-29T10:00:00.000Z", builder: null, areaSqft: null, targetHandoverAt: null, notes: null, latestActivityAt: null, createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T10:00:00.000Z" } });
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();
    renderApp(["/estimator-sales/leads/lead-1/estimate"]);
    await user.click(await screen.findByRole("button", { name: /master bedroom/i }));
    await user.click(screen.getByRole("button", { name: /continue to item selection/i }));
    expect(await screen.findByRole("heading", { name: /select estimate items/i })).toBeVisible();
  });

  it("restores saved rooms and selected estimate items when an estimator reopens an estimate", async () => {
    tokenStorage.set("sales-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = apiRequestPath(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "user-estimator-sales", name: "Priya Sharma", email: "sales@lisno.example", role: "estimator_sales" } });
      if (url === "/api/v1/leads/lead-1") return Response.json({ data: { id: "lead-1", ownerId: "user-estimator-sales", clientName: "Test User", clientEmail: "test@example.com", clientMobile: "8500098088", projectName: "Test project", location: "Bangalore", propertyType: "2BHK", budgetMin: 1000000, budgetMax: 1500000, source: "Walk-in", stage: "estimate_in_progress", nextAction: "estimate", nextActionAt: "2026-07-29T10:00:00.000Z", builder: null, areaSqft: null, targetHandoverAt: null, notes: null, latestActivityAt: null, createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T10:00:00.000Z" } });
      if (url === "/api/v1/leads/lead-1/estimate") return Response.json({ data: {
        id: "estimate-1", status: "draft", approvalRequired: false, propertyType: "2BHK",
        rooms: [{ id: "master-1", typeId: "master", label: "Master Bedroom", icon: "🛏️", sqft: 200, length: 10, width: 20 }],
        scopes: ["FC"],
        lineItems: [{ catalogueId: "FC01", roomName: "Master Bedroom", specification: "plain_gyp", unit: "sqft", rate: 95, quantity: 200, included: true }],
        subtotal: 19000, gst: 3420, total: 22420
      } });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/estimator-sales/leads/lead-1/estimate"]);

    expect(await screen.findByRole("heading", { name: /select estimate items/i })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /FC01/i })).toBeChecked();
    expect(screen.getByText("₹22,420")).toBeVisible();
  });

  it("restores a persisted token through /auth/me before showing the role home", async () => {
    tokenStorage.set("restored-token");
    installDesignerApi((input, init) => {
      expect(apiRequestPath(input)).toBe("/api/v1/auth/me");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer restored-token"
      );
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    const { router } = renderApp(["/designer"]);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Opening your workspace" })
    ).toBeVisible();
    expect(
      within(document.querySelector("main#main-content")!).getByRole("status", {
        name: "Content status"
      })
    ).toHaveTextContent("Restoring your session");
    expect(
      await screen.findByRole("heading", { name: "Good morning, Ananya." })
    ).toBeVisible();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(router.state.location.pathname).toBe("/designer");
  });

  it.each([
    ["/login", "Welcome back"],
    ["/signup", "Create your client account"],
    ["/", "Opening your workspace"],
    ["/missing-route", "Opening your workspace"]
  ])("retains the %s page heading while restoring a session", (path, heading) => {
    tokenStorage.set("pending-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => undefined)
    );

    renderApp([path]);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(
      within(document.querySelector("main#main-content")!).getByRole("status", {
        name: "Content status"
      })
    ).toHaveTextContent("Restoring your session");
  });

  it("keeps a valid token and stable page shell when protected restoration can be retried", async () => {
    tokenStorage.set("still-valid-token");
    const restoreRequest = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: { code: "SERVER_ERROR", message: "Please try again." } },
        { status: 500 }
      )
    );

    renderApp(["/designer"]);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Opening your workspace"
      })
    ).toBeVisible();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't restore your session."
    );
    expect(tokenStorage.get()).toBe("still-valid-token");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(restoreRequest).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(tokenStorage.get()).toBe("still-valid-token");
  });

  it.each([
    ["/login", "Welcome back"],
    ["/signup", "Create your client account"],
    ["/", "Welcome back"],
    ["/missing-route", "Welcome back"]
  ])("settles %s with one main and one page heading", async (path, heading) => {
    renderApp([path]);

    expect(
      await screen.findByRole("heading", { level: 1, name: heading })
    ).toBeVisible();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("clears an expired restored session and redirects to login", async () => {
    tokenStorage.set("expired-token");
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

    const { router } = renderApp(["/designer"]);

    expect(
      await screen.findByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/login");
    expect(tokenStorage.get()).toBeNull();
    expect(screen.queryByText("Your session expired. Sign in again.")).not.toBeInTheDocument();
  });

  it("replaces protected content with persistent login guidance after a mid-session 401", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();
    const { router } = renderApp(["/designer"]);
    await screen.findByRole("heading", { name: "Good morning, Ananya." });

    tokenStorage.clear();
    window.dispatchEvent(
      new CustomEvent("lisno:unauthorized", {
        detail: { token: "valid-token" }
      })
    );

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(screen.getByText("Your session expired. Sign in again.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Good morning, Ananya." })).not.toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(router.state.location.pathname).toBe("/login");
  });

  it("redirects a valid designer away from another role without destroying the session", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();

    const { router } = renderApp(["/manager"]);

    expect(
      await screen.findByRole("heading", { name: "Good morning, Ananya." })
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/designer");
    expect(tokenStorage.get()).toBe("valid-token");
    expect(screen.queryByRole("heading", { name: "Team delivery pulse" })).not.toBeInTheDocument();
  });

  it.each(["/", "/missing-route"])(
    "redirects an authenticated wildcard entry %s to the role home",
    async (path) => {
      tokenStorage.set("valid-token");
      installDesignerApi();

      const { router } = renderApp([path]);

      expect(
        await screen.findByRole("heading", { name: "Good morning, Ananya." })
      ).toBeVisible();
      expect(router.state.location.pathname).toBe("/designer");
    }
  );

  it("unmounts the protected shell while one full-page signing-out state owns progress", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();
    const cleanupGate = deferred();
    const { queryClient, router } = renderApp(["/designer"]);
    await screen.findByRole("heading", { name: "Good morning, Ananya." });
    vi.spyOn(queryClient, "cancelQueries").mockImplementation(async () => {
      await cleanupGate.promise;
    });

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("status", { name: "Content status" })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Signing out" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Content status" })).toHaveTextContent(
      "Signing out…"
    );
    expect(router.state.location.pathname).toBe("/designer");

    cleanupGate.resolve();
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("logs out, clears the token, and returns to login", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();
    const { router } = renderApp(["/designer"]);
    await screen.findByRole("heading", { name: "Good morning, Ananya." });

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/login");
    expect(tokenStorage.get()).toBeNull();
  });

  it("opens an accessible mobile drawer, wraps focus in both directions, and closes on Escape", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();
    renderApp(["/designer"]);
    await screen.findByRole("heading", { name: "Good morning, Ananya." });

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await userEvent.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(drawer).toBeVisible();
    await waitFor(() =>
      expect(within(drawer).getByRole("link", { name: "Workspace" })).toHaveFocus()
    );

    const closeButton = within(drawer).getByRole("button", {
      name: "Close navigation"
    });
    const signOutButton = within(drawer).getByRole("button", {
      name: "Sign out"
    });
    closeButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(signOutButton).toHaveFocus();

    signOutButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
