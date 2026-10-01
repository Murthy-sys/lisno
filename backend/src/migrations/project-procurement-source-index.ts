import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";
import { storedProcurementSource } from "../domain/project-procurement.js";

export const PROCUREMENT_OLD_INDEX_NAME = "projectId_1_itemNameNormalized_1_brandNormalized_1_uomId_1_vendorId_1";
export const PROCUREMENT_NEW_INDEX_NAME = "project_procurement_source_item_unique";
export const PROCUREMENT_OLD_INDEX_KEY = { projectId: 1, itemNameNormalized: 1, brandNormalized: 1, uomId: 1, vendorId: 1 } as const;
export const PROCUREMENT_NEW_INDEX_KEY = { projectId: 1, estimateId: 1, estimateVersion: 1, sourceLineItemKey: 1, itemNameNormalized: 1, brandNormalized: 1, uomId: 1, vendorId: 1 } as const;
export const PROCUREMENT_ACTIVE_INDEX_NAME = "project_procurement_source_item_active_unique";
export const PROCUREMENT_ACTIVE_INDEX_KEY = PROCUREMENT_NEW_INDEX_KEY;
export const PROCUREMENT_ACTIVE_INDEX_FILTER = { removedAt: null } as const;
type Collection = mongo.Collection;
type Index = mongo.IndexDescriptionInfo;
export interface ProcurementIndexReport {
  indexes: Index[];
  invalidSourceIds: string[];
  sourceDuplicateGroups: string[][];
  projectDuplicateGroups: string[][];
  indexConflicts: string[];
  sourceIndexPresent: boolean;
  legacyIndexPresent: boolean;
}

function exactKey(index: Index, key: Record<string, number>): boolean {
  return JSON.stringify(index.key) === JSON.stringify(key);
}
function exactUnique(index: Index, key: Record<string, number>): boolean {
  return exactKey(index, key) && index.unique === true && !index.sparse && !index.partialFilterExpression && !index.collation && !index.hidden && index.expireAfterSeconds === undefined;
}
async function duplicates(collection: Collection, keys: Record<string, number>, match?: Record<string, unknown>): Promise<string[][]> {
  const rows = await collection.aggregate<{ ids: string[] }>([
    ...(match ? [{ $match: match }] : []),
    { $group: { _id: Object.fromEntries(Object.keys(keys).map((key) => [key, { $ifNull: [`$${key}`, null] }])), ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $project: { _id: 0, ids: 1 } }
  ]).toArray();
  return rows.map((row) => row.ids.map(String));
}

export interface ProcurementActiveIndexReport {
  indexes: Index[];
  indexConflicts: string[];
  invalidActiveSourceIds: string[];
  activeDuplicateGroups: string[][];
  activeIndexPresent: boolean;
  sourceIndexPresent: boolean;
  legacyIndexPresent: boolean;
  removedItemCount: number;
}

/** Read-only inventory before replacing the older all-row unique index. */
export async function inspectProcurementActiveIndex(collection: Collection): Promise<ProcurementActiveIndexReport> {
  const indexes = await collection.listIndexes().toArray();
  const indexConflicts: string[] = [];
  for (const index of indexes) {
    if (index.name === PROCUREMENT_ACTIVE_INDEX_NAME && !(exactKey(index, PROCUREMENT_ACTIVE_INDEX_KEY) && index.unique === true &&
      JSON.stringify(index.partialFilterExpression) === JSON.stringify(PROCUREMENT_ACTIVE_INDEX_FILTER) &&
      !index.sparse && !index.collation && !index.hidden && index.expireAfterSeconds === undefined)) {
      indexConflicts.push(`Unexpected definition for ${PROCUREMENT_ACTIVE_INDEX_NAME}`);
    }
    if (index.name === PROCUREMENT_NEW_INDEX_NAME && !exactUnique(index, PROCUREMENT_NEW_INDEX_KEY)) indexConflicts.push(`Unexpected definition for ${PROCUREMENT_NEW_INDEX_NAME}`);
    if (index.name === PROCUREMENT_OLD_INDEX_NAME && !exactUnique(index, PROCUREMENT_OLD_INDEX_KEY)) indexConflicts.push(`Unexpected definition for ${PROCUREMENT_OLD_INDEX_NAME}`);
    if (![PROCUREMENT_ACTIVE_INDEX_NAME, PROCUREMENT_NEW_INDEX_NAME, PROCUREMENT_OLD_INDEX_NAME].includes(index.name) &&
      (exactKey(index, PROCUREMENT_ACTIVE_INDEX_KEY) || exactKey(index, PROCUREMENT_OLD_INDEX_KEY)) && index.unique) {
      indexConflicts.push(`Unknown procurement unique index ${index.name}`);
    }
  }
  const invalidActiveSourceIds: string[] = [];
  for await (const row of collection.find({ removedAt: null }, { projection: {
    estimateId: 1, estimateVersion: 1, estimateReviewRoundId: 1, sourceSectionId: 1, sourceLineItemKey: 1
  } })) {
    try { storedProcurementSource(row); } catch { invalidActiveSourceIds.push(String(row._id)); }
  }
  return { indexes, indexConflicts, invalidActiveSourceIds,
    activeDuplicateGroups: await duplicates(collection, PROCUREMENT_ACTIVE_INDEX_KEY, { removedAt: null }),
    activeIndexPresent: indexes.some((index) => index.name === PROCUREMENT_ACTIVE_INDEX_NAME),
    sourceIndexPresent: indexes.some((index) => index.name === PROCUREMENT_NEW_INDEX_NAME),
    legacyIndexPresent: indexes.some((index) => index.name === PROCUREMENT_OLD_INDEX_NAME),
    removedItemCount: await collection.countDocuments({ removedAt: { $ne: null } })
  };
}

/** Apply builds the active index first, then drops only recognized superseded indexes. */
export async function migrateProcurementActiveIndex(collection: Collection, options: {
  mode?: "dry-run" | "apply" | "rollback";
  backupIndexMetadata?: (report: ProcurementActiveIndexReport) => Promise<void>;
} = {}): Promise<ProcurementActiveIndexReport> {
  const report = await inspectProcurementActiveIndex(collection);
  const mode = options.mode ?? "dry-run";
  if (mode === "dry-run") return report;
  if (report.indexConflicts.length || report.invalidActiveSourceIds.length || report.activeDuplicateGroups.length) {
    throw new Error("Active procurement index migration refused: resolve reported index/source conflicts first.");
  }
  if (mode === "rollback" && (await duplicates(collection, PROCUREMENT_NEW_INDEX_KEY)).length) {
    throw new Error("Rollback refused: removed and active procurement items now share a source identity.");
  }
  if (!options.backupIndexMetadata) throw new Error("Index metadata backup is required before applying or rolling back.");
  await options.backupIndexMetadata(report);
  if (mode === "apply") {
    if (!report.activeIndexPresent) await collection.createIndex(PROCUREMENT_ACTIVE_INDEX_KEY, {
      unique: true, name: PROCUREMENT_ACTIVE_INDEX_NAME, partialFilterExpression: PROCUREMENT_ACTIVE_INDEX_FILTER
    });
    if (report.sourceIndexPresent) await collection.dropIndex(PROCUREMENT_NEW_INDEX_NAME);
    if (report.legacyIndexPresent) await collection.dropIndex(PROCUREMENT_OLD_INDEX_NAME);
  } else {
    if (!report.sourceIndexPresent) await collection.createIndex(PROCUREMENT_NEW_INDEX_KEY, { unique: true, name: PROCUREMENT_NEW_INDEX_NAME });
    if (report.activeIndexPresent) await collection.dropIndex(PROCUREMENT_ACTIVE_INDEX_NAME);
  }
  return inspectProcurementActiveIndex(collection);
}

/** Read only. This module uses the native collection, never Model.init/syncIndexes. */
export async function inspectProcurementSourceIndex(collection: Collection): Promise<ProcurementIndexReport> {
  const indexes = await collection.listIndexes().toArray();
  const indexConflicts: string[] = [];
  for (const index of indexes) {
    if (index.name === PROCUREMENT_OLD_INDEX_NAME && !exactUnique(index, PROCUREMENT_OLD_INDEX_KEY)) indexConflicts.push(`Unexpected definition for ${PROCUREMENT_OLD_INDEX_NAME}`);
    if (index.name === PROCUREMENT_NEW_INDEX_NAME && !exactUnique(index, PROCUREMENT_NEW_INDEX_KEY)) indexConflicts.push(`Unexpected definition for ${PROCUREMENT_NEW_INDEX_NAME}`);
    if (index.name !== PROCUREMENT_OLD_INDEX_NAME && exactKey(index, PROCUREMENT_OLD_INDEX_KEY) && index.unique) indexConflicts.push(`Unknown project-wide unique index ${index.name}`);
    if (index.name !== PROCUREMENT_NEW_INDEX_NAME && exactKey(index, PROCUREMENT_NEW_INDEX_KEY) && index.unique) indexConflicts.push(`Unknown source unique index ${index.name}`);
  }
  const invalidSourceIds: string[] = [];
  for await (const row of collection.find({}, { projection: { estimateId: 1, estimateVersion: 1, estimateReviewRoundId: 1, sourceSectionId: 1, sourceLineItemKey: 1 } })) {
    try { storedProcurementSource(row); } catch { invalidSourceIds.push(String(row._id)); }
  }
  return { indexes, invalidSourceIds, indexConflicts,
    sourceDuplicateGroups: await duplicates(collection, PROCUREMENT_NEW_INDEX_KEY),
    projectDuplicateGroups: await duplicates(collection, PROCUREMENT_OLD_INDEX_KEY),
    sourceIndexPresent: indexes.some((index) => index.name === PROCUREMENT_NEW_INDEX_NAME),
    legacyIndexPresent: indexes.some((index) => index.name === PROCUREMENT_OLD_INDEX_NAME)
  };
}

export async function migrateProcurementSourceIndex(collection: Collection, options: {
  mode?: "dry-run" | "apply" | "rollback";
  backupIndexMetadata?: (report: ProcurementIndexReport) => Promise<void>;
} = {}): Promise<ProcurementIndexReport> {
  // Always inspect immediately before a mutation; no data is rewritten.
  const report = await inspectProcurementSourceIndex(collection);
  const mode = options.mode ?? "dry-run";
  if (mode === "dry-run") return report;
  if (report.indexConflicts.length || report.invalidSourceIds.length || report.sourceDuplicateGroups.length) throw new Error("Index migration refused: resolve reported index/source conflicts first.");
  if (mode === "rollback" && report.projectDuplicateGroups.length) throw new Error("Rollback refused: materials now occur under multiple estimate items. Project-wide uniqueness is no longer satisfiable.");
  if (!options.backupIndexMetadata) throw new Error("Index metadata backup is required before applying or rolling back.");
  await options.backupIndexMetadata(report);
  if (mode === "apply") {
    if (!report.sourceIndexPresent) await collection.createIndex(PROCUREMENT_NEW_INDEX_KEY, { unique: true, name: PROCUREMENT_NEW_INDEX_NAME });
    if (report.legacyIndexPresent) await collection.dropIndex(PROCUREMENT_OLD_INDEX_NAME);
  } else {
    if (!report.legacyIndexPresent) await collection.createIndex(PROCUREMENT_OLD_INDEX_KEY, { unique: true, name: PROCUREMENT_OLD_INDEX_NAME });
    if (report.sourceIndexPresent) await collection.dropIndex(PROCUREMENT_NEW_INDEX_NAME);
  }
  return inspectProcurementSourceIndex(collection);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--active", "--apply", "--rollback", "--dry-run"].includes(arg) && !arg.startsWith("--backup=")) || args.filter((arg) => ["--apply", "--rollback", "--dry-run"].includes(arg)).length > 1) throw new Error("Use --active for the tombstone index, --dry-run (default), --apply or --rollback, and --backup=/absolute/path.json for writes.");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required; no default database is selected.");
  const mode = args.includes("--apply") ? "apply" : args.includes("--rollback") ? "rollback" : "dry-run";
  const active = args.includes("--active");
  const backup = args.find((arg) => arg.startsWith("--backup="))?.slice(9);
  if (mode !== "dry-run" && (!backup || !backup.startsWith("/"))) throw new Error("An absolute --backup path is required for writes.");
  const client = new mongo.MongoClient(uri);
  try {
    await client.connect();
    const backupIndexMetadata = backup ? async (value: ProcurementIndexReport | ProcurementActiveIndexReport) => {
      await writeFile(backup, JSON.stringify({ collection: "projectProcurementItems", recordedAt: new Date().toISOString(), ...value }, null, 2), { flag: "wx", mode: 0o600 });
    } : undefined;
    if (active) {
      const report = await migrateProcurementActiveIndex(client.db().collection("projectProcurementItems"), { mode, backupIndexMetadata });
      process.stdout.write(`${JSON.stringify({ mode, active, ...report }, null, 2)}\n`);
      if (report.indexConflicts.length || report.invalidActiveSourceIds.length || report.activeDuplicateGroups.length) process.exitCode = 1;
    } else {
      const report = await migrateProcurementSourceIndex(client.db().collection("projectProcurementItems"), { mode, backupIndexMetadata });
      process.stdout.write(`${JSON.stringify({ mode, ...report }, null, 2)}\n`);
      if (report.indexConflicts.length || report.invalidSourceIds.length || report.sourceDuplicateGroups.length) process.exitCode = 1;
    }
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  process.stderr.write(`Procurement index migration failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
