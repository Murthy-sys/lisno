import type { FormEvent, ReactNode } from "react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { InlineMessage } from "../../components/ui/InlineMessage";

export interface KnowledgeQuickAddDialogProps {
  readonly title: string;
  readonly submitLabel: string;
  /* Defaults to "Adding <submitLabel>…", which reads badly when submitLabel is
     itself a verb phrase. */
  readonly busyLabel?: string;
  readonly children: ReactNode;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
  readonly busy?: boolean;
  readonly error?: string | null;
}

export function KnowledgeQuickAddDialog({
  title,
  submitLabel,
  busyLabel,
  children,
  onSubmit,
  onClose,
  busy = false,
  error
}: KnowledgeQuickAddDialogProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Dialog
      title={title}
      eyebrow="Estimation configuration"
      description="Add this reusable value without leaving the item workspace."
      busy={busy}
      onClose={onClose}
    >
      <form className="knowledge-dialog-form" onSubmit={submit} noValidate>
        <div className="knowledge-dialog-body">
          {error ? (
            <InlineMessage tone="error" role="alert">
              {error}
            </InlineMessage>
          ) : null}
          {children}
        </div>
        <div className="knowledge-dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} busyLabel={busyLabel ?? `Adding ${submitLabel}…`}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
