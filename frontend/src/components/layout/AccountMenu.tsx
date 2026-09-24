import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { ROLE_LABELS } from "../../api/authorization-contract";
import type { PublicUser } from "../../api/types";

interface AccountMenuProps {
  user: PublicUser;
  onLogout: () => void | Promise<void>;
}

export function AccountMenu(props: AccountMenuProps) {
  // A replacement identity must never inherit an open disclosure or logout error.
  const identityKey = JSON.stringify([props.user.id, props.user.role, props.user.email]);
  return <AccountDisclosure key={identityKey} {...props} />;
}

function AccountDisclosure({ user, onLogout }: AccountMenuProps) {
  const location = useLocation();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const logoutInFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const initials = user.name.trim().split(/\s+/).filter(Boolean)
    .slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    setOpen(false);
    setLogoutError(null);
  }, [location.key, location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const logout = async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLogoutPending(true);
    setLogoutError(null);
    try {
      await onLogout();
      if (mounted.current) {
        if (root.current?.contains(document.activeElement)) trigger.current?.focus();
        setOpen(false);
      }
    } catch {
      if (mounted.current) setLogoutError("Could not sign out. Please try again.");
    } finally {
      logoutInFlight.current = false;
      if (mounted.current) setLogoutPending(false);
    }
  };

  return (
    <div
      className="workspace-account"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="workspace-account__trigger"
        aria-label={user.name}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Account"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="workspace-account__avatar" aria-hidden="true">{initials}</span>
        <span className="workspace-account__identity">
          <span className="workspace-account__name">{user.name}</span>
          <span className="workspace-account__role">{ROLE_LABELS[user.role]}</span>
        </span>
        <svg
          className={`workspace-account__chevron${open ? " is-open" : ""}`}
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        ><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open ? (
        <div id={panelId} role="group" aria-label="Account" className="workspace-account__panel">
          <div className="workspace-account__details">
            <strong>{ROLE_LABELS[user.role]}</strong>
            <span className="workspace-account__email">{user.email}</span>
          </div>
          <button
            type="button"
            className="workspace-account__signout"
            disabled={logoutPending}
            aria-busy={logoutPending}
            data-busy={logoutPending || undefined}
            onClick={() => void logout()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true">
              <path d="M10 4H5v16h5M9 12h12m-4-4 4 4-4 4" />
            </svg>
            Sign out
          </button>
          {logoutError ? <p role="alert" className="workspace-account__error">{logoutError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
