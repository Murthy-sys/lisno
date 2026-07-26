import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { DesignStageModel } from "../src/models/DesignStage.js";
import { DesignVersionModel } from "../src/models/DesignVersion.js";
import { EvaluationModel } from "../src/models/Evaluation.js";
import { FloorModel } from "../src/models/Floor.js";
import { ProjectModel } from "../src/models/Project.js";
import { TaskModel } from "../src/models/Task.js";
import { TaskEventModel } from "../src/models/TaskEvent.js";
import { UserModel } from "../src/models/User.js";
import { seedMongoDatabase } from "../src/seed/run.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Mongo seed reset", () => {
  it("resets append-only history collections before inserting seed history", async () => {
    for (const model of [
      UserModel,
      ProjectModel,
      FloorModel,
      DesignStageModel,
      TaskModel,
      TaskEventModel,
      DesignVersionModel,
      EvaluationModel,
      AuditEventModel
    ]) {
      vi.spyOn(model, "bulkWrite").mockResolvedValue({} as never);
    }

    const historyModels = [TaskEventModel, EvaluationModel, AuditEventModel];
    const resets = historyModels.map((model) => ({
      deleteMany: vi.spyOn(model, "deleteMany").mockResolvedValue({} as never),
      insertMany: vi.spyOn(model, "insertMany").mockResolvedValue([] as never)
    }));

    await seedMongoDatabase();

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
