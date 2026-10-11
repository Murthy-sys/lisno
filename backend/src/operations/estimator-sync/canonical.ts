import { createHash } from "node:crypto";
import { mongo } from "mongoose";
import type { SyncSnapshot } from "./contracts.js";
import { SyncError } from "./contracts.js";
import { LEASE_COLLECTION } from "./manifest.js";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, ordered(item)]));
  return value;
}
export function canonical(value: unknown): string {
  return JSON.stringify(ordered(mongo.BSON.EJSON.serialize(value, { relaxed: false })));
}
export const hash = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
export const opaqueReference = (collection: string, id: string): string => hash([collection, id]).slice(0, 24);
export function clone<T>(value: T): T {
  return mongo.BSON.EJSON.deserialize(mongo.BSON.EJSON.serialize(value, {relaxed: false}), {relaxed: false}) as T;
}
export function safeInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (value instanceof mongo.BSON.Int32 || value instanceof mongo.BSON.Double) return Number.isSafeInteger(value.valueOf()) ? value.valueOf() : null;
  if (value instanceof mongo.BSON.Long) {
    const number = value.toNumber();
    return Number.isSafeInteger(number) && mongo.BSON.Long.fromNumber(number).equals(value) ? number : null;
  }
  return null;
}
export function snapshotDigest(snapshot: Omit<SyncSnapshot, "contentDigest"> | SyncSnapshot): string {
  const { contentDigest: _digest, ...rest } = snapshot as SyncSnapshot;
  // Key order is semantic in compound MongoDB indexes, unlike ordinary document fields.
  const collection = (row: SyncSnapshot["collections"][number]) => ({...row,
    indexes: row.indexes.map(index => ({...index, key: Object.entries(index.key ?? {})}))});
  return hash({ ...rest, collections: rest.collections.map(collection),
    metadataCollections: rest.metadataCollections.filter(row => row.name !== LEASE_COLLECTION).map(collection) });
}
export function assertSnapshotDigest(snapshot: SyncSnapshot): void {
  if (snapshot.formatVersion !== 1 || snapshot.contentDigest !== snapshotDigest(snapshot)) throw new SyncError("SNAPSHOT_DIGEST_MISMATCH");
}
