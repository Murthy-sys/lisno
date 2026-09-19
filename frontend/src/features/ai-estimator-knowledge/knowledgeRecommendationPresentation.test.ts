import { describe, expect, it } from "vitest";
import { newRecommendationRule, recommendationAction, recommendationGroup, recommendationRemovalSummary } from "./knowledgeRecommendationPresentation";

describe("recommendation presentation", () => {
  it("keeps every existing trigger and action combination without mutating its identity or fields", () => {
    const rules = ["added", "removed"].flatMap((trigger) => ["add", "remove"].flatMap((action) => ["must", "can"].map((requirement) => ({
      id: `${trigger}-${action}-${requirement}`, trigger, action, requirement, reason: "Keep this explanation", active: false
    }))));
    const original = structuredClone(rules);
    expect(rules.map(recommendationGroup)).toEqual(["mandatory", "probable", "exclusions", "exclusions", "other", "other", "other", "other"]);
    expect(rules).toEqual(original);
    expect(recommendationAction(rules[2])).toBe("Required removal");
    expect(recommendationAction(rules[3])).toBe("Optional removal");
    expect(recommendationGroup({ trigger: "unknown", action: "unknown" })).toBe("other");
  });

  it("summarizes only a separately configured removal for the same stable target", () => {
    const addition = { ...newRecommendationRule("mandatory"), targetMainLineId: "lights" };
    const removal = { ...newRecommendationRule("other"), targetMainLineId: "lights", active: false };
    expect(recommendationRemovalSummary(addition, [addition])).toBe("Not configured");
    expect(recommendationRemovalSummary(addition, [addition, { ...removal, targetMainLineId: "other-lights" }])).toBe("Not configured");
    expect(recommendationRemovalSummary(addition, [addition, removal])).toBe("Required removal (disabled)");
    expect(recommendationRemovalSummary(removal, [addition, removal])).toBe("—");
    const subAddition = { ...addition, targetKind: "sub_basket", targetType: null, targetSubBasketId: "lighting", targetMainLineId: null };
    const subRemoval = { ...removal, targetKind: "sub_basket", targetType: null, targetSubBasketId: "lighting", targetMainLineId: null };
    expect(recommendationRemovalSummary(subAddition, [subAddition, subRemoval])).toBe("Required removal (disabled)");
    expect(recommendationRemovalSummary(subAddition, [subAddition, removal])).toBe("Not configured");
  });

  it("creates group defaults with distinct IDs and leaves target and explanation incomplete", () => {
    const mandatory = newRecommendationRule("mandatory");
    const probable = newRecommendationRule("probable");
    expect(mandatory).toMatchObject({ trigger: "added", action: "add", requirement: "must", targetKind: "main_line", targetMainLineId: null, reason: "" });
    expect(probable).toMatchObject({ trigger: "added", action: "add", requirement: "can" });
    expect(newRecommendationRule("exclusions")).toMatchObject({ trigger: "added", action: "remove", requirement: "must" });
    expect(newRecommendationRule("other")).toMatchObject({ trigger: "removed", action: "remove", requirement: "must" });
    expect(mandatory.id).not.toBe(probable.id);
  });
});
