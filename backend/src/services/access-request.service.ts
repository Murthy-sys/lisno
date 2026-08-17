import { createHash } from "node:crypto";

import {
  roleMayRequestModule,
  type RequestableProjectModule
} from "../domain/authorization.js";
import { grantCanSupplyProjectModuleScope } from "../domain/project-access.js";
import type { Role } from "../domain/roles.js";
import { ApiError } from "../middleware/errors.js";
import {
  RepositoryConflictError,
  type AccessRequestFilters,
  type AccessRequestRecord,
  type AccessRequestStatus,
  type AppRepository,
  type PageResult,
  type PaginationInput,
  type ProjectAccessGrantRecord,
  type UserRecord
} from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { Clock } from "./workflow.js";

export interface SubmitAccessRequestInput {
  projectId: string;
  module: RequestableProjectModule;
  reason: string;
}

export interface OwnAccessRequestDto {
  id: string;
  projectId: string;
  module: RequestableProjectModule;
  reason: string;
  status: AccessRequestStatus;
  decisionReason: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAccessRequestDto extends OwnAccessRequestDto {
  requester: {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
  };
  project: {
    id: string;
    resolved: boolean;
    name: string | null;
  };
  reviewerId: string | null;
  activeGrant: {
    id: string;
    version: number;
    grantedAt: string;
  } | null;
}

export interface ProjectAccessGrantDto {
  id: string;
  projectId: string;
  userId: string;
  module: ProjectAccessGrantRecord["module"];
  source: ProjectAccessGrantRecord["source"];
  accessRequestId: string | null;
  grantedById: string;
  active: boolean;
  grantedAt: string;
  revokedAt: string | null;
  revokedById: string | null;
  revocationReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type AccessRequestDecisionInput =
  | { version: number; decision: "approved"; reason?: never }
  | { version: number; decision: "rejected"; reason: string };

export interface AccessRequestDecisionResult {
  request: ReviewAccessRequestDto;
  grant: ProjectAccessGrantDto | null;
}

export interface AccessRequestService {
  submit(
    actor: PublicUser,
    input: SubmitAccessRequestInput
  ): Promise<{ accepted: true }>;
  listOwn(
    actor: PublicUser,
    filters: AccessRequestFilters,
    pagination: PaginationInput
  ): Promise<PageResult<OwnAccessRequestDto>>;
  cancel(
    actor: PublicUser,
    requestId: string,
    input: { version: number }
  ): Promise<OwnAccessRequestDto>;
  listForReview(
    actor: PublicUser,
    filters: AccessRequestFilters,
    pagination: PaginationInput
  ): Promise<PageResult<ReviewAccessRequestDto>>;
  decide(
    actor: PublicUser,
    requestId: string,
    input: AccessRequestDecisionInput
  ): Promise<AccessRequestDecisionResult>;
  revoke(
    actor: PublicUser,
    grantId: string,
    input: { version: number; reason: string }
  ): Promise<ProjectAccessGrantDto>;
}

export function createAccessRequestService(
  repository: AppRepository,
  auditService: AuditService,
  clock: Clock
): AccessRequestService {
  return {
    async submit(actor, input) {
      await repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const storedActor = await transaction.findUserById(actor.id);
        if (!storedActor || !storedActor.active || storedActor.role !== actor.role) {
          throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
        }
        if (!roleMayRequestModule(storedActor.role, input.module)) {
          throw new ApiError(
            403,
            "FORBIDDEN",
            "You are not authorized to perform this action."
          );
        }

        const occurredAt = clock().toISOString();
        const result = await transaction.findOrCreatePendingAccessRequest({
          requesterId: storedActor.id,
          projectId: input.projectId,
          module: input.module,
          reason: input.reason.trim(),
          createdAt: occurredAt,
          updatedAt: occurredAt
        });
        if (result.created) {
          await auditService.append(
            {
              actorId: storedActor.id,
              action: "access_request.created",
              entityType: "access_request",
              entityId: result.record.id,
              occurredAt,
              newValues: {
                projectId: result.record.projectId,
                module: result.record.module,
                status: result.record.status
              }
            },
            transaction
          );
        }
      });
      return { accepted: true };
    },

    async listOwn(actor, filters, pagination) {
      await requireCurrentActor(repository, actor);
      const page = await repository.pageAccessRequestsForRequester(
        actor.id,
        filters,
        pagination
      );
      return {
        items: page.items.map(toOwnAccessRequestDto),
        total: page.total
      };
    },

    async cancel(actor, requestId, input) {
      return repository.runInTransaction(async (transaction) => {
        const storedActor = await requireCurrentActor(transaction, actor);
        const record = await transaction.findAccessRequestById(requestId);
        if (!record || record.requesterId !== storedActor.id) notFound();

        if (record.status === "cancelled") {
          if (input.version + 1 === record.version) {
            return toOwnAccessRequestDto(record);
          }
          versionConflict();
        }
        if (record.status !== "pending" || input.version !== record.version) {
          versionConflict();
        }

        const occurredAt = clock().toISOString();
        let cancelled: AccessRequestRecord;
        try {
          cancelled = await transaction.transitionAccessRequest(
            record.id,
            input.version,
            {
              status: "cancelled",
              reviewerId: null,
              decisionReason: null,
              decisionFingerprint: null,
              approvedGrantId: null,
              reviewedAt: null,
              updatedAt: occurredAt
            }
          );
        } catch (error) {
          if (error instanceof RepositoryConflictError) versionConflict();
          throw error;
        }
        await auditService.append(
          {
            actorId: storedActor.id,
            action: "access_request.cancelled",
            entityType: "access_request",
            entityId: cancelled.id,
            occurredAt,
            oldValues: { status: "pending", version: record.version },
            newValues: { status: "cancelled", version: cancelled.version }
          },
          transaction
        );
        return toOwnAccessRequestDto(cancelled);
      });
    },

    async listForReview(actor, filters, pagination) {
      const storedActor = await requireCurrentActor(repository, actor);
      const scope = reviewListScope(storedActor);
      const page = await repository.pageAccessRequestsForReview(
        scope,
        filters,
        pagination
      );
      return {
        items: await Promise.all(
          page.items.map((record) => toReviewAccessRequestDto(repository, record))
        ),
        total: page.total
      };
    },

    async decide(actor, requestId, input) {
      return repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const reviewer = await requireCurrentActor(transaction, actor);
        const record = await transaction.findAccessRequestById(requestId);
        if (!record) notFound();
        await requireReviewScope(transaction, reviewer, record.projectId);

        const fingerprint = decisionFingerprintFor(input.decision, input.reason);
        if (record.status === "approved" || record.status === "rejected") {
          if (
            input.version + 1 !== record.version ||
            record.status !== input.decision ||
            record.decisionFingerprint !== fingerprint
          ) {
            versionConflict();
          }
          const exactGrant = record.approvedGrantId
            ? await transaction.findProjectAccessGrantById(record.approvedGrantId)
            : null;
          return {
            request: await toReviewAccessRequestDto(transaction, record),
            grant: exactGrant?.active ? toProjectAccessGrantDto(exactGrant) : null
          };
        }
        if (record.status !== "pending" || record.version !== input.version) {
          versionConflict();
        }

        const project = await transaction.findProjectById(record.projectId);
        const occurredAt = clock().toISOString();
        if (input.decision === "rejected") {
          const normalizedReason = input.reason.trim();
          if (!normalizedReason) {
            throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.");
          }
          const rejected = await transitionRequest(
            transaction,
            record,
            {
              status: "rejected",
              reviewerId: reviewer.id,
              decisionReason: project
                ? normalizedReason
                : ACCESS_REQUEST_NOT_APPROVABLE_MESSAGE,
              decisionFingerprint: fingerprint,
              approvedGrantId: null,
              reviewedAt: occurredAt,
              updatedAt: occurredAt
            }
          );
          await auditService.append(
            {
              actorId: reviewer.id,
              action: "access_request.rejected",
              entityType: "access_request",
              entityId: rejected.id,
              occurredAt,
              oldValues: { status: record.status, version: record.version },
              newValues: {
                status: rejected.status,
                version: rejected.version,
                decisionReason: rejected.decisionReason
              },
              reason: rejected.decisionReason
            },
            transaction
          );
          return {
            request: await toReviewAccessRequestDto(transaction, rejected),
            grant: null
          };
        }

        if (!project) notApprovable();
        const requester = await transaction.findUserById(record.requesterId);
        if (
          !requester ||
          !requester.active ||
          !roleMayRequestModule(requester.role, record.module)
        ) {
          notApprovable();
        }
        const grantResult = await transaction.findOrCreateActiveProjectAccessGrant({
          projectId: record.projectId,
          userId: requester.id,
          module: record.module,
          source: "access_request",
          accessRequestId: record.id,
          grantedById: reviewer.id,
          grantedAt: occurredAt,
          createdAt: occurredAt,
          updatedAt: occurredAt
        });
        if (!grantCanSupplyProjectModuleScope(requester.role, grantResult.record)) {
          notApprovable();
        }

        const approved = await transitionRequest(
          transaction,
          record,
          {
            status: "approved",
            reviewerId: reviewer.id,
            decisionReason: null,
            decisionFingerprint: fingerprint,
            approvedGrantId: grantResult.record.id,
            reviewedAt: occurredAt,
            updatedAt: occurredAt
          }
        );
        if (grantResult.created) {
          await auditService.append(
            {
              actorId: reviewer.id,
              action: "project_access.granted",
              entityType: "project_access_grant",
              entityId: grantResult.record.id,
              occurredAt,
              newValues: {
                projectId: grantResult.record.projectId,
                userId: grantResult.record.userId,
                module: grantResult.record.module,
                source: grantResult.record.source,
                accessRequestId: grantResult.record.accessRequestId,
                active: true,
                version: grantResult.record.version
              }
            },
            transaction
          );
        }
        await auditService.append(
          {
            actorId: reviewer.id,
            action: "access_request.approved",
            entityType: "access_request",
            entityId: approved.id,
            occurredAt,
            oldValues: { status: record.status, version: record.version },
            newValues: {
              status: approved.status,
              version: approved.version,
              approvedGrantId: grantResult.record.id
            }
          },
          transaction
        );
        return {
          request: await toReviewAccessRequestDto(transaction, approved),
          grant: toProjectAccessGrantDto(grantResult.record)
        };
      });
    },

    async revoke(actor, grantId, input) {
      return repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const reviewer = await requireCurrentActor(transaction, actor);
        const grant = await transaction.findProjectAccessGrantById(grantId);
        if (!grant) notFound();
        await requireGrantRevocationScope(transaction, reviewer, grant);
        const normalizedReason = input.reason.trim();

        if (!grant.active) {
          if (
            input.version + 1 === grant.version &&
            grant.revokedById === reviewer.id &&
            grant.revocationReason === normalizedReason
          ) {
            return toProjectAccessGrantDto(grant);
          }
          grantVersionConflict();
        }
        if (input.version !== grant.version) grantVersionConflict();

        const occurredAt = clock().toISOString();
        let revoked: ProjectAccessGrantRecord;
        try {
          revoked = await transaction.revokeProjectAccessGrant(
            grant.id,
            input.version,
            {
              revokedAt: occurredAt,
              revokedById: reviewer.id,
              revocationReason: normalizedReason,
              updatedAt: occurredAt
            }
          );
        } catch (error) {
          if (error instanceof RepositoryConflictError) grantVersionConflict();
          throw error;
        }
        await auditService.append(
          {
            actorId: reviewer.id,
            action: "project_access.revoked",
            entityType: "project_access_grant",
            entityId: revoked.id,
            occurredAt,
            oldValues: { active: true, version: grant.version },
            newValues: { active: false, version: revoked.version },
            reason: normalizedReason
          },
          transaction
        );
        return toProjectAccessGrantDto(revoked);
      });
    }
  };
}

function toOwnAccessRequestDto(record: AccessRequestRecord): OwnAccessRequestDto {
  return {
    id: record.id,
    projectId: record.projectId,
    module: record.module,
    reason: record.reason,
    status: record.status,
    decisionReason: record.decisionReason,
    reviewedAt: record.reviewedAt,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

async function toReviewAccessRequestDto(
  repository: AppRepository,
  record: AccessRequestRecord
): Promise<ReviewAccessRequestDto> {
  const requester = await repository.findUserById(record.requesterId);
  if (!requester) notFound();
  const project = await repository.findProjectById(record.projectId);
  const exactGrant = record.approvedGrantId
    ? await repository.findProjectAccessGrantById(record.approvedGrantId)
    : null;
  return {
    id: record.id,
    projectId: record.projectId,
    module: record.module,
    reason: record.reason,
    status: record.status,
    decisionReason: record.decisionReason,
    reviewedAt: record.reviewedAt,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    requester: {
      id: requester.id,
      name: requester.name,
      email: requester.email,
      role: requester.role,
      active: requester.active
    },
    project: {
      id: record.projectId,
      resolved: project !== null,
      name: project?.name ?? null
    },
    reviewerId: record.reviewerId,
    activeGrant: exactGrant?.active
      ? {
          id: exactGrant.id,
          version: exactGrant.version,
          grantedAt: exactGrant.grantedAt
        }
      : null
  };
}

function toProjectAccessGrantDto(
  record: ProjectAccessGrantRecord
): ProjectAccessGrantDto {
  return {
    id: record.id,
    projectId: record.projectId,
    userId: record.userId,
    module: record.module,
    source: record.source,
    accessRequestId: record.accessRequestId,
    grantedById: record.grantedById,
    active: record.active,
    grantedAt: record.grantedAt,
    revokedAt: record.revokedAt,
    revokedById: record.revokedById,
    revocationReason: record.revocationReason,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

async function requireCurrentActor(repository: AppRepository, actor: PublicUser) {
  const storedActor = await repository.findUserById(actor.id);
  if (!storedActor || !storedActor.active || storedActor.role !== actor.role) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
  return storedActor;
}

function reviewListScope(actor: UserRecord) {
  if (actor.role === "super_admin") return { kind: "global" } as const;
  if (actor.role === "admin") {
    return { kind: "admin_initiator", adminId: actor.id } as const;
  }
  throw new ApiError(
    403,
    "FORBIDDEN",
    "You are not authorized to perform this action."
  );
}

async function requireReviewScope(
  repository: AppRepository,
  reviewer: UserRecord,
  projectId: string
): Promise<void> {
  if (reviewer.role === "super_admin") return;
  if (reviewer.role !== "admin") forbidden();
  const project = await repository.findProjectById(projectId);
  if (!project) forbidden();
  const initiatorGrant = await repository.findActiveProjectAccessGrant(
    reviewer.id,
    projectId,
    "projects"
  );
  if (
    !initiatorGrant ||
    !grantCanSupplyProjectModuleScope(reviewer.role, initiatorGrant)
  ) {
    forbidden();
  }
}

async function requireGrantRevocationScope(
  repository: AppRepository,
  reviewer: UserRecord,
  grant: ProjectAccessGrantRecord
): Promise<void> {
  if (reviewer.role === "super_admin") return;
  if (reviewer.role !== "admin" || grant.source !== "access_request") forbidden();
  await requireReviewScope(repository, reviewer, grant.projectId);
}

async function transitionRequest(
  repository: AppRepository,
  record: AccessRequestRecord,
  change: Parameters<AppRepository["transitionAccessRequest"]>[2]
) {
  try {
    return await repository.transitionAccessRequest(record.id, record.version, change);
  } catch (error) {
    if (error instanceof RepositoryConflictError) versionConflict();
    throw error;
  }
}

function decisionFingerprintFor(
  decision: "approved" | "rejected",
  reason: string | undefined
): string {
  const normalizedReason = decision === "approved" ? "" : (reason ?? "").trim();
  return createHash("sha256")
    .update(`${decision}\n${normalizedReason}`, "utf8")
    .digest("hex");
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

function versionConflict(): never {
  throw new ApiError(
    409,
    "VERSION_CONFLICT",
    "The access request changed elsewhere."
  );
}

const ACCESS_REQUEST_NOT_APPROVABLE_MESSAGE =
  "The access request could not be approved.";

function notApprovable(): never {
  throw new ApiError(
    409,
    "ACCESS_REQUEST_NOT_APPROVABLE",
    ACCESS_REQUEST_NOT_APPROVABLE_MESSAGE
  );
}

function grantVersionConflict(): never {
  throw new ApiError(
    409,
    "VERSION_CONFLICT",
    "The project access grant changed elsewhere."
  );
}

function forbidden(): never {
  throw new ApiError(
    403,
    "FORBIDDEN",
    "You are not authorized to perform this action."
  );
}
