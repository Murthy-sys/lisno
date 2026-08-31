import { Link } from "react-router-dom";

import { MetricCard } from "../../../components/ui/MetricCard";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Surface } from "../../../components/ui/Surface";
import { PortfolioFinanceChart } from "../../finance/ProjectFinanceChart";
import {
  formatDashboardDate,
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

function ModuleCard({
  title,
  primary,
  detail,
  tab,
  days,
  dataQuality,
  primaryMetricKeys,
  detailMetricKeys
}: {
  title: string;
  primary: string;
  detail: string;
  tab: DashboardTab;
  days: number;
  dataQuality: DashboardDataQuality;
  primaryMetricKeys: string[];
  detailMetricKeys: string[];
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

  return (
    <div className="dashboard-overview">
      <section aria-labelledby="dashboard-priority-heading">
        <div className="dashboard-section-heading">
          <div><p className="eyebrow">Priority now</p><h3 id="dashboard-priority-heading">Attention summary</h3></div>
          <p>Current-state signals at the dashboard observation time.</p>
        </div>
        <div className="dashboard-metric-grid dashboard-metric-grid--priority">
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="risk.projectDistribution" label="Red-risk projects" value={data.risk.projectDistribution.red} detail="Require immediate review" />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="risk.projectDistribution" label="Yellow-risk projects" value={data.risk.projectDistribution.yellow} detail="Need monitoring" />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="execution.overdue" label="Overdue execution tasks" value={data.execution.overdue} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="finance.overBudgetProjectCount" label="Budget exceptions" value={data.finance.overBudgetProjectCount} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="execution.overdueUnassigned" label="Unassigned overdue tasks" value={data.execution.overdueUnassigned} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="governance.failedClientDeliveries" label="Failed Client deliveries" value={data.governance.failedClientDeliveries} />
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
          <Link to={tabHref("projects", data.period.days)}>View all project metrics</Link>
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

      <section aria-labelledby="dashboard-module-health-heading">
        <div className="dashboard-section-heading">
          <div><p className="eyebrow">Every operational area</p><h3 id="dashboard-module-health-heading">Cross-module health</h3></div>
          <p>Eligible, tracked, and unavailable values remain separate.</p>
        </div>
        <div className="dashboard-module-grid">
          <ModuleCard title="Estimation" primary={`${data.estimation.clientApproved} Client approved`} detail={`${data.estimation.awaitingClient} awaiting Client · ${data.estimation.unavailableProjects} unavailable`} tab="estimation" days={data.period.days} dataQuality={data.dataQuality} primaryMetricKeys={["estimation.clientApproved"]} detailMetricKeys={["estimation.awaitingClient", "estimation.unavailableProjects"]} />
          <ModuleCard title="Design" primary={`${data.design.approved} approved`} detail={`${data.design.changesRequested} changes requested · ${data.design.unavailableProjects} unavailable`} tab="design" days={data.period.days} dataQuality={data.dataQuality} primaryMetricKeys={["design.approved"]} detailMetricKeys={["design.changesRequested", "design.unavailableProjects"]} />
          <ModuleCard title="Procurement" primary={`${data.procurement.inProgress} in progress`} detail={`${data.procurement.completed} completed · ${data.procurement.unavailableProjects} unavailable`} tab="procurement" days={data.period.days} dataQuality={data.dataQuality} primaryMetricKeys={["procurement.inProgress"]} detailMetricKeys={["procurement.completed", "procurement.unavailableProjects"]} />
          <ModuleCard title="Finance" primary={formatPaise(data.finance.currentProfitPaise)} detail={`Current profit (live) · ${data.finance.overBudgetProjectCount} budget exceptions`} tab="finance" days={data.period.days} dataQuality={data.dataQuality} primaryMetricKeys={["finance.currentProfitPaise"]} detailMetricKeys={["finance.overBudgetProjectCount"]} />
          <ModuleCard title="Execution" primary={`${data.execution.overdue} overdue`} detail={`${data.execution.unassigned} unassigned · ${data.execution.completedInPeriod} completed in period`} tab="execution" days={data.period.days} dataQuality={data.dataQuality} primaryMetricKeys={["execution.overdue"]} detailMetricKeys={["execution.unassigned", "execution.completedInPeriod"]} />
          <ModuleCard title="Workforce" primary={`${data.workforce.activeWorkers} active workers`} detail={`${data.workforce.capacityAvailable ? `${data.workforce.overCapacityWorkers} over capacity` : "Capacity not available"} · ${data.workforce.kpiUnavailableWorkers} KPI unavailable`} tab="workforce" days={data.period.days} dataQuality={data.dataQuality} primaryMetricKeys={["workforce.activeWorkers"]} detailMetricKeys={["workforce.capacity", "workforce.kpiUnavailableWorkers"]} />
          <ModuleCard title="Risk" primary={`${data.projects.atRisk} projects at risk`} detail={`${data.risk.projectDistribution.red} red · ${data.risk.projectDistribution.yellow} yellow`} tab="risk" days={data.period.days} dataQuality={data.dataQuality} primaryMetricKeys={["risk.projectDistribution"]} detailMetricKeys={["risk.projectDistribution"]} />
        </div>
      </section>

      <section className="dashboard-overview__split" aria-label="Risk and finance analysis">
        <Surface as="article" className="dashboard-analysis-card">
          <div className="dashboard-section-heading">
            <div><p className="eyebrow">Explainable signals</p><h3>Risk factor analysis</h3></div>
            <Link to={tabHref("risk", data.period.days)}>Explore risk</Link>
          </div>
          {isDashboardMetricUnavailable(data.dataQuality, "risk.factorDistribution") ? (
            <p className="dashboard-unavailable"><strong>Not available.</strong> {dashboardMetricUnavailableReason(data.dataQuality, "risk.factorDistribution")}</p>
          ) : data.risk.factorDistribution.length === 0 ? (
            <p>No eligible risk factors are currently tracked.</p>
          ) : (
            <ul className="dashboard-factor-list" aria-label="Risk factor occurrences">
              {data.risk.factorDistribution.map((factor) => {
                const presentation = riskPresentation(factor.level);
                return (
                  <li key={`${factor.kind}-${factor.level}-${factor.reasonCode}`}>
                    <div><strong>{humanize(factor.kind)}</strong><span>{humanize(factor.reasonCode)}</span></div>
                    <StatusBadge label={presentation.label} tone={presentation.tone} />
                    <span>{factor.occurrenceCount} occurrences across {factor.projectCount} projects</span>
                  </li>
                );
              })}
            </ul>
          )}
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
          <dl className="dashboard-definition-grid">
            <SafeDefinition dataQuality={data.dataQuality} metricKey="finance.approvedSubtotalPaise" label="Approved net revenue, excluding GST" value={formatPaise(data.finance.approvedSubtotalPaise)} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="finance.currentProfitPaise" label="Current profit (live)" value={formatPaise(data.finance.currentProfitPaise)} />
          </dl>
        </Surface>
      </section>

      <section className="dashboard-overview__split" aria-label="Execution and workforce health">
        <Surface as="article">
          <div className="dashboard-section-heading"><div><p className="eyebrow">Delivery</p><h3>Execution health</h3></div></div>
          <dl className="dashboard-definition-grid">
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.weightedProgress" label="Weighted progress" value={formatDashboardRatio(data.execution.weightedProgress)} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.weightedProgress" label="Tracked effort" value={`${data.execution.weightedProgress.numerator} of ${data.execution.weightedProgress.denominator}`} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.weightedProgress" label="Fallback tasks" value={data.execution.weightedProgress.fallbackTaskCount} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.completedInPeriod" label="Completed in period" value={data.execution.completedInPeriod} />
          </dl>
        </Surface>
        <Surface as="article">
          <div className="dashboard-section-heading"><div><p className="eyebrow">Capacity</p><h3>Workforce health</h3></div></div>
          <dl className="dashboard-definition-grid">
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.averageKpi" label="Average calculated KPI" value={formatDashboardRatio(data.workforce.averageKpi)} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.kpiEligibleWorkers" label="KPI eligible" value={data.workforce.kpiEligibleWorkers} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.kpiUnavailableWorkers" label="No KPI data" value={data.workforce.kpiUnavailableWorkers} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.inactiveAssigneeTaskCount" label="Inactive-assignee exceptions" value={data.workforce.inactiveAssigneeTaskCount} />
          </dl>
        </Surface>
      </section>

      <section aria-labelledby="dashboard-governance-heading">
        <div className="dashboard-section-heading"><div><p className="eyebrow">Administrative queues</p><h3 id="dashboard-governance-heading">Governance attention</h3></div></div>
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

      <section aria-labelledby="dashboard-trends-heading">
        <div className="dashboard-section-heading"><div><p className="eyebrow">Selected period</p><h3 id="dashboard-trends-heading">Operational trends</h3></div><p>{formatDashboardDate(data.period.startAt)} – {formatDashboardDate(data.period.endAt)}</p></div>
        <div className="dashboard-table-wrap">
          <table><caption>Daily trend values; all visual values are repeated as text.</caption><thead><tr><th>Date</th><th>Projects created</th><th>Projects completed</th><th>Estimates approved</th><th>Design plans approved</th><th>Tasks completed</th><th>Expenses posted</th></tr></thead>
            <tbody>{data.trends.map((bucket) => <tr key={bucket.date}><th scope="row">{formatDashboardDate(bucket.date)}</th><td>{dashboardMetricPresentation(data.dataQuality, "trends.projectsCreated", bucket.projectsCreated).value}</td><td>{dashboardMetricPresentation(data.dataQuality, "trends.projectsCompleted", bucket.projectsCompleted).value}</td><td>{dashboardMetricPresentation(data.dataQuality, "trends.estimatesApproved", bucket.estimatesApproved).value}</td><td>{dashboardMetricPresentation(data.dataQuality, "trends.designPlansApproved", bucket.designPlansApproved).value}</td><td>{dashboardMetricPresentation(data.dataQuality, "trends.workflowTasksCompleted", bucket.workflowTasksCompleted).value}</td><td>{dashboardMetricPresentation(data.dataQuality, "trends.ledgerExpensesPostedPaise", formatPaise(bucket.ledgerExpensesPostedPaise)).value}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
