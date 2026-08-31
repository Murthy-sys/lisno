import { useEffect, useState, type FormEvent } from "react";

import { WORKER_ROLES } from "../../../api/authorization-contract";
import { Button } from "../../../components/ui/Button";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Surface } from "../../../components/ui/Surface";
import {
  formatBps,
  dashboardMetricPresentation,
  dashboardMetricUnavailableReason,
  humanize,
  isDashboardMetricUnavailable,
  workerRoleLabel
} from "./dashboardPresentation";
import {
  DASHBOARD_KPI_AVAILABILITY,
  DASHBOARD_WORKFORCE_ASSIGNMENT_STATES,
  DASHBOARD_WORKFORCE_CAPACITY_STATES,
  DASHBOARD_WORKFORCE_SORTS,
  type DashboardWorkforceFilters,
  type DashboardWorkforceRow,
  type DashboardDataQuality,
  type SuperAdminDashboardWorkforcePage
} from "./superAdminDashboardApi";

function WorkforceRow({ row, dataQuality, mobile = false }: { row: DashboardWorkforceRow; dataQuality: DashboardDataQuality; mobile?: boolean }) {
  const capacityUnavailable = isDashboardMetricUnavailable(dataQuality, "workforce.capacity");
  const capacity = row.capacityAvailable && !capacityUnavailable
    ? humanize(row.capacityState)
    : "Not available";
  const kpiUnavailable = isDashboardMetricUnavailable(dataQuality, "workforce.kpi");
  const kpi = row.kpi.availability === "available" && !kpiUnavailable
    ? formatBps(row.kpi.scoreBps)
    : "Not available";
  const workloadUnavailable = isDashboardMetricUnavailable(dataQuality, "workforce.workload");
  const assignment = dashboardMetricPresentation(dataQuality, "workforce.assignmentState", humanize(row.assignmentState));
  const activeTasks = dashboardMetricPresentation(dataQuality, "workforce.activeTaskCount", row.activeTaskCount);
  const completedInPeriod = dashboardMetricPresentation(dataQuality, "workforce.completedInPeriod", row.completedInPeriod);
  const effort = workloadUnavailable
    ? <><strong>Not available.</strong> {dashboardMetricUnavailableReason(dataQuality, "workforce.workload")}</>
    : <>{row.completedEffort} completed · {row.remainingEffort} remaining of {row.plannedEffort}</>;
  const workload = workloadUnavailable
    ? <span><strong>Not available.</strong> {dashboardMetricUnavailableReason(dataQuality, "workforce.workload")}</span>
    : <><span>{row.remainingWorkloadPercentage}% remaining</span><ProgressBar value={row.remainingWorkloadPercentage} label={`${row.workerName} remaining workload`} valueText={`${row.remainingEffort} of ${row.plannedEffort} planned effort remains`} /></>;
  if (mobile) return (
    <li className="dashboard-mobile-row">
      <div><strong>{row.workerName}</strong><StatusBadge label={String(assignment.value)} tone={assignment.unavailable ? "neutral" : row.assignmentState === "assigned" ? "info" : "warning"} reason={assignment.detail} /></div>
      <dl>
        <div><dt>Role</dt><dd>{workerRoleLabel(row.role)}</dd></div>
        <div><dt>Active tasks</dt><dd>{activeTasks.value}{activeTasks.unavailable ? ` · ${activeTasks.detail}` : ""}</dd></div>
        <div><dt>Effort</dt><dd>{effort}</dd></div>
        <div><dt>Remaining workload</dt><dd>{workload}</dd></div>
        <div><dt>Capacity</dt><dd>{capacity}{capacityUnavailable ? ` · ${dashboardMetricUnavailableReason(dataQuality, "workforce.capacity")}` : ""}</dd></div>
        <div><dt>Calculated KPI</dt><dd>{kpi}{kpiUnavailable ? ` · ${dashboardMetricUnavailableReason(dataQuality, "workforce.kpi")}` : ` · ${row.kpi.eligibleComponentCount} eligible components`}</dd></div>
      </dl>
    </li>
  );
  return (
    <tr>
      <th scope="row"><strong>{row.workerName}</strong><small>{workerRoleLabel(row.role)}</small></th>
      <td>{assignment.value} · {activeTasks.value} active{assignment.unavailable ? <small>{assignment.detail}</small> : activeTasks.unavailable ? <small>{activeTasks.detail}</small> : null}</td>
      <td>{workload}<small>{effort}</small></td>
      <td>{capacity}{capacityUnavailable ? <small>{dashboardMetricUnavailableReason(dataQuality, "workforce.capacity")}</small> : null}</td>
      <td>{kpi}<small>{kpiUnavailable ? dashboardMetricUnavailableReason(dataQuality, "workforce.kpi") : `${row.kpi.eligibleComponentCount} eligible components`}</small></td>
      <td>{completedInPeriod.value}{completedInPeriod.unavailable ? <small>{completedInPeriod.detail}</small> : null}</td>
    </tr>
  );
}

export function DashboardWorkforceDrilldown({
  filters,
  page,
  refreshing,
  onFiltersChange,
  onPageChange
}: {
  filters: DashboardWorkforceFilters;
  page: SuperAdminDashboardWorkforcePage;
  refreshing: boolean;
  onFiltersChange: (filters: DashboardWorkforceFilters) => void;
  onPageChange: (offset: number) => void;
}) {
  const [search, setSearch] = useState(filters.search ?? "");
  useEffect(() => setSearch(filters.search ?? ""), [filters.search]);
  const update = (next: Partial<DashboardWorkforceFilters>) =>
    onFiltersChange({ ...filters, ...next, offset: 0 });
  const submit = (event: FormEvent) => { event.preventDefault(); update({ search }); };
  const clear = () => {
    setSearch("");
    onFiltersChange({ sort: "workload_desc", limit: 20, offset: 0 });
  };

  return (
    <div className="dashboard-drilldown">
      <Surface as="section" variant="subtle" className="dashboard-filters" aria-label="Workforce filters">
        <form onSubmit={submit}>
          <label><span>Search workers</span><input value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} /></label>
          <label><span>Worker role</span><select value={filters.role ?? ""} onChange={(event) => update({ role: event.target.value as DashboardWorkforceFilters["role"] || undefined })}><option value="">All roles</option>{WORKER_ROLES.map((role) => <option key={role} value={role}>{workerRoleLabel(role)}</option>)}</select></label>
          <label><span>Assignment</span><select value={filters.assignmentState ?? ""} onChange={(event) => update({ assignmentState: event.target.value as DashboardWorkforceFilters["assignmentState"] || undefined })}><option value="">All assignment states</option>{DASHBOARD_WORKFORCE_ASSIGNMENT_STATES.map((state) => <option key={state} value={state}>{humanize(state)}</option>)}</select></label>
          <label><span>Capacity</span><select value={filters.capacityState ?? ""} onChange={(event) => update({ capacityState: event.target.value as DashboardWorkforceFilters["capacityState"] || undefined })}><option value="">All capacity states</option>{DASHBOARD_WORKFORCE_CAPACITY_STATES.map((state) => <option key={state} value={state}>{humanize(state)}</option>)}</select></label>
          <label><span>KPI availability</span><select value={filters.kpiAvailability ?? ""} onChange={(event) => update({ kpiAvailability: event.target.value as DashboardWorkforceFilters["kpiAvailability"] || undefined })}><option value="">All KPI states</option>{DASHBOARD_KPI_AVAILABILITY.map((state) => <option key={state} value={state}>{humanize(state)}</option>)}</select></label>
          <label><span>Sort</span><select value={filters.sort ?? "workload_desc"} onChange={(event) => update({ sort: event.target.value as DashboardWorkforceFilters["sort"] })}>{DASHBOARD_WORKFORCE_SORTS.map((sort) => <option key={sort} value={sort}>{humanize(sort)}</option>)}</select></label>
          <div className="dashboard-filters__actions"><Button type="submit">Search</Button><Button type="button" variant="secondary" onClick={clear}>Clear filters</Button></div>
        </form>
      </Surface>

      <p className="dashboard-result-count" role="status" aria-live="polite">{page.pagination.total} {page.pagination.total === 1 ? "worker" : "workers"}{refreshing ? " · Refreshing results…" : ""}</p>
      {page.items.length === 0 ? <Surface as="section" className="dashboard-no-match"><p>No workers match these filters.</p><Button variant="secondary" onClick={clear}>Clear filters</Button></Surface> : <>
        <div className="dashboard-table-wrap dashboard-workforce-table"><table><caption>Workforce workload and calculated KPI</caption><thead><tr><th>Worker</th><th>Assignment</th><th>Remaining workload</th><th>Capacity</th><th>Calculated KPI</th><th>Completed in period</th></tr></thead><tbody>{page.items.map((row) => <WorkforceRow key={row.workerId} row={row} dataQuality={page.dataQuality} />)}</tbody></table></div>
        <ol className="dashboard-mobile-rows">{page.items.map((row) => <WorkforceRow key={row.workerId} row={row} dataQuality={page.dataQuality} mobile />)}</ol>
      </>}
      <div className="dashboard-pagination" aria-label="Workforce result pages"><Button variant="secondary" disabled={page.pagination.offset === 0} onClick={() => onPageChange(Math.max(0, page.pagination.offset - page.pagination.limit))}>Previous</Button><span>{page.pagination.offset + (page.items.length ? 1 : 0)}–{page.pagination.offset + page.items.length} of {page.pagination.total}</span><Button variant="secondary" disabled={!page.pagination.hasMore} onClick={() => onPageChange(page.pagination.offset + page.pagination.limit)}>Next</Button></div>
    </div>
  );
}
