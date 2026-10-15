import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { KnowledgeCard, KnowledgeChoice, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles as styles } from "../knowledge/knowledgeUi";
import { NativeAnnotationEditor } from "../annotations/NativeAnnotationEditor";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import type { ProtectedDocumentSource } from "../documents/useProtectedDocument";
import { assignDesignItem, createDesignDrawing, designPlanKeys, editDesignDrawing, getDesignWorkspace, getPlanRequests, pageImagePath, removeDesignDrawing, removeDesignUpload, retryDesignUpload, revisionImagePath, submitDesignDrawings, type submissionSchema } from "./designPlanApi";
import { cropWithinPage, drawingSubmissionIssues, latestDesignRevisions, type DesignDrawing, type DesignItem, type DesignPlacement, type DesignRevision, type DesignWorkspace } from "./designPlanModel";
import { DesignCommandState, NativeDesignCropEditor, useDesignCommand, useDesignDraftGuard, useDesignOwner, useDesignRefresh, isDesignDenied } from "./DesignPlanControls";
import { DesignFileUpload } from "./DesignFileUpload";
import { PreparedPlanDocuments } from "./PreparedPlanDocuments";
import { PlanChangeRequests } from "./PlanChangeRequests";
import type { z } from "zod";

export interface EstimateDesignPreparationProps {
  readonly estimateId: string; readonly session: AuthenticatedSession;
  readonly rooms: readonly DesignPlacement[]; readonly scopes: readonly DesignPlacement[]; readonly items: readonly DesignItem[];
  readonly readOnly?: boolean; readonly allowDeletion?: boolean; readonly designerMode?: boolean; readonly onChanged?: () => void;
}
type DrawingSelection = { drawing: DesignDrawing; revision: DesignRevision; mode: "correct" | "assign" | "replace" | "history" | "remove" };
export function EstimateDesignPreparation(props: EstimateDesignPreparationProps) {
  const context = useConfiguredRuntime();
  if (props.session.user.role === "client" || !canPerformOperation(props.session, "GET /estimates/:estimateId/design-uploads")) return null;
  return <Preparation key={`${context.environment.environment.id}:${context.session.generation}:${props.session.user.id}:${props.estimateId}`} {...props} />;
}
function Preparation({ estimateId, session, rooms, scopes, items, readOnly = true, allowDeletion = false, designerMode = false, onChanged }: EstimateDesignPreparationProps) {
  const owner = useDesignOwner(estimateId, session); const client = useQueryClient(); const invalidate = useDesignRefresh(session); const [denied, setDenied] = useState(false); const [addNewPage, setAddNewPage] = useState(false); const [selection, setSelection] = useState<DrawingSelection | null>(null); const [manual, setManual] = useState(false); const [deleteUpload, setDeleteUpload] = useState<string | null>(null); const [documentsReady, setDocumentsReady] = useState(false); const [notice, setNotice] = useState(""); const [submitOpen, setSubmitOpen] = useState<string | null>(null); const [preview, setPreview] = useState<{ source: ProtectedDocumentSource; revision?: DesignRevision } | null>(null);
  const query = useQuery({ queryKey: designPlanKeys.workspace(owner.scope, estimateId), queryFn: ({ signal }) => getDesignWorkspace(owner.context.runtime, estimateId, signal), enabled: !denied, retry: false, refetchInterval: current => current.state.data?.uploads.some(upload => ["queued", "processing"].includes(upload.extractionStatus)) ? 2000 : false });
  const canReadRequests = canPerformOperation(session, "GET /estimate-plan-change-requests");
  const requests = useQuery({ queryKey: designPlanKeys.requests(owner.scope, estimateId), queryFn: ({ signal }) => getPlanRequests(owner.context.runtime, estimateId, signal), enabled: !denied && canReadRequests, retry: false });
  const revoke = () => { setDenied(true); setSelection(null); setManual(false); setPreview(null); client.removeQueries({ queryKey: designPlanKeys.workspace(owner.scope, estimateId) }); };
  const refresh = async () => { await invalidate(); const result = await query.refetch({ throwOnError: true }); onChanged?.(); return result; };
  const command = useDesignCommand(owner, refresh, revoke);
  const readyCallback = useCallback((ready: boolean) => setDocumentsReady(ready), []);
  if (denied || isDesignDenied(query.error)) return <KnowledgeCard title="Design preparation"><KnowledgeText>This estimate's design is unavailable for your current access.</KnowledgeText></KnowledgeCard>;
  if (query.isPending) return <KnowledgeCard title="Design preparation"><KnowledgeText>Loading saved drawings…</KnowledgeText></KnowledgeCard>;
  if (!query.data || query.isError) return <KnowledgeCard title="Design preparation"><KnowledgeText error>Current drawings could not be loaded. Refresh before making changes.</KnowledgeText><Button label="Retry design preparation" onPress={() => void query.refetch()} /></KnowledgeCard>;
  const data = query.data; const latest = latestDesignRevisions(data); const active = data.drawings.filter(drawing => drawing.active); const extractionPending = data.uploads.some(upload => ["queued", "processing"].includes(upload.extractionStatus)); const editable = !readOnly && !query.isFetching && !command.busy && !command.blocked;
  const submissionSource = JSON.stringify([data.uploads.map(upload => [upload.id, upload.extractionStatus]), data.drawings.filter(drawing => drawing.active).map(drawing => drawing.id), data.revisions.map(revision => [revision.id, revision.reviewStatus])]);
  const issues = drawingSubmissionIssues(data); const canSubmit = editable && !issues.length && (!designerMode || documentsReady) && canPerformOperation(session, "POST /estimates/:estimateId/design-drawings/submit");
  const openRequests = (requests.data?.length ?? 0) > 0; const requestsReady = !canReadRequests || (!requests.isPending && !requests.isError && !requests.isFetching);
  const labeledItems = items.map(item => ({ ...item, roomLabel: item.roomLabel ?? rooms.find(room => room.id === item.roomId)?.label ?? "Room" }));
  const uploadToDelete = data.uploads.find(upload => upload.id === deleteUpload);
  const viewRevision = (drawing: DesignDrawing, revision: DesignRevision) => setPreview({ source: { path: revisionImagePath(revision.id), fileName: `${drawing.displayTitle}.png`, mimeType: "image/png", kind: "drawing-image" }, revision });
  return <View style={styles.stack}>
    <KnowledgeCard title="Design preparation"><KnowledgeText>{readOnly ? "Submitted or approved designs are read-only. Saved revisions and client feedback remain available." : "Upload a plan, review extracted drawings and prepare it for Client approval."}</KnowledgeText>
      {notice ? <KnowledgeText>{notice}</KnowledgeText> : null}
      {!readOnly && openRequests ? <><KnowledgeText>Client feedback is open. Use the requested-page or individual drawing replacement below to update existing drawings.</KnowledgeText><KnowledgeChoice label="Upload an additional new design page" multiple selected={addNewPage} disabled={!editable} onPress={() => setAddNewPage(!addNewPage)} /></> : null}
      {!readOnly && !requestsReady ? <KnowledgeText>Checking current Client feedback before adding another plan.</KnowledgeText> : null}
      {!readOnly && (!openRequests || addNewPage) && canPerformOperation(session, "POST /estimates/:estimateId/design-uploads") ? <DesignFileUpload estimateId={estimateId} session={session} target={{ kind: "ordinary" }} disabled={!editable || extractionPending || !requestsReady} label={openRequests ? "Upload new design page" : "Upload design plan"} onChanged={refresh} onDenied={revoke} /> : null}
      {data.uploads.map(upload => <KnowledgeCard key={upload.id} title={upload.originalFilename}>
        <KnowledgeText>{upload.extractionStatus.replaceAll("_", " ")} · {upload.purpose.replaceAll("_", " ")}</KnowledgeText>
        {upload.failureMessage ? <KnowledgeText error>{upload.failureMessage}</KnowledgeText> : null}
        {upload.canRetry && !readOnly && canPerformOperation(session, "POST /estimate-design-uploads/:uploadId/retry") ? <Button label={`Retry extraction: ${upload.originalFilename}`} disabled={!editable} onPress={() => void command.run(() => retryDesignUpload(owner.context.runtime, estimateId, upload.id), { replaySafe: true })} /> : null}
        {allowDeletion && upload.canDelete && canPerformOperation(session, "DELETE /estimate-design-uploads/:uploadId") ? <Button label={`Delete upload: ${upload.originalFilename}`} variant="danger" disabled={query.isFetching || command.busy} onPress={() => { command.reset(); setDeleteUpload(upload.id); }} /> : upload.deleteBlockedReason ? <KnowledgeText>{upload.deleteBlockedReason}</KnowledgeText> : null}
      </KnowledgeCard>)}
      {!data.uploads.length ? <KnowledgeText>No design files have been uploaded.</KnowledgeText> : null}
      <DesignCommandState command={command} onRefresh={async () => { await refresh(); command.reset(); setSubmitOpen(null); setDeleteUpload(null); }} />
    </KnowledgeCard>
    <KnowledgeCard title={`Extracted drawings (${active.length})`}>
      {!active.length ? <KnowledgeText>Drawings appear after extraction. Available source pages can also be cropped manually.</KnowledgeText> : null}
      {active.map(drawing => { const revision = latest.get(drawing.id); if (!revision) return <KnowledgeText key={drawing.id} error>{drawing.displayTitle}: current revision unavailable.</KnowledgeText>;
        const canEdit = editable && !["submitted", "approved"].includes(revision.reviewStatus);
        return <KnowledgeCard key={drawing.id} title={drawing.displayTitle || drawing.detectedTitle}>
          <KnowledgeText>Revision {revision.revisionNumber} · {revision.reviewStatus.replaceAll("_", " ")} · {drawing.verified ? "Verified" : "Not verified"}</KnowledgeText>
          <KnowledgeText>{rooms.find(room => room.id === drawing.roomId)?.label ?? "Miscellaneous"} · {scopes.find(scope => scope.id === drawing.scopeSectionId)?.label ?? "Unassigned item"}</KnowledgeText>
          {drawing.ocrConfidence !== null && drawing.ocrConfidence < .7 ? <KnowledgeText>Low extraction confidence. Check the title and crop.</KnowledgeText> : null}
          {revision.changeSummary ? <KnowledgeText>Client feedback: {revision.changeSummary}</KnowledgeText> : null}
          <View style={styles.row}><Button label={`Preview ${drawing.displayTitle}`} variant="quiet" onPress={() => viewRevision(drawing, revision)} /><Button label={`History: ${drawing.displayTitle}`} variant="quiet" onPress={() => setSelection({ drawing, revision, mode: "history" })} /></View>
          {canEdit ? <View style={styles.row}>
            {canPerformOperation(session, "PATCH /estimate-design-drawings/:drawingId") ? <Button label={`Edit / verify ${drawing.displayTitle}`} variant="secondary" onPress={() => setSelection({ drawing, revision, mode: "correct" })} /> : null}
            {canPerformOperation(session, "PUT /estimate-design-drawings/:drawingId/estimate-item") ? <Button label={`Assign item: ${drawing.displayTitle}`} variant="secondary" onPress={() => setSelection({ drawing, revision, mode: "assign" })} /> : null}
            {canPerformOperation(session, "POST /estimate-design-drawings/:drawingId/replacement") ? <Button label={`Replace ${drawing.displayTitle}`} variant="secondary" onPress={() => setSelection({ drawing, revision, mode: "replace" })} /> : null}
            {canPerformOperation(session, "DELETE /estimate-design-drawings/:drawingId") ? <Button label={`Remove drawing: ${drawing.displayTitle}`} variant="danger" onPress={() => setSelection({ drawing, revision, mode: "remove" })} /> : null}
          </View> : null}
        </KnowledgeCard>;
      })}
      {!readOnly && data.pages.length && canPerformOperation(session, "POST /estimate-design-source-pages/:pageId/drawings") ? <Button label="Add missing drawing" disabled={!editable || extractionPending || !items.length} onPress={() => setManual(true)} /> : null}
      {!readOnly && active.length ? <KnowledgeText>Title verification and item assignment are optional for this milestone. Returned drawings need replacement before resubmission.</KnowledgeText> : null}
    </KnowledgeCard>
    <PlanChangeRequests estimateId={estimateId} session={session} workspace={data} disabled={!editable || extractionPending} onChanged={refresh} onDenied={revoke} />
    <PreparedPlanDocuments estimateId={estimateId} session={session} revisionKey={data.revisions.map(revision => revision.id).join(":")} enabled={designerMode && active.length > 0} canPrepare={!readOnly && !extractionPending} onReady={readyCallback} onDenied={revoke} />
    {!readOnly ? <KnowledgeCard title="Submit for Client review">{issues.map((issue, index) => <KnowledgeText key={index}>{issue}</KnowledgeText>)}<Button label="Submit drawings to Client" disabled={!canSubmit} onPress={() => setSubmitOpen(submissionSource)} /></KnowledgeCard> : null}
    <Button label="Refresh designs" variant="quiet" disabled={command.busy} onPress={() => void refresh().catch(() => undefined)} />
    {selection ? <DrawingDialog key={`${selection.drawing.id}:${selection.revision.id}:${selection.mode}`} estimateId={estimateId} session={session} selection={selection} data={data} items={labeledItems} disabled={readOnly || query.isFetching || latest.get(selection.drawing.id)?.id !== selection.revision.id} onClose={() => setSelection(null)} onChanged={refresh} onDenied={revoke} onPreview={viewRevision} /> : null}
    {manual ? <ManualDrawingDialog estimateId={estimateId} session={session} data={data} items={labeledItems} disabled={!editable} onClose={() => setManual(false)} onChanged={refresh} onDenied={revoke} /> : null}
    {uploadToDelete ? <KnowledgeModal title="Delete this design upload?" busy={command.busy} onClose={() => setDeleteUpload(null)}><KnowledgeText>This removes {uploadToDelete.originalFilename} and its unapproved drawings. A pending review is withdrawn. Historical feedback remains recorded.</KnowledgeText><DesignCommandState command={command} /><Button label="Confirm delete design upload" variant="danger" loading={command.busy} disabled={!allowDeletion || !uploadToDelete.canDelete || command.blocked || query.isFetching} onPress={() => void command.run(() => removeDesignUpload(owner.context.runtime, uploadToDelete.id), { replaySafe: true, after: () => { setDeleteUpload(null); setNotice("Design upload deleted."); } })} /></KnowledgeModal> : null}
    {submitOpen ? <KnowledgeModal title="Submit the saved drawings?" busy={command.busy} onClose={() => setSubmitOpen(null)}><KnowledgeText>The current saved revisions will be submitted for Client review. Email delivery is tracked separately from submission.</KnowledgeText>{submitOpen !== submissionSource ? <KnowledgeText error>The saved drawings changed. Close and review the latest plan before submitting.</KnowledgeText> : null}<DesignCommandState command={command} /><Button label="Confirm submit drawings" loading={command.busy} disabled={!canSubmit || submitOpen !== submissionSource} onPress={() => void command.run(() => submitDesignDrawings(owner.context.runtime, estimateId), { replaySafe: false, after: result => { const submitted = result as z.infer<typeof submissionSchema>; setSubmitOpen(null); setNotice(submitted.deliveryStatus === "sent" ? "Design submitted and emailed to the Client." : submitted.deliveryStatus === "failed" || submitted.deliveryStatus === "disabled" ? "Design submitted. Client email was not delivered; Sales can retry the stored review email." : "Design submitted. Client email delivery is being tracked separately."); } })} /></KnowledgeModal> : null}
    <ProtectedDocumentViewer visible={preview !== null} source={preview?.source ?? null} onClose={() => setPreview(null)} renderImage={preview?.revision?.annotations ? uri => <NativeAnnotationEditor imageUri={uri} imageWidth={preview.revision!.annotations!.imageWidth} imageHeight={preview.revision!.annotations!.imageHeight} value={preview.revision!.annotations!} readOnly onChange={() => undefined} /> : undefined} />
  </View>;
}

function DrawingDialog({ estimateId, session, selection, data, items, disabled, onClose, onChanged, onDenied, onPreview }: { readonly estimateId: string; readonly session: AuthenticatedSession; readonly selection: DrawingSelection; readonly data: DesignWorkspace; readonly items: readonly DesignItem[]; readonly disabled: boolean; readonly onClose: () => void; readonly onChanged: () => Promise<unknown>; readonly onDenied: () => void; readonly onPreview: (drawing: DesignDrawing, revision: DesignRevision) => void }) {
  const owner = useDesignOwner(estimateId, session); const command = useDesignCommand(owner, onChanged, onDenied); const { drawing, revision, mode } = selection; const page = data.pages.find(page => page.id === revision.sourcePageId);
  const [title, setTitle] = useState(drawing.displayTitle); const [crop, setCrop] = useState(revision.crop); const [verified, setVerified] = useState(drawing.verified); const [itemKey, setItemKey] = useState(drawing.roomId && drawing.catalogueId ? JSON.stringify([drawing.roomId, drawing.catalogueId]) : "");
  const [childLocked, setChildLocked] = useState(false); const chosen = items.find(item => JSON.stringify([item.roomId, item.catalogueId]) === itemKey); const dirty = title !== drawing.displayTitle || JSON.stringify(crop) !== JSON.stringify(revision.crop) || verified !== drawing.verified;
  useDesignDraftGuard(dirty);
  const close = () => { if (command.busy || command.blocked || childLocked) return; if (dirty && mode === "correct") Alert.alert("Discard drawing changes?", "The saved drawing will remain unchanged.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: onClose }]); else onClose(); };
  return <KnowledgeModal title={`${mode === "correct" ? "Edit and verify" : mode === "assign" ? "Assign estimate item" : mode === "replace" ? "Replace drawing" : mode === "remove" ? "Remove drawing" : "Revision history"}: ${drawing.displayTitle}`} busy={command.busy || command.blocked || childLocked} onClose={close}>
    <KnowledgeText>Saved revision {revision.revisionNumber}</KnowledgeText>{disabled && mode !== "history" ? <KnowledgeText error>The saved source changed or is read-only. Close and review the current drawing.</KnowledgeText> : null}
    {mode === "correct" ? <><Field label="Drawing title" value={title} onChangeText={setTitle} editable={!disabled && !command.busy && !command.blocked} maxLength={500} />{page ? <NativeDesignCropEditor path={pageImagePath(page.id)} page={page} crop={crop} onChange={setCrop} disabled={disabled || command.busy || command.blocked} /> : <KnowledgeText error>Source page unavailable.</KnowledgeText>}<KnowledgeChoice label="Title and crop verified" multiple selected={verified} onPress={() => setVerified(!verified)} disabled={disabled || command.busy || command.blocked} /><Button label="Save drawing changes" loading={command.busy} disabled={disabled || command.blocked || !title.trim() || !page || !cropWithinPage(crop, page)} onPress={() => void command.run(() => editDesignDrawing(owner.context.runtime, estimateId, drawing.id, { version: revision.revisionNumber, displayTitle: title.trim(), crop, verified }), { replaySafe: true, after: onClose })} /></> : null}
    {mode === "assign" ? <><KnowledgeSelect label="Exact estimate item" value={itemKey} onChange={setItemKey} disabled={disabled || command.busy || command.blocked} options={items.map(item => ({ value: JSON.stringify([item.roomId, item.catalogueId]), label: `${item.label} · ${item.scopeLabel} · ${item.roomLabel ?? "Room"}` }))} /><Button label="Assign selected estimate item" disabled={disabled || command.blocked || !chosen} loading={command.busy} onPress={() => chosen && void command.run(() => assignDesignItem(owner.context.runtime, estimateId, drawing.id, { version: revision.revisionNumber, roomId: chosen.roomId, catalogueId: chosen.catalogueId }), { replaySafe: true, after: onClose })} /></> : null}
    {mode === "replace" ? <><KnowledgeText>Upload the revised item. Its new revision replaces this drawing in the full plan; prior approvals and feedback are retained.</KnowledgeText><DesignFileUpload estimateId={estimateId} session={session} target={{ kind: "drawing", drawingId: drawing.id, version: revision.revisionNumber }} disabled={disabled} label="Upload replacement drawing" onLockChange={setChildLocked} onChanged={onChanged} onDenied={onDenied} /></> : null}
    {mode === "remove" ? <><KnowledgeText>Remove this drawing from the current plan. Historical revisions remain recorded.</KnowledgeText><Button label="Confirm remove drawing" variant="danger" loading={command.busy} disabled={disabled || command.blocked} onPress={() => void command.run(() => removeDesignDrawing(owner.context.runtime, drawing.id, revision.revisionNumber), { replaySafe: true, after: onClose })} /></> : null}
    {mode === "history" ? data.revisions.filter(item => item.drawingId === drawing.id).sort((a, b) => b.revisionNumber - a.revisionNumber).map(item => <KnowledgeCard key={item.id} title={`Revision ${item.revisionNumber} · ${item.reviewStatus.replaceAll("_", " ")}`}><KnowledgeText>{item.label}</KnowledgeText>{item.changeSummary ? <KnowledgeText>{item.changeSummary}</KnowledgeText> : null}<Button label={`Open drawing revision ${item.revisionNumber}`} variant="quiet" onPress={() => onPreview(drawing, item)} /></KnowledgeCard>) : null}
    <DesignCommandState command={command} onRefresh={async () => { await onChanged(); onClose(); }} />
  </KnowledgeModal>;
}
function ManualDrawingDialog({ estimateId, session, data, items, disabled, onClose, onChanged, onDenied }: { readonly estimateId: string; readonly session: AuthenticatedSession; readonly data: DesignWorkspace; readonly items: readonly DesignItem[]; readonly disabled: boolean; readonly onClose: () => void; readonly onChanged: () => Promise<unknown>; readonly onDenied: () => void }) {
  const owner = useDesignOwner(estimateId, session); const command = useDesignCommand(owner, onChanged, onDenied); const [pageId, setPageId] = useState(data.pages[0]?.id ?? ""); const [title, setTitle] = useState(""); const [itemKey, setItemKey] = useState(""); const page = data.pages.find(page => page.id === pageId); const [crop, setCrop] = useState({ x: 0, y: 0, width: page?.width ?? 1, height: page?.height ?? 1 }); const chosen = items.find(item => JSON.stringify([item.roomId, item.catalogueId]) === itemKey);
  useDesignDraftGuard(Boolean(title || itemKey));
  return <KnowledgeModal title="Add missing drawing" busy={command.busy || command.blocked} onClose={() => title || itemKey ? Alert.alert("Discard new drawing?", "The drawing has not been saved.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: onClose }]) : onClose()}>
    <KnowledgeSelect label="Source page" value={pageId} disabled={disabled || command.busy || command.blocked} onChange={id => { setPageId(id); const next = data.pages.find(page => page.id === id); if (next) setCrop({ x: 0, y: 0, width: next.width, height: next.height }); }} options={data.pages.map(page => ({ value: page.id, label: `${data.uploads.find(upload => upload.id === page.uploadId)?.originalFilename ?? "Plan"} · Page ${page.pageNumber}` }))} />
    <Field label="New drawing title" value={title} onChangeText={setTitle} maxLength={500} editable={!disabled && !command.busy && !command.blocked} />
    <KnowledgeSelect label="Estimate item for new drawing" value={itemKey} onChange={setItemKey} disabled={disabled || command.busy || command.blocked} options={items.map(item => ({ value: JSON.stringify([item.roomId, item.catalogueId]), label: `${item.label} · ${item.scopeLabel} · ${item.roomLabel ?? "Room"}` }))} />
    {page ? <NativeDesignCropEditor path={pageImagePath(page.id)} page={page} crop={crop} onChange={setCrop} disabled={disabled || command.busy || command.blocked} /> : null}
    <DesignCommandState command={command} onRefresh={async () => { await onChanged(); onClose(); }} />
    <Button label="Create missing drawing" loading={command.busy} disabled={disabled || command.blocked || !page || !chosen || !title.trim() || !cropWithinPage(crop, page)} onPress={() => page && chosen && void command.run(() => createDesignDrawing(owner.context.runtime, estimateId, page.id, { displayTitle: title.trim(), roomId: chosen.roomId, catalogueId: chosen.catalogueId, crop }), { replaySafe: false, after: onClose })} />
  </KnowledgeModal>;
}
