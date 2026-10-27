import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { KpiPanel } from "../../components/kpi/KpiPanel";
import { Button } from "../../components/ui/Button";
import { ProjectExecutionPage } from "../execution/ExecutionWorkspace";
import { useExecutionConnection } from "../execution/ExecutionLiveProvider";
import { PMRequestsPanel } from "./PMRequestsPanel";
import { PMOperationsPanel } from "./PMOperationsPanel";
import { PMTargetRecord } from "./PMTargetRecord";
import { PMBadge, PMEmpty, PMIssues, PMPanelHeader, PMProgressBar, PMProgressBasis, PMQueryState, pmDate, pmLabel, pmMoney } from "./PMShared";
import { usePMOverview, usePMPanel, usePMPerformance, usePMPortfolio, usePMQuery, type PMFilters } from "./projectManagerApi";
import { PM_TABS, type PMAlert, type PMHealth, type PMItem, type PMPortfolio, type PMProgress, type PMProject, type PMTab } from "./projectManagerTypes";
import "./project-manager.css";

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
  return <span className="pm-connection" role="status" data-state={connection}>{labels[connection]}</span>;
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
  const parsedOffset = Number(params.get("offset") ?? 0);
  const offset = Number.isSafeInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const filters: PMFilters = { q: q || undefined, status, health, offset, limit: PAGE_SIZE };
  const query = usePMPortfolio(filters);
  const returnTo = `${location.pathname}${location.search}`;
  function filter(key: "q" | "status" | "health", value: string) { setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); next.delete("offset"); return next; }, { replace: key === "q" }); }
  function page(nextOffset: number) { setParams(previous => { const next = new URLSearchParams(previous); if (nextOffset) next.set("offset", String(nextOffset)); else next.delete("offset"); return next; }); }
  return <section className="pm-workspace" aria-labelledby="pm-dashboard-title">
    <header className="pm-page-heading"><div><p className="pm-eyebrow">Project Manager</p><h1 id="pm-dashboard-title">Dashboard</h1><p>{auth.user?.name ? `${auth.user.name} · ` : ""}{pmDate(new Date().toISOString())}</p></div><div className="pm-actions"><PMConnection /><Button variant="secondary" size="compact" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh projects</Button><Button variant="secondary" size="compact" aria-expanded={showKpi} aria-controls={showKpi ? "pm-performance" : undefined} onClick={() => setShowKpi(value => !value)}>My KPI</Button></div></header>
    {showKpi ? <KPIOverview /> : null}
    <div className="pm-filters" role="search" aria-label="Filter projects"><label>Search projects<input type="search" maxLength={160} value={q} placeholder="Project, client or location" onChange={event => filter("q", event.target.value)} /></label><label>Project status<select value={status} onChange={event => filter("status", event.target.value)}><option value="current">Current projects</option><option value="all">All projects</option><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></label><label>Project health<select value={health} onChange={event => filter("health", event.target.value)}><option value="all">All health states</option><option value="at_risk">At risk, including critical</option><option value="critical">Critical</option><option value="setup">Setup</option><option value="on_track">On track</option><option value="incomplete">Incomplete source</option><option value="completed">Completed</option></select></label></div>
    <PMQueryState query={query}>{data => <>
      <ProjectSummary data={data} health={health} onFilter={value => filter("health", value)} />
      <PriorityAlerts data={data} filters={filters} returnTo={returnTo} />
      <section className="pm-projects" aria-labelledby="pm-projects-title"><div className="pm-section-heading"><div><h2 id="pm-projects-title">{health === "all" ? "All projects" : `${pmLabel(health)} projects`}</h2><p>{data.total} {data.total === 1 ? "project" : "projects"} in this view</p></div><span className="pm-meta">Updated {pmDate(data.calculatedAt)}</span></div>
        {data.items.length ? <ul className="pm-project-list">{data.items.map(project => <ProjectCard key={project.id} project={project} returnTo={returnTo} />)}</ul> : <PMEmpty title={q || health !== "all" ? "No matching projects" : "No assigned projects"}>{q || health !== "all" ? "Adjust your search or filters to see more projects." : "Projects will appear here when you are assigned as Project Manager."}</PMEmpty>}
        <Pagination offset={offset} count={data.items.length} total={data.total} busy={query.isFetching} onChange={page} />
      </section>
    </>}</PMQueryState>
  </section>;
}

function ProjectSummary({ data, health, onFilter }: { data: PMPortfolio; health: string; onFilter: (health: string) => void }) {
  const metrics = [{ label: "Active projects", value: data.counts.active, key: "all", detail: "All non-completed projects" }, { label: "At risk", value: data.counts.atRisk, key: "at_risk", detail: `${data.counts.critical} critical` }, { label: "Setup", value: data.counts.setup, key: "setup", detail: "Preparing to start" }, { label: "On track", value: data.counts.onTrack, key: "on_track", detail: "No current risk identified" }];
  return <section className="pm-summary" aria-label="Project summary"><div className="pm-summary__metrics">{metrics.map(metric => <button type="button" className="pm-summary__metric" key={metric.key} aria-pressed={health === metric.key} onClick={() => onFilter(metric.key)}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></button>)}</div><div className="pm-summary__caption"><span>Counts follow search and project status, before health filtering.</span>{data.counts.incomplete ? <button type="button" onClick={() => onFilter("incomplete")}>{data.counts.incomplete} with incomplete source data</button> : null}</div></section>;
}
function ProjectCard({ project, returnTo }: { project: PMProject; returnTo: string }) {
  return <li><article className="pm-project"><div className="pm-project__main"><div><div className="pm-project__identity"><h3><Link to={projectLink(project.id, returnTo)} aria-label={`Open project ${project.name}`}>{project.name}</Link></h3><PMBadge value={project.health} severity={healthSeverity(project.health)} /></div><p>{[project.clientName, project.location].filter(Boolean).join(" · ") || "Project details pending"}</p><div className="pm-project__metadata"><span>{pmLabel(project.status)}</span><span>Approved net value: {pmMoney(project.approvedNetPaise)}</span>{project.activeAlerts ? <span>{project.activeAlerts} {project.activeAlerts === 1 ? "priority" : "priorities"}</span> : null}</div></div><div className="pm-project__deadline"><span>Target handover</span><strong>{pmDate(project.plannedEndAt)}</strong></div></div><PMProgressBar value={project.progress.actual} />{project.issues.length ? <p className="pm-project__note">{project.issues[0]}</p> : null}</article></li>;
}
function PriorityAlerts({ data, filters, returnTo }: { data: PMPortfolio; filters: PMFilters; returnTo: string }) {
  const [expanded, setExpanded] = useState(false), [offset, setOffset] = useState(0);
  const queryParams = new URLSearchParams({ status: filters.status ?? "current", health: filters.health ?? "all", offset: String(offset), limit: String(PAGE_SIZE) });
  if (filters.q) queryParams.set("q", filters.q);
  const query = usePMQuery<{ items: PMAlert[]; total: number }>(`/project-manager/alerts?${queryParams}`, expanded);
  useEffect(() => { setOffset(0); }, [filters.q, filters.status, filters.health]);
  return <section className="pm-alerts" aria-labelledby="pm-alerts-title"><div className="pm-section-heading"><div><h2 id="pm-alerts-title">Priority alerts <span className="pm-count">{data.alertTotal}</span></h2><p>Open an item to review its project context.</p></div>{data.alertTotal > data.alerts.length || expanded ? <Button variant="quiet" size="compact" onClick={() => setExpanded(value => !value)}>{expanded ? "Show preview" : `View all ${data.alertTotal}`}</Button> : null}</div>{expanded ? <PMQueryState query={query}>{all => <><AlertList alerts={all.items} returnTo={returnTo} /><Pagination offset={offset} count={all.items.length} total={all.total} busy={query.isFetching} onChange={setOffset} /></>}</PMQueryState> : <AlertList alerts={data.alerts} returnTo={returnTo} />}</section>;
}
function AlertList({ alerts, returnTo }: { alerts: PMAlert[]; returnTo: string }) { return alerts.length ? <ul className="pm-alert-list">{alerts.map(alert => <li key={alert.id}><Link to={projectLink(alert.projectId, returnTo, alert.tab, alert.entityId, alert.offset)}><PMBadge value={alert.severity === "critical" ? "Critical" : "Needs attention"} severity={alert.severity} /><div><strong>{alert.title}</strong><p>{alert.detail}</p></div><span className="pm-alert-list__project">{alert.projectName}<small>{TAB_LABELS[alert.tab]}</small></span></Link></li>)}</ul> : <p className="pm-quiet-state">No current priority alerts in this view.</p>; }
function Pagination({ offset, count, total, busy, onChange }: { offset: number; count: number; total: number; busy: boolean; onChange: (offset: number) => void }) { return total > PAGE_SIZE || offset ? <div className="pm-pagination"><span>{total ? `${Math.min(offset + 1, total)}–${Math.min(offset + count, total)} of ${total}` : "0 results"}</span><div className="pm-actions"><Button size="compact" variant="secondary" disabled={!offset || busy} onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}>Previous</Button><Button size="compact" variant="secondary" disabled={offset + count >= total || busy} onClick={() => onChange(offset + PAGE_SIZE)}>Next</Button></div></div> : null; }

export function ProjectManagerProjectPage({ projectId: suppliedId }: { projectId?: string }) {
  const [showKpi, setShowKpi] = useState(false);
  const { projectId: routeId } = useParams(); const projectId = suppliedId ?? routeId ?? "";
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab"); const tab: PMTab = PM_TABS.includes(rawTab as PMTab) ? rawTab as PMTab : "site";
  const fullDetail = params.get("detail") === "1" || Boolean(params.get("assignment"));
  const returnTo = projectManagerReturnPath(params.get("returnTo"));
  const query = usePMOverview(projectId);
  function tabHref(next: PMTab) { const query = new URLSearchParams(params); query.set("tab", next); query.delete("detail"); query.delete("entity"); query.delete("locate"); query.delete("tabOffset"); query.delete("assignment"); return `?${query}`; }
  function detail() { setParams(previous => { const next = new URLSearchParams(previous); next.set("detail", "1"); return next; }); }
  if (!projectId) return <section className="pm-workspace"><PMEmpty title="Project unavailable">Choose an assigned project from the dashboard.</PMEmpty><Link to="/execution">Dashboard</Link></section>;
  return <section className="pm-workspace" aria-label="Project Manager project workspace"><Link to={returnTo} className="pm-back">All projects</Link><PMQueryState query={query}>{data => <>
    <header className="pm-page-heading pm-project-heading"><div><div className="pm-project__identity"><h1>{data.project.name}</h1><PMBadge value={data.project.health} severity={healthSeverity(data.project.health)} /></div><p>{[data.project.clientName, data.project.location].filter(Boolean).join(" · ")}</p><div className="pm-project__metadata"><span>Approved net value: {pmMoney(data.project.approvedNetPaise)}</span><span>Target handover: {pmDate(data.project.plannedEndAt)}</span></div></div><div className="pm-actions"><Button variant="secondary" size="compact" aria-expanded={showKpi} aria-controls={showKpi ? "pm-performance" : undefined} onClick={() => setShowKpi(value => !value)}>My KPI</Button>{fullDetail ? <Link className="pm-link-button" to={tabHref(tab)}>Back to project tabs</Link> : <Button size="compact" onClick={detail}>Open full detail</Button>}</div></header>
    {showKpi ? <KPIOverview /> : null}
    {fullDetail ? <div className="pm-full-detail"><ProjectExecutionPage projectId={projectId} embedded /></div> : <><nav className="pm-tabs" aria-label="Project sections">{PM_TABS.map(value => <Link key={value} to={tabHref(value)} aria-current={value === tab ? "page" : undefined}>{TAB_LABELS[value]}</Link>)}</nav><div className="pm-tab-content" key={`${projectId}:${tab}`}><PMTargetRecord projectId={projectId} tab={tab}>{tab === "site" ? <SitePanel projectId={projectId} progress={data.project.progress} /> : ["procurement", "selections", "supply"].includes(tab) ? <PMRequestsPanel projectId={projectId} tab={tab as "procurement" | "selections" | "supply"} /> : <PMOperationsPanel projectId={projectId} tab={tab as "vendors" | "client" | "snagging" | "quality"} progress={data.project.progress} />}</PMTargetRecord></div></>}
  </>}</PMQueryState></section>;
}
function SitePanel({ projectId, progress }: { projectId: string; progress: PMProgress }) {
  const query = usePMPanel(projectId, "site"); const [params] = useSearchParams(); const entity = params.get("entity");
  useEffect(() => { if (query.data && entity) document.getElementById(`pm-item-${entity}`)?.scrollIntoView?.({ block: "center", behavior: "instant" }); }, [query.data, entity]);
  return <section aria-label="Site execution"><PMPanelHeader title="Site execution" description="Vendor reporting, Project Manager verification and client acceptance." /><div className="pm-overall-progress"><PMProgressBar value={progress.actual} label="Overall reported progress" /><p>Planned: <strong>{progress.planned === null ? "Unavailable" : `${progress.planned}%`}</strong><span>{progress.siteVerified} site verified · {progress.clientAccepted} client accepted</span></p><PMProgressBasis progress={progress} /></div><PMQueryState query={query}>{panel => <><PMIssues issues={panel.issues} />{panel.items.length ? <div className="pm-records pm-rooms">{panel.items.map(room => <Room key={room.id} room={room} params={params} />)}</div> : <PMEmpty title="No issued execution work">Site details will appear when approved scope is issued and execution tracking is available.</PMEmpty>}</>}</PMQueryState></section>;
}
function Room({ room, params }: { room: PMItem; params: URLSearchParams }) {
  const children = room.children ?? [];
  function workHref(item: PMItem) { const query = new URLSearchParams(params); query.set("detail", "1"); query.set("tab", "site"); query.delete("entity"); query.set("assignment", item.assignmentId ?? item.id); return `?${query}`; }
  return <article className="pm-room" aria-labelledby={`pm-room-${room.id}`}><div className="pm-room__heading"><h3 id={`pm-room-${room.id}`}>{room.title}</h3><span>{children.length} {children.length === 1 ? "trade" : "trades"}</span></div><PMProgressBar value={room.progress ?? null} label={`${room.title} reported progress`} />{room.description ? <p className="pm-project__note">{room.description}</p> : null}{!children.length ? <p className="pm-quiet-state">No issued execution work for this room yet.</p> : null}<div className="pm-trade-table" role="region" aria-label={`${room.title} execution`} tabIndex={0}><table><thead><tr><th scope="col">Trade / scope</th><th scope="col">Vendor</th><th scope="col">Reported progress</th><th scope="col">Verification</th><th scope="col"><span className="sr-only">Open work</span></th></tr></thead><tbody>{children.map(item => <tr key={item.id} id={`pm-item-${item.id}`}><th scope="row"><strong>{item.title}</strong>{item.description ? <small className="pm-trade-note">{item.description}</small> : null}</th><td>{item.ownerName ?? "Unassigned"}</td><td><PMBadge value={item.status} severity={item.severity} /><PMProgressBar value={item.progress ?? null} label={`${item.title} reported`} /></td><td><dl>{item.facts.filter(fact => fact.label !== "Vendor").map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></td><td><Link to={workHref(item)} aria-label={`Open ${item.title} in ${room.title}`}>Open</Link></td></tr>)}</tbody></table></div></article>;
}
