import {
  useId,
  useRef,
  type ReactNode
} from "react";
import { X } from "lucide-react";

import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { useOverlay } from "./overlay";

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
  showCloseButton = true
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useOverlay({
    open: true,
    containerRef: dialogRef,
    presentationRef: layerRef,
    onClose,
    busy
  });

  return (
    <div ref={layerRef} className="ui-overlay-layer modal-layer">
      <Button
        className="ui-overlay-backdrop modal-backdrop"
        variant="quiet"
        aria-label={`Close ${title}`}
        onClick={onClose}
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
        <header className="ui-dialog__header modal__header">
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
              onClick={onClose}
              busy={busy}
              variant="quiet"
            />
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
