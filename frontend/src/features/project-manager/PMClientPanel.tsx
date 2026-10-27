import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import type { ExecutionPage, ExecutionWork } from "../execution/executionApi";
import { pmDenied, pmPath, pmRecordId, usePMCommand, usePMQuery } from "./projectManagerApi";
import type { PMItem, PMPanel, PMProgress } from "./projectManagerTypes";
import { PMActionDialog, PMEvidenceUpload, PMItemCard, PMPanelHeader, PMPanelRecords, PMQueryState, pmDate } from "./PMShared";
import { PMEvidenceLinks, usePMOperationKey, usePMTabOffset } from "./PMVendorPanel";

type SelectedAction = { action: string; label: string; item?: PMItem };
export function PMClientPanel({ projectId, tab, progress }: { projectId: string; tab: "client" | "snagging"; progress?: PMProgress }) {
  const [params, setParams] = useSearchParams();
  const [offset, setOffset] = usePMTabOffset(); const [kind, setKind] = useState<"snags" | "visits">("snags"); const [selection, setSelection] = useState<SelectedAction | null>(null);
  const filters = { roomId: params.get("snagRoom") ?? "", tradeId: params.get("snagTrade") ?? "", vendorId: params.get("snagVendor") ?? "", status: params.get("snagStatus") ?? "" };
  const filterQuery = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  const query = usePMQuery<PMPanel>(pmPath(projectId, `${tab}?limit=25&offset=${offset}${tab === "snagging" ? `&kind=${kind}${filterQuery ? `&${filterQuery}` : ""}` : ""}`));
  useEffect(() => { if (pmDenied(query.error)) setSelection(null); }, [query.error]);
  const disabled = query.isError || query.isFetching;
  function changeFilter(name: string, value: string) { setParams(old => { const next = new URLSearchParams(old); if (value) next.set(name, value); else next.delete(name); next.delete("tabOffset"); next.delete("entity"); return next; }, { replace: true }); }
  function panelAction(action: string, label: string) { if (action === "view_visits" || action === "view_snags") { setKind(action === "view_visits" ? "visits" : "snags"); setOffset(0); } else setSelection({ action, label }); }
  async function refresh() { const fresh = await query.refetch(); if (selection?.item && fresh.data) { const item = fresh.data.items.find(item => item.id === selection.item!.id); if (item) setSelection({ ...selection, item }); } }
  return <section aria-label={tab === "client" ? "Client follow-up" : "Snagging"}>
    <PMQueryState query={query}>{panel => <><PMPanelHeader title={tab === "client" ? "Client" : "Snagging"} description={tab === "client" ? "Track concerns, follow-ups and project updates." : progress?.actual != null && progress.actual >= 90 ? "Execution has reached the pre-handover review stage. Resolve and verify every snag." : "Log defects as they arise. Pre-handover review starts at 90% reported execution."}>
      {panel.actions.map(action => action.id === "whatsapp" ? action.href ? <a key={action.id} className="pm-text-link" href={action.href} target="_blank" rel="noopener noreferrer" aria-label="Compose a WhatsApp update, opens in a new tab">WhatsApp</a> : null : action.id === "send_update" ? <Link key={action.id} className="pm-text-link" to={`/projects/${encodeURIComponent(projectId)}/messages?draft=project-update`}>Send update</Link> : <Button key={action.id} size="compact" variant={action.id.startsWith("create") ? "primary" : "secondary"} disabled={disabled} onClick={() => panelAction(action.id, action.label)}>{action.label}</Button>)}
    </PMPanelHeader>
    {tab === "snagging" ? <div className="pm-filters" aria-label="Snag filters">
      <label>Room<select value={filters.roomId} onChange={event => changeFilter("snagRoom", event.target.value)}><option value="">All rooms</option>{panel.snagFilters?.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select></label>
      <label>Trade<select value={filters.tradeId} onChange={event => changeFilter("snagTrade", event.target.value)}><option value="">All trades</option>{panel.snagFilters?.trades.map(trade => <option key={trade.id} value={trade.id}>{trade.label}</option>)}</select></label>
      {panel.snagFilters?.vendors.length ? <label>Vendor<select value={filters.vendorId} onChange={event => changeFilter("snagVendor", event.target.value)}><option value="">All vendors</option>{panel.snagFilters.vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.label}</option>)}</select></label> : null}
      <label>Status<select value={filters.status} onChange={event => changeFilter("snagStatus", event.target.value)}><option value="">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved, awaiting verification</option><option value="verified">Verified</option></select></label>
      {filterQuery ? <Button size="compact" variant="quiet" onClick={() => setParams(old => { const next = new URLSearchParams(old); for (const key of ["snagRoom", "snagTrade", "snagVendor", "snagStatus", "tabOffset", "entity"]) next.delete(key); return next; }, { replace: true })}>Clear filters</Button> : null}
    </div> : null}
    {tab === "snagging" && kind === "visits" ? <p className="pm-record-meta">Visit filters match the room, trade, vendor and current status of linked snags.</p> : null}
    <PMPanelRecords panel={panel} render={item => <PMItemCard key={item.id} item={item} actions={item.actions.map(action => <Button key={action.id} size="compact" variant="secondary" disabled={disabled} onClick={() => setSelection({ action: action.id, label: action.label, item })}>{action.label}</Button>)}>
      {item.roomName || item.tradeName || item.vendorName || item.dueAt ? <p className="pm-record-meta">{item.roomName ? <span>{item.roomName}</span> : null}{item.tradeName ? <span>{item.tradeName}</span> : null}{item.vendorName ? <span>{item.vendorName}</span> : null}{item.dueAt ? <span>{tab === "client" ? "Follow-up" : "Due"}: {pmDate(item.dueAt)}</span> : null}</p> : null}<PMEvidenceLinks projectId={projectId} ids={item.evidenceIds} />
    </PMItemCard>} />
    <div className="pm-pagination"><span>{panel.total ? `${offset + 1}–${Math.min(offset + panel.items.length, panel.total)} of ${panel.total}` : "0 records"}</span><div className="pm-actions"><Button size="compact" variant="secondary" disabled={!offset || disabled} onClick={() => setOffset(old => Math.max(0, old - 25))}>Previous</Button><Button size="compact" variant="secondary" disabled={offset + panel.items.length >= panel.total || disabled} onClick={() => setOffset(old => old + 25)}>Next</Button></div></div>
    {selection ? <ClientAction key={`${selection.item?.id ?? "new"}:${selection.action}`} projectId={projectId} tab={tab} panel={panel} selection={selection} disabled={disabled} onRefresh={refresh} onClose={() => setSelection(null)} /> : null}</>}</PMQueryState>
  </section>;
}
function dateValue(value?: string | null) { if (!value) return ""; const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function ClientAction({ projectId, tab, panel, selection, disabled, onClose, onRefresh }: { projectId: string; tab: "client" | "snagging"; panel: PMPanel; selection: SelectedAction; disabled: boolean; onClose: () => void; onRefresh: () => Promise<void> }) {
  const { item, action, label } = selection; const command = usePMCommand(); const commandKey = usePMOperationKey();
  const create = action === "create_escalation" || action === "create_snag"; const visit = action === "log_visit";
  const [recordId] = useState(() => pmRecordId(visit ? "visit" : tab === "client" ? "escalation" : "snag"));
  const [title, setTitle] = useState(""); const [ownerId, setOwnerId] = useState(action === "escalate" ? "" : item?.ownerId ?? "");
  const [relatedWork, setRelatedWork] = useState<ExecutionWork | null>(null); const [workSearch, setWorkSearch] = useState(""); const [workOffset, setWorkOffset] = useState(0);
  const [date, setDate] = useState(dateValue(item?.dueAt)); const [severity, setSeverity] = useState("warning"); const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [selectedSnags, setSelectedSnags] = useState<string[]>([]); const [snagOffset, setSnagOffset] = useState(0); const [uploading, setUploading] = useState(false); const [error, setError] = useState<unknown>(null);
  const snags = usePMQuery<PMPanel>(pmPath(projectId, `snagging?kind=snags&limit=100&offset=${snagOffset}`), visit);
  const execution = usePMQuery<ExecutionPage>(`/projects/${encodeURIComponent(projectId)}/execution?limit=25&offset=${workOffset}&q=${encodeURIComponent(workSearch)}`, create && tab === "snagging");
  useEffect(() => { if (pmDenied(execution.error) || pmDenied(snags.error)) onClose(); }, [execution.error, snags.error, onClose]);
  async function submit(reason: string) {
    if (disabled || uploading || item && !item.actions.some(candidate => candidate.id === action)) { setError(new Error("Refresh this view before making a decision.")); return; }
    let payload: Record<string, unknown>; let path: string;
    if (create) {
      if (tab === "snagging" && relatedWork && (execution.isError || execution.isFetching)) { setError(new Error("Refresh related work before saving this snag.")); return; }
      path = tab === "client" ? "escalations" : "snags";
      payload = { expectedVersion: 0, recordId, title, description: reason, evidenceIds, ...(ownerId ? { ownerId } : {}), ...(tab === "client" ? { ...(date ? { followUpAt: new Date(date).toISOString() } : {}) } : { severity, ...(relatedWork ? { assignmentId: relatedWork.id } : {}), ...(date ? { dueAt: new Date(date).toISOString() } : {}) }) };
    } else if (visit) {
      if (!selectedSnags.length || snags.isError) { setError(new Error("Select at least one snag covered during this visit.")); return; }
      path = "snag-visits"; payload = { expectedVersion: 0, recordId, visitedAt: new Date(date).toISOString(), reason, snagIds: selectedSnags, evidenceIds };
    } else if (item) {
      path = `${tab === "client" ? "escalations" : "snags"}/${encodeURIComponent(item.id)}/actions`;
      payload = { expectedVersion: item.version, action, reason, evidenceIds, ...(tab === "snagging" && ownerId ? { ownerId } : {}), ...(tab === "client" && action === "escalate" ? { ownerId } : {}), ...(tab === "client" && action === "follow_up" ? { followUpAt: date ? new Date(date).toISOString() : null, ...(ownerId ? { ownerId } : {}) } : {}) };
    } else return;
    setError(null); try { await command.mutateAsync({ projectId, path, body: { ...payload, idempotencyKey: commandKey(payload) } }); onClose(); } catch (cause) { setError(cause); }
  }
  return <PMActionDialog title={label} description={item?.title ?? (visit ? "Record an actual visit and the snags inspected." : undefined)} onClose={onClose} onSubmit={submit} busy={command.isPending || uploading} error={error} submitLabel={label}>
    {create ? <label>Title<input value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={180} /></label> : null}
    {(tab === "client" && (create || action === "follow_up" || action === "escalate")) || (tab === "snagging" && !visit) ? <label>{action === "escalate" ? "Escalate to" : "Responsible person"}<select value={ownerId} onChange={e => setOwnerId(e.target.value)} required={action === "escalate" || action === "assign"}><option value="">{action === "escalate" ? "Choose another assigned person" : action === "assign" ? "Choose an assigned person" : "Project Manager"}</option>{panel.people.filter(person => action !== "escalate" || person.id !== item?.ownerId).map(person => <option key={person.id} value={person.id}>{person.name} · {person.role.replaceAll("_", " ")}</option>)}</select></label> : null}
    {create && tab === "snagging" ? <><label>Search related work<input type="search" value={workSearch} onChange={event => { setWorkSearch(event.target.value); setWorkOffset(0); }} placeholder="Room, item or vendor" /></label>
      <fieldset className="pm-choice-list"><legend>Related work</legend><label><input type="radio" name="related-work" checked={relatedWork === null} onChange={() => setRelatedWork(null)} /><span>General project snag<small>No work assignment linked</small></span></label>
        {relatedWork ? <p role="status">Selected: {relatedWork.roomName} · {relatedWork.itemName} · {relatedWork.vendorName}</p> : null}
        <PMQueryState query={execution}>{data => <>{data.items.filter(work => work.status !== "superseded").map(work => <label key={work.id}><input type="radio" name="related-work" value={work.id} checked={relatedWork?.id === work.id} disabled={!work.sourceAvailable || execution.isFetching || execution.isError} onChange={() => setRelatedWork(work)} /><span>{work.roomName} · {work.itemName}<small>{work.vendorName}{!work.sourceAvailable ? " · Source unavailable" : ""}</small></span></label>)}{data.total === 0 ? <p>No matching work assignments.</p> : null}<div className="pm-actions"><span>{data.total ? `${workOffset + 1}–${Math.min(workOffset + data.items.length, data.total)} of ${data.total} assignments` : "0 assignments"}</span><Button type="button" size="compact" variant="secondary" disabled={!workOffset || execution.isFetching} onClick={() => setWorkOffset(old => Math.max(0, old - 25))}>Previous work</Button><Button type="button" size="compact" variant="secondary" disabled={workOffset + data.items.length >= data.total || execution.isFetching} onClick={() => setWorkOffset(old => old + 25)}>Next work</Button></div></>}</PMQueryState>
      </fieldset><label>Severity<select value={severity} onChange={e => setSeverity(e.target.value)}><option value="neutral">Minor</option><option value="warning">Needs attention</option><option value="critical">Critical</option></select></label></> : null}
    {create || action === "follow_up" || visit ? <label>{visit ? "Visited at" : tab === "client" ? "Next follow-up" : "Target resolution"}<input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} required={visit} /></label> : null}
    {visit ? <PMQueryState query={snags}>{data => <fieldset className="pm-choice-list"><legend>Snags inspected</legend>{data.items.map(snag => <label key={snag.id}><input type="checkbox" checked={selectedSnags.includes(snag.id)} onChange={e => setSelectedSnags(old => e.target.checked ? [...old, snag.id] : old.filter(id => id !== snag.id))} /><span>{snag.title}<small>{snag.status.replaceAll("_", " ")}</small></span></label>)}{data.total > 100 ? <div className="pm-actions"><Button type="button" size="compact" variant="secondary" disabled={!snagOffset} onClick={() => setSnagOffset(old => Math.max(0, old - 100))}>Previous snags</Button><Button type="button" size="compact" variant="secondary" disabled={snagOffset + data.items.length >= data.total} onClick={() => setSnagOffset(old => old + 100)}>Next snags</Button></div> : null}</fieldset>}</PMQueryState> : null}
    {action === "verify" ? <p>Confirm that the repair has been inspected. This inspection does not replace execution verification or Client acceptance.</p> : null}
    <PMEvidenceUpload projectId={projectId} entityId={item?.id ?? recordId} onChange={setEvidenceIds} onBusyChange={setUploading} disabled={disabled || command.isPending} />
    {error ? <Button type="button" size="compact" variant="quiet" onClick={() => void onRefresh()}>Refresh current records</Button> : null}
  </PMActionDialog>;
}
