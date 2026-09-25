import {
  buildDashboardViewModel,
  dashboardUnavailableReason,
  isDashboardMetricUnavailable
} from "./viewModel";
import {
  formatDashboardBps,
  formatDashboardComparisonChange,
  formatDashboardCount,
  formatDashboardPaise,
  formatDashboardSignedCount,
  formatDashboardTimestamp
} from "./formatters";
import {
  createDashboardOverviewFixture,
  createOverspendDashboardOverviewFixture,
  createPartialDashboardOverviewFixture,
  createUnavailableDashboardOverviewFixture,
  createZeroDashboardOverviewFixture
} from "./testFixtures";

describe("dashboard view model", () => {
  it("projects six count-only hero metrics and aligns their real UTC daily buckets", () => {
    const model = buildDashboardViewModel(createDashboardOverviewFixture());

    expect(model.heroCountMetrics.map((metric) => metric.id)).toEqual([
      "projects_created",
      "clients_created",
      "projects_completed",
      "execution_tasks_completed",
      "estimates_approved",
      "design_plans_approved"
    ]);
    expect(model.heroCountMetrics.some((metric) => metric.id === ("recorded_expenses_paise" as never))).toBe(false);
    expect(model.trendByMetric.clients_created.points).toHaveLength(7);
    expect(model.trendByMetric.clients_created.points.at(-1)).toMatchObject({
      current: 2,
      previous: 4,
      currentDate: "2026-09-22",
      previousDate: "2026-09-15"
    });
  });

  it("keeps unavailable client and comparison data unavailable rather than zero", () => {
    const partial = buildDashboardViewModel(createPartialDashboardOverviewFixture());
    const unavailable = buildDashboardViewModel(createUnavailableDashboardOverviewFixture());

    expect(partial.clientFacts.values.every((value) => !value.available && value.value === null)).toBe(true);
    expect(partial.heroCountMetrics.find((metric) => metric.id === "clients_created")).toMatchObject({
      current: null,
      previous: null,
      currentAvailable: false,
      previousAvailable: false
    });
    expect(partial.trendByMetric.clients_created.points.every((point) => point.current === null && point.previous === null)).toBe(true);
    expect(unavailable.heroCountMetrics.every((metric) => metric.changeKind === "unavailable")).toBe(true);
  });

  it("keeps a healthy current comparison value when only the previous side is unavailable", () => {
    const fixture = createDashboardOverviewFixture();
    fixture.comparison.metrics.projects_created = {
      ...fixture.comparison.metrics.projects_created,
      previous: null,
      delta: null,
      changeBps: null,
      changeKind: "unavailable",
      previousStatus: "unavailable",
      previousUnavailableReason: "Previous project activity is temporarily unavailable."
    };

    const projectsCreated = buildDashboardViewModel(fixture).heroCountMetrics.find(
      (metric) => metric.id === "projects_created"
    );
    expect(projectsCreated).toMatchObject({
      current: 5,
      currentAvailable: true,
      currentDisplay: "5",
      previous: null,
      previousAvailable: false,
      unavailableReason: "Previous project activity is temporarily unavailable."
    });
  });

  it("tracks priority-project availability independently from risk distribution availability", () => {
    const fixture = createDashboardOverviewFixture();
    fixture.dataQuality = {
      status: "partial",
      totalIssueCount: 1,
      issues: [{
        code: "module_aggregate_unavailable",
        metricKey: "risk.topProjects",
        message: "Priority-project ranking is temporarily unavailable.",
        entityType: null,
        entityId: null
      }],
      unavailableMetricKeys: ["risk.topProjects"]
    };

    const risk = buildDashboardViewModel(fixture).risk;
    expect(risk.available).toBe(true);
    expect(risk.distribution.every((value) => value.available)).toBe(true);
    expect(risk.topProjectsAvailable).toBe(false);
    expect(risk.topProjects).toEqual([]);
    expect(risk.topProjectsUnavailableReason).toBe("Priority-project ranking is temporarily unavailable.");
  });

  it("retains valid zeros as available data and detects the all-zero analytical state", () => {
    const model = buildDashboardViewModel(createZeroDashboardOverviewFixture());

    expect(model.heroCountMetrics.every((metric) => metric.current === 0 && metric.currentAvailable)).toBe(true);
    expect(model.hasAvailableData).toBe(true);
    expect(model.isAllZero).toBe(true);
  });

  it("preserves signed paise and basis-point finance values", () => {
    const model = buildDashboardViewModel(createOverspendDashboardOverviewFixture());

    expect(model.capital.remainingBudget.value).toBe(-2_000_000);
    expect(model.capital.currentProfit.value).toBe(-1_250_000);
    expect(model.capital.currentMargin.value).toBe(-676);
    expect(model.capital.remainingBudget.displayValue).toContain("20,000.00");
    expect(model.capital.currentProfit.displayValue).toContain("12,500.00");
  });

  it("keeps direct spend as an aggregate outside the non-overlapping cost composition", () => {
    const model = buildDashboardViewModel(createDashboardOverviewFixture());

    expect(model.capital.directSpend.value).toBe(7_900_000);
    expect(model.capital.costComposition.map((value) => value.id)).toEqual([
      "finance.procurementCostPaise",
      "finance.employeePaymentPaise",
      "finance.otherExpensePaise",
      "finance.overheadPaise"
    ]);
    expect(model.capital.costComposition.reduce((sum, value) => sum + (value.value ?? 0), 0)).toBe(
      model.capital.recordedCost.value
    );
  });

  it("exposes live overdue as its own snapshot value for the executive KPI", () => {
    const model = buildDashboardViewModel(createDashboardOverviewFixture());
    const overdue = model.projectFacts.values.find((value) => value.id === "projects.liveOverdue");

    expect(overdue).toMatchObject({
      label: "Live overdue",
      value: 4,
      displayValue: "4",
      unit: "count",
      timeBasis: "snapshot",
      available: true
    });
    expect(model.allValues.find((group) => group.id === "projects")?.values).toContainEqual(overdue);
  });

  it("exposes current, previous, absolute, and relative comparison rows for accessibility", () => {
    const model = buildDashboardViewModel(createDashboardOverviewFixture());
    const comparison = model.allValues.find((group) => group.id === "comparison")!;
    const projectRows = comparison.values.filter((value) => value.id.startsWith("comparison.projects_created"));

    expect(projectRows.map((value) => value.id)).toEqual([
      "comparison.projects_created.current",
      "comparison.projects_created.previous",
      "comparison.projects_created.delta",
      "comparison.projects_created.change"
    ]);
    expect(projectRows.map((value) => value.displayValue)).toEqual(["5", "3", "+2", "+66.67%"]) ;
  });

  it("matches module-level data-quality prefixes and preserves backend reasons", () => {
    const fixture = createPartialDashboardOverviewFixture();

    expect(isDashboardMetricUnavailable(fixture.dataQuality, "clients.registeredAccounts")).toBe(true);
    expect(dashboardUnavailableReason(fixture.dataQuality, "clients.activeAccounts")).toBe(
      "Client aggregates are temporarily unavailable."
    );
  });
});

describe("dashboard formatters", () => {
  it("formats counts, paise, basis points, signed changes, and UTC timestamps safely", () => {
    const fixture = createDashboardOverviewFixture();

    expect(formatDashboardCount(null)).toBe("Not available");
    expect(formatDashboardCount(12_345)).toBe("12,345");
    expect(formatDashboardPaise(-1_250_050)).toContain("-₹12,500.50");
    expect(formatDashboardBps(1_250)).toBe("12.5%");
    expect(formatDashboardSignedCount(-12)).toBe("−12");
    expect(formatDashboardTimestamp("invalid")).toBe("Not available");
    expect(formatDashboardTimestamp(fixture.observedAt)).toContain("UTC");
    expect(formatDashboardComparisonChange(fixture.comparison.metrics.projects_created)).toBe("+66.67%");
  });
});
