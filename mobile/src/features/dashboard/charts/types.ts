import type { EChartsCoreOption } from "echarts/core";

export type DashboardChartOption = EChartsCoreOption;

export type DashboardChartTone =
  | "violet"
  | "cyan"
  | "gold"
  | "green"
  | "yellow"
  | "red"
  | "muted";

/**
 * Narrow chart input. Display strings are supplied by the data layer so the
 * renderer never reinterprets comparison or availability semantics.
 */
export interface ComparisonMetricDatum {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly current: number | null;
  readonly previous: number | null;
  readonly currentAvailable: boolean;
  readonly previousAvailable: boolean;
  readonly displayCurrent: string;
  readonly displayPrevious: string;
  readonly displayDelta: string;
  readonly changeLabel: string;
}

export interface TrendDatum {
  readonly id: string;
  readonly dayIndex: number;
  readonly currentDate: string;
  readonly previousDate: string | null;
  readonly current: number | null;
  readonly previous: number | null;
}

export interface StageDatum {
  readonly id: string;
  readonly label: string;
  readonly shortLabel?: string;
  readonly value: number | null;
  readonly displayValue: string;
  readonly available?: boolean;
  readonly tone?: DashboardChartTone;
}

export type CapitalDatumKind =
  | "increase"
  | "decrease"
  | "total"
  | "context";

export interface CapitalDatum {
  readonly id: string;
  readonly label: string;
  readonly shortLabel?: string;
  readonly valuePaise: number | null;
  readonly displayValue: string;
  readonly available?: boolean;
  readonly kind?: CapitalDatumKind;
  readonly tone?: DashboardChartTone;
}

export interface RiskDatum extends StageDatum {
  readonly severity?: "low" | "medium" | "high" | "unknown";
}

export interface OverviewChartData {
  readonly lifecycle: readonly StageDatum[];
  readonly risk: readonly RiskDatum[];
}

export interface DeliveryChartData {
  readonly stages: readonly StageDatum[];
}

export interface CapitalChartData {
  /** Quantitative and context values for the two-lane paise flow scene. */
  readonly flow: readonly CapitalDatum[];
}

export interface PeopleChartData {
  readonly activeWorkers: StageDatum;
  readonly roles: readonly StageDatum[];
  readonly workload: readonly StageDatum[];
  readonly governance: readonly StageDatum[];
}

export type DashboardChartModuleId =
  | "overview"
  | "delivery"
  | "capital"
  | "people";

export interface DashboardChartSelection {
  readonly id: string;
  readonly seriesId: string | null;
}

export interface DashboardChartMotion {
  readonly reducedMotion: boolean;
}
