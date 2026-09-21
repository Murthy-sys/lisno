import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../../auth/AuthProvider";
import { hasFrontendPermission } from "../../../auth/authorization";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Surface } from "../../../components/ui/Surface";
import {
  ClientPortfolioChart,
  FinancialHealthEChart,
  GrowthComparisonChart,
  ProjectLifecycleEChart
} from "./DashboardOverviewCharts";
import {
  dashboardMetricPresentation,
  dashboardMetricUnavailableReason,
  formatBps,
  formatPaise,
  isDashboardMetricUnavailable,
  riskPresentation
} from "./dashboardPresentation";
import type {
  DashboardComparisonMetric,
  DashboardDataQuality,
  DashboardProjectModuleStatus,
  DashboardTab,
  SuperAdminDashboardOverview
} from "./superAdminDashboardApi";

const utcDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

const utcTimestampFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short"
});

const formatUtcDate = (value: string) => utcDateFormatter.format(new Date(value));

const dashboardHref = (tab: DashboardTab, days: number, showComparison: boolean) =>
  `/admin/dashboard?tab=${tab}&periodDays=${days}${showComparison ? "" : "&comparison=off"}`;

function comparisonDetail(
  metric: DashboardComparisonMetric | undefined,
  label: string,
  showComparison: boolean,
  formatter: (value: number) => string = (value) => value.toLocaleString("en-IN")
) {
  if (!metric || metric.currentStatus === "unavailable" || metric.current === null) {
    return metric?.currentUnavailableReason ?? `${label} comparison is not available in this response.`;
  }

  const current = formatter(metric.current);
  if (!showComparison) return `${current} ${label} in the current period`;
  if (metric.previousStatus === "unavailable" || metric.previous === null) {
    return `${current} ${label} · ${metric.previousUnavailableReason ?? "Previous period unavailable"}`;
  }
  if (metric.changeKind === "new") return `${current} ${label} · New versus the previous period`;
  if (metric.changeKind === "no_change") return `${current} ${label} · No change versus the previous period`;
  if (metric.delta === null || metric.changeBps === null) return `${current} ${label}`;
  const delta = formatter(Math.abs(metric.delta));
  const direction = metric.delta > 0 ? `+${delta}` : metric.delta < 0 ? `−${delta}` : "No change";
  return `${current} ${label} · ${direction} (${formatBps(metric.changeBps)}) vs previous`;
}

function HeadlineMetric({
  label,
  value,
  detail,
  basis,
  accent = "violet"
}: {
  label: string;
  value: string;
  detail: string;
  basis: string;
  accent?: "violet" | "teal" | "amber" | "ink";
}) {
  return (
    <article className="dashboard-headline-metric" data-accent={accent}>
      <p className="dashboard-headline-metric__label">{label}</p>
      <strong>{value}</strong>
      <p>{detail}</p>
      <span>{basis}</span>
    </article>
  );
}

function safeValue(
  dataQuality: DashboardDataQuality,
  metricKey: string,
  value: string | number
) {
  return dashboardMetricPresentation(dataQuality, metricKey, value);
}

function ClientRelationships({ data }: { data: SuperAdminDashboardOverview }) {
  const clients = data.clients;
  if (!clients || clients.relationshipsStatus === "unavailable") {
    return (
      <p className="dashboard-unavailable">
        <strong>Client relationships are not available.</strong>{" "}
        {clients?.relationshipsUnavailableReason ?? "This response predates Client relationship reporting."}
      </p>
    );
  }
  return (
    <dl className="dashboard-client-facts">
      <div><dt>Clients linked to projects</dt><dd>{clients.clientsWithProjects?.toLocaleString("en-IN") ?? "Not available"}</dd></div>
      <div><dt>With active projects</dt><dd>{clients.clientsWithActiveProjects?.toLocaleString("en-IN") ?? "Not available"}</dd></div>
      <div><dt>Unlinked projects</dt><dd>{clients.unlinkedProjects?.toLocaleString("en-IN") ?? "Not available"}</dd></div>
      <div><dt>Invalid Client links</dt><dd>{clients.invalidProjectClientLinks?.toLocaleString("en-IN") ?? "Not available"}</dd></div>
    </dl>
  );
}

function NeedsAttention({
  data,
  showComparison,
  canReadClientResponses,
  canReadProjects
}: {
  data: SuperAdminDashboardOverview;
  showComparison: boolean;
  canReadClientResponses: boolean;
  canReadProjects: boolean;
}) {
  const days = data.period.days;
  const items = [
    { label: "Red-risk projects", value: data.risk.projectDistribution.red, key: "risk.projectDistribution", href: dashboardHref("risk", days, showComparison), tone: "danger" as const },
    { label: "Overdue execution tasks", value: data.execution.overdue, key: "execution.overdue", href: dashboardHref("execution", days, showComparison), tone: "danger" as const },
    { label: "Budget exceptions", value: data.finance.overBudgetProjectCount, key: "finance.overBudgetProjectCount", href: dashboardHref("finance", days, showComparison), tone: "warning" as const },
    { label: "Unassigned overdue tasks", value: data.execution.overdueUnassigned, key: "execution.overdueUnassigned", href: dashboardHref("execution", days, showComparison), tone: "warning" as const },
    { label: "Pending Client responses", value: data.governance.pendingClientResponses, key: "governance.pendingClientResponses", href: canReadClientResponses ? "/admin/client-responses" : null, tone: "neutral" as const },
    { label: "Failed Client deliveries", value: data.governance.failedClientDeliveries, key: "governance.failedClientDeliveries", href: canReadClientResponses ? "/admin/client-responses" : null, tone: "danger" as const }
  ];

  return (
    <Surface as="section" className="dashboard-attention" aria-labelledby="dashboard-attention-heading">
      <div className="dashboard-section-heading">
        <div><p className="eyebrow">Priority now</p><h3 id="dashboard-attention-heading">Needs attention</h3></div>
        <Link to={dashboardHref("risk", days, showComparison)}>Open risk workspace</Link>
      </div>
      <ul className="dashboard-attention-list">
        {items.map((item) => {
          const presentation = safeValue(data.dataQuality, item.key, item.value);
          const content = <><span>{item.label}</span><strong>{presentation.value}</strong><StatusBadge label={presentation.unavailable ? "Unavailable" : item.value === 0 ? "Clear" : "Review"} tone={presentation.unavailable ? "neutral" : item.value === 0 ? "success" : item.tone} /></>;
          return (
            <li key={item.label}>
              {item.href ? <Link to={item.href}>{content}</Link> : <div className="dashboard-attention-list__fact">{content}</div>}
              {presentation.unavailable ? <small>{presentation.detail}</small> : null}
            </li>
          );
        })}
      </ul>
      {isDashboardMetricUnavailable(data.dataQuality, "risk.topProjects") ? (
        <p className="dashboard-unavailable"><strong>Top affected projects are unavailable.</strong> {dashboardMetricUnavailableReason(data.dataQuality, "risk.topProjects")}</p>
      ) : data.risk.topProjects.length > 0 ? (
        <ol className="dashboard-top-projects" aria-label="Highest-priority projects">
          {data.risk.topProjects.slice(0, 3).map((project) => {
            const risk = riskPresentation(project.risk.level);
            return (
              <li key={project.projectId}>
                <div>{canReadProjects ? <Link to={`/admin/projects/${encodeURIComponent(project.projectId)}`}>{project.projectName}</Link> : <strong>{project.projectName}</strong>}<span>{project.risk.factors[0]?.reason ?? "Review current project signals."}</span></div>
                <StatusBadge label={risk.label} tone={risk.tone} />
              </li>
            );
          })}
        </ol>
      ) : null}
    </Surface>
  );
}

function ModuleLinks({
  data,
  showComparison
}: {
  data: SuperAdminDashboardOverview;
  showComparison: boolean;
}) {
  const days = data.period.days;
  const links: Array<{ tab: Exclude<DashboardTab, "overview" | "projects">; label: string; value: string; detail: string; metricKey: string }> = [
    { tab: "estimation", label: "Estimation", value: `${data.estimation.clientApproved} Client approved`, detail: `${data.estimation.awaitingClient} awaiting Client`, metricKey: "estimation.clientApproved" },
    { tab: "design", label: "Design", value: `${data.design.approved} approved`, detail: `${data.design.changesRequested} changes requested`, metricKey: "design.approved" },
    { tab: "procurement", label: "Procurement", value: `${data.procurement.inProgress} in progress`, detail: `${data.procurement.completed} completed`, metricKey: "procurement.inProgress" },
    { tab: "finance", label: "Finance", value: formatPaise(data.finance.currentProfitPaise), detail: "Current profit (live)", metricKey: "finance.currentProfitPaise" },
    { tab: "execution", label: "Execution", value: `${data.execution.overdue} overdue`, detail: `${data.execution.unassigned} unassigned`, metricKey: "execution.overdue" },
    { tab: "workforce", label: "Workforce", value: `${data.workforce.activeWorkers} active`, detail: `${data.workforce.kpiUnavailableWorkers} KPI unavailable`, metricKey: "workforce.activeWorkers" },
    { tab: "risk", label: "Risk", value: `${data.projects.atRisk} at risk`, detail: `${data.risk.projectDistribution.red} red · ${data.risk.projectDistribution.yellow} yellow`, metricKey: "risk.projectDistribution" }
  ];
  return (
    <section aria-labelledby="dashboard-modules-heading" className="dashboard-modules-compact">
      <div className="dashboard-section-heading">
        <div><p className="eyebrow">Operational areas</p><h3 id="dashboard-modules-heading">Module summaries</h3></div>
        <p>Organization totals remain independent from detail filters.</p>
      </div>
      <div className="dashboard-module-links">
        {links.map((item) => {
          const presentation = safeValue(data.dataQuality, item.metricKey, item.value);
          return (
            <Link key={item.tab} to={dashboardHref(item.tab, days, showComparison)}>
              <span>{item.label}</span><strong>{presentation.value}</strong><small>{presentation.unavailable ? presentation.detail : item.detail}</small>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function DashboardOverview({
  data,
  showComparison = true
}: {
  data: SuperAdminDashboardOverview;
  showComparison?: boolean;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const canReadUsers = hasFrontendPermission(auth.authorization, "identity.users.read");
  const canReadProjects = hasFrontendPermission(auth.authorization, "projects.read");
  const canReadClientResponses = hasFrontendPermission(auth.authorization, "estimation.client_response_tasks.read");
  const comparison = data.comparison;
  const projects = safeValue(data.dataQuality, "projects.total", data.projects.total.toLocaleString("en-IN"));
  const revenue = safeValue(data.dataQuality, "finance.approvedSubtotalPaise", formatPaise(data.finance.approvedSubtotalPaise));
  const clientValue = !data.clients || data.clients.accountsStatus === "unavailable" || data.clients.registeredAccounts === null
    ? { value: "Not available", detail: data.clients?.accountsUnavailableReason ?? "Client account reporting is not available in this response.", unavailable: true as const }
    : { value: data.clients.registeredAccounts.toLocaleString("en-IN"), detail: "", unavailable: false as const };
  const expenseMetric = comparison?.metrics.recorded_expenses_paise;
  const expenseValue = expenseMetric?.currentStatus === "available" && expenseMetric.current !== null
    ? formatPaise(expenseMetric.current)
    : "Not available";
  const expenseDetail = comparisonDetail(expenseMetric, "recorded expenses", showComparison, formatPaise);
  const projectActivity = comparison?.metrics.projects_created;
  const clientActivity = comparison?.metrics.clients_created;
  const projectDetail = projects.unavailable
    ? projects.detail
    : comparisonDetail(projectActivity, projectActivity?.current === 1 ? "project created" : "projects created", showComparison);
  const clientDetail = clientValue.unavailable
    ? clientValue.detail
    : comparisonDetail(clientActivity, clientActivity?.current === 1 ? "Client account created" : "Client accounts created", showComparison);
  const activateLifecycle = (status: DashboardProjectModuleStatus) => {
    navigate(`${dashboardHref("projects", data.period.days, showComparison)}&projectStatus=${encodeURIComponent(status)}`);
  };

  return (
    <div className="dashboard-overview dashboard-overview--echarts">
      <section className="dashboard-reporting-context" aria-label="Reporting context">
        <div>
          <span>Observed {utcTimestampFormatter.format(new Date(data.observedAt))}</span>
          {comparison ? <span>Current window {formatUtcDate(comparison.window.current.startAt)}–{formatUtcDate(comparison.window.current.endAt)}</span> : <span>Current window {formatUtcDate(data.period.startAt)}–{formatUtcDate(data.period.endAt)}</span>}
        </div>
        <p>{comparison?.window.partialFinalDay ? "UTC calendar days; the final day is partial." : "UTC reporting window."}{showComparison && comparison ? ` Previous window ${formatUtcDate(comparison.window.previous.startAt)}–${formatUtcDate(comparison.window.previous.endAt)}.` : ""}</p>
      </section>

      <section className="dashboard-headline-grid" aria-labelledby="dashboard-headline-heading">
        <h3 id="dashboard-headline-heading" className="sr-only">Organization headline metrics</h3>
        <HeadlineMetric label="Projects" value={String(projects.value)} detail={projectDetail ?? ""} basis="Current total · period activity" accent="violet" />
        <HeadlineMetric label="Registered Clients" value={clientValue.value} detail={clientDetail} basis="Current Client accounts" accent="teal" />
        <HeadlineMetric label="Approved net revenue" value={String(revenue.value)} detail={revenue.unavailable ? revenue.detail ?? "" : "Current approved baseline; GST excluded"} basis="Current snapshot" accent="ink" />
        <HeadlineMetric label="Recorded expenses" value={expenseValue} detail={expenseDetail} basis={`Selected ${data.period.days}-day incurred period`} accent="amber" />
      </section>

      <section className="dashboard-primary-grid" aria-label="Growth and Client portfolio">
        <Surface as="article" className="dashboard-chart-card dashboard-chart-card--hero">
          <GrowthComparisonChart data={data} showComparison={showComparison} />
        </Surface>
        <Surface as="article" className="dashboard-chart-card dashboard-client-panel">
          <ClientPortfolioChart data={data} />
          <ClientRelationships data={data} />
          {canReadUsers ? <Link className="dashboard-text-link" to="/admin/users">Open user directory</Link> : null}
          <p className="dashboard-panel-note">Account creation uses the current Client-role cohort. Role changes are not counted as new registrations.</p>
        </Surface>
      </section>

      <section className="dashboard-lower-grid" aria-label="Lifecycle and financial health">
        <Surface as="article" className="dashboard-chart-card">
          <ProjectLifecycleEChart data={data} onActivate={activateLifecycle} />
          <nav className="dashboard-lifecycle-links" aria-label="Filter projects by lifecycle stage">
            {[
              ["planning", "Planning", data.projects.planning],
              ["active", "Active", data.projects.active],
              ["on_hold", "On hold", data.projects.onHold],
              ["completed", "Completed", data.projects.completed]
            ].map(([status, label, value]) => (
              <Link key={String(status)} to={`${dashboardHref("projects", data.period.days, showComparison)}&projectStatus=${status}`}>
                <span>{label}</span><strong>{safeValue(data.dataQuality, `projects.${status === "on_hold" ? "onHold" : status}`, value).value}</strong>
              </Link>
            ))}
          </nav>
        </Surface>
        <Surface as="article" className="dashboard-chart-card">
          <FinancialHealthEChart data={data} />
          <dl className="dashboard-finance-facts">
            {([
              ["Procurement", "finance.procurementCostPaise", data.finance.procurementCostPaise],
              ["Employee payments", "finance.employeePaymentPaise", data.finance.employeePaymentPaise],
              ["Other expenses", "finance.otherExpensePaise", data.finance.otherExpensePaise],
              ["Overheads", "finance.overheadPaise", data.finance.overheadPaise]
            ] as const).map(([label, key, value]) => {
              const presentation = safeValue(data.dataQuality, key, formatPaise(value));
              return <div key={key}><dt>{label}</dt><dd>{presentation.value}</dd>{presentation.unavailable ? <small>{presentation.detail}</small> : null}</div>;
            })}
          </dl>
          <Link className="dashboard-text-link" to={dashboardHref("finance", data.period.days, showComparison)}>View finance details</Link>
        </Surface>
      </section>

      <NeedsAttention data={data} showComparison={showComparison} canReadClientResponses={canReadClientResponses} canReadProjects={canReadProjects} />
      <ModuleLinks data={data} showComparison={showComparison} />
    </div>
  );
}
