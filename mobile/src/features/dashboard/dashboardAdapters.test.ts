import {
  createDashboardOverviewFixture,
  createOverspendDashboardOverviewFixture
} from "./data/testFixtures";
import { buildDashboardViewModel } from "./data/viewModel";
import {
  toBudgetPositionChartData,
  toCostCompositionDonutData,
  toFinanceActivityChartData,
  toLifecycleDonutData,
  toValueGroups
} from "./dashboardAdapters";

describe("dashboard value ledger adapters", () => {
  it("includes every current and previous daily bucket with exact UTC dates and metadata", () => {
    const model = buildDashboardViewModel(createDashboardOverviewFixture(7));
    const groups = toValueGroups(model);
    const trendGroups = groups.filter((group) => group.id.startsWith("trend."));

    expect(trendGroups).toHaveLength(model.heroCountMetrics.length);
    expect(trendGroups.every((group) => group.rows.length === model.period * 2)).toBe(true);
    expect(trendGroups.flatMap((group) => group.rows)).toHaveLength(
      model.heroCountMetrics.length * model.period * 2
    );

    const projects = groups.find((group) => group.id === "trend.projects_created")!;
    expect(projects.rows.at(-2)).toEqual(expect.objectContaining({
      id: "trend.projects_created.6.current",
      label: "Current period · 2026-09-22 UTC",
      value: "5",
      unit: "count",
      timeBasis: "utc_day",
      unavailable: false
    }));
    expect(projects.rows.at(-1)).toEqual(expect.objectContaining({
      id: "trend.projects_created.6.previous",
      label: "Previous period · 2026-09-15 UTC",
      value: "3",
      unit: "count",
      timeBasis: "utc_day",
      unavailable: false
    }));
  });

  it("retains one-sided daily availability without substituting zero", () => {
    const fixture = createDashboardOverviewFixture(7);
    fixture.comparison.metrics.clients_created = {
      ...fixture.comparison.metrics.clients_created,
      current: null,
      delta: null,
      changeBps: null,
      changeKind: "unavailable",
      currentStatus: "unavailable",
      currentUnavailableReason: "The current client activity source is unavailable."
    };
    for (const bucket of fixture.comparison.currentBuckets) bucket.clientsCreated = null;

    const groups = toValueGroups(buildDashboardViewModel(fixture));
    const clients = groups.find((group) => group.id === "trend.clients_created")!;

    expect(clients.rows[0]).toEqual(expect.objectContaining({
      label: "Current period · 2026-09-16 UTC",
      value: "Not available",
      unit: "count",
      timeBasis: "utc_day",
      detail: "The current client activity source is unavailable.",
      unavailable: true
    }));
    expect(clients.rows[1]).toEqual(expect.objectContaining({
      label: "Previous period · 2026-09-09 UTC",
      value: "0",
      unit: "count",
      timeBasis: "utc_day",
      unavailable: false
    }));
  });
});

describe("executive dashboard chart adapters", () => {
  it("maps exact daily recorded cost activity and snapshot guides without deriving revenue history", () => {
    const model = buildDashboardViewModel(createDashboardOverviewFixture(7));
    const data = toFinanceActivityChartData(model);

    expect(data.points).toHaveLength(7);
    expect(data.points.at(-1)).toEqual(expect.objectContaining({
      id: "trends.ledgerExpensesPostedPaise:2026-09-22",
      date: "2026-09-22",
      valuePaise: 715_300,
      displayValue: "₹7,153.00",
      available: true
    }));
    expect(data.approvedNetRevenue).toMatchObject({
      id: "finance.approvedSubtotalPaise",
      valuePaise: 18_500_000,
      kind: "context"
    });
    expect(data.costBudget.valuePaise).toBe(14_800_000);
  });

  it("keeps a missing activity source unavailable while retaining healthy finance guides", () => {
    const fixture = createDashboardOverviewFixture(7);
    fixture.dataQuality = {
      status: "partial",
      totalIssueCount: 1,
      issues: [{
        code: "module_aggregate_unavailable",
        metricKey: "trends.ledgerExpensesPostedPaise",
        message: "Daily ledger activity is temporarily unavailable.",
        entityType: null,
        entityId: null
      }],
      unavailableMetricKeys: ["trends.ledgerExpensesPostedPaise"]
    };

    const data = toFinanceActivityChartData(buildDashboardViewModel(fixture));
    expect(data.points.every((point) => point.valuePaise === null && !point.available)).toBe(true);
    expect(data.points[0]?.unavailableReason).toBe("Daily ledger activity is temporarily unavailable.");
    expect(data.approvedNetRevenue.valuePaise).toBe(18_500_000);
    expect(data.costBudget.valuePaise).toBe(14_800_000);
  });

  it("preserves the four exact cost classes, lifecycle counts, and signed overspend", () => {
    const model = buildDashboardViewModel(createDashboardOverviewFixture());
    const overspend = buildDashboardViewModel(createOverspendDashboardOverviewFixture());
    const lifecycle = toLifecycleDonutData(model);
    const composition = toCostCompositionDonutData(model);
    const budget = toBudgetPositionChartData(overspend);

    expect(lifecycle.map((entry) => entry.id)).toEqual([
      "lifecycle.planning",
      "lifecycle.active",
      "lifecycle.onHold",
      "lifecycle.completed"
    ]);
    expect(composition.map((entry) => entry.id)).toEqual([
      "finance.procurementCostPaise",
      "finance.employeePaymentPaise",
      "finance.otherExpensePaise",
      "finance.overheadPaise"
    ]);
    expect(composition.reduce((sum, entry) => sum + (entry.value ?? 0), 0)).toBe(
      model.capital.recordedCost.value
    );
    expect(budget.remainingBudget.valuePaise).toBe(-2_000_000);
  });
});
