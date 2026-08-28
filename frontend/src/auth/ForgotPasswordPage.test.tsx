import axe from "axe-core";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { renderApp } from "../test/render";
import { server } from "../test/server";

const ACCEPTED_MESSAGE =
  "If an account exists for that email, we'll send password reset instructions.";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("ForgotPasswordPage", () => {
  it("renders the public recovery form with accessible email semantics", () => {
    renderApp(["/forgot-password"]);

    expect(screen.getByRole("main")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Reset your password", level: 1 })
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "email"
    );
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("has no automated accessibility violations in the request state", async () => {
    renderApp(["/forgot-password"]);

    expect(
      (
        await axe.run(document.body, {
          rules: { "color-contrast": { enabled: false } }
        })
      ).violations
    ).toEqual([]);
  });

  it("validates and focuses the email before making a request", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.post("/api/v1/auth/password-reset/request", () => {
        calls += 1;
        return HttpResponse.json({ data: { accepted: true } }, { status: 202 });
      })
    );
    renderApp(["/forgot-password"]);

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(
      screen.getByRole("button", { name: "Send reset instructions" })
    );

    expect(await screen.findByText("Enter a valid email address.")).toBeVisible();
    expect(screen.getByLabelText("Email address")).toHaveFocus();
    expect(calls).toBe(0);
  });

  it("submits once while pending and replaces the form with account-neutral copy", async () => {
    const requestGate = deferred();
    let calls = 0;
    server.use(
      http.post("/api/v1/auth/password-reset/request", async ({ request }) => {
        calls += 1;
        expect(await request.json()).toEqual({ email: "real.user@example.com" });
        expect(request.headers.get("authorization")).toBeNull();
        await requestGate.promise;
        return HttpResponse.json({ data: { accepted: true } }, { status: 202 });
      })
    );
    const user = userEvent.setup();
    renderApp(["/forgot-password"]);
    await user.type(screen.getByLabelText("Email address"), "real.user@example.com");
    const submit = screen.getByRole("button", { name: "Send reset instructions" });

    await user.dblClick(submit);
    await waitFor(() => expect(calls).toBe(1));
    expect(submit).toBeDisabled();
    requestGate.resolve();

    expect(await screen.findByText(ACCEPTED_MESSAGE)).toBeVisible();
    expect(screen.queryByText("real.user@example.com")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.getByRole("button", { name: "Try another email" })).toBeVisible();
    expect(calls).toBe(1);
  });

  it("starts a clean retry without echoing the prior email", async () => {
    server.use(
      http.post("/api/v1/auth/password-reset/request", () =>
        HttpResponse.json({ data: { accepted: true } }, { status: 202 })
      )
    );
    const user = userEvent.setup();
    renderApp(["/forgot-password"]);
    await user.type(screen.getByLabelText("Email address"), "person@example.com");
    await user.click(
      screen.getByRole("button", { name: "Send reset instructions" })
    );
    await screen.findByText(ACCEPTED_MESSAGE);

    await user.click(screen.getByRole("button", { name: "Try another email" }));

    const email = screen.getByLabelText("Email address");
    expect(email).toHaveValue("");
    await waitFor(() => expect(email).toHaveFocus());
    expect(screen.queryByText("person@example.com")).not.toBeInTheDocument();
  });

  it.each([
    [
      503,
      "PASSWORD_RESET_DELIVERY_UNAVAILABLE",
      "Password reset is temporarily unavailable. Please try again later."
    ],
    [429, "TOO_MANY_ATTEMPTS", "Too many attempts. Please wait and try again later."]
  ])("shows an account-neutral %s state", async (status, code, message) => {
    server.use(
      http.post("/api/v1/auth/password-reset/request", () =>
        HttpResponse.json(
          { error: { code, message: "Unsafe provider detail" } },
          { status }
        )
      )
    );
    const user = userEvent.setup();
    renderApp(["/forgot-password"]);
    await user.type(screen.getByLabelText("Email address"), "person@example.com");

    await user.click(
      screen.getByRole("button", { name: "Send reset instructions" })
    );

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByText("Unsafe provider detail")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeVisible();
  });
});
