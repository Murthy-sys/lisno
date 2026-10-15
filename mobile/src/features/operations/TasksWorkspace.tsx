import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { z } from "zod";
import { ROLE_CODES, ROLE_LABELS } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button, CommandState, Copy, denied, Field, Pager, Panel, QueryState, Select, useDraftGuard, useNativeCommand, useNativeWorkspace, Workspace, type NativeContext } from "../admin/nativeWorkspace";
import { ProjectStatusControl } from "../tasks/ProjectStatusControl";

export const operationalTaskSchema = z.object({
  id: z.string().min(1), projectId: z.string().min(1), projectName: z.string(), estimateId: z.string().min(1),
  kind: z.enum(["design_plan_upload", "procurement", "finance", "site_execution", "trade_execution"]),
  title: z.string(), description: z.string(), assigneeRole: z.enum(ROLE_CODES),
  assignedWorker: z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.enum(ROLE_CODES), active: z.boolean() }).nullable(),
  sourceSectionId: z.string().nullable(), roomName: z.string().nullable(), status: z.enum(["open", "in_progress", "completed"]),
  progress: z.number().int().min(0).max(100), version: z.number().int().positive(), openedAt: z.string(), updatedAt: z.string(),
  preparationOnly: z.boolean().optional(), completionAuthority: z.enum(["legacy_staff", "vendor_client"]).optional()
});
type OperationalTask = z.infer<typeof operationalTaskSchema>;
export function operationalReadOnly(task: OperationalTask, session: AuthenticatedSession): string | null {
  if (task.status === "completed") return "This task is complete.";
  if (task.preparationOnly) return "Execution starts after final approval and initial payment.";
  if (task.completionAuthority === "vendor_client" && ["site_execution", "trade_execution"].includes(task.kind)) return "Vendor progress and Client acceptance control this work. Open project execution.";
  if (task.assigneeRole !== session.user.role || (session.user.role !== "finance_head" && task.assignedWorker?.id !== session.user.id)) return "Assigned to another team member.";
  return null;
}
export function TasksWorkspace({ session }: { session: AuthenticatedSession }) {
  const c = useNativeWorkspace(session, "operations"); return <TaskQueue key={c.scope} context={c} />;
}
function TaskQueue({ context: c }: { context: NativeContext }) {
  const [filter, setFilter] = useState("open"); const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: c.key("work-queue"), queryFn: async ({ signal }) => z.array(operationalTaskSchema).parse(await c.http.get("/workflow-tasks", { signal })), enabled: c.ready && c.can("GET /workflow-tasks"), retry: false });
  if (!c.can("GET /workflow-tasks") || denied(query.error)) return <Copy error>Assigned work is unavailable for this account.</Copy>;
  const items = query.data?.filter(task => filter === "all" || (filter === "open" ? task.status !== "completed" : task.status === "completed")) ?? [];
  const page = items.slice(offset, offset + 20);
  return <Workspace><Panel title="Assigned work"><Select label="Task filter" value={filter} options={[{ value: "open", label: "Open work" }, { value: "completed", label: "Completed" }, { value: "all", label: "All work" }]} onChange={value => c.navigate(() => { setFilter(value); setOffset(0); })} /><Button label="Refresh assigned work" variant="secondary" onPress={() => c.navigate(() => void query.refetch())} disabled={query.isFetching} /><QueryState query={query} title="Assigned work" />{!query.isError && query.data ? <>{page.map(task => <Panel key={task.id} title={task.title}><Copy>{task.projectName} · {task.status.replaceAll("_", " ")} · {task.progress}% complete</Copy><Copy>{task.description}</Copy><Copy>Queue: {ROLE_LABELS[task.assigneeRole]} · Assigned: {task.assignedWorker?.name ?? "Unassigned"}</Copy>{task.roomName ? <Copy>Room: {task.roomName}</Copy> : null}<Copy>Opened {new Date(task.openedAt).toLocaleString()} · Updated {new Date(task.updatedAt).toLocaleString()}</Copy><OperationalProgressEditor task={task} context={c} refresh={() => query.refetch()} /><ProjectStatusControl projectId={task.projectId} session={c.session} />{c.can("GET /projects/:projectId/chat/messages") ? <Button label={`Messages for ${task.projectName}`} variant="quiet" onPress={() => c.navigate(() => router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: task.projectId } }))} /> : null}{c.can("GET /projects/:projectId/execution") ? <Button label={`Execution for ${task.projectName}`} variant="quiet" onPress={() => c.navigate(() => router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "execution", recordId: task.projectId } }))} /> : null}</Panel>)}{!items.length ? <Copy>No assigned work matches this filter.</Copy> : null}<Pager offset={offset} total={items.length} onChange={value => c.navigate(() => setOffset(value))} /></> : null}</Panel></Workspace>;
}
export function OperationalProgressEditor({ task, context: c, refresh }: { task: OperationalTask; context: NativeContext; refresh: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false); const [basis, setBasis] = useState(task); const [progress, setProgress] = useState(String(task.progress));
  const command = useNativeCommand(async () => { await refresh(); await c.refresh(); }); const stale = task.version > basis.version;
  const close = useDraftGuard(editing && progress !== String(basis.progress), command.locked, c);
  const reason = operationalReadOnly(task, c.session); const allowed = c.can("PATCH /workflow-tasks/:taskId");
  async function reload() { await refresh(); await command.reload(); setEditing(false); }
  function save() {
    if (!allowed || reason || stale || command.locked) return;
    const value = Number(progress); if (!progress.trim() || !Number.isInteger(value) || value < 0 || value > 100) { command.validation("Enter a whole number from 0 to 100."); return; }
    const input = { version: basis.version, progress: value };
    void command.execute(() => c.http.patch(`/workflow-tasks/${encodeURIComponent(basis.id)}`, input), data => { const saved = operationalTaskSchema.parse(data); if (saved.id !== basis.id || saved.projectId !== basis.projectId || saved.version <= basis.version) throw new Error("Saved progress could not be verified."); setBasis(saved); setEditing(false); });
  }
  if (command.accessLost) return <Copy error>This task is no longer available for your account.</Copy>;
  return <View>{reason ? <Copy>{reason}</Copy> : allowed ? !editing ? <Button label={`Update progress for ${task.title}`} variant="secondary" onPress={() => { setBasis(task); setProgress(String(task.progress)); setEditing(true); }} disabled={command.locked} /> : <><Field label="Progress percentage" value={progress} onChangeText={setProgress} editable={!command.locked && !stale} keyboardType="number-pad" /><Button label="Save progress" onPress={save} disabled={command.locked || stale} loading={command.busy} /><Button label="Discard progress changes" variant="quiet" disabled={command.locked} onPress={() => close(() => setEditing(false))} /></> : null}{stale && editing ? <><Copy error>This task changed. Reload its current progress before editing.</Copy><Button label="Load latest progress" variant="secondary" disabled={command.locked} onPress={() => close(() => void reload())} /></> : null}<CommandState command={{ ...command, reload }} /></View>;
}
