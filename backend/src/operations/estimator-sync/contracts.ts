import type { mongo } from "mongoose";
import type { SyncCollection } from "./manifest.js";

export type SyncDocument = mongo.Document & { _id: string };
export interface CollectionSnapshot {
  name: string;
  exists: boolean;
  uuid: unknown;
  options: mongo.Document;
  indexes: mongo.Document[];
  documents: SyncDocument[];
}
export interface SyncSnapshot {
  formatVersion: 1;
  role: "source" | "target";
  identity: string;
  databaseName: string;
  collections: CollectionSnapshot[];
  metadataCollections: CollectionSnapshot[];
  dependencies: { actorIds: string[]; availableStorageReferences: string[] };
  contentDigest: string;
}
export interface BaselineEntry {
  collection: SyncCollection;
  id: string;
  sourceHash: string | null;
  appliedHash: string | null;
  protection: "none" | "local" | "deleted";
  // Remember owning graph even after a local deletion.
  mainLineId?: string;
  revisionId?: string;
  basketId?: string;
}
export interface SyncState {
  _id: "baseline";
  formatVersion: 1;
  sourceIdentity: string;
  generation: number;
  lastPlanDigest: string;
  entries: BaselineEntry[];
  // Includes omitted/reintroduced source IDs; never prune this inventory.
  observedSourceIds: Array<{ collection: SyncCollection; id: string }>;
}
export interface InitializationReview {
  formatVersion: 1;
  sourceDigest: string;
  targetDigest: string;
  decisions: Array<{ collection: SyncCollection; id: string; action: "protect" }>;
}
export interface SyncConflict { code: string; collection?: SyncCollection; reference?: string }
export interface PlannedWrite {
  collection: SyncCollection;
  id: string;
  beforeHash: string | null;
  document: SyncDocument;
}
export interface SyncPlan {
  formatVersion: 1;
  sourceDigest: string;
  targetDigest: string;
  sourceIdentity: string;
  writes: PlannedWrite[];
  nextState: SyncState;
  conflicts: SyncConflict[];
  warnings: SyncConflict[];
  additionalConflictCount: number;
  counts: { inserted: number; updated: number; unchanged: number; preservedLocal: number; protectedDeletions: number; initializationAmbiguities: number };
  digest: string;
}
export interface VerifiedBackup {
  directory: string;
  manifestDigest: string;
  targetSnapshotDigest: string;
  collectionCount: number;
  documentCount: number;
}
export class SyncError extends Error {
  constructor(readonly code: string) { super(code); this.name = "SyncError"; }
}
