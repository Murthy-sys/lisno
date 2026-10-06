import type { ClientSession } from "mongoose";
import { ApiError } from "../middleware/errors.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";

/** Old approval paths cannot commit a source line already issued by a basket award. */
export async function assertNoIssuedBasketSourceOverlap(projectId: string, sourceLineItemKeys: readonly string[],
  session: ClientSession): Promise<void> {
  if (!sourceLineItemKeys.length) return;
  const tenderOrders = await ProjectPurchaseOrderModel.find({ projectId, tenderAwardId: { $type: "string" },
    approvedRevisionId: { $ne: null }, cancelledAt: null }).select({ approvedRevisionId: 1 }).session(session).lean();
  if (!tenderOrders.length) return;
  const overlapping = await ProjectPurchaseOrderRevisionModel.exists({ projectId,
    _id: { $in: tenderOrders.map(order => order.approvedRevisionId) },
    "lines.sourceLineItemKey": { $in: sourceLineItemKeys } }).session(session);
  if (overlapping) throw new ApiError(409, "PURCHASE_ORDER_BASKET_SCOPE_CONFLICT",
    "A basket work order already commits an approved estimate line in this order. Refresh procurement before approval.");
}
