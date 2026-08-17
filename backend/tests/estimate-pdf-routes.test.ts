import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

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

function lean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function auth(id: string, role: string) {
  return `Bearer ${jwt.sign({ id, role }, SECRET, { expiresIn: 900 })}`;
}

function setup() {
  const seed = structuredClone(demoSeedData);
  const client = seed.users.find((user) => user.id === "user-client-aurora")!;
  client.email = "client@lisno.example";
  client.emailNormalized = "client@lisno.example";
  const generate = vi.fn(async () => ({
    bytes: pdfBytes,
    filename: "lisno-aurora-villa-estimate-v1.pdf"
  }));
  const app = createApp({
    repository: createMemoryRepository(seed),
    auth: { jwtSecret: SECRET, jwtExpiresInSeconds: 900 },
    estimatePdfService: { generate }
  });

  return { app, generate };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("estimate PDF download routes", () => {
  it("exports a sales-owned non-draft PDF from persisted estimate and lead data", async () => {
    const { app, generate } = setup();
    const readyEstimate = { ...estimate, status: "ready_for_client" };
    const findEstimate = vi
      .spyOn(EstimateModel, "findOne")
      .mockReturnValue(lean(readyEstimate) as never);
    const findLead = vi
      .spyOn(LeadModel, "findById")
      .mockReturnValue(lean(lead) as never);

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
    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
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
    "exports a %s client-visible PDF only when the persisted lead email matches exactly",
    async (status) => {
    const { app, generate } = setup();
    const clientEstimate = {
      ...estimate,
      _id: "estimate-client-visible",
      status
    };
    const findEstimate = vi
      .spyOn(EstimateModel, "findOne")
      .mockReturnValue(lean(clientEstimate) as never);
    const findLead = vi
      .spyOn(LeadModel, "findOne")
      .mockReturnValue(lean(lead) as never);

    const response = await request(app)
      .get("/api/v1/client/estimates/estimate-client-visible/pdf")
      .set("Authorization", auth("user-client-aurora", "client"))
      .expect(200);

    expect(findEstimate).toHaveBeenCalledWith({
      _id: "estimate-client-visible",
      status: {
        $in: ["sent_to_client", "client_changes_requested", "client_approved"]
      }
    });
    expect(findLead).toHaveBeenCalledWith({
      _id: "lead-aurora",
      clientEmail: {
        $regex: "^client@lisno\\.example$",
        $options: "i"
      }
    });
    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="lisno-aurora-villa-estimate-v1.pdf"'
    );
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      id: "estimate-client-visible",
      status,
      lead: expect.objectContaining({ clientEmail: "client@lisno.example" })
    }));
    }
  );

  it("hides draft, foreign-email, and missing client exports behind the same not-found response", async () => {
    const { app, generate } = setup();
    const findEstimate = vi.spyOn(EstimateModel, "findOne");
    const findLead = vi.spyOn(LeadModel, "findOne");
    findEstimate
      .mockReturnValueOnce(lean(null) as never)
      .mockReturnValueOnce(lean({ ...estimate, _id: "foreign-email", status: "sent_to_client" }) as never)
      .mockReturnValueOnce(lean(null) as never);
    findLead.mockReturnValueOnce(lean(null) as never);

    const draft = await request(app)
      .get("/api/v1/client/estimates/draft/pdf")
      .set("Authorization", auth("user-client-aurora", "client"))
      .expect(404);
    const foreign = await request(app)
      .get("/api/v1/client/estimates/foreign-email/pdf")
      .set("Authorization", auth("user-client-aurora", "client"))
      .expect(404);
    const missing = await request(app)
      .get("/api/v1/client/estimates/missing/pdf")
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
      .get("/api/v1/client/estimates/estimate-client-visible/pdf")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .expect(403);

    expect(findEstimate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});
