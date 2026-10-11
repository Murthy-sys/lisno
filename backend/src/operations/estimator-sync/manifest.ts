export const SYNC_COLLECTIONS = [
  "aiEstimatorKnowledgeBasketQualityRevisions", "aiEstimatorKnowledgeBaskets",
  "aiEstimatorKnowledgeDisplayOrderSequences", "aiEstimatorKnowledgeMainLines",
  "aiEstimatorKnowledgeModes", "aiEstimatorKnowledgePriceVersions",
  "aiEstimatorKnowledgePriorities", "aiEstimatorKnowledgeQualityControlOptions",
  "aiEstimatorKnowledgeRevisions", "aiEstimatorKnowledgeSections",
  "aiEstimatorKnowledgeSubBaskets", "aiEstimatorKnowledgeSurfaces",
  "aiEstimatorKnowledgeTaxRules", "aiEstimatorKnowledgeTaxVersions",
  "aiEstimatorKnowledgeUoms", "aiEstimatorKnowledgeVendors"
] as const;
export type SyncCollection = typeof SYNC_COLLECTIONS[number];
export const STATE_COLLECTION = "estimatorLocalSyncState";
export const LEASE_COLLECTION = "estimatorLocalSyncLeases";
export const SYNC_METADATA_COLLECTIONS = [STATE_COLLECTION, LEASE_COLLECTION] as const;
export const SYNC_LIMITS = { maxDocuments: 20_000, maxBytes: 32 * 1024 * 1024, maxWriteBytes: 8 * 1024 * 1024, maxTimeMS: 45_000, maxConflicts: 100 } as const;
export const MAINTENANCE_CONFIRMATION = "local-writers-and-old-scheduler-stopped";
export const isSyncCollection = (value: string): value is SyncCollection => (SYNC_COLLECTIONS as readonly string[]).includes(value);

// These models carry immutable snapshots or specialized monotonic counters.
export const IMMUTABLE_COLLECTIONS = new Set<SyncCollection>(["aiEstimatorKnowledgeBasketQualityRevisions", "aiEstimatorKnowledgeQualityControlOptions"]);
export const SEQUENCE_COLLECTION: SyncCollection = "aiEstimatorKnowledgeDisplayOrderSequences";
export const REQUIRED_SOURCE_COLLECTIONS: readonly SyncCollection[] = ["aiEstimatorKnowledgeBaskets", "aiEstimatorKnowledgeMainLines", "aiEstimatorKnowledgeVendors"];
