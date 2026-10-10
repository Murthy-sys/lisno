import type { ClientSession } from "mongoose";
import { vendorActivation } from "./vendor-readiness.service.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { VendorAccessIntentModel } from "../models/VendorAccessIntent.js";
import type { VendorWorkInvitationSource } from "../domain/user-invitations.js";

/** Called through the repository so acceptance shares its authorization/email transaction. */
export async function readVendorWorkInvitationSource(id: string, session?: ClientSession, lock = false): Promise<VendorWorkInvitationSource | null> {
  if (lock && !session) throw new Error("Vendor invitation authority requires a transaction.");
  const source = await VendorAccessIntentModel.findById(id).session(session ?? null).lean();
  if (!source) return null;
  const vendor = await AiEstimatorKnowledgeVendorModel.findOne({ _id: source.vendorId, status: "active" }).session(session ?? null).lean();
  if (!vendor?.procurementProfile || (await vendorActivation(vendor, session)).effectiveStatus !== "active") return null;
  // A setup invitation remains useful if another currently issued order still authorizes this vendor.
  const order = await ProjectPurchaseOrderModel.findOne({ vendorId: source.vendorId, approvedRevisionId: { $type: "string" }, approvedRevision: { $gte: 1 }, cancelledAt: null, status: { $ne: "cancelled" } }).select("_id version approvedRevisionId").session(session ?? null).lean();
  if (!order) return null;
  if (lock) {
    const vendorFence = await AiEstimatorKnowledgeVendorModel.updateOne({ _id: vendor._id, status: "active", dependencyEpoch: vendor.dependencyEpoch ?? 0 }, { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
    // Raw collection field is a private coordination counter, not an order/business revision.
    const orderFence = await ProjectPurchaseOrderModel.collection.updateOne({ _id: order._id, version: order.version, approvedRevisionId: order.approvedRevisionId, cancelledAt: null }, { $inc: { accessAuthorityEpoch: 1 } }, { session });
    if (vendorFence.matchedCount !== 1 || orderFence.matchedCount !== 1) return null;
  }
  const profile = vendor.procurementProfile;
  return { sourceIntentId: String(source._id), vendorId: String(source.vendorId), projectId: String(source.projectId), actorId: String(source.actorId), name: String(profile.nameOfRepresentative ?? ""), email: String(profile.email ?? ""), mobile: String(profile.phoneNumber ?? "") };
}
