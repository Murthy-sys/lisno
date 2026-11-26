import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { defaultWorkflowTimelines, type UpdateWorkflowTimelines } from "../src/contracts/workflow-timelines.js";
import { ROLE_CODES, type Role } from "../src/domain/roles.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository, SeedData, UserRecord } from "../src/repositories/types.js";
import { createWorkflowTimelinesRouter } from "../src/routes/workflow-timelines.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createAuthService, toPublicUser } from "../src/services/auth.service.js";
import { createWorkflowTimelinesService } from "../src/services/workflow-timelines.service.js";
import { keyCollectionReminderFixture } from "./fixtures/key-collection-reminders.js";

const secret = "workflow-timelines-test-secret-at-least-32-characters";
const now = "2026-11-27T10:00:00.000Z";
const clock = () => new Date(now);
const url = "/api/v1/admin/workflow-timelines";

function user(role: Role): UserRecord {
  return { ...structuredClone(demoSeedData.users[0]!), id: `timeline-${role}`, name: `Synthetic ${role}`,
    email: `${role}@timelines.example.test`, emailNormalized: `${role}@timelines.example.test`, role, active: true,
    accountKind: "standard", deletedAt: null, managerId: null, authorizedClientIds: [],
    vendorId: role === "vendor" ? "vendor-timeline-fixture" : null };
}
function seed(): SeedData {
  const data = structuredClone(demoSeedData);
  data.users = ROLE_CODES.map(user);
  data.auditEvents = [];
  delete data.workflowTimelineConfiguration;
  return data;
}
function setup(data = seed()) {
  const repository = createMemoryRepository(data);
  const audit = createAuditService(repository);
  const service = createWorkflowTimelinesService(repository, audit, clock);
  const auth = createAuthService(repository, { jwtSecret: secret, jwtExpiresInSeconds: 900 });
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createWorkflowTimelinesRouter(auth, service));
  app.use(errorHandler);
  return { repository, audit, service, app };
}
const actor = toPublicUser(user("super_admin"));
const bearer = (role: Role) => `Bearer ${jwt.sign({ id: user(role).id, role }, secret, { expiresIn: 900 })}`;
function input(expectedVersion = 0, design = 19, execution = 83): UpdateWorkflowTimelines {
  const bases = defaultWorkflowTimelines().bases;
  bases[0].designWorkdays = design;
  bases[3].executionWorkdays = execution;
  return { expectedVersion, bases };
}

describe("Workflow timeline configuration", () => {
  it("reads defaults without creating a setting or audit and serves private responses", async () => {
    const { app, repository } = setup();
    const response = await request(app).get(url).set("Authorization", bearer("super_admin")).expect(200);
    expect(response.body).toEqual({ data: defaultWorkflowTimelines() });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(await repository.findWorkflowTimelineConfiguration()).toBeNull();
    expect((await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(0);
  });

  it.each(ROLE_CODES.filter(role => role !== "super_admin"))("denies %s both read and update", async role => {
    const { app, repository } = setup();
    await request(app).get(url).set("Authorization", bearer(role)).expect(role === "program_manager" ? 401 : 403);
    await request(app).put(url).set("Authorization", bearer(role)).send(input()).expect(role === "program_manager" ? 401 : 403);
    expect(await repository.findWorkflowTimelineConfiguration()).toBeNull();
  });

  it("requires authentication and strictly validates complete configuration", async () => {
    const { app, repository } = setup();
    await request(app).get(url).expect(401);
    await request(app).put(url).send(input()).expect(401);
    await request(app).get(`${url}?projectId=foreign`).set("Authorization", bearer("super_admin")).expect(400);
    await request(app).put(`${url}?actorId=foreign`).set("Authorization", bearer("super_admin")).send(input()).expect(400);
    const badInputs: unknown[] = [
      { ...input(), expectedVersion: -1 }, { ...input(), expectedVersion: 0.5 },
      { ...input(), expectedVersion: Number.MAX_SAFE_INTEGER }, { ...input(), expectedVersion: "0" },
      { bases: input().bases }, { ...input(), updaterId: "foreign" },
      { ...input(), bases: input().bases.slice(1) },
      { ...input(), bases: [...input().bases, input().bases[0]] },
      { ...input(), bases: [input().bases[0], input().bases[0], ...input().bases.slice(2)] }
    ];
    for (const value of [0, -1, 1.5, 3651, "12", null]) {
      badInputs.push({ ...input(), bases: input().bases.map((row, i) => i ? row : { ...row, designWorkdays: value }) });
      badInputs.push({ ...input(), bases: input().bases.map((row, i) => i ? row : { ...row, executionWorkdays: value }) });
    }
    badInputs.push({ ...input(), bases: input().bases.map((row, i) => i ? row : { ...row, bandId: "unknown" }) });
    badInputs.push({ ...input(), bases: input().bases.map((row, i) => i ? row : { ...row, price: 100 }) });
    for (const invalid of badInputs) {
      const response = await request(app).put(url).set("Authorization", bearer("super_admin")).send(invalid).expect(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(Object.keys(response.body.error.fields).length).toBeGreaterThan(0);
    }
    expect(await repository.findWorkflowTimelineConfiguration()).toBeNull();
    expect((await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(0);
  });

  it("persists all eight bases, derives both matrices and audits actor, values and revisions", async () => {
    const { app, repository } = setup();
    const first = await request(app).put(url).set("Authorization", bearer("super_admin")).send(input()).expect(200);
    expect(first.body.data).toMatchObject({ version: 1, bases: input().bases, createdAt: now, updatedAt: now, updatedById: actor.id });
    expect(first.body.data.matrices.design[0].workdays).toEqual([19, 21, 23, 25, 27, 29, 31]);
    const second = await request(app).put(url).set("Authorization", bearer("super_admin")).send(input(1, 21, 91)).expect(200);
    expect(second.body.data).toMatchObject({ version: 2, bases: input(1, 21, 91).bases, createdAt: now });
    const read = await request(app).get(url).set("Authorization", bearer("super_admin")).expect(200);
    expect(read.body).toEqual(second.body);
    expect(await repository.findWorkflowTimelineConfiguration()).not.toHaveProperty("matrices");
    const audits = (await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).items;
    expect(audits).toHaveLength(2);
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: actor.id, action: "workflow_timelines_updated", entityId: "organization",
        oldValues: { version: 0, bases: defaultWorkflowTimelines().bases }, newValues: { version: 1, bases: input().bases } }),
      expect.objectContaining({ oldValues: { version: 1, bases: input().bases }, newValues: { version: 2, bases: input(1, 21, 91).bases } })
    ]));
    await request(app).put(url).set("Authorization", bearer("super_admin")).send(input()).expect(409);
    expect((await repository.findWorkflowTimelineConfiguration())?.version).toBe(2);
  });

  it.each(["inactive", "deleted", "wrong_role", "missing"])("rechecks stored actor on reads and saves: %s", async reason => {
    const data = seed();
    const stored = data.users.find(row => row.id === actor.id)!;
    if (reason === "inactive") stored.active = false;
    if (reason === "deleted") stored.deletedAt = now;
    if (reason === "wrong_role") stored.role = "admin";
    if (reason === "missing") data.users = data.users.filter(row => row.id !== actor.id);
    const { service, repository } = setup(data);
    await expect(service.read(actor)).rejects.toMatchObject({ status: 401 });
    await expect(service.update(actor, input())).rejects.toMatchObject({ status: 401 });
    expect(await repository.findWorkflowTimelineConfiguration()).toBeNull();
  });

  it.each([0, 2])("rejects noncanonical Super Admin count %s", async count => {
    const { repository, audit } = setup();
    const guarded: AppRepository = { ...repository, countActiveUsersByRole: async () => count,
      runInTransaction: operation => repository.runInTransaction(transaction => operation({ ...transaction, countActiveUsersByRole: async () => count })) };
    const service = createWorkflowTimelinesService(guarded, audit, clock);
    await expect(service.read(actor)).rejects.toMatchObject({ status: 403 });
    await expect(service.update(actor, input())).rejects.toMatchObject({ status: 403 });
    expect(await repository.findWorkflowTimelineConfiguration()).toBeNull();
  });

  it.each([0, 1])("serializes competing saves at version %s with one committed winner", async version => {
    const { repository, service } = setup();
    if (version) await service.update(actor, input());
    const results = await Promise.allSettled([service.update(actor, input(version, 23)), service.update(actor, input(version, 27))]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason)
      .toMatchObject({ status: 409, code: "WORKFLOW_TIMELINES_VERSION_CONFLICT" });
    expect((await repository.findWorkflowTimelineConfiguration())?.version).toBe(version + 1);
    expect((await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(version + 1);
  });

  it.each([false, true])("rolls back config when audit fails, existing=%s", async existing => {
    const { repository, service, audit } = setup();
    if (existing) await service.update(actor, input());
    const before = await repository.findWorkflowTimelineConfiguration();
    const failing = createWorkflowTimelinesService(repository, { ...audit, append: vi.fn(async (entry: Parameters<typeof audit.append>[0], transaction?: Parameters<typeof audit.append>[1]) => { await audit.append(entry, transaction); throw new Error("audit unavailable"); }) }, clock);
    await expect(failing.update(actor, input(existing ? 1 : 0, 29))).rejects.toThrow("audit unavailable");
    expect(await repository.findWorkflowTimelineConfiguration()).toEqual(before);
    expect((await repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(existing ? 1 : 0);
  });

  it("does not change project, approved-estimate evidence, stages or confirmed key appointment", async () => {
    const fixture = await keyCollectionReminderFixture([{ id: "timeline-project-one" }, { id: "timeline-project-two", hours: 72 }]);
    const repository = fixture.repository;
    const projectIds = fixture.seed.projects.map(project => project.id);
    const read = async () => Promise.all(projectIds.map(async id => ({
      project: await repository.findProjectById(id), estimate: await repository.findProjectStatusEstimateEvidence(id),
      workflow: await repository.findDesignWorkflowState(id)
    })));
    const before = await read();
    const service = createWorkflowTimelinesService(repository, createAuditService(repository), clock);
    await service.update(fixture.admin, input());
    expect(await read()).toEqual(before);
  });
});
