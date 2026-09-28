import { describe, expect, it } from "vitest";
import { VENDOR_KPI_RUBRICS as SHARED_RUBRICS, VENDOR_KPI_RUBRIC_VERSION as SHARED_VERSION } from "../../shared/knowledge/vendorKpi.js";
import { calculateVendorKpi, orderedVendorKpiScores, VENDOR_KPI_RUBRICS, VENDOR_KPI_RUBRIC_VERSION } from "../src/domain/vendor-kpi.js";

describe("Vendor KPI rubric and scoring", () => {
  it("tracks the frozen shared rubric keys and order", () => {
    expect(VENDOR_KPI_RUBRIC_VERSION).toBe(SHARED_VERSION);
    for (const vendorType of ["execution", "supplier"] as const)
      expect(VENDOR_KPI_RUBRICS[vendorType]).toEqual(SHARED_RUBRICS[vendorType].map(category => category.key));
  });
  it("requires every distinct category and calculates exact hundredth-point means", () => {
    expect(calculateVendorKpi("execution", [
      { key: "timeline", score: 90 }, { key: "quality", score: 95 }, { key: "budget", score: 85 }, { key: "site_discipline", score: 90 }
    ])).toBe(9000);
    expect(calculateVendorKpi("supplier", VENDOR_KPI_RUBRICS.supplier.map((key, index) => ({ key, score: [0, 85, 90, 95, 100][index]! })))).toBe(7400);
    expect(orderedVendorKpiScores("execution", VENDOR_KPI_RUBRICS.execution.toReversed().map(key => ({ key, score: 0 }))).map(score => score.key)).toEqual(VENDOR_KPI_RUBRICS.execution);
    for (const scores of [
      [{ key: "timeline", score: 90 }],
      [{ key: "timeline", score: 1 }, { key: "timeline", score: 2 }, { key: "budget", score: 3 }, { key: "site_discipline", score: 4 }],
      [{ key: "timeline", score: 0 }, { key: "quality", score: 1 }, { key: "budget", score: 2 }, { key: "unexpected", score: 3 }],
      [{ key: "timeline", score: -1 }, { key: "quality", score: 1 }, { key: "budget", score: 2 }, { key: "site_discipline", score: 3 }],
      [{ key: "timeline", score: 1.5 }, { key: "quality", score: 1 }, { key: "budget", score: 2 }, { key: "site_discipline", score: 3 }]
    ]) expect(() => calculateVendorKpi("execution", scores)).toThrow();
  });
});
