import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { EmailCoordinationModel } from "../src/models/EmailCoordination.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
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
    EmailCoordinationModel.syncIndexes(),
    EstimateClientReviewRoundModel.syncIndexes()
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

  it("returns the same approved Estimate lineage for Lead-only and direct-only Mongo projects", async () => {
    await Promise.all([
      insertUser("mongo-super-admin", "super_admin"),
      insertUser("mongo-estimator", "estimator_sales")
    ]);
    await Promise.all([
      insertAdminProject("mongo-legacy-project", "Mongo Legacy Project"),
      insertAdminProject("mongo-direct-project", "Mongo Direct Project")
    ]);
    await insertAdminLead("mongo-legacy-lead", "mongo-legacy-project");
    await Promise.all([
      insertApprovedEstimate({
        id: "mongo-legacy-estimate",
        leadId: "mongo-legacy-lead",
        projectId: null,
        version: 5,
        subtotal: 300_000,
        gst: 54_000,
        total: 354_000,
        clientDecisionAt: "2026-08-26T09:00:00.000Z"
      }),
      insertApprovedEstimate({
        id: "mongo-direct-estimate",
        leadId: "mongo-unmigrated-lead",
        projectId: "mongo-direct-project",
        version: 8,
        subtotal: 500_000,
        gst: 90_000,
        total: 590_000,
        clientDecisionAt: "2026-08-25T09:00:00.000Z"
      })
    ]);
    await insertApprovedReviewRound({
      id: "mongo-legacy-review",
      estimateId: "mongo-legacy-estimate",
      leadId: "mongo-legacy-lead",
      projectId: "mongo-legacy-project",
      estimateVersion: 4,
      decisionSource: "admin_proof",
      subtotal: 236_190,
      gst: 42_514,
      total: 278_704
    });
    const app = createApp({ repository: createMongoRepository(), auth, clock });

    const legacy = await request(app)
      .get("/api/v1/admin/projects/mongo-legacy-project")
      .set("Authorization", bearer("mongo-super-admin", "super_admin"))
      .expect(200);
    expect(legacy.body.data.estimate).toMatchObject({
      id: "mongo-legacy-estimate",
      leadId: "mongo-legacy-lead",
      projectId: null,
      resolvedProjectId: "mongo-legacy-project",
      projectLinkSource: "lead",
      version: 5,
      subtotal: 300_000,
      gst: 54_000,
      total: 354_000,
      clientDecisionAt: "2026-08-26T09:00:00.000Z",
      clientDecisionSource: "admin_proof",
      clientReview: { id: "mongo-legacy-review", status: "approved" },
      approvedBaseline: {
        estimateVersion: 4,
        reviewRoundId: "mongo-legacy-review",
        subtotal: 236_190,
        gst: 42_514,
        total: 278_704,
        decisionAt: NOW,
        decisionSource: "admin_proof"
      }
    });

    const direct = await request(app)
      .get("/api/v1/admin/projects/mongo-direct-project")
      .set("Authorization", bearer("mongo-super-admin", "super_admin"))
      .expect(200);
    expect(direct.body.data).toMatchObject({
      lead: null,
      estimate: {
        id: "mongo-direct-estimate",
        leadId: "mongo-unmigrated-lead",
        projectId: "mongo-direct-project",
        resolvedProjectId: "mongo-direct-project",
        projectLinkSource: "estimate",
        version: 8,
        subtotal: 500_000,
        gst: 90_000,
        total: 590_000,
        clientDecisionAt: "2026-08-25T09:00:00.000Z",
        clientDecisionSource: null,
        approvedBaseline: {
          estimateVersion: 7,
          reviewRoundId: null,
          subtotal: 500_000,
          gst: 90_000,
          total: 590_000,
          decisionAt: "2026-08-25T09:00:00.000Z",
          decisionSource: null
        }
      }
    });
  });

  it("rejects a Mongo Estimate whose direct project and foreign Lead project conflict", async () => {
    await Promise.all([
      insertUser("mongo-super-admin", "super_admin"),
      insertUser("mongo-estimator", "estimator_sales")
    ]);
    await Promise.all([
      insertAdminProject("mongo-lead-project", "Mongo Lead Project"),
      insertAdminProject("mongo-direct-project", "Mongo Direct Project")
    ]);
    await insertAdminLead("mongo-conflict-lead", "mongo-lead-project");
    await insertApprovedEstimate({
      id: "mongo-conflict-estimate",
      leadId: "mongo-conflict-lead",
      projectId: "mongo-direct-project",
      version: 3,
      subtotal: 100_000,
      gst: 18_000,
      total: 118_000,
      clientDecisionAt: "2026-08-26T09:00:00.000Z"
    });
    const app = createApp({ repository: createMongoRepository(), auth, clock });

    const response = await request(app)
      .get("/api/v1/admin/projects/mongo-direct-project")
      .set("Authorization", bearer("mongo-super-admin", "super_admin"))
      .expect(409);
    expect(response.body).toEqual({
      error: {
        code: "FINANCE_ESTIMATE_PROJECT_LINK_CONFLICT",
        message: "An approved Estimate is linked to different projects through its Estimate and Lead."
      }
    });
  });

  it("rejects multiple approved review snapshots for the inferred approval version", async () => {
    await Promise.all([
      insertUser("mongo-super-admin", "super_admin"),
      insertUser("mongo-estimator", "estimator_sales")
    ]);
    await insertAdminProject("mongo-duplicate-baseline", "Duplicate Baseline");
    await insertAdminLead("mongo-duplicate-lead", "mongo-duplicate-baseline");
    await insertApprovedEstimate({
      id: "mongo-duplicate-estimate",
      leadId: "mongo-duplicate-lead",
      projectId: "mongo-duplicate-baseline",
      version: 5,
      subtotal: 100_000,
      gst: 18_000,
      total: 118_000,
      clientDecisionAt: "2026-08-26T09:00:00.000Z"
    });
    for (const sendGeneration of [1, 2]) {
      await insertApprovedReviewRound({
        id: `mongo-duplicate-review-${sendGeneration}`,
        estimateId: "mongo-duplicate-estimate",
        leadId: "mongo-duplicate-lead",
        projectId: "mongo-duplicate-baseline",
        estimateVersion: 4,
        decisionSource: "admin_proof",
        subtotal: 100_000,
        gst: 18_000,
        total: 118_000,
        sendGeneration
      });
    }
    const app = createApp({ repository: createMongoRepository(), auth, clock });

    const response = await request(app)
      .get("/api/v1/admin/projects/mongo-duplicate-baseline")
      .set("Authorization", bearer("mongo-super-admin", "super_admin"))
      .expect(409);
    expect(response.body.error).toEqual({
      code: "ESTIMATE_APPROVAL_BASELINE_CONFLICT",
      message: "The approved Estimate does not have exactly one matching approval snapshot."
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

async function insertAdminProject(id: string, name: string) {
  await ProjectModel.create({
    _id: id,
    name,
    clientId: null,
    clientName: "Mongo Client",
    clientEmail: `${id}@client.test`,
    clientEmailNormalized: `${id}@client.test`,
    clientMobile: "9000000000",
    clientAddress: "Bengaluru",
    initiatingDesignerId: null,
    assignedEstimatorId: "mongo-estimator",
    assignedDesignerIds: [],
    managerId: null,
    status: "planning",
    location: "Bengaluru",
    plannedStartAt: new Date(NOW),
    plannedEndAt: new Date("2026-11-24T10:00:00.000Z"),
    actualStartAt: null,
    actualEndAt: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

async function insertAdminLead(id: string, projectId: string) {
  await LeadModel.create({
    _id: id,
    projectId,
    ownerId: "mongo-estimator",
    clientName: "Mongo Client",
    clientEmail: `${projectId}@client.test`,
    clientMobile: "9000000000",
    projectName: projectId,
    location: "Bengaluru",
    propertyType: "villa",
    budgetMin: 200_000,
    budgetMax: 600_000,
    source: "legacy",
    stage: "won",
    nextAction: "Assign Designer",
    nextActionAt: new Date(NOW),
    builder: null,
    areaSqft: null,
    targetHandoverAt: null,
    notes: null,
    latestActivityAt: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

async function insertApprovedEstimate(input: {
  id: string;
  leadId: string;
  projectId: string | null;
  version: number;
  subtotal: number;
  gst: number;
  total: number;
  clientDecisionAt: string;
}) {
  await EstimateModel.create({
    _id: input.id,
    leadId: input.leadId,
    ownerId: "mongo-estimator",
    version: input.version,
    status: "client_approved",
    propertyType: "villa",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: input.subtotal,
    gst: input.gst,
    total: input.total,
    approvalRequired: false,
    projectId: input.projectId,
    reviews: [{
      actorId: "mongo-super-admin",
      action: "client_approved",
      note: "Approved",
      occurredAt: new Date(input.clientDecisionAt)
    }],
    designPlanStatus: "pending_assignment",
    designPlanVersion: 0,
    clientDecisionAt: new Date(input.clientDecisionAt),
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
    updatedAt: new Date(input.clientDecisionAt)
  });
}

async function insertApprovedReviewRound(input: {
  id: string;
  estimateId: string;
  leadId: string;
  projectId: string;
  estimateVersion: number;
  decisionSource: "client_portal" | "admin_proof";
  subtotal: number;
  gst: number;
  total: number;
  sendGeneration?: number;
}) {
  const sendGeneration = input.sendGeneration ?? 1;
  await EstimateClientReviewRoundModel.create({
    _id: input.id,
    estimateId: input.estimateId,
    leadId: input.leadId,
    projectId: input.projectId,
    estimateVersion: input.estimateVersion,
    sendGeneration,
    dedupeKey: String(sendGeneration).padStart(64, "a"),
    recipientEmail: "mongo-client@example.test",
    recipientEmailNormalized: "mongo-client@example.test",
    estimateSnapshot: {
      clientName: "Mongo Client",
      projectName: input.projectId,
      location: "Bengaluru",
      propertyType: "villa",
      lineItems: [],
      subtotal: input.subtotal,
      gst: input.gst,
      total: input.total
    },
    pdfFilename: "approved-estimate.pdf",
    pdfMimeType: "application/pdf",
    pdfByteSize: 100,
    pdfSha256: "b".repeat(64),
    pdfStorageReference: "review/approved-estimate.pdf",
    deliveryStatus: "sent",
    deliveryAttemptGeneration: 1,
    deliveryAttemptCount: 1,
    deliveryAttemptedAt: new Date(NOW),
    deliveredAt: new Date(NOW),
    assignedAdminId: "mongo-super-admin",
    status: "approved",
    decision: "approve",
    decisionSource: input.decisionSource,
    decisionNote: "Approved with recorded proof.",
    decidedById: "mongo-super-admin",
    decidedAt: new Date(NOW),
    version: 2,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}
