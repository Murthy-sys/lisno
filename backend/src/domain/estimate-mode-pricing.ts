import { isKnowledgeModeTier } from "./ai-estimator-knowledge-mode-tiers.js";
import { hasInHouseComponents, selectedInHouseComponents, selectedInHouseBaseRate, type InHouseComponentRate } from "./ai-estimator-knowledge-in-house-components.js";
export const ESTIMATE_PRICING_MODES = ["pmc", "sub_vendor", "in_house"] as const;
export const ESTIMATE_RATE_SOURCES = ["configuration", "manual"] as const;
export type EstimatePricingMode = (typeof ESTIMATE_PRICING_MODES)[number];
export type EstimateRateSource = (typeof ESTIMATE_RATE_SOURCES)[number];
export type EstimateModeBaseRatesPaise = Record<EstimatePricingMode, number | null>;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Split In-house settings take precedence, even when one of them is incomplete. */
export function estimateModeBaseRatesPaise(payload: unknown): EstimateModeBaseRatesPaise {
  const scopes = object(object(payload)?.modeCalculations);
  const base = (value: unknown): number | null => {
    const rate = object(value)?.baseRatePaise;
    return typeof rate === "number" && Number.isSafeInteger(rate) && rate >= 0 ? rate : null;
  };
  let inHouse = base(scopes?.in_house);
  if (scopes && (Object.hasOwn(scopes, "in_house_labor") || Object.hasOwn(scopes, "in_house_material"))) {
    const labor = base(scopes.in_house_labor);
    const material = base(scopes.in_house_material);
    inHouse = labor !== null && material !== null && Number.isSafeInteger(labor + material)
      ? labor + material : null;
  }
  return { pmc: base(scopes?.pmc), sub_vendor: base(scopes?.sub_vendor), in_house: hasInHouseComponents(payload) ? null : inHouse };
}

/** Estimation adds each unit-rate mode's configured maximum to its cost; margins stay private. */
export function estimateModeSellingRatesPaise(payload: unknown): EstimateModeBaseRatesPaise {
  const bases = estimateModeBaseRatesPaise(payload);
  const settings = object(payload);
  const sellingRate = (baseRatePaise: unknown, maximumMarginBps: unknown, marginLimit = 9_500): number | null => {
    if (typeof baseRatePaise !== "number" || !Number.isSafeInteger(baseRatePaise) || baseRatePaise < 0 ||
      typeof maximumMarginBps !== "number" || !Number.isSafeInteger(maximumMarginBps) ||
      maximumMarginBps < 0 || maximumMarginBps > marginLimit) return null;
    const total = (BigInt(baseRatePaise) * (10_000n + BigInt(maximumMarginBps)) + 5_000n) / 10_000n;
    return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
  };
  const inHouseRate = (value: unknown): number | null => {
    const cost = object(value);
    return sellingRate(cost?.baseRatePaise, cost?.startingMarkupBps, 9_999);
  };
  let inHouse: number | null = null;
  if (!hasInHouseComponents(payload)) {
    const scopes = object(settings?.modeCalculations);
    if (scopes && (Object.hasOwn(scopes, "in_house_labor") || Object.hasOwn(scopes, "in_house_material"))) {
      const labor = inHouseRate(scopes.in_house_labor);
      const material = inHouseRate(scopes.in_house_material);
      if (labor !== null && material !== null) {
        const total = BigInt(labor) + BigInt(material);
        inHouse = total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
      }
    } else {
      inHouse = inHouseRate(scopes?.in_house);
    }
  }
  return {
    pmc: sellingRate(bases.pmc, settings?.pmcMarginBps),
    sub_vendor: sellingRate(bases.sub_vendor, settings?.subVendorMarginBps),
    in_house: inHouse
  };
}

export function estimatePricingMetadataIsValid(line: {
  classification?: unknown; pricingMode?: unknown; rateSource?: unknown; modeTier?: unknown;
}): boolean {
  const modeValid = line.pricingMode === undefined ||
    ESTIMATE_PRICING_MODES.some((mode) => mode === line.pricingMode);
  const sourceValid = line.rateSource === undefined ||
    ESTIMATE_RATE_SOURCES.some((source) => source === line.rateSource);
  return modeValid && sourceValid && (line.modeTier === undefined || isKnowledgeModeTier(line.modeTier)) &&
    (line.rateSource !== "configuration" || line.pricingMode !== undefined) &&
    (line.pricingMode === undefined || line.classification === "special" || line.pricingMode === "sub_vendor");
}

/** Missing configured prices match only null, never zero or an entered historical rate. */
export function estimateConfigurationRateMatches(line: {
  classification?: unknown; pricingMode?: unknown; rateSource?: unknown; modeTier?: unknown; ratePaise?: unknown; selectedInHouseComponentIds?: unknown;
}, bases: EstimateModeBaseRatesPaise, components?: readonly InHouseComponentRate[]): boolean {
  if (!estimatePricingMetadataIsValid(line)) return false;
  const hasSelection = Array.isArray(line.selectedInHouseComponentIds) && line.selectedInHouseComponentIds.length > 0;
  if (line.pricingMode !== "in_house" && hasSelection) return false;
  if (line.pricingMode === "in_house" && components !== undefined) {
    const selected = selectedInHouseComponents(components, line.selectedInHouseComponentIds);
    if (!selected || selected.some((component) => component.unavailableReason != null)) return false;
    if (line.rateSource !== "configuration") return true;
    const base = selectedInHouseBaseRate(components, line.selectedInHouseComponentIds);
    return base !== null && (line.rateSource !== "configuration" || line.ratePaise === base);
  }
  if (hasSelection) return false;
  return line.rateSource !== "configuration" || line.ratePaise === bases[line.pricingMode as EstimatePricingMode];
}
