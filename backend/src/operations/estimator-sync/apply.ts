import { randomUUID } from "node:crypto";
import { mongo } from "mongoose";
import type { InitializationReview, SyncPlan, SyncSnapshot, SyncDocument, VerifiedBackup } from "./contracts.js";
import { SyncError } from "./contracts.js";
import { assertSnapshotDigest, hash } from "./canonical.js";
import { assertTargetTopology } from "./authority.js";
import { acquireLease, assertPlanSize, fenceLease, markBaselineInitialized, readState, releaseLease } from "./metadata.js";
import { buildSyncPlan } from "./planner.js";
import { readDatabaseSnapshot } from "./snapshot.js";
import { verifyTargetBackup, writeTargetBackup } from "./backup.js";
import { MAINTENANCE_CONFIRMATION, STATE_COLLECTION } from "./manifest.js";

export interface ApplyOptions {
  client: mongo.MongoClient;
  source: SyncSnapshot;
  target: SyncSnapshot;
  plan: SyncPlan;
  initialization?: InitializationReview;
  backupRoot: string;
  maintenanceConfirmation: string;
  storageExists?: (reference: string) => Promise<boolean>;
}
export interface ApplyResult { status: "applied" | "unchanged"; planDigest: string; backup: VerifiedBackup | null; written: number }

export function sourceStorageReferences(source: SyncSnapshot): string[] {
  const references = new Set<string>();
  for (const row of source.collections.find(c => c.name === "aiEstimatorKnowledgeVendors")?.documents ?? []) {
    for (const field of ["geoTaggedPicture", "msmeCertificate"]) {
      const reference = row[field]?.storageReference;
      if (typeof reference === "string") references.add(reference);
    }
  }
  return [...references].sort();
}

/** Offline operation. The confirmation attests writers remain stopped for the whole operation;
 * a sync lease is intentionally not represented as an application-wide writer fence. */
export async function applySyncPlan(options: ApplyOptions): Promise<ApplyResult> {
  if (options.maintenanceConfirmation !== MAINTENANCE_CONFIRMATION) throw new SyncError("MAINTENANCE_REQUIRED");
  assertSnapshotDigest(options.source); assertSnapshotDigest(options.target);
  if (options.target.role !== "target" || options.target.databaseName !== "lisno_demo" || options.source.role !== "source") throw new SyncError("TARGET_NOT_ALLOWED");
  await assertTargetTopology(options.client);
  const frozen = buildSyncPlan({ source: options.source, target: options.target, initialization: options.initialization });
  if (frozen.digest !== options.plan.digest || hash(frozen) !== hash(options.plan)) throw new SyncError("PLAN_CHANGED");
  if (frozen.conflicts.length || frozen.additionalConflictCount) throw new SyncError("SYNC_CONFLICTS");
  assertPlanSize(frozen);
  if (frozen.writes.some(write => !options.target.collections.find(c => c.name === write.collection)?.exists)) throw new SyncError("TARGET_COLLECTION_NOT_INITIALIZED");
  const snapshotOptions = { role: "target" as const, identity: options.target.identity,
    storageReferencesToCheck: sourceStorageReferences(options.source), storageExists: options.storageExists };
  const beforeBackup = await readDatabaseSnapshot(options.client, "lisno_demo", snapshotOptions);
  if (beforeBackup.contentDigest !== frozen.targetDigest) throw new SyncError("STALE_TARGET");
  const previous = readState(beforeBackup);
  if (!frozen.writes.length && hash(previous) === hash(frozen.nextState)) return { status: "unchanged", planDigest: frozen.digest, backup: null, written: 0 };
  const backup = await writeTargetBackup(beforeBackup, options.backupRoot);
  await verifyTargetBackup(backup.directory, frozen.targetDigest);
  const db = options.client.db("lisno_demo");
  const lease = await acquireLease(db, randomUUID());
  const session = options.client.startSession();
  let committed = false;
  try {
    // Re-read immediately before opening the write transaction. It never silently replans.
    const finalPreview = await readDatabaseSnapshot(options.client, "lisno_demo", snapshotOptions);
    if (finalPreview.contentDigest !== frozen.targetDigest) throw new SyncError("STALE_TARGET");
    const finalPlan = buildSyncPlan({ source: options.source, target: finalPreview, initialization: options.initialization });
    if (finalPlan.digest !== frozen.digest) throw new SyncError("PLAN_CHANGED");
    await session.withTransaction(async () => {
      await fenceLease(db, lease, session);
      const current = await readDatabaseSnapshot(options.client, "lisno_demo", {...snapshotOptions, session});
      if (current.contentDigest !== frozen.targetDigest) throw new SyncError("STALE_TARGET");
      for (const write of frozen.writes) {
        const collection = db.collection<SyncDocument>(write.collection);
        if (write.beforeHash === null) {
          await collection.insertOne(write.document, { session });
        } else {
          const before = current.collections.find(c => c.name === write.collection)?.documents.find(d => d._id === write.id);
          if (!before || hash(before) !== write.beforeHash) throw new SyncError("STALE_TARGET");
          // Whole-document CAS also rejects native edits that did not increment a business version.
          const result = await collection.replaceOne({ _id: write.id, $expr: { $eq: ["$$ROOT", { $literal: before }] } }, write.document, { session });
          if (result.matchedCount !== 1) throw new SyncError("STALE_TARGET");
        }
      }
      const state = db.collection<{_id: string}>(STATE_COLLECTION);
      const result = await state.replaceOne(previous ? {_id: "baseline", generation: previous.generation, lastPlanDigest: previous.lastPlanDigest} : {_id: "baseline"}, frozen.nextState, {session, upsert: previous === null});
      if (previous && result.matchedCount !== 1) throw new SyncError("STALE_BASELINE");
      await markBaselineInitialized(db, lease, session);
    }, {readConcern: {level: "snapshot"}, writeConcern: {w: "majority"}, readPreference: "primary", maxCommitTimeMS: 15_000});
    committed = true;
    const verified = await readDatabaseSnapshot(options.client, "lisno_demo", snapshotOptions);
    if (hash(readState(verified)) !== hash(frozen.nextState) || hash(verified.dependencies) !== hash(options.target.dependencies)) throw new SyncError("POST_APPLY_VERIFICATION_FAILED");
    for (const before of options.target.collections) {
      const after = verified.collections.find(c => c.name === before.name);
      if (!after || before.exists !== after.exists || hash(before.uuid) !== hash(after.uuid) || hash(before.options) !== hash(after.options) || hash(before.indexes.map(i => ({...i, key: Object.entries(i.key ?? {})}))) !== hash(after.indexes.map(i => ({...i, key: Object.entries(i.key ?? {})})))) throw new SyncError("POST_APPLY_VERIFICATION_FAILED");
      const expected = new Map(before.documents.map(row => [row._id, hash(row)]));
      for (const write of frozen.writes.filter(write => write.collection === before.name)) expected.set(write.id, hash(write.document));
      if (after.documents.length !== expected.size || after.documents.some(row => expected.get(row._id) !== hash(row))) throw new SyncError("POST_APPLY_VERIFICATION_FAILED");
    }
    return {status: "applied", planDigest: frozen.digest, backup, written: frozen.writes.length};
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(committed ? "POST_APPLY_VERIFICATION_FAILED" : "APPLY_FAILED_CHECK_BASELINE");
  } finally {
    await session.endSession();
    // A cleanup failure cannot undo a committed transaction or overwrite another owner's lease.
    await releaseLease(db, lease).catch(() => {});
  }
}
