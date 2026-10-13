import mongoose from "mongoose";
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
  await Promise.all([UserModel.init(), ProjectModel.init(), EstimateRequirementModel.init(), AiEstimatorKnowledgeBasketModel.init(), EstimateModel.init(), AuditEventModel.init()]);
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

describe("client estimate requirements transactions", () => {
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
