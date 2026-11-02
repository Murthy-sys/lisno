import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { repairExistingClientProjectLink, assertClientLinkRepairRollbackSafe, type ClientLinkRepairTarget } from "../src/operations/existing-client-project-link-repair.js";
import { assertLocalRepairUri } from "../scripts/repair-existing-client-project-link.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { ProjectClientInvitationModel } from "../src/models/ProjectClientInvitation.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { EmailCoordinationModel } from "../src/models/EmailCoordination.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let directory: string;
const repository = createMongoRepository();
const before = "2026-11-01T10:00:00.000Z";
const clock = () => new Date();
beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([ProjectModel, UserModel, ProjectClientInvitationModel, AuditEventModel,
    AuthorizationCoordinationModel, EmailCoordinationModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => { await replica.clear(); directory = await mkdtemp(join(tmpdir(), "lisno-client-link-repair-test-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
afterAll(async () => { await replica.stop(); });

async function setup(): Promise<ClientLinkRepairTarget> {
  for (const [id, role] of [["repair-sales", "estimator_sales"], ["repair-client", "client"], ["other-client", "client"]] as const) {
    await UserModel.create({ _id: id, name: id, email: `${id}@repair.test`, emailNormalized: `${id}@repair.test`,
      passwordHash: "unused", role, active: true, accountKind: "standard", version: 1, createdAt: before, updatedAt: before });
  }
  await ProjectModel.create({ _id: "repair-project", name: "Synthetic repair project", clientId: null,
    clientName: "Synthetic Client", clientEmail: "repair-client@repair.test", clientEmailNormalized: "repair-client@repair.test",
    clientMobile: "9000000000", assignedEstimatorId: "repair-sales", estimationWorkflowVersion: 3, status: "planning",
    plannedStartAt: before, plannedEndAt: "2027-01-01T00:00:00.000Z", createdAt: before, updatedAt: before });
  await ProjectClientInvitationModel.create({ _id: "repair-invitation", projectId: "repair-project", emailNormalized: "repair-client@repair.test",
    invitedById: "repair-sales", tokenIssuedById: "repair-sales", tokenIssuerVersion: 1, tokenHash: "b".repeat(64), tokenGeneration: 1,
    issuedAt: before, expiresAt: "2027-01-01T00:00:00.000Z", status: "pending", deliveryStatus: "failed", deliveryFailureCode: "DELIVERY_FAILED",
    deliveryAttemptedAt: before, version: 2, createdAt: before, updatedAt: before });
  return { projectId: "repair-project", clientId: "repair-client", actorId: "repair-sales",
    expectedProjectUpdatedAt: before, expectedInvitationVersion: 2 };
}
const backupPath = () => join(directory, "before.json");

describe("scoped existing Client project repair", () => {
  it("defaults to a read-only dry run including no coordination or backup writes", async () => {
    const target = await setup();
    const project = await ProjectModel.findById(target.projectId).lean();
    const invitation = await ProjectClientInvitationModel.findOne({ projectId: target.projectId }).select("+tokenHash").lean();
    expect(await repairExistingClientProjectLink(repository, target)).toEqual({ status: "ready", writes: 0, projectsToLink: 1, invitationsToRevoke: 1 });
    expect(await ProjectModel.findById(target.projectId).lean()).toEqual(project);
    expect(await ProjectClientInvitationModel.findOne({ projectId: target.projectId }).select("+tokenHash").lean()).toEqual(invitation);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);
    expect(await EmailCoordinationModel.countDocuments()).toBe(0);
  });

  it("atomically links only the correct Client, revokes the token, audits, and preserves saved artifacts", async () => {
    const target = await setup();
    const artifacts = mongoose.connection.db!.collection("estimates");
    await artifacts.insertOne({ projectId: target.projectId, estimateVersion: 7, totalPaise: 123456, approval: "approved", pdfDigest: "unchanged" });
    const frozen = await artifacts.findOne({ projectId: target.projectId });
    const result = await repairExistingClientProjectLink(repository, target, { apply: true, backupPath: backupPath(), clock });
    expect(result.status).toBe("applied");
    expect(await repository.findProjectById(target.projectId)).toMatchObject({ clientId: target.clientId });
    expect(await repository.findProjectClientInvitation(target.projectId)).toMatchObject({ status: "revoked", tokenHash: null,
      version: 3, deliveryStatus: "failed", deliveryFailureCode: "DELIVERY_FAILED", deliveryAttemptedAt: before });
    expect(await AuditEventModel.countDocuments({ actorId: target.actorId })).toBe(2);
    expect(await artifacts.findOne({ projectId: target.projectId })).toEqual(frozen);
    const owner = (await repository.findUserById(target.clientId))!;
    const other = (await repository.findUserById("other-client"))!;
    expect((await repository.listProjectsForUserInModule(owner, "projects")).map(row => row.id)).toEqual([target.projectId]);
    expect(await repository.listProjectsForUserInModule(other, "projects")).toEqual([]);
    const backup = await readFile(backupPath(), "utf8");
    expect((await stat(backupPath())).mode & 0o777).toBe(0o600);
    expect(backup).not.toContain("b".repeat(64));
    expect(backup).not.toContain("@repair.test");
    expect(backup).not.toContain("passwordHash");
    expect(await repairExistingClientProjectLink(repository, target, { apply: true })).toEqual({ status: "already_linked", writes: 0 });
    expect(await AuditEventModel.countDocuments()).toBe(2);
  });

  it.each(["wrong-client", "inactive", "deleted", "demo", "wrong-actor", "stale-invitation", "owned", "stale-project"])("rejects %s with no repair writes", async kind => {
    const target = await setup();
    if (kind === "wrong-client") target.clientId = "other-client";
    if (kind === "wrong-actor") target.actorId = "other-client";
    if (kind === "inactive") await UserModel.updateOne({ _id: target.clientId }, { $set: { active: false } });
    if (kind === "deleted") await UserModel.updateOne({ _id: target.clientId }, { $set: { deletedAt: new Date() } });
    if (kind === "demo") await UserModel.updateOne({ _id: target.clientId }, { $set: { accountKind: "development_demo" } });
    if (kind === "stale-invitation") target.expectedInvitationVersion = 1;
    if (kind === "owned") await ProjectModel.updateOne({ _id: target.projectId }, { $set: { clientId: "other-client" } });
    if (kind === "stale-project") target.expectedProjectUpdatedAt = "2020-01-01T00:00:00.000Z";
    await expect(repairExistingClientProjectLink(repository, target, { apply: true, backupPath: backupPath() })).rejects.toThrow("ineligible");
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await repository.findProjectClientInvitation(target.projectId)).toMatchObject({ status: "pending", version: 2 });
  });

  it("rolls back membership and token revocation when auditing fails", async () => {
    const target = await setup();
    const failing = { ...repository, runInTransaction: async <T>(operation: (transaction: typeof repository) => Promise<T>) =>
      repository.runInTransaction(transaction => operation({ ...transaction, async appendAuditEvent() { throw new Error("Synthetic audit failure"); } })) };
    await expect(repairExistingClientProjectLink(failing, target, { apply: true, backupPath: backupPath() })).rejects.toThrow("Synthetic audit failure");
    expect(await repository.findProjectById(target.projectId)).toMatchObject({ clientId: null });
    expect(await repository.findProjectClientInvitation(target.projectId)).toMatchObject({ status: "pending", tokenHash: "b".repeat(64), version: 2 });
  });

  it("rejects a target changed after backup and never overwrites an existing backup", async () => {
    const target = await setup();
    await writeFile(backupPath(), "keep this backup", { mode: 0o600 });
    await expect(repairExistingClientProjectLink(repository, target, { apply: true, backupPath: backupPath() })).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(backupPath(), "utf8")).toBe("keep this backup");
    await rm(backupPath());
    const changed = { ...repository, runInTransaction: async <T>(operation: (transaction: typeof repository) => Promise<T>) => {
      await ProjectClientInvitationModel.updateOne({ projectId: target.projectId }, { $inc: { version: 1 } });
      return repository.runInTransaction(operation);
    } };
    await expect(repairExistingClientProjectLink(changed, target, { apply: true, backupPath: backupPath() })).rejects.toThrow("ineligible");
    expect(await repository.findProjectById(target.projectId)).toMatchObject({ clientId: null });
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("refuses a rollback assessment after client activity or changed project state", async () => {
    const target = await setup();
    const result = await repairExistingClientProjectLink(repository, target, { apply: true, backupPath: backupPath(), clock });
    if (result.status !== "applied") throw new Error("Expected repair receipt");
    await expect(assertClientLinkRepairRollbackSafe(repository, target, result)).resolves.toBeUndefined();
    await AuditEventModel.create({ _id: "later-client-action", actorId: target.clientId, action: "estimate_client_approved",
      entityType: "estimate", entityId: "synthetic-estimate", occurredAt: new Date(), oldValues: {}, newValues: {} });
    await expect(assertClientLinkRepairRollbackSafe(repository, target, result)).rejects.toThrow("ineligible");
    await AuditEventModel.deleteOne({ _id: "later-client-action" });
    await ProjectModel.updateOne({ _id: target.projectId }, { $set: { name: "Later project change", updatedAt: new Date(Date.now() + 1000) } }, { timestamps: false });
    await expect(assertClientLinkRepairRollbackSafe(repository, target, result)).rejects.toThrow("ineligible");
  });

  it("limits the CLI to loopback database targets", () => {
    expect(() => assertLocalRepairUri("mongodb://127.0.0.1:27017/local_test?replicaSet=rs0")).not.toThrow();
    for (const uri of ["mongodb+srv://example.test/test", "mongodb://example.test/test", "mongodb://localhost.evil.test/test",
      "mongodb://localhost,example.test/test", "mongodb://name:secret@localhost/test"]) expect(() => assertLocalRepairUri(uri)).toThrow("loopback");
  });
});
