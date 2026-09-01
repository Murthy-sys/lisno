import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { InlineMessage } from "../../components/ui/InlineMessage";

export interface KnowledgeVersionConflictDialogProps {
  readonly sectionLabel?: string;
  readonly localVersion: number;
  readonly serverVersion: number;
  readonly onReviewServerVersion: () => void;
  readonly onDiscardLocalChanges: () => void;
  readonly onKeepEditing: () => void;
  readonly busy?: boolean;
}

export function KnowledgeVersionConflictDialog({
  sectionLabel,
  localVersion,
  serverVersion,
  onReviewServerVersion,
  onDiscardLocalChanges,
  onKeepEditing,
  busy = false
}: KnowledgeVersionConflictDialogProps) {
  return (
    <Dialog
      title="This section changed elsewhere"
      eyebrow="Estimation configuration"
      description="Your local changes are still available and were not submitted again."
      role="alertdialog"
      busy={busy}
      onClose={onKeepEditing}
    >
      <div className="knowledge-dialog-body">
        <InlineMessage tone="warning" title="Version conflict">
          {sectionLabel ? <><strong>{sectionLabel}</strong>: </> : null}
          You edited version {localVersion}, while the server now has version {serverVersion}.
          Review both versions before deciding what to keep.
        </InlineMessage>
      </div>
      <div className="knowledge-dialog-actions knowledge-dialog-actions--triple">
        <Button variant="quiet" onClick={onKeepEditing} disabled={busy}>
          Keep editing
        </Button>
        <Button
          variant="destructive-outline"
          onClick={onDiscardLocalChanges}
          disabled={busy}
        >
          Discard local changes
        </Button>
        <Button
          variant="secondary"
          onClick={onReviewServerVersion}
          busy={busy}
          busyLabel="Loading server version…"
        >
          Review server version
        </Button>
      </div>
    </Dialog>
  );
}
