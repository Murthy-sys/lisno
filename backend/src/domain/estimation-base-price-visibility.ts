import { KNOWLEDGE_MODE_CONFIGURATION_SCOPES, projectKnowledgeModeTierSection, type KnowledgeModeConfigurationScope } from "./ai-estimator-knowledge-mode-tiers.js";
import { inHouseComponentBaseRate, readInHouseComponents, type KnowledgeInHouseComponent } from "./ai-estimator-knowledge-in-house-components.js";
import { estimateModeBaseRatesPaise, type EstimatePricingMode } from "./estimate-mode-pricing.js";

export type EstimationBasePriceAvailability = Record<KnowledgeModeConfigurationScope, Record<EstimatePricingMode, boolean>>;

/** Each scope/method is independent; base presence never selects a financial tier or selling rate. */
export function configuredKnowledgeBasePriceAvailability(
  advanced: { sectionKey?: unknown; applicability?: unknown; payload?: unknown } | undefined,
  componentIsAvailable: (component: KnowledgeInHouseComponent) => boolean
): EstimationBasePriceAvailability {
  const availability = {} as EstimationBasePriceAvailability;
  for (const scope of KNOWLEDGE_MODE_CONFIGURATION_SCOPES) {
    const section = advanced?.sectionKey === "advanced" ? projectKnowledgeModeTierSection(advanced, scope) : undefined;
    const configured = section?.applicability === "configured";
    const bases = estimateModeBaseRatesPaise(configured ? section.payload : null);
    availability[scope] = {
      pmc: (bases.pmc ?? 0) > 0,
      sub_vendor: (bases.sub_vendor ?? 0) > 0,
      in_house: (bases.in_house ?? 0) > 0 || configured && readInHouseComponents(section.payload)?.some(component =>
        componentIsAvailable(component) && (inHouseComponentBaseRate(component) ?? 0) > 0) === true
    };
  }
  return availability;
}

export function hasConfiguredBasePriceForMode(availability: EstimationBasePriceAvailability, mode: EstimatePricingMode): boolean {
  return KNOWLEDGE_MODE_CONFIGURATION_SCOPES.some(scope => availability[scope][mode]);
}

/** Presence controls discovery only; it never selects a financial tier or selling rate. */
export function hasConfiguredKnowledgeBasePrice(
  advanced: { sectionKey?: unknown; applicability?: unknown; payload?: unknown } | undefined,
  componentIsAvailable: (component: KnowledgeInHouseComponent) => boolean
): boolean {
  return Object.values(configuredKnowledgeBasePriceAvailability(advanced, componentIsAvailable))
    .some(methods => Object.values(methods).some(Boolean));
}
