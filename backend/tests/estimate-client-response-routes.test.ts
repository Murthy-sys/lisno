import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authorizationSnapshotFor, type PublicUser } from "../src/services/auth.service.js";
import type { AuthService } from "../src/services/auth.service.js";
import type { EstimateClientReviewService } from "../src/services/estimate-client-review.service.js";
import type { EstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";
import type { EstimateDecisionService } from "../src/services/estimate-decision.service.js";
import type { EstimateDeliveryService } from "../src/services/estimate-delivery.service.js";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { createEstimateClientResponsesRouter } from "../src/routes/estimate-client-responses.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PDF = Buffer.from("%PDF-1.7\nstored-client-estimate\n%%EOF");
const PROOF = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const actors = {
  admin: actor("admin-1", "admin"),
  otherAdmin: actor("admin-2", "admin"),
  superAdmin: actor("super-1", "super_admin"),
  estimator: actor("sales-1", "estimator_sales"),
  otherEstimator: actor("sales-2", "estimator_sales"),
  designer: actor("designer-1", "designer"),
  client: actor("client-1", "client")
} as const;

const listItems = [
  {
    id: "round-pending",
    version: 4,
    sendGeneration: 2,
    project: { id: "project-1", name: "Aurora Villa" },
    client: { name: "Rhea Kapoor", email: "rhea@example.com" },
    estimate: { id: "estimate-1", version: 3, total: 1416 },
    assignedAdmin: { id: "admin-1", name: "Admin One" },
    deliveryStatus: "sent" as const,
    deliveryAttemptCount: 1,
    deliveryAttemptedAt: "2026-08-24T10:00:01.000Z",
    deliveredAt: "2026-08-24T10:00:02.000Z",
    status: "pending" as const,
    decision: null,
    proofAvailable: false,
    createdAt: "2026-08-24T10:00:00.000Z"
  },
  {
    id: "round-approved",
    version: 2,
    sendGeneration: 1,
    project: { id: "project-2", name: "Banyan Home" },
    client: { name: "Asha Shah", email: "asha@example.com" },
    estimate: { id: "estimate-2", version: 1, total: 900 },
    assignedAdmin: { id: "admin-1", name: "Admin One" },
    deliveryStatus: "disabled" as const,
    deliveryAttemptCount: 0,
    deliveryAttemptedAt: null,
    deliveredAt: null,
    status: "approved" as const,
    decision: "approve" as const,
    proofAvailable: true,
    createdAt: "2026-08-24T11:00:00.000Z"
  }
] as const;

const detail = {
  ...listItems[0],
  estimateSnapshot: {
    clientName: "Rhea Kapoor",
    projectName: "Aurora Villa",
    location: "Bengaluru",
    propertyType: "Villa",
    lineItems: [{
      catalogueId: "FC01",
      roomName: "Living Room",
      specification: "Premium finish",
      unit: "sqft",
      rate: 120,
      quantity: 10,
      included: true,
      amount: 1200
    }],
    subtotal: 1200,
    gst: 216,
    total: 1416
  },
  pdf: {
    filename: "lisno-estimate-v3.pdf",
    mimeType: "application/pdf" as const,
    byteSize: PDF.byteLength,
    sha256: "a".repeat(64)
  },
  decisionSource: null,
  decisionNote: null,
  decidedBy: null,
  decidedAt: null
};

type Harness = ReturnType<typeof createHarness>;

beforeEach(() => vi.restoreAllMocks());

describe("estimate client response routes", () => {
  it("returns the stable pending-first page with strict filters and bounded pagination", async () => {
    const harness = createHarness();

    const response = await request(harness.app)
      .get("/api/v1/admin/estimate-client-response-tasks?status=pending&limit=2&offset=1")
      .set(authorization(actors.admin))
      .expect(200);

    expect(response.body).toEqual({
      data: {
        items: listItems,
        pagination: { limit: 2, offset: 1, total: 4, hasMore: true }
      }
    });
    expect(response.body.data.items.map(({ status }: { status: string }) => status)).toEqual([
      "pending",
      "approved"
    ]);
    expect(harness.reviews.list).toHaveBeenCalledWith(
      actors.admin,
      { status: "pending" },
      { limit: 2, offset: 1 }
    );

    for (const query of [
      "status=draft",
      "limit=0",
      "limit=101",
      "offset=-1",
      "limit=2&extra=true"
    ]) {
      await request(harness.app)
        .get(`/api/v1/admin/estimate-client-response-tasks?${query}`)
        .set(authorization(actors.admin))
        .expect(400);
    }
  });

  it("returns the exact safe detail shape without storage-bearing fields", async () => {
    const harness = createHarness();

    const response = await request(harness.app)
      .get("/api/v1/admin/estimate-client-response-tasks/round-pending")
      .set(authorization(actors.admin))
      .expect(200);

    expect(response.body).toEqual({ data: detail });
    expect(JSON.stringify(response.body)).not.toMatch(
      /storageReference|recipientEmailNormalized|pdfStorageReference|uploadedById/
    );
  });

  it("serves the immutable stored PDF and proof bytes with stored download metadata", async () => {
    const harness = createHarness();

    const [pdf, proof] = await Promise.all([
      request(harness.app)
        .get("/api/v1/admin/estimate-client-response-tasks/round-pending/pdf")
        .set(authorization(actors.admin))
        .expect(200),
      request(harness.app)
        .get("/api/v1/admin/estimate-client-response-tasks/round-pending/proof")
        .set(authorization(actors.estimator))
        .expect(200)
    ]);

    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toBe(
      'attachment; filename="lisno-estimate-v3.pdf"'
    );
    expect(pdf.body).toEqual(PDF);
    expect(proof.headers["content-type"]).toBe("image/png");
    expect(proof.headers["content-disposition"]).toBe(
      'attachment; filename="client-approval.png"'
    );
    expect(proof.body).toEqual(PROOF);
  });

  it("requires authentication and coarse permissions before any service or upload work", async () => {
    const harness = createHarness();

    await request(harness.app)
      .get("/api/v1/admin/estimate-client-response-tasks")
      .expect(401);
    await request(harness.app)
      .post("/api/v1/admin/estimate-client-response-tasks/round-pending/decision")
      .set(authorization(actors.designer))
      .attach("wrong", JPEG, { filename: "wrong.jpg", contentType: "image/jpeg" })
      .expect(403);
    await request(harness.app)
      .post("/api/v1/estimates/estimate-1/client-email/retry")
      .set(authorization(actors.admin))
      .send({ roundId: "round-pending", version: 4 })
      .expect(403);

    expect(harness.reviews.list).not.toHaveBeenCalled();
    expect(harness.reviews.requireDecisionScope).not.toHaveBeenCalled();
    expect(harness.storage.saveProof).not.toHaveBeenCalled();
    expect(harness.delivery.retry).not.toHaveBeenCalled();
  });

  it("enforces Admin assignment scope before Multer and hides a foreign task", async () => {
    const harness = createHarness();
    harness.reviews.requireDecisionScope.mockRejectedValueOnce(notFound());

    const response = await request(harness.app)
      .post("/api/v1/admin/estimate-client-response-tasks/foreign-round/decision")
      .set(authorization(actors.otherAdmin))
      .attach("wrong", JPEG, { filename: "wrong.jpg", contentType: "image/jpeg" })
      .expect(404);

    expect(response.body).toEqual(notFoundBody());
    expect(harness.reviews.requireDecisionScope).toHaveBeenCalledWith(
      actors.otherAdmin,
      "foreign-round"
    );
    expect(harness.reviews.detail).not.toHaveBeenCalled();
    expect(harness.storage.saveProof).not.toHaveBeenCalled();
    expect(harness.decisions.decide).not.toHaveBeenCalled();
  });

  it("validates multipart decisions, saves one proof, and delegates the shared decision", async () => {
    const harness = createHarness();

    const response = await validDecisionRequest(harness, actors.admin)
      .field("decision", "approve")
      .field("note", "Client approved in person.")
      .field("version", "4")
      .attach("proof", JPEG, { filename: "approval.jpg", contentType: "image/jpeg" })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        estimate: { id: "estimate-1", status: "client_approved", version: 4 },
        clientReview: {
          id: "round-pending",
          sendGeneration: 2,
          estimateVersion: 3,
          version: 5,
          deliveryStatus: "sent",
          deliveryAttemptCount: 1,
          deliveredAt: "2026-08-24T10:00:02.000Z",
          status: "approved"
        }
      }
    });
    expect(harness.storage.saveProof).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: "approval.jpg",
        mimeType: "image/jpeg",
        extension: ".jpg"
      })
    );
    expect(harness.decisions.decide).toHaveBeenCalledWith({
      estimateId: "estimate-1",
      round: { id: "round-pending", expectedVersion: 4 },
      decision: "approve",
      note: "Client approved in person.",
      context: {
        source: "admin_proof",
        actor: actors.admin,
        proof: {
          storageReference: "proofs/approval.jpg",
          originalFilename: "approval.jpg",
          mimeType: "image/jpeg",
          byteSize: JPEG.byteLength,
          sha256: "b".repeat(64)
        }
      }
    });
    expect(harness.storage.deleteQuietly).not.toHaveBeenCalled();
  });

  it("rejects missing notes, unsupported proof types, extra fields, and invalid versions", async () => {
    for (const submit of [
      (harness: Harness) => validDecisionRequest(harness, actors.admin)
        .field("decision", "request_changes")
        .field("note", "   ")
        .field("version", "4")
        .attach("proof", JPEG, { filename: "proof.jpg", contentType: "image/jpeg" }),
      (harness: Harness) => validDecisionRequest(harness, actors.admin)
        .field("decision", "approve")
        .field("note", "")
        .field("version", "0")
        .attach("proof", JPEG, { filename: "proof.jpg", contentType: "image/jpeg" }),
      (harness: Harness) => validDecisionRequest(harness, actors.admin)
        .field("decision", "approve")
        .field("note", "")
        .field("version", "4")
        .field("extra", "forged")
        .attach("proof", JPEG, { filename: "proof.jpg", contentType: "image/jpeg" }),
      (harness: Harness) => validDecisionRequest(harness, actors.admin)
        .field("decision", "approve")
        .field("note", "")
        .field("version", "4")
        .attach("proof", Buffer.from("plain text"), {
          filename: "proof.txt",
          contentType: "text/plain"
        })
    ]) {
      const harness = createHarness();
      await submit(harness).expect((response) => {
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      });
      expect(harness.decisions.decide).not.toHaveBeenCalled();
    }
  });

  it("deletes a newly stored proof when the shared decision fails", async () => {
    const harness = createHarness();
    harness.decisions.decide.mockRejectedValueOnce(
      new ApiError(409, "ESTIMATE_NOT_REVIEWABLE", "This estimate is no longer awaiting review.")
    );

    await validDecisionRequest(harness, actors.superAdmin)
      .field("decision", "approve")
      .field("note", "")
      .field("version", "4")
      .attach("proof", JPEG, { filename: "approval.jpg", contentType: "image/jpeg" })
      .expect(409);

    expect(harness.storage.deleteQuietly).toHaveBeenCalledOnce();
    expect(harness.storage.deleteQuietly).toHaveBeenCalledWith("proofs/approval.jpg");
  });

  it("validates retry JSON and delegates only owner-scoped Estimator/Sales or Super Admin", async () => {
    const harness = createHarness();

    const response = await request(harness.app)
      .post("/api/v1/estimates/estimate-1/client-email/retry")
      .set(authorization(actors.estimator))
      .send({ roundId: "round-pending", version: 4 })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        id: "round-pending",
        sendGeneration: 2,
        estimateVersion: 3,
        version: 5,
        deliveryStatus: "sent",
        deliveryAttemptCount: 2,
        deliveredAt: "2026-08-24T10:05:00.000Z",
        status: "pending"
      }
    });
    expect(harness.delivery.retry).toHaveBeenCalledWith(actors.estimator, {
      estimateId: "estimate-1",
      roundId: "round-pending",
      version: 4
    });

    for (const body of [
      { roundId: "", version: 4 },
      { roundId: "round-pending", version: 0 },
      { roundId: "round-pending", version: "4" },
      { roundId: "round-pending", version: 4, extra: true }
    ]) {
      await request(harness.app)
        .post("/api/v1/estimates/estimate-1/client-email/retry")
        .set(authorization(actors.superAdmin))
        .send(body)
        .expect(400);
    }

    harness.delivery.retry.mockRejectedValueOnce(notFound());
    const foreign = await request(harness.app)
      .post("/api/v1/estimates/estimate-1/client-email/retry")
      .set(authorization(actors.otherEstimator))
      .send({ roundId: "foreign-round", version: 4 })
      .expect(404);
    expect(foreign.body).toEqual(notFoundBody());
  });

  it("uses one indistinguishable not-found envelope for missing or foreign detail, PDF, and proof", async () => {
    const harness = createHarness();
    harness.reviews.detail.mockRejectedValueOnce(notFound()).mockRejectedValueOnce(notFound());
    harness.reviews.readPdf.mockRejectedValueOnce(notFound()).mockRejectedValueOnce(notFound());
    harness.reviews.readProof.mockRejectedValueOnce(notFound()).mockRejectedValueOnce(notFound());

    for (const actorValue of [actors.admin, actors.otherAdmin]) {
      const [detailResponse, pdfResponse, proofResponse] = await Promise.all([
        request(harness.app)
          .get("/api/v1/admin/estimate-client-response-tasks/hidden")
          .set(authorization(actorValue)),
        request(harness.app)
          .get("/api/v1/admin/estimate-client-response-tasks/hidden/pdf")
          .set(authorization(actorValue)),
        request(harness.app)
          .get("/api/v1/admin/estimate-client-response-tasks/hidden/proof")
          .set(authorization(actorValue))
      ]);
      expect(detailResponse.status).toBe(404);
      expect(pdfResponse.status).toBe(404);
      expect(proofResponse.status).toBe(404);
      expect(detailResponse.body).toEqual(notFoundBody());
      expect(pdfResponse.body).toEqual(notFoundBody());
      expect(proofResponse.body).toEqual(notFoundBody());
    }
  });
});

function actor(id: string, role: PublicUser["role"]): PublicUser {
  return { id, role, name: id, email: `${id}@example.com` };
}

function authorization(value: PublicUser): Record<string, string> {
  return { Authorization: `Bearer ${value.id}` };
}

function notFound(): ApiError {
  return new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

function notFoundBody() {
  return { error: { code: "NOT_FOUND", message: "The requested resource was not found." } };
}

function validDecisionRequest(harness: Harness, actorValue: PublicUser) {
  return request(harness.app)
    .post("/api/v1/admin/estimate-client-response-tasks/round-pending/decision")
    .set(authorization(actorValue));
}

function createHarness() {
  const byToken = new Map(
    Object.values(actors).map((value) => [value.id, value])
  );
  const auth = {
    login: vi.fn(),
    signupClient: vi.fn(),
    authenticate: vi.fn(async (token: string) => {
      const value = byToken.get(token);
      if (!value) throw new Error("Unknown test actor.");
      return value;
    }),
    authorization: authorizationSnapshotFor
  } as unknown as AuthService;
  const reviews = {
    resolveReviewAssignee: vi.fn(),
    currentSummaryForEstimate: vi.fn(),
    currentRoundForClientEstimate: vi.fn(),
    list: vi.fn(async () => ({ items: [...listItems], total: 4 })),
    detail: vi.fn(async () => detail),
    readPdf: vi.fn(async () => ({
      filename: "lisno-estimate-v3.pdf",
      mimeType: "application/pdf" as const,
      bytes: PDF
    })),
    readClientPdf: vi.fn(),
    readProof: vi.fn(async () => ({
      filename: "client-approval.png",
      mimeType: "image/png" as const,
      bytes: PROOF
    })),
    requireDecisionScope: vi.fn(async () => undefined),
    requireRetryScope: vi.fn()
  } satisfies EstimateClientReviewService;
  const storage = {
    savePdfSnapshot: vi.fn(),
    saveProof: vi.fn(async () => ({
      storageReference: "proofs/approval.jpg",
      originalFilename: "approval.jpg",
      mimeType: "image/jpeg" as const,
      byteSize: JPEG.byteLength,
      sha256: "b".repeat(64)
    })),
    read: vi.fn(),
    deleteQuietly: vi.fn(async () => undefined)
  } satisfies EstimateClientReviewStorage;
  const decisions = {
    decide: vi.fn(async () => ({
      estimate: { id: "estimate-1", status: "client_approved", version: 4 },
      clientReview: {
        id: "round-pending",
        sendGeneration: 2,
        estimateVersion: 3,
        version: 5,
        deliveryStatus: "sent" as const,
        deliveryAttemptCount: 1,
        deliveredAt: "2026-08-24T10:00:02.000Z",
        status: "approved" as const
      }
    }))
  } satisfies EstimateDecisionService;
  const delivery = {
    deliverInitial: vi.fn(),
    retry: vi.fn(async () => ({
      id: "round-pending",
      sendGeneration: 2,
      estimateVersion: 3,
      version: 5,
      deliveryStatus: "sent" as const,
      deliveryAttemptCount: 2,
      deliveredAt: "2026-08-24T10:05:00.000Z",
      status: "pending" as const
    }))
  } satisfies EstimateDeliveryService;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createEstimateClientResponsesRouter(
      auth,
      reviews,
      storage,
      decisions,
      delivery,
      1024 * 1024
    )
  );
  app.use(errorHandler);

  return { app, auth, reviews, storage, decisions, delivery };
}
