import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { colors, fonts } from "../../ui/tokens";
import { DesignVersionWorkspace } from "../design/DesignVersionWorkspace";
import { WorkflowWorkspace } from "../workflows/WorkflowWorkspace";
import { ClientProjectDesignPanel } from "./ClientProjectDesignPanel";
import { ClientProjectDocuments } from "./ClientProjectDocuments";
import { ClientProjectEstimatePanel } from "./ClientProjectEstimatePanel";
import { ProjectDetailHeader } from "./ProjectDetailHeader";
import { ProjectDetailSections, ProjectEstimatePanel, ProjectTeamPanel } from "./ProjectDetailOverview";
import { ProjectSummaryCard, ProjectValueCard } from "./ProjectDetailSummary";
import { ProjectDocuments, type ProjectDocumentsEstimate } from "./ProjectDocuments";
import { ProjectDetailGlyph, type ProjectDetailGlyphName } from "./projectDetailIcons";
import type { ProjectDetailPresentation } from "./projectDetailModel";
import { projectDetailTheme } from "./projectDetailTheme";

export type ProjectTabKey = "information" | "estimation" | "designs" | "documents" | "team" | "tasks";

const TABS: readonly { readonly key: ProjectTabKey; readonly label: string; readonly glyph: ProjectDetailGlyphName }[] = [
  { key: "information", label: "Information", glyph: "document" },
  { key: "estimation", label: "Estimation", glyph: "calculator" },
  { key: "designs", label: "Designs", glyph: "image" },
  { key: "documents", label: "Documents", glyph: "file" },
  { key: "team", label: "Team", glyph: "users" },
  { key: "tasks", label: "Tasks", glyph: "list" }
];

const DEFAULT_TAB: ProjectTabKey = "information";

function estimateDocument(detail: ProjectDetailPresentation): ProjectDocumentsEstimate | null {
  return detail.estimate?.id ? { id: detail.estimate.id, statusLabel: detail.estimate.statusLabel } : null;
}

/**
 * Tabs with a real source for this payload and session, in display order. Visibility is advisory:
 * the backend still authorizes every request the panels make.
 */
export function visibleProjectTabs(detail: ProjectDetailPresentation, session: AuthenticatedSession): readonly ProjectTabKey[] {
  const hasProject = detail.id !== null;
  const isClient = detail.kind === "client";
  const canReadDesigns = canPerformOperation(session, "GET /projects/:projectId/design-versions");
  const canReadWorkflow = session.authorization.permissions.includes("projects.design_workflow.read");
  const canReadClientEstimates = isClient && canPerformOperation(session, "GET /client/estimates");
  const canReadClientEstimateDesign = canReadClientEstimates && (
    canPerformOperation(session, "GET /client/estimates/:estimateId/plan-review") ||
    canPerformOperation(session, "GET /client/estimates/:estimateId/design-drawings")
  );
  const canReadClientSections = isClient && canPerformOperation(session, "GET /client/projects/:projectId/design-sections");
  const canExportEstimate = estimateDocument(detail) !== null && canPerformOperation(session, "GET /estimates/:estimateId/pdf");
  const canReadClientPdf = canReadClientEstimates && canPerformOperation(session, "GET /client/estimates/:estimateId/pdf");
  const visible: Record<ProjectTabKey, boolean> = {
    information: true,
    estimation: (detail.kind === "admin" && detail.estimate !== null) || (hasProject && canReadClientEstimates),
    designs: hasProject && (isClient ? canReadClientEstimateDesign || canReadClientSections || canReadWorkflow : canReadDesigns || canReadWorkflow),
    documents: hasProject && (canReadDesigns || canExportEstimate || canReadClientPdf),
    team: detail.people.length > 0,
    tasks: true
  };
  return TABS.filter((tab) => visible[tab.key]).map((tab) => tab.key);
}

function TabStrip({ tabs, selected, onSelect }: { readonly tabs: readonly ProjectTabKey[]; readonly selected: ProjectTabKey; readonly onSelect: (key: ProjectTabKey) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent} style={styles.strip}>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {TABS.filter((tab) => tabs.includes(tab.key)).map((tab) => {
          const active = tab.key === selected;
          return (
            <Pressable key={tab.key} testID={`project-tab-${tab.key}`} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: active }}
              onPress={() => onSelect(tab.key)} style={({ pressed }) => [styles.tab, active ? styles.tabActive : null, pressed && !active ? styles.tabPressed : null]}>
              <ProjectDetailGlyph name={tab.glyph} color={active ? colors.primary : colors.inkMuted} />
              <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>{tab.label}</Text>
              {active ? <View style={styles.tabUnderline} /> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/**
 * Header, summary and value cards, then tabbed panels. A panel mounts on its first visit and stays
 * mounted while hidden, so in-progress task and design edits survive switching tabs.
 */
export function ProjectDetailPage({ detail, session, onRefresh, tasksPanel, initialTab }: {
  readonly detail: ProjectDetailPresentation;
  readonly session: AuthenticatedSession;
  readonly onRefresh: () => void;
  readonly tasksPanel: ReactNode;
  readonly initialTab?: string | undefined;
}) {
  const tabs = visibleProjectTabs(detail, session);
  const requestedTab = TABS.find((tab) => tab.key === initialTab)?.key ?? DEFAULT_TAB;
  const [selected, setSelected] = useState<ProjectTabKey>(requestedTab);
  const [visited, setVisited] = useState<ReadonlySet<ProjectTabKey>>(() => new Set([requestedTab]));
  const current = tabs.includes(selected) ? selected : DEFAULT_TAB;
  const tabsKey = tabs.join(",");
  useEffect(() => {
    if (tabs.includes(requestedTab)) {
      setSelected(requestedTab);
      setVisited((previous) => previous.has(requestedTab) ? previous : new Set([...previous, requestedTab]));
    }
  }, [requestedTab, tabsKey]);
  useEffect(() => {
    if (current !== selected) setSelected(current);
  }, [current, selected]);
  // A tab that disappears is forgotten, so it mounts again only when it is opened again.
  useEffect(() => {
    const available = tabsKey.split(",");
    setVisited((previous) => [...previous].every((key) => available.includes(key)) ? previous : new Set([...previous].filter((key) => available.includes(key))));
  }, [tabsKey]);
  const select = (key: ProjectTabKey) => {
    setSelected(key);
    setVisited((previous) => previous.has(key) ? previous : new Set([...previous, key]));
  };

  const panel = (key: ProjectTabKey): ReactNode => {
    switch (key) {
      case "information": return <ProjectDetailSections sections={detail.sections} />;
      case "estimation": return detail.kind === "client" && detail.id ? <ClientProjectEstimatePanel projectId={detail.id} session={session} /> : detail.estimate ? <ProjectEstimatePanel estimate={detail.estimate} /> : null;
      case "designs": return detail.id ? (
        <View style={styles.stack}>
          {detail.kind === "client"
            ? <ClientProjectDesignPanel projectId={detail.id} session={session} />
            : <DesignVersionWorkspace projectId={detail.id} session={session} />}
          <WorkflowWorkspace projectId={detail.id} session={session} />
        </View>
      ) : null;
      case "documents": return detail.id ? detail.kind === "client"
        ? <ClientProjectDocuments projectId={detail.id} session={session} />
        : <ProjectDocuments projectId={detail.id} estimate={estimateDocument(detail)} session={session} /> : null;
      case "team": return <ProjectTeamPanel people={detail.people} />;
      case "tasks": return tasksPanel;
    }
  };

  return (
    <View testID="project-detail-page" style={styles.page}>
      <ProjectDetailHeader detail={detail} session={session} onRefresh={onRefresh} />
      <ProjectSummaryCard detail={detail} />
      <ProjectValueCard value={detail.value} />
      <TabStrip tabs={tabs} selected={current} onSelect={select} />
      {tabs.filter((key) => key === current || visited.has(key)).map((key) => {
        const hidden = key !== current;
        return (
          <View key={key} testID={`project-tab-panel-${key}`} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
            style={hidden ? styles.hidden : styles.panel}>
            {panel(key)}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: projectDetailTheme.blockGap, minWidth: 0 },
  stack: { gap: projectDetailTheme.blockGap, minWidth: 0 },
  panel: { minWidth: 0 },
  hidden: { display: "none" },
  strip: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  stripContent: { flexGrow: 1 },
  tabs: { flexGrow: 1, flexDirection: "row", gap: 4 },
  tab: {
    flexGrow: 1, minHeight: projectDetailTheme.touch + 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, borderTopLeftRadius: projectDetailTheme.innerRadius, borderTopRightRadius: projectDetailTheme.innerRadius,
    backgroundColor: colors.surface
  },
  tabActive: { backgroundColor: projectDetailTheme.valueTint, borderColor: projectDetailTheme.valueBorder },
  tabPressed: { backgroundColor: colors.surfaceMuted },
  tabLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  tabLabelActive: { color: colors.ink, fontFamily: fonts.semibold },
  tabUnderline: { position: "absolute", left: 10, right: 10, bottom: 0, height: 2, borderRadius: 1, backgroundColor: colors.primary }
});
