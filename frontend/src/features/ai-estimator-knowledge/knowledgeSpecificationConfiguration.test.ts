import { describe, expect, it, vi } from "vitest";

import {
  createKnowledgeSpecification,
  KNOWLEDGE_MAX_BRANDS,
  parseKnowledgeSpecifications,
  referencedSpecificationIds,
  serializeKnowledgeSpecifications,
  withSpecificationBrandIds,
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
    expect(parsed.specifications[0]?.brandIds).toEqual([]);
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
    expect(parsed.specifications[0]?.brandIds).toEqual(["brand-century-green"]);
  });

  it("round-trips ordered multi-brand choices and serializes zero/one selections compatibly", () => {
    const brands = [{ id: "brand-a", name: "Alpha" }, { id: "brand-b", name: "Beta" }];
    const source = { id: "spec", name: "Paint", brandIds: ["brand-b", "brand-a"], type: "text", options: [], value: "retained" };
    const parsed = parseKnowledgeSpecifications([source], brands);
    expect(parsed.issues).toEqual([]);
    expect(parsed.specifications[0]?.brandIds).toEqual(["brand-b", "brand-a"]);
    expect(serializeKnowledgeSpecifications(parsed.specifications)).toEqual([source]);
    const one = withSpecificationBrandIds(parsed.specifications[0]!, ["brand-a"]);
    expect(serializeKnowledgeSpecifications([one])[0]).toMatchObject({ brandId: "brand-a", value: "retained" });
    expect(serializeKnowledgeSpecifications([one])[0]).not.toHaveProperty("brandIds");
    const empty = serializeKnowledgeSpecifications([withSpecificationBrandIds(one, [])])[0];
    expect(empty).not.toHaveProperty("brandId");
    expect(empty).not.toHaveProperty("brandIds");
    expect(parseKnowledgeSpecifications([{ id: "spec", name: "Paint", brandIds: [] }], brands).issues).toEqual([]);
  });

  it.each([
    { value: null, path: "brandIds" },
    { value: "brand-a", path: "brandIds" },
    { value: ["brand-a", null], path: "brandIds.1" },
    { value: ["brand-a", 12], path: "brandIds.1" },
    { value: ["brand-a", ""], path: "brandIds.1" },
    { value: ["brand-a", " brand-b "], path: "brandIds.1" },
    { value: ["brand-a", "brand-a"], path: "brandIds.1" },
    { value: ["brand-a", "other-line-brand"], path: "brandIds.1" },
    { value: ["brand-a", "x".repeat(241)], path: "brandIds.1" }
  ])("rejects invalid list $value without losing it in unrelated edits", ({ value, path }) => {
    const source = { id: "spec", name: "Paint", brandIds: value };
    const brands = [{ id: "brand-a", name: "Alpha" }, { id: "brand-b", name: "Beta" }];
    const parsed = parseKnowledgeSpecifications([source], brands);
    expect(parsed.issues).toContainEqual(expect.objectContaining({ path: `specifications.0.${path}` }));
    const serialized = serializeKnowledgeSpecifications([{ ...parsed.specifications[0]!, description: "Edited description" }]);
    expect(serialized[0]?.brandIds).toEqual(value);
    expect(parseKnowledgeSpecifications(serialized, brands).issues.length).toBeGreaterThan(0);
  });

  it("preserves mixed association evidence until the user explicitly repairs the choice", () => {
    const source = { id: "spec", name: "Paint", brandId: "brand-a", brandIds: ["brand-a", "brand-b"] };
    const brands = [{ id: "brand-a", name: "Alpha" }, { id: "brand-b", name: "Beta" }];
    const parsed = parseKnowledgeSpecifications([source], brands);
    expect(parsed.issues).toContainEqual(expect.objectContaining({ path: "specifications.0.brandIds", message: expect.stringContaining("not both") }));
    expect(serializeKnowledgeSpecifications([{ ...parsed.specifications[0]!, name: "Primer" }])).toEqual([{ ...source, name: "Primer" }]);
    const repaired = serializeKnowledgeSpecifications([withSpecificationBrandIds(parsed.specifications[0]!, ["brand-b"])]);
    expect(repaired[0]).toEqual({ id: "spec", name: "Paint", brandId: "brand-b" });
    expect(parseKnowledgeSpecifications(repaired, brands).issues).toEqual([]);
  });

  it("checks every selected ID for ambiguous local identities and the 200-brand bound", () => {
    const ambiguous = parseKnowledgeSpecifications([{ id: "spec", name: "Paint", brandIds: ["brand-a", "brand-b"] }], [
      { id: "brand-a", name: "Alpha" }, { id: "brand-b", name: "Beta" }, { id: "brand-b", name: "Different Beta" }
    ]);
    expect(ambiguous.issues).toContainEqual({ path: "specifications.0.brandIds.1", message: "Choose a configured Brand." });
    const brands = Array.from({ length: 201 }, (_, i) => ({ id: `brand-${i}`, name: `Brand ${i}` }));
    expect(parseKnowledgeSpecifications([{ id: "spec", name: "Paint", brandIds: brands.map(b => b.id) }], brands).issues)
      .toContainEqual({ path: "specifications.0.brandIds", message: "Select at most 200 Brands." });
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
