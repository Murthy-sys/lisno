import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { ROLE_PERMISSIONS } from "../src/domain/authorization.js";
import { ROLE_CODES, type Role } from "../src/domain/roles.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

const JWT_SECRET = "auth-test-secret-with-enough-entropy";
const POLICY_VERSION = "2026-08-23.prompt-2";

function appFor(role: Role, active = true) {
  const seed = structuredClone(demoSeedData);
  const user = {
    ...seed.users[0]!,
    id: `authorization-${role}`,
    name: `${role} user`,
    email: `${role}@authorization.lisno.example`,
    emailNormalized: `${role}@authorization.lisno.example`,
    role,
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
  it.each(ROLE_CODES)("returns the exact current-policy snapshot for %s", async (role) => {
    const { app, token } = appFor(role);

    const response = await request(app)
      .get("/api/v1/auth/authorization")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        role,
        policyVersion: POLICY_VERSION,
        permissions: ROLE_PERMISSIONS[role]
      }
    });
    expect(new Set(response.body.data.permissions).size).toBe(
      response.body.data.permissions.length
    );
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
