import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildEstimateClientReviewDedupeKey,
  sha256Hex,
  type EstimateClientReviewSummary
} from "../src/domain/estimate-client-review.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { createEstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";
import {
  createEstimatePublicationService,
  type PublishEstimateToClientInput
} from "../src/services/estimate-publication.service.js";

const NOW = new Date("2026-08-24T10:00:00.000Z");
const SUBMITTED_AT = new Date("2026-08-24T09:59:00.000Z");
const ACTOR_ID = "estimator-1";
const ESTIMATE_ID = "estimate-1";
const LEAD_ID = "lead-1";
const PROJECT_ID = "project-1";
const ASSIGNED_ADMIN_ID = "admin-1";
const PDF_BYTES = Buffer.from("%PDF-1.7\nimmutable estimate snapshot");
const PDF_FILENAME = "aurora-villa-estimate-v3.pdf";

const lineItems = [{
  catalogueId: "catalogue-1",
  roomName: "Living Room",
  specification: "Premium finish",
  unit: "sqft",
  rate: 100_000,
  quantity: 12,
  included: true,
  amount: 1_200_000
}];

function estimate(overrides: Record<string, unknown> = {}) {
  return {
    _id: ESTIMATE_ID,
    leadId: LEAD_ID,
    ownerId: ACTOR_ID,
    projectId: PROJECT_ID,
    version: 3,
    status: "draft",
    propertyType: "villa",
    rooms: [],
    scopes: ["interiors"],
    lineItems: structuredClone(lineItems),
    subtotal: 1_200_000,
    gst: 216_000,
    total: 1_416_000,
    approvalRequired: false,
    assignedManagerId: null,
    assignedDesignerId: null,
    submittedAt: null,
    sentToClientAt: null,
    clientDecisionAt: null,
    reviews: [],
    notifications: [],
    ...overrides
  };
}

function lead(overrides: Record<string, unknown> = {}) {
  return {
    _id: LEAD_ID,
    projectId: PROJECT_ID,
    ownerId: ACTOR_ID,
    clientName: "Priya Shah",
    clientEmail: "Client@Example.COM",
    clientMobile: "9000000000",
    projectName: "Aurora Villa",
    location: "Bengaluru",
    propertyType: "villa",
    source: "admin_project",
    stage: "qualified",
    nextAction: "prepare estimate",
    nextActionAt: new Date("2026-08-25T10:00:00.000Z"),
    ...overrides
  };
}

function summary(overrides: Partial<EstimateClientReviewSummary> = {}): EstimateClientReviewSummary {
  return {
    id: "round-created",
    sendGeneration: 1,
    estimateVersion: 3,
    version: 1,
    deliveryStatus: "sent",
    deliveryAttemptCount: 1,
    deliveredAt: NOW.toISOString(),
    status: "pending",
    ...overrides
  };
}

function publicationInput(
  overrides: Partial<PublishEstimateToClientInput> = {}
): PublishEstimateToClientInput {
  return {
    estimateId: ESTIMATE_ID,
    leadId: LEAD_ID,
    actorId: ACTOR_ID,
    expectedEstimateVersion: 3,
    expectedStatus: "draft",
    submittedAt: SUBMITTED_AT,
    ...overrides
  };
}

function query<T>(value: T) {
  const result = {
    sort: vi.fn(),
    select: vi.fn(),
    session: vi.fn(),
    lean: vi.fn(async () => value),
    then: (resolve: (resolved: T) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject)
  };
  result.sort.mockReturnValue(result);
  result.select.mockReturnValue(result);
  result.session.mockReturnValue(result);
  return result;
}

function roundDocument(value: Record<string, unknown>) {
  const record = {
    ...value,
    _id: String(value._id ?? "round-created"),
    createdAt: NOW,
    updatedAt: NOW
  };
  return {
    ...record,
    id: record._id,
    toObject: () => ({ ...record })
  };
}

function mappedEstimate(record: Record<string, unknown>) {
  const { _id, ...persisted } = record;
  return { ...persisted, id: _id };
}

interface HarnessOptions {
  estimate?: Record<string, unknown>;
  transactionEstimate?: Record<string, unknown>;
  committedEstimate?: Record<string, unknown>;
  lead?: Record<string, unknown>;
  transactionLead?: Record<string, unknown>;
  latestRound?: Record<string, unknown> | null;
  duplicateRound?: Record<string, unknown> | null;
  probeRound?:
    | Record<string, unknown>
    | ((createdRound: Record<string, unknown> | null) => Record<string, unknown> | null);
  probeError?: unknown;
  transitionMatchedCount?: number;
  roundCreateError?: unknown;
  assigneeError?: unknown;
  auditErrorAtCall?: number;
  transactionError?: unknown;
  transactionErrorAfterCallback?: unknown;
  storageSaveError?: unknown;
  deliverResult?: EstimateClientReviewSummary;
  deliverError?: unknown;
  reloadSummary?: EstimateClientReviewSummary | null;
  reloadSummaryError?: unknown;
}

function setupHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const estimateRecord = options.estimate ?? estimate();
  const leadRecord = options.lead ?? lead();
  const objects = new Map<string, Buffer>([["pre-existing.pdf", Buffer.from("keep")]]);
  let saveSequence = 0;
  const fileStorage = {
    save: vi.fn(),
    saveGenerated: vi.fn(async ({ data, extension }: { data: Buffer; extension: string }) => {
      events.push("storage:save");
      if (options.storageSaveError) throw options.storageSaveError;
      saveSequence += 1;
      const reference = `new-snapshot-${saveSequence}${extension}`;
      objects.set(reference, Buffer.from(data));
      return { reference };
    }),
    read: vi.fn(async (reference: string) => Buffer.from(objects.get(reference) ?? [])),
    delete: vi.fn(async (reference: string) => {
      events.push(`storage:delete:${reference}`);
      objects.delete(reference);
    }),
    open: vi.fn()
  };
  const storage = createEstimateClientReviewStorage(fileStorage as never);

  const pdf = {
    generate: vi.fn(async () => {
      events.push("pdf:generate");
      return { bytes: PDF_BYTES, filename: PDF_FILENAME };
    })
  };

  const reviews = {
    resolveReviewAssignee: vi.fn(async () => {
      events.push("reviews:resolve-assignee");
      if (options.assigneeError) throw options.assigneeError;
      return {
        assignedAdminId: ASSIGNED_ADMIN_ID,
        source: "admin_initiator" as const
      };
    }),
    currentSummaryForEstimate: vi.fn(async () => {
      events.push("reviews:reload-summary");
      if (options.reloadSummaryError) throw options.reloadSummaryError;
      return options.reloadSummary ?? summary({ deliveryStatus: "failed", deliveredAt: null });
    })
  };

  const audit = {
    appendInMongoTransaction: vi.fn(async () => {
      events.push("audit:append");
      if (
        options.auditErrorAtCall &&
        audit.appendInMongoTransaction.mock.calls.length === options.auditErrorAtCall
      ) {
        throw new Error("audit unavailable");
      }
      return {};
    })
  };

  const deliverInitial = vi.fn(async () => {
    events.push("delivery:initial");
    if (options.deliverError) throw options.deliverError;
    return options.deliverResult ?? summary();
  });

  const session = {
    withTransaction: vi.fn(async (operation: () => Promise<unknown>) => {
      events.push("transaction:start");
      if (options.transactionError) throw options.transactionError;
      const result = await operation();
      if (options.transactionErrorAfterCallback) {
        events.push("transaction:commit-ambiguous");
        throw options.transactionErrorAfterCallback;
      }
      events.push("transaction:commit");
      return result;
    }),
    endSession: vi.fn(async () => undefined)
  };
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);

  let estimateReadCount = 0;
  const defaultCommittedEstimate = estimate({
    status: "sent_to_client",
    submittedAt: SUBMITTED_AT,
    sentToClientAt: NOW,
    reviews: [{
      actorId: ACTOR_ID,
      action: "submitted",
      note: "",
      occurredAt: SUBMITTED_AT
    }],
    notifications: [{
      recipientEmail: "Client@Example.COM",
      recipientRole: "client",
      event: "estimate_ready_for_review",
      status: "queued",
      queuedAt: NOW
    }]
  });
  const findEstimate = vi
    .spyOn(EstimateModel, "findOne")
    .mockImplementation((filter: Record<string, unknown>) => {
      estimateReadCount += 1;
      if (filter.status === "sent_to_client") {
        return query(options.committedEstimate ?? defaultCommittedEstimate) as never;
      }
      return query(
        estimateReadCount === 1
          ? estimateRecord
          : options.transactionEstimate ?? estimateRecord
      ) as never;
    });
  const transitionEstimate = vi
    .spyOn(EstimateModel, "updateOne")
    .mockResolvedValue({
      acknowledged: true,
      matchedCount: options.transitionMatchedCount ?? 1,
      modifiedCount: options.transitionMatchedCount ?? 1
    } as never);
  let leadReadCount = 0;
  const findLead = vi
    .spyOn(LeadModel, "findOne")
    .mockImplementation(() => {
      leadReadCount += 1;
      return query(
        leadReadCount === 1
          ? leadRecord
          : options.transactionLead ?? leadRecord
      ) as never;
    });
  const updateLead = vi
    .spyOn(LeadModel, "updateOne")
    .mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 } as never);
  let createdRoundInput: Record<string, unknown> | null = null;
  const findRound = vi
    .spyOn(EstimateClientReviewRoundModel, "findOne")
    .mockImplementation((filter: Record<string, unknown>) => {
      if (Object.hasOwn(filter, "dedupeKey") && options.probeError) {
        throw options.probeError;
      }
      const configuredProbe = typeof options.probeRound === "function"
        ? options.probeRound(createdRoundInput)
        : options.probeRound;
      let value = Object.hasOwn(filter, "dedupeKey")
        ? configuredProbe ?? options.duplicateRound ?? null
        : options.latestRound ?? null;
      if (
        value &&
        Object.hasOwn(filter, "pdfStorageReference") &&
        value.pdfStorageReference !== filter.pdfStorageReference
      ) {
        value = null;
      }
      return query(value) as never;
    });
  const createRound = vi
    .spyOn(EstimateClientReviewRoundModel, "create")
    .mockImplementation(async (values: Record<string, unknown>[]) => {
      createdRoundInput = values[0] ?? null;
      if (options.roundCreateError) throw options.roundCreateError;
      return [roundDocument(values[0] ?? {})] as never;
    });

  const publication = createEstimatePublicationService({
    pdf,
    storage,
    reviews: reviews as never,
    audit: audit as never,
    deliverInitial,
    now: () => NOW
  });

  return {
    publication,
    pdf,
    reviews,
    audit,
    deliverInitial,
    session,
    findEstimate,
    transitionEstimate,
    findLead,
    updateLead,
    findRound,
    createRound,
    fileStorage,
    objects,
    events
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ordinary transactional Estimate publication", () => {
  it("publishes one compact immutable snapshot, task, audit pair, compatibility effects, and post-commit delivery", async () => {
    const harness = setupHarness();
    const beforeEstimate = structuredClone(estimate());
    const result = await harness.publication.publishEstimateToClient(publicationInput());

    expect(harness.pdf.generate).toHaveBeenCalledOnce();
    expect(harness.pdf.generate).toHaveBeenCalledWith({
      id: ESTIMATE_ID,
      version: 3,
      status: "sent_to_client",
      propertyType: "villa",
      subtotal: 1_200_000,
      gst: 216_000,
      total: 1_416_000,
      lineItems,
      lead: {
        clientName: "Priya Shah",
        clientEmail: "Client@Example.COM",
        projectName: "Aurora Villa",
        location: "Bengaluru"
      }
    }, { profile: "compact_client_delivery" });
    expect(estimate()).toEqual(beforeEstimate);

    expect(harness.fileStorage.saveGenerated).toHaveBeenCalledOnce();
    expect(harness.fileStorage.saveGenerated).toHaveBeenCalledWith({
      data: PDF_BYTES,
      extension: ".pdf"
    });
    expect(harness.transitionEstimate).toHaveBeenCalledOnce();
    const [estimateFilter, estimateUpdate, estimateOptions] =
      harness.transitionEstimate.mock.calls[0]!;
    expect(estimateFilter).toEqual({
      _id: ESTIMATE_ID,
      leadId: LEAD_ID,
      ownerId: ACTOR_ID,
      status: "draft",
      version: 3
    });
    expect(estimateOptions).toEqual({ session: harness.session });
    expect(estimateUpdate).toEqual({
      $set: {
        status: "sent_to_client",
        sentToClientAt: NOW,
        submittedAt: SUBMITTED_AT,
        approvalRequired: false
      },
      $push: {
        reviews: {
          actorId: ACTOR_ID,
          action: "submitted",
          note: "",
          occurredAt: SUBMITTED_AT
        },
        notifications: {
          recipientEmail: "Client@Example.COM",
          recipientRole: "client",
          event: "estimate_ready_for_review",
          status: "queued",
          queuedAt: NOW
        }
      }
    });

    expect(harness.findLead).toHaveBeenCalled();
    expect(harness.updateLead).toHaveBeenCalledOnce();
    expect(harness.updateLead).toHaveBeenCalledWith(
      { _id: LEAD_ID, ownerId: ACTOR_ID, projectId: PROJECT_ID },
      { $set: {
        stage: "estimate_sent",
        nextAction: "client estimate decision",
        nextActionAt: NOW
      } },
      { session: harness.session }
    );
    expect(harness.reviews.resolveReviewAssignee).toHaveBeenCalledOnce();
    expect(harness.reviews.resolveReviewAssignee).toHaveBeenCalledWith(
      PROJECT_ID,
      harness.session
    );

    expect(harness.createRound).toHaveBeenCalledOnce();
    const [[createdRound], createOptions] = harness.createRound.mock.calls[0]!;
    expect(createOptions).toEqual({ session: harness.session });
    expect(createdRound).toMatchObject({
      estimateId: ESTIMATE_ID,
      leadId: LEAD_ID,
      projectId: PROJECT_ID,
      estimateVersion: 3,
      sendGeneration: 1,
      dedupeKey: buildEstimateClientReviewDedupeKey({
        estimateId: ESTIMATE_ID,
        estimateVersion: 3,
        recipientEmailNormalized: "client@example.com"
      }),
      recipientEmail: "Client@Example.COM",
      recipientEmailNormalized: "client@example.com",
      estimateSnapshot: {
        clientName: "Priya Shah",
        projectName: "Aurora Villa",
        location: "Bengaluru",
        propertyType: "villa",
        lineItems,
        subtotal: 1_200_000,
        gst: 216_000,
        total: 1_416_000
      },
      pdfFilename: PDF_FILENAME,
      pdfMimeType: "application/pdf",
      pdfByteSize: PDF_BYTES.byteLength,
      pdfSha256: sha256Hex(PDF_BYTES),
      pdfStorageReference: "new-snapshot-1.pdf",
      deliveryStatus: "queued",
      deliveryAttemptGeneration: 1,
      deliveryAttemptCount: 0,
      deliveryAttemptedAt: null,
      deliveryLeaseExpiresAt: null,
      deliveredAt: null,
      deliveryFailureCode: null,
      assignedAdminId: ASSIGNED_ADMIN_ID,
      status: "pending",
      decision: null,
      decisionSource: null,
      decisionNote: null,
      decidedById: null,
      decidedAt: null,
      version: 1
    });

    expect(harness.audit.appendInMongoTransaction).toHaveBeenCalledTimes(2);
    expect(harness.audit.appendInMongoTransaction.mock.calls.map(([write]) => write.action))
      .toEqual([
        "estimate_client_review_published",
        "estimate_client_response_task_assigned"
      ]);
    for (const [write, session] of harness.audit.appendInMongoTransaction.mock.calls) {
      expect(write).toMatchObject({ actorId: ACTOR_ID, occurredAt: NOW.toISOString() });
      expect(session).toBe(harness.session);
      expect(JSON.stringify(write)).not.toMatch(
        /Client@Example\.COM|client@example\.com|new-snapshot|pdfStorageReference|bytes/i
      );
    }

    expect(harness.session.withTransaction).toHaveBeenCalledOnce();
    expect(harness.session.endSession).toHaveBeenCalledOnce();
    expect(harness.deliverInitial).toHaveBeenCalledOnce();
    expect(harness.deliverInitial).toHaveBeenCalledWith(
      String(createdRound._id),
      ACTOR_ID
    );
    expect(harness.events.indexOf("storage:save"))
      .toBeLessThan(harness.events.indexOf("transaction:start"));
    expect(harness.events.indexOf("transaction:commit"))
      .toBeLessThan(harness.events.indexOf("delivery:initial"));
    expect(harness.fileStorage.delete).not.toHaveBeenCalled();

    expect(result).toEqual({
      estimate: expect.objectContaining({
        id: ESTIMATE_ID,
        status: "sent_to_client",
        approvalRequired: false,
        submittedAt: SUBMITTED_AT,
        sentToClientAt: NOW,
        reviews: [expect.objectContaining({ actorId: ACTOR_ID, action: "submitted" })],
        notifications: [expect.objectContaining({
          recipientRole: "client",
          event: "estimate_ready_for_review",
          status: "queued"
        })]
      }),
      clientReview: summary()
    });
    expect(result.estimate).not.toHaveProperty("_id");
  });

  it.each(["failed", "disabled"] as const)(
    "returns the committed Estimate when initial delivery resolves as %s",
    async (deliveryStatus) => {
      const deliveredSummary = summary({
        deliveryStatus,
        deliveryAttemptCount: deliveryStatus === "failed" ? 1 : 0,
        deliveredAt: null
      });
      const harness = setupHarness({ deliverResult: deliveredSummary });

      await expect(
        harness.publication.publishEstimateToClient(publicationInput())
      ).resolves.toEqual({
        estimate: expect.objectContaining({ id: ESTIMATE_ID, status: "sent_to_client" }),
        clientReview: deliveredSummary
      });
      expect(harness.transitionEstimate).toHaveBeenCalledOnce();
      expect(harness.createRound).toHaveBeenCalledOnce();
      expect(harness.deliverInitial).toHaveBeenCalledOnce();
      expect(harness.fileStorage.delete).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["delivery", new Error("mailer unexpectedly threw")],
    ["post-commit storage", new Error("stored PDF reload failed")],
    ["post-commit audit", new Error("delivery telemetry audit failed")]
  ])("keeps publication committed after an unexpected %s exception and safely reloads", async (_label, error) => {
    const reloaded = summary({
      deliveryStatus: "failed",
      deliveryAttemptCount: 1,
      deliveredAt: null
    });
    const harness = setupHarness({ deliverError: error, reloadSummary: reloaded });

    await expect(
      harness.publication.publishEstimateToClient(publicationInput())
    ).resolves.toEqual({
      estimate: expect.objectContaining({ id: ESTIMATE_ID, status: "sent_to_client" }),
      clientReview: reloaded
    });
    expect(harness.reviews.currentSummaryForEstimate).toHaveBeenCalledOnce();
    expect(harness.reviews.currentSummaryForEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ id: ACTOR_ID }),
      ESTIMATE_ID
    );
    expect(harness.transitionEstimate).toHaveBeenCalledOnce();
    expect(harness.createRound).toHaveBeenCalledOnce();
    expect(harness.fileStorage.delete).not.toHaveBeenCalled();
  });

  it("falls back to the safe pre-delivery round summary when post-commit delivery and reload both throw", async () => {
    const harness = setupHarness({
      deliverError: new Error("delivery failed unexpectedly"),
      reloadSummaryError: new Error("summary reload unavailable")
    });

    const result = await harness.publication.publishEstimateToClient(publicationInput());

    expect(result.estimate).toEqual(
      expect.objectContaining({ id: ESTIMATE_ID, status: "sent_to_client" })
    );
    const createdRoundId = String(harness.createRound.mock.calls[0]![0][0]._id);
    expect(result.clientReview).toEqual(summary({
      id: createdRoundId,
      deliveryStatus: "queued",
      deliveryAttemptCount: 0,
      deliveredAt: null
    }));
    expect(harness.deliverInitial).toHaveBeenCalledOnce();
    expect(harness.reviews.currentSummaryForEstimate).toHaveBeenCalledOnce();
    expect(harness.transitionEstimate).toHaveBeenCalledOnce();
    expect(harness.fileStorage.delete).not.toHaveBeenCalled();
  });
});

describe("high-value publication boundaries", () => {
  it("publishes an ordinary draft at the exact approval threshold", async () => {
    const harness = setupHarness({
      estimate: estimate({ total: 1_500_000 })
    });

    await expect(
      harness.publication.publishEstimateToClient(publicationInput())
    ).resolves.toEqual({
      estimate: expect.objectContaining({
        id: ESTIMATE_ID,
        status: "sent_to_client",
        total: 1_500_000,
        approvalRequired: false
      }),
      clientReview: summary()
    });

    expect(harness.createRound).toHaveBeenCalledOnce();
    expect(harness.deliverInitial).toHaveBeenCalledOnce();
  });

  it("does not publish an above-threshold draft before the existing manager/designer flow", async () => {
    const harness = setupHarness({
      estimate: estimate({ total: 1_500_001, status: "draft", approvalRequired: false })
    });

    await expect(
      harness.publication.publishEstimateToClient(publicationInput())
    ).rejects.toMatchObject({ status: 409 });

    expect(harness.pdf.generate).not.toHaveBeenCalled();
    expect(harness.fileStorage.saveGenerated).not.toHaveBeenCalled();
    expect(harness.session.withTransaction).not.toHaveBeenCalled();
    expect(harness.transitionEstimate).not.toHaveBeenCalled();
    expect(harness.createRound).not.toHaveBeenCalled();
    expect(harness.audit.appendInMongoTransaction).not.toHaveBeenCalled();
    expect(harness.deliverInitial).not.toHaveBeenCalled();
  });

  it("publishes an approved ready_for_client Estimate once without duplicating its submitted review", async () => {
    const submittedReview = {
      actorId: ACTOR_ID,
      action: "submitted",
      note: "",
      occurredAt: new Date("2026-08-23T10:00:00.000Z")
    };
    const designerReview = {
      actorId: "designer-1",
      action: "designer_approved",
      note: "Approved",
      occurredAt: new Date("2026-08-24T08:00:00.000Z")
    };
    const harness = setupHarness({
      estimate: estimate({
        version: 7,
        status: "ready_for_client",
        total: 2_124_000,
        approvalRequired: true,
        assignedManagerId: "manager-1",
        assignedDesignerId: "designer-1",
        submittedAt: submittedReview.occurredAt,
        reviews: [submittedReview, designerReview]
      }),
      latestRound: {
        _id: "round-old",
        estimateId: ESTIMATE_ID,
        sendGeneration: 4
      },
      deliverResult: summary({
        estimateVersion: 7,
        sendGeneration: 5
      })
    });

    const result = await harness.publication.publishEstimateToClient(publicationInput({
      expectedEstimateVersion: 7,
      expectedStatus: "ready_for_client",
      submittedAt: undefined
    }));

    expect(harness.pdf.generate).toHaveBeenCalledWith(
      expect.objectContaining({ id: ESTIMATE_ID, version: 7, status: "sent_to_client" }),
      { profile: "compact_client_delivery" }
    );
    expect(harness.transitionEstimate).toHaveBeenCalledOnce();
    const [, update] = harness.transitionEstimate.mock.calls[0]!;
    expect(update).toEqual({
      $set: { status: "sent_to_client", sentToClientAt: NOW },
      $push: {
        notifications: {
          recipientEmail: "Client@Example.COM",
          recipientRole: "client",
          event: "estimate_ready_for_review",
          status: "queued",
          queuedAt: NOW
        }
      }
    });
    expect(JSON.stringify(update)).not.toMatch(/submitted|approvalRequired|reviews/);
    expect(harness.createRound).toHaveBeenCalledOnce();
    expect(harness.createRound.mock.calls[0]![0][0]).toMatchObject({
      estimateVersion: 7,
      sendGeneration: 5,
      assignedAdminId: ASSIGNED_ADMIN_ID
    });
    expect(harness.deliverInitial).toHaveBeenCalledOnce();
    expect(result.estimate).toMatchObject({
      id: ESTIMATE_ID,
      version: 7,
      status: "sent_to_client",
      approvalRequired: true,
      assignedManagerId: "manager-1",
      assignedDesignerId: "designer-1",
      reviews: [submittedReview, designerReview]
    });
    expect(result.clientReview).toEqual(summary({
      estimateVersion: 7,
      sendGeneration: 5
    }));
  });
});

describe("publication cleanup and idempotency", () => {
  it.each([
    [
      "Estimate presentation",
      {
        transactionEstimate: estimate({
          lineItems: [{
            ...lineItems[0],
            specification: "Changed after PDF generation"
          }]
        })
      }
    ],
    [
      "Lead presentation",
      {
        transactionLead: lead({
          projectName: "Changed after PDF generation"
        })
      }
    ]
  ] satisfies [string, HarnessOptions][])(
    "rejects same-version %s drift and deletes the now-mismatched PDF snapshot",
    async (_label, options) => {
      const harness = setupHarness(options);

      await expect(
        harness.publication.publishEstimateToClient(publicationInput())
      ).rejects.toMatchObject({ status: 409 });

      expect(harness.pdf.generate).toHaveBeenCalledOnce();
      expect(harness.fileStorage.saveGenerated).toHaveBeenCalledOnce();
      expect(harness.fileStorage.delete).toHaveBeenCalledOnce();
      expect(harness.fileStorage.delete).toHaveBeenCalledWith("new-snapshot-1.pdf");
      expect(harness.reviews.resolveReviewAssignee).not.toHaveBeenCalled();
      expect(harness.createRound).not.toHaveBeenCalled();
      expect(harness.transitionEstimate).not.toHaveBeenCalled();
      expect(harness.deliverInitial).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["transaction start", { transactionError: new Error("transaction unavailable") }],
    ["Estimate CAS conflict", { transitionMatchedCount: 0 }],
    ["missing assignee fallback", { assigneeError: new Error("sole Super Admin invariant failed") }],
    ["transactional audit", { auditErrorAtCall: 2 }]
  ] satisfies [string, HarnessOptions][])(
    "deletes only the newly stored orphan after %s failure",
    async (_label, options) => {
      const harness = setupHarness(options);

      await expect(
        harness.publication.publishEstimateToClient(publicationInput())
      ).rejects.toBeTruthy();

      expect(harness.fileStorage.saveGenerated).toHaveBeenCalledOnce();
      expect(harness.fileStorage.delete).toHaveBeenCalledOnce();
      expect(harness.fileStorage.delete).toHaveBeenCalledWith("new-snapshot-1.pdf");
      expect(harness.objects.get("pre-existing.pdf")).toEqual(Buffer.from("keep"));
      expect(harness.objects.has("new-snapshot-1.pdf")).toBe(false);
      expect(harness.deliverInitial).not.toHaveBeenCalled();
    }
  );

  it.each([
    Object.assign(new Error("commit result unknown: provider-secret"), {
      errorLabels: ["UnknownTransactionCommitResult"]
    }),
    Object.assign(new Error("commit acknowledgement timed out: provider-secret"), {
      code: "ETIMEDOUT"
    })
  ])("retains and delivers this call's committed snapshot after an ambiguous commit rejection", async (ambiguousError) => {
    const committedAt = new Date("2026-08-24T10:00:30.000Z");
    const committedSubmittedAt = new Date("2026-08-24T10:00:20.000Z");
    const persistedEstimate = estimate({
      status: "sent_to_client",
      submittedAt: committedSubmittedAt,
      sentToClientAt: committedAt,
      rooms: [{ id: "persisted-room" }],
      reviews: [{
        actorId: ACTOR_ID,
        action: "submitted",
        note: "persisted winner review",
        occurredAt: committedSubmittedAt
      }],
      notifications: [{
        recipientEmail: "Client@Example.COM",
        recipientRole: "client",
        event: "estimate_ready_for_review",
        status: "queued",
        queuedAt: committedAt
      }],
      persistedOnlyField: "from-database"
    });
    const delivered = summary({
      id: "delivered-after-ambiguous-commit",
      deliveryStatus: "sent",
      deliveryAttemptCount: 1,
      deliveredAt: committedAt.toISOString()
    });
    const harness = setupHarness({
      transactionErrorAfterCallback: ambiguousError,
      committedEstimate: persistedEstimate,
      probeRound: (createdRound) => createdRound
        ? roundDocument({
            ...createdRound,
            pdfStorageReference: "new-snapshot-1.pdf"
          })
        : null,
      deliverResult: delivered
    });

    const result = await harness.publication.publishEstimateToClient(publicationInput());

    const createdRound = harness.createRound.mock.calls[0]![0][0];
    expect(harness.findRound).toHaveBeenCalledWith({
      dedupeKey: createdRound.dedupeKey,
      estimateId: ESTIMATE_ID,
      estimateVersion: 3,
      recipientEmailNormalized: "client@example.com",
      pdfStorageReference: "new-snapshot-1.pdf"
    });
    expect(harness.fileStorage.delete).not.toHaveBeenCalled();
    expect(harness.objects.get("new-snapshot-1.pdf")).toEqual(PDF_BYTES);
    expect(harness.deliverInitial).toHaveBeenCalledOnce();
    expect(harness.deliverInitial).toHaveBeenCalledWith(
      String(createdRound._id),
      ACTOR_ID
    );
    expect(harness.events.indexOf("transaction:commit-ambiguous"))
      .toBeLessThan(harness.events.indexOf("delivery:initial"));
    expect(result).toEqual({
      estimate: mappedEstimate(persistedEstimate),
      clientReview: delivered
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("cleans this call's loser snapshot and returns a different identical winner after an ambiguous rejection", async () => {
    const winnerAt = new Date("2026-08-24T09:45:00.000Z");
    const persistedWinner = estimate({
      status: "sent_to_client",
      submittedAt: winnerAt,
      sentToClientAt: winnerAt,
      rooms: [{ id: "winner-room" }],
      reviews: [{
        actorId: ACTOR_ID,
        action: "submitted",
        note: "winner persisted review",
        occurredAt: winnerAt
      }],
      notifications: [{
        recipientEmail: "Client@Example.COM",
        recipientRole: "client",
        event: "estimate_ready_for_review",
        status: "queued",
        queuedAt: winnerAt
      }],
      persistedOnlyField: "winner-database-state"
    });
    const winnerRound = roundDocument({
      _id: "round-other-winner",
      estimateId: ESTIMATE_ID,
      leadId: LEAD_ID,
      projectId: PROJECT_ID,
      estimateVersion: 3,
      sendGeneration: 1,
      dedupeKey: buildEstimateClientReviewDedupeKey({
        estimateId: ESTIMATE_ID,
        estimateVersion: 3,
        recipientEmailNormalized: "client@example.com"
      }),
      recipientEmailNormalized: "client@example.com",
      pdfStorageReference: "winner-snapshot.pdf",
      deliveryStatus: "queued",
      deliveryAttemptCount: 0,
      deliveredAt: null,
      status: "pending",
      version: 1
    });
    const harness = setupHarness({
      transactionErrorAfterCallback: Object.assign(
        new Error("commit acknowledgement timed out"),
        { code: "ETIMEDOUT" }
      ),
      probeRound: winnerRound,
      committedEstimate: persistedWinner
    });

    const result = await harness.publication.publishEstimateToClient(publicationInput());

    expect(harness.findRound).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: winnerRound.dedupeKey,
      pdfStorageReference: "new-snapshot-1.pdf"
    }));
    expect(harness.findRound).toHaveBeenCalledWith({
      dedupeKey: winnerRound.dedupeKey,
      estimateId: ESTIMATE_ID,
      estimateVersion: 3,
      recipientEmailNormalized: "client@example.com"
    });
    expect(harness.fileStorage.delete).toHaveBeenCalledOnce();
    expect(harness.fileStorage.delete).toHaveBeenCalledWith("new-snapshot-1.pdf");
    expect(harness.deliverInitial).not.toHaveBeenCalled();
    expect(result).toEqual({
      estimate: mappedEstimate(persistedWinner),
      clientReview: {
        id: "round-other-winner",
        sendGeneration: 1,
        estimateVersion: 3,
        version: 1,
        deliveryStatus: "queued",
        deliveryAttemptCount: 0,
        deliveredAt: null,
        status: "pending"
      }
    });
  });

  it("retains the snapshot and returns a bounded error when committed state cannot be probed safely", async () => {
    const harness = setupHarness({
      transactionErrorAfterCallback: Object.assign(
        new Error("commit result unknown: driver-payload"),
        { errorLabels: ["UnknownTransactionCommitResult"] }
      ),
      probeError: new Error("probe failed: provider-secret")
    });

    await expect(
      harness.publication.publishEstimateToClient(publicationInput())
    ).rejects.toMatchObject({
      status: 500,
      code: "ESTIMATE_PUBLICATION_RECOVERY_FAILED",
      message: "Estimate publication state could not be confirmed safely."
    });

    expect(harness.fileStorage.delete).not.toHaveBeenCalled();
    expect(harness.objects.get("new-snapshot-1.pdf")).toEqual(PDF_BYTES);
    expect(harness.deliverInitial).not.toHaveBeenCalled();
  });

  it("retains a possibly committed snapshot when the callback completed but both ambiguity probes return null", async () => {
    const harness = setupHarness({
      transactionErrorAfterCallback: Object.assign(
        new Error("unknown commit result: raw-driver-secret"),
        { errorLabels: ["UnknownTransactionCommitResult"] }
      )
    });

    const outcome = harness.publication.publishEstimateToClient(publicationInput());

    await expect(outcome).rejects.toMatchObject({
      status: 500,
      code: "ESTIMATE_PUBLICATION_RECOVERY_FAILED",
      message: "Estimate publication state could not be confirmed safely."
    });
    await expect(outcome).rejects.not.toThrow(/raw-driver-secret/i);
    expect(harness.fileStorage.delete).not.toHaveBeenCalled();
    expect(harness.objects.get("new-snapshot-1.pdf")).toEqual(PDF_BYTES);
    expect(harness.deliverInitial).not.toHaveBeenCalled();
  });

  it("cleans a known precommit orphan while bounding an unknown driver failure", async () => {
    const harness = setupHarness({
      transactionError: new Error("transaction start failed: raw-driver-secret")
    });

    const outcome = harness.publication.publishEstimateToClient(publicationInput());

    await expect(outcome).rejects.toMatchObject({
      status: 500,
      code: "ESTIMATE_PUBLICATION_RECOVERY_FAILED",
      message: "Estimate publication state could not be confirmed safely."
    });
    await expect(outcome).rejects.not.toThrow(/raw-driver-secret/i);
    expect(harness.fileStorage.delete).toHaveBeenCalledOnce();
    expect(harness.fileStorage.delete).toHaveBeenCalledWith("new-snapshot-1.pdf");
    expect(harness.objects.has("new-snapshot-1.pdf")).toBe(false);
    expect(harness.deliverInitial).not.toHaveBeenCalled();
  });

  it("deletes the losing snapshot and returns the matching committed round without a second initial delivery", async () => {
    const duplicate = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    const committedRound = roundDocument({
      _id: "round-winner",
      estimateId: ESTIMATE_ID,
      leadId: LEAD_ID,
      projectId: PROJECT_ID,
      estimateVersion: 3,
      sendGeneration: 1,
      dedupeKey: buildEstimateClientReviewDedupeKey({
        estimateId: ESTIMATE_ID,
        estimateVersion: 3,
        recipientEmailNormalized: "client@example.com"
      }),
      recipientEmail: "Client@Example.COM",
      recipientEmailNormalized: "client@example.com",
      pdfStorageReference: "winner-snapshot.pdf",
      deliveryStatus: "queued",
      deliveryAttemptCount: 0,
      deliveredAt: null,
      status: "pending",
      version: 1
    });
    const winnerAt = new Date("2026-08-24T09:30:00.000Z");
    const persistedWinner = estimate({
      status: "sent_to_client",
      submittedAt: winnerAt,
      sentToClientAt: winnerAt,
      rooms: [{ id: "winner-room" }],
      reviews: [{
        actorId: ACTOR_ID,
        action: "submitted",
        note: "persisted winner review",
        occurredAt: winnerAt
      }],
      notifications: [{
        recipientEmail: "Client@Example.COM",
        recipientRole: "client",
        event: "estimate_ready_for_review",
        status: "queued",
        queuedAt: winnerAt
      }],
      persistedOnlyField: "not-from-loser-preflight"
    });
    const harness = setupHarness({
      roundCreateError: duplicate,
      duplicateRound: committedRound,
      committedEstimate: persistedWinner
    });

    const result = await harness.publication.publishEstimateToClient(publicationInput());

    expect(harness.fileStorage.delete).toHaveBeenCalledOnce();
    expect(harness.fileStorage.delete).toHaveBeenCalledWith("new-snapshot-1.pdf");
    expect(harness.objects.get("pre-existing.pdf")).toEqual(Buffer.from("keep"));
    expect(harness.deliverInitial).not.toHaveBeenCalled();
    expect(result.estimate).toEqual(mappedEstimate(persistedWinner));
    expect(result.estimate).not.toMatchObject({
      submittedAt: SUBMITTED_AT,
      sentToClientAt: NOW
    });
    expect(result.clientReview).toEqual({
      id: "round-winner",
      sendGeneration: 1,
      estimateVersion: 3,
      version: 1,
      deliveryStatus: "queued",
      deliveryAttemptCount: 0,
      deliveredAt: null,
      status: "pending"
    });
  });

  it("treats an unrelated duplicate-key winner as a conflict and cleans only its own snapshot", async () => {
    const duplicate = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    const harness = setupHarness({
      roundCreateError: duplicate,
      duplicateRound: roundDocument({
        _id: "round-unrelated",
        estimateId: ESTIMATE_ID,
        leadId: LEAD_ID,
        projectId: PROJECT_ID,
        estimateVersion: 4,
        sendGeneration: 2,
        dedupeKey: "f".repeat(64),
        recipientEmail: "other@example.com",
        recipientEmailNormalized: "other@example.com",
        deliveryStatus: "queued",
        deliveryAttemptCount: 0,
        deliveredAt: null,
        status: "pending",
        version: 1
      })
    });

    await expect(
      harness.publication.publishEstimateToClient(publicationInput())
    ).rejects.toMatchObject({ status: 409 });

    expect(harness.fileStorage.delete).toHaveBeenCalledOnce();
    expect(harness.fileStorage.delete).toHaveBeenCalledWith("new-snapshot-1.pdf");
    expect(harness.objects.get("pre-existing.pdf")).toEqual(Buffer.from("keep"));
    expect(harness.deliverInitial).not.toHaveBeenCalled();
  });

  it("does not delete any reference when snapshot storage itself fails before returning one", async () => {
    const harness = setupHarness({ storageSaveError: new Error("object storage unavailable") });

    await expect(
      harness.publication.publishEstimateToClient(publicationInput())
    ).rejects.toThrow("object storage unavailable");

    expect(harness.fileStorage.saveGenerated).toHaveBeenCalledOnce();
    expect(harness.fileStorage.delete).not.toHaveBeenCalled();
    expect(harness.objects.get("pre-existing.pdf")).toEqual(Buffer.from("keep"));
    expect(harness.session.withTransaction).not.toHaveBeenCalled();
    expect(harness.deliverInitial).not.toHaveBeenCalled();
  });
});
