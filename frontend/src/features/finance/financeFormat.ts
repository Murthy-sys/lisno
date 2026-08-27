const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

export function formatPaise(value: number) {
  return money.format(value / 100);
}

export function formatBps(value: number | null) {
  return value === null ? "Not available" : `${(value / 100).toFixed(2)}%`;
}

export function formatPercentage(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.max(0, (value / total) * 100).toFixed(1)}%`;
}

/** Whole-percent share of a stacked total, for chart labels and tooltips. */
export function formatShare(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}
