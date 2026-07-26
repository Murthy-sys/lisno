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

describe("protected role routing", () => {
  it("restores a persisted token through /auth/me before showing the role home", async () => {
    tokenStorage.set("restored-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("/api/v1/auth/me");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer restored-token"
      );
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ data: designer });
    });

    const { router } = renderApp(["/designer"]);

    expect(screen.getByRole("status")).toHaveTextContent("Restoring your session");
    expect(
      await screen.findByRole("heading", { name: "Designer workspace" })
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/designer");
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
  });

  it("redirects a valid designer away from another role without destroying the session", async () => {
    tokenStorage.set("valid-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: designer })
    );

    const { router } = renderApp(["/manager"]);

    expect(
      await screen.findByRole("heading", { name: "Designer workspace" })
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/designer");
    expect(tokenStorage.get()).toBe("valid-token");
  });

  it("logs out, clears the token, and returns to login", async () => {
    tokenStorage.set("valid-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: designer })
    );
    const { router } = renderApp(["/designer"]);
    await screen.findByRole("heading", { name: "Designer workspace" });

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/login");
    expect(tokenStorage.get()).toBeNull();
  });

  it("opens an accessible mobile drawer, wraps focus in both directions, and closes on Escape", async () => {
    tokenStorage.set("valid-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: designer })
    );
    renderApp(["/designer"]);
    await screen.findByRole("heading", { name: "Designer workspace" });

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
