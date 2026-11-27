import { z } from "zod";
import type { ProcurementInspectionWindow } from "../contracts/procurement-inspections.js";
import { lcCommand, lcDate, lcEvidenceIds, lcId, lcInstant, lcReason } from "./procurement-lifecycle.js";

const text = z.string().trim().min(1).max(2000);
const windowSchema = z.object({ id: lcId, startsAt: lcInstant, endsAt: lcInstant }).strict();
export const procurementInspectionPlanSchema = z.object({
  ...lcCommand, count: z.union([z.literal(2), z.literal(3)]),
  windows: z.array(windowSchema).min(2).max(3), reason: lcReason
}).strict().superRefine((value, ctx) => {
  if (value.windows.length !== value.count) ctx.addIssue({ code: "custom", path: ["windows"], message: "Provide one date window for every planned project inspection." });
  if (new Set(value.windows.map(window => window.id)).size !== value.windows.length) ctx.addIssue({ code: "custom", path: ["windows"], message: "Each inspection slot needs a distinct identity." });
  for (let i = 0; i < value.windows.length; i++) {
    const window = value.windows[i]!;
    if (Date.parse(window.endsAt) < Date.parse(window.startsAt)) ctx.addIssue({ code: "custom", path: ["windows", i], message: "Inspection window ends before it starts." });
    if (i && Date.parse(window.startsAt) <= Date.parse(value.windows[i - 1]!.endsAt)) ctx.addIssue({ code: "custom", path: ["windows", i], message: "Inspection windows must be ordered and must not overlap." });
  }
});
export const procurementInspectionFindingSchema = z.object({ id: lcId, itemId: lcId.nullable(), title: z.string().trim().min(1).max(180), note: text, ownerId: lcId, dueAt: lcInstant, evidenceIds: lcEvidenceIds }).strict();
const visitFields = {
  inspectedAt: lcInstant, itemIds: z.array(lcId).min(1).max(500).refine(ids => new Set(ids).size === ids.length, "Inspect each item once per visit."),
  notes: text, delayed: z.boolean().default(false), delayReason: lcReason.nullable().default(null),
  responsibleParty: text.nullable().default(null), recoveryAction: text.nullable().default(null), recoveryDate: lcDate.nullable().default(null),
  evidenceIds: lcEvidenceIds, findings: z.array(procurementInspectionFindingSchema).max(30).default([])
};
const validateDelay = (value: { delayed: boolean; delayReason: string | null; responsibleParty: string | null; recoveryAction: string | null; recoveryDate: string | null }, ctx: z.RefinementCtx) => {
  if (value.delayed && (!value.delayReason || !value.responsibleParty || !value.recoveryAction || !value.recoveryDate)) ctx.addIssue({ code: "custom", path: ["delayReason"], message: "A delayed inspection needs a reason, responsible party, recovery action, and recovery date." });
};
export const procurementInspectionRecordSchema = z.object({ ...lcCommand, visitId: lcId, slotId: lcId.nullable(), ...visitFields }).strict().superRefine(validateDelay);
export const procurementInspectionCorrectionSchema = z.object({ ...lcCommand, correctionId: lcId, reason: lcReason, ...visitFields }).strict().superRefine(validateDelay);
export type ProcurementInspectionPlanInput = z.infer<typeof procurementInspectionPlanSchema>;
export type ProcurementInspectionRecordInput = z.infer<typeof procurementInspectionRecordSchema>;
export type ProcurementInspectionCorrectionInput = z.infer<typeof procurementInspectionCorrectionSchema>;

/** Select once and persist. Randomness is injectable so retries and boundary behavior are testable. */
export function chooseInspectionInstant(window: ProcurementInspectionWindow, random: () => number): string {
  const start = Date.parse(window.startsAt), end = Date.parse(window.endsAt), draw = random();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !Number.isFinite(draw) || draw < 0 || draw >= 1) throw new RangeError("Invalid inspection date window or random source.");
  return new Date(start + Math.floor(draw * (end - start + 1))).toISOString();
}
