import { Outlet } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { MobileHeader } from "./MobileHeader";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const auth = useAuth();
  if (!auth.user) return null;

  return (
    <div className="app-layout">
      <aside className="desktop-sidebar">
        <Sidebar user={auth.user} onLogout={auth.logout} />
      </aside>
      <MobileHeader user={auth.user} onLogout={auth.logout} />
      <main className="workspace" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
