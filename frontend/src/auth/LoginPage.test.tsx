import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import type { Role } from "../api/types";
import { tokenStorage } from "../api/client";
import { renderApp } from "../test/render";
import { server } from "../test/server";

const password = "LisnoDemo2026!";

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
