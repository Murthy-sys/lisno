import { randomUUID } from "node:crypto";

import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import type {
  AdminProjectSummary,
  AppRepository,
  EstimatorOption,
  PageResult,
  PaginationInput,
  ProjectRecord
} from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { forbidden, requireActor, type Clock } from "./workflow.js";

export interface InitiateAdminProjectInput {
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location: string;
  propertyType: string;
  budgetMin: number;
  budgetMax: number;
  nextAction: string;
  nextActionAt: string;
  estimatorId: string;
}

export interface AdminProjectService {
  list(actor: PublicUser, pagination: PaginationInput): Promise<PageResult<AdminProjectSummary>>;
  get(actor: PublicUser, projectId: string): Promise<AdminProjectSummary>;
  estimators(actor: PublicUser, search: string, pagination: PaginationInput): Promise<PageResult<EstimatorOption>>;
  initiate(actor: PublicUser, input: InitiateAdminProjectInput): Promise<AdminProjectSummary>;
}

export function createAdminProjectService(
  repository: AppRepository,
  audit: AuditService,
  clock: Clock
): AdminProjectService {
  const readActor = async (actor: PublicUser) => {
    const stored = await requireActor(repository, actor);
    if (stored.role !== "admin" && stored.role !== "super_admin") forbidden();
    return stored;
  };

  return {
    async list(actor, pagination) {
      return repository.pageAdminProjects(await readActor(actor), pagination);
    },

    async get(actor, projectId) {
      const summary = await repository.findAdminProject(await readActor(actor), projectId);
      if (!summary) notFound();
      return summary;
    },

    async estimators(actor, search, pagination) {
      await readActor(actor);
      return repository.pageActiveEstimatorOptions(search, pagination);
    },

    async initiate(actor, input) {
      return repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const admin = await requireActor(transaction, actor);
        if (admin.role !== "admin") forbidden();
        const estimator = await transaction.findUserById(input.estimatorId);
        if (!estimator || !estimator.active || estimator.role !== "estimator_sales") {
          throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {
            estimatorId: "Select an active Estimator/Sales user."
          });
        }

        const emailNormalized = normalizeEmail(input.clientEmail);
        await transaction.coordinateClientEmail(emailNormalized);
        const existingClient = await transaction.findUserByEmail(emailNormalized);
        if (existingClient && existingClient.role !== "client") {
          throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {
            clientEmail: "This email belongs to an internal account."
          });
        }

        const occurredAt = clock();
        const timestamp = occurredAt.toISOString();
        const plannedEndAt = new Date(occurredAt);
        plannedEndAt.setUTCDate(plannedEndAt.getUTCDate() + 90);
        const project: ProjectRecord = {
          id: `project-${randomUUID()}`,
          name: input.projectName,
          clientId: existingClient?.id ?? null,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          clientEmailNormalized: emailNormalized,
          clientMobile: input.clientMobile,
          clientAddress: input.location,
          initiatingDesignerId: null,
          assignedEstimatorId: estimator.id,
          assignedDesignerIds: [],
          managerId: null,
          status: "planning",
          location: input.location,
          plannedStartAt: timestamp,
          plannedEndAt: plannedEndAt.toISOString(),
          actualStartAt: null,
          actualEndAt: null,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        const createdProject = await transaction.createProject(project);
        const grant = await transaction.createProjectAccessGrant({
          projectId: createdProject.id,
          userId: admin.id,
          module: "projects",
          source: "admin_initiator",
          accessRequestId: null,
          grantedById: admin.id,
          grantedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        const lead = await transaction.createLead({
          id: `lead-${randomUUID()}`,
          projectId: createdProject.id,
          ownerId: estimator.id,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          clientMobile: input.clientMobile,
          projectName: input.projectName,
          location: input.location,
          propertyType: input.propertyType,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          source: "admin_project",
          stage: "new_lead",
          nextAction: input.nextAction,
          nextActionAt: input.nextActionAt,
          builder: null,
          areaSqft: null,
          targetHandoverAt: null,
          notes: null,
          latestActivityAt: null,
          createdAt: timestamp,
          updatedAt: timestamp
        });

        await audit.append({
          actorId: admin.id,
          action: "project_created",
          entityType: "project",
          entityId: createdProject.id,
          occurredAt: timestamp,
          newValues: { status: "planning", assignedEstimatorId: estimator.id }
        }, transaction);
        await audit.append({
          actorId: admin.id,
          action: "project_access.granted",
          entityType: "project_access_grant",
          entityId: grant.id,
          occurredAt: timestamp,
          newValues: {
            projectId: createdProject.id,
            userId: admin.id,
            module: "projects",
            source: "admin_initiator"
          }
        }, transaction);
        await audit.append({
          actorId: admin.id,
          action: "lead_created",
          entityType: "lead",
          entityId: lead.id,
          occurredAt: timestamp,
          newValues: {
            stage: "new_lead",
            projectId: createdProject.id,
            ownerId: estimator.id
          }
        }, transaction);

        const summary = await transaction.findAdminProject(admin, createdProject.id);
        if (!summary) {
          throw new Error("The created Admin project could not be read in its transaction.");
        }
        return summary;
      });
    }
  };
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}
