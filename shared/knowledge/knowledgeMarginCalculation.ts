import type { KnowledgePreview } from "./knowledgeTypes";
import { CUSTOM_SIMULATOR_DISCOUNT_MAX_BPS } from "./knowledgeSimulatorDiscount";

export type MarginCalculationResult = Omit<NonNullable<KnowledgePreview["pmcCalculation"]>, "pmcMarginBps" | "pmcMarginAmountPaise"> & {
  readonly marginBps: number;
  readonly marginAmountPaise: number;
};

export function reconcilesMarginCalculation(calculation: MarginCalculationResult, scope: "pmc" | "sub_vendor", configuredImpactBps: number, quantity: string, limit: string, scale: number) {
  const discountAmount = calculation.discount ? calculation.discount.amountPaise : 0;
  const amounts = [calculation.baseAmountPaise, calculation.lowQuantityImpactAmountPaise,
    calculation.revisedUnitRatePaise, calculation.revisedAmountPaise, calculation.marginAmountPaise,
    calculation.totalBeforeDiscountPaise, calculation.totalPaise, discountAmount];
  if (amounts.some((value) => !Number.isSafeInteger(value) || value < 0)) return false;
  if (!Number.isSafeInteger(calculation.finalVendorChargesPaise)) return false;
  const scaledQuantity = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  };
  const lowQuantityApplies = scaledQuantity(quantity) <= scaledQuantity(limit);
  if (calculation.appliedImpactBps !== (lowQuantityApplies ? configuredImpactBps : 0)
    || (!lowQuantityApplies && calculation.lowQuantityImpactAmountPaise !== 0)
    || (configuredImpactBps === 0 && calculation.lowQuantityImpactAmountPaise !== 0)) return false;
  if (calculation.discount && (!Number.isSafeInteger(calculation.discount.rateBps) || calculation.discount.rateBps < 0 || calculation.discount.rateBps > CUSTOM_SIMULATOR_DISCOUNT_MAX_BPS
    || calculation.discount.totalBeforeDiscountPaise !== calculation.totalBeforeDiscountPaise
    || (calculation.discount.rateBps === 0 && discountAmount !== 0))) return false;
  if (!Number.isSafeInteger(calculation.marginBps) || calculation.marginBps < 0 || calculation.marginBps >= 10_000) return false;
  const denominator = 10_000n - BigInt(calculation.marginBps);
  // Verify the server's rounded selling price; never substitute a UI-calculated amount.
  const sellingPrice = (BigInt(calculation.revisedAmountPaise) * 10_000n + denominator / 2n) / denominator;
  if (BigInt(calculation.totalBeforeDiscountPaise) !== sellingPrice) return false;
  const discountBasis = scope === "pmc" ? BigInt(calculation.marginAmountPaise) : sellingPrice;
  const expectedDiscount = (discountBasis * BigInt(calculation.discount?.rateBps ?? 0) + 5_000n) / 10_000n;
  if (BigInt(discountAmount) !== expectedDiscount) return false;
  const finalVendorReconciles = scope === "pmc"
    ? calculation.finalVendorChargesPaise === calculation.revisedAmountPaise
    : BigInt(calculation.finalVendorChargesPaise) + BigInt(calculation.marginAmountPaise) === BigInt(calculation.totalPaise);
  return BigInt(calculation.baseAmountPaise) + BigInt(calculation.lowQuantityImpactAmountPaise) === BigInt(calculation.revisedAmountPaise)
    && BigInt(calculation.revisedAmountPaise) + BigInt(calculation.marginAmountPaise) === BigInt(calculation.totalBeforeDiscountPaise)
    && BigInt(calculation.totalBeforeDiscountPaise) - BigInt(discountAmount) === BigInt(calculation.totalPaise)
    && finalVendorReconciles;
}
