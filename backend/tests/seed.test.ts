import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { DesignStageModel } from "../src/models/DesignStage.js";
import { DesignVersionModel } from "../src/models/DesignVersion.js";
import { DesignVersionSequenceModel } from "../src/models/DesignVersionSequence.js";
import { EvaluationModel } from "../src/models/Evaluation.js";
import { FloorModel } from "../src/models/Floor.js";
import { ProjectModel } from "../src/models/Project.js";
import { TaskModel } from "../src/models/Task.js";
import { TaskEventModel } from "../src/models/TaskEvent.js";
import { UserModel } from "../src/models/User.js";
import { demoSeedData } from "../src/seed/data.js";
import { seedMongoDatabase } from "../src/seed/run.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Mongo seed reset", () => {
  it("includes normalized account identity and client snapshots in demo records", () => {
    expect(demoSeedData.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "user-client-aurora",
          emailNormalized: "client@aurora.example"
        })
      ])
    );
    expect(demoSeedData.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "project-aurora-villa",
          clientId: "user-client-aurora",
          clientEmailNormalized: "client@aurora.example"
        })
      ])
    );
  });

  it("clears every demo-seed collection, including version sequences, before writing deterministic records", async () => {
    for (const model of [
      UserModel,
      ProjectModel,
      FloorModel,
      DesignStageModel,
      TaskModel,
      TaskEventModel,
      DesignVersionModel,
      DesignVersionSequenceModel,
      EvaluationModel,
      AuditEventModel
    ]) {
      vi.spyOn(model, "bulkWrite").mockResolvedValue({} as never);
      vi.spyOn(model, "deleteMany").mockResolvedValue({} as never);
    }

    const historyModels = [TaskEventModel, EvaluationModel, AuditEventModel];
    const resets = historyModels.map((model) => ({
      deleteMany: vi.mocked(model.deleteMany),
      insertMany: vi.spyOn(model, "insertMany").mockResolvedValue([] as never)
    }));

    await seedMongoDatabase();

    for (const model of [
      UserModel,
      ProjectModel,
      FloorModel,
      DesignStageModel,
      TaskModel,
      TaskEventModel,
      DesignVersionModel,
      DesignVersionSequenceModel,
      EvaluationModel,
      AuditEventModel
    ]) {
      expect(model.deleteMany).toHaveBeenCalledWith({});
    }

    for (const reset of resets) {
      expect(reset.deleteMany).toHaveBeenCalledOnce();
      expect(reset.deleteMany).toHaveBeenCalledWith({});
      expect(reset.insertMany).toHaveBeenCalledOnce();
      expect(reset.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        reset.insertMany.mock.invocationCallOrder[0]!
      );
    }
  });
});
