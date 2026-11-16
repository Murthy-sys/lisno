import { describe, expect, it } from "vitest";
import { projectEstimatorTierDetails } from "../src/domain/estimator-tier-details.js";

const section = (payload: unknown, applicability = "configured") => ({ sectionKey: "pricing", applicability, payload });
const payload = (name = "Board", brand = "Brand A") => ({
  specifications: [{ id: "spec-board", name, brandId: "brand-a", description: "PRIVATE_DESCRIPTION", type: "text", value: "PRIVATE_VALUE" }],
  brands: [{ id: "brand-a", name: brand, description: "PRIVATE_BRAND_DESCRIPTION" }],
  costPaise: 12345, internalVendorNotes: "PRIVATE_NOTES"
});

describe("estimator tier details projection", () => {
  it("uses Mode specifications for empty Signature and absent additional tiers", () => {
    const modePayload = {
      specifications: [
        { id: "board", name: "Mode board", brandId: "brand-board" },
        { id: "finish", name: "Mode finish", brandId: "brand-finish" }
      ], brands: [{ id: "brand-board", name: "Mode board brand" }, { id: "brand-finish", name: "Mode finish brand" }]
    };
    const source = section({ specifications: [], tierConfigurations: {
      default: { applicability: "configured", payload: modePayload }
    } });
    for (const tier of ["signature", "premium", "functional"] as const) {
      expect(projectEstimatorTierDetails(source, tier)).toEqual({ specifications: [
        { id: "board", name: "Mode board", brands: [{ id: "brand-board", name: "Mode board brand" }] },
        { id: "finish", name: "Mode finish", brands: [{ id: "brand-finish", name: "Mode finish brand" }] }
      ] });
    }
  });

  it("projects only names and IDs from the selected tier, isolating reused local IDs and default Mode", () => {
    const source = section({ ...payload(), tierConfigurations: {
      premium: { applicability: "configured", payload: payload("Premium board", "Brand P") },
      functional: { applicability: "configured", payload: payload("Functional board", "Brand F") },
      default: { applicability: "configured", payload: payload("PRIVATE_DEFAULT", "PRIVATE_DEFAULT_BRAND") }
    } });
    for (const [tier, name, brand] of [["signature", "Board", "Brand A"], ["premium", "Premium board", "Brand P"], ["functional", "Functional board", "Brand F"]] as const) {
      expect(projectEstimatorTierDetails(source, tier)).toEqual({ specifications: [
        { id: "spec-board", name, brands: [{ id: "brand-a", name: brand }] }
      ] });
    }
    expect(JSON.stringify(projectEstimatorTierDetails(source, "signature"))).not.toMatch(/PRIVATE|costPaise|description|type|value/);
    expect(projectEstimatorTierDetails(section(payload("Other line", "Other line brand")), "signature")?.specifications[0])
      .toMatchObject({ name: "Other line", brands: [{ id: "brand-a", name: "Other line brand" }] });
  });

  it("preserves specification and association order, supports both association formats, and omits unassociated brands", () => {
    const source = section({
      specifications: [
        { id: "second", name: "<Board>", brandIds: ["b", "a"] },
        { id: "first", name: "Adhesive", brandId: "a" },
        { id: "none", name: "Unbranded" },
        { id: "empty", name: "Empty association", brandIds: [] }
      ], brands: [{ id: "a", name: "Brand A" }, { id: "b", name: "Brand B" }]
    });
    expect(projectEstimatorTierDetails(source, "signature")).toEqual({ specifications: [
      { id: "second", name: "<Board>", brands: [{ id: "b", name: "Brand B" }, { id: "a", name: "Brand A" }] },
      { id: "first", name: "Adhesive", brands: [{ id: "a", name: "Brand A" }] },
      { id: "none", name: "Unbranded", brands: [] },
      { id: "empty", name: "Empty association", brands: [] }
    ] });
  });

  it("keeps missing or ambiguous brand names explicitly unresolved", () => {
    const source = section({ specifications: [{ id: "spec", name: "Board", brandIds: ["missing", "duplicate", "blank", "good"] }], brands: [
      { id: "duplicate", name: "First" }, { id: "duplicate", name: "Second" }, { id: "duplicate", name: "Third" },
      { id: "blank", name: " " }, { id: "good", name: "Known" }
    ] });
    expect(projectEstimatorTierDetails(source, "signature")?.specifications[0]?.brands).toEqual([
      { id: "missing", name: null }, { id: "duplicate", name: null }, { id: "blank", name: null }, { id: "good", name: "Known" }
    ]);
    expect(projectEstimatorTierDetails(section({ specifications: [{ id: "spec", name: "Board", brandId: "missing" }], brands: "broken" }), "signature"))
      .toEqual({ specifications: [{ id: "spec", name: "Board", brands: [{ id: "missing", name: null }] }] });
  });

  it("distinguishes configured empty lists from missing or unconfigured tiers", () => {
    expect(projectEstimatorTierDetails(section({}), "signature")).toEqual({ specifications: [] });
    expect(projectEstimatorTierDetails(section({ specifications: [] }), "signature")).toEqual({ specifications: [] });
    expect(projectEstimatorTierDetails(section(payload(), "not_configured"), "signature")).toBeNull();
    expect(projectEstimatorTierDetails(section(payload()), "premium")).toBeNull();
    expect(projectEstimatorTierDetails(section({ tierConfigurations: { premium: { applicability: "configured", payload: {} } } }), "premium"))
      .toEqual({ specifications: [] });
    expect(projectEstimatorTierDetails(section({ tierConfigurations: { premium: { applicability: "not_configured", payload: payload() } } }), "premium")).toBeNull();
  });

  it("uses Mode for absent or empty lists, including unconfigured empty scopes", () => {
    const expected = { specifications: [{ id: "spec-board", name: "Mode board", brands: [{ id: "brand-a", name: "Mode brand" }] }] };
    for (const applicability of ["configured", "not_configured", "not_applicable"]) {
      for (const empty of [{}, { specifications: [] }]) {
        const source = section({ ...empty, tierConfigurations: {
          default: { applicability: "configured", payload: payload("Mode board", "Mode brand") },
          premium: { applicability, payload: empty }, functional: { applicability, payload: empty }
        } }, applicability);
        for (const tier of ["signature", "premium", "functional"] as const) {
          expect(projectEstimatorTierDetails(source, tier)).toEqual(expected);
        }
      }
    }
  });

  it("keeps retained disabled specifications unavailable even when Mode has details", () => {
    for (const applicability of ["not_configured", "not_applicable"]) {
      const source = section({ ...payload("Retained", "Retained brand"), tierConfigurations: {
        default: { applicability: "configured", payload: payload("Mode board", "Mode brand") },
        premium: { applicability, payload: payload("Retained premium", "Retained premium brand") }
      } }, applicability);
      expect(projectEstimatorTierDetails(source, "signature")).toBeNull();
      expect(projectEstimatorTierDetails(source, "premium")).toBeNull();
    }
  });

  it.each([
    null, [], {}, { applicability: "configured" }, { applicability: "configured", payload: null },
    { applicability: "configured", payload: [] }, { applicability: "unknown", payload: {} },
    { applicability: ["configured"], payload: {} }
  ])("does not treat a malformed present tier namespace as absent: %j", premium => {
    expect(projectEstimatorTierDetails(section({ tierConfigurations: {
      default: { applicability: "configured", payload: payload("Mode board", "Mode brand") }, premium
    } }), "premium")).toBeNull();
  });

  it.each([null, [], "invalid"])("rejects a malformed namespace container: %j", tierConfigurations => {
    expect(projectEstimatorTierDetails(section({ tierConfigurations }), "premium")).toBeNull();
  });

  it.each([
    { specifications: null }, { specifications: {} }, { specifications: [null] },
    { specifications: [{ id: "a", name: "A" }, { id: "a", name: "Duplicate" }] },
    { specifications: [{ id: "a", name: "A", brandId: "brand-a", brandIds: ["brand-a"] }] }
  ])("does not hide malformed selected specifications with Mode fallback: %j", selected => {
    const source = section({ ...selected, tierConfigurations: {
      default: { applicability: "configured", payload: payload("Mode board", "Mode brand") },
      premium: { applicability: "configured", payload: selected }
    } });
    expect(projectEstimatorTierDetails(source, "signature")).toBeNull();
    expect(projectEstimatorTierDetails(source, "premium")).toBeNull();
  });

  it.each([
    undefined, null, {}, { applicability: "configured" }, { applicability: "configured", payload: null },
    { applicability: "configured", payload: {} }, { applicability: "configured", payload: { specifications: [] } },
    { applicability: "configured", payload: { specifications: [{ id: "a", name: " " }] } },
    { applicability: "not_configured", payload: payload() }, { applicability: "not_applicable", payload: payload() }
  ])("preserves original empty/unavailable states without a usable Mode list: %j", mode => {
    const source = section({ specifications: [], tierConfigurations: mode === undefined ? {} : { default: mode } });
    expect(projectEstimatorTierDetails(source, "signature")).toEqual({ specifications: [] });
    expect(projectEstimatorTierDetails(source, "premium")).toBeNull();
  });

  it("resolves all brands from the chosen scope without filling missing tier brands from Mode", () => {
    const source = section({ specifications: [{ id: "spec-board", name: "Tier board", brandId: "brand-a" }], tierConfigurations: {
      default: { applicability: "configured", payload: payload("Mode board", "Mode brand") },
      premium: { applicability: "configured", payload: { specifications: [] } }
    } });
    expect(projectEstimatorTierDetails(source, "signature")).toEqual({ specifications: [
      { id: "spec-board", name: "Tier board", brands: [{ id: "brand-a", name: null }] }
    ] });
    const fallback = projectEstimatorTierDetails(source, "premium");
    expect(fallback).toEqual({ specifications: [
      { id: "spec-board", name: "Mode board", brands: [{ id: "brand-a", name: "Mode brand" }] }
    ] });
    expect(JSON.stringify(fallback)).not.toMatch(/PRIVATE|costPaise|description|type|value/);
  });

  it.each([null, [], "invalid", { sectionKey: "advanced", applicability: "configured", payload: payload() },
    section(null), section([]), section({ specifications: null }), section({ specifications: {} }),
    section({ specifications: [null] }), section({ specifications: [{ id: "a", name: " " }] }),
    section({ specifications: [{ id: " a", name: "Board" }] }), section({ specifications: [{ id: 1, name: "Board" }] }),
    section({ specifications: [{ id: "a", name: "x".repeat(241) }] }),
    section({ specifications: [{ id: "a", name: "Board" }, { id: "a", name: "Duplicate" }] }),
    section({ specifications: Array.from({ length: 51 }, (_, i) => ({ id: String(i), name: "Board" })) })
  ])("does not hide malformed specification data behind a partial list: %j", source => {
    expect(projectEstimatorTierDetails(source, "signature")).toBeNull();
  });

  it.each([
    { brandId: "a", brandIds: ["a"] }, { brandId: "" }, { brandId: " a" }, { brandId: 1 },
    { brandIds: "a" }, { brandIds: null }, { brandIds: ["a", "a"] }, { brandIds: ["a", ""] },
    { brandIds: ["x".repeat(241)] }, { brandIds: Array.from({ length: 201 }, (_, i) => String(i)) }
  ])("rejects malformed or ambiguous associations: %j", association => {
    expect(projectEstimatorTierDetails(section({ specifications: [{ id: "spec", name: "Board", ...association }] }), "signature")).toBeNull();
  });

  it.each([undefined, null, [], "invalid"])("does not normalize an invalid tier payload to a configured empty list: %j", value => {
    expect(projectEstimatorTierDetails(section({ tierConfigurations: { premium: { applicability: "configured", payload: value } } }), "premium")).toBeNull();
  });
});
