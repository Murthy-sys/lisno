import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Link, useInRouterContext, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { procurementError } from "../procurement/procurementPresentation";
import { executionApi, executionKeys, type ExecutionCounts, type ExecutionQuery, type ExecutionWork } from "./executionApi";
import { useExecutionConnection } from "./ExecutionLiveProvider";
import { ProjectStatusButton } from "../project-status/ProjectStatusButton";
import { ExecutionDetailPanel } from "./ExecutionDetailPanel";
import { VendorAccessPanel } from "./VendorAccessPanel";
import { ExecutionPolicyPanel } from "./ExecutionPolicyPanel";
import { executionDate, executionLabel, executionStatusLabels, executionTime } from "./executionPresentation";
import "./execution.css";

export type ExecutionConnectionState = "live" | "connecting" | "polling" | "offline" | "denied";
export function ExecutionConnection({ state }: { state: ExecutionConnectionState }) {
  const labels: Record<ExecutionConnectionState, string> = { live: "Live updates", connecting: "Connecting to updates", polling: "Refreshing every 15 seconds", offline: "Offline · updates may be stale", denied: "Live access unavailable" };
  return <span className="execution__connection" data-state={state} role="status">{labels[state]}</span>;
}

export function ExecutionSummary({ counts }: { counts: ExecutionCounts }) {
  return <dl className="execution__counts" aria-label="Execution counts">
    {([ ["Open", counts.open], ["Missing updates", counts.missing], ["Blocked", counts.blocked], ["Overdue", counts.overdue], ["Awaiting verification", counts.awaitingVerification], ["Site verified", counts.verified], ["Client accepted", counts.clientAccepted], ["Needs setup", counts.setupRequired] ] as const).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function ExecutionPagination({ offset, count, total, busy, onChange }: { offset: number; count: number; total: number; busy: boolean; onChange: (offset: number) => void }) {
  return <div className="execution__pagination"><span>{total ? `${offset + 1}–${offset + count} of ${total}` : "0 results"}</span><div><Button size="compact" variant="secondary" disabled={offset === 0 || busy} onClick={() => onChange(Math.max(0, offset - 25))}>Previous</Button><Button size="compact" variant="secondary" disabled={offset + count >= total || busy} onClick={() => onChange(offset + count)}>Next</Button></div></div>;
}

type LegacyRenderer = (id: string, close: () => void) => ReactNode;
interface WorkspaceProps {
  projectId?: string;
  projectName?: string;
  vendor?: boolean;
  connection?: ExecutionConnectionState;
  renderLegacy?: LegacyRenderer;
}

function ExecutionWorkspace({ projectId, projectName, vendor = false, connection: suppliedConnection, renderLegacy }: WorkspaceProps) {
  const liveConnection = useExecutionConnection();
  const connection = suppliedConnection ?? liveConnection;
  const routed = useInRouterContext();
  const id = useId();
  const [filters, setFilters] = useState<ExecutionQuery>({ limit: 25, offset: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const query = useQuery({ queryKey: vendor ? executionKeys.mine(filters) : executionKeys.project(projectId!, filters), queryFn: ({ signal }) => vendor ? executionApi.mine(filters, signal) : executionApi.project(projectId!, filters, signal), enabled: vendor || Boolean(projectId), refetchInterval: connection === "live" || connection === "denied" ? false : 15_000, refetchIntervalInBackground: false });
  const denied = query.error instanceof ApiError && [401,403].includes(query.error.status);
  const data = denied ? undefined : query.data;
  function filter(key: keyof ExecutionQuery, value: string) { setFilters(old => ({ ...old, [key]: value || undefined, offset: 0 })); }
  return <section className="execution" aria-label={vendor ? "Vendor execution workspace" : `${projectName ?? "Project"} execution tracker`}>
    {routed ? <NotificationSelection onSelect={setSelected} /> : null}
    <div className="execution__heading"><div><h2>{vendor ? "Main Line assignments" : "Execution tracker"}</h2><p>Vendor reports, Site Manager verification and Client acceptance remain separate.</p></div><div className="execution__actions"><ExecutionConnection state={connection} /><Button size="compact" variant="secondary" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh</Button>{data?.canManagePolicy && projectId ? <Button size="compact" variant="secondary" onClick={() => setPolicyOpen(true)}>Reporting schedule</Button> : null}</div></div>
    {data ? <ExecutionSummary counts={data.counts} /> : null}
    {vendor && data?.items.length ? <div className="vendor-work__projects" aria-label="Project status controls">{[...new Map(data.items.map(work => [work.projectId,work.projectName])).entries()].map(([id,name]) => <div key={id}><span>{name}</span><ProjectStatusButton projectId={id} participant /></div>)}</div> : null}
    <div className="execution__toolbar"><div className="execution__filters">
      <Field id={`${id}-search`} label="Search Main Lines">{props => <Input {...props} type="search" placeholder="Main Line, vendor, room, order…" value={filters.q ?? ""} onChange={event => filter("q", event.target.value)} />}</Field>
      <Field id={`${id}-status`} label="Execution status">{props => <Select {...props} value={filters.status ?? ""} onChange={event => filter("status", event.target.value)}><option value="">All statuses</option>{Object.entries(executionStatusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select>}</Field>
      <Field id={`${id}-flag`} label="Needs attention">{props => <Select {...props} value={filters.flag ?? ""} onChange={event => filter("flag", event.target.value)}><option value="">All assignments</option><option value="missing_update">Missing update</option><option value="overdue">Overdue work</option><option value="blocked">Blocked</option><option value="setup_required">Needs setup</option></Select>}</Field>
    </div></div>
    {query.isPending ? <PageState state="loading" message="Loading Main Line assignments…" /> : denied ? <PageState state="error" message="You no longer have access to this execution tracker." /> : query.isError && !data ? <PageState state="error" message={procurementError(query.error,"Assignments could not be loaded.")} action={{ label: "Try again", onAction: () => void query.refetch() }} /> : data ? <>
      {query.isError ? <InlineMessage tone="warning">Refresh failed. The assignments shown may be out of date. Retry before making a decision.</InlineMessage> : null}
      {data.policy ? <p className="execution__policy-summary">{data.policy.timezone} · Reminder {data.policy.reminderTime} · Update deadline {data.policy.deadlineTime} · Escalation {data.policy.escalationTime}</p> : null}
      {data.items.length ? <div className="execution__table-wrap" role="region" aria-label="Main Line assignments" tabIndex={0}><table className="execution__table"><thead><tr><th scope="col">Main Line / issued scope</th><th scope="col">{vendor ? "Project" : "Vendor"}</th><th scope="col">Execution</th><th scope="col">Daily update</th><th scope="col">Commitment</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.items.map(work => <WorkRow key={work.id} work={work} vendor={vendor} onOpen={() => setSelected(work.id)} />)}</tbody></table></div> : <PageState state="empty" message={filters.q || filters.flag || filters.status ? "No assignments match these filters." : "No issued Main Line work is available here yet."} />}
      <ExecutionPagination offset={data.offset} count={data.items.length} total={data.total} busy={query.isFetching} onChange={offset => setFilters(old => ({ ...old, offset }))} />
    </> : null}
    {selected && !denied ? <ExecutionDetailPanel key={selected} assignmentId={selected} vendor={vendor} timezone={data?.policy?.timezone} onClose={() => setSelected(null)} renderLegacy={renderLegacy} /> : null}
    {policyOpen && data?.canManagePolicy && projectId ? <ExecutionPolicyPanel projectId={projectId} onClose={() => setPolicyOpen(false)} /> : null}
  </section>;
}

function WorkRow({ work, vendor, onOpen }: { work: ExecutionWork; vendor: boolean; onOpen: () => void }) {
  const timezone = work.timezone;
  return <tr><td><strong>{work.itemName}</strong><small>{[work.mainBasketName,work.subBasketName,work.roomName].filter(Boolean).join(" · ")}</small><small>{work.orderNumber} · Revision {work.orderRevision}{work.quantityMilliUnits !== null && work.uomCode ? ` · ${work.quantityMilliUnits / 1000} ${work.uomCode}` : " · Issued quantity unavailable"}</small>{!work.sourceAvailable ? <small>Configuration link unavailable</small> : null}</td><td>{vendor ? work.projectName : work.vendorName}<small>Next: {executionLabel(work.nextOwner)}</small></td><td><span className="execution__status" data-status={work.status}>{work.tracking === "legacy_review" && work.legacyStatus === "submitted_for_client" ? "With Client (existing review)" : executionStatusLabels[work.status]}</span><small>{work.progress}% vendor reported</small>{work.verification ? <small>Site verified {executionDate(work.verification.verifiedAt)}</small> : null}{work.flags.map(flag => <span className="execution__flag" key={flag}>{executionLabel(flag)}</span>)}</td><td>{executionLabel(work.daily.state)}<small>{work.daily.dueAt ? `Due ${executionTime(work.daily.dueAt,timezone)} (${timezone})` : "No daily report due"}</small><small>{executionTime(work.latestReportAt,timezone)}</small></td><td>{work.schedule ? executionDate(work.schedule.finishDate) : "Schedule not confirmed"}<small>Issued target: {work.originalTargetDate ? executionDate(work.originalTargetDate) : "Not set"}</small>{work.hold ? <small>On hold until review {executionDate(work.hold.reviewDate)}</small> : null}</td><td><Button size="compact" variant="secondary" onClick={onOpen} aria-label={`Open ${work.itemName}, ${work.orderNumber}, ${work.roomName || work.vendorName}`}>Open</Button></td></tr>;
}

export function VendorExecutionWorkspace({ renderLegacy, connection }: { renderLegacy?: LegacyRenderer; connection?: ExecutionConnectionState }) { return <ExecutionWorkspace vendor renderLegacy={renderLegacy} connection={connection} />; }
export function ProjectExecutionTracker({ projectId, projectName, connection }: { projectId: string; projectName?: string; connection?: ExecutionConnectionState }) { return <ExecutionWorkspace projectId={projectId} projectName={projectName} connection={connection} />; }
export function ProjectExecutionPage({ projectId: suppliedProjectId }: { projectId?: string }) {
  const { projectId: routeProjectId } = useParams();
  const projectId = suppliedProjectId ?? routeProjectId;
  return <div className="execution"><PageHeader id="project-execution-title" eyebrow="Project execution" title="Main Line workflow" description="Track commitments, daily reports and verified completion." />{projectId ? <><ProjectExecutionTracker projectId={projectId} /><VendorAccessPanel projectId={projectId} /></> : <PageState state="error" message="A project is required to open this tracker." />}</div>;
}

export function ExecutionPortfolioPage() {
  const connection = useExecutionConnection();
  const [filters,setFilters] = useState<ExecutionQuery>({ limit: 25, offset: 0 });
  const projects = useQuery({ queryKey: executionKeys.projects(filters), queryFn: ({ signal }) => executionApi.projects(filters, signal), refetchInterval: connection === "live" || connection === "denied" ? false : 15_000 });
  const denied = projects.error instanceof ApiError && [401,403].includes(projects.error.status);
  const data = denied ? undefined : projects.data;
  return <section className="execution"><PageHeader id="execution-portfolio-title" eyebrow="Execution oversight" title="Project execution" description="Assigned projects, reporting exceptions and completion reviews." /><div className="execution__toolbar"><Field id="execution-project-search" label="Search projects">{props => <Input {...props} type="search" value={filters.q ?? ""} onChange={event => setFilters(old => ({ ...old, q: event.target.value, offset: 0 }))} />}</Field><ExecutionConnection state={connection} /><Button variant="secondary" size="compact" busy={projects.isFetching} onClick={() => void projects.refetch()}>Refresh projects</Button></div>
    {data?.deliveryHealth ? <div className="execution__delivery-health" aria-label="Execution delivery status">
      <span>Automatic invitations: {data.deliveryHealth.accessDeliveryEnabled ? "Enabled" : "Paused"}</span>
      <span>Daily reminders: {data.deliveryHealth.schedulerEnabled ? "Enabled" : "Paused"}</span>
      {data.deliveryHealth.schedulerEnabled ? <span>Last reminder check: {data.deliveryHealth.lastSchedulerSuccessAt ? executionTime(data.deliveryHealth.lastSchedulerSuccessAt,"Asia/Kolkata") : "Not yet completed"}</span> : null}
      {data.deliveryHealth.pendingEmails > 0 ? <span>{data.deliveryHealth.pendingEmails} emails awaiting delivery</span> : null}
      {data.deliveryHealth.failedEmails > 0 ? <span role="status">{data.deliveryHealth.failedEmails} email deliveries need attention</span> : null}
      {data.deliveryHealth.lastSchedulerFailureCode ? <span role="status">The reminder service needs attention.</span> : null}
    </div> : null}
    {projects.isPending ? <PageState state="loading" message="Loading projects…" /> : denied ? <PageState state="error" message="You do not have access to execution oversight." /> : !data ? <PageState state="error" message={procurementError(projects.error,"Projects could not be loaded.")} action={{ label: "Try again", onAction: () => void projects.refetch() }} /> : <>{projects.isError ? <InlineMessage tone="warning">Refresh failed. Project counts may be out of date.</InlineMessage> : null}{data.items.length ? <div className="execution__table-wrap" role="region" aria-label="Project execution" tabIndex={0}><table className="execution__table"><thead><tr><th scope="col">Project</th><th scope="col">Open</th><th scope="col">Missing</th><th scope="col">Blocked / overdue</th><th scope="col">To verify</th><th scope="col">Site verified</th><th scope="col">Needs setup</th><th scope="col"><span className="sr-only">Open project</span></th></tr></thead><tbody>{data.items.map(project => <tr key={project.id}><td><strong>{project.name}</strong><small>{executionLabel(project.status)}</small></td><td>{project.counts.open}</td><td>{project.counts.missing}</td><td>{project.counts.blocked} / {project.counts.overdue}</td><td>{project.counts.awaitingVerification}</td><td>{project.counts.verified}</td><td>{project.counts.setupRequired}</td><td><Link to={`/projects/${encodeURIComponent(project.id)}/execution`} aria-label={`Open ${project.name} execution`}>Open project</Link></td></tr>)}</tbody></table></div> : <PageState state="empty" message="No projects match this execution view." />}<ExecutionPagination offset={data.offset} count={data.items.length} total={data.total} busy={projects.isFetching} onChange={offset => setFilters(old => ({ ...old, offset }))} /></>}
  </section>;
}

function NotificationSelection({ onSelect }: { onSelect: (id: string) => void }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const assignment = params.get("assignment");
  useEffect(() => { if (assignment) onSelect(assignment); },[assignment,location.key,onSelect]);
  return null;
}
