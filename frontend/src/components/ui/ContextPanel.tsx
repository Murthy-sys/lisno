import { useEffect, useId, useState, type ReactNode } from "react";

import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Drawer, type DrawerProps } from "./Drawer";

export interface ContextPanelActions {
  requestClose: () => void;
}

type PanelContent = ReactNode | ((actions: ContextPanelActions) => ReactNode);

export interface ContextPanelProps extends Omit<DrawerProps, "id" | "open" | "variant" | "children" | "footer"> {
  id?: string;
  open?: boolean;
  dirty?: boolean;
  children: PanelContent;
  footer?: PanelContent;
}

/** A contextual form/detail surface; callers retain all save and dirty-state ownership. */
export function ContextPanel({
  id,
  open = true,
  dirty = false,
  busy = false,
  onClose,
  children,
  footer,
  ...drawerProps
}: ContextPanelProps) {
  const generatedId = useId();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) setConfirmDiscard(false);
  }, [open]);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };
  const actions: ContextPanelActions = { requestClose };

  return (
    <>
      <Drawer
        {...drawerProps}
        id={id ?? `context-panel-${generatedId}`}
        open={open}
        variant="contextual"
        busy={busy}
        onClose={requestClose}
        footer={typeof footer === "function" ? footer(actions) : footer}
      >
        {typeof children === "function" ? children(actions) : children}
      </Drawer>
      {open && confirmDiscard ? (
        <Dialog
          title="Discard unsaved changes?"
          eyebrow="Unsaved changes"
          description="Your changes will be lost if you close this panel."
          role="alertdialog"
          busy={busy}
          onClose={() => setConfirmDiscard(false)}
        >
          <div className="modal__actions">
            <Button
              variant="secondary"
              disabled={busy}
              data-dialog-initial-focus
              onClick={() => setConfirmDiscard(false)}
            >
              Keep editing
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                setConfirmDiscard(false);
                onClose();
              }}
            >
              Discard changes
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
