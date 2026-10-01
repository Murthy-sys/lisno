import { z } from "zod";

const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);
const idempotencyKey = z.string().trim().min(8).max(128);
export const vendorWorkQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0)
}).strict();
export type VendorWorkQuery = z.infer<typeof vendorWorkQuerySchema>;
export const clientVendorWorkQuerySchema = vendorWorkQuerySchema;
export type ClientVendorWorkQuery = VendorWorkQuery;

export const vendorWorkProgressSchema = z.object({
  expectedVersion: version,
  idempotencyKey,
  progress: z.number().int().min(0).max(100),
  note: z.string().trim().max(2_000).default("")
}).strict();

export const vendorWorkUploadSchema = z.object({
  expectedVersion: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey
}).strict();

export const vendorWorkSubmitSchema = z.object({
  expectedVersion: version,
  idempotencyKey,
  note: z.string().trim().min(1).max(2_000)
}).strict();

export const clientVendorWorkDecisionSchema = z.object({
  expectedVersion: version,
  idempotencyKey,
  decision: z.enum(["approve", "request_changes"]),
  reason: z.string().trim().max(2_000).nullable().default(null)
}).strict().superRefine((input, context) => {
  if (input.decision === "request_changes" && !input.reason) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["reason"],
    message: "Describe the changes needed for this section."
  });
});

export type VendorWorkProgressInput = z.infer<typeof vendorWorkProgressSchema>;
export type VendorWorkUploadInput = z.infer<typeof vendorWorkUploadSchema>;
export type VendorWorkSubmitInput = z.infer<typeof vendorWorkSubmitSchema>;
export type ClientVendorWorkDecisionInput = z.infer<typeof clientVendorWorkDecisionSchema>;

export type VendorWorkStatus = "awaiting_vendor_access" | "ready" | "in_progress" | "submitted_for_client" | "changes_requested" | "client_approved" | "superseded";

export function vendorWorkAssignmentId(orderId: string, revision: number, lineId: string): string {
  // Stable ID supports transactional upsert and replays without joining by labels.
  return `vendor-work:${orderId}:${revision}:${lineId}`;
}

export function vendorWorkReviewId(assignmentId: string, round: number): string {
  return `vendor-work-review:${assignmentId}:${round}`;
}

export function mayUpdateVendorWork(status: VendorWorkStatus): boolean {
  return status === "awaiting_vendor_access" || status === "ready" || status === "in_progress" || status === "changes_requested";
}

export function nextVendorWorkProgressStatus(status: VendorWorkStatus): VendorWorkStatus {
  if (!mayUpdateVendorWork(status)) throw new Error("Vendor work is not editable in this state.");
  return "in_progress";
}
