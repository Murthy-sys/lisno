import { describe, expect, it } from "vitest";
import { toEstimateAggregatePricing } from "../../../../shared/estimation/estimateAggregatePricing";
import { configuredAttributedAmountPaise, configuredLineAmountPaise, configuredTierUnavailableReason, configuredInHouseSelectionIssue,
  configuredComponentPricing, configuredAggregatePricing, updateConfiguredLinePricing, type ConfiguredLineDraft } from "./configuredEstimate";
import { componentDraftFixture } from "./estimateComponentPricing.testFixtures";

const governed = (mainLineId = "line-a", quantity = 2, totalPaise = 78333): ConfiguredLineDraft => {
  const line = componentDraftFixture(mainLineId, quantity, totalPaise);
  return { ...line, aggregatePricing: toEstimateAggregatePricing(line.componentPricing!), componentPricing: undefined,
    selectedInHouseComponentIds: undefined, inHouseComponents: undefined, inHouseUsage: "estimator", inHousePricingState: "ready" };
};
describe("governed aggregate estimation", () => {
  it("keeps ready preset prices selectable with no exposed component list or unit base rate", () => {
    const line = governed();
    expect(configuredTierUnavailableReason(line, "signature", "in_house")).toBeNull();
    expect(configuredInHouseSelectionIssue(line)).toBeNull();
    expect(configuredLineAmountPaise(line)).toBe(78333);
    expect(configuredComponentPricing(line)).toBeNull();
    expect(configuredAggregatePricing(line)?.totalPaise).toBe(78333);
  });
  it("reconciles two unequal aggregate lines under their own source basket without hidden target attribution", () => {
    const a = governed(), b = governed("line-b", 3, 45679);
    expect(configuredAttributedAmountPaise([a, b], "basket-source", "sub-source")).toBe(124012);
    expect(configuredAttributedAmountPaise([a, b], "basket-target", "sub-target")).toBe(0);
    expect(configuredLineAmountPaise({ ...a, inHouseUsage: "execution" })).toBe(78333);
  });
  it("rejects client-side selection changes and stale calculations after quantity changes", () => {
    const line = governed();
    expect(updateConfiguredLinePricing(line, { selectedInHouseComponentIds: ["hidden"] })).toBe(line);
    const changed = updateConfiguredLinePricing(line, { quantity: 3 });
    expect(changed.aggregatePricing).toBeUndefined();
    expect(configuredLineAmountPaise(changed)).toBeNull();
    expect(changed.rateInput).toBe("");
  });
  it("requires explicit price refresh even after another input changes", () => {
    const line = { ...governed(), configurationPricingChanged: true };
    expect(configuredLineAmountPaise(line)).toBeNull();
    expect(updateConfiguredLinePricing(line, { quantity: 3 }).configurationPricingChanged).toBe(true);
  });
  it("fails explicitly for incomplete or invalid presets without falling back to unit price", () => {
    for (const state of ["incomplete", "invalid"] as const) {
      const line = { ...governed(), aggregatePricing: undefined, inHousePricingState: state, rateInput: "500" };
      expect(configuredInHouseSelectionIssue(line)).toContain("Configuration");
      expect(configuredTierUnavailableReason(line, "signature", "in_house")).toBe("Price not configured");
      expect(configuredLineAmountPaise(line)).toBeNull();
    }
  });
});
