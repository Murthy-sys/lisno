import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, realpath, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mongo } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { applySyncPlan } from "../src/operations/estimator-sync/apply.js";
import { assertTargetTopology, connectionIdentity, createTargetClient, validateTargetUri } from "../src/operations/estimator-sync/authority.js";
import { hash } from "../src/operations/estimator-sync/canonical.js";
import { readVerifiedTargetBackup } from "../src/operations/estimator-sync/backup.js";
import { readDatabaseSnapshot } from "../src/operations/estimator-sync/snapshot.js";
import { buildSyncPlan } from "../src/operations/estimator-sync/planner.js";
import { acquireLease, fenceLease, releaseLease } from "../src/operations/estimator-sync/metadata.js";
import { LEASE_COLLECTION, MAINTENANCE_CONFIRMATION, STATE_COLLECTION, SYNC_COLLECTIONS } from "../src/operations/estimator-sync/manifest.js";
import type { SyncDocument } from "../src/operations/estimator-sync/contracts.js";

const VENDORS = "aiEstimatorKnowledgeVendors";
const time = new Date("2026-10-10T00:00:00Z");
const vendor = (id: string, patch: mongo.Document = {}): SyncDocument => ({_id: id, code: id, codeNormalized: id,
  name: id, nameNormalized: id, description: null, displayOrder: 1, status: "active", version: 1,
  dependencyEpoch: 0, kpiRubricGeneration: 0, createdById: "actor", updatedById: "actor", createdAt: time,
  updatedAt: time, archivedAt: null, archivedById: null, ...patch});

describe("isolated replica-set estimator application", {timeout: 45_000}, () => {
  let replica: MongoMemoryReplSet;
  let sourceClient: mongo.MongoClient, client: mongo.MongoClient;
  let sourceIdentity: string, targetIdentity: string, backupRoot: string;
  const sourceDb = () => sourceClient.db("lisno");
  const targetDb = () => client.db("lisno_demo");
  const targetVendors = () => targetDb().collection<SyncDocument>(VENDORS);
  const sourceVendors = () => sourceDb().collection<SyncDocument>(VENDORS);
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({replSet: {count: 1, storageEngine: "wiredTiger"}});
    const sourceUri = replica.getUri("lisno"), targetUri = replica.getUri("lisno_demo");
    sourceClient = new mongo.MongoClient(sourceUri, {monitorCommands: true});
    client = createTargetClient(targetUri);
    sourceIdentity = connectionIdentity(sourceUri); targetIdentity = connectionIdentity(targetUri);
    await sourceClient.connect(); await client.connect();
  }, 120_000);
  afterAll(async () => { await sourceClient?.close(); await client?.close(); await replica?.stop(); });
  beforeEach(async () => {
    await sourceDb().dropDatabase(); await targetDb().dropDatabase();
    for (const name of SYNC_COLLECTIONS) { await sourceDb().createCollection(name); await targetDb().createCollection(name); }
    await targetDb().collection<mongo.Document>("users").insertOne({_id: "actor", secret: "private-user-field"});
    await sourceVendors().insertOne(vendor("shared"));
    await targetVendors().insertMany([vendor("shared"), vendor("test-pop", {description: "local-pop"}), vendor("test-painting", {description: "local-paint"})]);
    await targetVendors().createIndex({nameNormalized: 1}, {unique: true, partialFilterExpression: {status: {$in: ["active", "inactive"]}}});
    backupRoot = await mkdtemp(path.join(await realpath(tmpdir()), "lisno-sync-apply-test-"));
  });
  afterEach(async () => { vi.restoreAllMocks(); await rm(backupRoot, {recursive: true, force: true}); });
  async function preview() {
    const source = await readDatabaseSnapshot(sourceClient, "lisno", {role: "source", identity: sourceIdentity});
    const target = await readDatabaseSnapshot(client, "lisno_demo", {role: "target", identity: targetIdentity});
    const plan = buildSyncPlan({source, target});
    return {client, source, target, plan, backupRoot, maintenanceConfirmation: MAINTENANCE_CONFIRMATION};
  }
  async function adopt() {
    const input = await preview();
    expect(input.plan.conflicts).toEqual([]);
    const result = await applySyncPlan(input);
    expect(result.written).toBe(0);
    return result;
  }

  it("backs up, atomically imports safe changes, preserves local data/indexes/history and replays without writes", async () => {
    await targetDb().collection<mongo.Document>("approvedEstimates").insertOne({_id: "approved", amountPaise: 912345, version: 9});
    const approvedBefore = hash(await targetDb().collection("approvedEstimates").find().toArray());
    const localBefore = hash(await targetVendors().find({_id: {$in: ["test-pop", "test-painting"]}}).sort({_id: 1}).toArray());
    const first = await adopt();
    expect(first.backup).not.toBeNull();
    expect((await readVerifiedTargetBackup(first.backup!.directory)).metadataCollections.find(row => row.name === STATE_COLLECTION)!.exists).toBe(false);
    await sourceVendors().updateOne({_id: "shared"}, {$set: {description: "source-new", version: 4}});
    await sourceVendors().insertOne(vendor("new-vendor"));
    const input = await preview();
    expect(input.plan.conflicts).toEqual([]);
    expect(input.plan.writes).toHaveLength(2);
    const result = await applySyncPlan(input);
    expect(result).toMatchObject({status: "applied", written: 2});
    const shared = await targetVendors().findOne({_id: "shared"});
    expect(shared!.description).toBe("source-new");
    expect(Number(shared!.version)).toBeGreaterThan(1);
    // A pre-import editor's version can no longer pass CAS.
    expect((await targetVendors().updateOne({_id: "shared", version: 1}, {$set: {description: "stale"}})).matchedCount).toBe(0);
    expect(hash(await targetVendors().find({_id: {$in: ["test-pop", "test-painting"]}}).sort({_id: 1}).toArray())).toBe(localBefore);
    expect(hash(await targetDb().collection("approvedEstimates").find().toArray())).toBe(approvedBefore);
    const again = await preview();
    const metadataBefore = hash(await targetDb().collection(LEASE_COLLECTION).find().toArray());
    const backupCount = (await readdir(backupRoot)).length;
    expect(await applySyncPlan(again)).toMatchObject({status: "unchanged", backup: null, written: 0});
    expect(hash(await targetDb().collection(LEASE_COLLECTION).find().toArray())).toBe(metadataBefore);
    expect((await readdir(backupRoot)).length).toBe(backupCount);
  });

  it("records local edits and deletions without changing them, then blocks source conflicts", async () => {
    await adopt();
    await targetVendors().updateOne({_id: "shared"}, {$set: {description: "edited-locally", version: 2}});
    await targetVendors().deleteOne({_id: "test-pop"});
    const preservation = await preview();
    expect(preservation.plan.conflicts).toEqual([]);
    expect(preservation.plan.writes).toHaveLength(0);
    await applySyncPlan(preservation);
    const before = await readDatabaseSnapshot(client, "lisno_demo", {role: "target", identity: targetIdentity});
    await sourceVendors().updateOne({_id: "shared"}, {$set: {description: "changed-upstream", version: 3}});
    await sourceVendors().insertOne(vendor("test-pop"));
    const conflicting = await preview();
    expect(conflicting.plan.conflicts.map(row => row.code)).toContain("PROTECTED_LOCAL_DIVERGENCE");
    await expect(applySyncPlan(conflicting)).rejects.toThrow("SYNC_CONFLICTS");
    expect((await readDatabaseSnapshot(client, "lisno_demo", {role: "target", identity: targetIdentity})).contentDigest).toBe(before.contentDigest);
    expect(await targetVendors().findOne({_id: "test-pop"})).toBeNull();
  });

  it("rejects stale plans and missing maintenance before any lease, metadata or backup writes", async () => {
    const input = await preview();
    await expect(applySyncPlan({...input, maintenanceConfirmation: ""})).rejects.toThrow("MAINTENANCE_REQUIRED");
    await targetVendors().updateOne({_id: "shared"}, {$set: {description: "racing-local-edit"}});
    await expect(applySyncPlan(input)).rejects.toThrow("STALE_TARGET");
    expect(await targetDb().listCollections({name: {$in: [STATE_COLLECTION, LEASE_COLLECTION]}}).toArray()).toHaveLength(0);
    expect(await readdir(backupRoot)).toEqual([]);
  });

  it("rolls back the whole batch and baseline on an injected failure after a business write", async () => {
    await adopt();
    await sourceVendors().updateOne({_id: "shared"}, {$set: {description: "updated", version: 3}});
    await sourceVendors().insertOne(vendor("zz-new-vendor"));
    const input = await preview();
    expect(input.plan.writes.map(write => write.id)).toEqual(["shared", "zz-new-vendor"]);
    const before = hash(await targetVendors().find().sort({_id: 1}).toArray());
    const baseline = hash(await targetDb().collection(STATE_COLLECTION).find().toArray());
    const original = mongo.Collection.prototype.insertOne;
    vi.spyOn(mongo.Collection.prototype, "insertOne").mockImplementation(async function (this: mongo.Collection, document, options) {
      if (this.namespace === `lisno_demo.${VENDORS}` && document._id === "zz-new-vendor") throw new Error("injected private payload must not escape");
      return original.call(this, document, options);
    });
    await expect(applySyncPlan(input)).rejects.toThrow("APPLY_FAILED_CHECK_BASELINE");
    expect(hash(await targetVendors().find().sort({_id: 1}).toArray())).toBe(before);
    expect(hash(await targetDb().collection(STATE_COLLECTION).find().toArray())).toBe(baseline);
    expect((await readdir(backupRoot)).length).toBe(2);
  });

  it("serializes competing syncs and prevents an expired owner from fencing a successor", async () => {
    const now = new Date();
    const owner = await acquireLease(targetDb(), "owner-a", now);
    await expect(acquireLease(targetDb(), "owner-b", now)).rejects.toThrow("SYNC_BUSY");
    const successor = await acquireLease(targetDb(), "owner-b", new Date(now.getTime() + 120_001));
    expect(successor.fence).toBeGreaterThan(owner.fence);
    await releaseLease(targetDb(), owner);
    const session = client.startSession();
    try {
      await expect(session.withTransaction(() => fenceLease(targetDb(), owner, session))).rejects.toThrow("LEASE_LOST");
      await session.withTransaction(() => fenceLease(targetDb(), successor, session));
    } finally { await session.endSession(); }
    expect((await targetDb().collection(LEASE_COLLECTION).findOne({_id: "apply"} as mongo.Filter<mongo.Document>))!.owner).toBe("owner-b");
  });

  it("keeps the source connection read-only throughout preview and apply", async () => {
    const commands: string[] = [];
    const listener = (event: mongo.CommandStartedEvent) => commands.push(event.commandName);
    sourceClient.on("commandStarted", listener);
    try { await adopt(); }
    finally { sourceClient.off("commandStarted", listener); }
    expect(commands).toContain("find");
    expect(commands.some(name => ["insert", "update", "delete", "drop", "create", "createIndexes", "findAndModify"].includes(name))).toBe(false);
  });

  it("fails closed when a previously committed baseline goes missing", async () => {
    await adopt();
    await targetDb().collection(STATE_COLLECTION).drop();
    await expect(preview()).rejects.toThrow("BASELINE_MISSING");
  });
});

describe("target authority", () => {
  it.each(["mongodb://prod.invalid/lisno_demo", "mongodb://127.0.0.1/lisno", "mongodb://127.0.0.1/lisno_demo?directConnection=false", "mongodb+srv://localhost/lisno_demo", "mongodb://127.0.0.1/lisno_demo?readPreference=secondary", "mongodb://127.0.0.1/lisno_demo?loadBalanced=true"])("rejects %s", uri => expect(() => validateTargetUri(uri)).toThrow("TARGET_NOT_ALLOWED"));
  it("rejects standalone topology", async () => {
    const client = {options: {dbName: "lisno_demo", directConnection: true, hosts: [{host: "127.0.0.1"}]}, db: () => ({command: async () => ({isWritablePrimary: true, maxWireVersion: 25})})} as unknown as mongo.MongoClient;
    await expect(assertTargetTopology(client)).rejects.toThrow("TARGET_REPLICA_SET_REQUIRED");
  });
});
