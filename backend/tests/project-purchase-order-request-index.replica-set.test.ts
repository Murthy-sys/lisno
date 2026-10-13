import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migratePurchaseOrderRequestIndex, REQUEST_ACTIVE_INDEX, REQUEST_LEGACY_INDEX, runPurchaseOrderRequestIndexCommand } from "../src/migrations/project-purchase-order-request-index.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let collection: mongoose.mongo.Collection;
beforeAll(async () => { replica = await startMongoReplicaSet("purchase-request-index-test"); }, 120000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  collection = mongoose.connection.db!.collection("syntheticPurchaseRequests");
  await collection.drop().catch(error => { if (error.code !== 26) throw error; });
  await mongoose.connection.db!.createCollection(collection.collectionName);
  await collection.createIndex({ projectId: 1 }, { name: REQUEST_LEGACY_INDEX, unique: true, partialFilterExpression: { status: { $in: ["pending_approval", "changes_requested"] } } });
});
const row = (id: string, status: string) => ({ _id: id as never, projectId: "synthetic-project", status });
describe("purchase-request active index preparation", () => {
  it("dry-runs without writes and reports conflicting pending/ready requests deterministically", async () => {
    await collection.insertMany([row("ready", "ready_to_issue"), row("pending", "pending_approval")]);
    const before = await collection.listIndexes().toArray();
    const report = await migratePurchaseOrderRequestIndex(collection);
    expect(report).toMatchObject({ mode: "dry-run", conflicts: [{ projectId: "synthetic-project", requestIds: ["pending", "ready"], count: 2 }] });
    expect(await collection.listIndexes().toArray()).toEqual(before);
    await expect(migratePurchaseOrderRequestIndex(collection, { mode: "apply", backupVerified: true, writesQuiesced: true, backupIndexMetadata: async () => {} })).rejects.toThrow("duplicate open requests");
  });
  it("builds stricter replacement before retiring legacy uniqueness and preserves documents", async () => {
    await collection.insertOne(row("ready", "ready_to_issue"));
    const backup = vi.fn(async () => { expect(await collection.indexExists(REQUEST_LEGACY_INDEX)).toBe(true); });
    await expect(migratePurchaseOrderRequestIndex(collection, { mode: "apply" })).rejects.toThrow("quiesced");
    const report = await migratePurchaseOrderRequestIndex(collection, { mode: "apply", backupVerified: true, writesQuiesced: true, backupIndexMetadata: backup });
    expect(report).toMatchObject({ replacementPresent: true, legacyPresent: false, conflicts: [] });
    expect(backup).toHaveBeenCalledTimes(1);
    await expect(collection.insertOne(row("pending", "pending_approval"))).rejects.toMatchObject({ code: 11000 });
    expect(await collection.find().toArray()).toEqual([row("ready", "ready_to_issue")]);
    await expect(migratePurchaseOrderRequestIndex(collection, { mode: "rollback", backupVerified: true, writesQuiesced: true, backupIndexMetadata: async () => {} })).rejects.toThrow("every ready_to_issue");
    await collection.updateOne({ _id: "ready" as never }, { $set: { status: "approved" } });
    const rollback = await migratePurchaseOrderRequestIndex(collection, { mode: "rollback", backupVerified: true, writesQuiesced: true, backupIndexMetadata: async () => {} });
    expect(rollback).toMatchObject({ replacementPresent: false, legacyPresent: true });
    expect(await collection.indexExists(REQUEST_ACTIVE_INDEX)).toBe(false);
  });
  it("refuses CLI apply without explicit backup and quiescence before connecting", async () => {
    await expect(runPurchaseOrderRequestIndexCommand(["--database=synthetic", "--apply"], {})).rejects.toThrow("verified backup");
  });
});
