import { PMCounterpartPanel } from "../project-manager/PMCounterpartPanel";
import { VendorAccessPanel } from "../execution/VendorAccessPanel";
import { ProjectChatNavigation } from "../messages";
import { useRef } from "react";
import { Link, useParams } from "react-router-dom";

import type { ProcurementProject } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { ProcurementEstimateSource } from "./ProcurementEstimateSource";
import { ProcurementBasketWorkspace } from "./ProcurementBasketWorkspace";
import { AssignedProjectOverview } from "../projects/AssignedProjectOverview";
import { projectReadDenied, useAssignedProject } from "../projects/projectReadQueries";
import { ProjectWorkflowPanel } from "../workflow/ProjectWorkflowPanel";
import {
  procurementError,
  useProcurementProjects
} from "./procurementPresentation";

export function ProcurementProjectPage() {
  const { projectId = "" } = useParams();
  const lastValidProject = useRef<{ actor: string; project: ProcurementProject } | null>(null);
  const auth = useAuth();
  const canRead = hasFrontendPermission(
    auth.authorization,
    "procurement.workspace.read"
  );
  const { query, integrityError, projects } = useProcurementProjects(canRead, true);
  const details = useAssignedProject(projectId, canRead);
  const actor = `${auth.user?.id ?? ""}:${auth.user?.role ?? ""}`;
  const project = projects?.find(
    (candidate) => candidate.projectId === projectId
  ) ?? null;
  const accessRevoked = projectReadDenied(query.error);
  if (!canRead || accessRevoked || (query.isSuccess && !project)) lastValidProject.current = null;
  if (project && query.isSuccess && !integrityError) lastValidProject.current = { actor, project };
  const retainedProject = lastValidProject.current?.actor === actor && lastValidProject.current.project.projectId === projectId ? lastValidProject.current.project : null;
  const visibleProject = accessRevoked ? null : project ?? retainedProject;
  const projectSourceStale = query.isFetching || !project || !query.isSuccess || Boolean(integrityError);

  return (
    <section
      className="procurement-project-page"
      aria-labelledby="procurement-project-page-title"
    >
      <PMCounterpartPanel projectId={projectId ?? ""} />
      <PageHeader
        id="procurement-project-page-title"
        eyebrow="Project procurement"
        title={canRead ? details.project?.name ?? visibleProject?.projectName ?? "Project procurement" : "Project procurement"}
        description="Plan each main basket, compare vendor BOQs and issue approved work orders."
        breadcrumb={<Link to="/procurement">Back to projects</Link>}
      />

      {canRead && (details.project || visibleProject) ? <ProjectChatNavigation projectId={projectId} overviewTo={`/procurement/projects/${projectId}`} overviewLabel="Procurement" /> : null}
      {details.project ? <><AssignedProjectOverview project={details.project} />
        {hasFrontendPermission(auth.authorization, "projects.design_workflow.read") ? <ProjectWorkflowPanel projectId={projectId} showInitialPayment={false} /> : null}
      </> : details.canRead && details.query.isPending ? <PageState state="loading" message="Loading project details…" />
        : details.canRead && details.query.isError ? <PageState state="error" message={procurementError(details.query.error, "Project details could not be loaded.")} action={{ label: "Retry project details", onAction: () => void details.query.refetch() }} /> : null}
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
          message={details.project ? "Procurement preparation is not available yet. You can review project details and progress while estimation and approval continue." : "This project is not available for procurement preparation."}
        />
      ) : null}
      {canRead && !accessRevoked && visibleProject && hasFrontendPermission(auth.authorization, "execution.tracker.read") ? <p><Link to={`/projects/${encodeURIComponent(projectId)}/execution`}>View Main Line execution</Link></p> : null}
      {canRead && !accessRevoked && visibleProject ? <ProcurementEstimateSource source={visibleProject.preparationSource} readiness={visibleProject.issueReadiness} stale={projectSourceStale} /> : null}
      {canRead && !accessRevoked && visibleProject ? <VendorAccessPanel projectId={projectId} /> : null}
      {canRead && !accessRevoked && visibleProject ? <ProcurementBasketWorkspace key={`basket-workspace-${projectId}`}
        projectId={projectId} projectName={visibleProject.projectName} projectSourceStale={projectSourceStale} issueReadiness={visibleProject.issueReadiness}
        currentEstimate={project && query.isSuccess && !integrityError ? { estimateId: project.estimateId, estimateVersion: project.estimateVersion } : undefined} /> : null}
    </section>
  );
}
