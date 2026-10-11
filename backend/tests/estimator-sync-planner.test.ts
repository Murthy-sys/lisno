import { describe, expect, it } from "vitest";
import { mongo } from "mongoose";
import { clone, hash, snapshotDigest } from "../src/operations/estimator-sync/canonical.js";
import type { InitializationReview, SyncDocument, SyncPlan, SyncSnapshot } from "../src/operations/estimator-sync/contracts.js";
import { buildSyncPlan } from "../src/operations/estimator-sync/planner.js";
import { STATE_COLLECTION, SYNC_COLLECTIONS, SYNC_METADATA_COLLECTIONS, type SyncCollection } from "../src/operations/estimator-sync/manifest.js";

const vendors: SyncCollection = "aiEstimatorKnowledgeVendors";
const sequence: SyncCollection = "aiEstimatorKnowledgeDisplayOrderSequences";
const time = new Date("2026-10-10T00:00:00Z");
function vendor(id: string, patch: Record<string, unknown> = {}): SyncDocument {
  return { _id: id, code: id, codeNormalized: id, name: id, nameNormalized: id, description: null, displayOrder: 1, status: "active", version: 1, dependencyEpoch: 0, kpiRubricGeneration: 0, createdById: "actor", updatedById: "actor", createdAt: time, updatedAt: time, archivedAt: null, archivedById: null, ...patch };
}
function snapshot(role: "source" | "target", documents: Partial<Record<SyncCollection, SyncDocument[]>> = {}): SyncSnapshot {
  const value: SyncSnapshot = { formatVersion: 1, role, identity: hash(role), databaseName: role === "target" ? "lisno_demo" : "source", collections: SYNC_COLLECTIONS.map(name => ({ name, exists: true, uuid: `uuid:${name}`, options: {}, indexes: [{ name: "_id_", key: { _id: 1 } }, ...(name === vendors ? [{ name: "name", key: { nameNormalized: 1 }, unique: true, partialFilterExpression: { status: { $in: ["active", "inactive"] } } }] : [])], documents: documents[name] ?? [] })), metadataCollections: SYNC_METADATA_COLLECTIONS.map(name => ({ name, exists: false, uuid: null, options: {}, indexes: [], documents: [] })), dependencies: { actorIds: ["actor"], availableStorageReferences: [] }, contentDigest: "" };
  value.contentDigest = snapshotDigest(value);
  return value;
}
function refresh(value: SyncSnapshot): SyncSnapshot { value.contentDigest = snapshotDigest(value); return value; }
function setRows(value: SyncSnapshot, collection: SyncCollection, rows: SyncDocument[]): SyncSnapshot { value.collections.find(row => row.name === collection)!.documents = rows; return refresh(value); }
function simulateApply(target: SyncSnapshot, plan: SyncPlan): SyncSnapshot {
  expect(plan.conflicts).toEqual([]);
  const next = clone(target);
  next.formatVersion = 1;
  for (const write of plan.writes) {
    const rows = next.collections.find(row => row.name === write.collection)!.documents;
    const index = rows.findIndex(row => row._id === write.id);
    if (index < 0) rows.push(write.document); else rows[index] = write.document;
  }
  const metadata = next.metadataCollections.find(row => row.name === STATE_COLLECTION)!;
  metadata.exists = true;
  metadata.documents = [plan.nextState];
  return refresh(next);
}
function initialized(sourceRows = [vendor("shared")], localRows = sourceRows): { source: SyncSnapshot; target: SyncSnapshot } {
  const source = snapshot("source", { [vendors]: sourceRows });
  const target = snapshot("target", { [vendors]: localRows });
  return { source, target: simulateApply(target, buildSyncPlan({ source, target })) };
}
const codes = (plan: SyncPlan) => plan.conflicts.map(row => row.code);

describe("preservation-first estimator planner", () => {
  it("adopts equal records without business writes and retains local test vendors byte-for-byte", () => {
    const { source, target } = initialized([vendor("shared")], [vendor("shared"), vendor("test-pop", { description: "local private fixture" }), vendor("test-painting", { displayOrder: 17 })]);
    const before = hash(target.collections.find(row => row.name === vendors)!.documents.filter(row => row._id.startsWith("test-")));
    setRows(source, vendors, [vendor("shared", { description: "updated upstream", version: 7 }), vendor("new-vendor")]);
    const plan = buildSyncPlan({ source, target });
    expect(plan.conflicts).toEqual([]);
    expect(plan.counts).toMatchObject({ inserted: 1, updated: 1, preservedLocal: 2 });
    const applied = simulateApply(target, plan);
    expect(hash(applied.collections.find(row => row.name === vendors)!.documents.filter(row => row._id.startsWith("test-")))).toBe(before);
    expect(plan.writes.find(row => row.id === "shared")!.document.version).toBe(8);
  });
  it("replays reconciled source/applied hashes without writes or metadata generation churn", () => {
    const state = initialized();
    setRows(state.source, vendors, [vendor("shared", { description: "incoming", version: 3, dependencyEpoch: 2 })]);
    const first = buildSyncPlan(state);
    const updated = first.writes[0];
    expect(updated.document).toMatchObject({ version: 4, dependencyEpoch: 3 });
    expect(first.nextState.entries[0].sourceHash).not.toBe(first.nextState.entries[0].appliedHash);
    const target = simulateApply(state.target, first);
    const repeat = buildSyncPlan({ source: state.source, target });
    expect(repeat.writes).toEqual([]);
    expect(repeat.conflicts).toEqual([]);
    expect(repeat.nextState).toEqual(first.nextState);
  });
  it("preserves a local dependency epoch when older source rows omit it and rejects version exhaustion", () => {
    const state = initialized([vendor("shared", { dependencyEpoch: 9 })]);
    const incoming = vendor("shared", { description: "old-shape update", version: 2 });
    delete incoming.dependencyEpoch;
    setRows(state.source, vendors, [incoming]);
    expect(buildSyncPlan(state).writes[0].document.dependencyEpoch).toBe(10);
    setRows(state.source, vendors, [vendor("shared", { version: Number.MAX_SAFE_INTEGER })]);
    expect(codes(buildSyncPlan(state))).toContain("VERSION_INVALID_OR_EXHAUSTED");
  });
  it("preserves local embedded private and storage data exactly without reporting their values", () => {
    const local = vendor("test-pop", { geoTaggedPicture: { id: "photo", storageReference: "private-fixture-reference", originalFilename: "private.jpg", mimeType: "image/jpeg", byteSize: 7, sha256: hash("photo"), uploadedAt: time.toISOString(), uploadedById: "local-actor" } });
    const state = initialized([vendor("shared")], [vendor("shared"), local]);
    setRows(state.source, vendors, [vendor("shared", { description: "incoming", version: 2 })]);
    const plan = buildSyncPlan(state);
    const after = simulateApply(state.target, plan).collections.find(row => row.name === vendors)!.documents.find(row => row._id === "test-pop");
    expect(hash(after)).toBe(hash(local));
    expect(plan.warnings.map(row => row.code)).toContain("PREEXISTING_STORAGE_REFERENCE_MISSING");
    expect(JSON.stringify(plan.warnings)).not.toContain("private-fixture-reference");
  });
  it("protects a locally edited record in full even when production changed another field", () => {
    const state = initialized();
    setRows(state.target, vendors, [vendor("shared", { description: "local work", version: 2 })]);
    const localOnly = buildSyncPlan(state);
    expect(localOnly.conflicts).toEqual([]);
    expect(localOnly.writes).toEqual([]);
    expect(localOnly.nextState.entries[0].protection).toBe("local");
    state.target = simulateApply(state.target, localOnly);
    setRows(state.source, vendors, [vendor("shared", { displayOrder: 21, version: 2 })]);
    expect(codes(buildSyncPlan(state))).toContain("PROTECTED_LOCAL_DIVERGENCE");
    expect(buildSyncPlan(state).writes).toEqual([]);
  });
  it("never clears sticky protection when the source temporarily catches up", () => {
    const state = initialized();
    const local = vendor("shared", { description: "local work", version: 2 });
    setRows(state.target, vendors, [local]);
    state.target = simulateApply(state.target, buildSyncPlan(state));
    setRows(state.source, vendors, [local]);
    const caughtUp = buildSyncPlan(state);
    expect(caughtUp.conflicts).toEqual([]);
    expect(caughtUp.nextState.entries[0].protection).toBe("local");
    state.target = simulateApply(state.target, caughtUp);
    setRows(state.source, vendors, [vendor("shared", { description: "later remote edit", version: 3 })]);
    expect(codes(buildSyncPlan(state))).toContain("PROTECTED_LOCAL_DIVERGENCE");
  });
  it("keeps local deletions across reruns and source disappearance/reappearance", () => {
    const state = initialized([vendor("shared"), vendor("anchor")]);
    setRows(state.target, vendors, [vendor("anchor")]);
    const deletion = buildSyncPlan(state);
    expect(deletion.counts.protectedDeletions).toBe(1);
    expect(deletion.writes).toEqual([]);
    state.target = simulateApply(state.target, deletion);
    setRows(state.source, vendors, [vendor("anchor")]);
    state.target = simulateApply(state.target, buildSyncPlan(state));
    setRows(state.source, vendors, [vendor("shared"), vendor("anchor")]);
    const returnPlan = buildSyncPlan(state);
    expect(returnPlan.writes).toEqual([]);
    expect(returnPlan.counts.protectedDeletions).toBe(1);
    setRows(state.source, vendors, [vendor("shared", { version: 2 }), vendor("anchor")]);
    expect(codes(buildSyncPlan(state))).toContain("PROTECTED_LOCAL_DIVERGENCE");
  });
  it("preserves source-omitted local rows and records observed source identities permanently", () => {
    const state = initialized([vendor("shared"), vendor("anchor")]);
    setRows(state.source, vendors, [vendor("anchor")]);
    const plan = buildSyncPlan(state);
    expect(plan.writes).toEqual([]);
    expect(plan.nextState.observedSourceIds).toContainEqual({ collection: vendors, id: "shared" });
    expect(plan.counts.preservedLocal).toBe(1);
  });
  it("first-run differences and source-only IDs require exact snapshot-bound protect review", () => {
    const source = snapshot("source", { [vendors]: [vendor("shared", { version: 2 }), vendor("maybe-deleted")] });
    const target = snapshot("target", { [vendors]: [vendor("shared")] });
    expect(buildSyncPlan({ source, target }).counts.initializationAmbiguities).toBe(2);
    const initialization: InitializationReview = { formatVersion: 1, sourceDigest: source.contentDigest, targetDigest: target.contentDigest, decisions: [{ collection: vendors, id: "shared", action: "protect" }, { collection: vendors, id: "maybe-deleted", action: "protect" }] };
    const reviewed = buildSyncPlan({ source, target, initialization });
    expect(reviewed.conflicts).toEqual([]);
    expect(reviewed.writes).toEqual([]);
    expect(reviewed.nextState.entries.map(row => row.protection).sort()).toEqual(["deleted", "local"]);
    expect(() => buildSyncPlan({ source, target, initialization: { ...initialization, sourceDigest: hash("stale") } })).toThrow("INITIALIZATION_REVIEW_STALE");
    expect(() => buildSyncPlan({ source, target, initialization: { ...initialization, decisions: initialization.decisions.slice(0, 1) } })).toThrow("INITIALIZATION_REVIEW_INCOMPLETE");
    expect(() => buildSyncPlan({ source, target: simulateApply(target, reviewed), initialization })).toThrow("BASELINE_RESET_FORBIDDEN");
  });
  it("treats a collision with a local-only stable ID as protected, not a new insert", () => {
    const state = initialized([vendor("shared")], [vendor("shared"), vendor("local-only")]);
    setRows(state.source, vendors, [vendor("shared"), vendor("local-only", { description: "remote" })]);
    const plan = buildSyncPlan(state);
    expect(plan.writes).toEqual([]);
    expect(codes(plan)).toContain("PROTECTED_LOCAL_DIVERGENCE");
  });
  it("preserves typed null/missing, dates and array order when detecting local edits", () => {
    const state = initialized();
    const local = vendor("shared");
    delete local.description;
    setRows(state.target, vendors, [local]);
    const plan = buildSyncPlan(state);
    expect(plan.nextState.entries[0].protection).toBe("local");
    expect(hash({ value: null })).not.toBe(hash({}));
    expect(hash({ value: new Date(0) })).not.toBe(hash({ value: "1970-01-01T00:00:00.000Z" }));
    expect(hash([1, 2])).not.toBe(hash([2, 1]));
  });
  it("reads native BSON metadata integers and rejects malformed/incompatible baseline state", () => {
    const state = initialized();
    const metadata = state.target.metadataCollections.find(row => row.name === STATE_COLLECTION)!.documents[0];
    metadata.formatVersion = new mongo.BSON.Int32(1);
    metadata.generation = mongo.BSON.Long.fromNumber(1);
    refresh(state.target);
    expect(buildSyncPlan(state).nextState.generation).toBe(1);
    metadata.entries[0].protection = "remote-wins";
    refresh(state.target);
    expect(() => buildSyncPlan(state)).toThrow("INVALID_BASELINE");
  });
  it("rejects an empty source, missing snapshot allowlist entry, and modified snapshot contents", () => {
    const state = initialized();
    const source = snapshot("source");
    expect(() => buildSyncPlan({ source, target: state.target })).toThrow("SOURCE_UNEXPECTEDLY_EMPTY");
    source.collections.pop(); refresh(source);
    expect(() => buildSyncPlan({ source, target: state.target })).toThrow("SNAPSHOT_COLLECTIONS_INVALID");
    state.source.collections[0].exists = false;
    expect(() => buildSyncPlan(state)).toThrow("SNAPSHOT_DIGEST_MISMATCH");
  });
  it("allows absent optional empty source collections", () => {
    const state = initialized();
    const optional = state.source.collections.find(row => row.name === "aiEstimatorKnowledgeQualityControlOptions")!;
    optional.exists = false; optional.uuid = null; optional.indexes = [];
    refresh(state.source);
    expect(buildSyncPlan(state).conflicts).toEqual([]);
  });
  it("reconciles incoming sequence counters against retained local records and never bumps replay", () => {
    const source = snapshot("source", { [vendors]: [vendor("shared")], [sequence]: [{ _id: "masters:vendors", highWaterOrder: 3, createdAt: time, updatedAt: time }] });
    let target = snapshot("target", { [vendors]: [vendor("shared"), vendor("test-pop", { displayOrder: 70 })], [sequence]: [{ _id: "masters:vendors", highWaterOrder: 3, createdAt: time, updatedAt: time }] });
    target = simulateApply(target, buildSyncPlan({ source, target }));
    setRows(source, sequence, [{ _id: "masters:vendors", highWaterOrder: 6, createdAt: time, updatedAt: time }]);
    const update = buildSyncPlan({ source, target });
    expect(update.writes.find(row => row.collection === sequence)!.document.highWaterOrder).toBe(70);
    target = simulateApply(target, update);
    expect(buildSyncPlan({ source, target }).writes).toEqual([]);
  });
  it("does not silently overwrite locally changed sequence counters", () => {
    const source = snapshot("source", { [vendors]: [vendor("shared")], [sequence]: [{ _id: "masters:vendors", highWaterOrder: 3 }] });
    let target = snapshot("target", { [vendors]: [vendor("shared")], [sequence]: [{ _id: "masters:vendors", highWaterOrder: 3 }] });
    target = simulateApply(target, buildSyncPlan({ source, target }));
    setRows(target, sequence, [{ _id: "masters:vendors", highWaterOrder: 99 }]);
    setRows(source, sequence, [{ _id: "masters:vendors", highWaterOrder: 6 }]);
    const plan = buildSyncPlan({ source, target });
    expect(plan.writes).toEqual([]);
    expect(codes(plan)).toContain("PROTECTED_LOCAL_DIVERGENCE");
  });
  it("returns opaque bounded conflicts without leaking private fixture values", () => {
    const source = snapshot("source", { [vendors]: [vendor("fixture-secret-id", { description: "secret-profile" })] });
    const target = snapshot("target");
    const result = buildSyncPlan({ source, target });
    const report = JSON.stringify({ conflicts: result.conflicts, warnings: result.warnings, counts: result.counts });
    expect(report).not.toContain("fixture-secret-id");
    expect(report).not.toContain("secret-profile");
  });
});
