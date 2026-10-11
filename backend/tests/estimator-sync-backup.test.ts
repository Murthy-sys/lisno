import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { chmod, link, lstat, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mongo } from "mongoose";
import { canonical, snapshotDigest } from "../src/operations/estimator-sync/canonical.js";
import { readVerifiedTargetBackup, verifyTargetBackup, writeTargetBackup } from "../src/operations/estimator-sync/backup.js";
import { readDatabaseSnapshot } from "../src/operations/estimator-sync/snapshot.js";
import { type SyncSnapshot } from "../src/operations/estimator-sync/contracts.js";
import { SYNC_COLLECTIONS, SYNC_METADATA_COLLECTIONS } from "../src/operations/estimator-sync/manifest.js";

const VENDORS = "aiEstimatorKnowledgeVendors";
function fixture(): SyncSnapshot {
  const snapshot: SyncSnapshot = {
    formatVersion: 1, role: "target", databaseName: "fixture_local", identity: "fixture-target",
    collections: SYNC_COLLECTIONS.map(name => ({ name, exists: false, uuid: null, options: {}, indexes: [], documents: [] })),
    metadataCollections: SYNC_METADATA_COLLECTIONS.map(name => ({ name, exists: false, uuid: null, options: {}, indexes: [], documents: [] })),
    dependencies: { actorIds: ["actor-fixture"], availableStorageReferences: ["opaque-photo"] }, contentDigest: ""
  };
  const vendors = snapshot.collections.find(row => row.name === VENDORS)!;
  Object.assign(vendors, {
    exists: true, uuid: new mongo.BSON.Binary(Buffer.alloc(16, 1), 4), options: { validationLevel: "strict" },
    indexes: [{ name: "_id_", key: { _id: new mongo.BSON.Int32(1) }, v: new mongo.BSON.Int32(2) }, { name: "compound", key: { z: new mongo.BSON.Int32(1), a: new mongo.BSON.Int32(-1) }, unique: true }],
    documents: [{ _id: "test-pop", nested: { missingIsAbsent: null, order: [2, 1] }, amount: mongo.BSON.Long.fromString("9007199254740993"), int: new mongo.BSON.Int32(3), double: new mongo.BSON.Double(3), decimal: mongo.BSON.Decimal128.fromString("12.50"), when: new Date("2026-10-11T01:00:00Z"), regex: new mongo.BSON.BSONRegExp("fixture", "i"), bytes: new mongo.BSON.Binary(Buffer.from([4, 5]), 0) }]
  });
  Object.assign(snapshot.metadataCollections[0], { exists: true, uuid: new mongo.BSON.Binary(Buffer.alloc(16, 2), 4), indexes: [{ name: "_id_", key: { _id: 1 } }], documents: [{ _id: "baseline", generation: new mongo.BSON.Int32(2) }] });
  Object.assign(snapshot.metadataCollections[1], { exists: true, uuid: new mongo.BSON.Binary(Buffer.alloc(16, 3), 4), indexes: [{ name: "_id_", key: { _id: 1 } }], documents: [{ _id: "sync", fence: new mongo.BSON.Int32(8) }] });
  snapshot.contentDigest = snapshotDigest(snapshot);
  return snapshot;
}

describe("private target backup artifacts", () => {
  let root: string;
  let testRoot: string;
  beforeAll(async () => { root = await mkdtemp(path.join(await realpath(tmpdir()), "lisno-estimator-backup-test-")); });
  beforeEach(async () => { testRoot = await mkdtemp(path.join(root, "case-")); });
  afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  it("round trips typed data, ordered compound indexes, options, exact allowlist and metadata privately", async () => {
    const snapshot = fixture();
    const backup = await writeTargetBackup(snapshot, testRoot);
    expect(backup).toMatchObject({ targetSnapshotDigest: snapshot.contentDigest, collectionCount: 3, documentCount: 3 });
    expect(await verifyTargetBackup(backup.directory, snapshot.contentDigest)).toEqual(backup);
    const restored = await readVerifiedTargetBackup(backup.directory);
    expect(canonical(restored)).toBe(canonical(snapshot));
    const vendor = restored.collections.find(row => row.name === VENDORS)!;
    expect(vendor.documents[0].amount).toBeInstanceOf(mongo.BSON.Long);
    expect(vendor.documents[0].int).toBeInstanceOf(mongo.BSON.Int32);
    expect(vendor.documents[0].double).toBeInstanceOf(mongo.BSON.Double);
    expect(vendor.documents[0].regex).toBeInstanceOf(mongo.BSON.BSONRegExp);
    expect(Object.keys(vendor.indexes[1].key)).toEqual(["z", "a"]);
    expect((await lstat(backup.directory)).mode & 0o777).toBe(0o700);
    expect((await lstat(path.join(backup.directory, "snapshot.bson"))).mode & 0o777).toBe(0o600);
    expect((await lstat(path.join(backup.directory, "manifest.json"))).mode & 0o777).toBe(0o600);
    const second = await writeTargetBackup(snapshot, testRoot);
    expect(second.directory).not.toBe(backup.directory);
    expect(await verifyTargetBackup(backup.directory, snapshot.contentDigest)).toEqual(backup);
  });

  it("keeps volatile lease content in the backup even though plan digest excludes it", async () => {
    const snapshot = fixture();
    const before = await writeTargetBackup(snapshot, testRoot);
    snapshot.metadataCollections[1].documents[0].fence = new mongo.BSON.Int32(9);
    expect(snapshotDigest(snapshot)).toBe(snapshot.contentDigest);
    const after = await writeTargetBackup(snapshot, testRoot);
    expect(after.targetSnapshotDigest).toBe(before.targetSnapshotDigest);
    expect(after.manifestDigest).not.toBe(before.manifestDigest);
    expect((await readVerifiedTargetBackup(after.directory)).metadataCollections[1].documents[0].fence.valueOf()).toBe(9);
  });

  it("rejects source backups, missing namespaces, extra namespaces and invalid snapshot checksums", async () => {
    const source = fixture();
    source.role = "source";
    await expect(writeTargetBackup(source, testRoot)).rejects.toThrow("BACKUP_INVALID");
    const missing = fixture();
    missing.collections.pop();
    await expect(writeTargetBackup(missing, testRoot)).rejects.toThrow("BACKUP_INVALID");
    const extra = fixture();
    extra.collections.push({ ...extra.collections[0], name: "users" });
    await expect(writeTargetBackup(extra, testRoot)).rejects.toThrow("BACKUP_INVALID");
    const stale = fixture();
    stale.collections.find(row => row.name === VENDORS)!.documents[0].name = "changed";
    await expect(writeTargetBackup(stale, testRoot)).rejects.toThrow("SNAPSHOT_DIGEST_MISMATCH");
  });

  it("rejects corrupted payloads and mismatched target bindings", async () => {
    const snapshot = fixture();
    const backup = await writeTargetBackup(snapshot, testRoot);
    await expect(verifyTargetBackup(backup.directory, "a".repeat(64))).rejects.toThrow("BACKUP_TARGET_MISMATCH");
    const payloadPath = path.join(backup.directory, "snapshot.bson");
    const bytes = await readFile(payloadPath);
    bytes[bytes.length - 5] ^= 1;
    await writeFile(payloadPath, bytes);
    await expect(verifyTargetBackup(backup.directory, snapshot.contentDigest)).rejects.toThrow("BACKUP_INVALID");
  });

  it("rejects payload traversal, corrupted manifests, incomplete and unbounded artifacts", async () => {
    const snapshot = fixture();
    const backup = await writeTargetBackup(snapshot, testRoot);
    const manifestPath = path.join(backup.directory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, payload: "../secret" }));
    await expect(readVerifiedTargetBackup(backup.directory)).rejects.toThrow("BACKUP_INVALID");
    await writeFile(manifestPath, Buffer.alloc(8193));
    await expect(readVerifiedTargetBackup(backup.directory)).rejects.toThrow("BACKUP_RESOURCE_LIMIT");
    await rm(manifestPath);
    await expect(readVerifiedTargetBackup(backup.directory)).rejects.toThrow("BACKUP_INVALID");
  });

  it("rejects insecure permissions, symlinks, traversal and extra files", async () => {
    const snapshot = fixture();
    const backup = await writeTargetBackup(snapshot, testRoot);
    await chmod(backup.directory, 0o755);
    await expect(readVerifiedTargetBackup(backup.directory)).rejects.toThrow("BACKUP_INSECURE_PERMISSIONS");
    await chmod(backup.directory, 0o700);
    const link = path.join(testRoot, "linked");
    await symlink(backup.directory, link);
    await expect(readVerifiedTargetBackup(link)).rejects.toThrow("BACKUP_UNSAFE_PATH");
    await expect(writeTargetBackup(snapshot, path.join(testRoot, "linked", "new"))).rejects.toThrow("BACKUP_UNSAFE_PATH");
    await expect(readVerifiedTargetBackup(`${testRoot}/../${path.basename(testRoot)}`)).rejects.toThrow("BACKUP_UNSAFE_PATH");
    const payload = path.join(backup.directory, "snapshot.bson");
    await chmod(payload, 0o644);
    await expect(readVerifiedTargetBackup(backup.directory)).rejects.toThrow("BACKUP_UNSAFE_FILE");
    await chmod(payload, 0o600);
    await writeFile(path.join(backup.directory, "unexpected"), "synthetic");
    await expect(readVerifiedTargetBackup(backup.directory)).rejects.toThrow("BACKUP_INVALID");
  });

  it("rechecks content digest even when payload and manifest checksums were recomputed", async () => {
    const backup = await writeTargetBackup(fixture(), testRoot);
    const payloadPath = path.join(backup.directory, "snapshot.bson");
    const manifestPath = path.join(backup.directory, "manifest.json");
    const document = mongo.BSON.deserialize(await readFile(payloadPath), { promoteValues: false });
    document.collections.find((row: { name: string }) => row.name === VENDORS).documents[0].privateField = "changed";
    const payload = mongo.BSON.serialize(document);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.payloadBytes = payload.length;
    manifest.payloadSha256 = createHash("sha256").update(payload).digest("hex");
    await writeFile(payloadPath, payload);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(readVerifiedTargetBackup(backup.directory)).rejects.toThrow("SNAPSHOT_DIGEST_MISMATCH");
  });

  it("rejects hardlinked and symlinked payload files", async () => {
    const snapshot = fixture();
    const backup = await writeTargetBackup(snapshot, testRoot);
    const payloadPath = path.join(backup.directory, "snapshot.bson");
    const outside = path.join(testRoot, "outside.bson");
    await link(payloadPath, outside);
    await expect(readVerifiedTargetBackup(backup.directory)).rejects.toThrow("BACKUP_UNSAFE_FILE");
    await rm(payloadPath);
    await symlink(outside, payloadPath);
    await expect(readVerifiedTargetBackup(backup.directory)).rejects.toThrow("BACKUP_IO_FAILED");
  });
});

describe("disposable replica-set restore drill", { timeout: 30_000 }, () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(path.join(await realpath(tmpdir()), "lisno-estimator-restore-test-"));
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    client = new mongo.MongoClient(replica.getUri());
    await client.connect();
  }, 120_000);
  afterAll(async () => { await client?.close(); await replica?.stop(); if (root) await rm(root, { recursive: true, force: true }); });

  it("restores documents, metadata, ordered indexes and collection options into a fresh test database only", async () => {
    const original = client.db("backup_fixture_original");
    await original.createCollection(VENDORS, { validationLevel: "strict", validator: { _id: { $type: "string" } } });
    await original.collection(VENDORS).createIndex({ z: 1, a: -1 }, { name: "ordered", unique: true });
    await original.collection<mongo.Document>(VENDORS).insertOne({ _id: "test-painting", z: "z", a: "a", amount: mongo.BSON.Long.fromString("9007199254740993") });
    await original.collection<mongo.Document>(SYNC_METADATA_COLLECTIONS[0]).insertOne({ _id: "baseline", generation: 3 });
    const snapshot = await readDatabaseSnapshot(client, original.databaseName, { role: "target", identity: "fixture" });
    const backup = await writeTargetBackup(snapshot, root);
    const saved = await readVerifiedTargetBackup(backup.directory);
    // There is deliberately no application restore API. The only restore code
    // operates on this newly created, ephemeral fixture database.
    const restored = client.db("backup_fixture_restored");
    expect(await restored.listCollections().toArray()).toEqual([]);
    for (const row of [...saved.collections, ...saved.metadataCollections]) {
      if (!row.exists) continue;
      await restored.createCollection(row.name, row.options);
      if (row.documents.length) await restored.collection<mongo.Document>(row.name).insertMany(row.documents);
      const indexes = row.indexes.filter(index => index.name !== "_id_");
      if (indexes.length) await restored.collection(row.name).createIndexes(indexes as mongo.IndexDescription[]);
    }
    const after = await readDatabaseSnapshot(client, restored.databaseName, { role: "target", identity: "fixture" });
    const withoutUuid = (value: SyncSnapshot) => [...value.collections, ...value.metadataCollections].map(({ uuid: _uuid, ...row }) => row);
    expect(canonical(withoutUuid(after))).toBe(canonical(withoutUuid(snapshot)));
    expect(Object.keys(after.collections.find(row => row.name === VENDORS)!.indexes.find(index => index.name === "ordered")!.key)).toEqual(["z", "a"]);
  });
});
