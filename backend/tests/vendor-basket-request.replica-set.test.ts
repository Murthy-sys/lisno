import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS } from "../src/domain/ai-estimator-knowledge.js";
import { errorHandler } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { UserModel } from "../src/models/User.js";
import { VendorBasketRequestModel } from "../src/models/VendorBasketRequest.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createVendorBasketRequestRouter } from "../src/routes/vendor-basket-requests.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAuditService, type AuditService } from "../src/services/audit.service.js";
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
    AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel,
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
afterEach(() => { vi.restoreAllMocks(); });

function fixture(audit: Pick<AuditService, "appendInMongoTransaction"> = createAuditService(createMemoryRepository())) {
  const service = createVendorBasketRequestService({ audit });
  const reference = createAiEstimatorKnowledgeReferenceService({ audit });
  const item = createAiEstimatorKnowledgeItemService({ audit });
  return { service, reference, item, audit };
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

  it("creates the complete draft hierarchy atomically and replays normalized setup with its original IDs", async () => {
    const { service } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const command = { decision: "fulfill" as const, expectedVersion: 1, idempotencyKey: "setup-complete-key",
      configuration: { subBasketName: "  Ceiling   painting  ", mainLineName: "  Ceiling   coat  " } };
    const saved = await service.decide(ADMIN, pending.id, command);
    expect(saved).toMatchObject({ status: "fulfilled", version: 2, basketId: expect.any(String),
      subBasketId: expect.any(String), mainLineId: expect.any(String) });
    const line = await AiEstimatorKnowledgeMainLineModel.findById(saved.mainLineId).lean();
    expect(line).toMatchObject({ basketId: saved.basketId, subBasketId: saved.subBasketId, name: "Ceiling coat",
      status: "draft", itemType: "main_line", activeRevisionId: null, version: 1, displayOrder: 0 });
    expect(await AiEstimatorKnowledgeSubBasketModel.findById(saved.subBasketId).lean()).toMatchObject({
      basketId: saved.basketId, name: "Ceiling painting", version: 2, displayOrder: 0
    });
    expect(await AiEstimatorKnowledgeRevisionModel.findById(line!.draftRevisionId).lean()).toMatchObject({
      mainLineId: saved.mainLineId, status: "draft", revisionNumber: 1, version: 1, contentDigest: null
    });
    const sections = await AiEstimatorKnowledgeSectionModel.find({ mainLineId: saved.mainLineId }).lean();
    expect(sections.map((section) => section.sectionKey).sort()).toEqual([...AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS].sort());
    expect(sections.every((section) => section.revisionId === line!.draftRevisionId && section.applicability === "not_configured")).toBe(true);
    expect(await service.decide(ADMIN, pending.id, { ...command,
      configuration: { subBasketName: "Ceiling painting", mainLineName: "Ceiling coat" } })).toEqual(saved);
    await expect(service.decide(ADMIN, pending.id, { ...command,
      configuration: { subBasketName: "Ceiling painting", mainLineName: "Different coat" } }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(0);
    for (const action of ["ai_estimator_knowledge_sub_basket_created", "ai_estimator_knowledge_main_line_created"]) {
      expect(await AuditEventModel.countDocuments({ action, "newValues.sourceRequestId": pending.id })).toBe(1);
    }
    expect(await AuditEventModel.findOne({ action: "vendor_basket_request_fulfilled" }).lean()).toMatchObject({
      newValues: { basketId: saved.basketId, subBasketId: saved.subBasketId, mainLineId: saved.mainLineId }
    });
  });

  it("supports Sub Basket-only setup and existing child selection/name resolution without duplicate children", async () => {
    const { service, reference } = fixture();
    const first = await service.create(PROCUREMENT, input);
    const second = await service.create(PROCUREMENT, { ...input, vendorName: "Another vendor", idempotencyKey: "another-setup-key" });
    const third = await service.create(PROCUREMENT, { ...input, vendorName: "Third vendor", idempotencyKey: "third-setup-key" });
    const parent = await reference.createBasket(ADMIN, { name: "Painting" });
    const saved = await service.decide(ADMIN, first.id, { decision: "fulfill", expectedVersion: 1,
      idempotencyKey: "sub-only-key", configuration: { subBasketName: "Walls" } });
    expect(saved).toMatchObject({ basketId: parent.id, subBasketId: expect.any(String), mainLineId: null });
    expect(await AiEstimatorKnowledgeSubBasketModel.findById(saved.subBasketId).lean()).toMatchObject({ version: 1 });
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
    const selected = await service.decide(ADMIN, second.id, { decision: "fulfill", expectedVersion: 1,
      idempotencyKey: "select-sub-key", configuration: { subBasketId: saved.subBasketId!, mainLineName: "Primer" } });
    const resolved = await service.decide(ADMIN, third.id, { decision: "fulfill", expectedVersion: 1,
      idempotencyKey: "resolve-sub-key", configuration: { subBasketName: "  WALLS  ", mainLineName: "Top coat" } });
    expect(selected.subBasketId).toBe(saved.subBasketId);
    expect(resolved.subBasketId).toBe(saved.subBasketId);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeSubBasketModel.findById(saved.subBasketId).lean()).toMatchObject({ version: 3 });
    expect(await AiEstimatorKnowledgeMainLineModel.find().sort({ displayOrder: 1 }).lean()).toMatchObject([
      { _id: selected.mainLineId, displayOrder: 0 }, { _id: resolved.mainLineId, displayOrder: 1 }
    ]);
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_sub_basket_created" })).toBe(1);
  });

  it.each(["wrong-parent", "deleted-child", "deleted-parent", "inactive-parent"])("rejects %s setup without a partial decision or new hierarchy", async (scenario) => {
    const { service, reference } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const parent = await reference.createBasket(ADMIN, { name: scenario === "wrong-parent" ? "Other basket" : "Painting" });
    const child = await reference.createSubBasket(ADMIN, parent.id, { name: "Walls" });
    if (scenario === "deleted-child") await AiEstimatorKnowledgeSubBasketModel.deleteOne({ _id: child.id });
    if (scenario === "deleted-parent") {
      await reference.permanentlyDeleteBasket(ADMIN, parent.id, { expectedVersion: parent.version,
        confirmationName: parent.name, reason: "Fixture deletion" });
    }
    if (scenario === "inactive-parent") await reference.updateBasket(ADMIN, parent.id, { expectedVersion: parent.version, status: "inactive" });
    const basketCount = await AiEstimatorKnowledgeBasketModel.countDocuments();
    await expect(service.decide(ADMIN, pending.id, { decision: "fulfill", expectedVersion: 1,
      idempotencyKey: "invalid-parent-key", configuration: { subBasketId: child.id, mainLineName: "Coat" } }))
      .rejects.toMatchObject({ code: scenario === "inactive-parent" ? "BASKET_INACTIVE" : "VALIDATION_ERROR" });
    expect(await VendorBasketRequestModel.findById(pending.id).lean()).toMatchObject({ status: "pending", version: 1,
      basketId: null, subBasketId: null, mainLineId: null, decisionIdempotencyKey: null });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(basketCount);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_request_fulfilled" })).toBe(0);
  });

  it("rolls back a new Sub Basket when the Main Line name conflicts with another child of the same Main Basket", async () => {
    const { service, reference, item } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const parent = await reference.createBasket(ADMIN, { name: "Painting" });
    const existing = await item.createMainLine(ADMIN, parent.id, { subBasketName: "Existing group", name: "Primer" });
    await expect(service.decide(ADMIN, pending.id, { decision: "fulfill", expectedVersion: 1,
      idempotencyKey: "duplicate-line-key", configuration: { subBasketName: "New group", mainLineName: "PRIMER" } }))
      .rejects.toMatchObject({ code: "DUPLICATE_IDENTITY" });
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeSubBasketModel.findById(existing.subBasketId).lean()).toMatchObject({ version: 2 });
    expect(await VendorBasketRequestModel.findById(pending.id).lean()).toMatchObject({ status: "pending", version: 1 });
  });

  it.each(["sub-basket", "revision", "section", "sub-basket-audit", "main-line-audit", "decision-audit"])("rolls back all hierarchy writes when %s persistence fails", async (failure) => {
    const { service } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const realAudit = createAuditService(createMemoryRepository());
    const actions: Record<string, string> = { "sub-basket-audit": "ai_estimator_knowledge_sub_basket_created",
      "main-line-audit": "ai_estimator_knowledge_main_line_created", "decision-audit": "vendor_basket_request_fulfilled" };
    if (failure === "sub-basket") vi.spyOn(AiEstimatorKnowledgeSubBasketModel, "create").mockRejectedValueOnce(new Error("fixture failure"));
    if (failure === "revision") vi.spyOn(AiEstimatorKnowledgeRevisionModel, "create").mockRejectedValueOnce(new Error("fixture failure"));
    if (failure === "section") vi.spyOn(AiEstimatorKnowledgeSectionModel, "insertMany").mockRejectedValueOnce(new Error("fixture failure"));
    const failing = fixture({ appendInMongoTransaction: async (entry, session) => {
      if (actions[failure] === entry.action) throw new Error("fixture failure");
      return realAudit.appendInMongoTransaction(entry, session);
    } }).service;
    await expect(failing.decide(ADMIN, pending.id, { decision: "fulfill", expectedVersion: 1,
      idempotencyKey: "failing-setup-key", configuration: { subBasketName: "Walls", mainLineName: "Primer" } })).rejects.toThrow("fixture failure");
    expect(await VendorBasketRequestModel.findById(pending.id).lean()).toMatchObject({ status: "pending", version: 1,
      basketId: null, subBasketId: null, mainLineId: null, decisionIdempotencyKey: null, decidedAt: null });
    for (const model of [AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel,
      AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel,
      AiEstimatorKnowledgeDisplayOrderSequenceModel]) expect(await model.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(1); // Only the original request.
  });

  it("keeps legacy decisions replayable with their old fingerprint and missing nullable child outcomes", async () => {
    const { service } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    await VendorBasketRequestModel.collection.updateOne({ _id: pending.id }, { $unset: { subBasketId: "", mainLineId: "" } });
    expect((await service.listForAdmin(ADMIN, "pending", { limit: 1, offset: 0 })).items[0]).toMatchObject({ subBasketId: null, mainLineId: null });
    const command = { decision: "fulfill" as const, expectedVersion: 1, idempotencyKey: "legacy-decision-key" };
    const saved = await service.decide(ADMIN, pending.id, command);
    const legacyFingerprint = createHash("sha256").update(JSON.stringify({ decision: "fulfill", expectedVersion: 1, reason: null })).digest("hex");
    expect(await VendorBasketRequestModel.findById(saved.id).lean()).toMatchObject({ decisionFingerprint: legacyFingerprint });
    await VendorBasketRequestModel.collection.updateOne({ _id: saved.id }, { $unset: { subBasketId: "", mainLineId: "" } });
    expect(await service.decide(ADMIN, pending.id, command)).toEqual(saved);
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(1);
  });

  it("authorizes setup and identical decision replays against the current sole active Super Admin", async () => {
    const { service } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const command = { decision: "fulfill" as const, expectedVersion: 1, idempotencyKey: "authorized-setup-key",
      configuration: { subBasketName: "Walls", mainLineName: "Primer" } };
    await expect(service.decide(PROCUREMENT, pending.id, command)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.decide(OTHER, pending.id, command)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: false } });
    await expect(service.decide(ADMIN, pending.id, command)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
    await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: true } });
    await service.decide(ADMIN, pending.id, command);
    await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: false } });
    await expect(service.decide(ADMIN, pending.id, command)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: true, role: "admin" } });
    await expect(service.decide(ADMIN, pending.id, command)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_request_fulfilled" })).toBe(1);
  });

  it("commits only one full hierarchy for competing approval commands", async () => {
    const { service } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const outcomes = await Promise.allSettled(["first", "second"].map((suffix) => service.decide(ADMIN, pending.id, {
      decision: "fulfill", expectedVersion: 1, idempotencyKey: `competing-${suffix}`,
      configuration: { subBasketName: `Group ${suffix}`, mainLineName: `Coat ${suffix}` }
    })));
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    for (const model of [AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel,
      AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgeRevisionModel]) expect(await model.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_request_fulfilled" })).toBe(1);
  });

  it.each(["approve-first", "delete-first"])("coordinates approval with Sub Basket deletion: %s", async (order) => {
    const { service, reference, audit } = fixture();
    const pending = await service.create(PROCUREMENT, input);
    const parent = await reference.createBasket(ADMIN, { name: "Painting" });
    const child = await reference.createSubBasket(ADMIN, parent.id, { name: "Walls" });
    const preview = await reference.getSubBasketDeletionImpact(ADMIN, parent.id, child.id);
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    let gated = false;
    const gateAction = order === "approve-first" ? "vendor_basket_request_fulfilled" : "ai_estimator_knowledge_sub_basket_permanently_deleted";
    const gate = fixture({ appendInMongoTransaction: async (entry, session) => {
      if (!gated && entry.action === gateAction) { gated = true; enter(); await released; }
      return audit.appendInMongoTransaction(entry, session);
    } });
    const approve = (target = service) => target.decide(ADMIN, pending.id, { decision: "fulfill", expectedVersion: 1,
      idempotencyKey: "deletion-race-key", configuration: { subBasketId: child.id, mainLineName: "Primer" } });
    const remove = (target = reference) => target.permanentlyDeleteSubBasket(ADMIN, parent.id, child.id, {
      expectedVersion: preview.version, confirmationName: child.name, impactToken: preview.impactToken, reason: "Fixture removal"
    });
    const first = order === "approve-first" ? approve(gate.service) : remove(gate.reference);
    await entered;
    const second = order === "approve-first" ? remove() : approve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    release();
    const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes[0]?.status).toBe("fulfilled");
    expect(outcomes[1]?.status).toBe("rejected");
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(order === "approve-first" ? 1 : 0);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(order === "approve-first" ? 1 : 0);
    expect(await VendorBasketRequestModel.findById(pending.id).lean()).toMatchObject({ status: order === "approve-first" ? "fulfilled" : "pending" });
  });

  it("validates optional approval setup at the HTTP boundary and accepts one atomic command", async () => {
    const app = api();
    const created = await request(app).post("/api/v1/procurement/vendor-basket-requests")
      .set("Authorization", "Bearer procurement").send(input);
    const path = `/api/v1/admin/ai-estimator-knowledge/basket-requests/${created.body.data.id}/decision`;
    const command = { decision: "fulfill", expectedVersion: 1, idempotencyKey: "validation-route-key" };
    for (const configuration of [{}, { mainLineName: "Primer" }, { subBasketName: " " },
      { subBasketName: "Walls", subBasketId: "another" }, { subBasketName: "Walls", mainLineName: "x".repeat(241) },
      { subBasketName: "Walls", unknownField: "invalid" }, { subBasketId: " " }, null]) {
      const invalid = await request(app).post(path).set("Authorization", "Bearer admin").send({ ...command, configuration });
      expect(invalid.status).toBe(400);
    }
    expect((await request(app).post(path).set("Authorization", "Bearer admin").send({ ...command,
      decision: "reject", reason: "No", configuration: { subBasketName: "Walls" } })).status).toBe(400);
    expect((await request(app).post(path).set("Authorization", "Bearer procurement").send({ ...command,
      configuration: { subBasketName: "Walls", mainLineName: "Primer" } })).status).toBe(403);
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
    const saved = await request(app).post(path).set("Authorization", "Bearer admin").send({ ...command,
      configuration: { subBasketName: "Walls", mainLineName: "Primer" } });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ status: "fulfilled", subBasketId: expect.any(String), mainLineId: expect.any(String) });
  });

});
