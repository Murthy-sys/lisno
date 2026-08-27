import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { ProcurementProject } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { formatPaise } from "../finance/ProjectFinancePanel";
import {
  procurementError,
  procurementProjectActualTotal,
  procurementProjectEstimatedTotal,
  procurementProjectPath,
  useProcurementProjects
} from "./procurementPresentation";

export function ProcurementWorkspace() {
  const auth = useAuth();
  const canRead = hasFrontendPermission(
    auth.authorization,
    "procurement.workspace.read"
  );
  const { query, integrityError, projects } = useProcurementProjects(canRead);

  return (
    <Surface
      as="section"
      className="procurement-workspace"
      aria-labelledby="procurement-workspace-title"
    >
      <div className="section-heading procurement-workspace__heading">
        <div>
          <p className="eyebrow">Approved Estimate purchasing</p>
          <h2 id="procurement-workspace-title">Procurement purchases</h2>
          <p>Record actual costs and receipts against each approved Estimate item.</p>
        </div>
        {query.data && !integrityError ? (
          <span>{projects?.length ?? 0} {projects?.length === 1 ? "project" : "projects"}</span>
        ) : null}
      </div>

      {!canRead ? (
        <PageState
          state="error"
          message="You do not have permission to view the procurement workspace."
        />
      ) : query.isPending ? (
        <PageState state="loading" message="Loading approved Estimate items…" />
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
      ) : query.data?.length === 0 ? (
        <PageState
          state="empty"
          message="Projects will appear here automatically after their Design plan is approved."
        />
      ) : (
        <ul
          className="procurement-project-list"
          aria-label="Design-approved projects"
          aria-busy={query.isFetching || undefined}
        >
          {(projects ?? []).map((project) => (
            <ProcurementProjectRow key={project.projectId} project={project} />
          ))}
        </ul>
      )}
    </Surface>
  );
}

function ProcurementProjectRow({ project }: { project: ProcurementProject }) {
  const estimatedTotal = procurementProjectEstimatedTotal(project);
  const actualTotal = procurementProjectActualTotal(project);

  return (
    <li className="procurement-project-list__item">
      <Surface
        as="article"
        className="procurement-project-card"
        padding="compact"
        aria-label={project.projectName}
      >
        <Link
          className="procurement-project-card__link"
          to={procurementProjectPath(project.projectId)}
          aria-label={`View procurement items for ${project.projectName}`}
        >
          <div className="procurement-project-card__identity">
            <p className="eyebrow">Estimate v{project.estimateVersion}</p>
            <h3>{project.projectName}</h3>
            <p>{project.sections.length} selected Estimate {project.sections.length === 1 ? "section" : "sections"}</p>
            <StatusBadge tone="success" label="Design approved" />
          </div>
          <dl
            className="procurement-project-card__meta"
            aria-label={`${project.projectName} procurement totals`}
          >
            <div><dt>Selected estimate value</dt><dd>{formatPaise(estimatedTotal)}</dd></div>
            <div><dt>Recorded spend</dt><dd>{formatPaise(actualTotal)}</dd></div>
            <div><dt>Remaining selected value</dt><dd>{formatPaise(estimatedTotal - actualTotal)}</dd></div>
          </dl>
          <span className="procurement-project-card__view">View project <ArrowUpRight aria-hidden="true" /></span>
        </Link>
      </Surface>
    </li>
  );
}
