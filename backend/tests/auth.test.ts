import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { RESERVED_DEMO_IDENTITIES } from "../src/domain/demo-identities.js";
import { createAuthRateLimit } from "../src/middleware/auth-rate-limit.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type {
  AppRepository,
  ProjectRecord,
  UserRecord
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";

const JWT_SECRET = "auth-test-secret-with-enough-entropy";
const BUILT_IN_DEVELOPMENT_JWT_SECRET =
  "local-development-jwt-secret-do-not-use-in-production";
const DEMO_PASSWORD = "LisnoDemo2026!";

const createTestApp = (seed = demoSeedData) =>
  createApp({
    repository: createMemoryRepository(seed),
    auth: {
      jwtSecret: JWT_SECRET,
      jwtExpiresInSeconds: 900
    },
    developmentDemoAuthorization: developmentDemoAuthentication()
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

function seedWithSingleUser(overrides: Partial<UserRecord> = {}) {
  const seed = structuredClone(demoSeedData);
  seed.users = [
    {
      ...seed.users[0]!,
      id: "ordinary-user",
      name: "Ordinary User",
      email: "ordinary@example.test",
      emailNormalized: "ordinary@example.test",
      role: "client",
      accountKind: "standard",
      ...overrides
    }
  ];
  return seed;
}

function withRemoteAddress(
  app: express.Express,
  remoteAddress: string | undefined
) {
  const gateway = express();
  gateway.use((request, _response, next) => {
    Object.defineProperty(request.socket, "remoteAddress", {
      configurable: true,
      value: remoteAddress
    });
    next();
  });
  gateway.use(app);
  return gateway;
}

function createBoundaryApp(input: {
  seed: ReturnType<typeof seedWithSingleUser>;
  jwtSecret?: string;
  developmentDemoAuthorization?: ReturnType<typeof developmentDemoAuthentication>;
  remoteAddress?: string;
}) {
  const inner = createApp({
    repository: createMemoryRepository(input.seed),
    auth: {
      jwtSecret: input.jwtSecret ?? JWT_SECRET,
      jwtExpiresInSeconds: 900
    },
    developmentDemoAuthorization: input.developmentDemoAuthorization
  });
  return withRemoteAddress(inner, input.remoteAddress);
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

function pauseUncoordinatedEmailLookup(base: AppRepository, email: string) {
  let releaseLookup!: () => void;
  let observedLookup!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  const observed = new Promise<void>((resolve) => {
    observedLookup = resolve;
  });
  let armed = true;
  const repository = new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "findUserByEmail") {
        return Reflect.get(target, property, receiver);
      }
      return async (candidate: string) => {
        const user = await target.findUserByEmail(candidate);
        if (armed && !user && candidate.trim().toLowerCase() === email) {
          armed = false;
          observedLookup();
          await released;
        }
        return user;
      };
    }
  });
  return { repository, observed, releaseLookup };
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
    ["super_admin", "super-admin@lisno.example", "user-super-admin"],
    ["admin", "admin@lisno.example", "user-admin"],
    ["designer", "ananya@lisno.example", "user-designer-ananya"],
    ["design_manager", "aarav@lisno.example", "user-manager-aarav"],
    ["design_head", "head@lisno.example", "user-head"],
    ["estimator_sales", "sales@lisno.example", "user-estimator-sales"],
    ["procurement", "procurement@lisno.example", "user-procurement"],
    ["finance_head", "finance-head@lisno.example", "user-finance-head"],
    ["site_manager", "site-manager@lisno.example", "user-site-manager"],
    ["worker_electrician", "worker-electrician@lisno.example", "user-worker-electrician"],
    ["worker_plumber", "worker-plumber@lisno.example", "user-worker-plumber"],
    ["worker_carpenter", "worker-carpenter@lisno.example", "user-worker-carpenter"],
    ["worker_painter", "worker-painter@lisno.example", "user-worker-painter"],
    ["worker_civil", "worker-civil@lisno.example", "user-worker-civil"],
    ["worker_other", "worker-other@lisno.example", "user-worker-other"],
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

    const app = createApp({
      repository,
      auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 }
    });
    const login = await request(app).post("/api/v1/auth/login").send({
      email: "PRIYA@example.com",
      password: "StrongPassword!23"
    });
    const reload = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.data.token}`);

    expect(login.status).toBe(200);
    expect(reload.status).toBe(200);
    expect(reload.body.data).toEqual(response.body.data.user);
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

  it("links a project whose client lookup is forced to interleave with signup", async () => {
    const base = createMemoryRepository(structuredClone(demoSeedData));
    const interleaving = pauseUncoordinatedEmailLookup(
      base,
      "interleaved@example.com"
    );
    const app = createApp({
      repository: interleaving.repository,
      auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 },
      developmentDemoAuthorization: developmentDemoAuthentication()
    });
    const projectRequest = Promise.resolve(
      request(app)
        .post("/api/v1/projects")
        .set(
          "Authorization",
          `Bearer ${jwt.sign(
            { id: "user-designer-ananya", role: "designer" },
            JWT_SECRET,
            { expiresIn: 900 }
          )}`
        )
        .send({
          name: "Interleaved project",
          clientName: "Interleaved Client",
          clientEmail: " Interleaved@Example.COM ",
          clientMobile: "+91 90000 00000",
          clientAddress: "12 Interleave Road",
          assignedDesignerIds: ["user-designer-ananya"],
          managerId: "user-manager-aarav",
          location: "Bengaluru",
          plannedStartAt: "2026-08-01T09:00:00.000Z",
          plannedEndAt: "2026-10-01T17:00:00.000Z"
        })
    );
    const firstOperation = await Promise.race([
      interleaving.observed.then(() => "lookup" as const),
      projectRequest.then(() => "project" as const)
    ]);

    let signupResponse;
    if (firstOperation === "lookup") {
      signupResponse = await request(app)
        .post("/api/v1/auth/client-signup")
        .send(signupBody({ email: "interleaved@example.com" }));
      interleaving.releaseLookup();
    } else {
      signupResponse = await request(app)
        .post("/api/v1/auth/client-signup")
        .send(signupBody({ email: "interleaved@example.com" }));
    }
    const projectResponse = await projectRequest;

    expect(projectResponse.status).toBe(201);
    expect(signupResponse.status).toBe(201);
    expect(await base.findProjectById(projectResponse.body.data.id)).toMatchObject({
      clientId: signupResponse.body.data.user.id,
      clientEmailNormalized: "interleaved@example.com"
    });
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

describe("human authentication request boundary", () => {
  const reservedIdentityCases = [
    [
      "marker only",
      {
        id: "marker-only-user",
        email: "marker-only@example.test",
        emailNormalized: "marker-only@example.test",
        accountKind: "development_demo" as const
      }
    ],
    [
      "reserved ID only",
      {
        id: "user-head",
        email: "reserved-id-only@example.test",
        emailNormalized: "reserved-id-only@example.test",
        accountKind: "standard" as const
      }
    ],
    [
      "reserved email only",
      {
        id: "reserved-email-only-user",
        email: "head@lisno.example",
        emailNormalized: "head@lisno.example",
        accountKind: "standard" as const
      }
    ]
  ] as const;

  it.each(reservedIdentityCases)(
    "denies a local %s identity without an issued capability",
    async (_name, overrides) => {
      const seed = seedWithSingleUser(overrides);
      const user = seed.users[0]!;
      const app = createBoundaryApp({ seed, remoteAddress: "127.0.0.1" });
      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
        expiresIn: 900
      });

      const login = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: DEMO_PASSWORD
      });
      const reload = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(login.status).toBe(401);
      expect(login.body).toEqual({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password."
        }
      });
      expect(reload.status).toBe(401);
      expect(reload.body).toEqual({
        error: { code: "INVALID_TOKEN", message: "Authentication token is invalid." }
      });
    }
  );

  it("denies a reserved identity when the capability is structurally forged", async () => {
    const seed = seedWithSingleUser({
      id: "user-head",
      email: "head@lisno.example",
      emailNormalized: "head@lisno.example",
      accountKind: "development_demo"
    });
    const app = createBoundaryApp({
      seed,
      remoteAddress: "127.0.0.1",
      developmentDemoAuthorization: {
        databaseName: "lisno_demo",
        bindHost: "127.0.0.1"
      } as ReturnType<typeof developmentDemoAuthentication>
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "head@lisno.example",
      password: DEMO_PASSWORD
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it.each(reservedIdentityCases)(
    "denies a remote %s identity even with an issued capability",
    async (_name, overrides) => {
      const seed = seedWithSingleUser(overrides);
      const user = seed.users[0]!;
      const app = createBoundaryApp({
        seed,
        remoteAddress: "192.0.2.10",
        developmentDemoAuthorization: developmentDemoAuthentication()
      });
      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
        expiresIn: 900
      });

      const login = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: DEMO_PASSWORD
      });
      const reload = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(login.status).toBe(401);
      expect(login.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(reload.status).toBe(401);
      expect(reload.body.error.code).toBe("INVALID_TOKEN");
    }
  );

  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])(
    "allows reserved login and JWT reload from issued loopback %s",
    async (remoteAddress) => {
      const seed = seedWithSingleUser({
        id: "user-head",
        email: "head@lisno.example",
        emailNormalized: "head@lisno.example",
        accountKind: "development_demo"
      });
      const user = seed.users[0]!;
      const app = createBoundaryApp({
        seed,
        remoteAddress,
        developmentDemoAuthorization: developmentDemoAuthentication()
      });

      const login = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: DEMO_PASSWORD
      });
      const reload = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${login.body.data.token}`);

      expect(login.status).toBe(200);
      expect(reload.status).toBe(200);
      expect(reload.body.data.id).toBe(user.id);
    }
  );

  it.each([
    ["missing", undefined],
    ["malformed", "127.0.0.999"]
  ])(
    "denies reserved authentication for a %s direct socket address",
    async (_name, remoteAddress) => {
      const seed = seedWithSingleUser({
        id: "user-head",
        email: "head@lisno.example",
        emailNormalized: "head@lisno.example",
        accountKind: "development_demo"
      });
      const app = createBoundaryApp({
        seed,
        remoteAddress,
        developmentDemoAuthorization: developmentDemoAuthentication()
      });

      const response = await request(app).post("/api/v1/auth/login").send({
        email: "head@lisno.example",
        password: DEMO_PASSWORD
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    }
  );

  it("uses only the direct socket peer when a remote request spoofs X-Forwarded-For", async () => {
    const seed = seedWithSingleUser({
      id: "user-head",
      email: "head@lisno.example",
      emailNormalized: "head@lisno.example",
      accountKind: "development_demo"
    });
    const inner = createApp({
      repository: createMemoryRepository(seed),
      auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 },
      developmentDemoAuthorization: developmentDemoAuthentication()
    });
    inner.set("trust proxy", true);
    const app = withRemoteAddress(inner, "192.0.2.10");

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "127.0.0.1")
      .send({ email: "head@lisno.example", password: DEMO_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it.each([
    ["missing", undefined, undefined],
    ["malformed", "127.0.0.999", undefined],
    ["remote despite a loopback X-Forwarded-For", "192.0.2.10", "127.0.0.1"]
  ])(
    "denies a signed reserved JWT for a %s direct socket address",
    async (_name, remoteAddress, forwardedFor) => {
      const seed = seedWithSingleUser({
        id: "user-head",
        email: "head@lisno.example",
        emailNormalized: "head@lisno.example",
        accountKind: "development_demo"
      });
      const user = seed.users[0]!;
      const inner = createApp({
        repository: createMemoryRepository(seed),
        auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 },
        developmentDemoAuthorization: developmentDemoAuthentication()
      });
      inner.set("trust proxy", true);
      const app = withRemoteAddress(inner, remoteAddress);
      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
        expiresIn: 900
      });
      const reload = request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`);
      if (forwardedFor) reload.set("X-Forwarded-For", forwardedFor);

      const response = await reload;

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: "INVALID_TOKEN", message: "Authentication token is invalid." }
      });
    }
  );

  it.each([
    ["without a capability", undefined],
    ["with a demo capability", developmentDemoAuthentication()]
  ])(
    "denies every remote built-in-secret human auth flow %s with generic errors",
    async (_name, developmentDemoAuthorization) => {
      const seed = seedWithSingleUser();
      const user = seed.users[0]!;
      const app = createBoundaryApp({
        seed,
        jwtSecret: BUILT_IN_DEVELOPMENT_JWT_SECRET,
        remoteAddress: "192.0.2.10",
        developmentDemoAuthorization
      });
      const token = jwt.sign(
        { id: user.id, role: user.role },
        BUILT_IN_DEVELOPMENT_JWT_SECRET,
        { expiresIn: 900 }
      );

      const login = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: DEMO_PASSWORD
      });
      const reload = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`);
      const signup = await request(app)
        .post("/api/v1/auth/client-signup")
        .send(signupBody({ email: "remote-signup@example.test" }));

      expect(login.status).toBe(401);
      expect(login.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(reload.status).toBe(401);
      expect(reload.body.error.code).toBe("INVALID_TOKEN");
      expect(signup.status).toBe(401);
      expect(signup.body).toEqual({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password."
        }
      });
    }
  );

  it.each([
    ["without a capability", undefined],
    ["with a demo capability", developmentDemoAuthentication()]
  ])(
    "allows a remote standard User on a custom-secret server %s",
    async (_name, developmentDemoAuthorization) => {
      const seed = seedWithSingleUser();
      const user = seed.users[0]!;
      const app = createBoundaryApp({
        seed,
        remoteAddress: "192.0.2.10",
        developmentDemoAuthorization
      });

      const login = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: DEMO_PASSWORD
      });
      const reload = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${login.body.data.token}`);

      expect(login.status).toBe(200);
      expect(reload.status).toBe(200);
      expect(reload.body.data.id).toBe(user.id);
    }
  );

  it("does password comparison before generic remote built-in-secret login denial", async () => {
    const seed = seedWithSingleUser();
    const repository = createMemoryRepository(seed);
    const compare = vi.spyOn(bcrypt, "compare");
    const inner = createApp({
      repository,
      auth: {
        jwtSecret: BUILT_IN_DEVELOPMENT_JWT_SECRET,
        jwtExpiresInSeconds: 900
      },
      developmentDemoAuthorization: developmentDemoAuthentication()
    });

    const response = await request(withRemoteAddress(inner, "192.0.2.10"))
      .post("/api/v1/auth/login")
      .send({ email: "ordinary@example.test", password: DEMO_PASSWORD });

    expect(response.status).toBe(401);
    expect(compare).toHaveBeenCalledOnce();
  });

  it("reloads the current exact-role User before generic remote JWT denial", async () => {
    const seed = seedWithSingleUser();
    const user = seed.users[0]!;
    const repository = createMemoryRepository(seed);
    const findUserById = vi.spyOn(repository, "findUserById");
    const inner = createApp({
      repository,
      auth: {
        jwtSecret: BUILT_IN_DEVELOPMENT_JWT_SECRET,
        jwtExpiresInSeconds: 900
      },
      developmentDemoAuthorization: developmentDemoAuthentication()
    });
    const token = jwt.sign(
      { id: user.id, role: user.role },
      BUILT_IN_DEVELOPMENT_JWT_SECRET,
      { expiresIn: 900 }
    );

    const response = await request(withRemoteAddress(inner, "192.0.2.10"))
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
    expect(findUserById).toHaveBeenCalledOnce();
    expect(findUserById).toHaveBeenCalledWith(user.id);
  });
});

describe("reserved Client signup boundary", () => {
  it.each(RESERVED_DEMO_IDENTITIES)(
    "returns ACCOUNT_EXISTS without starting writes for $emailNormalized",
    async ({ emailNormalized }) => {
      const repository = createMemoryRepository(structuredClone(demoSeedData));
      const runInTransaction = vi.spyOn(repository, "runInTransaction");
      const coordinateClientEmail = vi.spyOn(repository, "coordinateClientEmail");
      const createUser = vi.spyOn(repository, "createUser");
      const linkProjects = vi.spyOn(repository, "linkUnclaimedProjectsToClient");
      const appendAuditEvent = vi.spyOn(repository, "appendAuditEvent");
      const hash = vi.spyOn(bcrypt, "hash");
      const app = createApp({
        repository,
        auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 }
      });

      const response = await request(app)
        .post("/api/v1/auth/client-signup")
        .send(signupBody({ email: `  ${emailNormalized.toUpperCase()}  ` }));

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: "ACCOUNT_EXISTS",
          message: "An account already exists for this email."
        }
      });
      expect(runInTransaction).not.toHaveBeenCalled();
      expect(coordinateClientEmail).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
      expect(linkProjects).not.toHaveBeenCalled();
      expect(appendAuditEvent).not.toHaveBeenCalled();
      expect(hash).not.toHaveBeenCalled();
    }
  );

  it("keeps reserved-email precedence over remote built-in-secret denial", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const runInTransaction = vi.spyOn(repository, "runInTransaction");
    const createUser = vi.spyOn(repository, "createUser");
    const linkProjects = vi.spyOn(repository, "linkUnclaimedProjectsToClient");
    const appendAuditEvent = vi.spyOn(repository, "appendAuditEvent");
    const hash = vi.spyOn(bcrypt, "hash");
    const inner = createApp({
      repository,
      auth: {
        jwtSecret: BUILT_IN_DEVELOPMENT_JWT_SECRET,
        jwtExpiresInSeconds: 900
      }
    });

    const response = await request(withRemoteAddress(inner, "192.0.2.10"))
      .post("/api/v1/auth/client-signup")
      .send(signupBody({ email: "  CLIENT@AURORA.EXAMPLE " }));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ACCOUNT_EXISTS");
    expect(runInTransaction).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
    expect(linkProjects).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });
});
