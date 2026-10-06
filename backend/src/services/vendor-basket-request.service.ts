import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";

import type { CreateVendorBasketRequestInput, DecideVendorBasketRequestInput, VendorBasketRequestDto, VendorBasketRequestStatus } from "../contracts/vendor-basket-request.js";
import { normalizeKnowledgeIdentity } from "../domain/ai-estimator-knowledge.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { VendorBasketRequestModel } from "../models/VendorBasketRequest.js";
import type { PaginationInput } from "../repositories/types.js";
import { aiEstimatorKnowledgeActorGuard, aiEstimatorKnowledgeVendorActorGuard } from "./ai-estimator-knowledge-actor.js";
import { AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE, allocateAiEstimatorKnowledgeDisplayOrder } from "./ai-estimator-knowledge-display-order.service.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { systemClock, type Clock } from "./workflow.js";

type RequestRow = Record<string, unknown>;

export interface VendorBasketRequestPage {
  readonly items: readonly VendorBasketRequestDto[];
  readonly pagination: { readonly total: number; readonly limit: number; readonly offset: number; readonly hasMore: boolean };
}

export function createVendorBasketRequestService(dependencies: {
  readonly audit: Pick<AuditService, "appendInMongoTransaction">;
  readonly now?: Clock;
  readonly createId?: () => string;
  readonly startSession?: () => Promise<ClientSession>;
}) {
  const now = dependencies.now ?? systemClock;
  const createId = dependencies.createId ?? randomUUID;
  const startSession = dependencies.startSession ?? (() => mongoose.startSession());

  return {
    async create(actor: PublicUser, input: CreateVendorBasketRequestInput): Promise<VendorBasketRequestDto> {
      requireProcurementRole(actor);
      const currentActor = await aiEstimatorKnowledgeVendorActorGuard.requireReadActor(actor);
      if (currentActor.role !== "procurement") forbidden();
      const vendorName = cleanName(input.vendorName);
      const vendorNameNormalized = normalizeKnowledgeIdentity(vendorName);
      const proposedName = cleanName(input.proposedName);
      const proposedNameNormalized = normalizeKnowledgeIdentity(proposedName);
      const vendorId = input.vendorId ?? null;
      const vendorKey = vendorId ? `id:${vendorId}` : `name:${vendorNameNormalized}`;
      const fingerprint = digest({ vendorId, vendorName, proposedName });
      const previous = await VendorBasketRequestModel.findOne({ requesterId: actor.id, idempotencyKey: input.idempotencyKey }).lean().exec();
      if (previous) return replayRequest(previous as RequestRow, fingerprint);

      try {
        return await inTransaction(startSession, async (session) => {
          const authorized = await aiEstimatorKnowledgeVendorActorGuard.requireMutationActor(actor, session);
          if (authorized.role !== "procurement") forbidden();
          const replay = await VendorBasketRequestModel.findOne({ requesterId: actor.id, idempotencyKey: input.idempotencyKey }).session(session).lean().exec();
          if (replay) return replayRequest(replay as RequestRow, fingerprint);
          if (vendorId) {
            const vendor = await AiEstimatorKnowledgeVendorModel.findOne({ _id: vendorId, status: { $ne: "archived" } })
              .select({ nameNormalized: 1 }).session(session).lean().exec();
            if (!vendor) throw new ApiError(404, "NOT_FOUND", "The vendor was not found.");
            if (vendor.nameNormalized !== vendorNameNormalized) {
              throw new ApiError(409, "VENDOR_CHANGED", "The saved vendor name has changed. Refresh the vendor before requesting a basket.");
            }
          }
          const active = await AiEstimatorKnowledgeBasketModel.exists({ nameNormalized: proposedNameNormalized, status: "active" }).session(session);
          if (active) throw new ApiError(409, "BASKET_EXISTS", "This Main Basket is already in Configuration. Select it from the list.");
          const pending = await VendorBasketRequestModel.exists({
            proposedNameNormalized, status: "pending",
            $or: [{ vendorKey }, { vendorNameNormalized }]
          }).session(session);
          if (pending) throw new ApiError(409, "REQUEST_PENDING", "A request for this vendor and Main Basket is already pending.");
          const createdAt = now();
          const [record] = await VendorBasketRequestModel.create([{
            _id: `vendor-basket-request-${createId()}`, requesterId: authorized.id, vendorId, vendorKey,
            vendorName, vendorNameNormalized, proposedName, proposedNameNormalized, status: "pending", version: 1,
            basketId: null, reason: null, idempotencyKey: input.idempotencyKey, requestFingerprint: fingerprint,
            decisionIdempotencyKey: null, decisionFingerprint: null, createdAt,
            decidedAt: null, decidedById: null
          }], { session });
          if (!record) throw new Error("Vendor basket request creation did not complete.");
          await dependencies.audit.appendInMongoTransaction({
            actorId: authorized.id, action: "vendor_basket_request_created", entityType: "vendor_basket_request",
            entityId: String(record._id), occurredAt: createdAt.toISOString(),
            newValues: { vendorId, vendorName, proposedName, status: "pending", version: 1 }
          }, session);
          return dto(record.toObject() as RequestRow);
        });
      } catch (error) {
        if (!duplicateKey(error)) throw error;
        const replay = await VendorBasketRequestModel.findOne({ requesterId: actor.id, idempotencyKey: input.idempotencyKey }).lean().exec();
        if (replay) return replayRequest(replay as RequestRow, fingerprint);
        throw new ApiError(409, "REQUEST_PENDING", "A request for this vendor and Main Basket is already pending.");
      }
    },

    async listMine(actor: PublicUser, pagination: PaginationInput): Promise<VendorBasketRequestPage> {
      requireProcurementRole(actor);
      const authorized = await aiEstimatorKnowledgeVendorActorGuard.requireReadActor(actor);
      if (authorized.role !== "procurement") forbidden();
      return page({ requesterId: authorized.id }, pagination);
    },

    async listForAdmin(actor: PublicUser, status: VendorBasketRequestStatus | undefined, pagination: PaginationInput): Promise<VendorBasketRequestPage> {
      await aiEstimatorKnowledgeActorGuard.requireReadActor(actor);
      return page(status ? { status } : {}, pagination);
    },

    async decide(actor: PublicUser, requestId: string, input: DecideVendorBasketRequestInput): Promise<VendorBasketRequestDto> {
      if (actor.role !== "super_admin") forbidden();
      const reason = input.reason?.normalize("NFKC").trim().replace(/\s+/gu, " ") || null;
      if (input.decision === "reject" && !reason) {
        throw new ApiError(400, "VALIDATION_ERROR", "A rejection reason is required.", { reason: "Enter a reason." });
      }
      const fingerprint = digest({ decision: input.decision, expectedVersion: input.expectedVersion, reason });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await inTransaction(startSession, async (session) => {
            const authorized = await aiEstimatorKnowledgeActorGuard.requireMutationActor(actor, session);
            const current = await VendorBasketRequestModel.findById(requestId).session(session).lean().exec() as RequestRow | null;
            if (!current) throw new ApiError(404, "NOT_FOUND", "The basket request was not found.");
            if (current.decisionIdempotencyKey === input.idempotencyKey) {
              if (current.decisionFingerprint !== fingerprint) idempotencyConflict();
              return dto(current);
            }
            if (current.status !== "pending" || Number(current.version) !== input.expectedVersion) {
              throw new ApiError(409, "VERSION_CONFLICT", "This request has changed. Refresh it before deciding.");
            }
            const decidedAt = now();
            const updated = await VendorBasketRequestModel.findOneAndUpdate(
              { _id: requestId, status: "pending", version: input.expectedVersion },
              { $set: { status: input.decision === "fulfill" ? "fulfilled" : "rejected",
                reason, decidedAt, decidedById: authorized.id,
                decisionIdempotencyKey: input.idempotencyKey, decisionFingerprint: fingerprint }, $inc: { version: 1 } },
              { session, returnDocument: "after", runValidators: true }
            ).lean().exec() as RequestRow | null;
            if (!updated) throw new ApiError(409, "VERSION_CONFLICT", "This request has changed. Refresh it before deciding.");
            let basketId: string | null = null;
            if (input.decision === "fulfill") {
              basketId = await findOrCreateBasket(current, authorized.id, decidedAt, session, createId, dependencies.audit);
              await VendorBasketRequestModel.updateOne({ _id: requestId, version: input.expectedVersion + 1 },
                { $set: { basketId } }, { session }).exec();
            }
            await dependencies.audit.appendInMongoTransaction({
              actorId: authorized.id,
              action: input.decision === "fulfill" ? "vendor_basket_request_fulfilled" : "vendor_basket_request_rejected",
              entityType: "vendor_basket_request", entityId: requestId, occurredAt: decidedAt.toISOString(),
              oldValues: { status: "pending", version: input.expectedVersion },
              newValues: { status: input.decision === "fulfill" ? "fulfilled" : "rejected", version: input.expectedVersion + 1, basketId },
              reason
            }, session);
            return dto({ ...updated, basketId });
          });
        } catch (error) {
          if (!duplicateKey(error) || attempt > 0) throw error;
        }
      }
      throw new Error("Basket request decision retry failed.");
    }
  };
}

async function findOrCreateBasket(request: RequestRow, actorId: string, timestamp: Date, session: ClientSession,
  createId: () => string, audit: Pick<AuditService, "appendInMongoTransaction">): Promise<string> {
  const nameNormalized = String(request.proposedNameNormalized);
  const existing = await AiEstimatorKnowledgeBasketModel.findOne({ nameNormalized, status: { $in: ["active", "inactive"] } })
    .select({ _id: 1, status: 1 }).session(session).lean().exec();
  if (existing?.status === "active") return String(existing._id);
  if (existing) throw new ApiError(409, "BASKET_INACTIVE", "A matching inactive Main Basket exists in Configuration. Review it before fulfilling.");
  const displayOrder = await allocateAiEstimatorKnowledgeDisplayOrder({
    scope: AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE,
    resourceModel: AiEstimatorKnowledgeBasketModel, resourceFilter: {}, session
  });
  const [created] = await AiEstimatorKnowledgeBasketModel.create([{
    _id: `knowledge-basket-${createId()}`, name: String(request.proposedName), nameNormalized,
    description: null, displayOrder, status: "active", version: 1,
    createdById: actorId, updatedById: actorId, archivedAt: null, archivedById: null,
    createdAt: timestamp, updatedAt: timestamp
  }], { session });
  if (!created) throw new Error("Requested Main Basket creation did not complete.");
  await audit.appendInMongoTransaction({
    actorId, action: "ai_estimator_knowledge_basket_created", entityType: "ai_estimator_knowledge_basket",
    entityId: String(created._id), occurredAt: timestamp.toISOString(),
    newValues: { status: "active", version: 1, displayOrder, sourceRequestId: String(request._id) }
  }, session);
  return String(created._id);
}

function dto(row: RequestRow): VendorBasketRequestDto {
  return { id: String(row._id), requesterId: String(row.requesterId),
    vendorId: row.vendorId == null ? null : String(row.vendorId), vendorName: String(row.vendorName),
    proposedName: String(row.proposedName), status: row.status as VendorBasketRequestStatus,
    version: Number(row.version), basketId: row.basketId == null ? null : String(row.basketId),
    reason: row.reason == null ? null : String(row.reason),
    createdAt: dateIso(row.createdAt)!, decidedAt: dateIso(row.decidedAt),
    decidedById: row.decidedById == null ? null : String(row.decidedById) };
}

function dateIso(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

async function page(filter: Record<string, unknown>, pagination: PaginationInput): Promise<VendorBasketRequestPage> {
  const [rows, total] = await Promise.all([
    VendorBasketRequestModel.find(filter).sort({ createdAt: -1, _id: 1 }).skip(pagination.offset).limit(pagination.limit).lean().exec(),
    VendorBasketRequestModel.countDocuments(filter).exec()
  ]);
  return { items: rows.map((row) => dto(row as RequestRow)),
    pagination: { total, limit: pagination.limit, offset: pagination.offset, hasMore: pagination.offset + rows.length < total } };
}

async function inTransaction<T>(startSession: () => Promise<ClientSession>, operation: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => { result = await operation(session); });
    return result;
  } finally { await session.endSession().catch(() => undefined); }
}

function cleanName(value: string): string {
  const name = typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ") : "";
  if (!name || name.length > 240) throw new ApiError(400, "VALIDATION_ERROR", "Enter a name of at most 240 characters.");
  return name;
}

function digest(value: object): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function duplicateKey(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000); }
function forbidden(): never { throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."); }
function requireProcurementRole(actor: PublicUser): void { if (actor.role !== "procurement") forbidden(); }
function idempotencyConflict(): never { throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This request key was already used with different values."); }
function replayRequest(row: RequestRow, fingerprint: string): VendorBasketRequestDto {
  if (row.requestFingerprint !== fingerprint) idempotencyConflict();
  return dto(row);
}
