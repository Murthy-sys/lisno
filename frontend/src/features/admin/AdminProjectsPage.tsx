import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarClock,
  Eye,
  IndianRupee,
  LayoutGrid,
  List,
  MapPin,
  Settings2,
  Tag,
  TrendingUp,
  User
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import projectCardImage from "../../assets/projects-living-room.webp";
import type { AdminProjectListInput, AdminProjectSummary, ProjectStatus } from "../../api/types";
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
  adminProjectStatusTone,
  formatWorkflowLabel,
  isDesignerAssignmentPending
} from "./adminProjectPresentation";
import { adminProjectKeys, getAdminProjects } from "./adminProjectsApi";
import { AdminProjectInitiationDialog } from "./AdminProjectInitiationDialog";
import { AdminProjectQuickView } from "./AdminProjectQuickView";
import "./admin-project-grid.css";

const PAGE_SIZE = 20;

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const VIEW_STORAGE_KEY = "lisno.adminProjects.view";
const SKELETON_CARD_COUNT = 8;

type AdminProjectsView = "grid" | "list";
const PROJECT_STATUSES: ReadonlyArray<{ value: ProjectStatus | "all"; label: string }> = [
  { value: "all", label: "All" }, { value: "active", label: "Active" },
  { value: "planning", label: "Planning" }, { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" }
];

function readStoredView(): AdminProjectsView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function writeStoredView(view: AdminProjectsView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice stays in memory.
  }
}

/**
 * The single estimate display used by both the list rows and the grid cards.
 * Extracted verbatim from the list row; it performs no calculation.
 */
function adminProjectEstimateDisplay(project: AdminProjectSummary) {
  const estimate = project.estimate;
  const estimateApproved = estimate?.status === "client_approved";
  const estimateValue = estimateApproved
    ? estimate.approvedBaseline?.total ?? null
    : estimate?.total ?? null;

  return {
    label: estimateApproved ? "Client-approved value (incl. GST)" : "Estimate",
    text: estimateApproved
      ? estimateValue === null
        ? "Approved baseline unavailable"
        : money.format(estimateValue)
      : estimate
        ? `${formatWorkflowLabel(estimate.status)} · ${money.format(estimateValue ?? estimate.total)}`
      : "No estimate yet"
  };
}

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
        <div><User aria-hidden="true" /><span>Sales</span></div>
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
  canAssignDesigner,
  onQuickView,
  quickViewDisabled
}: {
  project: AdminProjectSummary;
  canAssignDesigner: boolean;
  onQuickView: () => void;
  quickViewDisabled: boolean;
}) {
  const nextAction = adminProjectNextAction(project);
  const assignmentPending = isDesignerAssignmentPending(project);
  const detailPath = `/admin/projects/${encodeURIComponent(project.id)}`;
  const estimateDisplay = adminProjectEstimateDisplay(project);

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
            <div><dt className="sr-only">Sales</dt><dd>{project.estimator?.name ?? "Unassigned handoff"}</dd></div>
            <div><dt className="sr-only">Lead progress</dt><dd>{project.lead ? formatWorkflowLabel(project.lead.stage) : "Unassigned handoff"}</dd></div>
            <div><dt className="sr-only">Next action</dt><dd>{nextAction ?? "No action pending"}</dd></div>
            <div>
              <dt className="sr-only">{estimateDisplay.label}</dt>
              <dd>{estimateDisplay.text}</dd>
            </div>
          </dl>
          <span className="admin-project-card__view"><Eye aria-hidden="true" /> View project</span>
        </Link>
        <div className="admin-project-card__actions">
          <Button size="compact" variant="quiet" disabled={quickViewDisabled} onClick={onQuickView} aria-label={`Quick view ${project.name}`}>
            Quick view
          </Button>
          {assignmentPending && canAssignDesigner ? (
            <Link
              className="button button--primary"
              to={`${detailPath}#design-assignment-title`}
            >
              Assign Designer
            </Link>
          ) : null}
        </div>
      </Surface>
    </li>
  );
}

function AdminProjectGridCard({
  project,
  canAssignDesigner
}: {
  project: AdminProjectSummary;
  canAssignDesigner: boolean;
}) {
  const assignmentPending = isDesignerAssignmentPending(project);
  const detailPath = `/admin/projects/${encodeURIComponent(project.id)}`;
  const estimateDisplay = adminProjectEstimateDisplay(project);
  const showAssignDesigner = assignmentPending && canAssignDesigner;

  return (
    <li className="admin-project-grid__item">
      <article className="admin-project-tile" aria-label={project.name}>
        <div className="admin-project-tile__image">
          <img
            className="admin-project-tile__media"
            src={projectCardImage}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={2172}
            height={724}
          />
          <span className="admin-project-tile__status" data-tone={adminProjectStatusTone(project)}>
            {adminProjectStatusLabel(project)}
          </span>
        </div>
        <div className="admin-project-tile__body">
          <Link
            className="admin-project-tile__link"
            to={detailPath}
            aria-label={`View details for ${project.name}`}
          >
            <h2 className="admin-project-tile__title" title={project.name}>{project.name}</h2>
            <dl className="admin-project-tile__meta">
              <div>
                <dt className="sr-only">Client</dt>
                <dd title={project.client.name}><User aria-hidden="true" /><span>{project.client.name}</span></dd>
              </div>
              <div>
                <dt className="sr-only">Location</dt>
                <dd title={project.location}><MapPin aria-hidden="true" /><span>{project.location}</span></dd>
              </div>
            </dl>
            <dl className="admin-project-tile__details">
              <div>
                <dt className="sr-only">Property type</dt>
                <dd title={project.propertyType ?? "Property not captured"}><Building2 aria-hidden="true" /><span>{project.propertyType ?? "Property not captured"}</span></dd>
              </div>
              <div className="admin-project-tile__amount">
                <dt className="sr-only">{estimateDisplay.label}</dt>
                <dd>{estimateDisplay.text}</dd>
              </div>
            </dl>
          </Link>
          {showAssignDesigner ? (
            <div className="admin-project-tile__actions">
              <Link
                className="button button--primary"
                to={`${detailPath}#design-assignment-title`}
              >
                Assign Designer
              </Link>
            </div>
          ) : null}
        </div>
      </article>
    </li>
  );
}

function AdminProjectGridSkeleton() {
  return (
    <ul className="admin-project-grid admin-project-grid--skeleton" aria-hidden="true">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <li key={index} className="admin-project-grid__item">
          <div className="admin-project-tile admin-project-tile--skeleton">
            <div className="admin-project-tile__media" />
            <div className="admin-project-tile__body">
              <span className="admin-project-tile__bone admin-project-tile__bone--chip" />
              <span className="admin-project-tile__bone admin-project-tile__bone--title" />
              <span className="admin-project-tile__bone" />
              <span className="admin-project-tile__bone admin-project-tile__bone--amount" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AdminProjectsViewToggle({
  view,
  onChange
}: {
  view: AdminProjectsView;
  onChange: (view: AdminProjectsView) => void;
}) {
  return (
      <div className="admin-projects__view-toggle" role="group" aria-label="Project layout">
        <button
          type="button"
          className="admin-projects__view-button"
          aria-label="Grid view"
          title="Grid view"
          aria-pressed={view === "grid"}
          onClick={() => onChange("grid")}
        >
          <LayoutGrid aria-hidden="true" />
        </button>
        <button
          type="button"
          className="admin-projects__view-button"
          aria-label="List view"
          title="List view"
          aria-pressed={view === "list"}
          onClick={() => onChange("list")}
        >
          <List aria-hidden="true" />
        </button>
      </div>
  );
}

export function AdminProjectsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [view, setView] = useState<AdminProjectsView>(readStoredView);
  const [input, setInput] = useState<AdminProjectListInput>({
    limit: PAGE_SIZE,
    offset: 0
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const projectsQuery = useQuery({
    queryKey: adminProjectKeys.page(input),
    queryFn: () => getAdminProjects(input),
    placeholderData: keepPreviousData
  });
  const page = projectsQuery.data;
  const stalePage = projectsQuery.isPlaceholderData;
  const statusCounts = stalePage || projectsQuery.isError ? undefined : page?.statusCounts;
  const hasFilters = !!input.status || !!input.search;
  const isSuperAdmin = auth.user?.role === "super_admin";
  const projectCollectionLabel = isSuperAdmin ? "All Projects" : "My Projects";
  const canAssignDesigner = hasFrontendPermission(
    auth.authorization,
    "design.plan_assignment.manage"
  );
  const changeView = (next: AdminProjectsView) => {
    setView(next);
    writeStoredView(next);
  };
  const resetFilters = () => {
    setSearchDraft("");
    setInput(current => ({ ...current, status: undefined, search: undefined, offset: 0 }));
  };

  return (
    <section className="access-administration admin-projects" aria-labelledby="admin-projects-title">
      <div className="admin-projects__hero">
        <PageHeader
          id="admin-projects-title"
          eyebrow="Project administration"
          title={projectCollectionLabel}
          description={isSuperAdmin
            ? "All projects across the organization."
            : "Projects you initiated and handed to Sales."}
          metadata={page && !page.statusCounts && !stalePage && !projectsQuery.isError ? <StatusBadge tone="info" label={`${page.pagination.total} project${page.pagination.total === 1 ? "" : "s"}`} /> : undefined}
          actions={hasFrontendPermission(auth.authorization, "projects.initiate") ? <Button aria-label="Initiate project" onClick={() => setDialogOpen(true)}>Initiate project</Button> : undefined}
        />
      <div className="admin-projects__toolbar">
        <div className="admin-projects__statuses" role="group" aria-label="Project status">
          {PROJECT_STATUSES.map(status => <button
            key={status.value}
            type="button"
            className="admin-projects__status-button"
            aria-pressed={(input.status ?? "all") === status.value}
            onClick={() => setInput(current => ({ ...current, status: status.value === "all" ? undefined : status.value, offset: 0 }))}
          >
            <span>{status.label}</span>
            {statusCounts ? <span className="admin-projects__status-count">{statusCounts[status.value]}</span> : null}
          </button>)}
        </div>
        <div className="admin-projects__tools">
          <AdminProjectsViewToggle view={view} onChange={changeView} />
          <label className="admin-projects__sort">
            <span>Sort</span>
            <select aria-label="Sort projects" value={input.sort ?? "newest"} onChange={event => setInput(current => ({ ...current, sort: event.target.value as AdminProjectListInput["sort"], offset: 0 }))}>
              <option value="newest">Newest</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
            </select>
          </label>
          <button type="button" className="admin-projects__filter-button" aria-expanded={filtersOpen} aria-controls="admin-projects-filters" onClick={() => setFiltersOpen(current => !current)}>
            <Settings2 aria-hidden="true" /><span>Filter{input.search ? " (1)" : ""}</span>
          </button>
        </div>
      </div>
      </div>
      {filtersOpen ? <form id="admin-projects-filters" className="admin-projects__filters" aria-label="Filter projects" onSubmit={event => {
        event.preventDefault();
        setInput(current => ({ ...current, search: searchDraft.trim() || undefined, offset: 0 }));
      }}>
        <label htmlFor="admin-projects-search">Search project, client or city</label>
        <div className="admin-projects__search-row">
          <input id="admin-projects-search" type="search" maxLength={120} value={searchDraft} placeholder="Project, client or city" onChange={event => setSearchDraft(event.target.value)} />
          <Button type="submit">Search</Button>
          <Button variant="quiet" disabled={!input.search && !searchDraft} onClick={() => {
            setSearchDraft("");
            setInput(current => ({ ...current, search: undefined, offset: 0 }));
          }}>Reset search</Button>
        </div>
      </form> : null}
      {input.search ? <p className="admin-projects__search-summary">Results for <strong>{input.search}</strong></p> : null}
      {stalePage ? <p className="admin-projects__updating" role="status">Updating projects… Previous results remain visible.</p> : null}
      <div className="admin-projects__collection">
      {projectsQuery.isPending ? (
        <PageState
          state="loading"
          message="Loading projects…"
          skeleton={view === "grid" ? <AdminProjectGridSkeleton /> : undefined}
        />
      ) : projectsQuery.isError ? (
        <PageState
          state="error"
          message={requestErrorMessage(projectsQuery.error)}
          action={{ label: "Try again", onAction: () => void projectsQuery.refetch() }}
        />
      ) : !page || page.items.length === 0 ? (
        <PageState
          state="empty"
          message={hasFilters ? "No projects match these filters." : isSuperAdmin ? "No projects available." : "No projects initiated yet."}
          action={hasFilters ? { label: "Reset filters", onAction: resetFilters } : undefined}
        />
      ) : (
        <>
          {view === "grid" ? (
            <ul className="admin-project-grid" aria-label={projectCollectionLabel} aria-busy={projectsQuery.isFetching || undefined}>
              {page.items.map((project) => (
                <AdminProjectGridCard
                  key={project.id}
                  project={project}
                  canAssignDesigner={canAssignDesigner}
                />
              ))}
            </ul>
          ) : (
            <Surface as="section" padding="compact" className="admin-projects__workspace">
              <AdminProjectsHeaderRow />
              <ul className="admin-projects__list" aria-label={projectCollectionLabel} aria-busy={projectsQuery.isFetching || undefined}>
                {page.items.map((project) => (
                  <AdminProjectCard
                    key={project.id}
                    project={project}
                    canAssignDesigner={canAssignDesigner}
                    onQuickView={() => setQuickViewId(project.id)}
                    quickViewDisabled={stalePage}
                  />
                ))}
              </ul>
            </Surface>
          )}
          <nav className="access-administration__pagination admin-projects__pagination" aria-label={`${projectCollectionLabel} pages`}>
            <p aria-live="polite">
              {stalePage ? "Updating results…" : `Showing ${page.pagination.offset + 1}–${Math.min(page.pagination.offset + page.items.length, page.pagination.total)} of ${page.pagination.total}`}
            </p>
            <div>
              <Button size="compact" variant="quiet" disabled={stalePage || input.offset === 0} onClick={() => setInput((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}>Previous page</Button>
              <Button size="compact" variant="secondary" disabled={stalePage || !page.pagination.hasMore} onClick={() => setInput((current) => ({ ...current, offset: current.offset + current.limit }))}>Next page</Button>
            </div>
          </nav>
        </>
      )}
      </div>
      {dialogOpen ? (
        <AdminProjectInitiationDialog
          onClose={() => setDialogOpen(false)}
          onCreated={(project) => navigate(`/admin/projects/${encodeURIComponent(project.id)}`)}
        />
      ) : null}
      {quickViewId ? (
        <AdminProjectQuickView
          key={quickViewId}
          project={projectsQuery.isError || projectsQuery.isPlaceholderData ? undefined : page?.items.find((project) => project.id === quickViewId)}
          canOpenWorkspace={hasFrontendPermission(auth.authorization, "projects.read")}
          onClose={() => setQuickViewId(null)}
        />
      ) : null}
    </section>
  );
}
