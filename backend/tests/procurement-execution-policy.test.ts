import { describe, expect, it } from "vitest";
import { procurementModeMatchesPolicy, resolveProcurementExecutionPolicy } from "../src/domain/procurement-execution-policy.js";

describe("approved PMC intent and Procurement execution choice", () => {
  it("keeps PMC restricted to vendor handoff", () => {
    const policy = resolveProcurementExecutionPolicy({ approvedPricingMode: "pmc" });
    expect(policy).toEqual({ intent: "pmc", allowedModes: ["pmc"] });
    expect(procurementModeMatchesPolicy(policy, "pmc")).toBe(true);
    expect(procurementModeMatchesPolicy(policy, "sub_vendor")).toBe(false);
    expect(procurementModeMatchesPolicy(policy, "in_house")).toBe(false);
  });
  it.each(["sub_vendor", "in_house"])("allows a separate execution choice for %s pricing", approvedPricingMode => {
    const policy = resolveProcurementExecutionPolicy({ approvedPricingMode });
    expect(policy).toEqual({ intent: "execution", allowedModes: ["sub_vendor", "in_house"] });
    expect(procurementModeMatchesPolicy(policy, null)).toBe(false);
    expect(procurementModeMatchesPolicy(policy, "pmc")).toBe(false);
    expect(procurementModeMatchesPolicy(policy, "sub_vendor")).toBe(true);
    expect(procurementModeMatchesPolicy(policy, "in_house")).toBe(true);
  });
  it.each([undefined, null, "standard", "special", "invalid"])("does not invent intent from %s", approvedPricingMode => {
    expect(resolveProcurementExecutionPolicy({ approvedPricingMode })).toEqual({ intent: "unrecorded", allowedModes: [] });
    expect(procurementModeMatchesPolicy(undefined, "sub_vendor")).toBe(false);
  });
  it("rejects invalid pricing metadata but does not let a retired classification override explicit PMC", () => {
    expect(resolveProcurementExecutionPolicy({ approvedPricingMode: "pmc",
      approvedModeIssues: [{ code: "ESTIMATE_PRICING_MODE_INVALID" }] }).allowedModes).toEqual([]);
    expect(resolveProcurementExecutionPolicy({ approvedPricingMode: "pmc",
      approvedModeIssues: [{ code: "ESTIMATE_CLASSIFICATION_INVALID" }] }).allowedModes).toEqual(["pmc"]);
  });
});
