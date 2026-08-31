import { describe, expect, it } from "vitest";

import {
  dashboardMetricPresentation,
  formatNullablePaise,
  isDashboardMetricUnavailable
} from "./dashboardPresentation";

const partialQuality = {
  status: "partial" as const,
  totalIssueCount: 1,
  issues: [{
    code: "module_aggregate_unavailable" as const,
    metricKey: "risk.projectDistribution",
    message: "Risk distribution could not be verified.",
    entityType: null,
    entityId: null
  }],
  unavailableMetricKeys: ["risk.projectDistribution"]
};

describe("dashboard presentation", () => {
  it("renders unavailable procurement amounts without converting null to zero", () => {
    expect(formatNullablePaise(null)).toBe("Not available");
    expect(formatNullablePaise(0)).toMatch(/₹0(?:\.00)?/);
    expect(formatNullablePaise(125_000)).toMatch(/₹1,250(?:\.00)?/);
  });

  it("suppresses returned numeric and percentage values when their metric key is unavailable", () => {
    expect(isDashboardMetricUnavailable(partialQuality, "risk.projectDistribution")).toBe(true);
    expect(isDashboardMetricUnavailable(partialQuality, "risk.projectDistribution.red")).toBe(true);
    expect(dashboardMetricPresentation(
      partialQuality,
      "risk.projectDistribution",
      99
    )).toEqual({
      value: "Not available",
      detail: "Risk distribution could not be verified.",
      unavailable: true
    });
    expect(dashboardMetricPresentation(
      partialQuality,
      "projects.completionRate",
      "0.00%"
    ).value).toBe("0.00%");
  });
});
