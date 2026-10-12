import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";
import { exactPendingIndex, PENDING_REQUEST_FILTER, PENDING_REQUEST_INDEXES, requestIndexConflicts } from "../services/vendor-basket-request-indexes.js";

export interface BasketRequestTargetIndexReport {
  mode: "dry-run" | "apply" | "rollback";
  indexes: mongo.IndexDescriptionInfo[];
  requestCount: number;
  legacyIndexesPresent: string[];
  targetIndexesPresent: string[];
  legacyDuplicateGroups: number;
  targetDuplicateGroups: number;
  indexConflicts: string[];
  intendedChanges: string[];
}
async function duplicates(collection: mongo.Collection, parentScoped: boolean): Promise<number> {
  let count = 0;
  for (const field of ["vendorKey", "vendorNameNormalized"]) {
    const groups = await collection.aggregate<{ count: number }>([
      { $match: PENDING_REQUEST_FILTER },
      { $group: { _id: { vendor: `$${field}`, name: "$proposedNameNormalized",
        ...(parentScoped ? { parent: { $ifNull: ["$targetParentBasketId", null] } } : {}) }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }, { $count: "count" }
    ]).toArray();
    count += groups[0]?.count ?? 0;
  }
  return count;
}
/** Native-driver inspection only. Never initializes models or changes documents. */
export async function inspectBasketRequestTargetIndexes(collection: mongo.Collection): Promise<BasketRequestTargetIndexReport> {
  const indexes = await collection.listIndexes().toArray();
  const legacyIndexesPresent = PENDING_REQUEST_INDEXES.filter((definition) => indexes.some((index) => index.name === definition.oldName)).map((definition) => definition.oldName);
  const targetIndexesPresent = PENDING_REQUEST_INDEXES.filter((definition) => indexes.some((index) => index.name === definition.name)).map((definition) => definition.name);
  return { mode: "dry-run", indexes, requestCount: await collection.countDocuments({}), legacyIndexesPresent, targetIndexesPresent,
    legacyDuplicateGroups: await duplicates(collection, false), targetDuplicateGroups: await duplicates(collection, true),
    indexConflicts: requestIndexConflicts(indexes), intendedChanges: [
      ...PENDING_REQUEST_INDEXES.filter((definition) => !targetIndexesPresent.includes(definition.name)).map((definition) => `Build and verify ${definition.name}`),
      ...legacyIndexesPresent.map((name) => `Drop recognized legacy index ${name} after both replacements are verified`)
    ] };
}
export async function migrateBasketRequestTargetIndexes(collection: mongo.Collection, options: {
  mode?: "dry-run" | "apply" | "rollback"; backupVerified?: boolean; writersPaused?: boolean;
  backupIndexMetadata?: (report: BasketRequestTargetIndexReport) => Promise<void>;
} = {}): Promise<BasketRequestTargetIndexReport> {
  const mode = options.mode ?? "dry-run";
  const report = await inspectBasketRequestTargetIndexes(collection);
  if (mode === "dry-run") return report;
  function validate(value: BasketRequestTargetIndexReport): void {
    if (value.indexConflicts.length) throw new Error("Basket request index transition refused: resolve unknown or conflicting index definitions.");
    if (value.targetDuplicateGroups) throw new Error("Basket request index transition refused: pending requests conflict within the same target scope.");
    if (mode === "rollback" && value.legacyDuplicateGroups) throw new Error("Rollback refused: pending requests no longer satisfy legacy root-only uniqueness.");
  }
  validate(report);
  const ready = mode === "apply" ? report.targetIndexesPresent.length === 2 && report.legacyIndexesPresent.length === 0
    : report.legacyIndexesPresent.length === 2 && report.targetIndexesPresent.length === 0;
  if (ready) return { ...report, mode };
  if (!options.backupVerified || !options.writersPaused || !options.backupIndexMetadata) {
    throw new Error("Index writes require a verified database backup, paused writers, and captured index metadata.");
  }
  await options.backupIndexMetadata(report);
  // Reinspect immediately before writes; backup capture is not the final dry run.
  const finalDryRun = await inspectBasketRequestTargetIndexes(collection);
  validate(finalDryRun);
  if (JSON.stringify(finalDryRun.indexes) !== JSON.stringify(report.indexes) || finalDryRun.requestCount !== report.requestCount) {
    throw new Error("Index state changed after backup capture. Keep writers paused and repeat the final dry run.");
  }
  for (const definition of PENDING_REQUEST_INDEXES) {
    const name = mode === "apply" ? definition.name : definition.oldName;
    const key = mode === "apply" ? definition.key : definition.oldKey;
    if (!finalDryRun.indexes.some((index) => index.name === name)) {
      await collection.createIndex(key, { name, unique: true, partialFilterExpression: PENDING_REQUEST_FILTER });
    }
  }
  const built = await collection.listIndexes().toArray();
  if (requestIndexConflicts(built).length || PENDING_REQUEST_INDEXES.some((definition) => !built.some((index) =>
    index.name === (mode === "apply" ? definition.name : definition.oldName)
      && exactPendingIndex(index, mode === "apply" ? definition.key : definition.oldKey)))) {
    throw new Error("Replacement index verification failed. Existing protections were retained.");
  }
  for (const definition of PENDING_REQUEST_INDEXES) {
    const oldName = mode === "apply" ? definition.oldName : definition.name;
    if (built.some((index) => index.name === oldName)) await collection.dropIndex(oldName);
  }
  return { ...(await inspectBasketRequestTargetIndexes(collection)), mode };
}
/** Explicit server and database only; dry-run by default. No application-startup hook. */
export async function runBasketRequestTargetIndexCommand(argv = process.argv.slice(2), env = process.env): Promise<BasketRequestTargetIndexReport> {
  const modes = argv.filter((arg) => ["--dry-run", "--apply", "--rollback"].includes(arg));
  const databases = argv.filter((arg) => arg.startsWith("--database="));
  const paths = argv.filter((arg) => arg.startsWith("--index-metadata="));
  if (modes.length > 1 || databases.length !== 1 || !databases[0]?.slice(11) || paths.length > 1
    || argv.some((arg) => !["--dry-run", "--apply", "--rollback", "--backup-verified", "--writers-paused"].includes(arg)
      && !arg.startsWith("--database=") && !arg.startsWith("--index-metadata="))) {
    throw new Error("Use --database=<name> [--dry-run | --apply | --rollback] [--backup-verified --writers-paused --index-metadata=/absolute/path.json].");
  }
  const mode = modes.includes("--apply") ? "apply" : modes.includes("--rollback") ? "rollback" : "dry-run";
  const metadataPath = paths[0]?.slice(17);
  if (mode !== "dry-run" && (!argv.includes("--backup-verified") || !argv.includes("--writers-paused") || !metadataPath?.startsWith("/"))) {
    throw new Error("Index writes require backup verification, paused writers and an absolute metadata capture path.");
  }
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is required; no server is inferred.");
  const client = new mongo.MongoClient(env.MONGODB_URI);
  try {
    await client.connect();
    return await migrateBasketRequestTargetIndexes(client.db(databases[0].slice(11)).collection("vendorBasketRequests"), {
      mode, backupVerified: argv.includes("--backup-verified"), writersPaused: argv.includes("--writers-paused"),
      backupIndexMetadata: metadataPath ? async (report) => { await writeFile(metadataPath, JSON.stringify({
        database: databases[0].slice(11), collection: "vendorBasketRequests", recordedAt: new Date().toISOString(), report
      }, null, 2), { flag: "wx", mode: 0o600 }); } : undefined
    });
  } finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBasketRequestTargetIndexCommand().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.indexConflicts.length || report.targetDuplicateGroups) process.exitCode = 1;
  }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Basket request index transition failed."}\n`); process.exitCode = 1; });
}
