import { describe, expect, it } from "vitest";
import { KNOWLEDGE_MODE_TIERS, knowledgeModeTierPayload, mergeKnowledgeModeTierPayload, type KnowledgeModeConfigurationScope } from "../src/domain/ai-estimator-knowledge-mode-tiers.js";
import { copyUninitializedTierDescriptions, initializeSavedTierDescriptions } from "../src/domain/ai-estimator-knowledge-tier-description-copy.js";
import type { KnowledgeSectionApplicability } from "../src/domain/ai-estimator-knowledge.js";

const branch = (payload: Record<string, unknown>, applicability = "configured") => ({ applicability, payload });

describe("saved tier description initialization", () => {
  const initialize = (payload: Record<string, unknown>, enabled: readonly string[] = KNOWLEDGE_MODE_TIERS,
    rootApplicability: KnowledgeSectionApplicability = "configured") => initializeSavedTierDescriptions({
    payload, rootApplicability, overviewPayload: { applicableTiers: enabled }
  });

  it("copies already saved Signature wording without another source edit", () => {
    const payload = { modeDescription: "Existing Signature\nSecond line", tierConfigurations: {
      functional: branch({ modeDescription: null, dependencies: [] }, "not_configured")
    } };
    const before = structuredClone(payload);
    const result = initialize(payload);
    expect(result).toMatchObject({ sourceTier: "signature", copiedTiers: ["premium", "functional"] });
    for (const tier of KNOWLEDGE_MODE_TIERS) expect(knowledgeModeTierPayload(result.payload, tier).modeDescription).toBe(payload.modeDescription);
    expect(knowledgeModeTierPayload(result.payload, "functional").dependencies).toEqual([]);
    expect(payload).toEqual(before);
    expect(initialize(result.payload)).toMatchObject({ sourceTier: null, copiedTiers: [], payload: result.payload });
  });

  it("uses Signature priority while retaining authored Premium wording", () => {
    const result = initialize({ modeDescription: "Signature", tierConfigurations: { premium: branch({ modeDescription: "Premium" }) } });
    expect(result).toMatchObject({ sourceTier: "signature", copiedTiers: ["functional"] });
    expect(knowledgeModeTierPayload(result.payload, "premium").modeDescription).toBe("Premium");
    expect(knowledgeModeTierPayload(result.payload, "functional").modeDescription).toBe("Signature");
  });

  it.each(["premium", "functional"] as const)("uses saved %s when earlier tiers have no source and initializes root applicability", tier => {
    const result = initialize({ tierConfigurations: { [tier]: branch({ modeDescription: `${tier} saved` }) } }, KNOWLEDGE_MODE_TIERS, "not_configured");
    expect(result).toMatchObject({ sourceTier: tier, rootApplicability: "configured" });
    expect(knowledgeModeTierPayload(result.payload, "signature").modeDescription).toBe(`${tier} saved`);
  });

  it("ignores disabled/default sources and preserves clear/not-applicable destinations", () => {
    const result = initialize({ modeDescription: "Disabled Signature", tierConfigurations: {
      default: branch({ modeDescription: "Never a source" }), premium: branch({ modeDescription: "" }),
      functional: branch({}, "not_applicable")
    } }, ["premium", "functional"]);
    expect(result).toMatchObject({ sourceTier: null, copiedTiers: [] });
    expect(initialize({ modeDescription: "Source", tierConfigurations: { premium: branch({ modeDescription: "" }), functional: branch({}, "not_applicable") } }))
      .toMatchObject({ sourceTier: null, copiedTiers: [] });
  });

  it.each(["", "   ", 42, "x".repeat(4001)])("does not use invalid/blank source %j", value => {
    expect(initialize({ modeDescription: value })).toMatchObject({ sourceTier: null, copiedTiers: [] });
  });
});
const copy = (previousPayload: Record<string, unknown>, modeTier: KnowledgeModeConfigurationScope, description: unknown,
  enabled: readonly string[] | undefined = KNOWLEDGE_MODE_TIERS, rootApplicability: KnowledgeSectionApplicability = "not_configured",
  sourceApplicability: KnowledgeSectionApplicability = "configured") => copyUninitializedTierDescriptions({
  previousPayload, modeTier, sourceApplicability, rootApplicability: modeTier === "signature" ? sourceApplicability : rootApplicability,
  payload: mergeKnowledgeModeTierPayload(previousPayload, modeTier, {
    ...knowledgeModeTierPayload(previousPayload, modeTier), modeDescription: description
  }, sourceApplicability),
  overviewPayload: enabled === undefined ? {} : { applicableTiers: enabled }
});

describe("first-save tier description copying", () => {
  it.each(KNOWLEDGE_MODE_TIERS)("initializes both other enabled tiers from %s while preserving independent settings", (source) => {
    const previous = { pmcMarginBps: 1200, tierConfigurations: {
      default: branch({ modeDescription: "Default must remain independent" }),
      premium: branch({ modeDescription: null, pmcMarginBps: 1500 }),
      functional: branch({ subVendorMarginBps: 3500 }, "not_configured")
    } };
    const before = structuredClone(previous);
    const text = `${source} supplied wording.\nSecond line.`;
    const result = copy(previous, source, text);
    expect(result.copiedTiers).toEqual(KNOWLEDGE_MODE_TIERS.filter(tier => tier !== source));
    expect(result.rootApplicability).toBe("configured");
    for (const tier of KNOWLEDGE_MODE_TIERS) {
      expect(knowledgeModeTierPayload(result.payload, tier)).toEqual({ ...knowledgeModeTierPayload(previous, tier), modeDescription: text });
    }
    expect(knowledgeModeTierPayload(result.payload, "default")).toEqual(previous.tierConfigurations.default.payload);
    expect(previous).toEqual(before);
  });

  it.each(KNOWLEDGE_MODE_TIERS.flatMap(source => KNOWLEDGE_MODE_TIERS.filter(tier => tier !== source).map(target => [source, target] as const)))
    ("copies %s to only the enabled %s sibling", (source, target) => {
      const result = copy({}, source, "One description", [source, target]);
      expect(result.copiedTiers).toEqual([target]);
      const disabled = KNOWLEDGE_MODE_TIERS.find(tier => tier !== source && tier !== target)!;
      expect(knowledgeModeTierPayload(result.payload, disabled)).toEqual({});
      expect(knowledgeModeTierPayload(result.payload, "default")).toEqual({});
    });

  it.each(["Existing paragraph", "", "   ", 42, {}, undefined])("preserves an initialized or malformed sibling value %j", (description) => {
    const previous = { tierConfigurations: { functional: branch({ modeDescription: description }) } };
    const result = copy(previous, "signature", "New source", ["signature", "functional"]);
    expect(result.copiedTiers).toEqual([]);
    expect(result.payload.tierConfigurations).toEqual(previous.tierConfigurations);
  });

  it.each([null, "", " \n ", undefined])("does not copy a blank/non-text source %j", (text) => {
    expect(copy({}, "signature", text).copiedTiers).toEqual([]);
  });

  it("does not copy unchanged source text, from default, from a disabled source, or from a disabled section", () => {
    expect(copy({ modeDescription: "Saved" }, "signature", "Saved").copiedTiers).toEqual([]);
    expect(copy({}, "default", "Default only").copiedTiers).toEqual([]);
    expect(copy({}, "signature", "Disabled source", ["premium", "functional"]).copiedTiers).toEqual([]);
    expect(copy({}, "signature", "No tiers", []).copiedTiers).toEqual([]);
    expect(copy({}, "signature", "Inactive", KNOWLEDGE_MODE_TIERS, "not_applicable", "not_applicable").copiedTiers).toEqual([]);
    const legacy = copyUninitializedTierDescriptions({ previousPayload: {}, payload: { modeDescription: "Legacy Signature" },
      rootApplicability: "configured", sourceApplicability: "configured", modeTier: "signature", overviewPayload: {} });
    expect(legacy.copiedTiers).toEqual([]);
  });

  it("does not revive disabled Signature or named namespaces, or replace malformed namespaces", () => {
    const previous = { tierConfigurations: { functional: branch({}, "not_applicable") } };
    expect(copy(previous, "premium", "Premium", KNOWLEDGE_MODE_TIERS, "not_applicable").copiedTiers).toEqual([]);
    for (const value of [null, [], { applicability: "configured", payload: null }, { applicability: "unknown", payload: {} }]) {
      const malformed = { tierConfigurations: { functional: value } };
      expect(copy(malformed, "signature", "Saved", ["signature", "functional"]).payload.tierConfigurations).toEqual(malformed.tierConfigurations);
    }
    const malformedRoot = { modeDescription: "Saved", tierConfigurations: [] };
    expect(copyUninitializedTierDescriptions({ previousPayload: {}, payload: malformedRoot, modeTier: "signature",
      sourceApplicability: "configured", rootApplicability: "configured", overviewPayload: { applicableTiers: KNOWLEDGE_MODE_TIERS } }).payload).toBe(malformedRoot);
  });

  it("keeps copied descriptions independent on subsequent edits and clears", () => {
    const initialized = copy({}, "signature", "First wording").payload;
    const edited = copy(initialized, "functional", "Functional specific").payload;
    expect(knowledgeModeTierPayload(edited, "signature").modeDescription).toBe("First wording");
    const cleared = copy(edited, "premium", "").payload;
    const changed = copy(cleared, "signature", "Signature specific");
    expect(changed.copiedTiers).toEqual([]);
    expect(knowledgeModeTierPayload(changed.payload, "functional").modeDescription).toBe("Functional specific");
    expect(knowledgeModeTierPayload(changed.payload, "premium").modeDescription).toBe("");
  });
});
