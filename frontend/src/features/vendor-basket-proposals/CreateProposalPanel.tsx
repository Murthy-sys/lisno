import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { createProposal, proposalKeys, submitProposal } from "./proposalApi";
import { ProposalIntakeWorkspace } from "./ProposalIntakeWorkspace";
import { emptyProposalIntake, intakeErrors, normalizedIntake, ProposalIntakeFields } from "./ProposalIntakeFields";
import { procurementRequestKey } from "../procurement/procurementPresentation";
import { vendorBasketRequestKeys } from "../procurement/vendorBasketRequestApi";
import { proposalDenied, proposalError, proposalUncertain } from "./proposalPresentation";
import type { ProposalCreateInput, ProposalDetail, ProposalSubmitInput } from "./proposalTypes";
import "./proposal-intake.css";

type Props = {
  vendorId?: string | null; activeBasketNames: readonly string[];
  parentBasket?: { id: string; name: string };
  onClose: () => void; onBusyChange: (busy: boolean) => void;
  onSubmitted?: (proposal: ProposalDetail) => void;
};

export function CreateProposalPanel(props: Props) {
  const auth = useAuth();
  return <CreateIntakeSession key={`${auth.user?.id ?? "anonymous"}:${props.parentBasket?.id ?? "new"}`} {...props} />;
}

function CreateIntakeSession({ vendorId, activeBasketNames, parentBasket, onClose, onBusyChange, onSubmitted }: Props) {
  const auth = useAuth();
  const client = useQueryClient();
  const [value, setValue] = useState(() => emptyProposalIntake(Boolean(parentBasket)));
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState("");
  const [initialNotice, setInitialNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const active = useRef(true);
  const form = useRef<HTMLFormElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const command = useRef<{ input: ProposalCreateInput; send: boolean; created?: ProposalDetail; submission?: ProposalSubmitInput } | null>(null);
  const allowed = !denied && auth.user?.role === "procurement" && hasFrontendPermission(auth.authorization, "procurement.vendor_basket_proposal.create");
  const canSubmit = hasFrontendPermission(auth.authorization, "procurement.vendor_basket_proposal.submit");
  const create = useMutation({ mutationFn: async () => {
    const current = command.current!;
    if (!current.created) current.created = await createProposal(current.input);
    if (!current.send) return current.created;
    current.submission ??= { expectedVersion: current.created.version, idempotencyKey: procurementRequestKey() };
    return submitProposal(current.created.id, current.submission);
  }, onSuccess: result => {
    if (!active.current) return;
    const sent = command.current?.send;
    command.current = null;
    client.setQueryData(proposalKeys.detail(auth.user!.id, "procurement", result.id), result);
    void client.invalidateQueries({ queryKey: proposalKeys.mine(auth.user!.id) });
    void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.mine });
    void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.review });
    if (sent) { onSubmitted?.(result); onClose(); }
    else setProposalId(result.id);
  }, onError: error => {
    if (!active.current) return;
    if (proposalDenied(error)) setDenied(true);
    if (!proposalUncertain(error)) {
      if (command.current?.created && !proposalDenied(error)) {
        const created = command.current.created;
        client.setQueryData(proposalKeys.detail(auth.user!.id, "procurement", created.id), created);
        void client.invalidateQueries({ queryKey: proposalKeys.mine(auth.user!.id) });
        setInitialNotice(`Draft saved. ${proposalError(error)}`); setProposalId(created.id);
      }
      command.current = null;
    }
  } });
  useEffect(() => { onBusyChange(create.isPending); return () => onBusyChange(false); }, [create.isPending, onBusyChange]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (Object.keys(errors).length) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [errors]);
  function submit(send: boolean) {
    if (create.isPending || !allowed || (send && !canSubmit)) return;
    if (!command.current) {
      const intake = normalizedIntake(value);
      const name = parentBasket ? intake.subBasket.name : intake.basket!.name;
      if (!parentBasket && activeBasketNames.some(current => current.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"))) {
        setValidation("This Main Basket already exists. Select it in the vendor form."); nameInput.current?.focus(); return;
      }
      const validationErrors = intakeErrors(intake, send);
      setErrors(validationErrors); setValidation("");
      if (Object.keys(validationErrors).length) return;
      command.current = { input: { vendorId: vendorId ?? null, name, requestMode: "hierarchy_intake", intake, idempotencyKey: procurementRequestKey(), ...(parentBasket ? { target: { kind: "new_sub_basket", basketId: parentBasket.id } as const } : {}) }, send };
    }
    create.mutate();
  }
  if (proposalId && allowed) return <ProposalIntakeWorkspace proposalId={proposalId} initialNotice={initialNotice} onClose={onClose} onBusyChange={onBusyChange} onSubmitted={onSubmitted} />;
  const dirty = Boolean(value.basket?.name || value.basket?.description || value.subBasket.name || value.subBasket.description || value.mainLines.some(line => line.name));
  return <ContextPanel title={parentBasket ? "Request Sub Basket" : "Request Main Basket"} className="proposal-intake" eyebrow="Procurement" description="Describe the basket and list its Main Lines. Super Admin reviews the request and configures the approved Main Lines." width="wide" initialFocusRef={nameInput} onClose={onClose} busy={create.isPending} dirty={dirty}>
    <div className="proposal-intake__content">{!allowed ? <InlineMessage tone="error">You do not have permission to create basket requests.</InlineMessage> : <form ref={form} noValidate onSubmit={event => { event.preventDefault(); event.stopPropagation(); submit(true); }}>
      <ProposalIntakeFields value={value} parentName={parentBasket?.name} firstInputRef={nameInput} disabled={create.isPending || Boolean(command.current)} errors={errors} onChange={next => { setValue(next); setErrors({}); setValidation(""); }} />
      {validation ? <InlineMessage tone="error">{validation}</InlineMessage> : null}
      {create.isError ? <InlineMessage tone="error">{proposalError(create.error)} {command.current ? "Your entries are preserved. Retry the same action to confirm its saved result." : ""}</InlineMessage> : null}
      <div className="proposal-intake__actions">{command.current && create.isError ? <Button busy={create.isPending} onClick={() => submit(command.current!.send)}>Retry same action</Button> : <><Button variant="secondary" disabled={create.isPending} onClick={() => submit(false)}>Save draft</Button>{canSubmit ? <Button type="submit" busy={create.isPending}>Send to Super Admin</Button> : null}</>}</div>
    </form>}</div>
  </ContextPanel>;
}
