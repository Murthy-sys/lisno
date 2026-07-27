import { afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { DesignExtractionJobModel } from "../src/models/DesignExtractionJob.js";
import { DesignSectionModel } from "../src/models/DesignSection.js";
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
import {
  RepositoryConflictError,
  RepositoryNotFoundError
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const query = (value: unknown) => ({
  session: () => undefined,
  exec: vi.fn().mockResolvedValue(value)
});

const validReplacement = (workerResultId = "result-1") => ({
  jobId: "job-replace",
  claimId: "claim-replace",
  processedAt: "2026-07-27T10:02:00.000Z",
  designVersionId: "version-replace",
  workerResultId,
  sourcePages: [
    {
      id: "page-replace",
      designVersionId: "version-replace",
      pageNumber: 1,
      renderedFileReference: "page.png",
      width: 100,
      height: 100,
      createdAt: "2026-07-27T10:00:00.000Z",
      updatedAt: "2026-07-27T10:00:00.000Z"
    }
  ],
  sections: [
    {
      section: {
        id: "section-replace",
        designVersionId: "version-replace",
        sourcePageId: "page-replace",
        label: "Kitchen",
        active: true as const,
        source: "ocr" as const,
        ocrConfidence: 0.99,
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z"
      },
      revision: {
        id: "revision-replace",
        sectionId: "section-replace",
        revisionNumber: 1,
        sourcePageId: "page-replace",
        crop: { x: 0, y: 0, width: 10, height: 10 },
        croppedFileReference: "section.png",
        label: "Kitchen",
        reviewStatus: "draft" as const,
        submittedAt: null,
        reviewerId: null,
        reviewedAt: null,
        rejectionComment: null,
        createdAt: "2026-07-27T10:00:00.000Z"
      }
    }
  ]
});

const processingJob = (workerResultId: string | null = null) => ({
  _id: "job-replace",
  designVersionId: "version-replace",
  status: "processing",
  claimId: "claim-replace",
  leaseExpiresAt: new Date("2026-07-27T10:06:00.000Z"),
  workerResultId
});

const replacementWriteQuery = () => ({
  session: () => undefined,
  exec: vi.fn().mockResolvedValue(undefined)
});

const mockSuccessfulReplacement = (job = processingJob()) => {
  const deletePages = replacementWriteQuery();
  const deleteSections = replacementWriteQuery();
  const deleteRevisions = replacementWriteQuery();
  const updateJob = replacementWriteQuery();
  vi.spyOn(DesignExtractionJobModel, "findOne").mockReturnValueOnce({
    lean: () => query(job)
  } as never);
  vi.spyOn(DesignSectionModel, "find").mockReturnValueOnce({
    select: () => ({ lean: () => query([]) })
  } as never);
  vi.spyOn(DesignSectionRevisionModel, "exists").mockReturnValueOnce(
    query(null) as never
  );
  vi.spyOn(DesignSourcePageModel, "deleteMany").mockReturnValueOnce(
    deletePages as never
  );
  vi.spyOn(DesignSectionModel, "deleteMany").mockReturnValueOnce(
    deleteSections as never
  );
  vi.spyOn(DesignSectionRevisionModel, "deleteMany").mockReturnValueOnce(
    deleteRevisions as never
  );
  vi.spyOn(DesignSourcePageModel, "create").mockResolvedValueOnce([] as never);
  vi.spyOn(DesignSectionModel, "create").mockResolvedValueOnce([] as never);
  vi.spyOn(DesignSectionRevisionModel, "create").mockResolvedValueOnce([] as never);
  vi.spyOn(DesignExtractionJobModel, "updateOne").mockReturnValueOnce(
    updateJob as never
  );
  return { deletePages, deleteSections, deleteRevisions, updateJob };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Mongo repository contracts", () => {
  it("rejects a stale extraction completion with the current-lease filter", async () => {
    const update = vi.spyOn(DesignExtractionJobModel, "findByIdAndUpdate").mockReturnValueOnce({
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    } as never);
    vi.spyOn(DesignExtractionJobModel, "exists").mockReturnValueOnce(
      { exec: vi.fn().mockResolvedValue({ _id: "job-stale" }) } as never
    );

    await expect(
      createMongoRepository().completeExtractionJob(
        "job-stale",
        "old-claim",
        "2026-07-27T10:03:00.000Z"
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "job-stale",
        status: "processing",
        claimId: "old-claim",
        leaseExpiresAt: { $gt: new Date("2026-07-27T10:03:00.000Z") }
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("distinguishes a missing extraction job from a stale completion claim", async () => {
    vi.spyOn(DesignExtractionJobModel, "findByIdAndUpdate").mockReturnValueOnce({
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    } as never);
    vi.spyOn(DesignExtractionJobModel, "exists").mockReturnValueOnce(
      { exec: vi.fn().mockResolvedValue(null) } as never
    );

    await expect(
      createMongoRepository().completeExtractionJob(
        "job-missing",
        "claim-missing",
        "2026-07-27T10:03:00.000Z"
      )
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it("distinguishes a missing extraction job from a stale failure claim", async () => {
    vi.spyOn(DesignExtractionJobModel, "findByIdAndUpdate").mockReturnValueOnce({
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    } as never);
    vi.spyOn(DesignExtractionJobModel, "exists").mockReturnValueOnce(
      { exec: vi.fn().mockResolvedValue(null) } as never
    );

    await expect(
      createMongoRepository().failExtractionJob(
        "job-missing",
        "claim-missing",
        "OCR_FAILED",
        "OCR failed",
        "2026-07-27T10:03:00.000Z"
      )
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it("runs draft-state verification and section update in one Mongo transaction", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    vi.spyOn(DesignSectionRevisionModel, "findOne").mockReturnValueOnce({
      sort: () => ({ lean: () => query({ _id: "revision-draft", reviewStatus: "draft", label: "Before" }) })
    } as never);
    const guard = vi.spyOn(DesignSectionRevisionModel, "updateOne").mockReturnValueOnce(
      query({ matchedCount: 1, modifiedCount: 1 }) as never
    );
    const update = vi.spyOn(DesignSectionModel, "findByIdAndUpdate").mockReturnValueOnce({
      session: () => undefined,
      lean: () => ({
        exec: vi.fn().mockResolvedValue({
          _id: "section-draft",
          designVersionId: "version-draft",
          sourcePageId: "page-draft",
          label: "Changed",
          active: true,
          source: "manual",
          ocrConfidence: null,
          createdAt: new Date("2026-07-27T10:00:00.000Z"),
          updatedAt: new Date("2026-07-27T10:01:00.000Z")
        })
      })
    } as never);

    await expect(
      createMongoRepository().updateDraftSection("section-draft", { label: "Changed" })
    ).resolves.toMatchObject({ label: "Changed" });
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(guard).toHaveBeenCalledWith(
      { _id: "revision-draft", reviewStatus: "draft" },
      { $set: { label: "Changed" } }
    );
    expect(update).toHaveBeenCalledOnce();
  });

  it("rejects a concurrent Mongo draft-review transition before updating the section", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    vi.spyOn(DesignSectionRevisionModel, "findOne").mockReturnValueOnce({
      sort: () => ({
        lean: () => query({ _id: "revision-raced", reviewStatus: "draft", label: "Before" })
      })
    } as never);
    vi.spyOn(DesignSectionRevisionModel, "updateOne").mockReturnValueOnce(
      query({ matchedCount: 0, modifiedCount: 0 }) as never
    );
    const updateSection = vi.spyOn(DesignSectionModel, "findByIdAndUpdate").mockReturnValueOnce({
      session: () => undefined,
      lean: () => ({
        exec: vi.fn().mockResolvedValue({
          _id: "section-raced",
          designVersionId: "version-raced",
          sourcePageId: "page-raced",
          label: "Changed",
          active: true,
          source: "manual",
          ocrConfidence: null,
          createdAt: new Date("2026-07-27T10:00:00.000Z"),
          updatedAt: new Date("2026-07-27T10:01:00.000Z")
        })
      })
    } as never);

    await expect(
      createMongoRepository().updateDraftSection("section-raced", { label: "Changed" })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    expect(updateSection).not.toHaveBeenCalled();
  });

  it("persists a valid Mongo extraction draft as one replacement", async () => {
    const writes = mockSuccessfulReplacement();

    await expect(
      createMongoRepository({} as never).replaceExtractionDraft(validReplacement())
    ).resolves.toBeUndefined();
    expect(writes.deletePages.exec).toHaveBeenCalledOnce();
    expect(writes.deleteSections.exec).toHaveBeenCalledOnce();
    expect(writes.deleteRevisions.exec).toHaveBeenCalledOnce();
    expect(writes.updateJob.exec).toHaveBeenCalledOnce();
  });

  it("treats only the exact Mongo worker result ID as a replacement replay", async () => {
    vi.spyOn(DesignExtractionJobModel, "findOne").mockReturnValueOnce({
      lean: () => query(processingJob("result-1"))
    } as never);
    const sections = vi.spyOn(DesignSectionModel, "find");

    await expect(
      createMongoRepository({} as never).replaceExtractionDraft(validReplacement("result-1"))
    ).resolves.toBeUndefined();
    expect(sections).not.toHaveBeenCalled();
  });

  it("replaces a Mongo draft when a current worker submits a different result ID", async () => {
    const writes = mockSuccessfulReplacement(processingJob("result-old"));

    await createMongoRepository({} as never).replaceExtractionDraft(
      validReplacement("result-new")
    );

    expect(writes.deletePages.exec).toHaveBeenCalledOnce();
    expect(DesignExtractionJobModel.updateOne).toHaveBeenCalledWith(
      { _id: "job-replace" },
      { $set: { workerResultId: "result-new" } }
    );
  });

  it("rejects Mongo replacement before deleting a reviewed section revision", async () => {
    vi.spyOn(DesignExtractionJobModel, "findOne").mockReturnValueOnce({
      lean: () => query(processingJob())
    } as never);
    vi.spyOn(DesignSectionModel, "find").mockReturnValueOnce({
      select: () => ({ lean: () => query([{ _id: "section-reviewed" }]) })
    } as never);
    vi.spyOn(DesignSectionRevisionModel, "exists").mockReturnValueOnce(
      query({ _id: "revision-reviewed" }) as never
    );
    const deletePages = vi.spyOn(DesignSourcePageModel, "deleteMany");

    await expect(
      createMongoRepository({} as never).replaceExtractionDraft(validReplacement())
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    expect(deletePages).not.toHaveBeenCalled();
  });

  it("rejects Mongo section revisions for missing sections", async () => {
    vi.spyOn(DesignSectionModel, "exists").mockReturnValueOnce({
      exec: vi.fn().mockResolvedValue(null)
    } as never);

    await expect(
      createMongoRepository().createSectionRevision({
        id: "revision-missing",
        sectionId: "section-missing",
        revisionNumber: 1,
        sourcePageId: "page-missing",
        crop: { x: 0, y: 0, width: 1, height: 1 },
        croppedFileReference: "missing.png",
        label: "Missing",
        reviewStatus: "draft",
        submittedAt: null,
        reviewerId: null,
        reviewedAt: null,
        rejectionComment: null,
        createdAt: "2026-07-27T10:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it("rejects Mongo section edits after the latest revision leaves draft", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    vi.spyOn(DesignSectionRevisionModel, "findOne").mockReturnValueOnce({
      sort: () => ({
        lean: () => ({
          session: () => undefined,
          exec: vi.fn().mockResolvedValue({ reviewStatus: "submitted" })
        })
      })
    } as never);

    await expect(
      createMongoRepository().updateDraftSection("section-locked", { label: "Changed" })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("rejects Mongo worker proposals that are not active OCR draft revision ones", async () => {
    const session = {} as never;
    vi.spyOn(DesignExtractionJobModel, "findOne").mockReturnValueOnce({
      lean: () => ({
        session: () => undefined,
        exec: vi.fn().mockResolvedValue({
          _id: "job-invalid",
          designVersionId: "version-invalid",
          status: "processing",
          claimId: "claim-invalid",
          leaseExpiresAt: new Date("2026-07-27T10:06:00.000Z"),
          workerResultId: null
        })
      })
    } as never);

    await expect(
      createMongoRepository(session).replaceExtractionDraft({
        jobId: "job-invalid",
        claimId: "claim-invalid",
        processedAt: "2026-07-27T10:02:00.000Z",
        designVersionId: "version-invalid",
        workerResultId: "result-invalid",
        sourcePages: [
          {
            id: "page-invalid",
            designVersionId: "version-invalid",
            pageNumber: 1,
            renderedFileReference: "page-invalid.png",
            width: 100,
            height: 100,
            createdAt: "2026-07-27T10:00:00.000Z",
            updatedAt: "2026-07-27T10:00:00.000Z"
          }
        ],
        sections: [
          {
            section: {
              id: "section-invalid",
              designVersionId: "version-invalid",
              sourcePageId: "page-invalid",
              label: "Invalid",
              active: false,
              source: "ocr",
              ocrConfidence: 1,
              createdAt: "2026-07-27T10:00:00.000Z",
              updatedAt: "2026-07-27T10:00:00.000Z"
            },
            revision: {
              id: "revision-invalid",
              sectionId: "section-invalid",
              revisionNumber: 1,
              sourcePageId: "page-invalid",
              crop: { x: 0, y: 0, width: 10, height: 10 },
              croppedFileReference: "section-invalid.png",
              label: "Invalid",
              reviewStatus: "draft",
              submittedAt: null,
              reviewerId: null,
              reviewedAt: null,
              rejectionComment: null,
              createdAt: "2026-07-27T10:00:00.000Z"
            }
          }
        ]
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

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
