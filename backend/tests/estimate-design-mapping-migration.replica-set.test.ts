import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { migrateEstimateDesignMappings } from "../src/migrations/estimate-design-mapping.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet();
});

afterAll(async () => {
  await replica.stop();
});

afterEach(() => vi.restoreAllMocks());

async function insertEstimate(id: string) {
  await EstimateModel.collection.insertOne({
    _id: id, leadId: `lead-${id}`, ownerId: "owner-real", rooms: [{ id: "bed-1", label: "Bedroom 1", aliases: [] }], scopes: ["CA"],
    lineItems: [{ catalogueId: "CA01", roomName: "Bedroom 1", specification: "fixture", unit: "nos", rate: 1, quantity: 1, included: true, amount: 1 }],
    propertyType: "apartment", createdAt: new Date(), updatedAt: new Date("2026-07-30T00:00:00.000Z")
  });
}

describe("estimate design mapping migration replica set", () => {
  it("repairs raw legacy BSON once without changing live Mongoose immutability", async () => {
    await replica.clear();
    await insertEstimate("estimate-real");
    await EstimateDesignDrawingModel.collection.insertOne({ _id: "drawing-real", estimateId: "estimate-real", detectedTitle: "TV UNIT - BEDROOM 1", roomId: "", scopeSectionId: "null" });
    await EstimateDesignRevisionModel.collection.insertOne({ _id: "revision-real", drawingId: "drawing-real", label: "TV UNIT - BEDROOM 1", roomId: "undefined", scopeSectionId: "" });

    const first = await migrateEstimateDesignMappings();
    const drawing = await EstimateDesignDrawingModel.collection.findOne({ _id: "drawing-real" });
    const revision = await EstimateDesignRevisionModel.collection.findOne({ _id: "revision-real" });
    expect(first.drawingsChanged + first.revisionsChanged).toBe(2);
    expect(drawing).toMatchObject({ roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA01", mappingStatus: "auto_mapped" });
    expect(revision).toMatchObject({ roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA01", mappingStatus: "auto_mapped" });
    await expect(EstimateDesignRevisionModel.updateOne({ _id: "revision-real" }, { $set: { roomId: null } })).rejects.toThrow("immutable");
    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({ drawingsChanged: 0, revisionsChanged: 0 });
  }, 120_000);

  it("uses raw collection compare-and-swap so a concurrent estimator assignment wins", async () => {
    await replica.clear();
    await insertEstimate("estimate-cas");
    await EstimateDesignDrawingModel.collection.insertOne({ _id: "drawing-cas", estimateId: "estimate-cas", detectedTitle: "TV UNIT - BEDROOM 1", roomId: "", scopeSectionId: "", catalogueId: "" });
    const rawBulkWrite = EstimateDesignDrawingModel.collection.bulkWrite.bind(EstimateDesignDrawingModel.collection);
    vi.spyOn(EstimateDesignDrawingModel.collection, "bulkWrite").mockImplementation(async (operations, options) => {
      await EstimateDesignDrawingModel.collection.updateOne({ _id: "drawing-cas" }, { $set: { roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA01", mappingStatus: "estimator_assigned" } });
      return rawBulkWrite(operations, options);
    });

    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({
      drawingsChanged: 0,
      conflicts: [{ recordId: "drawing-cas", reason: "concurrent_change" }]
    });
    await expect(EstimateDesignDrawingModel.collection.findOne({ _id: "drawing-cas" })).resolves.toMatchObject({ mappingStatus: "estimator_assigned" });
  });

  it("skips a stale mapping plan when the estimate context version changes", async () => {
    await replica.clear();
    await insertEstimate("estimate-context");
    await EstimateDesignDrawingModel.collection.insertOne({ _id: "drawing-context", estimateId: "estimate-context", detectedTitle: "TV UNIT - BEDROOM 1", roomId: "", scopeSectionId: "", catalogueId: "" });
    const modelFind = EstimateModel.find.bind(EstimateModel);
    let calls = 0;
    vi.spyOn(EstimateModel, "find").mockImplementation((filter) => {
      calls += 1;
      if (calls !== 2) return modelFind(filter) as never;
      return {
        lean: async () => {
          await EstimateModel.collection.updateOne({ _id: "estimate-context" }, { $set: { updatedAt: new Date("2026-07-30T00:00:01.000Z") } });
          return modelFind(filter).lean();
        }
      } as never;
    });

    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({
      drawingsChanged: 0,
      conflicts: [{ recordId: "drawing-context", reason: "estimate_changed" }]
    });
    await expect(EstimateDesignDrawingModel.collection.findOne({ _id: "drawing-context" })).resolves.toMatchObject({ roomId: "", scopeSectionId: "", catalogueId: "" });
  });
});
