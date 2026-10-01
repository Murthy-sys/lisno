import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";

export const LEGACY_VENDOR_UNIQUE_INDEX_NAME = "project_purchase_order_vendor_unique";
export const LEGACY_VENDOR_UNIQUE_INDEX_KEY = { projectId: 1, vendorId: 1 } as const;
export const VENDOR_LIST_INDEX_NAME = "project_purchase_order_vendor_list";
export const VENDOR_LIST_INDEX_KEY = { projectId: 1, vendorId: 1, createdAt: -1, _id: 1 } as const;

type Collection = mongo.Collection;
type Index = mongo.IndexDescriptionInfo;
export interface PurchaseOrderVendorIndexReport {
  mode: "dry-run" | "apply" | "rollback";
  indexes: Index[];
  orderCount: number;
  legacyUniquePresent: boolean;
  vendorListPresent: boolean;
  duplicateProjectVendorGroups: number;
  indexConflicts: string[];
  intendedChanges: string[];
}

const exactKey = (index: Index, key: Record<string, number>) => JSON.stringify(index.key) === JSON.stringify(key);
const plainIndex = (index: Index) => !index.sparse && !index.partialFilterExpression && !index.collation &&
  !index.hidden && index.expireAfterSeconds === undefined;

/** Inspect native Mongo index metadata and duplicate groups without touching documents or indexes. */
export async function inspectPurchaseOrderVendorIndex(collection: Collection): Promise<PurchaseOrderVendorIndexReport> {
  const indexes = await collection.listIndexes().toArray();
  const indexConflicts: string[] = [];
  const legacy = indexes.find((index) => index.name === LEGACY_VENDOR_UNIQUE_INDEX_NAME);
  const list = indexes.find((index) => index.name === VENDOR_LIST_INDEX_NAME);
  if (legacy && !(exactKey(legacy, LEGACY_VENDOR_UNIQUE_INDEX_KEY) && legacy.unique === true && plainIndex(legacy))) {
    indexConflicts.push(`Unexpected definition for ${LEGACY_VENDOR_UNIQUE_INDEX_NAME}`);
  }
  if (list && !(exactKey(list, VENDOR_LIST_INDEX_KEY) && list.unique !== true && plainIndex(list))) {
    indexConflicts.push(`Unexpected definition for ${VENDOR_LIST_INDEX_NAME}`);
  }
  for (const index of indexes) {
    if (index.name !== LEGACY_VENDOR_UNIQUE_INDEX_NAME && exactKey(index, LEGACY_VENDOR_UNIQUE_INDEX_KEY) && index.unique) {
      indexConflicts.push(`Unrecognized unique project/vendor index ${index.name}`);
    }
    if (index.name !== VENDOR_LIST_INDEX_NAME && exactKey(index, VENDOR_LIST_INDEX_KEY)) {
      indexConflicts.push(`Unrecognized project/vendor list index ${index.name}`);
    }
  }
  const duplicateGroups = await collection.aggregate<{ count: number }>([
    { $group: { _id: { projectId: "$projectId", vendorId: "$vendorId" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $count: "count" }
  ]).toArray();
  const legacyUniquePresent = legacy !== undefined;
  const vendorListPresent = list !== undefined;
  return {
    mode: "dry-run", indexes, orderCount: await collection.countDocuments({}),
    legacyUniquePresent, vendorListPresent, duplicateProjectVendorGroups: duplicateGroups[0]?.count ?? 0,
    indexConflicts,
    intendedChanges: [
      ...(!vendorListPresent ? [`Create nonunique ${VENDOR_LIST_INDEX_NAME}`] : []),
      ...(legacyUniquePresent ? [`Drop ${LEGACY_VENDOR_UNIQUE_INDEX_NAME} after backup`] : [])
    ]
  };
}

/** Idempotent index transition. Apply and rollback require verified backup and metadata capture. */
export async function migratePurchaseOrderVendorIndex(collection: Collection, options: {
  mode?: "dry-run" | "apply" | "rollback";
  backupVerified?: boolean;
  backupIndexMetadata?: (report: PurchaseOrderVendorIndexReport) => Promise<void>;
} = {}): Promise<PurchaseOrderVendorIndexReport> {
  const mode = options.mode ?? "dry-run";
  const report = await inspectPurchaseOrderVendorIndex(collection);
  if (mode === "dry-run") return report;
  if (report.indexConflicts.length) throw new Error("Purchase order vendor index migration refused: resolve reported index conflicts first.");
  if (mode === "rollback" && report.duplicateProjectVendorGroups > 0) {
    throw new Error("Rollback refused: multiple purchase orders now share a project/vendor pair.");
  }
  const alreadyTarget = mode === "apply"
    ? report.vendorListPresent && !report.legacyUniquePresent
    : report.legacyUniquePresent && !report.vendorListPresent;
  if (alreadyTarget) return { ...report, mode };
  if (!options.backupVerified || !options.backupIndexMetadata) {
    throw new Error("A verified database backup and index metadata backup are required before index writes.");
  }
  await options.backupIndexMetadata(report);
  if (mode === "apply") {
    // Build the replacement first. A failed drop leaves both indexes and can be retried.
    if (!report.vendorListPresent) await collection.createIndex(VENDOR_LIST_INDEX_KEY, { name: VENDOR_LIST_INDEX_NAME });
    if (report.legacyUniquePresent) await collection.dropIndex(LEGACY_VENDOR_UNIQUE_INDEX_NAME);
  } else {
    // Rollback is possible only while the old uniqueness rule remains satisfiable.
    if (!report.legacyUniquePresent) await collection.createIndex(LEGACY_VENDOR_UNIQUE_INDEX_KEY,
      { unique: true, name: LEGACY_VENDOR_UNIQUE_INDEX_NAME });
    if (report.vendorListPresent) await collection.dropIndex(VENDOR_LIST_INDEX_NAME);
  }
  return { ...(await inspectPurchaseOrderVendorIndex(collection)), mode };
}

/** CLI selects a database explicitly. Dry-run is the default; no implicit apply. */
export async function runPurchaseOrderVendorIndexCommand(argv = process.argv.slice(2), env = process.env): Promise<PurchaseOrderVendorIndexReport> {
  const valid = argv.every((arg) => ["--dry-run", "--apply", "--rollback", "--backup-verified"].includes(arg) ||
    arg.startsWith("--database=") || arg.startsWith("--index-metadata="));
  const modes = argv.filter((arg) => ["--dry-run", "--apply", "--rollback"].includes(arg));
  const databases = argv.filter((arg) => arg.startsWith("--database="));
  const metadata = argv.filter((arg) => arg.startsWith("--index-metadata="));
  if (!valid || modes.length > 1 || databases.length !== 1 || !databases[0]?.slice(11) || metadata.length > 1) {
    throw new Error("Use --database=<name> [--dry-run | --apply | --rollback] [--backup-verified --index-metadata=/absolute/path.json].");
  }
  const mode = modes.includes("--apply") ? "apply" : modes.includes("--rollback") ? "rollback" : "dry-run";
  const backupVerified = argv.includes("--backup-verified");
  const metadataPath = metadata[0]?.slice(17);
  if (mode !== "dry-run" && (!backupVerified || !metadataPath?.startsWith("/"))) {
    throw new Error("Index writes require --backup-verified and --index-metadata=/absolute/path.json.");
  }
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is required; no default server is selected.");
  const client = new mongo.MongoClient(env.MONGODB_URI);
  try {
    await client.connect();
    return await migratePurchaseOrderVendorIndex(client.db(databases[0].slice(11)).collection("projectPurchaseOrders"), {
      mode, backupVerified,
      backupIndexMetadata: metadataPath ? async (report) => {
        await writeFile(metadataPath, JSON.stringify({ database: databases[0].slice(11),
          collection: "projectPurchaseOrders", recordedAt: new Date().toISOString(), report }, null, 2),
        { flag: "wx", mode: 0o600 });
      } : undefined
    });
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPurchaseOrderVendorIndexCommand().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.indexConflicts.length) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`Purchase order vendor index migration failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
