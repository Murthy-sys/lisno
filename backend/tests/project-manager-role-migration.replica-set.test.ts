import mongoose, { mongo } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { COLLECTIONS as C, RECEIPTS, createProjectManagerRoleInventory, digest, manifestDigest, readInventoryState,
  type Manifest, type Row } from "../src/migrations/project-manager-role-inventory.js";
import { applyProjectManagerRoleMigration, authorizationFence, runReceiptId, type MigrationInput } from "../src/migrations/project-manager-role-migration.js";
import { rollbackProjectManagerRoleMigration } from "../src/migrations/project-manager-role-rollback.js";

const at = new Date("2026-10-27T10:00:00Z");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const db = () => mongoose.connection.db!;
const collection = (name: string) => db().collection<Row & { _id: string }>(name);
async function inventory() { return createProjectManagerRoleInventory({ db: db(), targetId: "disposable-migration-test", now: at }); }
async function input(manifest?: Manifest): Promise<MigrationInput> {
  return { client: mongoose.connection.getClient(), db: db(), targetId: "disposable-migration-test", manifest: manifest ?? await inventory(),
    actorId: "admin", runId: "fixture-run", backupRef: "fixture-backup-verified" };
}
async function protectedHistory() {
  return Promise.all([C.estimates, C.reviews, C.proposals, "signedQualityAudits", "issuedRevisions"].map(async name =>
    [name, await collection(name).find({}).sort({ _id: 1 }).toArray()]));
}
async function seed() {
  await collection(C.users).insertMany([
    { _id: "admin", role: "super_admin", active: true, version: 1, sessionVersion: 1 },
    { _id: "legacy", role: "program_manager", active: true, version: 5, sessionVersion: 7, email: "private@example.test", passwordHash: "private-hash" },
    { _id: "site", role: "site_manager", active: true, version: 2, sessionVersion: 3, passwordHash: "site-private-hash" },
    { _id: "inactive", role: "program_manager", active: false, version: 4, sessionVersion: 8 }
  ]);
  await collection(C.projects).insertMany([
    { _id: "p1", programManagerId: "legacy", procurementIdentityVersion: 3, purchaseOrderApprovalEpoch: 2, siteCompletionFenceEpoch: 5, status: "active" },
    { _id: "p2", programManagerId: "legacy", procurementIdentityVersion: 1, status: "planning" },
    { _id: "p3", programManagerId: null, procurementIdentityVersion: 2, status: "active" }
  ]);
  await collection(C.tasks).insertMany([
    { _id: "t1", projectId: "p1", estimateId: "e1", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: null,
      version: 3, awardApprovalEpoch: 2, designPlanVersion: 2, preparationOnly: false, status: "open", dueAt: at, originalDeadline: at },
    { _id: "t3", projectId: "p3", estimateId: "e3", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: "site",
      version: 4, awardApprovalEpoch: 3, designPlanVersion: 1, preparationOnly: false, status: "open", dueAt: at },
    { _id: "historical-task", projectId: "p1", estimateId: "old-source", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: "historical-owner",
      version: 8, designPlanVersion: 1, status: "completed", supersededAt: at, completedAt: at }
  ]);
  await collection(C.estimates).insertMany([
    { _id: "e1", projectId: "p1", status: "client_approved", designPlanStatus: "approved", designPlanVersion: 2, immutableApproval: { actorId: "client", signature: "program_manager" } },
    { _id: "e3", projectId: "p3", status: "client_approved", designPlanStatus: "approved", designPlanVersion: 1 }
  ]);
  await collection(C.reviews).insertOne({ _id: "historic-review", projectId: "p1", round: 1, status: "approved", managerId: "historic-manager", decision: { actorId: "client", decidedAt: at } });
  await collection(C.proposals).insertOne({ _id: "issued-proposal", awardId: "issued-award", projectId: "p1", programManagerId: "historic-manager", requiredSlots: ["program_manager"], signature: "do-not-rewrite" });
  await collection("signedQualityAudits").insertOne({ _id: "audit-history", projectId: "p1", signedById: "historic-manager", signedAt: at });
  await collection("issuedRevisions").insertOne({ _id: "issued", projectId: "p1", totalPaise: 1973299, actorId: "historic-manager", slot: "program_manager" });
}
beforeAll(async () => { replica = await startMongoReplicaSet("pm-role-migration-isolated"); }, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => { await replica.clear(); await seed(); });

describe("Project Manager role migration replica-set rehearsal", () => {
  it("dry run emits only native read commands with zero database/DDL changes", async () => {
    const client = new mongo.MongoClient(replica.uri, { monitorCommands: true });
    await client.connect();
    const commands: string[] = [];
    client.on("commandStarted", event => commands.push(event.commandName));
    const before = await readInventoryState(db());
    const namesBefore = (await db().listCollections({}, { nameOnly: true }).toArray()).map(row => row.name).sort();
    try {
      const manifest = await createProjectManagerRoleInventory({ db: client.db(db().databaseName), targetId: "disposable", now: at });
      expect(manifest.conflicts).toEqual([]);
      expect(commands.every(command => ["hello", "listCollections", "find", "getMore", "killCursors"].includes(command))).toBe(true);
      expect((await readInventoryState(db())).snapshot).toEqual(before.snapshot);
      expect((await db().listCollections({}, { nameOnly: true }).toArray()).map(row => row.name).sort()).toEqual(namesBefore);
      expect(JSON.stringify(manifest)).not.toMatch(/private-hash|private@example|site-private/);
    } finally { await client.close(); }
  });
  it("converts IDs, synchronizes both assignments, increments sessions, audits and preserves all immutable history", async () => {
    const options = await input(); options.manifest = JSON.parse(JSON.stringify(options.manifest));
    const history = await protectedHistory();
    const taskOnly = await collection(C.tasks).findOne({ _id: "t3" });
    const historicTask = await collection(C.tasks).findOne({ _id: "historical-task" });
    expect(options.manifest.cohorts).toHaveLength(3);
    expect(options.manifest.cohorts.find(cohort => cohort.userIds.includes("legacy"))?.projectIds).toEqual(["p1", "p2"]);
    expect(await applyProjectManagerRoleMigration(options)).toMatchObject({ status: "applied", cohorts: 3 });
    expect(await collection(C.users).findOne({ _id: "legacy" })).toMatchObject({ role: "site_manager", active: true, version: 6, sessionVersion: 8, passwordHash: "private-hash" });
    expect(await collection(C.users).findOne({ _id: "inactive" })).toMatchObject({ role: "site_manager", active: false, version: 5, sessionVersion: 9 });
    expect(await collection(C.projects).findOne({ _id: "p1" })).toMatchObject({ programManagerId: "legacy", procurementIdentityVersion: 4, purchaseOrderApprovalEpoch: 3, siteCompletionFenceEpoch: 6 });
    expect(await collection(C.projects).findOne({ _id: "p3" })).toMatchObject({ programManagerId: "site", procurementIdentityVersion: 3 });
    expect(await collection(C.tasks).findOne({ _id: "t1" })).toMatchObject({ assigneeUserId: "legacy", version: 4, awardApprovalEpoch: 3, originalDeadline: at });
    expect(await collection(C.tasks).findOne({ _id: "t3" })).toEqual(taskOnly);
    expect(await collection(C.tasks).findOne({ _id: "historical-task" })).toEqual(historicTask);
    expect(await protectedHistory()).toEqual(history);
    const state = (await readInventoryState(db())).snapshot;
    const auditCount = await collection(C.audits).countDocuments({});
    await applyProjectManagerRoleMigration(options);
    expect((await readInventoryState(db())).snapshot).toEqual(state);
    expect(await collection(C.audits).countDocuments({})).toBe(auditCount);
  });
  it("rejects tampered, truncated, wrong target, backup and run identity before business writes", async () => {
    const options = await input();
    const truncated = structuredClone(options.manifest); truncated.cohorts.pop(); truncated.digest = manifestDigest(truncated);
    await expect(applyProjectManagerRoleMigration({ ...options, manifest: truncated })).rejects.toThrow("STALE_OR_INVALID_MANIFEST");
    const tampered = structuredClone(options.manifest); tampered.cohorts[0]!.userIds.push("unexpected");
    await expect(applyProjectManagerRoleMigration({ ...options, manifest: tampered })).rejects.toThrow("MANIFEST_DIGEST_MISMATCH");
    await expect(applyProjectManagerRoleMigration({ ...options, targetId: "wrong" })).rejects.toThrow("TARGET_MISMATCH");
    await expect(applyProjectManagerRoleMigration({ ...options, backupRef: "" })).rejects.toThrow("BACKUP_REFERENCE_REQUIRED");
    expect(await collection(RECEIPTS).countDocuments({})).toBe(0);
    await applyProjectManagerRoleMigration(options);
    await expect(applyProjectManagerRoleMigration({ ...options, backupRef: "different" })).rejects.toThrow("RUN_IDENTITY_MISMATCH");
    await expect(rollbackProjectManagerRoleMigration({ ...options, runId: "unknown" })).rejects.toThrow("UNKNOWN_RUN");
  });
  it.each(["project", "source", "task", "role", "invitation"])("invalidates a manifest after a concurrent %s edit", async kind => {
    const options = await input();
    if (kind === "project") await collection(C.projects).updateOne({ _id: "p1" }, { $inc: { procurementIdentityVersion: 1 } });
    if (kind === "source") await collection(C.estimates).updateOne({ _id: "e1" }, { $inc: { designPlanVersion: 1 } });
    if (kind === "task") await collection(C.tasks).updateOne({ _id: "t1" }, { $inc: { version: 1 } });
    if (kind === "role") await collection(C.users).updateOne({ _id: "legacy" }, { $inc: { version: 1, sessionVersion: 1 }, $set: { active: false } });
    if (kind === "invitation") await collection(C.invitations).insertOne({ _id: "new-invite", role: "program_manager", status: "pending", expiresAt: new Date(at.getTime() + 60000), tokenHash: "private-token" });
    await expect(applyProjectManagerRoleMigration(options)).rejects.toThrow("STALE_OR_INVALID_MANIFEST");
    expect(await collection(RECEIPTS).countDocuments({})).toBe(0);
    expect(await collection(C.users).findOne({ _id: "legacy" })).toMatchObject({ role: "program_manager" });
  });
  it("preflights all cohorts and blocks every conversion when one dependent project conflicts", async () => {
    await collection(C.tasks).updateOne({ _id: "t1" }, { $set: { assigneeUserId: "site" } });
    const options = await input();
    expect(options.manifest.conflicts.map(conflict => conflict.code)).toContain("ASSIGNMENT_MISMATCH");
    await expect(applyProjectManagerRoleMigration(options)).rejects.toThrow("UNRESOLVED_MANIFEST_CONFLICTS");
    expect(await collection(C.users).countDocuments({ role: "program_manager" })).toBe(2);
    expect(await collection(RECEIPTS).countDocuments({})).toBe(0);
  });
  it("enforces the sole active Super Admin for apply and refuses rollback after that invariant changes", async () => {
    await collection(C.users).insertOne({ _id: "other-admin", role: "super_admin", active: true, version: 1, sessionVersion: 1 });
    const invalid = await input();
    expect(invalid.manifest.conflicts.map(conflict => conflict.code)).toContain("SOLE_ACTIVE_SUPER_ADMIN_REQUIRED");
    await expect(applyProjectManagerRoleMigration(invalid)).rejects.toThrow("UNRESOLVED_MANIFEST_CONFLICTS");
    expect(await collection(RECEIPTS).countDocuments({})).toBe(0);
    await collection(C.users).updateOne({ _id: "other-admin" }, { $set: { active: false } });
    const options = await input();
    await expect(applyProjectManagerRoleMigration({ ...options, actorId: "site" })).rejects.toThrow("ACTIVE_SUPER_ADMIN_ACTOR_REQUIRED");
    await applyProjectManagerRoleMigration(options);
    await collection(C.users).updateOne({ _id: "other-admin" }, { $set: { active: true } });
    await expect(rollbackProjectManagerRoleMigration(options)).rejects.toThrow("STALE_MANIFEST_OR_LATER_BUSINESS_ACTIVITY");
    expect(await collection(C.users).findOne({ _id: "legacy" })).toMatchObject({ role: "site_manager" });
  });
  it("rolls back all mutations in a failed cohort, then resumes the explicit interrupted run", async () => {
    const options = await input(); const before = (await readInventoryState(db())).snapshot;
    await expect(applyProjectManagerRoleMigration({ ...options, testHooks: { afterMutation: async () => { throw new Error("INJECTED_FAILURE"); } } })).rejects.toThrow("INJECTED_FAILURE");
    expect((await readInventoryState(db())).snapshot).toEqual(before);
    expect(await collection(RECEIPTS).findOne({ _id: runReceiptId(options.runId) })).toMatchObject({ nextCohort: 0, status: "applying" });
    expect(await collection(RECEIPTS).countDocuments({ kind: "apply" })).toBe(0);
    await applyProjectManagerRoleMigration(options);
    expect(await collection(C.users).countDocuments({ role: "program_manager" })).toBe(0);
  });
  it("resumes after committed cohort interruption without double increments or duplicated audits", async () => {
    const options = await input();
    await expect(applyProjectManagerRoleMigration({ ...options, testHooks: { afterCohort: async () => { throw new Error("PROCESS_INTERRUPTED"); } } })).rejects.toThrow("PROCESS_INTERRUPTED");
    const run = await collection(RECEIPTS).findOne({ _id: runReceiptId(options.runId) });
    expect(run).toMatchObject({ nextCohort: 1, status: "applying" });
    const firstUser = options.manifest.cohorts[0]!.userIds[0]!;
    const converted = await collection(C.users).findOne({ _id: firstUser });
    await applyProjectManagerRoleMigration(options);
    expect(await collection(C.users).findOne({ _id: firstUser })).toEqual(converted);
    expect(await collection(C.audits).countDocuments({})).toBe(options.manifest.cohorts.reduce((sum, cohort) => sum + cohort.changes.length, 0));
    expect(await collection(RECEIPTS).countDocuments({ kind: "apply" })).toBe(3);
  });
  it("rejects a missing or corrupted receipt and an inconsistent completion marker", async () => {
    const options = await input();
    await expect(applyProjectManagerRoleMigration({ ...options, testHooks: { afterCohort: async () => { throw new Error("STOP"); } } })).rejects.toThrow("STOP");
    await collection(RECEIPTS).updateOne({ _id: runReceiptId(options.runId) }, { $set: { status: "applied" } });
    await expect(applyProjectManagerRoleMigration(options)).rejects.toThrow("RUN_PROGRESS_INVALID");
    await collection(RECEIPTS).updateOne({ _id: runReceiptId(options.runId) }, { $set: { status: "applying" } });
    await collection(RECEIPTS).updateOne({ kind: "apply" }, { $set: { digest: "corrupted" } });
    await expect(applyProjectManagerRoleMigration(options)).rejects.toThrow("RECEIPT_INTEGRITY_FAILURE");
    await collection(RECEIPTS).deleteOne({ kind: "apply" });
    await expect(rollbackProjectManagerRoleMigration(options)).rejects.toThrow("RECEIPT_INTEGRITY_FAILURE");
  });
  it("detects concurrent user updates during a cohort transaction and does not overwrite them", async () => {
    const options = await input(); let changed = false;
    // The project write occurs before its dependent identity write; race that identity after
    // snapshot acquisition. Mongo retries, then fresh inventory rejects the changed session.
    await expect(applyProjectManagerRoleMigration({ ...options, testHooks: { afterMutation: async change => {
      if (!changed && change.collection === C.projects && change.id === "p1") {
        changed = true;
        await collection(C.users).updateOne({ _id: "legacy" }, { $inc: { sessionVersion: 1, version: 1 } });
      }
    } } })).rejects.toThrow("STALE_MANIFEST_OR_LATER_BUSINESS_ACTIVITY");
    expect(changed).toBe(true);
    expect(await collection(C.users).findOne({ _id: "legacy" })).toMatchObject({ role: "program_manager", sessionVersion: 8, version: 6 });
    expect(await collection(C.projects).findOne({ _id: "p1" })).toMatchObject({ procurementIdentityVersion: 3 });
  });
  it("serializes a concurrent source writer through authorization and refuses to continue after its commit", async () => {
    const options = await input(); let writer: Promise<void> | undefined;
    await expect(applyProjectManagerRoleMigration({ ...options, testHooks: {
      afterMutation: async () => {
        writer ??= (async () => {
          const session = mongoose.connection.getClient().startSession();
          try { await session.withTransaction(async () => {
            await authorizationFence(db(), session);
            await collection(C.estimates).updateOne({ _id: "e1" }, { $inc: { designPlanVersion: 1 } }, { session });
          }); } finally { await session.endSession(); }
        })();
      },
      afterCohort: async () => { await writer; }
    } })).rejects.toThrow("STALE_MANIFEST_OR_LATER_BUSINESS_ACTIVITY");
    await writer;
    expect(await collection(C.estimates).findOne({ _id: "e1" })).toMatchObject({ designPlanVersion: 3 });
    expect(await collection(RECEIPTS).findOne({ _id: runReceiptId(options.runId) })).toMatchObject({ status: "applying", nextCohort: 1 });
    expect(await collection(RECEIPTS).countDocuments({ kind: "apply" })).toBe(1);
  });
  it("rolls back mutable owners/roles, advances session versions again and retains apply/rollback history", async () => {
    const options = await input(); const history = await protectedHistory();
    await applyProjectManagerRoleMigration(options);
    const appliedAudits = await collection(C.audits).find({}).toArray();
    await rollbackProjectManagerRoleMigration(options);
    expect(await collection(C.users).findOne({ _id: "legacy" })).toMatchObject({ role: "program_manager", active: true, version: 7, sessionVersion: 9, passwordHash: "private-hash" });
    expect(await collection(C.users).findOne({ _id: "site" })).toMatchObject({ role: "site_manager", version: 4, sessionVersion: 5 });
    expect(await collection(C.projects).findOne({ _id: "p3" })).toMatchObject({ programManagerId: null, procurementIdentityVersion: 4 });
    expect(await collection(C.tasks).findOne({ _id: "t1" })).toMatchObject({ assigneeUserId: null, version: 5, awardApprovalEpoch: 4, dueAt: at });
    expect(await protectedHistory()).toEqual(history);
    for (const event of appliedAudits) expect(await collection(C.audits).findOne({ _id: event._id })).toEqual(event);
    expect(await collection(C.audits).countDocuments({})).toBe(appliedAudits.length * 2);
    const rolledBack = (await readInventoryState(db())).snapshot;
    await rollbackProjectManagerRoleMigration(options);
    expect((await readInventoryState(db())).snapshot).toEqual(rolledBack);
    await expect(applyProjectManagerRoleMigration(options)).rejects.toThrow("RUN_ALREADY_ROLLED_BACK");
  });
  it.each(["assignment", "immutable_history", "new_activity"])("refuses rollback over later %s", async kind => {
    const options = await input(); await applyProjectManagerRoleMigration(options);
    if (kind === "assignment") await collection(C.projects).updateOne({ _id: "p1" }, { $set: { programManagerId: "site" }, $inc: { procurementIdentityVersion: 1 } });
    if (kind === "immutable_history") await collection(C.reviews).updateOne({ _id: "historic-review" }, { $set: { managerId: "altered" } });
    if (kind === "new_activity") await collection("newBusinessCollection").insertOne({ _id: "activity", projectId: "p1", value: 1 });
    const before = (await readInventoryState(db())).snapshot;
    await expect(rollbackProjectManagerRoleMigration(options)).rejects.toThrow("STALE_MANIFEST_OR_LATER_BUSINESS_ACTIVITY");
    expect((await readInventoryState(db())).snapshot).toEqual(before);
  });
  it("rolls back an interrupted partial run atomically and can resume rollback after process interruption", async () => {
    const options = await input();
    await expect(applyProjectManagerRoleMigration({ ...options, testHooks: { afterCohort: async () => { throw new Error("STOP"); } } })).rejects.toThrow("STOP");
    await expect(rollbackProjectManagerRoleMigration({ ...options, testHooks: { afterMutation: async () => { throw new Error("ROLLBACK_FAILURE"); } } })).rejects.toThrow("ROLLBACK_FAILURE");
    expect(await collection(RECEIPTS).countDocuments({ kind: "rollback" })).toBe(0);
    await expect(rollbackProjectManagerRoleMigration({ ...options, testHooks: { afterCohort: async () => { throw new Error("ROLLBACK_INTERRUPTED"); } } })).rejects.toThrow("ROLLBACK_INTERRUPTED");
    await rollbackProjectManagerRoleMigration(options);
    expect(await collection(RECEIPTS).findOne({ _id: runReceiptId(options.runId) })).toMatchObject({ status: "rolled_back", nextCohort: 1, rollbackCount: 1 });
  });
  it("accepts a fresh reviewed owner resolution without changing frozen history", async () => {
    await collection(C.tasks).updateOne({ _id: "t1" }, { $set: { assigneeUserId: "site" } });
    const manifest = await createProjectManagerRoleInventory({ db: db(), targetId: "disposable-migration-test", now: at,
      resolutions: [{ projectId: "p1", ownerId: "site", reviewedById: "admin", reason: "Owner confirmed against current project responsibility" }] });
    const historyDigest = digest(await protectedHistory());
    expect(manifest.conflicts).toEqual([]);
    expect(manifest.cohorts.find(cohort => cohort.userIds.includes("legacy"))?.projectIds).toEqual(["p1", "p2", "p3"]);
    await applyProjectManagerRoleMigration(await input(manifest));
    expect(await collection(C.projects).findOne({ _id: "p1" })).toMatchObject({ programManagerId: "site" });
    expect(digest(await protectedHistory())).toBe(historyDigest);
  });
});
