import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import type { DesignVersion, Project } from "../../api/types";
import { AsyncState } from "../../components/ui/AsyncState";
import { getClientProjects, getClientVersions, clientKeys } from "./clientApi";

export function ClientDashboard() {
  const projectsQuery = useQuery({ queryKey: clientKeys.projects, queryFn: getClientProjects });
  const projects = projectsQuery.data ?? [];
  const versions = useQueries({ queries: projects.map((project) => ({ queryKey: clientKeys.versions(project.id), queryFn: () => getClientVersions(project.id) })) });
  if (projectsQuery.isPending) return <AsyncState state="loading" message="Loading your project plans…" />;
  if (projectsQuery.isError) return <AsyncState state="error" message="We couldn't load your project plans." actionLabel="Try again" onAction={() => void projectsQuery.refetch()} />;

  return <section className="client-page" aria-labelledby="client-dashboard-title">
    <header className="workspace-header"><div><p className="eyebrow">Client portal</p><h1 id="client-dashboard-title">Your design plans</h1><p>Follow your projects and view plans once they are approved for sharing.</p></div></header>
    {projects.length ? <div className="client-project-grid">{projects.map((project, index) => <ClientProjectCard key={project.id} project={project} latest={latestApproved(versions[index]?.data ?? [])} loading={versions[index]?.isPending} />)}</div> : <div className="project-empty"><div><h2>No projects have been shared with you yet.</h2><p>When your design team begins a project for this account, it will appear here.</p></div></div>}
  </section>;
}

function ClientProjectCard({ project, latest, loading }: { project: Project; latest: DesignVersion | undefined; loading: boolean }) {
  return <article className="client-project-card"><p className="eyebrow">{project.location}</p><h2>{project.name}</h2><p>Expected completion: {formatDate(project.plannedEndAt)}</p><p>Floor progress is available in the project plan.</p><div className="client-project-card__update"><span>Latest approved update</span>{loading ? <strong>Loading approved plans…</strong> : latest ? <strong>{latest.originalFilename}</strong> : <strong>No approved plan available yet.</strong>}</div><Link className="button button--primary" to={`/client/projects/${project.id}`}>Open project</Link></article>;
}

function latestApproved(versions: DesignVersion[]): DesignVersion | undefined {
  return versions.filter((version) => version.approvalStatus === "approved" && version.clientVisible).sort((left, right) => (right.approvedAt ?? right.uploadedAt).localeCompare(left.approvedAt ?? left.uploadedAt))[0];
}

const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
function formatDate(value: string) { return date.format(new Date(value)); }
