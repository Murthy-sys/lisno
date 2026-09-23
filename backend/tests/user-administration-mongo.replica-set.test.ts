import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { roleMayRequestModule } from "../src/domain/authorization.js";
import { ROLE_CODES, type Role } from "../src/domain/roles.js";
import { AccessRequestModel } from "../src/models/AccessRequest.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { TaskModel } from "../src/models/Task.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { SeedData, UserRecord } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
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
