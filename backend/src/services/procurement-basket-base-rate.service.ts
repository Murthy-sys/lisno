import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { procurementBasketBaseRateSaveSchema, type ProcurementBasketBaseRateSaveInput,
  type ProcurementBasketProjectRate } from "../domain/procurement-basket-base-rate.js";
import { procurementBasketLineStandardCostCalculable } from "../domain/procurement-basket-projection.js";
import { ApiError } from "../middleware/errors.js";
import { ProcurementBasketBaseRateModel, ProcurementBasketBaseRateReceiptModel } from "../models/ProcurementBasketBaseRate.js";
import { ProcurementBasketEnquiryModel } from "../models/ProcurementBasketTender.js";
import { ProjectModel } from "../models/Project.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess, procurementItemSourceSnapshot } from "./procurement.service.js";
import { currentBasket } from "./procurement-basket-tender-support.service.js";

type Row = Record<string, any>;
export interface ProcurementBasketBaseRateSaveResult {
  projectId: string;
  mainBasketId: string;
  estimateSource: ProcurementBasketBaseRateSaveInput["expectedEstimateSource"];
  sourceLineItemKey: string;
  projectRate: ProcurementBasketProjectRate;
}

export function createProcurementBasketBaseRateService(input: { audit: AuditService; now?: () => Date }) {
  const now = input.now ?? (() => new Date());
  return {
    async save(actor: PublicUser, projectId: string, basketId: string,
      value: ProcurementBasketBaseRateSaveInput): Promise<ProcurementBasketBaseRateSaveResult> {
      const parsed = procurementBasketBaseRateSaveSchema.safeParse(value);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.",
        Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message])));
      const fields = parsed.data;
      const requestDigest = digest({ projectId, basketId, fields });
      try {
        return await mongoose.connection.transaction(async session => {
          await assertProcurementProjectAccess(actor, projectId, session);
          const receipt = await ProcurementBasketBaseRateReceiptModel.findOne({ projectId,
            idempotencyKey: fields.idempotencyKey }).session(session).lean() as Row | null;
          if (receipt) {
            if (receipt.requestDigest !== requestDigest) idempotencyConflict();
            return receipt.response as ProcurementBasketBaseRateSaveResult;
          }
          const source = await procurementItemSourceSnapshot(projectId, session, true);
          const estimateSource = { estimateId: source.estimateId, estimateVersion: source.estimateVersion,
            estimateReviewRoundId: source.estimateReviewRoundId };
          if (JSON.stringify(estimateSource) !== JSON.stringify(fields.expectedEstimateSource)) sourceConflict();
          // Share the project write fence with BOQ dispatch and work-order issue.
          const project = await ProjectModel.findOneAndUpdate({ _id: projectId, status: "active" },
            { $inc: { purchaseOrderApprovalEpoch: 1 } },
            { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
          if (!project) throw new ApiError(409, "PROCUREMENT_BASKET_PROJECT_INACTIVE", "This project is not active.");
          const basket = await currentBasket(projectId, basketId, session, fields.expectedPreparationDigest);
          const line = basket.lines.find(row => row.sourceLineItemKey === fields.sourceLineItemKey);
          const approvedLine = source.allLineItems.find(row => row.key === fields.sourceLineItemKey);
          if (!basket.automaticSubVendor || basket.classification !== "standard" ||
            !approvedLine || !approvedLine.mainBasketId || approvedLine.mainBasketId !== basketId ||
            source.mainBasketClassifications[basketId] !== "standard" ||
            !line || !procurementBasketLineStandardCostCalculable(basket, line)) {
            throw new ApiError(409, "PROCUREMENT_BASKET_BASE_RATE_LINE_UNAVAILABLE",
              "This approved Standard line cannot be priced from its saved Sub-vendor settings.");
          }
          const activeAward = await ProcurementBasketEnquiryModel.exists({ projectId, mainBasketId: basketId,
            "estimateSource.estimateId": estimateSource.estimateId,
            "estimateSource.estimateVersion": estimateSource.estimateVersion,
            "estimateSource.estimateReviewRoundId": estimateSource.estimateReviewRoundId,
            status: { $in: ["award_pending", "issued"] } }).session(session);
          if (activeAward) throw new ApiError(409, "PROCUREMENT_BASKET_BASE_RATE_LOCKED",
            "The basket Base amount cannot change during award approval or after issue.");
          const key = { projectId, ...estimateSource, mainBasketId: basketId,
            sourceLineItemKey: fields.sourceLineItemKey };
          const existing = await ProcurementBasketBaseRateModel.findOne(key).session(session).lean() as Row | null;
          if ((existing?.version ?? 0) !== fields.expectedVersion) versionConflict();
          const at = now();
          let saved: Row | null;
          if (existing) {
            saved = await ProcurementBasketBaseRateModel.findOneAndUpdate({ _id: existing._id,
              version: fields.expectedVersion }, { $set: { overridePaise: fields.baseRatePaise,
              updatedById: actor.id, updatedAt: at }, $inc: { version: 1 } },
            { session, returnDocument: "after", runValidators: true }).lean() as Row | null;
            if (!saved) versionConflict();
          } else {
            const [created] = await ProcurementBasketBaseRateModel.create([{ _id: `pbbr-${randomUUID()}`,
              ...key, overridePaise: fields.baseRatePaise, version: 1,
              createdById: actor.id, updatedById: actor.id, createdAt: at, updatedAt: at }], { session });
            saved = created?.toObject() as Row | undefined ?? null;
          }
          if (!saved) throw new Error("Project Base amount was not saved.");
          // Calculate again from the saved project rate and pinned Configuration in
          // this transaction. Overflow or missing settings rolls the mutation back.
          let recalculated: Awaited<ReturnType<typeof currentBasket>>;
          try { recalculated = await currentBasket(projectId, basketId, session); }
          catch (error) {
            if (error instanceof RangeError) throw new ApiError(422, "PROCUREMENT_BASKET_BASE_RATE_UNCALCULABLE",
              "The new Base amount exceeds the supported basket total.");
            throw error;
          }
          const effectiveLine = recalculated.lines.find(row => row.sourceLineItemKey === fields.sourceLineItemKey);
          if (!effectiveLine || effectiveLine.projectRate.version !== Number(saved.version) ||
            effectiveLine.projectRate.overridePaise !== fields.baseRatePaise ||
            !procurementBasketLineStandardCostCalculable(recalculated, effectiveLine)) {
            throw new ApiError(422, "PROCUREMENT_BASKET_BASE_RATE_UNCALCULABLE",
              "The new Base amount cannot be calculated with the approved quantity and saved Sub-vendor settings.");
          }
          const response: ProcurementBasketBaseRateSaveResult = { projectId, mainBasketId: basketId,
            estimateSource, sourceLineItemKey: fields.sourceLineItemKey,
            projectRate: { version: Number(saved.version), overridePaise: fields.baseRatePaise } };
          await input.audit.appendInMongoTransaction({ actorId: actor.id,
            action: "procurement_basket_base_rate_saved", entityType: "procurement_basket_base_rate",
            entityId: String(saved._id), occurredAt: at.toISOString(),
            oldValues: { ...key, version: existing?.version ?? 0,
              overridePaise: existing?.overridePaise ?? null },
            newValues: { ...key, version: response.projectRate.version,
              overridePaise: response.projectRate.overridePaise } }, session);
          await ProcurementBasketBaseRateReceiptModel.create([{ _id: `pbbrr-${randomUUID()}`,
            projectId, idempotencyKey: fields.idempotencyKey, requestDigest, response,
            createdById: actor.id, createdAt: at }], { session });
          return response;
        }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
      } catch (error) {
        if (!isDuplicateKey(error)) {
          if (isWriteConflict(error)) versionConflict();
          throw error;
        }
        return mongoose.connection.transaction(async session => {
          await assertProcurementProjectAccess(actor, projectId, session);
          const receipt = await ProcurementBasketBaseRateReceiptModel.findOne({ projectId,
            idempotencyKey: fields.idempotencyKey }).session(session).lean() as Row | null;
          if (!receipt) versionConflict();
          if (receipt.requestDigest !== requestDigest) idempotencyConflict();
          return receipt.response as ProcurementBasketBaseRateSaveResult;
        }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
      }
    }
  };
}

function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sourceConflict(): never { throw new ApiError(409, "PROCUREMENT_BASKET_BASE_RATE_SOURCE_CONFLICT",
  "The approved estimate changed. Refresh before editing the Base amount."); }
function versionConflict(): never { throw new ApiError(409, "PROCUREMENT_BASKET_BASE_RATE_VERSION_CONFLICT",
  "The Base amount changed. Refresh and try again."); }
function idempotencyConflict(): never { throw new ApiError(409, "IDEMPOTENCY_KEY_CONFLICT",
  "This request key was used for another Base amount edit."); }
function isDuplicateKey(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === 11000;
}
function isWriteConflict(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const mongo = error as { code?: unknown; hasErrorLabel?: (label: string) => boolean };
  return mongo.code === 112 || Boolean(mongo.hasErrorLabel?.("TransientTransactionError"));
}
