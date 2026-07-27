import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession, type Model, type PipelineStage } from "mongoose";
import { AuditEventModel } from "../models/AuditEvent.js";
import { DesignStageModel } from "../models/DesignStage.js";
import { DesignVersionModel } from "../models/DesignVersion.js";
import { DesignVersionSequenceModel } from "../models/DesignVersionSequence.js";
import { EvaluationModel } from "../models/Evaluation.js";
import { FloorModel } from "../models/Floor.js";
import { ProjectModel } from "../models/Project.js";
import { TaskModel } from "../models/Task.js";
import { TaskEventModel } from "../models/TaskEvent.js";
import { UserModel } from "../models/User.js";
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
  type NewDesignVersion,
  type ProjectHierarchy,
  type ProjectRecord,
  type TaskEventRecord,
  type TaskRecord,
  type UserRecord
} from "./types.js";

type PlainDocument = Record<string, any>;

export function createMongoRepository(session?: ClientSession): AppRepository {
  const projectFilterForUser = async (user: UserRecord) => {
    let filter: PlainDocument = {};
    if (user.role === "client") filter = { clientId: user.id };
    if (user.role === "designer") {
      filter = {
        $or: [
          { initiatingDesignerId: user.id },
          { assignedDesignerIds: user.id }
        ]
      };
    }
    if (user.role === "design_manager") {
      const directReportQuery = UserModel.find({
        managerId: user.id,
        role: "designer"
      });
      if (session) directReportQuery.session(session);
      const directReports = await directReportQuery.distinct("_id").exec();
      filter = {
        $or: [
          { managerId: user.id },
          { assignedDesignerIds: { $in: directReports } }
        ]
      };
    }
    return filter;
  };

  const repository: AppRepository = {
    async runInTransaction(operation) {
      if (session) return operation(repository);
      const transactionSession = await mongoose.startSession();
      let result: unknown;
      let completed = false;
      try {
        await transactionSession.withTransaction(async () => {
          result = await operation(createMongoRepository(transactionSession));
          completed = true;
        });
        if (!completed) {
          throw new Error("MongoDB transaction did not complete.");
        }
        return result as Awaited<ReturnType<typeof operation>>;
      } finally {
        await transactionSession.endSession();
      }
    },

    async findUserById(id) {
      const document = await UserModel.findById(id).select("+passwordHash").lean().exec();
      return document ? mapUser(document) : null;
    },

    async findUserByEmail(email) {
      const document = await UserModel.findOne({ email: email.trim().toLowerCase() })
        .select("+passwordHash")
        .lean()
        .exec();
      return document ? mapUser(document) : null;
    },

    async listUsers() {
      const documents = await UserModel.find()
        .select("+passwordHash")
        .sort({ name: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapUser);
    },

    async listUsersByIds(ids) {
      if (ids.length === 0) return [];
      const documents = await UserModel.find({ _id: { $in: ids } })
        .select("+passwordHash")
        .sort({ name: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapUser);
    },

    async listProjectsForUser(user) {
      const filter = await projectFilterForUser(user);
      const documents = await ProjectModel.find(filter)
        .sort({ name: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapProject);
    },

    async listProjectsForDesignerIds(designerIds, limit) {
      if (designerIds.length === 0) return [];
      const query = ProjectModel.find({
        $or: [
          { initiatingDesignerId: { $in: designerIds } },
          { assignedDesignerIds: { $in: designerIds } }
        ]
      }).sort({ name: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapProject);
    },

    async pageProjectsForUser(user, pagination) {
      const filter = await projectFilterForUser(user);
      const [documents, total] = await Promise.all([
        ProjectModel.find(filter)
          .sort({ name: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        ProjectModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapProject), total };
    },

    async findProjectById(id) {
      const document = await ProjectModel.findById(id).lean().exec();
      return document ? mapProject(document) : null;
    },

    async createProject(input) {
      const document = await createMongoDocument("Project", () =>
        createDocument(ProjectModel, {
          ...projectForMongo(input),
          _id: input.id
        }, session)
      );
      return mapProject(document.toObject());
    },

    async createFloor(input) {
      const document = await createMongoDocument("Floor", () =>
        createDocument(FloorModel, {
          ...floorForMongo(input),
          _id: input.id
        }, session)
      );
      return mapFloor(document.toObject());
    },

    async createDesignStage(input) {
      const document = await createMongoDocument("Design stage", () =>
        createDocument(DesignStageModel, {
          ...input,
          _id: input.id,
          id: undefined,
          createdAt: date(input.createdAt),
          updatedAt: date(input.updatedAt)
        }, session)
      );
      return mapStage(document.toObject());
    },

    async createTask(input) {
      const document = await createMongoDocument("Task", () =>
        createDocument(TaskModel, {
          ...taskForMongo(input),
          _id: input.id,
          __v: input.version - 1
        }, session)
      );
      return mapTask(document.toObject());
    },

    async getProjectHierarchy(projectId) {
      const [project, floors, stages, tasks] = await Promise.all([
        ProjectModel.findById(projectId).lean().exec(),
        FloorModel.find({ projectId }).sort({ order: 1, _id: 1 }).lean().exec(),
        DesignStageModel.find({ projectId })
          .sort({ floorId: 1, order: 1, _id: 1 })
          .lean()
          .exec(),
        TaskModel.find({ projectId })
          .sort({ floorId: 1, stageId: 1, order: 1, _id: 1 })
          .lean()
          .exec()
      ]);
      if (!project) return null;

      const mappedStages = stages.map(mapStage);
      const mappedTasks = tasks.map(mapTask);
      const hierarchy: ProjectHierarchy = {
        ...mapProject(project),
        floors: floors.map((floorDocument) => {
          const floor = mapFloor(floorDocument);
          return {
            ...floor,
            stages: mappedStages
              .filter((designStage) => designStage.floorId === floor.id)
              .map((designStage) => ({
                ...designStage,
                tasks: mappedTasks.filter((task) => task.stageId === designStage.id)
              }))
          };
        })
      };
      return hierarchy;
    },

    async getOrganizationTree() {
      const users = await UserModel.find({
        active: true,
        role: { $in: ["design_manager", "designer"] }
      })
        .select("+passwordHash")
        .sort({ name: 1, _id: 1 })
        .lean()
        .exec();
      const mapped = users.map(mapUser);
      return mapped
        .filter((user) => user.role === "design_manager")
        .map<ManagerTreeNode>((manager) => ({
          id: manager.id,
          name: manager.name,
          email: manager.email,
          ...(manager.avatar ? { avatar: manager.avatar } : {}),
          ...(manager.title ? { title: manager.title } : {}),
          designerTotal: mapped.filter(
            (user) => user.role === "designer" && user.managerId === manager.id
          ).length,
          designers: mapped
            .filter(
              (user) => user.role === "designer" && user.managerId === manager.id
            )
            .map((designer) => ({
              id: designer.id,
              name: designer.name,
              email: designer.email,
              ...(designer.avatar ? { avatar: designer.avatar } : {}),
              ...(designer.title ? { title: designer.title } : {})
            }))
        }));
    },

    async pageOrganizationManagers(pagination) {
      const managerFilter = { active: true, role: "design_manager" };
      const [managerDocuments, total] = await Promise.all([
        UserModel.find(managerFilter)
          .select("+passwordHash")
          .sort({ name: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        UserModel.countDocuments(managerFilter).exec()
      ]);
      const managers = managerDocuments.map(mapUser);
      const designerPages = await Promise.all(
        managers.map(async (manager) => {
          const filter = {
            active: true,
            role: "designer",
            managerId: manager.id
          };
          const [documents, designerTotal] = await Promise.all([
            UserModel.find(filter)
              .select("+passwordHash")
              .sort({ name: 1, _id: 1 })
              .limit(20)
              .lean()
              .exec(),
            UserModel.countDocuments(filter).exec()
          ]);
          return {
            managerId: manager.id,
            designerTotal,
            designers: documents.map(mapUser)
          };
        })
      );
      return {
        items: managers.map<ManagerTreeNode>((manager) => {
          const designerPage = designerPages.find(
            (candidate) => candidate.managerId === manager.id
          )!;
          return {
            id: manager.id,
            name: manager.name,
            email: manager.email,
            ...(manager.avatar ? { avatar: manager.avatar } : {}),
            ...(manager.title ? { title: manager.title } : {}),
            designerTotal: designerPage.designerTotal,
            designers: designerPage.designers.map((designer) => ({
              id: designer.id,
              name: designer.name,
              email: designer.email,
              ...(designer.avatar ? { avatar: designer.avatar } : {}),
              ...(designer.title ? { title: designer.title } : {})
            }))
          };
        }),
        total
      };
    },

    async pageDesignersForManager(managerId, pagination) {
      const filter = {
        active: true,
        role: "designer",
        managerId
      };
      const [documents, total] = await Promise.all([
        UserModel.find(filter)
          .select("+passwordHash")
          .sort({ name: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        UserModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapUser), total };
    },

    async findTaskById(id) {
      const query = TaskModel.findById(id);
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapTask(document) : null;
    },

    async listTasks(filters) {
      const documents = await TaskModel.find(compactFilter(filters))
        .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapTask);
    },

    async listTasksForProjectIds(projectIds, limit) {
      if (projectIds.length === 0) return [];
      const query = TaskModel.find({ projectId: { $in: projectIds } })
        .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapTask);
    },

    async listTasksForOwnerIds(ownerIds, limit) {
      if (ownerIds.length === 0) return [];
      const query = TaskModel.find({ ownerId: { $in: ownerIds } })
        .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapTask);
    },

    async listFloorsForProjectIds(projectIds) {
      if (projectIds.length === 0) return [];
      const documents = await FloorModel.find({ projectId: { $in: projectIds } })
        .sort({ projectId: 1, order: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapFloor);
    },

    async listKpiTasksForPeriod(ownerIds, periodStartAt, periodEndAt, limit) {
      const query = TaskModel.find(
        kpiTaskFilter(ownerIds, periodStartAt, periodEndAt)
      )
        .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapTask);
    },

    async pageKpiTasksForPeriod(
      ownerIds,
      periodStartAt,
      periodEndAt,
      pagination
    ) {
      const filter = kpiTaskFilter(ownerIds, periodStartAt, periodEndAt);
      const [documents, total] = await Promise.all([
        TaskModel.find(filter)
          .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        TaskModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapTask), total };
    },

    async updateTask(id, expectedVersion, change) {
      const currentQuery = TaskModel.findById(id);
      if (session) currentQuery.session(session);
      const current = await currentQuery.lean().exec();
      if (!current) throw new RepositoryNotFoundError(`Task ${id} was not found.`);
      if ((current.__v ?? 0) + 1 !== expectedVersion) {
        throw new RepositoryConflictError(
          `Task ${id} has version ${(current.__v ?? 0) + 1}, expected ${expectedVersion}.`
        );
      }

      const status = change.status ?? current.status;
      const completedAt =
        status === "completed"
          ? change.completedAt === undefined
            ? current.completedAt
            : change.completedAt
          : null;
      if (status === "completed" && !completedAt) {
        throw new RepositoryConflictError("Completed tasks require completedAt.");
      }

      const set: PlainDocument = {
        ...change,
        status,
        completedAt: completedAt ? date(completedAt) : null
      };
      if (change.currentDeadlineAt) set.currentDeadlineAt = date(change.currentDeadlineAt);
      if (change.latestUpdateAt) set.latestUpdateAt = date(change.latestUpdateAt);

      const updateQuery = TaskModel.findOneAndUpdate(
        { _id: id, __v: expectedVersion - 1 },
        { $set: set, $inc: { __v: 1 } },
        { new: true, runValidators: true }
      );
      if (session) updateQuery.session(session);
      const updated = await updateQuery.lean().exec();
      if (!updated) {
        throw new RepositoryConflictError(`Task ${id} was updated concurrently.`);
      }
      return mapTask(updated);
    },

    async appendTaskEvent(input) {
      const document = await createMongoDocument("Task event", () =>
        createDocument(TaskEventModel, {
          ...input,
          _id: input.id ?? randomUUID(),
          id: undefined,
          occurredAt: date(input.occurredAt),
          createdAt: input.createdAt ? date(input.createdAt) : undefined,
          note: input.note ?? null
        }, session)
      );
      return mapTaskEvent(document.toObject());
    },

    async listTaskEvents(taskId) {
      const documents = await TaskEventModel.find({ taskId })
        .sort({ occurredAt: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapTaskEvent);
    },

    async listRecentTaskEvents(taskIds, limit) {
      if (!taskIds.length || limit <= 0) return [];
      const query = TaskEventModel.find({ taskId: { $in: taskIds } })
        .sort({ occurredAt: -1, _id: -1 })
        .limit(limit);
      if (session) query.session(session);
      const documents = await query.lean().exec();
      return documents.map(mapTaskEvent);
    },

    async pageTaskEvents(taskId, pagination, sort = "asc") {
      const filter = { taskId };
      const direction = sort === "desc" ? -1 : 1;
      const [documents, total] = await Promise.all([
        TaskEventModel.find(filter)
          .sort({ occurredAt: direction, _id: direction })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        TaskEventModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapTaskEvent), total };
    },

    async listKpiTaskEventsForPeriod(
      taskId,
      actorId,
      periodStartAt,
      periodEndAt
    ) {
      const documents = await TaskEventModel.find(
        kpiTaskEventFilter(taskId, actorId, periodStartAt, periodEndAt)
      )
        .sort({ occurredAt: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapTaskEvent);
    },

    async pageKpiTaskEventsForPeriod(
      taskId,
      actorId,
      periodStartAt,
      periodEndAt,
      pagination
    ) {
      const filter = kpiTaskEventFilter(
        taskId,
        actorId,
        periodStartAt,
        periodEndAt
      );
      const [documents, total] = await Promise.all([
        TaskEventModel.find(filter)
          .sort({ occurredAt: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        TaskEventModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapTaskEvent), total };
    },

    async listKpiTaskEventsForTasks(
      taskOwners,
      periodStartAt,
      periodEndAt,
      limit
    ) {
      if (taskOwners.length === 0) return [];
      const events: TaskEventRecord[] = [];
      const pairBatchSize = 100;
      for (
        let offset = 0;
        offset < taskOwners.length;
        offset += pairBatchSize
      ) {
        if (events.length >= limit) break;
        const batch = taskOwners.slice(offset, offset + pairBatchSize);
        const documents = await TaskEventModel.find({
          $or: batch.map((task) => ({
            taskId: task.id,
            actorId: task.ownerId
          })),
          type: { $in: ["status_changed", "progress_changed", "note_added"] },
          occurredAt: { $gte: date(periodStartAt), $lte: date(periodEndAt) }
        })
          .sort({ occurredAt: 1, _id: 1 })
          .limit(limit - events.length)
          .lean()
          .exec();
        events.push(...documents.map(mapTaskEvent));
      }
      return events
        .sort((left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) ||
          left.id.localeCompare(right.id)
        )
        .slice(0, limit);
    },

    async createDesignVersion(input) {
      const document = await createMongoDocument("Design version", () =>
        createDocument(DesignVersionModel, {
          ...designVersionForMongo(input),
          _id: input.id ?? randomUUID()
        }, session)
      );
      return mapDesignVersion(document.toObject());
    },

    async createNextDesignVersion(input) {
      const target = {
        projectId: input.projectId,
        floorId: input.floorId,
        stageId: input.stageId,
        taskId: input.taskId
      };
      const latestQuery = DesignVersionModel.findOne(target)
        .sort({ versionNumber: -1 })
        .select({ versionNumber: 1 })
        .lean();
      if (session) latestQuery.session(session);
      const latest = await latestQuery.exec();
      const baseline = latest?.versionNumber ?? 0;
      const sequenceQuery = DesignVersionSequenceModel.findOneAndUpdate(
        { _id: designVersionSequenceKey(target) },
        [
          {
            $set: {
              nextNumber: {
                $add: [
                  {
                    $max: [
                      { $ifNull: ["$nextNumber", baseline] },
                      baseline
                    ]
                  },
                  1
                ]
              }
            }
          }
        ],
        { upsert: true, new: true }
      );
      if (session) sequenceQuery.session(session);
      const sequence = await sequenceQuery.lean().exec();
      if (!sequence) {
        throw new Error("Design version sequence allocation failed.");
      }
      return repository.createDesignVersion({
        ...input,
        versionNumber: sequence.nextNumber
      });
    },

    async findDesignVersionById(id) {
      const query = DesignVersionModel.findById(id);
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapDesignVersion(document) : null;
    },

    async listDesignVersions(projectId, limit) {
      const query = DesignVersionModel.find({ projectId })
        .sort({ floorId: 1, stageId: 1, versionNumber: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      if (session) query.session(session);
      const documents = await query.lean().exec();
      return documents.map(mapDesignVersion);
    },

    async listDesignVersionsForTaskIds(taskIds, limit) {
      if (taskIds.length === 0) return [];
      const query = DesignVersionModel.find({ taskId: { $in: taskIds } })
        .sort({ taskId: 1, versionNumber: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapDesignVersion);
    },

    async listLatestClientVisibleDesignVersions(projectIds) {
      if (!projectIds.length) return [];
      const pipeline: PipelineStage[] = [
        { $match: { projectId: { $in: projectIds }, approvalStatus: "approved", clientVisible: true } },
        { $sort: { projectId: 1 as const, approvedAt: -1 as const, uploadedAt: -1 as const, _id: -1 as const } },
        { $group: { _id: "$projectId", version: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$version" } },
        { $sort: { projectId: 1 as const } }
      ];
      const aggregate = DesignVersionModel.aggregate(pipeline);
      if (session) aggregate.session(session);
      return (await aggregate.exec()).map(mapDesignVersion);
    },

    async pageDesignVersions(filters, pagination) {
      const filter = compactFilter(filters);
      const documentsQuery = DesignVersionModel.find(filter)
        .sort({ uploadedAt: 1, _id: 1 })
        .skip(pagination.offset)
        .limit(pagination.limit)
        .lean();
      const countQuery = DesignVersionModel.countDocuments(filter);
      if (session) {
        documentsQuery.session(session);
        countQuery.session(session);
      }
      const [documents, total] = await Promise.all([
        documentsQuery.exec(),
        countQuery.exec()
      ]);
      return { items: documents.map(mapDesignVersion), total };
    },

    async updateDesignVersion(id, change) {
      const set: PlainDocument = { ...change };
      if (change.approvedAt !== undefined) {
        set.approvedAt = change.approvedAt ? date(change.approvedAt) : null;
      }
      const document = await DesignVersionModel.findByIdAndUpdate(
        id,
        { $set: set },
        { new: true, runValidators: true }
      );
      if (session) document.session(session);
      const updated = await document.lean().exec();
      if (!updated) {
        throw new RepositoryNotFoundError(`Design version ${id} was not found.`);
      }
      return mapDesignVersion(updated);
    },

    async createEvaluation(input) {
      const document = await createMongoDocument("Evaluation", () =>
        createDocument(EvaluationModel, {
          ...input,
          _id: input.id ?? randomUUID(),
          id: undefined,
          revisionOf: input.revisionOf ?? null,
          periodStartAt: date(input.periodStartAt),
          periodEndAt: date(input.periodEndAt),
          createdAt: input.createdAt ? date(input.createdAt) : undefined
        }, session)
      );
      return mapEvaluation(document.toObject());
    },

    async listEvaluationsForSubject(subjectUserId) {
      const documents = await EvaluationModel.find({ subjectUserId })
        .sort({ createdAt: -1, _id: -1 })
        .lean()
        .exec();
      return documents.map(mapEvaluation);
    },

    async listEvaluationsForSubjectIds(subjectUserIds, limit) {
      if (subjectUserIds.length === 0) return [];
      const query = EvaluationModel.find({
        subjectUserId: { $in: subjectUserIds }
      })
        .sort({ createdAt: -1, _id: -1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapEvaluation);
    },

    async pageEvaluationsForSubject(subjectUserId, pagination) {
      const filter = { subjectUserId };
      const [documents, total] = await Promise.all([
        EvaluationModel.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        EvaluationModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapEvaluation), total };
    },

    async appendAuditEvent(input) {
      const document = await createMongoDocument("Audit event", () =>
        createDocument(AuditEventModel, {
          ...input,
          _id: input.id ?? randomUUID(),
          id: undefined,
          occurredAt: date(input.occurredAt),
          createdAt: input.createdAt ? date(input.createdAt) : undefined,
          reason: input.reason ?? null
        }, session)
      );
      return mapAuditEvent(document.toObject());
    },

    async listAuditEvents(filters) {
      const documents = await AuditEventModel.find(auditFilter(filters))
        .sort(filters.sort === "desc" ? { occurredAt: -1, _id: -1 } : { occurredAt: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapAuditEvent);
    },

    async pageAuditEvents(filters, pagination) {
      const filter = auditFilter(filters);
      const [documents, total] = await Promise.all([
        AuditEventModel.find(filter)
          .sort(filters.sort === "desc" ? { occurredAt: -1, _id: -1 } : { occurredAt: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        AuditEventModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapAuditEvent), total };
    }
  };
  return repository;
}

async function createDocument(
  model: Model<any>,
  input: PlainDocument,
  session?: ClientSession
) {
  if (!session) return model.create(input);
  const documents = await model.create([input], { session });
  return documents[0]!;
}

async function createMongoDocument<T>(
  label: string,
  create: () => Promise<T>
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      throw new RepositoryConflictError(`${label} already exists.`);
    }
    throw error;
  }
}

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function compactFilter(value: object): PlainDocument {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );
}

function designVersionSequenceKey(target: {
  projectId: string;
  floorId: string;
  stageId: string;
  taskId: string | null;
}) {
  return [
    target.projectId,
    target.floorId,
    target.stageId,
    target.taskId ?? "-"
  ]
    .map(encodeURIComponent)
    .join(":");
}

function kpiTaskFilter(
  ownerIds: string[],
  periodStartAt: string,
  periodEndAt: string
): PlainDocument {
  const periodStart = date(periodStartAt);
  const periodEnd = date(periodEndAt);
  return {
    ownerId: { $in: ownerIds },
    $or: [
      {
        plannedStartAt: { $lte: periodEnd },
        currentDeadlineAt: { $gte: periodStart }
      },
      { completedAt: { $gte: periodStart, $lte: periodEnd } }
    ]
  };
}

function kpiTaskEventFilter(
  taskId: string,
  actorId: string,
  periodStartAt: string,
  periodEndAt: string
): PlainDocument {
  return {
    taskId,
    actorId,
    type: { $in: ["status_changed", "progress_changed", "note_added"] },
    occurredAt: {
      $gte: date(periodStartAt),
      $lte: date(periodEndAt)
    }
  };
}

function auditFilter(filters: AuditFilters): PlainDocument {
  const filter = compactFilter({
    actorId: filters.actorId,
    entityType: filters.entityType,
    entityId: filters.entityId
  });
  if (filters.entityIds !== undefined) filter.entityId = { $in: filters.entityIds };
  if (
    filters.visibleActorIds !== undefined ||
    filters.visibleTaskIds !== undefined
  ) {
    filter.$or = [
      { actorId: { $in: filters.visibleActorIds ?? [] } },
      {
        entityType: "task",
        entityId: { $in: filters.visibleTaskIds ?? [] }
      }
    ];
  }
  return filter;
}

function date(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function iso(value: string | Date): string {
  return date(value).toISOString();
}

function nullableIso(value: string | Date | null | undefined): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function idOf(document: PlainDocument): string {
  return String(document._id);
}

function mapUser(document: PlainDocument): UserRecord {
  return {
    id: idOf(document),
    name: document.name,
    email: document.email,
    passwordHash: document.passwordHash,
    role: document.role,
    active: document.active,
    managerId: document.managerId ?? null,
    authorizedClientIds: [...(document.authorizedClientIds ?? [])],
    ...(document.avatar ? { avatar: document.avatar } : {}),
    ...(document.title ? { title: document.title } : {}),
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapProject(document: PlainDocument): ProjectRecord {
  return {
    id: idOf(document),
    name: document.name,
    clientId: document.clientId,
    initiatingDesignerId: document.initiatingDesignerId,
    assignedDesignerIds: [...document.assignedDesignerIds],
    managerId: document.managerId,
    status: document.status,
    location: document.location,
    plannedStartAt: iso(document.plannedStartAt),
    plannedEndAt: iso(document.plannedEndAt),
    actualStartAt: nullableIso(document.actualStartAt),
    actualEndAt: nullableIso(document.actualEndAt),
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapFloor(document: PlainDocument): FloorRecord {
  return {
    id: idOf(document),
    projectId: document.projectId,
    name: document.name,
    number: document.number,
    order: document.order,
    progress: document.progress,
    plannedStartAt: iso(document.plannedStartAt),
    plannedEndAt: iso(document.plannedEndAt),
    actualStartAt: nullableIso(document.actualStartAt),
    actualEndAt: nullableIso(document.actualEndAt),
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapStage(document: PlainDocument): DesignStageRecord {
  return {
    id: idOf(document),
    projectId: document.projectId,
    floorId: document.floorId,
    name: document.name,
    type: document.type,
    order: document.order,
    dependencyStageIds: [...document.dependencyStageIds],
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapTask(document: PlainDocument): TaskRecord {
  const base = {
    id: idOf(document),
    projectId: document.projectId,
    floorId: document.floorId,
    stageId: document.stageId,
    title: document.title,
    description: document.description,
    order: document.order,
    ownerId: document.ownerId,
    plannedStartAt: iso(document.plannedStartAt),
    originalDeadlineAt: iso(document.originalDeadlineAt),
    currentDeadlineAt: iso(document.currentDeadlineAt),
    plannedEffort: document.plannedEffort ?? null,
    progress: document.progress,
    dependencyTaskIds: [...document.dependencyTaskIds],
    latestUpdateAt: nullableIso(document.latestUpdateAt),
    ...(document.wasYellow === undefined ? {} : { wasYellow: document.wasYellow }),
    ...(document.approvalVersion === undefined
      ? {}
      : { approvalVersion: document.approvalVersion }),
    ...(document.approvalStatus === undefined
      ? {}
      : { approvalStatus: document.approvalStatus }),
    ...(document.revisionCount === undefined
      ? {}
      : { revisionCount: document.revisionCount }),
    ...(document.hasReview === undefined ? {} : { hasReview: document.hasReview }),
    ...(document.updateEvents === undefined
      ? {}
      : {
          updateEvents: document.updateEvents.map((event: PlainDocument) => ({
            occurredAt: iso(event.occurredAt)
          }))
        }),
    version: (document.__v ?? 0) + 1,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };

  return document.status === "completed"
    ? {
        ...base,
        status: "completed",
        completedAt: iso(document.completedAt)
      }
    : {
        ...base,
        status: document.status,
        completedAt: null
      };
}

function mapTaskEvent(document: PlainDocument): TaskEventRecord {
  return {
    id: idOf(document),
    taskId: document.taskId,
    actorId: document.actorId,
    type: document.type,
    occurredAt: iso(document.occurredAt),
    from: structuredClone(document.from),
    to: structuredClone(document.to),
    note: document.note ?? null,
    createdAt: iso(document.createdAt)
  };
}

function mapDesignVersion(document: PlainDocument): DesignVersionRecord {
  return {
    id: idOf(document),
    projectId: document.projectId,
    floorId: document.floorId,
    stageId: document.stageId,
    taskId: document.taskId ?? null,
    versionNumber: document.versionNumber,
    originalFilename: document.originalFilename,
    storedFileReference: document.storedFileReference,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    uploaderId: document.uploaderId,
    uploadedAt: iso(document.uploadedAt),
    approvalStatus: document.approvalStatus,
    reviewerId: document.reviewerId ?? null,
    approvedAt: nullableIso(document.approvedAt),
    clientVisible: document.clientVisible,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapEvaluation(document: PlainDocument): EvaluationRecord {
  return {
    id: idOf(document),
    subjectUserId: document.subjectUserId,
    evaluatorUserId: document.evaluatorUserId,
    evaluatorRole: document.evaluatorRole,
    periodStartAt: iso(document.periodStartAt),
    periodEndAt: iso(document.periodEndAt),
    score: document.score,
    comments: document.comments,
    revisionOf: document.revisionOf ?? null,
    createdAt: iso(document.createdAt)
  };
}

function mapAuditEvent(document: PlainDocument): AuditEventRecord {
  return {
    id: idOf(document),
    actorId: document.actorId,
    action: document.action,
    entityType: document.entityType,
    entityId: document.entityId,
    occurredAt: iso(document.occurredAt),
    oldValues: structuredClone(document.oldValues),
    newValues: structuredClone(document.newValues),
    reason: document.reason ?? null,
    createdAt: iso(document.createdAt)
  };
}

function projectForMongo(input: ProjectRecord): PlainDocument {
  return {
    ...input,
    id: undefined,
    plannedStartAt: date(input.plannedStartAt),
    plannedEndAt: date(input.plannedEndAt),
    actualStartAt: input.actualStartAt ? date(input.actualStartAt) : null,
    actualEndAt: input.actualEndAt ? date(input.actualEndAt) : null,
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function floorForMongo(input: FloorRecord): PlainDocument {
  return {
    ...input,
    id: undefined,
    plannedStartAt: date(input.plannedStartAt),
    plannedEndAt: date(input.plannedEndAt),
    actualStartAt: input.actualStartAt ? date(input.actualStartAt) : null,
    actualEndAt: input.actualEndAt ? date(input.actualEndAt) : null,
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function taskForMongo(input: TaskRecord): PlainDocument {
  return {
    ...input,
    id: undefined,
    version: undefined,
    plannedStartAt: date(input.plannedStartAt),
    originalDeadlineAt: date(input.originalDeadlineAt),
    currentDeadlineAt: date(input.currentDeadlineAt),
    completedAt: input.completedAt ? date(input.completedAt) : null,
    latestUpdateAt: input.latestUpdateAt ? date(input.latestUpdateAt) : null,
    updateEvents: input.updateEvents?.map((event) => ({
      occurredAt: date(event.occurredAt)
    })),
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function designVersionForMongo(input: NewDesignVersion): PlainDocument {
  return {
    ...input,
    id: undefined,
    uploadedAt: date(input.uploadedAt),
    approvedAt: input.approvedAt ? date(input.approvedAt) : null,
    createdAt: input.createdAt ? date(input.createdAt) : undefined,
    updatedAt: input.updatedAt ? date(input.updatedAt) : undefined
  };
}
