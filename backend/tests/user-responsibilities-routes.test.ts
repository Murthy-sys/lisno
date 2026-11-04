import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { Role } from "../src/domain/roles.js";
import { responsibilitySeed, responsibilityUserId } from "./fixtures/user-responsibility-data.js";

const secret = "responsibility-preview-fixture-secret-with-enough-length";
function setup() {
  const seed = responsibilitySeed();
  seed.users.push({ ...seed.users[0]!, id: "preview-super", name: "Preview administrator", role: "super_admin", accountKind: "standard", active: true,
    email: "preview-super@fixtures.example", emailNormalized: "preview-super@fixtures.example", sessionVersion: 2 });
  seed.users[0]!.accountKind = "standard";
  const repository = createMemoryRepository(seed);
  const app = createApp({ repository, auth: { jwtSecret: secret, jwtExpiresInSeconds: 900 } });
  const token = (id = "preview-super", role: Role = "super_admin", sessionVersion = 2) => `Bearer ${jwt.sign({ id, role, sessionVersion }, secret, { expiresIn: 900 })}`;
  return { repository, app, token };
}

describe("user responsibility route", () => {
  it("returns a bounded projection and leaves stored responsibility and user records unchanged", async () => {
    const { repository, app, token } = setup();
    const userBefore = await repository.findUserById(responsibilityUserId);
    const countsBefore = await repository.countUserResponsibilities(responsibilityUserId);
    const result = await request(app).get(`/api/v1/admin/users/${responsibilityUserId}/responsibilities?limit=2&offset=0&destinationRole=procurement`).set("Authorization", token()).expect(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body.data.user).toEqual({ id: responsibilityUserId, role: "designer", version: userBefore!.version });
    expect(result.body.data.pagination).toEqual({ limit: 2, offset: 0, total: 15, hasMore: true });
    expect(result.body.data.items).toHaveLength(2);
    expect(result.body.data.blockingCount).toBe(15);
    expect(result.body.data.counts).toEqual(countsBefore);
    expect(JSON.stringify(result.body)).not.toMatch(/passwordHash|emailNormalized|clientEmail|clientMobile|accessToken|subtotal|lineItems/);
    expect(await repository.findUserById(responsibilityUserId)).toEqual(userBefore);
    expect(await repository.countUserResponsibilities(responsibilityUserId)).toEqual(countsBefore);
  });

  it("validates query bounds strictly after authenticating and denies stale sessions", async () => {
    const { app, token } = setup();
    for (const query of ["limit=101", "limit=0", "offset=-1", "destinationRole=invalid", "unknown=field"]) {
      await request(app).get(`/api/v1/admin/users/${responsibilityUserId}/responsibilities?${query}`).set("Authorization", token()).expect(400);
    }
    await request(app).get(`/api/v1/admin/users/${responsibilityUserId}/responsibilities`).expect(401);
    await request(app).get(`/api/v1/admin/users/${responsibilityUserId}/responsibilities`).set("Authorization", token("preview-super", "super_admin", 1)).expect(401);
    const forbidden = await request(app).get(`/api/v1/admin/users/${responsibilityUserId}/responsibilities?limit=999`).set("Authorization", token(responsibilityUserId, "designer", 1)).expect(403);
    const missing = await request(app).get("/api/v1/admin/users/nonexistent/responsibilities?limit=999").set("Authorization", token(responsibilityUserId, "designer", 1)).expect(403);
    expect(missing.body).toEqual(forbidden.body);
    await request(app).get("/api/v1/admin/users/nonexistent/responsibilities").set("Authorization", token()).expect(404);
  });
});
