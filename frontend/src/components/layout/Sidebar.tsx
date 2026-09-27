import { useEffect, useId, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import type { AuthorizationSnapshot } from "../../api/authorization-contract";
import type { PublicUser } from "../../api/types";
import directoryScene from "../../assets/vendor-directory-header.webp";
import { BrandLogo } from "../ui/BrandLogo";
import { isNavigationGroup, navigationForAuthorization, type NavigationGroup } from "./navigation";
import { SidebarIcon } from "./SidebarIcon";

function ProcurementNavigationGroup({
  group,
  onNavigate
}: {
  group: NavigationGroup;
  onNavigate?: () => void;
}) {
  const id = useId();
  const { pathname } = useLocation();
  const isChildActive = (to: string) => pathname === to ||
    (to === "/procurement" && pathname.startsWith("/procurement/projects/"));
  const active = group.children.some((child) => isChildActive(child.to));
  const [expanded, setExpanded] = useState(active);

  useEffect(() => {
    if (active) setExpanded(true);
  }, [pathname, active]);

  return (
    <div className="ui-sidebar__group">
      <button
        type="button"
        className={`ui-sidebar__group-trigger${active || expanded ? " ui-sidebar__group-trigger--active" : ""}`}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((current) => !current)}
      >
        <SidebarIcon destination="/procurement" />
        <span>{group.label}</span>
        <svg className="ui-sidebar__group-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div id={id} className="ui-sidebar__group-children" role="group" aria-label={`${group.label} sections`} hidden={!expanded}>
        {group.children.map((child) => {
          const selected = isChildActive(child.to);
          return (
            <Link
              key={child.to}
              to={child.to}
              onClick={onNavigate}
              aria-current={selected ? "page" : undefined}
              className={`ui-sidebar__group-link${selected ? " ui-sidebar__group-link--active" : ""}`}
            >
              <SidebarIcon destination={child.to} name={child.sidebarIcon} />
              <span>{child.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({
  user,
  authorization,
  onNavigate,
  navigationLabel = "Primary navigation"
}: {
  user: PublicUser;
  authorization: AuthorizationSnapshot;
  onLogout?: () => void | Promise<void>;
  onNavigate?: () => void;
  navigationLabel?: string;
}) {
  return (
    <div className="ui-sidebar__inner ui-common-navigation">
      <div className="ui-sidebar__brand">
        <BrandLogo />
        <span className="ui-sidebar__tagline">INTERIOR WORKSPACE</span>
      </div>

      <nav aria-label={navigationLabel} className="ui-sidebar__nav">
        {navigationForAuthorization(user.role, authorization).map((item) =>
          isNavigationGroup(item) ?
            <ProcurementNavigationGroup key={item.id} group={item} onNavigate={onNavigate} /> :
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `ui-sidebar__link${isActive ? " ui-sidebar__link--active" : ""}`
              }
            >
              <SidebarIcon destination={item.to} />
              <span>{item.label}</span>
            </NavLink>
        )}
      </nav>

      <div className="ui-sidebar__scene" aria-hidden="true">
        <p>Build<br />Better<br />Spaces</p>
        <img src={directoryScene} alt="" />
      </div>
    </div>
  );
}
