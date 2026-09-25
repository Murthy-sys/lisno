import { NavLink } from "react-router-dom";

import type { AuthorizationSnapshot } from "../../api/authorization-contract";
import type { PublicUser } from "../../api/types";
import directoryScene from "../../assets/vendor-directory-header.webp";
import { BrandLogo } from "../ui/BrandLogo";
import { navigationForAuthorization } from "./navigation";
import { SidebarIcon } from "./SidebarIcon";

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
        {navigationForAuthorization(user.role, authorization).map((item) => (
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
        ))}
      </nav>

      <div className="ui-sidebar__scene" aria-hidden="true">
        <p>Build<br />Better<br />Spaces</p>
        <img src={directoryScene} alt="" />
      </div>
    </div>
  );
}
