import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import {
  PASSWORD_RESET_TTL_MS,
  PASSWORD_RESET_RECIPIENT_WINDOW_MS,
  hashPasswordResetToken
} from "../src/domain/password-resets.js";
import { ROLE_CODES } from "../src/domain/roles.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository, SeedData } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PasswordResetMailer } from "../src/services/password-reset-mailer.js";
import { createPasswordResetService } from "../src/services/password-reset.service.js";
import {
  PASSWORD_RESET_SYSTEM_ACTOR_ID,
  PasswordResetUnavailableError,
  type PasswordResetAsyncFailure
} from "../src/services/password-reset.service.js";

const JWT_SECRET = "password-reset-test-secret-with-enough-entropy";
const OLD_PASSWORD = "LisnoDemo2026!";
const NEW_PASSWORD = "ReplacementPassword!2026";

function standardSeed(): SeedData {
  const seed = structuredClone(demoSeedData);
  seed.users = [{
    ...seed.users[0]!,
    id: "user-password-reset",
    name: "Recovery User",
    email: "recovery-user@example.test",
    emailNormalized: "recovery-user@example.test",
    role: "admin",
    active: true,
    accountKind: "standard",
    version: 1,
    sessionVersion: 1,
    managerId: null,
    authorizedClientIds: []
  }];
  seed.userInvitations = [];
  seed.passwordResetRequests = [];
  seed.auditEvents = [];
  return seed;
}

function recordingMailer(): Extract<PasswordResetMailer, { deliveryKind: "local_test" }> & {
  resetLinks: Array<{ rawToken: string; expiresAt: string }>;
  changed: string[];
} {
  const resetLinks: Array<{ rawToken: string; expiresAt: string }> = [];
  const changed: string[] = [];
  return {
    deliveryKind: "local_test",
    resetLinks,
    changed,
    async sendResetLink(input) {
      resetLinks.push({ rawToken: input.rawToken, expiresAt: input.expiresAt });
    },
    async sendPasswordChanged(input) {
      changed.push(input.changedAt);
    }
  };
}

function testApp(input?: {
  repository?: AppRepository;
  mailer?: PasswordResetMailer;
  clock?: () => Date;
  rateLimit?: { windowMs?: number; maxAttempts?: number; maxEntries?: number };
  dispatch?: (operation: () => Promise<void>) => void;
  reportAsyncFailure?: (failure: PasswordResetAsyncFailure) => void;
}) {
  const repository = input?.repository ?? createMemoryRepository(standardSeed());
  const mailer = input?.mailer ?? recordingMailer();
  const app = createApp({
    repository,
    auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 },
    passwordResetMailer: mailer,
    ...(input?.clock ? { clock: input.clock } : {}),
    ...(input?.rateLimit ? { passwordResetRateLimit: input.rateLimit } : {}),
    ...(input?.dispatch ? { passwordResetDispatch: input.dispatch } : {}),
    ...(input?.reportAsyncFailure
      ? { passwordResetAsyncFailureReporter: input.reportAsyncFailure }
      : {})
  });
  return { app, repository, mailer };
}

async function waitForResetLink(
  mailer: ReturnType<typeof recordingMailer>
): Promise<string> {
  await vi.waitFor(() => expect(mailer.resetLinks).toHaveLength(1));
  return mailer.resetLinks[0]!.rawToken;
}

describe("self-service password reset", () => {
  it("fails closed before account lookup when reset mail is globally disabled", async () => {
    const base = createMemoryRepository(standardSeed());
    const findUserByEmail = vi.fn(base.findUserByEmail.bind(base));
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        return property === "findUserByEmail"
          ? findUserByEmail
          : Reflect.get(target, property, receiver);
      }
    });
    const { app } = testApp({
      repository,
      mailer: { deliveryKind: "disabled" }
    });

    const known = await request(app)
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "recovery-user@example.test" })
      .expect(503);
    const unknown = await request(app)
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "unknown-user@example.test" })
      .expect(503);

    expect(known.body).toEqual(unknown.body);
    expect(known.headers["cache-control"]).toBe("no-store");
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(await base.listAuditEvents({})).toEqual([]);
  });

  it("returns 202 before gated lookup, issuance, or SMTP and contains async failures", async () => {
    const base = createMemoryRepository(standardSeed());
    let releaseLookup!: () => void;
    let reachedLookup!: () => void;
    const lookupReached = new Promise<void>((resolve) => { reachedLookup = resolve; });
    const lookupReleased = new Promise<void>((resolve) => { releaseLookup = resolve; });
    const findUserByEmail = vi.fn(async (email: string) => {
      reachedLookup();
      await lookupReleased;
      return base.findUserByEmail(email);
    });
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        return property === "findUserByEmail"
          ? findUserByEmail
          : Reflect.get(target, property, receiver);
      }
    });
    const jobs: Array<() => Promise<void>> = [];
    const failures: PasswordResetAsyncFailure[] = [];
    const mailer = recordingMailer();
    const { app } = testApp({
      repository,
      mailer,
      dispatch: (operation) => jobs.push(operation),
      reportAsyncFailure: (failure) => failures.push(failure)
    });

    const accepted = await request(app)
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "recovery-user@example.test" })
      .expect(202);
    expect(accepted.body).toEqual({ data: { accepted: true } });
    expect(jobs).toHaveLength(1);
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(mailer.resetLinks).toEqual([]);

    const background = jobs[0]!();
    await lookupReached;
    expect(mailer.resetLinks).toEqual([]);
    expect(await base.listAuditEvents({})).toEqual([]);
    releaseLookup();
    await background;
    expect(mailer.resetLinks).toHaveLength(1);
    expect(failures).toEqual([]);

    const rawFailure = new Error("must-not-leak-token-or-email");
    const failingRepository = new Proxy(base, {
      get(target, property, receiver) {
        if (property === "findUserByEmail") {
          return async () => { throw rawFailure; };
        }
        return Reflect.get(target, property, receiver);
      }
    });
    const failedJobs: Array<() => Promise<void>> = [];
    const reported: PasswordResetAsyncFailure[] = [];
    const failedApp = testApp({
      repository: failingRepository,
      mailer: recordingMailer(),
      dispatch: (operation) => failedJobs.push(operation),
      reportAsyncFailure: (failure) => reported.push(failure)
    }).app;
    const failedAccepted = await request(failedApp)
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "recovery-user@example.test" })
      .expect(202);
    await failedJobs[0]!();
    expect(reported).toEqual([{
      stage: "issuance",
      failureCode: "ASYNC_OPERATION_FAILED"
    }]);
    expect(JSON.stringify({ failedAccepted: failedAccepted.body, reported })).not.toContain(
      rawFailure.message
    );
  });

  it("does not coordinate, persist, audit, or email unknown and ineligible identities", async () => {
    const seed = standardSeed();
    seed.users.push(
      {
        ...seed.users[0]!,
        id: "inactive-reset-user",
        email: "inactive-reset-user@example.test",
        emailNormalized: "inactive-reset-user@example.test",
        active: false
      },
      {
        ...demoSeedData.users[0]!,
        id: "reserved-reset-user"
      }
    );
    const base = createMemoryRepository(seed);
    const runInTransaction = vi.fn(base.runInTransaction.bind(base));
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        return property === "runInTransaction"
          ? runInTransaction
          : Reflect.get(target, property, receiver);
      }
    });
    const jobs: Array<() => Promise<void>> = [];
    const mailer = recordingMailer();
    const { app } = testApp({
      repository,
      mailer,
      dispatch: (operation) => jobs.push(operation)
    });

    for (const email of [
      "unknown-user@example.test",
      "inactive-reset-user@example.test",
      demoSeedData.users[0]!.email
    ]) {
      await request(app)
        .post("/api/v1/auth/password-reset/request")
        .send({ email })
        .expect(202);
    }
    await Promise.all(jobs.map((job) => job()));
    expect(runInTransaction).not.toHaveBeenCalled();
    expect(mailer.resetLinks).toEqual([]);
    expect(await base.listAuditEvents({})).toEqual([]);
    expect(await base.findPendingPasswordResetByUserId("inactive-reset-user")).toBeNull();
    expect(await base.findPendingPasswordResetByUserId("reserved-reset-user")).toBeNull();
  });

  it("returns the same accepted response for eligible, unknown, inactive, and reserved identities", async () => {
    const seed = standardSeed();
    seed.users.push(
      {
        ...seed.users[0]!,
        id: "inactive-reset-user",
        email: "inactive-reset-user@example.test",
        emailNormalized: "inactive-reset-user@example.test",
        active: false
      },
      {
        ...demoSeedData.users[0]!,
        id: "reserved-reset-user"
      }
    );
    const mailer = recordingMailer();
    const { app } = testApp({
      repository: createMemoryRepository(seed),
      mailer
    });
    const bodies: unknown[] = [];
    for (const email of [
      "recovery-user@example.test",
      "unknown-user@example.test",
      "inactive-reset-user@example.test",
      demoSeedData.users[0]!.email
    ]) {
      const response = await request(app)
        .post("/api/v1/auth/password-reset/request")
        .send({ email })
        .expect(202);
      expect(response.headers["cache-control"]).toBe("no-store");
      bodies.push(response.body);
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    await vi.waitFor(() => expect(mailer.resetLinks).toHaveLength(1));
  });

  for (const [roleIndex, role] of ROLE_CODES.entries()) {
    it(`allows an active standard ${role} identity to reset`, async () => {
      const seed = standardSeed();
      seed.users[0]!.role = role;
      const repository = createMemoryRepository(seed);
      const mailer = recordingMailer();
      const background: Promise<void>[] = [];
      const service = createPasswordResetService({
        repository,
        audit: createAuditService(repository),
        mailer,
        clock: () => new Date("2026-08-28T09:00:00.000Z"),
        randomBytes: (size) => Buffer.alloc(size, 71 + roleIndex),
        idGenerator: () => `${role}-reset`,
        passwordHasher: async () => "$2b$12$role-matrix-reset-hash",
        dispatch: (operation) => { background.push(operation()); }
      });

      await expect(service.request("recovery-user@example.test")).resolves.toEqual({
        accepted: true
      });
      await Promise.all(background);
      expect(mailer.resetLinks).toHaveLength(1);
      expect(await repository.findPendingPasswordResetByUserId(
        "user-password-reset"
      )).toMatchObject({ status: "pending" });
      await expect(service.complete({
        rawToken: mailer.resetLinks[0]!.rawToken,
        password: NEW_PASSWORD
      })).resolves.toEqual({ reset: true });
      await Promise.all(background);
      expect(await repository.findUserById("user-password-reset")).toMatchObject({
        role,
        version: 2,
        sessionVersion: 2
      });
    });
  }

  it("uses a digest-only one-time token, changes the password, and invalidates old JWTs", async () => {
    const mailer = recordingMailer();
    const { app, repository } = testApp({ mailer });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "recovery-user@example.test", password: OLD_PASSWORD })
      .expect(200);
    const oldJwt = String(login.body.data.token);
    const legacyJwt = jwt.sign(
      { id: "user-password-reset", role: "admin" },
      JWT_SECRET,
      { expiresIn: 900 }
    );
    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${legacyJwt}`)
      .expect(200);

    const accepted = await request(app)
      .post("/api/v1/auth/password-reset/request")
      .set("Authorization", `Bearer ${oldJwt}`)
      .send({ email: "recovery-user@example.test" })
      .expect(202);
    expect(accepted.body).toEqual({ data: { accepted: true } });
    const rawToken = await waitForResetLink(mailer);
    const stored = await repository.findPendingPasswordResetByTokenHash(
      hashPasswordResetToken(rawToken)
    );
    expect(stored).toMatchObject({
      userId: "user-password-reset",
      status: "pending",
      tokenGeneration: 1,
      deliveryStatus: "sent"
    });
    expect(JSON.stringify(stored)).not.toContain(rawToken);
    expect(stored?.tokenHash).toBe(hashPasswordResetToken(rawToken));

    await request(app)
      .post("/api/v1/auth/password-reset/inspect")
      .send({ token: rawToken })
      .expect(200, { data: { available: true } });

    const completed = await request(app)
      .post("/api/v1/auth/password-reset/complete")
      .send({
        token: rawToken,
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD
      })
      .expect(200);
    expect(completed.body).toEqual({ data: { reset: true } });
    expect(JSON.stringify(completed.body)).not.toContain("token");

    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${oldJwt}`)
      .expect(401);
    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${legacyJwt}`)
      .expect(401);
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "recovery-user@example.test", password: OLD_PASSWORD })
      .expect(401);
    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "recovery-user@example.test", password: NEW_PASSWORD })
      .expect(200);
    expect(jwt.decode(newLogin.body.data.token)).toMatchObject({ sessionVersion: 2 });

    await request(app)
      .post("/api/v1/auth/password-reset/inspect")
      .send({ token: rawToken })
      .expect(410);
    await request(app)
      .post("/api/v1/auth/password-reset/complete")
      .send({
        token: rawToken,
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD
      })
      .expect(410);
    await vi.waitFor(() => expect(mailer.changed).toHaveLength(1));

    const user = await repository.findUserById("user-password-reset");
    expect(user).toMatchObject({ version: 2, sessionVersion: 2 });
    expect(await bcrypt.compare(NEW_PASSWORD, user!.passwordHash)).toBe(true);
    const resetAudits = (await repository.listAuditEvents({})).filter(
      ({ action }) => action.startsWith("password_reset.")
    );
    expect(resetAudits).not.toHaveLength(0);
    expect(resetAudits.every(
      ({ actorId }) => actorId === PASSWORD_RESET_SYSTEM_ACTOR_ID
    )).toBe(true);
    expect(resetAudits.find(({ action }) => action === "password_reset.completed"))
      .toMatchObject({
        actorId: PASSWORD_RESET_SYSTEM_ACTOR_ID,
        newValues: { userId: "user-password-reset" }
      });
    expect(resetAudits.find(
      ({ action }) => action === "password_reset.notification_sent"
    )).toMatchObject({
      actorId: PASSWORD_RESET_SYSTEM_ACTOR_ID,
      entityType: "user",
      entityId: "user-password-reset"
    });
    const auditJson = JSON.stringify(resetAudits);
    expect(auditJson).not.toContain(rawToken);
    expect(auditJson).not.toContain(NEW_PASSWORD);
    expect(auditJson).not.toContain(user!.passwordHash);
  });

  it("atomically suppresses concurrent requests and permits only one completion", async () => {
    const mailer = recordingMailer();
    const { app } = testApp({ mailer });
    const requestBody = { email: "recovery-user@example.test" };
    const [firstRequest, secondRequest] = await Promise.all([
      request(app).post("/api/v1/auth/password-reset/request").send(requestBody),
      request(app).post("/api/v1/auth/password-reset/request").send(requestBody)
    ]);
    expect(firstRequest.status).toBe(202);
    expect(secondRequest.status).toBe(202);
    const rawToken = await waitForResetLink(mailer);

    const body = {
      token: rawToken,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD
    };
    const completions = await Promise.all([
      request(app).post("/api/v1/auth/password-reset/complete").send(body),
      request(app).post("/api/v1/auth/password-reset/complete").send(body)
    ]);
    expect(completions.map(({ status }) => status).sort()).toEqual([200, 410]);
  });

  it("persists the five-per-day recipient quota across otherwise eligible requests", async () => {
    let now = Date.parse("2026-08-28T09:00:00.000Z");
    const mailer = recordingMailer();
    const { app } = testApp({ mailer, clock: () => new Date(now) });

    for (let index = 0; index < 5; index += 1) {
      await request(app)
        .post("/api/v1/auth/password-reset/request")
        .send({ email: "recovery-user@example.test" })
        .expect(202);
      await vi.waitFor(() => expect(mailer.resetLinks).toHaveLength(index + 1));
      now += 5 * 60_000;
    }
    await request(app)
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "recovery-user@example.test" })
      .expect(202);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mailer.resetLinks).toHaveLength(5);

    now = Date.parse("2026-08-28T09:00:00.000Z") +
      PASSWORD_RESET_RECIPIENT_WINDOW_MS;
    await request(app)
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "recovery-user@example.test" })
      .expect(202);
    await vi.waitFor(() => expect(mailer.resetLinks).toHaveLength(6));
  });

  it("ignores a stale delivery callback after a newer generation supersedes it", async () => {
    const repository = createMemoryRepository(standardSeed());
    let releaseFirstSend!: () => void;
    let reachedFirstSend!: () => void;
    const firstSendReached = new Promise<void>((resolve) => {
      reachedFirstSend = resolve;
    });
    const firstSendReleased = new Promise<void>((resolve) => {
      releaseFirstSend = resolve;
    });
    let sendCount = 0;
    const mailer: Extract<PasswordResetMailer, { deliveryKind: "local_test" }> = {
      deliveryKind: "local_test",
      async sendResetLink() {
        sendCount += 1;
        if (sendCount === 1) {
          reachedFirstSend();
          await firstSendReleased;
        }
      },
      async sendPasswordChanged() {}
    };
    const dispatched: Array<() => Promise<void>> = [];
    let now = Date.parse("2026-08-28T09:00:00.000Z");
    let tokenByte = 40;
    let id = 0;
    const service = createPasswordResetService({
      repository,
      audit: createAuditService(repository),
      mailer,
      clock: () => new Date(now),
      randomBytes: (size) => Buffer.alloc(size, tokenByte++),
      idGenerator: () => `stale-callback-${++id}`,
      dispatch: (operation) => dispatched.push(operation)
    });

    await service.request("recovery-user@example.test");
    const oldDelivery = dispatched[0]!();
    await firstSendReached;
    now += 5 * 60_000;
    await service.request("recovery-user@example.test");
    expect(dispatched).toHaveLength(2);
    await dispatched[1]!();
    const requested = (await repository.listAuditEvents({})).filter(
      ({ action }) => action === "password_reset.requested"
    );
    expect(requested).toHaveLength(2);

    const oldReset = await repository.findPasswordResetById(
      "password-reset-stale-callback-1"
    );
    expect(oldReset).toMatchObject({
      status: "superseded",
      deliveryStatus: "queued"
    });
    expect((await repository.listAuditEvents({})).filter(
      ({ action }) => action === "password_reset.delivery_sent"
    )).toHaveLength(1);

    releaseFirstSend();
    await oldDelivery;
    expect((await repository.listAuditEvents({})).filter(
      ({ action }) => action === "password_reset.delivery_sent"
    )).toHaveLength(1);
    expect((await repository.listAuditEvents({})).filter(
      ({ action }) => action.startsWith("password_reset.")
    ).every(({ actorId }) => actorId === PASSWORD_RESET_SYSTEM_ACTOR_ID)).toBe(true);
  });

  it("rechecks expiry after coordination instead of using the pre-lock timestamp", async () => {
    const repository = createMemoryRepository(standardSeed());
    let now = Date.parse("2026-08-28T09:00:00.000Z");
    const rawToken = Buffer.alloc(32, 51).toString("base64url");
    const issuance: Promise<void>[] = [];
    const issuedService = createPasswordResetService({
      repository,
      audit: createAuditService(repository),
      mailer: recordingMailer(),
      clock: () => new Date(now),
      randomBytes: (size) => Buffer.alloc(size, 51),
      idGenerator: () => "expiry-recheck",
      dispatch: (operation) => { issuance.push(operation()); }
    });
    await issuedService.request("recovery-user@example.test");
    await Promise.all(issuance);

    let reached!: () => void;
    let release!: () => void;
    const coordinated = new Promise<void>((resolve) => { reached = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    const gatedRepository = new Proxy(repository, {
      get(target, property, receiver) {
        if (property !== "runInTransaction") {
          return Reflect.get(target, property, receiver);
        }
        return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
          target.runInTransaction((transaction) =>
            operation(new Proxy(transaction, {
              get(inner, key, innerReceiver) {
                if (key !== "coordinateClientEmail") {
                  return Reflect.get(inner, key, innerReceiver);
                }
                return async (email: string) => {
                  reached();
                  await released;
                  return inner.coordinateClientEmail(email);
                };
              }
            }))
          );
      }
    });
    now += PASSWORD_RESET_TTL_MS - 1;
    const completion = createPasswordResetService({
      repository: gatedRepository,
      audit: createAuditService(gatedRepository),
      mailer: recordingMailer(),
      clock: () => new Date(now),
      passwordHasher: async () => "new-hash",
      dispatch: () => undefined
    }).complete({ rawToken, password: NEW_PASSWORD });
    await coordinated;
    now += 2;
    release();

    await expect(completion).rejects.toBeInstanceOf(PasswordResetUnavailableError);
    expect(await repository.findUserById("user-password-reset")).toMatchObject({
      version: 1,
      sessionVersion: 1
    });
    expect(await repository.findPasswordResetById(
      "password-reset-expiry-recheck"
    )).toMatchObject({ status: "pending" });
  });

  it("pre-discovers valid-shaped tokens before authorization coordination and still rechecks transactionally", async () => {
    const repository = createMemoryRepository(standardSeed());
    const unknownRunInTransaction = vi.fn(repository.runInTransaction.bind(repository));
    const unknownPasswordHasher = vi.fn(async () => "unused-hash");
    const unknownRepository = new Proxy(repository, {
      get(target, property, receiver) {
        return property === "runInTransaction"
          ? unknownRunInTransaction
          : Reflect.get(target, property, receiver);
      }
    });
    const unknownService = createPasswordResetService({
      repository: unknownRepository,
      audit: createAuditService(unknownRepository),
      mailer: recordingMailer(),
      clock: () => new Date("2026-08-28T09:00:00.000Z"),
      passwordHasher: unknownPasswordHasher,
      dispatch: () => undefined
    });
    const unknownToken = Buffer.alloc(32, 99).toString("base64url");
    await expect(unknownService.complete({
      rawToken: unknownToken,
      password: NEW_PASSWORD
    })).rejects.toBeInstanceOf(PasswordResetUnavailableError);
    expect(unknownRunInTransaction).not.toHaveBeenCalled();
    expect(unknownPasswordHasher).not.toHaveBeenCalled();

    const issuance: Promise<void>[] = [];
    const rawToken = Buffer.alloc(32, 100).toString("base64url");
    const issuer = createPasswordResetService({
      repository,
      audit: createAuditService(repository),
      mailer: recordingMailer(),
      clock: () => new Date("2026-08-28T09:00:00.000Z"),
      randomBytes: (size) => Buffer.alloc(size, 100),
      idGenerator: () => "pre-discovery-recheck",
      dispatch: (operation) => { issuance.push(operation()); }
    });
    await issuer.request("recovery-user@example.test");
    await Promise.all(issuance);

    const publicDigestLookup = vi.fn(
      repository.findPendingPasswordResetByTokenHash.bind(repository)
    );
    const transactionalDigestLookup = vi.fn();
    const authorizationCoordination = vi.fn();
    const recheckingRepository = new Proxy(repository, {
      get(target, property, receiver) {
        if (property === "findPendingPasswordResetByTokenHash") {
          return publicDigestLookup;
        }
        if (property !== "runInTransaction") {
          return Reflect.get(target, property, receiver);
        }
        return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
          target.runInTransaction((transaction) =>
            operation(new Proxy(transaction, {
              get(inner, key, innerReceiver) {
                if (key === "findPendingPasswordResetByTokenHash") {
                  return async (tokenHash: string) => {
                    transactionalDigestLookup(tokenHash);
                    return inner.findPendingPasswordResetByTokenHash(tokenHash);
                  };
                }
                if (key === "coordinateAuthorizationMutation") {
                  return async () => {
                    authorizationCoordination();
                    await inner.coordinateAuthorizationMutation();
                  };
                }
                return Reflect.get(inner, key, innerReceiver);
              }
            }))
          );
      }
    });
    const completion = createPasswordResetService({
      repository: recheckingRepository,
      audit: createAuditService(recheckingRepository),
      mailer: recordingMailer(),
      clock: () => new Date("2026-08-28T09:01:00.000Z"),
      passwordHasher: async () => "replacement-hash",
      dispatch: () => undefined
    });
    await expect(completion.complete({ rawToken, password: NEW_PASSWORD }))
      .resolves.toEqual({ reset: true });
    expect(publicDigestLookup).toHaveBeenCalledTimes(1);
    expect(authorizationCoordination).toHaveBeenCalledTimes(1);
    expect(transactionalDigestLookup).toHaveBeenCalledTimes(2);
  });

  it("maps malformed string tokens to generic 410 while retaining body validation", async () => {
    const { app } = testApp();
    for (const path of ["inspect", "complete"] as const) {
      const malformed = await request(app)
        .post(`/api/v1/auth/password-reset/${path}`)
        .send(path === "inspect"
          ? { token: "malformed" }
          : {
              token: "malformed",
              password: NEW_PASSWORD,
              passwordConfirmation: NEW_PASSWORD
            })
        .expect(410);
      expect(malformed.body).toMatchObject({
        error: { code: "PASSWORD_RESET_UNAVAILABLE" }
      });

      await request(app)
        .post(`/api/v1/auth/password-reset/${path}`)
        .send(path === "inspect"
          ? {}
          : { password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD })
        .expect(400);
      await request(app)
        .post(`/api/v1/auth/password-reset/${path}`)
        .send(path === "inspect"
          ? { token: 42 }
          : {
              token: 42,
              password: NEW_PASSWORD,
              passwordConfirmation: NEW_PASSWORD
            })
        .expect(400);
    }
  });

  it("enforces strict validation, no-store errors, and one shared IP limit", async () => {
    const { app } = testApp({
      rateLimit: { windowMs: 60_000, maxAttempts: 2, maxEntries: 10 }
    });
    const invalid = await request(app)
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "not-an-email", extra: true })
      .expect(400);
    expect(invalid.headers["cache-control"]).toBe("no-store");
    expect(invalid.body.error.fields).toEqual(expect.objectContaining({ extra: expect.any(String) }));

    await request(app)
      .post("/api/v1/auth/password-reset/inspect")
      .send({ token: "malformed" })
      .expect(410);
    const limited = await request(app)
      .post("/api/v1/auth/password-reset/complete")
      .send({})
      .expect(429);
    expect(limited.headers["cache-control"]).toBe("no-store");
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});
