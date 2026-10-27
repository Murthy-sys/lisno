import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";
import { RECEIPTS, digest, serialize, type Change, type Fingerprint, type Manifest, type Row } from "./project-manager-role-inventory.js";
import { assertMigrationActor, authorizationFence, parseMigrationArgs, reportCliError, runReceiptId, validateInput,
  verifyCurrentState, verifyRun, verifyTarget, writeChange, writeCohortReceipt,
  type MigrationInput, type RunReceipt } from "./project-manager-role-migration.js";

const monotonic = new Set(["version", "sessionVersion", "procurementIdentityVersion", "purchaseOrderApprovalEpoch", "siteCompletionFenceEpoch", "awardApprovalEpoch"]);

/** Restores owner/role fields only. Versions/fences advance again; old sessions never revive. */
export async function rollbackProjectManagerRoleMigration(input: MigrationInput): Promise<{ runId: string; status: "rolled_back"; cohorts: number }> {
  validateInput(input); await verifyTarget(input);
  const receipts = input.db.collection<RunReceipt>(RECEIPTS);
  const initial = await receipts.findOne({ _id: runReceiptId(input.runId) });
  if (!initial) throw new Error("UNKNOWN_RUN");
  verifyRun(input, initial);
  await verifyCurrentState(input, initial);
  const session = input.client.startSession();
  try {
    for (;;) {
      let done = false;
      let revertedIndex: number | null = null;
      await session.withTransaction(async () => {
        await authorizationFence(input.db, session);
        const run = await receipts.findOne({ _id: runReceiptId(input.runId) }, { session });
        if (!run) throw new Error("UNKNOWN_RUN");
        verifyRun(input, run);
        await verifyCurrentState(input, run, session);
        if (run.status === "rolled_back") { done = true; return; }
        await assertMigrationActor(input.db, input.actorId, session);
        if (run.rollbackCount === run.nextCohort) {
          await receipts.updateOne({ _id: run._id, rollbackCount: run.rollbackCount, nextCohort: run.nextCohort }, { $set: { status: "rolled_back" } }, { session });
          done = true; return;
        }
        const index = run.nextCohort - run.rollbackCount - 1;
        const cohort = input.manifest.cohorts[index];
        if (!cohort) throw new Error("RUN_PROGRESS_INVALID");
        const changes: Change[] = [], post: Fingerprint[] = [];
        for (const original of [...cohort.changes].reverse()) {
          const row = await input.db.collection<Row & { _id: string }>(original.collection).findOne({ _id: original.id }, { session });
          if (!row) throw new Error("ROLLBACK_CAS_FAILED");
          const change: Change = { collection: original.collection, id: original.id, beforeDigest: digest(row), before: {}, after: {} };
          for (const [key, previous] of Object.entries(original.before)) {
            change.before[key] = Object.hasOwn(row, key) ? { present: true, value: serialize(row[key]) } : { present: false };
            if (monotonic.has(key)) {
              if (!Number.isSafeInteger(row[key]) || row[key] < 0 || !Number.isSafeInteger(row[key] + 1)) throw new Error("INVALID_ROLLBACK_VERSION");
              change.after[key] = { present: true, value: serialize(row[key] + 1) };
            } else if (key === "updatedAt") change.after[key] = { present: true, value: serialize(new Date()) };
            else change.after[key] = previous;
          }
          changes.push(change); post.push(await writeChange(input, change, session));
        }
        await writeCohortReceipt(input, cohort.id, "rollback", changes, post, session);
        const rollbackCount = run.rollbackCount + 1;
        const changed = await receipts.updateOne({ _id: run._id, rollbackCount: run.rollbackCount, nextCohort: run.nextCohort },
          { $set: { rollbackCount, status: rollbackCount === run.nextCohort ? "rolled_back" : "rolling_back" } }, { session });
        if (changed.modifiedCount !== 1) throw new Error("RUN_CAS_FAILED");
        revertedIndex = index;
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
      if (done) break;
      if (revertedIndex !== null) await input.testHooks?.afterCohort?.(revertedIndex);
    }
    return { runId: input.runId, status: "rolled_back", cohorts: initial.nextCohort };
  } finally { await session.endSession(); }
}

export async function rollbackCli(args = process.argv.slice(2)): Promise<void> {
  const options = parseMigrationArgs(args);
  if (options.mode !== "rollback") throw new Error("EXPLICIT_ROLLBACK_MODE_REQUIRED");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI_REQUIRED");
  const client = new mongo.MongoClient(uri);
  try {
    await client.connect();
    const manifest = JSON.parse(await readFile(options.manifest!, "utf8")) as Manifest;
    console.log(JSON.stringify(await rollbackProjectManagerRoleMigration({ client, db: client.db(options.database), targetId: options.target!, manifest,
      runId: options["run-id"]!, backupRef: options["backup-ref"]!, actorId: options["actor-id"]! })));
  } finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) rollbackCli().catch(reportCliError);
