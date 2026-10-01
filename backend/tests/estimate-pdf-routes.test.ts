import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp as createApplication } from "../src/app.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import type { FileStorage } from "../src/storage/storage.js";
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";

const createApp = (dependencies: Parameters<typeof createApplication>[0]) =>
  createApplication({
    ...dependencies,
    developmentDemoAuthorization: developmentDemoAuthentication()
  });

const SECRET = "estimate-pdf-route-test-secret-at-least-32-characters";
const pdfBytes = Buffer.from("%PDF-1.7\n%%EOF");

const estimate = {
  _id: "estimate-draft",
  leadId: "lead-aurora",
  ownerId: "user-estimator-sales",
  version: 2,
  status: "draft",
  propertyType: "residential_apartment",
  subtotal: 9_500,
  gst: 1_710,
  total: 11_210,
  lineItems: [
    {
      catalogueId: "FC01",
      roomName: "Living room",
      specification: "Gypsum plain",
      unit: "sqft",
      rate: 95,
      quantity: 100,
      included: true,
      amount: 9_500
    }
  ]
};

const lead = {
  _id: "lead-aurora",
  clientName: "Aurora Homes",
  clientEmail: "client@lisno.example",
  projectName: "Aurora Villa",
  location: "Bengaluru"
};


function publishedRow(status = "sent_to_client") {
  return {
    ...estimate, _id: "estimate-client-visible", status,
    version: status === "sent_to_client" ? 2 : 3,
    clientLead: lead,
    publishedRounds: [{
      _id: "round-current", estimateId: "estimate-client-visible", leadId: lead._id,
      projectId: null, estimateVersion: 2, version: 4, sendGeneration: 2,
      recipientEmailNormalized: "client@lisno.example",
      createdAt: new Date("2026-08-24T10:00:00Z"),
      status: status === "sent_to_client" ? "pending" : status === "client_approved" ? "approved" : "changes_requested",
      decision: status === "sent_to_client" ? null : status === "client_approved" ? "approve" : "request_changes",
      estimateSnapshot: { ...estimate, clientName: lead.clientName, projectName: lead.projectName, location: lead.location }
    }]
  };
}

function lean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function auth(id: string, role: string) {
  return `Bearer ${jwt.sign({ id, role }, SECRET, { expiresIn: 900 })}`;
}

function aggregate(value: unknown) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

function setup(storage?: FileStorage) {
  const seed = structuredClone(demoSeedData);
  const client = seed.users.find((user) => user.id === "user-client-aurora")!;
  client.email = "client@lisno.example";
  client.emailNormalized = "client@lisno.example";
  const generate = vi.fn(async () => ({
    bytes: pdfBytes,
    filename: "lisno-aurora-villa-estimate-v1.pdf"
  }));
  const repository = createMemoryRepository(seed);
  const projectGrantSpies = [
    vi.spyOn(repository, "findActiveProjectAccessGrant"),
    vi.spyOn(repository, "listProjectsForUserInModule"),
    vi.spyOn(repository, "pageProjectsForUserInModule")
  ] as const;
  const app = createApp({
    repository,
    auth: { jwtSecret: SECRET, jwtExpiresInSeconds: 900 },
    estimatePdfService: { generate },
    ...(storage ? { storage } : {})
  });

  return { app, generate, projectGrantSpies };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("estimate PDF download routes", () => {
  it("keeps Super Admin owner PDF access while missing published Client snapshots fail closed", async () => {
    const { app, generate, projectGrantSpies } = setup();
    vi.spyOn(EstimateModel, "findOne").mockReturnValue(lean(estimate) as never);
    vi.spyOn(LeadModel, "findById").mockReturnValue(lean(lead) as never);
    vi.spyOn(EstimateModel, "aggregate").mockReturnValue(aggregate([{ ...publishedRow(), publishedRounds: [] }]) as never);
    const authorization = auth("user-super-admin", "super_admin");
    await request(app).get("/api/v1/estimates/estimate-draft/pdf").set("Authorization", authorization).expect(200);
    await request(app).get("/api/v1/client/estimates/estimate-client-visible/pdf?roundId=round-current").set("Authorization", authorization).expect(409);
    expect(generate).toHaveBeenCalledOnce();
    for (const spy of projectGrantSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("row 76 exports the exact sales-owned PDF without writes", async () => {
    const { app, generate } = setup();
    const readyEstimate = { ...estimate, status: "ready_for_client" };
    const findEstimate = vi
      .spyOn(EstimateModel, "findOne")
      .mockReturnValue(lean(readyEstimate) as never);
    const findLead = vi
      .spyOn(LeadModel, "findById")
      .mockReturnValue(lean(lead) as never);
    const updateEstimate = vi.spyOn(EstimateModel, "updateOne");
    const updateLead = vi.spyOn(LeadModel, "updateOne");

    const response = await request(app)
      .get("/api/v1/estimates/estimate-draft/pdf")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .send({ id: "request-body-estimate", total: 1 })
      .expect(200);

    expect(findEstimate).toHaveBeenCalledWith({
      _id: "estimate-draft",
      ownerId: "user-estimator-sales"
    });
    expect(findLead).toHaveBeenCalledWith("lead-aurora");
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="lisno-aurora-villa-estimate-v1.pdf"'
    );
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(generate).toHaveBeenCalledWith({
      id: "estimate-draft",
      version: 2,
      status: "ready_for_client",
      propertyType: "residential_apartment",
      subtotal: 9_500,
      gst: 1_710,
      total: 11_210,
      lineItems: estimate.lineItems,
      lead: {
        clientName: "Aurora Homes",
        clientEmail: "client@lisno.example",
        projectName: "Aurora Villa",
        location: "Bengaluru"
      }
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(updateEstimate).not.toHaveBeenCalled();
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("returns one not-found response for missing and foreign sales estimates", async () => {
    const { app } = setup();
    const findEstimate = vi
      .spyOn(EstimateModel, "findOne")
      .mockReturnValue(lean(null) as never);

    const missing = await request(app)
      .get("/api/v1/estimates/missing/pdf")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .expect(404);
    const foreign = await request(app)
      .get("/api/v1/estimates/foreign/pdf")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .expect(404);

    expect(missing.body).toEqual({
      error: { code: "ESTIMATE_NOT_FOUND", message: "Estimate not found." }
    });
    expect(foreign.body).toEqual(missing.body);
    expect(findEstimate).toHaveBeenNthCalledWith(1, {
      _id: "missing",
      ownerId: "user-estimator-sales"
    });
    expect(findEstimate).toHaveBeenNthCalledWith(2, {
      _id: "foreign",
      ownerId: "user-estimator-sales"
    });
  });

  it.each(["sent_to_client", "client_changes_requested", "client_approved"])(
    "requires the displayed round and rejects a different PDF for %s", async (status) => {
      const { app, generate } = setup();
      vi.spyOn(EstimateModel, "aggregate").mockReturnValue(aggregate([publishedRow(status)]) as never);
      await request(app).get("/api/v1/client/estimates/estimate-client-visible/pdf")
        .set("Authorization", auth("user-client-aurora", "client")).expect(400);
      await request(app).get("/api/v1/client/estimates/estimate-client-visible/pdf?roundId=older-round")
        .set("Authorization", auth("user-client-aurora", "client")).expect(409);
      expect(generate).not.toHaveBeenCalled();
    }
  );

  it("serves the immutable current-round Client PDF bytes and stored filename", async () => {
    const storedBytes = Buffer.from("%PDF-1.7\nimmutable-round\n%%EOF");
    const storage = {
      save: vi.fn(),
      saveGenerated: vi.fn(),
      read: vi.fn(async (reference: string) => {
        expect(reference).toBe("estimate-client-pdfs/round-current.pdf");
        return storedBytes;
      }),
      delete: vi.fn(),
      open: vi.fn()
    } as unknown as FileStorage;
    const { app, generate } = setup(storage);
    vi.spyOn(EstimateModel, "findOne").mockReturnValue(
      lean({ ...estimate, _id: "estimate-client-visible", status: "sent_to_client" }) as never
    );
    vi.spyOn(LeadModel, "findOne").mockReturnValue(lean(lead) as never);
    vi.spyOn(EstimateModel, "aggregate").mockReturnValue(
      aggregate([publishedRow()]) as never
    );
    vi.spyOn(EstimateClientReviewRoundModel, "aggregate")
      .mockReturnValueOnce(aggregate([{
        storageReference: "estimate-client-pdfs/round-current.pdf",
        filename: "lisno-estimate-sent-v3.pdf",
        mimeType: "application/pdf"
      }]) as never);

    const response = await request(app)
      .get("/api/v1/client/estimates/estimate-client-visible/pdf?roundId=round-current")
      .set("Authorization", auth("user-client-aurora", "client"))
      .expect(200);

    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="lisno-estimate-sent-v3.pdf"'
    );
    expect(response.body).toEqual(storedBytes);
    expect(storage.read).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
  });

  it("serves the immutable current-round Client PDF to Super Admin without regenerating", async () => {
    const storedBytes = Buffer.from("%PDF-1.7\nimmutable-super-admin-round\n%%EOF");
    const storage = {
      save: vi.fn(),
      saveGenerated: vi.fn(),
      read: vi.fn(async (reference: string) => {
        expect(reference).toBe("estimate-client-pdfs/round-current.pdf");
        return storedBytes;
      }),
      delete: vi.fn(),
      open: vi.fn()
    } as unknown as FileStorage;
    const { app, generate, projectGrantSpies } = setup(storage);
    vi.spyOn(EstimateModel, "findOne").mockReturnValue(
      lean({ ...estimate, _id: "estimate-client-visible", status: "sent_to_client" }) as never
    );
    vi.spyOn(LeadModel, "findOne").mockReturnValue(lean(lead) as never);
    vi.spyOn(EstimateModel, "aggregate").mockReturnValue(
      aggregate([publishedRow()]) as never
    );
    vi.spyOn(EstimateClientReviewRoundModel, "aggregate")
      .mockReturnValueOnce(aggregate([{
        storageReference: "estimate-client-pdfs/round-current.pdf",
        filename: "lisno-estimate-sent-v2.pdf",
        mimeType: "application/pdf"
      }]) as never);

    const response = await request(app)
      .get("/api/v1/client/estimates/estimate-client-visible/pdf?roundId=round-current")
      .set("Authorization", auth("user-super-admin", "super_admin"))
      .expect(200);

    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="lisno-estimate-sent-v2.pdf"'
    );
    expect(response.body).toEqual(storedBytes);
    expect(storage.read).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
    for (const spy of projectGrantSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("hides draft, foreign-email, and missing client exports behind the same not-found response", async () => {
    const { app, generate } = setup();
    vi.spyOn(EstimateModel, "aggregate").mockReturnValue(aggregate([]) as never);

    const draft = await request(app)
      .get("/api/v1/client/estimates/draft/pdf?roundId=round-current")
      .set("Authorization", auth("user-client-aurora", "client"))
      .expect(404);
    const foreign = await request(app)
      .get("/api/v1/client/estimates/foreign-email/pdf?roundId=round-current")
      .set("Authorization", auth("user-client-aurora", "client"))
      .expect(404);
    const missing = await request(app)
      .get("/api/v1/client/estimates/missing/pdf?roundId=round-current")
      .set("Authorization", auth("user-client-aurora", "client"))
      .expect(404);

    const notFound = {
      error: { code: "ESTIMATE_NOT_FOUND", message: "Estimate not found." }
    };
    expect(draft.body).toEqual(notFound);
    expect(foreign.body).toEqual(notFound);
    expect(missing.body).toEqual(notFound);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects cross-role access before either PDF route queries estimate data", async () => {
    const { app, generate } = setup();
    const findEstimate = vi.spyOn(EstimateModel, "findOne");

    await request(app)
      .get("/api/v1/estimates/estimate-draft/pdf")
      .set("Authorization", auth("user-client-aurora", "client"))
      .expect(403);
    await request(app)
      .get("/api/v1/client/estimates/estimate-client-visible/pdf?roundId=round-current")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .expect(403);

    expect(findEstimate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});
