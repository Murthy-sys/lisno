import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "../middleware/errors.js";
export const lcId = z.string().trim().min(1).max(500);
export const lcReason = z.string().trim().min(3).max(2000);
export const lcVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
export const lcCommand = { expectedVersion: lcVersion, sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u) };
export const lcDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const at = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(at.getTime()) && at.toISOString().slice(0,10) === value;
}, "Enter a valid calendar date.");
export const lcInstant = z.string().datetime({ offset: true });
export const lcEvidenceIds = z.array(lcId).max(12).refine(ids => new Set(ids).size === ids.length, "Choose distinct evidence files.").default([]);
export const lcPage = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
export const lcPolicy = z.object({ timezone: z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }), reviewIntervalDays: z.number().int().min(1).max(7), inspectionCount: z.union([z.literal(2), z.literal(3)]) }).strict();
export const lcSetupSchema = z.object({ ...lcCommand, policy: lcPolicy, reason: lcReason }).strict();
export const lcPolicySchema = lcSetupSchema;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
export const lcDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const lcNewId = (family: string): string => `proc-${family}-${randomUUID()}`;
export function lcConflict(message = "This procurement record changed. Refresh before continuing."): never { throw new ApiError(409, "PROCUREMENT_LIFECYCLE_CONFLICT", message); }
export function lcMissing(): never { throw new ApiError(404, "PROCUREMENT_LIFECYCLE_NOT_FOUND", "This procurement record is not available."); }
export function lcParse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value); if (!parsed.success) throw new ApiError(400,"VALIDATION_ERROR", parsed.error.issues.map(i=>i.message).join(" ")); return parsed.data;
}
export function lcLocalDate(at: Date, timezone: string): string { return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(at); }
export const lcAddDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00.000Z`)+days*86400000).toISOString().slice(0,10);
export function lcSum(values: readonly number[]): number {
  let total=0n; for(const value of values) { if(!Number.isSafeInteger(value)||value<0) lcConflict("Stored money is invalid."); total+=BigInt(value); }
  if(total>BigInt(Number.MAX_SAFE_INTEGER)) lcConflict("The amount exceeds the supported range."); return Number(total);
}
