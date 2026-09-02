import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarClock,
  Eye,
  IndianRupee,
  Settings2,
  Tag,
  TrendingUp,
  User
} from "lucide-react";
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

function AdminProjectsHeaderRow() {
  return (
    <div className="admin-project-card__link admin-projects__header-row" aria-hidden="true">
      <span className="admin-projects__header-cell"><Tag aria-hidden="true" /><span>Project</span></span>
      <div className="admin-project-card__meta">
        <div><Building2 aria-hidden="true" /><span>Location</span></div>
        <div><User aria-hidden="true" /><span>Estimator/Sales</span></div>
        <div><TrendingUp aria-hidden="true" /><span>Lead progress</span></div>
        <div><CalendarClock aria-hidden="true" /><span>Next action</span></div>
        <div><IndianRupee aria-hidden="true" /><span>Estimate</span></div>
      </div>
      <span className="admin-projects__header-cell admin-projects__header-action"><Settings2 aria-hidden="true" /><span>Action</span></span>
    </div>
  );
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
  const estimate = project.estimate;
  const estimateApproved = estimate?.status === "client_approved";
  const estimateValue = estimateApproved
    ? estimate.approvedBaseline?.total ?? null
    : estimate?.total ?? null;

  return (
    <li className="admin-projects__item">
      <Surface
        as="article"
        className="admin-project-card"
        padding="compact"
        aria-label={project.name}
      >
        <Link
          className="admin-project-card__link"
          to={detailPath}
          aria-label={`View details for ${project.name}`}
        >
          <div className="admin-project-card__identity">
            <h2>{project.name}</h2>
            <p>{project.client.name}</p>
            <StatusBadge label={adminProjectStatusLabel(project)} tone="info" />
          </div>
          <dl className="admin-project-card__meta">
            <div>
              <dt className="sr-only">Location</dt>
              <dd>{project.propertyType ?? "Property not captured"} · {project.location}</dd>
            </div>
            <div><dt className="sr-only">Estimator/Sales</dt><dd>{project.estimator?.name ?? "Unassigned handoff"}</dd></div>
            <div><dt className="sr-only">Lead progress</dt><dd>{project.lead ? formatWorkflowLabel(project.lead.stage) : "Unassigned handoff"}</dd></div>
            <div><dt className="sr-only">Next action</dt><dd>{nextAction ?? "No action pending"}</dd></div>
            <div>
              <dt className="sr-only">{estimateApproved ? "Client-approved value (incl. GST)" : "Estimate"}</dt>
              <dd>
                {estimateApproved
                  ? estimateValue === null
                    ? "Approved baseline unavailable"
                    : money.format(estimateValue)
                  : estimate
                    ? `${formatWorkflowLabel(estimate.status)} · ${money.format(estimateValue ?? estimate.total)}`
                  : "No estimate yet"}
              </dd>
            </div>
          </dl>
          <span className="admin-project-card__view"><Eye aria-hidden="true" /> View project</span>
        </Link>
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
        actions={hasFrontendPermission(auth.authorization, "projects.initiate") ? <Button onClick={() => setDialogOpen(true)}>Initiate project</Button> : undefined}
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
        <>
          <Surface as="section" padding="compact" className="admin-projects__workspace">
            <AdminProjectsHeaderRow />
            <ul className="admin-projects__list" aria-label={projectCollectionLabel} aria-busy={projectsQuery.isFetching || undefined}>
              {page.items.map((project) => (
                <AdminProjectCard
                  key={project.id}
                  project={project}
                  canAssignDesigner={canAssignDesigner}
                />
              ))}
            </ul>
          </Surface>
          <nav className="access-administration__pagination admin-projects__pagination" aria-label={`${projectCollectionLabel} pages`}>
            <p aria-live="polite">
              Showing {page.pagination.offset + 1}–{Math.min(page.pagination.offset + page.items.length, page.pagination.total)} of {page.pagination.total}
            </p>
            <div>
              <Button size="compact" variant="quiet" disabled={pagination.offset === 0} onClick={() => setPagination((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}>Previous page</Button>
              <Button size="compact" variant="secondary" disabled={!page.pagination.hasMore} onClick={() => setPagination((current) => ({ ...current, offset: current.offset + current.limit }))}>Next page</Button>
            </div>
          </nav>
        </>
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
