import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Surface } from "../../../components/ui/Surface";
import {
  formatBps,
  formatDashboardDate,
  formatDashboardRatio,
  formatNullablePaise,
  formatPaise,
  humanize,
  dashboardMetricPresentation,
  dashboardMetricUnavailableReason,
  isDashboardMetricUnavailable,
  riskPresentation
} from "./dashboardPresentation";
import {
  DASHBOARD_PROJECT_MODULE_STATUSES,
  DASHBOARD_PROJECT_SORTS,
  DASHBOARD_RISK_FACTORS,
  DASHBOARD_RISK_LEVELS,
  type DashboardProjectFilters,
  type DashboardProjectRow,
  type DashboardDataQuality,
  type DashboardTab,
  type SuperAdminDashboardProjectsPage
} from "./superAdminDashboardApi";

function ModuleSummary({ tab, row, dataQuality }: { tab: DashboardTab; row: DashboardProjectRow; dataQuality: DashboardDataQuality }) {
  const moduleKey = tab === "projects" ? "projects.rows" : `${tab}.rows`;
  if (isDashboardMetricUnavailable(dataQuality, moduleKey)) {
    return <span><strong>Not available.</strong> {dashboardMetricUnavailableReason(dataQuality, moduleKey)}</span>;
  }
  if (tab === "estimation") return row.estimate ? (
    <span>{humanize(row.estimate.status)} · v{row.estimate.version}{row.estimate.reviewRoundId ? " · review recorded" : ""}</span>
  ) : <span>Not available · no estimate</span>;
  if (tab === "design") return row.designPlan ? (
    <span>{humanize(row.designPlan.status)} · v{row.designPlan.version}{row.designPlan.reviewRoundId ? " · review recorded" : ""}</span>
  ) : <span>Not available · no Design Plan</span>;
  if (tab === "procurement") {
    if (!row.procurement) return <span>Not available · not eligible</span>;
    const metrics = [
      dashboardMetricPresentation(dataQuality, "procurement.averageProgress", `${row.procurement.progress}%`),
      dashboardMetricPresentation(dataQuality, "procurement.postedSpendPaise", formatPaise(row.procurement.postedSpendPaise)),
      dashboardMetricPresentation(dataQuality, "procurement.approvedAmountPaise", formatNullablePaise(row.procurement.approvedAmountPaise))
    ];
    const unavailable = metrics.find((metric) => metric.unavailable);
    return <span>{humanize(row.procurement.status)} · {metrics[0].value} · {metrics[1].value} posted of {metrics[2].value} approved{unavailable ? <small>{unavailable.detail}</small> : null}</span>;
  }
  if (tab === "finance") {
    if (!row.finance) return <span>Not available · no approved finance baseline</span>;
    const metrics = [
      dashboardMetricPresentation(dataQuality, "finance.approvedSubtotalPaise", formatPaise(row.finance.approvedSubtotalPaise)),
      dashboardMetricPresentation(dataQuality, "finance.recordedCostPaise", formatPaise(row.finance.recordedCostPaise)),
      dashboardMetricPresentation(dataQuality, "finance.currentMarginBps", formatBps(row.finance.currentMarginBps))
    ];
    const unavailable = metrics.find((metric) => metric.unavailable);
    return <span>{metrics[0].value} approved net · {metrics[1].value} recorded · {metrics[2].value} current margin{unavailable ? <small>{unavailable.detail}</small> : null}</span>;
  }
  if (tab === "execution") {
    const metrics = [
      dashboardMetricPresentation(dataQuality, "execution.taskCount", row.execution.taskCount),
      dashboardMetricPresentation(dataQuality, "execution.overdueTaskCount", row.execution.overdueTaskCount),
      dashboardMetricPresentation(dataQuality, "execution.weightedProgress", formatDashboardRatio(row.execution.progress))
    ];
    const unavailable = metrics.find((metric) => metric.unavailable);
    return <span>{metrics[0].value} tasks · {metrics[1].value} overdue · {metrics[2].value} weighted progress{unavailable ? <small>{unavailable.detail}</small> : null}</span>;
  }
  if (tab === "risk") return (
    isDashboardMetricUnavailable(dataQuality, "risk.factorDistribution") ? (
      <span><strong>Not available.</strong> {dashboardMetricUnavailableReason(dataQuality, "risk.factorDistribution")}</span>
    ) : row.risk.factors.length ? (
      <ul className="dashboard-row-risk-reasons">
        {row.risk.factors.map((factor) => (
          <li key={`${factor.source.entityType}-${factor.source.entityId}-${factor.reasonCode}`}>
            <Link to={factor.drillDownTarget}>{factor.reason}</Link>
            <small>{humanize(factor.kind)} · observed {String(factor.observedValue ?? "Not available")}{factor.threshold === null ? "" : ` · threshold ${String(factor.threshold)}`}</small>
          </li>
        ))}
      </ul>
    ) : <span>No eligible risk factor</span>
  );
  const taskCount = dashboardMetricPresentation(dataQuality, "execution.taskCount", row.execution.taskCount);
  const currentProfit = dashboardMetricPresentation(dataQuality, "finance.currentProfitPaise", row.finance ? formatPaise(row.finance.currentProfitPaise) : "Finance not available");
  const unavailable = [taskCount, currentProfit].find((metric) => metric.unavailable);
  return <span>{row.manager?.name ?? "No manager"} · {taskCount.value} execution tasks · {currentProfit.value}{unavailable ? <small>{unavailable.detail}</small> : null}</span>;
}

function ProjectRow({ tab, row, dataQuality, mobile = false }: { tab: DashboardTab; row: DashboardProjectRow; dataQuality: DashboardDataQuality; mobile?: boolean }) {
  const riskUnavailable = isDashboardMetricUnavailable(dataQuality, "risk.projectDistribution");
  const risk = riskUnavailable
    ? { label: "Not available", tone: "neutral" as const }
    : riskPresentation(row.risk.level);
  const link = `/admin/projects/${encodeURIComponent(row.projectId)}`;
  if (mobile) return (
    <li className="dashboard-mobile-row">
      <div><Link to={link}>{row.projectName}</Link><StatusBadge label={risk.label} tone={risk.tone} /></div>
      <dl>
        <div><dt>Status</dt><dd>{humanize(row.projectStatus)}</dd></div>
        <div><dt>Location</dt><dd>{row.location}</dd></div>
        <div><dt>Planned deadline</dt><dd>{formatDashboardDate(row.plannedEndAt)}</dd></div>
        <div><dt>{humanize(tab)} details</dt><dd><ModuleSummary tab={tab} row={row} dataQuality={dataQuality} /></dd></div>
      </dl>
      <Link to={link}>Open project</Link>
    </li>
  );
  return (
    <tr>
      <th scope="row"><Link to={link}>{row.projectName}</Link><small>{row.location}</small></th>
      <td>{humanize(row.projectStatus)}</td>
      <td><ModuleSummary tab={tab} row={row} dataQuality={dataQuality} />{tab === "procurement" && row.procurement && !isDashboardMetricUnavailable(dataQuality, "procurement.averageProgress") ? <ProgressBar value={row.procurement.progress} label={`${row.projectName} procurement progress`} valueText={`${row.procurement.progress}%`} /> : null}</td>
      <td>{formatDashboardDate(row.plannedEndAt)}</td>
      <td><StatusBadge label={risk.label} tone={risk.tone} reason={riskUnavailable ? dashboardMetricUnavailableReason(dataQuality, "risk.projectDistribution") : row.risk.factors[0]?.reason} /></td>
      <td><Link to={link}>Open</Link></td>
    </tr>
  );
}

export function DashboardProjectDrilldown({
  tab,
  filters,
  page,
  refreshing,
  onFiltersChange,
  onPageChange
}: {
  tab: Exclude<DashboardTab, "overview" | "workforce">;
  filters: DashboardProjectFilters;
  page: SuperAdminDashboardProjectsPage;
  refreshing: boolean;
  onFiltersChange: (filters: DashboardProjectFilters) => void;
  onPageChange: (offset: number) => void;
}) {
  const [search, setSearch] = useState(filters.search ?? "");
  useEffect(() => setSearch(filters.search ?? ""), [filters.search]);
  const update = (next: Partial<DashboardProjectFilters>) =>
    onFiltersChange({ ...filters, ...next, offset: 0 });
  const submit = (event: FormEvent) => { event.preventDefault(); update({ search }); };
  const noMatches = page.items.length === 0;

  return (
    <div className="dashboard-drilldown">
      <Surface as="section" variant="subtle" className="dashboard-filters" aria-label={`${humanize(tab)} filters`}>
        <form onSubmit={submit}>
          <label><span>Search projects</span><input value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} /></label>
          <label><span>Project status</span><select value={filters.projectStatus ?? ""} onChange={(event) => update({ projectStatus: event.target.value as DashboardProjectFilters["projectStatus"] || undefined })}><option value="">All statuses</option><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></label>
          <label><span>Module status</span><select value={filters.moduleStatus ?? ""} onChange={(event) => update({ moduleStatus: event.target.value as DashboardProjectFilters["moduleStatus"] || undefined })}><option value="">All module states</option>{DASHBOARD_PROJECT_MODULE_STATUSES.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></label>
          {tab === "risk" ? <>
            <label><span>Risk level</span><select value={filters.riskLevel ?? ""} onChange={(event) => update({ riskLevel: event.target.value as DashboardProjectFilters["riskLevel"] || undefined })}><option value="">All risk levels</option>{DASHBOARD_RISK_LEVELS.map((level) => <option key={level} value={level}>{humanize(level)}</option>)}</select></label>
            <label><span>Risk factor</span><select value={filters.riskFactor ?? ""} onChange={(event) => update({ riskFactor: event.target.value as DashboardProjectFilters["riskFactor"] || undefined })}><option value="">All factor families</option>{DASHBOARD_RISK_FACTORS.map((factor) => <option key={factor} value={factor}>{humanize(factor)}</option>)}</select></label>
          </> : null}
          <label><span>Sort</span><select value={filters.sort ?? "risk_desc"} onChange={(event) => update({ sort: event.target.value as DashboardProjectFilters["sort"] })}>{DASHBOARD_PROJECT_SORTS.map((sort) => <option key={sort} value={sort}>{humanize(sort)}</option>)}</select></label>
          <div className="dashboard-filters__actions"><Button type="submit">Search</Button><Button type="button" variant="secondary" onClick={() => { setSearch(""); onFiltersChange({ module: filters.module, sort: "risk_desc", limit: 20, offset: 0 }); }}>Clear filters</Button></div>
        </form>
      </Surface>

      <p className="dashboard-result-count" role="status" aria-live="polite">
        {page.pagination.total} {page.pagination.total === 1 ? "project" : "projects"}{refreshing ? " · Refreshing results…" : ""}
      </p>

      {noMatches ? <Surface as="section" className="dashboard-no-match"><p>No projects match these filters.</p><Button variant="secondary" onClick={() => { setSearch(""); onFiltersChange({ module: filters.module, sort: "risk_desc", limit: 20, offset: 0 }); }}>Clear filters</Button></Surface> : (
        <>
          <div className="dashboard-table-wrap dashboard-project-table">
            <table><caption>{humanize(tab)} project drill-down</caption><thead><tr><th>Project</th><th>Status</th><th>{humanize(tab)} details</th><th>Planned deadline</th><th>Risk</th><th>Action</th></tr></thead><tbody>{page.items.map((row) => <ProjectRow key={row.projectId} tab={tab} row={row} dataQuality={page.dataQuality} />)}</tbody></table>
          </div>
          <ol className="dashboard-mobile-rows">{page.items.map((row) => <ProjectRow key={row.projectId} tab={tab} row={row} dataQuality={page.dataQuality} mobile />)}</ol>
        </>
      )}

      <div className="dashboard-pagination" aria-label="Project result pages">
        <Button variant="secondary" disabled={page.pagination.offset === 0} onClick={() => onPageChange(Math.max(0, page.pagination.offset - page.pagination.limit))}>Previous</Button>
        <span>{page.pagination.offset + (page.items.length ? 1 : 0)}–{page.pagination.offset + page.items.length} of {page.pagination.total}</span>
        <Button variant="secondary" disabled={!page.pagination.hasMore} onClick={() => onPageChange(page.pagination.offset + page.pagination.limit)}>Next</Button>
      </div>
    </div>
  );
}
