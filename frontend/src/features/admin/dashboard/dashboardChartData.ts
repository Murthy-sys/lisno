import { dashboardMetricUnavailableReason, formatPaise, humanize, isDashboardMetricUnavailable, workerRoleLabel } from "./dashboardPresentation";
import type { DashboardValueTable } from "./dashboardViewModel";
import type { DashboardComparisonMetricKey, DashboardTab, DashboardTrendBucket, SuperAdminDashboardOverview } from "./superAdminDashboardApi";

export type DashboardChartUnit = "count" | "paise" | "bps";
export interface DashboardChartRow {
  id: string;
  label: string;
  values: Array<number | null>;
  metricKey?: string;
  context?: string;
  unavailableContext?: string;
  status?: "good" | "warning" | "critical" | "neutral";
}
export interface DashboardChartDataset {
  id: string;
  title: string;
  subtitle: string;
  kind: "line" | "bar" | "donut";
  unit: DashboardChartUnit;
  column: string;
  area?: boolean;
  series: Array<{ id: string; label: string }>;
  rows: DashboardChartRow[];
  footnote?: string;
  unavailableReason?: string;
  partialReason?: string;
  total?: number | null;
  totalLabel?: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const chartUtcDate = (value: string) => dateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
export const formatChartValue = (value: number | null, unit: DashboardChartUnit) => value === null ? "Not available" : unit === "paise" ? formatPaise(value) : unit === "bps" ? `${(value / 100).toFixed(2)}%` : value.toLocaleString("en-IN");
const availableValue = (data: SuperAdminDashboardOverview, key: string, value: number | null | undefined) => isDashboardMetricUnavailable(data.dataQuality, key) || typeof value !== "number" || !Number.isSafeInteger(value) ? null : value;
const reason = (data: SuperAdminDashboardOverview, keys: string[]) => {
  const key = keys.find((candidate) => isDashboardMetricUnavailable(data.dataQuality, candidate));
  return key ? dashboardMetricUnavailableReason(data.dataQuality, key) : undefined;
};

type Category = [id: string, label: string, key: string, value: number | null, context?: string, status?: DashboardChartRow["status"]];
function categories(data: SuperAdminDashboardOverview, id: string, title: string, kind: "bar" | "donut", entries: Category[], options: Partial<DashboardChartDataset> = {}): DashboardChartDataset {
  const rows = entries.map(([key, label, metricKey, value, context, status]) => {
    const verified = availableValue(data, metricKey, value);
    return { id: key, label, metricKey, values: [verified], context: verified === null ? reason(data, [metricKey]) ?? "Source value unavailable." : context, status };
  });
  const partialReason = reason(data, entries.map((entry) => entry[2])) ?? (rows.some((row) => row.values[0] === null) ? "Some source values are unavailable." : undefined);
  const dataset: DashboardChartDataset = {
    id, title, kind, unit: "count", column: "Category", subtitle: "Current organization snapshot.", series: [{ id, label: "Count" }], rows,
    partialReason, unavailableReason: rows.length > 0 && rows.every((row) => row.values[0] === null) ? partialReason : undefined,
    ...options
  };
  if (kind === "donut" && dataset.total === null) dataset.partialReason ??= "The population total is unavailable; percentage shares are unavailable.";
  if (kind === "donut" && typeof dataset.total === "number" && rows.every((row) => row.values[0] !== null) && rows.reduce((sum, row) => sum + row.values[0]!, 0) !== dataset.total) dataset.partialReason ??= "Category values do not reconcile to the population total; percentage shares are unavailable.";
  return dataset;
}

type TrendField = Exclude<keyof DashboardTrendBucket, "date">;
function trend(data: SuperAdminDashboardOverview, id: string, title: string, fields: Array<[string, string, TrendField]>, unit: DashboardChartUnit = "count"): DashboardChartDataset {
  const rows = data.trends.map((bucket) => ({ id: bucket.date.slice(0, 10), label: chartUtcDate(bucket.date), values: fields.map((field) => availableValue(data, `trends.${field[2]}`, bucket[field[2]])) }));
  const partialReason = reason(data, fields.map((field) => `trends.${field[2]}`)) ?? (rows.some((row) => row.values.some((value) => value === null)) ? "Some dated source values are unavailable." : undefined);
  const allUnavailable = fields.every((field) => isDashboardMetricUnavailable(data.dataQuality, `trends.${field[2]}`)) || (rows.length > 0 && rows.every((row) => row.values.every((value) => value === null)));
  return {
    id, title, kind: "line", unit, column: unit === "paise" ? "Incurred date (UTC)" : "Date (UTC)",
    subtitle: unit === "paise" ? "Daily recorded expenses by incurred date." : "Daily recorded events in the selected period.",
    series: fields.map(([key, label]) => ({ id: key, label })), rows,
    footnote: `${chartUtcDate(data.period.startAt)} – ${chartUtcDate(data.period.endAt)} · UTC`,
    partialReason, unavailableReason: allUnavailable ? partialReason ?? "Selected-period history is unavailable." : undefined,
    ...(unit === "paise" ? { total: rows.some((row) => row.values[0] === null) || allUnavailable ? null : rows.reduce((sum, row) => sum + row.values[0]!, 0), totalLabel: "Selected-period total" } : {})
  };
}

export function recordedExpenseDataset(data: SuperAdminDashboardOverview): DashboardChartDataset {
  return trend(data, "dashboard-recorded-cost-activity", "Recorded expenses over time", [["recorded-cost-activity", "Recorded expenses", "ledgerExpensesPostedPaise"]], "paise");
}

function calendarRows(data: SuperAdminDashboardOverview, source: DashboardChartDataset): DashboardChartRow[] {
  const byDate = new Map(source.rows.map((row) => [row.id, row]));
  const start = new Date(`${data.period.startAt.slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${data.period.endAt.slice(0, 10)}T00:00:00.000Z`);
  const rows: DashboardChartRow[] = [];
  for (let date = new Date(start); date <= end && rows.length < data.period.days; date.setUTCDate(date.getUTCDate() + 1)) {
    const id = date.toISOString().slice(0, 10);
    rows.push(byDate.get(id) ?? { id, label: chartUtcDate(id), values: source.series.map(() => null) });
  }
  return rows;
}

export function projectActivityDataset(data: SuperAdminDashboardOverview): DashboardChartDataset {
  const source = trend(data, "dashboard-project-activity", "Project activity trend", [
    ["created", "Projects created", "projectsCreated"],
    ["completed", "Projects completed", "projectsCompleted"]
  ]);
  return {
    ...source, rows: calendarRows(data, source), area: true,
    subtitle: "Project creation and completion by UTC day."
  };
}

const PERIOD_ACTIVITY: Array<[DashboardComparisonMetricKey, string]> = [
  ["projects_created", "Projects created"],
  ["projects_completed", "Projects completed"],
  ["estimates_approved", "Estimates approved"],
  ["design_plans_approved", "Design plans approved"],
  ["execution_tasks_completed", "Execution tasks completed"]
];

export function periodActivityComparisonDataset(data: SuperAdminDashboardOverview, showComparison = true): DashboardChartDataset {
  const comparison = data.comparison;
  const rows = PERIOD_ACTIVITY.map(([id, label]) => {
    const metric = comparison?.metrics[id];
    const current = metric?.currentStatus === "available" && metric.unit === "count"
      ? availableValue(data, `comparison.${id}.current`, metric.current) : null;
    const previous = metric?.previousStatus === "available" && metric.unit === "count"
      ? availableValue(data, `comparison.${id}.previous`, metric.previous) : null;
    const context = [current === null ? metric?.currentUnavailableReason : null, showComparison && previous === null ? metric?.previousUnavailableReason : null].filter(Boolean).join(" · ");
    return { id, label, values: showComparison ? [current, previous] : [current], ...(context ? { unavailableContext: context } : {}) };
  });
  const unavailable = !comparison || rows.every((row) => row.values.every((value) => value === null));
  const window = comparison?.window;
  return {
    id: "dashboard-period-activity", title: "Period activity comparison", kind: "bar", unit: "count", column: "Event",
    subtitle: showComparison ? "Recorded events in the current and previous periods." : "Recorded events in the selected period.",
    series: [{ id: "current-period", label: "Current period" }, ...(showComparison ? [{ id: "previous-period", label: "Previous period" }] : [])],
    rows,
    unavailableReason: unavailable ? "Period event comparisons are unavailable in this response." : undefined,
    partialReason: rows.some((row) => row.values.some((value) => value === null)) ? "Some period event counts are unavailable." : undefined,
    footnote: window ? `Current: ${chartUtcDate(window.current.startAt)} – ${chartUtcDate(window.current.endAt)}${showComparison ? ` · Previous: ${chartUtcDate(window.previous.startAt)} – ${chartUtcDate(window.previous.endAt)}` : ""} · UTC${window.partialFinalDay ? " · Final day in progress" : ""}` : undefined
  };
}

/** Calendar gaps remain unknown; only explicitly recorded zeroes mean no activity. */
export function projectCreationHeatmapDataset(data: SuperAdminDashboardOverview): DashboardChartDataset {
  const source = trend(data, "dashboard-project-creation-calendar", "Project activity heatmap", [["created", "Projects created", "projectsCreated"]]);
  const rows = calendarRows(data, source);
  return {
    ...source, rows, subtitle: "Projects created each day. Select a date for exact activity.",
    partialReason: source.partialReason ?? (rows.some((row) => row.values[0] === null) ? "Some daily project-creation counts are unavailable." : undefined),
    unavailableReason: source.unavailableReason ?? (rows.length > 0 && rows.every((row) => row.values[0] === null) ? "Daily project-creation counts are unavailable." : undefined)
  };
}

export function clientBreakdownDataset(data: SuperAdminDashboardOverview): DashboardChartDataset {
  const clients = data.clients;
  const accountsAvailable = clients?.accountsStatus === "available";
  const result = categories(data, "dashboard-client-breakdown", "Client breakdown", "donut", [
    ["active", "Active", "clients.activeAccounts", accountsAvailable ? clients.activeAccounts : null],
    ["inactive", "Inactive", "clients.inactiveAccounts", accountsAvailable ? clients.inactiveAccounts : null]
  ], { subtitle: "Enabled and disabled Client accounts.", column: "Account state", total: accountsAvailable ? availableValue(data, "clients.registeredAccounts", clients.registeredAccounts) : null, totalLabel: "Registered clients" });
  if (!accountsAvailable) result.unavailableReason = clients?.accountsUnavailableReason ?? "Client account data is unavailable in this response.";
  if (result.total === null) result.partialReason ??= "The registered-account total is unavailable.";
  if (result.total !== null && result.rows.every((row) => row.values[0] !== null) && result.rows.reduce((sum, row) => sum + row.values[0]!, 0) !== result.total) result.partialReason = "Account states do not reconcile to the registered-account total.";
  return result;
}

export function lifecycleDataset(data: SuperAdminDashboardOverview): DashboardChartDataset {
  return categories(data, "dashboard-project-status", "Projects by current stage", "donut", [
    ["planning", "Planning", "projects.planning", data.projects.planning],
    ["active", "Active", "projects.active", data.projects.active],
    ["on_hold", "On hold", "projects.onHold", data.projects.onHold],
    ["completed", "Completed", "projects.completed", data.projects.completed]
  ], { column: "Stage", total: availableValue(data, "projects.total", data.projects.total), totalLabel: "Projects" });
}

export function costCompositionDataset(data: SuperAdminDashboardOverview): DashboardChartDataset {
  return categories(data, "dashboard-cost-composition", "Cost composition", "donut", [
    ["procurement", "Procurement", "finance.procurementCostPaise", data.finance.procurementCostPaise],
    ["employee", "Employee payments", "finance.employeePaymentPaise", data.finance.employeePaymentPaise],
    ["other", "Other expenses", "finance.otherExpensePaise", data.finance.otherExpensePaise],
    ["overhead", "Overheads", "finance.overheadPaise", data.finance.overheadPaise]
  ], { unit: "paise", column: "Cost class", subtitle: "Recorded costs by verified finance classification.", total: availableValue(data, "finance.recordedCostPaise", data.finance.recordedCostPaise), totalLabel: "Recorded expenses" });
}

export function budgetDataset(data: SuperAdminDashboardOverview): DashboardChartDataset {
  return categories(data, "dashboard-budget-position", "Budget position", "bar", [
    ["cost-budget", "Cost budget", "finance.costBudgetPaise", data.finance.costBudgetPaise],
    ["recorded-cost", "Recorded expenses", "finance.recordedCostPaise", data.finance.recordedCostPaise],
    ["remaining-budget", data.finance.remainingBudgetPaise < 0 ? "Overspent" : "Remaining budget", "finance.remainingBudgetPaise", data.finance.remainingBudgetPaise, undefined, data.finance.remainingBudgetPaise < 0 ? "critical" : undefined]
  ], { unit: "paise", column: "Measure", subtitle: "Approved budget, recorded expenses and signed remaining amount." });
}

function riskDataset(data: SuperAdminDashboardOverview): DashboardChartDataset {
  return categories(data, "dashboard-module-risk-distribution", "Portfolio risk", "donut", [
    ["red", "Red risk", "risk.projectDistribution.red", data.risk.projectDistribution.red, undefined, "critical"],
    ["yellow", "Yellow risk", "risk.projectDistribution.yellow", data.risk.projectDistribution.yellow, undefined, "warning"],
    ["green", "Clear", "risk.projectDistribution.green", data.risk.projectDistribution.green, undefined, "good"],
    ["gray", "Not tracked", "risk.projectDistribution.gray", data.risk.projectDistribution.gray, undefined, "neutral"]
  ], { column: "Risk level", subtitle: "Distinct projects by backend risk assessment." });
}

function ratioDataset(data: SuperAdminDashboardOverview, id: string, title: string, key: string, value: number | null, context: string): DashboardChartDataset {
  return categories(data, id, title, "bar", [["value", title, key, value, context]], { unit: "bps", column: "Measure", subtitle: availableValue(data, key, value) === null ? reason(data, [key]) ?? "No eligible denominator is available." : context });
}

export function getDashboardChartDatasets(tab: DashboardTab, data: SuperAdminDashboardOverview, showComparison = true): DashboardChartDataset[] {
  const lifecycle = () => lifecycleDataset(data);
  const approval = () => trend(data, "dashboard-approval-throughput", "Estimate approvals over time", [["estimates", "Estimates approved", "estimatesApproved"]]);
  if (tab === "overview") return [recordedExpenseDataset(data), clientBreakdownDataset(data), budgetDataset(data), costCompositionDataset(data), lifecycle(), projectActivityDataset(data), periodActivityComparisonDataset(data, showComparison), projectCreationHeatmapDataset(data)];
  if (tab === "projects") return [trend(data, "dashboard-project-flow", "Projects created and completed", [["created", "Created", "projectsCreated"], ["completed", "Completed", "projectsCompleted"]]), lifecycle(), riskDataset(data)];
  if (tab === "estimation") return [categories(data, "dashboard-estimation-status", "Estimate status", "bar", [
    ["none", "No estimate", "estimation.noEstimate", data.estimation.noEstimate], ["draft", "Draft / internal", "estimation.draftInternal", data.estimation.draftInternal],
    ["ready", "Ready to send", "estimation.readyToSend", data.estimation.readyToSend], ["awaiting", "Awaiting Client", "estimation.awaitingClient", data.estimation.awaitingClient],
    ["changes", "Changes requested", "estimation.changesRequested", data.estimation.changesRequested], ["approved", "Client approved", "estimation.clientApproved", data.estimation.clientApproved]
  ], { column: "Status", subtitle: "Current project counts by estimate status; these are not conversion stages." }), approval()];
  if (tab === "design") return [categories(data, "dashboard-design-status", "Design status", "bar", [
    ["pending", "Pending assignment", "design.pendingAssignment", data.design.pendingAssignment], ["assigned", "Assigned", "design.assigned", data.design.assigned],
    ["progress", "In progress", "design.inProgress", data.design.inProgress], ["ready", "Ready for Client", "design.readyForClient", data.design.readyForClient],
    ["changes", "Changes requested", "design.changesRequested", data.design.changesRequested], ["approved", "Approved", "design.approved", data.design.approved]
  ], { column: "Status" }), trend(data, "dashboard-design-approval-trend", "Design approvals over time", [["designs", "Design plans approved", "designPlansApproved"]])];
  if (tab === "procurement") return [categories(data, "dashboard-procurement-status", "Procurement task states", "bar", [
    ["not_started", "Not started", "procurement.notStarted", data.procurement.notStarted], ["open", "Open", "procurement.open", data.procurement.open],
    ["progress", "In progress", "procurement.inProgress", data.procurement.inProgress], ["completed", "Completed", "procurement.completed", data.procurement.completed]
  ], { column: "Task state" }), categories(data, "dashboard-procurement-spend", "Approved procurement and posted spend", "bar", [
    ["approved", "Approved amount", "procurement.approvedAmountPaise", data.procurement.plannedAmountPaise], ["posted", "Posted spend", "procurement.postedSpendPaise", data.procurement.postedSpendPaise]
  ], { unit: "paise", column: "Measure", subtitle: "Authoritative approved amount and recorded procurement expenditure." })];
  if (tab === "finance") return [recordedExpenseDataset(data), costCompositionDataset(data), budgetDataset(data), categories(data, "dashboard-finance-reconciliation", "Approved value and cost reconciliation", "bar", [
    ["contract", "Contract total", "finance.approvedContractTotalPaise", data.finance.approvedContractTotalPaise, "Including GST"],
    ["gst", "GST", "finance.approvedGstPaise", data.finance.approvedGstPaise, "Tax context"],
    ["net", "Approved net value", "finance.approvedSubtotalPaise", data.finance.approvedSubtotalPaise, "Excluding GST"],
    ["target-profit", "Target profit", "finance.targetProfitPaise", data.finance.targetProfitPaise, "Approved net value less cost budget"],
    ["budget", "Cost budget", "finance.costBudgetPaise", data.finance.costBudgetPaise],
    ["recorded", "Recorded expenses", "finance.recordedCostPaise", data.finance.recordedCostPaise],
    ["remaining", "Remaining budget", "finance.remainingBudgetPaise", data.finance.remainingBudgetPaise, "Cost budget less recorded expenses"],
    ["current-profit", "Current profit", "finance.currentProfitPaise", data.finance.currentProfitPaise, "Approved net value less recorded expenses"]
  ], { unit: "paise", column: "Measure", subtitle: "Current approved values and recorded costs. Signed amounts are preserved." }), ratioDataset(data, "dashboard-margin", "Current margin", "finance.currentMarginBps", data.finance.currentMarginBps, "Backend margin excludes GST; no eligible denominator is unavailable.")];
  if (tab === "execution") return [trend(data, "dashboard-execution-completion-trend", "Completed execution work over time", [["tasks", "Tasks completed", "workflowTasksCompleted"]]), categories(data, "dashboard-execution-status", "Execution task states", "donut", [
    ["open", "Open", "execution.open", data.execution.open], ["progress", "In progress", "execution.inProgress", data.execution.inProgress], ["completed", "Completed", "execution.completed", data.execution.completed]
  ], { column: "Task state" }), categories(data, "dashboard-execution-roles", "Execution tasks by trade", "bar", data.execution.roleDistribution.map((item) => [item.role, humanize(item.role.replace(/^worker_/, "")), `execution.roleDistribution.${item.role}`, item.taskCount]), { column: "Trade", unavailableReason: reason(data, ["execution.roleDistribution"]) }), ratioDataset(data, "dashboard-execution-progress", "Weighted execution progress", "execution.weightedProgress", data.execution.weightedProgress.rateBps, `${data.execution.weightedProgress.numerator} of ${data.execution.weightedProgress.denominator} effort units · ${data.execution.weightedProgress.fallbackTaskCount} fallback tasks`)];
  if (tab === "workforce") return [categories(data, "dashboard-worker-roles", "Active workers by trade", "bar", data.workforce.roleDistribution.map((item) => [item.role, workerRoleLabel(item.role), `workforce.roleDistribution.${item.role}`, item.workerCount]), { column: "Trade", unavailableReason: reason(data, ["workforce.roleDistribution"]) }), categories(data, "dashboard-workforce-assignment", "Worker assignments", "donut", [
    ["assigned", "With assignments", "workforce.assignedWorkers", data.workforce.assignedWorkers], ["unassigned", "Without assignments", "workforce.unassignedWorkers", data.workforce.unassignedWorkers]
  ], { column: "Assignment state", total: availableValue(data, "workforce.activeWorkers", data.workforce.activeWorkers), totalLabel: "Active workers" }), categories(data, "dashboard-governance-queues", "Administrator attention", "bar", [
    ["invitations", "Pending invitations", "governance.pendingInvitations", data.governance.pendingInvitations], ["expired", "Expired invitations", "governance.expiredInvitations", data.governance.expiredInvitations],
    ["invitation-failures", "Failed invitation deliveries", "governance.failedInvitationDeliveries", data.governance.failedInvitationDeliveries], ["access", "Access requests", "governance.pendingAccessRequests", data.governance.pendingAccessRequests],
    ["client", "Client responses", "governance.pendingClientResponses", data.governance.pendingClientResponses], ["client-failures", "Failed client deliveries", "governance.failedClientDeliveries", data.governance.failedClientDeliveries],
    ["client-disabled", "Disabled client deliveries", "governance.disabledClientDeliveries", data.governance.disabledClientDeliveries], ["design", "Design responses", "governance.pendingDesignResponses", data.governance.pendingDesignResponses],
    ["design-failures", "Failed design deliveries", "governance.failedDesignDeliveries", data.governance.failedDesignDeliveries], ["design-disabled", "Disabled design deliveries", "governance.disabledDesignDeliveries", data.governance.disabledDesignDeliveries]
  ], { column: "Queue", subtitle: "Independent queue and delivery sources." }), ratioDataset(data, "dashboard-workforce-kpi", "Average calculated KPI", "workforce.averageKpi", data.workforce.averageKpi.rateBps, `Exact basis ${data.workforce.averageKpi.numerator} / ${data.workforce.averageKpi.denominator} · ${data.workforce.kpiEligibleWorkers} eligible · ${data.workforce.kpiUnavailableWorkers} without KPI data`)];
  return [riskDataset(data), categories(data, "dashboard-risk-factor-occurrences", "Risk factor occurrences", "bar", data.risk.factorDistribution.map((factor) => [
    `${factor.kind}-${factor.level}-${factor.reasonCode}`, `${humanize(factor.reasonCode)} (${humanize(factor.level)})`, `risk.factorDistribution.${factor.kind}.${factor.reasonCode}`, factor.occurrenceCount, `${humanize(factor.kind)} · across ${factor.projectCount} projects`, factor.level === "red" ? "critical" : factor.level === "yellow" ? "warning" : "good"
  ]), { column: "Reason", subtitle: "Occurrences may overlap; project counts are shown separately in the exact values.", unavailableReason: reason(data, ["risk.factorDistribution"]) })];
}

export const chartDatasetTotal = (dataset: DashboardChartDataset): number | null => dataset.unavailableReason || dataset.partialReason || dataset.rows.some((row) => row.values[0] === null) ? null : dataset.total !== undefined ? dataset.total : dataset.rows.reduce((sum, row) => sum + (row.values[0] ?? 0), 0);

/** Display only verified values; keep the original dataset for report diagnostics. */
export function getVisibleDashboardChartDataset(dataset: DashboardChartDataset): DashboardChartDataset | null {
  if (dataset.unavailableReason) return null;
  const numeric = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
  const incompleteDonut = dataset.kind === "donut" && (chartDatasetTotal(dataset) === null || dataset.rows.some((row) => row.values.some((value) => value !== null && value < 0)));
  const seriesIndexes = dataset.series.flatMap((_, index) => dataset.rows.length === 0 || dataset.rows.some((row) => numeric(row.values[index])) ? [index] : []);
  if (seriesIndexes.length === 0) return null;
  const rows = dataset.rows
    .filter((row) => dataset.kind === "line" || seriesIndexes.some((index) => numeric(row.values[index])))
    .map((row) => ({ ...row, unavailableContext: undefined, values: seriesIndexes.map((index) => row.values[index] ?? null) }));
  const hasTotal = numeric(dataset.total) && !incompleteDonut;
  return {
    ...dataset,
    kind: incompleteDonut ? "bar" : dataset.kind,
    series: seriesIndexes.map((index) => dataset.series[index]),
    rows,
    total: hasTotal ? dataset.total : undefined,
    totalLabel: hasTotal ? dataset.totalLabel : undefined,
    unavailableReason: undefined,
    partialReason: undefined
  };
}

export function chartDatasetTable(dataset: DashboardChartDataset): DashboardValueTable {
  const total = chartDatasetTotal(dataset);
  const hasContext = dataset.rows.some((row) => row.context || row.unavailableContext) || Boolean(dataset.unavailableReason || dataset.partialReason);
  const unitLabel = dataset.unit === "paise" ? " (INR)" : dataset.unit === "bps" ? " (%)" : "";
  return {
    title: dataset.title,
    columns: [dataset.column, ...dataset.series.map((series) => `${series.label}${unitLabel}`), ...(dataset.kind === "donut" ? ["Share (%)"] : []), ...(hasContext ? ["Context"] : [])],
    rows: dataset.rows.map((row) => [dataset.kind === "line" ? row.id : row.label, ...row.values.map((value) => value === null ? null : dataset.unit === "count" ? value : value / 100), ...(dataset.kind === "donut" ? [total === null || total === 0 || row.values[0] === null ? null : Number((row.values[0] / total * 100).toFixed(2))] : []), ...(hasContext ? [row.context ?? row.unavailableContext ?? dataset.unavailableReason ?? dataset.partialReason ?? ""] : [])])
  };
}

export function getDashboardChartTables(tab: DashboardTab, data: SuperAdminDashboardOverview, showComparison = true): DashboardValueTable[] {
  return getDashboardChartDatasets(tab, data, showComparison).map((dataset) => {
    const table = chartDatasetTable(dataset);
    const note = [dataset.unavailableReason, dataset.partialReason, dataset.footnote].filter(Boolean).join(" · ");
    if (note) table.rows.push(["Source context", note, ...Array(Math.max(0, table.columns.length - 2)).fill(null)]);
    if (dataset.totalLabel) table.rows.push([dataset.totalLabel, dataset.total === null || dataset.total === undefined ? null : dataset.unit === "count" ? dataset.total : dataset.total / 100, ...Array(Math.max(0, table.columns.length - 2)).fill(null)]);
    return table;
  });
}
