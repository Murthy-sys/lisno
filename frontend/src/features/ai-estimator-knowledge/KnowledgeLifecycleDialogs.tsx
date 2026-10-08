import { useId, type ReactNode, type RefObject } from "react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
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
  /*
   * This one really does destroy something, so the description says exactly
   * what goes and what does not: the revisions leave with the Main Line, the
   * audit trail does not, and adding it back is a fresh start rather than a
   * restore.
   */
  archive: {
    title: "Delete this Main Line?",
    description:
      "This permanently deletes the Main Line and every revision, section and price version it owns. Exclusions and dependencies elsewhere that point at it are removed. A Super Admin can add it again afterwards, but nothing is restored with it.",
    confirm: "Delete permanently"
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
  readonly confirmDisabled?: boolean;
  readonly reasonDisabled?: boolean;
  readonly content?: ReactNode;
  readonly actions?: ReactNode;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly fallbackFocusRef?: RefObject<HTMLElement | null>;
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
  error,
  confirmDisabled = false,
  reasonDisabled = false,
  content,
  actions,
  returnFocusRef,
  fallbackFocusRef
}: KnowledgeLifecycleDialogProps) {
  const reasonId = useId().replace(/:/gu, "");
  const copy = lifecycleCopy[action];
  const blocked = blockers.length > 0;
  const requiresReason = action !== "activate";
  const hasBody =
    blockers.length > 0 || warnings.length > 0 || Boolean(error) || requiresReason || Boolean(content);

  return (
    <Dialog
      title={copy.title}
      eyebrow="Estimation configuration"
      description={copy.description}
      role="alertdialog"
      busy={busy}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      fallbackFocusRef={fallbackFocusRef}
    >
      {hasBody ? (
        <div className="knowledge-dialog-body">
          {content}
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
            <Field
              id={`${reasonId}-reason`}
              label="Reason"
              required
              hint="Recorded on the audit trail for this configuration change."
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  value={reason}
                  disabled={reasonDisabled}
                  onChange={(event) => onReasonChange?.(event.target.value)}
                />
              )}
            </Field>
          ) : null}
        </div>
      ) : null}
      <div className="knowledge-dialog-actions">
        {actions ?? <><Button variant="destructive-outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant={action === "activate" ? "success" : "destructive"}
          onClick={onConfirm}
          busy={busy}
          disabled={confirmDisabled || blocked || (requiresReason && reason.trim().length === 0)}
        >
          {copy.confirm}
        </Button></>}
      </div>
    </Dialog>
  );
}
