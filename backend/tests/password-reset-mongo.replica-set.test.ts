import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashPasswordResetToken } from "../src/domain/password-resets.js";
import { hashUserInvitationToken } from "../src/domain/user-invitations.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { EmailCoordinationModel } from "../src/models/EmailCoordination.js";
import { PasswordResetRequestModel } from "../src/models/PasswordResetRequest.js";
import { UserModel } from "../src/models/User.js";
import { UserInvitationModel } from "../src/models/UserInvitation.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import {
  RepositoryConflictError,
  type AppRepository
} from "../src/repositories/types.js";
import { createAuditService, type AuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import type { InvitationMailer } from "../src/services/invitation-mailer.js";
import type { PasswordResetMailer } from "../src/services/password-reset-mailer.js";
import {
  PASSWORD_RESET_SYSTEM_ACTOR_ID,
  PasswordResetUnavailableError,
  createPasswordResetService
} from "../src/services/password-reset.service.js";
import {
  InvitationUnavailableError,
  createUserInvitationService
} from "../src/services/user-invitation.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = "2026-08-28T09:00:00.000Z";
const RAW_TOKEN = Buffer.alloc(32, 29).toString("base64url");
const NEW_PASSWORD_HASH = "$2b$12$mongo-password-reset-hash-placeholder";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([
    UserModel.syncIndexes(),
    PasswordResetRequestModel.syncIndexes(),
    EmailCoordinationModel.syncIndexes(),
    AuthorizationCoordinationModel.syncIndexes(),
    UserInvitationModel.syncIndexes(),
    AuditEventModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterAll(async () => {
  await replica.stop();
});

async function insertUser() {
  return UserModel.create({
    _id: "mongo-reset-user",
    name: "Mongo Recovery User",
    email: "mongo-recovery@example.test",
    emailNormalized: "mongo-recovery@example.test",
    mobile: null,
    address: null,
    passwordHash: "$2b$12$original-password-hash-placeholder",
    role: "admin",
    active: true,
    accountKind: "standard",
    version: 1,
    sessionVersion: 1,
    managerId: null,
    authorizedClientIds: [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

async function insertSuperAdmin() {
  return UserModel.create({
    _id: "mongo-reset-super-admin",
    name: "Mongo Reset Super Admin",
    email: "mongo-reset-super-admin@example.test",
    emailNormalized: "mongo-reset-super-admin@example.test",
    mobile: null,
    address: null,
    passwordHash: "$2b$12$original-super-admin-hash-placeholder",
    role: "super_admin",
    active: true,
    accountKind: "standard",
    version: 1,
    sessionVersion: 1,
    managerId: null,
    authorizedClientIds: [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

function superAdminActor(): PublicUser {
  return {
    id: "mongo-reset-super-admin",
    name: "Mongo Reset Super Admin",
    email: "mongo-reset-super-admin@example.test",
    role: "super_admin"
  };
}

function invitationService(input: {
  repository?: AppRepository;
  mailer: InvitationMailer;
  tokenByte?: number;
}) {
  const repository = input.repository ?? createMongoRepository();
  return createUserInvitationService({
    repository,
    audit: createAuditService(repository),
    mailer: input.mailer,
    clock: () => new Date(NOW),
    randomBytes: (size) => Buffer.alloc(size, input.tokenByte ?? 81),
    passwordHasher: async () => NEW_PASSWORD_HASH
  });
}

function immediateInvitationMailer(): InvitationMailer {
  return {
    deliveryKind: "local_test",
    async sendInvitation() {}
  };
}

const mailer: PasswordResetMailer = {
  deliveryKind: "local_test",
  async sendResetLink() {},
  async sendPasswordChanged() {}
};

function service(input: {
  repository?: AppRepository;
  audit?: AuditService;
  now?: string;
  tokenByte?: number;
  id?: string;
  background?: Promise<void>[];
} = {}) {
  const repository = input.repository ?? createMongoRepository();
  return createPasswordResetService({
    repository,
    audit: input.audit ?? createAuditService(repository),
    mailer,
    clock: () => new Date(input.now ?? NOW),
    randomBytes: (size) => Buffer.alloc(size, input.tokenByte ?? 29),
    idGenerator: () => input.id ?? "mongo-reset-id",
    passwordHasher: async () => NEW_PASSWORD_HASH,
    dispatch: (operation) => {
      input.background?.push(operation());
    }
  });
}

async function issueReset(
  input: Parameters<typeof service>[0] = {},
  email = "mongo-recovery@example.test"
) {
  const background: Promise<void>[] = [];
  const resetService = service({ ...input, background });
  await resetService.request(email);
  await Promise.all(background);
  return resetService;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function gateFirstResetDiscovery(repository: AppRepository) {
  const reached = deferred();
  const release = deferred();
  let gated = false;
  const proxy = new Proxy(repository, {
    get(target, property, receiver) {
      if (property !== "runInTransaction") {
        return Reflect.get(target, property, receiver);
      }
      return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
        target.runInTransaction((transaction) =>
          operation(new Proxy(transaction, {
            get(inner, key, innerReceiver) {
              if (key !== "findPendingPasswordResetByTokenHash") {
                return Reflect.get(inner, key, innerReceiver);
              }
              return async (tokenHash: string) => {
                const result = await inner.findPendingPasswordResetByTokenHash(
                  tokenHash
                );
                if (!gated && result) {
                  gated = true;
                  reached.resolve();
                  await release.promise;
                }
                return result;
              };
            }
          }))
        );
    }
  });
  return {
    repository: proxy,
    reached: reached.promise,
    release: release.resolve
  };
}

function gateAfterAuthorizationCoordination(repository: AppRepository) {
  const reached = deferred();
  const release = deferred();
  let gated = false;
  const proxy = new Proxy(repository, {
    get(target, property, receiver) {
      if (property !== "runInTransaction") {
        return Reflect.get(target, property, receiver);
      }
      return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
        target.runInTransaction((transaction) =>
          operation(new Proxy(transaction, {
            get(inner, key, innerReceiver) {
              if (key !== "coordinateAuthorizationMutation") {
                return Reflect.get(inner, key, innerReceiver);
              }
              return async () => {
                await inner.coordinateAuthorizationMutation();
                if (!gated) {
                  gated = true;
                  reached.resolve();
                  await release.promise;
                }
              };
            }
          }))
        );
    }
  });
  return {
    repository: proxy,
    reached: reached.promise,
    release: release.resolve
  };
}

function controlledInvitationMailer() {
  const reached = deferred();
  const release = deferred();
  const calls: string[] = [];
  const controlled: InvitationMailer = {
    deliveryKind: "local_test",
    async sendInvitation(input) {
      calls.push(input.rawToken);
      reached.resolve();
      await release.promise;
    }
  };
  return { mailer: controlled, reached: reached.promise, release: release.resolve, calls };
}

describe("password reset Mongo replica-set transactions", () => {
  it("leaves no coordination, reset, audit, or email state for unknown and ineligible requests", async () => {
    await UserModel.create([
      {
        _id: "mongo-inactive-reset-user",
        name: "Inactive",
        email: "mongo-inactive@example.test",
        emailNormalized: "mongo-inactive@example.test",
        passwordHash: "inactive-hash",
        role: "admin",
        active: false,
        accountKind: "standard",
        version: 1,
        sessionVersion: 1,
        managerId: null,
        authorizedClientIds: [],
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW)
      },
      {
        _id: "mongo-demo-reset-user",
        name: "Demo",
        email: "mongo-demo@example.test",
        emailNormalized: "mongo-demo@example.test",
        passwordHash: "demo-hash",
        role: "admin",
        active: true,
        accountKind: "development_demo",
        version: 1,
        sessionVersion: 1,
        managerId: null,
        authorizedClientIds: [],
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW)
      }
    ]);
    const background: Promise<void>[] = [];
    const resetService = service({ background });
    for (const email of [
      "mongo-unknown@example.test",
      "mongo-inactive@example.test",
      "mongo-demo@example.test"
    ]) {
      await expect(resetService.request(email)).resolves.toEqual({ accepted: true });
    }
    await Promise.all(background);
    expect(await EmailCoordinationModel.countDocuments()).toBe(0);
    expect(await PasswordResetRequestModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("does not update authorization coordination for an unknown valid token but does after discovery", async () => {
    await insertUser();
    const unknownToken = Buffer.alloc(32, 98).toString("base64url");
    await expect(service().complete({
      rawToken: unknownToken,
      password: "ReplacementPassword!2026"
    })).rejects.toBeInstanceOf(PasswordResetUnavailableError);
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);

    await issueReset();
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);
    await expect(service().complete({
      rawToken: RAW_TOKEN,
      password: "ReplacementPassword!2026"
    })).resolves.toEqual({ reset: true });
    expect(await AuthorizationCoordinationModel.findById("authorization")
      .lean()
      .exec()).toMatchObject({ revision: 1 });
  });

  it("serializes concurrent issuance to one current digest and one requested audit", async () => {
    await insertUser();
    const background: Promise<void>[] = [];
    const first = service({ background });
    const second = service({ background });
    const settled = await Promise.all([
      first.request("mongo-recovery@example.test"),
      second.request("mongo-recovery@example.test")
    ]);
    expect(settled).toEqual([{ accepted: true }, { accepted: true }]);
    await Promise.all(background);

    const resets = await PasswordResetRequestModel.find()
      .select("+tokenHash")
      .lean()
      .exec();
    expect(resets).toHaveLength(1);
    expect(resets[0]).toMatchObject({
      status: "pending",
      tokenHash: hashPasswordResetToken(RAW_TOKEN),
      version: 2
    });
    const ordinaryProjection = await PasswordResetRequestModel.findOne().lean().exec();
    expect(ordinaryProjection).not.toHaveProperty("tokenHash");
    expect(await AuditEventModel.countDocuments({
      action: "password_reset.requested"
    })).toBe(1);
  });

  it("gives concurrent completion one winner and commits credential/reset/audit together", async () => {
    await insertUser();
    await issueReset();

    const completions = await Promise.allSettled([
      service().complete({ rawToken: RAW_TOKEN, password: "ReplacementPassword!2026" }),
      service().complete({ rawToken: RAW_TOKEN, password: "ReplacementPassword!2026" })
    ]);
    expect(completions.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = completions.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(PasswordResetUnavailableError);

    const user = await UserModel.findById("mongo-reset-user")
      .select("+passwordHash")
      .lean()
      .exec();
    expect(user).toMatchObject({
      passwordHash: NEW_PASSWORD_HASH,
      version: 2,
      sessionVersion: 2
    });
    const reset = await PasswordResetRequestModel.findById(
      "password-reset-mongo-reset-id"
    )
      .select("+tokenHash")
      .lean()
      .exec();
    expect(reset).toMatchObject({
      status: "completed",
      tokenHash: null,
      version: 3
    });
    expect(await AuditEventModel.countDocuments({
      action: "password_reset.completed"
    })).toBe(1);
    expect(await AuditEventModel.countDocuments({
      action: /^password_reset\./,
      actorId: { $ne: PASSWORD_RESET_SYSTEM_ACTOR_ID }
    })).toBe(0);
  });

  it("uses an exclusive rolling 24-hour boundary in Mongo", async () => {
    await insertUser();
    const base = Date.parse(NOW);
    for (let index = 0; index < 5; index += 1) {
      await issueReset({
        now: new Date(base + index * 5 * 60_000).toISOString(),
        tokenByte: 91 + index,
        id: `quota-${index}`
      });
    }
    await issueReset({
      now: new Date(base + 24 * 60 * 60_000).toISOString(),
      tokenByte: 96,
      id: "quota-boundary"
    });
    expect(await PasswordResetRequestModel.countDocuments()).toBe(6);
    expect(await PasswordResetRequestModel.countDocuments({ status: "pending" }))
      .toBe(1);
  });

  it("rolls back credential and token consumption when completion audit fails", async () => {
    await insertUser();
    await issueReset();
    const repository = createMongoRepository();
    const baseAudit = createAuditService(repository);
    const failingAudit = new Proxy(baseAudit, {
      get(target, property, receiver) {
        if (property !== "append") return Reflect.get(target, property, receiver);
        return async (...args: Parameters<AuditService["append"]>) => {
          if (args[0].action === "password_reset.completed") {
            throw new RepositoryConflictError("forced reset audit failure");
          }
          return target.append(...args);
        };
      }
    });
    const resetService = createPasswordResetService({
      repository,
      audit: failingAudit,
      mailer,
      clock: () => new Date(NOW),
      passwordHasher: async () => NEW_PASSWORD_HASH,
      dispatch: () => undefined
    });

    await expect(resetService.complete({
      rawToken: RAW_TOKEN,
      password: "ReplacementPassword!2026"
    })).rejects.toBeInstanceOf(PasswordResetUnavailableError);

    const user = await UserModel.findById("mongo-reset-user")
      .select("+passwordHash")
      .lean()
      .exec();
    expect(user).toMatchObject({
      passwordHash: "$2b$12$original-password-hash-placeholder",
      version: 1,
      sessionVersion: 1
    });
    const reset = await PasswordResetRequestModel.findById(
      "password-reset-mongo-reset-id"
    )
      .select("+tokenHash")
      .lean()
      .exec();
    expect(reset).toMatchObject({
      status: "pending",
      tokenHash: hashPasswordResetToken(RAW_TOKEN),
      version: 2
    });
    expect(await AuditEventModel.countDocuments({
      action: "password_reset.completed"
    })).toBe(0);
  });

  it("rolls back supersession and successor creation when request audit fails", async () => {
    await insertUser();
    await issueReset();
    const repository = createMongoRepository();
    const baseAudit = createAuditService(repository);
    const failingAudit = new Proxy(baseAudit, {
      get(target, property, receiver) {
        if (property !== "append") return Reflect.get(target, property, receiver);
        return async (...args: Parameters<AuditService["append"]>) => {
          if (args[0].action === "password_reset.requested") {
            throw new RepositoryConflictError("forced reset request audit failure");
          }
          return target.append(...args);
        };
      }
    });
    const background: Promise<void>[] = [];
    const failures: unknown[] = [];
    const laterService = createPasswordResetService({
      repository,
      audit: failingAudit,
      mailer,
      clock: () => new Date(Date.parse(NOW) + 5 * 60_000),
      randomBytes: (size) => Buffer.alloc(size, 30),
      idGenerator: () => "audit-failed-successor",
      passwordHasher: async () => NEW_PASSWORD_HASH,
      dispatch: (operation) => { background.push(operation()); },
      reportAsyncFailure: (failure) => failures.push(failure)
    });

    await expect(laterService.request("mongo-recovery@example.test")).resolves.toEqual({
      accepted: true
    });
    await Promise.all(background);
    const resets = await PasswordResetRequestModel.find()
      .select("+tokenHash")
      .lean()
      .exec();
    expect(resets).toHaveLength(1);
    expect(resets[0]).toMatchObject({
      _id: "password-reset-mongo-reset-id",
      status: "pending",
      tokenHash: hashPasswordResetToken(RAW_TOKEN),
      version: 2
    });
    expect(await AuditEventModel.countDocuments({
      action: "password_reset.superseded"
    })).toBe(0);
    expect(failures).toEqual([{
      stage: "issuance",
      failureCode: "ASYNC_OPERATION_FAILED"
    }]);
  });

  it("makes a newer request deterministically supersede an in-flight old-token completion", async () => {
    await insertUser();
    await issueReset();
    const gate = gateFirstResetDiscovery(createMongoRepository());
    const completion = service({ repository: gate.repository }).complete({
      rawToken: RAW_TOKEN,
      password: "ReplacementPassword!2026"
    });
    await gate.reached;

    const later = new Date(Date.parse(NOW) + 5 * 60_000).toISOString();
    await issueReset({ now: later, tokenByte: 30, id: "newer-reset-id" });
    gate.release();
    await expect(completion).rejects.toBeInstanceOf(PasswordResetUnavailableError);

    const resets = await PasswordResetRequestModel.find()
      .select("+tokenHash")
      .sort({ issuedAt: 1 })
      .lean()
      .exec();
    expect(resets).toHaveLength(2);
    expect(resets[0]).toMatchObject({ status: "superseded", tokenHash: null });
    expect(resets[1]).toMatchObject({ status: "pending", tokenGeneration: 2 });
    const user = await UserModel.findById("mongo-reset-user")
      .select("+passwordHash")
      .lean()
      .exec();
    expect(user).toMatchObject({ version: 1, sessionVersion: 1 });
  });

  it("serializes reset completion before invitation issuance so the sent token uses the new issuer version", async () => {
    await insertSuperAdmin();
    await issueReset({}, "mongo-reset-super-admin@example.test");
    const gate = gateAfterAuthorizationCoordination(createMongoRepository());
    const completion = service({ repository: gate.repository }).complete({
      rawToken: RAW_TOKEN,
      password: "ReplacementPassword!2026"
    });
    await gate.reached;

    const rawInvitationToken = Buffer.alloc(32, 81).toString("base64url");
    const invitations = invitationService({ mailer: immediateInvitationMailer() });
    const creation = invitations.create(superAdminActor(), {
      name: "Post-reset Invitee",
      email: "post-reset-invitee@example.test",
      role: "designer",
      mobile: "+91 90000 00000"
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await UserInvitationModel.countDocuments()).toBe(0);

    gate.release();
    await expect(completion).resolves.toEqual({ reset: true });
    const created = await creation;
    expect(created).toMatchObject({
      deliveryStatus: "sent",
      currentLinkAvailable: true
    });
    expect(await UserInvitationModel.findOne().lean().exec()).toMatchObject({
      tokenIssuerVersion: 2,
      deliveryStatus: "sent"
    });
    await expect(invitations.inspect(rawInvitationToken)).resolves.toMatchObject({
      email: "post-reset-invitee@example.test"
    });
  });

  it("records bounded invitation delivery failure when reset wins during SMTP", async () => {
    await insertSuperAdmin();
    await issueReset({}, "mongo-reset-super-admin@example.test");
    const controlled = controlledInvitationMailer();
    const invitations = invitationService({ mailer: controlled.mailer });
    const creation = invitations.create(superAdminActor(), {
      name: "Concurrent Invitee",
      email: "concurrent-invitee@example.test",
      role: "designer",
      mobile: "+91 90000 00000"
    });
    await controlled.reached;

    await expect(service().complete({
      rawToken: RAW_TOKEN,
      password: "ReplacementPassword!2026"
    })).resolves.toEqual({ reset: true });
    controlled.release();
    const created = await creation;
    expect(created).toMatchObject({
      deliveryStatus: "failed",
      currentLinkAvailable: false
    });
    const invitation = await UserInvitationModel.findOne().lean().exec();
    expect(invitation).toMatchObject({
      deliveryStatus: "failed",
      deliveryFailureCode: "INVITATION_ISSUER_UNAVAILABLE",
      sentAt: null,
      tokenIssuerVersion: 1
    });
    expect(await AuditEventModel.countDocuments({
      action: "user_invitation.delivery_sent"
    })).toBe(0);
    expect(await AuditEventModel.countDocuments({
      action: "user_invitation.delivery_failed",
      "newValues.deliveryState": "failed"
    })).toBe(1);
    await expect(invitations.inspect(controlled.calls[0]!)).rejects.toBeInstanceOf(
      InvitationUnavailableError
    );
  });

  it("invalidates a previously sent invitation when its Super Admin issuer resets", async () => {
    await insertSuperAdmin();
    const rawInvitationToken = Buffer.alloc(32, 81).toString("base64url");
    const invitations = invitationService({ mailer: immediateInvitationMailer() });
    await expect(invitations.create(superAdminActor(), {
      name: "Pre-reset Invitee",
      email: "pre-reset-invitee@example.test",
      role: "designer",
      mobile: "+91 90000 00000"
    })).resolves.toMatchObject({
      deliveryStatus: "sent",
      currentLinkAvailable: true
    });
    await expect(invitations.inspect(rawInvitationToken)).resolves.toMatchObject({
      email: "pre-reset-invitee@example.test"
    });

    await issueReset({}, "mongo-reset-super-admin@example.test");
    await expect(service().complete({
      rawToken: RAW_TOKEN,
      password: "ReplacementPassword!2026"
    })).resolves.toEqual({ reset: true });
    await expect(invitations.inspect(rawInvitationToken)).rejects.toBeInstanceOf(
      InvitationUnavailableError
    );
    expect(await UserModel.findById("mongo-reset-super-admin").lean().exec())
      .toMatchObject({ version: 2, sessionVersion: 2 });
  });

  for (const mutation of ["deactivate", "role-change"] as const) {
    it(`makes complete/${mutation} leave the password and reset unchanged when identity wins`, async () => {
      await insertUser();
      await issueReset();
      const gate = gateFirstResetDiscovery(createMongoRepository());
      const completion = service({ repository: gate.repository }).complete({
        rawToken: RAW_TOKEN,
        password: "ReplacementPassword!2026"
      });
      await gate.reached;

      await createMongoRepository().updateUser("mongo-reset-user", 1, {
        ...(mutation === "deactivate"
          ? { active: false }
          : { role: "designer" as const }),
        updatedAt: new Date(Date.parse(NOW) + 1_000).toISOString()
      });
      gate.release();
      await expect(completion).rejects.toBeInstanceOf(
        PasswordResetUnavailableError
      );

      const user = await UserModel.findById("mongo-reset-user")
        .select("+passwordHash")
        .lean()
        .exec();
      expect(user).toMatchObject({
        passwordHash: "$2b$12$original-password-hash-placeholder",
        version: 2,
        sessionVersion: 1,
        ...(mutation === "deactivate"
          ? { active: false, role: "admin" }
          : { active: true, role: "designer" })
      });
      const reset = await PasswordResetRequestModel.findOne()
        .select("+tokenHash")
        .lean()
        .exec();
      expect(reset).toMatchObject({
        status: "pending",
        tokenHash: hashPasswordResetToken(RAW_TOKEN),
        version: 2
      });
    });

    it(`makes complete/${mutation} reject the later stale identity mutation when completion wins`, async () => {
      await insertUser();
      await issueReset();
      await expect(service().complete({
        rawToken: RAW_TOKEN,
        password: "ReplacementPassword!2026"
      })).resolves.toEqual({ reset: true });

      await expect(createMongoRepository().updateUser(
        "mongo-reset-user",
        1,
        {
          ...(mutation === "deactivate"
            ? { active: false }
            : { role: "designer" as const }),
          updatedAt: new Date(Date.parse(NOW) + 1_000).toISOString()
        }
      )).rejects.toBeInstanceOf(RepositoryConflictError);
      const user = await UserModel.findById("mongo-reset-user")
        .select("+passwordHash")
        .lean()
        .exec();
      expect(user).toMatchObject({
        passwordHash: NEW_PASSWORD_HASH,
        version: 2,
        sessionVersion: 2,
        active: true,
        role: "admin"
      });
    });
  }
});
