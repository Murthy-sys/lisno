import { VendorAccessPanel } from "../execution/VendorAccessPanel";
import { ProjectChatNavigation } from "../messages";
import { useRef } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import type { ProcurementProject } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { ProcurementBasketWorkspace } from "./ProcurementBasketWorkspace";
import {
  procurementError,
  useProcurementProjects
} from "./procurementPresentation";

export function ProcurementProjectPage() {
  const { projectId = "" } = useParams();
  const lastValidProject = useRef<ProcurementProject | null>(null);
  const auth = useAuth();
  const canRead = hasFrontendPermission(
    auth.authorization,
    "procurement.workspace.read"
  );
  const { query, integrityError, projects } = useProcurementProjects(canRead, true);
  const project = projects?.find(
    (candidate) => candidate.projectId === projectId
  ) ?? null;
  if (project && query.isSuccess && !integrityError) lastValidProject.current = project;
  const retainedProject = lastValidProject.current?.projectId === projectId ? lastValidProject.current : null;
  const accessRevoked = query.error instanceof ApiError && [401, 403].includes(query.error.status);
  const visibleProject = accessRevoked ? null : project ?? retainedProject;
  const projectSourceStale = query.isFetching || !project || !query.isSuccess || Boolean(integrityError);

  return (
    <section
      className="procurement-project-page"
      aria-labelledby="procurement-project-page-title"
    >
      <PageHeader
        id="procurement-project-page-title"
        eyebrow="Project procurement"
        title={visibleProject?.projectName ?? "Project procurement"}
        description="Plan each main basket, compare vendor BOQs and issue approved work orders."
        breadcrumb={<Link to="/procurement">Back to projects</Link>}
      />

      <ProjectChatNavigation projectId={projectId} overviewTo={`/procurement/projects/${projectId}`} overviewLabel="Procurement" />
      {!canRead ? (
        <PageState
          state="error"
          message="You do not have permission to view the procurement workspace."
        />
      ) : query.isPending ? (
        <PageState state="loading" message="Loading project procurement…" />
      ) : query.isError ? (
        <PageState
          state="error"
          message={procurementError(query.error, "Procurement projects could not be loaded.")}
          action={{ label: "Try again", onAction: () => void query.refetch() }}
        />
      ) : integrityError ? (
        <PageState
          state="error"
          message={integrityError}
          action={{ label: "Refresh procurement", onAction: () => void query.refetch() }}
        />
      ) : !project ? (
        <PageState
          state="empty"
          message="This project is not available for procurement. It may not be Design approved yet."
        />
      ) : null}
      {canRead && !accessRevoked && visibleProject && hasFrontendPermission(auth.authorization, "execution.tracker.read") ? <p><Link to={`/projects/${encodeURIComponent(projectId)}/execution`}>View Main Line execution</Link></p> : null}
      {canRead && !accessRevoked && visibleProject ? <VendorAccessPanel projectId={projectId} /> : null}
      {canRead && !accessRevoked && visibleProject ? <ProcurementBasketWorkspace key={`basket-workspace-${projectId}`}
        projectId={projectId} projectName={visibleProject.projectName} projectSourceStale={projectSourceStale}
        currentEstimate={project ? { estimateId: project.estimateId, estimateVersion: project.estimateVersion } : undefined} /> : null}
    </section>
  );
}
