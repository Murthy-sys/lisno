import { describe, expect, it } from "vitest";
import {
  portfolioFinanceCommitmentBudget,
  projectFinanceCommitmentBudget,
  type FinanceCommitmentSources
} from "../src/domain/project-finance-commitments.js";

function approval(id = "order-one", netPaise = 5_000, gstPaise = 2_500) {
  const source = { projectId: "project-one", vendorId: `vendor-${id}`, tenderAwardId: `award-${id}` };
  const revision = { ...source, _id: `revision-${id}`, orderId: id, revision: 1, estimateId: "original-estimate", estimateVersion: 1,
    netPaise, gstPaise, totalPaise: netPaise + gstPaise,
    lines: [{ id: `line-${id}`, netPaise, gstPaise, totalPaise: netPaise + gstPaise }] };
  const order = { ...source, _id: id, status: "approved", cancelledAt: null, approvedRevisionId: revision._id, approvedRevision: 1,
    approvedNetPaise: netPaise, approvedGstPaise: gstPaise, approvedTotalPaise: netPaise + gstPaise };
  return { order, revision };
}
function expense(amountPaise = 2_000, overrides: Record<string, unknown> = {}) {
  return { _id: "expense-one", projectId: "project-one", status: "posted", type: "direct_spend", expenseClass: "procurement",
    purchaseOrderId: "order-one", paymentMilestoneId: "milestone-one", amountPaise, ...overrides };
}
function calculate(overrides: Partial<FinanceCommitmentSources & { costBudgetPaise: number; recordedCostPaise: number; projectCompleted: boolean }> = {}) {
  const { order, revision } = approval();
  return projectFinanceCommitmentBudget({ projectId: "project-one", projectCompleted: false, costBudgetPaise: 7_200, recordedCostPaise: 0,
    orders: [order], revisions: [revision], entries: [], ...overrides });
}

describe("vendor commitment budget projection", () => {
  it("uses approved net, excludes GST, and retains the original cost allocation", () => {
    expect(calculate()).toEqual({ status: "ready", reasonCodes: [], approvedVendorNetPaise: 5_000,
      outstandingVendorCommitmentPaise: 5_000, budgetUsedPaise: 5_000, availableBudgetPaise: 2_200,
      utilizationBps: 6_944, budgetStatus: "within_budget", overBudget: false });
  });

  it("keeps recorded-only history when no approved order exists", () => {
    expect(calculate({ orders: [], revisions: [], recordedCostPaise: 1_337,
      entries: [expense(1_337, { purchaseOrderId: null, paymentMilestoneId: null })] })).toMatchObject({
      status: "ready", approvedVendorNetPaise: 0, outstandingVendorCommitmentPaise: 0,
      budgetUsedPaise: 1_337, availableBudgetPaise: 5_863 });
    expect(calculate({ orders: [], revisions: [] })).toMatchObject({ status: "ready", budgetUsedPaise: 0, availableBudgetPaise: 7_200 });
  });

  it.each([0, 2_000, 5_000, 7_500])("offsets only posted procurement linked to that order: %i", amount => {
    const result = calculate({ recordedCostPaise: amount, entries: amount ? [expense(amount)] : [] });
    expect(result).toMatchObject({ status: "ready", approvedVendorNetPaise: 5_000,
      outstandingVendorCommitmentPaise: Math.max(5_000 - amount, 0), budgetUsedPaise: Math.max(5_000, amount) });
  });

  it("does not use an overpayment on one order to discharge another order", () => {
    const first = approval();
    const second = approval("order-two", 2_000, 360);
    expect(calculate({ orders: [first.order, second.order], revisions: [first.revision, second.revision],
      entries: [expense(6_500)], recordedCostPaise: 6_500 })).toMatchObject({ status: "ready", approvedVendorNetPaise: 7_000,
      outstandingVendorCommitmentPaise: 2_000, budgetUsedPaise: 8_500, availableBudgetPaise: -1_300, overBudget: true, budgetStatus: "over_budget" });
  });

  it("includes payroll, other costs and overheads once, without offsetting vendor commitments", () => {
    expect(calculate({ recordedCostPaise: 1_250 })).toMatchObject({ outstandingVendorCommitmentPaise: 5_000,
      budgetUsedPaise: 6_250, availableBudgetPaise: 950 });
  });

  it("ignores voided expenses and pending quotes", () => {
    const pending = { _id: "pending-order", projectId: "project-one", status: "pending_approval", draftNetPaise: 80_000 };
    const approved = approval();
    expect(calculate({ orders: [pending, approved.order], entries: [expense(3_000, { status: "voided" })] }))
      .toEqual(calculate());
  });

  it.each(["draft", "pending_approval", "changes_requested", "rejected", "ready_to_issue"])("retains the old approval during a %s amendment", status => {
    const approved = approval();
    expect(calculate({ orders: [{ ...approved.order, status, draftNetPaise: 90_000, estimateId: "new-estimate", estimateVersion: 8,
      submittedRevisionId: "pending-revision", amendmentOfRevision: 1 }] })).toEqual(calculate());
  });

  it("uses a newly approved replacement revision once", () => {
    const approved = approval();
    const replacement = approval("order-one", 6_000, 1_080);
    const revision = { ...replacement.revision, _id: "revision-two", revision: 2 };
    expect(calculate({ orders: [{ ...replacement.order, approvedRevision: 2, approvedRevisionId: revision._id }],
      revisions: [approved.revision, revision] })).toMatchObject({ status: "ready", approvedVendorNetPaise: 6_000, budgetUsedPaise: 6_000 });
  });

  it.each([{ status: "cancelled" }, { cancelledAt: new Date() }])("excludes a cancelled commitment, preserving its recorded spend: %j", cancellation => {
    const approved = approval();
    expect(calculate({ orders: [{ ...approved.order, ...cancellation }], entries: [expense()], recordedCostPaise: 2_000 }))
      .toMatchObject({ status: "ready", approvedVendorNetPaise: 0, outstandingVendorCommitmentPaise: 0, budgetUsedPaise: 2_000 });
  });

  it("counts one order once even when its source is repeated", () => {
    const approved = approval();
    expect(calculate({ orders: [approved.order, { ...approved.order }], revisions: [approved.revision, approved.revision] }))
      .toEqual(calculate());
  });

  it("flags duplicate award obligations or conflicting copies instead of double counting", () => {
    const first = approval();
    const second = approval("order-two", 2_000, 360);
    const duplicatedAward = { ...second.order, tenderAwardId: first.order.tenderAwardId };
    const duplicatedRevision = { ...second.revision, tenderAwardId: first.order.tenderAwardId };
    expect(calculate({ orders: [first.order, duplicatedAward], revisions: [first.revision, duplicatedRevision] }))
      .toMatchObject({ status: "needs_reconciliation", reasonCodes: ["invalid_order_source"], approvedVendorNetPaise: null, budgetUsedPaise: null });
    expect(calculate({ orders: [first.order, { ...first.order, approvedNetPaise: 9_000 }] }).status).toBe("needs_reconciliation");
  });

  it.each([
    ["missing revision", {}], ["foreign project", { projectId: "another-project" }], ["wrong order", { orderId: "another-order" }],
    ["wrong vendor", { vendorId: "another-vendor" }], ["wrong revision", { revision: 2 }], ["wrong award", { tenderAwardId: "another-award" }],
    ["missing source", { estimateId: "" }], ["bad source version", { estimateVersion: 0 }],
    ["totals mismatch", { netPaise: 5_001 }], ["no lines", { lines: [] }],
    ["bad lines", { lines: [{ id: "line-one", netPaise: 5_001, gstPaise: 2_499, totalPaise: 7_500 }] }]
  ])("rejects an invalid immutable source: %s", (_name, delta) => {
    const approved = approval();
    const revisions = Object.keys(delta).length === 0 ? [] : [{ ...approved.revision, ...delta }];
    expect(calculate({ revisions })).toMatchObject({ status: "needs_reconciliation", reasonCodes: ["invalid_order_source"],
      approvedVendorNetPaise: null, outstandingVendorCommitmentPaise: null, budgetUsedPaise: null, availableBudgetPaise: null,
      utilizationBps: null, budgetStatus: null, overBudget: null });
  });

  it.each([-1, 5_000.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects malformed approved paise: %s", amount => {
    const approved = approval();
    expect(calculate({ orders: [{ ...approved.order, approvedNetPaise: amount }] })).toMatchObject({
      status: "needs_reconciliation", reasonCodes: ["invalid_order_source"], approvedVendorNetPaise: null });
  });

  it("detects duplicate immutable line identities", () => {
    const approved = approval();
    expect(calculate({ revisions: [{ ...approved.revision, lines: [approved.revision.lines[0], { id: approved.revision.lines[0].id,
      netPaise: 0, gstPaise: 0, totalPaise: 0 }] }] }).status).toBe("needs_reconciliation");
  });

  it("fails closed for unlinked procurement without claiming zero usage", () => {
    expect(calculate({ recordedCostPaise: 2_000, entries: [expense(2_000, { purchaseOrderId: null, paymentMilestoneId: null })] }))
      .toMatchObject({ status: "needs_reconciliation", reasonCodes: ["unlinked_procurement_expense"], approvedVendorNetPaise: 5_000,
        budgetUsedPaise: null, availableBudgetPaise: null, utilizationBps: null, overBudget: null });
  });

  it.each([
    { purchaseOrderId: "missing-order" }, { purchaseOrderId: "" }, { paymentMilestoneId: null }, { projectId: "foreign-project" },
    { amountPaise: -1 }, { amountPaise: 1.5 }, { amountPaise: 0 }, { amountPaise: Number.MAX_SAFE_INTEGER + 1 }
  ])("rejects broken explicit expense linkage: %j", delta => {
    expect(calculate({ recordedCostPaise: 2_000, entries: [expense(2_000, delta)] })).toMatchObject({
      status: "needs_reconciliation", reasonCodes: ["invalid_expense_linkage"], budgetUsedPaise: null });
  });

  it("rejects an expense linked to an unapproved or foreign order", () => {
    const pending = { _id: "order-one", projectId: "project-one", status: "pending_approval" };
    expect(calculate({ orders: [pending], recordedCostPaise: 2_000, entries: [expense()] }))
      .toMatchObject({ status: "needs_reconciliation", reasonCodes: ["invalid_expense_linkage"] });
    const approved = approval();
    expect(calculate({ orders: [{ ...approved.order, projectId: "foreign-project" }], recordedCostPaise: 2_000, entries: [expense()] }).status)
      .toBe("needs_reconciliation");
  });

  it("checks duplicate ledger IDs and linked costs against recorded counters", () => {
    expect(calculate({ recordedCostPaise: 4_000, entries: [expense(), expense()] })).toMatchObject({ status: "needs_reconciliation",
      reasonCodes: ["invalid_expense_linkage"] });
    expect(calculate({ recordedCostPaise: 1_999, entries: [expense()] })).toMatchObject({ status: "needs_reconciliation",
      reasonCodes: ["invalid_expense_linkage"] });
  });

  it("never emits unsafe summed money", () => {
    const first = approval("order-one", Number.MAX_SAFE_INTEGER, 0);
    const second = approval("order-two", 1, 0);
    expect(calculate({ orders: [first.order, second.order], revisions: [first.revision, second.revision] }))
      .toMatchObject({ status: "needs_reconciliation", approvedVendorNetPaise: null, budgetUsedPaise: null });
    expect(calculate({ recordedCostPaise: Number.MAX_SAFE_INTEGER })).toMatchObject({ status: "needs_reconciliation", budgetUsedPaise: null });
    expect(() => calculate({ costBudgetPaise: 1.1 })).toThrow("safe nonnegative paise");
  });

  it("preserves existing completed-project risk behavior and independent overspend flag", () => {
    expect(calculate({ costBudgetPaise: 5_500 })).toMatchObject({ budgetStatus: "at_risk" });
    expect(calculate({ costBudgetPaise: 5_500, projectCompleted: true })).toMatchObject({ budgetStatus: "within_budget" });
    expect(calculate({ costBudgetPaise: 4_000, projectCompleted: true })).toMatchObject({ budgetStatus: "over_budget", overBudget: true });
    expect(calculate({ costBudgetPaise: 0 })).toMatchObject({ utilizationBps: null, overBudget: true, budgetStatus: "over_budget" });
    expect(calculate({ costBudgetPaise: 0, orders: [], revisions: [] })).toMatchObject({ utilizationBps: null, budgetStatus: "no_budget", overBudget: false });
  });

  it("rounds paise and utilization exactly without whole-rupee conversion", () => {
    const approved = approval("order-one", 5_001, 901);
    expect(calculate({ orders: [approved.order], revisions: [approved.revision], costBudgetPaise: 8_000 }))
      .toMatchObject({ approvedVendorNetPaise: 5_001, availableBudgetPaise: 2_999, utilizationBps: 6_251 });
  });
});

describe("commitment portfolio aggregation", () => {
  it("sums two unequal projects without offsetting commitments between them", () => {
    const one = calculate();
    const two = calculate({ costBudgetPaise: 3_000, recordedCostPaise: 6_000, entries: [expense(6_000)] });
    expect(portfolioFinanceCommitmentBudget([one, two])).toEqual({ status: "ready", reasonCodes: [],
      approvedVendorNetPaise: 10_000, outstandingVendorCommitmentPaise: 5_000, budgetUsedPaise: 11_000,
      availableBudgetPaise: -800, unresolvedProjectCount: 0, overBudgetProjectCount: 1 });
  });

  it("does not publish a partial combined sum when one project is unresolved", () => {
    const unlinked = calculate({ recordedCostPaise: 2_000, entries: [expense(2_000, { purchaseOrderId: null, paymentMilestoneId: null })] });
    const missing = calculate({ revisions: [] });
    expect(portfolioFinanceCommitmentBudget([calculate(), unlinked, unlinked])).toEqual({ status: "needs_reconciliation",
      reasonCodes: ["unlinked_procurement_expense"], approvedVendorNetPaise: 15_000, outstandingVendorCommitmentPaise: null,
      budgetUsedPaise: null, availableBudgetPaise: null, unresolvedProjectCount: 2, overBudgetProjectCount: null });
    expect(portfolioFinanceCommitmentBudget([calculate(), missing])).toMatchObject({ approvedVendorNetPaise: null,
      reasonCodes: ["invalid_order_source"], unresolvedProjectCount: 1 });
  });

  it("returns a ready zero projection for an empty matching portfolio", () => {
    expect(portfolioFinanceCommitmentBudget([])).toEqual({ status: "ready", reasonCodes: [], approvedVendorNetPaise: 0,
      outstandingVendorCommitmentPaise: 0, budgetUsedPaise: 0, availableBudgetPaise: 0,
      unresolvedProjectCount: 0, overBudgetProjectCount: 0 });
  });
});
