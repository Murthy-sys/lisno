import { describe, expect, it } from "vitest";

import {
  KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL,
  hasMeaningfulKnowledgeValue,
  projectKnowledgeOverviewSummary,
  type KnowledgeOverviewMasterReference,
  type KnowledgeOverviewSummaryInput
} from "./knowledgeOverviewSummary";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

function master(
  id: string,
  name: string,
  displayOrder: number,
  status: KnowledgeOverviewMasterReference["status"] = "active"
): KnowledgeOverviewMasterReference {
  return { id, name, displayOrder, status };
}

function asymmetricInput(): KnowledgeOverviewSummaryInput {
  return {
    sections: {
      overview: {
        uomId: "uom-sheet",
        modeIds: ["mode-pmc", "mode-labour"],
        surfaceIds: ["surface-wall"]
      },
      pricing: {
        specifications: [
          { id: "spec-fire", name: "Fire-rated board", description: "Two layers" },
          { id: "spec-acoustic", name: "Acoustic board", description: "Perforated" }
        ],
        priceEntries: [
          {
            operation: "append",
            priceEntryId: "price-pmc",
            specificationId: "spec-fire",
            modeId: "mode-pmc",
            vendorId: "vendor-north",
            uomId: "uom-sheet",
            taxRuleId: "tax-gst",
            taxVersionId: "tax-gst-v3",
            inputAmountPaise: 12_345,
            treatment: "exclusive",
            effectiveFrom: "2026-09-01T00:00:00.000Z",
            effectiveTo: null,
            status: "active"
          },
          {
            operation: "reference",
            priceEntryId: "price-labour",
            priceVersionId: "price-labour-v7",
            priceVersion: {
              id: "price-labour-v7",
              priceEntryId: "price-labour",
              versionNumber: 7,
              specificationId: "spec-acoustic",
              modeId: "mode-labour",
              vendorId: "vendor-south",
              uomId: "uom-hour",
              taxRuleId: "tax-gst",
              taxVersionId: "tax-gst-v3",
              inputAmountPaise: 987_654,
              baseAmountPaise: 900_001,
              taxAmountPaise: 87_653,
              totalAmountPaise: 987_654,
              treatment: "inclusive",
              effectiveFrom: "2026-10-01T00:00:00.000Z",
              effectiveTo: null,
              status: "active",
              reviewRequired: true
            }
          }
        ]
      },
      "quantity-margin": {
        gapBehavior: "reject",
        startMarginBps: 1_111,
        bottomMarginBps: 2_222,
        pmcMarkupBps: 3_333,
        wastageBps: 4_444,
        quantitySlabs: [
          {
            id: "slab-low",
            minimumQuantity: "0.125",
            maximumQuantity: "50.75",
            adjustmentBps: 555
          }
        ]
      },
      scope: {
        modeIds: ["mode-pmc"],
        surfaceIds: ["surface-wall"],
        exclusions: [{ id: "exclusion-one", active: true }]
      },
      recommendations: {
        recommendations: [
          {
            id: "recommendation-trim",
            targetBasketId: "basket-finishes",
            targetMainLineId: "line-trim",
            type: "mandatory",
            priorityId: "priority-high",
            reason: "Close the perimeter",
            quantityRelationship: "same_quantity",
            quantityValue: null,
            dependency: true,
            active: true
          },
          {
            id: "recommendation-insulation",
            targetBasketId: "basket-insulation",
            targetMainLineId: "line-insulation",
            type: "optional",
            priorityId: null,
            reason: "Improve acoustics",
            quantityRelationship: "percentage_of_source",
            quantityValue: "37.5",
            dependency: false,
            active: false
          }
        ]
      },
      quality: {
        parameters: [
          {
            id: "quality-thickness",
            label: "Thickness",
            type: "number",
            unit: "mm",
            minimum: "9.5",
            maximum: "15",
            defaultValue: "12.5",
            required: true,
            category: "Dimensions",
            active: true
          },
          {
            id: "quality-finish",
            label: "Finish",
            type: "dropdown",
            allowedValues: ["Matte", "Satin"],
            defaultValue: "Satin",
            required: false,
            active: true
          }
        ]
      },
      execution: {
        steps: [{ id: "step-measure", name: "Measure", active: true }],
        productivity: [
          { id: "productivity-one", value: "12.25", uomId: "uom-hour", active: true }
        ]
      },
      advanced: {
        dependencies: [{ id: "dependency-one", targetMainLineId: "line-trim", active: true }],
        modeOverrides: [
          { id: "override-pmc", modeId: "mode-pmc", description: "PMC procurement", active: true },
          { id: "override-labour", modeId: "mode-labour", description: "Labour only", active: false }
        ]
      }
    },
    masters: {
      modes: [
        master("mode-labour", "Labour contract", 20),
        master("mode-inactive-unreferenced", "Old mode", 5, "inactive"),
        master("mode-empty", "Material only", 30),
        master("mode-pmc", "PMC", 10)
      ],
      uoms: [master("uom-hour", "Hour", 20), master("uom-sheet", "Sheet", 10)],
      vendors: [
        master("vendor-south", "Southern Supply", 20),
        master("vendor-north", "Northern Supply", 10)
      ],
      surfaces: [master("surface-wall", "Wall", 10)],
      priorities: [master("priority-high", "High", 10)],
      taxes: [
        {
          ...master("tax-gst", "GST", 10),
          taxVersions: [
            {
              id: "tax-gst-v3",
              taxRuleId: "tax-gst",
              versionNumber: 3,
              rateBps: 1_800,
              treatment: "exclusive",
              applicability: "materials",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
              effectiveTo: null,
              status: "active",
              version: 1,
              createdById: "actor-created",
              updatedById: "actor-updated",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }
          ]
        }
      ]
    },
    baskets: [
      { id: "basket-insulation", name: "Insulation systems" },
      { id: "basket-finishes", name: "Finish accessories" }
    ],
    items: [
      { mainLineId: "line-insulation", mainLineName: "Acoustic insulation" },
      { mainLineId: "line-trim", mainLineName: "Perimeter trim" }
    ],
    completeness: {
      percentage: 71,
      sections: [
        { sectionKey: "pricing", state: "complete", findings: [] },
        {
          sectionKey: "quantity-margin",
          state: "needs_attention",
          findings: []
        },
        { sectionKey: "scope", state: "complete", findings: [] },
        { sectionKey: "recommendations", state: "complete", findings: [] },
        { sectionKey: "quality", state: "complete", findings: [] },
        { sectionKey: "execution", state: "complete", findings: [] },
        { sectionKey: "advanced", state: "complete", findings: [] }
      ],
      blockers: [
        {
          code: "MARGIN_REVIEW",
          sectionKey: "quantity-margin",
          message: "Review bottom margin.",
          blocking: true
        }
      ],
      warnings: []
    }
  };
}

describe("projectKnowledgeOverviewSummary", () => {
  it("projects asymmetric Specification, Recommendation, Quality, and section-card details through stable IDs", () => {
    const summary = projectKnowledgeOverviewSummary(asymmetricInput());

    expect(summary.specificationOptions.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "spec-fire", label: "Fire-rated board" },
      { id: "spec-acoustic", label: "Acoustic board" }
    ]);
    expect(summary.specificationDetails[0]).toEqual({
      option: { id: "spec-fire", label: "Fire-rated board", state: "available" },
      description: "Two layers"
    });
    expect(summary.priceDetails[0]).toMatchObject({
      id: "price-pmc",
      inputAmountPaise: 12_345,
      mode: { id: "mode-pmc", label: "PMC" },
      vendor: { id: "vendor-north", label: "Northern Supply" },
      taxVersion: { id: "tax-gst-v3", label: "Version 3" }
    });
    expect(summary.priceDetails[1]).toMatchObject({
      id: "price-labour",
      versionNumber: 7,
      inputAmountPaise: 987_654,
      baseAmountPaise: 900_001,
      taxAmountPaise: 87_653,
      totalAmountPaise: 987_654,
      reviewRequired: true
    });

    expect(summary.recommendationOptions.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "recommendation-trim", label: "Perimeter trim" },
      { id: "recommendation-insulation", label: "Acoustic insulation" }
    ]);
    expect(summary.recommendationDetails[1]).toMatchObject({
      targetBasket: { id: "basket-insulation", label: "Insulation systems" },
      targetMainLine: { id: "line-insulation", label: "Acoustic insulation" },
      quantityValue: "37.5",
      dependency: false,
      active: false
    });
    expect(summary.qualityDetails).toEqual([
      expect.objectContaining({
        id: "quality-thickness",
        label: "Thickness",
        type: "number",
        unit: "mm",
        minimum: "9.5",
        maximum: "15",
        defaultValue: "12.5",
        required: true
      }),
      expect.objectContaining({
        id: "quality-finish",
        allowedValues: ["Matte", "Satin"],
        defaultValue: "Satin"
      })
    ]);

    expect(summary.sectionCards.map(({ key, sourceState, hasConfiguredContent }) => ({
      key,
      sourceState,
      hasConfiguredContent
    }))).toEqual([
      { key: "mode", sourceState: "available", hasConfiguredContent: true },
      { key: "scope", sourceState: "available", hasConfiguredContent: true },
      { key: "recommendations", sourceState: "available", hasConfiguredContent: true },
      { key: "quality", sourceState: "available", hasConfiguredContent: true },
      { key: "execution", sourceState: "available", hasConfiguredContent: true },
      { key: "advanced", sourceState: "available", hasConfiguredContent: true }
    ]);
    expect(summary.sectionCards[0]).toMatchObject({
      completeness: [
        { sectionKey: "pricing", state: "complete" },
        { sectionKey: "quantity-margin", state: "needs_attention" }
      ],
      blockers: [{ code: "MARGIN_REVIEW", message: "Review bottom margin." }]
    });
  });

  it("projects legacy and typed Specifications as descriptive compatibility rows only", () => {
    const summary = projectKnowledgeOverviewSummary({
      sections: {
        pricing: {
          specifications: [
            { id: "spec-legacy", name: "Legacy specification", description: "Legacy help" },
            {
              id: "spec-checkbox",
              name: "Requires inspection",
              description: "Saved checkbox help",
              type: "checkbox",
              options: [],
              value: false
            },
            {
              id: "spec-number",
              name: "Minimum clearance",
              type: "number",
              options: [],
              value: "0"
            },
            {
              id: "spec-blank",
              name: "Optional note",
              description: "   ",
              type: "text",
              options: [],
              value: "   "
            }
          ],
          priceEntries: []
        }
      }
    });

    expect(summary.specificationOptions.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "spec-legacy", label: "Legacy specification" },
      { id: "spec-checkbox", label: "Requires inspection" },
      { id: "spec-number", label: "Minimum clearance" },
      { id: "spec-blank", label: "Optional note" }
    ]);
    expect(summary.specificationDetails).toEqual([
      expect.objectContaining({ description: "Legacy help" }),
      expect.objectContaining({ description: "Saved checkbox help" }),
      expect.objectContaining({ description: null }),
      expect.objectContaining({ description: null })
    ]);
    expect(JSON.stringify(summary.specificationDetails)).not.toContain('"type"');
    expect(JSON.stringify(summary.specificationDetails)).not.toContain('"options"');
    expect(JSON.stringify(summary.specificationDetails)).not.toContain('"value"');
    expect(JSON.stringify(summary.specificationDetails)).not.toContain('"prices"');
  });

  it("keeps generic price Mode IDs out of the fixed dynamic selector and quantity-margin values shared", () => {
    const summary = projectKnowledgeOverviewSummary(asymmetricInput());

    expect(summary.modeOptions).toEqual([]);
    expect(summary.modeDetails).toEqual([]);
    expect(summary.priceDetails.map(({ id, mode }) => ({ id, modeId: mode?.id }))).toEqual([
      { id: "price-pmc", modeId: "mode-pmc" },
      { id: "price-labour", modeId: "mode-labour" }
    ]);
    expect(summary.sharedQuantityMargin).toEqual({
      gapBehavior: "reject",
      startMarginBps: 1_111,
      bottomMarginBps: 2_222,
      pmcMarkupBps: 3_333,
      wastageBps: 4_444,
      slabRateCount: 0,
      quantitySlabs: [
        {
          id: "slab-low",
          minimumQuantity: "0.125",
          maximumQuantity: "50.75",
          adjustmentBps: 555
        }
      ]
    });
    expect(summary.hasSharedQuantityMargin).toBe(true);
  });

  it("projects dynamic fields only through their exact fixed Mode kind", () => {
    const summary = projectKnowledgeOverviewSummary({
      sections: {
        advanced: {
          modeConfigurations: [
            {
              id: "configuration-pmc-asymmetric",
              modeKind: "pmc",
              fields: [
                { id: "field-pmc-mark", type: "text", label: "PMC mark", options: [], value: "A1" },
                { id: "field-pmc-empty", type: "text", label: "Empty note", options: [], value: "" },
                { id: "field-pmc-check", type: "checkbox", label: "Reviewed", options: [], value: false }
              ]
            },
            {
              id: "configuration-execution-asymmetric",
              modeKind: "execution",
              executionSource: "sub_vendor",
              fields: [
                { id: "field-execution-phase", type: "dropdown", label: "Execution phase", options: ["Install"], value: "Install" }
              ]
            }
          ]
        }
      }
    });

    expect(summary.modeOptions.map(({ id }) => id)).toEqual([
      "pmc",
      "execution"
    ]);
    expect(summary.modeDetails.find(({ option }) => option.id === "pmc")?.dynamicFields).toEqual([
      { id: "field-pmc-mark", label: "PMC mark", type: "text", options: [] },
      { id: "field-pmc-empty", label: "Empty note", type: "text", options: [] },
      { id: "field-pmc-check", label: "Reviewed", type: "checkbox", options: [] }
    ]);
    expect(summary.modeDetails.find(({ option }) => option.id === "execution")?.dynamicFields)
      .toEqual([]);
    expect(summary.modeDetails.find(({ option }) => option.id === "execution")?.executionSources)
      .toEqual([{
        source: "sub_vendor",
        label: "Sub-Vendor",
        dynamicFields: [{
          id: "field-execution-phase",
          label: "Execution phase",
          type: "dropdown",
          options: ["Install"]
        }]
      }]);
    expect(JSON.stringify(summary.modeDetails)).not.toContain('"value"');
  });

  it("keeps resolved and unresolved legacy definitions as explicit non-ID recovery", () => {
    const sections = {
      advanced: {
        modeConfigurations: [{
          id: "configuration-legacy-pmc",
          modeId: "legacy-pmc-id",
          fields: [{ id: "field-legacy-pmc", type: "text", label: "Legacy mark", options: [], value: "A1" }]
        }]
      }
    } as const;
    const resolved = projectKnowledgeOverviewSummary({
      sections,
      masters: {
        modes: [{ ...master("legacy-pmc-id", "Historical PMC", 10), code: "PMC" }]
      }
    });
    const unresolved = projectKnowledgeOverviewSummary({ sections, masters: { modes: [] } });

    expect(resolved.modeOptions).toEqual([]);
    expect(resolved.modeDetails).toEqual([]);
    expect(resolved.modeRecoveryDetails).toEqual([{
      key: "configuration-legacy-pmc",
      label: "Saved PMC configuration",
      state: "unavailable",
      dynamicFields: [{
        id: "field-legacy-pmc",
        label: "Legacy mark",
        type: "text",
        options: []
      }]
    }]);
    expect(resolved.legacyModeMappingRequired).toBe(false);
    expect(unresolved.modeOptions).toEqual([]);
    expect(unresolved.modeDetails).toEqual([]);
    expect(unresolved.modeRecoveryDetails).toEqual([{
      key: "configuration-legacy-pmc",
      label: "Saved Mode configuration 1",
      state: "unavailable",
      dynamicFields: [{
        id: "field-legacy-pmc",
        label: "Legacy mark",
        type: "text",
        options: []
      }]
    }]);
    expect(unresolved.legacyModeMappingRequired).toBe(true);
    expect(JSON.stringify(unresolved.modeRecoveryDetails)).not.toContain("legacy-pmc-id");
  });

  it("prefers canonical Mode values and exposes a resolved legacy collision separately", () => {
    const summary = projectKnowledgeOverviewSummary({
      sections: {
        advanced: {
          modeConfigurations: [{
            id: "configuration-legacy-pmc",
            modeId: "legacy-pmc-id",
            fields: [{ id: "field-legacy-pmc", type: "text", label: "Legacy mark", options: [], value: "Legacy" }]
          }, {
            id: "configuration-canonical-pmc",
            modeKind: "pmc",
            fields: [{ id: "field-canonical-pmc", type: "text", label: "Canonical mark", options: [], value: "Canonical" }]
          }]
        }
      },
      masters: {
        modes: [{ ...master("legacy-pmc-id", "Historical PMC", 10), code: "PMC" }]
      }
    });

    expect(summary.modeOptions).toEqual([
      { id: "pmc", label: "PMC", state: "available" }
    ]);
    expect(summary.modeDetails[0]?.dynamicFields).toEqual([
      { id: "field-canonical-pmc", label: "Canonical mark", type: "text", options: [] }
    ]);
    expect(summary.modeRecoveryDetails).toEqual([{
      key: "configuration-legacy-pmc",
      label: "Saved PMC configuration",
      state: "unavailable",
      dynamicFields: [{
        id: "field-legacy-pmc",
        label: "Legacy mark",
        type: "text",
        options: []
      }]
    }]);
    expect(summary.legacyModeMappingRequired).toBe(false);
    expect(JSON.stringify(summary.modeRecoveryDetails)).not.toContain('"value"');
  });

  it("keeps unresolved generic Mode references out of the fixed selector and raw IDs out of labels", () => {
    const input = asymmetricInput();
    const sections = input.sections as Record<string, KnowledgeJsonObject>;
    const overview = sections.overview;
    const advanced = sections.advanced;
    const summary = projectKnowledgeOverviewSummary({
      ...input,
      sections: {
        ...input.sections,
        overview: { ...overview, modeIds: ["mode-inactive-unreferenced", "mode-missing"] },
        advanced: {
          ...advanced,
          modeOverrides: [
            { id: "override-missing", modeId: "mode-missing", description: "Historical", active: true }
          ]
        }
      }
    });

    expect(summary.modeOptions).toEqual([]);
    const modeCard = summary.sectionCards.find(({ key }) => key === "mode");
    expect(modeCard?.highlights).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Modes", state: "unavailable" })
    ]));
    expect(JSON.stringify(modeCard)).not.toContain("mode-missing");
  });

  it("uses explicit unavailable states for unresolved relationships and never substitutes an ID as a label", () => {
    const summary = projectKnowledgeOverviewSummary({
      sections: {
        pricing: {
          specifications: [{ id: "spec-unlabelled" }],
          priceEntries: [
            {
              operation: "append",
              priceEntryId: "price-unresolved",
              specificationId: "spec-unlabelled",
              modeId: "mode-unresolved",
              vendorId: "vendor-unresolved",
              inputAmountPaise: 101
            }
          ]
        },
        recommendations: {
          recommendations: [
            {
              id: "recommendation-unresolved",
              targetBasketId: "basket-unresolved",
              targetMainLineId: "line-unresolved"
            }
          ]
        }
      }
    });

    expect(summary.specificationOptions[0]).toEqual({
      id: "spec-unlabelled",
      label: KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL,
      state: "unavailable"
    });
    expect(summary.priceDetails[0]).toMatchObject({
      mode: { id: "mode-unresolved", label: KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL, state: "unavailable" },
      vendor: { id: "vendor-unresolved", label: KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL, state: "unavailable" }
    });
    expect(summary.recommendationDetails[0]).toMatchObject({
      option: { label: KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL, state: "unavailable" },
      targetBasket: { label: KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL, state: "unavailable" },
      targetMainLine: { label: KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL, state: "unavailable" }
    });
    const allLabels = [
      ...summary.specificationOptions,
      ...summary.modeOptions,
      ...summary.recommendationOptions
    ].map(({ label }) => label);
    expect(allLabels).not.toEqual(expect.arrayContaining([
      "spec-unlabelled",
      "mode-unresolved",
      "line-unresolved"
    ]));
  });

  it("projects a saved zero-value price even when it has no Specification", () => {
    const summary = projectKnowledgeOverviewSummary({
      sections: {
        pricing: {
          specifications: [],
          priceEntries: [
            {
              operation: "append",
              priceEntryId: "price-unassigned",
              vendorId: "vendor-unresolved",
              inputAmountPaise: 0
            }
          ]
        }
      }
    });

    expect(summary.specificationDetails).toEqual([]);
    expect(summary.priceDetails).toEqual([
      expect.objectContaining({
        id: "price-unassigned",
        specification: null,
        inputAmountPaise: 0,
        vendor: {
          id: "vendor-unresolved",
          label: KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL,
          state: "unavailable"
        }
      })
    ]);
    expect(summary.priceDetails[0]?.vendor?.label).not.toBe("vendor-unresolved");
    expect(summary.sectionCards.find(({ key }) => key === "mode")).toMatchObject({
      hasConfiguredContent: true,
      counts: [{ label: "Budgets", value: 1 }]
    });
  });

  it("is deterministic for partial payloads and does not mutate any source array or object", () => {
    const pricing: KnowledgeJsonObject = {
      specifications: [{ id: "spec-one", name: "One" }],
      priceEntries: []
    };
    const modes = [
      master("mode-second", "Second", 2),
      master("mode-first", "First", 1)
    ];
    const input: KnowledgeOverviewSummaryInput = {
      sections: { pricing },
      masters: { modes }
    };
    const before = JSON.stringify(input);

    const first = projectKnowledgeOverviewSummary(input);
    const second = projectKnowledgeOverviewSummary(input);

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    expect(input.sections.pricing).toBe(pricing);
    expect(input.masters?.modes).toBe(modes);
    expect(modes.map(({ id }) => id)).toEqual(["mode-second", "mode-first"]);
    expect(first.modeOptions).toEqual([]);
    expect(first.sectionCards.find(({ key }) => key === "mode")?.sourceState).toBe("partial");
    expect(first.sectionCards.find(({ key }) => key === "scope")?.sourceState).toBe("unavailable");
    expect(first.sharedQuantityMargin).toEqual({
      gapBehavior: null,
      startMarginBps: null,
      bottomMarginBps: null,
      pmcMarkupBps: null,
      wastageBps: null,
      slabRateCount: 0,
      quantitySlabs: []
    });
    expect(first.hasSharedQuantityMargin).toBe(false);
  });
});

describe("hasMeaningfulKnowledgeValue", () => {
  it("rejects absent, blank, empty, and recursively empty values", () => {
    expect(hasMeaningfulKnowledgeValue(undefined)).toBe(false);
    expect(hasMeaningfulKnowledgeValue(null)).toBe(false);
    expect(hasMeaningfulKnowledgeValue("   ")).toBe(false);
    expect(hasMeaningfulKnowledgeValue([])).toBe(false);
    expect(hasMeaningfulKnowledgeValue({})).toBe(false);
    expect(
      hasMeaningfulKnowledgeValue({
        blank: " ",
        nested: { missing: null, values: [] },
        rows: [{ label: "", details: {} }]
      })
    ).toBe(false);
  });

  it("keeps zero, false, and a partial saved row with a stable ID meaningful", () => {
    expect(hasMeaningfulKnowledgeValue(0)).toBe(true);
    expect(hasMeaningfulKnowledgeValue(false)).toBe(true);
    expect(hasMeaningfulKnowledgeValue({ amountPaise: 0 })).toBe(true);
    expect(hasMeaningfulKnowledgeValue({ dependency: false })).toBe(true);
    expect(hasMeaningfulKnowledgeValue({ rows: [{ id: "row-stable" }] })).toBe(true);
  });
});

describe("configured-only Overview metadata", () => {
  it("does not treat empty payloads, completeness, or available masters as configured", () => {
    const summary = projectKnowledgeOverviewSummary({
      sections: {
        overview: { uomId: "", modeIds: [], surfaceIds: [] },
        pricing: { specifications: [], priceEntries: [] },
        "quantity-margin": {
          gapBehavior: "",
          startMarginBps: null,
          bottomMarginBps: null,
          pmcMarkupBps: null,
          wastageBps: null,
          quantitySlabs: []
        },
        scope: { modeIds: [], surfaceIds: [], exclusions: [] },
        recommendations: { recommendations: [] },
        quality: { parameters: [] },
        execution: { steps: [], productivity: [] },
        advanced: { dependencies: [], modeOverrides: [] }
      },
      masters: { modes: [master("mode-active", "Active but unused", 1)] },
      completeness: {
        percentage: 100,
        sections: [
          { sectionKey: "scope", state: "complete", findings: [] },
          { sectionKey: "quality", state: "complete", findings: [] }
        ],
        blockers: [],
        warnings: []
      }
    });

    expect(summary.sectionCards.every(({ hasConfiguredContent }) => !hasConfiguredContent)).toBe(true);
    expect(summary.sectionCards.every(({ counts }) => counts.length === 0)).toBe(true);
    expect(summary.sectionCards.every(({ highlights }) => highlights.length === 0)).toBe(true);
    expect(summary.modeOptions).toEqual([]);
    expect(summary.hasSharedQuantityMargin).toBe(false);
  });

  it("keeps shared zero values and stable partial rows configured without inventing counts", () => {
    const summary = projectKnowledgeOverviewSummary({
      sections: {
        "quantity-margin": { pmcMarkupBps: 0 },
        quality: { parameters: [{ id: "parameter-partial" }] }
      }
    });

    expect(summary.hasSharedQuantityMargin).toBe(true);
    expect(summary.sharedQuantityMargin.pmcMarkupBps).toBe(0);
    expect(summary.sectionCards.find(({ key }) => key === "mode")?.hasConfiguredContent).toBe(true);
    expect(summary.sectionCards.find(({ key }) => key === "quality")).toMatchObject({
      hasConfiguredContent: true,
      counts: [{ label: "Parameters", value: 1 }]
    });
  });

  it("counts priced and legacy Quantity slabs together without projecting priced details", () => {
    const summary = projectKnowledgeOverviewSummary({
      sections: {
        "quantity-margin": {
          quantitySlabs: [{ id: "legacy-1" }],
          slabRates: [
            { id: "priced-1", specificationId: "spec-1", uomId: "uom-1", quantity: "2", unitRatePaise: 500 },
            { id: "priced-2", specificationId: "spec-2", uomId: "uom-1", quantity: "3", unitRatePaise: 700 }
          ]
        }
      }
    });

    expect(summary.sharedQuantityMargin.slabRateCount).toBe(2);
    expect(summary.sectionCards.find(({ key }) => key === "mode")?.counts)
      .toContainEqual({ label: "Quantity slabs", value: 3 });
  });

  it('preserves a genuinely saved highlight label exactly "Not configured"', () => {
    const summary = projectKnowledgeOverviewSummary({
      sections: {
        execution: {
          steps: [{ id: "step-sentinel-label", name: "Not configured" }],
          productivity: []
        }
      }
    });

    expect(summary.sectionCards.find(({ key }) => key === "execution")).toMatchObject({
      hasConfiguredContent: true,
      highlights: [
        {
          label: "Steps",
          value: "Not configured",
          state: "available"
        }
      ]
    });
  });
});
