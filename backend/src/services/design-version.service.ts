import { randomUUID } from "node:crypto";

import { ApiError } from "../middleware/errors.js";
import type { ValidatedUpload } from "../middleware/upload.js";
import type {
  AppRepository,
  ApprovalStatus,
  DesignExtractionJobRecord,
  DesignVersionRecord,
  ExtractionStatus,
  PageResult,
  PaginationInput
} from "../repositories/types.js";
import type { FileStorage } from "../storage/storage.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import {
  forbidden,
  requireAccessibleProject,
  requireActor,
  requireTask,
  type Clock
} from "./workflow.js";

export type PublicDesignVersion = Omit<
  DesignVersionRecord,
  "storedFileReference"
> & { extractionStatus: ExtractionStatus | null };
export type ClientDesignVersion = Omit<
  PublicDesignVersion,
  "uploaderId" | "reviewerId"
>;
export type VisibleDesignVersion = PublicDesignVersion | ClientDesignVersion;
export type PublicExtractionJob = Pick<
  DesignExtractionJobRecord,
  | "id"
  | "designVersionId"
  | "status"
  | "attemptCount"
  | "queuedAt"
  | "startedAt"
  | "completedAt"
  | "failureCode"
  | "failureMessage"
>;

export interface ApprovalInput {
  approvalStatus: ApprovalStatus;
  clientVisible?: boolean;
}

export interface DesignVersionDownload {
  stream: NodeJS.ReadableStream;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface DesignVersionService {
  upload(
    actor: PublicUser,
    taskId: string,
    file: ValidatedUpload
  ): Promise<PublicDesignVersion>;
  list(
    actor: PublicUser,
    projectId: string,
    pagination: PaginationInput
  ): Promise<PageResult<VisibleDesignVersion>>;
  listLatestForClient(actor: PublicUser): Promise<ClientDesignVersion[]>;
  approve(
    actor: PublicUser,
    versionId: string,
    input: ApprovalInput
  ): Promise<PublicDesignVersion>;
  download(
    actor: PublicUser,
    versionId: string
  ): Promise<DesignVersionDownload>;
  getExtraction(
    actor: PublicUser,
    versionId: string
  ): Promise<PublicExtractionJob>;
}

export function createDesignVersionService(
  repository: AppRepository,
  audit: AuditService,
  storage: FileStorage,
  clock: Clock
): DesignVersionService {
  return {
    async upload(actor, taskId, file) {
      const user = await requireActor(repository, actor);
      if (user.role !== "designer") forbidden();
      const task = await requireTask(repository, taskId);
      const project = await repository.findProjectById(task.projectId);
      if (!project) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found."
        );
      }
      if (
        task.ownerId !== actor.id ||
        !project.assignedDesignerIds.includes(actor.id)
      ) {
        forbidden();
      }

      let stored;
      try {
        stored = await storage.save({
          data: file.data,
          extension: file.extension
        });
      } catch {
        throw new ApiError(
          503,
          "FILE_STORAGE_ERROR",
          "The file could not be stored. Please try again."
        );
      }

      const uploadedAt = clock().toISOString();
      try {
        const created = await repository.runInTransaction(async (transaction) => {
          const version = await transaction.createNextDesignVersion({
            projectId: task.projectId,
            floorId: task.floorId,
            stageId: task.stageId,
            taskId: task.id,
            originalFilename: file.originalFilename,
            storedFileReference: stored.reference,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            uploaderId: actor.id,
            uploadedAt,
            approvalStatus: "draft",
            reviewerId: null,
            approvedAt: null,
            clientVisible: false
          });
          const extraction = await transaction.enqueueExtractionJob({
            id: randomUUID(),
            designVersionId: version.id,
            status: "queued",
            attemptCount: 0,
            queuedAt: uploadedAt,
            startedAt: null,
            completedAt: null,
            leaseExpiresAt: null,
            failureCode: null,
            failureMessage: null
          });
          await audit.append(
            {
              actorId: actor.id,
              action: "design_version_uploaded",
              entityType: "design_version",
              entityId: version.id,
              occurredAt: uploadedAt,
              newValues: {
                projectId: version.projectId,
                taskId: version.taskId,
                versionNumber: version.versionNumber,
                originalFilename: version.originalFilename,
                mimeType: version.mimeType,
                sizeBytes: version.sizeBytes
              }
            },
            transaction
          );
          return { version, extractionStatus: extraction.status };
        });
        return publicVersion(created.version, created.extractionStatus);
      } catch (error) {
        try {
          await storage.delete(stored.reference);
        } catch {
          throw new ApiError(
            500,
            "FILE_CLEANUP_ERROR",
            "File metadata could not be saved and the stored file could not be cleaned up."
          );
        }
        throw error;
      }
    },

    async list(actor, projectId, pagination) {
      await requireAccessibleProject(repository, actor, projectId);
      const page = await repository.pageDesignVersions(
        actor.role === "client"
          ? {
              projectId,
              approvalStatus: "approved",
              clientVisible: true
            }
          : { projectId },
        pagination
      );
      const items = await Promise.all(
        page.items.map(async (version) => {
          const job = await repository.findExtractionJobByVersionId(version.id);
          return actor.role === "client"
            ? clientVersion(version, job?.status ?? null)
            : publicVersion(version, job?.status ?? null);
        })
      );
      return {
        total: page.total,
        items
      };
    },

    async listLatestForClient(actor) {
      const user = await requireActor(repository, actor);
      if (user.role !== "client") forbidden();
      const projects = await repository.listProjectsForUser(user);
      const versions = await repository.listLatestClientVisibleDesignVersions(projects.map((project) => project.id));
      return Promise.all(
        versions.map(async (version) => {
          const job = await repository.findExtractionJobByVersionId(version.id);
          return clientVersion(version, job?.status ?? null);
        })
      );
    },

    async approve(actor, versionId, input) {
      if (
        actor.role !== "design_manager" &&
        actor.role !== "design_head"
      ) {
        forbidden();
      }
      const occurredAt = clock().toISOString();
      const updated = await repository.runInTransaction(async (transaction) => {
        await requireActor(transaction, actor);
        const current = await transaction.findDesignVersionById(versionId);
        if (!current) {
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found."
          );
        }
        const project = await transaction.findProjectById(current.projectId);
        if (!project) {
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found."
          );
        }
        if (
          actor.role === "design_manager" &&
          project.managerId !== actor.id
        ) {
          forbidden();
        }

        const clientVisible =
          input.clientVisible ??
          (input.approvalStatus === "approved"
            ? current.clientVisible
            : false);
        if (clientVisible && input.approvalStatus !== "approved") {
          throw new ApiError(
            400,
            "INVALID_DESIGN_VERSION_STATE",
            "Only approved design versions can be client visible.",
            {
              clientVisible:
                "Approve the design version before making it client visible."
            }
          );
        }
        const approvedAt =
          input.approvalStatus === "approved"
            ? current.approvalStatus === "approved" && current.approvedAt
              ? current.approvedAt
              : occurredAt
            : null;
        const oldValues = {
          approvalStatus: current.approvalStatus,
          clientVisible: current.clientVisible
        };
        const newValues = {
          approvalStatus: input.approvalStatus,
          clientVisible
        };
        const version = await transaction.updateDesignVersion(versionId, {
          approvalStatus: input.approvalStatus,
          reviewerId: actor.id,
          approvedAt,
          clientVisible
        });
        await audit.append(
          {
            actorId: actor.id,
            action:
              current.approvalStatus === input.approvalStatus
                ? "design_version_visibility_changed"
                : "design_version_approval_changed",
            entityType: "design_version",
            entityId: current.id,
            occurredAt,
            oldValues,
            newValues
          },
          transaction
        );
        return version;
      });
      const job = await repository.findExtractionJobByVersionId(updated.id);
      return publicVersion(updated, job?.status ?? null);
    },

    async download(actor, versionId) {
      const version = await repository.findDesignVersionById(versionId);
      if (!version) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found."
        );
      }
      await requireAccessibleProject(repository, actor, version.projectId);
      if (
        actor.role === "client" &&
        (version.approvalStatus !== "approved" || !version.clientVisible)
      ) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found."
        );
      }
      try {
        return {
          stream: await storage.open(version.storedFileReference),
          filename: version.originalFilename,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes
        };
      } catch {
        throw new ApiError(
          500,
          "FILE_STORAGE_ERROR",
          "The stored file is temporarily unavailable."
        );
      }
    },

    async getExtraction(actor, versionId) {
      const version = await repository.findDesignVersionById(versionId);
      if (!version) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found."
        );
      }
      await requireAccessibleProject(repository, actor, version.projectId);
      const job = await repository.findExtractionJobByVersionId(version.id);
      if (!job) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found."
        );
      }
      return publicExtractionJob(job);
    }
  };
}

function publicVersion(
  version: DesignVersionRecord,
  extractionStatus: ExtractionStatus | null
): PublicDesignVersion {
  const { storedFileReference: _storedFileReference, ...visible } = version;
  return { ...visible, extractionStatus };
}

function clientVersion(version: DesignVersionRecord, extractionStatus: ExtractionStatus | null): ClientDesignVersion {
  const {
    storedFileReference: _storedFileReference,
    uploaderId: _uploaderId,
    reviewerId: _reviewerId,
    ...visible
  } = version;
  return { ...visible, extractionStatus };
}

function publicExtractionJob(job: DesignExtractionJobRecord): PublicExtractionJob {
  const {
    id,
    designVersionId,
    status,
    attemptCount,
    queuedAt,
    startedAt,
    completedAt,
    failureCode,
    failureMessage
  } = job;
  return {
    id,
    designVersionId,
    status,
    attemptCount,
    queuedAt,
    startedAt,
    completedAt,
    failureCode,
    failureMessage
  };
}
