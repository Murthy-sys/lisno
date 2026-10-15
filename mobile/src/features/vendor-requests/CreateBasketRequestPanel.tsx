import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthenticatedSession } from "../../contracts/session";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { createIdempotencyKey } from "../finance/money";
import { closeCatalogDraft } from "../knowledge/knowledgeCatalogForms";
import { Button, KnowledgeDetailProvider, KnowledgeModal, KnowledgeText } from "../knowledge/knowledgeDetailUi";
import { emptyIntake, intakeProblem, normalizeIntake, ProposalIntakeFields } from "./ProposalIntakeFields";
import { proposalDenied, proposalError, proposalUncertain, useProposalContext, type ProposalContext } from "./proposalRuntime";
import type { ProposalCreateInput, ProposalDetail, ProposalSubmitInput } from "./proposalTypes";

export interface CreateBasketRequestProps { session: AuthenticatedSession; parent?: { id: string; name: string }; vendorId?: string; activeBasketNames?: readonly string[]; onClose: () => void; onSaved: (proposal: ProposalDetail) => void }
export function CreateBasketRequestPanel(props: CreateBasketRequestProps) {
  const context = useProposalContext(props.session, "procurement");
  return <CreateBasketRequestForm key={`${context.scopeKey}:${props.parent?.id ?? "new"}`} {...props} context={context} />;
}
export function CreateBasketRequestForm({ context, parent, vendorId, activeBasketNames = [], onClose, onSaved }: Omit<CreateBasketRequestProps, "session"> & { context: ProposalContext }) {
  const [value, setValue] = useState(() => emptyIntake(Boolean(parent)));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [denied, setDenied] = useState(false);
  const command = useRef<{ input: ProposalCreateInput; send: boolean; created?: ProposalDetail; submission?: ProposalSubmitInput } | null>(null);
  const alive = useRef(true); const lock = useRef(false); const client = useQueryClient(); const navigation = useScaffoldNavigationGuard();
  const dirty = Boolean(value.basket?.name || value.basket?.description || value.subBasket.name || value.subBasket.description || value.mainLines.some(line => line.name));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { navigation?.setBlocked(dirty || busy || Boolean(command.current)); return () => navigation?.setBlocked(false); }, [navigation, dirty, busy, error]);
  async function submit(send: boolean) {
    if (lock.current || !context.ready || !context.canCreate || denied || (send && !context.canSubmit)) return;
    if (!command.current) {
      const intake = normalizeIntake(value); const name = parent ? intake.subBasket.name : intake.basket!.name;
      const problem = intakeProblem(intake, send);
      if (problem) { setError(problem); return; }
      if (!parent && activeBasketNames.some(value => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase() === name.toLocaleLowerCase())) { setError("This Main Basket already exists. Select it in the vendor form."); return; }
      command.current = { send, input: { name, idempotencyKey: createIdempotencyKey(), vendorId: vendorId ?? null, requestMode: "hierarchy_intake", intake, ...(parent ? { target: { kind: "new_sub_basket", basketId: parent.id } } : {}) } };
    }
    const current = command.current; lock.current = true; setBusy(true); setError("");
    try {
      current.created ??= await context.api.createProposal(current.input);
      if (!alive.current) return;
      let result = current.created;
      if (current.send) { current.submission ??= { expectedVersion: result.version, idempotencyKey: createIdempotencyKey() }; result = await context.api.submitProposal(result.id, current.submission); }
      if (!alive.current) return;
      command.current = null; client.setQueryData(context.key("detail", result.id, "current"), result);
      void client.invalidateQueries({ queryKey: context.key("list") }); onSaved(result);
    } catch (cause) {
      if (!alive.current) return;
      setError(proposalError(cause));
      if (proposalDenied(cause)) setDenied(true);
      if (!proposalUncertain(cause)) {
        if (current.created && !proposalDenied(cause)) { command.current = null; onSaved(current.created); }
        else command.current = null;
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const blocked = busy || Boolean(command.current);
  return <KnowledgeDetailProvider><KnowledgeModal title={parent ? "Request Sub Basket" : "Request Main Basket"} busy={blocked} onClose={() => closeCatalogDraft(dirty, onClose)}>
    {!context.canCreate || denied ? <KnowledgeText error>Your current access does not allow basket requests.</KnowledgeText> : <>
      <ProposalIntakeFields value={value} {...(parent ? { parentName: parent.name } : {})} disabled={blocked} onChange={next => { setValue(next); setError(""); }} />
      {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
      {command.current ? <><KnowledgeText>The outcome is unconfirmed. Retry the same action before leaving.</KnowledgeText><Button label="Retry same action" loading={busy} onPress={() => void submit(command.current!.send)} /></> : <><Button label="Save draft" variant="secondary" loading={busy} onPress={() => void submit(false)} />{context.canSubmit ? <Button label="Send to Super Admin" loading={busy} onPress={() => void submit(true)} /> : null}</>}
    </>}
  </KnowledgeModal></KnowledgeDetailProvider>;
}
