import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import { ROLE_LABELS } from "../../api/authorization-contract";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Dialog } from "../../components/ui/Dialog";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { Checkbox, Field, FileInput, Input, Select, Textarea } from "../../components/ui/Field";
import { ProgressBar } from "../../components/ui/ProgressBar";
import {
  downloadWorkflowActionMedia, downloadWorkflowActionProof, getFurnitureUoms, performDesignWorkflowAction, projectWorkflowKeys,
  type DesignStageOperational, type DesignWorkflowAction, type DesignWorkflowActionId, type DesignWorkflowStage, type DesignWorkflowView
} from "./projectWorkflowApi";
import "./workflowStageActions.css";
import { WorkflowSubmittedDocument } from "./WorkflowSubmittedDocument";
import { formatEvidenceSize, MEASUREMENT_MEDIA_ACCEPT, measurementFileKey, measurementMediaKind, validateMeasurementMedia } from "./measurementMedia";
import { WorkflowMediaList } from "./WorkflowMediaList";
import { FurnitureRequirementsReview } from "./FurnitureRequirementsReview";
import { createFurnitureDimensionsDraft, FurnitureDimensionsEditor, parseFurnitureDimensionsDraft } from "./FurnitureDimensionsEditor";
import { SpacePlanningCompletion } from "./SpacePlanningCompletion";
import { useRefreshDesignWorkflow } from "./useRefreshDesignWorkflow";
export { useRefreshDesignWorkflow } from "./useRefreshDesignWorkflow";

const evidenceActions = new Set<DesignWorkflowActionId>(["internal_kickoff_complete", "furniture_upload"]);
const noteActions = new Set<DesignWorkflowActionId>(["client_kickoff_not_required", "measurement_access_block", "furniture_scope_return", "furniture_dimensions_return"]);
const dimensionReviewActions = new Set<DesignWorkflowActionId>(["furniture_dimensions_approve", "furniture_dimensions_return"]);
const inlineClientFurnitureActions = new Set<DesignWorkflowActionId>(["furniture_accept", "furniture_scope_return", ...dimensionReviewActions]);
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
  furniture_upload: "Furniture dimensions submitted for Client approval",
  furniture_scope_return: "Furniture requirements sent back",
  furniture_dimensions_approve: "Furniture dimensions approved",
  furniture_dimensions_return: "Furniture dimensions sent back",
  furniture_proceed: "Rooms cleared to proceed",
  space_planning_complete: "Space planning approved and completed"
};
const actionLabel = (action: DesignWorkflowAction) => action.id === "measurement_complete" ? "Complete measurement" : action.label;
const canSubmitDimensions = (room: NonNullable<DesignStageOperational["rooms"]>[number]) => room.required && !room.canProceed && (!room.dimensions || room.dimensions.status === "changes_requested");

export function WorkflowStageActions({ workflow, stage, expandKickoff = false, presentation = "full", refreshError = false, refreshing = false }: { workflow: DesignWorkflowView; stage: DesignWorkflowStage; expandKickoff?: boolean; presentation?: "full" | "client" | "designer"; refreshError?: boolean; refreshing?: boolean }) {
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
  const availableActions = operational.availableActions.filter((action) => action.id !== "furniture_proceed" && action.id !== "space_planning_complete");
  return <div className={`workflow-stage-actions${presentation !== "full" ? ` workflow-stage-actions--${presentation}` : ""}`} ref={container} tabIndex={-1}>
    {success ? <p role="status" className="workflow-stage-actions__success">{success}</p> : null}
    {stage.type === "space_planning_tentative_look_feel" ? <SpacePlanningCompletion workflow={workflow} stage={stage} refreshError={refreshError} refreshing={refreshing} reviewHref={presentation === "client" && operational.spacePlanning ? `/client?estimate=${encodeURIComponent(operational.spacePlanning.estimateId)}` : undefined} /> : null}
    {stage.type === "existing_furniture_dimensions" && (presentation === "client" || operational.rooms) ? <FurnitureRequirementsReview key={`${workflow.projectId}:${stage.id}:${operational.version}`} projectId={workflow.projectId} operational={operational} /> : null}
    {document ? <WorkflowSubmittedDocument projectId={workflow.projectId} document={document} onReady={(eventId, ready) => setReadyDocument(ready ? `${workflow.projectId}:${eventId}` : undefined)} /> : stage.type === "client_kickoff" && presentation !== "designer" ? <p>The Designer’s Internal Kick off document is not available yet.</p> : null}
    {availableActions.length > 0 || selected ? <section aria-label={`${stage.name} available actions`}>
      {presentation === "full" ? <h5>{expandKickoff ? "Acknowledgement and completion" : "Available actions"}</h5> : null}
      {selected ? <StageActionForm key={selected.id} action={selected} workflow={workflow} stage={stage} autoFocus={focusRequested} documentReady={documentReady} presentation={presentation}
        onClose={closeAction} onSaved={(version) => { setRecordedVersion(version); setSuccess(selected.id === "furniture_scope" ? "Furniture requirements submitted. Awaiting Client approval." : selected.id === "furniture_upload" ? "Dimensions submitted. Awaiting Client approval." : selected.id === "furniture_dimensions_return" || selected.id === "furniture_scope_return" ? "Sent back for corrections." : selected.id === "furniture_dimensions_approve" ? "Selected furniture dimensions approved." : "Action recorded. The project workflow has been updated."); closeAction(); }} />
        : <div className="workflow-stage-actions__buttons">{availableActions.map((action) =>
          <div className="workflow-stage-actions__choice" key={action.id}>
            <Button ref={(element) => { if (element) buttons.current.set(action.id, element); else buttons.current.delete(action.id); }} variant="secondary" disabled={Boolean(action.disabledReason) || operational.version < recordedVersion} aria-describedby={action.disabledReason ? `${id}-${action.id}-reason` : undefined} onClick={() => { setSuccess(""); setFocusRequested(true); setSelected(action); }}>{actionLabel(action)}</Button>
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
        {event.mediaFiles?.length ? <WorkflowHistoryMedia projectId={workflow.projectId} eventId={event.id} mediaFiles={event.mediaFiles} /> : null}
      </li>)}</ol>
    </details> : null}
  </div>;
}

function WorkflowHistoryMedia({ projectId, eventId, mediaFiles }: {
  projectId: string; eventId: string; mediaFiles: NonNullable<DesignStageOperational["history"][number]["mediaFiles"]>;
}) {
  const [downloads, setDownloads] = useState(() => new Set<string>());
  return <WorkflowMediaList items={mediaFiles} label="Site photos and videos" getKey={(media) => media.id} busy={downloads.size > 0} renderItem={(media) => <>
    <div><span className="workflow-stage-actions__media-name">{media.filename}</span><span className="workflow-stage-actions__media-meta">{media.kind === "video" ? "Video" : "Photo"} · {formatEvidenceSize(media.byteSize)}</span></div>
    <DownloadButton iconOnly label={`Download ${media.filename}`} loadingLabel={`Downloading ${media.filename}…`} errorMessage={`${media.filename} could not be downloaded. Please try again.`}
      fallbackFilename={media.filename} getFile={() => downloadWorkflowActionMedia(projectId, eventId, media.id)}
      onBusyChange={(busy) => setDownloads((current) => { const next = new Set(current); if (busy) next.add(media.id); else next.delete(media.id); return next; })} />
  </>} />;
}

function StageActionForm({ action, workflow, stage, onClose, onSaved, autoFocus = true, documentReady, presentation }: {
  action: DesignWorkflowAction; workflow: DesignWorkflowView; stage: DesignWorkflowStage; onClose: () => void; onSaved: (version: number) => void; autoFocus?: boolean; documentReady: boolean; presentation: "full" | "client" | "designer";
}) {
  const id = useId();
  const refresh = useRefreshDesignWorkflow();
  const isScope = action.id === "furniture_scope";
  const isDimensionEntry = isScope || action.id === "furniture_upload";
  const isScopeReview = action.id === "furniture_accept" || action.id === "furniture_scope_return";
  const [uomBusy, setUomBusy] = useState(false);
  const [version] = useState(stage.operational!.version);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [designHandoverAcknowledged, setDesignHandoverAcknowledged] = useState(false);
  const [documentEventId] = useState(stage.operational?.submittedDocument?.eventId);
  const [documentReviewed, setDocumentReviewed] = useState(false);
  const [designerId, setDesignerId] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [initialScope] = useState(() => {
    const editingScope = action.id === "furniture_scope" && stage.type === "existing_furniture_dimensions";
    return {
      roomIds: editingScope ? (stage.operational?.rooms ?? []).filter((room) => room.required && workflow.furnitureRooms?.some((option) => option.id === room.id)).map((room) => room.id)
        : action.id === "furniture_upload" ? (stage.operational?.rooms ?? []).filter(canSubmitDimensions).map((room) => room.id) : [],
      noFurniture: editingScope && Boolean(stage.operational?.furniture?.notApplicable)
    };
  });
  const [roomIds, setRoomIds] = useState<string[]>(initialScope.roomIds);
  const [initialEstimateSource] = useState(() => JSON.stringify(workflow.furnitureRooms ?? []));
  const dimensionRooms = (workflow.furnitureRooms ?? []).map((room) => ({
    id: room.id, name: room.name, estimateItems: room.estimateItems ?? [],
    dimensions: stage.operational?.rooms?.find((saved) => saved.id === room.id)?.dimensions
  }));
  const [initialDimensions] = useState(() => isDimensionEntry ? createFurnitureDimensionsDraft(dimensionRooms, workflow.furnitureRooms ?? []) : {});
  const [dimensionDraft, setDimensionDraft] = useState(initialDimensions);
  const [reviewSubmissions] = useState(() => Object.fromEntries((stage.operational?.rooms ?? []).filter((room) => room.dimensions?.status === "pending").map((room) => [room.id, room.dimensions!.submissionEventId])));
  const [requirementsSubmissionEventId] = useState(stage.operational?.furniture?.requirementsSubmissionEventId);
  const [noFurniture, setNoFurniture] = useState(initialScope.noFurniture);
  const dimensionsNeeded = isDimensionEntry && !noFurniture && roomIds.length > 0;
  const uoms = useQuery({
    queryKey: projectWorkflowKeys.furnitureUoms(workflow.projectId),
    queryFn: ({ signal }) => getFurnitureUoms(workflow.projectId, signal),
    enabled: dimensionsNeeded,
    staleTime: 60_000
  });
  const uomsUnavailable = dimensionsNeeded && (uoms.isPending || uoms.isError);
  const [file, setFile] = useState<File | null>(null);
  const submissionFile = isScope && noFurniture && !action.requiresProof ? null : file;
  const mediaByteSize = useMemo(() => mediaFiles.reduce((sum, media) => sum + media.size, 0), [mediaFiles]);
  const [validation, setValidation] = useState("");
  const [progress, setProgress] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inFlight = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const roomCheckboxes = useRef(new Map<string, HTMLInputElement>());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (autoFocus) heading.current?.focus(); }, [autoFocus]);
  useEffect(() => { setDocumentReviewed(false); }, [stage.operational?.submittedDocument?.eventId, stage.operational?.version, documentReady]);
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => performDesignWorkflowAction({
      projectId: workflow.projectId, stageId: stage.id, expectedVersion: version,
      action: action.id, data, note: note.trim(), file: submissionFile, mediaFiles, idempotencyKey
    }, setProgress),
    onSuccess: async (result) => { await refresh(); onSaved(result.version); },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) await refresh();
      if (dimensionsNeeded) await uoms.refetch();
    },
    onSettled: () => { inFlight.current = false; }
  });
  const blockedReason = stage.operational?.availableActions.find((candidate) => candidate.id === action.id)?.disabledReason;
  const isClientKickoff = action.id === "client_kickoff_complete";
  const isDimensionReview = dimensionReviewActions.has(action.id);
  const documentChanged = isClientKickoff && stage.operational?.submittedDocument?.eventId !== documentEventId;
  const dimensionsChanged = isDimensionReview && Object.entries(reviewSubmissions).some(([roomId, eventId]) => !stage.operational?.rooms?.some((room) => room.id === roomId && room.dimensions?.submissionEventId === eventId && room.dimensions.status === "pending"));
  const requirementsChanged = isScopeReview && stage.operational?.furniture?.requirementsSubmissionEventId !== requirementsSubmissionEventId;
  const missingRequirementsReference = isScopeReview && !requirementsSubmissionEventId && Boolean(stage.operational?.rooms?.some((room) => room.dimensions));
  const estimateItemsChanged = isDimensionEntry && JSON.stringify(workflow.furnitureRooms ?? []) !== initialEstimateSource;
  const unavailableRoomIds = dimensionsNeeded ? roomIds.filter((roomId) => !workflow.furnitureRooms?.find((room) => room.id === roomId)?.estimateItems?.length) : [];
  const unavailableItems = unavailableRoomIds.length > 0;
  const stale = stage.operational?.version !== version || documentChanged || dimensionsChanged || requirementsChanged || missingRequirementsReference || estimateItemsChanged || Boolean(blockedReason) || !stage.operational?.availableActions.some((candidate) => candidate.id === action.id);
  const isMeasurement = action.id === "measurement_complete";
  const needsFile = !isMeasurement && (action.requiresProof || evidenceActions.has(action.id) || (isScope && dimensionsNeeded));
  const hasEvidence = Boolean(submissionFile || mediaFiles.length);
  const isInternalKickoff = action.id === "internal_kickoff_complete";
  // Client decisions stay beside the submitted values and protected documents.
  const contextual = !isInternalKickoff && !isClientKickoff && !(presentation === "client" && inlineClientFurnitureActions.has(action.id));
  const scopeChanged = noFurniture !== initialScope.noFurniture || roomIds.length !== initialScope.roomIds.length || roomIds.some((roomId) => !initialScope.roomIds.includes(roomId));
  const dirty = Boolean(note || meetingAt || designerId || mediaFiles.length || (action.id === "furniture_scope" || action.id === "furniture_upload" ? scopeChanged : roomIds.length || noFurniture) || JSON.stringify(dimensionDraft) !== JSON.stringify(initialDimensions) || file || designHandoverAcknowledged || documentReviewed);
  const FormHeading = presentation === "designer" ? "h5" : "h6";
  const needsRooms = action.id === "furniture_scope" || action.id === "furniture_upload" || isDimensionReview;
  const rooms = action.id === "furniture_scope" ? workflow.furnitureRooms ?? [] : stage.operational?.rooms?.filter((room) => isDimensionReview ? room.required && room.dimensions?.status === "pending" : canSubmitDimensions(room)) ?? [];
  const selectRoom = (roomId: string, checked: boolean) => setRoomIds((current) => checked ? [...current.filter((value) => value !== roomId), roomId] : current.filter((value) => value !== roomId));
  const staleMessage = blockedReason ?? "The workflow changed while this form was open. Close it and reopen the action to review the latest state.";
  const unavailableRoomNames = unavailableRoomIds.map((roomId) => rooms.find((room) => room.id === roomId)?.name ?? roomId);
  const unavailableRoomSummary = unavailableRoomNames.slice(0, 3).join(", ") + (unavailableRoomNames.length > 3 ? ` and ${unavailableRoomNames.length - 3} more` : "");
  const entryBlocker = !isDimensionEntry || mutation.isPending ? undefined
    : stale ? { message: staleMessage, kind: "stale" as const }
    : unavailableItems ? { message: `No selected estimate items in ${unavailableRoomSummary}. Uncheck rooms that do not need measurements, or update the approved estimate.`, kind: "rooms" as const }
    : uomBusy ? { message: "Finish adding the UOM or close the Add UOM panel before submitting.", kind: "uom-busy" as const }
    : uomsUnavailable ? { message: uoms.isPending || uoms.isFetching ? "Loading configured UOMs. Please wait before submitting." : "Configured UOMs could not be loaded. Retry to continue; your entries are kept.", kind: uoms.isError ? "uom-error" as const : "uom-loading" as const }
    : undefined;
  const reviewRooms = () => {
    const firstRoom = rooms.find((room) => unavailableRoomIds.includes(room.id));
    const checkbox = firstRoom ? roomCheckboxes.current.get(firstRoom.id) : undefined;
    checkbox?.focus({ preventScroll: true });
    checkbox?.scrollIntoView?.({ block: "center", behavior: "auto" });
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || stale || uomBusy || uomsUnavailable) return;
    if (isInternalKickoff && !designHandoverAcknowledged) { setValidation("Acknowledge receipt of the design flow before completing Internal Kick off."); return; }
    if (isClientKickoff && (!documentEventId || !documentReady || !documentReviewed)) { setValidation("Review the Designer’s submitted document and confirm your acknowledgement before completing Client Kick off."); return; }
    if (needsFile && !submissionFile) { setValidation("Choose the required evidence file."); fileRef.current?.focus(); return; }
    if (submissionFile && !/\.(pdf|png|jpe?g|webp)$/iu.test(submissionFile.name)) { setValidation("Choose a PDF, JPG, PNG or WebP file."); fileRef.current?.focus(); return; }
    if (isMeasurement) {
      const error = validateMeasurementMedia(mediaFiles, file);
      if (error) { setValidation(error); mediaRef.current?.focus(); return; }
    }
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
    if (action.id === "furniture_scope") {
      data.rooms = noFurniture ? [] : rooms.map((room) => ({ id: room.id, required: roomIds.includes(room.id) }));
      data.notApplicable = noFurniture;
      if (!noFurniture) {
        const parsed = parseFurnitureDimensionsDraft(roomIds, dimensionDraft, workflow.furnitureRooms ?? [], uoms.data ?? []);
        if (parsed.error) { setValidation(parsed.error); return; }
        data.dimensions = parsed.rooms;
      }
    }
    else if (action.id === "furniture_upload") {
      const parsed = parseFurnitureDimensionsDraft(roomIds, dimensionDraft, workflow.furnitureRooms ?? [], uoms.data ?? []);
      if (parsed.error) { setValidation(parsed.error); return; }
      data.rooms = parsed.rooms;
    }
    else if (isScopeReview && requirementsSubmissionEventId) data.submissionEventId = requirementsSubmissionEventId;
    else if (isDimensionReview) data.submissions = roomIds.map((roomId) => ({ roomId, submissionEventId: reviewSubmissions[roomId] }));
    setValidation(""); setProgress(0); inFlight.current = true; mutation.mutate(data);
  }

  const actions = (requestClose: () => void) => {
    const buttons = <div className="workflow-stage-actions__buttons"><Button type="submit" form={`${id}-action-form`} aria-describedby={entryBlocker ? `${id}-submit-blocker` : undefined} busy={mutation.isPending} busyLabel={hasEvidence && progress < 100 ? "Uploading evidence…" : "Saving action…"} disabled={stale || unavailableItems || uomBusy || uomsUnavailable || (isInternalKickoff && !designHandoverAcknowledged) || (isClientKickoff && (!documentEventId || !documentReady || !documentReviewed))}>{isInternalKickoff ? "Complete and save Internal Kick off" : actionLabel(action)}</Button><Button variant="destructive-outline" onClick={requestClose} disabled={mutation.isPending || uomBusy}>Cancel</Button></div>;
    return isDimensionEntry ? <div className="workflow-stage-actions__submit-footer">{entryBlocker ? <div className="workflow-stage-actions__submit-blocker">
      <p id={`${id}-submit-blocker`} role={entryBlocker.kind === "stale" ? "alert" : "status"}>{entryBlocker.message}</p>
      {entryBlocker.kind === "rooms" ? <Button size="compact" variant="quiet" onClick={reviewRooms}>Review rooms</Button> : null}
      {entryBlocker.kind === "uom-error" ? <Button size="compact" variant="quiet" busy={uoms.isFetching} busyLabel="Loading UOMs…" onClick={() => void uoms.refetch()}>Retry UOMs</Button> : null}
    </div> : null}{buttons}</div> : buttons;
  };
  const form = <form id={`${id}-action-form`} className={`workflow-stage-actions__form${contextual ? " workflow-stage-actions__form--panel" : ""}`} onSubmit={submit} aria-label={actionLabel(action)}>
    {!contextual ? <div className={`workflow-stage-actions__form-heading${(presentation === "designer" && isInternalKickoff) || (presentation === "client" && isClientKickoff) ? " sr-only" : ""}`}><FormHeading ref={heading} tabIndex={-1}>{action.label}</FormHeading>{action.requiresProof && presentation !== "designer" ? <p>Supporting evidence is required and will be retained with this action.</p> : null}</div> : null}
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
      {isMeasurement ? <div className="workflow-stage-actions__media">
        <Field id={`${id}-media`} label="Site photos and videos" required hint="Choose one or more photos or videos. JPG, PNG, WebP, GIF, HEIC/HEIF, TIFF, MP4, MOV or WebM. Choose files again to add more.">{(props) => <FileInput {...props} required={mediaFiles.length === 0} ref={mediaRef} multiple accept={MEASUREMENT_MEDIA_ACCEPT} onChange={(event) => {
          const additions = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (!additions.length) return;
          const next = [...mediaFiles];
          const selectedKeys = new Set(mediaFiles.map(measurementFileKey));
          for (const addition of additions) {
            const key = measurementFileKey(addition);
            if (!selectedKeys.has(key)) { next.push(addition); selectedKeys.add(key); }
          }
          const error = validateMeasurementMedia(next, file);
          if (error) { setValidation(error); return; }
          setMediaFiles(next); setValidation("");
        }} />}</Field>
        {mediaFiles.length ? <>
          <p className="workflow-stage-actions__media-summary" role="status">{mediaFiles.length} {mediaFiles.length === 1 ? "file" : "files"} selected · {formatEvidenceSize(mediaByteSize)}{file ? ` + ${formatEvidenceSize(file.size)} sketch` : ""}</p>
          <WorkflowMediaList items={mediaFiles} label="Selected site photos and videos" getKey={measurementFileKey} renderItem={(media) => <>
            <div><span className="workflow-stage-actions__media-name">{media.name}</span><span className="workflow-stage-actions__media-meta">{measurementMediaKind(media.name)} · {formatEvidenceSize(media.size)}</span></div>
            <Button size="compact" variant="quiet" aria-label={`Remove ${media.name}`} onClick={() => { setMediaFiles((current) => current.filter((candidate) => candidate !== media)); setValidation(""); mediaRef.current?.focus(); }}>Remove</Button>
          </>} />
        </> : null}
      </div> : null}
      {needsRooms ? <fieldset className="workflow-stage-actions__rooms">
        <legend>{action.id === "furniture_scope" ? "Rooms needing existing furniture dimensions" : isDimensionReview ? "Select submitted rooms to review" : "Select rooms"}</legend>
        {action.id === "furniture_scope" ? <label><Checkbox checked={noFurniture} onChange={(event) => { setNoFurniture(event.target.checked); }} />No existing furniture dimensions are needed</label> : null}
        {!noFurniture ? rooms.length ? rooms.map((room) => isDimensionEntry ? <div key={room.id} className="workflow-stage-actions__room-option">
          <label><Checkbox ref={(element) => { if (element) roomCheckboxes.current.set(room.id, element); else roomCheckboxes.current.delete(room.id); }} checked={roomIds.includes(room.id)}
            aria-describedby={unavailableRoomIds.includes(room.id) ? `${id}-${room.id}-unavailable` : undefined}
            aria-invalid={unavailableRoomIds.includes(room.id) || undefined}
            onChange={(event) => selectRoom(room.id, event.target.checked)} />{room.name}</label>
          {unavailableRoomIds.includes(room.id) ? <p id={`${id}-${room.id}-unavailable`} className="workflow-stage-actions__room-warning">No selected estimate items. Uncheck if measurements are not needed, or update the approved estimate.</p> : null}
        </div> : <label key={room.id}><Checkbox checked={roomIds.includes(room.id)} onChange={(event) => selectRoom(room.id, event.target.checked)} />{room.name}</label>) : <p>{action.id === "furniture_scope" ? "Project rooms have not been configured yet. Add the rooms in the estimate before requesting room dimensions." : isDimensionReview ? "No submitted rooms are awaiting review." : "No rooms are awaiting a dimensions submission."}</p> : null}
        {isDimensionReview ? <p>Your decision applies only to the selected rooms and their current submitted dimensions.</p> : null}
      </fieldset> : null}
      {isScope && !noFurniture && !roomIds.length ? <p style={{ gridColumn: "1 / -1" }}>Select rooms above to enter dimensions for their estimate items.</p> : null}
      {isDimensionEntry && !noFurniture ? <FurnitureDimensionsEditor projectId={workflow.projectId} rooms={dimensionRooms.filter((room) => roomIds.includes(room.id))} draft={dimensionDraft} onChange={setDimensionDraft}
        uoms={uoms.data ?? []} uomsLoading={uoms.isPending} uomsError={uoms.isError ? "UOMs could not be loaded. Try again." : undefined}
        onRetryUoms={() => void uoms.refetch()} onUomBusyChange={setUomBusy} disabled={stale || mutation.isPending} /> : null}
      {needsFile || isMeasurement || isScope ? <div hidden={isScope && !needsFile} style={{ gridColumn: "1 / -1" }}><Field id={`${id}-file`} label={action.id === "internal_kickoff_complete" ? "Signed kick-off checklist" : isMeasurement ? "As-built on-site sketch (optional)" : (action.id === "furniture_upload" || (isScope && dimensionsNeeded)) ? "Furniture dimensions document" : "Client action proof"} hint="PDF, JPG, PNG or WebP. Evidence stays in the action history." required={needsFile}>{(props) => <><FileInput {...props} ref={fileRef} accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setValidation(""); }} />{isMeasurement && file ? <Button size="compact" variant="quiet" onClick={() => { setFile(null); if (fileRef.current) { fileRef.current.value = ""; fileRef.current.focus(); } setValidation(""); }}>Remove sketch</Button> : null}</>}</Field></div> : null}
      {!(presentation === "client" && isClientKickoff) ? <Field id={`${id}-note`} label={noteActions.has(action.id) ? "Reason" : action.id === "client_kickoff_schedule" ? "Client availability / note" : "Note"} hint={action.id === "furniture_scope_return" || action.id === "furniture_dimensions_return" ? "Explain what needs to be corrected. This feedback will be visible to the project team." : undefined} required={noteActions.has(action.id)}>{(props) => <Textarea {...props} rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />}</Field> : null}
    </fieldset>
    {validation ? <p role="alert">{validation}</p> : null}
    {stale && !mutation.isPending && !isDimensionEntry ? <p role="alert">{staleMessage}</p> : null}
    {mutation.isError ? <p role="alert">{mutation.error instanceof Error ? mutation.error.message : "The action could not be saved. Please try again."}</p> : null}
    {mutation.isPending && hasEvidence ? <div role="status"><p>{progress < 100 ? `Uploading evidence… ${progress}%` : "Saving action and evidence…"}</p><ProgressBar value={progress} label="Evidence upload progress" /></div> : null}
    {!contextual ? actions(() => { if (!mutation.isPending) { if (dirty) setConfirmDiscard(true); else onClose(); } }) : null}
  </form>;
  return contextual ? <ContextPanel className="workflow-action-panel" title={actionLabel(action)} eyebrow={stage.name}
    description={isMeasurement ? "Upload site photos or videos to complete the measurement. A sketch is optional." : isDimensionEntry ? "Select the rooms, enter measurements for their estimate items and attach a document. Submit them together for Client approval." : action.requiresProof ? "Supporting evidence is required and will be retained with this action." : undefined}
    width={needsRooms || needsFile || isMeasurement ? "wide" : "medium"}
    busy={mutation.isPending}
    dirty={dirty}
    onClose={() => { if (!uomBusy) onClose(); }} footer={({ requestClose }) => actions(requestClose)}>{form}</ContextPanel> : <>{form}{confirmDiscard ? <Dialog
      title="Discard unsaved changes?" role="alertdialog" description="Your acknowledgement, notes, and selected evidence have not been saved."
      busy={mutation.isPending} onClose={() => setConfirmDiscard(false)}>
      <div className="modal__actions">
        <Button variant="secondary" data-dialog-initial-focus disabled={mutation.isPending} onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
        <Button variant="destructive" disabled={mutation.isPending} onClick={() => { if (!mutation.isPending) onClose(); }}>Discard changes</Button>
      </div>
    </Dialog> : null}</>;
}
