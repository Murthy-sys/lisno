import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { LeadModel } from "../src/models/Lead.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { TaskModel } from "../src/models/Task.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { DesignStageModel } from "../src/models/DesignStage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { responsibilityCounts, responsibilitySeed, responsibilityUserId } from "./fixtures/user-responsibility-data.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet(); }, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear();
  const seed = responsibilitySeed();
  const documents = (records: Array<{ id?: string }>) => records.map(({ id, ...record }) => ({ ...record, _id: id }));
  // Deliberately use stored projections to test legacy/missing lineage as well as current rows.
  await UserModel.collection.insertMany(documents(seed.users));
  await ProjectModel.collection.insertMany(documents(seed.projects));
  await LeadModel.collection.insertMany(documents(seed.leads));
  await EstimateModel.collection.insertMany(documents(seed.estimateResponsibilities));
  await TaskModel.collection.insertMany(documents(seed.tasks));
  await ProjectAccessGrantModel.collection.insertMany(documents(seed.projectAccessGrants));
  await ProjectWorkflowTaskModel.collection.insertMany(documents(seed.projectWorkflowAssignments!));
  await DesignStageModel.collection.insertMany(documents(seed.stages));
});

describe("Mongo responsibility pages", () => {
  it("matches memory counts and every page across all eleven categories without writes", async () => {
    const mongo = createMongoRepository();
    const memory = createMemoryRepository(responsibilitySeed());
    expect(await mongo.countUserResponsibilities(responsibilityUserId)).toEqual(responsibilityCounts);
    for (const destinationRole of [undefined, "designer", "admin", "procurement"] as const) {
      for (const offset of [0, 4, 8, 12, 16]) {
        const query = { currentRole: "designer" as const, destinationRole, offset, limit: 4 };
        expect(await mongo.pageUserResponsibilities(responsibilityUserId, query)).toEqual(await memory.pageUserResponsibilities(responsibilityUserId, query));
      }
    }
    expect(await mongo.countUserResponsibilities(responsibilityUserId)).toEqual(responsibilityCounts);
    expect(await UserModel.countDocuments()).toBe(2);
  });

  it("reads within an existing snapshot transaction and retains orphaned assignments", async () => {
    const result = await createMongoRepository().runInTransaction(async repository => repository.pageUserResponsibilities(responsibilityUserId, {
      currentRole: "designer", destinationRole: "procurement", offset: 0, limit: 100
    }));
    expect(result.items.find(row => row.sourceId === "estimate-orphan")).toMatchObject({ contextState: "unavailable", projectId: null });
    expect(result.items.find(row => row.sourceId === "estimate-conflicting")).toMatchObject({ contextState: "unavailable", projectId: null });
    expect(result.blockingCount).toBe(15);
    expect(result.total).toBe(15);
  });
});
