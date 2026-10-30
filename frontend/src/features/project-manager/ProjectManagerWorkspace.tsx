import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { KpiPanel } from "../../components/kpi/KpiPanel";
import { Button } from "../../components/ui/Button";
import { ProjectExecutionPage } from "../execution/ExecutionWorkspace";
import { useExecutionConnection } from "../execution/ExecutionLiveProvider";
import { PMVendorSuggestions } from "./PMVendorSuggestions";
import { PMRequestsPanel } from "./PMRequestsPanel";
import { PMOperationsPanel } from "./PMOperationsPanel";
import { PMTargetRecord } from "./PMTargetRecord";
import { PMDashboardIcon, type PMDashboardIconName } from "./PMDashboardIcon";
import { PMDashboardProjects, type PMDashboardView } from "./PMDashboardProjects";
import { PMBadge, PMEmpty, PMIssues, PMPanelHeader, PMProgressBar, PMProgressBasis, PMQueryState, pmDate, pmLabel, pmMoney } from "./PMShared";
import { pmDenied, usePMOverview, usePMPanel, usePMPerformance, usePMPortfolio, usePMQuery, type PMFilters } from "./projectManagerApi";
import { PM_TABS, type PMAlert, type PMHealth, type PMItem, type PMPortfolio, type PMProgress, type PMTab } from "./projectManagerTypes";
import "./project-manager.css";
import "./project-manager-dashboard.css";
import "./project-manager-project-detail.css";

const TAB_LABELS: Record<PMTab, string> = { site: "Site", procurement: "Procurement", selections: "Selections", supply: "Critical Supply", vendors: "Vendors", client: "Client", snagging: "Snagging", quality: "Quality" };
const PAGE_SIZE = 20;
const healthSeverity = (health: PMHealth) => health === "critical" ? "critical" : health === "at_risk" ? "warning" : health === "on_track" || health === "completed" ? "success" : "neutral";

export function projectManagerReturnPath(value: string | null): string {
  if (!value || !/^\/execution(?:\?|$)/u.test(value) || value.includes("\\")) return "/execution";
  try { const url = new URL(value, "https://lisno.invalid"); return url.origin === "https://lisno.invalid" && url.pathname === "/execution" ? `${url.pathname}${url.search}` : "/execution"; }
  catch { return "/execution"; }
}
function projectLink(projectId: string, returnTo: string, tab: PMTab = "site", entityId?: string | null, offset?: number) {
  const query = new URLSearchParams({ tab, returnTo });
  if (entityId) query.set("entity", entityId);
  if (offset) query.set("tabOffset", String(offset));
  return `/projects/${encodeURIComponent(projectId)}/execution?${query}`;
}
function PMConnection() {
  const connection = useExecutionConnection();
  const labels = { live: "Live updates", connecting: "Connecting", polling: "Periodic refresh", offline: "Offline · details may be stale", denied: "Live access unavailable" };
  return <span className="pm-connection" role="status" data-state={connection}><span className="pm-dashboard__connection-dot" aria-hidden="true" />{labels[connection]}</span>;
}
function KPIOverview() {
  const query = usePMPerformance();
  const { user } = useAuth();
  return <section className="pm-record" aria-labelledby="pm-performance-title" id="pm-performance"><h2 id="pm-performance-title">My performance</h2>{user ? <KpiPanel userId={user.id} /> : null}<h3>Project Manager composite</h3><PMQueryState query={query}>{data => <div className="pm-performance"><PMBadge value={data.availability === "not_configured" ? "Policy not configured" : data.availability} /><p>{data.message}</p><dl className="pm-facts">{data.metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl><small>Updated {pmDate(data.calculatedAt)}</small></div>}</PMQueryState></section>;
}

export function ProjectManagerDashboard() {
  const auth = useAuth();
  const [showKpi, setShowKpi] = useState(false);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = ["current", "all", "planning", "active", "on_hold", "completed"].includes(params.get("status") ?? "") ? params.get("status")! : "current";
  const health = ["all", "critical", "at_risk", "incomplete", "setup", "on_track", "completed"].includes(params.get("health") ?? "") ? params.get("health")! : "all";
  const view: PMDashboardView = params.get("view") === "grid" ? "grid" : "list";
  const parsedOffset = Number(params.get("offset") ?? 0);
  const offset = Number.isSafeInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const filters: PMFilters = { q: q || undefined, status, health, offset, limit: PAGE_SIZE };
  const query = usePMPortfolio(filters);
  const returnTo = `${location.pathname}${location.search}`;
  function filter(key: "q" | "status" | "health", value: string) { setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); next.delete("offset"); return next; }, { replace: key === "q" }); }
  function page(nextOffset: number) { setParams(previous => { const next = new URLSearchParams(previous); if (nextOffset) next.set("offset", String(nextOffset)); else next.delete("offset"); return next; }); }
  function changeView(nextView: PMDashboardView) {
    setParams(previous => { const next = new URLSearchParams(previous); next.set("view", nextView); return next; }, { replace: true });
  }
  const kpiVisible = showKpi && !pmDenied(query.error);
  return <section className="pm-workspace pm-dashboard" aria-labelledby="pm-dashboard-title">
    <header className="pm-page-heading pm-dashboard__header">
      <div className="pm-dashboard__title"><p className="pm-eyebrow">Project Manager</p><h1 id="pm-dashboard-title">Project Dashboard</h1><p>{auth.user?.name ? `${auth.user.name} · ` : ""}{pmDate(new Date().toISOString())}</p></div>
      <div className="pm-actions pm-dashboard__actions">
        <PMConnection />
        <Button variant="secondary" size="compact" busy={query.isFetching} onClick={() => void query.refetch()}><PMDashboardIcon name="refresh" />Refresh projects</Button>
        <Button className="pm-dashboard__kpi-button" size="compact" aria-expanded={kpiVisible} aria-controls={kpiVisible ? "pm-performance" : undefined} onClick={() => setShowKpi(value => !value)}><PMDashboardIcon name="performance" />My KPI</Button>
      </div>
    </header>
    {kpiVisible ? <KPIOverview /> : null}
    <div className="pm-filters pm-dashboard__filters" role="search" aria-label="Filter projects">
      <label className="pm-dashboard__search"><span>Search projects</span><span className="pm-dashboard__search-field"><PMDashboardIcon name="search" /><input type="search" maxLength={160} value={q} placeholder="Search projects, clients or locations…" onChange={event => filter("q", event.target.value)} /></span></label>
      <label>Project status<select value={status} onChange={event => filter("status", event.target.value)}><option value="current">Current projects</option><option value="all">All projects</option><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></label>
      <label>Project health<select value={health} onChange={event => filter("health", event.target.value)}><option value="all">All health states</option><option value="at_risk">At risk, including critical</option><option value="critical">Critical</option><option value="setup">Setup</option><option value="on_track">On track</option><option value="incomplete">Incomplete source</option><option value="completed">Completed</option></select></label>
    </div>
    {query.isPending ? <DashboardLoading /> : <PMQueryState query={query}>{data => <>
      <ProjectSummary data={data} health={health} onFilter={value => filter("health", value)} />
      <div className="pm-dashboard__body">
        <PriorityAlerts data={data} filters={filters} returnTo={returnTo} />
        <section className="pm-projects pm-dashboard__projects" aria-labelledby="pm-projects-title">
          <div className="pm-section-heading">
            <div><h2 id="pm-projects-title">{health === "all" ? "All projects" : `${pmLabel(health)} projects`} <span className="pm-count">{data.total}</span></h2><p>Manage and view your assigned projects.</p></div>
            <div className="pm-dashboard__view-toggle" role="group" aria-label="Project view">
              <Button variant="secondary" size="compact" aria-label="List view" title="List view" aria-pressed={view === "list"} onClick={() => changeView("list")}><PMDashboardIcon name="list" /></Button>
              <Button variant="secondary" size="compact" aria-label="Grid view" title="Grid view" aria-pressed={view === "grid"} onClick={() => changeView("grid")}><PMDashboardIcon name="grid" /></Button>
            </div>
          </div>
          <div className="pm-dashboard__panel-scroll" role="region" aria-label="Project results" tabIndex={0} key={JSON.stringify([q, status, health, offset, view])}>
            {data.items.length ? <PMDashboardProjects projects={data.items} offset={offset} view={view} projectHref={id => projectLink(id, returnTo)} /> : <PMEmpty title={q || health !== "all" || status !== "current" ? "No matching projects" : "No assigned projects"}>{q || health !== "all" || status !== "current" ? "Adjust your search or filters to see more projects." : "Projects will appear here when you are assigned as Project Manager."}</PMEmpty>}
          </div>
          <div className="pm-dashboard__projects-footer"><span className="pm-meta">Refreshed {pmDate(data.calculatedAt)}</span><Pagination offset={offset} count={data.items.length} total={data.total} busy={query.isFetching} onChange={page} /></div>
        </section>
      </div>
    </>}</PMQueryState>}
  </section>;
}

function DashboardLoading() {
  return <div className="pm-dashboard__loading" role="status" aria-label="Loading projects">
    <p>Loading projects…</p>
    <div className="pm-dashboard__skeleton" aria-hidden="true"><div className="pm-dashboard__skeleton-metrics">{[0, 1, 2, 3].map(index => <span key={index} />)}</div><div className="pm-dashboard__skeleton-body"><span /><span /></div></div>
  </div>;
}

function ProjectSummary({ data, health, onFilter }: { data: PMPortfolio; health: string; onFilter: (health: string) => void }) {
  const metrics: Array<{ label: string; value: number; key: string; detail: string; tone: string; icon: PMDashboardIconName }> = [
    { label: "Active projects", value: data.counts.active, key: "all", detail: "All non-completed projects", tone: "active", icon: "projects" },
    { label: "At risk", value: data.counts.atRisk, key: "at_risk", detail: `${data.counts.critical} critical`, tone: "risk", icon: "warning" },
    { label: "Setup", value: data.counts.setup, key: "setup", detail: "Preparing to start", tone: "setup", icon: "setup" },
    { label: "On track", value: data.counts.onTrack, key: "on_track", detail: "No current risk identified", tone: "track", icon: "check" },
  ];
  return <section className="pm-summary" aria-label="Project summary">
    <div className="pm-summary__metrics">{metrics.map(metric => <button type="button" className="pm-summary__metric" key={metric.key} data-tone={metric.tone} aria-pressed={health === metric.key} onClick={() => onFilter(metric.key)}>
      <span className="pm-dashboard__metric-icon"><PMDashboardIcon name={metric.icon} /></span><span className="pm-dashboard__metric-copy"><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></span>
    </button>)}</div>
    <div className="pm-summary__caption"><span>Counts follow search and project status, before health filtering.</span>{data.counts.incomplete ? <button type="button" onClick={() => onFilter("incomplete")}>{data.counts.incomplete} with incomplete source data</button> : null}</div>
  </section>;
}
function PriorityAlerts({ data, filters, returnTo }: { data: PMPortfolio; filters: PMFilters; returnTo: string }) {
  const [expanded, setExpanded] = useState(false), [offset, setOffset] = useState(0);
  const queryParams = new URLSearchParams({ status: filters.status ?? "current", health: filters.health ?? "all", offset: String(offset), limit: String(PAGE_SIZE) });
  if (filters.q) queryParams.set("q", filters.q);
  const query = usePMQuery<{ items: PMAlert[]; total: number }>(`/project-manager/alerts?${queryParams}`, expanded);
  useEffect(() => { setOffset(0); }, [filters.q, filters.status, filters.health]);
  const scrollKey = JSON.stringify([filters.q, filters.status, filters.health, offset]);
  return <section className="pm-alerts pm-dashboard__alerts" aria-labelledby="pm-alerts-title"><div className="pm-section-heading"><div className="pm-dashboard__alert-heading"><span className="pm-dashboard__alert-icon"><PMDashboardIcon name="bell" /></span><div><h2 id="pm-alerts-title">Priority alerts <span className="pm-count">{data.alertTotal}</span></h2><p>Open an item to review its project context.</p></div></div>{data.alertTotal > data.alerts.length || expanded ? <Button variant="quiet" size="compact" onClick={() => setExpanded(value => !value)}>{expanded ? "Show preview" : `View all ${data.alertTotal}`}</Button> : null}</div>{expanded ? <PMQueryState query={query}>{all => <><AlertList key={scrollKey} alerts={all.items} returnTo={returnTo} /><Pagination offset={offset} count={all.items.length} total={all.total} busy={query.isFetching} onChange={setOffset} /></>}</PMQueryState> : <AlertList key={scrollKey} alerts={data.alerts} returnTo={returnTo} />}</section>;
}
function AlertList({ alerts, returnTo }: { alerts: PMAlert[]; returnTo: string }) { return <div className="pm-dashboard__panel-scroll" role="region" aria-label="Priority alert items" tabIndex={0}>{alerts.length ? <ul className="pm-alert-list">{alerts.map(alert => <li key={alert.id}><Link to={projectLink(alert.projectId, returnTo, alert.tab, alert.entityId, alert.offset)}><PMBadge value={alert.severity === "critical" ? "Critical" : "Needs attention"} severity={alert.severity} /><div className="pm-dashboard__alert-content"><strong>{alert.title}</strong><p>{alert.detail}</p></div><span className="pm-alert-list__project">{alert.projectName}<small>{TAB_LABELS[alert.tab]}</small></span><PMDashboardIcon name="chevron" className="pm-dashboard__alert-chevron" /></Link></li>)}</ul> : <p className="pm-quiet-state">No current priority alerts in this view.</p>}</div>; }
function Pagination({ offset, count, total, busy, onChange }: { offset: number; count: number; total: number; busy: boolean; onChange: (offset: number) => void }) { return total > PAGE_SIZE || offset ? <div className="pm-pagination"><span>{total ? `${Math.min(offset + 1, total)}–${Math.min(offset + count, total)} of ${total}` : "0 results"}</span><div className="pm-actions"><Button size="compact" variant="secondary" disabled={!offset || busy} onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}>Previous</Button><Button size="compact" variant="secondary" disabled={offset + count >= total || busy} onClick={() => onChange(offset + PAGE_SIZE)}>Next</Button></div></div> : null; }

export function ProjectManagerProjectPage({ projectId: suppliedId }: { projectId?: string }) {
  const auth = useAuth();
  const [showKpi, setShowKpi] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  const { projectId: routeId } = useParams(); const projectId = suppliedId ?? routeId ?? "";
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab"); const tab: PMTab = PM_TABS.includes(rawTab as PMTab) ? rawTab as PMTab : "site";
  const fullDetail = params.get("detail") === "1" || Boolean(params.get("assignment"));
  const returnTo = projectManagerReturnPath(params.get("returnTo"));
  const query = usePMOverview(projectId);
  const hasOverview = Boolean(query.data);
  useEffect(() => {
    const rail = navigation.current;
    const active = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !active) return;
    const bounds = rail.getBoundingClientRect(), item = active.getBoundingClientRect();
    if (item.left < bounds.left) rail.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) rail.scrollLeft += item.right - bounds.right;
  }, [tab, fullDetail, hasOverview]);
  function tabHref(next: PMTab) { const query = new URLSearchParams(params); query.set("tab", next); query.delete("detail"); query.delete("entity"); query.delete("locate"); query.delete("tabOffset"); query.delete("assignment"); return `?${query}`; }
  function detail() { setParams(previous => { const next = new URLSearchParams(previous); next.set("detail", "1"); return next; }); }
  if (!projectId) return <section className="pm-workspace pm-project-detail"><PMEmpty title="Project unavailable">Choose an assigned project from the dashboard.</PMEmpty><Link to="/execution">Dashboard</Link></section>;
  return <section className="pm-workspace pm-project-detail" aria-label="Project Manager project workspace">
    <Link to={returnTo} className="pm-back pm-project-detail__back"><PMDashboardIcon name="chevron" />All projects</Link>
    <PMQueryState query={query}>{data => <>
      <header className="pm-page-heading pm-project-heading pm-project-detail__header">
        <div className="pm-project-detail__intro">
          <p className="pm-eyebrow">Project workspace</p>
          <div className="pm-project__identity"><h1>{data.project.name}</h1><PMBadge value={data.project.health} severity={healthSeverity(data.project.health)} /></div>
          <p className="pm-project-detail__client">{[data.project.clientName, data.project.location].filter(Boolean).join(" · ") || "Project details pending"}</p>
          <dl className="pm-project-detail__metadata">
            <div><dt>Approved net value</dt><dd>{pmMoney(data.project.approvedNetPaise)}</dd></div>
            <div><dt>Target handover</dt><dd>{pmDate(data.project.plannedEndAt)}</dd></div>
          </dl>
        </div>
        <div className="pm-actions pm-project-detail__actions">
          <Link className="pm-link-button" to={`/projects/${encodeURIComponent(projectId)}/estimations?${new URLSearchParams({ returnTo: `/projects/${encodeURIComponent(projectId)}/execution?${params}` })}`}
            onClick={event => {
              if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (event.currentTarget.target && event.currentTarget.target !== "_self")) return;
              if (!hasFrontendPermission(auth.authorization, "pm.estimates.read")) void auth.restore();
            }}>View estimations</Link>
          <Button variant="secondary" size="compact" aria-expanded={showKpi} aria-controls={showKpi ? "pm-performance" : undefined} onClick={() => setShowKpi(value => !value)}><PMDashboardIcon name="performance" />My KPI</Button>
          {fullDetail ? <Link className="pm-link-button" to={tabHref(tab)}>Back to project tabs</Link> : <Button size="compact" onClick={detail}>Open full detail</Button>}
        </div>
      </header>
      {data.project.issues.length ? <details className="pm-disclosure pm-issues pm-project-detail__review"><summary>Project details to review ({data.project.issues.length})</summary>{data.project.issues.map((issue, index) => <p key={index}>{issue}</p>)}</details> : null}
      {showKpi ? <div className="pm-project-detail__kpi"><KPIOverview /></div> : null}
      {fullDetail ? <div className="pm-full-detail"><ProjectExecutionPage projectId={projectId} embedded /></div> : <>
        <nav ref={navigation} className="pm-tabs pm-project-detail__nav" aria-label="Project sections">{PM_TABS.map(value => <Link key={value} to={tabHref(value)} aria-current={value === tab ? "page" : undefined}>{TAB_LABELS[value]}</Link>)}</nav>
        <div className="pm-tab-content pm-project-detail__content" key={`${projectId}:${tab}`}><PMTargetRecord projectId={projectId} tab={tab}>
          {tab === "site" ? <SitePanel projectId={projectId} progress={data.project.progress} /> : ["procurement", "selections", "supply"].includes(tab) ? <PMRequestsPanel projectId={projectId} tab={tab as "procurement" | "selections" | "supply"} /> : <PMOperationsPanel projectId={projectId} tab={tab as "vendors" | "client" | "snagging" | "quality"} progress={data.project.progress} />}
        </PMTargetRecord>{tab === "procurement" ? <PMVendorSuggestions projectId={projectId} /> : null}</div>
      </>}
    </>}</PMQueryState>
  </section>;
}
function SitePanel({ projectId, progress }: { projectId: string; progress: PMProgress }) {
  const query = usePMPanel(projectId, "site"); const [params] = useSearchParams(); const entity = params.get("entity");
  useEffect(() => { if (query.data && entity) document.getElementById(`pm-item-${entity}`)?.scrollIntoView?.({ block: "center", behavior: "instant" }); }, [query.data, entity]);
  return <section className="pm-project-detail__site" aria-label="Site execution">
    <PMPanelHeader title="Site execution" description="Vendor reporting, Project Manager verification and client acceptance." />
    <div className="pm-overall-progress pm-project-detail__progress">
      <div className="pm-project-detail__progress-main"><PMProgressBar value={progress.actual} label="Overall reported progress" /></div>
      <dl className="pm-project-detail__progress-facts">
        <div><dt>Planned progress</dt><dd>{progress.planned === null ? "Unavailable" : `${progress.planned}%`}</dd></div>
        <div><dt>Site verified</dt><dd>{progress.siteVerified}</dd></div>
        <div><dt>Client accepted</dt><dd>{progress.clientAccepted}</dd></div>
      </dl>
      <PMProgressBasis progress={progress} />
    </div>
    <PMQueryState query={query}>{panel => <>
      <PMIssues issues={panel.issues} collapsedByDefault />
      {panel.items.length ? <div className="pm-records pm-rooms">{panel.items.map(room => <Room key={room.id} room={room} params={params} />)}</div> : <PMEmpty title="No issued execution work">Site details will appear when approved scope is issued and execution tracking is available.</PMEmpty>}
    </>}</PMQueryState>
  </section>;
}
function TradeNote({ description }: { description?: string | null }) {
  if (!description) return null;
  // Keep short operational reasons in the row; disclose long or unbroken source text in full.
  if (description.length > 96 || /\S{40,}|[\r\n]/u.test(description)) return <details className="pm-disclosure pm-project-detail__trade-note"><summary>Work details</summary><p>{description}</p></details>;
  return <small className="pm-trade-note">{description}</small>;
}
function Room({ room, params }: { room: PMItem; params: URLSearchParams }) {
  const children = room.children ?? [];
  function workHref(item: PMItem) { const query = new URLSearchParams(params); query.set("detail", "1"); query.set("tab", "site"); query.delete("entity"); query.set("assignment", item.assignmentId ?? item.id); return `?${query}`; }
  return <article className="pm-room" aria-labelledby={`pm-room-${room.id}`}>
    <div className="pm-project-detail__room-summary">
      <div className="pm-room__heading"><h3 id={`pm-room-${room.id}`}>{room.title}</h3><span>{children.length} {children.length === 1 ? "trade" : "trades"}</span></div>
      <PMProgressBar value={room.progress ?? null} label={`${room.title} reported progress`} />
      {room.description ? <details className="pm-disclosure pm-project-detail__room-note"><summary>Room details to review</summary><p>{room.description}</p></details> : null}
    </div>
    {!children.length ? <p className="pm-quiet-state">No issued execution work for this room yet.</p> : <div className="pm-trade-table" role="region" aria-label={`${room.title} execution`} tabIndex={0}>
      <table role="table" aria-label={`${room.title} trades`}>
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Trade / scope</th><th scope="col" role="columnheader">Vendor</th><th scope="col" role="columnheader">Reported progress</th><th scope="col" role="columnheader">Verification</th><th scope="col" role="columnheader"><span className="sr-only">Open work</span></th></tr></thead>
        <tbody role="rowgroup">{children.map(item => <tr role="row" key={item.id} id={`pm-item-${item.id}`}>
          <th role="rowheader" scope="row"><strong>{item.title}</strong><TradeNote description={item.description} /></th>
          <td role="cell" className="pm-project-detail__vendor"><span className="pm-project-detail__cell-label" aria-hidden="true">Vendor</span>{item.ownerName ?? "Unassigned"}</td>
          <td role="cell" className="pm-project-detail__trade-progress"><span className="pm-project-detail__cell-label" aria-hidden="true">Reported progress</span><PMBadge value={item.status} severity={item.severity} /><PMProgressBar value={item.progress ?? null} label={`${item.title} reported`} /></td>
          <td role="cell" className="pm-project-detail__verification"><span className="pm-project-detail__cell-label" aria-hidden="true">Verification</span><dl>{item.facts.filter(fact => fact.label !== "Vendor").map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></td>
          <td role="cell" className="pm-project-detail__open"><Link to={workHref(item)} aria-label={`Open ${item.title} in ${room.title}`}>Open<PMDashboardIcon name="chevron" /></Link></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </article>;
}
