export const AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS = [
  "non_negotiable",
  "high",
  "medium",
  "low"
] as const;

export type KnowledgePrioritySemanticTier =
  (typeof AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS)[number];

export interface CanonicalKnowledgePriority {
  readonly id: string;
  readonly semanticTier: KnowledgePrioritySemanticTier;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
}

export const AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS = Object.freeze({
  nonNegotiable: "knowledge-priority-bootstrap-non-negotiable",
  high: "knowledge-priority-bootstrap-high",
  medium: "knowledge-priority-bootstrap-medium",
  low: "knowledge-priority-bootstrap-low"
} as const);

export const AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES = Object.freeze([
  Object.freeze({
    id: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.nonNegotiable,
    semanticTier: "non_negotiable",
    code: "NON_NEGOTIABLE",
    name: "Non Negotiable",
    displayOrder: 0
  }),
  Object.freeze({
    id: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high,
    semanticTier: "high",
    code: "HIGH",
    name: "High",
    displayOrder: 1
  }),
  Object.freeze({
    id: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.medium,
    semanticTier: "medium",
    code: "MEDIUM",
    name: "Medium",
    displayOrder: 2
  }),
  Object.freeze({
    id: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.low,
    semanticTier: "low",
    code: "LOW",
    name: "Low",
    displayOrder: 3
  })
] as const satisfies readonly CanonicalKnowledgePriority[]);

export function isKnowledgePrioritySemanticTier(
  value: unknown
): value is KnowledgePrioritySemanticTier {
  return typeof value === "string" && (
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS as readonly string[]
  ).includes(value);
}

export function findCanonicalKnowledgePriorityById(
  id: string
): CanonicalKnowledgePriority | undefined {
  return AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.find(
    (priority) => priority.id === id
  );
}

export function findCanonicalKnowledgePriorityByTier(
  semanticTier: KnowledgePrioritySemanticTier
): CanonicalKnowledgePriority {
  const priority = AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.find(
    (priority) => priority.semanticTier === semanticTier
  );
  if (!priority) {
    throw new Error(`Canonical Priority is missing for semantic tier ${semanticTier}.`);
  }
  return priority;
}
