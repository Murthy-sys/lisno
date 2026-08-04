import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BriefcaseBusiness,
  Building2,
  FolderKanban,
  LayoutDashboard,
  UsersRound
} from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { PublicUser, Role } from "../../api/types";
import { roleHomePath } from "../../app/routePaths";
import { Sidebar } from "./Sidebar";
import { navigationForRole } from "./navigation";

const roleNavigation = [
  ["designer", "Workspace", "/designer", LayoutDashboard],
  ["design_manager", "Team", "/manager", UsersRound],
  ["design_head", "Organization", "/head", Building2],
  ["estimator_sales", "Leads & estimates", "/estimator-sales", BriefcaseBusiness],
  ["client", "My projects", "/client", FolderKanban]
] as const satisfies ReadonlyArray<
  readonly [Role, string, string, typeof LayoutDashboard]
>;

describe("role navigation", () => {
  it.each(roleNavigation)(
    "maps %s to its one stable role home",
    (role, label, destination, icon) => {
      const items = navigationForRole(role);

      expect(roleHomePath(role)).toBe(destination);
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({ label, to: destination, end: true, icon });
      expect(items[0].to).not.toContain(":");
    }
  );

  it("keeps shared navigation immutable in development", () => {
    for (const [role] of roleNavigation) {
      const items = navigationForRole(role);

      expect(Object.isFrozen(items)).toBe(true);
      expect(Object.isFrozen(items[0])).toBe(true);
      expect(() =>
        (items as Array<(typeof items)[number]>).push(items[0])
      ).toThrow(TypeError);
    }
  });

  it.each(roleNavigation)(
    "renders the %s Lucide icon decoratively and preserves navigation callbacks",
    async (role, label, destination) => {
      const onNavigate = vi.fn();
      const user: PublicUser = {
        id: `${role}-1`,
        name: "Aarav Mehta",
        email: "aarav@lisno.example",
        role
      };

      render(
        <MemoryRouter initialEntries={[destination]}>
          <Sidebar user={user} onLogout={vi.fn()} onNavigate={onNavigate} />
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
