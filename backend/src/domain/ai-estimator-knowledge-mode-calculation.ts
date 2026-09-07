import {
  KnowledgeCalculationError,
  applyBasisPoints,
  adjustMoneyByBasisPoints,
  multiplyMoneyByQuantity,
  parseScaledDecimal
} from "./ai-estimator-knowledge-calculation.js";
import type { KnowledgeModeCalculationSettings } from "../contracts/ai-estimator-knowledge.js";

export const KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS = 1_000;

export interface KnowledgeModeBaseRateInput {
  readonly baseRatePaise: number;
  readonly lowQuantityLimit: string;
  readonly quantity: string;
  readonly quantityScale: number;
}

export function calculateKnowledgeModeBaseRate(input: KnowledgeModeBaseRateInput) {
  const quantity = parseScaledDecimal(input.quantity, input.quantityScale);
  const limit = parseScaledDecimal(input.lowQuantityLimit, input.quantityScale);
  const appliedImpactBps = quantity < limit ? KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS : 0;
  const revisedUnitRatePaise = adjustMoneyByBasisPoints(input.baseRatePaise, appliedImpactBps);
  const revisedAmountPaise = multiplyMoneyByQuantity(revisedUnitRatePaise, input.quantity, input.quantityScale);
  return { revisedUnitRatePaise, revisedAmountPaise, appliedImpactBps };
}

export function calculateKnowledgeModePrice(input: KnowledgeModeBaseRateInput & KnowledgeModeCalculationSettings & {
  readonly markupBasis?: "starting" | "minimum";
}) {
  if (!Number.isSafeInteger(input.minimumMarkupBps) || input.minimumMarkupBps < 0 ||
      !Number.isSafeInteger(input.startingMarkupBps) || input.startingMarkupBps < input.minimumMarkupBps) {
    throw new KnowledgeCalculationError("INVALID_BASIS_POINTS", "Starting markup must be at least the non-negative minimum markup.");
  }
  const revised = calculateKnowledgeModeBaseRate(input);
  const markupBps = input.markupBasis === "minimum" ? input.minimumMarkupBps : input.startingMarkupBps;
  return { ...revised, totalPaise: applyBasisPoints(revised.revisedAmountPaise, 10_000 + markupBps) };
}
