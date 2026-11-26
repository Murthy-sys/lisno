import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkflowTimelines, type UpdateWorkflowTimelines } from "../src/contracts/workflow-timelines.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { WorkflowTimelineConfigurationModel } from "../src/models/WorkflowTimelineConfiguration.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { toPublicUser } from "../src/services/auth.service.js";
import { createWorkflowTimelinesService } from "../src/services/workflow-timelines.service.js";
import { keyCollectionReminderFixture } from "./fixtures/key-collection-reminders.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const now = "2026-11-27T10:00:00.000Z";
const clock = () => new Date(now);
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("workflow-timelines");
  await Promise.all([UserModel.syncIndexes(), AuditEventModel.syncIndexes(), AuthorizationCoordinationModel.syncIndexes(),
    WorkflowTimelineConfigurationModel.syncIndexes(), ProjectModel.syncIndexes(), EstimateModel.syncIndexes(), DesignWorkflowStateModel.syncIndexes()]);
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

function input(expectedVersion = 0, design = 17, execution = 89): UpdateWorkflowTimelines {
  const bases = defaultWorkflowTimelines().bases;
  bases[0].designWorkdays = design;
  bases[3].executionWorkdays = execution;
  return { expectedVersion, bases };
}
async function setup() {
  const data = structuredClone(demoSeedData);
  const user = data.users.find(candidate => candidate.role === "super_admin")!;
  user.accountKind = "standard";
  user.email = user.emailNormalized = "admin@timelines.example.test";
  data.users = [user];
  data.auditEvents = [];
  delete data.workflowTimelineConfiguration;
  await UserModel.create({ ...user, _id: user.id });
  const actor = toPublicUser(user);
  const repository = createMongoRepository();
  const audit = createAuditService(repository);
  const service = createWorkflowTimelinesService(repository, audit, clock);
  const memory = createMemoryRepository(data);
  const memoryService = createWorkflowTimelinesService(memory, createAuditService(memory), clock);
  return { actor, repository, audit, service, memory, memoryService };
}

describe("Workflow timeline configuration Mongo transactions", () => {
  it("matches memory for write-free defaults, saves, refreshes and stable band order", async () => {
    const { actor, repository, service, memory, memoryService } = await setup();
    expect(await service.read(actor)).toEqual(await memoryService.read(actor));
    expect(await WorkflowTimelineConfigurationModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    for (const update of [input(), input(1, 31, 101)]) {
      update.bases.reverse();
      expect(await service.update(actor, update)).toEqual(await memoryService.update(actor, update));
      expect(await repository.findWorkflowTimelineConfiguration()).toEqual(await memory.findWorkflowTimelineConfiguration());
      expect(await service.read(actor)).toEqual(await memoryService.read(actor));
    }
    expect(await WorkflowTimelineConfigurationModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(2);
    const stored = await WorkflowTimelineConfigurationModel.findOne().lean();
    expect(stored).not.toHaveProperty("matrices");
    const audits = await AuditEventModel.find().sort({ "newValues.version": 1 }).lean();
    expect(audits[1]).toMatchObject({ actorId: actor.id, entityType: "workflow_timelines", entityId: "organization",
      action: "workflow_timelines_updated", oldValues: { version: 1, bases: input().bases }, newValues: { version: 2, bases: input(1, 31, 101).bases } });
  });

  it.each([0, 1])("commits one winner and one audit for concurrent saves from version %s", async version => {
    const { actor, repository, service } = await setup();
    if (version) await service.update(actor, input());
    const results = await Promise.allSettled([
      service.update(actor, input(version, 23)), service.update(actor, input(version, 29))
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason)
      .toMatchObject({ status: 409, code: "WORKFLOW_TIMELINES_VERSION_CONFLICT" });
    const winner = (results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof service.update>>>).value;
    expect(await service.read(actor)).toEqual(winner);
    expect((await repository.findWorkflowTimelineConfiguration())?.version).toBe(version + 1);
    expect(await WorkflowTimelineConfigurationModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(version + 1);
  });

  it.each([false, true])("rolls configuration back if the audit insert fails, existing=%s", async existing => {
    const { actor, repository, service, audit } = await setup();
    if (existing) await service.update(actor, input());
    const before = await repository.findWorkflowTimelineConfiguration();
    const failing = createWorkflowTimelinesService(repository, { ...audit, append: vi.fn(async (entry: Parameters<typeof audit.append>[0], transaction?: Parameters<typeof audit.append>[1]) => { await audit.append(entry, transaction); throw new Error("audit unavailable"); }) }, clock);
    await expect(failing.update(actor, input(existing ? 1 : 0, 39))).rejects.toThrow("audit unavailable");
    expect(await repository.findWorkflowTimelineConfiguration()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(existing ? 1 : 0);
  });

  it("does not leave an audit behind when persistence fails and requires a transaction", async () => {
    const { actor, repository, service } = await setup();
    await service.update(actor, input());
    const before = await repository.findWorkflowTimelineConfiguration();
    await expect(repository.saveWorkflowTimelineConfiguration(before!, 1)).rejects.toThrow("require a transaction");
    const save = vi.spyOn(WorkflowTimelineConfigurationModel, "updateOne").mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(service.update(actor, input(1, 32))).rejects.toThrow("storage unavailable");
    save.mockRestore();
    expect(await repository.findWorkflowTimelineConfiguration()).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });

  it("rechecks deactivated actors before reads and saves without adding settings or audits", async () => {
    const { actor, repository, service } = await setup();
    await UserModel.updateOne({ _id: actor.id }, { $set: { active: false } });
    await expect(service.read(actor)).rejects.toMatchObject({ status: 401 });
    await expect(service.update(actor, input())).rejects.toMatchObject({ status: 401 });
    expect(await repository.findWorkflowTimelineConfiguration()).toBeNull();
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("leaves two projects, approved estimates and saved appointments unchanged", async () => {
    const { actor, service } = await setup();
    const { seed } = await keyCollectionReminderFixture([{ id: "timeline-project-one" }, { id: "timeline-project-two", hours: 72 }]);
    for (const project of seed.projects) {
      const { id, ...fields } = project;
      await ProjectModel.create({ _id: id, ...fields, clientMobile: "9000000000", clientAddress: "Synthetic address" });
      const estimate = seed.estimateSummaries!.find(row => row.projectId === id)!;
      await EstimateModel.create({ _id: estimate.id, leadId: estimate.leadId, projectId: id, ownerId: actor.id,
        version: estimate.version, status: "client_approved", propertyType: "residential", rooms: [], scopes: [], lineItems: [],
        subtotal: estimate.subtotal, gst: estimate.gst, total: estimate.total, clientDecisionAt: estimate.clientDecisionAt,
        estimation: estimate.estimation });
      const state = seed.designWorkflowStates!.find(row => row.projectId === id)!;
      await DesignWorkflowStateModel.create({ _id: `state-${id}`, ...state });
    }
    const read = () => Promise.all([
      ProjectModel.find().sort({ _id: 1 }).lean(), EstimateModel.find().sort({ _id: 1 }).lean(),
      DesignWorkflowStateModel.find().select("+history").sort({ _id: 1 }).lean()
    ]);
    const before = await read();
    await service.update(actor, input());
    expect(await read()).toEqual(before);
  });
});
