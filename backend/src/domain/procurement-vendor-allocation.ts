import { z } from "zod";
import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";
import { ApiError } from "../middleware/errors.js";

export const UNVERIFIED_VENDOR_ALLOCATION_CAP_PAISE = 5_000_000;
export const procurementVendorBaselineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0)
}).strict();
export const procurementVendorBaselineSchema = z.object({
  expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1),
  allocatedWorkPaise: z.number().int().positive().max(MAX_FINANCE_AMOUNT_PAISE),
  reason: z.string().trim().min(1).max(2000),
  idempotencyKey: z.string().trim().min(1).max(200)
}).strict();

export interface VendorAllocationTotals { totalAllocatedWorkPaise: bigint; unknownItemCount: number }

/** A reduction remains possible after a truthful downgrade or historical correction. */
export function assertVendorAllocationAllowed(input: VendorAllocationTotals & {
  physicallyVerified: boolean;
  previousItemPaise: number;
  nextItemPaise: number;
}): void {
  if (input.nextItemPaise <= input.previousItemPaise || input.physicallyVerified) return;
  if (input.unknownItemCount > 0) throw new ApiError(409, "PROCUREMENT_VENDOR_ALLOCATION_BASELINE_INCOMPLETE",
    "This vendor has unrecorded historical allocations. Ask Super Admin to complete the allocation baseline before increasing work.",
    { allocatedWorkPaise: "Complete this vendor's historical allocation baseline before allocating more work." });
  const projected = input.totalAllocatedWorkPaise - BigInt(input.previousItemPaise) + BigInt(input.nextItemPaise);
  if (projected > BigInt(UNVERIFIED_VENDOR_ALLOCATION_CAP_PAISE)) throw new ApiError(409, "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED",
    "Vendors without a physically verified current address may have up to ₹50,000 of allocated work.",
    { allocatedWorkPaise: "This amount exceeds the vendor's ₹50,000 allocation limit." });
}

export function invalidAllocation(message: string): never {
  throw new ApiError(400, "PROCUREMENT_ALLOCATION_INVALID", message, { allocatedWorkPaise: message });
}
