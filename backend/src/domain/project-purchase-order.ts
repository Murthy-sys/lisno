import { z } from "zod";
import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";

const id = z.string().trim().min(1).max(500);
const text = (max: number) => z.string().trim().min(1).max(max);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);
const idempotencyKey = z.string().trim().min(8).max(128);

export const purchaseOrderLineInputSchema = z.object({
  procurementItemId: id,
  // Thousandths of the item's UOM keep quantity arithmetic deterministic.
  quantityMilliUnits: z.number().int().positive().max(1_000_000_000),
  unitPricePaise: z.number().int().positive().max(MAX_FINANCE_AMOUNT_PAISE),
  gstBasisPoints: z.number().int().min(0).max(10_000),
  scopeType: z.enum(["supply", "execution", "supply_and_execution"]),
  description: text(2_000),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid target date."),
  deliveryLocation: text(500)
}).strict().superRefine((value, context) => {
  try { calculatePurchaseOrderLine(value); }
  catch { context.addIssue({ code: z.ZodIssueCode.custom, path: ["unitPricePaise"], message: "The ordered quantity and unit price must produce a positive supported amount." }); }
});

const purchaseOrderDraftFields = z.object({
  vendorId: id,
  lines: z.array(purchaseOrderLineInputSchema).min(1).max(100),
  terms: text(4_000),
  idempotencyKey
}).strict();
export const purchaseOrderDraftSchema = purchaseOrderDraftFields.superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, line] of value.lines.entries()) {
    if (ids.has(line.procurementItemId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["lines", index, "procurementItemId"], message: "A procurement item can appear only once in an order." });
    ids.add(line.procurementItemId);
  }
});

export const purchaseOrderUpdateSchema = purchaseOrderDraftFields.omit({ vendorId: true, idempotencyKey: true }).extend({ expectedVersion: version, idempotencyKey }).superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, line] of value.lines.entries()) {
    if (ids.has(line.procurementItemId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["lines", index, "procurementItemId"], message: "A procurement item can appear only once in an order." });
    ids.add(line.procurementItemId);
  }
});

export const purchaseOrderSubmitSchema = z.object({ expectedVersion: version, idempotencyKey }).strict();
export const purchaseOrderDecisionSchema = z.object({
  expectedVersion: version,
  submittedRevisionId: id,
  idempotencyKey,
  decision: z.enum(["approve", "request_changes", "reject"]),
  reason: z.string().trim().max(2_000).nullable().default(null),
  budgetOverrideReason: z.string().trim().max(2_000).nullable().default(null)
}).strict().superRefine((value, context) => {
  if (value.decision !== "approve" && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Give a reason for this decision." });
});
export const purchaseOrderAmendSchema = z.object({ expectedVersion: version, idempotencyKey, reason: text(2_000) }).strict();
export const purchaseOrderCancelSchema = purchaseOrderAmendSchema;
export const purchaseOrderQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0)
}).strict();

export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineInputSchema>;
export type PurchaseOrderDraftInput = z.infer<typeof purchaseOrderDraftSchema>;
export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;
export type PurchaseOrderSubmitInput = z.infer<typeof purchaseOrderSubmitSchema>;
export type PurchaseOrderDecisionInput = z.infer<typeof purchaseOrderDecisionSchema>;
export type PurchaseOrderAmendInput = z.infer<typeof purchaseOrderAmendSchema>;
export type PurchaseOrderQuery = z.infer<typeof purchaseOrderQuerySchema>;
export type PurchaseOrderStatus = "draft" | "pending_approval" | "changes_requested" | "rejected" | "approved" | "cancelled";

export interface ApprovedPurchaseOrderLine extends Omit<PurchaseOrderLineInput, "scopeType" | "targetDate" | "deliveryLocation"> {
  scopeType?: PurchaseOrderLineInput["scopeType"];
  targetDate?: string;
  deliveryLocation?: string;
  id: string;
  procurementItemVersion: number;
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  sourceSectionId: string;
  sourceLineItemKey: string;
  roomName: string;
  itemName: string;
  brand: string;
  uomId: string;
  uomCode: string;
  uomName: string;
  netPaise: number;
  gstPaise: number;
  totalPaise: number;
}

function checkedPaise(value: bigint): number {
  if (value > BigInt(MAX_FINANCE_AMOUNT_PAISE) || value < 0n) throw new RangeError("Purchase order amount exceeds the supported paise range.");
  return Number(value);
}

/** Round positive rational values half up once at the explicit line boundary. */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function calculatePurchaseOrderLine(input: Pick<PurchaseOrderLineInput, "quantityMilliUnits" | "unitPricePaise" | "gstBasisPoints">): { netPaise: number; gstPaise: number; totalPaise: number } {
  if (!Number.isSafeInteger(input.quantityMilliUnits) || input.quantityMilliUnits <= 0 || !Number.isSafeInteger(input.unitPricePaise) || input.unitPricePaise <= 0 || !Number.isSafeInteger(input.gstBasisPoints) || input.gstBasisPoints < 0 || input.gstBasisPoints > 10_000) throw new RangeError("Invalid purchase order amount input.");
  const net = roundHalfUp(BigInt(input.quantityMilliUnits) * BigInt(input.unitPricePaise), 1_000n);
  if (net === 0n) throw new RangeError("Purchase order net amount must be positive.");
  const gst = roundHalfUp(net * BigInt(input.gstBasisPoints), 10_000n);
  return { netPaise: checkedPaise(net), gstPaise: checkedPaise(gst), totalPaise: checkedPaise(net + gst) };
}

export function calculatePurchaseOrderTotals(lines: readonly Pick<ApprovedPurchaseOrderLine, "netPaise" | "gstPaise" | "totalPaise">[]): { netPaise: number; gstPaise: number; totalPaise: number } {
  return {
    netPaise: checkedPaise(lines.reduce((sum, line) => sum + BigInt(line.netPaise), 0n)),
    gstPaise: checkedPaise(lines.reduce((sum, line) => sum + BigInt(line.gstPaise), 0n)),
    totalPaise: checkedPaise(lines.reduce((sum, line) => sum + BigInt(line.totalPaise), 0n))
  };
}
