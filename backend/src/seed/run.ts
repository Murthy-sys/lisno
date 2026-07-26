import { pathToFileURL } from "node:url";
import mongoose, { type Model } from "mongoose";
import { env } from "../config/env.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { DesignStageModel } from "../models/DesignStage.js";
import { DesignVersionModel } from "../models/DesignVersion.js";
import { EvaluationModel } from "../models/Evaluation.js";
import { FloorModel } from "../models/Floor.js";
import { ProjectModel } from "../models/Project.js";
import { TaskModel } from "../models/Task.js";
import { TaskEventModel } from "../models/TaskEvent.js";
import { UserModel } from "../models/User.js";
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
import { demoSeedData } from "./data.js";

type MongoRecord = Record<string, unknown>;

export async function seedMongoDatabase(): Promise<void> {
  await replaceAll(UserModel, demoSeedData.users, userDocument);
  await replaceAll(ProjectModel, demoSeedData.projects, projectDocument);
  await replaceAll(FloorModel, demoSeedData.floors, floorDocument);
  await replaceAll(DesignStageModel, demoSeedData.stages, stageDocument);
  await replaceAll(TaskModel, demoSeedData.tasks, taskDocument);
  await replaceAll(
    DesignVersionModel,
    demoSeedData.designVersions,
    designVersionDocument
  );
  await resetAppendOnlyHistoryForSeed(
    TaskEventModel,
    demoSeedData.taskEvents,
    taskEventDocument
  );
  await resetAppendOnlyHistoryForSeed(
    EvaluationModel,
    demoSeedData.evaluations,
    evaluationDocument
  );
  await resetAppendOnlyHistoryForSeed(
    AuditEventModel,
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
  await model.deleteMany({});
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

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  try {
    await seedMongoDatabase();
    process.stdout.write(
      `Seeded ${demoSeedData.users.length} users, ${demoSeedData.projects.length} projects, and ${demoSeedData.tasks.length} tasks.\n`
    );
  } finally {
    await mongoose.disconnect();
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
