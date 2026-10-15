import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { isRecord, recordTitle } from "../workspace/recordPresentation";
import { FloorCreateAction, StageCreateAction, TaskCreateAction } from "./HierarchyCreateActions";
import { DesignUploadAction } from "../design/DesignVersionWorkspace";
import { NativeTaskEditor } from "../tasks/NativeTaskEditor";
import { ProjectDetailPage } from "./ProjectDetailPage";
import { presentProjectDetail } from "./projectDetailModel";
import { projectDetailTheme } from "./projectDetailTheme";

function projectRecord(data: unknown): Record<string, unknown> | null { if (!isRecord(data)) return null; return isRecord(data.project) ? data.project : data; }
function records(value: unknown): readonly Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : []; }

export function ProjectStructure({ data, session, onRefresh, initialTab }: { readonly data: unknown; readonly session: AuthenticatedSession; readonly onRefresh: () => void; readonly initialTab?: string | undefined }) {
  const project = projectRecord(data);
  const detail = presentProjectDetail(data, session.user.role);
  if (!project || !detail) return null;
  const floors = records(project.floors);
  const estimate = isRecord(project.estimate) ? project.estimate : null;
  const assignedDesigner = estimate && isRecord(estimate.designPlanDesigner) ? estimate.designPlanDesigner : null;
  const designAssignment = { estimateStatus: typeof estimate?.status === "string" ? estimate.status : null, designPlanStatus: typeof estimate?.designPlanStatus === "string" ? estimate.designPlanStatus : null, assignedDesignerId: typeof assignedDesigner?.id === "string" ? assignedDesigner.id : null };
  const tasksPanel = (
    <View testID="project-structure-panel" style={styles.panel}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Floors, stages and tasks</Text>
        <Text style={styles.copy}>Progress, ownership and deadlines come from the project hierarchy.</Text>
      </View>
      {typeof project.id === "string" ? <FloorCreateAction projectId={project.id} session={session} /> : null}
      {floors.length === 0 ? <Text style={styles.copy}>No project structure is available for this account.</Text> : floors.map((floor, floorIndex) => (
        <View key={typeof floor.id === "string" ? floor.id : `floor-${floorIndex}`} style={styles.floor}>
          <Text style={styles.floorTitle}>{recordTitle(floor, floorIndex)}</Text>
          {typeof floor.id === "string" ? <StageCreateAction floorId={floor.id} session={session} /> : null}
          {records(floor.stages).map((stage, stageIndex) => (
            <View key={typeof stage.id === "string" ? stage.id : `stage-${stageIndex}`} style={styles.stage}>
              <Text style={styles.stageTitle}>{recordTitle(stage, stageIndex)}</Text>
              {typeof stage.id === "string" ? <TaskCreateAction stageId={stage.id} session={session} /> : null}
              {records(stage.tasks).map((task, taskIndex) => (
                <View key={typeof task.id === "string" ? task.id : `task-${taskIndex}`} style={styles.task}>
                  <Text style={styles.taskTitle}>{recordTitle(task, taskIndex)}</Text>
                  <Text style={styles.copy}>{typeof task.status === "string" ? task.status.replaceAll("_", " ") : "Status unavailable"} · {typeof task.progress === "number" ? `${task.progress}%` : "Progress unavailable"}</Text>
                  <NativeTaskEditor task={task} session={session} onChanged={onRefresh} />
                  {typeof task.id === "string" ? <DesignUploadAction taskId={task.id} session={session} /> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
  return <ProjectDetailPage detail={detail} session={session} onRefresh={onRefresh} tasksPanel={tasksPanel} initialTab={initialTab} designAssignment={designAssignment} />;
}

/** Operational containers follow the project detail page: paper surface, thin border, card radius, olive headings. */
const PANEL_RADIUS = projectDetailTheme.cardRadius;

const styles = StyleSheet.create({
  panel: { gap: spacing.sm, padding: spacing.md, minWidth: 0, borderRadius: PANEL_RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heading: { gap: spacing.xxs },
  sectionTitle: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  label: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 11, textTransform: "uppercase" },
  floor: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  floorTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  stage: { gap: spacing.xs, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.primary },
  stageTitle: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  task: { padding: spacing.sm, gap: spacing.xs, borderRadius: projectDetailTheme.innerRadius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
  taskTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  editor: { gap: spacing.sm, paddingTop: spacing.sm },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  option: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong },
  optionSelected: { backgroundColor: colors.midnight },
  optionText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 10, textTransform: "capitalize" },
  optionTextSelected: { color: colors.surface },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 }
});
