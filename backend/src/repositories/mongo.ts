import { randomUUID } from "node:crypto";
import { AuditEventModel } from "../models/AuditEvent.js";
import { DesignStageModel } from "../models/DesignStage.js";
import { DesignVersionModel } from "../models/DesignVersion.js";
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

export function createMongoRepository(): AppRepository {
  return {
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

    async listProjectsForUser(user) {
      let query: PlainDocument = {};
      if (user.role === "client") query = { clientId: user.id };
      if (user.role === "designer") {
        query = {
          $or: [
            { initiatingDesignerId: user.id },
            { assignedDesignerIds: user.id }
          ]
        };
      }
      if (user.role === "design_manager") {
        const directReports = await UserModel.find({
          managerId: user.id,
          role: "designer"
        })
          .distinct("_id")
          .exec();
        query = {
          $or: [
            { managerId: user.id },
            { assignedDesignerIds: { $in: directReports } }
          ]
        };
      }
      const documents = await ProjectModel.find(query)
        .sort({ name: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapProject);
    },

    async findProjectById(id) {
      const document = await ProjectModel.findById(id).lean().exec();
      return document ? mapProject(document) : null;
    },

    async createProject(input) {
      const document = await createMongoDocument("Project", () =>
        ProjectModel.create({
          ...projectForMongo(input),
          _id: input.id
        })
      );
      return mapProject(document.toObject());
    },

    async createFloor(input) {
      const document = await createMongoDocument("Floor", () =>
        FloorModel.create({
          ...floorForMongo(input),
          _id: input.id
        })
      );
      return mapFloor(document.toObject());
    },

    async createDesignStage(input) {
      const document = await createMongoDocument("Design stage", () =>
        DesignStageModel.create({
          ...input,
          _id: input.id,
          id: undefined,
          createdAt: date(input.createdAt),
          updatedAt: date(input.updatedAt)
        })
      );
      return mapStage(document.toObject());
    },

    async createTask(input) {
      const document = await createMongoDocument("Task", () =>
        TaskModel.create({
          ...taskForMongo(input),
          _id: input.id,
          __v: input.version - 1
        })
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

    async findTaskById(id) {
      const document = await TaskModel.findById(id).lean().exec();
      return document ? mapTask(document) : null;
    },

    async listTasks(filters) {
      const documents = await TaskModel.find(compactFilter(filters))
        .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapTask);
    },

    async updateTask(id, expectedVersion, change) {
      const current = await TaskModel.findById(id).lean().exec();
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

      const updated = await TaskModel.findOneAndUpdate(
        { _id: id, __v: expectedVersion - 1 },
        { $set: set, $inc: { __v: 1 } },
        { new: true, runValidators: true }
      )
        .lean()
        .exec();
      if (!updated) {
        throw new RepositoryConflictError(`Task ${id} was updated concurrently.`);
      }
      return mapTask(updated);
    },

    async appendTaskEvent(input) {
      const document = await createMongoDocument("Task event", () =>
        TaskEventModel.create({
          ...input,
          _id: input.id ?? randomUUID(),
          id: undefined,
          occurredAt: date(input.occurredAt),
          createdAt: input.createdAt ? date(input.createdAt) : undefined,
          note: input.note ?? null
        })
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

    async createDesignVersion(input) {
      const document = await createMongoDocument("Design version", () =>
        DesignVersionModel.create({
          ...designVersionForMongo(input),
          _id: input.id ?? randomUUID()
        })
      );
      return mapDesignVersion(document.toObject());
    },

    async findDesignVersionById(id) {
      const document = await DesignVersionModel.findById(id).lean().exec();
      return document ? mapDesignVersion(document) : null;
    },

    async listDesignVersions(projectId) {
      const documents = await DesignVersionModel.find({ projectId })
        .sort({ floorId: 1, stageId: 1, versionNumber: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapDesignVersion);
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
      )
        .lean()
        .exec();
      if (!document) {
        throw new RepositoryNotFoundError(`Design version ${id} was not found.`);
      }
      return mapDesignVersion(document);
    },

    async createEvaluation(input) {
      const document = await createMongoDocument("Evaluation", () =>
        EvaluationModel.create({
          ...input,
          _id: input.id ?? randomUUID(),
          id: undefined,
          revisionOf: input.revisionOf ?? null,
          periodStartAt: date(input.periodStartAt),
          periodEndAt: date(input.periodEndAt),
          createdAt: input.createdAt ? date(input.createdAt) : undefined
        })
      );
      return mapEvaluation(document.toObject());
    },

    async listEvaluationsForSubject(subjectUserId) {
      const documents = await EvaluationModel.find({ subjectUserId })
        .sort({ createdAt: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapEvaluation);
    },

    async appendAuditEvent(input) {
      const document = await createMongoDocument("Audit event", () =>
        AuditEventModel.create({
          ...input,
          _id: input.id ?? randomUUID(),
          id: undefined,
          occurredAt: date(input.occurredAt),
          createdAt: input.createdAt ? date(input.createdAt) : undefined,
          reason: input.reason ?? null
        })
      );
      return mapAuditEvent(document.toObject());
    },

    async listAuditEvents(filters) {
      const documents = await AuditEventModel.find(compactFilter(filters))
        .sort({ occurredAt: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapAuditEvent);
    }
  };
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
