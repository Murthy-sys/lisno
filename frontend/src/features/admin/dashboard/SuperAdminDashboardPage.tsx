import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { WorkerRole } from "../../../api/authorization-contract";
import type { ProjectStatus } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { InlineMessage } from "../../../components/ui/InlineMessage";
import { MetricCard } from "../../../components/ui/MetricCard";
import { PageHeader } from "../../../components/ui/PageHeader";
import { PageState } from "../../../components/ui/PageState";
import { SectionState } from "../../../components/ui/SectionState";
import { Surface } from "../../../components/ui/Surface";
import { DashboardModuleCharts } from "./DashboardModuleCharts";
import { DashboardNavigation } from "./DashboardNavigation";
import { DashboardOverview } from "./DashboardOverview";
import { DashboardProjectDrilldown } from "./DashboardProjectDrilldown";
import { DashboardWorkforceDrilldown } from "./DashboardWorkforceDrilldown";
import {
  formatBps,
  dashboardMetricPresentation,
  dashboardMetricUnavailableReason,
  formatDashboardRatio,
  formatDashboardTimestamp,
  formatDays,
  formatNullablePaise,
  formatPaise,
  humanize,
  isDashboardMetricUnavailable,
  ratioDetail
} from "./dashboardPresentation";
import {
  DASHBOARD_KPI_AVAILABILITY,
  DASHBOARD_PROJECT_MODULE_STATUSES,
  DASHBOARD_PROJECT_SORTS,
  DASHBOARD_RISK_FACTORS,
  DASHBOARD_RISK_LEVELS,
  DASHBOARD_WORKFORCE_ASSIGNMENT_STATES,
  DASHBOARD_WORKFORCE_CAPACITY_STATES,
  DASHBOARD_WORKFORCE_SORTS,
  dashboardKeys,
  getSuperAdminDashboardOverview,
  getSuperAdminDashboardProjects,
  getSuperAdminDashboardWorkforce,
  normalizeDashboardPeriod,
  normalizeDashboardTab,
  type DashboardProjectFilters,
  type DashboardProjectModule,
  type DashboardTab,
  type DashboardWorkforceFilters,
  type SuperAdminDashboardOverview
} from "./superAdminDashboardApi";
import "./super-admin-dashboard.css";

const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed"] as const;
const WORKER_ROLES = ["worker_electrician", "worker_plumber", "worker_carpenter", "worker_painter", "worker_civil", "worker_other"] as const;
const PROJECT_TABS = ["projects", "estimation", "design", "procurement", "finance", "execution", "risk"] as const;
const hasValue = <T extends readonly string[]>(values: T, value: string | null): value is T[number] =>
  value !== null && (values as readonly string[]).includes(value);

function integerParam(value: string | null, fallback: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function projectFiltersFromUrl(params: URLSearchParams, tab: DashboardTab): DashboardProjectFilters {
  const module: DashboardProjectModule = tab === "projects" ? "projects" : tab as DashboardProjectModule;
  const projectStatus = params.get("projectStatus");
  const moduleStatus = params.get("moduleStatus");
  const riskLevel = params.get("riskLevel");
  const riskFactor = params.get("riskFactor");
  const sort = params.get("sort");
  return {
    module,
    ...(hasValue(PROJECT_STATUSES, projectStatus) ? { projectStatus: projectStatus as ProjectStatus } : {}),
    ...(hasValue(DASHBOARD_PROJECT_MODULE_STATUSES, moduleStatus) ? { moduleStatus } : {}),
    ...(hasValue(DASHBOARD_RISK_LEVELS, riskLevel) ? { riskLevel } : {}),
    ...(hasValue(DASHBOARD_RISK_FACTORS, riskFactor) ? { riskFactor } : {}),
    ...(params.get("search")?.trim() ? { search: params.get("search")!.trim() } : {}),
    sort: hasValue(DASHBOARD_PROJECT_SORTS, sort) ? sort : "risk_desc",
    limit: 20,
    offset: integerParam(params.get("offset"), 0)
  };
}

function workforceFiltersFromUrl(params: URLSearchParams): DashboardWorkforceFilters {
  const role = params.get("role");
  const assignmentState = params.get("assignmentState");
  const capacityState = params.get("capacityState");
  const kpiAvailability = params.get("kpiAvailability");
  const sort = params.get("sort");
  return {
    ...(hasValue(WORKER_ROLES, role) ? { role: role as WorkerRole } : {}),
    ...(hasValue(DASHBOARD_WORKFORCE_ASSIGNMENT_STATES, assignmentState) ? { assignmentState } : {}),
    ...(hasValue(DASHBOARD_WORKFORCE_CAPACITY_STATES, capacityState) ? { capacityState } : {}),
    ...(hasValue(DASHBOARD_KPI_AVAILABILITY, kpiAvailability) ? { kpiAvailability } : {}),
    ...(params.get("search")?.trim() ? { search: params.get("search")!.trim() } : {}),
    sort: hasValue(DASHBOARD_WORKFORCE_SORTS, sort) ? sort : "workload_desc",
    limit: 20,
    offset: integerParam(params.get("offset"), 0)
  };
}

function CoverageDetail({ eligible, tracked, unavailable, module, dataQuality }: { eligible: number; tracked: number; unavailable: number; module: string; dataQuality: SuperAdminDashboardOverview["dataQuality"] }) {
  const unavailableKey = [`${module}.eligibleProjects`, `${module}.trackedProjects`, `${module}.unavailableProjects`]
    .find((key) => isDashboardMetricUnavailable(dataQuality, key));
  return <p className="dashboard-coverage">{unavailableKey ? <><strong>Not available.</strong> {dashboardMetricUnavailableReason(dataQuality, unavailableKey)}</> : <>{eligible} eligible · {tracked} tracked · {unavailable} unavailable</>}</p>;
}

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

function TabSummary({ tab, data }: { tab: Exclude<DashboardTab, "overview">; data: SuperAdminDashboardOverview }) {
  let cards: Array<{ label: string; value: string | number; detail?: string }> = [];
  let coverage: { eligible: number; tracked: number; unavailable: number } | null = null;
  if (tab === "projects") cards = [
    { label: "All projects", value: data.projects.total }, { label: "Created in period", value: data.projects.createdInPeriod },
    { label: "Planning", value: data.projects.planning }, { label: "Active", value: data.projects.active },
    { label: "On hold", value: data.projects.onHold }, { label: "Completed", value: data.projects.completed },
    { label: "Live overdue", value: data.projects.liveOverdue }, { label: "Completed late", value: data.projects.completedLate },
    { label: "Completion rate", value: formatDashboardRatio(data.projects.completionRate), detail: ratioDetail(data.projects.completionRate, "projects") },
    { label: "Unique projects at risk", value: data.projects.atRisk }
  ];
  if (tab === "estimation") {
    coverage = { eligible: data.estimation.eligibleProjects, tracked: data.estimation.trackedProjects, unavailable: data.estimation.unavailableProjects };
    cards = [
      { label: "No estimate", value: data.estimation.noEstimate }, { label: "Draft / internal", value: data.estimation.draftInternal },
      { label: "Ready to send", value: data.estimation.readyToSend }, { label: "Awaiting Client", value: data.estimation.awaitingClient },
      { label: "Changes requested", value: data.estimation.changesRequested }, { label: "Client approved", value: data.estimation.clientApproved },
      { label: "Approved net revenue, excluding GST", value: formatPaise(data.estimation.approvedSubtotalPaise) },
      { label: "Client-approved contract value, including GST", value: formatPaise(data.estimation.approvedContractTotalPaise) },
      { label: "Median waiting age", value: formatDays(data.estimation.medianWaitingAgeDays) },
      { label: "Oldest waiting age", value: formatDays(data.estimation.oldestWaitingAgeDays) }
    ];
  }
  if (tab === "design") {
    coverage = { eligible: data.design.eligibleProjects, tracked: data.design.trackedProjects, unavailable: data.design.unavailableProjects };
    cards = [
      { label: "Pending assignment", value: data.design.pendingAssignment }, { label: "Assigned", value: data.design.assigned },
      { label: "In progress", value: data.design.inProgress }, { label: "Ready for Client", value: data.design.readyForClient },
      { label: "Changes requested", value: data.design.changesRequested }, { label: "Approved", value: data.design.approved },
      { label: "Approval rate", value: formatDashboardRatio(data.design.approvalRate), detail: ratioDetail(data.design.approvalRate, "eligible plans") },
      { label: "Oldest pending review", value: formatDays(data.design.oldestPendingReviewAgeDays) },
      { label: "Failed deliveries", value: data.design.failedDeliveryCount }, { label: "Disabled deliveries", value: data.design.disabledDeliveryCount }
    ];
  }
  if (tab === "procurement") {
    coverage = { eligible: data.procurement.eligibleProjects, tracked: data.procurement.trackedProjects, unavailable: data.procurement.unavailableProjects };
    cards = [
      { label: "Not started", value: data.procurement.notStarted }, { label: "Open", value: data.procurement.open },
      { label: "In progress", value: data.procurement.inProgress }, { label: "Completed", value: data.procurement.completed },
      { label: "Average persisted progress", value: formatDashboardRatio(data.procurement.averageProgress), detail: ratioDetail(data.procurement.averageProgress, "tracked tasks") },
      { label: "Approved procurement amount", value: formatNullablePaise(data.procurement.plannedAmountPaise) },
      { label: "Posted procurement spend", value: formatPaise(data.procurement.postedSpendPaise) },
      { label: "Variance", value: formatNullablePaise(data.procurement.variancePaise) }
    ];
  }
  if (tab === "finance") cards = [
    { label: "Client-approved contract value, including GST", value: formatPaise(data.finance.approvedContractTotalPaise) },
    { label: "Approved net revenue, excluding GST", value: formatPaise(data.finance.approvedSubtotalPaise) },
    { label: "GST", value: formatPaise(data.finance.approvedGstPaise) }, { label: "Target profit", value: formatPaise(data.finance.targetProfitPaise) },
    { label: "Cost budget", value: formatPaise(data.finance.costBudgetPaise) }, { label: "Recorded expenses", value: formatPaise(data.finance.recordedCostPaise) },
    { label: "Recorded overheads", value: formatPaise(data.finance.overheadPaise) }, { label: "Current profit (live)", value: formatPaise(data.finance.currentProfitPaise) },
    { label: "Current margin", value: formatBps(data.finance.currentMarginBps) }, { label: "Budget exceptions", value: data.finance.overBudgetProjectCount }
  ];
  if (tab === "execution") cards = [
    { label: "All execution tasks", value: data.execution.total }, { label: "Open", value: data.execution.open },
    { label: "In progress", value: data.execution.inProgress }, { label: "Completed", value: data.execution.completed },
    { label: "Completed in period", value: data.execution.completedInPeriod }, { label: "Overdue incomplete", value: data.execution.overdue },
    { label: "Unassigned", value: data.execution.unassigned }, { label: "Unassigned overdue", value: data.execution.overdueUnassigned },
    { label: "Weighted progress", value: formatDashboardRatio(data.execution.weightedProgress), detail: `${ratioDetail(data.execution.weightedProgress, "effort units")} · ${data.execution.weightedProgress.fallbackTaskCount} fallback tasks` }
  ];
  if (tab === "workforce") cards = [
    { label: "Active workers", value: data.workforce.activeWorkers }, { label: "Workers with assignments", value: data.workforce.assignedWorkers },
    { label: "Unassigned workers", value: data.workforce.unassignedWorkers }, { label: "Active assigned tasks", value: data.workforce.activeAssignedTaskCount },
    { label: "Active unassigned tasks", value: data.workforce.activeUnassignedTaskCount }, { label: "Tasks completed in period", value: data.workforce.completedInPeriodTaskCount },
    { label: "Average calculated KPI", value: formatDashboardRatio(data.workforce.averageKpi), detail: ratioDetail(data.workforce.averageKpi, "eligible workers") },
    { label: "KPI eligible", value: data.workforce.kpiEligibleWorkers }, { label: "No KPI data", value: data.workforce.kpiUnavailableWorkers },
    { label: "Over capacity", value: data.workforce.capacityAvailable ? (data.workforce.overCapacityWorkers ?? "Not available") : "Not available", detail: data.workforce.capacityAvailable ? undefined : "No authoritative capacity denominator" },
    { label: "Inactive assignee exceptions", value: data.workforce.inactiveAssigneeTaskCount }
  ];
  if (tab === "risk") cards = [
    { label: "Red-risk projects", value: data.risk.projectDistribution.red }, { label: "Yellow-risk projects", value: data.risk.projectDistribution.yellow },
    { label: "Clear projects", value: data.risk.projectDistribution.green }, { label: "Not tracked", value: data.risk.projectDistribution.gray },
    { label: "Unique projects at risk", value: data.projects.atRisk }
  ];
  return <section className="dashboard-tab-summary" aria-label={`${humanize(tab)} summary`}>{coverage ? <CoverageDetail {...coverage} module={tab} dataQuality={data.dataQuality} /> : null}<DashboardModuleCharts tab={tab} data={data} /><div className="dashboard-metric-grid">{cards.map((card) => {
    const presentation = dashboardMetricPresentation(
      data.dataQuality,
      tabMetricKey(tab, card.label),
      card.value,
      card.detail
    );
    return <MetricCard key={card.label} label={card.label} value={presentation.value} detail={presentation.detail} />;
  })}</div></section>;
}

const queryKeys = ["projectStatus", "moduleStatus", "riskLevel", "riskFactor", "role", "assignmentState", "capacityState", "kpiAvailability", "search", "sort", "offset"];

export function SuperAdminDashboardPage() {
  const [params, setParams] = useSearchParams();
  const tab = normalizeDashboardTab(params.get("tab"));
  const periodDays = normalizeDashboardPeriod(params.get("periodDays"));
  const projectFilters = projectFiltersFromUrl(params, tab);
  const workforceFilters = workforceFiltersFromUrl(params);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const [manualRefresh, setManualRefresh] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const overview = useQuery({
    queryKey: dashboardKeys.overview(periodDays), queryFn: () => getSuperAdminDashboardOverview(periodDays),
    staleTime: 30_000, refetchOnWindowFocus: true
  });
  const projects = useQuery({
    queryKey: dashboardKeys.projects(periodDays, projectFilters), queryFn: () => getSuperAdminDashboardProjects(periodDays, projectFilters),
    enabled: PROJECT_TABS.includes(tab as never), staleTime: 30_000,
    refetchOnWindowFocus: true, placeholderData: keepPreviousData
  });
  const workforce = useQuery({
    queryKey: dashboardKeys.workforce(periodDays, workforceFilters), queryFn: () => getSuperAdminDashboardWorkforce(periodDays, workforceFilters),
    enabled: tab === "workforce", staleTime: 30_000,
    refetchOnWindowFocus: true, placeholderData: keepPreviousData
  });

  const setQuery = (updates: Record<string, string | number | undefined>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) value === undefined || value === "" ? next.delete(key) : next.set(key, String(value));
    setParams(next, { replace });
  };
  const selectTab = (nextTab: DashboardTab, focusPanel: boolean) => {
    const next = new URLSearchParams(params);
    next.set("tab", nextTab); next.set("periodDays", String(periodDays));
    for (const key of queryKeys) next.delete(key);
    setParams(next);
    if (focusPanel) window.setTimeout(() => panelHeading.current?.focus(), 0);
  };
  const replaceFilters = (filters: DashboardProjectFilters | DashboardWorkforceFilters) => {
    const next = new URLSearchParams(params);
    for (const key of queryKeys) next.delete(key);
    for (const [key, value] of Object.entries(filters)) {
      if (["module", "limit"].includes(key) || value === undefined || value === "") continue;
      next.set(key, String(value));
    }
    setParams(next);
  };
  const refresh = async () => {
    setManualRefresh(true); setAnnouncement("Refreshing dashboard…");
    const requests: Array<Promise<unknown>> = [overview.refetch()];
    if (PROJECT_TABS.includes(tab as never)) requests.push(projects.refetch());
    if (tab === "workforce") requests.push(workforce.refetch());
    const results = await Promise.all(requests);
    if (results.every((result) => !(result as { isError?: boolean }).isError)) setAnnouncement("Dashboard updated.");
    else setAnnouncement("Dashboard refresh could not complete.");
    setManualRefresh(false);
  };

  if (!overview.data) {
    if (overview.isError) return <PageState state="error" message="The organization dashboard could not be loaded." action={{ label: "Try again", onAction: () => void overview.refetch() }} />;
    return <PageState state="loading" message="Loading organization dashboard…" statusLabel="Dashboard status" />;
  }
  const data = overview.data;
  const refreshing = overview.isFetching || projects.isFetching || workforce.isFetching || manualRefresh;

  return (
    <section className="super-admin-dashboard" aria-labelledby="super-admin-dashboard-title">
      <PageHeader id="super-admin-dashboard-title" eyebrow="Super Admin command center" title="Organization dashboard" description="Organization-wide metrics and explainable risk. Overview totals are not changed by drill-down filters." metadata={<div className="dashboard-freshness"><span>Updated {formatDashboardTimestamp(data.observedAt)}</span>{refreshing ? <span role="status">Refreshing dashboard…</span> : null}</div>} actions={<><label className="dashboard-period"><span>Period</span><select aria-label="Dashboard period" value={periodDays} onChange={(event) => setQuery({ periodDays: event.target.value, offset: undefined })}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><Button variant="secondary" disabled={manualRefresh} aria-label="Refresh dashboard" onClick={() => void refresh()}><RefreshCw aria-hidden="true" />{manualRefresh ? "Refreshing…" : "Refresh"}</Button></>} />
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {data.dataQuality.status === "partial" ? <InlineMessage tone="warning"><strong>Some dashboard metrics are unavailable.</strong> {data.dataQuality.issues.map((issue) => issue.message).join(" ")}</InlineMessage> : null}
      {overview.isError && overview.data ? <InlineMessage tone="error">The latest refresh failed. Showing the last successfully observed dashboard.</InlineMessage> : null}
      <DashboardNavigation activeTab={tab} onSelect={selectTab} />
      <section id={`dashboard-panel-${tab}`} role="tabpanel" aria-labelledby={`dashboard-tab-${tab}`} aria-busy={refreshing || undefined} className="dashboard-panel">
        <h2 ref={panelHeading} tabIndex={-1}>{humanize(tab)}</h2>
        {tab === "overview" ? <>{data.projects.total === 0 ? <Surface as="section" variant="subtle"><p>No projects yet. Organization risk remains not tracked until eligible signals exist.</p></Surface> : null}<DashboardOverview data={data} /></> : <TabSummary tab={tab} data={data} />}
        {PROJECT_TABS.includes(tab as never) ? projects.isPending ? <SectionState state="loading" message={`Loading ${tab} project details…`} /> : projects.isError && !projects.data ? <SectionState state="error" message={`${humanize(tab)} project details could not be loaded.`} action={{ label: "Try again", onAction: () => void projects.refetch() }} /> : projects.data ? <>{projects.isError ? <InlineMessage tone="error">The latest project refresh failed. Showing the previous page.</InlineMessage> : null}{projects.data.dataQuality.status === "partial" ? <InlineMessage tone="warning">Some project rows are unavailable because their identity or lineage could not be verified.</InlineMessage> : null}<DashboardProjectDrilldown tab={tab as (typeof PROJECT_TABS)[number]} filters={projectFilters} page={projects.data} refreshing={projects.isFetching} onFiltersChange={replaceFilters} onPageChange={(offset) => setQuery({ offset })} /></> : null : null}
        {tab === "workforce" ? workforce.isPending ? <SectionState state="loading" message="Loading workforce details…" /> : workforce.isError && !workforce.data ? <SectionState state="error" message="Workforce details could not be loaded." action={{ label: "Try again", onAction: () => void workforce.refetch() }} /> : workforce.data ? <>{workforce.isError ? <InlineMessage tone="error">The latest workforce refresh failed. Showing the previous page.</InlineMessage> : null}{workforce.data.dataQuality.status === "partial" ? <InlineMessage tone="warning">Some workforce rows are unavailable because their identity could not be verified.</InlineMessage> : null}<DashboardWorkforceDrilldown filters={workforceFilters} page={workforce.data} refreshing={workforce.isFetching} onFiltersChange={replaceFilters} onPageChange={(offset) => setQuery({ offset })} /></> : null : null}
      </section>
    </section>
  );
}
