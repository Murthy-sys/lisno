import mongoose, { Types, type ClientSession } from "mongoose";

import type {
  KnowledgeCreateQualityControlOptionInput,
  KnowledgeQualityControlOption,
  KnowledgeQualityControlOptionKind,
  KnowledgeQualityControlOptionListResponse,
  KnowledgeQualityControlOptionReference
} from "../contracts/ai-estimator-knowledge.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_NAME_MAX_LENGTH,
  findBuiltInKnowledgeQualityControlOptionName,
  isKnowledgeQualityControlOptionKind,
  isKnowledgeQualityControlOptionReference,
  normalizeKnowledgeQualityControlOptionName
} from "../domain/ai-estimator-knowledge-quality-control-option.js";
import type { KnowledgeValidationIssue } from "../domain/ai-estimator-knowledge-validation.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeQualityControlOptionModel } from "../models/AiEstimatorKnowledgeQualityControlOption.js";
import type { AuditService } from "./audit.service.js";
import {
  aiEstimatorKnowledgeActorGuard,
  type AiEstimatorKnowledgeActorGuard
} from "./ai-estimator-knowledge-actor.js";
import type { PublicUser } from "./auth.service.js";
import { systemClock, type Clock } from "./workflow.js";

type Row = Record<string, unknown>;
type TransactionStarter = () => Promise<ClientSession>;

export interface AiEstimatorKnowledgeQualityControlOptionService {
  list(
    actor: PublicUser,
    kind: KnowledgeQualityControlOptionKind
  ): Promise<KnowledgeQualityControlOptionListResponse>;
  create(
    actor: PublicUser,
    input: KnowledgeCreateQualityControlOptionInput
  ): Promise<KnowledgeQualityControlOption>;
  validateReferences(
    parameters: readonly unknown[],
    session: ClientSession
  ): Promise<KnowledgeValidationIssue[]>;
  resolveReferenceNames(
    references: readonly KnowledgeQualityControlOptionReference[],
    session: ClientSession
  ): Promise<readonly KnowledgeQualityControlOptionReferenceResolution[]>;
}

export interface KnowledgeQualityControlOptionReferenceResolution {
  readonly id: KnowledgeQualityControlOptionReference;
  readonly kind: KnowledgeQualityControlOptionKind;
  readonly name: string;
}

export interface AiEstimatorKnowledgeQualityControlOptionServiceDependencies {
  readonly audit: Pick<AuditService, "appendInMongoTransaction">;
  readonly actorGuard?: AiEstimatorKnowledgeActorGuard;
  readonly now?: Clock;
  readonly createId?: () => KnowledgeQualityControlOptionReference;
  readonly startSession?: TransactionStarter;
}

export function createAiEstimatorKnowledgeQualityControlOptionService(
  dependencies: AiEstimatorKnowledgeQualityControlOptionServiceDependencies
): AiEstimatorKnowledgeQualityControlOptionService {
  const actorGuard = dependencies.actorGuard ?? aiEstimatorKnowledgeActorGuard;
  const now = dependencies.now ?? systemClock;
  const createId = dependencies.createId ?? (() =>
    `qco_${new Types.ObjectId().toHexString()}` as KnowledgeQualityControlOptionReference);
  const startSession = dependencies.startSession ?? (() => mongoose.startSession());

  return {
    async list(actor, kind) {
      await actorGuard.requireReadActor(actor);
      requireKind(kind);
      const rows = await AiEstimatorKnowledgeQualityControlOptionModel.find({ kind })
        .sort({ normalizedName: 1, _id: 1 })
        .lean()
        .exec();
      return { items: rows.map((row) => optionDto(row as Row)) };
    },

    async create(actor, input) {
      let normalized: ReturnType<typeof validateName> | undefined;
      try {
        return await withMongoTransaction(startSession, async (session) => {
          const authorized = await actorGuard.requireMutationActor(actor, session);
          requireKind(input.kind);
          normalized = validateName(input.name);
          const builtInName = findBuiltInKnowledgeQualityControlOptionName(
            input.kind,
            normalized.normalizedName
          );
          if (builtInName) {
            throw new ApiError(
              409,
              "QUALITY_CONTROL_OPTION_EXISTS",
              "A Quality Control option with this name already exists.",
              { existingOptionName: builtInName }
            );
          }
          const id = createId();
          if (!isKnowledgeQualityControlOptionReference(id)) {
            throw new Error("Quality Control option ID generator returned an invalid reference.");
          }
          const timestamp = now();
          const [created] = await AiEstimatorKnowledgeQualityControlOptionModel.create([{
            _id: id,
            kind: input.kind,
            name: normalized.name,
            normalizedName: normalized.normalizedName,
            version: 1,
            createdById: authorized.id,
            updatedById: authorized.id,
            createdAt: timestamp,
            updatedAt: timestamp
          }], { session });
          if (!created) {
            throw new Error("Quality Control option creation did not complete.");
          }
          await dependencies.audit.appendInMongoTransaction({
            actorId: authorized.id,
            action: "ai_estimator_knowledge_quality_control_option_created",
            entityType: "ai_estimator_knowledge_quality_control_option",
            entityId: id,
            occurredAt: timestamp.toISOString(),
            newValues: {
              kind: input.kind,
              optionId: id,
              name: normalized.name,
              normalizedName: normalized.normalizedName,
              version: 1
            }
          }, session);
          return optionDto(created.toObject() as Row);
        });
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        if (!normalized) throw error;
        const existing = await AiEstimatorKnowledgeQualityControlOptionModel.findOne({
          kind: input.kind,
          normalizedName: normalized.normalizedName
        }).lean().exec() as Row | null;
        throw new ApiError(
          409,
          "QUALITY_CONTROL_OPTION_EXISTS",
          "A Quality Control option with this name already exists.",
          existing
            ? {
                existingOptionId: String(existing._id),
                existingOptionName: String(existing.name)
              }
            : { name: "A Quality Control option with this name already exists." }
        );
      }
    },

    validateReferences(parameters, session) {
      return validateKnowledgeQualityControlOptionReferences(parameters, session);
    },

    resolveReferenceNames(references, session) {
      return resolveKnowledgeQualityControlOptionReferenceNames(references, session);
    }
  };
}

export async function resolveKnowledgeQualityControlOptionReferenceNames(
  references: readonly KnowledgeQualityControlOptionReference[],
  session: ClientSession
): Promise<readonly KnowledgeQualityControlOptionReferenceResolution[]> {
  const ids = [...new Set(references.filter(isKnowledgeQualityControlOptionReference))];
  if (ids.length === 0) return [];

  const rows = await AiEstimatorKnowledgeQualityControlOptionModel.find({
    _id: { $in: ids }
  })
    .select({ _id: 1, kind: 1, name: 1 })
    .session(session)
    .lean()
    .exec() as Row[];
  return rows.map((row) => ({
    id: String(row._id) as KnowledgeQualityControlOptionReference,
    kind: row.kind as KnowledgeQualityControlOptionKind,
    name: String(row.name)
  }));
}

export async function validateKnowledgeQualityControlOptionReferences(
  parameters: readonly unknown[],
  session: ClientSession
): Promise<KnowledgeValidationIssue[]> {
  const references = collectReferences(parameters);
  if (references.length === 0) return [];

  const ids = [...new Set(references.map(({ id }) => id))];
  const rows = await AiEstimatorKnowledgeQualityControlOptionModel.find({
    _id: { $in: ids }
  })
    .select({ _id: 1, kind: 1 })
    .session(session)
    .lean()
    .exec() as Row[];
  const byId = new Map(rows.map((row) => [String(row._id), String(row.kind)]));

  return references.flatMap(({ id, expectedKind, path }) => {
    const actualKind = byId.get(id);
    if (actualKind === undefined) {
      return [{
        path,
        code: "UNKNOWN_QUALITY_CONTROL_OPTION",
        message: expectedKind === "frequency"
          ? "Select an available Frequency value."
          : "Select an available Performed by value."
      }];
    }
    if (actualKind !== expectedKind) {
      return [{
        path,
        code: "QUALITY_CONTROL_OPTION_KIND_MISMATCH",
        message: expectedKind === "frequency"
          ? "The selected value is not a Frequency option."
          : "The selected value is not a Performed by option."
      }];
    }
    return [];
  });
}

function collectReferences(parameters: readonly unknown[]): Array<{
  readonly id: KnowledgeQualityControlOptionReference;
  readonly expectedKind: KnowledgeQualityControlOptionKind;
  readonly path: string;
}> {
  return parameters.flatMap((value, index) => {
    if (value === null || Array.isArray(value) || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const references: Array<{
      id: KnowledgeQualityControlOptionReference;
      expectedKind: KnowledgeQualityControlOptionKind;
      path: string;
    }> = [];
    if (isKnowledgeQualityControlOptionReference(row.responsibleRole)) {
      references.push({
        id: row.responsibleRole,
        expectedKind: "performer",
        path: `payload.parameters.${index}.responsibleRole`
      });
    }
    if (
      row.sampling !== null &&
      !Array.isArray(row.sampling) &&
      typeof row.sampling === "object"
    ) {
      const sampling = row.sampling as Record<string, unknown>;
      if (
        sampling.method === "all" &&
        isKnowledgeQualityControlOptionReference(sampling.unit)
      ) {
        references.push({
          id: sampling.unit,
          expectedKind: "frequency",
          path: `payload.parameters.${index}.sampling.unit`
        });
      }
    }
    return references;
  });
}

function requireKind(value: unknown): asserts value is KnowledgeQualityControlOptionKind {
  if (!isKnowledgeQualityControlOptionKind(value)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Quality Control option kind is invalid.",
      { kind: "Select Frequency or Performed by." }
    );
  }
}

function validateName(value: unknown): {
  readonly name: string;
  readonly normalizedName: string;
} {
  if (typeof value !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", "Quality Control option name is invalid.", {
      name: "Enter a name."
    });
  }
  const normalized = normalizeKnowledgeQualityControlOptionName(value);
  if (
    normalized.name.length === 0 ||
    normalized.name.length > AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_NAME_MAX_LENGTH ||
    normalized.normalizedName.length > AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_NAME_MAX_LENGTH
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Quality Control option name is invalid.", {
      name: `Enter a name between 1 and ${AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_NAME_MAX_LENGTH} characters.`
    });
  }
  return normalized;
}

function optionDto(row: Row): KnowledgeQualityControlOption {
  return {
    id: String(row._id) as KnowledgeQualityControlOptionReference,
    kind: row.kind as KnowledgeQualityControlOptionKind,
    name: String(row.name),
    version: Number(row.version),
    createdById: String(row.createdById),
    updatedById: String(row.updatedById),
    createdAt: asIsoString(row.createdAt),
    updatedAt: asIsoString(row.updatedAt)
  };
}

function asIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  throw new Error("Quality Control option timestamp is invalid.");
}

async function withMongoTransaction<T>(
  startSession: TransactionStarter,
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  const session = await startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}
