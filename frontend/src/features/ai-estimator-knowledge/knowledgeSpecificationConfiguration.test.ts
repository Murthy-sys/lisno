import { describe, expect, it, vi } from "vitest";

import {
  createKnowledgeSpecification,
  KNOWLEDGE_MAX_BRANDS,
  parseKnowledgeSpecifications,
  referencedSpecificationIds,
  serializeKnowledgeSpecifications,
  validateKnowledgeBrands
} from "./knowledgeSpecificationConfiguration";
import type { KnowledgeJsonValue } from "./knowledgeTypes";

describe("knowledge descriptive Specification configuration", () => {
  it("round-trips Item descriptions and stable Brand associations", () => {
    const source: KnowledgeJsonValue = [
      { id: "spec-plywood", name: "Plywood", brandId: "brand-century-green", description: "18 mm BWP-grade plywood." },
      { id: "spec-laminate", name: "Inner Laminate", description: "White matte internal faces." },
      { id: "spec-hardware", name: "Hardware", description: "Soft-close hinges." }
    ];

    const parsed = parseKnowledgeSpecifications(source, [
      { id: "brand-century-green", name: "Century Green" }
    ]);

    expect(parsed.issues).toEqual([]);
    expect(serializeKnowledgeSpecifications(parsed.specifications)).toEqual(source);
  });

  it("creates only the descriptive new-write keys and omits a blank description", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-id" });
    const draft = createKnowledgeSpecification();

    expect(serializeKnowledgeSpecifications([draft])).toEqual([{
      id: "knowledge-specification-new-id",
      name: ""
    }]);
    expect(parseKnowledgeSpecifications(serializeKnowledgeSpecifications([draft])).issues)
      .toContainEqual(expect.objectContaining({
        path: "specifications.0.name",
        message: "Item name is required."
      }));
    vi.unstubAllGlobals();
  });

  it("preserves hidden typed fields byte-for-byte through visible edits", () => {
    const typedSource = {
      id: "spec-typed",
      name: "Old plywood name",
      brandId: "brand-century-green",
      description: "Old description",
      type: "dropdown",
      options: ["BWP", "BWR"],
      value: "BWP"
    } as const;
    const parsed = parseKnowledgeSpecifications([typedSource], [
      { id: "brand-century-green", name: "Century Green" }
    ]);
    const updated = {
      ...parsed.specifications[0]!,
      name: "Plywood",
      description: "18 mm BWP-grade plywood."
    };

    expect(parsed.issues).toEqual([]);
    expect(serializeKnowledgeSpecifications([updated])).toEqual([{
      ...typedSource,
      name: "Plywood",
      description: "18 mm BWP-grade plywood."
    }]);
  });

  it("accepts a missing Brand without writing a default association", () => {
    const parsed = parseKnowledgeSpecifications([
      { id: "spec-laminate", name: "Laminate" }
    ], [{ id: "brand-century-green", name: "Century Green" }]);

    expect(parsed.issues).toEqual([]);
    expect(parsed.specifications[0]?.brandId).toBeNull();
    expect(serializeKnowledgeSpecifications(parsed.specifications)).toEqual([
      { id: "spec-laminate", name: "Laminate" }
    ]);
  });

  it("rejects malformed and dangling Brand associations at the exact field path", () => {
    const brands = [{ id: "brand-century-green", name: "Century Green" }];

    expect(parseKnowledgeSpecifications([
      { id: "spec-plywood", name: "Plywood", brandId: " brand-century-green " }
    ], brands).issues).toContainEqual({
      path: "specifications.0.brandId",
      message: "Brand must use a bounded stable ID."
    });
    expect(parseKnowledgeSpecifications([
      { id: "spec-plywood", name: "Plywood", brandId: "brand-unavailable" }
    ], brands).issues).toContainEqual({
      path: "specifications.0.brandId",
      message: "Choose a configured Brand."
    });
  });

  it("can parse an association before a Brand catalog is available", () => {
    const parsed = parseKnowledgeSpecifications([
      { id: "spec-plywood", name: "Plywood", brandId: "brand-century-green" }
    ]);

    expect(parsed.issues).toEqual([]);
    expect(parsed.specifications[0]?.brandId).toBe("brand-century-green");
  });

  it("accepts nullable descriptions and omits descriptions cleared to blank text", () => {
    const nullable = parseKnowledgeSpecifications([
      { id: "spec-null-description", name: "Hardware", description: null }
    ]);
    expect(serializeKnowledgeSpecifications(nullable.specifications)).toEqual([
      { id: "spec-null-description", name: "Hardware", description: null }
    ]);

    expect(serializeKnowledgeSpecifications([{
      ...nullable.specifications[0]!,
      description: "   "
    }])).toEqual([{ id: "spec-null-description", name: "Hardware" }]);
  });

  it("validates normalized duplicate names and bounded descriptions", () => {
    const parsed = parseKnowledgeSpecifications([
      { id: "spec-1", name: " Inner   Laminate " },
      { id: "spec-2", name: "inner laminate", description: "x".repeat(4_001) }
    ]);

    expect(parsed.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "specifications.1.name",
        message: "Item names must be unique."
      }),
      expect.objectContaining({
        path: "specifications.1.description",
        message: "Brief description must be 4000 characters or fewer."
      })
    ]));
  });

  it("enforces the backend Brand collection limit before save", () => {
    const brands = Array.from({ length: KNOWLEDGE_MAX_BRANDS + 1 }, (_, index) => ({
      id: `brand-${index}`,
      name: `Brand ${index}`
    }));

    expect(validateKnowledgeBrands(brands)).toContainEqual({
      path: "brands",
      message: `Brands cannot contain more than ${KNOWLEDGE_MAX_BRANDS} entries.`
    });
  });

  it("finds direct and resolved immutable historical price references", () => {
    expect([...referencedSpecificationIds([
      { operation: "append", specificationId: "spec-direct" },
      { operation: "reference", priceVersion: { specificationId: "spec-resolved" } },
      { operation: "reference", priceVersion: { specificationId: null } }
    ])]).toEqual(["spec-direct", "spec-resolved"]);
  });
});
