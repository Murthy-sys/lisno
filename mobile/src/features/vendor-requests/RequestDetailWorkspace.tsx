import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { ApiError } from "../../core/http/apiClient";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { useBackInterceptor } from "../../navigation/useScreenBack";
import { createIdempotencyKey } from "../finance/money";
import { closeCatalogDraft } from "../knowledge/knowledgeCatalogForms";
import { KnowledgeItemWorkspaceWithContext } from "../knowledge/KnowledgeItemWorkspace";
import { Button, Field, KnowledgeCard, KnowledgeDetailProvider, KnowledgeText, knowledgeStyles as s } from "../knowledge/knowledgeDetailUi";
import { executeProposalCommand, type ProposalCommand } from "./proposalCommands";
import { intakeProblem, normalizeIntake, ProposalIntakeFields } from "./ProposalIntakeFields";
import { ProposalResourcesPanel } from "./ProposalResourcesPanel";
import { proposalKnowledgeContext } from "./proposalKnowledgeContext";
import { proposalChangeSummaries } from "./proposalComparison";
import { proposalDenied, proposalError, proposalStatus, proposalUncertain, type ProposalContext } from "./proposalRuntime";
import type { ProposalDetail, ProposalIntakeContent, ProposalMutationResult, ProposalSnapshot } from "./proposalTypes";

export function RequestDetailWorkspace({ context, proposalId: initialId, onBack }: { context: ProposalContext; proposalId: string; onBack: () => void }) {
  const client = useQueryClient(); const navigation = useScaffoldNavigationGuard();
  const [id, setId] = useState(initialId); const [snapshot, setSnapshot] = useState<ProposalSnapshot>("current");
  const [draft, setDraft] = useState<ProposalIntakeContent | null>(null); const [basis, setBasis] = useState<ProposalDetail | null>(null);
  const [editorUnknown, setEditorUnknown] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [resourceEditing, setResourceEditing] = useState(false);
  const [lineId, setLineId] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [denied, setDenied] = useState(false); const [conflict, setConflict] = useState(false); const [reason, setReason] = useState("");
  const alive = useRef(true); const lock = useRef(false); const command = useRef<ProposalCommand | null>(null);
  const detail = useQuery({ queryKey: context.key("detail", id, snapshot), queryFn: async () => { const result = await context.api.getProposal(context.scope, id, snapshot); if (result.id !== id) throw new Error("Request identity could not be verified."); return result; }, enabled: context.ready && context.canRead && !denied, gcTime: 0 });
  const value = detail.data;
  const hierarchy = useQuery({ queryKey: context.key("hierarchy", id, snapshot, value?.head.version), queryFn: () => context.api.collectProposalPages(offset => context.api.getProposalHierarchy(context.scope, id, snapshot, offset)), enabled: Boolean(value) && context.canRead && !denied, gcTime: 0 });
  const readiness = useQuery({ queryKey: context.key("readiness", id, value?.version), queryFn: () => context.api.getProposalReadiness(context.scope, id), enabled: Boolean(value) && snapshot === "current" && !denied, gcTime: 0 });
  const changes = useQuery({ queryKey: context.key("changes", id, value?.head.digest), queryFn: () => context.api.collectProposalPages(offset => context.api.getProposalChanges(id, offset)), enabled: context.canRead && context.scope === "admin" && snapshot === "current" && Boolean(value?.submittedHead) && showChanges && !denied, gcTime: 0 });
  const full = value?.requestMode !== "hierarchy_intake";
  const dirty = Boolean(draft || reason.trim());
  const blocked = editorUnknown || resourceEditing || busy || Boolean(command.current) || detail.isError || conflict || Boolean(basis && value && (basis.version !== value.version || basis.requestVersion !== value.requestVersion));
  const editable = Boolean(value?.capabilities.edit && context.canUpdate && snapshot === "current" && !blocked);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!lineId) navigation?.setBlocked(dirty || busy || Boolean(command.current)); return () => { if (!lineId) navigation?.setBlocked(false); }; }, [navigation, dirty, busy, error, lineId]);
  function close() { if (busy || command.current) return; closeCatalogDraft(dirty, onBack); }
  useBackInterceptor(() => { if (lineId) return false; close(); return true; });
  async function refresh() {
    await Promise.allSettled([client.invalidateQueries({ queryKey: context.key("list") }), client.invalidateQueries({ queryKey: context.key("detail", id) }), client.invalidateQueries({ queryKey: context.key("hierarchy", id) }), client.invalidateQueries({ queryKey: context.key("readiness", id) }), client.invalidateQueries({ queryKey: context.key("editor", id) })]);
  }
  const latest = useRef({ value, nodes: hierarchy.data }); latest.current = { value, nodes: hierarchy.data };
  const editorContext = useMemo(() => value ? proposalKnowledgeContext({ context, snapshot, getDetail: () => latest.current.value!, getHierarchy: () => latest.current.nodes ?? [], onAccessLost: () => setDenied(true), onUnknownChange: setEditorUnknown, onRead: detail => { latest.current.value = detail; client.setQueryData(context.key("detail", id, snapshot), detail); }, onSaved: async (result: ProposalMutationResult) => {
    latest.current.value = result.detail; client.setQueryData(context.key("detail", id, snapshot), result.detail); await refresh();
  }, refresh }) : null, [context.scopeKey, snapshot, id, Boolean(value), value?.capabilities.edit, value?.capabilities.editQuality, context.canUpdate]);
  async function execute(kind: ProposalCommand["kind"]) {
    if (lock.current || !value || !context.ready || !context.canRead || denied) return;
    if (!command.current) {
      if (blocked || snapshot !== "current") return;
      if (kind === "save" ? !editable : kind === "revise" ? !context.canCreate || !value.capabilities.revise : !context.canSubmit) return;
      if (kind === "submit" && !value.capabilities.submit || (kind === "approve" || kind === "reject") && !value.capabilities.decide) return;
      if (kind === "reject" && !reason.trim()) { setError("Enter a send-back reason so the requester can correct the request."); return; }
      if (full && (kind === "approve" || kind === "submit") && (!readiness.data?.ready || readiness.data.version !== value.version || readiness.data.head.digest !== value.head.digest || readiness.isError || readiness.isFetching)) { setError("Resolve the current configuration findings before publication."); return; }
      const intake = draft ?? value.intake;
      if (intake && kind !== "reject" && kind !== "revise") { const problem = intakeProblem(intake, kind === "approve" || kind === "submit"); if (problem) { setError(problem); return; } }
      const saved = basis ?? value;
      command.current = { kind, basis: saved, idempotencyKey: createIdempotencyKey(), ...(kind === "reject" ? { reason: reason.trim() } : {}), ...(draft && kind !== "reject" && kind !== "revise" ? { save: { expectedVersion: saved.version, ...(context.scope === "admin" && saved.requestVersion !== null ? { expectedRequestVersion: saved.requestVersion } : {}), intake: normalizeIntake(draft) } } : {}) };
    }
    lock.current = true; setBusy(true); setError(""); setNotice(""); const current = command.current;
    try {
      const result = await executeProposalCommand(context.api, context.scope, current, () => alive.current && command.current === current);
      if (!alive.current) return;
      command.current = null; setDraft(null); setBasis(null); setReason(""); setConflict(false);
      if (result.kind === "decision") {
        client.setQueryData<ProposalDetail>(context.key("detail", id, "current"), previous => previous ? { ...previous, status: result.result.status, version: result.result.version, requestVersion: result.result.requestVersion, reason: result.result.reason, capabilities: { ...previous.capabilities, edit: false, decide: false, submit: false } } : previous);
        setNotice(result.result.status === "rejected" ? "Request sent back. The requester can revise and resubmit." : full ? "Configuration published." : "Hierarchy approved. Main Lines are drafts ready for Configuration.");
        await client.invalidateQueries({ predicate: query => query.queryKey.includes("knowledge") }).catch(() => setNotice("The decision was saved. Refresh to load the latest catalogue."));
      } else {
        client.setQueryData(context.key("detail", result.detail.id, "current"), result.detail);
        if (result.kind === "revise") { setId(result.detail.id); setSnapshot("current"); }
        setNotice(result.kind === "submit" ? "Request sent to Super Admin." : result.kind === "revise" ? "New draft created. The original request and send-back reason remain in history." : "Request changes saved.");
      }
      await refresh();
    } catch (cause) {
      if (!alive.current) return;
      setError(proposalError(cause));
      if (proposalDenied(cause)) { setDenied(true); setDraft(null); setBasis(null); }
      if (!proposalUncertain(cause)) {
        if (current.saved) { client.setQueryData(context.key("detail", id, "current"), current.saved); setDraft(null); setBasis(null); }
        command.current = null;
      }
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function reload() {
    if (command.current || busy) return;
    setDraft(null); setBasis(null); setReason(""); setConflict(false); setError(""); await detail.refetch(); await hierarchy.refetch(); await readiness.refetch();
  }
  if (denied || proposalDenied(detail.error) || proposalDenied(hierarchy.error) || proposalDenied(readiness.error) || proposalDenied(changes.error)) return <KnowledgeCard title="Request unavailable"><KnowledgeText error>This request is no longer available to your account.</KnowledgeText><Button label="Back to requests" variant="secondary" onPress={onBack} /></KnowledgeCard>;
  if (lineId && editorContext && value) return <KnowledgeItemWorkspaceWithContext context={editorContext} mainLineId={lineId} onBack={() => { if (!editorUnknown) setLineId(null); }} onOpenItem={next => { if (!editorUnknown) setLineId(next); }} />;
  return <KnowledgeDetailProvider><ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
    <Button label="Back to requests" variant="quiet" disabled={busy || Boolean(command.current)} onPress={close} />
    <KnowledgeCard title={context.scope === "admin" ? "Review basket request" : "Basket request"}>
      {!value ? <><KnowledgeText error={detail.isError}>{detail.isPending ? "Loading request…" : proposalError(detail.error)}</KnowledgeText><Button label="Retry request" variant="secondary" onPress={() => void detail.refetch()} /></> : <>
        <KnowledgeText>{value.name} · {proposalStatus[value.status]}</KnowledgeText>
        {value.reason ? <KnowledgeText>Send-back reason: {value.reason}</KnowledgeText> : null}
        {value.revisedFromId ? <KnowledgeText>This draft is linked to the original submitted request.</KnowledgeText> : null}
        {snapshot !== "current" ? <KnowledgeText>{snapshot === "submitted" ? "Original submission" : "Approved request"}. Read-only.</KnowledgeText> : null}
        {notice ? <KnowledgeText>{notice}</KnowledgeText> : null}
        {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
        {detail.isError || conflict ? <KnowledgeText error>The saved request changed or could not refresh. Your choices are retained; reload before continuing.</KnowledgeText> : null}
        {command.current ? <><KnowledgeText>The outcome is unconfirmed. Retry the same action before leaving.</KnowledgeText><Button label="Retry same action" loading={busy} onPress={() => void execute(command.current!.kind)} /></> : null}
        <Button label="Reload saved request" variant="quiet" disabled={busy || Boolean(command.current)} onPress={() => closeCatalogDraft(dirty, () => void reload())} />
        {value.submittedHead ? <Button label={snapshot === "submitted" ? "Return to current request" : "View original submission"} variant="secondary" disabled={blocked || dirty} onPress={() => setSnapshot(snapshot === "submitted" ? "current" : "submitted")} /> : null}
        {value.approvedHead ? <Button label={snapshot === "approved" ? "Return to current request" : "View approved request"} variant="secondary" disabled={blocked || dirty} onPress={() => setSnapshot(snapshot === "approved" ? "current" : "approved")} /> : null}
        {context.scope === "admin" && value.submittedHead && snapshot === "current" ? <KnowledgeCard title="Changes since submission"><Button label={showChanges ? "Hide comparison" : "Compare submitted and current"} variant="secondary" onPress={() => setShowChanges(current => !current)} />{showChanges ? changes.isPending ? <KnowledgeText>Loading saved changes…</KnowledgeText> : changes.isError ? <><KnowledgeText error>{proposalError(changes.error)}</KnowledgeText><Button label="Retry comparison" onPress={() => void changes.refetch()} /></> : <><KnowledgeText>Original submission compared with the current saved request. Unsaved edits are excluded.</KnowledgeText>{!changes.data?.length ? <KnowledgeText>No saved changes since submission.</KnowledgeText> : proposalChangeSummaries(changes.data, hierarchy.data ?? [], value.name).map(change => <View key={change.resourceId} style={s.stack}><KnowledgeText>{change.title}</KnowledgeText>{change.description ? <KnowledgeText>{change.description}</KnowledgeText> : null}{change.savedAt ? <KnowledgeText>Saved {new Date(change.savedAt).toLocaleString()}</KnowledgeText> : null}</View>)}</> : null}</KnowledgeCard> : null}
        {value.intake ? <ProposalIntakeFields value={draft ?? value.intake} parentName={value.targetParentName ?? value.basket.payload.name} disabled={!editable} onChange={next => { setBasis(current => current ?? value); setDraft(next); setError(""); }} /> : null}
        {full ? <>
          <KnowledgeText>{value.basket.payload.description ?? "No basket description."}</KnowledgeText>
          <ProposalResourcesPanel context={context} detail={value} nodes={hierarchy.data ?? []} snapshot={snapshot} disabled={busy || Boolean(command.current) || dirty || hierarchy.isError || detail.isError} onEditingChange={setResourceEditing} onSaved={async result => { client.setQueryData(context.key("detail", id, snapshot), result.detail); await refresh(); }} />
          {hierarchy.isError ? <Button label="Retry hierarchy" variant="secondary" onPress={() => void hierarchy.refetch()} /> : null}
          {hierarchy.data?.filter(node => node.kind === "sub_basket").map(sub => <KnowledgeCard key={sub.resourceId} title={sub.payload.name}><KnowledgeText>{sub.payload.description ?? "No description."}</KnowledgeText>{hierarchy.data.filter(node => node.kind === "main_line" && node.parentId === sub.resourceId).map(line => <Button key={line.resourceId} label={`${editable ? "Configure" : "View"} ${line.payload.name}`} variant="secondary" disabled={blocked || dirty || hierarchy.isError} onPress={() => setLineId(line.resourceId)} />)}</KnowledgeCard>)}
        </> : null}
        {readiness.isError ? <><KnowledgeText error>Readiness could not be checked.</KnowledgeText><Button label="Retry readiness" variant="secondary" onPress={() => void readiness.refetch()} /></> : readiness.data && snapshot === "current" ? <KnowledgeCard title={readiness.data.ready ? "Ready for approval" : "Configuration findings"}>{readiness.data.findings.map((finding, index) => <KnowledgeText key={`${finding.resourceId}:${index}`} error>{finding.message}</KnowledgeText>)}{!readiness.data.findings.length ? <KnowledgeText>The current saved request meets the publication checks.</KnowledgeText> : null}</KnowledgeCard> : null}
        {snapshot === "current" ? <>
          {value.capabilities.edit && context.canUpdate && value.intake ? <Button label={context.scope === "admin" ? "Save request changes" : "Save draft"} disabled={!draft || blocked} loading={busy} onPress={() => void execute("save")} /> : null}
          {value.capabilities.submit && context.canSubmit ? <Button label="Send to Super Admin" disabled={blocked} loading={busy} onPress={() => void execute("submit")} /> : null}
          {value.capabilities.revise && context.canCreate ? <Button label="Edit and resubmit" disabled={blocked} loading={busy} onPress={() => void execute("revise")} /> : null}
          {value.capabilities.decide && context.canSubmit ? <><Field label="Send-back reason" value={reason} multiline maxLength={1000} editable={!blocked && !draft} onChangeText={setReason} /><Button label="Send back request" variant="secondary" disabled={blocked || Boolean(draft)} loading={busy} onPress={() => void execute("reject")} /><Button label={full ? "Publish configuration" : "Approve hierarchy"} disabled={blocked || Boolean(full && (!readiness.data?.ready || readiness.isError || readiness.isFetching))} loading={busy} onPress={() => void execute("approve")} /></> : null}
        </> : null}
      </>}
    </KnowledgeCard>
  </ScrollView></KnowledgeDetailProvider>;
}
