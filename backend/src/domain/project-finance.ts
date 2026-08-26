export const PROJECT_FINANCE_CURRENCY = "INR" as const;

export const PROJECT_FINANCE_TARGET_MARGIN_BPS = 2_000 as const;
export const FINANCE_BASIS_POINTS = 10_000 as const;

/*
 * The approved Estimate currently stores whole rupees. New finance records use
 * paise so later invoice and expense integrations do not have to round away
 * fractional rupees. The cap keeps every stored and derived amount inside the
 * JavaScript safe-integer range.
 */
export const MAX_FINANCE_AMOUNT_PAISE = 9_000_000_000_000 as const;

export const PROJECT_FINANCE_BUCKET_STATUSES = [
  "pending_design",
  "open",
  "closed"
] as const;

export type ProjectFinanceBucketStatus =
  (typeof PROJECT_FINANCE_BUCKET_STATUSES)[number];

export const FINANCE_LEDGER_ENTRY_TYPES = [
  "direct_spend",
  "overhead"
] as const;

export type FinanceLedgerEntryType =
  (typeof FINANCE_LEDGER_ENTRY_TYPES)[number];

/**
 * Direct costs need a stable machine-readable classification for portfolio
 * reporting. `category` remains the human description; it must never be
 * parsed heuristically to decide whether money is Procurement or payroll.
 */
export const FINANCE_EXPENSE_CLASSES = [
  "procurement",
  "employee_payment",
  "other"
] as const;

export type FinanceExpenseClass =
  (typeof FINANCE_EXPENSE_CLASSES)[number];

export const PROJECT_DEADLINE_STATUSES = [
  "on_track",
  "overdue",
  "completed_on_time",
  "completed_late",
  "completed_date_unknown"
] as const;

export type ProjectDeadlineStatus =
  (typeof PROJECT_DEADLINE_STATUSES)[number];

export const FINANCE_LEDGER_ENTRY_STATUSES = ["posted", "voided"] as const;

export type FinanceLedgerEntryStatus =
  (typeof FINANCE_LEDGER_ENTRY_STATUSES)[number];

export interface ApprovedEstimateMoney {
  subtotalRupees: number;
  gstRupees: number;
  totalRupees: number;
}

export interface ProjectFinanceBaseline {
  approvedSubtotalPaise: number;
  approvedGstPaise: number;
  approvedContractTotalPaise: number;
  targetMarginBps: typeof PROJECT_FINANCE_TARGET_MARGIN_BPS;
  targetProfitPaise: number;
  costBudgetPaise: number;
}

export interface ProjectFinancePosition {
  directSpendPaise: number;
  overheadPaise: number;
  recordedCostPaise: number;
  remainingBudgetPaise: number;
  currentProfitPaise: number;
  currentMarginBps: number | null;
  overBudget: boolean;
}

export function rupeesToPaise(rupees: number): number {
  if (!Number.isSafeInteger(rupees) || rupees < 0) {
    throw new TypeError("Approved Estimate money must be a non-negative whole-rupee amount.");
  }
  const paise = rupees * 100;
  assertFinanceAmount(paise, "Approved Estimate money");
  return paise;
}

/**
 * Creates the immutable finance baseline from the Client-approved Estimate.
 * Profit is a true 20% margin on pre-GST revenue; GST is never treated as
 * project revenue or as part of the spendable cost budget.
 */
export function projectFinanceBaseline(
  approved: ApprovedEstimateMoney
): ProjectFinanceBaseline {
  const approvedSubtotalPaise = rupeesToPaise(approved.subtotalRupees);
  const approvedGstPaise = rupeesToPaise(approved.gstRupees);
  const approvedContractTotalPaise = rupeesToPaise(approved.totalRupees);
  if (
    approvedSubtotalPaise + approvedGstPaise !==
    approvedContractTotalPaise
  ) {
    throw new TypeError("Approved Estimate subtotal and GST must equal its total.");
  }
  const targetProfitPaise = multiplyByBasisPoints(
    approvedSubtotalPaise,
    PROJECT_FINANCE_TARGET_MARGIN_BPS
  );
  return {
    approvedSubtotalPaise,
    approvedGstPaise,
    approvedContractTotalPaise,
    targetMarginBps: PROJECT_FINANCE_TARGET_MARGIN_BPS,
    targetProfitPaise,
    costBudgetPaise: approvedSubtotalPaise - targetProfitPaise
  };
}

export function projectFinancePosition(input: {
  approvedSubtotalPaise: number;
  costBudgetPaise: number;
  directSpendPaise: number;
  overheadPaise: number;
}): ProjectFinancePosition {
  assertFinanceAmount(input.approvedSubtotalPaise, "Approved subtotal");
  assertFinanceAmount(input.costBudgetPaise, "Cost budget");
  assertFinanceAmount(input.directSpendPaise, "Direct spending");
  assertFinanceAmount(input.overheadPaise, "Overheads");
  const recordedCostPaise = safeAddFinanceAmounts(
    input.directSpendPaise,
    input.overheadPaise,
    "Recorded project cost"
  );
  const remainingBudgetPaise = input.costBudgetPaise - recordedCostPaise;
  const currentProfitPaise = input.approvedSubtotalPaise - recordedCostPaise;
  return {
    directSpendPaise: input.directSpendPaise,
    overheadPaise: input.overheadPaise,
    recordedCostPaise,
    remainingBudgetPaise,
    currentProfitPaise,
    currentMarginBps: input.approvedSubtotalPaise === 0
      ? null
      : signedRatioInBasisPoints(
          currentProfitPaise,
          input.approvedSubtotalPaise
        ),
    overBudget: remainingBudgetPaise < 0
  };
}

export function assertFinanceAmount(value: number, label: string): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_FINANCE_AMOUNT_PAISE
  ) {
    throw new TypeError(
      `${label} must be a non-negative safe integer no greater than ${MAX_FINANCE_AMOUNT_PAISE} paise.`
    );
  }
}

export function safeAddFinanceAmounts(
  left: number,
  right: number,
  label: string
): number {
  assertFinanceAmount(left, label);
  assertFinanceAmount(right, label);
  const total = left + right;
  assertFinanceAmount(total, label);
  return total;
}

function multiplyByBasisPoints(value: number, basisPoints: number): number {
  assertFinanceAmount(value, "Finance amount");
  if (
    !Number.isSafeInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > FINANCE_BASIS_POINTS
  ) {
    throw new TypeError("Margin basis points are invalid.");
  }
  const rounded = (
    BigInt(value) * BigInt(basisPoints) +
    BigInt(FINANCE_BASIS_POINTS / 2)
  ) / BigInt(FINANCE_BASIS_POINTS);
  const result = Number(rounded);
  assertFinanceAmount(result, "Derived finance amount");
  return result;
}

function signedRatioInBasisPoints(numerator: number, denominator: number): number {
  const negative = numerator < 0;
  const absoluteNumerator = BigInt(Math.abs(numerator));
  const rounded = (
    absoluteNumerator * BigInt(FINANCE_BASIS_POINTS) +
    BigInt(Math.floor(denominator / 2))
  ) / BigInt(denominator);
  const result = Number(negative ? -rounded : rounded);
  if (!Number.isSafeInteger(result)) {
    throw new TypeError("Derived finance margin exceeds the supported range.");
  }
  return result;
}
