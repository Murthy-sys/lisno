import { useId, useRef, useState, type FormEvent, type RefObject } from "react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";

interface KnowledgeCatalogRenameDialogProps {
  readonly kind: "sub_basket" | "sub_item" | "item";
  readonly currentName: string;
  readonly reviewedVersion?: number;
  readonly busy: boolean;
  readonly error?: string;
  readonly onRefresh?: () => void;
  readonly onClose: () => void;
  readonly onSave: (name: string) => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
}

export function KnowledgeCatalogRenameDialog({
  kind,
  currentName,
  reviewedVersion,
  busy,
  error,
  onRefresh,
  onClose,
  onSave,
  returnFocusRef,
  fallbackFocusRef
}: KnowledgeCatalogRenameDialogProps) {
  const inputId = useId().replace(/:/gu, "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);
  const label = kind === "sub_basket" ? "Sub-Basket name" : kind === "item" ? "Item name" : "Sub-item name";
  const title = kind === "sub_basket" ? "Edit Sub-Basket name" : `Edit ${currentName}`;
  const trimmed = name.trim();
  const unchanged = trimmed === currentName.trim();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && trimmed && !unchanged) onSave(trimmed);
  }

  return <Dialog
    title={title}
    eyebrow="Estimation configuration"
    description="This catalog change is saved immediately. Save Recommendation & Exclusions separately to keep changes to the scope rule."
    busy={busy}
    onClose={onClose}
    initialFocusRef={inputRef}
    returnFocusRef={returnFocusRef}
    fallbackFocusRef={fallbackFocusRef}
  >
    <form className="knowledge-dialog-body knowledge-draft-catalog-dialog" onSubmit={submit}>
      {reviewedVersion !== undefined ? <InlineMessage tone="info" role="status">Current saved name: “{currentName}” (version {reviewedVersion}). Your entered name is retained. Review it, then save when ready.</InlineMessage> : null}
      {error ? <InlineMessage tone="error" role="alert">
        {error}
        {onRefresh ? <Button type="button" variant="quiet" size="compact" onClick={onRefresh} disabled={busy}>Refresh catalog</Button> : null}
      </InlineMessage> : null}
      <Field id={`${inputId}-name`} label={label} required>
        {(control) => <Input {...control} ref={inputRef} value={name} maxLength={240} disabled={busy}
          onChange={(event) => setName(event.target.value)} />}
      </Field>
      <div className="knowledge-dialog-actions">
        <Button type="button" variant="destructive-outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" busy={busy} disabled={!trimmed || unchanged}>Save name</Button>
      </div>
    </form>
  </Dialog>;
}

interface KnowledgeSubItemRemovalDialogProps {
  readonly name: string;
  readonly lastChild: boolean;
  readonly context?: "whole_sub_basket" | "line_item";
  readonly busy: boolean;
  readonly error?: string;
  readonly onRefresh?: () => void;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
}

export function KnowledgeSubItemRemovalDialog({
  name,
  lastChild,
  context = "whole_sub_basket",
  busy,
  error,
  onRefresh,
  onClose,
  onConfirm,
  returnFocusRef,
  fallbackFocusRef
}: KnowledgeSubItemRemovalDialogProps) {
  return <Dialog
    title={`Remove ${name}?`}
    eyebrow="Estimation configuration"
    description="This permanently removes the real Draft Main Line from Configuration immediately. Save Recommendation & Exclusions remains a separate action."
    role="alertdialog"
    busy={busy}
    onClose={onClose}
    returnFocusRef={returnFocusRef}
    fallbackFocusRef={fallbackFocusRef}
  >
    <div className="knowledge-dialog-body knowledge-draft-catalog-dialog">
      {context === "line_item" ? <InlineMessage tone="warning">This rule will still reference the removed item, which becomes unavailable. Choose another item or remove the rule before saving Recommendation & Exclusions.</InlineMessage> : lastChild ? <InlineMessage tone="warning" title="This is the last sub-item">
        The Whole Sub-Basket will remain selected but empty. Add another sub-item or remove or retarget the rule before saving this section.
      </InlineMessage> : null}
      {error ? <InlineMessage tone="error" role="alert">
        {error}
        {onRefresh ? <Button type="button" variant="quiet" size="compact" onClick={onRefresh} disabled={busy}>Refresh catalog</Button> : null}
      </InlineMessage> : null}
      <div className="knowledge-dialog-actions">
        <Button type="button" variant="destructive-outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="button" variant="destructive" onClick={onConfirm} busy={busy}>Remove permanently</Button>
      </div>
    </div>
  </Dialog>;
}
