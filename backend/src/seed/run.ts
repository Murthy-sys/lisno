import { pathToFileURL } from "node:url";
import type { Model } from "mongoose";
import type {
  AuditEventRecord,
  DesignStageRecord,
  DesignVersionRecord,
  EvaluationRecord,
  FloorRecord,
  ProjectRecord,
  TaskEventRecord,
  TaskRecord,
  UserRecord
} from "../repositories/types.js";
import {
  assertAuthorizedDemoSeedTarget,
  authorizeDemoSeed,
  loadDemoSeedEnvironment,
  type DemoSeedAuthorization,
  type LoadedDemoSeedEnvironment
} from "./config.js";
import { demoSeedData } from "./data.js";

type MongoRecord = Record<string, unknown>;

export interface SeedModels {
  user: Model<any>;
  project: Model<any>;
  floor: Model<any>;
  designStage: Model<any>;
  task: Model<any>;
  taskEvent: Model<any>;
  designVersion: Model<any>;
  designVersionSequence: Model<any>;
  evaluation: Model<any>;
  auditEvent: Model<any>;
  accessRequest: Model<any>;
  projectAccessGrant: Model<any>;
  authorizationCoordination: Model<any>;
}

interface SeedMongooseRuntime {
  connection: Model<any>["db"];
  connect(uri: string): Promise<unknown>;
  disconnect(): Promise<unknown>;
}

interface SeedDatabaseDependencies {
  loadMongoose?: () => Promise<Pick<SeedMongooseRuntime, "connection">>;
  loadModels?: () => Promise<SeedModels>;
}

interface DemoSeedCommandDependencies {
  loadEnvironment?: () => LoadedDemoSeedEnvironment;
  loadMongoose?: () => Promise<SeedMongooseRuntime>;
  loadModels?: () => Promise<SeedModels>;
  writeOutput?: (message: string) => void;
}

async function importMongoose(): Promise<SeedMongooseRuntime> {
  return (await import("mongoose")).default;
}

async function loadSeedModels(): Promise<SeedModels> {
  const [
    user,
    project,
    floor,
    designStage,
    task,
    taskEvent,
    designVersion,
    designVersionSequence,
    evaluation,
    auditEvent,
    accessRequest,
    projectAccessGrant,
    authorizationCoordination
  ] = await Promise.all([
    import("../models/User.js"),
    import("../models/Project.js"),
    import("../models/Floor.js"),
    import("../models/DesignStage.js"),
    import("../models/Task.js"),
    import("../models/TaskEvent.js"),
    import("../models/DesignVersion.js"),
    import("../models/DesignVersionSequence.js"),
    import("../models/Evaluation.js"),
    import("../models/AuditEvent.js"),
    import("../models/AccessRequest.js"),
    import("../models/ProjectAccessGrant.js"),
    import("../models/AuthorizationCoordination.js")
  ]);
  return {
    user: user.UserModel,
    project: project.ProjectModel,
    floor: floor.FloorModel,
    designStage: designStage.DesignStageModel,
    task: task.TaskModel,
    taskEvent: taskEvent.TaskEventModel,
    designVersion: designVersion.DesignVersionModel,
    designVersionSequence: designVersionSequence.DesignVersionSequenceModel,
    evaluation: evaluation.EvaluationModel,
    auditEvent: auditEvent.AuditEventModel,
    accessRequest: accessRequest.AccessRequestModel,
    projectAccessGrant: projectAccessGrant.ProjectAccessGrantModel,
    authorizationCoordination:
      authorizationCoordination.AuthorizationCoordinationModel
  };
}

export async function seedMongoDatabase(
  authorization: DemoSeedAuthorization,
  dependencies: SeedDatabaseDependencies = {}
): Promise<void> {
  const mongoose = await (dependencies.loadMongoose ?? importMongoose)();
  assertAuthorizedDemoSeedTarget(authorization, mongoose.connection.name);
  const models = await (dependencies.loadModels ?? loadSeedModels)();
  assertAuthorizedSeedModels(
    models,
    mongoose.connection,
    authorization.databaseName
  );
  await resetAuthorizedSeedCollections(models);
}

function assertAuthorizedSeedModels(
  models: SeedModels,
  connection: Model<any>["db"],
  authorizedDatabaseName: string
): void {
  if (
    Object.values(models).some(
      (model) =>
        model.db !== connection || model.db.name !== authorizedDatabaseName
    )
  ) {
    throw new Error("Demo seed models do not match the authorized connection.");
  }
}

async function resetAuthorizedSeedCollections(
  models: SeedModels
): Promise<void> {
  await Promise.all([
    models.user,
    models.project,
    models.floor,
    models.designStage,
    models.task,
    models.taskEvent,
    models.designVersion,
    models.designVersionSequence,
    models.evaluation,
    models.auditEvent,
    models.accessRequest,
    models.projectAccessGrant,
    models.authorizationCoordination
  ].map((model) => model.deleteMany({})));
  await replaceAll(models.user, demoSeedData.users, userDocument);
  await replaceAll(models.project, demoSeedData.projects, projectDocument);
  await replaceAll(models.floor, demoSeedData.floors, floorDocument);
  await replaceAll(models.designStage, demoSeedData.stages, stageDocument);
  await replaceAll(models.task, demoSeedData.tasks, taskDocument);
  await replaceAll(
    models.designVersion,
    demoSeedData.designVersions,
    designVersionDocument
  );
  await resetAppendOnlyHistoryForSeed(
    models.taskEvent,
    demoSeedData.taskEvents,
    taskEventDocument
  );
  await resetAppendOnlyHistoryForSeed(
    models.evaluation,
    demoSeedData.evaluations,
    evaluationDocument
  );
  await resetAppendOnlyHistoryForSeed(
    models.auditEvent,
    demoSeedData.auditEvents,
    auditEventDocument
  );
}

async function replaceAll<T extends { id: string }>(
  model: Model<any>,
  records: T[],
  serialize: (record: T) => MongoRecord
) {
  if (records.length === 0) return;
  await model.bulkWrite(
    records.map((record) => ({
      replaceOne: {
        filter: { _id: record.id },
        replacement: serialize(record),
        upsert: true,
        timestamps: false
      }
    }))
  );
}

async function resetAppendOnlyHistoryForSeed<T extends { id: string }>(
  model: Model<any>,
  records: T[],
  serialize: (record: T) => MongoRecord
) {
  if (records.length === 0) return;
  await model.insertMany(records.map(serialize), { timestamps: false });
}

function userDocument(record: UserRecord): MongoRecord {
  return {
    ...withoutId(record),
    _id: record.id,
    managerId: record.managerId,
    createdAt: date(record.createdAt),
    updatedAt: date(record.updatedAt)
  };
}

function projectDocument(record: ProjectRecord): MongoRecord {
  return {
    ...withoutId(record),
    _id: record.id,
    plannedStartAt: date(record.plannedStartAt),
    plannedEndAt: date(record.plannedEndAt),
    actualStartAt: nullableDate(record.actualStartAt),
    actualEndAt: nullableDate(record.actualEndAt),
    createdAt: date(record.createdAt),
    updatedAt: date(record.updatedAt)
  };
}

function floorDocument(record: FloorRecord): MongoRecord {
  return {
    ...withoutId(record),
    _id: record.id,
    plannedStartAt: date(record.plannedStartAt),
    plannedEndAt: date(record.plannedEndAt),
    actualStartAt: nullableDate(record.actualStartAt),
    actualEndAt: nullableDate(record.actualEndAt),
    createdAt: date(record.createdAt),
    updatedAt: date(record.updatedAt)
  };
}

function stageDocument(record: DesignStageRecord): MongoRecord {
  return {
    ...withoutId(record),
    _id: record.id,
    createdAt: date(record.createdAt),
    updatedAt: date(record.updatedAt)
  };
}

function taskDocument(record: TaskRecord): MongoRecord {
  return {
    ...withoutId(record),
    _id: record.id,
    plannedStartAt: date(record.plannedStartAt),
    originalDeadlineAt: date(record.originalDeadlineAt),
    currentDeadlineAt: date(record.currentDeadlineAt),
    completedAt: nullableDate(record.completedAt),
    latestUpdateAt: nullableDate(record.latestUpdateAt),
    updateEvents: record.updateEvents?.map((event) => ({
      occurredAt: date(event.occurredAt)
    })),
    __v: record.version - 1,
    version: undefined,
    createdAt: date(record.createdAt),
    updatedAt: date(record.updatedAt)
  };
}

function taskEventDocument(record: TaskEventRecord): MongoRecord {
  return {
    ...withoutId(record),
    _id: record.id,
    occurredAt: date(record.occurredAt),
    createdAt: date(record.createdAt)
  };
}

function designVersionDocument(record: DesignVersionRecord): MongoRecord {
  return {
    ...withoutId(record),
    _id: record.id,
    uploadedAt: date(record.uploadedAt),
    approvedAt: nullableDate(record.approvedAt),
    createdAt: date(record.createdAt),
    updatedAt: date(record.updatedAt)
  };
}

function evaluationDocument(record: EvaluationRecord): MongoRecord {
  return {
    ...withoutId(record),
    _id: record.id,
    periodStartAt: date(record.periodStartAt),
    periodEndAt: date(record.periodEndAt),
    createdAt: date(record.createdAt)
  };
}

function auditEventDocument(record: AuditEventRecord): MongoRecord {
  return {
    ...withoutId(record),
    _id: record.id,
    occurredAt: date(record.occurredAt),
    createdAt: date(record.createdAt)
  };
}

function withoutId<T extends { id: string }>(record: T): Omit<T, "id"> {
  const { id: _id, ...fields } = record;
  return fields;
}

function date(value: string): Date {
  return new Date(value);
}

function nullableDate(value: string | null): Date | null {
  return value ? date(value) : null;
}

export async function runDemoSeedCommand(
  dependencies: DemoSeedCommandDependencies = {}
): Promise<void> {
  const env = (dependencies.loadEnvironment ?? loadDemoSeedEnvironment)();
  const authorization = authorizeDemoSeed(env, env.MONGODB_URI);
  const mongoose = await (dependencies.loadMongoose ?? importMongoose)();
  await mongoose.connect(env.MONGODB_URI);
  try {
    await seedMongoDatabase(authorization, {
      loadMongoose: async () => mongoose,
      loadModels: dependencies.loadModels
    });
    (dependencies.writeOutput ?? process.stdout.write.bind(process.stdout))(
      `Seeded ${demoSeedData.users.length} users, ${demoSeedData.projects.length} projects, and ${demoSeedData.tasks.length} tasks.\n`
    );
  } finally {
    await mongoose.disconnect();
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  runDemoSeedCommand().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
