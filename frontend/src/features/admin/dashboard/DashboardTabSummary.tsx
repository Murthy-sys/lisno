import { DashboardMetricStrip } from "./DashboardMetricStrip";
import { DashboardModuleCharts } from "./DashboardModuleCharts";
import { humanize, isDashboardMetricUnavailable } from "./dashboardPresentation";
import { getAvailableDashboardMetrics } from "./dashboardViewModel";
import type { DashboardTab, SuperAdminDashboardOverview } from "./superAdminDashboardApi";

export function DashboardTabSummary({ tab, data, showComparison }: { tab: Exclude<DashboardTab, "overview">; data: SuperAdminDashboardOverview; showComparison: boolean }) {
  const metrics = getAvailableDashboardMetrics(tab, data, showComparison);
  const coverage = tab === "estimation" || tab === "design" || tab === "procurement" ? data[tab] : null;
  const unavailableKey = coverage ? [`${tab}.eligibleProjects`, `${tab}.trackedProjects`, `${tab}.unavailableProjects`]
    .find((key) => isDashboardMetricUnavailable(data.dataQuality, key)) : undefined;
  return <section className="dashboard-tab-summary" aria-label={`${humanize(tab)} summary`}>
    <DashboardMetricStrip metrics={metrics.primary} label={`${humanize(tab)} headline metrics`} />
    <div className="dashboard-summary-context">
      <p>Organization totals · Detail filters apply to the rows below.</p>
      {coverage && !unavailableKey ? <p className="dashboard-coverage">{coverage.eligibleProjects} eligible · {coverage.trackedProjects} tracked · {coverage.unavailableProjects} unavailable</p> : null}
    </div>
    <DashboardModuleCharts tab={tab} data={data} showComparison={showComparison} />
    {metrics.secondary.length ? <details className="dashboard-more-metrics"><summary>More {tab} metrics <span>{metrics.secondary.length}</span></summary>
      <dl className="dashboard-definition-grid">{metrics.secondary.map((metric) => <div key={metric.label}>
        <dt>{metric.label}</dt><dd>{metric.value}</dd>{metric.detail ? <dd className="dashboard-metric-note">{metric.detail}</dd> : null}
      </div>)}</dl>
    </details> : null}
  </section>;
}
