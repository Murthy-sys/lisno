import type { CustomSeriesOption } from "echarts/charts";

import {
  buildCapitalFlowNodes,
  buildCapitalOption,
  buildCapitalSegments,
  CAPITAL_EMPTY_GRAPHIC_ID,
  CAPITAL_SERIES_IDS,
  formatPaiseAxis
} from "./capital";
import {
  buildDeliveryOption,
  buildDeliverySpatialData,
  DELIVERY_SERIES_IDS
} from "./delivery";
import {
  buildHeroComparisonOption,
  buildHeroSeriesData,
  HERO_COUNT_METRIC_IDS,
  HERO_COUNT_SERIES_IDS
} from "./heroComparison";
import {
  buildBudgetPositionOption,
  buildCostCompositionDonutOption,
  buildFinanceActivityOption,
  buildLifecycleDonutOption,
  EXECUTIVE_SERIES_IDS,
  type BudgetPositionChartData,
  type FinanceActivityChartData
} from "./executive";
import {
  buildOverviewOption,
  OVERVIEW_SERIES_IDS,
  sumAvailableStages
} from "./overview";
import {
  buildPeopleOption,
  PEOPLE_SERIES_IDS
} from "./people";
import {
  buildTemporalFacets,
  buildTrendOption,
  TREND_SERIES_IDS,
  trendLabelInterval
} from "./trend";
import type {
  CapitalDatum,
  ComparisonMetricDatum,
  DashboardChartOption,
  PeopleChartData,
  StageDatum,
  TrendDatum
} from "./types";

function optionSeries(option: DashboardChartOption): Record<string, unknown>[] {
  return (option.series ?? []) as unknown as Record<string, unknown>[];
}

function expectOnlyCustomSeries(option: DashboardChartOption): void {
  const series = optionSeries(option);
  expect(series.length).toBeGreaterThan(0);
  expect(series.every((entry) => entry.type === "custom")).toBe(true);
  // ECharts custom series writes these values directly to every zrender
  // displayable. Keep both explicit so native SVG never receives an invalid
  // sorting layer during option transitions.
  expect(series.every((entry) => Number.isFinite(entry.z))).toBe(true);
  expect(series.every((entry) => entry.zlevel === 0)).toBe(true);
  expect(option.xAxis).toBeUndefined();
  expect(option.yAxis).toBeUndefined();
}

function renderDatum(
  series: Record<string, unknown>,
  dataIndex = 0,
  width = 360,
  height = 320
): unknown {
  const renderItem = (series as unknown as CustomSeriesOption).renderItem;
  expect(renderItem).toBeDefined();
  return renderItem?.(
    {
      seriesId: String(series.id ?? "series"),
      dataIndex,
      dataIndexInside: dataIndex
    } as never,
    {
      getWidth: () => width,
      getHeight: () => height,
      value: () => 0
    } as never
  );
}

function childNames(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const value = result as {
    readonly name?: unknown;
    readonly children?: readonly unknown[];
  };
  return [
    ...(typeof value.name === "string" ? [value.name] : []),
    ...(value.children ?? []).flatMap(childNames)
  ];
}

function metric(
  id: string,
  current: number | null,
  previous: number | null,
  currentAvailable = true,
  previousAvailable = true
): ComparisonMetricDatum {
  return {
    id,
    label: id.replaceAll("_", " "),
    shortLabel: id.split("_")[0] ?? id,
    current,
    previous,
    currentAvailable,
    previousAvailable,
    displayCurrent: current === null ? "Unavailable" : String(current),
    displayPrevious: previous === null ? "Unavailable" : String(previous),
    displayDelta: "0",
    changeLabel: "No change"
  };
}

const heroMetrics = HERO_COUNT_METRIC_IDS.map((id, index) =>
  metric(id, index === 1 ? 0 : index + 2, index + 1)
);

function stage(
  id: string,
  value: number | null,
  available = true
): StageDatum {
  return {
    id,
    label: id,
    shortLabel: id,
    value,
    displayValue: value === null ? "Unavailable" : String(value),
    available
  };
}

describe("reference-led executive charts", () => {
  const datum = (
    id: string,
    valuePaise: number | null,
    displayValue: string,
    available = true
  ): CapitalDatum => ({
    id,
    label: id,
    valuePaise,
    displayValue,
    available,
    kind: "context",
    tone: "muted"
  });

  it("uses stable bar and guide identities for exact recorded-cost activity", () => {
    const data: FinanceActivityChartData = {
      points: [
        { id: "trends.ledgerExpensesPostedPaise:2026-09-21", date: "2026-09-21", valuePaise: 0, displayValue: "₹0.00", available: true },
        { id: "trends.ledgerExpensesPostedPaise:2026-09-22", date: "2026-09-22", valuePaise: null, displayValue: "Not available", available: false, unavailableReason: "Ledger unavailable" }
      ],
      approvedNetRevenue: datum("finance.approvedSubtotalPaise", 200_000, "₹2,000.00"),
      costBudget: datum("finance.costBudgetPaise", 150_000, "₹1,500.00")
    };

    const option = buildFinanceActivityOption(data, false);
    const series = optionSeries(option);
    expect(series.map((entry) => entry.id)).toEqual([
      EXECUTIVE_SERIES_IDS.expense,
      EXECUTIVE_SERIES_IDS.revenueGuide,
      EXECUTIVE_SERIES_IDS.budgetGuide
    ]);
    expect(series.map((entry) => entry.type)).toEqual(["bar", "line", "line"]);
    expect(series[0]?.data).toEqual([
      expect.objectContaining({ id: "finance-activity:trends.ledgerExpensesPostedPaise:2026-09-21:bar", value: 0 }),
      expect.objectContaining({ id: "finance-activity:trends.ledgerExpensesPostedPaise:2026-09-22:bar", value: null })
    ]);
    expect(series[1]?.data).toEqual([
      expect.objectContaining({ id: "finance-activity:finance.approvedSubtotalPaise:2026-09-21:guide", value: 200_000 }),
      expect.objectContaining({ id: "finance-activity:finance.approvedSubtotalPaise:2026-09-22:guide", value: 200_000 })
    ]);
    expect(series[2]?.data).toEqual([
      expect.objectContaining({ id: "finance-activity:finance.costBudgetPaise:2026-09-21:guide", value: 150_000 }),
      expect.objectContaining({ id: "finance-activity:finance.costBudgetPaise:2026-09-22:guide", value: 150_000 })
    ]);
    expect(option.animationDuration).toBe(500);
    expect(option.animationDurationUpdate).toBe(380);
  });

  it("keeps zero slices distinct from unavailable lifecycle and cost classifications", () => {
    const values = [
      stage("lifecycle.planning", 0),
      stage("lifecycle.active", 7),
      stage("lifecycle.onHold", null, false),
      stage("lifecycle.completed", 2)
    ];
    const lifecycle = buildLifecycleDonutOption(values, "9", false);
    const lifecycleData = optionSeries(lifecycle)[0]?.data as readonly Record<string, unknown>[];
    expect(optionSeries(lifecycle)[0]?.id).toBe(EXECUTIVE_SERIES_IDS.lifecycle);
    expect(lifecycleData).toEqual([
      expect.objectContaining({ id: "executive-lifecycle:lifecycle.planning:slice", value: 0 }),
      expect.objectContaining({ id: "executive-lifecycle:lifecycle.active:slice", value: 7 }),
      expect.objectContaining({ id: "executive-lifecycle:lifecycle.completed:slice", value: 2 })
    ]);
    expect(JSON.stringify(lifecycleData)).not.toContain("lifecycle.onHold");

    const composition = buildCostCompositionDonutOption([
      stage("finance.procurementCostPaise", 40_000),
      stage("finance.employeePaymentPaise", 30_000),
      stage("finance.otherExpensePaise", 20_000),
      stage("finance.overheadPaise", 10_000)
    ], "₹1,000.00", false);
    expect(optionSeries(composition)[0]?.id).toBe(EXECUTIVE_SERIES_IDS.composition);
    expect((optionSeries(composition)[0]?.data as readonly unknown[])).toHaveLength(4);
  });

  it("preserves exact budget values, signed overspend context, and reduced motion", () => {
    const data: BudgetPositionChartData = {
      costBudget: datum("finance.costBudgetPaise", 500_000, "₹5,000.00"),
      recordedCost: datum("finance.recordedCostPaise", 700_000, "₹7,000.00"),
      remainingBudget: datum("finance.remainingBudgetPaise", -200_000, "-₹2,000.00")
    };
    const option = buildBudgetPositionOption(data, true);
    const budgetSeries = optionSeries(option)[0]!;
    expect(budgetSeries.id).toBe(EXECUTIVE_SERIES_IDS.budget);
    expect(budgetSeries.type).toBe("bar");
    expect(budgetSeries.data).toEqual([
      expect.objectContaining({ id: "executive-budget:finance.costBudgetPaise:bar", value: 500_000 }),
      expect.objectContaining({ id: "executive-budget:finance.recordedCostPaise:bar", value: 700_000 }),
      expect.objectContaining({ id: "executive-budget:finance.remainingBudgetPaise:bar", value: -200_000 })
    ]);
    const signedAxis = option.xAxis as {
      readonly min: (range: { readonly min: number }) => number;
      readonly max: (range: { readonly max: number }) => number;
    };
    expect(signedAxis.min({ min: -200_000 })).toBe(-200_000);
    expect(signedAxis.min({ min: 200_000 })).toBe(0);
    expect(signedAxis.max({ max: -1 })).toBe(0);
    expect(signedAxis.max({ max: 700_000 })).toBe(700_000);
    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
    expect(budgetSeries.universalTransition).toBe(false);
  });

  it("keeps positive, zero, and unavailable remaining-budget marks distinct", () => {
    const build = (remaining: CapitalDatum) => buildBudgetPositionOption({
      costBudget: datum("finance.costBudgetPaise", 500_000, "₹5,000.00"),
      recordedCost: datum("finance.recordedCostPaise", 300_000, "₹3,000.00"),
      remainingBudget: remaining
    }, false);
    const remainingDatum = (option: DashboardChartOption) => (
      optionSeries(option)[0]?.data as readonly Record<string, unknown>[]
    )[2];

    expect(remainingDatum(build(datum("finance.remainingBudgetPaise", 200_000, "₹2,000.00")))).toEqual(
      expect.objectContaining({ id: "executive-budget:finance.remainingBudgetPaise:bar", value: 200_000 })
    );
    expect(remainingDatum(build(datum("finance.remainingBudgetPaise", 0, "₹0.00")))).toEqual(
      expect.objectContaining({ id: "executive-budget:finance.remainingBudgetPaise:bar", value: 0 })
    );
    expect(remainingDatum(build(datum("finance.remainingBudgetPaise", null, "Not available", false)))).toEqual(
      expect.objectContaining({ id: "executive-budget:finance.remainingBudgetPaise:bar", value: null })
    );
  });
});

describe("operations constellation", () => {
  it("keeps zero and unavailable anchors with stable current/previous identities", () => {
    const metrics = [
      metric("projects_created", 0, 2),
      metric("clients_created", null, null, false, false)
    ];
    const data = buildHeroSeriesData(metrics, "projects_created");

    expect(data.current).toHaveLength(2);
    expect(data.current[0]).toMatchObject({
      id: "projects_created:current",
      metricKey: "projects_created",
      value: 0,
      available: true,
      selected: true
    });
    expect(data.current[1]).toMatchObject({
      metricKey: "clients_created",
      value: null,
      available: false
    });
    expect(data.domainMaximum).toBe(2);
  });

  it("uses only custom spatial series and keeps compare lanes stable", () => {
    const shown = buildHeroComparisonOption({
      metrics: heroMetrics,
      selectedMetricId: "projects_created",
      showPrevious: true,
      reducedMotion: false
    });
    const hidden = buildHeroComparisonOption({
      metrics: heroMetrics,
      selectedMetricId: "projects_created",
      showPrevious: false,
      reducedMotion: false
    });
    expectOnlyCustomSeries(shown);
    expect(optionSeries(shown).map((entry) => entry.id)).toEqual([
      HERO_COUNT_SERIES_IDS.guide,
      HERO_COUNT_SERIES_IDS.pairing,
      HERO_COUNT_SERIES_IDS.previous,
      HERO_COUNT_SERIES_IDS.current
    ]);
    expect(optionSeries(hidden).map((entry) => entry.id)).toEqual(
      optionSeries(shown).map((entry) => entry.id)
    );
    expect(optionSeries(hidden)[1]?.data).toEqual([]);
    expect(optionSeries(hidden)[2]?.data).toEqual([]);
    expect(shown.animationDurationUpdate).toBe(380);
  });

  it("excludes paise from the count domain and renders orbs rather than prisms", () => {
    const option = buildHeroComparisonOption({
      metrics: [...heroMetrics, metric("recorded_expenses_paise", 900_000, 100_000)],
      selectedMetricId: "projects_created",
      showPrevious: true,
      reducedMotion: false
    });
    const serialized = JSON.stringify(optionSeries(option).map((entry) => entry.data));
    const currentSeries = optionSeries(option)[3]!;
    const currentData = currentSeries.data as readonly { readonly value: readonly number[] }[];
    const positiveIndex = currentData.findIndex((item) => (item.value[3] ?? 0) > 0);
    const rendered = renderDatum(currentSeries, positiveIndex);

    expect(serialized).not.toContain("recorded_expenses_paise");
    expect(childNames(rendered)).toEqual(expect.arrayContaining(["orb", "tether", "shadow"]));
    expect(childNames(rendered)).not.toContain("front");
  });

  it("turns all scene animation off for reduced motion", () => {
    const option = buildHeroComparisonOption({
      metrics: heroMetrics,
      selectedMetricId: null,
      showPrevious: true,
      reducedMotion: true
    });
    expect(option.animation).toBe(false);
    expect(option.animationDuration).toBe(0);
    expect(option.animationDurationUpdate).toBe(0);
    expect(optionSeries(option).every((entry) => entry.universalTransition === false)).toBe(true);
  });
});

describe("temporal ribbon field", () => {
  const points: TrendDatum[] = Array.from({ length: 90 }, (_, dayIndex) => ({
    id: `day-${dayIndex}`,
    dayIndex,
    currentDate: `2026-${String(Math.floor(dayIndex / 28) + 1).padStart(2, "0")}-${String((dayIndex % 28) + 1).padStart(2, "0")}`,
    previousDate: `2025-12-${String((dayIndex % 28) + 1).padStart(2, "0")}`,
    current: dayIndex === 31 ? null : dayIndex,
    previous: dayIndex === 32 ? null : dayIndex + 1
  }));

  it("retains all buckets and null gaps as custom faceted data", () => {
    const option = buildTrendOption({
      metricId: "projects_created",
      metricLabel: "Projects created",
      points,
      showPrevious: true,
      reducedMotion: false,
      selectedDayIndex: 12
    });
    const series = optionSeries(option);
    const current = series[2]?.data as readonly { readonly value: readonly unknown[] }[];
    const previous = series[1]?.data as readonly { readonly value: readonly unknown[] }[];

    expectOnlyCustomSeries(option);
    expect(series.map((entry) => entry.id)).toEqual([
      TREND_SERIES_IDS.guide,
      TREND_SERIES_IDS.previous,
      TREND_SERIES_IDS.current
    ]);
    expect(current).toHaveLength(90);
    expect(previous).toHaveLength(90);
    expect(current[31]?.value[1]).toBeNull();
    expect(previous[32]?.value[1]).toBeNull();
    expect(buildTemporalFacets("projects_created", points, "current")[31]?.value).toBeNull();
    expect(trendLabelInterval(7)).toBe(1);
    expect(trendLabelInterval(30)).toBe(5);
    expect(trendLabelInterval(90)).toBe(15);
  });

  it("renders top and side facets and a selected-day tether", () => {
    const option = buildTrendOption({
      metricId: "projects_created",
      metricLabel: "Projects created",
      points: points.slice(0, 7),
      showPrevious: true,
      reducedMotion: false,
      selectedDayIndex: 0
    });
    const rendered = renderDatum(optionSeries(option)[2]!, 0, 360, 244);
    expect(childNames(rendered)).toEqual(expect.arrayContaining([
      "facet-top",
      "facet-side",
      "selected-tether",
      "selected-halo",
      "vertex"
    ]));
  });

  it("keeps stable series and clears only the previous data lane", () => {
    const hidden = buildTrendOption({
      metricId: "clients_created",
      metricLabel: "Client accounts created",
      points: points.slice(0, 7),
      showPrevious: false,
      reducedMotion: true
    });
    expect(optionSeries(hidden).map((entry) => entry.id)).toEqual([
      TREND_SERIES_IDS.guide,
      TREND_SERIES_IDS.previous,
      TREND_SERIES_IDS.current
    ]);
    expect(optionSeries(hidden)[1]?.data).toEqual([]);
    expect(hidden.animation).toBe(false);
  });
});

describe("spatial module scenes", () => {
  const lifecycle = [
    stage("lifecycle.planning", 2),
    stage("lifecycle.active", 7),
    stage("lifecycle.onHold", null, false),
    stage("lifecycle.completed", 1)
  ];
  const risk = [
    { ...stage("risk.low", 6), severity: "low" as const },
    { ...stage("risk.medium", 2), severity: "medium" as const },
    { ...stage("risk.high", 1), severity: "high" as const },
    { ...stage("risk.unknown", 0), severity: "unknown" as const }
  ];

  it("renders lifecycle orbit and risk field without converting unavailable to zero", () => {
    const option = buildOverviewOption({ lifecycle, risk }, false);
    expect(sumAvailableStages(lifecycle)).toBe(10);
    expectOnlyCustomSeries(option);
    expect(optionSeries(option).map((entry) => entry.id)).toEqual([
      OVERVIEW_SERIES_IDS.guide,
      OVERVIEW_SERIES_IDS.sequence,
      OVERVIEW_SERIES_IDS.lifecycle,
      OVERVIEW_SERIES_IDS.risk
    ]);
    const lifecycleData = optionSeries(option)[2]?.data as readonly { readonly value: readonly unknown[] }[];
    expect(lifecycleData).toHaveLength(4);
    expect(lifecycleData.some((item) => item.value[4] === 0)).toBe(true);
  });

  it("uses neutral paired delivery corridors and unavailable anchors", () => {
    const stages = [
      stage("estimation.awaitingClient", 3),
      stage("estimation.clientApproved", 2),
      stage("design.inProgress", null, false),
      stage("design.approved", 0),
      stage("procurement.open", 4),
      stage("procurement.completed", 1),
      stage("execution.inProgress", 5),
      stage("execution.completed", 2)
    ];
    const spatial = buildDeliverySpatialData(stages);
    const option = buildDeliveryOption({ stages }, false);
    expect(spatial.links).toHaveLength(4);
    expect(spatial.nodes[2]).toMatchObject({ value: null, available: false });
    expectOnlyCustomSeries(option);
    expect(optionSeries(option).map((entry) => entry.id)).toEqual([
      DELIVERY_SERIES_IDS.guide,
      DELIVERY_SERIES_IDS.order,
      DELIVERY_SERIES_IDS.stages
    ]);
  });

  it("renders aggregate workforce topology with workload satellites on the active core", () => {
    const people: PeopleChartData = {
      activeWorkers: stage("workforce.activeWorkers", 10),
      roles: [stage("workforce.role.manager", 2), stage("workforce.role.designer", null, false)],
      workload: [stage("workforce.assignedWorkers", 8), stage("workforce.unassignedWorkers", 2)],
      governance: [stage("governance.pendingInvitations", null, false)]
    };
    const option = buildPeopleOption(people, false);
    expectOnlyCustomSeries(option);
    expect(optionSeries(option).map((entry) => entry.id)).toEqual([
      PEOPLE_SERIES_IDS.guide,
      PEOPLE_SERIES_IDS.relationships,
      PEOPLE_SERIES_IDS.roles,
      PEOPLE_SERIES_IDS.capacity,
      PEOPLE_SERIES_IDS.governance
    ]);
    const capacity = optionSeries(option)[3]?.data as readonly unknown[];
    const governance = optionSeries(option)[4]?.data as readonly { readonly value: readonly unknown[] }[];
    expect(capacity).toHaveLength(3);
    expect(governance[0]?.value[4]).toBe(0);
  });
});

describe("capital flow scene", () => {
  const flow: CapitalDatum[] = [
    { id: "finance.approvedSubtotalPaise", label: "Approved net revenue", shortLabel: "Net revenue", valuePaise: 100_000, displayValue: "₹1,000", kind: "increase", tone: "violet" },
    { id: "finance.procurementCostPaise", label: "Procurement", valuePaise: 40_000, displayValue: "₹400", kind: "decrease", tone: "cyan" },
    { id: "finance.employeePaymentPaise", label: "People", valuePaise: 30_000, displayValue: "₹300", kind: "decrease", tone: "gold" },
    { id: "finance.otherExpensePaise", label: "Other", valuePaise: 20_000, displayValue: "₹200", kind: "decrease", tone: "yellow" },
    { id: "finance.overheadPaise", label: "Overhead", valuePaise: 40_001, displayValue: "₹400.01", kind: "decrease", tone: "red" },
    { id: "finance.currentProfitPaise", label: "Current profit", valuePaise: -30_001, displayValue: "−₹300.01", kind: "total", tone: "red" },
    { id: "finance.targetProfitPaise", label: "Target profit", valuePaise: 20_000, displayValue: "₹200", kind: "context", tone: "green" },
    { id: "finance.costBudgetPaise", label: "Cost budget", valuePaise: 80_000, displayValue: "₹800", kind: "context", tone: "gold" },
    { id: "finance.recordedCostPaise", label: "Recorded cost", valuePaise: 130_001, displayValue: "₹1,300.01", kind: "context", tone: "cyan" },
    { id: "finance.remainingBudgetPaise", label: "Remaining budget", valuePaise: -50_001, displayValue: "−₹500.01", kind: "context", tone: "red" },
    { id: "finance.approvedGstPaise", label: "GST", valuePaise: 18_000, displayValue: "₹180", kind: "context", tone: "muted" }
  ];

  it("keeps integer-paise reconciliation and context outside the arithmetic chain", () => {
    const segments = buildCapitalSegments(flow);
    expect(segments).toHaveLength(6);
    expect(segments[4]).toMatchObject({ startPaise: 10_000, endPaise: -30_001, valuePaise: 40_001 });
    expect(segments.every((entry) => Number.isInteger(entry.startPaise) && Number.isInteger(entry.endPaise))).toBe(true);
    expect(segments.some((entry) => entry.id === "finance.approvedGstPaise")).toBe(false);
    expect(formatPaiseAxis(100_000)).toBe("₹1k");
    expect(formatPaiseAxis(-30_001)).toBe("−₹300");
  });

  it("builds separate plan, live, classification, and derived outcome nodes", () => {
    const nodes = buildCapitalFlowNodes(flow);
    expect(nodes.map((node) => node.lane)).toEqual(expect.arrayContaining([
      "plan",
      "live",
      "classification",
      "outcome"
    ]));
    expect(nodes.find((node) => node.metricKey === "finance.currentProfitPaise")?.from).toBeUndefined();
    expect(nodes.find((node) => node.metricKey === "finance.remainingBudgetPaise")?.valuePaise).toBe(-50_001);
    const value = (metricKey: string) =>
      nodes.find((node) => node.metricKey === metricKey)?.valuePaise ?? 0;
    const classifiedCost = [
      "finance.procurementCostPaise",
      "finance.employeePaymentPaise",
      "finance.otherExpensePaise",
      "finance.overheadPaise"
    ].reduce((total, metricKey) => total + value(metricKey), 0);
    expect(classifiedCost).toBe(value("finance.recordedCostPaise"));
    expect(value("finance.approvedSubtotalPaise") - value("finance.recordedCostPaise"))
      .toBe(value("finance.currentProfitPaise"));
    expect(value("finance.costBudgetPaise") - value("finance.recordedCostPaise"))
      .toBe(value("finance.remainingBudgetPaise"));
    expect(value("finance.approvedSubtotalPaise") - value("finance.targetProfitPaise"))
      .toBe(value("finance.costBudgetPaise"));
  });

  it("uses only custom proportional ribbons and never includes GST as a flow node", () => {
    const option = buildCapitalOption({ flow }, false);
    expectOnlyCustomSeries(option);
    expect(optionSeries(option).map((entry) => entry.id)).toEqual([
      CAPITAL_SERIES_IDS.guide,
      CAPITAL_SERIES_IDS.relationships,
      CAPITAL_SERIES_IDS.flow
    ]);
    expect(JSON.stringify(optionSeries(option))).not.toContain("finance.approvedGstPaise");
    const flowSeries = optionSeries(option)[2]!;
    const costIndex = buildCapitalFlowNodes(flow).findIndex((node) => node.metricKey === "finance.recordedCostPaise");
    expect(childNames(renderDatum(flowSeries, costIndex))).toEqual(expect.arrayContaining([
      "ribbon-body",
      "ribbon-light",
      "node-core"
    ]));
    expect(childNames(renderDatum(flowSeries, costIndex))).not.toContain("bar");
  });

  it("renders an explicit empty source state and removes it when finance recovers", () => {
    const unavailableFlow: CapitalDatum[] = flow.map((datum) => ({
      ...datum,
      valuePaise: null,
      available: false
    }));
    const empty = buildCapitalOption({ flow: unavailableFlow }, false);
    const graphic = empty.graphic as readonly { readonly id?: string; readonly children?: readonly { readonly style?: { readonly text?: string } }[] }[];
    expect(graphic[0]?.id).toBe(CAPITAL_EMPTY_GRAPHIC_ID);
    expect(graphic[0]?.children?.map((child) => child.style?.text).filter(Boolean)).toEqual([
      "CAPITAL DATA NOT AVAILABLE",
      "Awaiting approved finance lineage"
    ]);
    expect(buildCapitalOption({ flow }, false).graphic).toEqual([
      { id: CAPITAL_EMPTY_GRAPHIC_ID, $action: "remove" }
    ]);
  });
});

describe("production option guard", () => {
  it("keeps every analytical top-level series custom", () => {
    const stageSet = [stage("a", 1), stage("b", 2), stage("c", 0), stage("d", null, false)];
    const options = [
      buildHeroComparisonOption({ metrics: heroMetrics, selectedMetricId: null, showPrevious: true, reducedMotion: false }),
      buildTrendOption({ metricId: "projects_created", metricLabel: "Projects created", points: [{ id: "day-0", dayIndex: 0, currentDate: "2026-09-22", previousDate: "2026-08-23", current: 1, previous: 0 }], showPrevious: true, reducedMotion: false }),
      buildOverviewOption({ lifecycle: stageSet, risk: [] }, false),
      buildDeliveryOption({ stages: [...stageSet, ...stageSet] }, false),
      buildPeopleOption({ activeWorkers: stage("active", 3), roles: stageSet, workload: stageSet.slice(0, 2), governance: stageSet }, false)
    ];
    options.forEach(expectOnlyCustomSeries);
    const forbidden = options.flatMap(optionSeries).filter((series) =>
      ["bar", "pie", "line", "gauge"].includes(String(series.type))
    );
    expect(forbidden).toEqual([]);
  });
});
