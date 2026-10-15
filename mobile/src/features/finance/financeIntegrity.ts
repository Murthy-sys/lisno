import type { ProjectFinanceBucket, ProjectFinancePortfolioSummary } from "./financeTypes";

export function financeArithmeticValid(value: ProjectFinancePortfolioSummary | ProjectFinanceBucket): boolean {
  const nonnegative = [value.approvedSubtotalPaise, value.approvedGstPaise, value.approvedContractTotalPaise, value.targetProfitPaise, value.costBudgetPaise, value.procurementCostPaise, value.employeePaymentPaise, value.otherExpensePaise, value.directSpendPaise, value.overheadPaise, value.recordedCostPaise];
  if (nonnegative.some(amount => !Number.isSafeInteger(amount) || amount < 0) || !Number.isSafeInteger(value.remainingBudgetPaise) || !Number.isSafeInteger(value.currentProfitPaise)) return false;
  return value.approvedSubtotalPaise + value.approvedGstPaise === value.approvedContractTotalPaise && value.targetProfitPaise + value.costBudgetPaise === value.approvedSubtotalPaise && value.procurementCostPaise + value.employeePaymentPaise + value.otherExpensePaise === value.directSpendPaise && value.directSpendPaise + value.overheadPaise === value.recordedCostPaise && value.costBudgetPaise - value.recordedCostPaise === value.remainingBudgetPaise && value.approvedSubtotalPaise - value.recordedCostPaise === value.currentProfitPaise;
}
export function financeBucketValid(value: ProjectFinanceBucket, projectId: string): boolean {
  if (typeof value.id !== "string" || !value.id || typeof projectId !== "string" || !projectId || value.projectId !== projectId || !value.estimateId || !Number.isSafeInteger(value.estimateVersion) || value.estimateVersion < 1 || value.currency !== "INR" || !financeArithmeticValid(value)) return false;
  const expectedTarget = Number((BigInt(value.approvedSubtotalPaise) * 2000n + 5000n) / 10000n);
  return value.targetMarginBps === 2000 && value.targetProfitPaise === expectedTarget && value.overBudget === (value.remainingBudgetPaise < 0);
}
