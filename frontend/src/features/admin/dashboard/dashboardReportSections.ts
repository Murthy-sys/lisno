import { priorityProjectPresentation } from "./DashboardPriorityProjects";
import { dashboardMetricPresentation, formatBps, formatDashboardDate, formatDashboardRatio, formatNullablePaise, formatPaise, humanize, riskPresentation, isDashboardMetricUnavailable, workerRoleLabel } from "./dashboardPresentation";
import type { DashboardReportSection } from "./dashboardReportExport";
import type { DashboardQueryView, DashboardValueTable } from "./dashboardViewModel";
import type { DashboardDataQuality, DashboardPeriod, DashboardTab, SuperAdminDashboardProjectsPage, SuperAdminDashboardWorkforcePage } from "./superAdminDashboardApi";

export function reportSection<T extends { observedAt: string; period: DashboardPeriod; dataQuality: DashboardDataQuality }>(id: string, label: string, query: DashboardQueryView<T>, tables: DashboardValueTable[]): DashboardReportSection {
  return {
    id, label,
    state: query.data ? query.isError ? "stale" : "ready" : query.isPending ? "loading" : "unavailable",
    observedAt: query.data?.observedAt ?? null,
    fetchedAt: query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : null,
    period: query.data?.period ?? null,
    dataQuality: query.data?.dataQuality.status,
    reason: [query.isError ? "Latest refresh failed." : "", !query.data ? "This section has not loaded." : query.data.dataQuality.issues.map((issue) => issue.message).join(" ")].filter(Boolean).join(" "),
    tables: query.data ? tables : []
  };
}

export function projectReportTable(tab: DashboardTab, page: SuperAdminDashboardProjectsPage): DashboardValueTable {
  const quality = page.dataQuality;
  const value = (key: string, raw: string | number) => dashboardMetricPresentation(quality, key, raw).value;
  const title = tab === "overview" ? "Priority projects (up to 5 rows)" : `${humanize(tab)} project records (current page)`;
  if (isDashboardMetricUnavailable(quality, "projects.rows") || (tab !== "overview" && isDashboardMetricUnavailable(quality, `${tab}.rows`))) return { title, columns: ["Status"], rows: [["Not available: project identity or module lineage could not be verified."]] };
  if (tab === "overview") return { title, columns: ["Project", "Execution progress", "Manager", "Due date", "Risk"], rows: page.items.slice(0, 5).map((row) => { const presentation = priorityProjectPresentation(row, quality); return [row.projectName, presentation.progressLabel, presentation.manager, presentation.dueDate, presentation.risk.label]; }) };
  return { title, columns: ["Project", "Location", "Status", `${humanize(tab)} details`, "Planned deadline", "Risk"], rows: page.items.map((row) => {
    let detail = "Not available";
    if (tab === "projects") detail = `${row.manager?.name ?? "No manager"} · ${value("execution.taskCount", row.execution.taskCount)} execution tasks · ${value("finance.currentProfitPaise", row.finance ? formatPaise(row.finance.currentProfitPaise) : "Finance not available")}`;
    if (tab === "estimation") detail = row.estimate ? `${humanize(row.estimate.status)} · v${row.estimate.version}${row.estimate.reviewRoundId ? " · review recorded" : ""}` : "Not available · no estimate";
    if (tab === "design") detail = row.designPlan ? `${humanize(row.designPlan.status)} · v${row.designPlan.version}${row.designPlan.reviewRoundId ? " · review recorded" : ""}` : "Not available · no Design Plan";
    if (tab === "procurement") detail = row.procurement ? `${humanize(row.procurement.status)} · ${value("procurement.averageProgress", `${row.procurement.progress}%`)} · ${value("procurement.postedSpendPaise", formatPaise(row.procurement.postedSpendPaise))} posted of ${value("procurement.approvedAmountPaise", formatNullablePaise(row.procurement.approvedAmountPaise))} approved` : "Not available · not eligible";
    if (tab === "finance") detail = row.finance ? `${value("finance.approvedSubtotalPaise", formatPaise(row.finance.approvedSubtotalPaise))} approved net · ${value("finance.recordedCostPaise", formatPaise(row.finance.recordedCostPaise))} recorded · ${value("finance.currentMarginBps", formatBps(row.finance.currentMarginBps))} current margin` : "Not available · no finance baseline";
    if (tab === "execution") detail = `${value("execution.taskCount", row.execution.taskCount)} tasks · ${value("execution.overdueTaskCount", row.execution.overdueTaskCount)} overdue · ${value("execution.weightedProgress", formatDashboardRatio(row.execution.progress))} weighted progress`;
    if (tab === "risk") detail = String(value("risk.factorDistribution", row.risk.factors.length ? row.risk.factors.map((factor) => `${factor.reason} · ${humanize(factor.kind)} · observed ${String(factor.observedValue ?? "Not available")}${factor.threshold === null ? "" : ` · threshold ${String(factor.threshold)}`}`).join("; ") : "No eligible risk factor"));
    return [row.projectName, row.location, humanize(row.projectStatus), detail, formatDashboardDate(row.plannedEndAt), value("risk.projectDistribution", riskPresentation(row.risk.level).label)];
  }) };
}

export function workforceReportTable(page: SuperAdminDashboardWorkforcePage): DashboardValueTable {
  const value = (key: string, raw: string | number) => dashboardMetricPresentation(page.dataQuality, key, raw).value;
  const title = "Workforce records (current page)";
  if (isDashboardMetricUnavailable(page.dataQuality, "workforce.rows")) return { title, columns: ["Status"], rows: [["Not available: worker identity could not be verified."]] };
  return { title, columns: ["Worker", "Role", "Assignment", "Active tasks", "Remaining workload", "Effort", "Capacity", "Calculated KPI", "Completed in period"], rows: page.items.map((row) => [
    row.workerName, workerRoleLabel(row.role), value("workforce.assignmentState", humanize(row.assignmentState)), value("workforce.activeTaskCount", row.activeTaskCount),
    value("workforce.workload", `${row.remainingWorkloadPercentage}% remaining`), value("workforce.workload", `${row.completedEffort} completed · ${row.remainingEffort} remaining of ${row.plannedEffort}`),
    value("workforce.capacity", row.capacityAvailable ? humanize(row.capacityState) : "Not available"),
    value("workforce.kpi", row.kpi.availability === "available" ? formatBps(row.kpi.scoreBps) : "Not available"), value("workforce.completedInPeriod", row.completedInPeriod)
  ]) };
}
