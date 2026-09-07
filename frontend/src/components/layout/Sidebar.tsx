import { ArrowRight, ChevronDown, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import {
  ROLE_LABELS,
  type AuthorizationSnapshot
} from "../../api/authorization-contract";
import type { PublicUser } from "../../api/types";
import { BrandLogo } from "../ui/BrandLogo";
import { navigationForAuthorization } from "./navigation";

export function Sidebar({
  user,
  authorization,
  onLogout,
  onNavigate,
  navigationLabel = "Primary navigation"
}: {
  user: PublicUser;
  authorization: AuthorizationSnapshot;
  onLogout: () => void | Promise<void>;
  onNavigate?: () => void;
  navigationLabel?: string;
}) {
  const [logoutPending, setLogoutPending] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountMenuId = "sidebar-account-menu";
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [accountMenuOpen]);

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
        {navigationForAuthorization(user.role, authorization).map((item) => {
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

      <div className="ui-sidebar__account" ref={accountRef}>
        <button
          type="button"
          className="ui-sidebar__account-trigger"
          aria-haspopup="menu"
          aria-expanded={accountMenuOpen}
          aria-controls={accountMenuOpen ? accountMenuId : undefined}
          onClick={() => setAccountMenuOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && accountMenuOpen) {
              event.preventDefault();
              setAccountMenuOpen(false);
            }
          }}
        >
          <span className="ui-sidebar__avatar" aria-hidden="true">{initials}</span>
          <span className="ui-sidebar__account-name">{user.name}</span>
          <ChevronDown
            aria-hidden="true"
            className={`ui-sidebar__account-chevron${accountMenuOpen ? " is-open" : ""}`}
          />
        </button>

        {accountMenuOpen ? (
          <div
            id={accountMenuId}
            aria-label="Account"
            className="ui-sidebar__account-menu"
          >
            <div className="ui-sidebar__account-menu-header">
              <strong>{ROLE_LABELS[user.role]}</strong>
              <span>{user.email}</span>
            </div>
            <button
              type="button"
              className="ui-sidebar__account-menu-item"
              onClick={() => void logout()}
              disabled={logoutPending}
              aria-busy={logoutPending}
              data-busy={logoutPending || undefined}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
