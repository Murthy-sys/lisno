import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useScaffoldNavigationBlocked } from "../../navigation/AdaptiveAppScaffold";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { colors, fonts } from "../../ui/tokens";
import { createPerformanceApi, reportingMonth } from "../performance/performanceApi";
import { TasksWorkspace } from "../operations/TasksWorkspace";
import { ProcurementDashboard } from "./ProcurementDashboard";

export function ProcurementHome({ session }: { readonly session: AuthenticatedSession }) {
  const [section, setSection] = useState<"overview" | "tasks">("overview");
  const blocked = useScaffoldNavigationBlocked();
  return <View style={styles.home}>
    <View accessibilityRole="tablist" accessibilityLabel="Home sections" style={styles.homeTabs}>
      {(["overview", "tasks"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value === "overview" ? "Overview" : "My tasks"} accessibilityState={{ selected: section === value, disabled: blocked }} disabled={blocked} onPress={() => setSection(value)} style={[styles.homeTab, section === value && styles.homeTabSelected]}>
        <Text style={[styles.homeTabLabel, section === value && styles.homeTabLabelSelected]}>{value === "overview" ? "Overview" : "My tasks"}</Text>
      </Pressable>)}
    </View>
    {section === "overview" ? <ProcurementDashboard session={session} headerContent={<ProcurementHomePerformance session={session} />} /> : <TasksWorkspace session={session} />}
  </View>;
}

export function ProcurementHomePerformance({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const blocked = useScaffoldNavigationBlocked();
  const allowed = session.user.role === "procurement" && canPerformOperation(session, "GET /kpis/users/:userId");
  const period = reportingMonth(0);
  const api = useMemo(() => createPerformanceApi(context.runtime.api.authenticated), [context.runtime.api.authenticated]);
  const query = useQuery({
    queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "kpi", "personal", session.user.id, period.from, period.to, "overview"),
    queryFn: ({ signal }) => api.overview(session.user.id, period, signal),
    enabled: allowed && context.environment.status === "ready", retry: false
  });
  if (!allowed) return null;
  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const data = !denied && !query.isError ? query.data : undefined;
  return <View style={styles.performance} testID="procurement-home-performance">
    <View style={styles.performanceHeading}><Text accessibilityRole="header" style={styles.heading}>Your performance</Text><Text style={styles.period}>This month · UTC</Text></View>
    {data ? <>
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.score}>{data.score}<Text style={styles.scoreSuffix}> / 100</Text></Text><Text style={styles.label}>Calculated KPI</Text></View>
        <View style={styles.metric}><Text style={styles.value}>{data.aggregates.taskCounts.completed}<Text style={styles.scoreSuffix}> / {data.aggregates.taskCounts.total}</Text></Text><Text style={styles.label}>Tasks completed</Text></View>
      </View>
      <Text style={styles.note}>Based on recorded work. Manager evaluations remain separate.</Text>
    </> : <Text accessibilityLiveRegion="polite" style={styles.note}>{denied ? "Your current account cannot view this report." : query.isPending ? "Loading your performance…" : "Performance is unavailable. Retry to load this month’s report."}</Text>}
    <View style={styles.actions}>
      {query.isError && !denied ? <Pressable accessibilityRole="button" accessibilityLabel="Retry performance" onPress={() => void query.refetch()} style={styles.action}><Text style={styles.actionLabel}>Retry performance</Text></Pressable> : null}
      {!denied ? <Pressable accessibilityRole="button" accessibilityLabel="View performance report" accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={() => router.push("/feature/performance")} style={styles.action}><Text style={styles.actionLabel}>View report</Text></Pressable> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  home: { flex: 1 },
  homeTabs: { flexDirection: "row", gap: 16, marginHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  homeTab: { minHeight: 48, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent", justifyContent: "center" },
  homeTabSelected: { borderBottomColor: colors.primary },
  homeTabLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkMuted },
  homeTabLabelSelected: { color: colors.primary, fontFamily: fonts.semibold },
  performance: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: 12, gap: 8, borderRadius: 6 },
  performanceHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  heading: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 23, color: colors.ink },
  period: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 18, color: colors.inkMuted },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { flexGrow: 1, minWidth: 120, gap: 4 },
  score: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, color: colors.primary, fontVariant: ["tabular-nums"] },
  value: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, color: colors.ink, fontVariant: ["tabular-nums"] },
  scoreSuffix: { fontSize: 13, color: colors.inkMuted, fontFamily: fonts.regular },
  label: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 19, color: colors.inkMuted },
  note: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 18, color: colors.inkMuted },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  actionLabel: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 20, color: colors.primary }
});
