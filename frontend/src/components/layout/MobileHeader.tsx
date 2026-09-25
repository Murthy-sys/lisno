import { useRef, useState } from "react";

import type { AuthorizationSnapshot } from "../../api/authorization-contract";
import type { PublicUser } from "../../api/types";
import { Drawer } from "../ui/Drawer";
import { IconButton } from "../ui/IconButton";
import { OverlayPortal } from "../ui/overlay";
import { Sidebar } from "./Sidebar";

export function MobileHeader({
  user,
  authorization,
  onLogout
}: {
  user: PublicUser;
  authorization: AuthorizationSnapshot;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <IconButton
        ref={triggerRef}
        className="workspace-topbar__navigation"
        label="Open navigation"
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>}
        variant="quiet"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(true)}
      />
      <OverlayPortal>
        <Drawer
          id="mobile-navigation"
          open={open}
          title="Navigation"
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
          className="workspace-navigation-drawer"
        >
          <Sidebar
            user={user}
            authorization={authorization}
            onLogout={() => {
              setOpen(false);
              onLogout();
            }}
            onNavigate={() => setOpen(false)}
            navigationLabel="Mobile navigation"
          />
        </Drawer>
      </OverlayPortal>
    </>
  );
}
