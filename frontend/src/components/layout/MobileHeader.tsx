import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PublicUser } from "../../api/types";
import { BrandLogo } from "../ui/BrandLogo";
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
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current
      ?.querySelector<HTMLElement>("a[href]")
      ?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])"
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <header className="mobile-header">
        <div className="brand">
          <BrandLogo />
        </div>
        <button
          ref={triggerRef}
          type="button"
          className="icon-button"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>
      </header>

      {open ? (
        <div className="drawer-layer">
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <div
            ref={drawerRef}
            id="mobile-navigation"
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <button
              type="button"
              className="drawer__close"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            <Sidebar
              user={user}
              onLogout={() => {
                setOpen(false);
                onLogout();
              }}
              onNavigate={() => setOpen(false)}
              navigationLabel="Mobile navigation"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
