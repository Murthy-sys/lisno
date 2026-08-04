import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";

import type { ClientDesignVersion, ClientProjectSummary } from "../../api/types";
import { AsyncState } from "../../components/ui/AsyncState";
import "../../styles/client-dashboard.css";
import { getClientLatestApprovedVersions, getClientProjectSummaries, clientKeys } from "./clientApi";
import { EstimateReviewPanel } from "../estimates/EstimateReviewPanel";

export function ClientDashboard() {
  const projectsQuery = useQuery({ queryKey: clientKeys.projects, queryFn: getClientProjectSummaries });
  const latestQuery = useQuery({ queryKey: clientKeys.latestVersions, queryFn: getClientLatestApprovedVersions });
  const projects = projectsQuery.data ?? [];
  if (projectsQuery.isPending) return <AsyncState state="loading" message="Loading your project plans…" />;
  if (projectsQuery.isError) return <AsyncState state="error" message="We couldn't load your project plans." actionLabel="Try again" onAction={() => void projectsQuery.refetch()} />;
  const approvedPlans = (latestQuery.data ?? []).filter(
    (version) => version.approvalStatus === "approved" && version.clientVisible
  ).length;
  const averageProgress = projects.length
    ? Math.round(projects.reduce((total, project) => total + project.progress, 0) / projects.length)
    : 0;

  return <section className="client-page client-dashboard" aria-labelledby="client-dashboard-title">
    <header className="workspace-header client-dashboard__hero">
      <div>
        <p className="eyebrow">Client portal</p>
        <h1 id="client-dashboard-title">Your design plans</h1>
        <p>Follow your projects and view plans once they are approved for sharing.</p>
      </div>
      <span className="client-dashboard__hero-count">
        <strong>{projects.length}</strong>
        <span>{projects.length === 1 ? "project shared" : "projects shared"}</span>
      </span>
    </header>
    <section className="client-dashboard__overview" aria-label="Client overview">
      <dl>
        <div><dt>Shared projects</dt><dd>{projects.length}</dd></div>
        <div><dt>Average progress</dt><dd>{averageProgress}%</dd></div>
        <div><dt>Approved plans</dt><dd>{latestQuery.isPending ? "—" : approvedPlans}</dd></div>
      </dl>
    </section>
    <section className="client-dashboard__estimates" aria-label="Estimate review">
      <EstimateReviewPanel />
    </section>
    <section className="client-dashboard__projects" aria-labelledby="client-projects-title">
      <header className="client-dashboard__section-heading">
        <div><p className="eyebrow">Project workspace</p><h2 id="client-projects-title">Projects</h2></div>
        <span>{projects.length} total</span>
      </header>
      {projects.length ? <div className="client-project-grid">{projects.map((project) => <ClientProjectCard key={project.id} project={project} latest={latestForProject(latestQuery.data ?? [], project.id)} loading={latestQuery.isPending} failed={latestQuery.isError} onRetry={() => void latestQuery.refetch()} />)}</div> : <div className="project-empty"><div><h2>No projects have been shared with you yet.</h2><p>When your design team begins a project for this account, it will appear here.</p></div></div>}
    </section>
  </section>;
}

function ClientProjectCard({ project, latest, loading, failed, onRetry }: { project: ClientProjectSummary; latest: ClientDesignVersion | undefined; loading: boolean; failed: boolean; onRetry: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `client-project-${project.id}-details`;
  const headingId = `client-project-${project.id}-heading`;
  const floorLabel = `${project.floorCount} ${project.floorCount === 1 ? "floor" : "floors"}`;

  return <article className="client-project-card">
    <div className="client-project-card__header">
      <span className="client-project-card__identity">
        <span className="eyebrow">{project.location}</span>
        <h2 id={headingId}>{project.name}</h2>
        <span className={`client-project-card__status client-project-card__status--${project.status}`}>
          {project.status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())}
        </span>
      </span>
      <button type="button" className="client-project-card__toggle" aria-labelledby={headingId} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((current) => !current)}>
        <span className="client-project-card__summary">
          <strong>{project.progress}% complete</strong>
          <span>{floorLabel}</span>
          <ChevronDown aria-hidden="true" className={expanded ? "is-expanded" : undefined} />
        </span>
      </button>
    </div>

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
