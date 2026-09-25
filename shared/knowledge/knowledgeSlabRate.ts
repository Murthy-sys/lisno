import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue
} from "./knowledgeTypes";

export type ScaledQuantityParseResult =
  | { readonly status: "valid"; readonly scaledQuantity: bigint; readonly scale: number }
  | { readonly status: "invalid"; readonly reason: "format" | "positive" | "scale" };

const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/u;
const MAX_SAFE_PAISE = BigInt(Number.MAX_SAFE_INTEGER);

/** Parses a positive canonical quantity into an exact integer at the UOM scale. */
export function parseScaledQuantity(
  value: string,
  scale: number
): ScaledQuantityParseResult {
  if (value.length > 64) return { status: "invalid", reason: "format" };
  const match = CANONICAL_DECIMAL.exec(value);
  if (!match) return { status: "invalid", reason: "format" };
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    return { status: "invalid", reason: "scale" };
  }

  const fractional = match[1] ?? "";
  if (fractional.length > scale) {
    return { status: "invalid", reason: "scale" };
  }

  const [whole = "0"] = value.split(".");
  const scaledQuantity = BigInt(whole) * 10n ** BigInt(scale)
    + BigInt(fractional.padEnd(scale, "0") || "0");
  if (scaledQuantity <= 0n) {
    return { status: "invalid", reason: "positive" };
  }
  return { status: "valid", scaledQuantity, scale };
}

/**
 * Calculates Quantity × Unit rate with non-negative integer arithmetic and
 * half-up rounding to the nearest paise. A null result is invalid or unsafe.
 */
export function estimateSlabCostPaise(
  quantity: string,
  unitRatePaise: number | undefined,
  scale: number | undefined
): number | null {
  if (
    scale === undefined ||
    typeof unitRatePaise !== "number" ||
    !Number.isSafeInteger(unitRatePaise) ||
    unitRatePaise < 0
  ) return null;

  const parsed = parseScaledQuantity(quantity, scale);
  if (parsed.status !== "valid") return null;

  const divisor = 10n ** BigInt(parsed.scale);
  const numerator = BigInt(unitRatePaise) * parsed.scaledQuantity;
  const roundedPaise = (numerator + divisor / 2n) / divisor;
  if (roundedPaise > MAX_SAFE_PAISE) return null;
  return Number(roundedPaise);
}

export function slabRateSpecificationIds(
  value: KnowledgeJsonValue | undefined
): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) return ids;
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const specificationId = stringValue(entry.specificationId);
    if (specificationId) ids.add(specificationId);
  }
  return ids;
}

export function objectSlabRates(
  value: KnowledgeJsonValue | undefined
): readonly KnowledgeJsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function stringValue(value: KnowledgeJsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: KnowledgeJsonValue): value is KnowledgeJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
