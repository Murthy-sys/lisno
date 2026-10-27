import { readFile, writeFile, chmod } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";
import { COLLECTIONS, MIGRATION_VERSION, RECEIPTS, assertIdentifier, buildProjectManagerRoleManifest,
  createProjectManagerRoleInventory, deserialize, digest, fingerprint, fingerprintKey, identifyTarget,
  manifestDigest, readInventoryState, sortSnapshot,
  type Change, type Fingerprint, type Manifest, type NativeDb, type NativeSession, type Row } from "./project-manager-role-inventory.js";

export interface MigrationInput {
  client: mongo.MongoClient; db: NativeDb; targetId: string; manifest: Manifest;
  runId: string; backupRef: string; actorId: string;
  /** Failure injection is for disposable-fixture tests only; never exposed by the CLI. */
  testHooks?: { afterMutation?: (change: Change) => Promise<void>; afterCohort?: (index: number) => Promise<void> };
}
export interface RunReceipt extends Row {
  _id: string; kind: "run"; runId: string; backupRef: string; actorId: string; manifest: Manifest;
  status: "applying" | "applied" | "rolling_back" | "rolled_back";
  nextCohort: number; rollbackCount: number;
}
export interface CohortReceipt extends Row {
  _id: string; kind: "apply" | "rollback"; runId: string; cohortId: string;
  changes: Change[]; post: Fingerprint[]; events: Fingerprint[]; digest: string;
}
export const runReceiptId = (runId: string) => `run:${runId}`;
export const cohortReceiptId = (runId: string, cohortId: string, kind: "apply" | "rollback") => `${kind}:${runId}:${cohortId}`;
export function validateInput(input: MigrationInput): void {
  for (const [value, code] of [[input.runId, "RUN_ID_REQUIRED"], [input.backupRef, "BACKUP_REFERENCE_REQUIRED"],
    [input.actorId, "ACTOR_REQUIRED"], [input.targetId, "EXPLICIT_TARGET_REQUIRED"]]) assertIdentifier(value, code);
  const manifest = input.manifest;
  if (!manifest || manifest.schemaVersion !== 1 || manifest.applicationVersion !== MIGRATION_VERSION) throw new Error("MANIFEST_VERSION_MISMATCH");
  if (manifest.digest !== manifestDigest(manifest)) throw new Error("MANIFEST_DIGEST_MISMATCH");
  if (!Array.isArray(manifest.conflicts) || manifest.conflicts.length) throw new Error("UNRESOLVED_MANIFEST_CONFLICTS");
  if (!Array.isArray(manifest.cohorts) || !Array.isArray(manifest.snapshot) || !Array.isArray(manifest.resolutions) ||
    !Array.isArray(manifest.assignmentSnapshots) || !Array.isArray(manifest.userSnapshots) ||
    !Number.isFinite(new Date(manifest.inventoryAt).getTime())) throw new Error("INVALID_MANIFEST");
  if (Buffer.byteLength(JSON.stringify(manifest)) > 8_000_000) throw new Error("MANIFEST_TOO_LARGE");
  if (manifest.cohorts.some(cohort => cohort.changes.length > 200)) throw new Error("COHORT_TOO_LARGE");
}
export async function verifyTarget(input: MigrationInput): Promise<void> {
  if (digest(await identifyTarget(input.db, input.targetId)) !== digest(input.manifest.target)) throw new Error("TARGET_MISMATCH");
}
export function verifyRun(input: MigrationInput, receipt: RunReceipt): void {
  if (receipt.kind !== "run" || receipt.runId !== input.runId || receipt.backupRef !== input.backupRef ||
    receipt.actorId !== input.actorId || receipt.manifest.digest !== input.manifest.digest ||
    manifestDigest(receipt.manifest) !== input.manifest.digest) throw new Error("RUN_IDENTITY_MISMATCH");
  const total = input.manifest.cohorts.length;
  if (!Number.isSafeInteger(receipt.nextCohort) || receipt.nextCohort < 0 || receipt.nextCohort > total ||
    !Number.isSafeInteger(receipt.rollbackCount) || receipt.rollbackCount < 0 || receipt.rollbackCount > receipt.nextCohort ||
    !["applying", "applied", "rolling_back", "rolled_back"].includes(receipt.status) ||
    receipt.status === "applying" && (receipt.nextCohort >= total || receipt.rollbackCount !== 0) ||
    receipt.status === "applied" && (receipt.nextCohort !== total || receipt.rollbackCount !== 0) ||
    receipt.status === "rolling_back" && receipt.rollbackCount >= receipt.nextCohort ||
    receipt.status === "rolled_back" && receipt.rollbackCount !== receipt.nextCohort) throw new Error("RUN_PROGRESS_INVALID");
}
export async function authorizationFence(db: NativeDb, session: NativeSession): Promise<void> {
  await db.collection<Row & { _id: string }>(COLLECTIONS.coordination).updateOne({ _id: "authorization" },
    { $inc: { revision: 1 }, $set: { updatedAt: new Date() } }, { upsert: true, session });
}
export async function assertMigrationActor(db: NativeDb, actorId: string, session: NativeSession): Promise<void> {
  const administrators = await db.collection<Row & { _id: string }>(COLLECTIONS.users)
    .find({ role: "super_admin", active: true }, { session, projection: { _id: 1 } }).toArray();
  if (administrators.length !== 1) throw new Error("SOLE_ACTIVE_SUPER_ADMIN_REQUIRED");
  if (administrators[0]!._id !== actorId) throw new Error("ACTIVE_SUPER_ADMIN_ACTOR_REQUIRED");
}
function receiptDigest(receipt: CohortReceipt): string { const { digest: ignored, ...body } = receipt; return digest(body); }
export async function expectedSnapshot(input: MigrationInput, run: RunReceipt, session?: NativeSession): Promise<Fingerprint[]> {
  const expected = new Map(input.manifest.snapshot.map(entry => [fingerprintKey(entry), entry]));
  const apply = async (index: number, kind: "apply" | "rollback") => {
    const cohort = input.manifest.cohorts[index]!;
    const receipt = await input.db.collection<CohortReceipt>(RECEIPTS).findOne({ _id: cohortReceiptId(input.runId, cohort.id, kind) }, { session });
    if (!receipt || receipt.kind !== kind || receipt.runId !== input.runId || receipt.cohortId !== cohort.id || receipt.digest !== receiptDigest(receipt)) throw new Error("RECEIPT_INTEGRITY_FAILURE");
    for (const entry of [...receipt.post, ...receipt.events]) expected.set(fingerprintKey(entry), entry);
  };
  for (let index = 0; index < run.nextCohort; index++) await apply(index, "apply");
  for (let offset = 0; offset < run.rollbackCount; offset++) await apply(run.nextCohort - offset - 1, "rollback");
  return sortSnapshot([...expected.values()]);
}
export async function verifyCurrentState(input: MigrationInput, run: RunReceipt, session?: NativeSession): Promise<void> {
  if (digest((await readInventoryState(input.db, session)).snapshot) !== digest(await expectedSnapshot(input, run, session))) {
    throw new Error("STALE_MANIFEST_OR_LATER_BUSINESS_ACTIVITY");
  }
}
export async function writeChange(input: MigrationInput, change: Change, session: NativeSession): Promise<Fingerprint> {
  const collection = input.db.collection<Row & { _id: string }>(change.collection);
  const existing = await collection.findOne({ _id: change.id }, { session });
  if (!existing || digest(existing) !== change.beforeDigest) throw new Error("CHANGE_CAS_FAILED");
  const filter: Row = { _id: change.id };
  for (const [key, field] of Object.entries(change.before)) filter[key] = field.present ? { $eq: deserialize(field.value) } : { $exists: false };
  const set: Row = {}, unset: Row = {};
  for (const [key, field] of Object.entries(change.after)) {
    if (field.present) set[key] = deserialize(field.value);
    else unset[key] = "";
  }
  const update = { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) };
  const result = await collection.updateOne(filter, update, { session });
  if (result.matchedCount !== 1) throw new Error("CHANGE_CAS_FAILED");
  const post = await collection.findOne({ _id: change.id }, { session });
  const intended = { ...existing, ...set }; for (const key of Object.keys(unset)) delete intended[key];
  if (!post || digest(post) !== digest(intended)) throw new Error("UNEXPECTED_POST_STATE");
  await input.testHooks?.afterMutation?.(change);
  return fingerprint(change.collection, post);
}
export async function writeCohortReceipt(input: MigrationInput, cohortId: string, kind: "apply" | "rollback",
  changes: Change[], post: Fingerprint[], session: NativeSession): Promise<void> {
  const events: Fingerprint[] = [];
  for (const change of changes) {
    const id = digest({ run: input.runId, kind, collection: change.collection, id: change.id });
    const occurredAt = new Date();
    const audit = { _id: `pm-role:${id}`, actorId: input.actorId,
      action: kind === "apply" ? "project_manager_role_migration_applied" : "project_manager_role_migration_rolled_back",
      entityType: change.collection === COLLECTIONS.users ? "user" : change.collection === COLLECTIONS.projects ? "project" : "project_workflow_task",
      entityId: change.id, occurredAt, createdAt: occurredAt,
      oldValues: change.before, newValues: change.after, reason: `Project Manager consolidation run ${input.runId}` };
    await input.db.collection<Row & { _id: string }>(COLLECTIONS.audits).insertOne(audit, { session });
    events.push(fingerprint(COLLECTIONS.audits, audit));
    if (change.collection === COLLECTIONS.projects) {
      const event = { _id: `pm-role:${id}`, projectId: change.id, vendorId: null, assignmentId: null,
        version: deserialize(change.after.procurementIdentityVersion!.value), kind: "project_manager_assignment", occurredAt };
      await input.db.collection<Row & { _id: string }>(COLLECTIONS.events).insertOne(event, { session });
      events.push(fingerprint(COLLECTIONS.events, event));
    }
  }
  const receipt: CohortReceipt = { _id: cohortReceiptId(input.runId, cohortId, kind), kind, runId: input.runId,
    cohortId, changes, post, events, digest: "" };
  receipt.digest = receiptDigest(receipt);
  await input.db.collection<CohortReceipt>(RECEIPTS).insertOne(receipt, { session });
}

/** Full preflight precedes any write. Each account and every dependent assignment commit together. */
export async function applyProjectManagerRoleMigration(input: MigrationInput): Promise<{ runId: string; status: "applied"; cohorts: number }> {
  validateInput(input); await verifyTarget(input);
  const receipts = input.db.collection<RunReceipt>(RECEIPTS);
  let run = await receipts.findOne({ _id: runReceiptId(input.runId) });
  if (run) {
    verifyRun(input, run);
    if (["rolling_back", "rolled_back"].includes(run.status)) throw new Error("RUN_ALREADY_ROLLED_BACK");
    await verifyCurrentState(input, run);
  } else {
    const fresh = await createProjectManagerRoleInventory({ db: input.db, targetId: input.targetId,
      now: new Date(input.manifest.inventoryAt), resolutions: input.manifest.resolutions });
    if (fresh.digest !== input.manifest.digest) throw new Error("STALE_OR_INVALID_MANIFEST");
  }
  const session = input.client.startSession();
  try {
    if (!run) await session.withTransaction(async () => {
      await authorizationFence(input.db, session);
      const state = await readInventoryState(input.db, session);
      const fresh = buildProjectManagerRoleManifest({ state, target: input.manifest.target,
        now: new Date(input.manifest.inventoryAt), resolutions: input.manifest.resolutions });
      if (fresh.digest !== input.manifest.digest) throw new Error("STALE_OR_INVALID_MANIFEST");
      await assertMigrationActor(input.db, input.actorId, session);
      run = { _id: runReceiptId(input.runId), kind: "run", runId: input.runId, backupRef: input.backupRef,
        actorId: input.actorId, manifest: input.manifest, status: input.manifest.cohorts.length ? "applying" : "applied",
        nextCohort: 0, rollbackCount: 0 };
      await receipts.insertOne(run, { session });
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    for (;;) {
      let appliedIndex: number | null = null;
      let done = false;
      await session.withTransaction(async () => {
        await authorizationFence(input.db, session);
        const current = await receipts.findOne({ _id: runReceiptId(input.runId) }, { session });
        if (!current) throw new Error("RUN_MISSING");
        verifyRun(input, current);
        if (["rolling_back", "rolled_back"].includes(current.status)) throw new Error("RUN_ALREADY_ROLLED_BACK");
        await verifyCurrentState(input, current, session);
        if (current.status === "applied") { done = true; return; }
        const cohort = input.manifest.cohorts[current.nextCohort];
        if (!cohort) throw new Error("RUN_PROGRESS_INVALID");
        const post: Fingerprint[] = [];
        for (const change of cohort.changes) post.push(await writeChange(input, change, session));
        await writeCohortReceipt(input, cohort.id, "apply", cohort.changes, post, session);
        const nextCohort = current.nextCohort + 1;
        const changed = await receipts.updateOne({ _id: current._id, status: "applying", nextCohort: current.nextCohort },
          { $set: { nextCohort, status: nextCohort === input.manifest.cohorts.length ? "applied" : "applying" } }, { session });
        if (changed.modifiedCount !== 1) throw new Error("RUN_CAS_FAILED");
        appliedIndex = current.nextCohort;
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
      if (done) break;
      if (appliedIndex !== null) await input.testHooks?.afterCohort?.(appliedIndex);
    }
    return { runId: input.runId, status: "applied", cohorts: input.manifest.cohorts.length };
  } finally { await session.endSession(); }
}

export function parseMigrationArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const allowed = new Set(["mode", "database", "target", "manifest", "resolutions", "run-id", "backup-ref", "actor-id"]);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, ""); const value = args[i + 1];
    if (!args[i]?.startsWith("--") || !key || !allowed.has(key) || !value || value.startsWith("--") || Object.hasOwn(result, key)) throw new Error("INVALID_CLI_ARGUMENTS");
    result[key] = value;
  }
  for (const key of ["database", "target", "manifest"]) assertIdentifier(result[key], `EXPLICIT_${key.toUpperCase()}_REQUIRED`);
  return result;
}
export async function migrationCli(args = process.argv.slice(2)): Promise<void> {
  const options = parseMigrationArgs(args), mode = options.mode ?? "dry-run";
  if (!["dry-run", "apply"].includes(mode)) throw new Error("INVALID_MODE");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI_REQUIRED");
  const client = new mongo.MongoClient(uri);
  try {
    await client.connect(); const db = client.db(options.database);
    if (mode === "dry-run") {
      const resolutions = options.resolutions ? JSON.parse(await readFile(options.resolutions, "utf8")) : [];
      const manifest = await createProjectManagerRoleInventory({ db, targetId: options.target!, resolutions });
      await writeFile(options.manifest!, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
      await chmod(options.manifest!, 0o600);
      console.log(JSON.stringify({ mode, digest: manifest.digest, cohorts: manifest.cohorts.length, conflicts: manifest.conflicts }));
      if (manifest.conflicts.length) process.exitCode = 2;
    } else {
      const manifest = JSON.parse(await readFile(options.manifest!, "utf8")) as Manifest;
      console.log(JSON.stringify(await applyProjectManagerRoleMigration({ client, db, targetId: options.target!, manifest,
        runId: options["run-id"]!, backupRef: options["backup-ref"]!, actorId: options["actor-id"]! })));
    }
  } finally { await client.close(); }
}
export function reportCliError(error: unknown): void {
  // Driver errors can contain credentials, hosts or private documents. Only our bounded codes are printable.
  const code = error instanceof Error && /^[A-Z][A-Z_]{2,100}$/.test(error.message) ? error.message : "MIGRATION_FAILED";
  console.error(code); process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) migrationCli().catch(reportCliError);
