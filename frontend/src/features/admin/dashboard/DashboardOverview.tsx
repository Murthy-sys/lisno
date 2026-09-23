import {
  CircleDollarSign,
  Clock3,
  FolderKanban,
  IndianRupee,
  Percent,
  ShieldCheck,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../../auth/AuthProvider";
import { hasFrontendPermission } from "../../../auth/authorization";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Surface } from "../../../components/ui/Surface";
import {
  BudgetPositionChart,
  CostCompositionChart,
  ProjectStatusChart,
  RecordedCostActivityChart
} from "./ExecutiveDashboardCharts";
import {
  dashboardMetricPresentation,
  dashboardMetricUnavailableReason,
  formatBps,
  formatPaise,
  humanize,
  isDashboardMetricUnavailable,
  riskPresentation,
  workerRoleLabel
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

function projectActivityDetail(
  metric: DashboardComparisonMetric | undefined,
  showComparison: boolean
) {
  if (!metric || metric.currentStatus === "unavailable" || metric.current === null) {
    return metric?.currentUnavailableReason ?? "Period project activity is not available in this response.";
  }
  const current = metric.current.toLocaleString("en-IN");
  const noun = metric.current === 1 ? "project" : "projects";
  if (!showComparison) return `${current} ${noun} created in the selected period`;
  if (metric.previousStatus === "unavailable" || metric.previous === null) {
    return `${current} ${noun} created · ${metric.previousUnavailableReason ?? "Previous period unavailable"}`;
  }
  if (metric.changeKind === "new") return `${current} ${noun} created · New versus previous`;
  if (metric.changeKind === "no_change") return `${current} ${noun} created · No change versus previous`;
  if (metric.delta === null || metric.changeBps === null) return `${current} ${noun} created`;
  const delta = metric.delta > 0
    ? `+${metric.delta.toLocaleString("en-IN")}`
    : metric.delta < 0
      ? `−${Math.abs(metric.delta).toLocaleString("en-IN")}`
      : "No change";
  const percentage = `${metric.changeBps > 0 ? "+" : metric.changeBps < 0 ? "−" : ""}${formatBps(Math.abs(metric.changeBps))}`;
  return `${current} ${noun} created · ${delta} (${percentage}) vs previous`;
}

function safeValue(
  dataQuality: DashboardDataQuality,
  metricKey: string,
  value: string | number,
  detail?: string
) {
  return dashboardMetricPresentation(dataQuality, metricKey, value, detail);
}

type MetricTone = "sage" | "sand" | "blue" | "plum" | "danger";

function HeadlineMetric({
  label,
  value,
  detail,
  basis,
  tone,
  icon: Icon,
  unavailable = false
}: {
  label: string;
  value: string;
  detail: string;
  basis: string;
  tone: MetricTone;
  icon: LucideIcon;
  unavailable?: boolean;
}) {
  return (
    <article
      className="dashboard-headline-metric"
      data-tone={tone}
      data-unavailable={unavailable || undefined}
    >
      <span className="dashboard-headline-metric__icon" aria-hidden="true"><Icon /></span>
      <div className="dashboard-headline-metric__body">
        <p className="dashboard-headline-metric__label">{label}</p>
        <strong>{value}</strong>
        <p className="dashboard-headline-metric__detail">{detail}</p>
        <span className="dashboard-headline-metric__basis">{basis}</span>
      </div>
    </article>
  );
}

function PriorityProject({
  data,
  canReadProjects
}: {
  data: SuperAdminDashboardOverview;
  canReadProjects: boolean;
}) {
  const unavailable = isDashboardMetricUnavailable(data.dataQuality, "risk.topProjects");
  const project = unavailable ? undefined : data.risk.topProjects[0];
  const risk = project ? riskPresentation(project.risk.level) : null;
  const title = project?.projectName ?? "No project currently requires priority review";

  return (
    <Surface as="section" className="dashboard-context-card dashboard-priority-project" aria-labelledby="priority-project-heading">
      <div className="dashboard-section-heading dashboard-section-heading--compact">
        <div>
          <p className="eyebrow">Current context</p>
          <h3 id="priority-project-heading">Priority project</h3>
        </div>
        {project && canReadProjects ? (
          <Link to={`/admin/projects/${encodeURIComponent(project.projectId)}`}>View project</Link>
        ) : null}
      </div>
      <div className="dashboard-priority-project__art" aria-hidden="true">
        <span className="dashboard-priority-project__halo" />
        <FolderKanban />
        <span className="dashboard-priority-project__line dashboard-priority-project__line--one" />
        <span className="dashboard-priority-project__line dashboard-priority-project__line--two" />
      </div>
      {unavailable ? (
        <p className="dashboard-unavailable">
          <strong>Priority project is not available.</strong>{" "}
          {dashboardMetricUnavailableReason(data.dataQuality, "risk.topProjects")}
        </p>
      ) : (
        <div className="dashboard-priority-project__content">
          <div>
            <strong>{title}</strong>
            {project ? <span>{humanize(project.projectStatus)}</span> : null}
          </div>
          {risk ? <StatusBadge label={risk.label} tone={risk.tone} /> : <StatusBadge label="Clear" tone="success" />}
          <p>{project?.risk.factors[0]?.reason ?? "No verified project currently appears in the priority queue."}</p>
        </div>
      )}
    </Surface>
  );
}

function ActionQueue({
  data,
  showComparison,
  canReadClientResponses
}: {
  data: SuperAdminDashboardOverview;
  showComparison: boolean;
  canReadClientResponses: boolean;
}) {
  const days = data.period.days;
  const items = [
    { label: "Red-risk projects", value: data.risk.projectDistribution.red, key: "risk.projectDistribution", href: dashboardHref("risk", days, showComparison), tone: "danger" as const },
    { label: "Live overdue projects", value: data.projects.liveOverdue, key: "projects.liveOverdue", href: dashboardHref("projects", days, showComparison), tone: "danger" as const },
    { label: "Overdue execution tasks", value: data.execution.overdue, key: "execution.overdue", href: dashboardHref("execution", days, showComparison), tone: "danger" as const },
    { label: "Budget exceptions", value: data.finance.overBudgetProjectCount, key: "finance.overBudgetProjectCount", href: dashboardHref("finance", days, showComparison), tone: "warning" as const },
    { label: "Pending Client responses", value: data.governance.pendingClientResponses, key: "governance.pendingClientResponses", href: canReadClientResponses ? "/admin/client-responses" : null, tone: "neutral" as const },
    { label: "Failed Client deliveries", value: data.governance.failedClientDeliveries, key: "governance.failedClientDeliveries", href: canReadClientResponses ? "/admin/client-responses" : null, tone: "danger" as const }
  ];

  return (
    <Surface as="section" className="dashboard-context-card dashboard-action-queue" aria-labelledby="dashboard-action-heading">
      <div className="dashboard-section-heading dashboard-section-heading--compact">
        <div>
          <p className="eyebrow">Current queues</p>
          <h3 id="dashboard-action-heading">Action queue</h3>
        </div>
        <Link to={dashboardHref("risk", days, showComparison)}>View all</Link>
      </div>
      <ul className="dashboard-action-list">
        {items.map((item) => {
          const presentation = safeValue(data.dataQuality, item.key, item.value);
          const content = (
            <>
              <span className="dashboard-action-list__marker" data-tone={presentation.unavailable ? "neutral" : item.value === 0 ? "clear" : item.tone} aria-hidden="true" />
              <span><strong>{item.label}</strong><small>{presentation.unavailable ? presentation.detail : item.value === 0 ? "No current items" : "Requires review"}</small></span>
              <b>{presentation.value}</b>
            </>
          );
          return (
            <li key={item.label}>
              {item.href ? <Link to={item.href}>{content}</Link> : <div>{content}</div>}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

function ClientPulse({
  data,
  canReadUsers
}: {
  data: SuperAdminDashboardOverview;
  canReadUsers: boolean;
}) {
  const clients = data.clients;
  const unavailable = !clients || clients.accountsStatus === "unavailable";
  const facts = clients ? [
    ["Registered", clients.registeredAccounts],
    ["Active", clients.activeAccounts],
    ["Linked to projects", clients.clientsWithProjects],
    ["Unlinked projects", clients.unlinkedProjects]
  ] as const : [];
  return (
    <Surface as="section" className="dashboard-context-card dashboard-client-pulse" aria-labelledby="dashboard-client-pulse-heading">
      <div className="dashboard-section-heading dashboard-section-heading--compact">
        <div><p className="eyebrow">Relationships</p><h3 id="dashboard-client-pulse-heading">Client pulse</h3></div>
        {canReadUsers ? <Link to="/admin/users">Directory</Link> : null}
      </div>
      {unavailable ? (
        <p className="dashboard-unavailable"><strong>Client accounts are not available.</strong> {clients?.accountsUnavailableReason ?? "This response predates Client reporting."}</p>
      ) : (
        <dl className="dashboard-client-pulse__facts">
          {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value?.toLocaleString("en-IN") ?? "Not available"}</dd></div>)}
        </dl>
      )}
    </Surface>
  );
}

function ModuleProgress({
  data,
  showComparison
}: {
  data: SuperAdminDashboardOverview;
  showComparison: boolean;
}) {
  const days = data.period.days;
  const rows = [
    {
      tab: "estimation" as const,
      label: "Estimation approvals",
      value: data.estimation.clientApproved,
      max: data.estimation.trackedProjects,
      display: `${data.estimation.clientApproved.toLocaleString("en-IN")} of ${data.estimation.trackedProjects.toLocaleString("en-IN")} tracked`,
      key: "estimation.clientApproved"
    },
    {
      tab: "design" as const,
      label: "Design approval rate",
      value: (data.design.approvalRate.rateBps ?? 0) / 100,
      max: 100,
      display: data.design.approvalRate.rateBps === null ? "Not available" : formatBps(data.design.approvalRate.rateBps),
      key: "design.approvalRate"
    },
    {
      tab: "procurement" as const,
      label: "Procurement progress",
      value: (data.procurement.averageProgress.rateBps ?? 0) / 100,
      max: 100,
      display: data.procurement.averageProgress.rateBps === null ? "Not available" : formatBps(data.procurement.averageProgress.rateBps),
      key: "procurement.averageProgress"
    },
    {
      tab: "execution" as const,
      label: "Execution progress",
      value: (data.execution.weightedProgress.rateBps ?? 0) / 100,
      max: 100,
      display: data.execution.weightedProgress.rateBps === null ? "Not available" : formatBps(data.execution.weightedProgress.rateBps),
      key: "execution.weightedProgress"
    }
  ];
  return (
    <Surface as="section" className="dashboard-support-card dashboard-module-progress" aria-labelledby="dashboard-progress-heading">
      <div className="dashboard-section-heading dashboard-section-heading--compact">
        <div><p className="eyebrow">Delivery path</p><h3 id="dashboard-progress-heading">Module progress</h3></div>
      </div>
      <ol>
        {rows.map((row, index) => {
          const unavailable = isDashboardMetricUnavailable(data.dataQuality, row.key) || row.display === "Not available";
          return (
            <li key={row.tab}>
              <span className="dashboard-progress-step" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <Link to={dashboardHref(row.tab, days, showComparison)}>{row.label}</Link>
                {unavailable ? <span>{isDashboardMetricUnavailable(data.dataQuality, row.key) ? dashboardMetricUnavailableReason(data.dataQuality, row.key) : "No eligible denominator"}</span> : <progress max={Math.max(row.max, 1)} value={row.value} aria-label={row.label} />}
              </div>
              <strong>{unavailable ? "Not available" : row.display}</strong>
            </li>
          );
        })}
      </ol>
    </Surface>
  );
}

function WorkforceSummary({
  data,
  showComparison
}: {
  data: SuperAdminDashboardOverview;
  showComparison: boolean;
}) {
  const unavailable = isDashboardMetricUnavailable(data.dataQuality, "workforce.roleDistribution");
  const maximum = Math.max(1, ...data.workforce.roleDistribution.map((entry) => entry.workerCount));
  return (
    <Surface as="section" className="dashboard-support-card dashboard-workforce-summary" aria-labelledby="dashboard-workforce-heading">
      <div className="dashboard-section-heading dashboard-section-heading--compact">
        <div><p className="eyebrow">Capacity</p><h3 id="dashboard-workforce-heading">Workforce summary</h3></div>
        <Link to={dashboardHref("workforce", data.period.days, showComparison)}>View workforce</Link>
      </div>
      <div className="dashboard-workforce-summary__kpi">
        <span><UsersRound aria-hidden="true" />Active workers</span>
        <strong>{safeValue(data.dataQuality, "workforce.activeWorkers", data.workforce.activeWorkers).value}</strong>
        <span>Average calculated KPI</span>
        <strong>{data.workforce.averageKpi.rateBps === null ? "Not available" : formatBps(data.workforce.averageKpi.rateBps)}</strong>
      </div>
      {unavailable ? (
        <p className="dashboard-unavailable">{dashboardMetricUnavailableReason(data.dataQuality, "workforce.roleDistribution")}</p>
      ) : data.workforce.roleDistribution.length === 0 ? (
        <p className="dashboard-empty-copy">No active workforce roles are currently represented.</p>
      ) : (
        <ul>
          {data.workforce.roleDistribution.map((entry) => (
            <li key={entry.role}>
              <span>{workerRoleLabel(entry.role)}</span>
              <span className="dashboard-workforce-summary__track" aria-hidden="true"><i style={{ width: `${entry.workerCount * 100 / maximum}%` }} /></span>
              <strong>{entry.workerCount.toLocaleString("en-IN")}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className="dashboard-support-note">{data.workforce.kpiEligibleWorkers.toLocaleString("en-IN")} KPI eligible · {data.workforce.kpiUnavailableWorkers.toLocaleString("en-IN")} without KPI data</p>
    </Surface>
  );
}

function DataConfidence({ data }: { data: SuperAdminDashboardOverview }) {
  return (
    <Surface as="section" className="dashboard-data-confidence" aria-labelledby="dashboard-data-confidence-heading">
      <ShieldCheck aria-hidden="true" />
      <div>
        <p className="eyebrow">Exact values &amp; lineage</p>
        <h3 id="dashboard-data-confidence-heading">{data.dataQuality.status === "complete" ? "Verified dashboard response" : "Partial dashboard response"}</h3>
        <p>Every plotted value is repeated in its chart’s exact-value table. Financial values retain integer-paise lineage and UTC dates.</p>
      </div>
      <StatusBadge
        label={data.dataQuality.status === "complete" ? "Complete" : `${data.dataQuality.totalIssueCount} unavailable`}
        tone={data.dataQuality.status === "complete" ? "success" : "warning"}
      />
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

  const projects = safeValue(data.dataQuality, "projects.total", data.projects.total.toLocaleString("en-IN"));
  const revenue = safeValue(data.dataQuality, "finance.approvedSubtotalPaise", formatPaise(data.finance.approvedSubtotalPaise));
  const contract = safeValue(data.dataQuality, "finance.approvedContractTotalPaise", formatPaise(data.finance.approvedContractTotalPaise));
  const gst = safeValue(data.dataQuality, "finance.approvedGstPaise", formatPaise(data.finance.approvedGstPaise));
  const delayed = safeValue(data.dataQuality, "projects.liveOverdue", data.projects.liveOverdue.toLocaleString("en-IN"));
  const marginUnavailable = data.finance.currentMarginBps === null || isDashboardMetricUnavailable(data.dataQuality, "finance.currentMarginBps");
  const marginReason = isDashboardMetricUnavailable(data.dataQuality, "finance.currentMarginBps")
    ? dashboardMetricUnavailableReason(data.dataQuality, "finance.currentMarginBps")
    : "No approved net-revenue denominator is available.";
  const activateLifecycle = (status: DashboardProjectModuleStatus) => {
    navigate(`${dashboardHref("projects", data.period.days, showComparison)}&projectStatus=${encodeURIComponent(status)}`);
  };

  return (
    <div className="dashboard-overview dashboard-overview--executive">
      <section className="dashboard-reporting-context" aria-label="Reporting context">
        <div>
          <span>Observed {utcTimestampFormatter.format(new Date(data.observedAt))}</span>
          <span>Current window {formatUtcDate(data.period.startAt)}–{formatUtcDate(data.period.endAt)}</span>
        </div>
        <p>{data.comparison?.window.partialFinalDay ? "UTC calendar days; the final day is partial." : "UTC reporting window."}{showComparison && data.comparison ? ` Previous window ${formatUtcDate(data.comparison.window.previous.startAt)}–${formatUtcDate(data.comparison.window.previous.endAt)}.` : ""}</p>
      </section>

      <section className="dashboard-headline-grid" aria-labelledby="dashboard-headline-heading">
        <h3 id="dashboard-headline-heading" className="sr-only">Organization headline metrics</h3>
        <HeadlineMetric
          label="Total projects"
          value={String(projects.value)}
          detail={projects.unavailable ? projects.detail ?? "" : projectActivityDetail(data.comparison?.metrics.projects_created, showComparison)}
          basis="Current portfolio total"
          tone="sage"
          icon={FolderKanban}
          unavailable={projects.unavailable}
        />
        <HeadlineMetric
          label="Approved net revenue"
          value={String(revenue.value)}
          detail={revenue.unavailable ? revenue.detail ?? "" : "Client-approved subtotal; GST excluded"}
          basis="Approved finance snapshot"
          tone="sand"
          icon={IndianRupee}
          unavailable={revenue.unavailable}
        />
        <HeadlineMetric
          label="Approved contract value"
          value={String(contract.value)}
          detail={contract.unavailable ? contract.detail ?? "" : gst.unavailable ? `GST context unavailable · ${gst.detail}` : `Includes ${gst.value} GST`}
          basis="Client-approved total"
          tone="blue"
          icon={CircleDollarSign}
          unavailable={contract.unavailable}
        />
        <HeadlineMetric
          label="Current margin"
          value={marginUnavailable ? "Not available" : formatBps(data.finance.currentMarginBps)}
          detail={marginUnavailable ? marginReason : `${formatPaise(data.finance.currentProfitPaise)} current profit`}
          basis="Live net-revenue margin"
          tone="plum"
          icon={Percent}
          unavailable={marginUnavailable}
        />
        <HeadlineMetric
          label="Live overdue projects"
          value={String(delayed.value)}
          detail={delayed.unavailable ? delayed.detail ?? "" : data.projects.liveOverdue === 0 ? "No projects currently overdue" : "Projects needing schedule attention"}
          basis="Current incomplete portfolio"
          tone={data.projects.liveOverdue > 0 ? "danger" : "sage"}
          icon={Clock3}
          unavailable={delayed.unavailable}
        />
      </section>

      <section className="dashboard-executive-canvas" aria-label="Executive analytics">
        <Surface as="article" className="dashboard-executive-card dashboard-executive-card--activity">
          <RecordedCostActivityChart data={data} />
        </Surface>

        <Surface as="article" className="dashboard-executive-card dashboard-executive-card--status">
          <ProjectStatusChart data={data} onActivate={activateLifecycle} />
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

        <aside className="dashboard-executive-rail" aria-label="Current dashboard context">
          <PriorityProject data={data} canReadProjects={canReadProjects} />
          <ActionQueue data={data} showComparison={showComparison} canReadClientResponses={canReadClientResponses} />
          <ClientPulse data={data} canReadUsers={canReadUsers} />
        </aside>

        <Surface as="article" className="dashboard-executive-card dashboard-executive-card--cost">
          <CostCompositionChart data={data} />
        </Surface>

        <Surface as="article" className="dashboard-executive-card dashboard-executive-card--budget">
          <BudgetPositionChart data={data} />
        </Surface>

        <ModuleProgress data={data} showComparison={showComparison} />
        <WorkforceSummary data={data} showComparison={showComparison} />
        <DataConfidence data={data} />
      </section>

      <ModuleLinks data={data} showComparison={showComparison} />
    </div>
  );
}
