export function parseInrToPaise(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [rupees = "0", fraction = ""] = normalized.split(".");
  const amount = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function createIdempotencyKey(now = Date.now(), random = Math.random()): string {
  return `mobile-${now.toString(36)}-${random.toString(36).slice(2, 14).padEnd(8, "0")}`;
}
