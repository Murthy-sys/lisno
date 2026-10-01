import { ProjectChatNavigation } from "../messages";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { VendorWorkProgressPanel } from "../workflow/VendorWorkProgressPanel";
import { EstimateProcurementItems } from "./EstimateProcurementItems";
import { PurchaseOrdersPanel } from "./PurchaseOrdersPanel";
import {
  procurementError,
  useProcurementProjects
} from "./procurementPresentation";

export function ProcurementProjectPage() {
  const { projectId = "" } = useParams();
  const auth = useAuth();
  const canRead = hasFrontendPermission(
    auth.authorization,
    "procurement.workspace.read"
  );
  const { query, integrityError, projects } = useProcurementProjects(canRead, true);
  const project = projects?.find(
    (candidate) => candidate.projectId === projectId
  ) ?? null;

  return (
    <section
      className="procurement-project-page"
      aria-labelledby="procurement-project-page-title"
    >
      <PageHeader
        id="procurement-project-page-title"
        eyebrow="Project procurement"
        title={project?.projectName ?? "Project procurement"}
        description="View approved estimate budgets and add procurement items under each estimate item."
        breadcrumb={<Link to="/home">Back to approved projects</Link>}
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
      {canRead ? <EstimateProcurementItems key={projectId}
        project={!query.isError && !integrityError && !query.isPending ? project : null} /> : null}
      {canRead && !query.isError && !integrityError && !query.isPending && project ? (
        <>
          <PurchaseOrdersPanel key={`purchase-orders-${projectId}`} projectId={projectId} projectName={project.projectName} />
          <VendorWorkProgressPanel projectId={projectId} projectName={project.projectName} />
        </>
      ) : null}
    </section>
  );
}
