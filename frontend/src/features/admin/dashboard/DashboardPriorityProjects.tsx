import { Link } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { Surface } from "../../../components/ui/Surface";
import {
  dashboardMetricUnavailableReason,
  formatBps,
  formatDashboardDate,
  formatDashboardTimestamp,
  humanize,
  isDashboardMetricUnavailable,
  riskPresentation
} from "./dashboardPresentation";
import type { DashboardPriorityQuery } from "./dashboardViewModel";
import type { DashboardDataQuality, DashboardProjectRow } from "./superAdminDashboardApi";

export function priorityProjectPresentation(row: DashboardProjectRow, quality: DashboardDataQuality) {
  const progress = row.execution.progress;
  const progressUnavailable = isDashboardMetricUnavailable(quality, "execution.weightedProgress");
  const progressAvailable = !progressUnavailable && progress.rateBps !== null && progress.denominator > 0;
  const riskUnavailable = isDashboardMetricUnavailable(quality, "risk.projectDistribution");
  return {
    progressBps: progressAvailable ? progress.rateBps : null,
    progressLabel: progressAvailable ? formatBps(progress.rateBps) : "Not available",
    progressReason: progressUnavailable
      ? dashboardMetricUnavailableReason(quality, "execution.weightedProgress")
      : progressAvailable ? `${progress.numerator} of ${progress.denominator} effort units · ${progress.fallbackTaskCount} fallback tasks` : "No eligible execution progress denominator.",
    risk: riskUnavailable ? { label: "Not available", tone: "neutral" as const } : riskPresentation(row.risk.level),
    riskReason: riskUnavailable ? dashboardMetricUnavailableReason(quality, "risk.projectDistribution") : row.risk.factors[0]?.reason,
    manager: row.manager?.name ?? "Unassigned",
    dueDate: formatDashboardDate(row.plannedEndAt)
  };
}

export function DashboardPriorityProjects({ query, canReadProjects, viewAllHref }: {
  query: DashboardPriorityQuery;
  canReadProjects: boolean;
  viewAllHref: string;
}) {
  const page = query.isPlaceholderData ? undefined : query.data;
  const unavailable = page && isDashboardMetricUnavailable(page.dataQuality, "projects.rows");
  return <Surface as="section" className="dashboard-context-card dashboard-priority-projects" aria-labelledby="dashboard-priority-projects-heading">
    <div className="dashboard-section-heading dashboard-section-heading--compact">
      <h3 id="dashboard-priority-projects-heading">Priority projects</h3>
      <Link id="dashboard-priority-projects" data-dashboard-origin="dashboard-priority-projects" to={viewAllHref}>View all projects</Link>
    </div>
    <p className="dashboard-support-note">Up to five projects, ordered by risk. Progress reflects execution tasks.</p>
    {query.isError ? <div className="dashboard-section-feedback" role="status">
      <p>{page ? "Showing previous priority projects; refresh failed." : "Priority projects are unavailable. Other dashboard sections remain available."}</p>
      <Button variant="quiet" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry priority projects</Button>
    </div> : null}
    {!page && !query.isError ? <p className="dashboard-section-loading" role="status">Loading priority projects…</p> : null}
    {page && query.isFetching ? <p role="status" className="dashboard-support-note">Refreshing priority projects…</p> : null}
    {page ? <>
      {unavailable ? <p className="dashboard-unavailable">{dashboardMetricUnavailableReason(page.dataQuality, "projects.rows")}</p> : page.items.length === 0 ? <p className="dashboard-empty-copy">No projects are available in the current portfolio.</p> : <div className="dashboard-table-wrap dashboard-priority-table" role="region" aria-label="Priority project records" tabIndex={0}>
        <table>
          <caption className="sr-only">Priority projects ordered by risk</caption>
          <thead><tr><th scope="col">Project</th><th scope="col">Execution progress</th><th scope="col">Manager</th><th scope="col">Due date</th></tr></thead>
          <tbody>{page.items.slice(0, 5).map((row) => {
            const presentation = priorityProjectPresentation(row, page.dataQuality);
            return <tr key={row.projectId}>
              <th scope="row">
                {canReadProjects ? <Link to={`/admin/projects/${encodeURIComponent(row.projectId)}`}>{row.projectName}</Link> : <span>{row.projectName}</span>}
                <small className="dashboard-priority-project-state">{humanize(row.projectStatus)}</small>
                <span className={`dashboard-status dashboard-status--${presentation.risk.tone}`} title={presentation.riskReason}>{presentation.risk.label}</span>
              </th>
              <td><div className="dashboard-priority-progress">
                {presentation.progressBps !== null ? <progress max={10_000} value={presentation.progressBps} aria-label={`${row.projectName} execution progress`} aria-valuetext={presentation.progressLabel} /> : null}
                <span title={presentation.progressReason}>{presentation.progressLabel}</span>
                {presentation.progressBps === null ? <small>{presentation.progressReason}</small> : <span className="sr-only">{presentation.progressReason}</span>}
              </div></td>
              <td>{presentation.manager}</td><td>{presentation.dueDate}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      <p className="dashboard-support-note">Observed {formatDashboardTimestamp(page.observedAt)} UTC{query.isError ? " · Previous successful response" : ""}</p>
    </> : null}
  </Surface>;
}
