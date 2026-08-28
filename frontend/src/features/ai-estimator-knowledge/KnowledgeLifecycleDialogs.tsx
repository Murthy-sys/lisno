import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { KnowledgeCompletenessFinding } from "./knowledgeTypes";

export type KnowledgeLifecycleAction = "activate" | "deactivate" | "archive";

const lifecycleCopy = {
  activate: {
    title: "Activate this revision?",
    description:
      "The active revision will become available to the AI knowledge context service.",
    confirm: "Activate revision"
  },
  deactivate: {
    title: "Deactivate this item?",
    description:
      "The item will no longer resolve through the AI knowledge context service.",
    confirm: "Deactivate item"
  },
  archive: {
    title: "Archive this configuration?",
    description:
      "Archived configuration remains in history and cannot be selected for new use.",
    confirm: "Archive configuration"
  }
} as const;

export interface KnowledgeLifecycleDialogProps {
  readonly action: KnowledgeLifecycleAction;
  readonly blockers?: readonly KnowledgeCompletenessFinding[];
  readonly warnings?: readonly KnowledgeCompletenessFinding[];
  readonly reason?: string;
  readonly onReasonChange?: (reason: string) => void;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly busy?: boolean;
  readonly error?: string | null;
}

export function KnowledgeLifecycleDialog({
  action,
  blockers = [],
  warnings = [],
  reason = "",
  onReasonChange,
  onConfirm,
  onClose,
  busy = false,
  error
}: KnowledgeLifecycleDialogProps) {
  const copy = lifecycleCopy[action];
  const blocked = blockers.length > 0;
  const requiresReason = action !== "activate";

  return (
    <Dialog
      title={copy.title}
      eyebrow="Estimation configuration"
      description={copy.description}
      role="alertdialog"
      busy={busy}
      onClose={onClose}
    >
      {blockers.length ? (
        <InlineMessage tone="error" title="Activation is blocked" role="alert">
          <ul>
            {blockers.map((blocker) => (
              <li key={`${blocker.code}-${blocker.sectionKey ?? "item"}`}>
                {blocker.message}
              </li>
            ))}
          </ul>
        </InlineMessage>
      ) : null}
      {warnings.length ? (
        <InlineMessage tone="warning" title="Review these warnings">
          <ul>
            {warnings.map((warning) => (
              <li key={`${warning.code}-${warning.sectionKey ?? "item"}`}>
                {warning.message}
              </li>
            ))}
          </ul>
        </InlineMessage>
      ) : null}
      {error ? (
        <InlineMessage tone="error" role="alert">
          {error}
        </InlineMessage>
      ) : null}
      {requiresReason ? (
        <label className="knowledge-dialog-reason">
          <span>Reason</span>
          <textarea
            className="ui-control ui-textarea"
            value={reason}
            required
            onChange={(event) => onReasonChange?.(event.target.value)}
          />
        </label>
      ) : null}
      <div className="knowledge-dialog-actions">
        <Button variant="quiet" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant={action === "activate" ? "success" : "destructive"}
          onClick={onConfirm}
          busy={busy}
          disabled={blocked || (requiresReason && reason.trim().length === 0)}
        >
          {copy.confirm}
        </Button>
      </div>
    </Dialog>
  );
}
