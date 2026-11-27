import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { emptyDesignWorkflowState } from "../src/domain/design-workflow-state.js";
import { projectExecutionChoice } from "../src/domain/project-execution-choice.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { RepositoryConflictError } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createDesignWorkflowStateService, type WorkflowActionInput } from "../src/services/design-workflow-state.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { CHOICE_NOW, KEYS_AT } from "./fixtures/execution-choice.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("project-execution-choice");
  await Promise.all([UserModel.syncIndexes(), ProjectModel.syncIndexes(), DesignWorkflowStateModel.syncIndexes(),
    AuthorizationCoordinationModel.syncIndexes(), AuditEventModel.syncIndexes(), ProjectWorkflowTaskModel.syncIndexes(), EstimateModel.syncIndexes()]);
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

async function setup(version3 = false) {
  const user = demoSeedData.users.find(row => row.role === "client")!;
  await UserModel.create({ ...user, _id: user.id });
  const actor: PublicUser = { id: user.id, role: "client", name: user.name, email: user.email };
  const projectId = "execution-choice-project", stages = createProjectDesignWorkflow(projectId);
  const projectRow = { ...demoSeedData.projects[0]!, _id: projectId, clientId: user.id, clientMobile: "9000000000", clientAddress: "Synthetic address", designWorkflowStages: stages };
  delete projectRow.estimationWorkflowVersion;
  await ProjectModel.create({ ...projectRow, ...(version3 ? { estimationWorkflowVersion: 3 } : {}) });
  const state = { ...emptyDesignWorkflowState(projectId), version: 3, initialPaymentAt: KEYS_AT,
    stages: { internal_kickoff: { completedAt: KEYS_AT }, client_kickoff: { completedAt: KEYS_AT },
      key_collection: { handedOverAt: KEYS_AT, receivedAt: KEYS_AT, completedAt: KEYS_AT },
      site_measurement: { completedAt: KEYS_AT }, existing_furniture_dimensions: { acceptedAt: KEYS_AT, rooms: [], noExistingFurniture: true } } };
  await DesignWorkflowStateModel.create({ _id: projectId, ...state, ...(version3 ? { estimationWorkflowVersion: 3 } : {}) });
  const repository = createMongoRepository(), audit = createAuditService(repository);
  const command: WorkflowActionInput = { action: "execution_path_select", expectedVersion: 3, stageId: `${projectId}:design-stage:key_collection`, idempotencyKey: "mongo-execution-choice-first", note: "",
    data: { optionId: "option_1", definitionVersion: 1, acknowledgedIrreversible: true } };
  return { repository, audit, actor, projectId, command, service: createDesignWorkflowStateService(repository, audit, () => CHOICE_NOW), state: () => repository.findDesignWorkflowState(projectId) };
}

describe("Mongo execution-choice immutability and transactions", () => {
  it("commits exactly one conflicting choice and audit, then re-reads and replays the winner", async () => {
    const f = await setup();
    const second = { ...f.command, idempotencyKey: "mongo-execution-choice-second", data: { ...f.command.data, optionId: "option_2" } };
    const results = await Promise.allSettled([f.service.act(f.actor, f.projectId, f.command, null), f.service.act(f.actor, f.projectId, second, null)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "WORKFLOW_VERSION_CONFLICT" } });
    const saved = (await f.state())!;
    expect(saved.version).toBe(4); expect(saved.history).toHaveLength(1);
    expect(await AuditEventModel.countDocuments({ entityId: f.projectId })).toBe(1);
    const freshRepository = createMongoRepository(), freshState = (await freshRepository.findDesignWorkflowState(f.projectId))!;
    expect(freshState).toEqual(saved);
    const project = (await freshRepository.findProjectById(f.projectId))!;
    expect(projectExecutionChoice(project, freshState, f.actor, CHOICE_NOW)).toMatchObject({ status: "locked", canSelect: false, selection: { optionId: saved.executionChoice!.optionId } });
    const winner = saved.history[0]!.idempotencyKey === f.command.idempotencyKey ? f.command : second;
    await expect(f.service.act(f.actor, f.projectId, winner, null)).resolves.toEqual({ version: 4, replayed: true });
    expect(await AuditEventModel.countDocuments({ entityId: f.projectId })).toBe(1);
  });

  it("deduplicates simultaneous identical commands", async () => {
    const f = await setup();
    const results = await Promise.all([f.service.act(f.actor, f.projectId, f.command, null), f.service.act(f.actor, f.projectId, f.command, null)]);
    expect(results.filter(result => result.replayed)).toHaveLength(1);
    expect((await f.state())!.history).toHaveLength(1); expect((await f.state())!.version).toBe(4);
    expect(await AuditEventModel.countDocuments({ entityId: f.projectId })).toBe(1);
  });

  it("rolls back the decision, history and authorization coordination when audit fails", async () => {
    const f = await setup(), before = await f.state();
    vi.spyOn(f.audit, "append").mockRejectedValue(new Error("synthetic choice audit failure"));
    await expect(f.service.act(f.actor, f.projectId, f.command, null)).rejects.toThrow("synthetic choice audit failure");
    expect(await f.state()).toEqual(before);
    expect(await AuditEventModel.countDocuments({ entityId: f.projectId })).toBe(0);
    expect(await AuthorizationCoordinationModel.countDocuments({})).toBe(0);
  });

  it("protects record and full event from all repository callers while retaining unrelated changes", async () => {
    const f = await setup(); await f.service.act(f.actor, f.projectId, f.command, null);
    const original = (await f.state())!;
    for (const kind of ["delete", "null", "replace", "history", "event", "duplicate"] as const) {
      const next = structuredClone(original);
      if (kind === "delete") delete next.executionChoice;
      if (kind === "null") (next as unknown as Record<string, unknown>).executionChoice = null;
      if (kind === "replace") next.executionChoice = { ...next.executionChoice!, optionId: "option_2" };
      if (kind === "history") next.history = [];
      if (kind === "event") next.history[0]!.note = "Changed history";
      if (kind === "duplicate") next.history.push(structuredClone(next.history[0]!));
      await expect(f.repository.saveDesignWorkflowState(f.projectId, original.version, next)).rejects.toBeInstanceOf(RepositoryConflictError);
      expect(await f.state()).toEqual(original);
    }
    await f.repository.runInTransaction(tx => tx.saveDesignWorkflowState(f.projectId, original.version, { ...original, pauses: [{ startedAt: CHOICE_NOW.toISOString(), endedAt: null }] }));
    const later = (await f.state())!;
    expect(later.version).toBe(5); expect(later.executionChoice).toEqual(original.executionChoice); expect(later.history).toEqual(original.history);
    await expect(f.service.act(f.actor, f.projectId, f.command, null)).resolves.toEqual({ version: 5, replayed: true });
  });

  it("does not touch stage completion, design tasks, quotation data, or project fences on a version-3 choice", async () => {
    const f = await setup(true), before = (await f.state())!, project = await ProjectModel.findById(f.projectId).lean();
    await f.service.act(f.actor, f.projectId, f.command, null);
    const saved = (await f.state())!;
    expect(saved.stages).toEqual(before.stages); expect(saved.initialPaymentAt).toBe(before.initialPaymentAt);
    expect(await ProjectModel.findById(f.projectId).lean()).toEqual(project);
    expect(await ProjectWorkflowTaskModel.countDocuments({})).toBe(0); expect(await EstimateModel.countDocuments({})).toBe(0);
    expect(projectExecutionChoice((await f.repository.findProjectById(f.projectId))!, saved, f.actor, CHOICE_NOW).status).toBe("locked");
  });
});
