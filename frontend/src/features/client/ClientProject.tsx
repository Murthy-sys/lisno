import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { ClientDesignVersion } from "../../api/types";
import { FilePreview } from "../../components/ui/FilePreview";
import { AsyncState } from "../../components/ui/AsyncState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { clientKeys, getClientProject, getClientVersions } from "./clientApi";
import { DesignSectionReview } from "./DesignSectionReview";
import { ProjectWorkflowPanel } from "../workflow/ProjectWorkflowPanel";
import "./clientWorkflow.css";

export function ClientProject() {
  const { projectId = "" } = useParams();
  const [timelineContainer, setTimelineContainer] = useState<HTMLDivElement | null>(null);
  const projectQuery = useQuery({ queryKey: clientKeys.project(projectId), queryFn: () => getClientProject(projectId), enabled: Boolean(projectId) });
  const versionsQuery = useQuery({ queryKey: clientKeys.versions(projectId), queryFn: () => getClientVersions(projectId), enabled: Boolean(projectId) });
  if (projectQuery.isPending) return <AsyncState state="loading" message="Loading your project…" />;
  if (projectQuery.isError && !projectQuery.data) return <AsyncState state="error" message="We couldn't load this project." actionLabel="Try again" onAction={() => void projectQuery.refetch()} />;
  const project = projectQuery.data;
  const versions = (versionsQuery.data ?? []).filter((version) => version.approvalStatus === "approved" && version.clientVisible);
  return <section className="client-page client-page--project" data-theme="sidebar" aria-labelledby="client-project-title">
    <Link className="back-link" to="/client">Back to projects</Link>
    <header className="client-project-identity">
      <h1 id="client-project-title">{project.name}</h1>
      <p>{project.location}</p>
    </header>
    {projectQuery.isError ? <AsyncState state="error" message="The project overview could not be refreshed. Previously saved information is shown." actionLabel="Refresh overview" onAction={() => void projectQuery.refetch()} /> : null}
    <div className="client-project-workflow" ref={setTimelineContainer} />
    <ProjectWorkflowPanel key={projectId} projectId={projectId} timelineContainer={timelineContainer} presentation="client" />
    {project.floors.length ? <details key={`floors-${projectId}`} className="client-project-disclosure">
      <summary>Floor progress <span>{project.floors.length} {project.floors.length === 1 ? "floor" : "floors"}</span></summary>
      <section className="client-floor-progress" aria-label="Floor progress">
        {project.floors.slice().sort((left, right) => left.order - right.order).map((floor) => <article key={floor.id} className="client-floor-card"><div><p>Floor {floor.number}</p><h3>{floor.name}</h3></div><div><strong>{floor.progress}% complete</strong><ProgressBar value={floor.progress} label={`${floor.name}: ${floor.progress}% complete`} /></div></article>)}
      </section>
    </details> : null}
    <DesignSectionReview key={`reviews-${projectId}`} projectId={projectId} mode="client" hideWhenEmpty collapsible />
    {versionsQuery.isError ? <div className="client-project-secondary-state" role="status"><p>Approved documents could not be {versions.length ? "refreshed. Saved documents are available below." : "loaded."}</p><button className="secondary-button" type="button" disabled={versionsQuery.isFetching} onClick={() => void versionsQuery.refetch()}>Retry approved documents</button></div> : null}
    {versions.length ? <ApprovedDocuments key={`documents-${projectId}`} versions={versions} /> : null}
  </section>;
}

function ApprovedDocuments({ versions }: { versions: ClientDesignVersion[] }) {
  const [open, setOpen] = useState(false);
  return <details className="client-project-disclosure" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Approved documents <span>{versions.length} {versions.length === 1 ? "document" : "documents"}</span></summary>
    {open ? <section className="client-approved-documents" aria-label="Approved documents">
      {versions.map((version) => <VisibleVersion key={version.id} version={version} />)}
    </section> : null}
  </details>;
}

function VisibleVersion({ version }: { version: ClientDesignVersion }) {
  return <article className="client-version"><div><strong>{version.originalFilename}</strong><p>Approved {version.approvedAt ? formatDate(version.approvedAt) : "recently"} · Version {version.versionNumber}</p></div><FilePreview version={version} /></article>;
}

const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
function formatDate(value: string) { return date.format(new Date(value)); }
