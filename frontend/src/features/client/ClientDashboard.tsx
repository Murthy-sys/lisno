import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";

import type { ClientDesignVersion, ClientProjectSummary } from "../../api/types";
import { AsyncState } from "../../components/ui/AsyncState";
import { getClientLatestApprovedVersions, getClientProjectSummaries, clientKeys } from "./clientApi";
import { EstimateReviewPanel } from "../estimates/EstimateReviewPanel";

export function ClientDashboard() {
  const projectsQuery = useQuery({ queryKey: clientKeys.projects, queryFn: getClientProjectSummaries });
  const latestQuery = useQuery({ queryKey: clientKeys.latestVersions, queryFn: getClientLatestApprovedVersions });
  const projects = projectsQuery.data ?? [];
  if (projectsQuery.isPending) return <AsyncState state="loading" message="Loading your project plans…" />;
  if (projectsQuery.isError) return <AsyncState state="error" message="We couldn't load your project plans." actionLabel="Try again" onAction={() => void projectsQuery.refetch()} />;

  return <section className="client-page" aria-labelledby="client-dashboard-title">
    <header className="workspace-header"><div><p className="eyebrow">Client portal</p><h1 id="client-dashboard-title">Your design plans</h1><p>Follow your projects and view plans once they are approved for sharing.</p></div></header>
    <EstimateReviewPanel />
    {projects.length ? <div className="client-project-grid">{projects.map((project) => <ClientProjectCard key={project.id} project={project} latest={latestForProject(latestQuery.data ?? [], project.id)} loading={latestQuery.isPending} failed={latestQuery.isError} onRetry={() => void latestQuery.refetch()} />)}</div> : <div className="project-empty"><div><h2>No projects have been shared with you yet.</h2><p>When your design team begins a project for this account, it will appear here.</p></div></div>}
  </section>;
}

function ClientProjectCard({ project, latest, loading, failed, onRetry }: { project: ClientProjectSummary; latest: ClientDesignVersion | undefined; loading: boolean; failed: boolean; onRetry: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `client-project-${project.id}-details`;
  const floorLabel = `${project.floorCount} ${project.floorCount === 1 ? "floor" : "floors"}`;

  return <article className="client-project-card">
    <button type="button" className="client-project-card__toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((current) => !current)}>
      <span className="client-project-card__identity">
        <span className="eyebrow">{project.location}</span>
        <h2>{project.name}</h2>
      </span>
      <span className="client-project-card__summary">
        <strong>{project.progress}% complete</strong>
        <span>{floorLabel}</span>
        <ChevronDown aria-hidden="true" className={expanded ? "is-expanded" : undefined} />
      </span>
    </button>

    {expanded ? <div id={detailsId} className="client-project-card__details">
      <p>Expected completion: {formatDate(project.plannedEndAt)}</p>
      <div className="client-project-card__update"><span>Latest approved update</span>{loading ? <strong>Loading approved plans…</strong> : failed ? <><strong>Latest approved update unavailable.</strong><button type="button" className="button button--secondary" onClick={onRetry}>Retry approved updates</button></> : latest ? <strong>{latest.originalFilename}</strong> : <strong>No approved plan available yet.</strong>}</div>
      <Link className="button button--primary" to={`/client/projects/${project.id}`}>Open project</Link>
    </div> : null}
  </article>;
}

function latestForProject(versions: ClientDesignVersion[], projectId: string) {
  return versions.find((version) => version.projectId === projectId && version.approvalStatus === "approved" && version.clientVisible);
}

const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
function formatDate(value: string) { return date.format(new Date(value)); }
