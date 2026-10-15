import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { Button, Field } from "../../ui/primitives";
import { createIdempotencyKey } from "../finance/money";
import { percentage } from "../execution/executionModel";
import { WorkEvidence } from "../vendor-work/WorkEvidence";
import { AccessLost, CommandFeedback, dateTime, label, p, Panel, QueryState, ScopeMismatch, unavailable, useDeliveryCommand, useDeliveryGuard, type DeliveryContext } from "../execution/executionNative";
import type { SiteCompletion } from "./siteCompletionTypes";

interface Draft { version: number; progress: string; note: string }
export function SiteCompletionPanel({ context: c, projectId }: { context: DeliveryContext; projectId: string }) {
  const audience = c.session.user.role === "client" ? "client" : c.can("GET /admin/projects/:projectId/site-completion") ? "admin" : "staff";
  const allowed = c.can(audience === "client" ? "GET /clients/projects/:projectId/site-completion" : audience === "admin" ? "GET /admin/projects/:projectId/site-completion" : "GET /projects/:projectId/site-completion");
  const query = useQuery({ queryKey: c.key("site-completion", projectId, audience), queryFn: ({ signal }) => c.completion.site(projectId, audience, signal), enabled: c.ready && allowed, retry: false, refetchInterval: state => state.state.error ? false : 15_000, refetchIntervalInBackground: false });
  const [draft, setDraft] = useState<Draft | null>(null);
  const command = useDeliveryCommand(async () => { await Promise.all([query.refetch(), c.refresh()]); }); useDeliveryGuard(c, Boolean(draft), command.locked);
  if (!allowed) return null;
  if (unavailable(query.error) || command.accessLost) return <AccessLost title="Site completion unavailable" />;
  const data = query.data?.projectId === projectId ? query.data : null;
  const current = draft ?? (data ? { version: data.version, progress: String(data.progress), note: data.note } : null);
  const stale = Boolean(draft && data && draft.version !== data.version);
  const changed = Boolean(data && current && (current.progress !== String(data.progress) || current.note !== data.note));
  const editable = data?.projectStatus === "active" && ["draft", "changes_requested"].includes(data.status) && c.can("PATCH /projects/:projectId/site-completion/progress");
  const validate = (saved: SiteCompletion) => { if (saved.projectId !== projectId) throw new Error("The completion response belongs to another project."); return saved; };
  function save() {
    if (!data || !current || !editable || stale || c.locked || query.isError) return;
    try { const body = { expectedVersion: current.version, idempotencyKey: createIdempotencyKey(), progress: percentage(current.progress), note: current.note.trim() }; void command.execute(async () => validate(await c.completion.progress(projectId, body)), () => setDraft(null)); } catch (cause) { command.validation(cause instanceof Error ? cause.message : "Review your progress."); }
  }
  function submit() {
    if (!data || !current || !data.canSubmit || data.progress !== 100 || changed || stale || c.locked || query.isError || !c.can("POST /projects/:projectId/site-completion/submit")) return;
    const body = { expectedVersion: data.version, idempotencyKey: createIdempotencyKey(), note: data.note.trim() };
    void command.execute(async () => validate(await c.completion.submit(projectId, body)), () => setDraft(null));
  }
  return <Panel title={audience === "client" ? "Project completion review" : "Site completion"}><QueryState title="Site completion" query={query} />{query.data && !query.isError && !data ? <ScopeMismatch /> : null}{data ? <>
    <Text style={p.strong}>{data.progress}% saved progress · {label(data.status)}</Text><Text style={p.copy}>Project: {label(data.projectStatus)} · Round {data.currentRound}</Text>
    {data.status === "pending_client" ? <Text style={p.copy}>The Client is reviewing the submitted completion.</Text> : data.status === "client_approved" ? <Text style={p.copy}>{data.projectStatus === "completed" ? "Project completed." : "The Client accepted completion. Super Admin makes the final project decision."}</Text> : null}
    {data.review?.decision?.reason ? <Text style={p.error}>Client requested changes: {data.review.decision.reason}</Text> : null}
    {editable && current ? <><Field label="Project execution progress (%)" value={current.progress} keyboardType="number-pad" maxLength={3} editable={!c.locked} onChangeText={value => setDraft({ ...current, progress: value })} /><Field label="Site completion note" value={current.note} multiline maxLength={2000} editable={!c.locked} onChangeText={value => setDraft({ ...current, note: value })} />{stale ? <Text style={p.error}>Completion changed. Discard your draft to review the current version.</Text> : null}{changed ? <Text style={p.copy}>Save your changes before sending completion to the Client.</Text> : data.progress !== 100 ? <Text style={p.copy}>Save 100% progress before sending completion.</Text> : null}<Button label={data.needsReverification && current.progress === "100" ? "Reverify 100% progress" : current.progress === "100" && data.progress !== 100 ? "Save 100% progress" : "Save site progress"} disabled={c.locked || query.isError || stale || (!changed && !data.needsReverification) || query.isFetching} onPress={save} />{c.can("POST /projects/:projectId/site-completion/submit") ? <Button label="Complete and send to Client" disabled={c.locked || query.isError || !data.canSubmit || data.progress !== 100 || changed || stale || query.isFetching} onPress={submit} /> : null}{draft ? <Button label="Discard site completion draft" variant="quiet" disabled={command.pending || command.uncertain} onPress={() => setDraft(null)} /> : null}</> : data.note ? <Text style={p.copy}>{data.note}</Text> : null}
    {data.blockers.map((blocker, index) => <Text key={`${index}:${blocker}`} style={p.error}>{blocker}</Text>)}
    {data.review ? <><Text style={p.strong}>Submitted completion · Round {data.review.round}</Text><Text style={p.copy}>{dateTime(data.review.submittedAt)} · {label(data.review.status)}</Text><Text style={p.copy}>{data.review.note}</Text>{data.review.sections.map(section => <View key={section.assignmentId} style={p.stack}><Text style={p.strong}>{section.itemName}</Text><Text style={p.copy}>{section.roomName} · {section.sectionLabel} · {section.scopeType ? label(section.scopeType) : "Scope not specified"}</Text><WorkEvidence context={c} projectId={projectId} assignmentId={section.assignmentId} imageIds={section.imageIds} /></View>)}{audience === "client" ? <SiteClientDecision key={data.review.id} context={c} completion={data} staleRead={query.isError || query.isFetching} refresh={async () => { await query.refetch(); await c.refresh(); }} /> : null}</> : audience === "client" ? <Text style={p.copy}>The Site Manager has not submitted a completion review.</Text> : null}
  </> : null}<Button label="Refresh site completion" variant="quiet" disabled={c.locked || query.isFetching} onPress={() => void query.refetch()} /><CommandFeedback command={command} /></Panel>;
}
function SiteClientDecision({ context: c, completion, staleRead, refresh }: { context: DeliveryContext; completion: SiteCompletion; staleRead: boolean; refresh: () => Promise<unknown> }) {
  const review = completion.review!; const [draft, setDraft] = useState<{ reason: string; version: number } | null>(null);
  const command = useDeliveryCommand(refresh); useDeliveryGuard(c, Boolean(draft), command.locked);
  if (command.accessLost) return <AccessLost title="Completion decision unavailable" />;
  const allowed = c.can("POST /clients/projects/:projectId/site-completion/decision") && review.status === "pending" && completion.projectStatus === "active";
  const stale = Boolean(draft && draft.version !== review.version);
  function decide(decision: "approve" | "request_changes") {
    if (!allowed || c.locked || staleRead || stale || (decision === "request_changes" && !draft?.reason.trim())) return;
    const body = { expectedVersion: draft?.version ?? review.version, idempotencyKey: createIdempotencyKey(), decision, reason: decision === "request_changes" ? draft!.reason.trim() : null };
    void command.execute(async () => { const saved = await c.completion.decide(completion.projectId, body); if (saved.projectId !== completion.projectId) throw new Error("The decision response belongs to another project."); return saved; }, () => setDraft(null));
  }
  return <View style={p.stack}>{allowed ? <><Button label="Accept project completion" disabled={c.locked || staleRead || stale || Boolean(draft)} onPress={() => decide("approve")} /><Button label="Request completion changes" variant="secondary" disabled={c.locked} onPress={() => setDraft({ reason: "", version: review.version })} />{draft ? <><Field label="Describe completion changes needed" value={draft.reason} editable={!c.locked} multiline maxLength={2000} onChangeText={reason => setDraft({ ...draft, reason })} />{stale ? <Text style={p.error}>This completion review changed. Cancel your draft and review the latest submission.</Text> : null}<Button label="Send changes to Site Manager" disabled={c.locked || staleRead || stale || !draft.reason.trim()} onPress={() => decide("request_changes")} /><Button label="Cancel completion changes" variant="quiet" disabled={command.pending || command.uncertain} onPress={() => setDraft(null)} /></> : null}</> : null}<CommandFeedback command={command} /></View>;
}
