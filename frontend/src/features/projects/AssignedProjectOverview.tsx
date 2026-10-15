import type { Project } from "../../api/types";
import { Surface } from "../../components/ui/Surface";
import "./projectRead.css";

const statusLabels: Record<Project["status"], string> = { planning: "Planning", active: "Active", on_hold: "On hold", completed: "Completed" };
function projectDate(value: string) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not set";
}

export function AssignedProjectOverview({ project }: { project: Project }) {
  return <Surface as="section" aria-label="Project details">
    <h2>Project details</h2>
    <dl className="assigned-project-overview">
      <div><dt>Client</dt><dd>{project.clientName || "Not provided"}</dd></div>
      <div><dt>Location</dt><dd>{project.location || "Not provided"}</dd></div>
      <div><dt>Status</dt><dd>{statusLabels[project.status]}</dd></div>
      <div><dt>Planned start</dt><dd>{projectDate(project.plannedStartAt)}</dd></div>
      <div><dt>Planned completion</dt><dd>{projectDate(project.plannedEndAt)}</dd></div>
      {typeof project.progress === "number" ? <div><dt>Project progress</dt><dd>{project.progress}%</dd></div> : null}
    </dl>
  </Surface>;
}
