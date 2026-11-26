import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DESIGNER_REQUEST_COLLECTION, DESIGNER_REQUEST_LEGACY_INDEX, DESIGNER_REQUEST_PAIR_INDEX,
  inspectDesignerRequestIndex, migrateDesignerRequestIndex, runDesignerRequestIndexCommand
} from "../src/migrations/designer-assignment-request-index.js";
import { DesignerAssignmentRequestModel } from "../src/models/DesignerAssignmentRequest.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let collection: mongoose.mongo.Collection;
let metadataDirectory: string;
beforeAll(async () => {
  replica = await startMongoReplicaSet("designer-request-index-tests");
  metadataDirectory = await mkdtemp(join(tmpdir(), "designer-request-index-"));
}, 120_000);
beforeEach(async () => {
  collection = mongoose.connection.db!.collection(DESIGNER_REQUEST_COLLECTION);
  await collection.drop().catch(error => { if (error.code !== 26) throw error; });
  await mongoose.connection.db!.createCollection(collection.collectionName);
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => {
  await replica?.stop();
  if (metadataDirectory) await rm(metadataDirectory, { recursive: true, force: true });
});

const row = (id: string, designerId = "designer-a", status = "pending", projectId = "project-a") =>
  ({ _id: id as never, projectId, designerId, status, version: 1, immutableSource: { estimateId: "estimate-a" } });
const legacy = () => collection.createIndex({ projectId: 1 }, {
  name: DESIGNER_REQUEST_LEGACY_INDEX, unique: true, partialFilterExpression: { status: "pending" }
});
const pair = () => collection.createIndex({ projectId: 1, designerId: 1 }, {
  name: DESIGNER_REQUEST_PAIR_INDEX, unique: true, partialFilterExpression: { status: "pending" }
});
const writes = () => ({ backupVerified: true, writesQuiesced: true, backupIndexMetadata: vi.fn(async () => {}) });
const rows = () => collection.find().sort({ _id: 1 }).toArray();

describe("Designer assignment request index transition", () => {
  it("uses the real model collection and declared pair-index definition", () => {
    expect(DESIGNER_REQUEST_COLLECTION).toBe(DesignerAssignmentRequestModel.collection.collectionName);
    expect(DesignerAssignmentRequestModel.schema.indexes()).toContainEqual([
      { projectId: 1, designerId: 1 },
      expect.objectContaining({ name: DESIGNER_REQUEST_PAIR_INDEX, unique: true, partialFilterExpression: { status: "pending" } })
    ]);
    expect(DesignerAssignmentRequestModel.schema.indexes().some(([, options]) => options.name === DESIGNER_REQUEST_LEGACY_INDEX)).toBe(false);
  });

  it("dry-runs legacy data without changing documents or indexes", async () => {
    await legacy();
    await collection.insertMany([row("pending"), row("accepted", "designer-a", "accepted"), row("cancelled", "designer-b", "cancelled")]);
    const beforeRows = await rows();
    const beforeIndexes = await collection.listIndexes().toArray();
    expect(await migrateDesignerRequestIndex(collection)).toMatchObject({
      mode: "dry-run", collectionExists: true, legacyPresent: true, replacementPresent: false,
      requestCount: 3, pendingCount: 1, indexConflicts: [], invalidPendingRequestIds: [], duplicatePendingPairs: [], multiplePendingProjects: []
    });
    expect(await rows()).toEqual(beforeRows);
    expect(await collection.listIndexes().toArray()).toEqual(beforeIndexes);
  });

  it("inspects a fresh absent collection without creating it", async () => {
    await collection.drop();
    expect(await inspectDesignerRequestIndex(collection)).toMatchObject({ collectionExists: false, indexes: [], requestCount: 0, pendingCount: 0 });
    expect(await mongoose.connection.db!.listCollections({ name: DESIGNER_REQUEST_COLLECTION }).hasNext()).toBe(false);
    expect(await migrateDesignerRequestIndex(collection, { mode: "apply", ...writes() })).toMatchObject({
      collectionExists: true, replacementPresent: true, legacyPresent: false
    });
  });

  it("verifies pair protection before dropping legacy and preserves all history and unrelated indexes", async () => {
    await legacy();
    await collection.createIndex({ projectId: 1, createdAt: -1 }, { name: "retained_request_history" });
    await collection.insertMany([row("pending"), row("accepted", "designer-a", "accepted"), row("declined", "designer-a", "declined")]);
    const beforeRows = await rows();
    const drop = collection.dropIndex.bind(collection);
    const dropSpy = vi.spyOn(collection, "dropIndex").mockImplementation(async (name, options) => {
      expect(name).toBe(DESIGNER_REQUEST_LEGACY_INDEX);
      expect((await inspectDesignerRequestIndex(collection)).replacementPresent).toBe(true);
      return drop(name, options);
    });
    const backup = vi.fn(async () => { expect(await collection.indexExists(DESIGNER_REQUEST_LEGACY_INDEX)).toBe(true); });
    const result = await migrateDesignerRequestIndex(collection, { mode: "apply", ...writes(), backupIndexMetadata: backup });
    expect(result).toMatchObject({ mode: "apply", replacementPresent: true, legacyPresent: false, indexConflicts: [] });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(dropSpy).toHaveBeenCalledTimes(1);
    expect(await rows()).toEqual(beforeRows);
    expect(await collection.indexExists("retained_request_history")).toBe(true);
    await collection.insertOne(row("second", "designer-b"));
    await expect(collection.insertOne(row("duplicate", "designer-a"))).rejects.toMatchObject({ code: 11000 });
    await collection.insertOne(row("other-project", "designer-a", "pending", "project-b"));
  });

  it("is safe to apply repeatedly and can finish a transition with both indexes present", async () => {
    await legacy();
    await pair();
    const first = await migrateDesignerRequestIndex(collection, { mode: "apply", ...writes() });
    const options = writes();
    const second = await migrateDesignerRequestIndex(collection, { mode: "apply", ...options });
    expect(second).toEqual(first);
    expect(options.backupIndexMetadata).not.toHaveBeenCalled();
  });

  it("reports duplicate pending pairs in stable order and refuses writes without changing requests", async () => {
    await collection.insertMany([row("z"), row("a"), row("history", "designer-a", "accepted"), row("other", "designer-b")]);
    const before = await rows();
    expect(await inspectDesignerRequestIndex(collection)).toMatchObject({
      duplicatePendingPairs: [{ projectId: "project-a", designerId: "designer-a", requestIds: ["a", "z"], count: 2 }],
      multiplePendingProjects: [{ projectId: "project-a", requestIds: ["a", "other", "z"], count: 3 }]
    });
    const options = writes();
    await expect(migrateDesignerRequestIndex(collection, { mode: "apply", ...options })).rejects.toThrow("duplicate pending pairs");
    expect(options.backupIndexMetadata).not.toHaveBeenCalled();
    expect(await rows()).toEqual(before);
    expect(await collection.indexExists(DESIGNER_REQUEST_PAIR_INDEX)).toBe(false);
  });

  it("allows distinct pending Designers during apply but refuses unsafe rollback without deleting them", async () => {
    await collection.insertMany([row("a"), row("b", "designer-b"), row("history", "designer-a", "cancelled")]);
    await migrateDesignerRequestIndex(collection, { mode: "apply", ...writes() });
    const before = await rows();
    const beforeIndexes = await collection.listIndexes().toArray();
    await expect(migrateDesignerRequestIndex(collection, { mode: "rollback", ...writes() })).rejects.toThrow("multiple pending requests");
    expect(await rows()).toEqual(before);
    expect(await collection.listIndexes().toArray()).toEqual(beforeIndexes);
  });

  it("rebuilds legacy protection before retiring the pair index and supports repeated rollback", async () => {
    await pair();
    await collection.insertMany([row("a"), row("historical", "designer-b", "accepted")]);
    const before = await rows();
    const drop = collection.dropIndex.bind(collection);
    const dropSpy = vi.spyOn(collection, "dropIndex").mockImplementation(async (name, options) => {
      expect(name).toBe(DESIGNER_REQUEST_PAIR_INDEX);
      expect((await inspectDesignerRequestIndex(collection)).legacyPresent).toBe(true);
      return drop(name, options);
    });
    const result = await migrateDesignerRequestIndex(collection, { mode: "rollback", ...writes() });
    expect(result).toMatchObject({ mode: "rollback", legacyPresent: true, replacementPresent: false });
    expect(await migrateDesignerRequestIndex(collection, { mode: "rollback", ...writes() })).toEqual(result);
    expect(dropSpy).toHaveBeenCalledTimes(1);
    expect(await rows()).toEqual(before);
    await expect(collection.insertOne(row("b", "designer-b"))).rejects.toMatchObject({ code: 11000 });
  });

  it.each([
    [DESIGNER_REQUEST_LEGACY_INDEX, { projectId: 1 }, { unique: false, partialFilterExpression: { status: "pending" } }],
    [DESIGNER_REQUEST_PAIR_INDEX, { projectId: 1, designerId: 1 }, { unique: true }],
    [DESIGNER_REQUEST_PAIR_INDEX, { projectId: 1, designerId: 1 }, { unique: true, partialFilterExpression: { status: "accepted" } }],
    [DESIGNER_REQUEST_PAIR_INDEX, { designerId: 1, projectId: 1 }, { unique: true, partialFilterExpression: { status: "pending" } }],
    ["unknown_project_uniqueness", { projectId: 1, status: 1 }, { unique: true }]
  ])("refuses unexpected index definition %s", async (name, key, options) => {
    await collection.createIndex(key as mongoose.mongo.IndexSpecification, { ...options, name });
    const before = await collection.listIndexes().toArray();
    expect((await inspectDesignerRequestIndex(collection)).indexConflicts).toHaveLength(1);
    await expect(migrateDesignerRequestIndex(collection, { mode: "apply", ...writes() })).rejects.toThrow("index definitions");
    expect(await collection.listIndexes().toArray()).toEqual(before);
  });

  it("refuses pending rows with missing or invalid stable identities", async () => {
    await collection.insertMany([{ ...row("bad-project"), projectId: null }, { ...row("bad-designer"), designerId: "" }]);
    expect((await inspectDesignerRequestIndex(collection)).invalidPendingRequestIds).toEqual(["bad-designer", "bad-project"]);
    await expect(migrateDesignerRequestIndex(collection, { mode: "apply", ...writes() })).rejects.toThrow("invalid pending identities");
  });

  it.each(["apply", "rollback"] as const)("requires backup and quiesced writes for %s", async mode => {
    await legacy();
    for (const options of [{}, { backupVerified: true }, { backupVerified: true, writesQuiesced: true },
      { writesQuiesced: true, backupIndexMetadata: async () => {} }]) {
      await expect(migrateDesignerRequestIndex(collection, { mode, ...options })).rejects.toThrow("quiesced assignment writes");
    }
    expect(await collection.indexExists(DESIGNER_REQUEST_LEGACY_INDEX)).toBe(true);
  });

  it("retains legacy protection if backup, index creation, or verification fails", async () => {
    await legacy();
    await expect(migrateDesignerRequestIndex(collection, { mode: "apply", ...writes(), backupIndexMetadata: async () => { throw new Error("backup failed"); } })).rejects.toThrow("backup failed");
    const create = vi.spyOn(collection, "createIndex").mockRejectedValueOnce(new Error("index build failed"));
    await expect(migrateDesignerRequestIndex(collection, { mode: "apply", ...writes() })).rejects.toThrow("index build failed");
    create.mockResolvedValueOnce(DESIGNER_REQUEST_PAIR_INDEX);
    await expect(migrateDesignerRequestIndex(collection, { mode: "apply", ...writes() })).rejects.toThrow("could not be verified");
    expect(await collection.indexExists(DESIGNER_REQUEST_LEGACY_INDEX)).toBe(true);
    expect(await collection.indexExists(DESIGNER_REQUEST_PAIR_INDEX)).toBe(false);
  });

  it("rechecks data after metadata capture before an index write", async () => {
    await expect(migrateDesignerRequestIndex(collection, { mode: "apply", ...writes(), backupIndexMetadata: async () => {
      await collection.insertMany([row("a"), row("b")]);
    } })).rejects.toThrow("duplicate pending pairs");
    expect(await collection.indexExists(DESIGNER_REQUEST_PAIR_INDEX)).toBe(false);
  });

  it("refuses index drift after metadata capture", async () => {
    await legacy();
    await expect(migrateDesignerRequestIndex(collection, { mode: "apply", ...writes(), backupIndexMetadata: async () => {
      await collection.createIndex({ createdAt: -1 }, { name: "concurrent-index" });
    } })).rejects.toThrow("changed after metadata capture");
    expect(await collection.indexExists(DESIGNER_REQUEST_LEGACY_INDEX)).toBe(true);
  });

  it("retains both indexes after a failed drop and safely resumes", async () => {
    await legacy();
    const drop = vi.spyOn(collection, "dropIndex").mockRejectedValueOnce(new Error("drop failed"));
    await expect(migrateDesignerRequestIndex(collection, { mode: "apply", ...writes() })).rejects.toThrow("drop failed");
    expect(await inspectDesignerRequestIndex(collection)).toMatchObject({ legacyPresent: true, replacementPresent: true });
    drop.mockRestore();
    expect(await migrateDesignerRequestIndex(collection, { mode: "apply", ...writes() })).toMatchObject({ legacyPresent: false, replacementPresent: true });
  });

  it("validates CLI target and write prerequisites before connecting", async () => {
    await expect(runDesignerRequestIndexCommand([], {})).rejects.toThrow("--database");
    await expect(runDesignerRequestIndexCommand(["--database="], {})).rejects.toThrow("--database");
    await expect(runDesignerRequestIndexCommand(["--database=test", "--apply"], {})).rejects.toThrow("verified backup");
    await expect(runDesignerRequestIndexCommand(["--database=test", "--rollback", "--backup-verified", "--writes-quiesced", "--index-metadata=relative.json"], {})).rejects.toThrow("absolute metadata");
    await expect(runDesignerRequestIndexCommand(["--database=test", "--apply", "--rollback"], {})).rejects.toThrow("Use --database");
    await expect(runDesignerRequestIndexCommand(["--database=test", "--unsupported"], {})).rejects.toThrow("Use --database");
    await expect(runDesignerRequestIndexCommand(["--database=test"], {})).rejects.toThrow("MONGODB_URI is required");
  });

  it("CLI defaults to read-only and captures protected metadata only for explicit apply", async () => {
    await legacy();
    await collection.insertOne(row("a"));
    const database = mongoose.connection.db!.databaseName;
    const env = { MONGODB_URI: replica.uri };
    expect(await runDesignerRequestIndexCommand([`--database=${database}`], env)).toMatchObject({ mode: "dry-run", legacyPresent: true, replacementPresent: false });
    const path = join(metadataDirectory, "apply.json");
    expect(await runDesignerRequestIndexCommand([`--database=${database}`, "--apply", "--backup-verified", "--writes-quiesced", `--index-metadata=${path}`], env))
      .toMatchObject({ mode: "apply", replacementPresent: true, legacyPresent: false });
    const metadata = JSON.parse(await readFile(path, "utf8"));
    expect(metadata).toMatchObject({ database, collection: DESIGNER_REQUEST_COLLECTION, legacyPresent: true, replacementPresent: false, requestCount: 1 });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(metadata)).not.toContain(replica.uri);
    await expect(runDesignerRequestIndexCommand([`--database=${database}`, "--rollback", "--backup-verified", "--writes-quiesced", `--index-metadata=${path}`], env))
      .rejects.toMatchObject({ code: "EEXIST" });
    expect(await collection.indexExists(DESIGNER_REQUEST_PAIR_INDEX)).toBe(true);
    expect(await rows()).toEqual([row("a")]);
  });
});
