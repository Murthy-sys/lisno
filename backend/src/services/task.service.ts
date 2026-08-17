import { ApiError } from "../middleware/errors.js";
import { calculateTaskRisk } from "../domain/risk.js";
import {
  RepositoryConflictError,
  type AppRepository,
  type PageResult,
  type PaginationInput,
  type TaskEventSort,
  type TaskEventRecord,
  type TaskRecord
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";
import {
  forbidden,
  requireProjectOperationAccess,
  requireTask,
  requireUser,
  type Clock
} from "./workflow.js";

export interface UpdateTaskInput {
  version: number;
  status?: TaskRecord["status"];
  progress?: number;
  description?: string;
  note?: string;
}

export interface ReviseDeadlineInput {
  version: number;
  currentDeadlineAt: string;
  reason: string;
}

export interface TaskService {
  listEvents(
    actor: PublicUser,
    taskId: string,
    pagination: PaginationInput,
    sort?: TaskEventSort
  ): Promise<PageResult<TaskEventRecord>>;
  update(
    actor: PublicUser,
    taskId: string,
    input: UpdateTaskInput
  ): Promise<TaskRecord>;
  reviseDeadline(
    actor: PublicUser,
    taskId: string,
    input: ReviseDeadlineInput
  ): Promise<TaskRecord>;
}

const transitions: Record<TaskRecord["status"], readonly TaskRecord["status"][]> = {
  not_started: ["in_progress", "blocked"],
  in_progress: ["in_review", "blocked", "completed"],
  in_review: ["in_progress", "blocked", "completed"],
  blocked: ["not_started", "in_progress"],
  completed: []
};

export function createTaskService(
  repository: AppRepository,
  audit: AuditService,
  clock: Clock
): TaskService {
  return {
    async listEvents(actor, taskId, pagination, sort = "asc") {
      if (actor.role === "client") forbidden();
      const task = await requireTask(repository, taskId);
      await requireProjectOperationAccess(repository, actor, task.projectId);
      return repository.pageTaskEvents(task.id, pagination, sort);
    },

    async update(actor, taskId, input) {
      if (actor.role !== "designer") forbidden();
      const current = await requireTask(repository, taskId);
      await requireProjectOperationAccess(repository, actor, current.projectId);
      if (current.ownerId !== actor.id) forbidden();
      assertVersion(current, input.version);

      const nextStatus = input.status ?? current.status;
      if (
        input.status &&
        input.status !== current.status &&
        !transitions[current.status].includes(input.status)
      ) {
        throw new ApiError(
          400,
          "INVALID_STATUS_TRANSITION",
          `Task status cannot move from ${current.status} to ${input.status}.`,
          { status: "This task status transition is not allowed." }
        );
      }
      if (current.status === "completed") {
        throw new ApiError(
          400,
          "INVALID_STATUS_TRANSITION",
          "Completed tasks cannot be changed.",
          { status: "Completed tasks cannot be changed." }
        );
      }

      const nextProgress = input.progress ?? current.progress;
      if (nextStatus === "completed" && nextProgress !== 100) {
        throw new ApiError(
          400,
          "INVALID_TASK_UPDATE",
          "Completed tasks require progress 100.",
          { progress: "Completed tasks require progress 100." }
        );
      }
      if (nextStatus !== "not_started" || nextProgress > 0) {
        await assertDependenciesCompleted(repository, current);
      }

      const now = clock();
      const occurredAt = now.toISOString();
      const observedYellow = calculateTaskRisk(current, now).level === "yellow";
      return repository.runInTransaction(async (transaction) => {
        let updated: TaskRecord;
        try {
          updated = await transaction.updateTask(taskId, input.version, {
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.progress !== undefined ? { progress: input.progress } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(current.wasYellow || observedYellow ? { wasYellow: true } : {}),
            ...(nextStatus === "completed" ? { completedAt: occurredAt } : {}),
            latestUpdateAt: occurredAt
          });
        } catch (error) {
          mapRepositoryConflict(error);
        }

        if (updated.status !== current.status) {
          await appendChange(
            transaction,
            audit,
            actor.id,
            updated.id,
            "status_changed",
            "task_status_changed",
            occurredAt,
            { status: current.status },
            { status: updated.status }
          );
        }
        if (updated.progress !== current.progress) {
          await appendChange(
            transaction,
            audit,
            actor.id,
            updated.id,
            "progress_changed",
            "task_progress_changed",
            occurredAt,
            { progress: current.progress },
            { progress: updated.progress }
          );
        }
        if (input.note) {
          await transaction.appendTaskEvent({
            taskId: updated.id,
            actorId: actor.id,
            type: "note_added",
            occurredAt,
            from: {},
            to: {},
            note: input.note
          });
          await audit.append(
            {
              actorId: actor.id,
              action: "task_note_added",
              entityType: "task",
              entityId: updated.id,
              occurredAt,
              newValues: { note: input.note }
            },
            transaction
          );
        }
        return updated;
      });
    },

    async reviseDeadline(actor, taskId, input) {
      if (
        actor.role !== "super_admin" &&
        actor.role !== "design_manager" &&
        actor.role !== "design_head"
      ) {
        forbidden();
      }
      const current = await requireTask(repository, taskId);
      await requireProjectOperationAccess(repository, actor, current.projectId);
      const owner = await requireUser(repository, current.ownerId);
      if (
        actor.role === "design_manager" &&
        (owner.role !== "designer" || owner.managerId !== actor.id)
      ) {
        forbidden();
      }
      if (current.status === "completed") {
        throw new ApiError(
          409,
          "TASK_ALREADY_COMPLETED",
          "Completed task deadlines cannot be revised."
        );
      }
      assertVersion(current, input.version);
      if (new Date(input.currentDeadlineAt) < new Date(current.plannedStartAt)) {
        throw new ApiError(
          400,
          "INVALID_DEADLINE",
          "Task deadline must follow its planned start.",
          {
            currentDeadlineAt:
              "Task deadline must follow its planned start."
          }
        );
      }

      const now = clock();
      const occurredAt = now.toISOString();
      const observedYellow = calculateTaskRisk(current, now).level === "yellow";
      return repository.runInTransaction(async (transaction) => {
        let updated: TaskRecord;
        try {
          updated = await transaction.updateTask(taskId, input.version, {
            currentDeadlineAt: input.currentDeadlineAt,
            ...(current.wasYellow || observedYellow ? { wasYellow: true } : {}),
            latestUpdateAt: occurredAt
          });
        } catch (error) {
          mapRepositoryConflict(error);
        }
        const oldValues = { currentDeadlineAt: current.currentDeadlineAt };
        const newValues = { currentDeadlineAt: updated.currentDeadlineAt };
        await transaction.appendTaskEvent({
          taskId: updated.id,
          actorId: actor.id,
          type: "deadline_revised",
          occurredAt,
          from: oldValues,
          to: newValues,
          note: input.reason
        });
        await audit.append(
          {
            actorId: actor.id,
            action: "task_deadline_revised",
            entityType: "task",
            entityId: updated.id,
            occurredAt,
            oldValues,
            newValues,
            reason: input.reason
          },
          transaction
        );
        return updated;
      });
    }
  };
}

function assertVersion(task: TaskRecord, expectedVersion: number) {
  if (task.version !== expectedVersion) {
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      `Task has version ${task.version}, expected ${expectedVersion}.`
    );
  }
}

async function assertDependenciesCompleted(
  repository: AppRepository,
  task: TaskRecord
) {
  const dependencies = await Promise.all(
    task.dependencyTaskIds.map((id) => repository.findTaskById(id))
  );
  if (
    dependencies.some(
      (dependency) =>
        !dependency ||
        dependency.projectId !== task.projectId ||
        dependency.status !== "completed"
    )
  ) {
    throw new ApiError(
      409,
      "DEPENDENCY_INCOMPLETE",
      "All task dependencies must be completed first."
    );
  }
}

async function appendChange(
  repository: AppRepository,
  audit: AuditService,
  actorId: string,
  taskId: string,
  eventType: "status_changed" | "progress_changed",
  action: "task_status_changed" | "task_progress_changed",
  occurredAt: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
) {
  await repository.appendTaskEvent({
    taskId,
    actorId,
    type: eventType,
    occurredAt,
    from: oldValues,
    to: newValues,
    note: null
  });
  await audit.append(
    {
      actorId,
      action,
      entityType: "task",
      entityId: taskId,
      occurredAt,
      oldValues,
      newValues
    },
    repository
  );
}

function mapRepositoryConflict(error: unknown): never {
  if (error instanceof RepositoryConflictError) {
    throw new ApiError(409, "VERSION_CONFLICT", error.message);
  }
  throw error;
}
