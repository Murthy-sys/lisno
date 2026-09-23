import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
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
  const formId = useId();
  const [dirty, setDirty] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <ContextPanel
      title={title}
      eyebrow="Estimation configuration"
      description="Add this reusable value without leaving the item workspace."
      busy={busy}
      onClose={onClose}
      width="medium"
      className="knowledge-context-panel"
      dirty={dirty}
      footer={({ requestClose }) => (
        <div className="knowledge-dialog-actions">
          <Button type="button" variant="destructive-outline" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} busy={busy} busyLabel={busyLabel ?? `Adding ${submitLabel}…`}>
            {submitLabel}
          </Button>
        </div>
      )}>
      <form id={formId} className="knowledge-dialog-form" onSubmit={submit} onChangeCapture={() => setDirty(true)} noValidate>
        <div className="knowledge-dialog-body">
          {error ? (
            <InlineMessage tone="error" role="alert">
              {error}
            </InlineMessage>
          ) : null}
          {children}
        </div>
      </form>
    </ContextPanel>
  );
}
