import { matchPath, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { AskLisnoLauncher } from "../../features/estimates/AskLisnoLauncher";
import { MobileHeader } from "./MobileHeader";
import { Sidebar } from "./Sidebar";
import { SkipLink } from "./SkipLink";
import { ProjectChatProvider } from "../../features/messages";
import "../../features/messages/projectChatShell.css";

export function AppShell() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const messaging = Boolean(matchPath("/project-messages", pathname) || matchPath("/projects/:projectId/messages", pathname));
  if (!auth.user || !auth.authorization) return null;

  return (
    <ProjectChatProvider>
    <div className={messaging ? "project-messaging-app" : "ui-app-shell"} data-role={messaging ? undefined : auth.user.role}>
      <SkipLink />
      {!messaging ? <><aside className="ui-sidebar-rail" aria-label="Application sidebar">
        <Sidebar
          user={auth.user}
          authorization={auth.authorization}
          onLogout={auth.logout}
        />
      </aside>
      <MobileHeader
        user={auth.user}
        authorization={auth.authorization}
        onLogout={auth.logout}
      />
      </> : null}
      <main
        id="main-content"
        className={messaging ? "project-messaging-main" : "ui-workspace"}
        data-role={messaging ? undefined : auth.user.role}
        tabIndex={-1}
      >
        <Outlet />
      </main>
      {/*
        Sits outside <main> on purpose. It is position: fixed, and the glass
        decks inside the workspace use backdrop-filter, which makes them a
        containing block for fixed descendants — rendering it in the estimates
        panel pinned it to that card instead of the viewport.
      */}
      {!messaging && auth.user.role === "client" ? <AskLisnoLauncher /> : null}
    </div>
    </ProjectChatProvider>
  );
}
