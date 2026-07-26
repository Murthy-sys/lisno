import { ArrowRight, LayoutDashboard, LogOut } from "lucide-react";
import { NavLink } from "react-router-dom";

import type { PublicUser } from "../../api/types";
import { roleHomePath } from "../../auth/ProtectedRoute";

const roleLabels = {
  designer: "Designer",
  design_manager: "Design manager",
  design_head: "Design head",
  client: "Client"
} as const;

export function Sidebar({
  user,
  onLogout,
  onNavigate
}: {
  user: PublicUser;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="sidebar__inner">
      <div className="brand brand--light sidebar__brand">
        <span className="brand__mark" aria-hidden="true">L</span>
        <span>LISNO</span>
      </div>

      <div className="sidebar__role">
        <p>Signed in as</p>
        <strong>{roleLabels[user.role]}</strong>
      </div>

      <nav aria-label="Primary navigation" className="sidebar__nav">
        <NavLink
          to={roleHomePath(user.role)}
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            `sidebar__link${isActive ? " sidebar__link--active" : ""}`
          }
        >
          <LayoutDashboard aria-hidden="true" />
          <span>Workspace</span>
          <ArrowRight className="sidebar__link-arrow" aria-hidden="true" />
        </NavLink>
      </nav>

      <div className="sidebar__account">
        <span className="avatar" aria-hidden="true">{initials}</span>
        <span className="sidebar__identity">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </span>
        <button type="button" onClick={onLogout} aria-label="Sign out">
          <LogOut aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
