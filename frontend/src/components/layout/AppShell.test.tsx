import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
});

describe("shell CSS contract", () => {
  it("preserves the layered, responsive, role-aware shell cascade", () => {
    const index = readRuntimeStyle("index.css");
    const shell = readRuntimeStyle("shell.css");
    const tokens = readRuntimeStyle("tokens.css");

    expect(
      /@layer\s+theme,\s*base,\s*components,\s*shell,\s*utilities;/.test(index)
    ).toBe(true);
    expect(/@import\s+"\.\/shell\.css"\s+layer\(shell\);/.test(index)).toBe(true);

    const appShell = declarations(shell, ".ui-app-shell");
    expect(appShell.get("min-inline-size")).toBe("320px");
    expect(appShell.get("overflow-x")).toBe("clip");
    expect(appShell.get("grid-template-columns")).toContain("minmax(0, 1fr)");

    const staffWorkspace = declarations(shell, ".ui-workspace");
    const clientWorkspace = declarations(shell, '.ui-workspace[data-role="client"]');
    expect(staffWorkspace.get("--ui-workspace-measure")).toBe("var(--content-wide)");
    expect(clientWorkspace.get("--ui-workspace-measure")).toBe(
      "var(--content-default)"
    );
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
