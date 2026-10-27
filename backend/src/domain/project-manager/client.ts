import { z } from "zod";

const id = z.string().trim().min(1).max(160);
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const command = { expectedVersion: version, idempotencyKey: z.string().trim().min(8).max(128) };
const reason = z.string().trim().min(3).max(2000);
const evidenceIds = z.array(id).max(12).default([]);
const date = z.string().datetime({ offset: true });
export const pmClientQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0)
}).strict();
export const pmSnagQuerySchema = pmClientQuerySchema.extend({
  kind: z.enum(["snags", "visits"]).default("snags"), roomId: id.optional(), tradeId: id.optional(), vendorId: id.optional(),
  status: z.enum(["open", "in_progress", "resolved", "verified"]).optional()
});
export const pmEscalationCreateSchema = z.object({
  ...command, expectedVersion: z.literal(0), recordId: id.optional(),
  title: z.string().trim().min(3).max(180), description: reason,
  ownerId: id.optional(), followUpAt: date.nullable().optional(), evidenceIds
}).strict();
export const pmEscalationActionSchema = z.object({
  ...command, action: z.enum(["pending", "resolve", "reopen", "follow_up", "escalate"]), reason,
  ownerId: id.optional(), followUpAt: date.nullable().optional(), evidenceIds
}).strict();
export const pmSnagCreateSchema = z.object({
  ...command, expectedVersion: z.literal(0), recordId: id.optional(),
  title: z.string().trim().min(3).max(180), description: reason, assignmentId: id.optional(), ownerId: id.optional(),
  severity: z.enum(["critical", "warning", "neutral"]), dueAt: date.nullable().optional(), evidenceIds
}).strict();
export const pmSnagActionSchema = z.object({
  ...command, action: z.enum(["start", "resolve", "verify", "reopen", "assign"]), reason, ownerId: id.optional(), evidenceIds
}).strict();
export const pmSnagVisitSchema = z.object({
  ...command, expectedVersion: z.literal(0), recordId: id.optional(), visitedAt: date,
  reason, snagIds: z.array(id).min(1).max(100), evidenceIds
}).strict();
export type PMSnagStatus = "open" | "in_progress" | "resolved" | "verified";
export type PMEscalationStatus = "open" | "pending" | "resolved";
/** A resolution still needs a separate inspection before it stops blocking handover. */
export function nextSnagStatus(status: PMSnagStatus, action: z.infer<typeof pmSnagActionSchema>["action"]): PMSnagStatus | null {
  if (action === "assign" && status !== "verified") return status;
  if (action === "start" && status === "open") return "in_progress";
  if (action === "resolve" && (status === "open" || status === "in_progress")) return "resolved";
  if (action === "verify" && status === "resolved") return "verified";
  if (action === "reopen" && (status === "resolved" || status === "verified")) return "open";
  return null;
}
export function nextEscalationStatus(status: PMEscalationStatus, action: z.infer<typeof pmEscalationActionSchema>["action"]): PMEscalationStatus | null {
  if (action === "reopen") return status === "resolved" ? "open" : null;
  if (status === "resolved") return null;
  if (action === "pending") return status === "open" ? "pending" : null;
  if (action === "resolve") return "resolved";
  return status;
}
