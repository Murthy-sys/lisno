import { useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { ApiError, apiClient } from "../../api/client";
import { pmError, pmKey, pmPath, usePMCommand, usePMQuery } from "./projectManagerApi";
import { PMEmpty, PMEvidenceUpload, PMItemCard, PMIssues, PMPanelHeader, PMQueryState, pmDate, pmMoney } from "./PMShared";
import type { PMAction, PMItem, PMPanel } from "./projectManagerTypes";

export type PMRequestTab = "procurement" | "selections" | "supply";
export interface PMRequestsPanelProps { projectId: string; tab: PMRequestTab; }
const pageSize = 25;
const headings: Record<PMRequestTab, { title: string; description: string; empty: string }> = {
  procurement: { title: "Procurement & deliveries", description: "Raise requirements, follow their owner, and track linked orders.", empty: "No requests or orders yet" },
  selections: { title: "Design decisions", description: "Acknowledge each requirement and follow up with the responsible person. Design decisions retain their own approval process.", empty: "No selection requirements" },
  supply: { title: "Critical supply", description: "Project Manager and assigned Designers sign independently against the current requirement.", empty: "No critical supply requirements" }
};
type OpenAction = { item: PMItem; action: PMAction };

/** Also used in assigned Procurement and Designer workspaces: capabilities come from the API. */
export function PMRequestsPanel({ projectId, tab }: PMRequestsPanelProps) {
  return <RequestsView key={`${projectId}:${tab}`} projectId={projectId} tab={tab} />;
}

function RequestsView({ projectId, tab }: PMRequestsPanelProps) {
  const [params] = useSearchParams();
  const [offset, setOffset] = useState(() => { const n=Number(params.get("tabOffset") ?? 0); return Number.isSafeInteger(n) && n >= 0 && n <= 100000 ? n : 0; });
  const query = usePMQuery<PMPanel>(pmPath(projectId, `${tab}?limit=${pageSize}&offset=${offset}`), Boolean(projectId));
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<OpenAction | null>(null);
  const [notice, setNotice] = useState("");
  const heading = headings[tab];
  const stale = query.isError;

  useEffect(() => {
    if (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)) {
      setCreating(false); setSelected(null);
    }
  }, [query.error]);

  async function refreshSelected(): Promise<OpenAction | null> {
    const refreshed = await query.refetch();
    if (refreshed.error) throw refreshed.error;
    const item = refreshed.data?.items.find(row => row.id === selected?.item.id);
    const action = item?.actions.find(action => action.id === selected?.action.id);
    if (!item || !action) return null;
    const next = { item, action }; setSelected(next); return next;
  }

  return <section className="pm-requests" aria-label={heading.title}>
    <PMPanelHeader title={heading.title} description={heading.description}>
      <Button size="compact" variant="secondary" onClick={() => void query.refetch()} busy={query.isFetching}>Refresh</Button>
      {query.data?.actions.some(action => action.id === "create_request") ? <Button size="compact" disabled={stale} onClick={() => { setNotice(""); setCreating(true); }}>Raise request</Button> : null}
    </PMPanelHeader>
    {notice ? <p role="status" className="pm-message">{notice}</p> : null}
    <PMQueryState query={query}>{panel => <>
      <PMIssues issues={panel.issues} />
      {panel.items.length ? <div className="pm-records">{panel.items.map(item => <PMItemCard key={item.id} item={item} actions={<>
        {item.actions.map(action => <Button key={action.id} size="compact" variant={action.id === "sign_off" || action.id === "acknowledge" ? "primary" : "secondary"} disabled={stale || item.sourceAvailable === false || !item.sourceToken} aria-label={`${action.label}: ${item.title}`} onClick={() => { setNotice(""); setSelected({ item, action }); }}>{action.label}</Button>)}
      </>}>
        {item.dueAt || item.amountPaise !== undefined ? <dl className="pm-facts">
          {item.dueAt ? <div><dt>Due</dt><dd>{pmDate(item.dueAt)}</dd></div> : null}
          {item.amountPaise !== undefined ? <div><dt>Approved value before GST</dt><dd>{pmMoney(item.amountPaise)}</dd></div> : null}
        </dl> : null}
        {item.evidenceIds?.length ? <EvidenceLinks projectId={projectId} ids={item.evidenceIds} /> : null}
      </PMItemCard>)}</div> : <PMEmpty title={heading.empty}>{panel.availability === "source_unavailable" ? "Resolve the source notes above to continue." : "Requirements and orders appear here when their source workflow is ready."}</PMEmpty>}
      {panel.total > pageSize || offset > 0 ? <div className="pm-pagination" aria-label={`${heading.title} pagination`}>
        <span>{panel.total ? `${offset + 1}–${Math.min(offset + panel.items.length, panel.total)} of ${panel.total}` : "No records"}</span>
        <div className="pm-actions"><Button size="compact" variant="secondary" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</Button><Button size="compact" variant="secondary" disabled={offset + pageSize >= panel.total || query.isFetching} onClick={() => setOffset(offset + pageSize)}>Next</Button></div>
      </div> : null}
    </>}</PMQueryState>
    {creating && query.data ? <RequestCreateDialog projectId={projectId} tab={tab === "selections" ? "selections" : "procurement"} panel={query.data} stale={stale} onRefresh={async () => { const result = await query.refetch(); if (result.error) throw result.error; return result.data; }} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setNotice("Request raised. The responsible owner has been notified in the workspace."); }} /> : null}
    {selected && query.data ? <RequestActionDialog projectId={projectId} tab={tab} selected={selected} panel={query.data} stale={stale} onRefresh={refreshSelected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); setNotice(`${selected.action.label} recorded.`); }} /> : null}
  </section>;
}

function useCommandKey() {
  const previous = useRef<{ payload: string; key: string } | null>(null);
  return (body: unknown): string => {
    const payload = JSON.stringify(body);
    if (!previous.current || previous.current.payload !== payload) previous.current = { payload, key: pmKey() };
    return previous.current.key;
  };
}

function RequestCreateDialog({ projectId, tab, panel, stale, onRefresh, onClose, onSaved }: {
  projectId: string; tab: "procurement" | "selections"; panel: PMPanel; stale: boolean;
  onRefresh: () => Promise<PMPanel | undefined>; onClose: () => void; onSaved: () => void;
}) {
  const [sources, setSources] = useState(panel.sources);
  const [quantity, setQuantity] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState(panel.sources[0]?.id ?? "");
  const [title, setTitle] = useState(""); const [reason, setReason] = useState(""); const [due, setDue] = useState("");
  const [ownerId, setOwnerId] = useState(""); const [conflict, setConflict] = useState(false); const [localError, setLocalError] = useState<unknown>(null);
  const command = usePMCommand(); const commandKey = useCommandKey(); const source = sources.find(item => item.id === sourceId);
  const matchingCurrent = panel.sources.find(item => item.id === sourceId);
  const changed = Boolean(source && matchingCurrent?.sourceToken !== source.sourceToken);
  const permitted = panel.actions.some(action => action.id === "create_request");
  const allowedPeople = panel.people.filter(person => source?.ownerIds?.includes(person.id));
  const selectedOwner = allowedPeople.length === 1 ? allowedPeople[0]!.id : allowedPeople.some(person => person.id === ownerId) ? ownerId : "";
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!source || stale || changed || conflict || !permitted) return;
    const body = { expectedVersion: 0, sourceId, sourceToken: source.sourceToken, reason: reason.trim(), ...(tab === "procurement" && source.quantity && source.unit ? { quantity: Number(quantity ?? source.quantity), unit: source.unit } : {}), ...(title.trim() ? { title: title.trim() } : {}), ...(due ? { dueAt: new Date(due).toISOString() } : {}), ...(selectedOwner ? { ownerId: selectedOwner } : {}) };
    setLocalError(null);
    try { await command.mutateAsync({ projectId, path: tab === "procurement" ? "procurement-requests" : "selection-requests", body: { ...body, idempotencyKey: commandKey(body) } }); onSaved(); }
    catch (error) { if (error instanceof ApiError && error.status === 409) setConflict(true); }
  }
  async function refresh() {
    try { const next = await onRefresh(); if (!next) return; setSources(next.sources); if (!next.sources.some(item => item.id === sourceId)) setSourceId(""); setConflict(false); setLocalError(null); command.reset(); }
    catch (error) { setLocalError(error); }
  }
  return <Dialog title="Raise request" eyebrow={tab === "procurement" ? "Procurement" : "Design decisions"} onClose={onClose} busy={command.isPending} className="pm-dialog">
    <form className="pm-form" onSubmit={submit}>
      <label>Requirement<select required value={sourceId} disabled={command.isPending} onChange={e => { setSourceId(e.target.value); setQuantity(null); }}><option value="">Choose a requirement</option>{sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>
      {tab === "procurement" ? source?.quantity && source.unit ? <label>Quantity ({source.unit})<input type="number" min="0.001" max={source.quantity} step="0.001" required value={quantity ?? String(source.quantity)} onChange={event => setQuantity(event.target.value)} disabled={command.isPending} /><small>Current source scope: {source.quantity} {source.unit}</small></label> : <p>Source quantity and unit are unavailable. Refresh the requirement before raising a request.</p> : null}
      <label>Request title <small>Optional; uses the requirement name when left empty</small><input value={title} maxLength={300} onChange={e => setTitle(e.target.value)} disabled={command.isPending} /></label>
      {tab === "selections" && allowedPeople.length > 1 ? <label>Responsible person<select required value={selectedOwner} onChange={e => setOwnerId(e.target.value)} disabled={command.isPending}><option value="">Choose a responsible person</option>{allowedPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label> : allowedPeople.length ? <p>Responsible owner: {allowedPeople.map(person => person.name).join(", ")}</p> : tab === "procurement" && panel.people.length ? <p>Responsible owner: {panel.people.map(person => person.name).join(", ")}</p> : null}
      <label>Needed by <small>Optional, in your local time</small><input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} disabled={command.isPending} /></label>
      <label>Reason / note<textarea required minLength={3} maxLength={2000} rows={3} value={reason} onChange={e => setReason(e.target.value)} disabled={command.isPending} /></label>
      {changed || conflict ? <div className="pm-message" role="alert"><p>The requirement or owner changed. Refresh the source and review it before submitting again. Your note is retained.</p><Button size="compact" variant="secondary" onClick={() => void refresh()}>Refresh source</Button></div> : null}
      {localError || command.error ? <p role="alert" className="pm-form-error">{pmError(localError ?? command.error)}</p> : null}
      {stale ? <p role="alert">Refresh this view before raising a request.</p> : null}
      {!permitted ? <p role="alert">Raising a request is no longer available for the current source. Close this dialog to review the project.</p> : null}
      <div className="pm-actions"><Button size="compact" variant="secondary" onClick={onClose} disabled={command.isPending}>Cancel</Button><Button type="submit" size="compact" busy={command.isPending} disabled={!source || tab === "procurement" && (!source.quantity || !source.unit) || stale || changed || conflict || !permitted}>Raise request</Button></div>
    </form>
  </Dialog>;
}

function RequestActionDialog({ projectId, tab, selected, panel, stale, onRefresh, onClose, onSaved }: {
  projectId: string; tab: PMRequestTab; selected: OpenAction; panel: PMPanel; stale: boolean;
  onRefresh: () => Promise<OpenAction | null>; onClose: () => void; onSaved: () => void;
}) {
  const { item, action } = selected;
  const [reason, setReason] = useState(""); const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [artifactKind, setArtifactKind] = useState("purchase_order"); const [artifactId, setArtifactId] = useState(""); const [lineId, setLineId] = useState("");
  const [conflict, setConflict] = useState(false); const [unavailable, setUnavailable] = useState(false); const [localError, setLocalError] = useState<unknown>(null);
  const command = usePMCommand(); const commandKey = useCommandKey();
  const current = panel.items.find(row => row.id === item.id);
  const changed = !current || current.version !== item.version || current.sourceToken !== item.sourceToken || !current.actions.some(candidate => candidate.id === action.id);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (stale || changed || conflict || unavailable || uploading || !item.sourceToken) return;
    const body = { action: action.id, expectedVersion: item.version, sourceToken: item.sourceToken, reason: reason.trim(), ...(tab === "supply" ? { evidenceIds } : {}), ...(action.id === "fulfill" ? { artifact: { kind: artifactKind, id: artifactId.trim(), ...(lineId.trim() ? { lineId: lineId.trim() } : {}) } } : {}) };
    const family = tab === "supply" ? "supply-milestones" : tab === "procurement" ? "procurement-requests" : "selection-requests";
    setLocalError(null);
    try { await command.mutateAsync({ projectId, path: `${family}/${encodeURIComponent(item.id)}/actions`, body: { ...body, idempotencyKey: commandKey(body) } }); onSaved(); }
    catch (error) { if (error instanceof ApiError && error.status === 409) setConflict(true); }
  }
  async function refresh() {
    try { const next = await onRefresh(); setUnavailable(!next); setConflict(false); command.reset(); setLocalError(null); }
    catch (error) { setLocalError(error); }
  }
  const orders = panel.items.filter(row => row.kind === "purchase_order" && row.status === "ordered");
  return <Dialog title={action.label} eyebrow={headings[tab].title} description={item.title} onClose={onClose} busy={command.isPending || uploading} className="pm-dialog">
    <form className="pm-form" onSubmit={submit}>
      {tab === "selections" && action.id === "acknowledge" ? <p>This records your awareness. The responsible Designer or Client still makes the design decision.</p> : null}
      {tab === "supply" && action.id === "sign_off" ? <p>This records your own sign-off. Each other required reviewer must sign separately.</p> : null}
      {action.id === "reopen" ? <p>A new review round will be opened. Previous sign-offs remain in the activity history.</p> : null}
      {action.id === "fulfill" ? <>
        <p>Link the existing Procurement record that fulfills this request. Ordering does not confirm physical delivery.</p>
        <label>Record type<select value={artifactKind} onChange={e => { setArtifactKind(e.target.value); setArtifactId(""); }} disabled={command.isPending}><option value="purchase_order">Approved purchase order</option><option value="purchase_order_request">Purchase order request</option><option value="procurement_item">Procurement item</option></select></label>
        {artifactKind === "purchase_order" && orders.length ? <label>Current project order<select value={orders.some(order => order.id === artifactId) ? artifactId : ""} onChange={e => setArtifactId(e.target.value)} disabled={command.isPending}><option value="">Choose an order or enter its reference below</option>{orders.map(order => <option key={order.id} value={order.id}>{order.title}</option>)}</select></label> : null}
        <label>Record reference<input required value={artifactId} maxLength={500} onChange={e => setArtifactId(e.target.value)} disabled={command.isPending} /><small>The existing record must belong to this project and requirement.</small></label>
        {artifactKind !== "procurement_item" ? <label>Line reference <small>Optional when the linked record contains a single matching requirement</small><input value={lineId} maxLength={500} onChange={e => setLineId(e.target.value)} disabled={command.isPending} /></label> : null}
      </> : null}
      {tab === "supply" && action.id === "sign_off" ? <PMEvidenceUpload projectId={projectId} entityId={item.id} onChange={setEvidenceIds} onBusyChange={setUploading} disabled={command.isPending || stale || changed} /> : null}
      <label>Reason / note<textarea required minLength={3} maxLength={2000} rows={3} value={reason} onChange={e => setReason(e.target.value)} disabled={command.isPending} /></label>
      {changed || conflict ? <div className="pm-message" role="alert"><p>This record changed. Refresh it and review the current action before trying again. Your note is retained.</p><Button size="compact" variant="secondary" onClick={() => void refresh()}>Refresh record</Button></div> : null}
      {unavailable ? <p role="alert">This action is no longer available. Close this dialog to review the updated record.</p> : null}
      {localError || command.error ? <p role="alert" className="pm-form-error">{pmError(localError ?? command.error)}</p> : null}
      {stale ? <p role="alert">Refresh this view before recording a decision.</p> : null}
      <div className="pm-actions"><Button size="compact" variant="secondary" onClick={onClose} disabled={command.isPending || uploading}>Cancel</Button><Button type="submit" size="compact" busy={command.isPending} disabled={stale || changed || conflict || unavailable || uploading || !item.sourceToken}>{action.label}</Button></div>
    </form>
  </Dialog>;
}

function EvidenceLinks({ projectId, ids }: { projectId: string; ids: string[] }) {
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<unknown>(null);
  async function download(id: string) {
    setBusy(id); setError(null);
    try { const file = await apiClient.getBlob(pmPath(projectId, `evidence/${encodeURIComponent(id)}`)); const url = URL.createObjectURL(file.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.filename ?? "project-evidence"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (error) { setError(error); } finally { setBusy(null); }
  }
  return <div className="pm-evidence"><div className="pm-actions">{ids.map((id, index) => <Button key={id} size="compact" variant="quiet" busy={busy === id} disabled={busy !== null && busy !== id} onClick={() => void download(id)}>Evidence {index + 1}</Button>)}</div>{error ? <p role="alert">{pmError(error)}</p> : null}</div>;
}
