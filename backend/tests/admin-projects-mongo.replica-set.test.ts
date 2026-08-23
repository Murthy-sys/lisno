import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { EmailCoordinationModel } from "../src/models/EmailCoordination.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { AppRepository } from "../src/repositories/types.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const JWT_SECRET = "admin-project-mongo-secret-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const NOW = "2026-08-23T10:00:00.000Z";
const clock = () => new Date(NOW);
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([
    UserModel.syncIndexes(),
    ProjectModel.syncIndexes(),
    ProjectAccessGrantModel.syncIndexes(),
    LeadModel.syncIndexes(),
    EstimateModel.syncIndexes(),
    AuditEventModel.syncIndexes(),
    AuthorizationCoordinationModel.syncIndexes(),
    EmailCoordinationModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => replica.clear());
afterAll(async () => replica.stop());

function bearer(id: string, role: "admin" | "super_admin") {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

async function insertUser(
  id: string,
  role: "admin" | "estimator_sales" | "super_admin",
  active = true
) {
  await UserModel.create({
    _id: id,
    name: id,
    email: `${id}@admin-project.test`,
    emailNormalized: `${id}@admin-project.test`,
    passwordHash: "unused",
    role,
    active,
    accountKind: "standard",
    version: 1,
    managerId: null,
    authorizedClientIds: [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

const input = {
  clientName: "Asha Shah",
  clientEmail: "asha@example.com",
  clientMobile: "9000000000",
  projectName: "Asha home",
  location: "Pune",
  propertyType: "3BHK",
  budgetMin: 800000,
  budgetMax: 1200000,
  nextAction: "Schedule site visit",
  nextActionAt: "2026-08-25T10:30:00+05:30",
  estimatorId: "mongo-estimator"
};

describe("Admin project Mongo transactions", () => {
  it("coordinates authorization before reading the Admin or estimator", async () => {
    await Promise.all([
      insertUser("mongo-admin", "admin"),
      insertUser("mongo-estimator", "estimator_sales")
    ]);
    const base = createMongoRepository();
    const calls: string[] = [];
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        if (property !== "runInTransaction") return Reflect.get(target, property, receiver);
        return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
          target.runInTransaction((transaction) => operation(new Proxy(transaction, {
            get(inner, key, innerReceiver) {
              if (key === "coordinateAuthorizationMutation" || key === "findUserById") {
                return async (...args: unknown[]) => {
                  calls.push(String(key));
                  return (inner[key] as (...values: unknown[]) => unknown)(...args);
                };
              }
              return Reflect.get(inner, key, innerReceiver);
            }
          })));
      }
    });
    await request(createApp({ repository, auth, clock }))
      .post("/api/v1/admin/projects")
      .set("Authorization", bearer("mongo-admin", "admin"))
      .send(input)
      .expect(201);
    expect(calls.slice(0, 3)).toEqual([
      "coordinateAuthorizationMutation",
      "findUserById",
      "findUserById"
    ]);
  });

  it.each([
    ["actor", "mongo-admin", 1, 401],
    ["estimator", "mongo-estimator", 2, 400]
  ] as const)(
    "serializes a concurrent %s deactivation before authorization reads",
    async (_label, targetId, gatedReadOrdinal, expectedStatus) => {
      await Promise.all([
        insertUser("mongo-admin", "admin"),
        insertUser("mongo-estimator", "estimator_sales")
      ]);
      const mutationRepository = createMongoRepository();
      let releaseMutation!: () => void;
      const mutationReleased = new Promise<void>((resolve) => {
        releaseMutation = resolve;
      });
      let markMutationCoordinated!: () => void;
      const mutationCoordinated = new Promise<void>((resolve) => {
        markMutationCoordinated = resolve;
      });
      const mutation = mutationRepository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        markMutationCoordinated();
        await mutationReleased;
        const target = await transaction.findUserById(targetId);
        if (!target) throw new Error(`Missing concurrent target ${targetId}.`);
        await transaction.updateUser(target.id, target.version, {
          active: false,
          updatedAt: "2026-08-23T10:01:00.000Z"
        });
      });
      await mutationCoordinated;

      const base = createMongoRepository();
      let readCount = 0;
      let markInitiationReachedAuthorization!: () => void;
      const initiationReachedAuthorization = new Promise<void>((resolve) => {
        markInitiationReachedAuthorization = resolve;
      });
      let allowCapturedRead!: () => void;
      const capturedReadAllowed = new Promise<void>((resolve) => {
        allowCapturedRead = resolve;
      });
      let signalled = false;
      const repository = new Proxy(base, {
        get(target, property, receiver) {
          if (property !== "runInTransaction") {
            return Reflect.get(target, property, receiver);
          }
          return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
            target.runInTransaction((transaction) => operation(new Proxy(transaction, {
              get(inner, key, innerReceiver) {
                if (key === "coordinateAuthorizationMutation") {
                  return async (...args: unknown[]) => {
                    if (!signalled) {
                      signalled = true;
                      markInitiationReachedAuthorization();
                    }
                    return (inner.coordinateAuthorizationMutation as (
                      ...values: unknown[]
                    ) => unknown)(...args);
                  };
                }
                if (key === "findUserById") {
                  return async (...args: unknown[]) => {
                    readCount += 1;
                    const result = await (inner.findUserById as (
                      ...values: unknown[]
                    ) => unknown)(...args);
                    if (!signalled && readCount === gatedReadOrdinal) {
                      signalled = true;
                      markInitiationReachedAuthorization();
                      await capturedReadAllowed;
                    }
                    return result;
                  };
                }
                return Reflect.get(inner, key, innerReceiver);
              }
            })));
        }
      });
      const responsePromise = request(createApp({ repository, auth, clock }))
        .post("/api/v1/admin/projects")
        .set("Authorization", bearer("mongo-admin", "admin"))
        .send(input)
        .then((response) => response);

      await initiationReachedAuthorization;
      releaseMutation();
      await mutation;
      allowCapturedRead();
      const response = await responsePromise;

      expect(response.status).toBe(expectedStatus);
      expect(await ProjectModel.countDocuments()).toBe(0);
      expect(await ProjectAccessGrantModel.countDocuments()).toBe(0);
      expect(await LeadModel.countDocuments()).toBe(0);
      expect(await AuditEventModel.countDocuments()).toBe(0);
    }
  );

  it("commits one scoped project, grant, linked lead, and allowlisted audit trail", async () => {
    await Promise.all([
      insertUser("mongo-admin", "admin"),
      insertUser("mongo-estimator", "estimator_sales")
    ]);
    const app = createApp({ repository: createMongoRepository(), auth, clock });
    const created = await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer("mongo-admin", "admin"))
      .send(input).expect(201);
    expect(created.body.data).toMatchObject({
      name: input.projectName,
      estimator: { id: "mongo-estimator" },
      lead: { stage: "new_lead" }
    });
    const projectId = created.body.data.id;
    expect(await ProjectModel.countDocuments({ _id: projectId })).toBe(1);
    expect(await ProjectAccessGrantModel.countDocuments({
      projectId, userId: "mongo-admin", module: "projects",
      source: "admin_initiator", active: true
    })).toBe(1);
    expect(await LeadModel.countDocuments({
      projectId, ownerId: "mongo-estimator", source: "admin_project"
    })).toBe(1);
    const audits = await AuditEventModel.find({ entityId: { $in: [projectId, created.body.data.lead.id] } }).lean();
    expect(audits.map(({ action }) => action).sort()).toEqual([
      "lead_created", "project_created"
    ]);
    const list = await request(app).get("/api/v1/admin/projects")
      .set("Authorization", bearer("mongo-admin", "admin")).expect(200);
    expect(list.body.data.items).toHaveLength(1);
  });

  it("reads the joined Admin summary inside an explicit Mongo transaction", async () => {
    await Promise.all([
      insertUser("mongo-admin", "admin"),
      insertUser("mongo-estimator", "estimator_sales")
    ]);
    const repository = createMongoRepository();
    const created = await request(createApp({ repository, auth, clock }))
      .post("/api/v1/admin/projects")
      .set("Authorization", bearer("mongo-admin", "admin"))
      .send(input)
      .expect(201);
    const admin = await repository.findUserById("mongo-admin");
    if (!admin) throw new Error("Expected the Admin fixture to exist.");

    const summary = await repository.runInTransaction((transaction) =>
      transaction.findAdminProject(admin, created.body.data.id)
    );

    expect(summary).toMatchObject({
      id: created.body.data.id,
      estimator: { id: "mongo-estimator" },
      lead: { id: created.body.data.lead.id }
    });
  });

  it.each([
    ["createProject", 0],
    ["createProjectAccessGrant", 0],
    ["createLead", 0],
    ["appendAuditEvent", 1],
    ["appendAuditEvent", 2],
    ["appendAuditEvent", 3]
  ] as const)("rolls back every Mongo write when %s failure point %s throws", async (method, auditFailureAt) => {
    await Promise.all([
      insertUser("mongo-admin", "admin"),
      insertUser("mongo-estimator", "estimator_sales")
    ]);
    const base = createMongoRepository();
    let auditCalls = 0;
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        if (property !== "runInTransaction") return Reflect.get(target, property, receiver);
        return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
          target.runInTransaction((transaction) => operation(new Proxy(transaction, {
            get(inner, key, innerReceiver) {
              if (key === method) {
                if (key !== "appendAuditEvent") {
                  return async () => { throw new Error(`injected ${String(key)} failure`); };
                }
                return async (...args: unknown[]) => {
                  auditCalls += 1;
                  if (auditCalls === auditFailureAt) throw new Error("injected audit failure");
                  return (inner.appendAuditEvent as (...values: unknown[]) => unknown)(...args);
                };
              }
              return Reflect.get(inner, key, innerReceiver);
            }
          })));
      }
    });
    const app = createApp({ repository, auth, clock });
    await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer("mongo-admin", "admin"))
      .send(input).expect(500);
    expect(await ProjectModel.countDocuments()).toBe(0);
    expect(await ProjectAccessGrantModel.countDocuments()).toBe(0);
    expect(await LeadModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
});
