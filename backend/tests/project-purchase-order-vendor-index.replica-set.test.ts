import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectPurchaseOrderVendorIndex, migratePurchaseOrderVendorIndex, runPurchaseOrderVendorIndexCommand,
  LEGACY_VENDOR_UNIQUE_INDEX_KEY, LEGACY_VENDOR_UNIQUE_INDEX_NAME,
  VENDOR_LIST_INDEX_KEY, VENDOR_LIST_INDEX_NAME
} from "../src/migrations/project-purchase-order-vendor-index.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let collection: mongoose.mongo.Collection;
beforeAll(async () => { replica = await startMongoReplicaSet("purchase-order-vendor-index-test"); }, 120_000);
beforeEach(async () => {
  collection = mongoose.connection.db!.collection("projectPurchaseOrders");
  await collection.drop().catch((error) => { if (error.code !== 26) throw error; });
  await mongoose.connection.db!.createCollection(collection.collectionName);
});
afterAll(async () => { await replica?.stop(); });
const order = (id: string, vendorId = "vendor-1") => ({ _id: id as any, projectId: "project-1", vendorId, createdAt: new Date() });

describe("purchase order per-vendor index transition", () => {
  it("dry-runs with exact metadata and no writes", async () => {
    await collection.createIndex(LEGACY_VENDOR_UNIQUE_INDEX_KEY, { unique: true, name: LEGACY_VENDOR_UNIQUE_INDEX_NAME });
    await collection.insertOne(order("first"));
    const before = await collection.listIndexes().toArray();
    const report = await migratePurchaseOrderVendorIndex(collection);
    expect(report).toMatchObject({ mode: "dry-run", indexes: before, orderCount: 1,
      legacyUniquePresent: true, vendorListPresent: false, duplicateProjectVendorGroups: 0,
      intendedChanges: [expect.stringContaining("Create nonunique"), expect.stringContaining("Drop")], indexConflicts: [] });
    expect(await collection.listIndexes().toArray()).toEqual(before);
    expect(await collection.countDocuments()).toBe(1);
  });

  it("backs up metadata, builds the list index first, drops only the recognized unique index, and is idempotent", async () => {
    await collection.createIndex(LEGACY_VENDOR_UNIQUE_INDEX_KEY, { unique: true, name: LEGACY_VENDOR_UNIQUE_INDEX_NAME });
    await collection.createIndex({ status: 1 }, { name: "keep_status" });
    await collection.insertOne(order("first"));
    const backup = vi.fn(async () => {
      expect(await collection.indexExists(LEGACY_VENDOR_UNIQUE_INDEX_NAME)).toBe(true);
      expect(await collection.indexExists(VENDOR_LIST_INDEX_NAME)).toBe(false);
    });
    await expect(migratePurchaseOrderVendorIndex(collection, { mode: "apply" })).rejects.toThrow("verified database backup");
    const applied = await migratePurchaseOrderVendorIndex(collection, { mode: "apply", backupVerified: true,
      backupIndexMetadata: backup });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(applied).toMatchObject({ mode: "apply", legacyUniquePresent: false, vendorListPresent: true });
    expect(await collection.indexExists("keep_status")).toBe(true);
    await collection.insertOne(order("second"));
    expect((await inspectPurchaseOrderVendorIndex(collection)).duplicateProjectVendorGroups).toBe(1);
    const repeated = await migratePurchaseOrderVendorIndex(collection, { mode: "apply" });
    expect(repeated).toMatchObject({ mode: "apply", legacyUniquePresent: false, vendorListPresent: true,
      duplicateProjectVendorGroups: 1 });
    expect(backup).toHaveBeenCalledTimes(1);
  });

  it("refuses unsafe rollback and restores the old index only when uniqueness is satisfiable", async () => {
    await collection.createIndex(VENDOR_LIST_INDEX_KEY, { name: VENDOR_LIST_INDEX_NAME });
    await collection.insertMany([order("first"), order("second")]);
    const backup = vi.fn(async () => {});
    await expect(migratePurchaseOrderVendorIndex(collection, { mode: "rollback", backupVerified: true,
      backupIndexMetadata: backup })).rejects.toThrow("multiple purchase orders");
    expect(backup).not.toHaveBeenCalled();
    await collection.deleteOne({ _id: "second" as any });
    const rolledBack = await migratePurchaseOrderVendorIndex(collection, { mode: "rollback", backupVerified: true,
      backupIndexMetadata: backup });
    expect(rolledBack).toMatchObject({ mode: "rollback", legacyUniquePresent: true, vendorListPresent: false });
    await expect(collection.insertOne(order("second"))).rejects.toMatchObject({ code: 11000 });
    expect(await collection.indexExists(LEGACY_VENDOR_UNIQUE_INDEX_NAME)).toBe(true);
  });

  it("rejects unfamiliar index definitions and a failed metadata backup before modifying indexes", async () => {
    await collection.createIndex({ projectId: 1 }, { unique: true, name: LEGACY_VENDOR_UNIQUE_INDEX_NAME });
    expect((await inspectPurchaseOrderVendorIndex(collection)).indexConflicts).not.toHaveLength(0);
    await expect(migratePurchaseOrderVendorIndex(collection, { mode: "apply", backupVerified: true,
      backupIndexMetadata: async () => {} })).rejects.toThrow("index conflicts");
    await collection.dropIndex(LEGACY_VENDOR_UNIQUE_INDEX_NAME);
    await collection.createIndex(LEGACY_VENDOR_UNIQUE_INDEX_KEY, { unique: true, name: LEGACY_VENDOR_UNIQUE_INDEX_NAME });
    const before = await collection.listIndexes().toArray();
    await expect(migratePurchaseOrderVendorIndex(collection, { mode: "apply", backupVerified: true,
      backupIndexMetadata: async () => { throw new Error("backup failed"); } })).rejects.toThrow("backup failed");
    expect(await collection.listIndexes().toArray()).toEqual(before);
  });

  it("requires explicit CLI target and backup acknowledgment before connecting", async () => {
    await expect(runPurchaseOrderVendorIndexCommand(["--apply", "--database=test"], {})).rejects.toThrow("backup-verified");
    await expect(runPurchaseOrderVendorIndexCommand(["--apply", "--database=test", "--backup-verified",
      "--index-metadata=relative.json"], {})).rejects.toThrow("absolute");
    await expect(runPurchaseOrderVendorIndexCommand([], {})).rejects.toThrow("--database");
    await expect(runPurchaseOrderVendorIndexCommand(["--database=test"], {})).rejects.toThrow("MONGODB_URI");
  });
});
