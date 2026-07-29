export type QuantityBasis = "area" | "area_x2" | "perimeter" | "1" | "custom";
export interface QuantityRoom { sqft: number; length: number | null; width: number | null; }
export interface CalculatedLine { included: boolean; quantity: number; rate: number; }

export function defaultQuantity(basis: QuantityBasis, room: QuantityRoom): number {
  const area = room.sqft || 100;
  const perimeter = room.length && room.width
    ? Math.round(2 * (room.length + room.width))
    : Math.round(4 * Math.sqrt(area));
  if (basis === "area") return area;
  if (basis === "area_x2") return area * 2;
  if (basis === "perimeter") return perimeter;
  return 1;
}

export function resolveRate(row: { baseRate: number; rates: Record<string, number> | null }, specification: string): number {
  return row.rates?.[specification] ?? row.baseRate ?? 0;
}

export function calculateEstimateTotals(lines: readonly CalculatedLine[]) {
  const subtotal = lines.reduce((sum, line) => sum + (line.included ? Math.round(line.quantity * line.rate) : 0), 0);
  const gst = Math.round(subtotal * .18);
  return { subtotal, gst, total: subtotal + gst };
}
