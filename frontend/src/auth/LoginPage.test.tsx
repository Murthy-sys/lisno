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
    ["designer", "/designer", "Designer workspace"],
    ["design_manager", "/manager", "Design manager workspace"],
    ["design_head", "/head", "Design head workspace"],
    ["client", "/client", "Client workspace"]
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
        })
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
