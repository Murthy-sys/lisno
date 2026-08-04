import { Outlet } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { MobileHeader } from "./MobileHeader";
import { Sidebar } from "./Sidebar";
import { SkipLink } from "./SkipLink";

export function AppShell() {
  const auth = useAuth();
  if (!auth.user) return null;

  return (
    <div className="ui-app-shell" data-role={auth.user.role}>
      <SkipLink />
      <aside className="ui-sidebar-rail" aria-label="Application sidebar">
        <Sidebar user={auth.user} onLogout={auth.logout} />
      </aside>
      <MobileHeader user={auth.user} onLogout={auth.logout} />
      <main
        id="main-content"
        className="ui-workspace"
        data-role={auth.user.role}
        tabIndex={-1}
      >
        <Outlet />
      </main>
    </div>
  );
}
