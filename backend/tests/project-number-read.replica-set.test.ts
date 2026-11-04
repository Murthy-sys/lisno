import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectNumberSequenceModel } from "../src/models/ProjectNumberSequence.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { readProjectNumbers } from "../src/services/project-number-read.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("project-number-read");
  await LeadModel.createCollection();
}, 120_000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica?.stop(); });

describe("project number read adapter against Mongo", () => {
  it("returns only requested projects without creating numbering state", async () => {
    await LeadModel.collection.insertMany([
      { _id: "lead-a", projectId: "project-a", projectName: "Same name", projectNumber: "Lisno000012" },
      { _id: "lead-b", projectId: "project-b", projectName: "Same name", projectNumber: "Lisno000087" },
      { _id: "lead-c", projectId: "project-c", projectNumber: "invalid" }
    ] as never);
    expect(await createMongoRepository().findProjectNumbers(["project-b", "project-a", "old-project"]))
      .toEqual(new Map([["project-b", "Lisno000087"], ["project-a", "Lisno000012"], ["old-project", null]]));
    expect(await ProjectNumberSequenceModel.countDocuments()).toBe(0);
    expect(await LeadModel.countDocuments()).toBe(3);
    await expect(readProjectNumbers(["project-c"])).rejects.toMatchObject({ code: "PROJECT_NUMBER_STATE_CONFLICT" });
  });

  it("uses the caller's transaction snapshot and never persists through a read", async () => {
    const session = await mongoose.startSession();
    try {
      await expect(session.withTransaction(async () => {
        await LeadModel.collection.insertOne({ _id: "transaction-lead", projectId: "transaction-project", projectNumber: "Lisno000045" } as never, { session });
        expect((await createMongoRepository(session).findProjectNumbers(["transaction-project"])).get("transaction-project")).toBe("Lisno000045");
        expect((await readProjectNumbers(["transaction-project"])).get("transaction-project")).toBeNull();
        throw new Error("Synthetic transaction rollback");
      })).rejects.toThrow("Synthetic transaction rollback");
      expect((await readProjectNumbers(["transaction-project"])).get("transaction-project")).toBeNull();
      expect(await ProjectNumberSequenceModel.countDocuments()).toBe(0);
    } finally { await session.endSession(); }
  });

  it("fails explicitly for duplicate numbered linkage", async () => {
    await LeadModel.collection.insertMany([
      { _id: "duplicate-a", projectId: "project-a", projectNumber: null },
      { _id: "duplicate-b", projectId: "project-a", projectNumber: "Lisno000012" }
    ] as never);
    await expect(readProjectNumbers(["project-a"])).rejects.toMatchObject({ code: "PROJECT_NUMBER_STATE_CONFLICT" });
    expect(await LeadModel.countDocuments()).toBe(2);
  });
});
