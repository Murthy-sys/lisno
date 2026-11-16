import {
  PROJECT_INITIATION_DEFAULTS_ID,
  type ProjectInitiationDefaults,
  type UpdateProjectInitiationDefaults
} from "../contracts/project-initiation-defaults.js";
import { ApiError } from "../middleware/errors.js";
import { RepositoryConflictError, type AppRepository, type UserRecord } from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { projectInitiationDefaultVersionConflict, readProjectInitiationDefaults } from "./project-initiation-default-resolution.js";
import { forbidden, type Clock } from "./workflow.js";

export interface ProjectInitiationDefaultsService {
  read(actor: PublicUser): Promise<ProjectInitiationDefaults>;
  update(actor: PublicUser, input: UpdateProjectInitiationDefaults): Promise<ProjectInitiationDefaults>;
}

async function currentActor(repository: AppRepository, actor: PublicUser): Promise<UserRecord> {
  const stored = await repository.findUserById(actor.id);
  if (!stored || !stored.active || stored.deletedAt || stored.role !== actor.role) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
  if (!["super_admin", "admin", "estimator_sales"].includes(stored.role)) forbidden();
  if (stored.role === "super_admin" && await repository.countActiveUsersByRole("super_admin") !== 1) forbidden();
  return stored;
}

export function createProjectInitiationDefaultsService(
  repository: AppRepository,
  audit: AuditService,
  clock: Clock
): ProjectInitiationDefaultsService {
  return {
    async read(actor) {
      await currentActor(repository, actor);
      return readProjectInitiationDefaults(repository);
    },

    async update(actor, input) {
      try {
        return await repository.runInTransaction(async transaction => {
          await transaction.coordinateAuthorizationMutation();
          const storedActor = await currentActor(transaction, actor);
          if (storedActor.role !== "super_admin") forbidden();
          if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
            throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", { expectedVersion: "Use a nonnegative integer version." });
          }
          const previous = await transaction.findProjectInitiationDefaults();
          if ((previous?.version ?? 0) !== input.expectedVersion) throw projectInitiationDefaultVersionConflict();
          const target = await transaction.findUserById(input.projectManagerId);
          if (!target || !target.active || target.deletedAt || target.role !== "site_manager") {
            throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", { projectManagerId: "Select an active Project Manager." });
          }
          if (previous?.projectManagerId === target.id) return readProjectInitiationDefaults(transaction);
          const version = input.expectedVersion + 1;
          if (!Number.isSafeInteger(version)) throw projectInitiationDefaultVersionConflict();
          const occurredAt = clock().toISOString();
          await transaction.saveProjectInitiationDefaults({
            projectManagerId: target.id,
            version,
            updatedById: storedActor.id,
            updatedAt: occurredAt
          }, input.expectedVersion);
          await audit.append({
            actorId: storedActor.id,
            action: "project_initiation_defaults_updated",
            entityType: "project_initiation_defaults",
            entityId: PROJECT_INITIATION_DEFAULTS_ID,
            occurredAt,
            oldValues: { projectManagerId: previous?.projectManagerId ?? null, version: previous?.version ?? 0 },
            newValues: { projectManagerId: target.id, version }
          }, transaction);
          return readProjectInitiationDefaults(transaction);
        });
      } catch (error) {
        if (error instanceof RepositoryConflictError) throw projectInitiationDefaultVersionConflict();
        throw error;
      }
    }
  };
}
