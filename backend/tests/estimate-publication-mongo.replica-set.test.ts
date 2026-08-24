import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  sha256Hex,
  type EstimateClientReviewSummary,
  type StoredEstimateClientResponseProof
} from "../src/domain/estimate-client-review.js";
import { ApiError } from "../src/middleware/errors.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientResponseProofModel } from "../src/models/EstimateClientResponseProof.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService, type AuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import type {
  EstimateClientReviewStorage,
  StoredEstimatePdfSnapshot
} from "../src/services/estimate-client-review-storage.js";
import { createEstimateClientReviewService } from "../src/services/estimate-client-review.service.js";
import { createEstimateDecisionService } from "../src/services/estimate-decision.service.js";
import { createEstimateDeliveryService } from "../src/services/estimate-delivery.service.js";
import type { EstimateMailer } from "../src/services/estimate-mailer.js";
import { createEstimatePublicationService } from "../src/services/estimate-publication.service.js";
import type { EstimatePdfInput } from "../src/services/estimate-pdf.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const BASE_TIME = new Date("2026-08-24T10:00:00.000Z");
const ESTIMATOR: PublicUser = {
  id: "task12-estimator",
  name: "Task 12 Estimator",
  email: "task12-estimator@example.test",
  role: "estimator_sales"
};
const ADMIN: PublicUser = {
  id: "task12-admin",
  name: "Task 12 Admin",
  email: "task12-admin@example.test",
  role: "admin"
};
const CLIENT: PublicUser = {
  id: "task12-client",
  name: "Priya Shah",
  email: "client@example.test",
  role: "client"
};

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("estimate-publication-task12");
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

function createReviewStorage(saveGateCount = 0) {
  const objects = new Map<string, Buffer>();
  const saved: string[] = [];
  const deleted: string[] = [];
  const savesReached = deferred<void>();
  const savesReleased = deferred<void>();
  let saveCount = 0;

  const storage: EstimateClientReviewStorage = {
    async savePdfSnapshot({ bytes, filename }): Promise<StoredEstimatePdfSnapshot> {
      saveCount += 1;
      const storageReference = `task12-pdf-${saveCount}.pdf`;
      objects.set(storageReference, Buffer.from(bytes));
      saved.push(storageReference);
      if (saveGateCount > 0 && saveCount <= saveGateCount) {
        if (saveCount === saveGateCount) savesReached.resolve();
        await savesReleased.promise;
      }
      return {
        storageReference,
        filename,
        mimeType: "application/pdf",
        byteSize: bytes.byteLength,
        sha256: sha256Hex(bytes)
      };
    },
    async saveProof(): Promise<StoredEstimateClientResponseProof> {
      throw new Error("Proof storage is not used by publication races.");
    },
    async read(reference) {
      const bytes = objects.get(reference);
      if (!bytes) throw new Error("Stored object not found.");
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

type MailOutcome =
  | { kind: "sent" }
  | { kind: "failed"; failureCode: string }
  | { gate: Deferred<void>; reached: Deferred<void>; result: { kind: "sent" } };

function createSequencedMailer(outcomes: MailOutcome[] = [{ kind: "sent" }]) {
  const attachments: Buffer[] = [];
  const calls: Parameters<Extract<EstimateMailer, { deliveryKind: "local_test" }>["send"]>[0][] = [];
  const mailer: EstimateMailer = {
    deliveryKind: "local_test",
    async send(input) {
      calls.push(input);
      attachments.push(Buffer.from(input.attachment.bytes));
      const outcome = outcomes.shift() ?? { kind: "sent" as const };
      if ("gate" in outcome) {
        outcome.reached.resolve();
        await outcome.gate.promise;
        return outcome.result;
      }
      return outcome;
    }
  };
  return { mailer, calls, attachments };
}

async function insertUser(
  id: string,
  role: PublicUser["role"],
  overrides: Partial<{ active: boolean; email: string }> = {}
) {
  const email = overrides.email ?? `${id}@example.test`;
  await UserModel.create({
    _id: id,
    name: id,
    email,
    emailNormalized: email.toLowerCase(),
    passwordHash: "not-used-by-task12",
    role,
    active: overrides.active ?? true,
    accountKind: "standard",
    version: 1,
    managerId: null,
    authorizedClientIds: [],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME
  });
}

async function seedPublication(overrides: Partial<{
  estimateStatus: "draft" | "ready_for_client";
  estimateVersion: number;
  total: number;
}> = {}) {
  const projectId = "task12-project";
  const leadId = "task12-lead";
  const estimateId = "task12-estimate";
  const estimateVersion = overrides.estimateVersion ?? 3;
  const total = overrides.total ?? 1_416_000;
  await Promise.all([
    insertUser(ESTIMATOR.id, ESTIMATOR.role),
    insertUser(ADMIN.id, ADMIN.role),
    insertUser(CLIENT.id, CLIENT.role, { email: CLIENT.email }),
    insertUser("task12-super-admin", "super_admin")
  ]);
  await ProjectModel.create({
    _id: projectId,
    name: "Task 12 Villa",
    clientId: null,
    clientName: "Priya Shah",
    clientEmail: "client@example.test",
    clientEmailNormalized: "client@example.test",
    clientMobile: "9000000000",
    clientAddress: "Bengaluru",
    initiatingDesignerId: null,
    assignedEstimatorId: ESTIMATOR.id,
    assignedDesignerIds: [],
    managerId: null,
    status: "planning",
    location: "Bengaluru",
    plannedStartAt: BASE_TIME,
    plannedEndAt: new Date("2026-11-24T10:00:00.000Z"),
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME
  });
  await ProjectAccessGrantModel.create({
    _id: "task12-admin-grant",
    projectId,
    userId: ADMIN.id,
    module: "projects",
    source: "admin_initiator",
    accessRequestId: null,
    grantedById: "task12-super-admin",
    active: true,
    grantedAt: BASE_TIME,
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME
  });
  await LeadModel.create({
    _id: leadId,
    projectId,
    ownerId: ESTIMATOR.id,
    clientName: "Priya Shah",
    clientEmail: "Client@Example.TEST",
    clientMobile: "9000000000",
    projectName: "Task 12 Villa",
    location: "Bengaluru",
    propertyType: "villa",
    source: "admin_project",
    stage: "qualified",
    nextAction: "prepare estimate",
    nextActionAt: BASE_TIME,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME
  });
  await EstimateModel.create({
    _id: estimateId,
    leadId,
    ownerId: ESTIMATOR.id,
    projectId,
    version: estimateVersion,
    designLifecycleVersion: 0,
    designFrozenAt: null,
    status: overrides.estimateStatus ?? "draft",
    propertyType: "villa",
    rooms: [],
    scopes: ["interiors"],
    lineItems: [{
      catalogueId: "task12-line",
      roomName: "Living Room",
      specification: "Premium finish",
      unit: "sqft",
      rate: total,
      quantity: 1,
      included: true,
      amount: total
    }],
    subtotal: total,
    gst: 0,
    total,
    approvalRequired: false,
    assignedManagerId: null,
    assignedDesignerId: null,
    submittedAt: null,
    sentToClientAt: null,
    clientDecisionAt: null,
    reviews: [],
    notifications: [],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME
  });
  return { projectId, leadId, estimateId, estimateVersion };
}

function createHarness(input: {
  storage: EstimateClientReviewStorage;
  mailer: EstimateMailer;
  now: () => Date;
  audit?: AuditService;
  deliverInitial?: (roundId: string) => Promise<EstimateClientReviewSummary>;
}) {
  const audit = input.audit ?? createAuditService(createMongoRepository());
  const reviews = createEstimateClientReviewService({ storage: input.storage });
  const delivery = createEstimateDeliveryService({
    reviews,
    storage: input.storage,
    mailer: input.mailer,
    portalUrl: "https://lisno.example/client",
    audit,
    now: input.now
  });
  const pdfInputs: EstimatePdfInput[] = [];
  const publication = createEstimatePublicationService({
    pdf: {
      async generate(pdfInput) {
        pdfInputs.push(structuredClone(pdfInput));
        return {
          bytes: Buffer.from(
            `%PDF-1.7\nestimate=${pdfInput.id};version=${pdfInput.version};total=${pdfInput.total}\n%%EOF`
          ),
          filename: `task12-estimate-v${pdfInput.version}.pdf`
        };
      }
    },
    storage: input.storage,
    reviews,
    audit,
    deliverInitial: input.deliverInitial ?? delivery.deliverInitial,
    now: input.now
  });
  return { audit, reviews, delivery, publication, pdfInputs };
}

function publicationInput(fixture: Awaited<ReturnType<typeof seedPublication>>) {
  return {
    estimateId: fixture.estimateId,
    leadId: fixture.leadId,
    actorId: ESTIMATOR.id,
    expectedEstimateVersion: fixture.estimateVersion,
    expectedStatus: "draft" as const,
    submittedAt: BASE_TIME
  };
}

function expectApiError(error: unknown, code: string, status: number) {
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ code, status });
}

async function selectedRound(roundId: string) {
  return EstimateClientReviewRoundModel.findById(roundId)
    .select("+pdfStorageReference")
    .lean();
}

describe("Estimate publication and delivery on a Mongo replica set", () => {
  it("keeps one publication, task, snapshot, compatibility effect, and mail under a simultaneous duplicate submit", async () => {
    const fixture = await seedPublication();
    const storage = createReviewStorage(2);
    const mail = createSequencedMailer();
    const harness = createHarness({
      storage: storage.storage,
      mailer: mail.mailer,
      now: () => new Date(BASE_TIME)
    });
    const input = publicationInput(fixture);

    const attempts = [
      harness.publication.publishEstimateToClient(input),
      harness.publication.publishEstimateToClient(input)
    ];
    const settledPromise = Promise.allSettled(attempts);
    await storage.savesReached;
    storage.releaseSaves();
    const settled = await settledPromise;

    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<(typeof attempts)[number]>
      > => result.status === "fulfilled"
    );
    expect(fulfilled).toHaveLength(2);
    expect(new Set(fulfilled.map(({ value }) => value.clientReview.id)).size)
      .toBe(1);
    expect(await EstimateClientReviewRoundModel.countDocuments({
      estimateId: fixture.estimateId
    })).toBe(1);
    const [round] = await EstimateClientReviewRoundModel.find({
      estimateId: fixture.estimateId
    }).select("+pdfStorageReference").lean();
    expect(round).toMatchObject({
      sendGeneration: 1,
      estimateVersion: fixture.estimateVersion,
      assignedAdminId: ADMIN.id,
      status: "pending",
      deliveryStatus: "sent"
    });
    expect(storage.saved).toHaveLength(2);
    expect(storage.deleted).toHaveLength(1);
    expect(storage.objects.size).toBe(1);
    expect(storage.objects.has(String(round!.pdfStorageReference))).toBe(true);
    expect(mail.calls).toHaveLength(1);
    expect(mail.attachments).toEqual([
      storage.objects.get(String(round!.pdfStorageReference))
    ]);

    const estimate = await EstimateModel.findById(fixture.estimateId).lean();
    expect(estimate).toMatchObject({ status: "sent_to_client", version: 3 });
    expect(estimate!.reviews).toHaveLength(1);
    expect(estimate!.notifications).toHaveLength(1);
    const lead = await LeadModel.findById(fixture.leadId).lean();
    expect(lead).toMatchObject({
      stage: "estimate_sent",
      nextAction: "client estimate decision"
    });
    const auditActions = (await AuditEventModel.find().lean())
      .map(({ action }) => action)
      .sort();
    expect(auditActions).toEqual([
      "estimate_client_response_task_assigned",
      "estimate_client_review_published",
      "estimate_email_delivery_sent"
    ]);
  });

  it("rejects stale and above-threshold draft publication while allowing the exact approved send once", async () => {
    const fixture = await seedPublication({
      estimateStatus: "ready_for_client",
      total: 1_500_001
    });
    const storage = createReviewStorage();
    const mail = createSequencedMailer();
    const harness = createHarness({
      storage: storage.storage,
      mailer: mail.mailer,
      now: () => new Date(BASE_TIME)
    });

    const settled = await Promise.allSettled([
      harness.publication.publishEstimateToClient({
        ...publicationInput(fixture),
        expectedStatus: "ready_for_client"
      }),
      harness.publication.publishEstimateToClient({
        ...publicationInput(fixture),
        expectedEstimateVersion: fixture.estimateVersion - 1,
        expectedStatus: "ready_for_client"
      })
    ]);

    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(1);
    expect(await EstimateModel.countDocuments({ status: "sent_to_client" })).toBe(1);
    expect(mail.calls).toHaveLength(1);
    expect(storage.objects.size).toBe(1);
  });

  it("preserves generation one bytes and metadata when an edited Estimate publishes generation two", async () => {
    const fixture = await seedPublication();
    const storage = createReviewStorage();
    const mail = createSequencedMailer();
    const harness = createHarness({
      storage: storage.storage,
      mailer: mail.mailer,
      now: () => new Date(BASE_TIME)
    });

    const first = await harness.publication.publishEstimateToClient(
      publicationInput(fixture)
    );
    const firstRound = await selectedRound(first.clientReview.id);
    const firstReference = String(firstRound!.pdfStorageReference);
    const firstBytes = Buffer.from(storage.objects.get(firstReference)!);
    const firstMetadata = {
      sendGeneration: firstRound!.sendGeneration,
      estimateVersion: firstRound!.estimateVersion,
      pdfFilename: firstRound!.pdfFilename,
      pdfByteSize: firstRound!.pdfByteSize,
      pdfSha256: firstRound!.pdfSha256,
      pdfStorageReference: firstReference
    };

    const decision = createEstimateDecisionService({
      audit: harness.audit,
      reviews: harness.reviews,
      estimateDesigns: {
        async approvalReadinessForDecision() {
          throw new Error("Request changes does not inspect approval readiness.");
        }
      },
      now: () => new Date(BASE_TIME)
    });
    await decision.decide({
      estimateId: fixture.estimateId,
      round: {
        id: first.clientReview.id,
        expectedVersion: first.clientReview.version
      },
      decision: "request_changes",
      note: "Please revise.",
      context: { source: "client_portal", actor: CLIENT, proof: null }
    });
    await EstimateModel.updateOne(
      {
        _id: fixture.estimateId,
        status: "client_changes_requested",
        version: 4
      },
      {
        $set: {
          status: "draft",
          total: 1_475_000,
          subtotal: 1_475_000,
          "lineItems.0.rate": 1_475_000,
          "lineItems.0.amount": 1_475_000
        },
        $inc: { version: 1 }
      }
    );

    const second = await harness.publication.publishEstimateToClient({
      ...publicationInput(fixture),
      expectedEstimateVersion: 5
    });
    const secondRound = await selectedRound(second.clientReview.id);
    const reloadedFirst = await selectedRound(first.clientReview.id);
    const secondReference = String(secondRound!.pdfStorageReference);
    const expectedSecondBytes = Buffer.from(
      `%PDF-1.7\nestimate=${fixture.estimateId};version=5;total=1475000\n%%EOF`
    );

    expect(reloadedFirst).toMatchObject(firstMetadata);
    await expect(storage.storage.read(firstReference)).resolves.toEqual(firstBytes);
    expect(secondRound).toMatchObject({
      sendGeneration: 2,
      estimateVersion: 5,
      pdfStorageReference: secondReference,
      pdfByteSize: expectedSecondBytes.byteLength,
      pdfSha256: sha256Hex(expectedSecondBytes)
    });
    expect(secondReference).not.toBe(firstReference);
    expect(secondRound!.pdfSha256).not.toBe(firstRound!.pdfSha256);
    expect(storage.objects.has(secondReference)).toBe(true);
    await expect(storage.storage.read(secondReference)).resolves.toEqual(
      expectedSecondBytes
    );
    expect(storage.objects.get(secondReference)).not.toEqual(firstBytes);
    expect([...storage.objects.keys()].sort()).toEqual(
      [firstReference, secondReference].sort()
    );
    expect(storage.saved).toHaveLength(2);
    expect(storage.deleted).toHaveLength(0);
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(2);
    expect(mail.calls).toHaveLength(2);
    expect(mail.attachments).toEqual([firstBytes, expectedSecondBytes]);
  });

  it("rolls back publication and deletes the saved snapshot when a transactional audit fails", async () => {
    const fixture = await seedPublication();
    const storage = createReviewStorage();
    const mail = createSequencedMailer();
    const baseAudit = createAuditService(createMongoRepository());
    const audit: AuditService = {
      ...baseAudit,
      async appendInMongoTransaction(event, session) {
        if (event.action === "estimate_client_response_task_assigned") {
          throw new Error("injected publication audit failure");
        }
        return baseAudit.appendInMongoTransaction(event, session);
      }
    };
    const harness = createHarness({
      storage: storage.storage,
      mailer: mail.mailer,
      audit,
      now: () => new Date(BASE_TIME)
    });

    const error = await harness.publication
      .publishEstimateToClient(publicationInput(fixture))
      .catch((caught) => caught);

    expectApiError(error, "ESTIMATE_PUBLICATION_RECOVERY_FAILED", 500);
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await EstimateModel.findById(fixture.estimateId).lean()).toMatchObject({
      status: "draft",
      version: 3,
      reviews: [],
      notifications: []
    });
    expect(await LeadModel.findById(fixture.leadId).lean()).toMatchObject({
      stage: "qualified",
      nextAction: "prepare estimate"
    });
    expect(storage.saved).toHaveLength(1);
    expect(storage.deleted).toEqual(storage.saved);
    expect(storage.objects.size).toBe(0);
    expect(mail.calls).toHaveLength(0);
  });

  it("allows only one concurrent retry lease and one exact stored-byte SMTP attempt", async () => {
    const fixture = await seedPublication();
    const storage = createReviewStorage();
    const retryGate = deferred<void>();
    const retryReached = deferred<void>();
    const mail = createSequencedMailer([
      { kind: "failed", failureCode: "SMTP_REJECTED" },
      { gate: retryGate, reached: retryReached, result: { kind: "sent" } }
    ]);
    const harness = createHarness({
      storage: storage.storage,
      mailer: mail.mailer,
      now: () => new Date(BASE_TIME)
    });
    const published = await harness.publication.publishEstimateToClient(
      publicationInput(fixture)
    );
    const failed = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).lean();

    const attempts = [
      harness.delivery.retry(ESTIMATOR, {
        estimateId: fixture.estimateId,
        roundId: published.clientReview.id,
        version: failed!.version
      }),
      harness.delivery.retry(ESTIMATOR, {
        estimateId: fixture.estimateId,
        roundId: published.clientReview.id,
        version: failed!.version
      })
    ];
    const settledPromise = Promise.allSettled(attempts);
    await retryReached.promise;
    retryGate.resolve();
    const settled = await settledPromise;

    const fulfilled = settled.filter(({ status }) => status === "fulfilled");
    const rejected = settled.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expectApiError(rejected[0]!.reason, "ESTIMATE_EMAIL_RETRY_CONFLICT", 409);
    expect((rejected[0]!.reason as Error).message).toBe(
      "Email delivery state changed. Refresh and try again."
    );
    const round = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).select("+pdfStorageReference").lean();
    expect(round).toMatchObject({
      deliveryStatus: "sent",
      deliveryAttemptGeneration: 2,
      deliveryAttemptCount: 2
    });
    expect(mail.calls).toHaveLength(2);
    expect(mail.attachments[1]).toEqual(
      storage.objects.get(String(round!.pdfStorageReference))
    );
    expect(await AuditEventModel.countDocuments({
      action: "estimate_email_retry_requested"
    })).toBe(1);
    expect(await AuditEventModel.countDocuments({
      action: "estimate_email_delivery_sent"
    })).toBe(1);
    expect((await EstimateModel.findById(fixture.estimateId).lean())!.version)
      .toBe(fixture.estimateVersion);
  });

  it("recovers a committed queued publication that was never leased with one exact stored-byte retry", async () => {
    const fixture = await seedPublication();
    const storage = createReviewStorage();
    const mail = createSequencedMailer();
    const harness = createHarness({
      storage: storage.storage,
      mailer: mail.mailer,
      now: () => new Date(BASE_TIME),
      deliverInitial: async (roundId) => ({
        id: roundId,
        sendGeneration: 1,
        estimateVersion: fixture.estimateVersion,
        version: 1,
        deliveryStatus: "queued",
        deliveryAttemptCount: 0,
        deliveredAt: null,
        status: "pending"
      })
    });
    const published = await harness.publication.publishEstimateToClient(
      publicationInput(fixture)
    );
    const queued = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).select("+pdfStorageReference").lean();
    expect(queued).toMatchObject({
      deliveryStatus: "queued",
      deliveryAttemptGeneration: 1,
      deliveryAttemptCount: 0,
      deliveryAttemptedAt: null,
      deliveryLeaseExpiresAt: null,
      version: 1,
      status: "pending"
    });
    expect(mail.calls).toHaveLength(0);

    const attempts = [
      harness.delivery.retry(ESTIMATOR, {
        estimateId: fixture.estimateId,
        roundId: published.clientReview.id,
        version: queued!.version
      }),
      harness.delivery.retry(ESTIMATOR, {
        estimateId: fixture.estimateId,
        roundId: published.clientReview.id,
        version: queued!.version
      })
    ];
    const settled = await Promise.allSettled(attempts);

    const fulfilled = settled.filter(({ status }) => status === "fulfilled");
    const rejected = settled.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expectApiError(rejected[0]!.reason, "ESTIMATE_EMAIL_RETRY_CONFLICT", 409);
    const recovered = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).select("+pdfStorageReference").lean();
    expect(recovered).toMatchObject({
      deliveryStatus: "sent",
      deliveryAttemptGeneration: 2,
      deliveryAttemptCount: 1,
      deliveryLeaseExpiresAt: null,
      version: 3,
      status: "pending"
    });
    expect(mail.calls).toHaveLength(1);
    expect(mail.attachments).toEqual([
      storage.objects.get(String(recovered!.pdfStorageReference))
    ]);
    expect(await AuditEventModel.countDocuments({
      action: "estimate_email_retry_requested"
    })).toBe(1);
    expect(await AuditEventModel.countDocuments({
      action: "estimate_email_delivery_sent"
    })).toBe(1);
  });

  it("completes the exact in-flight generation after the review resolves", async () => {
    const fixture = await seedPublication();
    const storage = createReviewStorage();
    const retryGate = deferred<void>();
    const retryReached = deferred<void>();
    const mail = createSequencedMailer([
      { kind: "failed", failureCode: "SMTP_REJECTED" },
      { gate: retryGate, reached: retryReached, result: { kind: "sent" } }
    ]);
    const harness = createHarness({
      storage: storage.storage,
      mailer: mail.mailer,
      now: () => new Date(BASE_TIME)
    });
    const published = await harness.publication.publishEstimateToClient(
      publicationInput(fixture)
    );
    const failed = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).lean();
    const retry = harness.delivery.retry(ESTIMATOR, {
      estimateId: fixture.estimateId,
      roundId: published.clientReview.id,
      version: failed!.version
    });

    await retryReached.promise;
    await EstimateClientReviewRoundModel.updateOne(
      { _id: published.clientReview.id, status: "pending" },
      {
        $set: {
          status: "approved",
          decision: "approve",
          decisionSource: "client_portal",
          decisionNote: "",
          decidedById: "task12-client",
          decidedAt: BASE_TIME
        },
        $inc: { version: 1 }
      }
    );
    retryGate.resolve();
    await retry;

    const round = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).lean();
    expect(round).toMatchObject({
      status: "approved",
      deliveryStatus: "sent",
      deliveryAttemptGeneration: 2
    });
    expect(await AuditEventModel.countDocuments({
      action: "estimate_email_delivery_sent"
    })).toBe(1);
  });

  it("makes an older in-flight completion a telemetry and audit no-op after a newer generation finishes", async () => {
    const fixture = await seedPublication();
    const storage = createReviewStorage();
    const oldGate = deferred<void>();
    const oldReached = deferred<void>();
    const mail = createSequencedMailer([
      { kind: "failed", failureCode: "SMTP_REJECTED" },
      { gate: oldGate, reached: oldReached, result: { kind: "sent" } },
      { kind: "sent" }
    ]);
    let currentTime = new Date(BASE_TIME);
    const harness = createHarness({
      storage: storage.storage,
      mailer: mail.mailer,
      now: () => new Date(currentTime)
    });
    const published = await harness.publication.publishEstimateToClient(
      publicationInput(fixture)
    );
    const failed = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).lean();
    const oldRetry = harness.delivery.retry(ESTIMATOR, {
      estimateId: fixture.estimateId,
      roundId: published.clientReview.id,
      version: failed!.version
    });

    await oldReached.promise;
    currentTime = new Date(BASE_TIME.getTime() + 31_000);
    const oldLease = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).lean();
    const newer = await harness.delivery.retry(ESTIMATOR, {
      estimateId: fixture.estimateId,
      roundId: published.clientReview.id,
      version: oldLease!.version
    });
    expect(newer).toMatchObject({ deliveryStatus: "sent" });
    const roundBeforeOldCompletion = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).select("+pdfStorageReference").lean();
    const auditsBeforeOldCompletion = await AuditEventModel.find()
      .sort({ _id: 1 })
      .lean();
    oldGate.resolve();
    await oldRetry;

    const roundAfterOldCompletion = await EstimateClientReviewRoundModel.findById(
      published.clientReview.id
    ).select("+pdfStorageReference").lean();
    const auditsAfterOldCompletion = await AuditEventModel.find()
      .sort({ _id: 1 })
      .lean();
    expect(roundBeforeOldCompletion).toMatchObject({
      deliveryStatus: "sent",
      deliveryAttemptGeneration: 3,
      deliveryAttemptCount: 3
    });
    expect(roundAfterOldCompletion).toEqual(roundBeforeOldCompletion);
    expect(auditsAfterOldCompletion).toEqual(auditsBeforeOldCompletion);
    expect(auditsBeforeOldCompletion.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "estimate_email_retry_requested",
        "estimate_email_delivery_sent"
      ])
    );
    expect(auditsBeforeOldCompletion.filter(
      ({ action }) => action === "estimate_email_retry_requested"
    )).toHaveLength(2);
    expect(auditsBeforeOldCompletion.filter(
      ({ action }) => action === "estimate_email_delivery_sent"
    )).toHaveLength(1);
  });
});
