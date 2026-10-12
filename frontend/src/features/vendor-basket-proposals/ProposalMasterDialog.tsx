import { useId, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { ProposalPresentationIcon } from "./ProposalPresentationIcon";
import type { ProposalMasterKind, ProposalMasterValue } from "./proposalTypes";

export type ProposalMasterFields = Pick<ProposalMasterValue, "name" | "description" | "decimalScale">;

export function ProposalMasterDialog({ kind, initial, busy, blocked, error, onSave, onClose, onReconcile }: {
  kind: ProposalMasterKind; initial?: ProposalMasterValue; busy: boolean; blocked: boolean; error: string;
  onSave: (value: ProposalMasterFields) => void; onClose: () => void; onReconcile?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [decimalScale, setDecimalScale] = useState(initial?.decimalScale ?? 0);
  const [discard, setDiscard] = useState(false);
  const label = kind === "uoms" ? "UOM" : "Surface";
  const dirty = name !== (initial?.name ?? "") || description !== (initial?.description ?? "") || decimalScale !== (initial?.decimalScale ?? 0);
  const requestClose = () => { if (!busy) { if (dirty) setDiscard(true); else onClose(); } };
  function submit(event: FormEvent) {
    event.preventDefault(); event.stopPropagation();
    if (!busy && !blocked && name.trim()) onSave({ name: name.normalize("NFKC").trim().replace(/\s+/gu, " "), description: description.trim() || null, ...(kind === "uoms" ? { decimalScale } : {}) });
  }
  return <>
    <Dialog title={`${initial ? "Edit proposed" : "Add"} ${label}`} eyebrow="Basket proposal" className="basket-proposal__metadata" icon={<ProposalPresentationIcon name="basket" />} description="Added to this proposal only. It becomes shared after Super Admin approval." busy={busy} onClose={requestClose}>
      <form className="ui-dialog__form basket-proposal__form" onSubmit={submit}>
        <div className="ui-dialog__body">
          <Field id={`${id}-name`} label="Name" required>{props => <Input {...props} maxLength={240} value={name} disabled={busy} onChange={event => setName(event.target.value)} />}</Field>
          {kind === "uoms" ? <Field id={`${id}-precision`} label="Quantity decimal places" required>{props => <Select {...props} value={decimalScale} disabled={busy} onChange={event => setDecimalScale(Number(event.target.value))}>{[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}</option>)}</Select>}</Field> : null}
          <Field id={`${id}-description`} label="Description">{props => <Textarea {...props} maxLength={2000} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} />}</Field>
          {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
          {blocked ? <InlineMessage tone="warning">Your entries are preserved. Check the saved proposal before retrying.{onReconcile ? <Button variant="quiet" disabled={busy} onClick={onReconcile}>Check saved proposal</Button> : null}</InlineMessage> : null}
        </div>
        <div className="ui-dialog__actions basket-proposal__actions"><Button variant="secondary" disabled={busy} onClick={requestClose}>Cancel</Button><Button type="submit" busy={busy} disabled={blocked || !name.trim()}>Save {label}</Button></div>
      </form>
    </Dialog>
    {discard ? <Dialog title="Discard unsaved value?" description="Your changes to this value have not been saved." onClose={() => setDiscard(false)}><div className="ui-dialog__actions basket-proposal__actions"><Button variant="secondary" onClick={() => setDiscard(false)}>Keep editing</Button><Button onClick={onClose}>Discard changes</Button></div></Dialog> : null}
  </>;
}
