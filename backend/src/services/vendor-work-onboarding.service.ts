import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { invitationEmailSchema, invitationMobileSchema, invitationNameSchema, normalizeInvitationEmail } from "../domain/user-invitations.js";
import { isReservedDemoEmail, isReservedDevelopmentDemoIdentity } from "../domain/demo-identities.js";
import { ApiError } from "../middleware/errors.js";
import { VendorAccessIntentModel } from "../models/VendorAccessIntent.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import type { AppRepository } from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { InvitationMailer } from "./invitation-mailer.js";
import { createUserInvitationService } from "./user-invitation.service.js";
import type { VendorWorkMailer } from "./vendor-work-mailer.js";
import { createMongoRepository } from "../repositories/mongo.js";
import type { VendorOrderAccessCommand, VendorOrderAccessPage, VendorDeliveryReadiness, VendorOrderAccess } from "../contracts/vendor-access.js";
import { createProcurementVendorAccessService } from "./procurement-vendor-access.service.js";
import { assertInvitationExpectation, requireVendorAccessActor, requireVendorDeliveryReady, vendorDeliveryDto, vendorLoginContext } from "./vendor-login-access.js";
import type { Clock } from "./workflow.js";

export interface VendorAccessIssuedSource { orderId: string; projectId: string; vendorId: string; revision: number; approvedRevisionId: string; actorId: string; occurredAt: Date | string }
export type VendorAccessIntentDto = VendorOrderAccess;
export interface VendorWorkOnboardingOptions {
  repository: AppRepository; audit: AuditService; invitationMailer: InvitationMailer; workMailer: VendorWorkMailer; clock: Clock;
  authorizeProject: (actor: PublicUser, projectId: string, session?: ClientSession, mutation?: boolean) => Promise<unknown>;
  allowDemoAccountExternalEmail?: boolean;
  pollIntervalMs?: number;
  deliveryEnabled?: boolean;
}
const LEASE_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60_000;
const failure = (code: string) => new ApiError(409, code, "Vendor access needs staff attention.");
export const vendorAccessIntentId = (source: Pick<VendorAccessIssuedSource, "orderId" | "revision" | "vendorId">) => `vendor-access:${source.orderId}:${source.revision}:${source.vendorId}`;

/** Issuance commits only durable intent. All external delivery happens after that transaction. */
export function createVendorWorkOnboardingService(options: VendorWorkOnboardingOptions) {
  const { repository, audit, invitationMailer, workMailer, clock, authorizeProject } = options;
  const invitations = createUserInvitationService({ repository, audit, mailer: invitationMailer, clock, allowDemoAccountExternalEmail: options.allowDemoAccountExternalEmail });
  let timer: ReturnType<typeof setInterval> | null = null;
  let running: Promise<number> | null = null;
  let pendingWake = false;
  let stopped = false;
  let lastProcessedAt: string | null = null;
  function readiness(): VendorDeliveryReadiness {
    return { state: options.deliveryEnabled === false ? "paused" : invitationMailer.deliveryKind === "disabled" || workMailer.deliveryKind === "disabled" ? "unavailable" : "ready", reasonCode: options.deliveryEnabled === false ? "DELIVERY_PAUSED" : invitationMailer.deliveryKind === "disabled" || workMailer.deliveryKind === "disabled" ? "DELIVERY_UNAVAILABLE" : null, lastProcessedAt };
  }
  const procurement = createProcurementVendorAccessService({ repository, audit, invitations, clock, readiness, wake, externalDelivery: invitationMailer.deliveryKind === "external", allowDemoAccountExternalEmail: options.allowDemoAccountExternalEmail });

  async function recordIssued(source: VendorAccessIssuedSource, session: ClientSession): Promise<void> {
    if (!session.inTransaction()) throw new Error("Recording vendor access requires the issuing transaction.");
    const now = new Date(source.occurredAt);
    const delivery = readiness();
    await VendorAccessIntentModel.updateOne({ _id: vendorAccessIntentId(source) }, { $setOnInsert: { projectId: source.projectId, vendorId: source.vendorId, orderId: source.orderId, revision: source.revision, approvedRevisionId: source.approvedRevisionId, actorId: source.actorId, occurredAt: now, createdAt: now, updatedAt: now, state: delivery.state === "ready" ? "queued" : "delivery_unavailable", failureCode: delivery.reasonCode, dispatchAuthorizedAt: delivery.state === "ready" ? now : null, dispatchAuthorization: delivery.state === "ready" ? "issuance" : null, access: "unknown", version: 1, attempts: 0, nextAttemptAt: now } }, { upsert: true, session, runValidators: true, timestamps: false });
  }
  async function settle(id: string, leaseToken: string, change: Record<string, unknown>) {
    await VendorAccessIntentModel.updateOne({ _id: id, leaseToken }, { $set: { ...change, leaseToken: null, leaseUntil: null, updatedAt: clock() }, $inc: { version: 1 } }, { timestamps: false });
  }
  async function deliver(row: any, leaseToken: string) {
    const id = String(row._id);
    let providerAccepted = false;
    try {
      // Never substitute a new revision for this intent's source.
      const currentOrder = await ProjectPurchaseOrderModel.exists({ _id: row.orderId, projectId: row.projectId, vendorId: row.vendorId, approvedRevision: row.revision, approvedRevisionId: row.approvedRevisionId, cancelledAt: null, status: { $ne: "cancelled" } });
      if (!currentOrder) { await settle(id, leaseToken, { state: "cancelled", access: "blocked", failureCode: "ISSUED_WORK_UNAVAILABLE" }); return; }
      const source = await repository.findVendorWorkInvitationSource(id);
      if (!source) throw failure("VENDOR_UNAVAILABLE");
      const accounts = await repository.findVendorBoundUsers(row.vendorId);
      if (accounts.length > 1) throw failure("VENDOR_ACCOUNT_AMBIGUOUS");
      const account = accounts[0];
      if (account && (!account.active || account.role !== "vendor")) throw failure("VENDOR_ACCOUNT_UNAVAILABLE");
      const contactEmail = invitationEmailSchema.safeParse(source.email);
      const recipient = account ? { name: account.name, email: account.email } : { name: source.name, email: source.email };
      if (!invitationEmailSchema.safeParse(recipient.email).success || !invitationNameSchema.safeParse(recipient.name).success || (!account && !invitationMobileSchema.safeParse(source.mobile).success)) throw failure("VENDOR_CONTACT_INVALID");
      const recipientEmail = normalizeInvitationEmail(recipient.email);
      if (isReservedDemoEmail(recipientEmail)) throw failure("DEMO_EXTERNAL_DELIVERY_BLOCKED");
      if (!account && await repository.findUserByEmail(recipientEmail)) throw failure("VENDOR_EMAIL_CONFLICT");
      // For active accounts, notify the bound account; edited contact never rebinds that account.
      const contactAccount = contactEmail.success ? await repository.findUserByEmail(normalizeInvitationEmail(contactEmail.data)) : null;
      if (account && contactAccount && contactAccount.id !== account.id) throw failure("VENDOR_EMAIL_CONFLICT");
      const mailer = account ? workMailer : invitationMailer;
      if (mailer.deliveryKind === "disabled") { await settle(id, leaseToken, { state: "delivery_unavailable", access: account ? "active" : "unknown", failureCode: "DELIVERY_UNAVAILABLE" }); return; }
      const issuingActor = await repository.findUserById(source.actorId);
      if (mailer.deliveryKind === "external" && ((issuingActor && isReservedDevelopmentDemoIdentity(issuingActor)) || (account && isReservedDevelopmentDemoIdentity(account))) && !options.allowDemoAccountExternalEmail) throw failure("DEMO_EXTERNAL_DELIVERY_BLOCKED");
      if (account) {
        if (workMailer.deliveryKind === "disabled") return;
        // Revalidate source/account just before the provider call. A later revoke still makes login fail.
        const fresh = await repository.findUserById(account.id);
        if (!fresh?.active || fresh.vendorId !== row.vendorId || fresh.role !== "vendor" || fresh.emailNormalized !== account.emailNormalized || !(await repository.findVendorWorkInvitationSource(id))) throw failure("VENDOR_ACCOUNT_UNAVAILABLE");
        await workMailer.sendNewWork({ recipient, projectId: row.projectId, orderId: row.orderId, setupPending: false });
        providerAccepted = true;
        await settle(id, leaseToken, { state: "sent", access: "active", failureCode: null, sentAt: clock() });
      } else {
        const before = await repository.findPendingUserInvitationByEmail(recipientEmail);
        const invitation = await invitations.createForVendorWork({ kind: "vendor_work_order", sourceIntentId: id, vendorId: row.vendorId, emailNormalized: recipientEmail }, row.requestedAction === "resend_invitation" ? { commandId: row.requestedCommandId, resend: true, invitationId: row.expectedInvitationId, expectedInvitationVersion: row.expectedInvitationVersion, actorId: row.requestedById ?? row.actorId } : undefined);
        if (invitation.deliveryStatus === "queued") { providerAccepted = true; throw new Error("Invitation delivery acknowledgement is unresolved."); }
        if (invitation.deliveryStatus !== "sent") { await settle(id, leaseToken, { state: "failed", access: "setup_pending", invitationId: invitation.id, failureCode: "INVITATION_DELIVERY_FAILED", nextAttemptAt: new Date(clock().getTime() + COOLDOWN_MS * Math.max(1, row.attempts)) }); return; }
        // Reused valid setup still requires this order's work notification to be accepted.
        const reuseNotification = row.requestedAction !== "resend_invitation" && before?.id === invitation.id && before.deliveryStatus === "sent" && workMailer.deliveryKind !== "disabled";
        providerAccepted = !reuseNotification;
        if (reuseNotification) {
          await workMailer.sendNewWork({ recipient, projectId: row.projectId, orderId: row.orderId, setupPending: true });
          providerAccepted = true;
        }
        await settle(id, leaseToken, { state: "sent", access: "setup_pending", invitationId: invitation.id, failureCode: null, sentAt: clock() });
      }
    } catch (error) {
      // An uncertain post-send commit keeps the lease; never classify it as a provider rejection.
      if (providerAccepted) throw error;
      const retryable = !(error instanceof ApiError) || error.status === 429 || error.status >= 500;
      const code = error instanceof ApiError ? error.code : "VENDOR_DELIVERY_FAILED";
      await settle(id, leaseToken, { state: retryable ? "failed" : "intervention_required", access: "blocked", failureCode: /^[A-Z0-9_]{1,64}$/.test(code) ? code : "VENDOR_DELIVERY_FAILED", nextAttemptAt: new Date(clock().getTime() + COOLDOWN_MS * Math.max(1, row.attempts)) });
    }
  }
  async function processPending(limit = 20): Promise<number> {
    if (readiness().state !== "ready") return 0;
    lastProcessedAt = clock().toISOString();
    await VendorAccessIntentModel.updateMany({ dispatchAuthorizedAt: { $type: "date" }, state: "queued", attempts: { $gte: MAX_ATTEMPTS }, leaseUntil: { $lte: clock() } },
      { $set: { state: "failed", failureCode: "DELIVERY_ACKNOWLEDGEMENT_UNCERTAIN", leaseToken: null, leaseUntil: null, updatedAt: clock() }, $inc: { version: 1 } }, { timestamps: false });
    let count = 0;
    while (count < Math.max(1, Math.min(limit, 100))) {
      const now = clock(); const leaseToken = randomUUID();
      const row = await VendorAccessIntentModel.findOneAndUpdate({ dispatchAuthorizedAt: { $type: "date" }, state: { $in: ["queued", "failed"] }, attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }, { $set: { leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now }, $inc: { attempts: 1, version: 1 } }, { returnDocument: "after", sort: { nextAttemptAt: 1, _id: 1 }, timestamps: false }).lean();
      if (!row) break;
      await deliver(row, leaseToken); count++;
    }
    return count + await procurement.processPending(limit);
  }
  function runOnce(): Promise<number> {
    if (!running) running = (async () => {
      let total = 0;
      do { pendingWake = false; const count = await processPending(); total += count; if (count >= 20) pendingWake = true; } while (pendingWake && !stopped && readiness().state === "ready");
      return total;
    })().finally(() => { running = null; if (pendingWake && !stopped) wake(); });
    return running;
  }
  function wake() { if (stopped || readiness().state !== "ready") return; pendingWake = true; void runOnce().catch(() => undefined); }
  function start() { stopped = false; if (!timer) { timer = setInterval(wake, options.pollIntervalMs ?? 30_000); timer.unref(); } wake(); }
  async function stop() { stopped = true; pendingWake = false; if (timer) clearInterval(timer); timer = null; await running; }
  async function listProject(actor: PublicUser, projectId: string): Promise<VendorOrderAccessPage> {
    await authorizeProject(actor, projectId);
    const filter = { projectId, approvedRevisionId: { $type: "string" }, approvedRevision: { $gte: 1 }, cancelledAt: null, status: { $ne: "cancelled" } };
    const orders = await ProjectPurchaseOrderModel.find(filter).sort({ updatedAt: -1, _id: 1 }).limit(100).lean();
    const items: VendorOrderAccess[] = [];
    for (const order of orders) {
      const row = await VendorAccessIntentModel.findById(vendorAccessIntentId({ orderId: String(order._id), vendorId: String(order.vendorId), revision: order.approvedRevision })).lean();
      const context = await vendorLoginContext(repository, String(order.vendorId), readiness(), clock());
      const delivery = vendorDeliveryDto(row, clock());
      const inFlight = row?.dispatchAuthorizedAt && (row.state === "queued" || row.leaseUntil && new Date(row.leaseUntil).getTime() > clock().getTime());
      let actions: VendorOrderAccess["availableActions"] = [];
      if (["procurement", "super_admin"].includes(actor.role) && readiness().state === "ready" && !context.dto.blockedReasonCode && !context.pendingCommand && !context.invitationSending && !inFlight && !delivery.cooldownUntil && !context.dto.delivery.cooldownUntil) actions = [context.account ? "send_work_notification" : context.invitation ? "resend_invitation" : "send_invitation"];
      items.push({ ...delivery, id: row ? String(row._id) : null, version: row?.version ?? null, projectId, vendorId: String(order.vendorId), vendorName: context.dto.vendorName, vendorVersion: context.dto.vendorVersion, orderId: String(order._id), orderLabel: String(order.orderNumber ?? order.reference ?? `Work order ${order._id}`), orderVersion: order.version, revision: order.approvedRevision, access: context.dto.access, invitation: context.dto.invitation, readiness: readiness(), availableActions: actions, blockedReasonCode: context.dto.blockedReasonCode ?? (!row?.dispatchAuthorizedAt && row?.state !== "sent" ? "MANUAL_SEND_REQUIRED" : null), attempts: row?.attempts ?? 0, canRetry: actions.length > 0 && !!row && ["failed", "delivery_unavailable", "intervention_required"].includes(row.state) });
    }
    return { items, total: await ProjectPurchaseOrderModel.countDocuments(filter), readiness: readiness() };
  }
  async function sendOrderAccess(actor: PublicUser, projectId: string, orderId: string, input: VendorOrderAccessCommand) {
    requireVendorDeliveryReady(readiness());
    const digest = createHash("sha256").update(JSON.stringify({ projectId, orderId, ...input })).digest("hex");
    await mongoose.connection.transaction(async session => {
      await authorizeProject(actor, projectId, session, true);
      const transaction = createMongoRepository(session); await transaction.coordinateAuthorizationMutation();
      await requireVendorAccessActor(transaction, actor, true);
      const order = await ProjectPurchaseOrderModel.findOne({ _id: orderId, projectId, approvedRevisionId: { $type: "string" }, approvedRevision: { $gte: 1 }, cancelledAt: null, status: { $ne: "cancelled" } }).session(session).lean();
      if (!order) throw new ApiError(404, "NOT_FOUND", "Issued work order was not found.");
      const intentId = vendorAccessIntentId({ orderId, vendorId: String(order.vendorId), revision: order.approvedRevision });
      const row = await VendorAccessIntentModel.findById(intentId).session(session).lean();
      const receipt = row?.retryReceipts?.find((entry: any) => entry.key === input.idempotencyKey);
      if (receipt) { if (receipt.digest !== digest || receipt.actorId !== actor.id) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Request key was already used."); return; }
      if (order.version !== input.expectedOrderVersion || order.approvedRevision !== input.expectedOrderRevision || (row?.version ?? null) !== input.expectedAccessVersion) throw new ApiError(409, "VERSION_CONFLICT", "Refresh the work order and try again.");
      const context = await vendorLoginContext(transaction, String(order.vendorId), readiness(), clock(), session, true);
      if (context.dto.vendorVersion !== input.expectedVendorVersion) throw new ApiError(409, "VERSION_CONFLICT", "Vendor details changed. Refresh and try again.");
      assertInvitationExpectation(context.invitation, input);
      if (context.normalized) await transaction.coordinateClientEmail(context.normalized);
      if (context.dto.blockedReasonCode) throw new ApiError(409, context.dto.blockedReasonCode, "Correct vendor access details before sending.");
      if (context.pendingCommand || context.invitationSending || row?.leaseUntil && new Date(row.leaseUntil).getTime() > clock().getTime() || row?.state === "queued" && row.dispatchAuthorizedAt) throw new ApiError(409, "DELIVERY_IN_PROGRESS", "Vendor delivery is already pending.");
      if (vendorDeliveryDto(row, clock()).cooldownUntil || context.dto.delivery.cooldownUntil) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Wait before sending another vendor email.");
      const action = context.account ? "send_work_notification" : context.invitation ? "resend_invitation" : "send_invitation";
      if (input.action !== action) throw new ApiError(409, "INVITATION_NOT_ACTIONABLE", "Refresh vendor access to see available actions.");
      const fence = await ProjectPurchaseOrderModel.collection.updateOne({ _id: order._id, version: order.version, approvedRevisionId: order.approvedRevisionId, cancelledAt: null }, { $inc: { accessAuthorityEpoch: 1 } }, { session });
      if (fence.matchedCount !== 1) throw new ApiError(409, "VERSION_CONFLICT", "The issued work changed. Refresh and try again.");
      requireVendorDeliveryReady(readiness());
      const now = clock();
      if (!row) await VendorAccessIntentModel.create([{ _id: intentId, projectId, orderId, vendorId: String(order.vendorId), revision: order.approvedRevision, approvedRevisionId: order.approvedRevisionId, actorId: actor.id, occurredAt: order.approvedAt ?? now, nextAttemptAt: now, createdAt: now, updatedAt: now }], { session });
      await VendorAccessIntentModel.updateOne({ _id: intentId }, { $set: { state: "queued", access: context.dto.access, attempts: 0, failureCode: null, nextAttemptAt: now, dispatchAuthorizedAt: now, dispatchAuthorization: "manual", requestedAction: input.action, requestedCommandId: input.idempotencyKey, requestedById: actor.id, expectedInvitationId: input.invitationId, expectedInvitationVersion: input.expectedInvitationVersion, updatedAt: now }, $inc: { version: 1 }, $push: { retryReceipts: { key: input.idempotencyKey, digest, actorId: actor.id } } }, { session, timestamps: false });
      await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_execution_access_send", entityType: "vendor_access_intent", entityId: intentId, occurredAt: now.toISOString(), newValues: { projectId, orderId, vendorId: String(order.vendorId), action: input.action } }, session);
    });
    wake();
    return listProject(actor, projectId);
  }
  async function retry(actor: PublicUser, projectId: string, intentId: string, input: { expectedVersion: number; idempotencyKey: string }) {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) throw new ApiError(400, "VALIDATION_ERROR", "A valid version and request key are required.");
    requireVendorDeliveryReady(readiness());
    const digest = createHash("sha256").update(JSON.stringify({ projectId, intentId, expectedVersion: input.expectedVersion })).digest("hex");
    await mongoose.connection.transaction(async session => {
      await authorizeProject(actor, projectId, session, true);
      if (!["procurement", "super_admin"].includes(actor.role)) throw new ApiError(403, "FORBIDDEN", "Only Procurement or Super Admin can retry vendor access.");
      const row = await VendorAccessIntentModel.findOne({ _id: intentId, projectId }).session(session).lean();
      if (!row) throw new ApiError(404, "NOT_FOUND", "Vendor access intent was not found.");
      const receipt = row.retryReceipts?.find((entry: any) => entry.key === input.idempotencyKey);
      if (receipt) { if (receipt.digest !== digest || receipt.actorId !== actor.id) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Request key was already used."); return; }
      if (row.version !== input.expectedVersion) throw new ApiError(409, "VERSION_CONFLICT", "Refresh vendor access and try again.");
      if (row.leaseUntil && new Date(row.leaseUntil).getTime() > clock().getTime()) throw new ApiError(409, "DELIVERY_IN_PROGRESS", "Vendor access is being delivered.");
      if (["queued", "cancelled", "sent"].includes(row.state)) throw new ApiError(409, "RETRY_UNAVAILABLE", "This delivery cannot be retried.");
      const transaction = createMongoRepository(session); await transaction.coordinateAuthorizationMutation();
      await requireVendorAccessActor(transaction, actor, true);
      const context = await vendorLoginContext(transaction, String(row.vendorId), readiness(), clock(), session, true);
      if (context.dto.blockedReasonCode) throw new ApiError(409, context.dto.blockedReasonCode, "Correct vendor login details before retrying.");
      const current = await ProjectPurchaseOrderModel.exists({ _id: row.orderId, projectId, vendorId: row.vendorId, approvedRevision: row.revision, approvedRevisionId: row.approvedRevisionId, cancelledAt: null, status: { $ne: "cancelled" } }).session(session);
      if (!current) throw new ApiError(409, "ISSUED_WORK_UNAVAILABLE", "The issued work is no longer available.");
      if (new Date(row.updatedAt).getTime() + COOLDOWN_MS > clock().getTime()) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Wait before retrying delivery.");
      await VendorAccessIntentModel.updateOne({ _id: intentId, version: row.version }, { $set: { state: "queued", attempts: 0, nextAttemptAt: clock(), updatedAt: clock(), failureCode: null, dispatchAuthorizedAt: clock(), dispatchAuthorization: "manual", requestedAction: null, requestedById: actor.id }, $inc: { version: 1 }, $push: { retryReceipts: { key: input.idempotencyKey, digest, actorId: actor.id } } }, { session, timestamps: false });
      await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_execution_access_retry", entityType: "vendor_access_intent", entityId: intentId, occurredAt: clock().toISOString(), newValues: { projectId, vendorId: String(row.vendorId), orderId: String(row.orderId), version: row.version + 1 } }, session);
    });
    wake();
    return listProject(actor, projectId);
  }
  return { readiness, wake, readVendorAccess: procurement.readVendorAccess, sendVendorInvitation: procurement.sendVendorInvitation, sendOrderAccess, recordIssued, processPending, runOnce, start, stop, listProject, retry };
}