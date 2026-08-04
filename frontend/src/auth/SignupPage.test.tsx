import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
const primitiveStyles = readFileSync(
  resolve(process.cwd(), "src/styles/primitives.css"),
  "utf8"
);
const authStyles = readFileSync(
  resolve(process.cwd(), "src/styles/index.css"),
  "utf8"
);

async function fillSignupForm() {
  await userEvent.type(screen.getByLabelText("Full name"), signup.name);
  await userEvent.type(screen.getByLabelText("Email address"), signup.email);
  await userEvent.type(screen.getByLabelText("Mobile number"), signup.mobile);
  await userEvent.type(screen.getByLabelText("Address"), signup.address);
  await userEvent.type(screen.getByLabelText("Password", { exact: true }), signup.password);
  await userEvent.type(screen.getByLabelText("Confirm password"), signup.passwordConfirmation);
}

describe("SignupPage", () => {
  it("renders one page landmark and six fields through shared native controls", () => {
    const { container } = renderApp(["/signup"]);

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Create your client account" })).toBeVisible();

    const controls = [
      ["Full name", "signup-name", "name", "input"],
      ["Email address", "signup-email", "email", "input"],
      ["Mobile number", "signup-mobile", "tel", "input"],
      ["Address", "signup-address", "street-address", "textarea"],
      ["Password", "signup-password", "new-password", "input"],
      ["Confirm password", "signup-password-confirmation", "new-password", "input"]
    ] as const;

    for (const [label, id, autocomplete, elementName] of controls) {
      const control = screen.getByLabelText(label, { exact: true });
      expect(control.tagName.toLowerCase()).toBe(elementName);
      expect(control).toHaveAttribute("id", id);
      expect(control).toHaveAttribute("autocomplete", autocomplete);
      expect(control).toHaveClass(
        "ui-control",
        elementName === "textarea" ? "ui-textarea" : "ui-input"
      );
      expect(control.closest(".ui-field")).toHaveClass("field");
    }
  });

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
      ),
      http.get("/api/v1/client/estimates", () =>
        HttpResponse.json({ data: [] })
      )
    );
    const { router } = renderApp(["/signup"]);
    await fillSignupForm();

    await userEvent.click(screen.getByRole("button", { name: "Create client account" }));

    const heading = await screen.findByRole("heading", { name: "Your design plans" });
    expect(heading).toBeVisible();
    expect(router.state.location.pathname).toBe("/client");
    expect(router.state.location.state).toEqual({ routeFocus: true });
    await waitFor(() => expect(heading).toHaveFocus());
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
    expect(email).toHaveAttribute("aria-describedby", "signup-email-error");
    expect(email).toHaveValue(signup.email);
    expect(screen.getByLabelText("Mobile number")).toHaveAccessibleDescription(
      "Use a reachable number."
    );
    expect(screen.getByLabelText("Mobile number")).toHaveAttribute(
      "aria-describedby",
      "signup-mobile-error"
    );
    for (const [label, value] of [
      ["Full name", signup.name],
      ["Email address", signup.email],
      ["Mobile number", signup.mobile],
      ["Address", signup.address],
      ["Password", signup.password],
      ["Confirm password", signup.passwordConfirmation]
    ] as const) {
      expect(screen.getByLabelText(label, { exact: true })).toHaveValue(value);
    }
  });

  it("provides shared 44px password toggles with state-dependent names", async () => {
    renderApp(["/signup"]);
    const passwordToggle = screen.getByRole("button", { name: "Show password" });
    const confirmationToggle = screen.getByRole("button", {
      name: "Show confirmation password"
    });
    const toggles = [passwordToggle, confirmationToggle];
    const iconButtonRule = primitiveStyles.match(
      /\.ui-icon-button\s*{\s*cursor:[^}]+}/
    )?.[0];
    expect(iconButtonRule).toContain("inline-size: 44px");
    expect(iconButtonRule).toContain("min-block-size: 44px");
    expect(iconButtonRule).toContain("min-inline-size: 44px");
    expect(toggles).toHaveLength(2);
    for (const toggle of toggles) {
      expect(toggle).toHaveClass("ui-icon-button", "password-field__toggle");
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    }
    expect(authStyles).toMatch(
      /\.login-page\s+\.password-field\s+\.ui-control\s*{[^}]*padding-inline-end:\s*var\(--space-10\)/
    );

    passwordToggle.focus();
    await userEvent.keyboard("{Enter}");

    expect(passwordToggle).toHaveAttribute("aria-pressed", "true");
    expect(passwordToggle).toHaveAccessibleName("Hide password");
    await userEvent.click(confirmationToggle);
    expect(confirmationToggle).toHaveAttribute("aria-pressed", "true");
    expect(confirmationToggle).toHaveAccessibleName("Hide confirmation password");
  });

  it("keeps a route back to sign in", async () => {
    renderApp(["/signup"]);
    await userEvent.click(screen.getByRole("link", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  it("keeps the submit name stable and prevents duplicate signup while pending", async () => {
    let releaseSignup!: () => void;
    const signupPending = new Promise<void>((resolve) => {
      releaseSignup = resolve;
    });
    let requests = 0;
    server.use(
      http.post("/api/v1/auth/client-signup", async () => {
        requests += 1;
        await signupPending;
        return HttpResponse.json(
          {
            error: {
              code: "ACCOUNT_EXISTS",
              message: "An account already exists for this email."
            }
          },
          { status: 409 }
        );
      })
    );
    renderApp(["/signup"]);
    await fillSignupForm();

    const submitButton = screen.getByRole("button", {
      name: "Create client account"
    });
    await userEvent.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    expect(submitButton).toHaveAccessibleName("Create client account");
    expect(submitButton).toHaveAttribute("aria-busy", "true");
    expect(submitButton).toHaveAttribute("data-busy", "true");
    expect(submitButton).toHaveTextContent("Creating account…");
    expect(submitButton.querySelector(".ui-button__content")).toHaveTextContent(
      "Create client account"
    );
    expect(submitButton.querySelector(".ui-button__busy")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(document.getElementById("signup-form")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(
      screen.getByRole("status", { name: "Signup status" })
    ).toHaveTextContent("Creating account. Please wait.");
    await userEvent.click(submitButton);
    expect(requests).toBe(1);

    releaseSignup();
    expect(await screen.findByRole("alert", { name: "Signup error" })).toBeVisible();
  });
});
