import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAdminProjectService } from "../src/services/admin-project.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createProjectService } from "../src/services/project.service.js";
import { defaultProjectManagerId, withProjectInitiationDefault } from "./helpers/project-initiation-defaults.js";

const now = new Date("2026-11-15T10:00:00.000Z");
const base = {
  clientName: "Default test client", clientEmail: "default-client@example.test", clientMobile: "9000000000",
  projectName: "First project", propertyType: "Apartment", nextActionAt: "2026-11-20T10:00:00.000Z"
};

function setup(configured = true) {
  const seed = configured ? withProjectInitiationDefault(demoSeedData) : structuredClone(demoSeedData);
  seed.projects = [];
  seed.leads = [];
  seed.projectAccessGrants = [];
  seed.auditEvents = [];
  const repository = createMemoryRepository(seed);
  const audit = createAuditService(repository);
  const actor = seed.users.find(user => user.id === "user-estimator-sales")!;
  const service = createAdminProjectService(repository, audit, () => now);
  return { repository, audit, actor, service, seed };
}

describe("Default Project Manager at project creation", () => {
  it("creates a Sales-owned lead with the configured Project Manager and no Sales Manager grant", async () => {
    const { repository, service, actor } = setup();
    const result = await service.initiate(actor, { ...base, projectManagerDefaultVersion: 1 });
    await expect(repository.findProjectById(result.id)).resolves.toMatchObject({
      assignedEstimatorId: actor.id, programManagerId: defaultProjectManagerId, managerId: null
    });
    await expect(repository.findLeadById(result.lead!.id)).resolves.toMatchObject({ ownerId: actor.id });
    for (const id of [defaultProjectManagerId, "user-admin", actor.id]) {
      await expect(repository.listActiveProjectAccessGrants(id, "projects")).resolves.toEqual([]);
    }
    const events = await repository.pageAuditEvents({}, { limit: 20, offset: 0 });
    expect(events.items.map(event => event.action).sort()).toEqual(["lead_created", "project_created"]);
    expect(events.items).toContainEqual(expect.objectContaining({
      actorId: actor.id, action: "project_created",
      newValues: expect.objectContaining({ programManagerId: defaultProjectManagerId, projectManagerDefaultVersion: 1 })
    }));
  });

  it("uses a replacement only for future projects and replays the original request", async () => {
    const { repository, service, actor } = setup();
    const firstInput = { ...base, initiationKey: "default-first-intent", projectManagerDefaultVersion: 1 };
    const first = await service.initiate(actor, firstInput);
    const secondManager = await repository.createUser({ name: "Second Manager", email: "second-pm@example.test", role: "site_manager", passwordHash: "unused", active: true });
    await repository.runInTransaction(async transaction => {
      await transaction.coordinateAuthorizationMutation();
      await transaction.saveProjectInitiationDefaults({ projectManagerId: secondManager.id, version: 2, updatedById: "user-super-admin", updatedAt: now.toISOString() }, 1);
    });
    const second = await service.initiate(actor, { ...base, projectName: "Second project", initiationKey: "default-second-intent", projectManagerDefaultVersion: 2 });
    expect((await repository.findProjectById(first.id))?.programManagerId).toBe(defaultProjectManagerId);
    expect((await repository.findProjectById(second.id))?.programManagerId).toBe(secondManager.id);
    await repository.runInTransaction(async transaction => {
      await transaction.coordinateAuthorizationMutation();
      await transaction.updateUser(secondManager.id, secondManager.version, { active: false, updatedAt: now.toISOString() });
    });
    await expect(service.initiate(actor, firstInput)).resolves.toMatchObject({ id: first.id });
    expect((await repository.pageAllLeads({}, { limit: 20, offset: 0 })).total).toBe(2);
  });

  it.each(["unconfigured", "stale", "inactive"])("rejects %s defaults without project, lead, receipt, or invitation writes", async state => {
    const { repository, actor } = setup(state !== "unconfigured");
    if (state === "inactive") {
      const manager = (await repository.findUserById(defaultProjectManagerId))!;
      await repository.updateUser(manager.id, manager.version, { active: false, updatedAt: now.toISOString() });
    }
    const invitations = { send: vi.fn(), get: vi.fn() };
    const service = createAdminProjectService(repository, createAuditService(repository), () => now, invitations as never);
    const initiationKey = "invalid-default-intent";
    await expect(service.initiate(actor, { ...base, initiationKey, projectManagerDefaultVersion: state === "stale" ? 0 : undefined }))
      .rejects.toMatchObject({ code: state === "stale" ? "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT" : state === "inactive" ? "PROJECT_INITIATION_DEFAULT_UNAVAILABLE" : "PROJECT_INITIATION_DEFAULT_UNCONFIGURED" });
    expect((await repository.pageAllLeads({}, { limit: 20, offset: 0 })).total).toBe(0);
    expect((await repository.pageAuditEvents({}, { limit: 20, offset: 0 })).total).toBe(0);
    const receiptId = createHash("sha256").update(`${actor.id}:${initiationKey}`).digest("hex");
    await expect(repository.findProjectInitiationReceipt(receiptId)).resolves.toBeNull();
    expect(invitations.send).not.toHaveBeenCalled();
    expect(invitations.get).not.toHaveBeenCalled();
  });

  it("deduplicates simultaneous attempts and rejects changed payloads with the same key", async () => {
    const { repository, service, actor } = setup();
    const input = { ...base, initiationKey: "shared-creation-intent", projectManagerDefaultVersion: 1 };
    const [left, right] = await Promise.all([service.initiate(actor, input), service.initiate(actor, input)]);
    expect(left.id).toBe(right.id);
    expect((await repository.pageAllLeads({}, { limit: 20, offset: 0 })).total).toBe(1);
    await expect(service.initiate(actor, { ...input, projectName: "Changed intent" })).rejects.toMatchObject({ code: "INITIATION_KEY_REUSED" });
  });

  it("applies the default to internal Designer creation and preserves Design Manager identity", async () => {
    const { repository, audit, seed } = setup();
    const designer = seed.users.find(user => user.id === "user-designer-ananya")!;
    const manager = seed.users.find(user => user.role === "design_manager")!;
    const service = createProjectService(repository, audit, () => now);
    const created = await service.create(designer, {
      name: "Designer project", clientName: base.clientName, clientEmail: base.clientEmail, clientMobile: base.clientMobile,
      clientAddress: "Pune", assignedDesignerIds: [designer.id], managerId: manager.id, location: "Pune",
      plannedStartAt: now.toISOString(), plannedEndAt: "2026-12-01T00:00:00.000Z"
    });
    expect(created).toMatchObject({ programManagerId: defaultProjectManagerId, managerId: manager.id, initiatingDesignerId: designer.id });
  });
});
