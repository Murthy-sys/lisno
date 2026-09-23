import type { DashboardComparisonMetric } from "./contract";

export const DASHBOARD_UNAVAILABLE_LABEL = "Not available";

const countFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const percentFormatter = new Intl.NumberFormat("en-IN", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const utcDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});
const utcTimestampFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC"
});

function safeDate(value: string | null): Date | null {
  if (value === null) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) ? parsed : null;
}

export function formatDashboardCount(value: number | null): string {
  return value === null || !Number.isSafeInteger(value)
    ? DASHBOARD_UNAVAILABLE_LABEL
    : countFormatter.format(value);
}

export function formatDashboardPaise(value: number | null): string {
  return value === null || !Number.isSafeInteger(value)
    ? DASHBOARD_UNAVAILABLE_LABEL
    : currencyFormatter.format(value / 100);
}

export function formatDashboardBps(value: number | null): string {
  return value === null || !Number.isSafeInteger(value)
    ? DASHBOARD_UNAVAILABLE_LABEL
    : percentFormatter.format(value / 10_000);
}

export function formatDashboardDays(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return DASHBOARD_UNAVAILABLE_LABEL;
  return `${formatDashboardCount(value)} ${value === 1 ? "day" : "days"}`;
}

export function formatDashboardUtcDate(value: string | null): string {
  const date = safeDate(value);
  return date ? utcDateFormatter.format(date) : DASHBOARD_UNAVAILABLE_LABEL;
}

export function formatDashboardTimestamp(value: string | null): string {
  const date = safeDate(value);
  return date ? `${utcTimestampFormatter.format(date)} UTC` : DASHBOARD_UNAVAILABLE_LABEL;
}

export function formatDashboardRange(startAt: string | null, endAt: string | null): string {
  const start = safeDate(startAt);
  const end = safeDate(endAt);
  if (!start || !end) return DASHBOARD_UNAVAILABLE_LABEL;
  return `${utcDateFormatter.format(start)} – ${utcDateFormatter.format(end)}`;
}

export function formatDashboardSignedCount(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return DASHBOARD_UNAVAILABLE_LABEL;
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${formatDashboardCount(Math.abs(value))}`;
}

export function formatDashboardSignedPaise(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return DASHBOARD_UNAVAILABLE_LABEL;
  if (value === 0) return formatDashboardPaise(0);
  return `${value > 0 ? "+" : "−"}${formatDashboardPaise(Math.abs(value))}`;
}

export function formatDashboardSignedBps(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return DASHBOARD_UNAVAILABLE_LABEL;
  if (value === 0) return formatDashboardBps(0);
  return `${value > 0 ? "+" : "−"}${formatDashboardBps(Math.abs(value))}`;
}

export function formatDashboardComparisonChange(metric: DashboardComparisonMetric): string {
  if (metric.changeKind === "unavailable") return DASHBOARD_UNAVAILABLE_LABEL;
  if (metric.changeKind === "new") return "New";
  if (metric.changeKind === "no_change") return "No change";
  return formatDashboardSignedBps(metric.changeBps);
}

export function humanizeDashboardKey(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
