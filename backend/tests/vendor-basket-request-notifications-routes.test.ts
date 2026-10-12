import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { createVendorBasketRequestNotificationsRouter } from "../src/routes/vendor-basket-request-notifications.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";

const base = "/api/v1/admin/ai-estimator-knowledge/basket-request-notifications";
const ADMIN: PublicUser = { id: "notification-admin", role: "super_admin", name: "Admin Fixture", email: "admin@basket-alert.invalid" };
const PROCUREMENT: PublicUser = { id: "notification-procurement", role: "procurement", name: "Procurement Fixture", email: "procurement@basket-alert.invalid" };
const notification = { id: "notification-one", type: "basket_request.submitted" as const, requestId: "request-beyond-page-one", proposalId: "proposal-one",
  target: { kind: "new_sub_basket" as const, basketId: "parent-two" }, targetParentName: "Parent Two", proposedName: "Finishes", vendorName: "Fixture Vendor",
  requester: { id: PROCUREMENT.id, name: PROCUREMENT.name }, status: "pending" as const, createdAt: "2026-10-12T09:00:00.000Z", readAt: null };

function fixture() {
  const list = vi.fn(async () => ({ items: [notification], unreadCount: 23, pagination: { limit: 20, offset: 0, total: 23, hasMore: true } }));
  const read = vi.fn(async () => ({ ...notification, readAt: "2026-10-12T09:01:00.000Z" }));
  const auth = { authenticate: async (token: string) => token === "admin" ? ADMIN : PROCUREMENT } as AuthService;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createVendorBasketRequestNotificationsRouter(auth, { list, read }));
  app.use(errorHandler);
  return { app, list, read };
}

describe("basket request notification routes", () => {
  it("requires authentication and Configuration read permission independently of chat", async () => {
    const f = fixture();
    expect((await request(f.app).get(base)).status).toBe(401);
    expect((await request(f.app).get(base).auth("procurement", { type: "bearer" })).status).toBe(403);
    expect((await request(f.app).put(`${base}/notification-one/read`).auth("procurement", { type: "bearer" })).status).toBe(403);
    expect(f.list).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });

  it("uses the registered review operation, bounded defaults and private no-store envelope", async () => {
    const f = fixture();
    const response = await request(f.app).get(base).auth("admin", { type: "bearer" });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.data).toMatchObject({ items: [notification], unreadCount: 23 });
    expect(f.list).toHaveBeenCalledWith(ADMIN, { limit: 20, offset: 0 });
    await request(f.app).get(`${base}?limit=7&offset=21`).auth("admin", { type: "bearer" }).expect(200);
    expect(f.list).toHaveBeenLastCalledWith(ADMIN, { limit: 7, offset: 21 });
  });

  it.each(["recipientId=other", "status=pending", "limit=101", "limit=0", "offset=-1", "offset=100001", "limit=1.5"])("rejects unsafe pagination or filters: %s", async query => {
    const f = fixture();
    const response = await request(f.app).get(`${base}?${query}`).auth("admin", { type: "bearer" });
    expect(response.status).toBe(400);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(f.list).not.toHaveBeenCalled();
  });

  it("marks only the requested notification without accepting caller-selected ownership", async () => {
    const f = fixture();
    const response = await request(f.app).put(`${base}/notification-one/read`).auth("admin", { type: "bearer" });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.data).toMatchObject({ requestId: "request-beyond-page-one", readAt: "2026-10-12T09:01:00.000Z", status: "pending" });
    expect(f.read).toHaveBeenCalledWith(ADMIN, "notification-one");
    await request(f.app).put(`${base}/notification-one/read`).auth("admin", { type: "bearer" }).send({}).expect(200);
    await request(f.app).put(`${base}/notification-one/read`).auth("admin", { type: "bearer" }).send({ recipientId: "other" }).expect(400);
    await request(f.app).put(`${base}/${"x".repeat(129)}/read`).auth("admin", { type: "bearer" }).expect(400);
    expect(f.read).toHaveBeenCalledTimes(2);
  });

  it("preserves nondisclosing not-found and revoked-authority errors with private headers", async () => {
    const f = fixture();
    f.read.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "The basket notification was not found."));
    const response = await request(f.app).put(`${base}/foreign-notification/read`).auth("admin", { type: "bearer" });
    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    f.list.mockRejectedValueOnce(new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid."));
    await request(f.app).get(base).auth("admin", { type: "bearer" }).expect(401);
  });
});
