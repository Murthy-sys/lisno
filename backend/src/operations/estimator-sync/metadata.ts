import { mongo } from "mongoose";
import { safeInteger, hash } from "./canonical.js";
import type { SyncSnapshot, SyncState, SyncPlan } from "./contracts.js";
import { SyncError } from "./contracts.js";
import { STATE_COLLECTION, LEASE_COLLECTION, SYNC_LIMITS, isSyncCollection } from "./manifest.js";

export function readState(snapshot: SyncSnapshot): SyncState | null {
  if (snapshot.metadataCollections.filter(row => row.name === STATE_COLLECTION).length !== 1) throw new SyncError("INVALID_BASELINE");
  const collection = snapshot.metadataCollections.find(row => row.name === STATE_COLLECTION);
  if (!collection?.exists) {
    if (snapshot.metadataCollections.find(row => row.name === LEASE_COLLECTION)?.documents.some(row => row.baselineInitialized === true)) throw new SyncError("BASELINE_MISSING");
    return null;
  }
  if (collection.documents.length !== 1) throw new SyncError("INVALID_BASELINE");
  const document = collection.documents[0];
  if (document._id !== "baseline" || safeInteger(document.formatVersion) !== 1 ||
    safeInteger(document.generation) === null || Number(safeInteger(document.generation)) < 1 ||
    typeof document.sourceIdentity !== "string" || !/^[a-f0-9]{64}$/.test(document.sourceIdentity) ||
    typeof document.lastPlanDigest !== "string" || !/^[a-f0-9]{64}$/.test(document.lastPlanDigest) ||
    !Array.isArray(document.entries) || !Array.isArray(document.observedSourceIds) ||
    Object.keys(document).some(key => !["_id", "formatVersion", "sourceIdentity", "generation", "lastPlanDigest", "entries", "observedSourceIds"].includes(key))) throw new SyncError("INVALID_BASELINE");
  const entries = document.entries;
  const keys = new Set<string>();
  for (const entry of entries) {
    if (!entry || !isSyncCollection(entry.collection) || typeof entry.id !== "string" || !entry.id ||
      !["none", "local", "deleted"].includes(entry.protection) ||
      ![entry.sourceHash, entry.appliedHash].every(value => value === null || typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) ||
      entry.protection === "none" && (entry.sourceHash === null || entry.appliedHash === null) ||
      Object.keys(entry).some(key => !["collection", "id", "sourceHash", "appliedHash", "protection", "mainLineId", "revisionId", "basketId"].includes(key)) ||
      ["mainLineId", "revisionId", "basketId"].some(key => entry[key] !== undefined && (typeof entry[key] !== "string" || !entry[key]))) throw new SyncError("INVALID_BASELINE");
    const key = hash([entry.collection, entry.id]);
    if (keys.has(key)) throw new SyncError("INVALID_BASELINE");
    keys.add(key);
  }
  const seen = new Set<string>();
  for (const entry of document.observedSourceIds) {
    if (!entry || !isSyncCollection(entry.collection) || typeof entry.id !== "string" || !entry.id ||
      Object.keys(entry).some(key => !["collection", "id"].includes(key))) throw new SyncError("INVALID_BASELINE");
    const key = hash([entry.collection, entry.id]);
    if (seen.has(key)) throw new SyncError("INVALID_BASELINE");
    seen.add(key);
  }
  if (entries.some(entry => entry.sourceHash !== null && !seen.has(hash([entry.collection, entry.id])))) throw new SyncError("INVALID_BASELINE");
  return { ...document, formatVersion: 1, generation: safeInteger(document.generation)! } as SyncState;
}

export function assertPlanSize(plan: SyncPlan): void {
  const bytes = mongo.BSON.calculateObjectSize({ writes: plan.writes, nextState: plan.nextState });
  if (bytes > SYNC_LIMITS.maxWriteBytes) throw new SyncError("BATCH_TOO_LARGE");
}

export interface SyncLease { owner: string; fence: number; expiresAt: Date }
export async function acquireLease(db: mongo.Db, owner: string, now = new Date()): Promise<SyncLease> {
  try {
    const expiresAt = new Date(now.getTime() + 120_000);
    const row = await db.collection<{_id: string; owner: string; fence: number; expiresAt: Date}>(LEASE_COLLECTION).findOneAndUpdate(
      { _id: "apply", $or: [{ expiresAt: { $lte: now } }, { owner }] },
      { $set: { owner, expiresAt }, $inc: { fence: 1 } },
      { upsert: true, returnDocument: "after" });
    if (!row || !Number.isSafeInteger(row.fence) || row.fence < 1) throw new SyncError("SYNC_BUSY");
    return { owner, fence: row.fence, expiresAt };
  } catch (error) {
    if (error instanceof SyncError) throw error;
    if ((error as {code?: number})?.code === 11000) throw new SyncError("SYNC_BUSY");
    throw new SyncError("LEASE_UNAVAILABLE");
  }
}
export async function fenceLease(db: mongo.Db, lease: SyncLease, session: mongo.ClientSession): Promise<void> {
  const now = new Date();
  const result = await db.collection<{_id: string}>(LEASE_COLLECTION).updateOne(
    { _id: "apply", owner: lease.owner, fence: lease.fence, expiresAt: { $gt: now } },
    { $set: { transactionFence: `${lease.owner}:${lease.fence}`, expiresAt: new Date(now.getTime() + 120_000) } }, { session });
  if (result.matchedCount !== 1) throw new SyncError("LEASE_LOST");
}
export async function releaseLease(db: mongo.Db, lease: SyncLease): Promise<void> {
  await db.collection<{_id: string}>(LEASE_COLLECTION).updateOne(
    { _id: "apply", owner: lease.owner, fence: lease.fence }, { $set: { expiresAt: new Date(0) } });
}

export async function markBaselineInitialized(db: mongo.Db, lease: SyncLease, session: mongo.ClientSession): Promise<void> {
  const result = await db.collection<{_id: string}>(LEASE_COLLECTION).updateOne(
    {_id: "apply", owner: lease.owner, fence: lease.fence}, {$set: {baselineInitialized: true}}, {session});
  if (result.matchedCount !== 1) throw new SyncError("LEASE_LOST");
}
