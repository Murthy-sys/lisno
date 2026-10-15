import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button, Field } from "../../ui/primitives";
import { KnowledgeSelect } from "../knowledge/knowledgeUi";
import { createIdempotencyKey } from "../finance/money";
import { AccessLost, CommandFeedback, dateTime, DeliveryFrame, label, money, p, Pager, Panel, QueryState, ScopeMismatch, unavailable, useDeliveryCommand, useDeliveryContext, useDeliveryGuard, type DeliveryContext } from "../execution/executionNative";
import { SiteCompletionPanel } from "./SiteCompletionPanel";
import { ClientVendorWorkReviews } from "./ClientVendorWorkReviews";
import type { ProjectCompletionSummary, ProjectScopeExceptionKind } from "./projectCompletionTypes";
export function ProjectCompletionWorkspace({ session, projectId, embedded = false }: { session: AuthenticatedSession; projectId?: string; embedded?: boolean }) {
  const c = useDeliveryContext(session);
  return <CompletionSession key={`${c.scope}:${projectId ?? "queue"}`} context={c} {...(projectId ? { projectId } : {})} embedded={embedded} />;
}
function CompletionSession({ context: c, projectId, embedded }: { context: DeliveryContext; projectId?: string; embedded: boolean }) {
  const [selected, setSelected] = useState<string | null>(projectId ?? null); const [offset, setOffset] = useState(0);
  const allowed = c.can("GET /admin/project-completion-tasks");
  const query = useQuery({ queryKey: c.key("completion-queue", offset), queryFn: ({ signal }) => c.completion.queue(offset, signal), enabled: allowed && c.ready && !selected, retry: false });
  if (selected && !c.can("GET /admin/projects/:projectId/completion")) return <DeliveryFrame embedded={embedded}><SiteCompletionPanel context={c} projectId={selected} /><ClientVendorWorkReviews context={c} projectId={selected} /></DeliveryFrame>;
  if (!allowed && !selected) return <AccessLost title="Final project tasks unavailable" />;
  return <DeliveryFrame embedded={embedded}><Text style={p.title}>Project completion</Text><Text style={p.copy}>Resolve approved scope and Client acceptance before the final project decision.</Text>{selected ? <>{!projectId ? <Button label="Back to completion queue" variant="quiet" onPress={() => c.navigate(() => setSelected(null))} /> : null}<ProjectCompletionDetail key={selected} context={c} projectId={selected} /></> : <>{unavailable(query.error) ? <AccessLost title="Completion queue unavailable" /> : <><QueryState title="Completion queue" query={query} />{!query.isError && query.data ? <>{query.data.items.map(item => <Panel key={item.projectId} title={item.projectName}><Text style={p.copy}>{item.readyForCompletion ? "Ready for final approval" : `Pending with ${label(item.pendingOwner)}`}</Text><Text style={p.copy}>Site progress: {item.siteCompletion ? `${item.siteCompletion.progress}%` : "Not recorded"}</Text><Button label={`Review ${item.projectName} completion`} variant="secondary" onPress={() => setSelected(item.projectId)} /></Panel>)}{!query.data.items.length ? <Text style={p.copy}>No projects are awaiting final completion review.</Text> : null}<Pager offset={query.data.offset} limit={query.data.limit} total={query.data.total} onChange={setOffset} /></> : null}</>}<Button label="Refresh completion queue" variant="quiet" disabled={query.isFetching} onPress={() => void query.refetch()} /></>}</DeliveryFrame>;
}
export function ProjectCompletionDetail({ context: c, projectId }: { context: DeliveryContext; projectId: string }) {
  const allowed = c.can("GET /admin/projects/:projectId/completion");
  const query = useQuery({ queryKey: c.key("completion-summary", projectId), queryFn: ({ signal }) => c.completion.summary(projectId, signal), enabled: allowed && c.ready, retry: false });
  const [draft, setDraft] = useState<{ sourceLineItemKey: string; version: number; kind: ProjectScopeExceptionKind; reason: string } | null>(null);
  const command = useDeliveryCommand(async () => { await Promise.all([query.refetch(), c.refresh()]); }); useDeliveryGuard(c, Boolean(draft), command.locked);
  if (!allowed || unavailable(query.error) || command.accessLost) return <AccessLost title="Project completion unavailable" />;
  const data = query.data?.projectId === projectId ? query.data : null;
  const selectedLine = data?.scope.find(line => line.sourceLineItemKey === draft?.sourceLineItemKey);
  const stale = Boolean(draft && data && draft.version !== data.completionAuthorityVersion);
  const check = <T extends { projectId: string }>(saved: T) => { if (saved.projectId !== projectId) throw new Error("The completion response belongs to another project."); return saved; };
  function except() {
    if (!data || data.projectStatus !== "active" || !draft || stale || c.locked || query.isError || !selectedLine || selectedLine.status !== "uncovered" || draft.reason.trim().length < 10 || !c.can("POST /admin/projects/:projectId/scope-exceptions")) return;
    const body = { sourceLineItemKey: draft.sourceLineItemKey, kind: draft.kind, reason: draft.reason.trim(), expectedAuthorityVersion: draft.version, idempotencyKey: createIdempotencyKey() };
    void command.execute(async () => { const saved = check(await c.completion.except(projectId, body)); if (saved.sourceLineItemKey !== body.sourceLineItemKey) throw new Error("The decision response belongs to another source line."); return saved; }, () => setDraft(null));
  }
  function complete() {
    if (!data || data.projectStatus !== "active" || !data.readyForCompletion || draft || c.locked || query.isError || !c.can("POST /admin/projects/:projectId/complete")) return;
    const body = { expectedAuthorityVersion: data.completionAuthorityVersion, idempotencyKey: createIdempotencyKey() };
    void command.execute(async () => check(await c.completion.complete(projectId, body)));
  }
  return <View style={p.stack}><QueryState title="Completion detail" query={query} />{query.data && !data ? <ScopeMismatch /> : null}{data ? <><Panel title={data.projectName}><Text style={p.strong}>{label(data.projectStatus)}</Text><Text style={p.copy}>Scope covered: {data.scope.filter(line => line.status !== "uncovered").length} of {data.scope.length}</Text><Text style={p.copy}>Site progress: {data.siteCompletion ? `${data.siteCompletion.progress}% · ${label(data.siteCompletion.status)}` : "Not recorded"}</Text><Text style={p.copy}>Vendor work: {data.vendorWork.approvedAssignments} accepted of {data.vendorWork.totalAssignments} · {data.vendorWork.openReviews} open reviews</Text><Text style={p.copy}>Pending owner: {label(data.pendingOwner)}</Text>{data.completedAt ? <Text style={p.copy}>Completed {dateTime(data.completedAt)}</Text> : null}{data.blockers.map((blocker, index) => <Text key={`${blocker.code}:${index}`} style={p.error}>{blocker.message}</Text>)}{data.readyForCompletion ? <Text style={p.strong}>Ready for final completion approval.</Text> : null}</Panel>
    <Panel title="Approved estimate scope">{data.scope.map(line => <Panel key={line.sourceLineItemKey} title={`${line.roomName} · ${line.specification}`}><Text style={p.copy}>Approved amount: {money(line.amountPaise)}</Text><Text style={p.copy}>{line.status === "approved_order" ? `${line.approvedOrderLineCount} approved order lines` : line.status === "exception" ? `${label(line.exception?.kind ?? "exception")}: ${line.exception?.reason ?? ""}` : line.status === "not_required" ? "No paid work required (zero estimate amount)" : "Uncovered scope"}</Text>{data.projectStatus === "active" && line.status === "uncovered" && c.can("POST /admin/projects/:projectId/scope-exceptions") ? <Button label={`Record scope decision for ${line.specification}`} variant="secondary" disabled={c.locked || query.isError || query.isFetching} onPress={() => c.navigate(() => setDraft({ sourceLineItemKey: line.sourceLineItemKey, version: data.completionAuthorityVersion, kind: "not_applicable", reason: "" }))} /> : null}</Panel>)}</Panel>
    {draft ? <Panel title="Scope decision"><Text style={p.copy}>{selectedLine ? `${selectedLine.roomName} · ${selectedLine.specification}` : "The selected source line is no longer available."}</Text><KnowledgeSelect label="Scope decision" value={draft.kind} allowEmpty={false} disabled={c.locked} options={[{ value: "not_applicable", label: "Not applicable" }, { value: "externally_fulfilled", label: "Fulfilled outside this order" }]} onChange={kind => setDraft({ ...draft, kind: kind as ProjectScopeExceptionKind })} /><Field label="Reason for scope decision (at least 10 characters)" value={draft.reason} editable={!c.locked} multiline maxLength={2000} onChangeText={reason => setDraft({ ...draft, reason })} />{stale ? <Text style={p.error}>The approved scope changed. Cancel this draft and review the latest scope.</Text> : null}<Button label="Record scope decision" disabled={c.locked || stale || query.isError || query.isFetching || selectedLine?.status !== "uncovered" || draft.reason.trim().length < 10} onPress={except} /><Button label="Cancel scope decision" variant="quiet" disabled={command.pending || command.uncertain} onPress={() => setDraft(null)} /></Panel> : null}
    {c.can("POST /admin/projects/:projectId/complete") ? <Button label="Mark project completed" disabled={c.locked || data.projectStatus !== "active" || !data.readyForCompletion || Boolean(draft) || query.isError || query.isFetching} onPress={complete} /> : null}
    <SiteCompletionPanel context={c} projectId={projectId} />
  </> : null}<Button label="Refresh final completion" variant="quiet" disabled={c.locked || query.isFetching} onPress={() => void query.refetch()} /><CommandFeedback command={command} /></View>;
}
