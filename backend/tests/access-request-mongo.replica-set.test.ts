import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { AccessRequestModel } from "../src/models/AccessRequest.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { AppRepository } from "../src/repositories/types.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const JWT_SECRET = "access-request-mongo-secret-with-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const NOW = "2026-08-17T10:00:00.000Z";
const clock = () => new Date(NOW);

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([
    UserModel.syncIndexes(),
    AccessRequestModel.syncIndexes(),
    ProjectAccessGrantModel.syncIndexes(),
    AuditEventModel.syncIndexes(),
    ProjectModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterAll(async () => {
  await replica.stop();
});

function bearer(id: string, role: "designer" | "super_admin") {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

async function insertUser(
  id: string,
  role: "designer" | "super_admin",
  active = true
) {
  await UserModel.create({
    _id: id,
    name: id,
    email: `${id}@mongo.lisno.example`,
    emailNormalized: `${id}@mongo.lisno.example`,
    passwordHash: "not-used-by-jwt-tests",
    role,
    active,
    managerId: null,
    authorizedClientIds: [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

async function insertProject(id = "project-mongo-access") {
  await ProjectModel.create({
    _id: id,
    name: "Mongo Access Project",
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

async function seedActorsAndProject() {
  await Promise.all([
    insertUser("user-mongo-designer", "designer"),
    insertUser("user-mongo-super", "super_admin"),
    insertProject()
  ]);
}

function app(repository: AppRepository = createMongoRepository()) {
  return createApp({ repository, auth, clock });
}

async function createPending(id: string, projectId = "project-mongo-access") {
  return createMongoRepository().createAccessRequest({
    id,
    requesterId: "user-mongo-designer",
    projectId,
    module: "design",
    reason: "Need design access.",
    createdAt: NOW,
    updatedAt: NOW
  });
}

describe("access-request Mongo replica-set transactions", () => {
  it("keeps project lookup inside the transaction snapshot", async () => {
    const repository = createMongoRepository();
    let markSnapshotStarted!: () => void;
    let releaseLookup!: () => void;
    const snapshotStarted = new Promise<void>((resolve) => {
      markSnapshotStarted = resolve;
    });
    const lookupReleased = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });

    const lookup = repository.runInTransaction(async (transaction) => {
      await transaction.coordinateAuthorizationMutation();
      markSnapshotStarted();
      await lookupReleased;
      return transaction.findProjectById("project-after-snapshot");
    });

    await snapshotStarted;
    await insertProject("project-after-snapshot");
    releaseLookup();

    expect(await lookup).toBeNull();
  });

  it("keeps parallel opaque submissions to one pending row and one audit", async () => {
    await insertUser("user-mongo-designer", "designer");
    const application = app();
    const input = {
      projectId: "project-does-not-need-to-exist",
      module: "design",
      reason: "Need design access."
    };
    const token = bearer("user-mongo-designer", "designer");

    const [first, second] = await Promise.all([
      request(application)
        .post("/api/v1/access-requests")
        .set("Authorization", token)
        .send(input),
      request(application)
        .post("/api/v1/access-requests")
        .set("Authorization", token)
        .send(input)
    ]);

    expect([first.status, second.status].sort()).toEqual([202, 202]);
    expect(first.body).toEqual({ data: { accepted: true } });
    expect(second.body).toEqual(first.body);
    expect(
      await AccessRequestModel.countDocuments({
        requesterId: "user-mongo-designer",
        projectId: input.projectId,
        module: input.module,
        status: "pending"
      })
    ).toBe(1);
    expect(
      await AuditEventModel.countDocuments({ action: "access_request.created" })
    ).toBe(1);
  });

  it("recovers a direct duplicate upsert through the complete transaction boundary", async () => {
    const repository = createMongoRepository();
    const input = {
      requesterId: "user-upsert-race",
      projectId: "project-upsert-race",
      module: "design" as const,
      reason: "Need access.",
      createdAt: NOW,
      updatedAt: NOW
    };
    const [first, second] = await Promise.all([
      repository.runInTransaction((transaction) =>
        transaction.findOrCreatePendingAccessRequest({
          ...input,
          id: "request-upsert-race-a"
        })
      ),
      repository.runInTransaction((transaction) =>
        transaction.findOrCreatePendingAccessRequest({
          ...input,
          id: "request-upsert-race-b"
        })
      )
    ]);

    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.record.id).toBe(second.record.id);
    expect(await AccessRequestModel.countDocuments({ status: "pending" })).toBe(1);
  });

  it("rolls back the grant, request transition, and both audits together", async () => {
    await seedActorsAndProject();
    const pending = await createPending("request-mongo-rollback");
    const repository = createMongoRepository();
    const application = app(failAuditAction(repository, "access_request.approved"));
    const response = await request(application)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", bearer("user-mongo-super", "super_admin"))
      .send({ version: pending.version, decision: "approved" });

    expect(response.status).toBe(500);
    expect(await AccessRequestModel.findById(pending.id).lean()).toMatchObject({
      status: "pending",
      __v: 0
    });
    expect(await ProjectAccessGrantModel.countDocuments({})).toBe(0);
    expect(
      await AuditEventModel.countDocuments({
        action: { $in: ["access_request.approved", "project_access.granted"] }
      })
    ).toBe(0);
  });

  it("serializes duplicate approval and competing terminal decisions", async () => {
    await seedActorsAndProject();
    const application = app();
    const token = bearer("user-mongo-super", "super_admin");
    const duplicate = await createPending("request-mongo-duplicate-decision");
    const duplicateInput = { version: duplicate.version, decision: "approved" };
    const duplicateResponses = await Promise.all([
      request(application)
        .post(`/api/v1/access-requests/${duplicate.id}/decision`)
        .set("Authorization", token)
        .send(duplicateInput),
      request(application)
        .post(`/api/v1/access-requests/${duplicate.id}/decision`)
        .set("Authorization", token)
        .send(duplicateInput)
    ]);
    expect(duplicateResponses.map(({ status }) => status).sort()).toEqual([200, 200]);
    expect(duplicateResponses[1]!.body).toEqual(duplicateResponses[0]!.body);
    expect(await ProjectAccessGrantModel.countDocuments({ active: true })).toBe(1);
    expect(
      await AuditEventModel.countDocuments({ action: "access_request.approved" })
    ).toBe(1);

    await ProjectAccessGrantModel.deleteMany({});
    const competing = await createPending("request-mongo-competing-decision");
    const competingResponses = await Promise.all([
      request(application)
        .post(`/api/v1/access-requests/${competing.id}/decision`)
        .set("Authorization", token)
        .send({ version: competing.version, decision: "approved" }),
      request(application)
        .post(`/api/v1/access-requests/${competing.id}/decision`)
        .set("Authorization", token)
        .send({
          version: competing.version,
          decision: "rejected",
          reason: "Not approved"
        })
    ]);
    expect(competingResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const stored = await AccessRequestModel.findById(competing.id).lean();
    expect(["approved", "rejected"]).toContain(stored?.status);
    expect(stored?.__v).toBe(1);
  });

  it("reconstructs an unresolved rejection from the original reason only", async () => {
    await Promise.all([
      insertUser("user-mongo-designer", "designer"),
      insertUser("user-mongo-super", "super_admin")
    ]);
    const pending = await createPending(
      "request-mongo-unknown-rejection",
      "project-does-not-exist"
    );
    const application = app();
    const token = bearer("user-mongo-super", "super_admin");
    const input = {
      version: pending.version,
      decision: "rejected",
      reason: "Original internal reason"
    };
    const first = await request(application)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send(input);
    const retry = await request(application)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send(input);
    const competing = await request(application)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send({ ...input, reason: "Different internal reason" });

    expect(first.status).toBe(200);
    expect(first.body.data.request.decisionReason).toBe(
      "The access request could not be approved."
    );
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(competing.status).toBe(409);
    expect(JSON.stringify(first.body)).not.toContain("Original internal reason");
  });

  it("reconstructs approval before and after revocation from the exact grant ID", async () => {
    await seedActorsAndProject();
    const pending = await createPending("request-mongo-revoke");
    const application = app();
    const token = bearer("user-mongo-super", "super_admin");
    const approvalInput = { version: pending.version, decision: "approved" };
    const approved = await request(application)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send(approvalInput);
    expect(approved.status).toBe(200);
    const grant = approved.body.data.grant;

    const beforeRevocation = await request(application)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send(approvalInput);
    expect(beforeRevocation.status).toBe(200);
    expect(beforeRevocation.body.data.grant.id).toBe(grant.id);

    const revokeInput = {
      version: grant.version,
      reason: "Access no longer required"
    };
    const revoked = await request(application)
      .post(`/api/v1/project-access-grants/${grant.id}/revoke`)
      .set("Authorization", token)
      .send(revokeInput);
    const revokeRetry = await request(application)
      .post(`/api/v1/project-access-grants/${grant.id}/revoke`)
      .set("Authorization", token)
      .send(revokeInput);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data).toMatchObject({ active: false, version: 2 });
    expect(revokeRetry.status).toBe(200);
    expect(revokeRetry.body).toEqual(revoked.body);
    expect(
      await ProjectAccessGrantModel.countDocuments({
        userId: "user-mongo-designer",
        projectId: "project-mongo-access",
        module: "design",
        active: true
      })
    ).toBe(0);

    await ProjectAccessGrantModel.create({
      _id: "grant-mongo-later-direct",
      projectId: "project-mongo-access",
      userId: "user-mongo-designer",
      module: "design",
      source: "direct_assignment",
      accessRequestId: null,
      grantedById: "user-mongo-super",
      active: true,
      grantedAt: new Date(NOW),
      revokedAt: null,
      revokedById: null,
      revocationReason: null,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW)
    });
    const afterRevocation = await request(application)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send(approvalInput);
    expect(afterRevocation.status).toBe(200);
    expect(afterRevocation.body.data.grant).toBeNull();
    expect(
      await AuditEventModel.countDocuments({ action: "project_access.revoked" })
    ).toBe(1);
  });
});

function failAuditAction(
  repository: AppRepository,
  action: string
): AppRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      if (property === "appendAuditEvent") {
        return async (input: { action: string }) => {
          if (input.action === action) throw new Error("simulated audit failure");
          return target.appendAuditEvent(input as never);
        };
      }
      if (property === "runInTransaction") {
        return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
          target.runInTransaction((transaction) =>
            operation(failAuditAction(transaction, action))
          );
      }
      return Reflect.get(target, property, receiver);
    }
  });
}
