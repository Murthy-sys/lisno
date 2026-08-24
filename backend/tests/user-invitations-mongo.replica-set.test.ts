import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { USER_INVITATION_TTL_MS, hashUserInvitationToken } from "../src/domain/user-invitations.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { EmailCoordinationModel } from "../src/models/EmailCoordination.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { UserModel } from "../src/models/User.js";
import { UserInvitationModel } from "../src/models/UserInvitation.js";
import { ApiError } from "../src/middleware/errors.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import {
  RepositoryConflictError,
  type AppRepository
} from "../src/repositories/types.js";
import {
  createAuditService,
  type AuditService
} from "../src/services/audit.service.js";
import {
  AccountExistsError,
  createAuthService,
  type PublicUser
} from "../src/services/auth.service.js";
import type { InvitationMailer } from "../src/services/invitation-mailer.js";
import { createProjectService } from "../src/services/project.service.js";
import { createUserAdministrationService } from "../src/services/user-administration.service.js";
import {
  InvitationUnavailableError,
  createUserInvitationService
} from "../src/services/user-invitation.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = "2026-08-24T12:00:00.000Z";
const INVITEE_EMAIL = "race.invitee@example.test";
const RAW_TOKEN = Buffer.alloc(32, 41).toString("base64url");
const CREATED_RAW_TOKEN = Buffer.alloc(32, 17).toString("base64url");
const RESENT_RAW_TOKEN = Buffer.alloc(32, 18).toString("base64url");
const ACCEPTED_PASSWORD = "StrongInvitationPassword!23";
const ACCEPTED_PASSWORD_HASH = "$2b$12$mongo-race-accepted-password-hash";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([
    UserInvitationModel.syncIndexes(),
    UserModel.syncIndexes(),
    EmailCoordinationModel.syncIndexes(),
    AuthorizationCoordinationModel.syncIndexes(),
    ProjectModel.syncIndexes(),
    AuditEventModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await replica.stop();
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function publicUser(id: string, role: PublicUser["role"] = "super_admin"): PublicUser {
  return {
    id,
    name: "Canonical Super Admin",
    email: "super-admin@example.test",
    role
  };
}

async function insertUser(
  id: string,
  role: PublicUser["role"],
  overrides: Partial<{
    name: string;
    email: string;
    emailNormalized: string;
    mobile: string | null;
    address: string | null;
    passwordHash: string;
    active: boolean;
    accountKind: "standard" | "local_demo";
    version: number;
    managerId: string | null;
    authorizedClientIds: string[];
  }> = {}
) {
  const email = overrides.email ?? `${id}@example.test`;
  return UserModel.create({
    _id: id,
    name: overrides.name ?? id,
    email,
    emailNormalized: overrides.emailNormalized ?? email.toLowerCase(),
    mobile: overrides.mobile ?? null,
    address: overrides.address ?? null,
    passwordHash: overrides.passwordHash ?? "not-used-by-race-test",
    role,
    active: overrides.active ?? true,
    accountKind: overrides.accountKind ?? "standard",
    version: overrides.version ?? 1,
    managerId: overrides.managerId ?? null,
    authorizedClientIds: overrides.authorizedClientIds ?? [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

async function insertPendingInvitation(
  id: string,
  issuerId: string,
  overrides: Partial<{
    name: string;
    email: string;
    emailNormalized: string;
    role: "admin" | "estimator_sales" | "designer" | "procurement" | "finance_head" | "site_manager" | "worker_electrician" | "worker_plumber" | "worker_carpenter" | "worker_painter" | "worker_civil" | "worker_other" | "design_manager" | "design_head";
    mobile: string;
    rawToken: string;
    tokenGeneration: number;
    tokenIssuerVersion: number;
    issuedAt: string;
    deliveryStatus: "queued" | "sent" | "failed";
    deliveryAttemptedAt: string | null;
    sentAt: string | null;
    deliveryFailureCode: string | null;
    version: number;
  }> = {}
) {
  const issuedAt = overrides.issuedAt ?? new Date(Date.parse(NOW) - 120_000).toISOString();
  const email = overrides.email ?? INVITEE_EMAIL;
  return UserInvitationModel.create({
    _id: id,
    name: overrides.name ?? "Race Invitee",
    email,
    emailNormalized: overrides.emailNormalized ?? email.toLowerCase(),
    role: overrides.role ?? "designer",
    mobile: overrides.mobile ?? "+91 90000 00000",
    tokenHash: hashUserInvitationToken(overrides.rawToken ?? RAW_TOKEN),
    tokenGeneration: overrides.tokenGeneration ?? 1,
    issuedAt: new Date(issuedAt),
    expiresAt: new Date(Date.parse(issuedAt) + USER_INVITATION_TTL_MS),
    status: "pending",
    invitedById: issuerId,
    tokenIssuedById: issuerId,
    tokenIssuerVersion: overrides.tokenIssuerVersion ?? 1,
    acceptedUserId: null,
    acceptedAt: null,
    revokedById: null,
    revokedAt: null,
    supersededByInvitationId: null,
    supersededAt: null,
    deliveryStatus: overrides.deliveryStatus ?? "queued",
    deliveryAttemptedAt: overrides.deliveryAttemptedAt
      ? new Date(overrides.deliveryAttemptedAt)
      : null,
    sentAt: overrides.sentAt ? new Date(overrides.sentAt) : null,
    deliveryFailureCode: overrides.deliveryFailureCode ?? null,
    __v: (overrides.version ?? 1) - 1,
    createdAt: new Date(issuedAt),
    updatedAt: new Date(issuedAt)
  });
}

async function insertPresentationInvitation(
  id: string,
  issuerId: string,
  presentation:
    | "pending"
    | "delivery_failed"
    | "expired"
    | "accepted"
    | "revoked"
    | "superseded",
  issuedAt: string,
  tokenByte: number
) {
  const terminalAt = new Date(Date.parse(issuedAt) + 1_000).toISOString();
  const terminal = ["accepted", "revoked", "superseded"].includes(presentation);
  return UserInvitationModel.create({
    _id: id,
    name: `Presentation ${presentation}`,
    email: `${id}@example.test`,
    emailNormalized: `${id}@example.test`,
    role: "designer",
    mobile: "+91 90000 00000",
    tokenHash: terminal
      ? null
      : hashUserInvitationToken(Buffer.alloc(32, tokenByte).toString("base64url")),
    tokenGeneration: 1,
    issuedAt: new Date(issuedAt),
    expiresAt: new Date(Date.parse(issuedAt) + USER_INVITATION_TTL_MS),
    status: terminal ? presentation : "pending",
    invitedById: issuerId,
    tokenIssuedById: issuerId,
    tokenIssuerVersion: 1,
    acceptedUserId: presentation === "accepted" ? `accepted-user-${id}` : null,
    acceptedAt: presentation === "accepted" ? new Date(terminalAt) : null,
    revokedById: presentation === "revoked" ? issuerId : null,
    revokedAt: presentation === "revoked" ? new Date(terminalAt) : null,
    supersededByInvitationId:
      presentation === "superseded" ? `successor-${id}` : null,
    supersededAt: presentation === "superseded" ? new Date(terminalAt) : null,
    deliveryStatus: presentation === "delivery_failed" ? "failed" : "sent",
    deliveryAttemptedAt: new Date(terminalAt),
    sentAt: presentation === "delivery_failed" ? null : new Date(terminalAt),
    deliveryFailureCode:
      presentation === "delivery_failed" ? "INVITATION_DELIVERY_FAILED" : null,
    __v: terminal ? 1 : 0,
    createdAt: new Date(issuedAt),
    updatedAt: new Date(terminalAt)
  });
}

function immediateMailer(): InvitationMailer {
  return {
    deliveryKind: "local_test",
    async sendInvitation() {}
  };
}

function controlledMailer() {
  const reached = deferred<void>();
  const completion = deferred<void>();
  const calls: Array<{ rawToken: string; email: string }> = [];
  const mailer: InvitationMailer = {
    deliveryKind: "local_test",
    async sendInvitation(input) {
      calls.push({ rawToken: input.rawToken, email: input.recipient.email });
      reached.resolve();
      return completion.promise;
    }
  };
  return { mailer, reached: reached.promise, completion, calls };
}

function auditFailingOn(
  repository: AppRepository,
  action: string
): AuditService {
  const base = createAuditService(repository);
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "append") return Reflect.get(target, property, receiver);
      return async (...args: Parameters<AuditService["append"]>) => {
        if (args[0].action === action) {
          throw new RepositoryConflictError(`forced audit failure for ${action}`);
        }
        return target.append(...args);
      };
    }
  });
}

function invitationService(repository: AppRepository = createMongoRepository()) {
  return createUserInvitationService({
    repository,
    audit: createAuditService(repository),
    mailer: immediateMailer(),
    clock: () => new Date(NOW),
    randomBytes: (size) => Buffer.alloc(size, 17),
    passwordHasher: async () => ACCEPTED_PASSWORD_HASH
  });
}

async function insertProjectActors() {
  await Promise.all([
    insertUser("race-designer", "designer"),
    insertUser("race-design-manager", "design_manager")
  ]);
  return {
    designer: publicUser("race-designer", "designer"),
    input: {
      name: "Race Project",
      clientName: "Race Invitee",
      clientEmail: INVITEE_EMAIL,
      clientMobile: "+91 90000 00000",
      clientAddress: "Pune",
      assignedDesignerIds: [] as string[],
      managerId: "race-design-manager",
      location: "Pune",
      plannedStartAt: "2026-09-01T00:00:00.000Z",
      plannedEndAt: "2026-12-01T00:00:00.000Z"
    }
  };
}

function gatePublicDiscoveries(repository: AppRepository, count: number) {
  const reached = deferred<void>();
  const release = deferred<void>();
  let discoveries = 0;
  const gated = new Proxy(repository, {
    get(target, property, receiver) {
      if (property !== "findPendingUserInvitationByTokenHash") {
        return Reflect.get(target, property, receiver);
      }
      return async (tokenHash: string) => {
        const result = await target.findPendingUserInvitationByTokenHash(tokenHash);
        discoveries += 1;
        if (discoveries === count) reached.resolve();
        await release.promise;
        return result;
      };
    }
  });
  return {
    repository: gated,
    reached: reached.promise,
    release: () => release.resolve()
  };
}

function gateTransactionMethod(
  repository: AppRepository,
  method: "coordinateAuthorizationMutation" | "coordinateClientEmail",
  count: number
) {
  const reached = deferred<void>();
  const release = deferred<void>();
  let arrivals = 0;
  const gated = new Proxy(repository, {
    get(target, property, receiver) {
      if (property !== "runInTransaction") {
        return Reflect.get(target, property, receiver);
      }
      return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
        target.runInTransaction((transaction) =>
          operation(new Proxy(transaction, {
            get(inner, key, innerReceiver) {
              if (key !== method) return Reflect.get(inner, key, innerReceiver);
              return async (...args: unknown[]) => {
                arrivals += 1;
                if (arrivals === count) reached.resolve();
                if (arrivals <= count) await release.promise;
                return (inner[key] as (...values: unknown[]) => Promise<unknown>)(
                  ...args
                );
              };
            }
          }))
        );
    }
  });
  return {
    repository: gated,
    reached: reached.promise,
    release: () => release.resolve()
  };
}

function gateFirstCoordinationByCaller(
  method: "coordinateAuthorizationMutation" | "coordinateClientEmail",
  callerCount: number
) {
  const reached = deferred<void>();
  const releases = Array.from({ length: callerCount }, () => deferred<void>());
  const attempts = Array.from({ length: callerCount }, () => 0);
  let firstArrivals = 0;
  const repositories = attempts.map((_attempt, callerIndex) => {
    const repository = createMongoRepository();
    return new Proxy(repository, {
      get(target, property, receiver) {
        if (property !== "runInTransaction") {
          return Reflect.get(target, property, receiver);
        }
        return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
          target.runInTransaction((transaction) =>
            operation(new Proxy(transaction, {
              get(inner, key, innerReceiver) {
                if (key !== method) return Reflect.get(inner, key, innerReceiver);
                return async (...args: unknown[]) => {
                  attempts[callerIndex] += 1;
                  if (attempts[callerIndex] === 1) {
                    firstArrivals += 1;
                    if (firstArrivals === callerCount) reached.resolve();
                    await releases[callerIndex]!.promise;
                  }
                  return (inner[key] as (...values: unknown[]) => Promise<unknown>)(
                    ...args
                  );
                };
              }
            }))
          );
      }
    });
  });
  return {
    repositories,
    attempts,
    reached: reached.promise,
    release: (callerIndex: number) => releases[callerIndex]!.resolve()
  };
}

function expectExactDomainError(
  error: unknown,
  expected: {
    type: typeof ApiError;
    status: number;
    code: string;
    message: string;
    headers?: { "Retry-After": string };
    fields?: Record<string, string>;
  }
) {
  expect(error).toBeInstanceOf(expected.type);
  expect(error).toMatchObject({
    status: expected.status,
    code: expected.code,
    message: expected.message,
    headers: expected.headers,
    fields: expected.fields
  });
  expect(String(error)).not.toMatch(
    /E11000|duplicate key|Mongo(?:Server|DB)?|write conflict|transaction/i
  );
}

interface ExpectedAudit {
  action: string;
  actorId: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

async function expectExactAudits(
  expected: ExpectedAudit[],
  forbiddenValues: string[] = []
) {
  const audits = await AuditEventModel.find().lean().exec();
  const normalized = audits
    .map(({ action, actorId, entityType, entityId, oldValues, newValues }) => ({
      action,
      actorId,
      entityType,
      entityId,
      oldValues,
      newValues
    }))
    .sort((left, right) => {
      const leftKey = `${left.action}:${left.entityType}:${left.entityId}`;
      const rightKey = `${right.action}:${right.entityType}:${right.entityId}`;
      return leftKey.localeCompare(rightKey);
    });
  const normalizedExpected = expected
    .map((audit) => ({
      ...audit,
      oldValues: audit.oldValues
    }))
    .sort((left, right) => {
      const leftKey = `${left.action}:${left.entityType}:${left.entityId}`;
      const rightKey = `${right.action}:${right.entityType}:${right.entityId}`;
      return leftKey.localeCompare(rightKey);
    });
  expect(normalized).toEqual(normalizedExpected);

  const serialized = JSON.stringify(audits);
  expect(serialized).not.toMatch(
    /"[^"]*(?:tokenHash|rawToken|password|passwordHash|secret)[^"]*"\s*:/i
  );
  expect(serialized).not.toMatch(
    /E11000|duplicate key|Mongo(?:Server|DB)?|write conflict|provider-secret/i
  );
  for (const forbidden of forbiddenValues) {
    expect(serialized).not.toContain(forbidden);
  }
}

async function expectIssuerMutationInvalidatesAccept(
  testId: string,
  mutateIssuer: (issuerId: string) => Promise<unknown>
) {
  const issuerId = `${testId}-super-admin`;
  await insertUser(issuerId, "super_admin", {
    email: `${issuerId}@example.test`,
    version: 4
  });
  await insertPendingInvitation(testId, issuerId, { tokenIssuerVersion: 4 });
  const gate = gatePublicDiscoveries(createMongoRepository(), 1);
  const service = invitationService(gate.repository);

  const accept = service.accept({
    rawToken: RAW_TOKEN,
    password: ACCEPTED_PASSWORD
  });
  await gate.reached;
  await mutateIssuer(issuerId);
  gate.release();

  await expect(accept).rejects.toBeInstanceOf(InvitationUnavailableError);
  expect(await UserModel.countDocuments({ emailNormalized: INVITEE_EMAIL })).toBe(0);
  expect(await AuditEventModel.countDocuments()).toBe(0);
  const invitation = await UserInvitationModel.findById(testId)
    .select("+tokenHash")
    .lean()
    .exec();
  expect(invitation).toMatchObject({
    status: "pending",
    tokenHash: hashUserInvitationToken(RAW_TOKEN),
    tokenGeneration: 1,
    __v: 0
  });
}

describe("user invitation Mongo replica-set races", () => {
  it("A1: two accepts produce one success, one unavailable result, and one staff User", async () => {
    const issuerId = "race-super-admin";
    await insertUser(issuerId, "super_admin", {
      name: "Canonical Super Admin",
      email: "super-admin@example.test",
      version: 7
    });
    await insertPendingInvitation("race-two-accepts", issuerId, {
      tokenIssuerVersion: 7
    });

    const gate = gatePublicDiscoveries(createMongoRepository(), 2);
    const service = invitationService(gate.repository);
    const accepts = [
      service.accept({ rawToken: RAW_TOKEN, password: ACCEPTED_PASSWORD }),
      service.accept({ rawToken: RAW_TOKEN, password: ACCEPTED_PASSWORD })
    ];

    await gate.reached;
    gate.release();
    const settled = await Promise.allSettled(accepts);

    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<{ accepted: true }> =>
        result.status === "fulfilled"
    );
    const rejected = settled.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]!.value).toEqual({ accepted: true });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(InvitationUnavailableError);
    expect(rejected[0]!.reason).toMatchObject({
      status: 410,
      code: "INVITATION_UNAVAILABLE",
      message: "This invitation is unavailable."
    });

    const users = await UserModel.find({ emailNormalized: INVITEE_EMAIL })
      .select("+passwordHash")
      .lean()
      .exec();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: "Race Invitee",
      email: INVITEE_EMAIL,
      emailNormalized: INVITEE_EMAIL,
      role: "designer",
      active: true,
      accountKind: "standard",
      managerId: null,
      authorizedClientIds: []
    });
    expect(users[0]).not.toHaveProperty("title");

    const invitation = await UserInvitationModel.findById("race-two-accepts")
      .select("+tokenHash")
      .lean()
      .exec();
    expect(invitation).toMatchObject({
      status: "accepted",
      tokenHash: null,
      acceptedUserId: users[0]!._id,
      __v: 1
    });

    await expectExactAudits([
      {
        action: "user.invited_created",
        actorId: users[0]!._id,
        entityType: "user",
        entityId: users[0]!._id,
        newValues: {
          invitationId: "race-two-accepts",
          userId: users[0]!._id,
          emailNormalized: INVITEE_EMAIL,
          role: "designer"
        }
      },
      {
        action: "user_invitation.accepted",
        actorId: users[0]!._id,
        entityType: "user_invitation",
        entityId: "race-two-accepts",
        newValues: {
          invitationId: "race-two-accepts",
          acceptedUserId: users[0]!._id,
          emailNormalized: INVITEE_EMAIL,
          role: "designer"
        }
      }
    ], [RAW_TOKEN, ACCEPTED_PASSWORD, ACCEPTED_PASSWORD_HASH]);
    const audits = await AuditEventModel.find().lean().exec();
    const persisted = JSON.stringify({ users, invitation, audits });
    expect(persisted).not.toContain(RAW_TOKEN);
    expect(persisted).not.toContain(ACCEPTED_PASSWORD);
    expect(JSON.stringify(fulfilled[0]!.value)).not.toMatch(/jwt|token|session|user/i);
  });

  it("A2: Client signup versus accept creates one User and never links staff as Client", async () => {
    const issuerId = "signup-race-super-admin";
    await insertUser(issuerId, "super_admin", {
      name: "Canonical Super Admin",
      email: "signup-race-super-admin@example.test",
      version: 3
    });
    await insertPendingInvitation("race-signup-accept", issuerId, {
      tokenIssuerVersion: 3
    });

    const gate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateClientEmail",
      2
    );
    const audit = createAuditService(gate.repository);
    const invitations = createUserInvitationService({
      repository: gate.repository,
      audit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });
    const auth = createAuthService(
      gate.repository,
      {
        jwtSecret: "task-eight-client-signup-race-secret-at-least-32-characters",
        jwtExpiresInSeconds: 900
      },
      { auditService: audit, clock: () => new Date(NOW) }
    );

    const accept = invitations.accept({
      rawToken: RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    });
    const signup = auth.signupClient(
      {
        name: "Race Invitee",
        email: INVITEE_EMAIL,
        mobile: "+91 90000 00000",
        address: "Pune",
        password: ACCEPTED_PASSWORD
      },
      { remoteAddress: "203.0.113.10" }
    );

    await gate.reached;
    gate.release();
    const settled = await Promise.allSettled([accept, signup]);
    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find(({ status }) => status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(
        rejected.reason instanceof InvitationUnavailableError ||
          rejected.reason instanceof AccountExistsError
      ).toBe(true);
    }

    const users = await UserModel.find({ emailNormalized: INVITEE_EMAIL }).lean().exec();
    expect(users).toHaveLength(1);
    expect(["client", "designer"]).toContain(users[0]!.role);
    const project = await ProjectModel.findOne({
      clientEmailNormalized: INVITEE_EMAIL
    }).lean().exec();
    if (users[0]!.role === "designer") {
      expect(users[0]!.accountKind).toBe("standard");
      expect(project?.clientId ?? null).toBeNull();
      expect(
        await ProjectAccessGrantModel.countDocuments({ userId: users[0]!._id })
      ).toBe(0);
    }
    expect(await EmailCoordinationModel.countDocuments({ _id: INVITEE_EMAIL })).toBe(1);
    expect(await UserModel.countDocuments({ role: "super_admin" })).toBe(1);
  });

  it("A2 signup-first: a claimed email leaves the pending invitation revoke-only and publicly unavailable", async () => {
    const issuerId = "signup-first-super-admin";
    const invitationId = "signup-first-invitation";
    await insertUser(issuerId, "super_admin", {
      email: "signup-first-super-admin@example.test",
      version: 3
    });
    await insertPendingInvitation(invitationId, issuerId, {
      tokenIssuerVersion: 3
    });
    const repository = createMongoRepository();
    const audit = createAuditService(repository);
    const auth = createAuthService(
      repository,
      {
        jwtSecret: "task-eight-signup-first-secret-at-least-32-characters",
        jwtExpiresInSeconds: 900
      },
      { auditService: audit, clock: () => new Date(NOW) }
    );
    const invitations = invitationService(repository);

    await auth.signupClient({
      name: "Race Invitee",
      email: INVITEE_EMAIL,
      mobile: "+91 90000 00000",
      address: "Pune",
      password: ACCEPTED_PASSWORD
    }, { remoteAddress: "203.0.113.11" });

    const users = await UserModel.find({ emailNormalized: INVITEE_EMAIL }).lean().exec();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ role: "client", accountKind: "standard" });
    const page = await invitations.list(
      publicUser(issuerId),
      { status: "pending" },
      { limit: 20, offset: 0 }
    );
    expect(page.items).toEqual([
      expect.objectContaining({
        id: invitationId,
        currentLinkAvailable: false,
        availableActions: ["revoke"]
      })
    ]);
    await expect(invitations.inspect(RAW_TOKEN)).rejects.toMatchObject({
      status: 410,
      code: "INVITATION_UNAVAILABLE"
    });
    await expect(invitations.accept({
      rawToken: RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    })).rejects.toMatchObject({
      status: 410,
      code: "INVITATION_UNAVAILABLE"
    });
    expect(await ProjectAccessGrantModel.countDocuments()).toBe(0);
    await expectExactAudits([{
      action: "client_signed_up",
      actorId: users[0]!._id,
      entityType: "user",
      entityId: users[0]!._id,
      newValues: { role: "client", email: INVITEE_EMAIL }
    }], [RAW_TOKEN, ACCEPTED_PASSWORD]);
  });

  it("P1: project create versus invitation create serializes and leaves a revoke-only reservation", async () => {
    const issuerId = "project-create-super-admin";
    await insertUser(issuerId, "super_admin", {
      name: "Canonical Super Admin",
      email: "project-create-super-admin@example.test",
      version: 5
    });
    const projectFixture = await insertProjectActors();
    const gate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateClientEmail",
      2
    );
    const audit = createAuditService(gate.repository);
    const invitations = createUserInvitationService({
      repository: gate.repository,
      audit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      randomBytes: (size) => Buffer.alloc(size, 17),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });
    const projects = createProjectService(
      gate.repository,
      audit,
      () => new Date(NOW)
    );

    const invite = invitations.create(publicUser(issuerId), {
      name: "Race Invitee",
      email: INVITEE_EMAIL,
      role: "designer",
      mobile: "+91 90000 00000"
    });
    const project = projects.create(projectFixture.designer, projectFixture.input);

    await gate.reached;
    gate.release();
    const [inviteResult, projectResult] = await Promise.allSettled([invite, project]);

    expect(projectResult.status).toBe("fulfilled");
    if (inviteResult.status === "rejected") {
      expect(inviteResult.reason).toMatchObject({
        status: 400,
        code: "INVITATION_EMAIL_NOT_ALLOWED"
      });
    }
    expect(await ProjectModel.countDocuments({ clientEmailNormalized: INVITEE_EMAIL })).toBe(1);
    expect(
      await ProjectModel.countDocuments({
        clientEmailNormalized: INVITEE_EMAIL,
        clientId: null
      })
    ).toBe(1);
    expect(await UserModel.countDocuments({ emailNormalized: INVITEE_EMAIL })).toBe(0);
    expect(await UserInvitationModel.countDocuments({
      emailNormalized: INVITEE_EMAIL,
      status: "pending"
    })).toBeLessThanOrEqual(1);

    const stored = await UserInvitationModel.findOne({
      emailNormalized: INVITEE_EMAIL,
      status: "pending"
    }).lean().exec();
    if (stored) {
      const page = await invitations.list(
        publicUser(issuerId),
        {},
        { limit: 20, offset: 0 }
      );
      expect(page.items).toEqual([
        expect.objectContaining({
          id: stored._id,
          currentLinkAvailable: false,
          availableActions: ["revoke"]
        })
      ]);
      await expect(
        invitations.accept({
          rawToken: CREATED_RAW_TOKEN,
          password: ACCEPTED_PASSWORD
        })
      ).rejects.toBeInstanceOf(InvitationUnavailableError);
    }
  });

  it("P2: project create versus resend serializes and makes the pending row revoke-only", async () => {
    const issuerId = "project-resend-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "project-resend-super-admin@example.test",
      version: 4
    });
    await insertPendingInvitation("race-project-resend", issuerId, {
      tokenIssuerVersion: 4
    });
    const projectFixture = await insertProjectActors();
    const gate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateClientEmail",
      2
    );
    const audit = createAuditService(gate.repository);
    const invitations = createUserInvitationService({
      repository: gate.repository,
      audit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      randomBytes: (size) => Buffer.alloc(size, 18),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });
    const projects = createProjectService(
      gate.repository,
      audit,
      () => new Date(NOW)
    );

    const resend = invitations.resend(
      publicUser(issuerId),
      "race-project-resend",
      { version: 1 }
    );
    const project = projects.create(projectFixture.designer, projectFixture.input);
    await gate.reached;
    gate.release();
    const [resendResult, projectResult] = await Promise.allSettled([resend, project]);

    expect(projectResult.status).toBe("fulfilled");
    if (resendResult.status === "rejected") {
      expect(resendResult.reason).toMatchObject({
        code: "INVITATION_NOT_ACTIONABLE"
      });
    }
    const invitation = await UserInvitationModel.findById("race-project-resend")
      .select("+tokenHash")
      .lean()
      .exec();
    expect(invitation).toMatchObject({ status: "pending" });
    expect([1, 2]).toContain(invitation!.tokenGeneration);
    expect(await UserInvitationModel.countDocuments({
      emailNormalized: INVITEE_EMAIL,
      status: "pending"
    })).toBe(1);
    expect(await ProjectModel.countDocuments({
      clientEmailNormalized: INVITEE_EMAIL,
      clientId: null
    })).toBe(1);
    const page = await invitations.list(
      publicUser(issuerId),
      {},
      { limit: 20, offset: 0 }
    );
    expect(page.items[0]).toMatchObject({
      currentLinkAvailable: false,
      availableActions: ["revoke"]
    });
    await expect(invitations.inspect(RAW_TOKEN)).rejects.toBeInstanceOf(
      InvitationUnavailableError
    );
    if (invitation!.tokenGeneration === 2) {
      await expect(invitations.inspect(RESENT_RAW_TOKEN)).rejects.toBeInstanceOf(
        InvitationUnavailableError
      );
    }
  });

  it("P3: project create versus accept cannot leave both staff and an unclaimed project", async () => {
    const issuerId = "project-accept-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "project-accept-super-admin@example.test",
      version: 6
    });
    await insertPendingInvitation("race-project-accept", issuerId, {
      tokenIssuerVersion: 6
    });
    const projectFixture = await insertProjectActors();
    const gate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateClientEmail",
      2
    );
    const audit = createAuditService(gate.repository);
    const invitations = createUserInvitationService({
      repository: gate.repository,
      audit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });
    const projects = createProjectService(
      gate.repository,
      audit,
      () => new Date(NOW)
    );

    const accept = invitations.accept({
      rawToken: RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    });
    const project = projects.create(projectFixture.designer, projectFixture.input);
    await gate.reached;
    gate.release();
    const settled = await Promise.allSettled([accept, project]);

    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const staffCount = await UserModel.countDocuments({
      emailNormalized: INVITEE_EMAIL,
      role: "designer"
    });
    const unclaimedProjectCount = await ProjectModel.countDocuments({
      clientEmailNormalized: INVITEE_EMAIL,
      clientId: null
    });
    expect(staffCount + unclaimedProjectCount).toBe(1);
    expect(staffCount === 1 && unclaimedProjectCount === 1).toBe(false);
    const invitation = await UserInvitationModel.findById("race-project-accept")
      .select("+tokenHash")
      .lean()
      .exec();
    if (staffCount === 1) {
      expect(settled[0]).toMatchObject({ status: "fulfilled", value: { accepted: true } });
      expect(settled[1]!.status).toBe("rejected");
      if (settled[1]!.status === "rejected") {
        expectExactDomainError(settled[1]!.reason, {
          type: ApiError,
          status: 400,
          code: "INVALID_PROJECT",
          message: "Client email is unavailable.",
          fields: { clientEmail: "This email belongs to an internal account." }
        });
      }
      expect(invitation).toMatchObject({ status: "accepted", tokenHash: null });
      const user = await UserModel.findOne({ emailNormalized: INVITEE_EMAIL }).lean().exec();
      await expectExactAudits([
        {
          action: "user.invited_created",
          actorId: user!._id,
          entityType: "user",
          entityId: user!._id,
          newValues: {
            invitationId: "race-project-accept",
            userId: user!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer"
          }
        },
        {
          action: "user_invitation.accepted",
          actorId: user!._id,
          entityType: "user_invitation",
          entityId: "race-project-accept",
          newValues: {
            invitationId: "race-project-accept",
            acceptedUserId: user!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer"
          }
        }
      ], [RAW_TOKEN, ACCEPTED_PASSWORD, ACCEPTED_PASSWORD_HASH]);
    } else {
      expect(settled[1]!.status).toBe("fulfilled");
      expect(settled[0]!.status).toBe("rejected");
      if (settled[0]!.status === "rejected") {
        expectExactDomainError(settled[0]!.reason, {
          type: ApiError,
          status: 410,
          code: "INVITATION_UNAVAILABLE",
          message: "This invitation is unavailable."
        });
      }
      expect(invitation).toMatchObject({ status: "pending" });
      await expect(invitations.inspect(RAW_TOKEN)).rejects.toBeInstanceOf(
        InvitationUnavailableError
      );
      const storedProject = await ProjectModel.findOne({
        clientEmailNormalized: INVITEE_EMAIL
      }).lean().exec();
      await expectExactAudits([{
        action: "project_created",
        actorId: projectFixture.designer.id,
        entityType: "project",
        entityId: storedProject!._id,
        newValues: { name: "Race Project", status: "planning" }
      }], [RAW_TOKEN, ACCEPTED_PASSWORD, ACCEPTED_PASSWORD_HASH]);
    }
  });

  it("T1: revoke versus accept has one terminal winner and clears the token", async () => {
    const issuerId = "revoke-accept-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "revoke-accept-super-admin@example.test",
      version: 2
    });
    await insertPendingInvitation("race-revoke-accept", issuerId, {
      tokenIssuerVersion: 2
    });
    const gate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateAuthorizationMutation",
      2
    );
    const service = invitationService(gate.repository);

    const revoke = service.revoke(publicUser(issuerId), "race-revoke-accept", {
      version: 1
    });
    const accept = service.accept({
      rawToken: RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    });
    await gate.reached;
    gate.release();
    const settled = await Promise.allSettled([revoke, accept]);

    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const invitation = await UserInvitationModel.findById("race-revoke-accept")
      .select("+tokenHash")
      .lean()
      .exec();
    expect(["accepted", "revoked"]).toContain(invitation!.status);
    expect(invitation).toMatchObject({ tokenHash: null, __v: 1 });
    const users = await UserModel.find({ emailNormalized: INVITEE_EMAIL }).lean().exec();
    expect(users).toHaveLength(invitation!.status === "accepted" ? 1 : 0);
    if (invitation!.status === "accepted") {
      expect(settled[1]).toMatchObject({ status: "fulfilled", value: { accepted: true } });
      expect(settled[0]!.status).toBe("rejected");
      if (settled[0]!.status === "rejected") {
        expectExactDomainError(settled[0]!.reason, {
          type: ApiError,
          status: 409,
          code: "INVITATION_NOT_ACTIONABLE",
          message: "The invitation is not actionable."
        });
      }
      await expectExactAudits([
        {
          action: "user.invited_created",
          actorId: users[0]!._id,
          entityType: "user",
          entityId: users[0]!._id,
          newValues: {
            invitationId: "race-revoke-accept",
            userId: users[0]!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer"
          }
        },
        {
          action: "user_invitation.accepted",
          actorId: users[0]!._id,
          entityType: "user_invitation",
          entityId: "race-revoke-accept",
          newValues: {
            invitationId: "race-revoke-accept",
            acceptedUserId: users[0]!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer"
          }
        }
      ], [RAW_TOKEN, ACCEPTED_PASSWORD, ACCEPTED_PASSWORD_HASH]);
    } else {
      expect(settled[0]!.status).toBe("fulfilled");
      expect(settled[1]!.status).toBe("rejected");
      if (settled[1]!.status === "rejected") {
        expectExactDomainError(settled[1]!.reason, {
          type: ApiError,
          status: 410,
          code: "INVITATION_UNAVAILABLE",
          message: "This invitation is unavailable."
        });
      }
      await expectExactAudits([{
        action: "user_invitation.revoked",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: "race-revoke-accept",
        newValues: {
          invitationId: "race-revoke-accept",
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 1,
          expiresAt: new Date(
            Date.parse(NOW) - 120_000 + USER_INVITATION_TTL_MS
          ).toISOString()
        }
      }], [RAW_TOKEN, ACCEPTED_PASSWORD, ACCEPTED_PASSWORD_HASH]);
    }
    await expect(service.inspect(RAW_TOKEN)).rejects.toBeInstanceOf(
      InvitationUnavailableError
    );
  });

  it("T2: resend versus accept has one winner and makes the old token unavailable", async () => {
    const issuerId = "resend-accept-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "resend-accept-super-admin@example.test",
      version: 2
    });
    await insertPendingInvitation("race-resend-accept", issuerId, {
      tokenIssuerVersion: 2
    });
    const gate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateAuthorizationMutation",
      2
    );
    const audit = createAuditService(gate.repository);
    const service = createUserInvitationService({
      repository: gate.repository,
      audit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      randomBytes: (size) => Buffer.alloc(size, 18),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });

    const resend = service.resend(publicUser(issuerId), "race-resend-accept", {
      version: 1
    });
    const accept = service.accept({
      rawToken: RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    });
    await gate.reached;
    gate.release();
    const settled = await Promise.allSettled([resend, accept]);

    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const invitation = await UserInvitationModel.findById("race-resend-accept")
      .select("+tokenHash")
      .lean()
      .exec();
    expect(invitation).toMatchObject({ __v: 1 });
    expect(["pending", "accepted"]).toContain(invitation!.status);
    if (invitation!.status === "pending") {
      expect(settled[0]!.status).toBe("fulfilled");
      expect(settled[1]!.status).toBe("rejected");
      if (settled[1]!.status === "rejected") {
        expectExactDomainError(settled[1]!.reason, {
          type: ApiError,
          status: 410,
          code: "INVITATION_UNAVAILABLE",
          message: "This invitation is unavailable."
        });
      }
      expect(invitation).toMatchObject({ tokenGeneration: 2 });
      await expect(service.inspect(RESENT_RAW_TOKEN)).resolves.toMatchObject({
        email: INVITEE_EMAIL
      });
      await expectExactAudits([
        {
          action: "user_invitation.resent",
          actorId: issuerId,
          entityType: "user_invitation",
          entityId: "race-resend-accept",
          newValues: {
            invitationId: "race-resend-accept",
            emailNormalized: INVITEE_EMAIL,
            role: "designer",
            tokenGeneration: 2,
            expiresAt: new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString(),
            deliveryState: "queued"
          }
        },
        {
          action: "user_invitation.delivery_sent",
          actorId: issuerId,
          entityType: "user_invitation",
          entityId: "race-resend-accept",
          newValues: {
            invitationId: "race-resend-accept",
            emailNormalized: INVITEE_EMAIL,
            role: "designer",
            tokenGeneration: 2,
            expiresAt: new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString(),
            deliveryState: "sent"
          }
        }
      ], [RAW_TOKEN, RESENT_RAW_TOKEN, ACCEPTED_PASSWORD_HASH]);
    } else {
      expect(settled[1]).toMatchObject({ status: "fulfilled", value: { accepted: true } });
      expect(settled[0]!.status).toBe("rejected");
      if (settled[0]!.status === "rejected") {
        expectExactDomainError(settled[0]!.reason, {
          type: ApiError,
          status: 409,
          code: "INVITATION_NOT_ACTIONABLE",
          message: "The invitation is not actionable."
        });
      }
      expect(invitation).toMatchObject({ tokenHash: null });
      const user = await UserModel.findOne({ emailNormalized: INVITEE_EMAIL }).lean().exec();
      expect(user).not.toBeNull();
      await expectExactAudits([
        {
          action: "user.invited_created",
          actorId: user!._id,
          entityType: "user",
          entityId: user!._id,
          newValues: {
            invitationId: "race-resend-accept",
            userId: user!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer"
          }
        },
        {
          action: "user_invitation.accepted",
          actorId: user!._id,
          entityType: "user_invitation",
          entityId: "race-resend-accept",
          newValues: {
            invitationId: "race-resend-accept",
            acceptedUserId: user!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer"
          }
        }
      ], [RAW_TOKEN, ACCEPTED_PASSWORD, ACCEPTED_PASSWORD_HASH]);
    }
    await expect(service.inspect(RAW_TOKEN)).rejects.toBeInstanceOf(
      InvitationUnavailableError
    );
  });

  it("T3/C2: create versus resend issues one generation in the minute and keeps one pending row", async () => {
    const issuerId = "create-resend-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "create-resend-super-admin@example.test",
      version: 2
    });
    await insertPendingInvitation("race-create-resend", issuerId, {
      tokenIssuerVersion: 2
    });
    const createGate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateAuthorizationMutation",
      1
    );
    const resendGate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateAuthorizationMutation",
      1
    );
    const createAudit = createAuditService(createGate.repository);
    const resendAudit = createAuditService(resendGate.repository);
    const createService = createUserInvitationService({
      repository: createGate.repository,
      audit: createAudit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      randomBytes: (size) => Buffer.alloc(size, 18),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });
    const resendService = createUserInvitationService({
      repository: resendGate.repository,
      audit: resendAudit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      randomBytes: (size) => Buffer.alloc(size, 18),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });

    const create = createService.create(publicUser(issuerId), {
      name: "Race Invitee Replacement",
      email: INVITEE_EMAIL,
      role: "designer",
      mobile: "+91 90000 00000"
    });
    const resend = resendService.resend(publicUser(issuerId), "race-create-resend", {
      version: 1
    });
    await Promise.all([createGate.reached, resendGate.reached]);
    createGate.release();
    await expect(create).resolves.toMatchObject({
      status: "pending",
      currentLinkAvailable: true,
      version: 1
    });
    resendGate.release();
    const settled = await Promise.allSettled([create, resend]);

    expect(settled[0]!.status).toBe("fulfilled");
    expect(settled[1]!.status).toBe("rejected");
    if (settled[1]!.status === "rejected") {
      expectExactDomainError(settled[1]!.reason, {
        type: ApiError,
        status: 409,
        code: "INVITATION_NOT_ACTIONABLE",
        message: "The invitation is not actionable."
      });
    }
    expect(await UserInvitationModel.countDocuments({
      emailNormalized: INVITEE_EMAIL,
      status: "pending"
    })).toBe(1);
    const pending = await UserInvitationModel.findOne({
      emailNormalized: INVITEE_EMAIL,
      status: "pending"
    }).select("+tokenHash").lean().exec();
    expect(pending!.issuedAt.toISOString()).toBe(NOW);
    expect(await UserInvitationModel.countDocuments({
      emailNormalized: INVITEE_EMAIL,
      issuedAt: new Date(NOW)
    })).toBe(1);
    const rows = await UserInvitationModel.find({
      emailNormalized: INVITEE_EMAIL
    }).select("+tokenHash").lean().exec();
    expect(rows).toHaveLength(2);
    const old = rows.find(({ _id }) => _id === "race-create-resend");
    expect(old).toMatchObject({
      status: "superseded",
      tokenHash: null,
      tokenGeneration: 1,
      supersededByInvitationId: pending!._id,
      __v: 1
    });
    expect(pending).toMatchObject({
      status: "pending",
      tokenHash: hashUserInvitationToken(RESENT_RAW_TOKEN),
      tokenGeneration: 1,
      __v: 0
    });
    await expect(createService.inspect(RAW_TOKEN)).rejects.toBeInstanceOf(
      InvitationUnavailableError
    );
    await expect(createService.inspect(RESENT_RAW_TOKEN)).resolves.toMatchObject({
      email: INVITEE_EMAIL
    });
    const oldExpiresAt = new Date(
      Date.parse(NOW) - 120_000 + USER_INVITATION_TTL_MS
    ).toISOString();
    const newExpiresAt = new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString();
    await expectExactAudits([
      {
        action: "user_invitation.superseded",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: "race-create-resend",
        newValues: {
          invitationId: "race-create-resend",
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 1,
          expiresAt: oldExpiresAt
        }
      },
      {
        action: "user_invitation.created",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: pending!._id,
        newValues: {
          invitationId: pending!._id,
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 1,
          expiresAt: newExpiresAt,
          deliveryState: "queued"
        }
      },
      {
        action: "user_invitation.delivery_sent",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: pending!._id,
        newValues: {
          invitationId: pending!._id,
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 1,
          expiresAt: newExpiresAt,
          deliveryState: "sent"
        }
      }
    ], [RAW_TOKEN, RESENT_RAW_TOKEN, ACCEPTED_PASSWORD_HASH]);
  });

  it("T4/C3: resend versus resend increments generation and semantic version once", async () => {
    const issuerId = "double-resend-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "double-resend-super-admin@example.test",
      version: 2
    });
    await insertPendingInvitation("race-double-resend", issuerId, {
      tokenIssuerVersion: 2
    });
    const gate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateAuthorizationMutation",
      2
    );
    const audit = createAuditService(gate.repository);
    const service = createUserInvitationService({
      repository: gate.repository,
      audit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      randomBytes: (size) => Buffer.alloc(size, 18),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });

    const resends = [
      service.resend(publicUser(issuerId), "race-double-resend", { version: 1 }),
      service.resend(publicUser(issuerId), "race-double-resend", { version: 1 })
    ];
    await gate.reached;
    gate.release();
    const settled = await Promise.allSettled(resends);

    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const loser = settled.find((result) => result.status === "rejected");
    expect(loser?.status).toBe("rejected");
    if (loser?.status === "rejected") {
      expectExactDomainError(loser.reason, {
        type: ApiError,
        status: 409,
        code: "VERSION_CONFLICT",
        message: "The invitation changed elsewhere."
      });
    }
    const invitation = await UserInvitationModel.findById("race-double-resend")
      .select("+tokenHash")
      .lean()
      .exec();
    expect(invitation).toMatchObject({
      status: "pending",
      tokenGeneration: 2,
      __v: 1
    });
    expect(await UserInvitationModel.countDocuments({
      emailNormalized: INVITEE_EMAIL,
      status: "pending"
    })).toBe(1);
    const expiresAt = new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString();
    await expectExactAudits([
      {
        action: "user_invitation.resent",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: "race-double-resend",
        newValues: {
          invitationId: "race-double-resend",
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 2,
          expiresAt,
          deliveryState: "queued"
        }
      },
      {
        action: "user_invitation.delivery_sent",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: "race-double-resend",
        newValues: {
          invitationId: "race-double-resend",
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 2,
          expiresAt,
          deliveryState: "sent"
        }
      }
    ], [RAW_TOKEN, RESENT_RAW_TOKEN, ACCEPTED_PASSWORD_HASH]);
    await expect(service.inspect(RAW_TOKEN)).rejects.toBeInstanceOf(
      InvitationUnavailableError
    );
  });

  it("I1: out-of-band issuer deactivation after discovery makes accept unavailable", async () => {
    await expectIssuerMutationInvalidatesAccept(
      "race-issuer-deactivated",
      (issuerId) => UserModel.updateOne(
        { _id: issuerId },
        { $set: { active: false }, $inc: { version: 1 } }
      ).exec()
    );
  });

  it("I2: out-of-band issuer role change after discovery makes accept unavailable", async () => {
    await expectIssuerMutationInvalidatesAccept(
      "race-issuer-role",
      (issuerId) => UserModel.updateOne(
        { _id: issuerId },
        { $set: { role: "admin" }, $inc: { version: 1 } }
      ).exec()
    );
    expect(await UserModel.countDocuments({ role: "super_admin" })).toBe(0);
  });

  it("I3: out-of-band issuer version increment after discovery makes accept unavailable", async () => {
    await expectIssuerMutationInvalidatesAccept(
      "race-issuer-version",
      (issuerId) => UserModel.updateOne(
        { _id: issuerId },
        { $inc: { version: 1 } }
      ).exec()
    );
    expect(await UserModel.countDocuments({ role: "super_admin" })).toBe(1);
  });

  it("I4: operator replacement invalidates accept and current Super Admin resend captures its snapshot", async () => {
    const oldIssuerId = "replacement-old-super-admin";
    const newIssuerId = "replacement-current-super-admin";
    await insertUser(oldIssuerId, "super_admin", {
      email: "replacement-old-super-admin@example.test",
      version: 2
    });
    await insertPendingInvitation("race-issuer-replacement", oldIssuerId, {
      tokenIssuerVersion: 2
    });
    const discoveryGate = gatePublicDiscoveries(createMongoRepository(), 1);
    const staleService = invitationService(discoveryGate.repository);
    const staleAccept = staleService.accept({
      rawToken: RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    });
    await discoveryGate.reached;
    await UserModel.updateOne(
      { _id: oldIssuerId },
      { $set: { role: "admin" }, $inc: { version: 1 } }
    ).exec();
    await insertUser(newIssuerId, "super_admin", {
      email: "replacement-current-super-admin@example.test",
      version: 9
    });
    discoveryGate.release();
    await expect(staleAccept).rejects.toBeInstanceOf(InvitationUnavailableError);
    expect(await UserModel.countDocuments({ emailNormalized: INVITEE_EMAIL })).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await UserInvitationModel.findById("race-issuer-replacement")
      .select("+tokenHash")
      .lean()
      .exec()).toMatchObject({
      status: "pending",
      tokenHash: hashUserInvitationToken(RAW_TOKEN),
      tokenGeneration: 1,
      tokenIssuedById: oldIssuerId,
      tokenIssuerVersion: 2,
      __v: 0
    });

    const repository = createMongoRepository();
    const audit = createAuditService(repository);
    const currentService = createUserInvitationService({
      repository,
      audit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      randomBytes: (size) => Buffer.alloc(size, 18),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });
    await expect(
      currentService.resend(
        publicUser(newIssuerId),
        "race-issuer-replacement",
        { version: 1 }
      )
    ).resolves.toMatchObject({
      version: 2,
      currentLinkAvailable: true
    });

    const invitation = await UserInvitationModel.findById("race-issuer-replacement")
      .select("+tokenHash")
      .lean()
      .exec();
    expect(invitation).toMatchObject({
      status: "pending",
      tokenIssuedById: newIssuerId,
      tokenIssuerVersion: 9,
      tokenGeneration: 2,
      __v: 1
    });
    expect(await UserModel.countDocuments({ role: "super_admin" })).toBe(1);
    await expect(currentService.inspect(RAW_TOKEN)).rejects.toBeInstanceOf(
      InvitationUnavailableError
    );
    await expect(currentService.inspect(RESENT_RAW_TOKEN)).resolves.toMatchObject({
      email: INVITEE_EMAIL
    });
    await expect(currentService.accept({
      rawToken: RESENT_RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    })).resolves.toEqual({ accepted: true });
    await expect(currentService.accept({
      rawToken: RESENT_RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    })).rejects.toMatchObject({
      status: 410,
      code: "INVITATION_UNAVAILABLE"
    });
    const acceptedUser = await UserModel.findOne({
      emailNormalized: INVITEE_EMAIL
    }).lean().exec();
    expect(acceptedUser).toMatchObject({
      role: "designer",
      accountKind: "standard",
      active: true
    });
    expect(await UserInvitationModel.findById("race-issuer-replacement")
      .select("+tokenHash")
      .lean()
      .exec()).toMatchObject({
      status: "accepted",
      tokenHash: null,
      acceptedUserId: acceptedUser!._id,
      tokenGeneration: 2,
      tokenIssuedById: newIssuerId,
      tokenIssuerVersion: 9,
      __v: 2
    });
    const expiresAt = new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString();
    await expectExactAudits([
      {
        action: "user_invitation.resent",
        actorId: newIssuerId,
        entityType: "user_invitation",
        entityId: "race-issuer-replacement",
        newValues: {
          invitationId: "race-issuer-replacement",
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 2,
          expiresAt,
          deliveryState: "queued"
        }
      },
      {
        action: "user_invitation.delivery_sent",
        actorId: newIssuerId,
        entityType: "user_invitation",
        entityId: "race-issuer-replacement",
        newValues: {
          invitationId: "race-issuer-replacement",
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 2,
          expiresAt,
          deliveryState: "sent"
        }
      },
      {
        action: "user.invited_created",
        actorId: acceptedUser!._id,
        entityType: "user",
        entityId: acceptedUser!._id,
        newValues: {
          invitationId: "race-issuer-replacement",
          userId: acceptedUser!._id,
          emailNormalized: INVITEE_EMAIL,
          role: "designer"
        }
      },
      {
        action: "user_invitation.accepted",
        actorId: acceptedUser!._id,
        entityType: "user_invitation",
        entityId: "race-issuer-replacement",
        newValues: {
          invitationId: "race-issuer-replacement",
          acceptedUserId: acceptedUser!._id,
          emailNormalized: INVITEE_EMAIL,
          role: "designer"
        }
      }
    ], [RAW_TOKEN, RESENT_RAW_TOKEN, ACCEPTED_PASSWORD, ACCEPTED_PASSWORD_HASH]);
  });

  it("S1: the unique index rejects concurrent second Super Admin repository inserts", async () => {
    await insertUser("unique-original-super-admin", "super_admin", {
      email: "unique-original-super-admin@example.test"
    });
    const repository = createMongoRepository();
    const createSecond = (id: string) => repository.runInTransaction((transaction) =>
      transaction.createUser({
        id,
        name: id,
        email: `${id}@example.test`,
        passwordHash: "not-used-by-race-test",
        role: "super_admin",
        active: true,
        accountKind: "standard",
        address: null,
        managerId: null,
        authorizedClientIds: [],
        createdAt: NOW,
        updatedAt: NOW
      })
    );

    const attempts = await Promise.allSettled([
      createSecond("unique-second-super-admin"),
      createSecond("unique-third-super-admin")
    ]);

    expect(attempts.every(({ status }) => status === "rejected")).toBe(true);
    for (const attempt of attempts) {
      if (attempt.status === "rejected") {
        expect(attempt.reason).toBeInstanceOf(RepositoryConflictError);
        expect(String(attempt.reason)).not.toContain("E11000");
      }
    }
    expect(await UserModel.find({ role: "super_admin" }).lean().exec()).toEqual([
      expect.objectContaining({ _id: "unique-original-super-admin" })
    ]);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("S2: concurrent promotion attempts cannot assign Super Admin through the service boundary", async () => {
    const issuerId = "promotion-boundary-super-admin";
    await Promise.all([
      insertUser(issuerId, "super_admin", {
        email: "promotion-boundary-super-admin@example.test"
      }),
      insertUser("promotion-target-admin", "admin"),
      insertUser("promotion-target-designer", "designer")
    ]);
    const repository = createMongoRepository();
    const service = createUserAdministrationService(
      repository,
      createAuditService(repository),
      () => new Date(NOW)
    );

    const attempts = await Promise.allSettled([
      service.update(publicUser(issuerId), "promotion-target-admin", {
        version: 1,
        role: "super_admin"
      }),
      service.update(publicUser(issuerId), "promotion-target-designer", {
        version: 1,
        role: "super_admin"
      })
    ]);

    expect(attempts.every(({ status }) => status === "rejected")).toBe(true);
    for (const attempt of attempts) {
      if (attempt.status === "rejected") {
        expect(attempt.reason).toMatchObject({
          status: 400,
          code: "ROLE_NOT_MANAGEABLE"
        });
      }
    }
    expect(await UserModel.countDocuments({ role: "super_admin" })).toBe(1);
    expect(await UserModel.findById("promotion-target-admin").lean().exec()).toMatchObject({
      role: "admin",
      version: 1
    });
    expect(await UserModel.findById("promotion-target-designer").lean().exec()).toMatchObject({
      role: "designer",
      version: 1
    });
    expect(await ProjectAccessGrantModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("S3: concurrent sole-Super-Admin demote and deactivate attempts make zero writes", async () => {
    const issuerId = "immutable-sole-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "immutable-sole-super-admin@example.test",
      version: 5
    });
    const before = await UserModel.findById(issuerId).lean().exec();
    const gate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateAuthorizationMutation",
      2
    );
    const service = createUserAdministrationService(
      gate.repository,
      createAuditService(gate.repository),
      () => new Date(NOW)
    );
    const attempts = [
      service.update(publicUser(issuerId), issuerId, {
        version: 5,
        role: "admin"
      }),
      service.update(publicUser(issuerId), issuerId, {
        version: 5,
        active: false
      })
    ];
    await gate.reached;
    gate.release();
    const settled = await Promise.allSettled(attempts);

    expect(settled.every(({ status }) => status === "rejected")).toBe(true);
    for (const result of settled) {
      if (result.status === "rejected") {
        expect(result.reason).toMatchObject({
          status: 409,
          code: "SOLE_SUPER_ADMIN_IMMUTABLE"
        });
      }
    }
    expect(await UserModel.findById(issuerId).lean().exec()).toEqual(before);
    expect(await ProjectAccessGrantModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("C1: concurrent creates issue one generation under first-use email coordination", async () => {
    const issuerId = "cooldown-create-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "cooldown-create-super-admin@example.test",
      version: 3
    });
    const gate = gateTransactionMethod(
      createMongoRepository(),
      "coordinateAuthorizationMutation",
      2
    );
    const audit = createAuditService(gate.repository);
    const service = createUserInvitationService({
      repository: gate.repository,
      audit,
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      randomBytes: (size) => Buffer.alloc(size, 17),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });
    const input = {
      name: "Race Invitee",
      email: INVITEE_EMAIL,
      role: "designer" as const,
      mobile: "+91 90000 00000"
    };
    const creates = [
      service.create(publicUser(issuerId), input),
      service.create(publicUser(issuerId), input)
    ];
    await gate.reached;
    gate.release();
    const settled = await Promise.allSettled(creates);

    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const loser = settled.find(({ status }) => status === "rejected");
    expect(loser?.status).toBe("rejected");
    if (loser?.status === "rejected") {
      expectExactDomainError(loser.reason, {
        type: ApiError,
        status: 429,
        code: "TOO_MANY_ATTEMPTS",
        message: "Please try again later.",
        headers: { "Retry-After": "60" }
      });
    }
    expect(await UserInvitationModel.countDocuments({
      emailNormalized: INVITEE_EMAIL,
      status: "pending"
    })).toBe(1);
    expect(await UserInvitationModel.countDocuments({
      emailNormalized: INVITEE_EMAIL,
      issuedAt: new Date(NOW)
    })).toBe(1);
    expect(await EmailCoordinationModel.countDocuments({ _id: INVITEE_EMAIL })).toBe(1);
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(1);
    const invitation = await UserInvitationModel.findOne({
      emailNormalized: INVITEE_EMAIL,
      status: "pending"
    }).lean().exec();
    const expiresAt = new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString();
    await expectExactAudits([
      {
        action: "user_invitation.created",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: invitation!._id,
        newValues: {
          invitationId: invitation!._id,
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 1,
          expiresAt,
          deliveryState: "queued"
        }
      },
      {
        action: "user_invitation.delivery_sent",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: invitation!._id,
        newValues: {
          invitationId: invitation!._id,
          emailNormalized: INVITEE_EMAIL,
          role: "designer",
          tokenGeneration: 1,
          expiresAt,
          deliveryState: "sent"
        }
      }
    ], [CREATED_RAW_TOKEN, ACCEPTED_PASSWORD_HASH]);
  });

  it.each(["success", "failure"] as const)(
    "D1: deferred generation-one SMTP %s cannot overwrite a completed resend",
    async (completionKind) => {
      const issuerId = `deferred-resend-${completionKind}-super-admin`;
      await insertUser(issuerId, "super_admin", {
        email: `${issuerId}@example.test`,
        version: 3
      });
      let nowMs = Date.parse(NOW);
      const clock = () => new Date(nowMs);
      const repository = createMongoRepository();
      const audit = createAuditService(repository);
      const oldDelivery = controlledMailer();
      const creatingService = createUserInvitationService({
        repository,
        audit,
        mailer: oldDelivery.mailer,
        clock,
        randomBytes: (size) => Buffer.alloc(size, 17),
        passwordHasher: async () => ACCEPTED_PASSWORD_HASH
      });
      const create = creatingService.create(publicUser(issuerId), {
        name: "Race Invitee",
        email: INVITEE_EMAIL,
        role: "designer",
        mobile: "+91 90000 00000"
      });
      await oldDelivery.reached;
      const committed = await UserInvitationModel.findOne({
        emailNormalized: INVITEE_EMAIL
      }).lean().exec();
      expect(committed).toMatchObject({ tokenGeneration: 1, __v: 0 });

      nowMs += 61_000;
      const resendService = createUserInvitationService({
        repository,
        audit,
        mailer: immediateMailer(),
        clock,
        randomBytes: (size) => Buffer.alloc(size, 18),
        passwordHasher: async () => ACCEPTED_PASSWORD_HASH
      });
      await resendService.resend(publicUser(issuerId), String(committed!._id), {
        version: 1
      });
      if (completionKind === "success") oldDelivery.completion.resolve();
      else oldDelivery.completion.reject(new Error("provider-secret-old-generation"));
      const originalResponse = await create;

      const invitation = await UserInvitationModel.findById(committed!._id)
        .select("+tokenHash")
        .lean()
        .exec();
      expect(invitation).toMatchObject({
        status: "pending",
        tokenGeneration: 2,
        tokenHash: hashUserInvitationToken(RESENT_RAW_TOKEN),
        deliveryStatus: "sent",
        __v: 1
      });
      const initialExpiresAt = new Date(
        Date.parse(NOW) + USER_INVITATION_TTL_MS
      ).toISOString();
      const resentExpiresAt = new Date(
        Date.parse(NOW) + 61_000 + USER_INVITATION_TTL_MS
      ).toISOString();
      await expectExactAudits([
        {
          action: "user_invitation.created",
          actorId: issuerId,
          entityType: "user_invitation",
          entityId: committed!._id,
          newValues: {
            invitationId: committed!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer",
            tokenGeneration: 1,
            expiresAt: initialExpiresAt,
            deliveryState: "queued"
          }
        },
        {
          action: "user_invitation.resent",
          actorId: issuerId,
          entityType: "user_invitation",
          entityId: committed!._id,
          newValues: {
            invitationId: committed!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer",
            tokenGeneration: 2,
            expiresAt: resentExpiresAt,
            deliveryState: "queued"
          }
        },
        {
          action: "user_invitation.delivery_sent",
          actorId: issuerId,
          entityType: "user_invitation",
          entityId: committed!._id,
          newValues: {
            invitationId: committed!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer",
            tokenGeneration: 2,
            expiresAt: resentExpiresAt,
            deliveryState: "sent"
          }
        }
      ], [
        CREATED_RAW_TOKEN,
        RESENT_RAW_TOKEN,
        ACCEPTED_PASSWORD_HASH,
        "provider-secret-old-generation"
      ]);
      expect(JSON.stringify({ invitation, originalResponse })).not.toContain(
        "provider-secret-old-generation"
      );
      await expect(resendService.inspect(CREATED_RAW_TOKEN)).rejects.toBeInstanceOf(
        InvitationUnavailableError
      );
      await expect(resendService.inspect(RESENT_RAW_TOKEN)).resolves.toMatchObject({
        email: INVITEE_EMAIL
      });
    }
  );

  it.each(["success", "failure"] as const)(
    "D2: deferred old SMTP %s cannot alter an accepted terminal invitation",
    async (completionKind) => {
      const issuerId = `deferred-accept-${completionKind}-super-admin`;
      await insertUser(issuerId, "super_admin", {
        email: `${issuerId}@example.test`,
        version: 3
      });
      const repository = createMongoRepository();
      const audit = createAuditService(repository);
      const oldDelivery = controlledMailer();
      const creatingService = createUserInvitationService({
        repository,
        audit,
        mailer: oldDelivery.mailer,
        clock: () => new Date(NOW),
        randomBytes: (size) => Buffer.alloc(size, 17),
        passwordHasher: async () => ACCEPTED_PASSWORD_HASH
      });
      const create = creatingService.create(publicUser(issuerId), {
        name: "Race Invitee",
        email: INVITEE_EMAIL,
        role: "designer",
        mobile: "+91 90000 00000"
      });
      await oldDelivery.reached;
      const committed = await UserInvitationModel.findOne({
        emailNormalized: INVITEE_EMAIL
      }).lean().exec();
      const service = invitationService(repository);
      await service.accept({
        rawToken: CREATED_RAW_TOKEN,
        password: ACCEPTED_PASSWORD
      });
      if (completionKind === "success") oldDelivery.completion.resolve();
      else oldDelivery.completion.reject(new Error("provider-secret-old-generation"));
      const originalResponse = await create;

      const invitation = await UserInvitationModel.findById(committed!._id)
        .select("+tokenHash")
        .lean()
        .exec();
      expect(invitation).toMatchObject({
        status: "accepted",
        tokenHash: null,
        tokenGeneration: 1,
        deliveryStatus: "queued",
        deliveryAttemptedAt: null,
        sentAt: null,
        deliveryFailureCode: null,
        __v: 1
      });
      const users = await UserModel.find({ emailNormalized: INVITEE_EMAIL }).lean().exec();
      expect(users).toHaveLength(1);
      const expiresAt = new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString();
      await expectExactAudits([
        {
          action: "user_invitation.created",
          actorId: issuerId,
          entityType: "user_invitation",
          entityId: committed!._id,
          newValues: {
            invitationId: committed!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer",
            tokenGeneration: 1,
            expiresAt,
            deliveryState: "queued"
          }
        },
        {
          action: "user.invited_created",
          actorId: users[0]!._id,
          entityType: "user",
          entityId: users[0]!._id,
          newValues: {
            invitationId: committed!._id,
            userId: users[0]!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer"
          }
        },
        {
          action: "user_invitation.accepted",
          actorId: users[0]!._id,
          entityType: "user_invitation",
          entityId: committed!._id,
          newValues: {
            invitationId: committed!._id,
            acceptedUserId: users[0]!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer"
          }
        }
      ], [
        CREATED_RAW_TOKEN,
        ACCEPTED_PASSWORD,
        ACCEPTED_PASSWORD_HASH,
        "provider-secret-old-generation"
      ]);
      expect(JSON.stringify({ invitation, originalResponse })).not.toContain(
        "provider-secret-old-generation"
      );
    }
  );

  it.each(["success", "failure"] as const)(
    "D3: deferred old SMTP %s cannot alter a revoked terminal invitation",
    async (completionKind) => {
      const issuerId = `deferred-revoke-${completionKind}-super-admin`;
      await insertUser(issuerId, "super_admin", {
        email: `${issuerId}@example.test`,
        version: 3
      });
      const repository = createMongoRepository();
      const audit = createAuditService(repository);
      const oldDelivery = controlledMailer();
      const creatingService = createUserInvitationService({
        repository,
        audit,
        mailer: oldDelivery.mailer,
        clock: () => new Date(NOW),
        randomBytes: (size) => Buffer.alloc(size, 17),
        passwordHasher: async () => ACCEPTED_PASSWORD_HASH
      });
      const create = creatingService.create(publicUser(issuerId), {
        name: "Race Invitee",
        email: INVITEE_EMAIL,
        role: "designer",
        mobile: "+91 90000 00000"
      });
      await oldDelivery.reached;
      const committed = await UserInvitationModel.findOne({
        emailNormalized: INVITEE_EMAIL
      }).lean().exec();
      const service = invitationService(repository);
      await service.revoke(publicUser(issuerId), String(committed!._id), { version: 1 });
      if (completionKind === "success") oldDelivery.completion.resolve();
      else oldDelivery.completion.reject(new Error("provider-secret-old-generation"));
      const originalResponse = await create;

      const invitation = await UserInvitationModel.findById(committed!._id)
        .select("+tokenHash")
        .lean()
        .exec();
      expect(invitation).toMatchObject({
        status: "revoked",
        tokenHash: null,
        tokenGeneration: 1,
        deliveryStatus: "queued",
        deliveryAttemptedAt: null,
        sentAt: null,
        deliveryFailureCode: null,
        __v: 1
      });
      expect(await UserModel.countDocuments({ emailNormalized: INVITEE_EMAIL })).toBe(0);
      const expiresAt = new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString();
      await expectExactAudits([
        {
          action: "user_invitation.created",
          actorId: issuerId,
          entityType: "user_invitation",
          entityId: committed!._id,
          newValues: {
            invitationId: committed!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer",
            tokenGeneration: 1,
            expiresAt,
            deliveryState: "queued"
          }
        },
        {
          action: "user_invitation.revoked",
          actorId: issuerId,
          entityType: "user_invitation",
          entityId: committed!._id,
          newValues: {
            invitationId: committed!._id,
            emailNormalized: INVITEE_EMAIL,
            role: "designer",
            tokenGeneration: 1,
            expiresAt
          }
        }
      ], [
        CREATED_RAW_TOKEN,
        ACCEPTED_PASSWORD_HASH,
        "provider-secret-old-generation"
      ]);
      expect(JSON.stringify({ invitation, originalResponse })).not.toContain(
        "provider-secret-old-generation"
      );
    }
  );

  it("R1: two signup callers collide on first EmailCoordination use without duplicate effects", async () => {
    const gate = gateFirstCoordinationByCaller("coordinateClientEmail", 2);
    const services = gate.repositories.map((repository, index) =>
      createAuthService(
        repository,
        {
          jwtSecret: `task-eight-r1-caller-${index}-secret-at-least-32-characters`,
          jwtExpiresInSeconds: 900
        },
        {
          auditService: createAuditService(repository),
          clock: () => new Date(NOW)
        }
      )
    );
    const signups = services.map((service, index) => service.signupClient({
      name: `R1 Client ${index}`,
      email: INVITEE_EMAIL,
      mobile: "+91 90000 00000",
      address: "Pune",
      password: ACCEPTED_PASSWORD
    }, { remoteAddress: `203.0.113.${20 + index}` }));

    await gate.reached;
    await replica.admin().command({
      configureFailPoint: "failCommand",
      mode: { times: 1 },
      data: {
        failCommands: ["update"],
        errorCode: 11000,
        errorExtraInfo: {
          keyPattern: { _id: 1 },
          keyValue: { _id: INVITEE_EMAIL }
        }
      }
    });
    let settled: PromiseSettledResult<Awaited<(typeof signups)[number]>>[];
    try {
      gate.release(0);
      await signups[0];
      gate.release(1);
      settled = await Promise.allSettled(signups);
    } finally {
      await replica.admin().command({
        configureFailPoint: "failCommand",
        mode: "off"
      });
    }

    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<Awaited<(typeof signups)[number]>> =>
        result.status === "fulfilled"
    );
    const rejected = settled.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]!.value.user).toMatchObject({
      email: INVITEE_EMAIL,
      role: "client"
    });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(AccountExistsError);
    expect(rejected[0]!.reason).toMatchObject({
      name: "AccountExistsError",
      message: "An account already exists for this email."
    });
    expect(String(rejected[0]!.reason)).not.toMatch(
      /E11000|duplicate key|Mongo(?:Server|DB)?|write conflict|transaction/i
    );
    expect([...gate.attempts].sort()).toEqual([1, 2]);
    const coordination = await EmailCoordinationModel.find({
      _id: INVITEE_EMAIL
    }).lean().exec();
    expect(coordination).toEqual([expect.objectContaining({
      _id: INVITEE_EMAIL,
      revision: 1
    })]);
    const users = await UserModel.find({ emailNormalized: INVITEE_EMAIL }).lean().exec();
    expect(users).toHaveLength(1);
    expect(await ProjectAccessGrantModel.countDocuments()).toBe(0);
    await expectExactAudits([{
      action: "client_signed_up",
      actorId: users[0]!._id,
      entityType: "user",
      entityId: users[0]!._id,
      newValues: { role: "client", email: INVITEE_EMAIL }
    }], [ACCEPTED_PASSWORD, ACCEPTED_PASSWORD_HASH]);
  });

  it("R2: two invitation callers collide on first AuthorizationCoordination use without duplicate effects", async () => {
    const issuerId = "r2-collision-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "r2-collision-super-admin@example.test",
      version: 4
    });
    const gate = gateFirstCoordinationByCaller("coordinateAuthorizationMutation", 2);
    const emails = ["r2-first@example.test", "r2-second@example.test"];
    const services = gate.repositories.map((repository, index) =>
      createUserInvitationService({
        repository,
        audit: createAuditService(repository),
        mailer: immediateMailer(),
        clock: () => new Date(NOW),
        randomBytes: (size) => Buffer.alloc(size, 61 + index),
        passwordHasher: async () => ACCEPTED_PASSWORD_HASH
      })
    );
    const creates = services.map((service, index) => service.create(
      publicUser(issuerId),
      {
        name: `R2 Invitee ${index}`,
        email: emails[index]!,
        role: "designer",
        mobile: "+91 90000 00000"
      }
    ));

    await gate.reached;
    await replica.admin().command({
      configureFailPoint: "failCommand",
      mode: { times: 1 },
      data: {
        failCommands: ["update"],
        errorCode: 11000,
        errorExtraInfo: {
          keyPattern: { _id: 1 },
          keyValue: { _id: "authorization" }
        }
      }
    });
    let settled: PromiseSettledResult<Awaited<(typeof creates)[number]>>[];
    try {
      gate.release(0);
      await creates[0];
      gate.release(1);
      settled = await Promise.allSettled(creates);
    } finally {
      await replica.admin().command({
        configureFailPoint: "failCommand",
        mode: "off"
      });
    }

    expect(settled.every(({ status }) => status === "fulfilled")).toBe(true);
    expect([...gate.attempts].sort()).toEqual([1, 2]);
    expect(await AuthorizationCoordinationModel.find().lean().exec()).toEqual([
      expect.objectContaining({ _id: "authorization", revision: 2 })
    ]);
    expect(await UserModel.countDocuments({ role: "super_admin" })).toBe(1);
    expect(await UserInvitationModel.countDocuments({ status: "pending" })).toBe(2);
    const invitations = await UserInvitationModel.find().lean().exec();
    expect(invitations.map(({ emailNormalized }) => emailNormalized).sort()).toEqual(emails);
    const expiresAt = new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString();
    await expectExactAudits(invitations.flatMap((invitation) => [
      {
        action: "user_invitation.created",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: invitation._id,
        newValues: {
          invitationId: invitation._id,
          emailNormalized: invitation.emailNormalized,
          role: "designer",
          tokenGeneration: 1,
          expiresAt,
          deliveryState: "queued"
        }
      },
      {
        action: "user_invitation.delivery_sent",
        actorId: issuerId,
        entityType: "user_invitation",
        entityId: invitation._id,
        newValues: {
          invitationId: invitation._id,
          emailNormalized: invitation.emailNormalized,
          role: "designer",
          tokenGeneration: 1,
          expiresAt,
          deliveryState: "sent"
        }
      }
    ]), [ACCEPTED_PASSWORD_HASH]);
    expect(JSON.stringify(settled)).not.toMatch(
      /E11000|duplicate key|Mongo(?:Server|DB)?|write conflict|transaction/i
    );
  });

  it("F1: a forced create audit failure rolls back invitation state and delivery", async () => {
    const issuerId = "audit-create-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "audit-create-super-admin@example.test",
      version: 2
    });
    const repository = createMongoRepository();
    const sendInvitation = vi.fn(async () => undefined);
    const service = createUserInvitationService({
      repository,
      audit: auditFailingOn(repository, "user_invitation.created"),
      mailer: { deliveryKind: "local_test", sendInvitation },
      clock: () => new Date(NOW),
      randomBytes: (size) => Buffer.alloc(size, 17),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });

    await expect(service.create(publicUser(issuerId), {
      name: "Race Invitee",
      email: INVITEE_EMAIL,
      role: "designer",
      mobile: "+91 90000 00000"
    })).rejects.toBeInstanceOf(RepositoryConflictError);

    expect(await UserInvitationModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(sendInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ["resend", "user_invitation.resent"],
    ["revoke", "user_invitation.revoked"]
  ] as const)(
    "F1: a forced %s audit failure rolls back the semantic invitation transition",
    async (operation, auditAction) => {
      const issuerId = `audit-${operation}-super-admin`;
      const invitationId = `audit-${operation}-invitation`;
      await insertUser(issuerId, "super_admin", {
        email: `${issuerId}@example.test`,
        version: 2
      });
      await insertPendingInvitation(invitationId, issuerId, {
        tokenIssuerVersion: 2
      });
      const before = await UserInvitationModel.findById(invitationId)
        .select("+tokenHash")
        .lean()
        .exec();
      const repository = createMongoRepository();
      const sendInvitation = vi.fn(async () => undefined);
      const service = createUserInvitationService({
        repository,
        audit: auditFailingOn(repository, auditAction),
        mailer: { deliveryKind: "local_test", sendInvitation },
        clock: () => new Date(NOW),
        randomBytes: (size) => Buffer.alloc(size, 18),
        passwordHasher: async () => ACCEPTED_PASSWORD_HASH
      });

      const result = operation === "resend"
        ? service.resend(publicUser(issuerId), invitationId, { version: 1 })
        : service.revoke(publicUser(issuerId), invitationId, { version: 1 });
      await expect(result).rejects.toBeInstanceOf(RepositoryConflictError);
      expect(await UserInvitationModel.findById(invitationId)
        .select("+tokenHash")
        .lean()
        .exec()).toEqual(before);
      expect(await AuditEventModel.countDocuments()).toBe(0);
      expect(sendInvitation).not.toHaveBeenCalled();
    }
  );

  it("F2: a forced second acceptance audit failure rolls back User and invitation, then retry succeeds once", async () => {
    const issuerId = "audit-accept-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "audit-accept-super-admin@example.test",
      version: 2
    });
    await insertPendingInvitation("audit-accept-invitation", issuerId, {
      tokenIssuerVersion: 2
    });
    const before = await UserInvitationModel.findById("audit-accept-invitation")
      .select("+tokenHash")
      .lean()
      .exec();
    const repository = createMongoRepository();
    const failingService = createUserInvitationService({
      repository,
      audit: auditFailingOn(repository, "user_invitation.accepted"),
      mailer: immediateMailer(),
      clock: () => new Date(NOW),
      passwordHasher: async () => ACCEPTED_PASSWORD_HASH
    });

    await expect(failingService.accept({
      rawToken: RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    })).rejects.toBeInstanceOf(InvitationUnavailableError);
    expect(await UserModel.countDocuments({ emailNormalized: INVITEE_EMAIL })).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await UserInvitationModel.findById("audit-accept-invitation")
      .select("+tokenHash")
      .lean()
      .exec()).toEqual(before);

    await expect(invitationService(repository).accept({
      rawToken: RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    })).resolves.toEqual({ accepted: true });
    expect(await UserModel.countDocuments({ emailNormalized: INVITEE_EMAIL })).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(2);
  });

  it("V1: all six presentation filters are disjoint, ordered, and safely projected", async () => {
    const issuerId = "presentation-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "presentation-super-admin@example.test"
    });
    const fixtures = [
      ["presentation-pending-z", "pending", "2026-08-24T11:59:00.000Z", 51],
      ["presentation-pending-a", "pending", "2026-08-24T11:59:00.000Z", 57],
      ["presentation-pending-old", "pending", "2026-08-24T11:54:00.000Z", 58],
      ["presentation-failed", "delivery_failed", "2026-08-24T11:58:00.000Z", 52],
      ["presentation-expired", "expired", "2026-08-23T11:59:59.000Z", 53],
      ["presentation-accepted", "accepted", "2026-08-24T11:57:00.000Z", 54],
      ["presentation-revoked", "revoked", "2026-08-24T11:56:00.000Z", 55],
      ["presentation-superseded", "superseded", "2026-08-24T11:55:00.000Z", 56]
    ] as const;
    for (const [id, presentation, issuedAt, tokenByte] of fixtures) {
      await insertPresentationInvitation(
        id,
        issuerId,
        presentation,
        issuedAt,
        tokenByte
      );
    }
    const service = invitationService();
    const actor = publicUser(issuerId);
    const pagination = { limit: 20, offset: 0 };

    const omitted = await service.list(actor, {}, pagination);
    expect(omitted.items.map(({ id }) => id)).toEqual([
      "presentation-pending-z",
      "presentation-pending-a",
      "presentation-failed",
      "presentation-pending-old",
      "presentation-expired"
    ]);
    const expectedPendingOrder = [
      "presentation-pending-z",
      "presentation-pending-a",
      "presentation-pending-old"
    ];
    const pendingFirstRead = await service.list(
      actor,
      { status: "pending" },
      pagination
    );
    const pendingSecondRead = await service.list(
      actor,
      { status: "pending" },
      pagination
    );
    expect(pendingFirstRead.items.map(({ id }) => id)).toEqual(expectedPendingOrder);
    expect(pendingSecondRead.items.map(({ id }) => id)).toEqual(expectedPendingOrder);
    const pendingPages = await Promise.all([0, 1, 2].map((offset) =>
      service.list(actor, { status: "pending" }, { limit: 1, offset })
    ));
    expect(pendingPages.flatMap(({ items }) => items.map(({ id }) => id))).toEqual(
      expectedPendingOrder
    );
    expect(pendingPages.map(({ total }) => total)).toEqual([3, 3, 3]);

    for (const [id, presentation] of fixtures.filter(
      (fixture) => fixture[1] !== "pending"
    )) {
      const filtered = await service.list(actor, { status: presentation }, pagination);
      expect(filtered.items.map((item) => [item.id, item.status])).toEqual([
        [id, presentation]
      ]);
      expect(Object.keys(filtered.items[0]!).sort()).toEqual([
        "availableActions",
        "createdAt",
        "currentLinkAvailable",
        "deliveryAttemptedAt",
        "deliveryStatus",
        "email",
        "expiresAt",
        "id",
        "invitedBy",
        "issuedAt",
        "mobile",
        "name",
        "role",
        "sentAt",
        "status",
        "updatedAt",
        "version"
      ]);
      expect(JSON.stringify(filtered)).not.toMatch(
        /tokenHash|rawToken|passwordHash|acceptedUserId|deliveryFailureCode|tokenIssuer/i
      );
    }
    for (const item of pendingFirstRead.items) {
      expect(Object.keys(item).sort()).toEqual([
        "availableActions",
        "createdAt",
        "currentLinkAvailable",
        "deliveryAttemptedAt",
        "deliveryStatus",
        "email",
        "expiresAt",
        "id",
        "invitedBy",
        "issuedAt",
        "mobile",
        "name",
        "role",
        "sentAt",
        "status",
        "updatedAt",
        "version"
      ]);
    }
    expect(JSON.stringify({ pendingFirstRead, pendingSecondRead, pendingPages })).not.toMatch(
      /tokenHash|rawToken|passwordHash|acceptedUserId|deliveryFailureCode|tokenIssuer/i
    );
  });

  it("V2: accepted secrets stay absent from Mongo, DTOs, errors, and captured output", async () => {
    const issuerId = "secret-redaction-super-admin";
    await insertUser(issuerId, "super_admin", {
      email: "secret-redaction-super-admin@example.test",
      version: 2
    });
    await insertPendingInvitation("secret-redaction-invitation", issuerId, {
      tokenIssuerVersion: 2
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const consoleOutput: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    const captureConsole = (...args: unknown[]) => {
      consoleOutput.push(args.map((argument) => {
        if (argument instanceof Error) {
          return `${argument.name}: ${argument.message} ${JSON.stringify(argument)}`;
        }
        if (typeof argument === "string") return argument;
        try {
          return JSON.stringify(argument);
        } catch {
          return String(argument);
        }
      }).join(" "));
    };
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(captureConsole),
      vi.spyOn(console, "info").mockImplementation(captureConsole),
      vi.spyOn(console, "warn").mockImplementation(captureConsole),
      vi.spyOn(console, "error").mockImplementation(captureConsole)
    ];
    const service = invitationService();
    let accepted: { accepted: true } | undefined;
    let replayError: unknown;
    try {
      accepted = await service.accept({
        rawToken: RAW_TOKEN,
        password: ACCEPTED_PASSWORD
      });
      try {
        await service.accept({
          rawToken: RAW_TOKEN,
          password: ACCEPTED_PASSWORD
        });
      } catch (error) {
        replayError = error;
      }
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      for (const spy of consoleSpies) spy.mockRestore();
    }

    const persisted = {
      users: await UserModel.find().select("+passwordHash").lean().exec(),
      invitations: await UserInvitationModel.find().select("+tokenHash").lean().exec(),
      audits: await AuditEventModel.find().lean().exec()
    };
    const exposed = JSON.stringify({
      accepted,
      replayError,
      persisted,
      stdout,
      stderr,
      consoleOutput
    });
    expect(accepted).toEqual({ accepted: true });
    expect(replayError).toBeInstanceOf(InvitationUnavailableError);
    expect(exposed).not.toContain(RAW_TOKEN);
    expect(exposed).not.toContain(ACCEPTED_PASSWORD);
    const capturedOutput = stdout.join("") + stderr.join("") + consoleOutput.join("");
    expect(JSON.stringify({
      accepted,
      replayError,
      stdout,
      stderr,
      consoleOutput
    })).not.toContain(ACCEPTED_PASSWORD_HASH);
    expect(capturedOutput).not.toContain(RAW_TOKEN);
    expect(capturedOutput).not.toContain(ACCEPTED_PASSWORD);
    expect(capturedOutput).not.toContain(ACCEPTED_PASSWORD_HASH);
    expect(capturedOutput).not.toMatch(
      /token|password|secret|E11000|duplicate key|write conflict|transaction aborted/i
    );
  });
});
