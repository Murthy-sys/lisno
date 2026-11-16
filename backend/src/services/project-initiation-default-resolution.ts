import type { ProjectInitiationDefaults } from "../contracts/project-initiation-defaults.js";
import { ApiError } from "../middleware/errors.js";
import type { AppRepository } from "../repositories/types.js";

export function projectInitiationDefaultVersionConflict(): ApiError {
  return new ApiError(409, "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT", "The default Project Manager changed. Refresh and try again.");
}

export async function readProjectInitiationDefaults(repository: AppRepository): Promise<ProjectInitiationDefaults> {
  const record = await repository.findProjectInitiationDefaults();
  if (!record) return { version: 0, status: "unconfigured", projectManager: null };
  const user = await repository.findUserById(record.projectManagerId);
  if (!user || !user.active || user.deletedAt || user.role !== "site_manager") {
    return { version: record.version, status: "unavailable", projectManager: null };
  }
  return { version: record.version, status: "ready", projectManager: { id: user.id, name: user.name } };
}

/** Caller holds authorization coordination inside the project creation transaction. */
export async function resolveProjectManagerDefault(
  repository: AppRepository,
  expectedVersion?: number
): Promise<{ projectManagerId: string; version: number }> {
  const defaults = await readProjectInitiationDefaults(repository);
  if (expectedVersion !== undefined && defaults.version !== expectedVersion) throw projectInitiationDefaultVersionConflict();
  if (defaults.status === "unconfigured") {
    throw new ApiError(409, "PROJECT_INITIATION_DEFAULT_UNCONFIGURED", "Ask Super Admin to configure the default Project Manager before creating a project.");
  }
  if (defaults.status !== "ready") {
    throw new ApiError(409, "PROJECT_INITIATION_DEFAULT_UNAVAILABLE", "The default Project Manager is unavailable. Ask Super Admin to update Project defaults.");
  }
  return { projectManagerId: defaults.projectManager.id, version: defaults.version };
}
