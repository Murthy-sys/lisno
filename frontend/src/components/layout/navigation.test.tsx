import { render, screen, within } from "@testing-library/react";
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
  ShoppingCart,
  UsersRound,
  WalletCards
} from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { PublicUser, Role } from "../../api/types";
import { ROLE_CODES, ROLE_LABELS } from "../../api/authorization-contract";
import { roleHomePath } from "../../app/routePaths";
import { authorizationFor } from "../../test/authFixtures";
import { AccountMenu } from "./AccountMenu";
import { Sidebar } from "./Sidebar";
import { isNavigationGroup, navigationForAuthorization } from "./navigation";

const roleNavigation = [
  ["super_admin", [["Dashboard", "/admin/dashboard", LayoutDashboard], ["All Projects", "/admin/projects", FolderKanban], ["Users", "/admin/users", UsersRound], ["Configuration", "/admin/configuration/estimation", Settings2, false], ["Client responses", "/admin/client-responses", MailCheck], ["Design approvals", "/admin/design-approvals", Palette], ["Access requests", "/admin/access-requests", ClipboardCheck], ["Finance", "/finance", WalletCards]]],
  ["admin", [["My Projects", "/admin/projects", FolderKanban], ["Procurement", "/admin/procurement", ShoppingCart], ["Client responses", "/admin/client-responses", MailCheck], ["Design approvals", "/admin/design-approvals", Palette], ["Access requests", "/admin/access-requests", ClipboardCheck]]],
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
      if (isNavigationGroup(item)) {
        expect(Object.isFrozen(item.children)).toBe(true);
        for (const child of item.children) expect(child.to).not.toContain(":");
      } else {
        expect(item.to).not.toContain(":");
      }
    }
  });

  it.each(ROLE_CODES)("renders the canonical %s role label in the shared account control", async (role) => {
    const user: PublicUser = {
      id: `${role}-1`,
      name: "Aarav Mehta",
      email: "aarav@lisno.example",
      role
    };

    render(
      <MemoryRouter initialEntries={[roleHomePath(role)]}>
        <AccountMenu user={user} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    const trigger = screen.getByRole("button", { name: user.name });
    expect(within(trigger).getByText(ROLE_LABELS[role])).toBeVisible();

    await userEvent.click(trigger);
    const account = screen.getByRole("group", { name: "Account" });
    expect(within(account).getByText(ROLE_LABELS[role])).toBeVisible();
    expect(within(account).getByText(user.email)).toBeVisible();
  });

  it.each(roleNavigation)(
    "derives the exact registered navigation for %s",
    (role, expected) => {
      const items = navigationForAuthorization(role, navigationAuthorization(role));

      expect(items.filter((item) => !isNavigationGroup(item))).toEqual(
        expected.map(([label, to, icon, end = true]) => ({ label, to, end, icon }))
      );
      expect(items.every((item) => isNavigationGroup(item) || !item.to.includes(":"))).toBe(true);
    }
  );

  it("keeps registry-derived navigation immutable", () => {
    for (const role of ROLE_CODES) {
      const items = navigationForAuthorization(role, navigationAuthorization(role));

      expect(Object.isFrozen(items)).toBe(true);
      for (const item of items) {
        expect(Object.isFrozen(item)).toBe(true);
        if (isNavigationGroup(item)) {
          expect(Object.isFrozen(item.children)).toBe(true);
          for (const child of item.children) expect(Object.isFrozen(child)).toBe(true);
        }
      }
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

  it.each([
    ["super_admin", "/admin/procurement", "/admin/procurement/vendors"],
    ["procurement", "/procurement", "/procurement/vendors"]
  ] as const)("derives Dashboard and Vendors under one %s Procurement group", (role, dashboard, vendors) => {
    const groups = navigationForAuthorization(role, navigationAuthorization(role)).filter(isNavigationGroup);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "procurement",
      label: "Procurement",
      icon: ShoppingCart,
      children: [
        { label: "Dashboard", to: dashboard, sidebarIcon: "procurement-dashboard" },
        { label: "Vendors", to: vendors, sidebarIcon: "procurement-vendors" }
      ]
    });
    expect(navigationForAuthorization("admin", navigationAuthorization("admin")).filter(isNavigationGroup)).toEqual([]);
  });

  it("filters Procurement children by capability and hides an empty group", () => {
    expect(navigationForAuthorization("procurement", authorizationFor("procurement", ["identity.self.read"])) .filter(isNavigationGroup)).toEqual([]);
    expect(navigationForAuthorization("procurement", authorizationFor("procurement", ["procurement.vendor_directory.read"])) .filter(isNavigationGroup)[0]?.children.map((child) => child.label)).toEqual(["Vendors"]);
    expect(navigationForAuthorization("super_admin", authorizationFor("super_admin", ["procurement.vendor_suggestions.read"])) .filter(isNavigationGroup)).toEqual([]);
  });

  it("keeps the Procurement group expanded on a project route and supports keyboard toggling", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<MemoryRouter initialEntries={["/procurement/projects/project-1"]}>
      <Sidebar
        user={{ id: "procurement-1", name: "Procurement User", email: "procurement@lisno.example", role: "procurement" }}
        authorization={navigationAuthorization("procurement")}
        onNavigate={onNavigate}
      />
    </MemoryRouter>);
    const trigger = screen.getByRole("button", { name: "Procurement" });
    const children = screen.getByRole("group", { name: "Procurement sections" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", children.id);
    expect(within(children).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(within(children).getByRole("link", { name: "Vendors" })).not.toHaveAttribute("aria-current");
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(within(children).getByRole("link", { name: "Vendors" }));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(within(children).getByRole("link", { name: "Vendors" })).toHaveAttribute("aria-current", "page");
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
