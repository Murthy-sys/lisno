import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { StateView } from "../../ui/primitives";
import { colors, fonts, radii, spacing, typography } from "../../ui/tokens";
import { formatDashboardPaise } from "../dashboard/data/formatters";
import { ProcurementSubnavigation } from "./ProcurementSubnavigation";
import { parseProcurementDashboardProjects, type ProcurementDashboardProject } from "./procurementDashboardModel";

export function ProcurementDashboard({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const allowed = session.user.role === "procurement" && canPerformOperation(session, "GET /procurement/projects");
  const query = useQuery({
    queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "procurement", "projects"),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<unknown>("/procurement/projects", { signal }),
    enabled: allowed && context.environment.status === "ready"
  });

  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const projects = query.data === undefined ? null : parseProcurementDashboardProjects(query.data);

  return <ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>PROJECT PROCUREMENT</Text>
      <Text accessibilityRole="header" style={styles.title}>Procurement</Text>
      <Text style={styles.description}>Open a project to view estimate budgets and manage procurements.</Text>
    </View>
    <ProcurementSubnavigation session={session} active="dashboard" />
    {!allowed || denied ? <StateView tone="denied" title="Procurement unavailable" message="Your current account cannot view these projects." />
      : query.isPending ? <View style={styles.center}><BrandLoader label="Loading procurement projects" tone="dark" /></View>
      : query.isError && !query.data ? <StateView tone="error" title="Procurement projects could not be loaded" message="Check your connection and try again." actionLabel="Retry" onAction={() => void query.refetch()} />
      : projects === null ? <StateView tone="error" title="Procurement amounts need review" message="Project identities or amounts could not be verified. Refresh before using these totals." actionLabel="Refresh procurement" onAction={() => void query.refetch()} />
      : <>
        {query.isRefetchError ? <StateView tone="error" title="Could not refresh projects" message="The displayed projects may be out of date." actionLabel="Retry refresh" onAction={() => void query.refetch()} /> : null}
        {query.isRefetching ? <Text accessibilityLiveRegion="polite" style={styles.updating}>Updating projects…</Text> : null}
        {projects.length === 0 ? <StateView title="No procurement projects" message="Projects appear here after their Design plan is approved." />
          : <View style={styles.list} accessibilityLabel="Design-approved projects">
            {projects.map((project) => <ProjectCard key={project.projectId} project={project} />)}
          </View>}
      </>}
  </ScrollView>;
}

function ProjectCard({ project }: { readonly project: ProcurementDashboardProject }) {
  const sectionLabel = `${project.selectedSectionCount} selected Estimate ${project.selectedSectionCount === 1 ? "section" : "sections"}`;
  return <Pressable testID={`procurement-project-${project.projectId}`} accessibilityRole="button"
    accessibilityLabel={`Open ${project.projectName}. Estimate version ${project.estimateVersion}. ${sectionLabel}. Design approved. Selected estimate value ${formatDashboardPaise(project.selectedValuePaise)}. Recorded spend ${formatDashboardPaise(project.recordedSpendPaise)}. Remaining selected value ${formatDashboardPaise(project.remainingValuePaise)}.`}
    onPress={() => router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "procurement", recordId: project.projectId } })}
    style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}>
    <Text style={styles.version}>ESTIMATE V{project.estimateVersion}</Text>
    <Text style={styles.projectName}>{project.projectName}</Text>
    <Text style={styles.sectionCount}>{sectionLabel}</Text>
    <Text style={styles.approved}>Design approved</Text>
    <View style={styles.amounts}>
      <Amount label="Selected estimate value" amount={project.selectedValuePaise} />
      <Amount label="Recorded spend" amount={project.recordedSpendPaise} />
      <Amount label="Remaining selected value" amount={project.remainingValuePaise} />
    </View>
    <Text style={styles.viewProject}>View project</Text>
  </Pressable>;
}

function Amount({ label, amount }: { readonly label: string; readonly amount: number }) {
  return <View style={styles.amount}>
    <Text style={styles.amountLabel}>{label}</Text>
    <Text style={styles.amountValue}>{formatDashboardPaise(amount)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, width: "100%", maxWidth: 980, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg },
  heading: { gap: spacing.xs },
  eyebrow: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.2 },
  title: { color: colors.ink, ...typography.pageTitle },
  description: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
  center: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  updating: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 12 },
  list: { gap: spacing.md },
  card: { minHeight: 180, padding: spacing.lg, borderRadius: radii.surface, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.xs },
  pressed: { opacity: 0.72 },
  version: { color: colors.inkMuted, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.9 },
  projectName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 27 },
  sectionCount: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14 },
  approved: { alignSelf: "flex-start", overflow: "hidden", color: colors.success, backgroundColor: colors.successSoft, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, fontFamily: fonts.semibold, fontSize: 12 },
  amounts: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  amount: { minWidth: 120, flexGrow: 1, gap: spacing.xxs },
  amountLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11 },
  amountValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, fontVariant: ["tabular-nums"] },
  viewProject: { alignSelf: "flex-start", color: colors.primary, fontFamily: fonts.semibold, fontSize: 13, marginTop: spacing.xs }
});
