import mongoose, { mongo } from "mongoose";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { COLLECTIONS as C, createProjectManagerRoleInventory, type Row } from "../src/migrations/project-manager-role-inventory.js";
import { createAssignmentSyncInventory, readAssignmentSyncState, SYNC_RECEIPTS, syncManifestDigest, type AssignmentSyncManifest } from "../src/migrations/project-manager-assignment-sync-inventory.js";
import { applyAssignmentSync, type AssignmentSyncInput } from "../src/migrations/project-manager-assignment-sync.js";
import { rollbackAssignmentSync } from "../src/migrations/project-manager-assignment-sync-rollback.js";
import { resolveProjectManagerAssignment } from "../src/services/project-manager-assignment.service.js";
import { createProjectManagerWorkspace } from "../src/services/project-manager/workspace.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuthService, type PublicUser } from "../src/services/auth.service.js";
import type { AppRepository, UserRecord } from "../src/repositories/types.js";
import { assignmentSyncFixture, syncActorId, syncAt, syncOtherId, syncOwnerId, syncProjectIds } from "./helpers/project-manager-assignment-sync.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const db = () => mongoose.connection.db!;
const collection = (name: string) => db().collection<Row & { _id: string }>(name);
const scope = () => assignmentSyncFixture().scope;
const inventory = () => createAssignmentSyncInventory({ db: db(), targetId: "disposable-assignment-sync", scope: scope(), now: syncAt });
async function input(manifest?: AssignmentSyncManifest): Promise<AssignmentSyncInput> {
  return { client: mongoose.connection.getClient(), db: db(), targetId: "disposable-assignment-sync", manifest: manifest ?? await inventory(),
    actorId: syncActorId, runId: "assignment-sync-rehearsal", backupRef: "verified-disposable-fixture-backup" };
}
async function state() { return (await readAssignmentSyncState(db())).snapshot; }
async function protectedRows() {
  const names = [C.tasks, C.estimates, C.states, C.reviews, C.awards, C.proposals, "syncSignedQualityHistory", "syncFinancialHistory"];
  return Promise.all(names.map(async name => [name, await collection(name).find({}).sort({ _id: 1 }).toArray()]));
}
async function seed() {
  for (const [name, rows] of assignmentSyncFixture().state.rows) if (rows.length) await collection(name).insertMany(rows as (Row & { _id: string })[]);
}

beforeAll(async () => {
  replica = await startMongoReplicaSet("pm_assignment_sync_isolated");
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
}, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => { await replica.clear(); await seed(); });

describe("scoped Project Manager assignment mapping replica rehearsal", () => {
  it("dry run sends only read commands and preserves all collections and document fingerprints", async () => {
    const client = new mongo.MongoClient(replica.uri, { monitorCommands: true });
    await client.connect();
    const commands: string[] = []; client.on("commandStarted", event => commands.push(event.commandName));
    const before = await state(); const names = (await db().listCollections({}, { nameOnly: true }).toArray()).map(row => row.name).sort();
    try {
      const manifest = await createAssignmentSyncInventory({ db: client.db(db().databaseName), targetId: "disposable-assignment-sync", scope: scope(), now: syncAt });
      expect(manifest).toMatchObject({ conflicts: [], summary: { selected: 5, toMap: 5, outsideProjects: 7, preservedOrphans: 4 } });
      expect(commands.every(command => ["hello", "listCollections", "find", "getMore", "killCursors"].includes(command))).toBe(true);
      expect(await state()).toEqual(before);
      expect((await db().listCollections({}, { nameOnly: true }).toArray()).map(row => row.name).sort()).toEqual(names);
      expect(await collection(SYNC_RECEIPTS).countDocuments({})).toBe(0);
    } finally { await client.close(); }
  });

  it("maps all five projects exactly once to the existing manager and preserves tasks, outside projects and immutable history", async () => {
    const options = await input(); const history = await protectedRows();
    const outside = await collection(C.projects).find({ _id: { $nin: syncProjectIds } }).sort({ _id: 1 }).toArray();
    expect((await resolveProjectManagerAssignment(syncProjectIds[0]!)).reason).toBe("ASSIGNMENT_SYNC_REQUIRED");
    expect(await applyAssignmentSync({ ...options, manifest: JSON.parse(JSON.stringify(options.manifest)) })).toMatchObject({ status: "applied", mapped: 5 });
    for (const projectId of syncProjectIds) expect(await resolveProjectManagerAssignment(projectId)).toMatchObject({ state: "assigned", ownerId: syncOwnerId, needsSynchronization: false });
    expect(await collection(C.users).findOne({ _id: syncOwnerId })).toMatchObject({ role: "site_manager", version: 4, sessionVersion: 8, passwordHash: "synthetic-private-hash" });
    expect(await protectedRows()).toEqual(history);
    expect(await collection(C.projects).find({ _id: { $nin: syncProjectIds } }).sort({ _id: 1 }).toArray()).toEqual(outside);
    expect(await collection(C.projects).countDocuments({ programManagerId: syncOwnerId })).toBe(5);
    expect(await collection(C.events).countDocuments({ kind: "project_manager_assignment" })).toBe(5);
    const beforeRetry = await state(); const receiptCount = await collection(SYNC_RECEIPTS).countDocuments({});
    await applyAssignmentSync(options);
    expect(await state()).toEqual(beforeRetry);
    expect(await collection(SYNC_RECEIPTS).countDocuments({})).toBe(receiptCount);
  });

  it("returns the five actual default portfolio cards only to their owner after synchronization", async () => {
    const owner: PublicUser = { id: syncOwnerId, name: "Fixture manager", email: "manager@example.test", role: "site_manager" };
    const other: PublicUser = { ...owner, id: syncOtherId, email: "other@example.test" };
    const service = createProjectManagerWorkspace({ audit: createAuditService(createMemoryRepository()), panels: {}, now: () => syncAt });
    expect((await service.portfolio(owner)).items).toEqual([]);
    const options = await input(); await applyAssignmentSync(options);
    const portfolio = await service.portfolio(owner);
    expect(portfolio.counts.active).toBe(5); expect(portfolio.total).toBe(5);
    expect(portfolio.items.map(project => project.id).sort()).toEqual(syncProjectIds);
    expect(new Set(portfolio.items.map(project => project.id)).size).toBe(5);
    expect((await service.portfolio(other)).total).toBe(0);
    await expect(service.overview(other, syncProjectIds[0]!)).rejects.toMatchObject({ status: 404 });
  });

  it("invalidates old manager sessions while preserving identity and accepting the new session version", async () => {
    const secret = "assignment-sync-disposable-auth-secret-at-least-32-characters";
    const repository = { async findUserById(id: string) {
      const user = await collection(C.users).findOne({ _id: id });
      return user ? { ...user, id: user._id } as UserRecord : undefined;
    } } as unknown as AppRepository;
    const auth = createAuthService(repository, { jwtSecret: secret, jwtExpiresInSeconds: 900 });
    const token = (version: number) => jwt.sign({ id: syncOwnerId, role: "site_manager", sessionVersion: version }, secret, { expiresIn: 900 });
    const old = token(7); const context = { remoteAddress: "127.0.0.1" };
    expect(await auth.authenticate(old, context)).toMatchObject({ id: syncOwnerId, role: "site_manager" });
    await applyAssignmentSync(await input());
    await expect(auth.authenticate(old, context)).rejects.toMatchObject({ name: "InvalidTokenError" });
    expect(await auth.authenticate(token(8), context)).toMatchObject({ id: syncOwnerId, role: "site_manager" });
  });

  it("a fresh already-synchronized scope is a no-op without another session increment or audit", async () => {
    await applyAssignmentSync(await input());
    const options = await input(); options.runId = "fresh-already-mapped";
    expect(options.manifest.changes).toEqual([]);
    const before = await state();
    expect(await applyAssignmentSync(options)).toMatchObject({ status: "no_op", mapped: 0 });
    expect(await state()).toEqual(before);
  });

  it("serializes concurrent retries of the same run with one session increment and one set of audits", async () => {
    const options = await input();
    const results = await Promise.all([applyAssignmentSync(options), applyAssignmentSync(options)]);
    expect(results.every(result => result.status === "applied" && result.mapped === 5)).toBe(true);
    expect(await collection(C.users).findOne({ _id: syncOwnerId })).toMatchObject({ version: 4, sessionVersion: 8 });
    expect(await collection(C.audits).countDocuments({ action: "project_manager_assignment_sync_applied" })).toBe(6);
    expect(await collection(C.events).countDocuments({ kind: "project_manager_assignment" })).toBe(5);
    expect(await collection(SYNC_RECEIPTS).countDocuments({})).toBe(1);
  });

  it("rejects a newly introduced empty collection after inventory rather than ignoring topology drift", async () => {
    const options = await input();
    await db().createCollection("syncEmptyCollectionAfterInventory");
    const before = await state();
    await expect(applyAssignmentSync(options)).rejects.toThrow();
    expect(await state()).toEqual(before);
    expect(await collection(SYNC_RECEIPTS).countDocuments({})).toBe(0);
  });

  it.each(["changes", "outside-write", "scope", "snapshot"])("rejects rehashed manifest tampering of %s without a business write", async kind => {
    const options = await input(); const manifest = structuredClone(options.manifest);
    if (kind === "changes") manifest.changes.pop();
    if (kind === "outside-write") manifest.changes[0]!.id = "sync-project-6";
    if (kind === "scope") manifest.scope.projectIds.pop();
    if (kind === "snapshot") manifest.snapshot.pop();
    manifest.digest = syncManifestDigest(manifest);
    const before = await state();
    await expect(applyAssignmentSync({ ...options, manifest })).rejects.toThrow();
    expect(await state()).toEqual(before); expect(await collection(SYNC_RECEIPTS).countDocuments({})).toBe(0);
  });

  it("rejects full-role migration manifests and wrong target/operator/run/backup identities", async () => {
    const options = await input(); const before = await state();
    const fullRole = await createProjectManagerRoleInventory({ db: db(), targetId: options.targetId, now: syncAt });
    await expect(applyAssignmentSync({ ...options, manifest: fullRole as unknown as AssignmentSyncManifest })).rejects.toThrow();
    for (const patch of [{ targetId: "wrong-target" }, { actorId: syncOtherId }, { runId: "" }, { backupRef: "" }]) {
      await expect(applyAssignmentSync({ ...options, ...patch })).rejects.toThrow();
    }
    expect(await state()).toEqual(before); expect(await collection(SYNC_RECEIPTS).countDocuments({})).toBe(0);
    await applyAssignmentSync(options);
    await expect(applyAssignmentSync({ ...options, backupRef: "different-backup" })).rejects.toThrow();
    await expect(rollbackAssignmentSync({ ...options, runId: "unknown-run" })).rejects.toThrow();
  });

  it("rolls back every selected update, session bump, event and receipt after an injected mutation failure", async () => {
    const options = await input(); const before = await state(); let writes = 0;
    await expect(applyAssignmentSync({ ...options, testHooks: { afterMutation: async () => { if (++writes === 3) throw new Error("FIXTURE_ABORT"); } } })).rejects.toThrow("FIXTURE_ABORT");
    expect(writes).toBe(3); expect(await state()).toEqual(before);
    expect(await collection(SYNC_RECEIPTS).countDocuments({})).toBe(0);
    expect(await collection(C.users).findOne({ _id: syncOwnerId })).toMatchObject({ version: 3, sessionVersion: 7 });
  });

  it("detects a concurrent owner-version writer during the transaction without overwriting it", async () => {
    const options = await input(); let changed = false;
    await expect(applyAssignmentSync({ ...options, testHooks: { afterMutation: async change => {
      if (!changed && change.collection === C.projects) {
        changed = true;
        await collection(C.users).updateOne({ _id: syncOwnerId }, { $inc: { version: 1, sessionVersion: 1 } });
      }
    } } })).rejects.toThrow();
    expect(changed).toBe(true);
    expect(await collection(C.users).findOne({ _id: syncOwnerId })).toMatchObject({ version: 4, sessionVersion: 8 });
    expect(await collection(C.projects).countDocuments({ programManagerId: syncOwnerId })).toBe(0);
    expect(await collection(SYNC_RECEIPTS).countDocuments({})).toBe(0);
  });

  it.each(["assignment", "source", "orphan", "outside"])("detects %s changes after preflight and before the transaction", async kind => {
    const options = await input(); let changed = false;
    await expect(applyAssignmentSync({ ...options, testHooks: { beforeTransaction: async () => {
      changed = true;
      if (kind === "assignment") await collection(C.projects).updateOne({ _id: syncProjectIds[0] }, { $set: { programManagerId: syncOtherId }, $inc: { procurementIdentityVersion: 1 } });
      if (kind === "source") await collection(C.estimates).updateOne({ _id: "sync-estimate-1" }, { $set: { designPlanVersion: 2 } });
      if (kind === "orphan") await collection(C.tasks).updateOne({ _id: "sync-orphan-1" }, { $inc: { version: 1 } });
      if (kind === "outside") await collection(C.projects).updateOne({ _id: "sync-project-6" }, { $set: { status: "on_hold" } });
    } } })).rejects.toThrow();
    expect(changed).toBe(true); expect(await collection(C.projects).countDocuments({ programManagerId: syncOwnerId })).toBe(0);
    expect(await collection(C.users).findOne({ _id: syncOwnerId })).toMatchObject({ sessionVersion: 7 });
    expect(await collection(SYNC_RECEIPTS).countDocuments({})).toBe(0);
  });

  it("restores missing versus null mappings, advances session/fence versions, and preserves both audit histories", async () => {
    const options = await input(); const history = await protectedRows();
    await applyAssignmentSync(options); const appliedAudits = await collection(C.audits).find({}).toArray();
    expect(await rollbackAssignmentSync(options)).toMatchObject({ status: "rolled_back", mapped: 5 });
    const first = await collection(C.projects).findOne({ _id: syncProjectIds[0] });
    expect(first).not.toHaveProperty("programManagerId"); expect(first).toMatchObject({ procurementIdentityVersion: 3, purchaseOrderApprovalEpoch: 4, siteCompletionFenceEpoch: 5 });
    expect(await collection(C.projects).findOne({ _id: syncProjectIds[1] })).toMatchObject({ programManagerId: null });
    expect(await collection(C.users).findOne({ _id: syncOwnerId })).toMatchObject({ role: "site_manager", version: 5, sessionVersion: 9 });
    expect(await protectedRows()).toEqual(history);
    for (const audit of appliedAudits) expect(await collection(C.audits).findOne({ _id: audit._id })).toEqual(audit);
    expect(await collection(C.audits).countDocuments({})).toBe(appliedAudits.length * 2);
    const after = await state(); await rollbackAssignmentSync(options); expect(await state()).toEqual(after);
    await expect(applyAssignmentSync(options)).rejects.toThrow();
  });

  it("rolls back the rollback transaction itself when a mutation fails", async () => {
    const options = await input(); await applyAssignmentSync(options);
    const before = await state(); let writes = 0;
    await expect(rollbackAssignmentSync({ ...options, testHooks: { afterMutation: async () => {
      if (++writes === 2) throw new Error("ROLLBACK_FIXTURE_ABORT");
    } } })).rejects.toThrow("ROLLBACK_FIXTURE_ABORT");
    expect(writes).toBe(2); expect(await state()).toEqual(before);
    expect(await collection(C.projects).countDocuments({ programManagerId: syncOwnerId })).toBe(5);
    expect(await collection(C.users).findOne({ _id: syncOwnerId })).toMatchObject({ sessionVersion: 8 });
    expect(await rollbackAssignmentSync(options)).toMatchObject({ status: "rolled_back", mapped: 5 });
  });

  it.each(["empty", "populated"])("refuses rollback when a %s collection appears after preflight without changing mappings or receipts", async kind => {
    const options = await input(); await applyAssignmentSync(options);
    const ownerBefore = await collection(C.users).findOne({ _id: syncOwnerId });
    const projectsBefore = await collection(C.projects).find({ _id: { $in: syncProjectIds } }).sort({ _id: 1 }).toArray();
    const receiptsBefore = await collection(SYNC_RECEIPTS).find({}).toArray();
    const coordinationBefore = await collection(C.coordination).find({}).toArray();
    let snapshotAfterHook: Awaited<ReturnType<typeof state>> | undefined;
    await expect(rollbackAssignmentSync({ ...options, testHooks: { beforeTransaction: async () => {
      const name = `syncRollbackHook_${kind}`;
      await db().createCollection(name);
      if (kind === "populated") await collection(name).insertOne({ _id: "later-business-record", projectId: syncProjectIds[0] });
      snapshotAfterHook = await state();
    } } })).rejects.toThrow("SYNC_LATER_BUSINESS_ACTIVITY");
    expect(snapshotAfterHook).toBeDefined();
    expect(await state()).toEqual(snapshotAfterHook);
    expect(await collection(C.projects).find({ _id: { $in: syncProjectIds } }).sort({ _id: 1 }).toArray()).toEqual(projectsBefore);
    expect(await collection(C.users).findOne({ _id: syncOwnerId })).toEqual(ownerBefore);
    expect(await collection(SYNC_RECEIPTS).find({}).toArray()).toEqual(receiptsBefore);
    expect(await collection(C.coordination).find({}).toArray()).toEqual(coordinationBefore);
  });

  it.each(["task", "history", "new-collection"])("refuses rollback over later %s activity", async kind => {
    const options = await input(); await applyAssignmentSync(options);
    if (kind === "task") await collection(C.tasks).updateOne({ _id: "sync-task-1" }, { $set: { status: "in_progress" }, $inc: { version: 1 } });
    if (kind === "history") await collection("syncFinancialHistory").updateOne({ _id: "finance-history" }, { $inc: { approvedNetPaise: 1 } });
    if (kind === "new-collection") await collection("syncLaterActivity").insertOne({ _id: "later", projectId: syncProjectIds[0] });
    const before = await state(); await expect(rollbackAssignmentSync(options)).rejects.toThrow(); expect(await state()).toEqual(before);
  });
});
