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
  AI_ESTIMATOR_KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS,
  countConfiguredKnowledgeWorkspaceTabs,
  createKnowledgeRevisionDigest,
  deriveKnowledgeCompleteness
} from "../src/domain/ai-estimator-knowledge-completeness.js";
import { KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS } from "../../shared/knowledge/knowledgeWorkspaceSections.js";

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

  it("counts configured workspace tabs with either Mode backing section complete", () => {
    const completeness = deriveKnowledgeCompleteness({
      identity: { basketId: "basket-1", mainLineId: "line-1", uomId: "uom-1" },
      sections: AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => ({
        sectionKey,
        applicability: sectionKey === "advanced" ? "not_applicable" as const : "configured" as const,
        payload: sectionKey === "recommendations" ? { recommendations: [{ id: "saved" }] } : { configured: true }
      }))
    });
    expect(completeness.percentage).toBe(100);
    expect(completeness.sections.find(({ sectionKey }) => sectionKey === "advanced")?.state).toBe("not_applicable");
    expect(completeness.blockers).toEqual([]);
  });

  it("leaves hidden backend sections outside the registered-tab percentage", () => {
    /* Scope and Execution have no editor; Quantity Margin has no first-level
       workspace tab. None can lower the visible progress percentage. */
    const configurable = [
      "overview",
      "pricing",
      "quantity-margin",
      "recommendations",
      "quality",
      "advanced"
    ] as const;
    const completeness = deriveKnowledgeCompleteness({
      identity: { basketId: "basket-1", mainLineId: "line-1", uomId: "uom-1" },
      sections: configurable.map((sectionKey) => ({
        sectionKey,
        applicability: "configured" as const,
        payload: sectionKey === "recommendations" ? { recommendations: [{ id: "saved" }] } : { configured: true }
      }))
    });

    expect(completeness.percentage).toBe(100);
    expect(completeness.blockers).toEqual([]);
    expect(completeness.warnings).toEqual([]);
    expect(completeness.sections
      .filter(({ state }) => state === "not_applicable")
      .map(({ sectionKey }) => sectionKey)).toEqual(["scope", "execution"]);

    const half = deriveKnowledgeCompleteness({
      identity: { basketId: "basket-1", mainLineId: "line-1", uomId: "uom-1" },
      sections: configurable.map((sectionKey, index) => ({
        sectionKey,
        applicability: index < 3 ? "configured" as const : "not_configured" as const,
        payload: index < 3 ? { configured: true } : {}
      }))
    });
    expect(half.percentage).toBe(50);
  });

  it("keeps the backend tab mapping synchronized with the shared workspace registry", () => {
    expect(AI_ESTIMATOR_KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS)
      .toEqual(KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS);
  });

  it("derives progress from registered tabs and adapts when a fifth tab is registered", () => {
    const identity = { basketId: "basket-1", mainLineId: "line-1", uomId: "uom-1" };
    const section = (sectionKey: (typeof AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS)[number], configured: boolean) => ({
      sectionKey, applicability: "configured" as const,
      payload: configured ? sectionKey === "recommendations" ? { recommendations: [{ id: "saved" }] } : { configured: true } : {}
    });
    const sections = [
      section("overview", true), section("advanced", true), section("pricing", false),
      section("recommendations", true), section("quality", true), section("quantity-margin", false)
    ];
    const allVisible = deriveKnowledgeCompleteness({ identity, sections });
    expect(allVisible.percentage).toBe(100);
    expect(countConfiguredKnowledgeWorkspaceTabs(allVisible.sections)).toEqual({
      configured: 4, total: 4, percentage: 100
    });

    const fifthTab = {
      ...AI_ESTIMATOR_KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS,
      quantityMargin: ["quantity-margin" as const]
    };
    expect(countConfiguredKnowledgeWorkspaceTabs(allVisible.sections, fifthTab)).toEqual({
      configured: 4, total: 5, percentage: 80
    });
    const fiveComplete = deriveKnowledgeCompleteness({ identity, sections: [
      ...sections.filter(({ sectionKey }) => sectionKey !== "quantity-margin"),
      section("quantity-margin", true)
    ] });
    expect(countConfiguredKnowledgeWorkspaceTabs(fiveComplete.sections, fifthTab)).toEqual({
      configured: 5, total: 5, percentage: 100
    });

    const threeComplete = deriveKnowledgeCompleteness({ identity, sections: sections.map((row) =>
      row.sectionKey === "recommendations" ? section("recommendations", false) : row
    ) });
    expect(threeComplete.percentage).toBe(75);
    const oneComplete = deriveKnowledgeCompleteness({ identity, sections: [section("overview", true)] });
    expect(oneComplete.percentage).toBe(25);
    const noneComplete = deriveKnowledgeCompleteness({ identity, sections: [] });
    expect(noneComplete.percentage).toBe(0);
    const pricingOnly = deriveKnowledgeCompleteness({ identity, sections: [
      section("overview", true), section("pricing", true)
    ] });
    expect(pricingOnly.percentage).toBe(50);
  });

  it("counts a section by its saved content, not by a stale applicability flag", () => {
    /* Section writes used to leave applicability behind, so a Draft holding a
       real budget or Quality parameter still reported as not configured. */
    const completeness = deriveKnowledgeCompleteness({
      identity: { basketId: "basket-1", mainLineId: "line-1", uomId: "uom-1" },
      sections: [
        { sectionKey: "overview", applicability: "configured", payload: { uomId: "uom-1" } },
        {
          sectionKey: "quantity-margin",
          applicability: "not_configured",
          payload: { startMarginBps: 10, bottomMarginBps: 12 }
        },
        { sectionKey: "quality", applicability: "not_configured", payload: {} }
      ]
    });

    expect(completeness.sections.find(({ sectionKey }) => sectionKey === "quantity-margin")?.state)
      .toBe("complete");
    expect(completeness.sections.find(({ sectionKey }) => sectionKey === "quality")?.state)
      .toBe("not_configured");
  });

  it("does not count an empty Recommendations tab as configured", () => {
    const identity = { basketId: "basket-1", mainLineId: "line-1", uomId: "uom-1" };
    const base = [{ sectionKey: "overview" as const, applicability: "configured" as const, payload: { uomId: "uom-1" } }];
    const empty = deriveKnowledgeCompleteness({ identity, sections: [...base, {
      sectionKey: "recommendations", applicability: "configured", payload: {
        recommendations: [], exclusions: [], budgetAlterations: []
      }
    }] });
    expect(empty.sections.find(({ sectionKey }) => sectionKey === "recommendations")?.state).toBe("not_configured");
    expect(empty.percentage).toBe(25);
    const configured = deriveKnowledgeCompleteness({ identity, sections: [...base, {
      sectionKey: "recommendations", applicability: "configured", payload: {
        exclusions: [{ id: "saved-exclusion" }]
      }
    }] });
    expect(configured.sections.find(({ sectionKey }) => sectionKey === "recommendations")?.state).toBe("complete");
    expect(configured.percentage).toBe(50);
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
