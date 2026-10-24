import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { WorkerRole } from "../../../api/authorization-contract";
import type { ProjectStatus } from "../../../api/types";
import { InlineMessage } from "../../../components/ui/InlineMessage";
import { PageHeader } from "../../../components/ui/PageHeader";
import { PageState } from "../../../components/ui/PageState";
import { SectionState } from "../../../components/ui/SectionState";
import { Surface } from "../../../components/ui/Surface";
import { DesignPaymentConfirmations } from "../../finance/DesignPaymentConfirmations";
import { vendorBasketRequestKeys } from "../../procurement/vendorBasketRequestApi";
import { DashboardTabSummary } from "./DashboardTabSummary";
import { DashboardOverview } from "./DashboardOverview";
import { DashboardProjectDrilldown } from "./DashboardProjectDrilldown";
import { DashboardWorkforceDrilldown } from "./DashboardWorkforceDrilldown";
import { dashboardMetricPresentation, formatDashboardTimestamp, humanize, isDashboardMetricUnavailable } from "./dashboardPresentation";
import { useAuth } from "../../../auth/AuthProvider";
import { hasFrontendPermission } from "../../../auth/authorization";
import { Button } from "../../../components/ui/Button";
import { useVendorBasketRequestCount } from "../../procurement/useVendorBasketRequestCount";
import { dashboardDetailHref, metricsTable, type DashboardDetailTarget } from "./dashboardViewModel";
import { projectWorkflowKeys, type DesignPaymentConfirmation } from "../../workflow/projectWorkflowApi";
import { downloadDashboardReport, type DashboardReportSection } from "./dashboardReportExport";
import { getDashboardChartTables } from "./dashboardChartData";
import { getDashboardPendingActions } from "./DashboardOverview";
import { projectReportTable, workforceReportTable, reportSection } from "./dashboardReportSections";
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

const queryKeys = ["projectStatus", "moduleStatus", "riskLevel", "riskFactor", "role", "assignmentState", "capacityState", "kpiAvailability", "search", "sort", "offset"];

export function SuperAdminDashboardPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [exportError, setExportError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const tab = normalizeDashboardTab(params.get("tab"));
  const periodDays = normalizeDashboardPeriod(params.get("periodDays"));
  const showComparison = params.get("comparison") !== "off";
  const projectFilters = projectFiltersFromUrl(params, tab);
  const workforceFilters = workforceFiltersFromUrl(params);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const dashboardHeading = useRef<HTMLHeadingElement>(null);
  const previousTab = useRef(tab);
  const returnPoint = useRef<{ id: string; scrollY: number } | null>(null);
  const [manualRefresh, setManualRefresh] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const overview = useQuery({
    queryKey: dashboardKeys.overview(periodDays), queryFn: () => getSuperAdminDashboardOverview(periodDays),
    staleTime: 30_000, refetchOnWindowFocus: true, placeholderData: keepPreviousData
  });
  const projects = useQuery({
    queryKey: dashboardKeys.projects(periodDays, projectFilters), queryFn: () => getSuperAdminDashboardProjects(periodDays, projectFilters),
    enabled: PROJECT_TABS.includes(tab as never), staleTime: 30_000,
    refetchOnWindowFocus: true
  });
  const priorityFilters: DashboardProjectFilters = { module: "projects", sort: "risk_desc", limit: 5, offset: 0 };
  const priorityProjects = useQuery({
    queryKey: dashboardKeys.projects(periodDays, priorityFilters),
    queryFn: () => getSuperAdminDashboardProjects(periodDays, priorityFilters),
    enabled: tab === "overview", staleTime: 30_000, refetchOnWindowFocus: true
  });
  const canReviewVendorRequests = auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.read");
  const vendorRequestCount = useVendorBasketRequestCount(tab === "overview" && canReviewVendorRequests);
  const canReadPayments = auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "projects.design_workflow.payments.read");
  const workforce = useQuery({
    queryKey: dashboardKeys.workforce(periodDays, workforceFilters), queryFn: () => getSuperAdminDashboardWorkforce(periodDays, workforceFilters),
    enabled: tab === "workforce", staleTime: 30_000,
    refetchOnWindowFocus: true
  });

  const setQuery = (updates: Record<string, string | number | undefined>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) value === undefined || value === "" ? next.delete(key) : next.set(key, String(value));
    setParams(next, { replace });
  };
  const openDetail = (target: DashboardDetailTarget, originId: string) => {
    returnPoint.current = { id: originId, scrollY: window.scrollY };
    navigate(dashboardDetailHref(target, periodDays, showComparison));
  };
  const captureDetailOrigin = (event: MouseEvent<HTMLElement>) => {
    if (tab !== "overview" || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-dashboard-origin]");
    if (link) returnPoint.current = { id: link.dataset.dashboardOrigin!, scrollY: window.scrollY };
  };
  const backToDashboard = () => {
    const next = new URLSearchParams(params);
    next.delete("tab"); next.delete("section");
    for (const key of queryKeys) next.delete(key);
    setParams(next);
  };
  useEffect(() => {
    if (!overview.data) return;
    const changedView = previousTab.current !== tab;
    previousTab.current = tab;
    if (!changedView) return;
    const frame = requestAnimationFrame(() => {
      if (tab === "overview") {
        const point = returnPoint.current;
        const target = point ? document.getElementById(point.id) : null;
        (target ?? dashboardHeading.current)?.focus({ preventScroll: true });
        window.scrollTo({ top: point?.scrollY ?? 0, behavior: "instant" });
      } else {
        panelHeading.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, Boolean(overview.data)]);
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
    if (tab === "overview") requests.push(priorityProjects.refetch());
    if (canReadPayments && (tab === "overview" || tab === "finance")) requests.push(queryClient.refetchQueries(
      { queryKey: projectWorkflowKeys.paymentConfirmations, type: "active" }, { throwOnError: true }
    ).then(() => ({ isError: false }), () => ({ isError: true })));
    if (tab === "overview" && canReviewVendorRequests) requests.push(queryClient.refetchQueries(
      { queryKey: vendorBasketRequestKeys.review, type: "active" }, { throwOnError: true }
    ).then(() => ({ isError: false }), () => ({ isError: true })));
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
  const paymentView = tab === "finance" && params.get("section") === "payments";
  const detailTitle = paymentView ? "Initial payment review" : tab === "risk" && projectFilters.riskFactor === "schedule" ? "Schedule risk" : humanize(tab);
  const refreshing = overview.isFetching || projects.isFetching || workforce.isFetching || priorityProjects.isFetching || manualRefresh;

  const detailPending = tab === "overview" ? priorityProjects.isPending : tab === "workforce" ? workforce.isPending : projects.isPending;
  const canExport = !overview.isPlaceholderData && data.period.days === periodDays && !detailPending;
  const exportReport = () => {
    if (!canExport) return;
    setExportError(null);
    const sections: DashboardReportSection[] = [reportSection("summary", "Organization summary and charts", overview, [metricsTable(tab, data, showComparison), ...getDashboardChartTables(tab, data, showComparison)])];
    if (tab === "overview") {
      const canReadClientResponses = hasFrontendPermission(auth.authorization, "estimation.client_response_tasks.read");
      const designResponses = dashboardMetricPresentation(data.dataQuality, "governance.pendingDesignResponses", data.governance.pendingDesignResponses);
      sections[0].tables.push({ title: "Pending actions", columns: ["Action", "Items", "Status", "Context"], rows: [
        ...getDashboardPendingActions(data, { canReadClientResponses, showComparison }).map((item) => [item.label, item.value, item.status, item.detail ?? ""]),
        ["Pending design responses", designResponses.value, designResponses.unavailable ? "Unavailable" : designResponses.value === 0 ? "No current items" : "Requires review", designResponses.detail ?? ""]
      ] });
      const priority = reportSection("priority-projects", "Priority projects", priorityProjects, priorityProjects.data ? [projectReportTable("overview", priorityProjects.data)] : []);
      if (priorityProjects.data) priority.pagination = { ...priorityProjects.data.pagination, loaded: Math.min(5, priorityProjects.data.items.length) };
      sections.push(priority);
      if (canReadPayments) {
        const payment = queryClient.getQueryState<DesignPaymentConfirmation[]>(projectWorkflowKeys.paymentConfirmations);
        sections.push({
          id: "payment-confirmations", label: "Initial payment confirmations",
          state: payment?.data ? payment.status === "error" ? "stale" : "ready" : payment?.status === "error" ? "unavailable" : "loading",
          observedAt: null, fetchedAt: payment?.dataUpdatedAt ? new Date(payment.dataUpdatedAt).toISOString() : null, period: null,
          reason: payment?.status === "error" ? "Payment confirmations could not be refreshed." : undefined,
          tables: [{ title: "Initial payment confirmations", columns: ["Awaiting confirmation"], rows: [[payment?.data ? payment.data.filter((item) => !item.confirmedAt).length : null]] }]
        });
      }
      if (canReviewVendorRequests) sections.push({
        id: "vendor-requests", label: "Vendor classification requests",
        state: vendorRequestCount.data === undefined ? vendorRequestCount.isPending ? "loading" : "unavailable" : vendorRequestCount.isError ? "stale" : "ready",
        observedAt: null, fetchedAt: vendorRequestCount.dataUpdatedAt ? new Date(vendorRequestCount.dataUpdatedAt).toISOString() : null, period: null,
        reason: vendorRequestCount.isError ? "Latest count refresh failed." : undefined,
        tables: [{ title: "Vendor classification requests", columns: ["Pending requests"], rows: [[vendorRequestCount.data ?? null]] }]
      });
    } else if (tab === "workforce") {
      const detail = reportSection("workforce", "Workforce current page", workforce, workforce.data ? [workforceReportTable(workforce.data)] : []);
      if (workforce.data) detail.pagination = { ...workforce.data.pagination, loaded: workforce.data.items.length };
      sections.push(detail);
    } else {
      const detail = reportSection("projects", `${humanize(tab)} current page`, projects, projects.data ? [projectReportTable(tab, projects.data)] : []);
      if (projects.data) detail.pagination = { ...projects.data.pagination, loaded: projects.data.items.length };
      sections.push(detail);
    }
    try {
      downloadDashboardReport({ tab, requestedPeriodDays: periodDays, comparisonEnabled: showComparison, exportedAt: new Date().toISOString(), filters: tab === "overview" ? {} : tab === "workforce" ? { ...workforceFilters } : { ...projectFilters }, sections });
      setAnnouncement("Dashboard report downloaded.");
    } catch {
      setExportError("The report could not be downloaded. Try again.");
    }
  };

  return (
    <section className="super-admin-dashboard" aria-labelledby="super-admin-dashboard-title" onClickCapture={captureDetailOrigin}>
      <PageHeader id="super-admin-dashboard-title" title="Dashboard" actions={<Button className="dashboard-export" disabled={!canExport} onClick={exportReport}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5" /></svg>
        Export Report
      </Button>} />
      <div className="dashboard-toolbar">
        <div className="dashboard-freshness"><span>Super Admin · Updated {formatDashboardTimestamp(data.observedAt)} UTC</span>{refreshing ? <span role="status">Refreshing dashboard…</span> : null}</div>
        <div className="dashboard-toolbar__controls">
          <label className="dashboard-period"><span>Reporting period</span><select aria-label="Reporting period" value={periodDays} onChange={(event) => setQuery({ periodDays: event.target.value, offset: undefined })}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
          <label className="dashboard-comparison-toggle"><input type="checkbox" checked={showComparison} onChange={(event) => setQuery({ comparison: event.target.checked ? undefined : "off" })} /><span>Compare with previous period</span></label>
          <Button variant="secondary" aria-label="Refresh dashboard" busy={manualRefresh} onClick={() => void refresh()}>Refresh</Button>
        </div>
      </div>
      {exportError ? <InlineMessage tone="error">{exportError}</InlineMessage> : null}
      {overview.isPlaceholderData ? <InlineMessage tone="warning">Loading the selected period. The last observed summary remains visible; export is unavailable until the new period arrives.</InlineMessage> : null}
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {overview.isError && overview.data ? <InlineMessage tone="error">The latest refresh failed. Showing the last successfully observed dashboard.</InlineMessage> : null}
      {tab !== "overview" ? <div className="dashboard-detail-navigation"><Button variant="secondary" onClick={backToDashboard}>Back to dashboard</Button><span>Dashboard / {detailTitle}</span></div> : null}
      <section id={`dashboard-panel-${tab}`} aria-labelledby={`dashboard-heading-${tab}`} aria-busy={refreshing || undefined} className="dashboard-panel">
        <h2 id={`dashboard-heading-${tab}`} className={tab === "overview" ? "dashboard-panel-heading--overview" : undefined} ref={tab === "overview" ? dashboardHeading : panelHeading} tabIndex={-1}>{detailTitle}</h2>
        {tab === "overview" ? <>{data.projects.total === 0 && !isDashboardMetricUnavailable(data.dataQuality, "projects.total") ? <Surface as="section" variant="subtle"><p>No projects yet. Organization risk remains not tracked until eligible signals exist.</p></Surface> : null}<DashboardOverview data={data} navigationPeriodDays={periodDays} showComparison={showComparison} priorityProjects={priorityProjects} vendorRequestCount={canReviewVendorRequests ? vendorRequestCount : undefined} onOpenDetail={openDetail} paymentSummary={<DesignPaymentConfirmations summaryHref={dashboardDetailHref({ tab: "finance", section: "payments" }, periodDays, showComparison)} />} /></> : <>{paymentView ? <div id="dashboard-payment-details"><DesignPaymentConfirmations /></div> : null}<DashboardTabSummary tab={tab} data={data} showComparison={showComparison} />{tab === "finance" && !paymentView ? <div id="dashboard-payment-details"><DesignPaymentConfirmations /></div> : null}</>}
        {PROJECT_TABS.includes(tab as never) ? projects.isPending ? <SectionState state="loading" message={`Loading ${tab} project details…`} /> : projects.isError && !projects.data ? <SectionState state="error" message={`${humanize(tab)} project details could not be loaded.`} action={{ label: "Try again", onAction: () => void projects.refetch() }} /> : projects.data ? <>{projects.isError ? <InlineMessage tone="error">The latest project refresh failed. Showing the previous page.</InlineMessage> : null}{projects.data.dataQuality.status === "partial" ? <InlineMessage tone="warning">Some project rows are unavailable because their identity or lineage could not be verified.</InlineMessage> : null}<DashboardProjectDrilldown tab={tab as (typeof PROJECT_TABS)[number]} filters={projectFilters} page={projects.data} refreshing={projects.isFetching} onFiltersChange={replaceFilters} onPageChange={(offset) => setQuery({ offset })} /></> : null : null}
        {tab === "workforce" ? workforce.isPending ? <SectionState state="loading" message="Loading workforce details…" /> : workforce.isError && !workforce.data ? <SectionState state="error" message="Workforce details could not be loaded." action={{ label: "Try again", onAction: () => void workforce.refetch() }} /> : workforce.data ? <>{workforce.isError ? <InlineMessage tone="error">The latest workforce refresh failed. Showing the previous page.</InlineMessage> : null}{workforce.data.dataQuality.status === "partial" ? <InlineMessage tone="warning">Some workforce rows are unavailable because their identity could not be verified.</InlineMessage> : null}<DashboardWorkforceDrilldown filters={workforceFilters} page={workforce.data} refreshing={workforce.isFetching} onFiltersChange={replaceFilters} onPageChange={(offset) => setQuery({ offset })} /></> : null : null}
      </section>
    </section>
  );
}
