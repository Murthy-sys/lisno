import { ROLE_CODES, type Role } from "../domain/roles.js";
import { ApiError } from "../middleware/errors.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository,
  type PaginationInput,
  type UserDirectoryFilters,
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
  createdAt: string;
  updatedAt: string;
}

export type UpdateManagedUserInput =
  | { version: number; role: Role; active?: never }
  | { version: number; active: boolean; role?: never };

export interface ManagedUserMutationResult {
  user: UserDirectoryItem;
  revokedGrantCount: number;
  responsibilities: UserResponsibilityCounts;
}

export interface UserDirectoryPage {
  items: UserDirectoryItem[];
  total: number;
  filterRoles: readonly Role[];
  manageableRoles: readonly Exclude<Role, "super_admin">[];
}

export interface UserAdministrationService {
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
}

const responsibilityRole: Readonly<
  Record<keyof UserResponsibilityCounts, Role>
> = {
  ownedActiveLeads: "estimator_sales",
  ownedActiveEstimates: "estimator_sales",
  initiatedActiveProjects: "designer",
  assignedActiveProjects: "designer",
  managedActiveProjects: "design_manager",
  ownedActiveTasks: "designer",
  directReports: "design_manager",
  linkedClientProjects: "client",
  adminInitiatorGrants: "admin"
};

const FILTER_ROLES: readonly Role[] = [...ROLE_CODES];
const MANAGEABLE_ROLES: readonly Exclude<Role, "super_admin">[] = ROLE_CODES.filter(
  (role): role is Exclude<Role, "super_admin"> => role !== "super_admin"
);

export function createUserAdministrationService(
  repository: AppRepository,
  auditService: AuditService,
  clock: Clock
): UserAdministrationService {
  return {
    async list(actor, filters, pagination) {
      const storedActor = await requireAdministrativeActor(repository, actor);
      const visibleRoles = FILTER_ROLES;
      if (filters.role && !visibleRoles.includes(filters.role)) forbidden();
      const page = await repository.pageUsers(
        { ...filters, visibleRoles },
        pagination
      );
      return {
        items: page.items.map(toUserDirectoryItem),
        total: page.total,
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
        if (target.version !== input.version) versionConflict();

        if (input.role === "super_admin") {
          throw new ApiError(
            400,
            "ROLE_NOT_MANAGEABLE",
            "This role cannot be assigned."
          );
        }

        const roleChanges = input.role !== undefined && input.role !== target.role;
        const activeChanges = input.active !== undefined && input.active !== target.active;
        const deactivates = activeChanges && input.active === false;

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

        if (!roleChanges && !activeChanges) {
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

        for (const grant of revoked) {
          await auditService.append(
            {
              actorId: storedActor.id,
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

        if (roleChanges) {
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
    }
  };
}

async function requireAdministrativeActor(
  repository: AppRepository,
  actor: PublicUser
): Promise<UserRecord & { role: "super_admin" }> {
  const stored = await repository.findUserById(actor.id);
  if (!stored || !stored.active || stored.role !== actor.role) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
  if (stored.role !== "super_admin") forbidden();
  return stored as UserRecord & { role: "super_admin" };
}

function hasIncompatibleResponsibility(
  counts: UserResponsibilityCounts,
  destinationRole: Role
): boolean {
  return (Object.entries(counts) as Array<
    [keyof UserResponsibilityCounts, number]
  >).some(
    ([responsibility, count]) =>
      count > 0 && responsibilityRole[responsibility] !== destinationRole
  );
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
