import { Outlet } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { AskLisnoLauncher } from "../../features/estimates/AskLisnoLauncher";
import { MobileHeader } from "./MobileHeader";
import { Sidebar } from "./Sidebar";
import { SkipLink } from "./SkipLink";

export function AppShell() {
  const auth = useAuth();
  if (!auth.user || !auth.authorization) return null;

  return (
    <div className="ui-app-shell" data-role={auth.user.role}>
      <SkipLink />
      <aside className="ui-sidebar-rail" aria-label="Application sidebar">
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
      <main
        id="main-content"
        className="ui-workspace"
        data-role={auth.user.role}
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
      {auth.user.role === "client" ? <AskLisnoLauncher /> : null}
    </div>
  );
}
