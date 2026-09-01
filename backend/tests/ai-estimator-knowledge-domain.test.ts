import { describe, expect, it } from "vitest";

import {
  AI_ESTIMATOR_KNOWLEDGE_FORMULA_VERSION,
  AI_ESTIMATOR_KNOWLEDGE_EXECUTION_SOURCES,
  AI_ESTIMATOR_KNOWLEDGE_MODE_FIELD_TYPES,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  AI_ESTIMATOR_KNOWLEDGE_SPECIFICATION_FIELD_TYPES,
  canonicalKnowledgeJson,
  createKnowledgeContentDigest,
  createKnowledgePriceScopeKey,
  normalizeKnowledgeIdentity
} from "../src/domain/ai-estimator-knowledge.js";
import {
  createKnowledgeRevisionDigest,
  deriveKnowledgeCompleteness
} from "../src/domain/ai-estimator-knowledge-completeness.js";

describe("AI estimator knowledge domain", () => {
  it("exposes the closed formula and eight-section vocabulary", () => {
    expect(AI_ESTIMATOR_KNOWLEDGE_FORMULA_VERSION).toBe("knowledge-preview-v1");
    expect(AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS).toEqual([
      "overview",
      "pricing",
      "quantity-margin",
      "scope",
      "recommendations",
      "quality",
      "execution",
      "advanced"
    ]);
    expect(AI_ESTIMATOR_KNOWLEDGE_MODE_FIELD_TYPES).toEqual([
      "text",
      "textarea",
      "number",
      "radio",
      "dropdown",
      "checkbox"
    ]);
    expect(AI_ESTIMATOR_KNOWLEDGE_EXECUTION_SOURCES).toEqual([
      "sub_vendor",
      "in_house"
    ]);
    expect(AI_ESTIMATOR_KNOWLEDGE_SPECIFICATION_FIELD_TYPES).toEqual([
      "text",
      "textarea",
      "number",
      "radio",
      "dropdown",
      "checkbox"
    ]);
  });

  it("normalizes Unicode, case, and whitespace without using labels as IDs", () => {
    expect(normalizeKnowledgeIdentity("  ＰＯＰ\t/  Gypsum  ")).toBe("pop / gypsum");
    expect(normalizeKnowledgeIdentity("Plain FALSE Ceiling")).toBe("plain false ceiling");
  });

  it("creates deterministic canonical digests independent of object key order", () => {
    expect(canonicalKnowledgeJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}'
    );
    expect(createKnowledgeContentDigest({ b: 2, a: 1 })).toBe(
      createKnowledgeContentDigest({ a: 1, b: 2 })
    );
    expect(createKnowledgeContentDigest({ a: 2 })).not.toBe(
      createKnowledgeContentDigest({ a: 1 })
    );
  });

  it("scopes price identities to stable IDs", () => {
    const first = createKnowledgePriceScopeKey({
      vendorId: "vendor-1",
      uomId: "uom-1",
      specificationId: null,
      modeId: "mode-1"
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toBe(
      createKnowledgePriceScopeKey({
        vendorId: "vendor-2",
        uomId: "uom-1",
        specificationId: null,
        modeId: "mode-1"
      })
    );
  });

  it("derives completeness with not-applicable sections outside the denominator", () => {
    const completeness = deriveKnowledgeCompleteness({
      identity: { basketId: "basket-1", mainLineId: "line-1", uomId: "uom-1" },
      sections: AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => ({
        sectionKey,
        applicability: sectionKey === "advanced" ? "not_applicable" as const : "configured" as const,
        payload: { configured: true }
      }))
    });
    expect(completeness.percentage).toBe(100);
    expect(completeness.sections.find(({ sectionKey }) => sectionKey === "advanced")?.state).toBe("not_applicable");
    expect(completeness.blockers).toEqual([]);
  });

  it("reports missing core identity as blockers while optional gaps remain warnings", () => {
    const completeness = deriveKnowledgeCompleteness({
      identity: { basketId: "basket-1", mainLineId: "line-1", uomId: null },
      sections: [{ sectionKey: "overview", applicability: "not_configured", payload: {} }]
    });
    expect(completeness.blockers.map(({ code }) => code)).toContain("MISSING_UOM");
    expect(completeness.warnings.some(({ code }) => code === "SECTION_NOT_CONFIGURED")).toBe(true);
  });

  it("produces the same revision digest for sections supplied in a different order", () => {
    const overview = { sectionKey: "overview" as const, applicability: "configured" as const, payload: { uomId: "uom-1" } };
    const pricing = { sectionKey: "pricing" as const, applicability: "not_configured" as const, payload: {} };
    expect(createKnowledgeRevisionDigest({ mainLineId: "line-1", revisionNumber: 1, sections: [pricing, overview] })).toBe(
      createKnowledgeRevisionDigest({ mainLineId: "line-1", revisionNumber: 1, sections: [overview, pricing] })
    );
  });

  it("includes ordered mode configurations in revision content lineage", () => {
    const base = {
      mainLineId: "line-1",
      revisionNumber: 1,
      sections: [{
        sectionKey: "advanced" as const,
        applicability: "configured" as const,
        payload: {
          modeConfigurations: [{
            id: "configuration-pmc",
            modeId: "mode-pmc",
            fields: [{
              id: "field-pmc-mark",
              type: "text",
              label: "PMC mark",
              options: [],
              value: "A1"
            }]
          }]
        }
      }]
    };
    expect(createKnowledgeRevisionDigest(base)).not.toBe(
      createKnowledgeRevisionDigest({
        ...base,
        sections: [{
          ...base.sections[0]!,
          payload: {
            modeConfigurations: [{
              ...base.sections[0]!.payload.modeConfigurations[0]!,
              fields: [{
                ...base.sections[0]!.payload.modeConfigurations[0]!.fields[0]!,
                value: "A2"
              }]
            }]
          }
        }]
      })
    );
  });
});
