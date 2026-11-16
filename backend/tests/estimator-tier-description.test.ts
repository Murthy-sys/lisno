import { describe, expect, it } from "vitest";
import { projectEstimatorTierDescription } from "../src/domain/estimator-tier-description.js";

const configured = (payload: Record<string, unknown>, applicability = "configured") => ({ applicability, payload });
const section = (payload: Record<string, unknown>, applicability = "configured") => ({ sectionKey: "advanced", ...configured(payload, applicability) });
const pmc = (name = "Transport") => ({ id: "pmc", modeKind: "pmc", fields: [],
  inclusions: [{ id: "included", name, selected: true }], exclusions: [] });
const withDefault = (payload: Record<string, unknown> = {}) => section({ ...payload,
  tierConfigurations: { default: configured({ modeDescription: "Default Mode paragraph." }) } });

describe("estimator tier description", () => {
  it("keeps custom text, line breaks and literal markup without exposing other fields", () => {
    const text = "Bespoke work <em>as specified</em>.\nSecond paragraph.";
    expect(projectEstimatorTierDescription(section({ modeDescription: text, internalNotes: "PRIVATE", cost: 123 }), "signature", "Ceiling"))
      .toBe(text);
  });

  it("keeps each selected tier's own paragraph independent of default Mode", () => {
    const source = section({ modeDescription: "Signature paragraph.", tierConfigurations: {
      premium: configured({ modeDescription: "Premium paragraph." }),
      functional: configured({ modeDescription: "Functional paragraph." }),
      default: configured({ modeDescription: "Default paragraph." })
    } });
    for (const tier of ["signature", "premium", "functional"] as const) {
      expect(projectEstimatorTierDescription(source, tier, "Ceiling")).toBe(`${tier[0]!.toUpperCase()}${tier.slice(1)} paragraph.`);
    }
  });

  it("generates from saved canonical scopes and synchronizes custom wording using those same scopes", () => {
    const configurations = [pmc(), { id: "house", modeKind: "execution", executionSource: "in_house", fields: [],
      inclusions: [{ id: "supplier", name: "Supplier", selected: true }], exclusions: [{ id: "labour", name: "Labour", selected: true }] }];
    const payload = { modeConfigurations: configurations, modeDescription: null };
    expect(projectEstimatorTierDescription(withDefault(payload), "signature", "Ceiling"))
      .toBe("Providing, Supplying, Fixing, testing and commissioning of Ceiling, inclusions Transport and exclusions none. In-house inclusions: Supplier. In-house exclusions: Labour.");
    expect(projectEstimatorTierDescription(section({ ...payload, modeDescription: "Custom finish. Inclusions: none. Exclusions: none." }), "signature", "Ceiling"))
      .toBe("Custom finish. Inclusions: Transport. Exclusions: none. In-house Inclusions: Supplier. In-house Exclusions: Labour.");
  });

  it("recognizes saved Sub-vendor configuration but never emits its private fields", () => {
    const source = section({ modeConfigurations: [{ id: "vendor", modeKind: "execution", executionSource: "sub_vendor", fields: [
      { id: "private", type: "text", label: "Internal cost", options: [], value: "PRIVATE" }
    ] }] });
    expect(projectEstimatorTierDescription(source, "signature", "Ceiling"))
      .toBe("Providing, Supplying, Fixing, testing and commissioning of Ceiling, inclusions none and exclusions none.");
  });

  it.each([{}, { modeDescription: null }, { modeConfigurations: [] }, { modeDescription: null, modeConfigurations: [] }])(
    "uses Mode for ordinary missing description input %j", payload => {
      const source = withDefault(payload);
      for (const tier of ["signature", "premium", "functional"] as const) {
        expect(projectEstimatorTierDescription(source, tier, "Ceiling")).toBe("Default Mode paragraph.");
      }
    });

  it("can generate the fallback Mode paragraph from its own configuration", () => {
    const source = section({ tierConfigurations: { default: configured({ modeConfigurations: [pmc("Mode transport")] }) } });
    expect(projectEstimatorTierDescription(source, "premium", "Ceiling"))
      .toBe("Providing, Supplying, Fixing, testing and commissioning of Ceiling, inclusions Mode transport and exclusions none.");
  });

  it.each(["not_configured", "not_applicable"])("does not expose retained %s text or fall back over it", applicability => {
    for (const payload of [{ modeDescription: "Retained" }, { modeConfigurations: [pmc()] }]) {
      const source = withDefault(payload); source.applicability = applicability;
      expect(projectEstimatorTierDescription(source, "signature", "Ceiling")).toBeNull();
    }
    const empty = withDefault(); empty.applicability = applicability;
    expect(projectEstimatorTierDescription(empty, "signature", "Ceiling")).toBe("Default Mode paragraph.");
  });

  it.each([
    { modeDescription: " " }, { modeDescription: 12 }, { modeDescription: "a".repeat(4001) },
    { modeConfigurations: null }, { modeConfigurations: {} }, { modeConfigurations: [null] },
    { modeConfigurations: [pmc(), { ...pmc(), id: "duplicate-pmc" }] },
    { modeConfigurations: [{ ...pmc(), inclusions: [{ id: "bad", name: "Bad", selected: "true" }] }] },
    { modeConfigurations: [{ ...pmc(), inclusions: [{ id: "same", name: "Transport", selected: true }, { id: "same", name: "Other", selected: true }] }] },
    { modeConfigurations: [{ id: "old", modeId: "legacy-mode", fields: [] }] },
    { modeConfigurations: [{ id: "unscoped", modeKind: "execution", fields: [] }] },
    { modeConfigurations: [{ id: "house", modeKind: "execution", executionSource: "in_house", fields: [], inclusions: "invalid" }], inHouseComponents: [] }
  ])("keeps malformed/ambiguous selected input unavailable rather than borrowing Mode: %j", payload => {
    expect(projectEstimatorTierDescription(withDefault(payload), "signature", "Ceiling")).toBeNull();
  });

  it("bounds the final synchronized/generated paragraph instead of truncating or using Mode", () => {
    const longScopes = { ...pmc(), inclusions: Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, name: `${i}-${"x".repeat(230)}`, selected: true })) };
    expect(projectEstimatorTierDescription(withDefault({ modeConfigurations: [longScopes] }), "signature", "Ceiling")).toBeNull();
    expect(projectEstimatorTierDescription(withDefault({ modeDescription: "x".repeat(3990), modeConfigurations: [pmc()] }), "signature", "Ceiling")).toBeNull();
    expect(projectEstimatorTierDescription(section({ modeDescription: "x".repeat(4000) }), "signature", "Ceiling")).toHaveLength(4000);
  });

  it.each([null, [], {}, { sectionKey: "pricing", payload: {} }, { sectionKey: "advanced", applicability: "configured", payload: [] }])(
    "rejects invalid source sections %j", source => expect(projectEstimatorTierDescription(source, "signature", "Ceiling")).toBeNull());

  it.each([null, [], "broken", { payload: {} }, { applicability: "configured", payload: [] }])(
    "does not fall back over malformed named scope %j", premium => {
      const source = section({ tierConfigurations: { premium, default: configured({ modeDescription: "Do not borrow" }) } });
      expect(projectEstimatorTierDescription(source, "premium", "Ceiling")).toBeNull();
    });

  it.each([undefined, null, configured({}), configured({ modeDescription: 12 }), configured({ modeDescription: "Retained" }, "not_configured")])(
    "keeps absent, empty, malformed or disabled default unavailable: %j", defaultScope => {
      const source = section({ tierConfigurations: { default: defaultScope } });
      expect(projectEstimatorTierDescription(source, "signature", "Ceiling")).toBeNull();
    });

  it("does not invent a generic paragraph from only a name or another tier", () => {
    expect(projectEstimatorTierDescription(section({}), "signature", "Ceiling")).toBeNull();
    expect(projectEstimatorTierDescription(section({ modeDescription: "Signature only" }), "premium", "Ceiling")).toBeNull();
    expect(projectEstimatorTierDescription(section({ modeConfigurations: [pmc()] }), "signature", " ")).toBeNull();
  });
});
