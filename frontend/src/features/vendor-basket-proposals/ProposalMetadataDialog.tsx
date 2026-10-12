import { useId, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { ProposalPresentationIcon } from "./ProposalPresentationIcon";
import type { ProposalMetadata } from "./proposalTypes";

export function ProposalMetadataDialog({ title, initial, busy, blocked = false, showDescription = true, showOrder = true, defaultOrder = 0, error, onClose, onSave }: {
  title: string; initial?: ProposalMetadata; busy: boolean; blocked?: boolean; showDescription?: boolean; showOrder?: boolean; defaultOrder?: number; error: string;
  onClose: () => void; onSave: (value: ProposalMetadata) => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [order, setOrder] = useState(String(initial?.displayOrder ?? defaultOrder));
  function submit(event: FormEvent) {
    event.preventDefault(); event.stopPropagation();
    if (!busy && !blocked && name.trim() && Number.isInteger(Number(order)) && Number(order) >= 0) onSave({ name: name.normalize("NFKC").trim().replace(/\s+/gu, " "), description: showDescription ? description.trim() || null : initial?.description ?? null, displayOrder: Number(order) });
  }
  return <Dialog title={title} className="basket-proposal__metadata" icon={<ProposalPresentationIcon name="basket" />} eyebrow="Basket configuration" busy={busy} onClose={onClose}>
    <form onSubmit={submit} className="ui-dialog__form basket-proposal__form">
      <div className="ui-dialog__body">
        <Field id={`${id}-name`} label="Name" required>{props => <Input {...props} maxLength={240} value={name} disabled={busy} onChange={event => setName(event.target.value)} />}</Field>
        {showDescription ? <Field id={`${id}-description`} label="Description">{props => <Textarea {...props} maxLength={2000} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} />}</Field> : null}
        {showOrder ? <Field id={`${id}-order`} label="Display order">{props => <Input {...props} type="number" min={0} step={1} value={order} disabled={busy} onChange={event => setOrder(event.target.value)} />}</Field> : null}
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      </div>
      <div className="ui-dialog__actions basket-proposal__actions"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={blocked || !name.trim() || !order || !Number.isInteger(Number(order)) || Number(order) < 0}>Save</Button></div>
    </form>
  </Dialog>;
}
