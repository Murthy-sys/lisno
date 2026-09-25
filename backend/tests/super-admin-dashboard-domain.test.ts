import { describe, expect, it } from "vitest";

import {
  dashboardComparisonMetric,
  dashboardComparisonWindow,
  dashboardFactorDistribution,
  dashboardRatio,
  dashboardTaskRiskFactor,
  dashboardWeightedProgress,
  financeRiskFactors,
  overallDashboardRisk,
  riskFactor
} from "../src/domain/super-admin-dashboard.js";
import { resolveEstimateReviewRoundId } from "../src/domain/estimate-client-review.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createSuperAdminDashboardService } from "../src/services/super-admin-dashboard.service.js";

describe("Super Admin dashboard domain", () => {
  it("builds matched UTC event windows with aligned partial final days", () => {
    expect(dashboardComparisonWindow(new Date("2026-09-21T10:30:00.000Z"), 30)).toEqual({
      timezone: "UTC",
      current: {
        days: 30,
        startAt: "2026-08-23T00:00:00.000Z",
        endAt: "2026-09-21T10:30:00.000Z"
      },
      previous: {
        days: 30,
        startAt: "2026-07-24T00:00:00.000Z",
        endAt: "2026-08-22T10:30:00.000Z"
      },
      partialFinalDay: true
    });
  });

  it("builds 365-day current and previous UTC windows across a leap day", () => {
    const observedAt = new Date("2028-03-15T08:00:00.000Z");
    expect(dashboardComparisonWindow(observedAt, 365)).toEqual({
      timezone: "UTC",
      current: {
        days: 365,
        startAt: "2027-03-17T00:00:00.000Z",
        endAt: "2028-03-15T08:00:00.000Z"
      },
      previous: {
        days: 365,
        startAt: "2026-03-17T00:00:00.000Z",
        endAt: "2027-03-16T08:00:00.000Z"
      },
      partialFinalDay: true
    });

    const window = dashboardComparisonWindow(new Date("2026-09-24T23:59:59.999Z"), 365);
    expect(window.current).toEqual({
      days: 365,
      startAt: "2025-09-25T00:00:00.000Z",
      endAt: "2026-09-24T23:59:59.999Z"
    });
    expect(window.previous).toEqual({
      days: 365,
      startAt: "2024-09-25T00:00:00.000Z",
      endAt: "2025-09-24T23:59:59.999Z"
    });
    const dayMs = 24 * 60 * 60 * 1000;
    expect((Date.parse(window.current.startAt) - Date.parse(window.previous.startAt)) / dayMs).toBe(365);
  });

  it("aligns the 365-day reporting period with the comparison window across a leap day", async () => {
    const observedAt = new Date("2028-03-15T08:00:00.000Z");
    const repository = createMemoryRepository();
    const stored = await repository.findUserById("user-super-admin");
    expect(stored).not.toBeNull();
    const service = createSuperAdminDashboardService(repository, () => observedAt);
    const page = await service.projects(stored as unknown as PublicUser, 365, {
      sort: "risk_desc",
      limit: 1,
      offset: 0
    });
    expect(page.period).toEqual({
      days: 365,
      startAt: "2027-03-17T00:00:00.000Z",
      endAt: "2028-03-15T08:00:00.000Z"
    });
    for (const [days, startAt] of [
      [7, "2028-03-09T00:00:00.000Z"],
      [30, "2028-02-15T00:00:00.000Z"],
      [90, "2027-12-17T00:00:00.000Z"]
    ] as const) {
      const shorter = await service.projects(stored as unknown as PublicUser, days, {
        sort: "risk_desc",
        limit: 1,
        offset: 0
      });
      expect(shorter.period).toEqual({ days, startAt, endAt: "2028-03-15T08:00:00.000Z" });
      expect(dashboardComparisonWindow(observedAt, days).current.startAt).toBe(startAt);
    }
  });

  it("reports percentage, new, no-change, and unavailable comparison states", () => {
    expect(dashboardComparisonMetric({ unit: "count", current: 1, previous: 3 }))
      .toMatchObject({ delta: -2, changeBps: -6_667, changeKind: "percentage" });
    expect(dashboardComparisonMetric({ unit: "count", current: 2, previous: 0 }))
      .toMatchObject({ delta: 2, changeBps: null, changeKind: "new" });
    expect(dashboardComparisonMetric({ unit: "count", current: 0, previous: 0 }))
      .toMatchObject({ delta: 0, changeBps: null, changeKind: "no_change" });
    expect(dashboardComparisonMetric({
      unit: "paise",
      current: 100,
      previous: null,
      previousUnavailableReason: "Historical ledger unavailable."
    })).toMatchObject({
      currentStatus: "available",
      previousStatus: "unavailable",
      changeKind: "unavailable",
      previousUnavailableReason: "Historical ledger unavailable."
    });
  });

  it("resolves Estimate review identity from the current workflow state", () => {
    const rounds = [
      {
        id: "round-v1-changes",
        estimateVersion: 1,
        sendGeneration: 1,
        status: "changes_requested" as const,
        decision: "request_changes" as const,
        decidedAt: "2026-08-25T00:00:00.000Z"
      },
      {
        id: "round-v2-pending",
        estimateVersion: 2,
        sendGeneration: 2,
        status: "pending" as const,
        decision: null,
        createdAt: "2026-08-26T00:00:00.000Z"
      }
    ];

    expect(resolveEstimateReviewRoundId({
      estimateStatus: "sent_to_client",
      estimateVersion: 2,
      approvedReviewRoundId: null,
      rounds
    })).toBe("round-v2-pending");
    expect(resolveEstimateReviewRoundId({
      estimateStatus: "client_changes_requested",
      estimateVersion: 2,
      approvedReviewRoundId: null,
      rounds
    })).toBe("round-v1-changes");
    expect(resolveEstimateReviewRoundId({
      estimateStatus: "client_approved",
      estimateVersion: 2,
      approvedReviewRoundId: "round-v1-approved",
      rounds
    })).toBe("round-v1-approved");
    expect(resolveEstimateReviewRoundId({
      estimateStatus: "draft_internal",
      estimateVersion: 2,
      approvedReviewRoundId: "round-v1-approved",
      rounds
    })).toBeNull();
  });

  it("returns nullable basis points for zero denominators and preserves ratios above 100%", () => {
    expect(dashboardRatio(0, 0)).toEqual({
      numerator: 0,
      denominator: 0,
      rateBps: null
    });
    expect(dashboardRatio(120, 100)).toEqual({
      numerator: 120,
      denominator: 100,
      rateBps: 12_000
    });
  });

  it("uses persisted effort before the workflow fallback", () => {
    expect(dashboardWeightedProgress([
      { status: "in_progress", progress: 25, plannedEffort: 4, fallbackEffort: 10 },
      { status: "completed", progress: 80, plannedEffort: null, fallbackEffort: 6 }
    ])).toEqual({
      numerator: 700,
      denominator: 1_000,
      rateBps: 7_000,
      fallbackTaskCount: 1
    });
  });

  it("uses the canonical task-risk rule and maps its exact reason code", () => {
    const factor = dashboardTaskRiskFactor({
      task: {
        id: "task-1",
        projectId: "project-1",
        status: "in_progress",
        progress: 10,
        plannedStartAt: "2026-08-01T00:00:00.000Z",
        currentDeadlineAt: "2026-08-10T00:00:00.000Z",
        completedAt: null
      },
      drillDownTarget: "/admin/projects/project-1"
    }, new Date("2026-08-11T00:00:00.000Z"));
    expect(factor).toMatchObject({
      level: "red",
      reasonCode: "task_overdue",
      source: { entityType: "task", entityId: "task-1" }
    });
  });

  it("applies the exact Finance exceeded and at-most-10%-headroom boundaries", () => {
    expect(financeRiskFactors({
      projectId: "project-1",
      projectCompleted: false,
      costBudgetPaise: 1_000,
      recordedCostPaise: 1_001
    })[0]?.reasonCode).toBe("cost_budget_exceeded");
    expect(financeRiskFactors({
      projectId: "project-1",
      projectCompleted: false,
      costBudgetPaise: 1_000,
      recordedCostPaise: 900
    })[0]?.reasonCode).toBe("cost_budget_headroom_low");
    expect(financeRiskFactors({
      projectId: "project-1",
      projectCompleted: false,
      costBudgetPaise: 1_000,
      recordedCostPaise: 899
    })).toEqual([]);
    expect(financeRiskFactors({
      projectId: "project-1",
      projectCompleted: true,
      costBudgetPaise: 1_000,
      recordedCostPaise: 900
    })).toEqual([]);
  });

  it("keeps factor occurrences separate from unique affected projects", () => {
    const factor = riskFactor({
      kind: "workflow",
      level: "yellow",
      reasonCode: "project_on_hold",
      reason: "Project is on hold.",
      entityType: "project",
      entityId: "project-1",
      observedValue: "on_hold",
      threshold: "active",
      drillDownTarget: "/admin/projects/project-1"
    });
    expect(dashboardFactorDistribution([
      { projectId: "project-1", factors: [factor, factor] },
      { projectId: "project-2", factors: [{ ...factor, source: { ...factor.source, entityId: "project-2" } }] }
    ])).toEqual([{
      kind: "workflow",
      level: "yellow",
      reasonCode: "project_on_hold",
      occurrenceCount: 3,
      projectCount: 2
    }]);
    expect(overallDashboardRisk([])).toEqual({ level: "gray", factors: [] });
  });
});
