import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors.js";
import { createDesignerAssignmentRouter } from "../src/routes/designer-assignment.js";
import type { PublicUser, AuthService } from "../src/services/auth.service.js";
import type { DesignerAssignmentService } from "../src/services/designer-assignment.service.js";

function setup() {
  const service = { suggestions: vi.fn(async () => ({ items: [] })), listProjectRequests: vi.fn(async () => ({ items: [] })),
    createRequest: vi.fn(async () => ({ id: "request" })), cancelRequest: vi.fn(async () => ({ id: "request" })),
    listInbox: vi.fn(async () => ({ items: [] })), decideRequest: vi.fn(async () => ({ id: "request", status: "accepted" })) };
  const auth = { authenticate: async (token: string) => ({ id: token, role: token, name: "Actor", email: "actor@example.test" } as PublicUser) };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createDesignerAssignmentRouter(auth as AuthService, service as unknown as DesignerAssignmentService));
  app.use(errorHandler);
  return { app, service };
}

describe("Designer assignment request routes", () => {
  it("validates request source/idempotency and forwards the actual actor and project", async () => {
    const { app, service } = setup();
    const body = { designerId: "designer-1", expectedSourceRevision: "a".repeat(64), idempotencyKey: "create-1" };
    await request(app).post("/api/v1/admin/projects/project-1/designer-assignment-requests").set("Authorization", "Bearer super_admin").send(body).expect(200);
    expect(service.createRequest).toHaveBeenCalledWith(expect.objectContaining({ id: "super_admin" }), "project-1", body);
    await request(app).post("/api/v1/admin/projects/project-1/designer-assignment-requests").set("Authorization", "Bearer super_admin").send({ ...body, designerEmail: "private@example.test" }).expect(400);
    await request(app).post("/api/v1/admin/projects/project-1/designer-assignment-requests").set("Authorization", "Bearer super_admin").send({ ...body, expectedSourceRevision: "invalid" }).expect(400);
    expect(service.createRequest).toHaveBeenCalledTimes(1);
  });
  it("keeps personal acceptance unavailable to Super Admin and unrelated roles", async () => {
    const { app, service } = setup();
    const path = "/api/v1/designer/assignment-requests/request-1/decision";
    const body = { expectedVersion: 1, decision: "accept", idempotencyKey: "accept-1" };
    for (const role of ["super_admin", "admin", "client", "procurement"])
      await request(app).post(path).set("Authorization", `Bearer ${role}`).send(body).expect(403);
    await request(app).post(path).set("Authorization", "Bearer designer").send({ ...body, note: "not supported" }).expect(400);
    await request(app).post(path).set("Authorization", "Bearer designer").send({ ...body, expectedVersion: 0 }).expect(400);
    await request(app).post(path).set("Authorization", "Bearer designer").send(body).expect(200);
    expect(service.decideRequest).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ role: "designer" }), "request-1", body);
  });
  it("bounds pagination and restricts own inbox reads", async () => {
    const { app, service } = setup();
    await request(app).get("/api/v1/designer/assignment-requests?limit=2&offset=3&status=declined").set("Authorization", "Bearer designer").expect(200);
    expect(service.listInbox).toHaveBeenCalledWith(expect.objectContaining({ role: "designer" }), { limit: 2, offset: 3, status: "declined" });
    await request(app).get("/api/v1/designer/assignment-requests?designerId=someone-else").set("Authorization", "Bearer designer").expect(400);
    await request(app).get("/api/v1/admin/projects/project-1/designer-suggestions?limit=101").set("Authorization", "Bearer super_admin").expect(400);
    await request(app).get("/api/v1/designer/assignment-requests").set("Authorization", "Bearer super_admin").expect(403);
    await request(app).get("/api/v1/designer/assignment-requests").expect(401);
  });
});
