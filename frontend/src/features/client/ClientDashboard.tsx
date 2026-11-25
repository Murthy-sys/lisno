import { ProjectId } from "../../components/projects/ProjectId";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { AsyncState } from "../../components/ui/AsyncState";
import "../../styles/client-dashboard.css";
import { getClientProjectSummaries, clientKeys } from "./clientApi";
import { ClientEstimateSummary } from "./ClientEstimateSummary";
import { ClientEstimateQueryProvider } from "../estimates/clientEstimateQuery";
import { ClientProjectStatus } from "./ClientProjectStatus";
import { PageHeader } from "../../components/ui/PageHeader";

export function ClientDashboard() {
  const [searchParams] = useSearchParams();
  const projectsQuery = useQuery({ queryKey: clientKeys.projects, queryFn: getClientProjectSummaries });
  // A denial retires this snapshot, including when a later retry fails transiently.
  const [authorizedProjects, setAuthorizedProjects] = useState(() => projectsQuery.isSuccess ? projectsQuery.data : undefined);
  const canRetainProjects = projectsQuery.isError && isTransientReadError(projectsQuery.error) &&
    Boolean(authorizedProjects) && authorizedProjects === projectsQuery.data;

  useEffect(() => {
    if (projectsQuery.isSuccess) setAuthorizedProjects(projectsQuery.data);
    else if (projectsQuery.isError && !isTransientReadError(projectsQuery.error)) setAuthorizedProjects(undefined);
  }, [projectsQuery.isSuccess, projectsQuery.isError, projectsQuery.error, projectsQuery.data]);

  const projects = projectsQuery.isSuccess || canRetainProjects ? projectsQuery.data ?? [] : [];
  if (projectsQuery.isPending) return <AsyncState state="loading" message="Loading your projects…" />;
  if (projectsQuery.isError && !canRetainProjects) return <AsyncState state="error" message="We couldn't load your projects." actionLabel="Try again" onAction={() => void projectsQuery.refetch()} />;

  return <ClientEstimateQueryProvider><section className="client-page client-dashboard" aria-labelledby="client-dashboard-title">
    <PageHeader id="client-dashboard-title" title="My projects" titleAction={<span className="client-dashboard__project-count">{projects.length} {projects.length === 1 ? "project" : "projects"}</span>} />
    {projectsQuery.isError ? <AsyncState state="error" message="Your project list could not be refreshed. Previously loaded projects are shown." actionLabel="Refresh projects" onAction={() => void projectsQuery.refetch()} /> : null}
    {searchParams.has("estimate") ? <section className="client-dashboard__estimates" aria-label="Estimate review">
      <ClientEstimateSummary projects={projects} projectsFresh={projectsQuery.isSuccess && !projectsQuery.isFetching} selectedEstimateId={searchParams.get("estimate") ?? undefined} />
    </section> : null}
    {projects.length ? <div className="client-dashboard__table-scroll" role="region" aria-label="Projects table" tabIndex={0}>
      <table className="client-dashboard__table">
        <caption className="sr-only">Projects</caption>
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Location</th>
            <th scope="col">Status</th>
            <th scope="col">Expected completion</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const projectPath = `/client/projects/${encodeURIComponent(project.id)}`;
            return <tr key={project.id}>
              <th scope="row" className="client-dashboard__project-identity">
                <Link to={projectPath}>{project.name}</Link>
                <ProjectId projectNumber={project.projectNumber} />
              </th>
              <td>{project.location}</td>
              <td><ClientProjectStatus projectId={project.id} projectName={project.name} projectNumber={project.projectNumber} /></td>
              <td>{formatDate(project.plannedEndAt)}</td>
              <td><Link className="client-dashboard__open-project" to={projectPath} aria-label={`Open project: ${project.name}`}>Open project</Link></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div> : <AsyncState state="empty" message="No projects shared yet." />}
  </section></ClientEstimateQueryProvider>;
}

function isTransientReadError(error: Error) {
  return error instanceof ApiError
    ? error.status >= 500 || error.status === 408 || error.status === 429
    : error instanceof TypeError;
}

const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? "Not available" : date.format(parsedDate);
}
