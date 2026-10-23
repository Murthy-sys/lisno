import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, StateView } from "../../ui/primitives";
import { colors, fonts, spacing, typography } from "../../ui/tokens";
import { formatDashboardPaise } from "../dashboard/data/formatters";
import { uniqueProjects } from "../projects/projectsModel";
import { ProcurementGalleryCard } from "./ProcurementGalleryCard";
import { ProcurementSubnavigation } from "./ProcurementSubnavigation";
import { filterProcurementProjects, parseProcurementDashboardProjects, procurementGalleryProjects, procurementPortfolioSelectedTotal,
  procurementStatusLabels, type ProcurementStatusFilter } from "./procurementDashboardModel";
import { useProcurementAssignedProjects } from "./useProcurementAssignedProjects";

const statusFilters: readonly ProcurementStatusFilter[] = ["all", "open", "in_progress", "completed", "awaiting_preparation"];
const readDenied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);

export function ProcurementDashboard({ session, headerContent }: {
  readonly session: AuthenticatedSession;
  readonly headerContent?: ReactNode;
}) {
  const context = useConfiguredRuntime();
  const { fontScale } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProcurementStatusFilter>("all");
  const searchInput = useRef<TextInput>(null);
  const allowed = session.user.role === "procurement" && canPerformOperation(session, "GET /procurement/projects");
  const canOpenAssigned = canPerformOperation(session, "GET /projects/:projectId");
  const query = useQuery({
    queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "procurement", "projects"),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<unknown>("/procurement/projects", { signal }),
    enabled: allowed && context.environment.status === "ready"
  });
  const assigned = useProcurementAssignedProjects(session, allowed);
  const denied = readDenied(query.error);
  const assignedDenied = readDenied(assigned.query.error);
  const projects = allowed && !denied && query.data !== undefined ? parseProcurementDashboardProjects(query.data) : null;
  const assignedPages = assigned.canRead && !assignedDenied ? assigned.query.data?.pages ?? [] : [];
  const assignedProjects = uniqueProjects(assignedPages);
  const assignedAvailable = assigned.canRead && !assignedDenied && assigned.query.data !== undefined;
  const preparationKnown = projects !== null && !query.isError;
  const entries = allowed ? procurementGalleryProjects(projects ?? [], assignedProjects) : [];
  const filtered = filterProcurementProjects(entries, search, status, preparationKnown);
  const selectedTotal = projects === null ? null : procurementPortfolioSelectedTotal(projects);
  const additionalCount = entries.filter((entry) => entry.kind === "assigned").length;
  const assignedTotal = assignedPages.at(-1)?.pagination.total;
  const assignedPartial = assigned.canRead && (!assignedAvailable || Boolean(assigned.query.hasNextPage) || assignedTotal !== assignedProjects.length || assigned.query.isError);
  const partial = !preparationKnown || assignedPartial;
  const showPortfolio = allowed && (projects !== null || assignedAvailable);
  const filtering = search.trim() !== "" || status !== "all";
  const refreshing = (allowed && query.isRefetching) || (assigned.canRead && assigned.query.isRefetching && !assigned.query.isFetchingNextPage);
  const resetFilters = () => { setSearch(""); setStatus("all"); searchInput.current?.focus(); };
  const refresh = () => {
    if (allowed) void query.refetch();
    if (assigned.canRead) void assigned.query.refetch();
  };

  return <FlatList testID="procurement-gallery" data={filtered} keyExtractor={(entry) => entry.id}
    onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
    contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} enabled={allowed} tintColor={colors.primary} />}
    ItemSeparatorComponent={() => <View style={styles.cardGap} />}
    renderItem={({ item }) => <ProcurementGalleryCard entry={item} preparationKnown={preparationKnown} wide={contentWidth >= 760 && fontScale <= 1.2}
      canOpen={item.kind === "prepared" || canOpenAssigned}
      onOpen={() => router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: item.kind === "prepared" ? "procurement" : "projects", recordId: item.id } })} />}
    ListHeaderComponent={<View style={styles.header}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>PROJECT PROCUREMENT</Text>
        <Text accessibilityRole="header" style={styles.title}>Procurement</Text>
        <Text style={styles.description}>Your projects, from preparation to delivery.</Text>
      </View>
      {headerContent}
      <ProcurementSubnavigation session={session} active="dashboard" />
      {!allowed ? <StateView tone="denied" title="Procurement unavailable" message="Your current account cannot view these projects." /> : <>
        {denied ? <StateView tone="denied" title="Procurement unavailable" message="Procurement preparation is unavailable to this account. Independently authorized project details are shown below." />
          : query.isPending ? <View style={styles.loading}><BrandLoader label="Loading procurement projects" tone="dark" /></View>
          : query.isError && !query.data ? <StateView tone="error" title="Procurement projects could not be loaded" message="Assigned project details remain available separately." actionLabel="Retry" onAction={() => void query.refetch()} />
          : projects === null ? <StateView tone="error" title="Procurement amounts need review" message="Project identities or amounts could not be verified. Refresh before using these totals." actionLabel="Refresh procurement" onAction={() => void query.refetch()} />
          : query.isRefetchError ? <StateView tone="error" title="Could not refresh procurement" message="Prepared projects and amounts show the last loaded results. Preparation status for other projects is unavailable." actionLabel="Retry refresh" onAction={() => void query.refetch()} /> : null}
        {assigned.canRead && assignedDenied ? <StateView tone="denied" title="Assigned projects unavailable" message="Your current session cannot access assigned project details." />
          : assigned.canRead && assigned.query.isPending ? <Text accessibilityLiveRegion="polite" style={styles.scope}>Loading assigned project details…</Text>
          : assigned.canRead && assigned.query.isError ? <StateView tone="error" title="Assigned projects could not be loaded" message={assignedAvailable ? "Showing previously loaded assigned projects. Procurement preparation is available separately." : "Procurement preparation is available separately."}
            actionLabel="Retry assigned projects" onAction={() => void assigned.query.refetch()} /> : null}
        {showPortfolio ? <>
          <View style={styles.summary} accessibilityLabel="Procurement portfolio summary">
            <View style={styles.summaryCount}>
              <Text style={styles.summaryLabel}>{partial ? "Loaded projects" : "Total projects"}</Text>
              <Text testID="procurement-project-count" style={styles.summaryNumber}>{entries.length}</Text>
            </View>
            <View style={styles.summaryValue}>
              <Text style={styles.summaryLabel}>Total selected value</Text>
              <Text testID="procurement-selected-total" style={styles.summaryAmount}>{selectedTotal === null ? "Unavailable" : formatDashboardPaise(selectedTotal)}</Text>
            </View>
          </View>
          <Text style={styles.scope}>{additionalCount > 0 ? "Project count includes assigned projects. " : ""}Selected value covers available procurement preparation and does not change with filters.{assignedPartial ? ` Assigned project coverage is partial${assignedTotal !== undefined ? ` (${assignedProjects.length} of ${assignedTotal} loaded)` : ""}.` : ""}{!preparationKnown ? " Procurement preparation is not current." : ""}</Text>
          {projects !== null && selectedTotal === null ? <Text accessibilityRole="alert" style={styles.error}>The selected total exceeds the supported amount range. Individual project values remain available.</Text> : null}
          {refreshing ? <Text accessibilityLiveRegion="polite" style={styles.scope}>Updating projects…</Text> : null}
          <View style={styles.search}>
            <Svg width={19} height={19} viewBox="0 0 24 24" accessible={false}><Circle cx={10} cy={10} r={6.5} fill="none" stroke={colors.inkMuted} strokeWidth={1.6} /><Path d="m15 15 6 6" stroke={colors.inkMuted} strokeWidth={1.6} /></Svg>
            <TextInput ref={searchInput} accessibilityLabel="Search projects" value={search} onChangeText={setSearch} placeholder="Search projects" placeholderTextColor={colors.inkMuted}
              autoCorrect={false} returnKeyType="search" style={styles.searchInput} />
            {search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setSearch(""); searchInput.current?.focus(); }} style={styles.clearSearch}>
              <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}><Path d="m6 6 12 12M18 6 6 18" fill="none" stroke={colors.inkMuted} strokeWidth={1.6} /></Svg>
            </Pressable> : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Project status">
            {statusFilters.map((filter) => <Pressable key={filter} accessibilityRole="radio" accessibilityLabel={`Show ${procurementStatusLabels[filter].toLowerCase()} projects`}
              accessibilityState={{ checked: status === filter }} onPress={() => setStatus(filter)}
              style={[styles.filter, status === filter ? styles.filterSelected : null]}>
              <Text style={[styles.filterText, status === filter ? styles.filterTextSelected : null]}>{procurementStatusLabels[filter]}</Text>
            </Pressable>)}
          </ScrollView>
          <View style={styles.listCaption}>
            <Text accessibilityRole="header" style={styles.listTitle}>Project portfolio</Text>
            <Text accessibilityLiveRegion="polite" style={styles.resultCount}>{filtering ? `${filtered.length} of ${entries.length}` : entries.length} {partial ? "loaded projects" : "projects"}</Text>
          </View>
        </> : null}
      </>}
    </View>}
    ListEmptyComponent={showPortfolio ? <StateView title={filtering ? "No matching projects" : "No procurement projects"}
      message={filtering ? `No ${partial ? "loaded " : ""}projects match your search and status filters.${assigned.query.hasNextPage ? " Load more assigned projects to widen the results." : ""}` : "Projects appear when you are assigned or procurement preparation becomes available."}
      {...(filtering ? { actionLabel: "Reset filters", onAction: resetFilters } : {})} /> : null}
    ListFooterComponent={assigned.canRead && !assignedDenied && assignedAvailable ? <View style={styles.footer}>
      {assigned.query.isFetchNextPageError ? <Text accessibilityRole="alert" style={styles.error}>More assigned projects could not be loaded. Current results remain available.</Text> : null}
      {assigned.query.hasNextPage ? <Button label={assigned.query.isFetchNextPageError ? "Retry loading assigned projects" : "Load more assigned projects"} variant="quiet"
        loading={assigned.query.isFetchingNextPage} disabled={assigned.query.isRefetching && !assigned.query.isFetchingNextPage} onPress={() => void assigned.query.fetchNextPage()} /> : null}
    </View> : null}
  />;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, width: "100%", maxWidth: 1080, alignSelf: "center", padding: spacing.md, paddingBottom: spacing.huge },
  header: { gap: spacing.sm, paddingBottom: spacing.sm },
  heading: { gap: 6 },
  eyebrow: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.8 },
  title: { color: colors.ink, ...typography.pageTitle },
  description: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 },
  loading: { minHeight: 130, alignItems: "center", justifyContent: "center" },
  summary: { flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 4 },
  summaryCount: { minWidth: 108, flexGrow: 1, padding: spacing.sm, gap: 6 },
  summaryValue: { minWidth: 190, flexGrow: 2, flexShrink: 1, padding: spacing.sm, gap: 6, backgroundColor: colors.primarySoft },
  summaryLabel: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 10, lineHeight: 17 },
  summaryNumber: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, fontVariant: ["tabular-nums"] },
  summaryAmount: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, fontVariant: ["tabular-nums"] },
  scope: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 17 },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 11, lineHeight: 18 },
  search: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingLeft: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4, backgroundColor: colors.surface },
  searchInput: { flex: 1, minWidth: 0, color: colors.ink, fontFamily: fonts.regular, fontSize: 13, paddingVertical: 13, paddingHorizontal: spacing.sm },
  clearSearch: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  filters: { gap: 7, paddingBottom: 2 },
  filter: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 11, justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 4 },
  filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 11, lineHeight: 20 },
  filterTextSelected: { color: colors.primaryInk },
  listCaption: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 3 },
  listTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  resultCount: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10 },
  cardGap: { height: 12 },
  footer: { paddingVertical: spacing.sm, gap: 8 }
});
