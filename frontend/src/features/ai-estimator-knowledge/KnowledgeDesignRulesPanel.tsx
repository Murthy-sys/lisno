import { useQuery, useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { DESIGN_RULE_HELP, DESIGN_RULE_KEYS, DESIGN_RULE_QUESTIONS, readDesignRules, type DesignRules, type DesignRuleKey } from "../../../../shared/knowledge/designRules";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { Surface } from "../../components/ui/Surface";
import { getKnowledgeItem, getKnowledgeSection, updateKnowledgeSection } from "./knowledgeApi";
import { commitKnowledgeSectionMutation, invalidateKnowledgeSectionMutation } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeItemDetail, KnowledgeMaster, KnowledgeSectionEnvelope, KnowledgeJsonObject } from "./knowledgeTypes";
import "./knowledge-design-rules.css";

export interface KnowledgeDesignRulesPanelHandle { save: () => Promise<boolean>; discard: () => boolean }
const publicDetails = new Set<DesignRuleKey>(["maintenanceAccess", "substrateFixing", "dimensionsClearances"]);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Base = { section: KnowledgeSectionEnvelope; rules: DesignRules };

export const KnowledgeDesignRulesPanel = forwardRef<KnowledgeDesignRulesPanelHandle, {
  item: KnowledgeItemDetail; revisionId: string; editable: boolean; blocked?: boolean;
  vendors: readonly KnowledgeMaster[]; vendorState: { status: "loading" | "error" | "ready"; refreshErrorMessage?: string; onRetry: () => void };
  onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void; onUnknownOutcomeChange: (unknown: boolean) => void;
}>(function KnowledgeDesignRulesPanel({ item, revisionId, editable, blocked, vendors, vendorState, onDirtyChange, onSavingChange, onUnknownOutcomeChange }, ref) {
  const client = useQueryClient(); const id = useId(); const lock = useRef(false);
  const [base, setBase] = useState<Base | null>(null); const [draft, setDraft] = useState<DesignRules | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false); const [unknownVersion, setUnknownVersion] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const query = useQuery({ queryKey: knowledgeQueryKeys.section(item.mainLineId, revisionId, "design"), queryFn: () => getKnowledgeSection(item.mainLineId, revisionId, "design") });
  const dirty = Boolean(draft && base && !equal(draft, base.rules));
  useEffect(() => { onDirtyChange(dirty || unknownVersion !== null); }, [dirty, unknownVersion, onDirtyChange]);
  useEffect(() => { onSavingChange(busy); }, [busy, onSavingChange]);
  useEffect(() => { onUnknownOutcomeChange(unknownVersion !== null); }, [unknownVersion, onUnknownOutcomeChange]);
  useEffect(() => {
    if (!query.data || dirty || busy || conflict || unknownVersion !== null) return;
    try { const rules = readDesignRules(query.data.payload); setBase({ section: query.data, rules }); setDraft(rules); setError(""); }
    catch (cause) { setError((cause as Error).message); }
  }, [query.data, dirty, busy, conflict, unknownVersion]);

  function change(next: DesignRules) { setDraft(next); setNotice(""); setError(""); }
  async function readCurrent(uncertain = unknownVersion) {
    const [section, currentItem] = await Promise.all([getKnowledgeSection(item.mainLineId, revisionId, "design"), getKnowledgeItem(item.mainLineId)]);
    const rules = readDesignRules(section.payload);
    if (currentItem.draftRevision?.id !== revisionId || section.version < (base?.section.version ?? 0)) throw new Error("The editable revision changed. Reload this workspace before continuing.");
    client.setQueryData(knowledgeQueryKeys.item(item.mainLineId), currentItem);
    client.setQueryData(knowledgeQueryKeys.section(item.mainLineId, revisionId, "design"), section);
    setBase({ section, rules }); setConflict(false);
    const settled = uncertain === null || section.version > uncertain;
    setUnknownVersion(settled ? null : uncertain); setConfirmation(!settled);
    return { section, rules, settled };
  }
  async function reload() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const result = await readCurrent(); setNotice(result.settled ? "Current saved rules loaded. Your changes are preserved; review them before saving." : "The earlier save is not confirmed. Confirm these rules to settle the pending change."); }
    catch (cause) { setError((cause as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  function validation(rules: DesignRules): string {
    if (rules.answers.vendorPreDiscussed && (!rules.discussedVendorId || !rules.details.vendorPreDiscussed?.trim())) return "Select the discussed vendor and enter discussion notes.";
    if (rules.answers.designerPoApproval && (!rules.poApprovalChecklist.length || rules.poApprovalChecklist.some((point) => !point.text.trim()))) return "Add at least one Designer PO approval checklist point and complete each point.";
    return "";
  }
  async function save(): Promise<boolean> {
    if (lock.current || !editable || blocked || !base || !draft || conflict || (unknownVersion !== null && !confirmation)) return false;
    if (!dirty && !confirmation) return true;
    const problem = validation(draft); if (problem) { setError(problem); return false; }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const currentItem = client.getQueryData<KnowledgeItemDetail>(knowledgeQueryKeys.item(item.mainLineId)) ?? item;
      const saved = await updateKnowledgeSection(item.mainLineId, revisionId, "design", { expectedVersion: base.section.version, expectedAggregateVersion: currentItem.version, applicability: "configured", payload: draft as unknown as KnowledgeJsonObject });
      const rules = readDesignRules(saved.payload); setBase({ section: saved, rules }); setDraft(rules); setUnknownVersion(null); setConfirmation(false);
      commitKnowledgeSectionMutation(client, saved); onDirtyChange(false); setNotice("Design rules saved.");
      try { await invalidateKnowledgeSectionMutation(client, item.mainLineId); }
      catch { setNotice("Design rules saved. Some views could not refresh; reload them to see the latest rules."); }
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) { setConflict(true); setError("This configuration changed elsewhere. Load its current rules before saving again."); }
      else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) setError(cause.message);
      else {
        const version = base.section.version; setUnknownVersion(version); setConfirmation(false); onDirtyChange(true);
        try { const current = await readCurrent(version); setNotice(current.settled ? "The current saved rules have been loaded. Your choices are preserved." : "Confirm your rules to settle the earlier save."); if (current.settled && equal(current.rules, draft)) return true; }
        catch { setError("The save response could not be verified. Load current rules before leaving."); }
      }
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  function discard(): boolean {
    if (lock.current || unknownVersion !== null) return false;
    if (base) setDraft(base.rules); setConflict(false); setError(""); onDirtyChange(false); return true;
  }
  useImperativeHandle(ref, () => ({ save, discard }));
  const disabled = !editable || blocked || busy || query.isError || (unknownVersion !== null && !confirmation);
  return <Surface as="section" className="knowledge-workspace-section knowledge-design-rules" aria-labelledby={`${id}-title`}>
    <div className="knowledge-section-heading"><div><h2 id={`${id}-title`}>Design requirements</h2><p>Set the approvals and checks required when this Main Line is included in a project.</p></div></div>
    {query.isPending ? <p role="status">Loading Design rules…</p> : null}
    {query.isError ? <InlineMessage tone="error" role="alert">Design rules could not be refreshed. <Button variant="secondary" onClick={() => void query.refetch()}>Retry rules</Button></InlineMessage> : null}
    {!editable ? <p role="status">Design rules are read-only. Create a Draft revision to edit them.</p> : null}
    {draft ? <>
      <fieldset className="design-rule-nature" disabled={disabled}><legend>Item nature</legend>{(["standard", "custom"] as const).map((nature) => <label key={nature}><input type="radio" name={`${id}-nature`} checked={draft.itemNature === nature} onChange={() => change({ ...draft, itemNature: nature, answers: { ...draft.answers, ...(nature === "custom" ? { designerVendorSelection: true } : {}) } })} />{nature === "standard" ? "Standard" : "Custom"}</label>)}</fieldset>
      <div className="design-rule-list">{DESIGN_RULE_KEYS.map((key, index) => <section className="design-rule" key={key}>
        <fieldset disabled={disabled} aria-describedby={`${id}-${key}-help`}><legend><span className="design-rule-number">{index + 1}.</span> {DESIGN_RULE_QUESTIONS[key]}</legend><div className="design-rule-options">{([true, false] as const).map((answer) => <label key={String(answer)}><input type="radio" name={`${id}-${key}`} checked={draft.answers[key] === answer} onChange={() => change({ ...draft, answers: { ...draft.answers, [key]: answer } })} />{answer ? "Yes" : "No"}</label>)}</div></fieldset>
        <p id={`${id}-${key}-help`}>{DESIGN_RULE_HELP[key]}</p>
        {draft.answers[key] ? <div className="design-rule-details">
          {key === "vendorPreDiscussed" ? <><Field id={`${id}-vendor`} label="Discussed vendor" required>{(props) => <Select {...props} value={draft.discussedVendorId ?? ""} disabled={disabled || vendorState.status !== "ready" || Boolean(vendorState.refreshErrorMessage)} onChange={(event) => change({ ...draft, discussedVendorId: event.target.value || null })}><option value="">Select vendor</option>{draft.discussedVendorId && !vendors.some((v) => v.id === draft.discussedVendorId) ? <option value={draft.discussedVendorId}>Unavailable saved vendor</option> : null}{vendors.filter((v) => v.status === "active" || v.id === draft.discussedVendorId).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select>}</Field>{vendorState.status !== "ready" || vendorState.refreshErrorMessage ? <p role="status">{vendorState.status === "loading" ? "Loading vendors…" : "Vendor choices could not be refreshed."} {vendorState.status !== "loading" ? <Button variant="quiet" onClick={vendorState.onRetry}>Retry vendors</Button> : null}</p> : null}</> : null}
          <Field id={`${id}-${key}-details`} label={key === "vendorPreDiscussed" ? "Discussion notes" : key === "clientFinishApproval" ? "Client-visible finish/design/specification details" : publicDetails.has(key) ? "Customer-visible estimate note" : "Requirement details"} required={key === "vendorPreDiscussed"} hint={publicDetails.has(key) ? "This text appears in the customer quotation. Include only information suitable for the client." : key === "clientFinishApproval" ? "The client sees these details when reviewing the selection." : "Details for the assigned project team."}>{(props) => <Textarea {...props} maxLength={4000} disabled={disabled} value={draft.details[key] ?? ""} onChange={(event) => change({ ...draft, details: { ...draft.details, [key]: event.target.value } })} />}</Field>
          {key === "designerPoApproval" ? <section aria-label="Designer PO Approval Checklist"><h3>Designer PO Approval Checklist</h3><ol>{draft.poApprovalChecklist.map((point, pointIndex) => <li key={point.id}><Field id={`${id}-${point.id}`} label={`Approval point ${pointIndex + 1}`} required>{(props) => <Input {...props} maxLength={1000} disabled={disabled} value={point.text} onChange={(event) => change({ ...draft, poApprovalChecklist: draft.poApprovalChecklist.map((entry) => entry.id === point.id ? { ...entry, text: event.target.value } : entry) })} />}</Field><Button variant="quiet" disabled={disabled} aria-label={`Remove approval point ${pointIndex + 1}`} onClick={() => change({ ...draft, poApprovalChecklist: draft.poApprovalChecklist.filter((entry) => entry.id !== point.id) })}>Remove</Button></li>)}</ol><Button variant="secondary" disabled={disabled || draft.poApprovalChecklist.length >= 50} onClick={() => change({ ...draft, poApprovalChecklist: [...draft.poApprovalChecklist, { id: `point-${crypto.randomUUID()}`, text: "" }] })}>Add approval point</Button></section> : null}
        </div> : null}
      </section>)}</div>
    </> : null}
    {error ? <InlineMessage tone="error" role="alert">{error}</InlineMessage> : null}
    {conflict || unknownVersion !== null ? <InlineMessage tone="warning" role="alert" title={unknownVersion !== null ? "Saved rules are unconfirmed" : "Configuration changed"}>Your choices are preserved. {unknownVersion !== null ? "Resolve the pending save before leaving." : "Load the current version, review your changes, then save."}<Button variant="secondary" busy={busy} onClick={() => void reload()}>Load current rules</Button></InlineMessage> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {editable ? <div className="design-rule-save"><Button busy={busy} disabled={disabled || conflict || !draft || (!dirty && !confirmation)} onClick={() => void save()}>{confirmation ? "Confirm Design rules" : "Save Design rules"}</Button></div> : null}
  </Surface>;
});
