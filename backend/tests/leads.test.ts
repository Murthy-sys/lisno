import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

const LEAD_SECRET = "lead-test-secret-with-enough-entropy";
const app = createApp({ repository: createMemoryRepository(demoSeedData), auth: { jwtSecret: LEAD_SECRET, jwtExpiresInSeconds: 900 } });

async function salesToken() {
  const response = await request(app).post("/api/v1/auth/login").send({ email: "sales@lisno.example", password: "LisnoDemo2026!" });
  return response.body.data.token as string;
}

const lead = { clientName: "Ramesh Nair", clientEmail: "ramesh@example.com", clientMobile: "9876500000", projectName: "Prestige Lakeside", location: "Bengaluru", propertyType: "3BHK", budgetMin: 1000000, budgetMax: 1400000, source: "Referral", nextAction: "Call client", nextActionAt: "2026-08-01T10:00:00.000Z" };

describe("lead API", () => {
  it("creates, lists, updates and logs an owner activity", async () => {
    const token = await salesToken();
    const created = await request(app).post("/api/v1/leads").set("Authorization", `Bearer ${token}`).send(lead).expect(201);
    expect(created.body.data).toMatchObject({ ownerId: "user-estimator-sales", stage: "new_lead", clientName: "Ramesh Nair" });
    const id = created.body.data.id as string;
    await request(app).patch(`/api/v1/leads/${id}`).set("Authorization", `Bearer ${token}`).send({ stage: "negotiation" }).expect(200);
    await request(app).post(`/api/v1/leads/${id}/activities`).set("Authorization", `Bearer ${token}`).send({ type: "call", note: "Confirmed site visit", occurredAt: "2026-07-29T10:00:00.000Z" }).expect(201);
    const listed = await request(app).get("/api/v1/leads?search=nair&stage=negotiation&limit=20&offset=0").set("Authorization", `Bearer ${token}`).expect(200);
    expect(listed.body.data.items).toHaveLength(1);
    const activities = await request(app).get(`/api/v1/leads/${id}/activities`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(activities.body.data.items[0]).toMatchObject({ note: "Confirmed site visit" });
  });
});

function query<T>(value: T) {
  const result = {
    sort: vi.fn(),
    session: vi.fn(),
    lean: vi.fn(async () => value),
    then: (resolve: (value: T) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject)
  };
  result.sort.mockReturnValue(result);
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

describe("estimate final drawing approval gate", () => {
  it("rejects unresolved drawings transactionally without changing the estimate", async () => {
    const estimate = {
      _id: "estimate-gated",
      leadId: "lead-gated",
      ownerId: "user-estimator-sales",
      version: 4,
      status: "sent_to_client",
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

    const response = await request(app)
      .post("/api/v1/client/estimates/estimate-no-drawings/decision")
      .set("Authorization", `Bearer ${clientToken()}`)
      .send({ decision: "approve", note: "" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("client_approved");
    expect(ProjectModel.create).toHaveBeenCalledOnce();
  });

  it("returns the same not-found response for a foreign locked estimate", async () => {
    const estimate = {
      _id: "estimate-foreign-locked",
      leadId: "lead-foreign",
      version: 3,
      status: "client_approved"
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
