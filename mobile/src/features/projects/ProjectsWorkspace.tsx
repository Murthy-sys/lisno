import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { ScaffoldContentBack } from "../../navigation/AdaptiveAppScaffold";
import { BrandLoader } from "../../ui/brand";
import { Button, StateView } from "../../ui/primitives";
import { colors, fonts } from "../../ui/tokens";
import { FEATURE_DEFINITIONS } from "../workspace/featureDefinitions";
import { ProjectCard } from "./ProjectCard";
import { ProjectCreateAction } from "./ProjectCreateActions";
import { projectCounts, projectStatusLabels, uniqueProjects, type ProjectStatus } from "./projectsModel";
import { useProjects } from "./useProjects";

type ProjectFilter = "all" | ProjectStatus;
const filters: readonly ProjectFilter[] = ["all", "planning", "active", "on_hold", "completed"];
const filterLabel = (filter: ProjectFilter) => filter === "all" ? "All" : projectStatusLabels[filter];

function ProjectsHero() {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.hero}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.heroArtwork, { width: Math.min(width, 420) }]}>
        <Image source={require("../../../assets/brand/projects-architecture-reference.jpg")} style={styles.heroImage} resizeMode="stretch" />
      </View>
      <View style={styles.heroBack}><ScaffoldContentBack /></View>
      <View style={styles.heroCopy}>
        <Text style={styles.eyebrow}>PROJECTS</Text>
        <Text accessibilityRole="header" style={styles.title}>Projects</Text>
        <Text style={styles.description}>{FEATURE_DEFINITIONS.projects.description}</Text>
      </View>
    </View>
  );
}

export function ProjectsWorkspace({ session }: { readonly session: AuthenticatedSession }) {
  const query = useProjects(session);
  const { width, fontScale } = useWindowDimensions();
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const pages = query.data?.pages ?? [];
  const records = uniqueProjects(pages);
  const counts = projectCounts(records);
  const total = pages.at(-1)?.pagination.total ?? 0;
  const partialCounts = Boolean(pages.at(-1)?.pagination.hasMore || total !== records.length);
  const filtered = filter === "all" ? records : records.filter((project) => project.status === filter);
  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const unusable = denied || (query.isError && !query.data);
  const narrowSummary = width < 600 && fontScale > 1.25;
  const summaries = [
    { label: "Total projects", value: total, color: "#85a180", background: "#e7eee1" },
    { label: "Active", value: counts.active, color: "#60a871", background: "#dfecdb" },
    { label: "On hold", value: counts.on_hold, color: "#c79a55", background: "#f4e8d1" },
    { label: "Completed", value: counts.completed, color: "#638ba6", background: "#e1eaf0" }
  ];

  return (
    <FlatList
      testID="projects-list"
      data={unusable ? [] : filtered}
      keyExtractor={(project) => project.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
      ItemSeparatorComponent={() => <View style={styles.cardGap} />}
      renderItem={({ item }) => <ProjectCard project={item} onPress={() => router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "projects", recordId: item.id } })} />}
      ListHeaderComponent={<>
        <ProjectsHero />
        {!denied ? <View style={styles.creation}><ProjectCreateAction session={session} /></View> : null}
        {query.isPending ? <View style={styles.loading}><BrandLoader label="Loading projects" tone="dark" /></View> : unusable ? (
          <StateView tone={denied ? "denied" : "error"} title={denied ? "Projects are unavailable" : "Projects could not be loaded"}
            message={denied ? "Your current session cannot access these projects." : "Check your connection and try again."} actionLabel="Retry" onAction={() => void query.refetch()} />
        ) : <>
          {query.isRefetchError && !query.isFetchNextPageError ? <View style={styles.notice}>
            <Text accessibilityRole="alert" style={styles.noticeText}>Projects could not be refreshed. Showing the last loaded results.</Text>
            <Button label="Retry refresh" variant="quiet" onPress={() => void query.refetch()} />
          </View> : null}
          <View style={[styles.summary, narrowSummary ? styles.summaryWrap : null]}>
            {summaries.map((entry, index) => <View key={entry.label} accessible accessibilityLabel={`${entry.label}${partialCounts && index > 0 ? " in loaded projects" : ""}: ${entry.value}`}
              style={[styles.summaryItem, narrowSummary ? styles.summaryItemHalf : null, (narrowSummary ? index % 2 === 1 : index > 0) ? styles.summaryDivider : null]}>
              <Text style={styles.summaryValue}>{entry.value}</Text>
              <Text style={styles.summaryLabel}>{entry.label}</Text>
              <View style={[styles.summaryHalo, { backgroundColor: entry.background }]}>
                {index === 0 ? <Svg width={14} height={14} viewBox="0 0 20 20" accessible={false}><Path d="M3 7L10 3L17 7L10 11ZM3 11L10 15L17 11M3 15L10 19L17 15" fill="none" stroke={entry.color} strokeWidth={1.4} strokeLinejoin="round" /></Svg> : <View style={[styles.summaryDot, { backgroundColor: entry.color }]} />}
              </View>
            </View>)}
          </View>
          {partialCounts ? <Text style={styles.countScope}>Status counts cover {records.length} loaded projects of {total}. {query.hasNextPage ? "Load more for the remaining projects." : "Pull to refresh the current project totals."}</Text> : null}
          {query.isRefetching && !query.isFetchingNextPage ? <Text accessibilityLiveRegion="polite" style={styles.countScope}>Updating projects…</Text> : null}
          <View style={styles.listHeading}>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.listTitle}>{filter === "all" ? "Projects" : `${filterLabel(filter)} projects`} ({filtered.length})</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Filter projects. ${filterLabel(filter)}`} accessibilityState={{ expanded: filterOpen }} onPress={() => setFilterOpen(!filterOpen)} style={styles.filterButton}>
              <Text style={styles.filterLabel}>{filterLabel(filter)}</Text><Svg accessible={false} width={16} height={16} viewBox="0 0 20 20"><Path d={filterOpen ? "M5 12L10 7L15 12" : "M5 7L10 12L15 7"} fill="none" stroke={colors.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </Pressable>
          </View>
          {filterOpen ? <View accessibilityRole="radiogroup" accessibilityLabel="Project status" style={styles.filterOptions}>
            {[...filters, ...(counts.unknown ? ["unknown" as const] : [])].map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`Show ${filterLabel(option).toLowerCase()} projects`} accessibilityState={{ checked: filter === option }}
              onPress={() => { setFilter(option); setFilterOpen(false); }} style={[styles.filterOption, filter === option ? styles.filterOptionSelected : null]}>
              <Text style={[styles.filterLabel, filter === option ? styles.filterLabelSelected : null]}>{filterLabel(option)}</Text>
            </Pressable>)}
          </View> : null}
        </>}
      </>}
      ListEmptyComponent={!query.isPending && !unusable ? <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{filter === "all" ? "No projects yet" : `No ${filterLabel(filter).toLowerCase()} projects${partialCounts ? " in loaded results" : ""}`}</Text>
        <Text style={styles.emptyCopy}>{filter === "all" ? FEATURE_DEFINITIONS.projects.emptyMessage : partialCounts && query.hasNextPage ? "Load more projects or choose another status." : "Choose another status to see your projects."}</Text>
        {filter !== "all" ? <Button label="Show all projects" variant="quiet" onPress={() => setFilter("all")} /> : null}
      </View> : null}
      ListFooterComponent={!unusable && !query.isPending ? <View style={styles.footer}>
        {query.isFetchNextPageError ? <Text accessibilityRole="alert" style={styles.noticeText}>More projects could not be loaded. Your current results are still available.</Text> : null}
        {query.hasNextPage ? <Button label={query.isFetchNextPageError ? "Retry loading projects" : "Load more projects"} variant="quiet" loading={query.isFetchingNextPage} disabled={query.isRefetching && !query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
      </View> : null}
    />
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, width: "100%", maxWidth: 820, alignSelf: "center", paddingHorizontal: 16, paddingBottom: 28 },
  hero: { position: "relative", minHeight: 170, marginHorizontal: -16, paddingHorizontal: 16, paddingBottom: 8, overflow: "hidden" },
  heroArtwork: { position: "absolute", top: 0, right: 0, bottom: 0 },
  heroImage: { width: "100%", height: "100%", opacity: 0.94 },
  heroBack: { minHeight: 48, marginLeft: -6 },
  heroCopy: { paddingTop: 8, gap: 4, width: "68%", maxWidth: 520 },
  eyebrow: { fontFamily: fonts.medium, fontSize: 9, lineHeight: 14, letterSpacing: 2.1, color: colors.inkMuted },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.ink },
  description: { maxWidth: 310, fontFamily: fonts.regular, fontSize: 11, lineHeight: 18, color: colors.inkMuted },
  creation: { marginTop: 2, marginBottom: 12 },
  loading: { paddingVertical: 48, alignItems: "center" },
  summary: { flexDirection: "row", alignItems: "stretch", paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  summaryWrap: { flexWrap: "wrap", rowGap: 18 },
  summaryItem: { flex: 1, gap: 4, paddingHorizontal: 12, minWidth: 0 },
  summaryItemHalf: { flexBasis: "50%", flexGrow: 0, flexShrink: 0 },
  summaryDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  summaryValue: { color: colors.ink, fontFamily: fonts.medium, fontSize: 19, lineHeight: 25 },
  summaryLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 9, lineHeight: 15 },
  summaryHalo: { height: 19, width: 19, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 4 },
  summaryDot: { height: 11, width: 11, borderRadius: 6 },
  countScope: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 16, color: colors.inkMuted, marginTop: 8 },
  listHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18, marginBottom: 8 },
  listTitle: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 22, color: colors.ink },
  filterButton: { minHeight: 44, minWidth: 68, paddingHorizontal: 13, paddingVertical: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  filterLabel: { color: colors.ink, fontFamily: fonts.medium, fontSize: 11, lineHeight: 18 },
  filterOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 },
  filterOption: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterOptionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterLabelSelected: { color: colors.primaryInk },
  cardGap: { height: 12 },
  notice: { gap: 6, paddingVertical: 12 },
  noticeText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.danger },
  empty: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, padding: 22, gap: 10 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  emptyCopy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 19 },
  footer: { paddingVertical: 16, gap: 10 }
});
