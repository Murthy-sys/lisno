import { dashboardMetricPresentation, formatBps, formatDashboardRatio, formatDays, formatNullablePaise, formatPaise, ratioDetail, isDashboardMetricUnavailable, workerRoleLabel } from "./dashboardPresentation";
import type { DashboardComparisonMetric, DashboardTab, DashboardProjectFilters, DashboardWorkforceFilters, SuperAdminDashboardOverview, SuperAdminDashboardProjectsPage } from "./superAdminDashboardApi";

export interface DashboardDetailTarget {
  tab: Exclude<DashboardTab, "overview">;
  projectStatus?: DashboardProjectFilters["projectStatus"];
  moduleStatus?: DashboardProjectFilters["moduleStatus"];
  riskLevel?: DashboardProjectFilters["riskLevel"];
  riskFactor?: DashboardProjectFilters["riskFactor"];
  role?: DashboardWorkforceFilters["role"];
  sort?: DashboardProjectFilters["sort"] | DashboardWorkforceFilters["sort"];
  section?: "payments";
}

export function dashboardDetailHref(target: DashboardDetailTarget, periodDays: number, showComparison = true) {
  const params = new URLSearchParams({ tab: target.tab, periodDays: String(periodDays) });
  if (!showComparison) params.set("comparison", "off");
  for (const [key, value] of Object.entries(target)) if (key !== "tab" && value !== undefined) params.set(key, value);
  return `/admin/dashboard?${params.toString()}`;
}

export interface DashboardMetric {
  label: string; value: string | number; detail?: string; unavailable?: boolean;
  href?: string; originId?: string; icon?: "projects" | "value" | "contract" | "margin" | "overdue";
  actionLabel?: string; displayValue?: string;
}
export interface DashboardValueTable { title: string; columns: string[]; rows: Array<Array<string | number | null>>; }
export interface DashboardQueryView<T> { data?: T; isPending: boolean; isFetching: boolean; isError: boolean; isPlaceholderData?: boolean; dataUpdatedAt?: number; refetch: () => unknown; }
export type DashboardPriorityQuery = DashboardQueryView<SuperAdminDashboardProjectsPage>;
export type DashboardVendorQuery = DashboardQueryView<number>;

const metricKeyOverrides: Record<string, string> = {
  "projects.All projects": "projects.total",
  "projects.Created in period": "projects.createdInPeriod",
  "projects.Planning": "projects.planning",
  "projects.Active": "projects.active",
  "projects.On hold": "projects.onHold",
  "projects.Completed": "projects.completed",
  "projects.Live overdue": "projects.liveOverdue",
  "projects.Completed late": "projects.completedLate",
  "projects.Completion rate": "projects.completionRate",
  "projects.Unique projects at risk": "risk.projectDistribution",
  "estimation.No estimate": "estimation.noEstimate",
  "estimation.Draft / internal": "estimation.draftInternal",
  "estimation.Ready to send": "estimation.readyToSend",
  "estimation.Awaiting Client": "estimation.awaitingClient",
  "estimation.Changes requested": "estimation.changesRequested",
  "estimation.Client approved": "estimation.clientApproved",
  "estimation.Approved net revenue, excluding GST": "estimation.approvedSubtotalPaise",
  "estimation.Client-approved contract value, including GST": "estimation.approvedContractTotalPaise",
  "estimation.Median waiting age": "estimation.waitingAge",
  "estimation.Oldest waiting age": "estimation.waitingAge",
  "design.Pending assignment": "design.pendingAssignment",
  "design.Assigned": "design.assigned",
  "design.In progress": "design.inProgress",
  "design.Ready for Client": "design.readyForClient",
  "design.Changes requested": "design.changesRequested",
  "design.Approved": "design.approved",
  "design.Approval rate": "design.approvalRate",
  "design.Oldest pending review": "design.oldestPendingReviewAgeDays",
  "design.Failed deliveries": "design.failedDeliveryCount",
  "design.Disabled deliveries": "design.disabledDeliveryCount",
  "procurement.Not started": "procurement.notStarted",
  "procurement.Open": "procurement.open",
  "procurement.In progress": "procurement.inProgress",
  "procurement.Completed": "procurement.completed",
  "procurement.Average persisted progress": "procurement.averageProgress",
  "procurement.Approved procurement amount": "procurement.approvedAmountPaise",
  "procurement.Posted procurement spend": "procurement.postedSpendPaise",
  "procurement.Variance": "procurement.variancePaise",
  "finance.Client-approved contract value, including GST": "finance.approvedContractTotalPaise",
  "finance.Approved net revenue, excluding GST": "finance.approvedSubtotalPaise",
  "finance.GST": "finance.approvedGstPaise",
  "finance.Target profit": "finance.targetProfitPaise",
  "finance.Cost budget": "finance.costBudgetPaise",
  "finance.Recorded expenses": "finance.recordedCostPaise",
  "finance.Recorded overheads": "finance.overheadPaise",
  "finance.Current profit (live)": "finance.currentProfitPaise",
  "finance.Current margin": "finance.currentMarginBps",
  "finance.Budget exceptions": "finance.overBudgetProjectCount",
  "execution.All execution tasks": "execution.total",
  "execution.Open": "execution.open",
  "execution.In progress": "execution.inProgress",
  "execution.Completed": "execution.completed",
  "execution.Completed in period": "execution.completedInPeriod",
  "execution.Overdue incomplete": "execution.overdue",
  "execution.Unassigned": "execution.unassigned",
  "execution.Unassigned overdue": "execution.overdueUnassigned",
  "execution.Weighted progress": "execution.weightedProgress",
  "workforce.Active workers": "workforce.activeWorkers",
  "workforce.Workers with assignments": "workforce.assignedWorkers",
  "workforce.Unassigned workers": "workforce.unassignedWorkers",
  "workforce.Active assigned tasks": "workforce.activeAssignedTaskCount",
  "workforce.Active unassigned tasks": "workforce.activeUnassignedTaskCount",
  "workforce.Tasks completed in period": "workforce.completedInPeriodTaskCount",
  "workforce.Average calculated KPI": "workforce.averageKpi",
  "workforce.KPI eligible": "workforce.kpiEligibleWorkers",
  "workforce.No KPI data": "workforce.kpiUnavailableWorkers",
  "workforce.Over capacity": "workforce.capacity",
  "workforce.Inactive assignee exceptions": "workforce.inactiveAssigneeTaskCount",
  "risk.Red-risk projects": "risk.projectDistribution",
  "risk.Yellow-risk projects": "risk.projectDistribution",
  "risk.Clear projects": "risk.projectDistribution",
  "risk.Not tracked": "risk.projectDistribution",
  "risk.Unique projects at risk": "risk.projectDistribution",
  "risk.Factor occurrences": "risk.factorDistribution"
};

function tabMetricKey(tab: Exclude<DashboardTab, "overview">, label: string) {
  const override = metricKeyOverrides[`${tab}.${label}`];
  if (override) return override;
  const words = label.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
  const suffix = words.map((word, index) =>
    index === 0
      ? word.charAt(0).toLowerCase() + word.slice(1)
      : word.charAt(0).toUpperCase() + word.slice(1)
  ).join("");
  return `${tab}.${suffix}`;
}

function moduleMetrics(tab: Exclude<DashboardTab, "overview">, data: SuperAdminDashboardOverview): DashboardMetric[] {
  let cards: DashboardMetric[] = [];
  if (tab === "projects") cards = [
    { label: "All projects", value: data.projects.total }, { label: "Created in period", value: data.projects.createdInPeriod },
    { label: "Planning", value: data.projects.planning }, { label: "Active", value: data.projects.active },
    { label: "On hold", value: data.projects.onHold }, { label: "Completed", value: data.projects.completed },
    { label: "Live overdue", value: data.projects.liveOverdue }, { label: "Completed late", value: data.projects.completedLate },
    { label: "Completion rate", value: formatDashboardRatio(data.projects.completionRate), unavailable: data.projects.completionRate.rateBps === null, detail: ratioDetail(data.projects.completionRate, "projects") },
    { label: "Unique projects at risk", value: data.projects.atRisk }
  ];
  if (tab === "estimation") {
    cards = [
      { label: "No estimate", value: data.estimation.noEstimate }, { label: "Draft / internal", value: data.estimation.draftInternal },
      { label: "Ready to send", value: data.estimation.readyToSend }, { label: "Awaiting Client", value: data.estimation.awaitingClient },
      { label: "Changes requested", value: data.estimation.changesRequested }, { label: "Client approved", value: data.estimation.clientApproved },
      { label: "Approved net revenue, excluding GST", value: formatPaise(data.estimation.approvedSubtotalPaise) },
      { label: "Client-approved contract value, including GST", value: formatPaise(data.estimation.approvedContractTotalPaise) },
      { label: "Median waiting age", value: formatDays(data.estimation.medianWaitingAgeDays), unavailable: data.estimation.medianWaitingAgeDays === null },
      { label: "Oldest waiting age", value: formatDays(data.estimation.oldestWaitingAgeDays), unavailable: data.estimation.oldestWaitingAgeDays === null }
    ];
  }
  if (tab === "design") {
    cards = [
      { label: "Pending assignment", value: data.design.pendingAssignment }, { label: "Assigned", value: data.design.assigned },
      { label: "In progress", value: data.design.inProgress }, { label: "Ready for Client", value: data.design.readyForClient },
      { label: "Changes requested", value: data.design.changesRequested }, { label: "Approved", value: data.design.approved },
      { label: "Approval rate", value: formatDashboardRatio(data.design.approvalRate), unavailable: data.design.approvalRate.rateBps === null, detail: ratioDetail(data.design.approvalRate, "eligible plans") },
      { label: "Oldest pending review", value: formatDays(data.design.oldestPendingReviewAgeDays), unavailable: data.design.oldestPendingReviewAgeDays === null },
      { label: "Failed deliveries", value: data.design.failedDeliveryCount }, { label: "Disabled deliveries", value: data.design.disabledDeliveryCount }
    ];
  }
  if (tab === "procurement") {
    cards = [
      { label: "Not started", value: data.procurement.notStarted }, { label: "Open", value: data.procurement.open },
      { label: "In progress", value: data.procurement.inProgress }, { label: "Completed", value: data.procurement.completed },
      { label: "Average persisted progress", value: formatDashboardRatio(data.procurement.averageProgress), unavailable: data.procurement.averageProgress.rateBps === null, detail: `Average across ${data.procurement.averageProgress.denominator} tracked ${data.procurement.averageProgress.denominator === 1 ? "task" : "tasks"}` },
      { label: "Approved procurement amount", value: formatNullablePaise(data.procurement.plannedAmountPaise), unavailable: data.procurement.plannedAmountPaise === null },
      { label: "Posted procurement spend", value: formatPaise(data.procurement.postedSpendPaise) },
      { label: "Variance", value: formatNullablePaise(data.procurement.variancePaise), unavailable: data.procurement.variancePaise === null }
    ];
  }
  if (tab === "finance") cards = [
    { label: "Client-approved contract value, including GST", value: formatPaise(data.finance.approvedContractTotalPaise) },
    { label: "Approved net revenue, excluding GST", value: formatPaise(data.finance.approvedSubtotalPaise) },
    { label: "GST", value: formatPaise(data.finance.approvedGstPaise) }, { label: "Target profit", value: formatPaise(data.finance.targetProfitPaise) },
    { label: "Cost budget", value: formatPaise(data.finance.costBudgetPaise) }, { label: "Recorded expenses", value: formatPaise(data.finance.recordedCostPaise) },
    { label: "Recorded overheads", value: formatPaise(data.finance.overheadPaise) }, { label: "Current profit (live)", value: formatPaise(data.finance.currentProfitPaise) },
    { label: "Current margin", value: formatBps(data.finance.currentMarginBps), unavailable: data.finance.currentMarginBps === null }, { label: "Budget exceptions", value: data.finance.overBudgetProjectCount }
  ];
  if (tab === "execution") cards = [
    { label: "All execution tasks", value: data.execution.total }, { label: "Open", value: data.execution.open },
    { label: "In progress", value: data.execution.inProgress }, { label: "Completed", value: data.execution.completed },
    { label: "Completed in period", value: data.execution.completedInPeriod }, { label: "Overdue incomplete", value: data.execution.overdue },
    { label: "Unassigned", value: data.execution.unassigned }, { label: "Unassigned overdue", value: data.execution.overdueUnassigned },
    { label: "Weighted progress", value: formatDashboardRatio(data.execution.weightedProgress), unavailable: data.execution.weightedProgress.rateBps === null, detail: `${ratioDetail(data.execution.weightedProgress, "effort units")} · ${data.execution.weightedProgress.fallbackTaskCount} fallback tasks` }
  ];
  if (tab === "workforce") cards = [
    { label: "Active workers", value: data.workforce.activeWorkers }, { label: "Workers with assignments", value: data.workforce.assignedWorkers },
    { label: "Unassigned workers", value: data.workforce.unassignedWorkers }, { label: "Active assigned tasks", value: data.workforce.activeAssignedTaskCount },
    { label: "Active unassigned tasks", value: data.workforce.activeUnassignedTaskCount }, { label: "Tasks completed in period", value: data.workforce.completedInPeriodTaskCount },
    { label: "Average calculated KPI", value: formatDashboardRatio(data.workforce.averageKpi), unavailable: data.workforce.averageKpi.rateBps === null, detail: `Based on ${data.workforce.averageKpi.denominator} eligible ${data.workforce.averageKpi.denominator === 1 ? "worker" : "workers"}` },
    { label: "KPI eligible", value: data.workforce.kpiEligibleWorkers }, { label: "No KPI data", value: data.workforce.kpiUnavailableWorkers },
    { label: "Over capacity", value: data.workforce.capacityAvailable ? (data.workforce.overCapacityWorkers ?? "Not available") : "Not available", unavailable: !data.workforce.capacityAvailable || data.workforce.overCapacityWorkers === null, detail: data.workforce.capacityAvailable ? undefined : "No authoritative capacity denominator" },
    { label: "Inactive assignee exceptions", value: data.workforce.inactiveAssigneeTaskCount }
  ];
  if (tab === "risk") cards = [
    { label: "Red-risk projects", value: data.risk.projectDistribution.red }, { label: "Yellow-risk projects", value: data.risk.projectDistribution.yellow },
    { label: "Clear projects", value: data.risk.projectDistribution.green }, { label: "Not tracked", value: data.risk.projectDistribution.gray },
    { label: "Unique projects at risk", value: data.projects.atRisk }
  ];
  return cards.map((card) => ({
    ...card,
    ...dashboardMetricPresentation(data.dataQuality, tabMetricKey(tab, card.label), card.value, card.detail),
    unavailable: card.unavailable || isDashboardMetricUnavailable(data.dataQuality, tabMetricKey(tab, card.label))
  }));
}

const primaryLabels: Record<Exclude<DashboardTab, "overview">, string[]> = {
  projects: ["All projects", "Active", "Live overdue", "Completion rate"],
  estimation: ["Client approved", "Awaiting Client", "Changes requested", "Approved net revenue, excluding GST"],
  design: ["Approved", "In progress", "Ready for Client", "Changes requested"],
  procurement: ["In progress", "Completed", "Approved procurement amount", "Posted procurement spend"],
  finance: ["Approved net revenue, excluding GST", "Recorded expenses", "Current profit (live)", "Current margin"],
  execution: ["All execution tasks", "In progress", "Overdue incomplete", "Weighted progress"],
  workforce: ["Active workers", "Workers with assignments", "Unassigned workers", "Average calculated KPI"],
  risk: ["Red-risk projects", "Yellow-risk projects", "Clear projects", "Not tracked"]
};

export function periodActivity(metric: DashboardComparisonMetric | undefined, noun: string, comparison: boolean, availableOnly = false): string {
  if (!metric || metric.currentStatus === "unavailable" || metric.current === null) return availableOnly ? "" : metric?.currentUnavailableReason ?? `New ${noun} in period unavailable`;
  const current = `${metric.current.toLocaleString("en-IN")} new ${noun} in period`;
  if (!comparison) return current;
  if (metric.previousStatus === "unavailable" || metric.previous === null) return availableOnly ? current : `${current} · ${metric.previousUnavailableReason ?? "Previous period unavailable"}`;
  if (metric.changeKind === "new") return `${current} · New versus previous`;
  if (metric.changeKind === "no_change") return `${current} · No change versus previous`;
  if (metric.changeBps === null || metric.delta === null) return current;
  return `${current} · ${metric.delta > 0 ? "+" : ""}${metric.delta} (${metric.changeBps > 0 ? "+" : ""}${formatBps(metric.changeBps)}) vs previous`;
}

export function getDashboardMetrics(tab: DashboardTab, data: SuperAdminDashboardOverview, comparison = true, availableOnly = false, navigationPeriodDays = data.period.days): { primary: DashboardMetric[]; secondary: DashboardMetric[] } {
  if (tab === "overview") {
    const metric = (label: string, key: string, value: string | number, detail: string, available = true): DashboardMetric => ({ label, ...dashboardMetricPresentation(data.dataQuality, key, value, detail), unavailable: !available || isDashboardMetricUnavailable(data.dataQuality, key) });
    const clients = data.clients;
    const clientsAvailable = clients?.accountsStatus === "available" && clients.activeAccounts !== null && !isDashboardMetricUnavailable(data.dataQuality, "clients.activeAccounts");
    const compactPaise = (paise: number) => {
      const rupees = paise / 100;
      const scale = Math.abs(rupees) >= 10_000_000 ? 10_000_000 : Math.abs(rupees) >= 100_000 ? 100_000 : 1;
      return scale === 1 ? formatPaise(paise) : `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(rupees / scale)} ${scale === 10_000_000 ? "Cr" : "L"}`;
    };
    const linkedMetric = (item: DashboardMetric, icon: NonNullable<DashboardMetric["icon"]>, target: DashboardDetailTarget, actionLabel: string): DashboardMetric => ({
      ...item, ...(icon === "value" ? { displayValue: compactPaise(data.finance.approvedSubtotalPaise) } : icon === "contract" ? { displayValue: compactPaise(data.finance.approvedContractTotalPaise) } : {}), icon, href: dashboardDetailHref(target, navigationPeriodDays, comparison), originId: `dashboard-metric-${icon}`, actionLabel
    });
    return { primary: [
      linkedMetric(metric("Total projects", "projects.total", data.projects.total, "Current portfolio"), "projects", { tab: "projects" }, "View projects"),
      linkedMetric(metric("Approved net value", "finance.approvedSubtotalPaise", formatPaise(data.finance.approvedSubtotalPaise), "Excluding GST"), "value", { tab: "finance" }, "View finance"),
      linkedMetric(metric("Approved contract value", "finance.approvedContractTotalPaise", formatPaise(data.finance.approvedContractTotalPaise), "Including GST"), "contract", { tab: "finance" }, "View finance"),
      linkedMetric(metric("Current margin", "finance.currentMarginBps", formatBps(data.finance.currentMarginBps), "GST excluded", data.finance.currentMarginBps !== null), "margin", { tab: "finance" }, "View finance"),
      linkedMetric(metric("Live overdue projects", "projects.liveOverdue", data.projects.liveOverdue, "Current overdue deadlines"), "overdue", { tab: "risk", riskFactor: "schedule", sort: "deadline_asc" }, "Review schedule risk")
    ], secondary: [
      { label: "Active clients", value: clientsAvailable ? clients.activeAccounts! : "Not available", detail: clientsAvailable ? ["Enabled Client accounts", periodActivity(data.comparison?.metrics.clients_created, "clients", comparison, availableOnly)].filter(Boolean).join(" · ") : clients?.accountsUnavailableReason ?? "Client accounts are unavailable in this response.", unavailable: !clientsAvailable },
      metric("Project creation activity", "projects.createdInPeriod", data.projects.createdInPeriod, periodActivity(data.comparison?.metrics.projects_created, "projects", comparison, availableOnly)),
      metric("Completion rate", "projects.completionRate", formatDashboardRatio(data.projects.completionRate), ratioDetail(data.projects.completionRate, "projects completed"), data.projects.completionRate.rateBps !== null),
      metric("GST included", "finance.approvedGstPaise", formatPaise(data.finance.approvedGstPaise), "Approved finance snapshot"),
      metric("Current profit", "finance.currentProfitPaise", formatPaise(data.finance.currentProfitPaise), "Approved value less recorded costs"),
      metric("Registered clients", "clients.registeredAccounts", clients?.accountsStatus === "available" ? clients.registeredAccounts ?? "Not available" : "Not available", clients?.accountsUnavailableReason ?? "Current registered accounts", clients?.accountsStatus === "available" && clients.registeredAccounts != null),
      metric("Clients linked to projects", "clients.clientsWithProjects", clients?.relationshipsStatus === "available" ? clients.clientsWithProjects ?? "Not available" : "Not available", clients?.relationshipsUnavailableReason ?? "Current relationships", clients?.relationshipsStatus === "available" && clients.clientsWithProjects != null),
      metric("Unlinked projects", "clients.unlinkedProjects", clients?.relationshipsStatus === "available" ? clients.unlinkedProjects ?? "Not available" : "Not available", clients?.relationshipsUnavailableReason ?? "Current relationships", clients?.relationshipsStatus === "available" && clients.unlinkedProjects != null),
      metric("Estimation approvals", "estimation.clientApproved", data.estimation.clientApproved, availableOnly && isDashboardMetricUnavailable(data.dataQuality, "estimation.trackedProjects") ? "" : `${dashboardMetricPresentation(data.dataQuality, "estimation.trackedProjects", data.estimation.trackedProjects).value} tracked`),
      metric("Estimates awaiting Client", "estimation.awaitingClient", data.estimation.awaitingClient, "Current estimate state"),
      metric("Design approval rate", "design.approvalRate", formatDashboardRatio(data.design.approvalRate), ratioDetail(data.design.approvalRate, "eligible plans"), data.design.approvalRate.rateBps !== null),
      metric("Design plans approved", "design.approved", data.design.approved, "Current plan state"),
      metric("Design changes requested", "design.changesRequested", data.design.changesRequested, "Current plan state"),
      metric("Procurement progress", "procurement.averageProgress", formatDashboardRatio(data.procurement.averageProgress), `Average across ${data.procurement.averageProgress.denominator} tracked ${data.procurement.averageProgress.denominator === 1 ? "task" : "tasks"}`, data.procurement.averageProgress.rateBps !== null),
      metric("Procurement in progress", "procurement.inProgress", data.procurement.inProgress, "Current task state"),
      metric("Procurement completed", "procurement.completed", data.procurement.completed, "Current task state"),
      metric("Execution progress", "execution.weightedProgress", formatDashboardRatio(data.execution.weightedProgress), `${ratioDetail(data.execution.weightedProgress, "effort units")} · ${data.execution.weightedProgress.fallbackTaskCount} fallback tasks`, data.execution.weightedProgress.rateBps !== null),
      metric("Unassigned execution", "execution.unassigned", data.execution.unassigned, "Current execution tasks"),
      metric("Active workers", "workforce.activeWorkers", data.workforce.activeWorkers, "Current workforce"),
      metric("Average calculated KPI", "workforce.averageKpi", formatDashboardRatio(data.workforce.averageKpi), `Based on ${data.workforce.averageKpi.denominator} eligible ${data.workforce.averageKpi.denominator === 1 ? "worker" : "workers"}`, data.workforce.averageKpi.rateBps !== null),
      metric("KPI eligible", "workforce.kpiEligibleWorkers", data.workforce.kpiEligibleWorkers, "Current workforce"),
      metric("Workers without KPI data", "workforce.kpiUnavailableWorkers", data.workforce.kpiUnavailableWorkers, "Current workforce"),
      ...data.workforce.roleDistribution.map((entry) => metric(`${workerRoleLabel(entry.role)} workers`, `workforce.roleDistribution.${entry.role}`, entry.workerCount, "Current active workers by trade")),
      metric("Projects at risk", "risk.projectDistribution", data.projects.atRisk, "Distinct projects at risk")
    ] };
  }
  const all = moduleMetrics(tab, data);
  const labels = primaryLabels[tab];
  const primary = labels.map((label) => all.find((entry) => entry.label === label)!).map((entry) => ({ ...entry, label: entry.label === "Approved net revenue, excluding GST" ? "Approved net value" : entry.label, detail: entry.label === "Approved net revenue, excluding GST" && !entry.unavailable ? "Client-approved value, excluding GST" : entry.detail }));
  return { primary, secondary: all.filter((entry) => !labels.includes(entry.label)) };
}

export function getAvailableDashboardMetrics(tab: DashboardTab, data: SuperAdminDashboardOverview, comparison = true, navigationPeriodDays = data.period.days) {
  const metrics = getDashboardMetrics(tab, data, comparison, true, navigationPeriodDays);
  return { primary: metrics.primary.filter((metric) => !metric.unavailable), secondary: metrics.secondary.filter((metric) => !metric.unavailable) };
}

export function metricsTable(tab: DashboardTab, data: SuperAdminDashboardOverview, comparison = true): DashboardValueTable {
  const { primary, secondary } = getDashboardMetrics(tab, data, comparison);
  return { title: "Summary metrics", columns: ["Metric", "Value (currency in INR)", "Context"], rows: [...primary, ...secondary].map((metric) => [metric.label, metric.value, metric.detail ?? ""]) };
}
