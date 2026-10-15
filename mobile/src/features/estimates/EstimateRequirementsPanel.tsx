import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useRef, useState } from "react";
import { Alert, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, Field, StateView } from "../../ui/primitives";
import { createIdempotencyKey } from "../finance/money";
import { EstimateChoice, EstimateModal, EstimateSection, EstimateSelect, EstimateText, EstimateTheme, estimateStyles as styles } from "../estimate-authoring/EstimateUI";
import { estimatePaise } from "../estimate-authoring/staffEstimateModel";
import type { EstimateDraft } from "../estimate-authoring/types";
import { estimateRequirementsKey, getEstimateRequirements, submitRequirementCommand, type EstimateRequirement, type RequirementCommand } from "./estimateRequirementsApi";

type RequestDraft = { request: EstimateRequirement | null; collectionVersion: number; mainBasketId: string; mainLineId: string; roomId: string; text: string; key: string };
type Resolution = { request: EstimateRequirement; collectionVersion: number; status: "included" | "declined" | "superseded"; lineItemIds: string[]; reason: string; replacementId: string };
export function EstimateRequirementsPanel({ projectId, session, estimate, disabled = false, onVersionAdvance }: {
  readonly projectId: string; readonly session: AuthenticatedSession; readonly estimate?: EstimateDraft | null;
  readonly disabled?: boolean; readonly onVersionAdvance?: (before: number, after: number) => void;
}) {
  const context = useConfiguredRuntime();
  if (!canPerformOperation(session, "GET /projects/:projectId/estimate-requirements")) return null;
  return <RequirementsPanel key={`${context.environment.environment.id}:${session.user.id}:${projectId}`} projectId={projectId} session={session} estimate={estimate ?? null} disabled={disabled} {...(onVersionAdvance ? { onVersionAdvance } : {})} />;
}
function RequirementsPanel({ projectId, session, estimate, disabled, onVersionAdvance }: { readonly projectId: string; readonly session: AuthenticatedSession; readonly estimate: EstimateDraft | null; readonly disabled: boolean; readonly onVersionAdvance?: (before: number, after: number) => void }) {
  const navigation = useNavigation(); const context = useConfiguredRuntime(); const client = useQueryClient(); const invalidate = useInvalidateEvent();
  const key = estimateRequirementsKey({ environmentId: context.environment.environment.id, userId: session.user.id }, projectId);
  const canRead = canPerformOperation(session, "GET /projects/:projectId/estimate-requirements");
  const personal = session.user.role === "client";
  const canCreate = personal && canPerformOperation(session, "POST /projects/:projectId/estimate-requirements");
  const canUpdate = personal && canPerformOperation(session, "PATCH /projects/:projectId/estimate-requirements/:requirementId");
  const canResolve = !personal && canPerformOperation(session, "POST /projects/:projectId/estimate-requirements/:requirementId/resolve");
  const [denied, setDenied] = useState(false);
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getEstimateRequirements(context.runtime, projectId, signal), enabled: canRead && !denied && context.environment.status === "ready" });
  const [draft, setDraft] = useState<RequestDraft | null>(null); const [resolution, setResolution] = useState<Resolution | null>(null);
  const [busy, setBusy] = useState(false); const pending = useRef(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false); const [retry, setRetry] = useState<RequirementCommand | null>(null);
  usePreventRemove(Boolean(draft || resolution || retry) || busy, ({ data }) => {
    if (pending.current || retry) { Alert.alert("Requirement result pending", "Confirm the result of this request before leaving."); return; }
    Alert.alert("Discard requirement edits?", "Your unsaved edits will be discarded.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) }]);
  });
  async function execute(command: RequirementCommand) {
    if (pending.current || disabled || (!query.data?.editingAllowed && command !== retry) || denied) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const before = query.data?.estimateVersion;
      const detail = await submitRequirementCommand(context.runtime, projectId, command);
      client.setQueryData(key, detail); setDraft(null); setResolution(null); setConflict(false); setRetry(null); setNotice("Requirement saved.");
      if (before != null && detail.estimateVersion !== null) onVersionAdvance?.(before, detail.estimateVersion);
      await invalidate("estimate-decision-changed").catch(() => setNotice("Requirement saved. Refresh related project details when connected."));
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { setDenied(true); await client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key }); }
      else if (cause instanceof ApiError && cause.status < 500) { setConflict(true); setRetry(null); setError(`${cause.message} Your text is preserved. Refresh before continuing.`); }
      else { setRetry(command); setError("The result could not be confirmed. Retry the same request to recover its outcome before changing this form."); }
    } finally { pending.current = false; setBusy(false); }
  }
  if (!canRead) return null;
  if (denied || query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)) return <StateView tone="denied" title="Requirements unavailable" message="This project's requirements are outside your current access." />;
  if (query.isPending) return <BrandLoader label="Loading estimate requirements" tone="dark" />;
  if (query.isError || !query.data) return <StateView tone="error" title="Requirements could not be verified" message="Refresh before making changes." actionLabel="Refresh requirements" onAction={() => void query.refetch()} />;
  const detail = query.data;
  const locked = disabled || busy || query.isFetching || !detail.editingAllowed || conflict || Boolean(retry);
  const requested = draft?.request ? detail.requirements.find((item) => item.id === draft.request!.id) : null;
  const lines = resolution && estimate?.projectId === projectId && estimate.version === detail.estimateVersion ? estimate.lineItems.filter((line) => line.source === "configuration" && line.id && line.included && line.mainBasketId === resolution.request.mainBasketId && (!resolution.request.mainLineId || line.mainLineId === resolution.request.mainLineId && line.catalogueId === resolution.request.mainLineId) && (!resolution.request.roomId || line.roomId === resolution.request.roomId)) : [];
  function start(request: EstimateRequirement | null) {
    if (locked || (request && (!request.canEdit || !canUpdate)) || (!request && !canCreate)) return;
    setError(""); setNotice(""); setDraft({ request, collectionVersion: detail.requirementsVersion, mainBasketId: request?.mainBasketId ?? "", mainLineId: request?.mainLineId ?? "", roomId: request?.roomId ?? "", text: request?.text ?? "", key: createIdempotencyKey() });
  }
  function saveDraft() {
    if (!draft || locked || draft.request && !requested?.canEdit) return;
    if (!detail.mainBaskets.some((item) => item.id === draft.mainBasketId)) { setError("Choose an available Main Basket."); return; }
    if (draft.mainLineId && !detail.mainLines?.some((line) => line.id === draft.mainLineId && line.mainBasketId === draft.mainBasketId)) { setError("Choose an available Main Line or General request."); return; }
    if (draft.roomId && !detail.rooms.some((room) => room.id === draft.roomId)) { setError("Choose a current room or Whole project."); return; }
    if (!draft.text.trim() || draft.text.trim().length > 4000) { setError("Describe your requirement in 1 to 4,000 characters."); return; }
    const values = { mainBasketId: draft.mainBasketId, ...(detail.mainLines !== undefined || draft.mainLineId || draft.request?.mainLineId ? { mainLineId: draft.mainLineId || null } : {}), roomId: draft.roomId || null, text: draft.text.trim(), expectedRequirementsVersion: draft.collectionVersion };
    void execute(draft.request ? { action: "update", id: draft.request.id, input: { ...values, expectedVersion: draft.request.version } } : { action: "create", input: { ...values, idempotencyKey: draft.key } });
  }
  async function refreshConflict() {
    try {
      const result = await query.refetch({ throwOnError: true });
      if (!result.data?.editingAllowed) return;
      if (draft) {
        const request = draft.request ? result.data.requirements.find((item) => item.id === draft.request!.id) : null;
        if (draft.request && !request?.canEdit) return;
        setDraft({ ...draft, request: request ?? null, collectionVersion: result.data.requirementsVersion, key: createIdempotencyKey() });
      }
      setResolution(null); setConflict(false); setError("");
    } catch { setError("Requirements could not be refreshed. Your text remains here."); }
  }
  return <EstimateTheme><EstimateSection title={personal ? "Your estimate requirements" : "Client estimate requirements"}>
    <EstimateText>{detail.phase === "post" ? "Post-estimation" : "Pre-estimation"} · {detail.requirements.filter((row) => row.status === "open").length} open requests</EstimateText>
    {personal ? <><EstimateText>Choose a Main Basket and write what you need. Available Main Lines are provided by your team.</EstimateText><EstimateText>Indicative total: {detail.indicativeTotalPaise === null ? "Awaiting estimate" : estimatePaise(detail.indicativeTotalPaise)}. Prices are read-only.</EstimateText><EstimateText>{detail.pricingComplete ? "Review the submitted estimate for approval." : "Your team is preparing pricing for outstanding requests."}</EstimateText></> : <EstimateText>Save estimate items before linking them to a Client request.</EstimateText>}
    {!detail.editingAllowed ? <EstimateText>{detail.editingBlockReason === "review_pending" ? "A frozen estimate is under review. Request changes or withdraw that review before editing requirements." : "Estimate editing is closed. Requirement history remains available."}</EstimateText> : null}
    {error && !resolution ? <EstimateText error>{error}</EstimateText> : null}{notice ? <EstimateText>{notice}</EstimateText> : null}
    {retry ? <Button label="Retry same requirement request" loading={busy} disabled={disabled} onPress={() => void execute(retry)} /> : null}
    {conflict ? <Button label="Refresh and review requirements" disabled={busy} onPress={() => void refreshConflict()} /> : null}
    {canCreate && !draft ? <Button label="Add requirement" disabled={locked || !detail.mainBaskets.length} onPress={() => start(null)} /> : null}
    {draft ? <View style={styles.stack}>
      <EstimateSelect label="Main Basket" value={draft.mainBasketId} options={detail.mainBaskets.map((item) => ({ value: item.id, label: item.name }))} onChange={(mainBasketId) => setDraft({ ...draft, mainBasketId, mainLineId: "" })} disabled={locked} />
      {detail.mainLines !== undefined || draft.mainLineId ? <EstimateSelect label="Main Line (optional)" value={draft.mainLineId} placeholder="General request" options={(detail.mainLines ?? []).filter((line) => line.mainBasketId === draft.mainBasketId).map((line) => ({ value: line.id, label: line.name }))} onChange={(mainLineId) => setDraft({ ...draft, mainLineId })} disabled={locked || !draft.mainBasketId} /> : null}
      <EstimateSelect label="Room (optional)" value={draft.roomId} placeholder="Whole project" options={detail.rooms.map((room) => ({ value: room.id, label: room.label }))} onChange={(roomId) => setDraft({ ...draft, roomId })} disabled={locked} />
      <Field label="What would you like?" value={draft.text} onChangeText={(text) => setDraft({ ...draft, text })} multiline maxLength={4000} editable={!locked && (!draft.request || Boolean(requested?.canEdit))} />
      <Button label={draft.request ? "Save requirement" : "Send requirement"} loading={busy} disabled={locked} onPress={saveDraft} />
      <Button label="Cancel requirement edit" variant="quiet" disabled={busy || Boolean(retry)} onPress={() => Alert.alert("Discard requirement edits?", "Your unsaved text will be discarded.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", onPress: () => { setDraft(null); setConflict(false); setError(""); } }])} />
    </View> : null}
    {!detail.requirements.length ? <EstimateText>No requirements have been added.</EstimateText> : null}
    {detail.requirements.map((request, index) => <EstimateSection key={request.id} title={`${detail.mainBaskets.find((basket) => basket.id === request.mainBasketId)?.name ?? "Previous Main Basket"} · ${request.status}`}>
      <EstimateText>{request.roomId ? detail.rooms.find((room) => room.id === request.roomId)?.label ?? "Previous room" : "Whole project"} · {request.phase === "post" ? "Post-estimation" : "Pre-estimation"}</EstimateText>
      {request.mainLineId ? <EstimateText>Requested Main Line: {detail.mainLines?.find((line) => line.id === request.mainLineId && line.mainBasketId === request.mainBasketId)?.name ?? "Selected item unavailable"}</EstimateText> : null}
      <EstimateText>{request.text}</EstimateText>{request.reason ? <EstimateText>Team response: {request.reason}</EstimateText> : null}
      {request.supersededById ? <EstimateText>Replacement request: {detail.requirements.find((item) => item.id === request.supersededById)?.text ?? "Linked request unavailable"}</EstimateText> : null}
      {canUpdate && request.canEdit && request.status === "open" ? <View style={styles.row}><Button label={`Edit requirement ${index + 1}`} disabled={locked || Boolean(draft)} variant="secondary" onPress={() => start(request)} /><Button label={`Withdraw requirement ${index + 1}`} disabled={locked || Boolean(draft)} variant="quiet" onPress={() => Alert.alert("Withdraw this requirement?", "The request remains in history and no longer counts as open.", [{ text: "Keep requirement", style: "cancel" }, { text: "Withdraw", onPress: () => void execute({ action: "update", id: request.id, input: { withdraw: true, expectedVersion: request.version, expectedRequirementsVersion: detail.requirementsVersion } }) }])} /></View> : null}
      {canResolve && detail.canResolve && ["open", "included"].includes(request.status) ? <Button label={`Resolve requirement ${index + 1}`} disabled={locked} variant="secondary" onPress={() => { setError(""); setResolution({ request, collectionVersion: detail.requirementsVersion, status: "included", lineItemIds: request.lineItemIds, reason: request.reason, replacementId: "" }); }} /> : null}
    </EstimateSection>)}
    {resolution ? <EstimateModal title="Resolve Client requirement" busy={busy || Boolean(retry)} onClose={() => setResolution(null)}>
      <EstimateText>{resolution.request.text}</EstimateText>
      <EstimateSelect label="Resolution" value={resolution.status} allowEmpty={false} disabled={locked} options={[{ value: "included", label: "Included in estimate" }, { value: "declined", label: "Declined" }, { value: "superseded", label: "Replaced by another request" }]} onChange={(value) => setResolution({ ...resolution, status: value as Resolution["status"] })} />
      {resolution.status === "included" ? <>{!lines.length ? <EstimateText>No matching current saved items. Save an item with the requested Main Basket, Main Line and room, then reopen this requirement.</EstimateText> : lines.map((line) => <EstimateChoice key={line.id} label={`${line.source === "configuration" ? line.mainLineName : line.specification} · ${line.roomName}`} multiple selected={resolution.lineItemIds.includes(line.id!)} disabled={locked} onPress={() => setResolution({ ...resolution, lineItemIds: resolution.lineItemIds.includes(line.id!) ? resolution.lineItemIds.filter((id) => id !== line.id) : [...resolution.lineItemIds, line.id!] })} />)}</> : null}
      {resolution.status === "superseded" ? <EstimateSelect label="Replacement request" value={resolution.replacementId} options={detail.requirements.filter((row) => row.id !== resolution.request.id).map((row) => ({ value: row.id, label: row.text }))} disabled={locked} onChange={(replacementId) => setResolution({ ...resolution, replacementId })} /> : null}
      <Field label="Resolution reason" value={resolution.reason} onChangeText={(reason) => setResolution({ ...resolution, reason })} multiline maxLength={2000} editable={!locked} />
      {error ? <EstimateText error>{error}</EstimateText> : null}
      {conflict ? <Button label="Refresh requirement resolution" disabled={busy} onPress={() => void refreshConflict()} /> : null}
      {retry ? <Button label="Retry same resolution" loading={busy} onPress={() => void execute(retry)} /> : null}
      <Button label="Save resolution" disabled={locked} onPress={() => {
        if (resolution.status === "included" && (!resolution.lineItemIds.length || resolution.lineItemIds.some((id) => !lines.some((line) => line.id === id)))) { setError("Select at least one current saved item matching this request."); return; }
        if (resolution.status !== "included" && !resolution.reason.trim()) { setError("Explain the resolution."); return; }
        if (resolution.status === "superseded" && !detail.requirements.some((row) => row.id === resolution.replacementId && row.id !== resolution.request.id)) { setError("Select a replacement request."); return; }
        void execute({ action: "resolve", id: resolution.request.id, input: { expectedVersion: resolution.request.version, expectedRequirementsVersion: resolution.collectionVersion, status: resolution.status, lineItemIds: resolution.status === "included" ? resolution.lineItemIds : [], reason: resolution.reason.trim(), ...(resolution.status === "superseded" ? { supersededById: resolution.replacementId } : {}) } });
      }} />
    </EstimateModal> : null}
  </EstimateSection></EstimateTheme>;
}
