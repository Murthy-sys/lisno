import {
  useId,
  useRef,
  type ReactNode,
  type RefObject
} from "react";
import { X } from "lucide-react";

import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { OverlayPortal, OverlayScope, useOverlay } from "./overlay";

export interface DialogProps {
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
  contentInert?: boolean;
  showCloseButton?: boolean;
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
  busy = false,
  role = "dialog",
  contentInert = false,
  showCloseButton = true,
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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
        <div ref={layerRef} className="ui-overlay-layer modal-layer">
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
            className="ui-dialog modal"
            role={role}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            inert={contentInert ? true : undefined}
            data-overlay-root
          >
            {/* A plain container, not <header>: the dialog is portaled to
                document.body, where a <header> would expose a second banner
                landmark alongside the page header. */}
            <div className="ui-dialog__header modal__header">
              <div>
                <p className="eyebrow">{eyebrow}</p>
                <h2 id={titleId}>{title}</h2>
                {description ? <p id={descriptionId}>{description}</p> : null}
              </div>
              {showCloseButton ? (
                <IconButton
                  className="ui-dialog__close icon-button"
                  label={`Close ${title}`}
                  icon={<X aria-hidden="true" />}
                  onClick={requestClose}
                  busy={busy}
                  variant="quiet"
                />
              ) : null}
            </div>
            {children}
          </div>
        </div>
      </OverlayScope>
    </OverlayPortal>
  );
}
