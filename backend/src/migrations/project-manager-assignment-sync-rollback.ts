import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";
import { digest, serialize, type Change, type Fingerprint, type Row } from "./project-manager-role-inventory.js";
import { assertMigrationActor, authorizationFence, reportCliError } from "./project-manager-role-migration.js";
import { SYNC_RECEIPTS, syncCollectionNames, type AssignmentSyncManifest } from "./project-manager-assignment-sync-inventory.js";
import { parseSyncArgs, syncReceiptDigest, syncReceiptId, validateSyncInput,
  verifySyncPostState, verifySyncReceipt, verifySyncTarget, writeSyncChange, writeSyncEvents,
  type AssignmentSyncInput, type SyncReceipt } from "./project-manager-assignment-sync.js";

const monotonic = new Set(["version", "sessionVersion", "procurementIdentityVersion", "purchaseOrderApprovalEpoch", "siteCompletionFenceEpoch"]);
/** Restore mappings atomically; historical signatures and previous session versions never return. */
export async function rollbackAssignmentSync(input: AssignmentSyncInput): Promise<{ runId: string; status: "rolled_back"; mapped: number }> {
  validateSyncInput(input); await verifySyncTarget(input);
  const receipts = input.db.collection<SyncReceipt>(SYNC_RECEIPTS);
  const prior = await receipts.findOne({ _id: syncReceiptId(input.runId) });
  if (!prior) throw new Error("UNKNOWN_SYNC_RUN");
  verifySyncReceipt(input, prior); await verifySyncPostState(input, prior);
  await input.testHooks?.beforeTransaction?.();
  const names = await syncCollectionNames(input.db);
  const session = input.client.startSession();
  try {
    await session.withTransaction(async () => {
      await assertMigrationActor(input.db, input.actorId, session);
      const existing = await receipts.findOne({ _id: syncReceiptId(input.runId) }, { session });
      if (!existing) throw new Error("UNKNOWN_SYNC_RUN");
      verifySyncReceipt(input, existing);
      if (existing.status === "rolled_back") {
        await verifySyncPostState(input, existing, session, names); return;
      }
      await authorizationFence(input.db, session);
      await assertMigrationActor(input.db, input.actorId, session);
      await verifySyncPostState(input, existing, session, names);
      const changes: Change[] = [], post: Fingerprint[] = [];
      for (const original of [...input.manifest.changes].reverse()) {
        const row = await input.db.collection<Row & { _id: string }>(original.collection).findOne({ _id: original.id }, { session });
        if (!row) throw new Error("SYNC_ROLLBACK_CAS_FAILED");
        const change: Change = { collection: original.collection, id: original.id, beforeDigest: digest(row), before: {}, after: {} };
        for (const [key, previous] of Object.entries(original.before)) {
          change.before[key] = Object.hasOwn(row, key) ? { present: true, value: serialize(row[key]) } : { present: false };
          if (monotonic.has(key)) {
            if (!Number.isSafeInteger(row[key]) || row[key] < 0 || !Number.isSafeInteger(row[key] + 1)) throw new Error("INVALID_SYNC_ROLLBACK_VERSION");
            change.after[key] = { present: true, value: serialize(row[key] + 1) };
          } else if (key === "updatedAt") change.after[key] = { present: true, value: serialize(new Date()) };
          else change.after[key] = previous;
        }
        changes.push(change); post.push(await writeSyncChange(input, change, session));
      }
      const events = await writeSyncEvents(input, changes, "rollback", session);
      const updated: SyncReceipt = { ...existing, status: "rolled_back", rollback: { changes, post, events }, digest: "" };
      updated.digest = syncReceiptDigest(updated);
      const written = await receipts.replaceOne({ _id: existing._id, status: "applied", digest: existing.digest }, updated, { session });
      if (written.matchedCount !== 1) throw new Error("SYNC_RECEIPT_CAS_FAILED");
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    const completed = await receipts.findOne({ _id: syncReceiptId(input.runId) });
    if (!completed) throw new Error("SYNC_RECEIPT_MISSING");
    verifySyncReceipt(input, completed); await verifySyncPostState(input, completed);
    return { runId: input.runId, status: "rolled_back", mapped: input.manifest.summary.toMap };
  } finally { await session.endSession(); }
}

export async function assignmentSyncRollbackCli(args = process.argv.slice(2)): Promise<void> {
  const options = parseSyncArgs(args);
  if (options.mode !== "rollback" || options.scope) throw new Error("EXPLICIT_SCOPED_ROLLBACK_REQUIRED");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI_REQUIRED");
  const client = new mongo.MongoClient(uri);
  try {
    await client.connect();
    const manifest = JSON.parse(await readFile(options.manifest!, "utf8")) as AssignmentSyncManifest;
    console.log(JSON.stringify(await rollbackAssignmentSync({ client, db: client.db(options.database), targetId: options.target!, manifest,
      runId: options["run-id"]!, backupRef: options["backup-ref"]!, actorId: options["actor-id"]! })));
  } finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) assignmentSyncRollbackCli().catch(reportCliError);
