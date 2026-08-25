import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import type { AdminProjectSummary, PaginationInput } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  adminProjectNextAction,
  adminProjectStatusLabel,
  formatWorkflowLabel,
  isDesignerAssignmentPending
} from "./adminProjectPresentation";
import { adminProjectKeys, getAdminProjects } from "./adminProjectsApi";
import { AdminProjectInitiationDialog } from "./AdminProjectInitiationDialog";

const PAGE_SIZE = 20;

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function requestErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "We couldn't load your projects.";
}

function AdminProjectCard({
  project,
  canAssignDesigner
}: {
  project: AdminProjectSummary;
  canAssignDesigner: boolean;
}) {
  const nextAction = adminProjectNextAction(project);
  const assignmentPending = isDesignerAssignmentPending(project);
  const detailPath = `/admin/projects/${encodeURIComponent(project.id)}`;

  return (
    <li>
      <Surface as="article" className="admin-project-card" variant="interactive">
        <div className="admin-project-card__heading">
          <div>
            <Link to={detailPath}>
              {project.name}
            </Link>
            <p>{project.client.name}</p>
          </div>
          <StatusBadge label={adminProjectStatusLabel(project)} tone="info" />
        </div>
        <dl className="admin-project-card__meta">
          <div><dt>Property</dt><dd>{project.propertyType ?? "Not captured"}</dd></div>
          <div><dt>Location</dt><dd>{project.location}</dd></div>
          <div><dt>Estimator/Sales</dt><dd>{project.estimator?.name ?? "Unassigned handoff"}</dd></div>
          <div><dt>Lead progress</dt><dd>{project.lead ? formatWorkflowLabel(project.lead.stage) : "Unassigned handoff"}</dd></div>
          {nextAction ? <div><dt>Next action</dt><dd>{nextAction}</dd></div> : null}
          <div>
            <dt>Estimate</dt>
            <dd>
              {project.estimate
                ? `${formatWorkflowLabel(project.estimate.status)} · ${money.format(project.estimate.total)}`
                : "No estimate yet"}
            </dd>
          </div>
        </dl>
        {assignmentPending && canAssignDesigner ? (
          <div className="admin-project-card__actions">
            <Link
              className="button button--primary"
              to={`${detailPath}#design-assignment-title`}
            >
              Assign Designer
            </Link>
          </div>
        ) : null}
      </Surface>
    </li>
  );
}

export function AdminProjectsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pagination, setPagination] = useState<PaginationInput>({
    limit: PAGE_SIZE,
    offset: 0
  });
  const projectsQuery = useQuery({
    queryKey: adminProjectKeys.page(pagination),
    queryFn: () => getAdminProjects(pagination),
    placeholderData: keepPreviousData
  });
  const page = projectsQuery.data;
  const isSuperAdmin = auth.user?.role === "super_admin";
  const projectCollectionLabel = isSuperAdmin ? "All Projects" : "My Projects";
  const canAssignDesigner = hasFrontendPermission(
    auth.authorization,
    "design.plan_assignment.manage"
  );

  return (
    <section className="access-administration admin-projects" aria-labelledby="admin-projects-title">
      <PageHeader
        id="admin-projects-title"
        eyebrow="Project administration"
        title={projectCollectionLabel}
        description={isSuperAdmin
          ? "All projects across the organization."
          : "Projects you initiated and handed to Estimator/Sales."}
        metadata={page ? <StatusBadge tone="info" label={`${page.pagination.total} project${page.pagination.total === 1 ? "" : "s"}`} /> : undefined}
        actions={auth.user?.role === "admin" && hasFrontendPermission(auth.authorization, "projects.initiate") ? <Button onClick={() => setDialogOpen(true)}>Initiate project</Button> : undefined}
      />

      {projectsQuery.isPending ? (
        <PageState state="loading" message="Loading projects…" />
      ) : projectsQuery.isError ? (
        <PageState
          state="error"
          message={requestErrorMessage(projectsQuery.error)}
          action={{ label: "Try again", onAction: () => void projectsQuery.refetch() }}
        />
      ) : !page || page.items.length === 0 ? (
        <PageState
          state="empty"
          message={isSuperAdmin ? "No projects available." : "No projects initiated yet."}
        />
      ) : (
        <Surface as="section" padding="compact" className="admin-projects__workspace">
          <ul className="admin-projects__list" aria-label={projectCollectionLabel} aria-busy={projectsQuery.isFetching || undefined}>
            {page.items.map((project) => (
              <AdminProjectCard
                key={project.id}
                project={project}
                canAssignDesigner={canAssignDesigner}
              />
            ))}
          </ul>
          <nav className="access-administration__pagination" aria-label={`${projectCollectionLabel} pages`}>
            <p aria-live="polite">
              Showing {page.pagination.offset + 1}–{Math.min(page.pagination.offset + page.items.length, page.pagination.total)} of {page.pagination.total}
            </p>
            <div>
              <Button size="compact" variant="quiet" disabled={pagination.offset === 0} onClick={() => setPagination((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}>Previous page</Button>
              <Button size="compact" variant="secondary" disabled={!page.pagination.hasMore} onClick={() => setPagination((current) => ({ ...current, offset: current.offset + current.limit }))}>Next page</Button>
            </div>
          </nav>
        </Surface>
      )}
      {dialogOpen ? (
        <AdminProjectInitiationDialog
          onClose={() => setDialogOpen(false)}
          onCreated={(project) => navigate(`/admin/projects/${encodeURIComponent(project.id)}`)}
        />
      ) : null}
    </section>
  );
}
