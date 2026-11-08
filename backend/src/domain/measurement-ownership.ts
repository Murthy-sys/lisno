import type { ProjectRecord, UserRecord } from "../repositories/types.js";

type MeasurementProject = Pick<ProjectRecord, "estimationWorkflowVersion" | "primaryDesignerId" | "secondaryDesignerIds">;
type MeasurementUser = Pick<UserRecord, "id" | "name" | "role" | "active" | "deletedAt">;
export interface SecondaryMeasurementDesigner { id: string; name: string; role: "designer" }

export function secondaryMeasurementDesignerIds(project: MeasurementProject): string[] {
  return project.estimationWorkflowVersion === 3
    ? [...new Set(project.secondaryDesignerIds ?? [])].filter(id => id !== project.primaryDesignerId)
    : [];
}

export function isSecondaryMeasurementDesigner(project: MeasurementProject, user: MeasurementUser): boolean {
  return user.active && !user.deletedAt && user.role === "designer" && secondaryMeasurementDesignerIds(project).includes(user.id);
}

/** Current ownership is derived from saved team IDs, never a historical measurement assignment. */
export function secondaryMeasurementDesigners(project: MeasurementProject, users: readonly (MeasurementUser | null)[]): SecondaryMeasurementDesigner[] {
  const people = new Map(users.flatMap(user => user && isSecondaryMeasurementDesigner(project, user)
    ? [[user.id, { id: user.id, name: user.name, role: "designer" as const }] as const] : []));
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function secondaryMeasurementAssignmentReason(project: MeasurementProject): string {
  return secondaryMeasurementDesignerIds(project).length
    ? "Assign an active Secondary Designer in Design team to carry out onsite measurement."
    : "Assign a Secondary Designer in Design team to carry out onsite measurement.";
}
