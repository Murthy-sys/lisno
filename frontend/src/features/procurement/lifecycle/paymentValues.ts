/** Parse a user-entered rupee amount without floating-point rounding. */
export function paymentPaise(value: string, label = "Amount"): number {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(value.trim())) throw new Error(`${label}: enter rupees with at most two decimal places.`);
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds the supported amount.`);
  return Number(amount);
}
export function paymentRupees(value: number): string { return `${Math.trunc(value / 100)}.${String(value % 100).padStart(2, "0")}`; }
export function paymentSum(values: number[]): number {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The allocation total exceeds the supported amount.");
  return Number(total);
}
export const paymentLabel = (value: string) => value.replaceAll("_", " ").replace(/^./u, letter => letter.toUpperCase());
export const paymentError = (error: unknown) => error instanceof Error ? error.message : "The payment record could not be saved.";
