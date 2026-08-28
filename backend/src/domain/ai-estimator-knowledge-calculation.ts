import type {
  KnowledgeCanonicalDecimal,
  KnowledgePreview,
  KnowledgePreviewAmountComponent
} from "../contracts/ai-estimator-knowledge.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS,
  AI_ESTIMATOR_KNOWLEDGE_FORMULA_VERSION,
  AI_ESTIMATOR_KNOWLEDGE_MAX_MONEY_PAISE,
  type KnowledgeDurationUnit,
  type KnowledgeTaxTreatment
} from "./ai-estimator-knowledge.js";

const DECIMAL_PATTERN = /^(0|[1-9]\d*)(?:\.(\d+))?$/u;
const TEN = 10n;
const DURATION_SCALE = 6;

export class KnowledgeCalculationError extends Error {
  constructor(
    public readonly code:
      | "INVALID_DECIMAL"
      | "INVALID_SCALE"
      | "INVALID_AMOUNT"
      | "INVALID_BASIS_POINTS"
      | "DIVISION_BY_ZERO"
      | "UNSAFE_RESULT",
    message: string
  ) {
    super(message);
    this.name = "KnowledgeCalculationError";
  }
}

function powerOfTen(scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new KnowledgeCalculationError(
      "INVALID_SCALE",
      "Decimal scale must be an integer between 0 and 18."
    );
  }
  return TEN ** BigInt(scale);
}

function assertSafeMoney(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > AI_ESTIMATOR_KNOWLEDGE_MAX_MONEY_PAISE
  ) {
    throw new KnowledgeCalculationError(
      "INVALID_AMOUNT",
      "Money must be a nonnegative safe integer in paise."
    );
  }
}

function checkedNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new KnowledgeCalculationError(
      "UNSAFE_RESULT",
      "The calculated value exceeds the supported safe-integer boundary."
    );
  }
  return Number(value);
}

export function divideRoundHalfUp(
  numerator: bigint,
  denominator: bigint
): bigint {
  if (denominator === 0n) {
    throw new KnowledgeCalculationError(
      "DIVISION_BY_ZERO",
      "Cannot divide by zero."
    );
  }
  if (numerator < 0n || denominator < 0n) {
    throw new KnowledgeCalculationError(
      "INVALID_AMOUNT",
      "Half-up division accepts nonnegative operands only."
    );
  }
  return (numerator + denominator / 2n) / denominator;
}

export function parseScaledDecimal(value: string, scale: number): bigint {
  powerOfTen(scale);
  if (value.length > 64) {
    throw new KnowledgeCalculationError(
      "INVALID_DECIMAL",
      "Decimal value exceeds the supported length."
    );
  }
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) {
    throw new KnowledgeCalculationError(
      "INVALID_DECIMAL",
      "Value must be a canonical nonnegative decimal string."
    );
  }
  const fraction = match[2] ?? "";
  if (fraction.length > scale) {
    throw new KnowledgeCalculationError(
      "INVALID_DECIMAL",
      `Value supports at most ${scale} fractional digits.`
    );
  }
  return BigInt(match[1]) * powerOfTen(scale) +
    BigInt(fraction.padEnd(scale, "0") || "0");
}

export function formatScaledDecimal(
  scaledValue: bigint,
  scale: number
): KnowledgeCanonicalDecimal {
  const factor = powerOfTen(scale);
  if (scaledValue < 0n) {
    throw new KnowledgeCalculationError(
      "INVALID_DECIMAL",
      "Scaled decimals cannot be negative."
    );
  }
  if (scale === 0) return scaledValue.toString();
  const integer = scaledValue / factor;
  const fraction = (scaledValue % factor)
    .toString()
    .padStart(scale, "0")
    .replace(/0+$/u, "");
  return fraction.length > 0 ? `${integer}.${fraction}` : integer.toString();
}

export function canonicalizeScaledDecimal(
  value: string,
  scale: number
): KnowledgeCanonicalDecimal {
  return formatScaledDecimal(parseScaledDecimal(value, scale), scale);
}

export function applyBasisPoints(
  basisAmountPaise: number,
  basisPoints: number
): number {
  assertSafeMoney(basisAmountPaise);
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new KnowledgeCalculationError(
      "INVALID_BASIS_POINTS",
      "Basis points must be a nonnegative safe integer."
    );
  }
  return checkedNumber(
    divideRoundHalfUp(
      BigInt(basisAmountPaise) * BigInt(basisPoints),
      BigInt(AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS)
    )
  );
}

export function adjustMoneyByBasisPoints(
  basisAmountPaise: number,
  adjustmentBps: number
): number {
  assertSafeMoney(basisAmountPaise);
  if (
    !Number.isSafeInteger(adjustmentBps) ||
    adjustmentBps < 0 ||
    adjustmentBps > AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS
  ) {
    throw new KnowledgeCalculationError(
      "INVALID_BASIS_POINTS",
      "Adjustment basis points must be between 0 and 10000."
    );
  }
  const multiplier = AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS + adjustmentBps;
  return checkedNumber(
    divideRoundHalfUp(
      BigInt(basisAmountPaise) * BigInt(multiplier),
      BigInt(AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS)
    )
  );
}

export function calculateMarginSellingPrice(
  basisAmountPaise: number,
  marginBps: number
): number {
  assertSafeMoney(basisAmountPaise);
  if (
    !Number.isSafeInteger(marginBps) ||
    marginBps < 0 ||
    marginBps >= AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS
  ) {
    throw new KnowledgeCalculationError(
      "INVALID_BASIS_POINTS",
      "Margin must be between 0 and 9999 basis points."
    );
  }
  return checkedNumber(
    divideRoundHalfUp(
      BigInt(basisAmountPaise) *
        BigInt(AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS),
      BigInt(AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS - marginBps)
    )
  );
}

export interface KnowledgeTaxAmounts {
  inputAmountPaise: number;
  baseAmountPaise: number;
  taxAmountPaise: number;
  totalAmountPaise: number;
  treatment: KnowledgeTaxTreatment;
  rateBps: number;
}

export function deriveTaxAmounts(input: {
  inputAmountPaise: number;
  rateBps: number;
  treatment: KnowledgeTaxTreatment;
}): KnowledgeTaxAmounts {
  assertSafeMoney(input.inputAmountPaise);
  if (!Number.isSafeInteger(input.rateBps) || input.rateBps < 0) {
    throw new KnowledgeCalculationError(
      "INVALID_BASIS_POINTS",
      "Tax rate must be nonnegative integer basis points."
    );
  }

  if (input.treatment === "exclusive") {
    const taxAmountPaise = applyBasisPoints(
      input.inputAmountPaise,
      input.rateBps
    );
    const total = BigInt(input.inputAmountPaise) + BigInt(taxAmountPaise);
    return {
      ...input,
      baseAmountPaise: input.inputAmountPaise,
      taxAmountPaise,
      totalAmountPaise: checkedNumber(total)
    };
  }

  const baseAmountPaise = checkedNumber(
    divideRoundHalfUp(
      BigInt(input.inputAmountPaise) *
        BigInt(AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS),
      BigInt(AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS + input.rateBps)
    )
  );
  return {
    ...input,
    baseAmountPaise,
    taxAmountPaise: input.inputAmountPaise - baseAmountPaise,
    totalAmountPaise: input.inputAmountPaise
  };
}

export function multiplyMoneyByQuantity(
  unitAmountPaise: number,
  quantity: string,
  quantityScale: number
): number {
  assertSafeMoney(unitAmountPaise);
  const scaledQuantity = parseScaledDecimal(quantity, quantityScale);
  return checkedNumber(
    divideRoundHalfUp(
      BigInt(unitAmountPaise) * scaledQuantity,
      powerOfTen(quantityScale)
    )
  );
}

export function calculateProcurementQuantity(input: {
  quantity: string;
  quantityScale: number;
  wastageBps: number;
}): KnowledgeCanonicalDecimal {
  if (!Number.isSafeInteger(input.wastageBps) || input.wastageBps < 0) {
    throw new KnowledgeCalculationError(
      "INVALID_BASIS_POINTS",
      "Wastage must be nonnegative integer basis points."
    );
  }
  const quantity = parseScaledDecimal(input.quantity, input.quantityScale);
  const adjusted = divideRoundHalfUp(
    quantity *
      BigInt(AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS + input.wastageBps),
    BigInt(AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS)
  );
  return formatScaledDecimal(adjusted, input.quantityScale);
}

function compareDecimals(
  left: string,
  right: string,
  scale = DURATION_SCALE
): number {
  const leftValue = parseScaledDecimal(left, scale);
  const rightValue = parseScaledDecimal(right, scale);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function calculateDuration(input: {
  quantity: string;
  quantityScale: number;
  productivity: string;
  productivityScale: number;
  unit: KnowledgeDurationUnit;
  minimum?: string | null;
  maximum?: string | null;
}): {
  raw: KnowledgeCanonicalDecimal;
  clamped: KnowledgeCanonicalDecimal;
  unit: KnowledgeDurationUnit;
} {
  const quantity = parseScaledDecimal(input.quantity, input.quantityScale);
  const productivity = parseScaledDecimal(
    input.productivity,
    input.productivityScale
  );
  if (productivity === 0n) {
    throw new KnowledgeCalculationError(
      "DIVISION_BY_ZERO",
      "Productivity must be greater than zero."
    );
  }

  const numerator =
    quantity * powerOfTen(input.productivityScale + DURATION_SCALE);
  const denominator =
    productivity * powerOfTen(input.quantityScale);
  const rounded = divideRoundHalfUp(numerator, denominator);
  const raw = formatScaledDecimal(rounded, DURATION_SCALE);
  let clamped = raw;

  if (input.minimum !== undefined && input.minimum !== null) {
    const minimum = canonicalizeScaledDecimal(input.minimum, DURATION_SCALE);
    if (compareDecimals(clamped, minimum) < 0) clamped = minimum;
  }
  if (input.maximum !== undefined && input.maximum !== null) {
    const maximum = canonicalizeScaledDecimal(input.maximum, DURATION_SCALE);
    if (compareDecimals(clamped, maximum) > 0) clamped = maximum;
  }

  return { raw, clamped, unit: input.unit };
}

function amountComponent(
  amountPaise: number,
  basisAmountPaise: number,
  rateBps: number | null
): KnowledgePreviewAmountComponent {
  return { amountPaise, basisAmountPaise, rateBps };
}

export interface CalculateKnowledgePreviewInput {
  priceVersionId?: string | null;
  taxVersionId?: string | null;
  unitRatePaise?: number | null;
  quantityAdjustmentBps?: number | null;
  quantity?: string | null;
  quantityScale: number;
  wastageBps?: number | null;
  taxRateBps?: number | null;
  taxTreatment?: KnowledgeTaxTreatment | null;
  startMarginBps?: number | null;
  bottomMarginBps?: number | null;
  pmcMarkupBps?: number | null;
  duration?: {
    productivity: string;
    productivityScale: number;
    unit: KnowledgeDurationUnit;
    minimum?: string | null;
    maximum?: string | null;
  } | null;
}

export function calculateKnowledgePreview(
  input: CalculateKnowledgePreviewInput
): KnowledgePreview {
  const baseRate = input.unitRatePaise ?? null;
  if (baseRate !== null) assertSafeMoney(baseRate);
  const adjustedRate =
    baseRate === null
      ? null
      : adjustMoneyByBasisPoints(baseRate, input.quantityAdjustmentBps ?? 0);
  const requiredQuantity =
    input.quantity === undefined || input.quantity === null
      ? null
      : canonicalizeScaledDecimal(input.quantity, input.quantityScale);
  const procurementQuantity =
    requiredQuantity === null
      ? null
      : calculateProcurementQuantity({
          quantity: requiredQuantity,
          quantityScale: input.quantityScale,
          wastageBps: input.wastageBps ?? 0
        });
  const vendorInput =
    adjustedRate === null || requiredQuantity === null
      ? null
      : multiplyMoneyByQuantity(
          adjustedRate,
          requiredQuantity,
          input.quantityScale
        );
  const tax =
    vendorInput === null ||
    input.taxRateBps === undefined ||
    input.taxRateBps === null ||
    input.taxTreatment === undefined ||
    input.taxTreatment === null
      ? null
      : deriveTaxAmounts({
          inputAmountPaise: vendorInput,
          rateBps: input.taxRateBps,
          treatment: input.taxTreatment
        });
  const marginBasis = adjustedRate;
  const startMargin =
    marginBasis === null || input.startMarginBps == null
      ? null
      : calculateMarginSellingPrice(marginBasis, input.startMarginBps);
  const bottomMargin =
    marginBasis === null || input.bottomMarginBps == null
      ? null
      : calculateMarginSellingPrice(marginBasis, input.bottomMarginBps);
  const pmc =
    marginBasis === null || input.pmcMarkupBps == null
      ? null
      : applyBasisPoints(marginBasis, input.pmcMarkupBps);
  const duration =
    requiredQuantity === null || input.duration == null
      ? null
      : calculateDuration({
          quantity: requiredQuantity,
          quantityScale: input.quantityScale,
          productivity: input.duration.productivity,
          productivityScale: input.duration.productivityScale,
          unit: input.duration.unit,
          minimum: input.duration.minimum,
          maximum: input.duration.maximum
        });

  return {
    formulaVersion: AI_ESTIMATOR_KNOWLEDGE_FORMULA_VERSION,
    effectivePriceVersionId: input.priceVersionId ?? null,
    taxVersionId: input.taxVersionId ?? null,
    effectiveUnitRatePaise: baseRate,
    adjustedUnitRate:
      adjustedRate === null || baseRate === null
        ? null
        : amountComponent(
            adjustedRate,
            baseRate,
            input.quantityAdjustmentBps ?? 0
          ),
    requiredQuantity,
    procurementQuantity,
    vendorPreTax:
      tax === null
        ? vendorInput === null
          ? null
          : amountComponent(vendorInput, vendorInput, null)
        : amountComponent(tax.baseAmountPaise, vendorInput!, null),
    vendorTax:
      tax === null
        ? null
        : amountComponent(tax.taxAmountPaise, tax.baseAmountPaise, tax.rateBps),
    vendorTotal:
      tax === null
        ? null
        : amountComponent(tax.totalAmountPaise, tax.baseAmountPaise, tax.rateBps),
    startMargin:
      startMargin === null || marginBasis === null
        ? null
        : amountComponent(startMargin, marginBasis, input.startMarginBps!),
    bottomMargin:
      bottomMargin === null || marginBasis === null
        ? null
        : amountComponent(bottomMargin, marginBasis, input.bottomMarginBps!),
    pmcMarkup:
      pmc === null || marginBasis === null
        ? null
        : amountComponent(pmc, marginBasis, input.pmcMarkupBps!),
    duration
  };
}
