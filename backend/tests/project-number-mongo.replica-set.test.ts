import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { PROJECT_NUMBER_SEQUENCE_ID, ProjectNumberSequenceModel } from "../src/models/ProjectNumberSequence.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createEstimatesRouter } from "../src/routes/estimates.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actors = {
  salesA: { id: "number-sales-a", name: "Sales A", email: "sales-a@example.test", role: "estimator_sales" },
  salesB: { id: "number-sales-b", name: "Sales B", email: "sales-b@example.test", role: "estimator_sales" },
  admin: { id: "number-admin", name: "Admin", email: "admin@example.test", role: "super_admin" }
} as const satisfies Record<string, PublicUser>;
type ActorKey = keyof typeof actors;
const input = { propertyType: "Apartment", rooms: [], scopes: ["interiors"], lineItems: [
  { catalogueId: "number-line", roomName: "Living room", specification: "Synthetic cabinet", unit: "each", rate: 100, quantity: 2, included: true }
] };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("project-number");
  await Promise.all([LeadModel.syncIndexes(), EstimateModel.syncIndexes(), ProjectNumberSequenceModel.syncIndexes(), AuditEventModel.syncIndexes()]);
}, 120_000);
beforeEach(async () => {
  vi.restoreAllMocks();
  await replica.clear();
  await UserModel.collection.insertMany(Object.values(actors).map(actor => ({ ...actor, _id: actor.id, active: true, deletedAt: null, createdAt: new Date(), updatedAt: new Date() })));
});
afterAll(async () => { vi.restoreAllMocks(); await replica?.stop(); });

async function seedLead(id: string, owner: ActorKey = "salesA", linked = false) {
  const projectId = linked ? `project-${id}` : null;
  const now = new Date();
  if (projectId) await ProjectModel.create({ _id: projectId, name: id, clientName: `Client ${id}`,
    clientEmail: `${id}@example.test`, clientEmailNormalized: `${id}@example.test`, clientMobile: "0000000000",
    assignedEstimatorId: actors[owner].id, status: "planning", plannedStartAt: now, plannedEndAt: now });
  await LeadModel.create({ _id: id, ownerId: actors[owner].id, projectId, clientName: `Client ${id}`,
    clientEmail: `${id}@example.test`, clientMobile: "0000000000", projectName: id, location: "Test city",
    propertyType: "Apartment", source: "test", stage: "new_lead", nextAction: "Estimation", nextActionAt: now });
  return projectId;
}

function app() {
  const repository = createMongoRepository();
  const audit = createAuditService(repository);
  const auth = { authenticate: async (token: string) => actors[token as ActorKey] } as unknown as Parameters<typeof createEstimatesRouter>[0];
  const leads = { get: async (actor: PublicUser, id: string) => {
    const lead = await repository.findLeadById(id);
    if (!lead || actor.role !== "super_admin" && lead.ownerId !== actor.id) throw new ApiError(404, "NOT_FOUND", "Not found.");
    return lead;
  } } as Parameters<typeof createEstimatesRouter>[1];
  const reviews = { currentSummaryForEstimate: async () => null, currentClientFeedbackForEstimate: async () => null } as unknown as Parameters<typeof createEstimatesRouter>[7];
  const publication = { publishEstimateToClient: vi.fn(async () => ({ estimate: {}, clientReview: {} })) };
  const server = express();
  server.use(express.json());
  server.use("/api/v1", createEstimatesRouter(auth, leads, {} as never, {} as never, audit, publication as never, {} as never, reviews));
  server.use(errorHandler);
  return { server, audit, repository, publication };
}
function save(server: ReturnType<typeof app>["server"], id: string, actor: ActorKey = "salesA", body: unknown = input) {
  return request(server).put(`/api/v1/leads/${id}/estimate`).set("Authorization", `Bearer ${actor}`).send(body);
}
async function state() {
  return {
    counter: (await ProjectNumberSequenceModel.findById(PROJECT_NUMBER_SEQUENCE_ID).lean())?.lastNumber ?? null,
    leads: await LeadModel.find({ projectNumber: { $type: "string" } }).select("_id projectNumber").lean(),
    estimates: await EstimateModel.find().select("_id leadId").lean(),
    audits: await AuditEventModel.find({ action: "project_number_assigned" }).lean()
  };
}

describe("transactional project numbers", () => {
  it("allocates sequential numbers to asymmetric linked projects and projects the same values", async () => {
    const projectA = await seedLead("lead-a", "salesA", true);
    const projectB = await seedLead("lead-b", "salesB", true);
    const { server, repository } = app();
    const first = await save(server, "lead-a").expect(200);
    const second = await save(server, "lead-b", "salesB", { ...input, lineItems: [{ ...input.lineItems[0], rate: 333 }] }).expect(200);
    expect(first.body.data.projectNumber).toBe("Lisno000001");
    expect(second.body.data.projectNumber).toBe("Lisno000002");
    for (const [id, key, number, project] of [["lead-a", "salesA", "Lisno000001", projectA], ["lead-b", "salesB", "Lisno000002", projectB]] as const) {
      expect((await request(server).get(`/api/v1/leads/${id}/estimate`).set("Authorization", `Bearer ${key}`).expect(200)).body.data.projectNumber).toBe(number);
      expect((await request(server).get("/api/v1/estimates").set("Authorization", `Bearer ${key}`).expect(200)).body.data).toMatchObject([{ projectNumber: number, lead: { projectNumber: number } }]);
      expect(await repository.findLeadById(id)).toMatchObject({ projectNumber: number });
      const admin = (await repository.findUserById(actors.admin.id))!;
      expect(await repository.findAdminProject(admin, project!)).toMatchObject({ projectNumber: number });
    }
    const persisted = await state();
    expect(persisted.counter).toBe(2);
    expect(persisted.audits).toHaveLength(2);
    expect(persisted.audits[0].newValues).not.toHaveProperty("clientEmail");
    expect(await EstimateModel.findById(first.body.data.id).lean()).not.toHaveProperty("projectNumber");
  });

  it("serializes simultaneous first saves against an empty counter for different leads", async () => {
    await Promise.all([seedLead("lead-a"), seedLead("lead-b", "salesB")]);
    const { server } = app();
    const responses = await Promise.all([save(server, "lead-a"), save(server, "lead-b", "salesB")]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(responses.map(response => response.body.data.projectNumber).sort()).toEqual(["Lisno000001", "Lisno000002"]);
    expect(await state()).toMatchObject({ counter: 2, leads: expect.any(Array), audits: expect.any(Array) });
    expect((await state()).audits).toHaveLength(2);
  });

  it("deduplicates simultaneous saves and retries of the same lead", async () => {
    await seedLead("lead-a");
    const { server } = app();
    const responses = await Promise.all([save(server, "lead-a"), save(server, "lead-a"), save(server, "lead-a")]);
    expect(responses.every(response => [200, 409].includes(response.status))).toBe(true);
    expect(responses.filter(response => response.status === 200).length).toBeGreaterThan(0);
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBe("Lisno000001");
    const persisted = await state();
    expect(persisted.counter).toBe(1);
    expect(persisted.estimates).toHaveLength(1);
    expect(persisted.leads).toHaveLength(1);
    expect(persisted.audits).toHaveLength(1);
  });

  it("rolls back counter, assignment and estimate when audit persistence fails, then safely retries", async () => {
    await seedLead("lead-a");
    const { server, audit } = app();
    const fault = vi.spyOn(audit, "appendInMongoTransaction").mockRejectedValueOnce(new Error("Synthetic audit failure"));
    await save(server, "lead-a").expect(500);
    expect(await state()).toEqual({ counter: null, leads: [], estimates: [], audits: [] });
    fault.mockRestore();
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBe("Lisno000001");
  });

  it("rolls back assignment after an injected transient transaction error and commits one audit on retry", async () => {
    await seedLead("lead-a");
    const { server, audit } = app();
    const append = audit.appendInMongoTransaction.bind(audit);
    const transient = new mongoose.mongo.MongoServerError({ message: "Synthetic transient", code: 112 });
    transient.addErrorLabel("TransientTransactionError");
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (event, session) => {
      await append(event, session);
      throw transient;
    });
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBe("Lisno000001");
    expect((await state()).audits).toHaveLength(1);
    expect((await state()).counter).toBe(1);
  });

  it("retries a bounded counter-initialization duplicate without treating it as an estimate version conflict", async () => {
    await seedLead("lead-a");
    const { server } = app();
    vi.spyOn(ProjectNumberSequenceModel, "create").mockRejectedValueOnce(new mongoose.mongo.MongoServerError({ message: "Synthetic initialization race", code: 11000 }));
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBe("Lisno000001");
    expect((await state()).audits).toHaveLength(1);
  });

  it("stops after three initialization conflicts without partial writes", async () => {
    await seedLead("lead-a");
    const { server } = app();
    const create = vi.spyOn(ProjectNumberSequenceModel, "create").mockRejectedValue(new mongoose.mongo.MongoServerError({ message: "Synthetic repeated race", code: 11000 }));
    expect((await save(server, "lead-a").expect(409)).body.error.code).toBe("PROJECT_NUMBER_STATE_CONFLICT");
    expect(create).toHaveBeenCalledTimes(3);
    expect(await state()).toEqual({ counter: null, leads: [], estimates: [], audits: [] });
  });

  it("keeps numbers through rename, resave, submission and normal model updates", async () => {
    await seedLead("lead-a");
    const { server, repository } = app();
    await save(server, "lead-a").expect(200);
    await repository.updateLead("lead-a", { projectName: "Renamed project", stage: "estimate_in_progress" });
    await LeadModel.updateOne({ _id: "lead-a" }, { $set: { projectNumber: "Lisno999999", notes: "Ordinary update" } });
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBe("Lisno000001");
    await request(server).post("/api/v1/leads/lead-a/estimate/submit").set("Authorization", "Bearer salesA").expect(200);
    expect((await repository.findLeadById("lead-a"))?.projectNumber).toBe("Lisno000001");
    expect((await state()).audits).toHaveLength(1);
    expect((await state()).counter).toBe(1);
  });

  it("does not number an existing historical estimate during editing or reading", async () => {
    await seedLead("lead-a");
    await EstimateModel.create({ _id: "historical", leadId: "lead-a", ownerId: actors.salesA.id, propertyType: "Apartment", rooms: [], scopes: [], lineItems: [] });
    const { server } = app();
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBeNull();
    expect((await request(server).get("/api/v1/leads/lead-a/estimate").set("Authorization", "Bearer salesA").expect(200)).body.data.projectNumber).toBeNull();
    expect((await state()).counter).toBeNull();
    expect((await state()).audits).toEqual([]);
  });

  it("does not allocate on opening an estimator or changing a lead stage", async () => {
    await seedLead("lead-a");
    const { server, repository } = app();
    await request(server).get("/api/v1/leads/lead-a/estimate").set("Authorization", "Bearer salesA").expect(200);
    await repository.updateLead("lead-a", { stage: "estimate_in_progress" });
    expect(await state()).toEqual({ counter: null, leads: [], estimates: [], audits: [] });
  });

  it("keeps historical unnumbered estimates readable when their Lead has no project link", async () => {
    await seedLead("legacy-a"); await seedLead("current-a"); await seedLead("other-owner", "salesB");
    await EstimateModel.create({ _id: "historical-unlinked", leadId: "legacy-a", ownerId: actors.salesA.id,
      projectId: "old-project-no-longer-present", status: "client_approved", propertyType: "Apartment", rooms: [], scopes: [], lineItems: [], total: 275 });
    await EstimateModel.create({ _id: "other-owner-estimate", leadId: "other-owner", ownerId: actors.salesB.id,
      propertyType: "Apartment", rooms: [], scopes: [], lineItems: [], total: 615 });
    const { server } = app();
    await save(server, "current-a").expect(200);
    const before = await EstimateModel.findById("historical-unlinked").lean();
    const list = (await request(server).get("/api/v1/estimates").set("Authorization", "Bearer salesA").expect(200)).body.data;
    expect(list).toHaveLength(2);
    expect(list.find((row: { id: string }) => row.id === "historical-unlinked")).toMatchObject({ projectNumber: null, total: 275 });
    expect(list.some((row: { id: string }) => row.id === "other-owner-estimate")).toBe(false);
    expect((await request(server).get("/api/v1/leads/legacy-a/estimate").set("Authorization", "Bearer salesA").expect(200)).body.data.projectNumber).toBeNull();
    expect(await EstimateModel.findById("historical-unlinked").lean()).toEqual(before);
    expect((await state()).counter).toBe(1);
    expect((await state()).audits).toHaveLength(1);
  });

  it.each(["numbered-unlinked", "unnumbered-linked"])("still rejects %s project lineage conflicts on reads", async (kind) => {
    await seedLead("conflict", "salesA", kind === "unnumbered-linked");
    if (kind === "numbered-unlinked") await LeadModel.collection.updateOne({ _id: "conflict" }, { $set: { projectNumber: "Lisno000001" } });
    await EstimateModel.create({ _id: "conflicting-estimate", leadId: "conflict", ownerId: actors.salesA.id,
      projectId: "different-project", propertyType: "Apartment", rooms: [], scopes: [], lineItems: [] });
    const { server } = app();
    for (const path of ["/estimates", "/leads/conflict/estimate"]) {
      expect((await request(server).get(`/api/v1${path}`).set("Authorization", "Bearer salesA").expect(409)).body.error.code).toBe("PROJECT_NUMBER_STATE_CONFLICT");
    }
  });

  it("rejects forged input, invalid saves and another owner's access without allocation", async () => {
    await seedLead("lead-a");
    const { server } = app();
    await save(server, "lead-a", "salesA", { ...input, projectNumber: "Lisno000777" }).expect(400);
    await save(server, "lead-a", "salesA", { ...input, propertyType: "" }).expect(400);
    await save(server, "lead-a", "salesB").expect(404);
    await request(server).get("/api/v1/leads/lead-a/estimate").set("Authorization", "Bearer salesB").expect(404);
    expect(await state()).toEqual({ counter: null, leads: [], estimates: [], audits: [] });
  });

  it.each(["missing", "wrong-owner"])("rejects %s project lineage before allocation", async (kind) => {
    const projectId = await seedLead("lead-a", "salesA", true);
    if (kind === "missing") await ProjectModel.deleteOne({ _id: projectId });
    else await ProjectModel.updateOne({ _id: projectId }, { $set: { assignedEstimatorId: actors.salesB.id } });
    const { server } = app();
    expect((await save(server, "lead-a").expect(409)).body.error.code).toBe("ESTIMATE_PROJECT_CONFLICT");
    expect(await state()).toEqual({ counter: null, leads: [], estimates: [], audits: [] });
  });

  it("uses the current Lead owner inside the transaction instead of the authorized outer snapshot", async () => {
    await seedLead("lead-a");
    const { server } = app();
    const findById = LeadModel.findById.bind(LeadModel);
    let calls = 0;
    vi.spyOn(LeadModel, "findById").mockImplementation((...args: any[]) => {
      calls += 1;
      const query = findById(...args);
      if (calls === 1) {
        const exec = query.exec.bind(query);
        query.exec = async () => {
          const snapshot = await exec();
          await LeadModel.collection.updateOne({ _id: "lead-a" }, { $set: { ownerId: actors.salesB.id } });
          return snapshot;
        };
      }
      return query;
    });
    await save(server, "lead-a").expect(404);
    expect(await state()).toEqual({ counter: null, leads: [], estimates: [], audits: [] });
  });

  it.each([999999, 1000000, Number.MAX_SAFE_INTEGER - 1])("continues safely from %s", async (lastNumber) => {
    await seedLead("lead-a");
    await ProjectNumberSequenceModel.create({ _id: PROJECT_NUMBER_SEQUENCE_ID, lastNumber });
    const { server } = app();
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBe(`Lisno${lastNumber + 1}`);
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBe(`Lisno${lastNumber + 1}`);
  });

  it.each([null, 2])("rejects absent/stale counter %s even when its next value is a gap", async (counter) => {
    await seedLead("lead-a"); await seedLead("lead-issued", "salesB");
    await LeadModel.collection.updateOne({ _id: "lead-issued" }, { $set: { projectNumber: "Lisno1000000" } });
    if (counter !== null) await ProjectNumberSequenceModel.create({ _id: PROJECT_NUMBER_SEQUENCE_ID, lastNumber: counter });
    const { server } = app();
    expect((await save(server, "lead-a").expect(409)).body.error.code).toBe("PROJECT_NUMBER_STATE_CONFLICT");
    expect((await state()).estimates).toEqual([]);
    expect((await state()).counter).toBe(counter);
  });

  it.each(["🌏🌏000001", "Lisno000000", "Lisno0000001", "Lisno9007199254740992"])("fails explicitly for malformed stored number %s", async (number) => {
    await seedLead("lead-a"); await seedLead("lead-issued", "salesB");
    await LeadModel.collection.updateOne({ _id: "lead-issued" }, { $set: { projectNumber: number } });
    const { server } = app();
    expect((await save(server, "lead-a").expect(409)).body.error.code).toBe("PROJECT_NUMBER_STATE_CONFLICT");
    expect((await state()).estimates).toEqual([]);
  });

  it("fails at exhaustion without assigning an unsafe number", async () => {
    await seedLead("lead-a");
    await ProjectNumberSequenceModel.create({ _id: PROJECT_NUMBER_SEQUENCE_ID, lastNumber: Number.MAX_SAFE_INTEGER });
    const { server } = app();
    expect((await save(server, "lead-a").expect(409)).body.error.code).toBe("PROJECT_NUMBER_EXHAUSTED");
    expect((await state()).leads).toEqual([]);
    expect((await state()).estimates).toEqual([]);
  });

  it("reuses an already issued number when an estimate is recreated and retains highwater after deletion", async () => {
    await seedLead("lead-a"); await seedLead("lead-b", "salesB");
    const { server } = app();
    await save(server, "lead-a").expect(200);
    await EstimateModel.deleteMany({ leadId: "lead-a" });
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBe("Lisno000001");
    expect((await state()).audits).toHaveLength(1);
    await LeadModel.deleteOne({ _id: "lead-a" });
    await EstimateModel.deleteMany({ leadId: "lead-a" });
    expect((await save(server, "lead-b", "salesB").expect(200)).body.data.projectNumber).toBe("Lisno000002");
  });

  it("enforces number uniqueness while allowing many historical nulls", async () => {
    await seedLead("lead-a"); await seedLead("lead-b", "salesB");
    const { server } = app();
    await save(server, "lead-a").expect(200);
    await expect(LeadModel.collection.updateOne({ _id: "lead-b" }, { $set: { projectNumber: "Lisno000001" } })).rejects.toMatchObject({ code: 11000 });
  });

  it.each(["missing", "null", "conflicting"])("rejects a %s Lead number when an earlier assignment audit survives", async (kind) => {
    await seedLead("lead-a");
    const { server } = app();
    await save(server, "lead-a").expect(200);
    await EstimateModel.deleteMany({ leadId: "lead-a" });
    await LeadModel.collection.updateOne({ _id: "lead-a" }, kind === "missing"
      ? { $unset: { projectNumber: "" } }
      : { $set: { projectNumber: kind === "null" ? null : "Lisno000002" } });
    // Leave a valid high-water mark so only the Lead's audit disagreement causes the conflict.
    await ProjectNumberSequenceModel.updateOne({ _id: PROJECT_NUMBER_SEQUENCE_ID }, { $set: { lastNumber: 10 } });
    expect((await save(server, "lead-a").expect(409)).body.error.code).toBe("PROJECT_NUMBER_STATE_CONFLICT");
    const persisted = await state();
    expect(persisted.counter).toBe(10);
    expect(persisted.estimates).toEqual([]);
    expect(persisted.audits).toHaveLength(1);
    expect(persisted.audits[0].newValues.projectNumber).toBe("Lisno000001");
    expect((await LeadModel.findById("lead-a").lean())?.projectNumber ?? null).toBe(kind === "conflicting" ? "Lisno000002" : null);
  });

  it("rejects contradictory canonical Lead identity in an assignment audit", async () => {
    await seedLead("lead-a");
    const { server } = app();
    await save(server, "lead-a").expect(200);
    await EstimateModel.deleteMany({ leadId: "lead-a" });
    await AuditEventModel.collection.updateOne({ action: "project_number_assigned", entityId: "lead-a" }, {
      $set: { "newValues.leadId": "lead-other" }
    });
    expect((await save(server, "lead-a").expect(409)).body.error.code).toBe("PROJECT_NUMBER_STATE_CONFLICT");
    expect((await state()).counter).toBe(1);
    expect((await state()).estimates).toEqual([]);
  });

  it("retains a valid preexisting Lead number without creating a retroactive assignment audit", async () => {
    await seedLead("lead-a");
    await LeadModel.collection.updateOne({ _id: "lead-a" }, { $set: { projectNumber: "Lisno000012" } });
    await ProjectNumberSequenceModel.create({ _id: PROJECT_NUMBER_SEQUENCE_ID, lastNumber: 12 });
    const { server } = app();
    expect((await save(server, "lead-a").expect(200)).body.data.projectNumber).toBe("Lisno000012");
    expect((await state()).counter).toBe(12);
    expect((await state()).audits).toEqual([]);
  });

  it.each([null, 0])("fails closed for counter %s after numbered Leads were deleted", async (lastNumber) => {
    await seedLead("lead-a"); await seedLead("lead-b", "salesB");
    const { server } = app();
    await save(server, "lead-a").expect(200);
    await LeadModel.deleteOne({ _id: "lead-a" });
    await EstimateModel.deleteMany({ leadId: "lead-a" });
    await ProjectNumberSequenceModel.deleteMany({});
    if (lastNumber !== null) await ProjectNumberSequenceModel.create({ _id: PROJECT_NUMBER_SEQUENCE_ID, lastNumber });
    expect((await save(server, "lead-b", "salesB").expect(409)).body.error.code).toBe("PROJECT_NUMBER_STATE_CONFLICT");
    expect((await state()).counter).toBe(lastNumber);
    expect((await state()).estimates).toEqual([]);
  });

  it("rejects a changed Lead owner before saving an existing estimate or revealing its number", async () => {
    await seedLead("lead-a");
    const { server } = app();
    await save(server, "lead-a").expect(200);
    await LeadModel.collection.updateOne({ _id: "lead-a" }, { $set: { ownerId: actors.salesB.id } });
    expect((await save(server, "lead-a", "salesB").expect(409)).body.error.code).toBe("ESTIMATE_PROJECT_CONFLICT");
    await request(server).get("/api/v1/leads/lead-a/estimate").set("Authorization", "Bearer salesA").expect(404);
    expect((await state()).counter).toBe(1);
    expect((await state()).audits).toHaveLength(1);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, null])("rejects invalid persisted counter %s", async (lastNumber) => {
    await seedLead("lead-a");
    await ProjectNumberSequenceModel.collection.insertOne({ _id: PROJECT_NUMBER_SEQUENCE_ID, lastNumber });
    const { server } = app();
    expect((await save(server, "lead-a").expect(409)).body.error.code).toBe("PROJECT_NUMBER_STATE_CONFLICT");
    expect((await state()).leads).toEqual([]);
    expect((await state()).estimates).toEqual([]);
  });
});
