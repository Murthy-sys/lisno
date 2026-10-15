import { describe, expect, it } from "vitest";
import { DESIGN_RULE_KEYS, normalizeDesignRules, validateDesignRules, designRulesDigest, designRuleEstimateNotes } from "../src/domain/main-line-design-rules.js";
import { validateKnowledgeSectionPayload } from "../src/domain/ai-estimator-knowledge-validation.js";
import { deriveKnowledgeCompleteness } from "../src/domain/ai-estimator-knowledge-completeness.js";

describe("Main Line Design rules", () => {
  it("keeps absent legacy sections optional with all fourteen answers No", () => {
    expect(DESIGN_RULE_KEYS).toHaveLength(14);
    expect(Object.values(normalizeDesignRules().answers)).toEqual(Array(14).fill(false));
    expect(validateKnowledgeSectionPayload("design", {})).toEqual([]);
    const completeness = deriveKnowledgeCompleteness({ identity: { basketId: "basket", mainLineId: "line", uomId: "uom" }, sections: [] });
    expect(completeness.sections.find((section) => section.sectionKey === "design")).toEqual({ sectionKey: "design", state: "not_applicable", findings: [] });
    expect(completeness.warnings.some((finding) => finding.sectionKey === "design")).toBe(false);
  });
  it("defaults Custom vendor involvement to Yes while respecting an explicit No", () => {
    expect(normalizeDesignRules({ itemNature: "custom" }).answers.designerVendorSelection).toBe(true);
    expect(normalizeDesignRules({ itemNature: "custom", answers: { designerVendorSelection: false } }).answers.designerVendorSelection).toBe(false);
  });
  it.each(DESIGN_RULE_KEYS)("rejects a nonboolean %s choice", (key) => {
    expect(validateDesignRules({ answers: { [key]: "yes" } })).toContainEqual(expect.objectContaining({ path: `payload.answers.${key}` }));
  });
  it("requires a recorded vendor discussion and unique PO approval points", () => {
    expect(validateDesignRules({ answers: { vendorPreDiscussed: true, designerPoApproval: true } })).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "payload.discussedVendorId" }),
      expect.objectContaining({ path: "payload.details.vendorPreDiscussed" }),
      expect.objectContaining({ path: "payload.poApprovalChecklist" })
    ]));
    expect(validateDesignRules({ poApprovalChecklist: [{ id: "same", text: "Point one" }, { id: "same", text: "Point two" }] }))
      .toContainEqual(expect.objectContaining({ path: "payload.poApprovalChecklist.1.id" }));
    expect(validateDesignRules({ answers: { vendorPreDiscussed: true, designerPoApproval: true },
      discussedVendorId: "vendor-one", details: { vendorPreDiscussed: "Agreed on sample review." }, poApprovalChecklist: [{ id: "point-one", text: "Check the sample." }] })).toEqual([]);
  });
  it("allows only bounded known fields and never publishes internal notes", () => {
    expect(validateDesignRules({ answers: { imaginary: false }, details: { stockCheck: "a".repeat(4001) }, arbitrary: true }).length).toBe(3);
    const rules = normalizeDesignRules({ answers: { stockCheck: true, maintenanceAccess: true, substrateFixing: true, dimensionsClearances: true, vendorPreDiscussed: true },
      discussedVendorId: "vendor-secret", details: { vendorPreDiscussed: "INTERNAL-DISCUSSION", stockCheck: "INTERNAL-STOCK", maintenanceAccess: "Allow access for servicing." } });
    expect(designRuleEstimateNotes(rules)).toEqual([
      "This item is subject to availability at the time of procurement.", "Allow access for servicing.",
      "This item requires a particular substrate or fixing arrangement.", "This item requires special dimensions, tolerances or clearances."
    ]);
    expect(designRuleEstimateNotes({ answers: { maintenanceAccess: false }, details: { maintenanceAccess: "Inactive note" } })).toEqual([]);
  });
  it("digests normalized values deterministically and changes when obligations change", () => {
    expect(designRulesDigest({})).toBe(designRulesDigest(normalizeDesignRules()));
    expect(designRulesDigest({ answers: { stockCheck: true } })).not.toBe(designRulesDigest({}));
    expect(designRulesDigest({ details: { maintenanceAccess: " access " }, answers: { stockCheck: true } }))
      .toBe(designRulesDigest({ answers: { stockCheck: true }, details: { maintenanceAccess: "access" } }));
  });
});
