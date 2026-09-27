import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import {
  clientSectionReviewKey,
  clientSectionRevisionImagePath,
  decideClientSection,
  getClientSectionReview
} from "../estimates/clientReviewApi";
import type { ClientSection, ClientSectionReview as SectionReviewData } from "../estimates/clientReviewModel";
import { ProjectCardHeader } from "../projects/ProjectDetailOverview";
import { projectDetailTheme } from "../projects/projectDetailTheme";

interface DecisionChoice {
  readonly sectionId: string;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly decision: "approved" | "rejected";
}

interface DecisionInput extends DecisionChoice {
  readonly comment?: string;
}

const statusLabel = (status: string) => {
  if (status === "submitted") return "Awaiting your review";
  if (status === "rejected") return "Changes requested";
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
};

function requestError(cause: unknown): string {
  if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) return "This section is unavailable for your account.";
  return "The decision could not be saved. Check your connection and try again.";
}

/** Keying the inner panel clears selection and unfinished comments when its project or identity changes. */
export function ClientSectionReview({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  return <ClientSectionReviewContent key={`${session.user.id}:${projectId}`} projectId={projectId} session={session} />;
}

function ClientSectionReviewContent({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  const canRead = canPerformOperation(session, "GET /client/projects/:projectId/design-sections");
  const canDecide = canPerformOperation(session, "POST /design-section-revisions/:revisionId/decision");
  const canPreview = canPerformOperation(session, "GET /design-section-revisions/:revisionId/image");
  const query = useQuery({
    queryKey: clientSectionReviewKey(scope, projectId),
    queryFn: ({ signal }) => getClientSectionReview(context.runtime, projectId, signal),
    enabled: canRead && Boolean(projectId.trim()),
    retry: false
  });
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [choice, setChoice] = useState<DecisionChoice | null>(null);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(null);

  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (input: DecisionInput) => decideClientSection(context.runtime, input.revisionId, input.revisionNumber, input.decision, input.comment),
    onSuccess: async (_result, input) => {
      setChoice(null);
      setComment("");
      setCommentError(null);
      setFeedback(null);
      setNeedsReload(true);
      try {
        await invalidate("design-workflow-changed");
        const refreshed = await query.refetch({ throwOnError: true });
        const sections = refreshed.data?.sections;
        if (!sections) throw new Error("Current sections are unavailable.");
        const next = sections.find((section) => section.id !== input.sectionId && section.revision.reviewStatus === "submitted");
        setActiveSectionId(next?.id ?? input.sectionId);
        setAnnouncement(next
          ? `Review saved. Now showing ${next.label}, the next section awaiting review.`
          : "Review saved. All current sections have a decision.");
        setNeedsReload(false);
      } catch {
        setFeedback("The decision was saved, but the latest sections could not be loaded. Refresh before reviewing another section.");
      }
    },
    onError: async (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        setChoice(null);
        setComment("");
        setCommentError(null);
        setFeedback("This section changed. The current review is being refreshed; check its status before deciding again.");
        setNeedsReload(true);
        try {
          await query.refetch({ throwOnError: true });
          setNeedsReload(false);
        } catch {
          setFeedback("This section changed, but the latest review could not be loaded. Refresh before deciding again.");
        }
      } else {
        setFeedback(requestError(cause));
        if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
          setChoice(null);
          setNeedsReload(true);
        }
      }
    }
  });

  if (!canRead || !projectId.trim()) return null;

  const data: SectionReviewData | undefined = query.data;
  const sections = data?.sections ?? [];
  const selected = sections.find((section) => section.id === activeSectionId) ??
    sections.find((section) => section.revision.reviewStatus === "submitted") ?? sections[0];
  const activeIndex = selected ? sections.findIndex((section) => section.id === selected.id) : -1;
  const canAct = canDecide && !query.isFetching && !query.isError && !needsReload && !mutation.isPending;
  const pendingChoice = choice && selected?.id === choice.sectionId && selected.revision.id === choice.revisionId &&
    selected.revision.revisionNumber === choice.revisionNumber && selected.revision.reviewStatus === "submitted"
    ? choice : null;

  const refresh = async () => {
    setNeedsReload(true);
    try {
      await query.refetch({ throwOnError: true });
      setNeedsReload(false);
      setFeedback(null);
      setChoice(null);
    } catch {
      setFeedback("The latest design sections could not be loaded. Try again.");
    }
  };
  const choose = (section: ClientSection, decision: DecisionChoice["decision"]) => {
    setChoice({ sectionId: section.id, revisionId: section.revision.id, revisionNumber: section.revision.revisionNumber, decision });
    setComment("");
    setCommentError(null);
    setFeedback(null);
  };
  const submit = () => {
    if (!pendingChoice || !canAct) return;
    if (pendingChoice.decision === "rejected" && !comment.trim()) {
      setCommentError("Explain what the designer should modify.");
      return;
    }
    mutation.mutate({ ...pendingChoice, ...(pendingChoice.decision === "rejected" ? { comment: comment.trim() } : {}) });
  };
  const show = (section: ClientSection | undefined) => {
    if (!section || mutation.isPending) return;
    setActiveSectionId(section.id);
    setChoice(null);
    setComment("");
    setCommentError(null);
    setAnnouncement(`Now showing ${section.label}.`);
  };
  const preview = selected && canPreview && previewRevisionId === selected.revision.id;

  return (
    <View testID="client-section-review" style={styles.card}>
      <ProjectCardHeader glyph="document" title="Design section review" subtitle="Submitted project sections and your decisions" />
      <View style={styles.body}>
        {query.isPending ? <BrandLoader label="Loading design sections" reducedMotion tone="dark" /> : null}
        {query.isError && !data ? (
          <View style={styles.stack}>
            <Text accessibilityLiveRegion="assertive" style={styles.error}>
              {query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)
                ? "Design sections are unavailable for this account."
                : "Design sections could not be loaded."}
            </Text>
            <Button label="Retry design sections" variant="secondary" onPress={() => void refresh()} />
          </View>
        ) : null}
        {data ? (
          <>
            <View accessible accessibilityLabel={`${data.progress.approved} approved, ${data.progress.rejected} changes requested, ${data.progress.awaitingReview} awaiting review, ${data.progress.total} total`} style={styles.progress}>
              <ProgressCount value={data.progress.approved} label="Approved" />
              <ProgressCount value={data.progress.rejected} label="Changes requested" />
              <ProgressCount value={data.progress.awaitingReview} label="Awaiting review" />
              <ProgressCount value={data.progress.total} label="Total" />
            </View>
            {announcement ? <Text accessibilityLiveRegion="polite" style={styles.announcement}>{announcement}</Text> : null}
            {feedback ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{feedback}</Text> : null}
            {query.isError ? <Text accessibilityLiveRegion="polite" style={styles.error}>The latest sections could not be loaded. Refresh before making another decision.</Text> : null}
            {sections.length === 0 ? (
              <View style={styles.state}><Text accessibilityRole="header" style={styles.stateTitle}>No sections ready for review</Text><Text style={styles.copy}>Submitted design sections will appear here.</Text></View>
            ) : (
              <>
                {data.progress.awaitingReview === 0 ? <View style={styles.state}><Text accessibilityRole="header" style={styles.stateTitle}>Review complete</Text><Text style={styles.copy}>All current sections have a decision.</Text></View> : null}
                {selected ? (
                  <View style={styles.section}>
                    <View style={styles.sectionTop}>
                      <View style={styles.sectionTitleBlock}>
                        <Text style={styles.position}>SECTION {activeIndex + 1} OF {sections.length}</Text>
                        <Text accessibilityRole="header" style={styles.sectionTitle}>{selected.label}</Text>
                        <Text style={styles.copy}>Design version {selected.versionNumber} · Revision {selected.revision.revisionNumber}</Text>
                      </View>
                      <Text style={[styles.status, selected.revision.reviewStatus === "submitted" ? styles.statusPending : null]}>{statusLabel(selected.revision.reviewStatus)}</Text>
                    </View>
                    {canPreview ? <Button label={`Preview ${selected.label}`} variant="secondary" onPress={() => setPreviewRevisionId(selected.revision.id)} /> : null}
                    <View style={styles.navigation}>
                      <View style={styles.navigationButton}><Button label="Previous section" variant="quiet" disabled={activeIndex <= 0 || mutation.isPending} onPress={() => show(sections[activeIndex - 1])} /></View>
                      <View style={styles.navigationButton}><Button label="Next section" variant="quiet" disabled={activeIndex >= sections.length - 1 || mutation.isPending} onPress={() => show(sections[activeIndex + 1])} /></View>
                    </View>
                    {selected.history.length > 0 ? (
                      <View style={styles.history}>
                        <Text accessibilityRole="header" style={styles.historyTitle}>Revision history</Text>
                        {[...selected.history].sort((a, b) => b.revisionNumber - a.revisionNumber).map((revision) => (
                          <View key={revision.id} style={styles.historyRow}>
                            <Text style={styles.historyRevision}>Revision {revision.revisionNumber}</Text>
                            <Text style={styles.copy}>{statusLabel(revision.reviewStatus)}</Text>
                            {revision.rejectionComment ? <Text style={styles.historyComment}>{revision.rejectionComment}</Text> : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {selected.revision.reviewStatus === "submitted" && canDecide ? (
                      pendingChoice ? (
                        <View style={styles.decisionPanel}>
                          <Text accessibilityRole="header" style={styles.decisionTitle}>
                            {pendingChoice.decision === "approved" ? `Approve ${selected.label}?` : `Request changes for ${selected.label}`}
                          </Text>
                          {pendingChoice.decision === "approved" ? <Text style={styles.copy}>This submitted revision will be locked after approval.</Text> : (
                            <Field label="Changes needed" value={comment} onChangeText={(value) => { setComment(value); if (value.trim()) setCommentError(null); }} error={commentError ?? undefined} multiline numberOfLines={4} maxLength={1000} placeholder="Tell the designer what to change" />
                          )}
                          <View style={styles.actions}>
                            <View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={() => { setChoice(null); setComment(""); setCommentError(null); }} /></View>
                            <View style={styles.action}><Button label={pendingChoice.decision === "approved" ? "Confirm approval" : "Send request"} loading={mutation.isPending} disabled={!canAct} onPress={submit} /></View>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.actions}>
                          <View style={styles.action}><Button label="Request changes" variant="danger" disabled={!canAct} onPress={() => choose(selected, "rejected")} /></View>
                          <View style={styles.action}><Button label="Approve section" disabled={!canAct} onPress={() => choose(selected, "approved")} /></View>
                        </View>
                      )
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh design sections" disabled={query.isFetching || mutation.isPending} onPress={() => void refresh()} style={styles.refresh}>
              <Text style={styles.refreshText}>Refresh sections</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      <ProtectedDocumentViewer visible={Boolean(preview)} source={preview && selected ? {
        path: clientSectionRevisionImagePath(selected.revision.id),
        fileName: `${selected.label}-revision-${selected.revision.revisionNumber}.png`,
        mimeType: "image/png",
        kind: "section-image"
      } : null} onClose={() => setPreviewRevisionId(null)} />
    </View>
  );
}

function ProgressCount({ value, label }: { readonly value: number; readonly label: string }) {
  return <View style={styles.progressItem}><Text style={styles.progressValue}>{value}</Text><Text style={styles.progressLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  card: { minWidth: 0, overflow: "hidden", borderRadius: projectDetailTheme.cardRadius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  body: { padding: spacing.md, gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stack: { gap: spacing.sm },
  progress: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: colors.border, borderRadius: projectDetailTheme.innerRadius, backgroundColor: colors.canvas },
  progressItem: { flexGrow: 1, flexBasis: "45%", minWidth: 105, padding: spacing.sm, alignItems: "center", justifyContent: "center", gap: 2 },
  progressValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  progressLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, textAlign: "center" },
  announcement: { color: colors.primary, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  state: { padding: spacing.md, gap: 3, borderRadius: projectDetailTheme.innerRadius, backgroundColor: colors.primarySoft },
  stateTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  section: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: projectDetailTheme.innerRadius },
  sectionTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  sectionTitleBlock: { flexGrow: 1, flexShrink: 1, minWidth: 150, gap: 3 },
  position: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1.2 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23 },
  status: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
  statusPending: { color: colors.warning },
  navigation: { flexDirection: "row", gap: spacing.xs },
  navigationButton: { flex: 1, minWidth: 0 },
  history: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  historyTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 13 },
  historyRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "baseline", paddingVertical: spacing.xs },
  historyRevision: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12 },
  historyComment: { flexBasis: "100%", color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  decisionPanel: { gap: spacing.sm, padding: spacing.md, borderRadius: projectDetailTheme.innerRadius, backgroundColor: colors.surfaceMuted },
  decisionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: "45%", minWidth: 120 },
  refresh: { minHeight: projectDetailTheme.touch, justifyContent: "center", alignItems: "center" },
  refreshText: { color: colors.primary, fontFamily: fonts.medium, fontSize: 12 }
});
