import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { pickDocument, releaseSelectedAsset, TransferHttpError, type SelectedAsset, type UploadFilePart } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { createIdempotencyKey } from "../finance/money";
import { createFurnitureDimensionsDraft, parseFurnitureDimensionsDraft, type FurnitureDimensionsDraft } from "./furnitureDimensions";
import type { DesignStageOperational, DesignWorkflowAction, DesignWorkflowView, FurnitureUomOption } from "./workflowTypes";
import { actionDateData, workflowActionNeedsDate, workflowActionNeedsNote } from "./workflowModel";

const proofPolicy = { acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"], maxBytes: 25 * 1024 * 1024 };
const mediaPolicy = { acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/tiff", "video/mp4", "video/quicktime", "video/webm"], maxBytes: 150 * 1024 * 1024 };
interface Props { readonly projectId: string; readonly stageId: string; readonly operational: DesignStageOperational; readonly action: DesignWorkflowAction; readonly workflow: DesignWorkflowView; readonly refresh: () => void }
interface Command { expectedVersion: number; stageId: string; action: string; idempotencyKey: string; note: string; data: Record<string, unknown> }
interface Submission { command: Command; files: UploadFilePart[] }
const failure = (cause: unknown) => cause instanceof Error ? cause.message : "The workflow action could not be confirmed.";
function Choice({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={s.choice}><View style={[s.box, checked ? s.selected : null]} /><Text style={s.choiceText}>{label}</Text></Pressable>;
}

export function NativeWorkflowActionForm(props: Props) {
  const [captured, setCaptured] = useState<Props | null>(null);
  return <View style={s.stack}>
    <Button label={props.action.label} variant="secondary" disabled={Boolean(props.action.disabledReason)} onPress={() => setCaptured(props)} />
    {props.action.disabledReason ? <Text style={s.warning}>{props.action.disabledReason}</Text> : null}
    {captured ? <ActionEditor initial={captured} current={props} onClose={() => setCaptured(null)} /> : null}
  </View>;
}

function ActionEditor({ initial, current, onClose }: { initial: Props; current: Props; onClose: () => void }) {
  const context = useConfiguredRuntime(); const invalidate = useInvalidateEvent();
  const { projectId, stageId, operational, workflow, action } = initial;
  const navigationGuard = useScaffoldNavigationGuard();
  useEffect(() => { navigationGuard?.setBlocked(true); return () => navigationGuard?.setBlocked(false); }, [navigationGuard]);
  const session = context.session.status === "authenticated" ? context.session.session : null;
  const [note, setNote] = useState(""); const [date, setDate] = useState(""); const [designerId, setDesignerId] = useState("");
  const alive = useRef(true); const owned = useRef(new Map<string, SelectedAsset>()); const uploadOwner = useRef<{ result: Promise<unknown>; cancel: () => void } | null>(null); const picking = useRef(false);
  function release(asset: SelectedAsset) { if (owned.current.delete(asset.uri)) void releaseSelectedAsset(asset).catch(() => undefined); }
  function releaseAll() { for (const asset of [...owned.current.values()]) release(asset); }
  useEffect(() => { alive.current = true; return () => { alive.current = false; const active = uploadOwner.current; if (active) { active.cancel(); void active.result.catch(() => undefined).finally(releaseAll); } else releaseAll(); }; }, []);
  const [proof, setProof] = useState<SelectedAsset | null>(null); const [media, setMedia] = useState<SelectedAsset[]>([]);
  const [noFurniture, setNoFurniture] = useState(false); const [roomIds, setRoomIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<FurnitureDimensionsDraft>(() => createFurnitureDimensionsDraft(operational.rooms ?? workflow.furnitureRooms ?? [], workflow.furnitureRooms ?? []));
  const [acknowledged, setAcknowledged] = useState(false); const [documentOpened, setDocumentOpened] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState<Submission | null>(null); const lock = useRef(false);
  const [progress, setProgress] = useState<number | null>(null); const [accessLost, setAccessLost] = useState(false);
  const [newUomName, setNewUomName] = useState(""); const [newUomCode, setNewUomCode] = useState(""); const [scale, setScale] = useState("2"); const [uomBusy, setUomBusy] = useState(false);
  const isScope = action.id === "furniture_scope"; const isUpload = action.id === "furniture_upload"; const dimensions = isScope || isUpload;
  const scopeReview = action.id === "furniture_accept" || action.id === "furniture_scope_return";
  const dimensionReview = action.id === "furniture_dimensions_approve" || action.id === "furniture_dimensions_return";
  const measurement = action.id === "measurement_complete";
  const uoms = useQuery({ queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session?.user.id ?? "unavailable" }, "workflow", "furniture-uoms", projectId), queryFn: ({ signal }) => context.runtime.api.authenticated.get<FurnitureUomOption[]>(`/projects/${encodeURIComponent(projectId)}/design-workflow/furniture-uoms`, { signal }), enabled: dimensions && Boolean(session), retry: false });
  const sourceChanged = JSON.stringify(current.workflow.furnitureRooms) !== JSON.stringify(workflow.furnitureRooms);
  const stale = current.operational.version !== operational.version || Boolean(current.action.disabledReason) || sourceChanged;
  const disabled = busy || uomBusy || stale || Boolean(uncertain) || accessLost;
  const needsProof = action.requiresProof || action.id === "internal_kickoff_complete" || isUpload || (isScope && !noFurniture);
  const roomOptions = isScope ? workflow.furnitureRooms ?? [] : (operational.rooms ?? []).filter((room) => dimensionReview ? room.required && room.dimensions?.status === "pending" : room.required && !room.canProceed && (!room.dimensions || room.dimensions.status === "changes_requested"));
  const returnedZeroValueRooms = isUpload && action.actor === "designer" ? (operational.rooms ?? []).filter((room) => room.required && room.dimensions?.status === "changes_requested" && Boolean(room.dimensions.submissionEventId) && workflow.furnitureRooms?.some((source) => source.id === room.id && Array.isArray(source.estimateItems) && source.estimateItems.length === 0)) : [];
  const dirty = Boolean(note || date || designerId || proof || media.length || roomIds.length || noFurniture || acknowledged);
  const close = () => {
    if (busy || uomBusy) return;
    if (uncertain) { Alert.alert("Action not confirmed", "Retry the saved action before closing so its evidence and submission key are preserved."); return; }
    if (dirty) Alert.alert("Close this action?", "Your unsaved action details will be discarded.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard and close", style: "destructive", onPress: onClose }]);
    else onClose();
  };
  async function choose(kind: "proof" | "media") {
    if (disabled || picking.current) return; picking.current = true;
    try {
      const result = await pickDocument(kind === "proof" ? proofPolicy : mediaPolicy);
      if (result.status !== "selected") return;
      if (!alive.current) { await releaseSelectedAsset(result.asset).catch(() => undefined); return; }
      owned.current.set(result.asset.uri, result.asset);
      if (kind === "proof") { if (proof && proof.uri !== result.asset.uri) release(proof); setProof(result.asset); }
      else setMedia(values => values.some(value => value.uri === result.asset.uri) ? values : [...values, result.asset]);
    } catch (cause) { if (alive.current) setError(failure(cause)); }
    finally { picking.current = false; }
  }
  async function openEvidence(eventId: string, filename: string, mimeType: string, mediaId?: string) {
    if (lock.current) return; lock.current = true; setBusy(true);
    try {
      const base = `/projects/${encodeURIComponent(projectId)}/design-workflow/history/${encodeURIComponent(eventId)}`;
      const file = await context.runtime.transfers.download({ path: mediaId ? `${base}/media/${encodeURIComponent(mediaId)}` : `${base}/proof`, fileName: filename, mimeType, maxBytes: 150 * 1024 * 1024 }).result;
      try { await file.share(); setDocumentOpened(true); } finally { await file.release(); }
    } catch (cause) { setError(failure(cause)); } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function execute(submission: Submission) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const path = `/projects/${encodeURIComponent(projectId)}/design-workflow/actions`; const { command, files } = submission; const first = files[0];
      if (first) { const upload = context.runtime.transfers.upload({ path, ...first, additionalFiles: files.slice(1), maxBytes: 175 * 1024 * 1024, parameters: { expectedVersion: String(command.expectedVersion), action: command.action, stageId, note: command.note, idempotencyKey: command.idempotencyKey, data: JSON.stringify(command.data) }, onProgress: (value) => { if (alive.current) setProgress(value.fraction); } }); uploadOwner.current = upload; try { await upload.result; } finally { uploadOwner.current = null; } }
      else await context.runtime.api.authenticated.post(path, command);
      if (!alive.current) return;
      setUncertain(null); releaseAll(); await invalidate("design-workflow-changed").catch(() => undefined); current.refresh(); onClose();
    } catch (cause) {
      if (!alive.current) return;
      const status = cause instanceof ApiError || cause instanceof TransferHttpError ? cause.status : null;
      if (status === null || status < 400 || status >= 500 || status === 408) { setUncertain(submission); setError("The result could not be confirmed. Retry the saved action with the same evidence and submission key."); }
      else { setUncertain(null); setError(status === 409 ? "This workflow changed. Close and reopen the action after refreshing." : failure(cause)); if ([401, 403, 404].includes(status)) setAccessLost(true); current.refresh(); }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function submit() {
    if (disabled || lock.current) return;
    if (workflowActionNeedsNote(action.id) && !note.trim()) { setError("Add the required reason."); return; }
    if (needsProof && !proof) { setError("Choose the required supporting document."); return; }
    if (measurement && !media.length) { setError("Choose at least one site photo or video."); return; }
    if (media.reduce((total, file) => total + file.size, proof?.size ?? 0) > 175 * 1024 * 1024) { setError("The selected evidence exceeds the upload limit. Choose smaller files."); return; }
    if ((action.id === "internal_kickoff_complete" || action.id === "client_kickoff_complete" || scopeReview || dimensionReview) && !acknowledged) { setError("Confirm that you reviewed the information before submitting."); return; }
    let data = actionDateData(action.id, date);
    if (!data) { setError("Enter a valid meeting date and time."); return; }
    if (action.id === "client_kickoff_complete") {
      if (!documentOpened || !operational.submittedDocument?.eventId) { setError("Open the submitted kick-off document before confirming."); return; }
      data = { reviewedDocumentEventId: operational.submittedDocument.eventId };
    }
    if (action.id === "measurement_assign") { if (!designerId) { setError("Choose an assigned measurement Designer."); return; } data = { designerId }; }
    if (action.id === "space_planning_complete") {
      const plan = operational.spacePlanning;
      if (!plan?.readyForCompletion || !plan.reviewRoundId) { setError("Current Design approval is not ready for completion."); return; }
      data = { estimateId: plan.estimateId, designPlanVersion: plan.designPlanVersion, reviewRoundId: plan.reviewRoundId };
    }
    if (dimensions) {
      if (isScope && noFurniture) data = { rooms: [], notApplicable: true };
      else {
        if (!roomIds.length) { setError("Select at least one room."); return; }
        if (!uoms.isSuccess) { setError("Load the current configured units before submitting."); return; }
        const parsed = parseFurnitureDimensionsDraft(roomIds, draft, workflow.furnitureRooms ?? [], uoms.data);
        if (parsed.error) { setError(parsed.error); return; }
        data = isScope ? { rooms: (workflow.furnitureRooms ?? []).map((room) => ({ id: room.id, required: roomIds.includes(room.id) })), notApplicable: false, dimensions: parsed.rooms } : { rooms: parsed.rooms };
      }
    }
    if (scopeReview) {
      if (!operational.furniture?.requirementsSubmissionEventId) { setError("The current requirements submission is unavailable. Refresh the workflow."); return; }
      data = { submissionEventId: operational.furniture.requirementsSubmissionEventId };
    }
    if (dimensionReview) {
      if (!roomIds.length) { setError("Choose the submitted rooms to review."); return; }
      data = { submissions: roomIds.map((roomId) => ({ roomId, submissionEventId: operational.rooms?.find((room) => room.id === roomId)?.dimensions?.submissionEventId })) };
    }
    const files = [...(proof ? [{ fileUri: proof.uri, fileName: proof.name, mimeType: proof.mimeType, fieldName: "file" }] : []), ...media.map((file) => ({ fileUri: file.uri, fileName: file.name, mimeType: file.mimeType, fieldName: "mediaFiles" }))];
    void execute({ command: { expectedVersion: operational.version, stageId, action: action.id, idempotencyKey: createIdempotencyKey(), note: note.trim(), data }, files });
  }
  function updateDimension(roomId: string, itemId: string, changes: { length?: string; width?: string; quantity?: string; uomId?: string }) {
    setDraft((value) => ({ ...value, [roomId]: (value[roomId] ?? []).map((item) => item.estimateItemId === itemId ? { ...item, ...changes } : item) }));
  }
  async function addUom() {
    if (uomBusy || disabled) return;
    if (!newUomCode.trim() || !newUomName.trim() || !/^\d$/.test(scale) || Number(scale) > 6) { setError("Enter a unit name, code and decimal scale from 0 to 6."); return; }
    setUomBusy(true);
    try { await context.runtime.api.authenticated.post(`/projects/${encodeURIComponent(projectId)}/design-workflow/furniture-uoms`, { code: newUomCode.trim(), name: newUomName.trim(), decimalScale: Number(scale) }); await uoms.refetch(); setNewUomCode(""); setNewUomName(""); } catch (cause) { setError(failure(cause)); } finally { setUomBusy(false); }
  }
  return <Modal visible transparent animationType="slide" onRequestClose={close}><View style={s.scrim}><View accessibilityViewIsModal style={s.modal}>
    <Text accessibilityRole="header" style={s.title}>{action.label}</Text>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.stack}>
      {stale ? <Text style={s.error}>This action changed while you were editing. Close and reopen it to review the latest state.</Text> : null}
      {accessLost ? <Text style={s.error}>You no longer have access to this action.</Text> : <>
      {workflowActionNeedsDate(action.id) ? <Field label="Meeting date and time (YYYY-MM-DD HH:mm)" value={date} onChangeText={setDate} editable={!disabled} /> : null}
      {action.id === "measurement_assign" ? (workflow.measurementDesigners ?? []).map((designer) => <Choice key={designer.id} label={designer.name} checked={designerId === designer.id} disabled={disabled} onPress={() => setDesignerId(designer.id)} />) : null}
      {action.id === "internal_kickoff_complete" ? <Choice label="I received and reviewed the design handover" checked={acknowledged} disabled={disabled} onPress={() => setAcknowledged(!acknowledged)} /> : null}
      {action.id === "client_kickoff_complete" && operational.submittedDocument ? <><Button label={`Open ${operational.submittedDocument.filename}`} variant="secondary" disabled={busy} onPress={() => { const document = operational.submittedDocument!; void openEvidence(document.eventId, document.filename, document.mimeType); }} /><Choice label="I reviewed the submitted kick-off document" checked={acknowledged} disabled={disabled || !documentOpened} onPress={() => setAcknowledged(!acknowledged)} /></> : null}
      {returnedZeroValueRooms.length ? <View style={s.section}><Text style={s.heading}>Returned rooms with no approved furniture items</Text><Text style={s.copy}>Resolve these dimension requirements without another upload. Earlier submissions and Client responses stay in history.</Text>{returnedZeroValueRooms.map((room) => <Text key={room.id} style={s.copy}>{room.name}{room.dimensions?.returnReason ? `: ${room.dimensions.returnReason}` : ""}</Text>)}<Button label="Resolve returned rooms" variant="secondary" disabled={disabled} onPress={() => void execute({ command: { expectedVersion: operational.version, stageId, action: "furniture_upload", idempotencyKey: createIdempotencyKey(), note: note.trim(), data: { resolveReturnedZeroValueRoomIds: returnedZeroValueRooms.map((room) => room.id) } }, files: [] })} /></View> : null}
      {isScope ? <Choice label="No existing furniture dimensions are needed" checked={noFurniture} disabled={disabled} onPress={() => { setNoFurniture(!noFurniture); setRoomIds([]); }} /> : null}
      {(dimensions || dimensionReview) && !noFurniture ? <View style={s.stack}><Text style={s.heading}>Rooms</Text>{roomOptions.map((room) => {
        const source = workflow.furnitureRooms?.find((value) => value.id === room.id); const unavailable = dimensions && !source?.estimateItems?.length;
        return <View key={room.id} style={s.section}><Choice label={room.name} checked={roomIds.includes(room.id)} disabled={disabled || unavailable} onPress={() => setRoomIds((ids) => ids.includes(room.id) ? ids.filter((id) => id !== room.id) : [...ids, room.id])} />
        {unavailable ? <Text style={s.copy}>No current approved estimate items require dimensions in this room.</Text> : null}
        {dimensions && roomIds.includes(room.id) ? (draft[room.id] ?? []).map((item) => <View key={item.estimateItemId} style={s.section}><Text style={s.heading}>{source?.estimateItems?.find((value) => value.id === item.estimateItemId)?.name ?? "Estimate item"}</Text>
          {item.measurementType === "count" ? <Field label="Number of points" value={item.quantity} onChangeText={(quantity) => updateDimension(room.id, item.estimateItemId, { quantity })} keyboardType="number-pad" editable={!disabled} /> : <><Field label="Length" value={item.length} onChangeText={(length) => updateDimension(room.id, item.estimateItemId, { length })} keyboardType="decimal-pad" editable={!disabled} /><Field label="Width" value={item.width} onChangeText={(width) => updateDimension(room.id, item.estimateItemId, { width })} keyboardType="decimal-pad" editable={!disabled} /></>}
          <Text style={s.copy}>Measurement unit</Text>{uoms.isError ? <Button label="Retry configured units" variant="secondary" onPress={() => void uoms.refetch()} /> : uoms.isPending ? <Text style={s.copy}>Loading units…</Text> : <View style={s.wrap}>{uoms.data?.map((uom) => <Button key={uom.id} label={uom.name} variant={item.uomId === uom.id ? "primary" : "secondary"} disabled={disabled} onPress={() => updateDimension(room.id, item.estimateItemId, { uomId: uom.id })} />)}</View>}
        </View>) : null}</View>;
      })}</View> : null}
      {dimensions && session && canPerformOperation(session, "POST /projects/:projectId/design-workflow/furniture-uoms") ? <View style={s.section}><Text style={s.heading}>Add a missing measurement unit</Text><Field label="Unit name" value={newUomName} onChangeText={setNewUomName} editable={!disabled} /><Field label="Unit code" value={newUomCode} onChangeText={setNewUomCode} editable={!disabled} /><Field label="Decimal scale" value={scale} onChangeText={setScale} keyboardType="number-pad" editable={!disabled} /><Button label="Add unit" variant="secondary" disabled={disabled} loading={uomBusy} onPress={() => void addUom()} /></View> : null}
      {scopeReview || dimensionReview ? <View style={s.stack}><Text style={s.heading}>Submitted requirements and dimensions</Text>{(operational.rooms ?? []).filter((room) => room.required).map((room) => <View key={room.id} style={s.section}><Text style={s.heading}>{room.name} · {room.dimensions?.status.replaceAll("_", " ") ?? "Awaiting dimensions"}</Text>{room.dimensions?.items.map((item) => <Text key={item.id} style={s.copy}>{item.name}: {item.measurementType === "count" ? `${item.quantity} points` : `${item.length} × ${item.width}`} {item.uomName ?? item.unit}</Text>)}{room.dimensions?.returnReason ? <Text style={s.warning}>{room.dimensions.returnReason}</Text> : null}</View>)}{operational.furniture?.evidence?.map((file) => <Button key={`${file.eventId}:${file.mediaId ?? "proof"}`} label={`Open ${file.filename}`} variant="secondary" disabled={busy} onPress={() => void openEvidence(file.eventId, file.filename, file.mimeType, file.mediaId)} />)}<Choice label="I reviewed these requirements and submitted dimensions" checked={acknowledged} disabled={disabled} onPress={() => setAcknowledged(!acknowledged)} /></View> : null}
      {needsProof || measurement ? <><Button label={proof ? `Document: ${proof.name}` : measurement ? "Add site sketch (optional)" : "Choose supporting document"} variant="secondary" disabled={disabled} onPress={() => void choose("proof")} />{proof ? <Button label="Remove document" variant="quiet" disabled={disabled} onPress={() => { if (proof) release(proof); setProof(null); }} /> : null}</> : null}
      {measurement ? <><Button label="Add site photo or video" variant="secondary" disabled={disabled} onPress={() => void choose("media")} />{media.map((file) => <View key={file.uri} style={s.section}><Text style={s.copy}>{file.name}</Text><Button label={`Remove ${file.name}`} variant="quiet" disabled={disabled} onPress={() => { release(file); setMedia(values => values.filter(value => value.uri !== file.uri)); }} /></View>)}</> : null}
      <Field label={workflowActionNeedsNote(action.id) ? "Reason" : "Note (optional)"} value={note} onChangeText={setNote} multiline maxLength={1000} editable={!disabled} />
      </>}
      {progress !== null ? <Text accessibilityLiveRegion="polite" style={s.copy}>{progress >= 1 ? "Evidence uploaded. Saving action…" : `Uploading ${Math.round(progress * 100)}%`}</Text> : null}
      {error ? <Text accessibilityLiveRegion="assertive" style={s.error}>{error}</Text> : null}
      {uncertain && !accessLost ? <Button label="Retry saved workflow action" loading={busy} onPress={() => void execute(uncertain)} /> : <Button label="Save workflow action" disabled={disabled} loading={busy} onPress={submit} />}
      <Button label="Close action" variant="quiet" disabled={busy || uomBusy || Boolean(uncertain)} onPress={close} />
    </ScrollView>
  </View></View></Modal>;
}
const s = StyleSheet.create({ stack: { gap: spacing.sm }, scrim: { flex: 1, justifyContent: "center", padding: spacing.md, backgroundColor: "rgba(24,32,22,0.65)" }, modal: { maxHeight: "92%", width: "100%", maxWidth: 720, alignSelf: "center", padding: spacing.md, gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, title: { fontFamily: fonts.semibold, fontSize: 19, color: colors.ink }, heading: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }, copy: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted, lineHeight: 20 }, warning: { fontFamily: fonts.medium, fontSize: 12, color: colors.warning }, error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger }, section: { borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm }, choice: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.sm }, choiceText: { flex: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 13 }, box: { width: 22, height: 22, borderWidth: 1, borderColor: colors.primary }, selected: { backgroundColor: colors.primary }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm } });
