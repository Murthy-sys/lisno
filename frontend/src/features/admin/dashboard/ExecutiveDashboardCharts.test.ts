import { describe, expect, it } from "vitest";

import { superAdminDashboardOverviewFixture } from "./dashboardFixtures";
import {
  createBudgetPositionOption,
  createCostCompositionOption,
  createExecutiveLifecycleOption,
  createRecordedCostActivityOption
} from "./ExecutiveDashboardCharts";
import type { DashboardChartTheme } from "./echarts/types";
import type { SuperAdminDashboardOverview } from "./superAdminDashboardApi";

const theme = {
  series: ["#5f806c", "#c8aa7c", "#607fa8", "#866c98"],
  ordinal: ["#5f806c", "#c8aa7c", "#607fa8", "#866c98", "#9aa09c", "#496856"],
  status: {
    good: "#496856",
    warning: "#bf832c",
    serious: "#b86637",
    critical: "#b4514f",
    neutral: "#9aa09c"
  },
  text: "#171b2d",
  mutedText: "#626a7d",
  grid: "#e4e1da",
  track: "#eff0ed",
  surface: "#ffffff"
} satisfies DashboardChartTheme;

type Series = {
  id?: string;
  type?: string;
  universalTransition?: unknown;
  data?: Array<{ id?: string; groupId?: string; name?: string; value?: number | null }>;
};

const seriesOf = (option: unknown) =>
  ((option as { series?: Series[] }).series ?? []);

describe("executive dashboard ECharts options", () => {
  it("keeps stable finance activity identities and separates snapshot guides", () => {
    const make = () => createRecordedCostActivityOption({
      trends: superAdminDashboardOverviewFixture.trends,
      approvedNetRevenuePaise: superAdminDashboardOverviewFixture.finance.approvedSubtotalPaise,
      costBudgetPaise: superAdminDashboardOverviewFixture.finance.costBudgetPaise,
      theme
    });
    const first = seriesOf(make());
    const updated = seriesOf(make());

    expect(first.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: "recorded-cost-activity", type: "bar" },
      { id: "approved-net-revenue-guide", type: "line" },
      { id: "cost-budget-guide", type: "line" }
    ]);
    expect(updated.map(({ id }) => id)).toEqual(first.map(({ id }) => id));
    expect(first.every((series) => Boolean(series.universalTransition))).toBe(true);
  });

  it("omits an unavailable snapshot guide instead of turning it into zero", () => {
    const series = seriesOf(createRecordedCostActivityOption({
      trends: superAdminDashboardOverviewFixture.trends,
      approvedNetRevenuePaise: null,
      costBudgetPaise: superAdminDashboardOverviewFixture.finance.costBudgetPaise,
      theme
    }));
    expect(series.map(({ id }) => id)).toEqual([
      "recorded-cost-activity",
      "cost-budget-guide"
    ]);
  });

  it("keeps verified lifecycle slices when one stage is unavailable", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
    data.dataQuality = {
      status: "partial",
      totalIssueCount: 1,
      unavailableMetricKeys: ["projects.onHold"],
      issues: [{
        code: "module_aggregate_unavailable",
        metricKey: "projects.onHold",
        message: "On-hold projects could not be verified.",
        entityType: null,
        entityId: null
      }]
    };
    const slices = seriesOf(createExecutiveLifecycleOption({ data, theme }))[0].data!;
    expect(slices.find(({ id }) => id === "on_hold")?.value).toBeNull();
    expect(slices.find(({ id }) => id === "active")?.value).toBe(1);
  });

  it("keeps healthy cost classes when one finance lineage is unavailable", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
    data.dataQuality = {
      status: "partial",
      totalIssueCount: 1,
      unavailableMetricKeys: ["finance.employeePaymentPaise"],
      issues: [{
        code: "module_aggregate_unavailable",
        metricKey: "finance.employeePaymentPaise",
        message: "Employee payments could not be verified.",
        entityType: null,
        entityId: null
      }]
    };
    const slices = seriesOf(createCostCompositionOption({ data, theme }))[0].data!;
    expect(slices.find(({ id }) => id === "employee")?.value).toBeNull();
    expect(slices.find(({ id }) => id === "procurement")?.value).toBe(1_200_000);
  });

  it("preserves verified zero and signed overspend in the budget position", () => {
    const zero = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
    zero.finance.costBudgetPaise = 0;
    zero.finance.recordedCostPaise = 0;
    zero.finance.remainingBudgetPaise = 0;
    expect(seriesOf(createBudgetPositionOption({ data: zero, theme }))[0].data?.map(({ value }) => value))
      .toEqual([0, 0, 0]);

    const overspent = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
    overspent.finance.costBudgetPaise = 10_000;
    overspent.finance.recordedCostPaise = 15_000;
    overspent.finance.remainingBudgetPaise = -5_000;
    const marks = seriesOf(createBudgetPositionOption({ data: overspent, theme }))[0].data!;
    expect(marks[2]).toMatchObject({ id: "remaining-budget", name: "Overspent", value: -5_000 });
  });
});
