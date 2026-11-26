import { writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";

export const DESIGNER_REQUEST_COLLECTION = "designerassignmentrequests";
export const DESIGNER_REQUEST_LEGACY_INDEX = "one_pending_designer_request_per_project";
export const DESIGNER_REQUEST_PAIR_INDEX = "one_pending_designer_request_per_project_designer";
const legacyKey = { projectId: 1 } as const;
const pairKey = { projectId: 1, designerId: 1 } as const;
const pendingFilter = { status: "pending" } as const;
type Collection = mongo.Collection;
type Index = mongo.IndexDescriptionInfo;
type Mode = "dry-run" | "apply" | "rollback";

class IndexTransitionError extends Error {}

export interface DesignerRequestIndexReport {
  mode: Mode;
  database: string;
  collection: string;
  collectionExists: boolean;
  indexes: Index[];
  legacyPresent: boolean;
  replacementPresent: boolean;
  indexConflicts: string[];
  requestCount: number;
  pendingCount: number;
  invalidPendingRequestIds: string[];
  duplicatePendingPairs: Array<{ projectId: string; designerId: string; requestIds: string[]; count: number }>;
  multiplePendingProjects: Array<{ projectId: string; requestIds: string[]; count: number }>;
  instructions: string;
}

const exactKey = (index: Index, key: Record<string, number>) => JSON.stringify(index.key) === JSON.stringify(key);
const exactPendingUnique = (index: Index, key: Record<string, number>) => exactKey(index, key) && index.unique === true &&
  JSON.stringify(index.partialFilterExpression) === JSON.stringify(pendingFilter) && !index.sparse && !index.collation &&
  !index.hidden && index.expireAfterSeconds === undefined && !index.prepareUnique;

/** Native collection reads only. In particular, do not initialize Mongoose indexes during inspection. */
export async function inspectDesignerRequestIndex(collection: Collection): Promise<DesignerRequestIndexReport> {
  let collectionExists = true;
  const indexes = await collection.listIndexes().toArray().catch((error: unknown) => {
    if (!(error instanceof mongo.MongoServerError) || error.code !== 26) throw error;
    collectionExists = false;
    return [] as Index[];
  });
  indexes.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const indexConflicts: string[] = [];
  for (const index of indexes) {
    if (index.name === DESIGNER_REQUEST_LEGACY_INDEX) {
      if (!exactPendingUnique(index, legacyKey)) indexConflicts.push(`Unexpected definition for ${DESIGNER_REQUEST_LEGACY_INDEX}`);
    } else if (index.name === DESIGNER_REQUEST_PAIR_INDEX) {
      if (!exactPendingUnique(index, pairKey)) indexConflicts.push(`Unexpected definition for ${DESIGNER_REQUEST_PAIR_INDEX}`);
    } else if (index.unique && Object.keys(index.key).includes("projectId") &&
      Object.keys(index.key).every(key => ["projectId", "designerId", "status"].includes(key))) {
      indexConflicts.push(`Unrecognized assignment uniqueness index ${index.name}`);
    }
  }
  const invalidPendingRequestIds: string[] = [];
  for await (const request of collection.find(pendingFilter, { projection: { projectId: 1, designerId: 1 } })) {
    if (typeof request.projectId !== "string" || !request.projectId.trim() ||
      typeof request.designerId !== "string" || !request.designerId.trim()) invalidPendingRequestIds.push(String(request._id));
  }
  invalidPendingRequestIds.sort();
  const duplicatePendingPairs = await collection.aggregate<DesignerRequestIndexReport["duplicatePendingPairs"][number]>([
    { $match: pendingFilter }, { $sort: { _id: 1 } },
    { $group: { _id: { projectId: "$projectId", designerId: "$designerId" }, requestIds: { $push: { $toString: "$_id" } }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $sort: { "_id.projectId": 1, "_id.designerId": 1 } },
    { $project: { _id: 0, projectId: "$_id.projectId", designerId: "$_id.designerId", requestIds: 1, count: 1 } }
  ]).toArray();
  const multiplePendingProjects = await collection.aggregate<DesignerRequestIndexReport["multiplePendingProjects"][number]>([
    { $match: pendingFilter }, { $sort: { _id: 1 } },
    { $group: { _id: "$projectId", requestIds: { $push: { $toString: "$_id" } }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $sort: { _id: 1 } },
    { $project: { _id: 0, projectId: "$_id", requestIds: 1, count: 1 } }
  ]).toArray();
  return {
    mode: "dry-run", database: collection.dbName, collection: collection.collectionName, collectionExists, indexes,
    legacyPresent: indexes.some(index => index.name === DESIGNER_REQUEST_LEGACY_INDEX),
    replacementPresent: indexes.some(index => index.name === DESIGNER_REQUEST_PAIR_INDEX), indexConflicts,
    requestCount: await collection.countDocuments({}), pendingCount: await collection.countDocuments(pendingFilter),
    invalidPendingRequestIds, duplicatePendingPairs, multiplePendingProjects,
    instructions: "Quiesce assignment writes and verify a database backup. Build and verify the pair index before dropping the exact legacy index. Rollback requires at most one pending request per project and rebuilds legacy protection before dropping the pair index. Never delete requests to resolve conflicts."
  };
}

function assertReady(report: DesignerRequestIndexReport, mode: Exclude<Mode, "dry-run">) {
  if (report.indexConflicts.length || report.invalidPendingRequestIds.length || report.duplicatePendingPairs.length)
    throw new IndexTransitionError("Resolve reported index definitions, invalid pending identities, and duplicate pending pairs before index writes.");
  if (mode === "rollback" && report.multiplePendingProjects.length)
    throw new IndexTransitionError("Rollback refused: reconcile projects with multiple pending requests first. No requests were deleted.");
}

/** Explicit, narrowly scoped transition; never rewrites or removes request records. */
export async function migrateDesignerRequestIndex(collection: Collection, options: {
  mode?: Mode;
  backupVerified?: boolean;
  writesQuiesced?: boolean;
  backupIndexMetadata?: (report: DesignerRequestIndexReport) => Promise<void>;
} = {}): Promise<DesignerRequestIndexReport> {
  const mode = options.mode ?? "dry-run";
  if (!["dry-run", "apply", "rollback"].includes(mode)) throw new IndexTransitionError("Unknown index transition mode.");
  const report = await inspectDesignerRequestIndex(collection);
  if (mode === "dry-run") return report;
  assertReady(report, mode);
  if (!options.backupVerified || !options.writesQuiesced || !options.backupIndexMetadata)
    throw new IndexTransitionError("Index writes require verified backup, metadata capture and quiesced assignment writes.");
  const targetReached = mode === "apply" ? report.replacementPresent && !report.legacyPresent : report.legacyPresent && !report.replacementPresent;
  if (targetReached) return { ...report, mode };
  await options.backupIndexMetadata(report);
  // Inspect again after backup capture, immediately before the first possible index write.
  const ready = await inspectDesignerRequestIndex(collection);
  assertReady(ready, mode);
  if (JSON.stringify(ready.indexes) !== JSON.stringify(report.indexes))
    throw new IndexTransitionError("Index definitions changed after metadata capture. Run a new dry run and capture fresh metadata.");
  const keepName = mode === "apply" ? DESIGNER_REQUEST_PAIR_INDEX : DESIGNER_REQUEST_LEGACY_INDEX;
  const retireName = mode === "apply" ? DESIGNER_REQUEST_LEGACY_INDEX : DESIGNER_REQUEST_PAIR_INDEX;
  const keepPresent = mode === "apply" ? ready.replacementPresent : ready.legacyPresent;
  if (!keepPresent) await collection.createIndex(mode === "apply" ? pairKey : legacyKey,
    { name: keepName, unique: true, partialFilterExpression: pendingFilter });
  // Retain both protections on failure; a subsequent explicit invocation can resume safely.
  const protectedReport = await inspectDesignerRequestIndex(collection);
  assertReady(protectedReport, mode);
  if (!(mode === "apply" ? protectedReport.replacementPresent : protectedReport.legacyPresent))
    throw new IndexTransitionError("Required replacement protection could not be verified; the previous index was retained.");
  if (protectedReport.indexes.some(index => index.name === retireName)) await collection.dropIndex(retireName);
  const final = await inspectDesignerRequestIndex(collection);
  assertReady(final, mode);
  if (!(mode === "apply" ? final.replacementPresent && !final.legacyPresent : final.legacyPresent && !final.replacementPresent))
    throw new IndexTransitionError("Final index state differs from the requested state. Keep assignment writes quiesced and inspect again.");
  return { ...final, mode };
}

/** Explicit server and database, dry-run by default; credentials are never printed. */
export async function runDesignerRequestIndexCommand(argv = process.argv.slice(2), env = process.env): Promise<DesignerRequestIndexReport> {
  const modes = argv.filter(arg => ["--dry-run", "--apply", "--rollback"].includes(arg));
  const databases = argv.filter(arg => arg.startsWith("--database="));
  const metadata = argv.filter(arg => arg.startsWith("--index-metadata="));
  if (modes.length > 1 || databases.length !== 1 || !databases[0]?.slice(11).trim() || metadata.length > 1 ||
    new Set(argv).size !== argv.length || argv.some(arg =>
      !["--dry-run", "--apply", "--rollback", "--backup-verified", "--writes-quiesced"].includes(arg) &&
      !arg.startsWith("--database=") && !arg.startsWith("--index-metadata=")))
    throw new IndexTransitionError("Use --database=<name> [--dry-run | --apply | --rollback] [--backup-verified --writes-quiesced --index-metadata=/absolute/path.json].");
  const mode: Mode = modes.includes("--apply") ? "apply" : modes.includes("--rollback") ? "rollback" : "dry-run";
  const database = databases[0].slice(11);
  const metadataPath = metadata[0]?.slice(17);
  if (mode !== "dry-run" && (!argv.includes("--backup-verified") || !argv.includes("--writes-quiesced") || !metadataPath || !isAbsolute(metadataPath)))
    throw new IndexTransitionError("Index writes require verified backup, quiesced writes and an absolute metadata backup path.");
  if (!env.MONGODB_URI) throw new IndexTransitionError("MONGODB_URI is required; no default server is selected.");
  const client = new mongo.MongoClient(env.MONGODB_URI);
  try {
    await client.connect();
    return await migrateDesignerRequestIndex(client.db(database).collection(DESIGNER_REQUEST_COLLECTION), {
      mode, backupVerified: argv.includes("--backup-verified"), writesQuiesced: argv.includes("--writes-quiesced"),
      backupIndexMetadata: metadataPath ? report => writeFile(metadataPath,
        JSON.stringify({ recordedAt: new Date().toISOString(), ...report }, null, 2), { flag: "wx", mode: 0o600 }) : undefined
    });
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDesignerRequestIndexCommand().then(report => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.indexConflicts.length || report.invalidPendingRequestIds.length || report.duplicatePendingPairs.length) process.exitCode = 1;
  }).catch(error => {
    process.stderr.write(`Designer assignment index transition failed: ${error instanceof IndexTransitionError ? error.message : "Check the target, backup and dry-run report; assignment writes must remain quiesced until index state is verified."}\n`);
    process.exitCode = 1;
  });
}
