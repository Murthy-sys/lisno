import type { ClientSession } from "mongoose";
import { assertVendorAllocationAllowed, invalidAllocation, UNVERIFIED_VENDOR_ALLOCATION_CAP_PAISE, type VendorAllocationTotals } from "../domain/procurement-vendor-allocation.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { vendorActivation } from "./vendor-readiness.service.js";

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
    { $match: { vendorId, removedAt: null } },
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
  const increasesAllocation = !!input.vendorId && amount != null && amount > (vendorChanged ? 0 : previous ?? 0);
  const needsActiveVendor = !!input.vendorId && (!input.current || vendorChanged || increasesAllocation);
  const activation = vendor && (needsActiveVendor || increasesAllocation) ? await vendorActivation(vendor, session) : null;
  if (needsActiveVendor && activation?.effectiveStatus !== "active") {
    throw new ApiError(400, "VALIDATION_ERROR", "Choose an active reference.", { vendorId: "This vendor is no longer available. Choose an active option." });
  }
  if (input.vendorId && amount != null) {
    const previousItemPaise = vendorChanged ? 0 : previous ?? 0;
    if (amount > previousItemPaise) {
      assertVendorAllocationAllowed({ ...await procurementVendorAllocationTotals(input.vendorId, session),
        physicallyVerified: activation?.gates.physicalAddressVerified === true,
        previousItemPaise, nextItemPaise: amount });
    }
  }
  return { allocatedWorkPaise: amount ?? null,
    allocationTrackingVersion: !input.current || vendorChanged || input.allocatedWorkPaise !== undefined ? 1 : input.current.allocationTrackingVersion ?? null,
    vendor };
}

/** Recheck the live allocation, including other approved orders, at the approval boundary. */
export async function assertPurchaseOrderAllocations(input: {
  projectId: string;
  lines: readonly { procurementItemId: string; procurementItemVersion: number; totalPaise: number; }[];
  excludeOrderIds?: readonly string[];
}, session: ClientSession): Promise<void> {
  if (!session.inTransaction()) throw new Error("Purchase-order allocation checks require a transaction.");
  const ids = input.lines.map(line => line.procurementItemId);
  if (new Set(ids).size !== ids.length) throw new ApiError(409, "PURCHASE_ORDER_ALLOCATION_CONFLICT", "An item appears more than once in this approval.");
  const items = await ProjectProcurementItemModel.find({ _id: { $in: ids }, projectId: input.projectId, removedAt: null }).session(session).lean() as Row[];
  if (items.length !== ids.length) throw new ApiError(409, "PURCHASE_ORDER_ALLOCATION_CONFLICT", "An order item is no longer available. Refresh before approval.");
  const byId = new Map(items.map(item => [String(item._id), item]));
  const vendors = await lockProcurementVendors(items.map(item => item.vendorId), session);
  for (const [vendorId, vendor] of vendors) {
    const activation = await vendorActivation(vendor, session);
    if (activation.effectiveStatus !== "active") throw new ApiError(409, "PURCHASE_ORDER_VENDOR_NOT_READY", "Activate every selected vendor and complete both KPIs before approval.");
    if (activation.gates?.physicalAddressVerified !== true) {
      const allocation = await procurementVendorAllocationTotals(vendorId, session);
      if (allocation.unknownItemCount > 0 || allocation.totalAllocatedWorkPaise > BigInt(UNVERIFIED_VENDOR_ALLOCATION_CAP_PAISE)) {
        throw new ApiError(409, "PURCHASE_ORDER_VENDOR_ALLOCATION_CAP_CONFLICT", "A vendor without physical verification has an incomplete or over-limit allocation across projects.");
      }
    }
  }
  if (vendors.size !== new Set(items.map(item => item.vendorId)).size) throw new ApiError(409, "PURCHASE_ORDER_VENDOR_NOT_READY", "An assigned vendor is no longer available.");
  const approvedOrders = await ProjectPurchaseOrderModel.find({ projectId: input.projectId,
    _id: { $nin: input.excludeOrderIds ?? [] }, approvedRevisionId: { $ne: null }, cancelledAt: null
  }).select({ _id: 1, approvedRevisionId: 1 }).session(session).lean() as Row[];
  const revisions = await ProjectPurchaseOrderRevisionModel.find({ _id: { $in: approvedOrders.map(order => order.approvedRevisionId) } })
    .select({ _id: 1, lines: 1 }).session(session).lean() as Row[];
  if (revisions.length !== approvedOrders.length) throw new ApiError(409, "PURCHASE_ORDER_ALLOCATION_CONFLICT", "An approved purchase-order revision is missing.");
  const prior = new Map<string, bigint>();
  for (const revision of revisions) for (const line of revision.lines as Row[]) {
    const id = String(line.procurementItemId);
    if (byId.has(id)) prior.set(id, (prior.get(id) ?? 0n) + BigInt(line.totalPaise));
  }
  for (const line of input.lines) {
    const item = byId.get(line.procurementItemId)!;
    if (item.version !== line.procurementItemVersion || !Number.isSafeInteger(item.allocatedWorkPaise) || item.allocatedWorkPaise <= 0 ||
      (prior.get(line.procurementItemId) ?? 0n) + BigInt(line.totalPaise) > BigInt(item.allocatedWorkPaise)) {
      throw new ApiError(409, "PURCHASE_ORDER_ALLOCATION_CONFLICT", "The tax-inclusive order amount exceeds its current recorded item allocation, or the item changed. Refresh the order or allocation.");
    }
  }
}
