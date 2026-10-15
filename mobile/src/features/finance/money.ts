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

export const formatPaise = (value: number | null | undefined) => value == null || !Number.isSafeInteger(value) ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
export const formatBps = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Unavailable" : `${value / 100}%`;
export function parseNonnegativeHundredths(value: string): number | null { return /^0(?:\.0{1,2})?$/.test(value.trim()) ? 0 : parseInrToPaise(value); }
export function dateOnlyIso(value: string): string | null { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const parsed = new Date(`${value}T00:00:00.000Z`); return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed.toISOString(); }
