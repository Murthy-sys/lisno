import { afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { DesignVersionModel } from "../src/models/DesignVersion.js";
import { EvaluationModel } from "../src/models/Evaluation.js";
import { FloorModel } from "../src/models/Floor.js";
import { TaskEventModel } from "../src/models/TaskEvent.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { RepositoryConflictError } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Mongo repository contracts", () => {
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
});
