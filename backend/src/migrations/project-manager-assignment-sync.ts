import { chmod, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";
import { z } from "zod";
import { COLLECTIONS as C, assertIdentifier, deserialize, digest, fingerprint, fingerprintKey, identifyTarget,
  sortSnapshot, type Change, type Fingerprint, type NativeDb, type NativeSession, type Row } from "./project-manager-role-inventory.js";
import { assertMigrationActor, authorizationFence, reportCliError } from "./project-manager-role-migration.js";
import { SYNC_RECEIPTS, SYNC_VERSION, buildAssignmentSyncManifest, createAssignmentSyncInventory,
  normalizeSyncScope, readAssignmentSyncState, syncCollectionNames, syncManifestDigest,
  type AssignmentSyncManifest } from "./project-manager-assignment-sync-inventory.js";

export interface AssignmentSyncInput {
  client: mongo.MongoClient; db: NativeDb; targetId: string; manifest: AssignmentSyncManifest;
  actorId: string; runId: string; backupRef: string;
  /** Disposable fixture hooks only; deliberately unavailable through the CLI. */
  testHooks?: { beforeTransaction?: () => Promise<void>; afterMutation?: (change: Change) => Promise<void> };
}
export interface SyncReceipt extends Row {
  _id: string; kind: "assignment_sync_run"; schemaVersion: 1; applicationVersion: typeof SYNC_VERSION;
  runId: string; actorId: string; backupRef: string; manifest: AssignmentSyncManifest;
  status: "applied" | "rolled_back";
  applied: { post: Fingerprint[]; events: Fingerprint[] };
  rollback?: { changes: Change[]; post: Fingerprint[]; events: Fingerprint[] };
  digest: string;
}
export const syncReceiptId = (runId: string) => `assignment-sync:${runId}`;
export function syncReceiptDigest(receipt: SyncReceipt): string {
  const { digest: ignored, ...body } = receipt;
  return digest(body);
}
const targetSchema = z.object({ id: z.string().min(1), database: z.string().min(1), clusterDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const projectKeys = ["programManagerId", "procurementIdentityVersion", "purchaseOrderApprovalEpoch", "siteCompletionFenceEpoch", "updatedAt"].sort();
const userKeys = ["version", "sessionVersion", "updatedAt"].sort();
export function validateSyncInput(input: AssignmentSyncInput): void {
  for (const [value, code] of [[input.runId, "RUN_ID_REQUIRED"], [input.backupRef, "BACKUP_REFERENCE_REQUIRED"],
    [input.actorId, "ACTOR_REQUIRED"], [input.targetId, "EXPLICIT_TARGET_REQUIRED"]]) assertIdentifier(value, code);
  const manifest = input.manifest;
  if (!manifest || manifest.schemaVersion !== 1 || manifest.applicationVersion !== SYNC_VERSION) throw new Error("SYNC_MANIFEST_VERSION_MISMATCH");
  if (!targetSchema.safeParse(manifest.target).success || manifest.target.id !== input.targetId) throw new Error("TARGET_MISMATCH");
  const scope = normalizeSyncScope(manifest.scope);
  if (digest(scope) !== digest(manifest.scope) || !Number.isFinite(new Date(manifest.inventoryAt).getTime()) ||
    !Array.isArray(manifest.conflicts) || !Array.isArray(manifest.changes) || !Array.isArray(manifest.snapshot) ||
    !Array.isArray(manifest.preservedOrphans) || !Array.isArray(manifest.collectionNames) ||
    !manifest.summary || Object.keys(manifest).sort().join() !== ["schemaVersion", "applicationVersion", "target", "inventoryAt", "scope", "conflicts", "changes", "preservedOrphans", "snapshot", "collectionNames", "summary", "digest"].sort().join()) throw new Error("INVALID_SYNC_MANIFEST");
  if (manifest.conflicts.length) throw new Error("UNRESOLVED_SYNC_CONFLICTS");
  if (Buffer.byteLength(JSON.stringify(manifest)) > 4_000_000) throw new Error("SYNC_MANIFEST_TOO_LARGE");
  if (manifest.digest !== syncManifestDigest(manifest)) throw new Error("SYNC_MANIFEST_DIGEST_MISMATCH");
  const records = new Set<string>();
  for (const change of manifest.changes) {
    const allowedKeys = change.collection === C.projects && scope.projectIds.includes(change.id) ? projectKeys :
      change.collection === C.users && change.id === scope.ownerId ? userKeys : null;
    const key = `${change.collection}/${change.id}`;
    if (!allowedKeys || records.has(key) || !change.before || !change.after ||
      Object.keys(change.before).sort().join() !== allowedKeys.join() || Object.keys(change.after).sort().join() !== allowedKeys.join()) throw new Error("SYNC_CHANGE_OUTSIDE_SCOPE");
    records.add(key);
  }
}
export async function verifySyncTarget(input: AssignmentSyncInput): Promise<void> {
  if (digest(await identifyTarget(input.db, input.targetId)) !== digest(input.manifest.target)) throw new Error("TARGET_MISMATCH");
}
export function verifySyncReceipt(input: AssignmentSyncInput, receipt: SyncReceipt): void {
  if (receipt._id !== syncReceiptId(input.runId) || receipt.kind !== "assignment_sync_run" || receipt.schemaVersion !== 1 || receipt.applicationVersion !== SYNC_VERSION ||
    receipt.runId !== input.runId || receipt.actorId !== input.actorId || receipt.backupRef !== input.backupRef ||
    receipt.manifest.digest !== input.manifest.digest || syncManifestDigest(receipt.manifest) !== input.manifest.digest ||
    receipt.digest !== syncReceiptDigest(receipt) || !["applied", "rolled_back"].includes(receipt.status) ||
    !Array.isArray(receipt.applied?.post) || !Array.isArray(receipt.applied?.events) ||
    (receipt.status === "rolled_back") !== Boolean(receipt.rollback)) throw new Error("SYNC_RECEIPT_INTEGRITY_FAILURE");
}
export function syncExpectedState(receipt: SyncReceipt): { snapshot: Fingerprint[]; names: string[] } {
  const expected = new Map(receipt.manifest.snapshot.map(entry => [fingerprintKey(entry), entry]));
  const changes = [...receipt.applied.post, ...receipt.applied.events, ...(receipt.rollback?.post ?? []), ...(receipt.rollback?.events ?? [])];
  for (const entry of changes) expected.set(fingerprintKey(entry), entry);
  return { snapshot: sortSnapshot([...expected.values()]), names: [...new Set([...receipt.manifest.collectionNames, ...changes.map(entry => entry.collection)])].sort() };
}
export async function verifySyncPostState(input: AssignmentSyncInput, receipt: SyncReceipt, session?: NativeSession, names?: string[]): Promise<void> {
  const expected = syncExpectedState(receipt), actualNames = names ?? await syncCollectionNames(input.db);
  if (digest(actualNames) !== digest(expected.names) || digest((await readAssignmentSyncState(input.db, session, actualNames)).snapshot) !== digest(expected.snapshot)) throw new Error("SYNC_LATER_BUSINESS_ACTIVITY");
}
export async function writeSyncChange(input: AssignmentSyncInput, change: Change, session: NativeSession): Promise<Fingerprint> {
  const collection = input.db.collection<Row & { _id: string }>(change.collection);
  const before = await collection.findOne({ _id: change.id }, { session });
  if (!before || digest(before) !== change.beforeDigest) throw new Error("SYNC_CHANGE_CAS_FAILED");
  const filter: Row = { _id: change.id }, set: Row = {}, unset: Row = {};
  for (const [key, field] of Object.entries(change.before)) filter[key] = field.present ? { $eq: deserialize(field.value) } : { $exists: false };
  for (const [key, field] of Object.entries(change.after)) {
    if (field.present) set[key] = deserialize(field.value); else unset[key] = "";
  }
  const result = await collection.updateOne(filter, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { session });
  if (result.matchedCount !== 1) throw new Error("SYNC_CHANGE_CAS_FAILED");
  const post = await collection.findOne({ _id: change.id }, { session });
  const intended = { ...before, ...set }; for (const key of Object.keys(unset)) delete intended[key];
  if (!post || digest(post) !== digest(intended)) throw new Error("SYNC_UNEXPECTED_POST_STATE");
  await input.testHooks?.afterMutation?.(change);
  return fingerprint(change.collection, post);
}
export async function writeSyncEvents(input: AssignmentSyncInput, changes: Change[], kind: "apply" | "rollback", session: NativeSession): Promise<Fingerprint[]> {
  const result: Fingerprint[] = [];
  for (const change of changes) {
    const id = `pm-assignment-sync:${digest({ runId: input.runId, kind, collection: change.collection, id: change.id })}`, occurredAt = new Date();
    const audit = { _id: id, actorId: input.actorId,
      action: kind === "apply" ? "project_manager_assignment_sync_applied" : "project_manager_assignment_sync_rolled_back",
      entityType: change.collection === C.users ? "user" : "project", entityId: change.id, occurredAt, createdAt: occurredAt,
      oldValues: change.before, newValues: change.after, reason: `Scoped Project Manager assignment synchronization ${input.runId}` };
    await input.db.collection<Row & { _id: string }>(C.audits).insertOne(audit, { session }); result.push(fingerprint(C.audits, audit));
    if (change.collection === C.projects) {
      const event = { _id: id, projectId: change.id, vendorId: null, assignmentId: null,
        version: deserialize(change.after.procurementIdentityVersion!.value), kind: "project_manager_assignment", occurredAt };
      await input.db.collection<Row & { _id: string }>(C.events).insertOne(event, { session }); result.push(fingerprint(C.events, event));
    }
  }
  return result;
}
async function verifyFreshManifest(input: AssignmentSyncInput, session?: NativeSession, names?: string[]): Promise<void> {
  const state = await readAssignmentSyncState(input.db, session, names);
  const fresh = buildAssignmentSyncManifest({ state, target: input.manifest.target, scope: input.manifest.scope, now: new Date(input.manifest.inventoryAt) });
  if (fresh.digest !== input.manifest.digest || fresh.conflicts.length) throw new Error("STALE_OR_INVALID_SYNC_MANIFEST");
}
/** One transaction contains the entire selected mapping, session invalidation, audit and receipt. */
export async function applyAssignmentSync(input: AssignmentSyncInput): Promise<{ runId: string; status: "applied" | "no_op"; mapped: number }> {
  validateSyncInput(input); await verifySyncTarget(input);
  const receipts = input.db.collection<SyncReceipt>(SYNC_RECEIPTS);
  const prior = await receipts.findOne({ _id: syncReceiptId(input.runId) });
  if (prior) {
    verifySyncReceipt(input, prior);
    if (prior.status === "rolled_back") throw new Error("SYNC_RUN_ALREADY_ROLLED_BACK");
    await verifySyncPostState(input, prior);
  } else await verifyFreshManifest(input);
  await input.testHooks?.beforeTransaction?.();
  const session = input.client.startSession();
  let mapped = input.manifest.summary.toMap, noOp = false;
  try {
    const names = await syncCollectionNames(input.db);
    await session.withTransaction(async () => {
      await assertMigrationActor(input.db, input.actorId, session);
      const existing = await receipts.findOne({ _id: syncReceiptId(input.runId) }, { session });
      if (existing) {
        verifySyncReceipt(input, existing);
        if (existing.status === "rolled_back") throw new Error("SYNC_RUN_ALREADY_ROLLED_BACK");
        await verifySyncPostState(input, existing, session, await syncCollectionNames(input.db)); return;
      }
      if (input.manifest.changes.length === 0) {
        await verifyFreshManifest(input, session, names); noOp = true; mapped = 0; return;
      }
      await authorizationFence(input.db, session);
      await verifyFreshManifest(input, session, names);
      // Recheck operator after acquiring the coordination fence in case a retried
      // transaction observed a changed authorization state.
      await assertMigrationActor(input.db, input.actorId, session);
      const post: Fingerprint[] = [];
      for (const change of input.manifest.changes) post.push(await writeSyncChange(input, change, session));
      const events = await writeSyncEvents(input, input.manifest.changes, "apply", session);
      const receipt: SyncReceipt = { _id: syncReceiptId(input.runId), kind: "assignment_sync_run", schemaVersion: 1, applicationVersion: SYNC_VERSION,
        runId: input.runId, actorId: input.actorId, backupRef: input.backupRef, manifest: input.manifest,
        status: "applied", applied: { post, events }, digest: "" };
      receipt.digest = syncReceiptDigest(receipt);
      await receipts.insertOne(receipt, { session });
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    if (!noOp) {
      const completed = await receipts.findOne({ _id: syncReceiptId(input.runId) });
      if (!completed) throw new Error("SYNC_RECEIPT_MISSING");
      verifySyncReceipt(input, completed); await verifySyncPostState(input, completed);
    }
    return { runId: input.runId, status: noOp ? "no_op" : "applied", mapped };
  } finally { await session.endSession(); }
}

export function parseSyncArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {}, allowed = new Set(["mode", "database", "target", "scope", "manifest", "run-id", "backup-ref", "actor-id"]);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, ""), value = args[index + 1];
    if (!args[index]?.startsWith("--") || !key || !allowed.has(key) || !value || value.startsWith("--") || Object.hasOwn(result, key)) throw new Error("INVALID_CLI_ARGUMENTS");
    result[key] = value;
  }
  for (const key of ["database", "target", "manifest"]) assertIdentifier(result[key], `EXPLICIT_${key.toUpperCase()}_REQUIRED`);
  return result;
}
export async function assignmentSyncCli(args = process.argv.slice(2)): Promise<void> {
  const options = parseSyncArgs(args), mode = options.mode ?? "dry-run";
  if (!["dry-run", "apply"].includes(mode)) throw new Error("INVALID_MODE");
  if (mode === "dry-run") assertIdentifier(options.scope, "EXPLICIT_SCOPE_REQUIRED");
  else if (options.scope) throw new Error("APPLY_SCOPE_BOUND_BY_MANIFEST");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI_REQUIRED");
  const client = new mongo.MongoClient(uri);
  try {
    await client.connect(); const db = client.db(options.database);
    if (mode === "dry-run") {
      const scope = JSON.parse(await readFile(options.scope!, "utf8"));
      const manifest = await createAssignmentSyncInventory({ db, targetId: options.target!, scope });
      await writeFile(options.manifest!, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 }); await chmod(options.manifest!, 0o600);
      console.log(JSON.stringify({ mode, digest: manifest.digest, summary: manifest.summary, conflicts: manifest.conflicts }));
      if (manifest.conflicts.length) process.exitCode = 2;
    } else {
      const manifest = JSON.parse(await readFile(options.manifest!, "utf8")) as AssignmentSyncManifest;
      console.log(JSON.stringify(await applyAssignmentSync({ client, db, targetId: options.target!, manifest,
        runId: options["run-id"]!, backupRef: options["backup-ref"]!, actorId: options["actor-id"]! })));
    }
  } finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) assignmentSyncCli().catch(reportCliError);
