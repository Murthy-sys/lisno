import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { procurementError } from "../procurement/procurementPresentation";
import { currentVendorReport } from "../vendor/vendorWorkflowPresentation";
import { siteWorkStatus } from "./siteManagerPresentation";
import { executionApi, executionKeys, type ExecutionCommand, type ExecutionWork } from "../execution/executionApi";
import { executionDate, executionTime } from "../execution/executionPresentation";
import "./manager-monitoring.css";

type ManagerAction = "confirm_schedule" | "verify" | "request_changes" | "resume" | "setup";
type Draft = { action: ManagerAction; version: number; note: string; reason: string; startDate: string; finishDate: string; submissionId?: string };
const submitLabels: Record<ManagerAction, string> = { confirm_schedule: "Confirm schedule", verify: "Verify completion", request_changes: "Send change request", resume: "Resume work", setup: "Enable tracking" };
function primaryAction(work: ExecutionWork): ManagerAction | undefined {
  if (work.allowedActions.includes("setup")) return "setup";
  if (work.hold && work.allowedActions.includes("resume")) return "resume";
  if (work.proposedSchedule && work.allowedActions.includes("confirm_schedule")) return "confirm_schedule";
  if (work.submission && work.allowedActions.includes("verify")) return "verify";
  if (work.submission && work.allowedActions.includes("request_changes")) return "request_changes";
}
function makeDraft(work: ExecutionWork, action: ManagerAction): Draft {
  return { action, version: work.version, note: "", reason: "", startDate: work.proposedSchedule?.startDate ?? "", finishDate: work.proposedSchedule?.finishDate ?? "", submissionId: work.submission?.id };
}

export function ManagerWorkMonitor({ work, disabled, onSaved, onDirty, onBusy, photos, history }: {
  work: ExecutionWork; disabled: boolean; onSaved: (work: ExecutionWork) => Promise<void>;
  onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; photos: ReactNode; history: ReactNode;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [validation, setValidation] = useState("");
  const [notice, setNotice] = useState("");
  const receipt = useRef({ signature: "", key: "" });
  const primary = primaryAction(work);
  const current = draft ?? (primary ? makeDraft(work, primary) : null);
  const stale = Boolean(draft && draft.version !== work.version);
  const report = currentVendorReport(work);
  const mutation = useMutation({
    mutationFn: (input: ExecutionCommand) => executionApi.staffCommand(work.projectId, work.id, input),
    onSuccess: async updated => { setDraft(null); setValidation(""); setNotice("Update saved."); receipt.current = { signature: "", key: "" }; await onSaved(updated); },
    onError: error => { if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) void client.invalidateQueries({ queryKey: executionKeys.detail(work.id) }); }
  });
  useEffect(() => { onDirty(Boolean(draft)); }, [draft, onDirty]);
  useEffect(() => { onBusy(mutation.isPending); }, [mutation.isPending, onBusy]);
  useEffect(() => () => { onDirty(false); onBusy(false); }, [onDirty, onBusy]);
  function choose(action: ManagerAction) {
    setDraft(current ? { ...current, action } : makeDraft(work, action)); setValidation(""); setNotice(""); mutation.reset();
  }
  function edit(key: "note" | "reason", value: string) {
    if (current) setDraft({ ...current, [key]: value }); setValidation(""); setNotice(""); mutation.reset();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!current || disabled || mutation.isPending) return;
    if (!work.allowedActions.includes(current.action)) return setValidation("This action is no longer available. Refresh the work details.");
    if (stale) return setValidation("This work changed. Review the latest update before saving.");
    const input: Omit<ExecutionCommand, "idempotencyKey"> = { action: current.action, expectedVersion: current.version };
    if (current.action === "confirm_schedule") {
      if (!work.proposedSchedule || work.proposedSchedule.startDate !== current.startDate || work.proposedSchedule.finishDate !== current.finishDate) return setValidation("The vendor's proposed dates changed. Refresh and review the latest proposal.");
      input.startDate = current.startDate; input.finishDate = current.finishDate;
      if (work.schedule && !current.reason.trim()) return setValidation("Give a reason for changing the committed schedule.");
      if (current.reason.trim()) input.reason = current.reason.trim();
    }
    if (current.action === "verify" || current.action === "request_changes") {
      if (!current.submissionId || current.submissionId !== work.submission?.id) return setValidation("The completion submission changed. Review the latest photos and submission.");
      if (current.action === "verify" && !work.submission.imageIds.length) return setValidation("Completion requires at least one current-round photo. Request changes so the vendor can add one.");
      input.submissionId = current.submissionId;
      if (current.action === "verify" && current.note.trim()) input.note = current.note.trim();
    }
    if (["request_changes", "resume"].includes(current.action)) {
      if (!current.reason.trim()) return setValidation("A reason is required for this action.");
      input.reason = current.reason.trim();
    }
    const signature = JSON.stringify(input);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    setDraft(current); setValidation(""); mutation.mutate({ ...input, idempotencyKey: receipt.current.key });
  }
  const form = current ? <form className="manager-monitor__review" aria-label="Review work" onSubmit={submit}>
    <h3>{current.action === "confirm_schedule" ? "Review proposed schedule" : current.action === "verify" || current.action === "request_changes" ? "Review completion" : submitLabels[current.action]}</h3>
    <fieldset disabled={disabled || mutation.isPending || !work.allowedActions.includes(current.action)}>
      {current.action === "confirm_schedule" ? <><p>The vendor proposed these dates. Confirm them below or ask the vendor to revise them.</p><div className="execution__form-row">
        <Field id="manager-work-start" label="Start date">{props => <Input {...props} type="date" readOnly value={current.startDate} />}</Field>
        <Field id="manager-work-finish" label="Committed finish date">{props => <Input {...props} type="date" readOnly value={current.finishDate} />}</Field>
      </div>{work.proposedSchedule?.reason ? <p>Vendor reason: {work.proposedSchedule.reason}</p> : null}</> : null}
      {current.action === "verify" ? <><p>Check the work and photos before verifying. Client acceptance is a separate step.</p><Field id="manager-verification-note" label="Verification note" hint="Optional">{props => <Textarea {...props} rows={2} maxLength={2000} value={current.note} onChange={event => edit("note", event.target.value)} />}</Field></> : null}
      {current.action === "request_changes" ? <p>Explain what the vendor must fix or add before submitting again.</p> : null}
      {["confirm_schedule", "request_changes", "resume"].includes(current.action) ? <Field id="manager-review-reason" label="Reason" required={current.action !== "confirm_schedule" || Boolean(work.schedule)} hint={current.action === "confirm_schedule" ? work.schedule ? "Required when changing confirmed dates." : "Optional note about these dates." : undefined}>{props => <Textarea {...props} rows={2} maxLength={2000} value={current.reason} onChange={event => edit("reason", event.target.value)} />}</Field> : null}
      {current.action === "resume" ? <p>Confirm that the hold is resolved so the vendor can continue updating this work.</p> : null}
      {current.action === "setup" ? <p>Enable tracking for this issued work. Existing reports and approvals remain in its history.</p> : null}
      <div className="manager-monitor__buttons">
        <Button type="submit" busy={mutation.isPending} disabled={stale}>{submitLabels[current.action]}</Button>
        {current.action === "verify" && work.allowedActions.includes("request_changes") ? <Button type="button" variant="secondary" onClick={() => choose("request_changes")}>Request changes</Button> : null}
        {current.action === "request_changes" && work.allowedActions.includes("verify") ? <Button type="button" variant="quiet" onClick={() => choose("verify")}>Back to verification</Button> : null}
      </div>
    </fieldset>
    {draft ? <Button type="button" variant="quiet" disabled={mutation.isPending} onClick={() => { setDraft(null); setValidation(""); mutation.reset(); }}>Cancel edits</Button> : null}
    {stale ? <InlineMessage tone="warning">This assignment changed while you were editing. Your inputs are preserved. Review the latest update, photos and dates.<Button type="button" variant="secondary" size="compact" disabled={disabled || mutation.isPending || !work.allowedActions.includes(current.action)} onClick={() => { setDraft({ ...current, version: work.version, submissionId: work.submission?.id, startDate: work.proposedSchedule?.startDate ?? "", finishDate: work.proposedSchedule?.finishDate ?? "" }); setValidation(""); mutation.reset(); }}>Use reviewed version {work.version}</Button></InlineMessage> : null}
    {!work.allowedActions.includes(current.action) ? <InlineMessage tone="warning">This action is no longer available. Your unsaved inputs are retained.</InlineMessage> : null}
  </form> : null;
  return <div className="manager-monitor">
    <div className="manager-monitor__status"><strong>{siteWorkStatus(work)}</strong>{work.status === "awaiting_verification" ? <span>Awaiting your verification</span> : work.status === "awaiting_client" ? <span>Waiting for Client acceptance</span> : null}</div>
    <dl className="manager-monitor__dates"><div><dt>Finish date</dt><dd>{work.schedule ? executionDate(work.schedule.finishDate) : "Awaiting schedule confirmation"}</dd></div><div><dt>Latest vendor update</dt><dd>{report ? executionTime(report.reportedAt, work.timezone) : "No update this round"}</dd></div></dl>
    {work.flags.includes("overdue") ? <p className="manager-monitor__attention">Work is overdue.</p> : null}
    {work.daily.state === "missing" || work.flags.includes("missing_update") ? <p className="manager-monitor__attention">The vendor's latest required update is missing.</p> : null}
    {work.hold ? <InlineMessage tone="warning">On hold: {work.hold.reason}. Review {executionDate(work.hold.reviewDate)}.</InlineMessage> : null}
    <section className="manager-monitor__update" aria-label="Latest vendor update"><h3>Vendor update</h3>{report ? <><p>{report.note}</p>{report.reason && report.reason !== report.note ? <p><strong>{work.status === "blocked" && report.status === "blocked" ? "Hold reason" : "Reported reason"}:</strong> {report.reason}</p> : null}{report.nextAction ? <p>Next action: {report.nextAction}</p> : null}</> : <p>No vendor update for the current round.</p>}</section>
    {work.submission ? <section aria-label="Completion submitted"><h3>Completion submitted</h3><p>{executionTime(work.submission.submittedAt, work.timezone)}</p>{work.submission.note !== report?.note ? <p>{work.submission.note}</p> : null}</section> : null}
    {photos}
    {form}
    {!current && ["not_started", "in_progress", "blocked"].includes(work.status) ? <p className="execution__muted">The vendor can keep adding work photos. Completion will appear here for verification when submitted.</p> : null}
    {!work.sourceAvailable ? <InlineMessage tone="warning">The issued source is unavailable. Review actions are unavailable until it is resolved.</InlineMessage> : null}
    {validation ? <InlineMessage tone="error">{validation}</InlineMessage> : null}{mutation.isError ? <InlineMessage tone="error">{procurementError(mutation.error, "The action could not be saved. Your inputs are preserved.")}</InlineMessage> : null}{notice ? <p role="status" className="execution__notice">{notice}</p> : null}
    {history}
  </div>;
}
