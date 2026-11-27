import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { apiClient, ApiError } from "../../api/client";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProjectStatusButton } from "../project-status/ProjectStatusButton";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import "./projectCompletion.css";
import { refreshProcurementLifecycle } from "../procurement/procurementLifecycleQueries";
import { useAuth } from "../../auth/AuthProvider";

interface ScopeLine {
  sourceLineItemKey: string;
  sourceSectionId: string;
  roomName: string;
  specification: string;
  amountPaise: number;
  approvedOrderLineCount: number;
  exception: { id: string; kind: "not_applicable" | "externally_fulfilled"; reason: string } | null;
  status: "approved_order" | "exception" | "not_required" | "uncovered";
}
interface Summary {
  projectId: string;
  projectName: string;
  projectStatus: string;
  completionAuthorityVersion: number;
  scope: ScopeLine[];
  vendorWork: { totalAssignments: number; approvedAssignments: number; pendingAssignments: number; openReviews: number };
  siteCompletion: { status: string; progress: number; round: number; reviewId: string | null } | null;
  blockers: Array<{ code: string; message: string; sourceLineItemKey?: string; procurementTab?: string; entityId?: string }>;
  pendingOwner: "program_manager" | "procurement" | "super_admin" | "site_manager" | "vendor" | "client" | "none";
  readyForCompletion: boolean;
  completedAt: string | null;
}
interface Page { items: Summary[]; total: number; limit: number; offset: number }
const queuePrefix = ["admin", "project-completion-tasks"] as const;

export function ProjectCompletionPage() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const queueKey = [...queuePrefix, auth.user?.id ?? ""] as const;
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("projectId");
  const setSelectedId = (id: string | null) => setParams(current => { const next = new URLSearchParams(current); if (id) next.set("projectId", id); else next.delete("projectId"); return next; }, { state: { preserveFocus: true } });
  const keys = useRef(new Map<string, string>());
  const commandKey = (payload: unknown) => { const fingerprint = JSON.stringify(payload); let key = keys.current.get(fingerprint); if (!key) { key = crypto.randomUUID(); keys.current.set(fingerprint, key); } return key; };
  const [staleDecision, setStaleDecision] = useState(false);
  const [exceptionLine, setExceptionLine] = useState<string | null>(null);
  const [exceptionKind, setExceptionKind] = useState<"not_applicable" | "externally_fulfilled">("not_applicable");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const queue = useInfiniteQuery({
    queryKey: queueKey,
    queryFn: ({ pageParam }) => apiClient.get<Page>(`/admin/project-completion-tasks?limit=100&offset=${pageParam}`, { showGlobalLoader: false }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.offset + lastPage.items.length < lastPage.total
      ? lastPage.offset + lastPage.items.length : undefined,
    staleTime: 15_000
  });
  const queueItems = queue.data?.pages.flatMap(page => page.items) ?? [];
  const queuedSummary = queueItems.find(item => item.projectId === selectedId) ?? null;
  const direct = useQuery({ queryKey: [...queueKey, "detail", selectedId], queryFn: () => apiClient.get<Summary>(`/admin/projects/${encodeURIComponent(selectedId!)}/completion`), enabled: Boolean(selectedId && !queuedSummary), retry: false });
  const denied = direct.error instanceof ApiError && [401, 403, 404].includes(direct.error.status);
  const summary = denied ? null : queuedSummary ?? direct.data ?? null;
  const stale = staleDecision || queue.isError || Boolean(!queuedSummary && direct.isError);
  const refresh = async () => { await Promise.all([queue.refetch(), ...(!queuedSummary ? [direct.refetch()] : [])]); setStaleDecision(false); };
  const onError = async (error: unknown) => { if (error instanceof ApiError && [401,403,404,409].includes(error.status)) { setStaleDecision(true); await Promise.all([queryClient.invalidateQueries({ queryKey: queueKey }), refreshProcurementLifecycle(queryClient)]); } };
  const selectedScopeLine = summary?.scope.find(line => line.sourceLineItemKey === exceptionLine) ?? null;
  const exception = useMutation({
    mutationFn: (item: Summary) => apiClient.post(`/admin/projects/${encodeURIComponent(item.projectId)}/scope-exceptions`, { sourceLineItemKey: exceptionLine, kind: exceptionKind, reason: reason.trim(), expectedAuthorityVersion: item.completionAuthorityVersion, idempotencyKey: commandKey([item.projectId, item.completionAuthorityVersion, exceptionLine, exceptionKind, reason.trim()]) }),
    onSuccess: async (_result, item) => { setNotice("Scope decision recorded."); setExceptionLine(null); setReason(""); await Promise.all([queryClient.invalidateQueries({ queryKey: queueKey }), queryClient.invalidateQueries({ queryKey: projectStatusKeys.project(item.projectId) }), refreshProcurementLifecycle(queryClient)]); }, onError
  });
  const completion = useMutation({
    mutationFn: (item: Summary) => apiClient.post(`/admin/projects/${encodeURIComponent(item.projectId)}/complete`, { expectedAuthorityVersion: item.completionAuthorityVersion, idempotencyKey: commandKey(["complete", item.projectId, item.completionAuthorityVersion]) }),
    onSuccess: async (_result, item) => { setSelectedId(null); setNotice(`${item.projectName} marked completed.`); await Promise.all([queryClient.invalidateQueries({ queryKey: queueKey }), queryClient.invalidateQueries({ queryKey: projectStatusKeys.project(item.projectId) }), queryClient.invalidateQueries({ queryKey: ["admin", "projects"] }), refreshProcurementLifecycle(queryClient)]); }, onError
  });
  const accessRevoked = [queue.error, direct.error, exception.error, completion.error].some(error => error instanceof ApiError && [401, 403, 404].includes(error.status));
  if (accessRevoked) return <p role="alert">Project completion records are no longer available to your account.</p>;
  return <section className="project-completion-page" aria-labelledby="project-completion-title">
    <PageHeader id="project-completion-title" eyebrow="Final approval" title="Project completion" description="Close a project after Procurement readiness, resolved scope and Client acceptance of Site Manager completion." breadcrumb={<Link to="/admin/projects">Back to projects</Link>} />
    {notice ? <p role="status" className="project-completion-page__notice">{notice}</p> : null}
    {queue.isPending && !selectedId ? <p role="status">Loading final project tasks…</p> : queue.isError && !queueItems.length && !selectedId ? <div role="alert">Final tasks could not be loaded. <button type="button" onClick={() => void queue.refetch()}>Try again</button></div> : !queueItems.length && !selectedId ? <p>No projects are awaiting final completion review.</p> : <div className="project-completion-page__layout">
      <nav aria-label="Projects awaiting completion">{queueItems.map(item => <button type="button" key={item.projectId} className={selectedId === item.projectId ? "is-selected" : ""} onClick={() => { setSelectedId(item.projectId); setExceptionLine(null); setNotice(""); setStaleDecision(false); }}><strong>{item.projectName}</strong><span>{item.readyForCompletion ? "Ready for final approval" : `Pending with ${item.pendingOwner.replaceAll("_", " ")}`}</span></button>)}{queue.hasNextPage ? <button type="button" disabled={queue.isFetchingNextPage} onClick={() => void queue.fetchNextPage()}>{queue.isFetchingNextPage ? "Loading more projects…" : "Load more projects"}</button> : null}{queue.isFetchNextPageError ? <p role="alert">More projects could not be loaded. Try again.</p> : null}</nav>
      <div className="project-completion-page__detail">{!summary ? selectedId ? <p role={direct.isError ? "alert" : "status"}>{direct.isError ? denied ? "This project completion record is not available to your account." : "Project completion could not be loaded." : "Loading selected project completion…"}{direct.isError && !denied ? <button type="button" onClick={() => void direct.refetch()}>Retry selected project</button> : null}</p> : <p>Select a project to inspect its final task.</p> : <>
        <div className="project-completion-page__detail-head"><div><p>Final task</p><h2>{summary.projectName}</h2></div><div className="project-status-header-actions"><Link to={`/admin/projects/${encodeURIComponent(summary.projectId)}`}>Open project</Link>{summary.projectId ? <ProjectStatusButton projectId={summary.projectId} projectName={summary.projectName} presentation="chip" /> : null}</div></div>
        <p><Link to={`/admin/procurement/projects/${encodeURIComponent(summary.projectId)}/lifecycle?tab=signoff`}>Review Procurement readiness and closeout history</Link></p>
        {stale ? <p role="alert">Project records changed or could not be refreshed. Check the current blockers before deciding. <button type="button" onClick={() => void refresh()}>Refresh completion records</button></p> : null}
        <dl className="project-completion-page__counts"><div><dt>Scope covered</dt><dd>{summary.scope.filter(line => line.status !== "uncovered").length} / {summary.scope.length}</dd></div><div><dt>Client completion</dt><dd>{summary.siteCompletion?.status === "client_approved" ? "Accepted" : summary.siteCompletion?.status === "pending_client" ? "Awaiting review" : "Pending"}</dd></div></dl>
        {summary.blockers.length ? <section aria-label="Completion blockers"><h3>Before completion</h3><ul>{summary.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blocker.message}{blocker.procurementTab ? <> <Link to={`/admin/procurement/projects/${encodeURIComponent(summary.projectId)}/lifecycle?tab=${encodeURIComponent(blocker.procurementTab)}${blocker.entityId ? `&entity=${encodeURIComponent(blocker.entityId)}` : ""}`}>Open Procurement action</Link></> : null}</li>)}</ul></section> : <p role="status" className="project-completion-page__ready">The Client accepted completion. Final approval is available.</p>}
        <section aria-label="Approved estimate scope"><h3>Scope register</h3><div className="project-completion-page__scope">{summary.scope.map(line => <article key={line.sourceLineItemKey}><div><strong>{line.roomName} · {line.specification}</strong><span>Section {line.sourceSectionId}</span></div><span>{line.status === "approved_order" ? `${line.approvedOrderLineCount} approved order line${line.approvedOrderLineCount === 1 ? "" : "s"}` : line.status === "exception" ? `Exception: ${line.exception?.kind.replaceAll("_", " ")}` : line.status === "not_required" ? "No paid work required (₹0 estimate)" : "Uncovered"}</span>{line.status === "uncovered" ? <button type="button" onClick={() => { setExceptionLine(line.sourceLineItemKey); setReason(""); exception.reset(); }}>Record scope decision</button> : null}</article>)}</div></section>
        {exceptionLine && selectedScopeLine ? <form className="project-completion-page__exception" onSubmit={event => { event.preventDefault(); if (summary && !stale && reason.trim().length >= 10) exception.mutate(summary); }}><h3>Scope decision</h3><p>Approved estimate line: {selectedScopeLine.roomName} · {selectedScopeLine.specification}</p><label htmlFor="scope-exception-kind">Decision</label><select id="scope-exception-kind" value={exceptionKind} onChange={event => setExceptionKind(event.target.value as typeof exceptionKind)}><option value="not_applicable">Not applicable</option><option value="externally_fulfilled">Fulfilled outside this order</option></select><label htmlFor="scope-exception-reason">Reason</label><textarea id="scope-exception-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={2000} rows={3} required /><div><button type="button" onClick={() => setExceptionLine(null)}>Cancel</button><button type="submit" disabled={stale || exception.isPending || reason.trim().length < 10}>Record decision</button></div>{exception.isError ? <p role="alert">{exception.error instanceof Error ? exception.error.message : "Decision could not be saved."} Refresh and try again.</p> : null}</form> : null}
        <div className="project-completion-page__footer"><p>Only Super Admin can make the final completion decision. The project end date is recorded with it.</p><button type="button" disabled={stale || !summary.readyForCompletion || completion.isPending || Boolean(exceptionLine)} onClick={() => completion.mutate(summary)}>Mark project completed</button></div>{completion.isError ? <p role="alert">{completion.error instanceof Error ? completion.error.message : "Project could not be completed."} Refresh and check the latest scope.</p> : null}
      </>}</div>
    </div>}
  </section>;
}
