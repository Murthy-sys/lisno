import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { executionApi, executionKeys, type ExecutionCommand, type ExecutionWork, type VendorUpdateType } from "../execution/executionApi";
import { procurementError } from "../procurement/procurementPresentation";
import { getVendorWorkDetail, uploadVendorWorkImage, vendorWorkKeys, type VendorWorkTask } from "./vendorWorkApi";
import "./vendorProgressForm.css";

const choices: Array<{ value: VendorUpdateType; label: string }> = [
  { value: "started", label: "Started working" }, { value: "progress", label: "In progress" },
  { value: "hold", label: "On hold" }, { value: "completed", label: "Completed" }
];
const labels = { started: "Started working", progress: "Save update", hold: "Save hold", completed: "Mark completed" };
type Draft = { updateType: VendorUpdateType; version: number; note: string; reason: string };
type UploadReceipt = { file: File; task: VendorWorkTask; key: string };
function initialDraft(work: ExecutionWork): Draft {
  return { updateType: work.status === "not_started" && work.progress === 0 ? "started" : "progress", version: work.version, note: "", reason: "" };
}

export function VendorProgressForm({ work, disabled, formRef, photos, onSaved, onDirty, onBusy }: {
  work: ExecutionWork; disabled: boolean; formRef: RefObject<HTMLFormElement | null>; photos: ReactNode;
  onSaved: (work: ExecutionWork) => Promise<void>; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void;
}) {
  const client = useQueryClient();
  const auth = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [validation, setValidation] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [photoNotice, setPhotoNotice] = useState("");
  const receipt = useRef({ signature: "", key: "" });
  const photoReceipt = useRef<UploadReceipt | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = draft ?? initialDraft(work);
  const stale = current.version !== work.version;
  const canReport = work.allowedActions.includes("report") && Boolean(work.schedule);
  const canStart = work.status === "not_started" && work.progress === 0;
  const needsPhotos = current.updateType === "progress" || current.updateType === "completed";
  const canUpload = hasFrontendPermission(auth.authorization, "procurement.vendor_work.media.upload");
  const mutation = useMutation({
    mutationFn: (input: ExecutionCommand) => executionApi.vendorCommand(work.id, input),
    onSuccess: async updated => { setDraft(null); setValidation(""); receipt.current = { signature: "", key: "" }; await onSaved(updated); },
    onError: error => { if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) void client.invalidateQueries({ queryKey: executionKeys.detail(work.id) }); }
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!photoReceipt.current || photoReceipt.current.file !== file) photoReceipt.current = { file, task: await getVendorWorkDetail(work.id), key: crypto.randomUUID() };
      return uploadVendorWorkImage(photoReceipt.current.task, file, photoReceipt.current.key);
    },
    onSuccess: async () => {
      setPendingFile(null); photoReceipt.current = null; if (fileInput.current) fileInput.current.value = "";
      setPhotoNotice("Photo attached. Save your update when ready.");
      await Promise.all([client.invalidateQueries({ queryKey: executionKeys.detail(work.id) }), client.invalidateQueries({ queryKey: vendorWorkKeys.all })]);
    },
    onError: error => {
      if (error instanceof ApiError && error.status === 409) { photoReceipt.current = null; void client.invalidateQueries({ queryKey: executionKeys.detail(work.id) }); }
    }
  });
  const busy = mutation.isPending || upload.isPending;
  useEffect(() => { onDirty(Boolean(draft || pendingFile)); }, [draft, pendingFile, onDirty]);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => () => { onDirty(false); onBusy(false); }, [onDirty, onBusy]);
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...current, [key]: value }); setValidation(""); mutation.reset();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || busy) return;
    if (!canReport) return setValidation("Work updates are no longer available. Refresh the assignment.");
    if (stale) return setValidation("This work changed. Review the latest details before saving.");
    if (pendingFile) return setValidation("Finish uploading the selected photo before saving.");
    if (current.updateType === "started" && !canStart) return setValidation("This work has already started. Choose In progress to update it.");
    const progress = current.updateType === "started" ? 0 : current.updateType === "completed" ? 100 : work.progress;
    if (current.updateType === "hold" && !current.reason.trim()) return setValidation("Explain why work is on hold.");
    if (needsPhotos && !work.imageIds.length) return setValidation("Add at least one progress photo before saving.");
    const note = current.updateType === "hold" ? current.reason.trim() : current.note.trim() || ({ started: "Started working.", progress: "In progress.", completed: "Work completed." }[current.updateType]);
    const input: Omit<ExecutionCommand, "idempotencyKey"> = {
      action: "report", updateType: current.updateType, expectedVersion: current.version,
      status: current.updateType === "hold" ? "blocked" : "in_progress", progress, note,
      ...(current.updateType === "hold" && current.reason.trim() ? { reason: current.reason.trim() } : {}), ...(needsPhotos ? { imageIds: work.imageIds } : {})
    };
    const signature = JSON.stringify(input);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    mutation.mutate({ ...input, idempotencyKey: receipt.current.key });
  }
  return <form ref={formRef} className="vendor-progress-form" aria-label="Update work status" onSubmit={submit}>
    <h3>Update work</h3>
    <fieldset disabled={disabled || busy || !canReport}>
      <legend className="sr-only">Work status</legend>
      <div className="vendor-progress-form__choices">{choices.map(choice => <label key={choice.value} data-selected={current.updateType === choice.value}>
        <input type="radio" name={`vendor-update-${work.id}`} value={choice.value} checked={current.updateType === choice.value} disabled={choice.value === "started" && !canStart} onChange={() => edit("updateType", choice.value)} />
        <span>{choice.label}</span>
      </label>)}</div>
      {current.updateType === "started" ? <p>Record that you have started this work. Add photos as work progresses.</p> : null}
      {current.updateType === "progress" ? <p>Add photos regularly while work is in progress. Choose Completed when all work is finished.</p> : null}
      {current.updateType === "hold" ? <Field id="vendor-hold-reason" label="Reason for hold" required hint="Tell the Project Manager what is preventing work.">{props => <Textarea {...props} rows={3} maxLength={2000} value={current.reason} onChange={event => edit("reason", event.target.value)} />}</Field> : null}
      {current.updateType === "progress" || current.updateType === "completed" ? <Field id="vendor-progress-note" label={current.updateType === "completed" ? "Completion note (optional)" : "Progress note (optional)"}>{props => <Textarea {...props} rows={2} maxLength={2000} value={current.note} onChange={event => edit("note", event.target.value)} />}</Field> : null}
      {needsPhotos ? <section className="vendor-progress-form__photos" aria-label="Progress photos">
        <h4>{current.updateType === "completed" ? "Completion photos" : "Progress photos"} <span>(required)</span></h4>
        {canUpload ? <Field id="vendor-progress-photo" label="Add progress photo" hint="Choose a JPEG, PNG or WebP photo. It uploads automatically.">{props => <Input {...props} ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0]; if (!file) return;
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setUploadError("Choose a JPEG, PNG or WebP photo."); event.target.value = ""; return; }
          setDraft(current); setPendingFile(file); setUploadError(""); setPhotoNotice(""); upload.mutate(file);
        }} />}</Field> : <p>Photo upload is unavailable for your account. Contact the project team.</p>}
        {upload.isPending ? <p role="status">Uploading photo…</p> : null}
        {uploadError ? <InlineMessage tone="error">{uploadError}</InlineMessage> : null}
        {photoNotice ? <p role="status">{photoNotice}</p> : null}
        {photos}
      </section> : null}
        {upload.isError ? <><InlineMessage tone="error">{procurementError(upload.error, "Photo upload failed. Your update is still here.")}</InlineMessage><Button type="button" size="compact" variant="secondary" onClick={() => { if (pendingFile) upload.mutate(pendingFile); }}>Retry photo upload</Button><Button type="button" size="compact" variant="quiet" onClick={() => { setPendingFile(null); photoReceipt.current = null; upload.reset(); setUploadError(""); if (fileInput.current) fileInput.current.value = ""; }}>Discard selected photo</Button></> : null}
      {current.updateType === "completed" ? <p>Your work will be marked completed by vendor and sent to the Project Manager for verification.</p> : null}
      <Button type="submit" busy={mutation.isPending} disabled={stale || (current.updateType === "started" && !canStart)}>{labels[current.updateType]}</Button>
    </fieldset>
    {!canReport ? <InlineMessage tone="warning">Work updates are no longer available. Your unsaved inputs are retained above for reference.</InlineMessage> : null}
    {stale ? <InlineMessage tone="warning">This work changed while you were editing. Your inputs are preserved. Review the latest details above.<Button type="button" variant="secondary" size="compact" disabled={busy || disabled} onClick={() => { setDraft({ ...current, version: work.version }); mutation.reset(); setValidation(""); }}>Use reviewed version {work.version}</Button></InlineMessage> : null}
    {validation ? <InlineMessage tone="error">{validation}</InlineMessage> : null}
    {mutation.isError ? <InlineMessage tone="error">{procurementError(mutation.error, "The update could not be saved. Your inputs are preserved.")}</InlineMessage> : null}
  </form>;
}
