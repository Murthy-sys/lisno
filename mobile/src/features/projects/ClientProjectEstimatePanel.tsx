import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { clientEstimateListKey, getClientEstimates } from "../estimates/clientReviewApi";
import { estimatesForProject } from "../estimates/clientReviewModel";
import { ProjectCardHeader } from "./ProjectDetailOverview";
import { projectDetailTheme } from "./projectDetailTheme";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const statusLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/** Estimate IDs are resolved from the Client's own list; the project payload contains no Client estimate. */
export function useClientProjectEstimates(projectId: string, session: AuthenticatedSession) {
  const context = useConfiguredRuntime();
  const allowed = session.user.role === "client" && canPerformOperation(session, "GET /client/estimates");
  const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  const query = useQuery({
    queryKey: clientEstimateListKey(scope),
    queryFn: ({ signal }) => getClientEstimates(context.runtime, signal),
    enabled: allowed
  });
  return { allowed, query, estimates: estimatesForProject(query.data ?? [], projectId) };
}

export function ClientProjectEstimatePanel({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const { allowed, query, estimates } = useClientProjectEstimates(projectId, session);
  if (!allowed) return null;
  let content;
  if (query.isPending) content = <BrandLoader label="Loading project estimates" tone="dark" />;
  else if (query.isError && !query.data) {
    const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
    content = <View style={styles.stack}><Text accessibilityLiveRegion="assertive" style={styles.copy}>{denied ? "Project estimates are unavailable for this account." : "Project estimates could not be loaded."}</Text>{!denied ? <Button label="Retry estimates" variant="secondary" onPress={() => void query.refetch()} /> : null}</View>;
  } else {
    content = estimates.length === 0 ? <Text style={styles.copy}>No estimate is linked to this project yet.</Text> : estimates.map((estimate) => (
      <View key={estimate.id} style={styles.estimate}>
        <View style={styles.row}><View style={styles.identity}><Text style={styles.name}>{estimate.lead?.projectName || "Project estimate"}</Text><Text style={styles.copy}>{statusLabel(estimate.status)}</Text></View><Text style={styles.amount}>{money.format(estimate.total)}</Text></View>
        <Text style={styles.copy}>Estimate total, including GST</Text>
        <Button label={`Open estimate ${estimate.id}`} variant="secondary" onPress={() => router.push({ pathname: "/estimate/[estimateId]", params: { estimateId: estimate.id } })} />
      </View>
    ));
  }
  return <View testID="client-project-estimation" style={styles.card}><ProjectCardHeader glyph="calculator" title="Estimation" subtitle="Published estimates and Client decisions" /><View style={styles.body}>{content}</View></View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: projectDetailTheme.cardRadius, backgroundColor: colors.surface, overflow: "hidden" },
  body: { padding: spacing.md, gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stack: { gap: spacing.sm },
  estimate: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: projectDetailTheme.innerRadius },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  identity: { flexGrow: 1, flexShrink: 1, minWidth: 120, gap: 2 },
  name: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  amount: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 17 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }
});
