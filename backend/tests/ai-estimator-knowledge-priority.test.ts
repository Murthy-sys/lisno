import { describe, expect, it } from "vitest";

import {
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES,
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS,
  AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS,
  findCanonicalKnowledgePriorityById,
  findCanonicalKnowledgePriorityByTier,
  isKnowledgePrioritySemanticTier
} from "../src/domain/ai-estimator-knowledge-priority.js";

describe("AI estimator canonical Priority contract", () => {
  it("fixes the four canonical identities and preserves the existing Medium ID", () => {
    expect(AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES).toEqual([
      {
        id: "knowledge-priority-bootstrap-non-negotiable",
        semanticTier: "non_negotiable",
        code: "NON_NEGOTIABLE",
        name: "Non Negotiable",
        displayOrder: 0
      },
      {
        id: "knowledge-priority-bootstrap-high",
        semanticTier: "high",
        code: "HIGH",
        name: "High",
        displayOrder: 1
      },
      {
        id: "knowledge-priority-bootstrap-medium",
        semanticTier: "medium",
        code: "MEDIUM",
        name: "Medium",
        displayOrder: 2
      },
      {
        id: "knowledge-priority-bootstrap-low",
        semanticTier: "low",
        code: "LOW",
        name: "Low",
        displayOrder: 3
      }
    ]);
    expect(AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.medium).toBe(
      "knowledge-priority-bootstrap-medium"
    );
    expect(new Set(AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.map(({ id }) => id)).size).toBe(4);
    expect(new Set(AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.map(({ semanticTier }) => semanticTier)).size).toBe(4);
  });

  it("recognizes only canonical semantic tiers and resolves stable definitions", () => {
    expect(AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS).toEqual([
      "non_negotiable",
      "high",
      "medium",
      "low"
    ]);
    for (const semanticTier of AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS) {
      expect(isKnowledgePrioritySemanticTier(semanticTier)).toBe(true);
      const definition = findCanonicalKnowledgePriorityByTier(semanticTier);
      expect(findCanonicalKnowledgePriorityById(definition.id)).toBe(definition);
    }
    expect(isKnowledgePrioritySemanticTier("urgent")).toBe(false);
    expect(isKnowledgePrioritySemanticTier(null)).toBe(false);
    expect(findCanonicalKnowledgePriorityById("knowledge-priority-unknown")).toBeUndefined();
  });

  it("publishes an immutable canonical registry", () => {
    expect(Object.isFrozen(AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS)).toBe(true);
    expect(Object.isFrozen(AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES)).toBe(true);
    AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.forEach((definition) => {
      expect(Object.isFrozen(definition)).toBe(true);
    });
  });
});
