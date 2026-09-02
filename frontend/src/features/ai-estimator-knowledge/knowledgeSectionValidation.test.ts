import { describe, expect, it } from "vitest";

import { validateKnowledgeSection } from "./knowledgeSectionValidation";

describe("knowledge section client validation", () => {
  it("reports coupled pricing and effective-window errors", () => {
    const issues = validateKnowledgeSection("pricing", { priceEntries: [{ operation: "set_budget", inputAmountPaise: -1, effectiveFrom: "2026-09-02T00:00:00.000Z", effectiveTo: "2026-09-01T00:00:00.000Z" }] });
    expect(issues.map(({ path }) => path)).toEqual(expect.arrayContaining(["priceEntries.0.vendorId", "priceEntries.0.inputAmountPaise", "priceEntries.0.effectiveTo"]));
    expect(issues.find(({ path }) => path === "priceEntries.0.inputAmountPaise")?.message).toBe("Enter a non-negative rupee amount with up to two decimal places.");
    expect(issues.find(({ path }) => path === "priceEntries.0.vendorId")?.message).toBe("Vendor is required.");
  });

  it("rejects invalid quality defaults and cyclic execution graphs", () => {
    expect(validateKnowledgeSection("quality", { parameters: [{ id: "quality-1", type: "dropdown", label: "Finish", allowedValues: ["matte"], defaultValue: "gloss" }] })).toContainEqual(expect.objectContaining({ path: "parameters.0.defaultValue" }));
    const issues = validateKnowledgeSection("execution", { steps: [{ id: "step-1", name: "One", dependencyStepIds: ["step-2"] }, { id: "step-2", name: "Two", dependencyStepIds: ["step-1"] }] });
    expect(issues).toContainEqual(expect.objectContaining({ path: "steps" }));
  });

  it.each([0, 1])("accepts the exact API amount boundary of %i paise", (inputAmountPaise) => {
    expect(validateKnowledgeSection("pricing", { priceEntries: [{ operation: "set_budget", vendorId: "vendor-1", uomId: "uom-1", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, inputAmountPaise }] })).toEqual([]);
  });

  it("accepts zero-valued basis points", () => {
    expect(validateKnowledgeSection("quantity-margin", { startMarginBps: 0, bottomMarginBps: 0 })).toEqual([]);
  });

  it("rejects amounts outside the safe integer paise boundary", () => {
    const issues = validateKnowledgeSection("pricing", { priceEntries: [{ operation: "set_budget", vendorId: "vendor-1", uomId: "uom-1", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, inputAmountPaise: Number.MAX_SAFE_INTEGER + 1 }] });
    expect(issues).toContainEqual(expect.objectContaining({ path: "priceEntries.0.inputAmountPaise" }));
  });

  it("blocks budget saves while a required master catalog is unavailable", () => {
    const issues = validateKnowledgeSection("pricing", {
      priceEntries: [{
        operation: "set_budget",
        vendorId: "vendor-1",
        uomId: "uom-1",
        inputAmountPaise: 0,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        effectiveTo: null
      }]
    }, {
      vendorCatalogStatus: "error",
      uomCatalogStatus: "loading"
    });

    expect(issues).toContainEqual({
      path: "priceEntries.0.vendorId",
      message: "Load Vendor options before saving this budget."
    });
    expect(issues).toContainEqual({
      path: "priceEntries.0.uomId",
      message: "Load Unit of measure options before saving this budget."
    });
  });

  it("maps invalid hidden reference lineage to one business-level issue", () => {
    expect(validateKnowledgeSection("pricing", {
      priceEntries: [{ operation: "reference", priceEntryId: "", priceVersionId: "" }]
    })).toEqual([{
      path: "priceEntries.0",
      message: "Saved budget details are unavailable. Reload Budgeting and try again."
    }]);
  });

  it("keeps complete legacy append commands valid for compatibility clients", () => {
    expect(validateKnowledgeSection("pricing", {
      priceEntries: [{
        operation: "append",
        priceEntryId: "price-1",
        vendorId: "vendor-1",
        uomId: "uom-1",
        taxRuleId: "tax-1",
        taxVersionId: "tax-v1",
        treatment: "exclusive",
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active",
        inputAmountPaise: 1
      }]
    })).toEqual([]);
  });

  it("validates priced slabs against live Specifications, UOM scale, uniqueness, and derived totals", () => {
    const context = {
      specifications: [{ id: "spec-1", name: "Plywood" }],
      uoms: [{
        id: "uom-1",
        masterType: "uoms" as const,
        code: "SQFT",
        name: "Square foot",
        description: null,
        displayOrder: 0,
        status: "active" as const,
        decimalScale: 2,
        version: 1,
        createdById: "super-admin-1",
        updatedById: "super-admin-1",
        createdAt: "2026-09-02T08:00:00.000Z",
        updatedAt: "2026-09-02T08:00:00.000Z"
      }],
      uomCatalogStatus: "ready" as const
    };
    expect(validateKnowledgeSection("quantity-margin", {
      slabRates: [{ id: "slab-1", specificationId: "spec-1", uomId: "uom-1", quantity: "12.5", unitRatePaise: 8_000 }]
    }, context)).toEqual([]);

    const issues = validateKnowledgeSection("quantity-margin", {
      slabRates: [
        { id: "slab-1", specificationId: "missing", uomId: "uom-1", quantity: "1", unitRatePaise: 1, estimatedCostPaise: 1 },
        { id: "slab-1", specificationId: "missing", uomId: "uom-1", quantity: "1.0", unitRatePaise: 1 }
      ]
    }, context);
    expect(issues.map(({ path }) => path)).toEqual(expect.arrayContaining([
      "slabRates.0.specificationId",
      "slabRates.0.estimatedCostPaise",
      "slabRates.1.id",
      "slabRates.1"
    ]));
  });

  it("blocks slab saves until the complete Unit catalog is available", () => {
    expect(validateKnowledgeSection("quantity-margin", {
      slabRates: [{ id: "slab-1", specificationId: "spec-1", uomId: "uom-1", quantity: "1", unitRatePaise: 0 }]
    }, {
      specifications: [{ id: "spec-1", name: "Plywood" }],
      uomCatalogStatus: "error"
    })).toContainEqual(expect.objectContaining({ path: "slabRates" }));
  });
});
