import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimationBasePriceAvailability, EstimationInHouseComponent, EstimationModeBaseRatesPaise, EstimationTierPricing } from "./estimationCatalogueApi";
import type { EstimateClassification, EstimatePricingMode } from "./leadsApi";

interface PriceVisibilitySource {
  hasConfiguredBasePrice?: boolean;
  basePriceAvailability?: EstimationBasePriceAvailability;
  classification?: EstimateClassification;
  pricingMode?: EstimatePricingMode;
  tierPricing?: Partial<Record<KnowledgeModeTier, EstimationTierPricing>>;
  modeBaseRatesPaise?: EstimationModeBaseRatesPaise;
  inHouseComponents?: EstimationInHouseComponent[];
  inHousePricingState?: "ready" | "incomplete" | "invalid";
}

export const isPositiveConfiguredPrice = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export const estimationLinePricingMode = (line: Pick<PriceVisibilitySource, "classification" | "pricingMode">): EstimatePricingMode =>
  line.classification === "special" ? line.pricingMode ?? "sub_vendor" : "sub_vendor";

/** A legacy response needs a positive matching-method projection; the aggregate alone proves nothing. */
export function isEstimationTierBaseAvailable(line: PriceVisibilitySource, tier: KnowledgeModeTier, mode: EstimatePricingMode): boolean {
  if (line.basePriceAvailability) return line.basePriceAvailability[tier]?.[mode] === true;
  if (line.hasConfiguredBasePrice === false) return false;
  const pricing = line.tierPricing !== undefined ? line.tierPricing[tier] : tier === "signature" ? line : undefined;
  if (!pricing) return false;
  if (mode === "in_house" && pricing.inHousePricingState !== undefined) return pricing.inHousePricingState === "ready";
  return mode === "in_house" && pricing.inHouseComponents !== undefined
    ? pricing.inHouseComponents.some(component => !component.unavailableReason && isPositiveConfiguredPrice(component.baseRatePaise))
    : isPositiveConfiguredPrice(pricing.modeBaseRatesPaise?.[mode]);
}

export function isEstimationLinePriceVisible(line: PriceVisibilitySource, mode = estimationLinePricingMode(line)): boolean {
  if (line.basePriceAvailability) return (["default", "signature", "premium", "functional"] as const)
    .some(scope => line.basePriceAvailability?.[scope]?.[mode] === true);
  return (["signature", "premium", "functional"] as const).some(tier => isEstimationTierBaseAvailable(line, tier, mode));
}
