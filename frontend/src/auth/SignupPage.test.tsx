import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "../test/render";
import { server } from "../test/server";

describe("SignupPage", () => {
  it("explains invitation-based access without offering unauthenticated account or project claiming", () => {
    const signup = vi.fn(() => HttpResponse.json({ data: {} }));
    server.use(http.post("/api/v1/auth/client-signup", signup));
    const { container } = renderApp(["/signup"]);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Join through your project invitation" })).toBeVisible();
    expect(screen.getByText(/Open that invitation to create your account/)).toBeVisible();
    expect(screen.getByText(/ask your Lisno contact to resend/)).toBeVisible();
    expect(container.querySelector("form")).not.toBeInTheDocument();
    expect(container.querySelector("input")).not.toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it("retains the established login presentation and existing account sign-in", async () => {
    renderApp(["/signup"]);
    expect(screen.getByAltText("").getAttribute("src")).toMatch(/login_screen/);
    expect(screen.getByRole("img", { name: "Lisno" })).toBeVisible();
    expect(screen.getByText(/for a better/)).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(screen.getByRole("link", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Welcome to Lisno" })).toBeVisible();
  });
});
