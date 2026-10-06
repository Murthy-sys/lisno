import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { errorHandler } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { UserModel } from "../src/models/User.js";
import { VendorBasketRequestModel } from "../src/models/VendorBasketRequest.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createVendorBasketRequestRouter } from "../src/routes/vendor-basket-requests.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createVendorBasketRequestService } from "../src/services/vendor-basket-request.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const ADMIN: PublicUser = { id: "basket-request-admin", role: "super_admin", name: "Admin Fixture", email: "admin@basket.invalid" };
const PROCUREMENT: PublicUser = { id: "basket-request-procurement", role: "procurement", name: "Procurement Fixture", email: "procurement@basket.invalid" };
const OTHER: PublicUser = { id: "basket-request-other", role: "procurement", name: "Other Fixture", email: "other@basket.invalid" };
const input = { vendorName: "Painting Vendor", proposedName: "Painting", idempotencyKey: "request-key-one" };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-basket-request");
  await Promise.all([AuditEventModel, AuthorizationCoordinationModel, AiEstimatorKnowledgeBasketModel,
    AiEstimatorKnowledgeDisplayOrderSequenceModel, AiEstimatorKnowledgeVendorModel,
    UserModel, VendorBasketRequestModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  for (const actor of [ADMIN, PROCUREMENT, OTHER]) {
    await UserModel.create({ _id: actor.id, name: actor.name, email: actor.email,
      emailNormalized: actor.email, passwordHash: "fixture-only", role: actor.role, active: true });
  }
});
afterAll(async () => { await replica.stop(); });

function fixture() {
  const audit = createAuditService(createMemoryRepository());
  const service = createVendorBasketRequestService({ audit });
  const reference = createAiEstimatorKnowledgeReferenceService({ audit });
  return { service, reference };
}

function api() {
  const { service } = fixture();
  const actors: Record<string, PublicUser> = { admin: ADMIN, procurement: PROCUREMENT, other: OTHER };
  const auth = { authenticate: async (token: string) => actors[token] ?? PROCUREMENT } as AuthService;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createVendorBasketRequestRouter(auth, service));
  app.use(errorHandler);
  return app;
}

describe("Configuration Main Basket requests", { timeout: 30_000 }, () => {
  it("keeps a Procurement proposal pending without creating or assigning a Configuration basket", async () => {
    const { service } = fixture();
    const created = await service.create(PROCUREMENT, input);
    expect(created).toMatchObject({ requesterId: PROCUREMENT.id, vendorId: null,
      vendorName: "Painting Vendor", proposedName: "Painting", status: "pending", version: 1,
      basketId: null, reason: null, decidedAt: null, decidedById: null });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(0);
    expect(await service.create(PROCUREMENT, input)).toEqual(created);
    await expect(service.create(PROCUREMENT, { ...input, proposedName: "Gypsum" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(service.create(OTHER, { ...input, idempotencyKey: "another-key" })).rejects.toMatchObject({ code: "REQUEST_PENDING" });
    expect(await VendorBasketRequestModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_request_created" })).toBe(1);
  });

  it("revalidates Procurement identity before returning an idempotent request replay", async () => {
    const { service } = fixture();
    await service.create(PROCUREMENT, input);
    await UserModel.updateOne({ _id: PROCUREMENT.id }, { $set: { active: false } });
    await expect(service.create(PROCUREMENT, input)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await UserModel.updateOne({ _id: PROCUREMENT.id }, { $set: { active: true, role: "admin" } });
    await expect(service.create(PROCUREMENT, input)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("serializes competing proposals and keeps one auditable pending request", async () => {
    const { service } = fixture();
    const outcomes = await Promise.allSettled([
      service.create(PROCUREMENT, { ...input, idempotencyKey: "racing-key-one" }),
      service.create(OTHER, { ...input, idempotencyKey: "racing-key-two" })
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await VendorBasketRequestModel.countDocuments({ status: "pending" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_request_created" })).toBe(1);
  });

  it("deduplicates an unsaved vendor request after the same vendor is saved", async () => {
    const { service, reference } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const savedVendor = await reference.createMaster(ADMIN, "vendors", { name: "Painting Vendor" });
    await expect(service.create(PROCUREMENT, { ...input, vendorId: savedVendor.id,
      vendorName: "  PAINTING   Vendor  ", idempotencyKey: "saved-vendor-key" }))
      .rejects.toMatchObject({ code: "REQUEST_PENDING" });
    expect(await VendorBasketRequestModel.countDocuments()).toBe(1);
    expect((await service.listMine(PROCUREMENT, { limit: 20, offset: 0 })).items[0]?.id).toBe(pending.id);
  });

  it("rolls back the request when its audit write fails", async () => {
    const service = createVendorBasketRequestService({ audit: {
      appendInMongoTransaction: async () => { throw new Error("fixture audit failure"); }
    } });
    await expect(service.create(PROCUREMENT, input)).rejects.toThrow("fixture audit failure");
    expect(await VendorBasketRequestModel.countDocuments()).toBe(0);
  });

  it("fulfills once, audits the decision and exposes only the requester's own status", async () => {
    const { service, reference } = fixture();
    const created = await service.create(PROCUREMENT, input);
    const decision = { decision: "fulfill" as const, expectedVersion: 1, idempotencyKey: "decision-key-one" };
    const fulfilled = await service.decide(ADMIN, created.id, decision);
    expect(fulfilled).toMatchObject({ status: "fulfilled", version: 2,
      decidedById: ADMIN.id, basketId: expect.any(String) });
    expect(await service.decide(ADMIN, created.id, decision)).toEqual(fulfilled);
    await expect(service.decide(ADMIN, created.id, { ...decision, idempotencyKey: "decision-key-two" }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({ status: "active" })).toBe(1);
    expect((await reference.listBaskets(PROCUREMENT, { status: "active" }, { limit: 20, offset: 0 })).items[0]?.id).toBe(fulfilled.basketId);
    expect((await service.listMine(PROCUREMENT, { limit: 20, offset: 0 })).items).toEqual([fulfilled]);
    expect((await service.listMine(OTHER, { limit: 20, offset: 0 })).items).toEqual([]);
    expect((await service.listForAdmin(ADMIN, "fulfilled", { limit: 20, offset: 0 })).pagination)
      .toEqual({ total: 1, limit: 20, offset: 0, hasMore: false });
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_request_fulfilled" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_basket_created" })).toBe(1);
  });

  it("commits only one basket and decision when two admins decide the same pending version concurrently", async () => {
    const { service } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const outcomes = await Promise.allSettled([
      service.decide(ADMIN, pending.id, { decision: "fulfill", expectedVersion: 1, idempotencyKey: "race-decision-one" }),
      service.decide(ADMIN, pending.id, { decision: "fulfill", expectedVersion: 1, idempotencyKey: "race-decision-two" })
    ]);
    const committed = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(committed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await VendorBasketRequestModel.findById(pending.id).lean()).toMatchObject({ status: "fulfilled", version: 2 });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({ status: "active" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_request_fulfilled" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_basket_created" })).toBe(1);
  });

  it("rolls back the decision, created basket and basket audit if the decision audit fails", async () => {
    const { service } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const audit = createAuditService(createMemoryRepository());
    const failingDecision = createVendorBasketRequestService({ audit: {
      appendInMongoTransaction: async (entry, session) => {
        if (entry.action === "vendor_basket_request_fulfilled") throw new Error("fixture decision audit failure");
        return audit.appendInMongoTransaction(entry, session);
      }
    } });
    await expect(failingDecision.decide(ADMIN, pending.id, {
      decision: "fulfill", expectedVersion: 1, idempotencyKey: "decision-audit-failure"
    })).rejects.toThrow("fixture decision audit failure");
    expect(await VendorBasketRequestModel.findById(pending.id).lean()).toMatchObject({
      status: "pending", version: 1, basketId: null, decidedAt: null, decidedById: null
    });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_basket_created" })).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_request_fulfilled" })).toBe(0);
  });

  it("links a matching active Configuration basket, and blocks an inactive match", async () => {
    const { service, reference } = fixture();
    const created = await service.create(PROCUREMENT, input);
    const existing = await reference.createBasket(ADMIN, { name: "Painting" });
    const fulfilled = await service.decide(ADMIN, created.id, { decision: "fulfill", expectedVersion: 1, idempotencyKey: "link-key-one" });
    expect(fulfilled.basketId).toBe(existing.id);
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(1);

    const next = await service.create(PROCUREMENT, { ...input, proposedName: "Gypsum", idempotencyKey: "request-key-two" });
    await reference.createBasket(ADMIN, { name: "Gypsum", status: "inactive" });
    await expect(service.decide(ADMIN, next.id, { decision: "fulfill", expectedVersion: 1, idempotencyKey: "inactive-key" }))
      .rejects.toMatchObject({ code: "BASKET_INACTIVE" });
    expect((await VendorBasketRequestModel.findById(next.id).lean())?.status).toBe("pending");
    await expect(service.create(PROCUREMENT, { ...input, idempotencyKey: "request-key-three" }))
      .rejects.toMatchObject({ code: "BASKET_EXISTS" });
  });

  it("requires a rejection reason and never changes Configuration for rejection", async () => {
    const { service } = fixture();
    const created = await service.create(PROCUREMENT, input);
    await expect(service.decide(ADMIN, created.id, { decision: "reject", expectedVersion: 1, idempotencyKey: "reject-key-one" }))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const rejected = await service.decide(ADMIN, created.id, { decision: "reject", expectedVersion: 1,
      reason: "Outside our categories", idempotencyKey: "reject-key-one" });
    expect(rejected).toMatchObject({ status: "rejected", reason: "Outside our categories", basketId: null,
      version: 2, decidedById: ADMIN.id });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_request_rejected" })).toBe(1);
  });

  it("routes requests by role and keeps direct Main Basket creation Super Admin only", async () => {
    const app = api();
    const procurementRequest = await request(app).post("/api/v1/procurement/vendor-basket-requests")
      .set("Authorization", "Bearer procurement").send(input);
    expect(procurementRequest.status).toBe(201);
    const id = procurementRequest.body.data.id as string;
    const forbiddenDecision = await request(app).post(`/api/v1/admin/ai-estimator-knowledge/basket-requests/${id}/decision`)
      .set("Authorization", "Bearer procurement")
      .send({ decision: "fulfill", expectedVersion: 1, idempotencyKey: "route-decision-key" });
    expect(forbiddenDecision.status).toBe(403);
    const forbiddenCreate = await request(app).post("/api/v1/procurement/vendor-basket-requests")
      .set("Authorization", "Bearer admin").send({ ...input, idempotencyKey: "admin-request-key" });
    expect(forbiddenCreate.status).toBe(403);
    expect((await request(app).get("/api/v1/procurement/vendor-basket-requests/mine")
      .set("Authorization", "Bearer other")).body.data.pagination.total).toBe(0);
    expect((await request(app).get("/api/v1/admin/ai-estimator-knowledge/basket-requests?status=pending")
      .set("Authorization", "Bearer admin")).body.data.items[0]?.id).toBe(id);
    expect((await request(app).get("/api/v1/admin/ai-estimator-knowledge/basket-requests")
      .set("Authorization", "Bearer procurement")).status).toBe(403);
    const fulfilled = await request(app).post(`/api/v1/admin/ai-estimator-knowledge/basket-requests/${id}/decision`)
      .set("Authorization", "Bearer admin")
      .send({ decision: "fulfill", expectedVersion: 1, idempotencyKey: "route-decision-key" });
    expect(fulfilled.status).toBe(200);
    expect(fulfilled.body.data.status).toBe("fulfilled");
  });
});
