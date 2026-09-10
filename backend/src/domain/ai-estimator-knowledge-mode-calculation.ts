import {
  KnowledgeCalculationError,
  applyBasisPoints,
  multiplyMoneyByQuantity,
  parseScaledDecimal
} from "./ai-estimator-knowledge-calculation.js";
import type { KnowledgeModeCalculationSettings, KnowledgeModeCalculationPreview, KnowledgeInHouseCalculationSettings, KnowledgeInHouseCalculationPreview, KnowledgePmcCalculationSettings, KnowledgePmcCalculationPreview } from "../contracts/ai-estimator-knowledge.js";

export const KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS = 1_000;
export const KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE = "Discount not allowed. Recheck the discount % — it would take the markup below the minimum standard.";
export const KNOWLEDGE_PMC_DISCOUNT_LIMIT_MESSAGE = "Discount not allowed. Recheck the discount % — PMC margin must remain at least 10%.";
export const KNOWLEDGE_PMC_MAX_IMPACT_BPS = Number.MAX_SAFE_INTEGER - 10_000;

export function maximumKnowledgePmcDiscountBps(pmcMarginBps: number): number {
  return Math.floor((pmcMarginBps - 1_000) * 10_000 / (10_000 + pmcMarginBps));
}

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
      input.startingMarkupBps > Number.MAX_SAFE_INTEGER - 10_000) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "Starting markup must be at least the non-negative minimum markup.");
  }
  const markupBps = input.markupBasis === "minimum" ? input.minimumMarkupBps : input.startingMarkupBps;
  const discountBps = input.discountBps === undefined ? 0 : input.discountBps;
  if (!Number.isSafeInteger(discountBps) || discountBps < 0) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "Enter a non-negative discount with up to two decimal places.");
  }
  if (discountBps > markupBps - input.minimumMarkupBps) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
  }
  const revised = calculateKnowledgeModeBaseRate(input);
  const effectiveMarkupBps = markupBps - discountBps;
  const totalPaise = applyBasisPoints(revised.revisedAmountPaise, 10_000 + effectiveMarkupBps);
  const totalBeforeDiscountPaise = applyBasisPoints(revised.revisedAmountPaise, 10_000 + markupBps);
  return { ...revised, totalPaise, ...(input.discountBps !== undefined ? { discount: {
    rateBps: discountBps, effectiveMarkupBps, totalBeforeDiscountPaise,
    // Derive the saving from rounded totals so the displayed amounts reconcile exactly.
    amountPaise: totalBeforeDiscountPaise - totalPaise
  } } : {}) };
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
  // Add the independently rounded final amounts, including each cost's own Impact and markup.
  const total = BigInt(labor.totalPaise) + BigInt(material.totalPaise);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new KnowledgeCalculationError("UNSAFE_RESULT", "The combined In-house total exceeds the supported amount.");
  }
  return { labor, material, totalPaise: Number(total) };
}

export function calculateKnowledgePmcPrice(input: KnowledgeModeBaseRateInput & KnowledgePmcCalculationSettings & {
  readonly discountBps?: number;
}): KnowledgePmcCalculationPreview {
  if (typeof input.quantity !== "string" || typeof input.lowQuantityLimit !== "string") {
    throw new KnowledgeCalculationError("INVALID_DECIMAL", "PMC quantity and low quantity limit must be non-negative decimal strings.");
  }
  if (!Number.isSafeInteger(input.pmcMarginBps) || input.pmcMarginBps < 1_000 || input.pmcMarginBps > 2_000) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "PMC margin must be between 10% and 20%, with up to two decimal places.");
  }
  const impactBps = input.impactBps === undefined ? KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS : input.impactBps;
  if (!Number.isSafeInteger(impactBps) || impactBps < 0 || impactBps > KNOWLEDGE_PMC_MAX_IMPACT_BPS) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "PMC Impact must be a supported non-negative percentage.");
  }
  const discountBps = input.discountBps === undefined ? 0 : input.discountBps;
  if (!Number.isSafeInteger(discountBps) || discountBps < 0) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "Enter a non-negative PMC discount with up to two decimal places.");
  }
  if (discountBps > maximumKnowledgePmcDiscountBps(input.pmcMarginBps)) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", KNOWLEDGE_PMC_DISCOUNT_LIMIT_MESSAGE);
  }
  const baseAmountPaise = multiplyMoneyByQuantity(input.baseRatePaise, input.quantity, input.quantityScale);
  const revised = calculateKnowledgeModeBaseRate({ ...input, impactBps }, "inclusive");
  // Derive the charge from rounded amounts so the displayed stages reconcile.
  const lowQuantityImpactAmountPaise = revised.revisedAmountPaise - baseAmountPaise;
  const totalBeforeDiscountPaise = applyBasisPoints(revised.revisedAmountPaise, 10_000 + input.pmcMarginBps);
  const pmcMarginAmountPaise = totalBeforeDiscountPaise - revised.revisedAmountPaise;
  const discountAmountPaise = applyBasisPoints(totalBeforeDiscountPaise, discountBps);
  const totalPaise = totalBeforeDiscountPaise - discountAmountPaise;
  // Independent paise rounding can cross the floor even at an allowed percentage.
  if (totalPaise < applyBasisPoints(revised.revisedAmountPaise, 11_000)) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", KNOWLEDGE_PMC_DISCOUNT_LIMIT_MESSAGE);
  }
  return { ...revised, baseAmountPaise, lowQuantityImpactAmountPaise,
    totalPaise, pmcMarginBps: input.pmcMarginBps, pmcMarginAmountPaise,
    totalBeforeDiscountPaise, finalVendorChargesPaise: totalPaise - pmcMarginAmountPaise,
    ...(input.discountBps !== undefined ? { discount: {
      rateBps: discountBps, totalBeforeDiscountPaise, amountPaise: discountAmountPaise
    } } : {}) };
}
