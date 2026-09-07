import { Link } from "react-router-dom";

import {
  HeroFigure,
  MeterChart,
  StatTile,
  type ChartStatus
} from "../../../components/charts";
import { MetricCard } from "../../../components/ui/MetricCard";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Surface } from "../../../components/ui/Surface";
import { PortfolioFinanceChart } from "../../finance/ProjectFinanceChart";
import {
  ApprovalThroughputChart,
  BudgetConsumptionMeter,
  ExecutionProgressMeter,
  ExecutionRoleChart,
  ExpenseTrendChart,
  FinanceWaterfallChart,
  GovernanceQueueChart,
  MarginMeter,
  ProcurementSpendMeter,
  ProjectFlowChart,
  ProjectLifecycleChart,
  RiskDistributionChart,
  RiskFactorChart,
  SpendCompositionChart,
  WorkerRoleChart,
  WorkforceKpiMeter,
  suppressionReason
} from "./dashboardCharts";
import {
  formatBps,
  formatDashboardRatio,
  formatDays,
  formatPaise,
  humanize,
  dashboardMetricPresentation,
  dashboardMetricUnavailableReason,
  isDashboardMetricUnavailable,
  ratioDetail,
  riskPresentation
} from "./dashboardPresentation";
import type {
  DashboardDataQuality,
  DashboardTab,
  SuperAdminDashboardOverview
} from "./superAdminDashboardApi";

const tabHref = (tab: DashboardTab, days: number) =>
  `/admin/dashboard?tab=${tab}&periodDays=${days}`;

function SafeMetricCard({
  dataQuality,
  metricKey,
  label,
  value,
  detail,
  detailMetricKey
}: {
  dataQuality: DashboardDataQuality;
  metricKey: string;
  label: string;
  value: string | number;
  detail?: string;
  detailMetricKey?: string;
}) {
  const presentation = dashboardMetricPresentation(
    dataQuality,
    metricKey,
    value,
    detailMetricKey ? undefined : detail
  );
  const safeDetail = detailMetricKey && isDashboardMetricUnavailable(dataQuality, detailMetricKey)
    ? dashboardMetricUnavailableReason(dataQuality, detailMetricKey)
    : detail;
  return <MetricCard label={label} value={presentation.value} detail={presentation.unavailable ? presentation.detail : safeDetail} />;
}

/**
 * An attention tile. Every one of these counts something that should be going
 * down, so the delta colouring is inverted and a rise reads as bad.
 */
function AttentionTile({
  dataQuality,
  metricKey,
  label,
  value,
  detail,
  status
}: {
  dataQuality: DashboardDataQuality;
  metricKey: string;
  label: string;
  value: number;
  detail?: string;
  status: ChartStatus;
}) {
  const reason = suppressionReason(dataQuality, [metricKey]);
  return (
    <StatTile
      label={label}
      value={value.toLocaleString("en-IN")}
      detail={detail}
      status={value > 0 ? status : "good"}
      higherIsBetter={false}
      unavailableReason={reason}
    />
  );
}

function ModuleCard({
  title,
  primary,
  detail,
  tab,
  days,
  dataQuality,
  primaryMetricKeys,
  detailMetricKeys,
  meter,
  note
}: {
  title: string;
  primary: string;
  detail: string;
  tab: DashboardTab;
  days: number;
  dataQuality: DashboardDataQuality;
  primaryMetricKeys: string[];
  detailMetricKeys: string[];
  meter?: { value: number | null; valueText: string; label: string; status: ChartStatus };
  /** Verified supporting text where a module has no ratio to meter. */
  note?: string;
}) {
  const unavailablePrimaryKey = primaryMetricKeys.find((key) =>
    isDashboardMetricUnavailable(dataQuality, key)
  );
  const unavailableDetailKey = detailMetricKeys.find((key) =>
    isDashboardMetricUnavailable(dataQuality, key)
  );
  return (
    <Surface as="article" variant="subtle" className="dashboard-module-card">
      <div><p className="eyebrow">{title}</p><strong>{unavailablePrimaryKey ? "Not available" : primary}</strong></div>
      {meter && !unavailablePrimaryKey ? (
        <MeterChart
          size="compact"
          label={meter.label}
          value={meter.value}
          valueText={meter.valueText}
          status={meter.status}
        />
      ) : note && !unavailablePrimaryKey ? (
        <p className="dashboard-module-card__note">{note}</p>
      ) : null}
      <p>{unavailablePrimaryKey
        ? dashboardMetricUnavailableReason(dataQuality, unavailablePrimaryKey)
        : unavailableDetailKey
          ? <><strong>Not available.</strong> {dashboardMetricUnavailableReason(dataQuality, unavailableDetailKey)}</>
          : detail}</p>
      <Link to={tabHref(tab, days)}>View {title.toLowerCase()} details</Link>
    </Surface>
  );
}

function SafeDefinition({
  dataQuality,
  metricKey,
  label,
  value
}: {
  dataQuality: DashboardDataQuality;
  metricKey: string;
  label: string;
  value: string | number;
}) {
  const presentation = dashboardMetricPresentation(dataQuality, metricKey, value);
  return (
    <div>
      <dt>{label}</dt>
      <dd>{presentation.value}{presentation.unavailable ? <small>{presentation.detail}</small> : null}</dd>
    </div>
  );
}

function SafeLinkedMetric({
  dataQuality,
  metricKey,
  href,
  label,
  value
}: {
  dataQuality: DashboardDataQuality;
  metricKey: string;
  href: string;
  label: string;
  value: number;
}) {
  const presentation = dashboardMetricPresentation(dataQuality, metricKey, value);
  return (
    <Link to={href}>
      <strong>{presentation.value}</strong>
      <span>{label}</span>
      {presentation.unavailable ? <small>{presentation.detail}</small> : null}
    </Link>
  );
}

export function DashboardOverview({ data }: { data: SuperAdminDashboardOverview }) {
  const redRisk = riskPresentation("red");
  const yellowRisk = riskPresentation("yellow");
  const days = data.period.days;
  const financeChartMetricKeys = [
    "finance.projectCount",
    "finance.approvedContractTotalPaise",
    "finance.approvedGstPaise",
    "finance.targetProfitPaise",
    "finance.costBudgetPaise",
    "finance.procurementCostPaise",
    "finance.employeePaymentPaise",
    "finance.otherExpensePaise",
    "finance.overheadPaise",
    "finance.recordedCostPaise",
    "finance.remainingBudgetPaise",
    "finance.overBudgetProjectCount",
    "finance.overdueProjectCount",
    "finance.lateCompletedProjectCount",
    "finance.overdueTaskCount"
  ];
  const financeChartUnavailableKey = financeChartMetricKeys.find((key) =>
    isDashboardMetricUnavailable(data.dataQuality, key)
  );

  const totalReason = suppressionReason(data.dataQuality, ["projects.total"]);
  const completionReason = suppressionReason(data.dataQuality, ["projects.completionRate"]);
  const completionShare =
    data.projects.completionRate.rateBps === null
      ? null
      : data.projects.completionRate.rateBps / 10_000;
  const createdTrend = data.trends.map((bucket) => bucket.projectsCreated);
  const approvalShare =
    data.design.approvalRate.rateBps === null ? null : data.design.approvalRate.rateBps / 10_000;
  const marginShare =
    data.finance.currentMarginBps === null
      ? null
      : Math.max(0, Math.min(1, data.finance.currentMarginBps / 10_000));
  const executionShare =
    data.execution.weightedProgress.rateBps === null
      ? null
      : data.execution.weightedProgress.rateBps / 10_000;
  const kpiShare =
    data.workforce.averageKpi.rateBps === null ? null : data.workforce.averageKpi.rateBps / 10_000;
  const procurementProgressShare =
    data.procurement.averageProgress.rateBps === null
      ? null
      : data.procurement.averageProgress.rateBps / 10_000;

  return (
    <div className="dashboard-overview">
      <Surface as="section" className="dashboard-command" aria-labelledby="dashboard-command-heading">
        <h3 id="dashboard-command-heading" className="sr-only">Portfolio headline</h3>
        <HeroFigure
          eyebrow="Organization portfolio"
          value={totalReason ? "Not available" : data.projects.total.toLocaleString("en-IN")}
          label={data.projects.total === 1 ? "project under management" : "projects under management"}
          detail={
            totalReason ?? (
              <>
                {data.projects.createdInPeriod} created and {data.projects.completed} completed in this
                period · {data.projects.atRisk} currently at risk
              </>
            )
          }
          trend={totalReason || createdTrend.length === 0 ? undefined : createdTrend}
          trendLabel="Projects created per day in this period"
        />
        <div className="dashboard-command__meters">
          <MeterChart
            label="Projects delivered"
            value={completionReason ? null : completionShare}
            valueText={formatDashboardRatio(data.projects.completionRate)}
            detail={ratioDetail(data.projects.completionRate, "projects")}
            status={
              completionShare === null ? "neutral" : completionShare >= 0.6 ? "good" : "warning"
            }
            unavailableReason={completionReason}
          />
          <BudgetConsumptionMeter data={data} />
          <ExecutionProgressMeter data={data} />
        </div>
      </Surface>

      <section aria-labelledby="dashboard-priority-heading">
        <div className="dashboard-section-heading">
          <div><p className="eyebrow">Priority now</p><h3 id="dashboard-priority-heading">Attention summary</h3></div>
          <p>Current-state signals at the dashboard observation time.</p>
        </div>
        <div className="dashboard-tile-grid">
          <AttentionTile dataQuality={data.dataQuality} metricKey="risk.projectDistribution" label="Red-risk projects" value={data.risk.projectDistribution.red} detail="Require immediate review" status="critical" />
          <AttentionTile dataQuality={data.dataQuality} metricKey="risk.projectDistribution" label="Yellow-risk projects" value={data.risk.projectDistribution.yellow} detail="Need monitoring" status="warning" />
          <AttentionTile dataQuality={data.dataQuality} metricKey="execution.overdue" label="Overdue execution tasks" value={data.execution.overdue} detail="Past their due date and incomplete" status="critical" />
          <AttentionTile dataQuality={data.dataQuality} metricKey="finance.overBudgetProjectCount" label="Budget exceptions" value={data.finance.overBudgetProjectCount} detail="Recorded cost past the budget" status="serious" />
          <AttentionTile dataQuality={data.dataQuality} metricKey="execution.overdueUnassigned" label="Unassigned overdue tasks" value={data.execution.overdueUnassigned} detail="Overdue with no assignee" status="serious" />
          <AttentionTile dataQuality={data.dataQuality} metricKey="governance.failedClientDeliveries" label="Failed Client deliveries" value={data.governance.failedClientDeliveries} detail="Client could not be reached" status="critical" />
        </div>
        <div className="dashboard-status-legend" aria-label="Risk status legend">
          <StatusBadge label={redRisk.label} tone={redRisk.tone} />
          <StatusBadge label={yellowRisk.label} tone={yellowRisk.tone} />
          <StatusBadge label="Clear" tone="success" />
          <StatusBadge label="Not tracked" tone="neutral" />
        </div>
      </section>

      <section aria-labelledby="dashboard-projects-heading">
        <div className="dashboard-section-heading">
          <div><p className="eyebrow">Portfolio snapshot</p><h3 id="dashboard-projects-heading">Project lifecycle</h3></div>
          <Link to={tabHref("projects", days)}>View all project metrics</Link>
        </div>
        <div className="dashboard-chart-grid">
          <Surface as="article" className="dashboard-chart-card">
            <ProjectLifecycleChart data={data} />
          </Surface>
          <Surface as="article" className="dashboard-chart-card">
            <RiskDistributionChart data={data} />
          </Surface>
        </div>
        <div className="dashboard-metric-grid">
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.total" label="All projects" value={data.projects.total} detail={`${data.projects.createdInPeriod} created in this period`} detailMetricKey="projects.createdInPeriod" />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.planning" label="Planning" value={data.projects.planning} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.active" label="Active" value={data.projects.active} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.onHold" label="On hold" value={data.projects.onHold} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.completed" label="Completed" value={data.projects.completed} detail={`${data.projects.completedLate} completed late`} detailMetricKey="projects.completedLate" />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.liveOverdue" label="Live overdue" value={data.projects.liveOverdue} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.completionRate" label="Completion rate" value={formatDashboardRatio(data.projects.completionRate)} detail={ratioDetail(data.projects.completionRate, "projects")} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="risk.projectDistribution" label="Unique projects at risk" value={data.projects.atRisk} />
        </div>
      </section>

      <section aria-labelledby="dashboard-trends-heading">
        <div className="dashboard-section-heading">
          <div><p className="eyebrow">Selected period</p><h3 id="dashboard-trends-heading">Operational trends</h3></div>
          <p>Counts and money are plotted separately; they never share an axis.</p>
        </div>
        <div className="dashboard-chart-grid">
          <Surface as="article" className="dashboard-chart-card">
            <ProjectFlowChart data={data} />
          </Surface>
          <Surface as="article" className="dashboard-chart-card">
            <ApprovalThroughputChart data={data} />
          </Surface>
        </div>
        <Surface as="article" className="dashboard-chart-card">
          <ExpenseTrendChart data={data} />
        </Surface>
      </section>

      <section aria-labelledby="dashboard-module-health-heading">
        <div className="dashboard-section-heading">
          <div><p className="eyebrow">Every operational area</p><h3 id="dashboard-module-health-heading">Cross-module health</h3></div>
          <p>Eligible, tracked, and unavailable values remain separate.</p>
        </div>
        <div className="dashboard-module-grid">
          <ModuleCard title="Estimation" primary={`${data.estimation.clientApproved} Client approved`} detail={`${data.estimation.awaitingClient} awaiting Client · ${data.estimation.unavailableProjects} unavailable`} tab="estimation" days={days} dataQuality={data.dataQuality} primaryMetricKeys={["estimation.clientApproved"]} detailMetricKeys={["estimation.awaitingClient", "estimation.unavailableProjects"]} note={`Median wait ${formatDays(data.estimation.medianWaitingAgeDays)} · oldest ${formatDays(data.estimation.oldestWaitingAgeDays)}`} />
          <ModuleCard title="Design" primary={`${data.design.approved} approved`} detail={`${data.design.changesRequested} changes requested · ${data.design.unavailableProjects} unavailable`} tab="design" days={days} dataQuality={data.dataQuality} primaryMetricKeys={["design.approved"]} detailMetricKeys={["design.changesRequested", "design.unavailableProjects"]} meter={{ label: "Approval rate", value: approvalShare, valueText: formatDashboardRatio(data.design.approvalRate), status: approvalShare !== null && approvalShare >= 0.6 ? "good" : "warning" }} />
          <ModuleCard title="Procurement" primary={`${data.procurement.inProgress} in progress`} detail={`${data.procurement.completed} completed · ${data.procurement.unavailableProjects} unavailable`} tab="procurement" days={days} dataQuality={data.dataQuality} primaryMetricKeys={["procurement.inProgress"]} detailMetricKeys={["procurement.completed", "procurement.unavailableProjects"]} meter={{ label: "Average progress", value: procurementProgressShare, valueText: formatDashboardRatio(data.procurement.averageProgress), status: procurementProgressShare !== null && procurementProgressShare >= 0.6 ? "good" : "warning" }} />
          <ModuleCard title="Finance" primary={formatPaise(data.finance.currentProfitPaise)} detail={`Current profit (live) · ${data.finance.overBudgetProjectCount} budget exceptions`} tab="finance" days={days} dataQuality={data.dataQuality} primaryMetricKeys={["finance.currentProfitPaise"]} detailMetricKeys={["finance.overBudgetProjectCount"]} meter={{ label: "Current margin", value: marginShare, valueText: formatBps(data.finance.currentMarginBps), status: marginShare !== null && marginShare >= 0.1 ? "good" : "warning" }} />
          <ModuleCard title="Execution" primary={`${data.execution.overdue} overdue`} detail={`${data.execution.unassigned} unassigned · ${data.execution.completedInPeriod} completed in period`} tab="execution" days={days} dataQuality={data.dataQuality} primaryMetricKeys={["execution.overdue"]} detailMetricKeys={["execution.unassigned", "execution.completedInPeriod"]} meter={{ label: "Weighted progress", value: executionShare, valueText: formatDashboardRatio(data.execution.weightedProgress), status: executionShare !== null && executionShare >= 0.6 ? "good" : "warning" }} />
          <ModuleCard title="Workforce" primary={`${data.workforce.activeWorkers} active workers`} detail={`${data.workforce.capacityAvailable ? `${data.workforce.overCapacityWorkers} over capacity` : "Capacity not available"} · ${data.workforce.kpiUnavailableWorkers} KPI unavailable`} tab="workforce" days={days} dataQuality={data.dataQuality} primaryMetricKeys={["workforce.activeWorkers"]} detailMetricKeys={["workforce.capacity", "workforce.kpiUnavailableWorkers"]} meter={{ label: "Average KPI", value: kpiShare, valueText: formatDashboardRatio(data.workforce.averageKpi), status: kpiShare !== null && kpiShare >= 0.6 ? "good" : "warning" }} />
          <ModuleCard title="Risk" primary={`${data.projects.atRisk} projects at risk`} detail={`${data.risk.projectDistribution.red} red · ${data.risk.projectDistribution.yellow} yellow`} tab="risk" days={days} dataQuality={data.dataQuality} primaryMetricKeys={["risk.projectDistribution"]} detailMetricKeys={["risk.projectDistribution"]} />
        </div>
      </section>

      <section className="dashboard-overview__split" aria-label="Risk and finance analysis">
        <Surface as="article" className="dashboard-analysis-card">
          <div className="dashboard-section-heading">
            <div><p className="eyebrow">Explainable signals</p><h3>Risk factor analysis</h3></div>
            <Link to={tabHref("risk", days)}>Explore risk</Link>
          </div>
          <RiskFactorChart data={data} />
          {isDashboardMetricUnavailable(data.dataQuality, "risk.topProjects") ? (
            <p className="dashboard-unavailable"><strong>Top affected projects are not available.</strong> {dashboardMetricUnavailableReason(data.dataQuality, "risk.topProjects")}</p>
          ) : <ol className="dashboard-top-risk" aria-label="Top affected projects">
            {data.risk.topProjects.map((project) => {
              const presentation = riskPresentation(project.risk.level);
              return (
                <li key={project.projectId}>
                  <Link to={`/admin/projects/${encodeURIComponent(project.projectId)}`}>{project.projectName}</Link>
                  <StatusBadge label={presentation.label} tone={presentation.tone} />
                  <span>{project.risk.factors[0]?.reason ?? "No eligible reason returned"}</span>
                </li>
              );
            })}
          </ol>}
        </Surface>
        <Surface as="article" className="dashboard-analysis-card">
          {financeChartUnavailableKey ? (
            <p className="dashboard-unavailable"><strong>Finance chart not available.</strong> {dashboardMetricUnavailableReason(data.dataQuality, financeChartUnavailableKey)}</p>
          ) : <PortfolioFinanceChart summary={data.finance} />}
          <MarginMeter data={data} />
          <dl className="dashboard-definition-grid">
            <SafeDefinition dataQuality={data.dataQuality} metricKey="finance.approvedSubtotalPaise" label="Approved net revenue, excluding GST" value={formatPaise(data.finance.approvedSubtotalPaise)} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="finance.currentProfitPaise" label="Current profit (live)" value={formatPaise(data.finance.currentProfitPaise)} />
          </dl>
        </Surface>
      </section>

      <section aria-labelledby="dashboard-finance-flow-heading">
        <div className="dashboard-section-heading">
          <div><p className="eyebrow">Money</p><h3 id="dashboard-finance-flow-heading">Commercial position</h3></div>
          <Link to={tabHref("finance", days)}>View all finance metrics</Link>
        </div>
        <div className="dashboard-chart-grid">
          <Surface as="article" className="dashboard-chart-card">
            <FinanceWaterfallChart data={data} />
          </Surface>
          <Surface as="article" className="dashboard-chart-card">
            <SpendCompositionChart data={data} />
            <ProcurementSpendMeter data={data} />
          </Surface>
        </div>
      </section>

      <section className="dashboard-overview__split" aria-label="Execution and workforce health">
        <Surface as="article">
          <div className="dashboard-section-heading"><div><p className="eyebrow">Delivery</p><h3>Execution health</h3></div></div>
          <ExecutionRoleChart data={data} />
          <dl className="dashboard-definition-grid">
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.weightedProgress" label="Weighted progress" value={formatDashboardRatio(data.execution.weightedProgress)} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.weightedProgress" label="Tracked effort" value={`${data.execution.weightedProgress.numerator} of ${data.execution.weightedProgress.denominator}`} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.weightedProgress" label="Fallback tasks" value={data.execution.weightedProgress.fallbackTaskCount} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.completedInPeriod" label="Completed in period" value={data.execution.completedInPeriod} />
          </dl>
        </Surface>
        <Surface as="article">
          <div className="dashboard-section-heading"><div><p className="eyebrow">Capacity</p><h3>Workforce health</h3></div></div>
          <WorkerRoleChart data={data} />
          <WorkforceKpiMeter data={data} />
          <dl className="dashboard-definition-grid">
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.activeWorkers" label="Active workers" value={data.workforce.activeWorkers} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.capacity" label="Over capacity" value={data.workforce.capacityAvailable ? (data.workforce.overCapacityWorkers ?? "Not available") : "Not available"} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.completedInPeriodTaskCount" label="Tasks completed in period" value={data.workforce.completedInPeriodTaskCount} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.inactiveAssigneeTaskCount" label="Inactive-assignee exceptions" value={data.workforce.inactiveAssigneeTaskCount} />
          </dl>
        </Surface>
      </section>

      <section aria-labelledby="dashboard-governance-heading">
        <div className="dashboard-section-heading"><div><p className="eyebrow">Administrative queues</p><h3 id="dashboard-governance-heading">Governance attention</h3></div></div>
        <Surface as="article" className="dashboard-chart-card">
          <GovernanceQueueChart data={data} />
        </Surface>
        <div className="dashboard-governance-grid">
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.pendingInvitations" href="/admin/users" label="Pending invitations" value={data.governance.pendingInvitations} />
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.expiredInvitations" href="/admin/users" label="Expired invitations" value={data.governance.expiredInvitations} />
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.failedInvitationDeliveries" href="/admin/users" label="Failed invitation deliveries" value={data.governance.failedInvitationDeliveries} />
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.pendingAccessRequests" href="/admin/access-requests" label="Pending access requests" value={data.governance.pendingAccessRequests} />
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.pendingClientResponses" href="/admin/client-responses" label="Pending Client responses" value={data.governance.pendingClientResponses} />
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.failedClientDeliveries" href="/admin/client-responses" label="Failed Client deliveries" value={data.governance.failedClientDeliveries} />
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.disabledClientDeliveries" href="/admin/client-responses" label="Disabled Client deliveries" value={data.governance.disabledClientDeliveries} />
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.pendingDesignResponses" href="/admin/design-approvals" label="Pending Design responses" value={data.governance.pendingDesignResponses} />
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.failedDesignDeliveries" href="/admin/design-approvals" label="Failed Design deliveries" value={data.governance.failedDesignDeliveries} />
          <SafeLinkedMetric dataQuality={data.dataQuality} metricKey="governance.disabledDesignDeliveries" href="/admin/design-approvals" label="Disabled Design deliveries" value={data.governance.disabledDesignDeliveries} />
        </div>
      </section>
    </div>
  );
}
