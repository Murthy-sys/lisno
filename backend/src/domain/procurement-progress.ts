import { z } from "zod";
import type { LifecycleItem } from "../contracts/procurement-lifecycle.js";
import { lcCommand, lcDate, lcId, lcInstant, lcReason, lcDigest, lcLocalDate, lcAddDays } from "./procurement-lifecycle.js";
import { executionCutoff } from "./vendor-execution.js";

const text = z.string().trim().min(1).max(2000);
export const procurementProgressObservationSchema = z.object({
  checkedAt: lcInstant, status: z.enum(["not_started", "in_progress", "blocked", "completed"]),
  progress: z.number().int().min(0).max(100).nullable().default(null), notes: text,
  nextAction: text, nextCheckDate: lcDate, delayed: z.boolean().default(false),
  delayReason: lcReason.nullable().default(null), responsibleParty: text.nullable().default(null),
  recoveryAction: text.nullable().default(null), recoveryDate: lcDate.nullable().default(null),
  forecastDate: lcDate.nullable().default(null), forecastReason: lcReason.nullable().default(null)
}).strict();
const base = { ...lcCommand, roundId: lcId };
export const procurementProgressCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...lcCommand, action: z.literal("open") }).strict(),
  z.object({ ...base, action: z.literal("check"), itemId: lcId, observation: procurementProgressObservationSchema }).strict(),
  z.object({ ...base, action: z.literal("correct"), itemId: lcId, checkId: lcId, reason: lcReason, observation: procurementProgressObservationSchema }).strict(),
  z.object({ ...base, action: z.literal("reconcile"), reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("pause"), reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("resume"), reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("finalize"), notes: text }).strict()
]).superRefine((value, context) => {
  if (value.action !== "check" && value.action !== "correct") return;
  const item = value.observation;
  if (item.delayed || item.status === "blocked") {
    for (const field of ["delayReason", "responsibleParty", "recoveryAction", "recoveryDate"] as const)
      if (!item[field]) context.addIssue({ code: "custom", path: ["observation", field], message: "Delayed or blocked work needs a reason, responsible party, recovery action, and recovery date." });
  }
  if (item.status === "not_started" && item.progress !== null && item.progress !== 0 || item.status === "completed" && item.progress !== null && item.progress !== 100)
    context.addIssue({ code: "custom", path: ["observation", "progress"], message: "Progress must match the observed work status." });
  if (Boolean(item.forecastDate) !== Boolean(item.forecastReason)) context.addIssue({ code: "custom", path: ["observation", "forecastReason"], message: "A revised forecast needs both a date and reason." });
});
export type ProcurementProgressCommand = z.infer<typeof procurementProgressCommandSchema>;

/** Operational vendor reports do not invalidate a Procurement observation's source binding. */
export function reviewMemberDigest(item: LifecycleItem): string {
  const { vendorProgress: _progress, vendorNote: _note, vendorStatus: _status, ...source } = item;
  return lcDigest(source);
}
export function priorityRank(priority: LifecycleItem["priority"]): number { return priority === "P1" ? 1 : priority === "P2" ? 2 : priority === "P3" ? 3 : 4; }
export function priorUncheckedItemIds(items: readonly LifecycleItem[], checkedIds: ReadonlySet<string>, itemId: string): string[] {
  const target = items.find(item => item.id === itemId);
  if (!target) return [];
  return items.filter(item => item.priority !== null && priorityRank(item.priority) < priorityRank(target.priority) && !checkedIds.has(item.id)).map(item => item.id);
}
export function reviewDueAfter(opensAt: Date, days: number, timezone: string): Date {
  // Same local clock time on the due calendar day, preserving short/DST days.
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(opensAt);
  return executionCutoff(lcAddDays(lcLocalDate(opensAt, timezone), days), parts, timezone);
}
