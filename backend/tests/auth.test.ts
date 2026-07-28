import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { isRoleAuthorized } from "../src/domain/permissions.js";
import { authenticate, authorizeRoles } from "../src/middleware/auth.js";
import { createAuthRateLimit } from "../src/middleware/auth-rate-limit.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository, ProjectRecord } from "../src/repositories/types.js";
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

const signupBody = (overrides: Partial<Record<string, string>> = {}) => ({
  name: "Priya Sharma",
  email: "priya@example.com",
  mobile: "+91 98765 43210",
  address: "12 Garden Road, Bengaluru",
  password: "StrongPassword!23",
  passwordConfirmation: "StrongPassword!23",
  ...overrides
});

function unclaimedProject(id: string, email: string): ProjectRecord {
  return {
    ...structuredClone(demoSeedData.projects[0]),
    id,
    name: `Project ${id}`,
    clientId: null,
    clientEmail: email,
    clientEmailNormalized: email.trim().toLowerCase()
  };
}

function failSignupAuditWrites(base: AppRepository): AppRepository {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "runInTransaction") return Reflect.get(target, property, receiver);
      return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
        target.runInTransaction((transaction) =>
          operation(
            new Proxy(transaction, {
              get(transactionTarget, transactionProperty, transactionReceiver) {
                if (transactionProperty === "appendAuditEvent") {
                  return async () => { throw new Error("simulated signup audit failure"); };
                }
                return Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
              }
            })
          )
        );
    }
  });
}

function createRateLimitApp(input: {
  windowMs: number;
  maxAttempts: number;
  maxEntries: number;
  clock: () => number;
}) {
  const limiter = createAuthRateLimit(input);
  const app = express();
  app.set("trust proxy", true);
  app.post("/auth", limiter, (_request, response) => response.sendStatus(204));
  app.use(errorHandler);
  return { app, limiter };
}

const attempt = (app: express.Express, ip: string) =>
  request(app).post("/auth").set("X-Forwarded-For", ip).send();

describe("authentication rate limiter", () => {
  it("keeps no more than the configured number of live IP buckets", async () => {
    let now = 0;
    const { app, limiter } = createRateLimitApp({
      windowMs: 15 * 60_000,
      maxAttempts: 1,
      maxEntries: 3,
      clock: () => now
    });

    for (const ip of ["198.51.100.1", "198.51.100.2", "198.51.100.3", "198.51.100.4"]) {
      await attempt(app, ip).expect(204);
      expect(limiter.activeBucketCount()).toBeLessThanOrEqual(3);
      now += 1;
    }
  });

  it("evicts the oldest live IP deterministically when capacity is reached", async () => {
    let now = 0;
    const { app, limiter } = createRateLimitApp({
      windowMs: 15 * 60_000,
      maxAttempts: 1,
      maxEntries: 2,
      clock: () => now
    });

    await attempt(app, "198.51.100.1").expect(204);
    now += 1;
    await attempt(app, "198.51.100.2").expect(204);
    now += 1;
    await attempt(app, "198.51.100.3").expect(204);

    await attempt(app, "198.51.100.2").expect(429);
    await attempt(app, "198.51.100.1").expect(204);
    expect(limiter.activeBucketCount()).toBe(2);
  });

  it("removes expired buckets without retaining their capacity", async () => {
    let now = 0;
    const { app, limiter } = createRateLimitApp({
      windowMs: 100,
      maxAttempts: 1,
      maxEntries: 2,
      clock: () => now
    });

    await attempt(app, "198.51.100.1").expect(204);
    await attempt(app, "198.51.100.2").expect(204);
    expect(limiter.activeBucketCount()).toBe(2);
    now = 100;
    await attempt(app, "198.51.100.3").expect(204);
    expect(limiter.activeBucketCount()).toBe(1);
  });

  it("continues to throttle a hot IP while it remains in the active window", async () => {
    const { app } = createRateLimitApp({
      windowMs: 15 * 60_000,
      maxAttempts: 2,
      maxEntries: 2,
      clock: () => 0
    });

    await attempt(app, "198.51.100.1").expect(204);
    await attempt(app, "198.51.100.2").expect(204);
    await attempt(app, "198.51.100.1").expect(204);
    await attempt(app, "198.51.100.1").expect(429);
  });
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

describe("client signup API", () => {
  it("creates an active client, claims every matching unclaimed project, and omits password fields", async () => {
    const seed = structuredClone(demoSeedData);
    seed.projects.push(
      unclaimedProject("project-priya-home", "PRIYA@EXAMPLE.COM"),
      unclaimedProject("project-priya-office", "priya@example.com"),
      { ...unclaimedProject("project-priya-already-linked", "priya@example.com"), clientId: "user-client-aurora" }
    );
    const repository = createMemoryRepository(seed);
    const response = await request(
      createApp({ repository, auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 } })
    )
      .post("/api/v1/auth/client-signup")
      .send(signupBody({ email: "  Priya@Example.COM  " }));

    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe("client");
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain("password");
    const stored = await repository.findUserByEmail("priya@example.com");
    expect(stored).toMatchObject({ active: true, role: "client", email: "priya@example.com" });
    expect(await bcrypt.compare("StrongPassword!23", stored!.passwordHash)).toBe(true);
    const linkedProjects = await Promise.all([
      repository.findProjectById("project-priya-home"),
      repository.findProjectById("project-priya-office")
    ]);
    expect(linkedProjects.map(({ clientId }) => clientId)).toEqual([stored!.id, stored!.id]);
    await expect(repository.findProjectById("project-priya-already-linked")).resolves.toMatchObject({ clientId: "user-client-aurora" });
    expect(await repository.listAuditEvents({ actorId: stored!.id })).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "client_signed_up", entityType: "user", entityId: stored!.id }),
      expect.objectContaining({ action: "client_project_linked", entityType: "project", entityId: "project-priya-home" }),
      expect.objectContaining({ action: "client_project_linked", entityType: "project", entityId: "project-priya-office" })
    ]));
  });

  it("rejects an email already used by either a client or internal role", async () => {
    const app = createTestApp();
    for (const email of ["client@aurora.example", "ananya@lisno.example"]) {
      const response = await request(app).post("/api/v1/auth/client-signup").send(signupBody({ email }));
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: { code: "ACCOUNT_EXISTS", message: "An account already exists for this email." }
      });
    }
  });

  it("validates confirmation and refuses unknown signup fields", async () => {
    const response = await request(createTestApp())
      .post("/api/v1/auth/client-signup")
      .send({ ...signupBody({ passwordConfirmation: "DifferentPassword!23" }), role: "design_head" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        fields: {
          role: "Unrecognized field: role.",
          passwordConfirmation: "Passwords do not match."
        }
      }
    });
  });

  it("rolls back the user and project claims when audit storage fails", async () => {
    const seed = structuredClone(demoSeedData);
    seed.projects.push(unclaimedProject("project-rollback", "rollback@example.com"));
    const repository = createMemoryRepository(seed);
    const response = await request(
      createApp({ repository: failSignupAuditWrites(repository), auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 } })
    )
      .post("/api/v1/auth/client-signup")
      .send(signupBody({ email: "rollback@example.com" }));

    expect(response.status).toBe(500);
    await expect(repository.findUserByEmail("rollback@example.com")).resolves.toBeNull();
    await expect(repository.findProjectById("project-rollback")).resolves.toMatchObject({ clientId: null });
  });

  it("allows only one concurrent signup for the same normalized email", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const app = createApp({ repository, auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 } });
    const [first, second] = await Promise.all([
      request(app).post("/api/v1/auth/client-signup").send(signupBody({ email: "duplicate@example.com" })),
      request(app).post("/api/v1/auth/client-signup").send(signupBody({ email: "DUPLICATE@example.com" }))
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect((await repository.listUsers()).filter((user) => user.emailNormalized === "duplicate@example.com")).toHaveLength(1);
  });

  it("throttles login and signup attempts until the configured fixed window expires", async () => {
    let now = new Date("2026-07-28T00:00:00.000Z");
    const app = createApp({
      repository: createMemoryRepository(structuredClone(demoSeedData)),
      auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 },
      clock: () => now,
      authRateLimit: { windowMs: 15 * 60_000, maxAttempts: 2 }
    });
    await request(app).post("/api/v1/auth/login").send({ email: "missing@example.com", password: "wrong" }).expect(401);
    await request(app).post("/api/v1/auth/client-signup").send(signupBody({ email: "missing@example.com" })).expect(201);
    const limited = await request(app).post("/api/v1/auth/login").send({ email: "missing@example.com", password: "wrong" });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: "TOO_MANY_ATTEMPTS", message: "Please try again later." }
    });
    now = new Date("2026-07-28T00:15:00.000Z");
    await request(app).post("/api/v1/auth/login").send({ email: "missing@example.com", password: "wrong" }).expect(401);
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
