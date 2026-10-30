import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { roleMayRequestModule } from "../src/domain/authorization.js";
import { ROLE_CODES, type Role } from "../src/domain/roles.js";
import { AccessRequestModel } from "../src/models/AccessRequest.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { TaskModel } from "../src/models/Task.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { SeedData, UserRecord } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createUserAdministrationService } from "../src/services/user-administration.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const JWT_SECRET = "user-administration-mongo-secret-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const NOW = "2026-08-17T12:00:00.000Z";
const clock = () => new Date(NOW);

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([
    UserModel.syncIndexes(),
    AccessRequestModel.syncIndexes(),
    ProjectAccessGrantModel.syncIndexes(),
    AuditEventModel.syncIndexes(),
    AuthorizationCoordinationModel.syncIndexes(),
    ProjectModel.syncIndexes(),
    ProjectWorkflowTaskModel.syncIndexes(),
    LeadModel.syncIndexes(),
    EstimateModel.syncIndexes(),
    TaskModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterAll(async () => {
  await replica.stop();
});

function bearer(id: string, role: Role): string {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

async function insertUser(id: string, role: Role, active = true) {
  await UserModel.create({
    _id: id,
    name: id,
    email: `${id}@mongo-admin.lisno.example`,
    emailNormalized: `${id}@mongo-admin.lisno.example`,
    passwordHash: "not-used-by-jwt-tests",
    role,
    active,
    version: 1,
    managerId: null,
    authorizedClientIds: [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

/**
 * Asymmetric directory fixture shared by the Mongo/memory summary parity test:
 * unequal role counts, two inactive users in two different roles, and many
 * visible roles with no users at all.
 */
const DIRECTORY_FIXTURE: readonly { id: string; role: Role; active: boolean }[] = [
  // "user-super" rather than "user-super-admin": the latter is a reserved
  // development-demo identity and bearer tokens for it are rejected.
  { id: "user-super", role: "super_admin", active: true },
  { id: "user-designer-alpha", role: "designer", active: true },
  { id: "user-designer-beta", role: "designer", active: true },
  { id: "user-designer-gamma", role: "designer", active: false },
  { id: "user-admin-one", role: "admin", active: true },
  { id: "user-admin-two", role: "admin", active: true },
  { id: "user-client-solo", role: "client", active: false }
];

async function insertDirectoryFixture() {
  for (const { id, role, active } of DIRECTORY_FIXTURE) {
    await insertUser(id, role, active);
  }
}

/** The same seeded state as `DIRECTORY_FIXTURE`, backed by the memory repository. */
function memoryDirectoryRepository() {
  const seed: SeedData = structuredClone(demoSeedData);
  const template = structuredClone(demoSeedData.users[0]!);
  seed.users = DIRECTORY_FIXTURE.map(
    ({ id, role, active }): UserRecord => ({
      ...template,
      id,
      name: id,
      email: `${id}@mongo-admin.lisno.example`,
      emailNormalized: `${id}@mongo-admin.lisno.example`,
      role,
      active,
      accountKind: "standard",
      version: 1,
      managerId: null,
      authorizedClientIds: [],
      createdAt: NOW,
      updatedAt: NOW
    })
  );
  return createMemoryRepository(seed);
}

async function insertProject(id: string) {
  await ProjectModel.create({
    _id: id,
    name: id,
    clientId: null,
    clientName: "Mongo Client",
    clientEmail: "mongo-client@example.com",
    clientEmailNormalized: "mongo-client@example.com",
    clientMobile: "9999999999",
    clientAddress: "Pune",
    initiatingDesignerId: "unrelated-designer",
    assignedDesignerIds: [],
    managerId: "unrelated-manager",
    status: "active",
    location: "Pune",
    plannedStartAt: new Date("2026-08-01T00:00:00.000Z"),
    plannedEndAt: new Date("2026-12-01T00:00:00.000Z"),
    actualStartAt: null,
    actualEndAt: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

async function createPending(
  id: string,
  requesterId: string,
  projectId: string
) {
  return createMongoRepository().createAccessRequest({
    id,
    requesterId,
    projectId,
    module: "design",
    reason: "Need design access.",
    createdAt: NOW,
    updatedAt: NOW
  });
}

function application() {
  return createApp({ repository: createMongoRepository(), auth, clock });
}

async function expectNoIneligibleActiveGrant(
  userId: string,
  projectId: string,
  expectedUser: { active?: boolean; role?: Role }
) {
  const reloadedUser = await UserModel.findById(userId).lean().exec();
  const reloadedGrant = await ProjectAccessGrantModel.findOne({
    userId,
    projectId,
    module: "design"
  })
    .lean()
    .exec();
  expect(reloadedUser).toMatchObject(expectedUser);
  expect(reloadedUser!.updatedAt.toISOString()).toBe(NOW);
  expect(
    reloadedUser!.active && roleMayRequestModule(reloadedUser!.role, "design")
      ? true
      : reloadedGrant === null || reloadedGrant.active === false
  ).toBe(true);
  expect(
    await ProjectAccessGrantModel.countDocuments({
      userId,
      projectId,
      module: "design",
      active: true
    })
  ).toBe(0);
}

describe("user administration Mongo replica-set transactions", () => {
  it("matches memory responsibility counts and blocks role editing while current execution work remains", async () => {
    await insertUser("merge-super", "super_admin");
    await insertUser("merge-manager", "site_manager");
    await insertUser("merge-other", "site_manager");
    for (const id of ["current-project", "completed-project", "other-project"]) await insertProject(id);
    await ProjectModel.updateOne({ _id: "current-project" }, { $set: { programManagerId: "merge-manager" } });
    await ProjectModel.updateOne({ _id: "completed-project" }, { $set: { programManagerId: "merge-manager", status: "completed" } });
    await ProjectModel.updateOne({ _id: "other-project" }, { $set: { programManagerId: "merge-other" } });
    const assignments = [
      { projectId: "current-project", kind: "site_execution" as const, assigneeRole: "site_manager" as const, assigneeUserId: "merge-manager", status: "open" },
      { projectId: "completed-project", kind: "site_execution" as const, assigneeRole: "site_manager" as const, assigneeUserId: "merge-manager", status: "completed" },
      { projectId: "superseded-project", kind: "site_execution" as const, assigneeRole: "site_manager" as const, assigneeUserId: "merge-manager", status: "open", supersededAt: NOW },
      { projectId: "other-project", kind: "site_execution" as const, assigneeRole: "site_manager" as const, assigneeUserId: "merge-other", status: "open" }
    ];
    await ProjectWorkflowTaskModel.collection.insertMany(assignments.map((row, index) => ({ ...row, _id: `merge-work-${index}`, dedupeKey: `merge-work-${index}`,
      ...(row.supersededAt ? { supersededAt: new Date(row.supersededAt) } : {}) })));
    const memorySeed = structuredClone(demoSeedData);
    memorySeed.projectWorkflowAssignments = assignments;
    memorySeed.projects = [
      { ...structuredClone(demoSeedData.projects[0]!), id: "current-project", programManagerId: "merge-manager", status: "active" },
      { ...structuredClone(demoSeedData.projects[0]!), id: "completed-project", programManagerId: "merge-manager", status: "completed" },
      { ...structuredClone(demoSeedData.projects[0]!), id: "other-project", programManagerId: "merge-other", status: "active" }
    ];
    const expected = { assignedExecutionProjects: 1, assignedWorkflowTasks: 1 };
    expect(await createMongoRepository().countUserResponsibilities("merge-manager")).toMatchObject(expected);
    expect(await createMemoryRepository(memorySeed).countUserResponsibilities("merge-manager")).toMatchObject(expected);
    const response = await request(application()).patch("/api/v1/admin/users/merge-manager")
      .set("Authorization", bearer("merge-super", "super_admin")).send({ version: 1, role: "procurement" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("RESPONSIBILITY_REASSIGNMENT_REQUIRED");
    expect(await UserModel.findById("merge-manager").lean()).toMatchObject({ role: "site_manager", version: 1, sessionVersion: 1 });
    expect(await AuditEventModel.countDocuments({ entityId: "merge-manager" })).toBe(0);
  });

  it("rejects legacy account writes and preserves monotonic session versions across deactivation", async () => {
    await insertUser("canonical-account", "site_manager");
    const repository = createMongoRepository();
    const canonical = (await repository.findUserById("canonical-account"))!;
    await expect(repository.createUser({ ...canonical, id: "legacy-new", email: "legacy-new@example.test", role: "program_manager" })).rejects.toThrow(/legacy Program Manager/);
    await expect(repository.updateUser(canonical.id, 1, { role: "program_manager", updatedAt: NOW })).rejects.toThrow(/legacy Program Manager/);
    expect(await UserModel.exists({ _id: "legacy-new" })).toBeNull();
    expect(await repository.findUserById(canonical.id)).toMatchObject({ role: "site_manager", version: 1, sessionVersion: 1 });
    await repository.updateUser(canonical.id, 1, { active: false, updatedAt: NOW });
    await repository.updateUser(canonical.id, 2, { active: true, updatedAt: NOW });
    expect(await repository.findUserById(canonical.id)).toMatchObject({ active: true, version: 3, sessionVersion: 3 });
  });

  it("requires migration rather than an ordinary role edit of a legacy manager", async () => {
    await insertUser("migration-super", "super_admin");
    await insertUser("migration-legacy", "program_manager");
    const response = await request(application()).patch("/api/v1/admin/users/migration-legacy")
      .set("Authorization", bearer("migration-super", "super_admin")).send({ version: 1, role: "site_manager" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PROJECT_MANAGER_MIGRATION_REQUIRED");
    expect(await UserModel.findById("migration-legacy").lean()).toMatchObject({ role: "program_manager", version: 1 });
    expect(await AuditEventModel.countDocuments({ entityId: "migration-legacy" })).toBe(0);
  });

  it("defines the sole Super Admin persistence backstop", () => {
    expect(UserModel.schema.indexes()).toContainEqual([
      { role: 1 },
      {
        unique: true,
        partialFilterExpression: { role: "super_admin" },
        name: "one_super_admin"
      }
    ]);
  });

  it("rejects concurrent second Super Admin inserts and preserves the original row", async () => {
    await insertUser("user-super-admin", "super_admin");

    const attempts = await Promise.allSettled([
      insertUser("user-super-second", "super_admin"),
      insertUser("user-super-third", "super_admin")
    ]);

    expect(attempts.every(({ status }) => status === "rejected")).toBe(true);
    expect(await UserModel.find({ role: "super_admin" }).lean().exec()).toEqual([
      expect.objectContaining({ _id: "user-super-admin", role: "super_admin" })
    ]);
  });

  it("summarizes the directory identically in Mongo and in memory", async () => {
    await insertDirectoryFixture();
    const mongo = createMongoRepository();
    const memory = memoryDirectoryRepository();

    const mongoSummary = await mongo.summarizeUsers(ROLE_CODES);
    const memorySummary = await memory.summarizeUsers(ROLE_CODES);

    expect(mongoSummary).toEqual(memorySummary);
    expect(mongoSummary).toEqual({
      total: 7,
      active: 5,
      inactive: 2,
      roleCount: 4
    });
    expect(mongoSummary.total).toBe(mongoSummary.active + mongoSummary.inactive);
    expect(mongoSummary.roleCount).toBeLessThan(ROLE_CODES.length);

    // A visible role holding no user must not increment roleCount, in either
    // implementation.
    const scope: readonly Role[] = ["designer", "procurement"];
    const scopedMongo = await mongo.summarizeUsers(scope);
    expect(scopedMongo).toEqual(await memory.summarizeUsers(scope));
    expect(scopedMongo).toEqual({ total: 3, active: 2, inactive: 1, roleCount: 1 });

    expect(await mongo.summarizeUsers([])).toEqual(await memory.summarizeUsers([]));

    // The route envelope carries the same filter-independent summary.
    const directory = await request(application())
      .get("/api/v1/admin/users?search=gamma&limit=20&offset=0")
      .set("Authorization", bearer("user-super", "super_admin"));
    expect(directory.status).toBe(200);
    expect(directory.body.data.summary).toEqual(memorySummary);
    expect(directory.body.data.pagination.total).toBe(1);
  });

  it("serializes access approval against requester deactivation", async () => {
    const requesterId = "user-race-deactivate";
    const projectId = "project-race-deactivate";
    await Promise.all([
      insertUser("user-super", "super_admin"),
      insertUser(requesterId, "designer"),
      insertProject(projectId)
    ]);
    const pending = await createPending("request-race-deactivate", requesterId, projectId);
    const app = application();

    const [mutation, approval] = await Promise.all([
      request(app)
        .patch(`/api/v1/admin/users/${requesterId}`)
        .set("Authorization", bearer("user-super", "super_admin"))
        .send({ version: 1, active: false }),
      request(app)
        .post(`/api/v1/access-requests/${pending.id}/decision`)
        .set("Authorization", bearer("user-super", "super_admin"))
        .send({ version: pending.version, decision: "approved" })
    ]);

    expect(mutation.status).toBe(200);
    expect(mutation.body.data.user).toMatchObject({ active: false, version: 2 });
    expect([200, 409]).toContain(approval.status);
    if (approval.status === 409) {
      expect(approval.body.error.code).toBe("ACCESS_REQUEST_NOT_APPROVABLE");
    }
    await expectNoIneligibleActiveGrant(requesterId, projectId, { active: false });
  });

  it("serializes access approval against a requester role change", async () => {
    const requesterId = "user-race-role";
    const projectId = "project-race-role";
    await Promise.all([
      insertUser("user-super", "super_admin"),
      insertUser(requesterId, "designer"),
      insertProject(projectId)
    ]);
    const pending = await createPending("request-race-role", requesterId, projectId);
    const app = application();

    const [mutation, approval] = await Promise.all([
      request(app)
        .patch(`/api/v1/admin/users/${requesterId}`)
        .set("Authorization", bearer("user-super", "super_admin"))
        .send({ version: 1, role: "procurement" }),
      request(app)
        .post(`/api/v1/access-requests/${pending.id}/decision`)
        .set("Authorization", bearer("user-super", "super_admin"))
        .send({ version: pending.version, decision: "approved" })
    ]);

    expect(mutation.status).toBe(200);
    expect(mutation.body.data.user).toMatchObject({ role: "procurement", version: 2 });
    expect([200, 409]).toContain(approval.status);
    if (approval.status === 409) {
      expect(approval.body.error.code).toBe("ACCESS_REQUEST_NOT_APPROVABLE");
    }
    await expectNoIneligibleActiveGrant(requesterId, projectId, {
      role: "procurement"
    });
  });
});

describe("logical user deletion Mongo transactions", () => {
  const actor = { id: "delete-super", name: "Delete Super", email: "delete-super@mongo-admin.lisno.example", role: "super_admin" as const };
  function deletionService() {
    const repository = createMongoRepository();
    const audit = createAuditService(repository);
    return { repository, audit, service: createUserAdministrationService(repository, audit, clock) };
  }

  it("keeps legacy inactive vendor identity and membership while incrementing default versions and hiding directory rows", async () => {
    await insertUser(actor.id, "super_admin");
    await UserModel.create({ _id: "deleted-vendor", name: "Old Vendor", email: "old-vendor@example.test", emailNormalized: "old-vendor@example.test", passwordHash: "fixture-hash", role: "vendor", vendorId: "vendor-directory-fixture", active: false, sessionVersion: 1 });
    await UserModel.collection.updateOne({ _id: "deleted-vendor" }, { $unset: { version: "", sessionVersion: "", deletedAt: "", deletedById: "" } });
    const { repository, service } = deletionService();
    const result = await service.delete(actor, "deleted-vendor", { version: 1 });
    expect(result).toEqual({ userId: "deleted-vendor", version: 2, deletedAt: NOW });
    await expect(repository.findVendorBoundUsers("vendor-directory-fixture")).resolves.toMatchObject([{ id: "deleted-vendor", active: false, version: 2, sessionVersion: 2, deletedById: actor.id }]);
    await expect(repository.findUserByEmail("old-vendor@example.test")).resolves.toMatchObject({ id: "deleted-vendor", deletedAt: NOW });
    expect((await service.list(actor, { active: false }, { limit: 20, offset: 0 })).total).toBe(0);
    await expect(repository.summarizeUsers(ROLE_CODES)).resolves.toEqual({ total: 1, active: 1, inactive: 0, roleCount: 1 });
    await expect(repository.updateUser("deleted-vendor", 2, { active: true, updatedAt: NOW })).rejects.toThrow(/not found/);
    expect(await UserModel.countDocuments({ _id: "deleted-vendor" })).toBe(1);
  });

  it("serializes repeated deletion and preserves unrelated users and work with one audit", async () => {
    await insertUser(actor.id, "super_admin");
    await insertUser("delete-concurrent", "designer");
    await insertUser("delete-untouched", "designer");
    await insertProject("delete-project");
    await ProjectModel.updateOne({ _id: "delete-project" }, { $set: { assignedDesignerIds: ["delete-concurrent", "delete-untouched"] } });
    const { repository, service } = deletionService();
    const [first, second] = await Promise.all([
      service.delete(actor, "delete-concurrent", { version: 1 }),
      service.delete(actor, "delete-concurrent", { version: 1 })
    ]);
    expect(first).toEqual(second);
    expect(await AuditEventModel.countDocuments({ action: "user.deleted", entityId: "delete-concurrent" })).toBe(1);
    await expect(repository.findUserById("delete-concurrent")).resolves.toMatchObject({ active: false, version: 2, sessionVersion: 2 });
    await expect(repository.findUserById("delete-untouched")).resolves.toMatchObject({ active: true, version: 1, sessionVersion: 1 });
    expect((await ProjectModel.findById("delete-project").lean())!.assignedDesignerIds).toEqual(["delete-concurrent", "delete-untouched"]);
    const fenceBefore = await AuthorizationCoordinationModel.findById("authorization").lean();
    await expect(service.delete(actor, "delete-concurrent", { version: 1 })).resolves.toEqual(first);
    expect(await AuthorizationCoordinationModel.findById("authorization").lean()).toEqual(fenceBefore);
  });

  it.each(["activation", "role"])("serializes deletion against %s without allowing a deleted account to return", async changeKind => {
    await insertUser(actor.id, "super_admin");
    await insertUser("delete-update-race", "designer", false);
    const { repository, service } = deletionService();
    const update = changeKind === "activation" ? { version: 1, active: true } : { version: 1, role: "procurement" as const };
    const results = await Promise.allSettled([
      service.delete(actor, "delete-update-race", { version: 1 }),
      service.update(actor, "delete-update-race", update)
    ]);
    expect(results.some(result => result.status === "fulfilled")).toBe(true);
    const current = (await repository.findUserById("delete-update-race"))!;
    if (!current.deletedAt) {
      expect(results[0]).toMatchObject({ status: "rejected", reason: { code: "VERSION_CONFLICT" } });
      await service.delete(actor, current.id, { version: current.version });
    }
    const deleted = (await repository.findUserById("delete-update-race"))!;
    expect(deleted.active).toBe(false);
    expect(deleted.deletedAt).toBe(NOW);
    await expect(service.update(actor, deleted.id, { version: deleted.version, active: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await AuditEventModel.countDocuments({ action: "user.deleted", entityId: deleted.id })).toBe(1);
  });

  it("serializes access approval against requester deletion", async () => {
    const requesterId = "user-race-delete";
    const projectId = "project-race-delete";
    await insertUser(actor.id, "super_admin");
    await insertUser(requesterId, "designer");
    await insertProject(projectId);
    const pending = await createPending("request-race-delete", requesterId, projectId);
    const app = application();
    const [deletion, approval] = await Promise.all([
      request(app).delete(`/api/v1/admin/users/${requesterId}`).set("Authorization", bearer(actor.id, "super_admin")).send({ version: 1 }),
      request(app).post(`/api/v1/access-requests/${pending.id}/decision`).set("Authorization", bearer(actor.id, "super_admin")).send({ version: pending.version, decision: "approved" })
    ]);
    expect(deletion.status).toBe(200);
    expect(deletion.body.data).toEqual({ userId: requesterId, deletedAt: NOW, version: 2 });
    expect([200, 409]).toContain(approval.status);
    await expectNoIneligibleActiveGrant(requesterId, projectId, { active: false });
    expect(await AuditEventModel.countDocuments({ action: "user.deleted", entityId: requesterId })).toBe(1);
  });

  it("rolls back the user and revoked grants when deletion audit persistence fails", async () => {
    await insertUser(actor.id, "super_admin");
    await insertUser("delete-rollback", "designer");
    await insertProject("delete-rollback-project");
    const repository = createMongoRepository();
    const pending = await createPending("delete-rollback-request", "delete-rollback", "delete-rollback-project");
    const approval = await request(application()).post(`/api/v1/access-requests/${pending.id}/decision`).set("Authorization", bearer(actor.id, "super_admin")).send({ version: pending.version, decision: "approved" });
    expect(approval.status).toBe(200);
    const audit = createAuditService(repository);
    const append = audit.append.bind(audit);
    vi.spyOn(audit, "append").mockImplementation((input, tx) => input.action === "user.deleted" ? Promise.reject(new Error("mongo deletion audit failed")) : append(input, tx));
    const service = createUserAdministrationService(repository, audit, clock);
    const auditCount = await AuditEventModel.countDocuments();
    await expect(service.delete(actor, "delete-rollback", { version: 1 })).rejects.toThrow("mongo deletion audit failed");
    await expect(repository.findUserById("delete-rollback")).resolves.toMatchObject({ active: true, version: 1, sessionVersion: 1 });
    expect((await repository.findUserById("delete-rollback"))!.deletedAt).toBeUndefined();
    expect(await ProjectAccessGrantModel.countDocuments({ userId: "delete-rollback", active: true })).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(auditCount);
  });
});
