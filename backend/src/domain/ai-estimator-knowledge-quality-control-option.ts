import type {
  KnowledgeQualityControlOptionKind,
  KnowledgeQualityControlOptionReference
} from "../contracts/ai-estimator-knowledge.js";
import { normalizeKnowledgeIdentity } from "./ai-estimator-knowledge.js";

export const AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_KINDS = [
  "frequency",
  "performer"
] as const satisfies readonly KnowledgeQualityControlOptionKind[];

export const AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_NAME_MAX_LENGTH = 80;

export const AI_ESTIMATOR_KNOWLEDGE_BUILT_IN_QUALITY_CONTROL_OPTION_NAMES = {
  frequency: ["Per unit", "Per room", "Per zone", "Per batch", "Once per project"],
  performer: ["Site", "PM", "Procurement", "Vendor"]
} as const satisfies Readonly<Record<
  KnowledgeQualityControlOptionKind,
  readonly string[]
>>;

export const AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_REFERENCE_PATTERN =
  /^qco_[0-9a-f]{24}$/u;

export function isKnowledgeQualityControlOptionKind(
  value: unknown
): value is KnowledgeQualityControlOptionKind {
  return typeof value === "string" &&
    AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_KINDS.some(
      (candidate) => candidate === value
    );
}

export function isKnowledgeQualityControlOptionReference(
  value: unknown
): value is KnowledgeQualityControlOptionReference {
  return typeof value === "string" &&
    AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_REFERENCE_PATTERN.test(value);
}

export function normalizeKnowledgeQualityControlOptionName(value: string): {
  readonly name: string;
  readonly normalizedName: string;
} {
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return {
    name,
    normalizedName: normalizeKnowledgeIdentity(name)
  };
}

export function findBuiltInKnowledgeQualityControlOptionName(
  kind: KnowledgeQualityControlOptionKind,
  normalizedName: string
): string | undefined {
  return AI_ESTIMATOR_KNOWLEDGE_BUILT_IN_QUALITY_CONTROL_OPTION_NAMES[kind]
    .find((name) => normalizeKnowledgeIdentity(name) === normalizedName);
}
