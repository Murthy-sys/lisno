import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { ProjectInitiationDefaultsModel } from "../src/models/ProjectInitiationDefaults.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await ProjectInitiationDefaultsModel.syncIndexes();
  await AuthorizationCoordinationModel.syncIndexes();
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica.stop());
const record = { projectManagerId: "manager-a", version: 1, updatedById: "admin-a", updatedAt: "2026-11-15T00:00:00.000Z" };

describe("Mongo project default persistence", () => {
  it("requires a transaction and rolls back a setting on failure", async () => {
    const repository = createMongoRepository();
    await expect(repository.saveProjectInitiationDefaults(record, 0)).rejects.toThrow("require a transaction");
    await expect(repository.runInTransaction(async transaction => {
      await transaction.coordinateAuthorizationMutation();
      await transaction.saveProjectInitiationDefaults(record, 0);
      expect(await transaction.findProjectInitiationDefaults()).toEqual(record);
      throw new Error("abort");
    })).rejects.toThrow("abort");
    await expect(repository.findProjectInitiationDefaults()).resolves.toBeNull();
  });

  it("allows one coordinated first write and preserves the winner on stale writes", async () => {
    const repository = createMongoRepository();
    const results = await Promise.allSettled(["manager-a", "manager-b"].map(projectManagerId => repository.runInTransaction(async transaction => {
      await transaction.coordinateAuthorizationMutation();
      if (await transaction.findProjectInitiationDefaults()) throw new Error("stale default");
      return transaction.saveProjectInitiationDefaults({ ...record, projectManagerId }, 0);
    })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const winner = await repository.findProjectInitiationDefaults();
    expect(winner?.version).toBe(1);
    await expect(repository.runInTransaction(transaction => transaction.saveProjectInitiationDefaults({ ...record, version: 3 }, 2))).rejects.toThrow("changed");
    expect(await repository.findProjectInitiationDefaults()).toEqual(winner);
  });
});
