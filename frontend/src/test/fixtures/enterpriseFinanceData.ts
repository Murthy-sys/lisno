// Synthetic records reused from features/finance/FinancePages.test.tsx. No runtime test imports.
import type {
  FinanceLedgerEntry,
  ProjectFinanceBucket,
  ProjectFinancePortfolioSummary
} from "../../api/types";

export const baseBucket: ProjectFinanceBucket = {
  id: "finance-bucket-project-one",
  projectId: "project-one",
  projectName: "Aurora Villa",
  projectStatus: "active",
  clientId: "finance-client-one",
  clientName: "Aurora Homes",
  budgetApprovedAt: "2026-08-20T09:00:00.000Z",
  budgetStatus: "within_budget",
  budgetUtilizationBps: 5_000,
  estimateId: "estimate-one",
  estimateVersion: 4,
  estimateReviewRoundId: "estimate-round-one",
  designPlanVersion: 2,
  currency: "INR",
  approvedSubtotalPaise: 100_000_000,
  approvedGstPaise: 18_000_000,
  approvedContractTotalPaise: 118_000_000,
  targetMarginBps: 2_000,
  targetProfitPaise: 20_000_000,
  costBudgetPaise: 80_000_000,
  procurementCostPaise: 20_000_000,
  employeePaymentPaise: 10_000_000,
  otherExpensePaise: 5_000_000,
  directSpendPaise: 35_000_000,
  overheadPaise: 5_000_000,
  recordedCostPaise: 40_000_000,
  remainingBudgetPaise: 40_000_000,
  currentProfitPaise: 60_000_000,
  currentMarginBps: 6_000,
  overBudget: false,
  deadlineAt: "2026-09-15T00:00:00.000Z",
  overdueDays: 0,
  deadlineStatus: "on_track",
  overdueTaskCount: 0,
  status: "open",
  version: 3,
  openedAt: "2026-08-24T09:00:00.000Z",
  closedAt: null,
  createdAt: "2026-08-20T09:00:00.000Z",
  updatedAt: "2026-08-26T09:00:00.000Z"
};

export const overBudgetBucket: ProjectFinanceBucket = {
  ...baseBucket,
  id: "finance-bucket-project-two",
  projectId: "project/two",
  projectName: "Lake House",
  clientId: "finance-client-two",
  clientName: "Lake Developments",
  budgetApprovedAt: "2026-07-15T09:00:00.000Z",
  budgetStatus: "over_budget",
  budgetUtilizationBps: 11_250,
  estimateId: "estimate-two",
  estimateReviewRoundId: "estimate-round-two",
  designPlanVersion: 1,
  approvedSubtotalPaise: 50_000_000,
  approvedGstPaise: 9_000_000,
  approvedContractTotalPaise: 59_000_000,
  targetProfitPaise: 10_000_000,
  costBudgetPaise: 40_000_000,
  procurementCostPaise: 30_000_000,
  employeePaymentPaise: 10_000_000,
  otherExpensePaise: 2_000_000,
  directSpendPaise: 42_000_000,
  overheadPaise: 3_000_000,
  recordedCostPaise: 45_000_000,
  remainingBudgetPaise: -5_000_000,
  currentProfitPaise: 5_000_000,
  currentMarginBps: 1_000,
  overBudget: true,
  deadlineAt: "2026-08-14T00:00:00.000Z",
  overdueDays: 12,
  deadlineStatus: "overdue",
  overdueTaskCount: 3
};

export const unknownCompletionBucket: ProjectFinanceBucket = {
  ...baseBucket,
  id: "finance-bucket-project-three",
  projectId: "project-three",
  projectName: "Cedar Apartment",
  clientId: null,
  clientName: "Cedar Homes",
  projectStatus: "completed",
  deadlineStatus: "completed_date_unknown",
  status: "closed"
};

export const lateCompletionBucket: ProjectFinanceBucket = {
  ...baseBucket,
  id: "finance-bucket-project-four",
  projectId: "project-four",
  projectName: "Maple Office",
  clientId: "finance-client-three",
  clientName: "Aurora Homes",
  projectStatus: "completed",
  deadlineStatus: "completed_late",
  status: "closed"
};

export const portfolioSummary: ProjectFinancePortfolioSummary = {
  projectCount: 4,
  approvedContractTotalPaise: 413_000_000,
  approvedGstPaise: 63_000_000,
  approvedSubtotalPaise: 350_000_000,
  targetProfitPaise: 70_000_000,
  costBudgetPaise: 280_000_000,
  procurementCostPaise: 90_000_000,
  employeePaymentPaise: 40_000_000,
  otherExpensePaise: 17_000_000,
  directSpendPaise: 147_000_000,
  overheadPaise: 18_000_000,
  recordedCostPaise: 165_000_000,
  remainingBudgetPaise: 115_000_000,
  currentProfitPaise: 185_000_000,
  currentMarginBps: 5_286,
  overBudgetProjectCount: 1,
  overdueProjectCount: 1,
  lateCompletedProjectCount: 1,
  overdueTaskCount: 3
};

export function projectBudgetFixtures(large = false): ProjectFinanceBucket[] {
  const rows = [baseBucket, overBudgetBucket, unknownCompletionBucket, lateCompletionBucket];
  if (!large) return rows;
  const names = ["Garden Residence", "Oak Pavilion", "Hillcrest Villa", "River View", "Palm Court", "Urban Nest", "Serene Homes", "Meadow House"];
  return [...rows, ...names.map((name, index) => ({
    ...rows[index % rows.length], id: `finance-bucket-extra-${index}`, projectId: `finance-extra-${index}`,
    projectName: name, estimateId: `finance-estimate-extra-${index}`
  }))];
}

/** Synthetic server filtering keeps browser summaries consistent with the visible cohort. */
export function projectBudgetFixturePage(params: URLSearchParams, large = false, empty = false) {
  const all = empty ? [] : projectBudgetFixtures(large);
  const rows = all.filter((row) =>
    (!params.get("search") || row.projectName.toLowerCase().includes(params.get("search")!.toLowerCase())) &&
    (!params.get("projectId") || row.projectId === params.get("projectId")) &&
    (!params.get("clientId") || row.clientId === params.get("clientId")) &&
    (params.get("unlinkedClient") !== "true" || row.clientId === null) &&
    (!params.get("budgetStatus") || row.budgetStatus === params.get("budgetStatus")) &&
    (!params.get("financeStage") || row.status === params.get("financeStage")) &&
    (!params.get("projectStatus") || row.projectStatus === params.get("projectStatus")) &&
    (!params.get("approvedFrom") || row.budgetApprovedAt!.slice(0, 10) >= params.get("approvedFrom")!) &&
    (!params.get("approvedTo") || row.budgetApprovedAt!.slice(0, 10) <= params.get("approvedTo")!)
  );
  const summary = { ...portfolioSummary, projectCount: rows.length };
  for (const key of ["approvedContractTotalPaise", "approvedGstPaise", "approvedSubtotalPaise", "targetProfitPaise", "costBudgetPaise", "procurementCostPaise", "employeePaymentPaise", "otherExpensePaise", "directSpendPaise", "overheadPaise", "recordedCostPaise", "remainingBudgetPaise", "currentProfitPaise", "overdueTaskCount"] as const) {
    summary[key] = rows.reduce((total, row) => total + row[key], 0);
  }
  summary.currentMarginBps = summary.approvedSubtotalPaise > 0 ? Math.round(summary.currentProfitPaise * 10_000 / summary.approvedSubtotalPaise) : null;
  summary.overBudgetProjectCount = rows.filter((row) => row.overBudget).length;
  summary.overdueProjectCount = rows.filter((row) => row.deadlineStatus === "overdue").length;
  summary.lateCompletedProjectCount = rows.filter((row) => row.deadlineStatus === "completed_late").length;
  const limit = Number(params.get("limit") ?? 10), offset = Number(params.get("offset") ?? 0);
  return {
    items: rows.slice(offset, offset + limit), summary,
    pagination: { limit, offset, total: rows.length, hasMore: offset + limit < rows.length },
    filterOptions: {
      projects: all.map((row) => ({ id: row.projectId, name: row.projectName })),
      clients: [...new Map(all.filter((row) => row.clientId).map((row) => [row.clientId!, { id: row.clientId!, name: row.clientName! }])).values()],
      hasUnlinkedClients: all.some((row) => row.clientId === null)
    },
    observedAt: "2026-10-24T08:00:00.000Z"
  };
}

export function financeEntry(
  id: string,
  overrides: Partial<FinanceLedgerEntry> = {}
): FinanceLedgerEntry {
  return {
    id,
    bucketId: baseBucket.id,
    projectId: baseBucket.projectId,
    type: "direct_spend",
    expenseClass: "other",
    category: `Ledger item ${id}`,
    amountPaise: 1_000,
    incurredAt: "2026-08-25T00:00:00.000Z",
    description: `Recorded cost ${id}`,
    vendor: null,
    reference: null,
    sourceSectionId: null,
    sourceLineItemKey: null,
    sourceSectionLabel: null,
    sourceLineItemLabel: null,
    supportingDocument: null,
    idempotencyKey: `idempotency-${id}`,
    status: "posted",
    version: 1,
    createdById: "finance-manager-one",
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    createdAt: "2026-08-26T09:00:00.000Z",
    updatedAt: "2026-08-26T09:00:00.000Z",
    ...overrides
  };
}
