import { createHash } from "node:crypto";
import { z } from "zod";
import type { ExecutionPolicy, ExecutionQuery } from "../contracts/vendor-execution.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, "Date must be a valid calendar date.");
const note = z.string().trim().min(1).max(2_000);
export const executionCommandSchema = z.object({
  action: z.enum(["setup", "acknowledge", "propose_schedule", "confirm_schedule", "report", "submit", "verify", "request_changes", "hold", "resume", "exempt_evidence"]),
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), idempotencyKey: z.string().trim().min(8).max(128),
  note: note.optional(), reason: note.optional(), nextAction: note.optional(), progress: z.number().int().min(0).max(100).optional(),
  status: z.enum(["not_started", "in_progress", "blocked"]).optional(), startDate: date.optional(), finishDate: date.optional(), reviewDate: date.optional(), submissionId: z.string().min(1).max(500).optional(), imageIds: z.array(z.string().min(1).max(500)).max(20).optional()
}).strict().superRefine((value, ctx) => {
  const require = (field: keyof typeof value) => { if (value[field] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required.` }); };
  if (["propose_schedule", "confirm_schedule"].includes(value.action)) { require("startDate"); require("finishDate"); }
  if (value.startDate && value.finishDate && value.finishDate < value.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["finishDate"], message: "Finish date cannot precede start date." });
  if (value.action === "report") { require("note"); require("progress"); require("status"); if (value.status === "blocked") { require("reason"); require("nextAction"); } }
  if (value.action === "submit") require("note");
  if (["request_changes", "hold", "resume", "exempt_evidence"].includes(value.action)) require("reason");
  if (value.action === "hold") require("reviewDate");
  if (["verify", "request_changes"].includes(value.action)) require("submissionId");
  if (value.imageIds && new Set(value.imageIds).size !== value.imageIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["imageIds"], message: "Evidence identifiers must be unique." });
});
export const executionQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100_000).default(0), q: z.string().trim().max(200).optional(), vendorId: z.string().min(1).max(500).optional(), status: z.string().max(50).optional(), flag: z.string().max(50).optional() }).strict();
export const executionPortfolioQuerySchema = executionQuerySchema.extend({ projectScope: z.enum(["current", "all"]).default("all") }).strict();
export function executionDigest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function executionLocalDate(at: Date, timezone = "Asia/Kolkata"): string { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at); }
export function nextExecutionDate(value: string): string { return new Date(Date.parse(`${value}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10); }
export function executionCutoff(localDate: string, time: string, timezone: string): Date {
  const desired = Date.parse(`${localDate}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const wallTime = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  };
  const offsets = new Set<number>();
  // Sample both sides of a transition, including zones with non-hour DST shifts.
  for (let hours = -36; hours <= 36; hours += 6) {
    const instant = desired + hours * 3600000;
    offsets.add(wallTime(instant) - instant);
  }
  const candidates = [...offsets].map(offset => desired - offset);
  const exact = candidates.filter(instant => wallTime(instant) === desired);
  // An overlap uses its earlier occurrence. A gap shifts forward by the gap,
  // retaining the configured minutes rather than oscillating between offsets.
  if (exact.length) return new Date(Math.min(...exact));
  const after = candidates.filter(instant => wallTime(instant) > desired).sort((a, b) => wallTime(a) - wallTime(b) || a - b);
  if (!after.length) throw new RangeError("Reporting cutoff cannot be resolved in this timezone.");
  return new Date(after[0]!);
}
export function defaultExecutionPolicy(projectId: string, at = new Date()): ExecutionPolicy { return { projectId, version: 0, timezone: "Asia/Kolkata", reminderTime: "09:00", deadlineTime: "18:00", escalationTime: "19:00", effectiveDate: executionLocalDate(at) }; }
export function executionQuery(value: ExecutionQuery) { return executionQuerySchema.parse(value); }
