import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession, type PipelineStage } from "mongoose";
import { z } from "zod";

import type { SubmittedBasketNotificationInput, VendorBasketRequestNotificationDto, VendorBasketRequestNotificationPage } from "../contracts/vendor-basket-request-notification.js";
import type { VendorBasketRequestStatus } from "../contracts/vendor-basket-request.js";
import { hasPermission } from "../domain/authorization.js";
import { ApiError } from "../middleware/errors.js";
import { UserModel } from "../models/User.js";
import { VendorBasketRequestModel } from "../models/VendorBasketRequest.js";
import { VendorBasketRequestNotificationModel } from "../models/VendorBasketRequestNotification.js";
import { aiEstimatorKnowledgeActorGuard } from "./ai-estimator-knowledge-actor.js";
import type { PublicUser } from "./auth.service.js";
import { systemClock, type Clock } from "./workflow.js";

export const basketNotificationPageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict();
export const basketNotificationIdSchema = z.string().trim().min(1).max(128);

interface NotificationRow {
  _id: string;
  requestId: string;
  proposalId: string | null;
  targetKind: "new_main_basket" | "new_sub_basket";
  targetParentBasketId: string | null;
  targetParentName: string | null;
  proposedName: string;
  vendorName: string | null;
  requesterId: string;
  requesterName: string;
  createdAt: Date;
  readAt: Date | null;
}

/** Called only inside the successful request-submission transaction. */
export async function appendSubmittedBasketNotification(input: SubmittedBasketNotificationInput, session: ClientSession): Promise<void> {
  if (!session.inTransaction()) throw new Error("Basket submission notifications require an active transaction.");
  const { request, requester } = input;
  if (request.requesterId !== requester.id || request.status !== "pending") {
    throw new Error("Basket submission notification does not match its pending request.");
  }
  const candidates = await UserModel.find({ role: "super_admin", active: true })
    .select({ _id: 1 }).limit(2).session(session).lean().exec();
  if (candidates.length !== 1) {
    throw new ApiError(409, "SOLE_SUPER_ADMIN_REQUIRED", "Exactly one active Super Admin is required.");
  }
  // This uses the same authorization coordination record as identity mutations.
  // A concurrent recipient role/status change forces the submission to retry.
  const recipient = await aiEstimatorKnowledgeActorGuard.requireMutationActor({
    id: String(candidates[0]!._id), role: "super_admin", name: "", email: ""
  }, session);
  const persistedRequest = await VendorBasketRequestModel.exists({ _id: request.id, requesterId: requester.id, status: "pending" }).session(session);
  if (!persistedRequest) throw new Error("Basket submission notification requires its persisted pending request.");
  const target = request.target ?? { kind: "new_main_basket" as const };
  await VendorBasketRequestNotificationModel.updateOne(
    { recipientId: recipient.id, requestId: request.id },
    { $setOnInsert: {
      _id: `basket-request-notification-${randomUUID()}`,
      recipientId: recipient.id, requestId: request.id, proposalId: request.proposalId ?? null,
      ...(request.kind === "configuration_sub_basket" ? { requestKind: request.kind } : {}),
      targetKind: target.kind,
      targetParentBasketId: target.kind === "new_sub_basket" ? target.basketId : null,
      targetParentName: target.kind === "new_sub_basket" ? request.targetParentName ?? null : null,
      proposedName: request.proposedName, vendorName: request.vendorName,
      requesterId: requester.id,
      requesterName: requester.name.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, 240)
        || (request.kind === "configuration_sub_basket" ? "Configuration" : "Procurement"),
      createdAt: new Date(request.createdAt), readAt: null
    } },
    { upsert: true, session, runValidators: true }
  ).exec();
}

export function createVendorBasketRequestNotificationService(options: { now?: Clock } = {}) {
  const now = options.now ?? systemClock;
  return {
    async list(actor: PublicUser, input: unknown): Promise<VendorBasketRequestNotificationPage> {
      requireReviewPermission(actor);
      const parsed = basketNotificationPageSchema.safeParse(input);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid notification pagination.");
      const { limit, offset } = parsed.data;
      return mongoose.connection.transaction(async (session) => {
        const authorized = await aiEstimatorKnowledgeActorGuard.requireReadActor(actor, session);
        // Join only status so an absent request cannot create a dangling inbox item
        // or inflated unread count, and immutable notification content stays intact.
        const pipeline: PipelineStage[] = [
          { $match: { recipientId: authorized.id } },
          { $lookup: { from: VendorBasketRequestModel.collection.name, localField: "requestId", foreignField: "_id", as: "request",
            pipeline: [{ $project: { _id: 0, status: 1 } }] } },
          { $unwind: "$request" },
          { $match: { "request.status": { $in: ["pending", "fulfilled", "rejected"] } } },
          { $facet: {
            items: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: offset }, { $limit: limit }],
            total: [{ $count: "value" }],
            unread: [{ $match: { readAt: null } }, { $count: "value" }]
          } }
        ];
        const [result] = await VendorBasketRequestNotificationModel.aggregate<{
          items: (NotificationRow & { request: { status: VendorBasketRequestStatus } })[];
          total: { value: number }[];
          unread: { value: number }[];
        }>(pipeline).session(session).exec();
        const total = result?.total[0]?.value ?? 0;
        return { items: (result?.items ?? []).map(row => dto(row, row.request.status)),
          unreadCount: result?.unread[0]?.value ?? 0,
          pagination: { limit, offset, total, hasMore: offset + limit < total } };
      });
    },
    async read(actor: PublicUser, notificationId: string): Promise<VendorBasketRequestNotificationDto> {
      requireReviewPermission(actor);
      const parsed = basketNotificationIdSchema.safeParse(notificationId);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid notification identifier.");
      return mongoose.connection.transaction(async session => {
        const authorized = await aiEstimatorKnowledgeActorGuard.requireMutationActor(actor, session);
        const scope = { _id: parsed.data, recipientId: authorized.id };
        const row = await VendorBasketRequestNotificationModel.findOne(scope).session(session).lean().exec() as NotificationRow | null;
        if (!row) notFound();
        const request = await VendorBasketRequestModel.findOne({ _id: row.requestId, status: { $in: ["pending", "fulfilled", "rejected"] } })
          .select({ status: 1 }).session(session).lean().exec();
        if (!request) notFound();
        const readAt = row.readAt ?? now();
        if (!row.readAt) await VendorBasketRequestNotificationModel.updateOne({ ...scope, readAt: null }, { $set: { readAt } }, { session, runValidators: true }).exec();
        return dto({ ...row, readAt }, request.status as VendorBasketRequestStatus);
      });
    }
  };
}

function requireReviewPermission(actor: PublicUser): void {
  if (!hasPermission(actor.role, "ai_estimator_knowledge.configuration.read")) {
    throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
  }
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The basket notification was not found.");
}

function dto(row: NotificationRow, status: VendorBasketRequestStatus): VendorBasketRequestNotificationDto {
  return { id: String(row._id), type: "basket_request.submitted", requestId: row.requestId,
    proposalId: row.proposalId ?? null,
    target: row.targetKind === "new_sub_basket" ? { kind: "new_sub_basket", basketId: row.targetParentBasketId! } : { kind: "new_main_basket" },
    targetParentName: row.targetParentName ?? null, proposedName: row.proposedName, vendorName: row.vendorName ?? null,
    requester: { id: row.requesterId, name: row.requesterName }, status,
    createdAt: new Date(row.createdAt).toISOString(), readAt: row.readAt ? new Date(row.readAt).toISOString() : null };
}
