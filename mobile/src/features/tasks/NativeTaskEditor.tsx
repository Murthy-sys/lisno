import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button, CommandState, Copy, denied, Field, Panel, QueryState, Select, useDraftGuard, useNativeCommand, useNativeWorkspace, type NativeContext } from "../admin/nativeWorkspace";
import { canEditTask, findProjectTask, TASK_TRANSITIONS, taskSchema, taskUpdateInput, type NativeTask, type TaskStatus } from "./taskModel";

export function NativeTaskEditor({ task, session, onChanged }: { task: unknown; session: AuthenticatedSession; onChanged?: () => void | Promise<unknown> }) {
  const context = useNativeWorkspace(session, "tasks"); const parsed = taskSchema.safeParse(task);
  return parsed.success ? <TaskEditor key={`${context.scope}:${parsed.data.id}`} task={parsed.data} context={context} onChanged={onChanged} /> : <Copy error>Task controls are unavailable because its current identity or version is incomplete.</Copy>;
}
const time = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Unavailable";
function TaskEditor({ task, context: c, onChanged }: { task: NativeTask; context: NativeContext; onChanged?: (() => void | Promise<unknown>) | undefined }) {
  const [basis, setBasis] = useState(task); const [mode, setMode] = useState<"update" | "deadline" | null>(null);
  const [status, setStatus] = useState<TaskStatus>(task.status); const [progress, setProgress] = useState(String(task.progress));
  const [note, setNote] = useState(""); const [deadline, setDeadline] = useState(task.currentDeadlineAt ?? ""); const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false); const [loadError, setLoadError] = useState<unknown>(null);
  const command = useNativeCommand(async () => { await c.refresh(); await onChanged?.(); });
  const latest = useQuery({ queryKey: c.key("latest-note", task.id), queryFn: async ({ signal }) => z.object({ items: z.array(z.object({ id: z.string(), note: z.string().nullable().optional() })) }).parse(await c.http.get(`/tasks/${encodeURIComponent(task.id)}/events?sort=desc&limit=1&offset=0`, { signal })), enabled: c.ready && c.can("GET /tasks/:taskId/events") });
  const stale = task.version > basis.version || task.ownerId !== basis.ownerId;
  const dirty = mode === "update" ? status !== basis.status || progress !== String(basis.progress) || Boolean(note) : mode === "deadline" && (deadline !== basis.currentDeadlineAt || Boolean(reason));
  const close = useDraftGuard(dirty, command.locked || loading, c);
  const blocked = command.locked || loading || stale;
  const editable = canEditTask(task, c.session) && canEditTask(basis, c.session) && c.can("PATCH /tasks/:taskId");
  const canDeadline = task.status !== "completed" && basis.status !== "completed" && c.can("PATCH /tasks/:taskId/deadline");
  function reset(value: NativeTask) { setBasis(value); setStatus(value.status); setProgress(String(value.progress)); setNote(""); setDeadline(value.currentDeadlineAt ?? ""); setReason(""); setMode(null); }
  async function load() {
    if (command.busy || command.unknown || loading) return;
    setLoading(true); setLoadError(null);
    try { const value = findProjectTask(await c.http.get(`/projects/${encodeURIComponent(task.projectId)}`), task.projectId, task.id); reset(value); await command.reload(); }
    catch (error) { setLoadError(error); } finally { setLoading(false); }
  }
  function save() {
    if (blocked || (mode === "update" ? !editable : !canDeadline)) return;
    try {
      const path = `/tasks/${encodeURIComponent(basis.id)}${mode === "deadline" ? "/deadline" : ""}`;
      if (mode === "deadline" && (!reason.trim() || !Number.isFinite(Date.parse(deadline)))) throw new Error("Enter a valid deadline and the reason for changing it.");
      const body = mode === "deadline" ? { version: basis.version, currentDeadlineAt: new Date(deadline).toISOString(), reason: reason.trim() } : taskUpdateInput(basis, status, progress, note);
      void command.execute(() => c.http.patch(path, body), value => { const saved = taskSchema.parse(value); if (saved.id !== basis.id || saved.projectId !== basis.projectId || saved.version <= basis.version) throw new Error("The saved task could not be verified."); reset(saved); });
    } catch (error) { command.validation(error instanceof Error ? error.message : "Review the task values."); }
  }
  if (command.accessLost || denied(loadError) || denied(latest.error)) return <Copy error>This task is no longer available for your account.</Copy>;
  return <Panel title="Task details">
    {basis.description ? <Copy>{basis.description}</Copy> : null}
    {basis.risk ? <Copy>{basis.risk.reason}</Copy> : null}
    <Copy>Original deadline: {time(basis.originalDeadlineAt)}</Copy><Copy>Current deadline: {time(basis.currentDeadlineAt)}</Copy>
    <Copy>Planned effort: {basis.plannedEffort == null ? "Not estimated" : `${basis.plannedEffort} hours`} · Latest update: {time(basis.latestUpdateAt)}</Copy>
    {latest.data?.items[0]?.note && !latest.isError ? <Copy>Latest note: {latest.data.items[0].note}</Copy> : null}
    {latest.isError ? <QueryState query={latest} title="Task update history" /> : null}
    {stale ? <Copy error>This task changed. Load its latest version before editing.</Copy> : null}
    {loadError ? <Copy error>{loadError instanceof Error ? loadError.message : "The task could not be refreshed."}</Copy> : null}
    {!mode ? <View>{editable ? <Button label="Update task" variant="secondary" onPress={() => setMode("update")} disabled={blocked} /> : <Copy>{basis.status === "completed" ? "This task is complete." : basis.ownerId !== c.session.user.id ? "Assigned to teammate." : "Task updates are read-only for this account."}</Copy>}{canDeadline ? <Button label="Revise deadline" variant="quiet" onPress={() => setMode("deadline")} disabled={blocked} /> : null}</View> : <View>
      {mode === "update" ? <><Select label="Task status" value={status} options={TASK_TRANSITIONS[basis.status].map(value => ({ value, label: value.replaceAll("_", " ") }))} onChange={value => setStatus(value as TaskStatus)} disabled={blocked || !editable} /><Field label="Progress percentage" value={progress} onChangeText={setProgress} editable={!blocked && editable} keyboardType="decimal-pad" /><Field label={status === "blocked" ? "Blocking reason" : "Update note"} value={note} onChangeText={setNote} editable={!blocked && editable} multiline /></> : <><Field label="New deadline (ISO 8601)" value={deadline} onChangeText={setDeadline} editable={!blocked && canDeadline} /><Field label="Deadline revision reason" value={reason} onChangeText={setReason} editable={!blocked && canDeadline} multiline /></>}
      <Button label={mode === "update" ? "Save task" : "Save deadline"} onPress={save} disabled={blocked || !dirty} loading={command.busy} /><Button label="Discard task changes" variant="quiet" onPress={() => close(() => reset(basis))} disabled={command.locked || loading} />
    </View>}
    <CommandState command={{ ...command, reload: load }} />
    {stale && !command.conflict ? <Button label="Load latest task" variant="secondary" onPress={() => close(() => void load())} disabled={command.locked || loading} /> : null}
  </Panel>;
}
