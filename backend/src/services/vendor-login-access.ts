import type { ClientSession } from "mongoose";
import { hasPermission } from "../domain/authorization.js";
import { isReservedDemoEmail } from "../domain/demo-identities.js";
import { invitationEmailSchema, invitationMobileSchema, invitationNameSchema, normalizeInvitationEmail, presentationStatusForInvitation } from "../domain/user-invitations.js";
import type { VendorAccessDelivery, VendorDeliveryReadiness, VendorLoginAccess } from "../contracts/vendor-access.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProcurementVendorInvitationIntentModel } from "../models/ProcurementVendorInvitationIntent.js";
import { VendorAccessIntentModel } from "../models/VendorAccessIntent.js";
import type { AppRepository, UserInvitationRecord } from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import { invitationAuthorityMatches } from "./user-invitation.service.js";
import { vendorActivation } from "./vendor-readiness.service.js";
import { requireActor } from "./workflow.js";
export const VENDOR_ACCESS_COOLDOWN_MS = 60_000;
export const VENDOR_ACCESS_LEASE_MS = 15 * 60_000;
export async function requireVendorAccessActor(repository: AppRepository, actor: PublicUser, manage = false) {
  const user = await requireActor(repository, actor);
  if (!hasPermission(user.role, "procurement.vendor_directory.read") || !hasPermission(user.role, manage ? "procurement.vendor_access.manage" : "procurement.vendor_access.read") || (user.role === "super_admin" && await repository.countActiveUsersByRole("super_admin") !== 1)) throw new ApiError(403, "FORBIDDEN", "Vendor login access is unavailable for this account.");
  return user;
}
export function requireVendorDeliveryReady(readiness: VendorDeliveryReadiness) {
  if (readiness.state !== "ready") throw new ApiError(409, readiness.reasonCode ?? "DELIVERY_UNAVAILABLE", readiness.state === "paused" ? "Vendor email delivery is paused. Ask Super Admin to enable delivery." : "Vendor email delivery is unavailable. Configure an email provider before sending.");
}
export function vendorDeliveryDto(row: any, now: Date): VendorAccessDelivery {
  const inFlight = row?.leaseUntil && new Date(row.leaseUntil).getTime() > now.getTime();
  const cooldownAt = row?.updatedAt ? new Date(row.updatedAt).getTime() + VENDOR_ACCESS_COOLDOWN_MS : 0;
  return { state: row ? inFlight ? "sending" : row.state : "not_requested", failureCode: row?.failureCode ?? null, sentAt: row?.sentAt ? new Date(row.sentAt).toISOString() : null, updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null, cooldownUntil: cooldownAt > now.getTime() ? new Date(cooldownAt).toISOString() : null };
}
export async function vendorLoginContext(repository: AppRepository, vendorId: string, readiness: VendorDeliveryReadiness, now: Date, session?: ClientSession, lock = false) {
  const vendor = await AiEstimatorKnowledgeVendorModel.findById(vendorId).session(session ?? null).lean();
  if (!vendor) throw new ApiError(404, "NOT_FOUND", "Vendor was not found.");
  if (lock) {
    const fence = await AiEstimatorKnowledgeVendorModel.updateOne({ _id: vendorId, version: vendor.version ?? 1, dependencyEpoch: vendor.dependencyEpoch ?? 0 }, { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
    if (fence.matchedCount !== 1) throw new ApiError(409, "VERSION_CONFLICT", "Refresh vendor details and try again.");
  }
  const profile = vendor.procurementProfile;
  const email = invitationEmailSchema.safeParse(profile?.email);
  const normalized = email.success ? normalizeInvitationEmail(email.data) : null;
  const accounts = await repository.findVendorBoundUsers(vendorId);
  const contactAccount = normalized ? await repository.findUserByEmail(normalized) : null;
  const invitation = normalized ? await repository.findPendingUserInvitationByEmail(normalized) : null;
  const account = accounts[0];
  let blockedReasonCode: string | null = null;
  if (vendor.status !== "active" || (await vendorActivation(vendor, session)).effectiveStatus !== "active") blockedReasonCode = "VENDOR_UNAVAILABLE";
  else if (accounts.length > 1) blockedReasonCode = "VENDOR_ACCOUNT_AMBIGUOUS";
  else if (account && (!account.active || account.role !== "vendor")) blockedReasonCode = "VENDOR_ACCOUNT_UNAVAILABLE";
  else if (contactAccount && contactAccount.id !== account?.id) blockedReasonCode = "VENDOR_EMAIL_CONFLICT";
  else if (!account && (!normalized || !invitationNameSchema.safeParse(profile?.nameOfRepresentative).success || !invitationMobileSchema.safeParse(profile?.phoneNumber).success)) blockedReasonCode = "VENDOR_CONTACT_INVALID";
  else if (normalized && isReservedDemoEmail(normalized)) blockedReasonCode = "DEMO_EXTERNAL_DELIVERY_BLOCKED";
  else if (!account && normalized && await repository.hasUnclaimedClientProjectByEmail(normalized)) blockedReasonCode = "VENDOR_EMAIL_CONFLICT";
  else if (!account && invitation && (invitation.role !== "vendor" || invitation.vendorId !== vendorId || !invitation.authority || !await invitationAuthorityMatches(repository, invitation, lock))) blockedReasonCode = "INVITATION_STAFF_ACTION_REQUIRED";
  const manual = await ProcurementVendorInvitationIntentModel.findOne({ vendorId }).sort({ createdAt: -1, _id: -1 }).session(session ?? null).lean();
  const order = await VendorAccessIntentModel.findOne({ vendorId }).sort({ updatedAt: -1, _id: -1 }).session(session ?? null).lean();
  const latest = manual && order ? new Date(manual.updatedAt).getTime() >= new Date(order.updatedAt).getTime() ? manual : order : manual ?? order;
  const delivery = vendorDeliveryDto(latest, now);
  const pendingCommand = await ProcurementVendorInvitationIntentModel.exists({ vendorId, state: "queued" }).session(session ?? null);
  const invitationSending = invitation?.deliveryStatus === "queued" && now.getTime() - Date.parse(invitation.issuedAt) < VENDOR_ACCESS_LEASE_MS;
  const cooldown = invitation ? Date.parse(invitation.issuedAt) + VENDOR_ACCESS_COOLDOWN_MS : 0;
  if (cooldown > now.getTime() && (!delivery.cooldownUntil || cooldown > Date.parse(delivery.cooldownUntil))) delivery.cooldownUntil = new Date(cooldown).toISOString();
  const access: VendorLoginAccess["access"] = blockedReasonCode ? "blocked" : account ? "active" : invitation ? "setup_pending" : "unknown";
  const available = !blockedReasonCode && !account && readiness.state === "ready" && !pendingCommand && !invitationSending && !delivery.cooldownUntil;
  const dto: VendorLoginAccess = { vendorId, vendorName: String(vendor.name ?? "Vendor"), vendorVersion: vendor.version ?? 1, recipient: account ? { name: account.name, email: account.email } : normalized ? { name: String(profile?.nameOfRepresentative ?? ""), email: email.success ? email.data : normalized } : null, access, invitation: invitation ? { id: invitation.id, version: invitation.version, status: presentationStatusForInvitation({ storedStatus: invitation.status, expiresAt: invitation.expiresAt, deliveryStatus: invitation.deliveryStatus, now: now.toISOString() }), deliveryStatus: invitation.deliveryStatus, expiresAt: invitation.expiresAt } : null, delivery, readiness, availableActions: available ? [invitation ? "resend_invitation" : "send_invitation"] : [], blockedReasonCode };
  return { dto, vendor, invitation, account, normalized, pendingCommand: !!pendingCommand, invitationSending: !!invitationSending };
}
export function assertInvitationExpectation(invitation: UserInvitationRecord | null, input: { invitationId: string | null; expectedInvitationVersion: number | null }) {
  if ((invitation?.id ?? null) !== input.invitationId || (invitation?.version ?? null) !== input.expectedInvitationVersion) throw new ApiError(409, "VERSION_CONFLICT", "Vendor invitation changed. Refresh and try again.");
}
