import { describe, expect, it } from "vitest";
import { superAdminDashboardProjectsPageFixture, superAdminDashboardWorkforcePageFixture } from "./dashboardFixtures";
import { projectReportTable, reportSection, workforceReportTable } from "./dashboardReportSections";

describe("dashboard report section alignment", () => {
  it("keeps priority identities and risk labels aligned without a progress report column", () => {
    const page = structuredClone(superAdminDashboardProjectsPageFixture);
    page.items[0].execution.progress = { numerator: 0, denominator: 0, rateBps: 0, fallbackTaskCount: 0 };
    page.items[0].risk.level = "gray";
    page.items[1].risk.level = "green";
    const table = projectReportTable("overview", page);
    expect(table.columns).toEqual(["Project", "Manager", "Due date", "Risk"]);
    expect(table.rows[0][1]).toBe("Mira Shah");
    expect(table.rows[0][3]).toBe("Not tracked");
    expect(table.rows[1][3]).toBe("Clear");
    expect(JSON.stringify(table)).not.toMatch(/progress|%/i);
  });
  it.each(["procurement", "execution"] as const)("keeps %s report status and amounts or task counts without project progress", (tab) => {
    const table = projectReportTable(tab, superAdminDashboardProjectsPageFixture);
    expect(JSON.stringify(table)).not.toMatch(/weighted progress|%/i);
    expect(table.rows[0][3]).toContain(tab === "procurement" ? "posted of" : "tasks");
    expect(table.rows[0][3]).toContain(tab === "procurement" ? "approved" : "overdue");
  });
  it("omits unverified identity rows and suppresses module amounts", () => {
    const page = structuredClone(superAdminDashboardProjectsPageFixture);
    page.dataQuality.unavailableMetricKeys = ["projects.rows"];
    expect(JSON.stringify(projectReportTable("finance", page))).not.toContain(page.items[0].projectName);
    page.dataQuality.unavailableMetricKeys = ["finance.approvedSubtotalPaise"];
    expect(String(projectReportTable("finance", page).rows[0][3])).toContain("Not available approved net");
  });
  it("keeps workforce workload unknown and numeric zero valid", () => {
    const page = structuredClone(superAdminDashboardWorkforcePageFixture);
    page.dataQuality.unavailableMetricKeys = ["workforce.workload"];
    page.items[0].activeTaskCount = 0;
    const row = workforceReportTable(page).rows[0];
    expect(row[3]).toBe(0);
    expect(row[4]).toBe("Not available");
    expect(row[5]).toBe("Not available");
  });
  it("records stale and partial independently without inventing observation timestamps", () => {
    const data = { ...superAdminDashboardProjectsPageFixture, dataQuality: { ...superAdminDashboardProjectsPageFixture.dataQuality, status: "partial" as const } };
    data.dataQuality.issues = [{ code: "module_aggregate_unavailable", metricKey: "finance.approvedSubtotalPaise", message: "Approved estimate source is missing.", entityType: "project", entityId: "project-risk" }];
    const state = reportSection("projects", "Project page", { data, isError: true, isPending: false, isFetching: false, refetch: () => undefined }, []);
    expect(state.state).toBe("stale");
    expect(state.dataQuality).toBe("partial");
    expect(state.observedAt).toBe(data.observedAt);
    expect(state.fetchedAt).toBeNull();
    expect(state.reason).toBe("Latest refresh failed. Approved estimate source is missing.");
  });
});
