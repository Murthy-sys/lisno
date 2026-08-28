import { describe, expect, it } from "vitest";

import { validateKnowledgeSection } from "./knowledgeSectionValidation";

describe("knowledge section client validation", () => {
  it("reports coupled pricing and effective-window errors", () => {
    const issues = validateKnowledgeSection("pricing", { priceEntries: [{ operation: "append", priceEntryId: "price-1", inputAmountPaise: -1, effectiveFrom: "2026-09-02T00:00:00.000Z", effectiveTo: "2026-09-01T00:00:00.000Z" }] });
    expect(issues.map(({ path }) => path)).toEqual(expect.arrayContaining(["priceEntries.0.vendorId", "priceEntries.0.inputAmountPaise", "priceEntries.0.effectiveTo"]));
  });

  it("rejects invalid quality defaults and cyclic execution graphs", () => {
    expect(validateKnowledgeSection("quality", { parameters: [{ id: "quality-1", type: "dropdown", label: "Finish", allowedValues: ["matte"], defaultValue: "gloss" }] })).toContainEqual(expect.objectContaining({ path: "parameters.0.defaultValue" }));
    const issues = validateKnowledgeSection("execution", { steps: [{ id: "step-1", name: "One", dependencyStepIds: ["step-2"] }, { id: "step-2", name: "Two", dependencyStepIds: ["step-1"] }] });
    expect(issues).toContainEqual(expect.objectContaining({ path: "steps" }));
  });

  it("accepts zero-valued paise and basis points", () => {
    expect(validateKnowledgeSection("pricing", { priceEntries: [{ operation: "append", priceEntryId: "price-1", vendorId: "vendor-1", uomId: "uom-1", taxRuleId: "tax-1", taxVersionId: "tax-v1", treatment: "exclusive", effectiveFrom: "2026-09-01T00:00:00.000Z", status: "active", inputAmountPaise: 0 }] })).toEqual([]);
    expect(validateKnowledgeSection("quantity-margin", { startMarginBps: 0, bottomMarginBps: 0 })).toEqual([]);
  });
});
