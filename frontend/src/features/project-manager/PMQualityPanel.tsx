import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { pmDenied, pmError, pmPath, usePMCommand, usePMQuery } from "./projectManagerApi";
import type { PMCheck, PMItem, PMPanel } from "./projectManagerTypes";
import { PMActionDialog, PMBadge, PMEvidenceUpload, PMItemCard, PMPanelHeader, PMPanelRecords, PMQueryState } from "./PMShared";
import { PMEvidenceLinks, usePMOperationKey, usePMTabOffset } from "./PMVendorPanel";

export function PMQualityPanel({ projectId }: { projectId: string }) {
  const [offset, setOffset] = usePMTabOffset(); const [params] = useSearchParams(); const target = params.get("entity"); const openedTarget = useRef<string | null>(null);
  const query = usePMQuery<PMPanel>(pmPath(projectId, `quality?limit=25&offset=${offset}`)); const [selected, setSelected] = useState<PMItem | null>(null);
  useEffect(() => { if (pmDenied(query.error)) setSelected(null); }, [query.error]);
  useEffect(() => { if (!target || openedTarget.current === target || query.isError) return; const item = query.data?.items.find(item => item.id === target); if (item) { openedTarget.current = target; setSelected(item); } }, [target, query.data, query.isError]);
  const disabled = query.isError || query.isFetching;
  return <section aria-label="Quality guide"><PMPanelHeader title="Quality guide" description="Weekly checks for each issued vendor package. Failed findings remain visible after signing." />
    <PMQueryState query={query}>{panel => <><PMPanelRecords panel={panel} render={item => <PMItemCard key={item.id} item={item} actions={<Button size="compact" variant="secondary" disabled={disabled} onClick={() => setSelected(item)}>{item.actions.some(action => action.id === "save_audit") ? "Open checklist" : "View checklist"}</Button>}>
      <p>{item.checks?.length ?? 0} checks</p>
    </PMItemCard>} /><div className="pm-pagination"><span>{panel.total ? `${offset + 1}–${Math.min(offset + panel.items.length, panel.total)} of ${panel.total}` : "0 records"}</span><div className="pm-actions"><Button size="compact" variant="secondary" disabled={!offset || disabled} onClick={() => setOffset(old => Math.max(0, old - 25))}>Previous</Button><Button size="compact" variant="secondary" disabled={offset + panel.items.length >= panel.total || disabled} onClick={() => setOffset(old => old + 25)}>Next</Button></div></div></>}</PMQueryState>
    {selected && !pmDenied(query.error) ? <QualityEditor key={selected.id} projectId={projectId} item={selected} disabled={disabled} onClose={() => setSelected(null)} onRefresh={async () => { await query.refetch(); }} /> : null}
  </section>;
}
function answerPayload(checks: PMCheck[]) { return checks.filter((check): check is PMCheck & { answer: NonNullable<PMCheck["answer"]> } => check.answer !== null).map(check => ({ id: check.id, answer: check.answer, reason: check.reason?.trim() || null, evidenceIds: check.evidenceIds, sampleCount: check.sampleCount ?? 1 })); }
function evidenceSummary(check: PMCheck) { const requirements = check.evidence; if (!requirements) return ""; return [requirements.photos ? `${Math.max(1, requirements.minPhotosPerSample ?? 1)} photo(s) per sample` : null, requirements.documents ? "Supporting document" : null, requirements.video ? "Video" : null].filter(Boolean).join(" · "); }
function QualityEditor({ projectId, item, disabled, onClose, onRefresh }: { projectId: string; item: PMItem; disabled: boolean; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [current, setCurrent] = useState(item); const [checks, setChecks] = useState<PMCheck[]>(() => (item.checks ?? []).map(check => ({ ...check, evidenceIds: [...check.evidenceIds] })));
  const [savedAnswers, setSavedAnswers] = useState(() => JSON.stringify(answerPayload(item.checks ?? [])));
  const [signature, setSignature] = useState(""); const [error, setError] = useState<unknown>(null); const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<string[]>([]); const [correcting, setCorrecting] = useState(false);
  const command = usePMCommand(); const commandKey = usePMOperationKey(); const form = useRef<HTMLFormElement>(null);
  const canEdit = current.actions.some(action => action.id === "save_audit");
  const canSign = current.actions.some(action => action.id === "sign_audit");
  const dirty = JSON.stringify(answerPayload(checks)) !== savedAnswers;
  const busy = command.isPending || uploading.length > 0;
  function update(id: string, patch: Partial<PMCheck>) { setChecks(old => old.map(check => check.id === id ? { ...check, ...patch } : check)); setMessage(""); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || disabled || busy) return;
    if (!current.orderId || !current.basketId || !current.week || !current.sourceToken) { setError(new Error("The checklist source is incomplete. Refresh before saving.")); return; }
    const payload = { expectedVersion: current.version, action: "save", orderId: current.orderId, basketId: current.basketId, sourceToken: current.sourceToken, week: current.week, answers: answerPayload(checks) };
    setError(null); setMessage("");
    try { const next = await command.mutateAsync({ projectId, path: `quality-audits/${encodeURIComponent(current.id)}`, method: "put", body: { ...payload, idempotencyKey: commandKey(payload) } }) as PMItem; setCurrent(next); setSavedAnswers(JSON.stringify(answerPayload(checks))); setMessage("Draft saved."); } catch (cause) { setError(cause); }
  }
  async function sign() {
    if (!canSign || disabled || busy || dirty) return;
    if (checks.some(check => check.answer === null)) { setError(new Error("Answer every check before signing.")); return; }
    if (signature.trim().length < 3) { setError(new Error("Enter a signature note before signing.")); return; }
    if (!form.current?.reportValidity()) return;
    const payload = { expectedVersion: current.version, sourceToken: current.sourceToken, reason: signature.trim() };
    setError(null); try { const next = await command.mutateAsync({ projectId, path: `quality-audits/${encodeURIComponent(current.id)}/sign`, body: { ...payload, idempotencyKey: commandKey(payload) } }) as PMItem; setCurrent(next); setMessage(next.status === "signed_with_findings" ? "Audit signed with findings. Failed checks remain recorded." : "Audit signed."); } catch (cause) { setError(cause); }
  }
  return <Dialog title={current.title} eyebrow="Weekly quality audit" description={current.description ?? undefined} className="pm-dialog pm-quality-dialog" onClose={onClose} busy={busy}>
    <div className="pm-quality-intro"><PMBadge value={current.status} severity={current.severity} /><span>{checks.filter(check => check.answer !== null).length} of {checks.length} answered</span></div>
    <form className="pm-form pm-checklist" ref={form} onSubmit={save}>
      {checks.map((check, index) => <fieldset className="pm-quality-check" key={check.id} disabled={canEdit && (disabled || busy)}><legend>{index + 1}. {check.label}</legend>
        {check.instructions ? <p>{check.instructions}</p> : null}
        {canEdit ? <div className="pm-check-result"><label>Result<select aria-label={`Result for ${check.label}`} value={check.answer ?? ""} onChange={e => update(check.id, { answer: e.target.value as PMCheck["answer"] || null })}><option value="">Not checked</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="not_applicable">Not applicable</option></select></label>
          <label>Samples checked<input aria-label={`Samples checked for ${check.label}`} type="number" min={1} max={1000} required value={check.sampleCount ?? 1} onChange={e => update(check.id, { sampleCount: Number(e.target.value) })} /></label></div> : <PMBadge value={check.answer ?? "Not checked"} severity={check.answer === "fail" ? "warning" : check.answer === "pass" ? "success" : "neutral"} />}
        {canEdit ? <label>Finding / reason<textarea aria-label={`Finding for ${check.label}`} value={check.reason ?? ""} required={check.answer === "fail" || check.answer === "not_applicable"} minLength={check.answer === "fail" || check.answer === "not_applicable" ? 3 : undefined} maxLength={2000} rows={2} onChange={e => update(check.id, { reason: e.target.value })} /></label> : check.reason ? <p>{check.reason}</p> : null}
        {evidenceSummary(check) ? <p className="pm-evidence-requirement">Required evidence: {evidenceSummary(check)}</p> : null}{check.evidence?.instructions ? <p>{check.evidence.instructions}</p> : null}
        {canEdit ? <PMEvidenceUpload key={`${current.id}:${check.id}`} projectId={projectId} entityId={current.id} existingIds={check.evidenceIds} onChange={ids => update(check.id, { evidenceIds: [...new Set([...check.evidenceIds, ...ids])] })} onBusyChange={value => setUploading(old => value ? [...new Set([...old, check.id])] : old.filter(id => id !== check.id))} disabled={disabled || command.isPending} /> : null}
        <PMEvidenceLinks projectId={projectId} ids={check.evidenceIds} />
      </fieldset>)}
      {canEdit ? <><div className="pm-actions"><Button size="compact" type="submit" disabled={disabled || busy} busy={command.isPending}>Save draft</Button><span>Drafts may be incomplete. Failed and not-applicable checks need a reason.</span></div>
        <div className="pm-quality-signature"><h3>Weekly signature</h3><p>Signing records this inspection, including failed findings. It does not mark failed work as passed.</p><label>Signature note<textarea value={signature} onChange={e => setSignature(e.target.value)} rows={2} maxLength={2000} /></label>{dirty ? <p role="status">Save your changes before signing.</p> : null}<Button type="button" size="compact" disabled={!canSign || dirty || disabled || busy} onClick={() => void sign()}>Sign audit</Button></div></> : null}
      {current.actions.some(action => action.id === "correct") ? <Button size="compact" variant="secondary" type="button" disabled={disabled || busy} onClick={() => setCorrecting(true)}>Create correction</Button> : null}
      {error ? <div role="alert"><p>{pmError(error)}</p><Button size="compact" variant="quiet" type="button" onClick={() => void onRefresh()}>Refresh current records</Button><p>Your entries are preserved. Close and reopen the checklist to use a newer source or version.</p></div> : null}
      {message ? <p role="status">{message}</p> : null}
    </form>
    {correcting ? <CorrectionDialog projectId={projectId} item={current} onClose={() => setCorrecting(false)} onCreated={next => { setCorrecting(false); setCurrent(next); setChecks(next.checks ?? []); setSavedAnswers(JSON.stringify(answerPayload(next.checks ?? []))); setSignature(""); setError(null); setMessage("Correction draft created. The previous signature is preserved."); }} /> : null}
  </Dialog>;
}
function CorrectionDialog({ projectId, item, onClose, onCreated }: { projectId: string; item: PMItem; onClose: () => void; onCreated: (item: PMItem) => void }) {
  const command = usePMCommand(); const commandKey = usePMOperationKey(); const [error, setError] = useState<unknown>(null);
  return <PMActionDialog title="Create correction" description="The signed audit is preserved. A separate draft will record the correction." onClose={onClose} busy={command.isPending} error={error} submitLabel="Create draft" onSubmit={async reason => { const payload = { action: "correct", expectedVersion: item.version, reason }; setError(null); try { const next = await command.mutateAsync({ projectId, path: `quality-audits/${encodeURIComponent(item.id)}`, method: "put", body: { ...payload, idempotencyKey: commandKey(payload) } }) as PMItem; onCreated(next); } catch (cause) { setError(cause); } }} />;
}
