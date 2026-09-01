import { describe, expect, it, vi } from "vitest";

import {
  createKnowledgeSpecification,
  parseKnowledgeSpecifications,
  referencedSpecificationIds,
  serializeKnowledgeSpecifications
} from "./knowledgeSpecificationConfiguration";

describe("knowledge descriptive Specification configuration", () => {
  it("round-trips Plywood, Inner Laminate, and Hardware descriptions", () => {
    const source = [
      { id: "spec-plywood", name: "Plywood", description: "18 mm BWP-grade plywood." },
      { id: "spec-laminate", name: "Inner Laminate", description: "White matte internal faces." },
      { id: "spec-hardware", name: "Hardware", description: "Soft-close hinges." }
    ];

    const parsed = parseKnowledgeSpecifications(source);

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
        message: "Specification name is required."
      }));
    vi.unstubAllGlobals();
  });

  it("preserves hidden typed fields byte-for-byte through visible edits", () => {
    const typedSource = {
      id: "spec-typed",
      name: "Old plywood name",
      description: "Old description",
      type: "dropdown",
      options: ["BWP", "BWR"],
      value: "BWP"
    } as const;
    const parsed = parseKnowledgeSpecifications([typedSource]);
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
        message: "Specification names must be unique."
      }),
      expect.objectContaining({
        path: "specifications.1.description",
        message: "Brief description must be 4000 characters or fewer."
      })
    ]));
  });

  it("finds direct and resolved immutable historical price references", () => {
    expect([...referencedSpecificationIds([
      { operation: "append", specificationId: "spec-direct" },
      { operation: "reference", priceVersion: { specificationId: "spec-resolved" } },
      { operation: "reference", priceVersion: { specificationId: null } }
    ])]).toEqual(["spec-direct", "spec-resolved"]);
  });
});
