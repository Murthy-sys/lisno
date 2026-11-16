import type {
  FinanceCommitmentAmounts, PortfolioFinanceCommitmentBudget,
  ProjectFinanceBucket, ProjectFinanceCommitmentBudget, ProjectFinancePortfolioSummary
} from "../../api/types";

const reasons = new Set(["unlinked_procurement_expense", "invalid_order_source", "invalid_expense_linkage"]);
const statuses = new Set(["over_budget", "at_risk", "within_budget", "no_budget"]);
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const signed = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const unavailable = "Approved vendor commitments are unavailable. Recorded expenses remain available.";
const invalid = "Vendor commitments do not reconcile with this budget. Refresh financial details.";
const unresolved = "Vendor commitments need reconciliation before budget usage and the available balance can be shown. Recorded expenses remain available.";

interface BudgetSource { costBudgetPaise: number; recordedCostPaise: number }
interface BudgetRead<T> { budget: T | null; ready: boolean; message: string | null }

function validAmounts(value: FinanceCommitmentAmounts, source: BudgetSource): boolean {
  if (!nonnegative(source.costBudgetPaise) || !nonnegative(source.recordedCostPaise) ||
    !value || typeof value !== "object" || !Array.isArray(value.reasonCodes) ||
    value.reasonCodes.some(reason => !reasons.has(reason)) || new Set(value.reasonCodes).size !== value.reasonCodes.length) return false;
  if (value.status === "needs_reconciliation") return value.reasonCodes.length > 0 &&
    (value.approvedVendorNetPaise === null || nonnegative(value.approvedVendorNetPaise)) &&
    value.outstandingVendorCommitmentPaise === null && value.budgetUsedPaise === null && value.availableBudgetPaise === null;
  return value.status === "ready" && value.reasonCodes.length === 0 &&
    nonnegative(value.approvedVendorNetPaise) && nonnegative(value.outstandingVendorCommitmentPaise) &&
    value.outstandingVendorCommitmentPaise <= value.approvedVendorNetPaise && nonnegative(value.budgetUsedPaise) &&
    signed(value.availableBudgetPaise) && nonnegative(source.costBudgetPaise) && nonnegative(source.recordedCostPaise) &&
    BigInt(source.recordedCostPaise) + BigInt(value.outstandingVendorCommitmentPaise) === BigInt(value.budgetUsedPaise) &&
    BigInt(source.costBudgetPaise) - BigInt(value.budgetUsedPaise) === BigInt(value.availableBudgetPaise);
}

/** Validate the additional read model without replacing the recorded-cost integrity checks. */
export function readProjectCommitmentBudget(source: ProjectFinanceBucket): BudgetRead<ProjectFinanceCommitmentBudget> {
  const value = source.commitmentBudget;
  if (value === undefined) return { budget: null, ready: false, message: unavailable };
  if (!validAmounts(value, source)) return { budget: null, ready: false, message: invalid };
  if (value.status === "needs_reconciliation") return value.utilizationBps === null && value.budgetStatus === null && value.overBudget === null
    ? { budget: value, ready: false, message: unresolved } : { budget: null, ready: false, message: invalid };
  const usage = value.budgetUsedPaise!;
  const cost = BigInt(source.costBudgetPaise);
  const ratio = cost === 0n ? null : (BigInt(usage) * 10_000n + cost / 2n) / cost;
  const expectedUtilization = ratio === null || ratio > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(ratio);
  const utilizationValid = value.utilizationBps === expectedUtilization;
  if (!utilizationValid || !statuses.has(value.budgetStatus ?? "") || value.overBudget !== (value.availableBudgetPaise! < 0)) {
    return { budget: null, ready: false, message: invalid };
  }
  return { budget: value, ready: true, message: null };
}

export function readPortfolioCommitmentBudget(source: ProjectFinancePortfolioSummary): BudgetRead<PortfolioFinanceCommitmentBudget> {
  const value = source.commitmentBudget;
  if (value === undefined) return { budget: null, ready: false, message: unavailable };
  if (!validAmounts(value, source) || !nonnegative(source.projectCount) || !nonnegative(value.unresolvedProjectCount) ||
    value.unresolvedProjectCount > source.projectCount) return { budget: null, ready: false, message: invalid };
  if (value.status === "needs_reconciliation") return value.unresolvedProjectCount > 0 && value.overBudgetProjectCount === null
    ? { budget: value, ready: false, message: unresolved } : { budget: null, ready: false, message: invalid };
  if (value.unresolvedProjectCount !== 0 || !nonnegative(value.overBudgetProjectCount) || value.overBudgetProjectCount > source.projectCount) {
    return { budget: null, ready: false, message: invalid };
  }
  return { budget: value, ready: true, message: null };
}
