import type { ClientSession } from "mongoose";
import { hasPermission } from "../domain/authorization.js";
import { invitationEmailSchema, invitationNameSchema, invitationMobileSchema, normalizeInvitationEmail, type ProcurementVendorInvitationSource } from "../domain/user-invitations.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProcurementVendorInvitationIntentModel } from "../models/ProcurementVendorInvitationIntent.js";
import { UserModel } from "../models/User.js";
import { vendorActivation } from "./vendor-readiness.service.js";

/** Source validation participates in invitation acceptance's authorization and email transaction. */
export async function readProcurementVendorInvitationSource(id: string, session?: ClientSession, lock = false): Promise<ProcurementVendorInvitationSource | null> {
  if (lock && !session) throw new Error("Procurement invitation authority requires a transaction.");
  const intent = await ProcurementVendorInvitationIntentModel.findById(id).session(session ?? null).lean();
  if (!intent) return null;
  const actor = await UserModel.findById(intent.actorId).session(session ?? null).lean();
  if (!actor?.active || actor.version !== intent.actorVersion || !hasPermission(actor.role, "procurement.vendor_access.manage") || !hasPermission(actor.role, "procurement.vendor_directory.read")) return null;
  if (actor.role === "super_admin" && await UserModel.countDocuments({ role: "super_admin", active: true }).session(session ?? null) !== 1) return null;
  const vendor = await AiEstimatorKnowledgeVendorModel.findOne({ _id: intent.vendorId, status: "active" }).session(session ?? null).lean();
  if (!vendor?.procurementProfile || (await vendorActivation(vendor, session)).effectiveStatus !== "active") return null;
  const profile = vendor.procurementProfile;
  const email = invitationEmailSchema.safeParse(profile.email);
  const name = invitationNameSchema.safeParse(profile.nameOfRepresentative);
  const mobile = invitationMobileSchema.safeParse(profile.phoneNumber);
  if (!email.success || !name.success || !mobile.success || normalizeInvitationEmail(email.data) !== intent.emailNormalized || name.data !== intent.contactName || mobile.data !== intent.contactMobile) return null;
  if (lock) {
    const fence = await AiEstimatorKnowledgeVendorModel.updateOne({ _id: vendor._id, status: "active", dependencyEpoch: vendor.dependencyEpoch ?? 0 }, { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
    if (fence.matchedCount !== 1) return null;
  }
  return { sourceIntentId: String(intent._id), vendorId: String(intent.vendorId), actorId: String(intent.actorId), actorVersion: intent.actorVersion, name: String(profile.nameOfRepresentative ?? ""), email: email.data, mobile: String(profile.phoneNumber ?? "") };
}
