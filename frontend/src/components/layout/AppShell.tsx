import { Link, matchPath, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { AskLisnoLauncher } from "../../features/estimates/AskLisnoLauncher";
import { MobileHeader } from "./MobileHeader";
import { Sidebar } from "./Sidebar";
import { SkipLink } from "./SkipLink";
import { WorkspaceTopbar } from "./WorkspaceTopbar";
import { BrandLogo } from "../ui/BrandLogo";
import { ProjectChatProvider } from "../../features/messages";
import "../../features/messages/projectChatShell.css";
import { NotificationProvider } from "../../features/notifications/NotificationProvider";
import { NotificationBanners } from "../../features/notifications/NotificationBell";
import "../../features/notifications/notifications.css";
import "./common-shell.css";
import "./configuration-shell.css";

const configurationBackdropPaths = [
  "/admin/configuration/estimation",
  "/admin/configuration/estimation/items/:itemId",
  "/admin/configuration/estimation/reusable-values"
] as const;

export function AppShell() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const messaging = Boolean(matchPath("/project-messages", pathname) || matchPath("/projects/:projectId/messages", pathname));
  const configurationBackdrop = configurationBackdropPaths.some((path) => matchPath(path, pathname));
  if (!auth.user || !auth.authorization) return null;

  return (
    <NotificationProvider>
    <ProjectChatProvider>
    <div className={messaging ? "project-messaging-app ui-common-shell" : "ui-app-shell ui-common-shell"} data-role={messaging ? undefined : auth.user.role} data-configuration-backdrop={configurationBackdrop ? "true" : undefined}>
      <SkipLink />
      {!messaging ? <aside className="ui-sidebar-rail" aria-label="Application sidebar">
        <Sidebar
          user={auth.user}
          authorization={auth.authorization}
          onLogout={auth.logout}
        />
      </aside> : null}
      <WorkspaceTopbar user={auth.user} onLogout={auth.logout} compact={messaging}
        leading={messaging ? <Link className="workspace-topbar__home" to="/project-messages" aria-label="Project messages"><BrandLogo /></Link> : <>
          <MobileHeader user={auth.user} authorization={auth.authorization} onLogout={auth.logout} />
          <span className="workspace-topbar__mobile-brand"><BrandLogo /></span>
        </>}
      />
      <main
        id="main-content"
        className={messaging ? "project-messaging-main" : "ui-workspace"}
        data-role={messaging ? undefined : auth.user.role}
        tabIndex={-1}
      >
        <Outlet />
      </main>
      <NotificationBanners />
      {/*
        Sits outside <main> on purpose. It is position: fixed, and the glass
        decks inside the workspace use backdrop-filter, which makes them a
        containing block for fixed descendants — rendering it in the estimates
        panel pinned it to that card instead of the viewport.
      */}
      {!messaging && auth.user.role === "client" ? <AskLisnoLauncher /> : null}
    </div>
    </ProjectChatProvider>
    </NotificationProvider>
  );
}
