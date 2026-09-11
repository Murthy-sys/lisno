import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import { ROLE_LABELS } from "../../api/authorization-contract";
import { Button } from "../../components/ui/Button";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { Checkbox, Field, FileInput, Input, Select, Textarea } from "../../components/ui/Field";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { adminProjectKeys } from "../admin/adminProjectsApi";
import { clientKeys } from "../client/clientApi";
import { designerKeys } from "../designer/designerApi";
import { estimateDesignKeys } from "../leads/estimateDesignApi";
import {
  downloadWorkflowActionProof, performDesignWorkflowAction, projectWorkflowKeys,
  type DesignWorkflowAction, type DesignWorkflowActionId, type DesignWorkflowStage, type DesignWorkflowView
} from "./projectWorkflowApi";
import "./workflowStageActions.css";
import { WorkflowSubmittedDocument } from "./WorkflowSubmittedDocument";

const evidenceActions = new Set<DesignWorkflowActionId>(["internal_kickoff_complete", "measurement_complete", "furniture_upload"]);
const noteActions = new Set<DesignWorkflowActionId>(["client_kickoff_not_required", "measurement_access_block", "furniture_proceed"]);
const meetingActions = new Set<DesignWorkflowActionId>(["internal_kickoff_complete", "client_kickoff_request", "client_kickoff_schedule"]);
const actionNames: Record<DesignWorkflowActionId, string> = {
  confirm_initial_payment: "Initial payment received",
  internal_kickoff_complete: "Internal Kick off completed",
  sales_calendar_accept: "Sales calendar accepted",
  client_kickoff_request: "Client Kick off requested",
  client_kickoff_schedule: "Client meeting time confirmed",
  client_kickoff_complete: "Client Kick off completed",
  client_kickoff_not_required: "Client Kick off marked not necessary",
  keys_handed_over: "Keys handed over",
  keys_received: "Keys received",
  measurement_assign: "Measurement taker assigned",
  measurement_access_block: "Site access unavailable",
  measurement_access_restore: "Site access restored",
  measurement_complete: "On Site Actual Measurement completed",
  furniture_scope: "Furniture dimensions requirement recorded",
  furniture_accept: "Furniture dimensions request accepted",
  furniture_upload: "Furniture dimensions uploaded",
  furniture_proceed: "Rooms cleared to proceed"
};

export function useRefreshDesignWorkflow() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
    queryClient.invalidateQueries({ queryKey: designerKeys.all }),
    queryClient.invalidateQueries({ queryKey: adminProjectKeys.all }),
    queryClient.invalidateQueries({ queryKey: clientKeys.projects }),
    queryClient.invalidateQueries({ queryKey: estimateDesignKeys.all })
  ]);
}

export function WorkflowStageActions({ workflow, stage, expandKickoff = false, presentation = "full" }: { workflow: DesignWorkflowView; stage: DesignWorkflowStage; expandKickoff?: boolean; presentation?: "full" | "client" | "designer" }) {
  const id = useId();
  const automaticActionId = presentation === "client" && stage.type === "client_kickoff" ? "client_kickoff_complete" : expandKickoff ? "internal_kickoff_complete" : undefined;
  const [selected, setSelected] = useState<DesignWorkflowAction | null>(() => automaticActionId
    ? stage.operational?.availableActions.find((action) => action.id === automaticActionId && !action.disabledReason) ?? null : null);
  const [collapsed, setCollapsed] = useState(false);
  const [focusRequested, setFocusRequested] = useState(false);
  const [success, setSuccess] = useState("");
  const [recordedVersion, setRecordedVersion] = useState(0);
  const [readyDocument, setReadyDocument] = useState<string>();
  const container = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const closeAction = () => {
    const actionId = selected?.id;
    setSelected(null);
    setCollapsed(true);
    setFocusRequested(false);
    window.requestAnimationFrame(() => (actionId ? buttons.current.get(actionId) ?? container.current : container.current)?.focus());
  };
  const operational = stage.operational;
  const document = stage.type === "internal_kickoff" || stage.type === "client_kickoff" ? operational?.submittedDocument : undefined;
  const documentReady = Boolean(document && readyDocument === `${workflow.projectId}:${document.eventId}`);
  const initialAction = automaticActionId ? operational?.availableActions.find((action) => action.id === automaticActionId && !action.disabledReason) : undefined;
  useEffect(() => {
    if (!selected && !collapsed && initialAction) setSelected(initialAction);
  }, [selected, collapsed, initialAction]);
  if (!operational) return null;
  return <div className={`workflow-stage-actions${presentation !== "full" ? ` workflow-stage-actions--${presentation}` : ""}`} ref={container} tabIndex={-1}>
    {success ? <p role="status" className="workflow-stage-actions__success">{success}</p> : null}
    {document ? <WorkflowSubmittedDocument projectId={workflow.projectId} document={document} onReady={(eventId, ready) => setReadyDocument(ready ? `${workflow.projectId}:${eventId}` : undefined)} /> : stage.type === "client_kickoff" && presentation !== "designer" ? <p>The Designer’s Internal Kick off document is not available yet.</p> : null}
    {operational.availableActions.length > 0 || selected ? <section aria-label={`${stage.name} available actions`}>
      {presentation === "full" ? <h5>{expandKickoff ? "Acknowledgement and completion" : "Available actions"}</h5> : null}
      {selected ? <StageActionForm key={selected.id} action={selected} workflow={workflow} stage={stage} autoFocus={focusRequested} documentReady={documentReady} presentation={presentation}
        onClose={closeAction} onSaved={(version) => { setRecordedVersion(version); setSuccess("Action recorded. The project workflow has been updated."); closeAction(); }} />
        : <div className="workflow-stage-actions__buttons">{operational.availableActions.map((action) =>
          <div className="workflow-stage-actions__choice" key={action.id}>
            <Button ref={(element) => { if (element) buttons.current.set(action.id, element); else buttons.current.delete(action.id); }} variant="secondary" disabled={Boolean(action.disabledReason) || operational.version < recordedVersion} aria-describedby={action.disabledReason ? `${id}-${action.id}-reason` : undefined} onClick={() => { setSuccess(""); setFocusRequested(true); setSelected(action); }}>{action.label}</Button>
            {action.disabledReason ? <p id={`${id}-${action.id}-reason`}>{action.disabledReason}</p> : null}
          </div>
        )}</div>}
    </section> : null}
    {presentation !== "client" && operational.history.length > 0 ? <details className="workflow-stage-actions__history">
      <summary>Action history <span>{operational.history.length}</span></summary>
      <ol>{[...operational.history].reverse().map((event) => <li key={event.id}>
        <strong>{actionNames[event.action as DesignWorkflowActionId] ?? event.action}</strong>
        <p>{event.actorName} · {ROLE_LABELS[event.actorRole as keyof typeof ROLE_LABELS] ?? event.actorRole}{event.onBehalfOfClient ? " · On behalf of Client" : ""}</p>
        <time dateTime={event.at}>{new Date(event.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>
        {event.note ? <p className="workflow-stage-actions__note">{event.note}</p> : null}
        {event.proofAvailable ? <DownloadButton label="Download evidence" loadingLabel="Downloading…" errorMessage="Evidence could not be downloaded. Please try again."
          fallbackFilename="workflow-evidence" getFile={() => downloadWorkflowActionProof(workflow.projectId, event.id)} /> : null}
      </li>)}</ol>
    </details> : null}
  </div>;
}

function StageActionForm({ action, workflow, stage, onClose, onSaved, autoFocus = true, documentReady, presentation }: {
  action: DesignWorkflowAction; workflow: DesignWorkflowView; stage: DesignWorkflowStage; onClose: () => void; onSaved: (version: number) => void; autoFocus?: boolean; documentReady: boolean; presentation: "full" | "client" | "designer";
}) {
  const id = useId();
  const refresh = useRefreshDesignWorkflow();
  const [version] = useState(stage.operational!.version);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [designHandoverAcknowledged, setDesignHandoverAcknowledged] = useState(false);
  const [documentEventId] = useState(stage.operational?.submittedDocument?.eventId);
  const [documentReviewed, setDocumentReviewed] = useState(false);
  const [designerId, setDesignerId] = useState("");
  const [mediaFolderUrl, setMediaFolderUrl] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [noFurniture, setNoFurniture] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState("");
  const [progress, setProgress] = useState(0);
  const inFlight = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (autoFocus) heading.current?.focus(); }, [autoFocus]);
  useEffect(() => { setDocumentReviewed(false); }, [stage.operational?.submittedDocument?.eventId, stage.operational?.version, documentReady]);
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => performDesignWorkflowAction({
      projectId: workflow.projectId, stageId: stage.id, expectedVersion: version,
      action: action.id, data, note: note.trim(), file, idempotencyKey
    }, setProgress),
    onSuccess: async (result) => { await refresh(); onSaved(result.version); },
    onError: async (error) => { if (error instanceof ApiError && error.status === 409) await refresh(); },
    onSettled: () => { inFlight.current = false; }
  });
  const blockedReason = stage.operational?.availableActions.find((candidate) => candidate.id === action.id)?.disabledReason;
  const isClientKickoff = action.id === "client_kickoff_complete";
  const documentChanged = isClientKickoff && stage.operational?.submittedDocument?.eventId !== documentEventId;
  const stale = stage.operational?.version !== version || documentChanged || Boolean(blockedReason) || !stage.operational?.availableActions.some((candidate) => candidate.id === action.id);
  const needsFile = action.requiresProof || evidenceActions.has(action.id);
  const isInternalKickoff = action.id === "internal_kickoff_complete";
  const FormHeading = presentation === "designer" ? "h5" : "h6";
  const needsRooms = action.id === "furniture_scope" || action.id === "furniture_upload" || action.id === "furniture_proceed";
  const rooms = action.id === "furniture_scope" ? workflow.furnitureRooms ?? [] : stage.operational?.rooms?.filter((room) => room.required && !room.hasDimensions && (action.id !== "furniture_proceed" || !room.canProceed)) ?? [];
  const selectRoom = (roomId: string, checked: boolean) => setRoomIds((current) => checked ? [...current.filter((value) => value !== roomId), roomId] : current.filter((value) => value !== roomId));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || stale) return;
    if (isInternalKickoff && !designHandoverAcknowledged) { setValidation("Acknowledge receipt of the design flow before completing Internal Kick off."); return; }
    if (isClientKickoff && (!documentEventId || !documentReady || !documentReviewed)) { setValidation("Review the Designer’s submitted document and confirm your acknowledgement before completing Client Kick off."); return; }
    if (needsFile && !file) { setValidation("Choose the required evidence file."); fileRef.current?.focus(); return; }
    if (file && !/\.(pdf|png|jpe?g|webp)$/iu.test(file.name)) { setValidation("Choose a PDF, JPG, PNG or WebP file."); fileRef.current?.focus(); return; }
    if (needsRooms && !noFurniture && roomIds.length === 0) { setValidation("Select at least one room."); return; }
    if (noteActions.has(action.id) && !note.trim()) { setValidation("Add a reason for this action."); return; }
    const data: Record<string, unknown> = {};
    if (isInternalKickoff) data.designHandoverAcknowledged = true;
    if (isClientKickoff) data.reviewedDocumentEventId = documentEventId;
    if (meetingActions.has(action.id)) {
      if (!meetingAt || !Number.isFinite(Date.parse(meetingAt))) { setValidation("Choose the meeting date and time."); return; }
      const date = new Date(meetingAt).toISOString();
      if (action.id === "client_kickoff_schedule") data.scheduledAt = date;
      else if (action.id === "client_kickoff_request") data.preferredAt = date;
      else data.meetingAt = date;
    }
    if (action.id === "measurement_assign") {
      if (!designerId) { setValidation("Choose a measurement taker."); return; }
      data.designerId = designerId;
    }
    if (action.id === "measurement_complete") data.mediaFolderUrl = mediaFolderUrl.trim();
    if (action.id === "furniture_scope") {
      data.rooms = noFurniture ? [] : rooms.map((room) => ({ id: room.id, required: roomIds.includes(room.id) }));
      data.notApplicable = noFurniture;
    }
    else if (needsRooms) data.roomIds = roomIds;
    setValidation(""); setProgress(0); inFlight.current = true; mutation.mutate(data);
  }

  return <form className="workflow-stage-actions__form" onSubmit={submit} aria-label={action.label}>
    <div className={`workflow-stage-actions__form-heading${(presentation === "designer" && isInternalKickoff) || (presentation === "client" && isClientKickoff) ? " sr-only" : ""}`}><FormHeading ref={heading} tabIndex={-1}>{action.label}</FormHeading>{action.requiresProof && presentation !== "designer" ? <p>Supporting evidence is required and will be retained with this action.</p> : null}</div>
    <fieldset disabled={mutation.isPending || stale}>
      {isClientKickoff ? <div className="workflow-stage-actions__handover">
        <label><Checkbox required checked={documentReviewed} disabled={!documentReady || !documentEventId} onChange={(event) => setDocumentReviewed(event.target.checked)} />I have reviewed the document submitted by the Designer</label>
      </div> : null}
      {isInternalKickoff ? <div className="workflow-stage-actions__handover">
        {presentation !== "designer" ? <strong>Design handover acknowledgement</strong> : null}
        <label><Checkbox required checked={designHandoverAcknowledged} onChange={(event) => setDesignHandoverAcknowledged(event.target.checked)} />I acknowledge that the design flow has been handed over to me after initial payment.</label>
        {presentation !== "designer" ? <p>Acknowledge receipt of the design flow, attach the signed checklist, then complete and save Internal Kick off. Saving stops this stage’s countdown.</p> : null}
      </div> : null}
      {meetingActions.has(action.id) ? <Field id={`${id}-meeting`} label={action.id === "internal_kickoff_complete" ? "Meeting conducted at" : "Meeting date and time"} hint="Dates use your local time zone." required>{(props) => <Input {...props} type="datetime-local" value={meetingAt} onChange={(event) => setMeetingAt(event.target.value)} />}</Field> : null}
      {action.id === "measurement_assign" ? <Field id={`${id}-designer`} label="Measurement taker" required>{(props) => <Select {...props} value={designerId} onChange={(event) => setDesignerId(event.target.value)}><option value="">Select a project Designer</option>{workflow.measurementDesigners?.map((designer) => <option key={designer.id} value={designer.id}>{designer.name}</option>)}</Select>}</Field> : null}
      {action.id === "measurement_complete" ? <Field id={`${id}-folder`} label="Site photographs and videos folder" required hint="Paste the HTTPS folder link. It is stored with the measurement evidence.">{(props) => <Input {...props} type="url" pattern="https://.*" value={mediaFolderUrl} onChange={(event) => setMediaFolderUrl(event.target.value)} placeholder="https://…" />}</Field> : null}
      {needsRooms ? <fieldset className="workflow-stage-actions__rooms">
        <legend>{action.id === "furniture_scope" ? "Rooms needing existing furniture dimensions" : "Select rooms"}</legend>
        {action.id === "furniture_scope" ? <label><Checkbox checked={noFurniture} onChange={(event) => { setNoFurniture(event.target.checked); setRoomIds([]); }} />No existing furniture dimensions are needed</label> : null}
        {!noFurniture ? rooms.length ? rooms.map((room) => <label key={room.id}><Checkbox checked={roomIds.includes(room.id)} onChange={(event) => selectRoom(room.id, event.target.checked)} />{room.name}</label>) : <p>Project rooms have not been configured yet. Add the rooms in the estimate before requesting room dimensions.</p> : null}
        {action.id === "furniture_proceed" ? <p>Only the selected rooms will be cleared to proceed while dimensions are pending.</p> : null}
      </fieldset> : null}
      {needsFile ? <Field id={`${id}-file`} label={action.id === "internal_kickoff_complete" ? "Signed kick-off checklist" : action.id === "measurement_complete" ? "As-built on-site sketch" : action.id === "furniture_upload" ? "Furniture dimensions document" : "Client action proof"} hint="PDF, JPG, PNG or WebP. Evidence stays in the action history." required>{(props) => <FileInput {...props} ref={fileRef} accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />}</Field> : null}
      {!(presentation === "client" && isClientKickoff) ? <Field id={`${id}-note`} label={noteActions.has(action.id) ? "Reason" : action.id === "client_kickoff_schedule" ? "Client availability / note" : "Note"} required={noteActions.has(action.id)}>{(props) => <Textarea {...props} rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />}</Field> : null}
    </fieldset>
    {validation ? <p role="alert">{validation}</p> : null}
    {stale && !mutation.isPending ? <p role="alert">{blockedReason ?? "The workflow changed while this form was open. Close it and reopen the action to review the latest state."}</p> : null}
    {mutation.isError ? <p role="alert">{mutation.error instanceof Error ? mutation.error.message : "The action could not be saved. Please try again."}</p> : null}
    {mutation.isPending && file ? <div role="status"><p>{progress < 100 ? `Uploading evidence… ${progress}%` : "Saving action and evidence…"}</p><ProgressBar value={progress} label="Evidence upload progress" /></div> : null}
    <div className="workflow-stage-actions__buttons"><Button type="submit" busy={mutation.isPending} busyLabel={file && progress < 100 ? "Uploading evidence…" : "Saving action…"} disabled={stale || (isInternalKickoff && !designHandoverAcknowledged) || (isClientKickoff && (!documentEventId || !documentReady || !documentReviewed))}>{isInternalKickoff ? "Complete and save Internal Kick off" : action.label}</Button><Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button></div>
  </form>;
}
