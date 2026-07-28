import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { tokenStorage } from "../api/client";
import { renderApp } from "../test/render";
import { server } from "../test/server";

const signup = {
  name: "Priya Shah",
  email: "priya@example.com",
  mobile: "+91 98765 43210",
  address: "42 Garden Lane, Bengaluru",
  password: "StrongPassword!23",
  passwordConfirmation: "StrongPassword!23"
};

async function fillSignupForm() {
  await userEvent.type(screen.getByLabelText("Full name"), signup.name);
  await userEvent.type(screen.getByLabelText("Email address"), signup.email);
  await userEvent.type(screen.getByLabelText("Mobile number"), signup.mobile);
  await userEvent.type(screen.getByLabelText("Address"), signup.address);
  await userEvent.type(screen.getByLabelText("Password", { exact: true }), signup.password);
  await userEvent.type(screen.getByLabelText("Confirm password"), signup.passwordConfirmation);
}

describe("SignupPage", () => {
  it("requires every client signup field and focuses the first invalid field", async () => {
    renderApp(["/signup"]);

    await userEvent.click(screen.getByRole("button", { name: "Create client account" }));

    const summary = await screen.findByRole("status", {
      name: "Signup validation summary"
    });
    expect(summary).toHaveTextContent("Name is required.");
    expect(summary).toHaveTextContent("Enter a valid email address.");
    expect(summary).toHaveTextContent("Mobile number is required.");
    expect(summary).toHaveTextContent("Address is required.");
    expect(summary).toHaveTextContent("Password is required.");
    expect(summary).toHaveTextContent("Confirm your password.");
    expect(screen.getByLabelText("Full name")).toHaveFocus();
  });

  it("rejects an invalid email and non-matching password confirmation before submitting", async () => {
    renderApp(["/signup"]);
    await userEvent.type(screen.getByLabelText("Full name"), signup.name);
    await userEvent.type(screen.getByLabelText("Email address"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Mobile number"), signup.mobile);
    await userEvent.type(screen.getByLabelText("Address"), signup.address);
    await userEvent.type(screen.getByLabelText("Password", { exact: true }), signup.password);
    await userEvent.type(screen.getByLabelText("Confirm password"), "DifferentPassword!23");

    await userEvent.click(screen.getByRole("button", { name: "Create client account" }));

    expect(await screen.findByLabelText("Email address")).toHaveAccessibleDescription(
      "Enter a valid email address."
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAccessibleDescription(
      "Passwords do not match."
    );
  });

  it("submits backend-shaped signup input, persists the session, and enters the client dashboard", async () => {
    server.use(
      http.post("/api/v1/auth/client-signup", async ({ request }) => {
        expect(await request.json()).toEqual(signup);
        return HttpResponse.json(
          {
            data: {
              token: "client-token",
              user: { id: "client-1", name: signup.name, email: signup.email, role: "client" }
            }
          },
          { status: 201 }
        );
      }),
      http.get("/api/v1/client/latest-approved-versions", () =>
        HttpResponse.json({ data: [] })
      ),
      http.get("/api/v1/client/project-summaries", () =>
        HttpResponse.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } })
      )
    );
    const { router } = renderApp(["/signup"]);
    await fillSignupForm();

    await userEvent.click(screen.getByRole("button", { name: "Create client account" }));

    expect(await screen.findByRole("heading", { name: "Your design plans" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/client");
    expect(tokenStorage.get()).toBe("client-token");
  });

  it("associates API field errors with their matching controls", async () => {
    server.use(
      http.post("/api/v1/auth/client-signup", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed.",
              fields: { email: "This email address is already registered.", mobile: "Use a reachable number." }
            }
          },
          { status: 400 }
        )
      )
    );
    renderApp(["/signup"]);
    await fillSignupForm();

    await userEvent.click(screen.getByRole("button", { name: "Create client account" }));

    const email = await screen.findByLabelText("Email address");
    expect(email).toHaveAccessibleDescription("This email address is already registered.");
    expect(screen.getByLabelText("Mobile number")).toHaveAccessibleDescription(
      "Use a reachable number."
    );
  });

  it("provides a keyboard-operable password visibility control and a route back to sign in", async () => {
    renderApp(["/signup"]);
    const toggle = screen.getAllByRole("button", { name: "Show password" })[0];
    toggle.focus();
    await userEvent.keyboard("{Enter}");

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("link", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});
