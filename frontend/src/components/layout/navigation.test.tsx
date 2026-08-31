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
  MailCheck,
  Palette,
  Settings2,
  UsersRound,
  WalletCards
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
  ["super_admin", [["Dashboard", "/admin/dashboard", LayoutDashboard], ["All Projects", "/admin/projects", FolderKanban], ["Users", "/admin/users", UsersRound], ["Configuration", "/admin/configuration/estimation", Settings2, false], ["Client responses", "/admin/client-responses", MailCheck], ["Design approvals", "/admin/design-approvals", Palette], ["Access requests", "/admin/access-requests", ClipboardCheck], ["Finance", "/finance", WalletCards]]],
  ["admin", [["My Projects", "/admin/projects", FolderKanban], ["Client responses", "/admin/client-responses", MailCheck], ["Design approvals", "/admin/design-approvals", Palette], ["Access requests", "/admin/access-requests", ClipboardCheck]]],
  ["estimator_sales", [["Leads & estimates", "/estimator-sales", BriefcaseBusiness]]],
  ["designer", [["Workspace", "/designer", LayoutDashboard], ["Design plans", "/designer/design-plans", Palette], ["My access requests", "/access-requests/mine", KeyRound]]],
  ["procurement", [["My access requests", "/access-requests/mine", KeyRound], ["Home", "/home", House]]],
  ["finance_head", [["Finance", "/finance", WalletCards], ["My access requests", "/access-requests/mine", KeyRound], ["Home", "/home", House]]],
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
  ReadonlyArray<readonly [string, string, typeof LayoutDashboard, boolean?]>
]>;

function navigationAuthorization(role: Role) {
  if (role !== "admin" && role !== "super_admin") return authorizationFor(role);
  return authorizationFor(role, [
    ...authorizationFor(role).permissions,
    "estimation.client_response_tasks.read",
    "design.plan_response_tasks.read"
  ]);
}

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
      const items = navigationForAuthorization(role, navigationAuthorization(role));

      expect(items).toEqual(
        expected.map(([label, to, icon, end = true]) => ({ label, to, end, icon }))
      );
      expect(items.every((item) => !item.to.includes(":"))).toBe(true);
    }
  );

  it("keeps registry-derived navigation immutable", () => {
    for (const role of ROLE_CODES) {
      const items = navigationForAuthorization(role, navigationAuthorization(role));

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
            authorization={navigationAuthorization(role)}
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

  it("shows Client responses only to permitted Admin presentations", () => {
    for (const role of ["admin", "super_admin"] as const) {
      expect(
        navigationForAuthorization(role, navigationAuthorization(role)).filter(
          ({ label }) => label === "Client responses"
        )
      ).toEqual([
        expect.objectContaining({
          label: "Client responses",
          to: "/admin/client-responses",
          end: true,
          icon: MailCheck
        })
      ]);
      expect(
        navigationForAuthorization(
          role,
          authorizationFor(role, ["identity.self.read"])
        ).some(({ label }) => label === "Client responses")
      ).toBe(false);
    }

    for (const role of ROLE_CODES.filter(
      (candidate) => candidate !== "admin" && candidate !== "super_admin"
    )) {
      expect(
        navigationForAuthorization(role, authorizationFor(role)).some(
          ({ label }) => label === "Client responses"
        )
      ).toBe(false);
    }
  });

  it("shows one nested Configuration navigation item only to a permitted Super Admin", () => {
    expect(
      navigationForAuthorization(
        "super_admin",
        authorizationFor("super_admin")
      ).filter(({ label }) => label === "Configuration")
    ).toEqual([
      {
        label: "Configuration",
        to: "/admin/configuration/estimation",
        end: false,
        icon: Settings2
      }
    ]);

    expect(
      navigationForAuthorization(
        "super_admin",
        authorizationFor("super_admin", ["identity.self.read"])
      ).some(({ label }) => label === "Configuration")
    ).toBe(false);

    for (const role of ROLE_CODES.filter((candidate) => candidate !== "super_admin")) {
      expect(
        navigationForAuthorization(role, authorizationFor(role)).some(
          ({ label }) => label === "Configuration"
        )
      ).toBe(false);
    }
  });
});
