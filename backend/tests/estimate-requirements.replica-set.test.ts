import mongoose from "mongoose";
import { createHash } from "node:crypto";
import * as catalogue from "../src/services/estimator-catalogue.service.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createEstimateRequirementSchema } from "../src/domain/estimate-requirements.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateRequirementModel } from "../src/models/EstimateRequirement.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { assertEstimateRequirementsResolved, createEstimateRequirementsService } from "../src/services/estimate-requirements.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const client: PublicUser = { id: "req-client", role: "client", name: "Client", email: "req-client@example.test" };
const sales: PublicUser = { id: "req-sales", role: "estimator_sales", name: "Sales", email: "req-sales@example.test" };
const other: PublicUser = { id: "req-other", role: "client", name: "Other", email: "other@example.test" };
const input = { mainBasketId: "basket-kitchen", text: "Storage beside the kitchen window", expectedRequirementsVersion: 0, idempotencyKey: "requirement-request-1" };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const service = createEstimateRequirementsService({ audit: createAuditService(createMongoRepository()) });

beforeAll(async () => {
  replica = await startMongoReplicaSet("estimate-requirements");
  await Promise.all([UserModel.init(), ProjectModel.init(), EstimateRequirementModel.init(), AiEstimatorKnowledgeBasketModel.init(), EstimateModel.init(), AuditEventModel.init(), AiEstimatorKnowledgeMainLineModel.init(), AiEstimatorKnowledgeSubBasketModel.init(), AiEstimatorKnowledgeRevisionModel.init(), AiEstimatorKnowledgeSectionModel.init(), AiEstimatorKnowledgeUomModel.init()]);
}, 120000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear();
  await UserModel.insertMany([client, sales, other].map(actor => ({ _id: actor.id, name: actor.name, email: actor.email, emailNormalized: actor.email, passwordHash: "synthetic-unused", role: actor.role, active: true, accountKind: "standard", version: 1 })));
  await ProjectModel.collection.insertOne({ _id: "req-project" as never, name: "Synthetic requirements project", clientId: client.id, clientEmailNormalized: client.email, assignedEstimatorId: sales.id, assignedDesignerIds: [], estimationWorkflowVersion: 2, estimateRequirementsVersion: 0, estimationFenceEpoch: 0, status: "planning" });
  await AiEstimatorKnowledgeBasketModel.create({ _id: "basket-kitchen", name: "Kitchen", displayOrder: 1, status: "active", version: 1, createdById: sales.id, updatedById: sales.id });
});

async function addEstimate() {
  await EstimateModel.create({ _id: "req-estimate", leadId: "req-lead", ownerId: sales.id, projectId: "req-project", version: 1, status: "draft", estimation: newEstimationLifecycle(), propertyType: "2BHK", rooms: [{ id: "room-kitchen", label: "Kitchen" }], scopes: [], lineItems: [{ id: "req-line", catalogueId: "storage", roomId: "room-kitchen", roomName: "Kitchen", mainBasketId: "basket-kitchen", unit: "sqft", rate: 10, quantity: 2, amount: 20, included: true }], subtotal: 20, gst: 0, total: 20, totalPaise: 2000 });
}

async function addMainLine(id: string, visibility: "internal" | "external" | null = "external", overrides: Record<string, unknown> = {}) {
  await AiEstimatorKnowledgeSubBasketModel.collection.updateOne({ _id: "sub-kitchen" as never }, { $setOnInsert: {
    basketId: "basket-kitchen", name: "Storage", displayOrder: 1, version: 1
  } }, { upsert: true });
  await AiEstimatorKnowledgeUomModel.collection.updateOne({ _id: "uom-each" as never }, { $setOnInsert: {
    name: "Each", code: "each", decimalScale: 0, status: "active"
  } }, { upsert: true });
  await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: id as never, basketId: "basket-kitchen", subBasketId: "sub-kitchen",
    name: `Name ${id}`, displayOrder: 1, itemType: "main_line", status: "active", version: 1,
    activeRevisionId: `revision-${id}`, ...(visibility ? { estimationVisibility: visibility } : {}), ...overrides });
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: `revision-${id}` as never, mainLineId: id, status: "active", version: 1 });
  await AiEstimatorKnowledgeSectionModel.collection.insertMany([
    { _id: `overview-${id}` as never, mainLineId: id, revisionId: `revision-${id}`, sectionKey: "overview", payload: { uomId: "uom-each" } },
    { _id: `advanced-${id}` as never, mainLineId: id, revisionId: `revision-${id}`, sectionKey: "advanced", applicability: "configured",
      payload: { modeCalculations: { pmc: { baseRatePaise: 923457 } }, vendorSecret: "private-vendor-secret", marginBps: 2345 } }
  ]);
}

describe("client estimate requirements transactions", () => {
  it("returns only explicit External eligible name-only options to clients and both visibilities to staff", async () => {
    await addMainLine("external-a");
    await addMainLine("internal-b", "internal");
    await addMainLine("legacy-c", null);
    await addMainLine("temporary-d", "external", { itemType: "temporary" });
    await addMainLine("archived-e", "external", { status: "archived" });
    await addMainLine("foreign-child-f", "external", { subBasketId: "missing-child" });
    await addMainLine("incomplete-g", "external", { draftRevisionId: "missing-current-draft" });
    const result = await service.detail(client, "req-project");
    expect(result.mainLines).toEqual([{ id: "external-a", mainBasketId: "basket-kitchen", subBasketId: "sub-kitchen", subBasketName: "Storage", name: "Name external-a" }]);
    expect(JSON.stringify(result)).not.toMatch(/923457|private-vendor-secret|marginBps|modeCalculations|baseRate/u);
    expect((await service.detail(sales, "req-project")).mainLines.map(line => line.id).sort()).toEqual(["external-a", "internal-b", "legacy-c"]);
  });

  it("never exposes a renamed Internal line when visibility changes between option reads", async () => {
    await addMainLine("external-a");
    const resolve = catalogue.resolveEstimatorCatalogueLines;
    const interleaving = vi.spyOn(catalogue, "resolveEstimatorCatalogueLines").mockImplementationOnce(async (...args) => {
      await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "external-a" }, { $set: { estimationVisibility: "internal", name: "confidential-renamed-line" } });
      return resolve(...args);
    });
    try {
      const result = await service.detail(client, "req-project");
      expect(JSON.stringify(result)).not.toContain("confidential-renamed-line");
      expect(result.mainLines[0]?.name).toBe("Name external-a");
    } finally { interleaving.mockRestore(); }
    expect((await service.detail(client, "req-project")).mainLines).toEqual([]);
  });

  it("keeps legacy create digests compatible while preserving selected line identity and history", async () => {
    await addMainLine("external-a");
    const created = await service.create(client, "req-project", input);
    const row = await EstimateRequirementModel.findById(created.requirements[0]!.id).select("+requestDigest").lean();
    expect(row!.requestDigest).toBe(createHash("sha256").update(JSON.stringify({ mainBasketId: input.mainBasketId, roomId: null, text: input.text })).digest("hex"));
    expect((await service.create(client, "req-project", { ...input, mainLineId: null })).requirements).toHaveLength(1);
    await expect(service.create(client, "req-project", { ...input, mainLineId: "external-a" })).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENTS_CHANGED" });
    const selected = await service.create(client, "req-project", { ...input, mainLineId: "external-a", expectedRequirementsVersion: 1, idempotencyKey: "selected-request-1" });
    const requirement = selected.requirements.find(row => row.mainLineId === "external-a")!;
    expect((await EstimateRequirementModel.findById(requirement.id).select("+history").lean())!.history[0]).toMatchObject({ mainLineId: "external-a" });
    await service.update(client, "req-project", requirement.id, { expectedVersion: 1, expectedRequirementsVersion: 2, text: "Updated request" });
    expect((await EstimateRequirementModel.findById(requirement.id).lean())!.mainLineId).toBe("external-a");
    await service.update(client, "req-project", requirement.id, { expectedVersion: 2, expectedRequirementsVersion: 3, mainLineId: null });
    expect((await EstimateRequirementModel.findById(requirement.id).lean())!.mainLineId).toBeNull();
  });

  it("rejects forged, Internal, temporary, unavailable and cross-basket selections without partial writes", async () => {
    await addMainLine("external-a");
    await addMainLine("internal-b", "internal");
    await addMainLine("legacy-c", null);
    await addMainLine("temporary-d", "external", { itemType: "temporary" });
    await addMainLine("archived-e", "external", { status: "archived" });
    await addMainLine("cross-basket-f", "external", { basketId: "another-basket" });
    await addMainLine("incomplete-g", "external", { draftRevisionId: "missing-current-draft" });
    for (const mainLineId of ["forged", "internal-b", "legacy-c", "temporary-d", "archived-e", "cross-basket-f", "incomplete-g"]) {
      await expect(service.create(client, "req-project", { ...input, mainLineId })).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENT_MAIN_LINE_INVALID" });
    }
    expect(await EstimateRequirementModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect((await ProjectModel.findById("req-project").lean())!.estimateRequirementsVersion).toBe(0);
  });

  it("preserves revoked historical IDs without names, allows clearing or withdrawal and clears old-client basket changes", async () => {
    await addMainLine("external-a");
    const created = await service.create(client, "req-project", { ...input, mainLineId: "external-a" });
    const id = created.requirements[0]!.id;
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "external-a" }, { $set: { estimationVisibility: "internal" } });
    const revoked = await service.detail(client, "req-project");
    expect(revoked.mainLines).toEqual([]);
    expect(revoked.requirements[0]).toMatchObject({ mainLineId: "external-a", canEdit: true });
    expect(JSON.stringify(revoked)).not.toContain("Name external-a");
    await expect(service.update(client, "req-project", id, { expectedVersion: 1, expectedRequirementsVersion: 1, text: "Retained selection" })).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENT_MAIN_LINE_INVALID" });
    await AiEstimatorKnowledgeBasketModel.create({ _id: "basket-other", name: "Other", displayOrder: 2, status: "active", version: 1, createdById: sales.id, updatedById: sales.id });
    await service.update(client, "req-project", id, { expectedVersion: 1, expectedRequirementsVersion: 1, mainBasketId: "basket-other" });
    expect((await EstimateRequirementModel.findById(id).lean())!.mainLineId).toBeNull();
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "external-a" }, { $set: { estimationVisibility: "external" } });
    await service.update(client, "req-project", id, { expectedVersion: 2, expectedRequirementsVersion: 2, mainBasketId: "basket-kitchen", mainLineId: "external-a" });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "external-a" }, { $set: { estimationVisibility: "internal" } });
    await service.update(client, "req-project", id, { expectedVersion: 3, expectedRequirementsVersion: 3, withdraw: true });
    expect((await EstimateRequirementModel.findById(id).lean())!).toMatchObject({ status: "withdrawn", mainLineId: "external-a" });
  });

  it("ignores mixed edits when withdrawing a revoked selection and preserves one atomic history entry", async () => {
    await addEstimate();
    await addMainLine("external-a");
    await addMainLine("internal-forged", "internal");
    const original = { mainBasketId: input.mainBasketId, mainLineId: "external-a", roomId: "room-kitchen", text: input.text };
    const created = await service.create(client, "req-project", { ...input, ...original });
    const id = created.requirements[0]!.id;
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "external-a" }, { $set: { estimationVisibility: "internal" } });
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: input.mainBasketId }, { $set: { status: "inactive" } });
    const command = { expectedVersion: 1, expectedRequirementsVersion: 1, withdraw: true,
      mainLineId: "internal-forged", mainBasketId: "forged-basket", roomId: "foreign-room", text: "Forged replacement text" };
    await service.update(client, "req-project", id, command);
    const withdrawn = await EstimateRequirementModel.findById(id).select("+history").lean();
    expect(withdrawn).toMatchObject({ ...original, status: "withdrawn", version: 2 });
    expect(withdrawn!.history).toHaveLength(2);
    expect(withdrawn!.history[1]).toMatchObject({ ...original, action: "withdrawn", status: "withdrawn", version: 2, actorId: client.id });
    expect(await AuditEventModel.countDocuments({ action: "estimate_requirement.withdrawn", entityId: id })).toBe(1);
    expect((await ProjectModel.findById("req-project").lean())!.estimateRequirementsVersion).toBe(2);
    await expect(service.update(client, "req-project", id, command)).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENTS_CHANGED" });
    expect((await EstimateRequirementModel.findById(id).select("+history").lean())!.history).toHaveLength(2);
    expect(await AuditEventModel.countDocuments({ action: "estimate_requirement.withdrawn", entityId: id })).toBe(1);
  });

  it("requires exact selected Main Line lineage at resolution and again before publication", async () => {
    await addMainLine("external-a");
    await addEstimate();
    const created = await service.create(client, "req-project", { ...input, mainLineId: "external-a" });
    const id = created.requirements[0]!.id;
    const resolution = { expectedRequirementsVersion: 1, expectedVersion: 1, status: "included", lineItemIds: ["req-line"] };
    await expect(service.resolve(sales, "req-project", id, resolution)).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENT_LINE_INVALID" });
    await EstimateModel.updateOne({ _id: "req-estimate" }, { $set: { "lineItems.0.mainLineId": "external-a", "lineItems.0.catalogueId": "external-a" } });
    await service.resolve(sales, "req-project", id, resolution);
    await mongoose.connection.transaction(session => assertEstimateRequirementsResolved("req-project", 2, session));
    await EstimateModel.updateOne({ _id: "req-estimate" }, { $set: { "lineItems.0.catalogueId": "different-line" } });
    await expect(mongoose.connection.transaction(session => assertEstimateRequirementsResolved("req-project", 2, session))).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENT_SCOPE_CHANGED" });
  });

  it.each(["visibility", "sub-basket", "basket"].flatMap(target => ["create", "update"].map(operation => ({ target, operation }))))(
    "serializes selected $operation behind concurrent $target revocation", async ({ target, operation }) => {
    await addMainLine("external-a");
    const existing = operation === "update" ? await service.create(client, "req-project", { ...input, mainLineId: "external-a" }) : null;
    let writerLocked!: () => void, releaseWriter!: () => void;
    const locked = new Promise<void>(resolve => { writerLocked = resolve; });
    const release = new Promise<void>(resolve => { releaseWriter = resolve; });
    const revocation = mongoose.connection.transaction(async session => {
      if (target === "visibility") await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "external-a" }, { $set: { estimationVisibility: "internal" }, $inc: { version: 1 } }, { session });
      else if (target === "sub-basket") await AiEstimatorKnowledgeSubBasketModel.deleteOne({ _id: "sub-kitchen" }, { session });
      else await AiEstimatorKnowledgeBasketModel.updateOne({ _id: "basket-kitchen" }, { $set: { status: "inactive" } }, { session });
      writerLocked();
      await release;
    });
    await locked;
    const model = target === "visibility" ? AiEstimatorKnowledgeMainLineModel : target === "sub-basket" ? AiEstimatorKnowledgeSubBasketModel : AiEstimatorKnowledgeBasketModel;
    const realFind = model.findOneAndUpdate.bind(model);
    let attemptedFence!: () => void;
    const attempted = new Promise<void>(resolve => { attemptedFence = resolve; });
    const observer = vi.spyOn(model, "findOneAndUpdate").mockImplementationOnce((...args) => {
      attemptedFence(); return realFind(...args);
    });
    const request = existing
      ? service.update(client, "req-project", existing.requirements[0]!.id, { expectedVersion: 1, expectedRequirementsVersion: 1, text: "Concurrent selected update" })
      : service.create(client, "req-project", { ...input, mainLineId: "external-a" });
    const mutation = request.then(value => ({ status: "fulfilled" as const, value }), error => ({ status: "rejected" as const, error }));
    try { await Promise.race([attempted, mutation.then(() => { throw new Error("The request bypassed its dependency fence."); })]); }
    finally { releaseWriter(); await revocation; observer.mockRestore(); }
    expect(await mutation).toMatchObject({ status: "rejected", error: { code: target === "basket" ? "ESTIMATE_REQUIREMENT_BASKET_INVALID" : "ESTIMATE_REQUIREMENT_MAIN_LINE_INVALID" } });
    expect(await EstimateRequirementModel.countDocuments()).toBe(existing ? 1 : 0);
    expect(await AuditEventModel.countDocuments()).toBe(existing ? 1 : 0);
    expect((await ProjectModel.findById("req-project").lean())!.estimateRequirementsVersion).toBe(existing ? 1 : 0);
    if (existing) expect((await EstimateRequirementModel.findById(existing.requirements[0]!.id).lean())!).toMatchObject({ version: 1, text: input.text });
  }, 15000);

  it("serializes a captured Client request behind revocation and rejects it without partial writes", async () => {
    await addEstimate();
    await AuthorizationCoordinationModel.create({ _id: "authorization", revision: 1, updatedAt: new Date() });
    let writerLocked!: () => void;
    const locked = new Promise<void>(resolve => { writerLocked = resolve; });
    let releaseWriter!: () => void;
    const release = new Promise<void>(resolve => { releaseWriter = resolve; });
    const revocation = mongoose.connection.transaction(async session => {
      await createMongoRepository(session).coordinateAuthorizationMutation();
      await UserModel.updateOne({ _id: client.id }, { $set: { active: false }, $inc: { sessionVersion: 1 } }, { session });
      writerLocked();
      await release;
    });
    await locked;
    const realCoordinate = AuthorizationCoordinationModel.updateOne.bind(AuthorizationCoordinationModel);
    let attemptedFence!: () => void;
    const attempted = new Promise<void>(resolve => { attemptedFence = resolve; });
    const coordinate = vi.spyOn(AuthorizationCoordinationModel, "updateOne").mockImplementationOnce((...args) => {
      attemptedFence();
      return realCoordinate(...args);
    });
    const mutation = service.create(client, "req-project", input).then(
      value => ({ status: "fulfilled" as const, value }), error => ({ status: "rejected" as const, error })
    );
    try {
      await Promise.race([attempted, mutation.then(() => { throw new Error("The request bypassed the authorization fence."); })]);
    } finally {
      releaseWriter();
      await revocation;
      coordinate.mockRestore();
    }
    expect(await mutation).toMatchObject({ status: "rejected", error: { code: "ESTIMATE_REQUIREMENTS_NOT_FOUND" } });
    expect(await EstimateRequirementModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await ProjectModel.findById("req-project").lean()).toMatchObject({ estimateRequirementsVersion: 0, estimationFenceEpoch: 0 });
    expect(await EstimateModel.findById("req-estimate").lean()).toMatchObject({ version: 1, estimation: { requirementsVersion: 0 } });
    expect(await AuthorizationCoordinationModel.findById("authorization").lean()).toMatchObject({ revision: 2 });
  }, 15000);

  it("accepts requests before an estimate exists and exposes only Main Basket options", async () => {
    const created = await service.create(client, "req-project", input);
    expect(created.requirementsVersion).toBe(1);
    expect(created.estimateVersion).toBeNull();
    expect(created.indicativeTotalPaise).toBeNull();
    expect(created.mainBaskets).toEqual([{ id: "basket-kitchen", name: "Kitchen" }]);
    expect(created.requirements[0]).toMatchObject({ text: input.text, status: "open", phase: "pre" });
    expect(await AuditEventModel.countDocuments({ action: "estimate_requirement.created" })).toBe(1);
  });
  it("replays a matching creation without duplicate requests and rejects mismatched reuse", async () => {
    await service.create(client, "req-project", input);
    expect((await service.create(client, "req-project", input)).requirements).toHaveLength(1);
    await expect(service.create(client, "req-project", { ...input, text: "Different scope" })).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENTS_CHANGED" });
  });
  it("rejects another client, unaccepted email-only access, foreign rooms and price/catalogue fields", async () => {
    await expect(service.detail(other, "req-project")).rejects.toMatchObject({ status: 404 });
    await ProjectModel.updateOne({ _id: "req-project" }, { $set: { clientId: null } });
    await expect(service.create(client, "req-project", input)).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENTS_NOT_FOUND" });
    await ProjectModel.updateOne({ _id: "req-project" }, { $set: { clientId: client.id } });
    await expect(service.create(client, "req-project", { ...input, roomId: "another-project-room" })).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENT_ROOM_INVALID" });
    expect(createEstimateRequirementSchema.safeParse({ ...input, price: 1, mainLineId: "private-line" }).success).toBe(false);
    expect(await EstimateRequirementModel.countDocuments()).toBe(0);
  });
  it("serializes competing changes and invalidates the staff working version", async () => {
    await addEstimate();
    const created = await service.create(client, "req-project", input);
    const id = created.requirements[0]!.id;
    const results = await Promise.allSettled(["More shelves", "Fewer shelves"].map(text => service.update(client, "req-project", id, { expectedRequirementsVersion: 1, expectedVersion: 1, text })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const current = await EstimateModel.findById("req-estimate").lean();
    expect(current?.version).toBe(3);
    expect(current?.estimation.requirementsVersion).toBe(2);
    expect((await EstimateRequirementModel.findById(id).select("+history").lean())?.history).toHaveLength(2);
  });
  it("requires staff resolution and detects removed included scope before publication", async () => {
    await addEstimate();
    const created = await service.create(client, "req-project", input);
    const id = created.requirements[0]!.id;
    await expect(mongoose.connection.transaction(session => assertEstimateRequirementsResolved("req-project", 1, session))).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENTS_UNRESOLVED" });
    const resolution = { expectedRequirementsVersion: 1, expectedVersion: 1, status: "included", lineItemIds: ["req-line"] };
    await expect(service.resolve(client, "req-project", id, resolution)).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENT_RESOLVE_FORBIDDEN" });
    await service.resolve(sales, "req-project", id, resolution);
    await mongoose.connection.transaction(session => assertEstimateRequirementsResolved("req-project", 2, session));
    await EstimateModel.updateOne({ _id: "req-estimate" }, { $set: { lineItems: [] } });
    await expect(mongoose.connection.transaction(session => assertEstimateRequirementsResolved("req-project", 2, session))).rejects.toMatchObject({ code: "ESTIMATE_REQUIREMENT_SCOPE_CHANGED" });
    await service.resolve(sales, "req-project", id, { expectedRequirementsVersion: 2, expectedVersion: 2, status: "declined", reason: "Client agreed to exclude storage" });
    await mongoose.connection.transaction(session => assertEstimateRequirementsResolved("req-project", 3, session));
  });
  it("blocks direct requirement edits during review and after final closure", async () => {
    await addEstimate();
    await EstimateModel.updateOne({ _id: "req-estimate" }, { $set: { "estimation.status": "sent_to_client" } });
    await expect(service.create(client, "req-project", input)).rejects.toMatchObject({ code: "ESTIMATE_REVIEW_IN_PROGRESS" });
    await EstimateModel.updateOne({ _id: "req-estimate" }, { $set: { "estimation.status": "draft", "estimation.editClosedAt": "2026-10-13T12:00:00.000Z" } });
    await expect(service.create(client, "req-project", input)).rejects.toMatchObject({ code: "ESTIMATE_EDITING_CLOSED" });
    expect((await service.detail(client, "req-project")).editingAllowed).toBe(false);
  });
});
