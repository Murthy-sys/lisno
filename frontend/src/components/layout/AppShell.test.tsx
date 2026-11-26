import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PublicUser, Role } from "../../api/types";
import type { PermissionCode } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { collectionFeed } from "../../test/keyCollectionFixtures";
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

const stylesDirectory = resolve(process.cwd(), "src/styles");

function readRuntimeStyle(filename: string) {
  return readFileSync(resolve(stylesDirectory, filename), "utf8");
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleBodies(css: string, prelude: string) {
  const matches = css.matchAll(new RegExp(`${escapePattern(prelude)}\\s*\\{`, "g"));

  return [...matches].map((match) => {
    const openingBrace = css.indexOf("{", match.index ?? 0);
    let depth = 1;
    let cursor = openingBrace + 1;

    while (cursor < css.length && depth > 0) {
      if (css[cursor] === "{") depth += 1;
      if (css[cursor] === "}") depth -= 1;
      cursor += 1;
    }

    if (depth !== 0) throw new Error(`Unclosed CSS block for ${prelude}`);
    return css.slice(openingBrace + 1, cursor - 1);
  });
}

function declarations(css: string, selector: string, occurrence = 0) {
  const body = ruleBodies(css, selector)[occurrence];
  if (!body) throw new Error(`Missing CSS rule for ${selector}`);

  return new Map(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(([, property, value]) => [
      property,
      value.trim().replace(/\s+/g, " ")
    ])
  );
}

function numericToken(css: string, name: string) {
  const value = css.match(new RegExp(`${escapePattern(name)}\\s*:\\s*(\\d+);`))?.[1];
  if (!value) throw new Error(`Missing numeric token ${name}`);
  return Number(value);
}

function installAuthenticatedSession(
  user: PublicUser,
  permissions?: readonly PermissionCode[],
  handleRequest?: (url: URL) => Response | undefined
) {
  tokenStorage.set(`${user.role}-token`);
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const pathname = new URL(url, window.location.origin).pathname;
    if (pathname === "/api/v1/auth/me") {
      return Promise.resolve(Response.json({ data: user }));
    }
    if (pathname === "/api/v1/auth/authorization") {
      return Promise.resolve(
        Response.json({ data: authorizationFor(user.role, permissions) })
      );
    }

    const response = handleRequest?.(new URL(url, window.location.origin));
    if (response) return Promise.resolve(response);

    return new Promise<Response>(() => undefined);
  });
}

describe("AppShell", () => {
  it.each(["/designer", "/designer/design-plans", "/designer/projects/project-1", "/project-messages"])(
    "exposes one assignment reminder in the shared header at %s",
    async (route) => {
      const read = vi.fn((url: URL) => url.pathname === "/api/v1/designer/assignment-requests" ? Response.json({ data: {
        items: [{ id: "request-shell", projectId: "project-1", projectName: "Harbour Home", projectLocation: "Pune", preferredLanguage: "english",
          scopeSummary: { itemCount: 8, sectionCount: 3, roomCount: 2 }, status: "pending", version: 1,
          createdAt: "2026-11-25T09:00:00Z", decidedAt: null, canDecide: true, blockedReason: null, closureReason: null }],
        pagination: { limit: 20, offset: 0, total: 21, hasMore: true }
      } }) : undefined);
      installAuthenticatedSession({ id: "designer-one", name: "Designer One", email: "designer@lisno.example", role: "designer" }, undefined, read);
      renderApp([route]);
      const reminder = await screen.findByRole("button", { name: "Assignment requests (21)" });
      expect(within(screen.getByRole("banner", { name: "Workspace tools" })).getByRole("button", { name: "Assignment requests (21)" })).toBe(reminder);
      expect(screen.getAllByRole("button", { name: "Assignment requests (21)" })).toHaveLength(1);
      expect(screen.queryByText("Harbour Home")).not.toBeInTheDocument();
      await userEvent.click(reminder);
      const dialog = await screen.findByRole("dialog", { name: "Assignment requests" });
      expect(within(dialog).getByText("Harbour Home")).toBeVisible();
      expect(within(dialog).getByRole("button", { name: "Accept assignment for Harbour Home" })).toBeVisible();
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(reminder).toHaveFocus());
      await userEvent.click(screen.getByRole("button", { name: "Designer One" }));
      expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    }
  );

  it.each(["/designer", "/designer/design-plans", "/designer/projects/project-1", "/project-messages"])(
    "keeps the red collection reminder in the Designer shell at %s", async route => {
      installAuthenticatedSession({ id: "designer-a", name: "Designer A", email: "designer@lisno.example", role: "designer" }, undefined,
        url => url.pathname === "/api/v1/designer/key-collection-reminders" ? Response.json({ data: collectionFeed() }) : undefined);
      renderApp([route]);
      const reminder = await screen.findByRole("button", { name: "Key collection needs attention (2)" });
      expect(within(screen.getByRole("banner", { name: "Workspace tools" })).getByRole("button", { name: "Key collection needs attention (2)" })).toBe(reminder);
      await userEvent.click(reminder);
      const dialog = screen.getByRole("dialog", { name: "Key collection reminders" });
      expect(within(dialog).getAllByRole("timer")).toHaveLength(2);
      expect(within(dialog).getByRole("link", { name: "Open key collection for Lakeside Home" })).toHaveAttribute("href", "/designer/projects/project-b#key-collection");
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(reminder).toHaveFocus());
      expect(reminder).toBeVisible();
    }
  );

  it.each(["client", "super_admin", "estimator_sales"] as const)("does not fetch Designer requests for %s", async (role) => {
    const read = vi.fn();
    installAuthenticatedSession({ id: `${role}-1`, name: "Other Role", email: "other@lisno.example", role }, undefined, (url) => {
      if (url.pathname === "/api/v1/designer/assignment-requests") read();
      return undefined;
    });
    renderApp([role === "super_admin" ? "/admin/dashboard" : role === "estimator_sales" ? "/estimator-sales" : "/client"]);
    await screen.findByRole("banner", { name: "Workspace tools" });
    expect(screen.queryByRole("button", { name: /Assignment requests/ })).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

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
      expect(screen.getByRole("main").closest(".ui-app-shell")).not.toHaveAttribute(
        "data-configuration-backdrop"
      );
      expect(
        document.querySelector('[aria-live][aria-label="Page title"]')
      ).toBeNull();

      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "aria-current",
        "page"
      );
      expect(screen.getAllByRole("img", { name: "Lisno" })[0]).toHaveAttribute(
        "src",
        "/lisno-logo.svg"
      );
      const tools = screen.getByRole("banner", { name: "Workspace tools" });
      expect(within(tools).getByRole("button", { name })).toBeVisible();
      expect(screen.getAllByRole("button", { name: /^Notifications/ })).toHaveLength(1);
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
      await userEvent.click(screen.getByRole("button", { name }));
      expect(screen.getAllByText(email).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    }
  );

  it("moves keyboard focus from the authenticated skip link to the shell-owned main", async () => {
    const user = userEvent.setup();
    installAuthenticatedSession({
      id: "designer-1",
      name: "Ananya Rao",
      email: "ananya@lisno.example",
      role: "designer"
    });
    renderApp(["/designer"]);

    await screen.findByRole("navigation", { name: "Primary navigation" });
    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    const main = screen.getByRole("main");

    expect(main).toHaveAttribute("id", "main-content");
    expect(skipLink).toHaveAttribute("href", `#${main.id}`);

    await user.tab();
    expect(skipLink).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(main).toHaveFocus();
  });

  it.each([
    "/admin/configuration/estimation",
    "/admin/configuration/estimation/items/material-study?section=quality",
    "/admin/configuration/estimation/reusable-values",
    "/admin/configuration/estimation/workflow-timelines"
  ])("shares the decorative backdrop on Configuration route %s while content loads", async (path) => {
    installAuthenticatedSession({
      id: "configuration-admin",
      name: "Configuration Admin",
      email: "configuration@lisno.example",
      role: "super_admin"
    });
    renderApp([path]);

    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    const main = screen.getByRole("main");
    expect(main.closest(".ui-app-shell")).toHaveAttribute("data-configuration-backdrop", "true");
    expect(within(navigation).getByRole("link", { name: "Configuration" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("banner", { name: "Workspace tools" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Configuration Admin" })).toBeVisible();
  });

  it("adds and removes the backdrop as the existing sidebar navigates into and out of Configuration", async () => {
    const user = userEvent.setup();
    installAuthenticatedSession({
      id: "configuration-admin",
      name: "Configuration Admin",
      email: "configuration@lisno.example",
      role: "super_admin"
    });
    const { router } = renderApp(["/admin/projects"]);
    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    const shell = screen.getByRole("main").closest(".ui-app-shell");
    expect(shell).not.toHaveAttribute("data-configuration-backdrop");

    await user.click(within(navigation).getByRole("link", { name: "Configuration" }));
    expect(router.state.location.pathname).toBe("/admin/configuration/estimation");
    expect(screen.getByRole("main").closest(".ui-app-shell")).toBe(shell);
    expect(shell).toHaveAttribute("data-configuration-backdrop", "true");

    await user.click(within(navigation).getByRole("link", { name: "All Projects" }));
    expect(router.state.location.pathname).toBe("/admin/projects");
    expect(screen.getByRole("main").closest(".ui-app-shell")).toBe(shell);
    expect(shell).not.toHaveAttribute("data-configuration-backdrop");
    expect(screen.getByRole("button", { name: "Configuration Admin" })).toBeVisible();
  });

  it("connects the mobile trigger to the Drawer and closes it after navigation", async () => {
    installAuthenticatedSession({
      id: "designer-1",
      name: "Ananya Rao",
      email: "ananya@lisno.example",
      role: "designer"
    });
    renderApp(["/designer"]);
    await screen.findByRole("navigation", { name: "Primary navigation" });

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(trigger).toHaveAttribute("aria-controls", "mobile-navigation");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(drawer).toHaveAttribute("id", "mobile-navigation");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    await userEvent.click(within(drawer).getByRole("link", { name: "Workspace" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument()
    );
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("keeps account access in the shared topbar when mobile navigation closes", async () => {
    installAuthenticatedSession({
      id: "designer-1",
      name: "Ananya Rao",
      email: "ananya@lisno.example",
      role: "designer"
    });
    renderApp(["/designer"]);
    await screen.findByRole("navigation", { name: "Primary navigation" });
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(within(drawer).queryByRole("button", { name: "Ananya Rao" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Ananya Rao" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument()
    );
    expect(await screen.findByRole("heading", { name: "Welcome to Lisno" })).toBeVisible();
  });

  it("uses the same permission-filtered Admin links on desktop and mobile", async () => {
    installAuthenticatedSession({
      id: "admin-1",
      name: "Admin User",
      email: "admin@lisno.example",
      role: "admin"
    });
    renderApp(["/admin/projects"]);

    expect(
      await screen.findByRole("heading", { name: "My Projects" })
    ).toBeVisible();
    const desktopNavigation = screen.getByRole("navigation", {
      name: "Primary navigation"
    });
    expect(
      within(desktopNavigation).getAllByRole("link").map((link) => link.textContent)
    ).toEqual(["My Projects", "Procurement", "Access requests"]);

    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const mobileNavigation = within(
      screen.getByRole("dialog", { name: "Navigation" })
    ).getByRole("navigation", { name: "Mobile navigation" });
    expect(
      within(mobileNavigation).getAllByRole("link").map((link) => link.textContent)
    ).toEqual(["My Projects", "Procurement", "Access requests"]);
  });
});

describe("shell CSS contract", () => {
  it("preserves the layered, responsive, role-aware shell cascade", () => {
    const index = readRuntimeStyle("index.css");
    const shell = readRuntimeStyle("shell.css");
    const tokens = readRuntimeStyle("global.css");

    expect(
      /@layer\s+theme,\s*base,\s*components,\s*shell,\s*utilities;/.test(index)
    ).toBe(true);
    expect(/@import\s+"\.\/shell\.css"\s+layer\(shell\);/.test(index)).toBe(true);

    const appShell = declarations(shell, ".ui-app-shell");
    expect(appShell.get("min-inline-size")).toBe("320px");
    expect(appShell.get("overflow-x")).toBe("clip");
    expect(appShell.get("grid-template-columns")).toContain("minmax(0, 1fr)");

    const staffWorkspace = declarations(shell, ".ui-workspace");
    expect(declarations(shell, ".ui-workspace > *").get("inline-size")).toBe("100%");
    expect(shell).not.toContain("--ui-workspace-measure");
    expect(staffWorkspace.get("padding")).toContain("env(safe-area-inset-top)");
    expect(staffWorkspace.get("padding")).toContain("env(safe-area-inset-right)");
    expect(staffWorkspace.get("padding")).toContain("env(safe-area-inset-bottom)");
    expect(staffWorkspace.get("padding")).toContain("env(safe-area-inset-left)");

    const mobileRules = ruleBodies(shell, "@media (max-width: 767px)");
    expect(mobileRules).toHaveLength(1);
    const mobile = mobileRules[0];
    expect(declarations(mobile, ".ui-sidebar-rail").get("display")).toBe("none");
    expect(declarations(mobile, ".ui-mobile-header").get("display")).toBe("flex");
    expect(declarations(mobile, ".ui-mobile-header").get("padding")).toContain(
      "env(safe-area-inset-top)"
    );
    expect(declarations(shell, ".ui-mobile-header").get("display")).toBe("none");
    expect(declarations(shell, ".ui-drawer-layer").get("position")).toBe("fixed");
    expect(declarations(shell, ".ui-drawer").get("block-size")).toBe("100%");

    const overlay = numericToken(tokens, "--z-overlay");
    const modal = numericToken(tokens, "--z-modal");
    const skipLink = declarations(shell, ".ui-skip-link");
    const drawerLayer = declarations(shell, ".ui-drawer-layer");
    const skipOffset = skipLink
      .get("z-index")
      ?.match(/^calc\(var\(--z-overlay\) \+ (\d+)\)$/)?.[1];
    expect(skipOffset).toBeTruthy();
    expect(drawerLayer.get("z-index")).toBe("var(--z-modal)");
    const skipLayer = overlay + Number(skipOffset);
    expect(skipLayer).toBeGreaterThan(overlay);
    expect(skipLayer).toBeLessThan(modal);
  });

  it("removes Dialog and Drawer movement under reduced motion without hiding content", () => {
    const primitives = readRuntimeStyle("primitives.css");
    const shell = readRuntimeStyle("shell.css");
    const primitiveReducedMotion = ruleBodies(
      primitives,
      "@media (prefers-reduced-motion: reduce)"
    ).join("\n");
    const shellReducedMotion = ruleBodies(
      shell,
      "@media (prefers-reduced-motion: reduce)"
    ).join("\n");

    expect(declarations(primitiveReducedMotion, ".ui-dialog").get("animation")).toBe("none");
    expect(declarations(primitiveReducedMotion, ".ui-dialog").get("display")).toBeUndefined();
    expect(declarations(shellReducedMotion, ".ui-drawer").get("animation")).toBe("none");
    expect(declarations(shellReducedMotion, ".ui-drawer").get("display")).toBeUndefined();
  });
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
