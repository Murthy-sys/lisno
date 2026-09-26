import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import {
  emptyAnnotationDocument, validateAnnotationDocument,
  type AnnotationDocumentV1, type AnnotationElementV1
} from "../../platform/annotations/document";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { NativeAnnotationEditor } from "../annotations/NativeAnnotationEditor";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import type { ProtectedDocumentSource } from "../documents/useProtectedDocument";
import { createIdempotencyKey } from "../finance/money";
import {
  clientDrawingRevisionImagePath, clientDrawingWorkspaceKey, clientPlanWorkspaceKey,
  decideClientDrawing, getClientDrawingWorkspace, getClientPlanWorkspace, previewClientPlanTargets,
  saveClientDrawingDraft, submitClientPlanRequest, updateClientPlanRequest,
  type ClientPlanTargetPreview
} from "./clientReviewApi";
import {
  canEditClientPlan, canViewClientPlan,
  type ClientDrawing, type ClientDrawingRevision, type ClientDrawingWorkspace,
  type ClientEstimate, type ClientPlanPage, type ClientPlanRequest, type ClientPlanWorkspace
} from "./clientReviewModel";
import {
  canonicalDrawingPlacement, latestClientDrawingRevisions, projectAnnotationToCrop,
  projectDrawingDocumentToPage, projectPlanCommentsToDrawing,
  selectEditablePlanRequestForDrawing, sharedPlanAnnotationsForDrawing
} from "./drawingAnnotationProjection";

type Placement = { readonly page: ClientPlanPage; readonly crop: ClientDrawingRevision["crop"] };

interface EditorSession {
  readonly revision: ClientDrawingRevision;
  readonly placement?: Placement | undefined;
  readonly editableRequest?: ClientPlanRequest | undefined;
  readonly original: AnnotationDocumentV1;
  readonly annotations: AnnotationDocumentV1;
  readonly originalSummary: string;
  readonly summary: string;
  readonly sharedAnnotations: readonly AnnotationElementV1[];
  readonly preview: ClientPlanTargetPreview | null;
  readonly selectedTargetIds: readonly string[];
  readonly submissionKey: string;
  readonly draftVersion: number;
}

function drawingStatus(status: ClientDrawingRevision["reviewStatus"]): string {
  if (status === "submitted") return "Awaiting your review";
  if (status === "approved") return "Approved";
  if (status === "changes_requested") return "Changes requested";
  return "Draft";
}

export function drawingReadinessText(readiness: ClientDrawingWorkspace["readiness"]): string {
  if (readiness.ready) return readiness.total
    ? `${readiness.approved} of ${readiness.total} drawings approved.`
    : "No drawings require approval.";
  const unresolved = Math.max(0, readiness.total - readiness.approved);
  const reasons = [
    readiness.awaitingReview ? `${readiness.awaitingReview} awaiting review` : "",
    readiness.changesRequested ? `${readiness.changesRequested} changes requested` : ""
  ].filter(Boolean);
  return `${unresolved} drawing${unresolved === 1 ? "" : "s"} unresolved${reasons.length ? `: ${reasons.join(", ")}` : ""}.`;
}

function initialEditorSession(
  drawing: ClientDrawing,
  revision: ClientDrawingRevision,
  latestRevisionId: string,
  workspace: ClientDrawingWorkspace,
  planWorkspace?: ClientPlanWorkspace
): EditorSession {
  const current = revision.id === latestRevisionId;
  const placement = canonicalDrawingPlacement(revision, workspace, planWorkspace);
  const foundRequest = current ? selectEditablePlanRequestForDrawing(drawing.id, planWorkspace) : undefined;
  const editableRequest = foundRequest && placement?.page.id === foundRequest.sourcePageId ? foundRequest : undefined;
  const requestAnnotations = editableRequest && placement ? {
    schemaVersion: 1 as const,
    imageWidth: revision.crop.width,
    imageHeight: revision.crop.height,
    elements: editableRequest.annotations.elements.flatMap((element) => {
      const cropped = projectAnnotationToCrop(element, placement.crop, placement.page);
      return cropped ? [cropped] : [];
    })
  } : undefined;
  const stored = revision.annotationDraft?.annotations ?? revision.annotations;
  const original: AnnotationDocumentV1 = requestAnnotations ?? stored ??
    emptyAnnotationDocument(revision.crop.width, revision.crop.height);
  const summary = editableRequest?.summary ?? revision.changeSummary ?? "";
  return {
    revision, placement, editableRequest, original, annotations: original,
    originalSummary: summary, summary,
    sharedAnnotations: sharedPlanAnnotationsForDrawing(drawing.id, revision, workspace, planWorkspace, editableRequest?.id),
    preview: null, selectedTargetIds: [], submissionKey: createIdempotencyKey(),
    draftVersion: revision.annotationDraft?.version ?? 0
  };
}

function draftResponseVersion(value: unknown): number {
  if (typeof value !== "object" || value === null || !("version" in value) ||
    typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version <= 0) {
    throw new ApiProtocolError();
  }
  return value.version;
}

function actionMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 409) return "This drawing or plan request changed. Your unsent marks are still here. Refresh, then reopen the current revision before submitting.";
  if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) return "This drawing is no longer available to your account. Refresh to check access.";
  if (cause instanceof DrawingSelectionError) return cause.message;
  return "The drawing review could not be saved. Check your connection and try again.";
}

class DrawingSelectionError extends Error {}

/** A direct drawing request is reserved for an explicitly page-less legacy revision. */
function isLegacyDrawingRevision(revision: ClientDrawingRevision): boolean {
  const sourcePageId: unknown = revision.sourcePageId;
  return sourcePageId === null || sourcePageId === undefined;
}

/** The backend supplies only Client-visible revisions; no staff draft is inferred or fetched. */
export function ClientDrawingReview({ estimate, session }: {
  readonly estimate: ClientEstimate;
  readonly session: AuthenticatedSession;
}) {
  const context = useConfiguredRuntime();
  const canRead = session.user.role === "client" && canPerformOperation(session, "GET /client/estimates/:estimateId/design-drawings");
  const canReadPlan = canRead && canViewClientPlan(estimate) && canPerformOperation(session, "GET /client/estimates/:estimateId/plan-review");
  const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  const drawingQuery = useQuery({
    queryKey: clientDrawingWorkspaceKey(scope, estimate.id),
    queryFn: ({ signal }) => getClientDrawingWorkspace(context.runtime, estimate.id, signal),
    enabled: canRead && context.environment.status === "ready"
  });
  const planQuery = useQuery({
    queryKey: clientPlanWorkspaceKey(scope, estimate.id),
    queryFn: ({ signal }) => getClientPlanWorkspace(context.runtime, estimate.id, signal),
    enabled: canReadPlan && context.environment.status === "ready"
  });
  const latest = useMemo(() => drawingQuery.data ? latestClientDrawingRevisions(drawingQuery.data) : new Map<string, ClientDrawingRevision>(), [drawingQuery.data]);
  const canReview = canEditClientPlan(estimate) && !drawingQuery.isRefetchError;

  if (!canRead) return null;
  if (drawingQuery.isPending) return <View testID="client-drawings-loading" style={styles.center}><BrandLoader label="Loading drawing review" tone="dark" /></View>;
  if (drawingQuery.error instanceof ApiError && [401, 403, 404].includes(drawingQuery.error.status)) {
    return <Text accessibilityLiveRegion="assertive" style={styles.error}>Drawing review is unavailable for this account.</Text>;
  }
  if (drawingQuery.isError && !drawingQuery.data) return <View style={styles.stack}>
    <Text accessibilityLiveRegion="assertive" style={styles.error}>Drawings could not be loaded.</Text>
    <Button label="Retry drawings" variant="secondary" onPress={() => void drawingQuery.refetch()} />
  </View>;
  if (!drawingQuery.data) return null;

  const visible = drawingQuery.data.drawings.filter((drawing) => drawing.active && latest.has(drawing.id));
  const planContextUnavailable = !canReadPlan || planQuery.isPending || planQuery.isError || !planQuery.data;
  const planAccessDenied = planQuery.error instanceof ApiError && [401, 403, 404].includes(planQuery.error.status);
  const visiblePlanWorkspace = planAccessDenied ? undefined : planQuery.data;
  const needsPlanContext = visible.some((drawing) => {
    const revision = latest.get(drawing.id);
    return revision !== undefined && !isLegacyDrawingRevision(revision);
  });
  return <View testID="client-drawing-review" style={styles.section}>
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>Extracted drawings</Text>
      <Text accessibilityLiveRegion="polite" style={styles.readiness}>{drawingReadinessText(drawingQuery.data.readiness)}</Text>
    </View>
    {drawingQuery.isRefetchError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>The latest drawing review could not be loaded. Refresh before making a decision.</Text> : null}
    {planContextUnavailable && needsPlanContext && canReview ? <View style={styles.notice}>
      <Text style={styles.copy}>Source plan context is unavailable. Drawing change requests will resume when it loads.</Text>
      {canReadPlan && planQuery.isError ? <Button label="Retry plan context" variant="secondary" onPress={() => void planQuery.refetch()} /> : null}
    </View> : null}
    {visible.length === 0 ? <Text style={styles.copy}>No drawings have been submitted for this estimate.</Text> : null}
    {visible.map((drawing) => {
      const revision = latest.get(drawing.id)!;
      return <DrawingRow key={`${drawing.id}:${planAccessDenied}`} drawing={drawing} revision={revision}
        workspace={drawingQuery.data!} planWorkspace={visiblePlanWorkspace}
        canReview={canReview} planContextUnavailable={planContextUnavailable}
        session={session} onRefresh={() => void Promise.all([drawingQuery.refetch(), canReadPlan ? planQuery.refetch() : Promise.resolve()])} />;
    })}
  </View>;
}

function DrawingRow({ drawing, revision, workspace, planWorkspace, canReview, planContextUnavailable, session, onRefresh }: {
  readonly drawing: ClientDrawing;
  readonly revision: ClientDrawingRevision;
  readonly workspace: ClientDrawingWorkspace;
  readonly planWorkspace?: ClientPlanWorkspace | undefined;
  readonly canReview: boolean;
  readonly planContextUnavailable: boolean;
  readonly session: AuthenticatedSession;
  readonly onRefresh: () => void;
}) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const [editor, setEditor] = useState<EditorSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const acting = useRef(false);
  const canViewImage = canPerformOperation(session, "GET /estimate-design-revisions/:revisionId/image");
  const canApprove = canReview && canPerformOperation(session, "POST /client/estimate-design-revisions/:revisionId/decision");
  const canSaveDraft = canReview && canPerformOperation(session, "PUT /client/estimate-design-revisions/:revisionId/annotation-draft");
  const canCreatePageRequest = canReview && canPerformOperation(session, "POST /client/estimate-plan-pages/:pageId/target-preview") &&
    canPerformOperation(session, "POST /client/estimate-plan-pages/:pageId/change-requests");
  const canUpdatePageRequest = canReview && canPerformOperation(session, "PUT /client/estimate-plan-change-requests/:requestId");
  const history = workspace.revisions.filter((item) => item.drawingId === drawing.id && item.id !== revision.id && item.reviewStatus !== "draft")
    .sort((first, second) => second.revisionNumber - first.revisionNumber);
  const page = workspace.pages.find((item) => item.id === revision.sourcePageId);
  const upload = workspace.uploads.find((item) => item.id === page?.uploadId);
  const hasDirtyEditor = editor !== null &&
    (JSON.stringify(editor.annotations) !== JSON.stringify(editor.original) || editor.summary !== editor.originalSummary);
  const isCurrentEditor = editor?.revision.id === revision.id;
  const isSubmitted = editor?.revision.reviewStatus === "submitted";
  const legacyWithoutSourcePage = editor !== null && isLegacyDrawingRevision(editor.revision);
  const pageContextReady = !planContextUnavailable && editor?.placement !== undefined;
  const sourcePageContextMissing = editor !== null && !legacyWithoutSourcePage && !pageContextReady;
  const canApproveCurrent = Boolean(editor && isCurrentEditor && canReview && !stale && isSubmitted && canApprove);
  const canRequestChanges = Boolean(editor && isCurrentEditor && canReview && !stale &&
    (editor.editableRequest ? pageContextReady && canUpdatePageRequest
      : pageContextReady ? canCreatePageRequest
        : legacyWithoutSourcePage && isSubmitted && canApprove));
  const editorCanWrite = Boolean(editor && isCurrentEditor && canReview && !stale &&
    (canRequestChanges || (isSubmitted && canSaveDraft)));
  const source: ProtectedDocumentSource | null = editor ? {
    path: clientDrawingRevisionImagePath(editor.revision.id),
    fileName: `${drawing.displayTitle || "Drawing"} · revision ${editor.revision.revisionNumber}.png`,
    mimeType: "image/png",
    kind: "drawing-image"
  } : null;

  useEffect(() => {
    if (!planWorkspace || planContextUnavailable) return;
    setEditor((current) => {
      if (!current || current.placement || isLegacyDrawingRevision(current.revision)) return current;
      const resolved = initialEditorSession(drawing, current.revision, revision.id, workspace, planWorkspace);
      if (!resolved.placement) return current;
      const dirty = JSON.stringify(current.annotations) !== JSON.stringify(current.original) || current.summary !== current.originalSummary;
      return dirty ? {
        ...current, placement: resolved.placement, editableRequest: resolved.editableRequest,
        sharedAnnotations: resolved.sharedAnnotations
      } : resolved;
    });
  }, [drawing, planContextUnavailable, planWorkspace, revision.id, workspace]);

  function open(selected: ClientDrawingRevision) {
    try {
      setEditor(initialEditorSession(drawing, selected, revision.id, workspace, planWorkspace));
      setError(null);
      setStale(false);
      setConfirmApproval(false);
    } catch {
      setError("Drawing annotation context is unavailable. Refresh to try again.");
    }
  }

  function close() {
    if (busy) return;
    if (hasDirtyEditor) {
      Alert.alert("Discard unsent drawing edits?", "Your marks and summary have not been submitted.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard edits", style: "destructive", onPress: () => { setEditor(null); setError(null); setStale(false); } }
      ]);
      return;
    }
    setEditor(null);
    setError(null);
    setStale(false);
  }

  async function action(run: () => Promise<unknown>, after?: (result: unknown) => void, closeAfter = false) {
    if (acting.current || !editor || stale) return;
    acting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      after?.(result);
      if (closeAfter) setEditor(null);
      setConfirmApproval(false);
      await invalidate("plan-review-changed");
    } catch (cause) {
      setError(actionMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) {
        setStale(true);
        void invalidate("plan-review-changed");
      }
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  function validateFeedback(current: EditorSession): boolean {
    const checked = validateAnnotationDocument(current.annotations, current.revision.crop.width, current.revision.crop.height);
    if (!checked.valid) { setError(checked.message); return false; }
    if (!current.summary.trim() || current.summary.trim().length > 1_000) {
      setError("Describe the drawing changes in 1,000 characters or fewer."); return false;
    }
    if (current.annotations.elements.length === 0) { setError("Add at least one mark or text note to this drawing."); return false; }
    return true;
  }

  async function saveDraft() {
    if (!editor || !isSubmitted || !canSaveDraft) return;
    const current = editor;
    const checked = validateAnnotationDocument(current.annotations, current.revision.crop.width, current.revision.crop.height);
    if (!checked.valid) { setError(checked.message); return; }
    await action(() => saveClientDrawingDraft(context.runtime, current.revision.id, current.draftVersion, current.annotations),
      (result) => {
        const version = draftResponseVersion(result);
        setEditor((value) => value && value.revision.id === current.revision.id
          ? { ...value, original: current.annotations, draftVersion: version } : value);
      });
  }

  async function approve() {
    if (!editor || !isSubmitted || !canApprove || !isCurrentEditor) return;
    const current = editor;
    await action(() => decideClientDrawing(context.runtime, current.revision.id, {
      version: current.revision.revisionNumber,
      decision: "approve"
    }), undefined, true);
  }

  async function requestChanges() {
    if (!editor || !canRequestChanges || !validateFeedback(editor)) return;
    const current = editor;
    const summary = current.summary.trim();
    if (current.editableRequest && current.placement) {
      await action(() => updateClientPlanRequest(context.runtime, current.editableRequest!.id,
        current.editableRequest!.version, summary,
        projectDrawingDocumentToPage(current.annotations, current.placement!.crop, current.placement!.page)), undefined, true);
      return;
    }
    if (current.placement) {
      if (!current.preview) {
        if (acting.current) return;
        acting.current = true;
        setBusy(true);
        setError(null);
        try {
          const pageDocument = projectDrawingDocumentToPage(current.annotations, current.placement!.crop, current.placement!.page);
          const preview = await previewClientPlanTargets(context.runtime, current.placement!.page.id, pageDocument);
          if (!preview.targets.some((target) => target.drawingId === drawing.id)) {
            throw new DrawingSelectionError("The marks no longer overlap this drawing. Refresh and mark the current drawing again.");
          }
          setEditor((value) => value && value.revision.id === current.revision.id
            ? { ...value, preview, selectedTargetIds: [drawing.id] } : value);
        } catch (cause) {
          setError(actionMessage(cause));
          if (cause instanceof ApiError && cause.status === 409) {
            setStale(true);
            void invalidate("plan-review-changed");
          }
        } finally {
          acting.current = false;
          setBusy(false);
        }
        return;
      }
      if (!current.selectedTargetIds.includes(drawing.id)) {
        setError("Keep this drawing selected for its change request.");
        return;
      }
      await action(() => submitClientPlanRequest(context.runtime, current.placement!.page.id, {
        version: current.preview!.pageRevisionNumber,
        summary,
        annotations: projectDrawingDocumentToPage(current.annotations, current.placement!.crop, current.placement!.page),
        targetDrawingIds: current.selectedTargetIds,
        snapshotToken: current.preview!.snapshotToken,
        idempotencyKey: current.submissionKey
      }), undefined, true);
      return;
    }
    if (!isSubmitted || !canApprove || !isLegacyDrawingRevision(current.revision)) return;
    await action(() => decideClientDrawing(context.runtime, current.revision.id, {
      version: current.revision.revisionNumber,
      decision: "request_changes",
      summary,
      annotations: current.annotations
    }), undefined, true);
  }

  function changeAnnotations(annotations: AnnotationDocumentV1) {
    setEditor((value) => value ? { ...value, annotations, preview: null, selectedTargetIds: [], submissionKey: createIdempotencyKey() } : value);
    setError(null);
  }

  function changeSummary(summary: string) {
    setEditor((value) => value ? { ...value, summary, preview: null, selectedTargetIds: [], submissionKey: createIdempotencyKey() } : value);
    setError(null);
  }

  function toggleTarget(id: string) {
    if (id === drawing.id || busy || acting.current) return;
    setEditor((value) => !value ? value : {
      ...value,
      selectedTargetIds: value.selectedTargetIds.includes(id)
        ? value.selectedTargetIds.filter((item) => item !== id)
        : [...value.selectedTargetIds, id],
      submissionKey: createIdempotencyKey()
    });
  }

  return <View testID={`drawing-${drawing.id}`} style={styles.drawing}>
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.drawingTitle}>{drawing.displayTitle || "Untitled drawing"}</Text>
        <Text style={styles.meta}>Revision {revision.revisionNumber} · {drawingStatus(revision.reviewStatus)}</Text>
        {upload ? <Text style={styles.meta}>{upload.originalFilename}{page ? ` · page ${page.pageNumber}` : ""}</Text> : null}
      </View>
      {canViewImage ? <Button label={`View ${drawing.displayTitle || "drawing"}`} variant="secondary" size="compact" onPress={() => open(revision)} /> : null}
    </View>
    {revision.changeSummary ? <Text style={styles.copy}>{revision.changeSummary}</Text> : null}
    {history.length ? <View style={styles.history}>
      <Text style={styles.historyHeading}>Revision history</Text>
      {history.map((old) => <View key={old.id} style={styles.historyRow}>
        <Text style={styles.meta}>Revision {old.revisionNumber} · {drawingStatus(old.reviewStatus)}</Text>
        {canViewImage ? <Button label={`View revision ${old.revisionNumber} of ${drawing.displayTitle || "drawing"}`} variant="quiet" size="compact" onPress={() => open(old)} /> : null}
      </View>)}
    </View> : null}
    {error && !editor ? <View style={styles.stack}>
      <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>
      <Button label="Refresh drawing" variant="quiet" onPress={onRefresh} />
    </View> : null}

    <ProtectedDocumentViewer visible={editor !== null} source={source} onClose={close}
      renderImage={(localUri) => editor ? <ScrollView keyboardShouldPersistTaps="handled" style={styles.editorScroll} contentContainerStyle={styles.editorContent}>
        <Text accessibilityRole="header" style={styles.editorTitle}>{drawing.displayTitle || "Drawing"} · revision {editor.revision.revisionNumber}</Text>
        <Text style={styles.editorMeta}>{drawingStatus(editor.revision.reviewStatus)}
          {editor.placement ? ` · source plan page ${editor.placement.page.pageNumber}` : ""}</Text>
        {editor.revision.changeSummary ? <View style={styles.historyNote}><Text style={styles.editorCopy}>Submitted change: {editor.revision.changeSummary}</Text></View> : null}
        <NativeAnnotationEditor imageUri={localUri}
          imageWidth={editor.revision.crop.width} imageHeight={editor.revision.crop.height}
          value={editor.annotations} onChange={changeAnnotations}
          readOnly={!editorCanWrite || busy} sharedAnnotations={editor.sharedAnnotations} />
        {projectPlanCommentsToDrawing(drawing.id, planWorkspace).map((comment) => <View key={comment.id} style={styles.historyNote}>
          <Text style={styles.editorCopy}>Plan request: {comment.summary}</Text>
        </View>)}
        {sourcePageContextMissing && canReview ? <View style={styles.notice}>
          <Text accessibilityLiveRegion="polite" style={styles.editorCopy}>The source plan page is unavailable. Refresh the plan before requesting drawing changes.</Text>
          <Button label="Refresh source plan" variant="secondary" onPress={onRefresh} />
        </View> : null}
        {editorCanWrite && canRequestChanges ? <Field label="Describe required changes" multiline
          maxLength={1000} editable={!busy} value={editor.summary} onChangeText={changeSummary} /> : null}
        {editor.preview ? <View style={styles.previewBox}>
          <Text accessibilityRole="header" style={styles.previewTitle}>Confirm affected drawings</Text>
          <Text style={styles.editorCopy}>Your marks overlap these drawings. This request will include the selected drawings.</Text>
          {editor.preview.targets.map((target) => <Pressable key={target.drawingId}
            accessibilityRole="checkbox" accessibilityLabel={target.title || target.drawingId}
            accessibilityState={{ checked: editor.selectedTargetIds.includes(target.drawingId), disabled: target.drawingId === drawing.id || busy }}
            disabled={target.drawingId === drawing.id || busy}
            onPress={() => toggleTarget(target.drawingId)} style={styles.targetRow}>
            <Text style={styles.targetMark}>{editor.selectedTargetIds.includes(target.drawingId) ? "Selected" : "Add"}</Text>
            <Text style={styles.targetText}>{target.title || "Drawing"}{target.drawingId === drawing.id ? " · current drawing" : ""}</Text>
          </Pressable>)}
        </View> : null}
        {stale ? <View style={styles.stack}>
          <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>
          <Button label="Refresh drawing review" variant="secondary" onPress={onRefresh} />
        </View> : error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
        {editorCanWrite || canApproveCurrent ? <View style={styles.actions}>
          {isSubmitted && canSaveDraft ? <View style={styles.action}><Button label="Save annotation draft" variant="secondary"
            loading={busy} disabled={stale} onPress={() => void saveDraft()} /></View> : null}
          {canRequestChanges ? <View style={styles.action}><Button
            label={editor.editableRequest ? "Update change request" : editor.placement
              ? editor.preview ? "Confirm change request" : "Review affected drawings" : "Send drawing change request"}
            loading={busy} disabled={stale || !editor.summary.trim() || editor.annotations.elements.length === 0}
            onPress={() => void requestChanges()} /></View> : null}
          {canApproveCurrent ? <View style={styles.action}>
            {confirmApproval ? <View style={styles.stack}>
              <Text style={styles.editorCopy}>Approve this submitted revision?{hasDirtyEditor ? " Your unsent marks will be discarded." : ""}</Text>
              <Button label="Confirm drawing approval" loading={busy} disabled={stale} onPress={() => void approve()} />
              <Button label="Cancel approval" variant="quiet" onPress={() => setConfirmApproval(false)} />
            </View> : <Button label="Approve drawing" variant="secondary" disabled={busy || stale} onPress={() => setConfirmApproval(true)} />}
          </View> : null}
        </View> : null}
      </ScrollView> : null} />
  </View>;
}

const styles = StyleSheet.create({
  center: { minHeight: 120, alignItems: "center", justifyContent: "center" },
  section: { gap: spacing.md },
  heading: { gap: spacing.xs },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  readiness: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  stack: { gap: spacing.sm },
  notice: { gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
  drawing: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowCopy: { minWidth: 180, flexGrow: 1, flexShrink: 1, gap: 2 },
  drawingTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  history: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
  historyHeading: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  historyRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  editorScroll: { flex: 1, width: "100%", backgroundColor: colors.canvas },
  editorContent: { width: "100%", maxWidth: 860, alignSelf: "center", gap: spacing.md, padding: spacing.md, paddingBottom: spacing.huge },
  editorTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 25 },
  editorMeta: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  editorCopy: { color: colors.ink, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  historyNote: { padding: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  previewBox: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  previewTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21 },
  targetRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  targetMark: { minWidth: 58, color: colors.primary, fontFamily: fonts.semibold, fontSize: 12 },
  targetText: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 160, minWidth: 0 }
});
