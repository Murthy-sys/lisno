import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors.js";
import { createProcurementBasketBaseRateRouter } from "../src/routes/procurement-basket-base-rate.js";
import type { AuthService } from "../src/services/auth.service.js";
import type { createProcurementBasketBaseRateService } from "../src/services/procurement-basket-base-rate.service.js";

const path = "/api/v1/procurement/projects/project-a/baskets/basket-a/base-rate";
const valid = { sourceLineItemKey: "line-a", baseRatePaise: 8_000, expectedVersion: 0,
  expectedEstimateSource: { estimateId: "estimate-a", estimateVersion: 1,
    estimateReviewRoundId: "round-a" }, expectedPreparationDigest: "a".repeat(64),
  idempotencyKey: "project-price-001" };

function setup() {
  const auth = { authenticate: vi.fn(async (role: string) => ({ id: role, role })) } as unknown as AuthService;
  const service = { save: vi.fn(async () => ({ projectId: "project-a", mainBasketId: "basket-a",
    estimateSource: valid.expectedEstimateSource, sourceLineItemKey: "line-a",
    projectRate: { version: 1, overridePaise: 8_000 } })) };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProcurementBasketBaseRateRouter(auth,
    service as unknown as ReturnType<typeof createProcurementBasketBaseRateService>));
  app.use(errorHandler);
  return { app, service };
}

describe("project Main Basket Base amount HTTP boundary", () => {
  it("allows Procurement and rejects unauthorized, malformed and extra fields", async () => {
    const { app, service } = setup();
    for (const role of ["client", "vendor", "designer", "super_admin"]) {
      await request(app).put(path).set("Authorization", `Bearer ${role}`).send(valid).expect(403);
    }
    expect(service.save).not.toHaveBeenCalled();
    for (const invalid of [
      { ...valid, baseRatePaise: -1 },
      { ...valid, baseRatePaise: 8_000.5 },
      { ...valid, baseRatePaise: Number.MAX_SAFE_INTEGER },
      { ...valid, unexpected: true },
      { ...valid, expectedPreparationDigest: "stale" }
    ]) {
      await request(app).put(path).set("Authorization", "Bearer procurement").send(invalid).expect(400);
    }
    expect(service.save).not.toHaveBeenCalled();
    const response = await request(app).put(path).set("Authorization", "Bearer procurement")
      .send(valid).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.data.projectRate).toEqual({ version: 1, overridePaise: 8_000 });
    expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ role: "procurement" }),
      "project-a", "basket-a", valid);
  });
});
