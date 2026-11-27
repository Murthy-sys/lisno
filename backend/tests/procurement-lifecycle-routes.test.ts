import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProcurementLifecycleRouter } from "../src/routes/procurement-lifecycle.js";
import { errorHandler } from "../src/middleware/errors.js";
import { lifecycleActor } from "./fixtures/procurement-lifecycle.js";
const command = vi.fn(async () => ({ recorded: true }));
const services = { payments: { command, list: vi.fn(async () => ({ items: [] })) }, readiness: { command }, lifecycle: { get: vi.fn(async () => ({ projectId: "p" })) } } as any;
const auth = { authenticate: async (role: any) => lifecycleActor(`actor-${role}`, role) } as any;
const app = express(); app.use(express.json()); app.use(createProcurementLifecycleRouter(auth, services, 1024)); app.use(errorHandler);
beforeEach(() => vi.clearAllMocks());
describe("Procurement lifecycle namespace and action authorization", () => {
  it.each([['procurement','finance_head'],['procurement','super_admin'],['finance','procurement'],['admin','finance_head']])("denies %s namespace to %s before service dispatch", async (prefix, role) => {
    const path = prefix === "procurement" ? "/procurement/projects/p/lifecycle/payments" : `/${prefix}/projects/p/procurement-lifecycle/payments`;
    expect((await request(app).post(path).set("Authorization", `Bearer ${role}`).send({ action: "record" })).status).toBe(403);
    expect(command).not.toHaveBeenCalled();
  });
  it("keeps privileged actions out of the payment-record endpoint", async () => {
    const response = await request(app).post("/finance/projects/p/procurement-lifecycle/payments").set("Authorization", "Bearer finance_head").send({ action: "reverse" });
    expect(response.status).toBe(400); expect(command).not.toHaveBeenCalled();
  });
  it("dispatches Admin reversals only through their registered override endpoint", async () => {
    const response = await request(app).post("/admin/projects/p/procurement-lifecycle/payment-reversals").set("Authorization", "Bearer super_admin").send({ action: "reverse", transactionId: "t" });
    expect(response.status).toBe(200); expect(command).toHaveBeenCalledWith(expect.objectContaining({ role: "super_admin" }), "p", { action: "reverse", transactionId: "t" });
  });
  it("does not let Admin submit Procurement readiness through a correction endpoint", async () => {
    const response = await request(app).post("/admin/projects/p/procurement-lifecycle/correction-requests").set("Authorization", "Bearer super_admin").send({ action: "submit" });
    expect(response.status).toBe(400); expect(command).not.toHaveBeenCalled();
  });
});
