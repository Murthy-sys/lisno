import { describe, expect, it } from "vitest";
import { chartDatasetTable, chartDatasetTotal, clientBreakdownDataset, costCompositionDataset, getDashboardChartDatasets, getDashboardChartTables, getVisibleDashboardChartDataset, lifecycleDataset, periodActivityComparisonDataset, projectActivityDataset, projectCreationHeatmapDataset, recordedExpenseDataset } from "./dashboardChartData";
import { superAdminDashboardOverviewFixture } from "./dashboardFixtures";
import { DASHBOARD_TABS, type SuperAdminDashboardOverview } from "./superAdminDashboardApi";

const fixture = () => structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
const unavailable = (data: SuperAdminDashboardOverview, key: string) => { data.dataQuality = { status: "partial", totalIssueCount: 1, unavailableMetricKeys: [key], issues: [{ code: "module_aggregate_unavailable", metricKey: key, message: `${key} unavailable.`, entityId: null, entityType: null }] }; };

describe("shared dashboard chart datasets", () => {
  it.each(DASHBOARD_TABS)("exports every %s plotted value using the same prepared rows", (tab) => {
    const data = fixture();
    const datasets = getDashboardChartDatasets(tab, data);
    const tables = getDashboardChartTables(tab, data);
    expect(tables.map((table) => table.title)).toEqual(datasets.map((dataset) => dataset.title));
    datasets.forEach((dataset, index) => expect(tables[index].rows.slice(0, dataset.rows.length)).toEqual(chartDatasetTable(dataset).rows));
  });

  it("uses selected-period expense amounts, preserving exact paise and signed values", () => {
    const data = fixture();
    data.trends = [{ ...data.trends[0], date: "2026-08-29", ledgerExpensesPostedPaise: 12345 }, { ...data.trends[0], ledgerExpensesPostedPaise: -2345 }];
    const dataset = recordedExpenseDataset(data);
    expect(dataset.total).toBe(10000);
    expect(dataset.rows.map((row) => row.values[0])).toEqual([12345, -2345]);
    expect(chartDatasetTable(dataset).rows).toEqual([["2026-08-29", 123.45], ["2026-08-30", -23.45]]);
    expect(dataset.total).not.toBe(data.finance.recordedCostPaise);
  });

  it("does not assign any percentage when a Client slice or denominator is unavailable", () => {
    const data = fixture();
    data.clients = { ...data.clients!, registeredAccounts: 9, activeAccounts: 7, inactiveAccounts: null };
    const dataset = clientBreakdownDataset(data);
    expect(chartDatasetTotal(dataset)).toBeNull();
    expect(chartDatasetTable(dataset).rows.map((row) => row[2])).toEqual([null, null]);
    data.clients.inactiveAccounts = 2;
    data.clients.registeredAccounts = null;
    expect(clientBreakdownDataset(data).partialReason).toContain("total is unavailable");
  });

  it("keeps disabled account availability distinct from a verified empty organization", () => {
    const data = fixture();
    data.clients = { ...data.clients!, accountsStatus: "unavailable", accountsUnavailableReason: "Account source could not be reached." };
    const unavailableTable = getDashboardChartTables("overview", data).find((table) => table.title === "Client breakdown")!;
    expect(unavailableTable.rows.flat()).toContain("Account source could not be reached. · Some source values are unavailable.");
    delete data.clients;
    expect(clientBreakdownDataset(data).unavailableReason).toContain("unavailable in this response");
    const empty = fixture();
    Object.assign(empty.clients!, { registeredAccounts: 0, activeAccounts: 0, inactiveAccounts: 0 });
    const dataset = clientBreakdownDataset(empty);
    expect(dataset.unavailableReason).toBeUndefined();
    expect(chartDatasetTotal(dataset)).toBe(0);
    expect(chartDatasetTable(dataset).rows.map((row) => row[2])).toEqual([null, null]);
  });

  it("preserves unavailable collection state for empty worker and task distributions", () => {
    const data = fixture();
    data.workforce.roleDistribution = [];
    unavailable(data, "workforce.roleDistribution");
    expect(getDashboardChartDatasets("workforce", data)[0].unavailableReason).toBe("workforce.roleDistribution unavailable.");
    data.execution.roleDistribution = [];
    unavailable(data, "execution.roleDistribution");
    expect(getDashboardChartDatasets("execution", data)[2].unavailableReason).toBe("execution.roleDistribution unavailable.");
  });

  it("keeps remaining classifications when one cost source is unavailable without inventing shares", () => {
    const data = fixture();
    unavailable(data, "finance.employeePaymentPaise");
    const dataset = costCompositionDataset(data);
    expect(dataset.rows[0].values).toEqual([data.finance.procurementCostPaise]);
    expect(dataset.rows[1].values).toEqual([null]);
    expect(chartDatasetTotal(dataset)).toBeNull();
    expect(chartDatasetTable(dataset).rows.every((row) => row[2] === null)).toBe(true);
  });

  it("reconciles category totals and refuses percentages for incompatible populations", () => {
    const data = fixture();
    const costs = costCompositionDataset(data);
    expect(costs.rows.reduce((total, row) => total + row.values[0]!, 0)).toBe(data.finance.recordedCostPaise);
    data.projects.total += 1;
    expect(lifecycleDataset(data).partialReason).toContain("do not reconcile");
    expect(chartDatasetTotal(lifecycleDataset(data))).toBeNull();
  });

  it("keeps nonfinite and unsafe source values out of charts and exports", () => {
    const data = fixture();
    data.projects.active = Number.NaN;
    data.projects.completed = Number.MAX_SAFE_INTEGER + 1;
    const dataset = lifecycleDataset(data);
    expect(dataset.rows.find((row) => row.id === "active")?.values).toEqual([null]);
    expect(dataset.rows.find((row) => row.id === "completed")?.values).toEqual([null]);
  });

  it("omits wholly unavailable chart views while keeping their report diagnostics", () => {
    const data = fixture();
    delete data.clients;
    const source = clientBreakdownDataset(data);
    expect(getVisibleDashboardChartDataset(source)).toBeNull();
    expect(getDashboardChartTables("overview", data).find((table) => table.title === source.title)?.rows.flat().join(" ")).toContain("Client account data is unavailable");
  });

  it("converts an incomplete donut to bars before removing categories and totals", () => {
    const data = fixture();
    unavailable(data, "finance.employeePaymentPaise");
    const source = costCompositionDataset(data);
    const sourceSnapshot = structuredClone(source);
    const visible = getVisibleDashboardChartDataset(source)!;
    expect(visible.kind).toBe("bar");
    expect(visible.rows.map((row) => row.id)).toEqual(["procurement", "other", "overhead"]);
    expect(visible.totalLabel).toBeUndefined();
    expect(visible.total).toBeUndefined();
    expect(visible.partialReason).toBeUndefined();
    expect(chartDatasetTable(visible).columns).not.toContain("Share (%)");
    expect(source).toEqual(sourceSnapshot);
    expect(getVisibleDashboardChartDataset(visible)).toEqual(visible);
  });

  it("removes wholly missing series while retaining dated gaps without a subset total", () => {
    const data = fixture();
    data.trends = [data.trends[0], { ...data.trends[0], date: "2026-08-31", projectsCreated: Number.NaN }];
    unavailable(data, "trends.projectsCompleted");
    const source = getDashboardChartDatasets("projects", data)[0];
    const visible = getVisibleDashboardChartDataset(source)!;
    expect(visible.series.map((series) => series.id)).toEqual(["created"]);
    expect(visible.rows.map((row) => row.id)).toEqual(["2026-08-30", "2026-08-31"]);
    expect(visible.rows.map((row) => row.values)).toEqual([[data.trends[0].projectsCreated], [null]]);
    expect(visible.partialReason).toBeUndefined();
    expect(visible.total).toBeUndefined();
  });

  it("keeps verified empty, zero, and negative values visible", () => {
    const data = fixture();
    data.workforce.roleDistribution = [];
    expect(getVisibleDashboardChartDataset(getDashboardChartDatasets("workforce", data)[0])?.rows).toEqual([]);
    data.finance.costBudgetPaise = 0;
    data.finance.remainingBudgetPaise = -12345;
    const visible = getVisibleDashboardChartDataset(getDashboardChartDatasets("finance", data)[2])!;
    expect(visible.rows.find((row) => row.id === "cost-budget")?.values).toEqual([0]);
    expect(visible.rows.find((row) => row.id === "remaining-budget")?.values).toEqual([-12345]);
  });
  it("compares only supported event counts, preserving current and previous values independently", () => {
    const data = fixture();
    const created = data.comparison!.metrics.projects_created;
    Object.assign(created, { current: 9, previous: 3 });
    const rows = periodActivityComparisonDataset(data).rows;
    expect(rows.find((row) => row.id === "projects_created")?.values).toEqual([9, 3]);
    expect(rows.map((row) => row.id)).not.toContain("recorded_expenses_paise");
    expect(rows.map((row) => row.id)).not.toContain("active");
    expect(periodActivityComparisonDataset(data, false).rows[0].values).toEqual([9]);
    expect(getDashboardChartTables("overview", data, false).find((table) => table.title === "Period activity comparison")?.columns).not.toContain("Previous period");
  });

  it.each(["current", "previous"] as const)("applies backend comparison child masks independently to the %s value", (window) => {
    const data = fixture();
    Object.assign(data.comparison!.metrics.projects_created, { current: 9, previous: 3 });
    unavailable(data, `comparison.projects_created.${window}`);
    const source = periodActivityComparisonDataset(data);
    const expected = window === "current" ? [null, 3] : [9, null];
    expect(source.rows.find((row) => row.id === "projects_created")?.values).toEqual(expected);
    expect(source.rows.find((row) => row.id === "projects_completed")?.values).toEqual([0, 1]);
    expect(getVisibleDashboardChartDataset(source)?.rows.find((row) => row.id === "projects_created")?.values).toEqual(expected);
    expect(chartDatasetTable(source).rows.find((row) => row[0] === "Projects created")?.slice(1, 3)).toEqual(expected);
  });

  it("hides missing comparison detail without hiding current zero or leaking source messages", () => {
    const data = fixture();
    for (const metric of Object.values(data.comparison!.metrics)) Object.assign(metric, { previous: null, previousStatus: "unavailable", previousUnavailableReason: "Prior event history unavailable." });
    data.comparison!.metrics.projects_created.current = 0;
    const source = periodActivityComparisonDataset(data);
    const visible = getVisibleDashboardChartDataset(source)!;
    expect(visible.series.map((series) => series.id)).toEqual(["current-period"]);
    expect(visible.rows[0].values).toEqual([0]);
    expect(chartDatasetTable(visible).rows.flat().join(" ")).not.toContain("Prior event history unavailable");
    expect(chartDatasetTable(source).rows.flat().join(" ")).toContain("Prior event history unavailable");
    delete data.comparison;
    expect(getVisibleDashboardChartDataset(periodActivityComparisonDataset(data))).toBeNull();
  });

  it("keeps absent calendar days unknown and explicit zeroes measured across UTC month boundaries", () => {
    const data = fixture();
    data.period = { days: 7, startAt: "2026-08-29T00:00:00.000Z", endAt: "2026-09-04T12:00:00.000Z" };
    data.trends = [{ ...data.trends[0], date: "2026-08-29", projectsCreated: 0 }, { ...data.trends[0], date: "2026-09-01", projectsCreated: 6 }];
    const calendar = projectCreationHeatmapDataset(data);
    expect(calendar.rows).toHaveLength(7);
    expect(calendar.rows.map((row) => row.values[0])).toEqual([0, null, null, 6, null, null, null]);
    expect(calendar.rows[6].id).toBe("2026-09-04");
    expect(projectActivityDataset(data).rows.map((row) => row.values[0])).toEqual(calendar.rows.map((row) => row.values[0]));
    expect(chartDatasetTable(calendar).rows[1][1]).toBeNull();
  });

  it.each([7, 30, 90] as const)("limits the activity calendar to the real %s-day window", (days) => {
    const data = fixture();
    const start = new Date("2026-07-01T00:00:00.000Z");
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + days - 1);
    data.period = { days, startAt: start.toISOString(), endAt: end.toISOString() };
    expect(projectCreationHeatmapDataset(data).rows).toHaveLength(days);
  });

  it("renders signed cost composition as bars with no false percentage shares", () => {
    const data = fixture();
    data.finance.procurementCostPaise = -1_200_000;
    data.finance.recordedCostPaise -= 2_400_000;
    const visible = getVisibleDashboardChartDataset(costCompositionDataset(data))!;
    expect(visible.kind).toBe("bar");
    expect(visible.rows[0].values).toEqual([-1_200_000]);
    expect(chartDatasetTable(visible).columns).not.toContain("Share (%)");
  });

});
