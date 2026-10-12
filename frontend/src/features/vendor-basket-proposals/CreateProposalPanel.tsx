import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { createProposal, proposalKeys } from "./proposalApi";
import { ProposalWorkspace } from "./ProposalWorkspace";
import { procurementRequestKey } from "../procurement/procurementPresentation";
import { proposalDenied, proposalError, proposalUncertain } from "./proposalPresentation";
import type { ProposalCreateInput, ProposalDetail } from "./proposalTypes";
import "./proposal.css";
import "./procurement-main-basket.css";

export function CreateProposalPanel({ vendorId, activeBasketNames, parentBasket, onClose, onBusyChange, onSubmitted }: {
  vendorId?: string | null; activeBasketNames: readonly string[];
  parentBasket?: { id: string; name: string };
  onClose: () => void; onBusyChange: (busy: boolean) => void;
  onSubmitted?: (proposal: ProposalDetail) => void;
}) {
  const auth = useAuth();
  const client = useQueryClient();
  const id = useId();
  const entityName = parentBasket ? "Sub-Basket" : "Main Basket";
  const [name, setName] = useState("");
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [validation, setValidation] = useState("");
  const [denied, setDenied] = useState(false);
  const submitting = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const command = useRef<ProposalCreateInput | null>(null);
  const create = useMutation({ mutationFn: () => createProposal(command.current!), onSuccess: value => { command.current = null; client.setQueryData(proposalKeys.detail(auth.user!.id, "procurement", value.id), value); void client.invalidateQueries({ queryKey: proposalKeys.mine(auth.user!.id) }); setProposalId(value.id); }, onError: error => { if (proposalDenied(error)) setDenied(true); if (!proposalUncertain(error)) command.current = null; }, onSettled: () => { submitting.current = false; } });
  const allowed = !denied && auth.user?.role === "procurement" && hasFrontendPermission(auth.authorization, "procurement.vendor_basket_proposal.create");
  useEffect(() => { onBusyChange(create.isPending); return () => onBusyChange(false); }, [create.isPending, onBusyChange]);
  function submit(event: FormEvent) {
    event.preventDefault(); event.stopPropagation();
    if (create.isPending || submitting.current || !allowed) return;
    if (!command.current) {
      const normalized = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
      if (!normalized) { setValidation(`Enter a ${entityName} name.`); return; }
      if (!parentBasket && activeBasketNames.some(current => current.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US") === normalized.toLocaleLowerCase("en-US"))) { setValidation("This Main Basket already exists. Select it in the vendor form."); return; }
      command.current = { vendorId: vendorId ?? null, name: normalized, idempotencyKey: procurementRequestKey(), ...(parentBasket ? { target: { kind: "new_sub_basket", basketId: parentBasket.id } as const } : {}) };
    }
    setValidation(""); submitting.current = true; create.mutate();
  }
  if (proposalId && allowed) return <ProposalWorkspace proposalId={proposalId} onClose={onClose} onBusyChange={onBusyChange} onSubmitted={onSubmitted} />;
  return <ContextPanel title={`Configure ${entityName}`} className="basket-proposal knowledge-context-panel basket-proposal--procurement-reference basket-proposal--create" eyebrow="Procurement" description={parentBasket ? "Propose a Sub-Basket under the selected Main Basket. Main Lines are optional. Super Admin will review before adding it to Configuration." : "Create a saved draft, then configure its Sub-Baskets, Main Lines, modes, rates and shared quality checklist before requesting approval."} width="wide" initialFocusRef={nameInput} onClose={onClose} busy={create.isPending} dirty={Boolean(name)}>
    <div className="basket-proposal__content">{!allowed ? <InlineMessage tone="error">You do not have permission to create basket proposals.</InlineMessage> : <form onSubmit={submit} className="basket-proposal__form">
      {parentBasket ? <p className="basket-proposal__parent">Selected Main Basket: <strong>{parentBasket.name}</strong></p> : null}
      <Field id={`${id}-name`} label={`New ${entityName} name`} required error={create.error instanceof ApiError ? create.error.fields?.name : undefined}>{props => <Input {...props} ref={nameInput} disabled={create.isPending || Boolean(command.current)} maxLength={240} value={name} onChange={event => { setName(event.target.value); setValidation(""); }} />}</Field>
      {validation ? <InlineMessage tone="error">{validation}</InlineMessage> : null}
      {create.isError ? <InlineMessage tone="error">{proposalError(create.error)} {command.current ? "Retry the same draft creation to confirm its saved result." : ""}</InlineMessage> : null}
      <div className="basket-proposal__actions"><Button type="submit" busy={create.isPending} disabled={!name.trim()}>{command.current && create.isError ? "Retry draft creation" : "Create configuration draft"}</Button></div>
    </form>}</div>
  </ContextPanel>;
}
