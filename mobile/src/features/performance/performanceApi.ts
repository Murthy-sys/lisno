import { z } from "zod";
import type { JsonApiClient } from "../../core/http/apiClient";

const id = z.string().min(1);
const finite = z.number().finite();
const count = finite.int().nonnegative().safe();
const percent = finite.min(0).max(100);
const instant = z.string().refine(value => Number.isFinite(Date.parse(value)), "Invalid timestamp");
export const pageMetadata = z.object({ limit: count.positive(), offset: count, total: count, hasMore: z.boolean() });
const riskCounts = z.object({ gray: count, green: count, yellow: count, red: count });
const event = z.object({ id, taskId: id, actorId: id, type: z.string(), occurredAt: instant, note: z.string().nullable(), from: z.record(z.string(), z.unknown()), to: z.record(z.string(), z.unknown()) });
export const taskPageSchema = z.object({ items: z.array(z.object({ id, projectId: id, title: z.string(), status: z.enum(["not_started", "in_progress", "in_review", "blocked", "completed"]), progress: percent, currentDeadlineAt: instant, plannedEffort: finite.nonnegative().nullable(), risk: z.object({ level: z.enum(["gray", "green", "yellow", "red"]), reason: z.string(), elapsedRatio: finite, progressRatio: finite, forecastCompletion: instant.optional() }) })), pagination: pageMetadata });
export const eventPageSchema = z.object({ items: z.array(event), pagination: pageMetadata });
export const performanceSchema = z.object({
  userId: id, periodStartAt: instant, periodEndAt: instant, score: percent,
  components: z.array(z.object({ key: z.enum(["onTime", "quality", "revisionEfficiency", "updateDiscipline", "workloadCompletion"]), label: z.string(), score: percent.nullable(), configuredWeight: percent, effectiveWeight: percent, eligibleCount: count, explanation: z.string() })),
  aggregates: z.object({ taskCounts: z.object({ total: count, completed: count, active: count }), riskCounts, effort: z.object({ planned: finite.nonnegative(), completed: finite.nonnegative(), remaining: finite.nonnegative(), workloadPercentage: finite.nonnegative() }), projects: z.array(z.object({ projectId: id, totalTasks: count, completedTasks: count, progress: percent, riskCounts })), recentActivity: z.array(z.object({ taskId: id, projectId: id, taskTitle: z.string(), event })) }),
  tasks: taskPageSchema
});
export type Performance = z.infer<typeof performanceSchema>;
export type PerformanceTask = z.infer<typeof taskPageSchema>["items"][number];
export interface ReportingPeriod { from: string; to: string }
export function reportingMonth(offset: 0 | -1, now = new Date()): ReportingPeriod {
  return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString(), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1) - 1).toISOString() };
}
function path(userId: string, period: ReportingPeriod, offset: number, tasks = false) {
  return `/kpis/users/${encodeURIComponent(userId)}${tasks ? "/tasks" : ""}?${new URLSearchParams({ from: period.from, to: period.to, limit: "20", offset: String(offset) })}`;
}
function checkPage<T extends { id: string }>(page: { items: T[]; pagination: z.infer<typeof pageMetadata> }, offset: number) {
  if (page.pagination.offset !== offset || page.pagination.limit !== 20 || page.items.length > 20 || new Set(page.items.map(item => item.id)).size !== page.items.length) throw new Error("The performance page could not be verified.");
  return page;
}
export function createPerformanceApi(http: Pick<JsonApiClient["authenticated"], "get">) {
  return {
    async overview(userId: string, period: ReportingPeriod, signal?: AbortSignal) {
      const value = performanceSchema.parse(await http.get<unknown>(path(userId, period, 0), { signal }));
      if (value.userId !== userId || value.periodStartAt !== period.from || value.periodEndAt !== period.to || new Set(value.components.map(component => component.key)).size !== value.components.length || value.aggregates.recentActivity.some(item => item.event.taskId !== item.taskId)) throw new Error("The performance response does not match this person and reporting period.");
      checkPage(value.tasks, 0); return value;
    },
    async tasks(userId: string, period: ReportingPeriod, offset: number, signal?: AbortSignal) {
      return checkPage(taskPageSchema.parse(await http.get<unknown>(path(userId, period, offset, true), { signal })), offset);
    },
    async events(taskId: string, offset: number, signal?: AbortSignal) {
      const value = checkPage(eventPageSchema.parse(await http.get<unknown>(`/tasks/${encodeURIComponent(taskId)}/events?sort=desc&limit=20&offset=${offset}`, { signal })), offset);
      if (value.items.some(item => item.taskId !== taskId)) throw new Error("The task activity response belongs to another task."); return value;
    }
  };
}
