import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectInitiationDefaultsModel } from "../src/models/ProjectInitiationDefaults.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import mongoose from "mongoose";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { AppRepository } from "../src/repositories/types.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectInitiationDefaultsService } from "../src/services/project-initiation-defaults.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const now = "2026-11-15T12:00:00.000Z";
const clock = () => new Date(now);
const actor: PublicUser = { id: "settings-super-admin", name: "Settings Admin", email: "settings-admin@example.test", role: "super_admin" };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function setup(repository = createMongoRepository()) {
  const audit = createAuditService(repository);
  return { repository, audit, service: createProjectInitiationDefaultsService(repository, audit, clock) };
}

beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([UserModel.syncIndexes(), ProjectInitiationDefaultsModel.syncIndexes(), AuditEventModel.syncIndexes(), AuthorizationCoordinationModel.syncIndexes(), ProjectModel.syncIndexes()]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
  await UserModel.create([
    { _id: actor.id, name: actor.name, email: actor.email, emailNormalized: actor.email, role: actor.role },
    { _id: "pm-a", name: "First Project Manager", email: "pm-a@example.test", emailNormalized: "pm-a@example.test", role: "site_manager" },
    { _id: "pm-b", name: "Second Project Manager", email: "pm-b@example.test", emailNormalized: "pm-b@example.test", role: "site_manager" },
    { _id: "sales-manager", name: "Sales Manager", email: "sales-manager@example.test", emailNormalized: "sales-manager@example.test", role: "admin" }
  ].map(user => ({ ...user, passwordHash: "unused-test-password", active: true, accountKind: "standard" })));
});

afterAll(async () => { if (replica) await replica.stop(); });

describe("Project defaults transaction and race integrity", () => {
  it("commits exactly one concurrent first save and preserves its audit atomically", async () => {
    const { service } = setup();
    const outcomes = await Promise.allSettled(["pm-a", "pm-b"].map(projectManagerId => service.update(actor, { expectedVersion: 0, projectManagerId })));
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, code: "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT" });
    const rows = await ProjectInitiationDefaultsModel.find().lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ _id: "organization", version: 1, updatedById: actor.id });
    const events = await AuditEventModel.find({ action: "project_initiation_defaults_updated" }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: actor.id,
      oldValues: { projectManagerId: null, version: 0 }, newValues: { projectManagerId: rows[0]!.projectManagerId, version: 1 } });
  });

  it("serializes replacements, makes no-op saves quiet, and preserves existing project assignment", async () => {
    const { service } = setup();
    await service.update(actor, { expectedVersion: 0, projectManagerId: "pm-a" });
    await ProjectModel.create({ _id: "existing-project", name: "Existing project", programManagerId: "pm-a",
      clientName: "Existing Client", clientEmail: "existing@example.test", clientEmailNormalized: "existing@example.test",
      clientMobile: "9000000000", status: "planning", plannedStartAt: new Date(now), plannedEndAt: new Date(now) });
    const before = await ProjectInitiationDefaultsModel.findById("organization").lean();
    await service.update(actor, { expectedVersion: 1, projectManagerId: "pm-a" });
    expect(await ProjectInitiationDefaultsModel.findById("organization").lean()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(1);
    const outcomes = await Promise.allSettled([
      service.update(actor, { expectedVersion: 1, projectManagerId: "pm-b" }),
      service.update(actor, { expectedVersion: 1, projectManagerId: "pm-b" })
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, code: "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT" });
    expect(await ProjectInitiationDefaultsModel.findById("organization").lean()).toMatchObject({ version: 2, projectManagerId: "pm-b" });
    expect(await ProjectModel.findById("existing-project").lean()).toMatchObject({ programManagerId: "pm-a" });
    expect(await AuditEventModel.countDocuments()).toBe(2);
  });

  it("rolls back singleton creation when audit persistence fails", async () => {
    const { repository, audit } = setup();
    const service = createProjectInitiationDefaultsService(repository, { ...audit, append: vi.fn().mockRejectedValue(new Error("audit failure")) }, clock);
    await expect(service.update(actor, { expectedVersion: 0, projectManagerId: "pm-a" })).rejects.toThrow("audit failure");
    expect(await ProjectInitiationDefaultsModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);
  });

  it("does not accept an unavailable current target as a no-op or disclose its identity", async () => {
    const { service } = setup();
    await service.update(actor, { expectedVersion: 0, projectManagerId: "pm-a" });
    await UserModel.updateOne({ _id: "pm-a" }, { $set: { active: false } });
    await expect(service.update(actor, { expectedVersion: 1, projectManagerId: "pm-a" })).rejects.toMatchObject({ status: 400, fields: { projectManagerId: "Select an active Project Manager." } });
    await expect(service.read(actor)).resolves.toEqual({ version: 1, status: "unavailable", projectManager: null });
    expect(await AuditEventModel.countDocuments()).toBe(1);
    await expect(service.update(actor, { expectedVersion: 1, projectManagerId: "pm-b" })).resolves.toMatchObject({ version: 2, status: "ready" });
  });

  it.each([
    { name: "deactivation", change: { active: false } },
    { name: "role change", change: { role: "admin" } },
    { name: "deletion", change: { deletedAt: new Date(now) } }
  ])("revalidates the manager after a coordinated concurrent $name", async ({ change }) => {
    const locked = signal();
    const release = signal();
    const attempted = signal();
    const repository = createMongoRepository();
    const guarded: AppRepository = { ...repository,
      runInTransaction: operation => repository.runInTransaction(transaction => operation({ ...transaction,
        coordinateAuthorizationMutation: async () => { attempted.resolve(); await transaction.coordinateAuthorizationMutation(); }
      })) };
    const { service } = setup(guarded);
    const changeAccount = mongoose.connection.transaction(async session => {
      await createMongoRepository(session).coordinateAuthorizationMutation();
      await UserModel.updateOne({ _id: "pm-a" }, { $set: change }, { session });
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const saving = service.update(actor, { expectedVersion: 0, projectManagerId: "pm-a" });
    const rejected = expect(saving).rejects.toMatchObject({ status: 400, fields: { projectManagerId: "Select an active Project Manager." } });
    await attempted.promise;
    release.resolve();
    await changeAccount;
    await rejected;
    expect(await ProjectInitiationDefaultsModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  }, 30_000);
});
