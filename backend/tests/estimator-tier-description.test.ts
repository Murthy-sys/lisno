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

  it("preserves saved wording without synchronizing or appending scope lists", () => {
    const configurations = [pmc(), { id: "house", modeKind: "execution", executionSource: "in_house", fields: [],
      inclusions: [{ id: "supplier", name: "Supplier", selected: true }], exclusions: [{ id: "labour", name: "Labour", selected: true }] }];
    const payload = { modeConfigurations: configurations, modeDescription: null };
    expect(projectEstimatorTierDescription(withDefault(payload), "signature", "Ceiling")).toBeNull();
    expect(projectEstimatorTierDescription(section(payload), "signature", "Ceiling")).toBeNull();
    expect(projectEstimatorTierDescription(section({ ...payload, modeDescription: "Custom finish. Inclusions: none. Exclusions: none." }), "signature", "Ceiling"))
      .toBe("Custom finish. Inclusions: none. Exclusions: none.");
    expect(projectEstimatorTierDescription(section({ ...payload, modeDescription: "Custom finish." }), "signature", "Ceiling"))
      .toBe("Custom finish.");
  });

  it("does not generate a description from saved Sub-vendor configuration", () => {
    const source = section({ modeConfigurations: [{ id: "vendor", modeKind: "execution", executionSource: "sub_vendor", fields: [
      { id: "private", type: "text", label: "Internal cost", options: [], value: "PRIVATE" }
    ] }] });
    expect(projectEstimatorTierDescription(source, "signature", "Ceiling")).toBeNull();
  });

  it.each([{}, { modeDescription: null }, { modeConfigurations: [] }, { modeDescription: null, modeConfigurations: [] }])(
    "does not borrow saved Mode wording for missing description input %j", payload => {
      const source = withDefault(payload);
      for (const tier of ["signature", "premium", "functional"] as const) {
        expect(projectEstimatorTierDescription(source, tier, "Ceiling")).toBeNull();
      }
    });

  it("keeps common Mode empty when no paragraph was saved", () => {
    const source = section({ tierConfigurations: { default: configured({ modeConfigurations: [pmc("Mode transport")] }) } });
    expect(projectEstimatorTierDescription(source, "premium", "Ceiling")).toBeNull();
  });

  it("does not replace an explicitly cleared tier with common wording or selected scope lists", () => {
    const source = section({ modeDescription: "", modeConfigurations: [pmc()], tierConfigurations: {
      default: configured({ modeDescription: "Default Mode paragraph." }),
      premium: configured({ modeDescription: "", modeConfigurations: [pmc()] })
    } });
    expect(projectEstimatorTierDescription(source, "signature", "Ceiling")).toBeNull();
    expect(projectEstimatorTierDescription(source, "premium", "Ceiling")).toBeNull();
    expect(projectEstimatorTierDescription(source, "functional", "Ceiling")).toBeNull();
  });

  it.each(["not_configured", "not_applicable"])("does not expose retained %s text or fall back over it", applicability => {
    for (const payload of [{ modeDescription: "Retained" }, { modeConfigurations: [pmc()] }]) {
      const source = withDefault(payload); source.applicability = applicability;
      expect(projectEstimatorTierDescription(source, "signature", "Ceiling")).toBeNull();
    }
    const empty = withDefault(); empty.applicability = applicability;
    expect(projectEstimatorTierDescription(empty, "signature", "Ceiling")).toBeNull();
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
    expect(projectEstimatorTierDescription(withDefault({ modeDescription: "Selected wording.", ...payload }), "signature", "Ceiling")).toBeNull();
  });

  it("bounds saved wording without appending scopes or truncating it", () => {
    const longScopes = { ...pmc(), inclusions: Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, name: `${i}-${"x".repeat(230)}`, selected: true })) };
    expect(projectEstimatorTierDescription(withDefault({ modeDescription: "Saved work.", modeConfigurations: [longScopes] }), "signature", "Ceiling"))
      .toBe("Saved work.");
    expect(projectEstimatorTierDescription(withDefault({ modeDescription: "x".repeat(3990), modeConfigurations: [pmc()] }), "signature", "Ceiling"))
      .toHaveLength(3990);
    expect(projectEstimatorTierDescription(section({ modeDescription: "x".repeat(4000) }), "signature", "Ceiling")).toHaveLength(4000);
  });

  it("does not mutate saved scope data while projecting any tier", () => {
    const source = section({ modeDescription: "Signature wording.", modeConfigurations: [pmc()], tierConfigurations: {
      premium: configured({ modeDescription: "Premium wording.", modeConfigurations: [pmc("Premium transport")] }),
      functional: configured({ modeDescription: "Functional wording." }),
      default: configured({ modeDescription: "Default wording." })
    } });
    const before = JSON.stringify(source);
    for (const tier of ["signature", "premium", "functional"] as const) {
      projectEstimatorTierDescription(source, tier, "Ceiling");
    }
    expect(JSON.stringify(source)).toBe(before);
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
