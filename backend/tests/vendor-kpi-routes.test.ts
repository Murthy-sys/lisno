import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { ROLE_CODES } from "../src/domain/roles.js";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { createVendorKpiRouter } from "../src/routes/vendor-kpi.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import type { VendorKpiService } from "../src/services/vendor-kpi.service.js";

const actor: PublicUser = { id: "synthetic-user", name: "Synthetic user", email: "user@example.invalid", role: "procurement" };
const detail = { vendor: { id: "vendor-a", code: "VA", name: "Synthetic vendor", status: "active" as const, vendorType: "execution" as const,
  workProfile: "Synthetic work", mainBasketNames: [], subBasketNames: [], emailAvailable: true },
  rubricVersion: 1, selfAssessment: null, procurementAssessment: null, officialScoreBps: null, request: null, requestEligibility: "ready" as const };
const publicInspection = { vendor: { name: "Synthetic vendor", code: "VA", vendorType: "execution" as const, workProfile: "Synthetic work", mainBasketNames: [], subBasketNames: [] },
  rubricVersion: 1, expiresAt: "2026-09-29T00:00:00.000Z" };
const scores = [
  { key: "timeline", score: 90 }, { key: "quality", score: 95 }, { key: "budget", score: 85 }, { key: "site_discipline", score: 90 }
];
const saveBody = { rubricVersion: 1, expectedRevision: null, idempotencyKey: "staff-save-001", scores };
const requestBody = { idempotencyKey: "request-001", expectedRequestVersion: null };
const submitBody = { token: "synthetic-token", rubricVersion: 1, idempotencyKey: "submit-001", scores };
const staffPath = "/api/v1/procurement/vendor-kpis/vendor-a";

function harness() {
  const service = {
    read: vi.fn(async () => detail), save: vi.fn(async () => detail), request: vi.fn(async () => detail),
    inspect: vi.fn(async () => publicInspection), submit: vi.fn(async () => ({ submittedAt: "2026-09-28T00:00:00.000Z", averageScoreBps: 9000 }))
  } satisfies VendorKpiService;
  const auth = { authenticate: vi.fn(async (role: string) => ({ ...actor, role })) } as unknown as AuthService;
  const publicHeaders: Array<{ authorization: string | undefined; cookie: string | undefined }> = [];
  const publicLimit: RequestHandler = (request, _response, next) => { publicHeaders.push({ authorization: request.headers.authorization, cookie: request.headers.cookie }); next(); };
  const deliveryLimit = vi.fn(((_request, _response, next) => next()) as RequestHandler);
  const app = express(); app.use(express.json()); app.use("/api/v1", createVendorKpiRouter(auth, service, publicLimit, deliveryLimit)); app.use(errorHandler);
  return { app, auth, service, publicHeaders, deliveryLimit };
}

describe("Vendor KPI HTTP boundary", () => {
  it.each(["procurement", "super_admin"] as const)("allows %s to read, rate, and request with separate operations", async role => {
    const { app, service, deliveryLimit } = harness();
    const authorization = `Bearer ${role}`;
    const read = await request(app).get(staffPath).set("Authorization", authorization).expect(200);
    expect(read.body).toEqual({ data: detail });
    expect(read.headers["cache-control"]).toBe("private, no-store");
    await request(app).put(`${staffPath}/procurement`).set("Authorization", authorization).send(saveBody).expect(200);
    await request(app).post(`${staffPath}/requests`).set("Authorization", authorization).send(requestBody).expect(200);
    expect(service.read).toHaveBeenCalledWith({ ...actor, role }, "vendor-a");
    expect(service.save).toHaveBeenCalledWith({ ...actor, role }, "vendor-a", saveBody);
    expect(service.request).toHaveBeenCalledWith({ ...actor, role }, "vendor-a", requestBody);
    expect(deliveryLimit).toHaveBeenCalledTimes(1);
  });
  it.each(ROLE_CODES.filter(role => !["procurement", "super_admin"].includes(role)))("denies %s all staff KPI operations before service access", async role => {
    const { app, service, deliveryLimit } = harness();
    const authorization = `Bearer ${role}`;
    await request(app).get(staffPath).set("Authorization", authorization).expect(403);
    await request(app).put(`${staffPath}/procurement`).set("Authorization", authorization).send(saveBody).expect(403);
    await request(app).post(`${staffPath}/requests`).set("Authorization", authorization).send(requestBody).expect(403);
    expect(service.read).not.toHaveBeenCalled(); expect(service.save).not.toHaveBeenCalled(); expect(service.request).not.toHaveBeenCalled();
    expect(deliveryLimit).not.toHaveBeenCalled();
  });
  it("requires staff authentication while public inspect and submit use only their body token", async () => {
    const { app, auth, service, publicHeaders } = harness();
    await request(app).get(staffPath).expect(401);
    await request(app).put(`${staffPath}/procurement`).send(saveBody).expect(401);
    await request(app).post(`${staffPath}/requests`).send(requestBody).expect(401);
    const inspection = await request(app).post("/api/v1/vendor-kpi/inspect").set("Authorization", "Bearer forged").set("Cookie", "session=forged").send({ token: "synthetic-token" }).expect(200);
    expect(inspection.body).toEqual({ data: publicInspection });
    expect(inspection.headers["cache-control"]).toBe("no-store");
    expect(inspection.headers["referrer-policy"]).toBe("no-referrer");
    expect(inspection.headers["x-robots-tag"]).toBe("noindex");
    const submission = await request(app).post("/api/v1/vendor-kpi/submit").set("Authorization", "Bearer forged").send(submitBody).expect(200);
    expect(submission.body).toEqual({ data: { submittedAt: "2026-09-28T00:00:00.000Z", averageScoreBps: 9000 } });
    expect(service.inspect).toHaveBeenCalledWith("synthetic-token");
    expect(service.submit).toHaveBeenCalledWith(submitBody);
    expect(publicHeaders).toEqual([{ authorization: undefined, cookie: undefined }, { authorization: undefined, cookie: undefined }]);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });
  it.each([
    { route: "save", body: { ...saveBody, scores: [{ key: "timeline", score: 90 }] } },
    { route: "save", body: { ...saveBody, expectedRevision: -1 } },
    { route: "save", body: { ...saveBody, actorId: "forged" } },
    { route: "request", body: { ...requestBody, expectedRequestVersion: 0 } },
    { route: "request", body: { ...requestBody, recipientEmail: "forged@example.invalid" } },
    { route: "submit", body: { ...submitBody, scores: scores.map(score => ({ ...score, score: 101 })) } },
    { route: "submit", body: { ...submitBody, procurementScore: 100 } },
    { route: "inspect", body: { token: "synthetic-token", vendorId: "other" } }
  ])("rejects malformed $route input without calling the service", async ({ route, body }) => {
    const { app, service } = harness();
    const target = route === "save" ? request(app).put(`${staffPath}/procurement`).set("Authorization", "Bearer procurement")
      : route === "request" ? request(app).post(`${staffPath}/requests`).set("Authorization", "Bearer procurement")
      : route === "submit" ? request(app).post("/api/v1/vendor-kpi/submit") : request(app).post("/api/v1/vendor-kpi/inspect");
    const response = await target.send(body).expect(400);
    if (route === "submit" || route === "inspect") expect(response.headers["cache-control"]).toBe("no-store");
    expect(service.read).not.toHaveBeenCalled(); expect(service.save).not.toHaveBeenCalled(); expect(service.request).not.toHaveBeenCalled();
    expect(service.submit).not.toHaveBeenCalled(); expect(service.inspect).not.toHaveBeenCalled();
  });
  it("preserves one neutral unavailable response for invalid public tokens", async () => {
    const { app, service } = harness();
    service.inspect.mockRejectedValueOnce(new ApiError(410, "VENDOR_KPI_LINK_UNAVAILABLE", "This assessment link is unavailable."));
    const response = await request(app).post("/api/v1/vendor-kpi/inspect").send({ token: "expired" }).expect(410);
    expect(response.body.error.code).toBe("VENDOR_KPI_LINK_UNAVAILABLE");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
