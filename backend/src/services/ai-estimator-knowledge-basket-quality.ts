import type { ClientSession } from "mongoose";

import type { KnowledgeMasterStatus } from "../domain/ai-estimator-knowledge.js";
import { createKnowledgeContentDigest } from "../domain/ai-estimator-knowledge.js";
import { validateKnowledgeSectionPayload } from "../domain/ai-estimator-knowledge-validation.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketQualityRevisionModel } from "../models/AiEstimatorKnowledgeBasketQualityRevision.js";

type Row = Record<string, unknown>;

export interface AiEstimatorKnowledgeBasketQualityDto {
  readonly basketId: string;
  readonly basketName: string;
  readonly basketStatus: KnowledgeMasterStatus;
  /** Compare-and-swap version of the Basket, shared with Basket edits/deletion. */
  readonly version: number;
  readonly revisionId: string | null;
  readonly revisionNumber: number;
  readonly contentDigest: string | null;
  readonly parameters: Row[];
  readonly updatedAt: string | null;
}

export interface AiEstimatorKnowledgeBasketQualityRevision {
  _id: string;
  basketId: string;
  revisionNumber: number;
  contentDigest: string;
  parameters: Row[];
  createdAt: Date;
}

export function basketQualityDigest(basketId: string, parameters: unknown): string {
  return createKnowledgeContentDigest({ basketId, parameters });
}

/** Current checklist policy; never apply this before validating a stored revision's raw digest. */
export function mandatoryQualityParameters(parameters: readonly Row[]): Row[] {
  return parameters.map((parameter) => ({ ...structuredClone(parameter), required: true, active: true }));
}

/** A broken pointer or digest must never silently expose a stale item checklist. */
export async function readBasketQualityRevision(
  basket: Row,
  session: ClientSession
): Promise<AiEstimatorKnowledgeBasketQualityRevision | null> {
  if (basket.qualityRevisionId === null || basket.qualityRevisionId === undefined) return null;
  if (typeof basket.qualityRevisionId !== "string" || !basket.qualityRevisionId) return corruptQuality();
  const revision = await AiEstimatorKnowledgeBasketQualityRevisionModel.findOne({
    _id: basket.qualityRevisionId, basketId: basket._id
  }).session(session).lean().exec() as AiEstimatorKnowledgeBasketQualityRevision | null;
  return validateBasketQualityRevision(basket, revision);
}

/** Resolve the current shared checklists once per list, never once per item. */
export async function readBasketQualityRevisions(
  baskets: readonly Row[]
): Promise<Map<string, AiEstimatorKnowledgeBasketQualityRevision | null>> {
  const withQuality = baskets.filter((basket) => basket.qualityRevisionId !== null && basket.qualityRevisionId !== undefined);
  if (withQuality.some((basket) => typeof basket.qualityRevisionId !== "string" || !basket.qualityRevisionId)) return corruptQuality();
  const revisions = withQuality.length ? await AiEstimatorKnowledgeBasketQualityRevisionModel.find({
    _id: { $in: [...new Set(withQuality.map((basket) => basket.qualityRevisionId))] }
  }).lean().exec() as AiEstimatorKnowledgeBasketQualityRevision[] : [];
  const byId = new Map(revisions.map((revision) => [revision._id, revision]));
  return new Map(baskets.map((basket) => [String(basket._id), basket.qualityRevisionId == null ? null
    : validateBasketQualityRevision(basket, byId.get(String(basket.qualityRevisionId)) ?? null)]));
}

function validateBasketQualityRevision(
  basket: Row,
  revision: AiEstimatorKnowledgeBasketQualityRevision | null
): AiEstimatorKnowledgeBasketQualityRevision {
  if (!revision || !Array.isArray(revision.parameters)
    || revision.basketId !== basket._id || revision._id !== basket.qualityRevisionId
    || !Number.isSafeInteger(revision.revisionNumber) || revision.revisionNumber < 1
    || !(revision.createdAt instanceof Date) || Number.isNaN(revision.createdAt.getTime())
    || validateKnowledgeSectionPayload("quality", { parameters: revision.parameters }).length
    || revision.contentDigest !== basketQualityDigest(String(basket._id), revision.parameters)) {
    return corruptQuality();
  }
  return revision;
}

export function basketQualityDto(basket: Row, revision: AiEstimatorKnowledgeBasketQualityRevision | null): AiEstimatorKnowledgeBasketQualityDto {
  return {
    basketId: String(basket._id), basketName: String(basket.name),
    basketStatus: basket.status as KnowledgeMasterStatus, version: Number(basket.version),
    revisionId: revision?._id ?? null, revisionNumber: revision?.revisionNumber ?? 0,
    contentDigest: revision?.contentDigest ?? null,
    parameters: mandatoryQualityParameters(revision?.parameters ?? []),
    updatedAt: revision?.createdAt.toISOString() ?? null
  };
}

function corruptQuality(): never {
  throw new ApiError(409, "BASKET_QUALITY_NOT_RESOLVABLE", "The shared Main Basket quality checklist could not be resolved.");
}
