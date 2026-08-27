import { describe, expect, it } from "vitest";

import {
  MAX_FINANCE_AMOUNT_PAISE,
  PROJECT_FINANCE_TARGET_MARGIN_BPS,
  projectFinanceBaseline,
  projectFinancePosition,
  rupeesToPaise,
  safeAddFinanceAmounts
} from "../src/domain/project-finance.js";

describe("project finance baseline", () => {
  it("reserves a true 20% margin from pre-GST approved revenue", () => {
    expect(projectFinanceBaseline({
      subtotalRupees: 1_000_000,
      gstRupees: 180_000,
      totalRupees: 1_180_000
    })).toEqual({
      approvedSubtotalPaise: 100_000_000,
      approvedGstPaise: 18_000_000,
      approvedContractTotalPaise: 118_000_000,
      targetMarginBps: PROJECT_FINANCE_TARGET_MARGIN_BPS,
      targetProfitPaise: 20_000_000,
      costBudgetPaise: 80_000_000
    });
  });

  it("uses deterministic paise rounding without treating GST as profit", () => {
    const baseline = projectFinanceBaseline({
      subtotalRupees: 1,
      gstRupees: 0,
      totalRupees: 1
    });

    expect(baseline.targetProfitPaise).toBe(20);
    expect(baseline.costBudgetPaise).toBe(80);
    expect(baseline.approvedContractTotalPaise).toBe(100);
  });

  it("rejects non-whole source rupees, inconsistent totals, and unsafe values", () => {
    expect(() => rupeesToPaise(1.25)).toThrow(/whole-rupee/u);
    expect(() => projectFinanceBaseline({
      subtotalRupees: 100,
      gstRupees: 18,
      totalRupees: 119
    })).toThrow(/subtotal and GST/u);
    expect(() => rupeesToPaise(MAX_FINANCE_AMOUNT_PAISE)).toThrow(
      /no greater than/u
    );
  });
});

describe("project finance position", () => {
  it("lands on the fixed 20% target when the full 80% cost budget is used", () => {
    const baseline = projectFinanceBaseline({
      subtotalRupees: 236_190,
      gstRupees: 42_514,
      totalRupees: 278_704
    });

    expect(projectFinancePosition({
      approvedSubtotalPaise: baseline.approvedSubtotalPaise,
      costBudgetPaise: baseline.costBudgetPaise,
      directSpendPaise: 17_000_000,
      overheadPaise: 1_895_200
    })).toMatchObject({
      recordedCostPaise: 18_895_200,
      remainingBudgetPaise: 0,
      currentProfitPaise: 4_723_800,
      currentMarginBps: PROJECT_FINANCE_TARGET_MARGIN_BPS,
      overBudget: false
    });
  });

  it("combines direct spending and overheads into the remaining cost budget", () => {
    expect(projectFinancePosition({
      approvedSubtotalPaise: 100_000_000,
      costBudgetPaise: 80_000_000,
      directSpendPaise: 55_000_000,
      overheadPaise: 7_500_000
    })).toEqual({
      directSpendPaise: 55_000_000,
      overheadPaise: 7_500_000,
      recordedCostPaise: 62_500_000,
      remainingBudgetPaise: 17_500_000,
      currentProfitPaise: 37_500_000,
      currentMarginBps: 3_750,
      overBudget: false
    });
  });

  it("records overspend instead of rejecting it and reports a negative margin", () => {
    expect(projectFinancePosition({
      approvedSubtotalPaise: 100_000,
      costBudgetPaise: 80_000,
      directSpendPaise: 110_000,
      overheadPaise: 10_000
    })).toMatchObject({
      recordedCostPaise: 120_000,
      remainingBudgetPaise: -40_000,
      currentProfitPaise: -20_000,
      currentMarginBps: -2_000,
      overBudget: true
    });
  });

  it("uses null margin for a zero-value approved project", () => {
    expect(projectFinancePosition({
      approvedSubtotalPaise: 0,
      costBudgetPaise: 0,
      directSpendPaise: 0,
      overheadPaise: 0
    }).currentMarginBps).toBeNull();
  });

  it("prevents unsafe aggregate counters", () => {
    expect(() => safeAddFinanceAmounts(
      MAX_FINANCE_AMOUNT_PAISE,
      1,
      "Recorded cost"
    )).toThrow(/Recorded cost/u);
  });
});
