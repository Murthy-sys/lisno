import React, { useMemo } from "react";

import { buildCapitalOption } from "./capital";
import { buildDeliveryOption } from "./delivery";
import { EChartsSurface } from "./EChartsSurface";
import {
  buildBudgetPositionOption,
  buildCostCompositionDonutOption,
  buildFinanceActivityOption,
  buildLifecycleDonutOption,
  type BudgetPositionChartData,
  type FinanceActivityChartData
} from "./executive";
import { buildHeroComparisonOption } from "./heroComparison";
import { buildOverviewOption } from "./overview";
import { buildPeopleOption } from "./people";
import { buildTrendOption } from "./trend";
import type {
  CapitalChartData,
  ComparisonMetricDatum,
  DashboardChartModuleId,
  DeliveryChartData,
  OverviewChartData,
  PeopleChartData,
  StageDatum,
  TrendDatum
} from "./types";

interface ChartComponentBaseProps {
  readonly reducedMotion: boolean;
  readonly height?: number | undefined;
  readonly retryKey?: string | number | undefined;
  readonly onRenderError?: ((error: Error) => void) | undefined;
}

export interface FinanceActivityChartProps extends ChartComponentBaseProps {
  readonly data: FinanceActivityChartData;
  readonly onSelectDay?: ((dayId: string) => void) | undefined;
}

export function FinanceActivityChart({
  data,
  reducedMotion,
  height = 250,
  retryKey,
  onSelectDay,
  onRenderError
}: FinanceActivityChartProps) {
  const option = useMemo(
    () => buildFinanceActivityOption(data, reducedMotion),
    [data, reducedMotion]
  );
  return (
    <EChartsSurface
      accessibilitySummary="Recorded cost activity by UTC day with approved net revenue and cost budget snapshot guides. Exact daily values are available below."
      height={height}
      onRenderError={onRenderError}
      onSelectDatum={({ id }) => onSelectDay?.(id)}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-finance-activity-chart"
    />
  );
}

export interface ExecutiveRingChartProps extends ChartComponentBaseProps {
  readonly values: readonly StageDatum[];
  readonly centerDisplay: string;
}

export function LifecycleDonutChart({
  values,
  centerDisplay,
  reducedMotion,
  height = 220,
  retryKey,
  onRenderError
}: ExecutiveRingChartProps) {
  const option = useMemo(
    () => buildLifecycleDonutOption(values, centerDisplay, reducedMotion),
    [centerDisplay, reducedMotion, values]
  );
  return (
    <EChartsSurface
      accessibilitySummary="Current project lifecycle distribution. Exact stage counts are listed below."
      height={height}
      onRenderError={onRenderError}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-lifecycle-chart"
    />
  );
}

export function CostCompositionDonutChart({
  values,
  centerDisplay,
  reducedMotion,
  height = 220,
  retryKey,
  onRenderError
}: ExecutiveRingChartProps) {
  const option = useMemo(
    () => buildCostCompositionDonutOption(values, centerDisplay, reducedMotion),
    [centerDisplay, reducedMotion, values]
  );
  return (
    <EChartsSurface
      accessibilitySummary="Recorded cost composition across procurement, employee payments, other expenses, and overheads. Exact paise values are listed below."
      height={height}
      onRenderError={onRenderError}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-cost-composition-chart"
    />
  );
}

export interface BudgetPositionChartProps extends ChartComponentBaseProps {
  readonly data: BudgetPositionChartData;
}

export function BudgetPositionChart({
  data,
  reducedMotion,
  height = 150,
  retryKey,
  onRenderError
}: BudgetPositionChartProps) {
  const option = useMemo(
    () => buildBudgetPositionOption(data, reducedMotion),
    [data, reducedMotion]
  );
  return (
    <EChartsSurface
      accessibilitySummary="Approved cost budget compared with recorded cost. The exact remaining or overspent position is listed below."
      height={height}
      onRenderError={onRenderError}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-budget-position-chart"
    />
  );
}

export interface HeroComparisonChartProps extends ChartComponentBaseProps {
  readonly metrics: readonly ComparisonMetricDatum[];
  readonly selectedMetricId: string | null;
  readonly showPrevious: boolean;
  readonly onSelectMetric?: ((metricId: string) => void) | undefined;
}

export function HeroComparisonChart({
  metrics,
  selectedMetricId,
  showPrevious,
  reducedMotion,
  height = 320,
  retryKey,
  onSelectMetric,
  onRenderError
}: HeroComparisonChartProps) {
  const option = useMemo(
    () =>
      buildHeroComparisonOption({
        metrics,
        selectedMetricId,
        showPrevious,
        reducedMotion
      }),
    [metrics, reducedMotion, selectedMetricId, showPrevious]
  );
  return (
    <EChartsSurface
      accessibilitySummary="Current and previous period operations constellation. Screen-space orb area encodes counts and depth separates periods. Exact values and metric selection are available below."
      height={height}
      onRenderError={onRenderError}
      onSelectDatum={({ id }) => onSelectMetric?.(id)}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-hero-chart"
    />
  );
}

export interface DailyVelocityChartProps extends ChartComponentBaseProps {
  readonly metricId: string;
  readonly metricLabel: string;
  readonly points: readonly TrendDatum[];
  readonly showPrevious: boolean;
  readonly selectedDayIndex?: number | undefined;
  readonly onSelectDay?: ((dayId: string) => void) | undefined;
}

export function DailyVelocityChart({
  metricId,
  metricLabel,
  points,
  showPrevious,
  selectedDayIndex,
  reducedMotion,
  height = 230,
  retryKey,
  onSelectDay,
  onRenderError
}: DailyVelocityChartProps) {
  const option = useMemo(
    () =>
      buildTrendOption({
        metricId,
        metricLabel,
        points,
        showPrevious,
        reducedMotion,
        selectedDayIndex
      }),
    [metricId, metricLabel, points, reducedMotion, selectedDayIndex, showPrevious]
  );
  return (
    <EChartsSurface
      accessibilitySummary={`${metricLabel} temporal ribbon field. Exact UTC dates and values are available in the native day navigator below the chart.`}
      height={height}
      onRenderError={onRenderError}
      onSelectDatum={({ id }) => onSelectDay?.(id)}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-trend-chart"
    />
  );
}

export interface OverviewChartProps extends ChartComponentBaseProps {
  readonly data: OverviewChartData;
}

export function OverviewChart({
  data,
  reducedMotion,
  height = 360,
  retryKey,
  onRenderError
}: OverviewChartProps) {
  const option = useMemo(
    () => buildOverviewOption(data, reducedMotion),
    [data, reducedMotion]
  );
  return (
    <EChartsSurface
      accessibilitySummary="Project lifecycle orbit and risk field. Orb area encodes counts; paths show canonical order only. Exact values are available below the graphic."
      height={height}
      onRenderError={onRenderError}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-overview-chart"
    />
  );
}

export interface DeliveryChartProps extends ChartComponentBaseProps {
  readonly data: DeliveryChartData;
}

export function DeliveryChart({
  data,
  reducedMotion,
  height = 290,
  retryKey,
  onRenderError
}: DeliveryChartProps) {
  const option = useMemo(
    () => buildDeliveryOption(data, reducedMotion),
    [data, reducedMotion]
  );
  return (
    <EChartsSurface
      accessibilitySummary="Estimation, design, procurement, and execution snapshot corridors. Orb area encodes current counts; connectors show order, not conversion."
      height={height}
      onRenderError={onRenderError}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-delivery-chart"
    />
  );
}

export interface CapitalChartProps extends ChartComponentBaseProps {
  readonly data: CapitalChartData;
}

export function CapitalChart({
  data,
  reducedMotion,
  height = 300,
  retryKey,
  onRenderError
}: CapitalChartProps) {
  const option = useMemo(
    () => buildCapitalOption(data, reducedMotion),
    [data, reducedMotion]
  );
  return (
    <EChartsSurface
      accessibilitySummary="Capital plan and live-flow ribbons. Ribbon width is proportional to paise and negative outcomes route downward. Contract total and GST remain context below."
      height={height}
      onRenderError={onRenderError}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-capital-chart"
    />
  );
}

export interface PeopleChartProps extends ChartComponentBaseProps {
  readonly data: PeopleChartData;
}

export function PeopleChart({
  data,
  reducedMotion,
  height = 380,
  retryKey,
  onRenderError
}: PeopleChartProps) {
  const option = useMemo(
    () => buildPeopleOption(data, reducedMotion),
    [data, reducedMotion]
  );
  return (
    <EChartsSurface
      accessibilitySummary="Workforce aggregate topology with assignment satellites and governance nodes. Orb area encodes aggregate counts, not individual workers."
      height={height}
      onRenderError={onRenderError}
      option={option}
      reducedMotion={reducedMotion}
      retryKey={retryKey}
      testID="dashboard-people-chart"
    />
  );
}

type DashboardModuleChartSpecificProps =
  | { readonly module: "overview"; readonly data: OverviewChartData }
  | { readonly module: "delivery"; readonly data: DeliveryChartData }
  | { readonly module: "capital"; readonly data: CapitalChartData }
  | { readonly module: "people"; readonly data: PeopleChartData };

export type DashboardModuleChartProps = ChartComponentBaseProps &
  DashboardModuleChartSpecificProps;

export function DashboardModuleChart(props: DashboardModuleChartProps) {
  const shared = {
    reducedMotion: props.reducedMotion,
    ...(props.height === undefined ? {} : { height: props.height }),
    ...(props.retryKey === undefined ? {} : { retryKey: props.retryKey }),
    ...(props.onRenderError === undefined
      ? {}
      : { onRenderError: props.onRenderError })
  };
  switch (props.module) {
    case "overview":
      return <OverviewChart {...shared} data={props.data} />;
    case "delivery":
      return <DeliveryChart {...shared} data={props.data} />;
    case "capital":
      return <CapitalChart {...shared} data={props.data} />;
    case "people":
      return <PeopleChart {...shared} data={props.data} />;
  }
}

export function isDashboardChartModuleId(
  value: string
): value is DashboardChartModuleId {
  return ["overview", "delivery", "capital", "people"].includes(value);
}
