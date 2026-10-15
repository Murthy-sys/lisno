import { useQuery, useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { DESIGN_RULE_HELP, DESIGN_RULE_KEYS, DESIGN_RULE_QUESTIONS, type DesignRuleKey, type DesignRules } from "../../../../shared/knowledge/designRules";
import type { KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeMaster, KnowledgeSectionEnvelope } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import { Button, Field, KnowledgeCard, KnowledgeChoice, KnowledgeSelect, KnowledgeText, knowledgeStyles as s } from "./knowledgeDetailUi";
import { designRulesSaveProblem, newDesignApprovalPoint, readMobileDesignSection } from "./knowledgeDesignRules";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";

export interface KnowledgeDesignSaveHandle { save(): Promise<boolean>; discard(): boolean }
interface Props {
  readonly item: KnowledgeItemDetail;
  readonly revisionId: string;
  readonly editable: boolean;
  readonly context: KnowledgeMobileContext;
  readonly vendors: readonly KnowledgeMaster[];
  readonly vendorStatus: "loading" | "error" | "ready";
  readonly onRetryVendors: () => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onUnknownChange: (unknown: boolean) => void;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const publicDetails = new Set<DesignRuleKey>(["maintenanceAccess", "substrateFixing", "dimensionsClearances"]);
type SavedDesign = { section: KnowledgeSectionEnvelope; rules: DesignRules };

export const KnowledgeDesignEditor = forwardRef<KnowledgeDesignSaveHandle, Props>(function KnowledgeDesignEditor(props, ref) {
  return <DesignEditor key={`${props.context.scopeKey}:${props.item.mainLineId}:${props.revisionId}`} {...props} ref={ref} />;
});

const DesignEditor = forwardRef<KnowledgeDesignSaveHandle, Props>(function DesignEditor({ item, revisionId, editable, context, vendors, vendorStatus, onRetryVendors, onDirtyChange, onBusyChange, onUnknownChange }, ref) {
  const client = useQueryClient();
  const lock = useRef(false);
  const alive = useRef(true);
  const aggregateVersion = useRef(item.version);
  const [base, setBase] = useState<SavedDesign | null>(null);
  const [draft, setDraft] = useState<DesignRules | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [unknownVersion, setUnknownVersion] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const queryKey = context.key("section", item.mainLineId, revisionId, "design");
  const query = useQuery({ queryKey, queryFn: () => context.api.getKnowledgeSection(item.mainLineId, revisionId, "design"), enabled: context.ready && context.canRead && Boolean(revisionId) });
  const source = useMemo(() => {
    if (!query.data) return null;
    try { return { rules: readMobileDesignSection(query.data, item.mainLineId, revisionId), error: "" }; }
    catch (cause) { return { rules: null, error: cause instanceof Error ? cause.message : "Design rules could not be read." }; }
  }, [query.data, item.mainLineId, revisionId]);
  const denied = accessDenied || !context.canRead || (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status));
  const dirty = Boolean(draft && base && !same(draft, base.rules));
  const unavailable = denied || query.isError || !source?.rules;
  const disabled = !editable || !context.ready || unavailable || busy || conflict || (unknownVersion !== null && !confirmation);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => onDirtyChange(dirty || unknownVersion !== null), [dirty, unknownVersion, onDirtyChange]);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => onUnknownChange(unknownVersion !== null), [unknownVersion, onUnknownChange]);
  useEffect(() => () => { onDirtyChange(false); onBusyChange(false); onUnknownChange(false); }, [onDirtyChange, onBusyChange, onUnknownChange]);
  useEffect(() => {
    if (!query.data || !source?.rules || dirty || busy || conflict || unknownVersion !== null) return;
    setBase({ section: query.data, rules: source.rules }); setDraft(source.rules);
    aggregateVersion.current = Math.max(aggregateVersion.current, item.version, client.getQueryData<KnowledgeItemDetail>(context.key("detail", item.mainLineId))?.version ?? 0);
  }, [query.data, source, dirty, busy, conflict, unknownVersion, item.version, item.mainLineId, client, context]);

  function change(next: DesignRules) {
    if (disabled) return;
    if (!dirty && unknownVersion === null) aggregateVersion.current = Math.max(aggregateVersion.current, item.version, client.getQueryData<KnowledgeItemDetail>(context.key("detail", item.mainLineId))?.version ?? 0);
    setDraft(next); setError(""); setNotice("");
  }
  async function readCurrent(uncertain: number | null) {
    const [section, currentItem] = await Promise.all([
      context.api.getKnowledgeSection(item.mainLineId, revisionId, "design"), context.api.getKnowledgeItem(item.mainLineId)
    ]).catch(cause => {
      if (alive.current && cause instanceof ApiError && [401, 403, 404].includes(cause.status)) setAccessDenied(true);
      throw cause;
    });
    const rules = readMobileDesignSection(section, item.mainLineId, revisionId);
    if (currentItem.mainLineId !== item.mainLineId || currentItem.draftRevisionId !== revisionId || currentItem.draftRevision?.status !== "draft" || currentItem.status === "archived" || !currentItem.allowedActions.includes("update_section") || section.version < (base?.section.version ?? 0)) throw new Error("The editable revision changed. Reload this workspace before continuing.");
    if (!alive.current) throw new Error("The workspace changed.");
    client.setQueryData(context.key("detail", item.mainLineId), currentItem);
    client.setQueryData(queryKey, section);
    aggregateVersion.current = currentItem.version;
    setBase({ section, rules }); setConflict(false);
    const settled = uncertain === null || section.version > uncertain;
    setUnknownVersion(settled ? null : uncertain); setConfirmation(!settled);
    return { rules, settled };
  }
  async function reload() {
    if (lock.current || denied) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await readCurrent(unknownVersion);
      setNotice(result.settled ? "Current saved rules loaded. Your changes are preserved; review them before saving." : "The earlier save is not confirmed. Confirm these rules to settle the pending change.");
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Current rules could not be loaded."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function save(): Promise<boolean> {
    if (lock.current || disabled || !base || !draft) return false;
    if (!dirty && !confirmation) return true;
    const problem = designRulesSaveProblem(draft);
    if (problem) { setError(problem); return false; }
    if (draft.answers.vendorPreDiscussed && vendorStatus !== "ready") { setError("Load the current vendor choices before saving a vendor discussion."); return false; }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const saved = await context.api.updateKnowledgeSection(item.mainLineId, revisionId, "design", {
        expectedVersion: base.section.version, expectedAggregateVersion: aggregateVersion.current,
        applicability: "configured", payload: draft as unknown as KnowledgeJsonObject
      });
      const rules = readMobileDesignSection(saved, item.mainLineId, revisionId);
      if (!Number.isSafeInteger(saved.aggregateVersion) || saved.aggregateVersion <= aggregateVersion.current || saved.version <= base.section.version) throw new Error("The saved version could not be verified.");
      if (!alive.current) return false;
      aggregateVersion.current = saved.aggregateVersion;
      client.setQueryData(queryKey, saved);
      client.setQueryData<KnowledgeItemDetail>(context.key("detail", item.mainLineId), previous => ({ ...(previous ?? item), version: saved.aggregateVersion, updatedAt: saved.updatedAt }));
      setBase({ section: saved, rules }); setDraft(rules); setConflict(false); setUnknownVersion(null); setConfirmation(false); onDirtyChange(false); onUnknownChange(false); setNotice("Design rules saved.");
      try { await context.refresh(); }
      catch { if (alive.current) setNotice("Design rules saved. Refresh to load the latest summary."); }
      return true;
    } catch (cause) {
      if (!alive.current) return false;
      if (cause instanceof ApiError && cause.status === 409) { setConflict(true); setError("This configuration changed elsewhere. Load its current rules before saving again."); }
      else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) {
        setError(cause.message);
        if ([401, 403, 404].includes(cause.status)) { setAccessDenied(true); await query.refetch(); }
      } else {
        const version = base.section.version; setUnknownVersion(version); setConfirmation(false); onDirtyChange(true); onUnknownChange(true);
        try {
          const current = await readCurrent(version);
          if (current.settled && same(current.rules, draft)) {
            setDraft(current.rules); onDirtyChange(false); onUnknownChange(false); setNotice("Design rules saved. The response was verified against the current version.");
            await context.refresh().catch(() => undefined);
            return true;
          }
          setNotice(current.settled ? "Current saved rules loaded. Review your preserved choices before saving." : "Confirm your rules to settle the earlier save.");
        } catch { if (alive.current) setError("The save response could not be verified. Load current rules before leaving."); }
      }
      return false;
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function discard(): boolean {
    if (lock.current || unknownVersion !== null) return false;
    if (base) setDraft(base.rules);
    setConflict(false); setError(""); setNotice(""); onDirtyChange(false); return true;
  }
  useImperativeHandle(ref, () => ({ save, discard }));

  if (denied) return <KnowledgeCard title="Design unavailable"><KnowledgeText error>Design rules are unavailable with your current access.</KnowledgeText><Button label="Retry Design access" variant="secondary" onPress={() => void query.refetch().then(result => { if (result.isSuccess) setAccessDenied(false); })} /></KnowledgeCard>;
  return <KnowledgeCard title="Design requirements">
    <KnowledgeText>Set the approvals and checks required when this Main Line is included in a project.</KnowledgeText>
    {query.isPending ? <KnowledgeText>Loading Design rules…</KnowledgeText> : null}
    {query.isError || source?.error ? <View style={s.stack}><KnowledgeText error>{source?.error || "Design rules could not be refreshed. Saved choices are retained."}</KnowledgeText><Button label="Retry Design rules" variant="secondary" onPress={() => void query.refetch()} /></View> : null}
    {!editable ? <KnowledgeText>Design rules are read-only. Create a Draft revision to edit them.</KnowledgeText> : null}
    {draft && source?.rules ? <>
      <Text accessibilityRole="header" style={s.subtitle}>Item nature</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Item nature" style={s.row}>{(["standard", "custom"] as const).map(nature => <KnowledgeChoice key={nature} label={nature === "standard" ? "Standard" : "Custom"} selected={draft.itemNature === nature} disabled={disabled} onPress={() => change({ ...draft, itemNature: nature, answers: { ...draft.answers, ...(nature === "custom" && draft.itemNature !== "custom" ? { designerVendorSelection: true } : {}) } })} />)}</View>
      {DESIGN_RULE_KEYS.map((key, index) => <View key={key} testID={`design-rule-${key}`} style={s.stack}>
        <View style={s.divider} />
        <Text style={s.subtitle}>{index + 1}. {DESIGN_RULE_QUESTIONS[key]}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={DESIGN_RULE_QUESTIONS[key]} style={s.row}>{([true, false] as const).map(answer => <KnowledgeChoice key={String(answer)} label={answer ? "Yes" : "No"} accessibilityLabel={`${DESIGN_RULE_QUESTIONS[key]} ${answer ? "Yes" : "No"}`} selected={draft.answers[key] === answer} disabled={disabled} onPress={() => change({ ...draft, answers: { ...draft.answers, [key]: answer } })} />)}</View>
        <KnowledgeText>{DESIGN_RULE_HELP[key]}</KnowledgeText>
        {draft.answers[key] ? <View style={s.stack}>
          {key === "vendorPreDiscussed" ? <>
            <KnowledgeSelect label="Discussed vendor" placeholder="Select vendor" value={draft.discussedVendorId ?? ""} disabled={disabled || vendorStatus !== "ready"} options={vendors.filter(vendor => vendor.status === "active" || vendor.id === draft.discussedVendorId).map(vendor => ({ value: vendor.id, label: vendor.name }))} onChange={value => change({ ...draft, discussedVendorId: value || null })} />
            {vendorStatus !== "ready" ? <><KnowledgeText>{vendorStatus === "loading" ? "Loading vendors…" : "Vendor choices could not be refreshed."}</KnowledgeText>{vendorStatus === "error" ? <Button label="Retry vendors" variant="quiet" onPress={onRetryVendors} /> : null}</> : null}
          </> : null}
          <Field label={key === "vendorPreDiscussed" ? "Discussion notes" : key === "clientFinishApproval" ? "Client-visible finish/design/specification details" : publicDetails.has(key) ? "Customer-visible estimate note" : "Requirement details"} accessibilityLabel={`${DESIGN_RULE_QUESTIONS[key]} Details`} value={draft.details[key] ?? ""} multiline maxLength={4000} editable={!disabled} onChangeText={value => change({ ...draft, details: { ...draft.details, [key]: value } })} />
          <KnowledgeText>{publicDetails.has(key) ? "This text appears in the customer quotation. Include only information suitable for the client." : key === "clientFinishApproval" ? "The client sees these details when reviewing the selection." : "Details for the assigned project team."}</KnowledgeText>
          {key === "designerPoApproval" ? <View style={s.stack}>
            <Text accessibilityRole="header" style={s.subtitle}>Designer PO Approval Checklist</Text>
            {draft.poApprovalChecklist.map((point, pointIndex) => <View key={point.id} style={s.stack}><Field label={`Approval point ${pointIndex + 1}`} value={point.text} maxLength={1000} editable={!disabled} onChangeText={text => change({ ...draft, poApprovalChecklist: draft.poApprovalChecklist.map(value => value.id === point.id ? { ...value, text } : value) })} /><Button label={`Remove approval point ${pointIndex + 1}`} variant="quiet" disabled={disabled} onPress={() => change({ ...draft, poApprovalChecklist: draft.poApprovalChecklist.filter(value => value.id !== point.id) })} /></View>)}
            <Button label="Add approval point" variant="secondary" disabled={disabled || draft.poApprovalChecklist.length >= 50} onPress={() => change({ ...draft, poApprovalChecklist: [...draft.poApprovalChecklist, newDesignApprovalPoint()] })} />
          </View> : null}
        </View> : null}
      </View>)}
    </> : null}
    {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
    {conflict || unknownVersion !== null ? <View style={s.stack}><KnowledgeText error>{unknownVersion !== null ? "The save is unconfirmed. Resolve it before leaving." : "Your choices are preserved. Load the current version, review your changes, then save."}</KnowledgeText><Button label="Load current Design rules" variant="secondary" loading={busy} onPress={() => void reload()} /></View> : null}
    {notice ? <KnowledgeText>{notice}</KnowledgeText> : null}
    {confirmation ? <Button label="Confirm Design rules" disabled={disabled || !draft} loading={busy} onPress={() => void save()} /> : null}
  </KnowledgeCard>;
});
