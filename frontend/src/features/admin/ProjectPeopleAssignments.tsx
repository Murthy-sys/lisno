import type { AdminProjectSummary } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { DesignAssignmentPanel } from "./DesignAssignmentPanel";
import { ProcurementProjectIdentityPanel } from "./ProcurementProjectIdentityPanel";
import { WorkerAssignmentPanel } from "./WorkerAssignmentPanel";
import { canAssignProjectCoordination, isDesignerAssignmentPending } from "./adminProjectPresentation";

export type ProjectAssignmentArea = "procurement" | "manager" | "designer" | "trades";

export function ProjectPeopleAssignments({ project, canAssignDesigner, canAssignWorkers, canManageProjectManager, area, onAreaChange }: {
  project: AdminProjectSummary;
  canAssignDesigner: boolean;
  canAssignWorkers: boolean;
  canManageProjectManager: boolean;
  area: ProjectAssignmentArea | null;
  onAreaChange: (area: ProjectAssignmentArea) => void;
}) {
  const areas: Array<{ id: ProjectAssignmentArea; label: string }> = [
    ...(canAssignWorkers ? [{ id: "procurement" as const, label: "Procurement" }] : []),
    ...(canManageProjectManager || canAssignWorkers ? [{ id: "manager" as const, label: "Project Manager" }] : []),
    { id: "designer", label: "Designer" },
    ...(canAssignWorkers ? [{ id: "trades" as const, label: "Trade teams" }] : [])
  ];
  const initialArea = canAssignWorkers && canAssignProjectCoordination(project) && !isDesignerAssignmentPending(project) ? "procurement" : "designer";
  const active = areas.some(item => item.id === area) ? area : initialArea;
  return <section id="project-people-assignments" className="project-people-assignments" aria-labelledby="project-people-assignments-title">
    <header><h2 id="project-people-assignments-title">People &amp; assignments</h2><p>Choose a responsibility to view its current owner and manage the assignment.</p></header>
    <div className="project-people-assignments__navigation" role="group" aria-label="Assignment responsibility">
      {areas.map(item => <Button key={item.id} variant="quiet" aria-pressed={active === item.id} aria-controls={`project-people-${item.id}`}
        onClick={() => onAreaChange(item.id)}>{item.label}</Button>)}
    </div>
    {canAssignWorkers ? <div id="project-people-procurement" hidden={active !== "procurement"}>
      <WorkerAssignmentPanel project={project} assignmentArea="procurement" />
    </div> : null}
    {canManageProjectManager || canAssignWorkers ? <div id="project-people-manager" hidden={active !== "manager"}>
      {canManageProjectManager ? <ProcurementProjectIdentityPanel key={project.id} projectId={project.id} defaultOpen /> : <WorkerAssignmentPanel project={project} assignmentArea="manager" />}
    </div> : null}
    <div id="project-people-designer" hidden={active !== "designer"}>
      <DesignAssignmentPanel key={project.id} project={project} canManage={canAssignDesigner} />
    </div>
    {canAssignWorkers ? <div id="project-people-trades" hidden={active !== "trades"}>
      <WorkerAssignmentPanel project={project} assignmentArea="trades" defaultExpanded />
    </div> : null}
  </section>;
}
