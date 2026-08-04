import { useCallback, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { focusableSelector, useOverlay } from "./overlay";

export interface DrawerProps {
  id: string;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  side?: "left" | "right";
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function Drawer({
  id,
  open,
  title,
  onClose,
  children,
  busy = false,
  side = "left",
  initialFocusRef,
  returnFocusRef
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = `${id}-title`;
  const defaultInitialFocus = useCallback(
    () => bodyRef.current?.querySelector<HTMLElement>(focusableSelector) ?? null,
    []
  );

  useOverlay({
    open,
    containerRef: drawerRef,
    onClose,
    busy,
    initialFocusRef,
    returnFocusRef,
    defaultInitialFocus
  });

  if (!open) return null;

  return (
    <div className="ui-drawer-layer">
      <Button
        className="ui-drawer-backdrop"
        variant="quiet"
        aria-label={`Close ${title.toLocaleLowerCase()}`}
        onClick={onClose}
        busy={busy}
      >
        <span className="sr-only">Close {title.toLocaleLowerCase()}</span>
      </Button>
      <div
        ref={drawerRef}
        id={id}
        className={`ui-drawer ui-drawer--${side}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-overlay-root
      >
        <h2 id={titleId} className="sr-only">{title}</h2>
        <IconButton
          className="ui-drawer__close"
          label={`Close ${title.toLocaleLowerCase()}`}
          icon={<X aria-hidden="true" />}
          onClick={onClose}
          busy={busy}
          variant="quiet"
        />
        <div ref={bodyRef} className="ui-drawer__body">
          {children}
        </div>
      </div>
    </div>
  );
}
