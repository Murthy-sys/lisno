import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { PROJECT_MODULES } from "../src/domain/authorization.js";
import {
  INVITABLE_ROLE_CODES,
  USER_INVITATION_TTL_MS,
  hashUserInvitationToken
} from "../src/domain/user-invitations.js";
import { ROLE_CODES, type Role } from "../src/domain/roles.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository,
  type NewUser,
  type SeedData,
  type UserInvitationRecord,
  type UserRecord
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import {
  createAuditService,
  type AuditService,
  type AuditWrite
} from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import type { InvitationMailer } from "../src/services/invitation-mailer.js";
import { createSmtpInvitationMailer } from "../src/services/smtp-invitation-mailer.js";
import { createUserInvitationService } from "../src/services/user-invitation.service.js";
import { startTricklingSmtpServer } from "./helpers/trickling-smtp-server.js";

const NOW = "2026-08-24T12:00:00.000Z";
const MINUTE = 60_000;
const PUBLIC_RAW_TOKEN = Buffer.alloc(32, 41).toString("base64url");
const REPLACEMENT_RAW_TOKEN = Buffer.alloc(32, 42).toString("base64url");
const ACCEPTED_PASSWORD = "StrongInvitationPassword!23";
const ACCEPTED_PASSWORD_HASH = "$2b$12$accepted-invitation-password-hash";

function invitationHash(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

function invitation(
  id: string,
  operator: UserRecord,
  overrides: Partial<UserInvitationRecord> = {}
): UserInvitationRecord {
  const issuedAt = new Date(Date.parse(NOW) - 2 * MINUTE).toISOString();
  return {
    id,
    name: `Invitee ${id}`,
    email: `${id}@example.test`,
    emailNormalized: `${id}@example.test`,
    role: "designer",
    mobile: "+91 90000 00000",
    tokenHash: invitationHash(id),
    tokenGeneration: 1,
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + USER_INVITATION_TTL_MS).toISOString(),
    status: "pending",
    invitedById: operator.id,
    tokenIssuedById: operator.id,
    tokenIssuerVersion: operator.version,
    acceptedUserId: null,
    acceptedAt: null,
    revokedById: null,
    revokedAt: null,
    supersededByInvitationId: null,
    supersededAt: null,
    deliveryStatus: "queued",
    deliveryAttemptedAt: null,
    sentAt: null,
    deliveryFailureCode: null,
    version: 1,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    ...overrides
  };
}

function terminalInvitation(
  id: string,
  operator: UserRecord,
  status: "accepted" | "revoked" | "superseded"
): UserInvitationRecord {
  const terminalAt = new Date(Date.parse(NOW) - MINUTE).toISOString();
  const base = invitation(id, operator);
  return {
    ...base,
    tokenHash: null,
    status,
    ...(status === "accepted"
      ? { acceptedUserId: `accepted-${id}`, acceptedAt: terminalAt }
      : {}),
    ...(status === "revoked"
      ? { revokedById: operator.id, revokedAt: terminalAt }
      : {}),
    ...(status === "superseded"
      ? { supersededByInvitationId: `successor-${id}`, supersededAt: terminalAt }
      : {}),
    version: 2,
    updatedAt: terminalAt
  };
}

function publicInvitation(
  id: string,
  operator: UserRecord,
  rawToken = PUBLIC_RAW_TOKEN,
  overrides: Partial<UserInvitationRecord> = {}
): UserInvitationRecord {
  return invitation(id, operator, {
    tokenHash: hashUserInvitationToken(rawToken),
    ...overrides
  });
}

function standardSeed(): { seed: SeedData; operator: UserRecord } {
  const seed = structuredClone(demoSeedData);
  const canonical = seed.users.find(({ role }) => role === "super_admin")!;
  const operator: UserRecord = {
    ...canonical,
    id: "operator-super-admin",
    name: "Primary Operator",
    email: "operator@company.test",
    emailNormalized: "operator@company.test",
    accountKind: "standard",
    active: true,
    version: 7
  };
  seed.users = seed.users.map((user) =>
    user.role === "super_admin" ? operator : user
  );
  seed.userInvitations = [];
  seed.auditEvents = [];
  return { seed, operator };
}

function publicUser(user: UserRecord, role: Role = user.role): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role
  };
}

function localMailer() {
  const sendInvitation = vi.fn(async () => undefined);
  return {
    mailer: { deliveryKind: "local_test", sendInvitation } as InvitationMailer,
    sendInvitation
  };
}

function randomSource() {
  let next = 1;
  return vi.fn((_size: number) => Buffer.alloc(32, next++));
}

function setup(
  seed = standardSeed().seed,
  options: {
    mailer?: InvitationMailer;
    audit?: AuditService;
    randomBytes?: (size: number) => Buffer;
    clock?: () => Date;
    passwordHasher?: (password: string, cost: number) => Promise<string>;
  } = {}
) {
  const repository = createMemoryRepository(seed);
  const audit = options.audit ?? createAuditService(repository);
  const local = localMailer();
  const service = createUserInvitationService({
    repository,
    audit,
    mailer: options.mailer ?? local.mailer,
    clock: options.clock ?? (() => new Date(NOW)),
    randomBytes: options.randomBytes ?? randomSource(),
    ...(options.passwordHasher ? { passwordHasher: options.passwordHasher } : {})
  });
  return { repository, audit, service, sendInvitation: local.sendInvitation };
}

const createInput = {
  name: "  Asha  Rao  ",
  email: "  ASHA@Example.Test  ",
  role: "designer" as const,
  mobile: " +91  90000  00000 "
};

async function invitationAudits(repository: AppRepository) {
  return (
    await repository.pageAuditEvents(
      { entityType: "user_invitation" },
      { limit: 100, offset: 0 }
    )
  ).items;
}

describe("protected user invitation administration", () => {
  it("fails closed when delivery is disabled before randomness, transaction, audit, or mail work", async () => {
    const { seed, operator } = standardSeed();
    const repository = createMemoryRepository(seed);
    const transaction = vi.spyOn(repository, "runInTransaction");
    const randomBytes = randomSource();
    const audit = { append: vi.fn() } as unknown as AuditService;
    const service = createUserInvitationService({
      repository,
      audit,
      mailer: { deliveryKind: "disabled" },
      clock: () => new Date(NOW),
      randomBytes
    });

    await expect(service.create(publicUser(operator), createInput)).rejects.toMatchObject({
      status: 503,
      code: "INVITATION_DELIVERY_UNAVAILABLE"
    });
    expect(randomBytes).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
    expect(seed.userInvitations).toEqual([]);
  });

  it.each(ROLE_CODES.filter((role) => role !== "super_admin"))(
    "denies a stored %s before creating invitation state",
    async (role) => {
      const { seed, operator } = standardSeed();
      const stored = seed.users.find((user) => user.role === role)!;
      const { repository, service, sendInvitation } = setup(seed);

      await expect(service.create(publicUser(stored), createInput)).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN"
      });
      await expect(
        repository.pageUserInvitations({}, { limit: 20, offset: 0 }, NOW)
      ).resolves.toMatchObject({ total: 0 });
      expect(await invitationAudits(repository)).toEqual([]);
      expect(sendInvitation).not.toHaveBeenCalled();
      expect(operator.role).toBe("super_admin");
    }
  );

  it("rejects inactive and stale-role actors before persistence", async () => {
    for (const kind of ["inactive", "stale"] as const) {
      const { seed, operator } = standardSeed();
      if (kind === "inactive") {
        seed.users = seed.users.map((user) =>
          user.id === operator.id ? { ...user, active: false } : user
        );
      }
      const { repository, service } = setup(seed);
      const actor = publicUser(operator, kind === "stale" ? "admin" : "super_admin");

      await expect(service.create(actor, createInput)).rejects.toMatchObject({
        status: 401,
        code: "INVALID_TOKEN"
      });
      expect((await repository.pageUserInvitations({}, { limit: 20, offset: 0 }, NOW)).total).toBe(0);
    }
  });

  it("protects list, resend, and revoke at the service boundary", async () => {
    const { seed, operator } = standardSeed();
    const pending = invitation("protected", operator);
    seed.userInvitations = [pending];
    const admin = seed.users.find(({ role }) => role === "admin")!;
    const { repository, service, sendInvitation } = setup(seed);

    const operations = [
      service.list(publicUser(admin), {}, { limit: 20, offset: 0 }),
      service.resend(publicUser(admin), pending.id, { version: pending.version }),
      service.revoke(publicUser(admin), pending.id, { version: pending.version })
    ];
    for (const operation of operations) {
      await expect(operation).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN"
      });
    }
    expect(await repository.findUserInvitationById(pending.id)).toEqual(pending);
    expect(await invitationAudits(repository)).toEqual([]);
    expect(sendInvitation).not.toHaveBeenCalled();
  });

  it("lists exact redacted roles, six statuses, link availability, and ownership-safe actions", async () => {
    const { seed, operator } = standardSeed();
    const failed = invitation("failed", operator, {
      deliveryStatus: "failed",
      deliveryAttemptedAt: new Date(Date.parse(NOW) - MINUTE).toISOString(),
      deliveryFailureCode: "SMTP_TIMEOUT"
    });
    const expiredIssued = new Date(Date.parse(NOW) - USER_INVITATION_TTL_MS - MINUTE).toISOString();
    const expired = invitation("expired", operator, {
      issuedAt: expiredIssued,
      expiresAt: new Date(Date.parse(expiredIssued) + USER_INVITATION_TTL_MS).toISOString(),
      createdAt: expiredIssued,
      updatedAt: expiredIssued
    });
    const invalidated = invitation("invalidated", operator, {
      tokenIssuedById: "retired-super-admin",
      tokenIssuerVersion: 99
    });
    const claimed = invitation("claimed", operator, {
      email: "claimed@company.test",
      emailNormalized: "claimed@company.test"
    });
    const claimant = structuredClone(seed.users.find((user) => user.role === "designer")!);
    seed.users.push({
      ...claimant,
      id: "claimed-user",
      email: claimed.email,
      emailNormalized: claimed.emailNormalized,
      role: "designer",
      accountKind: "standard"
    });
    const reserved = invitation("reserved", operator, {
      email: "project-owner@company.test",
      emailNormalized: "project-owner@company.test"
    });
    seed.projects.push({
      ...structuredClone(seed.projects[0]!),
      id: "unclaimed-invitation-project",
      clientId: null,
      clientEmail: reserved.email,
      clientEmailNormalized: reserved.emailNormalized
    });
    seed.userInvitations = [
      invitation("pending", operator),
      failed,
      expired,
      invalidated,
      claimed,
      reserved,
      terminalInvitation("accepted", operator, "accepted"),
      terminalInvitation("revoked", operator, "revoked"),
      terminalInvitation("superseded", operator, "superseded")
    ];
    const { service } = setup(seed);

    const page = await service.list(publicUser(operator), {}, { limit: 20, offset: 0 });
    expect(page.total).toBe(6);
    expect(page.invitableRoles).toEqual(INVITABLE_ROLE_CODES);
    expect(page.invitableRoles).not.toContain("client");
    expect(page.invitableRoles).not.toContain("super_admin");
    expect(page.items.find(({ id }) => id === "pending")).toMatchObject({
      status: "pending",
      currentLinkAvailable: true,
      availableActions: ["resend", "revoke"],
      mobile: "+91 90000 00000"
    });
    expect(page.items.find(({ id }) => id === "invalidated")).toMatchObject({
      status: "pending",
      currentLinkAvailable: false,
      availableActions: ["resend", "revoke"]
    });
    for (const id of ["claimed", "reserved"]) {
      expect(page.items.find((item) => item.id === id)).toMatchObject({
        currentLinkAvailable: false,
        availableActions: ["revoke"]
      });
    }
    expect(Object.keys(page.items[0]!).sort()).toEqual([
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
    for (const item of page.items) {
      expect(item).not.toHaveProperty("tokenHash");
      expect(item).not.toHaveProperty("tokenGeneration");
      expect(item).not.toHaveProperty("deliveryFailureCode");
      expect(item).not.toHaveProperty("emailNormalized");
      expect(item).not.toHaveProperty("claimed");
      expect(item).not.toHaveProperty("reserved");
    }

    const statuses = [
      "pending",
      "delivery_failed",
      "expired",
      "accepted",
      "revoked",
      "superseded"
    ] as const;
    for (const status of statuses) {
      const filtered = await service.list(
        publicUser(operator),
        { status },
        { limit: 20, offset: 0 }
      );
      expect(filtered.items).not.toHaveLength(0);
      expect(filtered.items.every((item) => item.status === status)).toBe(true);
    }
  });

  it("normalizes create input, supersedes a prior pending row, commits audits before mailing, and returns no secret", async () => {
    const { seed, operator } = standardSeed();
    const prior = invitation("prior", operator, {
      email: "Asha@Example.Test",
      emailNormalized: "asha@example.test"
    });
    seed.userInvitations = [prior];
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    let transactionOpen = false;
    const originalTransaction = repository.runInTransaction.bind(repository);
    vi.spyOn(repository, "runInTransaction").mockImplementation(async (operation) => {
      transactionOpen = true;
      try {
        return await originalTransaction(operation);
      } finally {
        transactionOpen = false;
      }
    });
    const sendInvitation = vi.fn(async () => {
      expect(transactionOpen).toBe(false);
    });
    const service = createUserInvitationService({
      repository,
      audit,
      mailer: { deliveryKind: "local_test", sendInvitation },
      clock: () => new Date(NOW),
      randomBytes: randomSource()
    });

    const created = await service.create(publicUser(operator), createInput);

    expect(created).toMatchObject({
      name: "Asha  Rao",
      email: "ASHA@Example.Test",
      mobile: "+91 90000 00000",
      role: "designer",
      status: "pending",
      deliveryStatus: "sent",
      currentLinkAvailable: true,
      availableActions: ["resend", "revoke"],
      version: 1
    });
    expect(JSON.stringify(created)).not.toMatch(/token|hash|failureCode|emailNormalized/i);
    const storedPrior = await repository.findUserInvitationById(prior.id);
    const storedCreated = await repository.findUserInvitationById(created.id);
    expect(storedPrior).toMatchObject({
      status: "superseded",
      tokenHash: null,
      supersededByInvitationId: created.id,
      version: 2
    });
    expect(storedCreated).toMatchObject({
      emailNormalized: "asha@example.test",
      tokenGeneration: 1,
      tokenIssuedById: operator.id,
      tokenIssuerVersion: operator.version,
      status: "pending",
      deliveryStatus: "sent"
    });
    expect(storedCreated?.tokenHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(sendInvitation).toHaveBeenCalledOnce();
    expect(sendInvitation.mock.calls[0]?.[0]).toMatchObject({
      recipient: { name: "Asha  Rao", email: "ASHA@Example.Test" },
      roleLabel: "Designer",
      expiresAt: new Date(Date.parse(NOW) + USER_INVITATION_TTL_MS).toISOString()
    });
    expect(sendInvitation.mock.calls[0]?.[0].rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect((await invitationAudits(repository)).map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "user_invitation.superseded",
        "user_invitation.created",
        "user_invitation.delivery_sent"
      ])
    );
  });

  it.each([
    ["name", "Asha\r\nBcc: victim@example.test"],
    ["email", "asha@example.test\r\nBcc:victim@example.test"],
    ["mobile", "+91 90000\n00000"]
  ] as const)("rejects control/header injection in %s", async (field, value) => {
    const { seed, operator } = standardSeed();
    const { repository, service, sendInvitation } = setup(seed);
    await expect(
      service.create(publicUser(operator), { ...createInput, [field]: value })
    ).rejects.toBeDefined();
    expect((await repository.pageUserInvitations({}, { limit: 20, offset: 0 }, NOW)).total).toBe(0);
    expect(sendInvitation).not.toHaveBeenCalled();
  });

  it.each([
    { name: "", email: "valid@example.test", mobile: "+91 90000 00000", role: "designer" },
    { name: "x".repeat(121), email: "valid@example.test", mobile: "+91 90000 00000", role: "designer" },
    { name: "Asha", email: `${"x".repeat(250)}@example.test`, mobile: "+91 90000 00000", role: "designer" },
    { name: "Asha", email: "valid@example.test", mobile: "123456", role: "designer" },
    { name: "Asha", email: "valid@example.test", mobile: `+${"1 ".repeat(15)}1`, role: "designer" },
    { name: "Asha", email: "valid@example.test", mobile: "+91 90000 00000", role: "client" },
    { name: "Asha", email: "valid@example.test", mobile: "+91 90000 00000", role: "super_admin" }
  ])("rejects an out-of-contract create input %#", async (candidate) => {
    const { seed, operator } = standardSeed();
    const { service } = setup(seed);
    await expect(service.create(publicUser(operator), candidate as never)).rejects.toBeDefined();
  });

  it("maps existing accounts and reserved or project-owned emails without disclosing details", async () => {
    const cases = ["account", "reserved", "project"] as const;
    for (const kind of cases) {
      const { seed, operator } = standardSeed();
      const email = kind === "reserved" ? "admin@lisno.example" : `${kind}@company.test`;
      if (kind === "account") {
        const existing = seed.users.find((user) => user.role === "designer")!;
        seed.users = seed.users.map((user) =>
          user.id === existing.id
            ? { ...user, email, emailNormalized: email }
            : user
        );
      }
      if (kind === "project") {
        seed.projects.push({
          ...structuredClone(seed.projects[0]!),
          id: "reserved-client-project",
          clientId: null,
          clientEmail: email,
          clientEmailNormalized: email
        });
      }
      const { repository, service, sendInvitation } = setup(seed);
      const failure = await service
        .create(publicUser(operator), { ...createInput, email })
        .catch((error: unknown) => error);
      expect(failure).toMatchObject(
        kind === "account"
          ? { status: 409, code: "ACCOUNT_EXISTS" }
          : {
              status: 400,
              code: "INVITATION_EMAIL_NOT_ALLOWED",
              message: "This email cannot be invited."
            }
      );
      expect(String(failure)).not.toContain(kind === "project" ? "project" : "reserved");
      expect((await repository.pageUserInvitations({}, { limit: 20, offset: 0 }, NOW)).total).toBe(0);
      expect(await invitationAudits(repository)).toEqual([]);
      expect(sendInvitation).not.toHaveBeenCalled();
    }
  });

  it("enforces persisted cooldown at the subsecond boundary with integer Retry-After and no writes", async () => {
    const { seed, operator } = standardSeed();
    const issuedAt = new Date(Date.parse(NOW) - MINUTE + 1).toISOString();
    seed.userInvitations = [
      terminalInvitation("cooldown-history", operator, "revoked"),
    ];
    seed.userInvitations[0] = {
      ...seed.userInvitations[0]!,
      issuedAt,
      expiresAt: new Date(Date.parse(issuedAt) + USER_INVITATION_TTL_MS).toISOString(),
      createdAt: issuedAt,
      updatedAt: issuedAt
    };
    const { repository, service, sendInvitation } = setup(seed);
    const before = await repository.findUserInvitationById("cooldown-history");

    await expect(
      service.create(publicUser(operator), {
        ...createInput,
        email: before!.email
      })
    ).rejects.toMatchObject({
      status: 429,
      code: "TOO_MANY_ATTEMPTS",
      headers: { "Retry-After": "1" }
    });
    expect(await repository.findUserInvitationById("cooldown-history")).toEqual(before);
    expect(await invitationAudits(repository)).toEqual([]);
    expect(sendInvitation).not.toHaveBeenCalled();
  });

  it("resends the same invalidated row under auth then email coordination, rotates generation, and captures current issuer", async () => {
    const { seed, operator } = standardSeed();
    const pending = invitation("rescue", operator, {
      tokenIssuedById: "retired-super-admin",
      tokenIssuerVersion: 1,
      deliveryStatus: "failed",
      deliveryAttemptedAt: new Date(Date.parse(NOW) - MINUTE).toISOString(),
      deliveryFailureCode: "SMTP_TIMEOUT"
    });
    seed.userInvitations = [pending];
    const repository = createMemoryRepository(seed);
    const order: string[] = [];
    const original = repository.runInTransaction.bind(repository);
    vi.spyOn(repository, "runInTransaction").mockImplementation((operation) =>
      original((transaction) =>
        operation(new Proxy(transaction, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (
              typeof value === "function" &&
              [
                "coordinateAuthorizationMutation",
                "findUserById",
                "coordinateClientEmail",
                "findUserInvitationById",
                "findLatestUserInvitationIssuedAtByEmail",
                "resendUserInvitation"
              ].includes(String(property))
            ) {
              return async (...args: unknown[]) => {
                order.push(String(property));
                return value.apply(target, args);
              };
            }
            return value;
          }
        }) as AppRepository)
      )
    );
    const audit = createAuditService(repository);
    const sendInvitation = vi.fn(async () => undefined);
    const service = createUserInvitationService({
      repository,
      audit,
      mailer: { deliveryKind: "local_test", sendInvitation },
      clock: () => new Date(NOW),
      randomBytes: randomSource()
    });

    const resent = await service.resend(publicUser(operator), pending.id, { version: 1 });
    expect(resent).toMatchObject({ id: pending.id, version: 2, deliveryStatus: "sent" });
    expect(order.slice(0, 6)).toEqual([
      "coordinateAuthorizationMutation",
      "findUserById",
      "coordinateClientEmail",
      "findUserInvitationById",
      "findLatestUserInvitationIssuedAtByEmail",
      "resendUserInvitation"
    ]);
    const stored = await repository.findUserInvitationById(pending.id);
    expect(stored).toMatchObject({
      tokenGeneration: 2,
      tokenIssuedById: operator.id,
      tokenIssuerVersion: operator.version,
      deliveryStatus: "sent",
      deliveryFailureCode: null,
      version: 2
    });
    expect(stored?.tokenHash).not.toBe(pending.tokenHash);
    expect(sendInvitation).toHaveBeenCalledOnce();
  });

  it("applies the persisted subsecond cooldown to resend without rotating, auditing, or mailing", async () => {
    const { seed, operator } = standardSeed();
    const issuedAt = new Date(Date.parse(NOW) - MINUTE + 1).toISOString();
    const pending = invitation("resend-cooldown", operator, {
      issuedAt,
      expiresAt: new Date(Date.parse(issuedAt) + USER_INVITATION_TTL_MS).toISOString(),
      createdAt: issuedAt,
      updatedAt: issuedAt
    });
    seed.userInvitations = [pending];
    const { repository, service, sendInvitation } = setup(seed);

    await expect(
      service.resend(publicUser(operator), pending.id, { version: pending.version })
    ).rejects.toMatchObject({
      status: 429,
      code: "TOO_MANY_ATTEMPTS",
      headers: { "Retry-After": "1" }
    });
    expect(await repository.findUserInvitationById(pending.id)).toEqual(pending);
    expect(await invitationAudits(repository)).toEqual([]);
    expect(sendInvitation).not.toHaveBeenCalled();
  });

  it("keeps expired and issuer-invalidated stored-pending rows revocable", async () => {
    for (const kind of ["expired", "invalidated"] as const) {
      const { seed, operator } = standardSeed();
      const issuedAt = new Date(Date.parse(NOW) - USER_INVITATION_TTL_MS - MINUTE).toISOString();
      const pending = invitation(`revoke-${kind}`, operator, {
        ...(kind === "expired"
          ? {
              issuedAt,
              expiresAt: new Date(Date.parse(issuedAt) + USER_INVITATION_TTL_MS).toISOString(),
              createdAt: issuedAt,
              updatedAt: issuedAt
            }
          : {
              tokenIssuedById: "former-super-admin",
              tokenIssuerVersion: 1
            })
      });
      seed.userInvitations = [pending];
      const { repository, service } = setup(seed);

      await expect(
        service.revoke(publicUser(operator), pending.id, { version: pending.version })
      ).resolves.toMatchObject({ status: "revoked", version: 2 });
      expect(await repository.findUserInvitationById(pending.id)).toMatchObject({
        status: "revoked",
        tokenHash: null
      });
    }
  });

  it("keeps claimed and project-reserved pending rows revoke-only while making resend generic", async () => {
    for (const kind of ["claimed", "project"] as const) {
      const { seed, operator } = standardSeed();
      const email = `${kind}-locked@company.test`;
      const pending = invitation(`${kind}-pending`, operator, {
        email,
        emailNormalized: email
      });
      seed.userInvitations = [pending];
      if (kind === "claimed") {
        const user = seed.users.find(({ role }) => role === "designer")!;
        seed.users = seed.users.map((candidate) =>
          candidate.id === user.id
            ? { ...candidate, email, emailNormalized: email }
            : candidate
        );
      } else {
        seed.projects.push({
          ...structuredClone(seed.projects[0]!),
          id: "invitation-locked-project",
          clientId: null,
          clientEmail: email,
          clientEmailNormalized: email
        });
      }
      const { repository, service, sendInvitation } = setup(seed);

      await expect(
        service.resend(publicUser(operator), pending.id, { version: 1 })
      ).rejects.toMatchObject({
        code: "INVITATION_NOT_ACTIONABLE"
      });
      const revoked = await service.revoke(publicUser(operator), pending.id, { version: 1 });
      expect(revoked).toMatchObject({
        status: "revoked",
        availableActions: [],
        currentLinkAvailable: false,
        version: 2
      });
      expect((await repository.findUserInvitationById(pending.id))?.tokenHash).toBeNull();
      expect(sendInvitation).not.toHaveBeenCalled();
    }
  });

  it("maps missing, stale, and terminal resend/revoke without rotating or mailing", async () => {
    const { seed, operator } = standardSeed();
    const pending = invitation("versioned", operator);
    const terminal = terminalInvitation("terminal", operator, "accepted");
    seed.userInvitations = [pending, terminal];
    const { repository, service, sendInvitation } = setup(seed);

    await expect(
      service.resend(publicUser(operator), "missing", { version: 1 })
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(
      service.resend(publicUser(operator), pending.id, { version: 99 })
    ).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    await expect(
      service.revoke(publicUser(operator), terminal.id, { version: terminal.version })
    ).rejects.toMatchObject({ code: "INVITATION_NOT_ACTIONABLE" });
    expect(await repository.findUserInvitationById(pending.id)).toEqual(pending);
    expect(sendInvitation).not.toHaveBeenCalled();
  });

  it("blocks a reserved demo actor from an external adapter and records only a safe failure", async () => {
    const seed = structuredClone(demoSeedData);
    seed.userInvitations = [];
    seed.auditEvents = [];
    const operator = seed.users.find(({ role }) => role === "super_admin")!;
    const sendInvitation = vi.fn(async () => undefined);
    const { repository, service } = setup(seed, {
      mailer: { deliveryKind: "external", sendInvitation }
    });

    const result = await service.create(publicUser(operator), {
      ...createInput,
      email: "real-recipient@company.test"
    });
    expect(result).toMatchObject({ deliveryStatus: "failed", status: "delivery_failed" });
    expect(sendInvitation).not.toHaveBeenCalled();
    const stored = await repository.findUserInvitationById(result.id);
    expect(stored?.deliveryFailureCode).toMatch(/^[A-Z0-9_]{1,64}$/u);
    expect(JSON.stringify(result)).not.toContain(stored?.deliveryFailureCode);
  });

  it("rolls matching delivery telemetry back when its audit fails and returns queued state", async () => {
    const { seed, operator } = standardSeed();
    const repository = createMemoryRepository(seed);
    const realAudit = createAuditService(repository);
    const audit: AuditService = {
      ...realAudit,
      append: vi.fn(async (write, transaction) => {
        if (write.action === "user_invitation.delivery_sent") {
          throw new Error("forced delivery audit failure with provider detail");
        }
        return realAudit.append(write, transaction);
      })
    };
    const service = createUserInvitationService({
      repository,
      audit,
      mailer: { deliveryKind: "local_test", sendInvitation: vi.fn(async () => undefined) },
      clock: () => new Date(NOW),
      randomBytes: randomSource()
    });

    const result = await service.create(publicUser(operator), createInput);
    expect(result).toMatchObject({ deliveryStatus: "queued", status: "pending" });
    expect(await repository.findUserInvitationById(result.id)).toMatchObject({
      deliveryStatus: "queued",
      deliveryAttemptedAt: null,
      sentAt: null,
      deliveryFailureCode: null,
      version: 1
    });
    expect((await invitationAudits(repository)).map(({ action }) => action)).not.toContain(
      "user_invitation.delivery_sent"
    );
  });

  it("returns current queued state when telemetry persistence itself fails", async () => {
    const { seed, operator } = standardSeed();
    const repository = createMemoryRepository(seed);
    const original = repository.runInTransaction.bind(repository);
    let transactionCount = 0;
    vi.spyOn(repository, "runInTransaction").mockImplementation((operation) => {
      transactionCount += 1;
      const currentCount = transactionCount;
      return original((transaction) =>
        operation(currentCount === 2
          ? new Proxy(transaction, {
              get(target, property, receiver) {
                if (property === "updateUserInvitationDelivery") {
                  return async () => {
                    throw new Error("telemetry store failed with provider response");
                  };
                }
                return Reflect.get(target, property, receiver);
              }
            }) as AppRepository
          : transaction)
      );
    });
    const service = createUserInvitationService({
      repository,
      audit: createAuditService(repository),
      mailer: { deliveryKind: "local_test", sendInvitation: vi.fn(async () => undefined) },
      clock: () => new Date(NOW),
      randomBytes: randomSource()
    });

    const result = await service.create(publicUser(operator), createInput);
    expect(result).toMatchObject({ deliveryStatus: "queued", status: "pending" });
    expect(JSON.stringify(result)).not.toMatch(/provider|response|token|hash/i);
    expect((await invitationAudits(repository)).map(({ action }) => action)).toEqual([
      "user_invitation.created"
    ]);
  });

  it("limits every administrative and delivery audit value to the approved safe keys", async () => {
    const { seed, operator } = standardSeed();
    const repository = createMemoryRepository(seed);
    const realAudit = createAuditService(repository);
    const writes: AuditWrite[] = [];
    const audit: AuditService = {
      ...realAudit,
      append: vi.fn(async (write, transaction) => {
        writes.push(structuredClone(write));
        return realAudit.append(write, transaction);
      })
    };
    let attemptedRawToken = "";
    const service = createUserInvitationService({
      repository,
      audit,
      mailer: {
        deliveryKind: "local_test",
        sendInvitation: vi.fn(async ({ rawToken }) => {
          attemptedRawToken = rawToken;
          throw new Error("550 provider response containing a credential");
        })
      },
      clock: () => new Date(NOW),
      randomBytes: randomSource()
    });

    const result = await service.create(publicUser(operator), createInput);
    expect(result).toMatchObject({ deliveryStatus: "failed", status: "delivery_failed" });
    const allowedKeys = new Set([
      "invitationId",
      "emailNormalized",
      "role",
      "tokenGeneration",
      "expiresAt",
      "deliveryState"
    ]);
    for (const write of writes) {
      expect(Object.keys(write.oldValues ?? {}).every((key) => allowedKeys.has(key))).toBe(true);
      expect(Object.keys(write.newValues ?? {}).every((key) => allowedKeys.has(key))).toBe(true);
    }
    expect(JSON.stringify(writes)).not.toContain(attemptedRawToken);
    expect(JSON.stringify(writes)).not.toMatch(/provider|credential|response|matched|link|body/i);
  });

  it("lets a stale delivery completion append generation audit without changing a revoked row", async () => {
    const { seed, operator } = standardSeed();
    let settle!: () => void;
    const sending = new Promise<void>((resolve) => { settle = resolve; });
    const sendInvitation = vi.fn(() => sending);
    const { repository, service } = setup(seed, {
      mailer: { deliveryKind: "local_test", sendInvitation }
    });

    const creating = service.create(publicUser(operator), createInput);
    await vi.waitFor(() => expect(sendInvitation).toHaveBeenCalledOnce());
    const pendingPage = await service.list(publicUser(operator), {}, { limit: 20, offset: 0 });
    const current = pendingPage.items[0]!;
    const revoked = await service.revoke(publicUser(operator), current.id, {
      version: current.version
    });
    settle();
    await creating;

    expect(await repository.findUserInvitationById(current.id)).toMatchObject({
      status: "revoked",
      deliveryStatus: "queued",
      version: revoked.version
    });
    const audits = await invitationAudits(repository);
    expect(audits.map(({ action }) => action)).toContain("user_invitation.delivery_sent");
  });

  it("persists a real trickling SMTP wall-deadline failure and leaves no pending socket work", async () => {
    const server = await startTricklingSmtpServer();
    try {
      const { seed, operator } = standardSeed();
      const mailer = createSmtpInvitationMailer({
        kind: "smtp",
        publicFrontendUrl: "https://app.lisno.example",
        host: server.host,
        port: server.port,
        tlsMode: "starttls",
        username: "mailer-user",
        password: "mailer-password",
        from: "Lisno Invitations <invitations@lisno.example>"
      });
      const { repository, service } = setup(seed, { mailer });

      const creating = service.create(publicUser(operator), {
        ...createInput,
        email: "smtp-timeout@company.test"
      });
      await server.waitForConnection();
      const result = await creating;
      await server.waitForPeerClose();

      expect(result).toMatchObject({
        deliveryStatus: "failed",
        status: "delivery_failed"
      });
      expect(JSON.stringify(result)).not.toMatch(/token|hash|SMTP_TIMEOUT|credential|response/i);
      expect(await repository.findUserInvitationById(result.id)).toMatchObject({
        deliveryStatus: "failed",
        deliveryFailureCode: "SMTP_TIMEOUT",
        version: 1
      });
      const deliveryAudit = (await invitationAudits(repository)).find(
        ({ action }) => action === "user_invitation.delivery_failed"
      );
      expect(deliveryAudit).toBeDefined();
      expect(JSON.stringify(deliveryAudit)).not.toMatch(/rawToken|tokenHash|password|provider|response/i);
      expect(server.activeConnectionCount()).toBe(0);
      expect(server.activeTimerCount()).toBe(0);
    } finally {
      await server.close();
    }
  }, 15_000);
});

describe("public user invitation inspection and acceptance", () => {
  const unavailable = {
    status: 410,
    code: "INVITATION_UNAVAILABLE",
    message: "This invitation is unavailable."
  };

  it("makes every cheap-invalid token state uniformly unavailable before password hashing", async () => {
    const cases: Array<{
      name: string;
      rawToken: string;
      build(seed: SeedData, operator: UserRecord): UserInvitationRecord;
    }> = [
      {
        name: "malformed token",
        rawToken: "not-a-token",
        build: (_seed, operator) => publicInvitation("malformed", operator)
      },
      {
        name: "unknown digest",
        rawToken: REPLACEMENT_RAW_TOKEN,
        build: (_seed, operator) => publicInvitation("unknown", operator)
      },
      {
        name: "expiry equal to now",
        rawToken: PUBLIC_RAW_TOKEN,
        build: (_seed, operator) => {
          const issuedAt = new Date(Date.parse(NOW) - USER_INVITATION_TTL_MS).toISOString();
          return publicInvitation("expired-equality", operator, PUBLIC_RAW_TOKEN, {
            issuedAt,
            expiresAt: NOW,
            createdAt: issuedAt,
            updatedAt: issuedAt
          });
        }
      },
      {
        name: "invalidated issuer",
        rawToken: PUBLIC_RAW_TOKEN,
        build: (_seed, operator) => publicInvitation("invalidated", operator, PUBLIC_RAW_TOKEN, {
          tokenIssuerVersion: operator.version + 1
        })
      },
      {
        name: "revoked invitation",
        rawToken: PUBLIC_RAW_TOKEN,
        build: (_seed, operator) => terminalInvitation("public-revoked", operator, "revoked")
      },
      {
        name: "accepted invitation",
        rawToken: PUBLIC_RAW_TOKEN,
        build: (_seed, operator) => terminalInvitation("public-accepted", operator, "accepted")
      },
      {
        name: "superseded invitation",
        rawToken: PUBLIC_RAW_TOKEN,
        build: (_seed, operator) => terminalInvitation("public-superseded", operator, "superseded")
      },
      {
        name: "old token generation",
        rawToken: PUBLIC_RAW_TOKEN,
        build: (_seed, operator) => publicInvitation(
          "old-generation",
          operator,
          REPLACEMENT_RAW_TOKEN,
          { tokenGeneration: 2, version: 2 }
        )
      },
      {
        name: "email already claimed by a User",
        rawToken: PUBLIC_RAW_TOKEN,
        build: (seed, operator) => {
          const record = publicInvitation("claimed-public", operator);
          const existing = seed.users.find(({ role }) => role === "designer")!;
          existing.email = record.email;
          existing.emailNormalized = record.emailNormalized;
          return record;
        }
      },
      {
        name: "email reserved by an unclaimed Client project",
        rawToken: PUBLIC_RAW_TOKEN,
        build: (seed, operator) => {
          const record = publicInvitation("project-public", operator);
          seed.projects.push({
            ...structuredClone(seed.projects[0]!),
            id: "public-invitation-project",
            clientId: null,
            clientEmail: record.email,
            clientEmailNormalized: record.emailNormalized
          });
          return record;
        }
      }
    ];

    for (const testCase of cases) {
      const { seed, operator } = standardSeed();
      const record = testCase.build(seed, operator);
      seed.userInvitations = [record];
      const passwordHasher = vi.fn(async () => ACCEPTED_PASSWORD_HASH);
      const { repository, service } = setup(seed, { passwordHasher });
      const tokenLookup = vi.spyOn(repository, "findPendingUserInvitationByTokenHash");
      const usersBefore = await repository.listUsers();
      const invitationBefore = await repository.findUserInvitationById(record.id);

      await expect(service.inspect(testCase.rawToken), testCase.name).rejects.toMatchObject(
        unavailable
      );
      await expect(
        service.accept({ rawToken: testCase.rawToken, password: ACCEPTED_PASSWORD }),
        testCase.name
      ).rejects.toMatchObject(unavailable);

      expect(passwordHasher, testCase.name).not.toHaveBeenCalled();
      if (testCase.name === "malformed token") {
        expect(tokenLookup).not.toHaveBeenCalled();
      }
      expect(await repository.listUsers(), testCase.name).toEqual(usersBefore);
      expect(await repository.findUserInvitationById(record.id), testCase.name).toEqual(
        invitationBefore
      );
      expect(await invitationAudits(repository), testCase.name).toEqual([]);
    }
  });

  it("returns the exact safe public inspection without mobile or lifecycle internals", async () => {
    const { seed, operator } = standardSeed();
    const record = publicInvitation("inspect-current", operator, PUBLIC_RAW_TOKEN, {
      name: "Asha Rao",
      email: "Asha.Rao@Example.Test",
      emailNormalized: "asha.rao@example.test",
      role: "finance_head",
      mobile: "+91 98765 43210"
    });
    seed.userInvitations = [record];
    const passwordHasher = vi.fn(async () => ACCEPTED_PASSWORD_HASH);
    const { service } = setup(seed, { passwordHasher });

    const inspected = await service.inspect(PUBLIC_RAW_TOKEN);

    expect(inspected).toEqual({
      name: "Asha Rao",
      email: "Asha.Rao@Example.Test",
      role: "finance_head",
      expiresAt: record.expiresAt
    });
    expect(Object.keys(inspected).sort()).toEqual(["email", "expiresAt", "name", "role"]);
    expect(JSON.stringify(inspected)).not.toMatch(
      /mobile|emailNormalized|token|hash|generation|issuer|version/i
    );
    expect(passwordHasher).not.toHaveBeenCalled();
  });

  it("uses one authoritative transaction timestamp for expiry validation and acceptance writes", async () => {
    const { seed, operator } = standardSeed();
    const expiresAt = new Date(Date.parse(NOW) + 1).toISOString();
    const issuedAt = new Date(
      Date.parse(expiresAt) - USER_INVITATION_TTL_MS
    ).toISOString();
    const record = publicInvitation("expires-during-hash", operator, PUBLIC_RAW_TOKEN, {
      issuedAt,
      expiresAt,
      createdAt: issuedAt,
      updatedAt: issuedAt
    });
    seed.userInvitations = [record];
    const passwordHasher = vi.fn(async () => ACCEPTED_PASSWORD_HASH);
    const clock = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date(NOW))
      .mockReturnValueOnce(new Date(NOW))
      .mockReturnValue(new Date(expiresAt));
    const { repository, service } = setup(seed, { passwordHasher, clock });
    await expect(
      service.accept({ rawToken: PUBLIC_RAW_TOKEN, password: ACCEPTED_PASSWORD })
    ).resolves.toEqual({ accepted: true });

    expect(passwordHasher).toHaveBeenCalledOnce();
    expect(clock).toHaveBeenCalledTimes(2);
    expect(await repository.findUserInvitationById(record.id)).toMatchObject({
      status: "accepted",
      acceptedAt: NOW,
      updatedAt: NOW
    });
  });

  it("hashes at cost 12, accepts once under ordered locks and CAS, and creates only the standard User plus two safe self-audits", async () => {
    const { seed, operator } = standardSeed();
    const record = publicInvitation("accept-current", operator, PUBLIC_RAW_TOKEN, {
      name: "Asha Rao",
      email: "Asha.Rao@Example.Test",
      emailNormalized: "asha.rao@example.test",
      role: "site_manager",
      mobile: "+91 98765 43210"
    });
    seed.userInvitations = [record];
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    const timeline: string[] = [];
    const createdInputs: NewUser[] = [];
    const passwordHasher = vi.fn(async () => {
      timeline.push("passwordHasher");
      return ACCEPTED_PASSWORD_HASH;
    });
    const tracked = new Set([
      "coordinateAuthorizationMutation",
      "coordinateClientEmail",
      "findUserInvitationById",
      "findUserById",
      "countActiveUsersByRole",
      "findUserByEmail",
      "hasUnclaimedClientProjectByEmail",
      "createUser",
      "acceptUserInvitation",
      "appendAuditEvent"
    ]);
    const originalTransaction = repository.runInTransaction.bind(repository);
    vi.spyOn(repository, "runInTransaction").mockImplementation(async (operation) => {
      timeline.push("transaction");
      return originalTransaction((transaction) =>
        operation(new Proxy(transaction, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof value !== "function" || !tracked.has(String(property))) return value;
            return async (...args: unknown[]) => {
              timeline.push(String(property));
              if (property === "createUser") {
                createdInputs.push(structuredClone(args[0] as NewUser));
              }
              return value.apply(target, args);
            };
          }
        }) as AppRepository)
      );
    });
    const service = createUserInvitationService({
      repository,
      audit,
      mailer: localMailer().mailer,
      clock: () => new Date(NOW),
      passwordHasher
    });

    const result = await service.accept({
      rawToken: PUBLIC_RAW_TOKEN,
      password: ACCEPTED_PASSWORD
    });

    expect(result).toEqual({ accepted: true });
    expect(Object.keys(result)).toEqual(["accepted"]);
    expect(JSON.stringify(result)).not.toMatch(/jwt|token|user|password/i);
    expect(passwordHasher).toHaveBeenCalledOnce();
    expect(passwordHasher).toHaveBeenCalledWith(ACCEPTED_PASSWORD, 12);
    expect(timeline).toEqual([
      "passwordHasher",
      "transaction",
      "coordinateAuthorizationMutation",
      "coordinateClientEmail",
      "findUserInvitationById",
      "findUserById",
      "countActiveUsersByRole",
      "findUserByEmail",
      "hasUnclaimedClientProjectByEmail",
      "createUser",
      "acceptUserInvitation",
      "appendAuditEvent",
      "appendAuditEvent"
    ]);
    expect(createdInputs).toEqual([{
      name: "Asha Rao",
      email: "Asha.Rao@Example.Test",
      mobile: "+91 98765 43210",
      passwordHash: ACCEPTED_PASSWORD_HASH,
      role: "site_manager",
      active: true,
      accountKind: "standard",
      address: null,
      managerId: null,
      authorizedClientIds: [],
      createdAt: NOW,
      updatedAt: NOW
    }]);
    expect(createdInputs[0]).not.toHaveProperty("title");
    const created = await repository.findUserByEmail(record.emailNormalized);
    expect(created).toMatchObject({
      name: record.name,
      email: record.email,
      emailNormalized: record.emailNormalized,
      mobile: record.mobile,
      passwordHash: ACCEPTED_PASSWORD_HASH,
      role: record.role,
      active: true,
      accountKind: "standard",
      address: null,
      managerId: null,
      authorizedClientIds: [],
      version: 1
    });
    expect(created).not.toHaveProperty("title");
    expect(created).not.toHaveProperty("avatar");
    expect(
      Object.values(await repository.countUserResponsibilities(created!.id)).every(
        (count) => count === 0
      )
    ).toBe(true);
    for (const module of PROJECT_MODULES) {
      await expect(repository.listActiveProjectAccessGrants(created!.id, module)).resolves.toEqual(
        []
      );
    }
    const accepted = await repository.findUserInvitationById(record.id);
    expect(accepted).toMatchObject({
      status: "accepted",
      tokenHash: null,
      acceptedUserId: created!.id,
      acceptedAt: NOW,
      version: 2
    });
    const audits = (
      await repository.pageAuditEvents({}, { limit: 10, offset: 0 })
    ).items;
    expect(audits.map(({ action, actorId, entityType, entityId, newValues }) => ({
      action,
      actorId,
      entityType,
      entityId,
      newValues
    }))).toEqual([
      {
        action: "user.invited_created",
        actorId: created!.id,
        entityType: "user",
        entityId: created!.id,
        newValues: {
          invitationId: record.id,
          userId: created!.id,
          emailNormalized: record.emailNormalized,
          role: record.role
        }
      },
      {
        action: "user_invitation.accepted",
        actorId: created!.id,
        entityType: "user_invitation",
        entityId: record.id,
        newValues: {
          invitationId: record.id,
          acceptedUserId: created!.id,
          emailNormalized: record.emailNormalized,
          role: record.role
        }
      }
    ]);
    expect(JSON.stringify(audits)).not.toContain(PUBLIC_RAW_TOKEN);
    expect(JSON.stringify(audits)).not.toContain(ACCEPTED_PASSWORD);
    expect(JSON.stringify(audits)).not.toContain(ACCEPTED_PASSWORD_HASH);

    const usersAfterFirstAccept = await repository.listUsers();
    const invitationAfterFirstAccept = await repository.findUserInvitationById(record.id);
    const auditsAfterFirstAccept = await repository.pageAuditEvents({}, { limit: 10, offset: 0 });
    await expect(
      service.accept({ rawToken: PUBLIC_RAW_TOKEN, password: ACCEPTED_PASSWORD })
    ).rejects.toMatchObject(unavailable);
    expect(passwordHasher).toHaveBeenCalledOnce();
    expect(await repository.listUsers()).toEqual(usersAfterFirstAccept);
    expect(await repository.findUserInvitationById(record.id)).toEqual(
      invitationAfterFirstAccept
    );
    expect(await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).toEqual(
      auditsAfterFirstAccept
    );
  });

  it("maps every post-hash reload, ownership, CAS, and audit race to unavailable with full rollback", async () => {
    const raceKinds = [
      "missing_reload",
      "version_changed",
      "generation_changed",
      "digest_changed",
      "terminal_state",
      "issuer_invalidated",
      "existing_user",
      "project_reserved",
      "duplicate_user",
      "accept_conflict",
      "accept_not_found",
      "second_audit_conflict"
    ] as const;

    for (const raceKind of raceKinds) {
      const { seed, operator } = standardSeed();
      const record = publicInvitation(`race-${raceKind}`, operator);
      seed.userInvitations = [record];
      const repository = createMemoryRepository(seed);
      const audit = createAuditService(repository);
      const passwordHasher = vi.fn(async () => ACCEPTED_PASSWORD_HASH);
      const usersBefore = await repository.listUsers();
      const invitationBefore = await repository.findUserInvitationById(record.id);
      let auditAppendCount = 0;
      const originalTransaction = repository.runInTransaction.bind(repository);
      vi.spyOn(repository, "runInTransaction").mockImplementation((operation) =>
        originalTransaction((transaction) =>
          operation(new Proxy(transaction, {
            get(target, property, receiver) {
              const value = Reflect.get(target, property, receiver);
              if (typeof value !== "function") return value;
              if (property === "findUserInvitationById") {
                return async (...args: unknown[]) => {
                  const current = await value.apply(target, args) as UserInvitationRecord | null;
                  if (raceKind === "missing_reload") return null;
                  if (!current) return current;
                  if (raceKind === "version_changed") {
                    return { ...current, version: current.version + 1 };
                  }
                  if (raceKind === "generation_changed") {
                    return { ...current, tokenGeneration: current.tokenGeneration + 1 };
                  }
                  if (raceKind === "digest_changed") {
                    return { ...current, tokenHash: hashUserInvitationToken(REPLACEMENT_RAW_TOKEN) };
                  }
                  if (raceKind === "terminal_state") {
                    return { ...current, status: "accepted", tokenHash: null };
                  }
                  return current;
                };
              }
              if (property === "findUserById" && raceKind === "issuer_invalidated") {
                return async () => ({ ...operator, active: false });
              }
              if (property === "findUserByEmail" && raceKind === "existing_user") {
                return async () => structuredClone(operator);
              }
              if (
                property === "hasUnclaimedClientProjectByEmail" &&
                raceKind === "project_reserved"
              ) {
                return async () => true;
              }
              if (property === "createUser" && raceKind === "duplicate_user") {
                return async () => {
                  throw new RepositoryConflictError("duplicate user race");
                };
              }
              if (property === "acceptUserInvitation" && raceKind === "accept_conflict") {
                return async () => {
                  throw new RepositoryConflictError("acceptance CAS race");
                };
              }
              if (property === "acceptUserInvitation" && raceKind === "accept_not_found") {
                return async () => {
                  throw new RepositoryNotFoundError("invitation removed during acceptance");
                };
              }
              if (property === "appendAuditEvent" && raceKind === "second_audit_conflict") {
                return async (...args: unknown[]) => {
                  auditAppendCount += 1;
                  if (auditAppendCount === 2) {
                    throw new RepositoryConflictError("acceptance audit race");
                  }
                  return value.apply(target, args);
                };
              }
              return value;
            }
          }) as AppRepository)
        )
      );
      const service = createUserInvitationService({
        repository,
        audit,
        mailer: localMailer().mailer,
        clock: () => new Date(NOW),
        passwordHasher
      });

      await expect(
        service.accept({ rawToken: PUBLIC_RAW_TOKEN, password: ACCEPTED_PASSWORD }),
        raceKind
      ).rejects.toMatchObject(unavailable);

      expect(passwordHasher, raceKind).toHaveBeenCalledOnce();
      expect(await repository.listUsers(), raceKind).toEqual(usersBefore);
      expect(await repository.findUserInvitationById(record.id), raceKind).toEqual(
        invitationBefore
      );
      expect(await repository.pageAuditEvents({}, { limit: 10, offset: 0 }), raceKind).toEqual({
        items: [],
        total: 0
      });
    }
  });
});
