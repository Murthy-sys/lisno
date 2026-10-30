import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { ACTIVE_ROLE_CODES, OPERATIONAL_ROLES, ROLE_CODES, type Role } from "../src/domain/roles.js";
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
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";

const JWT_SECRET = "user-administration-test-secret-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const clock = () => new Date("2026-08-17T12:00:00.000Z");

function emptyAdministrationSeed(): SeedData {
  const seed = structuredClone(demoSeedData);
  seed.users = seed.users.filter(({ id }) => id === "user-super-admin");
  seed.leads = [];
  seed.estimateResponsibilities = [];
  seed.projects = [];
  seed.tasks = [];
  seed.accessRequests = [];
  seed.projectAccessGrants = [];
  seed.auditEvents = [];
  return seed;
}

function canonicalSuperAdmin(seed: SeedData): UserRecord {
  return seed.users.find(({ id }) => id === "user-super-admin")!;
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
    vendorId: role === "vendor" ? "vendor-directory-fixture" : null,
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
    role: user.role,
    ...(user.role === "vendor" ? { vendorId: user.vendorId! } : {})
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

/**
 * Deliberately asymmetric directory fixture for the summary assertions:
 * - unequal role counts (3 designers, 2 admins, 1 client, 1 Super Admin),
 * - two inactive users spread across two different roles,
 * - most visible roles (procurement, finance_head, workers, ...) have no users.
 *
 * A symmetric fixture would let an off-by-one, a role leak, or a filter leak
 * pass unnoticed.
 */
function asymmetricDirectorySeed(): SeedData {
  const seed = emptyAdministrationSeed();
  addUser(seed, "user-designer-alpha", "designer");
  addUser(seed, "user-designer-beta", "designer");
  addUser(seed, "user-designer-gamma", "designer", { active: false });
  addUser(seed, "user-admin-one", "admin");
  addUser(seed, "user-admin-two", "admin");
  addUser(seed, "user-client-solo", "client", { active: false });
  return seed;
}

const ASYMMETRIC_SUMMARY = {
  total: 7,
  active: 5,
  inactive: 2,
  roleCount: 4
} as const;

function setup(seed = emptyAdministrationSeed()) {
  const repository = createMemoryRepository(seed);
  const audit = createAuditService(repository);
  const service = createUserAdministrationService(repository, audit, clock);
  return { repository, service };
}

describe("user administration service", () => {
  it("denies Admin directory access while Super Admin sees all roles", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = canonicalSuperAdmin(seed);
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
    expect(superPage.filterRoles).toEqual(ROLE_CODES);
    expect(superPage.manageableRoles).toEqual(
      ACTIVE_ROLE_CODES.filter((role) => role !== "super_admin" && role !== "vendor")
    );

    expect(JSON.stringify(superPage)).not.toMatch(/password|hash|token|secret/i);
  });

  it("summarizes the visible directory with consistent totals and present roles only", async () => {
    const seed = asymmetricDirectorySeed();
    const superAdmin = canonicalSuperAdmin(seed);
    const { repository, service } = setup(seed);

    const page = await service.list(publicUser(superAdmin), {}, { limit: 20, offset: 0 });

    // Exact shape: no extra, no missing field.
    expect(Object.keys(page.summary).sort()).toEqual([
      "active",
      "inactive",
      "roleCount",
      "total"
    ]);
    expect(page.summary).toEqual(ASYMMETRIC_SUMMARY);
    expect(page.summary.total).toBe(page.summary.active + page.summary.inactive);

    // roleCount counts the roles PRESENT among visible users, never the roles
    // the system defines.
    const presentRoles = new Set(seed.users.map(({ role }) => role));
    expect(page.summary.roleCount).toBe(presentRoles.size);
    expect(page.summary.roleCount).toBeLessThan(ROLE_CODES.length);

    // Visible roles that hold no user must still be offered as filters while
    // contributing nothing to roleCount.
    const emptyVisibleRoles = ROLE_CODES.filter((role) => !presentRoles.has(role));
    expect(emptyVisibleRoles.length).toBeGreaterThan(0);
    for (const role of emptyVisibleRoles) {
      expect(page.filterRoles).toContain(role);
    }

    // Scoped directly at the repository: "procurement" is visible but empty, so
    // it must not increment roleCount.
    await expect(
      repository.summarizeUsers(["designer", "procurement"])
    ).resolves.toEqual({ total: 3, active: 2, inactive: 1, roleCount: 1 });
    await expect(repository.summarizeUsers([])).resolves.toEqual({
      total: 0,
      active: 0,
      inactive: 0,
      roleCount: 0
    });
  });

  it("requires both current and destination roles to be operational for Admin", async () => {
    const seed = emptyAdministrationSeed();
    const admin = addUser(seed, "user-admin", "admin");
    const designer = addUser(seed, "user-designer", "designer");
    const protectedUsers = [
      admin,
      addUser(seed, "user-admin-two", "admin"),
      canonicalSuperAdmin(seed),
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
      canonicalSuperAdmin(seed),
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
    const superAdmin = canonicalSuperAdmin(seed);
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

  it("rejects a Super Admin destination before responsibility checks or writes", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = canonicalSuperAdmin(seed);
    const designer = addUser(seed, "user-designer", "designer");
    seed.tasks.push({
      ...structuredClone(demoSeedData.tasks[0]!),
      id: "task-blocking-promotion",
      ownerId: designer.id,
      status: "in_progress",
      completedAt: null
    });
    const { repository, service } = setup(seed);

    await expect(
      service.update(publicUser(superAdmin), designer.id, {
        version: designer.version,
        role: "super_admin"
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "ROLE_NOT_MANAGEABLE",
      message: "This role cannot be assigned."
    });
    await expect(repository.findUserById(designer.id)).resolves.toMatchObject({
      role: "designer",
      version: 1
    });
    await expect(repository.listAuditEvents({ entityId: designer.id })).resolves.toEqual([]);
  });

  it("rejects legacy-role assignment and directs old accounts through migration without writes", async () => {
    const seed = emptyAdministrationSeed();
    const operator = canonicalSuperAdmin(seed);
    const current = addUser(seed, "current-project-manager", "site_manager");
    const legacy = addUser(seed, "legacy-project-manager", "program_manager");
    const { repository, service } = setup(seed);
    const before = await repository.listUsers();
    await expect(service.update(publicUser(operator), current.id, { version: 1, role: "program_manager" }))
      .rejects.toMatchObject({ status: 400, code: "ROLE_NOT_MANAGEABLE" });
    await expect(service.update(publicUser(operator), legacy.id, { version: 1, role: "site_manager" }))
      .rejects.toMatchObject({ status: 409, code: "PROJECT_MANAGER_MIGRATION_REQUIRED" });
    expect(await repository.listUsers()).toEqual(before);
    expect(await repository.listAuditEvents({})).toEqual([]);
  });

  it("counts scalar and workflow responsibilities without treating historical rows as current", async () => {
    const seed = emptyAdministrationSeed();
    const operator = canonicalSuperAdmin(seed);
    const manager = addUser(seed, "project-manager-with-work", "site_manager");
    seed.projects = [
      { ...structuredClone(demoSeedData.projects[0]!), id: "active-scalar", status: "active", programManagerId: manager.id },
      { ...structuredClone(demoSeedData.projects[0]!), id: "completed-scalar", status: "completed", programManagerId: manager.id },
      { ...structuredClone(demoSeedData.projects[0]!), id: "other-scalar", status: "active", programManagerId: "someone-else" }
    ];
    seed.projectWorkflowAssignments = [
      { projectId: "current-work", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: manager.id, status: "open" },
      { projectId: "completed-work", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: manager.id, status: "completed" },
      { projectId: "superseded-work", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: manager.id, status: "open", supersededAt: clock().toISOString() },
      { projectId: "other-work", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: "someone-else", status: "open" }
    ];
    const { repository, service } = setup(seed);
    expect(await repository.countUserResponsibilities(manager.id)).toMatchObject({ assignedExecutionProjects: 1, assignedWorkflowTasks: 1 });
    await expect(service.update(publicUser(operator), manager.id, { version: 1, role: "procurement" }))
      .rejects.toMatchObject({ code: "RESPONSIBILITY_REASSIGNMENT_REQUIRED" });
    expect(await repository.findUserById(manager.id)).toMatchObject({ role: "site_manager", version: 1, sessionVersion: 1 });
    await service.update(publicUser(operator), manager.id, { version: 1, active: false });
    expect(await repository.findUserById(manager.id)).toMatchObject({ active: false, sessionVersion: 2 });
    await service.update(publicUser(operator), manager.id, { version: 2, active: true });
    expect(await repository.findUserById(manager.id)).toMatchObject({ active: true, sessionVersion: 3 });
    expect(await repository.countUserResponsibilities(manager.id)).toMatchObject({ assignedExecutionProjects: 1, assignedWorkflowTasks: 1 });
  });

  it("blocks changing any active workflow owner role even without a PM scalar", async () => {
    const seed = emptyAdministrationSeed();
    const owner = addUser(seed, "procurement-task-owner", "procurement");
    seed.projectWorkflowAssignments = [{ projectId: "project-a", kind: "procurement", assigneeRole: "procurement", assigneeUserId: owner.id, status: "open" }];
    const { service } = setup(seed);
    await expect(service.update(publicUser(canonicalSuperAdmin(seed)), owner.id, { version: 1, role: "site_manager" }))
      .rejects.toMatchObject({ code: "RESPONSIBILITY_REASSIGNMENT_REQUIRED" });
  });

  it("rejects repository creation and editing of the retired role", async () => {
    const seed = emptyAdministrationSeed();
    const manager = addUser(seed, "canonical-manager", "site_manager");
    const { repository } = setup(seed);
    await expect(repository.createUser({ ...manager, id: "new-legacy-user", email: "new-legacy@example.test", role: "program_manager" }))
      .rejects.toThrow(/legacy Program Manager/);
    await expect(repository.updateUser(manager.id, 1, { role: "program_manager", updatedAt: clock().toISOString() }))
      .rejects.toThrow(/legacy Program Manager/);
    expect(await repository.findUserById("new-legacy-user")).toBeNull();
    expect(await repository.findUserById(manager.id)).toMatchObject({ role: "site_manager", version: 1 });
  });

  it("rejects role change while dependent responsibilities remain", async () => {
    const seed = emptyAdministrationSeed();
    const superAdmin = canonicalSuperAdmin(seed);
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
    const superAdmin = canonicalSuperAdmin(seed);
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
    const superAdmin = canonicalSuperAdmin(seed);
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
    const superAdmin = canonicalSuperAdmin(seed);
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
    const superAdmin = canonicalSuperAdmin(seed);
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

  it("rejects every sole Super Admin mutation before version checks and writes", async () => {
    const seed = emptyAdministrationSeed();
    const onlySuper = canonicalSuperAdmin(seed);
    seed.projectAccessGrants.push(grant("grant-super-immutable", onlySuper.id));
    const { repository, service } = setup(seed);
    const attempts = [
      { version: onlySuper.version, role: "admin" as const },
      { version: onlySuper.version, role: "super_admin" as const },
      { version: onlySuper.version, active: false },
      { version: onlySuper.version, active: true },
      { version: onlySuper.version + 99, active: false }
    ];

    for (const input of attempts) {
      await expect(
        service.update(publicUser(onlySuper), onlySuper.id, input)
      ).rejects.toMatchObject({
        status: 409,
        code: "SOLE_SUPER_ADMIN_IMMUTABLE",
        message: "The sole Super Admin account cannot be changed."
      });
    }

    await expect(repository.findUserById(onlySuper.id)).resolves.toEqual(onlySuper);
    await expect(
      repository.listActiveProjectAccessGrants(onlySuper.id, "design")
    ).resolves.toHaveLength(1);
    await expect(repository.listAuditEvents({})).resolves.toEqual([]);
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
    const superAdmin = canonicalSuperAdmin(seed);
    addUser(seed, "admin-operator", "admin");
    const designer = addUser(seed, "user-designer", "designer");
    addUser(seed, "user-client", "client");
    const repository = createMemoryRepository(seed);
    const app = createApp({
      repository,
      auth,
      clock,
      developmentDemoAuthorization: developmentDemoAuthentication()
    });

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
        // The seeded directory holds four users across four distinct roles, all
        // active. The summary describes that whole directory even though the
        // request above is filtered down to a single designer.
        summary: { total: 4, active: 4, inactive: 0, roleCount: 4 },
        filterRoles: ROLE_CODES,
        manageableRoles: ACTIVE_ROLE_CODES.filter((role) => role !== "super_admin" && role !== "vendor")
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

  it("keeps the directory summary identical across search, role and status filters", async () => {
    const seed = asymmetricDirectorySeed();
    const superAdmin = canonicalSuperAdmin(seed);
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock,
      developmentDemoAuthorization: developmentDemoAuthentication()
    });
    const token = bearer(superAdmin);
    const query = (suffix: string) =>
      request(app)
        .get(`/api/v1/admin/users?limit=20&offset=0${suffix}`)
        .set("Authorization", token);

    const [unfiltered, searched, byRole, byStatus] = await Promise.all([
      query(""),
      query("&search=gamma"),
      query("&role=admin"),
      query("&active=false")
    ]);
    const responses = [unfiltered, searched, byRole, byStatus];
    for (const response of responses) {
      expect(response.status).toBe(200);
    }

    // AC4: search / role / active must never reach the summary aggregation.
    expect(
      responses.map((response) => response.body.data.summary)
    ).toEqual(responses.map(() => ASYMMETRIC_SUMMARY));

    // The filters genuinely applied, so the equality above is not vacuous.
    const ids = (response: (typeof responses)[number]) =>
      (response.body.data.items as { id: string }[]).map(({ id }) => id);
    expect(
      responses.map((response) => response.body.data.pagination.total)
    ).toEqual([7, 1, 2, 2]);
    expect(ids(unfiltered)).toHaveLength(7);
    expect(ids(searched)).toEqual(["user-designer-gamma"]);
    expect(ids(byRole)).toEqual(["user-admin-one", "user-admin-two"]);
    expect(ids(byStatus)).toEqual(["user-client-solo", "user-designer-gamma"]);
  });

  it("rejects every Admin directory request before input validation", async () => {
    const seed = emptyAdministrationSeed();
    const admin = addUser(seed, "admin-operator", "admin");
    const designer = addUser(seed, "user-designer", "designer");
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock,
      developmentDemoAuthorization: developmentDemoAuthentication()
    });

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
      canonicalSuperAdmin(seed),
      addUser(seed, "user-client", "client"),
      addUser(seed, "user-manager", "design_manager"),
      addUser(seed, "design-head-target", "design_head")
    ];
    const designer = addUser(seed, "user-designer", "designer");
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock,
      developmentDemoAuthorization: developmentDemoAuthentication()
    });
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
    const superAdmin = canonicalSuperAdmin(seed);
    const designer = addUser(seed, "user-designer", "designer");
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock,
      developmentDemoAuthorization: developmentDemoAuthentication()
    });

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

describe("user deletion", () => {
  it("retains identity and work, removes all directory/count visibility, revokes grants once, and forbids reactivation", async () => {
    const seed = asymmetricDirectorySeed();
    const actor = publicUser(canonicalSuperAdmin(seed));
    const target = seed.users.find(user => user.id === "user-designer-alpha")!;
    const unaffected = structuredClone(seed.users.find(user => user.id === "user-designer-beta")!);
    seed.tasks.push({ ...structuredClone(demoSeedData.tasks[0]!), id: "retained-deletion-task", ownerId: target.id, status: "in_progress", completedAt: null });
    seed.projectAccessGrants.push(grant("delete-one", target.id), grant("delete-two", target.id, "tasks"), grant("unaffected", unaffected.id));
    const { repository, service } = setup(seed);
    const deleted = await service.delete(actor, target.id, { version: 1 });
    expect(deleted).toEqual({ userId: target.id, deletedAt: clock().toISOString(), version: 2 });
    await expect(repository.findUserById(target.id)).resolves.toMatchObject({ active: false, deletedById: actor.id, deletedAt: clock().toISOString(), version: 2, sessionVersion: 2 });
    await expect(repository.findUserByEmail(target.email)).resolves.toMatchObject({ id: target.id });
    await expect(repository.listUsersByIds([target.id])).resolves.toHaveLength(1);
    await expect(repository.findTaskById("retained-deletion-task")).resolves.toMatchObject({ ownerId: target.id, status: "in_progress" });
    await expect(repository.findUserById(unaffected.id)).resolves.toEqual(unaffected);
    await expect(repository.listActiveProjectAccessGrants(target.id, "design")).resolves.toEqual([]);
    await expect(repository.listActiveProjectAccessGrants(target.id, "tasks")).resolves.toEqual([]);
    await expect(repository.listActiveProjectAccessGrants(unaffected.id, "design")).resolves.toHaveLength(1);
    for (const filters of [{}, { active: false }, { active: true }, { search: target.email }, { role: "designer" as const }]) {
      const page = await service.list(actor, filters, { limit: 20, offset: 0 });
      expect(page.items.some(user => user.id === target.id)).toBe(false);
      expect(page.summary).toEqual({ total: 6, active: 4, inactive: 2, roleCount: 4 });
      if ("search" in filters) expect(page.total).toBe(0);
    }
    const beforeRetry = await repository.listAuditEvents({});
    await expect(service.delete(actor, target.id, { version: 1 })).resolves.toEqual(deleted);
    await expect(repository.listAuditEvents({})).resolves.toEqual(beforeRetry);
    const deletionAudits = beforeRetry.filter(event => event.action === "user.deleted");
    expect(deletionAudits).toHaveLength(1);
    expect(deletionAudits[0]).toMatchObject({ actorId: actor.id, entityId: target.id, newValues: { active: false, version: 2, revokedGrantCount: 2, responsibilities: { ownedActiveTasks: 1 } } });
    expect(beforeRetry.filter(event => event.action === "project_access.revoked")).toHaveLength(2);
    expect(JSON.stringify(beforeRetry)).not.toMatch(/passwordHash|sessionVersion|storageKey/i);
    for (const input of [{ version: 2, active: true }, { version: 2, role: "procurement" as const }, { version: 1, active: false }]) {
      await expect(service.update(actor, target.id, input)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    }
    await expect(repository.updateUser(target.id, 2, { active: true, updatedAt: clock().toISOString() })).rejects.toThrow(/not found/);
  });

  it("increments an inactive vendor's session version and retains reserved membership", async () => {
    const seed = emptyAdministrationSeed();
    const vendor = addUser(seed, "delete-inactive-vendor", "vendor", { active: false, version: 4, sessionVersion: 7 });
    const { repository, service } = setup(seed);
    await service.delete(publicUser(canonicalSuperAdmin(seed)), vendor.id, { version: 4 });
    await expect(repository.findVendorBoundUsers(vendor.vendorId!)).resolves.toMatchObject([{ id: vendor.id, active: false, version: 5, sessionVersion: 8, deletedAt: clock().toISOString() }]);
    await expect(repository.findUserByEmail(vendor.email)).resolves.toMatchObject({ id: vendor.id });
    await expect(repository.summarizeUsers(ROLE_CODES)).resolves.toEqual({ total: 1, active: 1, inactive: 0, roleCount: 1 });
  });

  it("protects Super Admin before version checks and denies non-admin service callers without mutation", async () => {
    const seed = emptyAdministrationSeed();
    const actor = publicUser(canonicalSuperAdmin(seed));
    const target = addUser(seed, "delete-protected-target", "designer");
    const otherUsers = ROLE_CODES.filter(role => role !== "super_admin").map(role => addUser(seed, `delete-actor-${role}`, role));
    const { repository, service } = setup(seed);
    for (const version of [1, 99]) await expect(service.delete(actor, actor.id, { version })).rejects.toMatchObject({ status: 409, code: "SOLE_SUPER_ADMIN_IMMUTABLE" });
    for (const other of otherUsers) for (const id of [target.id, "missing", actor.id]) {
      await expect(service.delete(publicUser(other), id, { version: 1 })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    }
    await expect(service.delete(actor, "missing", { version: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(service.delete(actor, target.id, { version: 99 })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    await expect(repository.findUserById(target.id)).resolves.toEqual(target);
    await expect(repository.listAuditEvents({})).resolves.toEqual([]);
  });

  it("rolls back deletion and grant revocation if the deletion audit fails", async () => {
    const seed = emptyAdministrationSeed();
    const target = addUser(seed, "delete-rollback", "designer");
    seed.projectAccessGrants.push(grant("delete-rollback-grant", target.id));
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    const append = audit.append.bind(audit);
    vi.spyOn(audit, "append").mockImplementation((input, tx) => input.action === "user.deleted" ? Promise.reject(new Error("deletion audit failed")) : append(input, tx));
    const service = createUserAdministrationService(repository, audit, clock);
    await expect(service.delete(publicUser(canonicalSuperAdmin(seed)), target.id, { version: 1 })).rejects.toThrow("deletion audit failed");
    await expect(repository.findUserById(target.id)).resolves.toEqual(target);
    await expect(repository.listActiveProjectAccessGrants(target.id, "design")).resolves.toHaveLength(1);
    await expect(repository.listAuditEvents({})).resolves.toEqual([]);
  });

  it("exposes a strict redacted DELETE contract and denies malformed unauthorized requests before disclosure", async () => {
    const seed = emptyAdministrationSeed();
    const actor = canonicalSuperAdmin(seed);
    const target = addUser(seed, "delete-route-target", "designer");
    const admin = addUser(seed, "delete-route-admin", "admin");
    const repository = createMemoryRepository(seed);
    const app = createApp({ repository, auth, clock, developmentDemoAuthorization: developmentDemoAuthentication() });
    for (const body of [{}, { version: 0 }, { version: 1.5 }, { version: 1, active: false }]) {
      const invalid = await request(app).delete(`/api/v1/admin/users/${target.id}`).set("Authorization", bearer(actor)).send(body);
      expect(invalid.status).toBe(400);
      const forbidden = await request(app).delete("/api/v1/admin/users/missing").set("Authorization", bearer(admin)).send(body);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.code).toBe("FORBIDDEN");
    }
    const response = await request(app).delete(`/api/v1/admin/users/${target.id}`).set("Authorization", bearer(actor)).send({ version: 1 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { userId: target.id, deletedAt: clock().toISOString(), version: 2 } });
    const replay = await request(app).delete(`/api/v1/admin/users/${target.id}`).set("Authorization", bearer(actor)).send({ version: 1 });
    expect(replay.body).toEqual(response.body);
    const oldToken = await request(app).get("/api/v1/auth/me").set("Authorization", bearer(target));
    expect(oldToken.status).toBe(401);
  });
});
