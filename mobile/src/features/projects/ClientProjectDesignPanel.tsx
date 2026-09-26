import { StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { BrandLoader } from "../../ui/brand";
import { Button } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { ClientSectionReview } from "../design/ClientSectionReview";
import { ClientDrawingReview } from "../estimates/ClientDrawingReview";
import { ClientPlanReview } from "../estimates/ClientPlanReview";
import { useClientProjectEstimates } from "./ClientProjectEstimatePanel";
import { ProjectCardHeader } from "./ProjectDetailOverview";
import { projectDetailTheme } from "./projectDetailTheme";

const statusLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/** Estimate plans and project sections are different review streams, both scoped by stable IDs. */
export function ClientProjectDesignPanel({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const { allowed, query, estimates } = useClientProjectEstimates(projectId, session);
  const canReadPlans = canPerformOperation(session, "GET /client/estimates/:estimateId/plan-review");
  const canReadDrawings = canPerformOperation(session, "GET /client/estimates/:estimateId/design-drawings");
  const canReadSections = canPerformOperation(session, "GET /client/projects/:projectId/design-sections");
  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const showEstimateDesign = allowed && (canReadPlans || canReadDrawings);
  if (!showEstimateDesign && !canReadSections) return null;
  return (
    <View testID="client-project-designs" style={styles.stack}>
      {showEstimateDesign ? (
        <View style={styles.card}>
          <ProjectCardHeader glyph="image" title="Design plans" subtitle="Uploaded plans and drawing reviews linked to this project" />
          <View style={styles.body}>
            {query.isPending ? <BrandLoader label="Loading linked design plans" tone="dark" /> : null}
            {query.isError ? (
              <View style={styles.notice}>
                <Text accessibilityLiveRegion="assertive" style={styles.copy}>{denied ? "Linked design plans are unavailable for this account." : "Linked design plans could not be loaded."}</Text>
                {!denied ? <View style={styles.action}><Button label="Retry design plans" variant="secondary" onPress={() => void query.refetch()} /></View> : null}
              </View>
            ) : null}
            {!query.isPending && !query.isError && estimates.length === 0 ? <Text style={styles.copy}>No estimate is linked to this project yet. Uploaded plans will appear here when the design team submits them.</Text> : null}
            {estimates.map((estimate) => (
              <View key={estimate.id} style={styles.estimate}>
                <View style={styles.heading}>
                  <Text accessibilityRole="header" style={styles.title}>{estimate.lead?.projectName || "Project estimate"}</Text>
                  <Text style={styles.meta}>Estimate {estimate.id} · {statusLabel(estimate.status)}</Text>
                </View>
                {canReadPlans ? <ClientPlanReview estimate={estimate} session={session} /> : null}
                {canReadDrawings ? <ClientDrawingReview estimate={estimate} session={session} /> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {canReadSections ? <ClientSectionReview projectId={projectId} session={session} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: projectDetailTheme.blockGap, minWidth: 0 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: projectDetailTheme.cardRadius, backgroundColor: colors.surface, overflow: "hidden" },
  body: { gap: spacing.md, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  notice: { gap: spacing.sm },
  action: { alignSelf: "flex-start", minWidth: 140 },
  estimate: { gap: spacing.md, minWidth: 0, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: projectDetailTheme.innerRadius },
  heading: { gap: 3 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  meta: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 }
});
