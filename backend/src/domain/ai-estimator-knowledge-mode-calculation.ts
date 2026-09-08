import {
  KnowledgeCalculationError,
  applyBasisPoints,
  multiplyMoneyByQuantity,
  parseScaledDecimal
} from "./ai-estimator-knowledge-calculation.js";
import type { KnowledgeModeCalculationSettings, KnowledgeModeCalculationPreview, KnowledgeInHouseCalculationSettings, KnowledgeInHouseCalculationPreview } from "../contracts/ai-estimator-knowledge.js";

export const KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS = 1_000;
export const KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE = "Discount not allowed. Recheck the discount % — it would take the markup below the minimum standard.";

export interface KnowledgeModeBaseRateInput {
  readonly baseRatePaise: number;
  readonly lowQuantityLimit: string;
  readonly impactBps?: number;
  readonly quantity: string;
  readonly quantityScale: number;
}

export function calculateKnowledgeModeBaseRate(input: KnowledgeModeBaseRateInput) {
  const impactBps = input.impactBps === undefined ? KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS : input.impactBps;
  if (!Number.isSafeInteger(impactBps) || impactBps < 0 || impactBps > Number.MAX_SAFE_INTEGER - 10_000) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "Impact must be a supported non-negative percentage.");
  }
  const quantity = parseScaledDecimal(input.quantity, input.quantityScale);
  const limit = parseScaledDecimal(input.lowQuantityLimit, input.quantityScale);
  const appliedImpactBps = quantity < limit ? impactBps : 0;
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
