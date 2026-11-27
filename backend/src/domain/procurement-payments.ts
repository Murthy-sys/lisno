import { z } from "zod";
import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";
import { lcCommand, lcDate, lcEvidenceIds, lcId, lcInstant, lcReason, lcSum } from "./procurement-lifecycle.js";
import type { PaymentAllocation, PaymentAuthorizationAllocation, PaymentMilestone } from "../contracts/procurement-payments.js";
export const paymentMoney = z.number().int().min(0).max(MAX_FINANCE_AMOUNT_PAISE);
const positiveMoney = paymentMoney.positive();
const base = { ...lcCommand, orderId: lcId };
const allocation = z.object({ milestoneId: lcId, amountPaise: positiveMoney }).strict();
const allocations = z.array(allocation).min(1).max(5).refine(rows => new Set(rows.map(row => row.milestoneId)).size === rows.length, "Allocate each milestone once.");
const dateRows = z.array(z.object({ milestoneId: lcId, dueDate: lcDate }).strict()).min(1).max(5).refine(rows => new Set(rows.map(row => row.milestoneId)).size === rows.length, "Set each milestone date once.");
export const paymentCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("propose_dates"), dates: dateRows, reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("confirm_dates"), dates: dateRows, reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("authorize"), basis: z.enum(["advance", "invoice"]), assessmentRevisionId: lcId.nullable(), allocations: z.array(z.object({ milestoneId: lcId, grossPaise: paymentMoney, withholdingPaise: paymentMoney, netPaise: paymentMoney }).strict()).min(1).max(5), reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("record"), transactionId: lcId, amountPaise: positiveMoney, allocations, paidAt: lcInstant, method: z.enum(["bank_transfer", "upi", "cheque", "cash", "other"]), reference: z.string().trim().min(1).max(160), evidenceIds: lcEvidenceIds, note: z.string().trim().max(2000).optional(), replacesTransactionId: lcId.optional() }).strict(),
  z.object({ ...base, action: z.literal("reverse"), transactionId: lcId, reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("request_correction"), transactionId: lcId, reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("resolve_correction"), requestId: lcId, decision: z.enum(["corrected", "rejected"]), reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("reconcile"), reconciliationId: lcId, supersedesReconciliationId: lcId.optional(), openingBalances: z.array(z.object({ milestoneId: lcId, amountPaise: paymentMoney }).strict()).max(5), evidenceIds: lcEvidenceIds, reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("approve_retention"), milestoneId: lcId, amountPaise: positiveMoney, dueDate: lcDate, ownerId: lcId, reason: lcReason }).strict(),
  z.object({ ...base, action: z.literal("acknowledge_retention"), retentionId: lcId, reason: lcReason }).strict()
]);
export type ProcurementPaymentCommand = z.infer<typeof paymentCommandSchema>;
export const paymentListSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).max(100000).default(0), vendorId: lcId.optional(), orderId: lcId.optional(), status: z.enum(["overdue", "due_today", "upcoming", "paid", "setup_required"]).optional() }).strict();
export const normalizedPaymentReference = (reference: string): string => reference.normalize("NFKC").trim().toLocaleUpperCase("en-US").replace(/\s+/gu, " ");
export function allocationTotal(allocations: readonly PaymentAllocation[]): number { return lcSum(allocations.map(row => row.amountPaise)); }
export function authorizationTotals(allocations: readonly PaymentAuthorizationAllocation[]) {
  return { grossPaise: lcSum(allocations.map(row => row.grossPaise)), withholdingPaise: lcSum(allocations.map(row => row.withholdingPaise)), netPaise: lcSum(allocations.map(row => row.netPaise)) };
}
export function paymentTiming(dueDate: string | null, today: string, remainingPaise: number | null, contractGrossPaise: number): PaymentMilestone["timing"] {
  if (contractGrossPaise === 0) return "no_payment_required";
  if (remainingPaise === 0) return "paid";
  if (!dueDate) return "unscheduled";
  return dueDate < today ? "overdue" : dueDate === today ? "due_today" : "upcoming";
}

export const paymentHistoryQuerySchema = paymentListSchema.omit({ status: true }).extend({ transactionId: lcId.optional() });
