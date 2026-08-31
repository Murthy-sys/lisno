import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../../api/client";
import {
  DASHBOARD_PROJECT_MODULE_STATUSES,
  DASHBOARD_PROJECT_MODULES,
  DASHBOARD_PROJECT_SORTS,
  DASHBOARD_RISK_FACTORS,
  DASHBOARD_RISK_LEVELS,
  DASHBOARD_WORKFORCE_ASSIGNMENT_STATES,
  DASHBOARD_WORKFORCE_CAPACITY_STATES,
  DASHBOARD_WORKFORCE_SORTS,
  dashboardKeys,
  dashboardOverviewPath,
  dashboardProjectsPath,
  dashboardWorkforcePath,
  getSuperAdminDashboardOverview,
  getSuperAdminDashboardProjects,
  getSuperAdminDashboardWorkforce,
  normalizeDashboardPeriod,
  normalizeDashboardProjectFilters,
  normalizeDashboardTab
} from "./superAdminDashboardApi";

afterEach(() => vi.restoreAllMocks());

describe("Super Admin dashboard API", () => {
  it("normalizes URL-backed tab and period values without widening the contract", () => {
    expect(normalizeDashboardTab("risk")).toBe("risk");
    expect(normalizeDashboardTab("unknown")).toBe("overview");
    expect(normalizeDashboardPeriod("7")).toBe(7);
    expect(normalizeDashboardPeriod(90)).toBe(90);
    expect(normalizeDashboardPeriod("31")).toBe(30);
  });

  it("builds the single bounded Overview request", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});

    expect(dashboardOverviewPath(30)).toBe(
      "/admin/dashboard/overview?periodDays=30"
    );
    await getSuperAdminDashboardOverview(30);

    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(
      "/admin/dashboard/overview?periodDays=30"
    );
    expect(get.mock.calls.flat().join(" ")).not.toMatch(
      /\/admin\/projects|\/finance\/projects/
    );
  });

  it("whitelists, trims, bounds, and stably encodes every project query family", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
    const filters = {
      module: DASHBOARD_PROJECT_MODULES[6],
      projectStatus: "active" as const,
      moduleStatus: DASHBOARD_PROJECT_MODULE_STATUSES[25],
      riskLevel: DASHBOARD_RISK_LEVELS[3],
      riskFactor: DASHBOARD_RISK_FACTORS[2],
      search: "  North & East / Phase 2  ",
      sort: DASHBOARD_PROJECT_SORTS[0],
      limit: 999,
      offset: 40
    };

    expect(dashboardProjectsPath(90, filters)).toBe(
      "/admin/dashboard/projects?periodDays=90&module=risk&projectStatus=active&moduleStatus=red&riskLevel=red&riskFactor=staffing&search=North+%26+East+%2F+Phase+2&sort=risk_desc&limit=50&offset=40"
    );
    await getSuperAdminDashboardProjects(90, filters);
    expect(get).toHaveBeenCalledWith(dashboardProjectsPath(90, filters));

    expect(normalizeDashboardProjectFilters({
      module: "unsafe" as never,
      moduleStatus: "unsafe" as never,
      riskLevel: "blue" as never,
      riskFactor: "prediction" as never,
      sort: "unbounded" as never,
      limit: -1,
      offset: -1
    })).toEqual({ sort: "risk_desc", limit: 20, offset: 0 });
  });

  it("encodes every bounded workforce filter with the selected period", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
    const filters = {
      role: "worker_electrician" as const,
      assignmentState: DASHBOARD_WORKFORCE_ASSIGNMENT_STATES[0],
      capacityState: DASHBOARD_WORKFORCE_CAPACITY_STATES[1],
      kpiAvailability: "unavailable" as const,
      search: "  Aarav + team  ",
      sort: DASHBOARD_WORKFORCE_SORTS[1],
      limit: 20,
      offset: 20
    };

    expect(dashboardWorkforcePath(90, filters)).toBe(
      "/admin/dashboard/workforce?periodDays=90&role=worker_electrician&assignmentState=assigned&capacityState=over_capacity&kpiAvailability=unavailable&search=Aarav+%2B+team&sort=kpi_desc&limit=20&offset=20"
    );
    await getSuperAdminDashboardWorkforce(90, filters);
    expect(get).toHaveBeenCalledWith(dashboardWorkforcePath(90, filters));
  });

  it("keeps normalized query keys stable across equivalent inputs", () => {
    expect(dashboardKeys.all).toEqual(["super-admin-dashboard"]);
    expect(dashboardKeys.overview(7)).toEqual([
      "super-admin-dashboard",
      "overview",
      7
    ]);
    expect(dashboardKeys.projects(7, { search: "  East  ", limit: 20 })).toEqual(
      dashboardKeys.projects(7, { search: "East", limit: 20, offset: 0, sort: "risk_desc" })
    );
    expect(dashboardKeys.projects(7, {})).not.toEqual(
      dashboardKeys.projects(90, {})
    );
    expect(
      dashboardKeys.workforce(30, { search: "  Worker  " })
    ).toEqual(
      dashboardKeys.workforce(30, {
        search: "Worker",
        sort: "workload_desc",
        limit: 20,
        offset: 0
      })
    );
  });
});
