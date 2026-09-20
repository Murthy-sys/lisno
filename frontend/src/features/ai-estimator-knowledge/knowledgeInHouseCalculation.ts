import type { ModeCalculationSettings } from "./knowledgeModeCalculation";
import type { KnowledgePreview } from "./knowledgeTypes";

export type InHouseCalculationResult = NonNullable<KnowledgePreview["modeCalculation"]>;
export type InHouseMarginBasis = "starting" | "minimum";
export interface InHouseCalculationContext {
  readonly quantity: string;
  readonly quantityScale: number;
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function powerOfTen(scale: number): bigint | undefined {
  return Number.isInteger(scale) && scale >= 0 && scale <= 18 ? 10n ** BigInt(scale) : undefined;
}

function parseScaledDecimal(value: string, scale: number): bigint | undefined {
  const factor = powerOfTen(scale);
  if (factor === undefined || typeof value !== "string" || value.length > 64) return undefined;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/u.exec(value);
  if (!match) return undefined;
  const fraction = match[2] ?? "";
  if (fraction.length > scale) return undefined;
  return BigInt(match[1]!) * factor + BigInt(fraction.padEnd(scale, "0") || "0");
}

function adjustedCost(
  settings: ModeCalculationSettings,
  context: InHouseCalculationContext
): { readonly revisedUnitRatePaise: bigint; readonly revisedAmountPaise: bigint; readonly appliedImpactBps: number } | undefined {
  const quantity = parseScaledDecimal(context.quantity, context.quantityScale);
  const limit = parseScaledDecimal(settings.lowQuantityLimit, context.quantityScale);
  const factor = powerOfTen(context.quantityScale);
  const impactBps = settings.impactBps ?? 1_000;
  if (quantity === undefined || limit === undefined || factor === undefined
    || !isNonNegativeSafeInteger(settings.baseRatePaise)
    || !Number.isSafeInteger(impactBps) || impactBps < 0 || impactBps > Number.MAX_SAFE_INTEGER - 10_000) return undefined;
  const appliedImpactBps = quantity <= limit ? impactBps : 0;
  const revisedUnitRatePaise = divideHalfUp(
    BigInt(settings.baseRatePaise) * BigInt(10_000 + appliedImpactBps),
    10_000n
  );
  const revisedAmountPaise = divideHalfUp(revisedUnitRatePaise * quantity, factor);
  if (revisedUnitRatePaise > BigInt(Number.MAX_SAFE_INTEGER)
    || revisedAmountPaise > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  return { revisedUnitRatePaise, revisedAmountPaise, appliedImpactBps };
}

function priceAtGrossMargin(costPaise: number, marginBps: number): bigint | undefined {
  if (!isNonNegativeSafeInteger(costPaise) || !Number.isSafeInteger(marginBps) || marginBps < 0 || marginBps >= 10_000) return undefined;
  return divideHalfUp(BigInt(costPaise) * 10_000n, 10_000n - BigInt(marginBps));
}

/**
 * Verifies the server-owned In-house money without manufacturing replacement amounts.
 * The legacy settings field names contain "Markup", but their In-house meaning is Gross Margin.
 */
export function reconcilesInHouseCalculation(
  result: InHouseCalculationResult,
  settings: ModeCalculationSettings,
  basis: InHouseMarginBasis,
  requestedDiscountBps: number,
  context: InHouseCalculationContext
): boolean {
  const amounts = [
    result.revisedUnitRatePaise,
    result.revisedAmountPaise,
    result.floorPricePaise,
    result.totalPaise,
    result.appliedImpactBps,
    result.maximumDiscountBps
  ];
  if (amounts.some((value) => !isNonNegativeSafeInteger(value))
    || result.discountBasis !== "selling_price"
    || !Number.isSafeInteger(requestedDiscountBps)
    || requestedDiscountBps < 0
    || requestedDiscountBps > result.maximumDiscountBps) return false;

  const expectedCost = adjustedCost(settings, context);
  if (!expectedCost
    || BigInt(result.revisedUnitRatePaise) !== expectedCost.revisedUnitRatePaise
    || BigInt(result.revisedAmountPaise) !== expectedCost.revisedAmountPaise
    || result.appliedImpactBps !== expectedCost.appliedImpactBps) return false;

  const floorPrice = priceAtGrossMargin(result.revisedAmountPaise, settings.minimumMarkupBps);
  const selectedMarginBps = basis === "minimum" ? settings.minimumMarkupBps : settings.startingMarkupBps;
  const selectedPrice = priceAtGrossMargin(result.revisedAmountPaise, selectedMarginBps);
  if (floorPrice === undefined || selectedPrice === undefined
    || floorPrice > BigInt(Number.MAX_SAFE_INTEGER) || selectedPrice > BigInt(Number.MAX_SAFE_INTEGER)
    || BigInt(result.floorPricePaise) !== floorPrice) return false;

  const expectedMaximum = selectedPrice === 0n
    ? 0n
    : ((selectedPrice - floorPrice) * 10_000n) / selectedPrice;
  if (expectedMaximum < 0n || expectedMaximum > BigInt(Number.MAX_SAFE_INTEGER)
    || BigInt(result.maximumDiscountBps) !== expectedMaximum) return false;

  const discount = result.discount;
  if (!discount) return requestedDiscountBps === 0 && BigInt(result.totalPaise) === selectedPrice;
  if (![discount.rateBps, discount.totalBeforeDiscountPaise, discount.amountPaise].every(isNonNegativeSafeInteger)
    || discount.rateBps !== requestedDiscountBps
    || BigInt(discount.totalBeforeDiscountPaise) !== selectedPrice) return false;

  const expectedDiscount = divideHalfUp(selectedPrice * BigInt(requestedDiscountBps), 10_000n);
  const finalPrice = selectedPrice - expectedDiscount;
  return BigInt(discount.amountPaise) === expectedDiscount
    && BigInt(result.totalPaise) === finalPrice
    && finalPrice >= floorPrice;
}

export function combinedInHouseMaximumDiscountBps(results: readonly InHouseCalculationResult[]): number | undefined {
  if (!results.length || results.some((result) => !isNonNegativeSafeInteger(result.maximumDiscountBps))) return undefined;
  return Math.min(...results.map((result) => result.maximumDiscountBps));
}
