import { RepositoryConflictError } from "../repositories/types.js";
import { instructionsForStage, type DesignStageInstructions } from "../domain/design-workflow-instructions.js";
import { emptyDesignWorkflowState, workflowStageStartAt, workflowIsPaused } from "../domain/design-workflow-state.js";
import { projectInitialPayment, projectOperationalStage, requireDesignWorkflowScope } from "./design-workflow-state.service.js";
import { createProjectDesignWorkflow } from "../domain/design-workflow.js";
import { randomUUID } from "node:crypto";

import type { TaskStatus, TaskRisk } from "../contracts/domain.js";

import { normalizeEmail } from "../domain/email.js";
import { AuthorizationConfigurationError } from "../domain/authorization.js";
import { currentHumanOperation } from "../domain/operation-context.js";
import { ApiError } from "../middleware/errors.js";
import { calculateTaskRisk } from "../domain/risk.js";
import type {
  AppRepository,
  DesignStageRecord,
  DesignStageType,
  FloorRecord,
  PageResult,
  PaginationInput,
  ProjectHierarchy,
  ProjectRecord,
  TaskRecord
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";
import {
  forbidden,
  requireProjectOperationAccess,
  requireActor,
  requireUser,
  type Clock
} from "./workflow.js";

export interface CreateProjectInput {
  name: string;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  clientAddress: string;
  assignedDesignerIds: string[];
  managerId: string;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface CreateFloorInput {
  name: string;
  number: string;
  order: number;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface CreateStageInput {
  name: string;
  type: DesignStageType;
  order: number;
  dependencyStageIds?: string[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  order: number;
  ownerId: string;
  plannedStartAt: string;
  originalDeadlineAt: string;
  plannedEffort?: number | null;
  progress?: number;
  dependencyTaskIds?: string[];
}

export type DerivedProject = ProjectRecord & { progress: number };

export type ClientProject = Pick<
  DerivedProject,
  | "id"
  | "name"
  | "status"
  | "location"
  | "plannedStartAt"
  | "plannedEndAt"
  | "actualStartAt"
  | "actualEndAt"
  | "createdAt"
  | "updatedAt"
  | "progress"
>;

export type ClientProjectSummary = ClientProject & { floorCount: number };

export interface DesignWorkflowTaskDto {
  id: string; title: string; description: string; status: TaskStatus;
  progress: number; order: number; ownerName: string | null;
  floorName?: string;
  plannedStartAt: string; originalDeadlineAt: string; currentDeadlineAt: string;
  completedAt: string | null; dependencyTaskIds: string[];
  blockedByTaskIds: string[]; risk: TaskRisk;
}

export interface DesignWorkflowStageDto {
  instructions?: DesignStageInstructions;
  operational?: ReturnType<typeof projectOperationalStage>;
  id: string; name: string; type: DesignStageType; order: number;
  dependencyStageIds: string[];
  status: TaskStatus | null; progress: number | null;
  deadlineAt: string | null; deadlineTaskId: string | null;
  tasks: DesignWorkflowTaskDto[];
  sourceStages?: Array<{ id: string; name: string; floorName: string }>;
}

export interface DesignWorkflowDto {
  notices?: Array<{ id: string; stageId: string; message: string }>;
  initialPayment?: Awaited<ReturnType<typeof projectInitialPayment>>;
  measurementDesigners?: Array<{ id: string; name: string }>;
  furnitureRooms?: Array<{ id: string; name: string }>;
  furnitureScopeIssue?: string;
  projectId: string;
  projectName: string;
  serverNow: string;
  projectStages?: DesignWorkflowStageDto[];
  floors: Array<{
    id: string; name: string; number: string; order: number;
    stages: DesignWorkflowStageDto[];
  }>;
}

export interface ProjectService {
  designWorkflow(actor: PublicUser, projectId: string): Promise<DesignWorkflowDto>;
  list(
    actor: PublicUser,
    pagination: PaginationInput
  ): Promise<PageResult<DerivedProject | ClientProject>>;
  clientSummaries(
    actor: PublicUser,
    pagination: PaginationInput
  ): Promise<PageResult<ClientProjectSummary>>;
  create(actor: PublicUser, input: CreateProjectInput): Promise<ProjectRecord>;
  get(
    actor: PublicUser,
    projectId: string
  ): Promise<RiskDecoratedProjectHierarchy | ClientProjectView>;
  createFloor(
    actor: PublicUser,
    projectId: string,
    input: CreateFloorInput
  ): Promise<FloorRecord>;
  createStage(
    actor: PublicUser,
    floorId: string,
    input: CreateStageInput
  ): Promise<DesignStageRecord>;
  createTask(
    actor: PublicUser,
    stageId: string,
    input: CreateTaskInput
  ): Promise<TaskRecord>;
}

export type RiskDecoratedProjectHierarchy = Omit<ProjectHierarchy, "floors"> & {
  progress: number;
  floors: Array<
    FloorRecord & {
      stages: Array<
        DesignStageRecord & {
          tasks: Array<
            TaskRecord & { risk: ReturnType<typeof calculateTaskRisk> }
          >;
        }
      >;
    }
  >;
};

interface ClientProjectView extends ClientProject {
  floors: Array<
    Pick<
      FloorRecord,
      | "id"
      | "projectId"
      | "name"
      | "number"
      | "order"
      | "progress"
      | "plannedStartAt"
      | "plannedEndAt"
      | "actualStartAt"
      | "actualEndAt"
    >
  >;
}

export function createProjectService(
  repository: AppRepository,
  audit: AuditService,
  clock: Clock
): ProjectService {
  return {
    async designWorkflow(actor, projectId) {
      const { capabilities } = await requireDesignWorkflowScope(repository, actor, projectId).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
        throw error;
      });
      const hierarchy = await repository.getProjectHierarchy(projectId);
      if (!hierarchy) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
      const now = clock();
      const allTasks = hierarchy.floors.flatMap((floor) => floor.stages.flatMap((stage) => stage.tasks));
      const taskById = new Map(allTasks.map((task) => [task.id, task]));
      const owners = await Promise.all([...new Set(allTasks.map((task) => task.ownerId))].map(async (id) =>
        [id, (await repository.findUserById(id))?.name ?? null] as const
      ));
      const ownerById = new Map(owners);
      const ordered = <T extends { order: number; id: string }>(items: T[]) =>
        [...items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      const stageView = (
        stage: Pick<DesignStageRecord, "id" | "name" | "type" | "order" | "dependencyStageIds">,
        stageTasks: Array<TaskRecord & { floorName?: string }>
      ): DesignWorkflowStageDto => {
        const tasks = ordered(stageTasks);
        const unfinished = tasks.filter((task) => task.status !== "completed");
        const deadline = [...unfinished].sort((a, b) =>
          Date.parse(a.currentDeadlineAt) - Date.parse(b.currentDeadlineAt) || a.id.localeCompare(b.id)
        )[0];
        const status: TaskStatus | null = tasks.length === 0 ? null
          : unfinished.length === 0 ? "completed"
          : unfinished.some((task) => task.status === "in_progress") ? "in_progress"
          : unfinished.some((task) => task.status === "in_review") ? "in_review"
          : unfinished.some((task) => task.status === "blocked") ? "blocked"
          : unfinished.length < tasks.length ? "in_progress" : "not_started";
        return {
          id: stage.id, name: stage.name, type: stage.type, order: stage.order,
          dependencyStageIds: [...stage.dependencyStageIds], status,
          progress: tasks.length ? taskProgress(tasks) : null,
          deadlineAt: deadline?.currentDeadlineAt ?? null,
          deadlineTaskId: deadline?.id ?? null,
          tasks: tasks.map((task) => ({
            id: task.id, title: task.title, description: actor.role === "client" ? "" : task.description,
            status: task.status, progress: task.progress, order: task.order,
            ownerName: ownerById.get(task.ownerId) ?? null,
            ...(task.floorName === undefined ? {} : { floorName: task.floorName }),
            plannedStartAt: task.plannedStartAt, originalDeadlineAt: task.originalDeadlineAt,
            currentDeadlineAt: task.currentDeadlineAt, completedAt: task.completedAt,
            dependencyTaskIds: [...task.dependencyTaskIds],
            blockedByTaskIds: task.dependencyTaskIds.filter((id) => taskById.get(id)?.status !== "completed"),
            risk: calculateTaskRisk(task, now)
          }))
        };
      };
      const savedStages = hierarchy.designWorkflowStages;
      const operationalState = savedStages ? await repository.findDesignWorkflowState(projectId) ?? emptyDesignWorkflowState(projectId) : null;
      const initialPayment = operationalState ? await projectInitialPayment(repository, projectId, operationalState, capabilities.finance) : undefined;
      const measurementDesigners = savedStages && capabilities.designer ? (await Promise.all(hierarchy.assignedDesignerIds.map((id) => repository.findUserById(id)))).flatMap((user) => user?.active && user.role === "designer" ? [{ id: user.id, name: user.name }] : []) : undefined;
      const measurementAssigneeId = operationalState?.stages.site_measurement?.assignedDesignerId;
      const measurementAssigneeName = measurementAssigneeId ? (await repository.findUserById(measurementAssigneeId))?.name : undefined;
      let furnitureRooms: Array<{ id: string; name: string }> | undefined;
      let furnitureScopeIssue: string | undefined;
      if (savedStages && (capabilities.designer || capabilities.client)) {
        try { furnitureRooms = await repository.findDesignWorkflowRoomOptions(projectId); }
        catch (error) {
          if (!(error instanceof RepositoryConflictError)) throw error;
          furnitureRooms = [];
          furnitureScopeIssue = "The approved estimate room source is ambiguous or unavailable. Reconcile the project approved source before confirming furniture requirements.";
        }
      }
      const notices: Array<{ id: string; stageId: string; message: string }> = [];
      if (operationalState?.initialPaymentAt && capabilities.client && savedStages) {
        const addNotice = (type: DesignStageType, key: string, message: string) => {
          const stage = savedStages.find((stage) => stage.type === type);
          if (stage) notices.push({ id: `${projectId}:${key}`, stageId: stage.id, message });
        };
        if (!operationalState.stages.internal_kickoff?.completedAt) addNotice("internal_kickoff", "internal-alignment", "Thanks for confirming the order. We are aligning the internal processes, roughly a three-day process, and your Designer will request a meeting.");
        if (workflowStageStartAt(operationalState, "client_kickoff", now.getTime()) && !operationalState.stages.client_kickoff?.completedAt) addNotice("client_kickoff", "kickoff-pending", "Internal Kick off is complete. Your Client Kick off task is ready with a four-day countdown. Complete it once the meeting is done.");
        if (workflowStageStartAt(operationalState, "key_collection", now.getTime()) && !operationalState.stages.key_collection?.completedAt) addNotice("key_collection", "key-handover", operationalState.stages.key_collection?.handedOverAt ? "Key handover recorded; awaiting Designer receipt." : "Confirm that the keys have been handed over. Your Designer will separately confirm receipt.");
        if (operationalState.stages.client_kickoff?.completedAt) addNotice("client_kickoff", "kickoff-complete", "Congratulations, we have officially kickstarted your project.");
        if (workflowIsPaused(operationalState)) addNotice("site_measurement", "site-access-blocked", "Site access is unavailable. Measurement and all workflow clocks are paused; technical drawing preparation cannot proceed until access is restored.");
        else if (operationalState.stages.site_measurement?.completedAt) addNotice("site_measurement", "measurement-complete", "Measurements are complete. Your project is on the right path.");
      }
      const snapshotById = new Map(savedStages?.map((stage) => [stage.id, stage]));
      const linkedStages = ordered(hierarchy.floors).flatMap((floor) =>
        ordered(floor.stages).filter((stage) => {
          const configured = stage.workflowStageId ? snapshotById.get(stage.workflowStageId) : undefined;
          return configured !== undefined && configured.type === stage.type &&
            stage.projectId === hierarchy.id && stage.floorId === floor.id && floor.projectId === hierarchy.id;
        }).map((stage) => ({ stage, floor }))
      );
      const linkedStageIds = new Set(linkedStages.map(({ stage }) => stage.id));
      return {
        projectId: hierarchy.id,
        projectName: hierarchy.name,
        serverNow: now.toISOString(),
        ...(savedStages === undefined ? {} : {
          ...(capabilities.client ? { notices } : {}),
          initialPayment: initialPayment!,
          ...(measurementDesigners ? { measurementDesigners } : {}),
          ...(furnitureRooms ? { furnitureRooms } : {}),
          ...(furnitureScopeIssue ? { furnitureScopeIssue } : {}),
          projectStages: ordered(savedStages).map((stage) => {
            const sources = linkedStages.filter(({ stage: actual }) => actual.workflowStageId === stage.id);
            const view = stageView({ ...stage, dependencyStageIds: [] }, sources.flatMap(({ stage: actual, floor }) => actual.tasks.map((task) => ({ ...task, floorName: floor.name }))));
            const operational = projectOperationalStage(stage, operationalState!, capabilities, now, actor.id, measurementAssigneeName, { paymentStatus: initialPayment!.status, projectId: hierarchy.id, internalKickoffStageId: savedStages.find((configured) => configured.type === "internal_kickoff")?.id });
            const instructions = instructionsForStage(stage.type);
            // Space-planning progress comes from floor tasks, independently of its help content.
            const taskDerivedProgress = stage.type === "space_planning_tentative_look_feel" || !instructions;
            if (stage.type === "existing_furniture_dimensions" && furnitureScopeIssue) {
              operational.blockingReasons.push(furnitureScopeIssue);
              operational.availableActions = [];
              operational.status = "blocked";
            }
            if (taskDerivedProgress) {
              operational.status = operational.blockingReasons.length ? "blocked" : (view.status === "completed" ? "completed" : view.status === "blocked" ? "blocked" : view.status === "in_progress" || view.status === "in_review" ? "in_progress" : "not_started");
              operational.timing.state = operational.status === "completed" ? "completed" : operational.blockingReasons.length ? "waiting" : "not_applicable";
              operational.timing.startsAt = null;
              operational.timing.endsAt = view.status === "completed" ? view.tasks.map((task) => task.completedAt).filter((at): at is string => at !== null).sort().at(-1) ?? null : null;
            }
            return {
              ...view,
              status: operational.status,
              progress: taskDerivedProgress ? view.progress : operational.status === "completed" ? 100 : operational.status === "not_started" ? 0 : null,
              ...(instructions ? { instructions } : {}), operational,
              sourceStages: sources.map(({ stage: actual, floor }) => ({ id: actual.id, name: actual.name, floorName: floor.name }))
            };
          })
        }),
        floors: ordered(hierarchy.floors).flatMap((floor) => {
          const stages = ordered(floor.stages).filter((stage) => !linkedStageIds.has(stage.id));
          if (floor.stages.length > 0 && stages.length === 0) return [];
          return [{
            id: floor.id, name: floor.name, number: floor.number, order: floor.order,
            stages: stages.map((stage) => stageView(stage, stage.tasks))
          }];
        })
      };
    },

    async list(actor, pagination) {
      const user = await requireActor(repository, actor);
      const page = await repository.pageProjectsForUserInModule(
        user,
        currentProjectModule(),
        pagination
      );
      const tasks = await repository.listTasksForProjectIds(
        page.items.map((project) => project.id)
      );
      const items = page.items.map((project) =>
        deriveProjectRead(project, tasks.filter((task) => task.projectId === project.id))
      );
      return {
        ...page,
        items:
          actor.role === "client"
            ? items.map(toClientProject)
            : items
      };
    },

    async clientSummaries(actor, pagination) {
      const user = await requireActor(repository, actor);
      if (user.role !== "client" && user.role !== "super_admin") forbidden();
      const page = await repository.pageProjectsForUserInModule(
        user,
        currentProjectModule(),
        pagination
      );
      const projectIds = page.items.map((project) => project.id);
      const [tasks, floors] = await Promise.all([
        repository.listTasksForProjectIds(projectIds),
        repository.listFloorsForProjectIds(projectIds)
      ]);
      return {
        ...page,
        items: page.items.map((project) => ({
          ...toClientProject(
            deriveProjectRead(
              project,
              tasks.filter((task) => task.projectId === project.id)
            )
          ),
          floorCount: floors.filter((floor) => floor.projectId === project.id).length
        }))
      };
    },

    async create(actor, input) {
      if (actor.role !== "designer") forbidden();
      const designer = await requireActor(repository, actor);
      const manager = await repository.findUserById(input.managerId);
      if (!manager || !manager.active || manager.role !== "design_manager") {
        throw new ApiError(
          400,
          "INVALID_PROJECT",
          "Project manager is invalid.",
          { managerId: "Select an active design manager." }
        );
      }
      const assignedDesignerIds = [...new Set([...input.assignedDesignerIds, designer.id])];
      const assigned = await Promise.all(assignedDesignerIds.map((id) => repository.findUserById(id)));
      if (
        assigned.some(
          (user) =>
            !user ||
            !user.active ||
            user.role !== "designer"
        )
      ) {
        throw new ApiError(
          400,
          "INVALID_PROJECT",
          "Assigned designers are invalid.",
          {
            assignedDesignerIds:
              "Assigned designers must be active designer accounts."
          }
        );
      }
      if (new Date(input.plannedEndAt) < new Date(input.plannedStartAt)) {
        throw new ApiError(
          400,
          "INVALID_PROJECT",
          "Project end must follow its start.",
          { plannedEndAt: "Project end must follow its start." }
        );
      }
      const timestamp = clock().toISOString();
      const emailNormalized = normalizeEmail(input.clientEmail);
      return repository.runInTransaction(async (transaction) => {
        await transaction.coordinateClientEmail(emailNormalized);
        const existingClient = await transaction.findUserByEmail(emailNormalized);
        if (existingClient && existingClient.role !== "client") {
          throw new ApiError(
            400,
            "INVALID_PROJECT",
            "Client email is unavailable.",
            { clientEmail: "This email belongs to an internal account." }
          );
        }
        const projectId = `project-${randomUUID()}`;
        const projectInput: ProjectRecord = {
          id: projectId,
          designWorkflowStages: createProjectDesignWorkflow(projectId),
          name: input.name,
          clientId: existingClient?.id ?? null,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          clientEmailNormalized: emailNormalized,
          clientMobile: input.clientMobile,
          clientAddress: input.clientAddress,
          initiatingDesignerId: actor.id,
          assignedEstimatorId: null,
          assignedDesignerIds,
          managerId: manager.id,
          status: "planning",
          location: input.location,
          plannedStartAt: input.plannedStartAt,
          plannedEndAt: input.plannedEndAt,
          actualStartAt: null,
          actualEndAt: null,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        const project = await transaction.createProject(projectInput);
        await audit.append(
          {
            actorId: actor.id,
            action: "project_created",
            entityType: "project",
            entityId: project.id,
            occurredAt: timestamp,
            newValues: { name: project.name, status: project.status }
          },
          transaction
        );
        return project;
      });
    },

    async get(actor, projectId) {
      await requireProjectOperationAccess(repository, actor, projectId);
      const hierarchy = await repository.getProjectHierarchy(projectId);
      if (!hierarchy) {
        throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
      }
      const derivedHierarchy = deriveHierarchy(hierarchy);
      if (actor.role !== "client") {
        const now = clock();
        return {
          ...derivedHierarchy,
          floors: derivedHierarchy.floors.map((floor) => ({
            ...floor,
            stages: floor.stages.map((stage) => ({
              ...stage,
              tasks: stage.tasks.map((task) => ({
                ...task,
                risk: calculateTaskRisk(task, now)
              }))
            }))
          }))
        };
      }
      return {
        ...toClientProject(derivedHierarchy),
        floors: derivedHierarchy.floors.map((floor) => ({
          id: floor.id,
          projectId: floor.projectId,
          name: floor.name,
          number: floor.number,
          order: floor.order,
          progress: floor.progress,
          plannedStartAt: floor.plannedStartAt,
          plannedEndAt: floor.plannedEndAt,
          actualStartAt: floor.actualStartAt,
          actualEndAt: floor.actualEndAt
        }))
      };
    },

    async createFloor(actor, projectId, input) {
      if (actor.role !== "designer") forbidden();
      const project = await requireProjectOperationAccess(repository, actor, projectId);
      if (new Date(input.plannedEndAt) < new Date(input.plannedStartAt)) {
        throw new ApiError(
          400,
          "INVALID_FLOOR",
          "Floor end must follow its start.",
          { plannedEndAt: "Floor end must follow its start." }
        );
      }
      const timestamp = clock().toISOString();
      const floorInput: FloorRecord = {
        id: `floor-${randomUUID()}`,
        projectId: project.id,
        name: input.name,
        number: input.number,
        order: input.order,
        progress: 0,
        plannedStartAt: input.plannedStartAt,
        plannedEndAt: input.plannedEndAt,
        actualStartAt: null,
        actualEndAt: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      return repository.runInTransaction(async (transaction) => {
        const floor = await transaction.createFloor(floorInput);
        for (const configured of project.designWorkflowStages ?? []) {
          const stage = await transaction.createDesignStage({
            id: `stage-${randomUUID()}`,
            projectId: project.id,
            floorId: floor.id,
            workflowStageId: configured.id,
            name: configured.name,
            type: configured.type,
            order: configured.order,
            dependencyStageIds: [],
            createdAt: timestamp,
            updatedAt: timestamp
          });
          await audit.append({
            actorId: actor.id,
            action: "stage_created",
            entityType: "design_stage",
            entityId: stage.id,
            occurredAt: timestamp,
            newValues: { projectId: project.id, floorId: floor.id, name: stage.name, workflowStageId: configured.id }
          }, transaction);
        }
        await audit.append(
          {
            actorId: actor.id,
            action: "floor_created",
            entityType: "floor",
            entityId: floor.id,
            occurredAt: timestamp,
            newValues: { projectId: project.id, name: floor.name }
          },
          transaction
        );
        return floor;
      });
    },

    async createStage(actor, floorId, input) {
      if (actor.role !== "designer") forbidden();
      const { project, hierarchy, floor } = await findAccessibleFloor(
        repository,
        actor,
        floorId
      );
      const dependencyIds = [...new Set(input.dependencyStageIds ?? [])];
      const stageIds = new Set(hierarchy.floors.flatMap((item) => item.stages.map(({ id }) => id)));
      if (dependencyIds.some((id) => !stageIds.has(id))) {
        throw new ApiError(
          400,
          "INVALID_DEPENDENCY",
          "Stage dependencies must belong to the same project."
        );
      }
      const timestamp = clock().toISOString();
      const stageInput: DesignStageRecord = {
        id: `stage-${randomUUID()}`,
        projectId: project.id,
        floorId: floor.id,
        name: input.name,
        type: input.type,
        order: input.order,
        dependencyStageIds: dependencyIds,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      return repository.runInTransaction(async (transaction) => {
        const stage = await transaction.createDesignStage(stageInput);
        await audit.append(
          {
            actorId: actor.id,
            action: "stage_created",
            entityType: "design_stage",
            entityId: stage.id,
            occurredAt: timestamp,
            newValues: {
              projectId: project.id,
              floorId: floor.id,
              name: stage.name
            }
          },
          transaction
        );
        return stage;
      });
    },

    async createTask(actor, stageId, input) {
      if (actor.role !== "designer") forbidden();
      const { project, floor, stage } = await findAccessibleStage(
        repository,
        actor,
        stageId
      );
      const owner = await requireUser(repository, input.ownerId);
      if (
        owner.role !== "designer" ||
        !project.assignedDesignerIds.includes(owner.id)
      ) {
        throw new ApiError(
          400,
          "INVALID_TASK",
          "Task owner must be an assigned project designer."
        );
      }
      if (new Date(input.originalDeadlineAt) < new Date(input.plannedStartAt)) {
        throw new ApiError(
          400,
          "INVALID_TASK",
          "Task deadline must follow its start.",
          { originalDeadlineAt: "Task deadline must follow its start." }
        );
      }
      if ((input.progress ?? 0) !== 0) {
        throw new ApiError(
          400,
          "INVALID_TASK",
          "New tasks must start with zero progress.",
          { progress: "New tasks must start with zero progress." }
        );
      }
      const dependencyIds = [...new Set(input.dependencyTaskIds ?? [])];
      const dependencies = await Promise.all(
        dependencyIds.map((id) => repository.findTaskById(id))
      );
      if (
        dependencies.some(
          (dependency) => !dependency || dependency.projectId !== project.id
        )
      ) {
        throw new ApiError(
          400,
          "INVALID_DEPENDENCY",
          "Task dependencies must belong to the same project."
        );
      }
      const timestamp = clock().toISOString();
      const taskInput: TaskRecord = {
        id: `task-${randomUUID()}`,
        projectId: project.id,
        floorId: floor.id,
        stageId: stage.id,
        title: input.title,
        description: input.description ?? "",
        order: input.order,
        ownerId: owner.id,
        plannedStartAt: input.plannedStartAt,
        originalDeadlineAt: input.originalDeadlineAt,
        currentDeadlineAt: input.originalDeadlineAt,
        plannedEffort: input.plannedEffort ?? null,
        progress: 0,
        dependencyTaskIds: dependencyIds,
        latestUpdateAt: null,
        status: "not_started",
        completedAt: null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      return repository.runInTransaction(async (transaction) => {
        const task = await transaction.createTask(taskInput);
        await audit.append(
          {
            actorId: actor.id,
            action: "task_created",
            entityType: "task",
            entityId: task.id,
            occurredAt: timestamp,
            newValues: {
              projectId: project.id,
              stageId: stage.id,
              ownerId: owner.id,
              title: task.title
            }
          },
          transaction
        );
        return task;
      });
    }
  };
}

function toClientProject(project: DerivedProject): ClientProject {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    location: project.location,
    plannedStartAt: project.plannedStartAt,
    plannedEndAt: project.plannedEndAt,
    actualStartAt: project.actualStartAt,
    actualEndAt: project.actualEndAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    progress: project.progress
  };
}

function deriveHierarchy(
  hierarchy: ProjectHierarchy
): ProjectHierarchy & { progress: number } {
  const allTasks = hierarchy.floors.flatMap((floor) =>
    floor.stages.flatMap((stage) => stage.tasks)
  );
  const project = deriveProjectRead(hierarchy, allTasks);
  return {
    ...hierarchy,
    status: project.status,
    progress: project.progress,
    floors: hierarchy.floors.map((floor) => {
      const floorTasks = floor.stages.flatMap((stage) => stage.tasks);
      return { ...floor, progress: taskProgress(floorTasks) };
    })
  };
}

export function deriveProjectRead(
  project: ProjectRecord,
  tasks: TaskRecord[]
): DerivedProject {
  return {
    ...project,
    status:
      tasks.length === 0
        ? "planning"
        : tasks.every((task) => task.status === "completed")
          ? "completed"
          : tasks.some(
                (task) => task.status !== "not_started" || task.progress > 0
              )
            ? "active"
            : "planning",
    progress: taskProgress(tasks)
  };
}

function taskProgress(tasks: TaskRecord[]): number {
  const totalEffort = tasks.reduce((total, task) => total + taskWeight(task), 0);
  if (totalEffort === 0) return 0;
  return Math.round(
    tasks.reduce(
      (total, task) => total + task.progress * taskWeight(task),
      0
    ) / totalEffort
  );
}

function taskWeight(task: TaskRecord): number {
  return task.plannedEffort && task.plannedEffort > 0 ? task.plannedEffort : 1;
}

async function findAccessibleFloor(
  repository: AppRepository,
  actor: PublicUser,
  floorId: string
) {
  const user = await requireActor(repository, actor);
  const projects = await repository.listProjectsForUserInModule(
    user,
    currentProjectModule()
  );
  for (const candidate of projects) {
    const hierarchy = await repository.getProjectHierarchy(candidate.id);
    const floor = hierarchy?.floors.find((item) => item.id === floorId);
    if (hierarchy && floor) return { project: candidate, hierarchy, floor };
  }
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

async function findAccessibleStage(
  repository: AppRepository,
  actor: PublicUser,
  stageId: string
) {
  const user = await requireActor(repository, actor);
  const projects = await repository.listProjectsForUserInModule(
    user,
    currentProjectModule()
  );
  for (const project of projects) {
    const hierarchy = await repository.getProjectHierarchy(project.id);
    for (const floor of hierarchy?.floors ?? []) {
      const stage = floor.stages.find((item) => item.id === stageId);
      if (stage) return { project, floor, stage };
    }
  }
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

function currentProjectModule() {
  const { operation } = currentHumanOperation();
  if (operation.scope.kind !== "project") {
    throw new AuthorizationConfigurationError(
      "The current operation is not project-backed."
    );
  }
  return operation.scope.module;
}
