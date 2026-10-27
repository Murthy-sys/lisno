import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { ROLE_PERMISSIONS } from "../src/domain/authorization.js";
import { ACTIVE_ROLE_CODES, type Role } from "../src/domain/roles.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { AUTHORIZATION_POLICY_VERSION } from "../src/services/auth.service.js";

const JWT_SECRET = "auth-test-secret-with-enough-entropy";

function appFor(role: Role, active = true) {
  const seed = structuredClone(demoSeedData);
  const user = {
    ...seed.users[0]!,
    id: `authorization-${role}`,
    name: `${role} user`,
    email: `${role}@authorization.lisno.example`,
    emailNormalized: `${role}@authorization.lisno.example`,
    role,
    vendorId: role === "vendor" ? "vendor-authorization-fixture" : null,
    active,
    accountKind: "standard" as const
  };
  seed.users = [user];

  return {
    app: createApp({
      repository: createMemoryRepository(seed),
      auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 }
    }),
    token: jwt.sign({ id: user.id, role }, JWT_SECRET, { expiresIn: 900 })
  };
}

describe("authorization snapshot API", () => {
  it.each(ACTIVE_ROLE_CODES)("returns the exact current-policy snapshot for %s", async (role) => {
    const { app, token } = appFor(role);

    const response = await request(app)
      .get("/api/v1/auth/authorization")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        role,
        policyVersion: AUTHORIZATION_POLICY_VERSION,
        permissions: ROLE_PERMISSIONS[role]
      }
    });
    expect(new Set(response.body.data.permissions).size).toBe(
      response.body.data.permissions.length
    );
  });

  it("rejects a matching legacy-role token before publishing any permissions", async () => {
    const { app, token } = appFor("program_manager");
    const response = await request(app).get("/api/v1/auth/authorization").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
    expect(response.body).not.toHaveProperty("data");
  });

  it("requires authentication", async () => {
    const { app } = appFor("designer");

    const response = await request(app).get("/api/v1/auth/authorization");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." }
    });
  });

  it("rejects an inactive stored user", async () => {
    const { app, token } = appFor("designer", false);

    const response = await request(app)
      .get("/api/v1/auth/authorization")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "INVALID_TOKEN", message: "Authentication token is invalid." }
    });
  });

  it("rejects a token whose role no longer matches the stored user", async () => {
    const { app } = appFor("designer");
    const token = jwt.sign(
      { id: "authorization-designer", role: "client" },
      JWT_SECRET,
      { expiresIn: 900 }
    );

    const response = await request(app)
      .get("/api/v1/auth/authorization")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "INVALID_TOKEN", message: "Authentication token is invalid." }
    });
  });

  it("keeps the auth me response fields unchanged", async () => {
    const { app, token } = appFor("designer");

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data).sort()).toEqual([
      "email",
      "id",
      "name",
      "role"
    ]);
  });
});
