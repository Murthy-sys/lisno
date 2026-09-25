import type { ReactNode } from "react";

import type { PublicUser } from "../../api/types";
import { NotificationBell } from "../../features/notifications/NotificationBell";
import { AccountMenu } from "./AccountMenu";

export function WorkspaceTopbar({
  user,
  onLogout,
  leading,
  compact = false
}: {
  user: PublicUser;
  onLogout: () => void | Promise<void>;
  leading?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header
      className={`workspace-topbar${compact ? " workspace-topbar--compact" : ""}`}
      aria-label="Workspace tools"
    >
      <div className="workspace-topbar__leading">{leading}</div>
      <div className="workspace-topbar__actions">
        <NotificationBell />
        <AccountMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
