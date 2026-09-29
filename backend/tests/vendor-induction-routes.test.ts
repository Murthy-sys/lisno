import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ROLE_CODES } from "../src/domain/roles.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createVendorInductionRouter } from "../src/routes/vendor-induction.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import type { VendorInductionService } from "../src/services/vendor-induction.service.js";

const actor: PublicUser = { id: "synthetic-user", name: "Synthetic user", email: "user@example.invalid", role: "procurement" };
const result = { vendor: { id: "vendor-a", name: "Synthetic vendor", vendorType: "execution", emailAvailable: true },
  activation: { lifecycleStatus: "active", effectiveStatus: "under_review", gates: { inductionApproved: false, vendorSelfKpiComplete: false,
    procurementKpiComplete: false, profileComplete: true, physicalAddressVerified: true } },
  draft: null, published: null, request: null, requestEligibility: "ready", submission: null, review: null, history: { submissions: [], reviews: [] } } as const;
const question = { id: "safety", key: "safety", section: "Safety", prompt: "Do you use PPE?", helpText: null,
  type: "yes_no", required: true, enabled: true, options: [], unit: null, min: null, max: null, showIf: null } as const;
const body = { expectedVersion: null, idempotencyKey: "save-draft-001", vendorType: "execution", questions: [question] };
const path = "/api/v1/procurement/vendor-inductions/vendor-a";
function harness() {
  const service = { read: vi.fn(async () => result), saveDraft: vi.fn(async () => result), publish: vi.fn(async () => result),
    request: vi.fn(async () => result), review: vi.fn(async () => result), reopen: vi.fn(async () => result),
    inspect: vi.fn(async () => ({ vendor: { name: "Synthetic vendor", vendorType: "execution", workProfile: "Interior installation",
      representativeName: "Synthetic representative", representativePosition: "Owner" },
      questionnaire: { id: "q1", version: 1, vendorType: "execution", questions: [question], publishedAt: "2026-09-28T00:00:00.000Z" },
      changeNote: null, expiresAt: "2026-09-29T00:00:00.000Z" })),
    submit: vi.fn(async () => ({ submittedAt: "2026-09-28T00:00:00.000Z" })) } as unknown as VendorInductionService;
  const auth = { authenticate: vi.fn(async (role: string) => ({ ...actor, role })) } as unknown as AuthService;
  const publicHeaders: unknown[] = [];
  const publicLimit: RequestHandler = (req, _res, next) => { publicHeaders.push({ authorization: req.headers.authorization, cookie: req.headers.cookie }); next(); };
  const deliveryLimit = vi.fn(((_req, _res, next) => next()) as RequestHandler);
  const app = express(); app.use(express.json()); app.use("/api/v1", createVendorInductionRouter(auth, service, publicLimit, deliveryLimit)); app.use(errorHandler);
  return { app, service, auth, publicHeaders, deliveryLimit };
}

describe("Vendor induction HTTP boundary", () => {
  it.each(["procurement", "super_admin"] as const)("allows %s to author, request and review", async role => {
    const { app, service, deliveryLimit } = harness(); const auth = `Bearer ${role}`;
    await request(app).get(path).set("Authorization", auth).expect(200);
    await request(app).put(`${path}/draft`).set("Authorization", auth).send(body).expect(200);
    await request(app).post(`${path}/publish`).set("Authorization", auth).send({ expectedDraftVersion: 1, idempotencyKey: "publish-001" }).expect(200);
    await request(app).post(`${path}/requests`).set("Authorization", auth).send({ expectedRequestVersion: null, idempotencyKey: "request-001" }).expect(200);
    await request(app).post(`${path}/reviews`).set("Authorization", auth).send({ submissionId: "submission-1", decision: "approved", reason: null, expectedReviewVersion: null, idempotencyKey: "review-001" }).expect(200);
    await request(app).post(`${path}/reopen`).set("Authorization", auth).send({ reason: "New safety evidence needed", expectedReviewVersion: 1, idempotencyKey: "reopen-001" }).expect(200);
    expect(service.saveDraft).toHaveBeenCalledWith({ ...actor, role }, "vendor-a", body);
    expect(deliveryLimit).toHaveBeenCalledTimes(1);
  });
  it.each(ROLE_CODES.filter(role => !["procurement", "super_admin"].includes(role)))("denies %s all staff operations", async role => {
    const { app, service } = harness(); const auth = `Bearer ${role}`;
    await request(app).get(path).set("Authorization", auth).expect(403);
    await request(app).put(`${path}/draft`).set("Authorization", auth).send(body).expect(403);
    await request(app).post(`${path}/publish`).set("Authorization", auth).send({ expectedDraftVersion: 1, idempotencyKey: "publish-001" }).expect(403);
    await request(app).post(`${path}/requests`).set("Authorization", auth).send({ expectedRequestVersion: null, idempotencyKey: "request-001" }).expect(403);
    await request(app).post(`${path}/reviews`).set("Authorization", auth).send({ submissionId: "submission-1", decision: "approved", reason: null, expectedReviewVersion: null, idempotencyKey: "review-001" }).expect(403);
    await request(app).post(`${path}/reopen`).set("Authorization", auth).send({ reason: "New safety evidence needed", expectedReviewVersion: 1, idempotencyKey: "reopen-001" }).expect(403);
    for (const method of [service.read, service.saveDraft, service.publish, service.request, service.review, service.reopen] as unknown as ReturnType<typeof vi.fn>[]) expect(method).not.toHaveBeenCalled();
  });
  it("uses only a body token on public routes and strips staff credentials", async () => {
    const { app, service, auth, publicHeaders } = harness();
    await request(app).get(path).expect(401);
    const inspection = await request(app).post("/api/v1/vendor-induction/inspect").set("Authorization", "Bearer forged")
      .set("Cookie", "session=forged").send({ token: "synthetic-token" }).expect(200);
    expect(inspection.headers["cache-control"]).toBe("no-store");
    expect(inspection.headers["referrer-policy"]).toBe("no-referrer");
    expect(inspection.headers["x-robots-tag"]).toBe("noindex");
    const submitted = await request(app).post("/api/v1/vendor-induction/submit").set("Authorization", "Bearer forged")
      .send({ token: "synthetic-token", idempotencyKey: "submit-001", answers: [{ questionId: "safety", value: true }] }).expect(200);
    expect(submitted.body.data).toEqual({ submittedAt: "2026-09-28T00:00:00.000Z" });
    expect(service.inspect).toHaveBeenCalledWith("synthetic-token");
    expect(publicHeaders).toEqual([{ authorization: undefined, cookie: undefined }, { authorization: undefined, cookie: undefined }]);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });
  it("rejects unexpected authoring and submission fields before service access", async () => {
    const { app, service } = harness();
    await request(app).put(`${path}/draft`).set("Authorization", "Bearer procurement").send({ ...body, actorId: "forged" }).expect(400);
    await request(app).post("/api/v1/vendor-induction/submit").send({ token: "synthetic-token", idempotencyKey: "submit-001", answers: [], procurementApproved: true }).expect(400);
    expect(service.saveDraft).not.toHaveBeenCalled(); expect(service.submit).not.toHaveBeenCalled();
  });
});
