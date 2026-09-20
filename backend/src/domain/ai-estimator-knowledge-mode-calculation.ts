import {
  KnowledgeCalculationError,
  KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE,
  applyBasisPoints,
  calculateMarginSellingPrice,
  multiplyMoneyByQuantity,
  parseScaledDecimal
} from "./ai-estimator-knowledge-calculation.js";
import type { KnowledgeModeCalculationSettings, KnowledgeModeCalculationPreview, KnowledgeInHouseCalculationSettings, KnowledgeInHouseCalculationPreview, KnowledgePmcCalculationSettings, KnowledgePmcCalculationPreview, KnowledgeSubVendorCalculationSettings, KnowledgeSubVendorCalculationPreview } from "../contracts/ai-estimator-knowledge.js";

export const KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS = 1_000;
export const KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE = "Discount not allowed. Recheck the discount % — it would take the selling price below the minimum gross-margin floor.";
export const KNOWLEDGE_PMC_MAX_IMPACT_BPS = Number.MAX_SAFE_INTEGER - 10_000;

export interface KnowledgeModeBaseRateInput {
  readonly baseRatePaise: number;
  readonly lowQuantityLimit: string;
  readonly impactBps?: number;
  readonly quantity: string;
  readonly quantityScale: number;
}

export function calculateKnowledgeModeBaseRate(input: KnowledgeModeBaseRateInput, quantityLimitBoundary: "exclusive" | "inclusive" = "exclusive") {
  const impactBps = input.impactBps === undefined ? KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS : input.impactBps;
  if (!Number.isSafeInteger(impactBps) || impactBps < 0 || impactBps > Number.MAX_SAFE_INTEGER - 10_000) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "Impact must be a supported non-negative percentage.");
  }
  const quantity = parseScaledDecimal(input.quantity, input.quantityScale);
  const limit = parseScaledDecimal(input.lowQuantityLimit, input.quantityScale);
  const appliesImpact = quantityLimitBoundary === "inclusive" ? quantity <= limit : quantity < limit;
  const appliedImpactBps = appliesImpact ? impactBps : 0;
  const revisedUnitRatePaise = applyBasisPoints(input.baseRatePaise, 10_000 + appliedImpactBps);
  const revisedAmountPaise = multiplyMoneyByQuantity(revisedUnitRatePaise, input.quantity, input.quantityScale);
  return { revisedUnitRatePaise, revisedAmountPaise, appliedImpactBps };
}

export function calculateKnowledgeModePrice(input: KnowledgeModeBaseRateInput & KnowledgeModeCalculationSettings & {
  readonly markupBasis?: "starting" | "minimum";
  readonly discountBps?: number;
}): KnowledgeModeCalculationPreview {
  if (!Number.isSafeInteger(input.minimumMarkupBps) || input.minimumMarkupBps < 0 ||
      !Number.isSafeInteger(input.startingMarkupBps) || input.startingMarkupBps < input.minimumMarkupBps ||
      input.startingMarkupBps >= 10_000) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "Starting gross margin must be at least the non-negative minimum gross margin and remain below 100%.");
  }
  const marginBps = input.markupBasis === "minimum" ? input.minimumMarkupBps : input.startingMarkupBps;
  const discountBps = input.discountBps === undefined ? 0 : input.discountBps;
  if (!Number.isSafeInteger(discountBps) || discountBps < 0) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "Enter a non-negative discount with up to two decimal places.");
  }
  const revised = calculateKnowledgeModeBaseRate(input, "inclusive");
  const floorPricePaise = calculateMarginSellingPrice(revised.revisedAmountPaise, input.minimumMarkupBps);
  const totalBeforeDiscountPaise = calculateMarginSellingPrice(revised.revisedAmountPaise, marginBps);
  const maximumDiscountBps = totalBeforeDiscountPaise === 0
    ? 0
    : Number(
      (BigInt(totalBeforeDiscountPaise - floorPricePaise) * 10_000n) /
      BigInt(totalBeforeDiscountPaise)
    );
  if (discountBps > maximumDiscountBps) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
  }
  const discountAmountPaise = applyBasisPoints(totalBeforeDiscountPaise, discountBps);
  const totalPaise = totalBeforeDiscountPaise - discountAmountPaise;
  if (totalPaise < floorPricePaise) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
  }
  return {
    ...revised,
    floorPricePaise,
    maximumDiscountBps,
    discountBasis: "selling_price",
    totalPaise,
    ...(input.discountBps !== undefined ? { discount: {
      rateBps: discountBps,
      totalBeforeDiscountPaise,
      amountPaise: discountAmountPaise
    } } : {})
  };
}

export function calculateKnowledgeInHousePrice(input: KnowledgeInHouseCalculationSettings & {
  readonly quantity: string;
  readonly quantityScale: number;
  readonly markupBasis?: "starting" | "minimum";
  readonly discountBps?: number;
}): KnowledgeInHouseCalculationPreview {
  const context = { quantity: input.quantity, quantityScale: input.quantityScale, markupBasis: input.markupBasis, discountBps: input.discountBps };
  const labor = calculateKnowledgeModePrice({ ...input.labor, ...context });
  const material = calculateKnowledgeModePrice({ ...input.material, ...context });
  // Add the independently rounded final amounts, including each cost's own Impact and gross margin.
  const total = BigInt(labor.totalPaise) + BigInt(material.totalPaise);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new KnowledgeCalculationError("UNSAFE_RESULT", "The combined In-house total exceeds the supported amount.");
  }
  return { labor, material, totalPaise: Number(total) };
}

export function calculateKnowledgePmcPrice(input: KnowledgeModeBaseRateInput & KnowledgePmcCalculationSettings & {
  readonly discountBps?: number;
}): KnowledgePmcCalculationPreview {
  const { marginBps, marginAmountPaise, ...calculation } = calculateKnowledgeMarginPrice({
    ...input, marginBps: input.pmcMarginBps
  }, "PMC");
  return { ...calculation, pmcMarginBps: marginBps, pmcMarginAmountPaise: marginAmountPaise };
}

export function calculateKnowledgeSubVendorPrice(input: KnowledgeModeBaseRateInput & KnowledgeSubVendorCalculationSettings & {
  readonly discountBps?: number;
}): KnowledgeSubVendorCalculationPreview {
  const { marginBps, marginAmountPaise, ...calculation } = calculateKnowledgeMarginPrice({
    ...input, marginBps: input.subVendorMarginBps
  }, "Sub-Vendor");
  return { ...calculation, subVendorMarginBps: marginBps, subVendorMarginAmountPaise: marginAmountPaise };
}

function calculateKnowledgeMarginPrice(input: KnowledgeModeBaseRateInput & {
  readonly marginBps: number;
  readonly discountBps?: number;
}, label: "PMC" | "Sub-Vendor") {
  if (typeof input.quantity !== "string" || typeof input.lowQuantityLimit !== "string") {
    throw new KnowledgeCalculationError("INVALID_DECIMAL", `${label} quantity and low quantity limit must be non-negative decimal strings.`);
  }
  if (label === "Sub-Vendor") {
    if (!Number.isSafeInteger(input.marginBps) || input.marginBps < 0 || input.marginBps > 9_500 || input.marginBps % 500 !== 0) {
      throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "Lisno margin must be between 0% and 95%, in multiples of 5%.");
    }
  } else if (!Number.isSafeInteger(input.marginBps) || input.marginBps < 1_000 || input.marginBps > 2_000) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "PMC margin must be between 10% and 20%, with up to two decimal places.");
  }
  const impactBps = input.impactBps === undefined ? KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS : input.impactBps;
  if (!Number.isSafeInteger(impactBps) || impactBps < 0 || impactBps > KNOWLEDGE_PMC_MAX_IMPACT_BPS) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", `${label} Impact must be a supported non-negative percentage.`);
  }
  const discountBps = input.discountBps === undefined ? 0 : input.discountBps;
  if (!Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10_000) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE);
  }
  const baseAmountPaise = multiplyMoneyByQuantity(input.baseRatePaise, input.quantity, input.quantityScale);
  const revised = calculateKnowledgeModeBaseRate({ ...input, impactBps }, "inclusive");
  // Derive the charge from rounded amounts so the displayed stages reconcile.
  const lowQuantityImpactAmountPaise = revised.revisedAmountPaise - baseAmountPaise;
  const totalBeforeDiscountPaise = calculateMarginSellingPrice(revised.revisedAmountPaise, input.marginBps);
  const marginAmountPaise = totalBeforeDiscountPaise - revised.revisedAmountPaise;
  const discountBasisPaise = label === "PMC" ? marginAmountPaise : totalBeforeDiscountPaise;
  const discountAmountPaise = applyBasisPoints(discountBasisPaise, discountBps);
  const totalPaise = totalBeforeDiscountPaise - discountAmountPaise;
  // PMC discounts reduce Lisno's charge only and always preserve adjusted cost. Sub-Vendor
  // retains its existing selling-price discount and signed-balance response semantics.
  const finalVendorChargesPaise = label === "PMC"
    ? revised.revisedAmountPaise
    : totalPaise - marginAmountPaise;
  return { ...revised, baseAmountPaise, lowQuantityImpactAmountPaise,
    totalPaise, marginBps: input.marginBps, marginAmountPaise,
    totalBeforeDiscountPaise, finalVendorChargesPaise,
    ...(input.discountBps !== undefined ? { discount: {
      rateBps: discountBps, totalBeforeDiscountPaise, amountPaise: discountAmountPaise
    } } : {}) };
}
