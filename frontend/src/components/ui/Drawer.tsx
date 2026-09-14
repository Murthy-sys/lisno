import { useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { OverlayPortal, OverlayScope, useOverlay } from "./overlay";

export interface DrawerProps {
  id: string;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  variant?: "navigation" | "contextual";
  side?: "left" | "right";
  width?: "narrow" | "medium" | "wide";
  eyebrow?: string;
  description?: string;
  metadata?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentInert?: boolean;
  showCloseButton?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function Drawer({
  id,
  open,
  title,
  onClose,
  children,
  busy = false,
  variant = "navigation",
  side = variant === "contextual" ? "right" : "left",
  width = "medium",
  eyebrow,
  description,
  metadata,
  footer,
  className,
  contentInert = false,
  showCloseButton = true,
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef
}: DrawerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  const { requestClose, scope } = useOverlay({
    open,
    containerRef: drawerRef,
    presentationRef: layerRef,
    onClose,
    busy,
    initialFocusRef,
    returnFocusRef,
    fallbackFocusRef,
    defaultInitialFocusContainerRef: bodyRef
  });

  if (!open) return null;

  const closeButton = showCloseButton ? (
    <IconButton
      className="ui-drawer__close"
      label={`Close ${title.toLocaleLowerCase()}`}
      icon={<X aria-hidden="true" />}
      onClick={requestClose}
      busy={busy}
      variant="quiet"
    />
  ) : null;

  const layer = (
    <OverlayScope value={scope}>
      <div ref={layerRef} className={`ui-drawer-layer ui-drawer-layer--${variant}`}>
        <Button
          className="ui-drawer-backdrop"
          variant="quiet"
          aria-label={`Close ${title.toLocaleLowerCase()}`}
          onClick={requestClose}
          busy={busy}
        >
          <span className="sr-only">Close {title.toLocaleLowerCase()}</span>
        </Button>
        <div
          ref={drawerRef}
          id={id}
          className={[
            "ui-drawer",
            `ui-drawer--${variant}`,
            `ui-drawer--${side}`,
            variant === "contextual" && `ui-drawer--${width}`,
            className
          ].filter(Boolean).join(" ")}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          aria-busy={busy || undefined}
          tabIndex={-1}
          inert={contentInert ? true : undefined}
          data-overlay-root
        >
          {variant === "contextual" ? (
            <div className="ui-drawer__header">
              <div className="ui-drawer__heading">
                {eyebrow ? <p className="ui-drawer__eyebrow eyebrow">{eyebrow}</p> : null}
                <h2 id={titleId}>{title}</h2>
                {description ? <p id={descriptionId} className="ui-drawer__description">{description}</p> : null}
                {metadata ? <div className="ui-drawer__metadata">{metadata}</div> : null}
              </div>
              {closeButton}
            </div>
          ) : (
            <>
              <h2 id={titleId} className="sr-only">{title}</h2>
              {description ? <p id={descriptionId} className="sr-only">{description}</p> : null}
              {closeButton}
            </>
          )}
          <div ref={bodyRef} className="ui-drawer__body" tabIndex={variant === "contextual" ? 0 : undefined}>
            {children}
          </div>
          {footer ? <div className="ui-drawer__footer">{footer}</div> : null}
        </div>
      </div>
    </OverlayScope>
  );

  return variant === "contextual" ? <OverlayPortal>{layer}</OverlayPortal> : layer;
}
