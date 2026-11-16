import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { ProjectModel } from "../src/models/Project.js";
import { LeadModel } from "../src/models/Lead.js";
import { UserModel } from "../src/models/User.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { ProjectInitiationReceiptModel } from "../src/models/ProjectClientInvitation.js";
import { ProjectInitiationDefaultsModel } from "../src/models/ProjectInitiationDefaults.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { AppRepository } from "../src/repositories/types.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createAdminProjectService } from "../src/services/admin-project.service.js";
import { resolveApprovalProject } from "../src/services/estimate-project-handoff.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { defaultProjectManagerId, insertProjectInitiationDefault } from "./helpers/project-initiation-defaults.js";

const now = new Date("2026-11-15T10:00:00.000Z");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([UserModel.syncIndexes(), ProjectInitiationDefaultsModel.syncIndexes(), ProjectInitiationReceiptModel.syncIndexes(), AuthorizationCoordinationModel.syncIndexes()]);
}, 120_000);
afterAll(async () => replica.stop());
beforeEach(async () => { await replica.clear(); });

const input = {
  clientName: "New client", clientEmail: "new-client@example.test", clientMobile: "9000000000",
  projectName: "Project A", propertyType: "Apartment", nextActionAt: "2026-11-20T00:00:00.000Z"
};

async function setup(configured = true) {
  await UserModel.create({ _id: "sales-creator", name: "Sales creator", role: "estimator_sales", email: "sales@example.test",
    emailNormalized: "sales@example.test", passwordHash: "unused", active: true, accountKind: "standard" });
  if (configured) await insertProjectInitiationDefault();
  const repository = createMongoRepository();
  const audit = createAuditService(repository);
  const service = createAdminProjectService(repository, audit, () => now);
  const actor = (await repository.findUserById("sales-creator"))!;
  return { repository, service, audit, actor };
}

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Project creation default assignment in Mongo transactions", () => {
  it.each([
    { change: "replacement", code: "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT" },
    { change: "deactivation", code: "PROJECT_INITIATION_DEFAULT_UNAVAILABLE" }
  ])("revalidates creation after a coordinated concurrent default $change", async ({ change, code }) => {
    const { repository, audit, actor } = await setup();
    const locked = signal();
    const release = signal();
    const attempted = signal();
    const guarded: AppRepository = { ...repository,
      runInTransaction: operation => repository.runInTransaction(transaction => operation({ ...transaction,
        coordinateAuthorizationMutation: async () => {
          attempted.resolve();
          await transaction.coordinateAuthorizationMutation();
        }
      })) };
    const service = createAdminProjectService(guarded, audit, () => now);
    await UserModel.create({ _id: "replacement-pm", name: "Replacement PM", role: "site_manager",
      email: "replacement-pm@example.test", emailNormalized: "replacement-pm@example.test", passwordHash: "unused", active: true });

    const changing = repository.runInTransaction(async transaction => {
      await transaction.coordinateAuthorizationMutation();
      if (change === "replacement") {
        await transaction.saveProjectInitiationDefaults({ projectManagerId: "replacement-pm", version: 2,
          updatedById: "fixture-admin", updatedAt: now.toISOString() }, 1);
      } else {
        const manager = (await transaction.findUserById(defaultProjectManagerId))!;
        await transaction.updateUser(manager.id, manager.version, { active: false, updatedAt: now.toISOString() });
      }
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const creating = service.initiate(actor, { ...input, initiationKey: `racing-${change}-intent`, projectManagerDefaultVersion: 1 });
    const rejected = expect(creating).rejects.toMatchObject({ status: 409, code });
    await attempted.promise;
    release.resolve();
    await changing;
    await rejected;

    expect(await ProjectModel.countDocuments()).toBe(0);
    expect(await LeadModel.countDocuments()).toBe(0);
    expect(await ProjectInitiationReceiptModel.countDocuments()).toBe(0);
    expect(await ProjectAccessGrantModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    if (change === "replacement") {
      expect(await ProjectInitiationDefaultsModel.findById("organization").lean()).toMatchObject({ version: 2, projectManagerId: "replacement-pm" });
    } else {
      expect(await UserModel.findById(defaultProjectManagerId).lean()).toMatchObject({ active: false });
    }
  }, 30_000);

  it("creates without an implicit manager grant and preserves assignment on concurrent duplicate replay", async () => {
    const { repository, service, actor } = await setup();
    const request = { ...input, initiationKey: "mongo-shared-intent", projectManagerDefaultVersion: 1 };
    const [left, right] = await Promise.all([service.initiate(actor, request), service.initiate(actor, request)]);
    expect(left.id).toBe(right.id);
    expect((await repository.findProjectById(left.id))?.programManagerId).toBe(defaultProjectManagerId);
    expect(await ProjectModel.countDocuments()).toBe(1);
    expect(await LeadModel.countDocuments()).toBe(1);
    expect(await ProjectInitiationReceiptModel.countDocuments()).toBe(1);
    expect(await ProjectAccessGrantModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(2);
    await UserModel.updateOne({ _id: defaultProjectManagerId }, { $set: { active: false } });
    await expect(service.initiate(actor, request)).resolves.toMatchObject({ id: left.id });
  });

  it("assigns a changed default only to later projects and rejects an observed stale version without writes", async () => {
    const { repository, service, actor } = await setup();
    const first = await service.initiate(actor, { ...input, projectManagerDefaultVersion: 1 });
    await UserModel.create({ _id: "second-pm", name: "Second PM", role: "site_manager", email: "second@example.test",
      emailNormalized: "second@example.test", passwordHash: "unused", active: true });
    await repository.runInTransaction(async transaction => {
      await transaction.coordinateAuthorizationMutation();
      await transaction.saveProjectInitiationDefaults({ projectManagerId: "second-pm", version: 2, updatedById: "fixture-admin", updatedAt: now.toISOString() }, 1);
    });
    await expect(service.initiate(actor, { ...input, projectManagerDefaultVersion: 1, initiationKey: "stale-mongo-intent" }))
      .rejects.toMatchObject({ code: "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT" });
    const second = await service.initiate(actor, { ...input, projectName: "Project B", projectManagerDefaultVersion: 2 });
    expect((await repository.findProjectById(first.id))?.programManagerId).toBe(defaultProjectManagerId);
    expect((await repository.findProjectById(second.id))?.programManagerId).toBe("second-pm");
    expect(await ProjectModel.countDocuments()).toBe(2);
    expect(await ProjectInitiationReceiptModel.countDocuments()).toBe(0);
  });

  it("rolls back new creation and leaves no audit or receipt when configuration is absent", async () => {
    const { service, actor } = await setup(false);
    await expect(service.initiate(actor, { ...input, initiationKey: "missing-mongo-intent" }))
      .rejects.toMatchObject({ code: "PROJECT_INITIATION_DEFAULT_UNCONFIGURED" });
    expect(await ProjectModel.countDocuments()).toBe(0);
    expect(await LeadModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await ProjectInitiationReceiptModel.countDocuments()).toBe(0);
  });

  it("audits the real approval actor and leaves a linked project independent of later defaults", async () => {
    const { audit } = await setup();
    const lead = { projectId: null, ownerId: "sales-creator", projectName: "Approved project", clientName: "Client",
      clientEmail: "approval@example.test", clientMobile: "9000000000", location: "Pune" };
    const id = await mongoose.connection.transaction(session => resolveApprovalProject({
      estimate: { projectId: null, ownerId: lead.ownerId }, lead, clientId: null, occurredAt: now, session,
      actorId: "client-approver", audit
    }));
    expect((await ProjectModel.findById(id).lean())?.programManagerId).toBe(defaultProjectManagerId);
    expect(await AuditEventModel.findOne({ entityId: id }).lean()).toMatchObject({
      actorId: "client-approver", action: "project_created",
      newValues: { programManagerId: defaultProjectManagerId, projectManagerDefaultVersion: 1 }
    });
    await ProjectInitiationDefaultsModel.deleteMany({});
    await expect(mongoose.connection.transaction(session => resolveApprovalProject({
      estimate: { projectId: id, ownerId: lead.ownerId }, lead: { ...lead, projectId: id }, clientId: null,
      occurredAt: now, session, actorId: "client-approver", audit
    }))).resolves.toBe(id);
    expect((await ProjectModel.findById(id).lean())?.programManagerId).toBe(defaultProjectManagerId);
    expect(await ProjectModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });
});
