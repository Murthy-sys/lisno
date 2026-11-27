import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors.js";
import { createProjectManagerRouter } from "../src/routes/project-manager.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";

function setup() {
  const service = {
    notifications: vi.fn(async () => ({ items: [], total: 0, unreadTotal: 0 })),
    readNotification: vi.fn(async () => ({ read: true })),
    portfolio: vi.fn(), alerts: vi.fn(), overview: vi.fn(), site: vi.fn(), performance: vi.fn(), leaderboard: vi.fn(), bonus: vi.fn()
  };
  const auth = { authenticate: vi.fn(async (role: PublicUser["role"]) => ({ id: `user-${role}`, role, name: role, email: `${role}@example.test` })) } as unknown as AuthService;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProjectManagerRouter(auth, service as never, {} as never, 100_000, {} as never));
  app.use(errorHandler);
  return { app, service };
}
const base = "/api/v1/project-manager/notifications";

describe("Project notification HTTP authorization", () => {
  it.each(["super_admin", "site_manager"] as const)("allows %s to list notifications and mark their own read state", async role => {
    const { app, service } = setup();
    const actor = { id: `user-${role}`, role, name: role, email: `${role}@example.test` };
    const listed = await request(app).get(`${base}?limit=1&offset=2`).auth(role, { type: "bearer" }).expect(200);
    expect(listed.headers["cache-control"]).toBe("private, no-store");
    expect(listed.body).toEqual({ data: { items: [], total: 0, unreadTotal: 0 } });
    expect(service.notifications).toHaveBeenCalledWith(actor, { limit: 1, offset: 2 });
    const marked = await request(app).post(`${base}/event-a/read`).auth(role, { type: "bearer" }).expect(200);
    expect(marked.headers["cache-control"]).toBe("private, no-store");
    expect(marked.body).toEqual({ data: { read: true } });
    expect(service.readNotification).toHaveBeenCalledWith(actor, "event-a");
  });

  it("requires authentication and does not grant ordinary Admin notification access", async () => {
    const { app, service } = setup();
    await request(app).get(base).expect(401);
    await request(app).post(`${base}/event-a/read`).expect(401);
    await request(app).get(base).auth("admin", { type: "bearer" }).expect(403);
    await request(app).post(`${base}/event-a/read`).auth("admin", { type: "bearer" }).expect(403);
    expect(service.notifications).not.toHaveBeenCalled();
    expect(service.readNotification).not.toHaveBeenCalled();
  });

  it("keeps all other personal PM routes in this router unavailable to Super Admin", async () => {
    const { app, service } = setup();
    for (const path of ["/project-manager/projects", "/project-manager/alerts", "/project-manager/performance", "/project-manager/leaderboard", "/project-manager/bonus", "/projects/project-a/pm/overview", "/projects/project-a/pm/site"]) {
      await request(app).get(`/api/v1${path}`).auth("super_admin", { type: "bearer" }).expect(403);
    }
    for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
  });

  it.each(["limit=101", "offset=-1", "recipientId=other-user", "readBy=other-user"])("rejects unsafe notification queries: %s", async query => {
    const { app, service } = setup();
    await request(app).get(`${base}?${query}`).auth("super_admin", { type: "bearer" }).expect(400);
    expect(service.notifications).not.toHaveBeenCalled();
  });
});
