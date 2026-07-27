import { AsyncLocalStorage } from "node:async_hooks";

import { demoSeedData } from "../seed/data.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository,
  type AuditEventRecord,
  type AuditFilters,
  type DesignStageRecord,
  type DesignVersionRecord,
  type EvaluationRecord,
  type FloorRecord,
  type ManagerTreeNode,
  type ProjectHierarchy,
  type ProjectRecord,
  type SeedData,
  type TaskEventRecord,
  type TaskFilters,
  type TaskRecord,
  type UserRecord
} from "./types.js";

const clone = <T>(value: T): T => structuredClone(value);
const byNameThenId = <T extends { id: string; name: string }>(left: T, right: T) =>
  left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
const byOrderThenId = <T extends { id: string; order: number }>(left: T, right: T) =>
  left.order - right.order || left.id.localeCompare(right.id);
const byDateThenId = <T extends { id: string }>(
  field: keyof T,
  left: T,
  right: T
) =>
  new Date(String(left[field])).getTime() -
    new Date(String(right[field])).getTime() ||
  left.id.localeCompare(right.id);

interface MemorySnapshot {
  state: SeedData;
  counters: Map<string, number>;
  timestamp: number;
}

const snapshotReaders = new WeakMap<AppRepository, () => MemorySnapshot>();
const mutationMethods = new Set<keyof AppRepository>([
  "createProject",
  "createFloor",
  "createDesignStage",
  "createTask",
  "updateTask",
  "appendTaskEvent",
  "createDesignVersion",
  "createNextDesignVersion",
  "updateDesignVersion",
  "createEvaluation",
  "appendAuditEvent"
]);

export function createMemoryRepository(seed: SeedData = demoSeedData): AppRepository {
  return buildMemoryRepository({
    state: clone(seed),
    counters: new Map(),
    timestamp: latestTimestamp(seed)
  });
}

function buildMemoryRepository(initial: MemorySnapshot): AppRepository {
  let state = clone(initial.state);
  const counters = new Map(initial.counters);
  const transactionContext = new AsyncLocalStorage<boolean>();
  let writeTail: Promise<void> = Promise.resolve();
  let timestamp = initial.timestamp;

  const acquireWriteLock = async () => {
    const previousWrite = writeTail;
    let releaseWrite!: () => void;
    writeTail = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    await previousWrite;
    return releaseWrite;
  };

  const nextId = (prefix: string) => {
    const count = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, count);
    return `${prefix}-memory-${String(count).padStart(4, "0")}`;
  };
  const nextIso = () => {
    timestamp += 1;
    return new Date(timestamp).toISOString();
  };
  const ensureUniqueId = (records: Array<{ id: string }>, id: string, label: string) => {
    if (records.some((record) => record.id === id)) {
      throw new RepositoryConflictError(`${label} ${id} already exists.`);
    }
  };

  const implementation: AppRepository = {
    async runInTransaction(operation) {
      if (transactionContext.getStore()) {
        throw new Error("Nested memory transactions are not supported.");
      }
      const releaseWrite = await acquireWriteLock();
      const transactionRepository = buildMemoryRepository({
        state,
        counters,
        timestamp
      });
      const transactionView = new Proxy(transactionRepository, {
        get(target, property, receiver) {
          if (property === "runInTransaction") {
            return async () => {
              throw new Error("Nested memory transactions are not supported.");
            };
          }
          return Reflect.get(target, property, receiver);
        }
      });
      try {
        const result = await transactionContext.run(true, () =>
          operation(transactionView)
        );
        const committed = snapshotReaders.get(transactionRepository)!();
        state = committed.state;
        timestamp = committed.timestamp;
        counters.clear();
        for (const [key, value] of committed.counters) counters.set(key, value);
        return result;
      } finally {
        releaseWrite();
      }
    },

    async findUserById(id) {
      return copyOrNull(state.users.find((user) => user.id === id));
    },

    async findUserByEmail(email) {
      const normalizedEmail = email.trim().toLowerCase();
      return copyOrNull(
        state.users.find((user) => user.email.trim().toLowerCase() === normalizedEmail)
      );
    },

    async listUsers() {
      return clone([...state.users].sort(byNameThenId));
    },

    async listUsersByIds(ids) {
      const selected = new Set(ids);
      return clone(
        state.users.filter((user) => selected.has(user.id)).sort(byNameThenId)
      );
    },

    async listProjectsForUser(user) {
      const directReportIds =
        user.role === "design_manager"
          ? new Set(
              state.users
                .filter(
                  (candidate) =>
                    candidate.role === "designer" && candidate.managerId === user.id
                )
                .map((candidate) => candidate.id)
            )
          : new Set<string>();

      const projects = state.projects.filter((project) => {
        if (user.role === "design_head") return true;
        if (user.role === "client") return project.clientId === user.id;
        if (user.role === "designer") {
          return (
            project.initiatingDesignerId === user.id ||
            project.assignedDesignerIds.includes(user.id)
          );
        }
        return (
          project.managerId === user.id ||
          project.assignedDesignerIds.some((designerId) => directReportIds.has(designerId))
        );
      });

      return clone([...projects].sort(byNameThenId));
    },

    async listProjectsForDesignerIds(designerIds, limit) {
      const ids = new Set(designerIds);
      const projects = state.projects
        .filter(
          (project) =>
            ids.has(project.initiatingDesignerId) ||
            project.assignedDesignerIds.some((id) => ids.has(id))
        )
        .sort(byNameThenId);
      return clone(limit === undefined ? projects : projects.slice(0, limit));
    },

    async pageProjectsForUser(user, pagination) {
      const projects = await implementation.listProjectsForUser(user);
      return paginate(projects, pagination);
    },

    async findProjectById(id) {
      return copyOrNull(state.projects.find((project) => project.id === id));
    },

    async createProject(input) {
      ensureUniqueId(state.projects, input.id, "Project");
      const record: ProjectRecord = clone(input);
      state.projects.push(record);
      return clone(record);
    },

    async createFloor(input) {
      ensureUniqueId(state.floors, input.id, "Floor");
      const record: FloorRecord = clone(input);
      state.floors.push(record);
      return clone(record);
    },

    async createDesignStage(input) {
      ensureUniqueId(state.stages, input.id, "Design stage");
      const record: DesignStageRecord = clone(input);
      state.stages.push(record);
      return clone(record);
    },

    async createTask(input) {
      ensureUniqueId(state.tasks, input.id, "Task");
      const record: TaskRecord = clone(input);
      state.tasks.push(record);
      return clone(record);
    },

    async getProjectHierarchy(projectId) {
      const project = state.projects.find((candidate) => candidate.id === projectId);
      if (!project) return null;

      const hierarchy: ProjectHierarchy = {
        ...clone(project),
        floors: state.floors
          .filter((floor) => floor.projectId === projectId)
          .sort(byOrderThenId)
          .map((floor) => ({
            ...clone(floor),
            stages: state.stages
              .filter((candidate) => candidate.floorId === floor.id)
              .sort(byOrderThenId)
              .map((designStage) => ({
                ...clone(designStage),
                tasks: state.tasks
                  .filter((candidate) => candidate.stageId === designStage.id)
                  .sort(byOrderThenId)
                  .map(clone)
              }))
          }))
      };

      return clone(hierarchy);
    },

    async getOrganizationTree() {
      const managers: ManagerTreeNode[] = state.users
        .filter((user) => user.active && user.role === "design_manager")
        .sort(byNameThenId)
        .map((manager) => ({
          id: manager.id,
          name: manager.name,
          email: manager.email,
          ...(manager.avatar ? { avatar: manager.avatar } : {}),
          ...(manager.title ? { title: manager.title } : {}),
          designerTotal: state.users.filter(
            (user) =>
              user.active &&
              user.role === "designer" &&
              user.managerId === manager.id
          ).length,
          designers: state.users
            .filter(
              (user) =>
                user.active && user.role === "designer" && user.managerId === manager.id
            )
            .sort(byNameThenId)
            .map((designer) => ({
              id: designer.id,
              name: designer.name,
              email: designer.email,
              ...(designer.avatar ? { avatar: designer.avatar } : {}),
              ...(designer.title ? { title: designer.title } : {})
            }))
        }));

      return clone(managers);
    },

    async pageOrganizationManagers(pagination) {
      const page = paginate(await implementation.getOrganizationTree(), pagination);
      return {
        ...page,
        items: page.items.map((manager) => ({
          ...manager,
          designers: manager.designers.slice(0, 20)
        }))
      };
    },

    async pageDesignersForManager(managerId, pagination) {
      const designers = state.users
        .filter(
          (user) =>
            user.active &&
            user.role === "designer" &&
            user.managerId === managerId
        )
        .sort(byNameThenId);
      return paginate(clone(designers), pagination);
    },

    async findTaskById(id) {
      return copyOrNull(state.tasks.find((task) => task.id === id));
    },

    async listTasks(filters) {
      return clone(
        state.tasks
          .filter((task) => matchesTaskFilters(task, filters))
          .sort(
            (left, right) =>
              left.projectId.localeCompare(right.projectId) ||
              left.floorId.localeCompare(right.floorId) ||
              left.stageId.localeCompare(right.stageId) ||
              byOrderThenId(left, right)
          )
      );
    },

    async listTasksForProjectIds(projectIds, limit) {
      const ids = new Set(projectIds);
      const tasks = state.tasks.filter((task) => ids.has(task.projectId)).sort(compareTasks);
      return clone(limit === undefined ? tasks : tasks.slice(0, limit));
    },

    async listTasksForOwnerIds(ownerIds, limit) {
      const ids = new Set(ownerIds);
      const tasks = state.tasks.filter((task) => ids.has(task.ownerId)).sort(compareTasks);
      return clone(limit === undefined ? tasks : tasks.slice(0, limit));
    },

    async listFloorsForProjectIds(projectIds) {
      const ids = new Set(projectIds);
      return clone(
        state.floors
          .filter((floor) => ids.has(floor.projectId))
          .sort(
            (left, right) =>
              left.projectId.localeCompare(right.projectId) ||
              byOrderThenId(left, right)
          )
      );
    },

    async listKpiTasksForPeriod(ownerIds, periodStartAt, periodEndAt, limit) {
      const tasks = state.tasks
          .filter(
            (task) =>
              ownerIds.includes(task.ownerId) &&
              overlapsPeriod(task, periodStartAt, periodEndAt)
          )
          .sort(compareTasks);
      return clone(limit === undefined ? tasks : tasks.slice(0, limit));
    },

    async pageKpiTasksForPeriod(
      ownerIds,
      periodStartAt,
      periodEndAt,
      pagination
    ) {
      const tasks = await implementation.listKpiTasksForPeriod(
        ownerIds,
        periodStartAt,
        periodEndAt
      );
      return paginate(tasks, pagination);
    },

    async updateTask(id, expectedVersion, change) {
      const index = state.tasks.findIndex((task) => task.id === id);
      if (index < 0) throw new RepositoryNotFoundError(`Task ${id} was not found.`);
      const current = state.tasks[index]!;
      if (current.version !== expectedVersion) {
        throw new RepositoryConflictError(
          `Task ${id} has version ${current.version}, expected ${expectedVersion}.`
        );
      }

      const status = change.status ?? current.status;
      const completedAt =
        status === "completed"
          ? (change.completedAt ?? current.completedAt)
          : null;
      if (status === "completed" && !completedAt) {
        throw new RepositoryConflictError("Completed tasks require completedAt.");
      }

      const updated = {
        ...current,
        ...clone(change),
        status,
        completedAt,
        version: current.version + 1,
        updatedAt: nextIso()
      } as TaskRecord;
      state.tasks[index] = updated;
      return clone(updated);
    },

    async appendTaskEvent(input) {
      const id = input.id ?? nextId("task-event");
      ensureUniqueId(state.taskEvents, id, "Task event");
      const record: TaskEventRecord = {
        ...clone(input),
        id,
        note: input.note ?? null,
        createdAt: input.createdAt ?? nextIso()
      };
      state.taskEvents.push(record);
      return clone(record);
    },

    async listTaskEvents(taskId) {
      return clone(
        state.taskEvents
          .filter((event) => event.taskId === taskId)
          .sort((left, right) => byDateThenId("occurredAt", left, right))
      );
    },

    async listRecentTaskEvents(taskIds, limit) {
      const scopedTaskIds = new Set(taskIds);
      return clone(
        state.taskEvents
          .filter((event) => scopedTaskIds.has(event.taskId))
          .sort((left, right) => byDateThenId("occurredAt", right, left))
          .slice(0, limit)
      );
    },

    async pageTaskEvents(taskId, pagination, sort = "asc") {
      const events = await implementation.listTaskEvents(taskId);
      return paginate(sort === "desc" ? events.reverse() : events, pagination);
    },

    async listKpiTaskEventsForPeriod(
      taskId,
      actorId,
      periodStartAt,
      periodEndAt
    ) {
      return clone(
        state.taskEvents
          .filter((event) =>
            matchesKpiEvent(
              event,
              taskId,
              actorId,
              periodStartAt,
              periodEndAt
            )
          )
          .sort((left, right) => byDateThenId("occurredAt", left, right))
      );
    },

    async pageKpiTaskEventsForPeriod(
      taskId,
      actorId,
      periodStartAt,
      periodEndAt,
      pagination
    ) {
      const events = await implementation.listKpiTaskEventsForPeriod(
        taskId,
        actorId,
        periodStartAt,
        periodEndAt
      );
      return paginate(events, pagination);
    },

    async listKpiTaskEventsForTasks(
      taskOwners,
      periodStartAt,
      periodEndAt,
      limit
    ) {
      const ownerByTaskId = new Map(taskOwners.map((task) => [task.id, task.ownerId]));
      const events = state.taskEvents
          .filter((event) =>
            ownerByTaskId.get(event.taskId) === event.actorId &&
            matchesKpiEvent(event, event.taskId, event.actorId, periodStartAt, periodEndAt)
          )
          .sort((left, right) => byDateThenId("occurredAt", left, right));
      return clone(limit === undefined ? events : events.slice(0, limit));
    },

    async createDesignVersion(input) {
      const id = input.id ?? nextId("design-version");
      ensureUniqueId(state.designVersions, id, "Design version");
      if (
        state.designVersions.some(
          (version) =>
            version.projectId === input.projectId &&
            version.floorId === input.floorId &&
            version.stageId === input.stageId &&
            version.taskId === input.taskId &&
            version.versionNumber === input.versionNumber
        )
      ) {
        throw new RepositoryConflictError(
          "Design version target and version number already exist."
        );
      }
      const createdAt = input.createdAt ?? nextIso();
      const record: DesignVersionRecord = {
        ...clone(input),
        id,
        createdAt,
        updatedAt: input.updatedAt ?? createdAt
      };
      state.designVersions.push(record);
      return clone(record);
    },

    async createNextDesignVersion(input) {
      const versionNumber =
        Math.max(
          0,
          ...state.designVersions
            .filter(
              (version) =>
                version.projectId === input.projectId &&
                version.floorId === input.floorId &&
                version.stageId === input.stageId &&
                version.taskId === input.taskId
            )
            .map((version) => version.versionNumber)
        ) + 1;
      return implementation.createDesignVersion({
        ...input,
        versionNumber
      });
    },

    async findDesignVersionById(id) {
      return copyOrNull(state.designVersions.find((version) => version.id === id));
    },

    async listDesignVersions(projectId, limit) {
      const versions = state.designVersions
          .filter((version) => version.projectId === projectId)
          .sort(
            (left, right) =>
              left.floorId.localeCompare(right.floorId) ||
              left.stageId.localeCompare(right.stageId) ||
              left.versionNumber - right.versionNumber ||
              left.id.localeCompare(right.id)
          );
      return clone(limit === undefined ? versions : versions.slice(0, limit));
    },

    async listDesignVersionsForTaskIds(taskIds, limit) {
      const ids = new Set(taskIds);
      const versions = state.designVersions
          .filter((version) => version.taskId !== null && ids.has(version.taskId))
          .sort((left, right) => left.taskId!.localeCompare(right.taskId!) || left.versionNumber - right.versionNumber || left.id.localeCompare(right.id));
      return clone(limit === undefined ? versions : versions.slice(0, limit));
    },

    async listLatestClientVisibleDesignVersions(projectIds) {
      const latest = new Map<string, DesignVersionRecord>();
      for (const version of state.designVersions) {
        if (!projectIds.includes(version.projectId) || version.approvalStatus !== "approved" || !version.clientVisible) continue;
        const current = latest.get(version.projectId);
        if (!current || compareLatestClientVisibleVersion(version, current) > 0) latest.set(version.projectId, version);
      }
      return clone([...latest.values()].sort((left, right) => left.projectId.localeCompare(right.projectId)));
    },

    async pageDesignVersions(filters, pagination) {
      const versions = (await implementation.listDesignVersions(filters.projectId))
        .filter(
          (version) =>
            (filters.approvalStatus === undefined ||
              version.approvalStatus === filters.approvalStatus) &&
            (filters.clientVisible === undefined ||
              version.clientVisible === filters.clientVisible)
        )
        .sort((left, right) => byDateThenId("uploadedAt", left, right));
      return paginate(versions, pagination);
    },

    async updateDesignVersion(id, change) {
      const index = state.designVersions.findIndex((version) => version.id === id);
      if (index < 0) {
        throw new RepositoryNotFoundError(`Design version ${id} was not found.`);
      }
      const updated: DesignVersionRecord = {
        ...state.designVersions[index]!,
        ...clone(change),
        updatedAt: nextIso()
      };
      state.designVersions[index] = updated;
      return clone(updated);
    },

    async createEvaluation(input) {
      const id = input.id ?? nextId("evaluation");
      ensureUniqueId(state.evaluations, id, "Evaluation");
      const record: EvaluationRecord = {
        ...clone(input),
        id,
        revisionOf: input.revisionOf ?? null,
        createdAt: input.createdAt ?? nextIso()
      };
      state.evaluations.push(record);
      return clone(record);
    },

    async listEvaluationsForSubject(subjectUserId) {
      return clone(
        state.evaluations
          .filter((evaluation) => evaluation.subjectUserId === subjectUserId)
          .sort((left, right) => byDateThenId("createdAt", right, left))
      );
    },

    async listEvaluationsForSubjectIds(subjectUserIds, limit) {
      const ids = new Set(subjectUserIds);
      const evaluations = state.evaluations
          .filter((evaluation) => ids.has(evaluation.subjectUserId))
          .sort((left, right) => byDateThenId("createdAt", right, left));
      return clone(limit === undefined ? evaluations : evaluations.slice(0, limit));
    },

    async pageEvaluationsForSubject(subjectUserId, pagination) {
      const evaluations = await implementation.listEvaluationsForSubject(
        subjectUserId
      );
      return paginate(evaluations, pagination);
    },

    async appendAuditEvent(input) {
      const id = input.id ?? nextId("audit-event");
      ensureUniqueId(state.auditEvents, id, "Audit event");
      const record: AuditEventRecord = {
        ...clone(input),
        id,
        reason: input.reason ?? null,
        createdAt: input.createdAt ?? nextIso()
      };
      state.auditEvents.push(record);
      return clone(record);
    },

    async listAuditEvents(filters) {
      return clone(
        state.auditEvents
          .filter((event) => matchesAuditFilters(event, filters))
          .sort((left, right) => filters.sort === "desc"
            ? byDateThenId("occurredAt", right, left)
            : byDateThenId("occurredAt", left, right))
      );
    },

    async pageAuditEvents(filters, pagination) {
      const events = await implementation.listAuditEvents(filters);
      return paginate(events, pagination);
    }
  };
  const repository = new Proxy(implementation, {
    get(target, property: keyof AppRepository, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (
        property === "runInTransaction" ||
        !mutationMethods.has(property) ||
        typeof value !== "function"
      ) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        if (transactionContext.getStore()) {
          throw new Error(
            "Use the transaction repository for writes inside a memory transaction."
          );
        }
        const releaseWrite = await acquireWriteLock();
        try {
          return await value.apply(target, args);
        } finally {
          releaseWrite();
        }
      };
    }
  }) as AppRepository;
  snapshotReaders.set(repository, () => ({
    state: clone(state),
    counters: new Map(counters),
    timestamp
  }));
  return repository;
}

function compareLatestClientVisibleVersion(left: DesignVersionRecord, right: DesignVersionRecord) {
  return new Date(left.approvedAt ?? 0).getTime() - new Date(right.approvedAt ?? 0).getTime()
    || new Date(left.uploadedAt).getTime() - new Date(right.uploadedAt).getTime()
    || left.id.localeCompare(right.id);
}

function copyOrNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : clone(value);
}

function matchesTaskFilters(task: TaskRecord, filters: TaskFilters) {
  return (
    (filters.projectId === undefined || task.projectId === filters.projectId) &&
    (filters.floorId === undefined || task.floorId === filters.floorId) &&
    (filters.stageId === undefined || task.stageId === filters.stageId) &&
    (filters.ownerId === undefined || task.ownerId === filters.ownerId)
  );
}

function compareTasks(left: TaskRecord, right: TaskRecord) {
  return (
    left.projectId.localeCompare(right.projectId) ||
    left.floorId.localeCompare(right.floorId) ||
    left.stageId.localeCompare(right.stageId) ||
    byOrderThenId(left, right)
  );
}

function matchesAuditFilters(event: AuditEventRecord, filters: AuditFilters) {
  const hasVisibilityScope =
    filters.visibleActorIds !== undefined ||
    filters.visibleTaskIds !== undefined;
  const isVisible =
    !hasVisibilityScope ||
    filters.visibleActorIds?.includes(event.actorId) === true ||
    (event.entityType === "task" &&
      filters.visibleTaskIds?.includes(event.entityId) === true);
  return (
    isVisible &&
    (filters.actorId === undefined || event.actorId === filters.actorId) &&
    (filters.entityType === undefined || event.entityType === filters.entityType) &&
    (filters.entityId === undefined || event.entityId === filters.entityId)
    && (filters.entityIds === undefined || filters.entityIds.includes(event.entityId))
  );
}

function overlapsPeriod(
  task: TaskRecord,
  periodStartAt: string,
  periodEndAt: string
) {
  const periodStart = new Date(periodStartAt).getTime();
  const periodEnd = new Date(periodEndAt).getTime();
  const taskStart = new Date(task.plannedStartAt).getTime();
  const taskEnd = new Date(task.currentDeadlineAt).getTime();
  const completedAt = task.completedAt
    ? new Date(task.completedAt).getTime()
    : undefined;
  return (
    (taskStart <= periodEnd && taskEnd >= periodStart) ||
    (completedAt !== undefined &&
      completedAt >= periodStart &&
      completedAt <= periodEnd)
  );
}

function matchesKpiEvent(
  event: TaskEventRecord,
  taskId: string,
  actorId: string,
  periodStartAt: string,
  periodEndAt: string
) {
  return (
    event.taskId === taskId &&
    event.actorId === actorId &&
    event.type !== "deadline_revised" &&
    new Date(event.occurredAt).getTime() >=
      new Date(periodStartAt).getTime() &&
    new Date(event.occurredAt).getTime() <= new Date(periodEndAt).getTime()
  );
}

function paginate<T>(
  items: T[],
  pagination: { limit: number; offset: number }
) {
  return {
    items: clone(
      items.slice(pagination.offset, pagination.offset + pagination.limit)
    ),
    total: items.length
  };
}

function latestTimestamp(seed: SeedData): number {
  const timestamps = [
    ...seed.users.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.projects.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.floors.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.stages.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.tasks.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.taskEvents.map((record) => record.createdAt),
    ...seed.designVersions.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.evaluations.map((record) => record.createdAt),
    ...seed.auditEvents.map((record) => record.createdAt)
  ].map((value) => new Date(value).getTime());

  return Math.max(0, ...timestamps);
}
