import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  FolderKanban,
  House,
  KeyRound,
  LayoutDashboard,
  UsersRound
} from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { PublicUser, Role } from "../../api/types";
import { ROLE_CODES, ROLE_LABELS } from "../../api/authorization-contract";
import { roleHomePath } from "../../app/routePaths";
import { authorizationFor } from "../../test/authFixtures";
import { Sidebar } from "./Sidebar";
import { navigationForAuthorization } from "./navigation";

const roleNavigation = [
  ["super_admin", [["Users", "/admin/users", UsersRound], ["Access requests", "/admin/access-requests", ClipboardCheck]]],
  ["admin", [["My Projects", "/admin/projects", FolderKanban], ["Access requests", "/admin/access-requests", ClipboardCheck]]],
  ["estimator_sales", [["Leads & estimates", "/estimator-sales", BriefcaseBusiness]]],
  ["designer", [["Workspace", "/designer", LayoutDashboard], ["My access requests", "/access-requests/mine", KeyRound]]],
  ["procurement", [["My access requests", "/access-requests/mine", KeyRound], ["Home", "/home", House]]],
  ["finance_head", [["My access requests", "/access-requests/mine", KeyRound], ["Home", "/home", House]]],
  ["site_manager", [["My access requests", "/access-requests/mine", KeyRound], ["Home", "/home", House]]],
  ["worker_electrician", [["Home", "/home", House]]],
  ["worker_plumber", [["Home", "/home", House]]],
  ["worker_carpenter", [["Home", "/home", House]]],
  ["worker_painter", [["Home", "/home", House]]],
  ["worker_civil", [["Home", "/home", House]]],
  ["worker_other", [["Home", "/home", House]]],
  ["design_manager", [["Team", "/manager", UsersRound]]],
  ["design_head", [["Organization", "/head", Building2]]],
  ["client", [["My projects", "/client", FolderKanban]]]
] as const satisfies ReadonlyArray<readonly [
  Role,
  ReadonlyArray<readonly [string, string, typeof LayoutDashboard]>
]>;

describe("role navigation", () => {
  it.each(ROLE_CODES)("returns a frozen safe navigation array for %s", (role) => {
    const items = navigationForAuthorization(role, authorizationFor(role));

    expect(items).toBeDefined();
    expect(Object.isFrozen(items)).toBe(true);
    for (const item of items) {
      expect(Object.isFrozen(item)).toBe(true);
      expect(item.to).not.toContain(":");
    }
  });

  it.each(ROLE_CODES)("renders the canonical %s role label", (role) => {
    const user: PublicUser = {
      id: `${role}-1`,
      name: "Aarav Mehta",
      email: "aarav@lisno.example",
      role
    };

    render(
      <MemoryRouter initialEntries={[roleHomePath(role)]}>
        <Sidebar
          user={user}
          authorization={authorizationFor(role)}
          onLogout={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(ROLE_LABELS[role])).toBeVisible();
  });

  it.each(roleNavigation)(
    "derives the exact registered navigation for %s",
    (role, expected) => {
      const items = navigationForAuthorization(role, authorizationFor(role));

      expect(items).toEqual(
        expected.map(([label, to, icon]) => ({ label, to, end: true, icon }))
      );
      expect(items.every((item) => !item.to.includes(":"))).toBe(true);
    }
  );

  it("keeps registry-derived navigation immutable", () => {
    for (const role of ROLE_CODES) {
      const items = navigationForAuthorization(role, authorizationFor(role));

      expect(Object.isFrozen(items)).toBe(true);
      for (const item of items) expect(Object.isFrozen(item)).toBe(true);
      expect(() => (items as Array<(typeof items)[number]>).push(items[0])).toThrow(
        TypeError
      );
    }
  });

  it("fails closed for a role-mismatched or permission-missing snapshot", () => {
    expect(
      navigationForAuthorization("designer", authorizationFor("admin"))
    ).toEqual([]);
    expect(
      navigationForAuthorization(
        "designer",
        authorizationFor("designer", ["identity.self.read"])
      )
    ).toEqual([]);
  });

  it.each(roleNavigation)(
    "renders the first %s navigation icon decoratively and preserves callbacks",
    async (role, expected) => {
      const [label, destination] = expected[0];
      const onNavigate = vi.fn();
      const user: PublicUser = {
        id: `${role}-1`,
        name: "Aarav Mehta",
        email: "aarav@lisno.example",
        role
      };

      render(
        <MemoryRouter initialEntries={[destination]}>
          <Sidebar
            user={user}
            authorization={authorizationFor(role)}
            onLogout={vi.fn()}
            onNavigate={onNavigate}
          />
        </MemoryRouter>
      );

      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("aria-current", "page");
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

      await userEvent.click(link);
      expect(onNavigate).toHaveBeenCalledOnce();
    }
  );
});
