import { describe, expect, it } from "vitest";

import {
  findOverlappingEffectiveWindows,
  validateAcyclicGraph,
  validateEffectiveWindow,
  validateKnowledgeSectionPayload,
  validateQualityParameter,
  validateQuantitySlabs
} from "../src/domain/ai-estimator-knowledge-validation.js";

describe("AI estimator knowledge validation", () => {
  it("uses start-inclusive/end-exclusive effective windows", () => {
    const first = { id: "first", effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveTo: new Date("2026-02-01T00:00:00Z") };
    const touching = { id: "touching", effectiveFrom: new Date("2026-02-01T00:00:00Z"), effectiveTo: null };
    const overlapping = { id: "overlap", effectiveFrom: new Date("2026-01-31T00:00:00Z"), effectiveTo: null };
    expect(validateEffectiveWindow(first)).toEqual([]);
    expect(findOverlappingEffectiveWindows([first, touching])).toEqual([]);
    expect(findOverlappingEffectiveWindows([first, overlapping])).toEqual([["first", "overlap"]]);
  });

  it("rejects invalid windows and overlapping or ambiguous slabs", () => {
    expect(validateEffectiveWindow({ id: "bad", effectiveFrom: new Date("2026-02-01"), effectiveTo: new Date("2026-01-01") })[0]?.code).toBe("INVALID_EFFECTIVE_WINDOW");
    const issues = validateQuantitySlabs({
      decimalScale: 2,
      gapBehavior: "reject",
      slabs: [
        { id: "one", minimumQuantity: "0", maximumQuantity: "10", adjustmentBps: 0 },
        { id: "two", minimumQuantity: "9.5", maximumQuantity: null, adjustmentBps: 500 }
      ]
    });
    expect(issues.map(({ code }) => code)).toContain("SLAB_OVERLAP");
  });

  it("requires explicit no-adjustment behavior for slab gaps", () => {
    const slabs = [
      { id: "one", minimumQuantity: "0", maximumQuantity: "10", adjustmentBps: 0 },
      { id: "two", minimumQuantity: "20", maximumQuantity: null, adjustmentBps: 500 }
    ];
    expect(validateQuantitySlabs({ decimalScale: 0, gapBehavior: "reject", slabs }).map(({ code }) => code)).toContain("SLAB_GAP");
    expect(validateQuantitySlabs({ decimalScale: 0, gapBehavior: "no_adjustment", slabs })).toEqual([]);
  });

  it("rejects unknown, self, duplicate, and cyclic dependency edges", () => {
    expect(validateAcyclicGraph(["a", "b"], [{ fromId: "a", toId: "missing" }])[0]?.code).toBe("INVALID_REFERENCE");
    expect(validateAcyclicGraph(["a"], [{ fromId: "a", toId: "a" }])[0]?.code).toBe("SELF_DEPENDENCY");
    expect(validateAcyclicGraph(["a", "b"], [{ fromId: "a", toId: "b" }, { fromId: "a", toId: "b" }]).map(({ code }) => code)).toContain("DUPLICATE_EDGE");
    expect(validateAcyclicGraph(["a", "b", "c"], [{ fromId: "a", toId: "b" }, { fromId: "b", toId: "c" }, { fromId: "c", toId: "a" }]).map(({ code }) => code)).toContain("DEPENDENCY_CYCLE");
  });

  it("applies type-specific quality parameter rules", () => {
    const base = {
      id: "quality-1",
      label: "Finish",
      unit: null,
      allowedValues: [] as string[],
      minimum: null,
      maximum: null,
      defaultValue: null,
      required: true,
      category: null,
      active: true
    };
    expect(validateQualityParameter({ ...base, type: "dropdown" })[0]?.code).toBe("REQUIRED");
    expect(validateQualityParameter({ ...base, type: "text", allowedValues: ["x"] })[0]?.code).toBe("IRRELEVANT_FIELD");
    expect(validateQualityParameter({ ...base, type: "number", minimum: "2", maximum: "1" })[0]?.code).toBe("INVALID_RANGE");
    expect(validateQualityParameter({ ...base, type: "number", minimum: "1", maximum: "2", defaultValue: "2.1" }).map(({ code }) => code)).toContain("INVALID_DEFAULT");
    expect(validateQualityParameter({ ...base, type: "dropdown", allowedValues: ["A"], defaultValue: "B" }).map(({ code }) => code)).toContain("INVALID_DEFAULT");
    expect(validateQualityParameter({ ...base, type: "radio", allowedValues: ["A"], defaultValue: "A" })).toEqual([]);
    expect(validateQualityParameter({ ...base, type: "multi_select", allowedValues: ["A", "B"], defaultValue: ["A", "C"] }).map(({ code }) => code)).toContain("INVALID_DEFAULT");
    expect(validateQualityParameter({ ...base, type: "checkbox", defaultValue: "true" }).map(({ code }) => code)).toContain("INVALID_DEFAULT");
    expect(validateQualityParameter({ ...base, type: "boolean", defaultValue: true })).toEqual([]);
    expect(validateQualityParameter({ ...base, type: "text", defaultValue: 1 }).map(({ code }) => code)).toContain("INVALID_DEFAULT");
  });

  it("rejects unknown section fields, floats, and invalid margins", () => {
    expect(validateKnowledgeSectionPayload("overview", { invented: true })[0]?.code).toBe("UNKNOWN_FIELD");
    expect(validateKnowledgeSectionPayload("quantity-margin", { startMarginBps: 10_000 }).map(({ code }) => code)).toContain("INVALID_MARGIN");
    expect(validateKnowledgeSectionPayload("execution", { steps: [{ duration: 1.25 }] }).map(({ code }) => code)).toContain("UNSAFE_NUMBER");
  });

  it("accepts strict proposed price appends and compact immutable-version references", () => {
    const append = {
      operation: "append",
      priceEntryId: "price-entry-1",
      vendorId: "vendor-1",
      uomId: "uom-1",
      specificationId: null,
      modeId: "mode-1",
      taxRuleId: "tax-rule-1",
      taxVersionId: "tax-version-1",
      inputAmountPaise: 7_500,
      treatment: "exclusive",
      effectiveFrom: "2026-08-28T00:00:00.000Z",
      effectiveTo: null,
      status: "active"
    };
    const reference = {
      operation: "reference",
      priceEntryId: "price-entry-1",
      priceVersionId: "price-version-1"
    };
    expect(validateKnowledgeSectionPayload("pricing", {
      specifications: [
        { id: "specification-standard", name: "Standard", description: null },
        { id: "specification-premium", name: "Premium" }
      ],
      brands: [{ id: "brand-expert", name: "Expert", description: "Approved brand" }],
      technicalDescription: "Use the approved channel and board assembly.",
      qualityLevel: "Premium",
      internalVendorNotes: null,
      priceEntries: [append, reference]
    })).toEqual([]);
  });

  it("rejects malformed pricing rows, normalized duplicates, and invalid pricing text fields", () => {
    const issues = validateKnowledgeSectionPayload("pricing", {
      specifications: [
        { id: "specification-1", name: "Standard", description: null, vendorId: "not-allowed" },
        { id: "specification-1", name: "  STANDARD  ", description: 42 }
      ],
      brands: ["Expert"],
      technicalDescription: 42,
      qualityLevel: "x".repeat(501),
      internalVendorNotes: { private: true }
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "payload.specifications.0.vendorId", code: "UNKNOWN_FIELD" }),
      expect.objectContaining({ path: "payload.specifications.1.id", code: "DUPLICATE_ID" }),
      expect.objectContaining({ path: "payload.specifications.1.name", code: "DUPLICATE_NAME" }),
      expect.objectContaining({ path: "payload.specifications.1.description", code: "INVALID_TYPE" }),
      expect.objectContaining({ path: "payload.brands.0", code: "INVALID_TYPE" }),
      expect.objectContaining({ path: "payload.technicalDescription", code: "INVALID_TYPE" }),
      expect.objectContaining({ path: "payload.qualityLevel", code: "INVALID_TYPE" }),
      expect.objectContaining({ path: "payload.internalVendorNotes", code: "INVALID_TYPE" })
    ]));
  });

  it("rejects client-derived price totals, invalid windows, and incomplete references", () => {
    const append = {
      operation: "append",
      priceEntryId: "price-entry-1",
      vendorId: "vendor-1",
      uomId: "uom-1",
      specificationId: null,
      modeId: null,
      taxRuleId: "tax-rule-1",
      taxVersionId: "tax-version-1",
      inputAmountPaise: 7_500,
      treatment: "exclusive",
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      effectiveTo: "2026-08-01T00:00:00.000Z",
      status: "active",
      totalAmountPaise: 8_850
    };
    const issues = validateKnowledgeSectionPayload("pricing", {
      priceEntries: [append, { operation: "reference", priceEntryId: "price-entry-1" }]
    });
    expect(issues.map(({ code }) => code)).toContain("UNKNOWN_FIELD");
    expect(issues.map(({ code }) => code)).toContain("INVALID_EFFECTIVE_WINDOW");
    expect(issues.map(({ code }) => code)).toContain("REQUIRED");
  });

  it("accepts exact guided-editor payloads for every non-pricing section", () => {
    expect(validateKnowledgeSectionPayload("overview", {
      description: "Plain false ceiling",
      uomId: "uom-sqft",
      priorityId: null,
      surfaceIds: ["surface-ceiling"],
      modeIds: ["mode-turnkey"],
      sectionApplicability: [{
        id: "applicability-quality",
        sectionKey: "quality",
        applicability: "not_applicable"
      }]
    })).toEqual([]);

    expect(validateKnowledgeSectionPayload("quantity-margin", {
      quantitySlabs: [
        { id: "slab-low", minimumQuantity: "0", maximumQuantity: "200", adjustmentBps: 500 },
        { id: "slab-standard", minimumQuantity: "200", maximumQuantity: null, adjustmentBps: 0 }
      ],
      gapBehavior: "reject",
      startMarginBps: 2_500,
      bottomMarginBps: 1_500,
      pmcMarkupBps: 1_500,
      wastageBps: 500,
      previewInputs: {
        priceVersionId: "price-version-1",
        taxVersionId: "tax-version-1",
        unitRatePaise: 7_500,
        quantityAdjustmentBps: 500,
        quantity: "150.5",
        quantityScale: 2,
        wastageBps: 500,
        taxRateBps: 1_800,
        taxTreatment: "exclusive",
        startMarginBps: 2_500,
        bottomMarginBps: 1_500,
        pmcMarkupBps: 1_500,
        duration: {
          productivity: "25.5",
          productivityScale: 2,
          unit: "days",
          minimum: "1",
          maximum: "10"
        }
      }
    })).toEqual([]);

    expect(validateKnowledgeSectionPayload("scope", {
      modeIds: ["mode-turnkey"],
      surfaceIds: ["surface-ceiling"],
      exclusions: [{
        id: "exclusion-painting",
        targetBasketId: "basket-painting",
        targetMainLineId: null,
        reason: "Priced separately",
        active: true
      }]
    })).toEqual([]);

    expect(validateKnowledgeSectionPayload("recommendations", {
      recommendations: [{
        id: "recommendation-wiring",
        targetBasketId: "basket-electrical",
        targetMainLineId: "line-wiring",
        type: "mandatory",
        priorityId: null,
        reason: "Complete before boards close the ceiling",
        quantityRelationship: "same_quantity",
        quantityValue: null,
        dependency: true,
        active: true
      }]
    })).toEqual([]);

    expect(validateKnowledgeSectionPayload("quality", {
      parameters: [
        {
          id: "quality-thickness",
          type: "number",
          label: "Board thickness",
          unit: "mm",
          allowedValues: [],
          minimum: "6",
          maximum: "18",
          defaultValue: "12.5",
          required: true,
          category: "Material",
          active: true
        },
        {
          id: "quality-finish",
          type: "dropdown",
          label: "Finish",
          unit: null,
          allowedValues: ["Standard", "Premium"],
          minimum: null,
          maximum: null,
          defaultValue: "Standard",
          required: true,
          category: null,
          active: true
        }
      ]
    })).toEqual([]);

    expect(validateKnowledgeSectionPayload("execution", {
      steps: [
        {
          id: "step-frame",
          order: 1,
          name: "Framing",
          description: null,
          durationValue: null,
          durationUnit: null,
          crewSize: 2,
          skillType: "Ceiling installer",
          mandatory: true,
          parallelizable: false,
          active: true,
          dependencyStepIds: []
        },
        {
          id: "step-board",
          order: 2,
          name: "Board installation",
          description: "Close the frame after services are complete.",
          durationValue: "2.5",
          durationUnit: "days",
          crewSize: 2,
          skillType: "Ceiling installer",
          mandatory: true,
          parallelizable: false,
          active: true,
          dependencyStepIds: ["step-frame"]
        }
      ],
      productivity: [{
        id: "productivity-standard",
        value: "25.5",
        uomId: "uom-sqft",
        crewSize: 2,
        skillType: "Ceiling installer",
        minimumDuration: "1",
        maximumDuration: "20",
        durationUnit: "days",
        active: true
      }]
    })).toEqual([]);

    expect(validateKnowledgeSectionPayload("advanced", {
      dependencies: [{
        id: "dependency-wiring",
        targetBasketId: "basket-electrical",
        targetMainLineId: "line-wiring",
        reason: null,
        active: true
      }],
      modeOverrides: [{
        id: "override-pmc",
        modeId: "mode-pmc",
        description: "PMC coordination is required.",
        active: true
      }],
      revisionLineage: [{
        revisionId: "revision-1",
        sourceRevisionId: null,
        revisionNumber: 1,
        status: "draft",
        contentDigest: null,
        activatedAt: null,
        supersededAt: null
      }]
    })).toEqual([]);
  });

  it("rejects unknown nested keys and malformed applicability, scope, and recommendation rows", () => {
    const overview = validateKnowledgeSectionPayload("overview", {
      sectionApplicability: [{
        id: "app-1",
        sectionKey: "invented",
        applicability: "hidden",
        label: "not allowed"
      }]
    });
    expect(overview).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "payload.sectionApplicability.0.label", code: "UNKNOWN_FIELD" }),
      expect.objectContaining({ path: "payload.sectionApplicability.0.sectionKey", code: "INVALID_ENUM" }),
      expect.objectContaining({ path: "payload.sectionApplicability.0.applicability", code: "INVALID_ENUM" })
    ]));

    const scope = validateKnowledgeSectionPayload("scope", {
      modeIds: ["mode-1", "mode-1"],
      exclusions: [{
        id: "exclusion-1",
        targetBasketId: null,
        targetMainLineId: null,
        label: "Painting"
      }]
    });
    expect(scope.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "DUPLICATE_ID",
      "UNKNOWN_FIELD",
      "REQUIRED",
      "REQUIRED_REFERENCE"
    ]));

    const recommendation = validateKnowledgeSectionPayload("recommendations", {
      recommendations: [{
        id: "recommendation-1",
        targetBasketId: "basket-1",
        targetMainLineId: "line-1",
        type: "automatic",
        priorityId: null,
        reason: "Required",
        quantityRelationship: "same_quantity",
        quantityValue: "2",
        dependency: "yes",
        active: true
      }]
    });
    expect(recommendation.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "INVALID_ENUM",
      "IRRELEVANT_FIELD",
      "INVALID_TYPE"
    ]));

    expect(validateKnowledgeSectionPayload("recommendations", {
      recommendations: [{
        id: "recommendation-missing-basket",
        targetMainLineId: "line-1",
        type: "mandatory",
        priorityId: null,
        reason: "Required",
        quantityRelationship: "same_quantity",
        quantityValue: null,
        dependency: true,
        active: true
      }]
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "payload.recommendations.0.targetBasketId",
        code: "REQUIRED"
      })
    ]));
  });

  it("runs strict slab and quality rules for guided-editor rows", () => {
    const quantity = validateKnowledgeSectionPayload("quantity-margin", {
      quantitySlabs: [
        { id: "slab-1", minimumQuantity: "0", maximumQuantity: "10", adjustmentBps: 0, unit: "sqft" },
        { id: "slab-2", minimumQuantity: "9", maximumQuantity: null, adjustmentBps: 15_000 }
      ],
      gapBehavior: "invented",
      previewInputs: {
        quantityScale: 2,
        duration: {
          productivity: "0",
          productivityScale: 2,
          unit: "months",
          invented: true
        }
      }
    });
    expect(quantity.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "UNKNOWN_FIELD",
      "INVALID_INTEGER",
      "INVALID_ENUM",
      "INVALID_RANGE"
    ]));
    expect(validateKnowledgeSectionPayload("quantity-margin", {
      quantitySlabs: [
        { id: "slab-1", minimumQuantity: "0", maximumQuantity: "10", adjustmentBps: 0 },
        { id: "slab-2", minimumQuantity: "9", maximumQuantity: null, adjustmentBps: 0 }
      ],
      gapBehavior: "reject"
    }).map(({ code }) => code)).toContain("SLAB_OVERLAP");

    const quality = validateKnowledgeSectionPayload("quality", {
      parameters: [{
        id: "quality-1",
        type: "dropdown",
        label: "Finish",
        unit: "mm",
        allowedValues: ["A", "A"],
        minimum: "0",
        maximum: "1",
        defaultValue: "B",
        required: true,
        category: null,
        active: true,
        optionsFrom: "external-code"
      }]
    });
    expect(quality.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "UNKNOWN_FIELD",
      "DUPLICATE_VALUE",
      "IRRELEVANT_FIELD"
    ]));
  });

  it("rejects incomplete execution rows, unknown step dependencies, and malformed advanced data", () => {
    const execution = validateKnowledgeSectionPayload("execution", {
      steps: [
        {
          id: "step-1",
          order: 1,
          name: "Frame",
          description: null,
          durationValue: "1",
          durationUnit: null,
          crewSize: 0,
          skillType: null,
          mandatory: true,
          parallelizable: false,
          active: true,
          dependencyStepIds: ["missing-step"],
          script: "do-not-run"
        },
        { id: "step-2", dependencyStepIds: [] }
      ],
      productivity: [{
        id: "productivity-1",
        value: "0",
        uomId: "uom-1",
        crewSize: 1,
        skillType: null,
        minimumDuration: "3",
        maximumDuration: "2",
        durationUnit: "months",
        active: true
      }]
    });
    expect(execution.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "UNKNOWN_FIELD",
      "COUPLED_FIELDS",
      "INVALID_INTEGER",
      "REQUIRED",
      "INVALID_RANGE",
      "INVALID_ENUM"
    ]));
    const completeStep = {
      order: 1,
      name: "Frame",
      description: null,
      durationValue: null,
      durationUnit: null,
      crewSize: null,
      skillType: null,
      mandatory: true,
      parallelizable: false,
      active: true
    };
    expect(validateKnowledgeSectionPayload("execution", {
      steps: [{
        id: "step-1",
        ...completeStep,
        dependencyStepIds: ["missing-step"]
      }]
    }).map(({ code }) => code)).toContain("INVALID_REFERENCE");

    const advanced = validateKnowledgeSectionPayload("advanced", {
      dependencies: [{
        id: "dependency-1",
        targetBasketId: "basket-1",
        targetMainLineId: "line-1",
        active: "true"
      }],
      modeOverrides: [{
        id: "override-1",
        modeId: "mode-1",
        description: "First",
        active: true,
        expression: "price * 2"
      }],
      revisionLineage: [{
        revisionId: "revision-1",
        sourceRevisionId: null,
        revisionNumber: 0,
        status: "published",
        contentDigest: "not-a-digest",
        activatedAt: "not-a-date",
        supersededAt: null
      }]
    });
    expect(advanced.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "INVALID_TYPE",
      "UNKNOWN_FIELD",
      "INVALID_INTEGER",
      "INVALID_ENUM",
      "INVALID_DIGEST",
      "INVALID_DATE"
    ]));

    expect(validateKnowledgeSectionPayload("advanced", {
      dependencies: [{
        id: "dependency-basket-only",
        targetBasketId: "basket-1",
        active: true
      }]
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "payload.dependencies.0.targetMainLineId",
        code: "REQUIRED"
      }),
      expect.objectContaining({
        path: "payload.dependencies.0.targetMainLineId",
        code: "REQUIRED_REFERENCE"
      })
    ]));

    expect(validateKnowledgeSectionPayload("scope", {
      exclusions: [{
        id: "exclusion-main-line-only",
        targetMainLineId: "line-1",
        active: true
      }]
    })).toEqual([]);
  });
});
