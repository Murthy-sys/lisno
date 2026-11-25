import { useEffect, useState } from "react";
import type { AdminProjectSummary } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { DesignAssignmentPanel } from "./DesignAssignmentPanel";
import { ProcurementProjectIdentityPanel } from "./ProcurementProjectIdentityPanel";
import { WorkerAssignmentPanel } from "./WorkerAssignmentPanel";
import { canAssignProjectCoordination, isDesignerAssignmentPending } from "./adminProjectPresentation";

export type ProjectAssignmentArea = "procurement" | "manager" | "designer" | "trades";

interface ProjectPeopleAssignmentsProps {
  project: AdminProjectSummary;
  canAssignDesigner: boolean;
  canAssignWorkers: boolean;
  canManageProjectManager: boolean;
  area: ProjectAssignmentArea | null;
  onAreaChange: (area: ProjectAssignmentArea) => void;
  presentation?: "standard" | "primary";
}

export function ProjectPeopleAssignments(props: ProjectPeopleAssignmentsProps) {
  return <AssignmentsForProject key={`${props.project.id}:${props.presentation ?? "standard"}`} {...props} />;
}

function AssignmentsForProject({ project, canAssignDesigner, canAssignWorkers, canManageProjectManager, area, onAreaChange, presentation = "standard" }: ProjectPeopleAssignmentsProps) {
  const primary = presentation === "primary";
  const areas: Array<{ id: ProjectAssignmentArea; label: string }> = [
    ...(primary ? [{ id: "designer" as const, label: "Designer" }] : []),
    ...(canAssignWorkers ? [{ id: "procurement" as const, label: "Procurement" }] : []),
    ...(canManageProjectManager || canAssignWorkers ? [{ id: "manager" as const, label: "Project Manager" }] : []),
    ...(!primary ? [{ id: "designer" as const, label: "Designer" }] : []),
    ...(!primary && canAssignWorkers ? [{ id: "trades" as const, label: "Trade teams" }] : [])
  ];
  const initialArea = !primary && canAssignWorkers && canAssignProjectCoordination(project) && !isDesignerAssignmentPending(project) ? "procurement" : "designer";
  const active = area && areas.some(item => item.id === area) ? area : initialArea;
  const [visited, setVisited] = useState<ReadonlySet<ProjectAssignmentArea>>(() => new Set());
  useEffect(() => {
    if (primary) setVisited(previous => previous.has(active) ? previous : new Set([...previous, active]));
  }, [active, primary]);

  function editor(responsibility: ProjectAssignmentArea) {
    if (responsibility === "designer") return <DesignAssignmentPanel project={project} canManage={canAssignDesigner} />;
    if (responsibility === "manager" && canManageProjectManager) return <ProcurementProjectIdentityPanel projectId={project.id} defaultOpen assignmentOnly={primary} />;
    return <WorkerAssignmentPanel project={project} assignmentArea={responsibility} defaultExpanded={responsibility === "trades"} />;
  }

  return <section id="project-people-assignments" className="project-people-assignments" data-presentation={presentation} aria-labelledby="project-people-assignments-title">
    <header><h2 id="project-people-assignments-title" tabIndex={-1}>People &amp; assignments</h2><p>Choose a responsibility to view its current owner and manage the assignment.</p></header>
    <div className="project-people-assignments__navigation" role="group" aria-label="Assignment responsibility">
      {areas.map(item => <Button key={item.id} variant="quiet" aria-pressed={active === item.id} aria-controls={`project-people-${item.id}`}
        onClick={() => onAreaChange(item.id)}>{item.label}</Button>)}
    </div>
    {areas.map(item => <div key={item.id} id={`project-people-${item.id}`} hidden={active !== item.id} inert={active !== item.id}>
      {!primary || active === item.id || visited.has(item.id) ? editor(item.id) : null}
    </div>)}
  </section>;
}
