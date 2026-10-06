import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors.js";
import { createProjectPurchaseOrderModeDecisionRouter } from "../src/routes/project-purchase-order-mode-decisions.js";
import type { AuthService } from "../src/services/auth.service.js";
import type { ProjectPurchaseOrderModeDecisionService } from "../src/services/project-purchase-order-mode.service.js";

function setup() {
  const auth = { authenticate: vi.fn(async (role: string) => ({ id: role, role })) } as unknown as AuthService;
  const service = {
    preview: vi.fn(async () => ({ projectId: "project-a", estimateSource: { estimateId: "estimate-a",
      estimateVersion: 1, estimateReviewRoundId: "round-a" }, sourceLineItemKey: "line-a",
      decisionVersion: 0, revision: null, uom: null, preview: null, scopes: [], issues: [] })),
    save: vi.fn()
  };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProjectPurchaseOrderModeDecisionRouter(auth,
    service as unknown as ProjectPurchaseOrderModeDecisionService));
  app.use(errorHandler);
  return { app, service };
}

const path = "/api/v1/procurement/projects/project-a/purchase-order-mode-previews";
const body = { estimateSource: { estimateId: "estimate-a", estimateVersion: 1,
  estimateReviewRoundId: "round-a" }, sourceLineItemKey: "line-a", expectedVersion: 0,
  mode: "pmc", quantity: "2.5", discountBps: 0, markupBasis: "starting" };

describe("procurement mode preview HTTP boundary", () => {
  it("authorizes Procurement, rejects extra fields, and only invokes the read-only preview", async () => {
    const { app, service } = setup();
    for (const role of ["client", "vendor", "site_manager", "super_admin"]) {
      await request(app).post(path).set("Authorization", `Bearer ${role}`).send(body).expect(403);
    }
    expect(service.preview).not.toHaveBeenCalled();
    await request(app).post(path).set("Authorization", "Bearer procurement")
      .send({ ...body, idempotencyKey: "write-only-field" }).expect(400);
    expect(service.preview).not.toHaveBeenCalled();
    const response = await request(app).post(path).set("Authorization", "Bearer procurement")
      .send(body).expect(200);
    expect(response.body.data).toMatchObject({ projectId: "project-a", sourceLineItemKey: "line-a",
      decisionVersion: 0, preview: null, scopes: [], issues: [] });
    expect(service.preview).toHaveBeenCalledTimes(1);
    expect(service.preview).toHaveBeenCalledWith(expect.objectContaining({ role: "procurement" }), "project-a", body);
    await request(app).post("/api/v1/procurement/projects/project-a/purchase-order-mode-decisions")
      .set("Authorization", "Bearer procurement").send({ sourceLineItemKey: "line-a", expectedVersion: 0,
        idempotencyKey: "decision-key-a", mode: "pmc", quantity: "2.5", discountBps: 0,
        markupBasis: "starting", exceptionReason: null }).expect(400);
    expect(service.save).not.toHaveBeenCalled();
  });

  it("accepts only a shaped digest guard for recovery previews and explicit acknowledged decisions", async () => {
    const { app, service } = setup();
    const recoveredPreview = { ...body, expectedObservedDigest: "b".repeat(64) };
    await request(app).post(path).set("Authorization", "Bearer procurement")
      .send({ ...recoveredPreview, expectedObservedDigest: "invalid" }).expect(400);
    await request(app).post(path).set("Authorization", "Bearer procurement")
      .send(recoveredPreview).expect(200);
    expect(service.preview).toHaveBeenCalledWith(expect.objectContaining({ role: "procurement" }), "project-a", recoveredPreview);
    const decision = { sourceLineItemKey: "line-a", expectedVersion: 0,
      expectedEstimateSource: body.estimateSource, expectedRevisionDigest: "a".repeat(64),
      idempotencyKey: "decision-key-recovery", mode: "pmc", quantity: "2.5", discountBps: 0,
      markupBasis: "starting", exceptionReason: null,
      recovery: { expectedObservedDigest: "b".repeat(64), reason: "Reviewed the current saved rate.", acknowledge: true } };
    const decisionPath = "/api/v1/procurement/projects/project-a/purchase-order-mode-decisions";
    await request(app).post(decisionPath).set("Authorization", "Bearer procurement")
      .send({ ...decision, recovery: { ...decision.recovery, acknowledge: false } }).expect(400);
    expect(service.save).not.toHaveBeenCalled();
    await request(app).post(decisionPath).set("Authorization", "Bearer procurement")
      .send(decision).expect(201);
    expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ role: "procurement" }), "project-a", decision);
  });
});
