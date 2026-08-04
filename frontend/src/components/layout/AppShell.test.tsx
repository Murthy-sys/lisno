import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PublicUser, Role } from "../../api/types";
import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";
import { SkipLink } from "./SkipLink";

const shellFixtures = [
  ["designer", "/designer", "Workspace", "Ananya Rao", "ananya@lisno.example"],
  [
    "estimator_sales",
    "/estimator-sales",
    "Leads & estimates",
    "Priya Sharma",
    "priya@lisno.example"
  ],
  ["client", "/client", "My projects", "Maya Patel", "maya@lisno.example"]
] as const satisfies ReadonlyArray<readonly [Role, string, string, string, string]>;

function installAuthenticatedSession(user: PublicUser) {
  tokenStorage.set(`${user.role}-token`);
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (new URL(url, window.location.origin).pathname === "/api/v1/auth/me") {
      return Promise.resolve(Response.json({ data: user }));
    }

    return new Promise<Response>(() => undefined);
  });
}

describe("AppShell", () => {
  it.each(shellFixtures)(
    "renders one accessible %s workspace shell",
    async (role, path, label, name, email) => {
      installAuthenticatedSession({ id: `${role}-1`, name, email, role });
      renderApp([path]);

      const navigation = await screen.findByRole("navigation", {
        name: "Primary navigation"
      });
      expect(navigation).toBeVisible();
      expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
        "href",
        "#main-content"
      );
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getByRole("main")).toHaveAttribute("data-role", role);
      expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");

      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "aria-current",
        "page"
      );
      expect(screen.getAllByRole("img", { name: "Lisno" })[0]).toHaveAttribute(
        "src",
        "/lisno-logo.svg"
      );
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(email).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    }
  );
});

describe("SkipLink", () => {
  it("uses the default target and label", () => {
    render(
      <>
        <SkipLink />
        <main id="main-content" tabIndex={-1}>Content</main>
      </>
    );

    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content"
    );
  });

  it("keeps a custom fragment href and focuses that target on activation", async () => {
    const user = userEvent.setup();
    render(
      <>
        <SkipLink targetId="project-content">Skip to project</SkipLink>
        <section id="project-content" tabIndex={-1}>Project</section>
      </>
    );

    const link = screen.getByRole("link", { name: "Skip to project" });
    const target = document.getElementById("project-content");
    expect(link).toHaveAttribute("href", "#project-content");

    link.focus();
    await user.keyboard("{Enter}");

    expect(target).toHaveFocus();
    expect(link).toHaveAttribute("href", "#project-content");
  });
});
