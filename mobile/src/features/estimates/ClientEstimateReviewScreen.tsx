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
import type { ClientEstimate } from "./clientReviewModel";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const STATUS_LABELS: Readonly<Record<ClientEstimate["status"], string>> = {
  sent_to_client: "Awaiting your decision",
  client_changes_requested: "Changes requested",
  client_approved: "Estimate approved"
};

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

function LineItem({ line, index }: { readonly line: ClientEstimate["lineItems"][number]; readonly index: number }) {
  const name = nonempty(line.roomName) ?? `Included item ${index + 1}`;
  const specification = nonempty(line.specification);
  const unit = nonempty(line.unit);
  return (
    <View testID={`estimate-line-${index}`} style={[styles.line, index > 0 ? styles.divider : null]}>
      <View style={styles.lineCopy}>
        <Text style={styles.lineName}>{name}</Text>
        {specification ? <Text style={styles.lineDetail}>{specification}</Text> : null}
        <Text style={styles.lineDetail}>{line.quantity}{unit ? ` ${unit}` : ""} × {money.format(line.rate)}</Text>
      </View>
      <Text style={styles.lineAmount}>{line.amount === undefined ? "Amount unavailable" : money.format(line.amount)}</Text>
    </View>
  );
}

export function ClientEstimateReviewScreen({ estimateId, session, reviewContent }: {
  readonly estimateId: string;
  readonly session: AuthenticatedSession;
  readonly reviewContent?: (estimate: ClientEstimate) => ReactNode;
}) {
  const context = useConfiguredRuntime();
  const [decisionResult, setDecisionResult] = useState<ClientEstimateDecisionResult | null>(null);
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

  const status = decisionResult?.status ?? estimate.status;
  const projectId = decisionResult ? decisionResult.projectId : estimate.projectId;
  const reviewEstimate: ClientEstimate = decisionResult ? { ...estimate, status, projectId } : estimate;
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
      {decisionResult ? <View style={styles.notice}><Text accessibilityLiveRegion="polite" style={styles.noticeText}>{status === "client_approved" ? "Your approval was recorded." : "Your change request was recorded."}</Text></View> : null}

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
              <Text testID="estimate-total" style={styles.total}>{money.format(estimate.total)}</Text>
            </View>
            <Text testID="estimate-status" style={styles.status}>{STATUS_LABELS[status]}</Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaText}>Estimate ID: {estimate.id}</Text>
            {clientName ? <Text style={styles.metaText}>Client: {clientName}</Text> : null}
            {estimate.subtotal !== undefined ? <Text style={styles.metaText}>Subtotal: {money.format(estimate.subtotal)}</Text> : null}
            {estimate.gst !== undefined ? <Text style={styles.metaText}>GST: {money.format(estimate.gst)}</Text> : null}
          </View>
          <ClientEstimateAction estimate={estimate} session={session} onDecision={setDecisionResult} onRefresh={() => void query.refetch()} decisionRecorded={decisionResult !== null} />
          {projectAllowed && projectId ? (
            <Button label="Open project designs" variant="secondary" onPress={() => router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "projects", recordId: projectId, tab: "designs" } })} />
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.iconChip}><ProjectDetailGlyph name="list" size={22} color={colors.primary} /></View>
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Included items</Text>
            <Text style={styles.cardSubtitle}>{included.length} included in the published estimate</Text>
          </View>
        </View>
        <View style={styles.lines}>
          {included.length === 0 ? <Text style={styles.empty}>No included items were returned for this estimate. Refresh to check the published scope.</Text> :
            included.map((line, index) => <LineItem key={line.id ?? `${line.catalogueId ?? "line"}-${index}`} line={line} index={index} />)}
        </View>
      </View>

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
  lines: { paddingHorizontal: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm, paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  lineCopy: { flexGrow: 1, flexBasis: 160, minWidth: 0, gap: 3 },
  lineName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  lineDetail: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  lineAmount: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  empty: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, paddingVertical: spacing.md },
  designState: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  notice: { gap: spacing.xs, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: projectDetailTheme.innerRadius, backgroundColor: colors.surface },
  noticeText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20 },
  updating: { color: colors.info, fontFamily: fonts.medium, fontSize: 12 }
});
