import { z } from "zod";
import type { AuthenticatedSession } from "../../contracts/session";

export const TASK_STATUSES = ["not_started", "in_progress", "in_review", "blocked", "completed"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  not_started: ["not_started", "in_progress", "blocked"],
  in_progress: ["in_progress", "in_review", "blocked", "completed"],
  in_review: ["in_review", "in_progress", "blocked", "completed"],
  blocked: ["blocked", "not_started", "in_progress"], completed: ["completed"]
};
export const taskSchema = z.object({
  id: z.string().min(1), projectId: z.string().min(1), ownerId: z.string().min(1),
  title: z.string(), description: z.string().optional(), version: z.number().int().positive(),
  status: z.enum(TASK_STATUSES), progress: z.number().finite().min(0).max(100),
  originalDeadlineAt: z.string().optional(), currentDeadlineAt: z.string().optional(),
  plannedEffort: z.number().finite().nullable().optional(), latestUpdateAt: z.string().nullable().optional(),
  risk: z.object({ level: z.string().optional(), color: z.string().optional(), reason: z.string() }).passthrough().optional()
});
export type NativeTask = z.infer<typeof taskSchema>;
export function canEditTask(task: NativeTask, session: AuthenticatedSession) {
  return session.user.role === "designer" && task.ownerId === session.user.id && task.status !== "completed";
}
export function taskUpdateInput(task: NativeTask, status: TaskStatus, progress: string, note: string) {
  const value = Number(progress);
  if (!progress.trim() || !Number.isFinite(value) || value < 0 || value > 100) throw new Error("Enter progress from 0 to 100.");
  if (!TASK_TRANSITIONS[task.status].includes(status)) throw new Error("Choose an available task status.");
  if (status === "completed" && value !== 100) throw new Error("Completed tasks require progress 100.");
  if (status === "blocked" && !note.trim()) throw new Error("Add a note explaining what is blocking this task.");
  return { version: task.version, status, progress: value, ...(note.trim() ? { note: note.trim() } : {}) };
}
export function findProjectTask(value: unknown, projectId: string, taskId: string): NativeTask {
  const hierarchy = z.object({ id: z.literal(projectId), floors: z.array(z.object({ stages: z.array(z.object({ tasks: z.array(z.unknown()) })) })) }).parse(value);
  const task = hierarchy.floors.flatMap(floor => floor.stages.flatMap(stage => stage.tasks)).map(value => taskSchema.safeParse(value)).find(value => value.success && value.data.id === taskId);
  if (!task?.success || task.data.projectId !== projectId) throw new Error("The current task could not be verified.");
  return task.data;
}
