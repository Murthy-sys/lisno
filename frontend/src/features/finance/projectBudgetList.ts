import type { ProjectBudgetFilters, ProjectBudgetPage } from "./projectFinanceApi";

export const budgetStatusLabels = {
  over_budget: "Over budget",
  at_risk: "At risk",
  within_budget: "Within budget",
  no_budget: "No usable budget"
} as const;

export const financeStageLabels = {
  pending_design: "Awaiting design approval",
  open: "Finance active",
  closed: "Finance closed"
} as const;

export const projectStatusLabels = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed"
} as const;

export function projectBudgetFiltersFromSearch(search: URLSearchParams): ProjectBudgetFilters {
  const offset = Number(search.get("offset") ?? 0);
  const filters: ProjectBudgetFilters = { limit: 10, offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0 };
  for (const key of ["search", "projectId", "clientId", "approvedFrom", "approvedTo"] as const) {
    const value = search.get(key)?.trim();
    if (value) filters[key] = value;
  }
  if (search.get("unlinkedClient") === "true") {
    filters.unlinkedClient = true;
    delete filters.clientId;
  }
  const budgetStatus = search.get("budgetStatus");
  const financeStage = search.get("financeStage");
  const projectStatus = search.get("projectStatus");
  if (budgetStatus && Object.hasOwn(budgetStatusLabels, budgetStatus)) filters.budgetStatus = budgetStatus as ProjectBudgetFilters["budgetStatus"];
  if (financeStage && Object.hasOwn(financeStageLabels, financeStage)) filters.financeStage = financeStage as ProjectBudgetFilters["financeStage"];
  if (projectStatus && Object.hasOwn(projectStatusLabels, projectStatus)) filters.projectStatus = projectStatus as ProjectBudgetFilters["projectStatus"];
  return filters;
}

/** The export is explicitly a single fetched page, with server portfolio totals kept separate. */
export function projectBudgetPageCsv(page: ProjectBudgetPage, filters: ProjectBudgetFilters): string {
  const rupees = (paise: number) => (paise / 100).toFixed(2);
  const rows: Array<Array<string | number>> = [
    ["Project budgets: current-page export"],
    ["Amounts", "INR, exact rupees; project budgets exclude GST; spending includes overheads"],
    ["Date scope", "Budget approval cohort; amounts are current lifetime totals"],
    ["Observed at", page.observedAt],
    ["Search", filters.search ?? "All projects"],
    ["Project ID", filters.projectId ?? "All"],
    ["Client ID", filters.unlinkedClient ? "Unlinked clients" : filters.clientId ?? "All"],
    ["Budget status", filters.budgetStatus ? budgetStatusLabels[filters.budgetStatus] : "All"],
    ["Finance stage", filters.financeStage ? financeStageLabels[filters.financeStage] : "All"],
    ["Project lifecycle", filters.projectStatus ? projectStatusLabels[filters.projectStatus] : "All"],
    ["Budget approved from (UTC, inclusive)", filters.approvedFrom ?? "All dates"],
    ["Budget approved to (UTC, inclusive)", filters.approvedTo ?? "All dates"],
    ["Matching projects", page.pagination.total],
    ["Current page offset", page.pagination.offset],
    ["Current page rows", page.items.length],
    [],
    ["Matching portfolio summary", "INR"],
    ["Total project budget excluding GST", rupees(page.summary.approvedSubtotalPaise)],
    ["Total spending including overheads", rupees(page.summary.recordedCostPaise)],
    ["Total overheads (included in spending)", rupees(page.summary.overheadPaise)],
    ["Reserved margin (20%)", rupees(page.summary.targetProfitPaise)],
    ["Total usable budget", rupees(page.summary.costBudgetPaise)],
    ["Remaining usable budget", rupees(page.summary.remainingBudgetPaise)],
    [],
    ["Current-page project rows only"],
    ["Project ID", "Project", "Client ID", "Client", "Total budget excluding GST (INR)", "Spending including overheads (INR)", "Overheads (INR)", "Reserved margin (20%) (INR)", "Usable budget (INR)", "Remaining usable budget (INR)", "Usable budget utilization (%)", "Budget status", "Finance stage", "Budget approved at"]
  ];
  for (const bucket of page.items) rows.push([
    bucket.projectId, bucket.projectName, bucket.clientId ?? "", bucket.clientName ?? (bucket.clientId === null ? "Unlinked client" : "Name unavailable"),
    rupees(bucket.approvedSubtotalPaise), rupees(bucket.recordedCostPaise), rupees(bucket.overheadPaise), rupees(bucket.targetProfitPaise),
    rupees(bucket.costBudgetPaise), rupees(bucket.remainingBudgetPaise), bucket.budgetUtilizationBps == null ? "" : (bucket.budgetUtilizationBps / 100).toFixed(2),
    bucket.budgetStatus ? budgetStatusLabels[bucket.budgetStatus] : "Not available", financeStageLabels[bucket.status], bucket.budgetApprovedAt ?? ""
  ]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Quoting alone does not prevent spreadsheet formula evaluation.
  const safe = typeof value === "string" && /^[\s]*[=+@-]/u.test(text) && !/^-?\d+(?:\.\d+)?$/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
