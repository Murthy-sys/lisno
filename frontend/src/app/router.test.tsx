import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderKanban } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import {
  OPERATIONAL_ROLES,
  ROLE_CODES,
  type PermissionCode,
  type Role
} from "../api/authorization-contract";
import { tokenStorage } from "../api/client";
import { authorizationFor } from "../test/authFixtures";
import { renderApp } from "../test/render";
import { ROUTE_REGISTRY } from "./routeRegistry";
import { roleHomeContentFor } from "./router";

const designer = {
  id: "user-designer-ananya",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer" as const
};

const estimatorSales = {
  id: "user-estimator-sales",
  name: "Priya Sharma",
  email: "sales@lisno.example",
  role: "estimator_sales" as const
};

const neutralHomeRoles = [
  "procurement",
  "finance_head",
  "site_manager",
  "worker_electrician",
  "worker_plumber",
  "worker_carpenter",
  "worker_painter",
  "worker_civil",
  "worker_other"
] as const satisfies readonly Role[];

const nonAdminClientResponsePresentationCases = ROLE_CODES
  .filter((role) => role !== "admin" && role !== "super_admin")
  .flatMap((role) => [
    [role, "/admin/client-responses"],
    [role, "/admin/client-responses/round-1"]
  ] as const);

const historicalProtectedPaths = [
  "/designer",
  "/designer/projects/:projectId",
  "/manager",
  "/manager/designers/:designerId",
  "/manager/projects/:projectId",
  "/head",
  "/head/designers/:designerId",
  "/head/projects/:projectId",
  "/estimator-sales",
  "/estimator-sales/leads/:leadId",
  "/estimator-sales/leads/:leadId/estimate",
  "/client",
  "/client/projects/:projectId",
  "/admin/projects",
  "/admin/projects/:projectId",
  "/admin/users",
  "/admin/access-requests",
  "/access-requests/mine",
  "/home",
  "/access-denied"
] as const;

const clientResponsePaths = [
  "/admin/client-responses",
  "/admin/client-responses/:roundId"
] as const;

const financePaths = [
  "/finance",
  "/finance/projects/:projectId"
] as const;

const estimateResponsePermissions = [
  "estimation.client_response_tasks.read",
  "estimation.client_response_tasks.decide",
  "estimation.client_response_proof.read",
  "estimation.estimate_email.retry"
] as const satisfies readonly PermissionCode[];

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

function escapeCssPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cssRuleBodies(css: string, prelude: string) {
  const matches = css.matchAll(
    new RegExp(`${escapeCssPattern(prelude)}\\s*\\{`, "g")
  );

  return [...matches].map((match) => {
    const openingBrace = css.indexOf("{", match.index ?? 0);
    let depth = 1;
    let cursor = openingBrace + 1;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === "{") depth += 1;
      if (css[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) throw new Error(`Unclosed CSS block for ${prelude}`);
    return css.slice(openingBrace + 1, cursor - 1);
  });
}

function cssDeclarations(css: string, selector: string) {
  const body = cssRuleBodies(css, selector)[0];
  if (!body) throw new Error(`Missing CSS rule for ${selector}`);
  return new Map(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(
      ([, property, value]) => [property, value.trim().replace(/\s+/g, " ")]
    )
  );
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
    if (url === "/api/v1/auth/authorization") {
      return Response.json({ data: authorizationFor(designer.role) });
    }
    if (url === "/api/v1/designer/design-plan-tasks") {
      return Response.json({ data: [] });
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

function installAuthorizationSession(
  role: Role,
  permissions: readonly PermissionCode[]
) {
  tokenStorage.set(`${role}-route-token`);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = apiRequestPath(input);
    if (path === "/api/v1/auth/me") {
      return Response.json({
        data: {
          id: `${role}-route-user`,
          name: "Route User",
          email: `${role}@lisno.example`,
          role
        }
      });
    }
    if (path === "/api/v1/auth/authorization") {
      return Response.json({ data: authorizationFor(role, permissions) });
    }
    if (path === "/api/v1/admin/users?limit=20&offset=0") {
      return Response.json({
        data: {
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
          filterRoles: ROLE_CODES,
          manageableRoles: OPERATIONAL_ROLES
        }
      });
    }
    if (path === "/api/v1/admin/projects?limit=20&offset=0") {
      return Response.json({
        data: {
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
        }
      });
    }
    if (path === "/api/v1/admin/projects/project-1") {
      return Response.json({
        data: {
          id: "project-1",
          name: "Admin residence",
          status: "planning",
          location: "Pune",
          client: { name: "Asha Shah", email: "asha@example.com", mobile: "9000000000" },
          propertyType: "3BHK",
          budgetMin: 800000,
          budgetMax: 1200000,
          estimator: null,
          lead: null,
          estimate: null,
          createdAt: "2026-08-23T10:00:00.000Z"
        }
      });
    }
    if (
      path ===
      "/api/v1/admin/estimate-client-response-tasks?status=pending&limit=20&offset=0"
    ) {
      return Response.json({
        data: {
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
        }
      });
    }
    if (path === "/api/v1/admin/estimate-client-response-tasks/round-1") {
      return Response.json({
        data: {
          id: "round-1",
          version: 3,
          sendGeneration: 2,
          project: { id: "project-1", name: "Admin residence" },
          client: { name: "Asha Shah", email: "asha@example.com" },
          estimate: { id: "estimate-1", version: 4, total: 1416 },
          assignedAdmin: { id: "admin-1", name: "Route User" },
          deliveryStatus: "sent",
          deliveryAttemptCount: 1,
          deliveryAttemptedAt: "2026-08-23T10:00:01.000Z",
          deliveredAt: "2026-08-23T10:00:02.000Z",
          status: "pending",
          decision: null,
          proofAvailable: false,
          createdAt: "2026-08-23T10:00:00.000Z",
          estimateSnapshot: {
            clientName: "Asha Shah",
            projectName: "Admin residence",
            location: "Pune",
            propertyType: "3BHK",
            lineItems: [],
            subtotal: 1200,
            gst: 216,
            total: 1416
          },
          pdf: {
            filename: "estimate-v4.pdf",
            mimeType: "application/pdf",
            byteSize: 2048,
            sha256: "a".repeat(64)
          },
          decisionSource: null,
          decisionNote: null,
          decidedAt: null
        }
      });
    }
    if (path === "/api/v1/access-requests/mine?limit=20&offset=0") {
      return Response.json({
        data: {
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
        }
      });
    }
    if (path === "/api/v1/access-requests/review?limit=20&offset=0") {
      return Response.json({
        data: {
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
        }
      });
    }
    throw new Error(`Unhandled request: ${path}`);
  });
}

describe("role landing staging contract", () => {
  it.each(ROLE_CODES)("defines safe landing content for %s", (role) => {
    expect(roleHomeContentFor(role)).toEqual({
      heading: expect.any(String),
      eyebrow: expect.any(String),
      description: expect.any(String),
      status: expect.any(String)
    });
    expect(Object.values(roleHomeContentFor(role)).every(Boolean)).toBe(true);
  });

  it.each(neutralHomeRoles)("opens the neutral /home route for %s", async (role) => {
    const currentUser = {
      id: `user-${role}`,
      name: "Staged User",
      email: `${role}@lisno.example`,
      role
    };
    tokenStorage.set(`${role}-token`);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = apiRequestPath(input);
      if (path === "/api/v1/auth/me") {
        return Response.json({ data: currentUser });
      }
      if (path === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor(role) });
      }
      throw new Error(`Unhandled request: ${path}`);
    });

    const { router } = renderApp(["/home"]);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: roleHomeContentFor(role).heading
      })
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/home");
  });

  it("shows the shared KPI panel on a worker landing", async () => {
    const currentUser = {
      id: "user-procurement",
      name: "Staged User",
      email: "procurement@lisno.example",
      role: "procurement" as const
    };
    tokenStorage.set("procurement-token");
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = apiRequestPath(input);
      if (path === "/api/v1/auth/me") return Response.json({ data: currentUser });
      if (path === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor("procurement") });
      }
      if (path.startsWith("/api/v1/kpis/users/user-procurement")) {
        return Response.json({
          data: {
            userId: currentUser.id,
            periodStartAt: "2026-08-01T00:00:00.000Z",
            periodEndAt: "2026-08-31T23:59:59.999Z",
            score: 72,
            // Design-only components report null for operational work; the
            // engine redistributes their weight across the rest.
            components: [
              { key: "onTime", label: "On-time completion", score: 80, configuredWeight: 35, effectiveWeight: 58.3, eligibleCount: 2, explanation: "Completed and overdue tasks." },
              { key: "quality", label: "Design quality and approval efficiency", score: null, configuredWeight: 25, effectiveWeight: 0, eligibleCount: 0, explanation: "Approved design versions." },
              { key: "revisionEfficiency", label: "Revision efficiency", score: null, configuredWeight: 15, effectiveWeight: 0, eligibleCount: 0, explanation: "Review-stage revisions." },
              { key: "updateDiscipline", label: "Status-update discipline", score: 60, configuredWeight: 15, effectiveWeight: 25, eligibleCount: 2, explanation: "Timely updates." },
              { key: "workloadCompletion", label: "Workload completion", score: 55, configuredWeight: 10, effectiveWeight: 16.7, eligibleCount: 2, explanation: "Completed planned effort." }
            ],
            aggregates: {
              taskCounts: { total: 2, completed: 1, active: 1 },
              riskCounts: { gray: 0, green: 1, yellow: 1, red: 0 },
              effort: { planned: 8, completed: 4, remaining: 4, workloadPercentage: 50 },
              projects: [],
              recentActivity: []
            },
            tasks: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } }
          }
        });
      }
      if (path.startsWith("/api/v1/workflow/tasks")) {
        return Response.json({ data: [] });
      }
      throw new Error(`Unhandled request: ${path}`);
    });

    renderApp(["/home"]);

    expect(await screen.findByLabelText("Personal KPI score")).toHaveTextContent("72");
    await user.click(screen.getByRole("button", { name: "Show breakdown" }));
    expect(screen.getByText("On-time completion")).toBeVisible();
    // Design-shaped components stay visible but unscored for a worker.
    const quality = screen.getByText("Design quality and approval efficiency")
      .closest("article")!;
    expect(within(quality).getByText("Not available")).toBeVisible();
  });
});

describe("public invitation route", () => {
  it("mounts directly while staying outside the protected registry", async () => {
    expect(ROUTE_REGISTRY).toHaveLength(26);
    expect(ROUTE_REGISTRY.map(({ path }) => path)).not.toContain(
      "/accept-invitation"
    );

    const { router } = renderApp(["/accept-invitation"]);

    expect(
      await screen.findByText(
        "This invitation is unavailable. Ask an administrator to send a new invitation."
      )
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/accept-invitation");
  });
});

describe("registered permission routes", () => {
  it("adds the workflow and finance routes and preserves both Client route contracts", () => {
    const paths = ROUTE_REGISTRY.map(({ path }) => path);
    const additions = paths.filter(
      (path) => !(historicalProtectedPaths as readonly string[]).includes(path)
    );

    expect(paths).toHaveLength(historicalProtectedPaths.length + 6);
    expect(additions).toEqual([
      "/designer/design-plans",
      ...clientResponsePaths,
      "/admin/design-approvals",
      ...financePaths
    ]);
    expect(paths.filter(
      (path) => ![
        "/designer/design-plans",
        ...clientResponsePaths,
        "/admin/design-approvals",
        ...financePaths
      ].includes(path)
    )).toEqual(historicalProtectedPaths);
    expect(ROUTE_REGISTRY.filter(({ path }) => path.startsWith("/client")))
      .toEqual([
        {
          path: "/client",
          permission: "projects.client_summary.read",
          presentationRoles: ["client"],
          navigation: {
            roles: ["client"],
            item: {
              label: "My projects",
              to: "/client",
              end: true,
              icon: FolderKanban
            }
          }
        },
        {
          path: "/client/projects/:projectId",
          permission: "projects.read",
          presentationRoles: ["client"],
          navigation: null
        }
      ]);

    const clientAuthorization = authorizationFor("client");
    for (const permission of estimateResponsePermissions) {
      expect(clientAuthorization.permissions).not.toContain(permission);
    }
    expect(
      ROUTE_REGISTRY.filter(
        ({ permission, presentationRoles }) =>
          (presentationRoles as readonly string[]).includes("client") &&
          permission !== null &&
          (estimateResponsePermissions as readonly string[]).includes(permission)
      )
    ).toEqual([]);
  });

  it("registers only the list route in Admin navigation and keeps detail non-navigation", () => {
    expect(
      ROUTE_REGISTRY.filter(({ path }) => path.startsWith("/admin/client-responses"))
    ).toMatchObject([
      {
        path: "/admin/client-responses",
        permission: "estimation.client_response_tasks.read",
        presentationRoles: ["admin", "super_admin"],
        navigation: {
          roles: ["admin", "super_admin"],
          item: {
            label: "Client responses",
            to: "/admin/client-responses",
            end: true
          }
        }
      },
      {
        path: "/admin/client-responses/:roundId",
        permission: "estimation.client_response_tasks.read",
        presentationRoles: ["admin", "super_admin"],
        navigation: null
      }
    ]);
  });

  it("presents Admin project list and detail routes to Admin and Super Admin", () => {
    expect(
      ROUTE_REGISTRY.filter(({ path }) => path.startsWith("/admin/projects"))
    ).toEqual([
      {
        path: "/admin/projects",
        permission: "projects.list",
        presentationRoles: ["admin", "super_admin"],
        navigation: {
          roles: ["admin", "super_admin"],
          item: {
            label: "My Projects",
            to: "/admin/projects",
            end: true,
            icon: FolderKanban
          },
          labels: { super_admin: "All Projects" }
        }
      },
      {
        path: "/admin/projects/:projectId",
        permission: "projects.read",
        presentationRoles: ["admin", "super_admin"],
        navigation: null
      }
    ]);
  });

  it.each([
    [
      "admin",
      "/admin/projects",
      ["identity.self.read", "projects.list"],
      "My Projects",
      "No projects initiated yet."
    ],
    [
      "admin",
      "/admin/projects/project-1",
      ["identity.self.read", "projects.read"],
      "Admin residence",
      "No estimate yet"
    ],
    [
      "super_admin",
      "/admin/projects",
      ["identity.self.read", "projects.list"],
      "All Projects",
      "No projects available."
    ],
    [
      "super_admin",
      "/admin/projects/project-1",
      ["identity.self.read", "projects.read"],
      "Admin residence",
      "No estimate yet"
    ],
    [
      "super_admin",
      "/admin/users",
      ["identity.self.read", "identity.users.read"],
      "User administration",
      "No users match these filters."
    ],
    [
      "super_admin",
      "/admin/access-requests",
      ["identity.self.read", "access_request.review.read"],
      "Access requests",
      "There are no access requests to review."
    ],
    [
      "designer",
      "/access-requests/mine",
      ["identity.self.read", "access_request.self.read"],
      "My access requests",
      "You have no access requests."
    ],
    [
      "admin",
      "/admin/client-responses",
      ["identity.self.read", "estimation.client_response_tasks.read"],
      "Client responses",
      "There are no pending Client responses assigned to you."
    ]
  ] as const)(
    "mounts the registered %s page at %s with its successful empty state",
    async (role, path, permissions, title, emptyState) => {
      installAuthorizationSession(role, permissions);
      const { router } = renderApp([path]);

      expect(await screen.findByRole("heading", { name: title })).toBeVisible();
      expect(await screen.findByText(emptyState)).toBeVisible();
      expect(screen.queryByRole("heading", { name: "Page not found" })).not.toBeInTheDocument();
      expect(router.state.location.pathname).toBe(path);
    }
  );

  it("mounts the Client response detail for Super Admin with the registered read permission", async () => {
    installAuthorizationSession("super_admin", [
      "identity.self.read",
      "estimation.client_response_tasks.read"
    ]);
    const { router } = renderApp(["/admin/client-responses/round-1"]);

    expect(
      await screen.findByRole("heading", { name: "Asha Shah response" })
    ).toBeVisible();
    expect(screen.getByText("estimate-v4.pdf")).toBeVisible();
    expect(router.state.location.pathname).toBe("/admin/client-responses/round-1");
  });

  it.each(nonAdminClientResponsePresentationCases)(
    "denies the %s presentation role at %s even when a read code is supplied",
    async (role, path) => {
      installAuthorizationSession(role, [
        "identity.self.read",
        "estimation.client_response_tasks.read"
      ]);
      const { router } = renderApp([path]);

      expect(await screen.findByRole("heading", { name: "Access denied" })).toBeVisible();
      expect(screen.queryByRole("heading", { name: "Client responses" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /response$/i })).not.toBeInTheDocument();
      expect(router.state.location.pathname).toBe(path);
      expect(
        vi.mocked(globalThis.fetch).mock.calls.some(([input]) =>
          apiRequestPath(input).startsWith(
            "/api/v1/admin/estimate-client-response-tasks"
          )
        )
      ).toBe(false);
    }
  );

  it("denies direct Admin user-directory access without calling the users API", async () => {
    installAuthorizationSession("admin", [
      "identity.self.read",
      "identity.users.read"
    ]);
    const { router } = renderApp(["/admin/users"]);

    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/admin/users");
    expect(
      vi.mocked(globalThis.fetch).mock.calls.some(([input]) =>
        apiRequestPath(input).startsWith("/api/v1/admin/users")
      )
    ).toBe(false);
  });

  it.each([
    ["super_admin", "/designer", "projects.list"],
    ["admin", "/manager", "organization.team.read"]
  ] as const)(
    "denies %s entry to the personal presentation route %s despite read permission",
    async (role, path, permission) => {
      installAuthorizationSession(role, ["identity.self.read", permission]);
      const { router } = renderApp([path]);

      expect(
        await screen.findByRole("heading", { name: "Access denied" })
      ).toBeVisible();
      expect(screen.queryByRole("link", { name: "Request access" })).not.toBeInTheDocument();
      expect(router.state.location.pathname).toBe(path);
    }
  );

  it("renders a generic denial in place when a registered permission is missing", async () => {
    installAuthorizationSession("designer", ["identity.self.read"]);
    const { router } = renderApp(["/designer"]);

    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Request access" })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/designer");
  });

  it("keeps an unknown route as Not Found without request context", async () => {
    installAuthorizationSession("designer", ["identity.self.read"]);
    const { router } = renderApp(["/not-a-registered-page"]);

    expect(
      await screen.findByRole("heading", { name: "Page not found" })
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Request access" })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/not-a-registered-page");
  });
});

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
      if (url === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor("client") });
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
    await waitFor(() => expect(router.state.location.state).toBeNull());
    for (const [label, value] of [
      ["Full name", "Priya Shah"],
      ["Email address", "priya@example.com"],
      ["Mobile number", "+91 98765 43210"],
      ["Address", "42 Garden Lane, Bengaluru"],
      ["Password", "StrongPassword!23"],
      ["Confirm password", "StrongPassword!23"]
    ] as const) {
      expect(screen.getByLabelText(label, { exact: true })).toHaveValue(value);
    }
    fireEvent.click(screen.getByRole("button", { name: "Create client account" }));

    const heading = await screen.findByRole("heading", {
      name: "Your design plans"
    });
    expect(signupAttempts).toBe(2);
    expect(router.state.location.state).toEqual({ routeFocus: true });
    expect(heading).toHaveFocus();
  });

  it.each([
    ["an unmarked POP entry", "/signup"],
    [
      "a stale marked POP entry",
      { pathname: "/signup", state: { signupRouteFocus: true } }
    ]
  ] as const)("keeps a restore-driven authenticated signup redirect unmarked from %s", async (_case, entry) => {
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
      if (url === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor(client.role) });
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
    const { router } = renderApp([entry]);

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
      if (url === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor(designer.role) });
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
      target: { value: "router-test-password" }
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
      if (url === "/api/v1/auth/me") return Response.json({ data: estimatorSales });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(estimatorSales.role) });
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
      if (url === "/api/v1/auth/me") return Response.json({ data: estimatorSales });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(estimatorSales.role) });
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
      if (url === "/api/v1/auth/me") return Response.json({ data: estimatorSales });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(estimatorSales.role) });
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
      if (url === "/api/v1/auth/me") return Response.json({ data: estimatorSales });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(estimatorSales.role) });
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
      await screen.findByRole("heading", { name: "Design workspace" })
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
    await waitFor(() =>
      expect(
        restoreRequest.mock.calls.filter(
          ([input]) => apiRequestPath(input) === "/api/v1/auth/me"
        )
      ).toHaveLength(2)
    );
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
    await screen.findByRole("heading", { name: "Design workspace" });

    tokenStorage.clear();
    window.dispatchEvent(
      new CustomEvent("lisno:unauthorized", {
        detail: { token: "valid-token" }
      })
    );

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(screen.getByText("Your session expired. Sign in again.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Design workspace" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(router.state.location.pathname).toBe("/login");
  });

  it("denies a valid designer another role's presentation without destroying the session", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();

    const { router } = renderApp(["/manager"]);

    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/manager");
    expect(tokenStorage.get()).toBe("valid-token");
    expect(screen.queryByRole("heading", { name: "Team delivery pulse" })).not.toBeInTheDocument();
  });

  it("redirects an authenticated root entry to the role home", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();

    const { router } = renderApp(["/"]);

    expect(await screen.findByRole("heading", { name: "Design workspace" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/designer");
  });

  it("keeps an authenticated wildcard entry as Not Found", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();

    const { router } = renderApp(["/missing-route"]);

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Request access" })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/missing-route");
  });

  it("unmounts the protected shell while one full-page signing-out state owns progress", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();
    const cleanupGate = deferred();
    const { queryClient, router } = renderApp(["/designer"]);
    await screen.findByRole("heading", { name: "Design workspace" });
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
    await screen.findByRole("heading", { name: "Design workspace" });

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/login");
    expect(tokenStorage.get()).toBeNull();
  });

  it("preserves the actual 767px mobile shell breakpoint", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "src/styles/shell.css"),
      "utf8"
    );
    const mobileRules = cssRuleBodies(shell, "@media (max-width: 767px)");

    expect(mobileRules).toHaveLength(1);
    const mobile = mobileRules[0]!;
    expect(cssDeclarations(shell, ".ui-mobile-header").get("display")).toBe("none");
    expect(cssDeclarations(mobile, ".ui-sidebar-rail").get("display")).toBe("none");
    expect(cssDeclarations(mobile, ".ui-mobile-header").get("display")).toBe("flex");
  });

  it("opens an accessible mobile drawer, wraps focus in both directions, and closes on Escape", async () => {
    tokenStorage.set("valid-token");
    installDesignerApi();
    renderApp(["/designer"]);
    await screen.findByRole("heading", { name: "Design workspace" });

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(trigger).toHaveAttribute("aria-controls", "mobile-navigation");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(drawer).toBeVisible();
    expect(drawer).toHaveAttribute("id", "mobile-navigation");
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
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
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
