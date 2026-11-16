import { describe, expect, it } from "vitest";
import type { ProjectFinanceBucket, ProjectFinanceCommitmentBudget, ProjectFinancePortfolioSummary } from "../../api/types";
import { baseBucket, portfolioSummary } from "../../test/fixtures/enterpriseFinanceData";
import { readPortfolioCommitmentBudget, readProjectCommitmentBudget } from "./projectCommitmentBudget";

const ready: ProjectFinanceCommitmentBudget = {
  status: "ready", reasonCodes: [], approvedVendorNetPaise: 5_000,
  outstandingVendorCommitmentPaise: 5_000, budgetUsedPaise: 5_000,
  availableBudgetPaise: 2_200, utilizationBps: 6_944, budgetStatus: "within_budget", overBudget: false
};
const project: ProjectFinanceBucket = { ...baseBucket, costBudgetPaise: 7_200, recordedCostPaise: 0, commitmentBudget: ready };
const unresolved: ProjectFinanceCommitmentBudget = {
  status: "needs_reconciliation", reasonCodes: ["unlinked_procurement_expense"], approvedVendorNetPaise: 5_000,
  outstandingVendorCommitmentPaise: null, budgetUsedPaise: null, availableBudgetPaise: null,
  utilizationBps: null, budgetStatus: null, overBudget: null
};

describe("commitment budget response validation", () => {
  it("accepts ready values, a linked partial expense and signed overruns without altering recorded data", () => {
    expect(readProjectCommitmentBudget(project)).toEqual({ budget: ready, ready: true, message: null });
    expect(readProjectCommitmentBudget({ ...project, recordedCostPaise: 3_000,
      commitmentBudget: { ...ready, outstandingVendorCommitmentPaise: 2_000 } }).ready).toBe(true);
    expect(readProjectCommitmentBudget({ ...project, commitmentBudget: { ...ready,
      approvedVendorNetPaise: 9_000, outstandingVendorCommitmentPaise: 9_000, budgetUsedPaise: 9_000,
      availableBudgetPaise: -1_800, utilizationBps: 12_500, budgetStatus: "over_budget", overBudget: true } }).ready).toBe(true);
    expect(project.recordedCostPaise).toBe(0);
  });

  it("retains known approved commitments when combined amounts need reconciliation", () => {
    const result = readProjectCommitmentBudget({ ...project, commitmentBudget: unresolved });
    expect(result).toMatchObject({ ready: false, budget: { approvedVendorNetPaise: 5_000, budgetUsedPaise: null } });
    expect(result.message).toContain("need reconciliation");
    expect(readProjectCommitmentBudget({ ...project, commitmentBudget: { ...unresolved,
      reasonCodes: ["invalid_order_source"], approvedVendorNetPaise: null } }).budget?.approvedVendorNetPaise).toBeNull();
  });

  it.each([
    undefined, null, {}, { ...ready, status: "unknown" }, { ...ready, reasonCodes: ["invalid_order_source"] },
    { ...ready, budgetUsedPaise: 0 }, { ...ready, availableBudgetPaise: 7_200 },
    { ...ready, approvedVendorNetPaise: 4_999 }, { ...ready, outstandingVendorCommitmentPaise: -1 },
    { ...ready, budgetUsedPaise: 5_000.5 }, { ...ready, budgetUsedPaise: Number.MAX_SAFE_INTEGER + 1 },
    { ...ready, approvedVendorNetPaise: Infinity }, { ...ready, utilizationBps: 0 },
    { ...ready, utilizationBps: NaN }, { ...ready, budgetStatus: undefined }, { ...ready, overBudget: true },
    { ...unresolved, reasonCodes: [] }, { ...unresolved, reasonCodes: ["unexpected"] },
    { ...unresolved, reasonCodes: ["invalid_order_source", "invalid_order_source"] },
    { ...unresolved, budgetUsedPaise: 0 }, { ...unresolved, utilizationBps: 0 }
  ])("does not expose an invented combined value for malformed or absent response %j", (value) => {
    const result = readProjectCommitmentBudget({ ...project, commitmentBudget: value } as unknown as ProjectFinanceBucket);
    expect(result.ready).toBe(false);
    expect(result.budget).toBeNull();
    expect(result.message).toBeTruthy();
  });

  it("checks utilization with the backend integer rounding even for extreme paise values", () => {
    const costBudgetPaise = 7_205_759_403_792_793;
    const usage = 9_007_199_254_740_990;
    const value = { ...ready, approvedVendorNetPaise: usage, outstandingVendorCommitmentPaise: usage,
      budgetUsedPaise: usage, availableBudgetPaise: costBudgetPaise - usage,
      utilizationBps: 12_500, budgetStatus: "over_budget" as const, overBudget: true };
    expect(readProjectCommitmentBudget({ ...project, costBudgetPaise, commitmentBudget: value }).ready).toBe(true);
    expect(readProjectCommitmentBudget({ ...project, costBudgetPaise: 1, commitmentBudget: {
      ...value, availableBudgetPaise: 1 - usage, utilizationBps: null } }).ready).toBe(true);
  });

  it("accepts zero budget with undefined utilization and explicit no-budget or overrun metadata", () => {
    expect(readProjectCommitmentBudget({ ...project, costBudgetPaise: 0, commitmentBudget: {
      ...ready, availableBudgetPaise: -5_000, utilizationBps: null, budgetStatus: "over_budget", overBudget: true } }).ready).toBe(true);
    expect(readProjectCommitmentBudget({ ...project, costBudgetPaise: 0, commitmentBudget: {
      ...ready, approvedVendorNetPaise: 0, outstandingVendorCommitmentPaise: 0, budgetUsedPaise: 0,
      availableBudgetPaise: 0, utilizationBps: null, budgetStatus: "no_budget" } }).ready).toBe(true);
  });
});

describe("portfolio commitment validation", () => {
  const summary: ProjectFinancePortfolioSummary = { ...portfolioSummary, projectCount: 2,
    recordedCostPaise: 3_000, costBudgetPaise: 10_400,
    commitmentBudget: { status: "ready", reasonCodes: [], approvedVendorNetPaise: 7_100,
      outstandingVendorCommitmentPaise: 4_100, budgetUsedPaise: 7_100, availableBudgetPaise: 3_300,
      unresolvedProjectCount: 0, overBudgetProjectCount: 1 } };

  it("validates matching-cohort totals independently of loaded rows", () => {
    expect(readPortfolioCommitmentBudget(summary).ready).toBe(true);
  });

  it("retains complete known commitment and recorded totals but withholds partial combined totals", () => {
    const result = readPortfolioCommitmentBudget({ ...summary, commitmentBudget: {
      ...unresolved, approvedVendorNetPaise: 7_100, unresolvedProjectCount: 1, overBudgetProjectCount: null } });
    expect(result).toMatchObject({ ready: false, budget: { approvedVendorNetPaise: 7_100, budgetUsedPaise: null } });
  });

  it.each([
    undefined, null, { ...summary.commitmentBudget, budgetUsedPaise: 3_000 },
    { ...summary.commitmentBudget, unresolvedProjectCount: 1 },
    { ...summary.commitmentBudget, overBudgetProjectCount: 3 },
    { ...unresolved, unresolvedProjectCount: 0, overBudgetProjectCount: null },
    { ...unresolved, unresolvedProjectCount: 3, overBudgetProjectCount: null },
    { ...unresolved, unresolvedProjectCount: 1, overBudgetProjectCount: 0 }
  ])("rejects absent or inconsistent portfolio projections %j", value => {
    const result = readPortfolioCommitmentBudget({ ...summary, commitmentBudget: value } as unknown as ProjectFinancePortfolioSummary);
    expect(result.ready).toBe(false);
    expect(result.budget).toBeNull();
  });

  it("accepts a genuinely empty matching cohort", () => {
    expect(readPortfolioCommitmentBudget({ ...summary, projectCount: 0, costBudgetPaise: 0, recordedCostPaise: 0,
      commitmentBudget: { status: "ready", reasonCodes: [], approvedVendorNetPaise: 0, outstandingVendorCommitmentPaise: 0,
        budgetUsedPaise: 0, availableBudgetPaise: 0, unresolvedProjectCount: 0, overBudgetProjectCount: 0 } }).ready).toBe(true);
  });
});
