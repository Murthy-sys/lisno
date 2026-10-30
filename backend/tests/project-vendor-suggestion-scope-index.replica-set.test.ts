import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertVendorSuggestionIndexesReady, readVendorSuggestionWriteAvailability,
  VENDOR_SUGGESTION_COLLECTION, VENDOR_SUGGESTION_OLD_INDEX_NAME, VENDOR_SUGGESTION_OLD_INDEX_KEY,
  VENDOR_SUGGESTION_PROJECT_INDEX_NAME, VENDOR_SUGGESTION_PROJECT_INDEX_KEY, VENDOR_SUGGESTION_PROJECT_INDEX_FILTER,
  VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME, VENDOR_SUGGESTION_MAIN_LINE_INDEX_KEY, VENDOR_SUGGESTION_MAIN_LINE_INDEX_FILTER,
  VENDOR_SUGGESTION_REQUEST_INDEX_NAME, VENDOR_SUGGESTION_REQUEST_INDEX_KEY
} from "../src/domain/project-vendor-suggestion-scope-index.js";
import {
  inspectVendorSuggestionScopeIndexes, migrateVendorSuggestionScopeIndexes,
  runVendorSuggestionScopeMigration
} from "../src/migrations/project-vendor-suggestion-scope.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const collection = () => mongoose.connection.db!.collection(VENDOR_SUGGESTION_COLLECTION);
const base = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id as any, projectId: "project-a", estimateId: "estimate-a", estimateVersion: 1,
  estimateReviewRoundId: "round-a", designPlanVersion: 1, vendorId: "vendor-a", createdById: "manager-a",
  idempotencyKey: `request-${id}`, requestHash: "a".repeat(64), note: "Private note must not enter inventory", ...extra
});
const line = (id: string, mainLineId: string, extra: Record<string, unknown> = {}) => base(id, {
  scope: "main_line", mainLineId, mainLineNameSnapshot: "Saved Main Line", mainBasketId: "basket-a",
  sourcePhase: "pre", sourceSnapshotId: "round-a", sourceDigest: "b".repeat(64), scopeDigest: "c".repeat(64),
  scopeOccurrences: [{ sourceLineItemKey: `key-${mainLineId}`, sectionId: "section-a", roomId: "room-a", roomName: "Room A" }], ...extra
});
const options = () => ({ mode: "apply" as const, writesQuiesced: true, backupIndexMetadata: vi.fn(async () => {}) });
const snapshot = async () => ({ rows: await collection().find().sort({ _id: 1 }).toArray(), indexes: await collection().listIndexes().toArray() });
async function oldIndexes() {
  await collection().createIndex(VENDOR_SUGGESTION_OLD_INDEX_KEY, { name: VENDOR_SUGGESTION_OLD_INDEX_NAME, unique: true });
  await collection().createIndex(VENDOR_SUGGESTION_REQUEST_INDEX_KEY, { name: VENDOR_SUGGESTION_REQUEST_INDEX_NAME, unique: true });
  await collection().createIndex({ projectId: 1, createdAt: -1 }, { name: "existing_list_index" });
}
async function projectIndex() {
  await collection().createIndex(VENDOR_SUGGESTION_PROJECT_INDEX_KEY, {
    name: VENDOR_SUGGESTION_PROJECT_INDEX_NAME, unique: true, partialFilterExpression: VENDOR_SUGGESTION_PROJECT_INDEX_FILTER
  });
}
beforeAll(async () => { replica = await startMongoReplicaSet("suggestion-scope-index-test"); }, 120_000);
beforeEach(async () => {
  await collection().drop().catch(error => { if (error.code !== 26) throw error; });
  await mongoose.connection.db!.createCollection(VENDOR_SUGGESTION_COLLECTION);
});
afterAll(async () => { await replica?.stop(); });

describe("Main Line suggestion index preparation", () => {
  it("keeps missing collections missing during dry-run and fails closed", async () => {
    await collection().drop();
    const report = await migrateVendorSuggestionScopeIndexes(collection());
    expect(report).toMatchObject({ collectionExists: false, indexes: [], ready: false, invalidRecords: [] });
    expect(await mongoose.connection.db!.listCollections({ name: VENDOR_SUGGESTION_COLLECTION }).toArray()).toEqual([]);
    expect(await readVendorSuggestionWriteAvailability()).toMatchObject({ available: false });
    await expect(assertVendorSuggestionIndexesReady()).rejects.toMatchObject({ status: 503, code: "PM_VENDOR_SUGGESTION_INDEXES_UNAVAILABLE" });
  });

  it("inventories historical null rounds and indexes without changing records or exposing notes", async () => {
    await oldIndexes();
    await collection().insertMany([base("legacy-a", { estimateReviewRoundId: null }), base("legacy-b", { vendorId: "vendor-b", scope: "project", mainLineId: null })]);
    const before = await snapshot();
    const report = await inspectVendorSuggestionScopeIndexes(collection());
    expect(report).toMatchObject({ historicalNullRoundCount: 1, invalidRecords: [], indexConflicts: [], oldIndexPresent: true, ready: false });
    expect(JSON.stringify(report)).not.toContain("Private note");
    expect(await snapshot()).toEqual(before);
  });

  it("builds scope-aware protection while preserving legacy missing/null uniqueness and the list index", async () => {
    await oldIndexes();
    await collection().insertOne(base("legacy-a"));
    const beforeRows = await collection().find().toArray();
    const config = options();
    const report = await migrateVendorSuggestionScopeIndexes(collection(), config);
    expect(config.backupIndexMetadata).toHaveBeenCalledOnce();
    expect(report).toMatchObject({ ready: true, oldIndexPresent: false, projectIndexPresent: true, mainLineIndexPresent: true, requestIndexPresent: true });
    expect(report.indexes.some(({ name }) => name === "existing_list_index")).toBe(true);
    expect(await collection().find().toArray()).toEqual(beforeRows);
    await expect(collection().insertOne(base("legacy-duplicate", { scope: "project", mainLineId: null, estimateReviewRoundId: "another-round" }))).rejects.toMatchObject({ code: 11000 });
    expect(await readVendorSuggestionWriteAvailability()).toEqual({ available: true, reason: null });
  });

  it("allows a vendor on two Main Lines alongside a project-wide suggestion, but rejects same-line and request-key duplicates", async () => {
    await oldIndexes();
    await migrateVendorSuggestionScopeIndexes(collection(), options());
    await collection().insertMany([base("legacy-a"), line("line-a", "main-line-a"), line("line-b", "main-line-b")]);
    await expect(collection().insertOne(line("same-line", "main-line-a"))).rejects.toMatchObject({ code: 11000 });
    await expect(collection().insertOne(line("same-request", "main-line-c", { idempotencyKey: "request-line-a" }))).rejects.toMatchObject({ code: 11000 });
    expect(await collection().countDocuments()).toBe(3);
    expect((await inspectVendorSuggestionScopeIndexes(collection())).invalidRecords).toEqual([]);
  });

  it("accepts verified zero-Design collaborative records and rejects invalid scope/source metadata", async () => {
    await collection().insertMany([
      line("valid-pre", "line-1", { designPlanVersion: 0 }),
      line("invalid-legacy", "line-2", { sourcePhase: "legacy", designPlanVersion: 0 }),
      line("invalid-snapshot", "line-3", { sourceSnapshotId: null, sourceDigest: null, designPlanVersion: 0 }),
      base("project-with-line", { scope: "project", mainLineId: "line-4" }),
      line("duplicate-occurrence", "line-5", { scopeOccurrences: [
        { sourceLineItemKey: "key", sectionId: "room-1", roomName: "Room 1" },
        { sourceLineItemKey: "key", sectionId: "room-2", roomName: "Room 2" }
      ] })
    ]);
    const before = await snapshot();
    const report = await inspectVendorSuggestionScopeIndexes(collection());
    expect(report.invalidRecords.map(({ id }) => id).sort()).toEqual(["duplicate-occurrence", "invalid-legacy", "invalid-snapshot", "project-with-line"]);
    await expect(migrateVendorSuggestionScopeIndexes(collection(), options())).rejects.toThrow("conflicts");
    expect(await snapshot()).toEqual(before);
  });

  it("reports independent legacy, Main Line, creator/request and rollback collisions without merging records", async () => {
    await collection().insertMany([
      base("project-a"), base("project-b", { scope: "project", mainLineId: null }),
      line("main-a", "line-1", { vendorId: "vendor-b" }), line("main-b", "line-1", { vendorId: "vendor-b" }),
      line("request-a", "line-2", { vendorId: "vendor-c", idempotencyKey: "shared-key" }),
      line("request-b", "line-3", { vendorId: "vendor-d", idempotencyKey: "shared-key" })
    ]);
    const before = await snapshot();
    const report = await inspectVendorSuggestionScopeIndexes(collection());
    expect(report.projectDuplicateGroups).toEqual([["project-a", "project-b"]]);
    expect(report.mainLineDuplicateGroups).toEqual([["main-a", "main-b"]]);
    expect(report.requestDuplicateGroups).toEqual([["request-a", "request-b"]]);
    expect(report.rollbackDuplicateGroups).toEqual([["main-a", "main-b"], ["project-a", "project-b"]]);
    await expect(migrateVendorSuggestionScopeIndexes(collection(), options())).rejects.toThrow("conflicts");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses unknown unique constraints and wrong definitions rather than dropping them", async () => {
    await oldIndexes();
    await collection().createIndex({ vendorId: 1 }, { name: "unknown_vendor_unique", unique: true });
    await collection().createIndex(VENDOR_SUGGESTION_MAIN_LINE_INDEX_KEY, {
      name: VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME, unique: true, partialFilterExpression: { scope: "main_line" }
    });
    const before = await snapshot();
    const report = await inspectVendorSuggestionScopeIndexes(collection());
    expect(report.indexConflicts).toEqual(expect.arrayContaining([
      "Unknown unique index unknown_vendor_unique", `Unexpected definition for ${VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME}`
    ]));
    await expect(migrateVendorSuggestionScopeIndexes(collection(), options())).rejects.toThrow("conflicts");
    expect(await snapshot()).toEqual(before);
    expect((await readVendorSuggestionWriteAvailability()).available).toBe(false);
  });

  it("retains old protection when the second replacement index build fails, then resumes idempotently", async () => {
    await oldIndexes();
    await collection().insertOne(base("legacy-a"));
    const target = collection();
    const create = target.createIndex.bind(target);
    const spy = vi.spyOn(target, "createIndex").mockImplementation(async (key, config) => {
      if (config?.name === VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME) throw new Error("simulated interrupted build");
      return create(key, config);
    });
    await expect(migrateVendorSuggestionScopeIndexes(target, options())).rejects.toThrow("interrupted build");
    spy.mockRestore();
    expect(await inspectVendorSuggestionScopeIndexes(collection())).toMatchObject({ oldIndexPresent: true, projectIndexPresent: true, mainLineIndexPresent: false, ready: false });
    const report = await migrateVendorSuggestionScopeIndexes(collection(), options());
    expect(report.ready).toBe(true);
    const before = await snapshot();
    expect((await migrateVendorSuggestionScopeIndexes(collection(), options())).ready).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it("also refuses an unknown index prepared for uniqueness, which already blocks duplicate writes", async () => {
    await migrateVendorSuggestionScopeIndexes(collection(), options());
    await collection().createIndex({ vendorId: 1 }, { name: "unknown_prepared_unique" });
    await mongoose.connection.db!.command({ collMod: VENDOR_SUGGESTION_COLLECTION,
      index: { name: "unknown_prepared_unique", prepareUnique: true } });
    const before = await snapshot();
    expect((await inspectVendorSuggestionScopeIndexes(collection())).indexConflicts).toContain("Unknown unique index unknown_prepared_unique");
    expect((await readVendorSuggestionWriteAvailability()).available).toBe(false);
    await expect(migrateVendorSuggestionScopeIndexes(collection(), options())).rejects.toThrow("conflicts");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses readiness until the old index is gone and rechecks after a previously successful read", async () => {
    await oldIndexes();
    await projectIndex();
    await collection().createIndex(VENDOR_SUGGESTION_MAIN_LINE_INDEX_KEY, {
      name: VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME, unique: true, partialFilterExpression: VENDOR_SUGGESTION_MAIN_LINE_INDEX_FILTER
    });
    expect((await readVendorSuggestionWriteAvailability()).available).toBe(false);
    await collection().dropIndex(VENDOR_SUGGESTION_OLD_INDEX_NAME);
    expect((await readVendorSuggestionWriteAvailability()).available).toBe(true);
    await collection().dropIndex(VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME);
    await expect(assertVendorSuggestionIndexesReady()).rejects.toMatchObject({ status: 503 });
  });

  it("checks metadata safely when a caller has an active transaction", async () => {
    await migrateVendorSuggestionScopeIndexes(collection(), options());
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await collection().findOne({}, { session });
      await expect(assertVendorSuggestionIndexesReady(session)).resolves.toBeUndefined();
      expect(session.inTransaction()).toBe(true);
    } finally { if (session.inTransaction()) await session.abortTransaction(); await session.endSession(); }
  });

  it("requires quiescence and successful backup before any index writes", async () => {
    await oldIndexes();
    const before = await snapshot();
    await expect(migrateVendorSuggestionScopeIndexes(collection(), { mode: "apply" })).rejects.toThrow("quiesced");
    await expect(migrateVendorSuggestionScopeIndexes(collection(), { mode: "apply", writesQuiesced: true })).rejects.toThrow("backup");
    await expect(migrateVendorSuggestionScopeIndexes(collection(), {
      ...options(), backupIndexMetadata: async () => { throw new Error("backup failed"); }
    })).rejects.toThrow("backup failed");
    expect(await snapshot()).toEqual(before);
  });

  it("repeats inventory after backup and refuses a newly discovered malformed record", async () => {
    await oldIndexes();
    const beforeIndexes = await collection().listIndexes().toArray();
    await expect(migrateVendorSuggestionScopeIndexes(collection(), {
      ...options(), backupIndexMetadata: async () => { await collection().insertOne(line("invalid", "line", { estimateReviewRoundId: null })); }
    })).rejects.toThrow("conflicts");
    expect(await collection().listIndexes().toArray()).toEqual(beforeIndexes);
  });

  it("restores the old guard only when satisfiable, retains replacement protection and can reapply", async () => {
    await oldIndexes();
    await migrateVendorSuggestionScopeIndexes(collection(), options());
    await collection().insertOne(line("one-line", "line-a", { designPlanVersion: 0 }));
    const beforeRows = await collection().find().toArray();
    const rolledBack = await migrateVendorSuggestionScopeIndexes(collection(), { ...options(), mode: "rollback" });
    expect(rolledBack).toMatchObject({ ready: false, oldIndexPresent: true, projectIndexPresent: true, mainLineIndexPresent: true });
    expect(await collection().find().toArray()).toEqual(beforeRows);
    expect((await migrateVendorSuggestionScopeIndexes(collection(), options())).ready).toBe(true);
  });

  it("refuses rollback after cross-line records share a vendor, preserving all data and indexes", async () => {
    await oldIndexes();
    await migrateVendorSuggestionScopeIndexes(collection(), options());
    await collection().insertMany([line("line-a", "line-a"), line("line-b", "line-b")]);
    const before = await snapshot();
    const config = { ...options(), mode: "rollback" as const };
    await expect(migrateVendorSuggestionScopeIndexes(collection(), config)).rejects.toThrow("no longer satisfy");
    expect(config.backupIndexMetadata).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });

  it("requires an explicit target and write prerequisites before connecting the operational CLI", async () => {
    await expect(runVendorSuggestionScopeMigration([], {})).rejects.toThrow("--database");
    await expect(runVendorSuggestionScopeMigration(["--database=a", "--database=b"], {})).rejects.toThrow("--database");
    await expect(runVendorSuggestionScopeMigration(["--database=test"], {})).rejects.toThrow("MONGODB_URI");
    await expect(runVendorSuggestionScopeMigration(["--database=test", "--apply"], { MONGODB_URI: "invalid://unreachable" })).rejects.toThrow("--writes-quiesced");
    await expect(runVendorSuggestionScopeMigration(["--database=test", "--apply", "--rollback"], {})).rejects.toThrow("one of");
  });
});
