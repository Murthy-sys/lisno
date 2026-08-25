import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { Role } from "../api/types";
import { tokenStorage } from "../api/client";
import { authorizationFor } from "../test/authFixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

const password = "frontend-test-password";
const authStyles = readFileSync(
  resolve(process.cwd(), "src/styles/index.css"),
  "utf8"
);
const primitiveStyles = readFileSync(
  resolve(process.cwd(), "src/styles/primitives.css"),
  "utf8"
);
const roleThemeStyles = readFileSync(
  resolve(process.cwd(), "src/styles/role-themes.css"),
  "utf8"
);

function cssRuleFrom(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

function cssRule(selector: string) {
  return cssRuleFrom(authStyles, selector);
}

const designer = {
  id: "user-designer-ananya",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer" as const
};

function installDesignerDashboardHandlers() {
  server.use(
    http.get("/api/v1/designer/design-plan-tasks", () =>
      HttpResponse.json({ data: [] })
    ),
    http.get("/api/v1/projects", () =>
      HttpResponse.json({
        data: {
          items: [],
          pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
        }
      })
    ),
    http.get("/api/v1/kpis/users/:userId/tasks", () =>
      HttpResponse.json({
        data: {
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
        }
      })
    ),
    http.get("/api/v1/kpis/users/:userId", ({ params }) =>
      HttpResponse.json({
        data: {
          userId: params.userId,
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
      })
    ),
    http.get("/api/v1/estimates/review-queue", () =>
      HttpResponse.json({ data: [] })
    )
  );
}

async function signIn() {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "person@lisno.example" }
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password }
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage", () => {
  it("preserves the approved sign-in copy and Lisno logo asset", () => {
    renderApp(["/login"]);

    expect(screen.getByText("Design operations, in focus")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "From first sketch to final handoff." })
    ).toBeVisible();
    expect(
      screen.getByText(
        "Keep every project, decision, deadline, and approved design moving in one shared workspace."
      )
    ).toBeVisible();
    expect(
      screen.getByText("Clear ownership. Timely reviews. Beautiful outcomes.")
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    for (const logo of screen.getAllByRole("img", { name: "Lisno" })) {
      expect(logo).toHaveAttribute("src", "/lisno-logo.svg");
    }
  });

  it("renders login fields and the password toggle through shared controls", () => {
    renderApp(["/login"]);

    const email = screen.getByLabelText("Email address");
    const passwordControl = screen.getByLabelText("Password");
    expect(email).toHaveAttribute("id", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toHaveClass("ui-control", "ui-input");
    expect(email.closest(".ui-field")).toHaveClass("field");
    expect(passwordControl).toHaveAttribute("id", "password");
    expect(passwordControl).toHaveAttribute("autocomplete", "current-password");
    expect(passwordControl).toHaveClass("ui-control", "ui-input");
    expect(passwordControl.closest(".ui-field")).toHaveClass("field");
    expect(screen.getByRole("button", { name: "Show password" })).toHaveClass(
      "ui-icon-button",
      "password-field__toggle"
    );
  });

  it("links prospective clients to the account signup form", async () => {
    renderApp(["/login"]);

    await userEvent.click(screen.getByRole("link", { name: "Create a client account" }));

    expect(await screen.findByRole("heading", { name: "Create your client account" })).toBeVisible();
  });

  it("announces all validation errors and focuses email when both fields are invalid", async () => {
    renderApp(["/login"]);

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const summary = await screen.findByRole("status", {
      name: "Sign-in validation summary"
    });
    expect(summary).toHaveAttribute("aria-live", "polite");
    expect(summary).toHaveTextContent("Enter a valid email address.");
    expect(summary).toHaveTextContent("Password is required.");
    expect(screen.getByLabelText("Email address")).toHaveFocus();
  });

  it("focuses password when it is the first invalid field", async () => {
    renderApp(["/login"]);
    await userEvent.type(
      screen.getByLabelText("Email address"),
      "person@lisno.example"
    );

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("status", {
        name: "Sign-in validation summary"
      })
    ).toHaveTextContent("Password is required.");
    expect(screen.getByLabelText("Password")).toHaveFocus();
  });

  it("shows a generic error for invalid credentials without disclosing which field failed", async () => {
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Invalid email or password."
            }
          },
          { status: 401 }
        )
      )
    );
    renderApp(["/login"]);

    await userEvent.type(screen.getByLabelText("Email address"), "unknown@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "incorrect");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("alert", { name: "Sign-in error" })
    ).toHaveTextContent("Email or password is incorrect.");
    expect(screen.queryByText(/unknown email/i)).not.toBeInTheDocument();
  });

  it("keeps the local expiry warning through a failed sign-in", async () => {
    tokenStorage.set("expired-session-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const pathname = new URL(String(input), window.location.origin).pathname;
      if (pathname === "/api/v1/auth/me") {
        return Response.json({ data: designer });
      }
      if (pathname === "/api/v1/auth/authorization") {
        return Response.json({ data: authorizationFor(designer.role) });
      }
      if (pathname === "/api/v1/designer/design-plan-tasks") {
        return Response.json({ data: [] });
      }
      if (pathname === "/api/v1/auth/login") {
        return Response.json(
          {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Invalid email or password."
            }
          },
          { status: 401 }
        );
      }
      if (pathname === "/api/v1/projects") {
        return Response.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        });
      }
      if (pathname.endsWith("/tasks")) {
        return Response.json({
          data: {
            items: [],
            pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
          }
        });
      }
      if (pathname.includes("/kpis/users/")) {
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
      if (pathname === "/api/v1/estimates/review-queue") {
        return Response.json({ data: [] });
      }
      throw new Error(`Unhandled request: ${pathname}`);
    });
    renderApp(["/designer"]);
    await screen.findByRole("heading", { name: "Design workspace" });

    tokenStorage.clear();
    window.dispatchEvent(
      new CustomEvent("lisno:unauthorized", {
        detail: { token: "expired-session-token" }
      })
    );

    const warning = await screen.findByRole("region", { name: "Session expired" });
    expect(warning).toHaveTextContent("Your session expired. Sign in again.");
    expect(warning).not.toHaveAttribute("role", "status");

    await userEvent.type(screen.getByLabelText("Email address"), "person@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "incorrect");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert", { name: "Sign-in error" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Session expired" })).toHaveTextContent(
      "Your session expired. Sign in again."
    );
  });

  it("returns a successful sign-in to a safe captured nested route and focuses it", async () => {
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json({
          data: { token: "designer-token", user: designer }
        })
      ),
      http.get("/api/v1/auth/authorization", () =>
        HttpResponse.json({ data: authorizationFor(designer.role) })
      ),
      http.get("/api/v1/projects/project-safe", () =>
        HttpResponse.json({
          data: {
            id: "project-safe",
            name: "Safe return project",
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
        })
      ),
      http.get("/api/v1/projects/project-safe/design-versions", () =>
        HttpResponse.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
          }
        })
      )
    );
    const { router } = renderApp(["/designer/projects/project-safe"]);
    await screen.findByRole("heading", { name: "Welcome back" });

    await signIn();

    const heading = await screen.findByRole("heading", {
      name: "Safe return project"
    });
    expect(router.state.location.pathname).toBe("/designer/projects/project-safe");
    expect(heading).toHaveFocus();
  });

  it("falls back to the signed-in role home for a captured route owned by another role", async () => {
    installDesignerDashboardHandlers();
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json({
          data: { token: "designer-token", user: designer }
        })
      ),
      http.get("/api/v1/auth/authorization", () =>
        HttpResponse.json({ data: authorizationFor(designer.role) })
      )
    );
    const { router } = renderApp(["/manager"]);
    await screen.findByRole("heading", { name: "Welcome back" });

    await signIn();

    const heading = await screen.findByRole("heading", {
      name: "Design workspace"
    });
    expect(router.state.location.pathname).toBe("/designer");
    expect(heading).toHaveFocus();
  });

  it("announces that sign-in is busy while authentication is pending", async () => {
    let releaseLogin!: () => void;
    const loginPending = new Promise<void>((resolve) => {
      releaseLogin = resolve;
    });
    server.use(
      http.post("/api/v1/auth/login", async () => {
        await loginPending;
        return HttpResponse.json(
          {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Invalid email or password."
            }
          },
          { status: 401 }
        );
      })
    );
    renderApp(["/login"]);

    await userEvent.type(
      screen.getByLabelText("Email address"),
      "person@lisno.example"
    );
    await userEvent.type(screen.getByLabelText("Password"), "incorrect");
    const submitButton = screen.getByRole("button", { name: "Sign in" });
    const settledClassName = submitButton.className;
    const settledStackClasses = Array.from(
      submitButton.querySelector(".ui-button__stack")?.children ?? []
    ).map((child) => child.className);
    await userEvent.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    expect(submitButton).toHaveAccessibleName("Sign in");
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute("aria-busy", "true");
    expect(submitButton).toHaveAttribute("data-busy", "true");
    expect(submitButton).toHaveTextContent("Signing in…");
    expect(submitButton.className).toBe(settledClassName);
    expect(
      Array.from(submitButton.querySelector(".ui-button__stack")?.children ?? []).map(
        (child) => child.className
      )
    ).toEqual(settledStackClasses);
    expect(submitButton.querySelector(".ui-button__content")).toHaveTextContent(
      "Sign in"
    );
    expect(submitButton.querySelector(".ui-button__busy")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(cssRule(".login-page--signin .login-submit .ui-button__busy")).toContain(
      "gap: 0.65rem"
    );
    const exposedBusyRule = cssRuleFrom(
      primitiveStyles,
      ".ui-button[data-busy] .ui-button__busy"
    );
    expect(exposedBusyRule).toContain("opacity: 1");
    expect(exposedBusyRule).toContain("visibility: visible");
    expect(
      screen.getByRole("status", { name: "Sign-in status" })
    ).toHaveTextContent("Signing in. Please wait.");
    expect(document.getElementById("login-form")).toHaveAttribute(
      "aria-busy",
      "true"
    );

    releaseLogin();
    expect(
      await screen.findByRole("alert", { name: "Sign-in error" })
    ).toBeVisible();
  });

  it("preserves the approved sign-in button and password-toggle presentation", () => {
    expect(authStyles).toMatch(
      /\.login-page--signin\s+\.login-submit\s+\.ui-button__stack/
    );
    expect(authStyles).toMatch(
      /\.login-page--signin\s+\.login-submit\s+\.ui-spinner/
    );
    expect(authStyles).toMatch(
      /\.login-page--signin\s+\.login-submit__arrow/
    );
    const submitRule = cssRule(".login-page--signin .login-submit");
    expect(submitRule).toContain("min-height: 3.45rem");
    expect(submitRule).toContain("padding: 0.72rem 1rem");
    expect(submitRule).toContain("font-weight: 750");

    expect(cssRule(".login-page--signin .login-submit .ui-button__content")).toContain(
      "gap: 0.65rem"
    );
    expect(cssRule(".login-page--signin .login-submit .ui-button__busy")).toContain(
      "gap: 0.65rem"
    );

    const toggleRule = cssRule(".login-page--signin .password-field__toggle");
    expect(toggleRule).toContain("width: 2.75rem");
    expect(toggleRule).toContain("height: 2.75rem");
    expect(toggleRule).toContain("color: #697086");
    const toggleHoverRule = cssRule(
      ".login-page--signin .password-field__toggle:hover:not(:disabled)"
    );
    expect(toggleHoverRule).toContain("background: #f2effc");
    expect(toggleHoverRule).toContain("color: var(--color-lisno-violet)");
  });

  it("removes all dead demo-helper styling", () => {
    expect(authStyles).not.toMatch(/\.demo-helper/);
    expect(roleThemeStyles).not.toMatch(/\.demo-helper/);
    expect(cssRule(".login-page--signin .button--quiet")).toBe("");
    expect(
      cssRule(".login-page--signin .button--quiet:hover:not(:disabled)")
    ).toBe("");
  });

  it("toggles password visibility with an accessible pressed state", async () => {
    renderApp(["/login"]);
    const passwordInput = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });

    expect(passwordInput).toHaveAttribute("type", "password");
    await userEvent.click(toggle);
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("does not render a credential helper or prefill the login fields", () => {
    renderApp(["/login"]);

    expect(
      screen.queryByRole("button", { name: "Use designer demo account" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewing the demo?")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("ananya@lisno.example")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it.each([
    ["designer", "/designer", "Design workspace"],
    ["design_manager", "/manager", "Team delivery pulse"],
    ["design_head", "/head", "Organization delivery health"],
    ["client", "/client", "Your design plans"]
  ] satisfies Array<[Role, string, string]>)(
    "redirects a %s to its exact role home",
    async (role, path, heading) => {
      server.use(
        http.post("/api/v1/auth/login", async ({ request }) => {
          const credentials = (await request.json()) as {
            email: string;
            password: string;
          };
          expect(credentials.email).toBe("person@lisno.example");
          return HttpResponse.json({
            data: {
              token: `${role}-token`,
              user: {
                id: `${role}-1`,
                name: "Demo Person",
                email: credentials.email,
                role
              }
            }
          });
        }),
        http.get("/api/v1/auth/authorization", () =>
          HttpResponse.json({ data: authorizationFor(role) })
        ),
        http.get("/api/v1/designer/design-plan-tasks", () =>
          HttpResponse.json({ data: [] })
        ),
        http.get("/api/v1/projects", () =>
          HttpResponse.json({
            data: {
              items: [],
              pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
            }
          })
        ),
        http.get("/api/v1/client/latest-approved-versions", () =>
          HttpResponse.json({ data: [] })
        ),
        http.get("/api/v1/client/project-summaries", () =>
          HttpResponse.json({
            data: {
              items: [],
              pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
            }
          })
        ),
        http.get("/api/v1/client/estimates", () =>
          HttpResponse.json({ data: [] })
        ),
        http.get("/api/v1/estimates/review-queue", () =>
          HttpResponse.json({ data: [] })
        ),
        http.get("/api/v1/estimates/designers", () =>
          HttpResponse.json({ data: [] })
        ),
        http.get("/api/v1/organization/team", () =>
          HttpResponse.json({
            data: {
              items: [],
              pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
            }
          })
        ),
        http.get("/api/v1/organization/tree", () =>
          HttpResponse.json({
            data: {
              items: [],
              pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
            }
          })
        ),
        http.get("/api/v1/kpis/users/:userId/tasks", () =>
          HttpResponse.json({
            data: {
              items: [],
              pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
            }
          })
        ),
        http.get("/api/v1/kpis/users/:userId", ({ params }) =>
          HttpResponse.json({
            data: {
              userId: params.userId,
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
          })
        )
      );
      const { router } = renderApp(["/login"]);

      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "person@lisno.example" }
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: password }
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
      expect(router.state.location.pathname).toBe(path);
      expect(tokenStorage.get()).toBe(`${role}-token`);
      expect(window.localStorage.getItem("user")).toBeNull();
    }
  );
});
