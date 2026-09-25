import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { isRecord, recordTitle } from "../workspace/recordPresentation";
import { FloorCreateAction, StageCreateAction, TaskCreateAction } from "./HierarchyCreateActions";
import { DesignUploadAction, DesignVersionWorkspace } from "../design/DesignVersionWorkspace";
import { WorkflowWorkspace } from "../workflows/WorkflowWorkspace";
import { ProjectDetailLayout } from "./ProjectDetailOverview";
import { presentProjectDetail } from "./projectDetailModel";

type TaskStatus = "not_started" | "in_progress" | "in_review" | "blocked" | "completed";
const TASK_STATUSES: readonly TaskStatus[] = ["not_started", "in_progress", "in_review", "blocked", "completed"];

function projectRecord(data: unknown): Record<string, unknown> | null { if (!isRecord(data)) return null; return isRecord(data.project) ? data.project : data; }
function records(value: unknown): readonly Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : []; }

function TaskEditor({ task, session }: { readonly task: Record<string, unknown>; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime(); const invalidate = useInvalidateEvent(); const id = typeof task.id === "string" ? task.id : null; const version = typeof task.version === "number" ? task.version : null;
  const canUpdate = canPerformOperation(session, "PATCH /tasks/:taskId"); const canDeadline = canPerformOperation(session, "PATCH /tasks/:taskId/deadline");
  const currentProgress = typeof task.progress === "number" ? task.progress : 0; const currentStatus = TASK_STATUSES.includes(task.status as TaskStatus) ? task.status as TaskStatus : "not_started";
  const [mode, setMode] = useState<"update" | "deadline" | null>(null); const [progress, setProgress] = useState(String(currentProgress)); const [status, setStatus] = useState<TaskStatus>(currentStatus); const [note, setNote] = useState(""); const [deadline, setDeadline] = useState(typeof task.currentDeadlineAt === "string" ? task.currentDeadlineAt : ""); const [reason, setReason] = useState(""); const [error, setError] = useState<string | null>(null);
  const update = useMutation({ mutationFn: () => context.runtime.api.authenticated.patch(`/tasks/${encodeURIComponent(id!)}`, { version, status, progress: Number(progress), ...(note.trim() ? { note: note.trim() } : {}) }), onSuccess: async () => { setMode(null); await invalidate("task-changed"); }, onError: (cause) => setError(cause instanceof ApiError && cause.status === 409 ? "This task changed. Refresh the project before editing again." : cause instanceof ApiError ? cause.message : "The task could not be updated.") });
  const revise = useMutation({ mutationFn: () => context.runtime.api.authenticated.patch(`/tasks/${encodeURIComponent(id!)}/deadline`, { version, currentDeadlineAt: new Date(deadline).toISOString(), reason: reason.trim() }), onSuccess: async () => { setMode(null); await invalidate("task-changed"); }, onError: (cause) => setError(cause instanceof ApiError && cause.status === 409 ? "This task changed. Refresh before revising its deadline." : cause instanceof ApiError ? cause.message : "The deadline could not be revised.") });
  if (!id || !version || (!canUpdate && !canDeadline)) return null;
  if (mode === "update") return <View style={styles.editor}><Text style={styles.label}>Status</Text><View style={styles.options}>{TASK_STATUSES.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: status === value }} onPress={() => setStatus(value)} style={[styles.option, status === value ? styles.optionSelected : null]}><Text style={[styles.optionText, status === value ? styles.optionTextSelected : null]}>{value.replaceAll("_", " ")}</Text></Pressable>)}</View><Field label="Progress percentage" value={progress} onChangeText={setProgress} keyboardType="number-pad" /><Field label="Update note (optional)" value={note} onChangeText={setNote} multiline />{error ? <Text style={styles.error}>{error}</Text> : null}<View style={styles.actions}><View style={styles.action}><Button label="Cancel" variant="quiet" disabled={update.isPending} onPress={() => setMode(null)} /></View><View style={styles.action}><Button label="Save task" loading={update.isPending} onPress={() => { const amount = Number(progress); if (!Number.isFinite(amount) || amount < 0 || amount > 100) setError("Enter progress from 0 to 100."); else update.mutate(); }} /></View></View></View>;
  if (mode === "deadline") return <View style={styles.editor}><Text style={styles.copy}>Original deadline: {typeof task.originalDeadlineAt === "string" ? new Date(task.originalDeadlineAt).toLocaleString() : "Unavailable"}. It remains in the immutable task history.</Text><Field label="New deadline (ISO 8601)" value={deadline} onChangeText={setDeadline} /><Field label="Reason" value={reason} onChangeText={setReason} multiline />{error ? <Text style={styles.error}>{error}</Text> : null}<View style={styles.actions}><View style={styles.action}><Button label="Cancel" variant="quiet" disabled={revise.isPending} onPress={() => setMode(null)} /></View><View style={styles.action}><Button label="Save deadline" loading={revise.isPending} disabled={!reason.trim() || Number.isNaN(new Date(deadline).getTime())} onPress={() => revise.mutate()} /></View></View></View>;
  return <View style={styles.actions}>{canUpdate ? <View style={styles.action}><Button label="Update task" variant="secondary" onPress={() => setMode("update")} /></View> : null}{canDeadline ? <View style={styles.action}><Button label="Revise deadline" variant="quiet" onPress={() => setMode("deadline")} /></View> : null}</View>;
}

export function ProjectStructure({ data, session, onRefresh }: { readonly data: unknown; readonly session: AuthenticatedSession; readonly onRefresh: () => void }) {
  const project = projectRecord(data);
  const detail = presentProjectDetail(data, session.user.role);
  if (!project || !detail) return null;
  const floors = records(project.floors);
  return (
    <ProjectDetailLayout detail={detail}>
      <View style={styles.operations}>
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
                      <TaskEditor task={task} session={session} />
                      {typeof task.id === "string" ? <DesignUploadAction taskId={task.id} session={session} /> : null}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
        {typeof project.id === "string" ? <DesignVersionWorkspace projectId={project.id} session={session} /> : null}
        {typeof project.id === "string" ? <WorkflowWorkspace projectId={project.id} session={session} /> : null}
        <Button label="Refresh project" variant="secondary" onPress={onRefresh} />
      </View>
    </ProjectDetailLayout>
  );
}

/** Operational containers follow the project detail page: paper surface, thin border, small radius, olive headings. */
const PANEL_RADIUS = 4;

const styles = StyleSheet.create({
  operations: { gap: spacing.lg, minWidth: 0 },
  panel: { gap: spacing.sm, padding: spacing.md, minWidth: 0, borderRadius: PANEL_RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heading: { gap: spacing.xxs },
  sectionTitle: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  label: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 11, textTransform: "uppercase" },
  floor: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  floorTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  stage: { gap: spacing.xs, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.primary },
  stageTitle: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  task: { padding: spacing.sm, gap: spacing.xs, borderRadius: PANEL_RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
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
