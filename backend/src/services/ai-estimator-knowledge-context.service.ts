import mongoose, { type ClientSession } from "mongoose";

import type {
  KnowledgeAvailability,
  KnowledgeContext,
  KnowledgePreview
} from "../contracts/ai-estimator-knowledge.js";
import {
  calculateKnowledgePreview,
  KnowledgeCalculationError,
  parseScaledDecimal,
  type CalculateKnowledgePreviewInput
} from "../domain/ai-estimator-knowledge-calculation.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  type KnowledgeDurationUnit,
  type KnowledgeSectionKey,
  type KnowledgeTaxTreatment
} from "../domain/ai-estimator-knowledge.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeModeModel } from "../models/AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSurfaceModel } from "../models/AiEstimatorKnowledgeSurface.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import type { PublicUser } from "./auth.service.js";
import {
  aiEstimatorKnowledgeActorGuard,
  type AiEstimatorKnowledgeActorGuard
} from "./ai-estimator-knowledge-actor.js";
import type { Clock } from "./workflow.js";
import { systemClock } from "./workflow.js";

type Row = Record<string, unknown>;

export interface AiEstimatorKnowledgeContextRequest {
  readonly mainBasketId: string;
  readonly mainLineId: string;
  readonly specificationId?: string;
  readonly quantity?: string;
  readonly uomId?: string;
  readonly surfaceId?: string;
  readonly modeId?: string;
}

export interface AiEstimatorKnowledgeContextService {
  preview(
    actor: PublicUser,
    input: CalculateKnowledgePreviewInput
  ): Promise<KnowledgePreview>;
  resolve(
    actor: PublicUser,
    input: AiEstimatorKnowledgeContextRequest
  ): Promise<KnowledgeContext>;
}

export interface AiEstimatorKnowledgeContextServiceDependencies {
  readonly actorGuard?: AiEstimatorKnowledgeActorGuard;
  readonly now?: Clock;
}

export function createAiEstimatorKnowledgeContextService(
  dependencies: AiEstimatorKnowledgeContextServiceDependencies = {}
): AiEstimatorKnowledgeContextService {
  const actorGuard = dependencies.actorGuard ?? aiEstimatorKnowledgeActorGuard;
  const now = dependencies.now ?? systemClock;

  return {
    async preview(actor, input) {
      await actorGuard.requireReadActor(actor);
      try {
        return calculateKnowledgePreview(input);
      } catch (error) {
        if (error instanceof KnowledgeCalculationError) {
          throw new ApiError(400, "VALIDATION_ERROR", error.message, {
            preview: error.code
          });
        }
        throw error;
      }
    },

    async resolve(actor, input) {
      const result = await mongoose.connection.transaction(
        async (session) => {
          await actorGuard.requireReadActor(actor, session);
          return resolveContext(input, now(), session);
        },
        {
          readConcern: { level: "snapshot" },
          readPreference: "primary"
        }
      );
      if (!result) {
        throw new ApiError(
          500,
          "KNOWLEDGE_CONTEXT_FAILED",
          "Knowledge context could not be resolved."
        );
      }
      return result;
    }
  };
}

async function resolveContext(
  input: AiEstimatorKnowledgeContextRequest,
  evaluatedAt: Date,
  session: ClientSession
): Promise<KnowledgeContext> {
  const mainLine = asRow(
    await AiEstimatorKnowledgeMainLineModel.findOne({
      _id: input.mainLineId,
      basketId: input.mainBasketId,
      status: "active",
      activeRevisionId: { $ne: null }
    })
      .session(session)
      .lean()
      .exec()
  );
  if (!mainLine) unresolvedCore();

  const revisionId = requiredString(mainLine.activeRevisionId);
  const basketDocument = await AiEstimatorKnowledgeBasketModel.findOne({
    _id: input.mainBasketId,
    status: { $ne: "archived" }
  }).session(session).lean().exec();
  const revisionDocument = await AiEstimatorKnowledgeRevisionModel.findOne({
    _id: revisionId,
    mainLineId: input.mainLineId,
    status: "active"
  }).session(session).lean().exec();
  const sectionDocuments = await AiEstimatorKnowledgeSectionModel.find({
    mainLineId: input.mainLineId,
    revisionId
  }).sort({ sectionKey: 1, _id: 1 }).session(session).lean().exec();
  const basket = asRow(basketDocument);
  const revision = asRow(revisionDocument);
  if (!basket || !revision) unresolvedCore();

  const sections = new Map<KnowledgeSectionKey, Row>();
  for (const document of sectionDocuments) {
    const row = asRow(document);
    if (!row) continue;
    const key = row.sectionKey;
    if (
      typeof key === "string" &&
      AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.includes(key as KnowledgeSectionKey)
    ) {
      sections.set(key as KnowledgeSectionKey, row);
    }
  }

  const projectedPayloads = new Map<KnowledgeSectionKey, Row>();
  for (const key of AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS) {
    projectedPayloads.set(key, projectActiveSectionRows(key, payloadFor(sections.get(key))));
  }

  const overview = projectedPayloads.get("overview")!;
  await validateRequestedMasterReferences(input, session);
  assertCompatibleReference(overview, "uomId", input.uomId);
  assertCompatibleArrayReference(overview, "surfaceIds", input.surfaceId);
  assertCompatibleArrayReference(overview, "modeIds", input.modeId);

  const pricing = projectedPayloads.get("pricing")!;
  assertSpecification(pricing, input.specificationId);

  const resolvedUomId = input.uomId ?? optionalString(overview.uomId);
  const retainedOverviewUomId = optionalString(overview.uomId);
  const uom = resolvedUomId
    ? asRow(
        await AiEstimatorKnowledgeUomModel.findOne({
          _id: resolvedUomId,
          status: resolvedUomId === retainedOverviewUomId
            ? { $ne: "archived" }
            : "active"
        })
          .session(session)
          .lean()
          .exec()
      )
    : null;
  if (resolvedUomId && !uom) invalidReference("uomId");

  const effectivePrice = await resolveEffectivePrice(
    revisionId,
    input,
    resolvedUomId,
    evaluatedAt,
    session,
    referencedPriceVersionIds(pricing)
  );
  const taxVersion = effectivePrice
    ? asRow(
        await AiEstimatorKnowledgeTaxVersionModel.findOne({
          _id: requiredString(effectivePrice.taxVersionId),
          taxRuleId: requiredString(effectivePrice.taxRuleId),
          status: "active",
          effectiveFrom: { $lte: evaluatedAt },
          $or: [{ effectiveTo: null }, { effectiveTo: { $gt: evaluatedAt } }]
        })
          .session(session)
          .lean()
          .exec()
      )
    : null;

  const execution = projectedPayloads.get("execution")!;
  const durationResolution = resolveExecutionDuration(execution, resolvedUomId, uom);
  const calculationPreview = buildContextPreview({
    input,
    overview,
    quantityMargin: projectedPayloads.get("quantity-margin")!,
    duration: durationResolution.duration,
    uom,
    price: effectivePrice && taxVersion ? effectivePrice : null,
    taxVersion
  });

  const availability = availabilityFor(sections);
  const pricingAvailabilityIndex = availability.findIndex(
    (entry) => entry.sectionKey === "pricing"
  );
  if (pricingAvailabilityIndex >= 0 && (!effectivePrice || !taxVersion)) {
    availability[pricingAvailabilityIndex] = {
      sectionKey: "pricing",
      state:
        sections.get("pricing")?.applicability === "not_applicable"
          ? "not_applicable"
          : "not_resolvable",
      reasonCode: effectivePrice
        ? "NO_EFFECTIVE_TAX_VERSION"
        : "NO_UNIQUE_EFFECTIVE_PRICE"
    };
  }
  const executionAvailabilityIndex = availability.findIndex(
    (entry) => entry.sectionKey === "execution"
  );
  if (executionAvailabilityIndex >= 0 &&
    sections.get("execution")?.applicability === "configured" &&
    durationResolution.reasonCode) {
    availability[executionAvailabilityIndex] = {
      sectionKey: "execution",
      state: "not_resolvable",
      reasonCode: durationResolution.reasonCode
    };
  }

  const contextSections: Partial<Record<KnowledgeSectionKey, unknown>> = {};
  for (const key of AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS) {
    const section = sections.get(key);
    if (!section || section.applicability !== "configured") continue;
    contextSections[key] = sanitizeSectionPayload(key, projectedPayloads.get(key)!);
  }

  const contentDigest = requiredString(revision.contentDigest);
  return {
    lineage: {
      mainLineId: input.mainLineId,
      revisionId,
      revisionNumber: requiredInteger(revision.revisionNumber),
      priceVersionId: effectivePrice ? requiredString(effectivePrice._id) : null,
      taxVersionId: taxVersion ? requiredString(taxVersion._id) : null,
      formulaVersion: "knowledge-preview-v1",
      contentDigest,
      evaluatedAt: evaluatedAt.toISOString()
    },
    availability,
    sections: {
      ...contextSections,
      overview: {
        ...(contextSections.overview as Row | undefined),
        basket: publicIdentity(basket),
        mainLine: publicIdentity(mainLine)
      }
    },
    preview: calculationPreview
  };
}

async function resolveEffectivePrice(
  revisionId: string,
  input: AiEstimatorKnowledgeContextRequest,
  uomId: string | undefined,
  evaluatedAt: Date,
  session: ClientSession,
  retainedPriceVersionIds: readonly string[]
): Promise<Row | null> {
  if (retainedPriceVersionIds.length === 0) return null;
  const filter: Row = {
    _id: { $in: retainedPriceVersionIds },
    revisionId,
    status: "active",
    effectiveFrom: { $lte: evaluatedAt },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: evaluatedAt } }]
  };
  if (uomId) filter.uomId = uomId;
  if (input.specificationId) filter.specificationId = input.specificationId;
  if (input.modeId) filter.modeId = input.modeId;
  const candidates = await AiEstimatorKnowledgePriceVersionModel.find(filter)
    .sort({ effectiveFrom: -1, _id: 1 })
    .limit(2)
    .session(session)
    .lean()
    .exec();
  return candidates.length === 1 ? asRow(candidates[0]) : null;
}

function referencedPriceVersionIds(pricing: Row): string[] {
  if (!Array.isArray(pricing.priceEntries)) return [];
  return pricing.priceEntries.flatMap((entry) => {
    const row = asRow(entry);
    return row?.operation === "reference" && typeof row.priceVersionId === "string"
      ? [row.priceVersionId]
      : [];
  });
}

function buildContextPreview(input: {
  input: AiEstimatorKnowledgeContextRequest;
  overview: Row;
  quantityMargin: Row;
  duration: CalculateKnowledgePreviewInput["duration"];
  uom: Row | null;
  price: Row | null;
  taxVersion: Row | null;
}): KnowledgePreview | null {
  const request = input.input;
  if (!input.price) return null;
  const quantityScale = input.uom ? requiredInteger(input.uom.decimalScale) : 0;
  const quantityAdjustmentBps = request.quantity
    ? applicableQuantityAdjustment(
        input.quantityMargin,
        request.quantity,
        quantityScale
      )
    : null;
  try {
    return calculateKnowledgePreview({
      priceVersionId: requiredString(input.price._id),
      taxVersionId: input.taxVersion ? requiredString(input.taxVersion._id) : null,
      unitRatePaise: requiredInteger(input.price.inputAmountPaise),
      quantityAdjustmentBps,
      quantity: request.quantity ?? null,
      quantityScale,
      wastageBps: optionalInteger(input.quantityMargin.wastageBps),
      taxRateBps: input.taxVersion
        ? requiredInteger(input.taxVersion.rateBps)
        : null,
      taxTreatment: input.taxVersion
        ? (requiredString(input.taxVersion.treatment) as KnowledgeTaxTreatment)
        : null,
      startMarginBps: optionalInteger(input.quantityMargin.startMarginBps),
      bottomMarginBps: optionalInteger(input.quantityMargin.bottomMarginBps),
      pmcMarkupBps: optionalInteger(input.quantityMargin.pmcMarkupBps),
      duration: input.duration
    });
  } catch (error) {
    if (error instanceof KnowledgeCalculationError) {
      throw new ApiError(400, "VALIDATION_ERROR", error.message, {
        context: error.code
      });
    }
    throw error;
  }
}

function applicableQuantityAdjustment(
  quantityMargin: Row,
  quantity: string,
  scale: number
): number | null {
  const slabs = Array.isArray(quantityMargin.quantitySlabs)
    ? quantityMargin.quantitySlabs
    : [];
  const requested = parseScaledDecimal(quantity, scale);
  for (const candidate of slabs) {
    const slab = asRow(candidate);
    if (!slab) continue;
    const minimum = optionalString(slab.minimumQuantity);
    const maximum = optionalString(slab.maximumQuantity);
    if (!minimum) continue;
    const lower = parseScaledDecimal(minimum, scale);
    const upper = maximum ? parseScaledDecimal(maximum, scale) : null;
    if (requested >= lower && (upper === null || requested < upper)) {
      return requiredInteger(slab.adjustmentBps);
    }
  }
  if (quantityMargin.gapBehavior === "reject" && slabs.length > 0) {
    throw new ApiError(
      422,
      "KNOWLEDGE_QUANTITY_NOT_RESOLVABLE",
      "No configured quantity rule applies."
    );
  }
  return 0;
}

function resolveExecutionDuration(
  execution: Row,
  resolvedUomId: string | undefined,
  uom: Row | null
): {
  duration: CalculateKnowledgePreviewInput["duration"];
  reasonCode: string | null;
} {
  const applicable = activeRows(execution.productivity).filter(
    (rule) => resolvedUomId !== undefined && optionalString(rule.uomId) === resolvedUomId
  );
  if (applicable.length === 0) {
    return { duration: null, reasonCode: "NO_APPLICABLE_PRODUCTIVITY_RULE" };
  }
  if (applicable.length > 1) {
    return { duration: null, reasonCode: "AMBIGUOUS_PRODUCTIVITY_RULES" };
  }
  const rule = applicable[0]!;
  const productivity = optionalString(rule.value);
  const unit = optionalString(rule.durationUnit);
  if (!productivity || !unit || !uom) {
    return { duration: null, reasonCode: "INVALID_PRODUCTIVITY_RULE" };
  }
  const productivityScale = requiredInteger(uom.decimalScale);
  try {
    parseScaledDecimal(productivity, productivityScale);
  } catch {
    return { duration: null, reasonCode: "INVALID_PRODUCTIVITY_PRECISION" };
  }
  return {
    duration: {
      productivity,
      productivityScale,
      unit: unit as KnowledgeDurationUnit,
      minimum: optionalString(rule.minimumDuration),
      maximum: optionalString(rule.maximumDuration)
    },
    reasonCode: null
  };
}

function availabilityFor(
  sections: ReadonlyMap<KnowledgeSectionKey, Row>
): KnowledgeAvailability[] {
  return AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => {
    const section = sections.get(sectionKey);
    if (!section) {
      return {
        sectionKey,
        state: "not_configured",
        reasonCode: "SECTION_MISSING"
      };
    }
    const applicability = section.applicability;
    if (applicability === "not_applicable") {
      return { sectionKey, state: "not_applicable", reasonCode: null };
    }
    if (applicability !== "configured") {
      return {
        sectionKey,
        state: "not_configured",
        reasonCode: "SECTION_NOT_CONFIGURED"
      };
    }
    return { sectionKey, state: "available", reasonCode: null };
  });
}

async function validateRequestedMasterReferences(
  input: AiEstimatorKnowledgeContextRequest,
  session: ClientSession
): Promise<void> {
  const [surface, mode] = await Promise.all([
    input.surfaceId
      ? AiEstimatorKnowledgeSurfaceModel.exists({ _id: input.surfaceId, status: "active" }).session(session)
      : null,
    input.modeId
      ? AiEstimatorKnowledgeModeModel.exists({ _id: input.modeId, status: "active" }).session(session)
      : null
  ]);
  if (input.surfaceId && !surface) invalidReference("surfaceId");
  if (input.modeId && !mode) invalidReference("modeId");
}

function assertCompatibleReference(
  payload: Row,
  key: string,
  requested: string | undefined
): void {
  if (!requested) return;
  const configured = optionalString(payload[key]);
  if (configured && configured !== requested) invalidReference(key);
}

function assertCompatibleArrayReference(
  payload: Row,
  key: string,
  requested: string | undefined
): void {
  if (!requested) return;
  const configured = Array.isArray(payload[key])
    ? (payload[key] as unknown[]).filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  if (configured.length > 0 && !configured.includes(requested)) {
    invalidReference(key);
  }
}

function assertSpecification(payload: Row, requested: string | undefined): void {
  if (!requested) return;
  const configured = Array.isArray(payload.specifications)
    ? payload.specifications.some(
        (entry) => asRow(entry)?._id === requested || asRow(entry)?.id === requested
      )
    : false;
  if (!configured) invalidReference("specificationId");
}

function projectActiveSectionRows(sectionKey: KnowledgeSectionKey, payload: Row): Row {
  const projected = structuredClone(payload);
  const fields = sectionKey === "scope"
    ? ["exclusions"]
    : sectionKey === "recommendations"
      ? ["recommendations"]
      : sectionKey === "quality"
        ? ["parameters"]
        : sectionKey === "execution"
          ? ["steps", "productivity"]
          : sectionKey === "advanced"
            ? ["dependencies", "modeOverrides"]
            : [];
  for (const field of fields) {
    if (Array.isArray(projected[field])) projected[field] = activeRows(projected[field]);
  }
  if (sectionKey === "execution" && Array.isArray(projected.steps)) {
    const stepIds = new Set(activeRows(projected.steps)
      .map((step) => optionalString(step.id))
      .filter((id): id is string => Boolean(id)));
    projected.steps = activeRows(projected.steps).map((step) => ({
      ...step,
      dependencyStepIds: Array.isArray(step.dependencyStepIds)
        ? step.dependencyStepIds.filter((id) => typeof id === "string" && stepIds.has(id))
        : []
    }));
  }
  return projected;
}

function activeRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRow).filter((row): row is Row => row !== null && row.active !== false);
}

function sanitizeSectionPayload(sectionKey: KnowledgeSectionKey, payload: Row): Row {
  if (sectionKey !== "pricing") return structuredClone(payload);
  const {
    internalVendorNotes: _internalVendorNotes,
    priceEntries: _priceEntries,
    ...safe
  } = payload;
  const specifications = Array.isArray(safe.specifications)
    ? safe.specifications.map((entry) => {
        const row = asRow(entry);
        if (!row) return entry;
        const { vendorNotes: _vendorNotes, internalVendorNotes: _internal, ...clean } = row;
        return clean;
      })
    : safe.specifications;
  return { ...safe, specifications };
}

function publicIdentity(row: Row): Row {
  return {
    id: requiredString(row._id),
    name: requiredString(row.name),
    description: optionalString(row.description),
    status: requiredString(row.status)
  };
}

function payloadFor(section: Row | undefined): Row {
  return asRow(section?.payload) ?? {};
}

function asRow(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) unresolvedCore();
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) unresolvedCore();
  return value as number;
}

function optionalInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function invalidReference(field: string): never {
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    { [field]: "The selected knowledge reference is incompatible." }
  );
}

function unresolvedCore(): never {
  throw new ApiError(
    422,
    "KNOWLEDGE_NOT_RESOLVABLE",
    "Required active estimation knowledge is unavailable."
  );
}
