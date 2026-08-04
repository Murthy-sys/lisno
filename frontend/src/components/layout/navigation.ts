import {
  BriefcaseBusiness,
  Building2,
  FolderKanban,
  LayoutDashboard,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Role } from "../../api/types";

export interface NavigationItem {
  label: string;
  to: string;
  end: boolean;
  icon: LucideIcon;
}

function stableItems(items: NavigationItem[]): readonly NavigationItem[] {
  if (!import.meta.env.DEV) return items;

  items.forEach((item) => Object.freeze(item));
  return Object.freeze(items);
}

const navigationByRole: Record<Role, readonly NavigationItem[]> = {
  designer: stableItems([
    { label: "Workspace", to: "/designer", end: true, icon: LayoutDashboard }
  ]),
  design_manager: stableItems([
    { label: "Team", to: "/manager", end: true, icon: UsersRound }
  ]),
  design_head: stableItems([
    { label: "Organization", to: "/head", end: true, icon: Building2 }
  ]),
  estimator_sales: stableItems([
    {
      label: "Leads & estimates",
      to: "/estimator-sales",
      end: true,
      icon: BriefcaseBusiness
    }
  ]),
  client: stableItems([
    { label: "My projects", to: "/client", end: true, icon: FolderKanban }
  ])
};

export function navigationForRole(role: Role): readonly NavigationItem[] {
  return navigationByRole[role];
}
