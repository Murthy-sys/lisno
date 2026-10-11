import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mongo } from "mongoose";
import { snapshotDigest } from "../src/operations/estimator-sync/canonical.js";
import { readDatabaseSnapshot } from "../src/operations/estimator-sync/snapshot.js";
import { REQUIRED_SOURCE_COLLECTIONS, SYNC_COLLECTIONS, SYNC_LIMITS, SYNC_METADATA_COLLECTIONS } from "../src/operations/estimator-sync/manifest.js";

const VENDORS = "aiEstimatorKnowledgeVendors";

function fakeClient(options: { changedIndex?: boolean; invalidId?: boolean; interrupted?: boolean; standalone?: boolean; tooMany?: boolean } = {}) {
  const cursor = (rows: mongo.Document[]) => ({ async *[Symbol.asyncIterator]() { yield* rows; }, close: async () => {} });
  let catalogues = 0;
  const findCalls: Array<{ name: string; options: mongo.FindOptions }> = [];
  const ended = vi.fn(async () => {});
  const session = { endSession: ended };
  const db = {
    admin: () => ({ command: async () => options.standalone ? { maxWireVersion: 25 } : { setName: "test", maxWireVersion: 25 } }),
    listCollections: (_filter: unknown, opts: mongo.ListCollectionsOptions) => {
      expect(opts.session).toBeUndefined();
      catalogues += 1;
      return cursor(REQUIRED_SOURCE_COLLECTIONS.map(name => ({ name, type: "collection", info: { uuid: new mongo.BSON.Binary(Buffer.alloc(16, 1), 4) }, options: {} })));
    },
    collection: (name: string) => ({
      listIndexes: (opts: mongo.ListIndexesOptions) => {
        expect(opts.session).toBeUndefined();
        return cursor([{ name: "compound", key: options.changedIndex && catalogues > 1 ? { a: 1, z: 1 } : { z: 1, a: 1 } }]);
      },
      find: (_filter: unknown, opts: mongo.FindOptions) => {
        findCalls.push({ name, options: opts });
        return {
          async *[Symbol.asyncIterator]() {
            if (options.interrupted) throw new Error("mongodb://private:secret@example.invalid/sensitive");
            if (name === VENDORS) {
              for (let index = 0; index < (options.tooMany ? SYNC_LIMITS.maxDocuments + 1 : 1); index += 1) yield { _id: options.invalidId ? new mongo.BSON.ObjectId() : String(index).padStart(8, "0") };
            }
          },
          close: async () => {}
        };
      }
    })
  };
  const startSession = vi.fn(() => session);
  return { client: { db: () => db, startSession } as unknown as mongo.MongoClient, findCalls, startSession, session, ended };
}

describe("write-free consistent snapshot scanner", () => {
  it("uses one snapshot session, strict BSON reads, explicit missing entries and no catalogue sessions", async () => {
    const fake = fakeClient();
    const result = await readDatabaseSnapshot(fake.client, "synthetic", { role: "source", identity: "source-fixture" });
    expect(result.collections.map(row => row.name)).toEqual(SYNC_COLLECTIONS);
    expect(result.collections.filter(row => !row.exists)).toHaveLength(13);
    expect(result.metadataCollections).toEqual([]);
    expect(result.contentDigest).toBe(snapshotDigest(result));
    expect(fake.startSession).toHaveBeenCalledWith({ snapshot: true, causalConsistency: false });
    expect(fake.findCalls).toHaveLength(16);
    for (const call of fake.findCalls) expect(call.options).toMatchObject({ session: fake.session, promoteValues: false, promoteLongs: false, promoteBuffers: false, bsonRegExp: true });
    expect(fake.ended).toHaveBeenCalledOnce();
  });

  it("reuses an active transaction without starting or closing its caller-owned session", async () => {
    const fake = fakeClient();
    const session = { inTransaction: () => true, endSession: vi.fn() } as unknown as mongo.ClientSession;
    await readDatabaseSnapshot(fake.client, "synthetic", { role: "source", identity: "source-fixture", session });
    expect(fake.startSession).not.toHaveBeenCalled();
    expect(session.endSession).not.toHaveBeenCalled();
    expect(fake.findCalls.every(call => call.options.session === session)).toBe(true);
    await expect(readDatabaseSnapshot(fake.client, "synthetic", { role: "source", identity: "source-fixture", session: { inTransaction: () => false } as mongo.ClientSession })).rejects.toThrow("SNAPSHOT_TRANSACTION_REQUIRED");
  });

  it.each([
    [{ changedIndex: true }, "SNAPSHOT_CATALOGUE_CHANGED"],
    [{ invalidId: true }, "SNAPSHOT_INVALID_ID"],
    [{ interrupted: true }, "SNAPSHOT_READ_FAILED"],
    [{ standalone: true }, "SNAPSHOT_CONSISTENCY_UNSUPPORTED"],
    [{ tooMany: true }, "SNAPSHOT_RESOURCE_LIMIT"]
  ])("rejects unsafe/incomplete input with a redacted error: %j", async (options, code) => {
    const fake = fakeClient(options);
    await expect(readDatabaseSnapshot(fake.client, "synthetic", { role: "source", identity: "source-fixture" })).rejects.toThrow(code);
  });
});

describe("native replica-set snapshot reads", { timeout: 30_000 }, () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  let sequence = 0;
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    client = new mongo.MongoClient(replica.getUri(), { monitorCommands: true });
    await client.connect();
  }, 120_000);
  afterAll(async () => { await client?.close(); await replica?.stop(); });
  const freshDb = () => client.db(`snapshot_fixture_${++sequence}`);

  it("preserves BSON types, metadata, index order and reads only user IDs without creating namespaces", async () => {
    const db = freshDb();
    await db.createCollection(VENDORS);
    await db.collection(VENDORS).createIndex({ z: 1, a: -1 }, { name: "ordered" });
    await db.collection<mongo.Document>(VENDORS).insertOne({
      _id: "vendor-fixture", amount: mongo.BSON.Long.fromString("9007199254740993"), integer: new mongo.BSON.Int32(7),
      decimal: mongo.BSON.Decimal128.fromString("1.25"), when: new Date("2026-10-11T00:00:00Z"),
      regex: new mongo.BSON.BSONRegExp("^fixture", "i"), bytes: new mongo.BSON.Binary(Buffer.from([1, 2]), 0),
      geoTaggedPicture: { storageReference: "opaque-photo" }, msmeCertificate: { storageReference: "opaque-certificate" }
    });
    await db.collection<mongo.Document>("users").insertOne({ _id: "fixture-actor", email: "private@example.invalid", secret: "must-not-read" });
    await db.collection<mongo.Document>(SYNC_METADATA_COLLECTIONS[1]).insertOne({ _id: "sync", fence: 4 });
    const before = await db.listCollections({}, { nameOnly: true }).toArray();
    const commands: mongo.CommandStartedEvent[] = [];
    const listener = (event: mongo.CommandStartedEvent) => commands.push(event);
    client.on("commandStarted", listener);
    const storageExists = vi.fn(async (reference: string) => reference !== "opaque-certificate");
    const result = await readDatabaseSnapshot(client, db.databaseName, { role: "target", identity: "target-fixture", storageReferencesToCheck: ["source-photo"], storageExists });
    client.off("commandStarted", listener);
    expect(result.collections).toHaveLength(16);
    expect(result.metadataCollections).toHaveLength(2);
    expect(result.metadataCollections[0]).toMatchObject({ exists: false, documents: [] });
    const vendor = result.collections.find(row => row.name === VENDORS)!;
    expect(vendor.documents[0].amount).toBeInstanceOf(mongo.BSON.Long);
    expect(vendor.documents[0].integer).toBeInstanceOf(mongo.BSON.Int32);
    expect(vendor.documents[0].decimal).toBeInstanceOf(mongo.BSON.Decimal128);
    expect(vendor.documents[0].when).toBeInstanceOf(Date);
    expect(vendor.documents[0].regex).toBeInstanceOf(mongo.BSON.BSONRegExp);
    expect(vendor.documents[0].bytes).toBeInstanceOf(mongo.BSON.Binary);
    expect(Object.keys(vendor.indexes.find(index => index.name === "ordered")!.key)).toEqual(["z", "a"]);
    expect(result.dependencies).toEqual({ actorIds: ["fixture-actor"], availableStorageReferences: ["opaque-photo", "source-photo"] });
    expect(commands.find(event => event.command.find === "users")?.command.projection).toEqual({ _id: 1 });
    expect(commands.some(event => ["insert", "update", "delete", "create", "createIndexes", "drop"].includes(event.commandName))).toBe(false);
    expect(await db.listCollections({}, { nameOnly: true }).toArray()).toEqual(before);
    expect(JSON.stringify(result)).not.toContain("private@example.invalid");
  });

  it("distinguishes an absent required source namespace from a fully empty source", async () => {
    const db = freshDb();
    await expect(readDatabaseSnapshot(client, db.databaseName, { role: "source", identity: "fixture" })).rejects.toThrow("SNAPSHOT_SOURCE_COLLECTION_MISSING");
    for (const name of REQUIRED_SOURCE_COLLECTIONS) await db.createCollection(name);
    await expect(readDatabaseSnapshot(client, db.databaseName, { role: "source", identity: "fixture" })).rejects.toThrow("SNAPSHOT_SOURCE_EMPTY");
    await db.collection<mongo.Document>(VENDORS).insertOne({ _id: "vendor-fixture" });
    const snapshot = await readDatabaseSnapshot(client, db.databaseName, { role: "source", identity: "fixture" });
    expect(snapshot.collections.find(row => row.name === REQUIRED_SOURCE_COLLECTIONS[0])).toMatchObject({ exists: true, documents: [] });
    expect(snapshot.collections.find(row => row.name === "aiEstimatorKnowledgeModes")).toMatchObject({ exists: false, documents: [] });
  });

  it("reads through a supplied snapshot transaction and leaves it active", async () => {
    const db = freshDb();
    await db.collection<mongo.Document>(VENDORS).insertOne({ _id: "vendor-fixture" });
    const session = client.startSession();
    try {
      session.startTransaction({ readConcern: { level: "snapshot" } });
      const snapshot = await readDatabaseSnapshot(client, db.databaseName, { role: "target", identity: "fixture", session });
      expect(snapshot.collections.find(row => row.name === VENDORS)?.documents[0]._id).toBe("vendor-fixture");
      expect(session.inTransaction()).toBe(true);
      await session.abortTransaction();
    } finally { await session.endSession(); }
  });
});
