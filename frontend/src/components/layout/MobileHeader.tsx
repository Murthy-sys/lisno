import { Menu } from "lucide-react";
import { useRef, useState } from "react";

import type { PublicUser } from "../../api/types";
import { BrandLogo } from "../ui/BrandLogo";
import { Drawer } from "../ui/Drawer";
import { IconButton } from "../ui/IconButton";
import { Sidebar } from "./Sidebar";

export function MobileHeader({
  user,
  onLogout
}: {
  user: PublicUser;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <header className="ui-mobile-header">
        <div className="ui-mobile-header__brand">
          <BrandLogo light />
        </div>
        <IconButton
          ref={triggerRef}
          className="ui-mobile-header__trigger"
          label="Open navigation"
          icon={<Menu aria-hidden="true" />}
          variant="quiet"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen(true)}
        />
      </header>

      <Drawer
        id="mobile-navigation"
        open={open}
        title="Navigation"
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
      >
        <Sidebar
          user={user}
          onLogout={() => {
            setOpen(false);
            onLogout();
          }}
          onNavigate={() => setOpen(false)}
          navigationLabel="Mobile navigation"
        />
      </Drawer>
    </>
  );
}
