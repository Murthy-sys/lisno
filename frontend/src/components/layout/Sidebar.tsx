import { ArrowRight, LogOut } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";

import { ROLE_LABELS } from "../../api/authorization-contract";
import type { PublicUser } from "../../api/types";
import { BrandLogo } from "../ui/BrandLogo";
import { IconButton } from "../ui/IconButton";
import { navigationForRole } from "./navigation";

export function Sidebar({
  user,
  onLogout,
  onNavigate,
  navigationLabel = "Primary navigation"
}: {
  user: PublicUser;
  onLogout: () => void | Promise<void>;
  onNavigate?: () => void;
  navigationLabel?: string;
}) {
  const [logoutPending, setLogoutPending] = useState(false);
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const logout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await onLogout();
    } finally {
      setLogoutPending(false);
    }
  };

  return (
    <div className="ui-sidebar__inner">
      <div className="ui-sidebar__brand">
        <BrandLogo light />
      </div>

      <div className="ui-sidebar__role">
        <p>Signed in as</p>
        <strong>{ROLE_LABELS[user.role]}</strong>
      </div>

      <nav aria-label={navigationLabel} className="ui-sidebar__nav">
        {navigationForRole(user.role).map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `ui-sidebar__link${isActive ? " ui-sidebar__link--active" : ""}`
              }
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
              <ArrowRight className="ui-sidebar__link-arrow" aria-hidden="true" />
            </NavLink>
          );
        })}
      </nav>

      <div className="ui-sidebar__account">
        <span className="ui-sidebar__avatar" aria-hidden="true">{initials}</span>
        <span className="ui-sidebar__identity">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </span>
        <IconButton
          className="ui-sidebar__sign-out"
          label="Sign out"
          tooltip="Sign out"
          icon={<LogOut aria-hidden="true" />}
          onClick={() => void logout()}
          variant="quiet"
          busy={logoutPending}
        />
      </div>
    </div>
  );
}
