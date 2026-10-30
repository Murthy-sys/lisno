import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ROLE_CODES } from "../src/domain/roles.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createProjectManagerEstimatesRouter } from "../src/routes/project-manager-estimates.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";

const actor: PublicUser = { id: "pm-a", name: "PM A", email: "pm-a@example.test", role: "site_manager" };
const source = { estimateId: "estimate-a", estimateVersion: 2, estimateReviewRoundId: "round-a", phase: "post",
  designPlanVersion: 0, sourceSnapshotId: "round-a", sourceDigest: "a".repeat(64) };
const create = { expectedSource: source, mainLineId: "main-line-a", vendorId: "vendor-a", note: "A suitable team", idempotencyKey: "create-suggestion-a" };
const update = { expectedSource: source, expectedVersion: 1, idempotencyKey: "update-suggestion-a", note: "Revised note", status: "withdrawn" };
const base = "/api/v1/projects/project-a/pm";
const basket = "/api/v1/procurement/projects/project-a/baskets/basket-a/vendor-suggestions";
function setup() {
  const reads = { estimate: vi.fn(async () => ({ availability: "available" })), candidates: vi.fn(async () => ({ items: [] })), suggestions: vi.fn(async () => ({ items: [] })) };
  const commands = { create: vi.fn(async () => ({ id: "suggestion-a", version: 1, status: "suggested" as const })), update: vi.fn(async () => ({ id: "suggestion-a", version: 2, status: "withdrawn" as const })) };
  const procurement = { list: vi.fn(async () => ({ items: [] })) };
  const auth = { authenticate: vi.fn(async (role: string) => ({ ...actor, role })) } as unknown as AuthService;
  const app = express(); app.use(express.json());
  app.use("/api/v1", createProjectManagerEstimatesRouter(auth, reads as never, commands, procurement as never)); app.use(errorHandler);
  return { app, reads, commands, procurement };
}
describe("assigned PM estimate and Main Line recommendation route boundary", () => {
  it("passes exact source, project and normalized commands to services without exposing send operations", async () => {
    const { app, reads, commands } = setup();
    const response = await request(app).get(`${base}/estimate`).set("Authorization", "Bearer site_manager").expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(reads.estimate).toHaveBeenCalledWith(actor, "project-a");
    await request(app).get(`${base}/vendor-suggestion-candidates`).query({ expectedSource: JSON.stringify(source), mainLineId: "main-line-a", limit: 5, offset: 10 }).set("Authorization", "Bearer site_manager").expect(200);
    expect(reads.candidates).toHaveBeenCalledWith(actor, "project-a", { expectedSource: source, mainLineId: "main-line-a", limit: 5, offset: 10 });
    await request(app).post(`${base}/vendor-suggestions`).send({ ...create, note: "  A suitable\n team  " }).set("Authorization", "Bearer site_manager").expect(201);
    expect(commands.create).toHaveBeenCalledWith(actor, "project-a", create);
    await request(app).patch(`${base}/vendor-suggestions/suggestion-a`).send(update).set("Authorization", "Bearer site_manager").expect(200);
    expect(commands.update).toHaveBeenCalledWith(actor, "project-a", "suggestion-a", update);
    await request(app).get(`${base}/vendor-suggestions?source=history&mainLineId=main-line-a`).set("Authorization", "Bearer site_manager").expect(200);
    expect(reads.suggestions).toHaveBeenCalledWith(actor, "project-a", { source: "history", mainLineId: "main-line-a", limit: 20, offset: 0 });
  });
  it.each(ROLE_CODES.filter(role => role !== "site_manager"))("denies %s the personal PM surface", async role => {
    const { app, reads, commands } = setup();
    await request(app).get(`${base}/estimate`).set("Authorization", `Bearer ${role}`).expect(403);
    await request(app).get(`${base}/vendor-suggestions`).set("Authorization", `Bearer ${role}`).expect(403);
    await request(app).get(`${base}/vendor-suggestion-candidates`).set("Authorization", `Bearer ${role}`).expect(403);
    await request(app).post(`${base}/vendor-suggestions`).send(create).set("Authorization", `Bearer ${role}`).expect(403);
    await request(app).patch(`${base}/vendor-suggestions/suggestion-a`).send(update).set("Authorization", `Bearer ${role}`).expect(403);
    expect(reads.estimate).not.toHaveBeenCalled(); expect(commands.create).not.toHaveBeenCalled(); expect(commands.update).not.toHaveBeenCalled();
  });
  it("keeps the basket recommendation route in existing Procurement authority", async () => {
    const { app, procurement } = setup();
    await request(app).get(basket).set("Authorization", "Bearer procurement").expect(200);
    expect(procurement.list).toHaveBeenCalledWith({ ...actor, role: "procurement" }, "project-a", "basket-a", { source: "current", limit: 20, offset: 0 });
    for (const role of ["site_manager", "admin", "super_admin", "client", "vendor"]) {
      await request(app).get(basket).set("Authorization", `Bearer ${role}`).expect(403);
    }
  });
  it.each([{ expectedSource: { ...source, estimateReviewRoundId: null } }, { expectedSource: { ...source, phase: "legacy", designPlanVersion: 0 } },
    { expectedSource: { ...source, sourceDigest: "malformed" } }, { mainLineId: "" }, { mainBasketId: "forged" }, { createdById: "forged" },
    { note: "x".repeat(1001) }, { idempotencyKey: "short" }, { sourceLineItemKeys: ["forged"] }])("rejects forged/invalid create shape %o", async extra => {
    const { app, commands } = setup();
    await request(app).post(`${base}/vendor-suggestions`).send({ ...create, ...extra }).set("Authorization", "Bearer site_manager").expect(400);
    expect(commands.create).not.toHaveBeenCalled();
  });
  it.each([{ expectedVersion: 0 }, { mainLineId: "different" }, { vendorId: "different" }, { status: "approved" }, { idempotencyKey: "short" }])("rejects invalid or identity-changing update %o", async extra => {
    const { app, commands } = setup();
    await request(app).patch(`${base}/vendor-suggestions/suggestion-a`).send({ ...update, ...extra }).set("Authorization", "Bearer site_manager").expect(400);
    expect(commands.update).not.toHaveBeenCalled();
  });
  it.each(["limit=51", "offset=-1", "source=draft", "projectId=another", "mainLineId=a&mainLineId=b"])("rejects unbounded/forged query %s", async query => {
    await request(setup().app).get(`${base}/vendor-suggestions?${query}`).set("Authorization", "Bearer site_manager").expect(400);
  });
  it("requires valid source for lookup and authentication for all operations", async () => {
    const { app, reads } = setup();
    for (const expectedSource of ["invalid-json", JSON.stringify({ ...source, phase: "draft" }), "x".repeat(2501)]) {
      await request(app).get(`${base}/vendor-suggestion-candidates`).query({ expectedSource, mainLineId: "main-line-a" }).set("Authorization", "Bearer site_manager").expect(400);
    }
    expect(reads.candidates).not.toHaveBeenCalled();
    await request(app).get(`${base}/estimate`).expect(401);
    await request(app).get(`${base}/vendor-suggestions`).expect(401);
    await request(app).post(`${base}/vendor-suggestions`).send(create).expect(401);
    await request(app).get(basket).expect(401);
  });
});
