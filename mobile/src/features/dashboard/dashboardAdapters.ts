import type {
  CapitalChartData,
  CapitalDatum,
  ComparisonMetricDatum,
  DashboardChartTone,
  DeliveryChartData,
  FinanceActivityChartData,
  OverviewChartData,
  BudgetPositionChartData,
  PeopleChartData,
  RiskDatum,
  StageDatum,
  TrendDatum
} from "./charts";
import type { DashboardValueGroup, DashboardValueRow } from "./components";
import type {
  DashboardCountComparisonMetricId,
  DashboardDeliveryModuleView,
  DashboardHeroMetricView,
  DashboardTrendSeriesView,
  DashboardValueView,
  DashboardViewModel
} from "./data";
import { dashboardUnavailableReason, isDashboardMetricUnavailable } from "./data/viewModel";
import { formatDashboardCount, formatDashboardPaise } from "./data/formatters";

const lifecycleTones: Readonly<Record<string, DashboardChartTone>> = {
  planning: "violet",
  active: "cyan",
  onHold: "yellow",
  completed: "green"
};

const roleTones: readonly DashboardChartTone[] = [
  "violet",
  "cyan",
  "gold",
  "green",
  "yellow",
  "muted"
];

function toStage(
  value: DashboardValueView,
  tone?: DashboardChartTone,
  shortLabel?: string
): StageDatum {
  return {
    id: value.id,
    label: value.label,
    ...(shortLabel ? { shortLabel } : {}),
    value: value.available ? value.value : null,
    displayValue: value.displayValue,
    available: value.available,
    ...(tone ? { tone } : {})
  };
}

export function toComparisonMetricData(
  metrics: readonly DashboardHeroMetricView[]
): readonly ComparisonMetricDatum[] {
  return metrics.map((metric) => ({
    id: metric.id,
    label: metric.label,
    shortLabel: metric.shortLabel,
    current: metric.current,
    previous: metric.previous,
    currentAvailable: metric.currentAvailable,
    previousAvailable: metric.previousAvailable,
    displayCurrent: metric.currentDisplay,
    displayPrevious: metric.previousDisplay,
    displayDelta: metric.deltaDisplay,
    changeLabel: metric.changeDisplay
  }));
}

export function toTrendData(series: DashboardTrendSeriesView): readonly TrendDatum[] {
  return series.points.map((point) => ({
    id: point.id,
    dayIndex: point.dayIndex,
    currentDate: point.currentDate,
    previousDate: point.previousDate,
    current: point.current,
    previous: point.previous
  }));
}

export function toOverviewChartData(model: DashboardViewModel): OverviewChartData {
  const lifecycle = model.lifecycle.map((value) => {
    const suffix = value.id.split(".").at(-1) ?? value.id;
    return toStage(value, lifecycleTones[suffix] ?? "violet", value.label);
  });
  const severity = (colorKey: string | undefined): NonNullable<RiskDatum["severity"]> => {
    if (colorKey === "red") return "high";
    if (colorKey === "yellow") return "medium";
    if (colorKey === "green") return "low";
    return "unknown";
  };
  const risk: readonly RiskDatum[] = model.risk.distribution.map((value) => ({
    ...toStage(value, undefined, value.label),
    severity: severity(value.colorKey)
  }));
  return { lifecycle, risk };
}

export function toFinanceActivityChartData(
  model: DashboardViewModel
): FinanceActivityChartData {
  const metricKey = "trends.ledgerExpensesPostedPaise";
  const available = !isDashboardMetricUnavailable(model.overview.dataQuality, metricKey);
  const unavailableReason = available
    ? null
    : dashboardUnavailableReason(model.overview.dataQuality, metricKey);
  return {
    points: model.overview.trends.map((point) => ({
      id: `${metricKey}:${point.date}`,
      date: point.date,
      valuePaise: available ? point.ledgerExpensesPostedPaise : null,
      displayValue: formatDashboardPaise(available ? point.ledgerExpensesPostedPaise : null),
      available,
      unavailableReason
    })),
    approvedNetRevenue: capitalDatum(
      model.capital.approvedNetRevenue,
      "context",
      "cyan",
      "Approved net revenue"
    ),
    costBudget: capitalDatum(
      model.capital.costBudget,
      "context",
      "gold",
      "Cost budget"
    )
  };
}

export function toLifecycleDonutData(
  model: DashboardViewModel
): readonly StageDatum[] {
  return toOverviewChartData(model).lifecycle;
}

export function toCostCompositionDonutData(
  model: DashboardViewModel
): readonly StageDatum[] {
  return model.capital.costComposition.map((value, index) =>
    toStage(value, roleTones[(index + 1) % roleTones.length], value.label)
  );
}

export function toBudgetPositionChartData(
  model: DashboardViewModel
): BudgetPositionChartData {
  return {
    costBudget: capitalDatum(model.capital.costBudget, "context", "gold", "Cost budget"),
    recordedCost: capitalDatum(model.capital.recordedCost, "context", "green", "Recorded cost"),
    remainingBudget: capitalDatum(model.capital.remainingBudget, "context", "muted", "Remaining budget")
  };
}

function stageById(module: DashboardDeliveryModuleView, id: string): DashboardValueView | undefined {
  return module.stages.find((stage) => stage.id === `${module.id}.${id}`);
}

function deliveryStage(
  module: DashboardDeliveryModuleView | undefined,
  id: string,
  label: string,
  shortLabel: string,
  tone: DashboardChartTone
): StageDatum {
  const value = module ? stageById(module, id) : undefined;
  return value
    ? toStage(value, tone, shortLabel)
    : { id: `${module?.id ?? "delivery"}.${id}`, label, shortLabel, value: null, displayValue: "Not available", available: false, tone };
}

export function toDeliveryChartData(model: DashboardViewModel): DeliveryChartData {
  const modules = new Map(model.delivery.map((module) => [module.id, module] as const));
  const estimation = modules.get("estimation");
  const design = modules.get("design");
  const procurement = modules.get("procurement");
  const execution = modules.get("execution");
  return {
    stages: [
      deliveryStage(estimation, "awaitingClient", "Estimate · Awaiting client", "Estimate wait", "yellow"),
      deliveryStage(estimation, "clientApproved", "Estimate · Client approved", "Estimate OK", "green"),
      deliveryStage(design, "inProgress", "Design · In progress", "Design active", "violet"),
      deliveryStage(design, "approved", "Design · Approved", "Design OK", "green"),
      deliveryStage(procurement, "open", "Procurement · Open", "Procure open", "gold"),
      deliveryStage(procurement, "completed", "Procurement · Completed", "Procure done", "cyan"),
      deliveryStage(execution, "inProgress", "Execution · In progress", "Site active", "violet"),
      deliveryStage(execution, "completed", "Execution · Completed", "Site done", "green")
    ]
  };
}

function capitalDatum(
  value: DashboardValueView,
  kind: NonNullable<CapitalDatum["kind"]>,
  tone: DashboardChartTone,
  shortLabel: string
): CapitalDatum {
  return {
    id: value.id,
    label: value.label,
    shortLabel,
    valuePaise: value.available ? value.value : null,
    displayValue: value.displayValue,
    available: value.available,
    kind,
    tone
  };
}

export function toCapitalChartData(model: DashboardViewModel): CapitalChartData {
  const capital = model.capital;
  const composition = new Map(capital.costComposition.map((value) => [value.id, value] as const));
  const procurement = composition.get("finance.procurementCostPaise")!;
  const employee = composition.get("finance.employeePaymentPaise")!;
  const other = composition.get("finance.otherExpensePaise")!;
  const overhead = composition.get("finance.overheadPaise")!;
  const profitTone: DashboardChartTone = (capital.currentProfit.value ?? 0) < 0 ? "red" : "green";
  return {
    flow: [
      capitalDatum(capital.approvedNetRevenue, "increase", "violet", "Net revenue"),
      capitalDatum(procurement, "decrease", "cyan", "Procurement"),
      capitalDatum(employee, "decrease", "gold", "People"),
      capitalDatum(other, "decrease", "yellow", "Other"),
      capitalDatum(overhead, "decrease", "red", "Overhead"),
      capitalDatum(capital.currentProfit, "total", profitTone, "Live profit"),
      capitalDatum(capital.targetProfit, "context", "green", "Target profit"),
      capitalDatum(capital.recordedCost, "context", "cyan", "Recorded cost"),
      capitalDatum(capital.approvedContractTotal, "context", "muted", "Contract total"),
      capitalDatum(capital.approvedGst, "context", "muted", "GST"),
      capitalDatum(capital.costBudget, "context", "muted", "Cost budget"),
      capitalDatum(capital.remainingBudget, "context", "muted", "Budget left")
    ]
  };
}

export function toPeopleChartData(model: DashboardViewModel): PeopleChartData {
  const people = model.people;
  const workforce = new Map(people.workforce.map((value) => [value.id, value] as const));
  const workloadValues = [
    workforce.get("workforce.assignedWorkers"),
    workforce.get("workforce.unassignedWorkers")
  ].filter((value): value is DashboardValueView => Boolean(value));
  return {
    activeWorkers: toStage(
      workforce.get("workforce.activeWorkers")!,
      "violet",
      "Active workers"
    ),
    roles: people.roleDistribution.map((value, index) =>
      toStage(value, roleTones[index % roleTones.length], value.label)
    ),
    workload: workloadValues.map((value, index) =>
      toStage(value, index === 0 ? "cyan" : "yellow", index === 0 ? "Assigned" : "Unassigned")
    ),
    governance: people.governanceQueue.map((value, index) =>
      toStage(value, index === 0 ? "gold" : index === 1 ? "violet" : "cyan", value.label)
    )
  };
}

function valueRow(value: DashboardValueView): DashboardValueRow {
  return {
    id: value.id,
    label: value.label,
    value: value.displayValue,
    unit: value.unit,
    timeBasis: value.timeBasis,
    ...(!value.available
      ? { detail: value.unavailableReason ?? "Authoritative source unavailable" }
      : {}),
    unavailable: !value.available
  };
}

function trendValueRow({
  metric,
  point,
  side
}: {
  readonly metric: DashboardHeroMetricView;
  readonly point: DashboardTrendSeriesView["points"][number];
  readonly side: "current" | "previous";
}): DashboardValueRow {
  const date = side === "current" ? point.currentDate : point.previousDate;
  const value = side === "current" ? point.current : point.previous;
  const available = value !== null;
  return {
    id: `trend.${metric.id}.${point.dayIndex}.${side}`,
    label: `${side === "current" ? "Current" : "Previous"} period · ${date} UTC`,
    value: formatDashboardCount(value),
    unit: metric.unit,
    timeBasis: "utc_day",
    ...(available
      ? {}
      : { detail: metric.unavailableReason ?? "Authoritative daily value unavailable" }),
    unavailable: !available
  };
}

function trendValueGroups(model: DashboardViewModel): readonly DashboardValueGroup[] {
  return model.heroCountMetrics.map((metric) => {
    const series = model.trendByMetric[metric.id];
    return {
      id: `trend.${metric.id}`,
      title: `${metric.label} · daily UTC buckets`,
      description: "Every current and previous bucket retains its backend UTC date and source availability.",
      rows: series.points.flatMap((point) => [
        trendValueRow({ metric, point, side: "current" }),
        trendValueRow({ metric, point, side: "previous" })
      ])
    };
  });
}

export function toValueGroups(model: DashboardViewModel): readonly DashboardValueGroup[] {
  const valueGroups = model.allValues.map((group) => ({
    id: group.id,
    title: group.title,
    ...(group.id === "comparison"
      ? { description: `Current ${model.range.currentLabel} · Previous ${model.range.previousLabel}` }
      : {}),
    rows: group.values.map(valueRow)
  }));
  const comparisonIndex = valueGroups.findIndex((group) => group.id === "comparison");
  const trendGroups = trendValueGroups(model);
  if (comparisonIndex < 0) return [...valueGroups, ...trendGroups];
  return [
    ...valueGroups.slice(0, comparisonIndex + 1),
    ...trendGroups,
    ...valueGroups.slice(comparisonIndex + 1)
  ];
}

export function selectedMetric(
  model: DashboardViewModel,
  id: DashboardCountComparisonMetricId
): DashboardHeroMetricView {
  return model.heroCountMetrics.find((metric) => metric.id === id) ?? model.heroCountMetrics[0]!;
}
