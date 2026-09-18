import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ROLE_CODES } from "../src/domain/roles.js";
import type { ProjectVendorSuggestion } from "../src/domain/project-vendor-suggestions.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createProjectVendorSuggestionRouter } from "../src/routes/project-vendor-suggestions.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import type { ProjectVendorSuggestionService } from "../src/services/project-vendor-suggestions.service.js";
const actor: PublicUser = { id: "manager", name: "Manager", email: "manager@example.test", role: "admin" };
const project = { projectId: "project-a", projectName: "Project A", estimateId: "estimate-a", estimateVersion: 1, designPlanVersion: 2 };
const suggestion: ProjectVendorSuggestion = { id: "suggestion", projectId: project.projectId, estimateId: project.estimateId, estimateVersion: 1, designPlanVersion: 2, estimateReviewRoundId: "round-a", vendor: { id: "vendor-a", code: "VA", name: "Vendor A", status: "active" }, note: "", status: "suggested", version: 1, suggestedBy: { id: actor.id, name: actor.name }, updatedBy: { id: actor.id, name: actor.name }, createdAt: "2026-09-18T00:00:00Z", updatedAt: "2026-09-18T00:00:00Z", kpi: { status: "not_rated", score: null } };
const fields = { estimateId: "estimate-a", estimateVersion: 1, designPlanVersion: 2, vendorId: "vendor-a", idempotencyKey: "request-one" };
const base = "/api/v1/procurement/projects/project-a/vendor-suggestions";
function setup() {
  const service = {
    projects: vi.fn(async () => ({ items: [project], total: 1, limit: 20, offset: 0 })),
    list: vi.fn(async () => ({ project, items: [suggestion], total: 1, limit: 20, offset: 0, performance: { status: "not_available" as const, recommendations: [] as [] } })),
    create: vi.fn(async () => ({ suggestion, created: true })), update: vi.fn(async () => suggestion)
  } satisfies ProjectVendorSuggestionService;
  const auth = { authenticate: vi.fn(async (role: string) => ({ ...actor, role })) } as unknown as AuthService;
  const app = express(); app.use(express.json()); app.use("/api/v1", createProjectVendorSuggestionRouter(auth, service)); app.use(errorHandler);
  return { app, service };
}
describe("vendor suggestion routes", () => {
  it.each(["admin", "procurement", "super_admin"])("permits %s to read only the service-authorized project list", async (role) => {
    const { app, service } = setup();
    await request(app).get("/api/v1/procurement/suggestion-projects?q=Villa&limit=5&offset=10").set("Authorization", `Bearer ${role}`).expect(200);
    expect(service.projects).toHaveBeenCalledWith({ ...actor, role }, { q: "Villa", limit: 5, offset: 10 });
    await request(app).get(base).set("Authorization", `Bearer ${role}`).expect(200);
    expect(service.list).toHaveBeenCalledWith({ ...actor, role }, "project-a", { q: "", limit: 20, offset: 0 });
  });
  it.each(ROLE_CODES.filter((role) => !["admin", "procurement", "super_admin"].includes(role)))("denies %s suggestion reads", async (role) => {
    const { app, service } = setup();
    await request(app).get(base).set("Authorization", `Bearer ${role}`).expect(403);
    await request(app).get("/api/v1/procurement/suggestion-projects").set("Authorization", `Bearer ${role}`).expect(403);
    expect(service.list).not.toHaveBeenCalled(); expect(service.projects).not.toHaveBeenCalled();
  });
  it.each(ROLE_CODES.filter((role) => role !== "admin"))("denies %s personal suggestion writes including Super Admin", async (role) => {
    const { app, service } = setup();
    await request(app).post(base).set("Authorization", `Bearer ${role}`).send(fields).expect(403);
    await request(app).patch(`${base}/suggestion`).set("Authorization", `Bearer ${role}`).send({ expectedVersion: 1, note: "", status: "withdrawn" }).expect(403);
    expect(service.create).not.toHaveBeenCalled(); expect(service.update).not.toHaveBeenCalled();
  });
  it("creates and safely replays a request, normalizes note and requires CAS edits", async () => {
    const { app, service } = setup();
    await request(app).post(base).set("Authorization", "Bearer admin").send(fields).expect(201, { data: suggestion });
    expect(service.create).toHaveBeenCalledWith(actor, "project-a", { ...fields, note: "" });
    service.create.mockResolvedValueOnce({ suggestion, created: false });
    await request(app).post(base).set("Authorization", "Bearer admin").send(fields).expect(200);
    await request(app).patch(`${base}/suggestion`).set("Authorization", "Bearer admin").send({ expectedVersion: 1, note: "  Careful\n handling  ", status: "withdrawn" }).expect(200);
    expect(service.update).toHaveBeenCalledWith(actor, "project-a", "suggestion", { expectedVersion: 1, note: "Careful handling", status: "withdrawn" });
  });
  it.each([{ estimateId: "" }, { estimateVersion: 0 }, { designPlanVersion: 1.5 }, { vendorId: null }, { note: "x".repeat(1001) }, { idempotencyKey: "short" }, { createdById: "forged" }, { kpi: 100 }])("rejects invalid create fields %o", async (extra) => {
    const { app, service } = setup(); await request(app).post(base).set("Authorization", "Bearer admin").send({ ...fields, ...extra }).expect(400); expect(service.create).not.toHaveBeenCalled();
  });
  it.each([{ note: "", status: "withdrawn" }, { expectedVersion: 0, note: "", status: "withdrawn" }, { expectedVersion: 1, note: "", status: "approved" }, { expectedVersion: 1, note: "", status: "withdrawn", vendorId: "other" }])("rejects invalid or identity-changing update %o", async (value) => {
    const { app, service } = setup(); await request(app).patch(`${base}/suggestion`).set("Authorization", "Bearer admin").send(value).expect(400); expect(service.update).not.toHaveBeenCalled();
  });
  it.each(["limit=101", "offset=-1", "projectId=other", "q=a&q=b"])("rejects malformed query %s", async (query) => {
    const { app } = setup(); await request(app).get(`${base}?${query}`).set("Authorization", "Bearer admin").expect(400);
  });
  it("requires authentication", async () => { await request(setup().app).get(base).expect(401); });
});
