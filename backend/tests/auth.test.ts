import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { isRoleAuthorized } from "../src/domain/permissions.js";
import { authenticate, authorizeRoles } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuthService } from "../src/services/auth.service.js";

const JWT_SECRET = "auth-test-secret-with-enough-entropy";
const DEMO_PASSWORD = "LisnoDemo2026!";

const createTestApp = (seed = demoSeedData) =>
  createApp({
    repository: createMemoryRepository(seed),
    auth: {
      jwtSecret: JWT_SECRET,
      jwtExpiresInSeconds: 900
    }
  });

describe("authentication API", () => {
  it("requires an explicit JWT configuration", () => {
    expect(() =>
      createApp({ repository: createMemoryRepository(demoSeedData) })
    ).toThrow();
  });

  it("rejects a weak JWT secret at the injected configuration boundary", () => {
    expect(() =>
      createApp({
        repository: createMemoryRepository(demoSeedData),
        auth: { jwtSecret: "short", jwtExpiresInSeconds: 900 }
      })
    ).toThrow();
  });

  it.each([
    ["designer", "ananya@lisno.example", "user-designer-ananya"],
    ["design_manager", "aarav@lisno.example", "user-manager-aarav"],
    ["design_head", "head@lisno.example", "user-head"],
    ["client", "client@aurora.example", "user-client-aurora"]
  ] as const)("logs in the seeded %s account", async (role, email, id) => {
    const response = await request(createTestApp()).post("/api/v1/auth/login").send({
      email,
      password: DEMO_PASSWORD
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        token: expect.any(String),
        user: { id, email, role }
      }
    });
    expect(response.body.data.user).not.toHaveProperty("passwordHash");

    const tokenPayload = jwt.decode(response.body.data.token) as Record<string, unknown>;
    expect(Object.keys(tokenPayload).sort()).toEqual(["exp", "iat", "id", "role"]);
    expect(tokenPayload).toMatchObject({ id, role });
  });

  it("returns the same generic error for an unknown email and a wrong password", async () => {
    const app = createTestApp();

    const [unknownEmail, wrongPassword] = await Promise.all([
      request(app).post("/api/v1/auth/login").send({
        email: "unknown@lisno.example",
        password: DEMO_PASSWORD
      }),
      request(app).post("/api/v1/auth/login").send({
        email: "ananya@lisno.example",
        password: "wrong-password"
      })
    ]);

    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.body).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." }
    });
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it("rejects an inactive user without disclosing account status", async () => {
    const seed = structuredClone(demoSeedData);
    seed.users.find((user) => user.id === "user-designer-ananya")!.active = false;

    const response = await request(createTestApp(seed)).post("/api/v1/auth/login").send({
      email: "ananya@lisno.example",
      password: DEMO_PASSWORD
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." }
    });
  });

  it("validates login credentials with field errors", async () => {
    const response = await request(createTestApp()).post("/api/v1/auth/login").send({
      email: "not-an-email",
      password: ""
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        fields: {
          email: "Enter a valid email address.",
          password: "Password is required."
        }
      }
    });
  });

  it("rejects /me without a bearer token", async () => {
    const response = await request(createTestApp()).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." }
    });
  });

  it("accepts the bearer token returned by login on /me", async () => {
    const app = createTestApp();
    const login = await request(app).post("/api/v1/auth/login").send({
      email: "head@lisno.example",
      password: DEMO_PASSWORD
    });

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.data.token}`);

    expect(login.status).toBe(200);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: "user-head",
        name: "Devika Menon",
        email: "head@lisno.example",
        role: "design_head"
      }
    });
  });

  it("rejects an expired token", async () => {
    const expiredToken = jwt.sign(
      { id: "user-head", role: "design_head" },
      JWT_SECRET,
      { expiresIn: -1 }
    );

    const response = await request(createTestApp())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "TOKEN_EXPIRED", message: "Authentication token has expired." }
    });
  });

  it("rejects a signed token without validated runtime timestamps", async () => {
    const tokenWithoutTimestamps = jwt.sign(
      { id: "user-head", role: "design_head" },
      JWT_SECRET,
      { noTimestamp: true }
    );

    const response = await request(createTestApp())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tokenWithoutTimestamps}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "INVALID_TOKEN", message: "Authentication token is invalid." }
    });
  });

  it("reloads the active user for /me and never returns password fields", async () => {
    const seed = structuredClone(demoSeedData);
    const app = createTestApp(seed);
    const token = jwt.sign(
      { id: "user-manager-aarav", role: "design_manager" },
      JWT_SECRET,
      { expiresIn: 900 }
    );

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: "user-manager-aarav",
        name: "Aarav Mehta",
        email: "aarav@lisno.example",
        role: "design_manager"
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("password");
  });

  it("denies /me after the repository reports the token user as inactive", async () => {
    const seed = structuredClone(demoSeedData);
    seed.users.find((user) => user.id === "user-manager-aarav")!.active = false;
    const token = jwt.sign(
      { id: "user-manager-aarav", role: "design_manager" },
      JWT_SECRET,
      { expiresIn: 900 }
    );

    const response = await request(createTestApp(seed))
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "INVALID_TOKEN", message: "Authentication token is invalid." }
    });
  });
});

describe("role authorization", () => {
  it("allows only explicitly listed roles", () => {
    expect(isRoleAuthorized("design_head", ["design_head"])).toBe(true);
    expect(isRoleAuthorized("design_manager", ["design_manager", "design_head"])).toBe(
      true
    );
    expect(isRoleAuthorized("designer", ["design_manager", "design_head"])).toBe(false);
    expect(isRoleAuthorized("client", [])).toBe(false);
  });

  it.each([
    ["design_head", 200, { data: { authorized: true } }],
    [
      "client",
      403,
      {
        error: {
          code: "FORBIDDEN",
          message: "You are not authorized to perform this action."
        }
      }
    ]
  ] as const)("enforces protected-route roles for %s", async (role, status, body) => {
    const repository = createMemoryRepository(demoSeedData);
    const authService = createAuthService(repository, {
      jwtSecret: JWT_SECRET,
      jwtExpiresInSeconds: 900
    });
    const app = express();
    app.get(
      "/head-only",
      authenticate(authService),
      authorizeRoles("design_head"),
      (_request, response) => response.json({ data: { authorized: true } })
    );
    app.use(errorHandler);
    const userId = role === "design_head" ? "user-head" : "user-client-aurora";
    const token = jwt.sign({ id: userId, role }, JWT_SECRET, { expiresIn: 900 });

    const response = await request(app)
      .get("/head-only")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(status);
    expect(response.body).toEqual(body);
  });

  it("returns the authentication envelope before evaluating a protected role", async () => {
    const authService = createAuthService(createMemoryRepository(demoSeedData), {
      jwtSecret: JWT_SECRET,
      jwtExpiresInSeconds: 900
    });
    const app = express();
    app.get(
      "/head-only",
      authenticate(authService),
      authorizeRoles("design_head"),
      (_request, response) => response.json({ data: { authorized: true } })
    );
    app.use(errorHandler);

    const response = await request(app).get("/head-only");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." }
    });
  });
});
