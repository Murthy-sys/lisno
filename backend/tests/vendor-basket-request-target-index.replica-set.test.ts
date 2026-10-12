import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inspectBasketRequestTargetIndexes, migrateBasketRequestTargetIndexes, runBasketRequestTargetIndexCommand } from "../src/migrations/vendor-basket-request-target-index.js";
import { PENDING_REQUEST_INDEXES, PENDING_REQUEST_FILTER, requireTargetRequestIndexes } from "../src/services/vendor-basket-request-indexes.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let sequence = 0;
beforeAll(async () => { replica = await startMongoReplicaSet("request-target-index"); }, 120_000);
afterAll(async () => { await replica?.stop(); });
async function fixture(old = true) {
  const collection = await mongoose.connection.db!.createCollection(`request-index-${++sequence}`);
  if (old) for (const definition of PENDING_REQUEST_INDEXES) await collection.createIndex(definition.oldKey,
    { name: definition.oldName, unique: true, partialFilterExpression: PENDING_REQUEST_FILTER });
  return collection;
}
const approved = { mode: "apply" as const, backupVerified: true, writersPaused: true, backupIndexMetadata: async () => {} };
const pending = (name: string, parent?: string | null) => ({ vendorKey: "id:vendor", vendorNameNormalized: "vendor", proposedNameNormalized: name,
  status: "pending", ...(parent === undefined ? {} : { targetParentBasketId: parent }) });
describe("explicit target-scoped pending request index transition", { timeout: 30_000 }, () => {
  it("is read-only by default and requires backup, metadata and paused writers for apply", async () => {
    const collection = await fixture(); await collection.insertOne(pending("paint"));
    const indexes = await collection.listIndexes().toArray();
    expect(await migrateBasketRequestTargetIndexes(collection)).toMatchObject({ mode: "dry-run", requestCount: 1, targetDuplicateGroups: 0 });
    expect(await collection.listIndexes().toArray()).toEqual(indexes);
    await expect(migrateBasketRequestTargetIndexes(collection, { mode: "apply" })).rejects.toThrow("verified database backup");
    await expect(migrateBasketRequestTargetIndexes(collection, { ...approved, writersPaused: false })).rejects.toThrow("paused writers");
    await expect(requireTargetRequestIndexes(collection)).rejects.toMatchObject({ code: "PROPOSAL_TARGET_SETUP_UNAVAILABLE" });
  });
  it("builds protections first, shares missing/null legacy root, scopes same names to separate parents and is retry-safe", async () => {
    const collection = await fixture(); await collection.insertOne(pending("paint"));
    const report = await migrateBasketRequestTargetIndexes(collection, approved);
    expect(report).toMatchObject({ legacyIndexesPresent: [], targetIndexesPresent: expect.any(Array) });
    await requireTargetRequestIndexes(collection);
    await expect(collection.insertOne(pending("paint", null))).rejects.toMatchObject({ code: 11000 });
    await collection.insertOne(pending("paint", "parent-a"));
    await collection.insertOne(pending("paint", "parent-b"));
    await expect(collection.insertOne(pending("paint", "parent-a"))).rejects.toMatchObject({ code: 11000 });
    const backup = vi.fn(); await migrateBasketRequestTargetIndexes(collection, { ...approved, backupIndexMetadata: backup });
    expect(backup).not.toHaveBeenCalled();
    await expect(migrateBasketRequestTargetIndexes(collection, { ...approved, mode: "rollback" })).rejects.toThrow("legacy root-only uniqueness");
    expect(await collection.countDocuments()).toBe(3);
  });
  it("restores legacy protections before removing target indexes when rollback is safe", async () => {
    const collection = await fixture(); await collection.insertOne(pending("paint"));
    await migrateBasketRequestTargetIndexes(collection, approved);
    const report = await migrateBasketRequestTargetIndexes(collection, { ...approved, mode: "rollback" });
    expect(report.legacyIndexesPresent).toHaveLength(2); expect(report.targetIndexesPresent).toHaveLength(0);
    await expect(requireTargetRequestIndexes(collection)).rejects.toMatchObject({ code: "PROPOSAL_TARGET_SETUP_UNAVAILABLE" });
  });
  it("refuses unknown or conflicting definitions and reports duplicates without changing documents", async () => {
    const collection = await fixture(false);
    await collection.insertMany([pending("paint"), pending("paint", null)]);
    expect(await inspectBasketRequestTargetIndexes(collection)).toMatchObject({ targetDuplicateGroups: 2, legacyDuplicateGroups: 2 });
    await expect(migrateBasketRequestTargetIndexes(collection, approved)).rejects.toThrow("same target scope");
    const conflicting = await fixture(false);
    await conflicting.createIndex(PENDING_REQUEST_INDEXES[0].key, { name: "unexpected-name" });
    await expect(migrateBasketRequestTargetIndexes(conflicting, approved)).rejects.toThrow("conflicting index definitions");
    const wrongOptions = await fixture(false);
    await wrongOptions.createIndex(PENDING_REQUEST_INDEXES[0].key, { name: PENDING_REQUEST_INDEXES[0].name });
    await expect(migrateBasketRequestTargetIndexes(wrongOptions, approved)).rejects.toThrow("conflicting index definitions");
  });
  it("recovers a partial transition and keeps legacy indexes if replacement verification fails", async () => {
    const collection = await fixture(); const first = PENDING_REQUEST_INDEXES[0];
    await collection.createIndex(first.key, { name: first.name, unique: true, partialFilterExpression: PENDING_REQUEST_FILTER });
    const fail = vi.spyOn(collection, "createIndex").mockRejectedValueOnce(new Error("fixture build failed"));
    await expect(migrateBasketRequestTargetIndexes(collection, approved)).rejects.toThrow("fixture build failed"); fail.mockRestore();
    expect((await inspectBasketRequestTargetIndexes(collection)).legacyIndexesPresent).toHaveLength(2);
    await migrateBasketRequestTargetIndexes(collection, approved); await requireTargetRequestIndexes(collection);
  });
  it("performs a final dry run after metadata capture and refuses a changed inventory", async () => {
    const collection = await fixture();
    await expect(migrateBasketRequestTargetIndexes(collection, { ...approved, backupIndexMetadata: async () => {
      await collection.insertOne(pending("paint"));
    } })).rejects.toThrow("state changed after backup capture");
    expect((await inspectBasketRequestTargetIndexes(collection)).targetIndexesPresent).toEqual([]);
  });
  it("requires an explicit database and never infers a server or writes without explicit flags", async () => {
    await expect(runBasketRequestTargetIndexCommand([], {})).rejects.toThrow("--database");
    await expect(runBasketRequestTargetIndexCommand(["--database=fixture"], {})).rejects.toThrow("MONGODB_URI");
    await expect(runBasketRequestTargetIndexCommand(["--database=fixture", "--apply"], {})).rejects.toThrow("Index writes require");
  });
});
