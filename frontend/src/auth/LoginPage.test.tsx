import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { Role } from "../api/types";
import { tokenStorage } from "../api/client";
import { renderApp } from "../test/render";
import { server } from "../test/server";

const password = "LisnoDemo2026!";

const designer = {
  id: "user-designer-ananya",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer" as const
};

function installDesignerDashboardHandlers() {
  server.use(
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
    await screen.findByRole("heading", { name: "Good morning, Ananya." });

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
      )
    );
    const { router } = renderApp(["/manager"]);
    await screen.findByRole("heading", { name: "Welcome back" });

    await signIn();

    const heading = await screen.findByRole("heading", {
      name: "Good morning, Ananya."
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
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const submitButton = await screen.findByRole("button", {
      name: "Signing in…"
    });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute("aria-busy", "true");
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

  it("fills the seeded designer demo account without storing a password", async () => {
    renderApp(["/login"]);

    await userEvent.click(
      screen.getByRole("button", { name: "Use designer demo account" })
    );

    expect(screen.getByLabelText("Email address")).toHaveValue(
      "ananya@lisno.example"
    );
    expect(screen.getByLabelText("Password")).toHaveValue(password);
    expect(JSON.stringify(window.localStorage)).not.toContain(password);
  });

  it.each([
    ["designer", "/designer", "Good morning, Demo."],
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
