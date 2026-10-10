import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { VendorDeliveryReadiness, VendorInvitationCommand } from "../contracts/vendor-access.js";
import { invitationNameSchema, normalizeInvitationMobile } from "../domain/user-invitations.js";
import { isReservedDevelopmentDemoIdentity } from "../domain/demo-identities.js";
import { ApiError } from "../middleware/errors.js";
import { ProcurementVendorInvitationIntentModel } from "../models/ProcurementVendorInvitationIntent.js";
import { createMongoRepository } from "../repositories/mongo.js";
import type { AppRepository } from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { UserInvitationService } from "./user-invitation.service.js";
import type { Clock } from "./workflow.js";
import { assertInvitationExpectation, requireVendorAccessActor, requireVendorDeliveryReady, vendorLoginContext, VENDOR_ACCESS_COOLDOWN_MS, VENDOR_ACCESS_LEASE_MS } from "./vendor-login-access.js";
export function createProcurementVendorAccessService(options: { repository: AppRepository; audit: AuditService; invitations: UserInvitationService; clock: Clock; readiness: () => VendorDeliveryReadiness; wake: () => void; externalDelivery?: boolean; allowDemoAccountExternalEmail?: boolean }) {
  const { repository, audit, invitations, clock, readiness } = options;
  async function readVendorAccess(actor: PublicUser, vendorId: string) {
    await requireVendorAccessActor(repository, actor);
    return (await vendorLoginContext(repository, vendorId, readiness(), clock())).dto;
  }
  async function sendVendorInvitation(actor: PublicUser, vendorId: string, input: VendorInvitationCommand, action: "send_invitation" | "resend_invitation") {
    requireVendorDeliveryReady(readiness());
    const digest = createHash("sha256").update(JSON.stringify({ vendorId, action, ...input })).digest("hex");
    await mongoose.connection.transaction(async session => {
      const transaction = createMongoRepository(session);
      await transaction.coordinateAuthorizationMutation();
      const issuer = await requireVendorAccessActor(transaction, actor, true);
      if (options.externalDelivery && isReservedDevelopmentDemoIdentity(issuer) && !options.allowDemoAccountExternalEmail) throw new ApiError(409, "DEMO_EXTERNAL_DELIVERY_BLOCKED", "External delivery is unavailable for this issuing identity.");
      const prior = await ProcurementVendorInvitationIntentModel.findOne({ vendorId, idempotencyKey: input.idempotencyKey }).session(session).lean();
      if (prior) {
        if (prior.actorId !== actor.id || prior.digest !== digest) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Request key was already used.");
        return;
      }
      const context = await vendorLoginContext(transaction, vendorId, readiness(), clock(), session, true);
      if (context.dto.vendorVersion !== input.expectedVendorVersion) throw new ApiError(409, "VERSION_CONFLICT", "Vendor details changed. Refresh and try again.");
      assertInvitationExpectation(context.invitation, input);
      if (context.normalized) await transaction.coordinateClientEmail(context.normalized);
      if (context.dto.blockedReasonCode) throw new ApiError(409, context.dto.blockedReasonCode, "Correct the vendor login details before sending an invitation.");
      if (context.pendingCommand || context.invitationSending) throw new ApiError(409, "DELIVERY_IN_PROGRESS", "Vendor email delivery is already pending.");
      if (context.dto.delivery.cooldownUntil) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Wait before sending another invitation.");
      if (!context.dto.availableActions.includes(action)) throw new ApiError(409, "INVITATION_NOT_ACTIONABLE", "Refresh vendor login access to see available actions.");
      requireVendorDeliveryReady(readiness());
      const id = `procurement-vendor-invitation:${randomUUID()}`;
      await ProcurementVendorInvitationIntentModel.create([{ _id: id, vendorId, actorId: actor.id, actorVersion: issuer.version, contactName: invitationNameSchema.parse(context.vendor.procurementProfile.nameOfRepresentative), contactMobile: normalizeInvitationMobile(context.vendor.procurementProfile.phoneNumber), emailNormalized: context.normalized, expectedVendorVersion: input.expectedVendorVersion, expectedInvitationId: input.invitationId, expectedInvitationVersion: input.expectedInvitationVersion, action, idempotencyKey: input.idempotencyKey, digest, state: "queued", nextAttemptAt: clock(), createdAt: clock(), updatedAt: clock() }], { session });
      await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement.vendor_invitation.requested", entityType: "procurement_vendor_invitation_intent", entityId: id, occurredAt: clock().toISOString(), newValues: { vendorId, action } }, session);
    });
    options.wake();
    return readVendorAccess(actor, vendorId);
  }
  async function processPending(limit = 20) {
    if (readiness().state !== "ready") return 0;
    const now = clock();
    await ProcurementVendorInvitationIntentModel.updateMany({ state: "queued", attempts: { $gte: 5 }, leaseUntil: { $lte: now } }, { $set: { state: "failed", failureCode: "DELIVERY_ACKNOWLEDGEMENT_UNCERTAIN", leaseUntil: null, leaseToken: null, updatedAt: now }, $inc: { version: 1 } }, { timestamps: false });
    let count = 0;
    while (count < limit && readiness().state === "ready") {
      const leaseToken = randomUUID();
      const row = await ProcurementVendorInvitationIntentModel.findOneAndUpdate({ state: "queued", attempts: { $lt: 5 }, nextAttemptAt: { $lte: clock() }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: clock() } }] }, { $set: { leaseToken, leaseUntil: new Date(clock().getTime() + VENDOR_ACCESS_LEASE_MS), updatedAt: clock() }, $inc: { attempts: 1, version: 1 } }, { returnDocument: "after", sort: { nextAttemptAt: 1, _id: 1 }, timestamps: false }).lean();
      if (!row) break;
      let accepted = false;
      try {
        const invitation = await invitations.createForProcurement({ kind: "procurement_vendor", sourceIntentId: String(row._id), vendorId: row.vendorId, emailNormalized: row.emailNormalized }, { commandId: row.idempotencyKey, resend: row.action === "resend_invitation", invitationId: row.expectedInvitationId ?? null, expectedInvitationVersion: row.expectedInvitationVersion ?? null });
        accepted = invitation.deliveryStatus !== "failed";
        if (invitation.deliveryStatus === "queued") throw new Error("Invitation delivery acknowledgement is unresolved.");
        await ProcurementVendorInvitationIntentModel.updateOne({ _id: row._id, leaseToken }, { $set: { state: invitation.deliveryStatus === "sent" ? "sent" : "failed", invitationId: invitation.id, sentAt: invitation.sentAt, failureCode: invitation.deliveryStatus === "sent" ? null : "INVITATION_DELIVERY_FAILED", leaseToken: null, leaseUntil: null, updatedAt: clock() }, $inc: { version: 1 } }, { timestamps: false });
      } catch (error) {
        if (accepted) throw error;
        const retryable = !(error instanceof ApiError) || error.status === 429 || error.status >= 500;
        const code = error instanceof ApiError && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : "VENDOR_DELIVERY_FAILED";
        await ProcurementVendorInvitationIntentModel.updateOne({ _id: row._id, leaseToken }, { $set: { state: retryable && row.attempts < 5 ? "queued" : "intervention_required", failureCode: code, leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(clock().getTime() + VENDOR_ACCESS_COOLDOWN_MS * row.attempts), updatedAt: clock() }, $inc: { version: 1 } }, { timestamps: false });
      }
      count++;
    }
    return count;
  }
  return { readVendorAccess, sendVendorInvitation, processPending };
}
