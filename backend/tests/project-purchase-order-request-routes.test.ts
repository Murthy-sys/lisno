import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors.js";
import { createProjectPurchaseOrderPreparationRouter } from "../src/routes/project-purchase-order-preparation.js";
import { createProjectPurchaseOrderRequestRouter } from "../src/routes/project-purchase-order-requests.js";
import type { AuthService } from "../src/services/auth.service.js";
import type { ProjectPurchaseOrderPreparationService } from "../src/services/project-purchase-order-preparation.service.js";
import type { ProjectPurchaseOrderRequestService } from "../src/services/project-purchase-order-request.service.js";

function setup() {
  const auth = { authenticate: vi.fn(async (role: string) => ({ id: role, role })) } as unknown as AuthService;
  const preparation = { get: vi.fn(async () => ({ projectId: "project-a", sections: [], netPaise: 0 })) };
  const orders = {
    quote: vi.fn(async () => ({ projectId: "project-a", totals: { netPaise: 100, gstPaise: 18, totalPaise: 118 } })),
    list: vi.fn(async () => ({ items: [], total: 0, limit: 50, offset: 0 })),
    get: vi.fn(async () => ({ id: "request-a", projectId: "project-a" })),
    pending: vi.fn(async () => ({ items: [], total: 0, limit: 50, offset: 0 })),
    submit: vi.fn(async () => ({ id: "request-a", projectId: "project-a" })),
    decide: vi.fn(async () => ({ id: "request-a", projectId: "project-a" }))
  };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProjectPurchaseOrderPreparationRouter(auth, preparation as unknown as ProjectPurchaseOrderPreparationService));
  app.use("/api/v1", createProjectPurchaseOrderRequestRouter(auth, orders as unknown as ProjectPurchaseOrderRequestService));
  app.use(errorHandler);
  return { app, preparation, orders };
}

const buyerBase = "/api/v1/procurement/projects/project-a";
const adminBase = "/api/v1/admin/purchase-order-requests";

describe("project purchase order request authorization and routing", () => {
  it("limits commercial preparation and request history to Procurement and Super Admin", async () => {
    const { app, preparation, orders } = setup();
    for (const role of ["client", "vendor", "site_manager", "estimator_sales", "admin"]) {
      await request(app).get(`${buyerBase}/purchase-order-preparation`).set("Authorization", `Bearer ${role}`).expect(403);
      await request(app).get(`${buyerBase}/purchase-order-requests`).set("Authorization", `Bearer ${role}`).expect(403);
      await request(app).get(`${buyerBase}/purchase-order-requests/request-a`).set("Authorization", `Bearer ${role}`).expect(403);
    }
    expect(preparation.get).not.toHaveBeenCalled();
    expect(orders.list).not.toHaveBeenCalled();
    expect(orders.get).not.toHaveBeenCalled();
    for (const role of ["procurement", "super_admin"]) {
      await request(app).get(`${buyerBase}/purchase-order-preparation`).set("Authorization", `Bearer ${role}`).expect(200);
      await request(app).get(`${buyerBase}/purchase-order-requests`).set("Authorization", `Bearer ${role}`).expect(200);
    }
    expect(preparation.get).toHaveBeenCalledTimes(2);
    expect(orders.list).toHaveBeenCalledTimes(2);
  });

  it("lets only Super Admin see the pending queue and decide, and only Procurement submit", async () => {
    const { app, orders } = setup();
    const validSubmit = {
      expectedPreparationDigest: "a".repeat(64), idempotencyKey: "submit-key-a",
      lines: [{ procurementItemId: "item-a", expectedVersion: 1, gstBasisPoints: 1800,
        scopeType: "supply", description: "Plywood", targetDate: "2026-10-10", deliveryLocation: "Site" }],
      vendorTerms: [{ vendorId: "vendor-a", terms: "After delivery" }]
    };
    const validDecision = { expectedVersion: 1, submittedRevisionId: "revision-a", idempotencyKey: "decision-key-a",
      decision: "approve", reason: null, budgetOverrideReason: null };
    const { idempotencyKey: _key, ...validQuote } = validSubmit;
    for (const role of ["client", "vendor", "site_manager", "procurement", "admin"]) {
      await request(app).get(`${adminBase}/pending`).set("Authorization", `Bearer ${role}`).expect(403);
      await request(app).post(`${adminBase}/request-a/decision`).set("Authorization", `Bearer ${role}`).send(validDecision).expect(403);
    }
    await request(app).post(`${buyerBase}/purchase-order-requests`).set("Authorization", "Bearer super_admin").send(validSubmit).expect(403);
    await request(app).post(`${buyerBase}/purchase-order-requests/quote`).set("Authorization", "Bearer super_admin").send(validQuote).expect(403);
    expect(orders.pending).not.toHaveBeenCalled();
    expect(orders.decide).not.toHaveBeenCalled();
    expect(orders.submit).not.toHaveBeenCalled();
    expect(orders.quote).not.toHaveBeenCalled();
    await request(app).post(`${buyerBase}/purchase-order-requests/quote`).set("Authorization", "Bearer procurement").send(validQuote).expect(200);
    await request(app).post(`${buyerBase}/purchase-order-requests`).set("Authorization", "Bearer procurement").send(validSubmit).expect(201);
    await request(app).get(`${adminBase}/pending`).set("Authorization", "Bearer super_admin").expect(200);
    await request(app).post(`${adminBase}/request-a/decision`).set("Authorization", "Bearer super_admin").send(validDecision).expect(200);
    expect(orders.submit).toHaveBeenCalledTimes(1);
    expect(orders.quote).toHaveBeenCalledTimes(1);
    expect(orders.pending).toHaveBeenCalledTimes(1);
    expect(orders.decide).toHaveBeenCalledTimes(1);
  });
});
