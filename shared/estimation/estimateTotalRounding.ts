/** Final-estimate rounding only. Unit prices, subtotal and GST retain their exact paise. */
export interface RoundedEstimateTotal {
  totalPaise: number;
  roundOffPaise: number;
}

const validPaise = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function calculateEstimateTotal(subtotalPaise: number, gstPaise: number): RoundedEstimateTotal | null {
  if (!validPaise(subtotalPaise) || !validPaise(gstPaise)) return null;
  const unrounded = BigInt(subtotalPaise) + BigInt(gstPaise);
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  if (unrounded > maximum) return null;
  // Exactly fifty paise rounds down; only a larger remainder rounds up.
  const total = (unrounded / 100n + (unrounded % 100n > 50n ? 1n : 0n)) * 100n;
  if (total > maximum) return null;
  return { totalPaise: Number(total), roundOffPaise: Number(total - unrounded) };
}

/** Absent adjustment preserves historical exact totals; an explicit adjustment must match this rule. */
export function estimateTotalsReconcile(value: {
  subtotalPaise?: unknown;
  gstPaise?: unknown;
  totalPaise?: unknown;
  roundOffPaise?: unknown;
}): boolean {
  const { subtotalPaise, gstPaise, totalPaise, roundOffPaise } = value;
  if (!validPaise(subtotalPaise) || !validPaise(gstPaise) || !validPaise(totalPaise)) return false;
  if (roundOffPaise === undefined) return BigInt(subtotalPaise) + BigInt(gstPaise) === BigInt(totalPaise);
  if (typeof roundOffPaise !== "number" || !Number.isSafeInteger(roundOffPaise)) return false;
  const rounded = calculateEstimateTotal(subtotalPaise, gstPaise);
  return rounded !== null && rounded.totalPaise === totalPaise && rounded.roundOffPaise === roundOffPaise;
}
