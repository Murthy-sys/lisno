import { describe, expect, it } from "vitest";

import {
  dashboardFactorDistribution,
  dashboardRatio,
  dashboardTaskRiskFactor,
  dashboardWeightedProgress,
  financeRiskFactors,
  overallDashboardRisk,
  riskFactor
} from "../src/domain/super-admin-dashboard.js";
import { resolveEstimateReviewRoundId } from "../src/domain/estimate-client-review.js";

describe("Super Admin dashboard domain", () => {
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
