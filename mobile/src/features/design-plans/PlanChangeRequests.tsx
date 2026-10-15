import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useScaffoldNavigationBlocked } from "../../navigation/AdaptiveAppScaffold";
import { Button, Field } from "../../ui/primitives";
import { KnowledgeCard, KnowledgeChoice, KnowledgeText, knowledgeStyles as styles } from "../knowledge/knowledgeUi";
import { NativeAnnotationEditor } from "../annotations/NativeAnnotationEditor";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import { changePlanRequest, designPlanKeys, getPlanRequest, getPlanRequests } from "./designPlanApi";
import { DesignCommandState, isDesignDenied, useDesignCommand, useDesignDraftGuard, useDesignOwner } from "./DesignPlanControls";
import { DesignFileUpload } from "./DesignFileUpload";
import type { DesignWorkspace, PlanRequestQueue } from "./designPlanModel";

export function PlanChangeRequests({ estimateId, session, workspace, disabled, onChanged, onDenied }: { readonly estimateId: string; readonly session: AuthenticatedSession; readonly workspace: DesignWorkspace; readonly disabled: boolean; readonly onChanged: () => Promise<unknown>; readonly onDenied: () => void }) {
  const blocked = useScaffoldNavigationBlocked();
  const owner = useDesignOwner(estimateId, session); const allowed = canPerformOperation(session, "GET /estimate-plan-change-requests"); const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: designPlanKeys.requests(owner.scope, estimateId), queryFn: ({ signal }) => getPlanRequests(owner.context.runtime, estimateId, signal), enabled: allowed && !blocked, retry: false, refetchOnWindowFocus: !blocked });
  if (!allowed) return null;
  if (query.isPending) return <KnowledgeCard title="Plan change requests"><KnowledgeText>Loading client requests…</KnowledgeText></KnowledgeCard>;
  if (query.isError) return <KnowledgeCard title="Plan change requests"><KnowledgeText error>{isDesignDenied(query.error) ? "Plan requests are unavailable for your current access." : "Current plan requests could not be loaded."}</KnowledgeText><Button label="Refresh plan requests" onPress={() => void query.refetch()} /></KnowledgeCard>;
  const selected = query.data.find(request => request.id === selectedId);
  return <KnowledgeCard title="Plan change requests">
    {!query.data.length ? <KnowledgeText>No open plan requests.</KnowledgeText> : query.data.map(request => <KnowledgeChoice key={request.id} label={`${request.summary} · ${request.targetCount ? `${request.targetCount} requested drawings` : "Page feedback needs mapping"}`} selected={selectedId === request.id} disabled={blocked && selectedId !== request.id} onPress={() => setSelectedId(request.id)} />)}
    {selected && canPerformOperation(session, "GET /estimate-plan-change-requests/:requestId") ? <RequestDetail key={selected.id} estimateId={estimateId} request={selected} session={session} workspace={workspace} disabled={disabled || query.isFetching} onChanged={onChanged} onDenied={onDenied} /> : null}
  </KnowledgeCard>;
}
function RequestDetail({ estimateId, request, session, workspace, disabled, onChanged, onDenied }: { readonly estimateId: string; readonly request: PlanRequestQueue; readonly session: AuthenticatedSession; readonly workspace: DesignWorkspace; readonly disabled: boolean; readonly onChanged: () => Promise<unknown>; readonly onDenied: () => void }) {
  const owner = useDesignOwner(request.id, session); const [targets, setTargets] = useState<string[]>([]); const [note, setNote] = useState(""); const [reviewedVersion, setReviewedVersion] = useState(request.version); const [preview, setPreview] = useState(false); const command = useDesignCommand(owner, onChanged, onDenied);
  useDesignDraftGuard(targets.length > 0 || Boolean(note));
  const query = useQuery({ queryKey: designPlanKeys.request(owner.scope, estimateId, request.id), queryFn: ({ signal }) => getPlanRequest(owner.context.runtime, request.id, request.sourcePageId, signal), retry: false, refetchInterval: workspace.uploads.some(upload => upload.purpose !== "ordinary" && ["queued", "processing"].includes(upload.extractionStatus)) ? 2000 : false });
  if (query.isPending) return <KnowledgeText>Loading selected feedback…</KnowledgeText>;
  if (query.isError || !query.data) return <View><KnowledgeText error>Feedback changed or could not be loaded.</KnowledgeText><Button label="Retry selected feedback" onPress={() => void query.refetch()} /></View>;
  const detail = query.data; const stale = reviewedVersion !== detail.version; const locked = disabled || query.isFetching || command.busy || command.blocked || stale || detail.status !== "open";
  const upload = workspace.uploads.filter(upload => upload.requestReplacement?.requestId === request.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
  const replacementPending = workspace.uploads.some(upload => upload.purpose !== "ordinary" && ["queued", "processing"].includes(upload.extractionStatus));
  const validTargets = targets.length > 0 && targets.every(id => detail.drawingCandidates.some(candidate => candidate.drawingId === id) && workspace.drawings.some(drawing => drawing.id === id && drawing.active));
  return <View style={styles.stack}>
    <KnowledgeText>{detail.summary}</KnowledgeText><KnowledgeText>Request revision {detail.version} · {detail.status.replaceAll("_", " ")}</KnowledgeText>
    <Button label="View annotated plan feedback" variant="secondary" onPress={() => setPreview(true)} />
    {stale ? <><KnowledgeText error>The request changed. Review its current targets before continuing.</KnowledgeText><Button label="Use current feedback revision" onPress={() => { setReviewedVersion(detail.version); setTargets([]); setNote(""); command.reset(); }} /></> : null}
    {upload?.requestReplacement ? <KnowledgeCard title="Requested-page replacement"><KnowledgeText>{upload.originalFilename} · {upload.extractionStatus.replaceAll("_", " ")}</KnowledgeText>{upload.failureMessage ? <KnowledgeText error>{upload.failureMessage}</KnowledgeText> : null}<KnowledgeText>{upload.requestReplacement.matches.filter(match => match.resultRevisionId).length} of {upload.requestReplacement.targetCount} requested drawings matched. {upload.requestReplacement.ignoredPageCount} unrelated pages ignored.</KnowledgeText>{upload.requestReplacement.matches.map(match => <KnowledgeText key={match.drawingId}>{match.detectedTitle} · {match.resultRevisionId ? "Replaced" : "Awaiting match"}{match.pageNumber ? ` · Page ${match.pageNumber}` : ""}</KnowledgeText>)}</KnowledgeCard> : null}
    {!detail.unassigned && detail.drawingTargets.some(target => target.status === "open") && canPerformOperation(session, "POST /estimate-plan-change-requests/:requestId/replacement-upload") ? <KnowledgeCard title="Upload the revised page or full PDF"><KnowledgeText>Only requested drawing titles are matched. Unrelated pages are ignored.</KnowledgeText><DesignFileUpload key={`request:${detail.id}:${reviewedVersion}`} estimateId={estimateId} session={session} target={{ kind: "request", requestId: detail.id, version: reviewedVersion }} disabled={locked || replacementPending} label="Upload requested page revisions" onChanged={onChanged} onDenied={onDenied} /></KnowledgeCard> : null}
    {detail.drawingTargets.map(target => <KnowledgeCard key={target.drawingId} title={target.title}><KnowledgeText>{target.status.replaceAll("_", " ")} · Drawing revision {target.latestRevisionNumber}</KnowledgeText>{target.status === "open" && canPerformOperation(session, "POST /estimate-design-drawings/:drawingId/replacement") ? <DesignFileUpload key={`${target.drawingId}:${target.latestRevisionNumber}`} estimateId={estimateId} session={session} target={{ kind: "drawing", drawingId: target.drawingId, version: target.latestRevisionNumber }} disabled={locked || replacementPending} label={`Upload revised item: ${target.title}`} onChanged={onChanged} onDenied={onDenied} /> : null}</KnowledgeCard>)}
    {detail.unassigned && detail.status === "open" ? <KnowledgeCard title="Map page feedback">
      {detail.drawingCandidates.map(candidate => <KnowledgeChoice key={candidate.drawingId} label={candidate.title} multiple selected={targets.includes(candidate.drawingId)} disabled={locked} onPress={() => setTargets(current => current.includes(candidate.drawingId) ? current.filter(id => id !== candidate.drawingId) : [...current, candidate.drawingId])} />)}
      {canPerformOperation(session, "PUT /estimate-plan-change-requests/:requestId/targets") ? <Button label="Link selected drawings" disabled={locked || !validTargets} loading={command.busy} onPress={() => void command.run(() => changePlanRequest(owner.context.runtime, detail.id, detail.sourcePageId, { version: reviewedVersion, targetDrawingIds: [...targets] }), { replaySafe: true, after: () => setTargets([]) })} /> : null}
      {canPerformOperation(session, "POST /estimate-plan-change-requests/:requestId/resolve-page") ? <><Field label="Page-only resolution note" value={note} onChangeText={setNote} multiline maxLength={1000} editable={!locked} /><Button label="Resolve page-only feedback" disabled={locked || !note.trim()} loading={command.busy} onPress={() => void command.run(() => changePlanRequest(owner.context.runtime, detail.id, detail.sourcePageId, { version: reviewedVersion, note: note.trim() }), { replaySafe: true })} /></> : null}
    </KnowledgeCard> : null}
    {detail.resolutionNote ? <KnowledgeText>Resolution: {detail.resolutionNote}</KnowledgeText> : null}
    <DesignCommandState command={command} onRefresh={async () => { const result = await query.refetch({ throwOnError: true }); if (result.data) { setReviewedVersion(result.data.version); setTargets([]); setNote(""); command.reset(); } }} />
    <ProtectedDocumentViewer visible={preview} source={{ path: `/estimate-plan-pages/${encodeURIComponent(detail.sourcePageId)}/current-image`, fileName: "client-plan-feedback.png", mimeType: "image/png", kind: "plan-page" }} onClose={() => setPreview(false)} renderImage={uri => <NativeAnnotationEditor imageUri={uri} imageWidth={detail.annotations.imageWidth} imageHeight={detail.annotations.imageHeight} value={detail.annotations} readOnly onChange={() => undefined} />} />
  </View>;
}
