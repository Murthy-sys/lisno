import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp as createApplication } from "../src/app.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { UserModel } from "../src/models/User.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { resolveApprovalProject } from "../src/services/estimate-project-handoff.js";

const createApp = (dependencies: Parameters<typeof createApplication>[0]) =>
  createApplication({
    ...dependencies,
    developmentDemoAuthorization: developmentDemoAuthentication()
  });

const LEAD_SECRET = "lead-test-secret-with-enough-entropy";
const app = createApp({ repository: createMemoryRepository(demoSeedData), auth: { jwtSecret: LEAD_SECRET, jwtExpiresInSeconds: 900 } });

async function salesToken() {
  const response = await request(app).post("/api/v1/auth/login").send({ email: "sales@lisno.example", password: "LisnoDemo2026!" });
  return response.body.data.token as string;
}

const lead = { clientName: "Ramesh Nair", clientEmail: "ramesh@example.com", clientMobile: "9876500000", projectName: "Prestige Lakeside", location: "Bengaluru", propertyType: "3BHK", budgetMin: 1000000, budgetMax: 1400000, source: "Referral", nextAction: "Call client", nextActionAt: "2026-08-01T10:00:00.000Z" };

const CHARACTERIZATION_NOW = "2026-08-17T12:00:00.000Z";
const CHARACTERIZATION_LEAD = {
  id: "lead-aurora",
  ownerId: "user-estimator-sales",
  projectId: null,
  clientName: "Rhea Kapoor",
  clientEmail: "client@aurora.example",
  clientMobile: "+91 90000 00000",
  projectName: "Aurora",
  location: "Pune",
  propertyType: "villa",
  budgetMin: null,
  budgetMax: null,
  source: "referral",
  stage: "new_lead" as const,
  nextAction: "site visit",
  nextActionAt: "2026-09-01T10:00:00.000Z",
  builder: null,
  areaSqft: null,
  targetHandoverAt: null,
  notes: null,
  latestActivityAt: null,
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T12:00:00.000Z"
};
const CHARACTERIZATION_LEAD_BODY = {
  clientName: "Asha Rao",
  clientEmail: "asha@example.com",
  clientMobile: "9999999999",
  projectName: "Aurora",
  location: "Pune",
  propertyType: "villa",
  source: "referral",
  nextAction: "site visit",
  nextActionAt: "2026-09-01T10:00:00.000Z"
};
const CHARACTERIZATION_ESTIMATE_BODY = {
  propertyType: "villa",
  rooms: [],
  scopes: ["interiors"],
  lineItems: [{
    catalogueId: "cat-paint",
    roomName: "Living",
    specification: "Primer and paint",
    unit: "sqft",
    rate: 10,
    quantity: 100,
    included: true
  }]
};

function setupLeadCharacterization(
  leadOverrides: Partial<typeof CHARACTERIZATION_LEAD> = {}
) {
  const seed = structuredClone(demoSeedData);
  seed.leads = [{ ...structuredClone(CHARACTERIZATION_LEAD), ...leadOverrides }];
  seed.leadActivities = [];
  seed.users.push({
    ...seed.users[0]!,
    id: "user-super-admin",
    name: "Global Administrator",
    email: "super-admin@lisno.example",
    emailNormalized: "super-admin@lisno.example",
    role: "super_admin",
    managerId: null,
    authorizedClientIds: []
  });
  const repository = createMemoryRepository(seed);
  const runInTransaction = vi.spyOn(repository, "runInTransaction");
  const projectGrantSpies = [
    vi.spyOn(repository, "findActiveProjectAccessGrant"),
    vi.spyOn(repository, "listProjectsForUserInModule"),
    vi.spyOn(repository, "pageProjectsForUserInModule")
  ] as const;
  const app = createApp({
    repository,
    auth: { jwtSecret: LEAD_SECRET, jwtExpiresInSeconds: 900 },
    clock: () => new Date(CHARACTERIZATION_NOW)
  });
  const authorization = `Bearer ${jwt.sign(
    { id: "user-estimator-sales", role: "estimator_sales" },
    LEAD_SECRET,
    { expiresIn: 900 }
  )}`;
  const superAdminAuthorization = `Bearer ${jwt.sign(
    { id: "user-super-admin", role: "super_admin" },
    LEAD_SECRET,
    { expiresIn: 900 }
  )}`;
  return { app, authorization, superAdminAuthorization, repository, runInTransaction, projectGrantSpies };
}

function estimateFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: "estimate-draft",
    leadId: "lead-aurora",
    ownerId: "user-estimator-sales",
    version: 1,
    designLifecycleVersion: 0,
    designFrozenAt: null,
    status: "draft",
    propertyType: "villa",
    rooms: [],
    scopes: ["interiors"],
    lineItems: [],
    subtotal: 0,
    gst: 0,
    total: 0,
    approvalRequired: false,
    assignedManagerId: null,
    assignedDesignerId: null,
    submittedAt: null,
    sentToClientAt: null,
    clientDecisionAt: null,
    projectId: null,
    reviews: [],
    notifications: [],
    ...overrides
  } as Record<string, any>;
}

function estimateDocument(overrides: Record<string, unknown> = {}) {
  const document = estimateFixture(overrides);
  document.save = vi.fn(async () => document);
  document.toObject = () => Object.fromEntries(
    Object.entries(document).filter(([key]) => key !== "save" && key !== "toObject")
  );
  return document;
}

function plainEstimateRecord(record: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "save" && key !== "toObject")
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function immutableEstimateSnapshot(record: Record<string, any>) {
  return deepFreeze(structuredClone(plainEstimateRecord(record)));
}

function estimateDto(record: Record<string, any>) {
  const { _id, ...plain } = plainEstimateRecord(record);
  return JSON.parse(JSON.stringify({ ...plain, id: _id }));
}

describe("lead API", () => {
  it("creates, lists, updates and logs an owner activity", async () => {
    const token = await salesToken();
    const created = await request(app).post("/api/v1/leads").set("Authorization", `Bearer ${token}`).send(lead).expect(201);
    expect(created.body.data).toMatchObject({ ownerId: "user-estimator-sales", stage: "new_lead", clientName: "Ramesh Nair" });
    const id = created.body.data.id as string;
    const fetched = await request(app).get(`/api/v1/leads/${id}`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(fetched.body.data).toMatchObject({ id, ownerId: "user-estimator-sales", clientName: "Ramesh Nair" });
    await request(app).patch(`/api/v1/leads/${id}`).set("Authorization", `Bearer ${token}`).send({ stage: "negotiation" }).expect(200);
    await request(app).post(`/api/v1/leads/${id}/activities`).set("Authorization", `Bearer ${token}`).send({ type: "call", note: "Confirmed site visit", occurredAt: "2026-07-29T10:00:00.000Z" }).expect(201);
    const listed = await request(app).get("/api/v1/leads?search=nair&stage=negotiation&limit=20&offset=0").set("Authorization", `Bearer ${token}`).expect(200);
    expect(listed.body.data.items).toHaveLength(1);
    const activities = await request(app).get(`/api/v1/leads/${id}/activities`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(activities.body.data.items[0]).toMatchObject({ note: "Confirmed site visit" });
  });
});

describe("lead and owner-estimate route characterizations", () => {
  it.each([
    "clientName",
    "clientEmail",
    "clientMobile",
    "projectName",
    "location",
    "source"
  ] as const)("rejects linked Lead identity mutation for %s", async (field) => {
    const { app, authorization, runInTransaction } = setupLeadCharacterization({
      projectId: "project-admin-1"
    });
    const value = field === "clientEmail" ? "changed@example.com" : "changed";

    const response = await request(app)
      .patch("/api/v1/leads/lead-aurora")
      .set("Authorization", authorization)
      .send({ [field]: value })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: "LINKED_LEAD_IDENTITY_IMMUTABLE",
      fields: { [field]: "This field is managed by the linked project." }
    });
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it("rejects public projectId and ownerId Lead changes as unknown fields", async () => {
    const { app, authorization, runInTransaction } = setupLeadCharacterization({
      projectId: "project-admin-1"
    });

    for (const body of [
      { projectId: "project-other" },
      { ownerId: "user-other-estimator" }
    ]) {
      const response = await request(app)
        .patch("/api/v1/leads/lead-aurora")
        .set("Authorization", authorization)
        .send(body)
        .expect(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it("allows live workflow fields to change on a linked Lead", async () => {
    const { app, authorization } = setupLeadCharacterization({
      projectId: "project-admin-1"
    });

    const response = await request(app)
      .patch("/api/v1/leads/lead-aurora")
      .set("Authorization", authorization)
      .send({
        propertyType: "4BHK",
        budgetMin: 1_000_000,
        budgetMax: 1_500_000,
        stage: "contacted",
        nextAction: "Confirm site visit",
        nextActionAt: "2026-08-27T10:00:00+05:30"
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      projectId: "project-admin-1",
      propertyType: "4BHK",
      budgetMin: 1_000_000,
      budgetMax: 1_500_000,
      stage: "contacted",
      nextAction: "Confirm site visit",
      nextActionAt: "2026-08-27T10:00:00+05:30"
    });
  });

  it("copies, backfills, and protects a linked Lead project on draft save", async () => {
    const { app, authorization } = setupLeadCharacterization({
      projectId: "project-admin-1"
    });
    const findEstimate = vi.spyOn(EstimateModel, "findOne");
    const modelSave = vi
      .spyOn(EstimateModel.prototype, "save")
      .mockImplementation(async function () { return this; });

    findEstimate.mockReturnValueOnce(query(null) as never);
    const firstSave = await request(app)
      .put("/api/v1/leads/lead-aurora/estimate")
      .set("Authorization", authorization)
      .send(CHARACTERIZATION_ESTIMATE_BODY)
      .expect(200);
    expect(firstSave.body.data.projectId).toBe("project-admin-1");

    const legacyDraft = estimateDocument({ projectId: null });
    findEstimate.mockReturnValueOnce(query(legacyDraft) as never);
    const backfilledSave = await request(app)
      .put("/api/v1/leads/lead-aurora/estimate")
      .set("Authorization", authorization)
      .send(CHARACTERIZATION_ESTIMATE_BODY)
      .expect(200);
    expect(backfilledSave.body.data.projectId).toBe("project-admin-1");

    const conflictingDraft = estimateDocument({ projectId: "project-other" });
    const conflictingBefore = immutableEstimateSnapshot(conflictingDraft);
    findEstimate.mockReturnValueOnce(query(conflictingDraft) as never);
    const conflictingSave = await request(app)
      .put("/api/v1/leads/lead-aurora/estimate")
      .set("Authorization", authorization)
      .send(CHARACTERIZATION_ESTIMATE_BODY)
      .expect(409);
    expect(conflictingSave.body.error.code).toBe("ESTIMATE_PROJECT_CONFLICT");
    expect(conflictingDraft.save).not.toHaveBeenCalled();
    expect(plainEstimateRecord(conflictingDraft)).toEqual(conflictingBefore);
    expect(modelSave).toHaveBeenCalledOnce();
  });

  it("allows Super Admin global Lead reads and denies personal mutations before service entry", async () => {
    const { app, superAdminAuthorization, runInTransaction, projectGrantSpies } = setupLeadCharacterization();

    await request(app)
      .get("/api/v1/leads?limit=20&offset=0")
      .set("Authorization", superAdminAuthorization)
      .expect(200, {
        data: {
          items: [CHARACTERIZATION_LEAD],
          pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
        }
      });
    await request(app)
      .get("/api/v1/leads/lead-aurora")
      .set("Authorization", superAdminAuthorization)
      .expect(200, { data: CHARACTERIZATION_LEAD });
    await request(app)
      .get("/api/v1/leads/lead-aurora/activities?limit=20&offset=0")
      .set("Authorization", superAdminAuthorization)
      .expect(200);

    await request(app).post("/api/v1/leads").set("Authorization", superAdminAuthorization).send({}).expect(403);
    await request(app).patch("/api/v1/leads/lead-aurora").set("Authorization", superAdminAuthorization).send({}).expect(403);
    await request(app).post("/api/v1/leads/lead-aurora/activities").set("Authorization", superAdminAuthorization).send({}).expect(403);

    expect(runInTransaction).not.toHaveBeenCalled();
    for (const spy of projectGrantSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("row 66 returns the exact paginated owner lead envelope without writes", async () => {
    const { app, authorization, runInTransaction } = setupLeadCharacterization();

    const response = await request(app)
      .get("/api/v1/leads?limit=20&offset=0")
      .set("Authorization", authorization)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        items: [CHARACTERIZATION_LEAD],
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
      }
    });
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it("row 67 creates exactly one actor-owned lead with the exact DTO", async () => {
    const { app, authorization, repository, runInTransaction } = setupLeadCharacterization();

    const response = await request(app)
      .post("/api/v1/leads")
      .set("Authorization", authorization)
      .send(CHARACTERIZATION_LEAD_BODY)
      .expect(201);
    const createdId = response.body.data.id as string;

    expect(response.body).toEqual({
      data: {
        id: expect.stringMatching(/^lead-/),
        ownerId: "user-estimator-sales",
        projectId: null,
        ...CHARACTERIZATION_LEAD_BODY,
        budgetMin: null,
        budgetMax: null,
        builder: null,
        areaSqft: null,
        targetHandoverAt: null,
        notes: null,
        stage: "new_lead",
        latestActivityAt: null,
        createdAt: CHARACTERIZATION_NOW,
        updatedAt: CHARACTERIZATION_NOW
      }
    });
    const page = await repository.pageLeadsForOwner(
      "user-estimator-sales",
      {},
      { limit: 20, offset: 0 }
    );
    expect(page.items.filter((item) => item.id === createdId)).toEqual([
      response.body.data
    ]);
    expect(page.total).toBe(2);
    expect(runInTransaction).toHaveBeenCalledOnce();
  });

  it("row 68 returns the exact owner lead DTO without writes", async () => {
    const { app, authorization, runInTransaction } = setupLeadCharacterization();

    const response = await request(app)
      .get("/api/v1/leads/lead-aurora")
      .set("Authorization", authorization)
      .expect(200);

    expect(response.body).toEqual({ data: CHARACTERIZATION_LEAD });
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it("row 69 changes the stage exactly once and returns the exact DTO", async () => {
    const { app, authorization, repository, runInTransaction } = setupLeadCharacterization();

    const response = await request(app)
      .patch("/api/v1/leads/lead-aurora")
      .set("Authorization", authorization)
      .send({ stage: "negotiation" })
      .expect(200);
    const expected = {
      ...CHARACTERIZATION_LEAD,
      stage: "negotiation",
      updatedAt: CHARACTERIZATION_NOW
    };

    expect(response.body).toEqual({ data: expected });
    expect(await repository.findLeadById("lead-aurora")).toEqual(expected);
    expect(runInTransaction).toHaveBeenCalledOnce();
  });

  it("row 70 returns the exact empty activity page without writes", async () => {
    const { app, authorization, runInTransaction } = setupLeadCharacterization();

    const response = await request(app)
      .get("/api/v1/leads/lead-aurora/activities?limit=20&offset=0")
      .set("Authorization", authorization)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        items: [],
        pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
      }
    });
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it("row 71 appends one exact activity and updates the lead once", async () => {
    const { app, authorization, repository, runInTransaction } = setupLeadCharacterization();
    const activityInput = {
      type: "call",
      note: "Confirmed site visit",
      occurredAt: "2026-07-29T10:00:00.000Z"
    };

    const response = await request(app)
      .post("/api/v1/leads/lead-aurora/activities")
      .set("Authorization", authorization)
      .send(activityInput)
      .expect(201);

    expect(response.body).toEqual({
      data: {
        id: expect.stringMatching(/^lead-activity-/),
        leadId: "lead-aurora",
        actorId: "user-estimator-sales",
        ...activityInput,
        createdAt: CHARACTERIZATION_NOW
      }
    });
    expect(await repository.listLeadActivities("lead-aurora")).toEqual([
      response.body.data
    ]);
    expect(await repository.findLeadById("lead-aurora")).toEqual({
      ...CHARACTERIZATION_LEAD,
      latestActivityAt: activityInput.occurredAt,
      updatedAt: CHARACTERIZATION_NOW
    });
    expect(runInTransaction).toHaveBeenCalledOnce();
  });

  it("row 72 returns the fixture null estimate without writes", async () => {
    const { app, authorization, runInTransaction } = setupLeadCharacterization();
    const findEstimate = vi
      .spyOn(EstimateModel, "findOne")
      .mockReturnValue(query(null) as never);
    const updateEstimate = vi.spyOn(EstimateModel, "updateOne");
    const updateLead = vi.spyOn(LeadModel, "updateOne");

    const response = await request(app)
      .get("/api/v1/leads/lead-aurora/estimate")
      .set("Authorization", authorization)
      .expect(200);

    expect(response.body).toEqual({ data: null });
    expect(findEstimate).toHaveBeenCalledOnce();
    expect(findEstimate).toHaveBeenCalledWith({
      leadId: "lead-aurora",
      ownerId: "user-estimator-sales"
    });
    expect(updateEstimate).not.toHaveBeenCalled();
    expect(updateLead).not.toHaveBeenCalled();
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it("row 73 returns the exact owner estimate list without writes", async () => {
    const { app, authorization, runInTransaction } = setupLeadCharacterization();
    const estimate = estimateFixture();
    const mongoLead = {
      _id: "lead-aurora",
      ownerId: "user-estimator-sales",
      clientName: "Rhea Kapoor",
      clientEmail: "client@aurora.example",
      projectName: "Aurora",
      location: "Pune"
    };
    const findEstimates = vi
      .spyOn(EstimateModel, "find")
      .mockReturnValue(query([estimate]) as never);
    const findLeads = vi
      .spyOn(LeadModel, "find")
      .mockReturnValue(query([mongoLead]) as never);
    const updateEstimate = vi.spyOn(EstimateModel, "updateOne");
    const updateLead = vi.spyOn(LeadModel, "updateOne");

    const response = await request(app)
      .get("/api/v1/estimates")
      .set("Authorization", authorization)
      .expect(200);

    expect(response.body).toEqual({
      data: [{
        ...estimateDto(estimate),
        lead: {
          ownerId: "user-estimator-sales",
          clientName: "Rhea Kapoor",
          clientEmail: "client@aurora.example",
          projectName: "Aurora",
          location: "Pune",
          id: "lead-aurora"
        }
      }]
    });
    expect(findEstimates).toHaveBeenCalledWith({ ownerId: "user-estimator-sales" });
    expect(findLeads).toHaveBeenCalledWith({
      _id: { $in: ["lead-aurora"] },
      ownerId: "user-estimator-sales"
    });
    expect(updateEstimate).not.toHaveBeenCalled();
    expect(updateLead).not.toHaveBeenCalled();
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it("allows Super Admin global estimate, queue, designer, and client-visible reads without project grants", async () => {
    const { app, superAdminAuthorization, projectGrantSpies } = setupLeadCharacterization();
    const draft = estimateFixture();
    const pendingAssignment = estimateFixture({ _id: "estimate-awaiting", status: "pending_manager_assignment" });
    const clientVisible = estimateFixture({ _id: "estimate-visible", status: "sent_to_client" });
    const mongoLead = {
      _id: "lead-aurora",
      ownerId: "user-estimator-sales",
      clientName: "Rhea Kapoor",
      clientEmail: "client@aurora.example",
      projectName: "Aurora",
      location: "Pune"
    };
    const findOne = vi.spyOn(EstimateModel, "findOne").mockImplementation((filter) =>
      query((filter as Record<string, unknown>).leadId === "lead-aurora" ? draft : null) as never
    );
    const findEstimates = vi.spyOn(EstimateModel, "find").mockImplementation((filter) => {
      if (Object.keys(filter as object).length === 0) return query([draft]) as never;
      const status = (filter as Record<string, any>).status;
      if (status?.$in?.includes("pending_manager_assignment")) return query([pendingAssignment]) as never;
      if (status?.$in?.includes("sent_to_client")) return query([clientVisible]) as never;
      return query([]) as never;
    });
    const findLeads = vi.spyOn(LeadModel, "find").mockReturnValue(query([mongoLead]) as never);
    const findDesigners = vi.spyOn(UserModel, "find").mockReturnValue(query([{
      _id: "designer-1", name: "Designer", email: "designer@example.com", title: "Designer"
    }]) as never);

    await request(app).get("/api/v1/leads/lead-aurora/estimate").set("Authorization", superAdminAuthorization).expect(200);
    await request(app).get("/api/v1/estimates").set("Authorization", superAdminAuthorization).expect(200);
    const queue = await request(app).get("/api/v1/estimates/review-queue").set("Authorization", superAdminAuthorization).expect(200);
    const designers = await request(app).get("/api/v1/estimates/designers").set("Authorization", superAdminAuthorization).expect(200);
    const visible = await request(app).get("/api/v1/client/estimates").set("Authorization", superAdminAuthorization).expect(200);

    expect(findOne).toHaveBeenCalledWith({ leadId: "lead-aurora" });
    expect(findEstimates).toHaveBeenCalledWith({});
    expect(findEstimates).toHaveBeenCalledWith({ status: { $in: ["pending_manager_assignment", "pending_designer_approval"] } });
    expect(findEstimates).toHaveBeenCalledWith({ status: { $in: ["sent_to_client", "client_changes_requested", "client_approved"] } });
    expect(findDesigners).toHaveBeenCalledWith({ role: "designer", active: true });
    expect(findLeads).toHaveBeenCalledWith({ _id: { $in: ["lead-aurora"] } });
    expect(queue.body.data).toHaveLength(1);
    expect(designers.body.data).toEqual([{ id: "designer-1", name: "Designer", email: "designer@example.com", title: "Designer" }]);
    expect(visible.body.data).toHaveLength(1);
    for (const spy of projectGrantSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("assigns through a selected Designer's active manager and audits the real Super Admin", async () => {
    const { app, superAdminAuthorization, projectGrantSpies } = setupLeadCharacterization();
    const estimate = estimateDocument({ _id: "estimate-awaiting", status: "pending_manager_assignment" });
    const designer = { _id: "designer-1", name: "Designer One", email: "designer@example.com", role: "designer", active: true, managerId: "manager-1" };
    const manager = { _id: "manager-1", name: "Manager One", email: "manager@example.com", role: "design_manager", active: true };
    const findUser = vi.spyOn(UserModel, "findOne").mockImplementation((filter) =>
      query((filter as Record<string, unknown>).role === "designer" ? designer : manager) as never
    );
    vi.spyOn(EstimateModel, "findOne").mockReturnValue(query(estimate) as never);
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
    const auditCreate = vi.spyOn(AuditEventModel, "create").mockImplementation(async (input) =>
      (input as Array<Record<string, unknown>>).map((event) => ({
        toObject: () => ({ ...event })
      })) as never
    );

    const response = await request(app)
      .post("/api/v1/estimates/estimate-awaiting/assign")
      .set("Authorization", superAdminAuthorization)
      .send({ designerId: designer._id })
      .expect(200);

    expect(findUser).toHaveBeenNthCalledWith(1, { _id: designer._id, role: "designer", active: true });
    expect(findUser).toHaveBeenNthCalledWith(2, { _id: manager._id, role: "design_manager", active: true });
    expect(response.body.data).toMatchObject({
      assignedDesignerId: designer._id,
      assignedManagerId: manager._id,
      status: "pending_designer_approval",
      reviews: [expect.objectContaining({ actorId: "user-super-admin", action: "designer_assigned" })]
    });
    expect(estimate.save).toHaveBeenCalledWith({ session });
    expect(auditCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        actorId: "user-super-admin",
        action: "estimate_designer_assigned",
        entityId: "estimate-awaiting"
      })
    ], { session });
    for (const spy of projectGrantSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("rolls back row 79 assignment, review, and notification when typed audit persistence fails", async () => {
    const { app, superAdminAuthorization } = setupLeadCharacterization();
    const replica = await startMongoReplicaSet();
    try {
      await UserModel.create([
        {
          _id: "manager-atomic",
          name: "Atomic Manager",
          email: "atomic-manager@example.com",
          emailNormalized: "atomic-manager@example.com",
          passwordHash: "not-used",
          role: "design_manager",
          active: true
        },
        {
          _id: "designer-atomic",
          name: "Atomic Designer",
          email: "atomic-designer@example.com",
          emailNormalized: "atomic-designer@example.com",
          passwordHash: "not-used",
          role: "designer",
          active: true,
          managerId: "manager-atomic"
        }
      ]);
      await EstimateModel.create({
        _id: "estimate-audit-failure",
        leadId: "lead-audit-failure",
        ownerId: "user-estimator-sales",
        status: "pending_manager_assignment",
        propertyType: "villa"
      });
      vi.spyOn(AuditEventModel, "create").mockRejectedValue(
        new Error("audit unavailable") as never
      );

      await request(app)
        .post("/api/v1/estimates/estimate-audit-failure/assign")
        .set("Authorization", superAdminAuthorization)
        .send({ designerId: "designer-atomic" })
        .expect(500);

      expect(await EstimateModel.findById("estimate-audit-failure").lean()).toMatchObject({
        status: "pending_manager_assignment",
        assignedDesignerId: null,
        assignedManagerId: null,
        reviews: [],
        notifications: []
      });
      expect(AuditEventModel.create).toHaveBeenCalledOnce();
      expect(await AuditEventModel.countDocuments()).toBe(0);
    } finally {
      await replica.stop();
    }
  }, 30_000);

  it("denies every Super Admin personal Estimate mutation before validation or data access", async () => {
    const { app, superAdminAuthorization } = setupLeadCharacterization();
    const estimateFind = vi.spyOn(EstimateModel, "findOne");
    const leadFind = vi.spyOn(LeadModel, "findById");

    for (const [method, path] of [
      ["put", "/api/v1/leads/lead-aurora/estimate"],
      ["post", "/api/v1/leads/lead-aurora/estimate/submit"],
      ["post", "/api/v1/estimates/estimate-awaiting/designer-decision"],
      ["post", "/api/v1/estimates/estimate-ready/send-client"],
      ["post", "/api/v1/client/estimates/estimate-visible/decision"]
    ] as const) {
      await request(app)[method](path).set("Authorization", superAdminAuthorization).send({}).expect(403);
    }

    expect(estimateFind).not.toHaveBeenCalled();
    expect(leadFind).not.toHaveBeenCalled();
  });

  it("row 74 saves one exact calculated draft estimate", async () => {
    const { app, authorization, runInTransaction } = setupLeadCharacterization();
    const estimate = estimateDocument();
    const before = immutableEstimateSnapshot(estimate);
    const findEstimate = vi
      .spyOn(EstimateModel, "findOne")
      .mockReturnValue(query(estimate) as never);
    const updateLead = vi.spyOn(LeadModel, "updateOne");

    const response = await request(app)
      .put("/api/v1/leads/lead-aurora/estimate")
      .set("Authorization", authorization)
      .send(CHARACTERIZATION_ESTIMATE_BODY)
      .expect(200);
    const expected = {
      ...before,
      propertyType: "villa",
      rooms: [],
      scopes: ["interiors"],
      lineItems: [{
        ...CHARACTERIZATION_ESTIMATE_BODY.lineItems[0],
        amount: 1000
      }],
      subtotal: 1000,
      gst: 180,
      total: 1180
    };

    expect(response.body).toEqual({ data: estimateDto(expected) });
    expect(plainEstimateRecord(estimate)).toEqual(expected);
    expect(before).toEqual(estimateFixture());
    expect(findEstimate).toHaveBeenCalledOnce();
    expect(estimate.save).toHaveBeenCalledOnce();
    expect(updateLead).not.toHaveBeenCalled();
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it("row 75 submits once with exact status, review, notification, and Lead effect", async () => {
    const { app, authorization, runInTransaction } = setupLeadCharacterization();
    const estimate = estimateDocument({
      lineItems: [{ ...CHARACTERIZATION_ESTIMATE_BODY.lineItems[0], amount: 1000 }],
      subtotal: 1000,
      gst: 180,
      total: 1180
    });
    const before = immutableEstimateSnapshot(estimate);
    const findEstimate = vi
      .spyOn(EstimateModel, "findOne")
      .mockReturnValue(query(estimate) as never);
    const updateLead = vi
      .spyOn(LeadModel, "updateOne")
      .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never);

    const response = await request(app)
      .post("/api/v1/leads/lead-aurora/estimate/submit")
      .set("Authorization", authorization)
      .expect(200);
    const expectedState = {
      ...before,
      approvalRequired: false,
      status: "sent_to_client",
      submittedAt: expect.any(Date),
      sentToClientAt: expect.any(Date),
      reviews: [{
        actorId: "user-estimator-sales",
        action: "submitted",
        note: "",
        occurredAt: expect.any(Date)
      }],
      notifications: [{
        recipientEmail: "client@aurora.example",
        recipientRole: "client",
        event: "estimate_ready_for_review",
        status: "queued",
        queuedAt: expect.any(Date)
      }]
    };
    const expectedResponse = {
      ...estimateDto(before),
      approvalRequired: false,
      status: "sent_to_client",
      submittedAt: expect.any(String),
      sentToClientAt: expect.any(String),
      reviews: [{
        actorId: "user-estimator-sales",
        action: "submitted",
        note: "",
        occurredAt: expect.any(String)
      }],
      notifications: [{
        recipientEmail: "client@aurora.example",
        recipientRole: "client",
        event: "estimate_ready_for_review",
        status: "queued",
        queuedAt: expect.any(String)
      }]
    };

    expect(response.body).toEqual({ data: expectedResponse });
    expect(plainEstimateRecord(estimate)).toEqual(expectedState);
    expect(response.body.data.submittedAt).toBe(estimate.submittedAt.toISOString());
    expect(response.body.data.sentToClientAt).toBe(estimate.sentToClientAt.toISOString());
    expect(response.body.data.reviews[0].occurredAt).toBe(
      estimate.reviews[0].occurredAt.toISOString()
    );
    expect(response.body.data.notifications[0].queuedAt).toBe(
      estimate.notifications[0].queuedAt.toISOString()
    );
    expect(findEstimate).toHaveBeenCalledOnce();
    expect(estimate.save).toHaveBeenCalledOnce();
    expect(updateLead).toHaveBeenCalledOnce();
    expect(updateLead).toHaveBeenCalledWith(
      { _id: "lead-aurora" },
      { $set: {
        stage: "estimate_sent",
        nextAction: "client estimate decision",
        nextActionAt: expect.any(Date)
      } }
    );
    expect(runInTransaction).not.toHaveBeenCalled();
  });
});

function query<T>(value: T) {
  const result = {
    sort: vi.fn(),
    select: vi.fn(),
    session: vi.fn(),
    lean: vi.fn(async () => value),
    then: (resolve: (value: T) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject)
  };
  result.sort.mockReturnValue(result);
  result.select.mockReturnValue(result);
  result.session.mockReturnValue(result);
  return result;
}

function clientToken() {
  return jwt.sign(
    { id: "user-client-aurora", role: "client" },
    LEAD_SECRET,
    { expiresIn: 900 }
  );
}

afterEach(() => vi.restoreAllMocks());

describe("linked estimate approval project conflicts", () => {
  const baseProject = () => ({
    _id: "project-admin-1",
    name: "Aurora",
    clientId: null,
    clientName: "Rhea Kapoor",
    clientEmail: "client@aurora.example",
    clientEmailNormalized: "client@aurora.example",
    clientMobile: "+91 90000 00000",
    clientAddress: "Pune",
    initiatingDesignerId: null,
    assignedEstimatorId: "user-estimator-sales",
    assignedDesignerIds: [],
    managerId: null,
    status: "planning",
    location: "Pune"
  });
  const baseInput = () => ({
    estimate: {
      projectId: "project-admin-1",
      ownerId: "user-estimator-sales"
    },
    lead: {
      projectId: "project-admin-1",
      ownerId: "user-estimator-sales",
      projectName: "Aurora",
      clientName: "Rhea Kapoor",
      clientEmail: "client@aurora.example",
      clientMobile: "+91 90000 00000",
      location: "Pune"
    },
    clientId: "user-client-aurora",
    assignedDesignerId: "designer-1",
    managerId: "manager-1",
    occurredAt: new Date("2026-08-23T10:00:00.000Z"),
    session: {} as mongoose.ClientSession
  });

  it.each([
    {
      name: "missing linked Project",
      mutate: (_input: ReturnType<typeof baseInput>, _project: ReturnType<typeof baseProject>) => undefined,
      missing: true
    },
    {
      name: "null Estimate link with a linked Lead",
      mutate: (input: ReturnType<typeof baseInput>) => { input.estimate.projectId = null; }
    },
    {
      name: "different non-null Lead and Estimate links",
      mutate: (input: ReturnType<typeof baseInput>) => { input.lead.projectId = "project-other"; }
    },
    {
      name: "mismatched Estimate and Lead owners",
      mutate: (input: ReturnType<typeof baseInput>) => { input.estimate.ownerId = "user-other"; }
    },
    {
      name: "mismatched assigned Estimator",
      mutate: (_input: ReturnType<typeof baseInput>, project: ReturnType<typeof baseProject>) => { project.assignedEstimatorId = "user-other"; }
    },
    {
      name: "non-null initiating Designer",
      mutate: (_input: ReturnType<typeof baseInput>, project: ReturnType<typeof baseProject>) => { project.initiatingDesignerId = "designer-legacy"; }
    },
    {
      name: "conflicting Project identity",
      mutate: (_input: ReturnType<typeof baseInput>, project: ReturnType<typeof baseProject>) => { project.name = "Different project"; }
    }
  ])("fails closed for $name without mutating the Project", async ({ mutate, missing }) => {
    const input = baseInput();
    const project = baseProject();
    const before = structuredClone(project);
    mutate(input, project);
    const expectedUnchanged = structuredClone(project);
    const findProject = vi
      .spyOn(ProjectModel, "findById")
      .mockReturnValue(query(missing ? null : project) as never);
    const updateProject = vi.spyOn(ProjectModel, "updateOne");
    const createProject = vi.spyOn(ProjectModel, "create");

    await expect(resolveApprovalProject(input)).rejects.toMatchObject({
      status: 409,
      code: "PROJECT_LINK_CONFLICT"
    });

    expect(project).toEqual(expectedUnchanged);
    expect(updateProject).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
    if (input.estimate.projectId === null) {
      expect(findProject).not.toHaveBeenCalled();
    }
    if (!missing && input.estimate.projectId !== null) {
      expect(before._id).toBe(project._id);
    }
  });

  it("fails closed when the linked Project compare-and-set loses a race", async () => {
    const input = baseInput();
    const project = baseProject();
    vi.spyOn(ProjectModel, "findById").mockReturnValue(query(project) as never);
    vi.spyOn(ProjectModel, "updateOne").mockResolvedValue({
      matchedCount: 0,
      modifiedCount: 0
    } as never);

    await expect(resolveApprovalProject(input)).rejects.toMatchObject({
      status: 409,
      code: "PROJECT_LINK_CONFLICT"
    });
  });
});

describe("linked estimate approval Mongo transaction", () => {
  const linkedProject = () => ({
    _id: "project-admin-replica",
    name: "Replica Aurora",
    clientId: null,
    clientName: "Rhea Kapoor",
    clientEmail: "client@aurora.example",
    clientEmailNormalized: "client@aurora.example",
    clientMobile: "+91 90000 00000",
    clientAddress: "Pune",
    initiatingDesignerId: null,
    assignedEstimatorId: "user-estimator-sales",
    assignedDesignerIds: [],
    managerId: null,
    status: "planning",
    location: "Pune",
    plannedStartAt: new Date("2026-08-23T10:00:00.000Z"),
    plannedEndAt: new Date("2026-11-21T10:00:00.000Z")
  });
  const resolverInput = (session: mongoose.ClientSession) => ({
    estimate: {
      projectId: "project-admin-replica",
      ownerId: "user-estimator-sales"
    },
    lead: {
      projectId: "project-admin-replica",
      ownerId: "user-estimator-sales",
      projectName: "Replica Aurora",
      clientName: "Rhea Kapoor",
      clientEmail: "client@aurora.example",
      clientMobile: "+91 90000 00000",
      location: "Pune"
    },
    clientId: "user-client-aurora",
    assignedDesignerId: "designer-1",
    managerId: "manager-1",
    occurredAt: new Date("2026-08-24T10:00:00.000Z"),
    session
  });
  const createGrant = () => ProjectAccessGrantModel.create({
    _id: "grant-admin-replica",
    projectId: "project-admin-replica",
    userId: "user-admin",
    module: "projects",
    source: "admin_initiator",
    accessRequestId: null,
    grantedById: "user-admin",
    active: true,
    grantedAt: new Date("2026-08-23T10:00:00.000Z"),
    revokedAt: null,
    revokedById: null,
    revocationReason: null
  });

  it("updates the pre-created Project without increasing Project or initiator-grant counts", async () => {
    const replica = await startMongoReplicaSet();
    try {
      await ProjectModel.create(linkedProject());
      await createGrant();
      const projectCountBefore = await ProjectModel.countDocuments();
      const session = await mongoose.startSession();
      try {
        let resolvedId: string | undefined;
        await session.withTransaction(async () => {
          resolvedId = await resolveApprovalProject(resolverInput(session));
        });
        expect(resolvedId).toBe("project-admin-replica");
      } finally {
        await session.endSession();
      }

      expect(await ProjectModel.countDocuments()).toBe(projectCountBefore);
      expect(await ProjectAccessGrantModel.countDocuments({
        projectId: "project-admin-replica",
        source: "admin_initiator",
        active: true
      })).toBe(1);
      expect(await ProjectModel.findById("project-admin-replica").lean()).toMatchObject({
        clientId: "user-client-aurora",
        initiatingDesignerId: null,
        assignedEstimatorId: "user-estimator-sales",
        assignedDesignerIds: ["designer-1"],
        managerId: "manager-1"
      });
    } finally {
      await replica.stop();
    }
  }, 30_000);

  it("leaves Project, Estimate, Lead, grant, and audit rows unchanged on a link conflict", async () => {
    const replica = await startMongoReplicaSet();
    try {
      await ProjectModel.create(linkedProject());
      await createGrant();
      await LeadModel.create({
        _id: "lead-admin-replica",
        projectId: "project-admin-replica",
        ownerId: "user-estimator-sales",
        clientName: "Rhea Kapoor",
        clientEmail: "client@aurora.example",
        clientMobile: "+91 90000 00000",
        projectName: "Replica Aurora",
        location: "Pune",
        propertyType: "villa",
        source: "admin_project",
        stage: "estimate_sent",
        nextAction: "client estimate decision",
        nextActionAt: new Date("2026-08-24T10:00:00.000Z")
      });
      await EstimateModel.create({
        _id: "estimate-admin-replica",
        leadId: "lead-admin-replica",
        ownerId: "user-estimator-sales",
        projectId: "project-admin-replica",
        status: "sent_to_client",
        propertyType: "villa"
      });
      await AuditEventModel.create({
        _id: "audit-admin-replica",
        actorId: "user-admin",
        action: "project_created",
        entityType: "project",
        entityId: "project-admin-replica",
        occurredAt: new Date("2026-08-23T10:00:00.000Z"),
        oldValues: {},
        newValues: { status: "planning" },
        reason: null
      });
      const before = await Promise.all([
        ProjectModel.find().sort({ _id: 1 }).lean(),
        EstimateModel.find().sort({ _id: 1 }).lean(),
        LeadModel.find().sort({ _id: 1 }).lean(),
        ProjectAccessGrantModel.find().sort({ _id: 1 }).lean(),
        AuditEventModel.find().sort({ _id: 1 }).lean()
      ]);
      const session = await mongoose.startSession();
      try {
        const input = resolverInput(session);
        input.lead.projectName = "Conflicting identity";
        await expect(session.withTransaction(async () => {
          await resolveApprovalProject(input);
        })).rejects.toMatchObject({ status: 409, code: "PROJECT_LINK_CONFLICT" });
      } finally {
        await session.endSession();
      }
      const after = await Promise.all([
        ProjectModel.find().sort({ _id: 1 }).lean(),
        EstimateModel.find().sort({ _id: 1 }).lean(),
        LeadModel.find().sort({ _id: 1 }).lean(),
        ProjectAccessGrantModel.find().sort({ _id: 1 }).lean(),
        AuditEventModel.find().sort({ _id: 1 }).lean()
      ]);
      expect(after).toEqual(before);
    } finally {
      await replica.stop();
    }
  }, 30_000);
});

describe("estimate final drawing approval gate", () => {
  it("rejects unresolved drawings transactionally without changing the estimate", async () => {
    const estimate = {
      _id: "estimate-gated",
      leadId: "lead-gated",
      ownerId: "user-estimator-sales",
      version: 4,
      status: "sent_to_client",
      designLifecycleVersion: 0,
      designFrozenAt: null,
      assignedDesignerId: "designer-1",
      reviews: [],
      notifications: [],
      save: vi.fn(async () => undefined),
      toObject() { return { ...this, save: undefined, toObject: undefined }; }
    };
    const lead = {
      _id: "lead-gated",
      clientEmail: "client@aurora.example",
      projectName: "Gated project"
    };
    const drawings = [
      { _id: "drawing-approved", estimateId: estimate._id, active: true },
      { _id: "drawing-changes", estimateId: estimate._id, active: true }
    ];
    const revisions = new Map([
      ["drawing-approved", { reviewStatus: "approved" }],
      ["drawing-changes", { reviewStatus: "changes_requested" }]
    ]);
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
    vi.spyOn(EstimateModel, "findOne").mockReturnValue(query(estimate) as never);
    vi.spyOn(EstimateModel, "findById").mockReturnValue(query(estimate) as never);
    vi.spyOn(LeadModel, "findById").mockReturnValue(query(lead) as never);
    vi.spyOn(LeadModel, "findOne").mockReturnValue(query(lead) as never);
    vi.spyOn(EstimateDesignDrawingModel, "find").mockReturnValue(query(drawings) as never);
    vi.spyOn(EstimateDesignRevisionModel, "findOne").mockImplementation((filter) =>
      query(revisions.get(String(filter.drawingId)) ?? null) as never
    );
    vi.spyOn(UserModel, "findById").mockImplementation((id) =>
      query(id === "designer-1"
        ? { _id: "designer-1", email: "designer@example.com", role: "designer", managerId: "manager-1" }
        : { _id: "manager-1", email: "manager@example.com", role: "design_manager" }) as never
    );
    const projectCreate = vi.spyOn(ProjectModel, "create").mockResolvedValue({} as never);
    vi.spyOn(LeadModel, "updateOne").mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never);

    const response = await request(app)
      .post("/api/v1/client/estimates/estimate-gated/decision")
      .set("Authorization", `Bearer ${clientToken()}`)
      .send({ decision: "approve", note: "" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ESTIMATE_DRAWINGS_UNRESOLVED");
    expect(estimate.status).toBe("sent_to_client");
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it("keeps legacy estimates with no drawings approvable", async () => {
    const estimate = {
      _id: "estimate-no-drawings",
      leadId: "lead-no-drawings",
      ownerId: "user-estimator-sales",
      version: 2,
      status: "sent_to_client",
      designLifecycleVersion: 0,
      designFrozenAt: null,
      assignedDesignerId: "designer-1",
      reviews: [],
      notifications: [],
      save: vi.fn(async () => undefined),
      toObject() { return { ...this, save: undefined, toObject: undefined }; }
    };
    const lead = {
      _id: "lead-no-drawings",
      clientEmail: "client@aurora.example",
      clientName: "Aurora",
      clientMobile: "9000000000",
      projectName: "Legacy project",
      location: "Bengaluru"
    };
    const designer = {
      _id: "designer-1",
      email: "designer@example.com",
      role: "designer",
      managerId: "manager-1"
    };
    const manager = {
      _id: "manager-1",
      email: "manager@example.com",
      role: "design_manager"
    };
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
    vi.spyOn(EstimateModel, "findOne").mockReturnValue(query(estimate) as never);
    vi.spyOn(EstimateModel, "findById").mockReturnValue(query(estimate) as never);
    vi.spyOn(LeadModel, "findById").mockReturnValue(query(lead) as never);
    vi.spyOn(LeadModel, "findOne").mockReturnValue(query(lead) as never);
    vi.spyOn(EstimateDesignDrawingModel, "find").mockReturnValue(query([]) as never);
    vi.spyOn(UserModel, "findById").mockImplementation((id) =>
      query(id === "designer-1" ? designer : manager) as never
    );
    vi.spyOn(ProjectModel, "create").mockResolvedValue({} as never);
    vi.spyOn(LeadModel, "updateOne").mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never);
    vi.spyOn(EstimateModel, "updateOne").mockImplementation(async () => {
      estimate.status = "client_approved";
      return { matchedCount: 1, modifiedCount: 1 } as never;
    });
    const auditCreate = vi.spyOn(AuditEventModel, "create")
      .mockImplementation(async (events) =>
        (events as Array<Record<string, any>>).map((event) => ({
          toObject: () => ({ ...event, id: event._id })
        })) as never
      );

    const response = await request(app)
      .post("/api/v1/client/estimates/estimate-no-drawings/decision")
      .set("Authorization", `Bearer ${clientToken()}`)
      .send({ decision: "approve", note: "" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("client_approved");
    expect(ProjectModel.create).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledWith(
      [expect.objectContaining({
        action: "estimate_design_final_approved",
        entityId: "estimate-no-drawings",
        newValues: expect.objectContaining({
          status: "client_approved",
          approvedDrawingCount: 0
        })
      })],
      { session }
    );
    const auditPayload = JSON.stringify(auditCreate.mock.calls[0]?.[0]);
    expect(auditPayload).not.toContain("imageBase64");
    expect(auditPayload).not.toContain("storedFileReference");
    expect(auditPayload).not.toContain("croppedFileReference");
    expect(EstimateModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "estimate-no-drawings",
        designLifecycleVersion: { $in: [0, null] },
        designFrozenAt: { $in: [null] }
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "client_approved",
          designFrozenAt: expect.any(Date)
        }),
        $inc: expect.objectContaining({ designLifecycleVersion: 1 })
      }),
      expect.any(Object)
    );
  });

  it("returns the same not-found response for a foreign locked estimate", async () => {
    const estimate = {
      _id: "estimate-foreign-locked",
      leadId: "lead-foreign",
      version: 3,
      status: "client_approved",
      designLifecycleVersion: 1,
      designFrozenAt: new Date("2026-07-30T14:00:00.000Z")
    };
    const lead = {
      _id: "lead-foreign",
      clientEmail: "someone-else@example.com"
    };
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
    vi.spyOn(EstimateModel, "findOne").mockReturnValue(query(estimate) as never);
    vi.spyOn(LeadModel, "findById").mockReturnValue(query(lead) as never);

    const response = await request(app)
      .post("/api/v1/client/estimates/estimate-foreign-locked/decision")
      .set("Authorization", `Bearer ${clientToken()}`)
      .send({ decision: "approve", note: "" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ESTIMATE_NOT_FOUND");
  });
});
