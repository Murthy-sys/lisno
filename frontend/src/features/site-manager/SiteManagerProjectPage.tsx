import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { ExecutionDetailPanel } from "../execution/ExecutionDetailPanel";
import { useExecutionConnection } from "../execution/ExecutionLiveProvider";
import { ExecutionConnection } from "../execution/ExecutionWorkspace";
import { executionApi, executionKeys, type ExecutionAction, type ExecutionPage, type ExecutionQuery, type ExecutionWork } from "../execution/executionApi";
import { executionDate, executionLabel, executionStatusLabels, executionTime } from "../execution/executionPresentation";
import { procurementError } from "../procurement/procurementPresentation";
import { SiteManagerProjectActions } from "./SiteManagerProjectActions";
import { SiteManagerNavigationGuard } from "./SiteManagerNavigationGuard";
import { isSiteAccessError, SiteExecutionSummary, SitePagination, siteManagerReturnPath, siteOffset, sitePageSize, siteWorkAction } from "./siteManagerPresentation";
import "../execution/execution.css";
import "./site-manager.css";

export function SiteManagerProjectPage({ projectId: suppliedProjectId }: { projectId?: string }) {
  const { projectId: routeProjectId } = useParams();
  const projectId = suppliedProjectId ?? routeProjectId;
  return projectId ? <SelectedSiteProject key={projectId} projectId={projectId} /> : <PageState state="error" message="Choose a project to view its execution." />;
}

function SelectedSiteProject({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const location = useLocation();
  const connection = useExecutionConnection();
  const [params, setParams] = useSearchParams();
  const [initialAction, setInitialAction] = useState<ExecutionAction>();
  const [lastData, setLastData] = useState<ExecutionPage>();
  const [detailDirty, setDetailDirty] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [projectDirty, setProjectDirty] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [accessRemoved, setAccessRemoved] = useState(false);
  const allowedClose = useRef(false);
  const view = params.get("view") === "updates" ? "updates" : "progress";
  const filters: ExecutionQuery = { limit: sitePageSize, offset: siteOffset(params.get("offset")), q: params.get("q")?.slice(0, 200) || undefined, status: params.get("status") || undefined, flag: params.get("flag") || undefined };
  const query = useQuery({ queryKey: executionKeys.project(projectId, filters), queryFn: ({ signal }) => executionApi.project(projectId, filters, signal),
    enabled: !accessRemoved,
    placeholderData: previous => previous?.project?.id === projectId ? previous : undefined,
    refetchInterval: connection === "live" || connection === "denied" ? false : 15_000, refetchIntervalInBackground: false,
    retry: (count, error) => !isSiteAccessError(error) && count < 1 });
  const denied = accessRemoved || isSiteAccessError(query.error) || connection === "denied";
  useEffect(() => {
    if (!denied || accessRemoved) return;
    setAccessRemoved(true);
    const workIds = new Set((query.data ?? lastData)?.items.map(work => work.id) ?? []);
    const predicate = (cached: { queryKey: readonly unknown[]; state: { data: unknown } }) => {
      const key = cached.queryKey;
      return (key[0] === "execution" && ((key[1] === "project" && key[2] === projectId) || (["detail", "history"].includes(String(key[1])) && (workIds.has(String(key[2])) || (cached.state.data as ExecutionWork | undefined)?.projectId === projectId)))) || (key[0] === "site-completion" && key[1] === projectId);
    };
    void client.cancelQueries({ predicate });
    client.removeQueries({ predicate });
  }, [accessRemoved, client, denied, lastData, projectId, query.data]);
  useEffect(() => { if (denied) setLastData(undefined); else if (query.data?.project?.id === projectId && !query.isPlaceholderData) setLastData(query.data); }, [denied, projectId, query.data, query.isPlaceholderData]);
  const data = denied ? undefined : query.data ?? lastData;
  const project = data?.project?.id === projectId ? data.project : undefined;
  const selected = params.get("assignment");
  const loadingRows = query.isPending || query.isPlaceholderData;
  const rows = !loadingRows && query.data?.project?.id === projectId ? query.data : undefined;
  const returnTo = siteManagerReturnPath((location.state as { siteManagerReturnTo?: unknown } | null)?.siteManagerReturnTo);
  function filter(key: string, value: string) {
    setParams(old => { const next = new URLSearchParams(old); value ? next.set(key, value) : next.delete(key); if (!["offset", "assignment"].includes(key)) next.delete("offset"); return next; }, { replace: true, state: location.state });
  }
  function open(work: ExecutionWork) { setInitialAction(siteWorkAction(work).action); filter("assignment", work.id); }
  return <div className="site-workspace">
    <SiteManagerNavigationGuard dirty={!denied && (detailDirty || projectDirty)} busy={!denied && (detailBusy || projectBusy)} allowedClose={allowedClose} />
    <Link className="site-workspace__back" to={returnTo}>Back to assigned projects</Link>
    {denied ? <PageState state="error" message="You no longer have access to this project." /> : <>
      <header className="site-workspace__heading"><div><h1>{project?.name ?? "Project execution"}</h1>{project ? <p className="site-workspace__muted">{executionLabel(project.status)}</p> : null}</div><div className="site-workspace__controls"><ExecutionConnection state={connection} /><Button size="compact" variant="secondary" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh project</Button>{project ? <SiteManagerProjectActions disabled={query.isError} project={project} onDirty={setProjectDirty} onBusy={setProjectBusy} canManagePolicy={data?.canManagePolicy ?? false} /> : null}</div></header>
      {query.isError && data ? <InlineMessage tone="warning">Refresh failed. Project information may be out of date. Retry before making a decision.</InlineMessage> : null}
      {data?.projectCounts ? <SiteExecutionSummary counts={data.projectCounts} /> : query.isPending ? <p role="status">Loading project statistics…</p> : query.isError ? null : <InlineMessage tone="warning">Project statistics are unavailable. Refresh this project.</InlineMessage>}
      {query.isError && !data ? <PageState state="error" message={procurementError(query.error, "Project execution could not be loaded.")} action={{ label: "Try again", onAction: () => void query.refetch() }} /> : <section aria-labelledby="site-project-vendor-work" className="site-workspace__work">
        <h2 id="site-project-vendor-work" className="sr-only">Project vendor work</h2>
        <div className="site-workspace__views" role="group" aria-label="Work view"><Button size="compact" variant={view === "progress" ? "primary" : "secondary"} aria-pressed={view === "progress"} onClick={() => filter("view", "")}>Vendor progress</Button><Button size="compact" variant={view === "updates" ? "primary" : "secondary"} aria-pressed={view === "updates"} onClick={() => filter("view", "updates")}>Vendor updates &amp; blockers</Button></div>
        <div className="site-workspace__filters"><Field id="site-work-search" label="Search vendor or Main Line">{props => <Input {...props} type="search" maxLength={200} value={filters.q ?? ""} onChange={event => filter("q", event.target.value)} />}</Field><Field id="site-work-status" label="Work status">{props => <Select {...props} value={filters.status ?? ""} onChange={event => filter("status", event.target.value)}><option value="">All statuses</option>{Object.entries(executionStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>}</Field><Field id="site-work-attention" label="Needs attention">{props => <Select {...props} value={filters.flag ?? ""} onChange={event => filter("flag", event.target.value)}><option value="">All assignments</option><option value="blocked">Blocked</option><option value="missing_update">Missing update</option><option value="overdue">Overdue</option><option value="setup_required">Needs setup</option></Select>}</Field></div>
        {loadingRows ? <PageState state="loading" message="Loading vendor work…" /> : query.isError && !rows ? <PageState state="error" message="Vendor work could not be refreshed." action={{ label: "Retry vendor work", onAction: () => void query.refetch() }} /> : rows ? <>
          {rows.items.length ? <ul className="site-workspace__work-list" aria-label={view === "progress" ? "Vendor progress" : "Vendor updates and blockers"}>{rows.items.map(work => <li key={work.id}>{view === "progress" ? <ProgressRow work={work} onOpen={() => open(work)} disabled={query.isError} /> : <ReportRow work={work} onOpen={() => open(work)} disabled={query.isError} />}</li>)}</ul> : <PageState state="empty" message={filters.q || filters.flag || filters.status ? "No vendor work matches these filters." : "No issued vendor work for this project yet."} />}
          <SitePagination offset={rows.offset} count={rows.items.length} total={rows.total} busy={query.isFetching} onChange={offset => filter("offset", String(offset))} />
        </> : null}
      </section>}
      {selected && project ? <ExecutionDetailPanel key={selected} assignmentId={selected} vendor={false} compact onDirty={setDetailDirty} onBusy={setDetailBusy} initialAction={initialAction} expectedProjectId={projectId} onClose={() => { allowedClose.current = true; setDetailDirty(false); filter("assignment", ""); setInitialAction(undefined); }} /> : null}
    </>}
  </div>;
}

function WorkIdentity({ work }: { work: ExecutionWork }) {
  return <div className="site-workspace__identity"><h3>{work.itemName}</h3><p>{work.vendorName}</p><small>{[work.roomName, work.mainBasketName].filter(Boolean).join(" · ")}</small><small>{work.orderNumber} · Revision {work.orderRevision}</small></div>;
}
function WorkStatus({ work }: { work: ExecutionWork }) {
  return <div className="site-workspace__work-status"><span className="execution__status" data-status={work.status}>{work.tracking === "legacy_review" && work.legacyStatus === "submitted_for_client" ? "With Client (existing review)" : executionStatusLabels[work.status]}</span><span><strong>{work.progress}%</strong> vendor reported</span>{work.verification ? <small>Site verified {executionDate(work.verification.verifiedAt)}</small> : null}{work.hold ? <small>On hold · Review {executionDate(work.hold.reviewDate)}</small> : null}{work.flags.length ? <small>{work.flags.map(executionLabel).join(" · ")}</small> : null}</div>;
}
function ProgressRow({ work, onOpen, disabled }: { work: ExecutionWork; onOpen: () => void; disabled: boolean }) {
  const action = siteWorkAction(work);
  return <article className="site-workspace__progress-row" aria-label={`${work.itemName}, ${work.vendorName}, ${work.orderNumber}`}><WorkIdentity work={work} /><WorkStatus work={work} /><div className="site-workspace__dates">{work.proposedSchedule ? <p><strong>Schedule proposed</strong><span>{executionDate(work.proposedSchedule.startDate)} to {executionDate(work.proposedSchedule.finishDate)}</span></p> : work.schedule ? <p><strong>Confirmed schedule</strong><span>{executionDate(work.schedule.startDate)} to {executionDate(work.schedule.finishDate)}</span></p> : <p>Schedule not confirmed</p>}<small>Latest report: {executionTime(work.latestReportAt, work.timezone)}</small></div><div className="site-workspace__row-action"><small>Next: {executionLabel(work.nextOwner)}</small><Button size="compact" variant="secondary" disabled={disabled} onClick={onOpen} aria-label={`${action.label}: ${work.itemName}, ${work.vendorName}`}>{action.label}</Button></div></article>;
}
function ReportRow({ work, onOpen, disabled }: { work: ExecutionWork; onOpen: () => void; disabled: boolean }) {
  const report = work.latestVendorReport;
  return <article className="site-workspace__report-row" aria-label={`${work.itemName}, ${work.vendorName}, ${work.orderNumber}`}><WorkIdentity work={work} /><div className="site-workspace__report">{report ? <><p className="site-workspace__muted">Vendor report · {executionTime(report.reportedAt, work.timezone)} · {report.progress}% · {executionLabel(report.status)}</p><p>{report.note}</p>{report.reason ? <p><strong>{work.status === "blocked" && report.status === "blocked" ? "Blocker" : "Reported reason"}:</strong> {report.reason}</p> : null}{report.nextAction ? <p><strong>{work.status === "blocked" && report.status === "blocked" ? "Next action" : "Reported next action"}:</strong> {report.nextAction}</p> : null}</> : <p className="site-workspace__muted">No vendor update for the current round.</p>}</div><div className="site-workspace__row-action"><span className="execution__status" data-status={work.status}>Current: {executionStatusLabels[work.status]}</span><Button size="compact" variant="secondary" disabled={disabled} onClick={onOpen} aria-label={`Open update: ${work.itemName}, ${work.vendorName}`}>Open work</Button></div></article>;
}
