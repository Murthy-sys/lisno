import { useRef, useState } from "react";

import type { ProcurementProject } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { ProcurementProjectCard } from "./ProcurementProjectCard";
import { AssignedProcurementProjectCard } from "./AssignedProcurementProjectCard";
import { useAssignedProjects } from "../projects/projectReadQueries";
import {
  procurementError,
  procurementPortfolioSelectedTotal,
  useProcurementProjects
} from "./procurementPresentation";
import "./procurementProjectGallery.css";

type ProjectStatusFilter = "all" | "awaiting_preparation" | ProcurementProject["taskStatus"];

export function ProcurementWorkspace() {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.workspace.read");
  const { query, integrityError, projects } = useProcurementProjects(canRead);
  const assigned = useAssignedProjects(canRead);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatusFilter>("all");
  const searchInput = useRef<HTMLInputElement>(null);
  const available = canRead && !query.isPending && !query.isError && !integrityError && projects !== null;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const additionalProjects = (assigned.projects ?? []).filter((project) => !available || !projects.some((prepared) => prepared.projectId === project.id));
  const additionalFiltered = additionalProjects.filter((project) => project.name.toLocaleLowerCase().includes(normalizedSearch) && (status === "all" || (status === "awaiting_preparation" && available)));
  const totalProjects = (available ? projects.length : 0) + additionalProjects.length;
  const filtered = available ? projects.filter((project) =>
    project.projectName.toLocaleLowerCase().includes(normalizedSearch) &&
    (status === "all" || project.taskStatus === status)
  ) : [];
  const filtering = normalizedSearch !== "" || status !== "all";
  const selectedTotal = available ? procurementPortfolioSelectedTotal(projects) : null;

  function clearSearch() {
    setSearch("");
    searchInput.current?.focus();
  }

  function resetFilters() {
    setStatus("all");
    clearSearch();
  }

  return (
    <section className="procurement-workspace procurement-gallery" aria-labelledby="procurement-workspace-title">
      <header className="procurement-gallery__header">
        <div className="procurement-gallery__heading">
          <p className="eyebrow">Project procurement</p>
          <h2 id="procurement-workspace-title">Procurement</h2>
          <p>View assigned project details and manage procurement when preparation is available.</p>
        </div>
        {available || assigned.projects ? (
          <div className="procurement-gallery__controls">
            <div className="procurement-gallery__search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
              <input
                ref={searchInput}
                type="search"
                aria-label="Search projects"
                placeholder="Search projects…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search ? (
                <button type="button" onClick={clearSearch} aria-label="Clear search">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
              ) : null}
            </div>
            <select aria-label="Project status" value={status} onChange={(event) => setStatus(event.target.value as ProjectStatusFilter)}>
              <option value="all">All status</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="awaiting_preparation">Awaiting preparation</option>
            </select>
          </div>
        ) : null}
      </header>

      {!canRead ? (
        <PageState state="error" message="You do not have permission to view the procurement workspace." />
      ) : query.isPending ? (
        <PageState state="loading" message="Loading procurement projects…" />
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
      ) : available ? (
        <>
          <div className="procurement-gallery__caption">
            <span>Representative interiors</span>
            <span role="status" aria-live="polite" aria-atomic="true">
              {filtering ? `${filtered.length + additionalFiltered.length} of ${totalProjects} projects` : `${totalProjects} ${totalProjects === 1 ? "project" : "projects"}`}
            </span>
          </div>
          <section className="procurement-gallery__summary" aria-label="Procurement portfolio summary" aria-describedby="procurement-gallery-summary-scope" aria-busy={query.isFetching || undefined}>
            <dl>
              <div className="procurement-gallery__summary-panel">
                <dt>
                  <span className="procurement-gallery__summary-symbol" aria-hidden="true">
                    <svg viewBox="0 0 32 32"><path d="M4 9V6h9l3 4h12v16H4V9Z" /><path d="M4 12h24" /></svg>
                  </span>
                  <span>Total projects</span>
                </dt>
                <dd>{totalProjects}</dd>
              </div>
              <div className="procurement-gallery__summary-panel procurement-gallery__summary-panel--value">
                <dt>
                  <span className="procurement-gallery__summary-symbol" aria-hidden="true">₹</span>
                  <span>Total selected value</span>
                </dt>
                <dd>{selectedTotal === null ? "Unavailable" : formatPaise(selectedTotal)}</dd>
              </div>
            </dl>
            <p id="procurement-gallery-summary-scope">{additionalProjects.length ? "Project count includes assigned projects. Selected value includes only projects with available procurement preparation." : "Totals include all projects with available procurement preparation."}</p>
            {selectedTotal === null ? <p className="procurement-gallery__summary-error">The total selected value exceeds the supported amount range. Individual project values remain available.</p> : null}
          </section>
          {totalProjects === 0 ? (
            <PageState state="empty" message="Projects appear when you are assigned or procurement preparation becomes available." />
          ) : filtered.length + additionalFiltered.length === 0 ? (
            <PageState state="empty" message="No projects match your search and status filters." action={{ label: "Reset filters", onAction: resetFilters }} />
          ) : (
            <ul className="procurement-gallery__projects" aria-label="Projects with procurement preparation" aria-busy={query.isFetching || undefined}>
              {filtered.map((project, index) => (
                <li key={project.projectId}>
                  <ProcurementProjectCard project={project} eagerImage={index < 3} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {assigned.canRead && assigned.query.isPending ? <PageState state="loading" message="Loading assigned project details…" /> : null}
      {assigned.canRead && assigned.query.isError ? <PageState state="error" message="Assigned project details could not be loaded. Available procurement preparation is shown separately." action={{ label: "Retry assigned projects", onAction: () => void assigned.query.refetch() }} /> : null}
      {canRead && additionalFiltered.length ? <section aria-label="Assigned project details">
        <h3>Assigned projects</h3>
        <ul className="procurement-gallery__projects" aria-label="Assigned projects awaiting preparation">
          {additionalFiltered.map((project) => <li key={project.id}><AssignedProcurementProjectCard project={project} preparationKnown={available} /></li>)}
        </ul>
      </section> : null}
    </section>
  );
}
