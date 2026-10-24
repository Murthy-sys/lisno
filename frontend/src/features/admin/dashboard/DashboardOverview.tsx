import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../../auth/AuthProvider";
import { hasFrontendPermission } from "../../../auth/authorization";
import { Surface } from "../../../components/ui/Surface";
import { DashboardMetricStrip } from "./DashboardMetricStrip";
import { DashboardPriorityProjects } from "./DashboardPriorityProjects";
import { VendorClassificationRequestQueueItem } from "./VendorClassificationRequestQueueItem";
import { ProjectActivityChart, PeriodActivityComparisonChart, ProjectStatusChart, RecordedCostActivityChart } from "./ExecutiveDashboardCharts";
import { DashboardActivityHeatmap } from "./DashboardActivityHeatmap";
import { dashboardMetricPresentation, formatBps, formatDashboardDate, formatDashboardTimestamp, formatPaise, isDashboardMetricUnavailable, workerRoleLabel } from "./dashboardPresentation";
import { dashboardDetailHref, getAvailableDashboardMetrics, type DashboardDetailTarget, type DashboardPriorityQuery, type DashboardVendorQuery } from "./dashboardViewModel";
import { getVisibleDashboardChartDataset, lifecycleDataset, periodActivityComparisonDataset, projectActivityDataset, projectCreationHeatmapDataset, recordedExpenseDataset } from "./dashboardChartData";
import type { DashboardDataQuality, DashboardProjectModuleStatus, DashboardTab, SuperAdminDashboardOverview } from "./superAdminDashboardApi";

const dashboardHref = (tab: DashboardTab, days: number, showComparison: boolean) =>
  `/admin/dashboard?tab=${tab}&periodDays=${days}${showComparison ? "" : "&comparison=off"}`;

function safeValue(dataQuality: DashboardDataQuality, metricKey: string, value: string | number, detail?: string) {
  return dashboardMetricPresentation(dataQuality, metricKey, value, detail);
}

function hasValue(data: SuperAdminDashboardOverview, key: string, value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && !isDashboardMetricUnavailable(data.dataQuality, key);
}

export function getDashboardPendingActions(data: SuperAdminDashboardOverview, {
  canReadClientResponses,
  showComparison = true
}: { canReadClientResponses: boolean; showComparison?: boolean }) {
  const days = data.period.days;
  const items = [
    { label: "Red-risk projects", value: data.risk.projectDistribution.red, key: "risk.projectDistribution", href: dashboardHref("risk", days, showComparison), tone: "danger" },
    { label: "Live overdue projects", value: data.projects.liveOverdue, key: "projects.liveOverdue", href: dashboardHref("projects", days, showComparison), tone: "danger" },
    { label: "Overdue execution tasks", value: data.execution.overdue, key: "execution.overdue", href: dashboardHref("execution", days, showComparison), tone: "danger" },
    { label: "Budget exceptions", value: data.finance.overBudgetProjectCount, key: "finance.overBudgetProjectCount", href: dashboardHref("finance", days, showComparison), tone: "warning" },
    { label: "Pending Client responses", value: data.governance.pendingClientResponses, key: "governance.pendingClientResponses", href: canReadClientResponses ? "/admin/client-responses" : null, tone: "neutral" },
    { label: "Failed Client deliveries", value: data.governance.failedClientDeliveries, key: "governance.failedClientDeliveries", href: canReadClientResponses ? "/admin/client-responses" : null, tone: "danger" }
  ];
  return items.map((item) => {
    const presentation = safeValue(data.dataQuality, item.key, item.value);
    return {
      ...item,
      ...presentation,
      tone: presentation.unavailable || item.value === 0 ? "neutral" : item.tone,
      status: presentation.unavailable ? "Unavailable" : item.value === 0 ? "No current items" : "Requires review"
    };
  });
}


function DetailLink({ target, origin, data, periodDays = data.period.days, showComparison, className, children }: {
  target: DashboardDetailTarget; origin: string; data: SuperAdminDashboardOverview; periodDays?: number; showComparison: boolean; className?: string; children: ReactNode;
}) {
  return <Link id={origin} data-dashboard-origin={origin} className={className} to={dashboardDetailHref(target, periodDays, showComparison)}>{children}</Link>;
}

function Ring({ percent, value }: { percent: number | null; value: string }) {
  return <span className="dashboard-ring-graphic">
    {percent !== null ? <svg viewBox="0 0 100 100" aria-hidden="true"><circle className="dashboard-ring-track" cx="50" cy="50" r="41" pathLength="100" /><circle className="dashboard-ring-fill" cx="50" cy="50" r="41" pathLength="100" strokeDasharray={`${percent} ${100 - percent}`} transform="rotate(-90 50 50)" /></svg> : null}
    <strong className="dashboard-ring-value">{value}</strong>
  </span>;
}

function ModuleRings({ data, periodDays, showComparison }: { data: SuperAdminDashboardOverview; periodDays: number; showComparison: boolean }) {
  const ratios = [
    { tab: "design" as const, label: "Design approval", key: "design.approvalRate", ratio: data.design.approvalRate },
    { tab: "procurement" as const, label: "Procurement progress", key: "procurement.averageProgress", ratio: data.procurement.averageProgress },
    { tab: "execution" as const, label: "Execution progress", key: "execution.weightedProgress", ratio: data.execution.weightedProgress }
  ].filter((item) => hasValue(data, item.key, item.ratio.rateBps) && item.ratio.denominator > 0);
  const estimationAvailable = hasValue(data, "estimation.clientApproved", data.estimation.clientApproved);
  if (!estimationAvailable && !ratios.length) return null;
  const tracked = hasValue(data, "estimation.trackedProjects", data.estimation.trackedProjects) ? data.estimation.trackedProjects : null;
  const estimationPercent = tracked !== null && tracked > 0 && data.estimation.clientApproved >= 0 && data.estimation.clientApproved <= tracked ? data.estimation.clientApproved * 100 / tracked : null;
  return <Surface as="section" className="dashboard-visual-panel dashboard-visual-panel--modules" aria-labelledby="dashboard-module-rings-heading">
    <div className="dashboard-section-heading"><h3 id="dashboard-module-rings-heading">Module progress</h3><span>Current portfolio</span></div>
    <div className="dashboard-module-rings">
      {estimationAvailable ? <DetailLink target={{ tab: "estimation" }} origin="dashboard-module-estimation" data={data} periodDays={periodDays} showComparison={showComparison} className="dashboard-module-ring">
        <Ring percent={estimationPercent} value={data.estimation.clientApproved.toLocaleString("en-IN")} /><span className="dashboard-ring-label">Estimation approvals</span><small className="dashboard-ring-context">{tracked === null ? "Client approved" : `${data.estimation.clientApproved} of ${tracked} tracked`}</small>
      </DetailLink> : null}
      {ratios.map((item) => <DetailLink key={item.tab} target={{ tab: item.tab }} origin={`dashboard-module-${item.tab}`} data={data} periodDays={periodDays} showComparison={showComparison} className="dashboard-module-ring">
        <Ring percent={item.ratio.rateBps! >= 0 && item.ratio.rateBps! <= 10_000 ? item.ratio.rateBps! / 100 : null} value={formatBps(item.ratio.rateBps)} /><span className="dashboard-ring-label">{item.label}</span><small className="dashboard-ring-context">{item.tab === "procurement" ? `Average across ${item.ratio.denominator} tracked tasks` : `${item.ratio.numerator} of ${item.ratio.denominator} ${item.tab === "execution" ? "effort units" : "eligible plans"}`}</small>
      </DetailLink>)}
    </div>
  </Surface>;
}

function WorkforcePanel({ data, periodDays, showComparison }: { data: SuperAdminDashboardOverview; periodDays: number; showComparison: boolean }) {
  const total = hasValue(data, "workforce.activeWorkers", data.workforce.activeWorkers) ? data.workforce.activeWorkers : null;
  const sourceRoles = isDashboardMetricUnavailable(data.dataQuality, "workforce.roleDistribution") ? null : data.workforce.roleDistribution;
  const roles = sourceRoles?.filter((role) => hasValue(data, `workforce.roleDistribution.${role.role}`, role.workerCount) && role.workerCount >= 0) ?? [];
  const complete = total !== null && sourceRoles !== null && roles.length === sourceRoles.length && roles.reduce((sum, role) => sum + role.workerCount, 0) === total;
  const kpi = hasValue(data, "workforce.averageKpi", data.workforce.averageKpi.rateBps) && data.workforce.averageKpi.denominator > 0 ? data.workforce.averageKpi.rateBps : null;
  if (total === null && !roles.length && kpi === null) return null;
  const max = Math.max(1, ...roles.map((role) => role.workerCount));
  let offset = 0;
  return <Surface as="section" className="dashboard-visual-panel dashboard-visual-panel--workforce" aria-labelledby="dashboard-workforce-heading">
    <div className="dashboard-section-heading"><h3 id="dashboard-workforce-heading">Workforce summary</h3><DetailLink target={{ tab: "workforce" }} origin="dashboard-workforce-details" data={data} periodDays={periodDays} showComparison={showComparison}>View workforce</DetailLink></div>
    <div className="dashboard-workforce-layout">
      {total !== null ? <DetailLink target={{ tab: "workforce" }} origin="dashboard-workforce-total" data={data} periodDays={periodDays} showComparison={showComparison} className="dashboard-workforce-ring">
        {complete ? <svg viewBox="0 0 100 100" aria-hidden="true"><circle className="dashboard-ring-track" cx="50" cy="50" r="41" pathLength="100" />{roles.map((role, index) => {
          const share = total > 0 ? role.workerCount * 100 / total : 0;
          const start = offset; offset += share;
          return <circle key={role.role} cx="50" cy="50" r="41" pathLength="100" fill="none" strokeWidth="12" style={{ stroke: `var(--chart-series-${index % 4 + 1})` }} strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 50 50)" />;
        })}</svg> : null}
        <span><strong>{total.toLocaleString("en-IN")}</strong><span>Active workers</span></span>
      </DetailLink> : null}
      {roles.length ? <ul className="dashboard-workforce-roles">{roles.map((role) => <li key={role.role}><DetailLink target={{ tab: "workforce", role: role.role }} origin={`dashboard-workforce-${role.role}`} data={data} periodDays={periodDays} showComparison={showComparison} className="dashboard-workforce-role">
        <span>{workerRoleLabel(role.role)}</span><strong>{role.workerCount}</strong><span className="dashboard-workforce-role-track" aria-hidden="true"><i style={{ width: `${role.workerCount * 100 / max}%` }} /></span>
      </DetailLink></li>)}</ul> : null}
    </div>
    {kpi !== null ? <p className="dashboard-support-note">Average calculated KPI <strong>{formatBps(kpi)}</strong></p> : null}
  </Surface>;
}

function FinancePanel({ data, periodDays, showComparison }: { data: SuperAdminDashboardOverview; periodDays: number; showComparison: boolean }) {
  const expenseChart = getVisibleDashboardChartDataset(recordedExpenseDataset(data));
  const facts = [
    ["Cost budget", "finance.costBudgetPaise", data.finance.costBudgetPaise],
    ["Recorded expenses", "finance.recordedCostPaise", data.finance.recordedCostPaise],
    [data.finance.remainingBudgetPaise < 0 ? "Overspent" : "Remaining budget", "finance.remainingBudgetPaise", data.finance.remainingBudgetPaise]
  ] as const;
  const costs = [
    ["Procurement", "finance.procurementCostPaise", data.finance.procurementCostPaise],
    ["Employee payments", "finance.employeePaymentPaise", data.finance.employeePaymentPaise],
    ["Other expenses", "finance.otherExpensePaise", data.finance.otherExpensePaise],
    ["Overheads", "finance.overheadPaise", data.finance.overheadPaise]
  ] as const;
  const availableFacts = facts.filter(([, key, value]) => hasValue(data, key, value));
  const availableCosts = costs.filter(([, key, value]) => hasValue(data, key, value));
  if (!expenseChart && !availableFacts.length && !availableCosts.length) return null;
  return <Surface as="section" className="dashboard-visual-panel dashboard-visual-panel--finance" aria-labelledby="dashboard-financial-heading">
    <div className="dashboard-section-heading"><h3 id="dashboard-financial-heading">Financial overview</h3><DetailLink target={{ tab: "finance" }} origin="dashboard-finance-details" data={data} periodDays={periodDays} showComparison={showComparison}>Finance details</DetailLink></div>
    {expenseChart ? <RecordedCostActivityChart data={data} compact /> : null}
    {availableFacts.length ? <dl className="dashboard-finance-stats">{availableFacts.map(([label, key, value]) => <div key={key}><dt>{label}</dt><dd>{formatPaise(value)}</dd></div>)}</dl> : null}
    {availableCosts.length ? <dl className="dashboard-finance-costs" aria-label="Recorded cost composition">{availableCosts.map(([label, key, value]) => <div key={key}><dt>{label}</dt><dd>{formatPaise(value)}</dd></div>)}</dl> : null}
    <p className="dashboard-support-note">Current finance snapshot. Expense chart uses the selected reporting period.</p>
  </Surface>;
}

function ClientSummary({ data, canReadUsers }: { data: SuperAdminDashboardOverview; canReadUsers: boolean }) {
  const clients = data.clients;
  if (!clients) return null;
  const facts = [
    { label: "Registered clients", key: "clients.registeredAccounts", value: clients.registeredAccounts, available: clients.accountsStatus === "available" },
    { label: "Active clients", key: "clients.activeAccounts", value: clients.activeAccounts, available: clients.accountsStatus === "available" },
    { label: "Linked to projects", key: "clients.clientsWithProjects", value: clients.clientsWithProjects, available: clients.relationshipsStatus === "available" }
  ].filter((fact) => fact.available && hasValue(data, fact.key, fact.value));
  if (!facts.length) return null;
  return <section className="dashboard-visual-client-summary" aria-label="Client accounts"><dl>{facts.map((fact) => <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>{canReadUsers ? <Link to="/admin/users">Client directory</Link> : null}</section>;
}

function OperationalActions({ data, periodDays, showComparison, canReadClientResponses, canReadDesignResponses, vendorRequestCount }: {
  data: SuperAdminDashboardOverview; periodDays: number; showComparison: boolean; canReadClientResponses: boolean; canReadDesignResponses: boolean; vendorRequestCount?: DashboardVendorQuery;
}) {
  const targets: Record<string, DashboardDetailTarget> = {
    "risk.projectDistribution": { tab: "risk", riskLevel: "red" },
    "projects.liveOverdue": { tab: "risk", riskFactor: "schedule", sort: "deadline_asc" },
    "execution.overdue": { tab: "execution", moduleStatus: "overdue" },
    "finance.overBudgetProjectCount": { tab: "finance", moduleStatus: "over_budget" }
  };
  const items = getDashboardPendingActions(data, { canReadClientResponses, showComparison }).filter((item) => !item.unavailable && hasValue(data, item.key === "risk.projectDistribution" ? "risk.projectDistribution.red" : item.key, typeof item.value === "number" ? item.value : null));
  const designCount = hasValue(data, "governance.pendingDesignResponses", data.governance.pendingDesignResponses) ? data.governance.pendingDesignResponses : null;
  if (!items.length && designCount === null && !vendorRequestCount) return null;
  return <section className="dashboard-visual-operational" aria-labelledby="dashboard-actions-heading">
    <div className="dashboard-section-heading"><h3 id="dashboard-actions-heading">Operational actions</h3><DetailLink target={{ tab: "risk" }} origin="dashboard-risk-details" data={data} periodDays={periodDays} showComparison={showComparison}>View risk</DetailLink></div>
    <ul className="dashboard-visual-action-list">{items.map((item) => {
      const origin = `dashboard-action-${item.key.replaceAll(".", "-")}`;
      const content = <><strong>{item.value}</strong><span>{item.label}</span><small>{item.key === "projects.liveOverdue" ? "Open schedule-risk records" : item.status}</small></>;
      return <li className="dashboard-visual-action" key={item.key} data-tone={item.tone}>{targets[item.key] ? <DetailLink target={targets[item.key]} origin={origin} data={data} periodDays={periodDays} showComparison={showComparison}>{content}</DetailLink> : item.href ? <Link to={item.href}>{content}</Link> : <div>{content}</div>}</li>;
    })}{designCount !== null ? <li className="dashboard-visual-action">{canReadDesignResponses ? <Link to="/admin/design-approvals"><strong>{designCount}</strong><span>Pending design responses</span><small>Review design approvals</small></Link> : <div><strong>{designCount}</strong><span>Pending design responses</span></div>}</li> : null}</ul>
    {vendorRequestCount ? <div className="dashboard-visual-vendor"><table><caption className="sr-only">Vendor review requests</caption><tbody><VendorClassificationRequestQueueItem count={vendorRequestCount} /></tbody></table></div> : null}
  </section>;
}

export function DashboardOverview({ data, navigationPeriodDays = data.period.days, showComparison = true, priorityProjects, vendorRequestCount, onOpenDetail, paymentSummary }: {
  data: SuperAdminDashboardOverview; navigationPeriodDays?: SuperAdminDashboardOverview["period"]["days"]; showComparison?: boolean; priorityProjects: DashboardPriorityQuery; vendorRequestCount?: DashboardVendorQuery;
  onOpenDetail?: (target: DashboardDetailTarget, originId: string) => void; paymentSummary?: ReactNode;
}) {
  const periodDays = navigationPeriodDays;
  const auth = useAuth();
  const navigate = useNavigate();
  const canReadProjects = hasFrontendPermission(auth.authorization, "projects.read");
  const canReadUsers = hasFrontendPermission(auth.authorization, "identity.users.read");
  const canReadClientResponses = hasFrontendPermission(auth.authorization, "estimation.client_response_tasks.read");
  const canReadDesignResponses = hasFrontendPermission(auth.authorization, "design.plan_response_tasks.read");
  const canReviewVendorRequests = auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.read");
  const openDetail = (target: DashboardDetailTarget, origin: string) => onOpenDetail ? onOpenDetail(target, origin) : navigate(dashboardDetailHref(target, periodDays, showComparison));
  const comparisonTargets: Record<string, DashboardDetailTarget> = { projects_created: { tab: "projects" }, projects_completed: { tab: "projects", projectStatus: "completed" }, estimates_approved: { tab: "estimation", moduleStatus: "client_approved" }, design_plans_approved: { tab: "design", moduleStatus: "approved" }, execution_tasks_completed: { tab: "execution", moduleStatus: "completed" } };
  const activity = getVisibleDashboardChartDataset(projectActivityDataset(data));
  const lifecycle = getVisibleDashboardChartDataset(lifecycleDataset(data));
  const comparison = getVisibleDashboardChartDataset(periodActivityComparisonDataset(data, showComparison));
  const heatmap = getVisibleDashboardChartDataset(projectCreationHeatmapDataset(data));
  return <div className="dashboard-overview dashboard-overview--visual">
    <section className="dashboard-reporting-context" aria-label="Reporting context"><span>Observed {formatDashboardTimestamp(data.observedAt)} UTC</span><span>{formatDashboardDate(data.period.startAt)}–{formatDashboardDate(data.period.endAt)} · {data.period.days} days</span></section>
    <DashboardMetricStrip metrics={getAvailableDashboardMetrics("overview", data, showComparison, navigationPeriodDays).primary} label="Organization headline metrics" />
    <div className="dashboard-visual-grid">
      {activity ? <Surface as="section" className="dashboard-visual-panel dashboard-visual-panel--activity"><div className="dashboard-panel-action"><DetailLink target={{ tab: "projects" }} origin="dashboard-project-activity" data={data} periodDays={periodDays} showComparison={showComparison}>View project records</DetailLink></div><ProjectActivityChart data={data} /></Surface> : null}
      {lifecycle ? <Surface as="section" className="dashboard-visual-panel dashboard-visual-panel--lifecycle"><ProjectStatusChart data={data} onActivate={(status: DashboardProjectModuleStatus) => openDetail({ tab: "projects", projectStatus: status as DashboardDetailTarget["projectStatus"] }, `dashboard-lifecycle-${status}`)} /></Surface> : null}
      {comparison ? <Surface as="section" className="dashboard-visual-panel dashboard-visual-panel--comparison"><PeriodActivityComparisonChart data={data} showComparison={showComparison} onActivate={(id) => { if (comparisonTargets[id]) openDetail(comparisonTargets[id], `dashboard-comparison-${id}`); }} /></Surface> : null}
      <FinancePanel data={data} periodDays={periodDays} showComparison={showComparison} />
      <ModuleRings data={data} periodDays={periodDays} showComparison={showComparison} />
      <WorkforcePanel data={data} periodDays={periodDays} showComparison={showComparison} />
      {heatmap ? <Surface as="section" className="dashboard-visual-panel dashboard-visual-panel--heatmap"><DashboardActivityHeatmap data={data} /></Surface> : null}
      <div className="dashboard-visual-panel dashboard-visual-panel--priority"><DashboardPriorityProjects query={priorityProjects} canReadProjects={canReadProjects} viewAllHref={dashboardDetailHref({ tab: "projects" }, periodDays, showComparison)} /></div>
    </div>
    <div className="dashboard-visual-actions"><OperationalActions data={data} periodDays={periodDays} showComparison={showComparison} canReadClientResponses={canReadClientResponses} canReadDesignResponses={canReadDesignResponses} vendorRequestCount={canReviewVendorRequests ? vendorRequestCount : undefined} /><ClientSummary data={data} canReadUsers={canReadUsers} />{paymentSummary}</div>
  </div>;
}
