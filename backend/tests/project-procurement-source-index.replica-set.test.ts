import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectProcurementSourceIndex, migrateProcurementSourceIndex, PROCUREMENT_NEW_INDEX_KEY, PROCUREMENT_NEW_INDEX_NAME, PROCUREMENT_OLD_INDEX_KEY, PROCUREMENT_OLD_INDEX_NAME } from "../src/migrations/project-procurement-source-index.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let collection: mongoose.mongo.Collection;
beforeAll(async () => { replica = await startMongoReplicaSet("procurement-source-index-tests"); }, 120_000);
beforeEach(async () => {
  collection = mongoose.connection.db!.collection("migrationProcurementItems");
  await collection.drop().catch((error) => { if (error.code !== 26) throw error; });
  await mongoose.connection.db!.createCollection(collection.collectionName);
});
afterAll(async () => { await replica?.stop(); });
const source = { estimateId: "estimate-a", estimateVersion: 1, estimateReviewRoundId: "round-a", sourceSectionId: "CA", sourceLineItemKey: "line-a" };
const material = { projectId: "project-a", itemNameNormalized: "plywood", brandNormalized: "brand", uomId: "sheet", vendorId: null };
const row = (id: string, extra = {}) => ({ _id: id as any, ...material, ...source, ...extra });

describe("procurement source-index migration", () => {
  it("defaults to a read-only dry run with exact index metadata", async () => {
    await collection.createIndex(PROCUREMENT_OLD_INDEX_KEY, { unique: true, name: PROCUREMENT_OLD_INDEX_NAME });
    await collection.insertOne(row("one"));
    const before = await collection.listIndexes().toArray();
    const report = await migrateProcurementSourceIndex(collection);
    expect(report).toMatchObject({ indexes: before, legacyIndexPresent: true, sourceIndexPresent: false, indexConflicts: [], invalidSourceIds: [], sourceDuplicateGroups: [] });
    expect(await collection.listIndexes().toArray()).toEqual(before);
    expect(await collection.countDocuments()).toBe(1);
  });
  it("backs up metadata, builds the source index before removing only the known legacy index and is idempotent", async () => {
    await collection.createIndex(PROCUREMENT_OLD_INDEX_KEY, { unique: true, name: PROCUREMENT_OLD_INDEX_NAME });
    await collection.createIndex({ projectId: 1, _id: 1 }, { name: "keep_search" });
    await collection.insertOne(row("one"));
    const backup = vi.fn(async (report) => { expect(report.legacyIndexPresent).toBe(true); expect(await collection.indexExists(PROCUREMENT_OLD_INDEX_NAME)).toBe(true); });
    const report = await migrateProcurementSourceIndex(collection, { mode: "apply", backupIndexMetadata: backup });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ legacyIndexPresent: false, sourceIndexPresent: true });
    expect(await collection.indexExists("keep_search")).toBe(true);
    await collection.insertOne(row("two", { sourceLineItemKey: "line-b" }));
    await expect(collection.insertOne(row("duplicate"))).rejects.toMatchObject({ code: 11000 });
    expect((await migrateProcurementSourceIndex(collection, { mode: "apply", backupIndexMetadata: async () => {} })).indexes).toEqual(report.indexes);
    expect(await collection.countDocuments()).toBe(2);
  });
  it("refuses a metadata-backup failure without modifying any indexes", async () => {
    await collection.createIndex(PROCUREMENT_OLD_INDEX_KEY, { unique: true, name: PROCUREMENT_OLD_INDEX_NAME });
    const before = await collection.listIndexes().toArray();
    await expect(migrateProcurementSourceIndex(collection, { mode: "apply" })).rejects.toThrow("backup");
    await expect(migrateProcurementSourceIndex(collection, { mode: "apply", backupIndexMetadata: async () => { throw new Error("backup failed"); } })).rejects.toThrow("backup failed");
    expect(await collection.listIndexes().toArray()).toEqual(before);
  });
  it.each([
    { name: PROCUREMENT_OLD_INDEX_NAME, key: { projectId: 1 } },
    { name: PROCUREMENT_NEW_INDEX_NAME, key: { projectId: 1 } },
    { name: "unknown_legacy_unique", key: PROCUREMENT_OLD_INDEX_KEY }
  ])("refuses unfamiliar index definitions %s", async ({ name, key }) => {
    await collection.createIndex(key, { name, unique: true });
    const report = await inspectProcurementSourceIndex(collection);
    expect(report.indexConflicts).not.toHaveLength(0);
    const backup = vi.fn();
    await expect(migrateProcurementSourceIndex(collection, { mode: "apply", backupIndexMetadata: backup })).rejects.toThrow("conflicts");
    expect(backup).not.toHaveBeenCalled();
  });
  it("reports incomplete lineage and source duplicates before changing indexes", async () => {
    await collection.insertMany([row("first"), row("duplicate"), row("partial", { itemNameNormalized: "other", sourceSectionId: null })]);
    const report = await inspectProcurementSourceIndex(collection);
    expect(report.invalidSourceIds).toEqual(["partial"]);
    expect(report.sourceDuplicateGroups).toEqual([["first", "duplicate"]]);
    await expect(migrateProcurementSourceIndex(collection, { mode: "apply", backupIndexMetadata: async () => {} })).rejects.toThrow("conflicts");
    expect(await collection.indexExists(PROCUREMENT_NEW_INDEX_NAME)).toBe(false);
  });
  it("keeps missing and null legacy lineage in the same uniqueness scope", async () => {
    await collection.insertMany([{ _id: "absent" as any, ...material }, row("null", { estimateId: null, estimateVersion: null, estimateReviewRoundId: null, sourceSectionId: null, sourceLineItemKey: null })]);
    const report = await inspectProcurementSourceIndex(collection);
    expect(report.invalidSourceIds).toEqual([]);
    expect(report.sourceDuplicateGroups).toEqual([["absent", "null"]]);
    await expect(migrateProcurementSourceIndex(collection, { mode: "apply", backupIndexMetadata: async () => {} })).rejects.toThrow("conflicts");
  });
  it("rolls back only while project-wide uniqueness is satisfiable", async () => {
    await collection.createIndex(PROCUREMENT_NEW_INDEX_KEY, { unique: true, name: PROCUREMENT_NEW_INDEX_NAME });
    await collection.insertMany([row("one"), row("two", { sourceLineItemKey: "line-b" })]);
    const backup = vi.fn(async () => {});
    await expect(migrateProcurementSourceIndex(collection, { mode: "rollback", backupIndexMetadata: backup })).rejects.toThrow("no longer satisfiable");
    expect(backup).not.toHaveBeenCalled();
    expect(await collection.indexExists(PROCUREMENT_NEW_INDEX_NAME)).toBe(true);
    await collection.deleteOne({ _id: "two" as any });
    const report = await migrateProcurementSourceIndex(collection, { mode: "rollback", backupIndexMetadata: backup });
    expect(report).toMatchObject({ sourceIndexPresent: false, legacyIndexPresent: true });
    await expect(collection.insertOne(row("two", { sourceLineItemKey: "line-b" }))).rejects.toMatchObject({ code: 11000 });
    expect((await migrateProcurementSourceIndex(collection, { mode: "rollback", backupIndexMetadata: async () => {} })).indexes).toEqual(report.indexes);
  });
});
