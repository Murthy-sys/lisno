import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { ScaffoldContentBack } from "../../navigation/AdaptiveAppScaffold";
import { resolveAuthorizedFeature } from "../../navigation/registry";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, StateView } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { ProjectDetailGlyph } from "../projects/projectDetailIcons";
import { projectDetailTheme } from "../projects/projectDetailTheme";
import { ClientEstimateAction } from "./ClientEstimateAction";
import { clientEstimateListKey, getClientEstimates, type ClientEstimateDecisionResult } from "./clientReviewApi";
import { clientEstimateMoney, clientEstimateStatus, type ClientEstimate } from "./clientReviewModel";
import { ClientPreEstimateComparison, PublishedEstimateItems } from "./ClientPublishedEstimateDetails";

function nonempty(value: string | undefined | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function designState(status: ClientEstimate["status"], planStatus: string | null): string {
  if (status === "client_approved") {
    if (planStatus === "ready_for_client") return "A submitted design plan is ready for your review.";
    if (planStatus === "approved") return "The design plan is approved. Open the linked project for approved documents.";
    return "The estimate is approved. A design plan has not been submitted for your review yet.";
  }
  return "Any design plans shared with you will appear in this review.";
}

export function ClientEstimateReviewScreen({ estimateId, session, reviewContent }: {
  readonly estimateId: string;
  readonly session: AuthenticatedSession;
  readonly reviewContent?: (estimate: ClientEstimate) => ReactNode;
}) {
  const context = useConfiguredRuntime();
  const [decisionState, setDecisionState] = useState<{ scopeKey: string; result: ClientEstimateDecisionResult } | null>(null);
  const scopeKey = `${context.environment.environment.id}:${session.user.id}`;
  const canRead = session.user.role === "client" &&
    Boolean(resolveAuthorizedFeature("estimates", session.user.role, session.authorization)) &&
    canPerformOperation(session, "GET /client/estimates");
  const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  const query = useQuery({
    queryKey: clientEstimateListKey(scope),
    queryFn: ({ signal }) => getClientEstimates(context.runtime, signal),
    enabled: canRead && context.environment.status === "ready"
  });

  if (!canRead) return <StateView tone="denied" title="Estimate review unavailable" message="Your current account cannot open this Client estimate." />;
  if (context.environment.status !== "ready") return <StateView tone="error" title="Estimate review unavailable" message="Connect to the service to load this estimate." />;
  if (query.isPending) return <View style={styles.center}><BrandLoader label="Loading estimate review" tone="dark" /></View>;
  if (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)) {
    return <StateView tone="denied" title="Estimate review unavailable" message="This estimate is outside your current access." actionLabel="Retry" onAction={() => void query.refetch()} />;
  }
  if (query.isError && !query.data) {
    const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
    return <StateView tone={denied ? "denied" : "error"} title={denied ? "Estimate review unavailable" : "Estimate could not be loaded"}
      message={denied ? "This estimate is outside your current access." : "Check your connection and try again."}
      actionLabel="Retry" onAction={() => void query.refetch()} />;
  }

  const estimate = query.data?.find((item) => item.id === estimateId);
  if (!estimate) {
    return <StateView tone="denied" title="Estimate unavailable" message="This estimate is not in your current Client review list." actionLabel="Refresh" onAction={() => void query.refetch()} />;
  }

  const review = estimate.reviewSourceIssue ? null : estimate.publishedReview;
  const decisionResult = decisionState?.scopeKey === scopeKey ? decisionState.result : null;
  const recorded = decisionResult?.id === estimate.id && decisionResult.publishedReview.id === review?.id ? decisionResult : null;
  const status = recorded?.status ?? estimate.status;
  const projectId = recorded ? recorded.projectId : estimate.projectId;
  const reviewEstimate: ClientEstimate = recorded ? { ...estimate, status, projectId } : estimate;
  const projectAllowed = Boolean(projectId) && Boolean(resolveAuthorizedFeature("projects", session.user.role, session.authorization)) &&
    canPerformOperation(session, "GET /projects/:projectId");
  const included = estimate.lineItems.filter((item) => item.included);
  const title = nonempty(estimate.lead?.projectName) ?? `Estimate ${estimate.id}`;
  const location = nonempty(estimate.lead?.location);
  const clientName = nonempty(estimate.lead?.clientName);

  return (
    <ScrollView testID="client-estimate-review" contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}>
      <View style={styles.header}>
        <View style={styles.back}><ScaffoldContentBack /></View>
        <Text style={styles.eyebrow}>CLIENT REVIEW</Text>
        <Text accessibilityRole="header" style={styles.title}>Estimate Details</Text>
        <Text style={styles.subtitle}>{title}{location ? ` · ${location}` : ""}</Text>
      </View>

      {query.isRefetchError ? <View style={styles.notice}><Text accessibilityLiveRegion="assertive" style={styles.noticeText}>The latest estimate could not be loaded. These details may be out of date.</Text><Button label="Refresh estimate" variant="quiet" onPress={() => void query.refetch()} /></View> : null}
      {query.isRefetching && !query.isRefetchError ? <Text accessibilityLiveRegion="polite" style={styles.updating}>Updating estimate…</Text> : null}
      {recorded ? <View style={styles.notice}><Text accessibilityLiveRegion="polite" style={styles.noticeText}>{status === "client_approved" ? "Your approval was recorded." : "Your change request was recorded."}</Text></View> : null}

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.iconChip}><ProjectDetailGlyph name="calculator" size={22} color={colors.primary} /></View>
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Estimate</Text>
            <Text style={styles.cardSubtitle}>Published scope and Client decision</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.summary}>
            <View style={styles.summaryCopy}>
              <Text style={styles.label}>GST-inclusive total</Text>
              <Text testID="estimate-total" style={styles.total}>{clientEstimateMoney(estimate.total)}</Text>
            </View>
            <Text testID="estimate-status" style={styles.status}>{recorded ? status === "client_approved" ? "Estimate approved" : "Changes requested" : clientEstimateStatus(estimate)}</Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaText}>Estimate ID: {estimate.id}</Text>
            {clientName ? <Text style={styles.metaText}>Client: {clientName}</Text> : null}
            {estimate.subtotal !== null ? <Text style={styles.metaText}>Subtotal: {clientEstimateMoney(estimate.subtotal)}</Text> : null}
            {estimate.gst !== null ? <Text style={styles.metaText}>GST: {clientEstimateMoney(estimate.gst)}</Text> : null}
          </View>
          {review ? <>
            <Text style={styles.metaText}>{review.phase === "post" ? "Final post-estimate" : review.phase === "pre" ? "Pre-estimate" : "Published estimate"} · Version {review.estimateVersion} · Submission {review.sendGeneration}</Text>
            <Text style={styles.metaText}>Submitted {Number.isFinite(Date.parse(review.submittedAt)) ? new Date(review.submittedAt).toLocaleDateString("en-GB") : "Date unavailable"}</Text>
            {review.status === "superseded" ? <Text style={styles.designState}>This submitted review was withdrawn. Your team is revising the estimate; review the next submission when it is ready.</Text> : null}
            {review.status === "changes_requested" ? <Text style={styles.designState}>Sales is revising your estimate. Your last submitted estimate remains available here.</Text> : null}
            {review.decisionNote ? <Text style={styles.designState}>Your review note: {review.decisionNote}</Text> : null}
            {review.status === "approved" ? <Text style={styles.designState}>{review.phase === "post" ? "Your final approval is recorded and estimate changes are closed. Your team will confirm the initial payment before issuing work orders." : review.phase === "pre" ? "Your pre-estimate approval is recorded. Design and procurement preparation can continue while your team prepares the final estimate." : "Your approved estimate is recorded."}</Text> : null}
            <ClientPreEstimateComparison key={`${estimate.id}:${review.id}`} estimate={estimate} session={session} />
          </> : <Text accessibilityLiveRegion="polite" style={styles.designState}>The submitted version could not be verified. Please ask your Sales team to submit the estimate again.</Text>}
          <ClientEstimateAction key={`${scopeKey}:${estimate.id}:${review?.id}:${review?.version}`} estimate={estimate} session={session} onDecision={(result) => setDecisionState({ scopeKey, result })} onRefresh={() => query.refetch({ throwOnError: true })} decisionRecorded={recorded !== null} decisionBlocked={query.isRefetchError || query.isRefetching} />
          {projectAllowed && projectId ? (
            <Button label="Open project designs" variant="secondary" onPress={() => router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "projects", recordId: projectId, tab: "designs" } })} />
          ) : null}
        </View>
      </View>

      {review ? <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.iconChip}><ProjectDetailGlyph name="list" size={22} color={colors.primary} /></View>
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Included items</Text>
            <Text style={styles.cardSubtitle}>{included.length} included in the published estimate</Text>
          </View>
        </View>
        <View style={styles.lines}>
          <PublishedEstimateItems snapshot={review.snapshot} />
        </View>
      </View> : null}

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.iconChip}><ProjectDetailGlyph name="image" size={22} color={colors.primary} /></View>
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Design review</Text>
            <Text style={styles.cardSubtitle}>Uploaded plans and drawing revisions</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.designState}>{designState(status, estimate.designPlanStatus)}</Text>
          {reviewContent?.(reviewEstimate)}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  page: { flexGrow: 1, width: "100%", maxWidth: projectDetailTheme.pageMaxWidth, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.huge, gap: projectDetailTheme.blockGap },
  header: { gap: 5, minWidth: 0, paddingBottom: spacing.xs },
  back: { alignSelf: "flex-start", marginLeft: -10, minHeight: projectDetailTheme.touch },
  eyebrow: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.2 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 28, lineHeight: 34 },
  subtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  card: { minWidth: 0, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: projectDetailTheme.cardRadius, backgroundColor: colors.surface },
  cardHeading: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md },
  iconChip: { width: projectDetailTheme.iconChipSize, height: projectDetailTheme.iconChipSize, alignItems: "center", justifyContent: "center", borderRadius: projectDetailTheme.innerRadius, backgroundColor: projectDetailTheme.iconChip },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  cardSubtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  cardBody: { gap: spacing.md, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  summary: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: projectDetailTheme.innerRadius, backgroundColor: projectDetailTheme.valueTint, borderWidth: 1, borderColor: projectDetailTheme.valueBorder },
  summaryCopy: { gap: 2, minWidth: 0 },
  label: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  total: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 25, lineHeight: 32, fontVariant: ["tabular-nums"] },
  status: { color: colors.primary, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  meta: { gap: 4 },
  metaText: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  lines: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  designState: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  notice: { gap: spacing.xs, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: projectDetailTheme.innerRadius, backgroundColor: colors.surface },
  noticeText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20 },
  updating: { color: colors.info, fontFamily: fonts.medium, fontSize: 12 }
});
