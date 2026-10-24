import { describe, expect, it } from "vitest";
import { superAdminDashboardOverviewFixture as fixture } from "./dashboardFixtures";
import { DASHBOARD_TABS } from "./superAdminDashboardApi";
import { dashboardDetailHref, getAvailableDashboardMetrics, getDashboardMetrics, metricsTable } from "./dashboardViewModel";

describe("dashboard presentation sources", () => {
  it("builds supported detail URLs with period and comparison preserved", () => {
    expect(dashboardDetailHref({ tab: "projects", projectStatus: "active" }, 90, false)).toBe("/admin/dashboard?tab=projects&periodDays=90&comparison=off&projectStatus=active");
    expect(dashboardDetailHref({ tab: "workforce", role: "worker_electrician" }, 7)).toContain("role=worker_electrician");
    const overdue = getDashboardMetrics("overview", fixture).primary.find((metric) => metric.label === "Live overdue projects")!;
    expect(overdue.href).toContain("tab=risk");
    expect(overdue.href).toContain("riskFactor=schedule");
    expect(overdue.href).toContain("sort=deadline_asc");
    expect(overdue.actionLabel).toBe("Review schedule risk");
  });
  it("hides unavailable metrics while retaining valid zero and negative values", () => {
    const data = structuredClone(fixture);
    data.finance.currentProfitPaise = -123456;
    data.finance.recordedCostPaise = 0;
    data.finance.currentMarginBps = null;
    data.dataQuality.unavailableMetricKeys = ["finance.approvedSubtotalPaise"];
    const metrics = getAvailableDashboardMetrics("finance", data).primary;
    expect(metrics.map((metric) => metric.label)).toEqual(["Recorded expenses", "Current profit (live)"]);
    expect(metrics.map((metric) => metric.value)).toEqual(["₹0.00", "-₹1,234.56"]);
    expect(metricsTable("finance", data).rows.some((row) => row[1] === "Not available")).toBe(true);
  });

  it("omits missing Client and ratio metrics without removing valid project snapshots", () => {
    const data = structuredClone(fixture);
    delete data.clients;
    delete data.comparison;
    data.projects.completionRate.rateBps = null;
    const metrics = getAvailableDashboardMetrics("overview", data).primary;
    expect(metrics.map((metric) => metric.label)).toEqual(["Total projects", "Approved net value", "Approved contract value", "Current margin", "Live overdue projects"]);
    expect(metrics[0].detail).toBe("Current portfolio");
    expect(getAvailableDashboardMetrics("overview", data).secondary.some((metric) => metric.label === "Completion rate")).toBe(false);
    expect(getDashboardMetrics("overview", data).secondary.find((metric) => metric.label === "Project creation activity")?.detail).toContain("unavailable");
  });

  it.each(DASHBOARD_TABS)("can omit every metric when its sources are unavailable for %s", (tab) => {
    const data = structuredClone(fixture);
    data.dataQuality.unavailableMetricKeys = ["projects", "clients", "finance", "estimation", "design", "procurement", "execution", "workforce", "risk"];
    expect(getAvailableDashboardMetrics(tab, data)).toEqual({ primary: [], secondary: [] });
  });
  it.each(DASHBOARD_TABS)("selects the expected headline metrics without discarding secondary values for %s", (tab) => {
    const metrics = getDashboardMetrics(tab, fixture);
    expect(metrics.primary).toHaveLength(tab === "overview" ? 5 : 4);
    expect(new Set([...metrics.primary, ...metrics.secondary].map((metric) => metric.label)).size)
      .toBe(metrics.primary.length + metrics.secondary.length);
    expect(metricsTable(tab, fixture).rows).toHaveLength(metrics.primary.length + metrics.secondary.length);
  });

  it("keeps finance snapshots distinct from period events", () => {
    const result = getDashboardMetrics("overview", fixture);
    expect(result.primary.map((metric) => metric.value)).toEqual([2, "₹1,00,000.00", "₹1,18,000.00", "72.00%", 1]);
    expect(result.primary[1].detail).toBe("Excluding GST");
    expect(result.primary[2].detail).toBe("Including GST");
    expect(result.primary.some((metric) => metric.detail?.includes("vs previous"))).toBe(false);
    expect(result.secondary.find((metric) => metric.label === "Project creation activity")?.detail).toContain("-1");
    expect(result.secondary.find((metric) => metric.label === "Completion rate")?.value).toBe("50.00%");
  });

  it("distinguishes unknown Client data and completion from valid zero", () => {
    const data = structuredClone(fixture);
    delete data.clients;
    data.projects.total = 0;
    data.projects.completionRate = { numerator: 0, denominator: 0, rateBps: null };
    const metrics = getDashboardMetrics("overview", data);
    expect(metrics.primary[0].value).toBe(0);
    expect(metrics.secondary.find((metric) => metric.label === "Active clients")?.value).toBe("Not available");
    expect(metrics.secondary.find((metric) => metric.label === "Completion rate")?.value).toBe("Not available");
  });

  it("suppresses unavailable finance and preserves negative backend profit", () => {
    const data = structuredClone(fixture);
    data.finance.currentProfitPaise = -123456;
    data.dataQuality.unavailableMetricKeys = ["finance.approvedSubtotalPaise"];
    const result = getDashboardMetrics("finance", data).primary;
    expect(result[0].value).toBe("Not available");
    expect(result[0].unavailable).toBe(true);
    expect(result[2].value).toBe("-₹1,234.56");
  });

  it("describes average denominators without presenting summed scores as record counts", () => {
    const workforce = getDashboardMetrics("workforce", fixture);
    expect(workforce.primary.find((metric) => metric.label === "Average calculated KPI")?.detail).toBe("Based on 1 eligible worker");
    const procurement = getDashboardMetrics("procurement", fixture);
    expect([...procurement.primary, ...procurement.secondary].find((metric) => metric.label === "Average persisted progress")?.detail).toBe("Average across 1 tracked task");
  });
});
