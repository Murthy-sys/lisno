import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { sha256Hex } from "../src/domain/estimate-client-review.js";
import { ApiError } from "../src/middleware/errors.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientResponseProofModel } from "../src/models/EstimateClientResponseProof.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import {
  createEstimateClientReviewService
} from "../src/services/estimate-client-review.service.js";
import type { EstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-08-24T10:00:00.000Z");
const LATER = new Date("2026-08-24T11:00:00.000Z");
const session = {} as mongoose.ClientSession;

const actors = {
  admin: {
    id: "admin-1",
    name: "Arjun Admin",
    email: "admin@example.com",
    role: "admin"
  },
  superAdmin: {
    id: "super-1",
    name: "Sonal Super",
    email: "super@example.com",
    role: "super_admin"
  },
  estimator: {
    id: "estimator-1",
    name: "Esha Estimator",
    email: "estimator@example.com",
    role: "estimator_sales"
  },
  foreignEstimator: {
    id: "estimator-2",
    name: "Farah Estimator",
    email: "foreign@example.com",
    role: "estimator_sales"
  },
  client: {
    id: "client-1",
    name: "Priya Client",
    email: "  CLIENT@Example.COM ",
    role: "client"
  }
} satisfies Record<string, PublicUser>;

function storageDouble(): EstimateClientReviewStorage {
  return {
    savePdfSnapshot: vi.fn(),
    saveProof: vi.fn(),
    read: vi.fn(async (reference: string) => Buffer.from(`bytes:${reference}`)),
    deleteQuietly: vi.fn()
  };
}

function aggregateResult<T>(result: T) {
  const exec = vi.fn(async () => result);
  const aggregate = {
    session: vi.fn(() => aggregate),
    exec
  };
  return aggregate;
}

function pipelineText(pipeline: unknown): string {
  return JSON.stringify(pipeline);
}

function expectSafeNotFound(error: unknown) {
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 404,
    code: "NOT_FOUND",
    message: "The requested resource was not found."
  });
}

function listRow() {
  return {
    id: "round-1",
    version: 2,
    sendGeneration: 3,
    project: { id: "project-1", name: "Aurora Villa" },
    client: { name: "Priya Shah", email: "client@example.com" },
    estimate: { id: "estimate-1", version: 4, total: 1416 },
    assignedAdmin: { id: "admin-1", name: "Arjun Admin" },
    deliveryStatus: "sent",
    deliveryAttemptCount: 1,
    deliveryAttemptedAt: NOW,
    deliveredAt: LATER,
    status: "pending",
    decision: null,
    proofAvailable: false,
    createdAt: NOW
  };
}

function detailRow() {
  return {
    ...listRow(),
    estimateSnapshot: {
      clientName: "Priya Shah",
      projectName: "Aurora Villa",
      location: "Bengaluru",
      propertyType: "Villa",
      lineItems: [
        {
          catalogueId: "catalogue-1",
          roomName: "Living Room",
          specification: "Premium finish",
          unit: "sqft",
          rate: 120,
          quantity: 10,
          included: true,
          amount: 1200
        }
      ],
      subtotal: 1200,
      gst: 216,
      total: 1416
    },
    pdf: {
      filename: "estimate-v4.pdf",
      mimeType: "application/pdf",
      byteSize: 2048,
      sha256: "a".repeat(64)
    },
    decisionSource: null,
    decisionNote: null,
    decidedBy: null,
    decidedAt: null
  };
}

describe("estimate client review assignee resolution", () => {
  afterEach(() => vi.restoreAllMocks());

  it("assigns the only active projects-module admin initiator", async () => {
    const grantAggregate = aggregateResult([{ assignedAdminId: "admin-1" }]);
    const grantSpy = vi
      .spyOn(ProjectAccessGrantModel, "aggregate")
      .mockReturnValue(grantAggregate as never);
    const userSpy = vi.spyOn(UserModel, "aggregate");
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(service.resolveReviewAssignee("project-1", session)).resolves.toEqual({
      assignedAdminId: "admin-1",
      source: "admin_initiator"
    });

    const pipeline = grantSpy.mock.calls[0]![0];
    expect(pipeline[0]).toEqual({
      $match: {
        projectId: "project-1",
        module: "projects",
        source: "admin_initiator",
        active: true
      }
    });
    expect(pipelineText(pipeline)).toContain('"role":"admin"');
    expect(pipelineText(pipeline)).toContain('"active":true');
    expect(pipelineText(pipeline)).toContain('"$limit":2');
    expect(grantAggregate.session).toHaveBeenCalledWith(session);
    expect(userSpy).not.toHaveBeenCalled();
  });

  it("excludes inactive, revoked, wrong-module, and wrong-role grants before falling back", async () => {
    const grantAggregate = aggregateResult([]);
    vi.spyOn(ProjectAccessGrantModel, "aggregate").mockReturnValue(grantAggregate as never);
    const superAggregate = aggregateResult([{ assignedAdminId: "super-1" }]);
    vi.spyOn(UserModel, "aggregate").mockReturnValue(superAggregate as never);
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(service.resolveReviewAssignee("project-1", session)).resolves.toEqual({
      assignedAdminId: "super-1",
      source: "super_admin_fallback"
    });

    const grantPipeline = vi.mocked(ProjectAccessGrantModel.aggregate).mock.calls[0]![0];
    expect(grantPipeline[0]).toEqual({
      $match: {
        projectId: "project-1",
        module: "projects",
        source: "admin_initiator",
        active: true
      }
    });
    expect(pipelineText(grantPipeline)).toContain('"role":"admin"');
    expect(pipelineText(grantPipeline)).toContain('"active":true');
    expect(superAggregate.session).toHaveBeenCalledWith(session);
  });

  it("uses the sole active Super Admin for a projectless estimate", async () => {
    const grantSpy = vi.spyOn(ProjectAccessGrantModel, "aggregate");
    const superAggregate = aggregateResult([{ assignedAdminId: "super-1" }]);
    vi.spyOn(UserModel, "aggregate").mockReturnValue(superAggregate as never);
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(service.resolveReviewAssignee(null, session)).resolves.toEqual({
      assignedAdminId: "super-1",
      source: "super_admin_fallback"
    });
    expect(grantSpy).not.toHaveBeenCalled();
  });

  it("fails closed when two eligible initiators exist", async () => {
    vi.spyOn(ProjectAccessGrantModel, "aggregate").mockReturnValue(
      aggregateResult([
        { assignedAdminId: "admin-1" },
        { assignedAdminId: "admin-2" }
      ]) as never
    );
    const userSpy = vi.spyOn(UserModel, "aggregate");
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(service.resolveReviewAssignee("project-1", session)).rejects.toMatchObject({
      status: 409,
      code: "REVIEW_ASSIGNMENT_CONFLICT"
    });
    expect(userSpy).not.toHaveBeenCalled();
  });

  it.each([
    { label: "absent", rows: [] },
    {
      label: "ambiguous",
      rows: [{ assignedAdminId: "super-1" }, { assignedAdminId: "super-2" }]
    }
  ])(
    "fails safely when the active Super Admin invariant is $label",
    async ({ rows }) => {
      vi.spyOn(ProjectAccessGrantModel, "aggregate").mockReturnValue(
        aggregateResult([]) as never
      );
      vi.spyOn(UserModel, "aggregate").mockReturnValue(
        aggregateResult(rows) as never
      );
      const service = createEstimateClientReviewService({ storage: storageDouble() });

      await expect(service.resolveReviewAssignee("project-1", session)).rejects.toMatchObject({
        status: 500,
        code: "REVIEW_ASSIGNMENT_INVARIANT",
        message: "A review assignee could not be resolved."
      });
    }
  );
});

describe("estimate client review scoped queries", () => {
  afterEach(() => vi.restoreAllMocks());

  it("applies every current Admin scope predicate before count and pagination", async () => {
    const roundAggregate = aggregateResult([{ items: [listRow()], count: [{ total: 1 }] }]);
    const aggregateSpy = vi
      .spyOn(EstimateClientReviewRoundModel, "aggregate")
      .mockReturnValue(roundAggregate as never);
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(
      service.list(actors.admin, { status: "pending" }, { limit: 20, offset: 40 })
    ).resolves.toEqual({
      items: [
        {
          ...listRow(),
          deliveryAttemptedAt: NOW.toISOString(),
          deliveredAt: LATER.toISOString(),
          createdAt: NOW.toISOString()
        }
      ],
      total: 1
    });

    const pipeline = aggregateSpy.mock.calls[0]![0];
    const facetIndex = pipeline.findIndex((stage) => "$facet" in stage);
    expect(facetIndex).toBeGreaterThan(0);
    const scopeText = pipelineText(pipeline.slice(0, facetIndex));
    expect(scopeText).toContain('"assignedAdminId":"admin-1"');
    expect(scopeText).toContain('"projectId":{"$type":"string"}');
    expect(scopeText).toContain('"source":"admin_initiator"');
    expect(scopeText).toContain('"module":"projects"');
    expect(scopeText).toContain('"active":true');
    expect(scopeText).toContain('"role":"admin"');
    expect(scopeText).toContain('"$_id","$$actorId"');
    expect(scopeText).toContain('"$projectId","$$roundProjectId"');
    expect(scopeText).toContain('"status":"pending"');

    const facet = pipeline[facetIndex]!.$facet as Record<string, unknown[]>;
    expect(facet.count).toEqual([{ $count: "total" }]);
    expect(facet.items).toEqual(
      expect.arrayContaining([
        { $set: { pendingRank: { $cond: [{ $eq: ["$status", "pending"] }, 0, 1] } } },
        { $sort: { pendingRank: 1, createdAt: -1, _id: 1 } },
        { $skip: 40 },
        { $limit: 20 }
      ])
    );
    const itemsText = pipelineText(facet.items);
    expect(itemsText).not.toContain("pdfStorageReference");
    expect(itemsText).not.toContain("deliveryFailureCode");
    expect(itemsText).not.toContain("decisionNote");
  });

  it("gives an active stored Super Admin oversight without assignment narrowing", async () => {
    const roundAggregate = aggregateResult([{ items: [], count: [] }]);
    const aggregateSpy = vi
      .spyOn(EstimateClientReviewRoundModel, "aggregate")
      .mockReturnValue(roundAggregate as never);
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(
      service.list(actors.superAdmin, {}, { limit: 10, offset: 0 })
    ).resolves.toEqual({ items: [], total: 0 });

    const pipeline = aggregateSpy.mock.calls[0]![0];
    const facetIndex = pipeline.findIndex((stage) => "$facet" in stage);
    const scopeText = pipelineText(pipeline.slice(0, facetIndex));
    expect(scopeText).toContain('"actorId":{"$literal":"super-1"}');
    expect(scopeText).toContain('"role":"super_admin"');
    expect(scopeText).toContain('"active":true');
    expect(scopeText).not.toContain("admin_initiator");
    expect(scopeText).not.toContain('"assignedAdminId":"super-1"');
  });

  it("returns historical detail from the immutable round projection", async () => {
    const aggregateSpy = vi
      .spyOn(EstimateClientReviewRoundModel, "aggregate")
      .mockReturnValue(aggregateResult([detailRow()]) as never);
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(service.detail(actors.admin, "round-1")).resolves.toEqual({
      ...detailRow(),
      deliveryAttemptedAt: NOW.toISOString(),
      deliveredAt: LATER.toISOString(),
      createdAt: NOW.toISOString()
    });

    const text = pipelineText(aggregateSpy.mock.calls[0]![0]);
    expect(text).toContain('"estimateSnapshot":1');
    expect(text).toContain('"deliveryAttemptCount":1');
    expect(text).toContain('"decisionSource":1');
    expect(text).toContain('"decisionNote":1');
    expect(text).toContain('"proofAvailable"');
    expect(text).not.toContain('"from":"estimates"');
    expect(text).not.toContain("pdfStorageReference");
  });

  it("authorizes a task PDF before reading bytes and returns only safe download fields", async () => {
    const storage = storageDouble();
    vi.spyOn(EstimateClientReviewRoundModel, "aggregate").mockReturnValue(
      aggregateResult([
        {
          storageReference: "private/round-1.pdf",
          filename: "estimate-v4.pdf",
          mimeType: "application/pdf"
        }
      ]) as never
    );
    const service = createEstimateClientReviewService({ storage });

    await expect(service.readPdf(actors.admin, "round-1")).resolves.toEqual({
      filename: "estimate-v4.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("bytes:private/round-1.pdf")
    });
    expect(storage.read).toHaveBeenCalledTimes(1);
  });

  it("denies a foreign task PDF with the same 404 and never calls storage", async () => {
    const storage = storageDouble();
    vi.spyOn(EstimateClientReviewRoundModel, "aggregate").mockReturnValue(
      aggregateResult([]) as never
    );
    const service = createEstimateClientReviewService({ storage });

    const error = await service.readPdf(actors.admin, "foreign-round").catch((value) => value);
    expectSafeNotFound(error);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("resolves only the current round for an active Client by normalized email", async () => {
    vi.spyOn(EstimateModel, "aggregate").mockReturnValue(
      aggregateResult([{ authorized: true }]) as never
    );
    const aggregateSpy = vi
      .spyOn(EstimateClientReviewRoundModel, "aggregate")
      .mockReturnValue(
        aggregateResult([{ id: "round-3", version: 4, scopeMatches: true }]) as never
      );
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(
      service.currentRoundForClientEstimate(actors.client, "estimate-1")
    ).resolves.toEqual({ id: "round-3", version: 4 });

    const text = pipelineText(aggregateSpy.mock.calls[0]![0]);
    expect(text).toContain('"emailNormalized":"client@example.com"');
    expect(text).toContain('"role":"client"');
    expect(text).toContain('"active":true');
    expect(text).toContain('"$recipientEmailNormalized","$clientActor.emailNormalized"');
    expect(text).toContain('"sendGeneration":-1');
    expect(text).toContain('"$limit":1');
    const pipeline = aggregateSpy.mock.calls[0]![0];
    const currentRoundLimit = pipeline.findIndex(
      (stage) => "$limit" in stage && stage.$limit === 1
    );
    const clientActorLookup = pipeline.findIndex(
      (stage) =>
        "$lookup" in stage &&
        (stage.$lookup as { as?: string }).as === "clientActorRows"
    );
    expect(currentRoundLimit).toBeLessThan(clientActorLookup);
  });

  it("returns null only for an authorized legacy estimate and 404 for a foreign estimate", async () => {
    const estimateSpy = vi.spyOn(EstimateModel, "aggregate");
    estimateSpy
      .mockReturnValueOnce(aggregateResult([{ authorized: true }]) as never)
      .mockReturnValueOnce(aggregateResult([]) as never);
    const roundSpy = vi
      .spyOn(EstimateClientReviewRoundModel, "aggregate")
      .mockReturnValue(aggregateResult([]) as never);
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(
      service.currentRoundForClientEstimate(actors.client, "estimate-legacy")
    ).resolves.toBeNull();
    const error = await service
      .currentRoundForClientEstimate(actors.client, "estimate-foreign")
      .catch((value) => value);

    expectSafeNotFound(error);
    expect(roundSpy).toHaveBeenCalledTimes(1);
    const authorizationText = pipelineText(estimateSpy.mock.calls[0]![0]);
    expect(authorizationText).toContain('"_id":"estimate-legacy"');
    expect(authorizationText).toContain('"emailNormalized":"client@example.com"');
    expect(authorizationText).toContain('"role":"client"');
    expect(authorizationText).toContain('"active":true');
    expect(authorizationText).toContain('"clientEmailNormalized"');
  });

  it("authorizes the current Client PDF before storage and rejects historical/foreign rounds identically", async () => {
    const storage = storageDouble();
    const aggregateSpy = vi.spyOn(EstimateClientReviewRoundModel, "aggregate");
    aggregateSpy
      .mockReturnValueOnce(
        aggregateResult([
          {
            storageReference: "private/client-current.pdf",
            filename: "estimate-current.pdf",
            mimeType: "application/pdf"
          }
        ]) as never
      )
      .mockReturnValueOnce(aggregateResult([]) as never);
    const service = createEstimateClientReviewService({ storage });

    await expect(service.readClientPdf(actors.client, "round-current")).resolves.toEqual({
      filename: "estimate-current.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("bytes:private/client-current.pdf")
    });
    const error = await service
      .readClientPdf(actors.client, "round-historical")
      .catch((value) => value);
    expectSafeNotFound(error);
    expect(storage.read).toHaveBeenCalledTimes(1);

    const text = pipelineText(aggregateSpy.mock.calls[0]![0]);
    expect(text).toContain('"emailNormalized":"client@example.com"');
    expect(text).toContain('"sendGeneration":-1');
    expect(text).toContain('"$latestRound._id","$_id"');
  });

  it("allows the owning Estimator/Sales actor to read proof bytes", async () => {
    const storage = storageDouble();
    const aggregateSpy = vi
      .spyOn(EstimateClientReviewRoundModel, "aggregate")
      .mockReturnValue(
        aggregateResult([
          {
            storageReference: "private/proof-1.png",
            filename: "response.png",
            mimeType: "image/png"
          }
        ]) as never
      );
    const service = createEstimateClientReviewService({ storage });

    await expect(service.readProof(actors.estimator, "round-1")).resolves.toEqual({
      filename: "response.png",
      mimeType: "image/png",
      bytes: Buffer.from("bytes:private/proof-1.png")
    });
    const text = pipelineText(aggregateSpy.mock.calls[0]![0]);
    expect(text).toContain('"ownerId":"estimator-1"');
    expect(text).toContain('"role":"estimator_sales"');
    expect(text).toContain('"active":true');
  });

  it("denies foreign proof and retry scope with indistinguishable 404 responses", async () => {
    const storage = storageDouble();
    vi.spyOn(EstimateClientReviewRoundModel, "aggregate").mockReturnValue(
      aggregateResult([]) as never
    );
    const estimateSpy = vi
      .spyOn(EstimateModel, "aggregate")
      .mockReturnValue(aggregateResult([]) as never);
    const service = createEstimateClientReviewService({ storage });

    const proofError = await service
      .readProof(actors.foreignEstimator, "round-1")
      .catch((value) => value);
    const retryError = await service
      .requireRetryScope(actors.foreignEstimator, "estimate-1", "round-1")
      .catch((value) => value);

    expectSafeNotFound(proofError);
    expectSafeNotFound(retryError);
    expect(storage.read).not.toHaveBeenCalled();
    const retryText = pipelineText(estimateSpy.mock.calls[0]![0]);
    expect(retryText).toContain('"_id":"estimate-1"');
    expect(retryText).toContain('"ownerId":"estimator-2"');
    expect(retryText).toContain('"$eq":["$_id","$$roundId"]');
  });

  it("returns the same 404 for foreign detail, decision, and proof reads", async () => {
    vi.spyOn(EstimateClientReviewRoundModel, "aggregate").mockReturnValue(
      aggregateResult([]) as never
    );
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    const errors = await Promise.all([
      service.detail(actors.admin, "foreign-round").catch((value) => value),
      service.requireDecisionScope(actors.admin, "foreign-round").catch((value) => value),
      service.readProof(actors.admin, "foreign-round").catch((value) => value)
    ]);
    errors.forEach(expectSafeNotFound);
  });
});

const MONGO_NOW = new Date("2026-08-24T12:00:00.000Z");
const MONGO_LATER = new Date("2026-08-24T13:00:00.000Z");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

async function seedMongoUser(input: {
  id: string;
  role: PublicUser["role"];
  active?: boolean;
  email?: string;
  name?: string;
}): Promise<PublicUser> {
  const email = input.email ?? `${input.id}@review.test`;
  const user = {
    id: input.id,
    name: input.name ?? input.id,
    email,
    role: input.role
  } satisfies PublicUser;
  await UserModel.create({
    _id: user.id,
    name: user.name,
    email: user.email,
    emailNormalized: user.email.trim().toLowerCase(),
    passwordHash: "unused",
    role: user.role,
    active: input.active ?? true,
    accountKind: "standard",
    version: 1,
    managerId: null,
    authorizedClientIds: [],
    createdAt: MONGO_NOW,
    updatedAt: MONGO_NOW
  });
  return user;
}

async function seedMongoGrant(input: {
  id: string;
  projectId: string;
  userId: string;
  module?: "projects" | "design";
  active?: boolean;
}) {
  const active = input.active ?? true;
  await ProjectAccessGrantModel.create({
    _id: input.id,
    projectId: input.projectId,
    userId: input.userId,
    module: input.module ?? "projects",
    source: "admin_initiator",
    accessRequestId: null,
    grantedById: "system:review-test",
    active,
    grantedAt: MONGO_NOW,
    revokedAt: active ? null : MONGO_LATER,
    revokedById: active ? null : "system:review-test",
    revocationReason: active ? null : "Test revocation",
    createdAt: MONGO_NOW,
    updatedAt: active ? MONGO_NOW : MONGO_LATER
  });
}

async function seedMongoProject(id: string, name = id) {
  await ProjectModel.create({
    _id: id,
    name,
    clientId: null,
    clientName: "Priya Client",
    clientEmail: "client@example.com",
    clientEmailNormalized: "client@example.com",
    clientMobile: "9000000000",
    clientAddress: "Bengaluru",
    initiatingDesignerId: null,
    assignedEstimatorId: null,
    assignedDesignerIds: [],
    managerId: null,
    status: "active",
    location: "Bengaluru",
    plannedStartAt: MONGO_NOW,
    plannedEndAt: new Date("2026-09-24T12:00:00.000Z"),
    actualStartAt: null,
    actualEndAt: null,
    createdAt: MONGO_NOW,
    updatedAt: MONGO_NOW
  });
}

async function seedMongoLeadEstimate(input: {
  leadId: string;
  estimateId: string;
  ownerId: string;
  clientEmail?: string;
}) {
  const clientEmail = input.clientEmail ?? "client@example.com";
  await LeadModel.create({
    _id: input.leadId,
    projectId: null,
    ownerId: input.ownerId,
    clientName: "Priya Client",
    clientEmail,
    clientMobile: "9000000000",
    projectName: "Aurora Villa",
    location: "Bengaluru",
    propertyType: "Villa",
    budgetMin: null,
    budgetMax: null,
    source: "review-test",
    stage: "estimate_sent",
    nextAction: "Await Client response",
    nextActionAt: MONGO_LATER,
    builder: null,
    areaSqft: null,
    targetHandoverAt: null,
    notes: null,
    latestActivityAt: MONGO_NOW,
    createdAt: MONGO_NOW,
    updatedAt: MONGO_NOW
  });
  await EstimateModel.create({
    _id: input.estimateId,
    leadId: input.leadId,
    ownerId: input.ownerId,
    version: 1,
    designLifecycleVersion: 0,
    designFrozenAt: null,
    designLifecycleUpdatedAt: null,
    status: "sent_to_client",
    propertyType: "Villa",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: 1200,
    gst: 216,
    total: 1416,
    approvalRequired: false,
    assignedManagerId: null,
    assignedDesignerId: null,
    submittedAt: MONGO_NOW,
    sentToClientAt: MONGO_NOW,
    clientDecisionAt: null,
    projectId: null,
    reviews: [],
    notifications: [],
    createdAt: MONGO_NOW,
    updatedAt: MONGO_NOW
  });
}

function mongoSnapshot() {
  return {
    clientName: "Priya Client",
    projectName: "Aurora Villa",
    location: "Bengaluru",
    propertyType: "Villa",
    lineItems: [
      {
        catalogueId: "catalogue-1",
        roomName: "Living Room",
        specification: "Premium finish",
        unit: "sqft",
        rate: 120,
        quantity: 10,
        included: true,
        amount: 1200
      }
    ],
    subtotal: 1200,
    gst: 216,
    total: 1416
  };
}

async function seedMongoRound(input: {
  id: string;
  estimateId?: string;
  leadId?: string;
  projectId?: string | null;
  assignedAdminId: string;
  recipientEmail?: string;
  sendGeneration?: number;
  createdAt?: Date;
  status?: "pending" | "approved" | "changes_requested";
  decisionSource?: "admin_proof" | "client_portal";
  decisionNote?: string;
  decidedById?: string;
  deliveryFailureCode?: string | null;
}) {
  const status = input.status ?? "pending";
  const terminal = status === "pending"
    ? {
        decision: null,
        decisionSource: null,
        decisionNote: null,
        decidedById: null,
        decidedAt: null
      }
    : {
        decision: status === "approved" ? "approve" : "request_changes",
        decisionSource: input.decisionSource,
        decisionNote: input.decisionNote ?? "",
        decidedById: input.decidedById,
        decidedAt: MONGO_LATER
      };
  await EstimateClientReviewRoundModel.create({
    _id: input.id,
    estimateId: input.estimateId ?? `estimate-${input.id}`,
    leadId: input.leadId ?? `lead-${input.id}`,
    projectId: input.projectId ?? null,
    estimateVersion: 1,
    sendGeneration: input.sendGeneration ?? 1,
    dedupeKey: sha256Hex(`dedupe:${input.id}`),
    recipientEmail: input.recipientEmail ?? "client@example.com",
    recipientEmailNormalized: "model-normalizes-this@example.com",
    estimateSnapshot: mongoSnapshot(),
    pdfFilename: `${input.id}.pdf`,
    pdfMimeType: "application/pdf",
    pdfByteSize: 2048,
    pdfSha256: sha256Hex(`pdf:${input.id}`),
    pdfStorageReference: `private/${input.id}.pdf`,
    deliveryStatus: input.deliveryFailureCode ? "failed" : "sent",
    deliveryAttemptGeneration: 1,
    deliveryAttemptCount: 1,
    deliveryAttemptedAt: MONGO_NOW,
    deliveryLeaseExpiresAt: null,
    deliveredAt: input.deliveryFailureCode ? null : MONGO_NOW,
    deliveryFailureCode: input.deliveryFailureCode ?? null,
    assignedAdminId: input.assignedAdminId,
    status,
    ...terminal,
    version: 1,
    createdAt: input.createdAt ?? MONGO_NOW,
    updatedAt: input.createdAt ?? MONGO_NOW
  });
}

async function resolveMongoAssignee(
  service: ReturnType<typeof createEstimateClientReviewService>,
  projectId: string | null
) {
  const mongoSession = await mongoose.startSession();
  try {
    return await service.resolveReviewAssignee(projectId, mongoSession);
  } finally {
    await mongoSession.endSession();
  }
}

describe.sequential("estimate client review Mongo-backed scope behavior", () => {
  beforeAll(async () => {
    replica = await startMongoReplicaSet("estimate_client_review_service");
    await Promise.all([
      UserModel.syncIndexes(),
      ProjectAccessGrantModel.syncIndexes(),
      ProjectModel.syncIndexes(),
      LeadModel.syncIndexes(),
      EstimateModel.syncIndexes(),
      EstimateClientReviewRoundModel.syncIndexes(),
      EstimateClientResponseProofModel.syncIndexes()
    ]);
  }, 120_000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await replica.clear();
  });

  afterAll(async () => replica.stop());

  it("resolves only an active Admin initiator and safely falls back for every ineligible grant", async () => {
    await Promise.all([
      seedMongoUser({ id: "mongo-super", role: "super_admin" }),
      seedMongoUser({ id: "mongo-admin-active", role: "admin" }),
      seedMongoUser({ id: "mongo-admin-inactive", role: "admin", active: false }),
      seedMongoUser({ id: "mongo-admin-revoked", role: "admin" }),
      seedMongoUser({ id: "mongo-admin-wrong-module", role: "admin" }),
      seedMongoUser({ id: "mongo-estimator-grantee", role: "estimator_sales" })
    ]);
    await Promise.all([
      seedMongoGrant({
        id: "grant-active",
        projectId: "project-active",
        userId: "mongo-admin-active"
      }),
      seedMongoGrant({
        id: "grant-inactive-user",
        projectId: "project-inactive-user",
        userId: "mongo-admin-inactive"
      }),
      seedMongoGrant({
        id: "grant-revoked",
        projectId: "project-revoked",
        userId: "mongo-admin-revoked",
        active: false
      }),
      seedMongoGrant({
        id: "grant-wrong-module",
        projectId: "project-wrong-module",
        userId: "mongo-admin-wrong-module",
        module: "design"
      }),
      seedMongoGrant({
        id: "grant-wrong-role",
        projectId: "project-wrong-role",
        userId: "mongo-estimator-grantee"
      })
    ]);
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(resolveMongoAssignee(service, "project-active")).resolves.toEqual({
      assignedAdminId: "mongo-admin-active",
      source: "admin_initiator"
    });
    for (const projectId of [
      "project-inactive-user",
      "project-revoked",
      "project-wrong-module",
      "project-wrong-role"
    ]) {
      await expect(resolveMongoAssignee(service, projectId)).resolves.toEqual({
        assignedAdminId: "mongo-super",
        source: "super_admin_fallback"
      });
    }
  });

  it("fails closed when two active Admin initiators are persisted for one project", async () => {
    await Promise.all([
      seedMongoUser({ id: "mongo-admin-one", role: "admin" }),
      seedMongoUser({ id: "mongo-admin-two", role: "admin" })
    ]);
    await Promise.all([
      seedMongoGrant({
        id: "grant-one",
        projectId: "project-ambiguous",
        userId: "mongo-admin-one"
      }),
      seedMongoGrant({
        id: "grant-two",
        projectId: "project-ambiguous",
        userId: "mongo-admin-two"
      })
    ]);
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(
      resolveMongoAssignee(service, "project-ambiguous")
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEW_ASSIGNMENT_CONFLICT"
    });
  });

  it("counts every scoped Admin row before returning one deterministic page item", async () => {
    const admin = await seedMongoUser({ id: "mongo-admin", role: "admin" });
    await Promise.all([
      seedMongoUser({ id: "mongo-foreign-admin", role: "admin" }),
      seedMongoProject("project-visible", "Visible project"),
      seedMongoProject("project-unscoped", "Unscoped project")
    ]);
    await seedMongoGrant({
      id: "grant-visible",
      projectId: "project-visible",
      userId: admin.id
    });
    await Promise.all([
      seedMongoRound({
        id: "round-visible-old",
        projectId: "project-visible",
        assignedAdminId: admin.id,
        createdAt: MONGO_NOW
      }),
      seedMongoRound({
        id: "round-visible-new",
        projectId: "project-visible",
        assignedAdminId: admin.id,
        createdAt: MONGO_LATER
      }),
      seedMongoRound({
        id: "round-unscoped-project",
        projectId: "project-unscoped",
        assignedAdminId: admin.id,
        createdAt: MONGO_LATER
      }),
      seedMongoRound({
        id: "round-foreign-assignment",
        projectId: "project-visible",
        assignedAdminId: "mongo-foreign-admin",
        createdAt: MONGO_LATER
      }),
      seedMongoRound({
        id: "round-projectless",
        projectId: null,
        assignedAdminId: admin.id,
        createdAt: MONGO_LATER
      })
    ]);
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    await expect(service.list(admin, {}, { limit: 1, offset: 0 })).resolves.toMatchObject({
      items: [{ id: "round-visible-new" }],
      total: 2
    });
  });

  it("returns null only for a truly legacy Client estimate and 404 for an existing foreign-recipient latest round", async () => {
    const client = await seedMongoUser({
      id: "mongo-client",
      role: "client",
      email: "  CLIENT@Example.COM "
    });
    await seedMongoUser({ id: "mongo-estimator", role: "estimator_sales" });
    await Promise.all([
      seedMongoLeadEstimate({
        leadId: "lead-foreign-round",
        estimateId: "estimate-foreign-round",
        ownerId: "mongo-estimator"
      }),
      seedMongoLeadEstimate({
        leadId: "lead-legacy",
        estimateId: "estimate-legacy",
        ownerId: "mongo-estimator"
      })
    ]);
    await seedMongoRound({
      id: "round-latest-foreign-recipient",
      estimateId: "estimate-foreign-round",
      leadId: "lead-foreign-round",
      assignedAdminId: "mongo-estimator",
      recipientEmail: "foreign@example.com",
      sendGeneration: 1
    });
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    const error = await service
      .currentRoundForClientEstimate(client, "estimate-foreign-round")
      .catch((value) => value);
    expectSafeNotFound(error);
    await expect(
      service.currentRoundForClientEstimate(client, "estimate-legacy")
    ).resolves.toBeNull();
  });

  it("maps inactive Admin and active Client decision actors without persistence leakage", async () => {
    const viewer = await seedMongoUser({ id: "mongo-viewer", role: "admin" });
    await Promise.all([
      seedMongoUser({
        id: "mongo-admin-decision-actor",
        role: "admin",
        active: false,
        name: "Former Admin"
      }),
      seedMongoUser({
        id: "mongo-client-decision-actor",
        role: "client",
        name: "Priya Client",
        email: "client@example.com"
      }),
      seedMongoProject("project-detail", "Detail project")
    ]);
    await seedMongoGrant({
      id: "grant-detail",
      projectId: "project-detail",
      userId: viewer.id
    });
    await Promise.all([
      seedMongoRound({
        id: "round-admin-decision",
        projectId: "project-detail",
        assignedAdminId: viewer.id,
        status: "changes_requested",
        decisionSource: "admin_proof",
        decisionNote: "Please revise the finish.",
        decidedById: "mongo-admin-decision-actor",
        deliveryFailureCode: "SMTP_TIMEOUT"
      }),
      seedMongoRound({
        id: "round-client-decision",
        projectId: "project-detail",
        assignedAdminId: viewer.id,
        status: "approved",
        decisionSource: "client_portal",
        decisionNote: "",
        decidedById: "mongo-client-decision-actor"
      }),
      seedMongoRound({
        id: "round-pending-decision",
        projectId: "project-detail",
        assignedAdminId: viewer.id
      })
    ]);
    await EstimateClientResponseProofModel.create({
      _id: "proof-admin-decision",
      reviewRoundId: "round-admin-decision",
      estimateId: "estimate-round-admin-decision",
      storageReference: "private/proof-admin-decision.png",
      originalFilename: "client-response.png",
      mimeType: "image/png",
      byteSize: 1024,
      sha256: sha256Hex("proof-admin-decision"),
      uploadedById: viewer.id,
      uploadedAt: MONGO_LATER
    });
    const service = createEstimateClientReviewService({ storage: storageDouble() });

    const adminDetail = await service.detail(viewer, "round-admin-decision");
    const clientDetail = await service.detail(viewer, "round-client-decision");
    const pendingDetail = await service.detail(viewer, "round-pending-decision");

    expect(adminDetail.decidedBy).toEqual({
      id: "mongo-admin-decision-actor",
      name: "Former Admin"
    });
    expect(clientDetail.decidedBy).toEqual({
      id: "mongo-client-decision-actor",
      name: "Priya Client"
    });
    expect(pendingDetail.decidedBy).toBeNull();
    expect(adminDetail.proofAvailable).toBe(true);
    const serialized = JSON.stringify(adminDetail);
    expect(serialized).not.toContain("private/round-admin-decision.pdf");
    expect(serialized).not.toContain("private/proof-admin-decision.png");
    expect(serialized).not.toContain("SMTP_TIMEOUT");
    expect(serialized).not.toContain("storageReference");
    expect(serialized).not.toContain("deliveryFailureCode");
  });

  it("allows owner retry and denies non-owner retry/proof before storage", async () => {
    const owner = await seedMongoUser({ id: "mongo-owner", role: "estimator_sales" });
    const foreign = await seedMongoUser({
      id: "mongo-foreign-estimator",
      role: "estimator_sales"
    });
    await seedMongoLeadEstimate({
      leadId: "lead-retry",
      estimateId: "estimate-retry",
      ownerId: owner.id
    });
    await seedMongoRound({
      id: "round-retry",
      estimateId: "estimate-retry",
      leadId: "lead-retry",
      assignedAdminId: owner.id
    });
    await EstimateClientResponseProofModel.create({
      _id: "proof-retry",
      reviewRoundId: "round-retry",
      estimateId: "estimate-retry",
      storageReference: "private/proof-retry.pdf",
      originalFilename: "proof-retry.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      sha256: sha256Hex("proof-retry"),
      uploadedById: owner.id,
      uploadedAt: MONGO_LATER
    });
    const storage = storageDouble();
    const service = createEstimateClientReviewService({ storage });

    await expect(
      service.requireRetryScope(owner, "estimate-retry", "round-retry")
    ).resolves.toBeUndefined();
    const retryError = await service
      .requireRetryScope(foreign, "estimate-retry", "round-retry")
      .catch((value) => value);
    const proofError = await service
      .readProof(foreign, "round-retry")
      .catch((value) => value);

    expectSafeNotFound(retryError);
    expectSafeNotFound(proofError);
    expect(storage.read).not.toHaveBeenCalled();
  });
});
