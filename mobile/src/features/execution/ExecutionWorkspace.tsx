import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button, Field } from "../../ui/primitives";
import { KnowledgeSelect } from "../knowledge/knowledgeUi";
import { ExecutionDetailPanel } from "./ExecutionDetailPanel";
import { ExecutionPolicyPanel } from "./ExecutionPolicyPanel";
import { ProjectVendorAccessPanel } from "./ProjectVendorAccessPanel";
import { ExecutionNotifications } from "./ExecutionNotifications";
import { AccessLost, dateTime, DeliveryFrame, label, p, Pager, Panel, QueryState, ScopeMismatch, unavailable, useDeliveryContext, type DeliveryContext } from "./executionNative";
import type { ExecutionCounts, ExecutionQuery } from "./executionTypes";

export interface ExecutionWorkspaceProps { session: AuthenticatedSession; projectId?: string; workId?: string; embedded?: boolean; vendor?: boolean }
export function ExecutionWorkspace(props: ExecutionWorkspaceProps) {
  const c = useDeliveryContext(props.session);
  return <ExecutionSession key={`${c.scope}:${props.projectId ?? "all"}:${props.workId ?? ""}`} {...props} context={c} />;
}
export function ExecutionSession({ context: c, projectId, workId, embedded = false, vendor = c.session.user.role === "vendor" }: ExecutionWorkspaceProps & { context: DeliveryContext }) {
  const [selectedProject, setProject] = useState<string | null>(projectId ?? null);
  const [selectedWork, setWork] = useState<string | null>(workId ?? null);
  const [offset, setOffset] = useState(0); const [search, setSearch] = useState(""); const [searchDraft, setSearchDraft] = useState(""); const [scope, setScope] = useState<"current" | "all">("all");
  const portfolioAllowed = c.can("GET /execution/projects");
  const projects = useQuery({ queryKey: c.key("portfolio", search, offset, scope), queryFn: ({ signal }) => c.execution.projects({ limit: 25, offset, q: search, projectScope: scope }, signal), enabled: c.ready && portfolioAllowed && !selectedProject && !vendor, retry: false, refetchInterval: state => state.state.error ? false : 15_000, refetchIntervalInBackground: false });
  const selected = selectedProject ?? projectId;
  if (!vendor && !selected && !portfolioAllowed) return <AccessLost title="Execution unavailable" />;
  return <DeliveryFrame embedded={embedded}><Text style={p.title}>{vendor ? "Assigned work" : "Project execution"}</Text><Text style={p.copy}>Vendor reports, Project Manager verification and Client acceptance remain separate.</Text><Text style={p.copy}>Refreshes every 15 seconds while active.</Text>
    {selectedWork ? <><Button label="Back to execution list" variant="quiet" onPress={() => c.navigate(() => setWork(null))} /><ExecutionDetailPanel key={selectedWork} context={c} assignmentId={selectedWork} {...(selected ? { expectedProjectId: selected } : {})} vendor={vendor} /></> : selected || vendor ? <>
      {!projectId && !vendor ? <Button label="Back to execution projects" variant="quiet" onPress={() => c.navigate(() => setProject(null))} /> : null}
      <ExecutionWorkList key={selected ?? "vendor"} context={c} {...(selected ? { projectId: selected } : {})} vendor={vendor} onSelect={id => c.navigate(() => setWork(id))} />
      {selected && !vendor ? <ProjectVendorAccessPanel context={c} projectId={selected} /> : null}
    </> : <>
      <Field label="Search execution projects" value={searchDraft} onChangeText={setSearchDraft} maxLength={200} onSubmitEditing={() => { setSearch(searchDraft.trim()); setOffset(0); }} /><Button label="Search projects" variant="secondary" onPress={() => { setSearch(searchDraft.trim()); setOffset(0); }} />
      <KnowledgeSelect label="Project scope" value={scope} allowEmpty={false} options={[{ value: "all", label: "All projects" }, { value: "current", label: "Current projects" }]} onChange={value => { setScope(value as "current" | "all"); setOffset(0); }} />
      <Button label="Refresh execution projects" variant="quiet" disabled={projects.isFetching} onPress={() => void projects.refetch()} />
      {unavailable(projects.error) ? <AccessLost title="Execution projects unavailable" /> : <><QueryState title="Execution projects" query={projects} />{!projects.isError && projects.data ? <>
        {projects.data.deliveryHealth ? <Panel title="Delivery status"><Text style={p.copy}>Automatic invitations: {projects.data.deliveryHealth.accessDeliveryEnabled ? "Enabled" : "Paused"}</Text><Text style={p.copy}>Daily reminders: {projects.data.deliveryHealth.schedulerEnabled ? "Enabled" : "Paused"}</Text><Text style={p.copy}>Last reminder check: {dateTime(projects.data.deliveryHealth.lastSchedulerSuccessAt)}</Text><Text style={p.copy}>{projects.data.deliveryHealth.pendingEmails} deliveries pending · {projects.data.deliveryHealth.failedEmails} failed</Text>{projects.data.deliveryHealth.lastSchedulerFailureCode ? <Text style={p.error}>The reminder service needs attention.</Text> : null}</Panel> : null}
        {projects.data.items.map(item => <Panel key={item.id} title={item.name}><Text style={p.copy}>{label(item.status)}</Text><ExecutionSummary counts={item.counts} /><Button label={`Open ${item.name} execution`} variant="secondary" onPress={() => c.navigate(() => setProject(item.id))} /></Panel>)}
        {!projects.data.items.length ? <Text style={p.copy}>No projects match this execution view.</Text> : null}<Pager offset={projects.data.offset} limit={projects.data.limit} total={projects.data.total} onChange={setOffset} />
      </> : null}</>}
    </>}
    {!selectedWork && !projectId ? <ExecutionNotifications context={c} onSelect={(id, notificationProjectId) => c.navigate(() => { if (!vendor) setProject(notificationProjectId); setWork(id); })} /> : null}
  </DeliveryFrame>;
}
export function ExecutionSummary({ counts }: { counts: ExecutionCounts }) { return <View style={p.row}>{[["Open", counts.open], ["Missing updates", counts.missing], ["Blocked", counts.blocked], ["Overdue", counts.overdue], ["To verify", counts.awaitingVerification], ["Site verified", counts.verified], ["Client accepted", counts.clientAccepted], ["Needs setup", counts.setupRequired]].map(([name, value]) => <Text style={p.copy} key={name}>{name}: {value}</Text>)}</View>; }
function ExecutionWorkList({ context: c, projectId, vendor, onSelect }: { context: DeliveryContext; projectId?: string; vendor: boolean; onSelect: (id: string) => void }) {
  const [filters, setFilters] = useState<ExecutionQuery>({ limit: 25, offset: 0 }); const [search, setSearch] = useState(""); const [policy, setPolicy] = useState(false);
  const allowed = c.can(vendor ? "GET /vendor/work/execution" : "GET /projects/:projectId/execution");
  const query = useQuery({ queryKey: c.key(vendor ? "vendor-work" : "project-work", projectId ?? "mine", filters), queryFn: ({ signal }) => vendor ? c.execution.mine(filters, signal) : c.execution.project(projectId!, filters, signal), enabled: allowed && c.ready, retry: false, refetchInterval: state => state.state.error ? false : 15_000, refetchIntervalInBackground: false });
  if (!allowed || unavailable(query.error)) return <AccessLost title="Execution tracker unavailable" />;
  const data = query.data && (vendor || (query.data.project?.id === projectId && query.data.items.every(work => work.projectId === projectId))) ? query.data : null;
  const filter = (key: "status" | "flag" | "q", value: string) => c.navigate(() => setFilters(current => ({ ...current, [key]: value, offset: 0 })));
  return <View style={p.stack}><Field label="Search assigned Main Lines" value={search} onChangeText={setSearch} maxLength={200} onSubmitEditing={() => filter("q", search.trim())} /><Button label="Search assignments" variant="secondary" onPress={() => filter("q", search.trim())} />
    <KnowledgeSelect label="Execution status" value={filters.status ?? ""} placeholder="All statuses" options={["assigned", "awaiting_schedule", "not_started", "in_progress", "blocked", "awaiting_verification", "site_verified", "awaiting_client", "changes_requested", "client_approved", "superseded"].map(value => ({ value, label: label(value) }))} onChange={value => filter("status", value)} />
    <KnowledgeSelect label="Needs attention" value={filters.flag ?? ""} placeholder="All assignments" options={["missing_update", "overdue", "blocked", "setup_required"].map(value => ({ value, label: label(value) }))} onChange={value => filter("flag", value)} />
    <Button label="Refresh assignments" variant="quiet" disabled={c.locked || query.isFetching} onPress={() => void query.refetch()} /><QueryState title="Assignments" query={query} />{query.data && !query.isError && !data ? <ScopeMismatch /> : null}
    {data ? <><ExecutionSummary counts={data.counts} />{data.policy ? <Text style={p.copy}>{data.policy.timezone} · Reminder {data.policy.reminderTime} · Deadline {data.policy.deadlineTime} · Escalation {data.policy.escalationTime}</Text> : null}
      {projectId && data.canManagePolicy && c.can("PUT /projects/:projectId/execution-policy") ? <><Button label={policy ? "Close reporting schedule" : "Reporting schedule"} variant="secondary" onPress={() => c.navigate(() => setPolicy(value => !value))} />{policy ? <ExecutionPolicyPanel context={c} projectId={projectId} /> : null}</> : null}
      {data.items.map(work => <Panel key={work.id} title={work.itemName}><Text style={p.copy}>{vendor ? work.projectName : work.vendorName} · {work.roomName}</Text><Text style={p.copy}>{work.orderNumber} · Revision {work.orderRevision}</Text><Text style={p.strong}>{label(work.status)} · {work.progress}% reported</Text><Text style={p.copy}>Daily update: {label(work.daily.state)} · Next owner: {label(work.nextOwner)}</Text><Text style={p.copy}>Finish: {work.schedule?.finishDate ?? "Not confirmed"}</Text>{work.flags.map(flag => <Text key={flag} style={p.error}>{label(flag)}</Text>)}{!work.sourceAvailable ? <Text style={p.error}>Configuration link unavailable</Text> : null}<Button label={`Open ${work.itemName}, ${work.orderNumber}, ${work.roomName || work.vendorName}`} variant="secondary" onPress={() => onSelect(work.id)} /></Panel>)}
      {!data.items.length ? <Text style={p.copy}>No issued Main Line assignments match this view.</Text> : null}<Pager offset={data.offset} limit={data.limit} total={data.total} onChange={offset => c.navigate(() => setFilters(current => ({ ...current, offset })))} />
    </> : null}</View>;
}
