import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { NativeAnnotationEditor } from "../annotations/NativeAnnotationEditor";
import { ProtectedDocumentViewer, type ProtectedDocumentViewerProps } from "../documents/ProtectedDocumentViewer";
import { createIdempotencyKey } from "../finance/money";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import {
  clientDrawingWorkspaceKey,
  clientPlanPageImagePath,
  getClientDrawingWorkspace,
  previewClientPlanTargets,
  saveClientPlanDraft,
  submitClientPlanRequest,
  updateClientPlanRequest,
  type ClientPlanTargetPreview
} from "./clientReviewApi";
import { canEditClientPlan, type ClientEstimate, type ClientPlanPage, type ClientPlanWorkspace } from "./clientReviewModel";
import {
  initialPlanDocument,
  planMutationError,
  planMutationVersion,
  planRequestForPage,
  sharedPlanRequestMarks,
  submissionFingerprint,
  validatePlanDocument,
  validatePlanFeedback
} from "./clientPlanReviewModel";
import { projectDrawingAnnotationsToPage, projectDrawingCommentsToPage } from "./drawingAnnotationProjection";
import type { AnnotationDocumentV1 } from "../../platform/annotations/document";

interface PendingRequest {
  readonly annotations: AnnotationDocumentV1;
  readonly summary: string;
  readonly preview: ClientPlanTargetPreview;
  readonly selectedDrawingIds: readonly string[];
  readonly idempotencyKey: string;
}

export interface ClientPlanPageViewerProps {
  readonly estimate: ClientEstimate;
  readonly session: AuthenticatedSession;
  readonly workspace: ClientPlanWorkspace;
  readonly page: ClientPlanPage;
  readonly uploadName: string;
  readonly siblingPages: readonly ClientPlanPage[];
  readonly reviewAvailable?: boolean;
  readonly onClose: () => void;
  readonly onSelectPage: (pageId: string) => void;
  readonly onRefresh: () => Promise<void>;
}

function initialRequest(workspace: ClientPlanWorkspace, pageId: string) {
  const request = planRequestForPage(workspace, pageId);
  return request === "ambiguous" ? null : request;
}

export function ClientPlanPageViewer({ estimate, session, workspace, page, uploadName, siblingPages, reviewAvailable = true, onClose, onSelectPage, onRefresh }: ClientPlanPageViewerProps) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const request = planRequestForPage(workspace, page.id);
  const startingRequest = initialRequest(workspace, page.id);
  const startingDocument = useMemo(() => initialPlanDocument(page, startingRequest), [page.id]);
  const [annotations, setAnnotations] = useState<AnnotationDocumentV1>(startingDocument);
  const [summary, setSummary] = useState(startingRequest?.summary ?? "");
  const [savedDocument, setSavedDocument] = useState(JSON.stringify(startingDocument));
  const [savedSummary, setSavedSummary] = useState(startingRequest?.summary.trim() ?? "");
  const [draftVersion, setDraftVersion] = useState(page.annotationDraft?.version ?? 0);
  const [requestVersion, setRequestVersion] = useState(startingRequest?.version ?? null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [busy, setBusy] = useState<"save" | "preview" | "submit" | "update" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [conflictRefreshed, setConflictRefreshed] = useState(false);
  const busyRef = useRef(false);
  const submissionRef = useRef<{ readonly fingerprint: string; readonly key: string } | null>(null);
  const dirty = JSON.stringify(annotations) !== savedDocument || summary.trim() !== savedSummary;
  const reviewable = reviewAvailable && session.user.role === "client" && canEditClientPlan(estimate) && page.status !== "approved" && request !== "ambiguous";
  const canEdit = reviewable && !conflict;
  const canSaveDraft = canEdit && request === null && canPerformOperation(session, "PUT /client/estimate-plan-pages/:pageId/annotation-draft");
  const canPreview = canEdit && request === null && canPerformOperation(session, "POST /client/estimate-plan-pages/:pageId/target-preview") && canPerformOperation(session, "POST /client/estimate-plan-pages/:pageId/change-requests");
  const canUpdate = canEdit && request !== null && canPerformOperation(session, "PUT /client/estimate-plan-change-requests/:requestId");
  const canReadDrawingFeedback = canPerformOperation(session, "GET /client/estimates/:estimateId/design-drawings");
  const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  const drawingQuery = useQuery({
    queryKey: clientDrawingWorkspaceKey(scope, estimate.id),
    queryFn: ({ signal }) => getClientDrawingWorkspace(context.runtime, estimate.id, signal),
    enabled: canReadDrawingFeedback && context.environment.status === "ready"
  });

  const shared = useMemo(() => {
    const excludedRequestId = request && request !== "ambiguous" ? request.id : undefined;
    const planFeedback = {
      marks: sharedPlanRequestMarks(workspace, page.id, excludedRequestId),
      comments: workspace.openRequests
        .filter((item) => item.sourcePageId === page.id && item.id !== excludedRequestId && item.summary.trim())
        .map((item) => ({ id: item.id, summary: item.summary, status: item.status }))
    };
    if (!drawingQuery.data) {
      return { ...planFeedback, projectionError: false };
    }
    try {
      return {
        marks: projectDrawingAnnotationsToPage(page, drawingQuery.data, workspace, excludedRequestId),
        comments: projectDrawingCommentsToPage(page, drawingQuery.data, workspace)
          .filter((item) => item.id !== excludedRequestId),
        projectionError: false
      };
    } catch {
      return { ...planFeedback, projectionError: true };
    }
  }, [drawingQuery.data, page, request, workspace]);

  const source = {
    path: clientPlanPageImagePath(page.id),
    fileName: `${uploadName} · page ${page.pageNumber}.png`,
    mimeType: "image/png",
    kind: "plan-page" as const
  };
  const orderedPages = siblingPages.slice().sort((left, right) => left.pageNumber - right.pageNumber || left.id.localeCompare(right.id));
  const pageIndex = orderedPages.findIndex((item) => item.id === page.id);

  function requestExit(nextPageId?: string) {
    if (busyRef.current) return;
    if (!dirty) {
      if (nextPageId) onSelectPage(nextPageId);
      else onClose();
      return;
    }
    Alert.alert("Discard unsaved plan edits?", "Your marks and summary on this page have not been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard edits", style: "destructive", onPress: () => { if (nextPageId) onSelectPage(nextPageId); else onClose(); } }
    ]);
  }

  async function refreshAfterConflict() {
    try { await onRefresh(); setConflictRefreshed(true); }
    catch { setError("The latest plan could not be loaded. Your marks remain here. Try refreshing again."); }
  }

  function actionFailed(cause: unknown) {
    const outcome = planMutationError(cause);
    setError(outcome.message);
    setNotice(null);
    if (outcome.conflict) {
      setConflict(true);
      setConflictRefreshed(false);
      setPendingRequest(null);
      void invalidate("plan-review-changed").catch(() => undefined);
      void refreshAfterConflict();
    }
  }

  async function runAction(name: "save" | "preview" | "submit" | "update", work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(name);
    setError(null);
    setNotice(null);
    try { await work(); }
    catch (cause) { actionFailed(cause); }
    finally { busyRef.current = false; setBusy(null); }
  }

  function saveDraft() {
    if (!canSaveDraft) return;
    const validation = validatePlanDocument(annotations, page);
    if (validation) { setError(validation); return; }
    void runAction("save", async () => {
      const result = await saveClientPlanDraft(context.runtime, page.id, draftVersion, annotations);
      setDraftVersion(planMutationVersion(result, page.id));
      setSavedDocument(JSON.stringify(annotations));
      setNotice("Annotation draft saved.");
      await invalidate("plan-review-changed").catch(() => undefined);
    });
  }

  function previewTargets() {
    if (!canPreview) return;
    const validation = validatePlanFeedback(annotations, summary, page);
    if (validation) { setError(validation); return; }
    void runAction("preview", async () => {
      const preview = await previewClientPlanTargets(context.runtime, page.id, annotations);
      const fingerprint = submissionFingerprint(annotations, summary);
      if (submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, key: createIdempotencyKey() };
      setPendingRequest({
        annotations,
        summary: summary.trim(),
        preview,
        selectedDrawingIds: preview.targets.map((target) => target.drawingId),
        idempotencyKey: submissionRef.current.key
      });
    });
  }

  function confirmRequest() {
    if (!canPreview || !pendingRequest || (pendingRequest.preview.targets.length > 0 && pendingRequest.selectedDrawingIds.length === 0)) return;
    void runAction("submit", async () => {
      const result = await submitClientPlanRequest(context.runtime, page.id, {
        version: pendingRequest.preview.pageRevisionNumber,
        summary: pendingRequest.summary,
        annotations: pendingRequest.annotations,
        targetDrawingIds: pendingRequest.selectedDrawingIds,
        snapshotToken: pendingRequest.preview.snapshotToken,
        idempotencyKey: pendingRequest.idempotencyKey
      });
      planMutationVersion(result, page.id);
      submissionRef.current = null;
      setPendingRequest(null);
      setSavedDocument(JSON.stringify(pendingRequest.annotations));
      setSavedSummary(pendingRequest.summary);
      await invalidate("plan-review-changed").catch(() => undefined);
      onClose();
    });
  }

  function updateRequest() {
    if (request === null || request === "ambiguous" || !canUpdate || !dirty) return;
    const validation = validatePlanFeedback(annotations, summary, page);
    if (validation) { setError(validation); return; }
    void runAction("update", async () => {
      const result = await updateClientPlanRequest(context.runtime, request.id, requestVersion ?? request.version, summary.trim(), annotations);
      setRequestVersion(planMutationVersion(result, page.id));
      setSavedDocument(JSON.stringify(annotations));
      setSavedSummary(summary.trim());
      setNotice("Change request updated.");
      await invalidate("plan-review-changed").catch(() => undefined);
    });
  }

  function reconcileLatestVersion() {
    if (!conflict || !conflictRefreshed) return;
    setDraftVersion(page.annotationDraft?.version ?? 0);
    setRequestVersion(request && request !== "ambiguous" ? request.version : null);
    setPendingRequest(null);
    setConflict(false);
    setConflictRefreshed(false);
    setError(null);
    setNotice("Your marks are still here. Review them against the latest plan before saving or requesting changes.");
  }

  const renderImage: NonNullable<ProtectedDocumentViewerProps["renderImage"]> = (localUri) => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      <Text style={styles.context}>{uploadName}</Text>
      <Text accessibilityRole="header" style={styles.title}>Page {page.pageNumber}</Text>
      <Text style={styles.meta}>{page.status === "approved" ? "Approved page" : page.status.replaceAll("_", " ")}</Text>
      {orderedPages.length > 1 ? <View style={styles.navigation}>
        <View style={styles.navigationAction}><Button label="Previous page" variant="secondary" disabled={pageIndex <= 0 || busy !== null} onPress={() => requestExit(orderedPages[pageIndex - 1]?.id)} /></View>
        <Text accessibilityLabel={`Page ${pageIndex + 1} of ${orderedPages.length}`} style={styles.pageCount}>{pageIndex + 1} / {orderedPages.length}</Text>
        <View style={styles.navigationAction}><Button label="Next page" variant="secondary" disabled={pageIndex < 0 || pageIndex >= orderedPages.length - 1 || busy !== null} onPress={() => requestExit(orderedPages[pageIndex + 1]?.id)} /></View>
      </View> : null}
      {drawingQuery.isPending && canReadDrawingFeedback ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Loading shared drawing feedback…</Text> : null}
      {drawingQuery.isError || shared.projectionError ? <View style={styles.notice}><Text accessibilityLiveRegion="assertive" style={styles.error}>Shared drawing feedback could not be displayed. Refresh before relying on earlier marks.</Text><Button label="Retry shared feedback" variant="quiet" onPress={() => void drawingQuery.refetch()} /></View> : null}
      <NativeAnnotationEditor imageUri={localUri} imageWidth={page.width} imageHeight={page.height} value={annotations} onChange={(next) => { setAnnotations(next); setError(null); setPendingRequest(null); }} readOnly={!canEdit || busy !== null || pendingRequest !== null} sharedAnnotations={shared.marks} />
      {shared.comments.length ? <View style={styles.history}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Earlier feedback</Text>
        {shared.comments.map((comment) => <View key={comment.id} style={styles.historyRow}><Text style={styles.copy}>{comment.summary}</Text><Text style={styles.meta}>{comment.status.replaceAll("_", " ")}</Text></View>)}
      </View> : null}
      {request && request !== "ambiguous" ? <View style={styles.history}><Text accessibilityRole="header" style={styles.sectionTitle}>Open change request</Text><Text style={styles.copy}>Your submitted marks can be updated while this request is open.</Text></View> : null}
      {request === "ambiguous" ? <Text accessibilityLiveRegion="assertive" style={styles.error}>More than one open request was returned for this page. Refresh before editing.</Text> : null}
      {!reviewable && request !== "ambiguous" ? <Text style={styles.hint}>This page is available to view. Annotation changes are not currently open.</Text> : null}
      {!reviewable && dirty && summary.trim() ? <View style={styles.history}><Text accessibilityRole="header" style={styles.sectionTitle}>Unsent summary</Text><Text style={styles.copy}>{summary.trim()}</Text></View> : null}
      {reviewable ? <View style={styles.form}>
        <Text style={styles.sectionTitle}>Change summary</Text>
        <TextInput accessibilityLabel="Change summary" editable={!conflict && busy === null && pendingRequest === null} multiline maxLength={1000} onChangeText={(value) => { setSummary(value); setError(null); setPendingRequest(null); }} placeholder="Describe the changes shown by your marks" placeholderTextColor={colors.inkMuted} style={styles.summaryInput} value={summary} />
        <View style={styles.actions}>
          {canSaveDraft ? <View style={styles.action}><Button label="Save draft" variant="secondary" loading={busy === "save"} disabled={busy !== null} onPress={saveDraft} /></View> : null}
          {canPreview ? <View style={styles.action}><Button label="Request changes" loading={busy === "preview"} disabled={busy !== null} onPress={previewTargets} /></View> : null}
          {canUpdate ? <View style={styles.action}><Button label="Update request" loading={busy === "update"} disabled={busy !== null || !dirty} onPress={updateRequest} /></View> : null}
        </View>
      </View> : null}
      {pendingRequest ? <View accessibilityLabel="Confirm affected drawings" style={styles.confirmation}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Confirm affected drawings</Text>
        <Text style={styles.copy}>{pendingRequest.preview.targets.length ? "Select every extracted drawing affected by these markings." : "No drawing overlaps these marks. This request will be sent as page-level feedback."}</Text>
        {pendingRequest.preview.targets.map((target) => {
          const selected = pendingRequest.selectedDrawingIds.includes(target.drawingId);
          return <Pressable key={target.drawingId} accessibilityRole="checkbox" accessibilityLabel={target.title} accessibilityState={{ checked: selected, disabled: busy !== null }} disabled={busy !== null} onPress={() => setPendingRequest((current) => {
            if (!current || busyRef.current) return current;
            const currentlySelected = current.selectedDrawingIds.includes(target.drawingId);
            const key = createIdempotencyKey();
            submissionRef.current = { fingerprint: submissionFingerprint(current.annotations, current.summary), key };
            return { ...current, selectedDrawingIds: currentlySelected ? current.selectedDrawingIds.filter((id) => id !== target.drawingId) : [...current.selectedDrawingIds, target.drawingId], idempotencyKey: key };
          })} style={[styles.target, selected ? styles.targetSelected : null]}><Text style={styles.targetText}>{selected ? "Selected: " : "Not selected: "}{target.title}</Text></Pressable>;
        })}
        <View style={styles.actions}><View style={styles.action}><Button label="Back to marks" variant="quiet" disabled={busy !== null} onPress={() => setPendingRequest(null)} /></View><View style={styles.action}><Button label="Confirm change request" loading={busy === "submit"} disabled={busy !== null || (pendingRequest.preview.targets.length > 0 && pendingRequest.selectedDrawingIds.length === 0)} onPress={confirmRequest} /></View></View>
      </View> : null}
      {conflict ? <View style={styles.notice}><Text style={styles.copy}>Your unsent marks and summary are preserved. Refresh the plan, then choose to use the latest version.</Text><View style={styles.actions}><View style={styles.action}><Button label="Refresh plan" variant="secondary" onPress={() => void refreshAfterConflict()} /></View><View style={styles.action}><Button label="Use latest version with my marks" variant="secondary" disabled={!conflictRefreshed} onPress={reconcileLatestVersion} /></View></View></View> : null}
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
    </ScrollView>
  );

  return <ProtectedDocumentViewer visible source={source} onClose={() => requestExit()} renderImage={renderImage} />;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, width: "100%", backgroundColor: colors.canvas },
  content: { width: "100%", maxWidth: 860, alignSelf: "center", gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.huge },
  context: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 12 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 27 },
  meta: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  hint: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  navigation: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  navigationAction: { minWidth: 116, flexGrow: 1, flexBasis: 116 },
  pageCount: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, textAlign: "center" },
  form: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  sectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  summaryInput: { minHeight: 96, padding: spacing.sm, textAlignVertical: "top", borderWidth: 1, borderColor: colors.borderStrong, color: colors.ink, backgroundColor: colors.surface, fontFamily: fonts.regular, fontSize: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  action: { flexGrow: 1, flexBasis: 140, minWidth: 120 },
  history: { gap: spacing.xs, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  historyRow: { gap: 2, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  copy: { color: colors.ink, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  confirmation: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  target: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  targetSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  targetText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20 },
  notice: { gap: spacing.xs, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  success: { color: colors.success, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20 }
});
