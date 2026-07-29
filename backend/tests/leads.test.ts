import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

const app = createApp({ repository: createMemoryRepository(demoSeedData), auth: { jwtSecret: "lead-test-secret-with-enough-entropy", jwtExpiresInSeconds: 900 } });

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
