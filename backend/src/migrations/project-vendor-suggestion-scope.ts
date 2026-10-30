import { writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";
import {
  VENDOR_SUGGESTION_COLLECTION, VENDOR_SUGGESTION_INDEX_DEFINITIONS,
  VENDOR_SUGGESTION_OLD_INDEX_NAME, VENDOR_SUGGESTION_OLD_INDEX_KEY,
  VENDOR_SUGGESTION_PROJECT_INDEX_NAME, VENDOR_SUGGESTION_PROJECT_INDEX_KEY, VENDOR_SUGGESTION_PROJECT_INDEX_FILTER,
  VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME, VENDOR_SUGGESTION_MAIN_LINE_INDEX_KEY, VENDOR_SUGGESTION_MAIN_LINE_INDEX_FILTER,
  VENDOR_SUGGESTION_REQUEST_INDEX_NAME, VENDOR_SUGGESTION_REQUEST_INDEX_KEY,
  isMissingVendorSuggestionCollection, matchesVendorSuggestionIndex,
  vendorSuggestionIndexConflicts, vendorSuggestionIndexesReady
} from "../domain/project-vendor-suggestion-scope-index.js";

type Collection = mongo.Collection;
export interface VendorSuggestionScopeIndexReport {
  collectionExists: boolean;
  indexes: mongo.IndexDescriptionInfo[];
  indexConflicts: string[];
  invalidRecords: Array<{ id: string; reasons: string[] }>;
  historicalNullRoundCount: number;
  projectDuplicateGroups: string[][];
  mainLineDuplicateGroups: string[][];
  requestDuplicateGroups: string[][];
  rollbackDuplicateGroups: string[][];
  oldIndexPresent: boolean;
  projectIndexPresent: boolean;
  mainLineIndexPresent: boolean;
  requestIndexPresent: boolean;
  ready: boolean;
}

const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positive = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const digest = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

function recordIssues(row: mongo.Document): string[] {
  const reasons: string[] = [];
  if (![row._id, row.projectId, row.estimateId, row.vendorId, row.createdById, row.idempotencyKey].every(nonempty)) reasons.push("Required record/source/request identity is missing or invalid");
  if (!positive(row.estimateVersion)) reasons.push("Estimate version is invalid");
  if (!digest(row.requestHash)) reasons.push("Request hash is invalid");
  if (row.estimateReviewRoundId != null && !nonempty(row.estimateReviewRoundId)) reasons.push("Review-round identity is invalid");
  const lineScoped = row.scope === "main_line";
  if (lineScoped) {
    if (![row.mainLineId, row.mainBasketId, row.estimateReviewRoundId, row.mainLineNameSnapshot].every(nonempty)) reasons.push("Main Line scope requires line, basket, round and saved name");
    if (!["pre", "post", "legacy"].includes(row.sourcePhase)) reasons.push("Main Line source phase is invalid");
    const collaborative = row.sourcePhase === "pre" || row.sourcePhase === "post";
    if (!positive(row.designPlanVersion) && !(collaborative && row.designPlanVersion === 0)) reasons.push("Design version is invalid for this source phase");
    if (collaborative && (!nonempty(row.sourceSnapshotId) || !digest(row.sourceDigest))) reasons.push("Collaborative source snapshot/digest is missing or invalid");
    if (row.sourceSnapshotId != null && !nonempty(row.sourceSnapshotId)) reasons.push("Source snapshot identity is invalid");
    if (row.sourceDigest != null && !digest(row.sourceDigest)) reasons.push("Source digest is invalid");
    if (!digest(row.scopeDigest)) reasons.push("Scope digest is invalid");
    if (!Array.isArray(row.scopeOccurrences) || !row.scopeOccurrences.length) reasons.push("Included source-line occurrences are missing");
    else {
      const keys = new Set<string>();
      for (const occurrence of row.scopeOccurrences) {
        if (!occurrence || typeof occurrence !== "object" ||
          ![occurrence.sourceLineItemKey, occurrence.sectionId].every(nonempty) ||
          typeof occurrence.roomName !== "string" || (occurrence.roomId != null && !nonempty(occurrence.roomId)) ||
          keys.has(occurrence.sourceLineItemKey)) {
          reasons.push("Included source-line occurrences are malformed or duplicated");
          break;
        }
        keys.add(occurrence.sourceLineItemKey);
      }
    }
  } else {
    if (row.scope != null && row.scope !== "project") reasons.push("Scope discriminator is invalid");
    if (row.mainLineId != null) reasons.push("Project-wide record has a Main Line identity");
    if (!positive(row.designPlanVersion)) reasons.push("Legacy project-wide Design version is invalid");
  }
  return reasons;
}

async function duplicateGroups(collection: Collection, keys: Record<string, number>, match?: mongo.Document): Promise<string[][]> {
  const rows = await collection.aggregate<{ ids: unknown[] }>([
    ...(match ? [{ $match: match }] : []),
    { $group: { _id: Object.fromEntries(Object.keys(keys).map(key => [key, { $ifNull: [`$${key}`, null] }])), ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $project: { _id: 0, ids: 1 } }
  ]).toArray();
  return rows.map(({ ids }) => ids.map(String).sort()).sort((a, b) => a.join("\0").localeCompare(b.join("\0")));
}

/** Only native reads; even a missing collection remains missing after inventory. */
export async function inspectVendorSuggestionScopeIndexes(collection: Collection): Promise<VendorSuggestionScopeIndexReport> {
  let indexes: mongo.IndexDescriptionInfo[] = [];
  let collectionExists = true;
  try { indexes = await collection.listIndexes().toArray(); }
  catch (error) { if (!isMissingVendorSuggestionCollection(error)) throw error; collectionExists = false; }
  const report: VendorSuggestionScopeIndexReport = {
    collectionExists, indexes, indexConflicts: vendorSuggestionIndexConflicts(indexes), invalidRecords: [], historicalNullRoundCount: 0,
    projectDuplicateGroups: [], mainLineDuplicateGroups: [], requestDuplicateGroups: [], rollbackDuplicateGroups: [],
    oldIndexPresent: indexes.some(({ name }) => name === VENDOR_SUGGESTION_OLD_INDEX_NAME),
    projectIndexPresent: indexes.some(({ name }) => name === VENDOR_SUGGESTION_PROJECT_INDEX_NAME),
    mainLineIndexPresent: indexes.some(({ name }) => name === VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME),
    requestIndexPresent: indexes.some(({ name }) => name === VENDOR_SUGGESTION_REQUEST_INDEX_NAME), ready: vendorSuggestionIndexesReady(indexes)
  };
  if (!collectionExists) return report;
  for await (const row of collection.find({}, { projection: {
    projectId: 1, estimateId: 1, estimateVersion: 1, estimateReviewRoundId: 1, designPlanVersion: 1,
    vendorId: 1, createdById: 1, idempotencyKey: 1, requestHash: 1, scope: 1, mainLineId: 1, mainBasketId: 1,
    mainLineNameSnapshot: 1, sourcePhase: 1, sourceSnapshotId: 1, sourceDigest: 1, scopeDigest: 1, scopeOccurrences: 1
  } })) {
    const reasons = recordIssues(row);
    if (reasons.length) report.invalidRecords.push({ id: String(row._id), reasons });
    if (row.estimateReviewRoundId == null && row.scope !== "main_line") report.historicalNullRoundCount += 1;
  }
  [report.projectDuplicateGroups, report.mainLineDuplicateGroups, report.requestDuplicateGroups, report.rollbackDuplicateGroups] = await Promise.all([
    duplicateGroups(collection, VENDOR_SUGGESTION_PROJECT_INDEX_KEY, VENDOR_SUGGESTION_PROJECT_INDEX_FILTER),
    duplicateGroups(collection, VENDOR_SUGGESTION_MAIN_LINE_INDEX_KEY, VENDOR_SUGGESTION_MAIN_LINE_INDEX_FILTER),
    duplicateGroups(collection, VENDOR_SUGGESTION_REQUEST_INDEX_KEY),
    duplicateGroups(collection, VENDOR_SUGGESTION_OLD_INDEX_KEY)
  ]);
  return report;
}

function assertInventorySafe(report: VendorSuggestionScopeIndexReport, mode: "apply" | "rollback"): void {
  if (report.indexConflicts.length || report.invalidRecords.length || report.projectDuplicateGroups.length ||
    report.mainLineDuplicateGroups.length || report.requestDuplicateGroups.length) {
    throw new Error("Suggestion index migration refused: resolve the reported index, scope, source or uniqueness conflicts first.");
  }
  if (mode === "rollback" && report.rollbackDuplicateGroups.length) {
    throw new Error("Rollback refused: scoped suggestions no longer satisfy the old project/vendor uniqueness. Retain compatible readers and indexes; do not delete records.");
  }
}

export async function migrateVendorSuggestionScopeIndexes(collection: Collection, options: {
  mode?: "dry-run" | "apply" | "rollback";
  writesQuiesced?: boolean;
  backupIndexMetadata?: (report: VendorSuggestionScopeIndexReport) => Promise<void>;
} = {}): Promise<VendorSuggestionScopeIndexReport> {
  const mode = options.mode ?? "dry-run";
  let report = await inspectVendorSuggestionScopeIndexes(collection);
  if (mode === "dry-run") return report;
  assertInventorySafe(report, mode);
  if (!options.writesQuiesced) throw new Error("Suggestion writes must be quiesced across all application instances before applying or rolling back indexes.");
  if (!options.backupIndexMetadata) throw new Error("Index metadata backup is required before applying or rolling back.");
  await options.backupIndexMetadata(report);
  // A final fresh inventory after backup is mandatory before the first write.
  report = await inspectVendorSuggestionScopeIndexes(collection);
  assertInventorySafe(report, mode);
  if (mode === "apply") {
    for (const definition of VENDOR_SUGGESTION_INDEX_DEFINITIONS.filter(({ name }) => name !== VENDOR_SUGGESTION_OLD_INDEX_NAME)) {
      if (!report.indexes.some(index => index.name === definition.name && matchesVendorSuggestionIndex(index, definition))) {
        await collection.createIndex(definition.key, {
          name: definition.name, unique: true, ...(definition.filter ? { partialFilterExpression: definition.filter } : {})
        });
      }
    }
    const protectedReport = await inspectVendorSuggestionScopeIndexes(collection);
    assertInventorySafe(protectedReport, mode);
    for (const definition of VENDOR_SUGGESTION_INDEX_DEFINITIONS.filter(({ name }) => name !== VENDOR_SUGGESTION_OLD_INDEX_NAME)) {
      if (!protectedReport.indexes.some(index => index.name === definition.name && matchesVendorSuggestionIndex(index, definition))) {
        throw new Error("New suggestion uniqueness protection could not be verified. The old index was retained.");
      }
    }
    if (protectedReport.oldIndexPresent) await collection.dropIndex(VENDOR_SUGGESTION_OLD_INDEX_NAME);
  } else {
    if (!report.oldIndexPresent) await collection.createIndex(VENDOR_SUGGESTION_OLD_INDEX_KEY, { name: VENDOR_SUGGESTION_OLD_INDEX_NAME, unique: true });
    const restored = await inspectVendorSuggestionScopeIndexes(collection);
    assertInventorySafe(restored, mode);
    const definition = VENDOR_SUGGESTION_INDEX_DEFINITIONS.find(({ name }) => name === VENDOR_SUGGESTION_OLD_INDEX_NAME)!;
    if (!restored.indexes.some(index => index.name === definition.name && matchesVendorSuggestionIndex(index, definition))) {
      throw new Error("Old uniqueness could not be verified; replacement indexes were retained.");
    }
    // Retain the replacement indexes too. The old index makes scoped readiness false,
    // and retaining them avoids a protection gap and permits safe re-application.
  }
  const finalReport = await inspectVendorSuggestionScopeIndexes(collection);
  assertInventorySafe(finalReport, mode);
  if (mode === "apply" && !finalReport.ready) throw new Error("Suggestion index preparation did not reach a verified ready state.");
  return finalReport;
}

export async function runVendorSuggestionScopeMigration(args: string[], env: NodeJS.ProcessEnv): Promise<VendorSuggestionScopeIndexReport> {
  const modeArgs = args.filter(arg => ["--dry-run", "--apply", "--rollback"].includes(arg));
  if (modeArgs.length > 1 || args.some(arg => !["--dry-run", "--apply", "--rollback", "--writes-quiesced"].includes(arg) &&
    !arg.startsWith("--database=") && !arg.startsWith("--backup="))) throw new Error("Use --database=<exact-name>, one of --dry-run (default), --apply or --rollback, and --writes-quiesced --backup=<absolute-path> for writes.");
  const databases = args.filter(arg => arg.startsWith("--database="));
  const backups = args.filter(arg => arg.startsWith("--backup="));
  const database = databases[0]?.slice(11);
  if (databases.length !== 1 || !database || !/^[A-Za-z0-9_-]+$/u.test(database)) throw new Error("One explicit --database=<exact-name> is required; no default database is selected.");
  if (backups.length > 1) throw new Error("Specify at most one metadata backup path.");
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  const mode = args.includes("--apply") ? "apply" : args.includes("--rollback") ? "rollback" : "dry-run";
  const backup = backups[0]?.slice(9);
  if (mode !== "dry-run" && (!args.includes("--writes-quiesced") || !backup || !isAbsolute(backup))) {
    throw new Error("Writes require --writes-quiesced and an absolute --backup path after separate target authorization and verified data backup.");
  }
  const client = new mongo.MongoClient(env.MONGODB_URI);
  try {
    await client.connect();
    return await migrateVendorSuggestionScopeIndexes(client.db(database).collection(VENDOR_SUGGESTION_COLLECTION), {
      mode, writesQuiesced: args.includes("--writes-quiesced"),
      backupIndexMetadata: backup ? async report => {
        await writeFile(backup, JSON.stringify({ database, collection: VENDOR_SUGGESTION_COLLECTION,
          recordedAt: new Date().toISOString(), ...report }, null, 2), { flag: "wx", mode: 0o600 });
      } : undefined
    });
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runVendorSuggestionScopeMigration(process.argv.slice(2), process.env).then(report => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.indexConflicts.length || report.invalidRecords.length || report.projectDuplicateGroups.length ||
      report.mainLineDuplicateGroups.length || report.requestDuplicateGroups.length) process.exitCode = 1;
  }).catch(() => {
    // Driver errors may embed credentials/URIs. Detailed safe conflicts are in the dry-run report.
    process.stderr.write("Suggestion index preparation failed. Check arguments and the secured dry-run report; no records were deleted or merged.\n");
    process.exitCode = 1;
  });
}
