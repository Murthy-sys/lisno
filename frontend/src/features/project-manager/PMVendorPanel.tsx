import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import type { ExecutionPage } from "../execution/executionApi";
import { pmDenied, pmError, pmKey, pmPath, pmRecordId, usePMCommand, usePMQuery } from "./projectManagerApi";
import type { PMItem, PMPanel } from "./projectManagerTypes";
import { PMActionDialog, PMEvidenceUpload, PMItemCard, PMPanelHeader, PMPanelRecords, PMQueryState, pmMoney } from "./PMShared";

/** Reuse one key for an identical retry, while a changed payload is a new command. */
export function usePMOperationKey() {
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  return (payload: unknown) => { const signature = JSON.stringify(payload); if (attempt.current?.signature !== signature) attempt.current = { signature, key: pmKey() }; return attempt.current.key; };
}
export function usePMTabOffset() {
  const [params, setParams] = useSearchParams(); const raw = Number(params.get("tabOffset") ?? "0");
  const offset = Number.isSafeInteger(raw) && raw >= 0 && raw <= 100000 ? raw : 0;
  function setOffset(value: number | ((previous: number) => number)) { const next = typeof value === "function" ? value(offset) : value; setParams(old => { const result = new URLSearchParams(old); if (next) result.set("tabOffset", String(next)); else result.delete("tabOffset"); result.delete("entity"); return result; }, { replace: true }); }
  return [offset, setOffset] as const;
}
export function PMEvidenceLinks({ projectId, ids = [] }: { projectId: string; ids?: string[] }) {
  const auth = useAuth(); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState<string | null>(null);
  if (!ids.length || !hasFrontendPermission(auth.authorization, "pm.evidence.read")) return null;
  return <div className="pm-evidence-links"><span>Evidence</span>{ids.map((id, index) => <Button key={id} size="compact" variant="quiet" busy={busy === id} disabled={busy !== null} onClick={async () => {
    setBusy(id); setError(null); try { const file = await apiClient.getBlob(pmPath(projectId, `evidence/${encodeURIComponent(id)}`)); const url = URL.createObjectURL(file.blob); const link = document.createElement("a"); link.href = url; link.download = file.filename ?? `evidence-${index + 1}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (cause) { setError(cause); } finally { setBusy(null); }
  }}>File {index + 1}</Button>)}{error ? <p role="alert">{pmError(error)}</p> : null}</div>;
}
type Selection = { item: PMItem; action: string; label: string };
export function PMVendorPanel({ projectId }: { projectId: string }) {
  const [offset, setOffset] = usePMTabOffset();
  const query = usePMQuery<PMPanel>(pmPath(projectId, `vendors?limit=25&offset=${offset}`)); const [selected, setSelected] = useState<Selection | null>(null);
  useEffect(() => { if (pmDenied(query.error)) setSelected(null); }, [query.error]);
  const disabled = query.isError || query.isFetching;
  function actions(item: PMItem) { return item.actions.map(action => <Button key={action.id} size="compact" variant="secondary" disabled={disabled} onClick={() => setSelected({ item, action: action.id, label: action.label })}>{action.label}</Button>); }
  return <section aria-label="Vendor control"><PMPanelHeader title="Vendor control" description="Notices, issued payment milestones and certification evidence." />
    <PMQueryState query={query}>{panel => <><PMPanelRecords panel={panel} render={vendor => <PMItemCard key={vendor.id} item={vendor} actions={actions(vendor)}>
      {vendor.amountPaise != null ? <p className="pm-milestone-value">Milestone amount <strong>{pmMoney(vendor.amountPaise)}</strong></p> : null}<PMEvidenceLinks projectId={projectId} ids={vendor.evidenceIds} />
      {vendor.children?.length ? <div className="pm-subrecords">{vendor.children.map(item => <PMItemCard key={item.id} item={item} actions={actions(item)}>{item.amountPaise != null ? <p className="pm-milestone-value">Milestone amount <strong>{pmMoney(item.amountPaise)}</strong></p> : null}<PMEvidenceLinks projectId={projectId} ids={item.evidenceIds} /></PMItemCard>)}</div> : null}
    </PMItemCard>} /><div className="pm-pagination"><span>{panel.total ? `${offset + 1}–${Math.min(offset + panel.items.length, panel.total)} of ${panel.total}` : "0 records"}</span><div className="pm-actions"><Button size="compact" variant="secondary" disabled={!offset || disabled} onClick={() => setOffset(old => Math.max(0, old - 25))}>Previous</Button><Button size="compact" variant="secondary" disabled={offset + panel.items.length >= panel.total || disabled} onClick={() => setOffset(old => old + 25)}>Next</Button></div></div></>}</PMQueryState>
    {selected && !pmDenied(query.error) ? <VendorAction key={`${selected.item.id}:${selected.action}`} projectId={projectId} selection={selected} disabled={disabled} onClose={() => setSelected(null)} onRefresh={async () => { const fresh = await query.refetch(); const item = fresh.data?.items.flatMap(row => [row, ...(row.children ?? [])]).find(row => row.id === selected.item.id); if (item) setSelected({ ...selected, item }); }} /> : null}
  </section>;
}
const noticeNames = { quality: "Quality warning", absenteeism: "Absenteeism", misbehaviour: "Conduct notice", ppe: "PPE violation", cleaning: "Cleaning issue", stop_work: "Stop work" } as const;
function VendorAction({ projectId, selection, disabled, onClose, onRefresh }: { projectId: string; selection: Selection; disabled: boolean; onClose: () => void; onRefresh: () => Promise<void> }) {
  const { item, action, label } = selection; const command = usePMCommand(); const commandKey = usePMOperationKey();
  const [kind, setKind] = useState<keyof typeof noticeNames>("quality"); const [reviewDate, setReviewDate] = useState("");
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]); const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [recordId] = useState(() => pmRecordId(action === "issue_notice" ? "notice" : "certification")); const [error, setError] = useState<unknown>(null);
  const [offset, setOffset] = useState(0); const [uploading, setUploading] = useState(false);
  const execution = usePMQuery<ExecutionPage>(`/projects/${encodeURIComponent(projectId)}/execution?vendorId=${encodeURIComponent(item.vendorId ?? item.id)}&limit=100&offset=${offset}`, action === "issue_notice" && kind === "stop_work");
  const versions = useRef(new Map<string, number>());
  const eligible = execution.data?.items.filter(work => work.allowedActions.includes("hold")) ?? [];
  async function submit(reason: string) {
    if (disabled || uploading || !item.actions.some(candidate => candidate.id === action)) { setError(new Error("Refresh this view before making a decision.")); return; }
    let path: string; let payload: Record<string, unknown>;
    if (action === "issue_notice") {
      if (!item.sourceToken) { setError(new Error("Refresh the issued vendor source.")); return; }
      if (kind === "stop_work" && (!selectedAssignments.length || execution.isError || execution.isFetching)) { setError(new Error("Choose eligible work from the current execution tracker.")); return; }
      path = "vendor-notices"; payload = { expectedVersion: 0, recordId, vendorId: item.vendorId ?? item.id, sourceToken: item.sourceToken, kind, reason, evidenceIds,
        ...(kind === "stop_work" ? { reviewDate, assignments: selectedAssignments.map(assignmentId => ({ assignmentId, expectedVersion: versions.current.get(assignmentId) })) } : {}) };
    } else if (action === "request_certification") {
      if (!item.orderId || !item.milestoneId || !item.sourceToken) { setError(new Error("The issued milestone is incomplete. Refresh before requesting certification.")); return; }
      path = "certifications"; payload = { expectedVersion: 0, recordId, orderId: item.orderId, milestoneId: item.milestoneId, sourceToken: item.sourceToken, reason, evidenceIds };
    } else {
      const certification = item.kind === "certification";
      path = `${certification ? "certifications" : "vendor-notices"}/${encodeURIComponent(item.id)}/actions`;
      payload = { expectedVersion: item.version, action, reason, evidenceIds, ...(certification ? { sourceToken: item.sourceToken } : {}) };
    }
    setError(null); try { await command.mutateAsync({ projectId, path, body: { ...payload, idempotencyKey: commandKey(payload) } }); onClose(); } catch (cause) { setError(cause); }
  }
  const newRecord = action === "issue_notice" || action === "request_certification";
  return <PMActionDialog title={label} description={item.title} onClose={onClose} onSubmit={submit} busy={command.isPending || uploading} error={error} submitLabel={label}>
    {action === "issue_notice" ? <><label>Notice type<select value={kind} onChange={e => { setKind(e.target.value as keyof typeof noticeNames); setSelectedAssignments([]); }}>{Object.entries(noticeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      {kind === "stop_work" ? <><label>Review date<input type="date" value={reviewDate} required onChange={e => setReviewDate(e.target.value)} /></label><p>Selected work is put on hold in the same transaction as this notice. Resuming work requires a separate execution review.</p>
        <PMQueryState query={execution}>{data => <fieldset className="pm-choice-list"><legend>Assignments to hold</legend>{eligible.length ? eligible.map(work => <label key={work.id}><input type="checkbox" checked={selectedAssignments.includes(work.id)} onChange={e => { if (e.target.checked) versions.current.set(work.id, work.version); setSelectedAssignments(old => e.target.checked ? [...old, work.id] : old.filter(id => id !== work.id)); }} /><span>{work.itemName}<small>{work.roomName} · {work.progress}% reported</small></span></label>) : <p>No eligible assignments on this page. Work already held or submitted cannot be held again.</p>}{data.total > 100 ? <div className="pm-actions"><Button size="compact" variant="secondary" type="button" disabled={!offset} onClick={() => setOffset(old => Math.max(0, old - 100))}>Previous work</Button><Button size="compact" variant="secondary" type="button" disabled={offset + data.items.length >= data.total} onClick={() => setOffset(old => old + 100)}>Next work</Button></div> : null}</fieldset>}</PMQueryState></> : null}</> : null}
    <PMEvidenceUpload projectId={projectId} entityId={newRecord ? recordId : item.id} onChange={setEvidenceIds} onBusyChange={setUploading} disabled={command.isPending || disabled} />
    {error ? <Button type="button" size="compact" variant="quiet" onClick={() => void onRefresh()}>Refresh current records</Button> : null}
  </PMActionDialog>;
}
