import { afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { DesignExtractionJobModel } from "../src/models/DesignExtractionJob.js";
import { DesignStageModel } from "../src/models/DesignStage.js";
import { DesignSectionRevisionModel } from "../src/models/DesignSectionRevision.js";
import { DesignSourcePageModel } from "../src/models/DesignSourcePage.js";
import { DesignVersionModel } from "../src/models/DesignVersion.js";
import { DesignVersionSequenceModel } from "../src/models/DesignVersionSequence.js";
import { EvaluationModel } from "../src/models/Evaluation.js";
import { FloorModel } from "../src/models/Floor.js";
import { ProjectModel } from "../src/models/Project.js";
import { TaskModel } from "../src/models/Task.js";
import { TaskEventModel } from "../src/models/TaskEvent.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { RepositoryConflictError } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Mongo repository contracts", () => {
  it("indexes extraction jobs, source pages, and section revisions by their natural keys", () => {
    const uniqueIndexes = (model: typeof DesignExtractionJobModel) =>
      model.schema
        .indexes()
        .filter(([, options]) => options.unique)
        .map(([fields]) => fields);

    expect(uniqueIndexes(DesignExtractionJobModel)).toContainEqual({
      designVersionId: 1
    });
    expect(uniqueIndexes(DesignSourcePageModel)).toContainEqual({
      designVersionId: 1,
      pageNumber: 1
    });
    expect(uniqueIndexes(DesignSectionRevisionModel)).toContainEqual({
      sectionId: 1,
      revisionNumber: 1
    });
  });

  it("enables Mongo update pipelines when allocating a design version number", async () => {
    const version = demoSeedData.designVersions[0]!;
    const { id: _id, versionNumber: _versionNumber, ...input } =
      structuredClone(version);
    vi.spyOn(DesignVersionModel, "findOne").mockReturnValueOnce({
      sort: () => ({
        select: () => ({
          lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
        })
      })
    } as never);
    const allocate = vi
      .spyOn(DesignVersionSequenceModel, "findOneAndUpdate")
      .mockReturnValueOnce({
        lean: () => ({
          exec: vi.fn().mockResolvedValue({ nextNumber: 1 })
        })
      } as never);
    const repository = createMongoRepository();
    vi.spyOn(repository, "createDesignVersion").mockResolvedValueOnce({
      ...version,
      id: "version-allocated",
      versionNumber: 1
    });

    await repository.createNextDesignVersion(input);

    expect(allocate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.objectContaining({ updatePipeline: true })
    );
  });

  it("accepts the API default empty task description", async () => {
    const task = demoSeedData.tasks[0]!;
    const document = new TaskModel({
      ...structuredClone(task),
      _id: "task-without-description",
      description: ""
    });

    await expect(document.validate()).resolves.toBeUndefined();
  });

  it("normalizes a duplicate design-version tuple into a repository conflict", async () => {
    vi.spyOn(DesignVersionModel, "create").mockRejectedValueOnce(
      Object.assign(new Error("E11000 duplicate key error"), { code: 11000 })
    );
    const repository = createMongoRepository();
    const existing = demoSeedData.designVersions[0]!;

    await expect(
      repository.createDesignVersion({
        ...structuredClone(existing),
        id: "version-duplicate-tuple"
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("defines floor order as unique within a project", () => {
    const uniqueIndexes = FloorModel.schema
      .indexes()
      .filter(([, options]) => options.unique)
      .map(([fields]) => fields);

    expect(uniqueIndexes).toEqual([{ projectId: 1, order: 1 }]);
  });

  it("uses a bounded grouped aggregation for latest client-visible versions", async () => {
    const version = demoSeedData.designVersions[0]!;
    const aggregate = vi.spyOn(DesignVersionModel, "aggregate").mockReturnValueOnce({
      exec: vi.fn().mockResolvedValue([{ ...version, _id: version.id, uploadedAt: new Date(version.uploadedAt), approvedAt: new Date(version.approvedAt!), createdAt: new Date(version.createdAt), updatedAt: new Date(version.updatedAt) }])
    } as never);
    const find = vi.spyOn(DesignVersionModel, "find");

    const results = await createMongoRepository().listLatestClientVisibleDesignVersions(["project-aurora-villa", "project-aurora-studio"]);

    expect(find).not.toHaveBeenCalled();
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { projectId: { $in: ["project-aurora-villa", "project-aurora-studio"] }, approvalStatus: "approved", clientVisible: true } },
      { $sort: { projectId: 1, approvedAt: -1, uploadedAt: -1, _id: -1 } },
      { $group: { _id: "$projectId", version: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$version" } },
      { $sort: { projectId: 1 } }
    ]);
    expect(results).toMatchObject([{ id: version.id, projectId: version.projectId }]);
  });

  it("indexes the client latest-version query fields and deterministic sort", () => {
    expect(DesignVersionModel.schema.indexes().map(([fields]) => fields)).toContainEqual({ projectId: 1, approvalStatus: 1, clientVisible: 1, approvedAt: -1, uploadedAt: -1, _id: -1 });
  });

  it("marks every task-event history field immutable", () => {
    const historyFields = [
      "taskId",
      "actorId",
      "type",
      "occurredAt",
      "from",
      "to",
      "note"
    ];

    expect(
      Object.fromEntries(
        historyFields.map((field) => [
          field,
          TaskEventModel.schema.path(field).options.immutable
        ])
      )
    ).toEqual({
      taskId: true,
      actorId: true,
      type: true,
      occurredAt: true,
      from: true,
      to: true,
      note: true
    });
  });

  it("runs evaluation writes with the active Mongo transaction session", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) =>
        operation()
      ),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    const evaluation = demoSeedData.evaluations[0]!;
    const create = vi.spyOn(EvaluationModel, "create").mockResolvedValueOnce([
      {
        toObject: () => ({
          ...evaluation,
          _id: evaluation.id,
          periodStartAt: new Date(evaluation.periodStartAt),
          periodEndAt: new Date(evaluation.periodEndAt),
          createdAt: new Date(evaluation.createdAt)
        })
      }
    ] as never);

    const result = await createMongoRepository().runInTransaction((transaction) =>
      transaction.createEvaluation(evaluation)
    );

    expect(result.id).toBe(evaluation.id);
    expect(create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          _id: evaluation.id,
          subjectUserId: evaluation.subjectUserId
        })
      ],
      { session }
    );
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it("runs every workflow entity create with the active Mongo transaction session", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) =>
        operation()
      ),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    const project = demoSeedData.projects[0]!;
    const floor = demoSeedData.floors[0]!;
    const stage = demoSeedData.stages[0]!;
    const task = demoSeedData.tasks[0]!;
    const document = (record: { id: string; version?: number }) => ({
      toObject: () => ({
        ...record,
        _id: record.id,
        __v: (record.version ?? 1) - 1
      })
    });
    const projectCreate = vi
      .spyOn(ProjectModel, "create")
      .mockResolvedValueOnce([document(project)] as never);
    const floorCreate = vi
      .spyOn(FloorModel, "create")
      .mockResolvedValueOnce([document(floor)] as never);
    const stageCreate = vi
      .spyOn(DesignStageModel, "create")
      .mockResolvedValueOnce([document(stage)] as never);
    const taskCreate = vi
      .spyOn(TaskModel, "create")
      .mockResolvedValueOnce([document(task)] as never);

    await createMongoRepository().runInTransaction(async (transaction) => {
      await transaction.createProject(project);
      await transaction.createFloor(floor);
      await transaction.createDesignStage(stage);
      await transaction.createTask(task);
    });

    for (const [create, record] of [
      [projectCreate, project],
      [floorCreate, floor],
      [stageCreate, stage],
      [taskCreate, task]
    ] as const) {
      expect(create).toHaveBeenCalledWith(
        [expect.objectContaining({ _id: record.id })],
        { session }
      );
    }
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });
});
