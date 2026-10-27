import { z } from "zod";

const id = z.string().trim().min(1).max(160);
const reason = z.string().trim().min(3).max(2000);
const base = { expectedVersion: z.number().int().min(0), idempotencyKey: z.string().trim().min(8).max(128) };
const evidence = z.array(id).max(12).default([]);
export const pmVendorListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  kind: z.enum(["vendor", "vendor_notice", "certification", "payment_milestone"]).optional(),
  vendorId: id.optional()
}).strict();
export interface PMVendorQuery { limit?: number; offset?: number; kind?: "vendor" | "vendor_notice" | "certification" | "payment_milestone"; vendorId?: string; }
export const pmNoticeKinds = ["quality", "absenteeism", "misbehaviour", "ppe", "cleaning", "stop_work"] as const;
export const pmNoticeSchema = z.object({ ...base, recordId: id, vendorId: id, sourceToken: id, kind: z.enum(pmNoticeKinds), reason,
  evidenceIds: evidence, reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  assignments: z.array(z.object({ assignmentId: id, expectedVersion: z.number().int().min(1) }).strict()).max(100).default([])
}).strict().superRefine((value, ctx) => {
  if (value.expectedVersion !== 0) ctx.addIssue({ code: "custom", message: "New notices start at version zero." });
  if (value.kind === "stop_work" && (!value.reviewDate || !value.assignments.length)) ctx.addIssue({ code: "custom", message: "Stop Work requires selected assignments and a review date." });
  if (value.kind !== "stop_work" && (value.reviewDate || value.assignments.length)) ctx.addIssue({ code: "custom", message: "Only Stop Work can hold assignments." });
  if (new Set(value.assignments.map(row => row.assignmentId)).size !== value.assignments.length) ctx.addIssue({ code: "custom", message: "An assignment can be selected only once." });
});
export const pmNoticeActionSchema = z.object({ ...base, action: z.enum(["resolve", "acknowledge"]), reason, evidenceIds: evidence }).strict();
export const pmCertificationSchema = z.object({ ...base, recordId: id, orderId: id, milestoneId: id, sourceToken: id, reason, evidenceIds: evidence }).strict();
export const pmCertificationActionSchema = z.object({ ...base, action: z.enum(["certify", "reject"]), sourceToken: id, reason, evidenceIds: evidence }).strict();

/** This historic slot is a Site Manager slot. Never infer actual PM authority from its name. */
export function certificationReviewerRole(slot: string): string | null {
  return slot === "program_manager" ? "site_manager" : ["designer", "procurement", "finance_head"].includes(slot) ? slot : null;
}

export function certificationStatus(requiredSlots: readonly string[], decisions: readonly { slot: string; outcome: string }[]): "requested" | "partially_certified" | "certified" | "rejected" {
  if (decisions.some(decision => decision.outcome === "reject")) return "rejected";
  const accepted = new Set(decisions.filter(decision => decision.outcome === "certify").map(decision => decision.slot));
  return requiredSlots.length > 0 && requiredSlots.every(slot => accepted.has(slot)) ? "certified" : accepted.size > 0 ? "partially_certified" : "requested";
}
