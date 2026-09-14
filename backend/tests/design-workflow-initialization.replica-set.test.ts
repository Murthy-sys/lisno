import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { runWithHumanOperation } from "../src/domain/operation-context.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { DesignStageModel } from "../src/models/DesignStage.js";
import { FloorModel } from "../src/models/Floor.js";
import { ProjectModel } from "../src/models/Project.js";
import { TaskModel } from "../src/models/Task.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { AppRepository } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { resolveApprovalProject } from "../src/services/estimate-project-handoff.js";
import { createProjectService } from "../src/services/project.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-09-11T10:00:00.000Z");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("excel-workflow-initialization");
  await Promise.all([ProjectModel.syncIndexes(), FloorModel.syncIndexes(), DesignStageModel.syncIndexes(), TaskModel.syncIndexes(), AuditEventModel.syncIndexes(), UserModel.syncIndexes()]);
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica.stop());

async function projectFixture() {
  const user = demoSeedData.users.find((user) => user.id === "user-designer-ananya")!;
  await UserModel.create({ ...user, _id: user.id, id: undefined });
  const actor: PublicUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  const repository = createMongoRepository();
  const project = await repository.createProject({ ...demoSeedData.projects[0]!, id: "excel-mongo-project", clientMobile: "9000000000", clientAddress: "Pune", assignedDesignerIds: [actor.id], designWorkflowStages: createProjectDesignWorkflow("excel-mongo-project") });
  return { actor, repository, project };
}
const floorInput = { name: "Ground floor", number: "0", order: 0, plannedStartAt: NOW.toISOString(), plannedEndAt: "2026-10-11T10:00:00.000Z" };

describe("Mongo Excel workflow persistence", () => {
  it("round-trips snapshots and mappings without adding defaults to legacy projects", async () => {
    const { repository, project, actor } = await projectFixture();
    expect((await repository.findProjectById(project.id))!.designWorkflowStages).toEqual(project.designWorkflowStages);
    const service = createProjectService(repository, createAuditService(repository), () => NOW);
    await runWithHumanOperation("POST /projects/:projectId/floors", () => service.createFloor(actor, project.id, floorInput));
    const hierarchy = (await repository.getProjectHierarchy(project.id))!;
    expect(hierarchy.floors[0]!.stages.map((stage) => stage.workflowStageId)).toEqual(project.designWorkflowStages!.map((stage) => stage.id));
    expect(await TaskModel.countDocuments({ projectId: project.id })).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "stage_created" })).toBe(6);
    const legacy = { ...demoSeedData.projects[0]!, id: "legacy-mongo-project", clientMobile: "9000000000", clientAddress: "Pune" };
    delete legacy.designWorkflowStages;
    await repository.createProject(legacy);
    expect(await repository.findProjectById(legacy.id)).not.toHaveProperty("designWorkflowStages");
    const legacyDocument = await ProjectModel.findById(legacy.id).lean();
    expect(legacyDocument).not.toHaveProperty("designWorkflowStages");
  });

  it("rolls back the floor, earlier stage inserts and audits when any stage insert fails", async () => {
    const { repository: base, project, actor } = await projectFixture();
    let inserts = 0;
    const repository = new Proxy(base, {
      get(target, key, receiver) {
        if (key !== "runInTransaction") return Reflect.get(target, key, receiver);
        return <T>(operation: (transaction: AppRepository) => Promise<T>) => target.runInTransaction((transaction) => operation(new Proxy(transaction, {
          get(tx, property, txReceiver) {
            if (property !== "createDesignStage") return Reflect.get(tx, property, txReceiver);
            return async (input: Parameters<AppRepository["createDesignStage"]>[0]) => {
              inserts += 1;
              if (inserts === 3) throw new Error("Stage insert failed");
              return tx.createDesignStage(input);
            };
          }
        })));
      }
    });
    const service = createProjectService(repository, createAuditService(repository), () => NOW);
    await expect(runWithHumanOperation("POST /projects/:projectId/floors", () => service.createFloor(actor, project.id, floorInput))).rejects.toThrow("Stage insert failed");
    expect(inserts).toBe(3);
    expect(await FloorModel.countDocuments({ projectId: project.id })).toBe(0);
    expect(await DesignStageModel.countDocuments({ projectId: project.id })).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect((await base.findProjectById(project.id))!.designWorkflowStages).toEqual(project.designWorkflowStages);
  });

  it("creates an approval-handoff snapshot atomically and preserves its identity on linked retries", async () => {
    const session = await mongoose.startSession();
    const lead = { projectId: null, ownerId: "sales-handoff", projectName: "Handoff home", clientName: "Client", clientEmail: "handoff@example.test", clientMobile: "9000000000", location: "Pune" };
    let projectId = "";
    try {
      await session.withTransaction(async () => {
        projectId = await resolveApprovalProject({ estimate: { projectId: null, ownerId: lead.ownerId }, lead, clientId: null, occurredAt: NOW, session });
      });
      const first = await ProjectModel.findById(projectId).lean();
      expect(first!.designWorkflowStages).toEqual(createProjectDesignWorkflow(projectId));
      await session.withTransaction(async () => {
        expect(await resolveApprovalProject({ estimate: { projectId, ownerId: lead.ownerId }, lead: { ...lead, projectId }, clientId: null, occurredAt: NOW, session })).toBe(projectId);
      });
      expect((await ProjectModel.findById(projectId).lean())!.designWorkflowStages).toEqual(first!.designWorkflowStages);
      expect(await ProjectModel.countDocuments()).toBe(1);
      await expect(session.withTransaction(async () => {
        await resolveApprovalProject({ estimate: { projectId: null, ownerId: lead.ownerId }, lead, clientId: null, occurredAt: NOW, session });
        throw new Error("Approval aborted");
      })).rejects.toThrow("Approval aborted");
      expect(await ProjectModel.countDocuments()).toBe(1);
    } finally {
      await session.endSession();
    }
  });
});
