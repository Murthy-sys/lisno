import { ProjectStatusButton } from "../project-status/ProjectStatusButton";
import { ProjectId } from "../../components/projects/ProjectId";
import { PMCounterpartPanel } from "../project-manager/PMCounterpartPanel";
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
import { executionDate, executionLabel, executionTime } from "../execution/executionPresentation";
import { currentVendorReport } from "../vendor/vendorWorkflowPresentation";
import { procurementError } from "../procurement/procurementPresentation";
import { SiteManagerProjectActions } from "./SiteManagerProjectActions";
import { SiteManagerNavigationGuard } from "./SiteManagerNavigationGuard";
import { isSiteAccessError, SiteExecutionSummary, SitePagination, siteManagerReturnPath, siteOffset, sitePageSize, siteWorkAction, siteWorkStatus, siteWorkStatusLabels } from "./siteManagerPresentation";
import "../execution/execution.css";
import "./site-manager.css";

export function SiteManagerProjectPage({ projectId: suppliedProjectId, embedded = false, showProjectIdentity = !embedded, preserveProjectTabs = false }: { projectId?: string; embedded?: boolean; showProjectIdentity?: boolean; preserveProjectTabs?: boolean }) {
  const { projectId: routeProjectId } = useParams();
  const projectId = suppliedProjectId ?? routeProjectId;
  return projectId ? <SelectedSiteProject key={projectId} projectId={projectId} embedded={embedded} showProjectIdentity={showProjectIdentity} preserveProjectTabs={preserveProjectTabs} /> : <PageState state="error" message="Choose a project to view its execution." />;
}

function SelectedSiteProject({ projectId, embedded, showProjectIdentity, preserveProjectTabs }: { projectId: string; embedded: boolean; showProjectIdentity: boolean; preserveProjectTabs: boolean }) {
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
  const [teamOpen, setTeamOpen] = useState(false);
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
    setParams(old => { const next = new URLSearchParams(old); if (embedded && !preserveProjectTabs) next.set("detail", "1"); value ? next.set(key, value) : next.delete(key); if (!["offset", "assignment"].includes(key)) next.delete("offset"); return next; }, { replace: true, state: location.state });
  }
  function open(work: ExecutionWork) { setInitialAction(siteWorkAction(work).action); filter("assignment", work.id); }
  return <div className="site-workspace">
    <SiteManagerNavigationGuard dirty={!denied && (detailDirty || projectDirty)} busy={!denied && (detailBusy || projectBusy)} allowedClose={allowedClose} />
    {!embedded ? <Link className="site-workspace__back" to={returnTo}>Back to assigned projects</Link> : null}
    {denied ? <PageState state="error" message="You no longer have access to this project." /> : <>
      <header className="site-workspace__heading"><div>{embedded ? <h2>{showProjectIdentity && project ? project.name : "Work monitoring"}</h2> : <h1>{project?.name ?? "Work monitoring"}</h1>}{project && showProjectIdentity ? <ProjectId projectNumber={project.projectNumber} /> : null}{project ? <p className="site-workspace__muted">{executionLabel(project.status)}</p> : null}</div><div className="site-workspace__controls project-status-header-actions">{!embedded && project ? <ProjectStatusButton projectId={project.id} projectName={project.name} presentation="chip" /> : null}<ExecutionConnection state={connection} /><Button size="compact" variant="secondary" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh project</Button>{project ? <SiteManagerProjectActions disabled={query.isError} project={project} onDirty={setProjectDirty} onBusy={setProjectBusy} canManagePolicy={data?.canManagePolicy ?? false} /> : null}</div></header>
      <details className="site-workspace__team" onToggle={event => setTeamOpen(event.currentTarget.open)}><summary>Project team</summary>{teamOpen ? <PMCounterpartPanel projectId={projectId} /> : null}</details>
      {query.isError && data ? <InlineMessage tone="warning">Refresh failed. Project information may be out of date. Retry before making a decision.</InlineMessage> : null}
      {data?.projectCounts ? <SiteExecutionSummary counts={data.projectCounts} compact /> : query.isPending ? <p role="status">Loading project statistics…</p> : query.isError ? null : <InlineMessage tone="warning">Project statistics are unavailable. Refresh this project.</InlineMessage>}
      {query.isError && !data ? <PageState state="error" message={procurementError(query.error, "Project execution could not be loaded.")} action={{ label: "Try again", onAction: () => void query.refetch() }} /> : <section aria-labelledby="site-project-vendor-work" className="site-workspace__work">
        <h2 id="site-project-vendor-work" className="sr-only">Project vendor work</h2>
        <div className="site-workspace__filters">
          <Field id="site-work-search" label="Search vendor or Main Line">{props => <Input {...props} type="search" maxLength={200} value={filters.q ?? ""} onChange={event => filter("q", event.target.value)} />}</Field>
          <Field id="site-work-status" label="Work status">{props => <Select {...props} value={filters.status ?? ""} onChange={event => filter("status", event.target.value)}><option value="">All statuses</option>{Object.entries(siteWorkStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>}</Field>
          <details className="site-workspace__more-filters"><summary>More filters{filters.flag ? " (1 active)" : ""}</summary><Field id="site-work-attention" label="Needs attention">{props => <Select {...props} value={filters.flag ?? ""} onChange={event => filter("flag", event.target.value)}><option value="">All assignments</option><option value="blocked">On hold</option><option value="missing_update">Missing update</option><option value="overdue">Overdue</option><option value="setup_required">Needs setup</option></Select>}</Field></details>
        </div>
        {loadingRows ? <PageState state="loading" message="Loading vendor work…" /> : query.isError && !rows ? <PageState state="error" message="Vendor work could not be refreshed." action={{ label: "Retry vendor work", onAction: () => void query.refetch() }} /> : rows ? <>
          {rows.items.length ? <ul className="site-workspace__work-list" aria-label="Vendor work">{rows.items.map(work => <li key={work.id}><WorkRow work={work} onOpen={() => open(work)} disabled={query.isError} /></li>)}</ul> : <PageState state="empty" message={filters.q || filters.flag || filters.status ? "No vendor work matches these filters." : "No issued vendor work for this project yet."} />}
          <SitePagination offset={rows.offset} count={rows.items.length} total={rows.total} busy={query.isFetching} onChange={offset => filter("offset", String(offset))} />
        </> : null}
      </section>}
      {selected && project ? <ExecutionDetailPanel key={selected} assignmentId={selected} vendor={false} compact managerMonitoring onDirty={setDetailDirty} onBusy={setDetailBusy} initialAction={initialAction} expectedProjectId={projectId} onClose={() => { allowedClose.current = true; setDetailDirty(false); filter("assignment", ""); setInitialAction(undefined); }} /> : null}
    </>}
  </div>;
}

function WorkRow({ work, onOpen, disabled }: { work: ExecutionWork; onOpen: () => void; disabled: boolean }) {
  const action = siteWorkAction(work);
  const report = currentVendorReport(work);
  const holdReason = work.hold?.reason ?? (work.status === "blocked" ? report?.reason : null);
  const review = work.status === "awaiting_verification" ? "Awaiting your verification"
    : work.status === "awaiting_client" ? "Awaiting Client acceptance"
    : work.status === "changes_requested" ? "Fresh verification required" : null;
  const photos = (work.submission?.imageIds ?? work.imageIds).length;
  const missingUpdate = work.daily.state === "missing" || work.flags.includes("missing_update");
  return <article className="site-workspace__monitoring-row" aria-label={`${work.itemName}, ${work.vendorName}, ${work.orderNumber}`}>
    <div className="site-workspace__identity">
      <h3>{work.itemName}</h3><p>{work.vendorName}{work.roomName ? ` · ${work.roomName}` : ""}</p>
      <div className="site-workspace__work-status"><span className="execution__status" data-status={work.status}>{siteWorkStatus(work)}</span>{review ? <small>{review}</small> : null}</div>
      {!work.sourceAvailable ? <small>Issued source unavailable. Contact the project team before making changes.</small> : null}
      {work.tracking === "setup_required" ? <small>Tracking must be enabled before work updates can begin.</small> : null}
    </div>
    <div className="site-workspace__report">
      {report ? <><time className="site-workspace__muted" dateTime={report.reportedAt}>Last update {executionTime(report.reportedAt, work.timezone)}</time><p>{holdReason === report.note ? <><strong>Hold reason:</strong> </> : null}{report.note}</p></> : <p className="site-workspace__muted">No vendor update for the current round.</p>}
      {holdReason && holdReason !== report?.note ? <p><strong>Hold reason:</strong> {holdReason}</p> : null}
      {missingUpdate ? <small className="site-workspace__attention">Vendor update missing</small> : null}
      <small>{photos} {photos === 1 ? "photo" : "photos"}{work.hold ? ` · Hold review ${executionDate(work.hold.reviewDate)}` : ""}</small>
    </div>
    <div className="site-workspace__row-action">
      <p className="site-workspace__finish">{work.schedule ? <>Finish <strong>{executionDate(work.schedule.finishDate)}</strong></> : "Finish date not confirmed"}{work.flags.includes("overdue") ? <span className="site-workspace__attention"> · Overdue</span> : null}</p>
      {work.proposedSchedule ? <p className="site-workspace__proposal"><strong>Schedule proposed</strong><small>{executionDate(work.proposedSchedule.startDate)} to {executionDate(work.proposedSchedule.finishDate)}</small></p> : null}
      <Button size="compact" variant="secondary" disabled={disabled} onClick={onOpen} aria-label={`${action.label}: ${work.itemName}, ${work.vendorName}`}>{action.label}</Button>
    </div>
  </article>;
}
