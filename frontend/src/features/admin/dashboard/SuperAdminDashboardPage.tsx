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
import { SelectMenu } from "../../../components/ui/SelectMenu";
import { Surface } from "../../../components/ui/Surface";
import { CoverageChart } from "./dashboardCharts";
import { DashboardModuleCharts } from "./DashboardModuleCharts";
import { DashboardNavigation } from "./DashboardNavigation";
import { DashboardOverview } from "./DashboardOverview";
import { DashboardProjectDrilldown } from "./DashboardProjectDrilldown";
import {
  dashboardMockOverview,
  dashboardMockProjectsPage,
  dashboardMockWorkforcePage,
  isDashboardMockPreviewEnabled
} from "./dashboardMockPreview"; // TEMPORARY — remove before raising the PR
import { DashboardWorkforceDrilldown } from "./DashboardWorkforceDrilldown";
import {
  formatBps,
  dashboardMetricPresentation,
  formatDashboardRatio,
  formatDashboardTimestamp,
  formatDays,
  formatNullablePaise,
  formatPaise,
  humanize,
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
const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" }
];
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
  return <CoverageChart eligible={eligible} tracked={tracked} unavailable={unavailable} module={module} dataQuality={dataQuality} />;
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

type MetricTone = "neutral" | "active" | "hold" | "done" | "overdue" | "risk";

function TabSummary({ tab, data }: { tab: Exclude<DashboardTab, "overview">; data: SuperAdminDashboardOverview }) {
  let cards: Array<{ label: string; value: string | number; detail?: string; tone?: MetricTone }> = [];
  let coverage: { eligible: number; tracked: number; unavailable: number } | null = null;
  if (tab === "projects") cards = [
    { label: "All projects", value: data.projects.total, tone: "neutral" }, { label: "Created in period", value: data.projects.createdInPeriod, tone: "neutral" },
    { label: "Planning", value: data.projects.planning, tone: "neutral" }, { label: "Active", value: data.projects.active, tone: "active" },
    { label: "On hold", value: data.projects.onHold, tone: "hold" }, { label: "Completed", value: data.projects.completed, tone: "done" },
    { label: "Live overdue", value: data.projects.liveOverdue, tone: "overdue" }, { label: "Completed late", value: data.projects.completedLate, tone: "overdue" },
    { label: "Completion rate", value: formatDashboardRatio(data.projects.completionRate), detail: ratioDetail(data.projects.completionRate, "projects") },
    { label: "Unique projects at risk", value: data.projects.atRisk, tone: "risk" }
  ];
  if (tab === "estimation") {
    coverage = { eligible: data.estimation.eligibleProjects, tracked: data.estimation.trackedProjects, unavailable: data.estimation.unavailableProjects };
    cards = [
      { label: "No estimate", value: data.estimation.noEstimate, tone: "neutral" }, { label: "Draft / internal", value: data.estimation.draftInternal, tone: "neutral" },
      { label: "Ready to send", value: data.estimation.readyToSend, tone: "active" }, { label: "Awaiting Client", value: data.estimation.awaitingClient, tone: "hold" },
      { label: "Changes requested", value: data.estimation.changesRequested, tone: "overdue" }, { label: "Client approved", value: data.estimation.clientApproved, tone: "done" },
      { label: "Approved net revenue, excluding GST", value: formatPaise(data.estimation.approvedSubtotalPaise), tone: "neutral" },
      { label: "Client-approved contract value, including GST", value: formatPaise(data.estimation.approvedContractTotalPaise), tone: "neutral" },
      { label: "Median waiting age", value: formatDays(data.estimation.medianWaitingAgeDays), tone: "neutral" },
      { label: "Oldest waiting age", value: formatDays(data.estimation.oldestWaitingAgeDays), tone: "hold" }
    ];
  }
  if (tab === "design") {
    coverage = { eligible: data.design.eligibleProjects, tracked: data.design.trackedProjects, unavailable: data.design.unavailableProjects };
    cards = [
      { label: "Pending assignment", value: data.design.pendingAssignment, tone: "hold" }, { label: "Assigned", value: data.design.assigned, tone: "neutral" },
      { label: "In progress", value: data.design.inProgress, tone: "active" }, { label: "Ready for Client", value: data.design.readyForClient, tone: "active" },
      { label: "Changes requested", value: data.design.changesRequested, tone: "overdue" }, { label: "Approved", value: data.design.approved, tone: "done" },
      { label: "Approval rate", value: formatDashboardRatio(data.design.approvalRate), detail: ratioDetail(data.design.approvalRate, "eligible plans") },
      { label: "Oldest pending review", value: formatDays(data.design.oldestPendingReviewAgeDays), tone: "hold" },
      { label: "Failed deliveries", value: data.design.failedDeliveryCount, tone: "risk" }, { label: "Disabled deliveries", value: data.design.disabledDeliveryCount, tone: "overdue" }
    ];
  }
  if (tab === "procurement") {
    coverage = { eligible: data.procurement.eligibleProjects, tracked: data.procurement.trackedProjects, unavailable: data.procurement.unavailableProjects };
    cards = [
      { label: "Not started", value: data.procurement.notStarted, tone: "neutral" }, { label: "Open", value: data.procurement.open, tone: "hold" },
      { label: "In progress", value: data.procurement.inProgress, tone: "active" }, { label: "Completed", value: data.procurement.completed, tone: "done" },
      { label: "Average persisted progress", value: formatDashboardRatio(data.procurement.averageProgress), detail: ratioDetail(data.procurement.averageProgress, "tracked tasks") },
      { label: "Approved procurement amount", value: formatNullablePaise(data.procurement.plannedAmountPaise), tone: "neutral" },
      { label: "Posted procurement spend", value: formatPaise(data.procurement.postedSpendPaise), tone: "neutral" },
      { label: "Variance", value: formatNullablePaise(data.procurement.variancePaise), tone: "overdue" }
    ];
  }
  if (tab === "finance") cards = [
    { label: "Client-approved contract value, including GST", value: formatPaise(data.finance.approvedContractTotalPaise), tone: "neutral" },
    { label: "Approved net revenue, excluding GST", value: formatPaise(data.finance.approvedSubtotalPaise), tone: "neutral" },
    { label: "GST", value: formatPaise(data.finance.approvedGstPaise), tone: "neutral" }, { label: "Target profit", value: formatPaise(data.finance.targetProfitPaise), tone: "neutral" },
    { label: "Cost budget", value: formatPaise(data.finance.costBudgetPaise), tone: "neutral" }, { label: "Recorded expenses", value: formatPaise(data.finance.recordedCostPaise), tone: "neutral" },
    { label: "Recorded overheads", value: formatPaise(data.finance.overheadPaise), tone: "neutral" }, { label: "Current profit (live)", value: formatPaise(data.finance.currentProfitPaise), tone: "done" },
    { label: "Current margin", value: formatBps(data.finance.currentMarginBps), tone: "done" }, { label: "Budget exceptions", value: data.finance.overBudgetProjectCount, tone: "risk" }
  ];
  if (tab === "execution") cards = [
    { label: "All execution tasks", value: data.execution.total, tone: "neutral" }, { label: "Open", value: data.execution.open, tone: "hold" },
    { label: "In progress", value: data.execution.inProgress, tone: "active" }, { label: "Completed", value: data.execution.completed, tone: "done" },
    { label: "Completed in period", value: data.execution.completedInPeriod, tone: "done" }, { label: "Overdue incomplete", value: data.execution.overdue, tone: "overdue" },
    { label: "Unassigned", value: data.execution.unassigned, tone: "hold" }, { label: "Unassigned overdue", value: data.execution.overdueUnassigned, tone: "risk" },
    { label: "Weighted progress", value: formatDashboardRatio(data.execution.weightedProgress), detail: `${ratioDetail(data.execution.weightedProgress, "effort units")} · ${data.execution.weightedProgress.fallbackTaskCount} fallback tasks` }
  ];
  if (tab === "workforce") cards = [
    { label: "Active workers", value: data.workforce.activeWorkers, tone: "active" }, { label: "Workers with assignments", value: data.workforce.assignedWorkers, tone: "done" },
    { label: "Unassigned workers", value: data.workforce.unassignedWorkers, tone: "hold" }, { label: "Active assigned tasks", value: data.workforce.activeAssignedTaskCount, tone: "neutral" },
    { label: "Active unassigned tasks", value: data.workforce.activeUnassignedTaskCount, tone: "hold" }, { label: "Tasks completed in period", value: data.workforce.completedInPeriodTaskCount, tone: "done" },
    { label: "Average calculated KPI", value: formatDashboardRatio(data.workforce.averageKpi), detail: ratioDetail(data.workforce.averageKpi, "eligible workers") },
    { label: "KPI eligible", value: data.workforce.kpiEligibleWorkers, tone: "neutral" }, { label: "No KPI data", value: data.workforce.kpiUnavailableWorkers, tone: "overdue" },
    { label: "Over capacity", value: data.workforce.capacityAvailable ? (data.workforce.overCapacityWorkers ?? "Not available") : "Not available", detail: data.workforce.capacityAvailable ? undefined : "No authoritative capacity denominator", tone: "overdue" },
    { label: "Inactive assignee exceptions", value: data.workforce.inactiveAssigneeTaskCount, tone: "risk" }
  ];
  if (tab === "risk") cards = [
    { label: "Red-risk projects", value: data.risk.projectDistribution.red, tone: "risk" }, { label: "Yellow-risk projects", value: data.risk.projectDistribution.yellow, tone: "overdue" },
    { label: "Clear projects", value: data.risk.projectDistribution.green, tone: "done" }, { label: "Not tracked", value: data.risk.projectDistribution.gray, tone: "neutral" },
    { label: "Unique projects at risk", value: data.projects.atRisk, tone: "risk" }
  ];
  return <section className="dashboard-tab-summary" aria-label={`${humanize(tab)} summary`}>{coverage ? <CoverageDetail {...coverage} module={tab} dataQuality={data.dataQuality} /> : null}<DashboardModuleCharts tab={tab} data={data} /><div className="dashboard-metric-grid">{cards.map((card) => {
    const presentation = dashboardMetricPresentation(
      data.dataQuality,
      tabMetricKey(tab, card.label),
      card.value,
      card.detail
    );
    return <MetricCard key={card.label} label={card.label} value={presentation.value} detail={presentation.detail} tone={card.tone} />;
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
  // MOCK PREVIEW — TEMPORARY, remove before raising the PR (see dashboardMockPreview.ts).
  const overview = useQuery({
    queryKey: dashboardKeys.overview(periodDays),
    queryFn: () => isDashboardMockPreviewEnabled() ? Promise.resolve(dashboardMockOverview) : getSuperAdminDashboardOverview(periodDays),
    staleTime: 30_000, refetchOnWindowFocus: true
  });
  const projects = useQuery({
    queryKey: dashboardKeys.projects(periodDays, projectFilters),
    queryFn: () => isDashboardMockPreviewEnabled() ? Promise.resolve(dashboardMockProjectsPage) : getSuperAdminDashboardProjects(periodDays, projectFilters),
    enabled: PROJECT_TABS.includes(tab as never), staleTime: 30_000,
    refetchOnWindowFocus: true, placeholderData: keepPreviousData
  });
  const workforce = useQuery({
    queryKey: dashboardKeys.workforce(periodDays, workforceFilters),
    queryFn: () => isDashboardMockPreviewEnabled() ? Promise.resolve(dashboardMockWorkforcePage) : getSuperAdminDashboardWorkforce(periodDays, workforceFilters),
    enabled: tab === "workforce", staleTime: 30_000,
    refetchOnWindowFocus: true, placeholderData: keepPreviousData
  });
  // END MOCK PREVIEW

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
      <PageHeader id="super-admin-dashboard-title" eyebrow="Super Admin command center" title="Organization dashboard" description="Organization-wide metrics and explainable risk. Overview totals are not changed by drill-down filters." metadata={<div className="dashboard-freshness"><span>Updated {formatDashboardTimestamp(data.observedAt)}</span>{refreshing ? <span role="status">Refreshing dashboard…</span> : null}</div>} actions={<><SelectMenu id="dashboard-period" className="dashboard-period" label="Period" value={String(periodDays)} options={PERIOD_OPTIONS} onChange={(value) => setQuery({ periodDays: value, offset: undefined })} /><Button variant="secondary" disabled={manualRefresh} aria-label="Refresh dashboard" onClick={() => void refresh()}><RefreshCw aria-hidden="true" />{manualRefresh ? "Refreshing…" : "Refresh"}</Button></>} />
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {data.dataQuality.status === "partial" ? <InlineMessage tone="warning"><strong>Some dashboard metrics are unavailable.</strong> {Array.from(new Set(data.dataQuality.issues.map((issue) => issue.message))).join(" ")}</InlineMessage> : null}
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
