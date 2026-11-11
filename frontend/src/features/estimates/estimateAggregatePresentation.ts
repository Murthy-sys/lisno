import { readEstimateAggregatePricing, type EstimateAggregatePricing } from "../../../../shared/estimation/estimateAggregatePricing";

interface AggregatePolicy {
  aggregatePricing?: EstimateAggregatePricing;
  inHouseUsage?: "estimator" | "execution" | null;
  inHousePricingState?: "ready" | "incomplete" | "invalid";
}

export const hasGovernedInHousePrice = (value: AggregatePolicy | undefined): boolean => Boolean(value &&
  (value.aggregatePricing !== undefined || value.inHouseUsage !== undefined || value.inHousePricingState !== undefined));

/** Frozen/read-only views validate their own evidence, never a live Configuration version. */
export function lineAggregatePrice(line: { mainLineId?: string; quantity: number; pricingMode?: string | null },
  value: AggregatePolicy & { modeTier?: string; pricingBasis?: string; amountPaise?: number | null; included?: boolean }): EstimateAggregatePricing | null {
  const pricing = readEstimateAggregatePricing(value.aggregatePricing);
  return pricing && line.pricingMode === "in_house" && value.pricingBasis === pricing.formulaVersion &&
    pricing.mainLineId === line.mainLineId && pricing.modeTier === (value.modeTier ?? "signature") &&
    Number(pricing.quantity) === line.quantity && (value.included === false ? 0 : pricing.totalPaise) === value.amountPaise ? pricing : null;
}
