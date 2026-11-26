import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors.js";
import { createKeyCollectionRemindersRouter } from "../src/routes/key-collection-reminders.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";

function setup() {
  const service = { list: vi.fn(async () => ({ serverNow: "2026-11-26T09:00:00.000Z", urgentCount: 0, nextRedAt: null,
    items: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } })) };
  const auth = { authenticate: async (role: string) => ({ id: role, role, name: "Actor", email: "actor@example.test" } as PublicUser) };
  const app = express();
  app.use("/api/v1", createKeyCollectionRemindersRouter(auth as AuthService, service));
  app.use(errorHandler);
  return { app, service };
}

describe("Personal Designer key collection reminders route", () => {
  it("defaults to urgent reminders and forwards validated personal pagination", async () => {
    const { app, service } = setup();
    await request(app).get("/api/v1/designer/key-collection-reminders").set("Authorization", "Bearer designer").expect(200);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ id: "designer", role: "designer" }), { status: "urgent", limit: 20, offset: 0 });
    await request(app).get("/api/v1/designer/key-collection-reminders?status=pending&limit=2&offset=3").set("Authorization", "Bearer designer").expect(200);
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ role: "designer" }), { status: "pending", limit: 2, offset: 3 });
  });

  it("requires personal Designer authorization and rejects foreign filters and unbounded pagination", async () => {
    const { app, service } = setup();
    const url = "/api/v1/designer/key-collection-reminders";
    await request(app).get(url).expect(401);
    for (const role of ["super_admin", "admin", "client", "procurement", "site_manager", "design_head"])
      await request(app).get(url).set("Authorization", `Bearer ${role}`).expect(403);
    for (const query of ["designerId=someone-else", "status=all", "limit=101", "limit=0", "offset=-1", "offset=100001"])
      await request(app).get(`${url}?${query}`).set("Authorization", "Bearer designer").expect(400);
    expect(service.list).not.toHaveBeenCalled();
  });
});
