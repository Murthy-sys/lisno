import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  sha256Hex,
  type EstimateClientDecision,
  type StoredEstimateClientResponseProof
} from "../src/domain/estimate-client-review.js";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import type { ValidatedUpload } from "../src/middleware/upload.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientResponseProofModel } from "../src/models/EstimateClientResponseProof.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createEstimateClientResponsesRouter } from "../src/routes/estimate-client-responses.js";
import { createAuditService, type AuditService } from "../src/services/audit.service.js";
import {
  authorizationSnapshotFor,
  type AuthService,
  type PublicUser
} from "../src/services/auth.service.js";
import type {
  EstimateClientReviewStorage,
  StoredEstimatePdfSnapshot
} from "../src/services/estimate-client-review-storage.js";
import { createEstimateClientReviewService } from "../src/services/estimate-client-review.service.js";
import {
  createEstimateDecisionService,
  type EstimateDecisionService
} from "../src/services/estimate-decision.service.js";
import type { EstimateDeliveryService } from "../src/services/estimate-delivery.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-08-24T11:00:00.000Z");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const ACTORS = {
  client: actor("task12-client", "client", "client@example.test"),
  admin: actor("task12-admin", "admin"),
  superAdmin: actor("task12-super-admin", "super_admin"),
  estimator: actor("task12-estimator", "estimator_sales"),
  designer: actor("task12-designer", "designer"),
  manager: actor("task12-manager", "design_manager")
} as const;

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("estimate-decision-task12");
  await Promise.all([
    UserModel.syncIndexes(),
    ProjectModel.syncIndexes(),
    ProjectAccessGrantModel.syncIndexes(),
    LeadModel.syncIndexes(),
    EstimateModel.syncIndexes(),
    EstimateClientReviewRoundModel.syncIndexes(),
    EstimateClientResponseProofModel.syncIndexes(),
    AuditEventModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterAll(async () => {
  await replica.stop();
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function actor(
  id: string,
  role: PublicUser["role"],
  email = `${id}@example.test`
): PublicUser {
  return { id, name: id, email, role };
}

async function insertUser(value: PublicUser, managerId: string | null = null) {
  await UserModel.create({
    _id: value.id,
    name: value.name,
    email: value.email,
    emailNormalized: value.email.toLowerCase(),
    passwordHash: "not-used-by-task12",
    role: value.role,
    active: true,
    accountKind: "standard",
    version: 1,
    managerId,
    authorizedClientIds: [],
    createdAt: NOW,
    updatedAt: NOW
  });
}

async function seedDecisionFixture(input: Partial<{
  roundId: string;
  estimateVersion: number;
  roundVersion: number;
  sendGeneration: number;
  roundStatus: "pending" | "approved" | "changes_requested";
  projectLink: "linked" | "unlinked";
}> = {}) {
  const roundId = input.roundId ?? "task12-round";
  const estimateVersion = input.estimateVersion ?? 7;
  const roundVersion = input.roundVersion ?? 4;
  const roundStatus = input.roundStatus ?? "pending";
  const projectId = input.projectLink === "unlinked"
    ? null
    : "task12-decision-project";
  const leadId = "task12-decision-lead";
  const estimateId = "task12-decision-estimate";

  await Promise.all([
    insertUser(ACTORS.client),
    insertUser(ACTORS.admin),
    insertUser(ACTORS.superAdmin),
    insertUser(ACTORS.estimator),
    insertUser(ACTORS.designer, ACTORS.manager.id),
    insertUser(ACTORS.manager)
  ]);
  if (projectId !== null) {
    await ProjectModel.create({
      _id: projectId,
      name: "Task 12 Residence",
      clientId: ACTORS.client.id,
      clientName: "Task 12 Client",
      clientEmail: ACTORS.client.email,
      clientEmailNormalized: ACTORS.client.email,
      clientMobile: "9999999999",
      clientAddress: "Pune",
      initiatingDesignerId: null,
      assignedEstimatorId: ACTORS.estimator.id,
      assignedDesignerIds: [],
      managerId: null,
      status: "planning",
      location: "Pune",
      plannedStartAt: NOW,
      plannedEndAt: new Date("2026-11-24T11:00:00.000Z"),
      createdAt: NOW,
      updatedAt: NOW
    });
    await ProjectAccessGrantModel.create({
      _id: "task12-decision-grant",
      projectId,
      userId: ACTORS.admin.id,
      module: "projects",
      source: "admin_initiator",
      accessRequestId: null,
      grantedById: ACTORS.superAdmin.id,
      active: true,
      grantedAt: NOW,
      revokedAt: null,
      revokedById: null,
      revocationReason: null,
      createdAt: NOW,
      updatedAt: NOW
    });
  }
  await LeadModel.create({
    _id: leadId,
    projectId,
    ownerId: ACTORS.estimator.id,
    clientName: "Task 12 Client",
    clientEmail: ACTORS.client.email,
    clientMobile: "9999999999",
    projectName: "Task 12 Residence",
    location: "Pune",
    propertyType: "Apartment",
    source: "admin_project",
    stage: "estimate_sent",
    nextAction: "client estimate decision",
    nextActionAt: NOW,
    createdAt: NOW,
    updatedAt: NOW
  });
  await EstimateModel.create({
    _id: estimateId,
    leadId,
    ownerId: ACTORS.estimator.id,
    projectId,
    version: estimateVersion,
    designLifecycleVersion: 3,
    designFrozenAt: null,
    status: "sent_to_client",
    propertyType: "Apartment",
    rooms: [],
    scopes: ["interiors"],
    lineItems: [{
      catalogueId: "task12-item",
      roomName: "Living Room",
      specification: "Gypsum ceiling",
      unit: "sqft",
      rate: 125,
      quantity: 100,
      included: true,
      amount: 12_500
    }],
    subtotal: 12_500,
    gst: 2_250,
    total: 14_750,
    approvalRequired: false,
    assignedManagerId: ACTORS.manager.id,
    assignedDesignerId: ACTORS.designer.id,
    submittedAt: NOW,
    sentToClientAt: NOW,
    clientDecisionAt: null,
    reviews: [],
    notifications: [],
    createdAt: NOW,
    updatedAt: NOW
  });

  const terminal = roundStatus !== "pending";
  const decision = roundStatus === "approved" ? "approve" : "request_changes";
  await EstimateClientReviewRoundModel.create({
    _id: roundId,
    estimateId,
    leadId,
    projectId,
    estimateVersion,
    sendGeneration: input.sendGeneration ?? 1,
    dedupeKey: sha256Hex(Buffer.from(`dedupe:${roundId}`)),
    recipientEmail: ACTORS.client.email,
    recipientEmailNormalized: ACTORS.client.email,
    estimateSnapshot: {
      clientName: "Task 12 Client",
      projectName: "Task 12 Residence",
      location: "Pune",
      propertyType: "Apartment",
      lineItems: [{
        catalogueId: "task12-item",
        roomName: "Living Room",
        specification: "Gypsum ceiling",
        unit: "sqft",
        rate: 125,
        quantity: 100,
        included: true,
        amount: 12_500
      }],
      subtotal: 12_500,
      gst: 2_250,
      total: 14_750
    },
    pdfFilename: `task12-estimate-v${estimateVersion}.pdf`,
    pdfMimeType: "application/pdf",
    pdfByteSize: 32,
    pdfSha256: sha256Hex(Buffer.alloc(32, estimateVersion)),
    pdfStorageReference: `task12-pdf-${roundId}`,
    deliveryStatus: "sent",
    deliveryAttemptGeneration: 1,
    deliveryAttemptCount: 1,
    deliveryAttemptedAt: NOW,
    deliveryLeaseExpiresAt: null,
    deliveredAt: NOW,
    deliveryFailureCode: null,
    assignedAdminId: projectId === null
      ? ACTORS.superAdmin.id
      : ACTORS.admin.id,
    status: roundStatus,
    decision: terminal ? decision : null,
    decisionSource: terminal ? "client_portal" : null,
    decisionNote: terminal ? "Prior decision" : null,
    decidedById: terminal ? ACTORS.client.id : null,
    decidedAt: terminal ? NOW : null,
    version: roundVersion,
    createdAt: NOW,
    updatedAt: NOW
  });
  return {
    roundId,
    estimateId,
    leadId,
    projectId,
    estimateVersion,
    roundVersion
  };
}

function createProofStorage(gatedSaves = 0) {
  const objects = new Map<string, Buffer>();
  const saved: string[] = [];
  const deleted: string[] = [];
  const savesReached = deferred<void>();
  const savesReleased = deferred<void>();
  let sequence = 0;

  const storage: EstimateClientReviewStorage = {
    async savePdfSnapshot(): Promise<StoredEstimatePdfSnapshot> {
      throw new Error("PDF save is not used by decision races.");
    },
    async saveProof(upload: ValidatedUpload) {
      sequence += 1;
      const storageReference = `task12-proof-${sequence}${upload.extension}`;
      objects.set(storageReference, Buffer.from(upload.data));
      saved.push(storageReference);
      if (gatedSaves > 0 && sequence <= gatedSaves) {
        if (sequence === gatedSaves) savesReached.resolve();
        await savesReleased.promise;
      }
      return {
        storageReference,
        originalFilename: upload.originalFilename,
        mimeType: upload.mimeType as StoredEstimateClientResponseProof["mimeType"],
        byteSize: upload.data.byteLength,
        sha256: sha256Hex(upload.data)
      };
    },
    async read(reference) {
      const bytes = objects.get(reference);
      if (!bytes) throw new Error("Stored proof not found.");
      return Buffer.from(bytes);
    },
    async deleteQuietly(reference) {
      deleted.push(reference);
      objects.delete(reference);
    }
  };
  return {
    storage,
    objects,
    saved,
    deleted,
    savesReached: savesReached.promise,
    releaseSaves: () => savesReleased.resolve()
  };
}

function createDecisionHarness(input: {
  storage: EstimateClientReviewStorage;
  audit?: AuditService;
}) {
  const reviews = createEstimateClientReviewService({ storage: input.storage });
  const audit = input.audit ?? createAuditService(createMongoRepository());
  const decisions = createEstimateDecisionService({
    audit,
    reviews,
    estimateDesigns: {
      async approvalReadinessForDecision() {
        return {
          ready: true,
          total: 2,
          approved: 2,
          awaitingReview: 0,
          changesRequested: 0
        };
      }
    },
    now: () => new Date(NOW)
  });
  return { reviews, audit, decisions };
}

function createRouter(input: {
  reviews: ReturnType<typeof createEstimateClientReviewService>;
  storage: EstimateClientReviewStorage;
  decisions: EstimateDecisionService;
}) {
  const actorsByToken = new Map(
    Object.values(ACTORS).map((value) => [value.id, value])
  );
  const auth = {
    async authenticate(token: string) {
      const value = actorsByToken.get(token);
      if (!value) throw new Error("Unknown Task 12 actor.");
      return value;
    },
    authorization: authorizationSnapshotFor
  } as AuthService;
  const delivery = {
    async deliverInitial() {
      throw new Error("Delivery is not used by decision races.");
    },
    async retry() {
      throw new Error("Delivery is not used by decision races.");
    }
  } as EstimateDeliveryService;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createEstimateClientResponsesRouter(
    auth,
    input.reviews,
    input.storage,
    input.decisions,
    delivery,
    1024 * 1024
  ));
  app.use(errorHandler);
  return app;
}

function adminDecisionRequest(
  app: express.Express,
  actorValue: PublicUser,
  fixture: Awaited<ReturnType<typeof seedDecisionFixture>>,
  decision: EstimateClientDecision,
  filename: string,
  note = decision === "approve" ? "Signed approval received." : "Please revise."
) {
  return request(app)
    .post(`/api/v1/admin/estimate-client-response-tasks/${fixture.roundId}/decision`)
    .set("Authorization", `Bearer ${actorValue.id}`)
    .field("decision", decision)
    .field("note", note)
    .field("version", String(fixture.roundVersion))
    .attach("proof", JPEG, { filename, contentType: "image/jpeg" });
}

function clientDecision(
  service: EstimateDecisionService,
  fixture: Awaited<ReturnType<typeof seedDecisionFixture>>,
  decision: EstimateClientDecision
) {
  return service.decide({
    estimateId: fixture.estimateId,
    round: { id: fixture.roundId, expectedVersion: fixture.roundVersion },
    decision,
    note: decision === "approve" ? "" : "Move the ceiling edge inward.",
    context: { source: "client_portal", actor: ACTORS.client, proof: null }
  });
}

async function releaseTogether<T>(operations: Array<() => Promise<T>>) {
  const release = deferred<void>();
  let ready = 0;
  const started = operations.map(async (operation) => {
    ready += 1;
    if (ready === operations.length) release.resolve();
    await release.promise;
    return operation();
  });
  return Promise.allSettled(started);
}

function expectApiError(error: unknown, code: string, status: number) {
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ code, status });
}

async function assertSingleDecision(
  fixture: Awaited<ReturnType<typeof seedDecisionFixture>>,
  decision: EstimateClientDecision,
  storage: ReturnType<typeof createProofStorage>,
  expectations: {
    expectedAdminActorId?: string;
    expectedAdminNotes?: readonly string[];
  } = {}
) {
  const round = await EstimateClientReviewRoundModel.findById(fixture.roundId).lean();
  const estimate = await EstimateModel.findById(fixture.estimateId).lean();
  expect(round).toMatchObject({
    status: decision === "approve" ? "approved" : "changes_requested",
    decision,
    version: fixture.roundVersion + 1
  });
  expect(estimate).toMatchObject({
    status: decision === "approve" ? "client_approved" : "client_changes_requested",
    version: fixture.estimateVersion + 1,
    designLifecycleVersion: 4
  });
  expect(["client_portal", "admin_proof"]).toContain(round!.decisionSource);
  const source = round!.decisionSource as "client_portal" | "admin_proof";
  const expectedActorId = source === "admin_proof"
    ? expectations.expectedAdminActorId ?? ACTORS.admin.id
    : ACTORS.client.id;
  const expectedClientNote = decision === "approve"
    ? ""
    : "Move the ceiling edge inward.";
  const expectedAdminNotes = expectations.expectedAdminNotes ?? [
    decision === "approve"
      ? "Signed approval received."
      : "Please revise."
  ];
  const expectedNotes = source === "client_portal"
    ? [expectedClientNote]
    : expectedAdminNotes;
  expect(expectedNotes).toContain(round!.decisionNote);
  expect(round).toMatchObject({
    decidedById: expectedActorId,
    decidedAt: NOW
  });
  const expectedReview = {
    actorId: expectedActorId,
    action: decision === "approve"
      ? "client_approved"
      : "client_changes_requested",
    note: round!.decisionNote,
    occurredAt: NOW
  };
  expect(estimate!.reviews).toEqual([expectedReview]);
  const projects = await ProjectModel.find().lean();
  const lead = await LeadModel.findById(fixture.leadId).lean();

  if (decision === "approve") {
    const committedProjectId = String(estimate!.projectId);

    expect(estimate).toMatchObject({
      leadId: fixture.leadId,
      projectId: committedProjectId,
      clientDecisionAt: NOW,
      designFrozenAt: null,
      designPlanStatus: "pending_assignment",
      designPlanVersion: 0,
      designPlanDesignerId: null,
      designLifecycleVersion: 4,
      reviews: [expectedReview]
    });
    expect(estimate!.notifications).toEqual([]);
    expect(projects).toHaveLength(1);
    expect(String(projects[0]!._id)).toBe(committedProjectId);
    expect(projects[0]).toMatchObject({
      clientId: ACTORS.client.id,
      clientEmailNormalized: ACTORS.client.email,
      assignedDesignerIds: [],
      managerId: null,
      status: "planning"
    });
    expect([ACTORS.admin.id, ACTORS.superAdmin.id]).not.toContain(
      projects[0]!.clientId
    );
    if (fixture.projectId === null) {
      expect(committedProjectId).toMatch(/^project-/);
      expect(lead).toMatchObject({
        _id: fixture.leadId,
        projectId: committedProjectId,
        clientName: "Task 12 Client",
        clientEmail: ACTORS.client.email,
        clientMobile: "9999999999",
        projectName: "Task 12 Residence",
        location: "Pune",
        stage: "won",
        nextAction: "Assign Designer for design plan",
        nextActionAt: NOW
      });
      expect(projects[0]).toMatchObject({
        name: "Task 12 Residence",
        clientName: "Task 12 Client",
        clientEmail: ACTORS.client.email,
        clientMobile: "9999999999",
        clientAddress: "Pune",
        initiatingDesignerId: null,
        assignedEstimatorId: ACTORS.estimator.id,
        location: "Pune",
        plannedStartAt: NOW
      });
    } else {
      expect(committedProjectId).toBe(fixture.projectId);
      expect(lead).toMatchObject({
        _id: fixture.leadId,
        projectId: fixture.projectId,
        stage: "won",
        nextAction: "Assign Designer for design plan",
        nextActionAt: NOW
      });
      expect(projects[0]).toMatchObject({
        _id: fixture.projectId,
        initiatingDesignerId: null,
        assignedEstimatorId: ACTORS.estimator.id
      });
    }
  } else {
    expect(estimate).toMatchObject({
      leadId: fixture.leadId,
      projectId: fixture.projectId,
      clientDecisionAt: NOW,
      designFrozenAt: null,
      designLifecycleVersion: 4,
      reviews: [expectedReview]
    });
    expect(estimate!.notifications).toEqual([]);
    expect(lead).toMatchObject({
      _id: fixture.leadId,
      projectId: fixture.projectId,
      stage: "estimate_sent",
      nextAction: "client estimate decision",
      nextActionAt: NOW
    });
    if (fixture.projectId === null) {
      expect(projects).toEqual([]);
    } else {
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        _id: fixture.projectId,
        name: "Task 12 Residence",
        clientId: ACTORS.client.id,
        clientName: "Task 12 Client",
        clientEmail: ACTORS.client.email,
        clientEmailNormalized: ACTORS.client.email,
        clientMobile: "9999999999",
        clientAddress: "Pune",
        initiatingDesignerId: null,
        assignedEstimatorId: ACTORS.estimator.id,
        assignedDesignerIds: [],
        managerId: null,
        status: "planning",
        location: "Pune",
        plannedStartAt: NOW,
        plannedEndAt: new Date("2026-11-24T11:00:00.000Z")
      });
    }
  }
  const proofs = await EstimateClientResponseProofModel.find()
    .select("+storageReference")
    .lean();
  expect(proofs).toHaveLength(source === "admin_proof" ? 1 : 0);
  const proof = proofs[0] ?? null;
  expect(storage.objects.size).toBe(source === "admin_proof" ? 1 : 0);
  const semanticAction = decision === "approve"
    ? "estimate_design_final_approved"
    : "estimate_design_final_changes_requested";
  const sourceAction = source === "client_portal"
    ? "estimate_client_response_recorded_through_portal"
    : decision === "approve"
      ? "estimate_client_approval_recorded_by_admin"
      : "estimate_client_changes_recorded_by_admin";
  const expectedAudits = [
    {
      action: semanticAction,
      actorId: expectedActorId,
      entityType: "estimate",
      entityId: fixture.estimateId,
      decisionSource: null
    },
    {
      action: sourceAction,
      actorId: expectedActorId,
      entityType: "estimate_client_review_round",
      entityId: fixture.roundId,
      decisionSource: source
    },
    ...(source === "admin_proof"
      ? [{
          action: "estimate_client_proof_stored",
          actorId: expectedActorId,
          entityType: "estimate_client_response_proof",
          entityId: String(proof!._id),
          decisionSource: null
        }]
      : [])
  ].sort((left, right) => left.action.localeCompare(right.action));
  const actualAudits = (await AuditEventModel.find().lean())
    .map((event) => ({
      action: event.action,
      actorId: event.actorId,
      entityType: event.entityType,
      entityId: event.entityId,
      decisionSource:
        (event.newValues as Record<string, unknown>).decisionSource ?? null
    }))
    .sort((left, right) => left.action.localeCompare(right.action));
  expect(actualAudits).toHaveLength(source === "admin_proof" ? 3 : 2);
  expect(actualAudits).toEqual(expectedAudits);
}

async function assertWinningProofIsOnlyReadableObject(
  storage: ReturnType<typeof createProofStorage>
) {
  const proofs = await EstimateClientResponseProofModel.find()
    .select("+storageReference")
    .lean();
  expect(proofs).toHaveLength(1);
  const proof = proofs[0]!;
  const winningReference = String(proof.storageReference);
  const losingReferences = storage.saved.filter(
    (reference) => reference !== winningReference
  );

  expect(storage.saved).toHaveLength(2);
  expect(losingReferences).toHaveLength(1);
  expect(storage.deleted).toEqual(losingReferences);
  expect([...storage.objects.keys()]).toEqual([winningReference]);
  const persistedBytes = await storage.storage.read(winningReference);
  expect(persistedBytes).toEqual(JPEG);
  expect(proof).toMatchObject({
    storageReference: winningReference,
    byteSize: persistedBytes.byteLength,
    sha256: sha256Hex(persistedBytes)
  });
  expect(storage.objects.has(losingReferences[0]!)).toBe(false);
  await expect(storage.storage.read(losingReferences[0]!)).rejects.toThrow(
    "Stored proof not found."
  );
}

describe("Estimate decision races on a Mongo replica set", () => {
  it.each(["approve", "request_changes"] as const)(
    "commits exactly one %s across a simultaneous Client and Admin submission",
    async (decision) => {
      const fixture = await seedDecisionFixture();
      const storage = createProofStorage(1);
      const harness = createDecisionHarness({ storage: storage.storage });
      const app = createRouter({ ...harness, storage: storage.storage });
      const admin = adminDecisionRequest(
        app,
        ACTORS.admin,
        fixture,
        decision,
        `admin-${decision}.jpg`
      ).then((response) => response);
      await storage.savesReached;
      const clientStart = deferred<void>();
      const client = (async () => {
        await clientStart.promise;
        return clientDecision(harness.decisions, fixture, decision);
      })();
      storage.releaseSaves();
      clientStart.resolve();
      const [adminResult, clientResult] = await Promise.allSettled([admin, client]);

      const adminWon = adminResult.status === "fulfilled" && adminResult.value.status === 200;
      const clientWon = clientResult.status === "fulfilled";
      expect(Number(adminWon) + Number(clientWon)).toBe(1);
      if (adminResult.status === "fulfilled") {
        expect([200, 409]).toContain(adminResult.value.status);
      }
      if (clientResult.status === "rejected") {
        expectApiError(clientResult.reason, "ESTIMATE_NOT_REVIEWABLE", 409);
      }
      await assertSingleDecision(fixture, decision, storage);
    }
  );

  it.each(["approve", "request_changes"] as const)(
    "commits one %s and deletes the losing proof across two Admin submissions",
    async (decision) => {
      const fixture = await seedDecisionFixture();
      const storage = createProofStorage(2);
      const harness = createDecisionHarness({ storage: storage.storage });
      const app = createRouter({ ...harness, storage: storage.storage });
      const requests = [
        adminDecisionRequest(
          app,
          ACTORS.admin,
          fixture,
          decision,
          `first-${decision}.jpg`,
          decision === "approve" ? "First signed approval." : "First revision."
        ),
        adminDecisionRequest(
          app,
          ACTORS.admin,
          fixture,
          decision,
          `second-${decision}.jpg`,
          decision === "approve" ? "Second signed approval." : "Second revision."
        )
      ];
      const settledPromise = Promise.allSettled(requests);
      await storage.savesReached;
      storage.releaseSaves();
      const settled = await settledPromise;

      expect(settled.every(({ status }) => status === "fulfilled")).toBe(true);
      const statuses = settled.map((result) =>
        result.status === "fulfilled" ? result.value.status : -1
      ).sort();
      expect(statuses).toEqual([200, 409]);
      await assertSingleDecision(fixture, decision, storage, {
        expectedAdminNotes: decision === "approve"
          ? ["First signed approval.", "Second signed approval."]
          : ["First revision.", "Second revision."]
      });
      await assertWinningProofIsOnlyReadableObject(storage);
    }
  );

  it("creates exactly one linked Project across two unlinked Super Admin approvals", async () => {
    const fixture = await seedDecisionFixture({
      roundId: "task12-unlinked-round",
      projectLink: "unlinked"
    });
    const storage = createProofStorage(2);
    const harness = createDecisionHarness({ storage: storage.storage });
    const app = createRouter({ ...harness, storage: storage.storage });
    const requests = [
      adminDecisionRequest(
        app,
        ACTORS.superAdmin,
        fixture,
        "approve",
        "first-unlinked-approval.jpg",
        "First unlinked signed approval."
      ),
      adminDecisionRequest(
        app,
        ACTORS.superAdmin,
        fixture,
        "approve",
        "second-unlinked-approval.jpg",
        "Second unlinked signed approval."
      )
    ];
    const settledPromise = Promise.allSettled(requests);
    await storage.savesReached;
    storage.releaseSaves();
    const settled = await settledPromise;

    expect(settled.every(({ status }) => status === "fulfilled")).toBe(true);
    const statuses = settled.map((result) =>
      result.status === "fulfilled" ? result.value.status : -1
    ).sort();
    expect(statuses).toEqual([200, 409]);
    await assertSingleDecision(fixture, "approve", storage, {
      expectedAdminActorId: ACTORS.superAdmin.id,
      expectedAdminNotes: [
        "First unlinked signed approval.",
        "Second unlinked signed approval."
      ]
    });
    await assertWinningProofIsOnlyReadableObject(storage);
  });

  it.each(["grant", "admin"] as const)(
    "rechecks %s eligibility after task detail and lets Super Admin retain oversight",
    async (revocation) => {
      const fixture = await seedDecisionFixture();
      const storage = createProofStorage();
      const harness = createDecisionHarness({ storage: storage.storage });
      const app = createRouter({ ...harness, storage: storage.storage });

      await harness.reviews.detail(ACTORS.admin, fixture.roundId);
      if (revocation === "grant") {
        await ProjectAccessGrantModel.updateOne(
          { _id: "task12-decision-grant", active: true },
          {
            $set: {
              active: false,
              revokedAt: NOW,
              revokedById: ACTORS.superAdmin.id,
              revocationReason: "Task 12 revocation"
            }
          }
        );
      } else {
        await UserModel.updateOne(
          { _id: ACTORS.admin.id, active: true },
          { $set: { active: false }, $inc: { version: 1 } }
        );
      }

      const denied = await adminDecisionRequest(
        app,
        ACTORS.admin,
        fixture,
        "request_changes",
        `denied-${revocation}.jpg`
      );
      expect(denied.status).toBe(404);
      expect(storage.saved).toHaveLength(0);
      expect(await EstimateClientResponseProofModel.countDocuments()).toBe(0);
      expect(await EstimateClientReviewRoundModel.findById(fixture.roundId).lean())
        .toMatchObject({ status: "pending", version: fixture.roundVersion });

      const oversight = await adminDecisionRequest(
        app,
        ACTORS.superAdmin,
        fixture,
        "request_changes",
        `super-${revocation}.jpg`
      );
      expect(oversight.status).toBe(200);
      expect(storage.objects.size).toBe(1);
      expect(await EstimateClientResponseProofModel.countDocuments()).toBe(1);
    }
  );

  it("rejects a stale task from an earlier generation and cleans its uploaded proof", async () => {
    const old = await seedDecisionFixture({
      roundId: "task12-round-generation-1",
      estimateVersion: 7,
      roundVersion: 5,
      sendGeneration: 1,
      roundStatus: "changes_requested"
    });
    await EstimateModel.updateOne(
      { _id: old.estimateId },
      {
        $set: { status: "sent_to_client" },
        $inc: { version: 1, designLifecycleVersion: 1 }
      }
    );
    await EstimateClientReviewRoundModel.create({
      ...(await EstimateClientReviewRoundModel.findById(old.roundId)
        .select("+pdfStorageReference")
        .lean()),
      _id: "task12-round-generation-2",
      estimateVersion: 8,
      sendGeneration: 2,
      dedupeKey: sha256Hex(Buffer.from("task12-generation-2")),
      pdfStorageReference: "task12-pdf-generation-2",
      status: "pending",
      decision: null,
      decisionSource: null,
      decisionNote: null,
      decidedById: null,
      decidedAt: null,
      version: 1
    });
    const storage = createProofStorage();
    const harness = createDecisionHarness({ storage: storage.storage });
    const app = createRouter({ ...harness, storage: storage.storage });

    const stale = await adminDecisionRequest(
      app,
      ACTORS.admin,
      old,
      "request_changes",
      "stale-generation.jpg"
    );

    expect(stale.status).toBe(409);
    expect(storage.saved).toHaveLength(1);
    expect(storage.deleted).toEqual(storage.saved);
    expect(storage.objects.size).toBe(0);
    expect(await EstimateClientResponseProofModel.countDocuments()).toBe(0);
    expect(await EstimateClientReviewRoundModel.findById(
      "task12-round-generation-2"
    ).lean()).toMatchObject({ status: "pending", version: 1 });
    expect(await EstimateModel.findById(old.estimateId).lean()).toMatchObject({
      status: "sent_to_client",
      version: 8,
      designLifecycleVersion: 4
    });
  });

  it("rolls back the decision and deletes the stored proof when the final audit fails", async () => {
    const fixture = await seedDecisionFixture();
    const storage = createProofStorage();
    const baseAudit = createAuditService(createMongoRepository());
    const audit: AuditService = {
      ...baseAudit,
      async appendInMongoTransaction(event, session) {
        if (event.action === "estimate_client_proof_stored") {
          throw new Error("injected final proof audit failure");
        }
        return baseAudit.appendInMongoTransaction(event, session);
      }
    };
    const harness = createDecisionHarness({ storage: storage.storage, audit });
    const app = createRouter({ ...harness, storage: storage.storage });

    const response = await adminDecisionRequest(
      app,
      ACTORS.admin,
      fixture,
      "request_changes",
      "rollback-proof.jpg"
    );

    expect(response.status).toBe(500);
    expect(await EstimateClientReviewRoundModel.findById(fixture.roundId).lean())
      .toMatchObject({ status: "pending", version: fixture.roundVersion });
    expect(await EstimateModel.findById(fixture.estimateId).lean()).toMatchObject({
      status: "sent_to_client",
      version: fixture.estimateVersion,
      designLifecycleVersion: 3,
      reviews: []
    });
    expect(await LeadModel.findById(fixture.leadId).lean()).toMatchObject({
      stage: "estimate_sent"
    });
    expect(await EstimateClientResponseProofModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(storage.saved).toHaveLength(1);
    expect(storage.deleted).toEqual(storage.saved);
    expect(storage.objects.size).toBe(0);
  });
});
