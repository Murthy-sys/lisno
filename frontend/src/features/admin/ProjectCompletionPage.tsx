import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";
import { PageHeader } from "../../components/ui/PageHeader";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import "./projectCompletion.css";

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
  blockers: Array<{ code: string; message: string; sourceLineItemKey?: string }>;
  pendingOwner: "procurement" | "super_admin" | "site_manager" | "vendor" | "client" | "none";
  readyForCompletion: boolean;
  completedAt: string | null;
}
interface Page { items: Summary[]; total: number; limit: number; offset: number }
const queueKey = ["admin", "project-completion-tasks"] as const;

export function ProjectCompletionPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const summary = queueItems.find(item => item.projectId === selectedId) ?? null;
  const selectedScopeLine = summary?.scope.find(line => line.sourceLineItemKey === exceptionLine) ?? null;
  const exception = useMutation({
    mutationFn: (item: Summary) => apiClient.post(`/admin/projects/${encodeURIComponent(item.projectId)}/scope-exceptions`, { sourceLineItemKey: exceptionLine, kind: exceptionKind, reason: reason.trim(), expectedAuthorityVersion: item.completionAuthorityVersion, idempotencyKey: crypto.randomUUID() }),
    onSuccess: async (_result, item) => { setNotice("Scope decision recorded."); setExceptionLine(null); setReason(""); await Promise.all([queryClient.invalidateQueries({ queryKey: queueKey }), queryClient.invalidateQueries({ queryKey: projectStatusKeys.project(item.projectId) })]); }
  });
  const completion = useMutation({
    mutationFn: (item: Summary) => apiClient.post(`/admin/projects/${encodeURIComponent(item.projectId)}/complete`, { expectedAuthorityVersion: item.completionAuthorityVersion, idempotencyKey: crypto.randomUUID() }),
    onSuccess: async (_result, item) => { setSelectedId(null); setNotice(`${item.projectName} marked completed.`); await Promise.all([queryClient.invalidateQueries({ queryKey: queueKey }), queryClient.invalidateQueries({ queryKey: projectStatusKeys.project(item.projectId) }), queryClient.invalidateQueries({ queryKey: ["admin", "projects"] })]); }
  });
  return <section className="project-completion-page" aria-labelledby="project-completion-title">
    <PageHeader id="project-completion-title" eyebrow="Final approval" title="Project completion" description="Close a project after approved scope is resolved and the Client accepts the Site Manager's completion." breadcrumb={<Link to="/admin/projects">Back to projects</Link>} />
    {notice ? <p role="status" className="project-completion-page__notice">{notice}</p> : null}
    {queue.isPending ? <p role="status">Loading final project tasks…</p> : queue.isError && !queueItems.length ? <div role="alert">Final tasks could not be loaded. <button type="button" onClick={() => void queue.refetch()}>Try again</button></div> : !queueItems.length ? <p>No projects are awaiting final completion review.</p> : <div className="project-completion-page__layout">
      <nav aria-label="Projects awaiting completion">{queueItems.map(item => <button type="button" key={item.projectId} className={selectedId === item.projectId ? "is-selected" : ""} onClick={() => { setSelectedId(item.projectId); setExceptionLine(null); setNotice(""); }}><strong>{item.projectName}</strong><span>{item.readyForCompletion ? "Ready for final approval" : `Pending with ${item.pendingOwner.replaceAll("_", " ")}`}</span></button>)}{queue.hasNextPage ? <button type="button" disabled={queue.isFetchingNextPage} onClick={() => void queue.fetchNextPage()}>{queue.isFetchingNextPage ? "Loading more projects…" : "Load more projects"}</button> : null}{queue.isFetchNextPageError ? <p role="alert">More projects could not be loaded. Try again.</p> : null}</nav>
      <div className="project-completion-page__detail">{!summary ? <p>Select a project to inspect its final task.</p> : <>
        <div className="project-completion-page__detail-head"><div><p>Final task</p><h2>{summary.projectName}</h2></div><Link to={`/admin/projects/${encodeURIComponent(summary.projectId)}`}>Open project</Link></div>
        <dl className="project-completion-page__counts"><div><dt>Scope covered</dt><dd>{summary.scope.filter(line => line.status !== "uncovered").length} / {summary.scope.length}</dd></div><div><dt>Site progress</dt><dd>{summary.siteCompletion?.progress ?? 0}%</dd></div><div><dt>Client completion</dt><dd>{summary.siteCompletion?.status === "client_approved" ? "Accepted" : summary.siteCompletion?.status === "pending_client" ? "Awaiting review" : "Pending"}</dd></div></dl>
        {summary.blockers.length ? <section aria-label="Completion blockers"><h3>Before completion</h3><ul>{summary.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blocker.message}</li>)}</ul></section> : <p role="status" className="project-completion-page__ready">The Client accepted completion. Final approval is available.</p>}
        <section aria-label="Approved estimate scope"><h3>Scope register</h3><div className="project-completion-page__scope">{summary.scope.map(line => <article key={line.sourceLineItemKey}><div><strong>{line.roomName} · {line.specification}</strong><span>Section {line.sourceSectionId}</span></div><span>{line.status === "approved_order" ? `${line.approvedOrderLineCount} approved order line${line.approvedOrderLineCount === 1 ? "" : "s"}` : line.status === "exception" ? `Exception: ${line.exception?.kind.replaceAll("_", " ")}` : line.status === "not_required" ? "No paid work required (₹0 estimate)" : "Uncovered"}</span>{line.status === "uncovered" ? <button type="button" onClick={() => { setExceptionLine(line.sourceLineItemKey); setReason(""); exception.reset(); }}>Record scope decision</button> : null}</article>)}</div></section>
        {exceptionLine && selectedScopeLine ? <form className="project-completion-page__exception" onSubmit={event => { event.preventDefault(); if (summary && reason.trim().length >= 10) exception.mutate(summary); }}><h3>Scope decision</h3><p>Approved estimate line: {selectedScopeLine.roomName} · {selectedScopeLine.specification}</p><label htmlFor="scope-exception-kind">Decision</label><select id="scope-exception-kind" value={exceptionKind} onChange={event => setExceptionKind(event.target.value as typeof exceptionKind)}><option value="not_applicable">Not applicable</option><option value="externally_fulfilled">Fulfilled outside this order</option></select><label htmlFor="scope-exception-reason">Reason</label><textarea id="scope-exception-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={2000} rows={3} required /><div><button type="button" onClick={() => setExceptionLine(null)}>Cancel</button><button type="submit" disabled={exception.isPending || reason.trim().length < 10}>Record decision</button></div>{exception.isError ? <p role="alert">{exception.error instanceof Error ? exception.error.message : "Decision could not be saved."} Refresh and try again.</p> : null}</form> : null}
        <div className="project-completion-page__footer"><p>Only Super Admin can make the final completion decision. The project end date is recorded with it.</p><button type="button" disabled={!summary.readyForCompletion || completion.isPending || Boolean(exceptionLine)} onClick={() => completion.mutate(summary)}>Mark project completed</button></div>{completion.isError ? <p role="alert">{completion.error instanceof Error ? completion.error.message : "Project could not be completed."} Refresh and check the latest scope.</p> : null}
      </>}</div>
    </div>}
  </section>;
}
