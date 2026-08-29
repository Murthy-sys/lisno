import { randomUUID } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import type {
  KnowledgeCompletenessSummary,
  KnowledgeItemListItem,
  KnowledgeQuantitySlab,
  KnowledgeRevision,
  KnowledgeSectionEnvelope
} from "../contracts/ai-estimator-knowledge.js";
import {
  deriveTaxAmounts,
  KnowledgeCalculationError,
  parseScaledDecimal
} from "../domain/ai-estimator-knowledge-calculation.js";
import {
  createKnowledgeRevisionDigest,
  deriveKnowledgeCompleteness
} from "../domain/ai-estimator-knowledge-completeness.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_QUANTITY_GAP_BEHAVIORS,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  createKnowledgePriceScopeKey,
  normalizeKnowledgeIdentity,
  type KnowledgeQuantityGapBehavior,
  type KnowledgeSectionApplicability,
  type KnowledgeSectionKey,
  type KnowledgeTaxTreatment
} from "../domain/ai-estimator-knowledge.js";
import {
  assertValidKnowledgeSectionPayload,
  findOverlappingEffectiveWindows,
  KnowledgeValidationError,
  validateAcyclicGraph,
  validateQuantitySlabs,
  type KnowledgeCompletenessSectionInput,
  type KnowledgeValidationIssue
} from "../domain/ai-estimator-knowledge-validation.js";
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
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import {
  aiEstimatorKnowledgeActorGuard,
  type AiEstimatorKnowledgeActorGuard
} from "./ai-estimator-knowledge-actor.js";
import {
  allocateAiEstimatorKnowledgeDisplayOrder,
  createAiEstimatorKnowledgeMainLineDisplayOrderScope,
  observeExplicitAiEstimatorKnowledgeDisplayOrder
} from "./ai-estimator-knowledge-display-order.service.js";
import { systemClock, type Clock } from "./workflow.js";

type Row = Record<string, unknown>;

export interface KnowledgePaginationInput {
  readonly limit: number;
  readonly offset: number;
}

export interface KnowledgePage<T> {
  readonly items: T[];
  readonly total: number;
}

export interface KnowledgeMainLineInput {
  readonly name: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
}

export interface KnowledgeMainLineUpdateInput extends Partial<KnowledgeMainLineInput> {
  readonly expectedVersion: number;
}

export interface KnowledgeExpectedVersionInput {
  readonly expectedVersion: number;
  readonly reason?: string;
}

export interface KnowledgeSectionUpdateInput {
  readonly expectedVersion: number;
  readonly expectedAggregateVersion?: number;
  readonly applicability?: KnowledgeSectionApplicability;
  readonly payload: Row;
}

export interface KnowledgeItemFilters {
  readonly search?: string;
  readonly basketId?: string;
  readonly status?: string;
  readonly priorityId?: string;
  readonly modeId?: string;
  readonly surfaceId?: string;
  readonly uomId?: string;
  readonly vendorId?: string;
}

export interface AiEstimatorKnowledgeItemDetail extends KnowledgeItemListItem {
  readonly activeRevision: KnowledgeRevision | null;
  readonly draftRevision: KnowledgeRevision | null;
  readonly blockers: KnowledgeCompletenessSummary["blockers"];
  readonly warnings: KnowledgeCompletenessSummary["warnings"];
}

export interface AiEstimatorKnowledgeItemService {
  listMainLines(
    actor: PublicUser,
    basketId: string,
    filters: { search?: string; includeArchived?: boolean },
    pagination: KnowledgePaginationInput
  ): Promise<KnowledgePage<Row>>;
  createMainLine(
    actor: PublicUser,
    basketId: string,
    input: KnowledgeMainLineInput
  ): Promise<AiEstimatorKnowledgeItemDetail>;
  updateMainLine(
    actor: PublicUser,
    mainLineId: string,
    input: KnowledgeMainLineUpdateInput
  ): Promise<AiEstimatorKnowledgeItemDetail>;
  archiveMainLine(
    actor: PublicUser,
    mainLineId: string,
    input: KnowledgeExpectedVersionInput
  ): Promise<AiEstimatorKnowledgeItemDetail>;
  listItems(
    actor: PublicUser,
    filters: KnowledgeItemFilters,
    pagination: KnowledgePaginationInput
  ): Promise<KnowledgePage<KnowledgeItemListItem>>;
  getItem(actor: PublicUser, mainLineId: string): Promise<AiEstimatorKnowledgeItemDetail>;
  history(
    actor: PublicUser,
    mainLineId: string,
    pagination: KnowledgePaginationInput
  ): Promise<KnowledgePage<KnowledgeRevision>>;
  createRevision(
    actor: PublicUser,
    mainLineId: string,
    input: KnowledgeExpectedVersionInput
  ): Promise<AiEstimatorKnowledgeItemDetail>;
  getSection(
    actor: PublicUser,
    mainLineId: string,
    revisionId: string,
    sectionKey: KnowledgeSectionKey
  ): Promise<KnowledgeSectionEnvelope<Row>>;
  updateSection(
    actor: PublicUser,
    mainLineId: string,
    revisionId: string,
    sectionKey: KnowledgeSectionKey,
    input: KnowledgeSectionUpdateInput
  ): Promise<KnowledgeSectionEnvelope<Row>>;
  activate(
    actor: PublicUser,
    mainLineId: string,
    revisionId: string,
    input: KnowledgeExpectedVersionInput
  ): Promise<AiEstimatorKnowledgeItemDetail>;
  deactivate(
    actor: PublicUser,
    mainLineId: string,
    input: KnowledgeExpectedVersionInput
  ): Promise<AiEstimatorKnowledgeItemDetail>;
  duplicate(
    actor: PublicUser,
    mainLineId: string,
    input: KnowledgeExpectedVersionInput & { name?: string }
  ): Promise<AiEstimatorKnowledgeItemDetail>;
}

export interface AiEstimatorKnowledgeItemServiceDependencies {
  readonly audit: Pick<AuditService, "appendInMongoTransaction">;
  readonly actorGuard?: AiEstimatorKnowledgeActorGuard;
  readonly now?: Clock;
  readonly uuid?: () => string;
}

export function createAiEstimatorKnowledgeItemService(
  dependencies: AiEstimatorKnowledgeItemServiceDependencies
): AiEstimatorKnowledgeItemService {
  const actorGuard = dependencies.actorGuard ?? aiEstimatorKnowledgeActorGuard;
  const now = dependencies.now ?? systemClock;
  const uuid = dependencies.uuid ?? randomUUID;

  return {
    async listMainLines(actor, basketId, filters, pagination) {
      await actorGuard.requireReadActor(actor);
      const filter: Row = { basketId };
      if (!filters.includeArchived) filter.status = { $ne: "archived" };
      if (filters.search) {
        filter.$or = [
          { name: { $regex: escapeRegex(filters.search), $options: "i" } },
          { description: { $regex: escapeRegex(filters.search), $options: "i" } }
        ];
      }
      const [documents, total] = await Promise.all([
        AiEstimatorKnowledgeMainLineModel.find(filter)
          .sort({ displayOrder: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        AiEstimatorKnowledgeMainLineModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(publicMainLine), total };
    },

    async createMainLine(actor, basketId, input) {
      const mainLineId = knowledgeId("main-line", uuid());
      await mongoose.connection.transaction(async (session) => {
        const storedActor = await actorGuard.requireMutationActor(actor, session);
        const basket = await AiEstimatorKnowledgeBasketModel.findOne({
          _id: basketId,
          status: { $ne: "archived" }
        })
          .session(session)
          .lean()
          .exec();
        if (!basket) notFound();
        const occurredAt = now();
        const revisionId = knowledgeId("revision", uuid());
        const completeness = emptyCompleteness(mainLineId);
        const displayOrderTarget = {
          scope: createAiEstimatorKnowledgeMainLineDisplayOrderScope(basketId),
          resourceModel: AiEstimatorKnowledgeMainLineModel,
          resourceFilter: { basketId },
          session
        };
        const displayOrder = input.displayOrder === undefined
          ? await allocateAiEstimatorKnowledgeDisplayOrder(displayOrderTarget)
          : input.displayOrder;
        if (input.displayOrder !== undefined) {
          await observeExplicitAiEstimatorKnowledgeDisplayOrder({
            ...displayOrderTarget,
            displayOrder: input.displayOrder
          });
        }
        await AiEstimatorKnowledgeMainLineModel.create(
          [{
            _id: mainLineId,
            basketId,
            name: input.name,
            nameNormalized: normalizeKnowledgeIdentity(input.name),
            description: input.description ?? null,
            displayOrder,
            status: "draft",
            activeRevisionId: null,
            draftRevisionId: revisionId,
            version: 1,
            createdById: storedActor.id,
            updatedById: storedActor.id,
            createdAt: occurredAt,
            updatedAt: occurredAt
          }],
          { session }
        );
        await AiEstimatorKnowledgeRevisionModel.create(
          [{
            _id: revisionId,
            mainLineId,
            revisionNumber: 1,
            status: "draft",
            sourceRevisionId: null,
            contentDigest: null,
            completeness,
            version: 1,
            createdById: storedActor.id,
            updatedById: storedActor.id,
            createdAt: occurredAt,
            updatedAt: occurredAt
          }],
          { session }
        );
        await AiEstimatorKnowledgeSectionModel.insertMany(
          AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => ({
            _id: knowledgeId(`section-${sectionKey}`, uuid()),
            mainLineId,
            revisionId,
            sectionKey,
            applicability: "not_configured",
            payload: {},
            version: 1,
            createdById: storedActor.id,
            updatedById: storedActor.id,
            createdAt: occurredAt,
            updatedAt: occurredAt
          })),
          { session }
        );
        await dependencies.audit.appendInMongoTransaction({
          actorId: storedActor.id,
          action: "ai_estimator_knowledge_main_line_created",
          entityType: "ai_estimator_knowledge_main_line",
          entityId: mainLineId,
          occurredAt: occurredAt.toISOString(),
          newValues: { basketId, revisionId, displayOrder, version: 1 }
        }, session);
      });
      return getItemAfterMutation(actor, mainLineId, actorGuard);
    },

    async updateMainLine(actor, mainLineId, input) {
      await mongoose.connection.transaction(async (session) => {
        const storedActor = await actorGuard.requireMutationActor(actor, session);
        const current = asRow(
          await AiEstimatorKnowledgeMainLineModel.findById(mainLineId)
            .session(session)
            .lean()
            .exec()
        );
        if (!current || current.status === "archived") notFound();
        if (requiredInteger(current.version) !== input.expectedVersion) versionConflict();
        const occurredAt = now();
        const set: Row = {
          updatedById: storedActor.id,
          updatedAt: occurredAt
        };
        if (input.name !== undefined) {
          set.name = input.name;
          set.nameNormalized = normalizeKnowledgeIdentity(input.name);
        }
        if (input.description !== undefined) set.description = input.description;
        if (input.displayOrder !== undefined) {
          const basketId = requiredString(current.basketId);
          await observeExplicitAiEstimatorKnowledgeDisplayOrder({
            scope: createAiEstimatorKnowledgeMainLineDisplayOrderScope(basketId),
            resourceModel: AiEstimatorKnowledgeMainLineModel,
            resourceFilter: { basketId },
            session,
            displayOrder: input.displayOrder
          });
          set.displayOrder = input.displayOrder;
        }
        const updated = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate(
          { _id: mainLineId, version: input.expectedVersion, status: { $ne: "archived" } },
          { $set: set, $inc: { version: 1 } },
          { new: true, runValidators: true, session }
        ).lean().exec();
        if (!updated) versionConflict();
        await dependencies.audit.appendInMongoTransaction({
          actorId: storedActor.id,
          action: "ai_estimator_knowledge_main_line_updated",
          entityType: "ai_estimator_knowledge_main_line",
          entityId: mainLineId,
          occurredAt: occurredAt.toISOString(),
          oldValues: {
            version: input.expectedVersion,
            ...(input.displayOrder === undefined
              ? {}
              : { displayOrder: requiredInteger(current.displayOrder) })
          },
          newValues: {
            version: input.expectedVersion + 1,
            ...(input.displayOrder === undefined
              ? {}
              : { displayOrder: input.displayOrder })
          }
        }, session);
      });
      return getItemAfterMutation(actor, mainLineId, actorGuard);
    },

    async archiveMainLine(actor, mainLineId, input) {
      await mongoose.connection.transaction(async (session) => {
        const storedActor = await actorGuard.requireMutationActor(actor, session);
        const current = asRow(
          await AiEstimatorKnowledgeMainLineModel.findById(mainLineId)
            .session(session)
            .lean()
            .exec()
        );
        if (!current) notFound();
        if (current.status === "active") {
          throw new ApiError(409, "ACTIVE_ITEM", "Deactivate the estimation item before archiving it.");
        }
        if (requiredInteger(current.version) !== input.expectedVersion) versionConflict();
        if (await hasInboundReference(mainLineId, session)) {
          throw new ApiError(409, "ACTIVE_REFERENCE", "Active knowledge still references this item.");
        }
        const occurredAt = now();
        const updated = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate(
          { _id: mainLineId, version: input.expectedVersion, status: { $ne: "archived" } },
          {
            $set: {
              status: "archived",
              archivedAt: occurredAt,
              archivedById: storedActor.id,
              updatedById: storedActor.id,
              updatedAt: occurredAt
            },
            $inc: { version: 1 }
          },
          { new: true, runValidators: true, session }
        ).lean().exec();
        if (!updated) versionConflict();
        await dependencies.audit.appendInMongoTransaction({
          actorId: storedActor.id,
          action: "ai_estimator_knowledge_main_line_archived",
          entityType: "ai_estimator_knowledge_main_line",
          entityId: mainLineId,
          occurredAt: occurredAt.toISOString(),
          oldValues: { status: current.status, version: input.expectedVersion },
          newValues: { status: "archived", version: input.expectedVersion + 1 },
          reason: input.reason ?? null
        }, session);
      });
      return getItemAfterMutation(actor, mainLineId, actorGuard, true);
    },

    async listItems(actor, filters, pagination) {
      await actorGuard.requireReadActor(actor);
      const filter: Row = {};
      if (filters.basketId) filter.basketId = filters.basketId;
      if (filters.status) filter.status = filters.status;
      else filter.status = { $ne: "archived" };
      if (filters.search) {
        filter.$or = [
          { name: { $regex: escapeRegex(filters.search), $options: "i" } },
          { description: { $regex: escapeRegex(filters.search), $options: "i" } }
        ];
      }
      const hasJoinedFilters = Boolean(
        filters.priorityId || filters.modeId || filters.surfaceId || filters.uomId || filters.vendorId
      );
      if (hasJoinedFilters) {
        const documents = await AiEstimatorKnowledgeMainLineModel.find(filter)
          .sort({ updatedAt: -1, _id: 1 })
          .lean()
          .exec();
        const summaries = await Promise.all(
          documents.map((document) => buildItemSummary(asRow(document)!))
        );
        const filtered = summaries.filter((item) => itemMatches(item, filters));
        return {
          items: filtered.slice(pagination.offset, pagination.offset + pagination.limit),
          total: filtered.length
        };
      }
      const [documents, total] = await Promise.all([
        AiEstimatorKnowledgeMainLineModel.find(filter)
          .sort({ updatedAt: -1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        AiEstimatorKnowledgeMainLineModel.countDocuments(filter).exec()
      ]);
      return {
        items: await Promise.all(documents.map((document) => buildItemSummary(asRow(document)!))),
        total
      };
    },

    async getItem(actor, mainLineId) {
      await actorGuard.requireReadActor(actor);
      return loadItemDetail(mainLineId);
    },

    async history(actor, mainLineId, pagination) {
      await actorGuard.requireReadActor(actor);
      const [documents, total] = await Promise.all([
        AiEstimatorKnowledgeRevisionModel.find({ mainLineId })
          .sort({ revisionNumber: -1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        AiEstimatorKnowledgeRevisionModel.countDocuments({ mainLineId }).exec()
      ]);
      return { items: documents.map((document) => revisionDto(asRow(document)!)), total };
    },

    async createRevision(actor, mainLineId, input) {
      await mongoose.connection.transaction(async (session) => {
        const storedActor = await actorGuard.requireMutationActor(actor, session);
        const line = asRow(
          await AiEstimatorKnowledgeMainLineModel.findById(mainLineId)
            .session(session)
            .lean()
            .exec()
        );
        if (!line || line.status === "archived") notFound();
        if (requiredInteger(line.version) !== input.expectedVersion) versionConflict();
        if (optionalString(line.draftRevisionId)) {
          throw new ApiError(409, "DRAFT_ALREADY_EXISTS", "Continue editing the existing Draft revision.");
        }
        const sourceRevisionId = optionalString(line.activeRevisionId);
        if (!sourceRevisionId) {
          throw new ApiError(409, "ACTIVE_REVISION_REQUIRED", "No Active revision is available to copy.");
        }
        const latest = asRow(
          await AiEstimatorKnowledgeRevisionModel.findOne({ mainLineId })
            .sort({ revisionNumber: -1, _id: 1 })
            .session(session)
            .lean()
            .exec()
        );
        const occurredAt = now();
        const revisionId = knowledgeId("revision", uuid());
        const revisionNumber = requiredInteger(latest?.revisionNumber) + 1;
        const sourceSectionDocuments = await AiEstimatorKnowledgeSectionModel.find({
          mainLineId,
          revisionId: sourceRevisionId
        }).session(session).lean().exec();
        const sourcePriceDocuments = await AiEstimatorKnowledgePriceVersionModel.find({
          mainLineId,
          revisionId: sourceRevisionId
        }).sort({ priceEntryId: 1, versionNumber: 1, _id: 1 }).session(session).lean().exec();
        const sourceSections = sourceSectionDocuments.map((row) => asRow(row)!);
        const priceReferences = await cloneRevisionPrices({
          sourcePrices: sourcePriceDocuments.map((row) => asRow(row)!),
          targetMainLineId: mainLineId,
          targetRevisionId: revisionId,
          actorId: storedActor.id,
          occurredAt,
          session,
          uuid,
          audit: dependencies.audit,
          reviewRequired: false,
          remapPriceEntryIds: false
        });
        const copiedSections = copyRevisionSections(sourceSections, priceReferences, uuid, false);
        const completeness = completenessForRows(mainLineId, copiedSections);
        await AiEstimatorKnowledgeRevisionModel.create([{
          _id: revisionId,
          mainLineId,
          revisionNumber,
          status: "draft",
          sourceRevisionId,
          contentDigest: null,
          completeness,
          version: 1,
          createdById: storedActor.id,
          updatedById: storedActor.id,
          createdAt: occurredAt,
          updatedAt: occurredAt
        }], { session });
        await AiEstimatorKnowledgeSectionModel.insertMany(
          AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => {
            const source = copiedSections.find((row) => row.sectionKey === sectionKey);
            return {
              _id: knowledgeId(`section-${sectionKey}`, uuid()),
              mainLineId,
              revisionId,
              sectionKey,
              applicability: source?.applicability ?? "not_configured",
              payload: structuredClone(payloadFor(source)),
              version: 1,
              createdById: storedActor.id,
              updatedById: storedActor.id,
              createdAt: occurredAt,
              updatedAt: occurredAt
            };
          }),
          { session }
        );
        const updated = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate(
          { _id: mainLineId, version: input.expectedVersion, draftRevisionId: null },
          {
            $set: { draftRevisionId: revisionId, updatedById: storedActor.id, updatedAt: occurredAt },
            $inc: { version: 1 }
          },
          { new: true, session }
        ).lean().exec();
        if (!updated) versionConflict();
        await dependencies.audit.appendInMongoTransaction({
          actorId: storedActor.id,
          action: "ai_estimator_knowledge_revision_created",
          entityType: "ai_estimator_knowledge_revision",
          entityId: revisionId,
          occurredAt: occurredAt.toISOString(),
          newValues: { mainLineId, sourceRevisionId, revisionNumber, aggregateVersion: input.expectedVersion + 1 }
        }, session);
      });
      return getItemAfterMutation(actor, mainLineId, actorGuard);
    },

    async getSection(actor, mainLineId, revisionId, sectionKey) {
      await actorGuard.requireReadActor(actor);
      const section = asRow(
        await AiEstimatorKnowledgeSectionModel.findOne({
          mainLineId,
          revisionId,
          sectionKey
        }).lean().exec()
      );
      if (!section) notFound();
      return sectionKey === "pricing"
        ? enrichPricingSectionDto(section)
        : sectionDto(section);
    },

    async updateSection(actor, mainLineId, revisionId, sectionKey, input) {
      validateSectionPayloadOrThrow(sectionKey, input.payload);
      await mongoose.connection.transaction(async (session) => {
        const storedActor = await actorGuard.requireMutationActor(actor, session);
        const lineDocument = await AiEstimatorKnowledgeMainLineModel.findById(mainLineId)
          .session(session).lean().exec();
        const revisionDocument = await AiEstimatorKnowledgeRevisionModel.findOne({ _id: revisionId, mainLineId })
          .session(session).lean().exec();
        const sectionDocument = await AiEstimatorKnowledgeSectionModel.findOne({ mainLineId, revisionId, sectionKey })
          .session(session).lean().exec();
        const line = asRow(lineDocument);
        const revision = asRow(revisionDocument);
        const section = asRow(sectionDocument);
        if (!line || !revision || !section) notFound();
        if (revision.status !== "draft" || line.draftRevisionId !== revisionId) immutableHistory();
        if (requiredInteger(section.version) !== input.expectedVersion) versionConflict();
        const expectedAggregateVersion = input.expectedAggregateVersion ?? requiredInteger(line.version);
        if (requiredInteger(line.version) !== expectedAggregateVersion) versionConflict();

        const occurredAt = now();
        const persistedPayload = sectionKey === "pricing"
          ? await materializePriceCommands({
              mainLineId,
              revisionId,
              payload: input.payload,
              actorId: storedActor.id,
              occurredAt,
              session,
              uuid,
              audit: dependencies.audit
            })
          : structuredClone(input.payload);
        const updatedSection = await AiEstimatorKnowledgeSectionModel.findOneAndUpdate(
          { _id: section._id, version: input.expectedVersion, revisionId },
          {
            $set: {
              applicability: input.applicability ?? "configured",
              payload: persistedPayload,
              updatedById: storedActor.id,
              updatedAt: occurredAt
            },
            $inc: { version: 1 }
          },
          { new: true, runValidators: true, session }
        ).lean().exec();
        if (!updatedSection) versionConflict();
        const updatedLine = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate(
          { _id: mainLineId, version: expectedAggregateVersion, draftRevisionId: revisionId },
          { $set: { updatedById: storedActor.id, updatedAt: occurredAt }, $inc: { version: 1 } },
          { new: true, session }
        ).lean().exec();
        if (!updatedLine) versionConflict();

        const rows = (await AiEstimatorKnowledgeSectionModel.find({ mainLineId, revisionId })
          .session(session).lean().exec()).map((row) => asRow(row)!);
        await validateRevisionRelationships(mainLineId, rows, session);
        const completeness = completenessForRows(mainLineId, rows);
        await AiEstimatorKnowledgeRevisionModel.updateOne(
          { _id: revisionId, status: "draft" },
          {
            $set: { completeness, updatedById: storedActor.id, updatedAt: occurredAt },
            $inc: { version: 1 }
          },
          { session }
        ).exec();
        await dependencies.audit.appendInMongoTransaction({
          actorId: storedActor.id,
          action: "ai_estimator_knowledge_section_updated",
          entityType: "ai_estimator_knowledge_section",
          entityId: requiredString(section._id),
          occurredAt: occurredAt.toISOString(),
          oldValues: { mainLineId, revisionId, sectionKey, sectionVersion: input.expectedVersion, aggregateVersion: expectedAggregateVersion },
          newValues: { sectionVersion: input.expectedVersion + 1, aggregateVersion: expectedAggregateVersion + 1, applicability: input.applicability ?? "configured" }
        }, session);
      });
      return this.getSection(actor, mainLineId, revisionId, sectionKey);
    },

    async activate(actor, mainLineId, revisionId, input) {
      await mongoose.connection.transaction(async (session) => {
        const storedActor = await actorGuard.requireMutationActor(actor, session);
        const lineDocument = await AiEstimatorKnowledgeMainLineModel.findById(mainLineId)
          .session(session).lean().exec();
        const revisionDocument = await AiEstimatorKnowledgeRevisionModel.findOne({ _id: revisionId, mainLineId })
          .session(session).lean().exec();
        const sectionDocuments = await AiEstimatorKnowledgeSectionModel.find({ mainLineId, revisionId })
          .session(session).lean().exec();
        const line = asRow(lineDocument);
        const revision = asRow(revisionDocument);
        if (!line || !revision) notFound();
        if (requiredInteger(line.version) !== input.expectedVersion) versionConflict();
        if (line.draftRevisionId !== revisionId || revision.status !== "draft") immutableHistory();
        const rows = sectionDocuments.map((row) => asRow(row)!);
        await validateRevisionRelationships(mainLineId, rows, session);
        const completeness = completenessForRows(mainLineId, rows);
        const graphIssues = sectionGraphIssues(rows);
        if (graphIssues.length > 0 || completeness.blockers.length > 0) {
          throw new ApiError(422, "KNOWLEDGE_ACTIVATION_BLOCKED", "Required knowledge is incomplete or invalid.", {
            activation: [...completeness.blockers.map((finding) => finding.code), ...graphIssues].join(",")
          });
        }
        const occurredAt = now();
        const activeRevisionId = optionalString(line.activeRevisionId);
        if (activeRevisionId) {
          const superseded = await AiEstimatorKnowledgeRevisionModel.findOneAndUpdate(
            { _id: activeRevisionId, mainLineId, status: "active" },
            {
              $set: {
                status: "superseded",
                supersededAt: occurredAt,
                supersededById: storedActor.id,
                updatedById: storedActor.id,
                updatedAt: occurredAt
              },
              $inc: { version: 1 }
            },
            { new: true, runValidators: true, session }
          ).lean().exec();
          if (!superseded) versionConflict();
        }
        const digest = createKnowledgeRevisionDigest({
          mainLineId,
          revisionNumber: requiredInteger(revision.revisionNumber),
          sections: completenessInputs(rows)
        });
        const activated = await AiEstimatorKnowledgeRevisionModel.findOneAndUpdate(
          { _id: revisionId, mainLineId, status: "draft", version: revision.version },
          {
            $set: {
              status: "active",
              contentDigest: digest,
              completeness,
              activatedAt: occurredAt,
              activatedById: storedActor.id,
              updatedById: storedActor.id,
              updatedAt: occurredAt
            },
            $inc: { version: 1 }
          },
          { new: true, runValidators: true, session }
        ).lean().exec();
        if (!activated) versionConflict();
        const updatedLine = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate(
          { _id: mainLineId, version: input.expectedVersion, draftRevisionId: revisionId },
          {
            $set: {
              status: "active",
              activeRevisionId: revisionId,
              draftRevisionId: null,
              deactivatedAt: null,
              deactivatedById: null,
              updatedById: storedActor.id,
              updatedAt: occurredAt
            },
            $inc: { version: 1 }
          },
          { new: true, runValidators: true, session }
        ).lean().exec();
        if (!updatedLine) versionConflict();
        await dependencies.audit.appendInMongoTransaction({
          actorId: storedActor.id,
          action: "ai_estimator_knowledge_revision_activated",
          entityType: "ai_estimator_knowledge_revision",
          entityId: revisionId,
          occurredAt: occurredAt.toISOString(),
          oldValues: { status: "draft", aggregateVersion: input.expectedVersion, priorActiveRevisionId: activeRevisionId ?? null },
          newValues: { status: "active", aggregateVersion: input.expectedVersion + 1, contentDigest: digest }
        }, session);
      });
      return getItemAfterMutation(actor, mainLineId, actorGuard);
    },

    async deactivate(actor, mainLineId, input) {
      await mongoose.connection.transaction(async (session) => {
        const storedActor = await actorGuard.requireMutationActor(actor, session);
        const occurredAt = now();
        const updated = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate(
          { _id: mainLineId, version: input.expectedVersion, status: "active" },
          {
            $set: {
              status: "inactive",
              deactivatedAt: occurredAt,
              deactivatedById: storedActor.id,
              updatedById: storedActor.id,
              updatedAt: occurredAt
            },
            $inc: { version: 1 }
          },
          { new: true, runValidators: true, session }
        ).lean().exec();
        if (!updated) versionConflict();
        await dependencies.audit.appendInMongoTransaction({
          actorId: storedActor.id,
          action: "ai_estimator_knowledge_main_line_deactivated",
          entityType: "ai_estimator_knowledge_main_line",
          entityId: mainLineId,
          occurredAt: occurredAt.toISOString(),
          oldValues: { status: "active", version: input.expectedVersion },
          newValues: { status: "inactive", version: input.expectedVersion + 1 },
          reason: input.reason ?? null
        }, session);
      });
      return getItemAfterMutation(actor, mainLineId, actorGuard);
    },

    async duplicate(actor, mainLineId, input) {
      const duplicateId = knowledgeId("main-line", uuid());
      await mongoose.connection.transaction(async (session) => {
        const storedActor = await actorGuard.requireMutationActor(actor, session);
        const source = asRow(
          await AiEstimatorKnowledgeMainLineModel.findById(mainLineId)
            .session(session).lean().exec()
        );
        if (!source || source.status === "archived") notFound();
        if (requiredInteger(source.version) !== input.expectedVersion) versionConflict();
        const sourceRevisionId = optionalString(source.draftRevisionId) ?? optionalString(source.activeRevisionId);
        if (!sourceRevisionId) unresolved("Source item has no revision to duplicate.");
        const sourceRevision = asRow(
          await AiEstimatorKnowledgeRevisionModel.findOne({ _id: sourceRevisionId, mainLineId })
            .session(session).lean().exec()
        );
        if (!sourceRevision) notFound();
        const sourceSectionDocuments = await AiEstimatorKnowledgeSectionModel.find({
          mainLineId,
          revisionId: sourceRevisionId
        }).session(session).lean().exec();
        const sourcePriceDocuments = await AiEstimatorKnowledgePriceVersionModel.find({
          mainLineId,
          revisionId: sourceRevisionId
        }).sort({ priceEntryId: 1, versionNumber: 1, _id: 1 })
          .session(session).lean().exec();
        const occurredAt = now();
        const revisionId = knowledgeId("revision", uuid());
        const duplicateName = input.name?.trim() || `${requiredString(source.name)} Copy`;
        const basketId = requiredString(source.basketId);
        const displayOrder = await allocateAiEstimatorKnowledgeDisplayOrder({
          scope: createAiEstimatorKnowledgeMainLineDisplayOrderScope(basketId),
          resourceModel: AiEstimatorKnowledgeMainLineModel,
          resourceFilter: { basketId },
          session
        });
        const priceReferences = await cloneRevisionPrices({
          sourcePrices: sourcePriceDocuments.map((row) => asRow(row)!),
          targetMainLineId: duplicateId,
          targetRevisionId: revisionId,
          actorId: storedActor.id,
          occurredAt,
          session,
          uuid,
          audit: dependencies.audit,
          reviewRequired: true,
          remapPriceEntryIds: true
        });
        const remappedPayloads = copyRevisionSections(
          sourceSectionDocuments.map((row) => asRow(row)!),
          priceReferences,
          uuid,
          true
        );
        const completeness = completenessForRows(duplicateId, remappedPayloads);
        await AiEstimatorKnowledgeMainLineModel.create([{
          _id: duplicateId,
          basketId,
          name: duplicateName,
          nameNormalized: normalizeKnowledgeIdentity(duplicateName),
          description: source.description ?? null,
          displayOrder,
          status: "draft",
          activeRevisionId: null,
          draftRevisionId: revisionId,
          version: 1,
          createdById: storedActor.id,
          updatedById: storedActor.id,
          createdAt: occurredAt,
          updatedAt: occurredAt
        }], { session });
        await AiEstimatorKnowledgeRevisionModel.create([{
          _id: revisionId,
          mainLineId: duplicateId,
          revisionNumber: 1,
          status: "draft",
          sourceRevisionId,
          contentDigest: null,
          completeness,
          version: 1,
          createdById: storedActor.id,
          updatedById: storedActor.id,
          createdAt: occurredAt,
          updatedAt: occurredAt
        }], { session });
        await AiEstimatorKnowledgeSectionModel.insertMany(remappedPayloads.map((sourceSection) => ({
          _id: knowledgeId(`section-${sourceSection.sectionKey}`, uuid()),
          mainLineId: duplicateId,
          revisionId,
          sectionKey: sourceSection.sectionKey,
          applicability: sourceSection.applicability,
          payload: sourceSection.payload,
          version: 1,
          createdById: storedActor.id,
          updatedById: storedActor.id,
          createdAt: occurredAt,
          updatedAt: occurredAt
        })), { session });
        await dependencies.audit.appendInMongoTransaction({
          actorId: storedActor.id,
          action: "ai_estimator_knowledge_main_line_duplicated",
          entityType: "ai_estimator_knowledge_main_line",
          entityId: duplicateId,
          occurredAt: occurredAt.toISOString(),
          newValues: {
            sourceMainLineId: mainLineId,
            sourceRevisionId,
            revisionId,
            basketId,
            displayOrder,
            version: 1
          }
        }, session);
      });
      return getItemAfterMutation(actor, duplicateId, actorGuard);
    }
  };
}

async function materializePriceCommands(input: {
  mainLineId: string;
  revisionId: string;
  payload: Row;
  actorId: string;
  occurredAt: Date;
  session: ClientSession;
  uuid: () => string;
  audit: Pick<AuditService, "appendInMongoTransaction">;
}): Promise<Row> {
  const commands = Array.isArray(input.payload.priceEntries)
    ? input.payload.priceEntries
    : [];
  const references: Row[] = [];
  const specifications = Array.isArray(input.payload.specifications)
    ? input.payload.specifications.map(asRow).filter((row): row is Row => Boolean(row))
    : [];
  const candidatePriceVersionIds = new Set<string>();
  for (const candidate of commands) {
    const command = asRow(candidate);
    if (command?.operation === "reference") {
      candidatePriceVersionIds.add(requiredString(command.priceVersionId));
    }
  }
  for (const candidate of commands) {
    const command = asRow(candidate);
    if (!command) continue;
    const priceEntryId = requiredString(command.priceEntryId);
    if (command.operation === "reference") {
      const priceVersionId = requiredString(command.priceVersionId);
      const referenced = await AiEstimatorKnowledgePriceVersionModel.exists({
        _id: priceVersionId,
        mainLineId: input.mainLineId,
        revisionId: input.revisionId,
        priceEntryId
      }).session(input.session);
      if (!referenced) {
        throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "A referenced price version is unavailable for this revision.");
      }
      references.push({ operation: "reference", priceEntryId, priceVersionId });
      continue;
    }
    if (command.operation !== "append") continue;
    const vendorId = requiredString(command.vendorId);
    const uomId = requiredString(command.uomId);
    const specificationId = optionalString(command.specificationId) ?? null;
    const modeId = optionalString(command.modeId) ?? null;
    const taxRuleId = requiredString(command.taxRuleId);
    const taxVersionId = requiredString(command.taxVersionId);
    if (specificationId && !specifications.some((specification) =>
      optionalString(specification.id) === specificationId || optionalString(specification._id) === specificationId
    )) {
      throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "The price specification is unavailable in this revision.");
    }
    const vendor = await AiEstimatorKnowledgeVendorModel.findOne({ _id: vendorId, status: "active" })
      .session(input.session).lean().exec();
    const uom = await AiEstimatorKnowledgeUomModel.findOne({ _id: uomId, status: "active" })
      .session(input.session).lean().exec();
    const mode = modeId
      ? await AiEstimatorKnowledgeModeModel.findOne({ _id: modeId, status: "active" })
          .session(input.session).lean().exec()
      : null;
    const taxRule = await AiEstimatorKnowledgeTaxRuleModel.findOne({ _id: taxRuleId, status: "active" })
      .session(input.session).lean().exec();
    const taxVersionDocument = await AiEstimatorKnowledgeTaxVersionModel.findOne({
      _id: taxVersionId,
      taxRuleId,
      status: "active"
    }).session(input.session).lean().exec();
    const latest = await AiEstimatorKnowledgePriceVersionModel.findOne({
      revisionId: input.revisionId,
      priceEntryId
    }).sort({ versionNumber: -1, _id: 1 }).session(input.session).lean().exec();
    if (!vendor || !uom || (modeId && !mode) || !taxRule || !taxVersionDocument) {
      throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "An active price reference is unavailable.");
    }
    const taxVersion = asRow(taxVersionDocument)!;
    const treatment = requiredString(command.treatment) as KnowledgeTaxTreatment;
    if (treatment !== taxVersion.treatment) {
      throw new ApiError(409, "KNOWLEDGE_TAX_MISMATCH", "Price tax treatment does not match its immutable tax version.");
    }
    const effectiveFrom = validDate(command.effectiveFrom, "effectiveFrom");
    const effectiveTo = command.effectiveTo == null ? null : validDate(command.effectiveTo, "effectiveTo");
    if (effectiveTo && effectiveFrom >= effectiveTo) invalid("effectiveTo", "Effective end must be later than start.");
    const taxEffectiveFrom = requiredDate(taxVersion.effectiveFrom);
    const taxEffectiveTo = optionalDate(taxVersion.effectiveTo);
    if (
      effectiveFrom < taxEffectiveFrom ||
      (taxEffectiveTo !== null && (effectiveTo === null || effectiveTo > taxEffectiveTo))
    ) {
      throw new ApiError(
        409,
        "KNOWLEDGE_TAX_WINDOW_MISMATCH",
        "The immutable tax version must cover the complete price effective window."
      );
    }
    const scopeKey = createKnowledgePriceScopeKey({ vendorId, uomId, specificationId, modeId });
    if (command.status === "active") {
      const existingWindows = (await AiEstimatorKnowledgePriceVersionModel.find({
        _id: { $in: [...candidatePriceVersionIds] },
        revisionId: input.revisionId,
        scopeKey,
        status: "active"
      }).session(input.session).lean().exec()).map((row) => asRow(row)!);
      if (findOverlappingEffectiveWindows([
        ...existingWindows.map((row) => ({
          id: requiredString(row._id),
          effectiveFrom: requiredDate(row.effectiveFrom),
          effectiveTo: optionalDate(row.effectiveTo)
        })),
        { id: priceEntryId, effectiveFrom, effectiveTo }
      ]).length > 0) {
        throw new ApiError(409, "EFFECTIVE_WINDOW_OVERLAP", "Effective price windows cannot overlap.");
      }
    }
    let amounts;
    try {
      amounts = deriveTaxAmounts({
        inputAmountPaise: requiredInteger(command.inputAmountPaise),
        rateBps: requiredInteger(taxVersion.rateBps),
        treatment
      });
    } catch (error) {
      if (error instanceof KnowledgeCalculationError) invalid("inputAmountPaise", error.message);
      throw error;
    }
    const id = knowledgeId("price-version", input.uuid());
    const versionNumber = latest ? requiredInteger(asRow(latest)!.versionNumber) + 1 : 1;
    await AiEstimatorKnowledgePriceVersionModel.create([{
      _id: id,
      mainLineId: input.mainLineId,
      revisionId: input.revisionId,
      priceEntryId,
      scopeKey,
      versionNumber,
      vendorId,
      uomId,
      specificationId,
      modeId,
      taxRuleId,
      taxVersionId,
      treatment,
      inputAmountPaise: amounts.inputAmountPaise,
      baseAmountPaise: amounts.baseAmountPaise,
      taxAmountPaise: amounts.taxAmountPaise,
      totalAmountPaise: amounts.totalAmountPaise,
      effectiveFrom,
      effectiveTo,
      status: requiredString(command.status),
      reviewRequired: false,
      version: 1,
      createdById: input.actorId,
      updatedById: input.actorId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt
    }], { session: input.session });
    candidatePriceVersionIds.add(id);
    await input.audit.appendInMongoTransaction({
      actorId: input.actorId,
      action: "ai_estimator_knowledge_price_version_created",
      entityType: "ai_estimator_knowledge_price_version",
      entityId: id,
      occurredAt: input.occurredAt.toISOString(),
      newValues: {
        mainLineId: input.mainLineId,
        revisionId: input.revisionId,
        priceEntryId,
        versionNumber,
        inputAmountPaise: amounts.inputAmountPaise,
        baseAmountPaise: amounts.baseAmountPaise,
        taxAmountPaise: amounts.taxAmountPaise,
        totalAmountPaise: amounts.totalAmountPaise
      }
    }, input.session);
    references.push({ operation: "reference", priceEntryId, priceVersionId: id });
  }
  return { ...structuredClone(input.payload), priceEntries: references };
}

async function loadItemDetail(mainLineId: string, includeArchived = false): Promise<AiEstimatorKnowledgeItemDetail> {
  const line = asRow(
    await AiEstimatorKnowledgeMainLineModel.findOne({
      _id: mainLineId,
      ...(includeArchived ? {} : { status: { $ne: "archived" } })
    }).lean().exec()
  );
  if (!line) notFound();
  const summary = await buildItemSummary(line);
  const [activeRevision, draftRevision] = await Promise.all([
    optionalString(line.activeRevisionId) ? loadRevision(requiredString(line.activeRevisionId)) : null,
    optionalString(line.draftRevisionId) ? loadRevision(requiredString(line.draftRevisionId)) : null
  ]);
  const current = draftRevision ?? activeRevision;
  return {
    ...summary,
    activeRevision,
    draftRevision,
    blockers: current?.completeness.blockers ?? [],
    warnings: current?.completeness.warnings ?? []
  };
}

async function getItemAfterMutation(
  actor: PublicUser,
  mainLineId: string,
  guard: AiEstimatorKnowledgeActorGuard,
  includeArchived = false
): Promise<AiEstimatorKnowledgeItemDetail> {
  await guard.requireReadActor(actor);
  return loadItemDetail(mainLineId, includeArchived);
}

async function buildItemSummary(line: Row): Promise<KnowledgeItemListItem> {
  const revisionId = optionalString(line.draftRevisionId) ?? optionalString(line.activeRevisionId);
  const [basketDocument, revisionDocument, overviewDocument, pricingDocument] = await Promise.all([
    AiEstimatorKnowledgeBasketModel.findById(requiredString(line.basketId)).lean().exec(),
    revisionId ? AiEstimatorKnowledgeRevisionModel.findById(revisionId).lean().exec() : null,
    revisionId ? AiEstimatorKnowledgeSectionModel.findOne({ revisionId, sectionKey: "overview" }).lean().exec() : null,
    revisionId ? AiEstimatorKnowledgeSectionModel.findOne({ revisionId, sectionKey: "pricing" }).lean().exec() : null
  ]);
  const retainedPriceVersionIds = referencedPriceVersionIds(payloadFor(asRow(pricingDocument)));
  const priceDocuments = !revisionId || retainedPriceVersionIds.length === 0
    ? []
    : await AiEstimatorKnowledgePriceVersionModel.find({
        _id: { $in: retainedPriceVersionIds },
        revisionId
      }).select({ vendorId: 1 }).lean().exec();
  const basket = asRow(basketDocument);
  if (!basket) unresolved("Knowledge Basket is unavailable.");
  const revision = asRow(revisionDocument);
  const overview = payloadFor(asRow(overviewDocument));
  const completeness = revision ? completenessDto(revision.completeness) : emptyCompleteness(requiredString(line._id));
  return {
    id: requiredString(line._id),
    basketId: requiredString(line.basketId),
    basketName: requiredString(basket.name),
    mainLineId: requiredString(line._id),
    mainLineName: requiredString(line.name),
    description: nullableString(line.description),
    status: requiredString(line.status) as KnowledgeItemListItem["status"],
    activeRevisionId: optionalString(line.activeRevisionId) ?? null,
    draftRevisionId: optionalString(line.draftRevisionId) ?? null,
    revisionNumber: revision ? requiredInteger(revision.revisionNumber) : null,
    uomId: optionalString(overview.uomId) ?? null,
    priorityId: optionalString(overview.priorityId) ?? null,
    modeIds: stringArray(overview.modeIds),
    surfaceIds: stringArray(overview.surfaceIds),
    vendorIds: [...new Set(priceDocuments.map((row) => optionalString(asRow(row)?.vendorId)).filter((id): id is string => Boolean(id)))],
    completeness,
    allowedActions: allowedActions(requiredString(line.status), Boolean(line.draftRevisionId)),
    version: requiredInteger(line.version),
    createdById: requiredString(line.createdById),
    updatedById: requiredString(line.updatedById),
    createdAt: requiredDate(line.createdAt).toISOString(),
    updatedAt: requiredDate(line.updatedAt).toISOString()
  };
}

async function loadRevision(revisionId: string): Promise<KnowledgeRevision> {
  const revision = asRow(await AiEstimatorKnowledgeRevisionModel.findById(revisionId).lean().exec());
  if (!revision) notFound();
  return revisionDto(revision);
}

function revisionDto(row: Row): KnowledgeRevision {
  return {
    id: requiredString(row._id),
    mainLineId: requiredString(row.mainLineId),
    revisionNumber: requiredInteger(row.revisionNumber),
    status: requiredString(row.status) as KnowledgeRevision["status"],
    sourceRevisionId: optionalString(row.sourceRevisionId) ?? null,
    contentDigest: optionalString(row.contentDigest) ?? null,
    completeness: completenessDto(row.completeness),
    version: requiredInteger(row.version),
    createdById: requiredString(row.createdById),
    updatedById: requiredString(row.updatedById),
    createdAt: requiredDate(row.createdAt).toISOString(),
    updatedAt: requiredDate(row.updatedAt).toISOString(),
    activatedAt: optionalDate(row.activatedAt)?.toISOString() ?? null,
    activatedById: optionalString(row.activatedById) ?? null,
    supersededAt: optionalDate(row.supersededAt)?.toISOString() ?? null,
    supersededById: optionalString(row.supersededById) ?? null
  };
}

function sectionDto(row: Row): KnowledgeSectionEnvelope<Row> {
  return {
    id: requiredString(row._id),
    mainLineId: requiredString(row.mainLineId),
    revisionId: requiredString(row.revisionId),
    sectionKey: requiredString(row.sectionKey) as KnowledgeSectionKey,
    applicability: requiredString(row.applicability) as KnowledgeSectionApplicability,
    payload: structuredClone(payloadFor(row)),
    version: requiredInteger(row.version),
    createdById: requiredString(row.createdById),
    updatedById: requiredString(row.updatedById),
    createdAt: requiredDate(row.createdAt).toISOString(),
    updatedAt: requiredDate(row.updatedAt).toISOString()
  };
}

async function enrichPricingSectionDto(row: Row): Promise<KnowledgeSectionEnvelope<Row>> {
  const dto = sectionDto(row);
  const priceVersionIds = referencedPriceVersionIds(dto.payload);
  const documents = priceVersionIds.length === 0
    ? []
    : await AiEstimatorKnowledgePriceVersionModel.find({
        _id: { $in: priceVersionIds },
        mainLineId: dto.mainLineId,
        revisionId: dto.revisionId
      }).lean().exec();
  const byId = new Map(documents.map((document) => {
    const price = asRow(document)!;
    return [requiredString(price._id), publicPriceVersion(price)] as const;
  }));
  const priceEntries = Array.isArray(dto.payload.priceEntries)
    ? dto.payload.priceEntries.map((entry) => {
        const reference = asRow(entry);
        const priceVersionId = optionalString(reference?.priceVersionId);
        return reference && priceVersionId && byId.has(priceVersionId)
          ? { ...reference, priceVersion: byId.get(priceVersionId) }
          : entry;
      })
    : dto.payload.priceEntries;
  return {
    ...dto,
    payload: { ...dto.payload, priceEntries }
  };
}

function publicPriceVersion(row: Row): Row {
  return {
    id: requiredString(row._id),
    priceEntryId: requiredString(row.priceEntryId),
    versionNumber: requiredInteger(row.versionNumber),
    vendorId: requiredString(row.vendorId),
    uomId: requiredString(row.uomId),
    specificationId: optionalString(row.specificationId) ?? null,
    modeId: optionalString(row.modeId) ?? null,
    taxRuleId: requiredString(row.taxRuleId),
    taxVersionId: requiredString(row.taxVersionId),
    inputAmountPaise: requiredInteger(row.inputAmountPaise),
    baseAmountPaise: requiredInteger(row.baseAmountPaise),
    taxAmountPaise: requiredInteger(row.taxAmountPaise),
    totalAmountPaise: requiredInteger(row.totalAmountPaise),
    treatment: requiredString(row.treatment),
    effectiveFrom: requiredDate(row.effectiveFrom).toISOString(),
    effectiveTo: optionalDate(row.effectiveTo)?.toISOString() ?? null,
    status: requiredString(row.status),
    reviewRequired: row.reviewRequired === true
  };
}

function referencedPriceVersionIds(pricing: Row): string[] {
  if (!Array.isArray(pricing.priceEntries)) return [];
  return pricing.priceEntries.flatMap((entry) => {
    const reference = asRow(entry);
    return reference?.operation === "reference" && typeof reference.priceVersionId === "string"
      ? [reference.priceVersionId]
      : [];
  });
}

function completenessForRows(mainLineId: string, rows: Row[]): KnowledgeCompletenessSummary {
  const overview = payloadFor(rows.find((row) => row.sectionKey === "overview"));
  return deriveKnowledgeCompleteness({
    identity: {
      basketId: "resolved-by-main-line",
      mainLineId,
      uomId: optionalString(overview.uomId) ?? null
    },
    sections: completenessInputs(rows)
  });
}

function completenessInputs(rows: Row[]): KnowledgeCompletenessSectionInput[] {
  return rows.map((row) => ({
    sectionKey: requiredString(row.sectionKey) as KnowledgeSectionKey,
    applicability: requiredString(row.applicability) as KnowledgeSectionApplicability,
    payload: payloadFor(row)
  }));
}

function emptyCompleteness(mainLineId: string): KnowledgeCompletenessSummary {
  return deriveKnowledgeCompleteness({
    identity: { basketId: "resolved-by-main-line", mainLineId, uomId: null },
    sections: AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => ({
      sectionKey,
      applicability: "not_configured",
      payload: {}
    }))
  });
}

function completenessDto(value: unknown): KnowledgeCompletenessSummary {
  const row = asRow(value);
  if (!row || !Array.isArray(row.sections) || !Array.isArray(row.blockers) || !Array.isArray(row.warnings)) {
    unresolved("Knowledge completeness is unavailable.");
  }
  return structuredClone(row) as unknown as KnowledgeCompletenessSummary;
}

function sectionGraphIssues(rows: Row[]): string[] {
  const issues: string[] = [];
  const execution = payloadFor(rows.find((row) => row.sectionKey === "execution"));
  const steps = activeStructuredRows(execution.steps);
  const activeStepIds = new Set(steps.map((step) => requiredString(step.id)));
  const nodeIds = steps.map((step) => requiredString(step.id));
  const edges = steps.flatMap((step) => stringArray(step.dependencyStepIds)
    .filter((dependency) => activeStepIds.has(dependency))
    .map((dependency) => ({
      fromId: dependency,
      toId: requiredString(step.id)
    })));
  issues.push(...validateAcyclicGraph(nodeIds, edges).map((issue) => issue.code));
  return issues;
}

interface KnowledgeItemEdge {
  readonly fromId: string;
  readonly toId: string;
}

async function validateRevisionRelationships(
  mainLineId: string,
  rows: Row[],
  session: ClientSession
): Promise<void> {
  validateStoredRevisionPayloads(rows);
  await validateRevisionMasterReferences(rows, session);
  await validateRevisionSectionRules(rows, session);
  await validateScopeBasketReferences(rows, session);
  const stepIssues = sectionGraphIssues(rows);
  if (stepIssues.length > 0) {
    throw new ApiError(409, "DEPENDENCY_CYCLE", "Execution dependencies are invalid.", {
      execution: stepIssues.join(",")
    });
  }

  const candidateRelations = itemRelationsForRows(mainLineId, rows);
  const targetIds = [...new Set(candidateRelations.map((relation) => relation.targetMainLineId))];
  if (targetIds.includes(mainLineId)) {
    throw new ApiError(409, "DEPENDENCY_CYCLE", "An estimation item cannot reference itself.");
  }
  if (targetIds.length > 0) {
    const targets = await AiEstimatorKnowledgeMainLineModel.find({
      _id: { $in: targetIds },
      status: "active",
      activeRevisionId: { $ne: null }
    }).select({ _id: 1, basketId: 1 }).session(session).lean().exec();
    const targetById = new Map(targets.map((target) => {
      const row = asRow(target)!;
      return [requiredString(row._id), row] as const;
    }));
    for (const relation of candidateRelations) {
      const target = targetById.get(relation.targetMainLineId);
      if (!target || (
        relation.targetBasketId && relation.targetBasketId !== requiredString(target.basketId)
      )) {
        throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "A relationship target is unavailable for new use.");
      }
    }
  }

  const candidateEdges = candidateRelations
    .filter((relation) => relation.dependency)
    .map((relation) => ({ fromId: mainLineId, toId: relation.targetMainLineId }));
  const activeLines = await AiEstimatorKnowledgeMainLineModel.find({
    status: "active",
    activeRevisionId: { $ne: null },
    _id: { $ne: mainLineId }
  }).select({ _id: 1, activeRevisionId: 1 }).session(session).lean().exec();
  const activeRevisionIds = activeLines
    .map((line) => optionalString(asRow(line)?.activeRevisionId))
    .filter((id): id is string => Boolean(id));
  const activeRelationshipSections = activeRevisionIds.length === 0
    ? []
    : await AiEstimatorKnowledgeSectionModel.find({
        revisionId: { $in: activeRevisionIds },
        sectionKey: { $in: ["recommendations", "advanced"] },
        applicability: "configured"
      }).select({ mainLineId: 1, sectionKey: 1, payload: 1 }).session(session).lean().exec();
  const activeEdges = activeRelationshipSections.flatMap((section) => {
    const row = asRow(section)!;
    return itemRelationsForRows(requiredString(row.mainLineId), [row])
      .filter((relation) => relation.dependency)
      .map((relation) => ({ fromId: requiredString(row.mainLineId), toId: relation.targetMainLineId }));
  });
  const edges: KnowledgeItemEdge[] = [...activeEdges, ...candidateEdges];
  const nodes = [...new Set(edges.flatMap((edge) => [edge.fromId, edge.toId]))];
  const graphIssues = validateAcyclicGraph(nodes, edges);
  if (graphIssues.length > 0) {
    throw new ApiError(409, "DEPENDENCY_CYCLE", "Estimation item dependencies are invalid.", {
      relationships: graphIssues.map((issue) => issue.code).join(",")
    });
  }
}

async function validateRevisionMasterReferences(
  rows: Row[],
  session: ClientSession
): Promise<void> {
  const overview = payloadFor(rows.find((row) => row.sectionKey === "overview"));
  const scope = payloadFor(rows.find((row) => row.sectionKey === "scope"));
  const recommendations = payloadFor(rows.find((row) => row.sectionKey === "recommendations"));
  const advanced = payloadFor(rows.find((row) => row.sectionKey === "advanced"));
  const execution = payloadFor(rows.find((row) => row.sectionKey === "execution"));

  const uomIds = new Set<string>();
  addOptionalId(uomIds, overview.uomId);
  for (const productivity of activeStructuredRows(execution.productivity)) {
    addOptionalId(uomIds, productivity.uomId);
  }

  const priorityIds = new Set<string>();
  addOptionalId(priorityIds, overview.priorityId);
  for (const entry of activeStructuredRows(recommendations.recommendations)) {
    addOptionalId(priorityIds, entry.priorityId);
  }

  const modeIds = new Set<string>([
    ...stringArray(overview.modeIds),
    ...stringArray(scope.modeIds)
  ]);
  for (const entry of activeStructuredRows(advanced.modeOverrides)) {
    addOptionalId(modeIds, entry.modeId);
  }

  const surfaceIds = new Set<string>([
    ...stringArray(overview.surfaceIds),
    ...stringArray(scope.surfaceIds)
  ]);

  if (uomIds.size > 0 && await AiEstimatorKnowledgeUomModel.countDocuments({
    _id: { $in: [...uomIds] },
    status: "active"
  }).session(session).exec() !== uomIds.size) invalidKnowledgeReference("UOM");
  if (priorityIds.size > 0 && await AiEstimatorKnowledgePriorityModel.countDocuments({
    _id: { $in: [...priorityIds] },
    status: "active"
  }).session(session).exec() !== priorityIds.size) invalidKnowledgeReference("priority");
  if (modeIds.size > 0 && await AiEstimatorKnowledgeModeModel.countDocuments({
    _id: { $in: [...modeIds] },
    status: "active"
  }).session(session).exec() !== modeIds.size) invalidKnowledgeReference("mode");
  if (surfaceIds.size > 0 && await AiEstimatorKnowledgeSurfaceModel.countDocuments({
    _id: { $in: [...surfaceIds] },
    status: "active"
  }).session(session).exec() !== surfaceIds.size) invalidKnowledgeReference("surface");
}

async function validateRevisionSectionRules(
  rows: Row[],
  session: ClientSession
): Promise<void> {
  const issues: KnowledgeValidationIssue[] = [];
  const overview = payloadFor(rows.find((row) => row.sectionKey === "overview"));
  const quantityMarginSection = rows.find((row) => row.sectionKey === "quantity-margin");
  const quantityMargin = payloadFor(quantityMarginSection);
  const execution = payloadFor(rows.find((row) => row.sectionKey === "execution"));

  const overviewUomId = optionalString(overview.uomId);

  if (quantityMarginSection?.applicability === "configured") {
    const slabValue = quantityMargin.quantitySlabs;
    if (slabValue !== undefined && !Array.isArray(slabValue)) {
      issues.push(validationIssue(
        "payload.quantitySlabs",
        "INVALID_QUANTITY_SLABS",
        "Quantity slabs must be an array."
      ));
    } else if (Array.isArray(slabValue) && slabValue.length > 0) {
      if (!overviewUomId) {
        invalidKnowledgeReference("Overview UOM");
      }
      const uom = asRow(await AiEstimatorKnowledgeUomModel.findOne({
        _id: overviewUomId,
        status: "active"
      }).select({ decimalScale: 1 }).session(session).lean().exec());
      if (!uom) invalidKnowledgeReference("Overview UOM");
      const decimalScale = requiredInteger(uom.decimalScale);
      const gapBehavior = quantityMargin.gapBehavior;
      if (!AI_ESTIMATOR_KNOWLEDGE_QUANTITY_GAP_BEHAVIORS.includes(
        gapBehavior as KnowledgeQuantityGapBehavior
      )) {
        issues.push(validationIssue(
          "payload.gapBehavior",
          "INVALID_GAP_BEHAVIOR",
          "Quantity slab gap behavior is invalid."
        ));
      } else {
        issues.push(...validateQuantitySlabs({
          slabs: slabValue as KnowledgeQuantitySlab[],
          decimalScale,
          gapBehavior: gapBehavior as KnowledgeQuantityGapBehavior
        }).map((issue) => ({
          ...issue,
          path: issue.path.replace(/^slabs/u, "payload.quantitySlabs")
        })));
      }
    }
  }

  const productivity = activeStructuredRows(execution.productivity);
  const productivityUomIds = [...new Set(productivity
    .map((rule) => optionalString(rule.uomId))
    .filter((id): id is string => Boolean(id)))];
  const productivityUoms = productivityUomIds.length === 0
    ? []
    : await AiEstimatorKnowledgeUomModel.find({
        _id: { $in: productivityUomIds },
        status: "active"
      }).select({ _id: 1, decimalScale: 1 }).session(session).lean().exec();
  const productivityScales = new Map(productivityUoms.map((document) => {
    const row = asRow(document)!;
    return [requiredString(row._id), requiredInteger(row.decimalScale)] as const;
  }));
  for (const [index, candidate] of structuredRows(execution.productivity).entries()) {
    if (candidate.active === false) continue;
    const uomId = optionalString(candidate.uomId);
    const scale = uomId ? productivityScales.get(uomId) : undefined;
    if (scale === undefined || typeof candidate.value !== "string") continue;
    try {
      parseScaledDecimal(candidate.value, scale);
    } catch (error) {
      issues.push(validationIssue(
        `payload.productivity.${index}.value`,
        "INVALID_DECIMAL",
        error instanceof Error ? error.message : "Enter a value matching the referenced UOM precision."
      ));
    }
  }

  if (issues.length > 0) invalidRevisionSectionRules(issues);
}

function validateStoredRevisionPayloads(rows: Row[]): void {
  for (const row of rows) {
    validateSectionPayloadOrThrow(requiredString(row.sectionKey) as KnowledgeSectionKey, payloadFor(row));
  }
}

async function validateScopeBasketReferences(rows: Row[], session: ClientSession): Promise<void> {
  const scope = payloadFor(rows.find((row) => row.sectionKey === "scope"));
  const basketIds = new Set<string>();
  for (const exclusion of activeStructuredRows(scope.exclusions)) {
    addOptionalId(basketIds, exclusion.targetBasketId);
  }
  if (basketIds.size > 0 && await AiEstimatorKnowledgeBasketModel.countDocuments({
    _id: { $in: [...basketIds] },
    status: "active"
  }).session(session).exec() !== basketIds.size) invalidKnowledgeReference("Basket");
}

function structuredRows(value: unknown): Row[] {
  if (value === undefined || value === null) return [];
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.map(asRow).filter((row): row is Row => Boolean(row));
}

function activeStructuredRows(value: unknown): Row[] {
  return structuredRows(value).filter((row) => row.active !== false);
}

function validationIssue(path: string, code: string, message: string): KnowledgeValidationIssue {
  return { path, code, message };
}

function invalidRevisionSectionRules(issues: readonly KnowledgeValidationIssue[]): never {
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    Object.fromEntries(issues.map((issue) => [issue.path, issue.message]))
  );
}

function addOptionalId(target: Set<string>, value: unknown): void {
  const id = optionalString(value);
  if (id) target.add(id);
}

function invalidKnowledgeReference(label: string): never {
  throw new ApiError(
    409,
    "KNOWLEDGE_REFERENCE_INVALID",
    `An active ${label} reference is unavailable.`
  );
}

function itemRelationsForRows(mainLineId: string, rows: Row[]): Array<{
  targetMainLineId: string;
  targetBasketId: string | null;
  dependency: boolean;
}> {
  const relations: Array<{
    targetMainLineId: string;
    targetBasketId: string | null;
    dependency: boolean;
  }> = [];
  for (const row of rows) {
    const payload = payloadFor(row);
    const candidates = row.sectionKey === "recommendations"
      ? payload.recommendations
      : row.sectionKey === "advanced"
        ? payload.dependencies
        : row.sectionKey === "scope"
          ? payload.exclusions
          : null;
    if (!Array.isArray(candidates)) continue;
    for (const candidate of candidates) {
      const relation = asRow(candidate);
      if (relation?.active === false) continue;
      const targetMainLineId = optionalString(relation?.targetMainLineId);
      const targetBasketId = optionalString(relation?.targetBasketId) ?? null;
      if (!targetMainLineId) {
        if (row.sectionKey === "scope" && targetBasketId) continue;
        invalid("payload.targetMainLineId", "Relationship targets require a stable Estimation Item ID.");
      }
      relations.push({
        targetMainLineId,
        targetBasketId,
        dependency: row.sectionKey === "advanced" || relation?.dependency === true
      });
    }
  }
  const keys = new Set<string>();
  for (const relation of relations) {
    const key = `${mainLineId}\u0000${relation.targetMainLineId}\u0000${relation.dependency}`;
    if (keys.has(key)) {
      throw new ApiError(409, "DUPLICATE_REFERENCE", "Relationship targets must be unique.");
    }
    keys.add(key);
  }
  return relations;
}

async function hasInboundReference(mainLineId: string, session: ClientSession): Promise<boolean> {
  const activeLines = await AiEstimatorKnowledgeMainLineModel.find({
    status: "active",
    activeRevisionId: { $ne: null }
  }).select({ activeRevisionId: 1 }).session(session).lean().exec();
  const activeRevisionIds = activeLines
    .map((line) => optionalString(asRow(line)?.activeRevisionId))
    .filter((id): id is string => Boolean(id));
  if (activeRevisionIds.length === 0) return false;
  const sections = await AiEstimatorKnowledgeSectionModel.find({
    revisionId: { $in: activeRevisionIds },
    sectionKey: { $in: ["scope", "recommendations", "advanced"] },
    applicability: "configured"
  }).select({ mainLineId: 1, sectionKey: 1, payload: 1 }).session(session).lean().exec();
  return sections.some((section) => {
    const row = asRow(section)!;
    return itemRelationsForRows(requiredString(row.mainLineId), [row])
      .some((relation) => relation.targetMainLineId === mainLineId);
  });
}

interface CopiedPriceReference {
  readonly priceEntryId: string;
  readonly priceVersionId: string;
}

async function cloneRevisionPrices(input: {
  sourcePrices: Row[];
  targetMainLineId: string;
  targetRevisionId: string;
  actorId: string;
  occurredAt: Date;
  session: ClientSession;
  uuid: () => string;
  audit: Pick<AuditService, "appendInMongoTransaction">;
  reviewRequired: boolean;
  remapPriceEntryIds: boolean;
}): Promise<Map<string, CopiedPriceReference>> {
  const references = new Map<string, CopiedPriceReference>();
  const priceEntryIds = new Map<string, string>();
  for (const source of input.sourcePrices) {
    const sourcePriceVersionId = requiredString(source._id);
    const sourcePriceEntryId = requiredString(source.priceEntryId);
    let targetPriceEntryId = sourcePriceEntryId;
    if (input.remapPriceEntryIds) {
      targetPriceEntryId = priceEntryIds.get(sourcePriceEntryId) ?? knowledgeId("price-entry", input.uuid());
      priceEntryIds.set(sourcePriceEntryId, targetPriceEntryId);
    }
    const targetPriceVersionId = knowledgeId("price-version", input.uuid());
    await AiEstimatorKnowledgePriceVersionModel.create([{
      _id: targetPriceVersionId,
      mainLineId: input.targetMainLineId,
      revisionId: input.targetRevisionId,
      priceEntryId: targetPriceEntryId,
      scopeKey: requiredString(source.scopeKey),
      versionNumber: requiredInteger(source.versionNumber),
      vendorId: requiredString(source.vendorId),
      uomId: requiredString(source.uomId),
      specificationId: optionalString(source.specificationId) ?? null,
      modeId: optionalString(source.modeId) ?? null,
      taxRuleId: requiredString(source.taxRuleId),
      taxVersionId: requiredString(source.taxVersionId),
      currency: requiredString(source.currency),
      treatment: requiredString(source.treatment),
      inputAmountPaise: requiredInteger(source.inputAmountPaise),
      baseAmountPaise: requiredInteger(source.baseAmountPaise),
      taxAmountPaise: requiredInteger(source.taxAmountPaise),
      totalAmountPaise: requiredInteger(source.totalAmountPaise),
      effectiveFrom: requiredDate(source.effectiveFrom),
      effectiveTo: optionalDate(source.effectiveTo),
      status: input.reviewRequired ? "draft" : requiredString(source.status),
      reviewRequired: input.reviewRequired,
      version: 1,
      createdById: input.actorId,
      updatedById: input.actorId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt
    }], { session: input.session });
    references.set(sourcePriceVersionId, {
      priceEntryId: targetPriceEntryId,
      priceVersionId: targetPriceVersionId
    });
    await input.audit.appendInMongoTransaction({
      actorId: input.actorId,
      action: "ai_estimator_knowledge_price_version_created",
      entityType: "ai_estimator_knowledge_price_version",
      entityId: targetPriceVersionId,
      occurredAt: input.occurredAt.toISOString(),
      newValues: {
        mainLineId: input.targetMainLineId,
        revisionId: input.targetRevisionId,
        priceEntryId: targetPriceEntryId,
        versionNumber: requiredInteger(source.versionNumber),
        copiedFromPriceVersionId: sourcePriceVersionId,
        reviewRequired: input.reviewRequired
      }
    }, input.session);
  }
  return references;
}

function copyRevisionSections(
  rows: Row[],
  priceReferences: ReadonlyMap<string, CopiedPriceReference>,
  uuid: () => string,
  remapStepIds: boolean
): Row[] {
  const execution = rows.find((row) => row.sectionKey === "execution");
  const executionPayload = payloadFor(execution);
  const steps = Array.isArray(executionPayload.steps) ? executionPayload.steps : [];
  const stepIds = new Map<string, string>();
  if (remapStepIds) {
    for (const step of steps) {
      const row = asRow(step);
      if (row && optionalString(row.id)) stepIds.set(requiredString(row.id), knowledgeId("step", uuid()));
    }
  }
  return rows.map((row) => {
    const payload = structuredClone(payloadFor(row));
    if (remapStepIds && row.sectionKey === "execution" && Array.isArray(payload.steps)) {
      payload.steps = payload.steps.map((entry) => {
        const step = asRow(entry);
        if (!step) return entry;
        const oldId = requiredString(step.id);
        return {
          ...step,
          id: stepIds.get(oldId) ?? oldId,
          dependencyStepIds: stringArray(step.dependencyStepIds).map((id) => stepIds.get(id) ?? id)
        };
      });
    }
    if (row.sectionKey === "pricing" && Array.isArray(payload.priceEntries)) {
      payload.priceEntries = payload.priceEntries.map((entry) => {
        const reference = asRow(entry);
        const sourcePriceVersionId = requiredString(reference?.priceVersionId);
        const copied = priceReferences.get(sourcePriceVersionId);
        if (!copied) unresolved("A copied price reference is unavailable.");
        return {
          operation: "reference",
          priceEntryId: copied.priceEntryId,
          priceVersionId: copied.priceVersionId
        };
      });
    }
    return {
      sectionKey: requiredString(row.sectionKey),
      applicability: requiredString(row.applicability),
      payload
    };
  });
}

function publicMainLine(value: unknown): Row {
  const row = asRow(value);
  if (!row) unresolved("Knowledge Main Line is corrupt.");
  return {
    id: requiredString(row._id),
    basketId: requiredString(row.basketId),
    name: requiredString(row.name),
    description: nullableString(row.description),
    displayOrder: requiredInteger(row.displayOrder),
    status: requiredString(row.status),
    activeRevisionId: optionalString(row.activeRevisionId) ?? null,
    draftRevisionId: optionalString(row.draftRevisionId) ?? null,
    version: requiredInteger(row.version),
    createdById: requiredString(row.createdById),
    updatedById: requiredString(row.updatedById),
    createdAt: requiredDate(row.createdAt).toISOString(),
    updatedAt: requiredDate(row.updatedAt).toISOString()
  };
}

function itemMatches(item: KnowledgeItemListItem, filters: KnowledgeItemFilters): boolean {
  return (!filters.priorityId || item.priorityId === filters.priorityId) &&
    (!filters.modeId || item.modeIds.includes(filters.modeId)) &&
    (!filters.surfaceId || item.surfaceIds.includes(filters.surfaceId)) &&
    (!filters.uomId || item.uomId === filters.uomId) &&
    (!filters.vendorId || item.vendorIds.includes(filters.vendorId));
}

function allowedActions(status: string, hasDraft: boolean): string[] {
  if (status === "archived") return [];
  if (status === "active") return hasDraft
    ? ["update_section", "review_and_activate", "duplicate", "deactivate"]
    : ["create_revision", "duplicate", "deactivate"];
  if (status === "inactive") return hasDraft
    ? ["update_section", "review_and_activate", "duplicate", "archive"]
    : ["create_revision", "duplicate", "archive"];
  return ["update_section", "review_and_activate", "duplicate", "archive"];
}

function payloadFor(row: Row | null | undefined): Row {
  return asRow(row?.payload) ?? {};
}

function asRow(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) unresolved("Required knowledge identity is unavailable.");
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function requiredInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) unresolved("Required knowledge version is unavailable.");
  return value as number;
}

function requiredDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(value as never);
  if (Number.isNaN(date.getTime())) unresolved("Required knowledge timestamp is unavailable.");
  return date;
}

function optionalDate(value: unknown): Date | null {
  if (value == null) return null;
  return requiredDate(value);
}

function validDate(value: unknown, field: string): Date {
  const date = value instanceof Date ? value : new Date(typeof value === "string" ? value : "");
  if (Number.isNaN(date.getTime())) invalid(field, "Enter a valid date and time.");
  return date;
}

function knowledgeId(kind: string, value: string): string {
  return `ai-knowledge-${kind}-${value}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function invalid(field: string, message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", { [field]: message });
}

function validateSectionPayloadOrThrow(sectionKey: KnowledgeSectionKey, payload: unknown): void {
  try {
    assertValidKnowledgeSectionPayload(sectionKey, activeRowsForEnforcement(sectionKey, payload));
  } catch (error) {
    if (error instanceof KnowledgeValidationError) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
        Object.fromEntries(error.issues.map((issue) => [issue.path, issue.message]))
      );
    }
    throw error;
  }
}

function activeRowsForEnforcement(sectionKey: KnowledgeSectionKey, payload: unknown): unknown {
  const row = asRow(payload);
  if (!row) return payload;
  const projected = structuredClone(row);
  // Keep every row in structural validation. Inactive rows are immutable
  // history, not an escape hatch for malformed payloads. Only dependency
  // enforcement is projected: inactive steps contribute no edges and active
  // steps cannot depend on inactive steps.
  if (sectionKey === "execution" && Array.isArray(projected.steps)) {
    const activeIds = new Set(activeStructuredRows(projected.steps)
      .map((step) => optionalString(step.id))
      .filter((id): id is string => Boolean(id)));
    projected.steps = structuredRows(projected.steps).map((step) => step.active === false
      ? { ...step, dependencyStepIds: [] }
      : {
          ...step,
          dependencyStepIds: stringArray(step.dependencyStepIds).filter((id) => activeIds.has(id))
        });
  }
  return projected;
}

function versionConflict(): never {
  throw new ApiError(409, "VERSION_CONFLICT", "Estimation knowledge changed elsewhere.");
}

function immutableHistory(): never {
  throw new ApiError(409, "KNOWLEDGE_REVISION_IMMUTABLE", "Activated estimation knowledge is immutable.");
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

function unresolved(message: string): never {
  throw new ApiError(422, "KNOWLEDGE_NOT_RESOLVABLE", message);
}
