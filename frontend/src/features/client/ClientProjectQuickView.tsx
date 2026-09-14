import type { RefObject } from "react";
import { Link } from "react-router-dom";

import type { ClientDesignVersion, ClientProjectSummary } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { ProgressBar } from "../../components/ui/ProgressBar";

interface ClientProjectQuickViewProps {
  project: ClientProjectSummary | undefined;
  stale: boolean;
  latest: ClientDesignVersion | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
  fallbackFocusRef: RefObject<HTMLElement | null>;
}

/** Uses only the client list's authorized data; the full workspace retains its own queries. */
export function ClientProjectQuickView({ project, stale, latest, loading, failed, onRetry, onClose, fallbackFocusRef }: ClientProjectQuickViewProps) {
  return <ContextPanel
    title={project?.name ?? "Project unavailable"}
    eyebrow="Project details"
    description={project?.location}
    width="medium"
    fallbackFocusRef={fallbackFocusRef}
    onClose={onClose}
    footer={({ requestClose }) => <>
      {project ? <Link className="button button--primary" to={`/client/projects/${encodeURIComponent(project.id)}`}>Open full project</Link> : null}
      <Button variant="secondary" onClick={requestClose}>Close details</Button>
    </>}
  >
    {project ? <div className="client-project-quick-view">
      {stale ? <p role="status">The project list could not be refreshed. Previously loaded project information is shown.</p> : null}
      <dl className="client-project-quick-view__facts">
        <div><dt>Status</dt><dd>{project.status.replaceAll("_", " ")}</dd></div>
        <div><dt>Floors</dt><dd>{project.floorCount}</dd></div>
        <div><dt>Planned start</dt><dd>{formatDate(project.plannedStartAt)}</dd></div>
        <div><dt>Expected completion</dt><dd>{formatDate(project.plannedEndAt)}</dd></div>
      </dl>
      <section className="client-project-quick-view__section" aria-label="Project progress">
        <h3>Project progress</h3>
        <strong>{project.progress}% complete</strong>
        <ProgressBar value={project.progress} label={`${project.name}: ${project.progress}% complete`} />
      </section>
      <section className="client-project-quick-view__section" aria-label="Latest approved update">
        <h3>Latest approved update</h3>
        {loading ? <p role="status">Loading approved plans…</p> : failed ? <>
          <p role="status">Latest approved update unavailable.</p>
          <Button variant="secondary" size="compact" onClick={onRetry}>Retry approved updates</Button>
        </> : latest?.projectId === project.id && latest.approvalStatus === "approved" && latest.clientVisible ? <>
          <strong>{latest.originalFilename}</strong>
          <p>Version {latest.versionNumber}{latest.approvedAt ? ` · Approved ${formatDate(latest.approvedAt)}` : ""}</p>
        </> : <p>No approved plan available yet.</p>}
        <p>Open the full project to view shared files, stages and review actions.</p>
      </section>
    </div> : <p role="status">This project is no longer in your shared project list. Close this panel to review your current projects.</p>}
  </ContextPanel>;
}

const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
function formatDate(value: string) { return date.format(new Date(value)); }
