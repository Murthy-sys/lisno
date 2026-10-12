import {
  useId,
  useRef,
  type ReactNode,
  type RefObject
} from "react";

import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { DialogToolbar } from "./DialogToolbar";
import { OverlayPortal, OverlayScope, useOverlay } from "./overlay";

export interface DialogProps {
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  layerClassName?: string;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
  contentInert?: boolean;
  showCloseButton?: boolean;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  closeButtonLabel?: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function Dialog({
  title,
  eyebrow = "Designer workflow",
  description,
  onClose,
  children,
  className,
  layerClassName,
  busy = false,
  role = "dialog",
  contentInert = false,
  showCloseButton = true,
  closeButtonRef,
  closeButtonLabel,
  icon,
  tone = "default",
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const introIcon = icon ?? (tone === "danger" ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg> : null);

  const { requestClose, scope } = useOverlay({
    open: true,
    containerRef: dialogRef,
    presentationRef: layerRef,
    onClose,
    busy,
    initialFocusRef,
    returnFocusRef,
    fallbackFocusRef
  });

  return (
    <OverlayPortal>
      <OverlayScope value={scope}>
        <div ref={layerRef} className={["ui-overlay-layer modal-layer", layerClassName].filter(Boolean).join(" ")}>
          <Button
            className="ui-overlay-backdrop modal-backdrop"
            variant="quiet"
            aria-label={`Close ${title}`}
            onClick={requestClose}
            busy={busy}
          >
            <span className="sr-only">Close {title}</span>
          </Button>
          <div
            ref={dialogRef}
            className={["ui-dialog modal ui-dialog--reference", tone === "danger" && "ui-dialog--danger", className].filter(Boolean).join(" ")}
            role={role}
            aria-modal="true"
            aria-busy={busy || undefined}
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            inert={contentInert ? true : undefined}
            data-overlay-root
          >
            {/* A plain container, not <header>: the dialog is portaled to
                document.body, where a <header> would expose a second banner
                landmark alongside the page header. */}
            <DialogToolbar title={title}>
              {showCloseButton ? (
                <IconButton
                  ref={closeButtonRef}
                  className="ui-dialog__close icon-button"
                  label={closeButtonLabel ?? `Close ${title}`}
                  icon={<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m6 6 12 12M18 6 6 18" /></svg>}
                  onClick={requestClose}
                  busy={busy}
                  variant="quiet"
                />
              ) : null}
            </DialogToolbar>
            <div className="ui-dialog__header modal__header">
              {introIcon ? <span className="ui-dialog__intro-icon" aria-hidden="true">{introIcon}</span> : null}
              <div className="ui-dialog__intro-copy">
                <p className="eyebrow">{eyebrow}</p>
                <h2 id={titleId}>{title}</h2>
                {description ? <p id={descriptionId}>{description}</p> : null}
              </div>
            </div>
            {children}
          </div>
        </div>
      </OverlayScope>
    </OverlayPortal>
  );
}
