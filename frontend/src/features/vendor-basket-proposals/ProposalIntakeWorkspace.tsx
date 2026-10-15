import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { procurementRequestKey } from "../procurement/procurementPresentation";
import { vendorBasketRequestKeys } from "../procurement/vendorBasketRequestApi";
import { decideProposal, getProposal, proposalKeys, reviseProposal, saveProposalIntake, submitProposal } from "./proposalApi";
import { intakeErrors, normalizedIntake, ProposalIntakeFields } from "./ProposalIntakeFields";
import { proposalDenied, proposalError, proposalStatusLabel, proposalUncertain } from "./proposalPresentation";
import type { ProposalDecisionInput, ProposalDecisionResult, ProposalDetail, ProposalIntakeContent, ProposalIntakeInput, ProposalScope, ProposalSnapshot, ProposalSubmitInput } from "./proposalTypes";
import type { ProposalWorkspaceProps } from "./ProposalWorkspace";
import "./proposal-intake.css";

type IntakeProps = ProposalWorkspaceProps & { initialNotice?: string; onCatalogChanged?: () => void };
type Command = {
  kind: "save" | "submit" | "approve" | "reject" | "revise";
  basis: ProposalDetail; save?: ProposalIntakeInput; saved?: ProposalDetail;
  uncertainSave?: boolean;
  idempotencyKey: string; reason?: string; input?: ProposalSubmitInput | ProposalDecisionInput;
};

function sameIntake(expected: ProposalIntakeContent | undefined, actual: ProposalIntakeContent | undefined, previousIds?: Set<string>) {
  if (!expected || !actual || Boolean(expected.basket) !== Boolean(actual.basket)) return false;
  const left = normalizedIntake(expected);
  const right = normalizedIntake(actual);
  if (left.basket?.name !== right.basket?.name || left.basket?.description !== right.basket?.description
    || left.subBasket.name !== right.subBasket.name || left.subBasket.description !== right.subBasket.description
    || left.mainLines.length !== right.mainLines.length) return false;
  const seenIds = new Set<string>();
  return left.mainLines.every((line, index) => {
    const savedLine = right.mainLines[index];
    if (line.name !== savedLine.name || !savedLine.resourceId || seenIds.has(savedLine.resourceId)) return false;
    seenIds.add(savedLine.resourceId);
    return line.resourceId ? line.resourceId === savedLine.resourceId : Boolean(previousIds && !previousIds.has(savedLine.resourceId));
  });
}

/** Resolve only this save's immediate, exact content transition; later or differing writes require review. */
function reconcileUncertainSave(current: Command, latest: ProposalDetail, scope: ProposalScope): "saved" | "unchanged" | "conflict" {
  const basis = current.basis;
  const oldTarget = basis.target ?? { kind: "new_main_basket" };
  const newTarget = latest.target ?? { kind: "new_main_basket" };
  const contextMatches = latest.id === basis.id && latest.requesterId === basis.requesterId
    && latest.requestId === basis.requestId && latest.basketId === basis.basketId && latest.status === basis.status
    && latest.requestMode === "hierarchy_intake" && latest.requestMode === basis.requestMode
    && oldTarget.kind === newTarget.kind
    && (oldTarget.kind !== "new_sub_basket" || (newTarget.kind === "new_sub_basket" && oldTarget.basketId === newTarget.basketId))
    && latest.head.id === basis.head.id;
  if (!contextMatches) return "conflict";
  if (latest.version === basis.version && latest.requestVersion === basis.requestVersion
    && latest.head.version === basis.head.version && latest.head.digest === basis.head.digest
    && sameIntake(basis.intake, latest.intake)) return "unchanged";
  const expectedRequestVersion = scope === "admin" && basis.requestVersion !== null ? basis.requestVersion + 1 : basis.requestVersion;
  const previousIds = new Set(basis.intake?.mainLines.flatMap(line => line.resourceId ? [line.resourceId] : []) ?? []);
  return latest.version === basis.version + 1 && latest.requestVersion === expectedRequestVersion
    && latest.head.version === basis.head.version + 1 && Boolean(latest.head.digest) && latest.head.digest !== basis.head.digest
    && sameIntake(current.save?.intake, latest.intake, previousIds) ? "saved" : "conflict";
}

export function ProposalIntakeWorkspace(props: IntakeProps) {
  const auth = useAuth();
  const scope = props.scope ?? "procurement";
  const allowed = scope === "admin"
    ? auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.read")
    : auth.user?.role === "procurement" && hasFrontendPermission(auth.authorization, "procurement.vendor_basket_proposal.read");
  if (!allowed || !auth.user) return <ContextPanel title="Basket request" onClose={props.onClose}><PageState state="error" message="You do not have permission to view this basket request." /></ContextPanel>;
  return <IntakeSession key={`${auth.user.id}:${scope}:${props.proposalId}`} {...props} scope={scope} actorId={auth.user.id} />;
}

function IntakeSession({ proposalId: initialId, scope, actorId, onClose, onSubmitted, onDecision, onBusyChange, onDirtyChange, onCatalogChanged, initialNotice }: IntakeProps & { scope: ProposalScope; actorId: string }) {
  const auth = useAuth();
  const client = useQueryClient();
  const [proposalId, setProposalId] = useState(initialId);
  const [snapshot, setSnapshot] = useState<ProposalSnapshot>("current");
  const [draft, setDraft] = useState<ProposalIntakeContent | null>(null);
  const [basis, setBasis] = useState<ProposalDetail | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [denied, setDenied] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [sendBack, setSendBack] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [terminal, setTerminal] = useState<ProposalDecisionResult | null>(null);
  const command = useRef<Command | null>(null);
  const active = useRef(true);
  const form = useRef<HTMLFormElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const query = useQuery({ queryKey: proposalKeys.detail(actorId, scope, proposalId, snapshot), queryFn: ({ signal }) => getProposal(scope, proposalId, snapshot, signal), enabled: !denied, gcTime: 0, refetchOnWindowFocus: true });
  const detail = query.data;
  const dirty = draft !== null;
  const stale = conflict || Boolean(basis && detail && (basis.version !== detail.version || basis.requestVersion !== detail.requestVersion));
  const updateAllowed = hasFrontendPermission(auth.authorization, scope === "admin" ? "ai_estimator_knowledge.configuration.update" : "procurement.vendor_basket_proposal.update");
  const submitAllowed = hasFrontendPermission(auth.authorization, scope === "admin" ? "ai_estimator_knowledge.configuration.lifecycle" : "procurement.vendor_basket_proposal.submit");
  const reviseAllowed = hasFrontendPermission(auth.authorization, "procurement.vendor_basket_proposal.create");
  const editing = Boolean(detail?.capabilities.edit && updateAllowed && snapshot === "current" && !terminal && !denied);

  function refreshLists() {
    void client.invalidateQueries({ queryKey: proposalKeys.mine(actorId) });
    void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.mine });
    void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.review });
  }
  function applySaved(value: ProposalDetail) {
    client.setQueryData(proposalKeys.detail(actorId, scope, value.id), value);
    setDraft(null); setBasis(null); setErrors({}); refreshLists();
  }
  const action = useMutation({ mutationFn: async () => {
    const current = command.current;
    if (!current) throw new Error("Reload the saved request before continuing.");
    if (current.save && !current.saved) {
      if (current.uncertainSave) {
        const latest = await getProposal(scope, proposalId);
        const resolution = reconcileUncertainSave(current, latest, scope);
        if (resolution === "conflict") throw new ApiError(409, "VERSION_CONFLICT", "The saved request differs from this action. Your entries are preserved. Reload and review it before continuing.");
        if (resolution === "saved") current.saved = latest;
      }
      if (!active.current || command.current !== current) throw new Error("This request session has ended.");
      if (!current.saved) {
        try {
          current.saved = await saveProposalIntake(scope, proposalId, current.save);
          current.uncertainSave = false;
        } catch (error) {
          current.uncertainSave = proposalUncertain(error);
          throw error;
        }
      }
    }
    const saved = current.saved ?? current.basis;
    if (current.kind === "save") return { kind: "save", detail: saved } as const;
    if (!current.input) current.input = {
      expectedVersion: saved.version,
      ...(saved.requestVersion !== null ? { expectedRequestVersion: saved.requestVersion } : {}),
      idempotencyKey: current.idempotencyKey,
      ...(current.kind === "approve" || current.kind === "reject" ? { decision: current.kind === "approve" ? "approve" as const : "reject" as const, reason: current.reason ?? null } : {})
    };
    if (current.kind === "approve" || current.kind === "reject") return { kind: "decision", result: await decideProposal(proposalId, current.input as ProposalDecisionInput) } as const;
    return { kind: current.kind, detail: await (current.kind === "submit" ? submitProposal : reviseProposal)(proposalId, current.input) } as const;
  }, onSuccess: result => {
    if (!active.current) return;
    command.current = null; setConflict(false); setSendBack(false); setReason("");
    if (result.kind === "decision") {
      setTerminal(result.result); setDraft(null); setBasis(null);
      setNotice(result.result.status === "fulfilled" ? "Request approved. Main Lines were created as drafts for Super Admin to configure." : "Request sent back. The requester can edit and resubmit a new draft.");
      void client.invalidateQueries({ queryKey: proposalKeys.proposal(actorId, scope, proposalId) });
      void client.invalidateQueries({ queryKey: ["ai-estimator-knowledge"] });
      onCatalogChanged?.(); onDecision?.(result.result); refreshLists();
    } else {
      applySaved(result.detail);
      if (result.kind === "submit") { onSubmitted?.(result.detail); onClose(); }
      else if (result.kind === "revise") { setProposalId(result.detail.id); setSnapshot("current"); setNotice("A new draft was created. The original submission and send-back reason remain in history."); }
      else setNotice(scope === "admin" ? "Review changes saved." : "Draft saved. Reopen it from My Requests at any time.");
    }
  }, onError: error => {
    if (!active.current) return;
    if (proposalDenied(error)) { setDenied(true); setDraft(null); setBasis(null); }
    if (!proposalUncertain(error)) {
      if (command.current?.saved) applySaved(command.current.saved);
      command.current = null;
    }
    if (error instanceof ApiError && error.status === 409) setConflict(true);
  } });
  const busy = action.isPending;
  const frozen = busy || Boolean(command.current) || stale || query.isError;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { active.current = true; return () => { active.current = false; void client.cancelQueries({ queryKey: proposalKeys.actor(actorId) }); client.removeQueries({ queryKey: proposalKeys.actor(actorId) }); }; }, [client, actorId]);
  useEffect(() => { if (proposalDenied(query.error)) setDenied(true); }, [query.error]);
  useEffect(() => { if (Object.keys(errors).length) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [errors]);

  function run(kind: Command["kind"]) {
    if (!detail || busy || command.current || stale || query.isError || snapshot !== "current") return;
    if (kind === "save" ? !editing : kind === "revise" ? !reviseAllowed : !submitAllowed) return;
    if ((kind === "approve" || kind === "reject") && !detail.capabilities.decide) return;
    if (kind === "submit" && !detail.capabilities.submit) return;
    if (kind === "revise" && !detail.capabilities.revise) return;
    const value = draft ?? detail.intake;
    if (!value) return;
    if (kind !== "reject" && kind !== "revise") {
      const validation = intakeErrors(value, kind === "submit" || kind === "approve");
      setErrors(validation); if (Object.keys(validation).length) return;
    }
    if (kind === "reject" && !reason.trim()) { setReasonError("Enter a reason so the requester can correct this request."); reasonInput.current?.focus(); return; }
    const saved = basis ?? detail;
    command.current = {
      kind, basis: saved, idempotencyKey: procurementRequestKey(), ...(kind === "reject" ? { reason: reason.trim() } : {}),
      ...(dirty && kind !== "reject" && kind !== "revise" ? { save: { expectedVersion: saved.version, ...(scope === "admin" && saved.requestVersion !== null ? { expectedRequestVersion: saved.requestVersion } : {}), intake: normalizedIntake(value) } } : {})
    };
    setNotice(""); action.mutate();
  }
  async function reload() {
    setReloadConfirm(false); command.current = null; action.reset(); setDraft(null); setBasis(null); setErrors({});
    const latest = await query.refetch(); if (!latest.isError) setConflict(false);
  }

  const content = draft ?? detail?.intake;
  const currentStatus = terminal?.status ?? detail?.status;
  return <ContextPanel title={scope === "admin" ? "Review basket request" : "Basket request"} className="proposal-intake" eyebrow={scope === "admin" ? "Super Admin" : "Procurement"} width="wide" onClose={onClose} busy={busy} dirty={dirty || Boolean(reason.trim())}>
    <div className="proposal-intake__content">
      {denied ? <PageState state="error" message="This basket request is no longer available to your account." /> : query.isPending ? <PageState state="loading" message="Loading basket request…" /> : !detail ? <PageState state="error" message={proposalError(query.error)} action={{ label: "Retry request", onAction: () => void query.refetch() }} /> : detail.requestMode !== "hierarchy_intake" || !content ? <PageState state="error" message="The request details are unavailable. Close this panel and reopen the request from My Requests." /> : <>
        <div className="proposal-intake__toolbar"><strong>{currentStatus ? proposalStatusLabel(currentStatus, detail.requestMode) : ""}</strong><Button variant="quiet" disabled={busy} onClick={() => dirty || command.current ? setReloadConfirm(true) : void reload()}>Reload saved request</Button></div>
        {notice ? <p role="status" className="proposal-intake__notice">{notice}</p> : null}
        {detail.reason ? <InlineMessage tone="warning">Send-back reason: {detail.reason}</InlineMessage> : null}
        {detail.revisedFromId ? <p>This draft is linked to the earlier submitted request.</p> : null}
        {currentStatus === "pending" && scope === "procurement" ? <p>Your submitted request is read-only while Super Admin reviews a separate copy.</p> : null}
        {scope === "admin" && currentStatus === "pending" ? <p>Review the names and descriptions. Submit approves the hierarchy and creates draft Main Lines for later configuration.</p> : null}
        {query.isError ? <InlineMessage tone="error">{proposalError(query.error)} Your entries are preserved. Reload the saved request before continuing.</InlineMessage> : null}
        {action.isError ? <InlineMessage tone="error">{proposalError(action.error)}</InlineMessage> : null}
        {stale ? <InlineMessage tone="warning">This request changed. Your entries are preserved. Reload and review the saved request before continuing.</InlineMessage> : null}
        {command.current && action.isError ? <InlineMessage tone="warning" action={<Button disabled={busy} onClick={() => action.mutate()}>Retry same action</Button>}>The outcome is unknown. Retry the same action to confirm its result.</InlineMessage> : null}
        {detail.submittedHead ? <div className="proposal-intake__actions"><Button variant="quiet" disabled={busy || dirty || Boolean(command.current)} onClick={() => { setSnapshot(snapshot === "submitted" ? "current" : "submitted"); setErrors({}); }}> {snapshot === "submitted" ? "Return to current request" : "View original submission"}</Button>{detail.approvedHead ? <Button variant="quiet" disabled={busy || dirty || Boolean(command.current)} onClick={() => setSnapshot(snapshot === "approved" ? "current" : "approved")}>{snapshot === "approved" ? "Return to current request" : "View approved request"}</Button> : null}</div> : null}
        {snapshot !== "current" ? <p role="status">{snapshot === "submitted" ? "Original submission" : "Approved request"}. Read-only.</p> : null}
        <form ref={form} noValidate onSubmit={event => { event.preventDefault(); event.stopPropagation(); run(scope === "admin" ? "approve" : "submit"); }}>
          <ProposalIntakeFields value={content} parentName={detail.basket.payload.name} readOnly={!editing} disabled={frozen} errors={errors} onChange={value => { if (!basis) setBasis(detail); setDraft(value); setErrors({}); }} />
          {snapshot === "current" && !terminal ? <div className="proposal-intake__actions">
            {editing ? <Button variant="secondary" disabled={frozen || !dirty} onClick={() => run("save")}>{scope === "admin" ? "Save changes" : "Save draft"}</Button> : null}
            {detail.capabilities.submit && submitAllowed ? <Button type="submit" disabled={frozen}>Send to Super Admin</Button> : null}
            {detail.capabilities.decide && submitAllowed ? <><Button variant="secondary" disabled={frozen || dirty} onClick={() => { setSendBack(true); setReasonError(""); }}>Send back</Button><Button type="submit" disabled={frozen}>Submit</Button></> : null}
            {detail.capabilities.revise && reviseAllowed ? <Button disabled={frozen} onClick={() => run("revise")}>Edit and resubmit</Button> : null}
          </div> : null}
        </form>
      </>}
    </div>
    {sendBack ? <Dialog title="Send back request" onClose={() => { if (!busy && !command.current) setSendBack(false); }} busy={busy} initialFocusRef={reasonInput}>
      <div className="ui-dialog__body"><Field id="intake-return-reason" label="Send-back reason" required error={reasonError}>{props => <Textarea {...props} ref={reasonInput} maxLength={1000} disabled={busy || Boolean(command.current)} value={reason} onChange={event => { setReason(event.target.value); setReasonError(""); }} />}</Field>{action.isError ? <InlineMessage tone="error">{proposalError(action.error)}</InlineMessage> : null}</div>
      <div className="ui-dialog__actions"><Button variant="secondary" disabled={busy || Boolean(command.current)} onClick={() => setSendBack(false)}>Cancel</Button><Button busy={busy} disabled={stale || query.isError} onClick={() => command.current ? action.mutate() : run("reject")}>{command.current && action.isError ? "Retry same action" : "Send back request"}</Button></div>
    </Dialog> : null}
    {reloadConfirm ? <Dialog title="Reload saved request?" role="alertdialog" onClose={() => setReloadConfirm(false)} description="Your unsaved entries will be replaced by the saved request. Any completed action remains in its history."><div className="ui-dialog__actions"><Button variant="secondary" onClick={() => setReloadConfirm(false)}>Keep editing</Button><Button onClick={() => void reload()}>Discard and reload</Button></div></Dialog> : null}
  </ContextPanel>;
}
