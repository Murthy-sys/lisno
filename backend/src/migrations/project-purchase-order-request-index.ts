import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";

export const REQUEST_ACTIVE_INDEX = "project_purchase_order_request_one_active_v2";
export const REQUEST_LEGACY_INDEX = "project_purchase_order_request_one_active";
const key = { projectId: 1 } as const;
const legacyStatuses = ["pending_approval", "changes_requested"];
const openStatuses = [...legacyStatuses, "ready_to_issue"];
const filter = (statuses: string[]) => ({ status: { $in: statuses } });
type Collection = mongo.Collection;

export async function inspectPurchaseOrderRequestIndex(collection: Collection) {
  const indexes = (await collection.listIndexes().toArray()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const indexConflicts: string[] = [];
  for (const index of indexes.filter(index => index.name === REQUEST_ACTIVE_INDEX || index.name === REQUEST_LEGACY_INDEX)) {
    const statuses = index.name === REQUEST_ACTIVE_INDEX ? openStatuses : legacyStatuses;
    if (JSON.stringify(index.key) !== JSON.stringify(key) || index.unique !== true ||
      JSON.stringify(index.partialFilterExpression) !== JSON.stringify(filter(statuses)) || index.sparse || index.collation || index.hidden)
      indexConflicts.push(`Unexpected definition for ${index.name}`);
  }
  const conflicts = await collection.aggregate<{ projectId: string; requestIds: string[]; count: number }>([
    { $match: { status: { $in: openStatuses } } }, { $sort: { _id: 1 } },
    { $group: { _id: "$projectId", requestIds: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $sort: { _id: 1 } },
    { $project: { _id: 0, projectId: "$_id", requestIds: 1, count: 1 } }
  ]).toArray();
  return { mode: "dry-run" as "dry-run" | "apply" | "rollback", indexes, indexConflicts, conflicts,
    readyToIssueCount: await collection.countDocuments({ status: "ready_to_issue" }),
    replacementPresent: indexes.some(index => index.name === REQUEST_ACTIVE_INDEX),
    legacyPresent: indexes.some(index => index.name === REQUEST_LEGACY_INDEX),
    instructions: "Quiesce purchase-request writes and verify a database backup. Build the stricter v2 index before dropping the legacy index. Rollback requires no ready_to_issue records and builds the legacy index before dropping v2. Never delete conflicting requests automatically." };
}
export type PurchaseOrderRequestIndexReport = Awaited<ReturnType<typeof inspectPurchaseOrderRequestIndex>>;

export async function migratePurchaseOrderRequestIndex(collection: Collection, options: {
  mode?: "dry-run" | "apply" | "rollback"; backupVerified?: boolean; writesQuiesced?: boolean;
  backupIndexMetadata?: (report: PurchaseOrderRequestIndexReport) => Promise<void>;
} = {}): Promise<PurchaseOrderRequestIndexReport> {
  const mode = options.mode ?? "dry-run";
  const report = await inspectPurchaseOrderRequestIndex(collection);
  if (mode === "dry-run") return report;
  if (report.indexConflicts.length || report.conflicts.length) throw new Error("Resolve index definitions and duplicate open requests before index writes.");
  if (mode === "rollback" && report.readyToIssueCount) throw new Error("Rollback requires reconciliation of every ready_to_issue request first.");
  if (!options.backupVerified || !options.writesQuiesced || !options.backupIndexMetadata)
    throw new Error("Index writes require verified backup, metadata capture and quiesced purchase-request writes.");
  await options.backupIndexMetadata(report);
  if (mode === "apply") {
    if (!report.replacementPresent) await collection.createIndex(key, { name: REQUEST_ACTIVE_INDEX, unique: true, partialFilterExpression: filter(openStatuses) });
    if (report.legacyPresent) await collection.dropIndex(REQUEST_LEGACY_INDEX);
  } else {
    if (!report.legacyPresent) await collection.createIndex(key, { name: REQUEST_LEGACY_INDEX, unique: true, partialFilterExpression: filter(legacyStatuses) });
    if (report.replacementPresent) await collection.dropIndex(REQUEST_ACTIVE_INDEX);
  }
  return { ...await inspectPurchaseOrderRequestIndex(collection), mode };
}

export async function runPurchaseOrderRequestIndexCommand(argv = process.argv.slice(2), env = process.env) {
  const modes = argv.filter(arg => ["--dry-run", "--apply", "--rollback"].includes(arg));
  const databases = argv.filter(arg => arg.startsWith("--database="));
  const metadata = argv.filter(arg => arg.startsWith("--index-metadata="));
  if (modes.length > 1 || databases.length !== 1 || !databases[0]?.slice(11) || metadata.length > 1 ||
    argv.some(arg => !["--dry-run", "--apply", "--rollback", "--backup-verified", "--writes-quiesced"].includes(arg) && !arg.startsWith("--database=") && !arg.startsWith("--index-metadata=")))
    throw new Error("Use --database=<name> [--dry-run | --apply | --rollback] [--backup-verified --writes-quiesced --index-metadata=/absolute/path.json].");
  const mode = modes.includes("--apply") ? "apply" : modes.includes("--rollback") ? "rollback" : "dry-run";
  const path = metadata[0]?.slice(17);
  if (mode !== "dry-run" && (!argv.includes("--backup-verified") || !argv.includes("--writes-quiesced") || !path?.startsWith("/")))
    throw new Error("Index writes require verified backup, quiesced writes and an absolute metadata backup path.");
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is required; no default server is selected.");
  const client = new mongo.MongoClient(env.MONGODB_URI);
  try {
    await client.connect();
    return await migratePurchaseOrderRequestIndex(client.db(databases[0].slice(11)).collection("projectPurchaseOrderRequests"), {
      mode, backupVerified: argv.includes("--backup-verified"), writesQuiesced: argv.includes("--writes-quiesced"),
      backupIndexMetadata: path ? report => writeFile(path, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 }) : undefined
    });
  } finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPurchaseOrderRequestIndexCommand().then(report => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.indexConflicts.length || report.conflicts.length) process.exitCode = 1;
  }).catch(() => { process.stderr.write("Purchase-request index preparation failed. Check the requested database, backup and conflict report.\n"); process.exitCode = 1; });
}
