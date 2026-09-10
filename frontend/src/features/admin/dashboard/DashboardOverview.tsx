import { ArrowRight, CheckCircle2, CircleAlert, Clock, Folder, PauseCircle, TriangleAlert, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  HeroFigure,
  MeterChart,
  seriesColor,
  type ChartStatus
} from "../../../components/charts";
import { MetricCard } from "../../../components/ui/MetricCard";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Surface } from "../../../components/ui/Surface";
import { DashboardPortfolioFinanceChart } from "./DashboardPortfolioFinanceChart";
import {
  ApprovalThroughputChart,
  budgetConsumptionMetric,
  executionProgressMetric,
  ExecutionRoleChart,
  ExpenseTrendChart,
  FinanceWaterfallChart,
  GovernanceQueueChart,
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
import { HeroPortfolioDonut } from "./HeroPortfolioDonut";
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
  detailMetricKey,
  tone,
  icon,
  progress
}: {
  dataQuality: DashboardDataQuality;
  metricKey: string;
  label: string;
  value: string | number;
  detail?: string;
  detailMetricKey?: string;
  tone?: "neutral" | "active" | "hold" | "done" | "overdue" | "risk";
  icon?: ReactNode;
  progress?: number;
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
  return (
    <MetricCard
      label={label}
      value={presentation.value}
      detail={presentation.unavailable ? presentation.detail : safeDetail}
      tone={presentation.unavailable ? undefined : tone}
      icon={presentation.unavailable ? undefined : icon}
      progress={presentation.unavailable ? undefined : progress}
    />
  );
}

interface AttentionMetric {
  metricKey: string;
  label: string;
  detail: string;
  value: number;
  group: "critical" | "monitor";
}

/**
 * The two attention buckets, each a running total of the signals inside it.
 * A row whose own metric is unavailable shows the suppression reason instead
 * of a number and is excluded from the group total — an unknown value must
 * never silently read as zero inside a sum a reader will trust at a glance.
 */
function AttentionGroup({
  title,
  subtitle,
  tone,
  metrics,
  dataQuality
}: {
  title: string;
  subtitle: string;
  tone: "critical" | "monitor";
  metrics: AttentionMetric[];
  dataQuality: DashboardDataQuality;
}) {
  const rows = metrics
    .map((metric) => ({ ...metric, reason: suppressionReason(dataQuality, [metric.metricKey]) }))
    .sort((a, b) => (Boolean(a.reason) === Boolean(b.reason) ? b.value - a.value : a.reason ? 1 : -1));
  const total = rows.reduce((sum, row) => (row.reason ? sum : sum + row.value), 0);
  const Icon = tone === "critical" ? TriangleAlert : CircleAlert;

  return (
    <div className={`attention-group attention-group--${tone}`}>
      <div className="attention-group__header">
        <div>
          <p className="attention-group__title">{title}</p>
          <p className="attention-group__subtitle">{subtitle}</p>
        </div>
        <strong className="attention-group__total">{total.toLocaleString("en-IN")}</strong>
      </div>
      <ul className="attention-group__list">
        {rows.map((row) => (
          <li key={`${row.metricKey}-${row.label}`} className={`attention-row${row.reason ? " attention-row--unavailable" : ""}`}>
            <Icon className="attention-row__icon" aria-hidden="true" />
            <div className="attention-row__text">
              <p className="attention-row__label">{row.label}</p>
              <p className="attention-row__detail">{row.reason ?? row.detail}</p>
            </div>
            <strong className="attention-row__value">{row.reason ? "—" : row.value.toLocaleString("en-IN")}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModuleCard({
  title,
  primary,
  detail,
  dataQuality,
  primaryMetricKeys,
  detailMetricKeys,
  meter,
  note
}: {
  title: string;
  primary: string;
  detail: string;
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
    </Surface>
  );
}

function SafeDefinition({
  dataQuality,
  metricKey,
  label,
  value,
  tone
}: {
  dataQuality: DashboardDataQuality;
  metricKey: string;
  label: string;
  value: string | number;
  /** Reads the value's meaning instead of the shared neutral surface — a completed count is good, a fallback or exception count is a caution or a problem. */
  tone?: "good" | "warning" | "critical";
}) {
  const presentation = dashboardMetricPresentation(dataQuality, metricKey, value);
  return (
    <div data-tone={tone}>
      <dt>{label}</dt>
      <dd>{presentation.value}{presentation.unavailable ? <small>{presentation.detail}</small> : null}</dd>
    </div>
  );
}

export function DashboardOverview({ data }: { data: SuperAdminDashboardOverview }) {
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
    "finance.overdueTaskCount",
    "finance.currentMarginBps",
    "finance.currentProfitPaise",
    "finance.approvedSubtotalPaise"
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
                <span className="dashboard-hero-detail-line">{data.projects.createdInPeriod} created</span>
                <span className="dashboard-hero-detail-line">{data.projects.completed} completed in this period</span>
                <span className="dashboard-hero-detail-line dashboard-hero-detail-line--risk">{data.projects.atRisk} currently at risk</span>
              </>
            )
          }
          trend={totalReason || createdTrend.length === 0 ? undefined : createdTrend}
          trendLabel="Projects created per day in this period"
        />
        <div className="dashboard-command__meters">
          <HeroPortfolioDonut
            segments={[
              {
                key: "delivered",
                label: "Projects delivered",
                share: completionReason ? null : completionShare,
                valueText: formatDashboardRatio(data.projects.completionRate),
                detail: ratioDetail(data.projects.completionRate, "projects"),
                unavailableReason: completionReason,
                color: seriesColor(0)
              },
              {
                key: "budget",
                label: "Cost budget consumed",
                color: seriesColor(1),
                ...budgetConsumptionMetric(data)
              },
              {
                key: "execution",
                label: "Weighted execution progress",
                color: seriesColor(2),
                ...executionProgressMetric(data)
              }
            ]}
          />
        </div>
      </Surface>

      <section aria-labelledby="dashboard-priority-heading">
        <div className="dashboard-section-heading">
          <div><p className="eyebrow">Priority now</p><h3 id="dashboard-priority-heading">Attention summary</h3></div>
          <p>Current-state signals at the dashboard observation time.</p>
        </div>
        <div className="attention-groups">
          <AttentionGroup
            title="Critical"
            subtitle="Needs immediate review"
            tone="critical"
            dataQuality={data.dataQuality}
            metrics={[
              { metricKey: "execution.overdue", label: "Overdue execution tasks", detail: "Past due, incomplete", value: data.execution.overdue, group: "critical" },
              { metricKey: "risk.projectDistribution", label: "Red-risk projects", detail: "Require immediate review", value: data.risk.projectDistribution.red, group: "critical" },
              { metricKey: "governance.failedClientDeliveries", label: "Failed client deliveries", detail: "Client could not be reached", value: data.governance.failedClientDeliveries, group: "critical" }
            ]}
          />
          <AttentionGroup
            title="Monitor"
            subtitle="Needs monitoring"
            tone="monitor"
            dataQuality={data.dataQuality}
            metrics={[
              { metricKey: "execution.overdueUnassigned", label: "Unassigned overdue tasks", detail: "Overdue, no assignee", value: data.execution.overdueUnassigned, group: "monitor" },
              { metricKey: "risk.projectDistribution", label: "Yellow-risk projects", detail: "Need monitoring", value: data.risk.projectDistribution.yellow, group: "monitor" },
              { metricKey: "finance.overBudgetProjectCount", label: "Budget exceptions", detail: "Recorded cost past budget", value: data.finance.overBudgetProjectCount, group: "monitor" }
            ]}
          />
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
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.total" label="All projects" value={data.projects.total} detail={`${data.projects.createdInPeriod} created in this period`} detailMetricKey="projects.createdInPeriod" tone="neutral" icon={<Folder aria-hidden="true" />} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.planning" label="Planning" value={data.projects.planning} tone="neutral" icon={<Folder aria-hidden="true" />} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.active" label="Active" value={data.projects.active} tone="active" icon={<Zap aria-hidden="true" />} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.onHold" label="On hold" value={data.projects.onHold} tone="hold" icon={<PauseCircle aria-hidden="true" />} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.completed" label="Completed" value={data.projects.completed} detail={`${data.projects.completedLate} completed late`} detailMetricKey="projects.completedLate" tone="done" icon={<CheckCircle2 aria-hidden="true" />} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.liveOverdue" label="Live overdue" value={data.projects.liveOverdue} tone="overdue" icon={<Clock aria-hidden="true" />} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="projects.completionRate" label="Completion rate" value={formatDashboardRatio(data.projects.completionRate)} detail={ratioDetail(data.projects.completionRate, "projects")} progress={data.projects.completionRate.rateBps === null ? undefined : data.projects.completionRate.rateBps / 10000} />
          <SafeMetricCard dataQuality={data.dataQuality} metricKey="risk.projectDistribution" label="Unique projects at risk" value={data.projects.atRisk} tone="risk" icon={<TriangleAlert aria-hidden="true" />} />
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
        <div className="dashboard-module-grid dashboard-module-grid--primary">
          <ModuleCard title="Estimation" primary={`${data.estimation.clientApproved} Client approved`} detail={`${data.estimation.awaitingClient} awaiting Client · ${data.estimation.unavailableProjects} unavailable`} dataQuality={data.dataQuality} primaryMetricKeys={["estimation.clientApproved"]} detailMetricKeys={["estimation.awaitingClient", "estimation.unavailableProjects"]} note={`Median wait ${formatDays(data.estimation.medianWaitingAgeDays)} · oldest ${formatDays(data.estimation.oldestWaitingAgeDays)}`} />
          <ModuleCard title="Design" primary={`${data.design.approved} approved`} detail={`${data.design.changesRequested} changes requested · ${data.design.unavailableProjects} unavailable`} dataQuality={data.dataQuality} primaryMetricKeys={["design.approved"]} detailMetricKeys={["design.changesRequested", "design.unavailableProjects"]} meter={{ label: "Approval rate", value: approvalShare, valueText: formatDashboardRatio(data.design.approvalRate), status: approvalShare !== null && approvalShare >= 0.6 ? "good" : "warning" }} />
          <ModuleCard title="Procurement" primary={`${data.procurement.inProgress} in progress`} detail={`${data.procurement.completed} completed · ${data.procurement.unavailableProjects} unavailable`} dataQuality={data.dataQuality} primaryMetricKeys={["procurement.inProgress"]} detailMetricKeys={["procurement.completed", "procurement.unavailableProjects"]} meter={{ label: "Average progress", value: procurementProgressShare, valueText: formatDashboardRatio(data.procurement.averageProgress), status: procurementProgressShare !== null && procurementProgressShare >= 0.6 ? "good" : "warning" }} />
          <ModuleCard title="Finance" primary={formatPaise(data.finance.currentProfitPaise)} detail={`Current profit (live) · ${data.finance.overBudgetProjectCount} budget exceptions`} dataQuality={data.dataQuality} primaryMetricKeys={["finance.currentProfitPaise"]} detailMetricKeys={["finance.overBudgetProjectCount"]} meter={{ label: "Current margin", value: marginShare, valueText: formatBps(data.finance.currentMarginBps), status: marginShare !== null && marginShare >= 0.1 ? "good" : "warning" }} />
        </div>
        <div className="dashboard-module-grid dashboard-module-grid--secondary">
          <ModuleCard title="Execution" primary={`${data.execution.overdue} overdue`} detail={`${data.execution.unassigned} unassigned · ${data.execution.completedInPeriod} completed in period`} dataQuality={data.dataQuality} primaryMetricKeys={["execution.overdue"]} detailMetricKeys={["execution.unassigned", "execution.completedInPeriod"]} meter={{ label: "Weighted progress", value: executionShare, valueText: formatDashboardRatio(data.execution.weightedProgress), status: executionShare !== null && executionShare >= 0.6 ? "good" : "warning" }} />
          <ModuleCard title="Workforce" primary={`${data.workforce.activeWorkers} active workers`} detail={`${data.workforce.capacityAvailable ? `${data.workforce.overCapacityWorkers} over capacity` : "Capacity not available"} · ${data.workforce.kpiUnavailableWorkers} KPI unavailable`} dataQuality={data.dataQuality} primaryMetricKeys={["workforce.activeWorkers"]} detailMetricKeys={["workforce.capacity", "workforce.kpiUnavailableWorkers"]} meter={{ label: "Average KPI", value: kpiShare, valueText: formatDashboardRatio(data.workforce.averageKpi), status: kpiShare !== null && kpiShare >= 0.6 ? "good" : "warning" }} />
          <ModuleCard title="Risk" primary={`${data.projects.atRisk} projects at risk`} detail={`${data.risk.projectDistribution.red} red · ${data.risk.projectDistribution.yellow} yellow`} dataQuality={data.dataQuality} primaryMetricKeys={["risk.projectDistribution"]} detailMetricKeys={["risk.projectDistribution"]} />
        </div>
      </section>

      <section className="dashboard-overview__split" aria-label="Risk and finance analysis">
        <Surface as="article" className="dashboard-analysis-card">
          <div className="dashboard-section-heading">
            <div><p className="eyebrow">Explainable signals</p><h3>Risk factor analysis</h3></div>
            <Link to={tabHref("risk", days)} className="dashboard-module-card__link">
              Explore risk
              <ArrowRight aria-hidden="true" />
            </Link>
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
          ) : (
            <DashboardPortfolioFinanceChart summary={data.finance} />
          )}
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
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.weightedProgress" label="Fallback tasks" value={data.execution.weightedProgress.fallbackTaskCount} tone="warning" />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="execution.completedInPeriod" label="Completed in period" value={data.execution.completedInPeriod} tone="good" />
          </dl>
        </Surface>
        <Surface as="article">
          <div className="dashboard-section-heading"><div><p className="eyebrow">Capacity</p><h3>Workforce health</h3></div></div>
          <WorkerRoleChart data={data} />
          <WorkforceKpiMeter data={data} shape="linear" />
          <dl className="dashboard-definition-grid">
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.activeWorkers" label="Active workers" value={data.workforce.activeWorkers} />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.capacity" label="Over capacity" value={data.workforce.capacityAvailable ? (data.workforce.overCapacityWorkers ?? "Not available") : "Not available"} tone="warning" />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.completedInPeriodTaskCount" label="Tasks completed in period" value={data.workforce.completedInPeriodTaskCount} tone="good" />
            <SafeDefinition dataQuality={data.dataQuality} metricKey="workforce.inactiveAssigneeTaskCount" label="Inactive-assignee exceptions" value={data.workforce.inactiveAssigneeTaskCount} tone="critical" />
          </dl>
        </Surface>
      </section>

      <section aria-labelledby="dashboard-governance-heading">
        <div className="dashboard-section-heading"><div><p className="eyebrow">Administrative queues</p><h3 id="dashboard-governance-heading">Governance attention</h3></div></div>
        <Surface as="article" className="dashboard-chart-card">
          <GovernanceQueueChart data={data} />
        </Surface>
      </section>
    </div>
  );
}
