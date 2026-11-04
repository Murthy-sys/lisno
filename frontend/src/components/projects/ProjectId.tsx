import "./projectId.css";

export function projectIdLabel(projectNumber: string | null | undefined): string {
  return projectNumber == null ? "Project ID not assigned" : `Project ID: ${projectNumber}`;
}

/** Live project identity supplied by an already authorized, loaded response. */
export function ProjectId({ projectNumber, className = "" }: { projectNumber?: string | null; className?: string }) {
  return <span className={`project-id${className ? ` ${className}` : ""}`}>{projectIdLabel(projectNumber)}</span>;
}
