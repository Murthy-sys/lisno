import type { ProjectClientInvitationService } from "./project-client-invitation.service.js";
import type { ProjectClientInvitationSummary } from "../domain/project-client-invitations.js";
import { createProjectDesignWorkflow } from "../domain/design-workflow.js";
import { createHash, randomUUID } from "node:crypto";

import { normalizeEmail } from "../domain/email.js";
import { confirmedCity } from "../domain/procurement-city.js";
import { ApiError } from "../middleware/errors.js";
import type {
  AdminProjectListInput,
  AdminProjectPage,
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
  initiationKey?: string;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location?: string;
  cityName?: string | null;
  propertyType: string;
  source?: string;
  budgetMin?: number;
  budgetMax?: number;
  nextAction: string;
  nextActionAt: string;
  estimatorId?: string;
  salesManagerId?: string;
}

export interface SalesManagerOption {
  id: string;
  name: string;
  email: string;
  title?: string;
}

export interface AdminProjectService {
  list(actor: PublicUser, input: AdminProjectListInput): Promise<AdminProjectPage>;
  get(actor: PublicUser, projectId: string): Promise<AdminProjectSummary>;
  estimators(actor: PublicUser, search: string, pagination: PaginationInput): Promise<PageResult<EstimatorOption>>;
  salesManagers(actor: PublicUser, search: string, pagination: PaginationInput): Promise<PageResult<SalesManagerOption>>;
  initiate(actor: PublicUser, input: InitiateAdminProjectInput): Promise<AdminProjectSummary & { clientInvitation?: ProjectClientInvitationSummary }>;
}

export function createAdminProjectService(
  repository: AppRepository,
  audit: AuditService,
  clock: Clock,
  clientInvitations?: ProjectClientInvitationService
): AdminProjectService {
  const readActor = async (actor: PublicUser) => {
    const stored = await requireActor(repository, actor);
    if (stored.role !== "admin" && stored.role !== "super_admin") forbidden();
    return stored;
  };

  return {
    async list(actor, input) {
      return repository.pageAdminProjects(await readActor(actor), input);
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

    async salesManagers(actor, search, pagination) {
      const stored = await requireActor(repository, actor);
      if (!["admin", "super_admin", "estimator_sales"].includes(stored.role)) forbidden();
      const page = await repository.pageUsers(
        { active: true, visibleRoles: ["admin"], search }, pagination
      );
      return {
        total: page.total,
        items: page.items.map(({ id, name, email, title }) => ({
          id, name, email, ...(title ? { title } : {})
        }))
      };
    },

    async initiate(actor, input) {
      const { initiationKey, ...projectInput } = input;
      if (initiationKey !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(initiationKey)) validationError("initiationKey", "Use a valid initiation key.");
      const receiptId = initiationKey ? createHash("sha256").update(`${actor.id}:${initiationKey}`).digest("hex") : null;
      const fingerprint = createHash("sha256").update(JSON.stringify(Object.keys(projectInput).sort().map(key => [key, projectInput[key as keyof typeof projectInput]]))).digest("hex");
      const summary = await repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const initiator = await requireActor(transaction, actor);
        if (!["admin", "super_admin", "estimator_sales"].includes(initiator.role)) forbidden();
        if (receiptId) {
          const receipt = await transaction.findProjectInitiationReceipt(receiptId);
          if (receipt) {
            if (receipt.actorId !== initiator.id || receipt.fingerprint !== fingerprint) throw new ApiError(409, "INITIATION_KEY_REUSED", "This initiation key belongs to a different project request.");
            const originalProject = await transaction.findProjectById(receipt.projectId);
            const managerId = initiator.role === "estimator_sales" ? input.salesManagerId : initiator.id;
            const manager = managerId ? await transaction.findUserById(managerId) : null;
            if (!originalProject || !manager || !manager.active) notFound();
            const existing = await transaction.findAdminProject(manager!, receipt.projectId);
            if (!existing) notFound();
            return existing!;
          }
        }
        const salesInitiated = initiator.role === "estimator_sales";
        if (salesInitiated && input.estimatorId !== undefined && input.estimatorId !== initiator.id) {
          validationError("estimatorId", "You can initiate a project only for yourself.");
        }
        if (!salesInitiated && input.salesManagerId !== undefined) {
          validationError("salesManagerId", "You are the Sales Manager for projects you initiate.");
        }
        const salesManager = salesInitiated && input.salesManagerId
          ? await transaction.findUserById(input.salesManagerId)
          : salesInitiated ? null : initiator;
        if (!salesManager || !salesManager.active ||
          (salesInitiated && salesManager.role !== "admin")) {
          validationError("salesManagerId", "Select an active Sales Manager.");
        }
        const estimator = salesInitiated ? initiator : input.estimatorId
          ? await transaction.findUserById(input.estimatorId) : null;
        if (!estimator || !estimator.active || estimator.role !== "estimator_sales") {
          validationError("estimatorId", "Select an active Sales user.");
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
        const city = confirmedCity(input.cityName);
        const timestamp = occurredAt.toISOString();
        const plannedEndAt = new Date(occurredAt);
        plannedEndAt.setUTCDate(plannedEndAt.getUTCDate() + 90);
        const projectId = `project-${randomUUID()}`;
        const project: ProjectRecord = {
          id: projectId,
          designWorkflowStages: createProjectDesignWorkflow(projectId),
          name: input.projectName,
          clientId: null,
          estimationWorkflowVersion: 2,
          estimateRequirementsVersion: 0,
          estimationFenceEpoch: 0,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          clientEmailNormalized: emailNormalized,
          clientMobile: input.clientMobile,
          clientAddress: input.location ?? "",
          initiatingDesignerId: null,
          assignedEstimatorId: estimator.id,
          assignedDesignerIds: [],
          managerId: null,
          programManagerId: null,
          status: "planning",
          location: input.location ?? "",
          cityName: city?.name ?? null,
          cityKey: city?.key ?? null,
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
          userId: salesManager.id,
          module: "projects",
          source: "admin_initiator",
          accessRequestId: null,
          grantedById: initiator.id,
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
          location: input.location ?? "",
          cityName: city?.name ?? null,
          cityKey: city?.key ?? null,
          propertyType: input.propertyType,
          budgetMin: input.budgetMin ?? null,
          budgetMax: input.budgetMax ?? null,
          source: input.source ?? "admin_project",
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
          actorId: initiator.id,
          action: "project_created",
          entityType: "project",
          entityId: createdProject.id,
          occurredAt: timestamp,
          newValues: { status: "planning", assignedEstimatorId: estimator.id, ...(city ? { cityName: city.name, cityKey: city.key } : {}) }
        }, transaction);
        await audit.append({
          actorId: initiator.id,
          action: "project_access.granted",
          entityType: "project_access_grant",
          entityId: grant.id,
          occurredAt: timestamp,
          newValues: {
            projectId: createdProject.id,
            userId: salesManager.id,
            module: "projects",
            source: "admin_initiator"
          }
        }, transaction);
        await audit.append({
          actorId: initiator.id,
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

        const summary = await transaction.findAdminProject(salesManager, createdProject.id);
        if (!summary) {
          throw new Error("The created Admin project could not be read in its transaction.");
        }
        if (receiptId) await transaction.createProjectInitiationReceipt({ id: receiptId, actorId: initiator.id, fingerprint, projectId: createdProject.id });
        return summary;
      });
      if (!clientInvitations) return summary;
      try {
        return { ...summary, clientInvitation: await clientInvitations.send(actor, summary.id) };
      } catch {
        // Project creation is durable independently of invitation delivery.
        try { return { ...summary, clientInvitation: await clientInvitations.get(actor, summary.id) }; }
        catch { return summary; }
      }
    }
  };
}

function validationError(field: string, message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", { [field]: message });
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}
