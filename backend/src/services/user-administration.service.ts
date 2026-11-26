import { readUserLanguages, sameUserLanguages, userLanguageUpdateSchema } from "../domain/user-languages.js";
import type { ProjectLanguage } from "../contracts/project-initiation.js";
import { userLocationSchema } from "../domain/user-location.js";
import type { ChatActor } from "../contracts/project-chat.js";
import type { UserResponsibilitiesPage, UserResponsibilityQuery, UserResponsibilityReader } from "../contracts/user-responsibilities.js";
import { hasIncompatibleResponsibility } from "../domain/user-responsibilities.js";
import { ACTIVE_ROLE_CODES, ROLE_CODES, type Role } from "../domain/roles.js";
import { ApiError } from "../middleware/errors.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository,
  type PaginationInput,
  type ProjectAccessGrantRecord,
  type UserDirectoryFilters,
  type UserDirectorySummary,
  type UserRecord,
  type UserResponsibilityCounts
} from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { Clock } from "./workflow.js";

export interface UserDirectoryItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  version: number;
  avatar?: string;
  title?: string;
  location: string | null;
  languagesKnown: ProjectLanguage[];
  preferredLanguage: ProjectLanguage | null;
  createdAt: string;
  updatedAt: string;
}

export type UpdateManagedUserInput =
  | { version: number; role: Role; active?: never; location?: never; languagesKnown?: never; preferredLanguage?: never }
  | { version: number; active: boolean; role?: never; location?: never; languagesKnown?: never; preferredLanguage?: never }
  | { version: number; location: string | null; role?: never; active?: never; languagesKnown?: never; preferredLanguage?: never }
  | { version: number; languagesKnown: ProjectLanguage[]; preferredLanguage: ProjectLanguage | null; role?: never; active?: never; location?: never };

export interface ManagedUserMutationResult {
  user: UserDirectoryItem;
  revokedGrantCount: number;
  responsibilities: UserResponsibilityCounts;
}

export interface ManagedUserDeletionResult {
  userId: string;
  deletedAt: string;
  version: number;
}

export interface UserDirectoryPage {
  items: UserDirectoryItem[];
  total: number;
  summary: UserDirectorySummary;
  filterRoles: readonly Role[];
  manageableRoles: readonly Exclude<Role, "super_admin">[];
}

export interface UserAdministrationService {
  responsibilities(actor: ChatActor, userId: string, query: UserResponsibilityQuery): Promise<UserResponsibilitiesPage>;
  list(
    actor: PublicUser,
    filters: UserDirectoryFilters,
    pagination: PaginationInput
  ): Promise<UserDirectoryPage>;
  update(
    actor: PublicUser,
    userId: string,
    input: UpdateManagedUserInput
  ): Promise<ManagedUserMutationResult>;
  delete(actor: PublicUser, userId: string, input: { version: number }): Promise<ManagedUserDeletionResult>;
}

const FILTER_ROLES: readonly Role[] = [...ROLE_CODES];
const MANAGEABLE_ROLES: readonly Exclude<Role, "super_admin" | "vendor" | "program_manager">[] = ACTIVE_ROLE_CODES.filter(
  (role): role is Exclude<Role, "super_admin" | "vendor" | "program_manager"> => role !== "super_admin" && role !== "vendor"
);

export function createUserAdministrationService(
  repository: AppRepository,
  auditService: AuditService,
  clock: Clock,
  responsibilityReader?: UserResponsibilityReader
): UserAdministrationService {
  return {
    async responsibilities(actor, userId, query) {
      if (!responsibilityReader) throw new ApiError(503, "USER_RESPONSIBILITIES_UNAVAILABLE", "Assignments are temporarily unavailable.");
      return responsibilityReader(actor, userId, query);
    },

    async list(actor, filters, pagination) {
      const storedActor = await requireAdministrativeActor(repository, actor);
      const visibleRoles = FILTER_ROLES;
      if (filters.role && !visibleRoles.includes(filters.role)) forbidden();
      const page = await repository.pageUsers(
        { ...filters, visibleRoles },
        pagination
      );
      // The summary describes the whole visible-role-scoped directory and is
      // deliberately independent of the caller's search / role / active filters.
      const summary = await repository.summarizeUsers(visibleRoles);
      return {
        items: page.items.map(toUserDirectoryItem),
        total: page.total,
        summary,
        filterRoles: [...FILTER_ROLES],
        manageableRoles: [...MANAGEABLE_ROLES]
      };
    },

    async update(actor, userId, input) {
      return repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const storedActor = await requireAdministrativeActor(transaction, actor);
        const target = await transaction.findUserById(userId);
        if (!target) notFound();
        if (target.role === "super_admin") {
          throw new ApiError(
            409,
            "SOLE_SUPER_ADMIN_IMMUTABLE",
            "The sole Super Admin account cannot be changed."
          );
        }
        if (target.deletedAt) notFound();
        if (target.version !== input.version) versionConflict();

        if (input.role === "super_admin" || input.role === "program_manager") {
          throw new ApiError(
            400,
            "ROLE_NOT_MANAGEABLE",
            "This role cannot be assigned."
          );
        }

        if (target.role === "program_manager" && input.role !== undefined) {
          throw new ApiError(409, "PROJECT_MANAGER_MIGRATION_REQUIRED", "Use the reviewed Project Manager migration to preserve assignments and approval history.");
        }
        let languageChange: ReturnType<typeof readUserLanguages> | undefined;
        if ("languagesKnown" in input || "preferredLanguage" in input) {
          const parsed = userLanguageUpdateSchema.safeParse(input);
          if (!parsed.success) {
            const fields: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
              if (issue.code === "unrecognized_keys") {
                for (const key of issue.keys) fields[key] = `Unrecognized field: ${key}.`;
              } else fields[String(issue.path[0] ?? "languagesKnown")] = issue.message;
            }
            throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", fields);
          }
          languageChange = readUserLanguages(parsed.data);
        }
        const languageChanges = languageChange !== undefined && !sameUserLanguages(readUserLanguages(target), languageChange);
        const roleChanges = input.role !== undefined && input.role !== target.role;
        const activeChanges = input.active !== undefined && input.active !== target.active;
        const deactivates = activeChanges && input.active === false;
        const locationResult = input.location === undefined ? undefined : userLocationSchema.safeParse(input.location);
        if (locationResult && !locationResult.success) {
          throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", { location: locationResult.error.issues[0]?.message ?? "Location is invalid." });
        }
        const location = locationResult?.success ? locationResult.data : undefined;
        const locationChanges = location !== undefined && location !== (target.location ?? null);

        const responsibilities = await transaction.countUserResponsibilities(target.id);
        if (
          roleChanges &&
          hasIncompatibleResponsibility(responsibilities, input.role!)
        ) {
          throw new ApiError(
            409,
            "RESPONSIBILITY_REASSIGNMENT_REQUIRED",
            "Reassign dependent work first."
          );
        }

        if (!roleChanges && !activeChanges && !locationChanges && !languageChanges) {
          return {
            user: toUserDirectoryItem(target),
            revokedGrantCount: 0,
            responsibilities
          };
        }

        const occurredAt = clock().toISOString();
        let updated: UserRecord;
        try {
          updated = await transaction.updateUser(target.id, target.version, {
            ...(roleChanges ? { role: input.role } : {}),
            ...(activeChanges ? { active: input.active } : {}),
            ...(locationChanges ? { location } : {}),
            ...(languageChanges ? languageChange : {}),
            updatedAt: occurredAt
          });
        } catch (error) {
          if (error instanceof RepositoryConflictError) versionConflict();
          if (error instanceof RepositoryNotFoundError) notFound();
          throw error;
        }

        const revoked =
          roleChanges || deactivates
            ? await transaction.revokeActiveProjectAccessGrantsForUser(target.id, {
                revokedAt: occurredAt,
                revokedById: storedActor.id,
                revocationReason: roleChanges
                  ? "User role changed."
                  : "User account deactivated.",
                updatedAt: occurredAt
              })
            : [];

        await auditRevokedGrants(auditService, transaction, revoked, storedActor.id, occurredAt);

        if (languageChanges) {
          await auditService.append({
            actorId: storedActor.id,
            action: "user.languages_updated",
            entityType: "user",
            entityId: target.id,
            occurredAt,
            oldValues: { ...readUserLanguages(target), version: target.version },
            newValues: { ...readUserLanguages(updated), version: updated.version }
          }, transaction);
        } else if (locationChanges) {
          await auditService.append({
            actorId: storedActor.id,
            action: "user.location_updated",
            entityType: "user",
            entityId: target.id,
            occurredAt,
            oldValues: { location: target.location ?? null, version: target.version },
            newValues: { location: updated.location ?? null, version: updated.version }
          }, transaction);
        } else if (roleChanges) {
          await auditService.append(
            {
              actorId: storedActor.id,
              action: "user.role_changed",
              entityType: "user",
              entityId: target.id,
              occurredAt,
              oldValues: { role: target.role, version: target.version },
              newValues: { role: updated.role, version: updated.version }
            },
            transaction
          );
        } else if (activeChanges) {
          await auditService.append(
            {
              actorId: storedActor.id,
              action: updated.active ? "user.activated" : "user.deactivated",
              entityType: "user",
              entityId: target.id,
              occurredAt,
              oldValues: { active: target.active, version: target.version },
              newValues: {
                active: updated.active,
                version: updated.version,
                ...(updated.active ? {} : { responsibilities: { ...responsibilities } })
              },
              ...(updated.active
                ? {}
                : { reason: "User account deactivated with responsibilities preserved." })
            },
            transaction
          );
        }

        return {
          user: toUserDirectoryItem(updated),
          revokedGrantCount: revoked.length,
          responsibilities
        };
      });
    },

    async delete(actor, userId, input) {
      // A completed deletion has no mutable state left; retries need no write fence.
      await requireAdministrativeActor(repository, actor);
      const existing = await repository.findUserById(userId);
      requireDeletableTarget(existing);
      if (existing.deletedAt) return deletionResult(existing);

      return repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const storedActor = await requireAdministrativeActor(transaction, actor);
        const target = await transaction.findUserById(userId);
        requireDeletableTarget(target);
        if (target.deletedAt) return deletionResult(target);
        if (target.version !== input.version) versionConflict();

        const responsibilities = await transaction.countUserResponsibilities(target.id);
        const occurredAt = clock().toISOString();
        let deleted: UserRecord;
        try {
          deleted = await transaction.deleteUser(target.id, target.version, {
            deletedAt: occurredAt,
            deletedById: storedActor.id
          });
        } catch (error) {
          if (error instanceof RepositoryConflictError) versionConflict();
          if (error instanceof RepositoryNotFoundError) notFound();
          throw error;
        }
        const revoked = await transaction.revokeActiveProjectAccessGrantsForUser(target.id, {
          revokedAt: occurredAt,
          revokedById: storedActor.id,
          revocationReason: "User account deleted.",
          updatedAt: occurredAt
        });
        await auditRevokedGrants(auditService, transaction, revoked, storedActor.id, occurredAt);
        await auditService.append({
          actorId: storedActor.id,
          action: "user.deleted",
          entityType: "user",
          entityId: target.id,
          occurredAt,
          oldValues: { active: target.active, version: target.version },
          newValues: {
            active: false,
            version: deleted.version,
            deletedAt: occurredAt,
            deletedById: storedActor.id,
            revokedGrantCount: revoked.length,
            responsibilities: { ...responsibilities }
          },
          reason: "User account deleted with identity and business history preserved."
        }, transaction);
        return deletionResult(deleted);
      });
    }
  };
}

function requireDeletableTarget(target: UserRecord | null): asserts target is UserRecord {
  if (!target) notFound();
  if (target.role === "super_admin") {
    throw new ApiError(409, "SOLE_SUPER_ADMIN_IMMUTABLE", "The sole Super Admin account cannot be changed.");
  }
}

function deletionResult(user: UserRecord): ManagedUserDeletionResult {
  return { userId: user.id, deletedAt: user.deletedAt!, version: user.version };
}

async function auditRevokedGrants(
  auditService: AuditService,
  transaction: AppRepository,
  revoked: ProjectAccessGrantRecord[],
  actorId: string,
  occurredAt: string
): Promise<void> {
  for (const grant of revoked) {
    await auditService.append(
      {
        actorId,
        action: "project_access.revoked",
        entityType: "project_access_grant",
        entityId: grant.id,
        occurredAt,
        oldValues: {
          projectId: grant.projectId,
          userId: grant.userId,
          module: grant.module,
          source: grant.source,
          active: true,
          version: grant.version - 1
        },
        newValues: {
          active: false,
          version: grant.version,
          revokedAt: grant.revokedAt,
          revokedById: grant.revokedById
        },
        reason: grant.revocationReason
      },
      transaction
    );
  }
}

async function requireAdministrativeActor(
  repository: AppRepository,
  actor: PublicUser
): Promise<UserRecord & { role: "super_admin" }> {
  const stored = await repository.findUserById(actor.id);
  if (!stored || !stored.active || stored.deletedAt || stored.role !== actor.role) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
  if (stored.role !== "super_admin") forbidden();
  return stored as UserRecord & { role: "super_admin" };
}

function toUserDirectoryItem(user: UserRecord): UserDirectoryItem {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    version: user.version,
    ...(user.avatar ? { avatar: user.avatar } : {}),
    ...(user.title ? { title: user.title } : {}),
    location: user.location ?? null,
    ...readUserLanguages(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function forbidden(): never {
  throw new ApiError(
    403,
    "FORBIDDEN",
    "You are not authorized to perform this action."
  );
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

function versionConflict(): never {
  throw new ApiError(409, "VERSION_CONFLICT", "The user changed elsewhere.");
}
