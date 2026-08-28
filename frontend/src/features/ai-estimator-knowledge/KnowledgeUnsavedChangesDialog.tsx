import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { InlineMessage } from "../../components/ui/InlineMessage";

export interface KnowledgeUnsavedChangesDialogProps {
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly onStay: () => void;
  readonly busy?: boolean;
  readonly error?: string | null;
}

export function KnowledgeUnsavedChangesDialog({
  onSave,
  onDiscard,
  onStay,
  busy = false,
  error
}: KnowledgeUnsavedChangesDialogProps) {
  return (
    <Dialog
      title="Save changes before leaving?"
      eyebrow="Estimation configuration"
      description="This section has changes that have not been saved."
      role="alertdialog"
      busy={busy}
      onClose={onStay}
    >
      {error ? (
        <InlineMessage tone="error" role="alert">
          {error}
        </InlineMessage>
      ) : null}
      <div className="knowledge-dialog-actions">
        <Button variant="quiet" onClick={onStay} disabled={busy}>
          Stay here
        </Button>
        <Button variant="destructive-outline" onClick={onDiscard} disabled={busy}>
          Discard changes
        </Button>
        <Button
          onClick={onSave}
          busy={busy}
          busyLabel="Saving changes…"
        >
          Save changes
        </Button>
      </div>
    </Dialog>
  );
}
