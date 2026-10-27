import { z } from "zod";

const base = { expectedVersion: z.number().int().nonnegative(), idempotencyKey: z.string().trim().min(8).max(128), sourceToken: z.string().regex(/^[a-f0-9]{64}$/u) };
const reason = z.string().trim().min(3).max(2000);
const id = z.string().trim().min(1).max(500);
export const pmRequestCreateSchema = z.object({ ...base, sourceId: id, title: z.string().trim().min(1).max(300).optional(), reason,
  dueAt: z.string().datetime({ offset: true }).optional(), ownerId: id.optional(), quantity: z.number().finite().positive().max(1_000_000_000).optional(), unit: z.string().trim().min(1).max(60).optional() }).strict();
export const pmRequestActionSchema = z.object({ ...base, action: z.enum(["acknowledge", "fulfill", "reject", "remind", "escalate"]), reason,
  artifact: z.object({ kind: z.enum(["procurement_item", "purchase_order_request", "purchase_order"]), id, lineId: id.optional() }).strict().optional()
}).strict().superRefine((value, ctx) => {
  if (value.action === "fulfill" && !value.artifact) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["artifact"], message: "Link the Procurement item or order that fulfilled this request." });
  if (value.action !== "fulfill" && value.artifact) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["artifact"], message: "An artifact is only accepted when fulfilling a request." });
});
export const pmSupplyActionSchema = z.object({ ...base, action: z.enum(["sign_off", "remind", "reopen"]), reason,
  evidenceIds: z.array(id).max(12).default([]) }).strict();
export type PMRequestCreate = z.infer<typeof pmRequestCreateSchema>;
export type PMRequestAction = z.infer<typeof pmRequestActionSchema>;
export type PMSupplyAction = z.infer<typeof pmSupplyActionSchema>;
export type PMRequestKind = "procurement" | "selection";
export const pmRequestListSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100_000).default(0) }).strict();
export interface PMRequestList { limit?: number; offset?: number; }
export function requestTransition(kind: PMRequestKind, status: string, action: PMRequestAction["action"], role: string): string {
  if (!["open", "acknowledged"].includes(status)) throw new Error("This request is already closed.");
  if (kind === "selection") {
    if (role !== "site_manager" || ["fulfill", "reject"].includes(action)) throw new Error("Project Manager acknowledgement cannot decide a design requirement.");
  } else {
    if (["acknowledge", "fulfill", "reject"].includes(action) && role !== "procurement") throw new Error("Only the assigned Procurement owner may review or fulfill this request.");
    if (["remind", "escalate"].includes(action) && role !== "site_manager") throw new Error("Only the assigned Project Manager may send this request reminder.");
  }
  if (action === "acknowledge") { if (status === "acknowledged") throw new Error("This request is already acknowledged."); return "acknowledged"; }
  if (action === "fulfill") return "fulfilled";
  if (action === "reject") return "rejected";
  return status;
}
export function supplyRequiredReviewers(pmId: string | null, designerIds: string[]): string[] {
  return pmId && designerIds.length ? [pmId, ...new Set(designerIds)].sort() : [];
}
export function supplyComplete(required: readonly string[], signed: readonly string[]): boolean {
  return required.length >= 2 && required.every(id => signed.includes(id));
}
