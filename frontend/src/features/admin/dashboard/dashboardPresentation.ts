import { ROLE_LABELS, type WorkerRole } from "../../../api/authorization-contract";
import type { StatusTone } from "../../../components/ui/StatusBadge";
import { formatBps, formatPaise } from "../../finance/financeFormat";
import type {
  DashboardDataQuality,
  DashboardProjectModuleStatus,
  DashboardRatio,
  DashboardRiskLevel
} from "./superAdminDashboardApi";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric"
});
const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit"
});

export { formatBps, formatPaise };

export const formatNullablePaise = (value: number | null) =>
  value === null ? "Not available" : formatPaise(value);

export function isDashboardMetricUnavailable(
  dataQuality: DashboardDataQuality,
  metricKey: string
) {
  return dataQuality.unavailableMetricKeys.some(
    (unavailableKey) =>
      unavailableKey === metricKey || metricKey.startsWith(`${unavailableKey}.`)
  );
}

export function dashboardMetricUnavailableReason(
  dataQuality: DashboardDataQuality,
  metricKey: string
) {
  return dataQuality.issues.find(
    (issue) =>
      issue.metricKey === metricKey || metricKey.startsWith(`${issue.metricKey}.`)
  )?.message ?? "Authoritative data is unavailable for this metric.";
}

export function dashboardMetricPresentation(
  dataQuality: DashboardDataQuality,
  metricKey: string,
  value: string | number,
  detail?: string
) {
  if (!isDashboardMetricUnavailable(dataQuality, metricKey)) {
    return { value, detail, unavailable: false as const };
  }
  return {
    value: "Not available",
    detail: dashboardMetricUnavailableReason(dataQuality, metricKey),
    unavailable: true as const
  };
}

export const formatDashboardDate = (value: string | null) =>
  value ? dateFormatter.format(new Date(value)) : "Not available";

export const formatDashboardTimestamp = (value: string | null) =>
  value ? timeFormatter.format(new Date(value)) : "Not available";

export function formatDashboardRatio(ratio: DashboardRatio) {
  return ratio.rateBps === null ? "Not available" : formatBps(ratio.rateBps);
}

export const ratioDetail = (ratio: DashboardRatio, noun = "records") =>
  `${ratio.numerator} of ${ratio.denominator} ${noun}`;

export const formatDays = (value: number | null) =>
  value === null ? "Not available" : `${value} ${value === 1 ? "day" : "days"}`;

export function humanize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function riskPresentation(level: DashboardRiskLevel): {
  label: string;
  tone: StatusTone;
} {
  if (level === "red") return { label: "Red risk", tone: "danger" };
  if (level === "yellow") return { label: "Yellow risk", tone: "warning" };
  if (level === "green") return { label: "Clear", tone: "success" };
  return { label: "Not tracked", tone: "neutral" };
}

export const moduleStatusLabel = (status: DashboardProjectModuleStatus | string) =>
  humanize(status);

export const workerRoleLabel = (role: WorkerRole) => ROLE_LABELS[role];
