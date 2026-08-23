import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { OPERATIONAL_ROLES, ROLE_CODES, type Role } from "../src/domain/roles.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type {
  ProjectAccessGrantRecord,
  SeedData,
  UserRecord
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createUserAdministrationService } from "../src/services/user-administration.service.js";

const JWT_SECRET = "user-administration-test-secret-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const clock = () => new Date("2026-08-17T12:00:00.000Z");

function emptyAdministrationSeed(): SeedData {
  const seed = structuredClone(demoSeedData);
  seed.users = [];
  seed.leads = [];
  seed.estimateResponsibilities = [];
  seed.projects = [];
  seed.tasks = [];
  seed.accessRequests = [];
  seed.projectAccessGrants = [];
  seed.auditEvents = [];
  return seed;
}

function addUser(
  seed: SeedData,
  id: string,
  role: Role,
  overrides: Partial<UserRecord> = {}
): UserRecord {
  const template = structuredClone(demoSeedData.users[0]!);
  const user: UserRecord = {
    ...template,
    id,
    name: id,
    email: `${id}@admin.lisno.example`,
    emailNormalized: `${id}@admin.lisno.example`,
    role,
    active: true,
    accountKind: "standard",
    version: 1,
    managerId: null,
    authorizedClientIds: [],
    ...overrides
  };
  seed.users.push(user);
  return user;
}

function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function bearer(user: UserRecord): string {
  return `Bearer ${jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: 900
  })}`;
}

function grant(
  id: string,
  userId: string,
  module: ProjectAccessGrantRecord["module"] = "design"
): ProjectAccessGrantRecord {
  return {
    id,
    projectId: `project-${id}`,
    userId,
    module,
    source: "access_request",
    accessRequestId: `request-${id}`,
    grantedById: "user-super",
    active: true,
    grantedAt: "2026-08-17T10:00:00.000Z",
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    version: 1,
    createdAt: "2026-08-17T10:00:00.000Z",
    updatedAt: "2026-08-17T10:00:00.000Z"
  };
}

function setup(seed = emptyAdministrationSeed()) {
  const repository = createMemoryRepository(seed);
  const audit = createAuditService(repository);
  const service = createUserAdministrationService(repository, audit, clock);
  return { repository, service };
}

describe("user administration service", () => {
  it("denies Admin directory access while Super Admin sees all roles", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = addUser(seed, "user-super", "super_admin");
    const admin = addUser(seed, "user-admin", "admin");
    for (const role of ROLE_CODES) {
      if (role !== "super_admin" && role !== "admin") {
        addUser(seed, `user-${role}`, role);
      }
    }
    const { service } = setup(seed);

    await expect(
      service.list(publicUser(admin), {}, { limit: 20, offset: 0 })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });

    const superPage = await service.list(
      publicUser(superAdmin),
      {},
      { limit: 20, offset: 0 }
    );
    expect(new Set(superPage.items.map(({ role }) => role))).toEqual(new Set(ROLE_CODES));
    expect(superPage.manageableRoles).toEqual(ROLE_CODES);

    expect(JSON.stringify(superPage)).not.toMatch(/password|hash|token|secret/i);
  });

  it("requires both current and destination roles to be operational for Admin", async () => {
    const seed = emptyAdministrationSeed();
    const admin = addUser(seed, "user-admin", "admin");
    const designer = addUser(seed, "user-designer", "designer");
    const protectedUsers = [
      admin,
      addUser(seed, "user-admin-two", "admin"),
      addUser(seed, "user-super", "super_admin"),
      addUser(seed, "user-client", "client"),
      addUser(seed, "user-manager", "design_manager"),
      addUser(seed, "user-head", "design_head")
    ];
    const { service } = setup(seed);

    await expect(
      service.update(publicUser(admin), designer.id, {
        version: designer.version,
        role: "admin"
      })
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });

    for (const target of protectedUsers) {
      await expect(
        service.update(publicUser(admin), target.id, {
          version: target.version,
          active: false
        })
      ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    }
  });

  it("keeps missing, self, protected-role, and protected-destination targets generic for Admin", async () => {
    const seed = emptyAdministrationSeed();
    const admin = addUser(seed, "user-admin", "admin");
    const protectedUsers = [
      admin,
      addUser(seed, "user-admin-two", "admin"),
      addUser(seed, "user-super", "super_admin"),
      addUser(seed, "user-client", "client"),
      addUser(seed, "user-manager", "design_manager"),
      addUser(seed, "user-head", "design_head")
    ];
    const designer = addUser(seed, "user-designer", "designer");
    const { service } = setup(seed);
    const attempts = [
      () => service.update(publicUser(admin), "user-missing", { version: 1, active: false }),
      () => service.update(publicUser(admin), "user-missing", { version: 999, active: false }),
      ...protectedUsers.flatMap((target) => [
        () => service.update(publicUser(admin), target.id, {
          version: target.version,
          active: false
        }),
        () => service.update(publicUser(admin), target.id, {
          version: target.version + 99,
          active: false
        })
      ]),
      () => service.update(publicUser(admin), designer.id, {
        version: designer.version,
        role: "admin"
      }),
      () => service.update(publicUser(admin), designer.id, {
        version: designer.version + 99,
        role: "admin"
      })
    ];

    const outcomes = await Promise.all(
      attempts.map(async (attempt) => {
        try {
          await attempt();
          return { unexpectedSuccess: true };
        } catch (error) {
          const failure = error as {
            status?: number;
            code?: string;
            message?: string;
            fields?: Record<string, string>;
          };
          return {
            status: failure.status,
            code: failure.code,
            message: failure.message,
            ...(failure.fields ? { fields: failure.fields } : {})
          };
        }
      })
    );
    const expected = {
      status: 403,
      code: "FORBIDDEN",
      message: "You are not authorized to perform this action."
    };
    expect(outcomes).toEqual(attempts.map(() => expected));
  });

  it("retains Super Admin global missing-target and stale-version distinctions", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = addUser(seed, "user-super", "super_admin");
    const designer = addUser(seed, "user-designer", "designer");
    const { service } = setup(seed);

    await expect(
      service.update(publicUser(superAdmin), "user-missing", {
        version: 1,
        active: false
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "The requested resource was not found."
    });
    await expect(
      service.update(publicUser(superAdmin), designer.id, {
        version: designer.version + 99,
        active: false
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
      message: "The user changed elsewhere."
    });
  });

  it("rejects role change while dependent responsibilities remain", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = addUser(seed, "user-super", "super_admin");
    const designer = addUser(seed, "user-designer", "designer");
    seed.tasks.push({
      ...structuredClone(demoSeedData.tasks[0]!),
      id: "task-dependent",
      ownerId: designer.id,
      status: "in_progress",
      completedAt: null
    });
    const { service } = setup(seed);

    await expect(
      service.update(publicUser(superAdmin), designer.id, {
        version: designer.version,
        role: "procurement"
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "RESPONSIBILITY_REASSIGNMENT_REQUIRED",
      message: "Reassign dependent work first."
    });
  });

  it("keeps inactive direct-report relationships valid across later reactivation", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = addUser(seed, "user-super", "super_admin");
    const manager = addUser(seed, "user-manager", "design_manager");
    const report = addUser(seed, "user-report", "designer", {
      active: false,
      managerId: manager.id
    });
    const { repository, service } = setup(seed);

    await expect(
      service.update(publicUser(superAdmin), manager.id, {
        version: manager.version,
        role: "procurement"
      })
    ).rejects.toMatchObject({ code: "RESPONSIBILITY_REASSIGNMENT_REQUIRED" });

    await service.update(publicUser(superAdmin), report.id, {
      version: report.version,
      active: true
    });
    await expect(repository.findUserById(manager.id)).resolves.toMatchObject({
      role: "design_manager"
    });
    await expect(repository.findUserById(report.id)).resolves.toMatchObject({
      active: true,
      managerId: manager.id
    });
  });

  it("deactivates despite active work, preserves links, revokes grants, and never restores them", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = addUser(seed, "user-super", "super_admin");
    const designer = addUser(seed, "user-designer", "designer");
    seed.tasks.push({
      ...structuredClone(demoSeedData.tasks[0]!),
      id: "task-kept-after-deactivation",
      ownerId: designer.id,
      status: "in_progress",
      completedAt: null
    });
    seed.projectAccessGrants.push(
      grant("grant-design", designer.id, "design"),
      grant("grant-tasks", designer.id, "tasks")
    );
    const { repository, service } = setup(seed);

    const deactivated = await service.update(publicUser(superAdmin), designer.id, {
      version: designer.version,
      active: false
    });
    expect(deactivated.user.active).toBe(false);
    expect(deactivated.revokedGrantCount).toBe(2);
    expect(deactivated.responsibilities.ownedActiveTasks).toBe(1);
    await expect(repository.findTaskById("task-kept-after-deactivation")).resolves.toMatchObject({
      ownerId: designer.id
    });
    await expect(repository.listActiveProjectAccessGrants(designer.id, "design")).resolves.toEqual([]);
    await expect(repository.listActiveProjectAccessGrants(designer.id, "tasks")).resolves.toEqual([]);

    const reactivated = await service.update(publicUser(superAdmin), designer.id, {
      version: deactivated.user.version,
      active: true
    });
    expect(reactivated).toMatchObject({ revokedGrantCount: 0, user: { active: true } });
    await expect(repository.listActiveProjectAccessGrants(designer.id, "design")).resolves.toEqual([]);

    const audits = await repository.listAuditEvents({ entityId: designer.id });
    expect(audits.map(({ action }) => action)).toEqual(
      expect.arrayContaining(["user.deactivated", "user.activated"])
    );
    expect(
      audits.find(({ action }) => action === "user.deactivated")?.newValues
    ).toMatchObject({
      responsibilities: { ownedActiveTasks: 1 }
    });
    expect(JSON.stringify(audits)).not.toMatch(/passwordHash|apiToken|clientSecret/i);
  });

  it("performs safe role changes with CAS and revokes every additive grant", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = addUser(seed, "user-super", "super_admin");
    const designer = addUser(seed, "user-designer", "designer");
    seed.projectAccessGrants.push(grant("grant-safe-role", designer.id));
    const { repository, service } = setup(seed);

    const result = await service.update(publicUser(superAdmin), designer.id, {
      version: designer.version,
      role: "procurement"
    });
    expect(result).toMatchObject({
      user: { id: designer.id, role: "procurement", version: 2 },
      revokedGrantCount: 1
    });
    expect(JSON.stringify(result)).not.toMatch(/password|hash|token|secret/i);
    await expect(repository.listActiveProjectAccessGrants(designer.id, "design")).resolves.toEqual([]);

    await expect(
      service.update(publicUser(superAdmin), designer.id, {
        version: designer.version,
        active: false
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
      message: "The user changed elsewhere."
    });
  });

  it("rolls back the user, grants, and audits when audit persistence fails", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = addUser(seed, "user-super", "super_admin");
    const designer = addUser(seed, "user-designer", "designer");
    seed.projectAccessGrants.push(grant("grant-rollback", designer.id));
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    vi.spyOn(audit, "append").mockRejectedValueOnce(
      new Error("simulated audit persistence failure")
    );
    const service = createUserAdministrationService(repository, audit, clock);

    await expect(
      service.update(publicUser(superAdmin), designer.id, {
        version: designer.version,
        role: "procurement"
      })
    ).rejects.toThrow("simulated audit persistence failure");
    await expect(repository.findUserById(designer.id)).resolves.toMatchObject({
      role: "designer",
      version: 1
    });
    await expect(
      repository.listActiveProjectAccessGrants(designer.id, "design")
    ).resolves.toHaveLength(1);
    await expect(repository.listAuditEvents({})).resolves.toEqual([]);
  });

  it("protects the last active Super Admin and serializes concurrent demotions", async () => {
    const oneSeed = emptyAdministrationSeed();
    const onlySuper = addUser(oneSeed, "user-only-super", "super_admin");
    const one = setup(oneSeed);
    await expect(
      one.service.update(publicUser(onlySuper), onlySuper.id, {
        version: onlySuper.version,
        active: false
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "LAST_SUPER_ADMIN",
      message: "At least one active Super Admin is required."
    });

    const seed = emptyAdministrationSeed();
    const first = addUser(seed, "user-super-first", "super_admin");
    const second = addUser(seed, "user-super-second", "super_admin");
    const { repository, service } = setup(seed);
    const settled = await Promise.allSettled([
      service.update(publicUser(first), first.id, { version: 1, role: "admin" }),
      service.update(publicUser(second), second.id, { version: 1, role: "admin" })
    ]);
    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejection = settled.find(({ status }) => status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: { code: "LAST_SUPER_ADMIN" }
    });
    await expect(repository.countActiveUsersByRole("super_admin")).resolves.toBe(1);
  });
});

describe("user administration routes", () => {
  it("does not implicitly authorize a canonical demo bearer identity", async () => {
    const seed = emptyAdministrationSeed();
    const demoAdmin = addUser(seed, "user-admin", "admin", {
      email: "admin@lisno.example",
      emailNormalized: "admin@lisno.example",
      accountKind: "development_demo"
    });
    const app = createApp({ repository: createMemoryRepository(seed), auth, clock });

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", bearer(demoAdmin));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "INVALID_TOKEN", message: "Authentication token is invalid." }
    });
  });

  it("returns exact directory and mutation envelopes without credential fields", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = addUser(seed, "user-super", "super_admin");
    addUser(seed, "admin-operator", "admin");
    const designer = addUser(seed, "user-designer", "designer");
    addUser(seed, "user-client", "client");
    const repository = createMemoryRepository(seed);
    const app = createApp({ repository, auth, clock });

    const directory = await request(app)
      .get("/api/v1/admin/users?search=designer&role=designer&active=true&limit=20&offset=0")
      .set("Authorization", bearer(superAdmin));
    expect(directory.status).toBe(200);
    expect(directory.body).toEqual({
      data: {
        items: [
          expect.objectContaining({
            id: designer.id,
            name: designer.name,
            email: designer.email,
            role: "designer",
            active: true,
            version: 1
          })
        ],
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        manageableRoles: ROLE_CODES
      }
    });
    expect(JSON.stringify(directory.body)).not.toMatch(/password|hash|token|secret/i);

    const mutation = await request(app)
      .patch(`/api/v1/admin/users/${designer.id}`)
      .set("Authorization", bearer(superAdmin))
      .send({ version: 1, role: "procurement" });
    expect(mutation.status).toBe(200);
    expect(mutation.body).toMatchObject({
      data: {
        user: { id: designer.id, role: "procurement", version: 2 },
        revokedGrantCount: 0,
        responsibilities: {
          ownedActiveLeads: 0,
          ownedActiveEstimates: 0,
          initiatedActiveProjects: 0,
          assignedActiveProjects: 0,
          managedActiveProjects: 0,
          ownedActiveTasks: 0,
          directReports: 0,
          linkedClientProjects: 0,
          adminInitiatorGrants: 0
        }
      }
    });
    expect(JSON.stringify(mutation.body)).not.toMatch(/password|hash|token|secret/i);
  });

  it("rejects every Admin directory request before input validation", async () => {
    const seed = emptyAdministrationSeed();
    const admin = addUser(seed, "admin-operator", "admin");
    const designer = addUser(seed, "user-designer", "designer");
    const app = createApp({ repository: createMemoryRepository(seed), auth, clock });

    const protectedFilter = await request(app)
      .get("/api/v1/admin/users?role=client")
      .set("Authorization", bearer(admin));
    expect(protectedFilter.status).toBe(403);

    for (const body of [
      { version: 1 },
      { version: 1, role: "procurement", active: false },
      { version: 1, active: false, unexpected: true }
    ]) {
      const response = await request(app)
        .patch(`/api/v1/admin/users/${designer.id}`)
        .set("Authorization", bearer(admin))
        .send(body);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("returns one observable generic forbidden response for every protected Admin target", async () => {
    const seed = emptyAdministrationSeed();
    const admin = addUser(seed, "admin-operator", "admin");
    const protectedUsers = [
      admin,
      addUser(seed, "user-admin-two", "admin"),
      addUser(seed, "user-super", "super_admin"),
      addUser(seed, "user-client", "client"),
      addUser(seed, "user-manager", "design_manager"),
      addUser(seed, "design-head-target", "design_head")
    ];
    const designer = addUser(seed, "user-designer", "designer");
    const app = createApp({ repository: createMemoryRepository(seed), auth, clock });
    const token = bearer(admin);
    const cases = [
      { userId: "user-missing", body: { version: 1, active: false } },
      { userId: "user-missing", body: { version: 999, active: false } },
      ...protectedUsers.flatMap((target) => [
        { userId: target.id, body: { version: target.version, active: false } },
        { userId: target.id, body: { version: target.version + 99, active: false } }
      ]),
      {
        userId: designer.id,
        body: { version: designer.version, role: "admin" }
      },
      {
        userId: designer.id,
        body: { version: designer.version + 99, role: "admin" }
      }
    ];
    const responses = [];
    for (const testCase of cases) {
      responses.push(
        await request(app)
          .patch(`/api/v1/admin/users/${testCase.userId}`)
          .set("Authorization", token)
          .send(testCase.body)
      );
    }
    const observable = (response: (typeof responses)[number]) => ({
      status: response.status,
      body: response.body,
      bodyKeys: Object.keys(response.body),
      errorKeys: Object.keys(response.body.error ?? {}),
      contentType: response.headers["content-type"]
    });
    const expected = {
      status: 403,
      body: {
        error: {
          code: "FORBIDDEN",
          message: "You are not authorized to perform this action."
        }
      },
      bodyKeys: ["error"],
      errorKeys: ["code", "message"],
      contentType: "application/json; charset=utf-8"
    };
    expect(responses.map(observable)).toEqual(cases.map(() => expected));
  });

  it("keeps global Super Admin missing and stale errors distinct", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = addUser(seed, "user-super", "super_admin");
    const designer = addUser(seed, "user-designer", "designer");
    const app = createApp({ repository: createMemoryRepository(seed), auth, clock });

    const missing = await request(app)
      .patch("/api/v1/admin/users/user-missing")
      .set("Authorization", bearer(superAdmin))
      .send({ version: 1, active: false });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found."
      }
    });

    const stale = await request(app)
      .patch(`/api/v1/admin/users/${designer.id}`)
      .set("Authorization", bearer(superAdmin))
      .send({ version: designer.version + 99, active: false });
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({
      error: {
        code: "VERSION_CONFLICT",
        message: "The user changed elsewhere."
      }
    });
  });
});
