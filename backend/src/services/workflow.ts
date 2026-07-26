import { ApiError } from "../middleware/errors.js";
import type {
  AppRepository,
  ProjectRecord,
  TaskRecord,
  UserRecord
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";

export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export async function requireActor(
  repository: AppRepository,
  actor: PublicUser
): Promise<UserRecord> {
  const user = await repository.findUserById(actor.id);
  if (!user || !user.active || user.role !== actor.role) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
  return user;
}

export async function requireUser(
  repository: AppRepository,
  userId: string
): Promise<UserRecord> {
  const user = await repository.findUserById(userId);
  if (!user || !user.active) {
    throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  }
  return user;
}

export async function requireAccessibleProject(
  repository: AppRepository,
  actor: PublicUser,
  projectId: string
): Promise<ProjectRecord> {
  const user = await requireActor(repository, actor);
  const project = await repository.findProjectById(projectId);
  if (!project) {
    throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  }
  const visibleProjects = await repository.listProjectsForUser(user);
  if (!visibleProjects.some((candidate) => candidate.id === project.id)) {
    // Entity isolation deliberately does not reveal that an inaccessible ID exists.
    throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  }
  return project;
}

export async function requireTask(
  repository: AppRepository,
  taskId: string
): Promise<TaskRecord> {
  const task = await repository.findTaskById(taskId);
  if (!task) {
    throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  }
  return task;
}

export async function assertDesignerRelationship(
  repository: AppRepository,
  actor: PublicUser,
  designerId: string
): Promise<UserRecord> {
  const designer = await requireUser(repository, designerId);
  if (designer.role !== "designer") {
    throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  }

  if (actor.role === "design_head" || actor.id === designer.id) return designer;
  if (actor.role === "design_manager" && designer.managerId === actor.id) {
    return designer;
  }
  throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
}

export function forbidden(): never {
  throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
}
