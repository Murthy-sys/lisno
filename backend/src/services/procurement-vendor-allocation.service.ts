import type { ClientSession } from "mongoose";
import { assertVendorAllocationAllowed, invalidAllocation, type VendorAllocationTotals } from "../domain/procurement-vendor-allocation.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";

type Row = Record<string, any>;

/** Also serializes with profile verification and lifecycle writes on the same vendor. */
export async function lockProcurementVendors(ids: readonly (string | null | undefined)[], session: ClientSession): Promise<Map<string, Row>> {
  if (!session.inTransaction()) throw new Error("Vendor allocation locks require a transaction.");
  const result = new Map<string, Row>();
  for (const id of [...new Set(ids.filter((id): id is string => Boolean(id)))].sort()) {
    const vendor = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: id }, { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
    if (vendor) result.set(id, vendor);
  }
  return result;
}

/** One indexed source across all projects and estimate versions; Decimal128 avoids double overflow. */
export async function procurementVendorAllocationTotals(vendorId: string, session: ClientSession): Promise<VendorAllocationTotals> {
  const [row] = await ProjectProcurementItemModel.aggregate([
    { $match: { vendorId } },
    { $group: {
      _id: null,
      total: { $sum: { $toDecimal: { $ifNull: ["$allocatedWorkPaise", 0] } } },
      unknown: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$allocatedWorkPaise", null] }, null] }, 1, 0] } }
    } }
  ]).session(session);
  return { totalAllocatedWorkPaise: row ? BigInt(row.total.toString()) : 0n, unknownItemCount: row?.unknown ?? 0 };
}

/** Resolve omission before checking the shared cap. No caller can manufacture a historical exception. */
export async function prepareProcurementAllocation(input: {
  current?: Row;
  vendorId: string | null;
  allocatedWorkPaise?: number | null;
}, session: ClientSession): Promise<{ allocatedWorkPaise: number | null; allocationTrackingVersion: number | null; vendor: Row | null }> {
  const currentVendorId: string | null = input.current?.vendorId ?? null;
  const previous: number | null = input.current?.allocatedWorkPaise ?? null;
  const vendorChanged = currentVendorId !== input.vendorId;
  const amount = input.vendorId === null ? null : input.allocatedWorkPaise === undefined && !vendorChanged ? previous : input.allocatedWorkPaise;
  if (!input.vendorId && input.allocatedWorkPaise != null) invalidAllocation("Select a vendor before entering an allocated work amount.");
  if (input.vendorId && (input.allocatedWorkPaise === null || ((!input.current || vendorChanged) && amount == null))) invalidAllocation("Enter a positive allocated work amount for this vendor.");
  const vendors = await lockProcurementVendors([currentVendorId, input.vendorId], session);
  const vendor = input.vendorId ? vendors.get(input.vendorId) ?? null : null;
  if (input.vendorId && (!input.current || vendorChanged) && vendor?.status !== "active") {
    throw new ApiError(400, "VALIDATION_ERROR", "Choose an active reference.", { vendorId: "This vendor is no longer available. Choose an active option." });
  }
  if (input.vendorId && amount != null) {
    const previousItemPaise = vendorChanged ? 0 : previous ?? 0;
    if (amount > previousItemPaise) {
      if (vendor?.status !== "active") throw new ApiError(400, "VALIDATION_ERROR", "Choose an active reference.", { vendorId: "This vendor is no longer available for increased allocation." });
      assertVendorAllocationAllowed({ ...await procurementVendorAllocationTotals(input.vendorId, session),
        physicallyVerified: vendor.procurementProfile?.currentAddressVerifiedPhysically === true,
        previousItemPaise, nextItemPaise: amount });
    }
  }
  return { allocatedWorkPaise: amount ?? null,
    allocationTrackingVersion: !input.current || vendorChanged || input.allocatedWorkPaise !== undefined ? 1 : input.current.allocationTrackingVersion ?? null,
    vendor };
}
