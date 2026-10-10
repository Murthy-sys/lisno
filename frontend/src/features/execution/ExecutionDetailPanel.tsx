import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, apiClient } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { procurementError } from "../procurement/procurementPresentation";
import { getVendorWorkDetail, submitVendorWork, uploadVendorWorkImage, vendorWorkKeys } from "../vendor/vendorWorkApi";
import { VendorApprovedOrder } from "../vendor/VendorApprovedOrder";
import { executionApi, executionKeys, type ExecutionAction, type ExecutionCommand, type ExecutionWork } from "./executionApi";
import { executionActionLabels, executionDate, executionLabel, executionStatusLabels, executionTime } from "./executionPresentation";

type Draft = { action: ExecutionAction; version: number; note: string; reason: string; nextAction: string; progress: string; status: "not_started" | "in_progress" | "blocked"; startDate: string; finishDate: string; reviewDate: string; submissionId?: string };
function makeDraft(work: ExecutionWork, action: ExecutionAction): Draft {
  return { action, version: work.version, note: "", reason: "", nextAction: "", progress: String(work.progress), status: work.status === "blocked" ? "blocked" : work.progress === 0 ? "not_started" : "in_progress", startDate: work.proposedSchedule?.startDate ?? work.schedule?.startDate ?? "", finishDate: work.proposedSchedule?.finishDate ?? work.schedule?.finishDate ?? "", reviewDate: "", submissionId: work.submission?.id };
}

export function ExecutionDetailPanel({ assignmentId, vendor, onClose, renderLegacy, compact = false, initialAction, expectedProjectId, onDirty, onBusy }: { assignmentId: string; vendor: boolean; timezone?: string; onClose: () => void; renderLegacy?: (id: string, close: () => void) => ReactNode; compact?: boolean; initialAction?: ExecutionAction; expectedProjectId?: string; onDirty?: (dirty: boolean) => void; onBusy?: (busy: boolean) => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: executionKeys.detail(assignmentId), queryFn: ({ signal }) => executionApi.detail(assignmentId, signal) });
  const [draft,setDraft] = useState<Draft | null>(null);
  const [notice,setNotice] = useState("");
  const [validation,setValidation] = useState("");
  const [uploadDirty,setUploadDirty] = useState(false);
  const [uploadBusy,setUploadBusy] = useState(false);
  const [clientDirty,setClientDirty] = useState(false);
  const [clientBusy,setClientBusy] = useState(false);
  const receipt = useRef({ signature: "", key: "" });
  const denied = (query.error instanceof ApiError && [401,403,404].includes(query.error.status)) || Boolean(expectedProjectId && query.data && query.data.projectId !== expectedProjectId);
  const work = denied ? undefined : query.data;
  const timezone = work?.timezone;
  const action = draft?.action ?? (initialAction && work?.allowedActions.includes(initialAction) ? initialAction : work?.allowedActions.includes("report") ? "report" : work?.allowedActions[0]);
  const current = draft ?? (work && action ? makeDraft(work,action) : null);
  const stale = Boolean(draft && work && draft.version !== work.version);
  const mutation = useMutation({
    mutationFn: (input: ExecutionCommand) => vendor ? executionApi.vendorCommand(assignmentId,input) : executionApi.staffCommand(work!.projectId,assignmentId,input),
    onSuccess: async updated => {
      queryClient.setQueryData(executionKeys.detail(assignmentId),updated);
      setDraft(null); setNotice("Update saved."); setValidation(""); receipt.current = { signature: "", key: "" };
      await Promise.all([queryClient.invalidateQueries({ queryKey: executionKeys.all }),queryClient.invalidateQueries({ queryKey: vendorWorkKeys.all }),queryClient.invalidateQueries({ queryKey: ["vendor-work"] }),queryClient.invalidateQueries({ queryKey: ["site-completion"] }), queryClient.invalidateQueries({ queryKey: ["project-workflow", "project-status"] }), queryClient.invalidateQueries({ queryKey: ["project-workflow", "operational"] }), queryClient.invalidateQueries({ queryKey: ["designer", "kpi"] })]);
    },
    onError: error => { if (error instanceof ApiError && error.status === 409) void query.refetch(); }
  });
  useEffect(() => { onDirty?.(Boolean(draft || uploadDirty || clientDirty)); }, [draft, uploadDirty, clientDirty, onDirty]);
  useEffect(() => { onBusy?.(mutation.isPending || uploadBusy || clientBusy); }, [mutation.isPending, uploadBusy, clientBusy, onBusy]);
  useEffect(() => () => { onDirty?.(false); onBusy?.(false); }, [onDirty, onBusy]);
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) { if (current) { setDraft({ ...current, [key]: value }); setNotice(""); setValidation(""); mutation.reset(); } }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!current || !work || !work.allowedActions.includes(current.action)) return setValidation("This action is no longer available. Refresh the assignment.");
    if (stale) return setValidation("The assignment changed. Review its latest version before retrying.");
    const input: Omit<ExecutionCommand,"idempotencyKey"> = { action: current.action, expectedVersion: current.version };
    if (current.note.trim()) input.note = current.note.trim();
    if (current.reason.trim()) input.reason = current.reason.trim();
    if (["propose_schedule","confirm_schedule"].includes(current.action)) {
      if (!current.startDate || !current.finishDate || current.finishDate < current.startDate) return setValidation("Choose a start date and a finish date on or after it.");
      input.startDate = current.startDate; input.finishDate = current.finishDate;
      if (work.schedule && !input.reason) return setValidation("Give a reason for changing the committed schedule.");
    }
    if (current.action === "report") {
      const progress = Number(current.progress);
      if (!current.progress.trim() || !Number.isInteger(progress) || progress < 0 || progress > 100) return setValidation("Enter a whole progress percentage from 0 to 100.");
      if (!input.note) return setValidation("Add a work note for today's report.");
      if ((progress <= work.progress || current.status === "blocked") && !input.reason) return setValidation("Give a reason for no progress, rework or a blocker.");
      if (current.status === "blocked" && !current.nextAction.trim()) return setValidation("State the next action needed to resolve this blocker.");
      input.progress = progress; input.status = current.status; input.imageIds = work.imageIds;
      if (current.nextAction.trim()) input.nextAction = current.nextAction.trim();
    }
    if (current.action === "submit") {
      if (!input.note) return setValidation("Add a completion note for the Site Manager.");
      if (work.progress !== 100) return setValidation("Save a daily update at 100% before submitting completion.");
      if (!work.imageIds.length && !work.evidenceExemption) return setValidation("Add a photo for the current round or request a Site Manager photo exemption.");
      input.imageIds = work.imageIds;
    }
    if (["verify","request_changes"].includes(current.action)) {
      if (!current.submissionId) return setValidation("There is no current submission to review.");
      input.submissionId = current.submissionId;
    }
    if (["request_changes","hold","resume","exempt_evidence"].includes(current.action) && !input.reason) return setValidation("A reason is required for this action.");
    if (current.action === "hold") { if (!current.reviewDate) return setValidation("Set a hold review date."); input.reviewDate = current.reviewDate; }
    const signature = JSON.stringify(input);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    setValidation(""); mutation.mutate({ ...input, idempotencyKey: receipt.current.key });
  }
  return <ContextPanel className={compact ? "execution-panel site-execution-panel" : "execution-panel"} title={work?.itemName ?? "Main Line assignment"} eyebrow="Execution detail" width="wide" dirty={Boolean(draft || uploadDirty || clientDirty)} busy={mutation.isPending || uploadBusy || clientBusy} onClose={onClose}>
    {query.isPending ? <PageState state="loading" message="Loading assignment…" /> : denied ? <PageState state="error" message="You no longer have access to this assignment." /> : !work ? <PageState state="error" message={procurementError(query.error,"Assignment could not be loaded.")} action={{ label: "Try again", onAction: () => void query.refetch() }} /> : <div className="execution__detail">
      {query.isError ? <InlineMessage tone="warning">Refresh failed. This assignment may be out of date.</InlineMessage> : null}
      <div><p className="execution__muted">{work.projectName} · {work.vendorName}</p><p>{[work.mainBasketName,work.subBasketName,work.roomName].filter(Boolean).join(" · ")}</p></div>
      <div className="execution__actions"><span className="execution__status" data-status={work.status}>{work.tracking === "legacy_review" && work.legacyStatus === "submitted_for_client" ? "With Client (existing review)" : executionStatusLabels[work.status]}</span><Button size="compact" variant="secondary" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh assignment</Button></div>
      {!compact ? <p>{work.description}</p> : null}
      {!work.sourceAvailable ? <InlineMessage tone="warning">The Configuration link is unavailable. Issued scope is retained; no replacement Main Line is assumed.</InlineMessage> : null}
      {compact ? <>
        <dl className="execution__facts"><div><dt>Vendor reported</dt><dd>{work.progress}% · {executionTime(work.latestReportAt,timezone)}</dd></div><div><dt>Site verification</dt><dd>{work.verification ? executionTime(work.verification.verifiedAt,timezone) : "Not verified"}</dd></div><div><dt>Confirmed schedule</dt><dd>{work.schedule ? `${executionDate(work.schedule.startDate)} to ${executionDate(work.schedule.finishDate)}` : "Not confirmed"}</dd></div><div><dt>Next action owner</dt><dd>{executionLabel(work.nextOwner)}</dd></div></dl>
        <details className="execution__disclosure"><summary>Issued scope & reporting details</summary><p>{work.description}</p>
      <dl className="execution__facts"><div><dt>Issued order</dt><dd>{work.orderNumber} · Revision {work.orderRevision}</dd></div><div><dt>Issued quantity</dt><dd>{work.quantityMilliUnits !== null && work.uomCode ? `${work.quantityMilliUnits / 1000} ${work.uomCode}` : "Unavailable"}</dd></div><div><dt>Original issued target</dt><dd>{work.originalTargetDate ? executionDate(work.originalTargetDate) : "No issued target"}</dd></div><div><dt>Confirmed schedule</dt><dd>{work.schedule ? `${executionDate(work.schedule.startDate)} to ${executionDate(work.schedule.finishDate)} (revision ${work.schedule.revision})` : "Not confirmed"}</dd></div><div><dt>Vendor reported</dt><dd>{work.progress}% · {executionTime(work.latestReportAt,timezone)}</dd></div><div><dt>Site verification</dt><dd>{work.verification ? executionTime(work.verification.verifiedAt,timezone) : "Not verified"}</dd></div><div><dt>Daily reporting ({timezone})</dt><dd>{executionLabel(work.daily.state)}{work.daily.dueAt ? ` · Due ${executionTime(work.daily.dueAt,timezone)}` : ""}</dd></div><div><dt>Reporting starts</dt><dd>{work.reportingStartsOn ? executionDate(work.reportingStartsOn) : "Awaiting eligibility"}</dd></div><div><dt>Next action owner</dt><dd>{executionLabel(work.nextOwner)}</dd></div><div><dt>Execution round</dt><dd>{work.executionRound}</dd></div></dl>
        </details>
      </> : (
      <dl className="execution__facts"><div><dt>Issued order</dt><dd>{work.orderNumber} · Revision {work.orderRevision}</dd></div><div><dt>Issued quantity</dt><dd>{work.quantityMilliUnits !== null && work.uomCode ? `${work.quantityMilliUnits / 1000} ${work.uomCode}` : "Unavailable"}</dd></div><div><dt>Original issued target</dt><dd>{work.originalTargetDate ? executionDate(work.originalTargetDate) : "No issued target"}</dd></div><div><dt>Confirmed schedule</dt><dd>{work.schedule ? `${executionDate(work.schedule.startDate)} to ${executionDate(work.schedule.finishDate)} (revision ${work.schedule.revision})` : "Not confirmed"}</dd></div><div><dt>Vendor reported</dt><dd>{work.progress}% · {executionTime(work.latestReportAt,timezone)}</dd></div><div><dt>Site verification</dt><dd>{work.verification ? executionTime(work.verification.verifiedAt,timezone) : "Not verified"}</dd></div><div><dt>Daily reporting ({timezone})</dt><dd>{executionLabel(work.daily.state)}{work.daily.dueAt ? ` · Due ${executionTime(work.daily.dueAt,timezone)}` : ""}</dd></div><div><dt>Reporting starts</dt><dd>{work.reportingStartsOn ? executionDate(work.reportingStartsOn) : "Awaiting eligibility"}</dd></div><div><dt>Next action owner</dt><dd>{executionLabel(work.nextOwner)}</dd></div><div><dt>Execution round</dt><dd>{work.executionRound}</dd></div></dl>
      )}
      {work.proposedSchedule ? <InlineMessage tone="info">Proposed schedule: {executionDate(work.proposedSchedule.startDate)} to {executionDate(work.proposedSchedule.finishDate)}.{work.proposedSchedule.reason ? ` Reason: ${work.proposedSchedule.reason}` : ""}</InlineMessage> : null}
      {work.hold ? <InlineMessage tone="warning">On hold: {work.hold.reason}. Review {executionDate(work.hold.reviewDate)}.</InlineMessage> : null}
      {compact ? work.latestVendorReport ? <div><h3>Latest vendor report</h3><p>{work.latestVendorReport.note}</p>{work.latestVendorReport.reason ? <p>Reported reason: {work.latestVendorReport.reason}</p> : null}{work.latestVendorReport.nextAction ? <p>Reported next action: {work.latestVendorReport.nextAction}</p> : null}</div> : null : work.latestNote ? <div><h3>Latest activity note</h3><p>{work.latestNote}</p></div> : null}
      {work.submission ? <div><h3>Completion submission</h3><p>{work.submission.note}</p><p className="execution__muted">Submitted {executionTime(work.submission.submittedAt,timezone)} · Version {work.submission.version}</p></div> : null}
      {work.evidenceExemption ? <InlineMessage tone="info">Photo exemption: {work.evidenceExemption.reason}. This exemption is not completion verification.</InlineMessage> : null}
      {vendor ? <VendorApprovedOrder orderId={work.orderId} /> : null}
      {compact ? <LazyExecutionDisclosure label={`Photos & evidence (${(work.submission?.imageIds ?? work.imageIds).length})`}><ExecutionEvidence work={work} vendor={vendor} disabled={mutation.isPending || clientBusy} onDirty={setUploadDirty} onBusy={setUploadBusy} /></LazyExecutionDisclosure> : <ExecutionEvidence work={work} vendor={vendor} disabled={mutation.isPending || clientBusy} onDirty={setUploadDirty} onBusy={setUploadBusy} />}
      {work.tracking === "legacy_review" ? <><InlineMessage tone="info">This assignment retains its existing Client review. Its saved approval history is unchanged.</InlineMessage>{vendor && renderLegacy ? renderLegacy(work.id,onClose) : null}</> : null}
      {work.allowedActions.length && current && work.tracking !== "legacy_review" ? <form className="execution__form" aria-label="Update Main Line workflow" onSubmit={submit}>
        <h3>Next action</h3><fieldset disabled={mutation.isPending || uploadBusy || query.isError}>
          <Field id="execution-action" label="Action">{props => <Select {...props} value={current.action} onChange={event => { setDraft(makeDraft(work,event.target.value as ExecutionAction)); mutation.reset(); setValidation(""); }}>{!work.allowedActions.includes(current.action) ? <option value={current.action}>{executionActionLabels[current.action]} (no longer available)</option> : null}{work.allowedActions.map(value => <option key={value} value={value}>{executionActionLabels[value]}</option>)}</Select>}</Field>
          {current.action === "acknowledge" ? <p className="execution__muted">Confirm you have reviewed this issued scope. Propose your start and finish dates next.</p> : null}
          {current.action === "setup" ? <p className="execution__muted">Enable the current tracking workflow for this issued assignment. Earlier reports and approval history remain unchanged.</p> : null}
          {["propose_schedule","confirm_schedule"].includes(current.action) ? <div className="execution__form-row"><Field id="execution-start" label="Start date" required>{props => <Input {...props} type="date" value={current.startDate} onChange={event => edit("startDate",event.target.value)} />}</Field><Field id="execution-finish" label="Committed finish date" required>{props => <Input {...props} type="date" min={current.startDate || undefined} value={current.finishDate} onChange={event => edit("finishDate",event.target.value)} />}</Field></div> : null}
          {current.action === "report" ? <><div className="execution__form-row"><Field id="execution-report-status" label="Work status" required>{props => <Select {...props} value={current.status} onChange={event => edit("status",event.target.value as Draft["status"])}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option></Select>}</Field><Field id="execution-progress" label="Vendor reported progress (%)" required>{props => <Input {...props} type="number" min={0} max={100} step={1} value={current.progress} onChange={event => edit("progress",event.target.value)} />}</Field></div><p className="execution__muted">A report at 100% still requires a separate completion submission and Site Manager verification.</p></> : null}
          {["report","submit","verify"].includes(current.action) ? <Field id="execution-note" label={current.action === "submit" ? "Completion note" : current.action === "verify" ? "Verification note" : "Work note"} required={current.action !== "verify"}>{props => <Textarea {...props} rows={3} maxLength={2000} value={current.note} onChange={event => edit("note",event.target.value)} />}</Field> : null}
          {["report","request_changes","hold","resume","exempt_evidence","propose_schedule","confirm_schedule"].includes(current.action) ? <Field id="execution-reason" label="Reason" hint={current.action === "report" ? "Required for no progress, reduced progress or a blocker." : "Required for changes to an existing commitment or workflow decision."} required={["request_changes","hold","resume","exempt_evidence"].includes(current.action)}>{props => <Textarea {...props} rows={2} maxLength={2000} value={current.reason} onChange={event => edit("reason",event.target.value)} />}</Field> : null}
          {current.action === "report" && current.status === "blocked" ? <Field id="execution-next-action" label="Next action to resolve blocker" required>{props => <Textarea {...props} rows={2} maxLength={2000} value={current.nextAction} onChange={event => edit("nextAction",event.target.value)} />}</Field> : null}
          {current.action === "hold" ? <Field id="execution-hold-review" label="Hold review date" required>{props => <Input {...props} type="date" value={current.reviewDate} onChange={event => edit("reviewDate",event.target.value)} />}</Field> : null}
          {current.action === "verify" ? <InlineMessage tone="info">Verify only after checking this exact submission and its evidence. Client acceptance remains a separate decision.</InlineMessage> : null}
          <div className="execution__actions"><Button type="submit" disabled={stale || !work.allowedActions.includes(current.action)} busy={mutation.isPending}>{executionActionLabels[current.action]}</Button></div>
        </fieldset>
        {stale ? <InlineMessage tone="warning">This assignment changed while you were editing. Your inputs are preserved. Review the latest report, schedule and evidence above before retrying.<Button variant="secondary" size="compact" onClick={() => { setDraft({ ...current, version: work.version, submissionId: work.submission?.id }); mutation.reset(); setValidation(""); }}>Use reviewed version {work.version}</Button></InlineMessage> : null}
      </form> : work.tracking !== "legacy_review" ? <p className="execution__muted">No actions are currently available to your account for this assignment.</p> : null}
      {vendor && work.canSubmitToClient ? <ExecutionClientSubmission work={work} onDirty={setClientDirty} onBusy={setClientBusy} /> : null}
      {validation ? <InlineMessage tone="error">{validation}</InlineMessage> : null}{mutation.isError ? <InlineMessage tone="error">{procurementError(mutation.error,"The update could not be saved. Your entered values are preserved.")}</InlineMessage> : null}{notice ? <p className="execution__notice" role="status">{notice}</p> : null}
      {compact ? <LazyExecutionDisclosure label="Activity history"><ExecutionHistory assignmentId={assignmentId} timezone={timezone} compact /></LazyExecutionDisclosure> : <ExecutionHistory assignmentId={assignmentId} timezone={timezone} />}
    </div>}
  </ContextPanel>;
}

function LazyExecutionDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  return <details className="execution__disclosure" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}><summary>{label}</summary>{opened ? children : null}</details>;
}

function ExecutionHistory({ assignmentId, timezone, compact = false }: { assignmentId: string; timezone?: string; compact?: boolean }) {
  const [offset,setOffset] = useState(0);
  const input = { limit: 20, offset };
  const history = useQuery({ queryKey: executionKeys.history(assignmentId,input), queryFn: ({ signal }) => executionApi.history(assignmentId,input,signal) });
  return <section className="execution__detail" aria-label="Assignment history"><h3>Activity history</h3>{history.isPending ? <p role="status">Loading history…</p> : history.isError ? <InlineMessage tone="error">History could not be loaded.<Button variant="quiet" size="compact" onClick={() => void history.refetch()}>Retry history</Button></InlineMessage> : history.data?.items.length ? <><ol className="execution__history">{history.data.items.map(event => <li key={event.id}><strong>{executionLabel(event.action)}{event.progress !== null ? ` · ${event.progress}% reported` : ""}</strong><time dateTime={event.occurredAt}>{executionTime(event.occurredAt,timezone)}</time><small>Round {event.executionRound} · Reporting date {event.localDate}{!compact ? ` · Actor ${event.actorId}` : ""}</small>{event.note ? <p>{event.note}</p> : null}{event.reason ? <p>Reason: {event.reason}</p> : null}{event.nextAction ? <p>Next action: {event.nextAction}</p> : null}{event.startDate && event.finishDate ? <p>Schedule: {executionDate(event.startDate)} to {executionDate(event.finishDate)}</p> : null}{event.reviewDate ? <p>Review by: {executionDate(event.reviewDate)}</p> : null}</li>)}</ol><div className="execution__actions"><Button size="compact" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0,offset - 20))}>Newer activity</Button><Button size="compact" variant="secondary" disabled={offset + history.data.items.length >= history.data.total} onClick={() => setOffset(offset + history.data!.items.length)}>Older activity</Button></div></> : <p className="execution__muted">No execution events have been recorded for this assignment.</p>}</section>;
}

function ExecutionEvidence({ work, vendor, disabled, onDirty, onBusy }: { work: ExecutionWork; vendor: boolean; disabled: boolean; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canUpload = vendor && hasFrontendPermission(auth.authorization,"procurement.vendor_work.media.upload") && work.allowedActions.includes("report");
  const [file,setFile] = useState<File | null>(null);
  const [viewing,setViewing] = useState<string | null>(null);
  const [url,setUrl] = useState<string | null>(null);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const uploadKey = useRef({ signature: "", key: "" });
  useEffect(() => { onDirty(Boolean(file)); },[file,onDirty]);
  const upload = useMutation({ mutationFn: async (image: File) => {
    const legacy = await getVendorWorkDetail(work.id);
    const signature = JSON.stringify([work.id,legacy.version,image.name,image.size,image.lastModified]);
    if (uploadKey.current.signature !== signature) uploadKey.current = { signature, key: crypto.randomUUID() };
    return uploadVendorWorkImage(legacy,image,uploadKey.current.key);
  }, onSuccess: async () => { setFile(null); setNotice("Photo added. Submit a daily update to record today's report."); await Promise.all([queryClient.invalidateQueries({ queryKey: executionKeys.all }),queryClient.invalidateQueries({ queryKey: vendorWorkKeys.all })]); } });
  useEffect(() => { onBusy(upload.isPending); },[upload.isPending,onBusy]);
  useEffect(() => {
    if (!viewing) { setUrl(null); return; }
    const controller = new AbortController(); let objectUrl: string | null = null;
    setUrl(null); setError("");
    void apiClient.getBlob(`/projects/${encodeURIComponent(work.projectId)}/vendor-work/${encodeURIComponent(work.id)}/images/${encodeURIComponent(viewing)}`,{ signal: controller.signal, showGlobalLoader: false, maxBytes: 12_000_000 }).then(({blob}) => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(procurementError(cause,"The photo could not be loaded.")); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  },[viewing,work.id,work.projectId]);
  const currentImageIds = work.submission?.imageIds ?? work.imageIds;
  return <section className="execution__evidence" aria-label="Current round evidence"><h3>Current round photos ({currentImageIds.length})</h3><div className="execution__actions">{currentImageIds.map((imageId,index) => <Button key={imageId} variant="secondary" size="compact" onClick={() => setViewing(imageId)}>View photo {index + 1}</Button>)}</div>{viewing ? <><Button variant="quiet" size="compact" onClick={() => setViewing(null)}>Close photo</Button>{url ? <img className="execution__image" src={url} alt="Vendor work completion evidence" /> : !error ? <p role="status">Loading photo…</p> : null}</> : null}
    {canUpload ? <div className="execution__evidence-actions"><Field id={`execution-photo-${work.id}`} label="Add photo" hint="JPEG, PNG or WebP. Uploading alone does not count as a daily report.">{props => <Input {...props} type="file" accept="image/jpeg,image/png,image/webp" disabled={upload.isPending || disabled} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(""); setNotice(""); }} />}</Field><Button size="compact" variant="secondary" busy={upload.isPending} disabled={!file || disabled} onClick={() => { if (!file) return; if (!["image/jpeg","image/png","image/webp"].includes(file.type)) return setError("Choose a JPEG, PNG or WebP image."); upload.mutate(file); }}>Upload photo</Button></div> : null}
    {error || upload.isError ? <InlineMessage tone="error">{error || procurementError(upload.error,"Photo upload failed.")}</InlineMessage> : null}{notice ? <p role="status" className="execution__notice">{notice}</p> : null}
  </section>;
}

function ExecutionClientSubmission({ work, onDirty, onBusy }: { work: ExecutionWork; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void }) {
  const client = useQueryClient();
  const [note,setNote] = useState("");
  const receipt = useRef({ signature: "", key: "" });
  const submit = useMutation({ mutationFn: async () => {
    const task = await getVendorWorkDetail(work.id);
    const signature = JSON.stringify([task.id,task.version,note.trim()]);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return submitVendorWork(task,note.trim(),receipt.current.key);
  }, onSuccess: async () => { setNote(""); await Promise.all([client.invalidateQueries({queryKey:executionKeys.all}),client.invalidateQueries({queryKey:vendorWorkKeys.all}),client.invalidateQueries({queryKey:["vendor-work"]}),client.invalidateQueries({queryKey:["site-completion"]})]); } });
  useEffect(() => { onDirty(Boolean(note)); },[note,onDirty]);
  useEffect(() => { onBusy(submit.isPending); },[submit.isPending,onBusy]);
  useEffect(() => () => { onDirty(false); onBusy(false); },[onDirty,onBusy]);
  return <form className="execution__form" aria-label="Send verified work to Client" onSubmit={event => { event.preventDefault(); if (note.trim()) submit.mutate(); }}><h3>Client review</h3><p className="execution__muted">The Site Manager has verified this Main Line. Send the completed work to the Client for their separate decision.</p><Field id="execution-client-note" label="Note for Client" required>{props => <Textarea {...props} rows={3} maxLength={2000} value={note} disabled={submit.isPending} onChange={event => setNote(event.target.value)} />}</Field><Button type="submit" busy={submit.isPending} disabled={!note.trim()}>Send to Client</Button>{submit.isError ? <InlineMessage tone="error">{procurementError(submit.error,"Client review could not be started. Your note has been preserved.")}</InlineMessage> : null}</form>;
}
