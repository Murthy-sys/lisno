import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ROLE_CODES, type Role } from "../src/domain/roles.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository, SeedData, UserRecord } from "../src/repositories/types.js";
import { createProjectInitiationDefaultsRouter } from "../src/routes/project-initiation-defaults.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createAuthService, toPublicUser } from "../src/services/auth.service.js";
import { createProjectInitiationDefaultsService } from "../src/services/project-initiation-defaults.service.js";

const jwtSecret = "project-defaults-test-secret-at-least-32-characters";
const now = "2026-11-15T10:00:00.000Z";
const clock = () => new Date(now);
const url = "/api/v1/admin/project-initiation-defaults";

function user(role: Role, id = `actor-${role}`, changes: Partial<UserRecord> = {}): UserRecord {
  return { ...structuredClone(demoSeedData.users[0]!), id, name: id,
    email: `${id}@example.test`, emailNormalized: `${id}@example.test`, role, active: true,
    accountKind: "standard", deletedAt: null, managerId: null, authorizedClientIds: [],
    vendorId: role === "vendor" ? "vendor-defaults-fixture" : null, ...changes };
}

function seed(): SeedData {
  const result = structuredClone(demoSeedData);
  result.users = [...ROLE_CODES.map(role => user(role)), user("site_manager", "pm-b", { name: "Second Project Manager" })];
  result.auditEvents = [];
  delete result.projectInitiationDefaults;
  return result;
}

function setup(data = seed()) {
  const repository = createMemoryRepository(data);
  const audit = createAuditService(repository);
  const service = createProjectInitiationDefaultsService(repository, audit, clock);
  const auth = createAuthService(repository, { jwtSecret, jwtExpiresInSeconds: 900 });
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProjectInitiationDefaultsRouter(auth, service));
  app.use(errorHandler);
  return { repository, audit, service, app };
}

function bearer(role: Role) {
  return `Bearer ${jwt.sign({ id: `actor-${role}`, role }, jwtSecret, { expiresIn: 900 })}`;
}
const superAdmin = toPublicUser(user("super_admin"));
const initial = { expectedVersion: 0, projectManagerId: "actor-site_manager" };

describe("Project initiation default settings", () => {
  it.each(["admin", "estimator_sales", "super_admin"] as const)("allows %s to read only a minimal default projection", async role => {
    const { app, service } = setup();
    const empty = await request(app).get(url).set("Authorization", bearer(role)).expect(200);
    expect(empty.body).toEqual({ data: { version: 0, status: "unconfigured", projectManager: null } });
    expect(empty.headers["cache-control"]).toBe("no-store");
    await service.update(superAdmin, initial);
    const ready = await request(app).get(url).set("Authorization", bearer(role)).expect(200);
    expect(ready.body).toEqual({ data: { version: 1, status: "ready", projectManager: { id: "actor-site_manager", name: "actor-site_manager" } } });
    expect(JSON.stringify(ready.body)).not.toContain("example.test");
  });

  it.each(ROLE_CODES.filter(role => !["super_admin", "admin", "estimator_sales", "program_manager"].includes(role)))("denies settings reads and writes to %s", async role => {
    const { app, repository } = setup();
    await request(app).get(url).set("Authorization", bearer(role)).expect(403);
    await request(app).put(url).set("Authorization", bearer(role)).send(initial).expect(403);
    expect(await repository.findProjectInitiationDefaults()).toBeNull();
  });

  it.each(["admin", "estimator_sales"] as const)("denies %s global changes even with a valid selectable manager", async role => {
    const { app, repository } = setup();
    await request(app).put(url).set("Authorization", bearer(role)).send(initial).expect(403);
    expect((await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).items).toEqual([]);
    expect(await repository.findProjectInitiationDefaults()).toBeNull();
  });

  it("requires authentication and rejects invalid query/body contracts without writes", async () => {
    const { app, repository } = setup();
    await request(app).get(url).expect(401);
    await request(app).put(url).send(initial).expect(401);
    await request(app).get(`${url}?actorId=someone`).set("Authorization", bearer("super_admin")).expect(400);
    for (const input of [
      { ...initial, expectedVersion: -1 }, { ...initial, expectedVersion: 0.5 },
      { ...initial, expectedVersion: Number.MAX_SAFE_INTEGER + 1 }, { ...initial, expectedVersion: "0" },
      { ...initial, projectManagerId: " " }, { ...initial, projectManagerId: "x".repeat(161) },
      { ...initial, actorId: "someone" }, { projectManagerId: initial.projectManagerId }
    ]) await request(app).put(url).set("Authorization", bearer("super_admin")).send(input).expect(400);
    expect(await repository.findProjectInitiationDefaults()).toBeNull();
  });

  it("saves/replaces one default and audits stable IDs and versions only", async () => {
    const { app, repository } = setup();
    await request(app).put(url).set("Authorization", bearer("super_admin")).send(initial).expect(200);
    const replacement = await request(app).put(url).set("Authorization", bearer("super_admin"))
      .send({ expectedVersion: 1, projectManagerId: "pm-b" }).expect(200);
    expect(replacement.body.data).toEqual({ version: 2, status: "ready", projectManager: { id: "pm-b", name: "Second Project Manager" } });
    expect(await repository.findProjectInitiationDefaults()).toEqual({ projectManagerId: "pm-b", version: 2, updatedById: superAdmin.id, updatedAt: now });
    const audits = (await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).items;
    expect(audits).toHaveLength(2);
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: superAdmin.id, action: "project_initiation_defaults_updated", entityId: "organization",
        oldValues: { projectManagerId: null, version: 0 }, newValues: { projectManagerId: initial.projectManagerId, version: 1 } }),
      expect.objectContaining({ oldValues: { projectManagerId: initial.projectManagerId, version: 1 }, newValues: { projectManagerId: "pm-b", version: 2 } })
    ]));
    expect(JSON.stringify(audits)).not.toContain("example.test");
  });

  it("does not rewrite or audit a current-version no-op and rejects an old version for the same ID", async () => {
    const { service, repository } = setup();
    await service.update(superAdmin, initial);
    const stored = await repository.findProjectInitiationDefaults();
    await expect(service.update(superAdmin, { ...initial, expectedVersion: 1 })).resolves.toMatchObject({ version: 1 });
    await expect(service.update(superAdmin, initial)).rejects.toMatchObject({ status: 409, code: "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT" });
    expect(await repository.findProjectInitiationDefaults()).toEqual(stored);
    expect((await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(1);
  });

  it.each(["missing", "admin", "program_manager", "inactive", "deleted"])("rejects invalid target %s without setting/audit writes", async reason => {
    const data = seed();
    const target = data.users.find(row => row.id === initial.projectManagerId)!;
    if (reason === "missing") data.users = data.users.filter(row => row.id !== target.id);
    if (reason === "admin") target.role = "admin";
    if (reason === "program_manager") target.role = "program_manager";
    if (reason === "inactive") target.active = false;
    if (reason === "deleted") target.deletedAt = now;
    const { service, repository } = setup(data);
    await expect(service.update(superAdmin, initial)).rejects.toMatchObject({ status: 400, fields: { projectManagerId: "Select an active Project Manager." } });
    expect(await repository.findProjectInitiationDefaults()).toBeNull();
    expect((await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(0);
  });

  it.each(["inactive", "deleted", "wrong_role", "missing"])("rechecks the setting actor: %s", async reason => {
    const data = seed();
    const actor = data.users.find(row => row.id === superAdmin.id)!;
    if (reason === "inactive") actor.active = false;
    if (reason === "deleted") actor.deletedAt = now;
    if (reason === "wrong_role") actor.role = "admin";
    if (reason === "missing") data.users = data.users.filter(row => row.id !== actor.id);
    const { service, repository } = setup(data);
    await expect(service.update(superAdmin, initial)).rejects.toMatchObject({ status: 401 });
    expect(await repository.findProjectInitiationDefaults()).toBeNull();
  });

  it.each([0, 2])("rejects a noncanonical active Super Admin count of %s before writes", async count => {
    const { repository, audit } = setup();
    const guarded: AppRepository = { ...repository,
      runInTransaction: operation => repository.runInTransaction(transaction => operation({ ...transaction, countActiveUsersByRole: async () => count })) };
    const service = createProjectInitiationDefaultsService(guarded, audit, clock);
    await expect(service.update(superAdmin, initial)).rejects.toMatchObject({ status: 403 });
    expect(await repository.findProjectInitiationDefaults()).toBeNull();
    expect((await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(0);
  });

  it("returns unavailable without the old person's details and refuses an inactive no-op", async () => {
    const data = seed();
    data.projectInitiationDefaults = { projectManagerId: initial.projectManagerId, version: 3, updatedById: superAdmin.id, updatedAt: now };
    data.users.find(row => row.id === initial.projectManagerId)!.active = false;
    const { service, repository } = setup(data);
    await expect(service.read(superAdmin)).resolves.toEqual({ version: 3, status: "unavailable", projectManager: null });
    await expect(service.update(superAdmin, { ...initial, expectedVersion: 3 })).rejects.toMatchObject({ status: 400 });
    expect((await repository.findProjectInitiationDefaults())?.version).toBe(3);
  });

  it("serializes competing initial saves into one winner and one version conflict", async () => {
    const { service, repository } = setup();
    const results = await Promise.allSettled([
      service.update(superAdmin, initial), service.update(superAdmin, { ...initial, projectManagerId: "pm-b" })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, code: "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT" });
    expect((await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(1);
  });

  it("rolls the setting back if its audit write fails", async () => {
    const { repository, audit } = setup();
    const failing = createProjectInitiationDefaultsService(repository, { ...audit, append: vi.fn().mockRejectedValue(new Error("audit unavailable")) }, clock);
    await expect(failing.update(superAdmin, initial)).rejects.toThrow("audit unavailable");
    expect(await repository.findProjectInitiationDefaults()).toBeNull();
  });
});
