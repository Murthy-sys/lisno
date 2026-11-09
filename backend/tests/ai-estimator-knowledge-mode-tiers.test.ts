import { describe, expect, it } from "vitest";
import { KNOWLEDGE_MODE_CONFIGURATION_SCOPES, knowledgeModeTierPayload, knowledgeModeTierPayloads, knowledgeModeConfigurationPayloads, isKnowledgeModeTier, isKnowledgeModeConfigurationScope, projectKnowledgeModeTierSection, mergeKnowledgeModeTierPayload } from "../src/domain/ai-estimator-knowledge-mode-tiers.js";
import { validateKnowledgeSectionPayload } from "../src/domain/ai-estimator-knowledge-validation.js";
import { completenessForRows, hasKnowledgeSectionContent, normalizeKnowledgeProposalSectionPayload } from "../src/services/ai-estimator-knowledge-item.service.js";
import { estimateModeBaseRatesPaise } from "../src/domain/estimate-mode-pricing.js";
import { KNOWLEDGE_MODE_CONFIGURATION_SCOPES as SHARED_CONFIGURATION_SCOPES, isKnowledgeModeConfigurationScope as isSharedConfigurationScope, applicableKnowledgeTiers } from "../../shared/knowledge/knowledgeModeTiers.js";

const branch = (payload: Record<string, unknown>) => ({ applicability: "configured", payload });
const cost = { baseRatePaise: 12345, lowQuantityLimit: "10", startingMarkupBps: 2500, minimumMarkupBps: 1500 };

describe("independent Mode tier payloads", () => {
  it("keeps default Configuration separate from financial tiers and existing Signature data", () => {
    expect(KNOWLEDGE_MODE_CONFIGURATION_SCOPES).toEqual(SHARED_CONFIGURATION_SCOPES);
    for (const value of ["default", "signature", "premium", "functional", "unknown", null]) {
      expect(isKnowledgeModeConfigurationScope(value)).toBe(isSharedConfigurationScope(value));
    }
    const root = { modeDescription: "Signature", tierConfigurations: {
      default: branch({ modeDescription: "Default" }), premium: branch({ modeDescription: "Premium" })
    } };
    expect(isKnowledgeModeConfigurationScope("default")).toBe(true);
    expect(isKnowledgeModeTier("default")).toBe(false);
    expect(knowledgeModeTierPayloads(root).map(entry => entry.modeTier)).toEqual(["signature", "premium"]);
    expect(knowledgeModeConfigurationPayloads(root).map(entry => entry.modeTier)).toEqual(["signature", "default", "premium"]);
    const section = { sectionKey: "advanced", version: 3, applicability: "configured", payload: root };
    expect(projectKnowledgeModeTierSection(section, "default")).toMatchObject({
      modeTier: "default", version: 3, applicability: "configured", payload: { modeDescription: "Default" }
    });
    expect(projectKnowledgeModeTierSection({ ...section, payload: { modeDescription: "Signature" } }, "default"))
      .toMatchObject({ modeTier: "default", applicability: "not_configured", payload: {} });
    const next = mergeKnowledgeModeTierPayload(root, "default", { modeDescription: "New default" }, "configured");
    expect(knowledgeModeTierPayload(next)).toEqual({ modeDescription: "Signature" });
    expect(knowledgeModeTierPayload(next, "premium")).toEqual({ modeDescription: "Premium" });
    expect(knowledgeModeTierPayload(next, "default")).toEqual({ modeDescription: "New default" });
    expect(mergeKnowledgeModeTierPayload(next, "signature", { modeDescription: "New Signature" }, "configured").tierConfigurations)
      .toEqual(next.tierConfigurations);
  });

  it("validates default independently without making it an applicable estimation tier", () => {
    expect(validateKnowledgeSectionPayload("advanced", { tierConfigurations: { default: branch({ modeDescription: "Default" }) } })).toEqual([]);
    expect(validateKnowledgeSectionPayload("overview", { applicableTiers: ["default"] })).not.toEqual([]);
    expect(validateKnowledgeSectionPayload("advanced", { tierConfigurations: { default: branch({ tierConfigurations: {} }) } }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ path: "payload.tierConfigurations.default.payload.tierConfigurations" })]));
    expect(validateKnowledgeSectionPayload("pricing", { tierConfigurations: { default: branch({ priceEntries: [{ operation: "reference", priceVersionId: "legacy" }] }) } }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "SIGNATURE_ONLY" })]));
    const previous = { modeDescription: "Signature", tierConfigurations: { default: branch({ modeDescription: "Default" }) } };
    expect(normalizeKnowledgeProposalSectionPayload("advanced", { modeDescription: "Proposal edit" }, previous).tierConfigurations)
      .toEqual(previous.tierConfigurations);
    expect(() => normalizeKnowledgeProposalSectionPayload("advanced", { tierConfigurations: { default: branch({ modeDescription: "Forged" }) } }, previous))
      .toThrow("Request validation failed.");
  });

  it("defaults legacy applicability to Signature, retaining explicit empty selection", () => {
    expect(applicableKnowledgeTiers({})).toEqual(["signature"]);
    expect(applicableKnowledgeTiers({ applicableTiers: [] })).toEqual([]);
    expect(applicableKnowledgeTiers({ applicableTiers: ["functional", "signature"] })).toEqual(["signature", "functional"]);
    for (const value of [[], ["signature"], ["premium", "functional"]]) expect(validateKnowledgeSectionPayload("overview", { applicableTiers: value })).toEqual([]);
    for (const value of [null, "premium", ["unknown"], ["premium", "premium"]]) expect(validateKnowledgeSectionPayload("overview", { applicableTiers: value })).not.toEqual([]);
  });

  it("projects legacy root as Signature and absent additional tiers as empty without changing the parent version", () => {
    const root = { modeDescription: "Existing", tierConfigurations: { premium: branch({ modeDescription: "Premium" }) } };
    const section = { sectionKey: "advanced", version: 7, applicability: "configured", payload: root };
    expect(projectKnowledgeModeTierSection(section)).toEqual({ ...section, payload: { modeDescription: "Existing" } });
    expect(projectKnowledgeModeTierSection(section, "premium")).toMatchObject({ version: 7, modeTier: "premium", applicability: "configured", payload: { modeDescription: "Premium" } });
    expect(projectKnowledgeModeTierSection(section, "functional")).toMatchObject({ version: 7, modeTier: "functional", applicability: "not_configured", payload: {} });
    expect(root.modeDescription).toBe("Existing");
  });

  it("retains sibling tiers on legacy Signature writes and does not reprice existing estimates", () => {
    const root = { modeCalculations: { pmc: cost, sub_vendor: null, in_house: null }, tierConfigurations: { premium: branch({ modeCalculations: { pmc: { ...cost, baseRatePaise: 99999 }, sub_vendor: null, in_house: null } }) } };
    const next = mergeKnowledgeModeTierPayload(root, "signature", { ...knowledgeModeTierPayload(root), modeDescription: "Updated" }, "configured");
    expect(next.tierConfigurations).toEqual(root.tierConfigurations);
    expect(estimateModeBaseRatesPaise(next)).toEqual({ pmc: 12345, sub_vendor: null, in_house: null });
    expect(validateKnowledgeSectionPayload("advanced", next)).toEqual([]);
  });

  it("validates every retained namespace and forbids recursive or unknown namespaces", () => {
    expect(validateKnowledgeSectionPayload("advanced", { tierConfigurations: { premium: branch({ pmcMarginBps: 2500 }) } })).toEqual(expect.arrayContaining([expect.objectContaining({ path: "payload.tierConfigurations.premium.payload.pmcMarginBps" })]));
    for (const payload of [
      { tierConfigurations: { signature: branch({}) } },
      { tierConfigurations: { premium: branch({ tierConfigurations: {} }) } },
      { tierConfigurations: { premium: { applicability: "bad", payload: {} } } },
      { tierConfigurations: { premium: { ...branch({}), unknown: true } } }
    ]) expect(validateKnowledgeSectionPayload("advanced", payload)).not.toEqual([]);
    expect(validateKnowledgeSectionPayload("pricing", { tierConfigurations: { premium: branch({ priceEntries: [{ operation: "reference", priceVersionId: "old" }] }) } })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SIGNATURE_ONLY" })]));
  });

  it("does not mark Signature configured from the presence of a namespace", () => {
    const payload = { tierConfigurations: { premium: branch({ modeDescription: "Premium" }) } };
    expect(hasKnowledgeSectionContent(payload)).toBe(false);
    const summary = completenessForRows("line", [{ sectionKey: "overview", applicability: "configured", payload: { uomId: "uom", applicableTiers: ["premium", "functional"] } }, { sectionKey: "advanced", applicability: "not_configured", payload }]);
    expect(summary.sections.find(section => section.sectionKey === "advanced")?.state).toBe("not_configured");
    expect(summary.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MODE_TIER_NOT_CONFIGURED", message: "functional Mode is not configured." })]));
  });

  it("keeps server-owned namespaces on legacy proposal root saves and rejects attempts to overwrite them", () => {
    const component = { id: "component", basketId: "basket", subBasketId: "sub", inclusions: [], exclusions: [], labor: null, material: null };
    const previous = { modeDescription: "Signature", tierConfigurations: { premium: branch({ inHouseComponents: [component] }) } };
    const next = normalizeKnowledgeProposalSectionPayload("advanced", { modeDescription: "Edited" }, previous);
    expect(next.tierConfigurations).toEqual(previous.tierConfigurations);
    expect(normalizeKnowledgeProposalSectionPayload("advanced", { ...previous, modeDescription: "Echo unchanged namespaces" }, previous).tierConfigurations).toEqual(previous.tierConfigurations);
    for (const tierConfigurations of [{}, { premium: branch({ inHouseComponents: [{ ...component, basketId: "other" }] }) }, { functional: branch({ modeDescription: "Forged" }) }]) {
      expect(() => normalizeKnowledgeProposalSectionPayload("advanced", { ...previous, tierConfigurations }, previous)).toThrow("Request validation failed.");
    }
    expect(previous.tierConfigurations.premium.payload.inHouseComponents).toEqual([component]);
  });
});
