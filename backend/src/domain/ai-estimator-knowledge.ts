import { createHash } from "node:crypto";

export const AI_ESTIMATOR_KNOWLEDGE_FORMULA_VERSION =
  "knowledge-preview-v1" as const;
export const AI_ESTIMATOR_KNOWLEDGE_CURRENCY = "INR" as const;
export const AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS = 10_000;
export const AI_ESTIMATOR_KNOWLEDGE_MAX_MONEY_PAISE =
  Number.MAX_SAFE_INTEGER;
export const AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT = 4_000;
export const AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT = 240;
export const AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS = 200;

export const AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES = [
  "draft",
  "active",
  "inactive",
  "archived"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES = [
  "draft",
  "active",
  "superseded"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES = [
  "active",
  "inactive",
  "archived"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES = [
  "draft",
  "active",
  "inactive"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS = [
  "overview",
  "pricing",
  "quantity-margin",
  "scope",
  "recommendations",
  "quality",
  "execution",
  "advanced"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY = [
  "configured",
  "not_configured",
  "not_applicable"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_COMPLETENESS_STATES = [
  "complete",
  "needs_attention",
  "not_configured",
  "not_applicable"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_AVAILABILITY_STATES = [
  "available",
  "not_configured",
  "not_applicable",
  "not_resolvable"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_RECOMMENDATION_TYPES = [
  "mandatory",
  "recommended",
  "optional"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_QUANTITY_RELATIONSHIPS = [
  "same_quantity",
  "percentage_of_source",
  "fixed",
  "per_unit"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_QUANTITY_GAP_BEHAVIORS = [
  "reject",
  "no_adjustment"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_QUALITY_PARAMETER_TYPES = [
  "text",
  "number",
  "dropdown",
  "radio",
  "checkbox",
  "multi_select",
  "boolean"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS = [
  "exclusive",
  "inclusive"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS = [
  "minutes",
  "hours",
  "days",
  "weeks"
] as const;

export type KnowledgeItemStatus =
  (typeof AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES)[number];
export type KnowledgeRevisionStatus =
  (typeof AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES)[number];
export type KnowledgeMasterStatus =
  (typeof AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES)[number];
export type KnowledgeVersionStatus =
  (typeof AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES)[number];
export type KnowledgeSectionKey =
  (typeof AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS)[number];
export type KnowledgeSectionApplicability =
  (typeof AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY)[number];
export type KnowledgeCompletenessState =
  (typeof AI_ESTIMATOR_KNOWLEDGE_COMPLETENESS_STATES)[number];
export type KnowledgeAvailabilityState =
  (typeof AI_ESTIMATOR_KNOWLEDGE_AVAILABILITY_STATES)[number];
export type KnowledgeRecommendationType =
  (typeof AI_ESTIMATOR_KNOWLEDGE_RECOMMENDATION_TYPES)[number];
export type KnowledgeQuantityRelationship =
  (typeof AI_ESTIMATOR_KNOWLEDGE_QUANTITY_RELATIONSHIPS)[number];
export type KnowledgeQuantityGapBehavior =
  (typeof AI_ESTIMATOR_KNOWLEDGE_QUANTITY_GAP_BEHAVIORS)[number];
export type KnowledgeQualityParameterType =
  (typeof AI_ESTIMATOR_KNOWLEDGE_QUALITY_PARAMETER_TYPES)[number];
export type KnowledgeTaxTreatment =
  (typeof AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS)[number];
export type KnowledgeDurationUnit =
  (typeof AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS)[number];

export function normalizeKnowledgeIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .filter((key) => source[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(source[key])])
    );
  }
  return value;
}

export function canonicalKnowledgeJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function createKnowledgeContentDigest(value: unknown): string {
  return createHash("sha256")
    .update(canonicalKnowledgeJson(value), "utf8")
    .digest("hex");
}

export function createKnowledgePriceScopeKey(input: {
  vendorId: string;
  uomId: string;
  specificationId: string | null;
  modeId: string | null;
}): string {
  return createKnowledgeContentDigest({
    vendorId: input.vendorId,
    uomId: input.uomId,
    specificationId: input.specificationId,
    modeId: input.modeId
  });
}
