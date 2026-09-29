import type { ClientSession } from "mongoose";
import type { VendorKpiVendorType } from "../domain/vendor-kpi.js";
import { VendorInductionReviewModel } from "../models/VendorInduction.js";

/** The newest immutable decision is authoritative; publishing a later draft does not revoke it. */
export async function currentVendorInductionApproval(vendorId: string, vendorType: VendorKpiVendorType | null, session?: ClientSession): Promise<boolean> {
  if (!vendorType) return false;
  const query = VendorInductionReviewModel.findOne({ vendorId }).sort({ version: -1 }).select({ decision: 1, vendorType: 1 });
  if (session) query.session(session);
  const review = await query.lean().exec();
  return review?.decision === "approved" && review.vendorType === vendorType;
}

export async function vendorInductionApprovals(
  vendors: readonly Record<string, any>[], session?: ClientSession
): Promise<Map<string, boolean>> {
  const ids = vendors.map(vendor => String(vendor._id));
  const result = new Map(ids.map(id => [id, false]));
  if (!ids.length) return result;
  const query = VendorInductionReviewModel.find({ vendorId: { $in: ids } }).sort({ vendorId: 1, version: -1 })
    .select({ vendorId: 1, version: 1, decision: 1, vendorType: 1 });
  if (session) query.session(session);
  const rows = await query.lean().exec();
  const latest = new Map<string, { decision: string; vendorType: string }>();
  for (const row of rows) if (!latest.has(String(row.vendorId))) latest.set(String(row.vendorId), row);
  for (const vendor of vendors) {
    const row = latest.get(String(vendor._id));
    result.set(String(vendor._id), !!row && row.decision === "approved" && row.vendorType === vendor.procurementProfile?.vendorType);
  }
  return result;
}
