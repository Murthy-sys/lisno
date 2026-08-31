import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ESTIMATE_CLIENT_DECISION_NOTE_MAX,
  buildEstimateClientReviewDedupeKey,
  sha256Hex
} from "../src/domain/estimate-client-review.js";
import {
  EstimateClientReviewRoundModel,
  prepareEstimateClientReviewIndexes
} from "../src/models/EstimateClientReviewRound.js";
import { EstimateClientResponseProofModel } from "../src/models/EstimateClientResponseProof.js";

const NOW = new Date("2026-08-24T10:00:00.000Z");

const snapshot = () => ({
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
      amount: 1_200
    }
  ],
  subtotal: 1_200,
  gst: 216,
  total: 1_416
});

const round = (overrides: Record<string, unknown> = {}) =>
  new EstimateClientReviewRoundModel({
    _id: "review-round-1",
    estimateId: "estimate-1",
    leadId: "lead-1",
    projectId: null,
    estimateVersion: 3,
    sendGeneration: 1,
    dedupeKey: "a".repeat(64),
    recipientEmail: "  Client@Example.COM ",
    recipientEmailNormalized: "not-authoritative@example.com",
    estimateSnapshot: snapshot(),
    pdfFilename: "estimate-v3.pdf",
    pdfMimeType: "application/pdf",
    pdfByteSize: 2_048,
    pdfSha256: "b".repeat(64),
    pdfStorageReference: "estimates/review-round-1.pdf",
    deliveryStatus: "disabled",
    deliveryAttemptGeneration: 1,
    deliveryAttemptCount: 0,
    deliveryAttemptedAt: null,
    deliveryLeaseExpiresAt: null,
    deliveredAt: null,
    deliveryFailureCode: null,
    assignedAdminId: "admin-1",
    status: "pending",
    decision: null,
    decisionSource: null,
    decisionNote: null,
    decidedById: null,
    decidedAt: null,
    version: 1,
    ...overrides
  });

const proof = (overrides: Record<string, unknown> = {}) =>
  new EstimateClientResponseProofModel({
    _id: "proof-1",
    reviewRoundId: "review-round-1",
    estimateId: "estimate-1",
    storageReference: "proofs/proof-1.pdf",
    originalFilename: "client-response.pdf",
    mimeType: "application/pdf",
    byteSize: 1_024,
    sha256: "c".repeat(64),
    uploadedById: "admin-1",
    uploadedAt: NOW,
    ...overrides
  });

describe("estimate client review domain helpers", () => {
  it("builds the stable SHA-256 dedupe digest from estimate, version, and normalized recipient", () => {
    expect(
      buildEstimateClientReviewDedupeKey({
        estimateId: "estimate-1",
        estimateVersion: 3,
        recipientEmailNormalized: "client@example.com"
      })
    ).toBe("7b9b14cd7e520e410cc07b8658a44971b715975162c1713d7c58fd240af89356");
    expect(sha256Hex(Buffer.from("proof"))).toBe(
      "c1cda26362828b69266512052b97cb3729e3b052e4ade47c0a1e3383defe73c7"
    );
  });
});

describe("EstimateClientReviewRound persistence model", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes the persisted recipient and validates a complete pending round", async () => {
    const document = round();

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.get("recipientEmailNormalized")).toBe("client@example.com");
  });

  it.each([
    ["estimate version", { estimateVersion: 0 }],
    ["send generation", { sendGeneration: 0 }],
    ["delivery attempt generation", { deliveryAttemptGeneration: 0 }],
    ["optimistic version", { version: 0 }],
    ["uppercase SHA", { pdfSha256: "A".repeat(64) }],
    ["unbounded failure code", { deliveryFailureCode: "X".repeat(65) }],
    ["provider failure text", { deliveryFailureCode: "550 MAILBOX REJECTED" }]
  ])("rejects an invalid %s", async (_label, overrides) => {
    await expect(round(overrides).validate()).rejects.toThrow();
  });

  it.each([
    ["estimateVersion", 1.5],
    ["estimateVersion", Number.NaN],
    ["estimateVersion", Number.POSITIVE_INFINITY],
    ["estimateVersion", Number.NEGATIVE_INFINITY],
    ["estimateVersion", Number.MAX_SAFE_INTEGER + 1],
    ["sendGeneration", 1.5],
    ["sendGeneration", Number.NaN],
    ["sendGeneration", Number.POSITIVE_INFINITY],
    ["sendGeneration", Number.NEGATIVE_INFINITY],
    ["sendGeneration", Number.MAX_SAFE_INTEGER + 1],
    ["deliveryAttemptGeneration", 1.5],
    ["deliveryAttemptGeneration", Number.NaN],
    ["deliveryAttemptGeneration", Number.POSITIVE_INFINITY],
    ["deliveryAttemptGeneration", Number.NEGATIVE_INFINITY],
    ["deliveryAttemptGeneration", Number.MAX_SAFE_INTEGER + 1],
    ["deliveryAttemptCount", 0.5],
    ["deliveryAttemptCount", Number.NaN],
    ["deliveryAttemptCount", Number.POSITIVE_INFINITY],
    ["deliveryAttemptCount", Number.NEGATIVE_INFINITY],
    ["deliveryAttemptCount", Number.MAX_SAFE_INTEGER + 1],
    ["version", 1.5],
    ["version", Number.NaN],
    ["version", Number.POSITIVE_INFINITY],
    ["version", Number.NEGATIVE_INFINITY],
    ["version", Number.MAX_SAFE_INTEGER + 1]
  ])("rejects non-safe-integer %s value %s", async (path, value) => {
    await expect(round({ [path]: value }).validate()).rejects.toThrow();
  });

  it("accepts safe-integer generation, attempt-count, and optimistic-version boundaries", async () => {
    await expect(
      round({
        estimateVersion: Number.MAX_SAFE_INTEGER,
        sendGeneration: Number.MAX_SAFE_INTEGER,
        deliveryAttemptGeneration: Number.MAX_SAFE_INTEGER,
        deliveryAttemptCount: Number.MAX_SAFE_INTEGER,
        version: Number.MAX_SAFE_INTEGER
      }).validate()
    ).resolves.toBeUndefined();
    await expect(round({ deliveryAttemptCount: 0 }).validate()).resolves.toBeUndefined();
  });

  it.each(["queued", "sent", "failed", "disabled"])(
    "accepts the closed delivery status %s",
    async (deliveryStatus) => {
      const telemetry =
        deliveryStatus === "sent"
          ? { deliveryAttemptCount: 1, deliveryAttemptedAt: NOW, deliveredAt: NOW }
          : deliveryStatus === "failed"
            ? {
                deliveryAttemptCount: 1,
                deliveryAttemptedAt: NOW,
                deliveryFailureCode: "SMTP_TIMEOUT"
              }
            : {};
      await expect(round({ deliveryStatus, ...telemetry }).validate()).resolves.toBeUndefined();
    }
  );

  it.each(["pending", "approved", "changes_requested"])(
    "accepts the closed review status %s with consistent decision fields",
    async (status) => {
      const terminal =
        status === "pending"
          ? {}
          : {
              decision: status === "approved" ? "approve" : "request_changes",
              decisionSource: "admin_proof",
              decisionNote: status === "approved" ? "" : "Please revise the finish.",
              decidedById: "admin-1",
              decidedAt: NOW
            };
      await expect(round({ status, ...terminal }).validate()).resolves.toBeUndefined();
    }
  );

  it("preserves Client-portal request-changes decisions with an empty note", async () => {
    await expect(
      round({
        status: "changes_requested",
        decision: "request_changes",
        decisionSource: "client_portal",
        decisionNote: "",
        decidedById: "client-1",
        decidedAt: NOW
      }).validate()
    ).resolves.toBeUndefined();
  });

  it.each([
    ["terminal status without terminal metadata", { $set: { status: "approved" } }],
    [
      "pending status with decision metadata",
      {
        $set: {
          status: "pending",
          decision: "approve",
          decisionSource: "admin_proof",
          decisionNote: "",
          decidedById: "admin-1",
          decidedAt: NOW
        }
      }
    ]
  ])("rejects an atomic CAS update with %s", async (_label, update) => {
    vi.spyOn(EstimateClientReviewRoundModel.collection, "updateOne").mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null
    } as never);

    await expect(
      EstimateClientReviewRoundModel.updateOne(
        { _id: "review-round-1", status: "pending", version: 1 },
        update,
        { runValidators: true }
      )
    ).rejects.toThrow(/decision|status/i);
  });

  it.each([
    ["Admin proof", "admin_proof", "Please revise the finish."],
    ["Client portal", "client_portal", ""]
  ])("allows a complete %s request-changes CAS update", async (_label, decisionSource, decisionNote) => {
    vi.spyOn(EstimateClientReviewRoundModel.collection, "updateOne").mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null
    } as never);

    await expect(
      EstimateClientReviewRoundModel.updateOne(
        { _id: "review-round-1", status: "pending", version: 1 },
        {
          $set: {
            status: "changes_requested",
            decision: "request_changes",
            decisionSource,
            decisionNote,
            decidedById: decisionSource === "admin_proof" ? "admin-1" : "client-1",
            decidedAt: NOW
          },
          $inc: { version: 1 }
        },
        { runValidators: true }
      )
    ).resolves.toEqual(expect.objectContaining({ matchedCount: 1 }));
  });

  it.each([
    ["pending decision", { decision: "approve" }],
    ["pending source", { decisionSource: "client_portal" }],
    ["pending note", { decisionNote: "unexpected" }],
    ["pending actor", { decidedById: "client-1" }],
    ["pending time", { decidedAt: NOW }],
    ["terminal decision", { status: "approved", decisionSource: "admin_proof", decisionNote: "", decidedById: "admin-1", decidedAt: NOW }],
    ["terminal source", { status: "approved", decision: "approve", decisionNote: "", decidedById: "admin-1", decidedAt: NOW }],
    ["terminal note", { status: "approved", decision: "approve", decisionSource: "admin_proof", decidedById: "admin-1", decidedAt: NOW }],
    ["terminal actor", { status: "approved", decision: "approve", decisionSource: "admin_proof", decisionNote: "", decidedAt: NOW }],
    ["terminal time", { status: "approved", decision: "approve", decisionSource: "admin_proof", decisionNote: "", decidedById: "admin-1" }],
    ["mismatched status and decision", { status: "approved", decision: "request_changes", decisionSource: "admin_proof", decisionNote: "Please revise", decidedById: "admin-1", decidedAt: NOW }],
    ["empty changes note", { status: "changes_requested", decision: "request_changes", decisionSource: "admin_proof", decisionNote: "", decidedById: "admin-1", decidedAt: NOW }],
    ["long decision note", { status: "approved", decision: "approve", decisionSource: "admin_proof", decisionNote: "x".repeat(ESTIMATE_CLIENT_DECISION_NOTE_MAX + 1), decidedById: "admin-1", decidedAt: NOW }]
  ])("rejects inconsistent %s metadata", async (_label, overrides) => {
    await expect(round(overrides).validate()).rejects.toThrow(/decision|status/i);
  });

  it("marks the publication snapshot and storage identity immutable and hidden", () => {
    expect(EstimateClientReviewRoundModel.schema.path("estimateSnapshot").options.immutable).toBe(true);
    expect(EstimateClientReviewRoundModel.schema.path("pdfStorageReference").options).toEqual(
      expect.objectContaining({ immutable: true, select: false })
    );
  });

  it("registers exactly the dedupe, generation, queue, history, and dashboard delivery indexes", () => {
    expect(EstimateClientReviewRoundModel.schema.indexes()).toEqual([
      [{ dedupeKey: 1 }, { unique: true }],
      [{ estimateId: 1, sendGeneration: 1 }, { unique: true }],
      [{ assignedAdminId: 1, status: 1, createdAt: -1, _id: 1 }, {}],
      [{ estimateId: 1, createdAt: -1, _id: 1 }, {}],
      [{ projectId: 1, deliveryStatus: 1 }, {}]
    ]);
  });
});

describe("EstimateClientResponseProof persistence model", () => {
  it.each(["application/pdf", "image/jpeg", "image/png", "image/webp"])(
    "accepts the closed proof MIME type %s",
    async (mimeType) => {
      await expect(proof({ mimeType }).validate()).resolves.toBeUndefined();
    }
  );

  it.each([
    ["unknown MIME", { mimeType: "text/plain" }],
    ["empty proof", { byteSize: 0 }],
    ["uppercase SHA", { sha256: "C".repeat(64) }]
  ])("rejects an invalid %s", async (_label, overrides) => {
    await expect(proof(overrides).validate()).rejects.toThrow();
  });

  it("makes proof identity immutable, hides its storage reference, and declares one proof per round", () => {
    for (const path of [
      "_id",
      "reviewRoundId",
      "estimateId",
      "storageReference",
      "originalFilename",
      "mimeType",
      "byteSize",
      "sha256",
      "uploadedById",
      "uploadedAt"
    ]) {
      expect(EstimateClientResponseProofModel.schema.path(path).options.immutable).toBe(true);
    }
    expect(EstimateClientResponseProofModel.schema.path("storageReference").options.select).toBe(false);
    expect(EstimateClientResponseProofModel.schema.indexes()).toEqual([
      [{ reviewRoundId: 1 }, { unique: true }]
    ]);
  });

  it("prepares both model indexes explicitly with createIndexes", async () => {
    const roundCreateIndexes = EstimateClientReviewRoundModel.createIndexes;
    const proofCreateIndexes = EstimateClientResponseProofModel.createIndexes;
    let roundCalls = 0;
    let proofCalls = 0;
    EstimateClientReviewRoundModel.createIndexes = (async () => {
      roundCalls += 1;
      return [];
    }) as typeof EstimateClientReviewRoundModel.createIndexes;
    EstimateClientResponseProofModel.createIndexes = (async () => {
      proofCalls += 1;
      return [];
    }) as typeof EstimateClientResponseProofModel.createIndexes;

    try {
      await prepareEstimateClientReviewIndexes();
      expect(roundCalls).toBe(1);
      expect(proofCalls).toBe(1);
    } finally {
      EstimateClientReviewRoundModel.createIndexes = roundCreateIndexes;
      EstimateClientResponseProofModel.createIndexes = proofCreateIndexes;
    }
  });
});
