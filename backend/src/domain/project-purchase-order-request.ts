import { z } from "zod";
import { purchaseOrderQuerySchema, type ApprovedPurchaseOrderLine } from "./project-purchase-order.js";

const id = z.string().trim().min(1).max(500);
const key = z.string().trim().min(8).max(128);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);

const requestContent = {
  expectedPreparationDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  lines: z.array(z.object({
    procurementItemId: id,
    expectedVersion: version,
    gstBasisPoints: z.number().int().min(0).max(10_000),
    scopeType: z.enum(["supply", "execution", "supply_and_execution"]),
    description: z.string().trim().min(1).max(2_000),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Enter a valid target date."),
    deliveryLocation: z.string().trim().min(1).max(500)
  }).strict()).min(1).max(500),
  vendorTerms: z.array(z.object({ vendorId: id, terms: z.string().trim().min(1).max(4_000) }).strict()).min(1).max(100)
};

function validateUniqueEntries(value: { lines: Array<{ procurementItemId: string }>; vendorTerms: Array<{ vendorId: string }> }, context: z.RefinementCtx) {
  const itemIds = new Set<string>();
  for (const [index, line] of value.lines.entries()) {
    if (itemIds.has(line.procurementItemId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["lines", index, "procurementItemId"], message: "Each procurement item must appear once." });
    itemIds.add(line.procurementItemId);
  }
  const vendorIds = new Set<string>();
  for (const [index, vendor] of value.vendorTerms.entries()) {
    if (vendorIds.has(vendor.vendorId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["vendorTerms", index, "vendorId"], message: "Each vendor must appear once." });
    vendorIds.add(vendor.vendorId);
  }
}

export const purchaseOrderRequestQuoteSchema = z.object(requestContent).strict().superRefine(validateUniqueEntries);
export const purchaseOrderRequestSubmitSchema = z.object({ ...requestContent,
  expectedRequestVersion: version.optional(), idempotencyKey: key
}).strict().superRefine(validateUniqueEntries);

export const purchaseOrderRequestDecisionSchema = z.object({
  expectedVersion: version,
  submittedRevisionId: id,
  idempotencyKey: key,
  decision: z.enum(["approve", "request_changes", "reject"]),
  reason: z.string().trim().max(2_000).nullable().default(null),
  budgetOverrideReason: z.string().trim().max(2_000).nullable().default(null)
}).strict().superRefine((value, context) => {
  if (value.decision !== "approve" && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Give a reason for this decision." });
});

export const purchaseOrderRequestQuerySchema = purchaseOrderQuerySchema;
export type PurchaseOrderRequestSubmitInput = z.infer<typeof purchaseOrderRequestSubmitSchema>;
export type PurchaseOrderRequestQuoteInput = z.infer<typeof purchaseOrderRequestQuoteSchema>;
export type PurchaseOrderRequestDecisionInput = z.infer<typeof purchaseOrderRequestDecisionSchema>;
export type PurchaseOrderRequestQuery = z.infer<typeof purchaseOrderRequestQuerySchema>;
export type PurchaseOrderRequestStatus = "pending_approval" | "changes_requested" | "rejected" | "approved";
export type PurchaseOrderRequestTotals = { netPaise: number; gstPaise: number; totalPaise: number };
export type PurchaseOrderRequestLine = ApprovedPurchaseOrderLine & {
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  allocatedWorkPaise: number;
  sectionLabel: string;
};
export type PurchaseOrderRequestSectionTotal = { sectionId: string; label: string; totals: PurchaseOrderRequestTotals };
export type PurchaseOrderRequestVendorTotal = { vendorId: string; code: string; name: string; terms: string; totals: PurchaseOrderRequestTotals };
