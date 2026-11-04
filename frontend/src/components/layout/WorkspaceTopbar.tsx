import { useLayoutEffect, useRef, type ReactNode } from "react";

import type { PublicUser } from "../../api/types";
import { NotificationBell } from "../../features/notifications/NotificationBell";
import { AccountMenu } from "./AccountMenu";

export function WorkspaceTopbar({
  user,
  onLogout,
  leading,
  dailyTasksAction,
  compact = false
}: {
  user: PublicUser;
  onLogout: () => void | Promise<void>;
  leading?: ReactNode;
  dailyTasksAction?: ReactNode;
  compact?: boolean;
}) {
  const topbarRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const topbar = topbarRef.current;
    const shell = topbar?.parentElement;
    if (!topbar || !shell) return;
    const measure = () => {
      const height = topbar.getBoundingClientRect().height;
      if (height > 0) shell.style.setProperty("--workspace-toolbar-size", `${height}px`);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(topbar);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      shell.style.removeProperty("--workspace-toolbar-size");
    };
  }, []);

  return (
    <header
      ref={topbarRef}
      className={`workspace-topbar${compact ? " workspace-topbar--compact" : ""}`}
      aria-label="Workspace tools"
    >
      <div className="workspace-topbar__leading">{leading}</div>
      <div className="workspace-topbar__actions">
        {dailyTasksAction}
        <NotificationBell />
        <AccountMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
