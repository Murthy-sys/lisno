import { useState } from "react";
import { Link } from "react-router-dom";
import projectInterior from "../../assets/projects-living-room.webp";
import { PMBadge, PMProgressBar, pmDate, pmMoney } from "./PMShared";
import { PMDashboardIcon } from "./PMDashboardIcon";
import type { PMHealth, PMProject } from "./projectManagerTypes";

export type PMDashboardView = "list" | "grid";

interface PMDashboardProjectsProps {
  projects: PMProject[];
  offset: number;
  view: PMDashboardView;
  projectHref: (projectId: string) => string;
}

const healthSeverity = (health: PMHealth) => health === "critical" ? "critical" : health === "at_risk" ? "warning" : health === "on_track" || health === "completed" ? "success" : "neutral";

function ProjectThumbnail() {
  const [failed, setFailed] = useState(false);
  return <span className="pm-dashboard__thumbnail" aria-hidden="true">
    {failed ? <PMDashboardIcon name="projects" /> : <img src={projectInterior} alt="" width="64" height="64" loading="lazy" onError={() => setFailed(true)} />}
  </span>;
}

function ProjectIdentity({ project, href }: { project: PMProject; href: string }) {
  return <div className="pm-dashboard__project-identity">
    <ProjectThumbnail />
    <div className="pm-dashboard__project-copy">
      <Link to={href} aria-label={`Open project ${project.name}`}>{project.name}</Link>
      <span className="pm-dashboard__project-value">Approved net value: {pmMoney(project.approvedNetPaise)}</span>
      {project.issues.length ? <p className="pm-dashboard__source-note">Details need review</p> : null}
    </div>
  </div>;
}

function OpenProject({ project, href }: { project: PMProject; href: string }) {
  return <Link className="pm-dashboard__open" to={href} aria-label={`Open details for ${project.name}`}><span>Open</span><PMDashboardIcon name="chevron" /></Link>;
}

function FieldLabel({ children }: { children: string }) {
  return <span className="pm-dashboard__field-label" aria-hidden="true">{children}</span>;
}

export function PMDashboardProjects({ projects, offset, view, projectHref }: PMDashboardProjectsProps) {
  return <div className="pm-dashboard__collection" data-view={view}>
    {view === "grid" ? <ul className="pm-dashboard__grid" aria-label="Projects">
      {projects.map((project, index) => {
        const href = projectHref(project.id);
        return <li key={project.id}><article className="pm-dashboard__project-card" aria-label={project.name}>
          <div className="pm-dashboard__card-heading"><span className="pm-dashboard__project-number">{offset + index + 1}</span><ProjectIdentity project={project} href={href} /></div>
          <dl className="pm-dashboard__project-facts">
            <div><dt>Client</dt><dd>{project.clientName || "Unavailable"}</dd></div>
            <div><dt>Location</dt><dd>{project.location || "Unavailable"}</dd></div>
            <div><dt>Status</dt><dd><PMBadge value={project.status} /></dd></div>
            <div><dt>Health</dt><dd><PMBadge value={project.health} severity={healthSeverity(project.health)} /></dd></div>
            <div><dt>Target handover</dt><dd>{pmDate(project.plannedEndAt)}</dd></div>
          </dl>
          <PMProgressBar value={project.progress.actual} label={`${project.name} execution progress`} />
          <OpenProject project={project} href={href} />
        </article></li>;
      })}
    </ul> : <div className="pm-dashboard__table-wrap">
      <table className="pm-dashboard__table" aria-label="Projects" role="table">
        <thead role="rowgroup"><tr role="row">
          <th role="columnheader" scope="col" className="pm-dashboard__cell--number"><span aria-hidden="true">#</span><span className="sr-only">Number</span></th>
          <th role="columnheader" scope="col" className="pm-dashboard__cell--identity">Project name</th>
          <th role="columnheader" scope="col" className="pm-dashboard__cell--client">Client</th>
          <th role="columnheader" scope="col" className="pm-dashboard__cell--location">Location</th>
          <th role="columnheader" scope="col" className="pm-dashboard__cell--status">Status</th>
          <th role="columnheader" scope="col" className="pm-dashboard__cell--health">Health</th>
          <th role="columnheader" scope="col" className="pm-dashboard__cell--progress">Progress</th>
          <th role="columnheader" scope="col" className="pm-dashboard__cell--handover">Target handover</th>
          <th role="columnheader" scope="col" className="pm-dashboard__cell--open"><span className="sr-only">Open project</span></th>
        </tr></thead>
        <tbody role="rowgroup">{projects.map((project, index) => {
          const href = projectHref(project.id);
          return <tr key={project.id} className="pm-dashboard__project-row" role="row">
            <td role="cell" className="pm-dashboard__cell--number" data-label="Number"><FieldLabel>Number</FieldLabel>{offset + index + 1}</td>
            <th role="rowheader" scope="row" className="pm-dashboard__cell--identity" data-label="Project name"><ProjectIdentity project={project} href={href} /></th>
            <td role="cell" className="pm-dashboard__cell--client" data-label="Client"><FieldLabel>Client</FieldLabel><span>{project.clientName || "Unavailable"}</span></td>
            <td role="cell" className="pm-dashboard__cell--location" data-label="Location"><FieldLabel>Location</FieldLabel><span className="pm-dashboard__location"><PMDashboardIcon name="location" />{project.location || "Unavailable"}</span></td>
            <td role="cell" className="pm-dashboard__cell--status" data-label="Status"><FieldLabel>Status</FieldLabel><PMBadge value={project.status} /></td>
            <td role="cell" className="pm-dashboard__cell--health" data-label="Health"><FieldLabel>Health</FieldLabel><PMBadge value={project.health} severity={healthSeverity(project.health)} /></td>
            <td role="cell" className="pm-dashboard__cell--progress" data-label="Progress"><FieldLabel>Progress</FieldLabel><PMProgressBar value={project.progress.actual} label={`${project.name} execution progress`} /></td>
            <td role="cell" className="pm-dashboard__cell--handover" data-label="Target handover"><FieldLabel>Target handover</FieldLabel><span>{pmDate(project.plannedEndAt)}</span></td>
            <td role="cell" className="pm-dashboard__cell--open"><OpenProject project={project} href={href} /></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </div>;
}
