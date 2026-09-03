import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession, type Model } from "mongoose";

import type {
  KnowledgeBasketDeletionBlockerCode,
  KnowledgePrioritySemanticTier,
  KnowledgeTaxVersion
} from "../contracts/ai-estimator-knowledge.js";
import type { KnowledgeMasterStatus, KnowledgeTaxTreatment, KnowledgeVersionStatus } from "../domain/ai-estimator-knowledge.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT,
  AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT,
  AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS,
  AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES,
  normalizeKnowledgeIdentity
} from "../domain/ai-estimator-knowledge.js";
import {
  findOverlappingEffectiveWindows,
  validateEffectiveWindow
} from "../domain/ai-estimator-knowledge-validation.js";
import {
  isFixedGstRuleId,
  isFixedGstVersionId
} from "../domain/ai-estimator-knowledge-fixed-gst.js";
import {
  findCanonicalKnowledgePriorityById,
  findCanonicalKnowledgePriorityByTier,
  isKnowledgePrioritySemanticTier,
  type CanonicalKnowledgePriority
} from "../domain/ai-estimator-knowledge-priority.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeModeModel } from "../models/AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgePriorityModel } from "../models/AiEstimatorKnowledgePriority.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSurfaceModel } from "../models/AiEstimatorKnowledgeSurface.js";
import { AiEstimatorKnowledgeTaxRuleModel } from "../models/AiEstimatorKnowledgeTaxRule.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST } from "../operations/ai-estimator-knowledge-bootstrap.manifest.js";
import type { PageResult, PaginationInput } from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import {
  aiEstimatorKnowledgeActorGuard,
  type AiEstimatorKnowledgeActorGuard
} from "./ai-estimator-knowledge-actor.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE,
  allocateAiEstimatorKnowledgeDisplayOrder,
  createAiEstimatorKnowledgeMasterDisplayOrderScope,
  observeExplicitAiEstimatorKnowledgeDisplayOrder
} from "./ai-estimator-knowledge-display-order.service.js";
import type { PublicUser } from "./auth.service.js";
import { systemClock, type Clock } from "./workflow.js";

type Row = Record<string, unknown>;
type MutableMasterStatus = Exclude<KnowledgeMasterStatus, "archived">;

const bootstrapBasketIds = new Set(
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources
    .filter((resource) => resource.kind === "basket")
    .map((resource) => String(resource.document._id))
);

export const AI_ESTIMATOR_KNOWLEDGE_MASTER_TYPES = [
  "uoms",
  "vendors",
  "taxes",
  "priorities",
  "surfaces",
  "modes"
] as const;

export type AiEstimatorKnowledgeMasterType =
  (typeof AI_ESTIMATOR_KNOWLEDGE_MASTER_TYPES)[number];

export interface AiEstimatorKnowledgeListFilters {
  readonly search?: string;
  readonly status?: KnowledgeMasterStatus;
  readonly includeArchived?: boolean;
}

export interface AiEstimatorKnowledgeBasketDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly displayOrder: number;
  readonly status: KnowledgeMasterStatus;
  readonly version: number;
  readonly createdById: string;
  readonly updatedById: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AiEstimatorKnowledgeMasterDto {
  readonly id: string;
  readonly masterType: AiEstimatorKnowledgeMasterType;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly displayOrder: number;
  readonly status: KnowledgeMasterStatus;
  readonly version: number;
  readonly decimalScale?: number;
  readonly semanticTier?: KnowledgePrioritySemanticTier;
  readonly taxVersions?: readonly KnowledgeTaxVersion[];
  readonly createdById: string;
  readonly updatedById: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AiEstimatorKnowledgeTaxVersionInput {
  readonly rateBps: number;
  readonly treatment: KnowledgeTaxTreatment;
  readonly applicability: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | null;
  readonly status?: KnowledgeVersionStatus;
}

export interface AiEstimatorKnowledgeTaxVersionUpdateInput
  extends AiEstimatorKnowledgeTaxVersionInput {
  readonly rolloverFromVersionId?: string;
}

export interface AiEstimatorKnowledgeCreateBasketInput {
  readonly name: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
  readonly status?: MutableMasterStatus;
}

export interface AiEstimatorKnowledgeUpdateBasketInput {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
  readonly status?: MutableMasterStatus;
}

export interface AiEstimatorKnowledgeArchiveInput {
  readonly expectedVersion: number;
  readonly reason?: string | null;
}

export interface AiEstimatorKnowledgeBasketDeletionBlocker {
  readonly code: KnowledgeBasketDeletionBlockerCode;
  readonly message: string;
}

export interface AiEstimatorKnowledgeBasketDeletionImpact {
  readonly basketId: string;
  readonly basketName: string;
  readonly version: number;
  readonly mainLineCount: number;
  readonly historicalReferenceCount: number;
  readonly bootstrapOwned: boolean;
  readonly canDelete: boolean;
  readonly blockers: readonly AiEstimatorKnowledgeBasketDeletionBlocker[];
}

export interface AiEstimatorKnowledgePermanentDeleteBasketInput {
  readonly expectedVersion: number;
  readonly confirmationName: string;
  readonly reason: string;
}

export interface AiEstimatorKnowledgePermanentDeleteBasketResult {
  readonly basketId: string;
  readonly deleted: true;
  readonly deletedAt: string;
}

export interface AiEstimatorKnowledgeCreateMasterInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
  readonly status?: MutableMasterStatus;
  readonly decimalScale?: number;
  readonly taxVersion?: AiEstimatorKnowledgeTaxVersionInput;
}

export interface AiEstimatorKnowledgeCreateSurfaceInput {
  readonly code?: string;
  readonly name: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
  readonly status?: MutableMasterStatus;
  readonly decimalScale?: never;
  readonly taxVersion?: never;
}

export interface AiEstimatorKnowledgeUpdateMasterInput {
  readonly expectedVersion: number;
  readonly code?: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
  readonly status?: MutableMasterStatus;
  readonly decimalScale?: number;
  readonly taxVersion?: AiEstimatorKnowledgeTaxVersionUpdateInput;
}

export interface AiEstimatorKnowledgeUpdateSurfaceInput {
  readonly expectedVersion: number;
  readonly code?: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
  readonly status?: MutableMasterStatus;
  readonly decimalScale?: never;
  readonly taxVersion?: never;
}

type AiEstimatorKnowledgeAnyCreateMasterInput =
  | AiEstimatorKnowledgeCreateMasterInput
  | AiEstimatorKnowledgeCreateSurfaceInput;

type AiEstimatorKnowledgeAnyUpdateMasterInput =
  | AiEstimatorKnowledgeUpdateMasterInput
  | AiEstimatorKnowledgeUpdateSurfaceInput;

export interface AiEstimatorKnowledgeReferenceService {
  listBaskets(
    actor: PublicUser,
    filters: AiEstimatorKnowledgeListFilters,
    pagination: PaginationInput
  ): Promise<PageResult<AiEstimatorKnowledgeBasketDto>>;
  createBasket(
    actor: PublicUser,
    input: AiEstimatorKnowledgeCreateBasketInput
  ): Promise<AiEstimatorKnowledgeBasketDto>;
  updateBasket(
    actor: PublicUser,
    basketId: string,
    input: AiEstimatorKnowledgeUpdateBasketInput
  ): Promise<AiEstimatorKnowledgeBasketDto>;
  archiveBasket(
    actor: PublicUser,
    basketId: string,
    input: AiEstimatorKnowledgeArchiveInput
  ): Promise<AiEstimatorKnowledgeBasketDto>;
  getBasketDeletionImpact(
    actor: PublicUser,
    basketId: string
  ): Promise<AiEstimatorKnowledgeBasketDeletionImpact>;
  permanentlyDeleteBasket(
    actor: PublicUser,
    basketId: string,
    input: AiEstimatorKnowledgePermanentDeleteBasketInput
  ): Promise<AiEstimatorKnowledgePermanentDeleteBasketResult>;
  listMasters(
    actor: PublicUser,
    masterType: AiEstimatorKnowledgeMasterType,
    filters: AiEstimatorKnowledgeListFilters,
    pagination: PaginationInput
  ): Promise<PageResult<AiEstimatorKnowledgeMasterDto>>;
  createMaster(
    actor: PublicUser,
    masterType: AiEstimatorKnowledgeMasterType,
    input: AiEstimatorKnowledgeAnyCreateMasterInput
  ): Promise<AiEstimatorKnowledgeMasterDto>;
  updateMaster(
    actor: PublicUser,
    masterType: AiEstimatorKnowledgeMasterType,
    id: string,
    input: AiEstimatorKnowledgeAnyUpdateMasterInput
  ): Promise<AiEstimatorKnowledgeMasterDto>;
  archiveMaster(
    actor: PublicUser,
    masterType: AiEstimatorKnowledgeMasterType,
    id: string,
    input: AiEstimatorKnowledgeArchiveInput
  ): Promise<AiEstimatorKnowledgeMasterDto>;
}

type TransactionStarter = () => Promise<ClientSession>;

export interface AiEstimatorKnowledgeReferenceServiceDependencies {
  readonly audit: Pick<AuditService, "appendInMongoTransaction">;
  readonly actorGuard?: AiEstimatorKnowledgeActorGuard;
  readonly now?: Clock;
  readonly createId?: () => string;
  readonly startSession?: TransactionStarter;
}

const masterModels: Record<AiEstimatorKnowledgeMasterType, Model<any>> = {
  uoms: AiEstimatorKnowledgeUomModel,
  vendors: AiEstimatorKnowledgeVendorModel,
  taxes: AiEstimatorKnowledgeTaxRuleModel,
  priorities: AiEstimatorKnowledgePriorityModel,
  surfaces: AiEstimatorKnowledgeSurfaceModel,
  modes: AiEstimatorKnowledgeModeModel
} as Record<AiEstimatorKnowledgeMasterType, Model<any>>;

export function createAiEstimatorKnowledgeReferenceService(
  dependencies: AiEstimatorKnowledgeReferenceServiceDependencies
): AiEstimatorKnowledgeReferenceService {
  const actorGuard = dependencies.actorGuard ?? aiEstimatorKnowledgeActorGuard;
  const now = dependencies.now ?? systemClock;
  const createId = dependencies.createId ?? randomUUID;
  const startSession = dependencies.startSession ?? (() => mongoose.startSession());

  return {
    async listBaskets(actor, filters, pagination) {
      await actorGuard.requireReadActor(actor);
      validateListFilters(filters);
      validatePagination(pagination);
      const query = listFilter(filters, ["nameNormalized"]);
      const [rows, total] = await Promise.all([
        AiEstimatorKnowledgeBasketModel.find(query)
          .sort({ displayOrder: 1, nameNormalized: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        AiEstimatorKnowledgeBasketModel.countDocuments(query).exec()
      ]);
      return { items: rows.map((row) => basketDto(row as Row)), total };
    },

    async createBasket(actor, input) {
      return mapMongoConflict(() => withMongoTransaction(startSession, async (session) => {
        const authorized = await actorGuard.requireMutationActor(actor, session);
        validateBasketCreate(input);
        const timestamp = now();
        const normalized = normalizeKnowledgeIdentity(input.name);
        await ensureBasketIdentityAvailable(normalized, null, session);
        const displayOrderTarget = {
          scope: AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE,
          resourceModel: AiEstimatorKnowledgeBasketModel,
          resourceFilter: {},
          session
        } as const;
        const displayOrder = input.displayOrder === undefined
          ? await allocateAiEstimatorKnowledgeDisplayOrder(displayOrderTarget)
          : input.displayOrder;
        if (input.displayOrder !== undefined) {
          await observeExplicitAiEstimatorKnowledgeDisplayOrder({
            ...displayOrderTarget,
            displayOrder: input.displayOrder
          });
        }
        const [created] = await AiEstimatorKnowledgeBasketModel.create([{
          _id: `knowledge-basket-${createId()}`,
          name: input.name,
          nameNormalized: normalized,
          description: input.description ?? null,
          displayOrder,
          status: input.status ?? "active",
          version: 1,
          createdById: authorized.id,
          updatedById: authorized.id,
          archivedAt: null,
          archivedById: null,
          createdAt: timestamp,
          updatedAt: timestamp
        }], { session });
        if (!created) throw new Error("Knowledge Basket creation did not complete.");
        await dependencies.audit.appendInMongoTransaction({
          actorId: authorized.id,
          action: "ai_estimator_knowledge_basket_created",
          entityType: "ai_estimator_knowledge_basket",
          entityId: String(created._id),
          occurredAt: timestamp.toISOString(),
          newValues: { status: created.status, version: created.version, displayOrder: created.displayOrder }
        }, session);
        return basketDto(created.toObject() as Row);
      }));
    },

    async updateBasket(actor, basketId, input) {
      return mapMongoConflict(() => withMongoTransaction(startSession, async (session) => {
        const authorized = await actorGuard.requireMutationActor(actor, session);
        validateUpdateInput(input);
        const current = await AiEstimatorKnowledgeBasketModel.findById(basketId).session(session).lean().exec() as Row | null;
        requireCurrent(current, input.expectedVersion);
        if (current.status === "archived") archived();
        const set: Record<string, unknown> = { updatedById: authorized.id, updatedAt: now() };
        if (input.name !== undefined) {
          set.name = input.name;
          set.nameNormalized = normalizeKnowledgeIdentity(input.name);
          await ensureBasketIdentityAvailable(String(set.nameNormalized), basketId, session);
        }
        if (input.description !== undefined) set.description = input.description;
        if (input.displayOrder !== undefined) {
          await observeExplicitAiEstimatorKnowledgeDisplayOrder({
            scope: AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE,
            resourceModel: AiEstimatorKnowledgeBasketModel,
            resourceFilter: {},
            session,
            displayOrder: input.displayOrder
          });
          set.displayOrder = input.displayOrder;
        }
        if (input.status !== undefined) set.status = input.status;
        const updated = await AiEstimatorKnowledgeBasketModel.findOneAndUpdate(
          { _id: basketId, version: input.expectedVersion, status: { $ne: "archived" } },
          { $set: set, $inc: { version: 1 } },
          { returnDocument: "after", runValidators: true, session }
        ).lean().exec() as Row | null;
        if (!updated) versionConflict();
        await dependencies.audit.appendInMongoTransaction({
          actorId: authorized.id,
          action: "ai_estimator_knowledge_basket_updated",
          entityType: "ai_estimator_knowledge_basket",
          entityId: basketId,
          occurredAt: (set.updatedAt as Date).toISOString(),
          oldValues: auditState(current),
          newValues: auditState(updated!)
        }, session);
        return basketDto(updated!);
      }));
    },

    async archiveBasket(actor, basketId, input) {
      return withMongoTransaction(startSession, async (session) => {
        const authorized = await actorGuard.requireMutationActor(actor, session);
        validateArchiveInput(input);
        const current = await AiEstimatorKnowledgeBasketModel.findById(basketId).session(session).lean().exec() as Row | null;
        requireCurrent(current, input.expectedVersion);
        if (current.status === "archived") archived();
        if (await AiEstimatorKnowledgeMainLineModel.exists({ basketId, status: { $ne: "archived" } }).session(session)) {
          referenceConflict("Basket has non-archived Main Lines.");
        }
        const timestamp = now();
        const updated = await AiEstimatorKnowledgeBasketModel.findOneAndUpdate(
          { _id: basketId, version: input.expectedVersion, status: { $ne: "archived" } },
          { $set: { status: "archived", archivedAt: timestamp, archivedById: authorized.id, updatedAt: timestamp, updatedById: authorized.id }, $inc: { version: 1 } },
          { returnDocument: "after", runValidators: true, session }
        ).lean().exec() as Row | null;
        if (!updated) versionConflict();
        await dependencies.audit.appendInMongoTransaction({
          actorId: authorized.id,
          action: "ai_estimator_knowledge_basket_archived",
          entityType: "ai_estimator_knowledge_basket",
          entityId: basketId,
          occurredAt: timestamp.toISOString(),
          oldValues: auditState(current),
          newValues: auditState(updated!),
          reason: input.reason ?? null
        }, session);
        return basketDto(updated!);
      });
    },

    async getBasketDeletionImpact(actor, basketId) {
      await actorGuard.requireReadActor(actor);
      const basket = await AiEstimatorKnowledgeBasketModel.findById(basketId)
        .lean()
        .exec() as Row | null;
      if (!basket) notFound();
      return basketDeletionImpact(basket, basketId);
    },

    async permanentlyDeleteBasket(actor, basketId, input) {
      return withMongoTransaction(startSession, async (session) => {
        const authorized = await actorGuard.requireMutationActor(actor, session);
        validatePermanentDeleteBasketInput(input);
        const current = await AiEstimatorKnowledgeBasketModel.findById(basketId)
          .session(session)
          .lean()
          .exec() as Row | null;
        if (!current) notFound();
        if (current.version !== input.expectedVersion) versionConflict();
        if (current.name !== input.confirmationName) {
          throw new ApiError(
            400,
            "VALIDATION_ERROR",
            "Basket confirmation name must exactly match the stored name.",
            { confirmationName: "Enter the exact current Basket name." }
          );
        }

        const impact = await basketDeletionImpact(current, basketId, session);
        if (!impact.canDelete) basketDeleteBlocked();

        const dependencyEpoch = safeDependencyEpoch(current.dependencyEpoch);
        const dependencyEpochFilter = dependencyEpoch === 0
          ? { $or: [{ dependencyEpoch: 0 }, { dependencyEpoch: { $exists: false } }] }
          : { dependencyEpoch };
        const deleted = await AiEstimatorKnowledgeBasketModel.deleteOne({
          _id: basketId,
          version: input.expectedVersion,
          ...dependencyEpochFilter
        }).session(session).exec();
        if (deleted.deletedCount !== 1) versionConflict();

        const timestamp = now();
        await dependencies.audit.appendInMongoTransaction({
          actorId: authorized.id,
          action: "ai_estimator_knowledge_basket_permanently_deleted",
          entityType: "ai_estimator_knowledge_basket",
          entityId: basketId,
          occurredAt: timestamp.toISOString(),
          oldValues: {
            name: current.name,
            status: current.status,
            displayOrder: current.displayOrder,
            version: current.version,
            bootstrapOwned: impact.bootstrapOwned
          },
          reason: input.reason.trim()
        }, session);
        return {
          basketId,
          deleted: true,
          deletedAt: timestamp.toISOString()
        };
      });
    },

    async listMasters(actor, masterType, filters, pagination) {
      await actorGuard.requireReadActor(actor);
      validateListFilters(filters);
      const model = requireMasterModel(masterType);
      validatePagination(pagination);
      const query = listFilter(filters, ["codeNormalized", "nameNormalized"]);
      const [rows, total] = await Promise.all([
        model.find(query).sort({ displayOrder: 1, nameNormalized: 1, _id: 1 }).skip(pagination.offset).limit(pagination.limit).lean().exec(),
        model.countDocuments(query).exec()
      ]);
      const typedRows = rows as Row[];
      const taxVersions = masterType === "taxes"
        ? await taxVersionsByRuleIds(typedRows.map((row) => String(row._id)))
        : new Map<string, readonly KnowledgeTaxVersion[]>();
      return {
        items: typedRows.map((row) => masterDto(
          masterType,
          row,
          taxVersions.get(String(row._id))
        )),
        total
      };
    },

    async createMaster(actor, masterType, input) {
      return mapMongoConflict(() => withMongoTransaction(startSession, async (session) => {
        const authorized = await actorGuard.requireMutationActor(actor, session);
        const model = requireMasterModel(masterType);
        validateMasterCreate(masterType, input);
        const timestamp = now();
        const id = `knowledge-${singular(masterType)}-${createId()}`;
        const code = masterType === "surfaces"
          ? input.code ?? generatedSurfaceCode(id)
          : input.code;
        if (!code) {
          throw new ApiError(400, "VALIDATION_ERROR", "code is invalid.", {
            code: "Required bounded text."
          });
        }
        const codeNormalized = normalizeKnowledgeIdentity(code);
        const nameNormalized = normalizeKnowledgeIdentity(input.name);
        await ensureMasterIdentityAvailable(model, codeNormalized, nameNormalized, null, session);
        const displayOrderTarget = {
          scope: createAiEstimatorKnowledgeMasterDisplayOrderScope(masterType),
          resourceModel: model,
          resourceFilter: {},
          session
        } as const;
        const displayOrder = input.displayOrder === undefined
          ? await allocateAiEstimatorKnowledgeDisplayOrder(displayOrderTarget)
          : input.displayOrder;
        if (input.displayOrder !== undefined) {
          await observeExplicitAiEstimatorKnowledgeDisplayOrder({
            ...displayOrderTarget,
            displayOrder: input.displayOrder
          });
        }
        const [created] = await model.create([{
          _id: id,
          code,
          codeNormalized,
          name: input.name,
          nameNormalized,
          description: input.description ?? null,
          displayOrder,
          status: input.status ?? "active",
          ...(masterType === "uoms" ? { decimalScale: input.decimalScale } : {}),
          version: 1,
          createdById: authorized.id,
          updatedById: authorized.id,
          archivedAt: null,
          archivedById: null,
          createdAt: timestamp,
          updatedAt: timestamp
        }], { session });
        if (!created) throw new Error("Knowledge master creation did not complete.");
        if (masterType === "taxes" && input.taxVersion) {
          await appendTaxVersion(id, input.taxVersion, authorized.id, timestamp, session, dependencies.audit, createId);
        }
        await dependencies.audit.appendInMongoTransaction({
          actorId: authorized.id,
          action: "ai_estimator_knowledge_master_created",
          entityType: `ai_estimator_knowledge_${singular(masterType)}`,
          entityId: id,
          occurredAt: timestamp.toISOString(),
          newValues: masterType === "surfaces"
            ? { masterType, ...masterAuditState(created.toObject() as Row, masterType) }
            : { masterType, status: created.get("status"), version: created.get("version"), displayOrder: created.get("displayOrder") }
        }, session);
        const row = created.toObject() as Row;
        return masterDto(
          masterType,
          row,
          masterType === "taxes"
            ? (await taxVersionsByRuleIds([id], session)).get(id) ?? []
            : undefined
        );
      }));
    },

    async updateMaster(actor, masterType, id, input) {
      return mapMongoConflict(() => withMongoTransaction(startSession, async (session) => {
        const authorized = await actorGuard.requireMutationActor(actor, session);
        const model = requireMasterModel(masterType);
        validateMasterUpdate(masterType, input);
        const current = await model.findById(id).session(session).lean().exec() as Row | null;
        requireCurrent(current, input.expectedVersion);
        if (current.status === "archived") archived();
        if (masterType === "taxes" && isFixedGstRuleId(current._id)) {
          canonicalTaxPolicyImmutable();
        }
        if (masterType === "priorities") {
          assertCanonicalPriorityGenericUpdate(current, input);
        }
        const timestamp = now();
        const set: Record<string, unknown> = { updatedById: authorized.id, updatedAt: timestamp };
        const codeNormalized = input.code === undefined ? String(current.codeNormalized) : normalizeKnowledgeIdentity(input.code);
        const nameNormalized = input.name === undefined ? String(current.nameNormalized) : normalizeKnowledgeIdentity(input.name);
        if (input.code !== undefined) { set.code = input.code; set.codeNormalized = codeNormalized; }
        if (input.name !== undefined) { set.name = input.name; set.nameNormalized = nameNormalized; }
        if (input.code !== undefined || input.name !== undefined) await ensureMasterIdentityAvailable(model, codeNormalized, nameNormalized, id, session);
        if (input.description !== undefined) set.description = input.description;
        if (input.displayOrder !== undefined) {
          await observeExplicitAiEstimatorKnowledgeDisplayOrder({
            scope: createAiEstimatorKnowledgeMasterDisplayOrderScope(masterType),
            resourceModel: model,
            resourceFilter: {},
            session,
            displayOrder: input.displayOrder
          });
          set.displayOrder = input.displayOrder;
        }
        if (input.status !== undefined) set.status = input.status;
        let dependencyEpochFilter: Record<string, unknown> = {};
        if (masterType === "uoms" && input.decimalScale !== undefined) {
          if (Number(current.decimalScale) !== input.decimalScale) {
            if (await uomHasAnyKnowledgeReference(id, session)) {
              throw new ApiError(
                409,
                "REFERENCED_UOM_SCALE_IMMUTABLE",
                "UOM decimal scale cannot change after the UOM has been referenced."
              );
            }
            const dependencyEpoch = safeDependencyEpoch(current.dependencyEpoch, "UOM");
            dependencyEpochFilter = dependencyEpoch === 0
              ? { $or: [{ dependencyEpoch: 0 }, { dependencyEpoch: { $exists: false } }] }
              : { dependencyEpoch };
          }
          set.decimalScale = input.decimalScale;
        }
        const updated = await model.findOneAndUpdate(
          {
            _id: id,
            version: input.expectedVersion,
            status: { $ne: "archived" },
            ...dependencyEpochFilter
          },
          { $set: set, $inc: { version: 1 } },
          { returnDocument: "after", runValidators: true, session }
        ).lean().exec() as Row | null;
        if (!updated) versionConflict();
        if (masterType === "taxes" && input.taxVersion) {
          if (input.taxVersion.rolloverFromVersionId) {
            await rolloverTaxVersion(
              id,
              input.taxVersion,
              authorized.id,
              timestamp,
              session,
              dependencies.audit,
              createId
            );
          } else {
            await appendTaxVersion(id, input.taxVersion, authorized.id, timestamp, session, dependencies.audit, createId);
          }
        }
        await dependencies.audit.appendInMongoTransaction({
          actorId: authorized.id,
          action: "ai_estimator_knowledge_master_updated",
          entityType: `ai_estimator_knowledge_${singular(masterType)}`,
          entityId: id,
          occurredAt: timestamp.toISOString(),
          oldValues: masterAuditState(current, masterType),
          newValues: masterAuditState(updated!, masterType)
        }, session);
        return masterDto(
          masterType,
          updated!,
          masterType === "taxes"
            ? (await taxVersionsByRuleIds([id], session)).get(id) ?? []
            : undefined
        );
      }));
    },

    async archiveMaster(actor, masterType, id, input) {
      return withMongoTransaction(startSession, async (session) => {
        const authorized = await actorGuard.requireMutationActor(actor, session);
        const model = requireMasterModel(masterType);
        validateArchiveInput(input);
        const current = await model.findById(id).session(session).lean().exec() as Row | null;
        requireCurrent(current, input.expectedVersion);
        if (current.status === "archived") archived();
        if (masterType === "taxes" && isFixedGstRuleId(current._id)) {
          canonicalTaxPolicyImmutable();
        }
        await requireNoMasterReferences(masterType, id, session);
        if (masterType === "priorities" && canonicalPriorityIdentityForRow(current)) {
          canonicalPriorityImmutable();
        }
        const guardedDependencyEpoch = masterType === "modes" ||
          masterType === "uoms" ||
          masterType === "vendors" ||
          masterType === "taxes" ||
          masterType === "priorities" ||
          masterType === "surfaces"
          ? safeDependencyEpoch(
              current.dependencyEpoch,
              masterType === "modes"
                ? "Mode"
                : masterType === "uoms"
                  ? "UOM"
                  : masterType === "vendors"
                    ? "Vendor"
                    : masterType === "taxes"
                      ? "Tax"
                      : masterType === "priorities"
                        ? "Priority"
                        : "Surface"
            )
          : null;
        const guardedDependencyEpochFilter = guardedDependencyEpoch === null
          ? {}
          : guardedDependencyEpoch === 0
            ? { $or: [{ dependencyEpoch: 0 }, { dependencyEpoch: { $exists: false } }] }
            : { dependencyEpoch: guardedDependencyEpoch };
        const timestamp = now();
        const updated = await model.findOneAndUpdate(
          {
            _id: id,
            version: input.expectedVersion,
            status: { $ne: "archived" },
            ...guardedDependencyEpochFilter
          },
          { $set: { status: "archived", archivedAt: timestamp, archivedById: authorized.id, updatedAt: timestamp, updatedById: authorized.id }, $inc: { version: 1 } },
          { returnDocument: "after", runValidators: true, session }
        ).lean().exec() as Row | null;
        if (!updated) versionConflict();
        await dependencies.audit.appendInMongoTransaction({
          actorId: authorized.id,
          action: "ai_estimator_knowledge_master_archived",
          entityType: `ai_estimator_knowledge_${singular(masterType)}`,
          entityId: id,
          occurredAt: timestamp.toISOString(),
          oldValues: masterAuditState(current, masterType),
          newValues: masterAuditState(updated!, masterType),
          reason: input.reason ?? null
        }, session);
        return masterDto(
          masterType,
          updated!,
          masterType === "taxes"
            ? (await taxVersionsByRuleIds([id], session)).get(id) ?? []
            : undefined
        );
      });
    }
  };
}

async function basketDeletionImpact(
  basket: Row,
  basketId: string,
  session?: ClientSession
): Promise<AiEstimatorKnowledgeBasketDeletionImpact> {
  const mainLineCountQuery = AiEstimatorKnowledgeMainLineModel.countDocuments({ basketId });
  const sectionQuery = AiEstimatorKnowledgeSectionModel.find({
    $or: [
      { "payload.exclusions.targetBasketId": basketId },
      { "payload.recommendations.targetBasketId": basketId },
      { "payload.dependencies.targetBasketId": basketId }
    ]
  }).select({ payload: 1 });
  if (session) {
    mainLineCountQuery.session(session);
    sectionQuery.session(session);
  }
  const [mainLineCount, sections] = await Promise.all([
    mainLineCountQuery.exec(),
    sectionQuery.lean().exec()
  ]);
  const historicalReferenceCount = sections.reduce(
    (count, section) => count + basketReferenceCount(
      (section as unknown as Row).payload,
      basketId
    ),
    0
  );
  const bootstrapOwned = bootstrapBasketIds.has(basketId);
  const blockers: AiEstimatorKnowledgeBasketDeletionBlocker[] = [];
  if (bootstrapOwned) {
    blockers.push({
      code: "BOOTSTRAP_OWNED",
      message: "Bootstrap-owned Baskets cannot be permanently deleted."
    });
  }
  if (mainLineCount > 0) {
    blockers.push({
      code: "HAS_MAIN_LINES",
      message: "Baskets with Estimation Items are archive-only."
    });
  }
  if (historicalReferenceCount > 0) {
    blockers.push({
      code: "HAS_HISTORICAL_REFERENCES",
      message: "Baskets retained by historical knowledge relationships are archive-only."
    });
  }
  return {
    basketId,
    basketName: String(basket.name),
    version: Number(basket.version),
    mainLineCount,
    historicalReferenceCount,
    bootstrapOwned,
    canDelete: blockers.length === 0,
    blockers
  };
}

function basketReferenceCount(payload: unknown, basketId: string): number {
  const row = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Row
    : {};
  return [row.exclusions, row.recommendations, row.dependencies]
    .flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value])
    .reduce((count, candidate) => {
      const relation = candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? candidate as Row
        : null;
      return count + (relation?.targetBasketId === basketId ? 1 : 0);
    }, 0);
}

function safeDependencyEpoch(
  value: unknown,
  label: "Basket" | "Mode" | "Priority" | "Surface" | "Tax" | "UOM" | "Vendor" = "Basket"
): number {
  if (value === undefined || value === null) return 0;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Knowledge ${label} dependency epoch is corrupt.`);
  }
  return Number(value);
}

function validatePermanentDeleteBasketInput(
  input: AiEstimatorKnowledgePermanentDeleteBasketInput
): void {
  validateExpectedVersion(input.expectedVersion);
  if (
    typeof input.confirmationName !== "string" ||
    input.confirmationName.length < 1 ||
    input.confirmationName.length > AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Basket confirmation name is invalid.", {
      confirmationName: "Enter the exact current Basket name."
    });
  }
  if (
    typeof input.reason !== "string" ||
    input.reason.trim().length < 1 ||
    input.reason.length > 1_000
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Permanent deletion reason is invalid.", {
      reason: "Enter a non-empty reason of at most 1000 characters."
    });
  }
}

function requireMasterModel(masterType: AiEstimatorKnowledgeMasterType): Model<any> {
  const model = masterModels[masterType];
  if (!model) throw new ApiError(400, "INVALID_MASTER_TYPE", "Knowledge master type is invalid.");
  return model;
}

async function withMongoTransaction<T>(startSession: TransactionStarter, operation: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => { result = await operation(session); });
    return result;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

async function mapMongoConflict<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new ApiError(409, "DUPLICATE_IDENTITY", "A non-archived knowledge resource already uses that identity.");
    throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 11000);
}

function listFilter(filters: AiEstimatorKnowledgeListFilters, searchFields: readonly string[]): Record<string, unknown> {
  const query: Record<string, unknown> = filters.status
    ? { status: filters.status }
    : filters.includeArchived
      ? {}
      : { status: { $ne: "archived" } };
  if (filters.search !== undefined) {
    const search = normalizeKnowledgeIdentity(filters.search);
    if (search.length > 0) query.$or = searchFields.map((field) => ({ [field]: { $regex: escapeRegex(search) } }));
  }
  return query;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function validatePagination(pagination: PaginationInput): void {
  if (!Number.isSafeInteger(pagination.limit) || pagination.limit < 1 || pagination.limit > 100 || !Number.isSafeInteger(pagination.offset) || pagination.offset < 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Pagination is invalid.");
  }
}

function validateListFilters(filters: AiEstimatorKnowledgeListFilters): void {
  if (filters.search !== undefined && (typeof filters.search !== "string" || filters.search.length > AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Search filter is invalid.");
  }
  if (filters.status !== undefined && !["active", "inactive", "archived"].includes(filters.status)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Status filter is invalid.");
  }
}

function validateBasketCreate(input: AiEstimatorKnowledgeCreateBasketInput): void {
  validateName(input.name, "name");
  validateDescription(input.description);
  validateDisplayOrder(input.displayOrder);
  validateMutableStatus(input.status);
}

function validateUpdateInput(input: AiEstimatorKnowledgeUpdateBasketInput): void {
  validateExpectedVersion(input.expectedVersion);
  if (input.name !== undefined) validateName(input.name, "name");
  validateDescription(input.description);
  validateDisplayOrder(input.displayOrder);
  validateMutableStatus(input.status);
}

function validateMasterCreate(masterType: AiEstimatorKnowledgeMasterType, input: AiEstimatorKnowledgeAnyCreateMasterInput): void {
  if (input.code !== undefined) validateName(input.code, "code", 64);
  else if (masterType !== "surfaces") {
    throw new ApiError(400, "VALIDATION_ERROR", "code is invalid.", {
      code: "Required bounded text."
    });
  }
  validateName(input.name, "name");
  validateDescription(input.description);
  validateDisplayOrder(input.displayOrder);
  validateMutableStatus(input.status);
  validateMasterSpecificInput(masterType, input, true);
}

function validateMasterUpdate(masterType: AiEstimatorKnowledgeMasterType, input: AiEstimatorKnowledgeAnyUpdateMasterInput): void {
  validateExpectedVersion(input.expectedVersion);
  if (input.code !== undefined) validateName(input.code, "code", 64);
  if (input.name !== undefined) validateName(input.name, "name");
  validateDescription(input.description);
  validateDisplayOrder(input.displayOrder);
  validateMutableStatus(input.status);
  validateMasterSpecificInput(masterType, input, false);
}

function validateMasterSpecificInput(
  masterType: AiEstimatorKnowledgeMasterType,
  input: AiEstimatorKnowledgeAnyCreateMasterInput | AiEstimatorKnowledgeAnyUpdateMasterInput,
  creating: boolean
): void {
  if (masterType === "uoms") {
    if ((creating || input.decimalScale !== undefined) && (!Number.isSafeInteger(input.decimalScale) || input.decimalScale! < 0 || input.decimalScale! > 3)) {
      throw new ApiError(400, "VALIDATION_ERROR", "UOM decimalScale must be an integer from 0 to 3.", { decimalScale: "Invalid UOM scale." });
    }
  } else if (input.decimalScale !== undefined) {
    throw new ApiError(400, "VALIDATION_ERROR", "decimalScale is valid only for UOM.", { decimalScale: "Field is not applicable." });
  }
  if (masterType !== "taxes" && input.taxVersion !== undefined) {
    throw new ApiError(400, "VALIDATION_ERROR", "taxVersion is valid only for Tax.", { taxVersion: "Field is not applicable." });
  }
  if (input.taxVersion) {
    validateTaxVersionInput(input.taxVersion);
    const rolloverFromVersionId = "rolloverFromVersionId" in input.taxVersion
      ? input.taxVersion.rolloverFromVersionId
      : undefined;
    if (creating && rolloverFromVersionId !== undefined) {
      throw new ApiError(400, "VALIDATION_ERROR", "Tax rollover is valid only when updating a Tax master.", {
        rolloverFromVersionId: "Field is not applicable during creation."
      });
    }
    if (rolloverFromVersionId !== undefined) {
      validateStableServiceId(rolloverFromVersionId, "rolloverFromVersionId");
      if ((input.taxVersion.status ?? "active") !== "active") {
        throw new ApiError(400, "VALIDATION_ERROR", "A Tax rollover successor must be active.", {
          status: "Use active for a rollover successor."
        });
      }
    }
  }
}

function validateStableServiceId(value: unknown, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 240) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a bounded stable ID.`, {
      [field]: "Invalid stable ID."
    });
  }
}

function generatedSurfaceCode(surfaceId: string): string {
  const digest = createHash("sha256").update(surfaceId).digest("hex").slice(0, 48);
  return `surface-${digest}`;
}

function validateTaxVersionInput(input: AiEstimatorKnowledgeTaxVersionInput): void {
  if (!Number.isSafeInteger(input.rateBps) || input.rateBps < 0 || input.rateBps > AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS * 10) {
    throw new ApiError(400, "VALIDATION_ERROR", "Tax rate is invalid.", { rateBps: "Use bounded integer basis points." });
  }
  validateName(input.applicability, "applicability");
  if (!AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS.includes(input.treatment)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Tax treatment is invalid.", { treatment: "Unsupported tax treatment." });
  }
  if (input.status !== undefined && !AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES.includes(input.status)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Tax version status is invalid.", { status: "Unsupported version status." });
  }
  const window = { id: "candidate", effectiveFrom: parseDate(input.effectiveFrom, "effectiveFrom"), effectiveTo: input.effectiveTo == null ? null : parseDate(input.effectiveTo, "effectiveTo") };
  if (validateEffectiveWindow(window).length > 0) throw new ApiError(400, "VALIDATION_ERROR", "Tax effective window is invalid.", { effectiveTo: "Must be later than effectiveFrom." });
}

function validateArchiveInput(input: AiEstimatorKnowledgeArchiveInput): void {
  validateExpectedVersion(input.expectedVersion);
  if (input.reason !== undefined && input.reason !== null && (input.reason.trim().length === 0 || input.reason.length > 500)) throw new ApiError(400, "VALIDATION_ERROR", "Archive reason is invalid.");
}

function validateExpectedVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new ApiError(400, "VALIDATION_ERROR", "expectedVersion must be a positive integer.");
}

function validateMutableStatus(value: MutableMasterStatus | undefined): void {
  if (value !== undefined && value !== "active" && value !== "inactive") {
    throw new ApiError(400, "VALIDATION_ERROR", "Knowledge status is invalid.", { status: "Use active or inactive." });
  }
}

function validateName(value: string, field: string, max = AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT): void {
  if (typeof value !== "string" || value.normalize("NFKC").trim().length === 0 || value.length > max) throw new ApiError(400, "VALIDATION_ERROR", `${field} is invalid.`, { [field]: "Required bounded text." });
}

function validateDescription(value: string | null | undefined): void {
  if (value !== undefined && value !== null && value.length > AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT) throw new ApiError(400, "VALIDATION_ERROR", "Description is too long.");
}

function validateDisplayOrder(value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new ApiError(400, "VALIDATION_ERROR", "displayOrder must be a nonnegative integer.");
}

function parseDate(value: string, field: string): Date {
  const date = typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(value) || Number.isNaN(date.getTime())) throw new ApiError(400, "VALIDATION_ERROR", `${field} must be an ISO date-time.`);
  return date;
}

async function ensureBasketIdentityAvailable(normalized: string, excludeId: string | null, session: ClientSession): Promise<void> {
  const query: Record<string, unknown> = { nameNormalized: normalized, status: { $ne: "archived" } };
  if (excludeId) query._id = { $ne: excludeId };
  if (await AiEstimatorKnowledgeBasketModel.exists(query).session(session)) duplicateIdentity();
}

async function ensureMasterIdentityAvailable(model: Model<any>, codeNormalized: string, nameNormalized: string, excludeId: string | null, session: ClientSession): Promise<void> {
  const query: Record<string, unknown> = { status: { $ne: "archived" }, $or: [{ codeNormalized }, { nameNormalized }] };
  if (excludeId) query._id = { $ne: excludeId };
  if (await model.exists(query).session(session)) duplicateIdentity();
}

async function uomHasAnyKnowledgeReference(
  uomId: string,
  session: ClientSession
): Promise<boolean> {
  const [sectionReference, priceReference] = await Promise.all([
    AiEstimatorKnowledgeSectionModel.exists({
      $or: [
        { "payload.uomId": uomId },
        { "payload.productivity.uomId": uomId },
        { "payload.priceEntries.uomId": uomId },
        { "payload.slabRates.uomId": uomId }
      ]
    }).session(session),
    AiEstimatorKnowledgePriceVersionModel.exists({ uomId }).session(session)
  ]);
  return Boolean(sectionReference || priceReference);
}

async function appendTaxVersion(
  taxRuleId: string,
  input: AiEstimatorKnowledgeTaxVersionInput,
  actorId: string,
  timestamp: Date,
  session: ClientSession,
  audit: Pick<AuditService, "appendInMongoTransaction">,
  createId: () => string
): Promise<{ id: string; versionNumber: number }> {
  if (isFixedGstRuleId(taxRuleId)) canonicalTaxPolicyImmutable();
  validateTaxVersionInput(input);
  const effectiveFrom = parseDate(input.effectiveFrom, "effectiveFrom");
  const effectiveTo = input.effectiveTo == null ? null : parseDate(input.effectiveTo, "effectiveTo");
  const status = input.status ?? "active";
  if (status === "active") {
    const active = await AiEstimatorKnowledgeTaxVersionModel.find({ taxRuleId, status: "active" }).session(session).lean().exec();
    const overlaps = findOverlappingEffectiveWindows([
      ...active.map((row) => ({ id: String(row._id), effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo ?? null })),
      { id: "candidate", effectiveFrom, effectiveTo }
    ]).some(([left, right]) => left === "candidate" || right === "candidate");
    if (overlaps) throw new ApiError(409, "EFFECTIVE_WINDOW_OVERLAP", "Tax effective windows cannot overlap.");
  }
  const latest = await AiEstimatorKnowledgeTaxVersionModel.findOne({ taxRuleId }).sort({ versionNumber: -1, _id: 1 }).session(session).lean().exec();
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const id = `knowledge-tax-version-${createId()}`;
  await AiEstimatorKnowledgeTaxVersionModel.create([{
    _id: id,
    taxRuleId,
    versionNumber,
    rateBps: input.rateBps,
    treatment: input.treatment,
    applicability: input.applicability,
    effectiveFrom,
    effectiveTo,
    status,
    version: 1,
    createdById: actorId,
    updatedById: actorId,
    createdAt: timestamp,
    updatedAt: timestamp
  }], { session });
  await audit.appendInMongoTransaction({
    actorId,
    action: "ai_estimator_knowledge_tax_version_created",
    entityType: "ai_estimator_knowledge_tax_version",
    entityId: id,
    occurredAt: timestamp.toISOString(),
    newValues: { taxRuleId, versionNumber, rateBps: input.rateBps, treatment: input.treatment, status }
  }, session);
  return { id, versionNumber };
}

async function rolloverTaxVersion(
  taxRuleId: string,
  input: AiEstimatorKnowledgeTaxVersionUpdateInput,
  actorId: string,
  timestamp: Date,
  session: ClientSession,
  audit: Pick<AuditService, "appendInMongoTransaction">,
  createId: () => string
): Promise<void> {
  if (isFixedGstRuleId(taxRuleId) || isFixedGstVersionId(input.rolloverFromVersionId)) {
    canonicalTaxPolicyImmutable();
  }
  const rolloverFromVersionId = input.rolloverFromVersionId;
  if (!rolloverFromVersionId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Tax rollover requires its predecessor version ID.");
  }
  const successorEffectiveFrom = parseDate(input.effectiveFrom, "effectiveFrom");
  const predecessor = await AiEstimatorKnowledgeTaxVersionModel.findOne({
    _id: rolloverFromVersionId,
    taxRuleId
  }).session(session).lean().exec();
  if (!predecessor) {
    throw new ApiError(404, "ROLLOVER_PREDECESSOR_NOT_FOUND", "The Tax rollover predecessor was not found.");
  }
  if (predecessor.status !== "active" || predecessor.effectiveTo !== null) {
    throw new ApiError(
      409,
      "ROLLOVER_PREDECESSOR_NOT_OPEN",
      "The Tax rollover predecessor must be active and open-ended."
    );
  }
  if (predecessor.effectiveFrom.getTime() >= successorEffectiveFrom.getTime()) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Tax rollover effectiveFrom must be later than the predecessor start.",
      { effectiveFrom: "Must be later than the predecessor effectiveFrom." }
    );
  }
  const crossingPrice = await AiEstimatorKnowledgePriceVersionModel.exists({
    taxVersionId: rolloverFromVersionId,
    $or: [
      { effectiveTo: null },
      { effectiveTo: { $gt: successorEffectiveFrom } }
    ]
  }).session(session);
  if (crossingPrice) {
    throw new ApiError(
      409,
      "TAX_VERSION_PRICE_WINDOW_CONFLICT",
      "Tax rollover cannot close a version while a referencing Price version extends beyond the rollover date."
    );
  }

  const closed = await AiEstimatorKnowledgeTaxVersionModel.findOneAndUpdate(
    {
      _id: rolloverFromVersionId,
      taxRuleId,
      version: predecessor.version,
      status: "active",
      effectiveTo: null
    },
    {
      $set: {
        effectiveTo: successorEffectiveFrom,
        updatedById: actorId,
        updatedAt: timestamp
      },
      $inc: { version: 1 }
    },
    { returnDocument: "after", runValidators: true, session }
  ).lean().exec();
  if (!closed) {
    throw new ApiError(409, "ROLLOVER_CONFLICT", "The Tax rollover predecessor changed elsewhere.");
  }

  const successor = await appendTaxVersion(
    taxRuleId,
    input,
    actorId,
    timestamp,
    session,
    audit,
    createId
  );
  await audit.appendInMongoTransaction({
    actorId,
    action: "ai_estimator_knowledge_tax_version_rolled_over",
    entityType: "ai_estimator_knowledge_tax_version",
    entityId: rolloverFromVersionId,
    occurredAt: timestamp.toISOString(),
    oldValues: {
      taxRuleId,
      effectiveTo: null,
      version: predecessor.version
    },
    newValues: {
      taxRuleId,
      effectiveTo: successorEffectiveFrom.toISOString(),
      version: closed.version,
      successorTaxVersionId: successor.id,
      successorVersionNumber: successor.versionNumber
    }
  }, session);
}

async function requireNoMasterReferences(masterType: AiEstimatorKnowledgeMasterType, id: string, session: ClientSession): Promise<void> {
  const mainLines = await AiEstimatorKnowledgeMainLineModel.find({ status: { $ne: "archived" } }).select({ _id: 1 }).session(session).lean().exec();
  const revisions = await AiEstimatorKnowledgeRevisionModel.find({ mainLineId: { $in: mainLines.map((row) => row._id) }, status: { $in: ["draft", "active"] } }).select({ _id: 1 }).session(session).lean().exec();
  const revisionIds = revisions.map((row) => row._id);
  const sectionPaths: Record<AiEstimatorKnowledgeMasterType, string[]> = {
    uoms: ["payload.uomId", "payload.productivity.uomId", "payload.priceEntries.uomId", "payload.slabRates.uomId"],
    vendors: ["payload.priceEntries.vendorId"],
    taxes: ["payload.priceEntries.taxRuleId"],
    priorities: ["payload.priorityId", "payload.recommendations.priorityId"],
    surfaces: ["payload.surfaceIds"],
    modes: [
      "payload.modeIds",
      "payload.priceEntries.modeId",
      "payload.modeOverrides.modeId",
      "payload.modeConfigurations.modeId"
    ]
  };
  if (revisionIds.length > 0 && await AiEstimatorKnowledgeSectionModel.exists({ revisionId: { $in: revisionIds }, $or: sectionPaths[masterType].map((path) => ({ [path]: id })) }).session(session)) {
    referenceConflict("Knowledge master has an active or Draft section reference.");
  }
  const priceField: Partial<Record<AiEstimatorKnowledgeMasterType, string>> = { uoms: "uomId", vendors: "vendorId", taxes: "taxRuleId", modes: "modeId" };
  const field = priceField[masterType];
  if (field && revisionIds.length > 0 && await AiEstimatorKnowledgePriceVersionModel.exists({ revisionId: { $in: revisionIds }, status: { $in: ["draft", "active"] }, [field]: id }).session(session)) {
    referenceConflict("Knowledge master has an active or Draft price reference.");
  }
}

function basketDto(row: Row): AiEstimatorKnowledgeBasketDto {
  return {
    id: String(row._id),
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    displayOrder: Number(row.displayOrder),
    status: row.status as KnowledgeMasterStatus,
    version: Number(row.version),
    createdById: String(row.createdById),
    updatedById: String(row.updatedById),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

function masterDto(
  masterType: AiEstimatorKnowledgeMasterType,
  row: Row,
  taxVersions?: readonly KnowledgeTaxVersion[]
): AiEstimatorKnowledgeMasterDto {
  const canonicalPriority = masterType === "priorities"
    ? canonicalPriorityForRow(row)
    : null;
  return {
    id: String(row._id),
    masterType,
    code: String(row.code),
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    displayOrder: Number(row.displayOrder),
    status: row.status as KnowledgeMasterStatus,
    version: Number(row.version),
    ...(masterType === "uoms" ? { decimalScale: Number(row.decimalScale) } : {}),
    ...(canonicalPriority ? { semanticTier: canonicalPriority.semanticTier } : {}),
    ...(masterType === "taxes" ? { taxVersions: taxVersions ?? [] } : {}),
    createdById: String(row.createdById),
    updatedById: String(row.updatedById),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

function canonicalPriorityForRow(row: Row): CanonicalKnowledgePriority | null {
  const id = typeof row._id === "string" ? row._id : String(row._id);
  const byId = findCanonicalKnowledgePriorityById(id);
  const tier = isKnowledgePrioritySemanticTier(row.semanticTier)
    ? row.semanticTier
    : null;
  const canonical = byId ?? (tier ? findCanonicalKnowledgePriorityByTier(tier) : null);
  if (!canonical) return null;
  return row._id === canonical.id &&
    row.semanticTier === canonical.semanticTier &&
    row.code === canonical.code &&
    row.name === canonical.name &&
    row.displayOrder === canonical.displayOrder &&
    row.status === "active"
    ? canonical
    : null;
}

function canonicalPriorityIdentityForRow(row: Row): CanonicalKnowledgePriority | null {
  const id = typeof row._id === "string" ? row._id : String(row._id);
  const byId = findCanonicalKnowledgePriorityById(id);
  if (byId) return byId;
  return isKnowledgePrioritySemanticTier(row.semanticTier)
    ? findCanonicalKnowledgePriorityByTier(row.semanticTier)
    : null;
}

function assertCanonicalPriorityGenericUpdate(
  current: Row,
  input: AiEstimatorKnowledgeAnyUpdateMasterInput
): void {
  const canonical = canonicalPriorityIdentityForRow(current);
  if (!canonical) return;
  if (
    (input.code !== undefined && input.code !== current.code) ||
    (input.name !== undefined && input.name !== current.name) ||
    (input.displayOrder !== undefined && input.displayOrder !== current.displayOrder) ||
    (input.status !== undefined && input.status !== current.status)
  ) {
    canonicalPriorityImmutable();
  }
}

async function taxVersionsByRuleIds(
  taxRuleIds: readonly string[],
  session?: ClientSession
): Promise<Map<string, readonly KnowledgeTaxVersion[]>> {
  const result = new Map<string, KnowledgeTaxVersion[]>();
  for (const taxRuleId of taxRuleIds) result.set(taxRuleId, []);
  if (taxRuleIds.length === 0) return result;

  const query = AiEstimatorKnowledgeTaxVersionModel.find({
    taxRuleId: { $in: [...taxRuleIds] }
  }).sort({ taxRuleId: 1, versionNumber: 1, _id: 1 });
  if (session) query.session(session);
  const rows = await query.lean().exec();
  for (const row of rows) {
    const taxRuleId = String(row.taxRuleId);
    const versions = result.get(taxRuleId);
    if (!versions) continue;
    versions.push(taxVersionDto(row as unknown as Row));
  }
  return result;
}

function taxVersionDto(row: Row): KnowledgeTaxVersion {
  return {
    id: String(row._id),
    taxRuleId: String(row.taxRuleId),
    versionNumber: Number(row.versionNumber),
    rateBps: Number(row.rateBps),
    treatment: row.treatment as KnowledgeTaxTreatment,
    applicability: String(row.applicability),
    effectiveFrom: iso(row.effectiveFrom),
    effectiveTo: row.effectiveTo == null ? null : iso(row.effectiveTo),
    status: row.status as KnowledgeVersionStatus,
    version: Number(row.version),
    createdById: String(row.createdById),
    updatedById: String(row.updatedById),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  throw new Error("Knowledge timestamp is missing.");
}

function auditState(row: Row): Record<string, unknown> {
  return { status: row.status, version: row.version, displayOrder: row.displayOrder };
}

function masterAuditState(
  row: Row,
  masterType: AiEstimatorKnowledgeMasterType
): Record<string, unknown> {
  if (masterType !== "surfaces") return auditState(row);
  return {
    name: row.name,
    description: typeof row.description === "string" ? row.description : null,
    status: row.status,
    displayOrder: row.displayOrder,
    version: row.version
  };
}

function requireCurrent(row: Row | null, expectedVersion: number): asserts row is Row {
  if (!row) notFound();
  if (row.version !== expectedVersion) versionConflict();
}

function singular(masterType: AiEstimatorKnowledgeMasterType): string {
  return masterType === "taxes" ? "tax" : masterType.slice(0, -1);
}

function notFound(): never { throw new ApiError(404, "NOT_FOUND", "The requested knowledge resource was not found."); }
function archived(): never { throw new ApiError(409, "RESOURCE_ARCHIVED", "Archived knowledge resources are immutable."); }
function versionConflict(): never { throw new ApiError(409, "VERSION_CONFLICT", "The knowledge resource changed elsewhere."); }
function duplicateIdentity(): never { throw new ApiError(409, "DUPLICATE_IDENTITY", "A non-archived knowledge resource already uses that identity."); }
function referenceConflict(message: string): never { throw new ApiError(409, "ACTIVE_REFERENCE_CONFLICT", message); }
function canonicalPriorityImmutable(): never { throw new ApiError(409, "CANONICAL_PRIORITY_IMMUTABLE", "Canonical Priority identity and availability are system managed."); }
function canonicalTaxPolicyImmutable(): never { throw new ApiError(409, "CANONICAL_TAX_POLICY_IMMUTABLE", "The fixed GST policy is system managed and cannot be changed through generic Tax operations."); }
function basketDeleteBlocked(): never { throw new ApiError(409, "BASKET_DELETE_BLOCKED", "The Basket has permanent-deletion blockers and is archive-only."); }
