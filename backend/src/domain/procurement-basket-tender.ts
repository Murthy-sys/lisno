import { createHash } from "node:crypto";
import { z } from "zod";
import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";
import { calculatePurchaseOrderLine, calculatePurchaseOrderTotals } from "./project-purchase-order.js";

const id = z.string().trim().min(1).max(500);
const key = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid date.");

export const procurementBasketBoqLineInputSchema = z.object({
  sourceLineItemKey: id,
  description: z.string().trim().min(1).max(2_000).optional(),
  quantityMilliUnits: z.number().int().positive().max(1_000_000_000).optional(),
  scopeType: z.enum(["supply", "execution", "supply_and_execution"]).optional(),
  targetDate: date.optional(),
  deliveryLocation: z.string().trim().min(1).max(500).optional()
}).strict();
const boqLines = z.array(procurementBasketBoqLineInputSchema).min(1).max(100).superRefine((lines, context) => {
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (seen.has(line.sourceLineItemKey)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "sourceLineItemKey"], message: "A source line can occur only once." });
    seen.add(line.sourceLineItemKey);
  }
});
export const procurementBasketEnquiryCreateSchema = z.object({
  expectedPreparationDigest: digest, idempotencyKey: key, lines: boqLines
}).strict();
export const procurementBasketEnquiryUpdateSchema = z.object({
  expectedVersion: version, expectedPreparationDigest: digest, idempotencyKey: key, lines: boqLines
}).strict();
const vendorIds = z.array(id).min(1).max(5_000)
  .refine(values => new Set(values).size === values.length, "Select each vendor once.");
export const procurementBasketVendorSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("vendors"), vendorIds }).strict(),
  z.object({ kind: z.literal("all_eligible"), excludedVendorIds: z.array(id).max(5_000)
    .refine(values => new Set(values).size === values.length, "Exclude each vendor once.").optional() }).strict()
]);
export const procurementBasketDispatchSchema = z.object({
  expectedVersion: version, expectedPreparationDigest: digest, idempotencyKey: key,
  vendorIds: vendorIds.optional(), selection: procurementBasketVendorSelectionSchema.optional()
}).strict().superRefine((value, context) => {
  if (Number(value.vendorIds !== undefined) + Number(value.selection !== undefined) !== 1)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selection"], message: "Choose one vendor selection." });
});
export const procurementBasketInvitationBatchPreviewSchema = z.object({
  expectedVersion: version, boqRevisionId: id, boqDigest: digest,
  selection: procurementBasketVendorSelectionSchema
}).strict();
export const procurementBasketInvitationBatchSubmitSchema = procurementBasketInvitationBatchPreviewSchema.extend({
  idempotencyKey: key, counterofferReason: z.string().trim().min(10).max(2_000).optional()
}).strict();
export const procurementBasketResendInvitationSchema = z.object({
  expectedVersion: version, vendorId: id, idempotencyKey: key
}).strict();
export const procurementBasketWhatsAppShareIntentSchema = z.object({}).strict();
export const procurementBasketPublicInspectSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).strict();
export const procurementBasketPublicSubmitSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u), idempotencyKey: key,
  lines: z.array(z.object({ boqLineId: id, unitPricePaise: z.number().int().positive().max(MAX_FINANCE_AMOUNT_PAISE),
    gstBasisPoints: z.number().int().min(0).max(10_000) }).strict()).min(1).max(100)
    .refine(lines => new Set(lines.map(line => line.boqLineId)).size === lines.length, "Quote each line once.")
}).strict();
export const procurementBasketCounterofferSchema = z.object({
  vendorId: id, expectedVersion: version, idempotencyKey: key,
  reason: z.string().trim().min(10).max(2_000),
  targetNetPaise: z.number().int().positive().max(MAX_FINANCE_AMOUNT_PAISE).nullable().optional()
}).strict();
export const PROCUREMENT_BASKET_MILESTONE_IDS = ["advance", "mobilisation", "progress_50", "progress_85", "final"] as const;
export const PROCUREMENT_BASKET_MILESTONE_REVIEWER_SLOTS = ["program_manager", "designer", "procurement", "finance_head"] as const;
export type ProcurementBasketMilestoneId = typeof PROCUREMENT_BASKET_MILESTONE_IDS[number];
export type ProcurementBasketMilestoneReviewerSlot = typeof PROCUREMENT_BASKET_MILESTONE_REVIEWER_SLOTS[number];
export const procurementBasketMilestoneReviewersSchema = z.array(z.object({
  id: z.enum(PROCUREMENT_BASKET_MILESTONE_IDS),
  reviewerSlots: z.array(z.enum(PROCUREMENT_BASKET_MILESTONE_REVIEWER_SLOTS)).max(PROCUREMENT_BASKET_MILESTONE_REVIEWER_SLOTS.length)
    .refine(slots => new Set(slots).size === slots.length, "Select each approver once per payment row.")
}).strict()).length(PROCUREMENT_BASKET_MILESTONE_IDS.length)
  .refine(rows => new Set(rows.map(row => row.id)).size === PROCUREMENT_BASKET_MILESTONE_IDS.length,
    "Select approvers for each payment row exactly once.");
export const procurementBasketAwardCreateSchema = z.object({
  expectedVersion: version, idempotencyKey: key, bidId: id,
  nonRecommendedReason: z.string().trim().min(10).max(2_000).nullable().optional(),
  advanceBasisPoints: z.number().int().min(0).max(10_000),
  milestoneReviewers: procurementBasketMilestoneReviewersSchema,
  designerId: id.nullable().optional(),
  terms: z.string().trim().min(1).max(4_000).optional(),
  lineTerms: z.array(z.object({ boqLineId: id,
    scopeType: z.enum(["supply", "execution", "supply_and_execution"]).optional(),
    targetDate: date.optional(), deliveryLocation: z.string().trim().min(1).max(500).optional() }).strict())
    .max(100).refine(lines => new Set(lines.map(line => line.boqLineId)).size === lines.length,
      "Enter work-order terms for each BOQ line once.").optional()
}).strict();
export const procurementBasketAwardUpdateSchema = z.object({
  expectedVersion: version, idempotencyKey: key,
  bidId: id.optional(),
  advanceBasisPoints: z.number().int().min(0).max(10_000),
  milestoneReviewers: procurementBasketMilestoneReviewersSchema,
  designerId: id.nullable().optional(),
  terms: z.string().trim().min(1).max(4_000).optional(),
  lineTerms: procurementBasketAwardCreateSchema.shape.lineTerms,
  nonRecommendedReason: z.string().trim().min(10).max(2_000).nullable().optional()
}).strict();
export const procurementBasketAwardSubmitSchema = z.object({ expectedVersion: version, idempotencyKey: key,
  autoIssueOnApproval: z.boolean().optional() }).strict();
export const procurementBasketAwardWithdrawSchema = z.object({ expectedVersion: version, idempotencyKey: key,
  reason: z.string().trim().min(10).max(2_000) }).strict();
export const procurementBasketAwardPreviewSchema = z.object({ bidId: id,
  advanceBasisPoints: z.number().int().min(0).max(10_000), designerId: id.nullable().optional(),
  milestoneReviewers: procurementBasketMilestoneReviewersSchema.optional() }).strict();
export const procurementBasketAwardDecisionSchema = z.object({
  expectedVersion: version, proposalRevisionId: id, idempotencyKey: key,
  slot: z.enum(["program_manager", "designer", "procurement", "finance_head", "budget_override"]),
  decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(2_000).nullable().optional()
}).strict().superRefine((value, context) => {
  if (value.decision === "reject" && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Give a rejection reason." });
  if (value.decision === "approve" && value.slot === "budget_override" && (!value.reason || value.reason.length < 10))
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Give an override reason of at least 10 characters." });
});

export type ProcurementBasketBoqLineInput = z.infer<typeof procurementBasketBoqLineInputSchema>;
export type ProcurementBasketEnquiryCreateInput = z.infer<typeof procurementBasketEnquiryCreateSchema>;
export type ProcurementBasketEnquiryUpdateInput = z.infer<typeof procurementBasketEnquiryUpdateSchema>;
export type ProcurementBasketDispatchInput = z.infer<typeof procurementBasketDispatchSchema>;
export type ProcurementBasketVendorSelection = z.infer<typeof procurementBasketVendorSelectionSchema>;
export type ProcurementBasketInvitationBatchPreviewInput = z.infer<typeof procurementBasketInvitationBatchPreviewSchema>;
export type ProcurementBasketInvitationBatchSubmitInput = z.infer<typeof procurementBasketInvitationBatchSubmitSchema>;
export type ProcurementBasketResendInvitationInput = z.infer<typeof procurementBasketResendInvitationSchema>;
export type ProcurementBasketPublicSubmitInput = z.infer<typeof procurementBasketPublicSubmitSchema>;
export type ProcurementBasketCounterofferInput = z.infer<typeof procurementBasketCounterofferSchema>;
export type ProcurementBasketAwardCreateInput = z.infer<typeof procurementBasketAwardCreateSchema>;
export type ProcurementBasketAwardUpdateInput = z.infer<typeof procurementBasketAwardUpdateSchema>;
export type ProcurementBasketAwardLineTerms = NonNullable<ProcurementBasketAwardCreateInput["lineTerms"]>[number];
export type ProcurementBasketMilestoneReviewersInput = z.infer<typeof procurementBasketMilestoneReviewersSchema>;
export type ProcurementBasketAwardWithdrawInput = z.infer<typeof procurementBasketAwardWithdrawSchema>;
export type ProcurementBasketAwardDecisionInput = z.infer<typeof procurementBasketAwardDecisionSchema>;

export interface ProcurementBasketBoqLine extends ProcurementBasketBoqLineInput {
  id: string;
  description: string;
  quantityMilliUnits: number;
  roomId: string | null;
  roomName: string;
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string | null;
  mainLineName: string | null;
  approvedQuantity: string;
  approvedUnit: string;
  approvedQuoteAmountPaise: number | null;
  uomId: string;
  uomCode: string;
  uomDecimalScale: number;
}

export interface ProcurementBasketBidLine {
  boqLineId: string;
  unitPricePaise: number;
  gstBasisPoints: number;
  netPaise: number;
  gstPaise: number;
  totalPaise: number;
}

export interface ProcurementBasketBidTotals { netPaise: number; gstPaise: number; totalPaise: number }

export function calculateProcurementBasketBid(boqLines: readonly ProcurementBasketBoqLine[],
  input: readonly ProcurementBasketPublicSubmitInput["lines"][number][]): { lines: ProcurementBasketBidLine[]; totals: ProcurementBasketBidTotals } {
  if (boqLines.length !== input.length) throw new RangeError("Quote every BOQ line exactly once.");
  const byId = new Map(input.map(line => [line.boqLineId, line]));
  if (byId.size !== input.length) throw new RangeError("Quote every BOQ line exactly once.");
  const lines = boqLines.map(boq => {
    const quote = byId.get(boq.id);
    if (!quote) throw new RangeError("Quote every BOQ line exactly once.");
    const amount = calculatePurchaseOrderLine({ quantityMilliUnits: boq.quantityMilliUnits,
      unitPricePaise: quote.unitPricePaise, gstBasisPoints: quote.gstBasisPoints });
    return { boqLineId: boq.id, unitPricePaise: quote.unitPricePaise, gstBasisPoints: quote.gstBasisPoints, ...amount };
  });
  return { lines, totals: calculatePurchaseOrderTotals(lines) };
}

export interface ProcurementBasketComparisonBid {
  bidId: string;
  vendorId: string;
  vendorName: string;
  officialKpiScoreBps: number | null;
  quoteNetPaise: number;
  quoteGstPaise: number;
  quoteGrossPaise: number;
  eligible: boolean;
  blockers: string[];
}
export interface ProcurementBasketComparisonRow extends ProcurementBasketComparisonBid {
  priceScoreBps: number | null;
  comparisonScoreBps: number | null;
  priorityRank: number | null;
  recommended: boolean;
}

/** Include only complete, positive pre-GST bid totals; BigInt keeps the sum exact across many vendors. */
export function averageProcurementBasketBidNetPaise(amounts: readonly number[]): number | null {
  const valid = amounts.filter(amount => Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_FINANCE_AMOUNT_PAISE);
  if (!valid.length) return null;
  const sum = valid.reduce((total, amount) => total + BigInt(amount), 0n);
  const count = BigInt(valid.length);
  return Number((sum + count / 2n) / count);
}

/** Equal KPI/price weight. Integer basis points and deterministic ties avoid floating point ranking drift. */
export function compareProcurementBasketBids(bids: readonly ProcurementBasketComparisonBid[]): {
  rows: ProcurementBasketComparisonRow[]; recommendedBidId: string | null
} {
  const eligible = bids.filter(bid => bid.eligible && bid.blockers.length === 0 && bid.officialKpiScoreBps !== null &&
    Number.isSafeInteger(bid.officialKpiScoreBps) && bid.officialKpiScoreBps >= 0 && bid.officialKpiScoreBps <= 10_000 &&
    Number.isSafeInteger(bid.quoteNetPaise) && bid.quoteNetPaise > 0);
  const minimum = eligible.length ? Math.min(...eligible.map(bid => bid.quoteNetPaise)) : null;
  const rows = bids.map(bid => {
    const valid = minimum !== null && eligible.includes(bid);
    const priceScoreBps = valid ? Number((BigInt(minimum!) * 10_000n + BigInt(bid.quoteNetPaise) / 2n) / BigInt(bid.quoteNetPaise)) : null;
    const comparisonScoreBps = priceScoreBps === null ? null : Math.floor((bid.officialKpiScoreBps! + priceScoreBps + 1) / 2);
    return { ...bid, priceScoreBps, comparisonScoreBps, priorityRank: null, recommended: false };
  });
  const ranked = rows.filter(row => row.comparisonScoreBps !== null).sort((left, right) =>
    right.comparisonScoreBps! - left.comparisonScoreBps! || left.quoteNetPaise - right.quoteNetPaise ||
    right.officialKpiScoreBps! - left.officialKpiScoreBps! || left.vendorId.localeCompare(right.vendorId));
  const recommendedBidId = ranked[0]?.bidId ?? null;
  const priorityRankByBidId = new Map(ranked.map((row, index) => [row.bidId, index + 1]));
  return { rows: rows.map(row => ({ ...row, priorityRank: priorityRankByBidId.get(row.bidId) ?? null,
    recommended: row.bidId === recommendedBidId })), recommendedBidId };
}

export const PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE = 5_000_000;
export type ProcurementBasketApprovalSlot = "program_manager" | "designer" | "procurement" | "finance_head" | "budget_override";
export function requiredProcurementBasketApprovalSlots(grossPaise: number): ProcurementBasketApprovalSlot[] {
  if (!Number.isSafeInteger(grossPaise) || grossPaise <= 0 || grossPaise > MAX_FINANCE_AMOUNT_PAISE) throw new RangeError("Invalid award gross amount.");
  return grossPaise <= PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE
    ? ["procurement"] : ["program_manager", "designer", "procurement", "finance_head"];
}

export const PROCUREMENT_BASKET_MILESTONE_NAMES = ["Advance", "Mobilisation", "Progress 50%", "Progress 85%", "Final"] as const;
export interface ProcurementBasketPaymentMilestone { id: ProcurementBasketMilestoneId;
  name: string; basisPoints: number; amountPaise: number; reviewerSlots?: ProcurementBasketMilestoneReviewerSlot[] }
export function withProcurementBasketMilestoneReviewers(grossPaise: number,
  schedule: readonly ProcurementBasketPaymentMilestone[], input?: ProcurementBasketMilestoneReviewersInput): ProcurementBasketPaymentMilestone[] {
  const parsed = input === undefined ? undefined : procurementBasketMilestoneReviewersSchema.safeParse(input);
  if (parsed && !parsed.success) throw new RangeError("Select each payment row and approver only once.");
  const selection = parsed?.data ?? schedule.map(row => ({ id: row.id,
    reviewerSlots: grossPaise <= PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE
      ? ["procurement" as const] : [] }));
  const byId = new Map(selection.map(row => [row.id, row.reviewerSlots]));
  if (grossPaise <= PROCUREMENT_BASKET_APPROVAL_THRESHOLD_GROSS_PAISE &&
    selection.some(row => row.reviewerSlots.length !== 1 || row.reviewerSlots[0] !== "procurement"))
    throw new RangeError("Orders up to ₹50,000 require Procurement on every payment row.");
  return schedule.map(row => ({ ...row, reviewerSlots: [...(byId.get(row.id) ?? [])] }));
}
export function procurementBasketPaymentSchedule(grossPaise: number, advanceBasisPoints: number): ProcurementBasketPaymentMilestone[] {
  if (!Number.isSafeInteger(grossPaise) || grossPaise <= 0 || grossPaise > MAX_FINANCE_AMOUNT_PAISE ||
    !Number.isSafeInteger(advanceBasisPoints) || advanceBasisPoints < 0 || advanceBasisPoints > 10_000) throw new RangeError("Invalid payment schedule.");
  const remaining = 10_000 - advanceBasisPoints;
  const shares = [advanceBasisPoints, 1500, 2500, 2500, 1500].map((value, index) => index === 0 ? value : Math.floor(value * remaining / 8000));
  shares[4] = 10_000 - shares.slice(0, 4).reduce((sum, value) => sum + value, 0);
  if (shares[4]! < 0) throw new RangeError("Invalid payment schedule shares.");
  const ids = ["advance", "mobilisation", "progress_50", "progress_85", "final"] as const;
  let allocated = 0;
  return ids.map((id, index) => {
    const amountPaise = index === 4 ? grossPaise - allocated : Number(BigInt(grossPaise) * BigInt(shares[index]!) / 10_000n);
    allocated += amountPaise;
    return { id, name: PROCUREMENT_BASKET_MILESTONE_NAMES[index]!, basisPoints: shares[index]!, amountPaise };
  });
}

export function procurementBasketDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
